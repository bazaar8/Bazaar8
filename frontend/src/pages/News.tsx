import { useState, useEffect } from "react";
import { Newspaper, Radio } from "lucide-react";
import { API_URL } from "../config/api";
import { socket } from "../config/socket";

export default function News() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial Fetch
    const fetchNews = async () => {
      try {
        const token = localStorage.getItem("bazaar_jwt_token");
        const res = await fetch(`${API_URL}/news`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        const activeNews = (json.data || []).filter((evt: any) => evt.status === 'active' || evt.status === 'completed');
        setEvents(activeNews);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();

    // 2. Real-time Socket Updates
    const handleNewsUpdate = () => fetchNews();
    socket.on("newsUpdate", handleNewsUpdate);

    return () => {
      socket.off("newsUpdate", handleNewsUpdate);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#3b82f6] animate-pulse" />
            Live Market Feed
          </h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Macroeconomic & Exchange Releases</p>
        </div>
        <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase bg-[var(--bg-card)] px-2 py-1 border border-[var(--border-subtle)] rounded">
          {events.length} EVENTS
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="terminal-card p-12 text-center text-xs font-mono text-[var(--text-muted)] border-dashed border-2 bg-transparent">
          <Newspaper className="w-8 h-8 mx-auto mb-3 opacity-40" />
          NO ACTIVE BREAKING NEWS ON THE WIRE
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {events.map((n) => (
            <div key={n.eventId || n._id} className="terminal-card p-4 flex flex-col justify-between group hover:border-[#3b82f6]/50 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    {new Date(n.startTime || n.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: '2-digit', minute: '2-digit' })} IST
                  </span>
                </div>
                
                <h2 className="text-sm font-bold text-[var(--text-main)] leading-snug mb-1.5">{n.headline}</h2>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}