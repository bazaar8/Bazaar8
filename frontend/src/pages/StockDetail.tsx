import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrices";
import { useUserTradingData } from "../hooks/useUserTradingData";
import { STOCKS_CATALOG } from "../data/stocksData";
import CustomCandleChart from "../components/CustomCandleChart";
import { executeTrade } from "../services/tradeService";
import { ArrowLeft, TrendingUp, TrendingDown, CheckCircle2, AlertCircle, Zap, ShieldCheck } from "lucide-react";

export default function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { prices, marketStatus } = useLivePrices();
  const { cashBalance, longHoldings } = useUserTradingData();
  
  const [side, setSide] = useState<"BUY" | "SELL" | "SHORT" | "COVER">("BUY");
  const [quantity, setQuantity] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; reason?: string; latencyMs?: number; roundtripMs?: number; taxDeducted?: number; realizedPnL?: number } | null>(null);

  const dbData = prices[ticker || ""] as any;
  const catalogData = STOCKS_CATALOG.find((s) => s.ticker === ticker);
  
  const stockMeta = {
    ticker: ticker || "RELIANCE",
    name: dbData?.name || catalogData?.name || "Equity Instrument",
    sector: dbData?.sector || catalogData?.sector || "Diversified",
    basePrice: Number(dbData?.basePrice || catalogData?.basePrice || 1000.0)
  };

  const livePrice = Number(prices[stockMeta.ticker]?.price ?? stockMeta.basePrice);
  const change = livePrice - stockMeta.basePrice;
  const changePct = stockMeta.basePrice > 0 ? (change / stockMeta.basePrice) * 100 : 0;
  const isUp = change >= 0;

  // Highest & Lowest value of the stock
  const highestValue = Number(dbData?.high || Math.max(livePrice, stockMeta.basePrice * 1.06));
  const lowestValue = Number(dbData?.low || Math.min(livePrice, stockMeta.basePrice * 0.94));

  const longPosition = longHoldings.find((h) => h.ticker === stockMeta.ticker);

  const numQty = Math.max(0, parseInt(quantity, 10) || 0);
  const estimatedTotal = numQty * livePrice;
  const estimatedTax = (side === "SELL" || side === "COVER") ? estimatedTotal * 0.001 : 0;
  const netProceeds = side === "SELL" ? estimatedTotal - estimatedTax : estimatedTotal + estimatedTax;

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
      setTimeout(() => setResult(null), 5000);
    }
  };

  // Sell all bought shares of this specific stock at once
  const handleSellAllSpecificStock = async () => {
    if (!longPosition || longPosition.quantity <= 0) return;
    setSide("SELL");
    setQuantity(String(longPosition.quantity));
    setLoading(true);
    setResult(null);

    try {
      const res: any = await executeTrade(stockMeta.ticker, "SELL", longPosition.quantity);
      setResult(res);
      setQuantity("1");
    } catch (err: any) {
      setResult({ status: "rejected", reason: err.message || "Execution error" });
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Breadcrumb & Status */}
      <div className="flex items-center justify-between">
        <Link
          to="/stocks"
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] uppercase transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Stock Directory</span>
        </Link>
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-[var(--up-color)] animate-ping" />
          <span>SIMULATION: 1.2S • {marketStatus}</span>
        </div>
      </div>

      {/* Main Stock Banner with Highest Value */}
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

        <div className="flex items-center gap-6">
          {/* Highest Value of the Stock Display */}
          <div className="text-left md:text-right border-l-2 md:border-l-0 md:border-r border-[var(--border-subtle)] pl-3 md:pl-0 md:pr-6">
            <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
              Highest Value (ATH)
            </span>
            <span className="text-xl font-mono font-black text-amber-400">
              ₹{highestValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9px] font-mono text-[var(--text-muted)] block">
              Low: ₹{lowestValue.toFixed(2)}
            </span>
          </div>

          <div className="text-left md:text-right">
            <div className="text-3xl font-bold font-mono text-[var(--text-main)]">
              ₹{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
        {/* Left 2 Cols: Chart & Metrics */}
        <div className="lg:col-span-2 w-full flex flex-col gap-4">
          <div className="terminal-card p-1 flex flex-col h-[460px] w-full overflow-hidden">
            <CustomCandleChart
              ticker={stockMeta.ticker}
              basePrice={stockMeta.basePrice}
              currentPrice={livePrice}
            />
          </div>

          {/* Key Stock Metrics Bar with Highest Value */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[9px] uppercase">Base Price</span>
              <span className="text-[var(--text-main)] font-bold">₹{stockMeta.basePrice.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-amber-400 block text-[9px] uppercase font-bold">Highest Value</span>
              <span className="text-amber-400 font-black">₹{highestValue.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[9px] uppercase">Lowest Value</span>
              <span className="text-[var(--text-muted)] font-bold">₹{lowestValue.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-[var(--bg-card)] rounded border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[9px] uppercase">Transaction Tax</span>
              <span className="text-[var(--up-color)] font-bold">0.1% STT</span>
            </div>
          </div>
        </div>

        {/* Right Col: Order Pad (Current Positions completely removed) */}
        <div className="w-full flex flex-col gap-4">
          <div className="terminal-card p-4">
            <h3 className="text-xs font-bold text-[var(--text-main)] border-b border-[var(--border-subtle)] pb-2 mb-3">
              Order Entry Pad
            </h3>
            
            {/* Side Tabs */}
            <div className="flex bg-[var(--bg-root)] p-1 border border-[var(--border-subtle)] rounded mb-4">
              {(["BUY", "SELL", "SHORT", "COVER"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSide(t)}
                  className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase transition-colors rounded ${
                    side === t
                      ? t === "BUY" || t === "COVER"
                        ? "bg-[var(--up-color)] text-white shadow-sm"
                        : "bg-[var(--down-color)] text-white shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Quick 1-Click "Sell All Specific Stock" Button */}
            {longPosition && longPosition.quantity > 0 && (
              <div className="mb-4 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-[var(--text-muted)]">You Own:</span>
                  <span className="font-bold text-[var(--text-main)]">{longPosition.quantity} Shares</span>
                </div>
                <button
                  type="button"
                  onClick={handleSellAllSpecificStock}
                  disabled={loading}
                  className="w-full py-2 bg-[var(--down-color)] text-white text-[11px] font-bold font-mono uppercase tracking-wider rounded hover:opacity-90 transition-opacity shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Sell All {longPosition.quantity} {stockMeta.ticker} Shares At Once</span>
                </button>
              </div>
            )}

            <div className="space-y-4">
              {/* Quantity Input with Chips */}
              <div>
                <div className="flex justify-between items-center text-xs text-[var(--text-muted)] font-mono mb-1">
                  <span>Order Quantity</span>
                  <div className="flex gap-1">
                    {[1, 10, 50, 100].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuantity(String(q))}
                        className="px-1.5 py-0.5 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] rounded text-[10px]"
                      >
                        +{q}
                      </button>
                    ))}
                    {longPosition && longPosition.quantity > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSide("SELL");
                          setQuantity(String(longPosition.quantity));
                        }}
                        className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-[10px] font-bold"
                        title="Sell all shares of this stock"
                      >
                        MAX ({longPosition.quantity})
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--up-color)] font-mono"
                />
              </div>

              {/* Order Cost, 1% Tax & Proceeds */}
              <div className="p-3 bg-[var(--bg-root)] rounded border border-[var(--border-subtle)] space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Gross Value:</span>
                  <span className="text-[var(--text-main)] font-bold">
                    ₹{estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {(side === "SELL" || side === "COVER") && (
                  <div className="flex justify-between text-amber-400">
                    <span>0.1% Securities Transaction Tax (STT):</span>
                    <span>-₹{estimatedTax.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between border-t border-[var(--border-subtle)] pt-1.5 font-bold">
                  <span className="text-[var(--text-muted)]">
                    {side === "SELL" ? "Net Proceeds:" : "Total Cost:"}
                  </span>
                  <span className={side === "BUY" || side === "COVER" ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}>
                    ₹{netProceeds.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-1">
                  <span>Cash Balance:</span>
                  <span>₹{cashBalance?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Feedback Telemetry */}
              {result && (
                <div className={`p-3 rounded text-xs font-mono flex flex-col gap-1 border ${
                  result.status === "completed"
                    ? "bg-[#089981]/15 text-[var(--up-color)] border-[#089981]/30"
                    : "bg-[#f23645]/15 text-[var(--down-color)] border-[#f23645]/30"
                }`}>
                  <div className="flex items-center gap-2 font-bold">
                    {result.status === "completed" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                    <span>{result.status === "completed" ? "Order Executed Successfully" : result.reason}</span>
                  </div>
                  {result.taxDeducted !== undefined && result.taxDeducted > 0 && (
                    <div className="flex items-center justify-between text-[10px] pl-6 text-amber-400">
                      <span>0.1% STT to Treasury:</span>
                      <span>₹{result.taxDeducted.toFixed(2)}</span>
                    </div>
                  )}
                  {result.realizedPnL !== undefined && (
                    <div className="flex items-center justify-between text-[10px] pl-6 font-bold">
                      <span>Realized P&L:</span>
                      <span className={result.realizedPnL >= 0 ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}>
                        {result.realizedPnL >= 0 ? "+" : ""}₹{result.realizedPnL.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleAction}
                disabled={loading || numQty <= 0}
                className={`w-full py-3 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-colors rounded shadow-sm flex items-center justify-center gap-2 ${
                  side === "BUY" || side === "COVER" ? "bg-[var(--up-color)] hover:opacity-90" : "bg-[var(--down-color)] hover:opacity-90"
                }`}
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Place {side} Order ({numQty} Shares)</span>
                  </>
                )}
              </button>

              <div className="text-[10px] text-[var(--text-muted)] font-mono text-center flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[var(--up-color)]" />
                <span>Ultra-Low 1ms Latency Institutional Execution</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}