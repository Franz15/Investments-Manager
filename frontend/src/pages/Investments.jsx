import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
  History,
  RefreshCw,
  PlusCircle,
  DollarSign,
  MinusCircle,
  CreditCard,
  FileText,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { es } from 'date-fns/locale';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useTranslation } from '../contexts/TranslationContext';
import { useTheme } from '../contexts/ThemeContext';
import { indexPresets } from '../data/indexPresets';

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
    maximumFractionDigits: decimals,
  }).format(value);
};

// Tooltip común para gráficas (mismo estilo que Dashboard)
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

const Investments = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
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
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [investmentToClose, setInvestmentToClose] = useState(null);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [showDCAModal, setShowDCAModal] = useState(false);
  const [editingDCAInvestment, setEditingDCAInvestment] = useState(null);
  const [dcaFormData, setDcaFormData] = useState({
    dcaEnabled: false,
    dcaAmount: 0,
    dcaFrequency: 'monthly',
    dcaStartDate: new Date().toISOString().split('T')[0],
    dcaEndDate: '',
  });
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
    account: '',
    subAccount: '',
  });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailInvestment, setDetailInvestment] = useState(null);
  const [detailInvestmentHistory, setDetailInvestmentHistory] = useState([]);
  const [detailDailyVariations, setDetailDailyVariations] = useState([]);
  const [selectedIndexPreset, setSelectedIndexPreset] = useState('');
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [updatingAutoUpdateAll, setUpdatingAutoUpdateAll] = useState(false);
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
    allocationAccount: '',
    allocationSubAccount: '',
  });
  const [sellFormData, setSellFormData] = useState({
    quantity: 0,
    price: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    returnToSubAccount: true,
    allocationAccount: '',
    allocationSubAccount: '',
  });
  const [formData, setFormData] = useState({
    allocations: [
      {
        account: '',
        subAccount: '',
        amount: 0,
      },
    ],
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
    fixedIncomeSubtype: '',
    fixedIncomePercentage: 0,
    variableIncomePercentage: 100,
    isAlternative: false,
    notes: '',
    platformUrl: '',
    dcaEnabled: false,
    dcaAmount: 0,
    dcaFrequency: 'monthly',
    dcaStartDate: new Date().toISOString().split('T')[0],
    dcaEndDate: '',
    entryMode: 'by_units', // "by_units" = cantidad + precio | "by_total" = importe total + precio
    totalInvested: 0,
  });
  const [investmentView, setInvestmentView] = useState('active');
  const [closeFormData, setCloseFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    price: 0,
    notes: '',
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
    const isAnyModalOpen =
      showModal ||
      showUpdateModal ||
      showHistoryModal ||
      showAddModal ||
      showSellModal ||
      showDeleteModal ||
      showCloseModal ||
      showEditHistoryModal ||
      showDetailModal ||
      showDCAModal;

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
  }, [
    showModal,
    showUpdateModal,
    showHistoryModal,
    showAddModal,
    showSellModal,
    showDeleteModal,
    showCloseModal,
    showEditHistoryModal,
    showDetailModal,
    showDCAModal,
  ]);

  // Actualización automática de precios cada 5 minutos
  const updatingPricesRef = useRef(updatingPrices);
  updatingPricesRef.current = updatingPrices;

  useEffect(() => {
    // Yahoo Finance permite ~33 llamadas/minuto, así que actualizamos cada 5 min para no saturar
    const autoUpdateInterval = setInterval(
      () => {
        // Solo actualizar si no hay una actualización manual en curso
        if (!updatingPricesRef.current) {
          handleUpdateAllPrices(true); // true = actualización automática (silenciosa)
          // Registrar valores diarios después de actualizar precios
          registerDailyValues();
        }
      },
      5 * 60 * 1000
    ); // 5 minutos

    // Limpiar el intervalo al desmontar el componente
    return () => clearInterval(autoUpdateInterval);
  }, []); // Sin dependencias para que solo se cree una vez

  const fetchData = async () => {
    try {
      const [investmentsRes, subAccountsRes, accountsRes] = await Promise.all([
        api.get('/investments?includeClosed=1'),
        api.get('/subaccounts'),
        api.get('/accounts'),
      ]);
      setInvestments(investmentsRes.data);
      setSubAccounts(subAccountsRes.data.filter((sub) => sub.type === 'investment'));
      setAccounts(accountsRes.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const getInvestmentAmount = (data) => {
    const quantity = Number(data.quantity) || 0;
    if (data.isAutomatedPortfolio) {
      return quantity;
    }
    if (data.entryMode === 'by_total' && Number(data.totalInvested) > 0) {
      return Number(data.totalInvested);
    }
    const price = Number(data.purchasePrice) || 0;
    return quantity * price;
  };

  const getAllocationsFromInvestment = (investment) => {
    if (Array.isArray(investment.allocations) && investment.allocations.length) {
      return investment.allocations.map((allocation) => ({
        account: allocation.account?._id || allocation.account || '',
        subAccount: allocation.subAccount?._id || allocation.subAccount || '',
        amount: Number(allocation.amount) || 0,
      }));
    }

    const fallbackPrice = investment.averagePurchasePrice || investment.purchasePrice || 0;
    const fallbackAmount = investment.isAutomatedPortfolio
      ? investment.quantity || 0
      : (investment.quantity || 0) * fallbackPrice;

    return [
      {
        account: investment.account?._id || investment.account || '',
        subAccount: investment.subAccount?._id || investment.subAccount || '',
        amount: fallbackAmount,
      },
    ];
  };

  const getDefaultAllocationTarget = (investment) => {
    const allocations = getAllocationsFromInvestment(investment);
    if (allocations.length > 0) {
      return {
        account: allocations[0].account,
        subAccount: allocations[0].subAccount || '',
      };
    }
    return { account: '', subAccount: '' };
  };

  const getAccountLabel = (accountId) => {
    const account = accounts.find((item) => item._id === accountId);
    if (!account) return t('investments.form.account');
    return `${account.bankName} - ${account.name}`;
  };

  const getSubAccountLabel = (subAccountId) => {
    const subAccount = subAccounts.find((item) => item._id === subAccountId);
    return subAccount?.name || t('investments.form.subAccount');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const normalizedAllocations = (formData.allocations || []).map((allocation) => ({
        account: allocation.account,
        subAccount: allocation.subAccount || null,
        amount: Number(allocation.amount) || 0,
      }));

      if (normalizedAllocations.length === 0) {
        alert(t('investments.modals.errors.allocationsRequired'));
        return;
      }

      const invalidAllocation = normalizedAllocations.find(
        (allocation) => !allocation.account || allocation.amount <= 0
      );
      if (invalidAllocation) {
        alert(t('investments.modals.errors.allocationsInvalid'));
        return;
      }

      const investmentAmount = getInvestmentAmount(formData);
      const totalAllocated = normalizedAllocations.reduce(
        (sum, allocation) => sum + (Number(allocation.amount) || 0),
        0
      );
      if (
        investmentAmount > 0 &&
        totalAllocated > 0 &&
        Math.abs(totalAllocated - investmentAmount) > 0.01
      ) {
        alert(t('investments.modals.errors.allocationsMismatch'));
        return;
      }

      // Preparar datos para enviar
      const dataToSend = {
        ...formData,
        allocations: normalizedAllocations,
        account: normalizedAllocations[0].account,
        subAccount: normalizedAllocations[0].subAccount || undefined,
      };

      // Si se introdujo por importe total, calcular cantidad a partir de total y precio
      if (
        !dataToSend.isAutomatedPortfolio &&
        dataToSend.entryMode === 'by_total' &&
        Number(dataToSend.totalInvested) > 0 &&
        Number(dataToSend.purchasePrice) > 0
      ) {
        dataToSend.quantity = Number(dataToSend.totalInvested) / Number(dataToSend.purchasePrice);
      }
      delete dataToSend.entryMode;
      delete dataToSend.totalInvested;

      if (dataToSend.assetClass === 'alternative') {
        dataToSend.assetClass = 'variable_income';
        dataToSend.isAlternative = true;
      }

      // Si no se proporciona cotización actual o monto actual, usar el valor de compra
      // Esto aplica tanto para inversiones normales como para carteras automatizadas
      if (
        (!dataToSend.currentPrice || dataToSend.currentPrice === 0) &&
        dataToSend.purchasePrice > 0
      ) {
        dataToSend.currentPrice = dataToSend.purchasePrice;
      }

      // Si es cartera automatizada, no enviar purchasePrice y asegurar que el tipo sea válido
      if (dataToSend.isAutomatedPortfolio) {
        delete dataToSend.purchasePrice;
        // Asegurar que el tipo sea válido (no 'automated_portfolio')
        if (dataToSend.type === 'automated_portfolio') {
          dataToSend.type = 'fund';
        }
      }
      // Limpiar subAccount si está vacío
      if (!dataToSend.subAccount) {
        delete dataToSend.subAccount;
      }

      if (dataToSend.assetClass !== 'fixed_income') {
        delete dataToSend.fixedIncomeSubtype;
      } else if (!dataToSend.fixedIncomeSubtype) {
        dataToSend.fixedIncomeSubtype = null;
      }

      // Calcular próxima fecha de DCA si está habilitado
      if (dataToSend.dcaEnabled && dataToSend.dcaStartDate && dataToSend.dcaFrequency) {
        const startDate = new Date(dataToSend.dcaStartDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Si la fecha de inicio es hoy o en el futuro, la próxima fecha es la fecha de inicio
        if (startDate >= today) {
          dataToSend.dcaNextDate = dataToSend.dcaStartDate;
        } else {
          // Calcular la próxima fecha basada en la frecuencia
          let nextDate = new Date(startDate);
          const daysToAdd = {
            daily: 1,
            weekly: 7,
            biweekly: 14,
            monthly: 30,
            quarterly: 90,
          };

          while (nextDate < today) {
            nextDate.setDate(nextDate.getDate() + daysToAdd[dataToSend.dcaFrequency]);
          }

          // Si hay fecha de fin y la próxima fecha la excede, no establecer próxima fecha
          if (dataToSend.dcaEndDate) {
            const endDate = new Date(dataToSend.dcaEndDate);
            if (nextDate > endDate) {
              dataToSend.dcaNextDate = null;
            } else {
              dataToSend.dcaNextDate = nextDate.toISOString().split('T')[0];
            }
          } else {
            dataToSend.dcaNextDate = nextDate.toISOString().split('T')[0];
          }
        }
      } else if (!dataToSend.dcaEnabled) {
        // Si DCA está deshabilitado, limpiar campos relacionados
        delete dataToSend.dcaAmount;
        delete dataToSend.dcaFrequency;
        delete dataToSend.dcaStartDate;
        delete dataToSend.dcaEndDate;
        delete dataToSend.dcaNextDate;
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
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        t('investments.modals.errors.saveInvestment');
      alert(errorMessage);
    }
  };

  const updateAllocation = (index, updates) => {
    setFormData((prev) => {
      const allocations = [...(prev.allocations || [])];
      allocations[index] = { ...allocations[index], ...updates };
      return { ...prev, allocations };
    });
  };

  const handleAddAllocation = () => {
    setFormData((prev) => ({
      ...prev,
      allocations: [...(prev.allocations || []), { account: '', subAccount: '', amount: 0 }],
    }));
  };

  const handleRemoveAllocation = (index) => {
    setFormData((prev) => {
      const allocations = [...(prev.allocations || [])];
      allocations.splice(index, 1);
      return {
        ...prev,
        allocations: allocations.length
          ? allocations
          : [{ account: '', subAccount: '', amount: 0 }],
      };
    });
  };

  const totalAllocatedAmount = (formData.allocations || []).reduce(
    (sum, allocation) => sum + (Number(allocation.amount) || 0),
    0
  );
  const investmentAmount = getInvestmentAmount(formData);
  const allocationsMismatch =
    investmentAmount > 0 &&
    totalAllocatedAmount > 0 &&
    Math.abs(totalAllocatedAmount - investmentAmount) > 0.01;

  const handleEdit = (investment) => {
    setEditingInvestment(investment);
    const qty = Number(investment.quantity) || 0;
    const price = Number(investment.purchasePrice) || 0;
    setFormData({
      allocations: getAllocationsFromInvestment(investment),
      name: investment.name,
      type: investment.type,
      symbol: investment.symbol || '',
      isin: investment.isin || '',
      isAutomatedPortfolio: investment.isAutomatedPortfolio || false,
      quantity: qty,
      purchasePrice: price,
      entryMode: 'by_units',
      totalInvested: qty * price,
      currentPrice: investment.currentPrice,
      purchaseDate: new Date(investment.purchaseDate).toISOString().split('T')[0],
      currency: investment.currency,
      assetClass:
        investment.assetClass === 'alternative'
          ? 'variable_income'
          : investment.assetClass || 'variable_income',
      fixedIncomeSubtype:
        investment.assetClass === 'fixed_income' ? investment.fixedIncomeSubtype || '' : '',
      fixedIncomePercentage: investment.fixedIncomePercentage || 0,
      variableIncomePercentage: investment.variableIncomePercentage || 100,
      isAlternative: investment.isAlternative || investment.assetClass === 'alternative',
      notes: investment.notes || '',
      platformUrl: investment.platformUrl || '',
      dcaEnabled: investment.dcaEnabled || false,
      dcaAmount: investment.dcaAmount || 0,
      dcaFrequency: investment.dcaFrequency || 'monthly',
      dcaStartDate: investment.dcaStartDate
        ? new Date(investment.dcaStartDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      dcaEndDate: investment.dcaEndDate
        ? new Date(investment.dcaEndDate).toISOString().split('T')[0]
        : '',
    });
    setShowModal(true);
  };

  const handleDeleteClick = (investment) => {
    setInvestmentToDelete(investment);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!investmentToDelete) return;

    try {
      await api.delete(`/investments/${investmentToDelete._id}`);
      fetchData();
      setShowDeleteModal(false);
      setInvestmentToDelete(null);
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        t('investments.modals.errors.deleteInvestment');
      alert(errorMessage);
    }
  };

  const handleCloseClick = (investment) => {
    if (investment.status === 'closed') {
      alert(t('investments.modals.errors.closedInvestment'));
      return;
    }
    setInvestmentToClose(investment);
    setCloseFormData({
      date: new Date().toISOString().split('T')[0],
      price: investment.isAutomatedPortfolio ? 0 : investment.currentPrice || 0,
      notes: '',
    });
    setShowCloseModal(true);
  };

  const handleConfirmClose = async (e) => {
    e?.preventDefault?.();
    if (!investmentToClose) return;

    try {
      const payload = {
        date: closeFormData.date,
        notes: closeFormData.notes,
      };
      if (!investmentToClose.isAutomatedPortfolio) {
        payload.price = parseFloat(closeFormData.price);
      }

      await api.post(`/investments/${investmentToClose._id}/close`, payload);
      fetchData();
      setShowCloseModal(false);
      setInvestmentToClose(null);
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        t('investments.modals.errors.closeInvestment');
      alert(errorMessage);
    }
  };

  const activeInvestments = investments.filter((inv) => inv.status !== 'closed');
  const closedInvestments = investments.filter((inv) => inv.status === 'closed');
  const visibleInvestments = investmentView === 'closed' ? closedInvestments : activeInvestments;

  const investmentsWithAutoUpdateSupport = activeInvestments.filter(
    (inv) => (inv.symbol || inv.isin) && !inv.isAutomatedPortfolio
  );
  const countAutoUpdateOn = investmentsWithAutoUpdateSupport.filter(
    (inv) => inv.autoUpdate !== false
  ).length;

  const allAutoUpdateOn =
    investmentsWithAutoUpdateSupport.length > 0 &&
    countAutoUpdateOn === investmentsWithAutoUpdateSupport.length;

  const handleToggleAllAutoUpdate = async () => {
    if (investmentsWithAutoUpdateSupport.length === 0) return;
    const newValue = !allAutoUpdateOn;
    setUpdatingAutoUpdateAll(true);
    try {
      await Promise.all(
        investmentsWithAutoUpdateSupport.map((inv) =>
          api.patch(`/investments/${inv._id}/auto-update`, {
            autoUpdate: newValue,
          })
        )
      );
      setInvestments((prev) =>
        prev.map((inv) => {
          const supports = (inv.symbol || inv.isin) && !inv.isAutomatedPortfolio;
          return supports ? { ...inv, autoUpdate: newValue } : inv;
        })
      );
    } catch (error) {
      alert(t('investments.modals.errors.updateAutoUpdate'));
    } finally {
      setUpdatingAutoUpdateAll(false);
    }
  };

  const handleSaveDCA = async () => {
    if (!editingDCAInvestment) return;

    try {
      const dataToSend = { ...dcaFormData };

      // Calcular próxima fecha de DCA si está habilitado
      if (dataToSend.dcaEnabled && dataToSend.dcaStartDate && dataToSend.dcaFrequency) {
        const startDate = new Date(dataToSend.dcaStartDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (startDate >= today) {
          dataToSend.dcaNextDate = dataToSend.dcaStartDate;
        } else {
          let nextDate = new Date(startDate);
          const daysToAdd = {
            daily: 1,
            weekly: 7,
            biweekly: 14,
            monthly: 30,
            quarterly: 90,
          };

          while (nextDate < today) {
            nextDate.setDate(nextDate.getDate() + daysToAdd[dataToSend.dcaFrequency]);
          }

          if (dataToSend.dcaEndDate) {
            const endDate = new Date(dataToSend.dcaEndDate);
            if (nextDate > endDate) {
              dataToSend.dcaNextDate = null;
            } else {
              dataToSend.dcaNextDate = nextDate.toISOString().split('T')[0];
            }
          } else {
            dataToSend.dcaNextDate = nextDate.toISOString().split('T')[0];
          }
        }
      } else if (!dataToSend.dcaEnabled) {
        // Si DCA está deshabilitado, guardar fecha de desactivación si antes estaba activado
        if (editingDCAInvestment.dcaEnabled) {
          dataToSend.dcaDeactivatedDate = new Date().toISOString().split('T')[0];
        }
        // Limpiar campos relacionados pero mantener historial
        dataToSend.dcaAmount = 0;
        dataToSend.dcaFrequency = null;
        dataToSend.dcaStartDate = null;
        dataToSend.dcaEndDate = null;
        dataToSend.dcaNextDate = null;
      } else if (dataToSend.dcaEnabled && editingDCAInvestment.dcaEnabled === false) {
        // Si se reactiva el DCA, limpiar fecha de desactivación
        dataToSend.dcaDeactivatedDate = null;
      }

      await api.put(`/investments/${editingDCAInvestment._id}`, dataToSend);

      // Actualizar el estado local de inversiones
      setInvestments((prev) =>
        prev.map((inv) => (inv._id === editingDCAInvestment._id ? { ...inv, ...dataToSend } : inv))
      );

      // Si el modal de detalle está abierto para esta inversión, actualizarlo también
      if (detailInvestment && detailInvestment._id === editingDCAInvestment._id) {
        setDetailInvestment((prev) => ({ ...prev, ...dataToSend }));
      }

      fetchData();
      setShowDCAModal(false);
      setEditingDCAInvestment(null);
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || t('investments.modals.errors.saveDCA');
      alert(errorMessage);
    }
  };

  const handleUpdateValue = (investment) => {
    if (investment.status === 'closed') {
      alert(t('investments.modals.errors.closedInvestment'));
      return;
    }
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
    } catch (error) {}
  };

  const handleViewHistory = async (investment) => {
    setSelectedInvestment(investment);
    setHistoryLoading(true);
    setShowHistoryModal(true);
    try {
      const response = await api.get(`/investment-history/investment/${investment._id}`);
      setInvestmentHistory(response.data || []);
    } catch (error) {
      alert(
        t('investments.modals.errors.loadHistory', {
          error: error.response?.data?.message || error.message,
        })
      );
      setInvestmentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleEditHistoryEntry = (entry) => {
    setEditingHistoryEntry(entry);
    const defaultAllocation = getDefaultAllocationTarget(selectedInvestment);
    setEditHistoryFormData({
      date: new Date(entry.date).toISOString().split('T')[0],
      currentPrice: entry.currentPrice,
      quantity: entry.quantity,
      notes: entry.notes || '',
      operation: entry.operation || 'update',
      operationAmount: entry.operationAmount || 0,
      operationPrice: entry.operationPrice || 0,
      account: entry.account?._id || entry.account || defaultAllocation.account || '',
      subAccount: entry.subAccount?._id || entry.subAccount || defaultAllocation.subAccount || '',
    });
    setShowEditHistoryModal(true);
  };

  const handleSubmitEditHistory = async (e) => {
    e.preventDefault();
    try {
      const requiresAccount = ['creation', 'add', 'withdraw'].includes(
        editHistoryFormData.operation
      );
      const payload = {
        ...editHistoryFormData,
        account: requiresAccount ? editHistoryFormData.account : undefined,
        subAccount: requiresAccount ? editHistoryFormData.subAccount || null : undefined,
      };
      await api.put(`/investment-history/${editingHistoryEntry._id}`, payload);
      // Recargar el historial
      const response = await api.get(`/investment-history/investment/${selectedInvestment._id}`);
      setInvestmentHistory(response.data);
      setShowEditHistoryModal(false);
      setEditingHistoryEntry(null);
    } catch (error) {
      alert(t('investments.modals.errors.editHistory'));
    }
  };

  const handleDeleteHistoryEntry = async (entryId) => {
    if (!confirm(t('investments.modals.editHistory.deleteConfirm'))) {
      return;
    }
    try {
      await api.delete(`/investment-history/${entryId}`);
      // Recargar el historial
      const response = await api.get(`/investment-history/investment/${selectedInvestment._id}`);
      setInvestmentHistory(response.data);
    } catch (error) {
      alert(t('investments.modals.errors.deleteHistory'));
    }
  };

  const getOperationLabel = (operation) => {
    const labels = {
      creation: 'Creación',
      add: t('investments.actions.addCapital'),
      withdraw: 'Retirar Capital',
      update: 'Actualización',
    };
    return labels[operation] || operation;
  };

  const handleAddToInvestment = (investment) => {
    if (investment.status === 'closed') {
      alert(t('investments.modals.errors.closedInvestment'));
      return;
    }
    setSelectedInvestment(investment);
    const defaultAllocation = getDefaultAllocationTarget(investment);
    setAddFormData({
      quantity: 0,
      price: investment.isAutomatedPortfolio ? 0 : investment.currentPrice,
      currentPrice: investment.currentPrice,
      date: new Date().toISOString().split('T')[0],
      notes: '',
      allocationAccount: defaultAllocation.account,
      allocationSubAccount: defaultAllocation.subAccount,
    });
    setShowAddModal(true);
  };

  const handleSellInvestment = (investment) => {
    if (investment.status === 'closed') {
      alert(t('investments.modals.errors.closedInvestment'));
      return;
    }
    setSelectedInvestment(investment);
    const defaultAllocation = getDefaultAllocationTarget(investment);
    setSellFormData({
      quantity: 0,
      price: investment.currentPrice,
      date: new Date().toISOString().split('T')[0],
      notes: '',
      returnToSubAccount: true,
      allocationAccount: defaultAllocation.account,
      allocationSubAccount: defaultAllocation.subAccount,
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

      if (addFormData.allocationAccount) {
        payload.allocation = {
          account: addFormData.allocationAccount,
          subAccount: addFormData.allocationSubAccount || null,
        };
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
        allocationAccount: '',
        allocationSubAccount: '',
      });
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Error al añadir a la inversión';
      alert(errorMessage);
    }
  };

  const handleSubmitSell = async (e) => {
    e.preventDefault();
    try {
      if (selectedInvestment && sellFormData.quantity >= selectedInvestment.quantity) {
        alert(t('investments.modals.sellInvestment.useClose'));
        return;
      }
      const response = await api.post(`/investments/${selectedInvestment._id}/sell`, {
        quantity: parseFloat(sellFormData.quantity),
        price: parseFloat(sellFormData.price),
        date: sellFormData.date,
        notes: sellFormData.notes,
        returnToSubAccount: sellFormData.returnToSubAccount,
        allocation: sellFormData.allocationAccount
          ? {
              account: sellFormData.allocationAccount,
              subAccount: sellFormData.allocationSubAccount || null,
            }
          : undefined,
      });

      fetchData();
      setShowSellModal(false);
      setSellFormData({
        quantity: 0,
        price: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
        returnToSubAccount: true,
        allocationAccount: '',
        allocationSubAccount: '',
      });

      if (response.data.message && response.data.message.includes('completamente')) {
        alert(
          t('investments.modals.errors.withdrawSuccess', {
            amount: new Intl.NumberFormat('es-ES', {
              style: 'currency',
              currency: selectedInvestment.currency,
            }).format(response.data.saleAmount),
          })
        );
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Error al retirar de la inversión';
      alert(errorMessage);
    }
  };

  const resetForm = () => {
    setFormData({
      allocations: [
        {
          account: '',
          subAccount: '',
          amount: 0,
        },
      ],
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
      fixedIncomeSubtype: '',
      fixedIncomePercentage: 0,
      variableIncomePercentage: 100,
      isAlternative: false,
      notes: '',
      platformUrl: '',
      dcaEnabled: false,
      dcaAmount: 0,
      dcaFrequency: 'monthly',
      dcaStartDate: new Date().toISOString().split('T')[0],
      dcaEndDate: '',
      entryMode: 'by_units',
      totalInvested: 0,
    });
    setEditingInvestment(null);
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
    if (investment?.status === 'closed' && investment.closeSummary) {
      return investment.closeSummary.resultAmount || 0;
    }
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas: valor actual - monto invertido
      return investment.currentPrice - investment.quantity;
    }
    // Para inversiones tradicionales: (precio actual - precio medio compra) * cantidad
    const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
    return (investment.currentPrice - avgPrice) * investment.quantity;
  };

  const calculateProfitLossPercentage = (investment) => {
    if (investment?.status === 'closed' && investment.closeSummary) {
      return investment.closeSummary.resultPercent || 0;
    }
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
            .filter((r) => !r.success)
            .map((r) => {
              const inv = investments.find((i) => (i._id?.toString() || i.id) === r.investmentId);
              return inv?.symbol || inv?.name || 'Desconocido';
            });
          alert(
            t('investments.modals.errors.updatePricesSuccess', {
              updated,
              failed,
            }) +
              '\n\n' +
              t('investments.modals.errors.updatePricesFailed', {
                symbols: failedSymbols.join(', '),
              })
          );
        } else if (failed > 0 && isAutoUpdate) {
          // Para actualizaciones automáticas, solo log en consola
          const failedSymbols = results
            .filter((r) => !r.success)
            .map((r) => {
              const inv = investments.find((i) => (i._id?.toString() || i.id) === r.investmentId);
              return inv?.symbol || inv?.name || 'Desconocido';
            });
          // Log silencioso para actualizaciones automáticas
        }
        // Si todo salió bien, no mostrar popup
      } else if (!isAutoUpdate) {
        alert(t('investments.modals.errors.updatePricesError'));
      }
    } catch (error) {
      // Solo mostrar alerta si es actualización manual
      if (!isAutoUpdate) {
        const errorMessage =
          error.response?.data?.message || error.message || 'Error al actualizar precios';
        alert(
          t('investments.modals.errors.updatePricesErrorDetail', {
            error: errorMessage,
          })
        );
      }
    } finally {
      setUpdatingPrices(false);
    }
  };

  const isFullWithdrawal =
    selectedInvestment && Number(sellFormData.quantity) >= Number(selectedInvestment.quantity);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('investments.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t('investments.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleUpdateAllPrices(false)}
            disabled={updatingPrices}
            className="btn-secondary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('investments.updatePricesTooltip')}
          >
            <DollarSign className={`h-5 w-5 mr-2 ${updatingPrices ? 'animate-spin' : ''}`} />
            {updatingPrices ? t('investments.updatingPrices') : t('investments.updatePrices')}
          </button>
          {investmentsWithAutoUpdateSupport.length > 0 && (
            <button
              onClick={handleToggleAllAutoUpdate}
              disabled={updatingAutoUpdateAll}
              className={`btn-secondary flex items-center disabled:opacity-50 disabled:cursor-not-allowed ${
                allAutoUpdateOn
                  ? 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  : 'text-user-accent hover:text-user-accent border-user-accent hover:border-user-accent'
              }`}
              title={
                allAutoUpdateOn
                  ? t('investments.automaticUpdateDeactivateAllTooltip')
                  : t('investments.automaticUpdateActivateAllTooltip')
              }
            >
              <RefreshCw
                className={`h-5 w-5 mr-2 shrink-0 ${updatingAutoUpdateAll ? 'animate-spin' : ''}`}
              />
              {updatingAutoUpdateAll
                ? t('investments.updatingPrices')
                : allAutoUpdateOn
                  ? t('investments.automaticUpdateDeactivateAll')
                  : t('investments.automaticUpdateActivateAll')}
            </button>
          )}
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            {t('investments.newInvestment')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Botones de vista */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInvestmentView('active')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              investmentView === 'active'
                ? 'text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
            style={
              investmentView === 'active'
                ? {
                    backgroundColor: 'var(--user-color-600)',
                  }
                : undefined
            }
            onMouseEnter={(e) => {
              if (investmentView === 'active') {
                e.currentTarget.style.backgroundColor = 'var(--user-color-700)';
              }
            }}
            onMouseLeave={(e) => {
              if (investmentView === 'active') {
                e.currentTarget.style.backgroundColor = 'var(--user-color-600)';
              }
            }}
          >
            {t('investments.views.active')}
          </button>
          <button
            onClick={() => setInvestmentView('closed')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              investmentView === 'closed'
                ? 'text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
            style={
              investmentView === 'closed'
                ? {
                    backgroundColor: 'var(--user-color-600)',
                  }
                : undefined
            }
            onMouseEnter={(e) => {
              if (investmentView === 'closed') {
                e.currentTarget.style.backgroundColor = 'var(--user-color-700)';
              }
            }}
            onMouseLeave={(e) => {
              if (investmentView === 'closed') {
                e.currentTarget.style.backgroundColor = 'var(--user-color-600)';
              }
            }}
          >
            {t('investments.views.closed')}
          </button>
        </div>

        {/* Resumen inline a la derecha */}
        {investmentView === 'closed' &&
          closedInvestments.length > 0 &&
          (() => {
            const totals = closedInvestments.reduce(
              (acc, inv) => {
                acc.totalContributed += inv.closeSummary?.totalContributed || 0;
                acc.totalWithdrawn += inv.closeSummary?.totalWithdrawn || 0;
                return acc;
              },
              { totalContributed: 0, totalWithdrawn: 0 }
            );
            const totalResult = totals.totalWithdrawn - totals.totalContributed;
            const totalResultPercent =
              totals.totalContributed > 0 ? (totalResult / totals.totalContributed) * 100 : 0;
            const isPositive = totalResult >= 0;
            const fmt = (v) =>
              new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(v);

            return (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400 hidden sm:inline">
                  {closedInvestments.length} {t('investments.closedSummary.investments')}
                </span>
                <span className="text-gray-400 dark:text-gray-600 hidden sm:inline">·</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 dark:text-gray-400">
                    <span className="hidden md:inline">
                      {t('investments.closedSummary.totalInvested')}:{' '}
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {fmt(totals.totalContributed)}
                    </span>
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">→</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    <span className="hidden md:inline">
                      {t('investments.closedSummary.totalRecovered')}:{' '}
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {fmt(totals.totalWithdrawn)}
                    </span>
                  </span>
                </div>
                <span
                  className={`font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {isPositive ? '+' : ''}
                  {fmt(totalResult)}
                  <span className="ml-1 font-semibold text-xs">
                    ({isPositive ? '+' : ''}
                    {totalResultPercent.toFixed(2)}%)
                  </span>
                </span>
              </div>
            );
          })()}

        {investmentView === 'active' &&
          activeInvestments.length > 0 &&
          (() => {
            const totals = activeInvestments.reduce(
              (acc, inv) => {
                const value = inv.isAutomatedPortfolio
                  ? inv.currentPrice || 0
                  : (inv.quantity || 0) * (inv.currentPrice || 0);
                const pl = calculateProfitLoss(inv);
                acc.totalValue += value;
                acc.totalPL += pl;
                return acc;
              },
              { totalValue: 0, totalPL: 0 }
            );
            const invested = totals.totalValue - totals.totalPL;
            const totalPLPercent = invested > 0 ? (totals.totalPL / invested) * 100 : 0;
            const isPositive = totals.totalPL >= 0;
            const fmt = (v) =>
              new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(v);

            return (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400 hidden sm:inline">
                  {activeInvestments.length} {t('investments.activeSummary.investments')}
                </span>
                <span className="text-gray-400 dark:text-gray-600 hidden sm:inline">·</span>
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="hidden md:inline">
                    {t('investments.activeSummary.totalValue')}:{' '}
                  </span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {fmt(totals.totalValue)}
                  </span>
                </span>
                <span
                  className={`font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  <span className="hidden md:inline">
                    {t('investments.activeSummary.profitLoss')}:{' '}
                  </span>
                  {isPositive ? '+' : ''}
                  {fmt(totals.totalPL)}
                  <span className="ml-1 font-semibold text-xs">
                    ({isPositive ? '+' : ''}
                    {totalPLPercent.toFixed(2)}%)
                  </span>
                </span>
              </div>
            );
          })()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {visibleInvestments.map((investment) => {
          const profitLoss = calculateProfitLoss(investment);
          const profitLossPercent = calculateProfitLossPercentage(investment);
          const totalValue = investment.isAutomatedPortfolio
            ? investment.currentPrice
            : investment.quantity * investment.currentPrice;
          const hasAllocations =
            Array.isArray(investment.allocations) && investment.allocations.length > 0;
          const hasSingleAccount = investment.account || investment.subAccount;

          return (
            <div
              key={investment._id}
              className="card cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
              onClick={async (e) => {
                if (
                  e.target.tagName === 'BUTTON' ||
                  e.target.tagName === 'INPUT' ||
                  e.target.closest('button') ||
                  e.target.closest('input')
                ) {
                  return;
                }
                setDetailInvestment(investment);
                setShowDetailModal(true);
                try {
                  const [historyRes, variationsRes] = await Promise.all([
                    api.get(`/investment-history/investment/${investment._id}`),
                    api.get(`/investment-history/investment/${investment._id}/daily-variations`),
                  ]);
                  setDetailInvestmentHistory(historyRes.data || []);
                  setDetailDailyVariations(variationsRes.data || []);
                } catch (error) {
                  setDetailInvestmentHistory([]);
                  setDetailDailyVariations([]);
                }
              }}
            >
              {/* Cabecera: nombre + línea secundaria (símbolo · tipo · DCA) + badges */}
              <div className="flex-shrink-0 mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg leading-tight">
                    {investment.name}
                  </h3>
                  {investment.status === 'closed' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {t('investments.badges.closed')}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    {(investment.symbol || (investment.isin && !investment.symbol)) && (
                      <span>{investment.symbol || `ISIN ${investment.isin}`}</span>
                    )}
                    {(investment.symbol || investment.isin) && (
                      <span className="text-gray-400 dark:text-gray-500">·</span>
                    )}
                    <span>{getTypeLabel(investment.type, investment.isAutomatedPortfolio)}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 text-xs">
                    {(investment.symbol || investment.isin) &&
                      !investment.isAutomatedPortfolio &&
                      investment.status !== 'closed' && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const newValue = investment.autoUpdate === false;
                            try {
                              await api.patch(`/investments/${investment._id}/auto-update`, {
                                autoUpdate: newValue,
                              });
                              setInvestments((prev) =>
                                prev.map((inv) =>
                                  inv._id === investment._id
                                    ? { ...inv, autoUpdate: newValue }
                                    : inv
                                )
                              );
                            } catch (error) {
                              alert(t('investments.modals.errors.updateAutoUpdate'));
                            }
                          }}
                          className={`py-1 px-1 -my-1 -mx-1 rounded font-medium transition-colors text-left ${
                            investment.autoUpdate !== false
                              ? 'text-user-accent hover:text-user-accent'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                          title={
                            investment.autoUpdate !== false
                              ? t('investments.automaticUpdateOn') + ' (clic para desactivar)'
                              : t('investments.automaticUpdateOff') + ' (clic para activar)'
                          }
                        >
                          {investment.autoUpdate !== false
                            ? t('investments.automaticUpdateOn')
                            : t('investments.automaticUpdateOff')}
                        </button>
                      )}
                    {(investment.symbol || investment.isin) &&
                      !investment.isAutomatedPortfolio &&
                      investment.status !== 'closed' && (
                        <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                          ·
                        </span>
                      )}
                    {investment.dcaEnabled && investment.status !== 'closed' ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-green-600 dark:text-green-400 font-medium">DCA:</span>
                        <span>
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: investment.currency || 'EUR',
                            notation: 'compact',
                            maximumFractionDigits: 0,
                          }).format(investment.dcaAmount || 0)}
                        </span>
                        <span>{t(`investments.dca.frequencies.${investment.dcaFrequency}`)}</span>
                        {investment.dcaNextDate && (
                          <span className="text-gray-400 dark:text-gray-500">
                            ·{' '}
                            {new Date(investment.dcaNextDate).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDCAInvestment(investment);
                            setDcaFormData({
                              dcaEnabled: investment.dcaEnabled || false,
                              dcaAmount: investment.dcaAmount || 0,
                              dcaFrequency: investment.dcaFrequency || 'monthly',
                              dcaStartDate: investment.dcaStartDate
                                ? new Date(investment.dcaStartDate).toISOString().split('T')[0]
                                : new Date().toISOString().split('T')[0],
                              dcaEndDate: investment.dcaEndDate
                                ? new Date(investment.dcaEndDate).toISOString().split('T')[0]
                                : '',
                            });
                            setShowDCAModal(true);
                          }}
                          className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                          title={t('investments.dca.edit')}
                        >
                          <Edit className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDCAInvestment(investment);
                          setDcaFormData({
                            dcaEnabled: false,
                            dcaAmount: 0,
                            dcaFrequency: 'monthly',
                            dcaStartDate: new Date().toISOString().split('T')[0],
                            dcaEndDate: '',
                          });
                          setShowDCAModal(true);
                        }}
                        className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium flex items-center gap-1"
                        title={t('investments.dca.activate')}
                      >
                        <Plus className="h-3 w-3 shrink-0" />
                        {t('investments.dca.activate')}
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {investment.isAutomatedPortfolio && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                      {t('investments.investmentTypes.automatedPortfolio')}
                    </span>
                  )}
                  {investment.dcaEnabled && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                      {t('investments.dca.enabled')}
                    </span>
                  )}
                  {investment.assetClass === 'fixed_income' && (
                    <>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                        {t('investments.assetClassLabels.fixedIncome')}
                      </span>
                      {getFixedIncomeSubtypeLabel(investment.fixedIncomeSubtype) && (
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getFixedIncomeSubtypeTone(
                            investment.fixedIncomeSubtype
                          )}`}
                        >
                          {getFixedIncomeSubtypeLabel(investment.fixedIncomeSubtype)}
                        </span>
                      )}
                    </>
                  )}
                  {investment.assetClass === 'variable_income' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                      {t('investments.assetClassLabels.variableIncome')}
                    </span>
                  )}
                  {investment.assetClass === 'mixed' && (
                    <>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                        {t('investments.assetClassLabels.mixed')}
                      </span>
                      <span className="text-[10px] text-gray-600 dark:text-gray-400 self-center">
                        {t('investments.assetClassLabels.fixedIncomeShort')}{' '}
                        {investment.fixedIncomePercentage || 0}% ·{' '}
                        {t('investments.assetClassLabels.variableIncomeShort')}{' '}
                        {investment.variableIncomePercentage || 0}%
                      </span>
                    </>
                  )}
                  {investment.isAlternative && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                      {t('investments.assetClassLabels.alternative')}
                    </span>
                  )}
                </div>
              </div>

              {/* Resumen destacado: valor total + P&L */}
              <div className="flex justify-between items-baseline gap-3 mb-3 px-1">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    {t('investments.cardLabels.totalValue')}
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: investment.currency,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(totalValue)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    {t('investments.cardLabels.profitLoss')}
                  </p>
                  <p
                    className={`text-lg font-bold tabular-nums flex items-center justify-end gap-1 ${
                      profitLoss >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {profitLoss >= 0 ? (
                      <TrendingUp className="h-4 w-4 shrink-0" />
                    ) : (
                      <TrendingDown className="h-4 w-4 shrink-0" />
                    )}
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: investment.currency,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(profitLoss)}
                    <span className="text-sm font-semibold opacity-90">
                      ({profitLossPercent >= 0 ? '+' : ''}
                      {profitLossPercent.toFixed(2)}%)
                    </span>
                  </p>
                </div>
              </div>

              {/* Bloque datos financieros (detalle) */}
              <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg p-4 flex-shrink-0">
                {investment.isAutomatedPortfolio ? (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('investments.form.investedAmount')}:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: investment.currency,
                          }).format(investment.quantity)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('investments.detail.currentValue')}:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                          {formatPrice(investment.currentPrice, investment.currency)}
                        </span>
                      </div>
                    </div>
                    {investment.platformUrl && (
                      <div className="mt-3">
                        <a
                          href={investment.platformUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t('investments.actions.viewPlatform')} ↗
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('investments.cardLabels.quantity')}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                        {investment.quantity}
                      </span>
                    </div>
                    {investment.averagePurchasePrice != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('investments.cardLabels.averagePurchasePrice')}:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                          {formatPrice(investment.averagePurchasePrice, investment.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('investments.cardLabels.currentPrice')}:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                        {formatPrice(investment.currentPrice, investment.currency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Distribución por cuentas (multicuenta o cuenta única) */}
              {(hasAllocations || hasSingleAccount) && (
                <div className="mt-3 flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    {t('investments.detail.allocationsLabel')}
                  </p>
                  <div className="space-y-1 text-sm">
                    {hasAllocations ? (
                      (() => {
                        const totalAllocated = investment.allocations.reduce(
                          (sum, a) => sum + (Number(a.amount) || 0),
                          0
                        );
                        return investment.allocations.map((allocation, idx) => {
                          const accountName =
                            allocation.account?.name || allocation.account?.bankName || '—';
                          const subAccountName = allocation.subAccount?.name || '';
                          const percentage =
                            totalAllocated > 0
                              ? ((allocation.amount || 0) / totalAllocated) * 100
                              : 0;
                          const amountStr = new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: investment.currency || 'EUR',
                            maximumFractionDigits: 0,
                            minimumFractionDigits: 0,
                          }).format(allocation.amount || 0);
                          return (
                            <div
                              key={`alloc-${investment._id}-${idx}`}
                              className="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-300"
                            >
                              <span className="font-medium text-gray-900 dark:text-gray-100 truncate min-w-0 flex-1">
                                {accountName}
                                {subAccountName ? ` → ${subAccountName}` : ''}
                              </span>
                              <span className="shrink-0 text-gray-500 dark:text-gray-400 tabular-nums">
                                {amountStr}
                                {investment.allocations.length > 1 && totalAllocated > 0 && (
                                  <span className="ml-1 text-xs">({percentage.toFixed(0)}%)</span>
                                )}
                              </span>
                            </div>
                          );
                        });
                      })()
                    ) : (
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        {investment.account && (
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {investment.account.name || investment.account.bankName || '—'}
                          </span>
                        )}
                        {investment.subAccount && (
                          <span className="text-gray-500 dark:text-gray-400">
                            → {investment.subAccount.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-1.5 mt-auto pt-4 flex-shrink-0 flex-wrap">
                {investment.status !== 'closed' && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToInvestment(investment);
                      }}
                      className="px-2.5 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                      title={t('investments.actions.addCapitalTooltip')}
                    >
                      <PlusCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSellInvestment(investment);
                      }}
                      className="px-2.5 py-2 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
                      title={t('investments.actions.sellTooltip')}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseClick(investment);
                      }}
                      className="px-2.5 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                      title={t('investments.actions.closeTooltip')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateValue(investment);
                      }}
                      className={`flex-1 min-w-[100px] btn-secondary flex items-center justify-center text-xs px-2 ${investment.isAutomatedPortfolio ? 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50' : ''}`}
                      title={
                        investment.isAutomatedPortfolio
                          ? t('investments.actions.updateValueTooltip')
                          : t('investments.actions.updateTooltip')
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                      <span className="truncate">
                        {investment.isAutomatedPortfolio
                          ? t('investments.actions.updateValue')
                          : t('investments.actions.update')}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(investment);
                      }}
                      className="px-2.5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title={t('investments.actions.edit')}
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewHistory(investment);
                  }}
                  className="px-2.5 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  title={t('investments.actions.viewHistory')}
                >
                  <History className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {visibleInvestments.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {investmentView === 'closed'
            ? t('investments.noClosedInvestments')
            : t('investments.noInvestments')}
        </div>
      )}

      {showModal &&
        createPortal(
          <div className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center">
            <div
              className="modal-content max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                {editingInvestment
                  ? t('investments.editInvestment')
                  : t('investments.newInvestment')}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Sección: Ubicación */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    {t('investments.form.location')}
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('investments.form.allocationsTitle')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('investments.form.allocationsHelp')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddAllocation}
                        className="btn-secondary text-xs"
                      >
                        {t('investments.form.addAllocation')}
                      </button>
                    </div>

                    {(formData.allocations || []).map((allocation, index) => {
                      const accountSubAccounts = subAccounts.filter(
                        (sa) =>
                          sa.account?._id === allocation.account ||
                          sa.account === allocation.account
                      );

                      return (
                        <div
                          key={`allocation-${index}`}
                          className="p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg space-y-3"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('investments.form.allocationAccount')}{' '}
                                <span className="text-red-500">*</span>
                              </label>
                              <select
                                className="input-field"
                                value={allocation.account}
                                onChange={(e) => {
                                  const newAccount = e.target.value;
                                  updateAllocation(index, {
                                    account: newAccount,
                                    subAccount: '',
                                  });
                                  if (index === 0) {
                                    const newCurrency = newAccount
                                      ? accounts.find((a) => a._id === newAccount)?.currency ||
                                        'EUR'
                                      : formData.currency;
                                    setFormData((prev) => ({
                                      ...prev,
                                      currency: newCurrency,
                                    }));
                                  }
                                }}
                                required
                              >
                                <option value="">
                                  {t('investments.form.allocationSelectAccount')}
                                </option>
                                {accounts.map((account) => (
                                  <option key={account._id} value={account._id}>
                                    {account.bankName} - {account.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('investments.form.allocationSubAccount')}
                              </label>
                              {!allocation.account ? (
                                <div className="p-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {t('investments.form.selectAccountFirst')}
                                  </p>
                                </div>
                              ) : accountSubAccounts.length === 0 ? (
                                <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                                    {t('investments.form.noInvestmentSubAccounts')}
                                  </p>
                                </div>
                              ) : (
                                <select
                                  className="input-field"
                                  value={allocation.subAccount}
                                  onChange={(e) => {
                                    const newSubAccount = e.target.value;
                                    updateAllocation(index, {
                                      subAccount: newSubAccount,
                                    });
                                    if (index === 0 && newSubAccount) {
                                      const newCurrency =
                                        subAccounts.find((sa) => sa._id === newSubAccount)
                                          ?.currency || formData.currency;
                                      setFormData((prev) => ({
                                        ...prev,
                                        currency: newCurrency,
                                      }));
                                    }
                                  }}
                                >
                                  <option value="">
                                    {t('investments.form.allocationSelectSubAccount')}
                                  </option>
                                  {accountSubAccounts.map((subAccount) => (
                                    <option key={subAccount._id} value={subAccount._id}>
                                      {subAccount.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('investments.form.allocationAmount')}{' '}
                                <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input-field"
                                value={allocation.amount}
                                onChange={(e) =>
                                  updateAllocation(index, {
                                    amount: Number(e.target.value),
                                  })
                                }
                                required
                              />
                            </div>
                          </div>

                          {(formData.allocations || []).length > 1 && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveAllocation(index)}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline"
                              >
                                {t('investments.form.removeAllocation')}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {t('investments.form.allocationsTotal')}:{' '}
                        {new Intl.NumberFormat('es-ES', {
                          style: 'currency',
                          currency: formData.currency || 'EUR',
                        }).format(totalAllocatedAmount || 0)}
                      </span>
                      <span>
                        {t('investments.form.summary.investedAmount')}{' '}
                        {new Intl.NumberFormat('es-ES', {
                          style: 'currency',
                          currency: formData.currency || 'EUR',
                        }).format(investmentAmount || 0)}
                      </span>
                      {allocationsMismatch && (
                        <span className="text-red-600 dark:text-red-400">
                          {t('investments.form.allocationsMismatch')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sección: Información Básica */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {t('investments.form.basicInfo')}
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('investments.form.investmentNameRequired')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('investments.form.investmentTypeRequired')}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="input-field"
                      value={formData.isAutomatedPortfolio ? 'automated_portfolio' : formData.type}
                      onChange={(e) => {
                        const selectedValue = e.target.value;
                        const isAutomated = selectedValue === 'automated_portfolio';
                        // Si cambiamos a índice, reseteamos preset seleccionado
                        const nextType = isAutomated ? 'fund' : selectedValue;
                        setFormData({
                          ...formData,
                          type: nextType,
                          isAutomatedPortfolio: isAutomated,
                          purchasePrice: isAutomated ? 0 : formData.purchasePrice,
                        });
                        if (nextType !== 'index') {
                          setSelectedIndexPreset('');
                        }
                      }}
                      required
                    >
                      <option value="stock">{t('investments.investmentTypes.stock')}</option>
                      <option value="index">{t('investments.investmentTypes.index')}</option>
                      <option value="bond">{t('investments.investmentTypes.bond')}</option>
                      <option value="crypto">{t('investments.investmentTypes.crypto')}</option>
                      <option value="fund">{t('investments.investmentTypes.fund')}</option>
                      <option value="etf">{t('investments.investmentTypes.etf')}</option>
                      <option value="automated_portfolio">
                        {t('investments.investmentTypes.automatedPortfolio')}
                      </option>
                      <option value="other">{t('investments.investmentTypes.other')}</option>
                    </select>
                  </div>
                  {formData.type === 'index' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.indexPresets.label')}
                      </label>
                      <select
                        className="input-field"
                        value={selectedIndexPreset}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedIndexPreset(id);
                          const preset = indexPresets.find((p) => p.id === id);
                          if (preset) {
                            setFormData((prev) => ({
                              ...prev,
                              type: 'index',
                              name: prev.name || preset.label,
                              symbol: preset.symbol,
                              currency: preset.currency || prev.currency,
                            }));
                          }
                        }}
                      >
                        <option value="">{t('investments.indexPresets.none')}</option>
                        {indexPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('investments.indexPresets.help')}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Símbolo <span className="text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={formData.symbol}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          symbol: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder={t('investments.form.symbolPlaceholder')}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Ticker o símbolo de la inversión (Ej: AAPL, BTC, NXT.MC)
                    </p>
                  </div>
                  {(formData.type === 'fund' || formData.type === 'bond') &&
                    !formData.isAutomatedPortfolio && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          ISIN <span className="text-gray-400">(opcional)</span>
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={formData.isin}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              isin: e.target.value.toUpperCase().replace(/\s/g, ''),
                            })
                          }
                          placeholder={t('investments.form.isinPlaceholder')}
                          maxLength={12}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Código ISIN para fondos de inversión y bonos (12 caracteres). Si no tienes
                          símbolo, el sistema intentará buscar por ISIN o nombre.
                          <br />
                          <span className="text-amber-600 dark:text-amber-400">
                            Nota: Las carteras automatizadas no tienen ISIN.
                          </span>
                        </p>
                      </div>
                    )}
                  {!formData.isAutomatedPortfolio && (
                    <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
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
                            purchasePrice: isAutomated ? 0 : formData.purchasePrice,
                          });
                        }}
                      />
                      <label
                        htmlFor="isAutomatedPortfolio"
                        className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        {t('investments.form.noUnitPurchasePrice')}
                      </label>
                    </div>
                  )}
                  {formData.isAutomatedPortfolio && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.form.platformUrl')}{' '}
                        <span className="text-gray-400">{t('common.optional')}</span>
                      </label>
                      <input
                        type="url"
                        className="input-field"
                        value={formData.platformUrl}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            platformUrl: e.target.value,
                          })
                        }
                        placeholder={t('investments.form.platformUrlPlaceholder')}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('investments.form.platformUrlDescription')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sección: Datos Financieros */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    {t('investments.form.financialData')}
                  </h3>
                  {formData.isAutomatedPortfolio ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('investments.form.investedAmount')}{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          <input
                            type="number"
                            step="0.01"
                            className="input-field col-span-3"
                            value={formData.quantity}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                quantity: parseFloat(e.target.value),
                              })
                            }
                            required
                            placeholder="0.00"
                          />
                          <select
                            className="input-field"
                            value={formData.currency}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                currency: e.target.value,
                              })
                            }
                          >
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                          </select>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {t('investments.form.investedAmountDescriptionAutomated')}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('investments.form.currentAmountRequired')}{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          <input
                            type="number"
                            step="0.01"
                            className="input-field col-span-3"
                            value={formData.currentPrice}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                currentPrice: parseFloat(e.target.value),
                              })
                            }
                            required
                            placeholder="0.00"
                          />
                          <select
                            className="input-field"
                            value={formData.currency}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                currency: e.target.value,
                              })
                            }
                            disabled
                          >
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                          </select>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {t('investments.form.currentAmountDescriptionAutomated')}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Modo de entrada: por participaciones+precio o por importe total */}
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('investments.form.howToEnterAmount')}
                        </span>
                        <div className="flex flex-wrap gap-4">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="entryMode"
                              checked={formData.entryMode === 'by_units'}
                              onChange={() =>
                                setFormData({
                                  ...formData,
                                  entryMode: 'by_units',
                                  totalInvested: formData.quantity * formData.purchasePrice || 0,
                                })
                              }
                              className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {t('investments.form.entryByUnits')}
                            </span>
                          </label>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="entryMode"
                              checked={formData.entryMode === 'by_total'}
                              onChange={() =>
                                setFormData({
                                  ...formData,
                                  entryMode: 'by_total',
                                  totalInvested: formData.quantity * formData.purchasePrice || 0,
                                })
                              }
                              className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {t('investments.form.entryByTotal')}
                            </span>
                          </label>
                        </div>
                      </div>

                      {formData.entryMode === 'by_units' ? (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.form.unitsOrShares')}{' '}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              className="input-field"
                              value={formData.quantity === 0 ? '' : formData.quantity}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  quantity: parseFloat(e.target.value) || 0,
                                })
                              }
                              required={formData.entryMode === 'by_units'}
                              placeholder={t('investments.form.unitsOrSharesPlaceholder')}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {t('investments.form.unitsOrSharesDescription')}
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.form.purchasePricePerUnit')}{' '}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              className="input-field"
                              value={formData.purchasePrice === 0 ? '' : formData.purchasePrice}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  purchasePrice: parseFloat(e.target.value) || 0,
                                })
                              }
                              required={formData.entryMode === 'by_units'}
                              placeholder="0.0000"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {t('investments.form.purchasePricePerUnitDescription')}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.form.totalAmountInvested')}{' '}
                              <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="input-field col-span-3"
                                value={formData.totalInvested === 0 ? '' : formData.totalInvested}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    totalInvested: parseFloat(e.target.value) || 0,
                                  })
                                }
                                required={formData.entryMode === 'by_total'}
                                placeholder="0.00"
                              />
                              <select
                                className="input-field"
                                value={formData.currency}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    currency: e.target.value,
                                  })
                                }
                              >
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                                <option value="GBP">GBP</option>
                              </select>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {t('investments.form.totalAmountInvestedDescription')}
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.form.purchasePricePerUnit')}{' '}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              className="input-field"
                              value={formData.purchasePrice === 0 ? '' : formData.purchasePrice}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  purchasePrice: parseFloat(e.target.value) || 0,
                                })
                              }
                              required={formData.entryMode === 'by_total'}
                              placeholder="0.0000"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {t('investments.form.purchasePricePerUnitForTotal')}
                            </p>
                          </div>
                        </>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('investments.form.currentPriceRequired')}{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            className="input-field"
                            value={formData.currentPrice === 0 ? '' : formData.currentPrice}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                currentPrice: parseFloat(e.target.value) || 0,
                              })
                            }
                            required
                            placeholder="0.0000"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {t('investments.form.currentPriceDescription')}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('investments.form.currencyRequired')}{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <select
                            className="input-field"
                            value={formData.currency}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                currency: e.target.value,
                              })
                            }
                          >
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                          </select>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {t('investments.form.currencyDescription')}
                          </p>
                        </div>
                      </div>
                      {/* Resumen financiero */}
                      {(() => {
                        const isAutomated = formData.isAutomatedPortfolio;
                        const effectiveQuantity =
                          formData.entryMode === 'by_total' &&
                          formData.totalInvested > 0 &&
                          formData.purchasePrice > 0
                            ? formData.totalInvested / formData.purchasePrice
                            : formData.quantity;
                        const hasValidData = isAutomated
                          ? formData.purchasePrice > 0 && formData.currentPrice > 0
                          : formData.currentPrice > 0 &&
                            (formData.entryMode === 'by_total'
                              ? formData.totalInvested > 0 && formData.purchasePrice > 0
                              : formData.quantity > 0);

                        if (!hasValidData) return null;

                        if (isAutomated) {
                          // Resumen para carteras automatizadas
                          const profitLoss = formData.currentPrice - formData.purchasePrice;
                          const profitLossPercent =
                            formData.purchasePrice > 0
                              ? ((formData.currentPrice - formData.purchasePrice) /
                                  formData.purchasePrice) *
                                100
                              : 0;
                          return (
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {t('investments.form.summary.currentAmount')}:
                                </span>
                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                  {new Intl.NumberFormat('es-ES', {
                                    style: 'currency',
                                    currency: formData.currency || 'EUR',
                                  }).format(formData.currentPrice)}
                                </span>
                              </div>
                              <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {t('investments.form.summary.investedAmount')}:
                                  </span>
                                  <span className="font-medium text-gray-700 dark:text-gray-300">
                                    {new Intl.NumberFormat('es-ES', {
                                      style: 'currency',
                                      currency: formData.currency || 'EUR',
                                    }).format(formData.purchasePrice)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs mt-1">
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {t('investments.detail.profitLoss')}:
                                  </span>
                                  <span
                                    className={`font-semibold ${profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                  >
                                    {profitLoss >= 0 ? '+' : ''}
                                    {new Intl.NumberFormat('es-ES', {
                                      style: 'currency',
                                      currency: formData.currency || 'EUR',
                                    }).format(profitLoss)}{' '}
                                    ({profitLossPercent >= 0 ? '+' : ''}
                                    {profitLossPercent.toFixed(2)}%)
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        } else {
                          // Resumen para inversiones normales
                          const investedCapital =
                            formData.entryMode === 'by_total' && formData.totalInvested > 0
                              ? formData.totalInvested
                              : effectiveQuantity * formData.purchasePrice;
                          return (
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {t('investments.form.summary.calculatedTotal')}
                                </span>
                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                  {new Intl.NumberFormat('es-ES', {
                                    style: 'currency',
                                    currency: formData.currency || 'EUR',
                                  }).format(effectiveQuantity * formData.currentPrice)}
                                </span>
                              </div>
                              {formData.purchasePrice > 0 && (
                                <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-400">
                                      {t('investments.form.summary.investedCapital')}
                                    </span>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">
                                      {new Intl.NumberFormat('es-ES', {
                                        style: 'currency',
                                        currency: formData.currency || 'EUR',
                                      }).format(investedCapital)}
                                    </span>
                                  </div>
                                  {formData.entryMode === 'by_total' && effectiveQuantity > 0 && (
                                    <div className="flex items-center justify-between text-xs mt-0.5">
                                      <span className="text-gray-600 dark:text-gray-400">
                                        {t('investments.form.summary.unitsCalculated')}
                                      </span>
                                      <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {effectiveQuantity.toLocaleString('es-ES', {
                                          maximumFractionDigits: 4,
                                        })}{' '}
                                        {t('investments.form.summary.units')}
                                      </span>
                                    </div>
                                  )}
                                  {(() => {
                                    const profitLoss =
                                      (formData.currentPrice - formData.purchasePrice) *
                                      effectiveQuantity;
                                    const profitLossPercent =
                                      formData.purchasePrice > 0
                                        ? ((formData.currentPrice - formData.purchasePrice) /
                                            formData.purchasePrice) *
                                          100
                                        : 0;
                                    return (
                                      <div className="flex items-center justify-between text-xs mt-1">
                                        <span className="text-gray-600 dark:text-gray-400">
                                          {t('investments.detail.profitLoss')}:
                                        </span>
                                        <span
                                          className={`font-semibold ${profitLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                        >
                                          {profitLoss >= 0 ? '+' : ''}
                                          {new Intl.NumberFormat('es-ES', {
                                            style: 'currency',
                                            currency: formData.currency || 'EUR',
                                          }).format(profitLoss)}{' '}
                                          ({profitLossPercent >= 0 ? '+' : ''}
                                          {profitLossPercent.toFixed(2)}%)
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        }
                      })()}
                    </>
                  )}
                </div>

                {/* Sección: Fechas y Clasificación */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Fechas y Clasificación
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Fecha de Compra <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      selected={formData.purchaseDate ? new Date(formData.purchaseDate) : null}
                      onChange={(date) => {
                        if (date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          setFormData({
                            ...formData,
                            purchaseDate: `${year}-${month}-${day}`,
                          });
                        } else {
                          setFormData({ ...formData, purchaseDate: '' });
                        }
                      }}
                      dateFormat="dd/MM/yyyy"
                      locale={es}
                      className="input-field w-full"
                      placeholderText="Selecciona una fecha"
                      maxDate={new Date()}
                      required
                      showYearDropdown
                      showMonthDropdown
                      dropdownMode="select"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Clase de Activo <span className="text-red-500">*</span>
                    </label>
                    <select
                      className="input-field"
                      value={formData.assetClass}
                      onChange={(e) => {
                        const newAssetClass = e.target.value;
                        if (newAssetClass === 'fixed_income') {
                          setFormData({
                            ...formData,
                            assetClass: newAssetClass,
                            fixedIncomePercentage: 100,
                            variableIncomePercentage: 0,
                            fixedIncomeSubtype: formData.fixedIncomeSubtype || '',
                          });
                        } else if (newAssetClass === 'variable_income') {
                          setFormData({
                            ...formData,
                            assetClass: newAssetClass,
                            fixedIncomePercentage: 0,
                            variableIncomePercentage: 100,
                          });
                        } else {
                          setFormData({ ...formData, assetClass: newAssetClass });
                        }
                      }}
                      required
                    >
                      <option value="fixed_income">
                        {t('investments.form.assetClasses.fixedIncome')}
                      </option>
                      <option value="variable_income">
                        {t('investments.form.assetClasses.variableIncome')}
                      </option>
                      <option value="mixed">{t('investments.form.assetClasses.mixed')}</option>
                    </select>
                  </div>
                  {formData.assetClass === 'fixed_income' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.form.fixedIncomeSubtype')}
                      </label>
                      <select
                        className="input-field"
                        value={formData.fixedIncomeSubtype}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            fixedIncomeSubtype: e.target.value,
                          })
                        }
                      >
                        <option value="">{t('investments.form.fixedIncomeSubtypeOptional')}</option>
                        <option value="short">
                          {t('investments.form.fixedIncomeSubtypes.short')}
                        </option>
                        <option value="medium">
                          {t('investments.form.fixedIncomeSubtypes.medium')}
                        </option>
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isAlternative"
                      checked={formData.isAlternative}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isAlternative: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label
                      htmlFor="isAlternative"
                      className="text-sm text-gray-700 dark:text-gray-300"
                    >
                      {t('investments.form.alternative')}
                    </label>
                  </div>
                  {formData.assetClass === 'mixed' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          % {t('investments.assetClassLabels.fixedIncome')}
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
                            setFormData({
                              ...formData,
                              fixedIncomePercentage: fixed,
                              variableIncomePercentage: variable,
                            });
                          }}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          % {t('investments.assetClassLabels.variableIncome')}
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
                            setFormData({
                              ...formData,
                              variableIncomePercentage: variable,
                              fixedIncomePercentage: fixed,
                            });
                          }}
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sección: Información Adicional */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Información Adicional
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notas <span className="text-gray-400">(opcional)</span>
                    </label>
                    <textarea
                      className="input-field"
                      rows="3"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder={t('investments.form.notesPlaceholder')}
                    />
                  </div>

                  {/* DCA (Dollar Cost Averaging) */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        id="dcaEnabled"
                        checked={formData.dcaEnabled}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            dcaEnabled: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <label
                        htmlFor="dcaEnabled"
                        className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        {t('investments.dca.enable')}
                      </label>
                    </div>
                    {formData.dcaEnabled && (
                      <div className="space-y-3 pl-6 border-l-2 border-blue-200 dark:border-blue-800">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.dca.amountPerPeriod')}{' '}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              className="input-field"
                              value={formData.dcaAmount}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  dcaAmount: parseFloat(e.target.value) || 0,
                                })
                              }
                              required={formData.dcaEnabled}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.dca.frequency')}{' '}
                              <span className="text-red-500">*</span>
                            </label>
                            <select
                              className="input-field"
                              value={formData.dcaFrequency}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  dcaFrequency: e.target.value,
                                })
                              }
                              required={formData.dcaEnabled}
                            >
                              <option value="daily">
                                {t('investments.dca.frequencies.daily')}
                              </option>
                              <option value="weekly">
                                {t('investments.dca.frequencies.weekly')}
                              </option>
                              <option value="biweekly">
                                {t('investments.dca.frequencies.biweekly')}
                              </option>
                              <option value="monthly">
                                {t('investments.dca.frequencies.monthly')}
                              </option>
                              <option value="quarterly">
                                {t('investments.dca.frequencies.quarterly')}
                              </option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.dca.startDate')}{' '}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              className="input-field"
                              value={formData.dcaStartDate}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  dcaStartDate: e.target.value,
                                })
                              }
                              required={formData.dcaEnabled}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {t('investments.dca.endDate')}{' '}
                              <span className="text-gray-400">{t('investments.dca.optional')}</span>
                            </label>
                            <input
                              type="date"
                              className="input-field"
                              value={formData.dcaEndDate}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  dcaEndDate: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('investments.dca.description')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button type="submit" className="flex-1 btn-primary">
                    {editingInvestment ? 'Actualizar' : 'Crear'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="flex-1 btn-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal para actualizar valor */}
      {showUpdateModal &&
        selectedInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            style={{ zIndex: 10000 }}
            onClick={() => setShowUpdateModal(false)}
          >
            <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {t('investments.modals.updateValue.title', {
                  name: selectedInvestment.name,
                })}
              </h2>
              {selectedInvestment.isAutomatedPortfolio && selectedInvestment.platformUrl && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    <strong>{t('investments.modals.updateValue.tip')}</strong>{' '}
                    {t('investments.modals.updateValue.tipText')}
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={updateFormData.date}
                    onChange={(e) =>
                      setUpdateFormData({
                        ...updateFormData,
                        date: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                {selectedInvestment.isAutomatedPortfolio ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.modals.updateValue.currentTotalValue')}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-field"
                        value={updateFormData.currentPrice}
                        onChange={(e) =>
                          setUpdateFormData({
                            ...updateFormData,
                            currentPrice: parseFloat(e.target.value),
                          })
                        }
                        required
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Ingresa el valor total actual que ves en la plataforma (ej: MyInvestor,
                        Indexa Capital, etc.)
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">Monto invertido:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: selectedInvestment.currency,
                          }).format(selectedInvestment.quantity)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Ganancia/Pérdida:</span>
                        <span
                          className={`font-medium ${updateFormData.currentPrice - selectedInvestment.quantity >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                        >
                          {formatPrice(
                            updateFormData.currentPrice - selectedInvestment.quantity,
                            selectedInvestment.currency
                          )}{' '}
                          (
                          {(
                            ((updateFormData.currentPrice - selectedInvestment.quantity) /
                              selectedInvestment.quantity) *
                            100
                          ).toFixed(2)}
                          %)
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        className="input-field"
                        value={updateFormData.quantity}
                        onChange={(e) =>
                          setUpdateFormData({
                            ...updateFormData,
                            quantity: parseFloat(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Precio Actual
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        className="input-field"
                        value={updateFormData.currentPrice}
                        onChange={(e) =>
                          setUpdateFormData({
                            ...updateFormData,
                            currentPrice: parseFloat(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas (opcional)
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={updateFormData.notes}
                    onChange={(e) =>
                      setUpdateFormData({
                        ...updateFormData,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex gap-3 pt-4 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowUpdateModal(false)}
                    className="btn-secondary px-4"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary px-4">
                    Actualizar
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal para ver historial */}
      {showHistoryModal &&
        selectedInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            style={{ zIndex: 10000 }}
            onClick={() => setShowHistoryModal(false)}
          >
            <div className="modal-content max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {t('investments.actions.history')} - {selectedInvestment.name}
                </h2>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

              {historyLoading ? (
                <LoadingSpinner message={t('common.loading')} />
              ) : investmentHistory.length > 0 ? (
                <>
                  <div className="mb-6" style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={investmentHistory.map((h) => ({
                          date: new Date(h.date).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                          }),
                          value: h.totalValue,
                          price: h.currentPrice,
                        }))}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="historyValueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
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
                          height={60}
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
                              currency: selectedInvestment.currency,
                              notation: 'compact',
                              maximumFractionDigits: 0,
                            }).format(value)
                          }
                          width={52}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => (
                            <ChartTooltip
                              active={active}
                              payload={payload}
                              label={label}
                              labelLabel={t('investments.detail.date')}
                              valueFormatter={(v) =>
                                new Intl.NumberFormat('es-ES', {
                                  style: 'currency',
                                  currency: selectedInvestment.currency,
                                }).format(v)
                              }
                              isDark={isDark}
                            />
                          )}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="Valor Total"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          fill="url(#historyValueGradient)"
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 2, fill: 'white' }}
                          isAnimationActive
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 text-gray-700 dark:text-gray-300">Fecha</th>
                          <th className="text-left py-2 text-gray-700 dark:text-gray-300">
                            Operación
                          </th>
                          {!selectedInvestment.isAutomatedPortfolio && (
                            <th className="text-right py-2 text-gray-700 dark:text-gray-300">
                              Cantidad
                            </th>
                          )}
                          <th className="text-right py-2 text-gray-700 dark:text-gray-300">
                            {selectedInvestment.isAutomatedPortfolio
                              ? 'Valor Total'
                              : 'Precio Unitario'}
                          </th>
                          <th className="text-right py-2 text-gray-700 dark:text-gray-300">
                            Valor Total
                          </th>
                          {investmentHistory.some((h) => h.notes) && (
                            <th className="text-left py-2 text-gray-700 dark:text-gray-300">
                              Notas
                            </th>
                          )}
                          <th className="text-center py-2 text-gray-700 dark:text-gray-300">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {investmentHistory.map((entry) => (
                          <tr
                            key={entry._id}
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <td className="py-2 text-gray-600 dark:text-gray-400">
                              {new Date(entry.date).toLocaleDateString('es-ES', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="py-2">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  entry.operation === 'creation'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    : entry.operation === 'add'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                      : entry.operation === 'withdraw'
                                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
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
                                currency: selectedInvestment.currency,
                              }).format(entry.totalValue)}
                            </td>
                            {investmentHistory.some((h) => h.notes) && (
                              <td className="py-2 text-gray-500 dark:text-gray-400 text-sm">
                                {entry.notes || '-'}
                              </td>
                            )}
                            <td className="py-2">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEditHistoryEntry(entry)}
                                  className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                  title={t('investments.actions.edit')}
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteHistoryEntry(entry._id)}
                                  className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                  title={t('investments.actions.delete')}
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
                  <p className="mb-2 font-medium">
                    No hay historial registrado para esta inversión.
                  </p>
                  <p className="text-sm mb-2">El historial se crea automáticamente cuando:</p>
                  <ul className="text-sm mt-2 list-disc list-inside space-y-1">
                    <li>Se crea una nueva inversión</li>
                    <li>Se añade capital a la inversión</li>
                    <li>Se retira capital de la inversión</li>
                    <li>Se actualiza manualmente el valor</li>
                  </ul>
                  <p className="text-xs mt-4 text-gray-400 dark:text-gray-500">
                    Si esta inversión fue creada antes de implementar el historial, puedes crear una
                    entrada manual usando el botón "Actualizar" de la inversión.
                  </p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Modal para añadir a inversión */}
      {showAddModal &&
        selectedInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            onClick={() => setShowAddModal(false)}
          >
            <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {t('investments.modals.addCapital.title', {
                  name: selectedInvestment.name,
                })}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {selectedInvestment.isAutomatedPortfolio
                  ? t('investments.modals.addCapital.descriptionAutomated')
                  : t('investments.modals.addCapital.description')}
              </p>
              {selectedInvestment.isAutomatedPortfolio ? (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">
                      {t('investments.modals.addCapital.currentCapital')}
                    </span>{' '}
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: selectedInvestment.currency,
                    }).format(selectedInvestment.quantity)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t('investments.modals.addCapital.currentValue')}:{' '}
                    {formatPrice(selectedInvestment.currentPrice, selectedInvestment.currency)}
                  </p>
                </div>
              ) : (
                selectedInvestment.averagePurchasePrice && (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">
                        {t('investments.modals.addCapital.currentAveragePrice')}:
                      </span>{' '}
                      {formatPrice(
                        selectedInvestment.averagePurchasePrice,
                        selectedInvestment.currency
                      )}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t('investments.modals.addCapital.currentQuantity', {
                        quantity: selectedInvestment.quantity,
                      })}
                    </p>
                  </div>
                )
              )}
              <form onSubmit={handleSubmitAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={addFormData.date}
                    onChange={(e) => setAddFormData({ ...addFormData, date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('investments.form.allocationAccount')}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="input-field"
                    value={addFormData.allocationAccount}
                    onChange={(e) =>
                      setAddFormData({
                        ...addFormData,
                        allocationAccount: e.target.value,
                        allocationSubAccount: '',
                      })
                    }
                    required
                  >
                    <option value="">{t('investments.form.allocationSelectAccount')}</option>
                    {accounts.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.bankName} - {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('investments.form.allocationSubAccount')}
                  </label>
                  {!addFormData.allocationAccount ? (
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t('investments.form.selectAccountFirst')}
                      </p>
                    </div>
                  ) : (
                    (() => {
                      const accountSubAccounts = subAccounts.filter(
                        (sa) =>
                          sa.account?._id === addFormData.allocationAccount ||
                          sa.account === addFormData.allocationAccount
                      );
                      if (accountSubAccounts.length === 0) {
                        return (
                          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              {t('investments.form.noInvestmentSubAccounts')}
                            </p>
                          </div>
                        );
                      }
                      return (
                        <select
                          className="input-field"
                          value={addFormData.allocationSubAccount}
                          onChange={(e) =>
                            setAddFormData({
                              ...addFormData,
                              allocationSubAccount: e.target.value,
                            })
                          }
                        >
                          <option value="">
                            {t('investments.form.allocationSelectSubAccount')}
                          </option>
                          {accountSubAccounts.map((subAccount) => (
                            <option key={subAccount._id} value={subAccount._id}>
                              {subAccount.name}
                            </option>
                          ))}
                        </select>
                      );
                    })()
                  )}
                </div>
                {selectedInvestment.isAutomatedPortfolio ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('investments.modals.addCapital.amountToAdd')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={addFormData.quantity}
                      onChange={(e) =>
                        setAddFormData({
                          ...addFormData,
                          quantity: parseFloat(e.target.value),
                        })
                      }
                      required
                      min="0.01"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('investments.modals.addCapital.descriptionAutomated')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.modals.addCapital.quantityToAdd')}
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        className="input-field"
                        value={addFormData.quantity}
                        onChange={(e) =>
                          setAddFormData({
                            ...addFormData,
                            quantity: parseFloat(e.target.value),
                          })
                        }
                        required
                        min="0.0001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.form.purchasePrice')}
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        className="input-field"
                        value={addFormData.price}
                        onChange={(e) =>
                          setAddFormData({
                            ...addFormData,
                            price: parseFloat(e.target.value),
                          })
                        }
                        required
                        min="0.0001"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('investments.form.purchasePriceDescription')}
                      </p>
                    </div>
                  </>
                )}
                {!selectedInvestment.isAutomatedPortfolio && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Precio actual (opcional)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      className="input-field"
                      value={addFormData.currentPrice}
                      onChange={(e) =>
                        setAddFormData({
                          ...addFormData,
                          currentPrice: parseFloat(e.target.value),
                        })
                      }
                      min="0.0001"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Si no lo especificas, se mantendrá el precio actual de la inversión
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas (opcional)
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={addFormData.notes}
                    onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
                  />
                </div>
                {selectedInvestment.isAutomatedPortfolio && addFormData.quantity > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Nuevo capital total:
                    </p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: selectedInvestment.currency,
                      }).format(selectedInvestment.quantity + addFormData.quantity)}
                    </p>
                  </div>
                )}
                {!selectedInvestment.isAutomatedPortfolio &&
                  addFormData.quantity > 0 &&
                  addFormData.price > 0 &&
                  selectedInvestment.averagePurchasePrice && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Nuevo precio medio calculado:
                      </p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">
                        {formatPrice(
                          (selectedInvestment.quantity * selectedInvestment.averagePurchasePrice +
                            addFormData.quantity * addFormData.price) /
                            (selectedInvestment.quantity + addFormData.quantity),
                          selectedInvestment.currency
                        )}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Nueva cantidad total: {selectedInvestment.quantity + addFormData.quantity}{' '}
                        unidades
                      </p>
                    </div>
                  )}
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 btn-primary">
                    {selectedInvestment.isAutomatedPortfolio
                      ? 'Añadir Capital'
                      : 'Añadir a Inversión'}
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
          </div>,
          document.body
        )}

      {/* Modal para vender inversión */}
      {showSellModal &&
        selectedInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            onClick={() => setShowSellModal(false)}
          >
            <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {t('investments.modals.sellInvestment.title', {
                  name: selectedInvestment.name,
                })}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {selectedInvestment.isAutomatedPortfolio
                  ? t('investments.modals.sellInvestment.descriptionAutomated')
                  : t('investments.modals.sellInvestment.description')}
              </p>
              {selectedInvestment.averagePurchasePrice &&
                !selectedInvestment.isAutomatedPortfolio && (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">
                        {t('investments.modals.sellInvestment.availableQuantity', {
                          quantity: selectedInvestment.quantity,
                        })}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      <span className="font-semibold">
                        {t('investments.modals.sellInvestment.averagePurchasePrice')}:
                      </span>{' '}
                      {formatPrice(
                        selectedInvestment.averagePurchasePrice,
                        selectedInvestment.currency
                      )}
                    </p>
                  </div>
                )}
              {selectedInvestment.isAutomatedPortfolio && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">
                      {t('investments.modals.sellInvestment.availableAmount')}:
                    </span>{' '}
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: selectedInvestment.currency,
                    }).format(selectedInvestment.quantity)}
                  </p>
                </div>
              )}
              <form onSubmit={handleSubmitSell} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={sellFormData.date}
                    onChange={(e) => setSellFormData({ ...sellFormData, date: e.target.value })}
                    required
                  />
                </div>
                {(() => {
                  const allocationOptions = getAllocationsFromInvestment(selectedInvestment);
                  const accountIds = [
                    ...new Set(
                      allocationOptions.map((allocation) => allocation.account).filter(Boolean)
                    ),
                  ];
                  const getSubAccountOptions = (accountId) => [
                    ...new Set(
                      allocationOptions
                        .filter((allocation) => allocation.account === accountId)
                        .map((allocation) => allocation.subAccount || '')
                    ),
                  ];

                  if (accountIds.length === 0) {
                    return null;
                  }

                  return (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('investments.form.allocationAccount')}{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <select
                          className="input-field"
                          value={sellFormData.allocationAccount}
                          onChange={(e) =>
                            setSellFormData((prev) => {
                              const nextAccount = e.target.value;
                              const nextSubAccounts = getSubAccountOptions(nextAccount);
                              return {
                                ...prev,
                                allocationAccount: nextAccount,
                                allocationSubAccount: nextSubAccounts[0] || '',
                              };
                            })
                          }
                          required
                        >
                          {accountIds.map((accountId) => (
                            <option key={accountId} value={accountId}>
                              {getAccountLabel(accountId)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('investments.form.allocationSubAccount')}
                        </label>
                        <select
                          className="input-field"
                          value={sellFormData.allocationSubAccount}
                          onChange={(e) =>
                            setSellFormData({
                              ...sellFormData,
                              allocationSubAccount: e.target.value,
                            })
                          }
                        >
                          {getSubAccountOptions(sellFormData.allocationAccount).map(
                            (subAccountId) => (
                              <option key={subAccountId || 'none'} value={subAccountId}>
                                {subAccountId
                                  ? getSubAccountLabel(subAccountId)
                                  : t('investments.form.allocationSelectSubAccount')}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </>
                  );
                })()}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {selectedInvestment.isAutomatedPortfolio
                      ? t('investments.modals.sellInvestment.amountToWithdraw')
                      : t('investments.modals.sellInvestment.quantityToWithdraw')}
                  </label>
                  <input
                    type="number"
                    step={selectedInvestment.isAutomatedPortfolio ? '0.01' : '0.0001'}
                    className="input-field"
                    value={sellFormData.quantity}
                    onChange={(e) =>
                      setSellFormData({
                        ...sellFormData,
                        quantity: parseFloat(e.target.value),
                      })
                    }
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Precio de retiro
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      className="input-field"
                      value={sellFormData.price}
                      onChange={(e) =>
                        setSellFormData({
                          ...sellFormData,
                          price: parseFloat(e.target.value),
                        })
                      }
                      required
                      min="0.0001"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Precio al que retiras las unidades
                    </p>
                  </div>
                )}
                {(selectedInvestment.subAccount ||
                  selectedInvestment.account ||
                  (selectedInvestment.allocations &&
                    selectedInvestment.allocations.length > 0)) && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="returnToSubAccount"
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      checked={sellFormData.returnToSubAccount}
                      onChange={(e) =>
                        setSellFormData({
                          ...sellFormData,
                          returnToSubAccount: e.target.checked,
                        })
                      }
                    />
                    <label
                      htmlFor="returnToSubAccount"
                      className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                    >
                      {selectedInvestment.allocations && selectedInvestment.allocations.length > 1
                        ? t('investments.modals.sellInvestment.returnToCashMultiple')
                        : t('investments.modals.sellInvestment.returnToCashSingle')}
                    </label>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas (opcional)
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={sellFormData.notes}
                    onChange={(e) => setSellFormData({ ...sellFormData, notes: e.target.value })}
                  />
                </div>
                {sellFormData.quantity > 0 && (
                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Monto a retirar:
                    </p>
                    <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      {selectedInvestment.isAutomatedPortfolio
                        ? new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: selectedInvestment.currency,
                          }).format(sellFormData.quantity)
                        : new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: selectedInvestment.currency,
                          }).format(sellFormData.quantity * sellFormData.price)}
                    </p>
                    {!selectedInvestment.isAutomatedPortfolio &&
                      sellFormData.quantity < selectedInvestment.quantity && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {t('investments.modals.sellInvestment.availableQuantity', {
                            quantity: selectedInvestment.quantity - sellFormData.quantity,
                          })}
                        </p>
                      )}
                    {isFullWithdrawal && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-semibold">
                        {t('investments.modals.sellInvestment.useClose')}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={isFullWithdrawal}
                    className={`flex-1 btn-primary bg-orange-600 hover:bg-orange-700 ${
                      isFullWithdrawal ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
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
          </div>,
          document.body
        )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteModal &&
        investmentToDelete &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            onClick={() => setShowDeleteModal(false)}
          >
            <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {t('investments.deleteConfirm.title')}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t('investments.deleteConfirm.message', {
                  name: investmentToDelete.name,
                })}
              </p>

              {/* Calcular monto original invertido */}
              {(() => {
                let originalAmount = 0;
                if (investmentToDelete.isAutomatedPortfolio) {
                  originalAmount = investmentToDelete.quantity;
                } else {
                  const avgPrice =
                    investmentToDelete.averagePurchasePrice || investmentToDelete.purchasePrice;
                  originalAmount = investmentToDelete.quantity * avgPrice;
                }

                return (
                  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {t('investments.deleteConfirm.originalAmount')}
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {originalAmount.toFixed(2)} {investmentToDelete.currency}
                    </p>
                  </div>
                );
              })()}

              <div className="space-y-3">
                <button
                  onClick={handleDelete}
                  className="w-full px-4 py-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors font-medium"
                >
                  {t('investments.deleteConfirm.confirm')}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setInvestmentToDelete(null);
                  }}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal de confirmación de cierre */}
      {showCloseModal &&
        investmentToClose &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            onClick={() => setShowCloseModal(false)}
          >
            <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {t('investments.closeConfirm.title')}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('investments.closeConfirm.description', {
                  name: investmentToClose.name,
                })}
              </p>
              <form onSubmit={handleConfirmClose} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('investments.closeConfirm.dateLabel')}
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={closeFormData.date}
                    onChange={(e) =>
                      setCloseFormData({
                        ...closeFormData,
                        date: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                {!investmentToClose.isAutomatedPortfolio && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('investments.closeConfirm.priceLabel')}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      className="input-field"
                      value={Number.isFinite(closeFormData.price) ? closeFormData.price : ''}
                      onChange={(e) =>
                        setCloseFormData({
                          ...closeFormData,
                          price: parseFloat(e.target.value),
                        })
                      }
                      required
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('investments.closeConfirm.notesLabel')}
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={closeFormData.notes}
                    onChange={(e) =>
                      setCloseFormData({
                        ...closeFormData,
                        notes: e.target.value,
                      })
                    }
                    placeholder={t('investments.closeConfirm.notesPlaceholder')}
                  />
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200">
                  <p className="font-medium">
                    {t('investments.closeConfirm.totalToWithdraw')}{' '}
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: investmentToClose.currency || 'EUR',
                    }).format(
                      investmentToClose.isAutomatedPortfolio
                        ? investmentToClose.currentPrice || 0
                        : (Number(closeFormData.price) || 0) * (investmentToClose.quantity || 0)
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('investments.closeConfirm.cashDestination')}
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="flex-1 btn-primary bg-red-600 hover:bg-red-700">
                    {t('investments.closeConfirm.confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCloseModal(false);
                      setInvestmentToClose(null);
                    }}
                    className="flex-1 btn-secondary"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal para editar entrada del historial */}
      {showEditHistoryModal &&
        editingHistoryEntry &&
        selectedInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            style={{ zIndex: 10001 }}
            onClick={() => setShowEditHistoryModal(false)}
          >
            <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {t('investments.modals.editHistory.title')}
              </h2>
              <form onSubmit={handleSubmitEditHistory} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={editHistoryFormData.date}
                    onChange={(e) =>
                      setEditHistoryFormData({
                        ...editHistoryFormData,
                        date: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('investments.modals.editHistory.operationType')}
                  </label>
                  <select
                    className="input-field"
                    value={editHistoryFormData.operation}
                    onChange={(e) =>
                      setEditHistoryFormData({
                        ...editHistoryFormData,
                        operation: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="creation">
                      {t('investments.modals.editHistory.operations.creation')}
                    </option>
                    <option value="add">
                      {t('investments.modals.editHistory.operations.add')}
                    </option>
                    <option value="withdraw">
                      {t('investments.modals.editHistory.operations.withdraw')}
                    </option>
                    <option value="update">
                      {t('investments.modals.editHistory.operations.update')}
                    </option>
                  </select>
                </div>
                {['creation', 'add', 'withdraw'].includes(editHistoryFormData.operation) && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.form.allocationAccount')}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <select
                        className="input-field"
                        value={editHistoryFormData.account}
                        onChange={(e) =>
                          setEditHistoryFormData({
                            ...editHistoryFormData,
                            account: e.target.value,
                            subAccount: '',
                          })
                        }
                        required
                      >
                        <option value="">{t('investments.form.allocationSelectAccount')}</option>
                        {accounts.map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.bankName} - {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.form.allocationSubAccount')}
                      </label>
                      {!editHistoryFormData.account ? (
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('investments.form.selectAccountFirst')}
                          </p>
                        </div>
                      ) : (
                        (() => {
                          const accountSubAccounts = subAccounts.filter(
                            (sa) =>
                              sa.account?._id === editHistoryFormData.account ||
                              sa.account === editHistoryFormData.account
                          );
                          if (accountSubAccounts.length === 0) {
                            return (
                              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                  {t('investments.form.noInvestmentSubAccounts')}
                                </p>
                              </div>
                            );
                          }
                          return (
                            <select
                              className="input-field"
                              value={editHistoryFormData.subAccount}
                              onChange={(e) =>
                                setEditHistoryFormData({
                                  ...editHistoryFormData,
                                  subAccount: e.target.value,
                                })
                              }
                            >
                              <option value="">
                                {t('investments.form.allocationSelectSubAccount')}
                              </option>
                              {accountSubAccounts.map((subAccount) => (
                                <option key={subAccount._id} value={subAccount._id}>
                                  {subAccount.name}
                                </option>
                              ))}
                            </select>
                          );
                        })()
                      )}
                    </div>
                  </>
                )}
                {!selectedInvestment.isAutomatedPortfolio && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      className="input-field"
                      value={editHistoryFormData.quantity}
                      onChange={(e) =>
                        setEditHistoryFormData({
                          ...editHistoryFormData,
                          quantity: parseFloat(e.target.value),
                        })
                      }
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
                    step={selectedInvestment.isAutomatedPortfolio ? '0.01' : '0.0001'}
                    className="input-field"
                    value={editHistoryFormData.currentPrice}
                    onChange={(e) =>
                      setEditHistoryFormData({
                        ...editHistoryFormData,
                        currentPrice: parseFloat(e.target.value),
                      })
                    }
                    required
                    min="0"
                  />
                </div>
                {(editHistoryFormData.operation === 'add' ||
                  editHistoryFormData.operation === 'withdraw') && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('investments.modals.editHistory.operationAmount')}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-field"
                        value={editHistoryFormData.operationAmount}
                        onChange={(e) =>
                          setEditHistoryFormData({
                            ...editHistoryFormData,
                            operationAmount: parseFloat(e.target.value),
                          })
                        }
                        min="0"
                      />
                    </div>
                    {!selectedInvestment.isAutomatedPortfolio && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t('investments.modals.editHistory.operationPrice')}
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          className="input-field"
                          value={editHistoryFormData.operationPrice}
                          onChange={(e) =>
                            setEditHistoryFormData({
                              ...editHistoryFormData,
                              operationPrice: parseFloat(e.target.value),
                            })
                          }
                          min="0"
                        />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={editHistoryFormData.notes}
                    onChange={(e) =>
                      setEditHistoryFormData({
                        ...editHistoryFormData,
                        notes: e.target.value,
                      })
                    }
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
          </div>,
          document.body
        )}

      {/* Modal de detalles de inversión */}
      {showDetailModal &&
        detailInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
            style={{ zIndex: 9999 }}
            onClick={() => {
              setShowDetailModal(false);
              setDetailInvestment(null);
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {detailInvestment.symbol}
                    </p>
                  )}
                  {detailInvestment.isin && !detailInvestment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ISIN: {detailInvestment.isin}
                    </p>
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
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      {t('investments.detail.basicInfo')}
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('investments.detail.typeLabel')}
                        </span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                          {getTypeLabel(
                            detailInvestment.type,
                            detailInvestment.isAutomatedPortfolio
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('investments.detail.currencyLabel')}
                        </span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                          {detailInvestment.currency}
                        </span>
                      </div>
                      {(detailInvestment.allocations && detailInvestment.allocations.length > 0) ||
                      detailInvestment.account ||
                      detailInvestment.subAccount ? (
                        <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('investments.detail.allocationsLabel')}
                          </span>
                          <div className="mt-2 space-y-1 text-sm">
                            {detailInvestment.allocations &&
                            detailInvestment.allocations.length > 0 ? (
                              (() => {
                                const totalAllocated = detailInvestment.allocations.reduce(
                                  (sum, allocation) => sum + (Number(allocation.amount) || 0),
                                  0
                                );
                                return detailInvestment.allocations.map((allocation, index) => {
                                  const accountName =
                                    allocation.account?.name ||
                                    allocation.account?.bankName ||
                                    'N/A';
                                  const subAccountName = allocation.subAccount?.name || '';
                                  const percentage =
                                    totalAllocated > 0
                                      ? ((allocation.amount || 0) / totalAllocated) * 100
                                      : 0;
                                  return (
                                    <div
                                      key={`allocation-detail-${index}`}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <span className="font-medium text-gray-900 dark:text-gray-100">
                                        {accountName}
                                      </span>
                                      {subAccountName && (
                                        <span className="text-gray-500 dark:text-gray-400">
                                          → {subAccountName}
                                        </span>
                                      )}
                                      <span className="text-gray-500 dark:text-gray-400">
                                        •{' '}
                                        {new Intl.NumberFormat('es-ES', {
                                          style: 'currency',
                                          currency: detailInvestment.currency || 'EUR',
                                        }).format(allocation.amount || 0)}
                                        {totalAllocated > 0 && (
                                          <span className="ml-1">({percentage.toFixed(1)}%)</span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                });
                              })()
                            ) : (
                              <div className="flex items-center gap-2">
                                {detailInvestment.account && (
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {detailInvestment.account.name ||
                                      detailInvestment.account.bankName ||
                                      'N/A'}
                                  </span>
                                )}
                                {detailInvestment.subAccount && (
                                  <span className="text-gray-500 dark:text-gray-400">
                                    → {detailInvestment.subAccount.name}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {detailInvestment.assetClass && (
                        <div className="col-span-2">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('investments.detail.assetClassLabel')}
                          </span>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {detailInvestment.assetClass === 'fixed_income' && (
                              <>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                                  {t('investments.assetClassLabels.fixedIncome')}
                                </span>
                                {getFixedIncomeSubtypeLabel(
                                  detailInvestment.fixedIncomeSubtype
                                ) && (
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getFixedIncomeSubtypeTone(
                                      detailInvestment.fixedIncomeSubtype
                                    )}`}
                                  >
                                    {getFixedIncomeSubtypeLabel(
                                      detailInvestment.fixedIncomeSubtype
                                    )}
                                  </span>
                                )}
                              </>
                            )}
                            {detailInvestment.assetClass === 'variable_income' && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                {t('investments.assetClassLabels.variableIncome')}
                              </span>
                            )}
                            {detailInvestment.assetClass === 'mixed' && (
                              <>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                  {t('investments.assetClassLabels.mixed')}
                                </span>
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                  {t('investments.assetClassLabels.fixedIncomeShort')}:{' '}
                                  {detailInvestment.fixedIncomePercentage || 0}% |
                                  {t('investments.assetClassLabels.variableIncomeShort')}:{' '}
                                  {detailInvestment.variableIncomePercentage || 0}%
                                </span>
                              </>
                            )}
                            {detailInvestment.isAlternative && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                                {t('investments.assetClassLabels.alternative')}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {detailInvestment.isAutomatedPortfolio && (
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
                      {t('investments.detail.financialInfo')}
                    </h3>
                    <div className="space-y-3 text-sm">
                      {detailInvestment.isAutomatedPortfolio ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.amountInvested')}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: detailInvestment.currency,
                              }).format(
                                detailInvestment.status === 'closed' &&
                                  detailInvestment.closeSummary
                                  ? detailInvestment.closeSummary.totalContributed || 0
                                  : detailInvestment.quantity
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.currentValue')}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-gray-100">
                              {formatPrice(
                                detailInvestment.currentPrice,
                                detailInvestment.currency
                              )}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.quantityLabel')}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {t('investments.detail.units', {
                                quantity: detailInvestment.quantity,
                              })}
                            </span>
                          </div>
                          {detailInvestment.averagePurchasePrice && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">
                                {t('investments.detail.averagePurchasePriceLabel')}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatPrice(
                                  detailInvestment.averagePurchasePrice,
                                  detailInvestment.currency
                                )}
                              </span>
                            </div>
                          )}
                          {detailInvestment.purchasePrice &&
                            !detailInvestment.averagePurchasePrice && (
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">
                                  {t('investments.form.purchasePrice')}:
                                </span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {formatPrice(
                                    detailInvestment.purchasePrice,
                                    detailInvestment.currency
                                  )}
                                </span>
                              </div>
                            )}
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.currentPriceLabel')}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(
                                detailInvestment.currentPrice,
                                detailInvestment.currency
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.totalValueLabel')}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: detailInvestment.currency,
                              }).format(detailInvestment.quantity * detailInvestment.currentPrice)}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-400">Ganancia/Pérdida:</span>
                        <span
                          className={`font-bold flex items-center ${
                            calculateProfitLoss(detailInvestment) >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {calculateProfitLoss(detailInvestment) >= 0 ? (
                            <TrendingUp className="h-4 w-4 mr-1" />
                          ) : (
                            <TrendingDown className="h-4 w-4 mr-1" />
                          )}
                          {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: detailInvestment.currency,
                          }).format(calculateProfitLoss(detailInvestment))}
                          <span className="ml-2">
                            ({calculateProfitLossPercentage(detailInvestment).toFixed(2)}
                            %)
                          </span>
                        </span>
                      </div>
                      {detailInvestment.status === 'closed' && detailInvestment.closeSummary && (
                        <>
                          <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.totalContributed')}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: detailInvestment.currency,
                              }).format(detailInvestment.closeSummary.totalContributed || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.totalWithdrawn')}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: detailInvestment.currency,
                              }).format(detailInvestment.closeSummary.totalWithdrawn || 0)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Fechas */}
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      {t('investments.detail.dates')}
                    </h3>
                    <div className="space-y-2 text-sm">
                      {detailInvestment.purchaseDate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('investments.detail.purchaseDateLabel')}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(detailInvestment.purchaseDate).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      )}
                      {detailInvestment.closedAt && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('investments.detail.closedDateLabel')}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(detailInvestment.closedAt).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      )}
                      {detailInvestment.createdAt && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('investments.detail.createdDateLabel')}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(detailInvestment.createdAt).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      )}
                      {detailInvestment.updatedAt && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('investments.detail.lastUpdateLabel')}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(detailInvestment.updatedAt).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      )}
                      {/* Fechas de DCA - Solo si está activado */}
                      {detailInvestment.dcaEnabled && (
                        <>
                          {detailInvestment.dcaStartDate && (
                            <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                              <span className="text-gray-600 dark:text-gray-400">
                                {t('investments.dca.startDate')} (DCA):
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {new Date(detailInvestment.dcaStartDate).toLocaleDateString(
                                  'es-ES'
                                )}
                              </span>
                            </div>
                          )}
                          {detailInvestment.dcaEndDate && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">
                                {t('investments.dca.endDate')} (DCA):
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {new Date(detailInvestment.dcaEndDate).toLocaleDateString('es-ES')}
                              </span>
                            </div>
                          )}
                          {detailInvestment.dcaNextDate && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">
                                {t('investments.dca.nextPurchase')} (DCA):
                              </span>
                              <span className="font-medium text-green-600 dark:text-green-400">
                                {new Date(detailInvestment.dcaNextDate).toLocaleDateString('es-ES')}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {/* Información histórica de DCA si está desactivado pero hubo actividad */}
                      {!detailInvestment.dcaEnabled &&
                        detailInvestmentHistory.length > 0 &&
                        (() => {
                          const dcaPurchases = detailInvestmentHistory
                            .filter(
                              (h) => h.operation === 'add' && h.notes && h.notes.includes('DCA')
                            )
                            .sort((a, b) => new Date(b.date) - new Date(a.date));

                          if (dcaPurchases.length > 0) {
                            const lastDCAPurchase = dcaPurchases[0];

                            return (
                              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                                <span className="text-gray-600 dark:text-gray-400">
                                  {t('investments.detail.lastDCAContribution')}
                                </span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {new Date(lastDCAPurchase.date).toLocaleDateString('es-ES')}
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                    </div>
                  </div>

                  {/* Configuración - Solo mostrar si se puede activar/desactivar actualización automática */}
                  {(detailInvestment.symbol || detailInvestment.isin) &&
                    !detailInvestment.isAutomatedPortfolio &&
                    detailInvestment.status !== 'closed' && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          {t('investments.detail.configuration')}
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.autoUpdateLabel')}
                            </span>
                            <span
                              onClick={async () => {
                                const newValue = !(detailInvestment.autoUpdate !== false);
                                const originalValue = detailInvestment.autoUpdate;
                                // Actualizar estado local inmediatamente
                                setDetailInvestment((prev) => ({
                                  ...prev,
                                  autoUpdate: newValue,
                                }));
                                // Actualizar también en la lista de inversiones
                                setInvestments((prev) =>
                                  prev.map((inv) =>
                                    inv._id === detailInvestment._id
                                      ? { ...inv, autoUpdate: newValue }
                                      : inv
                                  )
                                );
                                try {
                                  await api.patch(
                                    `/investments/${detailInvestment._id}/auto-update`,
                                    {
                                      autoUpdate: newValue,
                                    }
                                  );
                                } catch (error) {
                                  alert(t('investments.modals.errors.updateAutoUpdate'));
                                  // Revertir el cambio si falla
                                  setDetailInvestment((prev) => ({
                                    ...prev,
                                    autoUpdate: originalValue,
                                  }));
                                  setInvestments((prev) =>
                                    prev.map((inv) =>
                                      inv._id === detailInvestment._id
                                        ? { ...inv, autoUpdate: originalValue }
                                        : inv
                                    )
                                  );
                                }
                              }}
                              className={`font-medium cursor-pointer hover:underline transition-colors ${
                                detailInvestment.autoUpdate !== false
                                  ? 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
                                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                              }`}
                            >
                              {detailInvestment.autoUpdate !== false
                                ? t('investments.detail.enabled')
                                : t('investments.detail.disabled')}
                            </span>
                          </div>
                          {detailInvestment.platformUrl && (
                            <div>
                              <span className="text-gray-600 dark:text-gray-400">
                                {t('investments.detail.platform')}
                              </span>
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

                  {/* DCA (Dollar Cost Averaging) */}
                  {detailInvestment.status !== 'closed' && (
                    <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {t('investments.dca.title')}
                        </h3>
                        <button
                          onClick={() => {
                            setEditingDCAInvestment(detailInvestment);
                            setDcaFormData({
                              dcaEnabled: detailInvestment.dcaEnabled || false,
                              dcaAmount: detailInvestment.dcaAmount || 0,
                              dcaFrequency: detailInvestment.dcaFrequency || 'monthly',
                              dcaStartDate: detailInvestment.dcaStartDate
                                ? new Date(detailInvestment.dcaStartDate)
                                    .toISOString()
                                    .split('T')[0]
                                : new Date().toISOString().split('T')[0],
                              dcaEndDate: detailInvestment.dcaEndDate
                                ? new Date(detailInvestment.dcaEndDate).toISOString().split('T')[0]
                                : '',
                            });
                            setShowDCAModal(true);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                          <Edit className="h-3 w-3" />
                          {detailInvestment.dcaEnabled
                            ? t('investments.dca.edit')
                            : t('investments.dca.activate')}
                        </button>
                      </div>
                      {detailInvestment.dcaEnabled ? (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.detail.status')}
                            </span>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              {t('investments.detail.enabled')}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.dca.amountPerPeriod')}:
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: detailInvestment.currency || 'EUR',
                              }).format(detailInvestment.dcaAmount || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('investments.dca.frequency')}:
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {t(`investments.dca.frequencies.${detailInvestment.dcaFrequency}`)}
                            </span>
                          </div>
                          {/* Total capital aportado con DCA */}
                          {detailInvestmentHistory.length > 0 &&
                            (() => {
                              const dcaPurchases = detailInvestmentHistory
                                .filter(
                                  (h) => h.operation === 'add' && h.notes && h.notes.includes('DCA')
                                )
                                .reduce((sum, h) => sum + (h.operationAmount || 0), 0);

                              if (dcaPurchases > 0) {
                                return (
                                  <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                                    <span className="text-gray-600 dark:text-gray-400">
                                      Total aportado:
                                    </span>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                      {new Intl.NumberFormat('es-ES', {
                                        style: 'currency',
                                        currency: detailInvestment.currency || 'EUR',
                                      }).format(dcaPurchases)}
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <div className="text-gray-500 dark:text-gray-400">
                            {t('investments.detail.disabled')}
                          </div>
                          {/* Mostrar total aportado si hubo actividad previa */}
                          {detailInvestmentHistory.length > 0 &&
                            (() => {
                              const dcaPurchases = detailInvestmentHistory
                                .filter(
                                  (h) => h.operation === 'add' && h.notes && h.notes.includes('DCA')
                                )
                                .reduce((sum, h) => sum + (h.operationAmount || 0), 0);

                              if (dcaPurchases > 0) {
                                return (
                                  <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                                    <span className="text-gray-600 dark:text-gray-400">
                                      {t('investments.detail.totalContributed')}
                                    </span>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                      {new Intl.NumberFormat('es-ES', {
                                        style: 'currency',
                                        currency: detailInvestment.currency || 'EUR',
                                      }).format(dcaPurchases)}
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notas */}
                  {detailInvestment.notes && (
                    <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        {t('investments.detail.notes')}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {detailInvestment.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Columna derecha */}
                <div className="flex flex-col gap-4 overflow-y-auto pl-2 h-full">
                  {/* Gráfica de evolución del valor */}
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
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
                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
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
                              height={60}
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
                                  currency: detailInvestment.currency,
                                  notation: 'compact',
                                  maximumFractionDigits: 0,
                                }).format(value)
                              }
                              width={52}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => (
                                <ChartTooltip
                                  active={active}
                                  payload={payload}
                                  label={label}
                                  labelLabel={t('investments.detail.date')}
                                  valueFormatter={(v) =>
                                    new Intl.NumberFormat('es-ES', {
                                      style: 'currency',
                                      currency: detailInvestment.currency,
                                    }).format(v)
                                  }
                                  isDark={isDark}
                                />
                              )}
                            />
                            <Area
                              type="monotone"
                              dataKey="value"
                              name="Valor Total"
                              stroke="#0ea5e9"
                              strokeWidth={2}
                              fill="url(#detailValueGradient)"
                              dot={false}
                              activeDot={{
                                r: 4,
                                strokeWidth: 2,
                                fill: 'white',
                              }}
                              isAnimationActive
                              animationDuration={800}
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
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
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
                              height={60}
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
                                  currency: detailInvestment.currency,
                                  notation: 'compact',
                                  maximumFractionDigits: 0,
                                }).format(value)
                              }
                              width={52}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload || !payload.length) return null;

                                const data = payload[0]?.payload;
                                const dailyChange =
                                  data?.dailyChange !== null && data?.dailyChange !== undefined
                                    ? data.dailyChange
                                    : 0;
                                const dailyChangePercent = data?.dailyChangePercent;

                                const formattedChange = new Intl.NumberFormat('es-ES', {
                                  style: 'currency',
                                  currency: detailInvestment.currency,
                                }).format(Math.abs(dailyChange));

                                const bg = isDark
                                  ? 'bg-[#2c2c2e] border-[#404040]'
                                  : 'bg-white border-gray-200';
                                return (
                                  <div
                                    className={`${bg} border rounded-xl shadow-xl px-4 py-3 min-w-[160px]`}
                                  >
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                      {t('investments.detail.date')}: {label}
                                    </p>
                                    <div className="space-y-1">
                                      <div className="flex justify-between items-center gap-4">
                                        <span className="text-sm text-gray-600 dark:text-gray-300">
                                          Cambio Diario:
                                        </span>
                                        <span
                                          className={`text-sm font-semibold ${
                                            dailyChange > 0
                                              ? 'text-green-600 dark:text-green-400'
                                              : dailyChange < 0
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-gray-500 dark:text-gray-400'
                                          }`}
                                        >
                                          {dailyChange > 0 ? '+' : ''}
                                          {dailyChange < 0 ? '-' : ''}
                                          {formattedChange}
                                          {dailyChange === 0 && ' (Sin variación)'}
                                        </span>
                                      </div>
                                      {dailyChangePercent !== null &&
                                      dailyChangePercent !== undefined ? (
                                        <div className="flex justify-between items-center gap-4">
                                          <span className="text-sm text-gray-600 dark:text-gray-300">
                                            Variación:
                                          </span>
                                          <span
                                            className={`text-sm font-semibold ${
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
                                        <div className="flex justify-between items-center gap-4">
                                          <span className="text-sm text-gray-600 dark:text-gray-300">
                                            Variación:
                                          </span>
                                          <span className="text-sm text-gray-500 dark:text-gray-400">
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
                    handleViewHistory(detailInvestment);
                  }}
                  className="flex-1 btn-secondary flex items-center justify-center"
                >
                  <History className="h-4 w-4 mr-2" />
                  Ver Historial
                </button>
                {detailInvestment.status !== 'closed' && (
                  <button
                    onClick={() => {
                      handleUpdateValue(detailInvestment);
                    }}
                    className="flex-1 btn-secondary flex items-center justify-center"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Actualizar
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setDetailInvestment(null);
                    handleDeleteClick(detailInvestment);
                  }}
                  className="flex-1 btn-secondary bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 flex items-center justify-center"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('investments.actions.delete')}
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
          </div>,
          document.body
        )}

      {/* Modal de DCA */}
      {showDCAModal &&
        editingDCAInvestment &&
        createPortal(
          <div
            className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowDCAModal(false)}
          >
            <div className="modal-content max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {t('investments.dca.title')}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {editingDCAInvestment.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDCAModal(false);
                    setEditingDCAInvestment(null);
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors shrink-0"
                  aria-label={t('common.close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {t('investments.dca.description')}
              </p>

              <label className="flex items-start gap-3 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  id="dcaEnabledModal"
                  checked={dcaFormData.dcaEnabled}
                  onChange={(e) =>
                    setDcaFormData({
                      ...dcaFormData,
                      dcaEnabled: e.target.checked,
                    })
                  }
                  className="w-4 h-4 mt-0.5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 shrink-0"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('investments.dca.enable')}
                </span>
              </label>

              {dcaFormData.dcaEnabled && (
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="dcaAmountModal"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                      >
                        {t('investments.dca.amountPerPeriod')}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="dcaAmountModal"
                        type="number"
                        step="0.01"
                        min="0"
                        className="input-field"
                        value={dcaFormData.dcaAmount || ''}
                        onChange={(e) =>
                          setDcaFormData({
                            ...dcaFormData,
                            dcaAmount: parseFloat(e.target.value) || 0,
                          })
                        }
                        required={dcaFormData.dcaEnabled}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="dcaFrequencyModal"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                      >
                        {t('investments.dca.frequency')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="dcaFrequencyModal"
                        className="input-field"
                        value={dcaFormData.dcaFrequency}
                        onChange={(e) =>
                          setDcaFormData({
                            ...dcaFormData,
                            dcaFrequency: e.target.value,
                          })
                        }
                        required={dcaFormData.dcaEnabled}
                      >
                        <option value="daily">{t('investments.dca.frequencies.daily')}</option>
                        <option value="weekly">{t('investments.dca.frequencies.weekly')}</option>
                        <option value="biweekly">
                          {t('investments.dca.frequencies.biweekly')}
                        </option>
                        <option value="monthly">{t('investments.dca.frequencies.monthly')}</option>
                        <option value="quarterly">
                          {t('investments.dca.frequencies.quarterly')}
                        </option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="dcaStartDateModal"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                      >
                        {t('investments.dca.startDate')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="dcaStartDateModal"
                        type="date"
                        className="input-field"
                        value={dcaFormData.dcaStartDate}
                        onChange={(e) =>
                          setDcaFormData({
                            ...dcaFormData,
                            dcaStartDate: e.target.value,
                          })
                        }
                        required={dcaFormData.dcaEnabled}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="dcaEndDateModal"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                      >
                        {t('investments.dca.endDate')}{' '}
                        <span className="text-gray-400 font-normal">
                          {t('investments.dca.optional')}
                        </span>
                      </label>
                      <input
                        id="dcaEndDateModal"
                        type="date"
                        className="input-field"
                        value={dcaFormData.dcaEndDate}
                        onChange={(e) =>
                          setDcaFormData({
                            ...dcaFormData,
                            dcaEndDate: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDCAModal(false);
                    setEditingDCAInvestment(null);
                  }}
                  className="flex-1 btn-secondary"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveDCA}
                  className="flex-1 btn-primary"
                  disabled={
                    dcaFormData.dcaEnabled &&
                    (!dcaFormData.dcaAmount ||
                      !dcaFormData.dcaStartDate ||
                      !dcaFormData.dcaFrequency)
                  }
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Investments;
