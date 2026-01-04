import { useEffect, useState, useRef } from 'react';
import { Plus, TrendingUp, TrendingDown, Edit, Trash2, History, RefreshCw, PlusCircle, DollarSign, MinusCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
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
  const [showSellModal, setShowSellModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [investmentToDelete, setInvestmentToDelete] = useState(null);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [investmentHistory, setInvestmentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showEditHistoryModal, setShowEditHistoryModal] = useState(false);
  const [editingHistoryEntry, setEditingHistoryEntry] = useState(null);
  const [editHistoryFormData, setEditHistoryFormData] = useState({
    date: '',
    currentPrice: 0,
    quantity: 0,
    notes: '',
    operation: 'update',
    operationAmount: 0,
    operationPrice: 0,
  });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailInvestment, setDetailInvestment] = useState(null);
  const [detailInvestmentHistory, setDetailInvestmentHistory] = useState([]);
  const [detailDailyVariations, setDetailDailyVariations] = useState([]);
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
  const [sellFormData, setSellFormData] = useState({
    quantity: 0,
    price: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    returnToSubAccount: true,
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

  // Función para registrar valores diarios de todas las inversiones
  const registerDailyValues = async () => {
    try {
      const lastRegistration = localStorage.getItem('lastDailyValuesRegistration');
      const today = new Date().toDateString();
      
      // Solo registrar si no se ha registrado hoy
      if (lastRegistration !== today) {
        await api.post('/investment-history/register-daily-values');
        localStorage.setItem('lastDailyValuesRegistration', today);
      }
    } catch (error) {
      // No mostrar error al usuario, es silencioso
    }
  };

  useEffect(() => {
    fetchData();
    // Registrar valores diarios al cargar (solo una vez al día)
    registerDailyValues();
  }, []);

  // Bloquear scroll del body cuando cualquier modal esté abierto
  useEffect(() => {
    const isAnyModalOpen = showModal || showUpdateModal || showHistoryModal || 
                          showAddModal || showSellModal || showDeleteModal || 
                          showEditHistoryModal || showDetailModal;
    
    if (isAnyModalOpen) {
      // Guardar la posición actual del scroll
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      // Restaurar el scroll
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }

    return () => {
      // Limpiar estilos al desmontar
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
    };
  }, [showModal, showUpdateModal, showHistoryModal, showAddModal, showSellModal, showDeleteModal, showEditHistoryModal, showDetailModal]);

  // Actualización automática de precios cada 5 minutos
  const updatingPricesRef = useRef(updatingPrices);
  updatingPricesRef.current = updatingPrices;

  useEffect(() => {
    // Yahoo Finance permite ~33 llamadas/minuto, así que actualizamos cada 5 min para no saturar
    const autoUpdateInterval = setInterval(() => {
      // Solo actualizar si no hay una actualización manual en curso
      if (!updatingPricesRef.current) {
        handleUpdateAllPrices(true); // true = actualización automática (silenciosa)
        // Registrar valores diarios después de actualizar precios
        registerDailyValues();
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
        operation: 'update',
      });
      fetchData();
      setShowUpdateModal(false);
      setUpdateFormData({
        currentPrice: 0,
        quantity: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      // Registrar valores diarios después de actualizar manualmente
      registerDailyValues();
    } catch (error) {
    }
  };

  const handleViewHistory = async (investment) => {
    setSelectedInvestment(investment);
    setHistoryLoading(true);
    setShowHistoryModal(true);
    try {
      const response = await api.get(`/investment-history/investment/${investment._id}`);
      setInvestmentHistory(response.data || []);
    } catch (error) {
      alert('Error al cargar el historial: ' + (error.response?.data?.message || error.message));
      setInvestmentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleEditHistoryEntry = (entry) => {
    setEditingHistoryEntry(entry);
    setEditHistoryFormData({
      date: new Date(entry.date).toISOString().split('T')[0],
      currentPrice: entry.currentPrice,
      quantity: entry.quantity,
      notes: entry.notes || '',
      operation: entry.operation || 'update',
      operationAmount: entry.operationAmount || 0,
      operationPrice: entry.operationPrice || 0,
    });
    setShowEditHistoryModal(true);
  };

  const handleSubmitEditHistory = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/investment-history/${editingHistoryEntry._id}`, editHistoryFormData);
      // Recargar el historial
      const response = await api.get(`/investment-history/investment/${selectedInvestment._id}`);
      setInvestmentHistory(response.data);
      setShowEditHistoryModal(false);
      setEditingHistoryEntry(null);
    } catch (error) {
      alert('Error al editar la entrada del historial');
    }
  };

  const handleDeleteHistoryEntry = async (entryId) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta entrada del historial?')) {
      return;
    }
    try {
      await api.delete(`/investment-history/${entryId}`);
      // Recargar el historial
      const response = await api.get(`/investment-history/investment/${selectedInvestment._id}`);
      setInvestmentHistory(response.data);
    } catch (error) {
      alert('Error al eliminar la entrada del historial');
    }
  };

  const getOperationLabel = (operation) => {
    const labels = {
      creation: 'Creación',
      add: 'Añadir Capital',
      withdraw: 'Retirar Capital',
      update: 'Actualización',
    };
    return labels[operation] || operation;
  };

  const handleAddToInvestment = (investment) => {
    setSelectedInvestment(investment);
    setAddFormData({
      quantity: 0,
      price: investment.isAutomatedPortfolio ? 0 : investment.currentPrice,
      currentPrice: investment.currentPrice,
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowAddModal(true);
  };

  const handleSellInvestment = (investment) => {
    setSelectedInvestment(investment);
    setSellFormData({
      quantity: investment.isAutomatedPortfolio ? investment.quantity : 0,
      price: investment.currentPrice,
      date: new Date().toISOString().split('T')[0],
      notes: '',
      returnToSubAccount: true,
    });
    setShowSellModal(true);
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        quantity: parseFloat(addFormData.quantity),
        date: addFormData.date,
        notes: addFormData.notes,
      };
      
      // Para inversiones tradicionales, añadir precio de compra
      if (!selectedInvestment.isAutomatedPortfolio) {
        payload.price = parseFloat(addFormData.price);
        if (addFormData.currentPrice > 0) {
          payload.currentPrice = parseFloat(addFormData.currentPrice);
        }
      }
      
      await api.post(`/investments/${selectedInvestment._id}/add`, payload);
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
      const errorMessage = error.response?.data?.message || error.message || 'Error al añadir a la inversión';
      alert(errorMessage);
    }
  };

  const handleSubmitSell = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post(`/investments/${selectedInvestment._id}/sell`, {
        quantity: parseFloat(sellFormData.quantity),
        price: parseFloat(sellFormData.price),
        date: sellFormData.date,
        notes: sellFormData.notes,
        returnToSubAccount: sellFormData.returnToSubAccount,
      });
      
      fetchData();
      setShowSellModal(false);
      setSellFormData({
        quantity: 0,
        price: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
        returnToSubAccount: true,
      });
      
      if (response.data.message && response.data.message.includes('completamente')) {
        alert(`Retiro realizado. Monto: ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(response.data.saleAmount)}`);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Error al retirar de la inversión';
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
            <div 
              key={investment._id} 
              className="card cursor-pointer hover:shadow-lg transition-shadow"
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
                <button
                  onClick={() => handleAddToInvestment(investment)}
                  className="px-4 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                  title="Añadir capital a inversión"
                >
                  <PlusCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleSellInvestment(investment)}
                  className="px-4 py-2 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
                  title="Retirar de inversión"
                >
                  <MinusCircle className="h-4 w-4" />
                </button>
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
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          onClick={() => { setShowModal(false); resetForm(); }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
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
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          style={{ zIndex: 10000 }}
          onClick={() => setShowUpdateModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
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
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          style={{ zIndex: 10000 }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                        <th className="text-left py-2 text-gray-700 dark:text-gray-300">Operación</th>
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
                        <th className="text-center py-2 text-gray-700 dark:text-gray-300">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {investmentHistory.map((entry) => (
                        <tr key={entry._id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-2 text-gray-600 dark:text-gray-400">
                            {new Date(entry.date).toLocaleDateString('es-ES', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </td>
                          <td className="py-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              entry.operation === 'creation' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                              entry.operation === 'add' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              entry.operation === 'withdraw' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {getOperationLabel(entry.operation)}
                            </span>
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
                          <td className="py-2">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEditHistoryEntry(entry)}
                                className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteHistoryEntry(entry._id)}
                                className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="mb-2 font-medium">No hay historial registrado para esta inversión.</p>
                <p className="text-sm mb-2">El historial se crea automáticamente cuando:</p>
                <ul className="text-sm mt-2 list-disc list-inside space-y-1">
                  <li>Se crea una nueva inversión</li>
                  <li>Se añade capital a la inversión</li>
                  <li>Se retira capital de la inversión</li>
                  <li>Se actualiza manualmente el valor</li>
                </ul>
                <p className="text-xs mt-4 text-gray-400 dark:text-gray-500">
                  Si esta inversión fue creada antes de implementar el historial, puedes crear una entrada manual usando el botón "Actualizar" de la inversión.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal para añadir a inversión */}
      {showAddModal && selectedInvestment && (
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Añadir Capital - {selectedInvestment.name}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {selectedInvestment.isAutomatedPortfolio 
                ? 'Añade más capital a tu cartera automatizada.'
                : 'Al añadir más unidades, se calculará automáticamente el nuevo precio medio de compra.'}
            </p>
            {selectedInvestment.isAutomatedPortfolio ? (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">Capital actual:</span>{' '}
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(selectedInvestment.quantity)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Valor actual: {formatPrice(selectedInvestment.currentPrice, selectedInvestment.currency)}
                </p>
              </div>
            ) : selectedInvestment.averagePurchasePrice && (
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
              {selectedInvestment.isAutomatedPortfolio ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto a añadir</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={addFormData.quantity}
                    onChange={(e) => setAddFormData({ ...addFormData, quantity: parseFloat(e.target.value) })}
                    required
                    min="0.01"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Monto adicional que quieres invertir en la cartera automatizada
                  </p>
                </div>
              ) : (
                <>
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
                </>
              )}
              {!selectedInvestment.isAutomatedPortfolio && (
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
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (opcional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={addFormData.notes}
                  onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
                />
              </div>
              {selectedInvestment.isAutomatedPortfolio && addFormData.quantity > 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nuevo capital total:</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(selectedInvestment.quantity + addFormData.quantity)}
                  </p>
                </div>
              )}
              {!selectedInvestment.isAutomatedPortfolio && addFormData.quantity > 0 && addFormData.price > 0 && selectedInvestment.averagePurchasePrice && (
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
                  {selectedInvestment.isAutomatedPortfolio ? 'Añadir Capital' : 'Añadir a Inversión'}
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

      {/* Modal para vender inversión */}
      {showSellModal && selectedInvestment && (
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          onClick={() => setShowSellModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Retirar de Inversión - {selectedInvestment.name}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {selectedInvestment.isAutomatedPortfolio 
                ? 'Indica el monto a retirar de la cartera automatizada.'
                : 'Al retirar, se reducirá la cantidad y el dinero se devolverá a la subcuenta (si aplica).'}
            </p>
            {selectedInvestment.averagePurchasePrice && !selectedInvestment.isAutomatedPortfolio && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">Cantidad disponible:</span> {selectedInvestment.quantity} unidades
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <span className="font-semibold">Precio medio compra:</span>{' '}
                  {formatPrice(selectedInvestment.averagePurchasePrice, selectedInvestment.currency)}
                </p>
              </div>
            )}
            {selectedInvestment.isAutomatedPortfolio && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">Monto disponible:</span>{' '}
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(selectedInvestment.quantity)}
                </p>
              </div>
            )}
            <form onSubmit={handleSubmitSell} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                <input
                  type="date"
                  className="input-field"
                  value={sellFormData.date}
                  onChange={(e) => setSellFormData({ ...sellFormData, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {selectedInvestment.isAutomatedPortfolio ? 'Monto a retirar' : 'Cantidad a retirar'}
                </label>
                <input
                  type="number"
                  step={selectedInvestment.isAutomatedPortfolio ? "0.01" : "0.0001"}
                  className="input-field"
                  value={sellFormData.quantity}
                  onChange={(e) => setSellFormData({ ...sellFormData, quantity: parseFloat(e.target.value) })}
                  required
                  min="0.0001"
                  max={selectedInvestment.quantity}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {selectedInvestment.isAutomatedPortfolio 
                    ? `Máximo: ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(selectedInvestment.quantity)}`
                    : `Máximo: ${selectedInvestment.quantity} unidades`}
                </p>
              </div>
              {!selectedInvestment.isAutomatedPortfolio && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio de retiro</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="input-field"
                    value={sellFormData.price}
                    onChange={(e) => setSellFormData({ ...sellFormData, price: parseFloat(e.target.value) })}
                    required
                    min="0.0001"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Precio al que retiras las unidades
                  </p>
                </div>
              )}
              {selectedInvestment.subAccount && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="returnToSubAccount"
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    checked={sellFormData.returnToSubAccount}
                    onChange={(e) => setSellFormData({ ...sellFormData, returnToSubAccount: e.target.checked })}
                  />
                  <label htmlFor="returnToSubAccount" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Devolver dinero a la subcuenta
                  </label>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (opcional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={sellFormData.notes}
                  onChange={(e) => setSellFormData({ ...sellFormData, notes: e.target.value })}
                />
              </div>
              {sellFormData.quantity > 0 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Monto a retirar:</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {selectedInvestment.isAutomatedPortfolio
                      ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(sellFormData.quantity)
                      : new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedInvestment.currency }).format(sellFormData.quantity * sellFormData.price)}
                  </p>
                  {!selectedInvestment.isAutomatedPortfolio && sellFormData.quantity < selectedInvestment.quantity && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Cantidad restante: {selectedInvestment.quantity - sellFormData.quantity} unidades
                    </p>
                  )}
                  {sellFormData.quantity >= selectedInvestment.quantity && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-semibold">
                      ⚠️ Se retirará toda la inversión y será eliminada
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary bg-orange-600 hover:bg-orange-700">
                  Retirar
                </button>
                <button
                  type="button"
                  onClick={() => setShowSellModal(false)}
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
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          onClick={() => setShowDeleteModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
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

      {/* Modal para editar entrada del historial */}
      {showEditHistoryModal && editingHistoryEntry && selectedInvestment && (
        <div 
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          style={{ zIndex: 10001 }}
          onClick={() => setShowEditHistoryModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Editar Entrada del Historial
            </h2>
            <form onSubmit={handleSubmitEditHistory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
                <input
                  type="date"
                  className="input-field"
                  value={editHistoryFormData.date}
                  onChange={(e) => setEditHistoryFormData({ ...editHistoryFormData, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Operación</label>
                <select
                  className="input-field"
                  value={editHistoryFormData.operation}
                  onChange={(e) => setEditHistoryFormData({ ...editHistoryFormData, operation: e.target.value })}
                  required
                >
                  <option value="creation">Creación</option>
                  <option value="add">Añadir Capital</option>
                  <option value="withdraw">Retirar Capital</option>
                  <option value="update">Actualización</option>
                </select>
              </div>
              {!selectedInvestment.isAutomatedPortfolio && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="input-field"
                    value={editHistoryFormData.quantity}
                    onChange={(e) => setEditHistoryFormData({ ...editHistoryFormData, quantity: parseFloat(e.target.value) })}
                    required
                    min="0"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {selectedInvestment.isAutomatedPortfolio ? 'Valor Total' : 'Precio Unitario'}
                </label>
                <input
                  type="number"
                  step={selectedInvestment.isAutomatedPortfolio ? "0.01" : "0.0001"}
                  className="input-field"
                  value={editHistoryFormData.currentPrice}
                  onChange={(e) => setEditHistoryFormData({ ...editHistoryFormData, currentPrice: parseFloat(e.target.value) })}
                  required
                  min="0"
                />
              </div>
              {(editHistoryFormData.operation === 'add' || editHistoryFormData.operation === 'withdraw') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto de la Operación</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={editHistoryFormData.operationAmount}
                      onChange={(e) => setEditHistoryFormData({ ...editHistoryFormData, operationAmount: parseFloat(e.target.value) })}
                      min="0"
                    />
                  </div>
                  {!selectedInvestment.isAutomatedPortfolio && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio de la Operación</label>
                      <input
                        type="number"
                        step="0.0001"
                        className="input-field"
                        value={editHistoryFormData.operationPrice}
                        onChange={(e) => setEditHistoryFormData({ ...editHistoryFormData, operationPrice: parseFloat(e.target.value) })}
                        min="0"
                      />
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={editHistoryFormData.notes}
                  onChange={(e) => setEditHistoryFormData({ ...editHistoryFormData, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  Guardar Cambios
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditHistoryModal(false);
                    setEditingHistoryEntry(null);
                  }}
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
          style={{ zIndex: 9999 }}
          onClick={() => {
            setShowDetailModal(false);
            setDetailInvestment(null);
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-5xl w-full p-4 h-[90vh] flex flex-col m-4"
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
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Información Básica</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Tipo:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{getTypeLabel(detailInvestment.type)}</span>
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
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
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
                        <TrendingUp className="h-4 w-4 mr-1" />
                      ) : (
                        <TrendingDown className="h-4 w-4 mr-1" />
                      )}
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: detailInvestment.currency }).format(calculateProfitLoss(detailInvestment))}
                      <span className="ml-2">({calculateProfitLossPercentage(detailInvestment).toFixed(2)}%)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Fechas */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
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

              {/* Configuración */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Configuración</h3>
                <div className="space-y-2 text-sm">
                  {(detailInvestment.symbol || detailInvestment.isin) && !detailInvestment.isAutomatedPortfolio && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Actualización automática:</span>
                      <span 
                        onClick={async () => {
                          const newValue = !(detailInvestment.autoUpdate !== false);
                          const originalValue = detailInvestment.autoUpdate;
                          // Actualizar estado local inmediatamente
                          setDetailInvestment(prev => ({ ...prev, autoUpdate: newValue }));
                          // Actualizar también en la lista de inversiones
                          setInvestments(prev => prev.map(inv => 
                            inv._id === detailInvestment._id 
                              ? { ...inv, autoUpdate: newValue }
                              : inv
                          ));
                          try {
                            await api.patch(`/investments/${detailInvestment._id}/auto-update`, {
                              autoUpdate: newValue
                            });
                          } catch (error) {
                            alert('Error al actualizar la configuración de actualización automática');
                            // Revertir el cambio si falla
                            setDetailInvestment(prev => ({ ...prev, autoUpdate: originalValue }));
                            setInvestments(prev => prev.map(inv => 
                              inv._id === detailInvestment._id 
                                ? { ...inv, autoUpdate: originalValue }
                                : inv
                            ));
                          }
                        }}
                        className={`font-medium cursor-pointer hover:underline transition-colors ${
                          detailInvestment.autoUpdate !== false ? 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        {detailInvestment.autoUpdate !== false ? 'Activada' : 'Desactivada'}
                      </span>
                    </div>
                  )}
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

              {/* Notas */}
              {detailInvestment.notes && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Notas</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{detailInvestment.notes}</p>
                </div>
              )}
            </div>

              {/* Columna derecha */}
              <div className="flex flex-col gap-4 overflow-y-auto pl-2 h-full">

                {/* Gráfica de evolución del valor */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
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
                              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
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
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
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
                              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
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
                  handleViewHistory(detailInvestment);
                }}
                className="flex-1 btn-secondary flex items-center justify-center"
              >
                <History className="h-4 w-4 mr-2" />
                Ver Historial
              </button>
              <button
                onClick={() => {
                  handleUpdateValue(detailInvestment);
                }}
                className="flex-1 btn-secondary flex items-center justify-center"
              >
                <Edit className="h-4 w-4 mr-2" />
                Actualizar
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setDetailInvestment(null);
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

export default Investments;

