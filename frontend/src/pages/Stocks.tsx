import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { STOCKS_CATALOG } from "../data/stocksData";
import Sparkline from "../components/Sparkline";
import TradeDialog from "../components/TradeDialog";
import { Search } from "lucide-react";

export default function Stocks() {
  const { prices, marketStatus } = useLivePrices();
  const { cashBalance, longHoldings, shortHoldings } = useUserTradingData();
  
  const [search, setSearch] = useState("");
  const [tradeStock, setTradeStock] = useState<any | null>(null);

  const ALL_MARKETS = useMemo(() => {
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

  const filtered = enrichedStocks.filter((s) => {
    return s.ticker.toLowerCase().includes(search.toLowerCase()) ||
           s.name.toLowerCase().includes(search.toLowerCase()) ||
           s.sector.toLowerCase().includes(search.toLowerCase());
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
              placeholder="Search ticker or sector..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 sm:w-64 pl-8 pr-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--up-color)] transition-colors rounded font-mono"
            />
          </div>
        </div>
      </div>
      
      <div className="terminal-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono whitespace-nowrap">
            <thead>
              <tr className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
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
                  <td colSpan={7} className="px-4 py-12 text-center text-xs text-[var(--text-muted)]">
                    {Object.keys(prices).length === 0 
                      ? "No ticker is added by admin yet. Awaiting market data." 
                      : "No instruments match your criteria."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const isUp = s.change >= 0;
                  
                  return (
                    <tr key={s.ticker} className="hover:bg-[var(--bg-root)] transition-colors group">
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
                          <Sparkline data={s.sparkline} isPositive={isUp} height={20} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setTradeStock(s)}
                            className="px-2.5 py-1 bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] border border-[var(--border-subtle)] text-[10px] font-bold uppercase rounded transition-colors"
                          >
                            Trade
                          </button>
                          <Link
                            to={`/stocks/${s.ticker}`}
                            className="px-2 py-1 bg-[var(--up-color)]/10 hover:bg-[var(--up-color)]/20 text-[var(--up-color)] text-[10px] font-bold uppercase rounded transition-colors"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {tradeStock && (
        <TradeDialog
          ticker={tradeStock.ticker}
          currentPrice={tradeStock.currentPrice}
          userCash={cashBalance}
          longQty={longHoldings.find((h) => h.ticker === tradeStock.ticker)?.quantity || 0}
          shortQty={shortHoldings.find((h) => h.ticker === tradeStock.ticker)?.quantity || 0}
          onClose={() => setTradeStock(null)}
        />
      )}
    </div>
  );
}