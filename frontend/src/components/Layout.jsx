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
  Briefcase,
  PiggyBank,
  ShieldCheck,
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

/* ── Sidebar design tokens — resolved via CSS vars at runtime ────
   Active states use the user's profile color (--user-color-*).
   Light/dark surfaces use --sidebar-* vars defined in index.css.
   ────────────────────────────────────────────────────────────── */
const S = {
  bg: 'var(--sidebar-bg)',
  border: 'var(--sidebar-border)',
  /* Active = user profile color */
  activeText: 'var(--user-color-600)',
  activeBg: 'rgba(var(--user-color-600-rgb, 201,150,26), 0.09)',
  activeBorder: 'rgba(var(--user-color-600-rgb, 201,150,26), 0.2)',
  /* Rest */
  inactiveText: 'var(--sidebar-inactive)',
  hoverBg: 'var(--sidebar-hover-bg)',
  hoverText: 'var(--sidebar-hover-text)',
  sectionText: 'var(--sidebar-section-text)',
  divider: 'var(--sidebar-divider)',
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

  useUserColor(); // applies --user-color-* CSS vars

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
  const hasFinancesAccess = isAdmin || (currentUser?.permissions?.canAccessFinances ?? true);
  const hasBusinessesAccess = isAdmin || (currentUser?.permissions?.canAccessBusinesses ?? true);

  /* ── Navigation groups — original structure ─────────────────── */
  const investmentsSection = [
    { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('sidebar.accounts'), href: '/accounts', icon: Wallet },
    { name: t('sidebar.investments'), href: '/investments', icon: TrendingUp },
    { name: t('sidebar.debts'), href: '/debts', icon: AlertCircle },
  ];

  /* Flat list for current-page detection */
  const allSectionItems = [
    ...investmentsSection,
    ...(hasFinancesAccess
      ? [{ name: t('sidebar.finances'), href: '/finances', icon: PiggyBank }]
      : []),
    ...(hasBusinessesAccess
      ? [{ name: t('sidebar.businesses'), href: '/businesses', icon: Briefcase }]
      : []),
    ...(isAdmin
      ? [
          {
            name: t('sidebar.adminAccess') || 'Gestión de accesos',
            href: '/admin/access',
            icon: ShieldCheck,
          },
        ]
      : []),
    { name: currentUser?.name || t('sidebar.profile'), href: '/profile', icon: User },
  ];

  /* Bottom nav (mobile) — 5 primary routes */
  const bottomNavItems = [
    { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('sidebar.accounts'), href: '/accounts', icon: Wallet },
    { name: t('sidebar.investments'), href: '/investments', icon: TrendingUp },
    ...(hasFinancesAccess
      ? [{ name: t('sidebar.finances'), href: '/finances', icon: PiggyBank }]
      : []),
    { name: t('sidebar.debts'), href: '/debts', icon: AlertCircle },
  ];

  /* Current page label for mobile header */
  const currentPage = allSectionItems.find((item) =>
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
      <nav className="flex-1 overflow-y-auto" style={{ padding: collapsed ? '12px 8px' : '12px' }}>
        {/* ---- Inversiones ---- */}
        {!collapsed && (
          <p className="section-title px-2 mb-1.5">{t('sidebar.investmentsSection')}</p>
        )}
        <div className="space-y-0.5">
          {investmentsSection.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onClick={onClose} />
          ))}
        </div>

        {/* ---- Finanzas ---- (Finanzas + Negocios) */}
        {(hasFinancesAccess || hasBusinessesAccess) && (
          <>
            <div className="my-3 mx-1" style={{ borderTop: `1px solid ${S.divider}` }} />
            {!collapsed && (
              <p className="section-title px-2 mb-1.5">{t('sidebar.financesSection')}</p>
            )}
            <div className="space-y-0.5">
              {/* Finanzas link */}
              {hasFinancesAccess && (
                <NavLink
                  item={{ name: t('sidebar.finances'), href: '/finances', icon: PiggyBank }}
                  collapsed={collapsed}
                  onClick={onClose}
                />
              )}

              {/* Negocios dropdown */}
              {hasBusinessesAccess && (
                <>
                  {!collapsed ? (
                    <>
                      <button
                        onClick={() => {
                          setBusinessesExpanded((v) => !v);
                          if (!businessesExpanded) navigate('/businesses');
                        }}
                        className="sidebar-link w-full text-left"
                        style={{
                          color:
                            isActive('/businesses') || selectedBusiness
                              ? S.activeText
                              : S.inactiveText,
                          background:
                            isActive('/businesses') || selectedBusiness
                              ? S.activeBg
                              : 'transparent',
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
                          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
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
                </>
              )}
            </div>
          </>
        )}

        {/* Gestión de accesos — solo admin */}
        {isAdmin && (
          <>
            <div className="my-3 mx-1" style={{ borderTop: `1px solid ${S.divider}` }} />
            <div className="space-y-0.5">
              <NavLink
                item={{
                  name: t('sidebar.adminAccess') || 'Gestión de accesos',
                  href: '/admin/access',
                  icon: ShieldCheck,
                }}
                collapsed={collapsed}
                onClick={onClose}
              />
            </div>
          </>
        )}

        {/* Usuario — siempre el último */}
        <div className="my-3 mx-1" style={{ borderTop: `1px solid ${S.divider}` }} />
        <div className="space-y-0.5">
          <NavLink
            item={{ name: currentUser?.name || t('sidebar.profile'), href: '/profile', icon: User }}
            collapsed={collapsed}
            onClick={onClose}
          />
        </div>
      </nav>

      {/* Logout */}
      {currentUser && (
        <div className="p-3" style={{ borderTop: `1px solid ${S.divider}` }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center rounded-lg transition-all duration-150"
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
        background: active
          ? `${color || 'rgba(var(--user-color-600-rgb, 201,150,26), 0.09)'}`
          : 'transparent',
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
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
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
            <div className="flex items-center gap-2.5">
              <TradeClimbLogo
                size={22}
                style={{ color: S.activeText }}
                className="text-[color:var(--user-color-600)]"
              />
              <span
                className="font-semibold tracking-tight text-[0.875rem]"
                style={{ color: 'var(--tc-text-1)' }}
              >
                {t('sidebar.appName')}
              </span>
            </div>
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

      {/* ── Desktop sidebar — theme-aware ───────────────────────── */}
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
          {/* Logo button — uses profile accent color */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex-shrink-0 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--user-color-600)', width: 32, height: 32 }}
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(var(--user-color-600-rgb, 201,150,26), 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <TradeClimbLogo size={20} />
          </button>

          {/* App name */}
          <span
            className="font-semibold tracking-tight transition-all duration-200 overflow-hidden whitespace-nowrap"
            style={{
              fontSize: '0.875rem',
              color: 'var(--tc-text-1)',
              maxWidth: sidebarCollapsed ? 0 : '160px',
              opacity: sidebarCollapsed ? 0 : 1,
            }}
          >
            {t('sidebar.appName')}
          </span>

          <div
            className="ml-auto transition-all duration-200 overflow-hidden"
            style={{ maxWidth: sidebarCollapsed ? 0 : '40px', opacity: sidebarCollapsed ? 0 : 1 }}
          >
            <ThemeToggle />
          </div>
        </div>

        <SidebarBody collapsed={sidebarCollapsed} onClose={undefined} />

        {/* Version badge — profile accent color */}
        {!sidebarCollapsed && (
          <div
            className="px-4 py-2.5 flex-shrink-0"
            style={{ borderTop: `1px solid ${S.divider}` }}
          >
            <p
              className="text-[10px] font-medium"
              style={{ color: 'var(--user-color-600)', opacity: 0.6 }}
            >
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
            background: 'var(--tc-surface)',
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
              {currentPage?.name || t('sidebar.appName')}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 pb-28 lg:p-6 lg:pb-8">{children}</main>
      </div>

      {/* ── Mobile bottom navigation ─────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden flex items-center px-2"
        style={{
          background: 'var(--tc-surface)',
          borderTop: '1px solid var(--tc-border)',
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
              style={{ color: active ? 'var(--user-color-600)' : 'var(--tc-text-3)' }}
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
      </nav>
    </div>
  );
};

export default Layout;
