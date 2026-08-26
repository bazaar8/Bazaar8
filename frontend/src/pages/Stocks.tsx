import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useWatchlists } from "../hooks/useWatchlists";
import { STOCKS_CATALOG } from "../data/stocksData";
import Sparkline from "../components/Sparkline";
import { Search, Filter, Star, X } from "lucide-react";

export default function Stocks() {
  const { prices, marketStatus } = useLivePrices();
  // We pull addStock and removeStock directly from your hook!
  const { watchlists, addStock, removeStock } = useWatchlists();
  
  const [search, setSearch] = useState("");
  const [selectedListId, setSelectedListId] = useState("ALL"); 
  
  // New state to control our popup menu
  const [managingTicker, setManagingTicker] = useState<string | null>(null);

  const ALL_MARKETS = useMemo(() => {
    // ONLY load stocks that actually exist in the live Firebase prices database
    return Object.entries(prices).map(([ticker, data]: [string, any]) => {
      const catalogStock = STOCKS_CATALOG.find(s => s.ticker === ticker);
      return {
        ticker,
        name: data.name || catalogStock?.name || ticker,
        sector: data.sector || catalogStock?.sector || "General",
        basePrice: data.basePrice || data.price || 0
      };
    });
  }, [prices]);

  const enrichedStocks = ALL_MARKETS.map((s) => {
    const live = prices[s.ticker]?.price ?? s.basePrice;
    const diff = live - s.basePrice;
    const pct = (diff / s.basePrice) * 100;
    const spark = [s.basePrice, s.basePrice * 0.997, s.basePrice * 1.004, live * 0.999, live];
    return { ...s, currentPrice: live, change: diff, changePct: pct, sparkline: spark };
  });

  const activeList = watchlists.find(w => w.id === selectedListId);

  // Filter by Search text AND selected Watchlist
  const filtered = enrichedStocks.filter((s) => {
    const matchSearch =
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase());
      
    const matchWatchlist = selectedListId === "ALL" || (activeList && activeList.tickers.includes(s.ticker));
    
    return matchSearch && matchWatchlist;
  });

  return (
    <div className="flex flex-col gap-4 lg:gap-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Market Screener</h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Live NSE Equities Directory</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase bg-[var(--bg-card)] px-2 py-1.5 border border-[var(--border-subtle)] rounded hidden sm:block">
            MARKET: {marketStatus}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 sm:w-48 pl-8 pr-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--up-color)] transition-colors rounded"
            />
          </div>
          
          <div className="flex items-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded transition-colors">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
              className="bg-transparent text-[var(--text-main)] text-xs focus:outline-none cursor-pointer font-medium max-w-[120px]"
            >
              <option value="ALL" className="bg-[var(--bg-card)] text-[var(--text-main)]">
                All Markets
              </option>
              {watchlists.map((w) => (
                <option key={w.id} value={w.id} className="bg-[var(--bg-card)] text-[var(--text-main)]">
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          
        </div>
      </div>
      
      <div className="terminal-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono whitespace-nowrap">
            <thead>
              <tr className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                <th className="px-4 py-3 font-bold text-center w-10"></th>
                <th className="px-4 py-3 font-bold">Instrument</th>
                <th className="px-4 py-3 font-bold">Sector</th>
                <th className="px-4 py-3 font-bold text-right">Base Price</th>
                <th className="px-4 py-3 font-bold text-right">Live Price</th>
                <th className="px-4 py-3 font-bold text-right">Change</th>
                <th className="px-4 py-3 font-bold text-center w-32">Trend (1H)</th>
                <th className="px-4 py-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-[var(--text-muted)]">
                    {Object.keys(prices).length === 0 
                      ? "No ticker is added by admin yet. Awaiting market data." 
                      : "No instruments match your criteria."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const isUp = s.change >= 0;
                  const isSaved = watchlists.some(w => w.tickers.includes(s.ticker));
                  
                  return (
                    <tr key={s.ticker} className="hover:bg-[var(--bg-root)] transition-colors group">
                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => setManagingTicker(s.ticker)} // <-- Opens the popup menu
                          className="p-1 hover:bg-[var(--bg-card)] rounded transition-colors focus:outline-none"
                          title="Manage Watchlists"
                        >
                          <Star className={`w-4 h-4 transition-colors ${isSaved ? "text-[#f59e0b] fill-[#f59e0b]" : "text-[var(--border-subtle)] hover:text-[#f59e0b]"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/stocks/${s.ticker}`} className="block">
                          <span className="font-bold text-[var(--text-main)] group-hover:text-[var(--up-color)] transition-colors">{s.ticker}</span>
                          <span className="block text-[9px] font-sans text-[var(--text-muted)] uppercase tracking-wider">{s.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)] uppercase">{s.sector.split(' ')[0]}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-muted)]">
                        ₹{s.basePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-main)] text-sm">
                        ₹{s.currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                        {isUp ? "+" : ""}{s.changePct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="w-24 mx-auto">
                          <Sparkline data={s.sparkline} isPositive={isUp} width="100%" height={24} showArea={false} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/stocks/${s.ticker}`}
                          className="inline-block px-3 py-1.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] text-[10px] font-bold uppercase rounded transition-colors"
                        >
                          Trade
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* WATCHLIST MANAGER POPUP */}
      {managingTicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="terminal-card max-w-sm w-full p-4 shadow-2xl">
            
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] mb-4">
              <h3 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
                <Star className="w-4 h-4 text-[#f59e0b] fill-[#f59e0b]" /> 
                Save {managingTicker}
              </h3>
              <button onClick={() => setManagingTicker(null)} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {watchlists.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] font-mono text-center py-6">
                  No watchlists available.<br/>Go to the Watchlists tab to create one.
                </div>
              ) : (
                watchlists.map(w => {
                  const isSaved = w.tickers.includes(managingTicker);
                  return (
                    <button 
                      key={w.id}
                      onClick={() => {
                        if (isSaved) removeStock(w.id, managingTicker);
                        else addStock(w.id, managingTicker);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded border transition-colors ${
                        isSaved 
                          ? "bg-[#f59e0b15] border-[#f59e0b50]" 
                          : "bg-[var(--bg-root)] border-[var(--border-subtle)] hover:border-[var(--text-muted)]"
                      }`}
                    >
                      <span className={`text-xs font-bold ${isSaved ? "text-[#f59e0b]" : "text-[var(--text-main)]"}`}>
                        {w.name}
                      </span>
                      <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                        isSaved ? "bg-[#f59e0b] border-[#f59e0b]" : "border-[var(--text-muted)]"
                      }`}>
                        {isSaved && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3 text-white">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            
            <button 
              onClick={() => setManagingTicker(null)} 
              className="w-full mt-4 py-2.5 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] border border-[var(--border-subtle)] text-xs font-bold uppercase rounded transition-colors"
            >
              Done
            </button>
            
          </div>
        </div>
      )}
    </div>
  );
}