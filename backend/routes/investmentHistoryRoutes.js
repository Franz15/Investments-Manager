import express from 'express';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';

const router = express.Router();

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
    
    // Crear entrada de historial
    const historyEntry = new InvestmentHistory({
      user: req.userId,
      investment: investmentId,
      date: date || new Date(),
      currentPrice,
      quantity,
      totalValue,
      notes,
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

export default router;

