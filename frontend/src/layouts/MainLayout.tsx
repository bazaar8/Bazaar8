import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { useLivePrices } from '../hooks/useLivePrices';
import { LogOut, Activity, Bell, Sun, Moon, User, X, Newspaper, Menu } from 'lucide-react';
import { collection, query, limit, onSnapshot, orderBy, doc } from 'firebase/firestore';
import { db } from '../config/firebase';


export default function MainLayout() {
  const { user, profile, logoutUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { marketStatus } = useLivePrices();
  
  const [activeNews, setActiveNews] = useState<any | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // <-- NEW: Mobile Menu State
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  useEffect(() => {
    if (!user) return;
    const unsubUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setIsFrozen(docSnap.data().isFrozen || false);
      }
    });
    return () => unsubUser();
  }, [user]);

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

    const q = query(collection(db, "newsEvents"), orderBy("createdAt", "desc"), limit(5));
    
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const firedEvents = snap.docs
          .map(doc => doc.data())
          .filter(news => news.startTime && news.startTime > 0)
          .sort((a, b) => b.startTime - a.startTime);
          
        if (firedEvents.length > 0) {
          const newestNews = firedEvents[0];
          const timeSinceFired = Date.now() - newestNews.startTime;
          const isRecent = timeSinceFired < 30000;

          if (isRecent) {
            setActiveNews(newestNews);
            setShowNotification(true);
            
            if (notificationTimer.current) clearTimeout(notificationTimer.current);
            const timeLeft = Math.max(0, 30000 - timeSinceFired);
            notificationTimer.current = setTimeout(() => {
              setShowNotification(false);
            }, timeLeft);
          } else {
            setShowNotification(false);
          }
        }
      }
    });

    return () => {
      unsub();
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, [user]);

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/stocks', label: 'Markets' },
    { path: '/portfolio', label: 'Portfolio' },
    { path: '/watchlists', label: 'Watchlist' },
    { path: '/news', label: 'News' },
    { path: '/ipo', label: 'IPOs' },
    { path: '/leaderboard', label: 'Leaderboard' },
  ];

  const visibleNavLinks = (marketStatus === 'CLOSED' && profile?.role !== 'admin') 
    ? navLinks.filter(link => link.path === '/leaderboard')
    : navLinks;

  const isBlocked = profile?.role !== 'admin' && (marketStatus === 'PAUSED' || isFrozen);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-root)] transition-colors duration-200">
      <header className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-8 h-full">
            <div className="flex items-center gap-3 px-4 py-2">
              <img src="/logo.png" alt="Bulls and Bears Logo" className="w-10 h-10" />
              <span className="font-bold text-lg tracking-tight text-[var(--text-main)]">Bulls and Bears</span>  
              <span className="font-bold text-lg tracking-tight text-[var(--text-main)]">Bazaar 8.0</span>
            </div>
            <nav className="hidden lg:flex items-center gap-6 h-full">
              {visibleNavLinks.map(link => {
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
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                onClick={toggleTheme} 
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)]"
                title="Toggle Theme"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              
              <button className="hidden sm:block p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)] relative">
               <Link 
                  to="/news" 
                  className="hidden sm:block p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors rounded-full hover:bg-[var(--bg-root)] relative"
                  title="News"
                >
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--down-color)] rounded-full border border-[var(--bg-card)]"></span>
                </Link>
              </button>
              
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

      {showNotification && activeNews && !isBlocked && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#3b82f6] text-white p-4 rounded-lg shadow-2xl flex items-start gap-4 max-w-sm border border-blue-400 animate-bounce">
          <div className="bg-white/20 p-2 rounded-full animate-pulse flex-shrink-0">
            <Newspaper className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-bold text-xs uppercase tracking-wider text-blue-100">Breaking News</h4>
              <button onClick={() => setShowNotification(false)} className="text-blue-200 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm font-medium leading-snug">{activeNews.headline}</p>
          </div>
        </div>
      )}

      {isBlocked && (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg-root)] flex flex-col items-center justify-center p-4">
          <div className="animate-pulse flex flex-col items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-[var(--bg-card)] border-4 border-[var(--border-subtle)] flex items-center justify-center shadow-2xl">
              <Activity className="w-12 h-12 text-[var(--text-muted)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-main)] tracking-widest uppercase text-center">
              {isFrozen ? "Account Suspended" : "Market Paused"}
            </h1>
            <p className="text-[var(--text-muted)] font-mono text-sm max-w-md text-center leading-relaxed">
              {isFrozen 
                ? "Your terminal access has been temporarily restricted by the administrator. Please contact the trading desk." 
                : "The exchange is currently paused. Terminal data is hidden to prevent advanced charting. Await market open."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}