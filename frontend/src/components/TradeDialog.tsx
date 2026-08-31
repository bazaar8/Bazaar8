import { useState } from "react";
import { executeTrade } from "../services/tradeService";
import { X, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

interface TradeDialogProps {
  ticker: string;
  currentPrice: number;
  userCash: number;
  longQty: number;
  shortQty: number;
  onClose: () => void;
}

export default function TradeDialog({
  ticker,
  currentPrice,
  userCash,
  longQty,
  shortQty,
  onClose
}: TradeDialogProps) {
  const [side, setSide] = useState<"BUY" | "SELL" | "SHORT" | "COVER">("BUY");
  const [quantity, setQuantity] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<{ status: string; reason?: string; latencyMs?: number; roundtripMs?: number } | null>(null);

  const numQty = Math.max(0, parseInt(quantity, 10) || 0);
  const estimatedTotal = numQty * currentPrice;

  const handleAction = async () => {
    if (numQty <= 0) return;
    setLoading(true);
    setResult(null);

    try {
      const res: any = await executeTrade(ticker, side, numQty);
      setResult(res);
      setConfirmed(false);
    } catch (err: any) {
      setResult({ status: "rejected", reason: err.message || "Execution rejected by market engine" });
      setConfirmed(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 z-50">
      <div className="terminal-card max-w-md w-full p-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--text-main)] tracking-tight">{ticker}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-root)] text-[var(--text-muted)] font-mono rounded">NSE</span>
            <span className="text-sm font-mono text-[var(--up-color)] ml-2">₹{currentPrice.toFixed(2)}</span>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <div className="py-6 text-center space-y-3">
            {result.status === "completed" ? (
              <>
                <CheckCircle2 className="w-10 h-10 text-[var(--up-color)] mx-auto" />
                <div className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">Order Executed</div>
                <div className="text-xs font-mono text-[var(--text-muted)]">
                  {side} {numQty} {ticker} @ ₹{currentPrice.toFixed(2)}
                </div>
                <button
                  onClick={onClose}
                  className="mt-3 px-4 py-1.5 bg-[var(--up-color)] hover:opacity-90 text-white text-xs font-bold uppercase transition-opacity rounded"
                >
                  Close Terminal
                </button>
              </>
            ) : (
              <>
                <AlertCircle className="w-10 h-10 text-[var(--down-color)] mx-auto" />
                <div className="text-sm font-bold text-[var(--down-color)] uppercase tracking-wider">Execution Failed</div>
                <div className="text-xs font-mono text-[var(--down-color)] opacity-80 px-4">{result.reason}</div>
                <button
                  onClick={() => setResult(null)}
                  className="mt-3 px-4 py-1.5 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] text-xs font-bold uppercase transition-colors rounded border border-[var(--border-subtle)]"
                >
                  Modify Order
                </button>
              </>
            )}
          </div>
        ) : confirmed ? (
          <div className="py-4 space-y-4">
            <div className="bg-[var(--bg-root)] border border-[var(--border-subtle)] p-3 text-xs space-y-2 font-mono rounded">
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>ACTION</span>
                <span className={`font-bold ${side === "BUY" || side === "COVER" ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}`}>
                  {side}
                </span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>QUANTITY</span>
                <span className="text-[var(--text-main)]">{numQty} UNITS</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>PRICE</span>
                <span className="text-[var(--text-main)]">₹{currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2 mt-1">
                <span>ESTIMATED VALUE</span>
                <span className="text-[var(--up-color)] font-bold">
                  ₹{estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmed(false)}
                className="flex-1 py-2 bg-[var(--bg-root)] hover:bg-[var(--border-subtle)] text-[var(--text-main)] text-xs font-bold uppercase transition-colors rounded border border-[var(--border-subtle)]"
              >
                Back
              </button>
              <button
                onClick={handleAction}
                disabled={loading}
                className="flex-1 py-2 bg-[var(--up-color)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold uppercase transition-opacity flex items-center justify-center gap-1.5 rounded"
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Confirm</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-3">
            <div className="flex bg-[var(--bg-root)] p-1 border border-[var(--border-subtle)] rounded">
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

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-[var(--bg-root)] p-2.5 border border-[var(--border-subtle)] rounded font-mono">
              <div>
                <span className="text-[var(--text-muted)] block text-[9px] uppercase">Cash Margin</span>
                <span className="text-[var(--text-main)] font-bold">
                  ₹{userCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[var(--text-muted)] block text-[9px] uppercase">Position</span>
                <span className="text-[var(--text-main)] font-bold">
                  {longQty > 0 ? (
                    <span className="text-[var(--up-color)]">+{longQty} LONG</span>
                  ) : shortQty > 0 ? (
                    <span className="text-[var(--down-color)]">-{shortQty} SHORT</span>
                  ) : (
                    "0 FLAT"
                  )}
                </span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Quantity (Shares)</label>
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
                  {longQty > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSide("SELL");
                        setQuantity(String(longQty));
                      }}
                      className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-[9px] font-bold font-mono"
                      title="Sell all shares of this stock"
                    >
                      MAX ({longQty})
                    </button>
                  )}
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

            <div className="p-2.5 bg-[var(--bg-root)] border border-[var(--border-subtle)] rounded space-y-1 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase">Gross Value</span>
                <span className="text-sm font-bold text-[var(--text-main)]">
                  ₹{estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {(side === "SELL" || side === "COVER") && (
                <div className="flex items-center justify-between text-[10px] text-amber-400">
                  <span>0.1% Securities Transaction Tax (STT):</span>
                  <span>-₹{(estimatedTotal * 0.001).toFixed(2)}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setConfirmed(true)}
              disabled={numQty <= 0}
              className={`w-full py-2.5 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-colors rounded shadow-sm ${
                side === "BUY" || side === "COVER" ? "bg-[var(--up-color)] hover:opacity-90" : "bg-[var(--down-color)] hover:opacity-90"
              }`}
            >
              Review {side} Order
            </button>
          </div>
        )}
      </div>
    </div>
  );
}