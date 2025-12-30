import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, ArrowLeftRight, TrendingUp, AlertCircle, Menu, X, User } from 'lucide-react';
import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import ThemeToggle from './ThemeToggle';

const Layout = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser } = useUser();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Cuentas', href: '/accounts', icon: Wallet },
    { name: 'Transacciones', href: '/transactions', icon: ArrowLeftRight },
    { name: 'Inversiones', href: '/investments', icon: TrendingUp },
    { name: 'Deudas', href: '/debts', icon: AlertCircle },
    { name: 'Perfil', href: '/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar móvil */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white dark:bg-gray-800 shadow-xl">
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">Investments Manager</h1>
            <button onClick={() => setSidebarOpen(false)} className="text-gray-500 dark:text-gray-400">
              <X size={24} />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">Investments Manager</h1>
            <ThemeToggle />
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          {currentUser && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <Link
                to="/profile"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                  style={{ backgroundColor: `${currentUser.color}20` }}
                >
                  {currentUser.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Ver perfil
                  </p>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="lg:pl-64">
        {/* Header móvil */}
        <div className="sticky top-0 z-10 flex h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="px-4 text-gray-500 dark:text-gray-400 focus:outline-none"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center justify-between flex-1 px-4">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Investments Manager</h1>
            <ThemeToggle />
          </div>
        </div>

        {/* Contenido */}
        <main className="p-4 lg:p-8 pb-16">
          {children}
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 lg:left-64 border-t border-gray-200/60 dark:border-gray-800/60 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm">
          <div className="px-4 py-2.5">
            <div className="flex items-center justify-end max-w-7xl mx-auto">
              <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-600 dark:text-gray-300">Investments Manager</span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                <span className="font-mono font-medium text-gray-600 dark:text-gray-300">v0.0.0</span>
                <span className="w-1 h-1 rounded-full bg-amber-400 dark:bg-amber-500"></span>
                <span className="font-normal">Versión de desarrollo</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;

