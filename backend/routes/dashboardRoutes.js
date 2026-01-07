import express from "express";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import Debt from "../models/Debt.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Business from "../models/Business.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { getQuote } from "../services/quoteService.js";
import { getLatestDailyVariation } from "../services/dailyVariationService.js";
import {
  getPortfolioDailyReturn,
  getPortfolioPeriodReturn,
  getPortfolioAccumulatedReturn,
  getCapitalFlowsForPeriod,
} from "../services/portfolioReturnService.js";
import PeriodVariation from "../models/PeriodVariation.js";
import YahooFinance from "yahoo-finance2";

const router = express.Router();

// Para capital aportado: importe por operación. En "add", quantity es total acumulado (no delta) → solo usar operationAmount.
function getOperationAmountForStats(entry) {
  const op = entry?.operation;
  if (op === "add") {
    return entry?.operationAmount ?? 0;
  }
  if (op === "creation") {
    return (
      entry?.operationAmount ??
      (entry?.operationPrice != null && entry?.quantity != null
        ? entry.operationPrice * entry.quantity
        : (entry?.totalValue ?? 0))
    );
  }
  if (op === "sell" || op === "withdraw") {
    const amount =
      entry?.operationAmount ??
      (entry?.operationPrice != null && entry?.quantity != null
        ? entry.operationPrice * entry.quantity
        : 0);
    return amount || 0;
  }
  return 0;
}
function getSignedOperationAmountForStats(entry) {
  if (!["creation", "add", "withdraw", "sell"].includes(entry?.operation))
    return 0;
  const amount = getOperationAmountForStats(entry);
  if (entry.operation === "withdraw" || entry.operation === "sell") {
    return -Math.abs(amount);
  }
  return amount;
}

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET estadísticas del dashboard
router.get("/stats", async (req, res) => {
  try {
    // Total de cuentas del usuario
    const totalAccounts = await Account.countDocuments({ user: req.userId });

    // Balance total de todas las subcuentas (efectivo + ahorro) del usuario
    const cashSavingsSubAccounts = await SubAccount.find({
      user: req.userId,
      type: { $in: ["cash", "savings"] },
    });
    const investmentSubAccounts = await SubAccount.find({
      user: req.userId,
      type: "investment",
    });
    const totalCashSavings =
      cashSavingsSubAccounts.reduce((sum, subAcc) => sum + subAcc.balance, 0) +
      investmentSubAccounts.reduce((sum, subAcc) => sum + subAcc.balance, 0);

    // Total de inversiones del usuario (valor actual de las inversiones)
    // Solo obtener inversiones que tienen account (requerido)
    const investments = await Investment.find({
      user: req.userId,
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: { path: "account", match: { user: req.userId } },
      })
      .populate({
        path: "account",
        match: { user: req.userId },
      });
    const activeInvestments = investments.filter(
      (inv) => inv.status !== "closed",
    );
    const totalInvestments = activeInvestments.reduce((sum, inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;
      return sum + value;
    }, 0);

    // Balance total = Cash + Savings + Valor de inversiones
    const totalBalance = totalCashSavings + totalInvestments;

    // Ganancias/pérdidas totales de inversiones
    const totalProfitLoss = activeInvestments.reduce((sum, inv) => {
      if (inv.isAutomatedPortfolio) {
        return sum + (inv.currentPrice - inv.quantity);
      } else {
        const avgPrice = inv.averagePurchasePrice || inv.purchasePrice;
        return sum + (inv.currentPrice - avgPrice) * inv.quantity;
      }
    }, 0);

    // Calcular rentabilidad de inversiones en el mes en curso
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Obtener el valor de las inversiones al inicio del mes
    const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
      .default;
    const startOfMonthDate = new Date(startOfMonth);
    startOfMonthDate.setHours(0, 0, 0, 0);

    // Considerar todas las inversiones (activas y cerradas) para el rendimiento del mes
    const investmentIdsForReturns = investments.map((inv) => inv._id);

    // Obtener el historial más reciente antes o al inicio del mes (solo de inversiones activas)
    const historyAtMonthStart = await InvestmentHistory.find({
      user: req.userId,
      investment: { $in: investmentIdsForReturns },
      date: { $lte: startOfMonthDate },
    })
      .populate({
        path: "investment",
        select: "_id",
        match: { user: req.userId },
      })
      .sort({ date: -1 });

    // Agrupar por inversión y tomar el valor más reciente de cada una al inicio del mes
    const investmentsValueAtMonthStart = {};
    historyAtMonthStart.forEach((entry) => {
      if (entry.investment && entry.investment._id) {
        const invId = entry.investment._id.toString();
        if (
          !investmentsValueAtMonthStart[invId] ||
          new Date(entry.date) >
            new Date(investmentsValueAtMonthStart[invId].date)
        ) {
          investmentsValueAtMonthStart[invId] = entry;
        }
      }
    });

    // Calcular valor total de inversiones al inicio del mes
    let totalInvestmentsAtMonthStart = 0;
    if (Object.keys(investmentsValueAtMonthStart).length > 0) {
      totalInvestmentsAtMonthStart = Object.values(
        investmentsValueAtMonthStart,
      ).reduce((sum, entry) => sum + (entry.totalValue || 0), 0);
    } else {
      // Si no hay historial, usar el valor actual (aproximación)
      totalInvestmentsAtMonthStart = totalInvestments;
    }

    // Obtener operaciones de capital del mes actual (aportaciones y retiros)
    const endOfMonthDate = new Date(endOfMonth);
    endOfMonthDate.setHours(23, 59, 59, 999);

    const monthCapitalOperations = await InvestmentHistory.find({
      user: req.userId,
      investment: { $in: investmentIdsForReturns },
      date: { $gte: startOfMonthDate, $lte: endOfMonthDate },
      operation: { $in: ["creation", "add", "sell", "withdraw"] },
    });

    // Calcular capital añadido/retirado este mes
    // IMPORTANTE: Solo restar capital añadido a inversiones EXISTENTES (operaciones "add")
    // NO restar capital de inversiones nuevas (operaciones "creation") porque queremos incluir su rendimiento
    let capitalAddedToExistingThisMonth = 0;
    let capitalWithdrawnThisMonth = 0;

    monthCapitalOperations.forEach((op) => {
      if (op.operation === "add") {
        // Solo contar aportaciones a inversiones existentes
        // Usar operationAmount o calcular desde quantity * operationPrice
        const amount =
          op.operationAmount || op.quantity * (op.operationPrice || 0);
        capitalAddedToExistingThisMonth += amount;
      } else if (op.operation === "sell" || op.operation === "withdraw") {
        // Usar operationAmount o calcular desde quantity * operationPrice
        const amount = Math.abs(
          op.operationAmount || op.quantity * (op.operationPrice || 0),
        );
        capitalWithdrawnThisMonth += amount;
      }
      // Las operaciones "creation" no se restan porque queremos incluir el rendimiento de las nuevas inversiones
    });

    // Calcular rentabilidad del mes:
    // - Incluir el rendimiento de TODAS las inversiones (existentes + nuevas)
    // - Restar solo el capital añadido a inversiones EXISTENTES (operaciones "add")
    // - NO restar el capital de inversiones nuevas (queremos incluir su rendimiento)
    // - Sumar capital retirado
    const monthlyInvestmentReturn =
      totalInvestments -
      totalInvestmentsAtMonthStart -
      capitalAddedToExistingThisMonth +
      capitalWithdrawnThisMonth;

    // Total de deudas activas del usuario
    const activeDebts = await Debt.find({ user: req.userId, status: "active" });
    const totalDebts = activeDebts.reduce(
      (sum, debt) => sum + debt.remainingAmount,
      0,
    );
    const totalMonthlyDebtPayments = activeDebts.reduce(
      (sum, debt) => sum + debt.monthlyPayment,
      0,
    );

    // Patrimonio neto = Balance total - Deudas
    const netWorth = totalBalance - totalDebts;

    // Balance mensual = Rentabilidad de inversiones del mes (sin incluir ingresos/gastos de finanzas)
    const monthlyBalance = monthlyInvestmentReturn;

    // Capital aportado real: TODAS las operaciones del usuario (no solo inversiones activas)
    const allHistoryForStats = await InvestmentHistory.find({
      user: req.userId,
      operation: { $in: ["creation", "add", "sell", "withdraw"] },
    });
    const contributedByInvId = new Map();
    allHistoryForStats.forEach((entry) => {
      const invId = entry.investment?.toString();
      if (!invId) return;
      const signed = getSignedOperationAmountForStats(entry);
      if (signed >= 0)
        contributedByInvId.set(
          invId,
          (contributedByInvId.get(invId) || 0) + signed,
        );
    });
    let statsTotalContributed = Array.from(contributedByInvId.values()).reduce(
      (s, v) => s + v,
      0,
    );
    let statsTotalWithdrawn = 0;
    allHistoryForStats.forEach((entry) => {
      const signed = getSignedOperationAmountForStats(entry);
      if (signed < 0) statsTotalWithdrawn += Math.abs(signed);
    });
    // Inversiones sin historial de aportes: sumar coste (quantity*avgPrice) para no “perder” capital
    for (const inv of investments) {
      const invId = inv._id.toString();
      if ((contributedByInvId.get(invId) || 0) > 0) continue;
      const implied = inv.isAutomatedPortfolio
        ? inv.quantity || 0
        : (inv.quantity || 0) *
          (inv.averagePurchasePrice || inv.purchasePrice || 0);
      if (implied > 0) {
        statsTotalContributed += implied;
        contributedByInvId.set(invId, implied);
      }
    }
    const statsNetInvestedCapital = Math.max(
      0,
      statsTotalContributed - statsTotalWithdrawn,
    );
    const statsAccumulatedReturn = totalInvestments - statsNetInvestedCapital;
    const statsAccumulatedReturnPercent =
      statsNetInvestedCapital > 0
        ? (statsAccumulatedReturn / statsNetInvestedCapital) * 100
        : 0;

    // Capital aportado CON EFECTIVO = neto invertido (historial) + efectivo actual (subcuentas)
    const capitalAportadoIncluyeEfectivo =
      statsNetInvestedCapital + totalCashSavings;

    res.json({
      totalAccounts,
      totalBalance: netWorth, // Mostrar patrimonio neto como balance total
      totalInvestments,
      totalProfitLoss,
      totalDebts,
      totalMonthlyDebtPayments,
      monthlyInvestmentReturn: parseFloat(monthlyInvestmentReturn.toFixed(2)),
      monthlyBalance: parseFloat(monthlyBalance.toFixed(2)),
      totalCashSavings: parseFloat(totalCashSavings.toFixed(2)),
      totalContributedCapital: parseFloat(statsTotalContributed.toFixed(2)),
      totalWithdrawnCapital: parseFloat(statsTotalWithdrawn.toFixed(2)),
      netInvestedCapital: parseFloat(statsNetInvestedCapital.toFixed(2)),
      capitalAportadoIncluyeEfectivo: parseFloat(
        capitalAportadoIncluyeEfectivo.toFixed(2),
      ),
      accumulatedReturn: parseFloat(statsAccumulatedReturn.toFixed(2)),
      accumulatedReturnPercent: parseFloat(
        statsAccumulatedReturnPercent.toFixed(2),
      ),
    });
  } catch (error) {
    console.error("[dashboard/stats] Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET gráfica de balance total por mes
router.get("/balance-chart", async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const data = [];
    const now = new Date();

    const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
      .default;
    const DailyVariation = (await import("../models/DailyVariation.js"))
      .default;
    const Investment = (await import("../models/Investment.js")).default;
    const SubAccount = (await import("../models/SubAccount.js")).default;
    const Debt = (await import("../models/Debt.js")).default;

    // Obtener todas las inversiones ACTIVAS del usuario (solo las que existen actualmente)
    const perfInvestments = await Investment.find({
      user: req.userId,
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    });

    if (perfInvestments.length === 0) {
      return res.json([]);
    }

    // IMPORTANTE: Solo considerar operaciones de inversiones ACTIVAS
    const activeInvestmentIds = perfInvestments.map((inv) => inv._id);

    // Obtener operaciones de capital SOLO de inversiones activas (solo las que tienen operationAmount)
    const allCapitalOperations = await InvestmentHistory.find({
      user: req.userId,
      investment: { $in: activeInvestmentIds }, // Solo inversiones activas
      operation: { $in: ["creation", "add", "withdraw"] },
      operationAmount: { $exists: true, $ne: null },
    }).sort({ date: 1 });

    if (allCapitalOperations.length === 0) {
      return res.json([]);
    }

    // Encontrar la fecha de la primera operación con operationAmount (esta es la primera aportación real)
    const firstOperation = allCapitalOperations[0];
    const firstOperationDate = new Date(firstOperation.date);
    const startMonth = new Date(
      firstOperationDate.getFullYear(),
      firstOperationDate.getMonth(),
      1,
    );

    // Calcular el número de meses desde la primera inversión hasta ahora
    const monthsSinceStart =
      (now.getFullYear() - startMonth.getFullYear()) * 12 +
      (now.getMonth() - startMonth.getMonth()) +
      1;
    const monthsToShow = Math.min(parseInt(months), monthsSinceStart);

    // Obtener balance actual de cash y subcuentas
    const cashSubAccounts = await SubAccount.find({
      user: req.userId,
      type: { $in: ["cash", "savings"] },
    });
    const investmentSubAccounts = await SubAccount.find({
      user: req.userId,
      type: "investment",
    });
    const currentCashBalance = cashSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    const currentInvestmentSubAccountBalance = investmentSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    // Obtener deudas actuales
    const activeDebts = await Debt.find({ user: req.userId, status: "active" });
    const currentTotalDebts = activeDebts.reduce(
      (sum, debt) => sum + debt.remainingAmount,
      0,
    );

    // allCapitalOperations ya está definido arriba

    // Calcular cash inicial (al inicio del primer mes, ANTES de cualquier operación)
    // El cash inicial es el cash actual menos todas las retiradas y más todas las aportaciones desde el startMonth
    // IMPORTANTE: Las aportaciones (creation/add) reducen el cash porque el dinero sale de las cuentas
    // Las retiradas (withdraw) aumentan el cash porque el dinero vuelve a las cuentas
    // Para obtener el cash inicial, hacemos el proceso inverso: partimos del cash actual y "deshacemos" las operaciones
    let initialCash = currentCashBalance;
    let totalContributions = 0;
    let totalWithdrawals = 0;

    // Solo considerar operaciones desde el startMonth en adelante para calcular el cash inicial
    const operationsFromStart = allCapitalOperations.filter((op) => {
      const opDate = new Date(op.date);
      return opDate >= startMonth;
    });

    operationsFromStart.forEach((op) => {
      if (op.operation === "creation" || op.operation === "add") {
        // Usar operationAmount o calcular desde quantity * operationPrice
        const amount =
          op.operationAmount || op.quantity * (op.operationPrice || 0);
        // Para obtener el cash inicial, sumamos las aportaciones (proceso inverso)
        initialCash += amount;
        totalContributions += amount;
      } else if (op.operation === "withdraw") {
        // Usar operationAmount o calcular desde quantity * operationPrice
        const amount = Math.abs(
          op.operationAmount || op.quantity * (op.operationPrice || 0),
        );
        // Para obtener el cash inicial, restamos las retiradas (proceso inverso)
        initialCash -= amount;
        totalWithdrawals += amount;
      }
    });
    initialCash = Math.max(0, initialCash);

    // Calcular patrimonio mes a mes
    // IMPORTANTE: Inicializar accumulatedCash con el cash inicial (antes de cualquier operación)
    let accumulatedCash = initialCash;

    for (let i = 0; i < monthsToShow; i++) {
      const monthDate = new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + i,
        1,
      );
      const monthEndDate = new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + i + 1,
        0,
      );
      monthEndDate.setHours(23, 59, 59, 999);

      // Si es el mes actual, usar valores actuales directamente
      const isCurrentMonth =
        monthDate.getFullYear() === now.getFullYear() &&
        monthDate.getMonth() === now.getMonth();

      let investmentsValue = 0;
      let cashAtMonthEnd = 0;

      if (isCurrentMonth) {
        // Para el mes actual, usar valores actuales
        investmentsValue = investments.reduce((sum, inv) => {
          const value = inv.isAutomatedPortfolio
            ? inv.currentPrice
            : inv.quantity * inv.currentPrice;
          return sum + value;
        }, 0);
        cashAtMonthEnd = currentCashBalance;
      } else {
        // Para meses pasados, calcular valores históricos
        // Obtener el valor de las inversiones al final del mes usando DailyVariation
        const lastDayOfMonth = new Date(monthEndDate);
        lastDayOfMonth.setHours(0, 0, 0, 0);
        const lastDayEnd = new Date(lastDayOfMonth);
        lastDayEnd.setDate(lastDayEnd.getDate() + 1);

        // Buscar para cada inversión individualmente la variación más reciente antes del fin del mes
        // Esto asegura que encontremos el valor de TODAS las inversiones que existían en ese mes
        investmentsValue = 0;
        let foundVariations = 0;
        let foundHistories = 0;
        let foundCapital = 0;

        const investmentDetails = [];
        let skippedInvestments = 0;
        let processedInvestments = 0;
        for (const inv of investments) {
          // Verificar si esta inversión existía en ese mes (fecha de compra antes del fin del mes)
          const purchaseDate = new Date(inv.purchaseDate);
          if (purchaseDate > monthEndDate) {
            // Esta inversión no existía aún en este mes, saltarla
            skippedInvestments++;
            continue;
          }
          processedInvestments++;

          let invValue = 0;
          let source = "none";

          // Buscar el valor más reciente de esta inversión antes del fin del mes
          // PRIORIDAD 1: InvestmentHistory (datos más actualizados, reflejan correcciones manuales)
          const lastHistoryForInv = await InvestmentHistory.findOne({
            user: req.userId,
            investment: inv._id,
            date: { $lte: monthEndDate },
            totalValue: { $exists: true, $ne: null, $gt: 0 },
          })
            .sort({ date: -1 })
            .limit(1);

          if (lastHistoryForInv && lastHistoryForInv.totalValue) {
            invValue = lastHistoryForInv.totalValue;
            source = "history";
            investmentsValue += invValue;
            foundHistories++;
          } else {
            // PRIORIDAD 2: DailyVariation (solo como fallback si no hay InvestmentHistory)
            const lastVariationForInv = await DailyVariation.findOne({
              user: req.userId,
              investment: inv._id,
              date: { $lte: monthEndDate },
            })
              .sort({ date: -1 })
              .limit(1);

            if (lastVariationForInv && lastVariationForInv.totalValue) {
              invValue = lastVariationForInv.totalValue;
              source = "variation";
              investmentsValue += invValue;
              foundVariations++;
            } else {
              // PRIORIDAD 3: Calcular el capital invertido hasta ese momento
              const invHistoryBeforeMonth = allCapitalOperations.filter(
                (op) => {
                  const opInvId =
                    op.investment?.toString() ||
                    (typeof op.investment === "object"
                      ? op.investment._id?.toString()
                      : null);
                  const opDate = new Date(op.date);
                  return (
                    opInvId === inv._id.toString() && opDate <= monthEndDate
                  );
                },
              );

              let invCapitalBeforeMonth = 0;
              invHistoryBeforeMonth.forEach((op) => {
                if (op.operation === "creation" || op.operation === "add") {
                  // Usar operationAmount o calcular desde quantity * operationPrice
                  invCapitalBeforeMonth +=
                    op.operationAmount ||
                    op.quantity * (op.operationPrice || 0);
                } else if (op.operation === "withdraw") {
                  // Usar operationAmount o calcular desde quantity * operationPrice
                  invCapitalBeforeMonth -= Math.abs(
                    op.operationAmount ||
                      op.quantity * (op.operationPrice || 0),
                  );
                }
              });

              if (invCapitalBeforeMonth > 0) {
                invValue = invCapitalBeforeMonth;
                source = "capital";
                investmentsValue += invValue;
                foundCapital++;
              }
            }
          }

          if (invValue > 0) {
            investmentDetails.push({
              name: inv.name,
              value: invValue.toFixed(2),
              source,
            });
          }
        }

        // Calcular cash al final del mes acumulando operaciones desde el inicio del primer mes
        // IMPORTANTE: El cash se reduce cuando hay aportaciones (creation/add) y aumenta con retiros (withdraw)
        // Solo considerar operaciones desde el startMonth en adelante
        const operationsInMonth = allCapitalOperations.filter((op) => {
          const opDate = new Date(op.date);
          return (
            opDate >= monthDate &&
            opDate <= monthEndDate &&
            opDate >= startMonth
          );
        });

        // Calcular el cambio de cash durante este mes
        let cashChangeThisMonth = 0;
        let contributionsThisMonth = 0;
        let withdrawalsThisMonth = 0;
        operationsInMonth.forEach((op) => {
          if (op.operation === "creation" || op.operation === "add") {
            // Las aportaciones reducen el cash
            // Usar operationAmount o calcular desde quantity * operationPrice
            const amount =
              op.operationAmount || op.quantity * (op.operationPrice || 0);
            cashChangeThisMonth -= amount;
            contributionsThisMonth += amount;
          } else if (op.operation === "withdraw") {
            // Los retiros aumentan el cash
            // Usar operationAmount o calcular desde quantity * operationPrice
            const amount = Math.abs(
              op.operationAmount || op.quantity * (op.operationPrice || 0),
            );
            cashChangeThisMonth += amount;
            withdrawalsThisMonth += amount;
          }
        });

        // Actualizar el cash acumulado
        accumulatedCash += cashChangeThisMonth;
        cashAtMonthEnd = Math.max(0, accumulatedCash);
      }

      // Calcular patrimonio total al final del mes
      // Patrimonio = Cash + Valor de inversiones - Deudas
      // IMPORTANTE: Para meses pasados, NO usamos currentInvestmentSubAccountBalance ni currentTotalDebts
      // porque son valores actuales y no reflejan la evolución histórica
      // El patrimonio total debe reflejar solo cash + inversiones para meses pasados
      // Para el mes actual, sí incluimos todos los valores actuales
      let netWorth;
      if (isCurrentMonth) {
        // Mes actual: usar todos los valores actuales
        netWorth =
          cashAtMonthEnd +
          currentInvestmentSubAccountBalance +
          investmentsValue -
          currentTotalDebts;
      } else {
        // Meses pasados: solo cash + inversiones (no tenemos histórico de subcuentas ni deudas)
        // Las deudas y balances de subcuentas se aproximan a 0 para meses pasados
        netWorth = cashAtMonthEnd + investmentsValue;
      }

      data.push({
        month: monthDate.toLocaleString("es-ES", {
          month: "short",
          year: "numeric",
        }),
        balance: netWorth,
      });
    }

    res.json(data);
  } catch (error) {
    // Devolver array vacío en caso de error para que el dashboard no se rompa
    res.json([]);
  }
});

// Clave de fecha en hora local (YYYY-MM-DD) para comparar días sin errores de timezone
function getLocalDateKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// GET balance total día a día
// Enfoque acumulativo: calcula el balance histórico aplicando todas las operaciones en orden cronológico
router.get("/balance-daily", async (req, res) => {
  try {
    const DailyVariation = (await import("../models/DailyVariation.js"))
      .default;
    const SubAccount = (await import("../models/SubAccount.js")).default;
    const Debt = (await import("../models/Debt.js")).default;

    // Obtener todas las inversiones ACTIVAS del usuario (solo las que existen actualmente)
    const perfInvestments = await Investment.find({
      user: req.userId,
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    });

    if (perfInvestments.length === 0) {
      return res.json([]);
    }

    // IMPORTANTE: Solo considerar operaciones de inversiones ACTIVAS (que aún existen)
    const activeInvestmentIds = perfInvestments.map((inv) => inv._id);

    // Obtener operaciones de capital SOLO de inversiones activas
    const [allCapitalOperations, allTransactions] = await Promise.all([
      InvestmentHistory.find({
        user: req.userId,
        investment: { $in: activeInvestmentIds }, // Solo inversiones activas
        operation: { $in: ["creation", "add", "withdraw", "sell"] },
      }).sort({ date: 1 }),
      Transaction.find({
        user: req.userId,
      }).sort({ date: 1 }),
    ]);

    // Encontrar la fecha más antigua de cualquier operación
    const allDates = [
      ...allCapitalOperations.map((op) => new Date(op.date)),
      ...allTransactions.map((t) => new Date(t.date)),
    ];

    if (allDates.length === 0) {
      return res.json([]);
    }

    const startDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Obtener balance actual de cash
    const cashSubAccounts = await SubAccount.find({
      user: req.userId,
      type: { $in: ["cash", "savings"] },
    });
    const investmentSubAccounts = await SubAccount.find({
      user: req.userId,
      type: "investment",
    });
    const currentCashBalance = cashSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );
    const currentInvestmentSubAccountBalance = investmentSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    // Log detallado de transacciones para debug
    const incomeTransactions = allTransactions.filter(
      (t) => t.type === "income",
    );
    const expenseTransactions = allTransactions.filter(
      (t) => t.type === "expense",
    );

    // Calcular cash inicial: partir del cash actual y "deshacer" operaciones desde startDate
    // Esto nos da el cash que había al inicio de startDate.
    // Si no hay transacciones, usamos las operaciones de inversión como mejor aproximación.
    let initialCash = 0;
    const hasTransactions = allTransactions.length > 0;
    const hasCashSubAccounts = cashSubAccounts.length > 0;
    let useCashCalculation = hasCashSubAccounts || hasTransactions;

    // Separar subcuentas: las que tienen initialDate y las que no
    const cashSubAccountsWithDate = cashSubAccounts.filter(
      (subAcc) =>
        subAcc.initialDate &&
        (subAcc.type === "cash" || subAcc.type === "savings"),
    );
    const cashSubAccountsWithoutDate = cashSubAccounts.filter(
      (subAcc) =>
        !subAcc.initialDate &&
        (subAcc.type === "cash" || subAcc.type === "savings"),
    );

    // Variable para almacenar subcuentas que se crearon después de startDate (para aplicar en el loop)
    let subAccountsAfterStart = [];
    const getOpAmount = (op) => Math.abs(getOperationAmountForStats(op) || 0);

    if (useCashCalculation) {
      const startDateNormalized = new Date(startDate);
      startDateNormalized.setHours(0, 0, 0, 0);

      if (cashSubAccountsWithDate.length > 0) {
        initialCash = currentCashBalance;

        // Separar subcuentas por fecha: las que tienen initialDate antes/igual a startDate y las que tienen después
        // Usar clave local (YYYY-MM-DD) para evitar que timezone haga que una subcuenta no se aplique ningún día
        const startDateKey = getLocalDateKey(startDateNormalized);
        const subAccountsBeforeStart = [];
        cashSubAccountsWithDate.forEach((subAcc) => {
          const subAccInitialDate = new Date(subAcc.initialDate);
          const subAccDateKey = getLocalDateKey(subAccInitialDate);

          if (subAccDateKey <= startDateKey) {
            // Esta subcuenta ya existía al inicio, su balance está incluido en initialCash
            subAccountsBeforeStart.push(subAcc);
          } else {
            // Esta subcuenta se creó después de startDate, su balance NO debe estar en initialCash
            subAccountsAfterStart.push(subAcc);
            initialCash -= subAcc.balance;
          }
        });

        const hasCashAtStart =
          subAccountsBeforeStart.length > 0 ||
          cashSubAccountsWithoutDate.length > 0;

        if (hasCashAtStart) {
          // Deshacer todas las operaciones de capital desde startDate
          allCapitalOperations.forEach((op) => {
            const opDate = new Date(op.date);
            opDate.setHours(0, 0, 0, 0);

            if (opDate >= startDateNormalized) {
              const amount = getOpAmount(op);
              if (op.operation === "creation" || op.operation === "add") {
                initialCash += amount;
              } else if (
                op.operation === "withdraw" ||
                op.operation === "sell"
              ) {
                initialCash -= amount;
              }
            }
          });

          // Deshacer todas las transacciones desde startDate
          allTransactions.forEach((transaction) => {
            const transDate = new Date(transaction.date);
            transDate.setHours(0, 0, 0, 0);

            if (transDate >= startDateNormalized) {
              if (transaction.type === "income") {
                initialCash -= transaction.amount;
              } else if (transaction.type === "expense") {
                initialCash += transaction.amount;
              }
            }
          });
        } else {
          // Todas las subcuentas tienen initialDate después de startDate, el cash inicial es 0
          initialCash = 0;
        }
      } else {
        // No hay fechas iniciales: asumimos que el cash actual existe desde startDate
        initialCash = currentCashBalance;

        // Deshacer todas las operaciones de capital desde startDate
        allCapitalOperations.forEach((op) => {
          const opDate = new Date(op.date);
          opDate.setHours(0, 0, 0, 0);

          if (opDate >= startDateNormalized) {
            const amount = getOpAmount(op);
            if (op.operation === "creation" || op.operation === "add") {
              initialCash += amount;
            } else if (op.operation === "withdraw" || op.operation === "sell") {
              initialCash -= amount;
            }
          }
        });

        // Deshacer todas las transacciones desde startDate
        allTransactions.forEach((transaction) => {
          const transDate = new Date(transaction.date);
          transDate.setHours(0, 0, 0, 0);

          if (transDate >= startDateNormalized) {
            if (transaction.type === "income") {
              initialCash -= transaction.amount;
            } else if (transaction.type === "expense") {
              initialCash += transaction.amount;
            }
          }
        });
      }

      initialCash = Math.max(0, initialCash);
    }

    // Obtener deudas actuales (no tenemos histórico de deudas)
    const activeDebts = await Debt.find({ user: req.userId, status: "active" });
    const currentTotalDebts = activeDebts.reduce(
      (sum, debt) => sum + debt.remainingAmount,
      0,
    );

    // Obtener todas las variaciones diarias y entradas de historial SOLO de inversiones activas
    const [allDailyVariations, allHistoryEntries] = await Promise.all([
      DailyVariation.find({
        user: req.userId,
        investment: { $in: activeInvestmentIds }, // Solo inversiones activas
        date: { $gte: startDate, $lte: endDate },
      }).sort({ date: 1, investment: 1 }),
      InvestmentHistory.find({
        user: req.userId,
        investment: { $in: activeInvestmentIds }, // Solo inversiones activas
        date: { $gte: startDate, $lte: endDate },
        $or: [
          { totalValue: { $exists: true, $ne: null, $gt: 0 } },
          {
            operation: { $in: ["creation", "add", "withdraw", "sell"] },
          },
        ],
      }).sort({ date: 1, investment: 1 }),
    ]);

    // Generar todas las fechas desde startDate hasta hoy
    const dates = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calcular balance total día a día de forma acumulativa
    const result = [];
    let cash = initialCash; // Empezamos con el cash inicial calculado

    // Crear mapas por fecha en hora local (YYYY-MM-DD) para que operaciones/transacciones caigan en el día correcto
    const operationsByDate = new Map();
    allCapitalOperations.forEach((op) => {
      const dateKey = getLocalDateKey(op.date);
      if (!operationsByDate.has(dateKey)) {
        operationsByDate.set(dateKey, []);
      }
      operationsByDate.get(dateKey).push(op);
    });

    const transactionsByDate = new Map();
    allTransactions.forEach((t) => {
      const dateKey = getLocalDateKey(t.date);
      if (!transactionsByDate.has(dateKey)) {
        transactionsByDate.set(dateKey, []);
      }
      transactionsByDate.get(dateKey).push(t);
    });

    // Mapa para almacenar el valor de cada inversión por fecha
    const investmentValuesByDate = new Map();

    for (const date of dates) {
      const dateKey = getLocalDateKey(date);
      const dateEndNormalized = new Date(date);
      dateEndNormalized.setHours(23, 59, 59, 999);

      const cashBeforeDay = cash;

      // Aplicar efectivo inicial de subcuentas si su initialDate es este día
      // (solo para subcuentas que se crearon después de startDate)
      // Comparar por clave local (YYYY-MM-DD) para que el efectivo aparezca el día correcto y no se pierda por timezone
      if (useCashCalculation && subAccountsAfterStart.length > 0) {
        const dateKeyLocal = getLocalDateKey(date);
        subAccountsAfterStart.forEach((subAcc) => {
          const subAccInitialDate = new Date(subAcc.initialDate);
          const subAccDateKey = getLocalDateKey(subAccInitialDate);
          if (subAccDateKey === dateKeyLocal) {
            cash += subAcc.balance;
          }
        });
      }

      // Solo aplicar transacciones y operaciones de capital si estamos calculando el cash
      if (useCashCalculation) {
        // Aplicar transacciones de este día
        const transactionsToday = transactionsByDate.get(dateKey) || [];
        let incomeToday = 0;
        let expenseToday = 0;
        transactionsToday.forEach((transaction) => {
          if (transaction.type === "income") {
            cash += transaction.amount;
            incomeToday += transaction.amount;
          } else if (transaction.type === "expense") {
            cash -= transaction.amount;
            expenseToday += transaction.amount;
          }
        });

        // Aplicar operaciones de capital de este día
        const operationsToday = operationsByDate.get(dateKey) || [];
        let contributionsToday = 0;
        let withdrawalsToday = 0;
        operationsToday.forEach((op) => {
          const amount = getOpAmount(op);
          if (op.operation === "creation" || op.operation === "add") {
            cash -= amount;
            contributionsToday += amount;
          } else if (op.operation === "withdraw" || op.operation === "sell") {
            cash += amount;
            withdrawalsToday += amount;
          }
        });

        cash = Math.max(0, cash);

        // Log detallado para días con operaciones importantes
        if (transactionsToday.length > 0 || operationsToday.length > 0) {
        }
      }

      // Verificar si es el día de hoy (último día), usando clave local
      const isToday = dateKey === getLocalDateKey(new Date());

      // Calcular valor de inversiones hasta esta fecha
      let investmentsValue = 0;

      for (const inv of perfInvestments) {
        // Buscar la fecha de creación de esta inversión
        const creationOp = allHistoryEntries.find(
          (h) =>
            h.investment &&
            h.investment.toString() === inv._id.toString() &&
            h.operation === "creation",
        );
        const creationDateValue =
          creationOp?.date || inv.purchaseDate || inv.createdAt;
        if (!creationDateValue) {
          continue;
        }

        const creationDate = new Date(creationDateValue);
        creationDate.setHours(0, 0, 0, 0);
        const creationDateEnd = new Date(creationDate);
        creationDateEnd.setHours(23, 59, 59, 999);

        // Solo incluir inversiones que existían hasta esta fecha
        if (creationDateEnd > dateEndNormalized) {
          continue;
        }

        // Buscar valor de esta inversión en esta fecha
        const cacheKey = `${inv._id.toString()}_${dateKey}`;

        if (investmentValuesByDate.has(cacheKey)) {
          investmentsValue += investmentValuesByDate.get(cacheKey);
        } else {
          let invValue = 0;

          // Si es el día de hoy, usar el valor actual del modelo Investment (igual que /stats)
          if (isToday) {
            invValue = inv.isAutomatedPortfolio
              ? inv.currentPrice || 0
              : (inv.quantity || 0) * (inv.currentPrice || 0);
          } else {
            // Para días pasados, buscar en InvestmentHistory o DailyVariation
            // PRIORIDAD 1: InvestmentHistory (datos más actualizados, reflejan correcciones manuales)
            const historyForThisInv = allHistoryEntries.filter(
              (h) =>
                h.investment && h.investment.toString() === inv._id.toString(),
            );

            const lastHistory = historyForThisInv
              .filter((h) => {
                const hDate = new Date(h.date);
                hDate.setHours(0, 0, 0, 0);
                const hDateEnd = new Date(hDate);
                hDateEnd.setHours(23, 59, 59, 999);
                return (
                  hDateEnd <= dateEndNormalized &&
                  h.totalValue &&
                  h.totalValue > 0
                );
              })
              .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (lastHistory && lastHistory.totalValue) {
              invValue = lastHistory.totalValue;
            } else {
              // PRIORIDAD 2: DailyVariation (solo como fallback si no hay InvestmentHistory)
              const variationsForThisInv = allDailyVariations.filter(
                (v) =>
                  v.investment &&
                  v.investment.toString() === inv._id.toString(),
              );

              const lastVariation = variationsForThisInv
                .filter((v) => {
                  const vDate = new Date(v.date);
                  vDate.setHours(0, 0, 0, 0);
                  const vDateEnd = new Date(vDate);
                  vDateEnd.setHours(23, 59, 59, 999);
                  return vDateEnd <= dateEndNormalized;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

              if (
                lastVariation &&
                lastVariation.totalValue &&
                lastVariation.totalValue > 0
              ) {
                invValue = lastVariation.totalValue;
              } else {
                // PRIORIDAD 3: Calcular capital acumulado
                const capitalOperations = historyForThisInv.filter((h) => {
                  const hDate = new Date(h.date);
                  hDate.setHours(0, 0, 0, 0);
                  const hDateEnd = new Date(hDate);
                  hDateEnd.setHours(23, 59, 59, 999);
                  return (
                    hDateEnd <= dateEndNormalized &&
                    ["creation", "add", "withdraw", "sell"].includes(
                      h.operation,
                    )
                  );
                });

                let capital = 0;
                capitalOperations.forEach((op) => {
                  const amount = getOpAmount(op);
                  if (op.operation === "creation" || op.operation === "add") {
                    capital += amount;
                  } else if (
                    op.operation === "withdraw" ||
                    op.operation === "sell"
                  ) {
                    capital -= amount;
                  }
                });

                invValue = Math.max(0, capital);
              }
            }
          }

          investmentValuesByDate.set(cacheKey, invValue);
          investmentsValue += invValue;
        }
      }

      // Usar siempre el efectivo acumulado día a día (incl. hoy). No sustituir por currentCashBalance
      // en el último día, para que los ingresos/efectivo añadido aparezcan en la fecha real, no al final.
      const cashForBalance = cash;

      // Balance total = cash + subcuentas de inversión + inversiones - deudas
      // Si no estamos calculando cash (sin datos suficientes), solo reflejamos inversiones - deudas
      // IMPORTANTE: Las subcuentas de inversión se incluyen siempre (son dinero disponible para invertir)
      // NOTA: Este cálculo debe coincidir con /stats que devuelve netWorth = totalBalance - totalDebts
      const balanceTotal =
        (useCashCalculation ? cashForBalance : 0) +
        currentInvestmentSubAccountBalance +
        investmentsValue -
        currentTotalDebts;

      result.push({
        date: dateKey,
        balance: parseFloat(balanceTotal.toFixed(2)),
      });
    }

    if (result.length > 0) {
      const lastBalance = result[result.length - 1];

      // Calcular valores del último día para comparar con /stats
      const lastDateKey = lastBalance.date;
      const lastDateNormalized = new Date(lastDateKey);
      lastDateNormalized.setHours(0, 0, 0, 0);

      // Calcular cash del último día
      // Para el último día (hoy), usar el cash actual directamente (igual que /stats)
      const isLastDayToday = lastDateKey === getLocalDateKey(new Date());

      let lastDayCash = 0;
      if (useCashCalculation) {
        if (isLastDayToday) {
          // Para hoy, usar el cash actual directamente
          lastDayCash = currentCashBalance;
        } else {
          // Para días pasados, calcular desde initialCash
          lastDayCash = initialCash;

          // Aplicar todas las operaciones hasta el último día
          allCapitalOperations.forEach((op) => {
            const opDate = new Date(op.date);
            opDate.setHours(0, 0, 0, 0);
            if (opDate <= lastDateNormalized) {
              const amount = getOpAmount(op);
              if (op.operation === "creation" || op.operation === "add") {
                lastDayCash -= amount;
              } else if (
                op.operation === "withdraw" ||
                op.operation === "sell"
              ) {
                lastDayCash += amount;
              }
            }
          });

          allTransactions.forEach((t) => {
            const tDate = new Date(t.date);
            tDate.setHours(0, 0, 0, 0);
            if (tDate <= lastDateNormalized) {
              if (t.type === "income") lastDayCash += t.amount;
              else if (t.type === "expense") lastDayCash -= t.amount;
            }
          });

          // Aplicar subcuentas con initialDate (comparar por clave local)
          if (subAccountsAfterStart.length > 0) {
            subAccountsAfterStart.forEach((subAcc) => {
              const subAccDateKey = getLocalDateKey(subAcc.initialDate);
              if (subAccDateKey <= lastDateKey) {
                lastDayCash += subAcc.balance;
              }
            });
          }

          lastDayCash = Math.max(0, lastDayCash);
        }
      }

      // Calcular inversiones del último día (usar modelo Investment directamente para hoy)
      const isTodayForInvestments = lastDateKey === getLocalDateKey(new Date());

      let lastDayInvestments = 0;
      if (isTodayForInvestments) {
        // Para hoy, usar el modelo Investment directamente (igual que /stats)
        lastDayInvestments = perfInvestments.reduce((sum, inv) => {
          const value = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
          return sum + value;
        }, 0);
      } else {
        // Para días pasados, usar el valor calculado
        const lastDateEnd = new Date(lastDateKey);
        lastDateEnd.setHours(23, 59, 59, 999);

        for (const inv of perfInvestments) {
          const creationOp = allHistoryEntries.find(
            (h) =>
              h.investment &&
              h.investment.toString() === inv._id.toString() &&
              h.operation === "creation",
          );
          const creationDateValue =
            creationOp?.date || inv.purchaseDate || inv.createdAt;
          if (!creationDateValue) continue;

          const creationDate = new Date(creationDateValue);
          creationDate.setHours(0, 0, 0, 0);
          const creationDateEnd = new Date(creationDate);
          creationDateEnd.setHours(23, 59, 59, 999);
          if (creationDateEnd > lastDateEnd) continue;

          const cacheKey = `${inv._id.toString()}_${lastDateKey}`;
          if (investmentValuesByDate.has(cacheKey)) {
            lastDayInvestments += investmentValuesByDate.get(cacheKey);
          }
        }
      }

      // Comparar con /stats
      const totalCashSavings = cashSubAccounts.reduce(
        (sum, sa) => sum + sa.balance,
        0,
      );
      const totalInvestmentsStats = perfInvestments.reduce((sum, inv) => {
        const value = inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0);
        return sum + value;
      }, 0);
      const totalBalanceStats = totalCashSavings + totalInvestmentsStats;
      const netWorthStats = totalBalanceStats - currentTotalDebts;

      // Verificar valores únicos
      const uniqueBalances = [
        ...new Set(result.map((r) => r.balance.toFixed(2))),
      ];
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución de inversiones por tipo
router.get("/investments-by-type", async (req, res) => {
  try {
    const investments = await Investment.find({
      user: req.userId,
      status: { $ne: "closed" },
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    }).populate({
      path: "subAccount",
      match: { user: req.userId },
      populate: { path: "account", match: { user: req.userId } },
    });
    const byType = {};

    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;
      if (!byType[inv.type]) {
        byType[inv.type] = 0;
      }
      byType[inv.type] += value;
    });

    const data = Object.entries(byType).map(([type, value]) => ({
      type,
      value,
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución por clase de activo (Renta Fija, Renta Variable, Cash)
router.get("/distribution-by-asset-class", async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario
    const investments = await Investment.find({
      user: req.userId,
      status: { $ne: "closed" },
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: { path: "account", match: { user: req.userId } },
      })
      .populate({
        path: "account",
        match: { user: req.userId },
      });

    let totalFixedIncome = 0;
    let totalVariableIncome = 0;

    investments.forEach((inv) => {
      const totalValue = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;

      if (inv.assetClass === "fixed_income") {
        totalFixedIncome += totalValue;
      } else if (inv.assetClass === "variable_income") {
        totalVariableIncome += totalValue;
      } else if (inv.assetClass === "mixed") {
        // Para inversiones mixtas, distribuir según los porcentajes
        const fixedPercent = inv.fixedIncomePercentage || 0;
        const variablePercent = inv.variableIncomePercentage || 0;
        totalFixedIncome += (totalValue * fixedPercent) / 100;
        totalVariableIncome += (totalValue * variablePercent) / 100;
      }
    });

    // Obtener total de cash (efectivo + ahorro) del usuario
    const cashSubAccounts = await SubAccount.find({
      user: req.userId,
      type: { $in: ["cash", "savings"] },
    });
    const totalCash = cashSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    const data = [
      { name: "Renta Fija", value: totalFixedIncome },
      { name: "Renta Variable", value: totalVariableIncome },
      { name: "Efectivo", value: totalCash },
    ].filter((item) => item.value > 0); // Solo incluir categorías con valor > 0

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución por tipo de renta: renta fija corto, renta fija medio, renta variable, alternativa
router.get("/distribution-by-asset-type", async (req, res) => {
  try {
    const investments = await Investment.find({
      user: req.userId,
      status: { $ne: "closed" },
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    });

    let rentaFijaCorto = 0;
    let rentaFijaMedio = 0;
    let rentaVariable = 0;
    let alternativa = 0;

    investments.forEach((inv) => {
      const totalValue = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;

      if (inv.isAlternative) {
        alternativa += totalValue;
        return;
      }

      if (inv.assetClass === "fixed_income") {
        if (inv.fixedIncomeSubtype === "short") {
          rentaFijaCorto += totalValue;
        } else {
          rentaFijaMedio += totalValue; // medium o sin subtype
        }
      } else if (inv.assetClass === "variable_income") {
        rentaVariable += totalValue;
      } else if (inv.assetClass === "mixed") {
        const fixedPct = inv.fixedIncomePercentage || 0;
        const varPct = inv.variableIncomePercentage || 0;
        rentaFijaMedio += (totalValue * fixedPct) / 100;
        rentaVariable += (totalValue * varPct) / 100;
      }
    });

    const data = [
      { id: "fixed_short", name: "Renta fija corto", value: rentaFijaCorto },
      { id: "fixed_medium", name: "Renta fija medio", value: rentaFijaMedio },
      { id: "variable", name: "Renta variable", value: rentaVariable },
      { id: "alternative", name: "Alternativa", value: alternativa },
    ].filter((item) => item.value > 0);

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución detallada por inversión individual
router.get("/investments-detailed", async (req, res) => {
  try {
    const investments = await Investment.find({
      user: req.userId,
      status: { $ne: "closed" },
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    })
      .populate({
        path: "subAccount",
        select: "name type balance currency",
        match: { user: req.userId },
        populate: {
          path: "account",
          select: "name bankName",
          match: { user: req.userId },
        },
      })
      .sort({ createdAt: -1 });

    const data = await Promise.all(
      investments.map(async (inv) => {
        const totalValue = inv.isAutomatedPortfolio
          ? inv.currentPrice
          : inv.quantity * inv.currentPrice;

        // Calcular el capital invertido total
        let investedCapital = 0;
        const historyEntries = await InvestmentHistory.find({
          user: req.userId,
          investment: inv._id,
          operation: { $in: ["creation", "add", "withdraw"] },
        }).sort({ date: 1 });

        historyEntries.forEach((entry) => {
          if (entry.operation === "creation" || entry.operation === "add") {
            let amount = entry.operationAmount;
            if (!amount || amount === 0) {
              if (entry.operationPrice && entry.quantity) {
                amount = entry.operationPrice * entry.quantity;
              } else if (entry.operation === "creation" && entry.totalValue) {
                amount = entry.totalValue;
              }
            }
            investedCapital += amount || 0;
          } else if (entry.operation === "withdraw") {
            let amount = entry.operationAmount;
            if (!amount || amount === 0) {
              if (entry.operationPrice && entry.quantity) {
                amount = entry.operationPrice * entry.quantity;
              }
            }
            investedCapital -= Math.abs(amount || 0);
          }
        });

        // Si no hay historial, calcular desde los datos de la inversión
        if (investedCapital === 0) {
          if (inv.isAutomatedPortfolio) {
            investedCapital = inv.quantity || 0;
          } else {
            const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
            investedCapital = (inv.quantity || 0) * avgPrice;
          }
        }

        // Calcular rentabilidad total
        const totalReturn = totalValue - investedCapital;
        const totalReturnPercent =
          investedCapital > 0 ? (totalReturn / investedCapital) * 100 : 0;

        // Obtener la variación diaria más reciente
        const latestVariation = await getLatestDailyVariation(
          inv._id,
          req.userId,
        );

        return {
          _id: inv._id,
          name: inv.name,
          value: totalValue,
          currency: inv.currency,
          investedCapital: investedCapital,
          totalReturn: totalReturn,
          totalReturnPercent: totalReturnPercent,
          dailyChangePercent: latestVariation?.changePercent || null,
          dailyChangeAmount: latestVariation?.changeAmount || null,
          symbol: inv.symbol,
          isin: inv.isin,
          type: inv.type,
          isAutomatedPortfolio: inv.isAutomatedPortfolio,
        };
      }),
    );

    // Solo incluir inversiones con valor > 0
    const filteredData = data.filter((item) => item.value > 0);

    res.json(filteredData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución por banco y subcuentas
router.get("/distribution-by-bank", async (req, res) => {
  try {
    // Obtener todas las cuentas del usuario con sus subcuentas
    const accounts = await Account.find({ user: req.userId })
      .populate({
        path: "subAccounts",
        select: "name type balance currency",
        match: { user: req.userId },
      })
      .sort({ bankName: 1 });

    // Obtener todas las inversiones del usuario para calcular valores de subcuentas de inversión
    const investments = await Investment.find({
      user: req.userId,
      status: { $ne: "closed" },
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    })
      .populate({
        path: "subAccount",
        select: "_id",
        match: { user: req.userId },
      })
      .populate({
        path: "account",
        select: "_id name bankName",
        match: { user: req.userId },
      })
      .populate({
        path: "allocations.account",
        select: "_id",
        match: { user: req.userId },
      })
      .populate({
        path: "allocations.subAccount",
        select: "_id",
        match: { user: req.userId },
      });

    // Crear un mapa de inversiones por subcuenta
    const investmentsBySubAccount = {};
    // Crear un mapa de inversiones directas por cuenta
    const investmentsByAccount = {};

    const getInvestmentTotalValue = (inv) =>
      inv.isAutomatedPortfolio
        ? Number(inv.currentPrice) || 0
        : (Number(inv.quantity) || 0) * (Number(inv.currentPrice) || 0);

    const addToMap = (map, key, value) => {
      if (!key || !Number.isFinite(value)) return;
      if (!map[key]) {
        map[key] = 0;
      }
      map[key] += value;
    };

    const getAllocationCurrentValue = (
      inv,
      allocation,
      totalAmount,
      totalValue,
    ) => {
      const amount = Number(allocation.amount) || 0;
      if (inv.isAutomatedPortfolio) {
        const share = totalAmount > 0 ? amount / totalAmount : 0;
        return totalValue * share;
      }
      const allocationQty = Number(allocation.quantity) || 0;
      if (allocationQty > 0) {
        return allocationQty * (Number(inv.currentPrice) || 0);
      }
      const share = totalAmount > 0 ? amount / totalAmount : 0;
      return totalValue * share;
    };

    investments.forEach((inv) => {
      const totalValue = getInvestmentTotalValue(inv);

      if (Array.isArray(inv.allocations) && inv.allocations.length > 0) {
        const totalAmount = inv.allocations.reduce(
          (sum, allocation) => sum + (Number(allocation.amount) || 0),
          0,
        );

        inv.allocations.forEach((allocation) => {
          const subAccountId =
            allocation.subAccount?._id?.toString() ||
            allocation.subAccount?.toString();
          const accountId =
            allocation.account?._id?.toString() ||
            allocation.account?.toString();
          const allocationValue = getAllocationCurrentValue(
            inv,
            allocation,
            totalAmount,
            totalValue,
          );

          if (subAccountId) {
            addToMap(investmentsBySubAccount, subAccountId, allocationValue);
            return;
          }
          if (accountId) {
            addToMap(investmentsByAccount, accountId, allocationValue);
          }
        });
        return;
      }

      if (inv.subAccount && inv.subAccount._id) {
        // Inversión asociada a subcuenta
        const subAccountId = inv.subAccount._id.toString();
        addToMap(investmentsBySubAccount, subAccountId, totalValue);
        return;
      }
      if (inv.account && inv.account._id) {
        // Inversión directa asociada a cuenta
        const accountId = inv.account._id.toString();
        addToMap(investmentsByAccount, accountId, totalValue);
      }
    });

    // Agrupar por banco
    const banksData = {};

    accounts.forEach((account) => {
      const bankName = account.bankName || account.name;

      if (!banksData[bankName]) {
        banksData[bankName] = {
          bankName,
          color: account.color || null,
          total: 0,
          subAccounts: [],
        };
      } else {
        // Si ya existe el banco pero no tiene color, usar el color de esta cuenta si existe
        if (!banksData[bankName].color && account.color) {
          banksData[bankName].color = account.color;
        }
      }

      // Procesar cada subcuenta
      account.subAccounts.forEach((subAccount) => {
        let subAccountValue = subAccount.balance;

        // Si es subcuenta de inversión, usar el valor de las inversiones
        if (subAccount.type === "investment") {
          const subAccountId = subAccount._id.toString();
          subAccountValue = investmentsBySubAccount[subAccountId] || 0;
        }

        banksData[bankName].subAccounts.push({
          name: subAccount.name,
          type: subAccount.type,
          value: subAccountValue,
          currency: subAccount.currency,
        });

        banksData[bankName].total += subAccountValue;
      });

      // Agregar inversiones directas de la cuenta (sin subcuenta)
      const accountId = account._id.toString();
      const directInvestmentsValue = investmentsByAccount[accountId] || 0;
      if (directInvestmentsValue > 0) {
        banksData[bankName].subAccounts.push({
          name: "Inversiones Directas",
          value: directInvestmentsValue,
          type: "direct_investment",
          currency: account.currency || "EUR",
        });
        banksData[bankName].total += directInvestmentsValue;
      }
    });

    // Convertir a array y ordenar por total descendente
    const data = Object.values(banksData)
      .filter((bank) => bank.total > 0)
      .sort((a, b) => b.total - a.total);

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET resumen por cuentas/subcuentas: capital invertido (según allocations) y valor actual
// ?byPrimaryAccount=1 atribuye cada inversión 100% a su cuenta principal (inv.account/subAccount), útil si las allocations están mal
router.get("/accounts-summary", async (req, res) => {
  try {
    const byPrimaryAccount =
      req.query.byPrimaryAccount === "1" ||
      req.query.byPrimaryAccount === "true";
    const accounts = await Account.find({ user: req.userId }).lean();
    const subAccounts = await SubAccount.find({ user: req.userId }).lean();
    const investments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
      status: { $ne: "closed" },
    })
      .populate({ path: "allocations.account", select: "_id" })
      .populate({ path: "allocations.subAccount", select: "_id" })
      .lean();

    const keyFn = (accountId, subAccountId) =>
      `${accountId || ""}-${subAccountId || "none"}`;
    const contributedByKey = new Map();
    const valueByKey = new Map();

    const getInvestmentTotalValue = (inv) =>
      inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);

    const getInvestmentInvestedCapital = (inv) => {
      if (inv.isAutomatedPortfolio) {
        return inv.quantity || 0;
      }
      const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
      return (inv.quantity || 0) * avgPrice;
    };

    const getAllocationMetrics = (inv, allocation, totalAmount, totalValue) => {
      const amount = Number(allocation.amount) || 0;
      if (inv.isAutomatedPortfolio) {
        const share = totalAmount > 0 ? amount / totalAmount : 0;
        return {
          investedCapital: amount,
          currentValue: totalValue * share,
        };
      }
      const allocationQty = Number(allocation.quantity) || 0;
      const allocationAvg = Number(allocation.averagePurchasePrice) || 0;
      if (allocationQty > 0 && allocationAvg > 0) {
        return {
          investedCapital: allocationQty * allocationAvg,
          currentValue: allocationQty * (inv.currentPrice || 0),
        };
      }
      const share = totalAmount > 0 ? amount / totalAmount : 0;
      return {
        investedCapital: amount,
        currentValue: totalValue * share,
      };
    };

    investments.forEach((inv) => {
      const currentValue = getInvestmentTotalValue(inv);
      const investedCapital = getInvestmentInvestedCapital(inv);

      if (byPrimaryAccount) {
        const accId = inv.account ? String(inv.account._id || inv.account) : "";
        const subId = inv.subAccount
          ? String(inv.subAccount._id || inv.subAccount)
          : null;
        const k = keyFn(accId, subId);
        contributedByKey.set(
          k,
          (contributedByKey.get(k) || 0) + investedCapital,
        );
        valueByKey.set(k, (valueByKey.get(k) || 0) + currentValue);
        return;
      }

      const allocations = Array.isArray(inv.allocations) ? inv.allocations : [];
      const totalAmount = allocations.reduce(
        (sum, a) => sum + (Number(a.amount) || 0),
        0,
      );
      const hasAllocationQuantities =
        !inv.isAutomatedPortfolio &&
        allocations.some(
          (allocation) =>
            (Number(allocation.quantity) || 0) > 0 &&
            (Number(allocation.averagePurchasePrice) || 0) > 0,
        );

      if (
        totalAmount === 0 &&
        !hasAllocationQuantities &&
        allocations.length > 0
      ) {
        const first = allocations[0];
        const accId =
          (
            first.account &&
            (first.account._id || first.account)
          )?.toString?.() ||
          first.account?.toString?.() ||
          "";
        const subId = first.subAccount
          ? (first.subAccount._id || first.subAccount)?.toString?.() ||
            first.subAccount?.toString?.() ||
            ""
          : null;
        const k = keyFn(accId, subId);
        contributedByKey.set(
          k,
          (contributedByKey.get(k) || 0) + investedCapital,
        );
        valueByKey.set(k, (valueByKey.get(k) || 0) + currentValue);
        return;
      }

      allocations.forEach((alloc) => {
        const accId =
          (
            alloc.account &&
            (alloc.account._id || alloc.account)
          )?.toString?.() ||
          alloc.account?.toString?.() ||
          "";
        const subId = alloc.subAccount
          ? (alloc.subAccount._id || alloc.subAccount)?.toString?.() ||
            alloc.subAccount?.toString?.() ||
            ""
          : null;
        const k = keyFn(accId, subId);
        const metrics = getAllocationMetrics(
          inv,
          alloc,
          totalAmount,
          currentValue,
        );
        contributedByKey.set(
          k,
          (contributedByKey.get(k) || 0) + metrics.investedCapital,
        );
        valueByKey.set(k, (valueByKey.get(k) || 0) + metrics.currentValue);
      });

      if (allocations.length === 0) {
        const accId =
          (inv.account && (inv.account._id || inv.account))?.toString?.() ||
          inv.account?.toString?.() ||
          "";
        const subId = inv.subAccount
          ? (inv.subAccount._id || inv.subAccount)?.toString?.() ||
            inv.subAccount?.toString?.() ||
            ""
          : null;
        const k = keyFn(accId, subId);
        contributedByKey.set(
          k,
          (contributedByKey.get(k) || 0) + investedCapital,
        );
        valueByKey.set(k, (valueByKey.get(k) || 0) + currentValue);
      }
    });

    const result = accounts.map((account) => {
      const accountId = String(account._id);
      const subs = subAccounts.filter((s) => {
        const sAcc = s.account && (s.account._id || s.account);
        return sAcc && String(sAcc) === accountId;
      });
      const subAccountsList = subs.map((sub) => {
        const subId = sub._id.toString();
        const k = keyFn(accountId, subId);
        const investmentsValue = valueByKey.get(k) || 0;
        const contributedCapital = contributedByKey.get(k) || 0;
        return {
          _id: sub._id,
          name: sub.name,
          type: sub.type,
          balance: sub.balance ?? 0,
          investmentsValue: Number(investmentsValue.toFixed(2)),
          contributedCapital: Number(contributedCapital.toFixed(2)),
        };
      });
      const directKey = keyFn(accountId, null);
      const directInvestmentsValue = valueByKey.get(directKey) || 0;
      const directContributedCapital = contributedByKey.get(directKey) || 0;
      return {
        _id: account._id,
        name: account.name,
        bankName: account.bankName,
        color: account.color,
        subAccounts: subAccountsList,
        directInvestmentsValue: Number(directInvestmentsValue.toFixed(2)),
        directContributedCapital: Number(directContributedCapital.toFixed(2)),
      };
    });

    res.json(result);
  } catch (error) {
    console.error("[dashboard/accounts-summary] Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET rendimiento anualizado (CAGR) y comparación con S&P 500
router.get("/performance", async (req, res) => {
  try {
    // Nueva lógica unificada basada en DailyVariation
    const perfInvestments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
    });

    if (perfInvestments.length === 0) {
      return res.json({
        annualizedReturn: null,
        totalReturn: null,
        sp500Comparison: null,
        period: null,
        message: "No hay inversiones para calcular el rendimiento",
      });
    }

    const perfInvestmentIds = perfInvestments.map((inv) => inv._id);
    const perfToday = new Date();
    perfToday.setHours(0, 0, 0, 0);

    let perfCurrentValue = 0;
    let perfInvestedCapital = 0;
    perfInvestments.forEach((inv) => {
      perfCurrentValue += inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      if (inv.isAutomatedPortfolio) {
        perfInvestedCapital += inv.quantity || 0;
      } else {
        const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
        perfInvestedCapital += (inv.quantity || 0) * avgPrice;
      }
    });

    const perfDailyReturnData = await getPortfolioDailyReturn(
      req.userId,
      perfInvestments,
      perfToday,
    );

    const perfMonthStart = new Date(
      perfToday.getFullYear(),
      perfToday.getMonth(),
      1,
    );
    perfMonthStart.setHours(0, 0, 0, 0);
    const perfQuarter = Math.floor(perfToday.getMonth() / 3);
    const perfQuarterStart = new Date(
      perfToday.getFullYear(),
      perfQuarter * 3,
      1,
    );
    perfQuarterStart.setHours(0, 0, 0, 0);
    const perfYearStart = new Date(perfToday.getFullYear(), 0, 1);
    perfYearStart.setHours(0, 0, 0, 0);

    const perfMonthlyData = await getPortfolioPeriodReturn(
      req.userId,
      perfInvestmentIds,
      perfMonthStart,
      perfToday,
      perfInvestments,
    );
    const perfQuarterlyData = await getPortfolioPeriodReturn(
      req.userId,
      perfInvestmentIds,
      perfQuarterStart,
      perfToday,
      perfInvestments,
    );
    const perfAnnualData = await getPortfolioPeriodReturn(
      req.userId,
      perfInvestmentIds,
      perfYearStart,
      perfToday,
      perfInvestments,
    );
    const perfAccumulatedData = await getPortfolioAccumulatedReturn(
      req.userId,
      perfInvestmentIds,
      perfInvestments,
    );

    const perfStartDate = perfAccumulatedData.startDate || perfToday;
    const perfEndDate = perfToday;
    const perfYears =
      (perfEndDate - perfStartDate) / (1000 * 60 * 60 * 24 * 365);

    // Flujos de capital desde el inicio (todas las operaciones), no solo desde primera DailyVariation
    const perfCapitalFlows = await getCapitalFlowsForPeriod(
      req.userId,
      perfInvestmentIds,
      new Date(0),
      perfEndDate,
    );

    const perfTotalContributedCapital = perfCapitalFlows.contributed;
    const perfTotalWithdrawnCapital = perfCapitalFlows.withdrawn;
    const perfNetInvestedCapital = perfCapitalFlows.net;

    // Usar capital neto real (flujos de historial) cuando exista; si no, quantity*precio
    const hasRealCapitalFlows =
      perfTotalContributedCapital > 0 || perfTotalWithdrawnCapital > 0;
    const effectiveInvestedCapital = hasRealCapitalFlows
      ? perfNetInvestedCapital
      : perfInvestedCapital;

    const perfAccumulatedReturn = perfCurrentValue - effectiveInvestedCapital;
    const perfTotalReturn = perfAccumulatedReturn;
    const perfAccumulatedReturnPercent =
      effectiveInvestedCapital > 0
        ? (perfAccumulatedReturn / effectiveInvestedCapital) * 100
        : 0;
    const perfTotalReturnPercent = perfAccumulatedReturnPercent;

    const perfAnnualReturn = perfAnnualData.totalChange;
    const perfAnnualReturnPercent = perfAnnualData.percent;
    const perfQuarterlyReturn = perfQuarterlyData.totalChange;
    const perfQuarterlyReturnPercent = perfQuarterlyData.percent;
    const perfMonthlyReturn = perfMonthlyData.totalChange;
    const perfMonthlyReturnPercent = perfMonthlyData.percent;

    const perfDailyReturn = perfDailyReturnData.totalChange;
    const perfDailyReturnPercent = perfDailyReturnData.percent;

    const perfInitialValue = effectiveInvestedCapital || 0;
    const perfInitialCapital = effectiveInvestedCapital || 0;

    let perfAnnualizedReturn = null;
    if (perfInitialValue > 0 && perfYears > 0) {
      perfAnnualizedReturn =
        (Math.pow(1 + perfAccumulatedReturnPercent / 100, 1 / perfYears) - 1) *
        100;
    }

    const perfSp500HistoricalReturn = 10.5;
    const perfSp500ProjectedReturn =
      perfYears > 0
        ? (Math.pow(1 + perfSp500HistoricalReturn / 100, perfYears) - 1) * 100
        : 0;

    let perfSp500Comparison = {
      historicalAnnualReturn: perfSp500HistoricalReturn,
      projectedReturn: parseFloat(perfSp500ProjectedReturn.toFixed(2)),
      outperformance:
        perfAnnualizedReturn !== null
          ? parseFloat(
              (perfAnnualizedReturn - perfSp500HistoricalReturn).toFixed(2),
            )
          : null,
      outperformancePercent:
        perfAnnualizedReturn !== null && perfSp500HistoricalReturn !== 0
          ? parseFloat(
              (
                (perfAnnualizedReturn / perfSp500HistoricalReturn - 1) *
                100
              ).toFixed(2),
            )
          : null,
    };

    try {
      const yahooFinance = new YahooFinance();
      try {
        const sp500Quote = await yahooFinance.quote("^GSPC");
        if (sp500Quote && sp500Quote.regularMarketPrice) {
          perfSp500Comparison.currentPrice = sp500Quote.regularMarketPrice;
        }
      } catch (gspcError) {
        try {
          const spyQuote = await yahooFinance.quote("SPY");
          if (spyQuote && spyQuote.regularMarketPrice) {
            perfSp500Comparison.currentPrice = spyQuote.regularMarketPrice;
          }
        } catch (spyError) {
          // ignore
        }
      }
    } catch (sp500Error) {
      // ignore
    }

    // Rendimientos anuales históricos (años anteriores al actual)
    const currentYear = perfToday.getFullYear();
    const historicalYearlyReturns = await PeriodVariation.find({
      user: req.userId,
      periodType: "annual",
      periodStart: { $lt: new Date(currentYear, 0, 1) },
    })
      .sort({ periodStart: -1 })
      .lean();

    const historicalReturns = [];
    for (const pv of historicalYearlyReturns) {
      const year = new Date(pv.periodStart).getFullYear();
      // Obtener flujos de capital de ese año
      const yearStart = new Date(year, 0, 1);
      yearStart.setHours(0, 0, 0, 0);
      const yearEnd = new Date(year, 11, 31);
      yearEnd.setHours(23, 59, 59, 999);
      const yearFlows = await getCapitalFlowsForPeriod(
        req.userId,
        perfInvestmentIds,
        yearStart,
        yearEnd,
      );

      const totalChange = pv.totalChangeAmount || 0;
      const sv = pv.startValue || 0;
      const netFlow = (yearFlows.contributed || 0) - (yearFlows.withdrawn || 0);
      // Modified Dietz: % = ganancia / (valor_inicio + 0.5 * flujos_netos)
      const avgCapital = sv + 0.5 * netFlow;
      const correctedPercent =
        avgCapital > 0 ? (totalChange / avgCapital) * 100 : 0;

      historicalReturns.push({
        year,
        totalChange: parseFloat(totalChange.toFixed(2)),
        changePercent: parseFloat(correctedPercent.toFixed(2)),
        startValue: parseFloat(sv.toFixed(2)),
        endValue: parseFloat((pv.endValue || 0).toFixed(2)),
        contributed: parseFloat((yearFlows.contributed || 0).toFixed(2)),
        withdrawn: parseFloat((yearFlows.withdrawn || 0).toFixed(2)),
      });
    }

    return res.json({
      annualizedReturn: perfAnnualizedReturn,
      totalReturn: perfTotalReturn,
      totalReturnPercent: parseFloat(perfTotalReturnPercent.toFixed(2)),
      accumulatedReturn: parseFloat(perfAccumulatedReturn.toFixed(2)),
      accumulatedReturnPercent: parseFloat(
        perfAccumulatedReturnPercent.toFixed(2),
      ),
      accumulatedReturnCapital: parseFloat(perfAccumulatedReturn.toFixed(2)),
      accumulatedReturnCapitalPercent: parseFloat(
        perfAccumulatedReturnPercent.toFixed(2),
      ),
      accumulatedReturnVariations: parseFloat(perfAccumulatedReturn.toFixed(2)),
      accumulatedReturnVariationsPercent: parseFloat(
        perfAccumulatedReturnPercent.toFixed(2),
      ),
      accumulatedReturnSource: "daily",
      accumulatedReturnDiff: 0,
      accumulatedReturnThreshold: 0,
      accumulatedReturnThresholdValue: 0,
      accumulatedReturnThresholdReturn: 0,
      totalContributedCapital: parseFloat(
        perfTotalContributedCapital.toFixed(2),
      ),
      totalWithdrawnCapital: parseFloat(perfTotalWithdrawnCapital.toFixed(2)),
      netInvestedCapital: parseFloat(perfNetInvestedCapital.toFixed(2)),
      actualYearStartValue: parseFloat(perfAnnualData.startValue.toFixed(2)),
      netInvestedBeforeYear: parseFloat(perfNetInvestedCapital.toFixed(2)),
      returnBeforeYear: 0,
      accumulatedReturnCheck: parseFloat(perfAccumulatedReturn.toFixed(2)),
      accumulatedReturnCheckDiff: 0,
      annualReturn: parseFloat(perfAnnualReturn.toFixed(2)),
      annualReturnPercent: parseFloat(perfAnnualReturnPercent.toFixed(2)),
      annualReturnCapital: parseFloat(perfAnnualReturn.toFixed(2)),
      dailyReturn: parseFloat(perfDailyReturn.toFixed(2)),
      dailyReturnPercent: parseFloat(perfDailyReturnPercent.toFixed(2)),
      quarterlyReturn: parseFloat(perfQuarterlyReturn.toFixed(2)),
      quarterlyReturnPercent: parseFloat(perfQuarterlyReturnPercent.toFixed(2)),
      monthlyReturn: parseFloat(perfMonthlyReturn.toFixed(2)),
      monthlyReturnPercent: parseFloat(perfMonthlyReturnPercent.toFixed(2)),
      initialValue: parseFloat(perfInitialValue.toFixed(2)),
      initialCapital: parseFloat(perfInitialCapital.toFixed(2)),
      additionalCapital: parseFloat(perfTotalContributedCapital.toFixed(2)),
      currentValue: parseFloat(perfCurrentValue.toFixed(2)),
      yearStartValue: parseFloat(perfAnnualData.startValue.toFixed(2)),
      startDate: perfStartDate.toISOString(),
      endDate: perfEndDate.toISOString(),
      years: parseFloat(perfYears.toFixed(2)),
      sp500Comparison: perfSp500Comparison,
      historicalReturns,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET estadísticas de transacciones por contexto (personal y negocios)
router.get("/transactions-by-context", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const now = new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate
      ? new Date(endDate)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Obtener todos los negocios del usuario
    const businesses = await Business.find({
      user: req.userId,
      isActive: true,
    });

    // Calcular estadísticas para personal (business = null)
    const personalTransactions = await Transaction.find({
      user: req.userId,
      business: null,
      date: { $gte: start, $lte: end },
    });

    const personalIncome = personalTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const personalExpenses = personalTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const personalBalance = personalIncome - personalExpenses;

    const contexts = [
      {
        id: "personal",
        name: "Personal",
        type: "personal",
        income: personalIncome,
        expenses: personalExpenses,
        balance: personalBalance,
        transactionCount: personalTransactions.length,
      },
    ];

    // Calcular estadísticas para cada negocio
    for (const business of businesses) {
      const businessTransactions = await Transaction.find({
        user: req.userId,
        business: business._id,
        date: { $gte: start, $lte: end },
      });

      const businessIncome = businessTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);
      const businessExpenses = businessTransactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);
      const businessBalance = businessIncome - businessExpenses;

      contexts.push({
        id: business._id.toString(),
        name: business.name,
        type: "business",
        color: business.color,
        income: businessIncome,
        expenses: businessExpenses,
        balance: businessBalance,
        transactionCount: businessTransactions.length,
      });
    }

    // Calcular total general
    const totalIncome = contexts.reduce((sum, ctx) => sum + ctx.income, 0);
    const totalExpenses = contexts.reduce((sum, ctx) => sum + ctx.expenses, 0);
    const totalBalance = totalIncome - totalExpenses;

    res.json({
      contexts,
      totals: {
        income: totalIncome,
        expenses: totalExpenses,
        balance: totalBalance,
      },
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
