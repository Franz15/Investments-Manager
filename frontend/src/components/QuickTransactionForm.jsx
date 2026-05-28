import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUp, ArrowDown, Link, Camera, FileText, ChevronDown } from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../contexts/TranslationContext';

const QuickTransactionForm = ({
  isOpen,
  onClose,
  businessId = null,
  onSuccess,
  defaultDate = null,
}) => {
  const { t } = useTranslation();
  const [subAccounts, setSubAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [activeDebts, setActiveDebts] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingImagePreview, setPendingImagePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [formData, setFormData] = useState({
    subAccount: '',
    type: 'expense',
    category: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    debt: '',
    tags: [],
  });

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setFormData({
        subAccount: '',
        type: 'expense',
        category: '',
        amount: '',
        description: '',
        date: defaultDate || new Date().toISOString().split('T')[0],
        tags: [],
      });
      setTagInput('');
      if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
      setPendingImage(null);
      setPendingImagePreview(null);
      setIsDragOver(false);
    }
  }, [isOpen, businessId, defaultDate]);

  const fetchData = async () => {
    try {
      const requests = [
        api.get('/subaccounts'),
        api.get('/categories', { params: { business: businessId || 'null' } }),
        api.get('/transactions', { params: { business: businessId || 'null' } }),
      ];
      if (!businessId) requests.push(api.get('/debts', { params: { status: 'active' } }));

      const results = await Promise.all(requests);
      const [subAccountsRes, categoriesRes, txRes] = results;

      const filteredSubAccounts = subAccountsRes.data.filter(
        (sa) => sa.isActive && (sa.type === 'cash' || sa.type === 'savings')
      );
      setSubAccounts(filteredSubAccounts);

      const filteredCategories = categoriesRes.data.filter((cat) => cat.isActive);
      setCategories(filteredCategories);

      // Sugerencias: categorías API + categorías únicas de transacciones existentes
      const apiNames = new Set(filteredCategories.map((c) => c.name));
      const txNames = (txRes.data || []).map((tx) => tx.category).filter(Boolean);
      const extra = txNames.filter((n) => !apiNames.has(n));
      setCategorySuggestions([...filteredCategories.map((c) => c.name), ...new Set(extra)]);

      if (!businessId && results[3]) {
        setActiveDebts(results[3].data || []);
      }

      const updates = {};
      if (filteredSubAccounts.length > 0) updates.subAccount = filteredSubAccounts[0]._id;
      if (Object.keys(updates).length > 0) {
        setFormData((prev) => ({ ...prev, ...updates }));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.subAccount || !formData.category || !formData.amount) {
      return;
    }

    setLoading(true);
    try {
      const transactionData = {
        ...formData,
        amount: parseFloat(formData.amount),
        currency: 'EUR',
        business: businessId || null,
        debt: formData.debt || null,
      };

      const res = await api.post('/transactions', transactionData);
      if (pendingImage && res.data?._id) {
        const fd = new FormData();
        fd.append('image', pendingImage);
        await api
          .post(`/transactions/${res.data._id}/image`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          .catch(console.error);
      }

      // Resetear formulario
      setFormData({
        subAccount: subAccounts.length > 0 ? subAccounts[0]._id : '',
        type: 'expense',
        category: '',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        tags: [],
      });
      setTagInput('');

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      console.error('Error creating transaction:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageFile = (file) => {
    if (!file || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) return;
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImage(file);
    setPendingImagePreview(URL.createObjectURL(file));
  };

  const handleTypeChange = (type) => {
    setFormData((prev) => ({ ...prev, type, category: '' }));
  };

  if (!isOpen) return null;

  const availableCategories = categories.filter((cat) => cat.type === formData.type);

  const selectedCat = availableCategories.find((c) => c.name === formData.category);
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
    `${t('common.select')} ${t('transactions.category').toLowerCase()}`
  );

  const selectedSA = subAccounts.find((sa) => sa._id === formData.subAccount);
  const saDisplayText = selectedSA
    ? selectedSA.account?.name
      ? `${selectedSA.account.name} - ${selectedSA.name}`
      : selectedSA.name
    : '';

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="modal-content max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('quickTransaction.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de transacción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('quickTransaction.type')}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'expense'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                }`}
              >
                <ArrowDown className="h-5 w-5" />
                {t('transactions.types.expense')}
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                  formData.type === 'income'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                }`}
              >
                <ArrowUp className="h-5 w-5" />
                {t('transactions.types.income')}
              </button>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('transactions.category')}
            </label>
            {availableCategories.length > 0 ? (
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
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                >
                  <option value="">
                    {t('common.select')} {t('transactions.category').toLowerCase()}
                  </option>
                  {(() => {
                    const childrenOf = {};
                    availableCategories.forEach((c) => {
                      const pid = c.parentCategory?._id || c.parentCategory || null;
                      if (pid) {
                        if (!childrenOf[pid]) childrenOf[pid] = [];
                        childrenOf[pid].push(c);
                      }
                    });
                    const roots = availableCategories
                      .filter((c) => !c.parentCategory)
                      .sort((a, b) => a.name.localeCompare(b.name));

                    return roots.flatMap((root) => {
                      const children = (childrenOf[root._id] || []).sort((a, b) =>
                        a.name.localeCompare(b.name)
                      );
                      if (children.length === 0) {
                        return [
                          <option key={root._id} value={root.name}>
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
                              <option key={child._id} value={child.name}>
                                {child.name}
                              </option>,
                              ...grandchildren.map((gc) => (
                                <option key={gc._id} value={gc.name}>
                                  {'    '}
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
            ) : (
              <>
                <input
                  type="text"
                  list="qtf-categories"
                  className="input-field"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Escribe una categoría..."
                  required
                  autoComplete="off"
                />
                <datalist id="qtf-categories">
                  {categorySuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Sin categorías — ve a Finanzas → Categorías para crearlas.
                </p>
              </>
            )}
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('transactions.amount')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                €
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input-field pl-8"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('transactions.description')} {t('common.optional')}
            </label>
            <input
              type="text"
              className="input-field"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('quickTransaction.descriptionPlaceholder')}
            />
          </div>

          {/* Asociar a deuda */}
          {formData.type === 'expense' && !businessId && activeDebts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <span className="flex items-center gap-1">
                  <Link className="h-4 w-4" />
                  {t('quickTransaction.associateDebt')}
                </span>
              </label>
              <select
                className="input-field"
                value={formData.debt}
                onChange={(e) => {
                  const debtId = e.target.value;
                  const debt = activeDebts.find((d) => d._id === debtId);
                  setFormData((prev) => ({
                    ...prev,
                    debt: debtId,
                    amount: debt?.monthlyPayment ? String(debt.monthlyPayment) : prev.amount,
                    subAccount: debt?.subAccount?._id || debt?.subAccount || prev.subAccount,
                  }));
                }}
              >
                <option value="">{t('quickTransaction.noDebt')}</option>
                {activeDebts.map((debt) => (
                  <option key={debt._id} value={debt._id}>
                    {debt.name} —{' '}
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
                      debt.remainingAmount
                    )}{' '}
                    {t('quickTransaction.pending')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('transactions.date')}
            </label>
            <input
              type="date"
              className="input-field"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          {/* Subcuenta agrupada por banco */}
          {subAccounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('transactions.subAccount')}
              </label>
              <div className="relative">
                <div className="input-field flex items-center justify-between pointer-events-none">
                  <span
                    className={
                      selectedSA
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-gray-400 dark:text-gray-500'
                    }
                  >
                    {saDisplayText || '—'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </div>
                <select
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  value={formData.subAccount}
                  onChange={(e) => setFormData({ ...formData, subAccount: e.target.value })}
                  required
                >
                  {Object.entries(
                    subAccounts.reduce((groups, sa) => {
                      const bank = sa.account?.name || '—';
                      if (!groups[bank]) groups[bank] = [];
                      groups[bank].push(sa);
                      return groups;
                    }, {})
                  ).map(([bank, accounts]) => (
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
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags <span className="text-gray-400 font-normal">{t('common.optional')}</span>
            </label>
            {formData.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          tags: prev.tags.filter((t) => t !== tag),
                        }))
                      }
                      className="hover:text-red-500 leading-none"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              className="input-field"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  const tag = tagInput.trim().replace(/,$/, '');
                  if (tag && !formData.tags?.includes(tag)) {
                    setFormData((prev) => ({ ...prev, tags: [...(prev.tags || []), tag] }));
                  }
                  setTagInput('');
                }
              }}
              placeholder="Añadir tag… (Enter para confirmar)"
            />
          </div>

          {/* Imagen adjunta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Imagen adjunta{' '}
              <span className="text-gray-400 font-normal">{t('common.optional')}</span>
            </label>
            {pendingImage ? (
              <div className="flex items-center gap-3 p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                {pendingImage.type === 'application/pdf' ? (
                  <div className="h-14 w-14 flex items-center justify-center rounded bg-red-50 dark:bg-red-900/20 flex-shrink-0">
                    <FileText className="h-7 w-7 text-red-500" />
                  </div>
                ) : (
                  <img
                    src={pendingImagePreview}
                    alt="Preview"
                    className="h-14 w-14 object-cover rounded flex-shrink-0"
                  />
                )}
                <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate">
                  {pendingImage.name}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(pendingImagePreview);
                    setPendingImage(null);
                    setPendingImagePreview(null);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Quitar imagen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  handleImageFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors select-none ${
                  isDragOver
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-500'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500'
                }`}
              >
                <Camera className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">
                  {isDragOver ? 'Suelta aquí' : 'Arrastra una imagen o PDF, o haz clic'}
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                handleImageFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 btn-primary"
              disabled={loading || !formData.subAccount || !formData.category || !formData.amount}
            >
              {loading ? t('common.saving') : t('common.add')}
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

export default QuickTransactionForm;
