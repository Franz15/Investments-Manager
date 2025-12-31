import express from 'express';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';

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
    console.error('Error calculando diferencias diarias:', error);
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
    
    res.json(history);
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
    const { months = 6 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    
    // Obtener todas las entradas de historial en el rango de fechas del usuario
    const history = await InvestmentHistory.find({
      user: req.userId,
      date: { $gte: startDate },
    })
      .populate({
        path: 'investment',
        select: 'name currency',
        match: { 
          user: req.userId,
          account: { $exists: true, $ne: null }
        },
      })
      .sort({ date: 1 });
    
    // Agrupar por fecha y calcular totales
    const groupedByDate = {};
    
    history.forEach(entry => {
      // Saltar entradas sin inversión (si la inversión fue eliminada)
      if (!entry.investment || !entry.investment._id) {
        return;
      }
      
      const dateKey = entry.date.toISOString().split('T')[0];
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = {
          date: dateKey,
          totalValue: 0,
          investments: {},
        };
      }
      
      // Agrupar por inversión para evitar duplicados en la misma fecha
      const invId = entry.investment._id.toString();
      const totalValue = entry.totalValue || 0;
      
      if (!groupedByDate[dateKey].investments[invId]) {
        groupedByDate[dateKey].investments[invId] = totalValue;
        groupedByDate[dateKey].totalValue += totalValue;
      } else {
        // Si hay múltiples entradas para la misma inversión en la misma fecha, usar la más reciente
        if (totalValue > groupedByDate[dateKey].investments[invId]) {
          groupedByDate[dateKey].totalValue -= groupedByDate[dateKey].investments[invId];
          groupedByDate[dateKey].investments[invId] = totalValue;
          groupedByDate[dateKey].totalValue += totalValue;
        }
      }
    });
    
    // Convertir a array y ordenar por fecha
    const result = Object.values(groupedByDate).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
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
        // Verificar si ya existe una entrada para hoy
        const existingHistory = await InvestmentHistory.findOne({
          investment: investment._id,
          user: req.userId,
          date: { $gte: today, $lt: tomorrow },
        });

        // Calcular el valor total
        const totalValue = investment.isAutomatedPortfolio
          ? investment.currentPrice
          : investment.quantity * investment.currentPrice;

        // Calcular diferencias respecto al día anterior
        const dailyChanges = await calculateDailyChanges(investment._id, req.userId, totalValue);

        if (existingHistory) {
          // Actualizar registro existente con los valores más recientes
          existingHistory.currentPrice = investment.currentPrice;
          existingHistory.quantity = investment.quantity;
          existingHistory.totalValue = totalValue;
          existingHistory.date = new Date(); // Actualizar hora también
          existingHistory.dailyChangeAmount = dailyChanges.dailyChangeAmount;
          existingHistory.dailyChangePercent = dailyChanges.dailyChangePercent;
          // Mantener las notas originales si no son de registro automático
          if (!existingHistory.notes || existingHistory.notes === 'Registro diario automático') {
            existingHistory.notes = 'Registro diario automático';
          }
          await existingHistory.save();
          registered++; // Contamos como registrado porque se actualizó
        } else {
          // Crear nueva entrada de historial
          const historyEntry = new InvestmentHistory({
            user: req.userId,
            investment: investment._id,
            date: new Date(),
            currentPrice: investment.currentPrice,
            quantity: investment.quantity,
            totalValue: totalValue,
            notes: 'Registro diario automático',
            operation: 'update',
            dailyChangeAmount: dailyChanges.dailyChangeAmount,
            dailyChangePercent: dailyChanges.dailyChangePercent,
          });

          await historyEntry.save();
          registered++;
        }
      } catch (error) {
        console.error(`Error registrando historial para inversión ${investment._id}:`, error);
        // Continuar con la siguiente inversión
      }
    }

    res.json({
      message: `Valores diarios registrados/actualizados: ${registered} de ${investments.length}`,
      registered,
      total: investments.length,
    });
  } catch (error) {
    console.error('Error registrando valores diarios:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;

