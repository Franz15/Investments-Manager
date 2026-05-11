import { useState, useEffect, useCallback, memo, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  isSameMonth,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Repeat2,
  Search,
  X,
  BarChart2,
  Wallet,
  Calendar,
  ArrowLeftRight,
} from "lucide-react";
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
import QuickTransactionForm from "../components/QuickTransactionForm";
import TransactionDetailModal from "../components/TransactionDetailModal";
import { useTranslation } from "../contexts/TranslationContext";

/* ─── helpers ─────────────────────────────────────── */
const fmt = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n ?? 0);

const fmtCompact = (n) => {
  const abs = Math.abs(n ?? 0);
  if (abs >= 1000) return `${((n ?? 0) / 1000).toFixed(1)}k€`;
  return `${Math.round(n ?? 0)}€`;
};

const CAT_COLORS = [
  "#0284c7","#16a34a","#dc2626","#d97706","#7c3aed",
  "#0891b2","#be185d","#b45309","#4f46e5","#059669",
];

/* ─── ProgressBar ─────────────────────────────────── */
const ProgressBar = ({ pct }) => {
  const c = pct >= 100 ? "#dc2626" : pct >= 80 ? "#d97706" : "var(--user-color-600)";
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
      <div className="h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: c }} />
    </div>
  );
};

/* ─── Budget Modal ────────────────────────────────── */
const EMPTY_BUDGET = {
  name: "", category: "", amount: "", currency: "EUR",
  period: "monthly", startDate: new Date().toISOString().split("T")[0],
  endDate: "", isActive: true, business: null,  // always null for personal Finances
  notifications: { enabled: true, threshold: 80 },
};

const BudgetModal = ({ open, budget, categories, onSave, onClose }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_BUDGET);

  useEffect(() => {
    if (budget) {
      setForm({
        name: budget.name,
        category: budget.category?._id || budget.category || "",
        amount: budget.amount,
        currency: budget.currency,
        period: budget.period,
        startDate: new Date(budget.startDate).toISOString().split("T")[0],
        endDate: budget.endDate ? new Date(budget.endDate).toISOString().split("T")[0] : "",
        isActive: budget.isActive,
        business: null,  // Finances is strictly personal
        notifications: budget.notifications || { enabled: true, threshold: 80 },
      });
    } else {
      setForm(EMPTY_BUDGET);
    }
  }, [budget, open]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="modal-content max-w-md w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {budget ? t("budgets.editBudget") : t("budgets.newBudget")}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {t("budgets.name")}
            </label>
            <input type="text" className="input-field" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {t("budgets.category")}
            </label>
            <select className="input-field" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} required>
              <option value="">{t("budgets.selectCategory")}</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("budgets.amount")}
              </label>
              <input type="number" step="0.01" min="0" className="input-field"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("budgets.period")}
              </label>
              <select className="input-field" value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option value="weekly">{t("budgets.periods.weekly")}</option>
                <option value="monthly">{t("budgets.periods.monthly")}</option>
                <option value="quarterly">{t("budgets.periods.quarterly")}</option>
                <option value="yearly">{t("budgets.periods.yearly")}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("budgets.startDate")}
              </label>
              <input type="date" className="input-field" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("budgets.endDate")} {t("common.optional")}
              </label>
              <input type="date" className="input-field" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t("budgets.isActive")}</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 btn-primary">{t("common.save")}</button>
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">{t("common.cancel")}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Forecast Modal ──────────────────────────────── */
const EMPTY_FORECAST = {
  name: "", type: "expense", category: "", amount: "",
  currency: "EUR", frequency: "monthly",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "", description: "", isActive: true, business: null,  // always null for personal Finances
};

const ForecastModal = ({ open, forecast, categories, onSave, onClose }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORECAST);

  useEffect(() => {
    if (forecast) {
      setForm({
        name: forecast.name,
        type: forecast.type,
        category: forecast.category?._id || forecast.category || "",
        amount: forecast.amount,
        currency: forecast.currency,
        frequency: forecast.frequency,
        startDate: new Date(forecast.startDate).toISOString().split("T")[0],
        endDate: forecast.endDate ? new Date(forecast.endDate).toISOString().split("T")[0] : "",
        description: forecast.description || "",
        isActive: forecast.isActive,
        business: null,  // Finances is strictly personal
      });
    } else {
      setForm(EMPTY_FORECAST);
    }
  }, [forecast, open]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({ ...form, amount: parseFloat(form.amount) || 0 });
  };

  const cats = categories.filter((c) => c.type === form.type || !c.type);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {forecast ? t("forecasts.editForecast") : t("forecasts.newForecast")}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {t("forecasts.name")}
            </label>
            <input type="text" className="input-field" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("common.type")}
              </label>
              <select className="input-field" value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, category: "" })}>
                <option value="income">{t("forecasts.types.income")}</option>
                <option value="expense">{t("forecasts.types.expense")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("forecasts.frequency")}
              </label>
              <select className="input-field" value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="one-time">{t("forecasts.frequencies.one-time")}</option>
                <option value="weekly">{t("forecasts.frequencies.weekly")}</option>
                <option value="biweekly">{t("forecasts.frequencies.biweekly")}</option>
                <option value="monthly">{t("forecasts.frequencies.monthly")}</option>
                <option value="quarterly">{t("forecasts.frequencies.quarterly")}</option>
                <option value="yearly">{t("forecasts.frequencies.yearly")}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("common.amount")}
              </label>
              <input type="number" step="0.01" min="0" className="input-field"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("forecasts.category")} {t("common.optional")}
              </label>
              <select className="input-field" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">{t("forecasts.selectCategory")}</option>
                {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("forecasts.startDate")}
              </label>
              <input type="date" className="input-field" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("forecasts.endDate")} {t("common.optional")}
              </label>
              <input type="date" className="input-field" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t("forecasts.isActive")}</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 btn-primary">{t("common.save")}</button>
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">{t("common.cancel")}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   TAB 1 — PRESUPUESTO (envelope view)
═══════════════════════════════════════════════════ */
const BudgetTab = memo(({ month }) => {
  const { t } = useTranslation();
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [spending, setSpending] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, budget: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    try {
      const [budgetsRes, catsRes, spendRes, sumRes] = await Promise.all([
        api.get("/budgets", { params: { business: "null" } }),
        api.get("/categories?type=expense"),
        api.get("/transactions/statistics/by-category", {
          params: { startDate: start, endDate: end, business: "null" },
        }),
        api.get("/transactions/statistics/summary", {
          params: { startDate: start, endDate: end, business: "null" },
        }),
      ]);
      setBudgets(budgetsRes.data);
      setCategories(catsRes.data);
      const map = {};
      (spendRes.data || []).forEach((c) => { map[c.category] = c.expenses || 0; });
      setSpending(map);
      setSummary(sumRes.data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (data) => {
    try {
      if (modal.budget) await api.put(`/budgets/${modal.budget._id}`, data);
      else await api.post("/budgets", data);
      setModal({ open: false, budget: null });
      fetchData();
    } catch { /* silent */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("budgets.deleteConfirm"))) return;
    try { await api.delete(`/budgets/${id}`); fetchData(); } catch { /* silent */ }
  };

  if (loading) return <LoadingSpinner />;

  const activeBudgets = budgets.filter((b) => b.isActive);
  const budgetedCats = new Set(activeBudgets.map((b) => b.category?.name).filter(Boolean));

  const rows = activeBudgets.map((b) => {
    const catName = b.category?.name || "";
    const spent = spending[catName] || 0;
    const remaining = b.amount - spent;
    const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
    return { b, catName, spent, remaining, pct };
  });

  const unbudgeted = Object.entries(spending)
    .filter(([cat, amt]) => amt > 0 && !budgetedCats.has(cat))
    .sort(([, a], [, b]) => b - a);

  const totalBudgeted = rows.reduce((s, r) => s + r.b.amount, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const monthIncome = summary?.totalIncome ?? 0;
  const toAssign = monthIncome - totalBudgeted;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
              {t("financesDashboard.totalIncome")}
            </p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">{fmt(monthIncome)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
              {t("budgets.totalBudgeted")}
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{fmt(totalBudgeted)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
              {t("financesDashboard.totalExpenses")}
            </p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{fmt(totalSpent)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
              {t("budgets.totalRemaining")}
            </p>
            <p className={`text-lg font-bold tabular-nums ${totalRemaining >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {fmt(totalRemaining)}
            </p>
          </div>
        </div>
        {monthIncome > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <span className="text-xs text-gray-500">{t("finances.toAssign")}:</span>
            <span className={`text-sm font-semibold tabular-nums ${toAssign >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
              {fmt(toAssign)}
            </span>
            {toAssign < 0 && (
              <span className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{t("finances.overBudget")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Envelope table */}
      {rows.length === 0 && unbudgeted.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <p className="text-gray-400">{t("budgets.noBudgets")}</p>
          <button onClick={() => setModal({ open: true, budget: null })} className="btn-primary mx-auto">
            {t("budgets.newBudget")}
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          {/* Header row */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
            {[t("budgets.category"), t("budgets.budgeted"), t("budgets.spent"), t("budgets.remaining"), t("budgets.usage"), ""].map((h, i) => (
              <span key={i} className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${i > 0 ? "text-right" : ""}`}>{h}</span>
            ))}
          </div>

          {rows.map(({ b, catName, spent, remaining, pct }) => (
            <div key={b._id}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3.5 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors group items-center">
              {/* Category */}
              <div className="flex items-center gap-2.5 min-w-0">
                {b.category?.color && (
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.category.color }} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{b.name}</p>
                  {catName && <p className="text-xs text-gray-400 truncate">{catName}</p>}
                </div>
              </div>
              {/* Budgeted */}
              <p className="hidden sm:block text-sm text-gray-600 dark:text-gray-400 text-right tabular-nums">{fmt(b.amount)}</p>
              {/* Spent */}
              <p className="hidden sm:block text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">{fmt(spent)}</p>
              {/* Remaining */}
              <div className="hidden sm:flex items-center justify-end gap-1">
                {pct >= 100 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                <p className={`text-sm font-semibold text-right tabular-nums ${remaining >= 0 ? (pct >= 80 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400") : "text-red-600 dark:text-red-400"}`}>
                  {fmt(remaining)}
                </p>
              </div>
              {/* Progress */}
              <div className="hidden sm:block">
                <ProgressBar pct={pct} />
                <p className="text-xs text-gray-400 text-center mt-0.5">{Math.round(pct)}%</p>
              </div>
              {/* Mobile amount */}
              <div className="sm:hidden text-right">
                <p className={`text-sm font-semibold tabular-nums ${remaining >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {fmt(remaining)}
                </p>
                <p className="text-xs text-gray-400">{Math.round(pct)}%</p>
              </div>
              {/* Actions */}
              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setModal({ open: true, budget: b })}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(b._id)}
                  className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Unbudgeted */}
          {unbudgeted.length > 0 && (
            <>
              <div className="px-5 py-2 bg-gray-50 dark:bg-gray-900/30 border-t border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {t("budgets.unbudgeted")}
                </span>
              </div>
              {unbudgeted.map(([cat, amt]) => (
                <div key={cat} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800/40 last:border-0 items-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{cat || t("finances.uncategorized")}</p>
                  <p className="hidden sm:block text-sm text-gray-400 text-right">—</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums sm:col-start-3">{fmt(amt)}</p>
                  <p className="hidden sm:block text-sm text-gray-400 text-right">—</p>
                  <div className="hidden sm:block" /><div className="hidden sm:block" />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <BudgetModal open={modal.open} budget={modal.budget} categories={categories}
        onSave={handleSave} onClose={() => setModal({ open: false, budget: null })} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   TAB 2 — TRANSACCIONES
═══════════════════════════════════════════════════ */
const TransactionsTab = memo(({ month }) => {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    try {
      const res = await api.get("/transactions", {
        params: { startDate: start, endDate: end, business: "null" },
      });
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (typeFilter !== "all") list = list.filter((tx) => tx.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tx) =>
          (tx.description || "").toLowerCase().includes(q) ||
          (tx.category || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [transactions, typeFilter, search]);

  // Group by date
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((tx) => {
      const key = format(new Date(tx.date), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const totalIncome = filtered.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filtered.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);

  const TypeIcon = ({ type, size = "sm" }) => {
    const cls = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
    if (type === "income") return <ArrowUpRight className={`${cls} text-green-500`} />;
    if (type === "transfer") return <Repeat2 className={`${cls} text-blue-500`} />;
    return <ArrowDownRight className={`${cls} text-red-500`} />;
  };

  const TYPES = [
    { key: "all", label: t("transactions.filterAll") || "Todo" },
    { key: "income", label: t("transactions.filterIncome") || "Ingresos" },
    { key: "expense", label: t("transactions.filterExpense") || "Gastos" },
    { key: "transfer", label: t("transactions.filterTransfer") || "Transferencias" },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1">
          {TYPES.map(({ key, label }) => (
            <button key={key} onClick={() => setTypeFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${typeFilter === key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" className="input-field pl-9 py-2 text-sm"
            placeholder={t("transactions.search") || "Buscar..."}
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mini summary */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4 text-sm px-1">
          <span className="text-gray-500">{filtered.length} {t("financesDashboard.transactions").toLowerCase()}</span>
          <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">+{fmt(totalIncome)}</span>
          <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">−{fmt(totalExpense)}</span>
        </div>
      )}

      {/* Transaction list */}
      {grouped.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">
          {t("finances.noTransactions")}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dateKey, txs]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5 capitalize">
                {format(parseISO(dateKey), "EEEE d MMMM", { locale: es })}
              </p>
              <div className="card p-0 overflow-hidden">
                {txs.map((tx, idx) => (
                  <div key={tx._id}
                    onClick={() => setSelected(tx)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors ${idx < txs.length - 1 ? "border-b border-gray-50 dark:border-gray-800/50" : ""}`}>
                    <TypeIcon type={tx.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {tx.description || tx.category || "—"}
                      </p>
                      {tx.category && (
                        <p className="text-xs text-gray-400 truncate">{tx.category}</p>
                      )}
                    </div>
                    <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${tx.type === "income" ? "text-green-600 dark:text-green-400" : tx.type === "expense" ? "text-gray-800 dark:text-gray-200" : "text-blue-600 dark:text-blue-400"}`}>
                      {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                      {fmt(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuickTransactionForm isOpen={showAdd} onClose={() => setShowAdd(false)}
        businessId={null} onSuccess={fetchData} />

      <TransactionDetailModal isOpen={!!selected} transaction={selected}
        onClose={() => setSelected(null)}
        onUpdate={() => { setSelected(null); fetchData(); }}
        onDelete={() => { setSelected(null); fetchData(); }} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   TAB 3 — INFORMES
═══════════════════════════════════════════════════ */
const REPORT_PERIODS = [
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "1y", label: "1A", months: 12 },
];

const BarTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1 capitalize">{label}</p>
      {payload.map((e) => (
        <p key={e.name} style={{ color: e.color }}>{e.name}: {fmt(e.value)}</p>
      ))}
    </div>
  );
};

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold" style={{ color: d.payload.fill }}>{d.name}</p>
      <p className="text-gray-700 dark:text-gray-300">{fmt(d.value)} · {d.payload.pct}%</p>
    </div>
  );
};

const ReportsTab = memo(() => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("6m");
  const [periodData, setPeriodData] = useState([]);
  const [catData, setCatData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = REPORT_PERIODS.find((x) => x.key === period);
    const end = endOfMonth(new Date());
    const start = startOfMonth(subMonths(new Date(), p.months - 1));
    try {
      const [periodRes, catRes] = await Promise.all([
        api.get("/transactions/statistics/by-period", {
          params: { period: "monthly", startDate: format(start, "yyyy-MM-dd"), endDate: format(end, "yyyy-MM-dd"), business: "null" },
        }),
        api.get("/transactions/statistics/by-category", {
          params: { startDate: format(start, "yyyy-MM-dd"), endDate: format(end, "yyyy-MM-dd"), type: "expense", business: "null" },
        }),
      ]);
      const raw = periodRes.data?.basePeriod?.data ?? [];
      setPeriodData(raw.map((r) => ({
        label: format(parseISO(`${r.period}-01`), "MMM yy", { locale: es }),
        [t("reports.income")]: Math.round(r.income * 100) / 100,
        [t("reports.expenses")]: Math.round(r.expenses * 100) / 100,
        savingsRate: r.income > 0 ? Math.round(((r.income - r.expenses) / r.income) * 100) : 0,
      })));
      const total = (catRes.data || []).reduce((s, c) => s + (c.expenses || 0), 0);
      setCatData(
        (catRes.data || []).filter((c) => c.expenses > 0)
          .sort((a, b) => b.expenses - a.expenses).slice(0, 10)
          .map((c) => ({ name: c.category || t("finances.uncategorized"), value: Math.round(c.expenses * 100) / 100, pct: total > 0 ? Math.round((c.expenses / total) * 100) : 0, fill: "" }))
          .map((c, i) => ({ ...c, fill: CAT_COLORS[i % CAT_COLORS.length] }))
      );
    } catch { /* silent */ } finally { setLoading(false); }
  }, [period, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalIncome = periodData.reduce((s, r) => s + (r[t("reports.income")] || 0), 0);
  const totalExpenses = periodData.reduce((s, r) => s + (r[t("reports.expenses")] || 0), 0);
  const avgSavings = totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-4 flex-1 max-w-sm">
          <div className="card text-center py-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{t("reports.income")}</p>
            <p className="text-base font-bold text-green-600 dark:text-green-400 tabular-nums">{fmt(totalIncome)}</p>
          </div>
          <div className="card text-center py-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{t("reports.expenses")}</p>
            <p className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">{fmt(totalExpenses)}</p>
          </div>
          <div className="card text-center py-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{t("reports.savingsRate")}</p>
            <p className={`text-base font-bold tabular-nums ${avgSavings >= 20 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>{avgSavings}%</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1">
          {REPORT_PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${period === p.key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bar chart */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{t("reports.incomeVsExpenses")}</h3>
        {periodData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">{t("reports.noData")}</p>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periodData} barCategoryGap="30%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={fmtCompact} width={55} />
                <Tooltip content={<BarTip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey={t("reports.income")} fill="#16a34a" opacity={0.85} radius={[3, 3, 0, 0]} />
                <Bar dataKey={t("reports.expenses")} fill="#dc2626" opacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Pie + savings rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{t("reports.spendingByCategory")}</h3>
          {catData.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t("reports.noData")}</p>
          ) : (
            <div className="flex gap-4 items-center">
              <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={catData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                      {catData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                    </Pie>
                    <Tooltip content={<PieTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {catData.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.fill }} />
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{c.name}</span>
                    <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{t("reports.savingsEvolution")}</h3>
          {periodData.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t("reports.noData")}</p>
          ) : (
            <div style={{ height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={periodData}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--user-color-600)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--user-color-600)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, "dataMax + 15"]} width={36} />
                  <Tooltip formatter={(v) => [`${v}%`, t("reports.savingsRate")]} contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid rgba(0,0,0,0.1)" }} />
                  <Area type="monotone" dataKey="savingsRate" stroke="var(--user-color-600)" strokeWidth={2} fill="url(#sg)" dot={{ r: 3, fill: "var(--user-color-600)" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1">
            {periodData.slice(-4).map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400 capitalize">{r.label}</span>
                <span className={`font-semibold tabular-nums ${r.savingsRate >= 20 ? "text-green-600 dark:text-green-400" : r.savingsRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                  {r.savingsRate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   TAB 4 — PREVISIONES
═══════════════════════════════════════════════════ */
const ForecastsTab = memo(() => {
  const { t } = useTranslation();
  const [forecasts, setForecasts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, forecast: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, cRes] = await Promise.all([
        api.get("/forecasts", { params: { business: "null" } }),
        api.get("/categories"),
      ]);
      setForecasts(fRes.data);
      setCategories(cRes.data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (data) => {
    try {
      if (modal.forecast) await api.put(`/forecasts/${modal.forecast._id}`, data);
      else await api.post("/forecasts", data);
      setModal({ open: false, forecast: null });
      fetchData();
    } catch { /* silent */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("forecasts.deleteConfirm"))) return;
    try { await api.delete(`/forecasts/${id}`); fetchData(); } catch { /* silent */ }
  };

  if (loading) return <LoadingSpinner />;

  const income = forecasts.filter((f) => f.isActive && f.type === "income");
  const expenses = forecasts.filter((f) => f.isActive && f.type === "expense");
  const totalMonthlyIncome = income.reduce((s, f) => s + (f.frequency === "monthly" ? f.amount : f.frequency === "yearly" ? f.amount / 12 : f.frequency === "weekly" ? f.amount * 4.33 : f.amount), 0);
  const totalMonthlyExpense = expenses.reduce((s, f) => s + (f.frequency === "monthly" ? f.amount : f.frequency === "yearly" ? f.amount / 12 : f.frequency === "weekly" ? f.amount * 4.33 : f.amount), 0);

  const ForecastRow = ({ f }) => (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors group px-4">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.type === "income" ? "bg-green-500" : "bg-red-500"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{f.name}</p>
        <p className="text-xs text-gray-400">
          {t(`forecasts.frequencies.${f.frequency}`)}
          {f.category?.name && ` · ${f.category.name}`}
        </p>
      </div>
      <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${f.type === "income" ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>
        {f.type === "income" ? "+" : "−"}{fmt(f.amount)}
      </p>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setModal({ open: true, forecast: f })}
          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => handleDelete(f._id)}
          className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{t("finances.monthlyIncome")}</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">~{fmt(totalMonthlyIncome)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{t("finances.monthlyExpenses")}</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">~{fmt(totalMonthlyExpense)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{t("financesDashboard.balance")}</p>
            <p className={`text-lg font-bold tabular-nums ${totalMonthlyIncome - totalMonthlyExpense >= 0 ? "text-gray-900 dark:text-gray-100" : "text-red-600 dark:text-red-400"}`}>
              ~{fmt(totalMonthlyIncome - totalMonthlyExpense)}
            </p>
          </div>
        </div>
      </div>

      {forecasts.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <p className="text-gray-400">{t("forecasts.noForecasts")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Income */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-green-50/50 dark:bg-green-900/10">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                  {t("forecasts.types.income")}
                </span>
              </div>
              <span className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">{fmt(totalMonthlyIncome)}/mes</span>
            </div>
            {income.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">{t("forecasts.noForecasts")}</p>
            ) : (
              income.map((f) => <ForecastRow key={f._id} f={f} />)
            )}
          </div>

          {/* Expenses */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-red-50/50 dark:bg-red-900/10">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                  {t("forecasts.types.expense")}
                </span>
              </div>
              <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{fmt(totalMonthlyExpense)}/mes</span>
            </div>
            {expenses.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">{t("forecasts.noForecasts")}</p>
            ) : (
              expenses.map((f) => <ForecastRow key={f._id} f={f} />)
            )}
          </div>
        </div>
      )}

      <ForecastModal open={modal.open} forecast={modal.forecast} categories={categories}
        onSave={handleSave} onClose={() => setModal({ open: false, forecast: null })} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   FORECAST BUDGET VIEW  (modo Previsiones)
═══════════════════════════════════════════════════ */
const ForecastBudgetView = ({ month, triggerAdd, onAddDone }) => {
  const { t } = useTranslation();
  const [forecasts, setForecasts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [spending, setSpending] = useState({});
  const [incomeBycat, setIncomeBycat] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, forecast: null });

  useEffect(() => {
    if (triggerAdd) { setModal({ open: true, forecast: null }); onAddDone(); }
  }, [triggerAdd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    try {
      const [fRes, catStatRes, sumRes, catsRes] = await Promise.all([
        api.get("/forecasts", { params: { business: "null" } }),
        api.get("/transactions/statistics/by-category", { params: { startDate: start, endDate: end, business: "null" } }),
        api.get("/transactions/statistics/summary", { params: { startDate: start, endDate: end, business: "null" } }),
        api.get("/categories"),
      ]);
      setForecasts((fRes.data || []).filter((f) => f.isActive));
      const expMap = {}, incMap = {};
      (catStatRes.data || []).forEach((c) => {
        expMap[c.category] = c.expenses || 0;
        incMap[c.category] = c.income || 0;
      });
      setSpending(expMap);
      setIncomeBycat(incMap);
      setSummary(sumRes.data);
      setCategories(catsRes.data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (data) => {
    try {
      if (modal.forecast) await api.put(`/forecasts/${modal.forecast._id}`, data);
      else await api.post("/forecasts", data);
      setModal({ open: false, forecast: null });
      fetchData();
    } catch { /* silent */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("forecasts.deleteConfirm"))) return;
    try { await api.delete(`/forecasts/${id}`); fetchData(); } catch { /* silent */ }
  };

  const monthlyAmt = (f) => ({ monthly: f.amount, yearly: f.amount / 12, weekly: f.amount * 4.33, biweekly: f.amount * 2.17, quarterly: f.amount / 3, "one-time": f.amount }[f.frequency] ?? f.amount);

  if (loading) return <LoadingSpinner />;

  const incomeFCs = forecasts.filter((f) => f.type === "income");
  const expenseFCs = forecasts.filter((f) => f.type === "expense");
  const forecastedExpCats = new Set(expenseFCs.map((f) => f.category?.name).filter(Boolean));

  const totalForecastIncome = incomeFCs.reduce((s, f) => s + monthlyAmt(f), 0);
  const totalForecastExpense = expenseFCs.reduce((s, f) => s + monthlyAmt(f), 0);
  const totalActualIncome = summary?.totalIncome ?? 0;
  const totalActualExpense = summary?.totalExpenses ?? 0;

  const unforecasted = Object.entries(spending)
    .filter(([cat, amt]) => amt > 0 && !forecastedExpCats.has(cat))
    .sort(([, a], [, b]) => b - a);

  const ForecastRow = ({ f }) => {
    const planned = monthlyAmt(f);
    const actual = f.type === "income"
      ? (f.category?.name ? (incomeBycat[f.category.name] || 0) : totalActualIncome)
      : (f.category?.name ? (spending[f.category.name] || 0) : 0);
    const diff = f.type === "income" ? actual - planned : planned - actual;
    const pct = planned > 0 ? (actual / planned) * 100 : 0;
    const diffPositive = diff >= 0;
    const isOver = f.type === "expense" && pct > 100;

    return (
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3.5 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors group items-center">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${f.type === "income" ? "bg-green-500" : "bg-red-400"}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{f.name}</p>
            <p className="text-xs text-gray-400">{t(`forecasts.frequencies.${f.frequency}`)}{f.category?.name && ` · ${f.category.name}`}</p>
          </div>
        </div>
        <p className="hidden sm:block text-sm text-gray-600 dark:text-gray-400 text-right tabular-nums">{fmt(planned)}</p>
        <p className="hidden sm:block text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">{fmt(actual)}</p>
        <div className="hidden sm:flex items-center justify-end gap-1">
          {isOver && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
          <p className={`text-sm font-semibold text-right tabular-nums ${diffPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {diffPositive ? "+" : ""}{fmt(diff)}
          </p>
        </div>
        {f.type === "expense" ? (
          <div className="hidden sm:block">
            <ProgressBar pct={pct} />
            <p className="text-xs text-gray-400 text-center mt-0.5">{Math.round(pct)}%</p>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="sm:hidden text-right">
          <p className={`text-sm font-semibold tabular-nums ${diffPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {fmt(actual)} / {fmt(planned)}
          </p>
          {f.type === "expense" && <p className="text-xs text-gray-400">{Math.round(pct)}%</p>}
        </div>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setModal({ open: true, forecast: f })} className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"><Edit className="h-3.5 w-3.5" /></button>
          <button onClick={() => handleDelete(f._id)} className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Ingresos previstos", val: totalForecastIncome, cls: "text-green-600 dark:text-green-400" },
            { label: "Gastos previstos", val: totalForecastExpense, cls: "text-red-500 dark:text-red-400" },
            { label: "Ingresos reales", val: totalActualIncome, cls: "text-green-600 dark:text-green-400" },
            { label: "Gastos reales", val: totalActualExpense, cls: "text-red-600 dark:text-red-400" },
          ].map(({ label, val, cls }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${cls}`}>{fmt(val)}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Balance previsto:</span>
            <span className={`text-sm font-semibold tabular-nums ${totalForecastIncome - totalForecastExpense >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
              {fmt(totalForecastIncome - totalForecastExpense)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Balance real:</span>
            <span className={`text-sm font-semibold tabular-nums ${totalActualIncome - totalActualExpense >= 0 ? "text-gray-900 dark:text-gray-100" : "text-red-500"}`}>
              {fmt(totalActualIncome - totalActualExpense)}
            </span>
          </div>
        </div>
      </div>

      {forecasts.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <p className="text-gray-400">{t("forecasts.noForecasts")}</p>
          <button onClick={() => setModal({ open: true, forecast: null })} className="btn-primary mx-auto">{t("forecasts.newForecast")}</button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          {/* Column headers */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
            {["Previsión", "Previsto/mes", "Real", "Diferencia", "Uso", ""].map((h, i) => (
              <span key={i} className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${i > 0 ? "text-right" : ""}`}>{h}</span>
            ))}
          </div>

          {/* Income forecasts */}
          {incomeFCs.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 py-2 bg-green-50/50 dark:bg-green-900/10 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">{t("forecasts.types.income")}</span>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">Prev: {fmt(totalForecastIncome)} · Real: {fmt(totalActualIncome)}</span>
              </div>
              {incomeFCs.map((f) => <ForecastRow key={f._id} f={f} />)}
            </>
          )}

          {/* Expense forecasts */}
          {expenseFCs.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 py-2 bg-red-50/50 dark:bg-red-900/10 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">{t("forecasts.types.expense")}</span>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">Prev: {fmt(totalForecastExpense)} · Real: {fmt(totalActualExpense)}</span>
              </div>
              {expenseFCs.map((f) => <ForecastRow key={f._id} f={f} />)}
            </>
          )}

          {/* Unforecasted spending */}
          {unforecasted.length > 0 && (
            <>
              <div className="px-5 py-2 bg-gray-50 dark:bg-gray-900/30 border-t border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("budgets.unbudgeted")}</span>
              </div>
              {unforecasted.map(([cat, amt]) => (
                <div key={cat} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800/40 last:border-0 items-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{cat || t("finances.uncategorized")}</p>
                  <p className="hidden sm:block text-sm text-gray-400 text-right">—</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums sm:col-start-3">{fmt(amt)}</p>
                  <p className="hidden sm:block text-sm text-gray-400 text-right">—</p>
                  <div className="hidden sm:block" /><div className="hidden sm:block" />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <ForecastModal open={modal.open} forecast={modal.forecast} categories={categories}
        onSave={handleSave} onClose={() => setModal({ open: false, forecast: null })} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════ */
const TABS = [
  { key: "budget", labelKey: "finances.tabs.budget", icon: Wallet },
  { key: "transactions", labelKey: "finances.tabs.transactions", icon: ArrowLeftRight },
  { key: "reports", labelKey: "finances.tabs.reports", icon: BarChart2 },
  { key: "forecasts", labelKey: "finances.tabs.forecasts", icon: Calendar },
];

const BUDGET_MODES = [
  { key: "sobres", label: "Sobres", icon: Wallet },
  { key: "previsiones", label: "Previsiones", icon: Calendar },
];

const Finances = () => {
  const { t } = useTranslation();
  const today = new Date();
  const [tab, setTab] = useState("budget");
  const [month, setMonth] = useState(startOfMonth(today));
  const [showAdd, setShowAdd] = useState(false);
  const [budgetMode, setBudgetMode] = useState(
    () => localStorage.getItem("financesBudgetMode") || "sobres"
  );

  const handleBudgetModeChange = (mode) => {
    setBudgetMode(mode);
    localStorage.setItem("financesBudgetMode", mode);
  };

  const showMonthNav = tab === "budget" || tab === "transactions";
  const isCurrentMonth = isSameMonth(month, today);

  const addLabels = {
    budget: budgetMode === "sobres" ? t("budgets.newBudget") : t("forecasts.newForecast"),
    transactions: t("quickTransaction.addTransaction"),
    reports: null,
    forecasts: t("forecasts.newForecast"),
  };

  return (
    <div className="space-y-5">
      {/* Top bar: tabs + controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        {/* Primary tabs */}
        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded p-1">
          {TABS.map(({ key, labelKey, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${tab === key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t(labelKey)}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Budget mode sub-toggle — only on Presupuesto tab */}
          {tab === "budget" && (
            <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded p-1">
              {BUDGET_MODES.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => handleBudgetModeChange(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-all ${budgetMode === key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"}`}>
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Month navigator */}
          {showMonthNav && (
            <div className="flex items-center gap-1">
              <button onClick={() => setMonth(subMonths(month, 1))}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 min-w-[130px] text-center capitalize">
                {format(month, "MMMM yyyy", { locale: es })}
              </span>
              <button onClick={() => setMonth(addMonths(month, 1))}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={isCurrentMonth}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Add button */}
          {tab !== "reports" && (
            <button onClick={() => setShowAdd(true)}
              className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{addLabels[tab]}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      {tab === "budget" && <BudgetTabWithAdd month={month} triggerAdd={showAdd} onAddDone={() => setShowAdd(false)} budgetMode={budgetMode} />}
      {tab === "transactions" && <TransactionsTabWithAdd month={month} triggerAdd={showAdd} onAddDone={() => setShowAdd(false)} />}
      {tab === "reports" && <ReportsTab />}
      {tab === "forecasts" && <ForecastsTabWithAdd triggerAdd={showAdd} onAddDone={() => setShowAdd(false)} />}
    </div>
  );
};

/* ─── Wrappers that handle the external "add" trigger ─ */
const BudgetTabWithAdd = ({ month, triggerAdd, onAddDone, budgetMode }) => {
  const { t } = useTranslation();
  // Sobres-mode state (declared unconditionally to satisfy Rules of Hooks)
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [spending, setSpending] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, budget: null });

  useEffect(() => {
    if (triggerAdd && budgetMode === "sobres") {
      setModal({ open: true, budget: null });
      onAddDone();
    }
  }, [triggerAdd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    try {
      const [budgetsRes, catsRes, spendRes, sumRes] = await Promise.all([
        api.get("/budgets", { params: { business: "null" } }),
        api.get("/categories?type=expense"),
        api.get("/transactions/statistics/by-category", { params: { startDate: start, endDate: end, business: "null" } }),
        api.get("/transactions/statistics/summary", { params: { startDate: start, endDate: end, business: "null" } }),
      ]);
      setBudgets(budgetsRes.data);
      setCategories(catsRes.data);
      const map = {};
      (spendRes.data || []).forEach((c) => { map[c.category] = c.expenses || 0; });
      setSpending(map);
      setSummary(sumRes.data);
    } catch { } finally { setLoading(false); }
  }, [month]);

  useEffect(() => {
    if (budgetMode === "sobres") fetchData();
    else setLoading(false);
  }, [fetchData, budgetMode]);

  const handleSave = async (data) => {
    try {
      if (modal.budget) await api.put(`/budgets/${modal.budget._id}`, data);
      else await api.post("/budgets", data);
      setModal({ open: false, budget: null });
      fetchData();
    } catch { }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("budgets.deleteConfirm"))) return;
    try { await api.delete(`/budgets/${id}`); fetchData(); } catch { }
  };

  // Delegate to ForecastBudgetView when in previsiones mode (after all hooks)
  if (budgetMode === "previsiones") {
    return <ForecastBudgetView month={month} triggerAdd={triggerAdd} onAddDone={onAddDone} />;
  }

  if (loading) return <LoadingSpinner />;

  const activeBudgets = budgets.filter((b) => b.isActive);
  const budgetedCats = new Set(activeBudgets.map((b) => b.category?.name).filter(Boolean));
  const rows = activeBudgets.map((b) => {
    const catName = b.category?.name || "";
    const spent = spending[catName] || 0;
    const remaining = b.amount - spent;
    const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
    return { b, catName, spent, remaining, pct };
  });
  const unbudgeted = Object.entries(spending).filter(([cat, amt]) => amt > 0 && !budgetedCats.has(cat)).sort(([, a], [, b]) => b - a);
  const totalBudgeted = rows.reduce((s, r) => s + r.b.amount, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const monthIncome = summary?.totalIncome ?? 0;
  const toAssign = monthIncome - totalBudgeted;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: t("financesDashboard.totalIncome"), val: monthIncome, cls: "text-green-600 dark:text-green-400" },
            { label: t("budgets.totalBudgeted"), val: totalBudgeted, cls: "text-gray-900 dark:text-gray-100" },
            { label: t("financesDashboard.totalExpenses"), val: totalSpent, cls: "text-red-600 dark:text-red-400" },
            { label: t("budgets.totalRemaining"), val: totalRemaining, cls: totalRemaining >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
          ].map(({ label, val, cls }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${cls}`}>{fmt(val)}</p>
            </div>
          ))}
        </div>
        {monthIncome > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <span className="text-xs text-gray-500">{t("finances.toAssign")}:</span>
            <span className={`text-sm font-semibold tabular-nums ${toAssign >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{fmt(toAssign)}</span>
            {toAssign < 0 && <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t("finances.overBudget")}</span>}
          </div>
        )}
      </div>

      {rows.length === 0 && unbudgeted.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <p className="text-gray-400">{t("budgets.noBudgets")}</p>
          <button onClick={() => setModal({ open: true, budget: null })} className="btn-primary mx-auto">{t("budgets.newBudget")}</button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="hidden sm:grid sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
            {[t("budgets.category"), t("budgets.budgeted"), t("budgets.spent"), t("budgets.remaining"), t("budgets.usage"), ""].map((h, i) => (
              <span key={i} className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${i > 0 ? "text-right" : ""}`}>{h}</span>
            ))}
          </div>
          {rows.map(({ b, catName, spent, remaining, pct }) => (
            <div key={b._id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3.5 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors group items-center">
              <div className="flex items-center gap-2.5 min-w-0">
                {b.category?.color && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.category.color }} />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{b.name}</p>
                  {catName && <p className="text-xs text-gray-400 truncate">{catName}</p>}
                </div>
              </div>
              <p className="hidden sm:block text-sm text-gray-600 dark:text-gray-400 text-right tabular-nums">{fmt(b.amount)}</p>
              <p className="hidden sm:block text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">{fmt(spent)}</p>
              <div className="hidden sm:flex items-center justify-end gap-1">
                {pct >= 100 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                <p className={`text-sm font-semibold text-right tabular-nums ${remaining >= 0 ? (pct >= 80 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400") : "text-red-600 dark:text-red-400"}`}>{fmt(remaining)}</p>
              </div>
              <div className="hidden sm:block"><ProgressBar pct={pct} /><p className="text-xs text-gray-400 text-center mt-0.5">{Math.round(pct)}%</p></div>
              <div className="sm:hidden text-right">
                <p className={`text-sm font-semibold tabular-nums ${remaining >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{fmt(remaining)}</p>
                <p className="text-xs text-gray-400">{Math.round(pct)}%</p>
              </div>
              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setModal({ open: true, budget: b })} className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(b._id)} className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {unbudgeted.length > 0 && (
            <>
              <div className="px-5 py-2 bg-gray-50 dark:bg-gray-900/30 border-t border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("budgets.unbudgeted")}</span>
              </div>
              {unbudgeted.map(([cat, amt]) => (
                <div key={cat} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800/40 last:border-0 items-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{cat || t("finances.uncategorized")}</p>
                  <p className="hidden sm:block text-sm text-gray-400 text-right">—</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">{fmt(amt)}</p>
                  <p className="hidden sm:block text-gray-400 text-right text-sm">—</p>
                  <div className="hidden sm:block" /><div className="hidden sm:block" />
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <BudgetModal open={modal.open} budget={modal.budget} categories={categories} onSave={handleSave} onClose={() => setModal({ open: false, budget: null })} />
    </div>
  );
};

const TransactionsTabWithAdd = ({ month, triggerAdd, onAddDone }) => {
  const [showAdd, setShowAdd] = useState(false);
  useEffect(() => { if (triggerAdd) { setShowAdd(true); onAddDone(); } }, [triggerAdd]);
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    try {
      const res = await api.get("/transactions", { params: { startDate: start, endDate: end, business: "null" } });
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch { } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (typeFilter !== "all") list = list.filter((tx) => tx.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((tx) => (tx.description || "").toLowerCase().includes(q) || (tx.category || "").toLowerCase().includes(q));
    }
    return list;
  }, [transactions, typeFilter, search]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((tx) => {
      const key = format(new Date(tx.date), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const totalIncome = filtered.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filtered.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);

  const TYPES = [
    { key: "all", label: t("transactions.filterAll") || "Todo" },
    { key: "income", label: t("transactions.filterIncome") || "Ingresos" },
    { key: "expense", label: t("transactions.filterExpense") || "Gastos" },
    { key: "transfer", label: t("transactions.filterTransfer") || "Transf." },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1">
          {TYPES.map(({ key, label }) => (
            <button key={key} onClick={() => setTypeFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${typeFilter === key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" className="input-field pl-9 py-2 text-sm" placeholder={t("transactions.search") || "Buscar..."} value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center gap-4 text-sm px-1">
          <span className="text-gray-500">{filtered.length} {t("financesDashboard.transactions").toLowerCase()}</span>
          <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">+{fmt(totalIncome)}</span>
          <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">−{fmt(totalExpense)}</span>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">{t("finances.noTransactions")}</div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dateKey, txs]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5 capitalize">
                {format(parseISO(dateKey), "EEEE d MMMM", { locale: es })}
              </p>
              <div className="card p-0 overflow-hidden">
                {txs.map((tx, idx) => (
                  <div key={tx._id} onClick={() => setSelected(tx)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors ${idx < txs.length - 1 ? "border-b border-gray-50 dark:border-gray-800/50" : ""}`}>
                    {tx.type === "income" ? <ArrowUpRight className="h-4 w-4 text-green-500 flex-shrink-0" /> : tx.type === "transfer" ? <Repeat2 className="h-4 w-4 text-blue-500 flex-shrink-0" /> : <ArrowDownRight className="h-4 w-4 text-red-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{tx.description || tx.category || "—"}</p>
                      {tx.category && <p className="text-xs text-gray-400 truncate">{tx.category}</p>}
                    </div>
                    <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${tx.type === "income" ? "text-green-600 dark:text-green-400" : tx.type === "transfer" ? "text-blue-600 dark:text-blue-400" : "text-gray-800 dark:text-gray-200"}`}>
                      {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}{fmt(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuickTransactionForm isOpen={showAdd} onClose={() => setShowAdd(false)} businessId={null} onSuccess={() => { setShowAdd(false); fetchData(); }} />
      <TransactionDetailModal isOpen={!!selected} transaction={selected} onClose={() => setSelected(null)} onUpdate={() => { setSelected(null); fetchData(); }} onDelete={() => { setSelected(null); fetchData(); }} />
    </div>
  );
};

const ForecastsTabWithAdd = ({ triggerAdd, onAddDone }) => {
  const { t } = useTranslation();
  const [forecasts, setForecasts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, forecast: null });

  useEffect(() => { if (triggerAdd) { setModal({ open: true, forecast: null }); onAddDone(); } }, [triggerAdd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, cRes] = await Promise.all([api.get("/forecasts", { params: { business: "null" } }), api.get("/categories")]);
      setForecasts(fRes.data);
      setCategories(cRes.data);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (data) => {
    try {
      if (modal.forecast) await api.put(`/forecasts/${modal.forecast._id}`, data);
      else await api.post("/forecasts", data);
      setModal({ open: false, forecast: null });
      fetchData();
    } catch { }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("forecasts.deleteConfirm"))) return;
    try { await api.delete(`/forecasts/${id}`); fetchData(); } catch { }
  };

  if (loading) return <LoadingSpinner />;

  const income = forecasts.filter((f) => f.isActive && f.type === "income");
  const expenses = forecasts.filter((f) => f.isActive && f.type === "expense");
  const monthlyAmt = (f) => f.frequency === "monthly" ? f.amount : f.frequency === "yearly" ? f.amount / 12 : f.frequency === "weekly" ? f.amount * 4.33 : f.frequency === "biweekly" ? f.amount * 2.17 : f.frequency === "quarterly" ? f.amount / 3 : f.amount;
  const totalMonthlyIncome = income.reduce((s, f) => s + monthlyAmt(f), 0);
  const totalMonthlyExpense = expenses.reduce((s, f) => s + monthlyAmt(f), 0);

  const ForecastRow = ({ f }) => (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors group px-4">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.type === "income" ? "bg-green-500" : "bg-red-500"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{f.name}</p>
        <p className="text-xs text-gray-400">{t(`forecasts.frequencies.${f.frequency}`)}{f.category?.name && ` · ${f.category.name}`}</p>
      </div>
      <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${f.type === "income" ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>
        {f.type === "income" ? "+" : "−"}{fmt(f.amount)}
      </p>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setModal({ open: true, forecast: f })} className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"><Edit className="h-3.5 w-3.5" /></button>
        <button onClick={() => handleDelete(f._id)} className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t("finances.monthlyIncome"), val: totalMonthlyIncome, cls: "text-green-600 dark:text-green-400" },
            { label: t("finances.monthlyExpenses"), val: totalMonthlyExpense, cls: "text-red-600 dark:text-red-400" },
            { label: t("financesDashboard.balance"), val: totalMonthlyIncome - totalMonthlyExpense, cls: totalMonthlyIncome - totalMonthlyExpense >= 0 ? "text-gray-900 dark:text-gray-100" : "text-red-600 dark:text-red-400" },
          ].map(({ label, val, cls }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${cls}`}>~{fmt(val)}</p>
            </div>
          ))}
        </div>
      </div>

      {forecasts.length === 0 ? (
        <div className="card text-center py-12"><p className="text-gray-400">{t("forecasts.noForecasts")}</p></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-green-50/50 dark:bg-green-900/10">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">{t("forecasts.types.income")}</span>
              </div>
              <span className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">~{fmt(totalMonthlyIncome)}/mes</span>
            </div>
            {income.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">{t("forecasts.noForecasts")}</p> : income.map((f) => <ForecastRow key={f._id} f={f} />)}
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-red-50/50 dark:bg-red-900/10">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">{t("forecasts.types.expense")}</span>
              </div>
              <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">~{fmt(totalMonthlyExpense)}/mes</span>
            </div>
            {expenses.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">{t("forecasts.noForecasts")}</p> : expenses.map((f) => <ForecastRow key={f._id} f={f} />)}
          </div>
        </div>
      )}

      <ForecastModal open={modal.open} forecast={modal.forecast} categories={categories} onSave={handleSave} onClose={() => setModal({ open: false, forecast: null })} />
    </div>
  );
};

export default Finances;
