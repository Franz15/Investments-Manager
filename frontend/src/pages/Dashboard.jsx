import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CreditCard,
  Activity,
  CalendarDays,
  Layers,
  Landmark,
  BarChart3,
  CalendarRange,
  Percent,
  Scale,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Treemap,
} from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ToggleChip from '../components/ToggleChip';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../contexts/ThemeContext';

// Funciones auxiliares
const formatPrice = (value, currency = 'EUR') => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,00 €';
  }

  const decimalPart = Math.abs((value * 10000) % 100);
  const hasTrailingZeros = decimalPart === 0;
  const decimals = hasTrailingZeros ? 2 : 4;

  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

// Esta función se moverá dentro del componente para usar traducciones

const calculateProfitLoss = (investment) => {
  if (investment.isAutomatedPortfolio) {
    return investment.currentPrice - investment.quantity;
  }
  const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
  return (investment.currentPrice - avgPrice) * investment.quantity;
};

const calculateProfitLossPercentage = (investment) => {
  if (investment.isAutomatedPortfolio) {
    if (investment.quantity === 0) return 0;
    return ((investment.currentPrice - investment.quantity) / investment.quantity) * 100;
  }
  const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
  if (!avgPrice || avgPrice === 0) return 0;
  return ((investment.currentPrice - avgPrice) / avgPrice) * 100;
};

// Tooltip común para gráficas: estilo moderno y compatible con tema claro/oscuro
const ChartTooltip = ({ active, payload, label, labelLabel = 'Fecha', valueFormatter, isDark }) => {
  if (!active || !payload?.length) return null;
  const bg = isDark ? 'bg-[#2c2c2e] border-[#404040]' : 'bg-white border-gray-200';
  return (
    <div className={`${bg} border rounded-xl shadow-xl px-4 py-3 min-w-[140px]`}>
      {label && (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
          {labelLabel}: {label}
        </p>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-600 dark:text-gray-300" style={{ color: entry.color }}>
            ● {entry.name}
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {valueFormatter ? valueFormatter(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [stats, setStats] = useState(null);
  const [balanceChart, setBalanceChart] = useState([]);
  const [investmentsEvolution, setInvestmentsEvolution] = useState([]);
  const [distributionByAssetClass, setDistributionByAssetClass] = useState([]);
  const [distributionByAssetType, setDistributionByAssetType] = useState([]);
  const [investmentsDetailed, setInvestmentsDetailed] = useState([]);
  const [distributionByBank, setDistributionByBank] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [showBalanceTooltip, setShowBalanceTooltip] = useState(false);
  const [showInvestmentDetailModal, setShowInvestmentDetailModal] = useState(false);
  const [selectedTreemapInvestment, setSelectedTreemapInvestment] = useState(null);
  const [detailInvestmentHistory, setDetailInvestmentHistory] = useState([]);
  const [detailDailyVariations, setDetailDailyVariations] = useState([]);
  const [includeBusinessAccounts, setIncludeBusinessAccounts] = useState(false);
  const navigate = useNavigate();
  const resizeTimeoutRef = useRef(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 640
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getTypeLabel = (type, isAutomatedPortfolio = false) => {
    if (isAutomatedPortfolio) {
      return t('investments.investmentTypes.automatedPortfolio');
    }
    const types = {
      stock: t('investments.investmentTypes.stock'),
      bond: t('investments.investmentTypes.bond'),
      crypto: t('investments.investmentTypes.crypto'),
      fund: t('investments.investmentTypes.fund'),
      etf: t('investments.investmentTypes.etf'),
      automated_portfolio: t('investments.investmentTypes.automatedPortfolio'),
      other: t('investments.investmentTypes.other'),
    };
    return types[type] || type;
  };

  const getFixedIncomeSubtypeLabel = (fixedIncomeSubtype) => {
    if (fixedIncomeSubtype === 'short') {
      return t('investments.assetClassLabels.fixedIncomeSubtypeShort');
    }
    if (fixedIncomeSubtype === 'medium') {
      return t('investments.assetClassLabels.fixedIncomeSubtypeMedium');
    }
    return '';
  };

  const getFixedIncomeSubtypeTone = (fixedIncomeSubtype) => {
    if (fixedIncomeSubtype === 'short') {
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200';
    }
    if (fixedIncomeSubtype === 'medium') {
      return 'bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100';
    }
    return '';
  };

  const COLORS = [
    '#0ea5e9',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#f97316',
    '#06b6d4',
    '#84cc16',
    '#a855f7',
  ];

  // Colores específicos para cada clase de activo
  const ASSET_CLASS_COLORS = {
    'Renta Fija': '#3b82f6', // Azul
    'Renta Variable': '#10b981', // Verde
    Efectivo: '#f59e0b', // Amarillo/Naranja
  };

  // Colores para tipo de renta (fija corto/medio, variable, alternativa)
  const ASSET_TYPE_COLORS = {
    fixed_short: '#0ea5e9', // sky
    fixed_medium: '#3b82f6', // blue
    variable: '#10b981', // emerald
    alternative: '#8b5cf6', // violet
  };

  // Generar colores para bancos y variaciones para subcuentas
  const generateBankColors = (bankName, subAccountCount, savedColor = null) => {
    const isRenta4 =
      String(bankName || '')
        .toLowerCase()
        .replace(/\s/g, '') === 'renta4';
    const baseColor =
      savedColor && savedColor.trim() !== ''
        ? savedColor
        : (() => {
            const bankBaseColors = {
              Santander: '#ec0000',
              BBVA: '#004481',
              CaixaBank: '#004481',
              ING: '#ff6200',
              MyInvestor: '#00a859',
              Openbank: '#00a859',
              N26: '#000000',
              Revolut: '#0075eb',
              Renta4: '#e85d04',
            };
            return bankBaseColors[bankName] || generateColorFromString(bankName);
          })();

    // Renta4: variaciones muy sutiles (Efectivo / Inversiones) del mismo color
    const variations =
      isRenta4 && subAccountCount > 0
        ? generateSubtleColorVariations(baseColor, subAccountCount)
        : generateColorVariations(baseColor, subAccountCount);

    return {
      base: baseColor,
      variations,
    };
  };

  // Generar color a partir de un string
  const generateColorFromString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Generar variaciones de un color manteniendo el mismo matiz (hue)
  const generateColorVariations = (baseColor, count) => {
    if (count === 0) return [];

    let hue, saturation, lightness;

    // Si es un color HSL, extraer los valores
    if (baseColor.startsWith('hsl')) {
      const match = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        hue = parseInt(match[1]);
        saturation = parseInt(match[2]);
        lightness = parseInt(match[3]);
      } else {
        // Si no coincide, usar valores por defecto
        hue = 200;
        saturation = 70;
        lightness = 50;
      }
    } else {
      // Si es un color hexadecimal, convertir a HSL
      let hex = baseColor.replace('#', '');

      // Manejar colores de 3 dígitos
      if (hex.length === 3) {
        hex = hex
          .split('')
          .map((char) => char + char)
          .join('');
      }

      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h,
        s,
        l = (max + min) / 2;

      if (max === min) {
        // Color gris: sin matiz, saturación 0
        h = 0;
        s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
          default:
            h = 0;
        }
      }

      hue = Math.round(h * 360);
      saturation = Math.round(s * 100);
      lightness = Math.round(l * 100);
    }

    // Generar variaciones manteniendo el mismo matiz (hue), variando solo saturación y luminosidad
    return Array.from({ length: count }, (_, i) => {
      // Variar la luminosidad: más claro para las primeras subcuentas, más oscuro para las últimas
      const lightVariation = lightness + i * 8 - (count - 1) * 4;

      // Para colores grises (saturación 0), mantener saturación en 0 y solo variar luminosidad
      // Para colores con saturación, variar ligeramente la saturación para crear más contraste
      let satVariation;
      if (saturation === 0) {
        // Color gris: mantener saturación en 0
        satVariation = 0;
      } else {
        // Color con saturación: variar ligeramente
        satVariation = saturation + (i % 2 === 0 ? 5 : -5);
        satVariation = Math.max(50, Math.min(100, satVariation));
      }

      // Mantener el matiz (hue) constante, solo variar saturación y luminosidad
      return `hsl(${hue}, ${satVariation}%, ${Math.max(35, Math.min(75, lightVariation))}%)`;
    });
  };

  // Variaciones muy sutiles del mismo color (solo ±luminosidad pequeña): para Renta4 Efectivo/Inversiones
  const generateSubtleColorVariations = (baseColor, count) => {
    if (count === 0) return [];
    // Recalcular con pasos de luminosidad mucho menores (±3% por paso)
    let hue, saturation, lightness;
    const bc = baseColor.replace(/\s/g, '');
    if (bc.startsWith('hsl')) {
      const match = bc.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        hue = parseInt(match[1]);
        saturation = parseInt(match[2]);
        lightness = parseInt(match[3]);
      } else {
        hue = 200;
        saturation = 70;
        lightness = 50;
      }
    } else {
      let hex = baseColor.replace('#', '');
      if (hex.length === 3)
        hex = hex
          .split('')
          .map((c) => c + c)
          .join('');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0;
      let s = 0;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
          default:
            break;
        }
      }
      hue = Math.round(h * 360);
      saturation = Math.round(s * 100);
      lightness = Math.round(l * 100);
    }
    const step = 3;
    const half = (count - 1) / 2;
    return Array.from({ length: count }, (_, i) => {
      const lightVariation = lightness + (i - half) * step;
      return `hsl(${hue}, ${saturation}%, ${Math.max(20, Math.min(85, lightVariation))}%)`;
    });
  };

  // Datos para Recharts BarChart (distribución por banco): barras horizontales apiladas por subcuenta
  const bankChartData =
    distributionByBank && distributionByBank.length > 0
      ? (() => {
          const maxSubs = Math.max(
            ...distributionByBank.map((b) => (b.subAccounts || []).length),
            1
          );
          const sorted = [...distributionByBank].sort((a, b) => (b.total || 0) - (a.total || 0));
          return sorted.map((bank) => {
            const subs = bank.subAccounts || [];
            const colors = generateBankColors(bank.bankName, subs.length, bank.color);
            const row = {
              bankName: bank.bankName,
              total: bank.total || 0,
              _colors: colors,
              _subAccounts: subs,
            };
            for (let i = 0; i < maxSubs; i++) {
              row[`seg${i}`] = subs[i]?.value ?? (i === 0 ? bank.total || 0 : 0);
            }
            return row;
          });
        })()
      : null;

  useEffect(() => {
    fetchDashboardData();
  }, [includeBusinessAccounts]);

  const fetchDashboardData = async () => {
    try {
      const params = includeBusinessAccounts ? { includeBusinessAccounts: 'true' } : {};
      const [
        statsRes,
        balanceRes,
        evolutionRes,
        assetClassRes,
        assetTypeRes,
        detailedRes,
        bankRes,
        performanceRes,
      ] = await Promise.all([
        api.get('/dashboard/stats', { params }),
        api.get('/dashboard/balance-daily', { params }),
        api.get('/investment-history/evolution?months=6'),
        api.get('/dashboard/distribution-by-asset-class', { params }),
        api.get('/dashboard/distribution-by-asset-type', { params }),
        api.get('/dashboard/investments-detailed', { params }),
        api.get('/dashboard/distribution-by-bank', { params }),
        api.get('/dashboard/performance', { params }),
      ]);
      setStats(statsRes.data);
      // Asegurar que los datos estén ordenados por fecha
      const sortedBalanceData = balanceRes.data.sort((a, b) => new Date(a.date) - new Date(b.date));
      // Verificar valores únicos
      const uniqueBalances = [...new Set(sortedBalanceData.map((item) => item.balance))];

      setBalanceChart(sortedBalanceData);
      setInvestmentsEvolution(evolutionRes.data);
      setDistributionByAssetClass(assetClassRes.data);
      setDistributionByAssetType(assetTypeRes.data);
      setInvestmentsDetailed(detailedRes.data);
      setDistributionByBank(bankRes.data);
      setPerformance(performanceRes.data);
    } catch (error) {}
  };

  if (!stats) {
    return <LoadingSpinner />;
  }

  // Capital aportado INCLUYE EFECTIVO: neto invertido (historial) + efectivo (subcuentas cash/savings/inversión)
  const contributedCapital =
    stats && typeof stats.capitalAportadoIncluyeEfectivo === 'number'
      ? Math.max(0, stats.capitalAportadoIncluyeEfectivo)
      : stats &&
          typeof stats.netInvestedCapital === 'number' &&
          typeof stats.totalCashSavings === 'number'
        ? Math.max(0, stats.netInvestedCapital + stats.totalCashSavings)
        : stats && typeof stats.netInvestedCapital === 'number'
          ? Math.max(0, stats.netInvestedCapital)
          : stats && performance
            ? Math.max(0, (stats.totalBalance || 0) - (performance.accumulatedReturn || 0))
            : null;
  // Rendimiento acumulado = solo inversiones (valor actual - capital neto invertido), no incluye efectivo
  const accumulatedReturn =
    stats && typeof stats.accumulatedReturn === 'number'
      ? stats.accumulatedReturn
      : (performance?.accumulatedReturn ?? null);
  const accumulatedReturnPercent =
    contributedCapital != null && contributedCapital > 0 && accumulatedReturn != null
      ? Number(((accumulatedReturn / contributedCapital) * 100).toFixed(2))
      : ((typeof stats?.accumulatedReturnPercent === 'number'
          ? stats.accumulatedReturnPercent
          : performance?.accumulatedReturnPercent) ?? 0);

  // Color de celda por rentabilidad (para Recharts Treemap)
  const getTreemapCellColor = (pct) => {
    if (pct == null) return '#64748b';
    if (pct === 0) return '#64748b';
    const abs = Math.abs(pct);
    if (pct > 0) {
      if (abs >= 30) return '#047857';
      if (abs >= 15) return '#166534';
      if (abs >= 5) return '#15803d';
      return '#16a34a';
    }
    if (abs >= 30) return '#991b1b';
    if (abs >= 15) return '#b91c1c';
    if (abs >= 5) return '#dc2626';
    return '#ef4444';
  };

  // Datos para Recharts Treemap: array con un root y children (inversiones)
  const rechartsTreemapData =
    investmentsDetailed?.length > 0
      ? [
          {
            name: 'Inversiones',
            children: investmentsDetailed.map((inv) => ({
              name: inv.name,
              value: Math.max(Number(inv.value) || 0, 0.01),
              _id: inv._id,
              totalReturnPercent: inv.totalReturnPercent,
              totalReturn: inv.totalReturn,
            })),
          },
        ]
      : null;

  const handleTreemapClick = async (node) => {
    if (!node?.data?._id || !node.isLeaf) return;
    const dataItem = node.data;
    try {
      const res = await api.get(`/investments/${dataItem._id}`);
      setSelectedTreemapInvestment(res.data);
      const [hist, vars] = await Promise.all([
        api.get(`/investment-history/investment/${dataItem._id}`),
        api.get(`/investment-history/investment/${dataItem._id}/daily-variations`),
      ]);
      setDetailInvestmentHistory(hist.data || []);
      setDetailDailyVariations(vars.data || []);
      setShowInvestmentDetailModal(true);
    } catch (err) {
      console.error('Error al cargar detalles:', err);
      setSelectedTreemapInvestment(dataItem);
      setShowInvestmentDetailModal(true);
    }
  };

  return (
    <div className="space-y-8">
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            {t('dashboard.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 tracking-tight">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ToggleChip
            checked={includeBusinessAccounts}
            onChange={setIncludeBusinessAccounts}
            label={t('dashboard.includeBusinessAccounts')}
          />
        </div>
      </div>

      {/* Primera fila: Resumen financiero */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 auto-rows-fr">
        <div
          className="stat-card row-span-2 col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 flex flex-col cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setShowBalanceTooltip(true)}
        >
          <div
            className="mb-4"
            style={{ borderLeft: '3px solid var(--user-color-500)', paddingLeft: '0.75rem' }}
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
              <CreditCard className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              {t('dashboard.totalBalance')}
            </p>
            <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-none text-gray-900 dark:text-gray-100">
              {new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(stats.totalBalance)}
            </p>
            {performance &&
              performance.annualizedReturn !== null &&
              contributedCapital !== null && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                  {t('dashboard.contributedCapital')}:{' '}
                  {new Intl.NumberFormat('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(contributedCapital || 0)}
                </p>
              )}
          </div>

          {/* Barra de distribución */}
          {(() => {
            const totalAssets = (stats.totalCashSavings || 0) + (stats.totalInvestments || 0);
            const cashPercent =
              totalAssets > 0 ? ((stats.totalCashSavings || 0) / totalAssets) * 100 : 0;
            const investmentPercent =
              totalAssets > 0 ? ((stats.totalInvestments || 0) / totalAssets) * 100 : 0;
            const cashColor = ASSET_CLASS_COLORS['Efectivo'] || '#f59e0b';

            return (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full flex">
                      {investmentPercent > 0 && (
                        <div
                          className="bg-green-500 dark:bg-green-600 transition-all duration-300"
                          style={{ width: `${investmentPercent}%` }}
                        />
                      )}
                      {cashPercent > 0 && (
                        <div
                          className="transition-all duration-300"
                          style={{
                            width: `${cashPercent}%`,
                            backgroundColor: cashColor,
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-600"></div>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">
                        {t('dashboard.invested')}: {investmentPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cashColor }}
                      ></div>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">
                        {t('dashboard.cash')}: {cashPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 space-y-2.5 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('dashboard.investedCapital')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(stats.totalInvestments || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('dashboard.cash')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(stats.totalCashSavings || 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Primera fila: Cambio Diario, Rendimiento Mensual, Rendimiento Acumulado, Deuda */}
        {performance && performance.annualizedReturn !== null && (
          <>
            <div
              className="stat-card"
              style={{
                borderLeft: `3px solid ${(performance.dailyReturnPercent || 0) >= 0 ? '#16a34a' : '#dc2626'}`,
              }}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                <Activity className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                {t('dashboard.dailyChange')}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${(performance.dailyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {(performance.dailyReturnPercent || 0) >= 0 ? '+' : ''}
                {(performance.dailyReturnPercent || 0).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(performance.dailyReturn || 0)}
              </p>
            </div>

            <div
              className="stat-card"
              style={{
                borderLeft: `3px solid ${(performance.monthlyReturnPercent || 0) >= 0 ? '#16a34a' : '#dc2626'}`,
              }}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                {t('dashboard.monthlyReturn')}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${(performance.monthlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {(performance.monthlyReturnPercent || 0) >= 0 ? '+' : ''}
                {(performance.monthlyReturnPercent || 0).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(performance.monthlyReturn || 0)}
              </p>
            </div>

            <div
              className="stat-card"
              style={{
                borderLeft: `3px solid ${accumulatedReturnPercent >= 0 ? '#16a34a' : '#dc2626'}`,
              }}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                <Layers className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                {t('dashboard.accumulatedReturn')}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${accumulatedReturnPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {accumulatedReturnPercent >= 0 ? '+' : ''}
                {accumulatedReturnPercent.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(accumulatedReturn ?? 0)}
              </p>
            </div>
          </>
        )}

        <div className="stat-card" style={{ borderLeft: '3px solid #dc2626' }}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
            <Landmark className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            {t('dashboard.debt')}
          </p>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums leading-none text-red-600 dark:text-red-400">
            {new Intl.NumberFormat('es-ES', {
              style: 'currency',
              currency: 'EUR',
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(stats.totalDebts || 0)}
          </p>
          {(stats.totalGoodDebts > 0 || stats.totalBadDebts > 0) && (
            <div className="mt-2 space-y-0.5">
              {stats.totalBadDebts > 0 && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  {t('debts.badDebt')}{' '}
                  {new Intl.NumberFormat('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(stats.totalBadDebts)}
                </p>
              )}
              {stats.totalGoodDebts > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t('debts.goodDebt')}{' '}
                  {new Intl.NumberFormat('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(stats.totalGoodDebts)}
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
            {new Intl.NumberFormat('es-ES', {
              style: 'currency',
              currency: 'EUR',
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(stats.totalMonthlyDebtPayments || 0)}
            {t('dashboard.monthly')}
          </p>
        </div>

        {/* Segunda fila: Rendimiento Trimestral, Rendimiento Anual, Rendimiento Anualizado, vs SP500 */}
        {performance && performance.annualizedReturn !== null && (
          <>
            <div
              className="stat-card"
              style={{
                borderLeft: `3px solid ${(performance.quarterlyReturnPercent || 0) >= 0 ? '#16a34a' : '#dc2626'}`,
              }}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                <BarChart3 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                {t('dashboard.quarterlyReturn')}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${(performance.quarterlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {(performance.quarterlyReturnPercent || 0) >= 0 ? '+' : ''}
                {(performance.quarterlyReturnPercent || 0).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(performance.quarterlyReturn || 0)}
              </p>
            </div>

            <div
              className="stat-card"
              style={{
                borderLeft: `3px solid ${(performance.annualReturnPercent || 0) >= 0 ? '#16a34a' : '#dc2626'}`,
              }}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                <CalendarRange className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                {t('dashboard.annualReturn')}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${(performance.annualReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {(performance.annualReturnPercent || 0) >= 0 ? '+' : ''}
                {(performance.annualReturnPercent || 0).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(performance.annualReturn || 0)}
              </p>
            </div>

            <div
              className="stat-card"
              style={{
                borderLeft: `3px solid ${performance.annualizedReturn >= 0 ? '#16a34a' : '#dc2626'}`,
              }}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                <Percent className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                {t('dashboard.annualizedReturn')}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${performance.annualizedReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {performance.annualizedReturn >= 0 ? '+' : ''}
                {performance.annualizedReturn.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                Período: {performance.years.toFixed(1)} años
              </p>
            </div>

            {performance.sp500Comparison && (
              <div
                className="stat-card"
                style={{
                  borderLeft: `3px solid ${performance.sp500Comparison.outperformance !== null && performance.sp500Comparison.outperformance >= 0 ? '#16a34a' : '#dc2626'}`,
                }}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                  <Scale className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  {t('dashboard.vsSP500')}
                </p>
                {performance.sp500Comparison.outperformance !== null ? (
                  <>
                    <p
                      className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${performance.sp500Comparison.outperformance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {performance.sp500Comparison.outperformance >= 0 ? '+' : ''}
                      {performance.sp500Comparison.outperformance.toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 tabular-nums">
                      Tu CAGR: {performance.annualizedReturn.toFixed(2)}% | S&P 500:{' '}
                      {performance.sp500Comparison.historicalAnnualReturn}%
                    </p>
                  </>
                ) : (
                  <p className="text-2xl sm:text-3xl font-bold tabular-nums leading-none text-gray-900 dark:text-gray-100">
                    {performance.annualizedReturn.toFixed(2)}% vs{' '}
                    {performance.sp500Comparison.historicalAnnualReturn}%
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Fila 1: Gráficas de evolución (patrimonio total + inversiones) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {balanceChart.length > 0 &&
          (() => {
            const balanceData = balanceChart.map((item) => ({
              date: new Date(item.date).toLocaleDateString('es-ES', {
                month: 'short',
                day: 'numeric',
              }),
              balance: parseFloat(item.balance) || 0,
            }));
            const last = balanceData[balanceData.length - 1]?.balance || 0;
            const delta = last - (balanceData[0]?.balance || 0);
            const fmtFull = (v) =>
              new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
            const fmtCompact = (v) =>
              new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v);
            return (
              <div className="card overflow-hidden">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {t('dashboard.totalNetWorthEvolution')}
                    </h2>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                      {fmtFull(last)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 tabular-nums">
                  {delta >= 0 ? '+' : ''}
                  {fmtFull(delta)} en el período
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={balanceData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: isDark ? '#6b7280' : '#9ca3af', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      height={24}
                    />
                    <YAxis
                      tick={{ fill: isDark ? '#6b7280' : '#9ca3af', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={fmtCompact}
                      width={56}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <ChartTooltip
                          active={active}
                          payload={payload}
                          label={label}
                          labelLabel="Fecha"
                          valueFormatter={fmtFull}
                          isDark={isDark}
                        />
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      name={t('dashboard.totalNetWorth')}
                      stroke="#0ea5e9"
                      strokeWidth={2.5}
                      fill="url(#balanceGradient)"
                      baseValue="dataMin"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0, fill: '#0ea5e9' }}
                      isAnimationActive
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

        {investmentsEvolution.length > 0 &&
          (() => {
            const invData = investmentsEvolution.map((item) => ({
              date: new Date(item.date).toLocaleDateString('es-ES', {
                month: 'short',
                day: 'numeric',
              }),
              value: item.totalValue,
            }));
            const last = invData[invData.length - 1]?.value || 0;
            const fmtFull = (v) =>
              new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
            const fmtCompact = (v) =>
              new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v);
            const retPct = accumulatedReturnPercent ?? 0;
            const retAbs = accumulatedReturn ?? 0;
            return (
              <div className="card overflow-hidden">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Evolución de Inversiones
                    </h2>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                      {fmtFull(last)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-full mt-1 ${retPct >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'}`}
                  >
                    {retPct >= 0 ? '▲' : '▼'} {Math.abs(retPct).toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 tabular-nums">
                  {retAbs >= 0 ? '+' : ''}
                  {fmtFull(retAbs)} rendimiento acumulado
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={invData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="investmentsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: isDark ? '#6b7280' : '#9ca3af', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      height={24}
                    />
                    <YAxis
                      tick={{ fill: isDark ? '#6b7280' : '#9ca3af', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={fmtCompact}
                      width={56}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <ChartTooltip
                          active={active}
                          payload={payload}
                          label={label}
                          labelLabel="Fecha"
                          valueFormatter={fmtFull}
                          isDark={isDark}
                        />
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      name="Valor Total Inversiones"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      fill="url(#investmentsGradient)"
                      baseValue="dataMin"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0, fill: '#8b5cf6' }}
                      isAnimationActive
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
      </div>

      {/* Fila 2: Pie charts (clase de activo + tipo de renta) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
            {t('dashboard.byAssetClass')}
          </h2>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
            <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <Pie
                data={distributionByAssetClass}
                cx="50%"
                cy="50%"
                innerRadius={isMobile ? 50 : 60}
                outerRadius={isMobile ? 80 : 95}
                paddingAngle={2}
                dataKey="value"
                stroke={isDark ? '#2c2c2e' : '#fff'}
                strokeWidth={2}
                label={
                  isMobile
                    ? false
                    : ({ name, percent }) =>
                        percent >= 0.08 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                }
                labelLine={
                  isMobile ? false : { stroke: isDark ? '#525252' : '#d1d5db', strokeWidth: 1 }
                }
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
              >
                {distributionByAssetClass.map((entry, index) => {
                  const color = ASSET_CLASS_COLORS[entry.name] || COLORS[index % COLORS.length];
                  return <Cell key={`asset-${index}`} fill={color} />;
                })}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0].payload;
                  const total = distributionByAssetClass.reduce((s, d) => s + d.value, 0);
                  const pct = total > 0 ? (entry.value / total) * 100 : 0;
                  const bg = isDark ? 'bg-[#2c2c2e] border-[#404040]' : 'bg-white border-gray-200';
                  return (
                    <div className={`${bg} border rounded-xl shadow-xl px-4 py-3`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              ASSET_CLASS_COLORS[entry.name] ||
                              COLORS[distributionByAssetClass.indexOf(entry) % COLORS.length],
                          }}
                        />
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                          {entry.name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Intl.NumberFormat('es-ES', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(entry.value)}{' '}
                        · {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {isMobile && (
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
              {distributionByAssetClass.map((entry, index) => {
                const color = ASSET_CLASS_COLORS[entry.name] || COLORS[index % COLORS.length];
                const total = distributionByAssetClass.reduce((s, d) => s + d.value, 0);
                const pct = total > 0 ? (entry.value / total) * 100 : 0;
                return (
                  <span
                    key={`legend-class-${index}`}
                    className="inline-flex items-center gap-1.5 text-xs"
                    style={{ color: 'var(--tc-text-2)' }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {entry.name} {pct.toFixed(0)}%
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {distributionByAssetType.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
              {t('dashboard.byAssetType')}
            </h2>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
              <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <Pie
                  data={distributionByAssetType}
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobile ? 50 : 60}
                  outerRadius={isMobile ? 80 : 95}
                  paddingAngle={2}
                  dataKey="value"
                  stroke={isDark ? '#2c2c2e' : '#fff'}
                  strokeWidth={2}
                  nameKey="id"
                  label={
                    isMobile
                      ? false
                      : ({ id, percent }) =>
                          percent >= 0.08
                            ? `${t(`dashboard.assetType.${id}`)} ${(percent * 100).toFixed(0)}%`
                            : ''
                  }
                  labelLine={
                    isMobile ? false : { stroke: isDark ? '#525252' : '#d1d5db', strokeWidth: 1 }
                  }
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {distributionByAssetType.map((entry, index) => {
                    const color = ASSET_TYPE_COLORS[entry.id] || COLORS[index % COLORS.length];
                    return <Cell key={`asset-type-${entry.id}`} fill={color} />;
                  })}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0].payload;
                    const total = distributionByAssetType.reduce((s, d) => s + d.value, 0);
                    const pct = total > 0 ? (entry.value / total) * 100 : 0;
                    const bg = isDark
                      ? 'bg-[#2c2c2e] border-[#404040]'
                      : 'bg-white border-gray-200';
                    return (
                      <div className={`${bg} border rounded-xl shadow-xl px-4 py-3`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                ASSET_TYPE_COLORS[entry.id] ||
                                COLORS[distributionByAssetType.indexOf(entry) % COLORS.length],
                            }}
                          />
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {t(`dashboard.assetType.${entry.id}`)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          }).format(entry.value)}{' '}
                          · {pct.toFixed(1)}%
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {isMobile && (
              <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {distributionByAssetType.map((entry, index) => {
                  const color = ASSET_TYPE_COLORS[entry.id] || COLORS[index % COLORS.length];
                  const total = distributionByAssetType.reduce((s, d) => s + d.value, 0);
                  const pct = total > 0 ? (entry.value / total) * 100 : 0;
                  return (
                    <span
                      key={`legend-type-${entry.id}`}
                      className="inline-flex items-center gap-1.5 text-xs"
                      style={{ color: 'var(--tc-text-2)' }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {t(`dashboard.assetType.${entry.id}`)} {pct.toFixed(0)}%
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Distribución por banco (Recharts BarChart horizontal apilado) - 100% ancho */}
      {bankChartData && bankChartData.length > 0 && (
        <div className="card w-full">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
            {t('dashboard.byBank')}
          </h2>
          <ResponsiveContainer width="100%" height={Math.max(280, bankChartData.length * 56)}>
            <BarChart
              data={bankChartData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: isDark ? '#9ca3af' : '#6b7280', fontSize: 11 }}
                axisLine={{ stroke: isDark ? '#404040' : '#e5e7eb' }}
                tickLine={false}
                tickFormatter={(v) =>
                  new Intl.NumberFormat('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    notation: 'compact',
                    maximumFractionDigits: 0,
                  }).format(v)
                }
              />
              <YAxis
                type="category"
                dataKey="bankName"
                width={isMobile ? 72 : 140}
                tick={{ fill: isDark ? '#9ca3af' : '#6b7280', fontSize: isMobile ? 11 : 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => {
                  const max = isMobile ? 10 : 18;
                  return v && v.length > max ? v.slice(0, max - 1) + '…' : v;
                }}
              />
              <Tooltip
                trigger={isMobile ? 'click' : 'hover'}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0].payload;
                  const subs = entry._subAccounts || [];
                  const colors = entry._colors;
                  const bg = isDark ? 'bg-[#2c2c2e] border-[#404040]' : 'bg-white border-gray-200';
                  return (
                    <div className={`${bg} border rounded-xl shadow-xl px-4 py-3 min-w-[200px]`}>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-1 border-b border-gray-200 dark:border-gray-600">
                        {entry.bankName}
                      </p>
                      {subs.length > 0 ? (
                        subs.map((sub, i) => (
                          <div
                            key={i}
                            className="flex justify-between gap-4 py-0.5 items-center text-sm"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: colors?.variations?.[i] ?? colors?.base,
                                }}
                              />
                              <span className="truncate text-gray-700 dark:text-gray-300">
                                {sub.name}
                              </span>
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: 'EUR',
                              }).format(sub.value || 0)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          }).format(entry.total)}
                        </p>
                      )}
                      <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-600 font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        <span>Total</span>
                        <span className="tabular-nums">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                          }).format(entry.total)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              {bankChartData[0] &&
                Object.keys(bankChartData[0])
                  .filter((k) => /^seg\d+$/.test(k))
                  .sort(
                    (a, b) =>
                      parseInt(a.replace('seg', ''), 10) - parseInt(b.replace('seg', ''), 10)
                  )
                  .map((segKey) => (
                    <Bar key={segKey} dataKey={segKey} stackId="bank" radius={0} minPointSize={4}>
                      {bankChartData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={
                            entry._colors?.variations?.[parseInt(segKey.replace('seg', ''), 10)] ??
                            entry._colors?.base
                          }
                        />
                      ))}
                    </Bar>
                  ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mapa de calor por inversión (estilo Recharts / Financial Hub) - 100% ancho */}
      {rechartsTreemapData && investmentsDetailed.length > 0 && (
        <div className="card w-full overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Mapa de calor · {t('dashboard.byInvestment')}
            </h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#047857' }}
                  aria-hidden
                />
                ≥30%
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#166534' }}
                  aria-hidden
                />
                15-30%
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#15803d' }}
                  aria-hidden
                />
                5-15%
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#16a34a' }}
                  aria-hidden
                />
                0-5%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm shrink-0 bg-slate-500" aria-hidden />
                0%
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#ef4444' }}
                  aria-hidden
                />
                0 a -5%
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#dc2626' }}
                  aria-hidden
                />
                -5 a -15%
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#b91c1c' }}
                  aria-hidden
                />
                -15 a -30%
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: '#991b1b' }}
                  aria-hidden
                />
                &lt;-30%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm shrink-0 bg-slate-500" aria-hidden />
                Sin datos
              </span>
            </div>
          </div>
          <div
            className="w-full overflow-visible rounded-lg bg-gray-100 dark:bg-gray-800/60"
            style={{ height: '500px', minHeight: '500px' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={rechartsTreemapData}
                dataKey="value"
                type="flat"
                aspectRatio={0.5 * (1 + Math.sqrt(5))}
                isAnimationActive
                animationDuration={500}
                onClick={(node) => {
                  if (node.depth === 1 && node._id) {
                    handleTreemapClick({ data: node, isLeaf: true });
                  }
                }}
                content={(props) => {
                  const { x, y, width, height, depth, name, value, totalReturnPercent, _id } =
                    props;
                  if (depth === 0) return null;
                  const color = getTreemapCellColor(totalReturnPercent);
                  const minSide = Math.min(width, height);
                  const fontSize = Math.max(10, Math.min(30, Math.floor(minSide / 8)));
                  const pctStr =
                    totalReturnPercent != null && !Number.isNaN(totalReturnPercent)
                      ? `${totalReturnPercent >= 0 ? '+' : ''}${totalReturnPercent.toFixed(2)}%`
                      : '';
                  return (
                    <g>
                      <foreignObject
                        x={x}
                        y={y}
                        width={Math.max(1, width)}
                        height={Math.max(1, height)}
                        style={{ overflow: 'visible' }}
                      >
                        <div
                          className="relative w-full h-full"
                          xmlns="http://www.w3.org/1999/xhtml"
                        >
                          <div
                            className="h-full w-full flex flex-col items-center justify-center p-1 text-center cursor-pointer select-none border border-black/10 transition-colors"
                            style={{
                              backgroundColor: color,
                              backgroundImage:
                                'linear-gradient(to right bottom, rgba(255,255,255,0.1), rgba(0,0,0,0.1))',
                              opacity: 1,
                            }}
                          >
                            <div className="flex flex-col items-center justify-center w-full h-full">
                              <div
                                className="font-bold text-white leading-none w-full px-0.5 truncate text-center"
                                style={{
                                  fontSize: `${fontSize}px`,
                                  textShadow: 'rgba(0,0,0,0.3) 0px 1px 2px',
                                }}
                              >
                                {name}
                              </div>
                              {pctStr && (
                                <div
                                  className="font-medium text-white/90 mt-0.5"
                                  style={{
                                    fontSize: `${Math.max(10, Math.floor(fontSize * 0.6))}px`,
                                  }}
                                >
                                  {pctStr}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </foreignObject>
                    </g>
                  );
                }}
              />
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Rendimientos históricos por año */}
      {performance?.historicalReturns?.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
            {t('dashboard.historicalReturns')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                    {t('dashboard.historical.year')}
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                    {t('dashboard.historical.return')}
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    {t('dashboard.historical.startValue')}
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    {t('dashboard.historical.endValue')}
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">
                    {t('dashboard.historical.contributed')}
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">
                    {t('dashboard.historical.withdrawn')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {performance.historicalReturns.map((yr) => {
                  const isPositive = yr.totalChange >= 0;
                  const fmt = (v) =>
                    new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                      maximumFractionDigits: 0,
                    }).format(v);
                  return (
                    <tr
                      key={yr.year}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {yr.year}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={`font-bold text-base ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                          >
                            {isPositive ? '+' : ''}
                            {fmt(yr.totalChange)}
                          </span>
                          <span
                            className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isPositive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
                          >
                            {isPositive ? '+' : ''}
                            {yr.changePercent.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                        {fmt(yr.startValue)}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                        {fmt(yr.endValue)}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {yr.contributed > 0 ? (
                          <span className="text-blue-600 dark:text-blue-400">
                            +{fmt(yr.contributed)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {yr.withdrawn > 0 ? (
                          <span className="text-orange-600 dark:text-orange-400">
                            -{fmt(yr.withdrawn)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tooltip/Modal del Balance Total */}
      {showBalanceTooltip &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            style={{ zIndex: 10000 }}
            onClick={() => setShowBalanceTooltip(false)}
          >
            <div
              className="modal-content max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {t('dashboard.totalBalance')}
                </h2>
                <button
                  onClick={() => setShowBalanceTooltip(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Balance Total y Capital Aportado */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('dashboard.totalBalance')}
                    </span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 0,
                      }).format(stats.totalBalance)}
                    </span>
                  </div>
                  {performance && contributedCapital !== null && (
                    <>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('dashboard.contributedCapital')}
                        </span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            maximumFractionDigits: 0,
                          }).format(contributedCapital || 0)}
                        </span>
                      </div>
                      {(() => {
                        const totalReturn = stats.totalBalance - (contributedCapital || 0);
                        const totalReturnPercent =
                          (contributedCapital || 0) > 0
                            ? (totalReturn / (contributedCapital || 0)) * 100
                            : 0;
                        return (
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {t('dashboard.totalProfitLoss')}
                            </span>
                            <div className="text-right">
                              <span
                                className={`text-sm font-semibold ${totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                              >
                                {totalReturn >= 0 ? '+' : ''}
                                {new Intl.NumberFormat('es-ES', {
                                  style: 'currency',
                                  currency: 'EUR',
                                  maximumFractionDigits: 0,
                                }).format(totalReturn)}
                              </span>
                              <span
                                className={`text-xs ml-2 ${totalReturnPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                              >
                                ({totalReturnPercent >= 0 ? '+' : ''}
                                {totalReturnPercent.toFixed(2)}%)
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>

                {/* Patrimonio Neto */}
                {stats.totalDebts > 0 && (
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4 space-y-2">
                    {stats.totalBadDebts > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-500 dark:text-red-400">
                          {t('debts.badDebt')}
                        </span>
                        <span className="text-xs font-medium text-red-600 dark:text-red-400">
                          -
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            maximumFractionDigits: 0,
                          }).format(stats.totalBadDebts)}
                        </span>
                      </div>
                    )}
                    {stats.totalGoodDebts > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                          {t('debts.goodDebt')} ({t('debts.goodDebtNotDeducted')})
                        </span>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            maximumFractionDigits: 0,
                          }).format(stats.totalGoodDebts)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Desglose de Activos */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t('dashboard.assetBreakdown')}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Capital Invertido
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 0,
                      }).format(stats.totalInvestments || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Efectivo</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 0,
                      }).format(stats.totalCashSavings || 0)}
                    </span>
                  </div>
                  {(() => {
                    const totalAssets =
                      (stats.totalCashSavings || 0) + (stats.totalInvestments || 0);
                    const cashPercent =
                      totalAssets > 0 ? ((stats.totalCashSavings || 0) / totalAssets) * 100 : 0;
                    const investmentPercent =
                      totalAssets > 0 ? ((stats.totalInvestments || 0) / totalAssets) * 100 : 0;
                    const cashColor = ASSET_CLASS_COLORS['Efectivo'] || '#f59e0b';

                    return (
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>{t('dashboard.distribution')}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full flex">
                            {investmentPercent > 0 && (
                              <div
                                className="bg-green-500 dark:bg-green-600 transition-all duration-300"
                                style={{ width: `${investmentPercent}%` }}
                              />
                            )}
                            {cashPercent > 0 && (
                              <div
                                className="transition-all duration-300"
                                style={{
                                  width: `${cashPercent}%`,
                                  backgroundColor: cashColor,
                                }}
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-600"></div>
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('dashboard.invested')}: {investmentPercent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: cashColor }}
                            ></div>
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('dashboard.cash')}: {cashPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Rendimientos */}
                {performance && performance.annualizedReturn !== null && (
                  <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Rendimientos
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {accumulatedReturn !== null && accumulatedReturnPercent !== null && (
                        <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Acumulado
                          </div>
                          <div
                            className={`text-sm font-bold ${(accumulatedReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                          >
                            {(accumulatedReturnPercent || 0) >= 0 ? '+' : ''}
                            {(accumulatedReturnPercent || 0).toFixed(2)}%
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Intl.NumberFormat('es-ES', {
                              style: 'currency',
                              currency: 'EUR',
                              notation: 'compact',
                              maximumFractionDigits: 1,
                            }).format(accumulatedReturn || 0)}
                          </div>
                        </div>
                      )}
                      {performance.annualizedReturn !== null &&
                        performance.annualizedReturnPercent !== null && (
                          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Anualizado
                            </div>
                            <div
                              className={`text-sm font-bold ${(performance.annualizedReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                            >
                              {(performance.annualizedReturnPercent || 0) >= 0 ? '+' : ''}
                              {(performance.annualizedReturnPercent || 0).toFixed(2)}%
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: 'EUR',
                                notation: 'compact',
                                maximumFractionDigits: 1,
                              }).format(performance.annualizedReturn || 0)}
                            </div>
                          </div>
                        )}
                      {performance.monthlyReturn !== null &&
                        performance.monthlyReturnPercent !== null && (
                          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Mensual
                            </div>
                            <div
                              className={`text-sm font-bold ${(performance.monthlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                            >
                              {(performance.monthlyReturnPercent || 0) >= 0 ? '+' : ''}
                              {(performance.monthlyReturnPercent || 0).toFixed(2)}%
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: 'EUR',
                                notation: 'compact',
                                maximumFractionDigits: 1,
                              }).format(performance.monthlyReturn || 0)}
                            </div>
                          </div>
                        )}
                      {performance.dailyReturn !== null &&
                        performance.dailyReturnPercent !== null && (
                          <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Diario
                            </div>
                            <div
                              className={`text-sm font-bold ${(performance.dailyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                            >
                              {(performance.dailyReturnPercent || 0) >= 0 ? '+' : ''}
                              {(performance.dailyReturnPercent || 0).toFixed(2)}%
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: 'EUR',
                                notation: 'compact',
                                maximumFractionDigits: 1,
                              }).format(performance.dailyReturn || 0)}
                            </div>
                          </div>
                        )}
                    </div>
                    {performance.vsSP500 !== null && performance.vsSP500 !== undefined && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3 mt-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          vs S&P 500
                        </div>
                        <div
                          className={`text-sm font-bold ${(performance.vsSP500 || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                        >
                          {(performance.vsSP500 || 0) >= 0 ? '+' : ''}
                          {(performance.vsSP500 || 0).toFixed(2)}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal de detalle de inversión desde Treemap */}
      {showInvestmentDetailModal &&
        selectedTreemapInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            style={{ zIndex: 10000 }}
            onClick={() => {
              setShowInvestmentDetailModal(false);
              setSelectedTreemapInvestment(null);
              setDetailInvestmentHistory([]);
              setDetailDailyVariations([]);
            }}
          >
            <div
              className="modal-content max-w-5xl w-full p-4 h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4 flex-shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {selectedTreemapInvestment.name}
                  </h2>
                  {selectedTreemapInvestment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {selectedTreemapInvestment.symbol}
                    </p>
                  )}
                  {selectedTreemapInvestment.isin && !selectedTreemapInvestment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ISIN: {selectedTreemapInvestment.isin}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowInvestmentDetailModal(false);
                    setSelectedTreemapInvestment(null);
                    setDetailInvestmentHistory([]);
                    setDetailDailyVariations([]);
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden min-h-0">
                {/* Columna izquierda */}
                <div className="space-y-4 overflow-y-auto pr-2 h-full">
                  {/* Información básica */}
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Información Básica
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Tipo:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                          {getTypeLabel(
                            selectedTreemapInvestment.type,
                            selectedTreemapInvestment.isAutomatedPortfolio
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Moneda:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                          {selectedTreemapInvestment.currency}
                        </span>
                      </div>
                      {(selectedTreemapInvestment.account ||
                        selectedTreemapInvestment.subAccount) && (
                        <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-gray-600 dark:text-gray-400">Cuenta:</span>
                          <div className="mt-1">
                            {selectedTreemapInvestment.account && (
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {selectedTreemapInvestment.account.name ||
                                  selectedTreemapInvestment.account.bankName ||
                                  'N/A'}
                              </span>
                            )}
                            {selectedTreemapInvestment.subAccount && (
                              <span className="ml-2 text-gray-600 dark:text-gray-400">
                                → {selectedTreemapInvestment.subAccount.name}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedTreemapInvestment.assetClass && (
                        <div className="col-span-2">
                          <span className="text-gray-600 dark:text-gray-400">Clase de Activo:</span>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {selectedTreemapInvestment.assetClass === 'fixed_income' && (
                              <>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                                  {t('investments.assetClassLabels.fixedIncome')}
                                </span>
                                {getFixedIncomeSubtypeLabel(
                                  selectedTreemapInvestment.fixedIncomeSubtype
                                ) && (
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getFixedIncomeSubtypeTone(
                                      selectedTreemapInvestment.fixedIncomeSubtype
                                    )}`}
                                  >
                                    {getFixedIncomeSubtypeLabel(
                                      selectedTreemapInvestment.fixedIncomeSubtype
                                    )}
                                  </span>
                                )}
                              </>
                            )}
                            {selectedTreemapInvestment.assetClass === 'variable_income' && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                {t('investments.assetClassLabels.variableIncome')}
                              </span>
                            )}
                            {selectedTreemapInvestment.assetClass === 'mixed' && (
                              <>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                  {t('investments.assetClassLabels.mixed')}
                                </span>
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                  {t('investments.assetClassLabels.fixedIncomeShort')}:{' '}
                                  {selectedTreemapInvestment.fixedIncomePercentage || 0}% |{' '}
                                  {t('investments.assetClassLabels.variableIncomeShort')}:{' '}
                                  {selectedTreemapInvestment.variableIncomePercentage || 0}%
                                </span>
                              </>
                            )}
                            {selectedTreemapInvestment.isAlternative && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                                {t('investments.assetClassLabels.alternative')}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedTreemapInvestment.isAutomatedPortfolio && (
                        <div className="col-span-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                            {t('investments.investmentTypes.automatedPortfolio')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Información financiera */}
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Información Financiera
                    </h3>
                    <div className="space-y-3 text-sm">
                      {selectedTreemapInvestment.isAutomatedPortfolio ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Monto invertido:
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: selectedTreemapInvestment.currency,
                              }).format(selectedTreemapInvestment.quantity)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Valor actual:</span>
                            <span className="font-bold text-gray-900 dark:text-gray-100">
                              {formatPrice(
                                selectedTreemapInvestment.currentPrice,
                                selectedTreemapInvestment.currency
                              )}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Cantidad:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {selectedTreemapInvestment.quantity} unidades
                            </span>
                          </div>
                          {selectedTreemapInvestment.averagePurchasePrice && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">
                                Precio medio compra:
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatPrice(
                                  selectedTreemapInvestment.averagePurchasePrice,
                                  selectedTreemapInvestment.currency
                                )}
                              </span>
                            </div>
                          )}
                          {selectedTreemapInvestment.purchasePrice &&
                            !selectedTreemapInvestment.averagePurchasePrice && (
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Precio de compra:
                                </span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {formatPrice(
                                    selectedTreemapInvestment.purchasePrice,
                                    selectedTreemapInvestment.currency
                                  )}
                                </span>
                              </div>
                            )}
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Precio actual:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(
                                selectedTreemapInvestment.currentPrice,
                                selectedTreemapInvestment.currency
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                            <span className="text-gray-600 dark:text-gray-400">Valor total:</span>
                            <span className="font-bold text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: selectedTreemapInvestment.currency,
                              }).format(
                                selectedTreemapInvestment.quantity *
                                  selectedTreemapInvestment.currentPrice
                              )}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-400">Ganancia/Pérdida:</span>
                        <span
                          className={`font-bold flex items-center ${
                            calculateProfitLoss(selectedTreemapInvestment) >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {calculateProfitLoss(selectedTreemapInvestment) >= 0 ? (
                            <TrendingUp className="h-4 w-4 mr-1" />
                          ) : (
                            <TrendingDown className="h-4 w-4 mr-1" />
                          )}
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: selectedTreemapInvestment.currency,
                          }).format(calculateProfitLoss(selectedTreemapInvestment))}
                          <span className="ml-2">
                            ({calculateProfitLossPercentage(selectedTreemapInvestment).toFixed(2)}
                            %)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Fechas */}
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Fechas</h3>
                    <div className="space-y-2 text-sm">
                      {selectedTreemapInvestment.purchaseDate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Fecha de compra:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(selectedTreemapInvestment.purchaseDate).toLocaleDateString(
                              'es-ES'
                            )}
                          </span>
                        </div>
                      )}
                      {selectedTreemapInvestment.createdAt && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Fecha de creación:
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(selectedTreemapInvestment.createdAt).toLocaleDateString(
                              'es-ES'
                            )}
                          </span>
                        </div>
                      )}
                      {selectedTreemapInvestment.updatedAt && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Última actualización:
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(selectedTreemapInvestment.updatedAt).toLocaleDateString(
                              'es-ES'
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Configuración - Solo mostrar si se puede activar/desactivar actualización automática */}
                  {(selectedTreemapInvestment.symbol || selectedTreemapInvestment.isin) &&
                    !selectedTreemapInvestment.isAutomatedPortfolio && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Configuración
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Actualización automática:
                            </span>
                            <span
                              className={`font-medium ${
                                selectedTreemapInvestment.autoUpdate !== false
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {selectedTreemapInvestment.autoUpdate !== false
                                ? 'Activada'
                                : 'Desactivada'}
                            </span>
                          </div>
                          {selectedTreemapInvestment.platformUrl && (
                            <div>
                              <span className="text-gray-600 dark:text-gray-400">Plataforma:</span>
                              <a
                                href={selectedTreemapInvestment.platformUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {selectedTreemapInvestment.platformUrl}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Notas */}
                  {selectedTreemapInvestment.notes && (
                    <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Notas</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {selectedTreemapInvestment.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Columna derecha */}
                <div className="flex flex-col gap-4 overflow-y-auto pl-2 h-full">
                  {/* Gráfica de evolución del valor */}
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Evolución del Valor
                    </h3>
                    {detailInvestmentHistory.length > 0 ? (
                      <div style={{ height: '290px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={detailInvestmentHistory.map((h) => ({
                              date: new Date(h.date).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                              }),
                              value: h.totalValue,
                              dailyChange: h.dailyChangeAmount || 0,
                            }))}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="detailValueGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                              vertical={false}
                            />
                            <XAxis
                              dataKey="date"
                              tick={{
                                fill: isDark ? '#9ca3af' : '#6b7280',
                                fontSize: 11,
                              }}
                              axisLine={{
                                stroke: isDark ? '#404040' : '#e5e7eb',
                              }}
                              tickLine={false}
                              angle={-45}
                              textAnchor="end"
                              height={70}
                            />
                            <YAxis
                              tick={{
                                fill: isDark ? '#9ca3af' : '#6b7280',
                                fontSize: 11,
                              }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) =>
                                new Intl.NumberFormat('es-ES', {
                                  style: 'currency',
                                  currency: selectedTreemapInvestment.currency,
                                  notation: 'compact',
                                  maximumFractionDigits: 0,
                                }).format(value)
                              }
                              width={50}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const data = payload[0]?.payload;
                                const totalValue = data?.value || 0;
                                const formattedValue = new Intl.NumberFormat('es-ES', {
                                  style: 'currency',
                                  currency: selectedTreemapInvestment.currency,
                                }).format(totalValue);
                                const bg = isDark
                                  ? 'bg-[#2c2c2e] border-[#404040]'
                                  : 'bg-white border-gray-200';
                                return (
                                  <div className={`${bg} border rounded-xl shadow-xl px-4 py-3`}>
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                      {label}
                                    </p>
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-sm text-gray-600 dark:text-gray-300">
                                        Valor total
                                      </span>
                                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                        {formattedValue}
                                      </span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="value"
                              name="Valor Total"
                              stroke="#0ea5e9"
                              strokeWidth={2}
                              fill="url(#detailValueGradient)"
                              dot={false}
                              activeDot={{ r: 4, strokeWidth: 2, fill: 'white' }}
                              isAnimationActive
                              animationDuration={600}
                              animationEasing="ease-out"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p className="text-sm">No hay datos de historial para mostrar</p>
                        <p className="text-xs mt-2">
                          El historial se genera automáticamente con las operaciones
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Gráfica de variación diaria */}
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Variación Diaria
                    </h3>
                    {detailDailyVariations.length > 0 ? (
                      <div style={{ height: '290px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={detailDailyVariations.map((v) => {
                              const changeAmount =
                                v.dailyChangeAmount !== null && v.dailyChangeAmount !== undefined
                                  ? v.dailyChangeAmount
                                  : 0;
                              return {
                                date: new Date(v.date).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: 'short',
                                }),
                                dailyChange: changeAmount,
                                dailyChangePercent:
                                  v.dailyChangePercent !== null &&
                                  v.dailyChangePercent !== undefined
                                    ? v.dailyChangePercent
                                    : null,
                                dailyChangePositive: changeAmount >= 0 ? changeAmount : 0,
                                dailyChangeNegative: changeAmount < 0 ? changeAmount : 0,
                              };
                            })}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            barCategoryGap="20%"
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                              vertical={false}
                            />
                            <XAxis
                              dataKey="date"
                              tick={{
                                fill: isDark ? '#9ca3af' : '#6b7280',
                                fontSize: 11,
                              }}
                              axisLine={{
                                stroke: isDark ? '#404040' : '#e5e7eb',
                              }}
                              tickLine={false}
                              angle={-45}
                              textAnchor="end"
                              height={70}
                            />
                            <YAxis
                              tick={{
                                fill: isDark ? '#9ca3af' : '#6b7280',
                                fontSize: 11,
                              }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) =>
                                new Intl.NumberFormat('es-ES', {
                                  style: 'currency',
                                  currency: selectedTreemapInvestment.currency,
                                  notation: 'compact',
                                  maximumFractionDigits: 0,
                                }).format(value)
                              }
                              width={50}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const data = payload[0]?.payload;
                                const dailyChange =
                                  data?.dailyChange !== null && data?.dailyChange !== undefined
                                    ? data.dailyChange
                                    : 0;
                                const dailyChangePercent = data?.dailyChangePercent;
                                const formattedChange = new Intl.NumberFormat('es-ES', {
                                  style: 'currency',
                                  currency: selectedTreemapInvestment.currency,
                                }).format(Math.abs(dailyChange));
                                const bg = isDark
                                  ? 'bg-[#2c2c2e] border-[#404040]'
                                  : 'bg-white border-gray-200';
                                return (
                                  <div
                                    className={`${bg} border rounded-xl shadow-xl px-4 py-3 min-w-[160px]`}
                                  >
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                      {label}
                                    </p>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between items-center gap-4">
                                        <span className="text-gray-600 dark:text-gray-300">
                                          Cambio diario
                                        </span>
                                        <span
                                          className={`font-semibold ${
                                            dailyChange > 0
                                              ? 'text-green-600 dark:text-green-400'
                                              : dailyChange < 0
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-gray-500 dark:text-gray-400'
                                          }`}
                                        >
                                          {dailyChange > 0 ? '+' : dailyChange < 0 ? '-' : ''}
                                          {formattedChange}
                                          {dailyChange === 0 && ' (Sin variación)'}
                                        </span>
                                      </div>
                                      {dailyChangePercent !== null &&
                                      dailyChangePercent !== undefined ? (
                                        <div className="flex justify-between items-center gap-4">
                                          <span className="text-gray-600 dark:text-gray-300">
                                            Variación
                                          </span>
                                          <span
                                            className={`font-semibold ${
                                              dailyChangePercent > 0
                                                ? 'text-green-600 dark:text-green-400'
                                                : dailyChangePercent < 0
                                                  ? 'text-red-600 dark:text-red-400'
                                                  : 'text-gray-500 dark:text-gray-400'
                                            }`}
                                          >
                                            {dailyChangePercent > 0 ? '+' : ''}
                                            {dailyChangePercent.toFixed(2)}%
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex justify-between items-center gap-4 text-gray-500 dark:text-gray-400">
                                          <span>Variación</span>
                                          <span className="text-xs">Sin datos previos</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Bar
                              dataKey="dailyChangePositive"
                              fill="#10b981"
                              name="Ganancia"
                              radius={[6, 6, 0, 0]}
                              isAnimationActive
                              animationDuration={500}
                              animationEasing="ease-out"
                            />
                            <Bar
                              dataKey="dailyChangeNegative"
                              fill="#ef4444"
                              name="Pérdida"
                              radius={[6, 6, 0, 0]}
                              isAnimationActive
                              animationDuration={500}
                              animationEasing="ease-out"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p className="text-sm">No hay datos de variación diaria para mostrar</p>
                        <p className="text-xs mt-2">
                          Las variaciones se generan automáticamente al actualizar precios
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 mt-1 pt-1 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button
                  onClick={() => {
                    navigate('/investments');
                  }}
                  className="flex-1 btn-secondary flex items-center justify-center"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Ver en Inversiones
                </button>
                <button
                  onClick={() => {
                    setShowInvestmentDetailModal(false);
                    setSelectedTreemapInvestment(null);
                    setDetailInvestmentHistory([]);
                    setDetailDailyVariations([]);
                  }}
                  className="flex-1 btn-primary"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Dashboard;
