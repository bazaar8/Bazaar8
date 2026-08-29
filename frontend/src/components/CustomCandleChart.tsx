import { useState, useRef, useEffect } from "react";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { rtdb } from "../config/firebase";

interface CustomCandleChartProps {
  ticker: string;
  basePrice: number;
  currentPrice: number;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function CustomCandleChart({ ticker, basePrice, currentPrice }: CustomCandleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [hoverData, setHoverData] = useState<{ time: string; price: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const historyRef = query(ref(rtdb, `priceHistory/${ticker}`), limitToLast(900));
    const unsub = onValue(historyRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const rawTicks = Object.keys(data).map(ts => ({
          ts: parseInt(ts, 10),
          price: data[ts]
        })).sort((a, b) => a.ts - b.ts);

        const bucketSize = 180000; 
        const grouped = new Map<number, number[]>();
        
        rawTicks.forEach(tick => {
          const bucket = Math.floor(tick.ts / bucketSize) * bucketSize;
          if (!grouped.has(bucket)) grouped.set(bucket, []);
          grouped.get(bucket)!.push(tick.price);
        });

        const processedCandles: Candle[] = [];
        const sortedBuckets = Array.from(grouped.keys()).sort();

        sortedBuckets.forEach(bucketTs => {
          const prices = grouped.get(bucketTs)!;
          const open = prices[0];
          const close = prices[prices.length - 1];
          const high = Math.max(...prices);
          const low = Math.min(...prices);
          processedCandles.push({
            time: new Date(bucketTs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            open, high, low, close
          });
        });

        if (processedCandles.length > 0) {
          setCandles(processedCandles);
        }
      } else {
        setCandles([{
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          open: basePrice, high: basePrice, low: basePrice, close: basePrice
        }]);
      }
    });
    return () => unsub();
  }, [ticker, basePrice]);

  useEffect(() => {
    if (!currentPrice || candles.length === 0) return;
    setCandles((prev) => {
      const next = [...prev];
      const last = { ...next[next.length - 1] };
      last.close = currentPrice;
      if (currentPrice > last.high) last.high = currentPrice;
      if (currentPrice < last.low) last.low = currentPrice;
      next[next.length - 1] = last;
      return next;
    });
  }, [currentPrice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const rightMargin = 60;
    const bottomMargin = 24;
    const chartWidth = width - rightMargin;
    const chartHeight = height - bottomMargin;

    ctx.clearRect(0, 0, width, height);

    const prices = candles.flatMap((c) => [c.high, c.low]);
    const minPrice = Math.min(...prices) * 0.998;
    const maxPrice = Math.max(...prices) * 1.002;
    const range = maxPrice - minPrice || 1;

    const isDark = document.documentElement.classList.contains("dark");
    const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
    const textColor = isDark ? "#787b86" : "#6b7280";
    const upColor = "#089981";
    const downColor = "#f23645";

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      const priceVal = maxPrice - (range / 5) * i;
      ctx.fillStyle = textColor;
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(priceVal.toFixed(2), chartWidth + 8, y + 4);
    }

    const maxVisibleCandles = 60;
    const xSpace = chartWidth / maxVisibleCandles;
    const candleWidth = Math.max(4, xSpace * 0.6); 
    candles.forEach((candle, idx) => {
      const distanceFromRight = (candles.length - 1 - idx) * xSpace;
      const x = chartWidth - 15 - distanceFromRight;

      if (x < 0) return; 

      const yOpen = chartHeight - ((candle.open - minPrice) / range) * chartHeight;
      const yClose = chartHeight - ((candle.close - minPrice) / range) * chartHeight;
      const yHigh = chartHeight - ((candle.high - minPrice) / range) * chartHeight;
      const yLow = chartHeight - ((candle.low - minPrice) / range) * chartHeight;

      const isUp = candle.close >= candle.open;
      const color = isUp ? upColor : downColor;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      ctx.fillStyle = color;
      const rectY = Math.min(yOpen, yClose);
      const rectH = Math.max(1, Math.abs(yOpen - yClose));
      ctx.fillRect(x - candleWidth / 2, rectY, candleWidth, rectH);
    });

    const last = candles[candles.length - 1];
    const lastY = chartHeight - ((last.close - minPrice) / range) * chartHeight;
    const lastColor = last.close >= last.open ? upColor : downColor;

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = lastColor;
    ctx.beginPath();
    ctx.moveTo(0, lastY);
    ctx.lineTo(chartWidth, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = lastColor;
    ctx.fillRect(chartWidth + 2, lastY - 10, rightMargin - 4, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(last.close.toFixed(2), chartWidth + 6, lastY + 3);

    if (hoverData) {
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoverData.x, 0);
      ctx.lineTo(hoverData.x, chartHeight);
      ctx.moveTo(0, hoverData.y);
      ctx.lineTo(chartWidth, hoverData.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, hoverData]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartWidth = rect.width - 60;
    const chartHeight = rect.height - 24;

    if (mouseX < 0 || mouseX > chartWidth) {
      setHoverData(null);
      return;
    }

    const maxVisibleCandles = 60;
    const xSpace = chartWidth / maxVisibleCandles;
    const distanceFromRightPx = chartWidth - 15 - mouseX;
    const candlesFromRight = Math.round(distanceFromRightPx / xSpace);
    const index = candles.length - 1 - candlesFromRight;

    if (index >= 0 && index < candles.length) {
      const item = candles[index];
      const prices = candles.flatMap((c) => [c.high, c.low]);
      const minPrice = Math.min(...prices) * 0.998;
      const maxPrice = Math.max(...prices) * 1.002;
      const range = maxPrice - minPrice || 1;

      const snappedX = chartWidth - 15 - (candlesFromRight * xSpace);
      const y = chartHeight - ((item.close - minPrice) / range) * chartHeight;
      setHoverData({ time: item.time, price: item.close, x: snappedX, y });
    } else {
      setHoverData(null);
    }
  };

  const handleMouseLeave = () => setHoverData(null);

  return (
    <div className="w-full h-full flex flex-col relative select-none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] text-xs font-mono">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[var(--text-main)]">{ticker} Live Feed</span>
          <span className="text-[var(--text-muted)] border px-1 border-[var(--border-subtle)] rounded">3M</span>
          {hoverData && (
            <span className="text-[var(--text-main)]">
              Hover: <strong className={hoverData.price >= basePrice ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}>
                ₹{hoverData.price.toFixed(2)}
              </strong> ({hoverData.time})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--up-color)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--up-color)] animate-pulse"></span>
          <span>SYNCED</span>
        </div>
      </div>
      <div className="relative flex-1 w-full min-h-[380px]">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block cursor-crosshair"
        />
      </div>
    </div>
  );
}