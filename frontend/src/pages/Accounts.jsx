import { useEffect, useState } from 'react';
import { CgAdd, CgCreditCard, CgEditMarkup, CgTrash, CgChevronDown, CgChevronRight, CgTrending, CgChart, CgTrendingDown, CgTime } from 'react-icons/cg';
import { SiBitcoin } from 'react-icons/si';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/TranslationContext';

/**
 * Formatea precios con 4 decimales, pero muestra solo 2 si los dos últimos son 00
 */
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

const Accounts = () => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [dailyVariations, setDailyVariations] = useState({}); // { investmentId: { changeAmount, changePercent } }
  const [loading, setLoading] = useState(true);
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());
  const [expandedSubAccounts, setExpandedSubAccounts] = useState(new Set());
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSubAccountModal, setShowSubAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingSubAccount, setEditingSubAccount] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [accountFormData, setAccountFormData] = useState({
    name: '',
    bankName: '',
    accountNumber: '',
    currency: 'EUR',
    description: '',
    initialBalance: 0,
    color: '#3b82f6', // Azul por defecto
  });
  const [subAccountFormData, setSubAccountFormData] = useState({
    name: '',
    type: 'cash',
    balance: 0,
    currency: 'EUR',
    description: '',
    initialDate: '',
  });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailInvestment, setDetailInvestment] = useState(null);
  const [detailInvestmentHistory, setDetailInvestmentHistory] = useState([]);
  const [detailDailyVariations, setDetailDailyVariations] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [accountsRes, subAccountsRes, investmentsRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/subaccounts'),
        api.get('/investments'),
      ]);
      setAccounts(accountsRes.data);
      setSubAccounts(subAccountsRes.data);
      setInvestments(investmentsRes.data);
      
      // Obtener variaciones diarias de todas las inversiones
      const variationsMap = {};
      await Promise.all(
        investmentsRes.data.map(async (inv) => {
          try {
            // Obtener la variación más reciente (sin limit para obtener todas y luego tomar la última)
            const variationsRes = await api.get(`/investment-history/investment/${inv._id}/daily-variations`);
            if (variationsRes.data && variationsRes.data.length > 0) {
              // Ordenar por fecha descendente y tomar la más reciente
              const sorted = variationsRes.data.sort((a, b) => {
                const dateA = new Date(a.date || a.createdAt);
                const dateB = new Date(b.date || b.createdAt);
                return dateB - dateA;
              });
              const latest = sorted[0];
              
              // Validar que la variación sea razonable (no más del 100% del valor actual)
              const currentValue = inv.isAutomatedPortfolio 
                ? inv.currentPrice 
                : inv.quantity * inv.currentPrice;
              const changeAmount = latest.dailyChangeAmount || latest.changeAmount || 0;
              
              // Si la variación es mayor al 100% del valor actual, probablemente es un error
              if (Math.abs(changeAmount) > currentValue * 1.5) {
                console.warn(`[Accounts] Variación sospechosa para ${inv.name}: ${changeAmount}€ (valor actual: ${currentValue}€)`);
                variationsMap[inv._id] = { changeAmount: 0, changePercent: 0 };
              } else {
                variationsMap[inv._id] = {
                  changeAmount: changeAmount,
                  changePercent: latest.dailyChangePercent || latest.changePercent || 0,
                };
              }
            } else {
              variationsMap[inv._id] = { changeAmount: 0, changePercent: 0 };
            }
          } catch (error) {
            console.error(`[Accounts] Error obteniendo variación para ${inv.name}:`, error);
            // Si no hay variaciones, usar 0
            variationsMap[inv._id] = { changeAmount: 0, changePercent: 0 };
          }
        })
      );
      setDailyVariations(variationsMap);
      
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const toggleAccount = (accountId) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  const toggleSubAccount = (subAccountId) => {
    const newExpanded = new Set(expandedSubAccounts);
    if (newExpanded.has(subAccountId)) {
      newExpanded.delete(subAccountId);
    } else {
      newExpanded.add(subAccountId);
    }
    setExpandedSubAccounts(newExpanded);
  };

  const getInvestmentsForSubAccount = (subAccountId) => {
    return investments.filter(inv => inv.subAccount?._id === subAccountId || inv.subAccount === subAccountId);
  };

  const getInvestmentsForAccount = (accountId) => {
    return investments.filter(inv => 
      (inv.account?._id === accountId || inv.account === accountId) && !inv.subAccount
    );
  };

  const calculateSubAccountTotalValue = (subAccount) => {
    if (subAccount.type !== 'investment') {
      return subAccount.balance;
    }
    
    // Para subcuentas de inversión, sumar el balance + valor de las inversiones
    const subAccountInvestments = getInvestmentsForSubAccount(subAccount._id);
    const investmentsValue = subAccountInvestments.reduce((sum, inv) => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      return sum + value;
    }, 0);
    
    return subAccount.balance + investmentsValue;
  };

  const getSubAccountsForAccount = (accountId) => {
    const subs = subAccounts.filter(sub => sub.account?._id === accountId || sub.account === accountId);
    // Ordenar: primero cash, luego savings, luego el resto
    return subs.sort((a, b) => {
      const typeOrder = { cash: 1, savings: 2, investment: 3, credit: 4 };
      const orderA = typeOrder[a.type] || 99;
      const orderB = typeOrder[b.type] || 99;
      return orderA - orderB;
    });
  };

  const calculateTotalBalance = (accountId) => {
    const subs = getSubAccountsForAccount(accountId);
    const subsBalance = subs.reduce((sum, sub) => sum + calculateSubAccountTotalValue(sub), 0);
    
    // Agregar inversiones directamente asociadas a la cuenta (sin subcuenta)
    const accountInvestments = getInvestmentsForAccount(accountId);
    const investmentsValue = accountInvestments.reduce((sum, inv) => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      return sum + value;
    }, 0);
    
    return subsBalance + investmentsValue;
  };

  // Calcular capital invertido total de una cuenta (inversiones directas + inversiones en subcuentas)
  const calculateAccountInvestedCapital = (accountId) => {
    const accountInvestments = getInvestmentsForAccount(accountId);
    const subs = getSubAccountsForAccount(accountId);
    
    let totalInvestedCapital = 0;
    
    // Sumar capital invertido de inversiones directas
    accountInvestments.forEach(inv => {
      if (inv.isAutomatedPortfolio) {
        totalInvestedCapital += inv.quantity || 0;
      } else {
        const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
        totalInvestedCapital += (inv.quantity || 0) * avgPrice;
      }
    });
    
    // Sumar capital invertido de inversiones en subcuentas
    subs.forEach(sub => {
      totalInvestedCapital += calculateSubAccountInvestedCapital(sub._id);
    });
    
    return totalInvestedCapital;
  };

  // Calcular valor actual total de inversiones de una cuenta
  const calculateAccountInvestmentsValue = (accountId) => {
    const accountInvestments = getInvestmentsForAccount(accountId);
    const subs = getSubAccountsForAccount(accountId);
    
    let totalValue = 0;
    
    // Sumar valor actual de inversiones directas
    accountInvestments.forEach(inv => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      totalValue += value;
    });
    
    // Sumar valor actual de inversiones en subcuentas
    subs.forEach(sub => {
      const subAccountInvestments = getInvestmentsForSubAccount(sub._id);
      subAccountInvestments.forEach(inv => {
        const value = inv.isAutomatedPortfolio 
          ? inv.currentPrice 
          : inv.quantity * inv.currentPrice;
        totalValue += value;
      });
    });
    
    return totalValue;
  };

  // Calcular variación total de inversiones de un banco
  const calculateAccountInvestmentsVariation = (accountId) => {
    const accountInvestments = getInvestmentsForAccount(accountId);
    const subs = getSubAccountsForAccount(accountId);
    
    // Sumar variaciones de inversiones directas
    let totalChangeAmount = 0;
    accountInvestments.forEach(inv => {
      const variation = dailyVariations[inv._id];
      if (variation) {
        totalChangeAmount += variation.changeAmount || 0;
      }
    });
    
    // Sumar variaciones de inversiones en subcuentas
    subs.forEach(sub => {
      const subAccountInvestments = getInvestmentsForSubAccount(sub._id);
      subAccountInvestments.forEach(inv => {
        const variation = dailyVariations[inv._id];
        if (variation) {
          totalChangeAmount += variation.changeAmount || 0;
        }
      });
    });
    
    return totalChangeAmount;
  };

  // Calcular capital invertido total de una subcuenta
  const calculateSubAccountInvestedCapital = (subAccountId) => {
    const subAccountInvestments = getInvestmentsForSubAccount(subAccountId);
    
    let totalInvestedCapital = 0;
    subAccountInvestments.forEach(inv => {
      if (inv.isAutomatedPortfolio) {
        totalInvestedCapital += inv.quantity || 0;
      } else {
        const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
        totalInvestedCapital += (inv.quantity || 0) * avgPrice;
      }
    });
    
    return totalInvestedCapital;
  };

  // Calcular variación total de inversiones de una subcuenta
  const calculateSubAccountInvestmentsVariation = (subAccountId) => {
    const subAccountInvestments = getInvestmentsForSubAccount(subAccountId);
    
    let totalChangeAmount = 0;
    subAccountInvestments.forEach(inv => {
      const variation = dailyVariations[inv._id];
      if (variation) {
        const changeAmount = variation.changeAmount || 0;
        totalChangeAmount += changeAmount;
        
        // Log para depuración si la variación es muy grande
        if (Math.abs(changeAmount) > 1000) {
          console.log(`[Accounts DEBUG] Variación grande en ${inv.name}:`, {
            investmentId: inv._id,
            changeAmount: changeAmount,
            changePercent: variation.changePercent,
            currentValue: inv.isAutomatedPortfolio ? inv.currentPrice : inv.quantity * inv.currentPrice,
          });
        }
      }
    });
    
    // Log si la variación total es sospechosa
    if (Math.abs(totalChangeAmount) > 1000) {
      console.log(`[Accounts DEBUG] Variación total sospechosa en subcuenta ${subAccountId}:`, {
        totalChangeAmount: totalChangeAmount,
        investments: subAccountInvestments.map(inv => ({
          name: inv.name,
          variation: dailyVariations[inv._id],
        })),
      });
    }
    
    return totalChangeAmount;
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await api.put(`/accounts/${editingAccount._id}`, accountFormData);
      } else {
        await api.post('/accounts', accountFormData);
      }
      fetchData();
      setShowAccountModal(false);
      resetAccountForm();
    } catch (error) {
    }
  };

  const handleSubAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      // Preparar datos: si initialDate está vacío, no enviarlo (o enviarlo como null)
      const formData = { ...subAccountFormData };
      if (!formData.initialDate || formData.initialDate === '') {
        // Si está vacío, no incluir el campo o enviarlo como null
        delete formData.initialDate;
      } else {
        // Convertir la fecha a formato ISO para el backend
        formData.initialDate = new Date(formData.initialDate).toISOString();
      }
      
      if (editingSubAccount) {
        await api.put(`/subaccounts/${editingSubAccount._id}`, formData);
      } else {
        await api.post('/subaccounts', {
          ...formData,
          account: selectedAccountId,
        });
      }
      fetchData();
      setShowSubAccountModal(false);
      resetSubAccountForm();
    } catch (error) {
    }
  };

  const handleEditAccount = (account) => {
    setEditingAccount(account);
    setAccountFormData({
      name: account.name,
      bankName: account.bankName || '',
      accountNumber: account.accountNumber || '',
      currency: account.currency,
      description: account.description || '',
      initialBalance: 0, // No se usa en edición, solo en creación
      color: account.color || '#3b82f6',
    });
    setShowAccountModal(true);
  };

  const handleEditSubAccount = (subAccount) => {
    setEditingSubAccount(subAccount);
    // Formatear la fecha para el input type="date" (YYYY-MM-DD)
    const initialDate = subAccount.initialDate 
      ? new Date(subAccount.initialDate).toISOString().split('T')[0]
      : '';
    setSubAccountFormData({
      name: subAccount.name,
      type: subAccount.type,
      balance: subAccount.balance,
      currency: subAccount.currency,
      description: subAccount.description || '',
      initialDate: initialDate,
    });
    setSelectedAccountId(subAccount.account?._id || subAccount.account);
    setShowSubAccountModal(true);
  };

  const handleDeleteAccount = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta cuenta? También se eliminarán todas sus subcuentas.')) {
      try {
        await api.delete(`/accounts/${id}`);
        fetchData();
      } catch (error) {
      }
    }
  };

  const handleDeleteSubAccount = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta subcuenta?')) {
      try {
        await api.delete(`/subaccounts/${id}`);
        fetchData();
      } catch (error) {
      }
    }
  };

  const resetAccountForm = () => {
    setAccountFormData({
      name: '',
      bankName: '',
      accountNumber: '',
      currency: 'EUR',
      description: '',
      initialBalance: 0,
      color: '#3b82f6', // Azul por defecto
    });
    setEditingAccount(null);
  };

  const resetSubAccountForm = () => {
    setSubAccountFormData({
      name: '',
      type: 'cash',
      balance: 0,
      currency: 'EUR',
      description: '',
      initialDate: '',
    });
    setEditingSubAccount(null);
    setSelectedAccountId(null);
  };

  const getSubAccountTypeIcon = (type) => {
    switch (type) {
      case 'cash':
        return <CgCreditCard className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />;
      case 'investment':
        return <CgTrending className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />;
      case 'savings':
        return <CgChart className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />;
      case 'credit':
        return <CgCreditCard className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />;
      default:
        return <CgCreditCard className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />;
    }
  };

  const getInvestmentTypeLabel = (type) => {
    const types = {
      stock: 'Acción',
      bond: 'Bono',
      crypto: 'Cripto',
      fund: 'Fondo',
      etf: 'ETF',
      other: 'Otro',
    };
    return types[type] || type;
  };

  const getSubAccountTypeLabel = (type) => {
    const types = {
      cash: 'Efectivo',
      investment: 'Inversión',
      savings: 'Ahorro',
      credit: 'Crédito',
    };
    return types[type] || type;
  };

  const getTypeLabel = (type, isAutomatedPortfolio = false) => {
    if (isAutomatedPortfolio) {
      return 'Cartera Automatizada';
    }
    const types = {
      stock: 'Acción',
      bond: 'Bono',
      crypto: 'Cripto',
      fund: 'Fondo',
      etf: 'ETF',
      automated_portfolio: 'Cartera Automatizada',
      other: 'Otro',
    };
    return types[type] || type;
  };

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

  const navigate = useNavigate();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('accounts.title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t('accounts.subtitle')}</p>
        </div>
        <button onClick={() => { resetAccountForm(); setShowAccountModal(true); }} className="btn-primary flex items-center">
          <CgAdd className="h-5 w-5 mr-2" />
          {t('accounts.newAccount')}
        </button>
      </div>

      <div className="space-y-4">
        {accounts.map((account) => {
          const accountSubAccounts = getSubAccountsForAccount(account._id);
          const isExpanded = expandedAccounts.has(account._id);
          const totalBalance = calculateTotalBalance(account._id);

          return (
            <div key={account._id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1">
                  <button
                    onClick={() => toggleAccount(account._id)}
                    className="mr-3 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    {isExpanded ? (
                      <CgChevronDown className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                    ) : (
                      <CgChevronRight className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                    )}
                  </button>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${account.color || '#3b82f6'}20` }}>
                    <CgCreditCard className="h-5 w-5" style={{ color: account.color || '#3b82f6' }} />
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{account.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{account.bankName}</p>
                  </div>
                  <div className="text-right mr-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('accounts.total')}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: account.currency }).format(totalBalance)}
                    </p>
                    {(() => {
                      const investedCapital = calculateAccountInvestedCapital(account._id);
                      const currentValue = calculateAccountInvestmentsValue(account._id);
                      const profitLoss = currentValue - investedCapital;
                      const profitLossPercent = investedCapital > 0 ? (profitLoss / investedCapital) * 100 : 0;
                      
                      if (investedCapital > 0) {
                        return (
                          <p className={`text-xs mt-1 font-semibold ${profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {profitLoss >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}% ({profitLoss >= 0 ? '+' : ''}{new Intl.NumberFormat('es-ES', { style: 'currency', currency: account.currency }).format(profitLoss)})
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedAccountId(account._id);
                      resetSubAccountForm();
                      setShowSubAccountModal(true);
                    }}
                    className="btn-secondary text-sm flex items-center"
                  >
                    <CgAdd className="h-4 w-4 mr-1" />
                    {t('accounts.newSubAccount')}
                  </button>
                  <button
                    onClick={() => handleEditAccount(account)}
                    className="px-3 py-2 btn-secondary"
                  >
                    <CgEditMarkup className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(account._id)}
                    className="px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                  >
                    <CgTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  {accountSubAccounts.length === 0 && getInvestmentsForAccount(account._id).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      {t('accounts.noSubAccountsOrInvestments')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {/* Mostrar subcuentas primero (ordenadas: cash, savings, luego el resto) */}
                      {accountSubAccounts.map((subAccount) => {
                        const subAccountInvestments = getInvestmentsForSubAccount(subAccount._id);
                        const isSubAccountExpanded = expandedSubAccounts.has(subAccount._id);
                        const totalValue = calculateSubAccountTotalValue(subAccount);
                        const investmentsValue = subAccountInvestments.reduce((sum, inv) => {
                          const value = inv.isAutomatedPortfolio 
                            ? inv.currentPrice 
                            : inv.quantity * inv.currentPrice;
                          return sum + value;
                        }, 0);

                        return (
                          <div key={subAccount._id} className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg border border-gray-200/50 dark:border-[#404040]/50">
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center flex-1">
                                {subAccount.type === 'investment' && subAccountInvestments.length > 0 && (
                                  <button
                                    onClick={() => toggleSubAccount(subAccount._id)}
                                    className="mr-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                  >
                                    {isSubAccountExpanded ? (
                                      <CgChevronDown className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                    ) : (
                                      <CgChevronRight className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                    )}
                                  </button>
                                )}
                                <div className="p-2 bg-gray-100 dark:bg-[#404040] rounded-lg mr-3">
                                  <div className="text-gray-800 dark:text-[#e5e5e5]">
                                    {getSubAccountTypeIcon(subAccount.type)}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{subAccount.name}</h4>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {getSubAccountTypeLabel(subAccount.type)}
                                    {subAccount.type === 'investment' && subAccountInvestments.length > 0 && (
                                      <span className="ml-2">({subAccountInvestments.length} inversión{subAccountInvestments.length !== 1 ? 'es' : ''})</span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right mr-4">
                                  {subAccount.type === 'investment' ? (
                                    <div>
                                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: subAccount.currency }).format(totalValue)}
                                      </p>
                                      {(() => {
                                        if (subAccountInvestments.length > 0) {
                                          const investedCapital = calculateSubAccountInvestedCapital(subAccount._id);
                                          const currentValue = investmentsValue;
                                          const profitLoss = currentValue - investedCapital;
                                          const profitLossPercent = investedCapital > 0 ? (profitLoss / investedCapital) * 100 : 0;
                                          
                                          if (investedCapital > 0) {
                                            return (
                                              <p className={`text-xs mt-1 font-semibold ${profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {profitLoss >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}% ({profitLoss >= 0 ? '+' : ''}{new Intl.NumberFormat('es-ES', { style: 'currency', currency: subAccount.currency }).format(profitLoss)})
                                              </p>
                                            );
                                          }
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  ) : (
                                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: subAccount.currency }).format(subAccount.balance)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditSubAccount(subAccount)}
                                  className="px-3 py-2 btn-secondary"
                                >
                                  <CgEditMarkup className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSubAccount(subAccount._id)}
                                  className="px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                                >
                                  <CgTrash className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            
                            {/* Mostrar inversiones si es subcuenta de inversión y está expandida */}
                            {subAccount.type === 'investment' && isSubAccountExpanded && subAccountInvestments.length > 0 && (
                              <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-600">
                                <div className="mt-2 space-y-2">
                                  {subAccountInvestments.map((investment, index) => {
                                    const investmentValue = investment.isAutomatedPortfolio 
                                      ? investment.currentPrice 
                                      : investment.quantity * investment.currentPrice;
                                    const profitLoss = investment.isAutomatedPortfolio
                                      ? investment.currentPrice - investment.quantity
                                      : (investment.currentPrice - (investment.averagePurchasePrice || investment.purchasePrice)) * investment.quantity;
                                    const profitLossPercent = investment.isAutomatedPortfolio
                                      ? ((investment.currentPrice - investment.quantity) / investment.quantity) * 100
                                      : ((investment.currentPrice - (investment.averagePurchasePrice || investment.purchasePrice)) / (investment.averagePurchasePrice || investment.purchasePrice)) * 100;
                                    const isInvestmentExpanded = expandedSubAccounts.has(`subaccount-investment-${investment._id}`);

                                    return (
                                      <div key={investment._id} className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg border border-gray-200/50 dark:border-[#404040]/50">
                                        <div 
                                          className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#404040]/50 transition-colors"
                                          onClick={(e) => {
                                            // Evitar que se active cuando se hace clic en el botón de colapsar
                                            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                                              return;
                                            }
                                            // Si está expandido, colapsar; si está colapsado, expandir
                                            toggleSubAccount(`subaccount-investment-${investment._id}`);
                                          }}
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center flex-1">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleSubAccount(`subaccount-investment-${investment._id}`);
                                                }}
                                                className="mr-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                              >
                                                {isInvestmentExpanded ? (
                                                  <CgChevronDown className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                                ) : (
                                                  <CgChevronRight className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                                )}
                                              </button>
                                              <div className="flex-1">
                                                <p className="font-medium text-gray-900 dark:text-gray-100">{investment.name}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                  {investment.symbol && `${investment.symbol} • `}
                                                  {investment.isAutomatedPortfolio ? 'Cartera Automatizada' : `${investment.quantity} unidades`}
                                                </p>
                                              </div>
                                            </div>
                                            <div className="text-right">
                                              <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: investment.currency }).format(investmentValue)}
                                              </p>
                                              <p className={`text-xs ${profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {profitLoss >= 0 ? '+' : ''}{new Intl.NumberFormat('es-ES', { style: 'currency', currency: investment.currency }).format(profitLoss)} ({profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%)
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {isInvestmentExpanded && (
                                          <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-600">
                                            <div 
                                              className="mt-2 p-3 bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-[#404040]/50 transition-colors"
                                              onClick={async (e) => {
                                                // Evitar que se active cuando se hace clic en botones o inputs
                                                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button') || e.target.closest('input')) {
                                                  return;
                                                }
                                                setDetailInvestment(investment);
                                                setShowDetailModal(true);
                                                // Cargar historial y variaciones diarias para las gráficas
                                                try {
                                                  const [historyRes, variationsRes] = await Promise.all([
                                                    api.get(`/investment-history/investment/${investment._id}`),
                                                    api.get(`/investment-history/investment/${investment._id}/daily-variations`)
                                                  ]);
                                                  setDetailInvestmentHistory(historyRes.data || []);
                                                  setDetailDailyVariations(variationsRes.data || []);
                                                } catch (error) {
                                                  setDetailInvestmentHistory([]);
                                                  setDetailDailyVariations([]);
                                                }
                                              }}
                                            >
                                              <div className="space-y-1 text-sm">
                                                <p><span className="font-medium">Tipo:</span> {
                                                  investment.assetClass === 'fixed_income' ? 'Renta Fija (100%)' :
                                                  investment.assetClass === 'variable_income' ? 'Renta Variable (100%)' :
                                                  `Renta Fija: ${investment.fixedIncomePercentage || 0}% | Renta Variable: ${investment.variableIncomePercentage || 0}%`
                                                }</p>
                                                {investment.isAutomatedPortfolio ? (
                                                  <p><span className="font-medium">Cartera Automatizada</span></p>
                                                ) : (
                                                  <>
                                                    <p><span className="font-medium">Cantidad:</span> {investment.quantity} unidades</p>
                                                    {investment.averagePurchasePrice && (
                                                      <p><span className="font-medium">Precio medio:</span> {formatPrice(investment.averagePurchasePrice, investment.currency)}</p>
                                                    )}
                                                  </>
                                                )}
                                                <p><span className="font-medium">Precio actual:</span> {formatPrice(investment.currentPrice, investment.currency)}</p>
                                                {investment.notes && (
                                                  <p><span className="font-medium">Notas:</span> {investment.notes}</p>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Mostrar inversiones directas después de las subcuentas */}
                      {getInvestmentsForAccount(account._id).map((investment) => {
                        const investmentValue = investment.isAutomatedPortfolio 
                          ? investment.currentPrice 
                          : investment.quantity * investment.currentPrice;
                        const profitLoss = investment.isAutomatedPortfolio
                          ? investment.currentPrice - investment.quantity
                          : (investment.currentPrice - (investment.averagePurchasePrice || investment.purchasePrice)) * investment.quantity;
                        const profitLossPercent = investment.isAutomatedPortfolio
                          ? ((investment.currentPrice - investment.quantity) / investment.quantity) * 100
                          : ((investment.currentPrice - (investment.averagePurchasePrice || investment.purchasePrice)) / (investment.averagePurchasePrice || investment.purchasePrice)) * 100;
                        const isInvestmentExpanded = expandedSubAccounts.has(`investment-${investment._id}`);

                        return (
                          <div 
                            key={investment._id} 
                            className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg border border-gray-200/50 dark:border-[#404040]/50"
                          >
                            <div 
                              className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#404040]/50 transition-colors"
                              onClick={(e) => {
                                // Evitar que se active cuando se hace clic en el botón de colapsar
                                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                                  return;
                                }
                                // Si está expandido, colapsar; si está colapsado, expandir
                                toggleSubAccount(`investment-${investment._id}`);
                              }}
                            >
                              <div className="flex items-center flex-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSubAccount(`investment-${investment._id}`);
                                  }}
                                  className="mr-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                >
                                  {isInvestmentExpanded ? (
                                    <CgChevronDown className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                  ) : (
                                    <CgChevronRight className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                  )}
                                </button>
                                <div className="p-2 rounded-lg mr-3" style={{ backgroundColor: 'var(--user-color-100)', color: 'var(--user-color-600)' }}>
                                  {investment.type === 'crypto' ? (
                                    <SiBitcoin className="h-4 w-4" style={{ color: 'var(--user-color-600)' }} />
                                  ) : (
                                    <CgTrending className="h-4 w-4" style={{ color: 'var(--user-color-600)' }} />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{investment.name}</h4>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {getInvestmentTypeLabel(investment.type)}
                                    {investment.symbol && ` • ${investment.symbol}`}
                                  </p>
                                </div>
                                <div className="text-right mr-4">
                                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: investment.currency }).format(investmentValue)}
                                  </p>
                                  <p className={`text-xs ${profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {profitLoss >= 0 ? '+' : ''}{new Intl.NumberFormat('es-ES', { style: 'currency', currency: investment.currency }).format(profitLoss)} ({profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%)
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            {isInvestmentExpanded && (
                              <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-600">
                                <div 
                                  className="mt-2 p-3 bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-[#404040]/50 transition-colors"
                                  onClick={async (e) => {
                                    // Evitar que se active cuando se hace clic en botones o inputs
                                    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('button') || e.target.closest('input')) {
                                      return;
                                    }
                                    setDetailInvestment(investment);
                                    setShowDetailModal(true);
                                    // Cargar historial y variaciones diarias para las gráficas
                                    try {
                                      const [historyRes, variationsRes] = await Promise.all([
                                        api.get(`/investment-history/investment/${investment._id}`),
                                        api.get(`/investment-history/investment/${investment._id}/daily-variations`)
                                      ]);
                                      setDetailInvestmentHistory(historyRes.data || []);
                                      setDetailDailyVariations(variationsRes.data || []);
                                    } catch (error) {
                                      setDetailInvestmentHistory([]);
                                      setDetailDailyVariations([]);
                                    }
                                  }}
                                >
                                  <div className="space-y-1 text-sm">
                                    <p><span className="font-medium">Tipo:</span> {
                                      investment.assetClass === 'fixed_income' ? 'Renta Fija (100%)' :
                                      investment.assetClass === 'variable_income' ? 'Renta Variable (100%)' :
                                      `Renta Fija: ${investment.fixedIncomePercentage || 0}% | Renta Variable: ${investment.variableIncomePercentage || 0}%`
                                    }</p>
                                    {investment.isAutomatedPortfolio ? (
                                      <p><span className="font-medium">Cartera Automatizada</span></p>
                                    ) : (
                                      <>
                                        <p><span className="font-medium">Cantidad:</span> {investment.quantity} unidades</p>
                                        {investment.averagePurchasePrice && (
                                          <p><span className="font-medium">Precio medio:</span> {formatPrice(investment.averagePurchasePrice, investment.currency)}</p>
                                        )}
                                      </>
                                    )}
                                    <p><span className="font-medium">Precio actual:</span> {formatPrice(investment.currentPrice, investment.currency)}</p>
                                    {investment.notes && (
                                      <p><span className="font-medium">Notas:</span> {investment.notes}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal para Cuenta Principal */}
      {showAccountModal && (
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center" 
          style={{ zIndex: 10000 }}
          onClick={() => { setShowAccountModal(false); resetAccountForm(); }}
        >
          <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}
            </h2>
              <button
                onClick={() => { setShowAccountModal(false); resetAccountForm(); }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                <input
                  type="text"
                  className="input-field"
                  value={accountFormData.name}
                  onChange={(e) => setAccountFormData({ ...accountFormData, name: e.target.value })}
                  placeholder="Ej: Santander, MyInvestor"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banco</label>
                <input
                  type="text"
                  className="input-field"
                  value={accountFormData.bankName}
                  onChange={(e) => setAccountFormData({ ...accountFormData, bankName: e.target.value })}
                  placeholder="Nombre del banco"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número de Cuenta</label>
                <input
                  type="text"
                  className="input-field"
                  value={accountFormData.accountNumber}
                  onChange={(e) => setAccountFormData({ ...accountFormData, accountNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                <select
                  className="input-field"
                  value={accountFormData.currency}
                  onChange={(e) => setAccountFormData({ ...accountFormData, currency: e.target.value })}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={accountFormData.description}
                  onChange={(e) => setAccountFormData({ ...accountFormData, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color del Banco</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    value={accountFormData.color}
                    onChange={(e) => setAccountFormData({ ...accountFormData, color: e.target.value })}
                  />
                  <input
                    type="text"
                    className="input-field flex-1"
                    value={accountFormData.color}
                    onChange={(e) => setAccountFormData({ ...accountFormData, color: e.target.value })}
                    placeholder="#3b82f6"
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Este color se usará en las gráficas para identificar el banco
                </p>
              </div>
              {!editingAccount && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Balance Inicial (Opcional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={accountFormData.initialBalance}
                    onChange={(e) => setAccountFormData({ ...accountFormData, initialBalance: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Se creará automáticamente una subcuenta de tipo "Efectivo" con este balance
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingAccount ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAccountModal(false); resetAccountForm(); }}
                  className="flex-1 btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Subcuenta */}
      {showSubAccountModal && (
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center" 
          style={{ zIndex: 10000 }}
          onClick={() => { setShowSubAccountModal(false); resetSubAccountForm(); }}
        >
          <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {editingSubAccount ? 'Editar Subcuenta' : 'Nueva Subcuenta'}
            </h2>
              <button
                onClick={() => { setShowSubAccountModal(false); resetSubAccountForm(); }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubAccountSubmit} className="space-y-4">
              {!editingSubAccount && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cuenta Principal</label>
                  <select
                    className="input-field"
                    value={selectedAccountId || ''}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    required
                  >
                    <option value="">Seleccionar cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.name} - {acc.bankName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                <input
                  type="text"
                  className="input-field"
                  value={subAccountFormData.name}
                  onChange={(e) => setSubAccountFormData({ ...subAccountFormData, name: e.target.value })}
                  placeholder="Ej: Cuenta Corriente, Inversión"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <select
                  className="input-field"
                  value={subAccountFormData.type}
                  onChange={(e) => setSubAccountFormData({ ...subAccountFormData, type: e.target.value })}
                  required
                >
                  <option value="cash">Efectivo</option>
                  <option value="investment">Inversión</option>
                  <option value="savings">Ahorro</option>
                  <option value="credit">Crédito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Balance</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={subAccountFormData.balance}
                  onChange={(e) => setSubAccountFormData({ ...subAccountFormData, balance: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                <select
                  className="input-field"
                  value={subAccountFormData.currency}
                  onChange={(e) => setSubAccountFormData({ ...subAccountFormData, currency: e.target.value })}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={subAccountFormData.description}
                  onChange={(e) => setSubAccountFormData({ ...subAccountFormData, description: e.target.value })}
                />
              </div>
              {(subAccountFormData.type === 'cash' || subAccountFormData.type === 'savings') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha de Creación del Efectivo
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={subAccountFormData.initialDate}
                    onChange={(e) => setSubAccountFormData({ ...subAccountFormData, initialDate: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Fecha en la que se creó esta subcuenta o se añadió este efectivo. Se usará para calcular el balance histórico.
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingSubAccount ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSubAccountModal(false); resetSubAccountForm(); }}
                  className="flex-1 btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de detalles de inversión */}
      {showDetailModal && detailInvestment && (
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          style={{ zIndex: 10000 }}
          onClick={() => {
            setShowDetailModal(false);
            setDetailInvestment(null);
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
                  {detailInvestment.name}
                </h2>
                {detailInvestment.symbol && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{detailInvestment.symbol}</p>
                )}
                {detailInvestment.isin && !detailInvestment.symbol && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ISIN: {detailInvestment.isin}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setDetailInvestment(null);
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
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{getTypeLabel(detailInvestment.type, detailInvestment.isAutomatedPortfolio)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Moneda:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{detailInvestment.currency}</span>
                    </div>
                    {(detailInvestment.account || detailInvestment.subAccount) && (
                      <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-400">Cuenta:</span>
                        <div className="mt-1">
                          {detailInvestment.account && (
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {detailInvestment.account.name || detailInvestment.account.bankName || 'N/A'}
                            </span>
                          )}
                          {detailInvestment.subAccount && (
                            <span className="ml-2 text-gray-600 dark:text-gray-400">
                              → {detailInvestment.subAccount.name}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {detailInvestment.assetClass && (
                      <div className="col-span-2">
                        <span className="text-gray-600 dark:text-gray-400">Clase de Activo:</span>
                        <div className="mt-1">
                          {detailInvestment.assetClass === 'fixed_income' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                              Renta Fija (100%)
                            </span>
                          )}
                          {detailInvestment.assetClass === 'variable_income' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                              Renta Variable (100%)
                            </span>
                          )}
                          {detailInvestment.assetClass === 'mixed' && (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                Mixto
                              </span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                RF: {detailInvestment.fixedIncomePercentage || 0}% | RV: {detailInvestment.variableIncomePercentage || 0}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {detailInvestment.isAutomatedPortfolio && (
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
                    {detailInvestment.isAutomatedPortfolio ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Monto invertido:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: detailInvestment.currency }).format(detailInvestment.quantity)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Valor actual:</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {formatPrice(detailInvestment.currentPrice, detailInvestment.currency)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Cantidad:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{detailInvestment.quantity} unidades</span>
                        </div>
                        {detailInvestment.averagePurchasePrice && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Precio medio compra:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(detailInvestment.averagePurchasePrice, detailInvestment.currency)}
                            </span>
                          </div>
                        )}
                        {detailInvestment.purchasePrice && !detailInvestment.averagePurchasePrice && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Precio de compra:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(detailInvestment.purchasePrice, detailInvestment.currency)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Precio actual:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatPrice(detailInvestment.currentPrice, detailInvestment.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-gray-600 dark:text-gray-400">Valor total:</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: detailInvestment.currency }).format(
                              detailInvestment.quantity * detailInvestment.currentPrice
                            )}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-600 dark:text-gray-400">Ganancia/Pérdida:</span>
                      <span className={`font-bold flex items-center ${
                        calculateProfitLoss(detailInvestment) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {calculateProfitLoss(detailInvestment) >= 0 ? (
                          <CgTrending className="h-4 w-4 mr-1" />
                        ) : (
                          <CgTrendingDown className="h-4 w-4 mr-1" />
                        )}
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: detailInvestment.currency }).format(calculateProfitLoss(detailInvestment))}
                        <span className="ml-2">({calculateProfitLossPercentage(detailInvestment).toFixed(2)}%)</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Fechas */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Fechas</h3>
                  <div className="space-y-2 text-sm">
                    {detailInvestment.purchaseDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Fecha de compra:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(detailInvestment.purchaseDate).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    )}
                    {detailInvestment.createdAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Fecha de creación:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(detailInvestment.createdAt).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    )}
                    {detailInvestment.updatedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Última actualización:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(detailInvestment.updatedAt).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Configuración - Solo mostrar si se puede activar/desactivar actualización automática */}
                {(detailInvestment.symbol || detailInvestment.isin) && !detailInvestment.isAutomatedPortfolio && (
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Configuración</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Actualización automática:</span>
                        <span className={`font-medium ${
                          detailInvestment.autoUpdate !== false ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {detailInvestment.autoUpdate !== false ? 'Activada' : 'Desactivada'}
                        </span>
                      </div>
                      {detailInvestment.platformUrl && (
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Plataforma:</span>
                          <a
                            href={detailInvestment.platformUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {detailInvestment.platformUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notas */}
                {detailInvestment.notes && (
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Notas</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{detailInvestment.notes}</p>
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
                                currency: detailInvestment.currency,
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
                                currency: detailInvestment.currency 
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
                                currency: detailInvestment.currency,
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
                                currency: detailInvestment.currency 
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
                  setShowDetailModal(false);
                  setDetailInvestment(null);
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

export default Accounts;
