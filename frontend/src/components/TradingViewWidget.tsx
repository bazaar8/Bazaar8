import { useEffect, useRef, memo } from 'react';

function TradingViewWidget({ symbol }: { symbol: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';
    
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    
    const isDark = document.documentElement.classList.contains('dark');

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `BSE:${symbol}`,
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: isDark ? "dark" : "light",
      style: "1",
      locale: "en",
      enable_publishing: false,
      backgroundColor: isDark ? "#0b0e14" : "#ffffff",
      gridColor: isDark ? "#1a1e29" : "#e5e7eb",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      hide_side_toolbar: false, 
      allow_symbol_change: false,
      details: true,
      container_id: `tv_chart_${symbol}`
    });

    container.current.appendChild(script);
  }, [symbol]);

  return <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }} />;
}

export default memo(TradingViewWidget);