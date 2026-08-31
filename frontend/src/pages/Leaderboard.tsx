import { useEffect } from "react";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Crown, 
  Shield, 
  Flame
} from "lucide-react";

export default function Leaderboard() {
  const { rankings, loading } = useLeaderboard();

  // Background 8-second refresh
  useEffect(() => {
    const timer = setInterval(() => {
      // Periodic trigger
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const typedRankings = rankings as any[];
  const topThree = typedRankings.slice(0, 3);
  const rest = typedRankings.slice(3);

  const getTraderName = (user: any) => {
    return user?.displayName || user?.name || user?.email?.split('@')[0] || user?.id || "Trader";
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col gap-6 pb-12 max-w-5xl mx-auto w-full">
      
      {/* 1. CLEAN HEADER (No 'Live Rankings', No Timer, Refined Size) */}
      <div className="text-center border-b border-[var(--border-subtle)] pb-4">
        <h1 className="text-2xl font-black text-[var(--text-main)] tracking-tight">
          Bazaar 8.0
        </h1>
        <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
          Standings & Portfolio Equity
        </p>
      </div>

      {/* 2. REFINED TOP 3 PODIUM (Clean, Elegant, Smaller Text, No Gimmicks) */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-2 pb-2">
          
          {/* #2 SILVER (Left) */}
          {topThree[1] && (
            <div className="order-2 sm:order-1 relative group">
              <div className="bg-[var(--bg-card)] border border-slate-400/30 rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center shadow-lg hover:border-slate-300 transition-colors">
                
                <div className="relative mb-2.5">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-500 p-[2px] shadow">
                    <div className="w-full h-full bg-[#0d1117] rounded-2xl flex items-center justify-center font-bold text-sm text-slate-200">
                      {getInitials(getTraderName(topThree[1]))}
                    </div>
                  </div>
                  <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-slate-300 text-black font-black text-xs flex items-center justify-center shadow">
                    2
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider mb-1">
                  <Shield className="w-3 h-3 text-slate-400" />
                  <span>Rank 2</span>
                </div>

                <h3 className="text-sm font-bold text-[var(--text-main)] truncate max-w-[180px]">
                  {getTraderName(topThree[1])}
                </h3>

                <div className="text-base font-mono font-bold text-[var(--text-main)] mt-1">
                  ₹{topThree[1].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>

                <div className={`text-xs font-mono font-bold flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full ${
                  topThree[1].pnl >= 0 ? "bg-[var(--up-color)]/15 text-[var(--up-color)]" : "bg-[var(--down-color)]/15 text-[var(--down-color)]"
                }`}>
                  {topThree[1].pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{topThree[1].pnl >= 0 ? "+" : ""}{topThree[1].pnl?.toFixed(2)}%</span>
                </div>

              </div>
            </div>
          )}

          {/* #1 GOLD (Center, Elevated) */}
          {topThree[0] && (
            <div className="order-1 sm:order-2 relative group sm:-translate-y-2">
              <div className="bg-gradient-to-b from-[var(--bg-card)] via-[var(--bg-card)] to-[#141005] border-2 border-amber-400/80 rounded-2xl p-5 sm:p-6 flex flex-col items-center text-center shadow-[0_0_30px_rgba(251,191,36,0.15)]">
                
                <div className="relative mb-2.5">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-300 to-amber-500 p-[2px] shadow-[0_0_15px_rgba(251,191,36,0.4)]">
                    <div className="w-full h-full bg-[#120d04] rounded-2xl flex items-center justify-center font-black text-base text-amber-300">
                      {getInitials(getTraderName(topThree[0]))}
                    </div>
                  </div>
                  <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 text-black font-black text-xs flex items-center justify-center shadow">
                    1
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider mb-1">
                  <Crown className="w-3 h-3 fill-current text-amber-400" />
                  <span>Champion • Rank 1</span>
                </div>

                <h2 className="text-base font-black text-[var(--text-main)] truncate max-w-[200px]">
                  {getTraderName(topThree[0])}
                </h2>

                <div className="text-lg font-mono font-black text-amber-400 mt-1">
                  ₹{topThree[0].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>

                <div className={`text-xs font-mono font-black flex items-center gap-1 mt-1.5 px-3 py-0.5 rounded-full ${
                  topThree[0].pnl >= 0 ? "bg-[var(--up-color)]/20 text-[var(--up-color)]" : "bg-[var(--down-color)]/20 text-[var(--down-color)]"
                }`}>
                  {topThree[0].pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{topThree[0].pnl >= 0 ? "+" : ""}{topThree[0].pnl?.toFixed(2)}%</span>
                </div>

              </div>
            </div>
          )}

          {/* #3 BRONZE (Right) */}
          {topThree[2] && (
            <div className="order-3 sm:order-3 relative group">
              <div className="bg-[var(--bg-card)] border border-amber-700/30 rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center shadow-lg hover:border-amber-600 transition-colors">
                
                <div className="relative mb-2.5">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-900 p-[2px] shadow">
                    <div className="w-full h-full bg-[#120803] rounded-2xl flex items-center justify-center font-bold text-sm text-amber-500">
                      {getInitials(getTraderName(topThree[2]))}
                    </div>
                  </div>
                  <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-amber-600 text-white font-black text-xs flex items-center justify-center shadow">
                    3
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-mono text-amber-500 font-bold uppercase tracking-wider mb-1">
                  <Flame className="w-3 h-3 text-amber-500" />
                  <span>Rank 3</span>
                </div>

                <h3 className="text-sm font-bold text-[var(--text-main)] truncate max-w-[180px]">
                  {getTraderName(topThree[2])}
                </h3>

                <div className="text-base font-mono font-bold text-[var(--text-main)] mt-1">
                  ₹{topThree[2].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>

                <div className={`text-xs font-mono font-bold flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full ${
                  topThree[2].pnl >= 0 ? "bg-[var(--up-color)]/15 text-[var(--up-color)]" : "bg-[var(--down-color)]/15 text-[var(--down-color)]"
                }`}>
                  {topThree[2].pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{topThree[2].pnl >= 0 ? "+" : ""}{topThree[2].pnl?.toFixed(2)}%</span>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

      {/* 3. CLEAN LIST FOR REMAINING PARTICIPANTS (Rank 4+) */}
      <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider font-mono">
              Standings
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {typedRankings.length} Total Traders
          </span>
        </div>

        <div className="space-y-1.5">
          {rest.length === 0 ? (
            <div className="text-center py-6 text-xs font-mono text-[var(--text-muted)]">
              Top 3 currently occupying all active tournament positions.
            </div>
          ) : (
            rest.map((user, idx) => {
              const rank = idx + 4;
              const returnVal = user.pnl ?? user.returnPct ?? 0;
              const isUp = returnVal >= 0;

              return (
                <div 
                  key={user.id || user.uid || idx}
                  className="p-2.5 sm:p-3 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)]/40 border border-[var(--border-subtle)] rounded-xl flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 text-center font-mono font-bold text-xs text-[var(--text-muted)] flex-shrink-0">
                      #{rank}
                    </span>

                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 flex-shrink-0">
                      {getInitials(getTraderName(user))}
                    </div>

                    <span className="text-xs font-bold text-[var(--text-main)] truncate">
                      {getTraderName(user)}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 font-mono flex-shrink-0">
                    <span className="text-xs font-bold text-[var(--text-main)]">
                      ₹{user.portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>

                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 min-w-[70px] justify-center ${
                      isUp ? "bg-[var(--up-color)]/15 text-[var(--up-color)]" : "bg-[var(--down-color)]/15 text-[var(--down-color)]"
                    }`}>
                      {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      <span>{isUp ? "+" : ""}{Number(returnVal).toFixed(2)}%</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}