import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { collection, query, onSnapshot, doc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { useLivePrices } from "../hooks/useLivePrices";
import { useAuth } from "../context/AuthContext";
import { PieChart, TrendingUp, TrendingDown, ArrowRight, ListOrdered } from "lucide-react";

export default function Portfolio() {
  const { profile } = useAuth();
  const { cashBalance, startingBalance, longHoldings, shortHoldings, recentOrders, loading } = useUserTradingData();
  const { prices, marketStatus } = useLivePrices();
  const [blockedIpoFunds, setBlockedIpoFunds] = useState(0);
  const ipoUnsubs = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(collection(db, "ipos"));
    
    const unsub = onSnapshot(q, (snap) => {
       ipoUnsubs.current.forEach(fn => fn());
       ipoUnsubs.current = [];
       const activeIpos = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((i: any) => ['upcoming', 'open', 'closed'].includes(i.status));
       const currentBlocked: Record<string, number> = {};
       
       activeIpos.forEach((ipo: any) => {
          const subRef = doc(db, "ipos", ipo.id, "subscriptions", profile.uid);
          const subUnsub = onSnapshot(subRef, (subSnap) => {
             if (subSnap.exists()) {
                const subData = subSnap.data() as any;
                if (!['won', 'lost', 'success', 'refunded'].includes(subData.status)) {
                   const price = Number(ipo.price) || 0;
                   const lotSize = Number(ipo.lotSize) || 1;
                   const reqLots = Number(subData.requestedLots) || Math.max(1, Math.floor((Number(subData.requestedShares) || 1) / lotSize));
                   currentBlocked[ipo.id] = (reqLots * lotSize * price);
                } else {
                   currentBlocked[ipo.id] = 0;
                }
             } else {
                currentBlocked[ipo.id] = 0;
             }
             setBlockedIpoFunds(Object.values(currentBlocked).reduce((a, b) => a + b, 0));
          });
          ipoUnsubs.current.push(subUnsub);
       });
    });
    return () => {
      unsub();
      ipoUnsubs.current.forEach(fn => fn());
    };
  }, [profile]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const safeCash = isNaN(Number(cashBalance)) ? 0 : Number(cashBalance);
  const safeStarting = isNaN(Number(startingBalance)) || Number(startingBalance) === 0 ? 1000000 : Number(startingBalance);
  
  const longMarketValue = longHoldings.reduce((sum, h) => {
    const p = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
    const q = Number(h.quantity) || 0;
    return sum + (q * p);
  }, 0);
  
  const shortLiability = shortHoldings.reduce((sum, h) => {
    const p = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
    const q = Number(h.quantity) || 0;
    return sum + (q * p);
  }, 0);
  
  const totalPortfolioValue = safeCash + longMarketValue - shortLiability + blockedIpoFunds;
  const totalPL = totalPortfolioValue - safeStarting;
  const returnPct = (totalPL / safeStarting) * 100;
  
  const chartTotal = Math.max(1, safeCash + longMarketValue + shortLiability + blockedIpoFunds);
  const eqPct = (longMarketValue / chartTotal) * 100;
  const cashPct = ((safeCash + blockedIpoFunds) / chartTotal) * 100;
  const shortPct = (shortLiability / chartTotal) * 100;
  
  const eqDash = `${eqPct} ${100 - eqPct}`;
  const cashDash = `${cashPct} ${100 - cashPct}`;
  const shortDash = `${shortPct} ${100 - shortPct}`;
  
  const eqOffset = 0;
  const cashOffset = 100 - eqPct;
  const shortOffset = 100 - (eqPct + cashPct);

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to export PDF.");
      return;
    }
    const htmlContent = `
      <html>
        <head>
          <title>Transaction Statement - MarketSim</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 40px; color: #111; }
            h1 { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 30px; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { border-bottom: 2px solid #111; padding: 10px; text-align: left; background-color: #f4f4f4; }
            td { border-bottom: 1px solid #ddd; padding: 10px; text-align: left; }
            .right { text-align: right; }
            .buy { color: #089981; font-weight: bold; }
            .sell { color: #f23645; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>OFFICIAL TRANSACTION STATEMENT</h1>
          <div class="header-info">
            <div>
              <strong>Trader Email:</strong> ${profile?.email || 'N/A'}<br/>
              <strong>Export Date:</strong> ${new Date().toLocaleString()}
            </div>
            <div class="right">
              <strong>Final Net Worth:</strong> ₹${totalPortfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}<br/>
              <strong>Available Cash:</strong> ₹${safeCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>TICKER</th>
                <th>ACTION</th>
                <th class="right">QUANTITY</th>
                <th class="right">EXEC PRICE</th>
                <th class="right">TOTAL VALUE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              ${recentOrders.map((o: any) => `
                <tr>
                  <td>${new Date(o.timestamp?.toMillis ? o.timestamp.toMillis() : o.timestamp).toLocaleString()}</td>
                  <td><strong>${o.ticker}</strong></td>
                  <td class="${['BUY', 'COVER'].includes(o.side) ? 'buy' : 'sell'}">${o.side}</td>
                  <td class="right">${o.quantity}</td>
                  <td class="right">₹${Number(o.priceAtExecution).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td class="right">₹${(o.quantity * o.priceAtExecution).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td>${o.status.toUpperCase()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Portfolio Ledger</h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Asset Allocation & Margin Liabilities</p>
        </div>
        <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase bg-[var(--bg-card)] px-2 py-1 border border-[var(--border-subtle)] rounded">MARKET: {marketStatus}</div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Net Worth</span>
            <PieChart className="w-3.5 h-3.5 text-[var(--text-main)]" />
          </div>
          <div className="text-xl lg:text-2xl font-bold font-mono text-[var(--text-main)]">
            ₹{totalPortfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Base: ₹{safeStarting.toLocaleString("en-IN")}</div>
        </div>
        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Available Cash</span>
          </div>
          <div className="text-xl lg:text-2xl font-bold font-mono text-[var(--text-main)]">
            ₹{safeCash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {blockedIpoFunds > 0 ? (
            <div className="text-[10px] font-mono text-[#3b82f6] mt-1 font-bold">+₹{blockedIpoFunds.toLocaleString()} Blocked in IPO</div>
          ) : (
            <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Unallocated Margin</div>
          )}
        </div>
        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Net P&L</span>
            {totalPL >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-[var(--up-color)]" /> : <TrendingDown className="w-3.5 h-3.5 text-[var(--down-color)]" />}
          </div>
          <div className={`text-xl lg:text-2xl font-bold font-mono ${totalPL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
            {totalPL >= 0 ? "+" : ""}₹{totalPL.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Realized & Active</div>
        </div>
        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Return %</span>
          </div>
          <div className={`text-xl lg:text-2xl font-bold font-mono ${returnPct >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
            {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">ROI Benchmark</div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="terminal-card p-4 flex flex-col items-center justify-center relative">
          <h2 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest absolute top-4 left-4">Allocation</h2>
          <div className="relative w-40 h-40 mt-8 mb-4">
            <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90 transform rounded-full">
              <circle cx="16" cy="16" r="15.9155" fill="none" stroke="var(--bg-root)" strokeWidth="4" />
              <circle cx="16" cy="16" r="15.9155" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray={eqDash} strokeDashoffset={eqOffset} className="transition-all duration-1000 ease-out" />
              <circle cx="16" cy="16" r="15.9155" fill="none" stroke="var(--up-color)" strokeWidth="4" strokeDasharray={cashDash} strokeDashoffset={cashOffset} className="transition-all duration-1000 ease-out" />
              <circle cx="16" cy="16" r="15.9155" fill="none" stroke="var(--down-color)" strokeWidth="4" strokeDasharray={shortDash} strokeDashoffset={shortOffset} className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Total</span>
              <span className="text-sm font-bold text-[var(--text-main)] font-mono">100%</span>
            </div>
          </div>
          <div className="w-full space-y-2 mt-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
                <span className="text-[var(--text-main)]">Equity</span>
              </div>
              <span className="text-[var(--text-muted)]">{eqPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--up-color)]"></span>
                <span className="text-[var(--text-main)]">Cash (inc. Blocked)</span>
              </div>
              <span className="text-[var(--text-muted)]">{cashPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--down-color)]"></span>
                <span className="text-[var(--text-main)]">Short Liab.</span>
              </div>
              <span className="text-[var(--text-muted)]">{shortPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 terminal-card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-root)]">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-[var(--text-main)]" />
              <span className="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest">Recent Executions</span>
            </div>
            <button
              onClick={handleExportPDF}
              className="px-3 py-1.5 bg-[#3b82f6] hover:opacity-90 text-white text-[10px] font-bold uppercase rounded shadow-sm transition-opacity"
            >
              Export PDF
            </button>
            <Link to="/orders" className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] font-mono uppercase flex items-center gap-1 transition-colors">
              All Orders <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex-1 overflow-x-auto">
            {(recentOrders?.length ?? 0) === 0 ? (
              <div className="text-xs font-mono text-[var(--text-muted)] text-center py-16">No order records found</div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium text-right">Units</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {recentOrders.slice(0, 6).map((o, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-root)] transition-colors">
                      <td className="px-4 py-3">
                        <span className={`font-bold ${o.side === "BUY" || o.side === "COVER" ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                          {o.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-[var(--text-main)]">{o.ticker}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-main)]">{o.quantity}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-main)]">₹{Number(o.priceAtExecution)?.toFixed(2) || "0.00"}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`px-2 py-0.5 text-[9px] uppercase font-bold rounded ${o.status === "completed" ? "bg-[#08998115] text-[var(--up-color)]" : "bg-[#f2364515] text-[var(--down-color)]"}`}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mt-2">
        <div className="terminal-card overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-root)]">
            <span className="text-xs font-bold text-[var(--up-color)] uppercase tracking-widest">Long Holdings (Assets)</span>
          </div>
          <div className="overflow-x-auto">
            {longHoldings.length === 0 ? (
              <div className="text-xs font-mono text-[var(--text-muted)] text-center py-12">No active long positions</div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">
                    <th className="px-4 py-2 font-medium">Ticker</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Avg Entry</th>
                    <th className="px-4 py-2 font-medium text-right">Live P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {longHoldings.map((h) => {
                    const live = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
                    const pl = (live - (Number(h.avgPrice) || 0)) * (Number(h.quantity) || 0);
                    return (
                      <tr key={h.ticker} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="px-4 py-3 font-bold">
                          <Link to={`/stocks/${h.ticker}`} className="text-[var(--text-main)] hover:text-[var(--up-color)]">{h.ticker}</Link>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">{h.quantity}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)]">₹{Number(h.avgPrice).toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${pl >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                          {pl >= 0 ? "+" : ""}₹{pl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="terminal-card overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-root)]">
            <span className="text-xs font-bold text-[var(--down-color)] uppercase tracking-widest">Short Positions (Liab)</span>
          </div>
          <div className="overflow-x-auto">
            {shortHoldings.length === 0 ? (
              <div className="text-xs font-mono text-[var(--text-muted)] text-center py-12">No active short positions</div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">
                    <th className="px-4 py-2 font-medium">Ticker</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Avg Entry</th>
                    <th className="px-4 py-2 font-medium text-right">Live P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {shortHoldings.map((h) => {
                    const live = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
                    const pl = ((Number(h.avgPrice) || 0) - live) * (Number(h.quantity) || 0);
                    return (
                      <tr key={h.ticker} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="px-4 py-3 font-bold">
                          <Link to={`/stocks/${h.ticker}`} className="text-[var(--text-main)] hover:text-[var(--down-color)]">{h.ticker}</Link>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">{h.quantity}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)]">₹{Number(h.avgPrice).toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${pl >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                          {pl >= 0 ? "+" : ""}₹{pl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}