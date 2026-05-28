import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Fund from '../models/Fund.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { refreshMetricsByIsin } from '../services/morningstarService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_FUND_ISINS = new Set([
  'FR0000989626',
  'FI0008811997',
  'IE00BFZMJT78',
  'ES0112618006',
  'LU1623762843',
  'LU0942882589',
  'ES0140794001',
  'ES0140072002',
  'IE0031786696',
  'IE00BYX5NX33',
  'ES0119199000',
  'ES0175414012',
  'LU1694789451',
  'LU1508158430',
  'IE00BLP5S460',
]);

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Obtener todos los fondos del catálogo global, opcionalmente filtrados por categoría
router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.category) query.category = req.query.category;
    if (req.query.tag) query.tags = req.query.tag;
    const funds = await Fund.find(query).sort({ category: 1, name: 1 });
    res.json(funds);
  } catch (error) {
    console.error('Error al obtener fondos:', error);
    res.status(500).json({ message: 'Error al obtener fondos' });
  }
});

// Obtener fondos del catálogo global por categoría
router.get('/category/:category', async (req, res) => {
  try {
    const funds = await Fund.find({ category: req.params.category }).sort({ name: 1 });
    res.json(funds);
  } catch (error) {
    console.error('Error al obtener fondos por categoría:', error);
    res.status(500).json({ message: 'Error al obtener fondos por categoría' });
  }
});

// Crear fondo en el catálogo global (solo admin)
router.post('/', async (req, res) => {
  try {
    const fund = new Fund(req.body);
    await fund.save();
    res.status(201).json(fund);
  } catch (error) {
    console.error('Error al crear fondo:', error);
    res.status(400).json({ message: 'Error al crear fondo', error: error.message });
  }
});

// Actualizar fondo del catálogo global (solo admin)
router.put('/:id', async (req, res) => {
  try {
    const fund = await Fund.findById(req.params.id);
    if (!fund) return res.status(404).json({ message: 'Fondo no encontrado' });
    Object.assign(fund, req.body);
    await fund.save();
    res.json(fund);
  } catch (error) {
    console.error('Error al actualizar fondo:', error);
    res.status(400).json({ message: 'Error al actualizar fondo', error: error.message });
  }
});

// Eliminar fondo del catálogo global (solo admin)
router.delete('/:id', async (req, res) => {
  try {
    const fund = await Fund.findByIdAndDelete(req.params.id);
    if (!fund) return res.status(404).json({ message: 'Fondo no encontrado' });
    res.json({ message: 'Fondo eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar fondo:', error);
    res.status(500).json({ message: 'Error al eliminar fondo' });
  }
});

// Actualizar métricas desde Morningstar para el catálogo global de fondos (solo admin).
// Body: { ids?: string[] }  — si se omite, actualiza todos los fondos con ISIN.
router.post('/refresh-metrics', async (req, res) => {
  try {
    const query = { isin: { $exists: true, $ne: '' } };
    if (Array.isArray(req.body?.ids) && req.body.ids.length > 0) {
      query._id = { $in: req.body.ids.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    const funds = await Fund.find(query);
    if (!funds.length) {
      return res.json({ updated: 0, failed: 0, results: [] });
    }

    const METRIC_FIELDS = [
      'return12M',
      'return3Y',
      'return5Y',
      'return10Y',
      'volatility12M',
      'volatility3Y',
      'volatility5Y',
      'ratingOverall',
      'morningstarCategory',
      'managementCompany',
    ];

    // Procesar en lotes de 5 para no saturar Yahoo Finance
    const CONCURRENCY = 5;
    const settled = [];
    for (let i = 0; i < funds.length; i += CONCURRENCY) {
      const batch = funds.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(batch.map((fund) => processFund(fund)));
      settled.push(
        ...batchResults.map((r) =>
          r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
        )
      );
    }

    async function processFund(fund) {
      const fresh = await refreshMetricsByIsin(fund.isin);

      const update = {};
      for (const field of METRIC_FIELDS) {
        if (fresh[field] != null) update[field] = fresh[field];
      }
      if (fresh.secId) update.morningstarSecId = fresh.secId;

      if (Object.keys(update).length > 0) {
        update.metricsUpdatedAt = new Date();
        await Fund.findByIdAndUpdate(fund._id, update);
      }

      return {
        id: fund._id,
        isin: fund.isin,
        name: fund.name,
        updated: Object.keys(update).length > 0,
        metrics: update,
      };
    }

    const updated = settled.filter((r) => r.updated).length;
    const failed = settled.filter((r) => r.error).length;

    res.json({ updated, failed, results: settled });
  } catch (error) {
    console.error('Error al actualizar métricas desde Morningstar:', error);
    res.status(500).json({ message: 'Error al actualizar métricas' });
  }
});

// Obtener estadísticas del catálogo global por categoría
router.get('/stats/by-category', async (req, res) => {
  try {
    const stats = await Fund.aggregate([
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

// Seed del catálogo global desde defaultPortfolioFunds.json (solo admin)
// Borra la colección y la repuebla desde cero.
router.post('/seed', async (req, res) => {
  try {
    const jsonPath = path.join(__dirname, '../data/defaultPortfolioFunds.json');
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    await Fund.deleteMany({});

    const docs = raw.map((f) => {
      const isin = (f.isin || '').trim() || undefined;
      return {
        name: f.name,
        ...(isin && { isin }),
        link: f.link || null,
        category: f.category,
        notes: f.notes || null,
        tags: [
          ...(Array.isArray(f.tags) ? f.tags : []),
          ...(isin && MAIN_FUND_ISINS.has(isin) ? ['recomendado'] : []),
        ],
        return12M: f.return12M || null,
        volatility12M: f.volatility12M || null,
      };
    });

    await Fund.insertMany(docs, { ordered: false });

    res.json({ total: docs.length });
  } catch (error) {
    console.error('Error en seed de fondos:', error);
    res.status(500).json({ message: 'Error en seed', error: error.message });
  }
});

export default router;
