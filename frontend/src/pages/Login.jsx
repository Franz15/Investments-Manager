import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../contexts/TranslationContext';
import TradeClimbLogo from '../components/Logo';

/* ── Decorative background pattern ──────────────────────────── */
const GridPattern = () => (
  <svg
    className="absolute inset-0 w-full h-full opacity-[0.03]"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" />
  </svg>
);

const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, currentUser } = useUser();

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) navigate('/', { replace: true });
  }, [currentUser, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', {
        userId: userId.trim().toLowerCase(),
        password,
      });
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#09090B' }}>
      {/* ── Left panel — brand ──────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-10 flex-shrink-0 relative overflow-hidden"
        style={{ background: '#0D0D10', borderRight: '1px solid rgba(255,255,255,0.05)' }}
      >
        <GridPattern />

        {/* Ambient gold glow */}
        <div
          className="absolute"
          style={{
            top: '-80px',
            left: '-80px',
            width: '320px',
            height: '320px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(201,150,26,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          className="absolute"
          style={{
            bottom: '-60px',
            right: '-60px',
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(201,150,26,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <TradeClimbLogo size={36} className="text-[#C9961A]" />
        </div>

        {/* Central brand copy */}
        <div className="relative z-10 space-y-6">
          <div>
            <p
              className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-4"
              style={{ color: 'rgba(201,150,26,0.7)' }}
            >
              TradeClimb · Portfolio Manager
            </p>
            <h1
              className="font-bold leading-tight mb-3"
              style={{
                fontSize: '2rem',
                color: 'rgba(255,255,255,0.92)',
                letterSpacing: '-0.03em',
              }}
            >
              Tu cartera,
              <br />
              bajo control.
            </h1>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.4)', maxWidth: '280px' }}
            >
              Inversiones, cuentas, deudas y presupuestos en un único panel diseñado para inversores
              serios.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-3">
            {[
              'Seguimiento de portfolio en tiempo real',
              'Análisis de rentabilidad por activo',
              'Control de presupuestos y previsiones',
            ].map((feat) => (
              <li key={feat} className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(201,150,26,0.15)',
                    border: '1px solid rgba(201,150,26,0.3)',
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C9961A' }} />
                </div>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {feat}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer of left panel */}
        <p className="relative z-10 text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          2025 TradeClimb — versión en curso - preview
        </p>
      </div>

      {/* ── Right panel — form ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-hidden">
        <GridPattern />

        <div className="relative z-10 w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-10 lg:hidden">
            <TradeClimbLogo size={40} className="text-[#C9961A] mb-4" />
            <span
              className="font-bold tracking-[0.16em] uppercase"
              style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.7)' }}
            >
              Investments Manager
            </span>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h2
              className="font-bold mb-1.5"
              style={{
                fontSize: '1.5rem',
                color: 'rgba(255,255,255,0.9)',
                letterSpacing: '-0.025em',
              }}
            >
              {t('login.title') || 'Bienvenido'}
            </h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {t('login.subtitle') || 'Accede a tu panel de inversiones'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username field */}
            <div className="space-y-1.5">
              <label
                htmlFor="userId"
                className="block text-xs font-medium"
                style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}
              >
                {t('login.username') || 'Usuario'}
              </label>
              <div className="relative">
                <User
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.2)' }}
                  strokeWidth={1.75}
                />
                <input
                  id="userId"
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder={t('login.usernamePlaceholder') || 'tu-usuario'}
                  autoComplete="username"
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.75rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    color: 'rgba(255,255,255,0.88)',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'all 0.18s ease',
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '1px solid rgba(201,150,26,0.5)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(201,150,26,0.1)';
                    e.target.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '1px solid rgba(255,255,255,0.08)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(255,255,255,0.04)';
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium"
                style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}
              >
                {t('login.password') || 'Contraseña'}
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.2)' }}
                  strokeWidth={1.75}
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder') || '••••••••'}
                  autoComplete="current-password"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.75rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    color: 'rgba(255,255,255,0.88)',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'all 0.18s ease',
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '1px solid rgba(201,150,26,0.5)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(201,150,26,0.1)';
                    e.target.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '1px solid rgba(255,255,255,0.08)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(255,255,255,0.04)';
                  }}
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                className="flex items-start gap-2.5 rounded-xl p-3.5 text-sm animate-slide-up"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#F87171',
                }}
              >
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !userId.trim() || !password}
              className="w-full flex items-center justify-center gap-2.5 font-semibold text-sm transition-all duration-200"
              style={{
                background:
                  loading || !userId.trim() || !password ? 'rgba(201,150,26,0.35)' : '#C9961A',
                color: '#0F0F0D',
                padding: '0.8125rem 1.5rem',
                borderRadius: '10px',
                cursor: loading || !userId.trim() || !password ? 'not-allowed' : 'pointer',
                boxShadow:
                  loading || !userId.trim() || !password
                    ? 'none'
                    : '0 2px 8px rgba(201,150,26,0.28)',
                letterSpacing: '-0.01em',
                marginTop: '0.5rem',
              }}
              onMouseEnter={(e) => {
                if (!loading && userId.trim() && password) {
                  e.currentTarget.style.background = '#B58717';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(201,150,26,0.4)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && userId.trim() && password) {
                  e.currentTarget.style.background = '#C9961A';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(201,150,26,0.28)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(15,15,13,0.2)', borderTopColor: '#0F0F0D' }}
                  />
                  <span>{t('common.loading') || 'Entrando…'}</span>
                </>
              ) : (
                <>
                  <span>{t('login.login') || 'Entrar'}</span>
                  <ArrowRight size={15} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
