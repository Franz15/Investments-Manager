import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  AlertCircle,
  Menu,
  X,
  User,
  LogOut,
  Building2,
  ShieldCheck,
  Briefcase,
  PiggyBank,
  BarChart3,
  BookOpen,
  Target,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { useUserColor } from '../hooks/useUserColor';
import { useTranslation } from '../contexts/TranslationContext';
import { useBusiness } from '../contexts/BusinessContext';
import ThemeToggle from './ThemeToggle';
import TradeClimbLogo from './Logo';
import packageJson from '../../package.json';

/* ── Sidebar always-dark design tokens ──────────────────────────── */
const S = {
  bg: '#0D0D10',
  border: 'rgba(255,255,255,0.055)',
  activeText: '#C9961A',
  activeBg: 'rgba(201,150,26,0.11)',
  activeBorder: 'rgba(201,150,26,0.22)',
  inactiveText: '#6E6E6A',
  hoverBg: 'rgba(255,255,255,0.045)',
  hoverText: '#D0D0CC',
  sectionText: '#333330',
  divider: 'rgba(255,255,255,0.05)',
};

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser, logout } = useUser();
  const { businesses, selectedBusiness, selectBusiness } = useBusiness();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    JSON.parse(localStorage.getItem('sidebarCollapsed') ?? 'false')
  );
  const [businessesExpanded, setBusinessesExpanded] = useState(() =>
    JSON.parse(localStorage.getItem('businessesExpanded') ?? 'false')
  );

  useUserColor(); // applies --user-color-* CSS vars (defaults to TradeClimb gold)

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('businessesExpanded', JSON.stringify(businessesExpanded));
  }, [businessesExpanded]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = currentUser?.role === 'admin' || currentUser?.id === 'javier';
  const hasPortfolioBuilderAccess =
    isAdmin || (currentUser?.permissions?.portfolioBuilder && currentUser?.id !== 'test-dca');

  /* ── Navigation groups ──────────────────────────────────────── */
  const coreItems = [
    { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('sidebar.accounts'), href: '/accounts', icon: Wallet },
    { name: t('sidebar.investments'), href: '/investments', icon: TrendingUp },
    { name: t('sidebar.debts'), href: '/debts', icon: AlertCircle },
    { name: t('sidebar.finances'), href: '/finances', icon: PiggyBank },
  ];

  const toolItems = [
    ...(hasPortfolioBuilderAccess
      ? [{ name: t('sidebar.portfolioBuilder'), href: '/portfolio-builder', icon: Building2 }]
      : []),
    { name: t('sidebar.budgets') || 'Presupuestos', href: '/budgets', icon: Target },
    { name: t('sidebar.forecasts') || 'Previsiones', href: '/forecasts', icon: BarChart3 },
    { name: t('sidebar.reports') || 'Informes', href: '/reports', icon: BookOpen },
    ...(isAdmin
      ? [{ name: t('sidebar.adminAccess') || 'Accesos', href: '/admin/access', icon: ShieldCheck }]
      : []),
    { name: currentUser?.name || t('sidebar.profile'), href: '/profile', icon: User },
  ];

  /* Bottom nav (mobile) — 5 most-used items */
  const bottomNavItems = [
    { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('sidebar.accounts'), href: '/accounts', icon: Wallet },
    { name: t('sidebar.investments'), href: '/investments', icon: TrendingUp },
    { name: t('sidebar.finances'), href: '/finances', icon: PiggyBank },
    { name: t('sidebar.debts'), href: '/debts', icon: AlertCircle },
  ];

  /* Current page label for mobile header */
  const allItems = [...coreItems, ...toolItems];
  const currentPage = allItems.find((item) =>
    item.href === '/'
      ? location.pathname === '/'
      : location.pathname === item.href || location.pathname.startsWith(item.href + '/')
  );

  /* ── Helpers ────────────────────────────────────────────────── */
  const isActive = (href) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  /* ── Sidebar nav link ───────────────────────────────────────── */
  const NavLink = ({ item, collapsed, onClick }) => {
    const Icon = item.icon;
    const active = isActive(item.href);

    return (
      <Link
        to={item.href}
        onClick={onClick}
        title={collapsed ? item.name : undefined}
        className="sidebar-link"
        style={{
          color: active ? S.activeText : S.inactiveText,
          background: active ? S.activeBg : 'transparent',
          boxShadow: active ? `inset 0 0 0 1px ${S.activeBorder}` : 'none',
          justifyContent: collapsed ? 'center' : undefined,
          paddingLeft: collapsed ? '0' : undefined,
          paddingRight: collapsed ? '0' : undefined,
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = S.hoverBg;
            e.currentTarget.style.color = S.hoverText;
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = S.inactiveText;
          }
        }}
      >
        <Icon
          strokeWidth={active ? 2.25 : 1.75}
          style={{ color: active ? S.activeText : 'inherit' }}
          className={`flex-shrink-0 transition-all duration-150 ${
            collapsed ? 'h-5 w-5' : 'mr-2.5 h-4 w-4'
          }`}
        />
        <span
          className="flex-1 overflow-hidden whitespace-nowrap transition-all duration-200"
          style={{
            maxWidth: collapsed ? 0 : '160px',
            opacity: collapsed ? 0 : 1,
            transform: collapsed ? 'translateX(4px)' : 'translateX(0)',
          }}
        >
          {item.name}
        </span>
        {active && !collapsed && (
          <div
            className="w-1 h-1 rounded-full flex-shrink-0 ml-1"
            style={{ background: S.activeText }}
          />
        )}
      </Link>
    );
  };

  /* ── Sidebar internals ──────────────────────────────────────── */
  const SidebarBody = ({ collapsed, onClose }) => (
    <>
      <nav
        className="flex-1 overflow-y-auto py-3"
        style={{ padding: collapsed ? '12px 8px' : '12px' }}
      >
        {/* Core section */}
        {!collapsed && (
          <p className="section-title px-2 mb-1.5" style={{ color: S.sectionText }}>
            {t('sidebar.investmentsSection') || 'Principal'}
          </p>
        )}
        <div className="space-y-0.5">
          {coreItems.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onClick={onClose} />
          ))}
        </div>

        <div className="my-3 mx-1" style={{ borderTop: `1px solid ${S.divider}` }} />

        {/* Businesses dropdown */}
        {!collapsed ? (
          <>
            <button
              onClick={() => {
                setBusinessesExpanded((v) => !v);
                if (!businessesExpanded) navigate('/businesses');
              }}
              className="sidebar-link w-full text-left"
              style={{
                color: isActive('/businesses') || selectedBusiness ? S.activeText : S.inactiveText,
                background:
                  isActive('/businesses') || selectedBusiness ? S.activeBg : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive('/businesses') && !selectedBusiness) {
                  e.currentTarget.style.background = S.hoverBg;
                  e.currentTarget.style.color = S.hoverText;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive('/businesses') && !selectedBusiness) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = S.inactiveText;
                }
              }}
            >
              <Briefcase
                className="mr-2.5 h-4 w-4 flex-shrink-0"
                strokeWidth={1.75}
                style={{ color: 'inherit' }}
              />
              <span className="flex-1 text-[0.8125rem]">{t('sidebar.businesses')}</span>
              {businessesExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
              )}
            </button>

            {businessesExpanded && (
              <div
                className="ml-3 mt-0.5 pl-3 space-y-0.5"
                style={{ borderLeft: `1px solid ${S.divider}` }}
              >
                <BusinessBtn
                  label={t('businesses.personal') || 'Personal'}
                  icon={<User className="h-3 w-3 flex-shrink-0" />}
                  active={selectedBusiness === 'personal' || !selectedBusiness}
                  onClick={() => {
                    selectBusiness('personal');
                    navigate('/businesses');
                    onClose?.();
                  }}
                />
                {businesses
                  .filter((b) => b.isActive)
                  .map((b) => (
                    <BusinessBtn
                      key={b._id}
                      label={b.name}
                      icon={
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: b.color }}
                        />
                      }
                      active={selectedBusiness === b._id}
                      color={b.color}
                      onClick={() => {
                        selectBusiness(b._id);
                        navigate('/businesses');
                        onClose?.();
                      }}
                    />
                  ))}
              </div>
            )}
          </>
        ) : (
          <NavLink
            item={{ name: t('sidebar.businesses'), href: '/businesses', icon: Briefcase }}
            collapsed
            onClick={onClose}
          />
        )}

        <div className="my-3 mx-1" style={{ borderTop: `1px solid ${S.divider}` }} />

        {/* Tools section */}
        {!collapsed && (
          <p className="section-title px-2 mb-1.5" style={{ color: S.sectionText }}>
            {t('sidebar.tools') || 'Herramientas'}
          </p>
        )}
        <div className="space-y-0.5">
          {toolItems.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onClick={onClose} />
          ))}
        </div>
      </nav>

      {/* Logout */}
      {currentUser && (
        <div className="p-3" style={{ borderTop: `1px solid ${S.divider}` }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center rounded-lg transition-all duration-150 group"
            style={{
              padding: collapsed ? '8px' : '8px 12px',
              color: S.inactiveText,
              justifyContent: collapsed ? 'center' : undefined,
            }}
            title={collapsed ? t('sidebar.logout') : undefined}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
              e.currentTarget.style.color = '#EF4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = S.inactiveText;
            }}
          >
            <LogOut
              className={`flex-shrink-0 ${collapsed ? 'h-4.5 w-4.5' : 'h-4 w-4'}`}
              strokeWidth={1.75}
            />
            {!collapsed && (
              <span className="ml-2.5 text-sm font-medium">{t('sidebar.logout')}</span>
            )}
          </button>
        </div>
      )}
    </>
  );

  /* ── Business dropdown button ───────────────────────────────── */
  const BusinessBtn = ({ label, icon, active, color, onClick }) => (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 rounded-lg text-[0.8125rem] transition-all duration-150 flex items-center gap-2"
      style={{
        color: active ? color || S.activeText : S.inactiveText,
        background: active ? `${color || '#C9961A'}1A` : 'transparent',
        fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = S.hoverBg;
          e.currentTarget.style.color = S.hoverText;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = S.inactiveText;
        }
      }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );

  /* ════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen" style={{ background: 'var(--tc-bg)' }}>
      {/* ── Mobile sidebar overlay ──────────────────────────────── */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 flex w-64 flex-col transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ background: S.bg, borderRight: `1px solid ${S.border}` }}
        >
          {/* Mobile sidebar header */}
          <div
            className="flex h-14 items-center justify-between px-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${S.border}` }}
          >
            <TradeClimbLogo
              size={26}
              withText
              textSize="text-[0.8125rem]"
              className="text-white"
              textClassName="text-white/90"
            />
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: S.inactiveText }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = S.hoverBg;
                e.currentTarget.style.color = S.hoverText;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = S.inactiveText;
              }}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
          <SidebarBody collapsed={false} onClose={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* ── Desktop sidebar (always dark) ───────────────────────── */}
      <div
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          sidebarCollapsed ? 'lg:w-[64px]' : 'lg:w-56'
        }`}
        style={{ background: S.bg, borderRight: `1px solid ${S.border}`, zIndex: 30 }}
      >
        {/* Desktop sidebar header */}
        <div
          className={`flex h-14 items-center flex-shrink-0 transition-all duration-200 ${
            sidebarCollapsed ? 'justify-center px-2' : 'px-4 gap-3'
          }`}
          style={{ borderBottom: `1px solid ${S.border}` }}
        >
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex-shrink-0 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: '#C9961A', width: 32, height: 32 }}
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(201,150,26,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <TradeClimbLogo size={20} />
          </button>

          <span
            className="font-bold tracking-[0.12em] uppercase transition-all duration-200 overflow-hidden whitespace-nowrap"
            style={{
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.88)',
              maxWidth: sidebarCollapsed ? 0 : '160px',
              opacity: sidebarCollapsed ? 0 : 1,
            }}
          >
            TradeClimb
          </span>

          <div
            className="ml-auto transition-all duration-200 overflow-hidden"
            style={{ maxWidth: sidebarCollapsed ? 0 : '40px', opacity: sidebarCollapsed ? 0 : 1 }}
          >
            <ThemeToggle />
          </div>
        </div>

        <SidebarBody collapsed={sidebarCollapsed} onClose={undefined} />

        {/* Version badge */}
        {!sidebarCollapsed && (
          <div
            className="px-4 py-2.5 flex-shrink-0"
            style={{ borderTop: `1px solid ${S.divider}` }}
          >
            <p className="text-[10px]" style={{ color: '#2E2E2C' }}>
              v{packageJson.version} · {t('sidebar.developmentVersion') || 'dev'}
            </p>
          </div>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div
        className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          sidebarCollapsed ? 'lg:pl-[64px]' : 'lg:pl-56'
        }`}
      >
        {/* Mobile top header */}
        <div
          className="sticky top-0 z-30 flex h-14 items-center gap-3 px-4 lg:hidden"
          style={{
            background: 'rgba(var(--tc-surface-rgb, 255,255,255), 0.85)',
            backdropFilter: 'blur(20px) saturate(160%)',
            borderBottom: '1px solid var(--tc-border)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="-ml-1 p-2 rounded-lg transition-colors"
            style={{ color: 'var(--tc-text-2)' }}
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <div className="flex-1 flex items-center justify-between">
            <span
              className="font-semibold tracking-tight"
              style={{ fontSize: '0.9375rem', color: 'var(--tc-text-1)' }}
            >
              {currentPage?.name || 'TradeClimb'}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 pb-28 lg:p-6 lg:pb-8">{children}</main>
      </div>

      {/* ── Mobile bottom navigation ─────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
        {/* Light mode */}
        <div
          className="dark:hidden flex items-center px-2"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(24px) saturate(160%)',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
            paddingTop: '4px',
          }}
        >
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className="bottom-nav-item"
                style={{ color: active ? 'var(--tc-gold)' : '#8A8A84' }}
              >
                <Icon
                  className={`transition-all duration-150 ${active ? 'scale-110' : ''}`}
                  size={20}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span className="text-[10px] font-medium" style={{ opacity: active ? 1 : 0.6 }}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Dark mode */}
        <div
          className="hidden dark:flex items-center px-2"
          style={{
            background: 'rgba(13,13,16,0.95)',
            backdropFilter: 'blur(24px) saturate(160%)',
            borderTop: `1px solid ${S.border}`,
            paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
            paddingTop: '4px',
          }}
        >
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className="bottom-nav-item"
                style={{ color: active ? '#C9961A' : '#4E4E4A' }}
              >
                <Icon
                  className={`transition-all duration-150 ${active ? 'scale-110' : ''}`}
                  size={20}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span className="text-[10px] font-medium" style={{ opacity: active ? 1 : 0.5 }}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
