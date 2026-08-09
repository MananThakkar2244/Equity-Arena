import React, { useMemo, useRef, useState } from 'react';

const VW = 1000;
const VH = 320;
const PAD = { top: 18, right: 16, bottom: 30, left: 58 };

const clock = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const compact = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
};

/**
 * Portfolio value over time.
 *
 * Points arrive already reconstructed from the ledger, so this draws them
 * literally — no smoothing, no interpolation, no resampling. A curve that
 * looked prettier than the data would be a lie about what the trader's book
 * was worth, and the chart has to agree with the headline number to the cent.
 *
 * The y-axis is padded to a "nice" rounded band rather than clamped to
 * min/max, so a quiet stretch does not get magnified into fake volatility.
 */
export function PortfolioChart({ points = [], openValue = null, height = 300 }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const geom = useMemo(() => {
    const data = points.filter((p) => Number.isFinite(p?.value));
    if (data.length < 2) return null;

    const values = data.map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);

    // Pad the band by 8% of its span (or 1% of level when perfectly flat) so
    // the line never rides the frame and a flat book stays visibly flat.
    const raw = hi - lo;
    const pad = raw > 0 ? raw * 0.08 : Math.max(hi * 0.01, 1);
    let yMin = lo - pad;
    let yMax = hi + pad;

    // Snap to a readable step.
    const span = yMax - yMin;
    const mag = 10 ** Math.floor(Math.log10(span / 4));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) || mag * 10;
    yMin = Math.floor(yMin / step) * step;
    yMax = Math.ceil(yMax / step) * step;

    const t0 = data[0].t;
    const t1 = data[data.length - 1].t;
    const tSpan = Math.max(t1 - t0, 1);

    const innerW = VW - PAD.left - PAD.right;
    const innerH = VH - PAD.top - PAD.bottom;

    const xOf = (t) => PAD.left + ((t - t0) / tSpan) * innerW;
    const yOf = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

    const coords = data.map((p) => ({ x: xOf(p.t), y: yOf(p.value), ...p }));
    const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
    const area =
      `${line} L${coords[coords.length - 1].x.toFixed(2)},${(VH - PAD.bottom).toFixed(2)}` +
      ` L${coords[0].x.toFixed(2)},${(VH - PAD.bottom).toFixed(2)} Z`;

    const yTicks = [];
    for (let v = yMin; v <= yMax + 1e-6; v += step) yTicks.push({ v, y: yOf(v) });

    const tickCount = 6;
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const t = t0 + (tSpan * i) / (tickCount - 1);
      return { t, x: xOf(t) };
    });

    const baseline = Number.isFinite(openValue) && openValue >= yMin && openValue <= yMax
      ? { v: openValue, y: yOf(openValue) }
      : null;

    return { coords, line, area, yTicks, xTicks, baseline, last: coords[coords.length - 1] };
  }, [points, openValue]);

  if (!geom) {
    return (
      <div
        className="grid place-items-center rounded-xl border theme-border"
        style={{ height }}
      >
        <span className="font-mono text-[11px] uppercase tracking-wider theme-text-dim">
          Building history…
        </span>
      </div>
    );
  }

  const up = geom.last.value >= (openValue ?? geom.coords[0].value);
  const stroke = up ? 'var(--gain-green, #22c55e)' : 'var(--loss-red, #ef4444)';
  const gid = up ? 'pf-fill-up' : 'pf-fill-down';

  const onMove = (event) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = (event.clientX - box.left) / box.width;
    const vx = ratio * VW;
    // Nearest sample, not an interpolation — the tooltip must quote a real
    // reconstructed value.
    let best = geom.coords[0];
    let bestD = Infinity;
    for (const c of geom.coords) {
      const d = Math.abs(c.x - vx);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    setHover(best);
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id="pf-fill-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pf-fill-down" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.34" />
            <stop offset="60%" stopColor="#ef4444" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid + y labels */}
        {geom.yTicks.map((t) => (
          <g key={`y${t.v}`}>
            <line
              x1={PAD.left}
              x2={VW - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity="0.07"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left - 10}
              y={t.y + 4}
              textAnchor="end"
              className="fill-current font-mono"
              style={{ fontSize: 13, opacity: 0.42 }}
            >
              {compact(t.v)}
            </text>
          </g>
        ))}

        {/* session-open baseline */}
        {geom.baseline && (
          <line
            x1={PAD.left}
            x2={VW - PAD.right}
            y1={geom.baseline.y}
            y2={geom.baseline.y}
            stroke="currentColor"
            strokeOpacity="0.32"
            strokeDasharray="4 5"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <path d={geom.area} fill={`url(#${gid})`} />
        <path
          d={geom.line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* x labels */}
        {geom.xTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={t.x}
            y={VH - 8}
            textAnchor={i === 0 ? 'start' : i === geom.xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-current font-mono"
            style={{ fontSize: 13, opacity: 0.42 }}
          >
            {clock(t.t)}
          </text>
        ))}

        {/* live head */}
        <circle cx={geom.last.x} cy={geom.last.y} r="9" fill={stroke} opacity="0.18" />
        <circle cx={geom.last.x} cy={geom.last.y} r="4" fill="#fff" />

        {hover && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={VH - PAD.bottom}
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hover.x} cy={hover.y} r="4.5" fill={stroke} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border theme-border px-2.5 py-1.5 text-center shadow-xl"
          style={{
            left: `${(hover.x / VW) * 100}%`,
            backgroundColor: 'var(--bg-panel, #0d1424)'
          }}
        >
          <div className="font-mono text-[12px] font-bold tabular-nums theme-text-main">
            {hover.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="ml-1 text-[10px] opacity-60">IC</span>
          </div>
          <div className="font-mono text-[10px] theme-text-dim">{clock(hover.t)}</div>
        </div>
      )}
    </div>
  );
}

export default PortfolioChart;
