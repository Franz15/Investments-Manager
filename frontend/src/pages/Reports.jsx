import { useEffect, useState, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from "recharts";
import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { useTranslation } from "../contexts/TranslationContext";

const fmt = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    n ?? 0,
  );

const fmtCompact = (n) => {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n)}€`;
};

const PERIODS = [
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "1y", label: "1A", months: 12 },
];

const CATEGORY_COLORS = [
  "#0284c7",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#b45309",
  "#4f46e5",
  "#059669",
];

const CustomBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm shadow-lg"
      style={{ minWidth: 160 }}
    >
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1 capitalize">
        {label}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {fmt(entry.value)}
        </p>
      ))}
    </div>
  );
};

const CustomPieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold" style={{ color: d.payload.fill }}>
        {d.name}
      </p>
      <p className="text-gray-700 dark:text-gray-300">{fmt(d.value)}</p>
      <p className="text-gray-500 text-xs">{d.payload.pct}%</p>
    </div>
  );
};

const Reports = () => {
  const { t } = useTranslation();
  const [activePeriod, setActivePeriod] = useState("6m");
  const [periodData, setPeriodData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const period = PERIODS.find((p) => p.key === activePeriod);
      const endDate = endOfMonth(new Date());
      const startDate = startOfMonth(subMonths(new Date(), period.months - 1));

      const [periodRes, catRes] = await Promise.all([
        api.get("/transactions/statistics/by-period", {
          params: {
            period: "monthly",
            startDate: format(startDate, "yyyy-MM-dd"),
            endDate: format(endDate, "yyyy-MM-dd"),
            business: "null",
          },
        }),
        api.get("/transactions/statistics/by-category", {
          params: {
            startDate: format(startDate, "yyyy-MM-dd"),
            endDate: format(endDate, "yyyy-MM-dd"),
            type: "expense",
            business: "null",
          },
        }),
      ]);

      const rawPeriod = periodRes.data?.basePeriod?.data ?? [];
      const formatted = rawPeriod.map((row) => ({
        label: format(parseISO(`${row.period}-01`), "MMM yy", { locale: es }),
        income: Math.round(row.income * 100) / 100,
        expenses: Math.round(row.expenses * 100) / 100,
        savings: Math.round(Math.max(row.income - row.expenses, 0) * 100) / 100,
        savingsRate:
          row.income > 0
            ? Math.round(((row.income - row.expenses) / row.income) * 100)
            : 0,
      }));
      setPeriodData(formatted);

      const totalExp = (catRes.data || []).reduce(
        (s, c) => s + (c.expenses || 0),
        0,
      );
      const cats = (catRes.data || [])
        .filter((c) => c.expenses > 0)
        .sort((a, b) => b.expenses - a.expenses)
        .slice(0, 10)
        .map((c) => ({
          name: c.category || "Sin categoría",
          value: Math.round(c.expenses * 100) / 100,
          pct: totalExp > 0 ? Math.round((c.expenses / totalExp) * 100) : 0,
        }));
      setCategoryData(cats);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [activePeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingSpinner />;

  const totalIncome = periodData.reduce((s, r) => s + r.income, 0);
  const totalExpenses = periodData.reduce((s, r) => s + r.expenses, 0);
  const totalSavings = Math.max(totalIncome - totalExpenses, 0);
  const avgSavingsRate =
    totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
            {t("reports.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t("reports.subtitle")}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1 flex-shrink-0">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setActivePeriod(p.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all duration-150 ${
                activePeriod === p.key
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            {t("reports.income")}
          </p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">
            {fmt(totalIncome)}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            {t("reports.expenses")}
          </p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
            {fmt(totalExpenses)}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            {t("reports.avgSavingsRate")}
          </p>
          <p
            className={`text-lg font-bold tabular-nums ${
              avgSavingsRate >= 20
                ? "text-green-600 dark:text-green-400"
                : avgSavingsRate >= 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
            }`}
          >
            {avgSavingsRate}%
          </p>
        </div>
      </div>

      {/* Income vs Expenses bar chart */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-5">
          {t("reports.incomeVsExpenses")}
        </h3>
        {periodData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            {t("reports.noData")}
          </p>
        ) : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={periodData}
                barCategoryGap="30%"
                barGap={2}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(0,0,0,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtCompact}
                  width={55}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  formatter={(v) =>
                    v === "income"
                      ? t("reports.income")
                      : v === "expenses"
                        ? t("reports.expenses")
                        : t("reports.savings")
                  }
                />
                <Bar
                  dataKey="income"
                  name="income"
                  fill="#16a34a"
                  opacity={0.85}
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="expenses"
                  name="expenses"
                  fill="#dc2626"
                  opacity={0.85}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Two columns: pie + savings rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by category */}
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-5">
            {t("reports.spendingByCategory")}
          </h3>
          {categoryData.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              {t("reports.noData")}
            </p>
          ) : (
            <div className="flex gap-6 items-start">
              <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {categoryData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {categoryData.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">
                      {cat.name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">
                      {cat.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Savings rate evolution */}
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-5">
            {t("reports.savingsEvolution")}
          </h3>
          {periodData.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              {t("reports.noData")}
            </p>
          ) : (
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={periodData}>
                  <defs>
                    <linearGradient
                      id="savingsGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--user-color-600)"
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--user-color-600)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(0,0,0,0.06)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, "dataMax + 10"]}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, t("reports.savingsRate")]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 4,
                      border: "1px solid rgba(0,0,0,0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="savingsRate"
                    stroke="var(--user-color-600)"
                    strokeWidth={2}
                    fill="url(#savingsGrad)"
                    dot={{ r: 3, fill: "var(--user-color-600)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table below chart */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
            {periodData.slice(-4).map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-500 dark:text-gray-400 capitalize">
                  {row.label}
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    row.savingsRate >= 20
                      ? "text-green-600 dark:text-green-400"
                      : row.savingsRate >= 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {row.savingsRate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
