import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  format,
  startOfYear,
  endOfYear,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import LoadingSpinner from "./LoadingSpinner";
import { useTranslation } from "../contexts/TranslationContext";
import { Calendar, TrendingUp, TrendingDown } from "lucide-react";

const FinancialAnalysis = ({ businessId = null }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly"); // monthly, quarterly, yearly
  const [compareWith, setCompareWith] = useState("none"); // none, previous
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseData, setBaseData] = useState([]);
  const [compareData, setCompareData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    initializeDates();
  }, [period]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [startDate, endDate, period, compareWith, businessId]);

  const initializeDates = () => {
    const now = new Date();
    let start, end;

    if (period === "monthly") {
      end = endOfMonth(now);
      start = startOfMonth(now);
    } else if (period === "quarterly") {
      end = endOfQuarter(now);
      start = startOfQuarter(now);
    } else if (period === "yearly") {
      end = endOfYear(now);
      start = startOfYear(now);
    }

    setStartDate(format(start, "yyyy-MM-dd"));
    setEndDate(format(end, "yyyy-MM-dd"));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {
        period,
        startDate,
        endDate,
        compareWith: compareWith === "previous" ? "previous" : undefined,
      };

      if (businessId) {
        params.business = businessId;
      } else {
        params.business = "null";
      }

      const [periodRes, categoryRes, summaryRes] = await Promise.all([
        api.get("/transactions/statistics/by-period", { params }),
        api.get("/transactions/statistics/by-category", {
          params: {
            startDate,
            endDate,
            business: params.business,
          },
        }),
        api.get("/transactions/statistics/summary", {
          params: {
            startDate,
            endDate,
            business: params.business,
          },
        }),
      ]);

      setBaseData(periodRes.data.basePeriod.data);
      setCompareData(periodRes.data.comparePeriod?.data || []);
      setCategoryData(categoryRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error("Error fetching analysis data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatPeriodLabel = (periodKey) => {
    if (period === "monthly") {
      const [year, month] = periodKey.split("-");
      return format(new Date(year, parseInt(month) - 1, 1), "MMM yyyy", {
        locale: es,
      });
    } else if (period === "quarterly") {
      return periodKey;
    } else {
      return periodKey;
    }
  };

  const getComparisonChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return change;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  // Preparar datos para gráficas comparativas
  const comparisonChartData = baseData.map((item, index) => {
    const compareItem = compareData[index];
    return {
      period: formatPeriodLabel(item.period),
      baseIncome: item.income,
      baseExpenses: item.expenses,
      baseBalance: item.balance,
      compareIncome: compareItem?.income || 0,
      compareExpenses: compareItem?.expenses || 0,
      compareBalance: compareItem?.balance || 0,
    };
  });

  // Calcular totales para comparación
  const baseTotal = baseData.reduce(
    (acc, item) => ({
      income: acc.income + item.income,
      expenses: acc.expenses + item.expenses,
      balance: acc.balance + item.balance,
    }),
    { income: 0, expenses: 0, balance: 0 },
  );

  const compareTotal = compareData.reduce(
    (acc, item) => ({
      income: acc.income + item.income,
      expenses: acc.expenses + item.expenses,
      balance: acc.balance + item.balance,
    }),
    { income: 0, expenses: 0, balance: 0 },
  );

  const incomeChange = getComparisonChange(
    baseTotal.income,
    compareTotal.income,
  );
  const expensesChange = getComparisonChange(
    baseTotal.expenses,
    compareTotal.expenses,
  );
  const balanceChange = getComparisonChange(
    baseTotal.balance,
    compareTotal.balance,
  );

  // Colores para gráficas
  const COLORS = {
    income: "#10B981",
    expenses: "#EF4444",
    balance: "#3B82F6",
  };

  const PIE_COLORS = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#84CC16",
  ];

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("financialAnalysis.period")}
            </label>
            <select
              className="input-field"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                initializeDates();
              }}
            >
              <option value="monthly">{t("financialAnalysis.monthly")}</option>
              <option value="quarterly">
                {t("financialAnalysis.quarterly")}
              </option>
              <option value="yearly">{t("financialAnalysis.yearly")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("financialAnalysis.startDate")}
            </label>
            <input
              type="date"
              className="input-field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("financialAnalysis.endDate")}
            </label>
            <input
              type="date"
              className="input-field"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("financialAnalysis.compareWith")}
            </label>
            <select
              className="input-field"
              value={compareWith}
              onChange={(e) => setCompareWith(e.target.value)}
            >
              <option value="none">{t("financialAnalysis.none")}</option>
              <option value="previous">
                {t("financialAnalysis.previousPeriod")}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Resumen con comparación */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("financialAnalysis.totalIncome")}
                </p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {formatCurrency(summary.totalIncome)}
                </p>
                {compareWith === "previous" && incomeChange !== null && (
                  <div className="flex items-center gap-1 mt-1">
                    {incomeChange >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <span
                      className={`text-sm ${
                        incomeChange >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {incomeChange >= 0 ? "+" : ""}
                      {incomeChange.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </div>
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("financialAnalysis.totalExpenses")}
                </p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {formatCurrency(summary.totalExpenses)}
                </p>
                {compareWith === "previous" && expensesChange !== null && (
                  <div className="flex items-center gap-1 mt-1">
                    {expensesChange >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-green-600" />
                    )}
                    <span
                      className={`text-sm ${
                        expensesChange >= 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {expensesChange >= 0 ? "+" : ""}
                      {expensesChange.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              <TrendingDown className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("financialAnalysis.balance")}
                </p>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    summary.balance >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {formatCurrency(summary.balance)}
                </p>
                {compareWith === "previous" && balanceChange !== null && (
                  <div className="flex items-center gap-1 mt-1">
                    {balanceChange >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <span
                      className={`text-sm ${
                        balanceChange >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {balanceChange >= 0 ? "+" : ""}
                      {balanceChange.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolución de ingresos y gastos */}
        {baseData.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t("financialAnalysis.incomeExpensesEvolution")}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={baseData.map((item) => ({
                  period: formatPeriodLabel(item.period),
                  income: item.income,
                  expenses: item.expenses,
                }))}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  className="dark:stroke-gray-700"
                />
                <XAxis
                  dataKey="period"
                  stroke="#6b7280"
                  className="dark:stroke-gray-400"
                />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke={COLORS.income}
                  name={t("financialAnalysis.income")}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke={COLORS.expenses}
                  name={t("financialAnalysis.expenses")}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Comparación entre períodos */}
        {compareWith === "previous" && comparisonChartData.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t("financialAnalysis.periodComparison")}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonChartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  className="dark:stroke-gray-700"
                />
                <XAxis
                  dataKey="period"
                  stroke="#6b7280"
                  className="dark:stroke-gray-400"
                />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar
                  dataKey="baseIncome"
                  fill={COLORS.income}
                  name={`${t("financialAnalysis.income")} (${t("financialAnalysis.current")})`}
                />
                <Bar
                  dataKey="compareIncome"
                  fill="#86EFAC"
                  name={`${t("financialAnalysis.income")} (${t("financialAnalysis.previous")})`}
                />
                <Bar
                  dataKey="baseExpenses"
                  fill={COLORS.expenses}
                  name={`${t("financialAnalysis.expenses")} (${t("financialAnalysis.current")})`}
                />
                <Bar
                  dataKey="compareExpenses"
                  fill="#FCA5A5"
                  name={`${t("financialAnalysis.expenses")} (${t("financialAnalysis.previous")})`}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Balance por período */}
        {baseData.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t("financialAnalysis.balanceByPeriod")}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={baseData.map((item) => ({
                  period: formatPeriodLabel(item.period),
                  balance: item.balance,
                }))}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  className="dark:stroke-gray-700"
                />
                <XAxis
                  dataKey="period"
                  stroke="#6b7280"
                  className="dark:stroke-gray-400"
                />
                <YAxis stroke="#6b7280" className="dark:stroke-gray-400" />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar
                  dataKey="balance"
                  fill={COLORS.balance}
                  name={t("financialAnalysis.balance")}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Distribución de gastos por categoría */}
        {categoryData.filter((item) => item.expenses > 0).length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t("financialAnalysis.expensesByCategory")}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData
                    .filter((item) => item.expenses > 0)
                    .slice(0, 8)
                    .map((item) => ({
                      name: item.category,
                      value: item.expenses,
                    }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData
                    .filter((item) => item.expenses > 0)
                    .slice(0, 8)
                    .map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Distribución de ingresos por categoría */}
        {categoryData.filter((item) => item.income > 0).length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t("financialAnalysis.incomeByCategory")}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData
                    .filter((item) => item.income > 0)
                    .slice(0, 8)
                    .map((item) => ({
                      name: item.category,
                      value: item.income,
                    }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData
                    .filter((item) => item.income > 0)
                    .slice(0, 8)
                    .map((entry, index) => (
                      <Cell
                        key={`cell-income-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialAnalysis;
