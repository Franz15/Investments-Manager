import { useState, useEffect } from "react";
import { X, ArrowUp, ArrowDown } from "lucide-react";
import api from "../services/api";
import { useTranslation } from "../contexts/TranslationContext";

const QuickTransactionForm = ({
  isOpen,
  onClose,
  businessId = null,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [subAccounts, setSubAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    subAccount: "",
    type: "expense",
    category: "",
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (isOpen) {
      fetchData();
      // Resetear formulario
      setFormData({
        subAccount: "",
        type: "expense",
        category: "",
        amount: "",
        description: "",
        date: new Date().toISOString().split("T")[0],
      });
    }
  }, [isOpen, businessId]);

  const fetchData = async () => {
    try {
      const [subAccountsRes, categoriesRes] = await Promise.all([
        api.get("/subaccounts"),
        api.get("/categories", {
          params: { business: businessId || "null" },
        }),
      ]);

      const filteredSubAccounts = subAccountsRes.data.filter(
        (sa) => sa.isActive,
      );
      setSubAccounts(filteredSubAccounts);

      // Filtrar categorías por tipo y contexto
      const filteredCategories = categoriesRes.data.filter(
        (cat) => cat.isActive,
      );
      setCategories(filteredCategories);

      // Seleccionar primera subcuenta y primera categoría por defecto
      if (filteredSubAccounts.length > 0) {
        setFormData((prev) => ({
          ...prev,
          subAccount: filteredSubAccounts[0]._id,
        }));
      }
      if (filteredCategories.length > 0) {
        const defaultCategory =
          filteredCategories.find((cat) => cat.type === "expense") ||
          filteredCategories[0];
        setFormData((prev) => ({
          ...prev,
          category: defaultCategory.name,
        }));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
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
        currency: "EUR",
        business: businessId || null,
      };

      await api.post("/transactions", transactionData);

      // Resetear formulario
      setFormData({
        subAccount: subAccounts.length > 0 ? subAccounts[0]._id : "",
        type: "expense",
        category: "",
        amount: "",
        description: "",
        date: new Date().toISOString().split("T")[0],
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      console.error("Error creating transaction:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (type) => {
    setFormData((prev) => {
      const newType = type;
      // Filtrar categorías por tipo
      const availableCategories = categories.filter(
        (cat) => cat.type === newType,
      );
      const newCategory =
        availableCategories.length > 0 ? availableCategories[0].name : "";

      return {
        ...prev,
        type: newType,
        category: newCategory,
      };
    });
  };

  if (!isOpen) return null;

  const availableCategories = categories.filter(
    (cat) => cat.type === formData.type,
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="modal-content max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("quickTransaction.title")}
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
              {t("quickTransaction.type")}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange("expense")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                  formData.type === "expense"
                    ? "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                }`}
              >
                <ArrowDown className="h-5 w-5" />
                {t("transactions.types.expense")}
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("income")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                  formData.type === "income"
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                }`}
              >
                <ArrowUp className="h-5 w-5" />
                {t("transactions.types.income")}
              </button>
            </div>
          </div>

          {/* Categoría */}
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
                {t("common.select")} {t("transactions.category").toLowerCase()}
              </option>
              {availableCategories.map((category) => (
                <option key={category._id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cantidad */}
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
                  setFormData({ ...formData, amount: e.target.value })
                }
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Descripción */}
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
              placeholder={t("quickTransaction.descriptionPlaceholder")}
            />
          </div>

          {/* Fecha */}
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

          {/* Subcuenta (si hay más de una) */}
          {subAccounts.length > 1 && (
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
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 btn-primary"
              disabled={
                loading ||
                !formData.subAccount ||
                !formData.category ||
                !formData.amount
              }
            >
              {loading ? t("common.saving") : t("common.add")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickTransactionForm;
