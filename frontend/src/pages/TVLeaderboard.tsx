import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useTheme } from "../hooks/useTheme";
import { Clock, TrendingUp, TrendingDown, Trophy, Activity, Sun, Moon } from "lucide-react";

export default function TVLeaderboard() {
  const { isDark, toggleTheme } = useTheme(); // Supports your theme hook
  const [rankings, setRankings] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(30);
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

  useEffect(() => {
    fetchLeaderboard();

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLeaderboard();
          return 30; 
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-main)] flex flex-col p-6 font-sans transition-colors duration-200">

      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#08998115] rounded-xl border border-[#08998130] animate-pulse">
            <Activity className="w-8 h-8 text-[var(--up-color)]" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[var(--text-main)]">Live Market Rankings</h1>
            <p className="text-[var(--text-muted)] font-mono mt-1 uppercase tracking-widest text-sm">Global Institutional Leaderboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme} 
            className="p-3 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] px-6 py-3 rounded-xl shadow-sm">
            <Clock className="w-5 h-5 text-[var(--text-muted)]" />
            <div className="flex flex-col items-end font-mono">
              <span className="text-sm font-bold text-[var(--text-main)]">UPDATING IN {countdown}s</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-sm">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : rankings.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] space-y-4">
            <Trophy className="w-16 h-16 opacity-20" />
            <span className="text-xl font-mono uppercase tracking-widest">Awaiting Engine Data...</span>
          </div>
        ) : (
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="bg-[var(--bg-root)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-widest text-sm">
                <th className="py-6 px-8 font-black text-center w-32">Rank</th>
                <th className="py-6 px-8 font-black">Trader ID</th>
                <th className="py-6 px-8 font-black text-right">Portfolio Value</th>
                <th className="py-6 px-8 font-black text-right">P&L (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {rankings.map((entry, index) => {
                const isTop3 = index < 3;
                const isUp = entry.returnPct >= 0;
                
                return (
                  <tr key={entry.uid} className={`transition-colors ${isTop3 ? 'bg-[var(--bg-root)]' : ''}`}>
                    <td className="py-5 px-8 text-center">
                      {isTop3 ? (
                        <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-xl font-black shadow-sm ${
                          index === 0 ? 'bg-[#f59e0b15] text-[#f59e0b] border-2 border-[#f59e0b50]' :
                          index === 1 ? 'bg-[#94a3b815] text-[#94a3b8] border-2 border-[#94a3b850]' :
                          'bg-[#b4530915] text-[#b45309] border-2 border-[#b4530950]'
                        }`}>
                          {index + 1}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)] font-bold text-xl">{String(index + 1).padStart(2, '0')}</span>
                      )}
                    </td>
                    <td className={`py-5 px-8 font-sans font-bold tracking-wide ${isTop3 ? 'text-[var(--text-main)] text-3xl' : 'text-[var(--text-main)] text-2xl opacity-90'}`}>
                      {entry.displayName}
                    </td>
                    <td className={`py-5 px-8 text-right font-bold ${isTop3 ? 'text-[var(--text-main)] text-3xl' : 'text-[var(--text-main)] text-2xl opacity-90'}`}>
                      ₹{entry.portfolioValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-5 px-8 text-right">
                      <span className={`inline-flex items-center gap-2 font-black ${isTop3 ? 'text-3xl' : 'text-2xl'} ${isUp ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
                        {isUp ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                        {isUp ? '+' : ''}{entry.returnPct.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}