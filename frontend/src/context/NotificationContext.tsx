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
          
          {/* True Mac-Style Frosted Glass Container */}
          <div className="relative overflow-hidden rounded-[24px] bg-white/40 dark:bg-[#1c1c1e]/60 backdrop-blur-[48px] backdrop-saturate-[180%] border border-white/50 dark:border-[var(--border-subtle)] shadow-[0_8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
            
            {/* Ambient liquid glow behind the text */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-400/20 dark:bg-blue-500/30 rounded-full blur-[40px] pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-cyan-300/20 dark:bg-cyan-400/20 rounded-full blur-[40px] pointer-events-none" />

            <div className="relative flex items-start gap-4 p-4 sm:p-5">
              {/* Icon Circle */}
              <div className="w-10 h-10 rounded-full bg-[var(--bg-root)] text-[var(--text-main)] border border-[var(--border-subtle)] shadow-inner flex items-center justify-center flex-shrink-0 backdrop-blur-md">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-main)] drop-shadow-sm">
                    Breaking Wire
                  </span>
                  <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">Just now</span>
                </div>

                <h4 className="text-sm font-bold text-[var(--text-main)] leading-snug drop-shadow-sm">
                  {activeNewsToast.title || activeNewsToast.message}
                </h4>

                 <div className="mt-3">
                  <Link
                    to="/news"
                    onClick={() => setActiveNewsToast(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 hover:bg-black/10 dark:bg-[var(--bg-root)] dark:hover:bg-[var(--border-subtle)] border border-transparent dark:border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-main)] transition-colors"
                  >
                    <span>Read Full Update</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div> 
              </div>

              <button
                onClick={() => setActiveNewsToast(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Subtle frosted progress bar */}
            <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[var(--border-subtle)]">
              <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-[toastProgress_8s_linear_forwards]" />
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