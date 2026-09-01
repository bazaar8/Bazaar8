import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { STOCKS_CATALOG } from "../data/stocksData";
import { API_URL } from "../config/api";
import { socket } from "../config/socket";
import { 
  Flame, 
  Newspaper, 
  ArrowRight, 
  Wallet, 
  Layers, 
  Search
} from "lucide-react";
import DashboardWishlists from "../components/DashboardWishlists";

export default function Dashboard() {
  const { prices } = useLivePrices();
  const { cashBalance, startingBalance, longHoldings, shortHoldings } = useUserTradingData();
  
  const [newsEvents, setNewsEvents] = useState<any[]>([]);
  const [showGainers, setShowGainers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [animatedCash, setAnimatedCash] = useState(0);

  // REST API + WebSocket Listener for News
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const token = localStorage.getItem("bazaar_jwt_token");
        const res = await fetch(`${API_URL}/news`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.data) {
          const activeNews = json.data
            .filter((evt: any) => evt.status === 'active' || evt.status === 'completed')
            .sort((a: any, b: any) => (b.startTime || b.createdAt || 0) - (a.startTime || a.createdAt || 0));
          setNewsEvents(activeNews);
        }
      } catch (err) {
        console.error("Failed to fetch news:", err);
      }
    };

    fetchNews();

    const handleNewsUpdate = () => fetchNews();
    socket.on("newsUpdate", handleNewsUpdate);

    return () => {
      socket.off("newsUpdate", handleNewsUpdate);
    };
  }, []);

  const allMarkets = useMemo(() => {
    return Object.entries(prices).map(([ticker, data]: [string, any]) => {
      const catalogStock = STOCKS_CATALOG.find(s => s.ticker === ticker);
      const basePrice = Number(data.basePrice || catalogStock?.basePrice || data.price || 0);
      const currentPrice = Number(data.price ?? basePrice);
      const change = currentPrice - basePrice;
      const changePct = basePrice > 0 ? (change / basePrice) * 100 : 0;

      return {
        ticker,
        name: data.name || catalogStock?.name || ticker,
        sector: data.sector || catalogStock?.sector || "General",
        basePrice,
        currentPrice,
        change,
        changePct
      };
    });
  }, [prices]);

  // Financial calculations
  const safeCash = isNaN(Number(cashBalance)) ? 0 : Number(cashBalance);
  const safeStarting = isNaN(Number(startingBalance)) || Number(startingBalance) === 0 ? 1000000 : Number(startingBalance);
  const longMarketValue = longHoldings.reduce((sum, h) => sum + h.quantity * (prices[h.ticker]?.price ?? h.avgPrice), 0);
  const shortLiability = shortHoldings.reduce((sum, h) => sum + h.quantity * (prices[h.ticker]?.price ?? h.avgPrice), 0);
  const totalPortfolioValue = safeCash + longMarketValue - shortLiability;
  const totalPL = totalPortfolioValue - safeStarting;
  const returnPct = (totalPL / safeStarting) * 100;

  // Realistic Counting Money Animation on visiting the page
  useEffect(() => {
    if (safeCash <= 0) {
      setAnimatedCash(0);
      return;
    }
    let startTimestamp: number | null = null;
    const duration = 1200; 
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setAnimatedCash(Math.floor(easeOut * safeCash));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setAnimatedCash(safeCash);
      }
    };
    const animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [safeCash]);

  const topGainers = [...allMarkets].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
  const topLosers = [...allMarkets].sort((a, b) => a.changePct - b.changePct).slice(0, 5);
  const displayMovers = showGainers ? topGainers : topLosers;

  const filteredStocks = searchQuery.trim() 
    ? allMarkets.filter(s => s.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || s.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto w-full pb-10">
      
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Quick search equities by symbol or company (e.g. RELIANCE, TCS, INFY)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--up-color)] transition-all shadow-sm"
          />
        </div>

        {filteredStocks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 p-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg">
            {filteredStocks.map(s => (
              <Link
                key={s.ticker}
                to={`/stocks/${s.ticker}`}
                className="p-2 bg-[var(--bg-root)] hover:border-[var(--up-color)]/50 rounded-lg border border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono transition-colors group"
              >
                <span className="font-bold text-[var(--text-main)] group-hover:text-[var(--up-color)]">{s.ticker}</span>
                <span className="text-[var(--up-color)] font-bold">₹{s.currentPrice.toFixed(0)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="relative overflow-hidden terminal-card bg-gradient-to-r from-[var(--bg-card)] via-[#0899810a] to-[var(--bg-card)] border border-[var(--up-color)]/30 p-5 sm:p-6 rounded-2xl shadow-[0_0_35px_rgba(8,153,129,0.12)]">
        
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--up-color)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--up-color)]/10 border border-[var(--up-color)]/30 flex items-center justify-center text-[var(--up-color)] flex-shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Available Trading Cash
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[var(--up-color)]/15 text-[var(--up-color)] font-bold border border-[var(--up-color)]/30">
                  LIQUID MARGIN
                </span>
              </div>

              <div className="text-3xl sm:text-4xl lg:text-5xl font-mono font-black text-[var(--up-color)] mt-1 tracking-tight">
                ₹{animatedCash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 border-t md:border-t-0 md:border-l border-[var(--border-subtle)] pt-3 md:pt-0 md:pl-6">
            <div>
              <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] block">Net Portfolio Value</span>
              <span className="text-base sm:text-lg font-mono font-bold text-[var(--text-main)]">
                ₹{totalPortfolioValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] block">Total Return</span>
              <span className={`text-base sm:text-lg font-mono font-bold flex items-center gap-1 ${
                totalPL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"
              }`}>
                {totalPL >= 0 ? "+" : ""}₹{totalPL.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ({returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%)
              </span>
            </div>

            <Link
              to="/stocks"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--up-color)] text-white text-xs font-bold uppercase rounded-lg hover:opacity-90 transition-opacity shadow-sm"
            >
              <span>Trade Stocks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--up-color)]" />
            <h2 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
              Quick Check: Open Positions
            </h2>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              ({longHoldings.length + shortHoldings.length} Active)
            </span>
          </div>
          <Link to="/portfolio" className="text-xs font-mono text-[var(--up-color)] hover:underline flex items-center gap-1">
            View Ledger <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {longHoldings.length === 0 && shortHoldings.length === 0 ? (
          <div className="text-center py-8 text-xs font-mono text-[var(--text-muted)] space-y-2">
            <div>No open positions currently active.</div>
            <Link to="/stocks" className="inline-block text-[var(--up-color)] font-bold hover:underline">
              Explore Markets to Buy Stocks →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {longHoldings.map(h => {
              const live = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
              const pl = (live - Number(h.avgPrice)) * Number(h.quantity);
              const isUp = pl >= 0;

              return (
                <div key={h.ticker} className="p-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between gap-2.5 hover:border-[var(--up-color)]/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <Link to={`/stocks/${h.ticker}`} className="text-sm font-bold text-[var(--text-main)] hover:text-[var(--up-color)] transition-colors">
                      {h.ticker}
                    </Link>
                    <span className="text-[10px] font-mono font-bold text-[var(--up-color)] bg-[var(--up-color)]/10 px-2 py-0.5 rounded-full">
                      +{h.quantity} LONG
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[var(--text-muted)]">Entry: ₹{Number(h.avgPrice).toFixed(2)}</span>
                    <span className="text-[var(--text-main)]">Live: ₹{live.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-xs font-mono">
                    <span className="text-[var(--text-muted)]">Position P&L:</span>
                    <span className={`font-bold ${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                      {isUp ? "+" : ""}₹{pl.toFixed(2)}
                    </span>
                  </div>
                  <Link 
                    to={`/stocks/${h.ticker}`}
                    className="w-full text-center py-1 text-[10px] font-mono font-bold uppercase rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-[var(--down-color)] hover:text-white transition-colors"
                  >
                    Sell / Manage {h.ticker}
                  </Link>
                </div>
              );
            })}

            {shortHoldings.map(h => {
              const live = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
              const pl = (Number(h.avgPrice) - live) * Number(h.quantity);
              const isUp = pl >= 0;

              return (
                <div key={h.ticker} className="p-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between gap-2.5 hover:border-[var(--down-color)]/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <Link to={`/stocks/${h.ticker}`} className="text-sm font-bold text-[var(--text-main)] hover:text-[var(--down-color)] transition-colors">
                      {h.ticker}
                    </Link>
                    <span className="text-[10px] font-mono font-bold text-[var(--down-color)] bg-[var(--down-color)]/10 px-2 py-0.5 rounded-full">
                      -{h.quantity} SHORT
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[var(--text-muted)]">Entry: ₹{Number(h.avgPrice).toFixed(2)}</span>
                    <span className="text-[var(--text-main)]">Live: ₹{live.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-xs font-mono">
                    <span className="text-[var(--text-muted)]">Position P&L:</span>
                    <span className={`font-bold ${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                      {isUp ? "+" : ""}₹{pl.toFixed(2)}
                    </span>
                  </div>
                  <Link 
                    to={`/stocks/${h.ticker}`}
                    className="w-full text-center py-1 text-[10px] font-mono font-bold uppercase rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-[var(--up-color)] hover:text-white transition-colors"
                  >
                    Cover / Manage {h.ticker}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Market Movers
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowGainers(true)}
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded transition-colors ${
                  showGainers ? "bg-[var(--up-color)]/20 text-[var(--up-color)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                Top Gainers
              </button>
              <button
                onClick={() => setShowGainers(false)}
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded transition-colors ${
                  !showGainers ? "bg-[var(--down-color)]/20 text-[var(--down-color)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                Top Losers
              </button>
            </div>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] flex-1">
            {displayMovers.map(s => (
              <Link 
                key={s.ticker}
                to={`/stocks/${s.ticker}`}
                className="py-3 flex items-center justify-between hover:bg-[var(--bg-root)] px-2 rounded-lg transition-colors group"
              >
                <div>
                  <span className="font-bold text-xs text-[var(--text-main)] group-hover:text-[var(--up-color)] transition-colors">
                    {s.ticker}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] block">
                    {s.name}
                  </span>
                </div>

                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-[var(--text-main)]">
                    ₹{s.currentPrice.toFixed(2)}
                  </div>
                  <div className={`text-[11px] font-bold ${s.changePct >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                    {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Link
            to="/stocks"
            className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-xs font-mono text-[var(--up-color)] hover:underline flex items-center justify-center gap-1 font-bold"
          >
            View All 50+ Stocks <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[#3b82f6]" />
              <h3 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Market News
              </h3>
            </div>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              {newsEvents.length} Stories
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px]">
            {newsEvents.length === 0 ? (
              <div className="text-center py-12 text-xs font-mono text-[var(--text-muted)]">
                No active news stories broadcasted yet.
              </div>
            ) : (
              newsEvents.map(item => {
                return (
                  <div key={item.eventId || item._id} className="p-3 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-xl flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        BREAKING
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {new Date(item.startTime || item.createdAt || Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[var(--text-main)] leading-snug">
                      {item.headline}
                    </p>

                    {item.targetTickers && item.targetTickers.length > 0 && (
                      <div className="flex gap-1.5 mt-0.5">
                        {item.targetTickers.map((t: string) => (
                          <Link
                            key={t}
                            to={`/stocks/${t}`}
                            className="text-[10px] font-mono font-bold px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded text-[var(--up-color)] hover:border-[var(--up-color)] transition-colors"
                          >
                            ${t}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      <DashboardWishlists prices={prices} />

    </div>
  );
}