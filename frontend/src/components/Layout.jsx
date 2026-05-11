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
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useUserColor } from '../hooks/useUserColor';
import { useTranslation } from '../contexts/TranslationContext';
import { useBusiness } from '../contexts/BusinessContext';
import ThemeToggle from './ThemeToggle';
import packageJson from '../../package.json';

const Layout = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const { currentUser, logout } = useUser();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { businesses, selectedBusiness, selectBusiness } = useBusiness();
  const [businessesExpanded, setBusinessesExpanded] = useState(() => {
    const saved = localStorage.getItem('businessesExpanded');
    return saved ? JSON.parse(saved) : false;
  });
  useUserColor();

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('businessesExpanded', JSON.stringify(businessesExpanded));
  }, [businessesExpanded]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
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

  const investmentsSection = [
    { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('sidebar.accounts'), href: '/accounts', icon: Wallet },
    { name: t('sidebar.investments'), href: '/investments', icon: TrendingUp },
    { name: t('sidebar.debts'), href: '/debts', icon: AlertCircle },
  ];

  const financesSection = [{ name: t('sidebar.finances'), href: '/finances', icon: PiggyBank }];

  const extraSection = [
    ...(hasPortfolioBuilderAccess
      ? [{ name: t('sidebar.portfolioBuilder'), href: '/portfolio-builder', icon: Building2 }]
      : []),
    { name: t('sidebar.budgets') || 'Presupuestos', href: '/budgets', icon: Target },
    { name: t('sidebar.forecasts') || 'Previsiones', href: '/forecasts', icon: BarChart3 },
    { name: t('sidebar.reports') || 'Informes', href: '/reports', icon: BookOpen },
    ...(isAdmin
      ? [
          {
            name: t('sidebar.adminAccess') || 'Gestión accesos',
            href: '/admin/access',
            icon: ShieldCheck,
          },
        ]
      : []),
    {
      name: currentUser?.name || t('sidebar.profile'),
      href: '/profile',
      icon: User,
    },
  ];

  // Items shown in mobile bottom navigation
  const bottomNavItems = [
    { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('sidebar.accounts'), href: '/accounts', icon: Wallet },
    { name: t('sidebar.investments'), href: '/investments', icon: TrendingUp },
    { name: t('sidebar.finances'), href: '/finances', icon: PiggyBank },
    { name: t('sidebar.debts'), href: '/debts', icon: AlertCircle },
  ];

  // Current page name for mobile header
  const allNavItems = [...investmentsSection, ...financesSection, ...extraSection];
  const currentPage = allNavItems.find(
    (item) =>
      item.href === location.pathname ||
      (item.href !== '/' && location.pathname.startsWith(item.href))
  );

  const SidebarNavLink = ({ item, collapsed, onClick }) => {
    const Icon = item.icon;
    const isActive =
      item.href === '/'
        ? location.pathname === '/'
        : location.pathname === item.href || location.pathname.startsWith(item.href + '/');

    return (
      <Link
        to={item.href}
        onClick={onClick}
        className={`sidebar-link group ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'} ${collapsed ? 'justify-center px-0' : ''}`}
        title={collapsed ? item.name : ''}
      >
        <Icon
          className={`transition-all duration-200 flex-shrink-0 ${
            !isActive ? 'text-gray-400 dark:text-gray-500' : ''
          } ${collapsed ? 'h-5 w-5' : 'mr-3 h-4 w-4'}`}
          style={isActive ? { color: 'var(--user-color-600)' } : {}}
          strokeWidth={2}
        />
        <span
          className={`flex-1 transition-all duration-200 overflow-hidden whitespace-nowrap ${
            collapsed
              ? 'max-w-0 opacity-0 translate-x-2'
              : 'max-w-[150px] opacity-100 translate-x-0'
          }`}
        >
          {item.name}
        </span>
        {isActive && !collapsed && (
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'var(--user-color-600)' }}
          />
        )}
      </Link>
    );
  };

  const SidebarContent = ({ collapsed = false, onClose }) => (
    <>
      <nav
        className={`flex-1 overflow-y-auto transition-all duration-200 ${
          collapsed ? 'px-2 py-4' : 'px-3 py-4'
        }`}
      >
        {/* Investments section */}
        {!collapsed && <p className="section-title px-2 mb-2">{t('sidebar.investmentsSection')}</p>}
        <div className="space-y-0.5">
          {investmentsSection.map((item) => (
            <SidebarNavLink key={item.href} item={item} collapsed={collapsed} onClick={onClose} />
          ))}
        </div>

        <div
          className={`my-3 border-t border-gray-100 dark:border-white/5 ${collapsed ? 'mx-2' : 'mx-1'}`}
        />

        {/* Finances section */}
        {!collapsed && <p className="section-title px-2 mb-2">{t('sidebar.financesSection')}</p>}
        <div className="space-y-0.5">
          {financesSection.map((item) => (
            <SidebarNavLink key={item.href} item={item} collapsed={collapsed} onClick={onClose} />
          ))}
        </div>

        {/* Businesses dropdown */}
        <div
          className={`my-3 border-t border-gray-100 dark:border-white/5 ${collapsed ? 'mx-2' : 'mx-1'}`}
        />

        {!collapsed ? (
          <div>
            <button
              onClick={() => {
                setBusinessesExpanded(!businessesExpanded);
                if (!businessesExpanded) navigate('/businesses');
              }}
              className={`sidebar-link group w-full text-left ${
                location.pathname === '/businesses' ||
                (selectedBusiness !== null && selectedBusiness !== undefined)
                  ? 'sidebar-link-active'
                  : 'sidebar-link-inactive'
              }`}
            >
              <Briefcase
                className={`mr-3 h-4 w-4 flex-shrink-0 ${
                  location.pathname === '/businesses' ||
                  (selectedBusiness !== null && selectedBusiness !== undefined)
                    ? ''
                    : 'text-gray-400 dark:text-gray-500'
                }`}
                style={
                  location.pathname === '/businesses' ||
                  (selectedBusiness !== null && selectedBusiness !== undefined)
                    ? { color: 'var(--user-color-600)' }
                    : {}
                }
                strokeWidth={2}
              />
              <span className="flex-1 text-sm">{t('sidebar.businesses')}</span>
              {businessesExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              )}
            </button>
            {businessesExpanded && (
              <div className="ml-3 mt-0.5 space-y-0.5 pl-3 border-l border-gray-100 dark:border-white/8">
                <button
                  onClick={() => {
                    selectBusiness('personal');
                    navigate('/businesses');
                    onClose?.();
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 flex items-center gap-2 ${
                    selectedBusiness === 'personal'
                      ? 'font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                  style={selectedBusiness === 'personal' ? { color: 'var(--user-color-600)' } : {}}
                >
                  <User className="h-3 w-3 flex-shrink-0" />
                  {t('businesses.personal')}
                </button>
                {businesses
                  .filter((b) => b.isActive)
                  .map((business) => (
                    <button
                      key={business._id}
                      onClick={() => {
                        selectBusiness(business._id);
                        navigate('/businesses');
                        onClose?.();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 flex items-center gap-2 ${
                        selectedBusiness === business._id
                          ? 'font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                      style={selectedBusiness === business._id ? { color: business.color } : {}}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: business.color }}
                      />
                      {business.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <Link
            to="/businesses"
            className="sidebar-link group sidebar-link-inactive justify-center px-0"
            title={t('sidebar.businesses')}
          >
            <Briefcase className="h-5 w-5 text-gray-400 dark:text-gray-500" strokeWidth={2} />
          </Link>
        )}

        {/* Extra section */}
        {!collapsed && (
          <>
            <div className="my-3 mx-1 border-t border-gray-100 dark:border-white/5" />
            <p className="section-title px-2 mb-2">{t('sidebar.tools') || 'Herramientas'}</p>
          </>
        )}
        {collapsed && <div className="my-3 mx-2 border-t border-gray-100 dark:border-white/5" />}
        <div className="space-y-0.5">
          {extraSection.map((item) => (
            <SidebarNavLink key={item.href} item={item} collapsed={collapsed} onClick={onClose} />
          ))}
        </div>
      </nav>

      {/* Logout */}
      {currentUser && (
        <div
          className={`p-3 border-t border-gray-100 dark:border-white/5 ${collapsed ? 'px-2' : ''}`}
        >
          <button
            onClick={handleLogout}
            className={`w-full flex items-center rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 text-gray-400 dark:text-gray-500 group ${
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            }`}
            title={collapsed ? t('sidebar.logout') : ''}
          >
            <LogOut
              className={`flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${collapsed ? 'h-4.5 w-4.5' : 'h-4 w-4'}`}
              strokeWidth={2}
            />
            {!collapsed && <span className="text-sm font-medium">{t('sidebar.logout')}</span>}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f0f10]">
      {/* Mobile sidebar overlay */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className={`fixed inset-y-0 left-0 flex w-72 flex-col bg-white/90 dark:bg-[#1c1c1e]/95 border-r border-gray-200/40 dark:border-white/8 transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ backdropFilter: 'blur(24px) saturate(180%)' }}
        >
          <div className="flex h-14 items-center justify-between px-4 border-b border-gray-200/40 dark:border-white/8">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
                style={{ backgroundColor: 'var(--user-color-600)' }}
              >
                <Wallet className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                {t('sidebar.appName')}
              </h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/8 text-gray-400 dark:text-gray-500 transition-colors"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
          <SidebarContent onClose={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div
        className={`hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-60'
        }`}
      >
        <div
          className="flex flex-col flex-grow bg-white/80 dark:bg-[#1c1c1e]/90 border-r border-gray-200/40 dark:border-white/8"
          style={{ backdropFilter: 'blur(20px) saturate(180%)' }}
        >
          {/* Logo header */}
          <div
            className={`flex h-14 items-center border-b border-gray-200/40 dark:border-white/8 transition-all duration-200 ${
              sidebarCollapsed ? 'px-2 justify-center' : 'px-4 justify-between'
            }`}
          >
            <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-2.5 flex-1'}`}>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer flex-shrink-0 w-8 h-8 shadow-sm"
                style={{ backgroundColor: 'var(--user-color-600)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--user-color-700)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--user-color-600)')
                }
                aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
              >
                <Wallet className="h-4 w-4 text-white" strokeWidth={2.5} />
              </button>
              <h1
                className={`text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight transition-all duration-200 overflow-hidden whitespace-nowrap ${
                  sidebarCollapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
                }`}
              >
                {t('sidebar.appName')}
              </h1>
            </div>
            <div
              className={`transition-all duration-200 ${
                sidebarCollapsed ? 'max-w-0 opacity-0 overflow-hidden' : 'max-w-[40px] opacity-100'
              }`}
            >
              <ThemeToggle />
            </div>
          </div>

          <SidebarContent collapsed={sidebarCollapsed} />
        </div>
      </div>

      {/* Main content area */}
      <div
        className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          sidebarCollapsed ? 'lg:pl-[68px]' : 'lg:pl-60'
        }`}
      >
        {/* Mobile header */}
        <div
          className="sticky top-0 z-30 flex h-14 items-center bg-white/80 dark:bg-[#1c1c1e]/90 backdrop-blur-xl border-b border-gray-200/40 dark:border-white/8 lg:hidden px-4 gap-3"
          style={{ backdropFilter: 'blur(20px) saturate(180%)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/8 rounded-lg transition-colors"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
          <div className="flex-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
              {currentPage?.name || t('sidebar.appName')}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 pb-28 lg:p-6 lg:pb-8 min-h-[calc(100vh-3.5rem)]">{children}</main>

        {/* Desktop footer */}
        <footer
          className={`hidden lg:flex fixed bottom-0 right-0 z-20 border-t border-gray-200/30 dark:border-white/5 bg-white/60 dark:bg-[#1c1c1e]/80 backdrop-blur-xl transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            sidebarCollapsed ? 'lg:left-[68px]' : 'lg:left-60'
          }`}
          style={{ backdropFilter: 'blur(20px) saturate(180%)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 ml-auto mr-0">
            <span className="font-medium">{t('sidebar.appName')}</span>
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="font-mono">v{packageJson.version}</span>
            <span className="w-1 h-1 rounded-full bg-amber-400" />
            <span>{t('sidebar.developmentVersion')}</span>
          </div>
        </footer>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 -1px 0 rgba(0,0,0,0.04), 0 -8px 24px rgba(0,0,0,0.04)',
        }}
      >
        <div
          className="dark:hidden flex items-center px-2 pb-safe"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        >
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`bottom-nav-item ${isActive ? 'bottom-nav-item-active' : ''}`}
              >
                <Icon
                  className={`h-5 w-5 transition-all duration-150 ${isActive ? 'scale-110' : ''}`}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                <span
                  className={`text-[10px] font-medium transition-all duration-150 ${
                    isActive ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
        {/* Dark mode version */}
        <div
          className="hidden dark:flex items-center px-2"
          style={{
            background: 'rgba(28,28,30,0.94)',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
          }}
        >
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`bottom-nav-item ${isActive ? 'bottom-nav-item-active' : ''}`}
              >
                <Icon
                  className={`h-5 w-5 transition-all duration-150 ${isActive ? 'scale-110' : ''}`}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                <span
                  className={`text-[10px] font-medium transition-all duration-150 ${
                    isActive ? 'opacity-100' : 'opacity-50'
                  }`}
                >
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
