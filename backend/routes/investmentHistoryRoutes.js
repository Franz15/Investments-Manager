import express from 'express';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';
import { saveDailyVariation, getDailyVariations } from '../services/dailyVariationService.js';
import { migrateExistingDailyVariations, calculateHistoricalVariations } from '../services/historicalVariationService.js';

const router = express.Router();

// Función helper para calcular diferencias respecto al día anterior
async function calculateDailyChanges(investmentId, userId, currentTotalValue) {
  try {
    // Buscar el registro más reciente anterior a hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const previousEntry = await InvestmentHistory.findOne({
      investment: investmentId,
      user: userId,
      date: { $lt: today },
    })
      .sort({ date: -1 })
      .limit(1);
    
    if (previousEntry && previousEntry.totalValue) {
      const changeAmount = currentTotalValue - previousEntry.totalValue;
      const changePercent = previousEntry.totalValue !== 0 
        ? (changeAmount / previousEntry.totalValue) * 100 
        : 0;
      
      return {
        dailyChangeAmount: parseFloat(changeAmount.toFixed(2)),
        dailyChangePercent: parseFloat(changePercent.toFixed(2)),
      };
    }
    
    // Si no hay registro anterior, no hay cambio
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

// Aplicar middleware a todas las rutas
router.use(getUserFromRequest);

// GET historial de una inversión
router.get('/investment/:investmentId', async (req, res) => {
  try {
    const { investmentId } = req.params;
    const { startDate, endDate, limit } = req.query;
    
    // Verificar que la inversión pertenece al usuario
    const investment = await Investment.findOne({ _id: investmentId, user: req.userId });
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
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
    const dailyVariations = await getDailyVariations(investmentId, req.userId, startDate, endDate);
    
    // Combinar historial con variaciones diarias
    // Las variaciones diarias tienen prioridad sobre los campos dailyChangeAmount/Percent del historial
    const historyWithVariations = history.map(entry => {
      const variation = dailyVariations.find(v => {
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
router.get('/investment/:investmentId/daily-variations', async (req, res) => {
  try {
    const { investmentId } = req.params;
    const { startDate, endDate, limit } = req.query;
    
    // Verificar que la inversión pertenece al usuario
    const investment = await Investment.findOne({ _id: investmentId, user: req.userId });
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    
    // Obtener variaciones diarias
    let variations = await getDailyVariations(investmentId, req.userId, startDate, endDate);
    
    // Calcular el valor actual en tiempo real
    const currentTotalValue = investment.isAutomatedPortfolio
      ? investment.currentPrice
      : investment.quantity * investment.currentPrice;
    
    // Verificar si hay variación para hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayVariationIndex = variations.findIndex(v => {
      const vDate = new Date(v.date);
      vDate.setHours(0, 0, 0, 0);
      return vDate.getTime() === today.getTime();
    });
    
    // Buscar el valor del día anterior (ayer) usando la misma lógica que saveDailyVariation
    const DailyVariation = (await import('../models/DailyVariation.js')).default;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
    
    // Buscar específicamente el día anterior (ayer)
    let previousEntry = await DailyVariation.findOne({
      investment: investmentId,
      user: req.userId,
      date: { $gte: yesterday, $lt: yesterdayEnd },
    });
    
    // Si no hay variación para ayer, intentar calcularla desde Yahoo Finance
    if (!previousEntry && investment.symbol && !investment.isAutomatedPortfolio) {
      try {
        const { getHistoricalPrices } = await import('../services/historicalVariationService.js');
        const yesterdayPrices = await getHistoricalPrices(
          investment.symbol,
          yesterday,
          yesterday
        );
        
        if (yesterdayPrices.length > 0 && yesterdayPrices[0].close) {
          const yesterdayPrice = yesterdayPrices[0].close;
          const yesterdayTotalValue = investment.quantity * yesterdayPrice;
          
          // Usar el valor calculado de ayer
          previousEntry = {
            totalValue: yesterdayTotalValue,
            date: yesterday,
          };
        }
      } catch (error) {
        // Si falla, buscar el más reciente anterior a hoy
      }
    }
    
    // Si aún no hay, buscar el más reciente anterior a hoy
    if (!previousEntry) {
      previousEntry = await DailyVariation.findOne({
        investment: investmentId,
        user: req.userId,
        date: { $lt: today },
      })
        .sort({ date: -1 })
        .limit(1);
    }
    
    // Si no hay en DailyVariation, buscar en InvestmentHistory como fallback
    if (!previousEntry) {
      const InvestmentHistory = (await import('../models/InvestmentHistory.js')).default;
      const historyEntry = await InvestmentHistory.findOne({
        investment: investmentId,
        user: req.userId,
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
    
    // Verificar si hay operaciones (add/sell) hoy que puedan afectar el cálculo
    const InvestmentHistory = (await import('../models/InvestmentHistory.js')).default;
    const todayOperations = await InvestmentHistory.find({
      investment: investmentId,
      user: req.userId,
      date: { $gte: today, $lt: tomorrow },
      operation: { $in: ['add', 'sell', 'withdraw'] },
    });
    
    // Calcular el capital añadido/retirado hoy
    let capitalChangeToday = 0;
    for (const op of todayOperations) {
      if (op.operation === 'add') {
        capitalChangeToday += op.operationAmount || (op.quantity * (op.operationPrice || 0));
      } else if (op.operation === 'sell' || op.operation === 'withdraw') {
        capitalChangeToday -= (op.operationAmount || (op.quantity * (op.operationPrice || 0)));
      }
    }
    
    // Calcular variación de hoy en tiempo real
    // La variación debe ser el cambio de valor menos el capital añadido/retirado
    let todayChangeAmount = 0;
    let todayChangePercent = 0;
    
    if (previousEntry && previousEntry.totalValue) {
      // Variación = (Valor actual - Capital añadido hoy) - Valor ayer
      // Esto da la variación pura del precio, sin contar el capital añadido
      const valueChange = currentTotalValue - previousEntry.totalValue;
      todayChangeAmount = valueChange - capitalChangeToday;
      todayChangePercent = previousEntry.totalValue !== 0 
        ? (todayChangeAmount / previousEntry.totalValue) * 100 
        : 0;
    }
    
    // Si ya existe una variación para hoy, actualizarla con los valores en tiempo real
    // Si no existe, crear una nueva entrada para hoy
    if (todayVariationIndex >= 0) {
      // Actualizar la variación existente con valores en tiempo real
      variations[todayVariationIndex].totalValue = currentTotalValue;
      variations[todayVariationIndex].changeAmount = parseFloat(todayChangeAmount.toFixed(2));
      variations[todayVariationIndex].changePercent = parseFloat(todayChangePercent.toFixed(2));
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
    const formattedVariations = result.map(v => ({
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
router.post('/', async (req, res) => {
  try {
    const { investmentId, date, currentPrice, quantity, notes } = req.body;
    
    // Verificar que la inversión existe y pertenece al usuario
    const investment = await Investment.findOne({ _id: investmentId, user: req.userId });
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    
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
    const dailyChanges = await calculateDailyChanges(investmentId, req.userId, totalValue);
    
    // Crear entrada de historial
    const historyEntry = new InvestmentHistory({
      user: req.userId,
      investment: investmentId,
      date: date || new Date(),
      currentPrice,
      quantity,
      totalValue,
      notes,
      operation: req.body.operation || 'update',
      operationAmount: req.body.operationAmount,
      operationPrice: req.body.operationPrice,
      dailyChangeAmount: dailyChanges.dailyChangeAmount,
      dailyChangePercent: dailyChanges.dailyChangePercent,
    });
    
    const savedEntry = await historyEntry.save();
    
    // Actualizar la inversión con los nuevos valores
    investment.currentPrice = currentPrice;
    investment.quantity = quantity;
    await investment.save();
    
    res.status(201).json(savedEntry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// GET historial de todas las inversiones (para gráficas generales)
router.get('/all', async (req, res) => {
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
        path: 'investment',
        select: 'name symbol type isAutomatedPortfolio currency',
        match: { user: req.userId },
      })
      .sort({ date: 1 });
    
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET resumen de evolución de inversiones (agrupado por fecha)
router.get('/evolution', async (req, res) => {
  try {
    // Importar DailyVariation
    const DailyVariation = (await import('../models/DailyVariation.js')).default;
    
    // Obtener todas las inversiones ACTIVAS del usuario (solo las que existen actualmente)
    const investments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null }
    });
    
    if (investments.length === 0) {
      return res.json([]);
    }
    
    // IMPORTANTE: Solo considerar operaciones de inversiones ACTIVAS
    const activeInvestmentIds = investments.map(inv => inv._id);
    
    // Encontrar la fecha de la primera inversión ACTIVA (primera operación 'creation' con operationAmount)
    const firstCreation = await InvestmentHistory.findOne({
      user: req.userId,
      investment: { $in: activeInvestmentIds }, // Solo inversiones activas
      operation: 'creation',
      operationAmount: { $exists: true, $ne: null }
    }).sort({ date: 1 });
    
    if (!firstCreation) {
      return res.json([]);
    }
    
    // Usar la fecha de la primera inversión como inicio
    const startDate = new Date(firstCreation.date);
    startDate.setHours(0, 0, 0, 0);
    
    
    // Obtener TODAS las variaciones diarias y entradas de historial de una vez para optimizar
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const [allDailyVariations, allHistoryEntries] = await Promise.all([
      DailyVariation.find({
        user: req.userId,
        investment: { $in: activeInvestmentIds }, // Solo inversiones activas
        date: { $gte: startDate, $lte: endDate }
      }).sort({ date: 1, investment: 1 }),
      InvestmentHistory.find({
        user: req.userId,
        investment: { $in: activeInvestmentIds }, // Solo inversiones activas
        date: { $gte: startDate, $lte: endDate },
        $or: [
          { totalValue: { $exists: true, $ne: null, $gt: 0 } },
          { operation: { $in: ['creation', 'add', 'withdraw'] }, operationAmount: { $exists: true, $ne: null } }
        ]
      }).sort({ date: 1, investment: 1 })
    ]);
    
    
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
    investments.forEach(inv => {
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
      const dateKey = date.toISOString().split('T')[0];
      const isToday = dateKey === today.toISOString().split('T')[0];
      
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
        const daysSinceToday = Math.floor((today - date) / (1000 * 60 * 60 * 24));
        
        // Si es el día de hoy o estamos en los últimos 3 días, usar el valor actual del modelo Investment
        // Esto asegura que los últimos días tengan valores consistentes y actualizados
        if (isToday || daysSinceToday <= 3) {
          invValue = currentInvestmentValues.get(inv._id.toString()) || 0;
        } else {
          // Para días más antiguos, buscar en DailyVariation primero (valores más actualizados)
          const lastVariation = allDailyVariations
            .filter(v => v.investment.toString() === inv._id.toString() && v.date <= dateEnd)
            .sort((a, b) => b.date - a.date)[0];
          
          if (lastVariation && lastVariation.totalValue) {
            invValue = lastVariation.totalValue;
          } else {
            // Si no hay DailyVariation, buscar en InvestmentHistory
            const lastHistory = allHistoryEntries
              .filter(h => h.investment.toString() === inv._id.toString() && 
                          h.date <= dateEnd && 
                          h.totalValue && h.totalValue > 0)
              .sort((a, b) => b.date - a.date)[0];
            
            if (lastHistory && lastHistory.totalValue) {
              invValue = lastHistory.totalValue;
            } else {
              // Si no hay datos históricos, calcular el capital invertido hasta esta fecha
              const capitalOperations = allHistoryEntries.filter(h => 
                h.investment.toString() === inv._id.toString() && 
                h.date <= dateEnd &&
                ['creation', 'add', 'withdraw'].includes(h.operation) &&
                h.operationAmount
              );
              
              let capital = 0;
              capitalOperations.forEach(op => {
                if (op.operation === 'creation' || op.operation === 'add') {
                  capital += (op.operationAmount || 0);
                } else if (op.operation === 'withdraw') {
                  capital -= Math.abs(op.operationAmount || 0);
                }
              });
              
              if (capital > 0) {
                invValue = capital;
              }
            }
          }
        }
        
        totalValue += invValue;
      }
      
      result.push({
        date: dateKey,
        totalValue: totalValue
      });
    }
    
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT actualizar entrada de historial
router.put('/:id', async (req, res) => {
  try {
    const { date, currentPrice, quantity, notes, operation, operationAmount, operationPrice } = req.body;
    
    const historyEntry = await InvestmentHistory.findOne({ _id: req.params.id, user: req.userId });
    if (!historyEntry) {
      return res.status(404).json({ message: 'Entrada de historial no encontrada' });
    }
    
    // Verificar que la inversión existe y pertenece al usuario
    const investment = await Investment.findOne({ _id: historyEntry.investment, user: req.userId });
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    
    // Actualizar campos
    if (date !== undefined) historyEntry.date = date;
    if (currentPrice !== undefined) historyEntry.currentPrice = currentPrice;
    if (quantity !== undefined) historyEntry.quantity = quantity;
    if (notes !== undefined) historyEntry.notes = notes;
    if (operation !== undefined) historyEntry.operation = operation;
    if (operationAmount !== undefined) historyEntry.operationAmount = operationAmount;
    if (operationPrice !== undefined) historyEntry.operationPrice = operationPrice;
    
    // Recalcular totalValue
    if (currentPrice !== undefined || quantity !== undefined) {
      if (investment.isAutomatedPortfolio) {
        historyEntry.totalValue = historyEntry.currentPrice;
      } else {
        historyEntry.totalValue = historyEntry.quantity * historyEntry.currentPrice;
      }
      
      // Recalcular diferencias diarias
      const dailyChanges = await calculateDailyChanges(
        historyEntry.investment, 
        req.userId, 
        historyEntry.totalValue
      );
      historyEntry.dailyChangeAmount = dailyChanges.dailyChangeAmount;
      historyEntry.dailyChangePercent = dailyChanges.dailyChangePercent;
    }
    
    await historyEntry.save();
    res.json(historyEntry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar entrada de historial
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await InvestmentHistory.findOne({ _id: req.params.id, user: req.userId });
    if (!deleted) {
      return res.status(404).json({ message: 'Entrada de historial no encontrada' });
    }
    await InvestmentHistory.findByIdAndDelete(req.params.id);
    res.json({ message: 'Entrada de historial eliminada' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST registrar valores diarios de todas las inversiones
// Este endpoint registra el valor actual de todas las inversiones del usuario
// Solo crea una entrada por inversión si no existe ya una entrada para hoy
router.post('/register-daily-values', async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario
    const investments = await Investment.find({
      user: req.userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      return res.json({
        message: 'No hay inversiones para registrar',
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
router.post('/migrate-daily-variations', async (req, res) => {
  try {
    const result = await migrateExistingDailyVariations(req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST calcular variaciones históricas para una inversión específica
router.post('/investment/:investmentId/calculate-historical', async (req, res) => {
  try {
    const { investmentId } = req.params;
    
    // Verificar que la inversión pertenece al usuario
    const investment = await Investment.findOne({ _id: investmentId, user: req.userId });
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    
    const result = await calculateHistoricalVariations(investmentId, req.userId, investment);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

