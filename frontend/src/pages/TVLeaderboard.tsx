import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useTheme } from "../hooks/useTheme";
import { 
  TrendingUp, 
  TrendingDown, 
  Sun, 
  Moon, 
  Crown, 
  Shield, 
  Flame, 
  Trophy
} from "lucide-react";
import logoUrl from '../assets/logo.png';

export default function TVLeaderboard() {
  const { isDark, toggleTheme } = useTheme();
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = async () => {
    try {
      const snap = await getDoc(doc(db, 'leaderboard', 'main'));
      if (snap.exists()) {
        setRankings(snap.data().rankings || []);
      }
    } catch (error) {
      console.error("TV Leaderboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Background 8-second refresh loop
  useEffect(() => {
    fetchLeaderboard();
    const fetchTimer = setInterval(() => {
      fetchLeaderboard();
    }, 8000);

    return () => clearInterval(fetchTimer);
  }, []);

  const getTraderName = (user: any) => {
    return user?.displayName || user?.name || user?.email?.split('@')[0] || user?.uid || "Trader";
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  const topThree = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)] flex flex-col p-6 sm:p-8 font-sans transition-colors duration-200">
      
      {/* 1. BROADCAST HEADER (Clean 'Bazaar 8.0', No 'Live Rankings', No Timer) */}
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-5 mb-6">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Bazaar 8.0 Logo" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-main)]">
              Bazaar 8.0
            </h1>
            <p className="text-[var(--text-muted)] font-mono text-xs uppercase tracking-wider">
              Tournament Standings
            </p>
          </div>
        </div>

        <button 
          onClick={toggleTheme} 
          className="p-2.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors shadow-sm"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : rankings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] space-y-3">
          <Trophy className="w-16 h-16 opacity-20" />
          <span className="text-base font-mono uppercase tracking-wider">Awaiting Standings...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 max-w-6xl mx-auto w-full">
          
          {/* 2. TOP 3 PODIUM */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end pt-2 pb-2">
              
              {/* #2 SILVER (Left) */}
              {topThree[1] && (
                <div className="relative group">
                  <div className="bg-[var(--bg-card)] border border-slate-400/40 rounded-2xl p-5 flex flex-col items-center text-center shadow-md">
                    
                    <div className="relative mb-3">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-600 p-[2px] shadow">
                        <div className="w-full h-full bg-[#0d1117] rounded-2xl flex items-center justify-center font-bold text-base text-slate-200">
                          {getInitials(getTraderName(topThree[1]))}
                        </div>
                      </div>
                      <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-slate-300 text-black font-black text-xs flex items-center justify-center shadow">
                        2
                      </span>
                    </div>

                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-slate-300" />
                      <span>Rank 2</span>
                    </div>

                    <h3 className="text-base font-bold text-[var(--text-main)] truncate max-w-[200px]">
                      {getTraderName(topThree[1])}
                    </h3>

                    <div className="text-lg font-mono font-bold text-[var(--text-main)] mt-1">
                      ₹{topThree[1].portfolioValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <div className={`text-xs font-mono font-bold flex items-center gap-1 mt-2 px-3 py-0.5 rounded-full ${
                      (topThree[1].returnPct ?? topThree[1].pnl) >= 0 ? "bg-[var(--up-color)]/20 text-[var(--up-color)]" : "bg-[var(--down-color)]/20 text-[var(--down-color)]"
                    }`}>
                      {(topThree[1].returnPct ?? topThree[1].pnl) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span>{(topThree[1].returnPct ?? topThree[1].pnl) >= 0 ? "+" : ""}{Number(topThree[1].returnPct ?? topThree[1].pnl)?.toFixed(2)}%</span>
                    </div>

                  </div>
                </div>
              )}

              {/* #1 GOLD (Center) */}
              {topThree[0] && (
                <div className="relative group md:-translate-y-3">
                  <div className="bg-gradient-to-b from-[var(--bg-card)] via-[var(--bg-card)] to-[#141005] border-2 border-amber-400 rounded-2xl p-6 flex flex-col items-center text-center shadow-[0_0_35px_rgba(251,191,36,0.2)]">
                    
                    <div className="relative mb-3">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-300 to-amber-500 p-[3px] shadow-[0_0_20px_rgba(251,191,36,0.5)]">
                        <div className="w-full h-full bg-[#120d04] rounded-2xl flex items-center justify-center font-black text-xl text-amber-300">
                          {getInitials(getTraderName(topThree[0]))}
                        </div>
                      </div>
                      <span className="absolute -bottom-2 -right-2 w-7 h-7 rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 text-black font-black text-xs flex items-center justify-center shadow">
                        1
                      </span>
                    </div>

                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5 fill-current text-amber-400" />
                      <span>Champion • Rank 1</span>
                    </div>

                    <h2 className="text-lg font-black text-[var(--text-main)] truncate max-w-[220px]">
                      {getTraderName(topThree[0])}
                    </h2>

                    <div className="text-xl font-mono font-black text-amber-400 mt-1">
                      ₹{topThree[0].portfolioValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <div className={`text-xs font-mono font-black flex items-center gap-1 mt-2 px-3.5 py-0.5 rounded-full ${
                      (topThree[0].returnPct ?? topThree[0].pnl) >= 0 ? "bg-[var(--up-color)]/20 text-[var(--up-color)]" : "bg-[var(--down-color)]/20 text-[var(--down-color)]"
                    }`}>
                      {(topThree[0].returnPct ?? topThree[0].pnl) >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      <span>{(topThree[0].returnPct ?? topThree[0].pnl) >= 0 ? "+" : ""}{Number(topThree[0].returnPct ?? topThree[0].pnl)?.toFixed(2)}%</span>
                    </div>

                  </div>
                </div>
              )}

              {/* #3 BRONZE (Right) */}
              {topThree[2] && (
                <div className="relative group">
                  <div className="bg-[var(--bg-card)] border border-amber-700/40 rounded-2xl p-5 flex flex-col items-center text-center shadow-md">
                    
                    <div className="relative mb-3">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-950 p-[2px] shadow">
                        <div className="w-full h-full bg-[#120803] rounded-2xl flex items-center justify-center font-bold text-base text-amber-500">
                          {getInitials(getTraderName(topThree[2]))}
                        </div>
                      </div>
                      <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-amber-600 text-white font-black text-xs flex items-center justify-center shadow">
                        3
                      </span>
                    </div>

                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 mb-1 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-amber-500" />
                      <span>Rank 3</span>
                    </div>

                    <h3 className="text-base font-bold text-[var(--text-main)] truncate max-w-[200px]">
                      {getTraderName(topThree[2])}
                    </h3>

                    <div className="text-lg font-mono font-bold text-[var(--text-main)] mt-1">
                      ₹{topThree[2].portfolioValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <div className={`text-xs font-mono font-bold flex items-center gap-1 mt-2 px-3 py-0.5 rounded-full ${
                      (topThree[2].returnPct ?? topThree[2].pnl) >= 0 ? "bg-[var(--up-color)]/20 text-[var(--up-color)]" : "bg-[var(--down-color)]/20 text-[var(--down-color)]"
                    }`}>
                      {(topThree[2].returnPct ?? topThree[2].pnl) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span>{(topThree[2].returnPct ?? topThree[2].pnl) >= 0 ? "+" : ""}{Number(topThree[2].returnPct ?? topThree[2].pnl)?.toFixed(2)}%</span>
                    </div>

                  </div>
                </div>
              )}

            </div>
          )}

          {/* 3. ROSTER (Rank 4+) */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-lg">
            <div className="px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-root)] flex items-center justify-between font-mono text-xs font-bold uppercase text-[var(--text-muted)]">
              <span>Remaining Competitors</span>
              <span>{rest.length} Traders</span>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {rest.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  Top 3 currently occupying all active tournament positions.
                </div>
              ) : (
                rest.map((user, idx) => {
                  const rank = idx + 4;
                  const returnVal = user.returnPct ?? user.pnl ?? 0;
                  const isUp = returnVal >= 0;

                  return (
                    <div 
                      key={user.uid || user.id || idx}
                      className="px-6 py-3 flex items-center justify-between hover:bg-[var(--bg-root)] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-8 text-center font-mono font-bold text-sm text-[var(--text-muted)]">
                          #{rank}
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-[var(--bg-root)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] font-bold text-xs">
                          {getInitials(getTraderName(user))}
                        </div>
                        <span className="text-sm font-bold text-[var(--text-main)]">
                          {getTraderName(user)}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 font-mono">
                        <span className="text-sm font-bold text-[var(--text-main)]">
                          ₹{user.portfolioValue?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 min-w-[75px] justify-center ${
                          isUp ? 'bg-[var(--up-color)]/20 text-[var(--up-color)]' : 'bg-[var(--down-color)]/20 text-[var(--down-color)]'
                        }`}>
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {isUp ? '+' : ''}{Number(returnVal).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}