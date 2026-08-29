import { useLeaderboard } from "../hooks/useLeaderboard";
import { Trophy } from "lucide-react";

export default function Leaderboard() {
  const { rankings, loading } = useLeaderboard();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Cast to any[] to bypass TypeScript errors for missing type definitions
  const typedRankings = rankings as any[];
  const topThree = typedRankings.slice(0, 3);
  const rest = typedRankings.slice(3);

  // Helper function to extract the best available name from Firebase data
  const getTraderName = (user: any) => {
    return user?.displayName || user?.name || user?.email?.split('@')[0] || user?.id || "Unknown Trader";
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Institutional Leaderboard</h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Bulls and Bears Trader Rankings</p>
        </div>
      </div>

      {/* Podium Section for Top 3 */}
      {topThree.length > 0 && (
        <div className="flex items-end justify-center gap-3 sm:gap-6 pt-10 pb-6">
          {/* 2nd Place */}
          {topThree[1] && (
            <div className="flex flex-col items-center w-28 sm:w-36">
              <div className="flex flex-col items-center mb-3 text-center px-1">
                <span className="text-xs font-bold text-[var(--text-main)] truncate max-w-[110px]">
                  {getTraderName(topThree[1])}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  ₹{topThree[1].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${topThree[1].pnl >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                  {topThree[1].pnl >= 0 ? "+" : ""}{topThree[1].pnl?.toFixed(2)}%
                </span>
              </div>
              <div className="w-full h-28 bg-[var(--bg-card)] border border-[var(--border-subtle)] border-b-0 rounded-t-xl flex flex-col items-center justify-start pt-3 shadow-lg">
                <span className="text-xl font-black text-[var(--text-muted)]">2</span>
              </div>
            </div>
          )}

          {/* 1st Place */}
          {topThree[0] && (
            <div className="flex flex-col items-center w-32 sm:w-40 z-10">
              <div className="flex flex-col items-center mb-3 text-center px-1">
                <Trophy className="w-6 h-6 text-amber-400 mb-1 animate-bounce" />
                <span className="text-sm font-bold text-[var(--text-main)] truncate max-w-[130px]">
                  {getTraderName(topThree[0])}
                </span>
                <span className="text-xs font-mono font-bold text-[var(--text-main)]">
                  ₹{topThree[0].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-xs font-mono font-bold flex items-center gap-0.5 ${topThree[0].pnl >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                  {topThree[0].pnl >= 0 ? "+" : ""}{topThree[0].pnl?.toFixed(2)}%
                </span>
              </div>
              <div className="w-full h-40 bg-[var(--bg-card)] border-2 border-amber-400/60 border-b-0 rounded-t-xl flex flex-col items-center justify-start pt-3 shadow-[0_-4px_20px_rgba(251,191,36,0.1)]">
                <span className="text-3xl font-black text-amber-400">1</span>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {topThree[2] && (
            <div className="flex flex-col items-center w-28 sm:w-36">
              <div className="flex flex-col items-center mb-3 text-center px-1">
                <span className="text-xs font-bold text-[var(--text-main)] truncate max-w-[110px]">
                  {getTraderName(topThree[2])}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  ₹{topThree[2].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${topThree[2].pnl >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                  {topThree[2].pnl >= 0 ? "+" : ""}{topThree[2].pnl?.toFixed(2)}%
                </span>
              </div>
              <div className="w-full h-20 bg-[var(--bg-card)] border border-[var(--border-subtle)] border-b-0 rounded-t-xl flex flex-col items-center justify-start pt-3 shadow-md">
                <span className="text-lg font-black text-[var(--text-muted)]">3</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ranks 4+ Table List */}
      <div className="terminal-card overflow-hidden">
        <table className="w-full text-left text-xs font-mono whitespace-nowrap">
          <thead>
            <tr className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
              <th className="px-6 py-3 font-bold text-center w-16">Rank</th>
              <th className="px-6 py-3 font-bold">Trader Name</th>
              <th className="px-6 py-3 font-bold text-right">Portfolio Value</th>
              <th className="px-6 py-3 font-bold text-right">Total P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rest.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-xs text-[var(--text-muted)]">
                  {rankings.length <= 3 ? "No additional traders on leaderboard." : "Loading..."}
                </td>
              </tr>
            ) : (
              rest.map((user, idx) => (
                <tr key={user.id || idx} className="hover:bg-[var(--bg-root)] transition-colors">
                  <td className="px-6 py-3.5 text-center font-bold text-[var(--text-muted)]">
                    {idx + 4}
                  </td>
                  <td className="px-6 py-3.5 font-sans font-bold text-[var(--text-main)]">
                    {getTraderName(user)}
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono text-[var(--text-main)]">
                    ₹{user.portfolioValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={`px-6 py-3.5 text-right font-mono font-bold ${user.pnl >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                    {user.pnl >= 0 ? "+" : ""}{user.pnl?.toFixed(2)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}