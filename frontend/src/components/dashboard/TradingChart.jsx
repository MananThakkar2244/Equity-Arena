import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Price chart at per-pixel resolution.
 *
 * One plotted point per pixel column, so the crosshair reads a true price at
 * every x position: no stepping, no gaps. Each column keeps its own high and
 * low, so a spike between two samples is never averaged away even though only
 * the closing price is drawn.
 *
 * Deliberately line-only — no candles, no moving average, no volume panel.
 * Every value on screen comes from a stored tick; nothing is synthesised.
 */

const PAD = { top: 16, right: 66, bottom: 44, left: 12 };

const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * One sample per pixel column, keeping the true extremes inside each column so
 * spikes are never averaged away.
 */
function toLineSamples(ticks, columns) {
  if (!ticks.length) return [];
  if (ticks.length <= columns) {
    return ticks.map((t) => ({ price: t.price, high: t.price, low: t.price, volume: t.volume || 0, time: t.timestamp }));
  }

  const size = ticks.length / columns;
  const out = [];
  for (let c = 0; c < columns; c++) {
    const start = Math.floor(c * size);
    const end = Math.max(start + 1, Math.floor((c + 1) * size));
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (let j = start; j < end && j < ticks.length; j++) {
      const p = ticks[j].price;
      if (p > high) high = p;
      if (p < low) low = p;
      volume += ticks[j].volume || 0;
    }
    const last = ticks[Math.min(end, ticks.length) - 1];
    out.push({ price: last.price, high, low, volume, time: last.timestamp });
  }
  return out;
}

const clock = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const hhmm = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export function TradingChart({ ticks = [], symbol = '', height = 430 }) {
  const uid = useId().replace(/:/g, '');
  const fillId = `trading-chart-${uid}-fill`;
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const el = wrapRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(Math.max(320, Math.floor(w)));
    });
    ro.observe(el);
    setWidth(Math.max(320, Math.floor(el.getBoundingClientRect().width || 900)));
    return () => ro.disconnect();
  }, []);

  // Cap the chart height on smaller viewports so it stays usable on phones.
  const chartHeight = Math.min(
    height,
    width < 420 ? 270 : width < 640 ? 300 : width < 900 ? 350 : height
  );

  const plotW = Math.max(60, width - PAD.left - PAD.right);
  const plotH = Math.max(80, chartHeight - PAD.top - PAD.bottom);

  const clean = useMemo(() => (ticks || []).filter((t) => Number.isFinite(t?.price)), [ticks]);
  const series = useMemo(() => toLineSamples(clean, Math.floor(plotW)), [clean, plotW]);
  const n = series.length;

  const scale = useMemo(() => {
    if (!n) return null;

    let lo = Infinity;
    let hi = -Infinity;
    for (const d of series) {
      if (d.high > hi) hi = d.high;
      if (d.low < lo) lo = d.low;
    }
    const span = hi - lo;
    const pad = span > 0 ? span * 0.07 : Math.max(hi * 0.002, 0.5);
    const min = lo - pad;
    const max = hi + pad;

    return {
      min,
      max,
      lo,
      hi,
      x: (i) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
      y: (p) => PAD.top + plotH - ((p - min) / (max - min)) * plotH
    };
  }, [series, n, plotW, plotH]);

  // Cursor → data index at pixel granularity
  const handleMove = (e) => {
    if (!scale || !wrapRef.current || !n) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = (px - PAD.left) / plotW;
    const i = Math.round(t * (n - 1));
    setHover({ i: Math.max(0, Math.min(n - 1, i)) });
  };

  if (!n || !scale) {
    return (
      <div ref={wrapRef} className="arena-shimmer flex items-center justify-center rounded-xl" style={{ height: chartHeight }}>
        <span className="font-mono text-[11px] theme-text-dim">Collecting ticks…</span>
      </div>
    );
  }

  /** Clamp the hovered index: new ticks shorten nothing, but a resize can. */
  const activeIdx = hover ? Math.max(0, Math.min(hover.i, n - 1)) : n - 1;
  const active = series[activeIdx] || series[n - 1];

  const lastPrice = series[n - 1].price;
  const firstPrice = series[0].price;
  const lastUp = lastPrice >= firstPrice;
  const trendColour = lastUp ? '#22C55E' : '#EF4444';

  const linePath = (() => {
    let d = '';
    for (let i = 0; i < n; i++) {
      const x = scale.x(i);
      const y = scale.y(series[i].price);
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    return {
      stroke: d,
      fill: `${d} L ${scale.x(n - 1)} ${PAD.top + plotH} L ${scale.x(0)} ${PAD.top + plotH} Z`
    };
  })();

  const gridPrices = [0, 0.25, 0.5, 0.75, 1].map((r) => scale.min + (scale.max - scale.min) * r);
  const hoverX = hover ? scale.x(activeIdx) : 0;
  const hoverY = hover ? scale.y(active.price) : 0;

  return (
    <div className="w-full">
      {/* Readout */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11.5px] tabular-nums">
        <span className="theme-text-dim">
          Price <span className="font-semibold theme-text-main">{num(active.price).toFixed(2)}</span>
        </span>
        <span className="theme-text-dim">
          H <span className="font-semibold theme-text-muted">{num(scale.hi).toFixed(2)}</span>
        </span>
        <span className="theme-text-dim">
          L <span className="font-semibold theme-text-muted">{num(scale.lo).toFixed(2)}</span>
        </span>
        <span className="theme-text-dim">· {clock(active.time)}</span>
      </div>

      {/* Plot */}
      <div
        ref={wrapRef}
        className="relative w-full select-none"
        style={{ height: chartHeight, cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg width={width} height={chartHeight} className="block">
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColour} stopOpacity="0.30" />
              <stop offset="100%" stopColor={trendColour} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid + price axis */}
          {gridPrices.map((p, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={scale.y(p)}
                y2={scale.y(p)}
                stroke="currentColor"
                className="theme-text-dim"
                opacity="0.13"
                strokeWidth="1"
              />
              <text
                x={PAD.left + plotW + 8}
                y={scale.y(p) + 3.5}
                className="theme-text-dim"
                fill="currentColor"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {p.toFixed(2)}
              </text>
            </g>
          ))}

          {Array.from({ length: 7 }, (_, k) => {
            const i = Math.min(n - 1, Math.round((k / 6) * (n - 1)));
            const x = scale.x(i);
            return (
              <line
                key={`vg${k}`}
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="currentColor"
                className="theme-text-dim"
                opacity="0.07"
                strokeWidth="1"
              />
            );
          })}

          {/* Series */}
          <path d={linePath.fill} fill={`url(#${fillId})`} />
          <path
            d={linePath.stroke}
            fill="none"
            stroke={trendColour}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Last price rule + tag */}
          <line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={scale.y(lastPrice)}
            y2={scale.y(lastPrice)}
            stroke={trendColour}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <rect
            x={PAD.left + plotW + 4}
            y={scale.y(lastPrice) - 9}
            width={PAD.right - 8}
            height="18"
            rx="4"
            fill={trendColour}
          />
          <text
            x={PAD.left + plotW + 8}
            y={scale.y(lastPrice) + 4}
            fill="#04121F"
            fontSize="10.5"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            {lastPrice.toFixed(2)}
          </text>

          {/* Time axis */}
          {Array.from({ length: 7 }, (_, k) => {
            const i = Math.min(n - 1, Math.round((k / 6) * (n - 1)));
            return (
              <text
                key={`t${k}`}
                x={scale.x(i)}
                y={chartHeight - 14}
                textAnchor="middle"
                className="theme-text-dim"
                fill="currentColor"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {hhmm(series[i].time)}
              </text>
            );
          })}

          {/* Crosshair — locked to the data point under the cursor */}
          {hover && (
            <g>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="currentColor"
                className="theme-text-muted"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.75"
              />
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={hoverY}
                y2={hoverY}
                stroke="currentColor"
                className="theme-text-muted"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.75"
              />
              <circle cx={hoverX} cy={hoverY} r="3.5" fill={trendColour} stroke="var(--bg-card)" strokeWidth="1.5" />

              <rect x={PAD.left + plotW + 4} y={hoverY - 9} width={PAD.right - 8} height="18" rx="4" fill="var(--accent)" />
              <text
                x={PAD.left + plotW + 8}
                y={hoverY + 4}
                fill="#FFFFFF"
                fontSize="10.5"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                {num(active.price).toFixed(2)}
              </text>

              <rect x={hoverX - 26} y={height - 26} width="52" height="17" rx="4" fill="var(--accent)" />
              <text
                x={hoverX}
                y={chartHeight - 14}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="9.5"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                {hhmm(active.time)}
              </text>
            </g>
          )}
        </svg>

        {/* Hover card */}
        {hover && (
          <div
            className="pointer-events-none absolute rounded-xl border px-3 py-2 shadow-xl"
            style={{
              left: Math.min(Math.max(hoverX - 82, 4), Math.max(4, width - 172)),
              top: 6,
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border-card)',
              minWidth: 162
            }}
          >
            <div className="font-mono text-[9.5px] uppercase tracking-wider theme-text-dim">
              {symbol} · {clock(active.time)}
            </div>
            <div className="mt-1 font-mono text-[15px] font-bold tabular-nums theme-text-main">
              {num(active.price).toFixed(2)} <span className="text-[10px] theme-text-dim">IC</span>
            </div>
            {active.high !== active.low && (
              <div className="mt-1 flex justify-between gap-3 font-mono text-[11px]">
                <span className="theme-text-dim">H / L</span>
                <span className="theme-text-main tabular-nums">
                  {num(active.high).toFixed(2)} / {num(active.low).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 font-mono text-[10px] theme-text-dim">
        {n} points · one per pixel column · {clean.length} ticks
      </p>
    </div>
  );
}

export default TradingChart;
