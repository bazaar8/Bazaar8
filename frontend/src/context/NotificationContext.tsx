import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Radio, X, ArrowRight } from "lucide-react";

export type NotificationType = "news" | "trade" | "ipo" | "system" | "alert";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  impact?: "positive" | "negative" | "neutral";
  tickers?: string[];
  link?: string;
  autoClose?: boolean;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  notify: (notification: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem("bazaar_notifications_v1");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("bazaar_sound_enabled");
      return saved !== null ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const [activeNewsToast, setActiveNewsToast] = useState<AppNotification | null>(null);

  // Save sound setting
  useEffect(() => {
    try {
      localStorage.setItem("bazaar_sound_enabled", JSON.stringify(soundEnabled));
    } catch (e) {}
  }, [soundEnabled]);

  // Persist notifications list
  useEffect(() => {
    try {
      localStorage.setItem("bazaar_notifications_v1", JSON.stringify(notifications.slice(0, 50)));
    } catch (e) {}
  }, [notifications]);

  const dismissToast = useCallback((id: string) => {
    setActiveNewsToast(prev => prev?.id === id ? null : prev);
  }, []);

  const notify = useCallback((item: Omit<AppNotification, "id" | "timestamp" | "read">) => {
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNotif: AppNotification = {
      ...item,
      id,
      timestamp: Date.now(),
      read: false
    };

    // Add to notification history tray under the Bell icon (max 50)
    setNotifications(prev => [newNotif, ...prev.slice(0, 49)]);

    // Only popup on-screen toast for BREAKING NEWS
    if (item.type === "news") {
      setActiveNewsToast(newNotif);
      setTimeout(() => {
        setActiveNewsToast(prev => prev?.id === id ? null : prev);
      }, 8000);
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      soundEnabled,
      setSoundEnabled,
      notify,
      markAsRead,
      markAllAsRead,
      clearNotifications,
      dismissToast
    }}>
      {children}

      {/* FLOATING BREAKING NEWS NOTIFICATION (Top-right, sleek, shows ONLY the news headline - no percentage changes) */}
      {activeNewsToast && (
        <div className="fixed top-16 right-4 sm:right-6 z-[9999] max-w-sm sm:max-w-md w-full animate-in slide-in-from-top-3 duration-300 pointer-events-auto">
          <div className="relative overflow-hidden bg-[#0d131f]/95 backdrop-blur-2xl border border-blue-500/50 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.7)]">
            
            {/* Top Cyan/Blue Ambient Accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400" />

            <div className="flex items-start gap-3 pt-0.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
                <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
              </div>

              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-black uppercase tracking-wider text-blue-400">
                    ⚡ Breaking News
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    Just now
                  </span>
                </div>

                {/* News Headline (Pure news content, zero percentage changes) */}
                <h4 className="text-xs sm:text-sm font-bold text-white leading-snug">
                  {activeNewsToast.title || activeNewsToast.message}
                </h4>

                 <div className="flex items-center gap-3 mt-2.5">
                  <Link
                    to="/news"
                    onClick={() => setActiveNewsToast(null)}
                    className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {/* <span>Read Wire</span> */}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div> 
              </div>

              <button
                onClick={() => setActiveNewsToast(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 8s auto-dismiss progress bar */}
            <div className="w-full bg-zinc-800/80 h-0.5 mt-3 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 animate-[toastProgress_8s_linear_forwards]" />
            </div>

          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
