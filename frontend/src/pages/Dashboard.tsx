import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { STOCKS_CATALOG } from "../data/stocksData";
import Sparkline from "../components/Sparkline";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { ArrowRight, Plus, Edit2 } from "lucide-react";

export default function Dashboard() {
  const { prices, marketStatus } = useLivePrices();
  const { cashBalance, startingBalance, longHoldings, shortHoldings, watchlist } = useUserTradingData();
  const [newsEvents, setNewsEvents] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, "newsEvents"), orderBy("createdAt", "desc"), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      setNewsEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.warn("Dashboard news restricted:", error);
    });
    return () => unsub();
  }, []);

  const enrichedStocks = STOCKS_CATALOG.map((s) => {
    const live = prices[s.ticker]?.price ?? s.basePrice;
    const diff = live - s.basePrice;
    const pct = (diff / s.basePrice) * 100;
    const spark = [s.basePrice, s.basePrice * 0.995, s.basePrice * 1.005, live * 0.998, live];
    return { ...s, currentPrice: live, change: diff, changePct: pct, sparkline: spark };
  });

  const longMarketValue = longHoldings.reduce((sum, h) => sum + h.quantity * (prices[h.ticker]?.price ?? h.avgPrice), 0);
  const shortLiability = shortHoldings.reduce((sum, h) => sum + h.quantity * (prices[h.ticker]?.price ?? h.avgPrice), 0);
  const totalPortfolioValue = cashBalance + longMarketValue - shortLiability;
  const totalPL = totalPortfolioValue - startingBalance;
  const returnPct = (totalPL / startingBalance) * 100;

  const topGainers = [...enrichedStocks].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
  const topLosers = [...enrichedStocks].sort((a, b) => a.changePct - b.changePct).slice(0, 5);

  const dummyPortfolioHistory = useMemo(() => {
    let base = startingBalance;
    return Array.from({ length: 40 }).map((_, i) => {
      base += (Math.random() - 0.45) * 5000;
      if (i === 39) return totalPortfolioValue; 
      return base;
    });
  }, [startingBalance, totalPortfolioValue]);

  const indices = [
    { name: "NIFTY", value: 24635.70, change: 1.25 },
    { name: "SENSEX", value: 81330.56, change: 1.18 },
    { name: "BANK NIFTY", value: 52134.30, change: -0.45 },
    { name: "INDIA VIX", value: 13.45, change: -1.25 },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      
      {/* LEFT COLUMN: Watchlists Sidebar */}
      <div className="w-full lg:w-[240px] flex flex-col gap-4">
        <div className="terminal-card p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-[var(--text-main)]">Watchlists</h2>
            <button className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-[10px] text-[var(--up-color)] font-medium hover:bg-[var(--border-subtle)] transition-colors">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          
          <div className="flex flex-col gap-1 flex-1">
            <button className="flex items-center justify-between px-3 py-2 bg-[var(--bg-root)] rounded text-xs font-bold text-[var(--text-main)] border-l-2 border-[var(--up-color)]">
              <span>My Watchlist</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">{watchlist.length}</span>
            </button>
            <button className="flex items-center justify-between px-3 py-2 rounded text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-root)] transition-colors">
              <span>Banking Stocks</span>
              <span className="text-[10px] font-mono">8</span>
            </button>
            <button className="flex items-center justify-between px-3 py-2 rounded text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-root)] transition-colors">
              <span>Tech Giants</span>
              <span className="text-[10px] font-mono">7</span>
            </button>
            <button className="flex items-center justify-between px-3 py-2 rounded text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-root)] transition-colors">
              <span>Top Gainers</span>
              <span className="text-[10px] font-mono">10</span>
            </button>
          </div>

          <button className="flex items-center gap-1.5 text-[11px] text-[var(--up-color)] font-medium mt-6 pt-4 border-t border-[var(--border-subtle)] hover:underline">
            <Edit2 className="w-3 h-3" /> Edit Watchlists
          </button>
        </div>
      </div>

      {/* CENTER COLUMN: Main Content */}
      <div className="flex-1 flex flex-col gap-4 lg:gap-6 min-w-0">
        
        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="terminal-card p-4">
            <div className="text-[11px] text-[var(--text-muted)] mb-1">Total Portfolio</div>
            <div className="text-xl font-bold text-[var(--text-main)] font-mono">
              ₹{totalPortfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`text-[10px] font-mono font-medium mt-1 ${totalPL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
              {totalPL >= 0 ? "+" : ""}₹{totalPL.toLocaleString("en-IN")} ({returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%)
            </div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-[11px] text-[var(--text-muted)] mb-1">Available Cash</div>
            <div className="text-xl font-bold text-[var(--text-main)] font-mono">
              ₹{cashBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-[11px] text-[var(--text-muted)] mb-1">Today's P&L</div>
            <div className={`text-xl font-bold font-mono ${totalPL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
              {totalPL >= 0 ? "+" : ""}₹{Math.abs(totalPL).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-[11px] text-[var(--text-muted)] mb-1">Buying Power</div>
            <div className="text-xl font-bold text-[var(--text-main)] font-mono">
              ₹{cashBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Portfolio Performance Chart */}
        <div className="terminal-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-[var(--text-main)]">Portfolio Performance</h3>
            <div className="flex items-center gap-1 bg-[var(--bg-root)] p-0.5 rounded border border-[var(--border-subtle)]">
              {['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'].map((tf) => (
                <button 
                  key={tf} 
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${tf === '1M' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-[220px] w-full relative">
            <Sparkline data={dummyPortfolioHistory} isPositive={totalPL >= 0} width="100%" height={220} showArea={true} />
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between py-2 border-l border-b border-[var(--border-subtle)] opacity-50">
               {[...Array(5)].map((_, i) => (
                 <div key={i} className="w-full border-t border-dashed border-[var(--border-subtle)]"></div>
               ))}
            </div>
          </div>
          <div className="flex justify-between text-[9px] text-[var(--text-muted)] mt-2 px-2 font-mono">
             <span>22 Apr</span><span>25 Apr</span><span>28 Apr</span><span>1 May</span><span>4 May</span><span>7 May</span><span>10 May</span><span>13 May</span>
          </div>
        </div>

        {/* Bottom Split: News & Overview */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
          {/* Live Market Feed */}
          <div className="terminal-card p-4">
            <div className="flex items-center justify-between mb-4 border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-main)]">Live Market Feed</h3>
              <span className="text-[10px] text-[var(--text-muted)]">Event Count Today: <strong className="text-[var(--text-main)]">{newsEvents.length.toString().padStart(2, '0')}</strong></span>
            </div>
            <div className="space-y-4">
              {newsEvents.slice(0, 3).map(n => (
                <div key={n.id} className="flex gap-4">
                  <div className="w-14 text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap mt-0.5">
                    {new Date(n.createdAt).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-[var(--text-main)] font-medium leading-tight">{n.headline}</p>
                  </div>
                  <div>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      n.impactDirection === 'positive' ? 'bg-[#08998115] text-[var(--up-color)]' : 
                      n.impactDirection === 'negative' ? 'bg-[#f2364515] text-[var(--down-color)]' : 
                      'bg-[var(--bg-root)] text-[var(--text-muted)]'
                    }`}>
                      {n.impactDirection || 'Neutral'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/news" className="inline-flex items-center gap-1 text-[11px] text-[var(--up-color)] font-medium mt-4 hover:underline">
              View All News <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Market Overview */}
          <div className="terminal-card p-4">
            <div className="flex items-center justify-between mb-4 border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-main)]">Market Overview</h3>
            </div>
            <div className="space-y-3">
              {indices.map(ind => {
                const isUp = ind.change >= 0;
                return (
                  <div key={ind.name} className="flex items-center justify-between text-xs font-mono">
                    <div className="w-24 text-[var(--text-muted)] font-bold font-sans">{ind.name}</div>
                    <div className="w-24 text-[var(--text-main)] text-right">{ind.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    <div className={`w-16 text-right ${isUp ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
                      {isUp ? '+' : ''}{ind.change}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Top Market Leaders */}
      <div className="w-full lg:w-[280px] flex flex-col gap-4">
        <div className="terminal-card p-4 flex flex-col h-full">
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-4">Top Market Leaders</h3>
          
          <div className="flex items-center gap-4 border-b border-[var(--border-subtle)] mb-3">
            <button className="pb-2 text-xs font-bold text-[var(--text-main)] border-b-2 border-[var(--up-color)]">Gainers</button>
            <button className="pb-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Losers</button>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            {topGainers.map(s => (
              <div key={s.ticker} className="flex items-center justify-between text-xs font-mono">
                <Link to={`/stocks/${s.ticker}`} className="w-20 text-[var(--text-main)] font-bold font-sans hover:text-[var(--up-color)] transition-colors">{s.ticker}</Link>
                <div className="text-[var(--text-main)]">₹{s.currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                <div className="text-[var(--up-color)]">+{s.changePct.toFixed(2)}%</div>
              </div>
            ))}
          </div>

          <Link to="/stocks" className="inline-flex items-center gap-1 text-[11px] text-[var(--up-color)] font-medium mt-6 hover:underline">
            View All Markets <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

    </div>
  );
}