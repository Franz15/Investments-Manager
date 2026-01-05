import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, ArrowLeftRight, TrendingUp, AlertCircle, Menu, X, User, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { useUserColor } from '../hooks/useUserColor';
import { useTranslation } from '../contexts/TranslationContext';
import ThemeToggle from './ThemeToggle';

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
  useUserColor(); // Aplicar color del usuario como variables CSS

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navigation = [
    { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('sidebar.accounts'), href: '/accounts', icon: Wallet },
    { name: t('sidebar.transactions'), href: '/transactions', icon: ArrowLeftRight },
    { name: t('sidebar.investments'), href: '/investments', icon: TrendingUp },
    { name: t('sidebar.debts'), href: '/debts', icon: AlertCircle },
    { name: currentUser?.name || t('sidebar.profile'), href: '/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#1d1d1f]">
      {/* Sidebar móvil */}
      <div className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={() => setSidebarOpen(false)} 
        />
        <div className={`fixed inset-y-0 left-0 flex w-72 flex-col bg-white/70 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl border-r border-gray-200/30 dark:border-[#404040]/30 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backdropFilter: 'blur(20px) saturate(180%)' }}>
          <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200 dark:border-[#404040]">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--user-color-600)' }}>
                <Wallet className="h-4 w-4 text-white" strokeWidth={2} />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                {t('sidebar.appName')}
              </h1>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)} 
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-[#404040] text-gray-500 dark:text-gray-400 transition-colors"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <nav className="flex-1 space-y-2 px-4 py-6 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`sidebar-link group ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
                >
                  <Icon 
                    className={`mr-3 h-4 w-4 transition-colors ${isActive ? '' : 'text-gray-500 dark:text-gray-400'}`} 
                    style={isActive ? { color: 'var(--user-color-600)' } : {}}
                    strokeWidth={2} 
                  />
                  <span className="flex-1">{item.name}</span>
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--user-color-600)' }}></div>
                  )}
                </Link>
              );
            })}
          </nav>
          {currentUser && (
            <div className="p-4 border-t border-gray-200 dark:border-[#404040]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-[#404040] transition-colors text-left opacity-70 hover:opacity-100"
              >
                <LogOut className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('sidebar.logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar desktop */}
      <div className={`hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <div className="flex flex-col flex-grow bg-white/70 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl border-r border-gray-200/30 dark:border-[#404040]/30" style={{ backdropFilter: 'blur(20px) saturate(180%)' }}>
          <div className={`flex h-16 items-center justify-between border-b border-gray-200/50 dark:border-[#404040]/50 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'px-2' : 'px-6'}`}>
            <div className={`flex items-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'w-full justify-center gap-0' : 'flex-1 gap-3'}`}>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`rounded flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer flex-shrink-0 ${sidebarCollapsed ? 'w-7 h-7' : 'w-10 h-10'}`}
                style={{ 
                  backgroundColor: 'var(--user-color-600)',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--user-color-700)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--user-color-600)'}
                aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
              >
                <Wallet className={`text-white transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'h-4 w-4' : 'h-6 w-6'}`} strokeWidth={2} />
              </button>
              <h1 className={`text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? 'max-w-0 opacity-0 scale-95' : 'max-w-[200px] opacity-100 scale-100'}`}>
                {t('sidebar.appName')}
              </h1>
            </div>
            <div className={`flex items-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'max-w-0 opacity-0 scale-95 overflow-hidden' : 'max-w-[50px] opacity-100 scale-100'}`}>
              <ThemeToggle />
            </div>
          </div>
          <nav className={`flex-1 space-y-2 overflow-y-auto transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'px-2 py-6' : 'px-4 py-6'}`}>
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`sidebar-link group ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'} transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                  title={sidebarCollapsed ? item.name : ''}
                >
                  <Icon 
                    className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${!isActive ? 'text-gray-500 dark:text-gray-400' : ''} ${sidebarCollapsed ? 'h-5 w-5 mx-0' : 'mr-3 h-4 w-4'}`}
                    style={isActive ? { color: 'var(--user-color-600)' } : {}}
                    strokeWidth={2} 
                  />
                  <span className={`flex-1 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? 'max-w-0 opacity-0 translate-x-2' : 'max-w-[150px] opacity-100 translate-x-0'}`}>
                    {item.name}
                  </span>
                  <div 
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${isActive && !sidebarCollapsed ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}
                    style={{ backgroundColor: 'var(--user-color-600)' }}
                  ></div>
                </Link>
              );
            })}
          </nav>
          {currentUser && (
            <div className={`p-4 border-t border-gray-200/50 dark:border-[#404040]/50 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'px-2' : ''}`}>
              <button
                onClick={handleLogout}
                className={`w-full flex items-center rounded hover:bg-gray-100/50 dark:hover:bg-[#404040]/50 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] opacity-70 hover:opacity-100 ${sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'} text-gray-500 dark:text-gray-400`}
                title={sidebarCollapsed ? t('sidebar.logout') : ''}
              >
                <LogOut 
                  className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex-shrink-0 ${sidebarCollapsed ? 'h-5 w-5 mx-0' : 'mr-3 h-6 w-6'}`} 
                  strokeWidth={2} 
                />
                <span className={`flex-1 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap ${sidebarCollapsed ? 'max-w-0 opacity-0 translate-x-2' : 'max-w-[150px] opacity-100 translate-x-0 text-xs'}`}>
                  {t('sidebar.logout')}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <div className={`transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Header móvil */}
        <div className="sticky top-0 z-30 flex h-16 bg-white/70 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl border-b border-gray-200/30 dark:border-[#404040]/30 lg:hidden" style={{ backdropFilter: 'blur(20px) saturate(180%)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="px-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center justify-between flex-1 px-4">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('sidebar.appName')}</h1>
            <ThemeToggle />
          </div>
        </div>

        {/* Contenido */}
        <main className="p-8 pb-20 mb-2">
          {children}
        </main>

        {/* Footer */}
        <footer className={`fixed bottom-0 right-0 z-40 border-t border-gray-200/30 dark:border-[#404040]/30 bg-white/50 dark:bg-[#2c2c2e]/70 backdrop-blur-2xl transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? 'lg:left-20' : 'lg:left-64'} left-0`} style={{ backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}>
          <div className="px-4 py-3">
            <div className="flex items-center justify-end max-w-7xl mx-auto">
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-600 dark:text-gray-400">{t('sidebar.appName')}</span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-[#525252]"></span>
                <span className="font-mono font-medium text-gray-600 dark:text-gray-400">v0.0.0</span>
                <span className="w-1 h-1 rounded-full bg-amber-500 dark:bg-amber-600"></span>
                <span className="font-normal">{t('sidebar.developmentVersion')}</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;

