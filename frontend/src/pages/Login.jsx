import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { Wallet, Lock, User } from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../contexts/TranslationContext';

const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, currentUser } = useUser();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        userId: userId.trim().toLowerCase(),
        password,
      });
      login(response.data.user, response.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 dark:bg-[#1d1d1f]">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4 bg-sky-500">
            <Wallet className="h-7 w-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            {t('sidebar.appName')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleLogin} className="card space-y-5">
          <div>
            <label
              htmlFor="userId"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              {t('login.username')}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="userId"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full input-field pl-10"
                placeholder={t('login.usernamePlaceholder')}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              {t('login.password')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full input-field pl-10"
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
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
            disabled={loading || !userId.trim() || !password}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed h-11 min-h-[44px] bg-sky-500 hover:bg-sky-600 text-white font-medium"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              t('login.login')
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
