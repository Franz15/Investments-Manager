import DailyVariation from "../models/DailyVariation.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Investment from "../models/Investment.js";

/**
 * Calcula y guarda la variación diaria de una inversión
 * Usa una colección ligera (DailyVariation) en lugar de InvestmentHistory
 */
export async function saveDailyVariation(
  investmentId,
  userId,
  currentTotalValue,
) {
  try {
    const today = normalizeDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Verificar si ya existe una entrada para hoy (puede ser una corrección manual)
    const existingTodayEntry = await DailyVariation.findOne({
      investment: investmentId,
      user: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    // Buscar el registro más reciente anterior a hoy
    // Primero intentamos en DailyVariation (más eficiente)
    let previousEntry = await DailyVariation.findOne({
      investment: investmentId,
      user: userId,
      date: { $lt: today },
      totalValue: { $ne: null, $gt: 0 },
    })
      .sort({ date: -1 })
      .limit(1);

    // Si no hay en DailyVariation, buscar en InvestmentHistory como fallback
    if (!previousEntry) {
      const historyEntry = await InvestmentHistory.findOne({
        investment: investmentId,
        user: userId,
        date: { $lt: today },
        totalValue: { $ne: null, $gt: 0 },
      })
        .sort({ date: -1 })
        .limit(1);

      if (historyEntry && historyEntry.totalValue) {
        previousEntry = {
          totalValue: historyEntry.totalValue,
        };
      }
    }

    // Verificar si hay operaciones (add/sell/withdraw) hoy que puedan afectar el cálculo
    const todayOperations = await InvestmentHistory.find({
      investment: investmentId,
      user: userId,
      date: { $gte: today, $lt: tomorrow },
      operation: { $in: ["creation", "add", "sell", "withdraw"] },
    });

    // Calcular el capital añadido/retirado hoy
    let capitalChangeToday = 0;
    for (const op of todayOperations) {
      if (op.operation === "creation" || op.operation === "add") {
        capitalChangeToday += getOperationAmount(op);
      } else if (op.operation === "sell" || op.operation === "withdraw") {
        capitalChangeToday -= Math.abs(getOperationAmount(op));
      }
    }

    // Verificar si hay una operación 'update' hoy (corrección manual)
    const todayUpdateOperations = await InvestmentHistory.find({
      investment: investmentId,
      user: userId,
      date: { $gte: today, $lt: tomorrow },
      operation: "update",
    });

    // Calcular variación
    // Si ya existe una entrada para hoy Y hay una operación 'update', es una corrección manual
    // En ese caso, recalcular la variación basándose en el día anterior (ignorando valores previos del mismo día)
    // Esto evita que las correcciones manuales se cuenten como pérdidas/ganancias
    let changeAmount = 0;
    let changePercent = 0;

    if (
      existingTodayEntry &&
      todayUpdateOperations.length > 0 &&
      previousEntry &&
      previousEntry.totalValue
    ) {
      // Corrección manual: recalcular variación basándose en el día anterior
      // Esto preserva la variación real del día, ignorando la diferencia de la corrección
      const valueChange = currentTotalValue - previousEntry.totalValue;
      changeAmount = valueChange - capitalChangeToday;
      changePercent =
        previousEntry.totalValue !== 0
          ? (changeAmount / previousEntry.totalValue) * 100
          : 0;
    } else if (previousEntry && previousEntry.totalValue) {
      // Recalcular la variación con el valor más reciente para reflejar el precio actual
      // Variación = (Valor actual - Capital añadido hoy) - Valor ayer
      const valueChange = currentTotalValue - previousEntry.totalValue;
      changeAmount = valueChange - capitalChangeToday;
      changePercent =
        previousEntry.totalValue !== 0
          ? (changeAmount / previousEntry.totalValue) * 100
          : 0;
    } else if (
      existingTodayEntry &&
      existingTodayEntry.changeAmount !== null &&
      existingTodayEntry.changeAmount !== undefined
    ) {
      // Si no hay entrada previa, preservar la variación original del día
      changeAmount = existingTodayEntry.changeAmount;
      changePercent = existingTodayEntry.changePercent;
    }

    // Guardar o actualizar en DailyVariation
    // Usar el mismo formato de fecha en el query y en el update
    const query = {
      investment: investmentId,
      user: userId,
      date: { $gte: today, $lt: tomorrow },
    };

    await DailyVariation.findOneAndUpdate(
      query,
      {
        investment: investmentId,
        user: userId,
        date: today,
        totalValue: currentTotalValue,
        changeAmount: parseFloat(changeAmount.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
      },
      {
        upsert: true,
        new: true,
      },
    );

    await upsertDailyHistoryEntry(
      investmentId,
      userId,
      today,
      currentTotalValue,
      parseFloat(changeAmount.toFixed(2)),
      parseFloat(changePercent.toFixed(2)),
    );

    return {
      changeAmount: parseFloat(changeAmount.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
    };
  } catch (error) {
    return {
      changeAmount: null,
      changePercent: null,
    };
  }
}

/**
 * Obtiene las variaciones diarias de una inversión
 */
export async function getDailyVariations(
  investmentId,
  userId,
  startDate,
  endDate,
) {
  try {
    const query = {
      investment: investmentId,
      user: userId,
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    return await DailyVariation.find(query).sort({ date: 1 });
  } catch (error) {
    return [];
  }
}

/**
 * Obtiene la variación más reciente de una inversión
 */
export async function getLatestDailyVariation(investmentId, userId) {
  try {
    return await DailyVariation.findOne({
      investment: investmentId,
      user: userId,
    })
      .sort({ date: -1 })
      .limit(1);
  } catch (error) {
    return null;
  }
}

const normalizeDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getOperationAmount = (entry) => {
  let amount = entry.operationAmount;
  if (!amount || amount === 0) {
    if (entry.operationPrice && entry.quantity) {
      amount = entry.operationPrice * entry.quantity;
    } else if (entry.operation === "creation" && entry.totalValue) {
      amount = entry.totalValue;
    }
  }
  return amount || 0;
};

const upsertDailyHistoryEntry = async (
  investmentId,
  userId,
  date,
  totalValue,
  changeAmount,
  changePercent,
) => {
  const dayStart = normalizeDay(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const existing = await InvestmentHistory.findOne({
    investment: investmentId,
    user: userId,
    date: { $gte: dayStart, $lt: dayEnd },
  }).sort({ date: -1 });

  if (existing) {
    if (existing.operation !== "update") {
      return;
    }
  }

  const investment = await Investment.findOne({
    _id: investmentId,
    user: userId,
  }).select("currentPrice quantity isAutomatedPortfolio");

  if (!investment) {
    return;
  }

  const currentPrice = investment.currentPrice || 0;
  const quantity = investment.quantity || 0;

  if (existing) {
    existing.currentPrice = currentPrice;
    existing.quantity = quantity;
    existing.totalValue = totalValue;
    existing.dailyChangeAmount =
      changeAmount !== null && changeAmount !== undefined ? changeAmount : null;
    existing.dailyChangePercent =
      changePercent !== null && changePercent !== undefined
        ? changePercent
        : null;
    await existing.save();
    return;
  }

  await InvestmentHistory.create({
    user: userId,
    investment: investmentId,
    date: dayStart,
    currentPrice: currentPrice,
    quantity: quantity,
    totalValue: totalValue,
    notes: "Auto update (daily variation)",
    operation: "update",
    dailyChangeAmount:
      changeAmount !== null && changeAmount !== undefined ? changeAmount : null,
    dailyChangePercent:
      changePercent !== null && changePercent !== undefined
        ? changePercent
        : null,
  });
};

export async function calculateDailyChangeFromHistory(
  investmentId,
  userId,
  totalValue,
  date = new Date(),
) {
  try {
    const dayStart = normalizeDay(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const previousEntry = await InvestmentHistory.findOne({
      investment: investmentId,
      user: userId,
      date: { $lt: dayStart },
      totalValue: { $ne: null, $gt: 0 },
    })
      .sort({ date: -1 })
      .limit(1);

    const dayOperations = await InvestmentHistory.find({
      investment: investmentId,
      user: userId,
      date: { $gte: dayStart, $lt: dayEnd },
      operation: { $in: ["creation", "add", "sell", "withdraw"] },
    });

    let capitalChangeToday = 0;
    for (const op of dayOperations) {
      if (op.operation === "creation" || op.operation === "add") {
        capitalChangeToday += getOperationAmount(op);
      } else if (op.operation === "sell" || op.operation === "withdraw") {
        capitalChangeToday -= Math.abs(getOperationAmount(op));
      }
    }

    if (previousEntry && previousEntry.totalValue) {
      const valueChange = totalValue - previousEntry.totalValue;
      const changeAmount = valueChange - capitalChangeToday;
      const changePercent =
        previousEntry.totalValue !== 0
          ? (changeAmount / previousEntry.totalValue) * 100
          : 0;

      return {
        dailyChangeAmount: parseFloat(changeAmount.toFixed(2)),
        dailyChangePercent: parseFloat(changePercent.toFixed(2)),
      };
    }

    return {
      dailyChangeAmount: null,
      dailyChangePercent: null,
    };
  } catch (error) {
    return {
      dailyChangeAmount: null,
      dailyChangePercent: null,
    };
  }
}

/**
 * Recalcula variaciones diarias desde el historial para una inversión y fecha
 * Útil para mantener coherencia tras add/sell/update con fecha pasada.
 */
export async function recalculateDailyVariationsForInvestmentFromDate(
  investmentId,
  userId,
  startDate,
) {
  try {
    if (!startDate) {
      return { updated: 0 };
    }

    const start = normalizeDay(startDate);
    const historyEntries = await InvestmentHistory.find({
      investment: investmentId,
      user: userId,
      totalValue: { $exists: true, $ne: null },
      date: { $gte: start },
    }).sort({ date: 1 });

    if (historyEntries.length === 0) {
      return { updated: 0 };
    }

    let previousTotalValue = null;
    const previousDaily = await DailyVariation.findOne({
      investment: investmentId,
      user: userId,
      date: { $lt: start },
      totalValue: { $ne: null, $gt: 0 },
    })
      .sort({ date: -1 })
      .limit(1);

    if (previousDaily && previousDaily.totalValue !== null) {
      previousTotalValue = previousDaily.totalValue;
    } else {
      const previousHistory = await InvestmentHistory.findOne({
        investment: investmentId,
        user: userId,
        totalValue: { $ne: null, $gt: 0 },
        date: { $lt: start },
      })
        .sort({ date: -1 })
        .limit(1);

      if (previousHistory && previousHistory.totalValue !== null) {
        previousTotalValue = previousHistory.totalValue;
      }
    }

    const dayMap = new Map();
    historyEntries.forEach((entry) => {
      const day = normalizeDay(entry.date);
      const key = day.getTime();
      const existing = dayMap.get(key) || {
        date: day,
        totalValue: null,
        capitalChange: 0,
        lastEntryDate: null,
        lastEntryStamp: null,
        lastEntry: null,
        lastUpdateStamp: null,
        lastUpdateEntry: null,
      };

      const entryStamp =
        entry.createdAt ||
        entry.updatedAt ||
        entry.date ||
        entry._id?.getTimestamp?.() ||
        null;
      if (
        !existing.lastEntryStamp ||
        (entryStamp && entryStamp > existing.lastEntryStamp)
      ) {
        existing.lastEntry = entry;
        existing.lastEntryDate = entry.date;
        existing.lastEntryStamp = entryStamp || entry.date;
      }
      if (
        entry.operation === "update" &&
        (!existing.lastUpdateStamp ||
          (entryStamp && entryStamp > existing.lastUpdateStamp))
      ) {
        existing.lastUpdateEntry = entry;
        existing.lastUpdateStamp = entryStamp || entry.date;
      }

      if (entry.operation === "creation" || entry.operation === "add") {
        existing.capitalChange += getOperationAmount(entry);
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        existing.capitalChange -= Math.abs(getOperationAmount(entry));
      }

      dayMap.set(key, existing);
    });

    const days = Array.from(dayMap.values()).sort((a, b) => a.date - b.date);
    days.forEach((day) => {
      const preferredEntry = day.lastUpdateEntry || day.lastEntry;
      if (
        preferredEntry &&
        preferredEntry.totalValue !== null &&
        preferredEntry.totalValue !== undefined
      ) {
        day.totalValue = preferredEntry.totalValue;
      }
    });

    let updated = 0;
    for (const day of days) {
      let changeAmount = 0;
      let changePercent = 0;

      if (
        previousTotalValue !== null &&
        previousTotalValue !== undefined &&
        previousTotalValue > 0
      ) {
        const valueChange = day.totalValue - previousTotalValue;
        changeAmount = valueChange - day.capitalChange;
        changePercent =
          previousTotalValue !== 0
            ? (changeAmount / previousTotalValue) * 100
            : 0;
      }

      const dayEnd = new Date(day.date);
      dayEnd.setDate(dayEnd.getDate() + 1);

      await DailyVariation.findOneAndUpdate(
        {
          investment: investmentId,
          user: userId,
          date: { $gte: day.date, $lt: dayEnd },
        },
        {
          investment: investmentId,
          user: userId,
          date: day.date,
          totalValue: day.totalValue,
          changeAmount: parseFloat(changeAmount.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
        },
        { upsert: true, new: true },
      );

      await InvestmentHistory.updateMany(
        {
          investment: investmentId,
          user: userId,
          date: { $gte: day.date, $lt: dayEnd },
        },
        {
          dailyChangeAmount: parseFloat(changeAmount.toFixed(2)),
          dailyChangePercent: parseFloat(changePercent.toFixed(2)),
        },
      );

      previousTotalValue = day.totalValue;
      updated++;
    }

    return { updated };
  } catch (error) {
    return { updated: 0, error: error.message };
  }
}
