import PeriodVariation from "../models/PeriodVariation.js";
import Investment from "../models/Investment.js";
import { getPortfolioPeriodReturn } from "./portfolioReturnService.js";

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

    const { totalChange, percent, startValue, endValue } =
      await getPortfolioPeriodReturn(
        userId,
        investmentIds,
        periodStart,
        periodEnd,
      );

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
        totalChangeAmount: parseFloat(totalChange.toFixed(2)),
        startValue: parseFloat(startValue.toFixed(2)),
        endValue: parseFloat(endValue.toFixed(2)),
        changePercent: parseFloat(percent.toFixed(2)),
        investmentCount: investmentIds.length,
      },
      {
        upsert: true,
        new: true,
      },
    );

    return {
      success: true,
      totalChangeAmount: parseFloat(totalChange.toFixed(2)),
      changePercent: parseFloat(percent.toFixed(2)),
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
