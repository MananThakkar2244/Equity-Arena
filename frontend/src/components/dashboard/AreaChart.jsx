import React, { useId, useMemo, useRef, useState } from 'react';

const W = 600;
const H = 220;
const PAD_L = 6;
const PAD_R = 6;

/**
 * Single-series area chart with a crosshair readout.
 *
 * Deliberately an area and not a candlestick: PriceHistory stores one price
 * per tick with no open/high/low/close, so candles would be invented data.
 */
export function AreaChart({ series = [], positive = true, label = '', height = 220 }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const { line, area, coords, min, max } = useMemo(() => {
    const pts = series.filter((p) => Number.isFinite(p));
    if (pts.length < 2) return { line: '', area: '', coords: [], min: 0, max: 0 };

    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const range = hi - lo || 1;
    const innerW = W - PAD_L - PAD_R;

    const cs = pts.map((p, i) => {
      const x = PAD_L + (i / (pts.length - 1)) * innerW;
      const y = H - 12 - ((p - lo) / range) * (H - 34);
      return { x, y, value: p };
    });

    let d = `M ${cs[0].x} ${cs[0].y}`;
    for (let i = 0; i < cs.length - 1; i++) {
      const a = cs[i];
      const b = cs[i + 1];
      const cx = (a.x + b.x) / 2;
      d += ` C ${cx} ${a.y}, ${cx} ${b.y}, ${b.x} ${b.y}`;
    }

    return {
      line: d,
      area: `${d} L ${cs[cs.length - 1].x} ${H} L ${cs[0].x} ${H} Z`,
      coords: cs,
      min: lo,
      max: hi
    };
  }, [series]);

  const stroke = positive ? '#1DB954' : '#E8453C';
  const uid = useId().replace(/:/g, '');
  const gradId = `arena-area-${uid}-${positive ? 'up' : 'down'}`;

  const handleMove = (e) => {
    if (!coords.length || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(coords.length - 1, Math.round(ratio * (coords.length - 1))));
    setHover({ ...coords[idx], idx });
  };

  if (!coords.length) {
    return (
      <div className="arena-shimmer flex items-center justify-center rounded-xl" style={{ height }}>
        <span className="font-mono text-[11px] theme-text-dim">Waiting for ticks…</span>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={{ height }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines */}
        {[0.15, 0.4, 0.65, 0.9].map((r) => (
          <line
            key={r}
            x1="0"
            x2={W}
            y1={H * r}
            y2={H * r}
            stroke="currentColor"
            strokeWidth="1"
            className="theme-text-dim"
            opacity="0.12"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Latest price marker */}
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="4" fill={stroke} />

        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1="0"
              y2={H}
              stroke={stroke}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hover.x} cy={hover.y} r="5" fill={stroke} stroke="var(--bg-card)" strokeWidth="2" />
          </>
        )}
      </svg>

      {/* Price axis */}
      <div className="pointer-events-none absolute left-1 top-0 flex h-full flex-col justify-between py-1 font-mono text-[9px] theme-text-dim">
        <span>{max.toFixed(2)}</span>
        <span>{((max + min) / 2).toFixed(2)}</span>
        <span>{min.toFixed(2)}</span>
      </div>

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border theme-border px-2.5 py-1.5 shadow-lg"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: 4,
            backgroundColor: 'var(--bg-panel)'
          }}
        >
          <div className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">{label || 'Price'}</div>
          <div className="font-mono text-[13px] font-bold tabular-nums theme-text-main">
            {hover.value.toFixed(2)} IC
          </div>
        </div>
      )}
    </div>
  );
}

export default AreaChart;
