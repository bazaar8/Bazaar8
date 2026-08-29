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
  
  // Interactive TradingView State
  const [visibleCount, setVisibleCount] = useState(40); 
  const [candleOffset, setCandleOffset] = useState(0);  
  const [priceScale, setPriceScale] = useState(0.15);   
  
  const isDraggingX = useRef(false);
  const isDraggingY = useRef(false);
  const isDraggingTime = useRef(false);
  const lastMouseX = useRef(0);
  const lastMouseY = useRef(0);

  // Fetch & Aggregate Realtime DB ticks
  useEffect(() => {
    const historyRef = query(ref(rtdb, `priceHistory/${ticker}`), limitToLast(1000));
    const unsub = onValue(historyRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const rawTicks = Object.keys(data).map(ts => ({
          ts: parseInt(ts, 10),
          price: Number(data[ts])
        })).sort((a, b) => a.ts - b.ts);

        const bucketSize = 120000; 
        const grouped = new Map<number, number[]>();
        
        rawTicks.forEach(tick => {
          const bucket = Math.floor(tick.ts / bucketSize) * bucketSize;
          if (!grouped.has(bucket)) grouped.set(bucket, []);
          grouped.get(bucket)!.push(tick.price);
        });

        const processed: Candle[] = [];
        Array.from(grouped.keys()).sort().forEach(bucketTs => {
          const prices = grouped.get(bucketTs)!;
          processed.push({
            time: new Date(bucketTs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            open: prices[0],
            high: Math.max(...prices),
            low: Math.min(...prices),
            close: prices[prices.length - 1]
          });
        });

        if (processed.length > 0) setCandles(processed);
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

  // Canvas Drawing
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
    const rightMargin = 65;
    const bottomMargin = 26;
    const chartWidth = width - rightMargin;
    const chartHeight = height - bottomMargin;

    // Drawing area safe zones to prevent wick clipping
    const yOffset = 15;
    const effectiveHeight = chartHeight - (yOffset * 2);

    ctx.clearRect(0, 0, width, height);

    const maxOffset = Math.max(0, candles.length - visibleCount);
    const safeOffset = Math.max(0, Math.min(candleOffset, maxOffset));
    const endIndex = candles.length - Math.floor(safeOffset);
    const startIndex = Math.max(0, endIndex - visibleCount);
    const visibleCandles = candles.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;

    const prices = visibleCandles.flatMap((c) => [c.high, c.low]);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const pad = Math.max((rawMax - rawMin) * priceScale, 1.5);
    const minPrice = rawMin - pad;
    const maxPrice = rawMax + pad;
    const range = maxPrice - minPrice || 1;

    const style = getComputedStyle(document.documentElement);
    const upColor = style.getPropertyValue('--up-color').trim() || '#089981';
    const downColor = style.getPropertyValue('--down-color').trim() || '#f23645';
    const textColor = style.getPropertyValue('--text-muted').trim() || '#94a3b8';
    const gridColor = 'rgba(255, 255, 255, 0.04)';

    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = yOffset + Math.round((effectiveHeight / gridSteps) * i);
      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      const priceVal = maxPrice - (range / gridSteps) * i;
      ctx.fillStyle = textColor;
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(priceVal.toFixed(2), chartWidth + 8, y + 3.5);
    }

    const slotWidth = chartWidth / visibleCount;
    const candleWidth = Math.max(2, slotWidth * 0.6);

    visibleCandles.forEach((candle, idx) => {
      const fractionalOffset = candleOffset % 1;
      const x = (idx * slotWidth) + (slotWidth / 2) + (fractionalOffset * slotWidth);

      if (x < 0 || x > chartWidth) return;

      const yOpen = yOffset + effectiveHeight - ((candle.open - minPrice) / range) * effectiveHeight;
      const yClose = yOffset + effectiveHeight - ((candle.close - minPrice) / range) * effectiveHeight;
      const yHigh = yOffset + effectiveHeight - ((candle.high - minPrice) / range) * effectiveHeight;
      const yLow = yOffset + effectiveHeight - ((candle.low - minPrice) / range) * effectiveHeight;

      const isUp = candle.close >= candle.open;
      const color = isUp ? upColor : downColor;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      ctx.fillStyle = color;
      const topY = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.5, Math.abs(yOpen - yClose));
      ctx.fillRect(x - candleWidth / 2, topY, candleWidth, bodyH);

      const labelInterval = Math.max(1, Math.floor(visibleCount / 6));
      if (idx % labelInterval === 0) {
        ctx.fillStyle = textColor;
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(candle.time, x, height - 6);
      }
    });

    if (candleOffset < 1) {
      const last = candles[candles.length - 1];
      const lastY = yOffset + effectiveHeight - ((last.close - minPrice) / range) * effectiveHeight;
      const lastColor = last.close >= last.open ? upColor : downColor;

      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = lastColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(chartWidth, lastY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = lastColor;
      ctx.fillRect(chartWidth + 2, lastY - 9, 60, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(last.close.toFixed(2), chartWidth + 6, lastY + 3.5);
    }

    if (hoverData && !isDraggingX.current && !isDraggingY.current && !isDraggingTime.current) {
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoverData.x, 0);
      ctx.lineTo(hoverData.x, chartHeight);
      ctx.moveTo(0, hoverData.y);
      ctx.lineTo(chartWidth, hoverData.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, hoverData, visibleCount, candleOffset, priceScale]);

  // --- Interactive Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const chartWidth = rect.width - 65;
    const chartHeight = rect.height - 26;

    if (mouseX > chartWidth) {
      isDraggingY.current = true;
      lastMouseY.current = e.clientY;
      document.body.style.cursor = 'ns-resize';
    } else if (mouseY > chartHeight) {
      isDraggingTime.current = true;
      lastMouseX.current = e.clientX;
      document.body.style.cursor = 'ew-resize';
    } else {
      isDraggingX.current = true;
      lastMouseX.current = e.clientX;
      document.body.style.cursor = 'grabbing';
    }
  };

  const handleMouseUp = () => {
    isDraggingX.current = false;
    isDraggingY.current = false;
    isDraggingTime.current = false;
    document.body.style.cursor = 'default';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartWidth = rect.width - 65;
    const chartHeight = rect.height - 26;
    const yOffset = 15;
    const effectiveHeight = chartHeight - (yOffset * 2);

    if (isDraggingY.current) {
      const deltaY = e.clientY - lastMouseY.current;
      lastMouseY.current = e.clientY;
      setPriceScale(prev => Math.max(0.01, prev + (deltaY * 0.01)));
      setHoverData(null);
      return;
    }

    if (isDraggingTime.current) {
      const deltaX = e.clientX - lastMouseX.current;
      lastMouseX.current = e.clientX;
      setVisibleCount(prev => Math.max(10, Math.min(prev - (deltaX * 0.5), 300)));
      setHoverData(null);
      return;
    }

    if (isDraggingX.current) {
      const deltaX = e.clientX - lastMouseX.current;
      lastMouseX.current = e.clientX;
      const slotWidth = chartWidth / visibleCount;
      const shift = deltaX / slotWidth;
      
      setCandleOffset(prev => {
        const next = prev + shift;
        const maxOffset = Math.max(0, candles.length - visibleCount);
        return Math.max(0, Math.min(next, maxOffset));
      });
      setHoverData(null);
      return;
    }

    if (mouseX < 0 || mouseX > chartWidth) {
      setHoverData(null);
      return;
    }

    const slotWidth = chartWidth / visibleCount;
    const fractionalOffset = candleOffset % 1;
    const hoverIdx = Math.floor((mouseX / slotWidth) - fractionalOffset);
    
    const safeOffset = Math.max(0, Math.min(candleOffset, Math.max(0, candles.length - visibleCount)));
    const endIndex = candles.length - Math.floor(safeOffset);
    const startIndex = Math.max(0, endIndex - visibleCount);
    const visibleCandles = candles.slice(startIndex, endIndex);

    if (hoverIdx >= 0 && hoverIdx < visibleCandles.length) {
      const item = visibleCandles[hoverIdx];
      const prices = visibleCandles.flatMap((c) => [c.high, c.low]);
      const rawMin = Math.min(...prices);
      const rawMax = Math.max(...prices);
      const pad = Math.max((rawMax - rawMin) * priceScale, 1.5);
      
      const minPrice = rawMin - pad;
      const maxPrice = rawMax + pad;
      const range = maxPrice - minPrice;

      const candleX = (hoverIdx * slotWidth) + (slotWidth / 2) + (fractionalOffset * slotWidth);
      const candleY = yOffset + effectiveHeight - ((item.close - minPrice) / range) * effectiveHeight;

      setHoverData({ time: item.time, price: item.close, x: candleX, y: candleY });
    } else {
      setHoverData(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // If scrolling horizontally on a trackpad (deltaX), pan the chart
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const chartWidth = canvas.getBoundingClientRect().width - 65;
      const slotWidth = chartWidth / visibleCount;
      
      // Calculate smooth shift based on trackpad movement
      const shift = e.deltaX / slotWidth; 
      
      setCandleOffset(prev => {
        const maxOffset = Math.max(0, candles.length - visibleCount);
        return Math.max(0, Math.min(prev + shift, maxOffset));
      });
    } else {
      // If scrolling vertically (mouse wheel / trackpad up-down), zoom in/out
      const zoomSpeed = e.deltaY > 0 ? 4 : -4;
      setVisibleCount(prev => Math.max(10, Math.min(prev + zoomSpeed, 300))); 
    }
  };

  const handleReset = () => {
    setCandleOffset(0);
    setPriceScale(0.15);
    setVisibleCount(40);
  };

  return (
    <div className="w-full h-full flex flex-col relative select-none bg-[var(--bg-root)]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[var(--text-main)]">{ticker} Live Feed</span>
          <span className="text-[10px] text-[var(--text-muted)] border px-1.5 py-0.5 border-[var(--border-subtle)] rounded">
            {Math.round(visibleCount)} CANDLES
          </span>
          {hoverData && (
            <span className="text-[var(--text-main)] text-xs">
              Price: <strong className={hoverData.price >= basePrice ? "text-[var(--up-color)]" : "text-[var(--down-color)]"}>
                ₹{hoverData.price.toFixed(2)}
              </strong> ({hoverData.time})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--up-color)] font-bold">
          <button 
            onClick={handleReset} 
            className={`border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-0.5 rounded transition-opacity ${candleOffset > 1 || priceScale !== 0.15 || visibleCount !== 40 ? 'opacity-100 hover:bg-[var(--border-subtle)] cursor-pointer' : 'opacity-0 pointer-events-none'}`}
          >
            RESET CHART
          </button>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--up-color)] animate-pulse ml-2"></span>
          <span>LIVE SYNC</span>
        </div>
      </div>
      <div className="relative flex-1 w-full min-h-[380px]">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          className="w-full h-full block cursor-crosshair"
          title="Drag X-Axis (bottom) to zoom time. Drag Y-Axis (right) to scale price. Drag chart to pan."
        />
      </div>
    </div>
  );
}