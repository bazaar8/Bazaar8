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

      {/* MAC-STYLE MINIMAL PURE GLASS NOTIFICATION */}
      {activeNewsToast && (
        <div className="fixed top-16 right-4 sm:right-6 z-[9999] max-w-sm sm:max-w-md w-full pointer-events-auto animate-in slide-in-from-top-4 fade-in duration-500 ease-out">
          
          {/* Pure Glass Container - No internal colors or glows */}
          <div className="relative rounded-[16px] bg-white/30 dark:bg-[#1c1c1e]/40 backdrop-blur-[40px] backdrop-saturate-[200%] border border-white/50 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-4 flex items-start gap-3.5">
            
            {/* Minimal Icon */}
            <div className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/10 border border-[var(--border-subtle)] shadow-inner flex items-center justify-center flex-shrink-0 text-[var(--text-main)]">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-semibold tracking-wide uppercase text-[var(--text-main)]">
                  Bazaar News
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium">now</span>
              </div>

              {/* Clean, High-Contrast Text */}
              <h4 className="text-sm font-medium text-[var(--text-main)] leading-snug">
                {activeNewsToast.title || activeNewsToast.message}
              </h4>

               <div className="mt-2.5">
                <Link
                  to="/news"
                  onClick={() => setActiveNewsToast(null)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3b82f6] hover:underline transition-colors"
                >
                  <span>Read Full Update</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div> 
            </div>

            <button
              onClick={() => setActiveNewsToast(null)}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
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