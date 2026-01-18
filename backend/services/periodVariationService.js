import DailyVariation from "../models/DailyVariation.js";
import PeriodVariation from "../models/PeriodVariation.js";
import Investment from "../models/Investment.js";

/**
 * Calcula y guarda la variación de un período (mensual, trimestral o anual)
 * Suma todas las variaciones diarias del período
 * IMPORTANTE: Las variaciones diarias ya excluyen aportes/retiros, así que solo sumamos
 */
export async function calculateAndSavePeriodVariation(
  userId,
  periodType, // 'monthly', 'quarterly', 'annual'
  periodStart,
  periodEnd,
) {
  try {
    // Obtener todas las inversiones activas del usuario
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      return {
        success: false,
        message: "No hay inversiones para calcular",
      };
    }

    const investmentIds = investments.map((inv) => inv._id);

    // Obtener todas las variaciones diarias del período
    const dailyVariations = await DailyVariation.find({
      user: userId,
      investment: { $in: investmentIds },
      date: { $gte: periodStart, $lte: periodEnd },
    }).sort({ date: 1 });

    if (dailyVariations.length === 0) {
      return {
        success: false,
        message: "No hay variaciones diarias en el período",
      };
    }

    // Calcular el valor al inicio del período
    // Buscar las variaciones del día anterior al inicio del período
    const dayBeforeStart = new Date(periodStart);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
    dayBeforeStart.setHours(0, 0, 0, 0);
    const dayBeforeStartEnd = new Date(dayBeforeStart);
    dayBeforeStartEnd.setDate(dayBeforeStartEnd.getDate() + 1);

    const variationsBeforeStart = await DailyVariation.find({
      user: userId,
      investment: { $in: investmentIds },
      date: { $gte: dayBeforeStart, $lt: dayBeforeStartEnd },
    });

    let startValue = 0;
    if (variationsBeforeStart.length > 0) {
      // Usar el valor del día anterior
      variationsBeforeStart.forEach((v) => {
        startValue += v.totalValue || 0;
      });
    } else {
      // Si no hay variaciones del día anterior, buscar la más reciente anterior al inicio
      const lastVariationBeforeStart = await DailyVariation.findOne({
        user: userId,
        investment: { $in: investmentIds },
        date: { $lt: periodStart },
      })
        .sort({ date: -1 })
        .limit(1)
        .select("date");

      if (lastVariationBeforeStart) {
        const lastDate = new Date(lastVariationBeforeStart.date);
        lastDate.setHours(0, 0, 0, 0);
        const lastDateEnd = new Date(lastDate);
        lastDateEnd.setDate(lastDateEnd.getDate() + 1);

        const variationsAtLastDate = await DailyVariation.find({
          user: userId,
          investment: { $in: investmentIds },
          date: { $gte: lastDate, $lt: lastDateEnd },
        });

        variationsAtLastDate.forEach((v) => {
          startValue += v.totalValue || 0;
        });
      } else {
        // Si no hay variaciones anteriores, calcular desde el valor actual menos las variaciones del período
        // Esto es un fallback
        let endValue = 0;
        const lastDayVariations = dailyVariations.filter((v) => {
          const vDate = new Date(v.date);
          vDate.setHours(0, 0, 0, 0);
          const periodEndDate = new Date(periodEnd);
          periodEndDate.setHours(0, 0, 0, 0);
          return vDate.getTime() === periodEndDate.getTime();
        });

        if (lastDayVariations.length > 0) {
          lastDayVariations.forEach((v) => {
            endValue += v.totalValue || 0;
          });
        }

        // Calcular startValue restando las variaciones del período
        let totalChange = 0;
        dailyVariations.forEach((v) => {
          if (v.changeAmount !== null && v.changeAmount !== undefined) {
            totalChange += v.changeAmount;
          }
        });

        startValue = endValue - totalChange;
      }
    }

    // Calcular el valor al final del período
    const periodEndDate = new Date(periodEnd);
    periodEndDate.setHours(0, 0, 0, 0);
    const periodEndDateEnd = new Date(periodEndDate);
    periodEndDateEnd.setDate(periodEndDateEnd.getDate() + 1);

    const variationsAtEnd = await DailyVariation.find({
      user: userId,
      investment: { $in: investmentIds },
      date: { $gte: periodEndDate, $lt: periodEndDateEnd },
    });

    let endValue = 0;
    if (variationsAtEnd.length > 0) {
      variationsAtEnd.forEach((v) => {
        endValue += v.totalValue || 0;
      });
    } else {
      // Si no hay variaciones del último día, usar la más reciente del período
      const lastVariationInPeriod = dailyVariations[dailyVariations.length - 1];
      if (lastVariationInPeriod) {
        // Buscar todas las variaciones de ese día
        const lastDate = new Date(lastVariationInPeriod.date);
        lastDate.setHours(0, 0, 0, 0);
        const lastDateEnd = new Date(lastDate);
        lastDateEnd.setDate(lastDateEnd.getDate() + 1);

        const variationsAtLastDate = await DailyVariation.find({
          user: userId,
          investment: { $in: investmentIds },
          date: { $gte: lastDate, $lt: lastDateEnd },
        });

        variationsAtLastDate.forEach((v) => {
          endValue += v.totalValue || 0;
        });
      }
    }

    // Sumar todas las variaciones diarias del período
    // IMPORTANTE: Estas ya excluyen aportes/retiros
    let totalChangeAmount = 0;
    const investmentsInPeriod = new Set();

    dailyVariations.forEach((v) => {
      if (v.changeAmount !== null && v.changeAmount !== undefined) {
        totalChangeAmount += v.changeAmount;
        investmentsInPeriod.add(v.investment.toString());
      }
    });

    // Calcular el porcentaje
    const changePercent =
      startValue > 0 ? (totalChangeAmount / startValue) * 100 : 0;

    // Guardar o actualizar la variación del período
    await PeriodVariation.findOneAndUpdate(
      {
        user: userId,
        periodType,
        periodStart,
      },
      {
        user: userId,
        periodType,
        periodStart,
        periodEnd,
        totalChangeAmount: parseFloat(totalChangeAmount.toFixed(2)),
        startValue: parseFloat(startValue.toFixed(2)),
        endValue: parseFloat(endValue.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        investmentCount: investmentsInPeriod.size,
      },
      {
        upsert: true,
        new: true,
      },
    );

    return {
      success: true,
      totalChangeAmount: parseFloat(totalChangeAmount.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      startValue: parseFloat(startValue.toFixed(2)),
      endValue: parseFloat(endValue.toFixed(2)),
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
}

/**
 * Obtiene la variación de un período específico
 */
export async function getPeriodVariation(userId, periodType, periodStart) {
  try {
    return await PeriodVariation.findOne({
      user: userId,
      periodType,
      periodStart,
    });
  } catch (error) {
    return null;
  }
}

/**
 * Recalcula todas las variaciones de período para un usuario
 * Útil cuando se corrigen datos históricos
 */
export async function recalculateAllPeriodVariations(userId) {
  try {
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      return { success: false, message: "No hay inversiones" };
    }

    // Obtener la fecha más antigua
    let oldestDate = new Date();
    investments.forEach((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      if (purchaseDate < oldestDate) {
        oldestDate = purchaseDate;
      }
    });

    oldestDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let calculated = 0;

    // Calcular variaciones mensuales
    const currentDate = new Date(oldestDate);
    while (currentDate <= today) {
      const monthStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );
      monthEnd.setHours(23, 59, 59, 999);

      await calculateAndSavePeriodVariation(
        userId,
        "monthly",
        monthStart,
        monthEnd,
      );
      calculated++;

      // Avanzar al siguiente mes
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Calcular variaciones trimestrales
    const quarterDate = new Date(oldestDate);
    while (quarterDate <= today) {
      const quarter = Math.floor(quarterDate.getMonth() / 3);
      const quarterStart = new Date(quarterDate.getFullYear(), quarter * 3, 1);
      quarterStart.setHours(0, 0, 0, 0);

      const quarterEnd = new Date(
        quarterDate.getFullYear(),
        (quarter + 1) * 3,
        0,
      );
      quarterEnd.setHours(23, 59, 59, 999);

      await calculateAndSavePeriodVariation(
        userId,
        "quarterly",
        quarterStart,
        quarterEnd,
      );
      calculated++;

      // Avanzar al siguiente trimestre
      quarterDate.setMonth(quarterDate.getMonth() + 3);
    }

    // Calcular variaciones anuales
    const yearDate = new Date(oldestDate);
    while (yearDate <= today) {
      const yearStart = new Date(yearDate.getFullYear(), 0, 1);
      yearStart.setHours(0, 0, 0, 0);

      const yearEnd = new Date(yearDate.getFullYear(), 11, 31);
      yearEnd.setHours(23, 59, 59, 999);

      await calculateAndSavePeriodVariation(
        userId,
        "annual",
        yearStart,
        yearEnd,
      );
      calculated++;

      // Avanzar al siguiente año
      yearDate.setFullYear(yearDate.getFullYear() + 1);
    }

    return {
      success: true,
      calculated,
      message: `Variaciones calculadas: ${calculated} períodos`,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
}
