import DailyVariation from '../models/DailyVariation.js';
import InvestmentHistory from '../models/InvestmentHistory.js';

/**
 * Calcula y guarda la variación diaria de una inversión
 * Usa una colección ligera (DailyVariation) en lugar de InvestmentHistory
 */
export async function saveDailyVariation(investmentId, userId, currentTotalValue) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Buscar el registro más reciente anterior a hoy
    // Primero intentamos en DailyVariation (más eficiente)
    let previousEntry = await DailyVariation.findOne({
      investment: investmentId,
      user: userId,
      date: { $lt: today },
    })
      .sort({ date: -1 })
      .limit(1);

    // Si no hay en DailyVariation, buscar en InvestmentHistory como fallback
    if (!previousEntry) {
      const historyEntry = await InvestmentHistory.findOne({
        investment: investmentId,
        user: userId,
        date: { $lt: today },
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
      operation: { $in: ['add', 'sell', 'withdraw'] },
    });
    
    // Calcular el capital añadido/retirado hoy
    let capitalChangeToday = 0;
    for (const op of todayOperations) {
      if (op.operation === 'add') {
        capitalChangeToday += op.operationAmount || 0;
      } else if (op.operation === 'sell' || op.operation === 'withdraw') {
        capitalChangeToday -= Math.abs(op.operationAmount || 0);
      }
    }
    
    // Calcular variación
    // La variación debe ser el cambio de valor menos el capital añadido/retirado
    // Esto da la variación pura del precio, sin contar el capital añadido
    let changeAmount = 0;
    let changePercent = 0;

    if (previousEntry && previousEntry.totalValue) {
      // Variación = (Valor actual - Capital añadido hoy) - Valor ayer
      const valueChange = currentTotalValue - previousEntry.totalValue;
      changeAmount = valueChange - capitalChangeToday;
      changePercent = previousEntry.totalValue !== 0 
        ? (changeAmount / previousEntry.totalValue) * 100 
        : 0;
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
      }
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
export async function getDailyVariations(investmentId, userId, startDate, endDate) {
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

    return await DailyVariation.find(query)
      .sort({ date: 1 });
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
