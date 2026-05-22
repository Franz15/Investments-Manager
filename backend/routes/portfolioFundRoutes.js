import express from 'express';
import mongoose from 'mongoose';
import PortfolioFund from '../models/PortfolioFund.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { refreshMetricsByIsin } from '../services/morningstarService.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Obtener todos los fondos del usuario, opcionalmente filtrados por categoría
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const query = { user: req.userId };

    if (category) {
      query.category = category;
    }

    const funds = await PortfolioFund.find(query).sort({
      category: 1,
      name: 1,
    });
    res.json(funds);
  } catch (error) {
    console.error('Error al obtener fondos:', error);
    res.status(500).json({ message: 'Error al obtener fondos' });
  }
});

// Obtener fondos por categoría
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const funds = await PortfolioFund.find({
      user: req.userId,
      category: category,
    }).sort({ name: 1 });
    res.json(funds);
  } catch (error) {
    console.error('Error al obtener fondos por categoría:', error);
    res.status(500).json({ message: 'Error al obtener fondos por categoría' });
  }
});

// Crear un nuevo fondo
router.post('/', async (req, res) => {
  try {
    const fund = new PortfolioFund({
      ...req.body,
      user: req.userId,
    });
    await fund.save();
    res.status(201).json(fund);
  } catch (error) {
    console.error('Error al crear fondo:', error);
    res.status(400).json({ message: 'Error al crear fondo', error: error.message });
  }
});

// Actualizar un fondo
router.put('/:id', async (req, res) => {
  try {
    const fund = await PortfolioFund.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!fund) {
      return res.status(404).json({ message: 'Fondo no encontrado' });
    }

    Object.assign(fund, req.body);
    await fund.save();
    res.json(fund);
  } catch (error) {
    console.error('Error al actualizar fondo:', error);
    res.status(400).json({ message: 'Error al actualizar fondo', error: error.message });
  }
});

// Eliminar un fondo
router.delete('/:id', async (req, res) => {
  try {
    const fund = await PortfolioFund.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });

    if (!fund) {
      return res.status(404).json({ message: 'Fondo no encontrado' });
    }

    res.json({ message: 'Fondo eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar fondo:', error);
    res.status(500).json({ message: 'Error al eliminar fondo' });
  }
});

// Actualizar volatilidad y rentabilidad 12M desde Morningstar para los fondos del usuario
// Body: { ids?: string[] }  — si se omite, actualiza todos los fondos con ISIN del usuario
router.post('/refresh-metrics', async (req, res) => {
  try {
    const query = { user: req.userId, isin: { $exists: true, $ne: '' } };
    if (Array.isArray(req.body?.ids) && req.body.ids.length > 0) {
      query._id = { $in: req.body.ids.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const funds = await PortfolioFund.find(query);
    if (!funds.length) {
      return res.json({ updated: 0, failed: 0, results: [] });
    }

    const results = await Promise.allSettled(
      funds.map(async (fund) => {
        const { return12M, volatility12M } = await refreshMetricsByIsin(fund.isin);

        const update = {};
        if (return12M != null) update.return12M = return12M;
        if (volatility12M != null) update.volatility12M = volatility12M;

        if (Object.keys(update).length > 0) {
          await PortfolioFund.findByIdAndUpdate(fund._id, update);
        }

        return {
          id: fund._id,
          isin: fund.isin,
          name: fund.name,
          return12M: return12M ?? fund.return12M,
          volatility12M: volatility12M ?? fund.volatility12M,
          updated: Object.keys(update).length > 0,
        };
      })
    );

    const settled = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
    );
    const updated = settled.filter((r) => r.updated).length;
    const failed = settled.filter((r) => r.error).length;

    res.json({ updated, failed, results: settled });
  } catch (error) {
    console.error('Error al actualizar métricas desde Morningstar:', error);
    res.status(500).json({ message: 'Error al actualizar métricas' });
  }
});

// Obtener estadísticas de fondos por categoría
router.get('/stats/by-category', async (req, res) => {
  try {
    const stats = await PortfolioFund.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.userId) } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
});

export default router;
