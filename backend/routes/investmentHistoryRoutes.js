import express from "express";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Investment from "../models/Investment.js";
import DailyVariation from "../models/DailyVariation.js";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import {
  saveDailyVariation,
  getDailyVariations,
  recalculateDailyVariationsForInvestmentFromDate,
  calculateDailyChangeFromHistory,
} from "../services/dailyVariationService.js";
import {
  migrateExistingDailyVariations,
  calculateHistoricalVariations,
} from "../services/historicalVariationService.js";
import {
  normalizeDay,
  resolveOperationAmount,
  getSignedOperationAmount,
} from "../services/variationEngine.js";

const router = express.Router();

// Función helper para calcular diferencias respecto al día anterior
async function calculateDailyChanges(
  investmentId,
  userId,
  currentTotalValue,
  date,
) {
  return await calculateDailyChangeFromHistory(
    investmentId,
    userId,
    currentTotalValue,
    date || new Date(),
  );
}

const getAllocationKey = (accountId, subAccountId) =>
  `${accountId?.toString?.() || accountId}-${subAccountId?.toString?.() || subAccountId || "none"}`;

const ensureInvestmentAllocations = (investment) => {
  if (Array.isArray(investment.allocations) && investment.allocations.length) {
    return;
  }
  const accountId = investment.account?._id || investment.account;
  if (!accountId) return;
  const amount = investment.isAutomatedPortfolio
    ? investment.quantity || 0
    : (investment.quantity || 0) *
      (investment.averagePurchasePrice || investment.purchasePrice || 0);
  investment.allocations = [
    {
      account: accountId,
      subAccount: investment.subAccount?._id || investment.subAccount || null,
      amount: Number(amount) || 0,
    },
  ];
};

const adjustAllocationAmount = (investment, accountId, subAccountId, delta) => {
  if (!accountId || !delta) return;
  if (!Array.isArray(investment.allocations)) {
    investment.allocations = [];
  }
  const key = getAllocationKey(accountId, subAccountId);
  const existing = investment.allocations.find(
    (allocation) =>
      getAllocationKey(allocation.account, allocation.subAccount) === key,
  );
  if (existing) {
    existing.amount = (Number(existing.amount) || 0) + delta;
    if (existing.amount <= 0) {
      investment.allocations = investment.allocations.filter(
        (allocation) =>
          getAllocationKey(allocation.account, allocation.subAccount) !== key,
      );
    }
    return;
  }
  if (delta > 0) {
    investment.allocations.push({
      account: accountId,
      subAccount: subAccountId || null,
      amount: delta,
    });
  }
};

const validateHistoryAccountSelection = async (
  accountId,
  subAccountId,
  userId,
) => {
  if (!accountId) {
    return { error: "Debe especificar una cuenta" };
  }
  const account = await Account.findOne({ _id: accountId, user: userId });
  if (!account) {
    return { error: "Cuenta no encontrada" };
  }

  if (subAccountId) {
    const subAccount = await SubAccount.findOne({
      _id: subAccountId,
      user: userId,
    });
    if (!subAccount) {
      return { error: "Subcuenta no encontrada" };
    }
    if (subAccount.type !== "investment") {
      return { error: "La subcuenta debe ser de tipo inversión" };
    }
    const subAccountAccountId =
      subAccount.account?._id?.toString() || subAccount.account?.toString();
    if (subAccountAccountId !== accountId.toString()) {
      return { error: "La subcuenta no pertenece a la cuenta seleccionada" };
    }
  }

  return { account: accountId, subAccount: subAccountId || null };
};

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET historial de una inversión
router.get("/investment/:investmentId", async (req, res) => {
  try {
    const { investmentId } = req.params;
    const { startDate, endDate, limit } = req.query;

    // Verificar que la inversión pertenece al usuario
    const investment = await Investment.findOne({
      _id: investmentId,
      user: req.userId,
    });
    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    const query = { investment: investmentId, user: req.userId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const history = await InvestmentHistory.find(query)
      .sort({ date: 1 })
      .limit(limit ? parseInt(limit) : 0);

    // Obtener variaciones diarias y combinarlas con el historial
    const dailyVariations = await getDailyVariations(
      investmentId,
      req.userId,
      startDate,
      endDate,
    );

    // Combinar historial con variaciones diarias
    // Las variaciones diarias tienen prioridad sobre los campos dailyChangeAmount/Percent del historial
    const historyWithVariations = history.map((entry) => {
      const variation = dailyVariations.find((v) => {
        const vDate = new Date(v.date);
        const eDate = new Date(entry.date);
        return vDate.getTime() === eDate.getTime();
      });

      if (variation) {
        return {
          ...entry.toObject(),
          dailyChangeAmount: variation.changeAmount,
          dailyChangePercent: variation.changePercent,
        };
      }
      return entry;
    });

    res.json(historyWithVariations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET variaciones diarias de una inversión (para gráficas)
router.get("/investment/:investmentId/daily-variations", async (req, res) => {
  try {
    const { investmentId } = req.params;
    const { startDate, endDate, limit } = req.query;

    // Verificar que la inversión pertenece al usuario
    const investment = await Investment.findOne({
      _id: investmentId,
      user: req.userId,
    });
    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    // Obtener variaciones diarias
    let variations = await getDailyVariations(
      investmentId,
      req.userId,
      startDate,
      endDate,
    );

    // Calcular el valor actual en tiempo real
    const currentTotalValue = investment.isAutomatedPortfolio
      ? investment.currentPrice
      : investment.quantity * investment.currentPrice;

    // Verificar si hay variación para hoy
    const today = normalizeDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayVariationIndex = variations.findIndex((v) => {
      const vDate = new Date(v.date);
      vDate.setHours(0, 0, 0, 0);
      return vDate.getTime() === today.getTime();
    });

    // Buscar el valor del día anterior usando DailyVariation
    let previousEntry = await DailyVariation.findOne({
      investment: investmentId,
      user: req.userId,
      date: { $lt: today },
    })
      .sort({ date: -1 })
      .limit(1);

    // Si no hay en DailyVariation, buscar en InvestmentHistory como fallback
    if (!previousEntry) {
      const historyEntry = await InvestmentHistory.findOne({
        investment: investmentId,
        user: req.userId,
        date: { $lt: today },
        totalValue: { $exists: true, $ne: null },
      })
        .sort({ date: -1 })
        .limit(1);

      if (historyEntry && historyEntry.totalValue) {
        previousEntry = {
          totalValue: historyEntry.totalValue,
          date: historyEntry.date,
        };
      }
    }

    // Verificar operaciones de capital hoy
    const todayOperations = await InvestmentHistory.find({
      investment: investmentId,
      user: req.userId,
      date: { $gte: today, $lt: tomorrow },
    });

    let capitalChangeToday = 0;
    for (const op of todayOperations) {
      capitalChangeToday += getSignedOperationAmount(op);
    }

    let todayChangeAmount = 0;
    let todayChangePercent = 0;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let canComputeDailyChange = false;
    if (previousEntry && previousEntry.totalValue && previousEntry.date) {
      const prevDate = normalizeDay(previousEntry.date);
      canComputeDailyChange = prevDate.getTime() === yesterday.getTime();
    }

    if (canComputeDailyChange) {
      const valueChange = currentTotalValue - previousEntry.totalValue;
      todayChangeAmount = valueChange - capitalChangeToday;
      todayChangePercent =
        previousEntry.totalValue !== 0
          ? (todayChangeAmount / previousEntry.totalValue) * 100
          : 0;
    } else {
      todayChangeAmount = 0;
      todayChangePercent = 0;
    }

    // Si ya existe una variación para hoy, actualizarla con los valores en tiempo real
    // Si no existe, crear una nueva entrada para hoy
    if (todayVariationIndex >= 0) {
      // Actualizar la variación existente con valores en tiempo real
      variations[todayVariationIndex].totalValue = currentTotalValue;
      variations[todayVariationIndex].changeAmount = parseFloat(
        todayChangeAmount.toFixed(2),
      );
      variations[todayVariationIndex].changePercent = parseFloat(
        todayChangePercent.toFixed(2),
      );
    } else {
      // Crear nueva entrada para hoy con valores en tiempo real
      variations.push({
        date: today,
        totalValue: currentTotalValue,
        changeAmount: parseFloat(todayChangeAmount.toFixed(2)),
        changePercent: parseFloat(todayChangePercent.toFixed(2)),
      });

      // Ordenar por fecha
      variations.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // Aplicar límite si se especifica
    let result = variations;
    if (limit) {
      result = variations.slice(-parseInt(limit));
    }

    // Formatear para el frontend (mantener compatibilidad con el formato anterior)
    const formattedVariations = result.map((v) => ({
      date: v.date instanceof Date ? v.date.toISOString() : v.date,
      totalValue: v.totalValue,
      dailyChangeAmount: v.changeAmount,
      dailyChangePercent: v.changePercent,
    }));

    res.json(formattedVariations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva entrada de historial
router.post("/", async (req, res) => {
  try {
    const { investmentId, date, currentPrice, quantity, notes } = req.body;

    // Verificar que la inversión existe y pertenece al usuario
    const investment = await Investment.findOne({
      _id: investmentId,
      user: req.userId,
    });
    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    const operation = req.body.operation || "update";
    if (investment.status === "closed" && operation === "update") {
      return res.status(400).json({
        message:
          "No se pueden registrar actualizaciones en una inversión cerrada",
      });
    }
    const entryDate = date ? new Date(date) : new Date();
    entryDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(entryDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Regla: UNA cotización por día y por inversión.
    // Si la operación es 'update' y ya existe una entrada de ese día,
    // la nueva actualización pisa a la anterior (no se crea otra fila).
    if (operation === "update") {
      const existingSameDayEntry = await InvestmentHistory.findOne({
        user: req.userId,
        investment: investmentId,
        date: { $gte: entryDate, $lt: nextDay },
        operation: "update",
      }).sort({ date: -1 });

      const resolveOperationAmount = (op, totalValueToUse) => {
        if (req.body.operationAmount !== undefined) {
          return req.body.operationAmount;
        }
        if (req.body.operationPrice && quantity) {
          return req.body.operationPrice * quantity;
        }
        if (op === "creation" && totalValueToUse) {
          return totalValueToUse;
        }
        return undefined;
      };

      if (existingSameDayEntry) {
        // Calcular el valor total con los nuevos datos
        let totalValueUpdate;
        if (investment.isAutomatedPortfolio) {
          totalValueUpdate = currentPrice;
        } else {
          totalValueUpdate = quantity * currentPrice;
        }

        // Recalcular diferencias respecto al día anterior
        const dailyChangesUpdate = await calculateDailyChanges(
          investmentId,
          req.userId,
          totalValueUpdate,
          date || existingSameDayEntry.date,
        );

        existingSameDayEntry.date = date || existingSameDayEntry.date;
        existingSameDayEntry.currentPrice = currentPrice;
        existingSameDayEntry.quantity = quantity;
        existingSameDayEntry.totalValue = totalValueUpdate;
        existingSameDayEntry.notes = notes;
        existingSameDayEntry.operationAmount = resolveOperationAmount(
          operation,
          totalValueUpdate,
        );
        existingSameDayEntry.operationPrice = req.body.operationPrice;
        existingSameDayEntry.dailyChangeAmount =
          dailyChangesUpdate.dailyChangeAmount;
        existingSameDayEntry.dailyChangePercent =
          dailyChangesUpdate.dailyChangePercent;

        const updatedEntry = await existingSameDayEntry.save();

        // Actualizar la inversión con los nuevos valores
        investment.currentPrice = currentPrice;
        investment.quantity = quantity;
        await investment.save();

        await recalculateDailyVariationsForInvestmentFromDate(
          investmentId,
          req.userId,
          existingSameDayEntry.date || new Date(),
        );
        return res.status(200).json(updatedEntry);
      }
    }

    // Si no hay entrada previa ese día (o no es 'update'), crear una nueva
    // Calcular el valor total
    let totalValue;
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas, currentPrice ya es el valor total
      totalValue = currentPrice;
    } else {
      // Para tradicionales, cantidad * precio unitario
      totalValue = quantity * currentPrice;
    }

    // Calcular diferencias respecto al día anterior
    const dailyChanges = await calculateDailyChanges(
      investmentId,
      req.userId,
      totalValue,
      date || new Date(),
    );

    // Crear entrada de historial
    const historyEntry = new InvestmentHistory({
      user: req.userId,
      investment: investmentId,
      date: date || new Date(),
      currentPrice,
      quantity,
      totalValue,
      notes,
      operation,
      operationAmount: resolveOperationAmount(operation, totalValue),
      operationPrice: req.body.operationPrice,
      dailyChangeAmount: dailyChanges.dailyChangeAmount,
      dailyChangePercent: dailyChanges.dailyChangePercent,
    });

    const savedEntry = await historyEntry.save();

    // Actualizar la inversión con los nuevos valores
    investment.currentPrice = currentPrice;
    investment.quantity = quantity;
    await investment.save();

    await recalculateDailyVariationsForInvestmentFromDate(
      investmentId,
      req.userId,
      historyEntry.date || new Date(),
    );
    res.status(201).json(savedEntry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// GET historial de todas las inversiones (para gráficas generales)
router.get("/all", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = { user: req.userId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const history = await InvestmentHistory.find(query)
      .populate({
        path: "investment",
        select: "name symbol type isAutomatedPortfolio currency",
        match: { user: req.userId },
      })
      .sort({ date: 1 });

    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET resumen de evolución de inversiones (agrupado por fecha)
router.get("/evolution", async (req, res) => {
  try {
    // Importar DailyVariation
    const DailyVariation = (await import("../models/DailyVariation.js"))
      .default;

    // Obtener todas las inversiones ACTIVAS del usuario (solo las que existen actualmente)
    const investments = await Investment.find({
      user: req.userId,
      status: { $ne: "closed" },
      $or: [
        { account: { $exists: true, $ne: null } },
        { "allocations.0": { $exists: true } },
      ],
    });

    if (investments.length === 0) {
      return res.json([]);
    }

    // IMPORTANTE: Solo considerar operaciones de inversiones ACTIVAS
    const activeInvestmentIds = investments.map((inv) => inv._id);

    // Encontrar la fecha de la primera inversión ACTIVA (primera operación 'creation' con operationAmount)
    const firstCreation = await InvestmentHistory.findOne({
      user: req.userId,
      investment: { $in: activeInvestmentIds }, // Solo inversiones activas
      operation: "creation",
      operationAmount: { $exists: true, $ne: null },
    }).sort({ date: 1 });

    if (!firstCreation) {
      return res.json([]);
    }

    // Usar la fecha de la primera inversión como inicio
    const startDate = new Date(firstCreation.date);
    startDate.setHours(0, 0, 0, 0);

    // Obtener TODAS las entradas de historial de una vez para optimizar
    // IMPORTANTE: dejamos de usar DailyVariation aquí para evitar arrastrar datos antiguos o inconsistentes
    // El valor histórico se recalcula siempre a partir de InvestmentHistory + estado actual de Investment
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const allHistoryEntries = await InvestmentHistory.find({
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
    }).sort({ date: 1, investment: 1 });

    // Generar todas las fechas desde la primera inversión hasta hoy
    const dates = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Para cada fecha, calcular el valor acumulado de TODAS las inversiones que existían hasta ese momento
    const result = [];

    // Calcular el valor actual del modelo Investment (solo para el último día)
    const currentInvestmentValues = new Map();
    investments.forEach((inv) => {
      const currentValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentInvestmentValues.set(inv._id.toString(), currentValue);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const date of dates) {
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      const dateKey = date.toISOString().split("T")[0];
      const isToday = dateKey === today.toISOString().split("T")[0];

      let totalValue = 0;

      // Para cada inversión, buscar su valor más reciente hasta esta fecha
      for (const inv of investments) {
        // Verificar si esta inversión existía en esta fecha
        const purchaseDate = new Date(inv.purchaseDate);
        if (purchaseDate > dateEnd) {
          continue; // Esta inversión no existía aún
        }

        let invValue = 0;

        // Calcular días desde hoy
        const daysSinceToday = Math.floor(
          (today - date) / (1000 * 60 * 60 * 24),
        );

        // Si es el día de hoy o estamos en los últimos 3 días, usar el valor actual del modelo Investment
        // Esto asegura que los últimos días tengan valores consistentes y actualizados
        if (isToday || daysSinceToday <= 3) {
          invValue = currentInvestmentValues.get(inv._id.toString()) || 0;
        } else {
          // Para días más antiguos, usar exclusivamente InvestmentHistory
          // De esta forma, si borras/ajustas cotizaciones antiguas, el Dashboard se actualiza en tiempo real
          const lastHistory = allHistoryEntries
            .filter(
              (h) =>
                h.investment.toString() === inv._id.toString() &&
                h.date <= dateEnd &&
                h.totalValue &&
                h.totalValue > 0,
            )
            .sort((a, b) => b.date - a.date)[0];

          if (lastHistory && lastHistory.totalValue) {
            invValue = lastHistory.totalValue;
          } else {
            // Si no hay datos históricos, calcular el capital invertido hasta esta fecha
            const capitalOperations = allHistoryEntries.filter(
              (h) =>
                h.investment.toString() === inv._id.toString() &&
                h.date <= dateEnd &&
                ["creation", "add", "withdraw"].includes(h.operation) &&
                h.operationAmount,
            );

            let capital = 0;
            capitalOperations.forEach((op) => {
              if (op.operation === "creation" || op.operation === "add") {
                capital += op.operationAmount || 0;
              } else if (op.operation === "withdraw") {
                capital -= Math.abs(op.operationAmount || 0);
              }
            });

            if (capital > 0) {
              invValue = capital;
            }
          }
        }

        totalValue += invValue;
      }

      result.push({
        date: dateKey,
        totalValue: totalValue,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT actualizar entrada de historial
router.put("/:id", async (req, res) => {
  try {
    const {
      date,
      currentPrice,
      quantity,
      notes,
      operation,
      operationAmount,
      operationPrice,
      account,
      subAccount,
    } = req.body;

    const historyEntry = await InvestmentHistory.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!historyEntry) {
      return res
        .status(404)
        .json({ message: "Entrada de historial no encontrada" });
    }

    // Verificar que la inversión existe y pertenece al usuario
    const investment = await Investment.findOne({
      _id: historyEntry.investment,
      user: req.userId,
    });
    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    const previousOperation = historyEntry.operation;
    const previousAccount = historyEntry.account;
    const previousSubAccount = historyEntry.subAccount;
    const previousAmount = resolveOperationAmount(historyEntry);

    const operationToUse = operation ?? historyEntry.operation;
    const requiresAccount = ["creation", "add", "withdraw"].includes(
      operationToUse,
    );

    if (requiresAccount) {
      const targetAccount = account ?? historyEntry.account;
      const targetSubAccount = subAccount ?? historyEntry.subAccount;
      const validation = await validateHistoryAccountSelection(
        targetAccount,
        targetSubAccount,
        req.userId,
      );
      if (validation.error) {
        return res.status(400).json({ message: validation.error });
      }
      historyEntry.account = validation.account;
      historyEntry.subAccount = validation.subAccount;
    } else {
      historyEntry.account = null;
      historyEntry.subAccount = null;
    }

    // Actualizar campos
    if (date !== undefined) historyEntry.date = date;
    if (currentPrice !== undefined) historyEntry.currentPrice = currentPrice;
    if (quantity !== undefined) historyEntry.quantity = quantity;
    if (notes !== undefined) historyEntry.notes = notes;
    if (operation !== undefined) historyEntry.operation = operation;
    if (operationAmount !== undefined)
      historyEntry.operationAmount = operationAmount;
    if (operationPrice !== undefined)
      historyEntry.operationPrice = operationPrice;

    // Recalcular totalValue
    if (currentPrice !== undefined || quantity !== undefined) {
      if (investment.isAutomatedPortfolio) {
        historyEntry.totalValue = historyEntry.currentPrice;
      } else {
        historyEntry.totalValue =
          historyEntry.quantity * historyEntry.currentPrice;
      }

      // Recalcular diferencias diarias
      const dailyChanges = await calculateDailyChanges(
        historyEntry.investment,
        req.userId,
        historyEntry.totalValue,
        historyEntry.date,
      );
      historyEntry.dailyChangeAmount = dailyChanges.dailyChangeAmount;
      historyEntry.dailyChangePercent = dailyChanges.dailyChangePercent;
    }

    const nextOperation = historyEntry.operation;
    const nextAmount = resolveOperationAmount(historyEntry);
    const previousSigned = getSignedOperationAmount({
      operation: previousOperation,
      operationAmount: previousAmount,
    });
    const nextSigned = getSignedOperationAmount({
      operation: nextOperation,
      operationAmount: nextAmount,
    });

    if (previousSigned !== 0 || nextSigned !== 0) {
      ensureInvestmentAllocations(investment);
      adjustAllocationAmount(
        investment,
        previousAccount,
        previousSubAccount,
        -previousSigned,
      );
      adjustAllocationAmount(
        investment,
        historyEntry.account,
        historyEntry.subAccount,
        nextSigned,
      );
      if (
        Array.isArray(investment.allocations) &&
        investment.allocations.length
      ) {
        investment.account = investment.allocations[0].account;
        investment.subAccount =
          investment.allocations[0].subAccount || undefined;
      }
      await investment.save();
    }

    await historyEntry.save();
    res.json(historyEntry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar entrada de historial
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await InvestmentHistory.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!deleted) {
      return res
        .status(404)
        .json({ message: "Entrada de historial no encontrada" });
    }
    await InvestmentHistory.findByIdAndDelete(req.params.id);
    res.json({ message: "Entrada de historial eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST registrar valores diarios de todas las inversiones
// Este endpoint registra el valor actual de todas las inversiones del usuario
// Solo crea una entrada por inversión si no existe ya una entrada para hoy
router.post("/register-daily-values", async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario
    const investments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      return res.json({
        message: "No hay inversiones para registrar",
        registered: 0,
        skipped: 0,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let registered = 0;

    // Registrar valor diario para cada inversión
    for (const investment of investments) {
      try {
        // Calcular el valor total
        const totalValue = investment.isAutomatedPortfolio
          ? investment.currentPrice
          : investment.quantity * investment.currentPrice;

        // Guardar variación diaria en la colección ligera
        await saveDailyVariation(investment._id, req.userId, totalValue);
        registered++;
      } catch (error) {
        // Continuar con la siguiente inversión
      }
    }

    res.json({
      message: `Valores diarios registrados/actualizados: ${registered} de ${investments.length}`,
      registered,
      total: investments.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST migrar variaciones diarias existentes de InvestmentHistory a DailyVariation
router.post("/migrate-daily-variations", async (req, res) => {
  try {
    const result = await migrateExistingDailyVariations(req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST calcular variaciones históricas para una inversión específica
router.post(
  "/investment/:investmentId/calculate-historical",
  async (req, res) => {
    try {
      const { investmentId } = req.params;

      // Verificar que la inversión pertenece al usuario
      const investment = await Investment.findOne({
        _id: investmentId,
        user: req.userId,
      });
      if (!investment) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }

      const result = await calculateHistoricalVariations(
        investmentId,
        req.userId,
        investment,
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

export default router;
