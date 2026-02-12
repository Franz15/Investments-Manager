import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Lock } from "lucide-react";
import api from "../services/api";
import { useTranslation } from "../contexts/TranslationContext";
import { useUser } from "../contexts/UserContext";

const AdminAccess = () => {
  const { t } = useTranslation();
  const { currentUser } = useUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [resettingUserId, setResettingUserId] = useState(null);
  const [error, setError] = useState(null);
  const [resetInfo, setResetInfo] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get("/users")
      .then((res) => {
        setUsers(res.data || []);
      })
      .catch((err) => {
        console.error("Error al cargar usuarios para admin:", err);
        setError(
          err.response?.data?.message ||
            "No se ha podido cargar la lista de usuarios.",
        );
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
          canChangePassword: user.permissions?.canChangePassword ?? true,
        },
      });
      const updated = res.data;
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
      );
    } catch (err) {
      console.error("Error al actualizar permisos de usuario:", err);
      setError(
        err.response?.data?.message ||
          "No se han podido actualizar los permisos del usuario.",
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
          canChangePassword: newValue,
        },
      });
      const updated = res.data;
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
      );
    } catch (err) {
      console.error(
        "Error al actualizar permiso de cambio de contraseña:",
        err,
      );
      setError(
        err.response?.data?.message ||
          t("adminAccess.resetPasswordError") ||
          "No se han podido actualizar los permisos del usuario.",
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
          ? t("adminAccess.resetPasswordGenerated", {
              password: data.generatedPassword,
            })
          : t("adminAccess.resetPasswordSuccess"),
      });
    } catch (err) {
      console.error("Error al resetear contraseña de usuario:", err);
      setError(
        err.response?.data?.message ||
          t("adminAccess.resetPasswordError") ||
          "No se ha podido resetear la contraseña del usuario.",
      );
    } finally {
      setResettingUserId(null);
    }
  };

  const isCurrentAdmin =
    currentUser?.role === "admin" || currentUser?.id === "javier";

  if (!isCurrentAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-xl w-full rounded-2xl border px-6 py-8 text-center bg-white dark:bg-[#18181b] border-gray-200 dark:border-[#27272a]">
          <div className="flex justify-center mb-4">
            <ShieldCheck className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
            {t("adminAccess.forbiddenTitle") ||
              "Solo Javier o un administrador puede acceder a este panel"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("adminAccess.forbiddenDescription") ||
              "No tienes permisos suficientes para gestionar accesos."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {t("adminAccess.title") || "Gestión de accesos"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("adminAccess.subtitle") ||
                "Activa o desactiva el acceso a las distintas partes de la aplicación para cada usuario."}
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
          <div className="px-4 py-3 border-b border-gray-100 dark:border-[#27272a] flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("adminAccess.usersHeader") || "Usuarios"}
            </span>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>
                  {t("adminAccess.loading") || "Cargando usuarios..."}
                </span>
              </div>
            )}
          </div>

          <div className="divide-y divide-gray-100 dark:divide-[#27272a]">
            {users.map((user) => {
              const isSelf = user.id === currentUser?.id;
              return (
                <div
                  key={user.id}
                  className="px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {user.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        @{user.id}
                        {isSelf ? " · tú" : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-[#27272a] dark:text-gray-300">
                        {t("adminAccess.roleLabel") || "Rol"}:{" "}
                        {user.role === "admin"
                          ? t("adminAccess.roleAdmin") || "admin"
                          : t("adminAccess.roleUser") || "usuario"}
                      </span>
                      {user.id === "test-dca" && (
                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          {t("adminAccess.testAccount") || "Cuenta de test"}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelf ? (
                    // Javier: sin switches ni reset sobre sí mismo
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t("adminAccess.mainAdminLabel") ||
                        "Administrador principal (permisos fijos)"}
                    </div>
                  ) : (
                    <div className="flex items-center gap-6">
                      {/* Columna: Portfolio Builder */}
                      <div className="flex flex-col items-end gap-1 min-w-[120px]">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t("adminAccess.portfolioBuilderLabel") ||
                            "Portfolio Builder"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTogglePortfolioBuilder(user)}
                          disabled={savingUserId === user.id}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            user.permissions?.portfolioBuilder
                              ? "bg-emerald-500"
                              : "bg-gray-300 dark:bg-gray-600"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                          aria-pressed={user.permissions?.portfolioBuilder}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              user.permissions?.portfolioBuilder
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Columna: Permitir cambio de contraseña */}
                      <div className="flex flex-col items-end gap-1 min-w-[140px]">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t("adminAccess.canChangePasswordLabel") ||
                            "Permitir cambio de contraseña"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleCanChangePassword(user)}
                          disabled={savingUserId === user.id}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            (user.permissions?.canChangePassword ?? true)
                              ? "bg-emerald-500"
                              : "bg-gray-300 dark:bg-gray-600"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                          aria-pressed={
                            user.permissions?.canChangePassword ?? true
                          }
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              (user.permissions?.canChangePassword ?? true)
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Columna: Resetear contraseña */}
                      <div className="flex flex-col items-end gap-1 min-w-[140px]">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t("adminAccess.resetPasswordLabel") ||
                            "Resetear contraseña"}
                        </span>
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
                          <span>
                            {t("adminAccess.resetPasswordButton") || "Resetear"}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && users.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("adminAccess.empty") || "No se han encontrado usuarios."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAccess;
