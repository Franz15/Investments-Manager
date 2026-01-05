import { useEffect, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useTranslation } from '../contexts/TranslationContext';

const Transactions = () => {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formData, setFormData] = useState({
    subAccount: '',
    type: 'expense',
    category: '',
    amount: 0,
    currency: 'EUR',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [transactionsRes, subAccountsRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/subaccounts'),
      ]);
      setTransactions(transactionsRes.data);
      setSubAccounts(subAccountsRes.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTransaction) {
        await api.put(`/transactions/${editingTransaction._id}`, formData);
      } else {
        await api.post('/transactions', formData);
      }
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      subAccount: transaction.subAccount?._id || transaction.subAccount,
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description || '',
      date: new Date(transaction.date).toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('transactions.deleteConfirm'))) {
      try {
        await api.delete(`/transactions/${id}`);
        fetchData();
      } catch (error) {
      }
    }
  };

  const resetForm = () => {
    setFormData({
      subAccount: '',
      type: 'expense',
      category: '',
      amount: 0,
      currency: 'EUR',
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
    setEditingTransaction(null);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('transactions.title')}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t('transactions.subtitle')}</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center">
          <Plus className="h-5 w-5 mr-2" />
          {t('transactions.newTransaction')}
        </button>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">{t('common.date')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">{t('transactions.account')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">{t('common.type')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">{t('transactions.category')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">{t('transactions.description')}</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">{t('common.amount')}</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction._id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="py-3 px-4">
                    {format(new Date(transaction.date), 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="py-3 px-4">
                    {transaction.subAccount?.account?.name ? (
                      <div>
                        <div className="font-medium">{transaction.subAccount.account.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {transaction.subAccount.name} ({transaction.subAccount.type === 'cash' ? t('accounts.subAccountTypes.cash') : transaction.subAccount.type === 'investment' ? t('accounts.subAccountTypes.investment') : transaction.subAccount.type === 'savings' ? t('accounts.subAccountTypes.savings') : t('accounts.subAccountTypes.credit')})
                        </div>
                      </div>
                    ) : transaction.subAccount?.name || '-'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      transaction.type === 'income'
                        ? 'bg-green-100 text-green-800'
                        : transaction.type === 'expense'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {transaction.type === 'income' ? (
                        <ArrowUp className="h-3 w-3 mr-1" />
                      ) : transaction.type === 'expense' ? (
                        <ArrowDown className="h-3 w-3 mr-1" />
                      ) : null}
                      {transaction.type === 'income' ? t('transactions.types.income') : transaction.type === 'expense' ? t('transactions.types.expense') : t('transactions.types.transfer')}
                    </span>
                  </td>
                  <td className="py-3 px-4">{transaction.category}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{transaction.description || '-'}</td>
                  <td className={`py-3 px-4 text-right font-semibold ${
                    transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.type === 'income' ? '+' : '-'}
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: transaction.currency }).format(transaction.amount)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(transaction)}
                        className="p-1 text-gray-600 dark:text-gray-400 transition-colors"
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--user-color-600)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = ''}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(transaction._id)}
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
          {transactions.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('transactions.noTransactions')}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="modal-content max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingTransaction ? t('transactions.editTransaction') : t('transactions.newTransaction')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('transactions.subAccount')}</label>
                <select
                  className="input-field"
                  value={formData.subAccount}
                  onChange={(e) => setFormData({ ...formData, subAccount: e.target.value })}
                  required
                >
                  <option value="">{t('transactions.selectSubAccount')}</option>
                  {subAccounts.map((subAccount) => (
                    <option key={subAccount._id} value={subAccount._id}>
                      {subAccount.account?.name || subAccount.account} - {subAccount.name} ({subAccount.type === 'cash' ? t('accounts.subAccountTypes.cash') : subAccount.type === 'investment' ? t('accounts.subAccountTypes.investment') : subAccount.type === 'savings' ? t('accounts.subAccountTypes.savings') : t('accounts.subAccountTypes.credit')})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.type')}</label>
                <select
                  className="input-field"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                >
                  <option value="income">{t('transactions.types.income')}</option>
                  <option value="expense">{t('transactions.types.expense')}</option>
                  <option value="transfer">{t('transactions.types.transfer')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.category')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.date')}</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.description')}</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingTransaction ? t('transactions.update') : t('transactions.create')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 btn-secondary"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;

