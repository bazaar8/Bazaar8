import { useLeaderboard } from "../hooks/useLeaderboard";
import { Clock, TrendingUp, TrendingDown } from "lucide-react";

export default function Leaderboard() {
  // Now we grab the countdown instead of lastUpdated
  const { rankings, countdown, loading } = useLeaderboard();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Institutional Leaderboard</h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Global Trader Rankings</p>
        </div>
        
        {/* REPLACED SYNC TIME WITH COUNTDOWN */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-card)] px-3 py-1.5 border border-[var(--border-subtle)] rounded shadow-sm">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-bold">UPDATING IN {countdown}s</span>
        </div>
      </div>
      
      <div className="terminal-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono whitespace-nowrap">
            <thead>
              <tr className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                <th className="px-6 py-4 font-bold text-center w-20">Rank</th>
                <th className="px-6 py-4 font-bold">Trader ID</th>
                <th className="px-6 py-4 font-bold text-right">Portfolio Value</th>
                <th className="px-6 py-4 font-bold text-right">P&L (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {rankings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs text-[var(--text-muted)]">
                    Rankings currently synchronizing...
                  </td>
                </tr>
              ) : (
                rankings.map((entry) => {
                  const isTop3 = entry.rank <= 3;
                  const isUp = entry.returnPct >= 0;
                  
                  return (
                    <tr key={entry.uid} className={`transition-colors ${isTop3 ? 'bg-[var(--bg-root)]' : 'hover:bg-[var(--bg-root)]'}`}>
                      <td className="px-6 py-4 text-center">
                        {isTop3 ? (
                          <span className={`inline-block w-8 py-1 rounded text-[11px] font-black ${
                            entry.rank === 1 ? 'bg-[#f59e0b20] text-[#f59e0b] border border-[#f59e0b30]' :
                            entry.rank === 2 ? 'bg-[#94a3b820] text-[#94a3b8] border border-[#94a3b830]' :
                            'bg-[#b4530920] text-[#b45309] border border-[#b4530930]'
                          }`}>
                            {entry.rank}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] font-bold">{String(entry.rank).padStart(2, '0')}</span>
                        )}
                      </td>
                      <td className={`px-6 py-4 font-sans font-bold ${isTop3 ? 'text-[var(--text-main)] text-base' : 'text-[var(--text-main)] text-sm'}`}>
                        {entry.displayName}
                      </td>
                      <td className={`px-6 py-4 text-right ${isTop3 ? 'text-[var(--text-main)] font-bold text-base' : 'text-[var(--text-main)] text-sm'}`}>
                        ₹{entry.portfolioValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center gap-1 font-bold ${isTop3 ? 'text-sm' : 'text-xs'} ${isUp ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
                          {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {isUp ? '+' : ''}{entry.returnPct.toFixed(2)}%
                        </span>
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