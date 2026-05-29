import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Play,
  ChevronDown,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../contexts/TranslationContext';

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly'];

const emptyForm = {
  name: '',
  type: 'expense',
  category: '',
  subAccount: '',
  amount: '',
  currency: 'EUR',
  description: '',
  frequency: 'monthly',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
};

function fmt(amount, currency = 'EUR') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
}

function frequencyLabel(freq, t) {
  return t(`recurring.frequencies.${freq}`) || freq;
}

export default function RecurringTransactionsModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [triggeringId, setTriggeringId] = useState(null);

  useEffect(() => {
    if (isOpen) fetchAll();
  }, [isOpen]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [rRes, saRes, catRes] = await Promise.all([
        api.get('/recurring-transactions'),
        api.get('/subaccounts'),
        api.get('/categories').catch(() => ({ data: [] })),
      ]);
      setItems(rRes.data);
      setSubAccounts(saRes.data);
      setCategories(catRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingId(item._id);
    setFormData({
      name: item.name,
      type: item.type,
      category: item.category,
      subAccount: item.subAccount?._id || item.subAccount || '',
      amount: item.amount,
      currency: item.currency,
      description: item.description || '',
      frequency: item.frequency,
      startDate: item.startDate ? new Date(item.startDate).toISOString().split('T')[0] : '',
      endDate: item.endDate ? new Date(item.endDate).toISOString().split('T')[0] : '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...formData, amount: parseFloat(formData.amount) || 0 };
      if (!payload.endDate) delete payload.endDate;
      if (editingId) {
        await api.put(`/recurring-transactions/${editingId}`, payload);
      } else {
        await api.post('/recurring-transactions', payload);
      }
      await fetchAll();
      setShowForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta transacción recurrente?')) return;
    try {
      await api.delete(`/recurring-transactions/${id}`);
      setItems((prev) => prev.filter((i) => i._id !== id));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleToggleActive(item) {
    try {
      const updated = await api.put(`/recurring-transactions/${item._id}`, {
        isActive: !item.isActive,
      });
      setItems((prev) => prev.map((i) => (i._id === item._id ? updated.data : i)));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleTrigger(item) {
    setTriggeringId(item._id);
    try {
      await api.post(`/recurring-transactions/${item._id}/trigger`);
      await fetchAll();
    } catch (e) {
      console.error(e);
    } finally {
      setTriggeringId(null);
    }
  }

  // Derived for form
  const availableCategories = categories.filter((c) => !formData.type || c.type === formData.type);
  const rootCats = availableCategories.filter((c) => !c.parentCategory);
  const childrenOf = (parentId) =>
    availableCategories.filter(
      (c) => c.parentCategory?._id === parentId || c.parentCategory === parentId
    );

  const selectedSA = subAccounts.find((sa) => sa._id === formData.subAccount);
  const saDisplayNode = selectedSA ? (
    selectedSA.account?.name ? (
      <>
        <span className="font-semibold">{selectedSA.account.name}</span>
        {' – '}
        {selectedSA.name}
      </>
    ) : (
      selectedSA.name
    )
  ) : (
    <span className="text-gray-400 dark:text-gray-500">{t('common.select')}…</span>
  );

  const groupedSA = Object.entries(
    subAccounts.reduce((g, sa) => {
      const bank = sa.account?.name || '—';
      if (!g[bank]) g[bank] = [];
      g[bank].push(sa);
      return g;
    }, {})
  );

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-8 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t('recurring.title')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t('recurring.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!showForm && (
              <button
                onClick={openCreate}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <Plus className="h-4 w-4" />
                {t('recurring.new')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Form */}
          {showForm && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {editingId ? t('recurring.edit') : t('recurring.new')}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Nombre */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('recurring.name')} *
                    </label>
                    <input
                      className="input-field"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Ej: Alquiler, Nómina..."
                    />
                  </div>

                  {/* Tipo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('common.type')} *
                    </label>
                    <select
                      className="input-field"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value, category: '' })
                      }
                      required
                    >
                      <option value="expense">{t('transactions.expense')}</option>
                      <option value="income">{t('transactions.income')}</option>
                    </select>
                  </div>

                  {/* Importe */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('common.amount')} *
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

                  {/* Categoría */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('transactions.category')} *
                    </label>
                    <select
                      className="input-field"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                    >
                      <option value="">{t('common.select')}…</option>
                      {rootCats.map((root) => {
                        const children = childrenOf(root._id);
                        if (children.length === 0) {
                          return (
                            <option key={root._id} value={root.name}>
                              {root.name}
                            </option>
                          );
                        }
                        return (
                          <optgroup key={root._id} label={root.name}>
                            {children.map((child) => (
                              <option key={child._id} value={child.name}>
                                {child.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  {/* Subcuenta */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('transactions.subAccount')} *
                    </label>
                    <div className="relative">
                      <div className="input-field flex items-center justify-between pointer-events-none">
                        <span className={selectedSA ? 'text-gray-900 dark:text-gray-100' : ''}>
                          {saDisplayNode}
                        </span>
                        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      </div>
                      <select
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        value={formData.subAccount}
                        onChange={(e) => setFormData({ ...formData, subAccount: e.target.value })}
                        required
                      >
                        <option value="">{t('common.select')}…</option>
                        {groupedSA.map(([bank, accounts]) => (
                          <optgroup key={bank} label={bank}>
                            {accounts.map((sa) => (
                              <option key={sa._id} value={sa._id}>
                                {sa.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Frecuencia */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('forecasts.frequency')} *
                    </label>
                    <select
                      className="input-field"
                      value={formData.frequency}
                      onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                      required
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {frequencyLabel(f, t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Fecha inicio */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('recurring.startDate')} *
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>

                  {/* Fecha fin */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('recurring.endDate')}
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>

                  {/* Descripción */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('common.notes')}
                    </label>
                    <input
                      className="input-field"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder={t('common.optional')}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? t('common.loading') : t('common.save')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowForm(false)}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{t('recurring.noRecurring')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const sa = item.subAccount;
                const saLabel = sa
                  ? sa.account?.name
                    ? `${sa.account.name} – ${sa.name}`
                    : sa.name
                  : '—';
                const nextDate = item.nextDate
                  ? new Date(item.nextDate).toLocaleDateString('es-ES')
                  : '—';
                const lastGen = item.lastGenerated
                  ? new Date(item.lastGenerated).toLocaleDateString('es-ES')
                  : t('recurring.never');

                return (
                  <div
                    key={item._id}
                    className={`rounded-xl border p-4 flex items-center gap-4 transition-opacity ${
                      item.isActive
                        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'
                    }`}
                  >
                    {/* Badge tipo */}
                    <div
                      className={`flex-shrink-0 w-2 h-12 rounded-full ${
                        item.type === 'income' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {item.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full flex-shrink-0">
                          {frequencyLabel(item.frequency, t)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {item.category} · {saLabel}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('recurring.nextDate')}:{' '}
                          <strong className="text-gray-600 dark:text-gray-300">{nextDate}</strong>
                        </span>
                        <span>|</span>
                        <span>
                          {t('recurring.lastGenerated')}: {lastGen}
                        </span>
                      </div>
                    </div>

                    {/* Importe */}
                    <div
                      className={`text-base font-bold flex-shrink-0 ${
                        item.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {item.type === 'expense' ? '–' : '+'}
                      {fmt(item.amount, item.currency)}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Toggle activo */}
                      <button
                        onClick={() => handleToggleActive(item)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        title={item.isActive ? t('recurring.active') : t('recurring.inactive')}
                      >
                        {item.isActive ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-400" />
                        )}
                      </button>

                      {/* Generar ahora */}
                      <button
                        onClick={() => handleTrigger(item)}
                        disabled={triggeringId === item._id}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        title={t('recurring.triggerNow')}
                      >
                        <Play
                          className={`h-4 w-4 ${
                            triggeringId === item._id
                              ? 'text-gray-300 animate-pulse'
                              : 'text-blue-500'
                          }`}
                        />
                      </button>

                      {/* Editar */}
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      >
                        <Edit className="h-4 w-4 text-gray-500" />
                      </button>

                      {/* Eliminar */}
                      <button
                        onClick={() => handleDelete(item._id)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
