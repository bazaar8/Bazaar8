import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { Newspaper, Radio } from "lucide-react";

export default function News() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "newsEvents"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.warn("News feed restricted:", error);
      setLoading(false);
    });
    return () => unsub();
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
          {events.map((n) => {
            const isPositive = n.impactDirection === 'positive';
            const isNegative = n.impactDirection === 'negative';
            
            return (
              <div key={n.id} className="terminal-card p-4 flex flex-col justify-between group hover:border-[#3b82f6]/50 transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      {new Date(n.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: '2-digit', minute: '2-digit' })} IST
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest ${
                      isPositive ? 'bg-[#08998115] text-[var(--up-color)]' : 
                      isNegative ? 'bg-[#f2364515] text-[var(--down-color)]' : 
                      'bg-[var(--bg-root)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                    }`}>
                      {n.impactDirection || "Neutral"}
                    </span>
                  </div>
                  
                  <h2 className="text-sm font-bold text-[var(--text-main)] leading-snug mb-1.5">{n.headline}</h2>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{n.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Impacted Sectors:</span>
                    <span className="text-[10px] text-[var(--text-main)] font-medium">
                      {n.affectedSectors?.join(", ") || "General Market"}
                    </span>
                  </div>
                  
                  {n.targetTickers && n.targetTickers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {n.targetTickers.map((t: string) => (
                        <span key={t} className="text-[10px] font-mono font-bold text-[var(--text-main)] px-1.5 py-0.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}