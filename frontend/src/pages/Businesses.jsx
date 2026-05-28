import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit, Trash2, Briefcase, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useTranslation } from '../contexts/TranslationContext';
import { useBusiness } from '../contexts/BusinessContext';
import { FinancesTabsView } from './Finances';

const Businesses = () => {
  const { t } = useTranslation();
  const { businesses, selectedBusiness, selectBusiness, refreshBusinesses } = useBusiness();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'business',
    color: '#6B7280',
    isActive: true,
  });

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBusiness) {
        await api.put(`/businesses/${editingBusiness._id}`, formData);
      } else {
        await api.post('/businesses', formData);
      }
      await refreshBusinesses();
      setShowModal(false);
      resetForm();
    } catch (error) {}
  };

  const handleEdit = (business) => {
    setEditingBusiness(business);
    setFormData({
      name: business.name,
      description: business.description || '',
      type: business.type,
      color: business.color,
      isActive: business.isActive,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('businesses.deleteConfirm'))) {
      try {
        await api.delete(`/businesses/${id}`);
        await refreshBusinesses();
        if (selectedBusiness === id) {
          selectBusiness('personal');
        }
      } catch (error) {}
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'business',
      color: '#6B7280',
      isActive: true,
    });
    setEditingBusiness(null);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  // Si hay un negocio seleccionado, mostrar su vista de finanzas
  if (selectedBusiness && selectedBusiness !== 'personal') {
    const selectedBusinessData = businesses.find((b) => b._id === selectedBusiness);
    if (selectedBusinessData) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => selectBusiness(null)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${selectedBusinessData.color}20` }}
            >
              <Briefcase className="h-4 w-4" style={{ color: selectedBusinessData.color }} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {selectedBusinessData.name}
            </h1>
          </div>
          <FinancesTabsView businessId={selectedBusiness} />
        </div>
      );
    }
  }

  // Vista de lista de negocios
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('businesses.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t('businesses.subtitle')}</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          {t('businesses.newBusiness')}
        </button>
      </div>

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {businesses.map((business) => (
            <div
              key={business._id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => selectBusiness(business._id)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${business.color}20` }}
                  >
                    <Briefcase className="h-5 w-5" style={{ color: business.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {business.name}
                    </h3>
                    {business.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {business.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(business);
                    }}
                    className="p-1 text-gray-600 dark:text-gray-400 transition-colors"
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--user-color-600)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(business._id);
                    }}
                    className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    business.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }`}
                >
                  {business.isActive ? t('businesses.active') : t('businesses.inactive')}
                </span>
              </div>
            </div>
          ))}
        </div>
        {businesses.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {t('businesses.noBusinesses')}
          </div>
        )}
      </div>

      {showModal &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="modal-content max-w-md w-full">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {editingBusiness ? t('businesses.editBusiness') : t('businesses.newBusiness')}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('businesses.name')}
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
                    {t('businesses.description')} {t('common.optional')}
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('businesses.color')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      className="h-10 w-20 rounded cursor-pointer"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    />
                    <input
                      type="text"
                      className="input-field flex-1"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
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
                    {t('businesses.isActive')}
                  </label>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 btn-primary">
                    {editingBusiness ? t('common.save') : t('businesses.create')}
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
    </div>
  );
};

export default Businesses;
