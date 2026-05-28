import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useTranslation } from '../contexts/TranslationContext';

const fmt = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n ?? 0);

const ProgressBar = ({ pct }) => {
  const clamped = Math.min(pct, 100);
  const color = pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : 'var(--user-color-600)';
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
};

const EMPTY_FORM = {
  name: '',
  category: '',
  amount: '',
  currency: 'EUR',
  period: 'monthly',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  isActive: true,
  business: null,
  notifications: { enabled: true, threshold: 80 },
};

const Budgets = () => {
  const { t } = useTranslation();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));
  const [budgets, setBudgets] = useState([]);
  const [categorySpending, setCategorySpending] = useState({});
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      const [budgetsRes, categoriesRes, businessesRes, spendingRes] = await Promise.all([
        api.get('/budgets'),
        api.get('/categories?type=expense'),
        api.get('/businesses'),
        api.get('/transactions/statistics/by-category', {
          params: { startDate: start, endDate: end, business: 'null' },
        }),
      ]);

      setBudgets(budgetsRes.data);
      setCategories(categoriesRes.data);
      setBusinesses(businessesRes.data);

      const spendMap = {};
      (spendingRes.data || []).forEach((c) => {
        spendMap[c.category] = c.expenses || 0;
      });
      setCategorySpending(spendMap);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, amount: parseFloat(formData.amount) || 0 };
      if (editingBudget) {
        await api.put(`/budgets/${editingBudget._id}`, payload);
      } else {
        await api.post('/budgets', payload);
      }
      setShowModal(false);
      setEditingBudget(null);
      setFormData(EMPTY_FORM);
      fetchData();
    } catch {
      // silently fail
    }
  };

  const handleEdit = (budget) => {
    setEditingBudget(budget);
    setFormData({
      name: budget.name,
      category: budget.category?._id || budget.category || '',
      amount: budget.amount,
      currency: budget.currency,
      period: budget.period,
      startDate: new Date(budget.startDate).toISOString().split('T')[0],
      endDate: budget.endDate ? new Date(budget.endDate).toISOString().split('T')[0] : '',
      isActive: budget.isActive,
      business: budget.business?._id || budget.business || null,
      notifications: budget.notifications || { enabled: true, threshold: 80 },
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('budgets.deleteConfirm'))) return;
    try {
      await api.delete(`/budgets/${id}`);
      fetchData();
    } catch {
      // silently fail
    }
  };

  const openNew = () => {
    setEditingBudget(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  if (loading) return <LoadingSpinner />;

  // Build envelope rows: budgets merged with actual spending
  const activeBudgets = budgets.filter((b) => b.isActive);
  const budgetedCategories = new Set(activeBudgets.map((b) => b.category?.name).filter(Boolean));

  const envelopeRows = activeBudgets.map((b) => {
    const catName = b.category?.name || '';
    const spent = categorySpending[catName] || 0;
    const remaining = b.amount - spent;
    const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
    return { budget: b, catName, spent, remaining, pct };
  });

  // Categories with spending but no budget
  const unbudgeted = Object.entries(categorySpending)
    .filter(([cat, amt]) => amt > 0 && !budgetedCategories.has(cat))
    .sort(([, a], [, b]) => b - a);

  const totalBudgeted = envelopeRows.reduce((s, r) => s + r.budget.amount, 0);
  const totalSpent = envelopeRows.reduce((s, r) => s + r.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const isCurrentMonth = isSameMonth(currentMonth, today);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
            {t('budgets.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('budgets.subtitle')}</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" />
          {t('budgets.newBudget')}
        </button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 min-w-[160px] text-center capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </h2>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={isCurrentMonth}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Summary banner */}
      {envelopeRows.length > 0 && (
        <div className="card">
          <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
            <div className="px-4 first:pl-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                {t('budgets.totalBudgeted')}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {fmt(totalBudgeted)}
              </p>
            </div>
            <div className="px-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                {t('budgets.totalSpent')}
              </p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                {fmt(totalSpent)}
              </p>
            </div>
            <div className="px-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                {t('budgets.totalRemaining')}
              </p>
              <p
                className={`text-xl font-bold tabular-nums ${
                  totalRemaining >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {fmt(totalRemaining)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Envelope table */}
      {envelopeRows.length === 0 && unbudgeted.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-3">{t('budgets.noBudgets')}</p>
          <button onClick={openNew} className="btn-primary">
            {t('budgets.newBudget')}
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_120px_120px_120px_80px_64px] gap-x-4 px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {t('budgets.category')}
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">
              {t('budgets.budgeted')}
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">
              {t('budgets.spent')}
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">
              {t('budgets.remaining')}
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center">
              {t('budgets.usage')}
            </span>
            <span />
          </div>

          {/* Budget rows */}
          {envelopeRows.map(({ budget, catName, spent, remaining, pct }) => (
            <div
              key={budget._id}
              className="grid grid-cols-[1fr_120px_120px_120px_80px_64px] gap-x-4 px-5 py-3.5 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors group"
            >
              {/* Category */}
              <div className="flex items-center gap-2.5 min-w-0">
                {budget.category?.color && (
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: budget.category.color }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {budget.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{catName}</p>
                </div>
              </div>

              {/* Budgeted */}
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 text-right tabular-nums self-center">
                {fmt(budget.amount)}
              </p>

              {/* Spent */}
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 text-right tabular-nums self-center">
                {fmt(spent)}
              </p>

              {/* Remaining */}
              <div className="flex items-center justify-end gap-1.5 self-center">
                {pct >= 100 && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                <p
                  className={`text-sm font-semibold text-right tabular-nums ${
                    remaining >= 0
                      ? pct >= 80
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {fmt(remaining)}
                </p>
              </div>

              {/* Progress */}
              <div className="self-center">
                <ProgressBar pct={pct} />
                <p className="text-xs text-gray-400 text-center mt-0.5">{Math.round(pct)}%</p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(budget)}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(budget._id)}
                  className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Unbudgeted section */}
          {unbudgeted.length > 0 && (
            <>
              <div className="px-5 py-2.5 bg-gray-50 dark:bg-gray-900/30 border-t border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  {t('budgets.unbudgeted')}
                </span>
              </div>
              {unbudgeted.map(([cat, amt]) => (
                <div
                  key={cat}
                  className="grid grid-cols-[1fr_120px_120px_120px_80px_64px] gap-x-4 px-5 py-3 border-b border-gray-50 dark:border-gray-800/50 last:border-0"
                >
                  <p className="text-sm text-gray-500 dark:text-gray-400 self-center">
                    {cat || t('finances.uncategorized')}
                  </p>
                  <p className="text-sm text-gray-400 text-right self-center">—</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-right tabular-nums self-center">
                    {fmt(amt)}
                  </p>
                  <p className="text-sm text-gray-400 text-right self-center">—</p>
                  <div />
                  <div />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="modal-content max-w-md w-full">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">
                {editingBudget ? t('budgets.editBudget') : t('budgets.newBudget')}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    {t('budgets.name')}
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
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    {t('budgets.category')}
                  </label>
                  <select
                    className="input-field"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                  >
                    <option value="">{t('budgets.selectCategory')}</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      {t('budgets.amount')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-field"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      {t('budgets.period')}
                    </label>
                    <select
                      className="input-field"
                      value={formData.period}
                      onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                    >
                      <option value="weekly">{t('budgets.periods.weekly')}</option>
                      <option value="monthly">{t('budgets.periods.monthly')}</option>
                      <option value="quarterly">{t('budgets.periods.quarterly')}</option>
                      <option value="yearly">{t('budgets.periods.yearly')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      {t('budgets.startDate')}
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      {t('budgets.endDate')} {t('common.optional')}
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>

                {businesses.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      {t('budgets.business')} {t('common.optional')}
                    </label>
                    <select
                      className="input-field"
                      value={formData.business || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          business: e.target.value || null,
                        })
                      }
                    >
                      <option value="">{t('budgets.personal')}</option>
                      {businesses.map((b) => (
                        <option key={b._id} value={b._id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('budgets.isActive')}
                  </span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="flex-1 btn-primary">
                    {editingBudget ? t('common.save') : t('budgets.create')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingBudget(null);
                      setFormData(EMPTY_FORM);
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
    </div>
  );
};

export default Budgets;
