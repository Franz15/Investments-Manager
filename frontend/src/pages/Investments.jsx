import { useEffect, useState, useRef } from 'react';
import { Plus, TrendingUp, TrendingDown, Edit, Trash2, History, RefreshCw, PlusCircle, DollarSign } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../services/api';

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

const Investments = () => {
  const [investments, setInvestments] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [investmentToDelete, setInvestmentToDelete] = useState(null);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [investmentHistory, setInvestmentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState(null);
  const [updateFormData, setUpdateFormData] = useState({
    currentPrice: 0,
    quantity: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [addFormData, setAddFormData] = useState({
    quantity: 0,
    price: 0,
    currentPrice: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [formData, setFormData] = useState({
    account: '',
    subAccount: '',
    name: '',
    type: 'stock',
    symbol: '',
    isin: '',
    isAutomatedPortfolio: false,
    quantity: 0,
    purchasePrice: 0,
    currentPrice: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
    currency: 'EUR',
    assetClass: 'variable_income',
    fixedIncomePercentage: 0,
    variableIncomePercentage: 100,
    notes: '',
    platformUrl: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  // Actualización automática de precios cada 5 minutos
  const updatingPricesRef = useRef(updatingPrices);
  updatingPricesRef.current = updatingPrices;

  useEffect(() => {
    // Yahoo Finance permite ~33 llamadas/minuto, así que actualizamos cada 5 min para no saturar
    const autoUpdateInterval = setInterval(() => {
      // Solo actualizar si no hay una actualización manual en curso
      if (!updatingPricesRef.current) {
        handleUpdateAllPrices(true); // true = actualización automática (silenciosa)
      }
    }, 5 * 60 * 1000); // 5 minutos

    // Limpiar el intervalo al desmontar el componente
    return () => clearInterval(autoUpdateInterval);
  }, []); // Sin dependencias para que solo se cree una vez

  const fetchData = async () => {
    try {
      const [investmentsRes, subAccountsRes, accountsRes] = await Promise.all([
        api.get('/investments'),
        api.get('/subaccounts'),
        api.get('/accounts'),
      ]);
      setInvestments(investmentsRes.data);
      setSubAccounts(subAccountsRes.data.filter(sub => sub.type === 'investment'));
      setAccounts(accountsRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Validar que account esté presente (siempre obligatorio)
      if (!formData.account) {
        alert('Debes seleccionar una cuenta');
        return;
      }
      
      // Preparar datos para enviar
      const dataToSend = { ...formData };
      // Si es cartera automatizada, no enviar purchasePrice
      if (dataToSend.isAutomatedPortfolio) {
        delete dataToSend.purchasePrice;
      }
      // Limpiar subAccount si está vacío
      if (!dataToSend.subAccount) {
        delete dataToSend.subAccount;
      }
      
      if (editingInvestment) {
        await api.put(`/investments/${editingInvestment._id}`, dataToSend);
      } else {
        await api.post('/investments', dataToSend);
      }
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Error guardando inversión:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error al guardar la inversión';
      alert(errorMessage);
    }
  };

  const handleEdit = (investment) => {
    setEditingInvestment(investment);
    setFormData({
      account: investment.account?._id || investment.account || '',
      subAccount: investment.subAccount?._id || investment.subAccount || '',
      name: investment.name,
      type: investment.type,
      symbol: investment.symbol || '',
      isin: investment.isin || '',
      isAutomatedPortfolio: investment.isAutomatedPortfolio || false,
      quantity: investment.quantity,
      purchasePrice: investment.purchasePrice || 0,
      currentPrice: investment.currentPrice,
      purchaseDate: new Date(investment.purchaseDate).toISOString().split('T')[0],
      currency: investment.currency,
      assetClass: investment.assetClass || 'variable_income',
      fixedIncomePercentage: investment.fixedIncomePercentage || 0,
      variableIncomePercentage: investment.variableIncomePercentage || 100,
      notes: investment.notes || '',
      platformUrl: investment.platformUrl || '',
    });
    setShowModal(true);
  };

  const handleDeleteClick = (investment) => {
    setInvestmentToDelete(investment);
    setShowDeleteModal(true);
  };

  const handleDelete = async (returnMoney = false) => {
    if (!investmentToDelete) return;
    
    try {
      const url = returnMoney 
        ? `/investments/${investmentToDelete._id}?returnMoney=true`
        : `/investments/${investmentToDelete._id}`;
      
      await api.delete(url);
      fetchData();
      setShowDeleteModal(false);
      setInvestmentToDelete(null);
    } catch (error) {
      console.error('Error eliminando inversión:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error al eliminar la inversión';
      alert(errorMessage);
    }
  };

  const handleUpdateValue = (investment) => {
    setSelectedInvestment(investment);
    setUpdateFormData({
      currentPrice: investment.currentPrice,
      quantity: investment.quantity,
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowUpdateModal(true);
  };

  const handleSubmitUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/investment-history', {
        investmentId: selectedInvestment._id,
        currentPrice: parseFloat(updateFormData.currentPrice),
        quantity: parseFloat(updateFormData.quantity),
        date: updateFormData.date,
        notes: updateFormData.notes,
      });
      fetchData();
      setShowUpdateModal(false);
      setUpdateFormData({
        currentPrice: 0,
        quantity: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (error) {
      console.error('Error actualizando inversión:', error);
    }
  };

  const handleViewHistory = async (investment) => {
    setSelectedInvestment(investment);
    setHistoryLoading(true);
    setShowHistoryModal(true);
    try {
      const response = await api.get(`/investment-history/investment/${investment._id}`);
      setInvestmentHistory(response.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddToInvestment = (investment) => {
    setSelectedInvestment(investment);
    setAddFormData({
      quantity: 0,
      price: investment.currentPrice,
      currentPrice: investment.currentPrice,
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowAddModal(true);
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/investments/${selectedInvestment._id}/add`, {
        quantity: parseFloat(addFormData.quantity),
        price: parseFloat(addFormData.price),
        currentPrice: parseFloat(addFormData.currentPrice),
        date: addFormData.date,
        notes: addFormData.notes,
      });
      fetchData();
      setShowAddModal(false);
      setAddFormData({
        quantity: 0,
        price: 0,
        currentPrice: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (error) {
      console.error('Error añadiendo a inversión:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error al añadir a la inversión';
      alert(errorMessage);
    }
  };

  const resetForm = () => {
    setFormData({
      account: '',
      subAccount: '',
      name: '',
      type: 'stock',
      symbol: '',
      isin: '',
      isAutomatedPortfolio: false,
      quantity: 0,
      purchasePrice: 0,
      currentPrice: 0,
      purchaseDate: new Date().toISOString().split('T')[0],
      currency: 'EUR',
      assetClass: 'variable_income',
      fixedIncomePercentage: 0,
      variableIncomePercentage: 100,
      notes: '',
      platformUrl: '',
    });
    setEditingInvestment(null);
  };

  const getTypeLabel = (type) => {
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

  const calculateProfitLoss = (investment) => {
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas: valor actual - monto invertido
      return investment.currentPrice - investment.quantity;
    }
    // Para inversiones tradicionales: (precio actual - precio medio compra) * cantidad
    const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
    return (investment.currentPrice - avgPrice) * investment.quantity;
  };

  const calculateProfitLossPercentage = (investment) => {
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas: (valor actual - monto invertido) / monto invertido * 100
      if (investment.quantity === 0) return 0;
      return ((investment.currentPrice - investment.quantity) / investment.quantity) * 100;
    }
    // Para inversiones tradicionales: usar precio medio
    const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
    if (!avgPrice || avgPrice === 0) return 0;
    return ((investment.currentPrice - avgPrice) / avgPrice) * 100;
  };

  const handleUpdateAllPrices = async (isAutoUpdate = false) => {
    setUpdatingPrices(true);
    try {
      const response = await api.post('/investments/update-prices');
      const { updated, failed, results } = response.data;
      
      if (updated > 0) {
        // Recargar los datos
        await fetchData();
        
        // Solo mostrar mensaje si hay errores y no es actualización automática
        if (failed > 0 && !isAutoUpdate) {
          const failedSymbols = results
            .filter(r => !r.success)
            .map(r => {
              const inv = investments.find(i => (i._id?.toString() || i.id) === r.investmentId);
              return inv?.symbol || inv?.name || 'Desconocido';
            });
          alert(`Precios actualizados: ${updated} exitosos, ${failed} fallidos.\n\nFallidos: ${failedSymbols.join(', ')}`);
        } else if (failed > 0 && isAutoUpdate) {
          // Para actualizaciones automáticas, solo log en consola
          const failedSymbols = results
            .filter(r => !r.success)
            .map(r => {
              const inv = investments.find(i => (i._id?.toString() || i.id) === r.investmentId);
              return inv?.symbol || inv?.name || 'Desconocido';
            });
          // Log silencioso para actualizaciones automáticas
        }
        // Si todo salió bien, no mostrar popup
      } else if (!isAutoUpdate) {
        alert('No se pudieron actualizar los precios. Verifica que las inversiones tengan símbolos válidos.');
      }
    } catch (error) {
      console.error('Error actualizando precios:', error);
      // Solo mostrar alerta si es actualización manual
      if (!isAutoUpdate) {
        const errorMessage = error.response?.data?.message || error.message || 'Error al actualizar precios';
        alert(`Error: ${errorMessage}`);
      }
    } finally {
      setUpdatingPrices(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Inversiones</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Gestiona tu cartera de inversiones</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => handleUpdateAllPrices(false)} 
            disabled={updatingPrices}
            className="btn-secondary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            title="Actualizar precios desde APIs en tiempo real (también se actualizan automáticamente cada 5 minutos)"
          >
            <DollarSign className={`h-5 w-5 mr-2 ${updatingPrices ? 'animate-spin' : ''}`} />
            {updatingPrices ? 'Actualizando...' : 'Actualizar Precios'}
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Nueva Inversión
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {investments.map((investment) => {
          const profitLoss = calculateProfitLoss(investment);
          const profitLossPercent = calculateProfitLossPercentage(investment);
          const totalValue = investment.isAutomatedPortfolio 
            ? investment.currentPrice 
            : investment.quantity * investment.currentPrice;

          return (
            <div key={investment._id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{investment.name}</h3>
                    {investment.isAutomatedPortfolio && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                        Automatizada
                      </span>
                    )}
                  </div>
                  {investment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{investment.symbol}</p>
                  )}
                  {investment.isin && !investment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">ISIN: {investment.isin}</p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{getTypeLabel(investment.type)}</p>
                  {investment.assetClass && (
                    <div className="mt-2">
                      {investment.assetClass === 'fixed_income' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                          Renta Fija
                        </span>
                      )}
                      {investment.assetClass === 'variable_income' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                          Renta Variable
                        </span>
                      )}
                      {investment.assetClass === 'mixed' && (
                        <div className="flex flex-col gap-1 mt-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                            Mixto
                          </span>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            RF: {investment.fixedIncomePercentage || 0}% | RV: {investment.variableIncomePercentage || 0}%
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Checkbox para actualización automática - solo si tiene símbolo o ISIN */}
                  {(investment.symbol || investment.isin) && !investment.isAutomatedPortfolio && (
                    <div 
                      className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 relative z-10"
                    >
                      <input
                        type="checkbox"
                        id={`auto-update-${investment._id}`}
                        checked={investment.autoUpdate !== false}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          try {
                            await api.patch(`/investments/${investment._id}/auto-update`, {
                              autoUpdate: newValue
                            });
                            // Actualizar el estado local
                            setInvestments(prev => prev.map(inv => 
                              inv._id === investment._id 
                                ? { ...inv, autoUpdate: newValue }
                                : inv
                            ));
                          } catch (error) {
                            console.error('Error actualizando autoUpdate:', error);
                            alert('Error al actualizar la configuración de actualización automática');
                            // Revertir el cambio en caso de error
                            e.target.checked = !newValue;
                          }
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer relative z-20"
                      />
                      <label 
                        htmlFor={`auto-update-${investment._id}`}
                        className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer relative z-20"
                      >
                        Actualización automática
                      </label>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-2 mb-4">
                {investment.isAutomatedPortfolio ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Monto invertido:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: investment.currency }).format(investment.quantity)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Valor actual:</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatPrice(investment.currentPrice, investment.currency)}
                      </span>
                    </div>
                    {investment.platformUrl && (
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <a
                          href={investment.platformUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center"
                        >
                          Ver en plataforma ↗
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Cantidad:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{investment.quantity}</span>
                    </div>
                    {investment.averagePurchasePrice && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Precio medio compra:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {formatPrice(investment.averagePurchasePrice, investment.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Precio actual:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatPrice(investment.currentPrice, investment.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Valor total:</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: investment.currency }).format(totalValue)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Ganancia/Pérdida:</span>
                  <span className={`text-sm font-bold flex items-center ${
                    profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {profitLoss >= 0 ? (
                      <TrendingUp className="h-4 w-4 mr-1" />
                    ) : (
                      <TrendingDown className="h-4 w-4 mr-1" />
                    )}
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: investment.currency }).format(profitLoss)}
                    <span className="ml-2">({profitLossPercent.toFixed(2)}%)</span>
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {!investment.isAutomatedPortfolio && (
                  <button
                    onClick={() => handleAddToInvestment(investment)}
                    className="px-4 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                    title="Añadir a inversión"
                  >
                    <PlusCircle className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleUpdateValue(investment)}
                  className={`flex-1 btn-secondary flex items-center justify-center text-sm ${investment.isAutomatedPortfolio ? 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50' : ''}`}
                  title={investment.isAutomatedPortfolio ? "Actualizar valor desde la plataforma" : "Actualizar valor"}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {investment.isAutomatedPortfolio ? 'Actualizar Valor' : 'Actualizar'}
                </button>
                <button
                  onClick={() => handleViewHistory(investment)}
                  className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  title="Ver historial"
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleEdit(investment)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="Editar"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteClick(investment)}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {investments.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No hay inversiones registradas
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingInvestment ? 'Editar Inversión' : 'Nueva Inversión'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cuenta <span className="text-red-500">*</span>
                </label>
                <select
                  className="input-field"
                  value={formData.account}
                  onChange={(e) => {
                    const newAccount = e.target.value;
                    setFormData({ 
                      ...formData, 
                      account: newAccount,
                      subAccount: '', // Limpiar subcuenta al cambiar de cuenta
                      currency: newAccount ? accounts.find(a => a._id === newAccount)?.currency || 'EUR' : formData.currency
                    });
                  }}
                  required
                >
                  <option value="">Seleccionar cuenta</option>
                  {accounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.bankName} - {account.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcuenta de Inversión (opcional)
                </label>
                {!formData.account ? (
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Selecciona primero una cuenta para ver sus subcuentas de inversión
                    </p>
                  </div>
                ) : (() => {
                  const accountSubAccounts = subAccounts.filter(sa => 
                    sa.account?._id === formData.account || sa.account === formData.account
                  );
                  
                  if (accountSubAccounts.length === 0) {
                    return (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          No hay subcuentas de tipo "Inversión" disponibles para esta cuenta. 
                          Puedes crear una desde la página de Cuentas o dejar este campo vacío.
                        </p>
                      </div>
                    );
                  }
                  
                  return (
                    <select
                      className="input-field"
                      value={formData.subAccount}
                      onChange={(e) => {
                        const newSubAccount = e.target.value;
                        setFormData({ 
                          ...formData, 
                          subAccount: newSubAccount,
                          currency: newSubAccount ? subAccounts.find(sa => sa._id === newSubAccount)?.currency || formData.currency : formData.currency
                        });
                      }}
                    >
                      <option value="">Ninguna (inversión directa en la cuenta)</option>
                      {accountSubAccounts.map((subAccount) => (
                        <option key={subAccount._id} value={subAccount._id}>
                          {subAccount.name}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <select
                  className="input-field"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                >
                  <option value="stock">Acción</option>
                  <option value="bond">Bono</option>
                  <option value="crypto">Cripto</option>
                  <option value="fund">Fondo</option>
                  <option value="etf">ETF</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Símbolo</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  placeholder="Ej: AAPL, BTC, NXT.MC"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ticker o símbolo de la inversión
                </p>
              </div>
              {(formData.type === 'fund' || formData.type === 'bond') && !formData.isAutomatedPortfolio && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ISIN <span className="text-gray-400">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.isin}
                    onChange={(e) => setFormData({ ...formData, isin: e.target.value.toUpperCase().replace(/\s/g, '') })}
                    placeholder="Ej: ES0123456789"
                    maxLength={12}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Código ISIN para fondos de inversión y bonos (12 caracteres). Si no tienes símbolo, el sistema intentará buscar por ISIN o nombre.
                    <br />
                    <span className="text-amber-600 dark:text-amber-400">Nota: Las carteras automatizadas no tienen ISIN.</span>
                  </p>
                </div>
              )}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isAutomatedPortfolio"
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  checked={formData.isAutomatedPortfolio}
                  onChange={(e) => {
                    const isAutomated = e.target.checked;
                    setFormData({ 
                      ...formData, 
                      isAutomatedPortfolio: isAutomated,
                      purchasePrice: isAutomated ? 0 : formData.purchasePrice
                    });
                  }}
                />
                <label htmlFor="isAutomatedPortfolio" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cartera Automatizada (sin precio de compra unitario)
                </label>
              </div>
              {formData.isAutomatedPortfolio && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL de la Plataforma (opcional)
                  </label>
                  <input
                    type="url"
                    className="input-field"
                    value={formData.platformUrl}
                    onChange={(e) => setFormData({ ...formData, platformUrl: e.target.value })}
                    placeholder="Ej: https://myinvestor.es o https://indexacapital.com"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Enlace a la plataforma para consultar el valor actual
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {formData.isAutomatedPortfolio ? 'Monto Invertido' : 'Cantidad'}
                  </label>
                  <input
                    type="number"
                    step={formData.isAutomatedPortfolio ? "0.01" : "0.0001"}
                    className="input-field"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                  <select
                    className="input-field"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
               {!formData.isAutomatedPortfolio && (
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio Compra</label>
                     <input
                       type="number"
                       step="0.0001"
                       className="input-field"
                       value={formData.purchasePrice}
                       onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) })}
                       required
                     />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio Actual</label>
                     <input
                       type="number"
                       step="0.0001"
                       className="input-field"
                       value={formData.currentPrice}
                       onChange={(e) => setFormData({ ...formData, currentPrice: parseFloat(e.target.value) })}
                       required
                     />
                   </div>
                 </div>
               )}
               {formData.isAutomatedPortfolio && (
                 <div>
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Actual</label>
                   <input
                     type="number"
                     step="0.01"
                     className="input-field"
                     value={formData.currentPrice}
                     onChange={(e) => setFormData({ ...formData, currentPrice: parseFloat(e.target.value) })}
                     required
                   />
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                     Valor total actual de la cartera automatizada
                   </p>
                 </div>
               )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de Compra</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clase de Activo</label>
                <select
                  className="input-field"
                  value={formData.assetClass}
                  onChange={(e) => {
                    const newAssetClass = e.target.value;
                    if (newAssetClass === 'fixed_income') {
                      setFormData({ ...formData, assetClass: newAssetClass, fixedIncomePercentage: 100, variableIncomePercentage: 0 });
                    } else if (newAssetClass === 'variable_income') {
                      setFormData({ ...formData, assetClass: newAssetClass, fixedIncomePercentage: 0, variableIncomePercentage: 100 });
                    } else {
                      setFormData({ ...formData, assetClass: newAssetClass });
                    }
                  }}
                  required
                >
                  <option value="fixed_income">Renta Fija</option>
                  <option value="variable_income">Renta Variable</option>
                  <option value="mixed">Mixto</option>
                </select>
              </div>
              {formData.assetClass === 'mixed' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      % Renta Fija
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className="input-field"
                      value={formData.fixedIncomePercentage}
                      onChange={(e) => {
                        const fixed = parseFloat(e.target.value) || 0;
                        const variable = 100 - fixed;
                        setFormData({ ...formData, fixedIncomePercentage: fixed, variableIncomePercentage: variable });
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      % Renta Variable
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className="input-field"
                      value={formData.variableIncomePercentage}
                      onChange={(e) => {
                        const variable = parseFloat(e.target.value) || 0;
                        const fixed = 100 - variable;
                        setFormData({ ...formData, variableIncomePercentage: variable, fixedIncomePercentage: fixed });
                      }}
                      required
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingInvestment ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para actualizar valor */}
      {showUpdateModal && selectedInvestment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Actualizar Valor - {selectedInvestment.name}
            </h2>
            {selectedInvestment.isAutomatedPortfolio && selectedInvestment.platformUrl && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong>💡 Tip:</strong> Consulta el valor actual en la plataforma:
                </p>
                <a
                  href={selectedInvestment.platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                >
                  {selectedInvestment.platformUrl} ↗
                </a>
              </div>
            )}
            <form onSubmit={handleSubmitUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                <input
                  type="date"
                  className="input-field"
                  value={updateFormData.date}
                  onChange={(e) => setUpdateFormData({ ...updateFormData, date: e.target.value })}
                  required
                />
              </div>
              {selectedInvestment.isAutomatedPortfolio ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Valor Actual Total de la Cartera
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={updateFormData.currentPrice}
                      onChange={(e) => setUpdateFormData({ ...updateFormData, currentPrice: parseFloat(e.target.value) })}
                      required
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Ingresa el valor total actual que ves en la plataforma (ej: MyInvestor, Indexa Capital, etc.)
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Monto invertido:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(selectedInvestment.quantity)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Ganancia/Pérdida:</span>
                      <span className={`font-medium ${(updateFormData.currentPrice - selectedInvestment.quantity) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatPrice(updateFormData.currentPrice - selectedInvestment.quantity, selectedInvestment.currency)}
                        {' '}
                        ({((updateFormData.currentPrice - selectedInvestment.quantity) / selectedInvestment.quantity * 100).toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad</label>
                    <input
                      type="number"
                      step="0.0001"
                      className="input-field"
                      value={updateFormData.quantity}
                      onChange={(e) => setUpdateFormData({ ...updateFormData, quantity: parseFloat(e.target.value) })}
                      required
                    />
                  </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio Actual</label>
                     <input
                       type="number"
                       step="0.0001"
                       className="input-field"
                       value={updateFormData.currentPrice}
                       onChange={(e) => setUpdateFormData({ ...updateFormData, currentPrice: parseFloat(e.target.value) })}
                       required
                     />
                   </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (opcional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={updateFormData.notes}
                  onChange={(e) => setUpdateFormData({ ...updateFormData, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  Guardar Actualización
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para ver historial */}
      {showHistoryModal && selectedInvestment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Historial - {selectedInvestment.name}
              </h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            
            {historyLoading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Cargando...</div>
            ) : investmentHistory.length > 0 ? (
              <>
                <div className="mb-6" style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={investmentHistory.map(h => ({
                      date: new Date(h.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                      value: h.totalValue,
                      price: h.currentPrice,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                      <XAxis dataKey="date" stroke="#6b7280" className="dark:stroke-gray-400" />
                      <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                      <Tooltip 
                        formatter={(value, name) => {
                          if (name === 'Precio Unitario' || name === 'price') {
                            return formatPrice(value, selectedInvestment.currency);
                          }
                          return new Intl.NumberFormat('es-ES', { 
                            style: 'currency', 
                            currency: selectedInvestment.currency 
                          }).format(value);
                        }} 
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#0ea5e9" 
                        name="Valor Total"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 text-gray-700 dark:text-gray-300">Fecha</th>
                        {!selectedInvestment.isAutomatedPortfolio && (
                          <th className="text-right py-2 text-gray-700 dark:text-gray-300">Cantidad</th>
                        )}
                        <th className="text-right py-2 text-gray-700 dark:text-gray-300">
                          {selectedInvestment.isAutomatedPortfolio ? 'Valor Total' : 'Precio Unitario'}
                        </th>
                        <th className="text-right py-2 text-gray-700 dark:text-gray-300">Valor Total</th>
                        {investmentHistory.some(h => h.notes) && (
                          <th className="text-left py-2 text-gray-700 dark:text-gray-300">Notas</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {investmentHistory.map((entry) => (
                        <tr key={entry._id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 text-gray-600 dark:text-gray-400">
                            {new Date(entry.date).toLocaleDateString('es-ES', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </td>
                          {!selectedInvestment.isAutomatedPortfolio && (
                            <td className="text-right py-2 text-gray-600 dark:text-gray-400">
                              {entry.quantity}
                            </td>
                          )}
                          <td className="text-right py-2 text-gray-600 dark:text-gray-400">
                            {formatPrice(entry.currentPrice, selectedInvestment.currency)}
                          </td>
                          <td className="text-right py-2 font-semibold text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat('es-ES', { 
                              style: 'currency', 
                              currency: selectedInvestment.currency 
                            }).format(entry.totalValue)}
                          </td>
                          {investmentHistory.some(h => h.notes) && (
                            <td className="py-2 text-gray-500 dark:text-gray-400 text-sm">
                              {entry.notes || '-'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay historial registrado para esta inversión
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal para añadir a inversión */}
      {showAddModal && selectedInvestment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Añadir a Inversión - {selectedInvestment.name}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Al añadir más unidades, se calculará automáticamente el nuevo precio medio de compra.
            </p>
            {selectedInvestment.averagePurchasePrice && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">Precio medio actual:</span>{' '}
                  {formatPrice(selectedInvestment.averagePurchasePrice, selectedInvestment.currency)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Cantidad actual: {selectedInvestment.quantity} unidades
                </p>
              </div>
            )}
            <form onSubmit={handleSubmitAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                <input
                  type="date"
                  className="input-field"
                  value={addFormData.date}
                  onChange={(e) => setAddFormData({ ...addFormData, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad a añadir</label>
                <input
                  type="number"
                  step="0.0001"
                  className="input-field"
                  value={addFormData.quantity}
                  onChange={(e) => setAddFormData({ ...addFormData, quantity: parseFloat(e.target.value) })}
                  required
                  min="0.0001"
                />
              </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio de compra</label>
                 <input
                   type="number"
                   step="0.0001"
                   className="input-field"
                   value={addFormData.price}
                   onChange={(e) => setAddFormData({ ...addFormData, price: parseFloat(e.target.value) })}
                   required
                   min="0.0001"
                 />
                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                   Precio al que compras las nuevas unidades
                 </p>
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio actual (opcional)</label>
                 <input
                   type="number"
                   step="0.0001"
                   className="input-field"
                   value={addFormData.currentPrice}
                   onChange={(e) => setAddFormData({ ...addFormData, currentPrice: parseFloat(e.target.value) })}
                   min="0.0001"
                 />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Si no lo especificas, se mantendrá el precio actual de la inversión
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (opcional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={addFormData.notes}
                  onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
                />
              </div>
              {addFormData.quantity > 0 && addFormData.price > 0 && selectedInvestment.averagePurchasePrice && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nuevo precio medio calculado:</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatPrice(
                      ((selectedInvestment.quantity * selectedInvestment.averagePurchasePrice) + 
                       (addFormData.quantity * addFormData.price)) / 
                      (selectedInvestment.quantity + addFormData.quantity),
                      selectedInvestment.currency
                    )}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Nueva cantidad total: {selectedInvestment.quantity + addFormData.quantity} unidades
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  Añadir a Inversión
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteModal && investmentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Eliminar Inversión
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              ¿Qué deseas hacer con la inversión <strong className="text-gray-900 dark:text-gray-100">{investmentToDelete.name}</strong>?
            </p>
            
            {/* Calcular monto original invertido */}
            {(() => {
              let originalAmount = 0;
              if (investmentToDelete.isAutomatedPortfolio) {
                originalAmount = investmentToDelete.quantity;
              } else {
                const avgPrice = investmentToDelete.averagePurchasePrice || investmentToDelete.purchasePrice;
                originalAmount = investmentToDelete.quantity * avgPrice;
              }
              
              return (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Monto original invertido:
                  </p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {originalAmount.toFixed(2)} {investmentToDelete.currency}
                  </p>
                </div>
              );
            })()}
            
            <div className="space-y-3">
              <button
                onClick={() => handleDelete(false)}
                className="w-full px-4 py-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors font-medium"
              >
                Eliminar sin devolver dinero
              </button>
              <button
                onClick={() => handleDelete(true)}
                className="w-full px-4 py-3 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors font-medium"
              >
                Eliminar y devolver dinero a la subcuenta
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setInvestmentToDelete(null);
                }}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investments;

