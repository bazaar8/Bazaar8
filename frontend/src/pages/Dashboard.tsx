import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { useWatchlists } from "../hooks/useWatchlists";
import { STOCKS_CATALOG } from "../data/stocksData";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label, safeStarting }: any) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    const isUp = val >= safeStarting;
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3 rounded-lg shadow-xl">
        <p className="text-[10px] text-[var(--text-main)] font-bold mb-1">{label}</p>
        <p className={`text-xs font-mono font-bold ${isUp ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
          Net Worth : ₹{val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { prices, marketStatus } = useLivePrices();
  const { cashBalance, startingBalance, longHoldings, shortHoldings } = useUserTradingData();
  const { watchlists } = useWatchlists();
  
  const [newsEvents, setNewsEvents] = useState<any[]>([]);
  const [showGainers, setShowGainers] = useState(true);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [liveChartData, setLiveChartData] = useState<{time: string, value: number}[]>([]);

  useEffect(() => {
    if (watchlists.length > 0 && !activeListId) setActiveListId(watchlists[0].id);
    else if (watchlists.length === 0) setActiveListId(null);
  }, [watchlists, activeListId]);

  const activeList = watchlists.find(w => w.id === activeListId);

  useEffect(() => {
    const q = query(collection(db, "newsEvents"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const allNews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNewsEvents(allNews);
    });
    return () => unsub();
  }, []);

  const allMarkets = useMemo(() => {
    return Object.entries(prices).map(([ticker, data]: [string, any]) => {
      const catalogStock = STOCKS_CATALOG.find(s => s.ticker === ticker);
      return {
        ticker,
        name: data.name || catalogStock?.name || ticker,
        basePrice: data.basePrice || catalogStock?.basePrice || data.price || 0,
      };
    });
  }, [prices]);

  const enrichedStocks = allMarkets.map((s) => {
    const live = prices[s.ticker]?.price ?? s.basePrice;
    const diff = live - s.basePrice;
    const pct = s.basePrice > 0 ? (diff / s.basePrice) * 100 : 0;
    return { ...s, currentPrice: live, change: diff, changePct: pct };
  });

  const safeCash = isNaN(Number(cashBalance)) ? 0 : Number(cashBalance);
  const safeStarting = isNaN(Number(startingBalance)) || Number(startingBalance) === 0 ? 1000000 : Number(startingBalance);

  const longMarketValue = longHoldings.reduce((sum, h) => sum + h.quantity * (prices[h.ticker]?.price ?? h.avgPrice), 0);
  const shortLiability = shortHoldings.reduce((sum, h) => sum + h.quantity * (prices[h.ticker]?.price ?? h.avgPrice), 0);
  
  const totalPortfolioValue = safeCash + longMarketValue - shortLiability;
  const totalPL = totalPortfolioValue - safeStarting;
  const returnPct = (totalPL / safeStarting) * 100;

  useEffect(() => {
    if (totalPortfolioValue === 0) return;
    setLiveChartData(prev => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      if (prev.length > 0 && prev[prev.length - 1].time === timeStr && prev[prev.length - 1].value === totalPortfolioValue) return prev;
      const newData = [...prev, { time: timeStr, value: totalPortfolioValue }];
      if (newData.length > 40) newData.shift();
      return newData;
    });
  }, [totalPortfolioValue]);

  useEffect(() => {
    if (liveChartData.length === 0 && totalPortfolioValue > 0) {
      const now = new Date();
      const tenMinsAgo = new Date(now.getTime() - 10 * 60000);
      setLiveChartData([
        { time: tenMinsAgo.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }), value: safeStarting },
        { time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }), value: totalPortfolioValue }
      ]);
    }
  }, [totalPortfolioValue, safeStarting, liveChartData.length]);

  const topGainers = [...enrichedStocks].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
  const topLosers = [...enrichedStocks].sort((a, b) => a.changePct - b.changePct).slice(0, 5);
  const displayList = showGainers ? topGainers : topLosers;
  
  const chartColor = totalPL >= 0 ? 'var(--up-color)' : 'var(--down-color)';

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className="flex-1 flex flex-col gap-4 lg:gap-6 min-w-0">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="terminal-card bg-[var(--bg-card)] p-4 border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Total Portfolio</div>
            <div className="text-xl font-bold text-[var(--text-main)] font-mono">
              ₹{totalPortfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`text-[10px] font-mono font-bold mt-1 ${totalPL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
              {totalPL >= 0 ? "+" : ""}₹{totalPL.toLocaleString("en-IN")} ({returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%)
            </div>
          </div>
          <div className="terminal-card bg-[var(--bg-card)] p-4 border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Starting Capital</div>
            <div className="text-xl font-bold text-[var(--text-main)] font-mono">
              ₹{safeStarting.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Base Benchmark</div>
          </div>
          <div className="terminal-card bg-[var(--bg-card)] p-4 border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Today's P&L</div>
            <div className={`text-xl font-bold font-mono flex items-center gap-1 ${totalPL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
              {totalPL >= 0 ? <TrendingUp className="w-4 h-4"/> : <TrendingDown className="w-4 h-4"/>}
              {totalPL >= 0 ? "+" : ""}₹{Math.abs(totalPL).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="terminal-card bg-[var(--bg-card)] p-4 border border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Available Cash</div>
            <div className="text-xl font-bold text-[var(--text-main)] font-mono">
              ₹{safeCash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Buying Power</div>
          </div>
        </div>

        <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-[var(--border-subtle)] pb-4">
            <h3 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2 tracking-widest uppercase">
              {totalPL >= 0 ? <TrendingUp className="w-5 h-5 text-[var(--up-color)]" /> : <TrendingDown className="w-5 h-5 text-[var(--down-color)]" />}
              Portfolio Net Worth Trajectory
            </h3>
            <div className={`px-4 py-1.5 rounded text-sm font-black font-mono border ${totalPL >= 0 ? 'bg-[var(--up-color)]/10 text-[var(--up-color)] border-[var(--up-color)]' : 'bg-[var(--down-color)]/10 text-[var(--down-color)] border-[var(--down-color)]'}`}>
              ₹{totalPortfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="flex-1 min-h-[280px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={liveChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickMargin={10} minTickGap={30} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(val) => `₹${(val).toLocaleString()}`} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip safeStarting={safeStarting} />} />
                <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" isAnimationActive={true} animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
          <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4">
            <div className="flex items-center justify-between mb-4 border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-main)]">Live Market Feed</h3>
              <span className="text-[10px] text-[var(--text-muted)]">Event Count: <strong className="text-[var(--text-main)]">{newsEvents.length.toString().padStart(2, '0')}</strong></span>
            </div>
            <div className="space-y-4">
              {newsEvents.length === 0 ? (
                <div className="text-xs font-mono text-[var(--text-muted)] text-center py-6">No news events logged.</div>
              ) : (
                newsEvents.slice(0, 3).map(n => (
                  <div key={n.id} className="flex gap-4">
                    <div className="w-14 text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap mt-0.5">
                      {new Date(n.startTime || n.createdAt).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-[var(--text-main)] font-medium leading-tight">{n.headline}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link to="/news" className="inline-flex items-center gap-1 text-[11px] text-[var(--up-color)] font-medium mt-4 hover:underline">
              View All News <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3 border-b border-[var(--border-subtle)] pb-2">
              <h2 className="text-sm font-bold text-[var(--text-main)]">Watchlists</h2>
              <Link to="/watchlists" className="text-[10px] text-[var(--up-color)] font-medium hover:underline">Manage</Link>
            </div>
            
            <select
              value={activeListId || ""}
              onChange={(e) => setActiveListId(e.target.value)}
              className="w-full bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-bold p-2 rounded mb-3 focus:outline-none"
            >
              {watchlists.length === 0 && <option value="">No lists found</option>}
              {watchlists.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto max-h-[160px]">
              {!activeList || activeList.tickers.length === 0 ? (
                <div className="text-[10px] text-[var(--text-muted)] font-mono text-center py-4">No tickers in this list.</div>
              ) : (
                activeList.tickers.map(ticker => {
                  const stock = enrichedStocks.find(s => s.ticker === ticker);
                  if (!stock) return null;
                  const isUp = stock.change >= 0;
                  return (
                    <Link key={ticker} to={`/stocks/${ticker}`} className="flex items-center justify-between px-3 py-2 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)] hover:border-[var(--up-color)] transition-colors group">
                      <span className="text-xs font-bold text-[var(--text-main)] group-hover:text-[var(--up-color)]">{ticker}</span>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-mono text-[var(--text-main)]">₹{stock.currentPrice.toFixed(2)}</span>
                        <span className={`text-[9px] font-mono font-bold ${isUp ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
                          {isUp ? '+' : ''}{stock.changePct.toFixed(2)}%
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[280px] flex flex-col gap-4">
        <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 flex flex-col h-full">
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-4">Market Movers</h3>
          <div className="flex items-center gap-4 border-b border-[var(--border-subtle)] mb-3">
            <button 
              onClick={() => setShowGainers(true)}
              className={`pb-2 text-xs font-bold transition-colors ${showGainers ? 'text-[var(--text-main)] border-b-2 border-[var(--up-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border-b-2 border-transparent'}`}
            >
              Gainers
            </button>
            <button 
              onClick={() => setShowGainers(false)}
              className={`pb-2 text-xs font-bold transition-colors ${!showGainers ? 'text-[var(--text-main)] border-b-2 border-[var(--down-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border-b-2 border-transparent'}`}
            >
              Losers
            </button>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            {displayList.map(s => (
              <div key={s.ticker} className="flex items-center justify-between text-xs font-mono">
                <Link to={`/stocks/${s.ticker}`} className="w-20 text-[var(--text-main)] font-bold font-sans hover:text-[var(--up-color)] transition-colors">{s.ticker}</Link>
                <div className="text-[var(--text-main)]">₹{s.currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                <div className={`font-bold ${s.changePct >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                  {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                </div>
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