import { useState, useRef, useEffect } from "react";
import { API_URL } from "../config/api";

interface CustomStockChartProps {
  ticker: string;
  basePrice: number;
  currentPrice: number;
}

export default function CustomStockChart({ ticker, basePrice, currentPrice }: CustomStockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [history, setHistory] = useState<{ time: string; price: number }[]>([]);
  const [hoverData, setHoverData] = useState<{ time: string; price: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem("bazaar_jwt_token");
        const res = await fetch(`${API_URL}/history/${ticker}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        
        let parsed: { timestamp: number; time: string; price: number }[] = [];
        
        if (json.data) {
          if (Array.isArray(json.data)) {
            parsed = json.data.map((d: any) => ({
              timestamp: parseInt(d.timestamp || d.ts, 10),
              time: new Date(parseInt(d.timestamp || d.ts, 10)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              price: Number(d.price)
            }));
          } else {
            parsed = Object.keys(json.data).map(ts => ({
              timestamp: parseInt(ts, 10),
              time: new Date(parseInt(ts, 10)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              price: Number(json.data[ts])
            }));
          }
        }

        if (parsed.length > 0) {
          parsed.sort((a, b) => a.timestamp - b.timestamp);
          if (parsed.length > 60) parsed = parsed.slice(parsed.length - 60);
          setHistory(parsed);
          return;
        }

        setHistory([{ 
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), 
          price: basePrice 
        }]);
      } catch (err) {
        setHistory([{ 
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), 
          price: basePrice 
        }]);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 60000);
    return () => clearInterval(interval);
  }, [ticker, basePrice]);

  useEffect(() => {
    if (!currentPrice || history.length === 0) return;
    const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setHistory((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.time === now) {
        last.price = currentPrice;
      } else {
        next.push({ time: now, price: currentPrice });
      }
      if (next.length > 60) return next.slice(next.length - 60);
      return next;
    });
  }, [currentPrice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const rightMargin = 70;
    const bottomMargin = 28;
    const chartWidth = width - rightMargin;
    const chartHeight = height - bottomMargin;

    ctx.clearRect(0, 0, width, height);

    const prices = history.map((h) => h.price);
    const minPrice = Math.min(...prices) * 0.998;
    const maxPrice = Math.max(...prices) * 1.002;
    const range = maxPrice - minPrice || 1;

    const isDark = document.documentElement.classList.contains("dark");
    const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
    const textColor = isDark ? "#787b86" : "#6b7280";
    const lineColor = currentPrice >= basePrice ? "#089981" : "#f23645";

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
      ctx.fillText(`₹${priceVal.toFixed(2)}`, chartWidth + 8, y + 3);
    }

    const points = history.map((item, idx) => {
      const x = (idx / Math.max(1, history.length - 1)) * chartWidth;
      const y = chartHeight - ((item.price - minPrice) / range) * chartHeight;
      return { x, y, ...item };
    });

    if (points.length > 1) {
      const grad = ctx.createLinearGradient(0, 0, 0, chartHeight);
      if (currentPrice >= basePrice) {
        grad.addColorStop(0, "rgba(8, 153, 129, 0.25)");
        grad.addColorStop(1, "rgba(8, 153, 129, 0.0)");
      } else {
        grad.addColorStop(0, "rgba(242, 54, 69, 0.25)");
        grad.addColorStop(1, "rgba(242, 54, 69, 0.0)");
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const mx = (p1.x + p2.x) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, mx, (p1.y + p2.y) / 2);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(points[points.length - 1].x, chartHeight);
      ctx.lineTo(0, chartHeight);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const mx = (p1.x + p2.x) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, mx, (p1.y + p2.y) / 2);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();

      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = lineColor;
      ctx.beginPath();
      ctx.moveTo(0, last.y);
      ctx.lineTo(chartWidth, last.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = lineColor;
      ctx.fillRect(chartWidth + 2, last.y - 9, rightMargin - 4, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(currentPrice.toFixed(2), chartWidth + 6, last.y + 3);
    }

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
  }, [history, hoverData, currentPrice, basePrice]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rightMargin = 70;
    const bottomMargin = 28;
    const chartWidth = rect.width - rightMargin;
    const chartHeight = rect.height - bottomMargin;

    if (x < 0 || x > chartWidth) {
      setHoverData(null);
      return;
    }

    const index = Math.min(
      history.length - 1,
      Math.max(0, Math.round((x / chartWidth) * (history.length - 1)))
    );
    const item = history[index];

    const prices = history.map((h) => h.price);
    const minPrice = Math.min(...prices) * 0.998;
    const maxPrice = Math.max(...prices) * 1.002;
    const range = maxPrice - minPrice || 1;

    const y = chartHeight - ((item.price - minPrice) / range) * chartHeight;
    setHoverData({ time: item.time, price: item.price, x, y });
  };

  const handleMouseLeave = () => {
    setHoverData(null);
  };

  return (
    <div className="w-full h-full flex flex-col relative select-none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] text-xs font-mono">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[var(--text-main)]">{ticker} Live Feed</span>
          <span className="text-[var(--text-muted)]">Interval: 12s</span>
          {hoverData && (
            <span className="text-[var(--text-main)]">
              Hover: <strong className="text-[var(--up-color)]">₹{hoverData.price.toFixed(2)}</strong> ({hoverData.time})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--up-color)]">
          <span className="w-2 h-2 rounded-full bg-[var(--up-color)] animate-pulse"></span>
          <span>LIVE SOCKET SYNC</span>
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