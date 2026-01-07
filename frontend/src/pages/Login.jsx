import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUser } from "../contexts/UserContext";
import { Wallet, Lock } from "lucide-react";
import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { useTranslation } from "../contexts/TranslationContext";

const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, currentUser } = useUser();
  const [users] = useState([
    {
      id: "javier",
      name: "Javier",
      avatar: "👨",
      color: "#3b82f6",
    },
    {
      id: "ana",
      name: "Ana",
      avatar: "👩",
      color: "#ec4899",
    },
    {
      id: "test-dca",
      name: "Test DCA",
      avatar: "🧪",
      color: "#10b981",
    },
  ]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Si ya hay un usuario logueado, redirigir al dashboard
    if (currentUser) {
      navigate("/", { replace: true });
    }
  }, [currentUser, navigate]);

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setPassword("");
    setError("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        userId: selectedUser.id,
        password: password,
      });

      login(response.data.user, response.data.token);
      navigate("/");
    } catch (error) {
      // Mantener el usuario seleccionado y mostrar el error
      // No resetear selectedUser ni password para que el usuario pueda intentar de nuevo
      setError(error.response?.data?.message || t("login.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 dark:bg-[#1d1d1f]">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded mb-4"
            style={{ backgroundColor: selectedUser?.color || "#3b82f6" }}
          >
            <Wallet className="h-6 w-6 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            {t("sidebar.appName")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 tracking-tight">
            {selectedUser ? t("login.enterPassword") : t("login.selectUser")}
          </p>
        </div>

        {!selectedUser ? (
          <div className="space-y-3">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => handleSelectUser(user)}
                className="w-full card flex items-center gap-4 p-5 transition-colors"
                onMouseEnter={(e) => {
                  const isDark =
                    document.documentElement.classList.contains("dark");
                  e.currentTarget.style.borderColor = isDark
                    ? `${user.color}80`
                    : `${user.color}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
              >
                <div
                  className="w-11 h-11 rounded flex items-center justify-center text-xl"
                  style={{
                    backgroundColor: `${user.color}15`,
                    border: `1px solid ${user.color}30`,
                  }}
                >
                  {user.avatar}
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-0.5">
                    {user.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("login.login")}
                  </p>
                </div>
                <div className="text-gray-400 dark:text-gray-600">→</div>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleLogin} className="card space-y-4">
            <button
              type="button"
              onClick={() => {
                setSelectedUser(null);
                setPassword("");
                setError("");
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
            >
              ← {t("login.back")}
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-12 h-12 rounded flex items-center justify-center text-2xl"
                style={{
                  backgroundColor: `${selectedUser.color}15`,
                  border: `1px solid ${selectedUser.color}30`,
                }}
              >
                {selectedUser.avatar}
              </div>
              <div>
                <h2 className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  {selectedUser.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("login.enterPassword")}
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t("login.password")}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full input-field pl-10"
                  placeholder={t("login.passwordPlaceholder")}
                  autoFocus
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed h-11 min-h-[44px]"
              style={{ backgroundColor: selectedUser.color }}
              onMouseEnter={(e) =>
                !e.currentTarget.disabled &&
                (e.currentTarget.style.opacity = "0.9")
              }
              onMouseLeave={(e) =>
                !e.currentTarget.disabled &&
                (e.currentTarget.style.opacity = "1")
              }
            >
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{
                      borderColor: "currentColor",
                      borderTopColor: "transparent",
                      opacity: 0.8,
                    }}
                  ></div>
                  <span>{t("common.loading")}</span>
                </>
              ) : (
                t("login.login")
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
