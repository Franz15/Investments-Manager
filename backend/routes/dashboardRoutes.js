import express from "express";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import Debt from "../models/Debt.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { getQuote } from "../services/quoteService.js";
import { getLatestDailyVariation } from "../services/dailyVariationService.js";
import YahooFinance from "yahoo-finance2";

const router = express.Router();

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
    const totalCashSavings = cashSavingsSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    // Balance de subcuentas de inversión (dinero disponible para invertir)
    const investmentSubAccounts = await SubAccount.find({
      user: req.userId,
      type: "investment",
    });
    const totalInvestmentSubAccountBalance = investmentSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    // Total de inversiones del usuario (valor actual de las inversiones)
    // Solo obtener inversiones que tienen account (requerido)
    const investments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
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
    const totalInvestments = investments.reduce((sum, inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;
      return sum + value;
    }, 0);

    // Balance total = Cash + Savings + Balance en subcuentas de inversión + Valor de inversiones
    const totalBalance =
      totalCashSavings + totalInvestmentSubAccountBalance + totalInvestments;

    // Ganancias/pérdidas totales de inversiones
    const totalProfitLoss = investments.reduce((sum, inv) => {
      if (inv.isAutomatedPortfolio) {
        return sum + (inv.currentPrice - inv.quantity);
      } else {
        const avgPrice = inv.averagePurchasePrice || inv.purchasePrice;
        return sum + (inv.currentPrice - avgPrice) * inv.quantity;
      }
    }, 0);

    // Transacciones del mes actual del usuario
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthlyTransactions = await Transaction.find({
      user: req.userId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
    });

    const monthlyIncome = monthlyTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyExpenses = monthlyTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    // Calcular rentabilidad de inversiones en el mes en curso
    // Obtener el valor de las inversiones al inicio del mes
    const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
      .default;
    const startOfMonthDate = new Date(startOfMonth);
    startOfMonthDate.setHours(0, 0, 0, 0);

    // IMPORTANTE: Solo considerar inversiones ACTIVAS (que existen actualmente)
    const activeInvestmentIds = investments.map((inv) => inv._id);

    // Obtener el historial más reciente antes o al inicio del mes (solo de inversiones activas)
    const historyAtMonthStart = await InvestmentHistory.find({
      user: req.userId,
      investment: { $in: activeInvestmentIds }, // Solo inversiones activas
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
        // Verificar que la inversión sigue siendo activa
        if (activeInvestmentIds.some((id) => id.toString() === invId)) {
          if (
            !investmentsValueAtMonthStart[invId] ||
            new Date(entry.date) >
              new Date(investmentsValueAtMonthStart[invId].date)
          ) {
            investmentsValueAtMonthStart[invId] = entry;
          }
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
      investment: { $in: activeInvestmentIds },
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

    // Balance mensual = Ingresos - Gastos + Rentabilidad de inversiones del mes
    const monthlyBalance =
      monthlyIncome - monthlyExpenses + monthlyInvestmentReturn;

    res.json({
      totalAccounts,
      totalBalance: netWorth, // Mostrar patrimonio neto como balance total
      totalInvestments,
      totalProfitLoss,
      totalDebts,
      totalMonthlyDebtPayments,
      monthlyIncome,
      monthlyExpenses,
      monthlyInvestmentReturn: parseFloat(monthlyInvestmentReturn.toFixed(2)),
      monthlyBalance: parseFloat(monthlyBalance.toFixed(2)),
      totalCashSavings: parseFloat(totalCashSavings.toFixed(2)),
    });
  } catch (error) {
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
    const investments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      return res.json([]);
    }

    // IMPORTANTE: Solo considerar operaciones de inversiones ACTIVAS
    const activeInvestmentIds = investments.map((inv) => inv._id);

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
    const currentCashBalance = cashSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    const investmentSubAccounts = await SubAccount.find({
      user: req.userId,
      type: "investment",
    });
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

// GET balance total día a día
// Enfoque acumulativo: calcula el balance histórico aplicando todas las operaciones en orden cronológico
router.get("/balance-daily", async (req, res) => {
  try {
    const DailyVariation = (await import("../models/DailyVariation.js"))
      .default;
    const SubAccount = (await import("../models/SubAccount.js")).default;
    const Debt = (await import("../models/Debt.js")).default;

    // Obtener todas las inversiones ACTIVAS del usuario (solo las que existen actualmente)
    const investments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      return res.json([]);
    }

    // IMPORTANTE: Solo considerar operaciones de inversiones ACTIVAS (que aún existen)
    const activeInvestmentIds = investments.map((inv) => inv._id);

    // Obtener operaciones de capital SOLO de inversiones activas
    const [allCapitalOperations, allTransactions] = await Promise.all([
      InvestmentHistory.find({
        user: req.userId,
        investment: { $in: activeInvestmentIds }, // Solo inversiones activas
        operation: { $in: ["creation", "add", "withdraw"] },
        operationAmount: { $exists: true, $ne: null },
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
    const currentCashBalance = cashSubAccounts.reduce(
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

    // Calcular cash inicial: empezar con el cash actual y "deshacer" todas las operaciones desde startDate
    // Esto nos da el cash que había al inicio de startDate
    // IMPORTANTE: Si no hay transacciones registradas, empezamos con cash = 0 y solo reflejamos inversiones - deudas
    // (como funcionaba antes cuando no había efectivo)
    // EXCEPCIÓN: Si hay subcuentas de cash/savings con initialDate, consideramos ese efectivo inicial
    let initialCash = 0;
    let useCashCalculation = allTransactions.length > 0; // Solo calcular cash si hay transacciones

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

    if (cashSubAccountsWithoutDate.length > 0) {
    }

    // Variable para almacenar subcuentas que se crearon después de startDate (para aplicar en el loop)
    let subAccountsAfterStart = [];

    if (cashSubAccountsWithDate.length > 0) {
      // Si hay subcuentas con fecha inicial, usamos el cálculo de cash
      useCashCalculation = true;
      initialCash = currentCashBalance;

      // IMPORTANTE: Restar el balance de subcuentas SIN initialDate (no se incluyen en cash histórico)
      cashSubAccountsWithoutDate.forEach((subAcc) => {
        initialCash -= subAcc.balance;
      });

      // Separar subcuentas por fecha: las que tienen initialDate antes/igual a startDate y las que tienen después
      const subAccountsBeforeStart = [];
      const startDateNormalized = new Date(startDate);
      startDateNormalized.setHours(0, 0, 0, 0);

      cashSubAccountsWithDate.forEach((subAcc) => {
        const subAccInitialDate = new Date(subAcc.initialDate);
        subAccInitialDate.setHours(0, 0, 0, 0);

        if (subAccInitialDate <= startDateNormalized) {
          // Esta subcuenta ya existía al inicio, su balance está incluido en initialCash
          subAccountsBeforeStart.push(subAcc);
        } else {
          // Esta subcuenta se creó después de startDate, su balance NO debe estar en initialCash
          subAccountsAfterStart.push(subAcc);
          // Restar su balance del initialCash porque no existía al inicio
          initialCash -= subAcc.balance;
        }
      });

      if (subAccountsBeforeStart.length > 0) {
      }
      if (subAccountsAfterStart.length > 0) {
      }

      // IMPORTANTE: Solo "deshacer" operaciones si hay subcuentas con initialDate antes de startDate
      // Si todas las subcuentas tienen initialDate después de startDate, el initialCash debería ser 0
      if (subAccountsBeforeStart.length > 0) {
        // Hay subcuentas que existían antes de startDate, deshacer operaciones para calcular el cash inicial real
        // Deshacer todas las operaciones de capital desde startDate
        allCapitalOperations.forEach((op) => {
          const opDate = new Date(op.date);
          opDate.setHours(0, 0, 0, 0);

          if (opDate >= startDateNormalized) {
            if (op.operation === "creation" || op.operation === "add") {
              // Las aportaciones reducen el cash, así que para deshacerlas las sumamos
              initialCash += op.operationAmount;
            } else if (op.operation === "withdraw") {
              // Las retiradas aumentan el cash, así que para deshacerlas las restamos
              initialCash -= Math.abs(op.operationAmount);
            }
          }
        });

        // Deshacer todas las transacciones desde startDate
        allTransactions.forEach((transaction) => {
          const transDate = new Date(transaction.date);
          transDate.setHours(0, 0, 0, 0);

          if (transDate >= startDateNormalized) {
            if (transaction.type === "income") {
              // Los ingresos aumentan el cash, así que para deshacerlos los restamos
              initialCash -= transaction.amount;
            } else if (transaction.type === "expense") {
              // Los gastos reducen el cash, así que para deshacerlos los sumamos
              initialCash += transaction.amount;
            }
          }
        });
      } else {
        // Todas las subcuentas tienen initialDate después de startDate, el cash inicial es 0
        initialCash = 0;
      }

      initialCash = Math.max(0, initialCash);
    } else if (allTransactions.length > 0) {
      // Hay transacciones pero no subcuentas con fecha, calcular cash normalmente
      useCashCalculation = true;
      initialCash = currentCashBalance;

      // Deshacer todas las operaciones de capital desde startDate
      allCapitalOperations.forEach((op) => {
        const opDate = new Date(op.date);
        opDate.setHours(0, 0, 0, 0);
        const startDateNormalized = new Date(startDate);
        startDateNormalized.setHours(0, 0, 0, 0);

        if (opDate >= startDateNormalized) {
          if (op.operation === "creation" || op.operation === "add") {
            initialCash += op.operationAmount;
          } else if (op.operation === "withdraw") {
            initialCash -= Math.abs(op.operationAmount);
          }
        }
      });

      // Deshacer todas las transacciones desde startDate
      allTransactions.forEach((transaction) => {
        const transDate = new Date(transaction.date);
        transDate.setHours(0, 0, 0, 0);
        const startDateNormalized = new Date(startDate);
        startDateNormalized.setHours(0, 0, 0, 0);

        if (transDate >= startDateNormalized) {
          if (transaction.type === "income") {
            initialCash -= transaction.amount;
          } else if (transaction.type === "expense") {
            initialCash += transaction.amount;
          }
        }
      });

      initialCash = Math.max(0, initialCash);
    } else {
    }

    // Obtener subcuentas de inversión (dinero disponible para invertir)
    const investmentSubAccounts = await SubAccount.find({
      user: req.userId,
      type: "investment",
    });
    const currentInvestmentSubAccountBalance = investmentSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

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
            operation: { $in: ["creation", "add", "withdraw"] },
            operationAmount: { $exists: true, $ne: null },
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

    // Crear mapas para acceso rápido a operaciones por fecha
    const operationsByDate = new Map();
    allCapitalOperations.forEach((op) => {
      const opDate = new Date(op.date);
      opDate.setHours(0, 0, 0, 0);
      const dateKey = opDate.toISOString().split("T")[0];
      if (!operationsByDate.has(dateKey)) {
        operationsByDate.set(dateKey, []);
      }
      operationsByDate.get(dateKey).push(op);
    });

    const transactionsByDate = new Map();
    allTransactions.forEach((t) => {
      const tDate = new Date(t.date);
      tDate.setHours(0, 0, 0, 0);
      const dateKey = tDate.toISOString().split("T")[0];
      if (!transactionsByDate.has(dateKey)) {
        transactionsByDate.set(dateKey, []);
      }
      transactionsByDate.get(dateKey).push(t);
    });

    // Mapa para almacenar el valor de cada inversión por fecha
    const investmentValuesByDate = new Map();

    for (const date of dates) {
      const dateKey = date.toISOString().split("T")[0];
      const dateEndNormalized = new Date(date);
      dateEndNormalized.setHours(23, 59, 59, 999);

      const cashBeforeDay = cash;

      // Aplicar efectivo inicial de subcuentas si su initialDate es este día
      // (solo para subcuentas que se crearon después de startDate)
      if (useCashCalculation && subAccountsAfterStart.length > 0) {
        const dateNormalized = new Date(date);
        dateNormalized.setHours(0, 0, 0, 0);

        subAccountsAfterStart.forEach((subAcc) => {
          const subAccInitialDate = new Date(subAcc.initialDate);
          subAccInitialDate.setHours(0, 0, 0, 0);

          // Si la fecha inicial de la subcuenta es este día, aplicar su balance
          if (subAccInitialDate.getTime() === dateNormalized.getTime()) {
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
          if (op.operation === "creation" || op.operation === "add") {
            cash -= op.operationAmount;
            contributionsToday += op.operationAmount;
          } else if (op.operation === "withdraw") {
            cash += Math.abs(op.operationAmount);
            withdrawalsToday += Math.abs(op.operationAmount);
          }
        });

        cash = Math.max(0, cash);

        // Log detallado para días con operaciones importantes
        if (transactionsToday.length > 0 || operationsToday.length > 0) {
        }
      }

      // Verificar si es el día de hoy (último día)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isToday = dateKey === today.toISOString().split("T")[0];

      // Calcular valor de inversiones hasta esta fecha
      let investmentsValue = 0;

      for (const inv of investments) {
        // Buscar la fecha de creación de esta inversión
        const creationOp = allHistoryEntries.find(
          (h) =>
            h.investment.toString() === inv._id.toString() &&
            h.operation === "creation" &&
            h.operationAmount,
        );

        if (!creationOp) {
          continue;
        }

        const creationDate = new Date(creationOp.date);
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
              (h) => h.investment.toString() === inv._id.toString(),
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
                (v) => v.investment.toString() === inv._id.toString(),
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
                    ["creation", "add", "withdraw"].includes(h.operation) &&
                    h.operationAmount
                  );
                });

                let capital = 0;
                capitalOperations.forEach((op) => {
                  if (op.operation === "creation" || op.operation === "add") {
                    // Usar operationAmount o calcular desde quantity * operationPrice
                    capital +=
                      op.operationAmount ||
                      op.quantity * (op.operationPrice || 0);
                  } else if (op.operation === "withdraw") {
                    // Usar operationAmount o calcular desde quantity * operationPrice
                    capital -= Math.abs(
                      op.operationAmount ||
                        op.quantity * (op.operationPrice || 0),
                    );
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

      // Para el último día (hoy), usar el cash actual directamente (igual que /stats)
      // Esto asegura que el balance del último día coincida con /stats
      let cashForBalance = cash;
      if (isToday && useCashCalculation) {
        cashForBalance = currentCashBalance;
      }

      // Balance total = cash + subcuentas de inversión + inversiones - deudas
      // Si no estamos calculando cash (no hay transacciones), solo reflejamos inversiones - deudas
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
      const todayForComparison = new Date();
      todayForComparison.setHours(0, 0, 0, 0);
      const isLastDayToday =
        lastDateKey === todayForComparison.toISOString().split("T")[0];

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
              if (op.operation === "creation" || op.operation === "add") {
                lastDayCash -= op.operationAmount;
              } else if (op.operation === "withdraw") {
                lastDayCash += Math.abs(op.operationAmount);
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

          // Aplicar subcuentas con initialDate
          if (subAccountsAfterStart.length > 0) {
            subAccountsAfterStart.forEach((subAcc) => {
              const subAccInitialDate = new Date(subAcc.initialDate);
              subAccInitialDate.setHours(0, 0, 0, 0);
              if (subAccInitialDate <= lastDateNormalized) {
                lastDayCash += subAcc.balance;
              }
            });
          }

          lastDayCash = Math.max(0, lastDayCash);
        }
      }

      // Calcular inversiones del último día (usar modelo Investment directamente para hoy)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isToday = lastDateKey === today.toISOString().split("T")[0];

      let lastDayInvestments = 0;
      if (isToday) {
        // Para hoy, usar el modelo Investment directamente (igual que /stats)
        lastDayInvestments = investments.reduce((sum, inv) => {
          const value = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
          return sum + value;
        }, 0);
      } else {
        // Para días pasados, usar el valor calculado
        const lastDateEnd = new Date(lastDateKey);
        lastDateEnd.setHours(23, 59, 59, 999);

        for (const inv of investments) {
          const creationOp = allHistoryEntries.find(
            (h) =>
              h.investment.toString() === inv._id.toString() &&
              h.operation === "creation" &&
              h.operationAmount,
          );
          if (!creationOp) continue;

          const creationDate = new Date(creationOp.date);
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
      const totalInvestmentsStats = investments.reduce((sum, inv) => {
        const value = inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0);
        return sum + value;
      }, 0);
      const totalBalanceStats =
        totalCashSavings +
        currentInvestmentSubAccountBalance +
        totalInvestmentsStats;
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
      account: { $exists: true, $ne: null },
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
      account: { $exists: true, $ne: null },
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

// GET distribución detallada por inversión individual
router.get("/investments-detailed", async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.userId })
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
      account: { $exists: true, $ne: null },
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
      });

    // Crear un mapa de inversiones por subcuenta
    const investmentsBySubAccount = {};
    // Crear un mapa de inversiones directas por cuenta
    const investmentsByAccount = {};

    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;

      if (inv.subAccount && inv.subAccount._id) {
        // Inversión asociada a subcuenta
        const subAccountId = inv.subAccount._id.toString();
        if (!investmentsBySubAccount[subAccountId]) {
          investmentsBySubAccount[subAccountId] = 0;
        }
        investmentsBySubAccount[subAccountId] += value;
      } else if (inv.account && inv.account._id) {
        // Inversión directa asociada a cuenta
        const accountId = inv.account._id.toString();
        if (!investmentsByAccount[accountId]) {
          investmentsByAccount[accountId] = 0;
        }
        investmentsByAccount[accountId] += value;
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

// GET rendimiento anualizado (CAGR) y comparación con S&P 500
router.get("/performance", async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario
    const allInvestments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
    });

    if (allInvestments.length === 0) {
      return res.json({
        annualizedReturn: null,
        totalReturn: null,
        sp500Comparison: null,
        period: null,
        message: "No hay inversiones para calcular el rendimiento",
      });
    }

    // Calcular valor inicial: suma de TODOS los aportes de capital (creation + add) menos TODAS las ventas (sell/withdraw)
    // Esto representa el capital total invertido, no solo el inicial
    const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
      .default;
    const investments = allInvestments;
    const validInvestments = [];

    // Obtener TODOS los registros de historial (sin filtrar por fecha)
    // Necesitamos sumar todos los aportes de capital, no solo los iniciales
    const allHistoryEntries = await InvestmentHistory.find({
      user: req.userId,
      investment: { $in: allInvestments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    const getOperationAmount = (entry) => {
      let amount = entry.operationAmount;
      if (!amount || amount === 0) {
        if (entry.operationPrice && entry.quantity) {
          amount = entry.operationPrice * entry.quantity;
        } else if (entry.operation === "creation" && entry.totalValue) {
          amount = entry.totalValue;
        }
      }
      amount = amount || 0;
      return amount;
    };

    const calculateNetCapitalChange = (
      entries,
      periodStart,
      periodEnd,
      investmentsInPeriod = [],
      filterInvestmentIds = null,
    ) => {
      if (!periodStart || !periodEnd) {
        return 0;
      }
      const start = new Date(periodStart);
      const end = new Date(periodEnd);
      let netCapitalChange = 0;
      const filterSet =
        filterInvestmentIds && filterInvestmentIds.size > 0
          ? filterInvestmentIds
          : null;

      entries.forEach((entry) => {
        if (!entry || !entry.date) {
          return;
        }
        const entryDate = new Date(entry.date);
        if (entryDate < start || entryDate > end) {
          return;
        }
        if (filterSet) {
          const entryInvId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          if (!filterSet.has(entryInvId)) {
            return;
          }
        }

        if (entry.operation === "creation" || entry.operation === "add") {
          let amount = getOperationAmount(entry);
          if (amount < 0) {
            amount = 0;
          }
          netCapitalChange += amount;
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          const amount = Math.abs(getOperationAmount(entry));
          netCapitalChange -= amount;
        }
      });

      if (investmentsInPeriod.length > 0) {
        investmentsInPeriod.forEach((inv) => {
          if (!inv?.purchaseDate) {
            return;
          }
          const purchaseDate = new Date(inv.purchaseDate);
          purchaseDate.setHours(0, 0, 0, 0);
          if (purchaseDate < start || purchaseDate > end) {
            return;
          }

          const invId = inv._id?.toString();
          const hasCapitalEntry = entries.some((entry) => {
            const entryInvId =
              entry.investment?.toString() || entry.investment?._id?.toString();
            if (entryInvId !== invId) {
              return false;
            }
            const entryDate = new Date(entry.date);
            if (entryDate < start || entryDate > end) {
              return false;
            }
            return entry.operation === "creation" || entry.operation === "add";
          });

          if (!hasCapitalEntry) {
            let impliedCapital = 0;
            if (inv.isAutomatedPortfolio) {
              impliedCapital = inv.quantity || 0;
            } else {
              const priceToUse =
                inv.averagePurchasePrice || inv.purchasePrice || 0;
              impliedCapital = (inv.quantity || 0) * priceToUse;
            }

            if (impliedCapital === 0) {
              impliedCapital = inv.isAutomatedPortfolio
                ? inv.currentPrice || 0
                : (inv.quantity || 0) * (inv.currentPrice || 0);
            }

            if (impliedCapital > 0) {
              netCapitalChange += impliedCapital;
            }
          }
        });
      }

      return netCapitalChange;
    };

    // Calcular el capital total invertido (todos los aportes menos todas las ventas)
    let totalInvestedCapital = 0;
    let totalContributedCapital = 0;
    let totalWithdrawnCapital = 0;
    const capitalOperations = []; // Para depuración

    // Si hay historial, calcular basándose en los operationAmount
    if (allHistoryEntries.length > 0) {
      allHistoryEntries.forEach((entry) => {
        if (entry.operation === "creation" || entry.operation === "add") {
          // Sumar aportes de capital
          // IMPORTANTE: Para 'add', SIEMPRE usar operationAmount, nunca totalValue
          // porque totalValue incluye el valor total de la inversión, no solo el capital añadido
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            // Intentar calcular desde operationPrice y quantity
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            } else if (entry.operation === "creation" && entry.totalValue) {
              // SOLO para creation, el totalValue inicial es el capital aportado
              // Para 'add', NUNCA usar totalValue porque incluye el valor previo
              amount = entry.totalValue;
            }
          }
          amount = amount || 0;

          // Validar que el amount sea razonable
          // Para 'add', el amount debería ser razonablemente pequeño comparado con el totalValue
          // (el totalValue incluye lo que ya había + lo nuevo)
          if (
            entry.operation === "add" &&
            entry.totalValue &&
            amount > entry.totalValue * 0.9
          ) {
            // Si el amount es > 90% del totalValue, probablemente estamos usando totalValue por error
            // Intentar calcular desde operationPrice y quantity si están disponibles
            if (entry.operationPrice && entry.quantity) {
              const calculatedAmount = entry.operationPrice * entry.quantity;
              if (calculatedAmount < entry.totalValue * 0.5) {
                amount = calculatedAmount;
              }
            }
          }

          // Validar que el amount sea razonable (no negativo)
          if (amount < 0) {
            amount = 0; // Ignorar amounts negativos en operaciones de add
          }

          totalInvestedCapital += amount;
          totalContributedCapital += amount;
          capitalOperations.push({
            date: entry.date,
            operation: entry.operation,
            amount: amount,
            investment: entry.investment?._id || entry.investment,
            type: "add",
          });
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          // Restar ventas/retiros (el capital retirado)
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            // Intentar calcular desde operationPrice y quantity
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            }
          }
          amount = Math.abs(amount || 0);

          // Validar que el amount no sea excesivamente grande (más del 200% del valor actual de esa inversión)
          const investment = allInvestments.find(
            (inv) =>
              inv._id.toString() ===
              (entry.investment?._id?.toString() ||
                entry.investment?.toString()),
          );
          if (investment) {
            const invCurrentValue = investment.isAutomatedPortfolio
              ? investment.currentPrice
              : investment.quantity * investment.currentPrice;
            if (amount > invCurrentValue * 2) {
              // Limitar el amount al valor actual de la inversión
              amount = Math.min(amount, invCurrentValue);
            }
          }

          totalInvestedCapital -= amount;
          totalWithdrawnCapital += amount;
          capitalOperations.push({
            date: entry.date,
            operation: entry.operation,
            amount: -amount,
            investment: entry.investment?._id || entry.investment,
            type: "subtract",
          });
        }
        // 'update' no afecta el capital invertido, solo refleja cambios de precio
      });

      // Agregar todas las inversiones que tienen operación "creation" a validInvestments
      allInvestments.forEach((inv) => {
        const hasCreationEntry = allHistoryEntries.some((entry) => {
          const entryInvId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          return (
            entryInvId === inv._id.toString() && entry.operation === "creation"
          );
        });
        if (hasCreationEntry) {
          validInvestments.push(inv);
        }
      });

      // IMPORTANTE: Verificar inversiones que NO tienen operación "creation" registrada
      // Estas inversiones no se contaron en totalInvestedCapital, pero su capital inicial debe incluirse
      for (const inv of allInvestments) {
        const hasCreationEntry = allHistoryEntries.some((entry) => {
          const entryInvId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          return (
            entryInvId === inv._id.toString() && entry.operation === "creation"
          );
        });

        if (!hasCreationEntry) {
          // Buscar primera entrada de historial
          const firstHistoryEntry = await InvestmentHistory.findOne({
            user: req.userId,
            investment: inv._id,
          })
            .sort({ date: 1 })
            .limit(1);

          let initialCapital = 0;
          if (
            firstHistoryEntry &&
            (firstHistoryEntry.operation === "creation" ||
              firstHistoryEntry.operation === "add")
          ) {
            initialCapital =
              firstHistoryEntry.operationAmount ||
              (firstHistoryEntry.operationPrice && firstHistoryEntry.quantity
                ? firstHistoryEntry.operationPrice * firstHistoryEntry.quantity
                : 0);
          }

          // Si no hay historial con capital, calcular desde precios de compra
          if (initialCapital === 0) {
            if (inv.isAutomatedPortfolio) {
              // Para carteras automatizadas, la cantidad es el capital inicial
              initialCapital = inv.quantity || 0;
            } else {
              // Usar precio medio de compra si existe, sino precio inicial
              const priceToUse =
                inv.averagePurchasePrice || inv.purchasePrice || 0;
              initialCapital = (inv.quantity || 0) * priceToUse;
            }
          }

          // Solo como último recurso: estimación conservadora del 80% del valor actual
          // Esto evita inflar artificialmente el capital invertido
          if (initialCapital === 0 && inv.currentPrice && inv.quantity) {
            const currentValue = inv.isAutomatedPortfolio
              ? inv.currentPrice || 0
              : (inv.quantity || 0) * (inv.currentPrice || 0);
            // Usar el 80% del valor actual como estimación conservadora
            initialCapital = currentValue * 0.8;
          }

          // IMPORTANTE: Si no podemos determinar el capital inicial con confianza,
          // excluir esta inversión del cálculo del rendimiento acumulado
          if (initialCapital === 0) {
            console.log(
              `Excluyendo inversión ${inv.name} del cálculo del rendimiento acumulado (capital inicial desconocido)`,
            );
            continue; // Saltar esta inversión
          }

          if (initialCapital > 0) {
            totalInvestedCapital += initialCapital;
            totalContributedCapital += initialCapital;
            capitalOperations.push({
              date: inv.purchaseDate || new Date(),
              operation: "creation",
              amount: initialCapital,
              investment: inv._id,
              type: "add",
            });
            validInvestments.push(inv); // Agregar a inversiones válidas
          }
        }
      }
    } else {
      // Si no hay historial, calcular basándose en purchaseDate y purchasePrice
      investments.forEach((inv) => {
        let investedInThisInv = 0;

        if (inv.isAutomatedPortfolio) {
          investedInThisInv = inv.quantity || 0; // Para carteras, quantity es el capital inicial
        } else {
          const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
          investedInThisInv = (inv.quantity || 0) * avgPrice;
        }

        // Para inversiones antiguas sin operaciones registradas, asumir capital inicial = 0
        // si la fecha de compra es anterior a la primera operación registrada por más de 30 días
        if (investedInThisInv === 0 && inv.purchaseDate) {
          const purchaseDate = new Date(inv.purchaseDate);
          const now = new Date();
          const daysSincePurchase =
            (now - purchaseDate) / (1000 * 60 * 60 * 24);

          // Si la inversión existe desde hace más de 30 días pero no hay capital registrado,
          // asumir que todo el valor actual es rendimiento acumulado (capital inicial = 0)
          if (daysSincePurchase > 30) {
            investedInThisInv = 0;
          }
        }

        totalInvestedCapital += investedInThisInv;
        totalContributedCapital += investedInThisInv;
      });
    }

    const netInvestedCapital = totalInvestedCapital;
    const initialValue = Math.max(0, totalContributedCapital);

    // Calcular valor actual (solo con inversiones válidas)
    let currentValue = 0;
    validInvestments.forEach((inv) => {
      if (inv.isAutomatedPortfolio) {
        currentValue += inv.currentPrice || 0;
      } else {
        currentValue += (inv.quantity || 0) * (inv.currentPrice || 0);
      }
    });

    // Valor actual total (todas las inversiones)
    let currentTotalValue = 0;
    investments.forEach((inv) => {
      if (inv.isAutomatedPortfolio) {
        currentTotalValue += inv.currentPrice || 0;
      } else {
        currentTotalValue += (inv.quantity || 0) * (inv.currentPrice || 0);
      }
    });

    const DailyVariation = (await import("../models/DailyVariation.js"))
      .default;

    // Calcular rendimiento acumulado correctamente:
    // Rendimiento acumulado = Valor actual total - Capital neto aportado históricamente
    // El capital neto aportado es la suma de todos los "add" y "creation" menos todos los "sell" y "withdraw"
    const accumulatedReturnCapital = currentTotalValue - netInvestedCapital;

    // Usar variaciones diarias si existen para obtener el rendimiento acumulado más fiable
    const accumulatedVariationsAgg = await DailyVariation.aggregate([
      {
        $match: {
          user: req.userId,
          investment: { $in: investments.map((inv) => inv._id) },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$changeAmount", 0] } },
        },
      },
    ]);
    const accumulatedReturnFromVariations =
      accumulatedVariationsAgg.length > 0
        ? accumulatedVariationsAgg[0].total
        : null;

    const accumulatedReturnDiff =
      accumulatedReturnFromVariations !== null
        ? Math.abs(accumulatedReturnFromVariations - accumulatedReturnCapital)
        : null;
    const accumulatedReturnThresholdValue = Math.max(
      50,
      currentTotalValue * 0.01,
    );
    const accumulatedReturnThresholdReturn = Math.max(
      50,
      Math.abs(accumulatedReturnCapital) * 0.1,
    );
    const accumulatedReturnThreshold = Math.min(
      accumulatedReturnThresholdValue,
      accumulatedReturnThresholdReturn,
    );
    const accumulatedReturn = accumulatedReturnCapital;
    const accumulatedReturnPercent =
      netInvestedCapital > 0
        ? (accumulatedReturn / netInvestedCapital) * 100
        : 0;
    const accumulatedReturnCapitalPercent =
      netInvestedCapital > 0
        ? (accumulatedReturnCapital / netInvestedCapital) * 100
        : 0;
    const accumulatedReturnVariationsPercent =
      accumulatedReturnFromVariations !== null && netInvestedCapital > 0
        ? (accumulatedReturnFromVariations / netInvestedCapital) * 100
        : null;
    const accumulatedReturnSource = "capital";
    const totalReturn = accumulatedReturn;
    const totalReturnPercent = accumulatedReturnPercent;

    // Logs de depuración - mostrar TODAS las operaciones, incluyendo sell/withdraw
    const allOperations = capitalOperations.map((op) => ({
      date: op.date,
      operation: op.operation,
      amount: op.amount,
      investment: op.investment,
      type: op.type,
    }));

    // Calcular rendimiento anual del año actual (desde el 1 de enero del año actual hasta hoy)
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1); // 1 de enero del año actual
    yearStart.setHours(0, 0, 0, 0);

    // Obtener el valor del portfolio al inicio del año actual
    // Buscar la variación más reciente del 31 de diciembre (último día del año anterior)
    const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31); // 31 de diciembre del año anterior
    lastDayOfPreviousYear.setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(lastDayOfPreviousYear);
    lastDayEnd.setDate(lastDayEnd.getDate() + 1);

    // Buscar variaciones del 31 de diciembre
    let yearStartValue = 0;
    const variationsDec31 = await DailyVariation.find({
      user: req.userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd },
    });

    // Verificar si las variaciones del 31/12 están desactualizadas comparándolas con el valor actual
    // Si hay una discrepancia grande (más del 20%), usar el valor actual del modelo Investment
    const variationsDec31Map = new Map();
    if (variationsDec31.length > 0) {
      variationsDec31.forEach((v) => {
        const invId = v.investment.toString();
        const inv = investments.find((inv) => inv._id.toString() === invId);
        if (inv) {
          const currentValue = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
          const variationValue = v.totalValue || 0;

          // Si la diferencia es mayor al 20%, usar el valor actual (probablemente fue corregido)
          const diffPercent =
            currentValue > 0
              ? Math.abs((variationValue - currentValue) / currentValue)
              : 0;
          if (diffPercent > 0.2 && variationValue > currentValue * 1.2) {
            // La variación es mucho mayor que el valor actual, probablemente fue corregido
            // Usar el valor actual en lugar de la variación desactualizada
            variationsDec31Map.set(invId, currentValue);
          } else {
            variationsDec31Map.set(invId, variationValue);
          }
        } else {
          variationsDec31Map.set(invId, v.totalValue || 0);
        }
      });

      variationsDec31Map.forEach((value) => {
        yearStartValue += value;
      });
    } else {
      // Si no hay del 31 de diciembre, buscar la más reciente antes del 1 de enero
      const lastVariationBeforeYear = await DailyVariation.findOne({
        user: req.userId,
        investment: { $in: investments.map((inv) => inv._id) },
        date: { $lt: yearStart },
      })
        .sort({ date: -1 })
        .limit(1)
        .select("date");

      if (lastVariationBeforeYear) {
        // Obtener todas las variaciones de esa fecha
        const lastDate = new Date(lastVariationBeforeYear.date);
        lastDate.setHours(0, 0, 0, 0);
        const lastDateEnd = new Date(lastDate);
        lastDateEnd.setDate(lastDateEnd.getDate() + 1);

        const variationsAtLastDate = await DailyVariation.find({
          user: req.userId,
          investment: { $in: investments.map((inv) => inv._id) },
          date: { $gte: lastDate, $lt: lastDateEnd },
        });

        variationsAtLastDate.forEach((v) => {
          yearStartValue += v.totalValue || 0;
        });
      } else {
        // Si no hay variaciones diarias, usar el historial más reciente antes del año
        const historyBeforeYear = await InvestmentHistory.find({
          user: req.userId,
          investment: { $in: investments.map((inv) => inv._id) },
          date: { $lt: yearStart },
        }).sort({ date: -1 });

        // Agrupar por inversión y tomar el totalValue más reciente de cada una
        const latestByInvestment = new Map();
        historyBeforeYear.forEach((h) => {
          const invId = h.investment.toString();
          if (!latestByInvestment.has(invId) && h.totalValue) {
            latestByInvestment.set(invId, h.totalValue);
          }
        });

        latestByInvestment.forEach((totalValue) => {
          yearStartValue += totalValue || 0;
        });
      }
    }

    // Identificar inversiones que existían antes del 1 de enero de 2026
    // La fecha de creación (purchaseDate) es la que importa, no la fecha de registro
    const oldInvestmentIds = new Set();
    const newInvestmentIds = new Set();

    investments.forEach((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      if (purchaseDate < yearStart) {
        oldInvestmentIds.add(inv._id.toString());
      } else {
        newInvestmentIds.add(inv._id.toString());
      }
    });

    // Calcular el valor al 31 de diciembre de 2025 de las inversiones antiguas
    // IMPORTANTE: Necesitamos el valor REAL al 31/12, no el capital inicial
    let actualYearStartValue = yearStartValue;
    const missingInvestments = [];
    const investmentsInYearStartValue = new Set();

    // Identificar qué inversiones están ya incluidas en yearStartValue
    if (variationsDec31.length > 0) {
      variationsDec31.forEach((v) => {
        const vInvId =
          v.investment?.toString() ||
          (typeof v.investment === "object"
            ? v.investment._id?.toString()
            : null);
        if (vInvId) {
          investmentsInYearStartValue.add(vInvId);
        }
      });
    } else {
      // Si no hay variaciones del 31/12, buscar en las variaciones más recientes
      const lastVariationBeforeYear = await DailyVariation.findOne({
        user: req.userId,
        investment: { $in: investments.map((inv) => inv._id) },
        date: { $lt: yearStart },
      })
        .sort({ date: -1 })
        .limit(1)
        .select("date");

      if (lastVariationBeforeYear) {
        const lastDate = new Date(lastVariationBeforeYear.date);
        lastDate.setHours(0, 0, 0, 0);
        const lastDateEnd = new Date(lastDate);
        lastDateEnd.setDate(lastDateEnd.getDate() + 1);

        const variationsAtLastDate = await DailyVariation.find({
          user: req.userId,
          investment: { $in: investments.map((inv) => inv._id) },
          date: { $gte: lastDate, $lt: lastDateEnd },
        });

        variationsAtLastDate.forEach((v) => {
          const vInvId =
            v.investment?.toString() ||
            (typeof v.investment === "object"
              ? v.investment._id?.toString()
              : null);
          if (vInvId) {
            investmentsInYearStartValue.add(vInvId);
          }
        });
      }
    }

    // Para inversiones antiguas que no tienen registro en DailyVariation al 31/12,
    // buscar su valor más reciente antes del 1 de enero
    for (const inv of investments) {
      const invId = inv._id.toString();
      if (
        oldInvestmentIds.has(invId) &&
        !investmentsInYearStartValue.has(invId)
      ) {
        // Buscar el valor más reciente antes del 1 de enero en DailyVariation
        const lastVariation = await DailyVariation.findOne({
          user: req.userId,
          investment: inv._id,
          date: { $lt: yearStart },
        })
          .sort({ date: -1 })
          .limit(1);

        if (lastVariation && lastVariation.totalValue) {
          actualYearStartValue += lastVariation.totalValue;
          missingInvestments.push({
            name: inv.name,
            value: lastVariation.totalValue,
            date: lastVariation.date,
            source: "DailyVariation",
          });
        } else {
          // Si no hay en DailyVariation, buscar en InvestmentHistory
          // IMPORTANTE: Buscar el valor más cercano al 31/12, no solo el último registro
          // Preferir registros de 'update' o el último registro antes del 31/12
          const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31);
          lastDayOfPreviousYear.setHours(0, 0, 0, 0);
          const lastDayEnd = new Date(lastDayOfPreviousYear);
          lastDayEnd.setDate(lastDayEnd.getDate() + 1);

          // Primero buscar registros del 31/12
          const historyDec31 = await InvestmentHistory.findOne({
            user: req.userId,
            investment: inv._id,
            date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd },
          })
            .sort({ date: -1 })
            .limit(1);

          if (historyDec31 && historyDec31.totalValue) {
            actualYearStartValue += historyDec31.totalValue;
            missingInvestments.push({
              name: inv.name,
              value: historyDec31.totalValue,
              date: historyDec31.date,
              source: "InvestmentHistory 31/12",
            });
          } else {
            // Si no hay registro del 31/12, buscar el más reciente antes del 1 de enero con totalValue
            const lastHistory = await InvestmentHistory.findOne({
              user: req.userId,
              investment: inv._id,
              date: { $lt: yearStart },
              totalValue: { $exists: true, $ne: null, $gt: 0 },
            })
              .sort({ date: -1 })
              .limit(1);

            if (lastHistory && lastHistory.totalValue) {
              // IMPORTANTE: Usar el totalValue si el registro es reciente (dentro de 30 días del 31/12)
              // Esto refleja mejor el valor de mercado que calcular el capital invertido
              const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31);
              lastDayOfPreviousYear.setHours(0, 0, 0, 0);
              const daysDiff =
                (yearStart - lastHistory.date) / (1000 * 60 * 60 * 24);

              // Usar totalValue si el registro es del 31/12, 30/12, o está dentro de 30 días
              // Esto es mejor que usar capital invertido porque refleja el valor de mercado
              if (daysDiff <= 30) {
                // El registro es reciente, usar su totalValue como aproximación del valor al 31/12
                actualYearStartValue += lastHistory.totalValue;
                investmentsInYearStartValue.add(invId);
                missingInvestments.push({
                  name: inv.name,
                  value: lastHistory.totalValue,
                  date: lastHistory.date,
                  source: `InvestmentHistory (${daysDiff.toFixed(0)} días antes del 1/1)`,
                });
              } else {
                // El registro es anterior al 30/12
                // IMPORTANTE: No usar capital invertido, buscar el último totalValue antes del 1/1
                // que refleje el valor real de mercado, no solo el capital aportado

                // Buscar el último registro con totalValue antes del 1/1, preferiblemente de tipo 'update'
                const lastUpdateBeforeYear = await InvestmentHistory.findOne({
                  user: req.userId,
                  investment: inv._id,
                  date: { $lt: yearStart },
                  totalValue: { $exists: true, $ne: null, $gt: 0 },
                })
                  .sort({ date: -1 })
                  .limit(1);

                if (lastUpdateBeforeYear && lastUpdateBeforeYear.totalValue) {
                  // Usar el totalValue del último registro, que debería reflejar el valor de mercado
                  actualYearStartValue += lastUpdateBeforeYear.totalValue;
                  missingInvestments.push({
                    name: inv.name,
                    value: lastUpdateBeforeYear.totalValue,
                    date: lastUpdateBeforeYear.date,
                    source: "InvestmentHistory (last totalValue)",
                  });
                } else {
                  // Como último recurso, si no hay ningún registro con totalValue,
                  // calcular el capital invertido (pero esto no es ideal)
                  let invCapitalBeforeYear = 0;
                  const invHistoryBeforeYear = allHistoryEntries.filter((e) => {
                    const eInvId =
                      e.investment?._id?.toString() || e.investment?.toString();
                    const eDate = new Date(e.date);
                    eDate.setHours(0, 0, 0, 0);
                    return eInvId === invId && eDate < yearStart;
                  });

                  invHistoryBeforeYear.forEach((e) => {
                    if (e.operation === "creation" || e.operation === "add") {
                      let amount = e.operationAmount;
                      if (!amount || amount === 0) {
                        if (e.operationPrice && e.quantity) {
                          amount = e.operationPrice * e.quantity;
                        } else if (e.totalValue && e.operation === "creation") {
                          amount = e.totalValue;
                        }
                      }
                      amount = amount || 0;
                      if (amount >= 0) {
                        invCapitalBeforeYear += amount;
                      }
                    } else if (
                      e.operation === "sell" ||
                      e.operation === "withdraw"
                    ) {
                      let amount = e.operationAmount;
                      if (!amount || amount === 0) {
                        if (e.operationPrice && e.quantity) {
                          amount = e.operationPrice * e.quantity;
                        }
                      }
                      amount = Math.abs(amount || 0);
                      invCapitalBeforeYear -= amount;
                    }
                  });

                  if (invCapitalBeforeYear > 0) {
                    actualYearStartValue += invCapitalBeforeYear;
                    missingInvestments.push({
                      name: inv.name,
                      value: invCapitalBeforeYear,
                      date: null,
                      source: "calculatedFromHistory (fallback)",
                    });
                  } else {
                    let fallbackValue = 0;
                    if (inv.isAutomatedPortfolio) {
                      fallbackValue = inv.quantity || 0;
                    } else {
                      const priceToUse =
                        inv.averagePurchasePrice || inv.purchasePrice || 0;
                      fallbackValue = (inv.quantity || 0) * priceToUse;
                    }

                    if (fallbackValue === 0) {
                      fallbackValue = inv.isAutomatedPortfolio
                        ? inv.currentPrice || 0
                        : (inv.quantity || 0) * (inv.currentPrice || 0);
                    }

                    if (fallbackValue > 0) {
                      actualYearStartValue += fallbackValue;
                      missingInvestments.push({
                        name: inv.name,
                        value: fallbackValue,
                        date: null,
                        source: "investmentData (fallback)",
                      });
                    }
                  }
                }
              }
            } else {
              // Como último recurso, buscar el último totalValue en InvestmentHistory
              // antes del 1/1, que refleje el valor real de mercado
              const lastTotalValueBeforeYear = await InvestmentHistory.findOne({
                user: req.userId,
                investment: inv._id,
                date: { $lt: yearStart },
                totalValue: { $exists: true, $ne: null, $gt: 0 },
              })
                .sort({ date: -1 })
                .limit(1);

              if (
                lastTotalValueBeforeYear &&
                lastTotalValueBeforeYear.totalValue
              ) {
                // Usar el totalValue del último registro
                actualYearStartValue += lastTotalValueBeforeYear.totalValue;
                missingInvestments.push({
                  name: inv.name,
                  value: lastTotalValueBeforeYear.totalValue,
                  date: lastTotalValueBeforeYear.date,
                  source: "InvestmentHistory (last totalValue)",
                });
              } else {
                // Si no hay ningún registro con totalValue, calcular el capital invertido
                // (pero esto no es ideal porque no refleja el rendimiento previo)
                let invCapitalBeforeYear = 0;
                const invHistoryBeforeYear = allHistoryEntries.filter((e) => {
                  const eInvId =
                    e.investment?._id?.toString() || e.investment?.toString();
                  const eDate = new Date(e.date);
                  eDate.setHours(0, 0, 0, 0);
                  return eInvId === invId && eDate < yearStart;
                });

                invHistoryBeforeYear.forEach((e) => {
                  if (e.operation === "creation" || e.operation === "add") {
                    let amount = e.operationAmount;
                    if (!amount || amount === 0) {
                      if (e.operationPrice && e.quantity) {
                        amount = e.operationPrice * e.quantity;
                      } else if (e.totalValue && e.operation === "creation") {
                        amount = e.totalValue;
                      }
                    }
                    amount = amount || 0;
                    if (amount >= 0) {
                      invCapitalBeforeYear += amount;
                    }
                  } else if (
                    e.operation === "sell" ||
                    e.operation === "withdraw"
                  ) {
                    let amount = e.operationAmount;
                    if (!amount || amount === 0) {
                      if (e.operationPrice && e.quantity) {
                        amount = e.operationPrice * e.quantity;
                      }
                    }
                    amount = Math.abs(amount || 0);
                    invCapitalBeforeYear -= amount;
                  }
                });

                if (invCapitalBeforeYear > 0) {
                  actualYearStartValue += invCapitalBeforeYear;
                  missingInvestments.push({
                    name: inv.name,
                    value: invCapitalBeforeYear,
                    date: null,
                    source: "calculatedFromHistory (fallback)",
                  });
                } else {
                  let fallbackValue = 0;
                  if (inv.isAutomatedPortfolio) {
                    fallbackValue = inv.quantity || 0;
                  } else {
                    const priceToUse =
                      inv.averagePurchasePrice || inv.purchasePrice || 0;
                    fallbackValue = (inv.quantity || 0) * priceToUse;
                  }

                  if (fallbackValue === 0) {
                    fallbackValue = inv.isAutomatedPortfolio
                      ? inv.currentPrice || 0
                      : (inv.quantity || 0) * (inv.currentPrice || 0);
                  }

                  if (fallbackValue > 0) {
                    actualYearStartValue += fallbackValue;
                    missingInvestments.push({
                      name: inv.name,
                      value: fallbackValue,
                      date: null,
                      source: "investmentData (fallback)",
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // Ajustar rendimiento por movimientos de capital para no contarlos como beneficio

    // Calcular rendimiento anual excluyendo aportes/retiros
    const yearEnd = new Date();
    yearEnd.setHours(23, 59, 59, 999);
    const annualCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      yearStart,
      yearEnd,
      investments,
    );
    const annualReturnCapital =
      currentTotalValue - actualYearStartValue - annualCapitalChange;
    const annualVariationsAgg = await DailyVariation.aggregate([
      {
        $match: {
          user: req.userId,
          investment: { $in: investments.map((inv) => inv._id) },
          date: { $gte: yearStart, $lte: yearEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$changeAmount", 0] } },
        },
      },
    ]);
    const annualReturn =
      annualVariationsAgg.length > 0 ? annualVariationsAgg[0].total : 0;
    const annualReturnPercent =
      actualYearStartValue > 0
        ? (annualReturn / actualYearStartValue) * 100
        : 0;

    // Coherencia acumulado vs anual: rendimiento antes del año actual
    let netInvestedBeforeYear = 0;
    allHistoryEntries.forEach((entry) => {
      if (!entry?.date) {
        return;
      }
      const entryDate = new Date(entry.date);
      if (entryDate >= yearStart) {
        return;
      }

      if (entry.operation === "creation" || entry.operation === "add") {
        netInvestedBeforeYear += getOperationAmount(entry);
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        netInvestedBeforeYear -= Math.abs(getOperationAmount(entry));
      }
    });
    const returnBeforeYear = actualYearStartValue - netInvestedBeforeYear;
    const accumulatedReturnCheck = returnBeforeYear + annualReturnCapital;
    const accumulatedReturnCheckDiff =
      accumulatedReturn - accumulatedReturnCheck;

    // Calcular rendimiento diario: SOLO sumar las variaciones diarias de HOY
    // IMPORTANTE: Las variaciones diarias ya excluyen aportes/retiros, así que solo sumamos
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

    // Obtener todas las variaciones diarias de HOY (se guardan con fecha de hoy cuando se actualizan precios)
    const todayVariations = await DailyVariation.find({
      user: req.userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: today, $lt: tomorrow },
    });

    // Obtener variaciones de ayer para calcular el valor base (para el porcentaje)
    const yesterdayVariations = await DailyVariation.find({
      user: req.userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: yesterday, $lt: yesterdayEnd },
    });

    // Crear un mapa de valores de ayer por inversión
    const yesterdayValuesByInvestment = new Map();
    for (const variation of yesterdayVariations) {
      const invId = variation.investment.toString();
      if (variation.totalValue !== null && variation.totalValue !== undefined) {
        yesterdayValuesByInvestment.set(invId, variation.totalValue);
      }
    }

    // Filtrar inversiones que existían ayer (para no incluir inversiones nuevas en el cálculo)
    const investmentsThatExistedYesterday = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < yesterday;
    });

    const investmentIdsThatExistedYesterday = new Set(
      investmentsThatExistedYesterday.map((inv) => inv._id.toString()),
    );

    // Calcular valor de ayer con fallback si falta DailyVariation
    let dailyBaseValue = 0;
    for (const inv of investmentsThatExistedYesterday) {
      const invId = inv._id.toString();
      const yesterdayValue = yesterdayValuesByInvestment.get(invId);
      if (yesterdayValue !== undefined && yesterdayValue > 0) {
        dailyBaseValue += yesterdayValue;
        continue;
      }

      const lastVariation = await DailyVariation.findOne({
        user: req.userId,
        investment: inv._id,
        date: { $lt: yesterday },
      })
        .sort({ date: -1 })
        .limit(1);

      if (lastVariation && lastVariation.totalValue) {
        dailyBaseValue += lastVariation.totalValue;
        continue;
      }

      const lastHistory = await InvestmentHistory.findOne({
        user: req.userId,
        investment: inv._id,
        date: { $lt: yesterday },
        totalValue: { $exists: true, $ne: null, $gt: 0 },
      })
        .sort({ date: -1 })
        .limit(1);

      if (lastHistory && lastHistory.totalValue) {
        dailyBaseValue += lastHistory.totalValue;
        continue;
      }

      if (inv.isAutomatedPortfolio) {
        dailyBaseValue += inv.currentPrice || 0;
      } else {
        dailyBaseValue += (inv.quantity || 0) * (inv.currentPrice || 0);
      }
    }

    // Calcular valor actual solo de inversiones que existían ayer
    let currentValueExisting = 0;
    investmentsThatExistedYesterday.forEach((inv) => {
      if (inv.isAutomatedPortfolio) {
        currentValueExisting += inv.currentPrice || 0;
      } else {
        currentValueExisting += (inv.quantity || 0) * (inv.currentPrice || 0);
      }
    });

    // Ajustar por movimientos de capital del día para inversiones existentes
    const dailyCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      today,
      tomorrow,
      [],
      investmentIdsThatExistedYesterday,
    );

    const dailyReturn =
      currentValueExisting - dailyBaseValue - dailyCapitalChange;
    const dailyReturnPercent =
      dailyBaseValue > 0 ? (dailyReturn / dailyBaseValue) * 100 : 0;

    // Calcular rendimiento trimestral: sumar TODAS las variaciones diarias del trimestre
    // IMPORTANTE: Las variaciones diarias ya excluyen aportes/retiros, pero incluyen el rendimiento de nuevas inversiones
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();

    // Determinar el mes de inicio del trimestre actual (0, 3, 6, 9)
    let quarterStartMonth = 0;
    if (currentMonth >= 0 && currentMonth < 3) {
      quarterStartMonth = 0; // Q1: Enero
    } else if (currentMonth >= 3 && currentMonth < 6) {
      quarterStartMonth = 3; // Q2: Abril
    } else if (currentMonth >= 6 && currentMonth < 9) {
      quarterStartMonth = 6; // Q3: Julio
    } else {
      quarterStartMonth = 9; // Q4: Octubre
    }

    const quarterStart = new Date(currentYear, quarterStartMonth, 1);
    quarterStart.setHours(0, 0, 0, 0);
    const quarterEnd = new Date();
    quarterEnd.setHours(23, 59, 59, 999);

    // Obtener el valor al inicio del trimestre (antes de cualquier aportación durante el trimestre)
    // Para cada inversión que existía al inicio del trimestre, buscar su valor más reciente antes del inicio del trimestre
    const investmentsExistingAtQuarterStart = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < quarterStart;
    });

    let quarterStartValue = 0;
    for (const inv of investmentsExistingAtQuarterStart) {
      // Buscar la variación más reciente de esta inversión antes del inicio del trimestre
      const lastVariation = await DailyVariation.findOne({
        user: req.userId,
        investment: inv._id,
        date: { $lt: quarterStart },
      })
        .sort({ date: -1 })
        .limit(1);

      if (lastVariation && lastVariation.totalValue) {
        quarterStartValue += lastVariation.totalValue;
      } else {
        const lastHistory = await InvestmentHistory.findOne({
          user: req.userId,
          investment: inv._id,
          date: { $lt: quarterStart },
          totalValue: { $exists: true, $ne: null, $gt: 0 },
        })
          .sort({ date: -1 })
          .limit(1);

        if (lastHistory && lastHistory.totalValue) {
          quarterStartValue += lastHistory.totalValue;
        } else {
          // Si no hay variación histórica, usar el valor actual (aproximación)
          if (inv.isAutomatedPortfolio) {
            quarterStartValue += inv.currentPrice || 0;
          } else {
            quarterStartValue += (inv.quantity || 0) * (inv.currentPrice || 0);
          }
        }
      }
    }

    // Si no hay inversiones que existieran al inicio del trimestre, quarterStartValue será 0
    // En ese caso, el rendimiento trimestral será 0 (no hay base para comparar)

    // Calcular rendimiento trimestral excluyendo aportes/retiros
    const quarterCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      quarterStart,
      quarterEnd,
      investments,
    );
    const quarterVariationsAgg = await DailyVariation.aggregate([
      {
        $match: {
          user: req.userId,
          investment: { $in: investments.map((inv) => inv._id) },
          date: { $gte: quarterStart, $lte: quarterEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$changeAmount", 0] } },
        },
      },
    ]);
    const quarterlyReturn =
      quarterVariationsAgg.length > 0 ? quarterVariationsAgg[0].total : 0;
    const quarterlyReturnPercent =
      quarterStartValue > 0 ? (quarterlyReturn / quarterStartValue) * 100 : 0;

    // Calcular rendimiento mensual excluyendo aportes/retiros
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date();
    monthEnd.setHours(23, 59, 59, 999);

    // Obtener el valor al inicio del mes (antes de cualquier aportación durante el mes)
    // Para cada inversión que existía al inicio del mes, buscar su valor más reciente antes del inicio del mes
    const investmentsExistingAtMonthStart = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < monthStart;
    });

    let monthStartValue = 0;
    for (const inv of investmentsExistingAtMonthStart) {
      // Buscar la variación más reciente de esta inversión antes del inicio del mes
      const lastVariation = await DailyVariation.findOne({
        user: req.userId,
        investment: inv._id,
        date: { $lt: monthStart },
      })
        .sort({ date: -1 })
        .limit(1);

      if (lastVariation && lastVariation.totalValue) {
        monthStartValue += lastVariation.totalValue;
      } else {
        const lastHistory = await InvestmentHistory.findOne({
          user: req.userId,
          investment: inv._id,
          date: { $lt: monthStart },
          totalValue: { $exists: true, $ne: null, $gt: 0 },
        })
          .sort({ date: -1 })
          .limit(1);

        if (lastHistory && lastHistory.totalValue) {
          monthStartValue += lastHistory.totalValue;
        } else {
          // Si no hay variación histórica, usar el valor actual (aproximación)
          if (inv.isAutomatedPortfolio) {
            monthStartValue += inv.currentPrice || 0;
          } else {
            monthStartValue += (inv.quantity || 0) * (inv.currentPrice || 0);
          }
        }
      }
    }

    // Si no hay inversiones que existieran al inicio del mes, monthStartValue será 0
    // En ese caso, el rendimiento mensual será 0 (no hay base para comparar)

    // Calcular rendimiento mensual excluyendo aportes/retiros
    const monthCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      monthStart,
      monthEnd,
      investments,
    );
    const monthVariationsAgg = await DailyVariation.aggregate([
      {
        $match: {
          user: req.userId,
          investment: { $in: investments.map((inv) => inv._id) },
          date: { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$changeAmount", 0] } },
        },
      },
    ]);
    const monthlyReturn =
      monthVariationsAgg.length > 0 ? monthVariationsAgg[0].total : 0;
    const monthlyReturnPercent =
      monthStartValue > 0 ? (monthlyReturn / monthStartValue) * 100 : 0;

    // Obtener la fecha más antigua para el cálculo del período (usar inversiones válidas si existen)
    let startDate = new Date();
    const investmentsForPeriod =
      validInvestments.length > 0 ? validInvestments : investments;
    investmentsForPeriod.forEach((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      if (purchaseDate < startDate) {
        startDate = purchaseDate;
      }
    });

    // Calcular capital adicional aportado después de la fecha inicial
    let additionalCapital = 0;
    if (allHistoryEntries.length > 0) {
      allHistoryEntries.forEach((entry) => {
        const entryDate = new Date(entry.date);
        // Solo considerar aportes después de la fecha de inicio
        if (entryDate > startDate) {
          if (entry.operation === "creation" || entry.operation === "add") {
            // Sumar aportes de capital adicionales
            additionalCapital += getOperationAmount(entry);
          } else if (
            entry.operation === "sell" ||
            entry.operation === "withdraw"
          ) {
            // Restar ventas/retiros (el capital retirado después de la fecha inicial)
            additionalCapital -= Math.abs(getOperationAmount(entry));
          }
        }
      });
    }

    // Calcular capital inicial (solo aportes hasta la fecha de inicio)
    let initialCapital = 0;
    if (allHistoryEntries.length > 0) {
      allHistoryEntries.forEach((entry) => {
        const entryDate = new Date(entry.date);
        // Solo considerar aportes hasta la fecha de inicio
        if (entryDate <= startDate) {
          if (entry.operation === "creation" || entry.operation === "add") {
            initialCapital += getOperationAmount(entry);
          } else if (
            entry.operation === "sell" ||
            entry.operation === "withdraw"
          ) {
            initialCapital -= Math.abs(getOperationAmount(entry));
          }
        }
      });
    } else {
      // Si no hay historial, todo el capital es inicial
      initialCapital = initialValue;
    }

    // Asegurar que no sean negativos
    initialCapital = Math.max(0, initialCapital);
    additionalCapital = Math.max(0, additionalCapital); // Solo mostramos aportes adicionales positivos

    // Calcular tiempo transcurrido en años
    const endDate = new Date();
    const timeDiff = endDate - startDate;
    const years = timeDiff / (1000 * 60 * 60 * 24 * 365.25); // Años con decimales

    // Calcular CAGR (Compound Annual Growth Rate)
    // CAGR = (Valor Final / Valor Inicial)^(1/Años) - 1
    // Usamos el capital total invertido (initialValue = initialCapital + additionalCapital)
    // igual que para el rendimiento acumulado, para ser coherente
    // Nota: Esta es una aproximación que asume que todo el capital estuvo invertido
    // durante todo el período. Un cálculo exacto con flujos de caja requeriría TWR o IRR
    let annualizedReturn = null;

    // Usar el capital total (inicial + adicional) para calcular el CAGR
    // Esto es coherente con el cálculo del rendimiento acumulado
    if (initialValue > 0 && years > 0) {
      const ratio = currentValue / initialValue;
      // Validar que el ratio sea razonable (evitar valores extremos)
      if (ratio > 0 && ratio < 1000000 && years > 0.01) {
        const cagr = (Math.pow(ratio, 1 / years) - 1) * 100;
        // Limitar el CAGR a un rango razonable (entre -99% y +10000%)
        if (cagr >= -99 && cagr <= 10000) {
          annualizedReturn = parseFloat(cagr.toFixed(2));
        }
      }
    }

    // Obtener datos del S&P 500 para comparación
    // Usamos el rendimiento histórico promedio del S&P 500 (~10% anual)
    // ya que obtener datos históricos precisos requeriría una API especializada
    const sp500HistoricalReturn = 10; // % anual promedio histórico (últimos ~100 años)

    // Calcular qué habría sido el rendimiento del S&P 500 en el mismo período
    const sp500ProjectedReturn =
      years > 0
        ? (Math.pow(1 + sp500HistoricalReturn / 100, years) - 1) * 100
        : 0;

    let sp500Comparison = {
      historicalAnnualReturn: sp500HistoricalReturn,
      projectedReturn: parseFloat(sp500ProjectedReturn.toFixed(2)),
      outperformance:
        annualizedReturn !== null
          ? parseFloat((annualizedReturn - sp500HistoricalReturn).toFixed(2))
          : null,
      outperformancePercent:
        annualizedReturn !== null && sp500HistoricalReturn !== 0
          ? parseFloat(
              ((annualizedReturn / sp500HistoricalReturn - 1) * 100).toFixed(2),
            )
          : null,
    };

    // Intentar obtener precio actual del S&P 500 (opcional, no crítico para la comparación)
    try {
      const yahooFinance = new YahooFinance();

      // Intentar primero con ^GSPC (índice directo)
      try {
        const sp500Quote = await yahooFinance.quote("^GSPC");
        if (sp500Quote && sp500Quote.regularMarketPrice) {
          sp500Comparison.currentPrice = sp500Quote.regularMarketPrice;
        }
      } catch (gspcError) {
        // Si ^GSPC falla, intentar con SPY (ETF que replica el S&P 500)
        try {
          const spyQuote = await yahooFinance.quote("SPY");
          if (spyQuote && spyQuote.regularMarketPrice) {
            sp500Comparison.currentPrice = spyQuote.regularMarketPrice;
          }
        } catch (spyError) {
          // Si ambos fallan, continuar sin precio actual (no es crítico)
        }
      }
    } catch (sp500Error) {
      // No es crítico, continuamos sin el precio actual
      // La comparación de rendimiento funciona perfectamente sin el precio actual
    }

    res.json({
      annualizedReturn,
      totalReturn,
      totalReturnPercent: parseFloat(totalReturnPercent.toFixed(2)),
      accumulatedReturn: parseFloat(accumulatedReturn.toFixed(2)),
      accumulatedReturnPercent: parseFloat(accumulatedReturnPercent.toFixed(2)),
      accumulatedReturnCapital: parseFloat(accumulatedReturnCapital.toFixed(2)),
      accumulatedReturnCapitalPercent: parseFloat(
        accumulatedReturnCapitalPercent.toFixed(2),
      ),
      accumulatedReturnVariations:
        accumulatedReturnFromVariations !== null
          ? parseFloat(accumulatedReturnFromVariations.toFixed(2))
          : null,
      accumulatedReturnVariationsPercent:
        accumulatedReturnVariationsPercent !== null
          ? parseFloat(accumulatedReturnVariationsPercent.toFixed(2))
          : null,
      accumulatedReturnSource,
      accumulatedReturnDiff:
        accumulatedReturnDiff !== null
          ? parseFloat(accumulatedReturnDiff.toFixed(2))
          : null,
      accumulatedReturnThreshold: parseFloat(
        accumulatedReturnThreshold.toFixed(2),
      ),
      accumulatedReturnThresholdValue: parseFloat(
        accumulatedReturnThresholdValue.toFixed(2),
      ),
      accumulatedReturnThresholdReturn: parseFloat(
        accumulatedReturnThresholdReturn.toFixed(2),
      ),
      totalContributedCapital: parseFloat(totalContributedCapital.toFixed(2)),
      totalWithdrawnCapital: parseFloat(totalWithdrawnCapital.toFixed(2)),
      netInvestedCapital: parseFloat(netInvestedCapital.toFixed(2)),
      actualYearStartValue: parseFloat(actualYearStartValue.toFixed(2)),
      netInvestedBeforeYear: parseFloat(netInvestedBeforeYear.toFixed(2)),
      returnBeforeYear: parseFloat(returnBeforeYear.toFixed(2)),
      accumulatedReturnCheck: parseFloat(accumulatedReturnCheck.toFixed(2)),
      accumulatedReturnCheckDiff: parseFloat(
        accumulatedReturnCheckDiff.toFixed(2),
      ),
      annualReturn: parseFloat(annualReturn.toFixed(2)),
      annualReturnPercent: parseFloat(annualReturnPercent.toFixed(2)),
      annualReturnCapital: parseFloat(annualReturnCapital.toFixed(2)),
      dailyReturn: parseFloat(dailyReturn.toFixed(2)),
      dailyReturnPercent: parseFloat(dailyReturnPercent.toFixed(2)),
      quarterlyReturn: parseFloat(quarterlyReturn.toFixed(2)),
      quarterlyReturnPercent: parseFloat(quarterlyReturnPercent.toFixed(2)),
      monthlyReturn: parseFloat(monthlyReturn.toFixed(2)),
      monthlyReturnPercent: parseFloat(monthlyReturnPercent.toFixed(2)),
      initialValue: parseFloat(initialValue.toFixed(2)),
      initialCapital: parseFloat(initialCapital.toFixed(2)),
      additionalCapital: parseFloat(additionalCapital.toFixed(2)),
      currentValue: parseFloat(currentValue.toFixed(2)),
      yearStartValue: parseFloat(yearStartValue.toFixed(2)),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      years: parseFloat(years.toFixed(2)),
      sp500Comparison,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
