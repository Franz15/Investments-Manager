import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  ArrowUp,
  ArrowDown,
  Plus,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import LoadingSpinner from "./LoadingSpinner";
import { useTranslation } from "../contexts/TranslationContext";
import QuickTransactionForm from "./QuickTransactionForm";
import TransactionDetailModal from "./TransactionDetailModal";
import BudgetDetailModal from "./BudgetDetailModal";
import FinancialAnalysis from "./FinancialAnalysis";

const FinancesDashboard = ({ businessId = null }) => {
  const { t } = useTranslation();
  const [statistics, setStatistics] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [budgetStats, setBudgetStats] = useState({});
  const [forecasts, setForecasts] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  useEffect(() => {
    fetchData();
  }, [businessId]);

  const fetchData = async () => {
    try {
      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now);
      const endOfCurrentMonth = endOfMonth(now);

      const params = {
        startDate: format(startOfCurrentMonth, "yyyy-MM-dd"),
        endDate: format(endOfCurrentMonth, "yyyy-MM-dd"),
      };

      if (businessId) {
        params.business = businessId;
      } else {
        params.business = "null"; // Personal
      }

      const [statsRes, budgetsRes, forecastsRes, transactionsRes] =
        await Promise.all([
          api.get("/transactions/statistics/summary", { params }),
          api.get("/budgets", { params: { business: params.business } }),
          api.get("/forecasts", { params: { business: params.business } }),
          api.get("/transactions", {
            params: { ...params },
          }),
        ]);

      setStatistics(statsRes.data);
      setBudgets(budgetsRes.data);
      setForecasts(forecastsRes.data);
      setRecentTransactions(transactionsRes.data.slice(0, 5));

      // Obtener estadísticas de presupuestos activos
      const activeBudgets = budgetsRes.data.filter((b) => b.isActive);
      const budgetStatsPromises = activeBudgets
        .slice(0, 3)
        .map(async (budget) => {
          try {
            const budgetStatsRes = await api.get(`/budgets/${budget._id}`);
            return {
              budgetId: budget._id,
              stats: budgetStatsRes.data.statistics,
            };
          } catch (error) {
            return { budgetId: budget._id, stats: null };
          }
        });

      const budgetStatsResults = await Promise.all(budgetStatsPromises);
      const statsMap = {};
      budgetStatsResults.forEach(({ budgetId, stats }) => {
        statsMap[budgetId] = stats;
      });
      setBudgetStats(statsMap);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!statistics) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Botones de acción */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setShowAnalysis(!showAnalysis)}
          className="btn-secondary flex items-center gap-2"
        >
          <Calendar className="h-5 w-5" />
          {showAnalysis
            ? t("financialAnalysis.hideAnalysis")
            : t("financialAnalysis.showAnalysis")}
        </button>
        <button
          onClick={() => setShowQuickForm(true)}
          className="btn-primary flex items-center gap-2 shadow-lg hover:shadow-xl transition-shadow"
        >
          <Plus className="h-5 w-5" />
          {t("quickTransaction.addTransaction")}
        </button>
      </div>

      {/* Análisis financiero */}
      {showAnalysis && <FinancialAnalysis businessId={businessId} />}

      {/* Resumen financiero */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("financesDashboard.totalIncome")}
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {new Intl.NumberFormat("es-ES", {
                  style: "currency",
                  currency: "EUR",
                }).format(statistics.totalIncome)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("financesDashboard.monthly")}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-400" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("financesDashboard.totalExpenses")}
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {new Intl.NumberFormat("es-ES", {
                  style: "currency",
                  currency: "EUR",
                }).format(statistics.totalExpenses)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("financesDashboard.monthly")}
              </p>
            </div>
            <TrendingDown className="h-8 w-8 text-red-400" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("financesDashboard.balance")}
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  statistics.balance >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {new Intl.NumberFormat("es-ES", {
                  style: "currency",
                  currency: "EUR",
                }).format(statistics.balance)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("financesDashboard.monthly")}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-gray-400" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("financesDashboard.transactions")}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {statistics.transactionCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("financesDashboard.monthly")}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Presupuestos activos */}
      {budgets.filter((b) => b.isActive).length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t("financesDashboard.activeBudgets")}
          </h3>
          <div className="space-y-3">
            {budgets
              .filter((b) => b.isActive)
              .slice(0, 3)
              .map((budget) => {
                const stats = budgetStats[budget._id];
                const percentageUsed = stats?.percentageUsed || 0;
                return (
                  <div
                    key={budget._id}
                    onClick={() => {
                      setSelectedBudget(budget);
                      setShowBudgetModal(true);
                    }}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          {budget.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {budget.category?.name || "-"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 block">
                          {new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: budget.currency,
                          }).format(budget.amount)}
                        </span>
                        {stats && (
                          <span className="text-xs text-red-600">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: budget.currency,
                            }).format(stats.spent)}{" "}
                            {t("financesDashboard.spent")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          percentageUsed >= 100
                            ? "bg-red-600"
                            : percentageUsed >= 80
                              ? "bg-orange-600"
                              : "bg-green-600"
                        }`}
                        style={{ width: `${Math.min(percentageUsed, 100)}%` }}
                      ></div>
                    </div>
                    {stats && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {percentageUsed.toFixed(1)}% {t("budgets.usage")}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Transacciones recientes */}
      {recentTransactions.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t("financesDashboard.recentTransactions")}
          </h3>
          <div className="space-y-2">
            {recentTransactions.map((transaction) => (
              <div
                key={transaction._id}
                onClick={() => {
                  setSelectedTransaction(transaction);
                  setShowDetailModal(true);
                }}
                className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {transaction.type === "income" ? (
                    <ArrowUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <ArrowDown className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {transaction.description || transaction.category}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {format(new Date(transaction.date), "dd MMM yyyy", {
                        locale: es,
                      })}
                    </p>
                  </div>
                </div>
                <p
                  className={`font-semibold ${
                    transaction.type === "income"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {transaction.type === "income" ? "+" : "-"}
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: transaction.currency,
                  }).format(transaction.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulario rápido de transacción */}
      <QuickTransactionForm
        isOpen={showQuickForm}
        onClose={() => setShowQuickForm(false)}
        businessId={businessId}
        onSuccess={() => {
          fetchData();
        }}
      />

      {/* Modal de detalle/edición de transacción */}
      <TransactionDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTransaction(null);
        }}
        transaction={selectedTransaction}
        onUpdate={() => {
          fetchData();
        }}
        onDelete={() => {
          fetchData();
        }}
      />

      {/* Modal de detalle/edición de presupuesto */}
      <BudgetDetailModal
        isOpen={showBudgetModal}
        onClose={() => {
          setShowBudgetModal(false);
          setSelectedBudget(null);
        }}
        budget={selectedBudget}
        budgetStats={selectedBudget ? budgetStats[selectedBudget._id] : null}
        onUpdate={() => {
          fetchData();
        }}
        onDelete={() => {
          fetchData();
        }}
      />
    </div>
  );
};

export default FinancesDashboard;
