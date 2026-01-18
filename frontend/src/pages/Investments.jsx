import { useEffect, useState, useRef } from "react";
import {
  Plus,
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
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { es } from "date-fns/locale";
import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { useTranslation } from "../contexts/TranslationContext";

/**
 * Formatea precios con 4 decimales, pero muestra solo 2 si los dos últimos son 00
 */
const formatPrice = (value, currency = "EUR") => {
  if (value === null || value === undefined || isNaN(value)) {
    return "0,00 €";
  }

  const decimalPart = Math.abs((value * 10000) % 100);
  const hasTrailingZeros = decimalPart === 0;
  const decimals = hasTrailingZeros ? 2 : 4;

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const Investments = () => {
  const { t } = useTranslation();
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
  const [showDCAModal, setShowDCAModal] = useState(false);
  const [editingDCAInvestment, setEditingDCAInvestment] = useState(null);
  const [dcaFormData, setDcaFormData] = useState({
    dcaEnabled: false,
    dcaAmount: 0,
    dcaFrequency: "monthly",
    dcaStartDate: new Date().toISOString().split("T")[0],
    dcaEndDate: "",
  });
  const [investmentHistory, setInvestmentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showEditHistoryModal, setShowEditHistoryModal] = useState(false);
  const [editingHistoryEntry, setEditingHistoryEntry] = useState(null);
  const [editHistoryFormData, setEditHistoryFormData] = useState({
    date: "",
    currentPrice: 0,
    quantity: 0,
    notes: "",
    operation: "update",
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
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [addFormData, setAddFormData] = useState({
    quantity: 0,
    price: 0,
    currentPrice: 0,
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [sellFormData, setSellFormData] = useState({
    quantity: 0,
    price: 0,
    date: new Date().toISOString().split("T")[0],
    notes: "",
    returnToSubAccount: true,
  });
  const [formData, setFormData] = useState({
    account: "",
    subAccount: "",
    name: "",
    type: "stock",
    symbol: "",
    isin: "",
    isAutomatedPortfolio: false,
    quantity: 0,
    purchasePrice: 0,
    currentPrice: 0,
    purchaseDate: new Date().toISOString().split("T")[0],
    currency: "EUR",
    assetClass: "variable_income",
    fixedIncomeSubtype: "",
    fixedIncomePercentage: 0,
    variableIncomePercentage: 100,
    isAlternative: false,
    notes: "",
    platformUrl: "",
    dcaEnabled: false,
    dcaAmount: 0,
    dcaFrequency: "monthly",
    dcaStartDate: new Date().toISOString().split("T")[0],
    dcaEndDate: "",
  });

  // Función para registrar valores diarios de todas las inversiones
  const registerDailyValues = async () => {
    try {
      const lastRegistration = localStorage.getItem(
        "lastDailyValuesRegistration",
      );
      const today = new Date().toDateString();

      // Solo registrar si no se ha registrado hoy
      if (lastRegistration !== today) {
        await api.post("/investment-history/register-daily-values");
        localStorage.setItem("lastDailyValuesRegistration", today);
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
      showEditHistoryModal ||
      showDetailModal ||
      showDCAModal;

    if (isAnyModalOpen) {
      // Guardar la posición actual del scroll
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
    } else {
      // Restaurar el scroll
      const scrollY = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }

    return () => {
      // Limpiar estilos al desmontar
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
    };
  }, [
    showModal,
    showUpdateModal,
    showHistoryModal,
    showAddModal,
    showSellModal,
    showDeleteModal,
    showEditHistoryModal,
    showDetailModal,
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
      5 * 60 * 1000,
    ); // 5 minutos

    // Limpiar el intervalo al desmontar el componente
    return () => clearInterval(autoUpdateInterval);
  }, []); // Sin dependencias para que solo se cree una vez

  const fetchData = async () => {
    try {
      const [investmentsRes, subAccountsRes, accountsRes] = await Promise.all([
        api.get("/investments"),
        api.get("/subaccounts"),
        api.get("/accounts"),
      ]);
      setInvestments(investmentsRes.data);
      setSubAccounts(
        subAccountsRes.data.filter((sub) => sub.type === "investment"),
      );
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
        alert(t("investments.modals.errors.selectAccount"));
        return;
      }

      // Preparar datos para enviar
      const dataToSend = { ...formData };

      if (dataToSend.assetClass === "alternative") {
        dataToSend.assetClass = "variable_income";
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
        if (dataToSend.type === "automated_portfolio") {
          dataToSend.type = "fund";
        }
      }
      // Limpiar subAccount si está vacío
      if (!dataToSend.subAccount) {
        delete dataToSend.subAccount;
      }

      if (dataToSend.assetClass !== "fixed_income") {
        delete dataToSend.fixedIncomeSubtype;
      } else if (!dataToSend.fixedIncomeSubtype) {
        dataToSend.fixedIncomeSubtype = null;
      }

      // Calcular próxima fecha de DCA si está habilitado
      if (
        dataToSend.dcaEnabled &&
        dataToSend.dcaStartDate &&
        dataToSend.dcaFrequency
      ) {
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
            nextDate.setDate(
              nextDate.getDate() + daysToAdd[dataToSend.dcaFrequency],
            );
          }

          // Si hay fecha de fin y la próxima fecha la excede, no establecer próxima fecha
          if (dataToSend.dcaEndDate) {
            const endDate = new Date(dataToSend.dcaEndDate);
            if (nextDate > endDate) {
              dataToSend.dcaNextDate = null;
            } else {
              dataToSend.dcaNextDate = nextDate.toISOString().split("T")[0];
            }
          } else {
            dataToSend.dcaNextDate = nextDate.toISOString().split("T")[0];
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
        await api.post("/investments", dataToSend);
      }
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        t("investments.modals.errors.saveInvestment");
      alert(errorMessage);
    }
  };

  const handleEdit = (investment) => {
    setEditingInvestment(investment);
    setFormData({
      account: investment.account?._id || investment.account || "",
      subAccount: investment.subAccount?._id || investment.subAccount || "",
      name: investment.name,
      type: investment.type,
      symbol: investment.symbol || "",
      isin: investment.isin || "",
      isAutomatedPortfolio: investment.isAutomatedPortfolio || false,
      quantity: investment.quantity,
      purchasePrice: investment.purchasePrice || 0,
      currentPrice: investment.currentPrice,
      purchaseDate: new Date(investment.purchaseDate)
        .toISOString()
        .split("T")[0],
      currency: investment.currency,
      assetClass:
        investment.assetClass === "alternative"
          ? "variable_income"
          : investment.assetClass || "variable_income",
      fixedIncomeSubtype:
        investment.assetClass === "fixed_income"
          ? investment.fixedIncomeSubtype || ""
          : "",
      fixedIncomePercentage: investment.fixedIncomePercentage || 0,
      variableIncomePercentage: investment.variableIncomePercentage || 100,
      isAlternative:
        investment.isAlternative || investment.assetClass === "alternative",
      notes: investment.notes || "",
      platformUrl: investment.platformUrl || "",
      dcaEnabled: investment.dcaEnabled || false,
      dcaAmount: investment.dcaAmount || 0,
      dcaFrequency: investment.dcaFrequency || "monthly",
      dcaStartDate: investment.dcaStartDate
        ? new Date(investment.dcaStartDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      dcaEndDate: investment.dcaEndDate
        ? new Date(investment.dcaEndDate).toISOString().split("T")[0]
        : "",
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
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        t("investments.modals.errors.deleteInvestment");
      alert(errorMessage);
    }
  };

  const handleSaveDCA = async () => {
    if (!editingDCAInvestment) return;

    try {
      const dataToSend = { ...dcaFormData };

      // Calcular próxima fecha de DCA si está habilitado
      if (
        dataToSend.dcaEnabled &&
        dataToSend.dcaStartDate &&
        dataToSend.dcaFrequency
      ) {
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
            nextDate.setDate(
              nextDate.getDate() + daysToAdd[dataToSend.dcaFrequency],
            );
          }

          if (dataToSend.dcaEndDate) {
            const endDate = new Date(dataToSend.dcaEndDate);
            if (nextDate > endDate) {
              dataToSend.dcaNextDate = null;
            } else {
              dataToSend.dcaNextDate = nextDate.toISOString().split("T")[0];
            }
          } else {
            dataToSend.dcaNextDate = nextDate.toISOString().split("T")[0];
          }
        }
      } else if (!dataToSend.dcaEnabled) {
        // Si DCA está deshabilitado, guardar fecha de desactivación si antes estaba activado
        if (editingDCAInvestment.dcaEnabled) {
          dataToSend.dcaDeactivatedDate = new Date()
            .toISOString()
            .split("T")[0];
        }
        // Limpiar campos relacionados pero mantener historial
        dataToSend.dcaAmount = 0;
        dataToSend.dcaFrequency = null;
        dataToSend.dcaStartDate = null;
        dataToSend.dcaEndDate = null;
        dataToSend.dcaNextDate = null;
      } else if (
        dataToSend.dcaEnabled &&
        editingDCAInvestment.dcaEnabled === false
      ) {
        // Si se reactiva el DCA, limpiar fecha de desactivación
        dataToSend.dcaDeactivatedDate = null;
      }

      await api.put(`/investments/${editingDCAInvestment._id}`, dataToSend);

      // Actualizar el estado local de inversiones
      setInvestments((prev) =>
        prev.map((inv) =>
          inv._id === editingDCAInvestment._id
            ? { ...inv, ...dataToSend }
            : inv,
        ),
      );

      // Si el modal de detalle está abierto para esta inversión, actualizarlo también
      if (
        detailInvestment &&
        detailInvestment._id === editingDCAInvestment._id
      ) {
        setDetailInvestment((prev) => ({ ...prev, ...dataToSend }));
      }

      fetchData();
      setShowDCAModal(false);
      setEditingDCAInvestment(null);
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        t("investments.modals.errors.saveDCA");
      alert(errorMessage);
    }
  };

  const handleUpdateValue = (investment) => {
    setSelectedInvestment(investment);
    setUpdateFormData({
      currentPrice: investment.currentPrice,
      quantity: investment.quantity,
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setShowUpdateModal(true);
  };

  const handleSubmitUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/investment-history", {
        investmentId: selectedInvestment._id,
        currentPrice: parseFloat(updateFormData.currentPrice),
        quantity: parseFloat(updateFormData.quantity),
        date: updateFormData.date,
        notes: updateFormData.notes,
        operation: "update",
      });
      fetchData();
      setShowUpdateModal(false);
      setUpdateFormData({
        currentPrice: 0,
        quantity: 0,
        date: new Date().toISOString().split("T")[0],
        notes: "",
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
      const response = await api.get(
        `/investment-history/investment/${investment._id}`,
      );
      setInvestmentHistory(response.data || []);
    } catch (error) {
      alert(
        t("investments.modals.errors.loadHistory", {
          error: error.response?.data?.message || error.message,
        }),
      );
      setInvestmentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleEditHistoryEntry = (entry) => {
    setEditingHistoryEntry(entry);
    setEditHistoryFormData({
      date: new Date(entry.date).toISOString().split("T")[0],
      currentPrice: entry.currentPrice,
      quantity: entry.quantity,
      notes: entry.notes || "",
      operation: entry.operation || "update",
      operationAmount: entry.operationAmount || 0,
      operationPrice: entry.operationPrice || 0,
    });
    setShowEditHistoryModal(true);
  };

  const handleSubmitEditHistory = async (e) => {
    e.preventDefault();
    try {
      await api.put(
        `/investment-history/${editingHistoryEntry._id}`,
        editHistoryFormData,
      );
      // Recargar el historial
      const response = await api.get(
        `/investment-history/investment/${selectedInvestment._id}`,
      );
      setInvestmentHistory(response.data);
      setShowEditHistoryModal(false);
      setEditingHistoryEntry(null);
    } catch (error) {
      alert(t("investments.modals.errors.editHistory"));
    }
  };

  const handleDeleteHistoryEntry = async (entryId) => {
    if (!confirm(t("investments.modals.editHistory.deleteConfirm"))) {
      return;
    }
    try {
      await api.delete(`/investment-history/${entryId}`);
      // Recargar el historial
      const response = await api.get(
        `/investment-history/investment/${selectedInvestment._id}`,
      );
      setInvestmentHistory(response.data);
    } catch (error) {
      alert(t("investments.modals.errors.deleteHistory"));
    }
  };

  const getOperationLabel = (operation) => {
    const labels = {
      creation: "Creación",
      add: t("investments.actions.addCapital"),
      withdraw: "Retirar Capital",
      update: "Actualización",
    };
    return labels[operation] || operation;
  };

  const handleAddToInvestment = (investment) => {
    setSelectedInvestment(investment);
    setAddFormData({
      quantity: 0,
      price: investment.isAutomatedPortfolio ? 0 : investment.currentPrice,
      currentPrice: investment.currentPrice,
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setShowAddModal(true);
  };

  const handleSellInvestment = (investment) => {
    setSelectedInvestment(investment);
    setSellFormData({
      quantity: investment.isAutomatedPortfolio ? investment.quantity : 0,
      price: investment.currentPrice,
      date: new Date().toISOString().split("T")[0],
      notes: "",
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
        date: new Date().toISOString().split("T")[0],
        notes: "",
      });
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Error al añadir a la inversión";
      alert(errorMessage);
    }
  };

  const handleSubmitSell = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post(
        `/investments/${selectedInvestment._id}/sell`,
        {
          quantity: parseFloat(sellFormData.quantity),
          price: parseFloat(sellFormData.price),
          date: sellFormData.date,
          notes: sellFormData.notes,
          returnToSubAccount: sellFormData.returnToSubAccount,
        },
      );

      fetchData();
      setShowSellModal(false);
      setSellFormData({
        quantity: 0,
        price: 0,
        date: new Date().toISOString().split("T")[0],
        notes: "",
        returnToSubAccount: true,
      });

      if (
        response.data.message &&
        response.data.message.includes("completamente")
      ) {
        alert(
          t("investments.modals.errors.withdrawSuccess", {
            amount: new Intl.NumberFormat("es-ES", {
              style: "currency",
              currency: selectedInvestment.currency,
            }).format(response.data.saleAmount),
          }),
        );
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Error al retirar de la inversión";
      alert(errorMessage);
    }
  };

  const resetForm = () => {
    setFormData({
      account: "",
      subAccount: "",
      name: "",
      type: "stock",
      symbol: "",
      isin: "",
      isAutomatedPortfolio: false,
      quantity: 0,
      purchasePrice: 0,
      currentPrice: 0,
      purchaseDate: new Date().toISOString().split("T")[0],
      currency: "EUR",
      assetClass: "variable_income",
      fixedIncomeSubtype: "",
      fixedIncomePercentage: 0,
      variableIncomePercentage: 100,
      isAlternative: false,
      notes: "",
      platformUrl: "",
      dcaEnabled: false,
      dcaAmount: 0,
      dcaFrequency: "monthly",
      dcaStartDate: new Date().toISOString().split("T")[0],
      dcaEndDate: "",
    });
    setEditingInvestment(null);
  };

  const getFixedIncomeSubtypeLabel = (fixedIncomeSubtype) => {
    if (fixedIncomeSubtype === "short") {
      return t("investments.assetClassLabels.fixedIncomeSubtypeShort");
    }
    if (fixedIncomeSubtype === "medium") {
      return t("investments.assetClassLabels.fixedIncomeSubtypeMedium");
    }
    return "";
  };

  const getFixedIncomeSubtypeTone = (fixedIncomeSubtype) => {
    if (fixedIncomeSubtype === "short") {
      return "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200";
    }
    if (fixedIncomeSubtype === "medium") {
      return "bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100";
    }
    return "";
  };

  const getTypeLabel = (type, isAutomatedPortfolio = false) => {
    if (isAutomatedPortfolio) {
      return "Cartera Automatizada";
    }
    const types = {
      stock: "Acción",
      bond: "Bono",
      crypto: "Cripto",
      fund: "Fondo",
      etf: "ETF",
      automated_portfolio: "Cartera Automatizada",
      other: "Otro",
    };
    return types[type] || type;
  };

  const calculateProfitLoss = (investment) => {
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas: valor actual - monto invertido
      return investment.currentPrice - investment.quantity;
    }
    // Para inversiones tradicionales: (precio actual - precio medio compra) * cantidad
    const avgPrice =
      investment.averagePurchasePrice || investment.purchasePrice;
    return (investment.currentPrice - avgPrice) * investment.quantity;
  };

  const calculateProfitLossPercentage = (investment) => {
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas: (valor actual - monto invertido) / monto invertido * 100
      if (investment.quantity === 0) return 0;
      return (
        ((investment.currentPrice - investment.quantity) /
          investment.quantity) *
        100
      );
    }
    // Para inversiones tradicionales: usar precio medio
    const avgPrice =
      investment.averagePurchasePrice || investment.purchasePrice;
    if (!avgPrice || avgPrice === 0) return 0;
    return ((investment.currentPrice - avgPrice) / avgPrice) * 100;
  };

  const handleUpdateAllPrices = async (isAutoUpdate = false) => {
    setUpdatingPrices(true);
    try {
      const response = await api.post("/investments/update-prices");
      const { updated, failed, results } = response.data;

      if (updated > 0) {
        // Recargar los datos
        await fetchData();

        // Solo mostrar mensaje si hay errores y no es actualización automática
        if (failed > 0 && !isAutoUpdate) {
          const failedSymbols = results
            .filter((r) => !r.success)
            .map((r) => {
              const inv = investments.find(
                (i) => (i._id?.toString() || i.id) === r.investmentId,
              );
              return inv?.symbol || inv?.name || "Desconocido";
            });
          alert(
            t("investments.modals.errors.updatePricesSuccess", {
              updated,
              failed,
            }) +
              "\n\n" +
              t("investments.modals.errors.updatePricesFailed", {
                symbols: failedSymbols.join(", "),
              }),
          );
        } else if (failed > 0 && isAutoUpdate) {
          // Para actualizaciones automáticas, solo log en consola
          const failedSymbols = results
            .filter((r) => !r.success)
            .map((r) => {
              const inv = investments.find(
                (i) => (i._id?.toString() || i.id) === r.investmentId,
              );
              return inv?.symbol || inv?.name || "Desconocido";
            });
          // Log silencioso para actualizaciones automáticas
        }
        // Si todo salió bien, no mostrar popup
      } else if (!isAutoUpdate) {
        alert(t("investments.modals.errors.updatePricesError"));
      }
    } catch (error) {
      // Solo mostrar alerta si es actualización manual
      if (!isAutoUpdate) {
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          "Error al actualizar precios";
        alert(
          t("investments.modals.errors.updatePricesErrorDetail", {
            error: errorMessage,
          }),
        );
      }
    } finally {
      setUpdatingPrices(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t("investments.title")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t("investments.subtitle")}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => handleUpdateAllPrices(false)}
            disabled={updatingPrices}
            className="btn-secondary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("investments.updatePricesTooltip")}
          >
            <DollarSign
              className={`h-5 w-5 mr-2 ${updatingPrices ? "animate-spin" : ""}`}
            />
            {updatingPrices
              ? t("investments.updatingPrices")
              : t("investments.updatePrices")}
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            {t("investments.newInvestment")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {investments.map((investment) => {
          const profitLoss = calculateProfitLoss(investment);
          const profitLossPercent = calculateProfitLossPercentage(investment);
          const totalValue = investment.isAutomatedPortfolio
            ? investment.currentPrice
            : investment.quantity * investment.currentPrice;

          return (
            <div
              key={investment._id}
              className="card cursor-pointer hover:shadow-lg transition-shadow flex flex-col h-[405px] p-6"
              onClick={async (e) => {
                // Evitar que se active cuando se hace clic en botones o inputs
                if (
                  e.target.tagName === "BUTTON" ||
                  e.target.tagName === "INPUT" ||
                  e.target.closest("button") ||
                  e.target.closest("input")
                ) {
                  return;
                }
                setDetailInvestment(investment);
                setShowDetailModal(true);
                // Cargar historial y variaciones diarias para las gráficas
                try {
                  const [historyRes, variationsRes] = await Promise.all([
                    api.get(`/investment-history/investment/${investment._id}`),
                    api.get(
                      `/investment-history/investment/${investment._id}/daily-variations`,
                    ),
                  ]);
                  setDetailInvestmentHistory(historyRes.data || []);
                  setDetailDailyVariations(variationsRes.data || []);
                } catch (error) {
                  setDetailInvestmentHistory([]);
                  setDetailDailyVariations([]);
                }
              }}
            >
              <div className="flex items-start justify-between mb-3 flex-shrink-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                      {investment.name}
                    </h3>
                    {investment.isAutomatedPortfolio && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                        {t("investments.investmentTypes.automatedPortfolio")}
                      </span>
                    )}
                    {investment.dcaEnabled && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                        {t("investments.dca.enabled")}
                      </span>
                    )}
                  </div>
                  {investment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {investment.symbol}
                    </p>
                  )}
                  {investment.isin && !investment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ISIN: {investment.isin}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {getTypeLabel(
                      investment.type,
                      investment.isAutomatedPortfolio,
                    )}
                  </p>
                  {investment.assetClass && (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {investment.assetClass === "fixed_income" && (
                        <>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                            {t("investments.assetClassLabels.fixedIncome")}
                          </span>
                          {getFixedIncomeSubtypeLabel(
                            investment.fixedIncomeSubtype,
                          ) && (
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getFixedIncomeSubtypeTone(
                                investment.fixedIncomeSubtype,
                              )}`}
                            >
                              {getFixedIncomeSubtypeLabel(
                                investment.fixedIncomeSubtype,
                              )}
                            </span>
                          )}
                        </>
                      )}
                      {investment.assetClass === "variable_income" && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                          {t("investments.assetClassLabels.variableIncome")}
                        </span>
                      )}
                      {investment.assetClass === "mixed" && (
                        <>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                            {t("investments.assetClassLabels.mixed")}
                          </span>
                          <span className="text-[10px] text-gray-600 dark:text-gray-400">
                            {t("investments.assetClassLabels.fixedIncomeShort")}
                            : {investment.fixedIncomePercentage || 0}% |{" "}
                            {t(
                              "investments.assetClassLabels.variableIncomeShort",
                            )}
                            : {investment.variableIncomePercentage || 0}%
                          </span>
                        </>
                      )}
                      {investment.isAlternative && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                          {t("investments.assetClassLabels.alternative")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Checkbox para actualización automática y DCA */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2 mb-2">
                {/* Checkbox para actualización automática - solo si tiene símbolo o ISIN */}
                {(investment.symbol || investment.isin) &&
                  !investment.isAutomatedPortfolio && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`auto-update-${investment._id}`}
                        checked={investment.autoUpdate !== false}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          try {
                            await api.patch(
                              `/investments/${investment._id}/auto-update`,
                              {
                                autoUpdate: newValue,
                              },
                            );
                            // Actualizar el estado local
                            setInvestments((prev) =>
                              prev.map((inv) =>
                                inv._id === investment._id
                                  ? { ...inv, autoUpdate: newValue }
                                  : inv,
                              ),
                            );
                          } catch (error) {
                            alert(
                              t("investments.modals.errors.updateAutoUpdate"),
                            );
                            // Revertir el cambio en caso de error
                            e.target.checked = !newValue;
                          }
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                      />
                      <label
                        htmlFor={`auto-update-${investment._id}`}
                        className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
                      >
                        {t("investments.automaticUpdate")}
                      </label>
                    </div>
                  )}
                {/* Información de DCA */}
                {investment.dcaEnabled && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 leading-tight">
                    <div className="flex items-center gap-1.5 justify-between">
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          DCA:
                        </span>
                        <span>
                          {new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: investment.currency || "EUR",
                            notation: "compact",
                            maximumFractionDigits: 0,
                          }).format(investment.dcaAmount || 0)}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">
                          ·
                        </span>
                        <span>
                          {t(
                            `investments.dca.frequencies.${investment.dcaFrequency}`,
                          )}
                        </span>
                        {investment.dcaNextDate && (
                          <>
                            <span className="text-gray-400 dark:text-gray-500">
                              ·
                            </span>
                            <span className="text-gray-500 dark:text-gray-500">
                              {t("investments.dca.nextPurchase")}:{" "}
                              {new Date(
                                investment.dcaNextDate,
                              ).toLocaleDateString("es-ES", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDCAInvestment(investment);
                          setDcaFormData({
                            dcaEnabled: investment.dcaEnabled || false,
                            dcaAmount: investment.dcaAmount || 0,
                            dcaFrequency: investment.dcaFrequency || "monthly",
                            dcaStartDate: investment.dcaStartDate
                              ? new Date(investment.dcaStartDate)
                                  .toISOString()
                                  .split("T")[0]
                              : new Date().toISOString().split("T")[0],
                            dcaEndDate: investment.dcaEndDate
                              ? new Date(investment.dcaEndDate)
                                  .toISOString()
                                  .split("T")[0]
                              : "",
                          });
                          setShowDCAModal(true);
                        }}
                        className="ml-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        title={t("investments.dca.edit")}
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
                {/* Botón para activar DCA si no está activado */}
                {!investment.dcaEnabled && (
                  <div className="text-xs">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingDCAInvestment(investment);
                        setDcaFormData({
                          dcaEnabled: false,
                          dcaAmount: 0,
                          dcaFrequency: "monthly",
                          dcaStartDate: new Date().toISOString().split("T")[0],
                          dcaEndDate: "",
                        });
                        setShowDCAModal(true);
                      }}
                      className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium flex items-center gap-1 transition-colors"
                      title={t("investments.dca.activate")}
                    >
                      <Plus className="h-3 w-3" />
                      {t("investments.dca.activate")}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1 min-h-0">
                {investment.isAutomatedPortfolio ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t("investments.form.investedAmount")}:
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: investment.currency,
                        }).format(investment.quantity)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t("investments.detail.currentValue")}:
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatPrice(
                          investment.currentPrice,
                          investment.currency,
                        )}
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
                          {t("investments.actions.viewPlatform")} ↗
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t("investments.cardLabels.quantity")}:
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {investment.quantity}
                      </span>
                    </div>
                    {investment.averagePurchasePrice && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {t("investments.cardLabels.averagePurchasePrice")}:
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {formatPrice(
                            investment.averagePurchasePrice,
                            investment.currency,
                          )}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t("investments.cardLabels.currentPrice")}:
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatPrice(
                          investment.currentPrice,
                          investment.currency,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t("investments.cardLabels.totalValue")}:
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: investment.currency,
                        }).format(totalValue)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t("investments.cardLabels.profitLoss")}:
                  </span>
                  <span
                    className={`text-sm font-bold flex items-center ${
                      profitLoss >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {profitLoss >= 0 ? (
                      <TrendingUp className="h-4 w-4 mr-1" />
                    ) : (
                      <TrendingDown className="h-4 w-4 mr-1" />
                    )}
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: investment.currency,
                    }).format(profitLoss)}
                    <span className="ml-2">
                      ({profitLossPercent.toFixed(2)}%)
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex gap-1.5 mt-auto pt-4 flex-shrink-0 flex-wrap">
                <button
                  onClick={() => handleAddToInvestment(investment)}
                  className="px-2.5 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                  title={t("investments.actions.addCapitalTooltip")}
                >
                  <PlusCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleSellInvestment(investment)}
                  className="px-2.5 py-2 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors"
                  title={t("investments.actions.sellTooltip")}
                >
                  <MinusCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleUpdateValue(investment)}
                  className={`flex-1 min-w-[100px] btn-secondary flex items-center justify-center text-xs px-2 ${investment.isAutomatedPortfolio ? "bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50" : ""}`}
                  title={
                    investment.isAutomatedPortfolio
                      ? t("investments.actions.updateValueTooltip")
                      : t("investments.actions.updateTooltip")
                  }
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                  <span className="truncate">
                    {investment.isAutomatedPortfolio
                      ? t("investments.actions.updateValue")
                      : t("investments.actions.update")}
                  </span>
                </button>
                <button
                  onClick={() => handleViewHistory(investment)}
                  className="px-2.5 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  title={t("investments.actions.viewHistory")}
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleEdit(investment)}
                  className="px-2.5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title={t("investments.actions.edit")}
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteClick(investment)}
                  className="px-2.5 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                  title={t("investments.actions.delete")}
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
          {t("investments.noInvestments")}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center">
          <div
            className="modal-content max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              {editingInvestment
                ? t("investments.editInvestment")
                : t("investments.newInvestment")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Sección: Ubicación */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {t("investments.form.location")}
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("investments.form.accountRequired")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="input-field"
                    value={formData.account}
                    onChange={(e) => {
                      const newAccount = e.target.value;
                      setFormData({
                        ...formData,
                        account: newAccount,
                        subAccount: "", // Limpiar subcuenta al cambiar de cuenta
                        currency: newAccount
                          ? accounts.find((a) => a._id === newAccount)
                              ?.currency || "EUR"
                          : formData.currency,
                      });
                    }}
                    required
                  >
                    <option value="">
                      {t("investments.modals.addCapital.selectAccount")}
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
                    {t("investments.form.subAccountInvestment")}
                  </label>
                  {!formData.account ? (
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t("investments.form.selectAccountFirst")}
                      </p>
                    </div>
                  ) : (
                    (() => {
                      const accountSubAccounts = subAccounts.filter(
                        (sa) =>
                          sa.account?._id === formData.account ||
                          sa.account === formData.account,
                      );

                      if (accountSubAccounts.length === 0) {
                        return (
                          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              {t("investments.form.noInvestmentSubAccounts")}
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
                              currency: newSubAccount
                                ? subAccounts.find(
                                    (sa) => sa._id === newSubAccount,
                                  )?.currency || formData.currency
                                : formData.currency,
                            });
                          }}
                        >
                          <option value="">
                            {t("investments.form.noneDirectInvestment")}
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
              </div>

              {/* Sección: Información Básica */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {t("investments.form.basicInfo")}
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("investments.form.investmentNameRequired")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("investments.form.investmentTypeRequired")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="input-field"
                    value={
                      formData.isAutomatedPortfolio
                        ? "automated_portfolio"
                        : formData.type
                    }
                    onChange={(e) => {
                      const selectedValue = e.target.value;
                      const isAutomated =
                        selectedValue === "automated_portfolio";
                      setFormData({
                        ...formData,
                        type: isAutomated ? "fund" : selectedValue,
                        isAutomatedPortfolio: isAutomated,
                        purchasePrice: isAutomated ? 0 : formData.purchasePrice,
                      });
                    }}
                    required
                  >
                    <option value="stock">
                      {t("investments.investmentTypes.stock")}
                    </option>
                    <option value="bond">
                      {t("investments.investmentTypes.bond")}
                    </option>
                    <option value="crypto">
                      {t("investments.investmentTypes.crypto")}
                    </option>
                    <option value="fund">
                      {t("investments.investmentTypes.fund")}
                    </option>
                    <option value="etf">
                      {t("investments.investmentTypes.etf")}
                    </option>
                    <option value="automated_portfolio">
                      {t("investments.investmentTypes.automatedPortfolio")}
                    </option>
                    <option value="other">
                      {t("investments.investmentTypes.other")}
                    </option>
                  </select>
                </div>
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
                    placeholder={t("investments.form.symbolPlaceholder")}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Ticker o símbolo de la inversión (Ej: AAPL, BTC, NXT.MC)
                  </p>
                </div>
                {(formData.type === "fund" || formData.type === "bond") &&
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
                            isin: e.target.value
                              .toUpperCase()
                              .replace(/\s/g, ""),
                          })
                        }
                        placeholder={t("investments.form.isinPlaceholder")}
                        maxLength={12}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Código ISIN para fondos de inversión y bonos (12
                        caracteres). Si no tienes símbolo, el sistema intentará
                        buscar por ISIN o nombre.
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
                          purchasePrice: isAutomated
                            ? 0
                            : formData.purchasePrice,
                        });
                      }}
                    />
                    <label
                      htmlFor="isAutomatedPortfolio"
                      className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("investments.form.noUnitPurchasePrice")}
                    </label>
                  </div>
                )}
                {formData.isAutomatedPortfolio && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("investments.form.platformUrl")}{" "}
                      <span className="text-gray-400">
                        {t("common.optional")}
                      </span>
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
                      placeholder={t("investments.form.platformUrlPlaceholder")}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t("investments.form.platformUrlDescription")}
                    </p>
                  </div>
                )}
              </div>

              {/* Sección: Datos Financieros */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {t("investments.form.financialData")}
                </h3>
                {formData.isAutomatedPortfolio ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("investments.form.investedAmount")}{" "}
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
                        {t(
                          "investments.form.investedAmountDescriptionAutomated",
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("investments.form.currentAmountRequired")}{" "}
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
                        {t(
                          "investments.form.currentAmountDescriptionAutomated",
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("investments.form.numberOfShares")}{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        className="input-field"
                        value={formData.quantity}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            quantity: parseFloat(e.target.value),
                          })
                        }
                        required
                        placeholder={t(
                          "investments.form.numberOfSharesPlaceholder",
                        )}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t("investments.form.numberOfSharesDescription")}
                      </p>
                    </div>
                    {formData.isAutomatedPortfolio ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Monto Invertido{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            <input
                              type="number"
                              step="0.01"
                              className="input-field col-span-3"
                              value={formData.purchasePrice}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  purchasePrice: parseFloat(e.target.value),
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
                            Cantidad total de dinero invertido
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Monto Actual <span className="text-red-500">*</span>
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
                            Valor actual de la inversión
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("investments.form.purchasePrice")}{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            className="input-field"
                            value={formData.purchasePrice}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                purchasePrice: parseFloat(e.target.value),
                              })
                            }
                            required
                            placeholder="0.0000"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {t("investments.form.purchasePriceDescription")}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("investments.form.currentPriceRequired")}{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            className="input-field"
                            value={formData.currentPrice}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                currentPrice: parseFloat(e.target.value),
                              })
                            }
                            required
                            placeholder="0.0000"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {t("investments.form.currentPriceDescription")}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("investments.form.currencyRequired")}{" "}
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
                            Moneda de los precios
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Resumen financiero */}
                    {(() => {
                      const isAutomated = formData.isAutomatedPortfolio;
                      const hasValidData = isAutomated
                        ? formData.purchasePrice > 0 &&
                          formData.currentPrice > 0
                        : formData.quantity > 0 && formData.currentPrice > 0;

                      if (!hasValidData) return null;

                      if (isAutomated) {
                        // Resumen para carteras automatizadas
                        const profitLoss =
                          formData.currentPrice - formData.purchasePrice;
                        const profitLossPercent =
                          formData.purchasePrice > 0
                            ? ((formData.currentPrice -
                                formData.purchasePrice) /
                                formData.purchasePrice) *
                              100
                            : 0;
                        return (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Monto Actual:
                              </span>
                              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {new Intl.NumberFormat("es-ES", {
                                  style: "currency",
                                  currency: formData.currency || "EUR",
                                }).format(formData.currentPrice)}
                              </span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Monto Invertido:
                                </span>
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                  {new Intl.NumberFormat("es-ES", {
                                    style: "currency",
                                    currency: formData.currency || "EUR",
                                  }).format(formData.purchasePrice)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs mt-1">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Ganancia/Pérdida:
                                </span>
                                <span
                                  className={`font-semibold ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                >
                                  {profitLoss >= 0 ? "+" : ""}
                                  {new Intl.NumberFormat("es-ES", {
                                    style: "currency",
                                    currency: formData.currency || "EUR",
                                  }).format(profitLoss)}{" "}
                                  ({profitLossPercent >= 0 ? "+" : ""}
                                  {profitLossPercent.toFixed(2)}%)
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        // Resumen para inversiones normales
                        return (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Valor Total Calculado:
                              </span>
                              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {new Intl.NumberFormat("es-ES", {
                                  style: "currency",
                                  currency: formData.currency || "EUR",
                                }).format(
                                  formData.quantity * formData.currentPrice,
                                )}
                              </span>
                            </div>
                            {formData.purchasePrice > 0 && (
                              <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600 dark:text-gray-400">
                                    Capital Invertido:
                                  </span>
                                  <span className="font-medium text-gray-700 dark:text-gray-300">
                                    {new Intl.NumberFormat("es-ES", {
                                      style: "currency",
                                      currency: formData.currency || "EUR",
                                    }).format(
                                      formData.quantity *
                                        formData.purchasePrice,
                                    )}
                                  </span>
                                </div>
                                {(() => {
                                  const profitLoss =
                                    (formData.currentPrice -
                                      formData.purchasePrice) *
                                    formData.quantity;
                                  const profitLossPercent =
                                    formData.purchasePrice > 0
                                      ? ((formData.currentPrice -
                                          formData.purchasePrice) /
                                          formData.purchasePrice) *
                                        100
                                      : 0;
                                  return (
                                    <div className="flex items-center justify-between text-xs mt-1">
                                      <span className="text-gray-600 dark:text-gray-400">
                                        Ganancia/Pérdida:
                                      </span>
                                      <span
                                        className={`font-semibold ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                      >
                                        {profitLoss >= 0 ? "+" : ""}
                                        {new Intl.NumberFormat("es-ES", {
                                          style: "currency",
                                          currency: formData.currency || "EUR",
                                        }).format(profitLoss)}{" "}
                                        ({profitLossPercent >= 0 ? "+" : ""}
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
                    selected={
                      formData.purchaseDate
                        ? new Date(formData.purchaseDate)
                        : null
                    }
                    onChange={(date) => {
                      if (date) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(
                          2,
                          "0",
                        );
                        const day = String(date.getDate()).padStart(2, "0");
                        setFormData({
                          ...formData,
                          purchaseDate: `${year}-${month}-${day}`,
                        });
                      } else {
                        setFormData({ ...formData, purchaseDate: "" });
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
                      if (newAssetClass === "fixed_income") {
                        setFormData({
                          ...formData,
                          assetClass: newAssetClass,
                          fixedIncomePercentage: 100,
                          variableIncomePercentage: 0,
                          fixedIncomeSubtype: formData.fixedIncomeSubtype || "",
                        });
                      } else if (newAssetClass === "variable_income") {
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
                      {t("investments.form.assetClasses.fixedIncome")}
                    </option>
                    <option value="variable_income">
                      {t("investments.form.assetClasses.variableIncome")}
                    </option>
                    <option value="mixed">
                      {t("investments.form.assetClasses.mixed")}
                    </option>
                  </select>
                </div>
                {formData.assetClass === "fixed_income" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("investments.form.fixedIncomeSubtype")}
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
                      <option value="">
                        {t("investments.form.fixedIncomeSubtypeOptional")}
                      </option>
                      <option value="short">
                        {t("investments.form.fixedIncomeSubtypes.short")}
                      </option>
                      <option value="medium">
                        {t("investments.form.fixedIncomeSubtypes.medium")}
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
                    {t("investments.form.alternative")}
                  </label>
                </div>
                {formData.assetClass === "mixed" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        % {t("investments.assetClassLabels.fixedIncome")}
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
                        % {t("investments.assetClassLabels.variableIncome")}
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
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder={t("investments.form.notesPlaceholder")}
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
                      {t("investments.dca.enable")}
                    </label>
                  </div>
                  {formData.dcaEnabled && (
                    <div className="space-y-3 pl-6 border-l-2 border-blue-200 dark:border-blue-800">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("investments.dca.amountPerPeriod")}{" "}
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
                            {t("investments.dca.frequency")}{" "}
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
                              {t("investments.dca.frequencies.daily")}
                            </option>
                            <option value="weekly">
                              {t("investments.dca.frequencies.weekly")}
                            </option>
                            <option value="biweekly">
                              {t("investments.dca.frequencies.biweekly")}
                            </option>
                            <option value="monthly">
                              {t("investments.dca.frequencies.monthly")}
                            </option>
                            <option value="quarterly">
                              {t("investments.dca.frequencies.quarterly")}
                            </option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("investments.dca.startDate")}{" "}
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
                            {t("investments.dca.endDate")}{" "}
                            <span className="text-gray-400">
                              {t("investments.dca.optional")}
                            </span>
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
                        {t("investments.dca.description")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="submit" className="flex-1 btn-primary">
                  {editingInvestment ? "Actualizar" : "Crear"}
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
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t("investments.modals.updateValue.title", {
                name: selectedInvestment.name,
              })}
            </h2>
            {selectedInvestment.isAutomatedPortfolio &&
              selectedInvestment.platformUrl && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    <strong>{t("investments.modals.updateValue.tip")}</strong>{" "}
                    {t("investments.modals.updateValue.tipText")}
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
                      {t("investments.modals.updateValue.currentTotalValue")}
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
                      Ingresa el valor total actual que ves en la plataforma
                      (ej: MyInvestor, Indexa Capital, etc.)
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">
                        Monto invertido:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: selectedInvestment.currency,
                        }).format(selectedInvestment.quantity)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        Ganancia/Pérdida:
                      </span>
                      <span
                        className={`font-medium ${updateFormData.currentPrice - selectedInvestment.quantity >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {formatPrice(
                          updateFormData.currentPrice -
                            selectedInvestment.quantity,
                          selectedInvestment.currency,
                        )}{" "}
                        (
                        {(
                          ((updateFormData.currentPrice -
                            selectedInvestment.quantity) /
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
            className="modal-content max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {t("investments.actions.history")} - {selectedInvestment.name}
              </h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {historyLoading ? (
              <LoadingSpinner message={t("common.loading")} />
            ) : investmentHistory.length > 0 ? (
              <>
                <div className="mb-6" style={{ height: "300px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={investmentHistory.map((h) => ({
                        date: new Date(h.date).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        }),
                        value: h.totalValue,
                        price: h.currentPrice,
                      }))}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                        className="dark:stroke-gray-700"
                      />
                      <XAxis
                        dataKey="date"
                        stroke="#6b7280"
                        className="dark:stroke-gray-400"
                      />
                      <YAxis
                        stroke="#6b7280"
                        className="dark:stroke-gray-400"
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name === "Precio Unitario" || name === "price") {
                            return formatPrice(
                              value,
                              selectedInvestment.currency,
                            );
                          }
                          return new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: selectedInvestment.currency,
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
                        <th className="text-left py-2 text-gray-700 dark:text-gray-300">
                          Fecha
                        </th>
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
                            ? "Valor Total"
                            : "Precio Unitario"}
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
                            {new Date(entry.date).toLocaleDateString("es-ES", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="py-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                entry.operation === "creation"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                  : entry.operation === "add"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : entry.operation === "withdraw"
                                      ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
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
                            {formatPrice(
                              entry.currentPrice,
                              selectedInvestment.currency,
                            )}
                          </td>
                          <td className="text-right py-2 font-semibold text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: selectedInvestment.currency,
                            }).format(entry.totalValue)}
                          </td>
                          {investmentHistory.some((h) => h.notes) && (
                            <td className="py-2 text-gray-500 dark:text-gray-400 text-sm">
                              {entry.notes || "-"}
                            </td>
                          )}
                          <td className="py-2">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEditHistoryEntry(entry)}
                                className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                title={t("investments.actions.edit")}
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  handleDeleteHistoryEntry(entry._id)
                                }
                                className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                title={t("investments.actions.delete")}
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
                <p className="text-sm mb-2">
                  El historial se crea automáticamente cuando:
                </p>
                <ul className="text-sm mt-2 list-disc list-inside space-y-1">
                  <li>Se crea una nueva inversión</li>
                  <li>Se añade capital a la inversión</li>
                  <li>Se retira capital de la inversión</li>
                  <li>Se actualiza manualmente el valor</li>
                </ul>
                <p className="text-xs mt-4 text-gray-400 dark:text-gray-500">
                  Si esta inversión fue creada antes de implementar el
                  historial, puedes crear una entrada manual usando el botón
                  "Actualizar" de la inversión.
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
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t("investments.modals.addCapital.title", {
                name: selectedInvestment.name,
              })}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {selectedInvestment.isAutomatedPortfolio
                ? t("investments.modals.addCapital.descriptionAutomated")
                : t("investments.modals.addCapital.description")}
            </p>
            {selectedInvestment.isAutomatedPortfolio ? (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">
                    {t("investments.modals.addCapital.currentCapital")}
                  </span>{" "}
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: selectedInvestment.currency,
                  }).format(selectedInvestment.quantity)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {t("investments.modals.addCapital.currentValue")}:{" "}
                  {formatPrice(
                    selectedInvestment.currentPrice,
                    selectedInvestment.currency,
                  )}
                </p>
              </div>
            ) : (
              selectedInvestment.averagePurchasePrice && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">
                      {t("investments.modals.addCapital.currentAveragePrice")}:
                    </span>{" "}
                    {formatPrice(
                      selectedInvestment.averagePurchasePrice,
                      selectedInvestment.currency,
                    )}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t("investments.modals.addCapital.currentQuantity", {
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
                  onChange={(e) =>
                    setAddFormData({ ...addFormData, date: e.target.value })
                  }
                  required
                />
              </div>
              {selectedInvestment.isAutomatedPortfolio ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("investments.modals.addCapital.amountToAdd")}
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
                    {t("investments.modals.addCapital.descriptionAutomated")}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("investments.modals.addCapital.quantityToAdd")}
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
                      {t("investments.form.purchasePrice")}
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
                      {t("investments.form.purchasePriceDescription")}
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
                    Si no lo especificas, se mantendrá el precio actual de la
                    inversión
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
                  onChange={(e) =>
                    setAddFormData({ ...addFormData, notes: e.target.value })
                  }
                />
              </div>
              {selectedInvestment.isAutomatedPortfolio &&
                addFormData.quantity > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Nuevo capital total:
                    </p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: selectedInvestment.currency,
                      }).format(
                        selectedInvestment.quantity + addFormData.quantity,
                      )}
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
                        (selectedInvestment.quantity *
                          selectedInvestment.averagePurchasePrice +
                          addFormData.quantity * addFormData.price) /
                          (selectedInvestment.quantity + addFormData.quantity),
                        selectedInvestment.currency,
                      )}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Nueva cantidad total:{" "}
                      {selectedInvestment.quantity + addFormData.quantity}{" "}
                      unidades
                    </p>
                  </div>
                )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {selectedInvestment.isAutomatedPortfolio
                    ? "Añadir Capital"
                    : "Añadir a Inversión"}
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
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t("investments.modals.sellInvestment.title", {
                name: selectedInvestment.name,
              })}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {selectedInvestment.isAutomatedPortfolio
                ? t("investments.modals.sellInvestment.descriptionAutomated")
                : t("investments.modals.sellInvestment.description")}
            </p>
            {selectedInvestment.averagePurchasePrice &&
              !selectedInvestment.isAutomatedPortfolio && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">
                      {t(
                        "investments.modals.sellInvestment.availableQuantity",
                        { quantity: selectedInvestment.quantity },
                      )}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    <span className="font-semibold">
                      {t(
                        "investments.modals.sellInvestment.averagePurchasePrice",
                      )}
                      :
                    </span>{" "}
                    {formatPrice(
                      selectedInvestment.averagePurchasePrice,
                      selectedInvestment.currency,
                    )}
                  </p>
                </div>
              )}
            {selectedInvestment.isAutomatedPortfolio && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">
                    {t("investments.modals.sellInvestment.availableAmount")}:
                  </span>{" "}
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
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
                  onChange={(e) =>
                    setSellFormData({ ...sellFormData, date: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {selectedInvestment.isAutomatedPortfolio
                    ? t("investments.modals.sellInvestment.amountToWithdraw")
                    : t("investments.modals.sellInvestment.quantityToWithdraw")}
                </label>
                <input
                  type="number"
                  step={
                    selectedInvestment.isAutomatedPortfolio ? "0.01" : "0.0001"
                  }
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
                    ? `Máximo: ${new Intl.NumberFormat("es-ES", { style: "currency", currency: selectedInvestment.currency }).format(selectedInvestment.quantity)}`
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
              {selectedInvestment.subAccount && (
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
                    Devolver dinero a la subcuenta
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
                  onChange={(e) =>
                    setSellFormData({ ...sellFormData, notes: e.target.value })
                  }
                />
              </div>
              {sellFormData.quantity > 0 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Monto a retirar:
                  </p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {selectedInvestment.isAutomatedPortfolio
                      ? new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: selectedInvestment.currency,
                        }).format(sellFormData.quantity)
                      : new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: selectedInvestment.currency,
                        }).format(sellFormData.quantity * sellFormData.price)}
                  </p>
                  {!selectedInvestment.isAutomatedPortfolio &&
                    sellFormData.quantity < selectedInvestment.quantity && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {t(
                          "investments.modals.sellInvestment.availableQuantity",
                          {
                            quantity:
                              selectedInvestment.quantity -
                              sellFormData.quantity,
                          },
                        )}
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
                <button
                  type="submit"
                  className="flex-1 btn-primary bg-orange-600 hover:bg-orange-700"
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
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteModal && investmentToDelete && (
        <div
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t("investments.deleteConfirm.title")}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t("investments.deleteConfirm.whatToDo", {
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
                  investmentToDelete.averagePurchasePrice ||
                  investmentToDelete.purchasePrice;
                originalAmount = investmentToDelete.quantity * avgPrice;
              }

              return (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {t("investments.deleteConfirm.originalAmount")}
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
                {t("investments.deleteConfirm.deleteWithoutReturn")}
              </button>
              <button
                onClick={() => handleDelete(true)}
                className="w-full px-4 py-3 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors font-medium"
              >
                {t("investments.deleteConfirm.deleteAndReturn")}
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setInvestmentToDelete(null);
                }}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                {t("common.cancel")}
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
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t("investments.modals.editHistory.title")}
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
                  {t("investments.modals.editHistory.operationType")}
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
                    {t("investments.modals.editHistory.operations.creation")}
                  </option>
                  <option value="add">
                    {t("investments.modals.editHistory.operations.add")}
                  </option>
                  <option value="withdraw">
                    {t("investments.modals.editHistory.operations.withdraw")}
                  </option>
                  <option value="update">
                    {t("investments.modals.editHistory.operations.update")}
                  </option>
                </select>
              </div>
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
                  {selectedInvestment.isAutomatedPortfolio
                    ? "Valor Total"
                    : "Precio Unitario"}
                </label>
                <input
                  type="number"
                  step={
                    selectedInvestment.isAutomatedPortfolio ? "0.01" : "0.0001"
                  }
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
              {(editHistoryFormData.operation === "add" ||
                editHistoryFormData.operation === "withdraw") && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("investments.modals.editHistory.operationAmount")}
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
                        {t("investments.modals.editHistory.operationPrice")}
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
                    {t("investments.detail.basicInfo")}
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        {t("investments.detail.typeLabel")}
                      </span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                        {getTypeLabel(
                          detailInvestment.type,
                          detailInvestment.isAutomatedPortfolio,
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        {t("investments.detail.currencyLabel")}
                      </span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                        {detailInvestment.currency}
                      </span>
                    </div>
                    {(detailInvestment.account ||
                      detailInvestment.subAccount) && (
                      <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.detail.accountLabel")}
                        </span>
                        <div className="mt-1">
                          {detailInvestment.account && (
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {detailInvestment.account.name ||
                                detailInvestment.account.bankName ||
                                "N/A"}
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
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.detail.assetClassLabel")}
                        </span>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {detailInvestment.assetClass === "fixed_income" && (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                                {t("investments.assetClassLabels.fixedIncome")}
                              </span>
                              {getFixedIncomeSubtypeLabel(
                                detailInvestment.fixedIncomeSubtype,
                              ) && (
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getFixedIncomeSubtypeTone(
                                    detailInvestment.fixedIncomeSubtype,
                                  )}`}
                                >
                                  {getFixedIncomeSubtypeLabel(
                                    detailInvestment.fixedIncomeSubtype,
                                  )}
                                </span>
                              )}
                            </>
                          )}
                          {detailInvestment.assetClass ===
                            "variable_income" && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                              {t("investments.assetClassLabels.variableIncome")}
                            </span>
                          )}
                          {detailInvestment.assetClass === "mixed" && (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                {t("investments.assetClassLabels.mixed")}
                              </span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {t(
                                  "investments.assetClassLabels.fixedIncomeShort",
                                )}
                                : {detailInvestment.fixedIncomePercentage || 0}%
                                |
                                {t(
                                  "investments.assetClassLabels.variableIncomeShort",
                                )}
                                :{" "}
                                {detailInvestment.variableIncomePercentage || 0}
                                %
                              </span>
                            </>
                          )}
                          {detailInvestment.isAlternative && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                              {t("investments.assetClassLabels.alternative")}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {detailInvestment.isAutomatedPortfolio && (
                      <div className="col-span-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                          {t("investments.investmentTypes.automatedPortfolio")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Información financiera */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {t("investments.detail.financialInfo")}
                  </h3>
                  <div className="space-y-3 text-sm">
                    {detailInvestment.isAutomatedPortfolio ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("investments.detail.amountInvested")}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: detailInvestment.currency,
                            }).format(detailInvestment.quantity)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("investments.detail.currentValue")}
                          </span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {formatPrice(
                              detailInvestment.currentPrice,
                              detailInvestment.currency,
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("investments.detail.quantityLabel")}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {t("investments.detail.units", {
                              quantity: detailInvestment.quantity,
                            })}
                          </span>
                        </div>
                        {detailInvestment.averagePurchasePrice && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t(
                                "investments.detail.averagePurchasePriceLabel",
                              )}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(
                                detailInvestment.averagePurchasePrice,
                                detailInvestment.currency,
                              )}
                            </span>
                          </div>
                        )}
                        {detailInvestment.purchasePrice &&
                          !detailInvestment.averagePurchasePrice && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">
                                {t("investments.form.purchasePrice")}:
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatPrice(
                                  detailInvestment.purchasePrice,
                                  detailInvestment.currency,
                                )}
                              </span>
                            </div>
                          )}
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("investments.detail.currentPriceLabel")}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatPrice(
                              detailInvestment.currentPrice,
                              detailInvestment.currency,
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("investments.detail.totalValueLabel")}
                          </span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: detailInvestment.currency,
                            }).format(
                              detailInvestment.quantity *
                                detailInvestment.currentPrice,
                            )}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-600 dark:text-gray-400">
                        Ganancia/Pérdida:
                      </span>
                      <span
                        className={`font-bold flex items-center ${
                          calculateProfitLoss(detailInvestment) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {calculateProfitLoss(detailInvestment) >= 0 ? (
                          <TrendingUp className="h-4 w-4 mr-1" />
                        ) : (
                          <TrendingDown className="h-4 w-4 mr-1" />
                        )}
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: detailInvestment.currency,
                        }).format(calculateProfitLoss(detailInvestment))}
                        <span className="ml-2">
                          (
                          {calculateProfitLossPercentage(
                            detailInvestment,
                          ).toFixed(2)}
                          %)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Fechas */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {t("investments.detail.dates")}
                  </h3>
                  <div className="space-y-2 text-sm">
                    {detailInvestment.purchaseDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.detail.purchaseDateLabel")}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(
                            detailInvestment.purchaseDate,
                          ).toLocaleDateString("es-ES")}
                        </span>
                      </div>
                    )}
                    {detailInvestment.createdAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.detail.createdDateLabel")}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(
                            detailInvestment.createdAt,
                          ).toLocaleDateString("es-ES")}
                        </span>
                      </div>
                    )}
                    {detailInvestment.updatedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.detail.lastUpdateLabel")}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(
                            detailInvestment.updatedAt,
                          ).toLocaleDateString("es-ES")}
                        </span>
                      </div>
                    )}
                    {/* Fechas de DCA - Solo si está activado */}
                    {detailInvestment.dcaEnabled && (
                      <>
                        {detailInvestment.dcaStartDate && (
                          <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t("investments.dca.startDate")} (DCA):
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {new Date(
                                detailInvestment.dcaStartDate,
                              ).toLocaleDateString("es-ES")}
                            </span>
                          </div>
                        )}
                        {detailInvestment.dcaEndDate && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t("investments.dca.endDate")} (DCA):
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {new Date(
                                detailInvestment.dcaEndDate,
                              ).toLocaleDateString("es-ES")}
                            </span>
                          </div>
                        )}
                        {detailInvestment.dcaNextDate && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              {t("investments.dca.nextPurchase")} (DCA):
                            </span>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              {new Date(
                                detailInvestment.dcaNextDate,
                              ).toLocaleDateString("es-ES")}
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
                            (h) =>
                              h.operation === "add" &&
                              h.notes &&
                              h.notes.includes("DCA"),
                          )
                          .sort((a, b) => new Date(b.date) - new Date(a.date));

                        if (dcaPurchases.length > 0) {
                          const lastDCAPurchase = dcaPurchases[0];

                          return (
                            <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                              <span className="text-gray-600 dark:text-gray-400">
                                {t("investments.detail.lastDCAContribution")}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {new Date(
                                  lastDCAPurchase.date,
                                ).toLocaleDateString("es-ES")}
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
                  !detailInvestment.isAutomatedPortfolio && (
                    <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        {t("investments.detail.configuration")}
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("investments.detail.autoUpdateLabel")}
                          </span>
                          <span
                            onClick={async () => {
                              const newValue = !(
                                detailInvestment.autoUpdate !== false
                              );
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
                                    : inv,
                                ),
                              );
                              try {
                                await api.patch(
                                  `/investments/${detailInvestment._id}/auto-update`,
                                  {
                                    autoUpdate: newValue,
                                  },
                                );
                              } catch (error) {
                                alert(
                                  t(
                                    "investments.modals.errors.updateAutoUpdate",
                                  ),
                                );
                                // Revertir el cambio si falla
                                setDetailInvestment((prev) => ({
                                  ...prev,
                                  autoUpdate: originalValue,
                                }));
                                setInvestments((prev) =>
                                  prev.map((inv) =>
                                    inv._id === detailInvestment._id
                                      ? { ...inv, autoUpdate: originalValue }
                                      : inv,
                                  ),
                                );
                              }
                            }}
                            className={`font-medium cursor-pointer hover:underline transition-colors ${
                              detailInvestment.autoUpdate !== false
                                ? "text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            }`}
                          >
                            {detailInvestment.autoUpdate !== false
                              ? t("investments.detail.enabled")
                              : t("investments.detail.disabled")}
                          </span>
                        </div>
                        {detailInvestment.platformUrl && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">
                              {t("investments.detail.platform")}
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
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {t("investments.dca.title")}
                    </h3>
                    <button
                      onClick={() => {
                        setEditingDCAInvestment(detailInvestment);
                        setDcaFormData({
                          dcaEnabled: detailInvestment.dcaEnabled || false,
                          dcaAmount: detailInvestment.dcaAmount || 0,
                          dcaFrequency:
                            detailInvestment.dcaFrequency || "monthly",
                          dcaStartDate: detailInvestment.dcaStartDate
                            ? new Date(detailInvestment.dcaStartDate)
                                .toISOString()
                                .split("T")[0]
                            : new Date().toISOString().split("T")[0],
                          dcaEndDate: detailInvestment.dcaEndDate
                            ? new Date(detailInvestment.dcaEndDate)
                                .toISOString()
                                .split("T")[0]
                            : "",
                        });
                        setShowDCAModal(true);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                    >
                      <Edit className="h-3 w-3" />
                      {detailInvestment.dcaEnabled
                        ? t("investments.dca.edit")
                        : t("investments.dca.activate")}
                    </button>
                  </div>
                  {detailInvestment.dcaEnabled ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.detail.status")}
                        </span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {t("investments.detail.enabled")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.dca.amountPerPeriod")}:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: detailInvestment.currency || "EUR",
                          }).format(detailInvestment.dcaAmount || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          {t("investments.dca.frequency")}:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {t(
                            `investments.dca.frequencies.${detailInvestment.dcaFrequency}`,
                          )}
                        </span>
                      </div>
                      {/* Total capital aportado con DCA */}
                      {detailInvestmentHistory.length > 0 &&
                        (() => {
                          const dcaPurchases = detailInvestmentHistory
                            .filter(
                              (h) =>
                                h.operation === "add" &&
                                h.notes &&
                                h.notes.includes("DCA"),
                            )
                            .reduce(
                              (sum, h) => sum + (h.operationAmount || 0),
                              0,
                            );

                          if (dcaPurchases > 0) {
                            return (
                              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Total aportado:
                                </span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {new Intl.NumberFormat("es-ES", {
                                    style: "currency",
                                    currency:
                                      detailInvestment.currency || "EUR",
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
                        {t("investments.detail.disabled")}
                      </div>
                      {/* Mostrar total aportado si hubo actividad previa */}
                      {detailInvestmentHistory.length > 0 &&
                        (() => {
                          const dcaPurchases = detailInvestmentHistory
                            .filter(
                              (h) =>
                                h.operation === "add" &&
                                h.notes &&
                                h.notes.includes("DCA"),
                            )
                            .reduce(
                              (sum, h) => sum + (h.operationAmount || 0),
                              0,
                            );

                          if (dcaPurchases > 0) {
                            return (
                              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                                <span className="text-gray-600 dark:text-gray-400">
                                  {t("investments.detail.totalContributed")}
                                </span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {new Intl.NumberFormat("es-ES", {
                                    style: "currency",
                                    currency:
                                      detailInvestment.currency || "EUR",
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

                {/* Notas */}
                {detailInvestment.notes && (
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {t("investments.detail.notes")}
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
                    <div style={{ height: "290px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={detailInvestmentHistory.map((h) => ({
                            date: new Date(h.date).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "short",
                            }),
                            value: h.totalValue,
                            dailyChange: h.dailyChangeAmount || 0,
                          }))}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                            className="dark:stroke-gray-600"
                          />
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
                              return new Intl.NumberFormat("es-ES", {
                                style: "currency",
                                currency: detailInvestment.currency,
                                notation: "compact",
                                maximumFractionDigits: 0,
                              }).format(value);
                            }}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload || !payload.length)
                                return null;

                              const data = payload[0]?.payload;
                              const totalValue = data?.value || 0;

                              const formattedValue = new Intl.NumberFormat(
                                "es-ES",
                                {
                                  style: "currency",
                                  currency: detailInvestment.currency,
                                },
                              ).format(totalValue);

                              return (
                                <div className="bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#404040] rounded shadow-lg p-3">
                                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">
                                    {label}
                                  </p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-gray-600 dark:text-gray-400 text-sm">
                                        Valor Total:
                                      </span>
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
                      <p className="text-sm">
                        No hay datos de historial para mostrar
                      </p>
                      <p className="text-xs mt-2">
                        El historial se genera automáticamente con las
                        operaciones
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
                    <div style={{ height: "290px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={detailDailyVariations.map((v) => {
                            const changeAmount =
                              v.dailyChangeAmount !== null &&
                              v.dailyChangeAmount !== undefined
                                ? v.dailyChangeAmount
                                : 0;
                            return {
                              date: new Date(v.date).toLocaleDateString(
                                "es-ES",
                                { day: "2-digit", month: "short" },
                              ),
                              dailyChange: changeAmount,
                              dailyChangePercent:
                                v.dailyChangePercent !== null &&
                                v.dailyChangePercent !== undefined
                                  ? v.dailyChangePercent
                                  : null,
                              dailyChangePositive:
                                changeAmount >= 0 ? changeAmount : 0,
                              dailyChangeNegative:
                                changeAmount < 0 ? changeAmount : 0,
                            };
                          })}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                            className="dark:stroke-gray-600"
                          />
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
                              return new Intl.NumberFormat("es-ES", {
                                style: "currency",
                                currency: detailInvestment.currency,
                                notation: "compact",
                                maximumFractionDigits: 0,
                              }).format(value);
                            }}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload || !payload.length)
                                return null;

                              const data = payload[0]?.payload;
                              const dailyChange =
                                data?.dailyChange !== null &&
                                data?.dailyChange !== undefined
                                  ? data.dailyChange
                                  : 0;
                              const dailyChangePercent =
                                data?.dailyChangePercent;

                              const formattedChange = new Intl.NumberFormat(
                                "es-ES",
                                {
                                  style: "currency",
                                  currency: detailInvestment.currency,
                                },
                              ).format(Math.abs(dailyChange));

                              return (
                                <div className="bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#404040] rounded shadow-lg p-3">
                                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">
                                    {label}
                                  </p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-gray-600 dark:text-gray-400 text-sm">
                                        Cambio Diario:
                                      </span>
                                      <span
                                        className={`font-medium text-sm ${
                                          dailyChange > 0
                                            ? "text-green-600 dark:text-green-400"
                                            : dailyChange < 0
                                              ? "text-red-600 dark:text-red-400"
                                              : "text-gray-500 dark:text-gray-400"
                                        }`}
                                      >
                                        {dailyChange > 0
                                          ? "+"
                                          : dailyChange < 0
                                            ? "-"
                                            : ""}
                                        {formattedChange}
                                        {dailyChange === 0 &&
                                          " (Sin variación)"}
                                      </span>
                                    </div>
                                    {dailyChangePercent !== null &&
                                    dailyChangePercent !== undefined ? (
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600 dark:text-gray-400 text-sm">
                                          Variación:
                                        </span>
                                        <span
                                          className={`font-medium text-sm ${
                                            dailyChangePercent > 0
                                              ? "text-green-600 dark:text-green-400"
                                              : dailyChangePercent < 0
                                                ? "text-red-600 dark:text-red-400"
                                                : "text-gray-500 dark:text-gray-400"
                                          }`}
                                        >
                                          {dailyChangePercent > 0 ? "+" : ""}
                                          {dailyChangePercent.toFixed(2)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600 dark:text-gray-400 text-sm">
                                          Variación:
                                        </span>
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
                      <p className="text-sm">
                        No hay datos de variación diaria para mostrar
                      </p>
                      <p className="text-xs mt-2">
                        Las variaciones se generan automáticamente al actualizar
                        precios
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

      {/* Modal de DCA */}
      {showDCAModal && editingDCAInvestment && (
        <div
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          onClick={() => setShowDCAModal(false)}
        >
          <div
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {dcaFormData.dcaEnabled
                    ? t("investments.dca.edit")
                    : t("investments.dca.activate")}
                </h2>
                <button
                  onClick={() => setShowDCAModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
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
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label
                    htmlFor="dcaEnabledModal"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    {t("investments.dca.enable")}
                  </label>
                </div>

                {dcaFormData.dcaEnabled && (
                  <div className="space-y-3 pl-6 border-l-2 border-blue-200 dark:border-blue-800">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t("investments.dca.amountPerPeriod")}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          className="input-field"
                          value={dcaFormData.dcaAmount}
                          onChange={(e) =>
                            setDcaFormData({
                              ...dcaFormData,
                              dcaAmount: parseFloat(e.target.value) || 0,
                            })
                          }
                          required={dcaFormData.dcaEnabled}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t("investments.dca.frequency")}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <select
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
                          <option value="daily">
                            {t("investments.dca.frequencies.daily")}
                          </option>
                          <option value="weekly">
                            {t("investments.dca.frequencies.weekly")}
                          </option>
                          <option value="biweekly">
                            {t("investments.dca.frequencies.biweekly")}
                          </option>
                          <option value="monthly">
                            {t("investments.dca.frequencies.monthly")}
                          </option>
                          <option value="quarterly">
                            {t("investments.dca.frequencies.quarterly")}
                          </option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t("investments.dca.startDate")}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {t("investments.dca.endDate")}{" "}
                          <span className="text-gray-400">
                            {t("investments.dca.optional")}
                          </span>
                        </label>
                        <input
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
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t("investments.dca.description")}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowDCAModal(false);
                    setEditingDCAInvestment(null);
                  }}
                  className="flex-1 btn-secondary"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSaveDCA}
                  className="flex-1 btn-primary"
                  disabled={
                    dcaFormData.dcaEnabled &&
                    (!dcaFormData.dcaAmount ||
                      !dcaFormData.dcaStartDate ||
                      !dcaFormData.dcaFrequency)
                  }
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investments;
