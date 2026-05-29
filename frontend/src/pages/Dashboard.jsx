import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CgTrending,
  CgTrendingDown,
  CgEditMarkup,
  CgTime,
  CgCreditCard,
  CgDollar,
  CgDanger,
  CgArrowUp,
  CgArrowDown,
} from 'react-icons/cg';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
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
  const [performance, setPerformance] = useState(null);
  const [includeBusinessAccounts, setIncludeBusinessAccounts] = useState(false);
  const navigate = useNavigate();
  const resizeTimeoutRef = useRef(null);

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

  // Generar colores para bancos y variaciones para subcuentas — kept for potential future use
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

  useEffect(() => {
    fetchDashboardData();
  }, [includeBusinessAccounts]);

  const fetchDashboardData = async () => {
    try {
      const params = includeBusinessAccounts ? { includeBusinessAccounts: 'true' } : {};
      const [statsRes, balanceRes, evolutionRes, performanceRes] = await Promise.all([
        api.get('/dashboard/stats', { params }),
        api.get('/dashboard/balance-daily', { params }),
        api.get('/investment-history/evolution?months=12'),
        api.get('/dashboard/performance', { params }),
      ]);
      setStats(statsRes.data);
      setBalanceChart(balanceRes.data.sort((a, b) => new Date(a.date) - new Date(b.date)));
      setInvestmentsEvolution(evolutionRes.data);
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

  return (
    <div className="space-y-8">
      <div className="mb-2 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            {t('dashboard.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 tracking-tight">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBusinessAccounts}
              onChange={(e) => setIncludeBusinessAccounts(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('dashboard.includeBusinessAccounts')}
            </span>
          </label>
        </div>
      </div>

      {/* Primera fila: Resumen financiero */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 auto-rows-fr">
        <div
          className="stat-card row-span-2 col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 flex flex-col cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setShowBalanceTooltip(true)}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('dashboard.totalBalance')}
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 break-words">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                }).format(stats.totalBalance)}
              </p>
              {performance &&
                performance.annualizedReturn !== null &&
                contributedCapital !== null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
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
            <div
              className="flex-shrink-0 p-2.5 rounded"
              style={{ backgroundColor: 'var(--user-color-600)' }}
            >
              <CgCreditCard className="h-4 w-4 text-white" />
            </div>
          </div>

          {/* Barra de distribución */}
          {(() => {
            const totalAssets = (stats.totalCashSavings || 0) + (stats.totalInvestments || 0);
            const cashPercent =
              totalAssets > 0 ? ((stats.totalCashSavings || 0) / totalAssets) * 100 : 0;
            const investmentPercent =
              totalAssets > 0 ? ((stats.totalInvestments || 0) / totalAssets) * 100 : 0;
            const cashColor = '#f59e0b';

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
            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t('dashboard.dailyChange')}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.dailyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {(performance.dailyReturnPercent || 0) >= 0 ? '+' : ''}
                    {(performance.dailyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(performance.dailyReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.dailyReturnPercent || 0) >= 0 ? 'bg-purple-500 dark:bg-purple-600' : 'bg-red-500 dark:bg-red-600'}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t('dashboard.monthlyReturn')}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.monthlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {(performance.monthlyReturnPercent || 0) >= 0 ? '+' : ''}
                    {(performance.monthlyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(performance.monthlyReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.monthlyReturnPercent || 0) >= 0 ? 'bg-cyan-500 dark:bg-cyan-600' : 'bg-red-500 dark:bg-red-600'}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t('dashboard.accumulatedReturn')}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${accumulatedReturnPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {accumulatedReturnPercent >= 0 ? '+' : ''}
                    {accumulatedReturnPercent.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(accumulatedReturn ?? 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${accumulatedReturnPercent >= 0 ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600'}`}
                >
                  <CgDollar className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="stat-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('dashboard.debt')}
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 break-words">
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(stats.totalMonthlyDebtPayments || 0)}
                {t('dashboard.monthly')}
              </p>
            </div>
            <div className="flex-shrink-0 p-2.5 bg-red-500 dark:bg-red-600 rounded">
              <CgDanger className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>

        {/* Segunda fila: Rendimiento Trimestral, Rendimiento Anual, Rendimiento Anualizado, vs SP500 */}
        {performance && performance.annualizedReturn !== null && (
          <>
            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t('dashboard.quarterlyReturn')}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.quarterlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {(performance.quarterlyReturnPercent || 0) >= 0 ? '+' : ''}
                    {(performance.quarterlyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(performance.quarterlyReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.quarterlyReturnPercent || 0) >= 0 ? 'bg-teal-500 dark:bg-teal-600' : 'bg-red-500 dark:bg-red-600'}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t('dashboard.annualReturn')}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.annualReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {(performance.annualReturnPercent || 0) >= 0 ? '+' : ''}
                    {(performance.annualReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(performance.annualReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.annualReturnPercent || 0) >= 0 ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600'}`}
                >
                  <CgDollar className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t('dashboard.annualizedReturn')}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${performance.annualizedReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {performance.annualizedReturn >= 0 ? '+' : ''}
                    {performance.annualizedReturn.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Período: {performance.years.toFixed(1)} años
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${performance.annualizedReturn >= 0 ? 'bg-blue-500 dark:bg-blue-600' : 'bg-red-500 dark:bg-red-600'}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            {performance.sp500Comparison && (
              <div className="stat-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                      {t('dashboard.vsSP500')}
                    </p>
                    {performance.sp500Comparison.outperformance !== null ? (
                      <>
                        <p
                          className={`text-2xl sm:text-3xl font-bold break-words ${performance.sp500Comparison.outperformance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                        >
                          {performance.sp500Comparison.outperformance >= 0 ? '+' : ''}
                          {performance.sp500Comparison.outperformance.toFixed(2)}%
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Tu CAGR: {performance.annualizedReturn.toFixed(2)}% | S&P 500:{' '}
                          {performance.sp500Comparison.historicalAnnualReturn}%
                        </p>
                      </>
                    ) : (
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 break-words">
                        {performance.annualizedReturn.toFixed(2)}% vs{' '}
                        {performance.sp500Comparison.historicalAnnualReturn}%
                      </p>
                    )}
                  </div>
                  <div
                    className={`flex-shrink-0 p-2.5 rounded ${performance.sp500Comparison.outperformance !== null && performance.sp500Comparison.outperformance >= 0 ? 'bg-purple-500 dark:bg-purple-600' : 'bg-gray-500 dark:bg-gray-600'}`}
                  >
                    {performance.sp500Comparison.outperformance !== null &&
                    performance.sp500Comparison.outperformance >= 0 ? (
                      <CgArrowUp className="h-4 w-4 text-white" />
                    ) : (
                      <CgArrowDown className="h-4 w-4 text-white" />
                    )}
                  </div>
                </div>
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
            const first = balanceData[0]?.balance || 0;
            const last = balanceData[balanceData.length - 1]?.balance || 0;
            const delta = last - first;
            const fmtCurrency = (v) =>
              new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v);
            const fmtFull = (v) =>
              new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
            return (
              <div className="card overflow-hidden">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {t('dashboard.totalNetWorthEvolution')}
                    </h2>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                      {fmtFull(last)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
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
                      tickFormatter={fmtCurrency}
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
            const fmtCurrency = (v) =>
              new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v);
            const fmtFull = (v) =>
              new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
            const retPct = accumulatedReturnPercent ?? 0;
            const retAbs = accumulatedReturn ?? 0;
            return (
              <div className="card overflow-hidden">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Evolución de Inversiones
                    </h2>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                      {fmtFull(last)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-full mt-1 ${
                      retPct >= 0
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                    }`}
                  >
                    {retPct >= 0 ? '▲' : '▼'} {Math.abs(retPct).toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
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
                      tickFormatter={fmtCurrency}
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
    </div>
  );
};

export default Dashboard;
