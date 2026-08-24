import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { STOCKS_CATALOG } from "../data/stocksData";
import CustomCandleChart from "../components/CustomCandleChart";
import { executeTrade } from "../services/tradeService";
import { ArrowLeft, TrendingUp, TrendingDown, Layers, Activity, CheckCircle2, AlertCircle } from "lucide-react";

export default function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { prices, marketStatus } = useLivePrices();
  const { cashBalance, longHoldings, shortHoldings } = useUserTradingData();
  
  const [side, setSide] = useState<"BUY" | "SELL" | "SHORT" | "COVER">("BUY");
  const [quantity, setQuantity] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; reason?: string } | null>(null);

  const stockMeta = STOCKS_CATALOG.find((s) => s.ticker === ticker) || {
    ticker: ticker || "RELIANCE",
    name: "Equity Instrument",
    sector: "Diversified",
    basePrice: 1000.0
  };

  const livePrice = prices[stockMeta.ticker]?.price ?? stockMeta.basePrice;
  const change = livePrice - stockMeta.basePrice;
  const changePct = (change / stockMeta.basePrice) * 100;
  const isUp = change >= 0;

  const longPosition = longHoldings.find((h) => h.ticker === stockMeta.ticker);
  const shortPosition = shortHoldings.find((h) => h.ticker === stockMeta.ticker);

  const numQty = Math.max(0, parseInt(quantity, 10) || 0);
  const estimatedTotal = numQty * livePrice;

  const handleAction = async () => {
    if (numQty <= 0) return;
    setLoading(true);
    setResult(null);

    try {
      const res: any = await executeTrade(stockMeta.ticker, side, numQty);
      setResult(res);
      if (res.status === "completed") setQuantity("1");
    } catch (err: any) {
      setResult({ status: "rejected", reason: err.message || "Execution rejected by market engine" });
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 4000);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link
          to="/stocks"
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] uppercase transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Stock Directory</span>
        </Link>
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
          <Activity className="w-3 h-3 text-[var(--up-color)]" />
          <span>SIMULATION: 1.2S • {marketStatus}</span>
        </div>
      </div>

      <div className="terminal-card p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">{stockMeta.ticker}</h1>
            <span className="text-[10px] px-2 py-0.5 bg-[var(--bg-root)] text-[var(--text-muted)] border border-[var(--border-subtle)] uppercase font-mono rounded">
              {stockMeta.sector}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">{stockMeta.name}</p>
        </div>

        <div className="text-left md:text-right">
          <div className="text-3xl font-bold font-mono text-[var(--text-main)]">
            ₹{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div
            className={`text-sm font-mono font-bold flex items-center md:justify-end gap-1 mt-1 ${
              isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"
            }`}
          >
            {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>
              {isUp ? "+" : ""}
              {change.toFixed(2)} ({isUp ? "+" : ""}
              {changePct.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
        <div className="lg:col-span-2 w-full flex flex-col gap-4">
          <div className="terminal-card p-1 flex flex-col h-[460px] w-full overflow-hidden">
            <CustomCandleChart
              ticker={stockMeta.ticker}
              basePrice={stockMeta.basePrice}
              currentPrice={livePrice}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[9px] uppercase">Base Price</span>
              <span className="text-[var(--text-main)] font-bold">₹{stockMeta.basePrice.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[9px] uppercase">Current Live</span>
              <span className="text-[var(--up-color)] font-bold">₹{livePrice.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[9px] uppercase">Spread / Diff</span>
              <span className={`${isUp ? "text-[var(--up-color)]" : "text-[var(--down-color)]"} font-bold`}>
                {isUp ? "+" : ""}₹{change.toFixed(2)}
              </span>
            </div>
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[9px] uppercase">Exchange Engine</span>
              <span className="text-[#3b82f6] font-bold">BAZAAR SIM</span>
            </div>
          </div>
        </div>

        <div className="w-full flex flex-col gap-4">
          <div className="terminal-card p-4">
            <h3 className="text-xs font-bold text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2 mb-3">Order Entry</h3>
            
            <div className="flex bg-[var(--bg-root)] p-1 border border-[var(--border-subtle)] rounded mb-4">
              <button
                type="button"
                onClick={() => setSide("BUY")}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors rounded-sm ${
                  side === "BUY" ? "bg-[var(--up-color)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setSide("SELL")}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors rounded-sm ${
                  side === "SELL" ? "bg-[var(--down-color)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                SELL
              </button>
              <button
                type="button"
                onClick={() => setSide("SHORT")}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors rounded-sm ${
                  side === "SHORT" ? "bg-[#d97706] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                SHORT
              </button>
              <button
                type="button"
                onClick={() => setSide("COVER")}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors rounded-sm ${
                  side === "COVER" ? "bg-[#4f46e5] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                COVER
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-[var(--bg-root)] px-3 py-2 rounded border border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Execution Type</span>
                <span className="text-xs font-medium text-[var(--text-main)]">Market Order</span>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Quantity</label>
                  <div className="flex gap-1">
                    {[10, 50, 100].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuantity(String(q))}
                        className="px-1.5 py-0.5 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] rounded text-[9px] font-mono transition-colors"
                      >
                        +{q}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-[var(--text-main)] font-mono text-sm focus:outline-none focus:border-[var(--up-color)] transition-colors"
                />
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                <div className="flex justify-between items-center font-mono">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">Available Cash</span>
                  <span className="text-[11px] text-[var(--text-main)] font-bold">₹{cashBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center font-mono">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">Est. Order Value</span>
                  <span className="text-[11px] font-bold text-[var(--text-main)]">₹{estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {result && (
                <div className={`p-2 rounded text-[10px] font-mono font-bold flex items-start gap-1.5 ${result.status === "completed" ? "bg-[#08998115] text-[var(--up-color)] border border-[#08998130]" : "bg-[#f2364515] text-[var(--down-color)] border border-[#f2364530]"}`}>
                  {result.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="leading-tight">{result.status === "completed" ? `Order executed at ₹${livePrice.toFixed(2)}` : result.reason}</span>
                </div>
              )}

              <button
                onClick={handleAction}
                disabled={loading || numQty <= 0}
                className={`w-full py-3 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-colors rounded shadow-sm flex items-center justify-center gap-2 ${
                  side === "BUY" || side === "COVER" ? "bg-[var(--up-color)] hover:opacity-90" : "bg-[var(--down-color)] hover:opacity-90"
                }`}
              >
                {loading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Place ${side} Order`}
              </button>
            </div>
          </div>

          <div className="terminal-card p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2">
              <Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>Current Positions</span>
            </div>

            <div className="p-3 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)] border-l-2 border-l-[var(--up-color)]">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[var(--up-color)] font-bold uppercase text-[10px]">LONG</span>
                <span className="text-[var(--text-main)] font-bold">{longPosition?.quantity || 0} Shares</span>
              </div>
              <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-mono mt-1">
                <span>Avg Entry</span>
                <span>₹{longPosition?.avgPrice?.toFixed(2) || "0.00"}</span>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)] border-l-2 border-l-[var(--down-color)]">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[var(--down-color)] font-bold uppercase text-[10px]">SHORT</span>
                <span className="text-[var(--text-main)] font-bold">{shortPosition?.quantity || 0} Shares</span>
              </div>
              <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-mono mt-1">
                <span>Avg Entry</span>
                <span>₹{shortPosition?.avgPrice?.toFixed(2) || "0.00"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}