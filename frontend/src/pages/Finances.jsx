import { useState, useEffect, useCallback, memo, useMemo, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  isSameMonth,
  parseISO,
  differenceInDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  Calendar,
  ArrowLeftRight,
  Download,
  LayoutDashboard,
  Tag,
} from 'lucide-react';
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
} from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import QuickTransactionForm from '../components/QuickTransactionForm';
import TransactionDetailModal from '../components/TransactionDetailModal';
import { useTranslation } from '../contexts/TranslationContext';

/* ─── business context (shared by all tabs) ──────── */
const FinancesCtx = createContext(null); // null = personal
const useFinancesBiz = () => useContext(FinancesCtx);

/* ─── helpers ─────────────────────────────────────── */
const fmt = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n ?? 0);

const fmtCompact = (n) => {
  const abs = Math.abs(n ?? 0);
  if (abs >= 1000) return `${((n ?? 0) / 1000).toFixed(1)}k€`;
  return `${Math.round(n ?? 0)}€`;
};

const CAT_COLORS = [
  '#0284c7',
  '#16a34a',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#be185d',
  '#b45309',
  '#4f46e5',
  '#059669',
];

/* ─── ProgressBar ─────────────────────────────────── */
const ProgressBar = ({ pct }) => {
  const c = pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : 'var(--user-color-600)';
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: c }}
      />
    </div>
  );
};

/* ─── Forecast Modal ──────────────────────────────── */
const EMPTY_FORECAST = {
  name: '',
  type: 'expense',
  category: '',
  amount: '',
  currency: 'EUR',
  frequency: 'monthly',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  description: '',
  isActive: true,
};

const ForecastModal = ({ open, forecast, categories, onSave, onClose }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORECAST);

  useEffect(() => {
    if (forecast) {
      setForm({
        name: forecast.name,
        type: forecast.type,
        category: forecast.category?._id || forecast.category || '',
        amount: forecast.amount,
        currency: forecast.currency,
        frequency: forecast.frequency,
        startDate: new Date(forecast.startDate).toISOString().split('T')[0],
        endDate: forecast.endDate ? new Date(forecast.endDate).toISOString().split('T')[0] : '',
        description: forecast.description || '',
        isActive: forecast.isActive,
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

  const selectedCat = cats.find((c) => c._id === form.category);
  const catDisplayNode = selectedCat ? (
    selectedCat.parentCategory?.name ? (
      <>
        <span className="font-semibold">{selectedCat.parentCategory.name}</span>
        {' – '}
        {selectedCat.name}
      </>
    ) : (
      selectedCat.name
    )
  ) : (
    t('forecasts.selectCategory')
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {forecast ? t('forecasts.editForecast') : t('forecasts.newForecast')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {t('forecasts.name')}
            </label>
            <input
              type="text"
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t('common.type')}
              </label>
              <select
                className="input-field"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, category: '' })}
              >
                <option value="income">{t('forecasts.types.income')}</option>
                <option value="expense">{t('forecasts.types.expense')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t('forecasts.frequency')}
              </label>
              <select
                className="input-field"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              >
                <option value="one-time">{t('forecasts.frequencies.one-time')}</option>
                <option value="weekly">{t('forecasts.frequencies.weekly')}</option>
                <option value="biweekly">{t('forecasts.frequencies.biweekly')}</option>
                <option value="monthly">{t('forecasts.frequencies.monthly')}</option>
                <option value="bimonthly">{t('forecasts.frequencies.bimonthly')}</option>
                <option value="quarterly">{t('forecasts.frequencies.quarterly')}</option>
                <option value="yearly">{t('forecasts.frequencies.yearly')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t('common.amount')}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input-field"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t('forecasts.category')} {t('common.optional')}
              </label>
              <div className="relative">
                <div className="input-field flex items-center justify-between pointer-events-none">
                  <span
                    className={
                      selectedCat
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-gray-400 dark:text-gray-500'
                    }
                  >
                    {catDisplayNode}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </div>
                <select
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">{t('forecasts.selectCategory')}</option>
                  {(() => {
                    const childrenOf = {};
                    cats.forEach((c) => {
                      const pid = c.parentCategory?._id || c.parentCategory || null;
                      if (pid) {
                        if (!childrenOf[pid]) childrenOf[pid] = [];
                        childrenOf[pid].push(c);
                      }
                    });
                    const roots = cats
                      .filter((c) => !c.parentCategory)
                      .sort((a, b) => a.name.localeCompare(b.name));

                    return roots.flatMap((root) => {
                      const children = (childrenOf[root._id] || []).sort((a, b) =>
                        a.name.localeCompare(b.name)
                      );
                      if (children.length === 0) {
                        return [
                          <option key={root._id} value={root._id}>
                            {root.name}
                          </option>,
                        ];
                      }
                      return [
                        <optgroup key={root._id} label={root.name}>
                          {children.flatMap((child) => {
                            const grandchildren = (childrenOf[child._id] || []).sort((a, b) =>
                              a.name.localeCompare(b.name)
                            );
                            return [
                              <option key={child._id} value={child._id}>
                                {child.name}
                              </option>,
                              ...grandchildren.map((gc) => (
                                <option key={gc._id} value={gc._id}>
                                  {'    '}
                                  {gc.name}
                                </option>
                              )),
                            ];
                          })}
                        </optgroup>,
                      ];
                    });
                  })()}
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t('forecasts.startDate')}
              </label>
              <input
                type="date"
                className="input-field"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t('forecasts.endDate')} {t('common.optional')}
              </label>
              <input
                type="date"
                className="input-field"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t('forecasts.isActive')}
            </span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 btn-primary">
              {t('common.save')}
            </button>
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

/* ═══════════════════════════════════════════════════
   TAB 2 — TRANSACCIONES
═══════════════════════════════════════════════════ */
const TransactionsTab = memo(({ month }) => {
  const { t } = useTranslation();
  const biz = useFinancesBiz();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    try {
      const res = await api.get('/transactions', {
        params: { startDate: start, endDate: end, business: biz || 'null' },
      });
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (typeFilter !== 'all') list = list.filter((tx) => tx.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tx) =>
          (tx.description || '').toLowerCase().includes(q) ||
          (tx.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, typeFilter, search]);

  // Group by date
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((tx) => {
      const key = format(new Date(tx.date), 'yyyy-MM-dd');
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const totalIncome = filtered
    .filter((tx) => tx.type === 'income')
    .reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filtered
    .filter((tx) => tx.type === 'expense')
    .reduce((s, tx) => s + tx.amount, 0);

  const TypeIcon = ({ type, size = 'sm' }) => {
    const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
    if (type === 'income') return <ArrowUpRight className={`${cls} text-green-500`} />;
    if (type === 'transfer') return <Repeat2 className={`${cls} text-blue-500`} />;
    return <ArrowDownRight className={`${cls} text-red-500`} />;
  };

  const TYPES = [
    { key: 'all', label: t('transactions.filterAll') || 'Todo' },
    { key: 'income', label: t('transactions.filterIncome') || 'Ingresos' },
    { key: 'expense', label: t('transactions.filterExpense') || 'Gastos' },
    { key: 'transfer', label: t('transactions.filterTransfer') || 'Transferencias' },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1">
          {TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${typeFilter === key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="input-field pl-9 py-2 text-sm"
            placeholder={t('transactions.search') || 'Buscar...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mini summary */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4 text-sm px-1">
          <span className="text-gray-500">
            {filtered.length} {t('financesDashboard.transactions').toLowerCase()}
          </span>
          <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">
            +{fmt(totalIncome)}
          </span>
          <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">
            −{fmt(totalExpense)}
          </span>
        </div>
      )}

      {/* Transaction list */}
      {grouped.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">
          {t('finances.noTransactions')}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dateKey, txs]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5 capitalize">
                {format(parseISO(dateKey), 'EEEE d MMMM', { locale: es })}
              </p>
              <div className="card p-0 overflow-hidden">
                {txs.map((tx, idx) => (
                  <div
                    key={tx._id}
                    onClick={() => setSelected(tx)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors ${idx < txs.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}
                  >
                    <TypeIcon type={tx.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {tx.description || tx.category || '—'}
                      </p>
                      {tx.category && (
                        <p className="text-xs text-gray-400 truncate">{tx.category}</p>
                      )}
                    </div>
                    <p
                      className={`text-sm font-semibold tabular-nums flex-shrink-0 ${tx.type === 'income' ? 'text-green-600 dark:text-green-400' : tx.type === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}
                    >
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                      {fmt(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuickTransactionForm
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        businessId={biz}
        onSuccess={fetchData}
      />

      <TransactionDetailModal
        isOpen={!!selected}
        transaction={selected}
        onClose={() => setSelected(null)}
        onUpdate={() => {
          setSelected(null);
          fetchData();
        }}
        onDelete={() => {
          setSelected(null);
          fetchData();
        }}
      />
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   TAB 3 — INFORMES
═══════════════════════════════════════════════════ */
const REPORT_PERIODS = [
  { key: '3m', label: '3M', months: 3 },
  { key: '6m', label: '6M', months: 6 },
  { key: '1y', label: '1A', months: 12 },
];

const BarTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1 capitalize">{label}</p>
      {payload.map((e) => (
        <p key={e.name} style={{ color: e.color }}>
          {e.name}: {fmt(e.value)}
        </p>
      ))}
    </div>
  );
};

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold" style={{ color: d.payload.fill }}>
        {d.name}
      </p>
      <p className="text-gray-700 dark:text-gray-300">
        {fmt(d.value)} · {d.payload.pct}%
      </p>
    </div>
  );
};

const ReportsTab = memo(() => {
  const { t } = useTranslation();
  const biz = useFinancesBiz();
  const [period, setPeriod] = useState('6m');
  const [customFrom, setCustomFrom] = useState(format(subMonths(new Date(), 5), 'yyyy-MM-01'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [periodData, setPeriodData] = useState([]);
  const [catData, setCatData] = useState([]);
  const [tagData, setTagData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = new Date(customFrom);
    const end = new Date(customTo);
    try {
      const [periodRes, catRes, tagRes] = await Promise.all([
        api.get('/transactions/statistics/by-period', {
          params: {
            period: 'monthly',
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd'),
            business: biz || 'null',
          },
        }),
        api.get('/transactions/statistics/by-category', {
          params: {
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd'),
            type: 'expense',
            business: biz || 'null',
          },
        }),
        api.get('/transactions/statistics/by-tag', {
          params: {
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd'),
            business: biz || 'null',
          },
        }),
      ]);
      const raw = periodRes.data?.basePeriod?.data ?? [];
      setPeriodData(
        raw.map((r) => ({
          label: format(parseISO(`${r.period}-01`), 'MMM yy', { locale: es }),
          [t('reports.income')]: Math.round(r.income * 100) / 100,
          [t('reports.expenses')]: Math.round(r.expenses * 100) / 100,
          savingsRate: r.income > 0 ? Math.round(((r.income - r.expenses) / r.income) * 100) : 0,
        }))
      );
      const total = (catRes.data || []).reduce((s, c) => s + (c.expenses || 0), 0);
      setCatData(
        (catRes.data || [])
          .filter((c) => c.expenses > 0)
          .sort((a, b) => b.expenses - a.expenses)
          .slice(0, 10)
          .map((c) => ({
            name: c.category || t('finances.uncategorized'),
            value: Math.round(c.expenses * 100) / 100,
            pct: total > 0 ? Math.round((c.expenses / total) * 100) : 0,
            fill: '',
          }))
          .map((c, i) => ({ ...c, fill: CAT_COLORS[i % CAT_COLORS.length] }))
      );

      const tagRows = (tagRes.data || []).filter((r) => r.expenses > 0 || r.income > 0);
      const tagTotal = tagRows.reduce((s, r) => s + r.expenses + r.income, 0);
      setTagData(
        tagRows
          .slice(0, 10)
          .map((r) => ({
            name: r.tag,
            value: Math.round((r.expenses + r.income) * 100) / 100,
            expenses: Math.round(r.expenses * 100) / 100,
            income: Math.round(r.income * 100) / 100,
            pct: tagTotal > 0 ? Math.round(((r.expenses + r.income) / tagTotal) * 100) : 0,
            fill: '',
          }))
          .map((r, i) => ({ ...r, fill: CAT_COLORS[i % CAT_COLORS.length] }))
      );
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalIncome = periodData.reduce((s, r) => s + (r[t('reports.income')] || 0), 0);
  const totalExpenses = periodData.reduce((s, r) => s + (r[t('reports.expenses')] || 0), 0);
  const avgSavings =
    totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-4 flex-1 max-w-sm">
          <div className="card text-center py-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{t('reports.income')}</p>
            <p className="text-base font-bold text-green-600 dark:text-green-400 tabular-nums">
              {fmt(totalIncome)}
            </p>
          </div>
          <div className="card text-center py-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{t('reports.expenses')}</p>
            <p className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">
              {fmt(totalExpenses)}
            </p>
          </div>
          <div className="card text-center py-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              {t('reports.savingsRate')}
            </p>
            <p
              className={`text-base font-bold tabular-nums ${avgSavings >= 20 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
            >
              {avgSavings}%
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1">
            {REPORT_PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setPeriod(p.key);
                  const now = new Date();
                  setCustomFrom(format(startOfMonth(subMonths(now, p.months - 1)), 'yyyy-MM-dd'));
                  setCustomTo(format(now, 'yyyy-MM-dd'));
                }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${period === p.key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              className="input-field py-1.5 text-sm"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setPeriod('custom');
              }}
              max={customTo}
            />
            <span className="text-gray-400">→</span>
            <input
              type="date"
              className="input-field py-1.5 text-sm"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setPeriod('custom');
              }}
              min={customFrom}
              max={format(new Date(), 'yyyy-MM-dd')}
            />
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          {t('reports.incomeVsExpenses')}
        </h3>
        {periodData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">{t('reports.noData')}</p>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periodData} barCategoryGap="30%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtCompact}
                  width={55}
                />
                <Tooltip content={<BarTip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar
                  dataKey={t('reports.income')}
                  fill="#16a34a"
                  opacity={0.85}
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey={t('reports.expenses')}
                  fill="#dc2626"
                  opacity={0.85}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Pie + savings rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {t('reports.spendingByCategory')}
          </h3>
          {catData.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t('reports.noData')}</p>
          ) : (
            <div className="flex gap-4 items-center">
              <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={catData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {catData.map((c, i) => (
                        <Cell key={i} fill={c.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {catData.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: c.fill }}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">
                      {c.name}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                      {c.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {t('reports.savingsEvolution')}
          </h3>
          {periodData.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t('reports.noData')}</p>
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
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 'dataMax + 15']}
                    width={36}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, t('reports.savingsRate')]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 4,
                      border: '1px solid rgba(0,0,0,0.1)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="savingsRate"
                    stroke="var(--user-color-600)"
                    strokeWidth={2}
                    fill="url(#sg)"
                    dot={{ r: 3, fill: 'var(--user-color-600)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1">
            {periodData.slice(-4).map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400 capitalize">{r.label}</span>
                <span
                  className={`font-semibold tabular-nums ${r.savingsRate >= 20 ? 'text-green-600 dark:text-green-400' : r.savingsRate >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {r.savingsRate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tag pie chart — only shown if there is tagged data */}
      {tagData.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Gasto total por tag
          </h3>
          <div className="flex gap-6 items-center">
            <div style={{ width: 140, height: 140, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tagData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {tagData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              {tagData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: d.fill }}
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">
                    {d.name}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{d.pct}%</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 tabular-nums flex-shrink-0 w-20 text-right">
                    {fmt(d.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   FORECAST BUDGET VIEW  (modo Previsiones)
═══════════════════════════════════════════════════ */
const ForecastBudgetView = ({ month, triggerAdd, onAddDone }) => {
  const { t } = useTranslation();
  const biz = useFinancesBiz();
  const [forecasts, setForecasts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [spending, setSpending] = useState({});
  const [incomeBycat, setIncomeBycat] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, forecast: null });

  useEffect(() => {
    if (triggerAdd) {
      setModal({ open: true, forecast: null });
      onAddDone();
    }
  }, [triggerAdd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    try {
      const [fRes, catStatRes, sumRes, catsRes] = await Promise.all([
        api.get('/forecasts', { params: { business: biz || 'null' } }),
        api.get('/transactions/statistics/by-category', {
          params: { startDate: start, endDate: end, business: biz || 'null' },
        }),
        api.get('/transactions/statistics/summary', {
          params: { startDate: start, endDate: end, business: biz || 'null' },
        }),
        api.get('/categories'),
      ]);
      setForecasts((fRes.data || []).filter((f) => f.isActive));
      const expMap = {},
        incMap = {};
      (catStatRes.data || []).forEach((c) => {
        expMap[c.category] = c.expenses || 0;
        incMap[c.category] = c.income || 0;
      });
      setSpending(expMap);
      setIncomeBycat(incMap);
      setSummary(sumRes.data);
      setCategories(catsRes.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (data) => {
    try {
      const payload = { ...data, business: biz || null };
      if (modal.forecast) await api.put(`/forecasts/${modal.forecast._id}`, payload);
      else await api.post('/forecasts', payload);
      setModal({ open: false, forecast: null });
      fetchData();
    } catch {
      /* silent */
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('forecasts.deleteConfirm'))) return;
    try {
      await api.delete(`/forecasts/${id}`);
      fetchData();
    } catch {
      /* silent */
    }
  };

  const monthlyAmt = (f) =>
    ({
      monthly: f.amount,
      yearly: f.amount / 12,
      weekly: f.amount * 4.33,
      biweekly: f.amount * 2.17,
      quarterly: f.amount / 3,
      'one-time': f.amount,
    })[f.frequency] ?? f.amount;

  if (loading) return <LoadingSpinner />;

  const incomeFCs = forecasts.filter((f) => f.type === 'income');
  const expenseFCs = forecasts.filter((f) => f.type === 'expense');
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
    const actual =
      f.type === 'income'
        ? f.category?.name
          ? incomeBycat[f.category.name] || 0
          : totalActualIncome
        : f.category?.name
          ? spending[f.category.name] || 0
          : 0;
    const diff = f.type === 'income' ? actual - planned : planned - actual;
    const pct = planned > 0 ? (actual / planned) * 100 : 0;
    const diffPositive = diff >= 0;
    const isOver = f.type === 'expense' && pct > 100;

    return (
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3.5 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors group items-center">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${f.type === 'income' ? 'bg-green-500' : 'bg-red-400'}`}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {f.name}
            </p>
            <p className="text-xs text-gray-400">
              {t(`forecasts.frequencies.${f.frequency}`)}
              {f.category?.name && ` · ${f.category.name}`}
            </p>
          </div>
        </div>
        <p className="hidden sm:block text-sm text-gray-600 dark:text-gray-400 text-right tabular-nums">
          {fmt(planned)}
        </p>
        <p className="hidden sm:block text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums">
          {fmt(actual)}
        </p>
        <div className="hidden sm:flex items-center justify-end gap-1">
          {isOver && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
          <p
            className={`text-sm font-semibold text-right tabular-nums ${diffPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {diffPositive ? '+' : ''}
            {fmt(diff)}
          </p>
        </div>
        {f.type === 'expense' ? (
          <div className="hidden sm:block">
            <ProgressBar pct={pct} />
            <p className="text-xs text-gray-400 text-center mt-0.5">{Math.round(pct)}%</p>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="sm:hidden text-right">
          <p
            className={`text-sm font-semibold tabular-nums ${diffPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {fmt(actual)} / {fmt(planned)}
          </p>
          {f.type === 'expense' && <p className="text-xs text-gray-400">{Math.round(pct)}%</p>}
        </div>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setModal({ open: true, forecast: f })}
            className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDelete(f._id)}
            className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
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
            {
              label: t('finances.plannedIncome'),
              val: totalForecastIncome,
              cls: 'text-green-600 dark:text-green-400',
            },
            {
              label: t('finances.plannedExpenses'),
              val: totalForecastExpense,
              cls: 'text-red-500 dark:text-red-400',
            },
            {
              label: t('finances.actualIncome'),
              val: totalActualIncome,
              cls: 'text-green-600 dark:text-green-400',
            },
            {
              label: t('finances.actualExpenses'),
              val: totalActualExpense,
              cls: 'text-red-600 dark:text-red-400',
            },
          ].map(({ label, val, cls }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                {label}
              </p>
              <p className={`text-lg font-bold tabular-nums ${cls}`}>{fmt(val)}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('finances.plannedBalance')}:</span>
            <span
              className={`text-sm font-semibold tabular-nums ${totalForecastIncome - totalForecastExpense >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}
            >
              {fmt(totalForecastIncome - totalForecastExpense)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('finances.actualBalance')}:</span>
            <span
              className={`text-sm font-semibold tabular-nums ${totalActualIncome - totalActualExpense >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-500'}`}
            >
              {fmt(totalActualIncome - totalActualExpense)}
            </span>
          </div>
        </div>
      </div>

      {forecasts.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <p className="text-gray-400">{t('forecasts.noForecasts')}</p>
          <button
            onClick={() => setModal({ open: true, forecast: null })}
            className="btn-primary mx-auto"
          >
            {t('forecasts.newForecast')}
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          {/* Column headers */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
            {[
              t('forecasts.title'),
              `${t('budgets.budgeted')}/${t('finances.perMonth')}`,
              t('finances.actualExpenses').replace(' reales', ''),
              t('budgets.remaining'),
              t('budgets.usage'),
              '',
            ].map((h, i) => (
              <span
                key={i}
                className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${i > 0 ? 'text-right' : ''}`}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Income forecasts */}
          {incomeFCs.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 py-2 bg-green-50/50 dark:bg-green-900/10 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                    {t('forecasts.types.income')}
                  </span>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">
                  {t('finances.plannedIncome')}: {fmt(totalForecastIncome)} ·{' '}
                  {t('finances.actualIncome')}: {fmt(totalActualIncome)}
                </span>
              </div>
              {incomeFCs.map((f) => (
                <ForecastRow key={f._id} f={f} />
              ))}
            </>
          )}

          {/* Expense forecasts */}
          {expenseFCs.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 py-2 bg-red-50/50 dark:bg-red-900/10 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                    {t('forecasts.types.expense')}
                  </span>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">
                  {t('finances.plannedExpenses')}: {fmt(totalForecastExpense)} ·{' '}
                  {t('finances.actualExpenses')}: {fmt(totalActualExpense)}
                </span>
              </div>
              {expenseFCs.map((f) => (
                <ForecastRow key={f._id} f={f} />
              ))}
            </>
          )}

          {/* Unforecasted spending */}
          {unforecasted.length > 0 && (
            <>
              <div className="px-5 py-2 bg-gray-50 dark:bg-gray-900/30 border-t border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {t('budgets.unbudgeted')}
                </span>
              </div>
              {unforecasted.map(([cat, amt]) => (
                <div
                  key={cat}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_110px_110px_110px_90px_52px] gap-x-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800/40 last:border-0 items-center"
                >
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {cat || t('finances.uncategorized')}
                  </p>
                  <p className="hidden sm:block text-sm text-gray-400 text-right">—</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums sm:col-start-3">
                    {fmt(amt)}
                  </p>
                  <p className="hidden sm:block text-sm text-gray-400 text-right">—</p>
                  <div className="hidden sm:block" />
                  <div className="hidden sm:block" />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <ForecastModal
        open={modal.open}
        forecast={modal.forecast}
        categories={categories}
        onSave={handleSave}
        onClose={() => setModal({ open: false, forecast: null })}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   TAB OVERVIEW — RESUMEN DEL MES
═══════════════════════════════════════════════════ */
const OverviewTab = memo(() => {
  const { t } = useTranslation();
  const biz = useFinancesBiz();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [forecasts, setForecasts] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    try {
      const [sumRes, forecastsRes] = await Promise.all([
        api.get('/transactions/statistics/summary', {
          params: { startDate: start, endDate: end, business: biz || 'null' },
        }),
        api.get('/forecasts', { params: { business: biz || 'null' } }),
      ]);
      setSummary(sumRes.data);
      setForecasts((forecastsRes.data || []).filter((f) => f.isActive));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingSpinner />;

  const income = summary?.totalIncome ?? 0;
  const expenses = summary?.totalExpenses ?? 0;
  const balance = income - expenses;
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

  const monthlyAmt = (f) =>
    ({
      monthly: f.amount,
      yearly: f.amount / 12,
      weekly: f.amount * 4.33,
      biweekly: f.amount * 2.17,
      quarterly: f.amount / 3,
      'one-time': 0,
    })[f.frequency] ?? f.amount;
  const projectedIncome = forecasts
    .filter((f) => f.type === 'income')
    .reduce((s, f) => s + monthlyAmt(f), 0);
  const projectedExpenses = forecasts
    .filter((f) => f.type === 'expense')
    .reduce((s, f) => s + monthlyAmt(f), 0);

  const upcomingForecasts = forecasts
    .filter((f) => {
      if (!f.endDate) return false;
      const days = differenceInDays(new Date(f.endDate), new Date());
      return days >= 0 && days <= 30;
    })
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

  return (
    <div className="space-y-4">
      {/* KPI banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: t('financesDashboard.totalIncome'),
            val: income,
            cls: 'text-green-600 dark:text-green-400',
            prefix: '+',
          },
          {
            label: t('financesDashboard.totalExpenses'),
            val: expenses,
            cls: 'text-red-600 dark:text-red-400',
            prefix: '−',
          },
          {
            label: t('financesDashboard.balance'),
            val: balance,
            cls:
              balance >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400',
            prefix: '',
          },
          {
            label: t('finances.savingsRate'),
            val: null,
            cls:
              savingsRate >= 20
                ? 'text-green-600 dark:text-green-400'
                : 'text-amber-600 dark:text-amber-400',
            custom: `${savingsRate}%`,
          },
        ].map(({ label, val, cls, prefix, custom }) => (
          <div key={label} className="card py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
              {label}
            </p>
            <p className={`text-lg font-bold tabular-nums ${cls}`}>
              {custom ?? `${prefix}${fmt(val)}`}
            </p>
          </div>
        ))}
      </div>

      {/* Forecasts projection */}
      {forecasts.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {t('finances.overviewTitle')} — previsión recurrente
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400">{t('finances.plannedIncome')}</p>
              <p className="text-base font-bold text-green-600 dark:text-green-400 tabular-nums">
                ~{fmt(projectedIncome)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">{t('finances.plannedExpenses')}</p>
              <p className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">
                ~{fmt(projectedExpenses)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">{t('finances.plannedBalance')}</p>
              <p
                className={`text-base font-bold tabular-nums ${projectedIncome - projectedExpenses >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}
              >
                ~{fmt(projectedIncome - projectedExpenses)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming expiring forecasts */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          {t('finances.upcomingForecasts')}
        </h3>
        {upcomingForecasts.length === 0 ? (
          <p className="text-sm text-gray-400">{t('forecasts.noForecasts')}</p>
        ) : (
          <div className="space-y-2">
            {upcomingForecasts.map((f) => {
              const days = differenceInDays(new Date(f.endDate), new Date());
              return (
                <div key={f._id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="text-gray-700 dark:text-gray-300 font-medium truncate">
                      {f.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {fmt(f.amount)} · {t(`forecasts.frequencies.${f.frequency}`)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${days <= 7 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}
                  >
                    {days === 0 ? t('finances.expired') : `${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   TAB CATEGORÍAS
═══════════════════════════════════════════════════ */
const DEFAULT_CATEGORIES = [
  // ── Gastos ──────────────────────────────────────────────────
  { name: 'Alimentación', type: 'expense', color: '#16a34a' },
  { name: 'Supermercado', type: 'expense', color: '#22c55e', parentName: 'Alimentación' },
  { name: 'Restaurantes', type: 'expense', color: '#4ade80', parentName: 'Alimentación' },
  { name: 'Delivery', type: 'expense', color: '#86efac', parentName: 'Alimentación' },
  { name: 'Bar y cafetería', type: 'expense', color: '#bbf7d0', parentName: 'Alimentación' },

  { name: 'Transporte', type: 'expense', color: '#0284c7' },
  { name: 'Gasolina / Combustible', type: 'expense', color: '#38bdf8', parentName: 'Transporte' },
  { name: 'Transporte público', type: 'expense', color: '#0891b2', parentName: 'Transporte' },
  { name: 'Taxi / Cabify / Uber', type: 'expense', color: '#0369a1', parentName: 'Transporte' },
  { name: 'Parking', type: 'expense', color: '#075985', parentName: 'Transporte' },
  { name: 'Mantenimiento vehículo', type: 'expense', color: '#082f49', parentName: 'Transporte' },

  { name: 'Hogar', type: 'expense', color: '#d97706' },
  { name: 'Alquiler / Hipoteca', type: 'expense', color: '#f59e0b', parentName: 'Hogar' },
  { name: 'Suministros', type: 'expense', color: '#b45309', parentName: 'Hogar' },
  { name: 'Internet y teléfono', type: 'expense', color: '#92400e', parentName: 'Hogar' },
  { name: 'Mantenimiento y reformas', type: 'expense', color: '#78350f', parentName: 'Hogar' },

  { name: 'Salud', type: 'expense', color: '#be185d' },
  { name: 'Farmacia', type: 'expense', color: '#ec4899', parentName: 'Salud' },
  { name: 'Médico / Consultas', type: 'expense', color: '#db2777', parentName: 'Salud' },
  { name: 'Seguro médico', type: 'expense', color: '#9d174d', parentName: 'Salud' },

  { name: 'Ocio', type: 'expense', color: '#7c3aed' },
  { name: 'Viajes y vacaciones', type: 'expense', color: '#6d28d9', parentName: 'Ocio' },
  { name: 'Cine / Teatro / Conciertos', type: 'expense', color: '#8b5cf6', parentName: 'Ocio' },
  { name: 'Deporte y gimnasio', type: 'expense', color: '#a78bfa', parentName: 'Ocio' },
  { name: 'Streaming y suscripciones', type: 'expense', color: '#c4b5fd', parentName: 'Ocio' },

  { name: 'Ropa y calzado', type: 'expense', color: '#059669' },
  { name: 'Cuidado personal', type: 'expense', color: '#0d9488' },
  {
    name: 'Peluquería / Barbería',
    type: 'expense',
    color: '#14b8a6',
    parentName: 'Cuidado personal',
  },
  {
    name: 'Cosmética e higiene',
    type: 'expense',
    color: '#2dd4bf',
    parentName: 'Cuidado personal',
  },

  { name: 'Educación', type: 'expense', color: '#0e7490' },
  { name: 'Cursos y formación', type: 'expense', color: '#06b6d4', parentName: 'Educación' },
  { name: 'Libros', type: 'expense', color: '#22d3ee', parentName: 'Educación' },

  { name: 'Mascotas', type: 'expense', color: '#ea580c' },
  { name: 'Regalos y solidaridad', type: 'expense', color: '#f97316' },
  { name: 'Seguros', type: 'expense', color: '#b45309' },
  { name: 'Ahorro / Transferencias', type: 'expense', color: '#4f46e5' },
  { name: 'Otros gastos', type: 'expense', color: '#6B7280' },

  // ── Ingresos ─────────────────────────────────────────────────
  { name: 'Salario / Nómina', type: 'income', color: '#16a34a' },
  { name: 'Trabajo autónomo / Freelance', type: 'income', color: '#0284c7' },
  { name: 'Inversiones', type: 'income', color: '#7c3aed' },
  { name: 'Dividendos', type: 'income', color: '#8b5cf6', parentName: 'Inversiones' },
  { name: 'Intereses', type: 'income', color: '#a78bfa', parentName: 'Inversiones' },
  { name: 'Venta de activos', type: 'income', color: '#c4b5fd', parentName: 'Inversiones' },
  { name: 'Alquiler cobrado', type: 'income', color: '#d97706' },
  { name: 'Prestaciones', type: 'income', color: '#0891b2' },
  { name: 'Devoluciones y reembolsos', type: 'income', color: '#0e7490' },
  { name: 'Otros ingresos', type: 'income', color: '#6B7280' },
];

const EMPTY_CAT_FORM = { name: '', type: 'expense', color: '#6B7280', parentCategory: '' };

const CategoriesTab = memo(() => {
  const biz = useFinancesBiz();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null=hidden, {}=new, {_id,..}=editing
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingDef, setLoadingDef] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/categories', { params: { business: biz || 'null' } });
      setCategories(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [biz]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        color: form.color,
        parentCategory: form.parentCategory || null,
        business: biz || null,
      };
      if (form._id) {
        await api.put(`/categories/${form._id}`, payload);
      } else {
        await api.post('/categories', payload);
      }
      setForm(null);
      await fetchCategories();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/categories/${id}`);
      setDeleteId(null);
      await fetchCategories();
    } catch (e) {
      console.error(e);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      // Fetch all transactions to get unique category names + dominant type
      const txRes = await api.get('/transactions', { params: { business: biz || 'null' } });
      const txList = txRes.data || [];

      // Count income vs expense per category name
      const typeCount = {};
      txList.forEach(({ category, type }) => {
        if (!category) return;
        if (!typeCount[category]) typeCount[category] = { income: 0, expense: 0 };
        if (type === 'income' || type === 'expense') typeCount[category][type]++;
      });

      const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));
      const PALETTE = [
        '#0284c7',
        '#16a34a',
        '#dc2626',
        '#d97706',
        '#7c3aed',
        '#0891b2',
        '#be185d',
        '#b45309',
        '#4f46e5',
        '#059669',
      ];
      let idx = 0;

      const toCreate = Object.entries(typeCount)
        .filter(([name]) => !existingNames.has(name.toLowerCase()))
        .map(([name, counts]) => ({
          name,
          type: counts.expense >= counts.income ? 'expense' : 'income',
          color: PALETTE[idx++ % PALETTE.length],
          parentCategory: null,
        }));

      await Promise.all(
        toCreate.map((cat) => api.post('/categories', { ...cat, business: biz || null }))
      );
      await fetchCategories();
    } catch (e) {
      console.error(e);
    } finally {
      setImporting(false);
    }
  };

  const handleLoadDefaults = async () => {
    setLoadingDef(true);
    try {
      // Create parents first, then children
      const parents = DEFAULT_CATEGORIES.filter((c) => !c.parentName);
      const children = DEFAULT_CATEGORIES.filter((c) => c.parentName);

      const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));
      const nameToId = {};
      categories.forEach((c) => {
        nameToId[c.name] = c._id;
      });

      // Create missing parents
      for (const cat of parents) {
        if (!existingNames.has(cat.name.toLowerCase())) {
          const res = await api.post('/categories', {
            name: cat.name,
            type: cat.type,
            color: cat.color,
            parentCategory: null,
            business: biz || null,
          });
          nameToId[cat.name] = res.data._id;
          existingNames.add(cat.name.toLowerCase());
        }
      }

      // Create missing children
      for (const cat of children) {
        if (!existingNames.has(cat.name.toLowerCase())) {
          const parentId = nameToId[cat.parentName] || null;
          await api.post('/categories', {
            name: cat.name,
            type: cat.type,
            color: cat.color,
            parentCategory: parentId,
            business: biz || null,
          });
          existingNames.add(cat.name.toLowerCase());
        }
      }

      await fetchCategories();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDef(false);
    }
  };

  // Build tree: top-level + children map (supports 3 levels)
  const byType = { expense: [], income: [] };
  const topLevel = categories.filter((c) => !c.parentCategory);
  const childrenOf = {};
  categories.forEach((c) => {
    if (c.parentCategory) {
      const pid = c.parentCategory._id || c.parentCategory;
      if (!childrenOf[pid]) childrenOf[pid] = [];
      childrenOf[pid].push(c);
    }
  });
  topLevel.forEach((c) => {
    const t = c.type === 'income' ? 'income' : 'expense';
    byType[t].push(c);
  });

  // Compute depth for every category (0=root, 1=sub, 2=sub-sub)
  const depthOf = {};
  const computeDepth = (cat) => {
    if (depthOf[cat._id] !== undefined) return depthOf[cat._id];
    if (!cat.parentCategory) {
      depthOf[cat._id] = 0;
      return 0;
    }
    const pid = cat.parentCategory._id || cat.parentCategory;
    const parent = categories.find((c) => c._id === pid);
    depthOf[cat._id] = parent ? 1 + computeDepth(parent) : 0;
    return depthOf[cat._id];
  };
  categories.forEach(computeDepth);

  if (loading) return <LoadingSpinner />;

  const depthLabel = ['', 'subcategoría', 'sub-subcategoría'];

  const renderForm = (depth = 0) => {
    // Build ordered parent options: roots first, then their subs (depth ≤ 1 can be parents)
    const orderedParentOptions = topLevel
      .filter((c) => c.type === form.type && c._id !== form._id)
      .flatMap((c) => [
        { cat: c, prefix: '' },
        ...(childrenOf[c._id] || [])
          .filter((child) => child._id !== form._id)
          .map((child) => ({ cat: child, prefix: '— ' })),
      ]);

    return (
      <div
        className="card border-2 border-blue-200 dark:border-blue-800"
        style={{ marginLeft: depth * 24 + 'px' }}
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {form._id ? 'Editar categoría' : 'Nueva categoría'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Nombre
            </label>
            <input
              type="text"
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Alimentación"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Tipo
            </label>
            <select
              className="input-field"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="w-10 h-9 rounded cursor-pointer border border-gray-300 dark:border-gray-600 p-0.5"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
              <span className="text-xs text-gray-500 font-mono">{form.color}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Categoría padre <span className="text-gray-400">(opcional)</span>
            </label>
            <select
              className="input-field"
              value={form.parentCategory || ''}
              onChange={(e) => setForm({ ...form, parentCategory: e.target.value || '' })}
            >
              <option value="">— ninguna (nivel raíz)</option>
              {orderedParentOptions.map(({ cat, prefix }) => (
                <option key={cat._id} value={cat._id}>
                  {prefix}
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="btn-primary text-sm"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={() => setForm(null)} className="btn-secondary text-sm">
            Cancelar
          </button>
        </div>
      </div>
    );
  };

  const renderRow = (cat, depth = 0) => (
    <div key={cat._id}>
      {form?._id === cat._id ? (
        renderForm(depth)
      ) : deleteId === cat._id ? (
        <div
          className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800"
          style={{ marginLeft: depth * 24 + 'px' }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.color }}
          />
          <span className="flex-1 text-sm text-red-700 dark:text-red-400">
            ¿Eliminar <strong>{cat.name}</strong>?
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleDelete(cat._id)}
              className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              Eliminar
            </button>
            <button
              onClick={() => setDeleteId(null)}
              className="text-xs px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 group${depth > 0 ? ' border-l-2 border-gray-200 dark:border-gray-700 pl-4' : ''}`}
          style={{ marginLeft: depth * 24 + 'px' }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.color }}
          />
          <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 font-medium">
            {cat.name}
          </span>
          {depth > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-2">
              {depthLabel[depth]}
            </span>
          )}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() =>
                setForm({
                  ...cat,
                  parentCategory: cat.parentCategory?._id || cat.parentCategory || '',
                })
              }
              className="p-1 text-gray-400 hover:text-blue-500 rounded"
              title="Editar"
            >
              <Edit className="h-3.5 w-3.5" />
            </button>
            {depth < 2 && (
              <button
                onClick={() =>
                  setForm({ ...EMPTY_CAT_FORM, type: cat.type, parentCategory: cat._id })
                }
                className="p-1 text-gray-400 hover:text-green-500 rounded"
                title={`Añadir ${depthLabel[depth + 1]}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setDeleteId(cat._id)}
              className="p-1 text-gray-400 hover:text-red-500 rounded"
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {(childrenOf[cat._id] || []).map((child) => renderRow(child, depth + 1))}
    </div>
  );

  const renderSection = (label, type, colorClass) => {
    const items = byType[type];
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold uppercase tracking-wide ${colorClass}`}>{label}</h3>
          <span className="text-xs text-gray-400">
            {categories.filter((c) => c.type === type).length} categorías
          </span>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
            Sin categorías de {label.toLowerCase()}
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((cat) => renderRow(cat))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setForm({ ...EMPTY_CAT_FORM })}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus className="h-4 w-4" />
            Nueva categoría
          </button>
          <button
            onClick={handleLoadDefaults}
            disabled={loadingDef}
            className="btn-secondary text-sm flex items-center gap-1.5"
            title="Carga un set estándar de categorías de finanzas personales"
          >
            {loadingDef ? '...' : '⚡ Categorías por defecto'}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="btn-secondary text-sm flex items-center gap-1.5"
            title="Crea categorías a partir de las que ya usas en tus transacciones"
          >
            {importing ? '...' : '↓ Importar de transacciones'}
          </button>
        </div>
        <p className="text-xs text-gray-400">{categories.length} categorías en total</p>
      </div>

      {/* Inline form — nueva categoría (las ediciones aparecen inline en la fila) */}
      {form && !form._id && renderForm()}

      {/* Category lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {renderSection('Gastos', 'expense', 'text-red-600 dark:text-red-400')}
        {renderSection('Ingresos', 'income', 'text-green-600 dark:text-green-400')}
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════ */
const TABS = [
  { key: 'overview', labelKey: 'finances.tabs.overview', icon: LayoutDashboard },
  { key: 'transactions', labelKey: 'finances.tabs.transactions', icon: ArrowLeftRight },
  { key: 'reports', labelKey: 'finances.tabs.reports', icon: BarChart2 },
  { key: 'forecasts', labelKey: 'finances.tabs.forecasts', icon: Calendar },
  { key: 'categories', label: 'Categorías', icon: Tag },
];

export const FinancesTabsView = ({ businessId = null }) => {
  const { t } = useTranslation();
  const today = new Date();
  const [tab, setTab] = useState('overview');
  const [month, setMonth] = useState(startOfMonth(today));
  const [showAdd, setShowAdd] = useState(false);

  const showMonthNav = tab === 'forecasts' || tab === 'transactions';
  const canAdd = tab !== 'reports' && tab !== 'overview' && tab !== 'categories';
  const isCurrentMonth = isSameMonth(month, today);

  const addLabels = {
    transactions: t('quickTransaction.addTransaction'),
    reports: null,
    overview: null,
    forecasts: t('forecasts.newForecast'),
  };

  return (
    <FinancesCtx.Provider value={businessId}>
      <div className="space-y-5">
        {/* Top bar: tabs + controls */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {/* Primary tabs */}
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded p-1">
            {TABS.map(({ key, labelKey, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${tab === key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label ?? t(labelKey)}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Month navigator */}
            {showMonthNav && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMonth(subMonths(month, 1))}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 min-w-[130px] text-center capitalize">
                  {format(month, 'MMMM yyyy', { locale: es })}
                </span>
                <button
                  onClick={() => setMonth(addMonths(month, 1))}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={isCurrentMonth}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Add button */}
            {canAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{addLabels[tab]}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab content */}
        {tab === 'overview' && <OverviewTab />}
        {tab === 'transactions' && (
          <TransactionsTabWithAdd
            month={month}
            triggerAdd={showAdd}
            onAddDone={() => setShowAdd(false)}
          />
        )}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'forecasts' && (
          <ForecastBudgetView
            month={month}
            triggerAdd={showAdd}
            onAddDone={() => setShowAdd(false)}
          />
        )}
      </div>
    </FinancesCtx.Provider>
  );
};

const Finances = () => <FinancesTabsView businessId={null} />;
const TransactionsTabWithAdd = ({ month, triggerAdd, onAddDone }) => {
  const [showAdd, setShowAdd] = useState(false);
  const biz = useFinancesBiz();
  useEffect(() => {
    if (triggerAdd) {
      setShowAdd(true);
      onAddDone();
    }
  }, [triggerAdd]);
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const today = new Date();
  const defaultDate = isSameMonth(month, today)
    ? today.toISOString().split('T')[0]
    : format(endOfMonth(month), 'yyyy-MM-dd');

  const exportCsv = () => {
    const header = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Importe'];
    const rows = filtered.map((tx) => [
      format(new Date(tx.date), 'yyyy-MM-dd'),
      tx.type,
      tx.category || '',
      (tx.description || '').replace(/,/g, ' '),
      tx.type === 'expense' ? -tx.amount : tx.amount,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacciones_${format(month, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');
    try {
      const res = await api.get('/transactions', {
        params: { startDate: start, endDate: end, business: biz || 'null' },
      });
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [month, biz]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const allCategories = useMemo(() => {
    const cats = new Set(transactions.map((tx) => tx.category).filter(Boolean));
    return [...cats].sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (typeFilter !== 'all') list = list.filter((tx) => tx.type === typeFilter);
    if (catFilter !== 'all') list = list.filter((tx) => tx.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tx) =>
          (tx.description || '').toLowerCase().includes(q) ||
          (tx.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, typeFilter, catFilter, search]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((tx) => {
      const key = format(new Date(tx.date), 'yyyy-MM-dd');
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const totalIncome = filtered
    .filter((tx) => tx.type === 'income')
    .reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filtered
    .filter((tx) => tx.type === 'expense')
    .reduce((s, tx) => s + tx.amount, 0);

  const TYPES = [
    { key: 'all', label: t('transactions.filterAll') || 'Todo' },
    { key: 'income', label: t('transactions.filterIncome') || 'Ingresos' },
    { key: 'expense', label: t('transactions.filterExpense') || 'Gastos' },
    { key: 'transfer', label: t('transactions.filterTransfer') || 'Transf.' },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1">
          {TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${typeFilter === key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {allCategories.length > 0 && (
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="input-field py-1.5 text-xs text-sm max-w-[160px]"
          >
            <option value="all">{t('finances.allCategories')}</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="input-field pl-9 py-2 text-sm"
            placeholder={t('transactions.search') || 'Buscar...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {filtered.length > 0 && (
          <button
            onClick={exportCsv}
            title={t('finances.exportCsv')}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center gap-4 text-sm px-1">
          <span className="text-gray-500">
            {filtered.length} {t('financesDashboard.transactions').toLowerCase()}
          </span>
          <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">
            +{fmt(totalIncome)}
          </span>
          <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">
            −{fmt(totalExpense)}
          </span>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">
          {t('finances.noTransactions')}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dateKey, txs]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5 capitalize">
                {format(parseISO(dateKey), 'EEEE d MMMM', { locale: es })}
              </p>
              <div className="card p-0 overflow-hidden">
                {txs.map((tx, idx) => (
                  <div
                    key={tx._id}
                    onClick={() => setSelected(tx)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors ${idx < txs.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}
                  >
                    {tx.type === 'income' ? (
                      <ArrowUpRight className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : tx.type === 'transfer' ? (
                      <Repeat2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {tx.description || tx.category || '—'}
                      </p>
                      {tx.category && (
                        <p className="text-xs text-gray-400 truncate">{tx.category}</p>
                      )}
                    </div>
                    <p
                      className={`text-sm font-semibold tabular-nums flex-shrink-0 ${tx.type === 'income' ? 'text-green-600 dark:text-green-400' : tx.type === 'transfer' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                      {fmt(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuickTransactionForm
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        businessId={biz}
        defaultDate={defaultDate}
        onSuccess={() => {
          setShowAdd(false);
          fetchData();
        }}
      />
      <TransactionDetailModal
        isOpen={!!selected}
        transaction={selected}
        onClose={() => setSelected(null)}
        onUpdate={() => {
          setSelected(null);
          fetchData();
        }}
        onDelete={() => {
          setSelected(null);
          fetchData();
        }}
      />
    </div>
  );
};

export default Finances;
