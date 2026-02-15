import { useEffect, useState } from "react";
import {
  CgAdd,
  CgCreditCard,
  CgEditMarkup,
  CgTrash,
  CgChevronDown,
  CgChevronRight,
  CgTrending,
  CgChart,
  CgTrendingDown,
  CgTime,
  CgBot,
} from "react-icons/cg";
import { SiBitcoin } from "react-icons/si";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigate } from "react-router-dom";
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

const Accounts = () => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [accountsSummary, setAccountsSummary] = useState(null); // capital aportado real por cuenta/subcuenta desde backend
  const [dailyVariations, setDailyVariations] = useState({}); // { investmentId: { changeAmount, changePercent } }
  const [loading, setLoading] = useState(true);
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());
  const [expandedSubAccounts, setExpandedSubAccounts] = useState(new Set());
  const [expandedSubAccountTransactions, setExpandedSubAccountTransactions] =
    useState(new Set());
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSubAccountModal, setShowSubAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingSubAccount, setEditingSubAccount] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [accountFormData, setAccountFormData] = useState({
    name: "",
    bankName: "",
    accountNumber: "",
    currency: "EUR",
    description: "",
    initialBalance: 0,
    color: "#3b82f6", // Azul por defecto
  });
  const [subAccountFormData, setSubAccountFormData] = useState({
    name: "",
    type: "cash",
    balance: 0,
    currency: "EUR",
    description: "",
    initialDate: "",
  });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailInvestment, setDetailInvestment] = useState(null);
  const [detailInvestmentHistory, setDetailInvestmentHistory] = useState([]);
  const [detailDailyVariations, setDetailDailyVariations] = useState([]);
  const [showTransactionDetailModal, setShowTransactionDetailModal] =
    useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(false);
  const [transactionFormData, setTransactionFormData] = useState({
    subAccount: "",
    type: "expense",
    category: "",
    amount: 0,
    currency: "EUR",
    description: "",
    date: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [
        accountsRes,
        subAccountsRes,
        investmentsRes,
        transactionsRes,
        summaryRes,
      ] = await Promise.all([
        api.get("/accounts"),
        api.get("/subaccounts"),
        api.get("/investments"),
        api.get("/transactions"),
        api.get("/dashboard/accounts-summary").catch(() => ({ data: null })),
      ]);
      setAccounts(accountsRes.data);
      setSubAccounts(subAccountsRes.data);
      setInvestments(investmentsRes.data);
      setTransactions(transactionsRes.data);
      setAccountsSummary(summaryRes?.data ?? null);

      // Obtener variaciones diarias de todas las inversiones
      const variationsMap = {};
      await Promise.all(
        investmentsRes.data.map(async (inv) => {
          try {
            // Obtener la variación más reciente (sin limit para obtener todas y luego tomar la última)
            const variationsRes = await api.get(
              `/investment-history/investment/${inv._id}/daily-variations`,
            );
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
              const changeAmount =
                latest.dailyChangeAmount || latest.changeAmount || 0;

              // Si la variación es mayor al 100% del valor actual, probablemente es un error
              if (Math.abs(changeAmount) > currentValue * 1.5) {
                console.warn(
                  `[Accounts] Variación sospechosa para ${inv.name}: ${changeAmount}€ (valor actual: ${currentValue}€)`,
                );
                variationsMap[inv._id] = { changeAmount: 0, changePercent: 0 };
              } else {
                variationsMap[inv._id] = {
                  changeAmount: changeAmount,
                  changePercent:
                    latest.dailyChangePercent || latest.changePercent || 0,
                };
              }
            } else {
              variationsMap[inv._id] = { changeAmount: 0, changePercent: 0 };
            }
          } catch (error) {
            console.error(
              `[Accounts] Error obteniendo variación para ${inv.name}:`,
              error,
            );
            // Si no hay variaciones, usar 0
            variationsMap[inv._id] = { changeAmount: 0, changePercent: 0 };
          }
        }),
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

  const toggleSubAccountTransactions = (subAccountId) => {
    const newExpanded = new Set(expandedSubAccountTransactions);
    if (newExpanded.has(subAccountId)) {
      newExpanded.delete(subAccountId);
    } else {
      newExpanded.add(subAccountId);
    }
    setExpandedSubAccountTransactions(newExpanded);
  };

  const getTransactionsForSubAccount = (subAccountId) => {
    return transactions
      .filter(
        (t) =>
          (t.subAccount?._id || t.subAccount)?.toString() ===
          subAccountId?.toString(),
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const handleEditTransaction = () => {
    if (!selectedTransaction) return;

    setEditingTransaction(true);
    setTransactionFormData({
      subAccount:
        selectedTransaction.subAccount?._id ||
        selectedTransaction.subAccount ||
        "",
      type: selectedTransaction.type,
      category: selectedTransaction.category,
      amount: selectedTransaction.amount,
      currency: selectedTransaction.currency,
      description: selectedTransaction.description || "",
      date: new Date(selectedTransaction.date).toISOString().split("T")[0],
    });
  };

  const handleSaveTransaction = async () => {
    if (!selectedTransaction) return;

    try {
      const transactionData = {
        subAccount: transactionFormData.subAccount,
        type: transactionFormData.type,
        category: transactionFormData.category,
        amount: transactionFormData.amount,
        currency: transactionFormData.currency,
        description: transactionFormData.description,
        date: transactionFormData.date,
      };

      await api.put(
        `/transactions/${selectedTransaction._id}`,
        transactionData,
      );

      // Recargar datos
      await fetchData();

      // Cerrar modal y resetear estado
      setEditingTransaction(false);
      setShowTransactionDetailModal(false);
      setSelectedTransaction(null);
    } catch (error) {
      console.error("Error updating transaction:", error);
      alert(
        error.response?.data?.message || "Error al actualizar la transacción",
      );
    }
  };

  const handleCancelEdit = () => {
    setEditingTransaction(false);
    setTransactionFormData({
      subAccount: "",
      type: "expense",
      category: "",
      amount: 0,
      currency: "EUR",
      description: "",
      date: "",
    });
  };

  const getInvestmentTotalValue = (investment) => {
    return investment.isAutomatedPortfolio
      ? investment.currentPrice
      : investment.quantity * investment.currentPrice;
  };

  const getInvestmentInvestedCapital = (investment) => {
    if (investment.isAutomatedPortfolio) {
      return investment.quantity || 0;
    }
    const avgPrice =
      investment.averagePurchasePrice || investment.purchasePrice || 0;
    return (investment.quantity || 0) * avgPrice;
  };

  const getInvestmentAllocations = (investment) => {
    if (
      Array.isArray(investment.allocations) &&
      investment.allocations.length
    ) {
      return investment.allocations.map((allocation) => ({
        accountId: allocation.account?._id || allocation.account,
        subAccountId: allocation.subAccount?._id || allocation.subAccount,
        amount: Number(allocation.amount) || 0,
        quantity: Number(allocation.quantity) || 0,
        averagePurchasePrice: Number(allocation.averagePurchasePrice) || 0,
      }));
    }
    return [
      {
        accountId: investment.account?._id || investment.account,
        subAccountId: investment.subAccount?._id || investment.subAccount,
        amount: getInvestmentInvestedCapital(investment),
        quantity: 0,
        averagePurchasePrice: 0,
      },
    ];
  };

  const getAllocationAmount = (investment, predicate) => {
    const allocations = getInvestmentAllocations(investment);
    return allocations
      .filter(predicate)
      .reduce((sum, alloc) => sum + alloc.amount, 0);
  };

  const getAllocationShare = (investment, predicate) => {
    const allocations = getInvestmentAllocations(investment);
    if (allocations.length === 0) return 0;
    const total = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    const matchedAmount = allocations
      .filter(predicate)
      .reduce((sum, alloc) => sum + alloc.amount, 0);
    if (total > 0) {
      return matchedAmount / total;
    }
    const matchedCount = allocations.filter(predicate).length;
    return matchedCount / allocations.length;
  };

  const getAllocatedValue = (investment, share) =>
    getInvestmentTotalValue(investment) * share;

  const getAllocatedInvestedCapital = (investment, share) =>
    getInvestmentInvestedCapital(investment) * share;

  const getAllocatedQuantity = (investment, share) => {
    if (investment.isAutomatedPortfolio) {
      return null;
    }
    return (investment.quantity || 0) * share;
  };

  const getAllocationMetrics = (investment, predicate) => {
    const allocations = getInvestmentAllocations(investment);
    const totalValue = getInvestmentTotalValue(investment);
    const totalAmount = allocations.reduce(
      (sum, allocation) => sum + (allocation.amount || 0),
      0,
    );

    return allocations.reduce(
      (acc, allocation) => {
        if (!predicate(allocation)) return acc;

        if (investment.isAutomatedPortfolio) {
          const share = totalAmount > 0 ? allocation.amount / totalAmount : 0;
          return {
            currentValue: acc.currentValue + totalValue * share,
            investedCapital: acc.investedCapital + allocation.amount,
            quantity: null,
          };
        }

        if (allocation.quantity > 0 && allocation.averagePurchasePrice > 0) {
          const currentValue = allocation.quantity * investment.currentPrice;
          const investedCapital =
            allocation.quantity * allocation.averagePurchasePrice;
          return {
            currentValue: acc.currentValue + currentValue,
            investedCapital: acc.investedCapital + investedCapital,
            quantity: acc.quantity + allocation.quantity,
          };
        }

        const share = totalAmount > 0 ? allocation.amount / totalAmount : 0;
        return {
          currentValue: acc.currentValue + totalValue * share,
          investedCapital: acc.investedCapital + allocation.amount,
          quantity: acc.quantity + (investment.quantity || 0) * share,
        };
      },
      { currentValue: 0, investedCapital: 0, quantity: 0 },
    );
  };

  const getInvestmentsForSubAccount = (subAccountId) => {
    return investments.filter(
      (inv) =>
        inv.status !== "closed" &&
        getAllocationAmount(
          inv,
          (allocation) =>
            allocation.subAccountId?.toString() === subAccountId?.toString(),
        ) > 0,
    );
  };

  const getInvestmentsForAccount = (accountId) => {
    return investments.filter(
      (inv) =>
        inv.status !== "closed" &&
        getAllocationAmount(
          inv,
          (allocation) =>
            allocation.accountId?.toString() === accountId?.toString() &&
            !allocation.subAccountId,
        ) > 0,
    );
  };

  const calculateSubAccountTotalValue = (subAccount) => {
    const subEntry = getSubAccountFromSummary(subAccount._id);
    if (subEntry)
      return (
        (Number(subEntry.balance) || 0) +
        (Number(subEntry.investmentsValue) || 0)
      );
    if (subAccount.type !== "investment") return subAccount.balance ?? 0;
    const subAccountInvestments = getInvestmentsForSubAccount(subAccount._id);
    const investmentsValue = subAccountInvestments.reduce((sum, inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (allocation) =>
          allocation.subAccountId?.toString() === subAccount._id?.toString(),
      );
      return sum + metrics.currentValue;
    }, 0);
    return (subAccount.balance || 0) + investmentsValue;
  };

  const getSubAccountsForAccount = (accountId) => {
    const subs = subAccounts.filter(
      (sub) => sub.account?._id === accountId || sub.account === accountId,
    );
    // Ordenar: primero cash, luego savings, luego el resto
    return subs.sort((a, b) => {
      const typeOrder = { cash: 1, savings: 2, investment: 3, credit: 4 };
      const orderA = typeOrder[a.type] || 99;
      const orderB = typeOrder[b.type] || 99;
      return orderA - orderB;
    });
  };

  const toId = (v) => (v == null ? "" : String(v._id ?? v));

  const getAccountSummaryEntry = (accountId) => {
    if (!accountsSummary || accountId == null) return null;
    const id = toId(accountId);
    return accountsSummary.find((a) => toId(a._id) === id) ?? null;
  };

  const getSubAccountFromSummary = (subAccountId) => {
    if (!accountsSummary || subAccountId == null) return null;
    const id = toId(subAccountId);
    for (const acc of accountsSummary) {
      const sub = (acc.subAccounts || []).find((s) => toId(s._id) === id);
      if (sub) return sub;
    }
    return null;
  };

  const calculateTotalBalance = (accountId) => {
    const entry = getAccountSummaryEntry(accountId);
    if (entry) {
      const subsTotal = (entry.subAccounts || []).reduce(
        (s, sub) =>
          s + (Number(sub.balance) || 0) + (Number(sub.investmentsValue) || 0),
        0,
      );
      return subsTotal + (Number(entry.directInvestmentsValue) || 0);
    }
    const subs = getSubAccountsForAccount(accountId);
    const subsBalance = subs.reduce(
      (sum, sub) => sum + calculateSubAccountTotalValue(sub),
      0,
    );
    const accountInvestments = getInvestmentsForAccount(accountId);
    const investmentsValue = accountInvestments.reduce((sum, inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (allocation) =>
          allocation.accountId?.toString() === accountId?.toString() &&
          !allocation.subAccountId,
      );
      return sum + metrics.currentValue;
    }, 0);
    return subsBalance + investmentsValue;
  };

  const calculateAccountInvestedCapital = (accountId) => {
    const entry = getAccountSummaryEntry(accountId);
    if (entry) {
      const subsTotal = (entry.subAccounts || []).reduce(
        (s, sub) => s + (Number(sub.contributedCapital) || 0),
        0,
      );
      return subsTotal + (Number(entry.directContributedCapital) || 0);
    }
    const accountInvestments = getInvestmentsForAccount(accountId);
    const subs = getSubAccountsForAccount(accountId);
    let totalInvestedCapital = 0;
    accountInvestments.forEach((inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (allocation) =>
          allocation.accountId?.toString() === accountId?.toString() &&
          !allocation.subAccountId,
      );
      totalInvestedCapital += metrics.investedCapital;
    });
    subs.forEach((sub) => {
      totalInvestedCapital += calculateSubAccountInvestedCapital(sub._id);
    });
    return totalInvestedCapital;
  };

  const calculateAccountInvestmentsValue = (accountId) => {
    const entry = getAccountSummaryEntry(accountId);
    if (entry) {
      const subsTotal = (entry.subAccounts || []).reduce(
        (s, sub) => s + (Number(sub.investmentsValue) || 0),
        0,
      );
      return subsTotal + (Number(entry.directInvestmentsValue) || 0);
    }
    const accountInvestments = getInvestmentsForAccount(accountId);
    const subs = getSubAccountsForAccount(accountId);
    let totalValue = 0;
    accountInvestments.forEach((inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (allocation) =>
          allocation.accountId?.toString() === accountId?.toString() &&
          !allocation.subAccountId,
      );
      totalValue += metrics.currentValue;
    });

    // Sumar valor actual de inversiones en subcuentas
    subs.forEach((sub) => {
      const subAccountInvestments = getInvestmentsForSubAccount(sub._id);
      subAccountInvestments.forEach((inv) => {
        const metrics = getAllocationMetrics(
          inv,
          (allocation) =>
            allocation.subAccountId?.toString() === sub._id?.toString(),
        );
        totalValue += metrics.currentValue;
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
    accountInvestments.forEach((inv) => {
      const variation = dailyVariations[inv._id];
      if (variation) {
        const metrics = getAllocationMetrics(
          inv,
          (allocation) =>
            allocation.accountId?.toString() === accountId?.toString() &&
            !allocation.subAccountId,
        );
        const totalValue = getInvestmentTotalValue(inv);
        const share = totalValue > 0 ? metrics.currentValue / totalValue : 0;
        totalChangeAmount += (variation.changeAmount || 0) * share;
      }
    });

    // Sumar variaciones de inversiones en subcuentas
    subs.forEach((sub) => {
      const subAccountInvestments = getInvestmentsForSubAccount(sub._id);
      subAccountInvestments.forEach((inv) => {
        const variation = dailyVariations[inv._id];
        if (variation) {
          const metrics = getAllocationMetrics(
            inv,
            (allocation) =>
              allocation.subAccountId?.toString() === sub._id?.toString(),
          );
          const totalValue = getInvestmentTotalValue(inv);
          const share = totalValue > 0 ? metrics.currentValue / totalValue : 0;
          totalChangeAmount += (variation.changeAmount || 0) * share;
        }
      });
    });

    return totalChangeAmount;
  };

  const calculateSubAccountInvestedCapital = (subAccountId) => {
    const subEntry = getSubAccountFromSummary(subAccountId);
    if (subEntry) return Number(subEntry.contributedCapital) || 0;
    const subAccountInvestments = getInvestmentsForSubAccount(subAccountId);
    let totalInvestedCapital = 0;
    subAccountInvestments.forEach((inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (allocation) =>
          allocation.subAccountId?.toString() === subAccountId?.toString(),
      );
      totalInvestedCapital += metrics.investedCapital;
    });
    return totalInvestedCapital;
  };

  // Calcular variación total de inversiones de una subcuenta
  const calculateSubAccountInvestmentsVariation = (subAccountId) => {
    const subAccountInvestments = getInvestmentsForSubAccount(subAccountId);

    let totalChangeAmount = 0;
    subAccountInvestments.forEach((inv) => {
      const variation = dailyVariations[inv._id];
      if (variation) {
        const metrics = getAllocationMetrics(
          inv,
          (allocation) =>
            allocation.subAccountId?.toString() === subAccountId?.toString(),
        );
        const totalValue = getInvestmentTotalValue(inv);
        const share = totalValue > 0 ? metrics.currentValue / totalValue : 0;
        const changeAmount = (variation.changeAmount || 0) * share;
        totalChangeAmount += changeAmount;

        // Log para depuración si la variación es muy grande
        if (Math.abs(changeAmount) > 1000) {
          console.log(`[Accounts DEBUG] Variación grande en ${inv.name}:`, {
            investmentId: inv._id,
            changeAmount: changeAmount,
            changePercent: variation.changePercent,
            currentValue: inv.isAutomatedPortfolio
              ? inv.currentPrice
              : inv.quantity * inv.currentPrice,
          });
        }
      }
    });

    // Log si la variación total es sospechosa
    if (Math.abs(totalChangeAmount) > 1000) {
      console.log(
        `[Accounts DEBUG] Variación total sospechosa en subcuenta ${subAccountId}:`,
        {
          totalChangeAmount: totalChangeAmount,
          investments: subAccountInvestments.map((inv) => ({
            name: inv.name,
            variation: dailyVariations[inv._id],
          })),
        },
      );
    }

    return totalChangeAmount;
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await api.put(`/accounts/${editingAccount._id}`, accountFormData);
      } else {
        await api.post("/accounts", accountFormData);
      }
      fetchData();
      setShowAccountModal(false);
      resetAccountForm();
    } catch (error) {}
  };

  const handleSubAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      // Preparar datos: si initialDate está vacío, no enviarlo (o enviarlo como null)
      const formData = { ...subAccountFormData };
      if (!formData.initialDate || formData.initialDate === "") {
        // Si está vacío, no incluir el campo o enviarlo como null
        delete formData.initialDate;
      } else {
        // Convertir la fecha a formato ISO para el backend
        formData.initialDate = new Date(formData.initialDate).toISOString();
      }

      if (editingSubAccount) {
        await api.put(`/subaccounts/${editingSubAccount._id}`, formData);
      } else {
        await api.post("/subaccounts", {
          ...formData,
          account: selectedAccountId,
        });
      }
      fetchData();
      setShowSubAccountModal(false);
      resetSubAccountForm();
    } catch (error) {}
  };

  const handleEditAccount = (account) => {
    setEditingAccount(account);
    setAccountFormData({
      name: account.name,
      bankName: account.bankName || "",
      accountNumber: account.accountNumber || "",
      currency: account.currency,
      description: account.description || "",
      initialBalance: 0, // No se usa en edición, solo en creación
      color: account.color || "#3b82f6",
    });
    setShowAccountModal(true);
  };

  const handleEditSubAccount = (subAccount) => {
    setEditingSubAccount(subAccount);
    // Formatear la fecha para el input type="date" (YYYY-MM-DD)
    const initialDate = subAccount.initialDate
      ? new Date(subAccount.initialDate).toISOString().split("T")[0]
      : "";
    setSubAccountFormData({
      name: subAccount.name,
      type: subAccount.type,
      balance: subAccount.balance,
      currency: subAccount.currency,
      description: subAccount.description || "",
      initialDate: initialDate,
    });
    setSelectedAccountId(subAccount.account?._id || subAccount.account);
    setShowSubAccountModal(true);
  };

  const handleDeleteAccount = async (id) => {
    if (window.confirm(t("accounts.deleteAccountConfirm"))) {
      try {
        await api.delete(`/accounts/${id}`);
        fetchData();
      } catch (error) {}
    }
  };

  const handleDeleteSubAccount = async (id) => {
    if (window.confirm(t("accounts.deleteSubAccountConfirm"))) {
      try {
        await api.delete(`/subaccounts/${id}`);
        fetchData();
      } catch (error) {}
    }
  };

  const resetAccountForm = () => {
    setAccountFormData({
      name: "",
      bankName: "",
      accountNumber: "",
      currency: "EUR",
      description: "",
      initialBalance: 0,
      color: "#3b82f6", // Azul por defecto
    });
    setEditingAccount(null);
  };

  const resetSubAccountForm = () => {
    setSubAccountFormData({
      name: "",
      type: "cash",
      balance: 0,
      currency: "EUR",
      description: "",
      initialDate: "",
    });
    setEditingSubAccount(null);
    setSelectedAccountId(null);
  };

  const getSubAccountTypeIcon = (type) => {
    switch (type) {
      case "cash":
        return (
          <CgCreditCard className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
        );
      case "investment":
        return (
          <CgTrending className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
        );
      case "savings":
        return (
          <CgChart className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
        );
      case "credit":
        return (
          <CgCreditCard className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
        );
      default:
        return (
          <CgCreditCard className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
        );
    }
  };

  const getInvestmentTypeLabel = (type) => {
    const types = {
      stock: t("investments.investmentTypes.stock"),
      bond: t("investments.investmentTypes.bond"),
      crypto: t("investments.investmentTypes.crypto"),
      fund: t("investments.investmentTypes.fund"),
      etf: t("investments.investmentTypes.etf"),
      automated_portfolio: t("investments.investmentTypes.automatedPortfolio"),
      other: t("investments.investmentTypes.other"),
    };
    return types[type] || type;
  };

  const getSubAccountTypeLabel = (type) => {
    const types = {
      cash: t("accounts.subAccountTypes.cash"),
      investment: t("accounts.subAccountTypes.investment"),
      savings: t("accounts.subAccountTypes.savings"),
      credit: t("accounts.subAccountTypes.credit"),
      other: t("accounts.subAccountTypes.other"),
    };
    return types[type] || type;
  };

  const getTypeLabel = (type, isAutomatedPortfolio = false) => {
    if (isAutomatedPortfolio || type === "automated_portfolio") {
      return t("investments.investmentTypes.automatedPortfolio");
    }
    const types = {
      stock: t("investments.investmentTypes.stock"),
      bond: t("investments.investmentTypes.bond"),
      crypto: t("investments.investmentTypes.crypto"),
      fund: t("investments.investmentTypes.fund"),
      etf: t("investments.investmentTypes.etf"),
      automated_portfolio: t("investments.investmentTypes.automatedPortfolio"),
      other: t("investments.investmentTypes.other"),
    };
    return types[type] || type;
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

  const calculateProfitLoss = (investment) => {
    if (investment.isAutomatedPortfolio) {
      return investment.currentPrice - investment.quantity;
    }
    const avgPrice =
      investment.averagePurchasePrice || investment.purchasePrice;
    return (investment.currentPrice - avgPrice) * investment.quantity;
  };

  const calculateProfitLossPercentage = (investment) => {
    if (investment.isAutomatedPortfolio) {
      if (investment.quantity === 0) return 0;
      return (
        ((investment.currentPrice - investment.quantity) /
          investment.quantity) *
        100
      );
    }
    const avgPrice =
      investment.averagePurchasePrice || investment.purchasePrice;
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t("accounts.title")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t("accounts.subtitle")}
          </p>
        </div>
        <button
          onClick={() => {
            resetAccountForm();
            setShowAccountModal(true);
          }}
          className="btn-primary flex items-center"
        >
          <CgAdd className="h-5 w-5 mr-2" />
          {t("accounts.newAccount")}
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
                  <div
                    className="p-2 rounded-lg"
                    style={{
                      backgroundColor: `${account.color || "#3b82f6"}20`,
                    }}
                  >
                    <CgCreditCard
                      className="h-5 w-5"
                      style={{ color: account.color || "#3b82f6" }}
                    />
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {account.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {account.bankName}
                    </p>
                  </div>
                  <div className="text-right mr-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t("accounts.totalBalance")}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: account.currency,
                      }).format(totalBalance)}
                    </p>
                    {(() => {
                      const investedCapital = calculateAccountInvestedCapital(
                        account._id,
                      );
                      const currentValue = calculateAccountInvestmentsValue(
                        account._id,
                      );
                      const profitLoss = currentValue - investedCapital;
                      const profitLossPercent =
                        investedCapital > 0
                          ? (profitLoss / investedCapital) * 100
                          : 0;

                      if (investedCapital > 0) {
                        return (
                          <p
                            className={`text-xs mt-1 font-semibold ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {profitLoss >= 0 ? "+" : ""}
                            {profitLossPercent.toFixed(2)}% (
                            {profitLoss >= 0 ? "+" : ""}
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: account.currency,
                            }).format(profitLoss)}
                            )
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
                    {t("accounts.newSubAccount")}
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
                  {accountSubAccounts.length === 0 &&
                  getInvestmentsForAccount(account._id).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      {t("accounts.noSubAccountsOrInvestments")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {/* Mostrar subcuentas primero (ordenadas: cash, savings, luego el resto) */}
                      {accountSubAccounts.map((subAccount) => {
                        const subAccountInvestments =
                          getInvestmentsForSubAccount(subAccount._id);
                        const isSubAccountExpanded = expandedSubAccounts.has(
                          subAccount._id,
                        );
                        const totalValue =
                          calculateSubAccountTotalValue(subAccount);
                        const investmentsValue = subAccountInvestments.reduce(
                          (sum, inv) => {
                            const metrics = getAllocationMetrics(
                              inv,
                              (allocation) =>
                                allocation.subAccountId?.toString() ===
                                subAccount._id?.toString(),
                            );
                            return sum + metrics.currentValue;
                          },
                          0,
                        );

                        return (
                          <div
                            key={subAccount._id}
                            className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg border border-gray-200/50 dark:border-[#404040]/50"
                          >
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center flex-1">
                                {subAccount.type === "investment" &&
                                  subAccountInvestments.length > 0 && (
                                    <button
                                      onClick={() =>
                                        toggleSubAccount(subAccount._id)
                                      }
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
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                    {subAccount.name}
                                  </h4>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {getSubAccountTypeLabel(subAccount.type)}
                                    {subAccount.type === "investment" &&
                                      subAccountInvestments.length > 0 && (
                                        <span className="ml-2">
                                          ({subAccountInvestments.length}{" "}
                                          inversión
                                          {subAccountInvestments.length !== 1
                                            ? "es"
                                            : ""}
                                          )
                                        </span>
                                      )}
                                  </p>
                                </div>
                                <div className="text-right mr-4">
                                  {subAccount.type === "investment" ? (
                                    <div>
                                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                        {new Intl.NumberFormat("es-ES", {
                                          style: "currency",
                                          currency: subAccount.currency,
                                        }).format(totalValue)}
                                      </p>
                                      {(() => {
                                        if (subAccountInvestments.length > 0) {
                                          const investedCapital =
                                            calculateSubAccountInvestedCapital(
                                              subAccount._id,
                                            );
                                          const currentValue = investmentsValue;
                                          const profitLoss =
                                            currentValue - investedCapital;
                                          const profitLossPercent =
                                            investedCapital > 0
                                              ? (profitLoss / investedCapital) *
                                                100
                                              : 0;

                                          if (investedCapital > 0) {
                                            return (
                                              <p
                                                className={`text-xs mt-1 font-semibold ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                              >
                                                {profitLoss >= 0 ? "+" : ""}
                                                {profitLossPercent.toFixed(2)}%
                                                ({profitLoss >= 0 ? "+" : ""}
                                                {new Intl.NumberFormat(
                                                  "es-ES",
                                                  {
                                                    style: "currency",
                                                    currency:
                                                      subAccount.currency,
                                                  },
                                                ).format(profitLoss)}
                                                )
                                              </p>
                                            );
                                          }
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  ) : (
                                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                      {new Intl.NumberFormat("es-ES", {
                                        style: "currency",
                                        currency: subAccount.currency,
                                      }).format(subAccount.balance)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleEditSubAccount(subAccount)
                                  }
                                  className="px-3 py-2 btn-secondary"
                                >
                                  <CgEditMarkup className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteSubAccount(subAccount._id)
                                  }
                                  className="px-3 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                                >
                                  <CgTrash className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {/* Mostrar inversiones si es subcuenta de inversión y está expandida */}
                            {subAccount.type === "investment" &&
                              isSubAccountExpanded &&
                              subAccountInvestments.length > 0 && (
                                <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-600">
                                  <div className="mt-2 space-y-2">
                                    {subAccountInvestments.map(
                                      (investment, index) => {
                                        const metrics = getAllocationMetrics(
                                          investment,
                                          (allocation) =>
                                            allocation.subAccountId?.toString() ===
                                            subAccount._id?.toString(),
                                        );
                                        const investmentValue =
                                          metrics.currentValue;
                                        const investedCapital =
                                          metrics.investedCapital;
                                        const allocatedQuantity =
                                          metrics.quantity;
                                        const allocationAveragePurchasePrice =
                                          allocatedQuantity &&
                                          allocatedQuantity > 0
                                            ? investedCapital /
                                              allocatedQuantity
                                            : investment.averagePurchasePrice;
                                        const profitLoss =
                                          investmentValue - investedCapital;
                                        const profitLossPercent =
                                          investedCapital > 0
                                            ? (profitLoss / investedCapital) *
                                              100
                                            : 0;
                                        const isInvestmentExpanded =
                                          expandedSubAccounts.has(
                                            `subaccount-investment-${investment._id}`,
                                          );

                                        return (
                                          <div
                                            key={investment._id}
                                            className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg border border-gray-200/50 dark:border-[#404040]/50"
                                          >
                                            <div
                                              className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#404040]/50 transition-colors"
                                              onClick={(e) => {
                                                // Evitar que se active cuando se hace clic en el botón de colapsar
                                                if (
                                                  e.target.tagName ===
                                                    "BUTTON" ||
                                                  e.target.closest("button")
                                                ) {
                                                  return;
                                                }
                                                // Si está expandido, colapsar; si está colapsado, expandir
                                                toggleSubAccount(
                                                  `subaccount-investment-${investment._id}`,
                                                );
                                              }}
                                            >
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center flex-1">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      toggleSubAccount(
                                                        `subaccount-investment-${investment._id}`,
                                                      );
                                                    }}
                                                    className="mr-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                                  >
                                                    {isInvestmentExpanded ? (
                                                      <CgChevronDown className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                                    ) : (
                                                      <CgChevronRight className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                                    )}
                                                  </button>
                                                  <div
                                                    className="p-2 rounded-lg mr-3"
                                                    style={{
                                                      backgroundColor:
                                                        "var(--user-color-100)",
                                                      color:
                                                        "var(--user-color-600)",
                                                    }}
                                                  >
                                                    {investment.isAutomatedPortfolio ||
                                                    investment.type ===
                                                      "automated_portfolio" ? (
                                                      <CgBot
                                                        className="h-4 w-4"
                                                        style={{
                                                          color:
                                                            "var(--user-color-600)",
                                                        }}
                                                      />
                                                    ) : investment.type ===
                                                      "crypto" ? (
                                                      <SiBitcoin
                                                        className="h-4 w-4"
                                                        style={{
                                                          color:
                                                            "var(--user-color-600)",
                                                        }}
                                                      />
                                                    ) : (
                                                      <CgTrending
                                                        className="h-4 w-4"
                                                        style={{
                                                          color:
                                                            "var(--user-color-600)",
                                                        }}
                                                      />
                                                    )}
                                                  </div>
                                                  <div className="flex-1">
                                                    <p className="font-medium text-gray-900 dark:text-gray-100">
                                                      {investment.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                      {investment.symbol &&
                                                        `${investment.symbol} • `}
                                                      {investment.isAutomatedPortfolio
                                                        ? t(
                                                            "accounts.modals.automatedPortfolio",
                                                          )
                                                        : t(
                                                            "accounts.modals.units",
                                                            {
                                                              quantity:
                                                                allocatedQuantity ??
                                                                investment.quantity,
                                                            },
                                                          )}
                                                    </p>
                                                  </div>
                                                </div>
                                                <div className="text-right">
                                                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                    {new Intl.NumberFormat(
                                                      "es-ES",
                                                      {
                                                        style: "currency",
                                                        currency:
                                                          investment.currency,
                                                      },
                                                    ).format(investmentValue)}
                                                  </p>
                                                  <p
                                                    className={`text-xs ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                                  >
                                                    {profitLoss >= 0 ? "+" : ""}
                                                    {new Intl.NumberFormat(
                                                      "es-ES",
                                                      {
                                                        style: "currency",
                                                        currency:
                                                          investment.currency,
                                                      },
                                                    ).format(profitLoss)}{" "}
                                                    (
                                                    {profitLossPercent >= 0
                                                      ? "+"
                                                      : ""}
                                                    {profitLossPercent.toFixed(
                                                      2,
                                                    )}
                                                    %)
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
                                                    if (
                                                      e.target.tagName ===
                                                        "BUTTON" ||
                                                      e.target.tagName ===
                                                        "INPUT" ||
                                                      e.target.closest(
                                                        "button",
                                                      ) ||
                                                      e.target.closest("input")
                                                    ) {
                                                      return;
                                                    }
                                                    setDetailInvestment(
                                                      investment,
                                                    );
                                                    setShowDetailModal(true);
                                                    // Cargar historial y variaciones diarias para las gráficas
                                                    try {
                                                      const [
                                                        historyRes,
                                                        variationsRes,
                                                      ] = await Promise.all([
                                                        api.get(
                                                          `/investment-history/investment/${investment._id}`,
                                                        ),
                                                        api.get(
                                                          `/investment-history/investment/${investment._id}/daily-variations`,
                                                        ),
                                                      ]);
                                                      setDetailInvestmentHistory(
                                                        historyRes.data || [],
                                                      );
                                                      setDetailDailyVariations(
                                                        variationsRes.data ||
                                                          [],
                                                      );
                                                    } catch (error) {
                                                      setDetailInvestmentHistory(
                                                        [],
                                                      );
                                                      setDetailDailyVariations(
                                                        [],
                                                      );
                                                    }
                                                  }}
                                                >
                                                  <div className="space-y-1 text-sm">
                                                    <p>
                                                      <span className="font-medium">
                                                        {t(
                                                          "investments.detail.typeLabel",
                                                        )}
                                                      </span>{" "}
                                                      {investment.assetClass ===
                                                      "fixed_income"
                                                        ? `${t(
                                                            "investments.assetClassLabels.fixedIncome",
                                                          )}${
                                                            getFixedIncomeSubtypeLabel(
                                                              investment.fixedIncomeSubtype,
                                                            )
                                                              ? ` · ${getFixedIncomeSubtypeLabel(
                                                                  investment.fixedIncomeSubtype,
                                                                )}`
                                                              : ""
                                                          }`
                                                        : investment.assetClass ===
                                                            "variable_income"
                                                          ? t(
                                                              "investments.assetClassLabels.variableIncome",
                                                            )
                                                          : `${t(
                                                              "investments.assetClassLabels.fixedIncome",
                                                            )}: ${
                                                              investment.fixedIncomePercentage ||
                                                              0
                                                            }% | ${t(
                                                              "investments.assetClassLabels.variableIncome",
                                                            )}: ${
                                                              investment.variableIncomePercentage ||
                                                              0
                                                            }%`}
                                                      {investment.isAlternative
                                                        ? ` · ${t(
                                                            "investments.assetClassLabels.alternative",
                                                          )}`
                                                        : ""}
                                                    </p>
                                                    {investment.isAutomatedPortfolio ? (
                                                      <p>
                                                        <span className="font-medium">
                                                          {t(
                                                            "accounts.modals.automatedPortfolio",
                                                          )}
                                                        </span>
                                                      </p>
                                                    ) : (
                                                      <>
                                                        <p>
                                                          <span className="font-medium">
                                                            {t("common.amount")}
                                                            :
                                                          </span>{" "}
                                                          {t(
                                                            "accounts.modals.units",
                                                            {
                                                              quantity:
                                                                allocatedQuantity ??
                                                                investment.quantity,
                                                            },
                                                          )}
                                                        </p>
                                                        {allocationAveragePurchasePrice && (
                                                          <p>
                                                            <span className="font-medium">
                                                              {t(
                                                                "investments.detail.averagePurchasePriceLabel",
                                                              )}
                                                            </span>{" "}
                                                            {formatPrice(
                                                              allocationAveragePurchasePrice,
                                                              investment.currency,
                                                            )}
                                                          </p>
                                                        )}
                                                      </>
                                                    )}
                                                    <p>
                                                      <span className="font-medium">
                                                        {t(
                                                          "investments.detail.currentPriceLabel",
                                                        )}
                                                      </span>{" "}
                                                      {formatPrice(
                                                        investment.currentPrice,
                                                        investment.currency,
                                                      )}
                                                    </p>
                                                    {investment.notes && (
                                                      <p>
                                                        <span className="font-medium">
                                                          {t(
                                                            "investments.detail.notes",
                                                          )}
                                                          :
                                                        </span>{" "}
                                                        {investment.notes}
                                                      </p>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                </div>
                              )}

                            {/* Mostrar transacciones de la subcuenta */}
                            {(() => {
                              const subAccountTransactions =
                                getTransactionsForSubAccount(subAccount._id);
                              const isTransactionsExpanded =
                                expandedSubAccountTransactions.has(
                                  subAccount._id,
                                );

                              if (subAccountTransactions.length === 0)
                                return null;

                              return (
                                <div className="px-3 pb-1.5 border-t border-gray-100 dark:border-gray-800/50">
                                  <button
                                    onClick={() =>
                                      toggleSubAccountTransactions(
                                        subAccount._id,
                                      )
                                    }
                                    className="flex items-center justify-between w-full mt-1.5 py-0.5 px-1 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 rounded transition-colors text-left group"
                                  >
                                    <span className="text-xs text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400">
                                      {subAccountTransactions.length}{" "}
                                      {t("transactions.title").toLowerCase()}
                                    </span>
                                    {isTransactionsExpanded ? (
                                      <CgChevronDown className="h-3 w-3 text-gray-300 dark:text-gray-600" />
                                    ) : (
                                      <CgChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600" />
                                    )}
                                  </button>

                                  {isTransactionsExpanded && (
                                    <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto">
                                      {subAccountTransactions.map(
                                        (transaction) => (
                                          <div
                                            key={transaction._id}
                                            onClick={() => {
                                              setSelectedTransaction(
                                                transaction,
                                              );
                                              setShowTransactionDetailModal(
                                                true,
                                              );
                                            }}
                                            className="bg-gray-50/50 dark:bg-gray-800/30 rounded border border-gray-100 dark:border-gray-800/50 p-2 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                                      transaction.type ===
                                                      "income"
                                                        ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-500"
                                                        : transaction.type ===
                                                            "expense"
                                                          ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500"
                                                          : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-500"
                                                    }`}
                                                  >
                                                    {transaction.type ===
                                                    "income"
                                                      ? t(
                                                          "transactions.types.income",
                                                        )
                                                      : transaction.type ===
                                                          "expense"
                                                        ? t(
                                                            "transactions.types.expense",
                                                          )
                                                        : t(
                                                            "transactions.types.transfer",
                                                          )}
                                                  </span>
                                                  <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                                                    {format(
                                                      new Date(
                                                        transaction.date,
                                                      ),
                                                      "dd MMM",
                                                      {
                                                        locale: es,
                                                      },
                                                    )}
                                                  </span>
                                                </div>
                                                <div className="mt-1">
                                                  <span className="text-sm text-gray-600 dark:text-gray-400 truncate block">
                                                    {transaction.category}
                                                  </span>
                                                  {transaction.description && (
                                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                                                      {transaction.description}
                                                    </p>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="text-right flex-shrink-0">
                                                <span
                                                  className={`text-sm font-medium whitespace-nowrap ${
                                                    transaction.type ===
                                                    "income"
                                                      ? "text-green-500 dark:text-green-500"
                                                      : transaction.type ===
                                                          "expense"
                                                        ? "text-red-500 dark:text-red-500"
                                                        : "text-blue-500 dark:text-blue-500"
                                                  }`}
                                                >
                                                  {transaction.type === "income"
                                                    ? "+"
                                                    : transaction.type ===
                                                        "expense"
                                                      ? "-"
                                                      : "↔"}
                                                  {new Intl.NumberFormat(
                                                    "es-ES",
                                                    {
                                                      style: "currency",
                                                      currency:
                                                        transaction.currency,
                                                      minimumFractionDigits: 0,
                                                      maximumFractionDigits: 0,
                                                    },
                                                  ).format(transaction.amount)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}

                      {/* Mostrar inversiones directas después de las subcuentas */}
                      {getInvestmentsForAccount(account._id).map(
                        (investment) => {
                          const metrics = getAllocationMetrics(
                            investment,
                            (allocation) =>
                              allocation.accountId?.toString() ===
                                account._id?.toString() &&
                              !allocation.subAccountId,
                          );
                          const investmentValue = metrics.currentValue;
                          const investedCapital = metrics.investedCapital;
                          const allocatedQuantity = metrics.quantity;
                          const allocationAveragePurchasePrice =
                            allocatedQuantity && allocatedQuantity > 0
                              ? investedCapital / allocatedQuantity
                              : investment.averagePurchasePrice;
                          const profitLoss = investmentValue - investedCapital;
                          const profitLossPercent =
                            investedCapital > 0
                              ? (profitLoss / investedCapital) * 100
                              : 0;
                          const isInvestmentExpanded = expandedSubAccounts.has(
                            `investment-${investment._id}`,
                          );

                          return (
                            <div
                              key={investment._id}
                              className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-lg border border-gray-200/50 dark:border-[#404040]/50"
                            >
                              <div
                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#404040]/50 transition-colors"
                                onClick={(e) => {
                                  // Evitar que se active cuando se hace clic en el botón de colapsar
                                  if (
                                    e.target.tagName === "BUTTON" ||
                                    e.target.closest("button")
                                  ) {
                                    return;
                                  }
                                  // Si está expandido, colapsar; si está colapsado, expandir
                                  toggleSubAccount(
                                    `investment-${investment._id}`,
                                  );
                                }}
                              >
                                <div className="flex items-center flex-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSubAccount(
                                        `investment-${investment._id}`,
                                      );
                                    }}
                                    className="mr-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                  >
                                    {isInvestmentExpanded ? (
                                      <CgChevronDown className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                    ) : (
                                      <CgChevronRight className="h-4 w-4 text-gray-800 dark:text-[#e5e5e5]" />
                                    )}
                                  </button>
                                  <div
                                    className="p-2 rounded-lg mr-3"
                                    style={{
                                      backgroundColor: "var(--user-color-100)",
                                      color: "var(--user-color-600)",
                                    }}
                                  >
                                    {investment.isAutomatedPortfolio ||
                                    investment.type ===
                                      "automated_portfolio" ? (
                                      <CgBot
                                        className="h-4 w-4"
                                        style={{
                                          color: "var(--user-color-600)",
                                        }}
                                      />
                                    ) : investment.type === "crypto" ? (
                                      <SiBitcoin
                                        className="h-4 w-4"
                                        style={{
                                          color: "var(--user-color-600)",
                                        }}
                                      />
                                    ) : (
                                      <CgTrending
                                        className="h-4 w-4"
                                        style={{
                                          color: "var(--user-color-600)",
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                      {investment.name}
                                    </h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                      {getInvestmentTypeLabel(investment.type)}
                                      {investment.symbol &&
                                        ` • ${investment.symbol}`}
                                    </p>
                                  </div>
                                  <div className="text-right mr-4">
                                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                      {new Intl.NumberFormat("es-ES", {
                                        style: "currency",
                                        currency: investment.currency,
                                      }).format(investmentValue)}
                                    </p>
                                    <p
                                      className={`text-xs ${profitLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                                    >
                                      {profitLoss >= 0 ? "+" : ""}
                                      {new Intl.NumberFormat("es-ES", {
                                        style: "currency",
                                        currency: investment.currency,
                                      }).format(profitLoss)}{" "}
                                      ({profitLossPercent >= 0 ? "+" : ""}
                                      {profitLossPercent.toFixed(2)}%)
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
                                        const [historyRes, variationsRes] =
                                          await Promise.all([
                                            api.get(
                                              `/investment-history/investment/${investment._id}`,
                                            ),
                                            api.get(
                                              `/investment-history/investment/${investment._id}/daily-variations`,
                                            ),
                                          ]);
                                        setDetailInvestmentHistory(
                                          historyRes.data || [],
                                        );
                                        setDetailDailyVariations(
                                          variationsRes.data || [],
                                        );
                                      } catch (error) {
                                        setDetailInvestmentHistory([]);
                                        setDetailDailyVariations([]);
                                      }
                                    }}
                                  >
                                    <div className="space-y-1 text-sm">
                                      <p>
                                        <span className="font-medium">
                                          Tipo:
                                        </span>{" "}
                                        {investment.assetClass ===
                                        "fixed_income"
                                          ? `${t(
                                              "investments.assetClassLabels.fixedIncome",
                                            )}${
                                              getFixedIncomeSubtypeLabel(
                                                investment.fixedIncomeSubtype,
                                              )
                                                ? ` · ${getFixedIncomeSubtypeLabel(
                                                    investment.fixedIncomeSubtype,
                                                  )}`
                                                : ""
                                            }`
                                          : investment.assetClass ===
                                              "variable_income"
                                            ? t(
                                                "investments.assetClassLabels.variableIncome",
                                              )
                                            : `${t(
                                                "investments.assetClassLabels.fixedIncome",
                                              )}: ${
                                                investment.fixedIncomePercentage ||
                                                0
                                              }% | ${t(
                                                "investments.assetClassLabels.variableIncome",
                                              )}: ${
                                                investment.variableIncomePercentage ||
                                                0
                                              }%`}
                                        {investment.isAlternative
                                          ? ` · ${t(
                                              "investments.assetClassLabels.alternative",
                                            )}`
                                          : ""}
                                      </p>
                                      {investment.isAutomatedPortfolio ? (
                                        <p>
                                          <span className="font-medium">
                                            {t(
                                              "accounts.modals.automatedPortfolio",
                                            )}
                                          </span>
                                        </p>
                                      ) : (
                                        <>
                                          <p>
                                            <span className="font-medium">
                                              {t(
                                                "investments.detail.quantityLabel",
                                              )}
                                            </span>{" "}
                                            {t("investments.detail.units", {
                                              quantity:
                                                allocatedQuantity ??
                                                investment.quantity,
                                            })}
                                          </p>
                                          {allocationAveragePurchasePrice && (
                                            <p>
                                              <span className="font-medium">
                                                Precio medio:
                                              </span>{" "}
                                              {formatPrice(
                                                allocationAveragePurchasePrice,
                                                investment.currency,
                                              )}
                                            </p>
                                          )}
                                        </>
                                      )}
                                      <p>
                                        <span className="font-medium">
                                          Precio actual:
                                        </span>{" "}
                                        {formatPrice(
                                          investment.currentPrice,
                                          investment.currency,
                                        )}
                                      </p>
                                      {investment.notes && (
                                        <p>
                                          <span className="font-medium">
                                            Notas:
                                          </span>{" "}
                                          {investment.notes}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
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
        >
          <div
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {editingAccount
                  ? t("accounts.modals.editAccount")
                  : t("accounts.modals.newAccount")}
              </h2>
              <button
                onClick={() => {
                  setShowAccountModal(false);
                  resetAccountForm();
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.accountName")}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={accountFormData.name}
                  onChange={(e) =>
                    setAccountFormData({
                      ...accountFormData,
                      name: e.target.value,
                    })
                  }
                  placeholder={t("accounts.modals.accountNamePlaceholder")}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.bankName")}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={accountFormData.bankName}
                  onChange={(e) =>
                    setAccountFormData({
                      ...accountFormData,
                      bankName: e.target.value,
                    })
                  }
                  placeholder={t("accounts.modals.bankNamePlaceholder")}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.accountNumber")}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={accountFormData.accountNumber}
                  onChange={(e) =>
                    setAccountFormData({
                      ...accountFormData,
                      accountNumber: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("common.currency")}
                </label>
                <select
                  className="input-field"
                  value={accountFormData.currency}
                  onChange={(e) =>
                    setAccountFormData({
                      ...accountFormData,
                      currency: e.target.value,
                    })
                  }
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.description")}
                </label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={accountFormData.description}
                  onChange={(e) =>
                    setAccountFormData({
                      ...accountFormData,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.bankColor")}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="h-10 w-20 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                    value={accountFormData.color}
                    onChange={(e) =>
                      setAccountFormData({
                        ...accountFormData,
                        color: e.target.value,
                      })
                    }
                  />
                  <input
                    type="text"
                    className="input-field flex-1"
                    value={accountFormData.color}
                    onChange={(e) =>
                      setAccountFormData({
                        ...accountFormData,
                        color: e.target.value,
                      })
                    }
                    placeholder="#3b82f6"
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t("accounts.modals.bankColorDescription")}
                </p>
              </div>
              {!editingAccount && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("accounts.modals.initialBalance")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={accountFormData.initialBalance}
                    onChange={(e) =>
                      setAccountFormData({
                        ...accountFormData,
                        initialBalance: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t("accounts.modals.initialBalanceDescription")}
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingAccount
                    ? t("accounts.modals.update")
                    : t("accounts.modals.create")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountModal(false);
                    resetAccountForm();
                  }}
                  className="flex-1 btn-secondary"
                >
                  {t("common.cancel")}
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
        >
          <div
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {editingSubAccount
                  ? t("accounts.modals.editSubAccount")
                  : t("accounts.modals.newSubAccount")}
              </h2>
              <button
                onClick={() => {
                  setShowSubAccountModal(false);
                  resetSubAccountForm();
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubAccountSubmit} className="space-y-4">
              {!editingSubAccount && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("accounts.modals.mainAccount")}
                  </label>
                  <select
                    className="input-field"
                    value={selectedAccountId || ""}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    required
                  >
                    <option value="">
                      {t("accounts.modals.selectAccount")}
                    </option>
                    {accounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.name} - {acc.bankName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.accountName")}
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={subAccountFormData.name}
                  onChange={(e) =>
                    setSubAccountFormData({
                      ...subAccountFormData,
                      name: e.target.value,
                    })
                  }
                  placeholder={t("accounts.modals.subAccountNamePlaceholder")}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.subAccountType")}
                </label>
                <select
                  className="input-field"
                  value={subAccountFormData.type}
                  onChange={(e) =>
                    setSubAccountFormData({
                      ...subAccountFormData,
                      type: e.target.value,
                    })
                  }
                  required
                >
                  <option value="cash">
                    {t("accounts.subAccountTypes.cash")}
                  </option>
                  <option value="investment">
                    {t("accounts.subAccountTypes.investment")}
                  </option>
                  <option value="savings">
                    {t("accounts.subAccountTypes.savings")}
                  </option>
                  <option value="credit">
                    {t("accounts.subAccountTypes.credit")}
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.balance")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={subAccountFormData.balance}
                  onChange={(e) =>
                    setSubAccountFormData({
                      ...subAccountFormData,
                      balance: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("common.currency")}
                </label>
                <select
                  className="input-field"
                  value={subAccountFormData.currency}
                  onChange={(e) =>
                    setSubAccountFormData({
                      ...subAccountFormData,
                      currency: e.target.value,
                    })
                  }
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("accounts.modals.description")}
                </label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={subAccountFormData.description}
                  onChange={(e) =>
                    setSubAccountFormData({
                      ...subAccountFormData,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              {(subAccountFormData.type === "cash" ||
                subAccountFormData.type === "savings") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("accounts.modals.cashCreationDate")}
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={subAccountFormData.initialDate}
                    onChange={(e) =>
                      setSubAccountFormData({
                        ...subAccountFormData,
                        initialDate: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t("accounts.modals.cashCreationDateDescription")}
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingSubAccount
                    ? t("accounts.modals.update")
                    : t("accounts.modals.create")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSubAccountModal(false);
                    resetSubAccountForm();
                  }}
                  className="flex-1 btn-secondary"
                >
                  {t("common.cancel")}
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {detailInvestment.symbol}
                  </p>
                )}
                {detailInvestment.isin && !detailInvestment.symbol && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {t("accounts.modals.isinLabel")} {detailInvestment.isin}
                  </p>
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
                          {t("accounts.modals.automatedPortfolio")}
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
                            {t("accounts.modals.units", {
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
                                {t("investments.detail.purchasePriceLabel")}
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
                        {t("investments.detail.profitLossLabel")}
                      </span>
                      <span
                        className={`font-bold flex items-center ${
                          calculateProfitLoss(detailInvestment) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {calculateProfitLoss(detailInvestment) >= 0 ? (
                          <CgTrending className="h-4 w-4 mr-1" />
                        ) : (
                          <CgTrendingDown className="h-4 w-4 mr-1" />
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
                            className={`font-medium ${
                              detailInvestment.autoUpdate !== false
                                ? "text-green-600 dark:text-green-400"
                                : "text-gray-500 dark:text-gray-400"
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
                                        {t("accounts.modals.totalValue")}
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
                        {t("accounts.modals.noHistoryData")}
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
                                        {t("accounts.modals.dailyChange")}
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
                                          {t("accounts.modals.variation")}
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
                                          {t("accounts.modals.variation")}
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
                        {t("accounts.modals.noVariationData")}
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
                  navigate("/investments");
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

      {/* Modal de detalle de transacción */}
      {showTransactionDetailModal && selectedTransaction && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4"
          onClick={() => {
            if (!editingTransaction) {
              setShowTransactionDetailModal(false);
              setSelectedTransaction(null);
              setEditingTransaction(false);
            }
          }}
        >
          <div
            className="modal-content max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {editingTransaction
                  ? t("transactions.editTransaction") || "Editar Transacción"
                  : t("transactions.details") || "Detalle de Transacción"}
              </h2>
              {!editingTransaction && (
                <button
                  onClick={handleEditTransaction}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={t("transactions.editTransaction") || "Editar"}
                >
                  <CgEditMarkup className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="space-y-4">
              {editingTransaction ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.subAccount")}
                    </label>
                    <select
                      className="input-field"
                      value={transactionFormData.subAccount}
                      onChange={(e) =>
                        setTransactionFormData({
                          ...transactionFormData,
                          subAccount: e.target.value,
                        })
                      }
                      required
                      disabled
                    >
                      <option value={transactionFormData.subAccount}>
                        {selectedTransaction.subAccount?.account?.name ||
                          selectedTransaction.account?.name ||
                          ""}{" "}
                        - {selectedTransaction.subAccount?.name || ""}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.type")}
                    </label>
                    <select
                      className="input-field"
                      value={transactionFormData.type}
                      onChange={(e) =>
                        setTransactionFormData({
                          ...transactionFormData,
                          type: e.target.value,
                        })
                      }
                      required
                      disabled
                    >
                      <option value="income">
                        {t("transactions.types.income")}
                      </option>
                      <option value="expense">
                        {t("transactions.types.expense")}
                      </option>
                      <option value="transfer">
                        {t("transactions.types.transfer")}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.category")}
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={transactionFormData.category}
                      onChange={(e) =>
                        setTransactionFormData({
                          ...transactionFormData,
                          category: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.amount")}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-field"
                      value={transactionFormData.amount}
                      onChange={(e) =>
                        setTransactionFormData({
                          ...transactionFormData,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.date")}
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={transactionFormData.date}
                      onChange={(e) =>
                        setTransactionFormData({
                          ...transactionFormData,
                          date: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.description")}
                    </label>
                    <textarea
                      className="input-field"
                      rows="3"
                      value={transactionFormData.description}
                      onChange={(e) =>
                        setTransactionFormData({
                          ...transactionFormData,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.type")}
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          selectedTransaction.type === "income"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : selectedTransaction.type === "expense"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        }`}
                      >
                        {selectedTransaction.type === "income"
                          ? t("transactions.types.income")
                          : selectedTransaction.type === "expense"
                            ? t("transactions.types.expense")
                            : t("transactions.types.transfer")}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.amount")}
                    </label>
                    <p
                      className={`text-lg font-semibold ${
                        selectedTransaction.type === "income"
                          ? "text-green-600 dark:text-green-400"
                          : selectedTransaction.type === "expense"
                            ? "text-red-600 dark:text-red-400"
                            : "text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      {selectedTransaction.type === "income"
                        ? "+"
                        : selectedTransaction.type === "expense"
                          ? "-"
                          : "↔"}
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: selectedTransaction.currency,
                      }).format(selectedTransaction.amount)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.category")}
                    </label>
                    <p className="text-gray-900 dark:text-gray-100">
                      {selectedTransaction.category}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.date")}
                    </label>
                    <p className="text-gray-900 dark:text-gray-100">
                      {format(
                        new Date(selectedTransaction.date),
                        "dd 'de' MMMM 'de' yyyy",
                        {
                          locale: es,
                        },
                      )}
                    </p>
                  </div>

                  {selectedTransaction.description && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("transactions.description")}
                      </label>
                      <p className="text-gray-900 dark:text-gray-100">
                        {selectedTransaction.description}
                      </p>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("transactions.account")}
                </label>
                <p className="text-gray-900 dark:text-gray-100">
                  {selectedTransaction.account?.name
                    ? `${selectedTransaction.account.bankName || ""} ${selectedTransaction.account.name}`.trim()
                    : selectedTransaction.subAccount?.account?.name
                      ? `${selectedTransaction.subAccount.account.bankName || ""} ${selectedTransaction.subAccount.account.name}`.trim()
                      : "-"}
                </p>
              </div>

              {selectedTransaction.subAccount && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("transactions.subAccount")}
                  </label>
                  <p className="text-gray-900 dark:text-gray-100">
                    {selectedTransaction.subAccount.name} (
                    {selectedTransaction.subAccount.type === "cash"
                      ? t("accounts.subAccountTypes.cash")
                      : selectedTransaction.subAccount.type === "investment"
                        ? t("accounts.subAccountTypes.investment")
                        : selectedTransaction.subAccount.type === "savings"
                          ? t("accounts.subAccountTypes.savings")
                          : t("accounts.subAccountTypes.credit")}
                    )
                  </p>
                </div>
              )}

              {selectedTransaction.tags &&
                selectedTransaction.tags.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("transactions.tags") || "Etiquetas"}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {selectedTransaction.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              <div className="flex gap-3 pt-4">
                {editingTransaction ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="flex-1 btn-secondary"
                    >
                      {t("common.cancel") || "Cancelar"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTransaction}
                      className="flex-1 btn-primary"
                    >
                      {t("transactions.update") || "Actualizar"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowTransactionDetailModal(false);
                      setSelectedTransaction(null);
                      setEditingTransaction(false);
                    }}
                    className="flex-1 btn-primary"
                  >
                    {t("common.close") || "Cerrar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;
