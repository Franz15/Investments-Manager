import { useEffect, useRef, useState } from 'react';
import { Landmark, RefreshCw, Trash2, Plus, AlertTriangle, ChevronDown, Check } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';

const STATUS = {
  active: { text: 'Activa', dot: 'bg-green-500', cls: 'text-green-600 dark:text-green-400' },
  expired: {
    text: 'Consentimiento expirado',
    dot: 'bg-amber-500',
    cls: 'text-amber-600 dark:text-amber-400',
  },
  revoked: { text: 'Revocada', dot: 'bg-red-500', cls: 'text-red-600 dark:text-red-400' },
  error: { text: 'Error', dot: 'bg-red-500', cls: 'text-red-600 dark:text-red-400' },
};

const EXPIRY_WARNING_DAYS = 15;

// Listbox propio: el popup de un <select> nativo lo pinta el SO y no se puede estilar.
// ponytail: sin navegación por flechas; añadir (o traer una lib headless) si crece el uso.
const PANEL_MAX_PX = 240; // max-h-56 + margen

const Select = ({ value, onChange, options, placeholder, disabled }) => {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < PANEL_MAX_PX && rect.top > PANEL_MAX_PX);
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="input-field flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? 'truncate' : 'truncate text-[var(--tc-text-3)]'}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[var(--tc-text-3)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className={`absolute z-20 w-full max-h-56 overflow-auto rounded-[10px] border border-[var(--tc-border)] bg-[var(--tc-surface)] shadow-xl py-1 ${
            openUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:bg-[var(--tc-gold-dim)] ${
                  o.value === value ? 'text-[var(--tc-gold)] font-medium' : ''
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="w-4 h-4 shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Mapeo en dos pasos: primero la cuenta, luego una de sus subcuentas
const SubAccountPicker = ({ subAccounts, value, onChange }) => {
  const mapped = subAccounts.find((sa) => sa._id === value);
  const [accountId, setAccountId] = useState(mapped?.account?._id || '');

  const accounts = [
    ...new Map(
      subAccounts.filter((sa) => sa.account).map((sa) => [sa.account._id, sa.account])
    ).values(),
  ];
  const options = subAccounts.filter((sa) => sa.account?._id === accountId);

  const pickAccount = (id) => {
    setAccountId(id);
    if (value) onChange(''); // cambiar de cuenta desmapea hasta elegir subcuenta
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="w-full sm:w-44">
        <Select
          value={accountId}
          onChange={pickAccount}
          placeholder="Sin asignar"
          options={[
            { value: '', label: 'Sin asignar' },
            ...accounts.map((a) => ({ value: a._id, label: a.name })),
          ]}
        />
      </div>
      <div className="w-full sm:w-44">
        <Select
          value={value || ''}
          onChange={onChange}
          disabled={!accountId}
          placeholder={accountId ? 'Elige subcuenta…' : '—'}
          options={options.map((sa) => ({ value: sa._id, label: sa.name }))}
        />
      </div>
    </div>
  );
};

const BankConnections = ({ onSynced }) => {
  const [connections, setConnections] = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [aspsps, setAspsps] = useState(null); // null = aún no cargados
  const [selectedAspsp, setSelectedAspsp] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    try {
      const [conns, subs] = await Promise.all([
        api.get('/bank-connections'),
        api.get('/subaccounts'),
      ]);
      setConnections(conns.data);
      setSubAccounts(subs.data);
    } catch {
      setError('Error cargando las conexiones bancarias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openConnect = async () => {
    setShowConnect(true);
    if (aspsps) return;
    try {
      const res = await api.get('/bank-connections/aspsps?country=ES');
      setAspsps(res.data);
    } catch {
      setError('Error consultando los bancos disponibles');
      setShowConnect(false);
    }
  };

  const startConnection = async () => {
    if (!selectedAspsp) return;
    setBusy(true);
    try {
      const res = await api.post('/bank-connections/start', { aspspName: selectedAspsp });
      window.location.href = res.data.url; // redirect al banco
    } catch {
      setError('Error iniciando la conexión con el banco');
      setBusy(false);
    }
  };

  const syncNow = async (c) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Primera sincronización de alguna subcuenta mapeada → historial completo
      // (solo posible con usuario presente, PSD2)
      const full = (c.accounts || []).some((a) => a.subAccount && !a.lastSyncedAt);
      const res = await api.post(`/bank-connections/${c._id}/sync`, { full });
      setNotice(
        res.data.created === 0
          ? 'Sin movimientos nuevos. Saldo actualizado.'
          : `${res.data.created} transacciones importadas. Saldo actualizado.`
      );
      await load();
      onSynced?.(); // la página que nos contiene refresca sus saldos
    } catch (err) {
      setError(err.response?.data?.message || 'Error sincronizando');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (id) => {
    if (!confirm('¿Desconectar este banco? Se revocará el consentimiento.')) return;
    setBusy(true);
    try {
      await api.delete(`/bank-connections/${id}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const mapSubAccount = async (connection, uid, subAccountId) => {
    const mappings = [{ uid, subAccount: subAccountId || null }];
    const res = await api.put(`/bank-connections/${connection._id}/accounts`, { mappings });
    setConnections((prev) => prev.map((c) => (c._id === connection._id ? res.data : c)));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="mt-10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Landmark className="w-5 h-5" /> Conexiones bancarias
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Importa movimientos y saldos automáticamente de tus bancos (PSD2)
          </p>
        </div>
        <button onClick={openConnect} className="btn-primary">
          <Plus className="w-4 h-4" /> Conectar banco
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
          {notice}
        </div>
      )}

      {showConnect && (
        <div className="bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#404040] rounded-lg p-4 space-y-3">
          <h3 className="font-semibold">Selecciona tu banco</h3>
          {!aspsps ? (
            <LoadingSpinner />
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Select
                  value={selectedAspsp}
                  onChange={setSelectedAspsp}
                  placeholder="— Elige un banco —"
                  options={aspsps.map((a) => ({ value: a.name, label: a.name }))}
                />
              </div>
              <button
                onClick={startConnection}
                disabled={!selectedAspsp || busy}
                className="btn-primary"
              >
                Autorizar en el banco
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Serás redirigido a tu banco para autorizar el acceso de solo lectura. El consentimiento
            dura hasta 180 días.
          </p>
        </div>
      )}

      {connections.length === 0 && !showConnect && (
        <p className="text-gray-500 dark:text-gray-400">
          No hay bancos conectados. Conecta uno para importar tus movimientos automáticamente.
        </p>
      )}

      {connections.map((c) => {
        const status = STATUS[c.status] || { text: c.status, dot: 'bg-gray-400', cls: '' };
        const daysLeft = c.validUntil
          ? Math.ceil((new Date(c.validUntil) - Date.now()) / (24 * 3600 * 1000))
          : null;
        return (
          <div
            key={c._id}
            className="bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#404040] rounded-lg"
          >
            <div className="flex items-center justify-between flex-wrap gap-2 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  {(c.aspsp?.name || '?')[0]}
                </div>
                <div>
                  <h3 className="font-semibold leading-tight">{c.aspsp?.name}</h3>
                  <p className="text-sm flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${status.dot}`} />
                    <span className={status.cls}>{status.text}</span>
                    {c.status === 'active' && c.validUntil && (
                      <span
                        className={
                          daysLeft <= EXPIRY_WARNING_DAYS
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }
                      >
                        · expira {format(new Date(c.validUntil), 'd MMM yyyy', { locale: es })} (
                        {daysLeft} días)
                      </span>
                    )}
                  </p>
                  {c.lastSyncError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{c.lastSyncError}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {c.status === 'active' && (
                  <button
                    onClick={() => syncNow(c)}
                    disabled={busy}
                    title="Sincronizar ahora"
                    className="p-2 rounded-lg border border-gray-300 dark:border-[#404040] hover:bg-gray-100 dark:hover:bg-[#3a3a3c] disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <button
                  onClick={() => disconnect(c._id)}
                  disabled={busy}
                  title="Desconectar"
                  className="p-2 rounded-lg border border-gray-300 dark:border-[#404040] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-[#3a3a3c] divide-y divide-gray-100 dark:divide-[#3a3a3c]">
              {(c.accounts || []).map((a) => (
                <div
                  key={a.uid}
                  className="flex items-center justify-between flex-wrap gap-2 text-sm px-4 py-2.5"
                >
                  <div>
                    <span className="font-medium">{a.name}</span>{' '}
                    {a.ibanMasked && <span className="text-gray-400">({a.ibanMasked})</span>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {a.lastSyncedAt
                        ? `Sincronizada ${formatDistanceToNow(new Date(a.lastSyncedAt), { addSuffix: true, locale: es })}`
                        : 'Nunca sincronizada'}
                    </p>
                  </div>
                  <SubAccountPicker
                    subAccounts={subAccounts}
                    value={a.subAccount || ''}
                    onChange={(id) => mapSubAccount(c, a.uid, id)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BankConnections;
