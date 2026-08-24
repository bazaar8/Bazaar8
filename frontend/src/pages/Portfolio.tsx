import { Link } from "react-router-dom";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { useLivePrices } from "../hooks/useLivePrices";
import { PieChart, TrendingUp, TrendingDown, ArrowRight, ListOrdered } from "lucide-react";

export default function Portfolio() {
  const { cashBalance, startingBalance, longHoldings, shortHoldings, recentOrders, loading } = useUserTradingData();
  const { prices, marketStatus } = useLivePrices();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const longMarketValue = longHoldings.reduce((sum, h) => {
    const p = prices[h.ticker]?.price ?? h.avgPrice;
    return sum + h.quantity * p;
  }, 0);

  const shortLiability = shortHoldings.reduce((sum, h) => {
    const p = prices[h.ticker]?.price ?? h.avgPrice;
    return sum + h.quantity * p;
  }, 0);

  const totalPortfolioValue = cashBalance + longMarketValue - shortLiability;
  const totalPL = totalPortfolioValue - startingBalance;
  const returnPct = (totalPL / startingBalance) * 100;

  const chartTotal = longMarketValue + cashBalance + shortLiability || 1;
  const eqPct = (longMarketValue / chartTotal) * 100;
  const cashPct = (cashBalance / chartTotal) * 100;
  const shortPct = (shortLiability / chartTotal) * 100;

  const eqDash = `${eqPct} 100`;
  const cashDash = `${cashPct} 100`;
  const shortDash = `${shortPct} 100`;
  const cashOffset = 25 - eqPct;
  const shortOffset = cashOffset - cashPct;

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
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Base: ₹{startingBalance.toLocaleString("en-IN")}</div>
        </div>

        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Available Cash</span>
          </div>
          <div className="text-xl lg:text-2xl font-bold font-mono text-[var(--text-main)]">
            ₹{cashBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Unallocated Margin</div>
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
              <circle cx="16" cy="16" r="15.9155" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray={eqDash} strokeDashoffset="25" className="transition-all duration-1000 ease-out" />
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
                <span className="text-[var(--text-main)]">Cash</span>
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
            <Link to="/orders" className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] font-mono uppercase flex items-center gap-1 transition-colors">
              All Orders <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          
          <div className="flex-1 overflow-x-auto">
            {recentOrders.length === 0 ? (
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
                      <td className="px-4 py-3 text-right text-[var(--text-main)]">₹{o.priceAtExecution?.toFixed(2) || "0.00"}</td>
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
                    const live = prices[h.ticker]?.price ?? h.avgPrice;
                    const pl = (live - h.avgPrice) * h.quantity;
                    return (
                      <tr key={h.ticker} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="px-4 py-3 font-bold">
                          <Link to={`/stocks/${h.ticker}`} className="text-[var(--text-main)] hover:text-[var(--up-color)]">{h.ticker}</Link>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">{h.quantity}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)]">₹{h.avgPrice.toFixed(2)}</td>
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
                    const live = prices[h.ticker]?.price ?? h.avgPrice;
                    const pl = (h.avgPrice - live) * h.quantity;
                    return (
                      <tr key={h.ticker} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="px-4 py-3 font-bold">
                          <Link to={`/stocks/${h.ticker}`} className="text-[var(--text-main)] hover:text-[var(--down-color)]">{h.ticker}</Link>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">{h.quantity}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)]">₹{h.avgPrice.toFixed(2)}</td>
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