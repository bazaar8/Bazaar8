interface SparklineProps {
  data: number[];
  isPositive: boolean;
  width?: number | string;
  height?: number;
  showArea?: boolean;
}

export default function Sparkline({ data, isPositive, width = "100%", height = 36, showArea = false }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className="bg-[var(--border-subtle)] rounded animate-pulse" style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  
  const viewBoxWidth = 1000;
  const viewBoxHeight = 100;
  const padding = showArea ? 2 : 6;
  const usableHeight = viewBoxHeight - padding * 2;

  const points: [number, number][] = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * viewBoxWidth;
    const y = viewBoxHeight - padding - ((val - min) / range) * usableHeight;
    return [x, y];
  });

  const smoothPath = (pts: [number, number][]) => {
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 >= pts.length ? i + 1 : i + 2];

      const tension = 0.15; 
      const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      const cp2y = p2[1] - (p3[1] - p1[1]) * tension;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  };

  const pathString = smoothPath(points);
  const strokeColor = isPositive ? "var(--up-color)" : "var(--down-color)";
  const fillColor = isPositive ? "url(#gradient-up)" : "url(#gradient-down)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} preserveAspectRatio="none" className="overflow-visible block">
      <defs>
        <linearGradient id="gradient-up" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--up-color)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--up-color)" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="gradient-down" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--down-color)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--down-color)" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      
      {showArea && (
        <path fill={fillColor} d={`${pathString} L ${viewBoxWidth},${viewBoxHeight} L 0,${viewBoxHeight} Z`} />
      )}
      
      <path fill="none" stroke={strokeColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" d={pathString} />
    </svg>
  );
}