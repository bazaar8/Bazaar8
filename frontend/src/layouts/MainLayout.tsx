import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { useLivePrices } from '../hooks/useLivePrices';
import { LogOut, Bell, Sun, Moon, User, X, Newspaper, Menu } from 'lucide-react';
import { collection, query, limit, onSnapshot, orderBy, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import logoUrl from '../assets/logo.png';

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [alertsList, setAlertsList] = useState<any[]>([]);
  const alertsRef = useRef<HTMLDivElement>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close alerts dropdown on outside click
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
          .filter(news => news && typeof news.startTime === 'number' && news.startTime > 0)
          .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
          
        setAlertsList(firedEvents);
        if (firedEvents.length > 0) {
          const newestNews = firedEvents[0];
          const timeSinceFired = Date.now() - (newestNews.startTime || Date.now());
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
        <div className="max-w-[1600px] mx-auto px-2 sm:px-4 h-16 flex items-center justify-between">
          
          {/* Left Brand */}
          <div className="flex items-center gap-2 sm:gap-3 py-2 flex-shrink-0 min-w-[160px]">
            <img src={logoUrl} alt="Bazaar 8.0 Logo" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
            <span className="font-black text-base sm:text-lg tracking-tight text-[var(--text-main)]">Bazaar 8.0</span>
          </div>

          {/* Center-Aligned Navigation Links (Smaller, Refined Typography) */}
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

          {/* Right Tools & Profile */}
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
                  title="Market Alerts"
                >
                  <Bell className="w-5 h-5" />
                  {alertsList.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--down-color)] rounded-full border border-[var(--bg-card)]"></span>
                  )}
                </button>

                {/* Alerts Dropdown Popover */}
                {isAlertsOpen && (
                  <div className="absolute right-0 top-12 w-80 sm:w-96 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-root)]">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-[var(--up-color)]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
                          Exchange Alerts ({alertsList.length})
                        </span>
                      </div>
                      <button 
                        onClick={() => setIsAlertsOpen(false)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                      {/* Market State Notice */}
                      <div className="p-3 bg-[var(--bg-card)] flex items-start gap-2.5">
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          marketStatus === "OPEN" ? "bg-[var(--up-color)] animate-ping" : "bg-[var(--down-color)]"
                        }`} />
                        <div>
                          <div className="text-[11px] font-bold text-[var(--text-main)] font-mono">
                            MARKET SESSION: {marketStatus}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">
                            {marketStatus === "OPEN" ? "Real-time trading engine is currently matching orders." : "Trading session is currently inactive."}
                          </div>
                        </div>
                      </div>

                      {/* News / Catalysts Alerts */}
                      {alertsList.length === 0 ? (
                        <div className="p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                          No recent broadcast alerts.
                        </div>
                      ) : (
                        alertsList.map((item, idx) => {
                          const impact = item.impactDirection || "neutral";
                          const isBull = impact === "positive";
                          const isBear = impact === "negative";

                          return (
                            <div key={item.id || idx} className="p-3 hover:bg-[var(--bg-root)] transition-colors">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                                  isBull ? "bg-[#089981]/15 text-[var(--up-color)] border-[#089981]/30" :
                                  isBear ? "bg-[#f23645]/15 text-[var(--down-color)] border-[#f23645]/30" :
                                  "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)]"
                                }`}>
                                  {impact}
                                </span>
                                <span className="text-[9px] font-mono text-[var(--text-muted)]">
                                  {new Date(item.startTime || item.createdAt || Date.now()).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-[var(--text-main)] leading-snug">
                                {item.headline}
                              </p>
                              {item.targetTickers && item.targetTickers.length > 0 && (
                                <div className="flex gap-1 mt-1.5">
                                  {item.targetTickers.map((t: string) => (
                                    <span key={t} className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-root)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                                      ${t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-root)] text-center">
                      <Link 
                        to="/" 
                        onClick={() => setIsAlertsOpen(false)}
                        className="text-[11px] font-mono font-bold text-[var(--up-color)] hover:underline inline-flex items-center gap-1"
                      >
                        <Newspaper className="w-3.5 h-3.5" />
                        View Live News on Dashboard
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
                {isFrozen ? "Account Suspended" : "Market Paused"}
              </h1>
            </div>
            <p className="text-[var(--text-muted)] font-mono text-xs sm:text-sm leading-relaxed border-t border-[var(--border-subtle)] pt-4">
              {isFrozen 
                ? "Your terminal trading privileges have been temporarily frozen by administrators. Please contact the market operations desk." 
                : "Trading sessions are paused by exchange controllers. Order queues and live execution are temporarily held. Please stand by."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}