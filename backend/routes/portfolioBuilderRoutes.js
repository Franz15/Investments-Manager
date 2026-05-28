import express from 'express';
import PortfolioBuilderConfig from '../models/PortfolioBuilderConfig.js';
import Fund from '../models/Fund.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticateToken);

// Middleware: controlar acceso al Portfolio Builder
async function requirePortfolioBuilderAccess(req, res, next) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const user = await User.findOne({ id: req.userId });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Bloquear explícitamente la cuenta de test
    if (user.id === 'test-dca') {
      return res.status(403).json({
        message: 'No tienes acceso al Portfolio Builder con esta cuenta de test',
      });
    }

    // Los administradores siempre tienen acceso
    if (user.role === 'admin' || user.id === 'javier') {
      return next();
    }

    // Resto de usuarios necesitan permiso explícito
    if (user.permissions?.portfolioBuilder) {
      return next();
    }

    return res.status(403).json({
      message: 'No tienes permisos para acceder al Portfolio Builder',
    });
  } catch (error) {
    console.error('Error en requirePortfolioBuilderAccess:', error);
    return res.status(500).json({
      message: 'Error al verificar permisos de Portfolio Builder',
    });
  }
}

/** Valores por defecto (equivalente al Excel Cartera1) */
const DEFAULT_ALLOCATION = {
  totalAmountCalculated: 120000,
  totalReturn: '5.73%',
  categories: [
    {
      name: 'Monetarios',
      expectedReturn: '2.00%',
      weight: '0%',
      portfolioReturn: '0.00%',
      amount: 0,
      description: null,
    },
    {
      name: 'RF Corto',
      expectedReturn: '4.00%',
      weight: '40%',
      portfolioReturn: '1.60%',
      amount: 48000,
      description: null,
    },
    {
      name: 'RF Medio',
      expectedReturn: '5.50%',
      weight: '25%',
      portfolioReturn: '1.38%',
      amount: 30000,
      description: null,
    },
    {
      name: 'RV',
      expectedReturn: '9%',
      weight: '25%',
      portfolioReturn: '2.25%',
      amount: 30000,
      description: null,
    },
    {
      name: 'Alternativos',
      expectedReturn: '5%',
      weight: '10%',
      portfolioReturn: '0.50%',
      amount: 12000,
      description: null,
    },
  ],
};

const DEFAULT_RV_ISINS = [
  { isin: 'IE0031786696', percentage: '20%' },
  { isin: 'IE00BYX5NX33', percentage: '50%' },
  { isin: 'ES0119199000', percentage: '30%' },
];

async function buildDefaultRvDistribution() {
  const isins = DEFAULT_RV_ISINS.map((e) => e.isin);
  const funds = await Fund.find({ isin: { $in: isins } }).lean();
  const byIsin = Object.fromEntries(funds.map((f) => [f.isin, f]));

  return DEFAULT_RV_ISINS.map(({ isin, percentage }) => {
    const f = byIsin[isin];
    return {
      percentage,
      name: f?.name ?? isin,
      isin,
      link: f?.link ?? null,
      volatility12M: f?.volatility12M ?? null,
      return12M: f?.return12M ?? null,
      calculatedAmount: null,
    };
  });
}

function getExtraIsinsForCategory(extraFundIsinsByCategory, category) {
  const raw = extraFundIsinsByCategory && extraFundIsinsByCategory[category];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && raw.constructor?.name === 'Map') {
    return Array.from(raw.values()).flat();
  }
  return [];
}

function getExcludedIsinsForCategory(excludedFundIsinsByCategory, category) {
  const raw = excludedFundIsinsByCategory && excludedFundIsinsByCategory[category];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && raw.constructor?.name === 'Map') {
    return Array.from(raw.values()).flat();
  }
  return [];
}

/** Parsea return12M (ej. "19.39%" o "-1.08%") a número para ordenar; null/"-" -> -Infinity */
function parseReturn12M(value) {
  if (value == null || value === '' || String(value).trim() === '-') return -Infinity;
  const s = String(value).replace('%', '').replace(',', '.').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : -Infinity;
}

// GET config: devuelve config + catálogo global de fondos.
router.get('/config', requirePortfolioBuilderAccess, async (req, res) => {
  try {
    let config = await PortfolioBuilderConfig.findOne({ user: req.userId });
    if (!config) {
      config = await PortfolioBuilderConfig.create({
        user: req.userId,
        allocation: DEFAULT_ALLOCATION,
        rvDistribution: await buildDefaultRvDistribution(),
      });
    }

    const funds = await Fund.find().sort({ category: 1, name: 1 }).lean();

    const extraByCat =
      config.extraFundIsinsByCategory && typeof config.extraFundIsinsByCategory === 'object'
        ? { ...config.extraFundIsinsByCategory }
        : {};
    const excludedByCat =
      config.excludedFundIsinsByCategory && typeof config.excludedFundIsinsByCategory === 'object'
        ? { ...config.excludedFundIsinsByCategory }
        : {};
    const manualByCat =
      config.manualFundsByCategory && typeof config.manualFundsByCategory === 'object'
        ? { ...config.manualFundsByCategory }
        : {};

    res.json({
      allocation: config.allocation,
      rvDistribution: config.rvDistribution || [],
      extraFundIsinsByCategory: extraByCat,
      excludedFundIsinsByCategory: excludedByCat,
      manualFundsByCategory: manualByCat,
      esgOnly: config.esgOnly ?? false,
      funds: funds.map((f) => {
        const isin = (f.isin || '').trim();
        const extraIsins = getExtraIsinsForCategory(extraByCat, f.category);
        const isExtra = extraIsins.some((e) => (e || '').trim() === isin);
        const excludedIsins = getExcludedIsinsForCategory(excludedByCat, f.category);
        const isExcluded = excludedIsins.some((e) => (e || '').trim() === isin);
        const wouldShow = (f.tags || []).includes('recomendado') || !!isExtra;
        return {
          _id: f._id,
          name: f.name,
          isin: f.isin,
          link: f.link,
          volatility12M: f.volatility12M,
          volatility3Y: f.volatility3Y,
          volatility5Y: f.volatility5Y,
          return12M: f.return12M,
          return3Y: f.return3Y,
          return5Y: f.return5Y,
          return10Y: f.return10Y,
          ratingOverall: f.ratingOverall,
          morningstarCategory: f.morningstarCategory,
          managementCompany: f.managementCompany,
          notes: f.notes,
          category: f.category,
          tags: f.tags ?? [],
          showInSection: wouldShow && !isExcluded,
        };
      }),
    });
  } catch (error) {
    console.error('Error al obtener config Portfolio Builder:', error);
    res.status(500).json({ message: 'Error al obtener la configuración' });
  }
});

// PUT config: actualiza allocation, rvDistribution, extraFundIsinsByCategory y/o excludedFundIsinsByCategory
router.put('/config', requirePortfolioBuilderAccess, async (req, res) => {
  try {
    const {
      allocation,
      rvDistribution,
      extraFundIsinsByCategory,
      excludedFundIsinsByCategory,
      esgOnly,
    } = req.body;
    let config = await PortfolioBuilderConfig.findOne({ user: req.userId });
    if (!config) {
      config = new PortfolioBuilderConfig({
        user: req.userId,
        allocation: DEFAULT_ALLOCATION,
        rvDistribution: await buildDefaultRvDistribution(),
      });
    }
    if (allocation != null && typeof allocation === 'object') {
      config.allocation = {
        totalAmountCalculated:
          allocation.totalAmountCalculated ??
          config.allocation?.totalAmountCalculated ??
          DEFAULT_ALLOCATION.totalAmountCalculated,
        totalReturn:
          allocation.totalReturn ??
          config.allocation?.totalReturn ??
          DEFAULT_ALLOCATION.totalReturn,
        categories: Array.isArray(allocation.categories)
          ? allocation.categories
          : (config.allocation?.categories ?? DEFAULT_ALLOCATION.categories),
      };
    }
    if (rvDistribution != null && Array.isArray(rvDistribution)) {
      config.rvDistribution = rvDistribution;
    }
    if (extraFundIsinsByCategory != null && typeof extraFundIsinsByCategory === 'object') {
      config.extraFundIsinsByCategory = extraFundIsinsByCategory;
    }
    if (excludedFundIsinsByCategory != null && typeof excludedFundIsinsByCategory === 'object') {
      config.excludedFundIsinsByCategory = excludedFundIsinsByCategory;
    }
    if (esgOnly != null) {
      config.esgOnly = !!esgOnly;
    }
    await config.save();
    const extraByCat =
      config.extraFundIsinsByCategory && typeof config.extraFundIsinsByCategory === 'object'
        ? { ...config.extraFundIsinsByCategory }
        : {};
    const excludedByCat =
      config.excludedFundIsinsByCategory && typeof config.excludedFundIsinsByCategory === 'object'
        ? { ...config.excludedFundIsinsByCategory }
        : {};
    res.json({
      allocation: config.allocation,
      rvDistribution: config.rvDistribution,
      extraFundIsinsByCategory: extraByCat,
      excludedFundIsinsByCategory: excludedByCat,
      esgOnly: config.esgOnly ?? false,
    });
  } catch (error) {
    console.error('Error al actualizar config Portfolio Builder:', error);
    res.status(400).json({
      message: 'Error al actualizar la configuración',
      error: error.message,
    });
  }
});

// POST añadir fondo extra: solo category → añade "el siguiente" (mejor R12M); con isin → añade ese fondo
router.post('/config/extra-fund', requirePortfolioBuilderAccess, async (req, res) => {
  try {
    const { category, isin } = req.body;
    if (!category) {
      return res.status(400).json({ message: 'Falta category' });
    }
    const catKey = String(category).trim();
    let config = await PortfolioBuilderConfig.findOne({ user: req.userId });
    if (!config) {
      config = await PortfolioBuilderConfig.create({
        user: req.userId,
        allocation: DEFAULT_ALLOCATION,
        rvDistribution: await buildDefaultRvDistribution(),
      });
    }
    const extra =
      config.extraFundIsinsByCategory && typeof config.extraFundIsinsByCategory === 'object'
        ? (config.extraFundIsinsByCategory.toObject?.() ?? config.extraFundIsinsByCategory)
        : {};
    const excluded =
      config.excludedFundIsinsByCategory && typeof config.excludedFundIsinsByCategory === 'object'
        ? (config.excludedFundIsinsByCategory.toObject?.() ?? config.excludedFundIsinsByCategory)
        : {};
    const list = Array.isArray(extra[catKey]) ? [...extra[catKey]] : [];
    let isinToAdd = isin ? String(isin).trim() : null;

    if (!isinToAdd) {
      const funds = await Fund.find({ category: catKey }).lean();
      const extraSet = new Set(list.map((e) => (e || '').trim()));
      const excludedSet = new Set(
        (Array.isArray(excluded[catKey]) ? excluded[catKey] : []).map((i) => (i || '').trim())
      );
      const available = funds.filter((f) => {
        const isinNorm = (f.isin || '').trim();
        if (!isinNorm) return false;
        if (extraSet.has(isinNorm)) return false; // ya añadido como extra
        // Fondo principal: solo disponible si fue excluido (el usuario lo quitó)
        if ((f.tags || []).includes('recomendado')) return excludedSet.has(isinNorm);
        return true;
      });
      if (available.length === 0) {
        return res.status(404).json({ message: 'No hay más fondos disponibles para añadir' });
      }
      available.sort((a, b) => parseReturn12M(b.return12M) - parseReturn12M(a.return12M));
      isinToAdd = (available[0].isin || '').trim();
    }

    if (list.includes(isinToAdd)) {
      return res.json({
        extraFundIsinsByCategory: { ...extra, [catKey]: list },
        addedIsin: isinToAdd,
      });
    }
    config.extraFundIsinsByCategory = {
      ...extra,
      [catKey]: [...list, isinToAdd],
    };
    // Si estaba en excluded (ej. era principal y lo quitó), quitarlo para que vuelva a verse
    const excludedList = Array.isArray(excluded[catKey])
      ? excluded[catKey].filter((i) => (i || '').trim() !== isinToAdd)
      : [];
    config.excludedFundIsinsByCategory = {
      ...excluded,
      [catKey]: excludedList,
    };
    await config.save();
    const out =
      config.extraFundIsinsByCategory?.toObject?.() ?? config.extraFundIsinsByCategory ?? {};
    const outExcluded =
      config.excludedFundIsinsByCategory?.toObject?.() ?? config.excludedFundIsinsByCategory ?? {};
    res.json({
      extraFundIsinsByCategory: out,
      excludedFundIsinsByCategory: outExcluded,
      addedIsin: isinToAdd,
    });
  } catch (error) {
    console.error('Error al añadir fondo extra:', error);
    res.status(400).json({ message: 'Error al añadir fondo', error: error.message });
  }
});

// DELETE quitar fondo de una categoría: si es extra se quita de extra; si es principal se añade a excluded
router.delete('/config/extra-fund', requirePortfolioBuilderAccess, async (req, res) => {
  try {
    const { category, isin } = req.query;
    if (!category || !isin) {
      return res.status(400).json({ message: 'Faltan category o isin' });
    }
    const catKey = String(category).trim();
    const isinNorm = String(isin).trim();
    const config = await PortfolioBuilderConfig.findOne({ user: req.userId });
    if (!config) return res.status(404).json({ message: 'Config no encontrada' });
    const extra =
      config.extraFundIsinsByCategory && typeof config.extraFundIsinsByCategory === 'object'
        ? (config.extraFundIsinsByCategory.toObject?.() ?? config.extraFundIsinsByCategory)
        : {};
    const excluded =
      config.excludedFundIsinsByCategory && typeof config.excludedFundIsinsByCategory === 'object'
        ? (config.excludedFundIsinsByCategory.toObject?.() ?? config.excludedFundIsinsByCategory)
        : {};
    const extraList = Array.isArray(extra[catKey]) ? [...extra[catKey]] : [];
    const isInExtra = extraList.some((i) => (i || '').trim() === isinNorm);
    if (isInExtra) {
      const newExtraList = extraList.filter((i) => (i || '').trim() !== isinNorm);
      config.extraFundIsinsByCategory = { ...extra, [catKey]: newExtraList };
    } else {
      const excludedList = Array.isArray(excluded[catKey]) ? [...excluded[catKey]] : [];
      if (!excludedList.some((i) => (i || '').trim() === isinNorm)) {
        excludedList.push(isinNorm);
        config.excludedFundIsinsByCategory = {
          ...excluded,
          [catKey]: excludedList,
        };
      }
    }
    await config.save();
    const outExtra =
      config.extraFundIsinsByCategory?.toObject?.() ?? config.extraFundIsinsByCategory ?? {};
    const outExcluded =
      config.excludedFundIsinsByCategory?.toObject?.() ?? config.excludedFundIsinsByCategory ?? {};
    res.json({
      extraFundIsinsByCategory: outExtra,
      excludedFundIsinsByCategory: outExcluded,
    });
  } catch (error) {
    console.error('Error al quitar fondo:', error);
    res.status(400).json({ message: 'Error al quitar fondo', error: error.message });
  }
});

// POST resetear config: vuelve a los valores por defecto (allocation, rvDistribution, extra/excluded/manual vacíos)
router.post('/config/reset', requirePortfolioBuilderAccess, async (req, res) => {
  try {
    let config = await PortfolioBuilderConfig.findOne({ user: req.userId });
    if (!config) {
      config = new PortfolioBuilderConfig({ user: req.userId });
    }
    config.allocation = DEFAULT_ALLOCATION;
    config.rvDistribution = await buildDefaultRvDistribution();
    config.extraFundIsinsByCategory = {};
    config.excludedFundIsinsByCategory = {};
    config.manualFundsByCategory = {};
    await config.save();

    res.json({
      allocation: config.allocation,
      rvDistribution: config.rvDistribution,
      extraFundIsinsByCategory: {},
      excludedFundIsinsByCategory: {},
      manualFundsByCategory: {},
    });
  } catch (error) {
    console.error('Error al resetear config Portfolio Builder:', error);
    res.status(500).json({ message: 'Error al resetear la configuración' });
  }
});

// POST añadir fondo manual (slot vacío) a una categoría no-RV
router.post('/config/manual-fund', requirePortfolioBuilderAccess, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ message: 'Falta category' });
    }
    const catKey = String(category).trim();
    let config = await PortfolioBuilderConfig.findOne({ user: req.userId });
    if (!config) {
      config = await PortfolioBuilderConfig.create({
        user: req.userId,
        allocation: DEFAULT_ALLOCATION,
        rvDistribution: await buildDefaultRvDistribution(),
      });
    }
    const manual =
      config.manualFundsByCategory && typeof config.manualFundsByCategory === 'object'
        ? (config.manualFundsByCategory.toObject?.() ?? config.manualFundsByCategory)
        : {};
    const list = Array.isArray(manual[catKey]) ? [...manual[catKey]] : [];
    const newId = String(Date.now());
    list.push({
      _id: newId,
      name: '',
      isin: null,
      link: null,
      volatility12M: null,
      return12M: null,
    });
    config.manualFundsByCategory = { ...manual, [catKey]: list };
    await config.save();
    const out = config.manualFundsByCategory?.toObject?.() ?? config.manualFundsByCategory ?? {};
    res.json({ manualFundsByCategory: out, addedId: newId });
  } catch (error) {
    console.error('Error al añadir fondo manual:', error);
    res.status(400).json({ message: 'Error al añadir fondo manual', error: error.message });
  }
});

// DELETE eliminar fondo manual de una categoría no-RV (por _id)
router.delete('/config/manual-fund', requirePortfolioBuilderAccess, async (req, res) => {
  try {
    const { category, id } = req.query;
    if (!category || !id) {
      return res.status(400).json({ message: 'Faltan category o id' });
    }
    const catKey = String(category).trim();
    const config = await PortfolioBuilderConfig.findOne({ user: req.userId });
    if (!config) {
      return res.status(404).json({ message: 'Config no encontrada' });
    }
    const manual =
      config.manualFundsByCategory && typeof config.manualFundsByCategory === 'object'
        ? (config.manualFundsByCategory.toObject?.() ?? config.manualFundsByCategory)
        : {};
    const list = Array.isArray(manual[catKey]) ? [...manual[catKey]] : [];
    config.manualFundsByCategory = {
      ...manual,
      [catKey]: list.filter((f) => f._id !== id),
    };
    await config.save();
    const out = config.manualFundsByCategory?.toObject?.() ?? config.manualFundsByCategory ?? {};
    res.json({ manualFundsByCategory: out });
  } catch (error) {
    console.error('Error al eliminar fondo manual:', error);
    res.status(400).json({ message: 'Error al eliminar fondo manual', error: error.message });
  }
});

export default router;
