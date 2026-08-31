import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import type { Order } from "../types/database";
import { ListOrdered, Filter, AlertTriangle } from "lucide-react";

export default function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterSide, setFilterSide] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "orders"), 
      where("uid", "==", user.uid),
      limit(100) 
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const ords: Order[] = [];
      snap.forEach((d) => {
        ords.push(d.data() as Order);
      });
      ords.sort((a, b) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
        return tB - tA;
      });
      setOrders(ords);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const filtered = orders.filter((o) => filterSide === "ALL" || o.side === filterSide);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-[#089981]" />
          <h1 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Order Execution History</h1>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2 py-1 text-xs font-mono rounded">
          <Filter className="w-3 h-3 text-[var(--text-muted)]" />
          <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value)}
            className="bg-transparent text-[var(--text-main)] focus:outline-none cursor-pointer text-xs"
          >
            <option value="ALL" className="bg-[var(--bg-card)] text-[var(--text-main)]">ALL SIDES</option>
            <option value="BUY" className="bg-[var(--bg-card)] text-[var(--text-main)]">BUY</option>
            <option value="SELL" className="bg-[var(--bg-card)] text-[var(--text-main)]">SELL</option>
            <option value="SHORT" className="bg-[var(--bg-card)] text-[var(--text-main)]">SHORT</option>
            <option value="COVER" className="bg-[var(--bg-card)] text-[var(--text-main)]">COVER</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="terminal-card p-12 text-center text-xs font-mono text-[var(--text-muted)]">
          NO TRANSACTION RECORDS FOUND
        </div>
      ) : (
        <>
          {orders.length >= 100 && (
            <div className="bg-amber-900/20 border border-amber-500/50 p-2 rounded flex items-center justify-center gap-2 text-amber-500 text-[10px] font-bold uppercase tracking-widest">
              <AlertTriangle className="w-3.5 h-3.5" />
              Showing most recent 100 executions
            </div>
          )}
          <div className="terminal-card overflow-x-auto">
            <table className="w-full text-left text-xs font-mono whitespace-nowrap">
              <thead>
                <tr className="bg-[var(--bg-root)] text-[var(--text-muted)] border-b border-[var(--border-subtle)] text-[10px] uppercase">
                  <th className="p-3">Side</th>
                  <th className="p-3">Instrument</th>
                  <th className="p-3 text-right">Units</th>
                  <th className="p-3 text-right">Exec Price</th>
                  <th className="p-3 text-right">Profit / Loss</th>
                  <th className="p-3 text-right">0.1% STT</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filtered.map((o, idx) => {
                  const hasPnL = o.realizedPnL !== undefined && o.realizedPnL !== 0;
                  const isUp = (o.realizedPnL || 0) >= 0;

                  return (
                    <tr key={idx} className="hover:bg-[var(--bg-root)] transition-colors">
                      <td className="p-3">
                        <span className={`font-bold ${o.side === "BUY" || o.side === "COVER" ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                          {o.side}
                        </span>
                      </td>
                      <td className="p-3 text-[var(--text-main)] font-bold">{o.ticker}</td>
                      <td className="p-3 text-right text-[var(--text-main)]">{o.quantity}</td>
                      <td className="p-3 text-right text-[var(--text-main)]">₹{o.priceAtExecution?.toFixed(2) || "0.00"}</td>
                      <td className="p-3 text-right">
                        {hasPnL ? (
                          <span className={`font-bold font-mono ${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                            {isUp ? "+" : ""}₹{o.realizedPnL?.toFixed(2)}
                            {o.pnlPct !== undefined && (
                              <span className="text-[10px] block opacity-80">
                                ({o.pnlPct >= 0 ? "+" : ""}{o.pnlPct.toFixed(2)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] text-[10px]">
                            {o.side === "BUY" ? "Position Opened" : o.side === "SHORT" ? "Short Opened" : "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {o.taxDeducted !== undefined && Number(o.taxDeducted) > 0 ? (
                          <span className="text-amber-400 font-mono font-bold text-[11px]">
                            ₹{Number(o.taxDeducted).toFixed(2)}
                          </span>
                        ) : o.priceAtExecution && o.quantity ? (
                          <span className="text-amber-400 font-mono font-bold text-[11px]">
                            ₹{(Number(o.priceAtExecution) * Number(o.quantity) * 0.001).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] text-[10px]">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span className={`px-2 py-0.5 text-[9px] uppercase font-bold rounded ${
                          o.status === "completed" ? "bg-[#08998115] text-[var(--up-color)]" : "bg-[#f2364515] text-[var(--down-color)]"
                        }`}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}