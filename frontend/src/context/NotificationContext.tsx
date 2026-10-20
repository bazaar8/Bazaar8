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

  useEffect(() => {
    try {
      localStorage.setItem("bazaar_sound_enabled", JSON.stringify(soundEnabled));
    } catch (e) {}
  }, [soundEnabled]);

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
    const newNotif: AppNotification = { ...item, id, timestamp: Date.now(), read: false };

    setNotifications(prev => [newNotif, ...prev.slice(0, 49)]);

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
      notifications, unreadCount, soundEnabled, setSoundEnabled,
      notify, markAsRead, markAllAsRead, clearNotifications, dismissToast
    }}>
      {children}

      {/* MAC-STYLE LIQUID GLASSMORPHISM NOTIFICATION */}
      {activeNewsToast && (
        <div className="fixed top-16 right-4 sm:right-6 z-[9999] max-w-sm sm:max-w-md w-full pointer-events-auto animate-in slide-in-from-top-4 fade-in duration-500 ease-out">
          {/* Outer glow and frosted glass container */}
          <div className="relative overflow-hidden rounded-[20px] bg-white/10 dark:bg-black/20 backdrop-blur-[24px] saturate-[1.5] border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.2)]">
            
            {/* Ambient liquid glow behind the text */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/30 rounded-full blur-[40px] pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-cyan-400/20 rounded-full blur-[40px] pointer-events-none" />

            <div className="relative flex items-start gap-4 p-5">
              {/* Icon Circle */}
              <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 shadow-inner flex items-center justify-center flex-shrink-0 backdrop-blur-md">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-medium tracking-[0.15em] uppercase text-blue-200/90 dark:text-blue-300 drop-shadow-sm">
                    Breaking Wire
                  </span>
                  <span className="w-1 h-1 rounded-full bg-blue-400/50" />
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-400/80">Just now</span>
                </div>

                <h4 className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug drop-shadow-sm">
                  {activeNewsToast.title || activeNewsToast.message}
                </h4>

                 <div className="mt-3">
                  <Link
                    to="/news"
                    onClick={() => setActiveNewsToast(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[11px] font-semibold text-blue-600 dark:text-blue-300 transition-all duration-300"
                  >
                    <span>Read Full Update</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div> 
              </div>

              <button
                onClick={() => setActiveNewsToast(null)}
                className="w-6 h-6 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 text-zinc-600 dark:text-zinc-300 transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Subtle frosted progress bar */}
            <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/10 dark:bg-black/20">
              <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-300 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-[toastProgress_8s_linear_forwards]" />
            </div>

          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within a NotificationProvider");
  return context;
}