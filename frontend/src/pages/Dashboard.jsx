import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, ArrowUp, ArrowDown, DollarSign } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../services/api';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [balanceChart, setBalanceChart] = useState([]);
  const [investmentsEvolution, setInvestmentsEvolution] = useState([]);
  const [distributionByAssetClass, setDistributionByAssetClass] = useState([]);
  const [investmentsDetailed, setInvestmentsDetailed] = useState([]);
  const [distributionByBank, setDistributionByBank] = useState([]);

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#a855f7'];
  
  // Colores específicos para cada clase de activo
  const ASSET_CLASS_COLORS = {
    'Renta Fija': '#3b82f6', // Azul
    'Renta Variable': '#10b981', // Verde
    'Efectivo': '#f59e0b', // Amarillo/Naranja
  };

  // Generar colores para bancos y variaciones para subcuentas
  const generateBankColors = (bankName, subAccountCount, savedColor = null) => {
    // Si hay un color guardado, usarlo
    if (savedColor) {
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

  // Generar variaciones de un color
  const generateColorVariations = (baseColor, count) => {
    if (count === 0) return [];
    
    // Si es un color HSL, extraer los valores
    if (baseColor.startsWith('hsl')) {
      const match = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        const hue = parseInt(match[1]);
        const saturation = parseInt(match[2]);
        const lightness = parseInt(match[3]);
        
        return Array.from({ length: count }, (_, i) => {
          const lightVariation = lightness + (i * 10) - ((count - 1) * 5);
          const satVariation = saturation + (i % 2 === 0 ? 10 : -10);
          return `hsl(${hue}, ${Math.max(40, Math.min(100, satVariation))}%, ${Math.max(30, Math.min(80, lightVariation))}%)`;
        });
      }
    }
    
    // Si es un color hexadecimal, convertir a HSL y generar variaciones
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0;
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
    
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);
    
    return Array.from({ length: count }, (_, i) => {
      const lightVariation = l + (i * 10) - ((count - 1) * 5);
      const satVariation = s + (i % 2 === 0 ? 10 : -10);
      return `hsl(${h}, ${Math.max(40, Math.min(100, satVariation))}%, ${Math.max(30, Math.min(80, lightVariation))}%)`;
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
      const [statsRes, balanceRes, evolutionRes, assetClassRes, detailedRes, bankRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/balance-chart?months=6'),
        api.get('/investment-history/evolution?months=6'),
        api.get('/dashboard/distribution-by-asset-class'),
        api.get('/dashboard/investments-detailed'),
        api.get('/dashboard/distribution-by-bank'),
      ]);
      setStats(statsRes.data);
      setBalanceChart(balanceRes.data);
      setInvestmentsEvolution(evolutionRes.data);
      setDistributionByAssetClass(assetClassRes.data);
      setInvestmentsDetailed(detailedRes.data);
      setDistributionByBank(bankRes.data);
    } catch (error) {
      console.error('Error cargando datos del dashboard:', error);
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

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Balance Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(stats.totalBalance)}
              </p>
            </div>
            <div className="p-3 bg-primary-100 dark:bg-primary-900 rounded-lg">
              <Wallet className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Inversiones</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(stats.totalInvestments)}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Ganancias/Pérdidas</p>
              <p className={`text-2xl font-bold mt-1 ${stats.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(stats.totalProfitLoss)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              {stats.totalProfitLoss >= 0 ? (
                <ArrowUp className="h-6 w-6 text-green-600" />
              ) : (
                <ArrowDown className="h-6 w-6 text-red-600" />
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Balance Mensual</p>
              <p className={`text-2xl font-bold mt-1 ${stats.monthlyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(stats.monthlyBalance)}
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <DollarSign className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        {stats.totalDebts !== undefined && (
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Deuda Total</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(stats.totalDebts || 0)}
                </p>
                {stats.totalMonthlyDebtPayments > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Cuotas: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(stats.totalMonthlyDebtPayments)}/mes
                  </p>
                )}
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg">
                <ArrowDown className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Evolución del Patrimonio Total</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={balanceChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis dataKey="month" stroke="#6b7280" className="dark:stroke-gray-400" />
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
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="balance" 
                stroke="#0ea5e9" 
                name="Patrimonio Total"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

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

      {/* Gráfica de inversiones detalladas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Distribución por Inversión Individual</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={investmentsDetailed}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => {
                  // Truncar nombres largos
                  const displayName = name.length > 15 ? name.substring(0, 15) + '...' : name;
                  return `${displayName}: ${(percent * 100).toFixed(1)}%`;
                }}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {investmentsDetailed.map((entry, index) => (
                  <Cell key={`inv-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value, name) => [
                  new Intl.NumberFormat('es-ES', { 
                    style: 'currency', 
                    currency: 'EUR' 
                  }).format(value),
                  name
                ]} 
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

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
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gráfica de distribución por banco */}
      {distributionByBank && distributionByBank.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Distribución por Banco</h2>
          <ResponsiveContainer width="100%" height={Math.max(300, distributionByBank.length * 60)}>
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
                  const subAccountType = props.payload[`${name}_type`] || '';
                  const typeLabels = {
                    'cash': 'Efectivo',
                    'savings': 'Ahorro',
                    'investment': 'Inversión',
                    'credit': 'Crédito',
                  };
                  return [
                    new Intl.NumberFormat('es-ES', { 
                      style: 'currency', 
                      currency: 'EUR' 
                    }).format(value),
                    `${subAccountName} (${typeLabels[subAccountType] || subAccountType})`
                  ];
                }}
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e5e7eb' }}
              />
              <Legend 
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-4 mt-4 px-4">
                      {distributionByBank.map((bank, bankIndex) => {
                        const bankColors = generateBankColors(bank.bankName, bank.subAccounts.length, bank.color);
                        return (
                          <div key={bankIndex} className="flex items-center gap-2">
                            <div 
                              className="w-4 h-4 rounded" 
                              style={{ backgroundColor: bankColors.base }}
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                              {bank.bankName}
                            </span>
                            <div className="flex gap-1 ml-2">
                              {bank.subAccounts.map((subAccount, subIndex) => (
                                <div
                                  key={subIndex}
                                  className="w-3 h-3 rounded"
                                  style={{ backgroundColor: bankColors.variations[subIndex] }}
                                  title={`${subAccount.name} (${subAccount.type})`}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
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
  );
};

export default Dashboard;

