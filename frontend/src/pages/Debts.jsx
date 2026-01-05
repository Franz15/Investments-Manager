import { useEffect, useState } from 'react';
import { Plus, AlertCircle, Edit, Trash2, CreditCard, Home, Car, GraduationCap, FileText } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const Debts = () => {
  const [debts, setDebts] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [selectedDebtForPayment, setSelectedDebtForPayment] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'personal_loan',
    totalAmount: 0,
    remainingAmount: 0,
    interestRate: 0,
    monthlyPayment: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    currency: 'EUR',
    lender: '',
    accountNumber: '',
    description: '',
    status: 'active',
    subAccount: '',
  });
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [debtsRes, subAccountsRes] = await Promise.all([
        api.get('/debts'),
        api.get('/subaccounts'),
      ]);
      setDebts(debtsRes.data);
      setSubAccounts(subAccountsRes.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDebt) {
        await api.put(`/debts/${editingDebt._id}`, formData);
      } else {
        await api.post('/debts', formData);
      }
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/debts/${selectedDebtForPayment._id}/payment`, paymentData);
      fetchData();
      setShowPaymentModal(false);
      setSelectedDebtForPayment(null);
      setPaymentData({ amount: 0, date: new Date().toISOString().split('T')[0] });
    } catch (error) {
    }
  };

  const handleEdit = (debt) => {
    setEditingDebt(debt);
    setFormData({
      name: debt.name,
      type: debt.type,
      totalAmount: debt.totalAmount,
      remainingAmount: debt.remainingAmount,
      interestRate: debt.interestRate || 0,
      monthlyPayment: debt.monthlyPayment || 0,
      startDate: new Date(debt.startDate).toISOString().split('T')[0],
      endDate: debt.endDate ? new Date(debt.endDate).toISOString().split('T')[0] : '',
      currency: debt.currency,
      lender: debt.lender || '',
      accountNumber: debt.accountNumber || '',
      description: debt.description || '',
      status: debt.status,
      subAccount: debt.subAccount?._id || debt.subAccount || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta deuda?')) {
      try {
        await api.delete(`/debts/${id}`);
        fetchData();
      } catch (error) {
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'personal_loan',
      totalAmount: 0,
      remainingAmount: 0,
      interestRate: 0,
      monthlyPayment: 0,
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      currency: 'EUR',
      lender: '',
      accountNumber: '',
      description: '',
      status: 'active',
      subAccount: '',
    });
    setEditingDebt(null);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'mortgage':
        return <Home className="h-5 w-5" />;
      case 'car_loan':
        return <Car className="h-5 w-5" />;
      case 'student_loan':
        return <GraduationCap className="h-5 w-5" />;
      case 'credit_card':
        return <CreditCard className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getTypeLabel = (type) => {
    const types = {
      mortgage: 'Hipoteca',
      personal_loan: 'Préstamo Personal',
      car_loan: 'Préstamo Coche',
      credit_card: 'Tarjeta de Crédito',
      student_loan: 'Préstamo Estudiantil',
      other: 'Otro',
    };
    return types[type] || type;
  };

  const getStatusLabel = (status) => {
    const statuses = {
      active: 'Activa',
      paid: 'Pagada',
      default: 'En Mora',
    };
    return statuses[status] || status;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
      case 'paid':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'default':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const activeDebts = debts.filter(d => d.status === 'active');
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const totalMonthlyPayments = activeDebts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Deudas</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Gestiona tus préstamos, hipotecas y deudas</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center">
          <Plus className="h-5 w-5 mr-2" />
          Nueva Deuda
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Deuda Total</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalDebt)}
              </p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Cuotas Mensuales</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalMonthlyPayments)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <CreditCard className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Deudas Activas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {activeDebts.length}
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Lista de deudas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {debts.map((debt) => {
          const paidPercentage = debt.totalAmount > 0 
            ? ((debt.totalAmount - debt.remainingAmount) / debt.totalAmount) * 100 
            : 0;

          return (
            <div key={debt._id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    {getTypeIcon(debt.type)}
                  </div>
                  <div className="ml-3">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{debt.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{getTypeLabel(debt.type)}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(debt.status)}`}>
                  {getStatusLabel(debt.status)}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Monto Total:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: debt.currency }).format(debt.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Pendiente:</span>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400">
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: debt.currency }).format(debt.remainingAmount)}
                  </span>
                </div>
                {debt.monthlyPayment > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Cuota Mensual:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: debt.currency }).format(debt.monthlyPayment)}
                    </span>
                  </div>
                )}
                {debt.interestRate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tasa de Interés:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {debt.interestRate}%
                    </span>
                  </div>
                )}
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>Progreso de pago</span>
                    <span>{paidPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ backgroundColor: 'var(--user-color-600)', width: `${paidPercentage}%` }}
                    />
                  </div>
                </div>
              </div>

              {debt.lender && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Prestamista: {debt.lender}
                </p>
              )}

              <div className="flex gap-2 mt-4">
                {debt.status === 'active' && (
                  <button
                    onClick={() => {
                      setSelectedDebtForPayment(debt);
                      setPaymentData({ amount: debt.monthlyPayment || 0, date: new Date().toISOString().split('T')[0] });
                      setShowPaymentModal(true);
                    }}
                    className="flex-1 btn-primary text-sm"
                  >
                    Registrar Pago
                  </button>
                )}
                <button
                  onClick={() => handleEdit(debt)}
                  className="flex-1 btn-secondary flex items-center justify-center"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(debt._id)}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {debts.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No hay deudas registradas
        </div>
      )}

      {/* Modal para crear/editar deuda */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="modal-content max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingDebt ? 'Editar Deuda' : 'Nueva Deuda'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Hipoteca, Préstamo Coche"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select
                    className="input-field"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    required
                  >
                    <option value="mortgage">Hipoteca</option>
                    <option value="personal_loan">Préstamo Personal</option>
                    <option value="car_loan">Préstamo Coche</option>
                    <option value="credit_card">Tarjeta de Crédito</option>
                    <option value="student_loan">Préstamo Estudiantil</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto Total</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={formData.totalAmount}
                    onChange={(e) => {
                      const total = parseFloat(e.target.value) || 0;
                      setFormData({ 
                        ...formData, 
                        totalAmount: total,
                        remainingAmount: editingDebt ? formData.remainingAmount : total
                      });
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto Pendiente</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={formData.remainingAmount}
                    onChange={(e) => setFormData({ ...formData, remainingAmount: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tasa de Interés (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={formData.interestRate}
                    onChange={(e) => setFormData({ ...formData, interestRate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cuota Mensual</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={formData.monthlyPayment}
                    onChange={(e) => setFormData({ ...formData, monthlyPayment: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moneda</label>
                  <select
                    className="input-field"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de Inicio</label>
                  <input
                    type="date"
                    className="input-field"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    className="input-field"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prestamista</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.lender}
                    onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
                    placeholder="Banco o entidad"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número de Cuenta/Contrato</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subcuenta (Opcional)</label>
                <select
                  className="input-field"
                  value={formData.subAccount}
                  onChange={(e) => setFormData({ ...formData, subAccount: e.target.value })}
                >
                  <option value="">Sin vincular</option>
                  {subAccounts.map((subAccount) => (
                    <option key={subAccount._id} value={subAccount._id}>
                      {subAccount.account?.name || subAccount.account} - {subAccount.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select
                  className="input-field"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Activa</option>
                  <option value="paid">Pagada</option>
                  <option value="default">En Mora</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  {editingDebt ? 'Actualizar' : 'Crear'}
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

      {/* Modal para registrar pago */}
      {showPaymentModal && selectedDebtForPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="modal-content max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Registrar Pago
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Deuda: <strong>{selectedDebtForPayment.name}</strong><br />
              Pendiente: <strong>{new Intl.NumberFormat('es-ES', { style: 'currency', currency: selectedDebtForPayment.currency }).format(selectedDebtForPayment.remainingAmount)}</strong>
            </p>
            <form onSubmit={handlePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto del Pago</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                  max={selectedDebtForPayment.remainingAmount}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha del Pago</label>
                <input
                  type="date"
                  className="input-field"
                  value={paymentData.date}
                  onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn-primary">
                  Registrar Pago
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedDebtForPayment(null);
                    setPaymentData({ amount: 0, date: new Date().toISOString().split('T')[0] });
                  }}
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

export default Debts;



