import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2, Lock, Clock, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../contexts/TranslationContext';
import { useUser } from '../contexts/UserContext';

/**
 * Formatea una fecha como tiempo relativo (ej: "hace 2 horas", "hace 3 días")
 */
function formatTimeAgo(dateStr, t) {
  if (!dateStr) return t('adminAccess.lastLoginNever') || 'Nunca';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let time;
  if (diffSeconds < 60) {
    time = `${diffSeconds}s`;
  } else if (diffMinutes < 60) {
    time = `${diffMinutes}min`;
  } else if (diffHours < 24) {
    time = `${diffHours}h`;
  } else if (diffDays < 30) {
    time = `${diffDays}d`;
  } else {
    // Mostrar fecha directa si es muy antiguo
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const template = t('adminAccess.lastLoginAgo') || 'hace {time}';
  return template.replace('{time}', time);
}

/** Checkbox de acento (mismo control que el ToggleChip del resto de la app).
 *  En esta página va en una rejilla de permisos con cabeceras de columna, así
 *  que se usa el checkbox suelto (sin pill/label) para que encaje. */
const Toggle = ({ on, disabled, onClick }) => (
  <input
    type="checkbox"
    checked={!!on}
    disabled={disabled}
    onChange={onClick}
    className="h-5 w-5 flex-shrink-0 rounded cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
    style={{ accentColor: 'var(--user-color-600)' }}
    aria-pressed={on}
  />
);

const AdminAccess = () => {
  const { t } = useTranslation();
  const { currentUser } = useUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [resettingUserId, setResettingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [error, setError] = useState(null);
  const [resetInfo, setResetInfo] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get('/users')
      .then((res) => {
        setUsers(res.data || []);
      })
      .catch((err) => {
        console.error('Error al cargar usuarios para admin:', err);
        setError(err.response?.data?.message || 'No se ha podido cargar la lista de usuarios.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleTogglePortfolioBuilder = async (user) => {
    const newValue = !user.permissions?.portfolioBuilder;
    setSavingUserId(user.id);
    setError(null);
    try {
      const res = await api.patch(`/users/${user.id}/permissions`, {
        permissions: {
          portfolioBuilder: newValue,
          canAccessFinances: user.permissions?.canAccessFinances ?? true,
          canAccessBusinesses: user.permissions?.canAccessBusinesses ?? true,
          canChangePassword: user.permissions?.canChangePassword ?? true,
        },
      });
      const updated = res.data;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      console.error('Error al actualizar permisos de usuario:', err);
      setError(
        err.response?.data?.message || 'No se han podido actualizar los permisos del usuario.'
      );
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleFinances = async (user) => {
    const newValue = !(user.permissions?.canAccessFinances ?? true);
    setSavingUserId(user.id);
    setError(null);
    try {
      const res = await api.patch(`/users/${user.id}/permissions`, {
        permissions: {
          portfolioBuilder: user.permissions?.portfolioBuilder ?? false,
          canAccessFinances: newValue,
          canAccessBusinesses: user.permissions?.canAccessBusinesses ?? true,
          canChangePassword: user.permissions?.canChangePassword ?? true,
        },
      });
      const updated = res.data;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      console.error('Error al actualizar acceso a Finanzas:', err);
      setError(
        err.response?.data?.message || 'No se han podido actualizar los permisos del usuario.'
      );
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleBusinesses = async (user) => {
    const newValue = !(user.permissions?.canAccessBusinesses ?? true);
    setSavingUserId(user.id);
    setError(null);
    try {
      const res = await api.patch(`/users/${user.id}/permissions`, {
        permissions: {
          portfolioBuilder: user.permissions?.portfolioBuilder ?? false,
          canAccessFinances: user.permissions?.canAccessFinances ?? true,
          canAccessBusinesses: newValue,
          canChangePassword: user.permissions?.canChangePassword ?? true,
        },
      });
      const updated = res.data;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      console.error('Error al actualizar acceso a Negocios:', err);
      setError(
        err.response?.data?.message || 'No se han podido actualizar los permisos del usuario.'
      );
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleCanChangePassword = async (user) => {
    const current = user.permissions?.canChangePassword ?? true;
    const newValue = !current;
    setSavingUserId(user.id);
    setError(null);
    setResetInfo(null);
    try {
      const res = await api.patch(`/users/${user.id}/permissions`, {
        permissions: {
          portfolioBuilder: user.permissions?.portfolioBuilder ?? false,
          canAccessFinances: user.permissions?.canAccessFinances ?? true,
          canAccessBusinesses: user.permissions?.canAccessBusinesses ?? true,
          canChangePassword: newValue,
        },
      });
      const updated = res.data;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      console.error('Error al actualizar permiso de cambio de contraseña:', err);
      setError(
        err.response?.data?.message ||
          t('adminAccess.resetPasswordError') ||
          'No se han podido actualizar los permisos del usuario.'
      );
    } finally {
      setSavingUserId(null);
    }
  };

  const handleResetPassword = async (user) => {
    setResettingUserId(user.id);
    setError(null);
    setResetInfo(null);
    try {
      const res = await api.post(`/users/${user.id}/reset-password`, {});
      const data = res.data || {};
      setResetInfo({
        userId: user.id,
        message: data.generatedPassword
          ? t('adminAccess.resetPasswordGenerated', {
              password: data.generatedPassword,
            })
          : t('adminAccess.resetPasswordSuccess'),
      });
    } catch (err) {
      console.error('Error al resetear contraseña de usuario:', err);
      setError(
        err.response?.data?.message ||
          t('adminAccess.resetPasswordError') ||
          'No se ha podido resetear la contraseña del usuario.'
      );
    } finally {
      setResettingUserId(null);
    }
  };

  const handleDeleteUser = async (user) => {
    if (confirmDeleteId !== user.id) {
      // Primer clic: pedir confirmación
      setConfirmDeleteId(user.id);
      return;
    }
    // Segundo clic: ejecutar
    setConfirmDeleteId(null);
    setDeletingUserId(user.id);
    setError(null);
    try {
      await api.delete(`/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      console.error('Error al eliminar usuario:', err);
      setError(
        err.response?.data?.message ||
          t('adminAccess.deleteError') ||
          'No se ha podido eliminar el usuario.'
      );
    } finally {
      setDeletingUserId(null);
    }
  };

  const isCurrentAdmin = currentUser?.role === 'admin' || currentUser?.id === 'javier';

  if (!isCurrentAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-xl w-full rounded-2xl border px-6 py-8 text-center bg-white dark:bg-[#18181b] border-gray-200 dark:border-[#27272a]">
          <div className="flex justify-center mb-4">
            <ShieldCheck className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
            {t('adminAccess.forbiddenTitle') ||
              'Solo Javier o un administrador puede acceder a este panel'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('adminAccess.forbiddenDescription') ||
              'No tienes permisos suficientes para gestionar accesos.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {t('adminAccess.title') || 'Gestión de accesos'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('adminAccess.subtitle') ||
                'Activa o desactiva el acceso a las distintas partes de la aplicación para cada usuario.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {resetInfo && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            {resetInfo.message}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#27272a] dark:bg-[#18181b] overflow-hidden">
          {/* Cabecera de columnas — visible en desktop */}
          <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px_110px_110px_70px] gap-x-2 px-5 py-2.5 border-b border-gray-100 dark:border-[#27272a] bg-gray-50 dark:bg-gray-900/40 items-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('adminAccess.usersHeader') || 'Usuario'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              {t('adminAccess.portfolioBuilderLabel') || 'Portfolio'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              {t('adminAccess.financesLabel') || 'Finanzas'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              {t('adminAccess.businessesLabel') || 'Negocios'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              {t('adminAccess.canChangePasswordLabel') || 'Cambio pwd'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              {t('adminAccess.resetPasswordLabel') || 'Resetear'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              {t('adminAccess.deleteLabel') || 'Eliminar'}
            </span>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('adminAccess.loading') || 'Cargando usuarios...'}</span>
            </div>
          )}

          <div className="divide-y divide-gray-100 dark:divide-[#27272a]">
            {users.map((user) => {
              const isSelf = user.id === currentUser?.id;
              return (
                <div key={user.id}>
                  {/* Desktop: grid alineado con cabecera */}
                  <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px_110px_110px_70px] gap-x-2 px-5 py-4 items-center">
                    {/* Info usuario */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {user.name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          @{user.id}
                          {isSelf ? ' · tú' : ''}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-[#27272a] dark:text-gray-300">
                          {user.role === 'admin'
                            ? t('adminAccess.roleAdmin') || 'admin'
                            : t('adminAccess.roleUser') || 'usuario'}
                        </span>
                        {user.id === 'test-dca' && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            {t('adminAccess.testAccount') || 'Test'}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                          <Clock className="w-3 h-3" />
                          {user.lastLogin
                            ? formatTimeAgo(user.lastLogin, t)
                            : t('adminAccess.lastLoginNever') || 'Nunca'}
                        </span>
                      </div>
                    </div>

                    {isSelf ? (
                      <div className="col-span-6 text-xs text-gray-400 dark:text-gray-500 text-center italic">
                        {t('adminAccess.mainAdminLabel') ||
                          'Administrador principal (permisos fijos)'}
                      </div>
                    ) : (
                      <>
                        {/* Portfolio Builder */}
                        <div className="flex justify-center">
                          <Toggle
                            on={user.permissions?.portfolioBuilder}
                            disabled={savingUserId === user.id}
                            onClick={() => handleTogglePortfolioBuilder(user)}
                          />
                        </div>
                        {/* Finanzas */}
                        <div className="flex justify-center">
                          <Toggle
                            on={user.permissions?.canAccessFinances ?? true}
                            disabled={savingUserId === user.id}
                            onClick={() => handleToggleFinances(user)}
                          />
                        </div>
                        {/* Negocios */}
                        <div className="flex justify-center">
                          <Toggle
                            on={user.permissions?.canAccessBusinesses ?? true}
                            disabled={savingUserId === user.id}
                            onClick={() => handleToggleBusinesses(user)}
                          />
                        </div>
                        {/* Cambio contraseña */}
                        <div className="flex justify-center">
                          <Toggle
                            on={user.permissions?.canChangePassword ?? true}
                            disabled={savingUserId === user.id}
                            onClick={() => handleToggleCanChangePassword(user)}
                          />
                        </div>
                        {/* Resetear contraseña */}
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleResetPassword(user)}
                            disabled={resettingUserId === user.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors bg-white dark:bg-[#18181b] border-gray-200 dark:border-[#27272a] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#27272a] disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {resettingUserId === user.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Lock className="w-3 h-3" />
                            )}
                            {t('adminAccess.resetPasswordButton') || 'Resetear'}
                          </button>
                        </div>

                        {/* Eliminar usuario */}
                        <div className="flex justify-center">
                          {confirmDeleteId === user.id ? (
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user)}
                                disabled={deletingUserId === user.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 transition-colors"
                              >
                                {deletingUserId === user.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : null}
                                {t('adminAccess.deleteConfirmButton') || '¿Eliminar?'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              disabled={deletingUserId === user.id}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                              title={t('adminAccess.deleteLabel') || 'Eliminar usuario'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Mobile: tarjeta compacta */}
                  <div className="md:hidden px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {user.name}
                        </span>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                          @{user.id}
                          {isSelf ? ' · tú' : ''}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-[#27272a] dark:text-gray-300">
                        {user.role === 'admin'
                          ? t('adminAccess.roleAdmin') || 'admin'
                          : t('adminAccess.roleUser') || 'usuario'}
                      </span>
                    </div>
                    {!isSelf && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {[
                          {
                            label: t('adminAccess.portfolioBuilderLabel') || 'Portfolio Builder',
                            on: user.permissions?.portfolioBuilder,
                            handler: () => handleTogglePortfolioBuilder(user),
                          },
                          {
                            label: t('adminAccess.financesLabel') || 'Finanzas',
                            on: user.permissions?.canAccessFinances ?? true,
                            handler: () => handleToggleFinances(user),
                          },
                          {
                            label: t('adminAccess.businessesLabel') || 'Negocios',
                            on: user.permissions?.canAccessBusinesses ?? true,
                            handler: () => handleToggleBusinesses(user),
                          },
                          {
                            label: t('adminAccess.canChangePasswordLabel') || 'Cambio contraseña',
                            on: user.permissions?.canChangePassword ?? true,
                            handler: () => handleToggleCanChangePassword(user),
                          },
                        ].map(({ label, on, handler }) => (
                          <div key={label} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {label}
                            </span>
                            <Toggle on={on} disabled={savingUserId === user.id} onClick={handler} />
                          </div>
                        ))}
                      </div>
                    )}
                    {!isSelf && (
                      <div className="flex justify-end pt-1">
                        {confirmDeleteId === user.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                              {t('adminAccess.deleteConfirmButton') || '¿Eliminar?'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('adminAccess.deleteLabel') || 'Eliminar'}
                          </button>
                        )}
                      </div>
                    )}
                    {isSelf && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                        {t('adminAccess.mainAdminLabel') ||
                          'Administrador principal (permisos fijos)'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {!loading && users.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('adminAccess.empty') || 'No se han encontrado usuarios.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAccess;
