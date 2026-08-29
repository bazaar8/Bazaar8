import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useTheme } from "../hooks/useTheme";
import { TrendingUp, TrendingDown, Trophy, Sun, Moon } from "lucide-react";
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

  // Automatically sync every 5 seconds (5000ms) without showing a countdown
  useEffect(() => {
    fetchLeaderboard();
    const timer = setInterval(() => {
      fetchLeaderboard();
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const getTraderName = (user: any) => {
    return user?.displayName || user?.name || user?.email?.split('@')[0] || user?.uid || "Unknown Trader";
  };

  const topThree = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)] flex flex-col p-8 font-sans transition-colors duration-200">
      {/* Top TV Bar */}
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-6 mb-8">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3 px-4 py-2">
              <img src={logoUrl} alt="Bulls and Bears Logo" className="w-14 h-14" />
            </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[var(--text-main)] uppercase">
              Bulls and Bears Live Rankings
            </h1>
            <p className="text-[var(--text-muted)] font-mono mt-1 uppercase tracking-widest text-sm font-semibold">
              Institutional Leaderboard • Live Broadcast View
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme} 
            className="p-3.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors shadow-sm"
          >
            {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>

          {/* Replaced Countdown with a Live Sync Badge */}
          <div className="flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border-subtle)] px-6 py-4 rounded-2xl shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--up-color)] animate-pulse"></span>
            <span className="text-sm font-bold tracking-widest text-[var(--up-color)] uppercase">LIVE SYNC</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : rankings.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] space-y-4">
          <Trophy className="w-24 h-24 opacity-20" />
          <span className="text-2xl font-mono uppercase tracking-widest">Awaiting Market Sync...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-10">
          {/* Big Screen Podium Section */}
          {topThree.length > 0 && (
            <div className="flex items-end justify-center gap-8 pt-8 pb-4">
              {/* 2nd Place */}
              {topThree[1] && (
                <div className="flex flex-col items-center w-72">
                  <div className="flex flex-col items-center mb-4 text-center px-2">
                    <span className="text-xl font-black text-[var(--text-main)] truncate max-w-[260px]">
                      {getTraderName(topThree[1])}
                    </span>
                    <span className="text-lg font-mono font-bold text-[var(--text-muted)] mt-1">
                      ₹{topThree[1].portfolioValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-base font-mono font-black mt-1 flex items-center gap-1 ${topThree[1].returnPct >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                      {topThree[1].returnPct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {topThree[1].returnPct >= 0 ? "+" : ""}{topThree[1].returnPct?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full h-44 bg-[var(--bg-card)] border-2 border-[var(--border-subtle)] border-b-0 rounded-t-2xl flex flex-col items-center justify-start pt-5 shadow-xl">
                    <span className="text-4xl font-black text-[var(--text-muted)]">2</span>
                  </div>
                </div>
              )}

              {/* 1st Place */}
              {topThree[0] && (
                <div className="flex flex-col items-center w-84 z-10">
                  <div className="flex flex-col items-center mb-4 text-center px-2">
                    <Trophy className="w-10 h-10 text-amber-400 mb-2 animate-bounce" />
                    <span className="text-2xl font-black text-[var(--text-main)] truncate max-w-[300px]">
                      {getTraderName(topThree[0])}
                    </span>
                    <span className="text-xl font-mono font-bold text-[var(--text-main)] mt-1">
                      ₹{topThree[0].portfolioValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-lg font-mono font-black mt-1 flex items-center gap-1 ${topThree[0].returnPct >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                      {topThree[0].returnPct >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      {topThree[0].returnPct >= 0 ? "+" : ""}{topThree[0].returnPct?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full h-60 bg-[var(--bg-card)] border-4 border-amber-400/70 border-b-0 rounded-t-2xl flex flex-col items-center justify-start pt-6 shadow-[0_-8px_30px_rgba(251,191,36,0.15)]">
                    <span className="text-6xl font-black text-amber-400">1</span>
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {topThree[2] && (
                <div className="flex flex-col items-center w-72">
                  <div className="flex flex-col items-center mb-4 text-center px-2">
                    <span className="text-xl font-black text-[var(--text-main)] truncate max-w-[260px]">
                      {getTraderName(topThree[2])}
                    </span>
                    <span className="text-lg font-mono font-bold text-[var(--text-muted)] mt-1">
                      ₹{topThree[2].portfolioValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-base font-mono font-black mt-1 flex items-center gap-1 ${topThree[2].returnPct >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                      {topThree[2].returnPct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {topThree[2].returnPct >= 0 ? "+" : ""}{topThree[2].returnPct?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full h-32 bg-[var(--bg-card)] border-2 border-[var(--border-subtle)] border-b-0 rounded-t-2xl flex flex-col items-center justify-start pt-4 shadow-lg">
                    <span className="text-3xl font-black text-[var(--text-muted)]">3</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ranks 4+ Table Section */}
          <div className="flex-1 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-sm">
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-widest text-xs font-bold">
                  <th className="py-4 px-8 text-center w-28">Rank</th>
                  <th className="py-4 px-8 font-sans">Trader Name</th>
                  <th className="py-4 px-8 text-right">Portfolio Value</th>
                  <th className="py-4 px-8 text-right">Total P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {rest.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 px-8 text-center text-sm text-[var(--text-muted)]">
                      No additional traders listed.
                    </td>
                  </tr>
                ) : (
                  rest.map((entry, index) => {
                    const isUp = entry.returnPct >= 0;
                    return (
                      <tr key={entry.uid || index} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="py-4 px-8 text-center">
                          <span className="text-[var(--text-muted)] font-black text-lg">
                            {String(index + 4).padStart(2, '0')}
                          </span>
                        </td>
                        <td className="py-4 px-8 font-sans font-bold text-xl text-[var(--text-main)]">
                          {getTraderName(entry)}
                        </td>
                        <td className="py-4 px-8 text-right font-bold text-xl text-[var(--text-main)]">
                          ₹{entry.portfolioValue?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-8 text-right">
                          <span className={`inline-flex items-center gap-1.5 font-black text-xl ${isUp ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
                            {isUp ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                            {isUp ? '+' : ''}{entry.returnPct?.toFixed(2)}%
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
      )}
    </div>
  );
}