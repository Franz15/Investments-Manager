/**
 * Toggle con estilo "pill" — checkbox de acento + label dentro de un borde.
 * Estándar único para todos los switches de la app (sustituye sliders verdes).
 * El color usa las CSS vars de acento del usuario (--user-color-*) y --tc-*.
 */
const ToggleChip = ({ checked, onChange, label, disabled = false }) => (
  <label
    className={`inline-flex items-center gap-2.5 select-none rounded-lg border px-3 py-2 transition-colors ${
      disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
    }`}
    style={{
      borderColor: checked ? 'var(--user-color-600)' : 'var(--tc-border)',
      background: checked ? 'rgba(var(--user-color-600-rgb, 201, 150, 26), 0.08)' : 'transparent',
    }}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="h-4 w-4 rounded cursor-pointer"
      style={{ accentColor: 'var(--user-color-600)' }}
    />
    {label && (
      <span
        className="text-sm font-medium whitespace-nowrap"
        style={{ color: checked ? 'var(--user-color-700)' : 'var(--tc-text-2)' }}
      >
        {label}
      </span>
    )}
  </label>
);

export default ToggleChip;
