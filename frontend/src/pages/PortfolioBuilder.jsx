import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../contexts/ThemeContext';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../services/api';
import {
  ExternalLink,
  Home,
  PiggyBank,
  TrendingUp,
  DollarSign,
  Info,
  Calculator,
  Play,
  Building2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Layers,
  RefreshCw,
} from 'lucide-react';
import {
  DEFAULT_PORTFOLIO_ALLOCATION,
  DEFAULT_SECTION_DESCRIPTIONS,
  DEFAULT_SECTION_TIPS,
  DEFAULT_SECTION_VIDEOS,
} from '../data/portfolioBuilderData';

const PortfolioBuilder = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [portfolioData, setPortfolioData] = useState(null);
  const [expandedSections, setExpandedSections] = useState(new Set(['calculator']));
  const [expandedVideos, setExpandedVideos] = useState(new Set());

  // Estado para la tabla de cálculos interactiva
  const [calculatorData, setCalculatorData] = useState({
    totalAmount: 120000,
    categories: [
      {
        name: 'Monetarios',
        expectedReturn: 2.0,
        weight: 0,
        description: t('portfolioBuilder.categories.descriptions.monetarios'),
      },
      {
        name: 'RF Corto',
        expectedReturn: 4.0,
        weight: 40,
        description: t('portfolioBuilder.categories.descriptions.rfCorto'),
      },
      {
        name: 'RF Medio',
        expectedReturn: 5.5,
        weight: 25,
        description: t('portfolioBuilder.categories.descriptions.rfMedio'),
      },
      {
        name: 'RV',
        expectedReturn: 9.0,
        weight: 25,
        description: t('portfolioBuilder.categories.descriptions.rv'),
      },
      {
        name: 'Alternativos',
        expectedReturn: 5.0,
        weight: 10,
        description: t('portfolioBuilder.categories.descriptions.alternativos'),
      },
    ],
  });

  const [esgOnly, setEsgOnly] = useState(false);
  const rawConfigRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [addingExtra, setAddingExtra] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [refreshingMetrics, setRefreshingMetrics] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);

  const handleEsgOnlyChange = async (value) => {
    setEsgOnly(value);
    if (rawConfigRef.current) {
      const updatedConfig = { ...rawConfigRef.current, esgOnly: value };
      rawConfigRef.current = updatedConfig;
      setPortfolioData(buildPortfolioDataFromConfig(updatedConfig, t));
    }
    try {
      await api.put('/portfolio-builder/config', { esgOnly: value });
    } catch (err) {
      console.error('Error guardando preferencia ESG:', err);
    }
  };

  // Mapear un fondo de la API al formato que usa la UI
  const mapFundToSection = (f) => ({
    name: f.name,
    isin: f.isin ?? null,
    link: f.link ?? null,
    return12M: f.return12M ?? null,
    return3Y: f.return3Y ?? null,
    return5Y: f.return5Y ?? null,
    return10Y: f.return10Y ?? null,
    volatility12M: f.volatility12M ?? null,
    volatility3Y: f.volatility3Y ?? null,
    volatility5Y: f.volatility5Y ?? null,
    ratingOverall: f.ratingOverall ?? null,
    notes: f.notes ?? null,
    tags: f.tags ?? [],
    _seq: f._seq ?? null,
  });

  // Construir datos del portfolio desde config (API: allocation, rvDistribution, funds con showInSection)
  // Solo se muestran fondos "principales" (Cartera1) + los que el usuario ha añadido como extra.
  const ESG_TAGS = ['esg-alto', 'esg-moderado', 'esg-superficial'];

  const renderFundMetrics = (fund) => {
    const hasReturns = fund.return12M || fund.return3Y || fund.return5Y || fund.return10Y;
    const hasVol = fund.volatility12M || fund.volatility3Y || fund.volatility5Y;
    const hasRating = fund.ratingOverall != null;
    if (!hasReturns && !hasVol && !hasRating) return null;

    const renderRow = (label, periods) => {
      const filled = periods.filter(([, v]) => v);
      if (!filled.length) return null;
      return (
        <div className="flex items-baseline gap-2 text-xs">
          <span className="text-gray-400 dark:text-gray-500 shrink-0 w-7">{label}</span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5">
            {filled.map(([period, value]) => (
              <span key={period}>
                <span className="text-gray-400 dark:text-gray-500">{period}</span>{' '}
                <span className="font-medium text-gray-800 dark:text-gray-200">{value}</span>
              </span>
            ))}
          </span>
        </div>
      );
    };

    return (
      <div className="mt-2 mb-2 space-y-1.5">
        {hasRating && (
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`text-sm leading-none ${i < fund.ratingOverall ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
              >
                ★
              </span>
            ))}
          </div>
        )}
        {renderRow('Rent.', [
          ['12M', fund.return12M],
          ['3A', fund.return3Y],
          ['5A', fund.return5Y],
          ['10A', fund.return10Y],
        ])}
        {renderRow('Vol.', [
          ['12M', fund.volatility12M],
          ['3A', fund.volatility3Y],
          ['5A', fund.volatility5Y],
        ])}
      </div>
    );
  };

  const getEsgBadge = (tags) => {
    if ((tags || []).includes('esg-alto'))
      return {
        label: 'Responsable',
        cls: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700',
      };
    if ((tags || []).includes('esg-moderado'))
      return {
        label: 'Responsable',
        cls: 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-500',
      };
    if ((tags || []).includes('esg-superficial'))
      return {
        label: 'Responsable',
        cls: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700',
      };
    return null;
  };

  const buildPortfolioDataFromConfig = (config, tFn) => {
    const allocation = config?.allocation || DEFAULT_PORTFOLIO_ALLOCATION;
    const rvDist = config?.rvDistribution;
    const onlyEsg = config?.esgOnly ?? false;
    // Deduplicate by isin+category (or name+category when no isin) to guard against DB duplicates
    const seen = new Set();
    const fundsList = (config?.funds || []).filter((f) => {
      const key = f.isin
        ? `${(f.isin || '').trim()}|${f.category}`
        : `${(f.name || '').trim()}|${f.category}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const rvDistributionIsins = new Set(
      (rvDist || []).map((d) => (d.isin || '').trim()).filter(Boolean)
    );
    const fundVisible = (f) =>
      onlyEsg ? (f.tags || []).some((tag) => ESG_TAGS.includes(tag)) : f.showInSection === true;

    const byCategory = (cat, onlyShowInSection = true) => {
      const extraOrder = (config?.extraFundIsinsByCategory?.[cat] || []).map((s) =>
        (s || '').trim()
      );
      return fundsList
        .filter((f) => f.category === cat && (!onlyShowInSection || fundVisible(f)))
        .sort((a, b) => {
          const aMain = (a.tags || []).includes('recomendado');
          const bMain = (b.tags || []).includes('recomendado');
          if (aMain !== bMain) return bMain ? 1 : -1; // recomendados first
          // both extras: preserve insertion order from extraFundIsinsByCategory
          const aIdx = extraOrder.indexOf((a.isin || '').trim());
          const bIdx = extraOrder.indexOf((b.isin || '').trim());
          return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
        })
        .map(mapFundToSection);
    };
    const rvFundsOnlyExtras = () =>
      fundsList
        .filter(
          (f) =>
            f.category === 'Renta Variable' &&
            f.showInSection === true &&
            !rvDistributionIsins.has((f.isin || '').trim())
        )
        .map(mapFundToSection);

    const manualByCat = config?.manualFundsByCategory || {};
    const mapManualFund = (f) => ({
      name: f.name || '',
      isin: f.isin ?? null,
      link: f.link ?? null,
      volatility12M: f.volatility12M ?? null,
      return12M: f.return12M ?? null,
      notes: null,
      tags: [],
      _seq: null,
      _manual: true,
      _id: f._id,
    });

    // Enriquecer cada ítem de la distribución RV con datos de fundsList
    const enrichDistributionItem = (d) => {
      const isin = (d.isin || '').trim();
      const fund =
        (isin && fundsList.find((f) => (f.isin || '').trim() === isin)) ||
        (d.name &&
          fundsList.find((f) =>
            (f.name || '').toLowerCase().includes((d.name || '').toLowerCase())
          )) ||
        (d.name &&
          fundsList.find((f) =>
            (d.name || '').toLowerCase().includes((f.name || '').split(' ')[0].toLowerCase())
          ));
      if (fund) {
        return {
          amount: null,
          percentage: d.percentage,
          name: d.name || fund.name,
          isin: isin || (fund.isin || '').trim() || null,
          link: d.link || fund.link || null,
          return12M: d.return12M ?? fund.return12M ?? null,
          return3Y: fund.return3Y ?? null,
          return5Y: fund.return5Y ?? null,
          return10Y: fund.return10Y ?? null,
          volatility12M: d.volatility12M ?? fund.volatility12M ?? null,
          volatility3Y: fund.volatility3Y ?? null,
          volatility5Y: fund.volatility5Y ?? null,
          ratingOverall: fund.ratingOverall ?? null,
          calculatedAmount: d.calculatedAmount ?? null,
          tags: fund.tags ?? [],
          _seq: d._seq ?? null,
        };
      }
      return {
        amount: null,
        percentage: d.percentage,
        name: d.name,
        isin: d.isin ?? null,
        link: d.link ?? null,
        return12M: d.return12M ?? null,
        return3Y: null,
        return5Y: null,
        return10Y: null,
        volatility12M: d.volatility12M ?? null,
        volatility3Y: null,
        volatility5Y: null,
        ratingOverall: null,
        calculatedAmount: d.calculatedAmount ?? null,
        tags: [],
        _seq: d._seq ?? null,
      };
    };

    return {
      sections: [
        {
          number: 2,
          title: tFn('portfolioBuilder.sections.monetarios.title'),
          icon: PiggyBank,
          description: DEFAULT_SECTION_DESCRIPTIONS[2] || '',
          funds: [
            ...byCategory('Monetarios'),
            ...(manualByCat['Monetarios'] || []).map(mapManualFund),
          ],
          categoryKey: 'Monetarios',
          tips: DEFAULT_SECTION_TIPS[2] || [],
          videos: DEFAULT_SECTION_VIDEOS[2] || [],
        },
        {
          number: 3,
          title: tFn('portfolioBuilder.sections.rentaVariable.title'),
          icon: TrendingUp,
          description: DEFAULT_SECTION_DESCRIPTIONS[3] || '',
          totalAmount: allocation.categories?.find((c) => c.name === 'RV')?.amount ?? 30000,
          distribution: (rvDist || []).map(enrichDistributionItem),
          funds: rvFundsOnlyExtras(),
          categoryKey: 'Renta Variable',
          tips: DEFAULT_SECTION_TIPS[3] || [],
          videos: DEFAULT_SECTION_VIDEOS[3] || [],
        },
        {
          number: 4,
          title: tFn('portfolioBuilder.sections.rentaFija.title'),
          icon: DollarSign,
          description: '',
          note: '',
          subsections: [
            {
              name: tFn('portfolioBuilder.sections.subsections.rfCortoPlazo.name'),
              description: tFn('portfolioBuilder.sections.subsections.rfCortoPlazo.description'),
              funds: [
                ...byCategory('RF corto plazo'),
                ...(manualByCat['RF corto plazo'] || []).map(mapManualFund),
              ],
              categoryKey: 'RF corto plazo',
            },
            {
              name: tFn('portfolioBuilder.sections.subsections.rfMedioPlazo.name'),
              description: tFn('portfolioBuilder.sections.subsections.rfMedioPlazo.description'),
              funds: [
                ...byCategory('RF medio plazo'),
                ...(manualByCat['RF medio plazo'] || []).map(mapManualFund),
              ],
              categoryKey: 'RF medio plazo',
            },
          ],
          videos: DEFAULT_SECTION_VIDEOS[4] || [],
        },
        {
          number: 5,
          title: tFn('portfolioBuilder.sections.alternativos.title'),
          icon: Layers,
          description: tFn('portfolioBuilder.sections.alternativos.description'),
          funds: [
            ...byCategory('Alternativos'),
            ...(manualByCat['Alternativos'] || []).map(mapManualFund),
          ],
          categoryKey: 'Alternativos',
          videos: DEFAULT_SECTION_VIDEOS[5] || [],
        },
      ],
      portfolioAllocation: allocation,
      detailedAllocation: {},
      fundsList: fundsList,
      extraFundIsinsByCategory: config?.extraFundIsinsByCategory || {},
      excludedFundIsinsByCategory: config?.excludedFundIsinsByCategory || {},
      manualFundsByCategory: manualByCat,
    };
  };

  const loadConfig = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    return api
      .get('/portfolio-builder/config')
      .then((res) => {
        const config = res.data;
        rawConfigRef.current = config;
        setEsgOnly(config.esgOnly ?? false);
        const processedData = buildPortfolioDataFromConfig(config, t);
        setPortfolioData(processedData);

        const allocation = config.allocation || DEFAULT_PORTFOLIO_ALLOCATION;
        const totalAmount = allocation.totalAmountCalculated ?? 120000;
        const categories = (allocation.categories || []).map((cat) => ({
          name: cat.name,
          expectedReturn: cat.expectedReturn
            ? parseFloat(String(cat.expectedReturn).replace('%', ''))
            : 0,
          weight: cat.weight ? parseFloat(String(cat.weight).replace('%', '')) : 0,
          description: cat.description || '',
        }));

        setCalculatorData((prev) => ({
          totalAmount,
          categories: categories.length > 0 ? categories : prev.categories,
        }));
      })
      .catch((err) => {
        console.error('Error cargando config Portfolio Builder:', err);
        const status = err.response?.status;
        const message = err.response?.data?.message;

        if (status === 403) {
          setForbidden(true);
          setError(
            message || 'No tienes permisos para acceder al Portfolio Builder con esta cuenta.'
          );
        } else {
          setError(
            message ||
              t('portfolioBuilder.errors.loadConfig') + ': ' + (err.message || 'Sin conexión')
          );
        }
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const addExtraFund = async (category, isin = null) => {
    if (!category) return;
    setAddingExtra(category);
    const newSeq = Date.now();
    try {
      const res = await api.post('/portfolio-builder/config/extra-fund', {
        category,
        ...(isin ? { isin: (isin || '').trim() } : {}),
      });
      const { extraFundIsinsByCategory, excludedFundIsinsByCategory, addedIsin } = res.data || {};
      if (!addedIsin && !res.data) {
        setAddingExtra(null);
        return;
      }
      const isinNorm = (addedIsin || '').trim();
      const catKey = String(category).trim();
      setPortfolioData((prev) => {
        if (!prev?.fundsList) return prev;
        const updatedFundsList = prev.fundsList.map((f) =>
          (f.isin || '').trim() === isinNorm && f.category === catKey
            ? { ...f, showInSection: true }
            : f
        );
        // For RV extras, update section.funds directly to preserve _seq on existing items
        if (catKey === 'Renta Variable') {
          const foundFund = prev.fundsList.find(
            (f) => (f.isin || '').trim() === isinNorm && f.category === catKey
          );
          if (foundFund) {
            const newFundEntry = { ...mapFundToSection({ ...foundFund, _seq: newSeq }) };
            return {
              ...prev,
              fundsList: updatedFundsList,
              extraFundIsinsByCategory:
                extraFundIsinsByCategory || prev.extraFundIsinsByCategory || {},
              excludedFundIsinsByCategory:
                excludedFundIsinsByCategory ?? prev.excludedFundIsinsByCategory ?? {},
              sections: prev.sections.map((s) => {
                if (s.number !== 3) return s;
                const alreadyIn = (s.funds || []).some((f) => (f.isin || '').trim() === isinNorm);
                if (alreadyIn) return s;
                return { ...s, funds: [...(s.funds || []), newFundEntry] };
              }),
            };
          }
        }
        const rvSection = prev.sections?.find((s) => s.number === 3);
        const syntheticConfig = {
          allocation: prev.portfolioAllocation,
          rvDistribution: rvSection?.distribution ?? [],
          funds: updatedFundsList,
          extraFundIsinsByCategory: extraFundIsinsByCategory || prev.extraFundIsinsByCategory || {},
          excludedFundIsinsByCategory:
            excludedFundIsinsByCategory ?? prev.excludedFundIsinsByCategory ?? {},
        };
        return buildPortfolioDataFromConfig(syntheticConfig, t);
      });
    } catch (err) {
      console.error('Error al añadir fondo extra:', err);
    } finally {
      setAddingExtra(null);
    }
  };

  const removeExtraFund = async (category, isin) => {
    if (!category || !isin) return;
    const catKey = String(category).trim();
    const isinNorm = (isin || '').trim();
    try {
      const res = await api.delete('/portfolio-builder/config/extra-fund', {
        params: { category: catKey, isin: isinNorm },
      });
      const { extraFundIsinsByCategory, excludedFundIsinsByCategory } = res.data || {};
      setPortfolioData((prev) => {
        if (!prev?.fundsList) return prev;
        const updatedFundsList = prev.fundsList.map((f) =>
          f.category === catKey && (f.isin || '').trim() === isinNorm
            ? { ...f, showInSection: false }
            : f
        );
        // For RV extras, remove directly from section.funds to preserve _seq on remaining items
        if (catKey === 'Renta Variable') {
          return {
            ...prev,
            fundsList: updatedFundsList,
            extraFundIsinsByCategory:
              extraFundIsinsByCategory ?? prev.extraFundIsinsByCategory ?? {},
            excludedFundIsinsByCategory:
              excludedFundIsinsByCategory ?? prev.excludedFundIsinsByCategory ?? {},
            sections: prev.sections.map((s) => {
              if (s.number !== 3) return s;
              return {
                ...s,
                funds: (s.funds || []).filter((f) => (f.isin || '').trim() !== isinNorm),
              };
            }),
          };
        }
        const syntheticConfig = {
          allocation: prev.portfolioAllocation,
          rvDistribution: prev.sections?.find((s) => s.number === 3)?.distribution ?? [],
          funds: updatedFundsList,
          extraFundIsinsByCategory: extraFundIsinsByCategory ?? prev.extraFundIsinsByCategory ?? {},
          excludedFundIsinsByCategory:
            excludedFundIsinsByCategory ?? prev.excludedFundIsinsByCategory ?? {},
        };
        return buildPortfolioDataFromConfig(syntheticConfig, t);
      });
    } catch (err) {
      console.error('Error al eliminar fondo extra:', err);
    }
  };

  // Añadir un slot manual vacío a cualquier sección no-RV (persiste en BBDD)
  const addManualFundToSection = async (categoryKey) => {
    if (!categoryKey) return;
    try {
      const res = await api.post('/portfolio-builder/config/manual-fund', {
        category: categoryKey,
      });
      const { manualFundsByCategory, addedId } = res.data || {};
      if (!addedId) return;
      const newSeq = Date.now();
      const newFund = {
        name: '',
        isin: null,
        link: null,
        volatility12M: null,
        return12M: null,
        notes: null,
        tags: [],
        _seq: newSeq,
        _manual: true,
        _id: addedId,
      };
      setPortfolioData((prev) => {
        if (!prev?.sections) return prev;
        return {
          ...prev,
          manualFundsByCategory: manualFundsByCategory || prev.manualFundsByCategory || {},
          sections: prev.sections.map((s) => {
            if (s.number !== 3 && s.categoryKey === categoryKey) {
              return { ...s, funds: [...(s.funds || []), newFund] };
            }
            if (s.number === 4 && s.subsections) {
              const hasMatch = s.subsections.some((sub) => sub.categoryKey === categoryKey);
              if (!hasMatch) return s;
              return {
                ...s,
                subsections: s.subsections.map((sub) =>
                  sub.categoryKey === categoryKey
                    ? { ...sub, funds: [...(sub.funds || []), newFund] }
                    : sub
                ),
              };
            }
            return s;
          }),
        };
      });
    } catch (err) {
      console.error('Error al añadir fondo manual:', err);
    }
  };

  // Eliminar un slot manual de cualquier sección no-RV (por _id, persiste en BBDD)
  const removeManualFundFromSection = async (categoryKey, id) => {
    if (!categoryKey || !id) return;
    try {
      const res = await api.delete('/portfolio-builder/config/manual-fund', {
        params: { category: categoryKey, id },
      });
      const { manualFundsByCategory } = res.data || {};
      setPortfolioData((prev) => {
        if (!prev?.sections) return prev;
        return {
          ...prev,
          manualFundsByCategory: manualFundsByCategory || prev.manualFundsByCategory || {},
          sections: prev.sections.map((s) => {
            if (s.number !== 3 && s.categoryKey === categoryKey) {
              return { ...s, funds: (s.funds || []).filter((f) => f._id !== id) };
            }
            if (s.number === 4 && s.subsections) {
              const hasMatch = s.subsections.some((sub) => sub.categoryKey === categoryKey);
              if (!hasMatch) return s;
              return {
                ...s,
                subsections: s.subsections.map((sub) =>
                  sub.categoryKey === categoryKey
                    ? { ...sub, funds: (sub.funds || []).filter((f) => f._id !== id) }
                    : sub
                ),
              };
            }
            return s;
          }),
        };
      });
    } catch (err) {
      console.error('Error al eliminar fondo manual:', err);
    }
  };

  // Guardar config en la API (asignación + distribución RV)
  const savePortfolioConfig = async () => {
    if (!portfolioData) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const rvSection = portfolioData.sections?.find((s) => s.number === 3);
      const rvDistribution = (rvSection?.distribution || []).map((d) => ({
        percentage: d.percentage,
        name: d.name,
        isin: d.isin ?? null,
        link: d.link ?? null,
        volatility12M: d.volatility12M ?? null,
        return12M: d.return12M ?? null,
        calculatedAmount: d.calculatedAmount ?? null,
      }));

      const allocation = {
        totalAmountCalculated: calculatorData.totalAmount,
        totalReturn: portfolioData.portfolioAllocation?.totalReturn ?? '5.73%',
        categories: calculatorData.categories.map((cat) => ({
          name: cat.name,
          expectedReturn: `${cat.expectedReturn}%`,
          weight: `${cat.weight}%`,
          portfolioReturn: `${((cat.expectedReturn * cat.weight) / 100).toFixed(2)}%`,
          amount: Math.round((calculatorData.totalAmount * cat.weight) / 100),
          description: cat.description || null,
        })),
      };

      await api.put('/portfolio-builder/config', {
        allocation,
        rvDistribution,
      });
      setSaveMessage({ type: 'success', text: 'Configuración guardada' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Error al guardar',
      });
    } finally {
      setSaving(false);
    }
  };

  // Actualizar rentabilidad y volatilidad 12M de todos los fondos desde Morningstar
  const refreshFundMetrics = async () => {
    setRefreshingMetrics(true);
    setRefreshResult(null);
    try {
      const res = await api.post('/portfolio-funds/refresh-metrics');
      const { updated, failed } = res.data;
      setRefreshResult({ updated, failed });
      // Recargar la config para mostrar los nuevos valores
      await loadConfig();
      setTimeout(() => setRefreshResult(null), 5000);
    } catch (err) {
      setRefreshResult({ error: err.response?.data?.message || err.message });
      setTimeout(() => setRefreshResult(null), 5000);
    } finally {
      setRefreshingMetrics(false);
    }
  };

  // Resetear configuración a los valores por defecto
  const resetPortfolioConfig = async () => {
    setResetting(true);
    try {
      await api.post('/portfolio-builder/config/reset');
      setShowResetConfirm(false);
      await loadConfig();
    } catch (err) {
      console.error('Error al resetear configuración:', err);
    } finally {
      setResetting(false);
    }
  };

  // Parsear porcentaje "20%" o "20" -> número
  const parsePct = (p) => {
    if (p == null) return 0;
    const s = String(p).replace('%', '').trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  // Redistribuir % para que sumen 100% manteniendo proporciones (array de números)
  const redistributePercentages = (values) => {
    if (!values.length) return [];
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum <= 0) return values.map(() => 100 / values.length);
    const scaled = values.map((v) => (v / sum) * 100);
    const rounded = scaled.map((v) => Math.round(v));
    let diff = 100 - rounded.reduce((a, b) => a + b, 0);
    if (diff !== 0) {
      const byError = rounded.map((r, i) => ({ i, err: scaled[i] - r }));
      byError.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));
      for (let j = 0; j < Math.abs(diff); j++) {
        rounded[byError[j % byError.length].i] += diff > 0 ? 1 : -1;
      }
    }
    return rounded;
  };

  // Añadir un fondo a la distribución RV; se ajustan % manteniendo proporción (nuevo recibe parte, el resto se escala)
  const addRvFundToDistribution = () => {
    const newSeq = Date.now();
    setPortfolioData((prev) => {
      if (!prev?.sections) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.number !== 3) return s;
          const dist = s.distribution || [];
          const currentPcts = dist.map((d) => parsePct(d.percentage));
          const defaultNewPct = 10;
          const sumExisting = currentPcts.reduce((a, b) => a + b, 0) || 100;
          const scale = sumExisting > 0 ? (100 - defaultNewPct) / sumExisting : 1;
          const newPcts = redistributePercentages([
            ...currentPcts.map((p) => p * scale),
            defaultNewPct,
          ]);
          const newDist = newPcts.map((pct, i) =>
            i < dist.length
              ? { ...dist[i], percentage: `${newPcts[i]}%` }
              : {
                  percentage: `${newPcts[i]}%`,
                  name: '',
                  isin: null,
                  link: null,
                  volatility12M: null,
                  return12M: null,
                  calculatedAmount: null,
                  _seq: newSeq,
                }
          );
          return { ...s, distribution: newDist };
        }),
      };
    });
  };

  // Actualizar un fondo en la distribución RV
  const updateRvFundInDistribution = (idx, updates) => {
    setPortfolioData((prev) => {
      if (!prev?.sections) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.number !== 3 || !s.distribution) return s;
          const nextDist = [...s.distribution];
          if (idx < 0 || idx >= nextDist.length) return s;
          nextDist[idx] = { ...nextDist[idx], ...updates };
          return { ...s, distribution: nextDist };
        }),
      };
    });
  };

  // Eliminar un fondo de la distribución RV; se reparten su % entre el resto manteniendo proporción
  const removeRvFundFromDistribution = (idx) => {
    setPortfolioData((prev) => {
      if (!prev?.sections) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.number !== 3 || !s.distribution) return s;
          const dist = s.distribution.filter((_, i) => i !== idx);
          if (dist.length === 0) return { ...s, distribution: [] };
          const currentPcts = dist.map((d) => parsePct(d.percentage));
          const newPcts = redistributePercentages(currentPcts);
          const nextDist = dist.map((d, i) => ({
            ...d,
            percentage: `${newPcts[i]}%`,
          }));
          return { ...s, distribution: nextDist };
        }),
      };
    });
  };

  // Formatear moneda
  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0,00 €';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calcular valores de la tabla de asignación
  const calculateAllocationValues = () => {
    const totalAmount = calculatorData.totalAmount || 0;
    const categories = calculatorData.categories.map((cat) => {
      const weight = parseFloat(cat.weight) || 0;
      const expectedReturn = parseFloat(cat.expectedReturn) || 0;
      const portfolioReturn = (expectedReturn / 100) * (weight / 100);
      const amount = totalAmount * (weight / 100);

      return {
        ...cat,
        portfolioReturn: portfolioReturn,
        amount: amount,
      };
    });

    const totalReturn = categories.reduce((sum, cat) => sum + (cat.portfolioReturn || 0), 0);
    const totalAmountCalculated = categories.reduce((sum, cat) => sum + (cat.amount || 0), 0);

    return {
      categories,
      totalReturn: (totalReturn * 100).toFixed(1) + '%',
      totalAmountCalculated,
    };
  };

  const allocationValues = calculateAllocationValues();

  // Rentabilidades mínima/máxima posibles según las categorías actuales
  const minExpectedReturn = Math.min(...calculatorData.categories.map((c) => c.expectedReturn));
  const maxExpectedReturn = Math.max(...calculatorData.categories.map((c) => c.expectedReturn));
  // Retorno actual de la cartera como número (para el slider)
  const currentTotalReturnNum = parseFloat(allocationValues.totalReturn) || 0;
  // Retorno del portfolio equilibrado de referencia (Cartera1 — ancla D)
  const CARTERA1_W = { Monetarios: 0, 'RF Corto': 40, 'RF Medio': 25, RV: 25, Alternativos: 10 };
  const cartera1Return =
    Math.round(
      calculatorData.categories.reduce(
        (sum, cat) => sum + ((CARTERA1_W[cat.name] || 0) / 100) * cat.expectedReturn,
        0
      ) * 10
    ) / 10;

  /**
   * Redistribuye los pesos para alcanzar el retorno objetivo (targetPct en %).
   *
   * Usa anclas de asignación estratégica: portfolios bien diversificados
   * validados contra el Excel Cartera1 y la teoría moderna de carteras (Markowitz).
   * Interpola linealmente entre las dos anclas que encuadran el objetivo.
   *
   * Anclas (los retornos se calculan dinámicamente con los expectedReturn actuales):
   *   A  ~2.00% : 100% Monetarios                              — liquidez pura
   *   B  ~3.35% :  40 Mon · 50 RFC · 10 RFM                   — muy conservador
   *   C  ~4.63% :   5 Mon · 55 RFC · 25 RFM ·  5 RV · 10 Alt — conservador
   *   D  ~5.73% :   0 Mon · 40 RFC · 25 RFM · 25 RV · 10 Alt — equilibrado (Cartera1)
   *   E  ~6.95% :   0 Mon · 15 RFC · 20 RFM · 50 RV · 15 Alt — crecimiento
   *   F  ~8.05% :   0 Mon ·  0 RFC · 10 RFM · 75 RV · 15 Alt — agresivo
   *   G  ~8.63% :   0 Mon ·  0 RFC ·  5 RFM · 90 RV ·  5 Alt — muy agresivo
   *   H  ~9.00% :   0 Mon ·  0 RFC ·  0 RFM · 100 RV ·  0 Alt — ultra agresivo (máx. RV)
   */
  const applyTargetReturn = (targetPct) => {
    const cats = calculatorData.categories;

    // Definición de anclas estratégicas (pesos en %, suman 100)
    const ANCHORS = [
      { Monetarios: 100, 'RF Corto': 0, 'RF Medio': 0, RV: 0, Alternativos: 0 }, // A ~2.00%
      { Monetarios: 40, 'RF Corto': 50, 'RF Medio': 10, RV: 0, Alternativos: 0 }, // B ~3.35%
      { Monetarios: 5, 'RF Corto': 55, 'RF Medio': 25, RV: 5, Alternativos: 10 }, // C ~4.63%
      { Monetarios: 0, 'RF Corto': 40, 'RF Medio': 25, RV: 25, Alternativos: 10 }, // D ~5.73% (Cartera1)
      { Monetarios: 0, 'RF Corto': 15, 'RF Medio': 20, RV: 50, Alternativos: 15 }, // E ~6.95%
      { Monetarios: 0, 'RF Corto': 0, 'RF Medio': 10, RV: 75, Alternativos: 15 }, // F ~8.05%
      { Monetarios: 0, 'RF Corto': 0, 'RF Medio': 5, RV: 90, Alternativos: 5 }, // G ~8.63% (muy agresivo)
      { Monetarios: 0, 'RF Corto': 0, 'RF Medio': 0, RV: 100, Alternativos: 0 }, // H ~9.00% (ultra agresivo)
    ];

    // Calcular el retorno esperado de cada ancla con las rentabilidades actuales del calculador
    const anchorReturns = ANCHORS.map((w) =>
      cats.reduce((sum, cat) => sum + ((w[cat.name] || 0) / 100) * cat.expectedReturn, 0)
    );

    const minR = anchorReturns[0];
    const maxR = anchorReturns[anchorReturns.length - 1];
    const T = Math.max(minR, Math.min(maxR, targetPct));

    // Encontrar las dos anclas que encuadran T
    let loIdx = 0;
    for (let i = 0; i < anchorReturns.length - 1; i++) {
      if (anchorReturns[i] <= T && anchorReturns[i + 1] >= T) {
        loIdx = i;
        break;
      }
    }
    const hiIdx = loIdx + 1;
    const loR = anchorReturns[loIdx];
    const hiR = anchorReturns[hiIdx];
    const alpha = hiR === loR ? 0 : (T - loR) / (hiR - loR);

    // Interpolar pesos entre las dos anclas
    const blended = {};
    Object.keys(ANCHORS[loIdx]).forEach((name) => {
      blended[name] = ANCHORS[loIdx][name] * (1 - alpha) + ANCHORS[hiIdx][name] * alpha;
    });

    // ── Normalización a exactamente 100% en pasos de 0.5% ───────────────────────────
    // Trabajamos en "medios" (×2): 200 medios = 100%, paso mínimo = 0.5%.
    // Método del mayor resto: garantiza suma exacta sin errores de punto flotante.
    const names = Object.keys(blended);
    const UNITS = 200; // 100% ÷ 0.5% = 200 unidades
    const items = names.map((name) => {
      const v = Math.max(0, blended[name]);
      const f = Math.floor(v * 2); // entero en medios (0.5% = 1 unidad)
      return { name, floor: f, frac: v * 2 - f };
    });

    const floorSum = items.reduce((s, c) => s + c.floor, 0);
    const toAdd = UNITS - floorSum; // normalmente 0–5; puede ser negativo por FP

    if (toAdd > 0) {
      // Dar +0.5% a los items con mayor parte fraccional (más "merecedores")
      [...items]
        .sort((a, b) => b.frac - a.frac)
        .slice(0, toAdd)
        .forEach((item) => {
          item.floor += 1;
        });
    } else if (toAdd < 0) {
      // Quitar 0.5% a los items con menor parte fraccional
      [...items]
        .sort((a, b) => a.frac - b.frac)
        .slice(0, -toAdd)
        .forEach((item) => {
          item.floor -= 1;
        });
    }

    // Guardia final: forzar suma exacta en el mayor si aún hay desvío
    const finalSum = items.reduce((s, c) => s + c.floor, 0);
    if (finalSum !== UNITS) {
      const biggest = items.reduce((m, c) => (c.floor > m.floor ? c : m), items[0]);
      biggest.floor += UNITS - finalSum;
    }

    // Convertir de vuelta a porcentaje (÷2): resultados siempre enteros o .5
    const rounded = items.map((c) => ({ name: c.name, weight: c.floor / 2 }));

    setCalculatorData((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => {
        const found = rounded.find((r) => r.name === c.name);
        return { ...c, weight: found ? found.weight : 0 };
      }),
    }));
  };

  // Calcular la suma total de pesos
  const totalWeightSum = allocationValues.categories.reduce(
    (sum, cat) => sum + (parseFloat(cat.weight) || 0),
    0
  );

  // Calcular perfil de riesgo de la cartera basándose en la rentabilidad esperada
  // (monotónico: a mayor rentabilidad objetivo, mayor riesgo implícito)
  const calculateRiskProfile = () => {
    const totalWeight = allocationValues.categories.reduce(
      (sum, cat) => sum + (parseFloat(cat.weight) || 0),
      0
    );

    if (totalWeight === 0) {
      return {
        profile: t('portfolioBuilder.calculator.riskProfiles.unassigned'),
        color: 'gray',
      };
    }

    const ret = currentTotalReturnNum; // rentabilidad actual de la cartera en %

    let profile, color;
    if (ret <= 3.0) {
      profile = t('portfolioBuilder.calculator.riskProfiles.conservative');
      color = 'green';
    } else if (ret <= 4.5) {
      profile = t('portfolioBuilder.calculator.riskProfiles.moderate');
      color = 'blue';
    } else if (ret <= 6.0) {
      profile = t('portfolioBuilder.calculator.riskProfiles.balanced');
      color = 'yellow';
    } else if (ret <= 7.5) {
      profile = t('portfolioBuilder.calculator.riskProfiles.aggressive');
      color = 'orange';
    } else {
      profile = t('portfolioBuilder.calculator.riskProfiles.veryAggressive');
      color = 'red';
    }

    return { profile, color };
  };

  const riskProfile = calculateRiskProfile();

  // Función para obtener el nombre de la categoría según la sección (nombres internos para cálculos)
  const getCategoryName = (section, subsection = null) => {
    if (section.number === 2) {
      return 'Monetarios';
    } else if (section.number === 3) {
      return 'RV';
    } else if (section.number === 4 && subsection) {
      if (subsection.name === 'Renta Fija Corto Plazo' || subsection.name === 'RF Corto Plazo') {
        return 'RF Corto';
      } else if (
        subsection.name === 'Renta Fija Medio Plazo' ||
        subsection.name === 'RF Medio Plazo'
      ) {
        return 'RF Medio';
      }
    } else if (section.number === 5) {
      return 'Alternativos';
    }
    return null;
  };

  // Función para obtener el nombre completo de la categoría para mostrar
  const getCategoryDisplayName = (categoryName) => {
    const displayNames = {
      Monetarios: t('portfolioBuilder.categories.monetarios'),
      'RF Corto': t('portfolioBuilder.categories.rfCorto'),
      'RF Medio': t('portfolioBuilder.categories.rfMedio'),
      RV: t('portfolioBuilder.categories.rv'),
      Alternativos: t('portfolioBuilder.categories.alternativos'),
    };
    return displayNames[categoryName] || categoryName;
  };

  // Función para traducir descripciones de categorías
  const translateCategoryDescription = (categoryName) => {
    const descriptions = {
      Monetarios: t('portfolioBuilder.categories.descriptions.monetarios'),
      'RF Corto': t('portfolioBuilder.categories.descriptions.rfCorto'),
      'RF Medio': t('portfolioBuilder.categories.descriptions.rfMedio'),
      RV: t('portfolioBuilder.categories.descriptions.rv'),
      Alternativos: t('portfolioBuilder.categories.descriptions.alternativos'),
    };
    return descriptions[categoryName] || '';
  };

  // Función para traducir títulos de secciones
  const translateSectionTitle = (sectionNumber, originalTitle) => {
    if (sectionNumber === 2) {
      return t('portfolioBuilder.sections.monetarios.title');
    } else if (sectionNumber === 3) {
      return t('portfolioBuilder.sections.rentaVariable.title');
    } else if (sectionNumber === 4) {
      return t('portfolioBuilder.sections.rentaFija.title');
    } else if (sectionNumber === 5) {
      return t('portfolioBuilder.sections.alternativos.title');
    }
    return originalTitle;
  };

  // Función para traducir nombres de subsecciones
  const translateSubsectionName = (name) => {
    if (name === 'Renta Fija Corto Plazo' || name === 'RF Corto Plazo') {
      return t('portfolioBuilder.sections.subsections.rfCortoPlazo.name');
    } else if (name === 'Renta Fija Medio Plazo' || name === 'RF Medio Plazo') {
      return t('portfolioBuilder.sections.subsections.rfMedioPlazo.name');
    }
    return name;
  };

  // Función para traducir descripciones de subsecciones
  const translateSubsectionDescription = (name, originalDescription) => {
    if (name === 'Renta Fija Corto Plazo' || name === 'RF Corto Plazo') {
      return t('portfolioBuilder.sections.subsections.rfCortoPlazo.description');
    } else if (name === 'Renta Fija Medio Plazo' || name === 'RF Medio Plazo') {
      return t('portfolioBuilder.sections.subsections.rfMedioPlazo.description');
    }
    return originalDescription || '';
  };

  // Función para traducir tips comunes
  const translateTip = (tip) => {
    if (!tip) return '';

    // Traducir tips conocidos por patrones
    if (tip.includes('En caso de caidas') || tip.includes('caidas fuertes')) {
      return t('portfolioBuilder.tips.enCasoDeCaidas');
    }
    if (tip.includes('Siempre y cuando')) {
      return t('portfolioBuilder.tips.siempreYCuando');
    }
    if (tip.includes('Máxima rentabilidad')) {
      return t('portfolioBuilder.tips.maximaRentabilidad');
    }
    if (tip.includes('Inversión en empresas')) {
      return t('portfolioBuilder.tips.inversionEnEmpresas');
    }

    // Si no hay traducción específica, devolver el original
    return tip;
  };

  // Función para traducir descripciones comunes
  const translateDescription = (description) => {
    if (!description) return '';

    if (description.includes('Máxima rentabilidad')) {
      return t('portfolioBuilder.descriptions.maximaRentabilidad');
    }
    if (description.includes('Inversión en empresas')) {
      return t('portfolioBuilder.descriptions.inversionEnEmpresas');
    }

    return description;
  };

  // Función para calcular el monto total de una categoría
  const calculateCategoryTotal = (categoryName) => {
    if (!categoryName) return 0;
    const category = calculatorData.categories.find((cat) => cat.name === categoryName);
    if (!category) return 0;
    const totalAmount = calculatorData.totalAmount || 0;
    const weight = parseFloat(category.weight) || 0;
    return totalAmount * (weight / 100);
  };

  // Función para calcular el monto de un fondo basado en la categoría
  const calculateFundAmount = (section, subsection = null) => {
    if (!portfolioData || !calculatorData) return null;

    const categoryName = getCategoryName(section, subsection);
    if (!categoryName) return null;

    const categoryTotalAmount = calculateCategoryTotal(categoryName);

    // Determinar los fondos de esta categoría
    let funds = [];
    if (subsection && subsection.funds) {
      funds = subsection.funds;
    } else if (section.funds) {
      funds = section.funds;
    }

    if (funds.length === 0) return null;

    // Distribuir equitativamente entre los fondos
    const amountPerFund = categoryTotalAmount / funds.length;
    return amountPerFund;
  };

  // Funciones para toggle de secciones
  const toggleSection = (sectionId) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const toggleVideos = (sectionIdentifier) => {
    setExpandedVideos((prev) => {
      const newSet = new Set(prev);
      const videoId =
        typeof sectionIdentifier === 'number'
          ? `videos-${sectionIdentifier}`
          : `videos-${sectionIdentifier}`;
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="mb-2">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            {t('portfolioBuilder.title')}
          </h1>
        </div>
        <div className="card">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div
          className={`max-w-xl w-full rounded-2xl border px-6 py-8 text-center ${
            isDark
              ? 'bg-[#18181b] border-[#27272a] text-gray-100'
              : 'bg-white border-gray-200 text-gray-900'
          }`}
        >
          <div className="flex justify-center mb-4">
            <AlertCircle className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2">
            {t('portfolioBuilder.accessDeniedTitle') || 'Acceso a Portfolio Builder restringido'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {error ||
              'Esta cuenta no tiene acceso al Portfolio Builder. Contacta con Javier para que te otorgue permisos si lo considera necesario.'}
          </p>
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
              {t('portfolioBuilder.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 tracking-tight">
              {t('portfolioBuilder.subtitle')}
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none mt-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Solo fondos responsables
            </span>
            <div
              onClick={() => handleEsgOnlyChange(!esgOnly)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                esgOnly ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  esgOnly ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </label>
        </div>
      </div>

      {/* Tabla de Cálculos Interactiva - Asignación de Cartera */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => toggleSection('calculator')}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              {expandedSections.has('calculator') ? (
                <ChevronDown className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
              )}
            </button>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--user-color-600)' }}>
              <Calculator className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('portfolioBuilder.calculator.title')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('portfolioBuilder.calculator.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {expandedSections.has('calculator') && (
          <div className="mt-6">
            {/* Input del monto total */}
            <div
              className="mb-6 p-4 rounded-lg border"
              style={
                isDark
                  ? {
                      backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.1)`,
                      borderColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.3)`,
                    }
                  : {
                      backgroundColor: 'var(--user-color-50)',
                      borderColor: 'var(--user-color-200)',
                    }
              }
            >
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t('portfolioBuilder.calculator.totalAmount')}
              </label>
              <input
                type="number"
                value={calculatorData.totalAmount}
                onChange={(e) =>
                  setCalculatorData({
                    ...calculatorData,
                    totalAmount: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1d1d1f] text-gray-900 dark:text-gray-100 text-lg font-semibold"
                placeholder="120000"
              />
            </div>

            {/* Slider de rentabilidad objetivo */}
            <div
              className="mb-6 p-4 rounded-lg border"
              style={
                isDark
                  ? {
                      backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.08)`,
                      borderColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.25)`,
                    }
                  : {
                      backgroundColor: 'var(--user-color-50)',
                      borderColor: 'var(--user-color-200)',
                    }
              }
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Rentabilidad objetivo
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Mueve el slider para ajustar los pesos automáticamente
                  </p>
                </div>
                <span
                  className="text-2xl font-bold tabular-nums"
                  style={
                    isDark ? { color: 'var(--user-color-400)' } : { color: 'var(--user-color-700)' }
                  }
                >
                  {allocationValues.totalReturn}
                </span>
              </div>

              {/* Track con gradiente de color y slider */}
              <div className="relative">
                {/* Gradiente de fondo del track */}
                <div
                  className="absolute top-1/2 left-0 right-0 h-2 rounded-full pointer-events-none"
                  style={{
                    transform: 'translateY(-50%)',
                    background: 'linear-gradient(to right, #10b981 0%, #f59e0b 50%, #ef4444 100%)',
                    opacity: 0.35,
                  }}
                />
                {/* Relleno activo hasta la posición actual */}
                <div
                  className="absolute top-1/2 left-0 h-2 rounded-full pointer-events-none"
                  style={{
                    transform: 'translateY(-50%)',
                    width: `${Math.max(0, Math.min(100, ((currentTotalReturnNum - minExpectedReturn) / (maxExpectedReturn - minExpectedReturn)) * 100))}%`,
                    background: 'linear-gradient(to right, #10b981 0%, #f59e0b 50%, #ef4444 100%)',
                    opacity: 0.8,
                  }}
                />
                <input
                  type="range"
                  min={minExpectedReturn}
                  max={maxExpectedReturn}
                  step={0.1}
                  value={currentTotalReturnNum}
                  onChange={(e) => applyTargetReturn(parseFloat(e.target.value))}
                  className="relative w-full h-2 appearance-none bg-transparent cursor-pointer"
                  style={{ zIndex: 1 }}
                />
              </div>

              {/* Etiquetas de escala — posicionadas absolutamente para alinearse con el track */}
              <div className="relative h-8 mt-1 text-xs text-gray-500 dark:text-gray-400 select-none">
                {[
                  ...calculatorData.categories.map((cat) => ({
                    value: cat.expectedReturn,
                    label: `${cat.expectedReturn.toFixed(1)}%`,
                    title: `${getCategoryDisplayName(cat.name)}: ${cat.expectedReturn}%`,
                  })),
                  // Marca Cartera1 (equilibrado de referencia)
                  {
                    value: cartera1Return,
                    label: `${cartera1Return.toFixed(1)}%`,
                    title: 'Cartera1 — equilibrado',
                    isCartera1: true,
                  },
                  // Marca extra de referencia
                  { value: 7, label: '7.0%', title: 'Referencia: 7%' },
                ]
                  .sort((a, b) => a.value - b.value)
                  .map((mark) => {
                    const pct =
                      ((mark.value - minExpectedReturn) / (maxExpectedReturn - minExpectedReturn)) *
                      100;
                    const isActive = Math.abs(currentTotalReturnNum - mark.value) < 0.3;
                    const isC1 = mark.isCartera1;
                    return (
                      <button
                        key={mark.value}
                        type="button"
                        onClick={() => applyTargetReturn(mark.value)}
                        className="absolute top-0 -translate-x-1/2 flex flex-col items-center gap-0.5 hover:opacity-90 transition-opacity"
                        style={{ left: `${pct}%` }}
                        title={mark.title}
                      >
                        {/* Línea indicadora — más larga y coloreada para Cartera1 */}
                        <span
                          className={`rounded-full ${isC1 ? 'w-0.5 h-3' : 'w-px h-2'}`}
                          style={{
                            backgroundColor:
                              isC1 && !isActive
                                ? isDark
                                  ? 'var(--user-color-500)'
                                  : 'var(--user-color-500)'
                                : isActive
                                  ? isDark
                                    ? 'var(--user-color-400)'
                                    : 'var(--user-color-600)'
                                  : 'currentColor',
                          }}
                        />
                        {/* Valor */}
                        <span
                          style={
                            isActive
                              ? isDark
                                ? { color: 'var(--user-color-300)', fontWeight: 700 }
                                : { color: 'var(--user-color-700)', fontWeight: 700 }
                              : isC1
                                ? isDark
                                  ? { color: 'var(--user-color-400)', fontWeight: 600 }
                                  : { color: 'var(--user-color-600)', fontWeight: 600 }
                                : {}
                          }
                        >
                          {mark.label}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Tabla de asignación */}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-[#1d1d1f]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t('portfolioBuilder.calculator.category')}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t('portfolioBuilder.calculator.expectedReturn')}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t('portfolioBuilder.calculator.weight')}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t('portfolioBuilder.calculator.portfolioReturn')}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t('portfolioBuilder.calculator.amount')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t('portfolioBuilder.calculator.description')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {allocationValues.categories.map((category, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-[#1d1d1f]">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {getCategoryDisplayName(category.name)}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-gray-100">
                        {category.expectedReturn.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={category.weight}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value) || 0;

                            // Calcular la suma de los otros pesos (excluyendo el actual)
                            const sumOfOthers = calculatorData.categories.reduce(
                              (sum, cat, idx) => {
                                if (idx === index) return sum;
                                return sum + (parseFloat(cat.weight) || 0);
                              },
                              0
                            );

                            // Calcular el máximo permitido para este peso
                            const maxAllowed = 100 - sumOfOthers;

                            // Limitar el valor al máximo permitido
                            const limitedValue = Math.min(Math.max(0, newValue), maxAllowed);

                            const newCategories = [...calculatorData.categories];
                            newCategories[index].weight = limitedValue;
                            setCalculatorData({
                              ...calculatorData,
                              categories: newCategories,
                            });
                          }}
                          className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#1d1d1f] text-gray-900 dark:text-gray-100 text-center text-sm font-semibold"
                        />
                        <span className="ml-1 text-sm text-gray-600 dark:text-gray-400">%</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {(category.portfolioReturn * 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(category.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 italic">
                        {translateCategoryDescription(category.name) || category.description}
                      </td>
                    </tr>
                  ))}
                  <tr
                    className={`font-semibold ${totalWeightSum > 100 ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                    style={
                      totalWeightSum <= 100
                        ? isDark
                          ? {
                              backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.1)`,
                            }
                          : {
                              backgroundColor: 'var(--user-color-50)',
                            }
                        : {}
                    }
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" colSpan="3">
                      {t('portfolioBuilder.calculator.total')}
                      {totalWeightSum !== 100 && (
                        <span
                          className={`ml-2 text-xs font-normal ${
                            totalWeightSum > 100
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-yellow-600 dark:text-yellow-400'
                          }`}
                        >
                          ({totalWeightSum.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-center text-sm"
                      style={
                        isDark
                          ? {
                              color: 'var(--user-color-400)',
                            }
                          : {
                              color: 'var(--user-color-900)',
                            }
                      }
                    >
                      {allocationValues.totalReturn}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-gray-100"></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {t('portfolioBuilder.calculator.riskProfile')}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              riskProfile.color === 'green'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                                : riskProfile.color === 'yellow'
                                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                                  : riskProfile.color === 'orange'
                                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'
                                    : riskProfile.color === 'red'
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                            }`}
                            style={
                              riskProfile.color === 'blue'
                                ? isDark
                                  ? {
                                      backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.2)`,
                                      color: 'var(--user-color-300)',
                                    }
                                  : {
                                      backgroundColor: 'var(--user-color-100)',
                                      color: 'var(--user-color-800)',
                                    }
                                : {}
                            }
                          >
                            {riskProfile.profile}
                          </span>
                        </div>
                        {totalWeightSum > 100 && (
                          <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                            {t('portfolioBuilder.calculator.weightSumWarning')}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Guardar configuración en BBDD */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={savePortfolioConfig}
                disabled={saving || !portfolioData}
                className="px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--user-color-600)' }}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {saveMessage && (
                <span
                  className={`text-sm ${
                    saveMessage.type === 'success'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {saveMessage.text}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {refreshResult && (
                  <span
                    className={`text-sm ${refreshResult.error ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}
                  >
                    {refreshResult.error
                      ? `Error: ${refreshResult.error}`
                      : `✓ ${refreshResult.updated} fondos actualizados${refreshResult.failed ? `, ${refreshResult.failed} sin datos` : ''}`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={refreshFundMetrics}
                  disabled={refreshingMetrics}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Actualizar rentabilidad y volatilidad 12M desde Morningstar"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshingMetrics ? 'animate-spin' : ''}`} />
                  {refreshingMetrics ? 'Actualizando…' : 'Actualizar métricas'}
                </button>
                {showResetConfirm ? (
                  <>
                    <span className="text-sm text-red-600 dark:text-red-400">
                      ¿Seguro? Se borrará toda la configuración personalizada.
                    </span>
                    <button
                      type="button"
                      onClick={resetPortfolioConfig}
                      disabled={resetting}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
                    >
                      {resetting ? 'Reseteando…' : 'Sí, resetear'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Resetear configuración
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Secciones de Tipos de Inversión */}
      {portfolioData.sections
        .filter((section) => section.number !== 1)
        .flatMap((section) => {
          // Si es Renta Fija (sección 4), expandir las subsecciones como cards separadas
          if (section.number === 4 && section.subsections && section.subsections.length > 0) {
            return section.subsections
              .sort((a, b) => {
                // Ordenar: Renta Fija Corto Plazo primero, luego Renta Fija Medio Plazo
                if (a.name === 'Renta Fija Corto Plazo') return -1;
                if (b.name === 'Renta Fija Corto Plazo') return 1;
                if (a.name === 'Renta Fija Medio Plazo') return -1;
                if (b.name === 'Renta Fija Medio Plazo') return 1;
                return 0;
              })
              .map((subsection) => ({
                ...section,
                isSubsection: true,
                subsectionData: {
                  ...subsection,
                  // Pasar la nota de la sección principal a las subsecciones si no tienen una propia
                  note: subsection.note || section.note || null,
                },
                subsectionName: subsection.name,
                // Asignar números de orden para el sorting: Renta Fija Corto Plazo = 2, Renta Fija Medio Plazo = 3
                subsectionOrder: subsection.name === 'Renta Fija Corto Plazo' ? 2 : 3,
              }));
          }
          return [section];
        })
        .sort((a, b) => {
          // Ordenar según el orden de la calculadora: Monetarios, RF Corto, RF Medio, RV, Alternativos
          const orderA = a.isSubsection
            ? a.subsectionOrder
            : a.number === 2
              ? 1
              : a.number === 3
                ? 4
                : a.number === 5
                  ? 5
                  : 99;
          const orderB = b.isSubsection
            ? b.subsectionOrder
            : b.number === 2
              ? 1
              : b.number === 3
                ? 4
                : b.number === 5
                  ? 5
                  : 99;
          return orderA - orderB;
        })
        .map((section) => {
          // Si es una subsección de Renta Fija, usar datos de la subsección
          const isSubsection = section.isSubsection;
          const subsection = isSubsection ? section.subsectionData : null;
          // categoryKey para fondos extra / eliminar: en subsecciones viene de subsection, si no de section
          const currentCategoryKey =
            (isSubsection && subsection?.categoryKey) || section?.categoryKey;
          // Función para formatear títulos con nombres completos
          const formatDisplayTitle = (title) => {
            if (title.includes('RF Corto Plazo')) {
              return title.replace(
                'RF Corto Plazo',
                t('portfolioBuilder.sections.subsections.rfCortoPlazo.name')
              );
            }
            if (title.includes('Renta Fija Corto Plazo')) {
              return t('portfolioBuilder.sections.subsections.rfCortoPlazo.name');
            }
            if (title.includes('RF Medio Plazo')) {
              return title.replace(
                'RF Medio Plazo',
                t('portfolioBuilder.sections.subsections.rfMedioPlazo.name')
              );
            }
            if (title.includes('Renta Fija Medio Plazo')) {
              return t('portfolioBuilder.sections.subsections.rfMedioPlazo.name');
            }
            if (title.includes('(RV)')) {
              return title.replace('(RV)', '');
            }
            // Traducir títulos de secciones
            if (title.includes('Ahorro Remunerado') || title.includes('Fondos Monetarios')) {
              return t('portfolioBuilder.sections.monetarios.title');
            }
            if (title.includes('Inversión a Largo Plazo') || title.includes('Fondos Indexados')) {
              return t('portfolioBuilder.sections.rentaVariable.title');
            }
            if (title.includes('Renta Fija') || title.includes('Bonos')) {
              return t('portfolioBuilder.sections.rentaFija.title');
            }
            if (title.includes('Inversiones Alternativas')) {
              return t('portfolioBuilder.sections.alternativos.title');
            }
            return title;
          };

          const displayTitle = isSubsection
            ? translateSubsectionName(section.subsectionName)
            : `${section.number}. ${translateSectionTitle(section.number, section.title)}`;

          // Función para formatear descripciones eliminando diminutivos y traduciendo
          const formatDescription = (description) => {
            if (!description) return '';
            let formatted = description
              .replace(/\bRF\b/g, t('portfolioBuilder.categories.rfCorto'))
              .replace(/\bRV\b/g, t('portfolioBuilder.categories.rv'))
              .replace(/\bFM\b/g, 'Fondo Monetario')
              .replace(/RF Corto/g, t('portfolioBuilder.categories.rfCorto'))
              .replace(/RF Medio/g, t('portfolioBuilder.categories.rfMedio'));
            return formatted;
          };

          const displayDescription = isSubsection
            ? translateSubsectionDescription(subsection?.name, subsection?.description)
            : translateDescription(section.description) ||
              formatDescription(section.description || '');

          const Icon = section.icon;
          const sectionId = isSubsection
            ? `subsection-${section.number}-${subsection?.name?.replace(/\s+/g, '-')}`
            : `section-${section.number}`;
          const isExpanded = expandedSections.has(sectionId);

          // Si es Renta Fija con subsecciones y no es una subsección, no renderizar la card principal
          if (
            section.number === 4 &&
            section.subsections &&
            section.subsections.length > 0 &&
            !isSubsection
          ) {
            return null;
          }

          return (
            <div key={isSubsection ? sectionId : section.number} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <button
                    onClick={() => toggleSection(sectionId)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors mt-1"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                    )}
                  </button>
                  <div
                    className="p-3 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: 'var(--user-color-600)' }}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {displayTitle}
                    </h2>
                    {displayDescription && (
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{displayDescription}</p>
                    )}
                    {(isSubsection ? subsection?.note : section.note) && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          <AlertCircle className="h-4 w-4 inline mr-2" />
                          {translateTip(isSubsection ? subsection?.note : section.note)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-6">
                  {/* Tips */}
                  {section.tips && section.tips.length > 0 && (
                    <div className="mb-6 space-y-2">
                      {section.tips.map((tip, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-3 rounded-lg"
                          style={
                            isDark
                              ? {
                                  backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.1)`,
                                }
                              : {
                                  backgroundColor: 'var(--user-color-50)',
                                }
                          }
                        >
                          <Info
                            className="h-5 w-5 flex-shrink-0 mt-0.5"
                            style={
                              isDark
                                ? {
                                    color: 'var(--user-color-400)',
                                  }
                                : {
                                    color: 'var(--user-color-600)',
                                  }
                            }
                          />
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {translateTip(tip)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ratios de Inmuebles */}
                  {section.ratios && section.ratios.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        {t('portfolioBuilder.sections.ratios.title')}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead className="bg-gray-100 dark:bg-[#1d1d1f]">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t('portfolioBuilder.sections.ratios.price')}
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t('portfolioBuilder.sections.ratios.rent')}
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t('portfolioBuilder.sections.ratios.ratio')}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {section.ratios.map((ratio, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                  {formatCurrency(ratio.price)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                  {formatCurrency(ratio.rent)}
                                </td>
                                <td className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {ratio.ratio.toFixed(0)}:1
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Financiación */}
                  {section.financing && section.financing.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        {t('portfolioBuilder.sections.financing.title')}
                      </h3>
                      <ul className="space-y-2">
                        {section.financing.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                          >
                            <span
                              className="mt-1"
                              style={
                                isDark
                                  ? {
                                      color: 'var(--user-color-400)',
                                    }
                                  : {
                                      color: 'var(--user-color-600)',
                                    }
                              }
                            >
                              •
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Distribución de Capital para RV (solo secciones con distribution, no Monetarios/Alternativos) */}
                  {(() => {
                    const hasItems = section.distribution && section.distribution.length > 0;
                    if (!hasItems) return null;

                    const categoryName = getCategoryName(section);
                    const dynamicTotal = calculateCategoryTotal(categoryName);

                    // Merge distribution slots and extra funds into a single list.
                    // Items with _seq (added this session) sort chronologically;
                    // items without _seq (loaded from DB) keep their natural load order and come first.
                    const mergedItems = [
                      ...(section.distribution || []).map((item, realIdx) => ({
                        ...item,
                        _type: 'dist',
                        _realIdx: realIdx,
                        _loadOrder: realIdx,
                      })),
                      ...(section.funds || []).map((fund, idx) => ({
                        ...fund,
                        _type: 'extra',
                        _realIdx: idx,
                        _loadOrder: (section.distribution || []).length + idx,
                      })),
                    ].sort((a, b) => {
                      const aSeq = a._seq ?? null;
                      const bSeq = b._seq ?? null;
                      if (aSeq === null && bSeq === null) return a._loadOrder - b._loadOrder;
                      if (aSeq === null) return -1;
                      if (bSeq === null) return 1;
                      return aSeq - bSeq;
                    });

                    return (
                      <div className="mb-6">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          {t('portfolioBuilder.sections.capitalDistribution.title')}
                          {dynamicTotal > 0 && (
                            <span className="ml-2 text-gray-600 dark:text-gray-400 font-normal">
                              {t('portfolioBuilder.sections.capitalDistribution.total', {
                                amount: formatCurrency(dynamicTotal),
                              })}
                            </span>
                          )}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          {mergedItems.map((mergedItem) => {
                            if (mergedItem._type === 'dist') {
                              const item = mergedItem;
                              const idx = item._realIdx;
                              const percentage = parseFloat(item.percentage?.replace('%', '') || 0);
                              const dynamicAmount = dynamicTotal * (percentage / 100);

                              if (item.name) {
                                return (
                                  <div
                                    key={`dist-named-${idx}`}
                                    style={{
                                      background: 'var(--tc-surface)',
                                      border: '1px solid var(--tc-border)',
                                      borderRadius: '8px',
                                      padding: '1rem',
                                    }}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                            {item.name}
                                          </h4>
                                          {item.tags?.includes('recomendado') && (
                                            <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                              Recomendado
                                            </span>
                                          )}
                                          {(() => {
                                            const esg = getEsgBadge(item.tags);
                                            return (
                                              esg && (
                                                <span
                                                  className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${esg.cls}`}
                                                >
                                                  {esg.label}
                                                </span>
                                              )
                                            );
                                          })()}
                                        </div>
                                        {item.isin && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {t(
                                              'portfolioBuilder.sections.capitalDistribution.isin'
                                            )}{' '}
                                            {item.isin}
                                          </p>
                                        )}
                                      </div>
                                      <div className="text-right">
                                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                          {item.percentage}
                                        </p>
                                        {dynamicAmount > 0 && (
                                          <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {formatCurrency(dynamicAmount)}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    {renderFundMetrics(item)}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {item.link && (
                                        <a
                                          href={item.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-sm hover:underline"
                                          style={
                                            isDark
                                              ? { color: 'var(--user-color-400)' }
                                              : { color: 'var(--user-color-600)' }
                                          }
                                        >
                                          {t(
                                            'portfolioBuilder.sections.capitalDistribution.viewFinect'
                                          )}
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                      {section.number === 3 && (
                                        <button
                                          type="button"
                                          onClick={() => removeRvFundFromDistribution(idx)}
                                          className="text-sm text-red-600 dark:text-red-400 hover:underline"
                                        >
                                          Eliminar
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              } else {
                                return (
                                  <div
                                    key={`dist-empty-${idx}`}
                                    style={{
                                      background: 'var(--tc-surface)',
                                      border: '1px solid var(--tc-border)',
                                      borderRadius: '8px',
                                      padding: '1rem',
                                    }}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                          (Sin nombre)
                                        </h4>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-bold text-gray-900 dark:text-gray-100">
                                          {item.percentage}
                                        </p>
                                        {dynamicAmount > 0 && (
                                          <p
                                            className="text-xs"
                                            style={{ color: 'var(--tc-text-3)' }}
                                          >
                                            {formatCurrency(dynamicAmount)}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => removeRvFundFromDistribution(idx)}
                                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Eliminar
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                            } else {
                              const fund = mergedItem;
                              const idx = fund._realIdx;
                              return (
                                <div
                                  key={`extra-${idx}`}
                                  style={{
                                    background: 'var(--tc-surface)',
                                    border: '1px solid var(--tc-border)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                  }}
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                          {fund.name}
                                        </h4>
                                        {fund.tags?.includes('recomendado') && (
                                          <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                            Recomendado
                                          </span>
                                        )}
                                        {(() => {
                                          const esg = getEsgBadge(fund.tags);
                                          return (
                                            esg && (
                                              <span
                                                className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${esg.cls}`}
                                              >
                                                {esg.label}
                                              </span>
                                            )
                                          );
                                        })()}
                                      </div>
                                      {fund.isin && (
                                        <p
                                          className="text-xs mt-0.5"
                                          style={{ color: 'var(--tc-text-3)' }}
                                        >
                                          ISIN: {fund.isin}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {renderFundMetrics(fund)}
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {fund.link && (
                                      <a
                                        href={fund.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs hover:underline"
                                        style={{
                                          color: isDark
                                            ? 'var(--user-color-400)'
                                            : 'var(--user-color-600)',
                                        }}
                                      >
                                        {t(
                                          'portfolioBuilder.sections.capitalDistribution.viewFinect'
                                        )}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                    {currentCategoryKey && fund.isin && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeExtraFund(currentCategoryKey, fund.isin)
                                        }
                                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Subsección vacía por filtro ESG */}
                  {isSubsection &&
                    subsection &&
                    esgOnly &&
                    (!subsection.funds || subsection.funds.length === 0) && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
                        No hay fondos responsables disponibles en esta categoría.
                      </p>
                    )}

                  {/* Fondos de subsección (para Renta Fija Corto Plazo y Renta Fija Medio Plazo cuando son cards separadas) */}
                  {isSubsection &&
                    subsection &&
                    subsection.funds &&
                    subsection.funds.length > 0 &&
                    (() => {
                      const categoryName = getCategoryName(section, subsection);
                      const dynamicTotal = calculateCategoryTotal(categoryName);
                      const namedSubFunds = subsection.funds.filter((f) => f.name);
                      const percentagePerFund =
                        namedSubFunds.length > 0 ? (100 / namedSubFunds.length).toFixed(1) : '0';
                      const fundAmount = calculateFundAmount(section, subsection);
                      const sortedSubFunds = [...subsection.funds].sort((a, b) => {
                        const aSeq = a._seq ?? null;
                        const bSeq = b._seq ?? null;
                        if (aSeq === null && bSeq === null) return 0;
                        if (aSeq === null) return -1;
                        if (bSeq === null) return 1;
                        return aSeq - bSeq;
                      });

                      return (
                        <div className="mb-6">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                            {t('portfolioBuilder.sections.capitalDistribution.title')}
                            {dynamicTotal > 0 && (
                              <span className="ml-2 text-gray-600 dark:text-gray-400 font-normal">
                                {t('portfolioBuilder.sections.capitalDistribution.total', {
                                  amount: formatCurrency(dynamicTotal),
                                })}
                              </span>
                            )}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {sortedSubFunds.map((fund, idx) => {
                              const isManual = fund._manual || !fund.name;
                              return (
                                <div
                                  key={fund._seq ?? idx}
                                  style={{
                                    background: 'var(--tc-surface)',
                                    border: '1px solid var(--tc-border)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                  }}
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                          {fund.name || '(Sin nombre)'}
                                        </h4>
                                        {fund.tags?.includes('recomendado') && (
                                          <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                            Recomendado
                                          </span>
                                        )}
                                        {(() => {
                                          const esg = getEsgBadge(fund.tags);
                                          return (
                                            esg && (
                                              <span
                                                className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${esg.cls}`}
                                              >
                                                {esg.label}
                                              </span>
                                            )
                                          );
                                        })()}
                                      </div>
                                      {fund.isin && (
                                        <p
                                          className="text-xs mt-0.5"
                                          style={{ color: 'var(--tc-text-3)' }}
                                        >
                                          {t('portfolioBuilder.sections.capitalDistribution.isin')}{' '}
                                          {fund.isin}
                                        </p>
                                      )}
                                      {!isManual &&
                                        fund.risk &&
                                        subsection.name !== 'Renta Fija Corto Plazo' && (
                                          <span
                                            className={`inline-block mt-2 px-2 py-1 rounded text-xs font-medium ${
                                              fund.risk.includes('alto')
                                                ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
                                                : fund.risk.includes('medio')
                                                  ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                                                  : 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                                            }`}
                                          >
                                            {fund.risk.includes('alto')
                                              ? t(
                                                  'portfolioBuilder.calculator.riskProfiles.veryAggressive'
                                                )
                                              : fund.risk.includes('medio')
                                                ? t(
                                                    'portfolioBuilder.calculator.riskProfiles.moderate'
                                                  )
                                                : fund.risk.includes('bajo')
                                                  ? t(
                                                      'portfolioBuilder.calculator.riskProfiles.conservative'
                                                    )
                                                  : fund.risk}
                                          </span>
                                        )}
                                    </div>
                                    {!isManual && (
                                      <div className="text-right ml-3 flex-shrink-0">
                                        <p className="font-bold text-gray-900 dark:text-gray-100">
                                          {percentagePerFund}%
                                        </p>
                                        {fundAmount && fundAmount > 0 && (
                                          <p
                                            className="text-xs"
                                            style={{ color: 'var(--tc-text-3)' }}
                                          >
                                            {formatCurrency(fundAmount)}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {!isManual && renderFundMetrics(fund)}
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {fund.link && (
                                      <a
                                        href={fund.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs hover:underline"
                                        style={{
                                          color: isDark
                                            ? 'var(--user-color-400)'
                                            : 'var(--user-color-600)',
                                        }}
                                      >
                                        {t(
                                          'portfolioBuilder.sections.capitalDistribution.viewFinect'
                                        )}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                    {isManual ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeManualFundFromSection(currentCategoryKey, fund._id)
                                        }
                                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Eliminar
                                      </button>
                                    ) : currentCategoryKey && fund.isin ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeExtraFund(currentCategoryKey, fund.isin)
                                        }
                                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Eliminar
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Sección vacía por filtro ESG */}
                  {!isSubsection &&
                    !section.distribution?.length &&
                    esgOnly &&
                    section.funds?.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
                        No hay fondos responsables disponibles en esta categoría.
                      </p>
                    )}

                  {/* Fondos de la sección (Monetarios, Alternativos — no RV, ya están en el grid de distribución) */}
                  {!isSubsection &&
                    !section.distribution?.length &&
                    section.funds &&
                    section.funds.length > 0 &&
                    (() => {
                      const categoryName = getCategoryName(section);
                      const dynamicTotal = calculateCategoryTotal(categoryName);
                      const namedFunds = section.funds.filter((f) => f.name);
                      const pctPerFund = namedFunds.length > 0 ? 100 / namedFunds.length : 0;
                      const sortedFunds = [...section.funds].sort((a, b) => {
                        const aSeq = a._seq ?? null;
                        const bSeq = b._seq ?? null;
                        if (aSeq === null && bSeq === null) return 0;
                        if (aSeq === null) return -1;
                        if (bSeq === null) return 1;
                        return aSeq - bSeq;
                      });
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                          {sortedFunds.map((fund, idx) => {
                            const isManual = fund._manual || !fund.name;
                            const fundAmount =
                              pctPerFund > 0 && !isManual ? dynamicTotal * (pctPerFund / 100) : 0;
                            return (
                              <div
                                key={fund._seq ?? idx}
                                style={{
                                  background: 'var(--tc-surface)',
                                  border: '1px solid var(--tc-border)',
                                  borderRadius: '8px',
                                  padding: '1rem',
                                }}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                        {fund.name || '(Sin nombre)'}
                                      </h4>
                                      {fund.tags?.includes('recomendado') && (
                                        <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                          Recomendado
                                        </span>
                                      )}
                                      {(() => {
                                        const esg = getEsgBadge(fund.tags);
                                        return (
                                          esg && (
                                            <span
                                              className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${esg.cls}`}
                                            >
                                              {esg.label}
                                            </span>
                                          )
                                        );
                                      })()}
                                    </div>
                                    {fund.isin && (
                                      <p
                                        className="text-xs mt-0.5"
                                        style={{ color: 'var(--tc-text-3)' }}
                                      >
                                        ISIN: {fund.isin}
                                      </p>
                                    )}
                                  </div>
                                  {!isManual && pctPerFund > 0 && (
                                    <div className="text-right ml-3 flex-shrink-0">
                                      <p className="font-bold text-gray-900 dark:text-gray-100">
                                        {pctPerFund.toFixed(1)}%
                                      </p>
                                      {fundAmount > 0 && (
                                        <p
                                          className="text-xs"
                                          style={{ color: 'var(--tc-text-3)' }}
                                        >
                                          {formatCurrency(fundAmount)}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {!isManual && renderFundMetrics(fund)}
                                <div className="flex items-center gap-3 flex-wrap">
                                  {fund.link && (
                                    <a
                                      href={fund.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs hover:underline"
                                      style={{
                                        color: isDark
                                          ? 'var(--user-color-400)'
                                          : 'var(--user-color-600)',
                                      }}
                                    >
                                      {t(
                                        'portfolioBuilder.sections.capitalDistribution.viewFinect'
                                      )}
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                  {isManual ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeManualFundFromSection(currentCategoryKey, fund._id)
                                      }
                                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                    >
                                      Eliminar
                                    </button>
                                  ) : currentCategoryKey && fund.isin ? (
                                    <button
                                      type="button"
                                      onClick={() => removeExtraFund(currentCategoryKey, fund.isin)}
                                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                    >
                                      Eliminar
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                  {/* Botones de acción — siempre al final */}
                  <div className="flex flex-wrap gap-2 mt-3 mb-4">
                    {section.number === 3 ? (
                      <button
                        type="button"
                        onClick={addRvFundToDistribution}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        + Añadir fondo
                      </button>
                    ) : currentCategoryKey ? (
                      <button
                        type="button"
                        onClick={() => addManualFundToSection(currentCategoryKey)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        + Añadir fondo
                      </button>
                    ) : null}
                    {portfolioData?.fundsList &&
                      currentCategoryKey &&
                      (() => {
                        const availableToAdd = portfolioData.fundsList.filter(
                          (f) => f.category === currentCategoryKey && f.showInSection !== true
                        );
                        if (availableToAdd.length === 0) return null;
                        const isAdding = addingExtra === currentCategoryKey;
                        return (
                          <button
                            type="button"
                            onClick={() => addExtraFund(currentCategoryKey)}
                            disabled={isAdding}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                          >
                            {isAdding ? 'Añadiendo…' : '+ Añadir más (siguiente de la lista)'}
                          </button>
                        );
                      })()}
                  </div>

                  {(isSubsection ? subsection?.videos : section.videos) &&
                    (isSubsection ? subsection.videos.length > 0 : section.videos.length > 0) && (
                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {t('portfolioBuilder.sections.videos.title')}
                          </h3>
                          <button
                            onClick={() => toggleVideos(isSubsection ? sectionId : section.number)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            {expandedVideos.has(
                              `videos-${isSubsection ? sectionId : section.number}`
                            ) ? (
                              <ChevronDown className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                            )}
                          </button>
                        </div>
                        {expandedVideos.has(
                          `videos-${isSubsection ? sectionId : section.number}`
                        ) && (
                          <div className="space-y-2">
                            {(isSubsection ? subsection.videos : section.videos).map(
                              (video, idx) => (
                                <a
                                  key={idx}
                                  href={video.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#1d1d1f] rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#252525] transition-colors"
                                >
                                  <Play className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {video.description ||
                                        t('portfolioBuilder.sections.videos.viewVideo')}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {video.url}
                                    </p>
                                  </div>
                                  <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                </a>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default PortfolioBuilder;
