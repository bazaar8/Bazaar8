import { useState, useMemo, useRef } from "react";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useAuth } from "../context/AuthContext";
import { 
  TrendingUp, 
  TrendingDown, 
  Crown, 
  Shield, 
  Flame, 
  Search, 
  Zap, 
  Activity, 
  Users,
  Crosshair,
  LayoutGrid,
  List
} from "lucide-react";

export default function Leaderboard() {
  const { rankings, loading } = useLeaderboard();
  const { user: currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "bulls" | "bears" | "top10">("all");
  const [sortBy, setSortBy] = useState<"rank" | "gain" | "pnl">("rank");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const myRowRef = useRef<any | null>(null);

  const typedRankings = useMemo(() => (rankings as any[]) || [], [rankings]);

  const getTraderName = (user: any) => {
    return user?.displayName || user?.name || user?.email?.split('@')[0] || user?.id || user?.uid?.slice(0, 6) || "Trader";
  };

  const getInitials = (name: string) => {
    return (name || "TR").slice(0, 2).toUpperCase();
  };

  const getReturnVal = (user: any) => {
    const r = user?.returnPct ?? user?.pnl;
    if (r !== undefined && !isNaN(Number(r))) return Number(r);
    const pv = Number(user?.portfolioValue) || 1000000;
    return Number((((pv - 1000000) / 1000000) * 100).toFixed(2));
  };

  const getNetPnL = (user: any) => {
    if (user?.pnlAmount !== undefined && !isNaN(Number(user.pnlAmount))) return Number(user.pnlAmount);
    const pv = Number(user?.portfolioValue) || 1000000;
    return pv - 1000000;
  };

  const getTierBadge = (rank: number) => {
    if (rank === 1) return { label: "Apex Alpha", color: "text-amber-500 border-amber-400/50 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.2)]" };
    if (rank === 2) return { label: "Silver Master", color: "text-slate-500 border-slate-400/50 bg-slate-400/10" };
    if (rank === 3) return { label: "Bronze Vanguard", color: "text-amber-600 border-amber-600/50 bg-amber-700/10" };
    if (rank <= 10) return { label: "Grandmaster", color: "text-purple-500 border-purple-400/40 bg-purple-500/10" };
    if (rank <= 25) return { label: "Pro Heavyweight", color: "text-cyan-500 border-cyan-400/40 bg-cyan-500/10" };
    return { label: "Contender", color: "text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--bg-root)]" };
  };

  const arenaStats = useMemo(() => {
    if (typedRankings.length === 0) {
      return { totalCapital: 1000000, winRate: 0, highestReturn: 0, bullsCount: 0, bearsCount: 0, leaderSpread: 0 };
    }
    const totalCapital = typedRankings.reduce((sum, u) => sum + (Number(u.portfolioValue) || 1000000), 0);
    const bullsCount = typedRankings.filter(u => getReturnVal(u) > 0).length;
    const bearsCount = typedRankings.filter(u => getReturnVal(u) < 0).length;
    const winRate = Math.round((bullsCount / typedRankings.length) * 100);
    const highestReturn = Math.max(...typedRankings.map(u => getReturnVal(u)));
    
    const rank1Val = Number(typedRankings[0]?.portfolioValue) || 1000000;
    const rank2Val = Number(typedRankings[1]?.portfolioValue) || 1000000;
    const leaderSpread = Math.max(0, rank1Val - rank2Val);

    return { totalCapital, winRate, highestReturn, bullsCount, bearsCount, leaderSpread };
  }, [typedRankings]);

  const currentUserStanding = useMemo(() => {
    if (!currentUser?.uid) return null;
    const index = typedRankings.findIndex(u => u.uid === currentUser.uid);
    if (index === -1) return null;
    const data = typedRankings[index];
    const rank = index + 1;
    const ret = getReturnVal(data);
    const pnl = getNetPnL(data);
    const percentile = Math.max(1, Math.round(((typedRankings.length - rank + 1) / typedRankings.length) * 100));
    const nextTrader = rank > 1 ? typedRankings[index - 1] : null;
    const gapToNext = nextTrader ? Math.max(0, (Number(nextTrader.portfolioValue) || 0) - (Number(data.portfolioValue) || 0)) : 0;
    return { rank, data, ret, pnl, percentile, gapToNext, nextTraderName: nextTrader ? getTraderName(nextTrader) : "" };
  }, [currentUser?.uid, typedRankings]);

  const filteredRankings = useMemo(() => {
    let list = typedRankings.map((user, idx) => ({
      ...user,
      computedRank: idx + 1,
      computedReturn: getReturnVal(user),
      computedPnL: getNetPnL(user)
    }));

    if (filterTab === "bulls") {
      list = list.filter(u => u.computedReturn > 0);
    } else if (filterTab === "bears") {
      list = list.filter(u => u.computedReturn < 0);
    } else if (filterTab === "top10") {
      list = list.slice(0, 10);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(u => {
        const name = getTraderName(u).toLowerCase();
        const rankStr = `#${u.computedRank}`;
        return name.includes(q) || rankStr.includes(q);
      });
    }

    if (sortBy === "gain") {
      list.sort((a, b) => b.computedReturn - a.computedReturn);
    } else if (sortBy === "pnl") {
      list.sort((a, b) => b.computedPnL - a.computedPnL);
    } else {
      list.sort((a, b) => a.computedRank - b.computedRank);
    }

    return list;
  }, [typedRankings, filterTab, searchQuery, sortBy]);

  const topThree = typedRankings.slice(0, 3);
  const leaderEquity = Number(topThree[0]?.portfolioValue) || 1000000;

  const scrollToMyPosition = () => {
    if (myRowRef.current) {
      myRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[65vh] flex flex-col items-center justify-center gap-3 font-mono">
        <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-[var(--text-muted)] tracking-widest uppercase">
          Synthesizing Arena Telemetry...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-20 max-w-6xl mx-auto w-full">
      
      {/* 1. CHAMPIONSHIP HERO ARENA */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 shadow-2xl">
        
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-amber-400/10 border border-amber-400/30 rounded-full text-[11px] font-mono font-black text-amber-500 uppercase tracking-wider mb-3 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Tournament Standings • Live Valuation</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-[var(--text-main)] tracking-tight">
            Exchange Arena Leaderboard
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] font-mono mt-2 max-w-lg leading-relaxed">
            Real-time standings based on mark-to-market holdings, open positions, and realized capital.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full mt-7 text-left font-mono">
            
            <div className="p-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 font-bold">
                <Users className="w-3.5 h-3.5 text-[#3b82f6]" /> Contenders
              </span>
              <div className="text-lg sm:text-xl font-black text-[var(--text-main)] mt-1">
                {typedRankings.length} Traders
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Starting Capital: ₹10L</span>
            </div>

            <div className="p-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 font-bold">
                <Activity className="w-3.5 h-3.5 text-[var(--up-color)]" /> Arena Total
              </span>
              <div className="text-lg sm:text-xl font-black text-[var(--up-color)] mt-1">
                ₹{(arenaStats.totalCapital / 10000000).toFixed(2)} Cr
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Cumulative Equity</span>
            </div>

            <div className="p-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 font-bold">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> Peak Alpha
              </span>
              <div className={`text-lg sm:text-xl font-black mt-1 ${arenaStats.highestReturn >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                {arenaStats.highestReturn >= 0 ? "+" : ""}{arenaStats.highestReturn.toFixed(2)}%
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Apex Competitor Return</span>
            </div>

            <div className="p-3.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-2xl flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 font-bold">
                <Crown className="w-3.5 h-3.5 text-amber-500" /> #1 Lead Delta
              </span>
              <div className="text-lg sm:text-xl font-black text-amber-500 mt-1">
                +₹{Math.round(arenaStats.leaderSpread).toLocaleString("en-IN")}
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Spread Over Rank #2</span>
            </div>

          </div>

          <div className="w-full mt-4 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-2xl p-3 font-mono">
            <div className="flex items-center justify-between text-[11px] mb-1.5 font-bold">
              <span className="text-[var(--up-color)] flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> {arenaStats.bullsCount} Bulls ({arenaStats.winRate}%)
              </span>
              <span className="text-[var(--down-color)] flex items-center gap-1">
                {arenaStats.bearsCount} Drawdowns ({100 - arenaStats.winRate}%) <TrendingDown className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--border-subtle)] flex">
              <div 
                className="h-full bg-[var(--up-color)] transition-all duration-500" 
                style={{ width: `${arenaStats.winRate}%` }} 
              />
              <div 
                className="h-full bg-[var(--down-color)] transition-all duration-500" 
                style={{ width: `${100 - arenaStats.winRate}%` }} 
              />
            </div>
          </div>

        </div>
      </div>

      {/* 2. PERSONAL HUD CARD */}
      {currentUserStanding && (
        <div className="relative overflow-hidden bg-[var(--bg-card)] border-2 border-amber-400/50 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-[2px] shadow-lg flex-shrink-0">
              <div className="w-full h-full bg-[var(--bg-root)] rounded-xl flex items-center justify-center font-black text-amber-500 text-sm">
                #{currentUserStanding.rank}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[var(--text-main)] tracking-wide">
                  YOUR CURRENT STANDING
                </span>
                <span className="px-2 py-0.5 bg-amber-400/20 text-amber-600 border border-amber-400/40 rounded-full text-[9px] font-black uppercase">
                  Top {currentUserStanding.percentile}%
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {currentUserStanding.rank === 1 
                  ? "👑 You are currently holding Rank #1 in the championship!" 
                  : currentUserStanding.gapToNext > 0 
                  ? `Need ₹${currentUserStanding.gapToNext.toLocaleString("en-IN", { maximumFractionDigits: 0 })} to surpass Rank #${currentUserStanding.rank - 1} (${currentUserStanding.nextTraderName})` 
                  : "Keep trading actively to climb up the tournament roster!"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--border-subtle)]">
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-muted)] block uppercase">Your Equity</span>
              <span className="text-base sm:text-lg font-black text-[var(--text-main)]">
                ₹{currentUserStanding.data.portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
              currentUserStanding.ret >= 0 
                ? "bg-[var(--up-color)]/10 text-[var(--up-color)] border border-[var(--up-color)]/30" 
                : "bg-[var(--down-color)]/10 text-[var(--down-color)] border border-[var(--down-color)]/30"
            }`}>
              {currentUserStanding.ret >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{currentUserStanding.ret >= 0 ? "+" : ""}{currentUserStanding.ret.toFixed(2)}%</span>
            </div>

            <button
              onClick={scrollToMyPosition}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-[var(--bg-root)] text-xs font-black rounded-xl transition-colors flex items-center gap-1 shadow-sm"
              title="Jump directly to your row in the roster"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">My Spot</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. PODIUM (Top 3) */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end pt-2">
          
          {/* #2 SILVER */}
          {topThree[1] && (() => {
            const ret = getReturnVal(topThree[1]);
            const pnl = getNetPnL(topThree[1]);
            const isUp = ret >= 0;

            return (
              <div className="order-2 md:order-1 relative group">
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl p-5 sm:p-6 flex flex-col items-center text-center shadow-xl hover:border-slate-400 transition-all duration-300">
                  
                  <div className="relative mb-3">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-400 to-slate-600 p-[2px] shadow-lg">
                      <div className="w-full h-full bg-[var(--bg-root)] rounded-2xl flex items-center justify-center font-black text-base text-slate-500">
                        {getInitials(getTraderName(topThree[1]))}
                      </div>
                    </div>
                    <span className="absolute -bottom-2 -right-2 w-7 h-7 rounded-xl bg-slate-300 text-[var(--bg-root)] font-black text-xs flex items-center justify-center shadow-md border-2 border-[var(--bg-card)]">
                      02
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-bold text-slate-500 border border-slate-400/40 bg-slate-400/10 mb-2">
                    <Shield className="w-3 h-3 text-slate-500" />
                    <span>Silver Master</span>
                  </div>

                  <h3 className="text-base font-black text-[var(--text-main)] truncate max-w-[200px]">
                    {getTraderName(topThree[1])}
                  </h3>

                  <div className="text-xl font-mono font-black text-[var(--text-main)] mt-1.5">
                    ₹{topThree[1].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>

                  <div className={`text-xs font-mono font-black flex items-center gap-1 mt-2 px-3 py-1 rounded-full ${
                    isUp ? "bg-[var(--up-color)]/10 text-[var(--up-color)] border border-[var(--up-color)]/30" : "bg-[var(--down-color)]/10 text-[var(--down-color)] border border-[var(--down-color)]/30"
                  }`}>
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{isUp ? "+" : ""}{ret.toFixed(2)}%</span>
                  </div>

                  <span className="text-[11px] font-mono text-[var(--text-muted)] mt-1 font-bold">
                    {pnl >= 0 ? "+" : ""}₹{Math.round(pnl).toLocaleString("en-IN")}
                  </span>

                  <div className="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden mt-4">
                    <div 
                      className="h-full bg-slate-400 rounded-full" 
                      style={{ width: `${Math.min(100, Math.max(10, ((Number(topThree[1].portfolioValue) || 1000000) / leaderEquity) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* #1 APEX CHAMPION */}
          {topThree[0] && (() => {
            const ret = getReturnVal(topThree[0]);
            const pnl = getNetPnL(topThree[0]);
            const isUp = ret >= 0;

            return (
              <div className="order-1 md:order-2 relative group md:-translate-y-4">
                <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600 opacity-20 blur-xl group-hover:opacity-40 transition-opacity" />

                <div className="relative bg-[var(--bg-card)] border-2 border-amber-400 rounded-3xl p-6 sm:p-7 flex flex-col items-center text-center shadow-2xl">
                  
                  <div className="relative mb-3.5">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-600 via-amber-300 to-amber-500 p-[3px]">
                      <div className="w-full h-full bg-[var(--bg-root)] rounded-3xl flex items-center justify-center font-black text-xl text-amber-500">
                        {getInitials(getTraderName(topThree[0]))}
                      </div>
                    </div>
                    <span className="absolute -bottom-2.5 -right-2.5 w-8 h-8 rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 text-[var(--bg-root)] font-black text-sm flex items-center justify-center shadow-lg border-2 border-[var(--bg-card)]">
                      01
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-widest font-black text-amber-600 border border-amber-400/50 bg-amber-400/10 mb-2">
                    <Crown className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>Apex Alpha • Champion</span>
                  </div>

                  <h2 className="text-lg sm:text-xl font-black text-[var(--text-main)] truncate max-w-[220px]">
                    {getTraderName(topThree[0])}
                  </h2>

                  <div className="text-2xl sm:text-3xl font-mono font-black text-amber-500 mt-1.5">
                    ₹{topThree[0].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>

                  <div className={`text-xs font-mono font-black flex items-center gap-1 mt-2 px-3.5 py-1 rounded-full ${
                    isUp ? "bg-[var(--up-color)]/10 text-[var(--up-color)] border border-[var(--up-color)]/30" : "bg-[var(--down-color)]/10 text-[var(--down-color)] border border-[var(--down-color)]/30"
                  }`}>
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{isUp ? "+" : ""}{ret.toFixed(2)}%</span>
                  </div>

                  <span className="text-xs font-mono text-[var(--text-muted)] font-bold mt-1.5">
                    {pnl >= 0 ? "+" : ""}₹{Math.round(pnl).toLocaleString("en-IN")} Net Gain
                  </span>

                  <div className="w-full bg-[var(--border-subtle)] h-2 rounded-full overflow-hidden mt-4">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full w-full shadow-sm" />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* #3 BRONZE */}
          {topThree[2] && (() => {
            const ret = getReturnVal(topThree[2]);
            const pnl = getNetPnL(topThree[2]);
            const isUp = ret >= 0;

            return (
              <div className="order-3 md:order-3 relative group">
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl p-5 sm:p-6 flex flex-col items-center text-center shadow-xl hover:border-amber-600 transition-all duration-300">
                  
                  <div className="relative mb-3">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-700 to-amber-900 p-[2px] shadow-lg">
                      <div className="w-full h-full bg-[var(--bg-root)] rounded-2xl flex items-center justify-center font-black text-base text-amber-600">
                        {getInitials(getTraderName(topThree[2]))}
                      </div>
                    </div>
                    <span className="absolute -bottom-2 -right-2 w-7 h-7 rounded-xl bg-amber-600 text-white font-black text-xs flex items-center justify-center shadow-md border-2 border-[var(--bg-card)]">
                      03
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-bold text-amber-600 border border-amber-600/40 bg-amber-600/10 mb-2">
                    <Flame className="w-3 h-3 text-amber-500" />
                    <span>Bronze Vanguard</span>
                  </div>

                  <h3 className="text-base font-black text-[var(--text-main)] truncate max-w-[200px]">
                    {getTraderName(topThree[2])}
                  </h3>

                  <div className="text-xl font-mono font-black text-[var(--text-main)] mt-1.5">
                    ₹{topThree[2].portfolioValue?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>

                  <div className={`text-xs font-mono font-black flex items-center gap-1 mt-2 px-3 py-1 rounded-full ${
                    isUp ? "bg-[var(--up-color)]/10 text-[var(--up-color)] border border-[var(--up-color)]/30" : "bg-[var(--down-color)]/10 text-[var(--down-color)] border border-[var(--down-color)]/30"
                  }`}>
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{isUp ? "+" : ""}{ret.toFixed(2)}%</span>
                  </div>

                  <span className="text-[11px] font-mono text-[var(--text-muted)] mt-1 font-bold">
                    {pnl >= 0 ? "+" : ""}₹{Math.round(pnl).toLocaleString("en-IN")}
                  </span>

                  <div className="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden mt-4">
                    <div 
                      className="h-full bg-amber-600 rounded-full" 
                      style={{ width: `${Math.min(100, Math.max(10, ((Number(topThree[2].portfolioValue) || 1000000) / leaderEquity) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      )}

      {/* 4. CONTROLS HUD */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
          
          <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-root)] p-1 border border-[var(--border-subtle)] rounded-xl font-mono text-xs">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterTab === "all" ? "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              All ({typedRankings.length})
            </button>
            <button
              onClick={() => setFilterTab("bulls")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                filterTab === "bulls" ? "bg-[var(--up-color)] text-[var(--bg-root)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Bulls ({arenaStats.bullsCount})</span>
            </button>
            <button
              onClick={() => setFilterTab("bears")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                filterTab === "bears" ? "bg-[var(--down-color)] text-[var(--bg-root)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              <span>Drawdowns ({arenaStats.bearsCount})</span>
            </button>
            <button
              onClick={() => setFilterTab("top10")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                filterTab === "top10" ? "bg-purple-600 text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Top 10 Apex
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1 bg-[var(--bg-root)] p-1 border border-[var(--border-subtle)] rounded-xl font-mono text-xs">
              <span className="text-[var(--text-muted)] text-[10px] px-2 uppercase font-bold">Sort:</span>
              <button
                onClick={() => setSortBy("rank")}
                className={`px-2.5 py-1 rounded-lg font-bold ${sortBy === "rank" ? "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}
              >
                Rank
              </button>
              <button
                onClick={() => setSortBy("gain")}
                className={`px-2.5 py-1 rounded-lg font-bold ${sortBy === "gain" ? "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}
              >
                Return %
              </button>
              <button
                onClick={() => setSortBy("pnl")}
                className={`px-2.5 py-1 rounded-lg font-bold ${sortBy === "pnl" ? "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)]" : "text-[var(--text-muted)]"}`}
              >
                P&L
              </button>
            </div>

            <div className="flex items-center bg-[var(--bg-root)] p-1 border border-[var(--border-subtle)] rounded-xl">
              <button
                onClick={() => setViewMode("cards")}
                className={`p-1.5 rounded-lg ${viewMode === "cards" ? "bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                title="Expanded Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg ${viewMode === "table" ? "bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                title="Dense Terminal Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search trader or #rank..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded-xl text-xs font-mono text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

        </div>

        {/* 5. CARDS VIEW */}
        {viewMode === "cards" && (
          <div className="space-y-2.5">
            {filteredRankings.length === 0 ? (
              <div className="text-center py-14 text-xs font-mono text-[var(--text-muted)]">
                No matching contenders found for the active filter.
              </div>
            ) : (
              filteredRankings.map((user) => {
                const isMe = currentUser?.uid && user.uid === currentUser.uid;
                const tier = getTierBadge(user.computedRank);
                const userVal = Number(user.portfolioValue) || 1000000;
                const relativePower = Math.min(100, Math.max(8, Math.round((userVal / leaderEquity) * 100)));
                const isUp = user.computedReturn >= 0;

                return (
                  <div 
                    key={user.id || user.uid || user.computedRank}
                    ref={isMe ? myRowRef : null}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isMe 
                        ? "bg-amber-400/10 border-amber-400/80 shadow-lg" 
                        : "bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] border-[var(--border-subtle)]"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      
                      <div className={`w-9 h-9 rounded-xl font-mono font-black text-xs flex items-center justify-center flex-shrink-0 shadow-inner ${
                        user.computedRank === 1 ? "bg-amber-400 text-[var(--bg-root)]" :
                        user.computedRank === 2 ? "bg-slate-300 text-[var(--bg-root)]" :
                        user.computedRank === 3 ? "bg-amber-600 text-[var(--bg-root)]" :
                        user.computedRank <= 10 ? "bg-[var(--bg-card)] text-purple-500 border border-purple-500/30" :
                        "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                      }`}>
                        {user.computedRank < 10 ? `0${user.computedRank}` : user.computedRank}
                      </div>

                      <div className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)] flex-shrink-0">
                        {getInitials(getTraderName(user))}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-[var(--text-main)] truncate">
                            {getTraderName(user)}
                          </span>
                          {isMe && (
                            <span className="px-1.5 py-0.2 bg-amber-400 text-[var(--bg-root)] font-black font-mono text-[9px] rounded uppercase shadow-sm">
                              YOU
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-2 py-0.2 rounded-full text-[9px] font-mono font-bold border uppercase ${tier.color}`}>
                            {tier.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 font-mono flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                      
                      <div className="hidden lg:flex flex-col items-end w-28">
                        <span className="text-[9px] text-[var(--text-muted)] uppercase">Power Index</span>
                        <div className="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden mt-1">
                          <div 
                            className={`h-full rounded-full ${user.computedRank === 1 ? "bg-amber-400" : "bg-[var(--text-muted)]"}`} 
                            style={{ width: `${relativePower}%` }}
                          />
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-black text-[var(--text-main)]">
                          ₹{userVal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {user.computedPnL >= 0 ? "+" : ""}₹{Math.round(user.computedPnL).toLocaleString("en-IN")}
                        </div>
                      </div>

                      <span className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 min-w-[85px] justify-center ${
                        isUp 
                          ? "bg-[var(--up-color)]/10 text-[var(--up-color)] border border-[var(--up-color)]/30" 
                          : "bg-[var(--down-color)]/10 text-[var(--down-color)] border border-[var(--down-color)]/30"
                      }`}>
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        <span>{isUp ? "+" : ""}{user.computedReturn.toFixed(2)}%</span>
                      </span>

                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 6. TABLE VIEW */}
        {viewMode === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-[10px] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)] pb-2">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Contender</th>
                  <th className="py-2.5 px-3">Tier</th>
                  <th className="py-2.5 px-3 text-right">Portfolio Equity</th>
                  <th className="py-2.5 px-3 text-right">Net P&L</th>
                  <th className="py-2.5 px-3 text-right">Return %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredRankings.map((user) => {
                  const isMe = currentUser?.uid && user.uid === currentUser.uid;
                  const tier = getTierBadge(user.computedRank);
                  const userVal = Number(user.portfolioValue) || 1000000;
                  const isUp = user.computedReturn >= 0;

                  return (
                    <tr 
                      key={user.id || user.uid || user.computedRank}
                      ref={isMe ? myRowRef : null}
                      className={`hover:bg-[var(--bg-root)] transition-colors ${
                        isMe ? "bg-amber-400/10 font-bold" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                          user.computedRank === 1 ? "bg-amber-400 text-[var(--bg-root)]" :
                          user.computedRank === 2 ? "bg-slate-300 text-[var(--bg-root)]" :
                          user.computedRank === 3 ? "bg-amber-600 text-[var(--bg-root)]" :
                          "text-[var(--text-muted)]"
                        }`}>
                          #{user.computedRank < 10 ? `0${user.computedRank}` : user.computedRank}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-main)] truncate max-w-[150px] sm:max-w-none">
                            {getTraderName(user)}
                          </span>
                          {isMe && (
                            <span className="px-1.5 py-0.2 bg-amber-400 text-[var(--bg-root)] text-[9px] font-black rounded uppercase">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] border uppercase ${tier.color}`}>
                          {tier.label}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-[var(--text-main)]">
                        ₹{userVal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>

                      <td className="py-3 px-3 text-right text-[var(--text-muted)]">
                        {user.computedPnL >= 0 ? "+" : ""}₹{Math.round(user.computedPnL).toLocaleString("en-IN")}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <span className={`font-black ${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                          {isUp ? "+" : ""}{user.computedReturn.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
}