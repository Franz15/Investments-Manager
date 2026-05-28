import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

/**
 * Modal de confirmación para acciones destructivas.
 * Props:
 *   isOpen      – boolean
 *   title       – string  (nombre/descripción de la transacción)
 *   amount      – number
 *   type        – 'income' | 'expense' | 'transfer'
 *   currency    – string (default 'EUR')
 *   onConfirm   – () => void
 *   onCancel    – () => void
 */
const ConfirmDeleteModal = ({
  isOpen,
  title,
  amount,
  type,
  currency = 'EUR',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const fmt = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n ?? 0);

  const amountColor =
    type === 'income'
      ? 'text-green-600 dark:text-green-400'
      : type === 'expense'
        ? 'text-red-600 dark:text-red-400'
        : 'text-blue-600 dark:text-blue-400';

  const amountSign = type === 'income' ? '+' : type === 'expense' ? '−' : '↔';

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/75 flex items-center justify-center z-[60] p-4">
      <div className="modal-content max-w-sm w-full">
        {/* Cabecera */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              ¿Eliminar transacción?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Esta acción no se puede deshacer.
            </p>
          </div>
        </div>

        {/* Detalle de la transacción */}
        {(title || amount != null) && (
          <div className="mb-5 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            {title && (
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {title}
              </p>
            )}
            {amount != null && (
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${amountColor}`}>
                {amountSign}
                {fmt(amount)}
              </p>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 btn-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDeleteModal;
