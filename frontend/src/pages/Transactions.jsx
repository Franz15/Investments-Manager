import { useEffect, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';

const Transactions = () => {
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
    if (window.confirm('¿Estás seguro de eliminar esta transacción?')) {
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
    return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Transacciones</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Registra tus ingresos y gastos</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center">
          <Plus className="h-5 w-5 mr-2" />
          Nueva Transacción
        </button>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Fecha</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Cuenta</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Categoría</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Descripción</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Cantidad</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acciones</th>
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
                          {transaction.subAccount.name} ({transaction.subAccount.type === 'cash' ? 'Efectivo' : transaction.subAccount.type === 'investment' ? 'Inversión' : transaction.subAccount.type === 'savings' ? 'Ahorro' : 'Crédito'})
                        </div>
                      </div>
                    ) : transaction.subAccount?.name || 'N/A'}
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
                      {transaction.type === 'income' ? 'Ingreso' : transaction.type === 'expense' ? 'Gasto' : 'Transferencia'}
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
                        className="p-1 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
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
              No hay transacciones registradas
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingTransaction ? 'Editar Transacción' : 'Nueva Transacción'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subcuenta</label>
                <select
                  className="input-field"
                  value={formData.subAccount}
                  onChange={(e) => setFormData({ ...formData, subAccount: e.target.value })}
                  required
                >
                  <option value="">Seleccionar subcuenta</option>
                  {subAccounts.map((subAccount) => (
                    <option key={subAccount._id} value={subAccount._id}>
                      {subAccount.account?.name || subAccount.account} - {subAccount.name} ({subAccount.type === 'cash' ? 'Efectivo' : subAccount.type === 'investment' ? 'Inversión' : subAccount.type === 'savings' ? 'Ahorro' : 'Crédito'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  className="input-field"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                >
                  <option value="income">Ingreso</option>
                  <option value="expense">Gasto</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingTransaction ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 btn-secondary"
                >
                  Cancelar
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

