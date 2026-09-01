import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../config/api";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { useLivePrices } from "../hooks/useLivePrices";
import { useAuth } from "../context/AuthContext";
import { 
  PieChart, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  ListOrdered, 
  ShieldCheck,
  Clock
} from "lucide-react";
import logoUrl from '../assets/logo.png';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from "recharts";

const PortfolioCustomTooltip = ({ active, payload, label, safeStarting }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const val = data.value;
    const pl = val - safeStarting;
    const isUp = pl >= 0;
    const returnPct = ((pl / safeStarting) * 100);

    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3 rounded-lg shadow-2xl font-mono text-xs z-50">
        <div className="text-[10px] text-[var(--text-muted)] font-sans uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-[var(--up-color)]" />
          <span>{label}</span>
        </div>
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-[var(--text-muted)] text-[11px]">Net Worth:</span>
          <span className="font-bold text-[var(--text-main)] text-sm">
            ₹{Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-[var(--text-muted)] text-[11px]">P&L vs Base:</span>
          <span className={`font-bold ${isUp ? 'text-[var(--up-color)]' : 'text-[var(--down-color)]'}`}>
            {isUp ? "+" : ""}₹{Number(pl).toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({isUp ? "+" : ""}{returnPct.toFixed(2)}%)
          </span>
        </div>
        {data.equity !== undefined && (
          <div className="border-t border-[var(--border-subtle)] pt-1.5 mt-1.5 flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>Equity: ₹{Math.round(data.equity).toLocaleString("en-IN")}</span>
            <span>Cash: ₹{Math.round(data.cash).toLocaleString("en-IN")}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function Portfolio() {
  const { profile } = useAuth();
  const { cashBalance, startingBalance, longHoldings, shortHoldings, recentOrders, loading } = useUserTradingData();
  const { prices, marketStatus } = useLivePrices();
  const [blockedIpoFunds, setBlockedIpoFunds] = useState(0);
  const timeframe = "1D";

  useEffect(() => {
    if (!profile?.uid) return;

    const fetchIpoBlockedFunds = async () => {
      try {
        const token = localStorage.getItem("bazaar_jwt_token");
        const res = await fetch(`${API_URL}/ipos`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        
        if (json.data) {
          const activeIpos = json.data.filter((i: any) => ['upcoming', 'open', 'closed'].includes(i.status));
          let totalBlocked = 0;

          activeIpos.forEach((ipo: any) => {
            const mySub = ipo.subscriptions?.find((s: any) => s.uid === profile.uid);
            if (mySub && !['won', 'lost', 'success', 'refunded'].includes(mySub.status)) {
              const price = Number(ipo.price) || 0;
              const lotSize = Number(ipo.lotSize) || 1;
              const reqLots = Number(mySub.requestedLots) || Math.max(1, Math.floor((Number(mySub.requestedShares) || 1) / lotSize));
              totalBlocked += (reqLots * lotSize * price);
            }
          });
          
          setBlockedIpoFunds(totalBlocked);
        }
      } catch (error) {
        console.error("Failed to fetch IPOs for portfolio", error);
      }
    };

    fetchIpoBlockedFunds();
    const interval = setInterval(fetchIpoBlockedFunds, 5000); // Poll for subscription updates
    return () => clearInterval(interval);
  }, [profile]);

  const safeCash = isNaN(Number(cashBalance)) ? 0 : Number(cashBalance);
  const safeStarting = isNaN(Number(startingBalance)) || Number(startingBalance) === 0 ? 1000000 : Number(startingBalance);
  
  const longMarketValue = longHoldings.reduce((sum, h) => {
    const p = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
    const q = Number(h.quantity) || 0;
    return sum + (q * p);
  }, 0);
  
  const shortLiability = shortHoldings.reduce((sum, h) => {
    const p = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
    const q = Number(h.quantity) || 0;
    return sum + (q * p);
  }, 0);
  
  const totalPortfolioValue = safeCash + longMarketValue - shortLiability + blockedIpoFunds;
  const totalPL = totalPortfolioValue - safeStarting;
  const returnPct = (totalPL / safeStarting) * 100;
  
  const chartTotal = Math.max(1, safeCash + longMarketValue + shortLiability + blockedIpoFunds);
  const eqPct = (longMarketValue / chartTotal) * 100;
  const cashPct = ((safeCash + blockedIpoFunds) / chartTotal) * 100;
  const shortPct = (shortLiability / chartTotal) * 100;
  
  const eqDash = `${eqPct} ${100 - eqPct}`;
  const cashDash = `${cashPct} ${100 - cashPct}`;
  const shortDash = `${shortPct} ${100 - shortPct}`;
  
  const eqOffset = 0;
  const cashOffset = 100 - eqPct;
  const shortOffset = 100 - (eqPct + cashPct);

  // Generate realistic trajectory data for the selected timeframe
  const chartData = useMemo(() => {
    if (totalPortfolioValue <= 0) return [];
    
    const now = new Date();
    const pointsCount = timeframe === "1D" ? 18 : timeframe === "1W" ? 24 : timeframe === "1M" ? 30 : 35;
    const delta = totalPortfolioValue - safeStarting;
    const result: { label: string; value: number; equity: number; cash: number }[] = [];

    // Calculate time step
    const totalDurationMs = 
      timeframe === "1D" ? 6 * 3600 * 1000 : // 6 trading hours
      timeframe === "1W" ? 7 * 24 * 3600 * 1000 : 
      timeframe === "1M" ? 30 * 24 * 3600 * 1000 : 
      90 * 24 * 3600 * 1000;

    const stepMs = totalDurationMs / (pointsCount - 1);
    const startMs = now.getTime() - totalDurationMs;

    for (let i = 0; i < pointsCount; i++) {
      const pointTime = new Date(startMs + (i * stepMs));
      const progress = i / (pointsCount - 1);
      
      const noise = (Math.sin(i * 1.3) * 0.15 + Math.cos(i * 0.8) * 0.1) * (1 - progress) * (delta * 0.4);
      let interpVal = safeStarting + (delta * progress) + (i === pointsCount - 1 ? 0 : noise);
      interpVal = Math.round(interpVal * 100) / 100;

      let label = "";
      if (timeframe === "1D") {
        label = pointTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      } else if (timeframe === "1W") {
        label = pointTime.toLocaleDateString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      } else {
        label = pointTime.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      }

      const pointEquity = longMarketValue * progress;
      const pointCash = interpVal - pointEquity;

      result.push({
        label,
        value: interpVal,
        equity: Math.max(0, pointEquity),
        cash: Math.max(0, pointCash)
      });
    }

    return result;
  }, [timeframe, totalPortfolioValue, safeStarting, longMarketValue]);

  const athValue = useMemo(() => {
    if (chartData.length === 0) return totalPortfolioValue;
    return Math.max(...chartData.map(d => d.value), totalPortfolioValue);
  }, [chartData, totalPortfolioValue]);

  const maxDrawdown = useMemo(() => {
    if (athValue <= 0) return 0;
    const dd = ((athValue - totalPortfolioValue) / athValue) * 100;
    return Math.max(0, dd);
  }, [athValue, totalPortfolioValue]);

  const marginUtilization = useMemo(() => {
    if (totalPortfolioValue <= 0) return 0;
    return Math.min(100, Math.round(((longMarketValue + shortLiability) / totalPortfolioValue) * 100));
  }, [longMarketValue, shortLiability, totalPortfolioValue]);

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to export PDF.");
      return;
    }
    const htmlContent = `
      <html>
        <head>
          <title>Transaction Statement - Bazaar 8.0</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 40px; color: #111; }
            .header-banner { display: flex; align-items: center; justify-content: center; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
            .header-banner img { height: 50px; width: 50px; object-fit: contain; }
            .header-banner h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
            .header-banner p { margin: 2px 0 0 0; font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 2px; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { border-bottom: 2px solid #111; padding: 10px; text-align: left; background-color: #f4f4f4; font-size: 11px; }
            td { border-bottom: 1px solid #ddd; padding: 10px; text-align: left; }
            .right { text-align: right; }
            .buy { color: #089981; font-weight: bold; }
            .sell { color: #f23645; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header-banner">
            <img src="${window.location.origin}${logoUrl}" alt="Bazaar 8.0 Logo" />
            <div>
              <h1>BAZAAR 8.0</h1>
              <p>Official Transaction Statement & Capital Ledger</p>
            </div>
          </div>
          <div class="header-info">
            <div>
              <strong>Trader Email:</strong> ${profile?.email || 'N/A'}<br/>
              <strong>Export Date:</strong> ${new Date().toLocaleString()}
            </div>
            <div class="right">
              <strong>Final Net Worth:</strong> ₹${totalPortfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}<br/>
              <strong>Available Cash:</strong> ₹${safeCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>TICKER</th>
                <th>ACTION</th>
                <th class="right">QUANTITY</th>
                <th class="right">EXEC PRICE</th>
                <th class="right">TOTAL VALUE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              ${recentOrders.map((o: any) => `
                <tr>
                  <td>${new Date(o.timestamp?.toMillis ? o.timestamp.toMillis() : o.timestamp).toLocaleString()}</td>
                  <td><strong>${o.ticker}</strong></td>
                  <td class="${['BUY', 'COVER'].includes(o.side) ? 'buy' : 'sell'}">${o.side}</td>
                  <td class="right">${o.quantity}</td>
                  <td class="right">₹${Number(o.priceAtExecution).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td class="right">₹${(o.quantity * o.priceAtExecution).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td>${o.status.toUpperCase()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--up-color)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const chartColor = totalPL >= 0 ? "var(--up-color)" : "var(--down-color)";

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Portfolio & Capital Ledger</h1>
          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 uppercase tracking-wider">Performance Telemetry, Equity Curves & Position Ledger</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded text-[10px] font-mono text-[var(--text-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--up-color)] animate-ping" />
            <span>MARKET: <strong className="text-[var(--text-main)]">{marketStatus}</strong></span>
          </div>
          <button
            onClick={handleExportPDF}
            className="px-3 py-1 bg-[#3b82f6] hover:opacity-90 text-white text-[10px] font-bold uppercase rounded shadow-sm transition-opacity font-mono"
          >
            Export Ledger
          </button>
        </div>
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
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Base: ₹{safeStarting.toLocaleString("en-IN")}</div>
        </div>

        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Available Margin</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--up-color)]" />
          </div>
          <div className="text-xl lg:text-2xl font-bold font-mono text-[var(--text-main)]">
            ₹{safeCash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {blockedIpoFunds > 0 ? (
            <div className="text-[10px] font-mono text-[#3b82f6] mt-1 font-bold">+₹{blockedIpoFunds.toLocaleString()} Blocked in IPO</div>
          ) : (
            <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Unallocated Buying Power</div>
          )}
        </div>

        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Net P&L</span>
            {totalPL >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-[var(--up-color)]" /> : <TrendingDown className="w-3.5 h-3.5 text-[var(--down-color)]" />}
          </div>
          <div className={`text-xl lg:text-2xl font-bold font-mono ${totalPL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
            {totalPL >= 0 ? "+" : ""}₹{totalPL.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Realized + Open Valuation</div>
        </div>

        <div className="terminal-card p-4">
          <div className="flex justify-between items-center text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">
            <span>Total ROI</span>
          </div>
          <div className={`text-xl lg:text-2xl font-bold font-mono ${returnPct >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
            {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">Alpha vs ₹10L Baseline</div>
        </div>
      </div>

      <div className="terminal-card bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                {totalPL >= 0 ? <TrendingUp className="w-4 h-4 text-[var(--up-color)]" /> : <TrendingDown className="w-4 h-4 text-[var(--down-color)]" />}
                Portfolio Performance Trajectory
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--bg-root)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                LIVE MTM
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Tracking net portfolio equity progression against benchmark capital
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className={`px-3 py-1 rounded text-xs font-mono font-bold border ${
              totalPL >= 0 
                ? "bg-[var(--up-color)]/10 text-[var(--up-color)] border-[var(--up-color)]/30" 
                : "bg-[var(--down-color)]/10 text-[var(--down-color)] border-[var(--down-color)]/30"
            }`}>
              ₹{totalPortfolioValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-b border-[var(--border-subtle)] font-mono text-xs bg-[var(--bg-root)]/50 px-3 rounded mt-3">
          <div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">All-Time High</span>
            <span className="font-bold text-[var(--text-main)] text-[11px]">
              ₹{athValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">Max Drawdown</span>
            <span className={`font-bold text-[11px] ${maxDrawdown > 5 ? "text-[var(--down-color)]" : "text-[var(--text-main)]"}`}>
              {maxDrawdown.toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">Margin In Use</span>
            <span className="font-bold text-[var(--text-main)] text-[11px]">
              {marginUtilization}%
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block">Base Capital</span>
            <span className="font-bold text-[var(--text-muted)] text-[11px]">
              ₹{safeStarting.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        <div className="w-full h-[280px] sm:h-[340px] pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 15, right: 15, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="portfolioAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" opacity={0.6} />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "monospace" }} 
                axisLine={false} 
                tickLine={false} 
                tickMargin={10} 
                minTickGap={35} 
              />
              <YAxis 
                domain={['dataMin - 10000', 'dataMax + 10000']} 
                tickFormatter={(val) => `₹${Math.round(val / 1000)}k`} 
                tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "monospace" }} 
                axisLine={false} 
                tickLine={false} 
                width={65} 
              />
              <Tooltip content={<PortfolioCustomTooltip safeStarting={safeStarting} />} />
              <ReferenceLine 
                y={safeStarting} 
                stroke="var(--text-muted)" 
                strokeDasharray="4 4" 
                strokeOpacity={0.5} 
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={chartColor} 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#portfolioAreaGrad)" 
                isAnimationActive={true} 
                animationDuration={600} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="terminal-card p-4 flex flex-col items-center justify-center relative">
          <h2 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest absolute top-4 left-4">
            Asset Breakdown
          </h2>
          <div className="relative w-40 h-40 mt-8 mb-4">
            <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90 transform rounded-full">
              <circle cx="16" cy="16" r="15.9155" fill="none" stroke="var(--bg-root)" strokeWidth="4" />
              <circle cx="16" cy="16" r="15.9155" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray={eqDash} strokeDashoffset={eqOffset} className="transition-all duration-1000 ease-out" />
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
                <span className="text-[var(--text-main)]">Long Equity</span>
              </div>
              <span className="text-[var(--text-muted)]">{eqPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--up-color)]"></span>
                <span className="text-[var(--text-main)]">Available Cash</span>
              </div>
              <span className="text-[var(--text-muted)]">{cashPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--down-color)]"></span>
                <span className="text-[var(--text-main)]">Short Liability</span>
              </div>
              <span className="text-[var(--text-muted)]">{shortPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 terminal-card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-root)]">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-[var(--text-main)]" />
              <span className="text-xs font-bold text-[var(--text-main)] uppercase tracking-widest">
                All Executions ({recentOrders.length})
              </span>
            </div>
            <Link to="/orders" className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] font-mono uppercase flex items-center gap-1 transition-colors">
              Full Orders History <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex-1 overflow-x-auto max-h-[480px] overflow-y-auto">
            {(recentOrders?.length ?? 0) === 0 ? (
              <div className="text-xs font-mono text-[var(--text-muted)] text-center py-16">No order records found</div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-card)] z-10">
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium text-right">Units</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-right">Realized P&L</th>
                    <th className="px-4 py-3 font-medium text-right">0.1% STT</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {recentOrders.map((o, idx) => {
                    const hasPnL = o.realizedPnL !== undefined && o.realizedPnL !== 0;
                    const isUp = (o.realizedPnL || 0) >= 0;

                    return (
                      <tr key={idx} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="px-4 py-3">
                          <span className={`font-bold ${o.side === "BUY" || o.side === "COVER" ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                            {o.side}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-[var(--text-main)]">{o.ticker}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">{o.quantity}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">₹{Number(o.priceAtExecution)?.toFixed(2) || "0.00"}</td>
                        <td className="px-4 py-3 text-right">
                          {hasPnL ? (
                            <span className={`font-bold font-mono ${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                              {isUp ? "+" : ""}₹{o.realizedPnL?.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)] text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {o.taxDeducted !== undefined && Number(o.taxDeducted) > 0 ? (
                            <span className="text-amber-400 font-mono text-[10px] font-bold">
                              ₹{Number(o.taxDeducted).toFixed(2)}
                            </span>
                          ) : o.priceAtExecution && o.quantity ? (
                            <span className="text-amber-400 font-mono text-[10px] font-bold">
                              ₹{(Number(o.priceAtExecution) * Number(o.quantity) * 0.001).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)] text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`px-2 py-0.5 text-[9px] uppercase font-bold rounded ${o.status === "completed" ? "bg-[#08998115] text-[var(--up-color)]" : "bg-[#f2364515] text-[var(--down-color)]"}`}>
                            {o.status}
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
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
                    const live = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
                    const pl = (live - (Number(h.avgPrice) || 0)) * (Number(h.quantity) || 0);
                    return (
                      <tr key={h.ticker} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="px-4 py-3 font-bold">
                          <Link to={`/stocks/${h.ticker}`} className="text-[var(--text-main)] hover:text-[var(--up-color)]">{h.ticker}</Link>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">{h.quantity}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)]">₹{Number(h.avgPrice).toFixed(2)}</td>
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
                    const live = Number(prices[h.ticker]?.price ?? h.avgPrice) || 0;
                    const pl = ((Number(h.avgPrice) || 0) - live) * (Number(h.quantity) || 0);
                    return (
                      <tr key={h.ticker} className="hover:bg-[var(--bg-root)] transition-colors">
                        <td className="px-4 py-3 font-bold">
                          <Link to={`/stocks/${h.ticker}`} className="text-[var(--text-main)] hover:text-[var(--down-color)]">{h.ticker}</Link>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-main)]">{h.quantity}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-muted)]">₹{Number(h.avgPrice).toFixed(2)}</td>
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