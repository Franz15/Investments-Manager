import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  AlertCircle,
  Edit,
  Trash2,
  CreditCard,
  Home,
  Car,
  GraduationCap,
  FileText,
  Link,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useTranslation } from '../contexts/TranslationContext';

const Debts = () => {
  const { t } = useTranslation();
  const [debts, setDebts] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [selectedDebtForPayment, setSelectedDebtForPayment] = useState(null);
  const [investments, setInvestments] = useState([]);
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
    accountNumber: '',
    description: '',
    status: 'active',
    subAccount: '',
    isGoodDebt: false,
    collateral: [],
    amortizationType: 'french',
  });
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    paymentType: 'scheduled',
    earlyRepaymentMode: 'reduce_payment',
  });
  const [expandedDebt, setExpandedDebt] = useState(null);
  const [debtTransactions, setDebtTransactions] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [debtsRes, subAccountsRes, investmentsRes] = await Promise.all([
        api.get('/debts'),
        api.get('/subaccounts'),
        api.get('/investments', { params: { status: 'active' } }),
      ]);
      setDebts(debtsRes.data);
      setSubAccounts(subAccountsRes.data);
      setInvestments(investmentsRes.data || []);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isFrench = formData.amortizationType === 'french' || !formData.amortizationType;
      const calc = isFrench
        ? calcFrenchPayment(
            formData.totalAmount,
            formData.interestRate,
            formData.startDate,
            formData.endDate
          )
        : null;
      const payload = {
        ...formData,
        monthlyPayment: calc ? calc.monthly : formData.monthlyPayment,
      };
      if (editingDebt) {
        await api.put(`/debts/${editingDebt._id}`, payload);
      } else {
        await api.post('/debts', payload);
      }
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {}
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/debts/${selectedDebtForPayment._id}/payment`, paymentData);
      fetchData();
      setShowPaymentModal(false);
      setSelectedDebtForPayment(null);
      setPaymentData({
        amount: 0,
        date: new Date().toISOString().split('T')[0],
      });
    } catch (error) {}
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
      accountNumber: debt.accountNumber || '',
      description: debt.description || '',
      status: debt.status,
      subAccount: debt.subAccount?._id || debt.subAccount || '',
      isGoodDebt: goodDebtByDefault(debt.type),
      collateral: debt.collateral?.map((c) => c._id || c) || [],
      amortizationType: debt.amortizationType || 'french',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('debts.deleteConfirm'))) {
      try {
        await api.delete(`/debts/${id}`);
        fetchData();
      } catch (error) {}
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
      accountNumber: '',
      description: '',
      status: 'active',
      subAccount: '',
      isGoodDebt: false,
      collateral: [],
      amortizationType: 'french',
    });
    setEditingDebt(null);
  };

  const goodDebtByDefault = (type) => ['mortgage', 'student_loan', 'pledge'].includes(type);

  const calcFrenchPayment = (principal, annualRate, start, end) => {
    if (!principal || !start || !end) return null;
    const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
    const n = Math.round((new Date(end) - new Date(start)) / msPerMonth);
    if (n <= 0) return null;
    const r = annualRate / 100 / 12;
    const monthly =
      r > 0 ? (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : principal / n;
    return { monthly, n, total: monthly * n, interest: monthly * n - principal };
  };

  const toggleDebtTransactions = async (debtId) => {
    if (expandedDebt === debtId) {
      setExpandedDebt(null);
      return;
    }
    setExpandedDebt(debtId);
    if (!debtTransactions[debtId]) {
      try {
        const res = await api.get('/transactions', { params: { debt: debtId } });
        setDebtTransactions((prev) => ({ ...prev, [debtId]: res.data }));
      } catch {
        setDebtTransactions((prev) => ({ ...prev, [debtId]: [] }));
      }
    }
  };

  const fmt = (amount, currency = 'EUR') =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);

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
      case 'pledge':
        return <TrendingUp className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getTypeLabel = (type) => {
    const types = {
      mortgage: t('debts.types.mortgage'),
      personal_loan: t('debts.types.personalLoan'),
      car_loan: t('debts.types.carLoan'),
      credit_card: t('debts.types.creditCard'),
      student_loan: t('debts.types.studentLoan'),
      pledge: t('debts.types.pledge'),
      other: t('debts.types.other'),
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

  const activeDebts = debts.filter((d) => d.status === 'active');
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const totalMonthlyPayments = activeDebts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('debts.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t('debts.subtitle')}</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          {t('debts.newDebt')}
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('debts.totalDebt')}</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(totalDebt)}
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
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('debts.monthlyPayments')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(totalMonthlyPayments)}
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
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('debts.activeDebts')}</p>
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
          const paidPercentage =
            debt.totalAmount > 0
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {getTypeLabel(debt.type)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(debt.status)}`}
                  >
                    {getStatusLabel(debt.status)}
                  </span>
                  {debt.isGoodDebt && (
                    <span
                      title={t('debts.goodDebt')}
                      className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t('debts.totalAmountLabel')}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: debt.currency,
                    }).format(debt.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t('debts.remainingLabel')}
                  </span>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400">
                    {new Intl.NumberFormat('es-ES', {
                      style: 'currency',
                      currency: debt.currency,
                    }).format(debt.remainingAmount)}
                  </span>
                </div>
                {debt.monthlyPayment > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('debts.monthlyPaymentLabel')}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: debt.currency,
                      }).format(debt.monthlyPayment)}
                    </span>
                  </div>
                )}
                {debt.interestRate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('debts.interestRateLabel')}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {debt.interestRate}%
                    </span>
                  </div>
                )}
                {(debt.amortizationType === 'french' || !debt.amortizationType) &&
                  debt.interestRate > 0 &&
                  debt.monthlyPayment > 0 &&
                  (() => {
                    const r = debt.interestRate / 100 / 12;
                    const monthInterest = debt.remainingAmount * r;
                    const monthCapital = Math.max(0, debt.monthlyPayment - monthInterest);
                    const calc = calcFrenchPayment(
                      debt.totalAmount,
                      debt.interestRate,
                      debt.startDate,
                      debt.endDate
                    );
                    return (
                      <>
                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-dashed border-gray-200 dark:border-gray-700 pt-1 mt-1">
                          <span>
                            {t('debts.payment.capitalPortion')}{' '}
                            <span className="text-emerald-600">
                              {fmt(monthCapital, debt.currency)}
                            </span>
                          </span>
                          <span>
                            {t('debts.payment.interestPortion')}{' '}
                            <span className="text-red-500">
                              {fmt(monthInterest, debt.currency)}
                            </span>
                          </span>
                        </div>
                        {calc && (
                          <div className="mt-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 text-xs space-y-0.5">
                            <div className="flex justify-between text-gray-700 dark:text-gray-300 font-medium">
                              <span>{t('debts.totalCost')}</span>
                              <span>{fmt(calc.total, debt.currency)}</span>
                            </div>
                            <div className="flex justify-between text-gray-500 dark:text-gray-400">
                              <span>{t('debts.totalAmountLabel')}</span>
                              <span>{fmt(debt.totalAmount, debt.currency)}</span>
                            </div>
                            <div className="flex justify-between text-red-500">
                              <span>{t('debts.totalInterest')}</span>
                              <span>{fmt(calc.interest, debt.currency)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>Progreso de pago</span>
                    <span>{paidPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        backgroundColor: 'var(--user-color-600)',
                        width: `${paidPercentage}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {debt.subAccount && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  {debt.subAccount.account?.name
                    ? `${debt.subAccount.account.name} · ${debt.subAccount.name}`
                    : debt.subAccount.name}
                </p>
              )}
              {debt.type === 'pledge' && debt.collateral?.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t('debts.collateral')}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {debt.collateral.map((inv) => (
                      <span
                        key={inv._id}
                        className="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      >
                        {inv.name}
                        {inv.symbol ? ` (${inv.symbol})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked transactions */}
              <button
                type="button"
                onClick={() => toggleDebtTransactions(debt._id)}
                className="w-full flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-2 border-t border-gray-100 dark:border-gray-700 mt-2"
              >
                <span className="flex items-center gap-1.5">
                  <Link className="h-3.5 w-3.5" />
                  {t('quickTransaction.linkedPayments')}
                </span>
                {expandedDebt === debt._id ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {expandedDebt === debt._id && (
                <div className="mt-1 space-y-1">
                  {!debtTransactions[debt._id] ? (
                    <p className="text-xs text-gray-400 py-2 text-center">...</p>
                  ) : debtTransactions[debt._id].length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 text-center">
                      {t('transactions.noTransactions')}
                    </p>
                  ) : (
                    debtTransactions[debt._id].slice(0, 5).map((tx) => (
                      <div
                        key={tx._id}
                        className="flex justify-between text-xs py-1 px-2 rounded bg-gray-50 dark:bg-gray-700/50"
                      >
                        <span className="text-gray-600 dark:text-gray-400">
                          {new Date(tx.date).toLocaleDateString('es-ES')} ·{' '}
                          {tx.description || tx.category}
                        </span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          -{fmt(tx.amount, tx.currency)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {debt.status === 'active' && (
                  <button
                    onClick={() => {
                      setSelectedDebtForPayment(debt);
                      setPaymentData({
                        amount: debt.monthlyPayment || 0,
                        date: new Date().toISOString().split('T')[0],
                      });
                      setShowPaymentModal(true);
                    }}
                    className="flex-1 btn-secondary text-sm"
                  >
                    {t('quickTransaction.manualAdjustment')}
                  </button>
                )}
                <button
                  onClick={() => handleEdit(debt)}
                  className="flex-1 btn-secondary flex items-center justify-center"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  {t('common.edit')}
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
          {t('debts.noDebts')}
        </div>
      )}

      {/* Modal para crear/editar deuda */}
      {showModal &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="modal-content max-w-2xl w-full">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {editingDebt ? t('debts.editDebt') : t('debts.newDebt')}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('common.name')}
                    </label>
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('common.type')}
                    </label>
                    <select
                      className="input-field"
                      value={formData.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        setFormData({
                          ...formData,
                          type,
                          isGoodDebt: goodDebtByDefault(type),
                          collateral: type !== 'pledge' ? [] : formData.collateral,
                        });
                      }}
                      required
                    >
                      <option value="mortgage">{t('debts.types.mortgage')}</option>
                      <option value="personal_loan">{t('debts.types.personalLoan')}</option>
                      <option value="car_loan">{t('debts.types.carLoan')}</option>
                      <option value="credit_card">{t('debts.types.creditCard')}</option>
                      <option value="student_loan">{t('debts.types.studentLoan')}</option>
                      <option value="pledge">{t('debts.types.pledge')}</option>
                      <option value="other">{t('debts.types.other')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.modals.totalAmount')}
                    </label>
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
                          remainingAmount: editingDebt ? formData.remainingAmount : total,
                        });
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.modals.remainingAmount')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={formData.remainingAmount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          remainingAmount: parseFloat(e.target.value) || 0,
                        })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.modals.startDate')}
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
                      {t('debts.dueDate')}
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.modals.interestRate')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={formData.interestRate}
                      onChange={(e) =>
                        setFormData({ ...formData, interestRate: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.modals.monthlyPayment')}
                      {(formData.amortizationType === 'french' || !formData.amortizationType) &&
                        formData.endDate && (
                          <span className="ml-1 text-xs text-gray-400">
                            {t('debts.autoCalculated')}
                          </span>
                        )}
                    </label>
                    {(() => {
                      const isFrench =
                        formData.amortizationType === 'french' || !formData.amortizationType;
                      const calc = isFrench
                        ? calcFrenchPayment(
                            formData.totalAmount,
                            formData.interestRate,
                            formData.startDate,
                            formData.endDate
                          )
                        : null;
                      return (
                        <input
                          type="number"
                          step="0.01"
                          className={`input-field ${calc ? 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400' : ''}`}
                          value={calc ? calc.monthly.toFixed(2) : formData.monthlyPayment}
                          readOnly={!!calc}
                          onChange={
                            calc
                              ? undefined
                              : (e) =>
                                  setFormData({
                                    ...formData,
                                    monthlyPayment: parseFloat(e.target.value) || 0,
                                  })
                          }
                        />
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Moneda
                    </label>
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

                {/* Preview totales para amortización francesa */}
                {(() => {
                  const isFrench =
                    formData.amortizationType === 'french' || !formData.amortizationType;
                  const calc = isFrench
                    ? calcFrenchPayment(
                        formData.totalAmount,
                        formData.interestRate,
                        formData.startDate,
                        formData.endDate
                      )
                    : null;
                  if (!calc || !formData.interestRate) return null;
                  return (
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 text-xs space-y-1">
                      <div className="flex justify-between font-medium text-gray-700 dark:text-gray-300">
                        <span>{t('debts.totalCost')}</span>
                        <span>{fmt(calc.total, formData.currency)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 dark:text-gray-400">
                        <span>{t('debts.totalAmountLabel')}</span>
                        <span>{fmt(formData.totalAmount, formData.currency)}</span>
                      </div>
                      <div className="flex justify-between text-red-500">
                        <span>{t('debts.totalInterest')}</span>
                        <span>{fmt(calc.interest, formData.currency)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('debts.modals.accountNumber')}
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('transactions.subAccount')}
                  </label>
                  <select
                    className="input-field"
                    value={formData.subAccount}
                    onChange={(e) => setFormData({ ...formData, subAccount: e.target.value })}
                  >
                    <option value="">{t('debts.modals.unlinked')}</option>
                    {Object.entries(
                      subAccounts
                        .filter((sa) => sa.type === 'cash' || sa.type === 'savings')
                        .reduce((groups, sa) => {
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.modals.status')}
                    </label>
                    <select
                      className="input-field"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="active">{t('debts.modals.statusActive')}</option>
                      <option value="paid">{t('debts.modals.statusPaid')}</option>
                      <option value="default">{t('debts.modals.statusDefault')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.amortizationType')}
                    </label>
                    <select
                      className="input-field"
                      value={formData.amortizationType}
                      onChange={(e) =>
                        setFormData({ ...formData, amortizationType: e.target.value })
                      }
                    >
                      <option value="french">{t('debts.amortizationTypes.french')}</option>
                      <option value="fixed_principal">
                        {t('debts.amortizationTypes.fixedPrincipal')}
                      </option>
                      <option value="bullet">{t('debts.amortizationTypes.bullet')}</option>
                      <option value="other">{t('debts.amortizationTypes.other')}</option>
                    </select>
                  </div>
                </div>

                {/* Garantías para pignoración */}
                {formData.type === 'pledge' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4" />
                      {t('debts.collateral')}
                    </label>
                    <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                      {investments
                        .filter((inv) => inv.status === 'active')
                        .map((inv) => (
                          <label
                            key={inv._id}
                            className="flex items-center gap-2 p-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.collateral.includes(inv._id)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...formData.collateral, inv._id]
                                  : formData.collateral.filter((id) => id !== inv._id);
                                setFormData({ ...formData, collateral: next });
                              }}
                              className="rounded"
                            />
                            <span className="text-sm text-gray-800 dark:text-gray-200">
                              {inv.name}
                              {inv.symbol ? (
                                <span className="text-xs text-gray-500 ml-1">({inv.symbol})</span>
                              ) : null}
                            </span>
                            <span className="ml-auto text-xs text-gray-500">
                              {new Intl.NumberFormat('es-ES', {
                                style: 'currency',
                                currency: inv.currency || 'EUR',
                              }).format((inv.currentPrice || 0) * (inv.quantity || 0))}
                            </span>
                          </label>
                        ))}
                      {investments.filter((inv) => inv.status === 'active').length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">
                          {t('investments.noInvestments')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('debts.modals.description')}
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 btn-primary">
                    {editingDebt ? t('debts.modals.update') : t('debts.modals.create')}
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

      {/* Modal para registrar pago */}
      {showPaymentModal &&
        selectedDebtForPayment &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="modal-content max-w-md w-full">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {t('quickTransaction.manualAdjustment')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {selectedDebtForPayment.name} · {t('debts.remainingLabel')}{' '}
                {fmt(selectedDebtForPayment.remainingAmount, selectedDebtForPayment.currency)}
              </p>
              <form onSubmit={handlePayment} className="space-y-4">
                {/* Tipo de pago */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('debts.payment.paymentType')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['scheduled', 'early_partial', 'early_total'].map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => {
                          const updates = { paymentType: pt };
                          if (pt === 'scheduled')
                            updates.amount = selectedDebtForPayment.monthlyPayment || 0;
                          if (pt === 'early_total')
                            updates.amount = selectedDebtForPayment.remainingAmount;
                          if (pt === 'early_partial') updates.amount = 0;
                          setPaymentData((prev) => ({ ...prev, ...updates }));
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          paymentData.paymentType === pt
                            ? 'border-transparent text-white'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                        style={
                          paymentData.paymentType === pt
                            ? { backgroundColor: 'var(--user-color-600)' }
                            : {}
                        }
                      >
                        {t(`debts.payment.types.${pt}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Desglose amortización francesa para pago ordinario */}
                {paymentData.paymentType === 'scheduled' &&
                  (selectedDebtForPayment.amortizationType === 'french' ||
                    !selectedDebtForPayment.amortizationType) &&
                  selectedDebtForPayment.interestRate > 0 &&
                  selectedDebtForPayment.monthlyPayment > 0 &&
                  (() => {
                    const r = selectedDebtForPayment.interestRate / 100 / 12;
                    const interest = selectedDebtForPayment.remainingAmount * r;
                    const capital = Math.max(0, selectedDebtForPayment.monthlyPayment - interest);
                    return (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span>{t('debts.payment.interestPortion')}</span>
                          <span className="text-red-500">
                            {fmt(interest, selectedDebtForPayment.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span>{t('debts.payment.capitalPortion')}</span>
                          <span className="text-emerald-600">
                            {fmt(capital, selectedDebtForPayment.currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                {/* Modo de amortización anticipada parcial */}
                {paymentData.paymentType === 'early_partial' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('debts.payment.earlyRepaymentMode')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['reduce_payment', 'reduce_term'].map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() =>
                            setPaymentData((prev) => ({ ...prev, earlyRepaymentMode: mode }))
                          }
                          className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                            paymentData.earlyRepaymentMode === mode
                              ? 'border-transparent text-white'
                              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                          style={
                            paymentData.earlyRepaymentMode === mode
                              ? { backgroundColor: 'var(--user-color-600)' }
                              : {}
                          }
                        >
                          {t(`debts.payment.modes.${mode}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Importe */}
                {paymentData.paymentType !== 'early_total' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('common.amount')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={paymentData.amount}
                      onChange={(e) =>
                        setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })
                      }
                      max={selectedDebtForPayment.remainingAmount}
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('transactions.date')}
                  </label>
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
                    {t('debts.payment.confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setSelectedDebtForPayment(null);
                      setPaymentData({
                        amount: 0,
                        date: new Date().toISOString().split('T')[0],
                        paymentType: 'scheduled',
                        earlyRepaymentMode: 'reduce_payment',
                      });
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

export default Debts;
