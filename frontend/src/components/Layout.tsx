import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Database,
  GitBranch,
  Bug,
  Code,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  RefreshCw,
} from 'lucide-react';
import { useUIStore } from '../hooks/useStore';
import { cn } from '../utils/helpers';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Repositories', href: '/repositories', icon: Database },
  { name: 'Analyses', href: '/analyses', icon: GitBranch },
  { name: 'Findings', href: '/findings', icon: Bug },
  { name: 'Refactor Proposals', href: '/refactor-proposals', icon: Code },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout() {
  const { sidebarOpen, setSidebarOpen, toggleSidebar, theme, setTheme, notifications } = useUIStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleThemeCycle = () => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    setTheme(themes[(currentIndex + 1) % themes.length]);
  };

  const getThemeIcon = () => {
    if (theme === 'dark') return <Moon className="w-5 h-5" />;
    if (theme === 'light') return <Sun className="w-5 h-5" />;
    return <Monitor className="w-5 h-5" />;
  };

  return (
    <div className="min-h-screen bg-dark-50 dark:bg-dark-950 transition-colors duration-200">
      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen bg-white dark:bg-dark-900 border-r border-dark-200 dark:border-dark-700 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-20',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className={cn('flex h-16 items-center justify-between px-4 border-b border-dark-200 dark:border-dark-700', !sidebarOpen && 'justify-center')}>
            <NavLink to="/dashboard" className="flex items-center gap-2" aria-label="Agent Reviewer Home">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
                <Code className="w-5 h-5 text-white" />
              </div>
              {sidebarOpen && (
                <span className="font-bold text-lg text-dark-900 dark:text-white">
                  Agent Reviewer
                </span>
              )}
            </NavLink>
            <button
              onClick={() => {
                if (window.innerWidth < 1024) setMobileMenuOpen(false);
                else toggleSidebar();
              }}
              className={cn('p-1.5 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800 lg:hidden', !sidebarOpen && 'hidden')}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1" aria-label="Main navigation">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'sidebar-link',
                    isActive && 'sidebar-link-active',
                    !sidebarOpen && 'justify-center px-2'
                  )}
                  title={sidebarOpen ? undefined : item.name}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                  {sidebarOpen && <span>{item.name}</span>}
                </NavLink>
              );
            })}
          </nav>

          {/* Bottom section */}
          <div className="p-4 border-t border-dark-200 dark:border-dark-700">
            <div className="flex items-center justify-between">
              <button
                onClick={toggleThemeCycle}
                className={cn('p-2 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800', !sidebarOpen && 'mx-auto')}
                title={`Theme: ${theme}`}
                aria-label={`Current theme: ${theme}. Click to cycle.`}
              >
                {getThemeIcon()}
              </button>
              {sidebarOpen && (
                <div className="text-xs text-dark-500 dark:text-dark-400">
                  v1.0.0
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={cn('lg:pl-64 transition-all duration-300', sidebarOpen ? 'lg:pl-64' : 'lg:pl-20')}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-dark-900/80 backdrop-blur-sm border-b border-dark-200 dark:border-dark-700">
          <div className="flex h-full items-center justify-between px-4 lg:px-6">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex-1 lg:flex-none" />

            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search repositories, analyses..."
                  className="input pl-10 w-64"
                  aria-label="Search"
                />
              </div>

              {/* Notifications */}
              <div className="relative">
                <button
                  className="relative p-2 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800"
                  aria-label={`Notifications ${notifications.length > 0 ? `(${notifications.length})` : ''}`}
                >
                  <Bell className="w-5 h-5" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-medium">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Refresh */}
              <button
                className="p-2 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800"
                aria-label="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6" role="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {/* Notifications toast */}
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            'fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-up',
            notification.type === 'success' && 'bg-green-600 text-white',
            notification.type === 'error' && 'bg-red-600 text-white',
            notification.type === 'warning' && 'bg-yellow-600 text-white',
            notification.type === 'info' && 'bg-blue-600 text-white'
          )}
          role="alert"
        >
          <span>{notification.message}</span>
          <button
            onClick={() => useUIStore.getState().removeNotification(notification.id)}
            className="p-1 text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}