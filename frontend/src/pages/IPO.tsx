import { useState, useEffect } from "react";
import { collection, onSnapshot, doc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { CheckCircle, TrendingUp, Clock, X } from "lucide-react";

export default function IPO() {
  const { user } = useAuth();
  const [ipos, setIpos] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [processingIpoId, setProcessingIpoId] = useState<string | null>(null);

  const [selectedIpo, setSelectedIpo] = useState<any | null>(null);
  const [lotsToApply, setLotsToApply] = useState(1);

  const functions = getFunctions(app);

  useEffect(() => {
    const unsubIpos = onSnapshot(collection(db, "ipos"), (snap) => {
      setIpos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubIpos();
  }, []);

  useEffect(() => {
    if (!user || ipos.length === 0) return;

    const unsubs = ipos.map(ipo => {
      return onSnapshot(doc(db, "ipos", ipo.id, "subscriptions", user.uid), (docSnap) => {
        if (docSnap.exists()) {
          setSubscriptions(prev => ({ ...prev, [ipo.id]: docSnap.data() }));
        }
      });
    });

    return () => unsubs.forEach(u => u());
  }, [user, ipos]);

  const handleApply = async () => {
    if (!selectedIpo || !user || lotsToApply < 1) return;
    
    setProcessingIpoId(selectedIpo.id);
    try {
      const fn = httpsCallable(functions, 'subscribeIPO');
      const totalShares = lotsToApply * (Number(selectedIpo.lotSize) || 1);
      
      await fn({ 
        ipoId: selectedIpo.id, 
        requestedShares: totalShares,
        requestedLots: lotsToApply
      });
      
      alert(`Applied for ${lotsToApply} lot(s) of ${selectedIpo.ticker}!`);
      setSelectedIpo(null);
      setLotsToApply(1);
    } catch (err: any) {
      alert("Application Failed: " + err.message);
    } finally {
      setProcessingIpoId(null);
    }
  };

  const formatScheduleTime = (timestamp?: number) => {
    if (!timestamp) return "TBA";
    return new Date(timestamp).toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
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
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Primary Market (IPO)</h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Initial Public Offerings & Lotteries</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {ipos.length === 0 ? (
          <div className="col-span-full terminal-card p-12 text-center text-xs font-mono text-[var(--text-muted)]">
            No active or upcoming IPO offerings available.
          </div>
        ) : (
          ipos.map((ipo) => {
            const price = Number(ipo.price) || 0;
            const lotSize = Number(ipo.lotSize) || 1;
            const minInvestment = price * lotSize;
            const gmp = Number(ipo.listingPremiumPct) || 0;
            
            const mySub = subscriptions[ipo.id];
            const hasApplied = !!mySub;

            return (
              <div key={ipo.id} className="terminal-card flex flex-col justify-between p-5 space-y-4">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-base font-bold text-[var(--text-main)] tracking-tight">{ipo.ticker}</h2>
                      <p className="text-xs text-[var(--text-muted)]">{ipo.name}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${
                      ipo.status === 'open' ? 'bg-[#08998115] text-[var(--up-color)] border border-[#08998130]' :
                      ipo.status === 'upcoming' ? 'bg-[#f59e0b15] text-[#f59e0b] border border-[#f59e0b30]' :
                      ipo.status === 'allotted' ? 'bg-[#8b5cf615] text-[#8b5cf6] border border-[#8b5cf630]' :
                      'bg-[var(--bg-root)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                    }`}>
                      {ipo.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-mono">
                    <div className="p-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase">Price Band</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">₹{price.toFixed(2)}</div>
                    </div>
                    <div className="p-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase">Lot Size</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">{lotSize} Shares</div>
                    </div>
                    <div className="p-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase">Min Investment</div>
                      <div className="font-bold text-[var(--text-main)] mt-0.5">₹{minInvestment.toFixed(2)}</div>
                    </div>
                    <div className="p-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase">Expected GMP</div>
                      <div className="font-bold text-[var(--up-color)] mt-0.5">+{gmp}%</div>
                    </div>
                  </div>

                  <div className="mt-3 p-2.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded space-y-1.5 text-[11px] font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[var(--text-muted)]" /> Opens
                      </span>
                      <span className="font-bold text-[var(--text-main)]">{formatScheduleTime(ipo.openTime)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-dashed border-[var(--border-subtle)] pt-1.5">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[var(--text-muted)]" /> Closes (Allot)
                      </span>
                      <span className="font-bold text-[var(--text-main)]">{formatScheduleTime(ipo.closeTime)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-dashed border-[var(--border-subtle)] pt-1.5">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-[var(--up-color)]" /> Listing
                      </span>
                      <span className="font-bold text-[var(--up-color)]">{formatScheduleTime(ipo.listTime)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  {hasApplied ? (
                    <div className="p-3 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-center space-y-1">
                      <div className="text-[10px] font-bold uppercase text-[var(--text-main)]">
                        {ipo.status === 'allotted' || ipo.status === 'listed' ? (
                          mySub.status === 'won' || Number(mySub.allocatedShares) > 0 ? (
                            <span className="text-[var(--up-color)] flex items-center justify-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Allotted ({mySub.allocatedShares} shares)
                            </span>
                          ) : (
                            <span className="text-[var(--down-color)]">Not Allotted (Refunded)</span>
                          )
                        ) : (
                          <span className="text-[#3b82f6]">
                            Application Active ({mySub.requestedShares || (mySub.requestedLots * lotSize)} shares)
                          </span>
                        )}
                      </div>
                    </div>
                  ) : ipo.status === 'open' ? (
                    <button
                      onClick={() => { setSelectedIpo(ipo); setLotsToApply(1); }}
                      className="w-full py-2 bg-[var(--up-color)] hover:opacity-90 text-white text-xs font-bold uppercase rounded transition-opacity"
                    >
                      Apply for IPO
                    </button>
                  ) : (
                    <button disabled className="w-full py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs font-bold uppercase rounded opacity-50 cursor-not-allowed">
                      {ipo.status === 'upcoming' ? 'Not Yet Open' : 'Closed'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedIpo && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main)]">Apply: {selectedIpo.ticker}</h2>
              <button onClick={() => setSelectedIpo(null)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Price per Share:</span>
                <span className="text-[var(--text-main)] font-bold">₹{Number(selectedIpo.price).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Lot Size:</span>
                <span className="text-[var(--text-main)] font-bold">{Number(selectedIpo.lotSize) || 1} shares</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)]">Select Lots:</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setLotsToApply(Math.max(1, lotsToApply - 1))}
                    className="px-2 py-0.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-[var(--text-main)] font-bold"
                  >-</button>
                  <span className="font-bold text-[var(--text-main)]">{lotsToApply}</span>
                  <button 
                    onClick={() => setLotsToApply(lotsToApply + 1)}
                    className="px-2 py-0.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-[var(--text-main)] font-bold"
                  >+</button>
                </div>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)]">Total Amount Blocked:</span>
                <span className="text-[var(--up-color)] font-bold">
                  ₹{(lotsToApply * Number(selectedIpo.price) * (Number(selectedIpo.lotSize) || 1)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <button
              onClick={handleApply}
              disabled={processingIpoId === selectedIpo.id}
              className="w-full py-2 bg-[var(--up-color)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold uppercase rounded transition-opacity"
            >
              {processingIpoId === selectedIpo.id ? "Processing..." : "Submit Application"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}