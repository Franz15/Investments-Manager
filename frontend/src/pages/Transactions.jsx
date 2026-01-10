import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Edit,
  Trash2,
  Search,
  Filter,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { useTranslation } from "../contexts/TranslationContext";

const Transactions = () => {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filtros
  const [filters, setFilters] = useState({
    search: "",
    accountId: "",
    subAccountId: "",
    type: "",
    category: "",
    startDate: "",
    endDate: "",
  });

  const [formData, setFormData] = useState({
    account: "",
    subAccount: "",
    type: "expense",
    category: "",
    amount: 0,
    currency: "EUR",
    description: "",
    date: new Date().toISOString().split("T")[0],
    // Para transferencias
    toAccount: "",
    toSubAccount: "",
    useAccount: false, // true si se usa cuenta, false si se usa subcuenta
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [transactionsRes, subAccountsRes, accountsRes] = await Promise.all([
        api.get("/transactions"),
        api.get("/subaccounts"),
        api.get("/accounts"),
      ]);
      setTransactions(transactionsRes.data);
      setSubAccounts(subAccountsRes.data);
      setAccounts(accountsRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  // Filtrar transacciones
  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      // Búsqueda por texto
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          transaction.description?.toLowerCase().includes(searchLower) ||
          transaction.category?.toLowerCase().includes(searchLower) ||
          transaction.subAccount?.name?.toLowerCase().includes(searchLower) ||
          transaction.subAccount?.account?.name
            ?.toLowerCase()
            .includes(searchLower) ||
          transaction.account?.name?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Filtro por cuenta
      if (filters.accountId) {
        const accountId =
          transaction.account?._id ||
          transaction.account ||
          transaction.subAccount?.account?._id ||
          transaction.subAccount?.account;
        if (accountId?.toString() !== filters.accountId) return false;
      }

      // Filtro por subcuenta
      if (filters.subAccountId) {
        const subAccountId =
          transaction.subAccount?._id || transaction.subAccount;
        if (subAccountId?.toString() !== filters.subAccountId) return false;
      }

      // Filtro por tipo
      if (filters.type) {
        if (transaction.type !== filters.type) return false;
      }

      // Filtro por categoría
      if (filters.category) {
        if (
          transaction.category?.toLowerCase() !== filters.category.toLowerCase()
        )
          return false;
      }

      // Filtro por fecha
      if (filters.startDate) {
        const transactionDate = new Date(transaction.date);
        const startDate = new Date(filters.startDate);
        if (transactionDate < startDate) return false;
      }

      if (filters.endDate) {
        const transactionDate = new Date(transaction.date);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (transactionDate > endDate) return false;
      }

      return true;
    });
  }, [transactions, filters]);

  // Calcular estadísticas
  const statistics = useMemo(() => {
    const stats = {
      totalIncome: 0,
      totalExpense: 0,
      totalTransfer: 0,
      count: filteredTransactions.length,
    };

    filteredTransactions.forEach((transaction) => {
      if (transaction.type === "income") {
        stats.totalIncome += transaction.amount;
      } else if (transaction.type === "expense") {
        stats.totalExpense += transaction.amount;
      } else if (transaction.type === "transfer") {
        stats.totalTransfer += transaction.amount;
      }
    });

    stats.net = stats.totalIncome - stats.totalExpense;
    return stats;
  }, [filteredTransactions]);

  // Obtener categorías únicas
  const categories = useMemo(() => {
    const cats = new Set();
    transactions.forEach((t) => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats).sort();
  }, [transactions]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.type === "transfer") {
        // Para transferencias, crear dos transacciones
        const hasDestination = formData.useAccount
          ? formData.toAccount
          : formData.toSubAccount;

        if (!hasDestination) {
          alert(
            t("transactions.selectDestination") ||
              "Selecciona la cuenta o subcuenta de destino",
          );
          return;
        }

        // Preparar transacción de salida
        const expenseTransaction = {
          type: "expense",
          category: formData.category || "Transferencia",
          amount: formData.amount,
          currency: formData.currency,
          description: formData.description || "Transferencia",
          date: formData.date,
        };

        // Preparar transacción de entrada
        const incomeTransaction = {
          type: "income",
          category: formData.category || "Transferencia",
          amount: formData.amount,
          currency: formData.currency,
          description: formData.description || "Transferencia",
          date: formData.date,
        };

        // Asignar origen y destino según si se usa cuenta o subcuenta
        if (formData.useAccount) {
          expenseTransaction.account = formData.account;
          incomeTransaction.account = formData.toAccount;
        } else {
          expenseTransaction.subAccount = formData.subAccount;
          incomeTransaction.subAccount = formData.toSubAccount;
        }

        await Promise.all([
          api.post("/transactions", expenseTransaction),
          api.post("/transactions", incomeTransaction),
        ]);
      } else {
        // Para ingresos y gastos
        const transactionData = {
          type: formData.type,
          category: formData.category,
          amount: formData.amount,
          currency: formData.currency,
          description: formData.description,
          date: formData.date,
        };

        if (formData.useAccount) {
          transactionData.account = formData.account;
        } else {
          transactionData.subAccount = formData.subAccount;
        }

        if (editingTransaction) {
          await api.put(
            `/transactions/${editingTransaction._id}`,
            transactionData,
          );
        } else {
          await api.post("/transactions", transactionData);
        }
      }

      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Error saving transaction:", error);
      alert(error.response?.data?.message || "Error al guardar la transacción");
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    const hasAccount = transaction.account?._id || transaction.account;
    setFormData({
      account: hasAccount
        ? transaction.account?._id || transaction.account
        : "",
      subAccount: transaction.subAccount?._id || transaction.subAccount || "",
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description || "",
      date: new Date(transaction.date).toISOString().split("T")[0],
      toAccount: "",
      toSubAccount: "",
      useAccount: !!hasAccount,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t("transactions.deleteConfirm"))) {
      try {
        await api.delete(`/transactions/${id}`);
        fetchData();
      } catch (error) {
        console.error("Error deleting transaction:", error);
        alert("Error al eliminar la transacción");
      }
    }
  };

  const resetForm = () => {
    setFormData({
      account: "",
      subAccount: "",
      type: "expense",
      category: "",
      amount: 0,
      currency: "EUR",
      description: "",
      date: new Date().toISOString().split("T")[0],
      toAccount: "",
      toSubAccount: "",
      useAccount: false,
    });
    setEditingTransaction(null);
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      accountId: "",
      subAccountId: "",
      type: "",
      category: "",
      startDate: "",
      endDate: "",
    });
  };

  const hasActiveFilters = Object.values(filters).some((value) => value !== "");

  // Obtener subcuentas filtradas por cuenta seleccionada
  const filteredSubAccounts = useMemo(() => {
    if (filters.accountId) {
      return subAccounts.filter(
        (sa) =>
          (sa.account?._id || sa.account)?.toString() === filters.accountId,
      );
    }
    return subAccounts;
  }, [subAccounts, filters.accountId]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t("transactions.title")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t("transactions.subtitle")}
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          {t("transactions.newTransaction")}
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {t("transactions.totalIncome") || "Total Ingresos"}
          </div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {new Intl.NumberFormat("es-ES", {
              style: "currency",
              currency: "EUR",
            }).format(statistics.totalIncome)}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {t("transactions.totalExpense") || "Total Gastos"}
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {new Intl.NumberFormat("es-ES", {
              style: "currency",
              currency: "EUR",
            }).format(statistics.totalExpense)}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {t("transactions.net") || "Neto"}
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              statistics.net >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {new Intl.NumberFormat("es-ES", {
              style: "currency",
              currency: "EUR",
            }).format(statistics.net)}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {t("transactions.count") || "Total Transacciones"}
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {statistics.count}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t("transactions.filters") || "Filtros"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                {t("transactions.clearFilters") || "Limpiar"}
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              {showFilters ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.search") || "Buscar"}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  className="input-field pl-10"
                  placeholder={
                    t("transactions.searchPlaceholder") || "Buscar..."
                  }
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.account") || "Cuenta"}
              </label>
              <select
                className="input-field"
                value={filters.accountId}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    accountId: e.target.value,
                    subAccountId: "",
                  })
                }
              >
                <option value="">
                  {t("transactions.allAccounts") || "Todas"}
                </option>
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.subAccount") || "Subcuenta"}
              </label>
              <select
                className="input-field"
                value={filters.subAccountId}
                onChange={(e) =>
                  setFilters({ ...filters, subAccountId: e.target.value })
                }
                disabled={
                  !filters.accountId && filteredSubAccounts.length === 0
                }
              >
                <option value="">
                  {t("transactions.allSubAccounts") || "Todas"}
                </option>
                {filteredSubAccounts.map((subAccount) => (
                  <option key={subAccount._id} value={subAccount._id}>
                    {subAccount.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.type") || "Tipo"}
              </label>
              <select
                className="input-field"
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
              >
                <option value="">
                  {t("transactions.allTypes") || "Todos"}
                </option>
                <option value="income">{t("transactions.types.income")}</option>
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
                {t("transactions.category") || "Categoría"}
              </label>
              <select
                className="input-field"
                value={filters.category}
                onChange={(e) =>
                  setFilters({ ...filters, category: e.target.value })
                }
              >
                <option value="">
                  {t("transactions.allCategories") || "Todas"}
                </option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.startDate") || "Fecha Inicio"}
              </label>
              <input
                type="date"
                className="input-field"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.endDate") || "Fecha Fin"}
              </label>
              <input
                type="date"
                className="input-field"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabla de transacciones */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("common.date")}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("transactions.account")}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("common.type")}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("transactions.category")}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("transactions.description")}
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("common.amount")}
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr
                  key={transaction._id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="py-3 px-4">
                    {format(new Date(transaction.date), "dd MMM yyyy", {
                      locale: es,
                    })}
                  </td>
                  <td className="py-3 px-4">
                    {transaction.account?.name ? (
                      <div>
                        <div className="font-medium">
                          {transaction.account.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {transaction.subAccount?.name ||
                            t("transactions.mainAccount") ||
                            "Cuenta Principal"}
                        </div>
                      </div>
                    ) : transaction.subAccount?.account?.name ? (
                      <div>
                        <div className="font-medium">
                          {transaction.subAccount.account.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {transaction.subAccount.name} (
                          {transaction.subAccount.type === "cash"
                            ? t("accounts.subAccountTypes.cash")
                            : transaction.subAccount.type === "investment"
                              ? t("accounts.subAccountTypes.investment")
                              : transaction.subAccount.type === "savings"
                                ? t("accounts.subAccountTypes.savings")
                                : t("accounts.subAccountTypes.credit")}
                          )
                        </div>
                      </div>
                    ) : (
                      transaction.subAccount?.name ||
                      transaction.account?.name ||
                      "-"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        transaction.type === "income"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : transaction.type === "expense"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      }`}
                    >
                      {transaction.type === "income" ? (
                        <ArrowUp className="h-3 w-3 mr-1" />
                      ) : transaction.type === "expense" ? (
                        <ArrowDown className="h-3 w-3 mr-1" />
                      ) : null}
                      {transaction.type === "income"
                        ? t("transactions.types.income")
                        : transaction.type === "expense"
                          ? t("transactions.types.expense")
                          : t("transactions.types.transfer")}
                    </span>
                  </td>
                  <td className="py-3 px-4">{transaction.category}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {transaction.description || "-"}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-semibold ${
                      transaction.type === "income"
                        ? "text-green-600 dark:text-green-400"
                        : transaction.type === "expense"
                          ? "text-red-600 dark:text-red-400"
                          : "text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {transaction.type === "income"
                      ? "+"
                      : transaction.type === "expense"
                        ? "-"
                        : "↔"}
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: transaction.currency,
                    }).format(transaction.amount)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(transaction)}
                        className="p-1 text-gray-600 dark:text-gray-400 transition-colors"
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color =
                            "var(--user-color-600)")
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.color = "")}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(transaction._id)}
                        className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {hasActiveFilters
                ? t("transactions.noFilteredTransactions") ||
                  "No hay transacciones que coincidan con los filtros"
                : t("transactions.noTransactions")}
            </div>
          )}
        </div>
      </div>

      {/* Modal de formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingTransaction
                ? t("transactions.editTransaction")
                : t("transactions.newTransaction")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingTransaction && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("transactions.selectType") || "Tipo de selección"}
                  </label>
                  <select
                    className="input-field"
                    value={formData.useAccount ? "account" : "subAccount"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        useAccount: e.target.value === "account",
                        account:
                          e.target.value === "account" ? formData.account : "",
                        subAccount:
                          e.target.value === "subAccount"
                            ? formData.subAccount
                            : "",
                      })
                    }
                  >
                    <option value="account">
                      {t("transactions.account") || "Cuenta"}
                    </option>
                    <option value="subAccount">
                      {t("transactions.subAccount") || "Subcuenta"}
                    </option>
                  </select>
                </div>
              )}

              {formData.useAccount ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("transactions.account")}
                  </label>
                  <select
                    className="input-field"
                    value={formData.account}
                    onChange={(e) =>
                      setFormData({ ...formData, account: e.target.value })
                    }
                    required
                    disabled={!!editingTransaction}
                  >
                    <option value="">
                      {t("transactions.selectAccount") || "Seleccionar cuenta"}
                    </option>
                    {accounts.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.bankName} - {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("transactions.subAccount")}
                  </label>
                  <select
                    className="input-field"
                    value={formData.subAccount}
                    onChange={(e) =>
                      setFormData({ ...formData, subAccount: e.target.value })
                    }
                    required
                    disabled={!!editingTransaction}
                  >
                    <option value="">
                      {t("transactions.selectSubAccount")}
                    </option>
                    {subAccounts.map((subAccount) => (
                      <option key={subAccount._id} value={subAccount._id}>
                        {subAccount.account?.name || subAccount.account} -{" "}
                        {subAccount.name} (
                        {subAccount.type === "cash"
                          ? t("accounts.subAccountTypes.cash")
                          : subAccount.type === "investment"
                            ? t("accounts.subAccountTypes.investment")
                            : subAccount.type === "savings"
                              ? t("accounts.subAccountTypes.savings")
                              : t("accounts.subAccountTypes.credit")}
                        )
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.type === "transfer" && !editingTransaction && (
                <>
                  {formData.useAccount ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("transactions.toAccount") || "Cuenta Destino"}
                      </label>
                      <select
                        className="input-field"
                        value={formData.toAccount}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            toAccount: e.target.value,
                          })
                        }
                        required
                      >
                        <option value="">
                          {t("transactions.selectToAccount") ||
                            "Seleccionar cuenta destino"}
                        </option>
                        {accounts
                          .filter((a) => a._id !== formData.account)
                          .map((account) => (
                            <option key={account._id} value={account._id}>
                              {account.bankName} - {account.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("transactions.toSubAccount") || "Subcuenta Destino"}
                      </label>
                      <select
                        className="input-field"
                        value={formData.toSubAccount}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            toSubAccount: e.target.value,
                          })
                        }
                        required
                      >
                        <option value="">
                          {t("transactions.selectToSubAccount") ||
                            "Seleccionar subcuenta destino"}
                        </option>
                        {subAccounts
                          .filter((sa) => sa._id !== formData.subAccount)
                          .map((subAccount) => (
                            <option key={subAccount._id} value={subAccount._id}>
                              {subAccount.account?.name || subAccount.account} -{" "}
                              {subAccount.name} (
                              {subAccount.type === "cash"
                                ? t("accounts.subAccountTypes.cash")
                                : subAccount.type === "investment"
                                  ? t("accounts.subAccountTypes.investment")
                                  : subAccount.type === "savings"
                                    ? t("accounts.subAccountTypes.savings")
                                    : t("accounts.subAccountTypes.credit")}
                              )
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("transactions.type")}
                </label>
                <select
                  className="input-field"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value,
                      toSubAccount: "",
                    })
                  }
                  required
                  disabled={!!editingTransaction}
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
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
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
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
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
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
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
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingTransaction
                    ? t("transactions.update")
                    : t("transactions.create")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
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
    </div>
  );
};

export default Transactions;
