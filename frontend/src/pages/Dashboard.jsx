import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, ArrowUp, ArrowDown, DollarSign, AlertCircle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Treemap } from 'recharts';
import api from '../services/api';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [balanceChart, setBalanceChart] = useState([]);
  const [investmentsEvolution, setInvestmentsEvolution] = useState([]);
  const [distributionByAssetClass, setDistributionByAssetClass] = useState([]);
  const [investmentsDetailed, setInvestmentsDetailed] = useState([]);
  const [distributionByBank, setDistributionByBank] = useState([]);
  const [performance, setPerformance] = useState(null);

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Resumen de tus finanzas e inversiones</p>
      </div>

      {/* Primera fila: Resumen financiero */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">Balance Total</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 break-words">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalBalance)}
              </p>
            </div>
            <div className="flex-shrink-0 p-2 sm:p-3 bg-primary-100 dark:bg-primary-900 rounded-lg">
              <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </div>

        {performance && performance.annualizedReturn !== null && (
          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">Capital Aportado</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 break-words">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.additionalCapital || 0)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Aportado después del inicio
                </p>
              </div>
              <div className="flex-shrink-0 p-2 sm:p-3 bg-amber-100 dark:bg-amber-900 rounded-lg">
                <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">Efectivo</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 break-words">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalCashSavings || 0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Líquido disponible
              </p>
            </div>
            <div className="flex-shrink-0 p-2 sm:p-3 bg-emerald-100 dark:bg-emerald-900 rounded-lg">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">Capital Invertido</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 break-words">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalInvestments)}
              </p>
            </div>
            <div className="flex-shrink-0 p-2 sm:p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        {performance && performance.annualizedReturn !== null && (
          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">Rendimiento Acumulado</p>
                <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${(performance.accumulatedReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(performance.accumulatedReturnPercent || 0) >= 0 ? '+' : ''}{(performance.accumulatedReturnPercent || 0).toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.accumulatedReturn || 0)}
                </p>
              </div>
              <div className="flex-shrink-0 p-2 sm:p-3 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                <DollarSign className={`h-5 w-5 sm:h-6 sm:w-6 ${(performance.accumulatedReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">Deuda</p>
              <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-1 break-words">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalDebts || 0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(stats.totalMonthlyDebtPayments || 0)}/mes
              </p>
            </div>
            <div className="flex-shrink-0 p-2 sm:p-3 bg-red-100 dark:bg-red-900 rounded-lg">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Segunda fila: Rendimientos ordenados de mayor a menor plazo */}
      {performance && performance.annualizedReturn !== null && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">Rendimiento Anual</p>
                <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${(performance.annualReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(performance.annualReturnPercent || 0) >= 0 ? '+' : ''}{(performance.annualReturnPercent || 0).toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.annualReturn || 0)}
                </p>
              </div>
              <div className="flex-shrink-0 p-2 sm:p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <DollarSign className={`h-5 w-5 sm:h-6 sm:w-6 ${performance.totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">Rendimiento Trimestral</p>
                <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${(performance.quarterlyReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(performance.quarterlyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.quarterlyReturnPercent || 0).toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.quarterlyReturn || 0)}
                </p>
              </div>
              <div className="flex-shrink-0 p-2 sm:p-3 bg-teal-100 dark:bg-teal-900 rounded-lg">
                <TrendingUp className={`h-5 w-5 sm:h-6 sm:w-6 ${(performance.quarterlyReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">Rendimiento Mensual</p>
                <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${(performance.monthlyReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(performance.monthlyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.monthlyReturnPercent || 0).toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.monthlyReturn || 0)}
                </p>
              </div>
              <div className="flex-shrink-0 p-2 sm:p-3 bg-cyan-100 dark:bg-cyan-900 rounded-lg">
                <TrendingUp className={`h-5 w-5 sm:h-6 sm:w-6 ${(performance.monthlyReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">Cambio Diario</p>
                <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${(performance.dailyReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(performance.dailyReturnPercent || 0) >= 0 ? '+' : ''}{(performance.dailyReturnPercent || 0).toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(performance.dailyReturn || 0)}
                </p>
              </div>
              <div className="flex-shrink-0 p-2 sm:p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <TrendingUp className={`h-5 w-5 sm:h-6 sm:w-6 ${(performance.dailyReturnPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">Rendimiento Anualizado (CAGR)</p>
                <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${performance.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {performance.annualizedReturn >= 0 ? '+' : ''}{performance.annualizedReturn.toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Período: {performance.years.toFixed(1)} años
                </p>
              </div>
              <div className="flex-shrink-0 p-2 sm:p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <TrendingUp className={`h-5 w-5 sm:h-6 sm:w-6 ${performance.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </div>

          {performance.sp500Comparison && (
            <div className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">vs S&P 500</p>
                  {performance.sp500Comparison.outperformance !== null ? (
                    <>
                      <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${performance.sp500Comparison.outperformance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {performance.sp500Comparison.outperformance >= 0 ? '+' : ''}{performance.sp500Comparison.outperformance.toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Tu CAGR: {performance.annualizedReturn.toFixed(2)}% | S&P 500: {performance.sp500Comparison.historicalAnnualReturn}%
                      </p>
                    </>
                  ) : (
                    <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1 break-words">
                      {performance.annualizedReturn.toFixed(2)}% vs {performance.sp500Comparison.historicalAnnualReturn}%
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 p-2 sm:p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  {performance.sp500Comparison.outperformance !== null && performance.sp500Comparison.outperformance >= 0 ? (
                    <ArrowUp className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                  ) : (
                    <ArrowDown className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfica de Evolución del Patrimonio Total */}
        {balanceChart.length > 0 && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Evolución del Patrimonio Total</h2>
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Distribución por Clase de Activo</h2>
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
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Evolución de Inversiones</h2>
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
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Distribución por Banco</h2>
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
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e5e7eb' }}
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
        <div className="card w-full">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Distribución por Inversión Individual</h2>
          <ResponsiveContainer width="100%" height={500}>
            <Treemap
              data={investmentsDetailed}
              dataKey="value"
              nameKey="name"
              stroke="#fff"
              fill="#8884d8"
              content={({ x, y, width, height, index, payload, root }) => {
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
                }}
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
      )}

    </div>
  );
};

export default Dashboard;

