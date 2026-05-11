import { useState, useEffect } from 'react';
import { X, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import { useTranslation } from '../contexts/TranslationContext';

const BudgetDetailModal = ({ isOpen, onClose, budget, budgetStats, onUpdate, onDelete }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    amount: 0,
    currency: 'EUR',
    period: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    isActive: true,
    business: null,
    notifications: {
      enabled: true,
      threshold: 80,
    },
  });

  useEffect(() => {
    if (isOpen && budget) {
      fetchData();
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
        notifications: budget.notifications || {
          enabled: true,
          threshold: 80,
        },
      });
      setIsEditing(false);
    }
  }, [isOpen, budget]);

  const fetchData = async () => {
    try {
      const [categoriesRes, businessesRes] = await Promise.all([
        api.get('/categories', {
          params: {
            type: 'expense',
            business: budget?.business?._id || budget?.business || 'null',
          },
        }),
        api.get('/businesses'),
      ]);

      const filteredCategories = categoriesRes.data.filter((cat) => cat.isActive);
      setCategories(filteredCategories);
      setBusinesses(businessesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/budgets/${budget._id}`, formData);
      if (onUpdate) {
        onUpdate();
      }
      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error('Error updating budget:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t('budgets.deleteConfirm'))) {
      setLoading(true);
      try {
        await api.delete(`/budgets/${budget._id}`);
        if (onDelete) {
          onDelete();
        }
        onClose();
      } catch (error) {
        console.error('Error deleting budget:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen || !budget) return null;

  const percentageUsed = budgetStats?.percentageUsed || 0;
  const spent = budgetStats?.spent || 0;
  const remaining = budget.amount - spent;

  const availableCategories = categories.filter(
    (cat) =>
      !cat.business || cat.business === formData.business || (!formData.business && !cat.business)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="modal-content max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {isEditing ? t('budgets.editBudget') : t('budgets.budgetDetails')}
          </h2>
          <div className="flex gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title={t('common.edit')}
                >
                  <Edit className="h-5 w-5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title={t('common.delete')}
                  disabled={loading}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                {businesses.map((business) => (
                  <option key={business._id} value={business._id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('budgets.category')}
              </label>
              <select
                className="input-field"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
              >
                <option value="">{t('budgets.selectCategory')}</option>
                {availableCategories.map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('budgets.amount')}
              </label>
              <input
                type="number"
                step="0.01"
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
                {t('budgets.period')}
              </label>
              <select
                className="input-field"
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                required
              >
                <option value="monthly">{t('budgets.periods.monthly')}</option>
                <option value="quarterly">{t('budgets.periods.quarterly')}</option>
                <option value="yearly">{t('budgets.periods.yearly')}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded"
              />
              <label
                htmlFor="isActive"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t('budgets.isActive')}
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button type="submit" className="flex-1 btn-primary" disabled={loading}>
                {loading ? t('common.saving') : t('common.save')}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 btn-secondary"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('budgets.name')}
                </label>
                <p className="text-gray-900 dark:text-gray-100">{budget.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('budgets.amount')}
                </label>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {new Intl.NumberFormat('es-ES', {
                    style: 'currency',
                    currency: budget.currency,
                  }).format(budget.amount)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('budgets.category')}
              </label>
              <p className="text-gray-900 dark:text-gray-100">{budget.category?.name || '-'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('budgets.period')}
                </label>
                <p className="text-gray-900 dark:text-gray-100 capitalize">
                  {t(`budgets.periods.${budget.period}`)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('budgets.isActive')}
                </label>
                <p className="text-gray-900 dark:text-gray-100">
                  {budget.isActive ? t('common.yes') : t('common.no')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('budgets.startDate')}
                </label>
                <p className="text-gray-900 dark:text-gray-100">
                  {format(new Date(budget.startDate), 'dd MMM yyyy', {
                    locale: es,
                  })}
                </p>
              </div>
              {budget.endDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('budgets.endDate')}
                  </label>
                  <p className="text-gray-900 dark:text-gray-100">
                    {format(new Date(budget.endDate), 'dd MMM yyyy', {
                      locale: es,
                    })}
                  </p>
                </div>
              )}
            </div>

            {budget.business && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('businesses.business')}
                </label>
                <p className="text-gray-900 dark:text-gray-100">{budget.business?.name || '-'}</p>
              </div>
            )}

            {/* Estadísticas del presupuesto */}
            {budgetStats && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  {t('budgets.statistics')}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('budgets.totalSpent')}
                    </span>
                    <span className="text-sm font-semibold text-red-600">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: budget.currency,
                      }).format(spent)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('budgets.totalRemaining')}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        remaining >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: budget.currency,
                      }).format(remaining)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${
                        percentageUsed >= 100
                          ? 'bg-red-600'
                          : percentageUsed >= 80
                            ? 'bg-orange-600'
                            : 'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(percentageUsed, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('budgets.usage')}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        percentageUsed >= 100
                          ? 'text-red-600'
                          : percentageUsed >= 80
                            ? 'text-orange-600'
                            : 'text-green-600'
                      }`}
                    >
                      {percentageUsed.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button onClick={() => setIsEditing(true)} className="flex-1 btn-primary">
                {t('common.edit')}
              </button>
              <button onClick={onClose} className="flex-1 btn-secondary">
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetDetailModal;
