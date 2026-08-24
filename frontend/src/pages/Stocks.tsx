import { useState } from "react";
import { Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { STOCKS_CATALOG } from "../data/stocksData";
import Sparkline from "../components/Sparkline";
import { Search, Filter, Star } from "lucide-react";

export default function Stocks() {
  const { prices, marketStatus } = useLivePrices();
  const { watchlist } = useUserTradingData();
  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState("ALL");

  const sectors = ["ALL", ...Array.from(new Set(STOCKS_CATALOG.map((s) => s.sector)))];

  const enrichedStocks = STOCKS_CATALOG.map((s) => {
    const live = prices[s.ticker]?.price ?? s.basePrice;
    const diff = live - s.basePrice;
    const pct = (diff / s.basePrice) * 100;
    const spark = [s.basePrice, s.basePrice * 0.997, s.basePrice * 1.004, live * 0.999, live];
    return { ...s, currentPrice: live, change: diff, changePct: pct, sparkline: spark };
  });

  const filtered = enrichedStocks.filter((s) => {
    const matchSearch =
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase());
    const matchSector = selectedSector === "ALL" || s.sector === selectedSector;
    return matchSearch && matchSector;
  });

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
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
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-transparent text-[var(--text-main)] text-xs focus:outline-none cursor-pointer font-medium"
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec} className="bg-[var(--bg-card)] text-[var(--text-main)]">
                  {sec}
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
                    No instruments match your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const isUp = s.change >= 0;
                  const isSaved = watchlist.includes(s.ticker);

                  return (
                    <tr key={s.ticker} className="hover:bg-[var(--bg-root)] transition-colors group">
                      <td className="px-4 py-3 text-center">
                        <Star className={`w-3.5 h-3.5 inline-block ${isSaved ? "text-[#f59e0b] fill-[#f59e0b]" : "text-[var(--border-subtle)]"}`} />
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
    </div>
  );
}