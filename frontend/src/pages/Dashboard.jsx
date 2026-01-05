import React, { useEffect, useState, useRef } from 'react';
import { CgTrending, CgTrendingDown, CgEditMarkup, CgTime, CgCreditCard, CgDollar, CgDanger, CgArrowUp, CgArrowDown } from 'react-icons/cg';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Treemap } from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';

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
    maximumFractionDigits: decimals
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

const Dashboard = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [balanceChart, setBalanceChart] = useState([]);
  const [investmentsEvolution, setInvestmentsEvolution] = useState([]);
  const [distributionByAssetClass, setDistributionByAssetClass] = useState([]);
  const [investmentsDetailed, setInvestmentsDetailed] = useState([]);
  const [distributionByBank, setDistributionByBank] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [showBalanceTooltip, setShowBalanceTooltip] = useState(false);
  const [showInvestmentDetailModal, setShowInvestmentDetailModal] = useState(false);
  const [selectedTreemapInvestment, setSelectedTreemapInvestment] = useState(null);
  const [detailInvestmentHistory, setDetailInvestmentHistory] = useState([]);
  const [detailDailyVariations, setDetailDailyVariations] = useState([]);
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

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#a855f7'];
  
  // Colores específicos para cada clase de activo
  const ASSET_CLASS_COLORS = {
    'Renta Fija': '#3b82f6', // Azul
    'Renta Variable': '#10b981', // Verde
    'Efectivo': '#f59e0b', // Amarillo/Naranja
  };

  // Generar colores para bancos y variaciones para subcuentas
  const generateBankColors = (bankName, subAccountCount, savedColor = null) => {
    // Si hay un color guardado, usarlo SIEMPRE (prioridad máxima)
    if (savedColor && savedColor.trim() !== '') {
      const variations = generateColorVariations(savedColor, subAccountCount);
      return {
        base: savedColor,
        variations: variations,
      };
    }
    
    // Colores base para bancos comunes (solo si no hay color guardado)
    const bankBaseColors = {
      'Santander': '#ec0000',
      'BBVA': '#004481',
      'CaixaBank': '#004481',
      'ING': '#ff6200',
      'MyInvestor': '#00a859',
      'Openbank': '#00a859',
      'N26': '#000000',
      'Revolut': '#0075eb',
    };
    
    // Si no hay color específico, generar uno basado en el nombre
    const baseColor = bankBaseColors[bankName] || generateColorFromString(bankName);
    
    // Generar variaciones del color base para las subcuentas
    const variations = generateColorVariations(baseColor, subAccountCount);
    
    return {
      base: baseColor,
      variations: variations,
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
        hex = hex.split('').map(char => char + char).join('');
      }
      
      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      
      if (max === min) {
        // Color gris: sin matiz, saturación 0
        h = 0;
        s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
          default: h = 0;
        }
      }
      
      hue = Math.round(h * 360);
      saturation = Math.round(s * 100);
      lightness = Math.round(l * 100);
    }
    
    // Generar variaciones manteniendo el mismo matiz (hue), variando solo saturación y luminosidad
    return Array.from({ length: count }, (_, i) => {
      // Variar la luminosidad: más claro para las primeras subcuentas, más oscuro para las últimas
      const lightVariation = lightness + (i * 8) - ((count - 1) * 4);
      
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

  // Preparar datos para el gráfico de barras apiladas
  const prepareBankChartData = () => {
    if (!distributionByBank || distributionByBank.length === 0) return [];
    
    return distributionByBank.map(bank => {
      const bankColors = generateBankColors(bank.bankName, bank.subAccounts.length, bank.color);
      const dataPoint = {
        bank: bank.bankName,
        total: bank.total,
      };
      
      // Agregar cada subcuenta como una propiedad separada con nombre único
      bank.subAccounts.forEach((subAccount, index) => {
        const subAccountKey = `${bank.bankName}_sub_${index}`;
        dataPoint[subAccountKey] = subAccount.value;
        dataPoint[`${subAccountKey}_name`] = subAccount.name;
        dataPoint[`${subAccountKey}_type`] = subAccount.type;
        dataPoint[`${subAccountKey}_color`] = bankColors.variations[index] || bankColors.base;
      });
      
      dataPoint._bankColors = bankColors;
      dataPoint._subAccounts = bank.subAccounts;
      dataPoint._bankName = bank.bankName;
      
      return dataPoint;
    });
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);



  const fetchDashboardData = async () => {
    try {
      const [statsRes, balanceRes, evolutionRes, assetClassRes, detailedRes, bankRes, performanceRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/balance-daily'),
        api.get('/investment-history/evolution?months=6'),
        api.get('/dashboard/distribution-by-asset-class'),
        api.get('/dashboard/investments-detailed'),
        api.get('/dashboard/distribution-by-bank'),
        api.get('/dashboard/performance'),
      ]);
      setStats(statsRes.data);
      // Asegurar que los datos estén ordenados por fecha
      const sortedBalanceData = balanceRes.data.sort((a, b) => new Date(a.date) - new Date(b.date));
      // Verificar valores únicos
      const uniqueBalances = [...new Set(sortedBalanceData.map(item => item.balance))];
      
      setBalanceChart(sortedBalanceData);
      setInvestmentsEvolution(evolutionRes.data);
      setDistributionByAssetClass(assetClassRes.data);
      setInvestmentsDetailed(detailedRes.data);
      setDistributionByBank(bankRes.data);
      setPerformance(performanceRes.data);
    } catch (error) {
    }
  };

  if (!stats) {
    return <LoadingSpinner />;
  }

  // Función para renderizar el contenido del Treemap
  const renderTreemapContent = ({ x, y, width, height, index, payload, root }) => {
                  // En recharts Treemap, los datos pueden estar en payload o en root.children
                  let dataItem = payload;
                  if (!dataItem && root && root.children && root.children[index]) {
                    dataItem = root.children[index];
                  }
                  // También puede estar directamente en el payload como un objeto con los datos
                  if (!dataItem && payload && typeof payload === 'object') {
                    // Intentar acceder a los datos directamente
                    dataItem = investmentsDetailed[index];
                  }
                  
                  // Si aún no tenemos datos, intentar desde el array original
                  if (!dataItem && investmentsDetailed && investmentsDetailed[index]) {
                    dataItem = investmentsDetailed[index];
                  }
                  
                  if (!dataItem || !dataItem.name || dataItem.value === undefined || dataItem.value === null) {
                    return null;
                  }
                  
                  // Calcular color basado en la rentabilidad
                  const getReturnColor = (returnPercent) => {
                    if (!returnPercent && returnPercent !== 0) return '#9ca3af'; // Gris por defecto si no hay datos
                    
                    // Si el rendimiento es exactamente 0%, usar gris
                    if (returnPercent === 0) {
                      return '#9ca3af'; // Gris neutro
                    }
                    
                    const absPercent = Math.abs(returnPercent);
                    let intensity; // 0 = claro, 0.5 = intermedio, 1 = oscuro
                    
                    // Tres rangos: 0-5% (claro), 5-20% (intermedio), 20%+ (oscuro)
                    if (absPercent < 5) {
                      intensity = 0; // Color claro
                    } else if (absPercent < 20) {
                      // Interpolar entre claro (0) e intermedio (0.5) en el rango 5-20%
                      intensity = 0.5 * ((absPercent - 5) / (20 - 5));
                    } else {
                      // Interpolar entre intermedio (0.5) y oscuro (1) a partir de 20%
                      // Para valores > 20%, usar una interpolación suave hasta llegar a 1
                      const excess = absPercent - 20;
                      intensity = 0.5 + Math.min(0.5 * (excess / 30), 0.5); // Llega a 1 en 50%
                    }
                    
                    if (returnPercent >= 0) {
                      // Verde: claro (#4ade80), intermedio, oscuro (#166534)
                      // Verde claro: RGB(74, 222, 128)
                      // Verde intermedio: RGB(48, 161, 90)
                      // Verde oscuro: RGB(22, 101, 52)
                      const r = Math.round(22 + (74 - 22) * (1 - intensity));
                      const g = Math.round(101 + (222 - 101) * (1 - intensity));
                      const b = Math.round(52 + (128 - 52) * (1 - intensity));
                      return `rgb(${r}, ${g}, ${b})`;
                    } else {
                      // Rojo: claro (#f87171), intermedio, oscuro (#991b1b)
                      // Rojo claro: RGB(248, 113, 113)
                      // Rojo intermedio: RGB(200, 70, 70)
                      // Rojo oscuro: RGB(153, 27, 27)
                      const r = Math.round(153 + (248 - 153) * (1 - intensity));
                      const g = Math.round(27 + (113 - 27) * (1 - intensity));
                      const b = Math.round(27 + (113 - 27) * (1 - intensity));
                      return `rgb(${r}, ${g}, ${b})`;
                    }
                  };
                  
                  const color = getReturnColor(dataItem.totalReturnPercent);
                  
                  const total = investmentsDetailed.reduce((sum, item) => sum + (item.value || 0), 0);
                  const percent = total > 0 ? ((dataItem.value / total) * 100).toFixed(1) : '0';
                  const displayName = dataItem.name && dataItem.name.length > 20 ? dataItem.name.substring(0, 20) + '...' : (dataItem.name || '');
                  return (
                    <g>
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        style={{
                          fill: color,
                          stroke: '#fff',
                          strokeWidth: 2,
                          cursor: 'pointer',
                        }}
                        onClick={async () => {
                          try {
                            // Obtener la inversión completa desde la API
                            const investmentRes = await api.get(`/investments/${dataItem._id}`);
                            const fullInvestment = investmentRes.data;
                            setSelectedTreemapInvestment(fullInvestment);
                            
                            // Cargar historial y variaciones diarias
                            const [historyRes, variationsRes] = await Promise.all([
                              api.get(`/investment-history/investment/${dataItem._id}`),
                              api.get(`/investment-history/investment/${dataItem._id}/daily-variations`)
                            ]);
                            setDetailInvestmentHistory(historyRes.data || []);
                            setDetailDailyVariations(variationsRes.data || []);
                            
                            setShowInvestmentDetailModal(true);
                          } catch (error) {
                            console.error('Error al cargar detalles de inversión:', error);
                            // Si falla, usar los datos básicos del Treemap
                            setSelectedTreemapInvestment(dataItem);
                            setShowInvestmentDetailModal(true);
                          }
                        }}
                      />
                      {width > 80 && height > 40 && (
                        <text
                          x={x + width / 2}
                          y={y + height / 2}
                          textAnchor="middle"
                          fill="#fff"
                          fontSize={14}
                          fontWeight="400"
                          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                        >
                          <tspan x={x + width / 2} dy="-8" fontWeight="400" fontSize={14}>
                            {displayName}
                          </tspan>
                          <tspan x={x + width / 2} dy="14" fontSize={15} fontWeight="400">
                            {dataItem.totalReturnPercent !== null && dataItem.totalReturnPercent !== undefined
                              ? `${dataItem.totalReturnPercent >= 0 ? '+' : ''}${dataItem.totalReturnPercent.toFixed(2)}%`
                              : 'N/A'}
                          </tspan>
                          <tspan x={x + width / 2} dy="14" fontSize={12} fontWeight="400">
                            {dataItem.totalReturn !== null && dataItem.totalReturn !== undefined
                              ? `${dataItem.totalReturn >= 0 ? '+' : ''}${new Intl.NumberFormat('es-ES', { 
                                  style: 'currency', 
                                  currency: 'EUR',
                                  notation: 'compact',
                                  maximumFractionDigits: 0
                                }).format(dataItem.totalReturn)}`
                              : 'N/A'}
                          </tspan>
                        </text>
                      )}
                    </g>
                  );
  };

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
          {t('dashboard.title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 tracking-tight">{t('dashboard.subtitle')}</p>
      </div>

      {/* Primera fila: Resumen financiero */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 auto-rows-fr">
        <div 
          className="stat-card row-span-2 col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 flex flex-col cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setShowBalanceTooltip(true)}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.totalBalance')}</p>
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 break-words">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.totalBalance)}
              </p>
              {performance && performance.annualizedReturn !== null && performance.additionalCapital !== null && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                  {t('dashboard.contributedCapital')}: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.additionalCapital || 0)}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 p-2.5 rounded" style={{ backgroundColor: 'var(--user-color-600)' }}>
              <CgCreditCard className="h-4 w-4 text-white" />
            </div>
          </div>
          
          {/* Barra de distribución */}
          {(() => {
            const totalAssets = (stats.totalCashSavings || 0) + (stats.totalInvestments || 0);
            const cashPercent = totalAssets > 0 ? ((stats.totalCashSavings || 0) / totalAssets) * 100 : 0;
            const investmentPercent = totalAssets > 0 ? ((stats.totalInvestments || 0) / totalAssets) * 100 : 0;
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
                          style={{ width: `${cashPercent}%`, backgroundColor: cashColor }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-600"></div>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.invested')}: {investmentPercent.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cashColor }}></div>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.cash')}: {cashPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 space-y-2.5 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.investedCapital')}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalInvestments || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.cash')}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalCashSavings || 0)}
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
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.dailyChange')}</p>
                  <p className={`text-2xl sm:text-3xl font-bold break-words ${(performance.dailyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {(performance.dailyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.dailyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.dailyReturn || 0)}
                  </p>
                </div>
                <div className={`flex-shrink-0 p-2.5 rounded ${(performance.dailyReturnPercent || 0) >= 0 ? 'bg-purple-500 dark:bg-purple-600' : 'bg-red-500 dark:bg-red-600'}`}>
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.monthlyReturn')}</p>
                  <p className={`text-2xl sm:text-3xl font-bold break-words ${(performance.monthlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {(performance.monthlyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.monthlyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.monthlyReturn || 0)}
                  </p>
                </div>
                <div className={`flex-shrink-0 p-2.5 rounded ${(performance.monthlyReturnPercent || 0) >= 0 ? 'bg-cyan-500 dark:bg-cyan-600' : 'bg-red-500 dark:bg-red-600'}`}>
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.accumulatedReturn')}</p>
                  <p className={`text-2xl sm:text-3xl font-bold break-words ${(performance.accumulatedReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {(performance.accumulatedReturnPercent || 0) >= 0 ? '+' : ''}{(performance.accumulatedReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.accumulatedReturn || 0)}
                  </p>
                </div>
                <div className={`flex-shrink-0 p-2.5 rounded ${(performance.accumulatedReturnPercent || 0) >= 0 ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600'}`}>
                  <CgDollar className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="stat-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.debt')}</p>
              <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 break-words">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalDebts || 0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalMonthlyDebtPayments || 0)}{t('dashboard.monthly')}
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
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.quarterlyReturn')}</p>
                  <p className={`text-2xl sm:text-3xl font-bold break-words ${(performance.quarterlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {(performance.quarterlyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.quarterlyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.quarterlyReturn || 0)}
                  </p>
                </div>
                <div className={`flex-shrink-0 p-2.5 rounded ${(performance.quarterlyReturnPercent || 0) >= 0 ? 'bg-teal-500 dark:bg-teal-600' : 'bg-red-500 dark:bg-red-600'}`}>
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.annualReturn')}</p>
                  <p className={`text-2xl sm:text-3xl font-bold break-words ${(performance.annualReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {(performance.annualReturnPercent || 0) >= 0 ? '+' : ''}{(performance.annualReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.annualReturn || 0)}
                  </p>
                </div>
                <div className={`flex-shrink-0 p-2.5 rounded ${(performance.annualReturnPercent || 0) >= 0 ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600'}`}>
                  <CgDollar className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.annualizedReturn')}</p>
                  <p className={`text-2xl sm:text-3xl font-bold break-words ${performance.annualizedReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {performance.annualizedReturn >= 0 ? '+' : ''}{performance.annualizedReturn.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Período: {performance.years.toFixed(1)} años
                  </p>
                </div>
                <div className={`flex-shrink-0 p-2.5 rounded ${performance.annualizedReturn >= 0 ? 'bg-blue-500 dark:bg-blue-600' : 'bg-red-500 dark:bg-red-600'}`}>
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            {performance.sp500Comparison && (
              <div className="stat-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.vsSP500')}</p>
                    {performance.sp500Comparison.outperformance !== null ? (
                      <>
                        <p className={`text-2xl sm:text-3xl font-bold break-words ${performance.sp500Comparison.outperformance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {performance.sp500Comparison.outperformance >= 0 ? '+' : ''}{performance.sp500Comparison.outperformance.toFixed(2)}%
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Tu CAGR: {performance.annualizedReturn.toFixed(2)}% | S&P 500: {performance.sp500Comparison.historicalAnnualReturn}%
                        </p>
                      </>
                    ) : (
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 break-words">
                        {performance.annualizedReturn.toFixed(2)}% vs {performance.sp500Comparison.historicalAnnualReturn}%
                      </p>
                    )}
                  </div>
                  <div className={`flex-shrink-0 p-2.5 rounded ${performance.sp500Comparison.outperformance !== null && performance.sp500Comparison.outperformance >= 0 ? 'bg-purple-500 dark:bg-purple-600' : 'bg-gray-500 dark:bg-gray-600'}`}>
                    {performance.sp500Comparison.outperformance !== null && performance.sp500Comparison.outperformance >= 0 ? (
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

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfica de Evolución del Patrimonio Total */}
        {balanceChart.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Evolución del Patrimonio Total</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={balanceChart.map((item, index) => {
                const balanceValue = parseFloat(item.balance) || 0;
                const dateStr = new Date(item.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
                
                // Verificar que los valores sean correctos en algunos puntos clave
                if (index === 0 || index === Math.floor(balanceChart.length / 2) || index === balanceChart.length - 1) {
                }
                
                return {
                  date: dateStr,
                  balance: balanceValue,
                };
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280" 
                  className="dark:stroke-gray-400"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#6b7280" 
                  className="dark:stroke-gray-400"
                  tickFormatter={(value) => new Intl.NumberFormat('es-ES', { 
                    style: 'currency', 
                    currency: 'EUR',
                    notation: 'compact',
                    maximumFractionDigits: 0
                  }).format(value)}
                />
                <Tooltip 
                  formatter={(value) => new Intl.NumberFormat('es-ES', { 
                    style: 'currency', 
                    currency: 'EUR' 
                  }).format(value)} 
                  labelFormatter={(label) => `Fecha: ${label}`}
                />
                <Legend />
                <Line 
                  type="linear" 
                  dataKey="balance" 
                  stroke="#0ea5e9" 
                  name="Patrimonio Total"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('dashboard.byAssetClass')}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={distributionByAssetClass}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent, value }) => 
                  `${name}: ${(percent * 100).toFixed(1)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {distributionByAssetClass.map((entry, index) => {
                  const color = ASSET_CLASS_COLORS[entry.name] || COLORS[index % COLORS.length];
                  return (
                    <Cell 
                      key={`asset-${index}`} 
                      fill={color}
                    />
                  );
                })}
              </Pie>
              <Tooltip 
                formatter={(value) => new Intl.NumberFormat('es-ES', { 
                  style: 'currency', 
                  currency: 'EUR' 
                }).format(value)} 
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Segunda fila: Evolución de Inversiones y Distribución por Banco */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfica de evolución de inversiones */}
        {investmentsEvolution.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Evolución de Inversiones</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={investmentsEvolution.map(item => ({
                date: new Date(item.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
                value: item.totalValue,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="date" stroke="#6b7280" className="dark:stroke-gray-400" />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                <Tooltip 
                  formatter={(value) => new Intl.NumberFormat('es-ES', { 
                    style: 'currency', 
                    currency: 'EUR' 
                  }).format(value)} 
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#8b5cf6" 
                  name="Valor Total Inversiones"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Gráfica de distribución por banco */}
        {distributionByBank && distributionByBank.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('dashboard.byBank')}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={prepareBankChartData()}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis type="number" stroke="#6b7280" className="dark:stroke-gray-400" />
                <YAxis 
                  type="category" 
                  dataKey="bank" 
                  stroke="#6b7280" 
                  className="dark:stroke-gray-400"
                  width={90}
                />
                <Tooltip
                  formatter={(value, name, props) => {
                    // Encontrar el nombre de la subcuenta
                    const subAccountName = props.payload[`${name}_name`] || 'Subcuenta';
                    return [
                      new Intl.NumberFormat('es-ES', { 
                        style: 'currency', 
                        currency: 'EUR' 
                      }).format(value),
                      subAccountName
                    ];
                  }}
                />
                {distributionByBank.map((bank, bankIndex) => {
                  const bankColors = generateBankColors(bank.bankName, bank.subAccounts.length, bank.color);
                  return bank.subAccounts.map((subAccount, subIndex) => (
                    <Bar
                      key={`${bank.bankName}-${subIndex}`}
                      dataKey={`${bank.bankName}_sub_${subIndex}`}
                      stackId={bank.bankName}
                      fill={bankColors.variations[subIndex] || bankColors.base}
                      radius={subIndex === bank.subAccounts.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                    />
                  ));
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Gráfica de inversiones detalladas */}
      {investmentsDetailed && investmentsDetailed.length > 0 && (
        <div className="card w-full overflow-hidden">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('dashboard.byInvestment')}</h2>
          <div className="w-full overflow-hidden" style={{ height: '500px', minHeight: '500px', maxWidth: '100%' }} data-treemap-container>
            <ResponsiveContainer width="100%" height="100%" debounce={300}>
              <Treemap
                data={investmentsDetailed}
                dataKey="value"
                nameKey="name"
                stroke="#fff"
                fill="#8884d8"
                isAnimationActive={false}
                content={renderTreemapContent}
            >
                <Tooltip 
                  formatter={(value, name) => [
                    new Intl.NumberFormat('es-ES', { 
                      style: 'currency', 
                      currency: 'EUR' 
                    }).format(value),
                    name
                  ]} 
                />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tooltip/Modal del Balance Total */}
      {showBalanceTooltip && (
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
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('dashboard.totalBalance')}</span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.totalBalance)}
                  </span>
                </div>
                {performance && performance.additionalCapital !== null && (
                  <>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.contributedCapital')}</span>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(performance.additionalCapital || 0)}
                      </span>
                    </div>
                    {(() => {
                      const totalReturn = stats.totalBalance - (performance.additionalCapital || 0);
                      const totalReturnPercent = (performance.additionalCapital || 0) > 0 
                        ? ((totalReturn / (performance.additionalCapital || 0)) * 100) 
                        : 0;
                      return (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.totalProfitLoss')}</span>
                          <div className="text-right">
                            <span className={`text-sm font-semibold ${totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {totalReturn >= 0 ? '+' : ''}{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalReturn)}
                            </span>
                            <span className={`text-xs ml-2 ${totalReturnPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              ({totalReturnPercent >= 0 ? '+' : ''}{totalReturnPercent.toFixed(2)}%)
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
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('dashboard.netWorth')}</span>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.totalBalance - (stats.totalDebts || 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.totalDebt')}</span>
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.totalDebts || 0)}
                    </span>
                  </div>
                </div>
              )}

              {/* Desglose de Activos */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('dashboard.assetBreakdown')}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Capital Invertido</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.totalInvestments || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Efectivo</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.totalCashSavings || 0)}
                  </span>
                </div>
                {(() => {
                  const totalAssets = (stats.totalCashSavings || 0) + (stats.totalInvestments || 0);
                  const cashPercent = totalAssets > 0 ? ((stats.totalCashSavings || 0) / totalAssets) * 100 : 0;
                  const investmentPercent = totalAssets > 0 ? ((stats.totalInvestments || 0) / totalAssets) * 100 : 0;
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
                              style={{ width: `${cashPercent}%`, backgroundColor: cashColor }}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-600"></div>
                          <span className="text-gray-600 dark:text-gray-400">{t('dashboard.invested')}: {investmentPercent.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cashColor }}></div>
                          <span className="text-gray-600 dark:text-gray-400">{t('dashboard.cash')}: {cashPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Rendimientos */}
              {performance && performance.annualizedReturn !== null && (
                <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Rendimientos</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {performance.accumulatedReturn !== null && performance.accumulatedReturnPercent !== null && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Acumulado</div>
                        <div className={`text-sm font-bold ${(performance.accumulatedReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {(performance.accumulatedReturnPercent || 0) >= 0 ? '+' : ''}{(performance.accumulatedReturnPercent || 0).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.accumulatedReturn || 0)}
                        </div>
                      </div>
                    )}
                    {performance.annualizedReturn !== null && performance.annualizedReturnPercent !== null && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Anualizado</div>
                        <div className={`text-sm font-bold ${(performance.annualizedReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {(performance.annualizedReturnPercent || 0) >= 0 ? '+' : ''}{(performance.annualizedReturnPercent || 0).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.annualizedReturn || 0)}
                        </div>
                      </div>
                    )}
                    {performance.monthlyReturn !== null && performance.monthlyReturnPercent !== null && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Mensual</div>
                        <div className={`text-sm font-bold ${(performance.monthlyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {(performance.monthlyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.monthlyReturnPercent || 0).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.monthlyReturn || 0)}
                        </div>
                      </div>
                    )}
                    {performance.dailyReturn !== null && performance.dailyReturnPercent !== null && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Diario</div>
                        <div className={`text-sm font-bold ${(performance.dailyReturnPercent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {(performance.dailyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.dailyReturnPercent || 0).toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.dailyReturn || 0)}
                        </div>
                      </div>
                    )}
                  </div>
                  {performance.vsSP500 !== null && performance.vsSP500 !== undefined && (
                    <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3 mt-3">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">vs S&P 500</div>
                      <div className={`text-sm font-bold ${(performance.vsSP500 || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {(performance.vsSP500 || 0) >= 0 ? '+' : ''}{(performance.vsSP500 || 0).toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle de inversión desde Treemap */}
      {showInvestmentDetailModal && selectedTreemapInvestment && (
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedTreemapInvestment.symbol}</p>
                )}
                {selectedTreemapInvestment.isin && !selectedTreemapInvestment.symbol && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ISIN: {selectedTreemapInvestment.isin}</p>
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
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Información Básica</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Tipo:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{getTypeLabel(selectedTreemapInvestment.type, selectedTreemapInvestment.isAutomatedPortfolio)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Moneda:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{selectedTreemapInvestment.currency}</span>
                    </div>
                    {(selectedTreemapInvestment.account || selectedTreemapInvestment.subAccount) && (
                      <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-400">Cuenta:</span>
                        <div className="mt-1">
                          {selectedTreemapInvestment.account && (
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {selectedTreemapInvestment.account.name || selectedTreemapInvestment.account.bankName || 'N/A'}
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
                        <div className="mt-1">
                          {selectedTreemapInvestment.assetClass === 'fixed_income' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                              Renta Fija (100%)
                            </span>
                          )}
                          {selectedTreemapInvestment.assetClass === 'variable_income' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                              Renta Variable (100%)
                            </span>
                          )}
                          {selectedTreemapInvestment.assetClass === 'mixed' && (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                Mixto
                              </span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                RF: {selectedTreemapInvestment.fixedIncomePercentage || 0}% | RV: {selectedTreemapInvestment.variableIncomePercentage || 0}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedTreemapInvestment.isAutomatedPortfolio && (
                      <div className="col-span-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                          Cartera Automatizada
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Información financiera */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Información Financiera</h3>
                  <div className="space-y-3 text-sm">
                    {selectedTreemapInvestment.isAutomatedPortfolio ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Monto invertido:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedTreemapInvestment.currency }).format(selectedTreemapInvestment.quantity)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Valor actual:</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {formatPrice(selectedTreemapInvestment.currentPrice, selectedTreemapInvestment.currency)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Cantidad:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{selectedTreemapInvestment.quantity} unidades</span>
                        </div>
                        {selectedTreemapInvestment.averagePurchasePrice && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Precio medio compra:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(selectedTreemapInvestment.averagePurchasePrice, selectedTreemapInvestment.currency)}
                            </span>
                          </div>
                        )}
                        {selectedTreemapInvestment.purchasePrice && !selectedTreemapInvestment.averagePurchasePrice && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Precio de compra:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(selectedTreemapInvestment.purchasePrice, selectedTreemapInvestment.currency)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Precio actual:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatPrice(selectedTreemapInvestment.currentPrice, selectedTreemapInvestment.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-gray-600 dark:text-gray-400">Valor total:</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedTreemapInvestment.currency }).format(
                              selectedTreemapInvestment.quantity * selectedTreemapInvestment.currentPrice
                            )}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-600 dark:text-gray-400">Ganancia/Pérdida:</span>
                      <span className={`font-bold flex items-center ${
                        calculateProfitLoss(selectedTreemapInvestment) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {calculateProfitLoss(selectedTreemapInvestment) >= 0 ? (
                          <CgTrending className="h-4 w-4 mr-1" />
                        ) : (
                          <CgTrendingDown className="h-4 w-4 mr-1" />
                        )}
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedTreemapInvestment.currency }).format(calculateProfitLoss(selectedTreemapInvestment))}
                        <span className="ml-2">({calculateProfitLossPercentage(selectedTreemapInvestment).toFixed(2)}%)</span>
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
                          {new Date(selectedTreemapInvestment.purchaseDate).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    )}
                    {selectedTreemapInvestment.createdAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Fecha de creación:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(selectedTreemapInvestment.createdAt).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    )}
                    {selectedTreemapInvestment.updatedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Última actualización:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(selectedTreemapInvestment.updatedAt).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Configuración - Solo mostrar si se puede activar/desactivar actualización automática */}
                {(selectedTreemapInvestment.symbol || selectedTreemapInvestment.isin) && !selectedTreemapInvestment.isAutomatedPortfolio && (
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Configuración</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Actualización automática:</span>
                        <span className={`font-medium ${
                          selectedTreemapInvestment.autoUpdate !== false ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {selectedTreemapInvestment.autoUpdate !== false ? 'Activada' : 'Desactivada'}
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
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{selectedTreemapInvestment.notes}</p>
                  </div>
                )}
              </div>

              {/* Columna derecha */}
              <div className="flex flex-col gap-4 overflow-y-auto pl-2 h-full">
                {/* Gráfica de evolución del valor */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Evolución del Valor</h3>
                  {detailInvestmentHistory.length > 0 ? (
                    <div style={{ height: '290px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={detailInvestmentHistory.map(h => ({
                          date: new Date(h.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                          value: h.totalValue,
                          dailyChange: h.dailyChangeAmount || 0,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-600" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#6b7280" 
                            className="dark:stroke-gray-400"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis 
                            stroke="#6b7280" 
                            className="dark:stroke-gray-400"
                            tickFormatter={(value) => {
                              return new Intl.NumberFormat('es-ES', { 
                                style: 'currency', 
                                currency: selectedTreemapInvestment.currency,
                                notation: 'compact',
                                maximumFractionDigits: 0
                              }).format(value);
                            }}
                          />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (!active || !payload || !payload.length) return null;
                              
                              const data = payload[0]?.payload;
                              const totalValue = data?.value || 0;
                              
                              const formattedValue = new Intl.NumberFormat('es-ES', { 
                                style: 'currency', 
                                currency: selectedTreemapInvestment.currency 
                              }).format(totalValue);
                              
                              return (
                                <div className="bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#404040] rounded shadow-lg p-3">
                                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">
                                    {label}
                                  </p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-gray-600 dark:text-gray-400 text-sm">Valor Total:</span>
                                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                                        {formattedValue}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#0ea5e9" 
                            name="Valor Total"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">No hay datos de historial para mostrar</p>
                      <p className="text-xs mt-2">El historial se genera automáticamente con las operaciones</p>
                    </div>
                  )}
                </div>

                {/* Gráfica de variación diaria */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Variación Diaria</h3>
                  {detailDailyVariations.length > 0 ? (
                    <div style={{ height: '290px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={detailDailyVariations.map(v => {
                          const changeAmount = v.dailyChangeAmount !== null && v.dailyChangeAmount !== undefined ? v.dailyChangeAmount : 0;
                          return {
                            date: new Date(v.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                            dailyChange: changeAmount,
                            dailyChangePercent: v.dailyChangePercent !== null && v.dailyChangePercent !== undefined ? v.dailyChangePercent : null,
                            dailyChangePositive: changeAmount >= 0 ? changeAmount : 0,
                            dailyChangeNegative: changeAmount < 0 ? changeAmount : 0,
                          };
                        })}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-600" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#6b7280" 
                            className="dark:stroke-gray-400"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis 
                            stroke="#6b7280" 
                            className="dark:stroke-gray-400"
                            tickFormatter={(value) => {
                              return new Intl.NumberFormat('es-ES', { 
                                style: 'currency', 
                                currency: selectedTreemapInvestment.currency,
                                notation: 'compact',
                                maximumFractionDigits: 0
                              }).format(value);
                            }}
                          />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (!active || !payload || !payload.length) return null;
                              
                              const data = payload[0]?.payload;
                              const dailyChange = data?.dailyChange !== null && data?.dailyChange !== undefined ? data.dailyChange : 0;
                              const dailyChangePercent = data?.dailyChangePercent;
                              
                              const formattedChange = new Intl.NumberFormat('es-ES', { 
                                style: 'currency', 
                                currency: selectedTreemapInvestment.currency 
                              }).format(Math.abs(dailyChange));
                              
                              return (
                                <div className="bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#404040] rounded shadow-lg p-3">
                                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">
                                    {label}
                                  </p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-gray-600 dark:text-gray-400 text-sm">Cambio Diario:</span>
                                      <span className={`font-medium text-sm ${
                                        dailyChange > 0 
                                          ? 'text-green-600 dark:text-green-400' 
                                          : dailyChange < 0
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-gray-500 dark:text-gray-400'
                                      }`}>
                                        {dailyChange > 0 ? '+' : dailyChange < 0 ? '-' : ''}{formattedChange}
                                        {dailyChange === 0 && ' (Sin variación)'}
                                      </span>
                                    </div>
                                    {dailyChangePercent !== null && dailyChangePercent !== undefined ? (
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600 dark:text-gray-400 text-sm">Variación:</span>
                                        <span className={`font-medium text-sm ${
                                          dailyChangePercent > 0 
                                            ? 'text-green-600 dark:text-green-400' 
                                            : dailyChangePercent < 0
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-gray-500 dark:text-gray-400'
                                        }`}>
                                          {dailyChangePercent > 0 ? '+' : ''}{dailyChangePercent.toFixed(2)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600 dark:text-gray-400 text-sm">Variación:</span>
                                        <span className="text-gray-500 dark:text-gray-400 text-sm">
                                          Sin datos previos
                                        </span>
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
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar 
                            dataKey="dailyChangeNegative" 
                            fill="#ef4444"
                            name="Pérdida"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">No hay datos de variación diaria para mostrar</p>
                      <p className="text-xs mt-2">Las variaciones se generan automáticamente al actualizar precios</p>
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
                <CgTime className="h-4 w-4 mr-2" />
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
        </div>
      )}

    </div>
  );
};

export default Dashboard;

