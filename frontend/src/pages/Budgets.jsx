import { useEffect, useState } from "react";
import {
  Plus,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { useTranslation } from "../contexts/TranslationContext";

const Budgets = () => {
  const { t } = useTranslation();
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [statistics, setStatistics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [selectedContext, setSelectedContext] = useState("all"); // "all", "personal", or businessId
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    amount: 0,
    currency: "EUR",
    period: "monthly",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    isActive: true,
    business: null,
    notifications: {
      enabled: true,
      threshold: 80,
    },
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [budgetsRes, categoriesRes, businessesRes, statsRes] =
        await Promise.all([
          api.get("/budgets"),
          api.get("/categories?type=expense"),
          api.get("/businesses"),
          api.get("/budgets/statistics/overview"),
        ]);
      setBudgets(budgetsRes.data);
      setCategories(categoriesRes.data);
      setBusinesses(businessesRes.data);
      setStatistics(statsRes.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, [selectedContext]);

  const fetchBudgets = async () => {
    try {
      const params = {};
      if (selectedContext === "personal") {
        params.business = "null";
      } else if (selectedContext !== "all") {
        params.business = selectedContext;
      }
      const response = await api.get("/budgets", { params });
      setBudgets(response.data);
    } catch (error) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBudget) {
        await api.put(`/budgets/${editingBudget._id}`, formData);
      } else {
        await api.post("/budgets", formData);
      }
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {}
  };

  const handleEdit = (budget) => {
    setEditingBudget(budget);
    setFormData({
      name: budget.name,
      category: budget.category?._id || budget.category,
      amount: budget.amount,
      currency: budget.currency,
      period: budget.period,
      startDate: new Date(budget.startDate).toISOString().split("T")[0],
      endDate: budget.endDate
        ? new Date(budget.endDate).toISOString().split("T")[0]
        : "",
      isActive: budget.isActive,
      business: budget.business?._id || budget.business || null,
      notifications: budget.notifications || {
        enabled: true,
        threshold: 80,
      },
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t("budgets.deleteConfirm"))) {
      try {
        await api.delete(`/budgets/${id}`);
        fetchData();
      } catch (error) {}
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      amount: 0,
      currency: "EUR",
      period: "monthly",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      isActive: true,
      business:
        selectedContext === "personal"
          ? null
          : selectedContext !== "all"
            ? selectedContext
            : null,
      notifications: {
        enabled: true,
        threshold: 80,
      },
    });
    setEditingBudget(null);
  };

  const getBudgetStats = (budgetId) => {
    return statistics.find((stat) => stat.budgetId === budgetId);
  };

  const getPercentageColor = (percentage) => {
    if (percentage >= 100) return "text-red-600";
    if (percentage >= 80) return "text-orange-600";
    return "text-green-600";
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t("budgets.title")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t("budgets.subtitle")}
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
          {t("budgets.newBudget")}
        </button>
      </div>

      {/* Selector de contexto */}
      <div className="card">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("budgets.context")}:
          </span>
          <button
            onClick={() => setSelectedContext("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedContext === "all"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {t("budgets.allContexts")}
          </button>
          <button
            onClick={() => setSelectedContext("personal")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedContext === "personal"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {t("budgets.personal")}
          </button>
          {businesses.map((business) => (
            <button
              key={business._id}
              onClick={() => setSelectedContext(business._id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedContext === business._id
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              style={
                selectedContext === business._id
                  ? {
                      backgroundColor: `${business.color}20`,
                      color: business.color,
                    }
                  : {}
              }
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: business.color }}
              ></div>
              {business.name}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen de presupuestos */}
      {statistics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("budgets.totalBudgeted")}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: "EUR",
                  }).format(
                    statistics.reduce((sum, stat) => sum + stat.budgeted, 0),
                  )}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-gray-400" />
            </div>
          </div>
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("budgets.totalSpent")}
                </p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: "EUR",
                  }).format(
                    statistics.reduce((sum, stat) => sum + stat.spent, 0),
                  )}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("budgets.totalRemaining")}
                </p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: "EUR",
                  }).format(
                    statistics.reduce((sum, stat) => sum + stat.remaining, 0),
                  )}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("budgets.name")}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("budgets.category")}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("budgets.period")}
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("budgets.budgeted")}
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("budgets.spent")}
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("budgets.remaining")}
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("budgets.usage")}
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget) => {
                const stats = getBudgetStats(budget._id);
                const percentageUsed = stats?.percentageUsed || 0;
                return (
                  <tr
                    key={budget._id}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="py-3 px-4 font-medium">{budget.name}</td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${budget.category?.color || "#6B7280"}20`,
                          color: budget.category?.color || "#6B7280",
                        }}
                      >
                        {budget.category?.name || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                      {t(`budgets.periods.${budget.period}`)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: budget.currency,
                      }).format(budget.amount)}
                    </td>
                    <td className="py-3 px-4 text-right text-red-600">
                      {stats
                        ? new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: budget.currency,
                          }).format(stats.spent)
                        : "0,00 €"}
                    </td>
                    <td className="py-3 px-4 text-right text-green-600">
                      {stats
                        ? new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: budget.currency,
                          }).format(stats.remaining)
                        : new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: budget.currency,
                          }).format(budget.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center">
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 max-w-[100px]">
                          <div
                            className={`h-2 rounded-full ${
                              percentageUsed >= 100
                                ? "bg-red-600"
                                : percentageUsed >= 80
                                  ? "bg-orange-600"
                                  : "bg-green-600"
                            }`}
                            style={{
                              width: `${Math.min(percentageUsed, 100)}%`,
                            }}
                          ></div>
                        </div>
                        <span
                          className={`ml-2 text-sm font-medium ${getPercentageColor(
                            percentageUsed,
                          )}`}
                        >
                          {percentageUsed.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(budget)}
                          className="p-1 text-gray-600 dark:text-gray-400 transition-colors"
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color =
                              "var(--user-color-600)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color = "")
                          }
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(budget._id)}
                          className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {budgets.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t("budgets.noBudgets")}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingBudget ? t("budgets.editBudget") : t("budgets.newBudget")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("budgets.name")}
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
                  {t("budgets.business")} {t("common.optional")}
                </label>
                <select
                  className="input-field"
                  value={formData.business || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      business: e.target.value || null,
                    })
                  }
                >
                  <option value="">{t("budgets.personal")}</option>
                  {businesses.map((business) => (
                    <option key={business._id} value={business._id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("budgets.category")}
                </label>
                <select
                  className="input-field"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  required
                >
                  <option value="">{t("budgets.selectCategory")}</option>
                  {categories
                    .filter(
                      (cat) =>
                        !cat.business ||
                        cat.business === formData.business ||
                        (!formData.business && !cat.business),
                    )
                    .map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("budgets.amount")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      amount: parseFloat(e.target.value),
                    })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("budgets.period")}
                </label>
                <select
                  className="input-field"
                  value={formData.period}
                  onChange={(e) =>
                    setFormData({ ...formData, period: e.target.value })
                  }
                  required
                >
                  <option value="weekly">{t("budgets.periods.weekly")}</option>
                  <option value="monthly">
                    {t("budgets.periods.monthly")}
                  </option>
                  <option value="quarterly">
                    {t("budgets.periods.quarterly")}
                  </option>
                  <option value="yearly">{t("budgets.periods.yearly")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("budgets.startDate")}
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("budgets.endDate")} {t("common.optional")}
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                  className="rounded"
                />
                <label
                  htmlFor="isActive"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("budgets.isActive")}
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingBudget ? t("common.save") : t("budgets.create")}
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

export default Budgets;
