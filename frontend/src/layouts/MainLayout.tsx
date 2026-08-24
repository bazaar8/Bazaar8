import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { LogOut, Activity, Search, Bell, Sun, Moon, User } from 'lucide-react';

export default function MainLayout() {
  const { user, profile, logoutUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/stocks', label: 'Markets' },
    { path: '/portfolio', label: 'Portfolio' },
    { path: '/watchlists', label: 'Watchlist' },
    { path: '/news', label: 'News' },
    { path: '/ipo', label: 'IPOs' },
    { path: '/leaderboard', label: 'Leaderboard' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-root)] transition-colors duration-200">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-8 h-full">
            <Link to="/" className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-[var(--up-color)]" />
              <span className="font-bold text-lg tracking-tight text-[var(--text-main)]">MarketSim</span>
            </Link>
            
            <nav className="hidden xl:flex items-center gap-6 h-full">
              {navLinks.map(link => {
                const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`relative flex items-center h-full px-1 text-sm font-bold transition-colors ${
                      isActive 
                        ? 'text-[var(--text-main)]' 
                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {link.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 w-full h-[3px] bg-[var(--up-color)] rounded-t-sm"></span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <div className="hidden md:flex relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search stocks, news..." 
                className="pl-9 pr-4 py-1.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-full text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--up-color)] w-48 lg:w-64 transition-colors" 
              />
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                onClick={toggleTheme} 
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)]"
                title="Toggle Theme"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              
              <button className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)] relative">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[var(--down-color)] rounded-full border border-[var(--bg-card)]"></span>
              </button>
              
              {user && (
                <div className="flex items-center gap-3 border-l border-[var(--border-subtle)] pl-3 sm:pl-4 ml-1">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-root)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] overflow-hidden">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="text-left hidden sm:block leading-tight">
                    <div className="text-xs font-bold text-[var(--text-main)]">{profile?.name || user.email?.split('@')[0]}</div>
                    <div className="text-[10px] text-[var(--up-color)] font-medium">{profile?.role === 'admin' ? 'Administrator' : 'Pro Trader'}</div>
                  </div>
                  <button 
                    onClick={handleLogout} 
                    className="ml-1 p-1.5 text-[var(--text-muted)] hover:text-[var(--down-color)] transition-colors rounded-full hover:bg-[var(--bg-root)]"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        <Outlet />
      </main>
    </div>
  );
}