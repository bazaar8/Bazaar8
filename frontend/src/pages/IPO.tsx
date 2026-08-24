import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";
import { subscribeToIPO } from "../services/ipoService";
import { useAuth } from "../context/AuthContext";
import type { IPOEvent } from "../types/ipo";
import { Sparkles, Clock, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

export default function IPO() {
  const { user } = useAuth();
  const [ipos, setIpos] = useState<IPOEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "ipos"), orderBy("openTime", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setIpos(snap.docs.map(d => ({ id: d.id, ...d.data() } as IPOEvent)));
      setLoading(false);
    }, (error) => {
      console.warn("IPO restricted:", error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSubscribe = async (ipoId: string, price: number) => {
    const amount = parseInt(qty[ipoId] || "0", 10);
    if (amount <= 0) return;
    
    if (!window.confirm(`Confirm subscription for ${amount} shares at ₹${price.toFixed(2)} each? Total block: ₹${(amount * price).toLocaleString('en-IN')}`)) return;

    setSubmitting(ipoId);
    try {
      await subscribeToIPO(ipoId, amount);
      alert("Subscription successful! Funds have been blocked.");
      setQty({ ...qty, [ipoId]: "" });
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#f59e0b]" />
            Primary Market (IPO)
          </h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Initial Public Offerings & Subscriptions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {ipos.map((ipo) => (
          <div key={ipo.id} className="terminal-card flex flex-col overflow-hidden group">
            <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-root)] relative">
              <span className={`absolute top-4 right-4 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                ipo.status === 'open' ? 'bg-[#08998115] text-[var(--up-color)] border border-[#08998130] animate-pulse' :
                ipo.status === 'upcoming' ? 'bg-[#f59e0b15] text-[#f59e0b] border border-[#f59e0b30]' :
                'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
              }`}>
                {ipo.status}
              </span>
              <h2 className="text-xl font-bold text-[var(--text-main)] tracking-tight">{ipo.ticker}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{ipo.name}</p>
              <div className="inline-block mt-3 px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] font-mono">
                {ipo.sector}
              </div>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)]">
                  <span className="block text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Offer Price</span>
                  <span className="block text-sm font-mono font-bold text-[var(--text-main)] mt-1">₹{ipo.price.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)]">
                  <span className="block text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Issue Size</span>
                  <span className="block text-sm font-mono font-bold text-[var(--text-main)] mt-1">{ipo.totalShares.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)] space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)] flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Opens</span>
                  <span className="text-[var(--text-main)] font-bold">{new Date(ipo.openTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)] flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> Closes</span>
                  <span className="text-[var(--text-main)] font-bold">{new Date(ipo.closeTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 mt-1">
                  <span className="text-[var(--text-muted)] flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5"/> Allotment</span>
                  <span className="font-bold text-[#3b82f6] uppercase">{ipo.allotmentType}</span>
                </div>
              </div>

              {ipo.status === 'open' && (
                <div className="pt-2 mt-auto">
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Subscribe Quantity</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={qty[ipo.id] || ""}
                      onChange={(e) => setQty({ ...qty, [ipo.id]: e.target.value })}
                      placeholder="Units"
                      className="w-1/3 px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-[var(--text-main)] font-mono text-sm focus:outline-none focus:border-[var(--up-color)] transition-colors"
                    />
                    <button
                      onClick={() => handleSubscribe(ipo.id, ipo.price)}
                      disabled={submitting === ipo.id || !qty[ipo.id]}
                      className="flex-1 bg-[var(--up-color)] hover:opacity-90 disabled:opacity-50 text-white font-bold rounded text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-opacity"
                    >
                      {submitting === ipo.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>Apply <ArrowRight className="w-3.5 h-3.5"/></>
                      )}
                    </button>
                  </div>
                </div>
              )}
              
              {ipo.status === 'allotted' && (
                <div className="mt-auto p-2.5 bg-[#f59e0b15] border border-[#f59e0b30] rounded text-[#f59e0b] text-[10px] font-mono font-bold text-center uppercase tracking-widest">
                  Allotment Complete. Awaiting Listing.
                </div>
              )}
              {ipo.status === 'listed' && (
                <div className="mt-auto p-2.5 bg-[#3b82f615] border border-[#3b82f630] rounded text-[#3b82f6] text-[10px] font-mono font-bold text-center uppercase tracking-widest">
                  Trading Live on Secondary Market
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}