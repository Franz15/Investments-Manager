import { useEffect, useState } from 'react';
import { Plus, Wallet, Edit, Trash2, ChevronDown, ChevronRight, CreditCard, TrendingUp, PiggyBank } from 'lucide-react';
import api from '../services/api';

// Función helper para formatear precios
// isAutomatedPortfolio: true = 2 decimales (valores totales), false = 4 decimales (precios unitarios)
const formatPrice = (value, currency = 'EUR', isAutomatedPortfolio = false) => {
  if (value === null || value === undefined || isNaN(value)) {
    return isAutomatedPortfolio ? '0,00 €' : '0,0000 €';
  }
  const decimals = isAutomatedPortfolio ? 2 : 4;
  return new Intl.NumberFormat('es-ES', { 
    style: 'currency', 
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
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
  });

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
      setLoading(false);
    } catch (error) {
      console.error('Error cargando datos:', error);
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
    return subAccounts.filter(sub => sub.account?._id === accountId || sub.account === accountId);
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
      console.error('Error guardando cuenta:', error);
    }
  };

  const handleSubAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSubAccount) {
        await api.put(`/subaccounts/${editingSubAccount._id}`, subAccountFormData);
      } else {
        await api.post('/subaccounts', {
          ...subAccountFormData,
          account: selectedAccountId,
        });
      }
      fetchData();
      setShowSubAccountModal(false);
      resetSubAccountForm();
    } catch (error) {
      console.error('Error guardando subcuenta:', error);
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
    setSubAccountFormData({
      name: subAccount.name,
      type: subAccount.type,
      balance: subAccount.balance,
      currency: subAccount.currency,
      description: subAccount.description || '',
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
        console.error('Error eliminando cuenta:', error);
      }
    }
  };

  const handleDeleteSubAccount = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta subcuenta?')) {
      try {
        await api.delete(`/subaccounts/${id}`);
        fetchData();
      } catch (error) {
        console.error('Error eliminando subcuenta:', error);
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
    });
    setEditingSubAccount(null);
    setSelectedAccountId(null);
  };

  const getSubAccountTypeIcon = (type) => {
    switch (type) {
      case 'cash':
        return <Wallet className="h-4 w-4" />;
      case 'investment':
        return <TrendingUp className="h-4 w-4" />;
      case 'savings':
        return <PiggyBank className="h-4 w-4" />;
      case 'credit':
        return <CreditCard className="h-4 w-4" />;
      default:
        return <Wallet className="h-4 w-4" />;
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

  if (loading) {
    return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Cuentas</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Gestiona tus cuentas bancarias y subcuentas</p>
        </div>
        <button onClick={() => { resetAccountForm(); setShowAccountModal(true); }} className="btn-primary flex items-center">
          <Plus className="h-5 w-5 mr-2" />
          Nueva Cuenta
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
                      <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>
                  <div className="p-2 bg-primary-100 dark:bg-primary-900 rounded-lg">
                    <Wallet className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{account.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{account.bankName}</p>
                  </div>
                  <div className="text-right mr-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: account.currency }).format(totalBalance)}
                    </p>
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
                    <Plus className="h-4 w-4 mr-1" />
                    Subcuenta
                  </button>
                  <button
                    onClick={() => handleEditAccount(account)}
                    className="px-3 py-2 btn-secondary"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(account._id)}
                    className="px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  {accountSubAccounts.length === 0 && getInvestmentsForAccount(account._id).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No hay subcuentas ni inversiones. Crea una para empezar.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {/* Mostrar inversiones directas al mismo nivel que las subcuentas */}
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
                          <div key={investment._id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center flex-1">
                                <button
                                  onClick={() => toggleSubAccount(`investment-${investment._id}`)}
                                  className="mr-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                >
                                  {isInvestmentExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                  )}
                                </button>
                                <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-lg mr-3">
                                  <TrendingUp className="h-4 w-4 text-blue-700 dark:text-blue-300" />
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
                                <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
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
                                          <p><span className="font-medium">Precio medio:</span> {formatPrice(investment.averagePurchasePrice, investment.currency, investment.isAutomatedPortfolio)}</p>
                                        )}
                                      </>
                                    )}
                                    <p><span className="font-medium">Precio actual:</span> {formatPrice(investment.currentPrice, investment.currency, investment.isAutomatedPortfolio)}</p>
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
                      
                      {/* Mostrar subcuentas */}
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
                          <div key={subAccount._id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center flex-1">
                                {subAccount.type === 'investment' && subAccountInvestments.length > 0 && (
                                  <button
                                    onClick={() => toggleSubAccount(subAccount._id)}
                                    className="mr-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                  >
                                    {isSubAccountExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                    )}
                                  </button>
                                )}
                                <div className="p-2 bg-gray-200 dark:bg-gray-600 rounded-lg mr-3">
                                  {getSubAccountTypeIcon(subAccount.type)}
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
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Disponible: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: subAccount.currency }).format(subAccount.balance)}
                                      </p>
                                      {investmentsValue > 0 && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          Inversiones: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: subAccount.currency }).format(investmentsValue)}
                                        </p>
                                      )}
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
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSubAccount(subAccount._id)}
                                  className="px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            
                            {/* Mostrar inversiones si es subcuenta de inversión y está expandida */}
                            {subAccount.type === 'investment' && isSubAccountExpanded && subAccountInvestments.length > 0 && (
                              <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-600">
                                <div className="mt-2 space-y-2">
                                  {subAccountInvestments.map((investment) => {
                                    const investmentValue = investment.isAutomatedPortfolio 
                                      ? investment.currentPrice 
                                      : investment.quantity * investment.currentPrice;
                                    const profitLoss = investment.isAutomatedPortfolio
                                      ? investment.currentPrice - investment.quantity
                                      : (investment.currentPrice - (investment.averagePurchasePrice || investment.purchasePrice)) * investment.quantity;
                                    const profitLossPercent = investment.isAutomatedPortfolio
                                      ? ((investment.currentPrice - investment.quantity) / investment.quantity) * 100
                                      : ((investment.currentPrice - (investment.averagePurchasePrice || investment.purchasePrice)) / (investment.averagePurchasePrice || investment.purchasePrice)) * 100;

                                    return (
                                      <div
                                        key={investment._id}
                                        className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1">
                                            <p className="font-medium text-gray-900 dark:text-gray-100">{investment.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                              {investment.symbol && `${investment.symbol} • `}
                                              {investment.isAutomatedPortfolio ? 'Cartera Automatizada' : `${investment.quantity} unidades`}
                                            </p>
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
                                    );
                                  })}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}
            </h2>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingSubAccount ? 'Editar Subcuenta' : 'Nueva Subcuenta'}
            </h2>
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
    </div>
  );
};

export default Accounts;
