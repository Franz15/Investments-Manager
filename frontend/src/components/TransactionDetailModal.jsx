import { useState, useEffect } from "react";
import { X, Edit, Trash2 } from "lucide-react";
import api from "../services/api";
import { useTranslation } from "../contexts/TranslationContext";

const TransactionDetailModal = ({
  isOpen,
  onClose,
  transaction,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [subAccounts, setSubAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    subAccount: "",
    type: "expense",
    category: "",
    amount: 0,
    currency: "EUR",
    description: "",
    date: new Date().toISOString().split("T")[0],
    business: null,
  });

  useEffect(() => {
    if (isOpen && transaction) {
      fetchData();
      setFormData({
        subAccount: transaction.subAccount?._id || transaction.subAccount || "",
        type: transaction.type,
        category: transaction.category,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description || "",
        date: new Date(transaction.date).toISOString().split("T")[0],
        business: transaction.business?._id || transaction.business || null,
      });
      setIsEditing(false);
    }
  }, [isOpen, transaction]);

  const fetchData = async () => {
    try {
      const [subAccountsRes, categoriesRes] = await Promise.all([
        api.get("/subaccounts"),
        api.get("/categories", {
          params: {
            business:
              transaction?.business?._id || transaction?.business || "null",
          },
        }),
      ]);

      const filteredSubAccounts = subAccountsRes.data.filter(
        (sa) => sa.isActive,
      );
      setSubAccounts(filteredSubAccounts);

      const filteredCategories = categoriesRes.data.filter(
        (cat) => cat.isActive,
      );
      setCategories(filteredCategories);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/transactions/${transaction._id}`, formData);
      if (onUpdate) {
        onUpdate();
      }
      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error("Error updating transaction:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t("transactions.deleteConfirm"))) {
      setLoading(true);
      try {
        await api.delete(`/transactions/${transaction._id}`);
        if (onDelete) {
          onDelete();
        }
        onClose();
      } catch (error) {
        console.error("Error deleting transaction:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen || !transaction) return null;

  const availableCategories = categories.filter(
    (cat) => cat.type === formData.type,
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="modal-content max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {isEditing
              ? t("transactions.editTransaction")
              : t("transactions.transactionDetails")}
          </h2>
          <div className="flex gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title={t("common.edit")}
                >
                  <Edit className="h-5 w-5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title={t("common.delete")}
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
                {t("transactions.type")}
              </label>
              <select
                className="input-field"
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setFormData({ ...formData, type: newType });
                  // Resetear categoría si no es compatible
                  const compatibleCategories = categories.filter(
                    (cat) => cat.type === newType,
                  );
                  if (
                    compatibleCategories.length > 0 &&
                    !compatibleCategories.find(
                      (c) => c.name === formData.category,
                    )
                  ) {
                    setFormData((prev) => ({
                      ...prev,
                      category: compatibleCategories[0].name,
                    }));
                  }
                }}
                required
              >
                <option value="income">{t("transactions.types.income")}</option>
                <option value="expense">
                  {t("transactions.types.expense")}
                </option>
                <option value="transfer">
                  {t("transactions.types.transfer")}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.category")}
              </label>
              <select
                className="input-field"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                required
              >
                <option value="">
                  {t("common.select")}{" "}
                  {t("transactions.category").toLowerCase()}
                </option>
                {availableCategories.map((category) => (
                  <option key={category._id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.amount")}
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      amount: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.description")} {t("common.optional")}
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.date")}
              </label>
              <input
                type="date"
                className="input-field"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.subAccount")}
              </label>
              <select
                className="input-field"
                value={formData.subAccount}
                onChange={(e) =>
                  setFormData({ ...formData, subAccount: e.target.value })
                }
                required
              >
                {subAccounts.map((subAccount) => (
                  <option key={subAccount._id} value={subAccount._id}>
                    {subAccount.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 btn-primary"
                disabled={loading}
              >
                {loading ? t("common.saving") : t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 btn-secondary"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("transactions.type")}
                </label>
                <p className="text-gray-900 dark:text-gray-100 capitalize">
                  {t(`transactions.types.${transaction.type}`)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("transactions.amount")}
                </label>
                <p
                  className={`text-lg font-semibold ${
                    transaction.type === "income"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {transaction.type === "income" ? "+" : "-"}
                  {new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: transaction.currency,
                  }).format(transaction.amount)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("transactions.category")}
              </label>
              <p className="text-gray-900 dark:text-gray-100">
                {transaction.category}
              </p>
            </div>

            {transaction.description && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("transactions.description")}
                </label>
                <p className="text-gray-900 dark:text-gray-100">
                  {transaction.description}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("transactions.date")}
                </label>
                <p className="text-gray-900 dark:text-gray-100">
                  {new Date(transaction.date).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("transactions.subAccount")}
                </label>
                <p className="text-gray-900 dark:text-gray-100">
                  {transaction.subAccount?.name || "-"}
                </p>
              </div>
            </div>

            {transaction.business && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("businesses.business")}
                </label>
                <p className="text-gray-900 dark:text-gray-100">
                  {transaction.business?.name || "-"}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 btn-primary"
              >
                {t("common.edit")}
              </button>
              <button onClick={onClose} className="flex-1 btn-secondary">
                {t("common.close")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionDetailModal;
