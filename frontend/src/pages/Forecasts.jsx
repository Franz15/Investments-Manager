import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit, Trash2, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useTranslation } from '../contexts/TranslationContext';

const Forecasts = () => {
  const { t } = useTranslation();
  const [forecasts, setForecasts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [projections, setProjections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showProjections, setShowProjections] = useState(false);
  const [editingForecast, setEditingForecast] = useState(null);
  const [selectedContext, setSelectedContext] = useState('all'); // "all", "personal", or businessId
  const [formData, setFormData] = useState({
    name: '',
    type: 'expense',
    category: '',
    amount: 0,
    currency: 'EUR',
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    description: '',
    isActive: true,
    business: null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [forecastsRes, categoriesRes, businessesRes] = await Promise.all([
        api.get('/forecasts'),
        api.get('/categories'),
        api.get('/businesses'),
      ]);
      setForecasts(forecastsRes.data);
      setCategories(categoriesRes.data);
      setBusinesses(businessesRes.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecasts();
  }, [selectedContext]);

  const fetchForecasts = async () => {
    try {
      const params = {};
      if (selectedContext === 'personal') {
        params.business = 'null';
      } else if (selectedContext !== 'all') {
        params.business = selectedContext;
      }
      const response = await api.get('/forecasts', { params });
      setForecasts(response.data);
    } catch (error) {}
  };

  const fetchProjections = async () => {
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3); // Próximos 3 meses

      const response = await api.get('/forecasts/projections/calculate', {
        params: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        },
      });
      setProjections(response.data);
      setShowProjections(true);
    } catch (error) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingForecast) {
        await api.put(`/forecasts/${editingForecast._id}`, formData);
      } else {
        await api.post('/forecasts', formData);
      }
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {}
  };

  const handleEdit = (forecast) => {
    setEditingForecast(forecast);
    setFormData({
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
      business: forecast.business?._id || forecast.business || null,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('forecasts.deleteConfirm'))) {
      try {
        await api.delete(`/forecasts/${id}`);
        fetchData();
      } catch (error) {}
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'expense',
      category: '',
      amount: 0,
      currency: 'EUR',
      frequency: 'monthly',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      description: '',
      isActive: true,
      business:
        selectedContext === 'personal' ? null : selectedContext !== 'all' ? selectedContext : null,
    });
    setEditingForecast(null);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('forecasts.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t('forecasts.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchProjections} className="btn-secondary flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            {t('forecasts.viewProjections')}
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            {t('forecasts.newForecast')}
          </button>
        </div>
      </div>

      {/* Selector de contexto */}
      <div className="card">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('forecasts.context')}:
          </span>
          <button
            onClick={() => setSelectedContext('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedContext === 'all'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {t('forecasts.allContexts')}
          </button>
          <button
            onClick={() => setSelectedContext('personal')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedContext === 'personal'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {t('forecasts.personal')}
          </button>
          {businesses.map((business) => (
            <button
              key={business._id}
              onClick={() => setSelectedContext(business._id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedContext === business._id
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t('forecasts.name')}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t('common.type')}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t('forecasts.category')}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t('forecasts.frequency')}
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t('common.amount')}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t('forecasts.startDate')}
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((forecast) => (
                <tr
                  key={forecast._id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="py-3 px-4 font-medium">{forecast.name}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        forecast.type === 'income'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      {forecast.type === 'income' ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {forecast.type === 'income'
                        ? t('forecasts.types.income')
                        : t('forecasts.types.expense')}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {forecast.category ? (
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${forecast.category.color || '#6B7280'}20`,
                          color: forecast.category.color || '#6B7280',
                        }}
                      >
                        {forecast.category.name}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {t(`forecasts.frequencies.${forecast.frequency}`)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-semibold ${
                      forecast.type === 'income' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {forecast.type === 'income' ? '+' : '-'}
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: forecast.currency,
                    }).format(forecast.amount)}
                  </td>
                  <td className="py-3 px-4">
                    {format(new Date(forecast.startDate), 'dd MMM yyyy', {
                      locale: es,
                    })}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(forecast)}
                        className="p-1 text-gray-600 dark:text-gray-400 transition-colors"
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = 'var(--user-color-600)')
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(forecast._id)}
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
          {forecasts.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('forecasts.noForecasts')}
            </div>
          )}
        </div>
      </div>

      {showModal &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {editingForecast ? t('forecasts.editForecast') : t('forecasts.newForecast')}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('forecasts.name')}
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
                    {t('common.type')}
                  </label>
                  <select
                    className="input-field"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    required
                  >
                    <option value="income">{t('forecasts.types.income')}</option>
                    <option value="expense">{t('forecasts.types.expense')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('forecasts.business')} {t('common.optional')}
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
                    <option value="">{t('forecasts.personal')}</option>
                    {businesses.map((business) => (
                      <option key={business._id} value={business._id}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('forecasts.category')} {t('common.optional')}
                  </label>
                  <select
                    className="input-field"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">{t('forecasts.selectCategory')}</option>
                    {categories
                      .filter(
                        (cat) =>
                          cat.type === formData.type &&
                          (!cat.business ||
                            cat.business === formData.business ||
                            (!formData.business && !cat.business))
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
                    {t('common.amount')}
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
                    {t('forecasts.frequency')}
                  </label>
                  <select
                    className="input-field"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    required
                  >
                    <option value="one-time">{t('forecasts.frequencies.one-time')}</option>
                    <option value="daily">{t('forecasts.frequencies.daily')}</option>
                    <option value="weekly">{t('forecasts.frequencies.weekly')}</option>
                    <option value="biweekly">{t('forecasts.frequencies.biweekly')}</option>
                    <option value="monthly">{t('forecasts.frequencies.monthly')}</option>
                    <option value="quarterly">{t('forecasts.frequencies.quarterly')}</option>
                    <option value="yearly">{t('forecasts.frequencies.yearly')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('forecasts.startDate')}
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
                    {t('forecasts.endDate')} {t('common.optional')}
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('forecasts.description')} {t('common.optional')}
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
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
                    {t('forecasts.isActive')}
                  </label>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 btn-primary">
                    {editingForecast ? t('common.save') : t('forecasts.create')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
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

      {showProjections &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="modal-content max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {t('forecasts.projections')}
                </h2>
                <button
                  onClick={() => setShowProjections(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
              <div className="card">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          {t('common.date')}
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          {t('forecasts.name')}
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          {t('common.type')}
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          {t('common.amount')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {projections.map((projection, index) => (
                        <tr
                          key={index}
                          className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <td className="py-3 px-4">
                            {format(new Date(projection.date), 'dd MMM yyyy', {
                              locale: es,
                            })}
                          </td>
                          <td className="py-3 px-4 font-medium">{projection.forecastName}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                projection.type === 'income'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}
                            >
                              {projection.type === 'income'
                                ? t('forecasts.types.income')
                                : t('forecasts.types.expense')}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-semibold ${
                              projection.type === 'income' ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {projection.type === 'income' ? '+' : '-'}
                            {new Intl.NumberFormat('es-ES', {
                              style: 'currency',
                              currency: projection.currency,
                            }).format(projection.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {projections.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {t('forecasts.noProjections')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Forecasts;
