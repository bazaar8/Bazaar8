import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { useLivePrices } from '../hooks/useLivePrices';
import { LogOut, Bell, Sun, Moon, User, X, Newspaper, Menu, CheckCheck, Trash2, TrendingUp, TrendingDown, Rocket, Sparkles } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { socket } from '../config/socket';
import logoUrl from '../assets/logo.png';

export default function MainLayout() {
  const { user, profile, logoutUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { marketStatus } = useLivePrices();
  const { 
    notifications, 
    unreadCount, 
    notify, 
    markAsRead, 
    markAllAsRead, 
    clearNotifications 
  } = useNotifications();
  
  const [isAppReady, setIsAppReady] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const alertsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setIsAlertsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  useEffect(() => {
    const timer = setTimeout(() => setIsAppReady(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isAppReady || !profile || !marketStatus || marketStatus === 'LOADING') return;
    if (marketStatus === 'CLOSED' && profile.role !== 'admin') {
      if (location.pathname !== '/leaderboard') {
        navigate('/leaderboard');
      }
    }
  }, [marketStatus, profile, location.pathname, navigate, isAppReady]);

  useEffect(() => {
    if (!user) return;

    const handleNewsEvent = (data: any) => {
      let title = "Breaking Market News";
      if (data.headline) {
        title = data.headline;
      } else if (data.ipo) {
        title = `IPO Update: ${data.ipo}`;
      } else if (data.type === 'bulk_breaking') {
        title = `${data.count} Breaking News Events Released!`;
      }
      
      notify({
        type: "news",
        title: title,
        message: title,
        link: "/news"
      });
    };

    socket.on("newsUpdate", handleNewsEvent);

    return () => {
      socket.off("newsUpdate", handleNewsEvent);
    };
  }, [user, notify]);

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/stocks', label: 'Markets' },
    { path: '/portfolio', label: 'Portfolio' },
    { path: '/ipo', label: 'IPOs' },
    { path: '/leaderboard', label: 'Leaderboard' },
  ];

  const visibleNavLinks = (marketStatus === 'CLOSED' && profile?.role !== 'admin') 
    ? navLinks.filter(link => link.path === '/leaderboard')
    : navLinks;

  const isBlocked = profile?.role !== 'admin' && (marketStatus === 'PAUSED' || profile?.isFrozen);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-root)] transition-colors duration-200">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-[1600px] mx-auto px-2 sm:px-4 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-2 sm:gap-3 py-2 flex-shrink-0 min-w-[160px]">
            <img src={logoUrl} alt="Bazaar 8.0 Logo" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
            <span className="font-black text-base sm:text-lg tracking-tight text-[var(--text-main)]">Bazaar 8.0</span>
          </div>

          <nav className="hidden lg:flex items-center justify-center gap-7 h-full flex-1">
            {visibleNavLinks.map(link => {
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`relative flex items-center h-full px-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    isActive 
                      ? 'text-[var(--text-main)]' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 w-full h-[2.5px] bg-[var(--up-color)] rounded-t-sm"></span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center justify-end gap-3 sm:gap-4 flex-shrink-0 min-w-[160px]">
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                onClick={toggleTheme} 
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)]"
                title="Toggle Theme"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              
              <div className="relative" ref={alertsRef}>
                <button 
                  onClick={() => setIsAlertsOpen(prev => !prev)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)] relative"
                  title="Notifications & Alerts"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-[var(--down-color)] text-white font-mono font-bold text-[9px] rounded-full min-w-[16px] text-center shadow">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {isAlertsOpen && (
                  <div className="absolute right-0 top-12 w-80 sm:w-96 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 font-mono">
                    <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-root)]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[var(--up-color)]/10 text-[var(--up-color)] flex items-center justify-center">
                          <Bell className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)] block">
                            Notifications
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {unreadCount} unread • {notifications.length} total
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[var(--text-muted)]">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="p-1.5 rounded-lg hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors text-[var(--up-color)]"
                            title="Mark all as read"
                          >
                            <CheckCheck className="w-4 h-4" />
                          </button>
                        )}

                        {notifications.length > 0 && (
                          <button
                            onClick={clearNotifications}
                            className="p-1.5 rounded-lg hover:text-[var(--down-color)] hover:bg-[var(--bg-card)] transition-colors"
                            title="Clear all notifications"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <button 
                          onClick={() => setIsAlertsOpen(false)}
                          className="p-1.5 rounded-lg hover:text-[var(--text-main)] transition-colors ml-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setNotificationFilter('all')}
                          className={`px-2 py-0.5 rounded ${notificationFilter === 'all' ? 'bg-[var(--bg-root)] text-[var(--text-main)] font-bold' : 'text-[var(--text-muted)]'}`}
                        >
                          All ({notifications.length})
                        </button>
                        <button
                          onClick={() => setNotificationFilter('unread')}
                          className={`px-2 py-0.5 rounded ${notificationFilter === 'unread' ? 'bg-[var(--bg-root)] text-[var(--text-main)] font-bold' : 'text-[var(--text-muted)]'}`}
                        >
                          Unread ({unreadCount})
                        </button>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase flex items-center gap-1 ${
                        marketStatus === 'OPEN' ? 'bg-[var(--up-color)]/15 text-[var(--up-color)]' : 'bg-[var(--down-color)]/15 text-[var(--down-color)]'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${marketStatus === 'OPEN' ? 'bg-[var(--up-color)] animate-ping' : 'bg-[var(--down-color)]'}`} />
                        {marketStatus}
                      </span>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                      {(notificationFilter === 'unread' ? notifications.filter(n => !n.read) : notifications).length === 0 ? (
                        <div className="py-10 px-4 text-center">
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-root)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-2 text-[var(--text-muted)]">
                            <Bell className="w-4 h-4 opacity-40" />
                          </div>
                          <p className="text-xs font-bold text-[var(--text-main)]">All caught up!</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">No {notificationFilter === 'unread' ? 'unread' : ''} notifications at this time.</p>
                        </div>
                      ) : (
                        (notificationFilter === 'unread' ? notifications.filter(n => !n.read) : notifications).map(item => {
                          const isBull = item.impact === "positive";
                          const isBear = item.impact === "negative";
                          const timeAgo = Math.floor((Date.now() - item.timestamp) / 1000);
                          const formattedTime = timeAgo < 60 ? "Just now" : timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m ago` : `${Math.floor(timeAgo / 3600)}h ago`;

                          return (
                            <div 
                              key={item.id} 
                              onClick={() => markAsRead(item.id)}
                              className={`p-3.5 hover:bg-[var(--bg-root)] transition-colors cursor-pointer relative flex items-start gap-3 ${
                                !item.read ? "bg-amber-400/5" : ""
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                item.type === "ipo" ? "bg-amber-400/15 text-amber-400" :
                                isBull ? "bg-[var(--up-color)]/15 text-[var(--up-color)]" :
                                isBear ? "bg-[var(--down-color)]/15 text-[var(--down-color)]" :
                                "bg-blue-500/15 text-blue-400"
                              }`}>
                                {item.type === "ipo" ? <Rocket className="w-3.5 h-3.5" /> :
                                 isBull ? <TrendingUp className="w-3.5 h-3.5" /> :
                                 isBear ? <TrendingDown className="w-3.5 h-3.5" /> :
                                 <Sparkles className="w-3.5 h-3.5" />}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border ${
                                    isBull ? "bg-[var(--up-color)]/15 text-[var(--up-color)] border-[var(--up-color)]/30" :
                                    isBear ? "bg-[var(--down-color)]/15 text-[var(--down-color)] border-[var(--down-color)]/30" :
                                    item.type === "ipo" ? "bg-amber-400/15 text-amber-400 border-amber-400/30" :
                                    "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)]"
                                  }`}>
                                    {item.type}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-[var(--text-muted)]">
                                      {formattedTime}
                                    </span>
                                    {!item.read && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    )}
                                  </div>
                                </div>

                                <p className="text-xs font-bold text-[var(--text-main)] leading-snug font-sans">
                                  {item.title}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed font-sans">
                                  {item.message}
                                </p>

                                {item.tickers && item.tickers.length > 0 && (
                                  <div className="flex gap-1 mt-1.5">
                                    {item.tickers.map((t: string) => (
                                      <Link
                                        key={t}
                                        to={`/stocks/${t}`}
                                        onClick={(e) => { e.stopPropagation(); setIsAlertsOpen(false); }}
                                        className="text-[9px] text-[var(--text-muted)] hover:text-amber-400 bg-[var(--bg-root)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] hover:border-amber-400/40 transition-colors"
                                      >
                                        ${t}
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-root)] text-center">
                      <Link 
                        to="/" 
                        onClick={() => setIsAlertsOpen(false)}
                        className="text-[11px] font-bold text-[var(--up-color)] hover:underline inline-flex items-center gap-1"
                      >
                        <Newspaper className="w-3.5 h-3.5" />
                        View Live News Catalysts on Dashboard
                      </Link>
                    </div>
                  </div>
                )}
              </div>
              
              {user && (
                <div className="flex items-center gap-3 border-l border-[var(--border-subtle)] pl-3 sm:pl-4 ml-1">
                  <div className="hidden sm:flex w-8 h-8 rounded-full bg-[var(--bg-root)] border border-[var(--border-subtle)] items-center justify-center text-[var(--text-muted)] overflow-hidden">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="text-left hidden sm:block leading-tight">
                    <div className="text-xs font-bold text-[var(--text-main)]">{profile?.name || user.email?.split('@')[0]}</div>
                    <div className="text-[10px] text-[var(--up-color)] font-medium">{profile?.role === 'admin' ? 'Administrator' : 'Pro Trader'}</div>
                  </div>
                  <button 
                    onClick={handleLogout} 
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--down-color)] transition-colors rounded-full hover:bg-[var(--bg-root)]"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>

                  <button 
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                    className="lg:hidden p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)]"
                    title="Menu"
                  >
                    {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <nav className="lg:hidden bg-[var(--bg-card)] border-t border-[var(--border-subtle)] p-4 flex flex-col gap-2 shadow-lg absolute w-full left-0 z-40">
            <div className="sm:hidden flex items-center gap-3 pb-4 mb-2 border-b border-[var(--border-subtle)]">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-root)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] overflow-hidden">
                <User className="w-4 h-4" />
              </div>
              <div className="text-left leading-tight">
                <div className="text-xs font-bold text-[var(--text-main)]">{profile?.name || user?.email?.split('@')[0]}</div>
                <div className="text-[10px] text-[var(--up-color)] font-medium">{profile?.role === 'admin' ? 'Administrator' : 'Pro Trader'}</div>
              </div>
            </div>

            {visibleNavLinks.map(link => {
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-bold transition-colors rounded ${
                    isActive 
                      ? 'bg-[var(--bg-root)] text-[var(--text-main)] border-l-4 border-[var(--up-color)]' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-root)] border-l-4 border-transparent'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 flex flex-col gap-6 relative">
        <Outlet />
      </main>

      {isBlocked && (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg-root)] flex flex-col items-center justify-center p-6 text-center">
          <div className="flex flex-col items-center gap-5 max-w-lg">
            <div className="relative flex items-center justify-center p-4">
              <div className="absolute inset-0 rounded-full bg-[var(--up-color)]/20 blur-2xl animate-pulse" />
              <img 
                src={logoUrl} 
                alt="Bulls and Bears Logo" 
                className="w-28 h-28 sm:w-36 sm:h-36 object-contain relative z-10 drop-shadow-[0_0_35px_rgba(8,153,129,0.3)] animate-pulse" 
              />
            </div>
            <div>
              <div className="text-xs font-mono font-bold tracking-widest text-[var(--up-color)] uppercase mb-1">
                Bazaar 8.0 • Institutional Terminal
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--text-main)] tracking-wider uppercase">
                {profile?.isFrozen ? "Account Suspended" : "Market Paused"}
              </h1>
            </div>
            <p className="text-[var(--text-muted)] font-mono text-xs sm:text-sm leading-relaxed border-t border-[var(--border-subtle)] pt-4">
              {profile?.isFrozen 
                ? "Your terminal trading privileges have been temporarily frozen by administrators. Please contact the market operations desk." 
                : "Trading sessions are paused by exchange controllers. Order queues and live execution are temporarily held. Please stand by."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}