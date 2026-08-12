import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The price line inside the trade ticket.
 *
 * Strict line — no candles, no volume columns. Two rules keep it honest:
 *
 *  1. x is proportional to *time*, not to array position. Ticks do not arrive
 *     on a perfect cadence, so spacing them evenly would quietly stretch quiet
 *     stretches and compress busy ones, and every time read off the axis would
 *     be wrong.
 *  2. Nothing is interpolated or invented. When there are more ticks than
 *     pixels the extra ones are folded into the column they belong to, keeping
 *     that column's true high and low so a spike can never be averaged away.
 *     When there are fewer, each tick is drawn at its own true position.
 */

const PAD = { top: 14, right: 62, bottom: 30, left: 12 };

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

const clockOf = (ms) =>
  new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const hhmmOf = (ms) =>
  new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Rolling mean over the raw ticks, so SMA-10 always means ten real prints. */
function rollingMean(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Fold ticks onto the pixel grid by time.
 *
 * Columns with no tick in them are dropped rather than filled: the line spans
 * the gap, which is the truth — no price was printed there.
 */
function buildSamples(ticks, sma, columns, t0, t1) {
  const span = t1 - t0;
  if (ticks.length <= columns || span <= 0) {
    return ticks.map((t, i) => ({
      at: t.at,
      price: t.price,
      high: t.price,
      low: t.price,
      sma: sma[i],
      ticks: 1
    }));
  }

  const buckets = new Map();
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    const col = Math.min(columns - 1, Math.floor(((t.at - t0) / span) * (columns - 1)));
    const b = buckets.get(col);
    if (!b) {
      buckets.set(col, {
        at: t.at,
        price: t.price,
        openAt: t.at,
        open: t.price,
        openSma: sma[i],
        high: t.price,
        low: t.price,
        sma: sma[i],
        ticks: 1
      });
    } else {
      // The column closes on its last print, exactly like a real bar.
      b.at = t.at;
      b.price = t.price;
      b.sma = sma[i];
      b.ticks += 1;
      if (t.price > b.high) b.high = t.price;
      if (t.price < b.low) b.low = t.price;
    }
  }

  const out = Array.from(buckets.keys())
    .sort((a, b) => a - b)
    .map((k) => buckets.get(k));

  /**
   * The leading column closes on its last print like any other, which would
   * start the line a few ticks *inside* the window and quietly shift the
   * opening price every percentage on screen is measured against. The window
   * has to open on the price it actually opened at, so the first column is
   * anchored to its own opening print — still a real print, just the right one.
   */
  const head = out[0];
  if (head && head.at !== head.openAt) {
    head.at = head.openAt;
    head.price = head.open;
    head.sma = head.openSma;
  }
  return out;
}

export function DetailChart({ ticks = [], height = 240, showSMA = true, accent }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(Math.max(280, Math.floor(w)));
    });
    ro.observe(el);
    setWidth(Math.max(280, Math.floor(el.getBoundingClientRect().width || 640)));
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(60, width - PAD.left - PAD.right);
  const plotH = Math.max(70, height - PAD.top - PAD.bottom);

  const model = useMemo(() => {
    const clean = (ticks || [])
      .map((t) => ({ price: Number(t.price), at: new Date(t.timestamp).getTime() }))
      .filter((t) => Number.isFinite(t.price) && Number.isFinite(t.at))
      .sort((a, b) => a.at - b.at);

    if (clean.length < 2) return null;

    const t0 = clean[0].at;
    const t1 = clean[clean.length - 1].at;
    const sma = showSMA ? rollingMean(clean.map((t) => t.price), 10) : clean.map(() => null);
    const samples = buildSamples(clean, sma, Math.floor(plotW), t0, t1);

    let lo = Infinity;
    let hi = -Infinity;
    for (const s of samples) {
      if (s.high > hi) hi = s.high;
      if (s.low < lo) lo = s.low;
    }
    // A flat window still needs a band to sit inside.
    const spread = hi - lo;
    const pad = spread > 0 ? spread * 0.09 : Math.max(Math.abs(hi) * 0.004, 0.5);

    return { samples, t0, t1, lo, hi, min: lo - pad, max: hi + pad, rawCount: clean.length };
  }, [ticks, plotW, showSMA]);

  if (!model) {
    return (
      <div
        ref={wrapRef}
        className="flex w-full items-center justify-center rounded-[6px] border theme-border theme-bg-card"
        style={{ height }}
      >
        <span className="font-mono text-[11px] theme-text-dim">Not enough prints in this window yet…</span>
      </div>
    );
  }

  const { samples, t0, t1, lo, hi, min, max } = model;
  const n = samples.length;
  const span = t1 - t0 || 1;

  const xOf = (at) => PAD.left + ((at - t0) / span) * plotW;
  const yOf = (p) => PAD.top + plotH - ((p - min) / (max - min)) * plotH;

  const first = samples[0];
  const last = samples[n - 1];
  const up = last.price >= first.price;
  const colour = accent || (up ? '#1DB954' : '#E8453C');

  // Cursor → the nearest real sample. Never a made-up point between two.
  const handleMove = (e) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const at = t0 + Math.min(1, Math.max(0, (e.clientX - box.left - PAD.left) / plotW)) * span;
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < n; i++) {
      const gap = Math.abs(samples[i].at - at);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    setHover(best);
  };

  const active = hover !== null ? samples[Math.min(hover, n - 1)] : last;

  const linePath = samples.map((s, i) => `${i ? 'L' : 'M'} ${xOf(s.at)} ${yOf(s.price)}`).join(' ');
  const areaPath = `${linePath} L ${xOf(last.at)} ${PAD.top + plotH} L ${xOf(first.at)} ${PAD.top + plotH} Z`;

  const smaPath = showSMA
    ? samples.reduce((d, s) => {
        if (s.sma == null) return d;
        return `${d}${d ? ' L' : 'M'} ${xOf(s.at)} ${yOf(s.sma)}`;
      }, '')
    : '';

  const gridPrices = [0, 0.25, 0.5, 0.75, 1].map((r) => min + (max - min) * r);
  const uid = `dc-${Math.round(min)}-${n}`;

  return (
    <div className="w-full">
      {/* Readout — always shows a real print, hovered or latest. */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
        <span className="theme-text-dim">
          Price <span className="font-bold theme-text-main">{fmt(active.price)}</span>
        </span>
        <span className="theme-text-dim">
          High <span className="font-semibold text-[#1DB954]">{fmt(hi)}</span>
        </span>
        <span className="theme-text-dim">
          Low <span className="font-semibold text-[#E8453C]">{fmt(lo)}</span>
        </span>
        <span className="theme-text-dim">· {clockOf(active.at)}</span>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full select-none"
        style={{ height, cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg width={width} height={height} className="block">
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity="0.34" />
              <stop offset="70%" stopColor={colour} stopOpacity="0.05" />
              <stop offset="100%" stopColor={colour} stopOpacity="0" />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {gridPrices.map((p, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={yOf(p)}
                y2={yOf(p)}
                stroke="currentColor"
                className="theme-text-dim"
                opacity="0.12"
              />
              <text
                x={PAD.left + plotW + 7}
                y={yOf(p) + 3.5}
                className="theme-text-dim"
                fill="currentColor"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {fmt(p)}
              </text>
            </g>
          ))}

          {/* Where the window opened — every move on screen is measured from here. */}
          <line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={yOf(first.price)}
            y2={yOf(first.price)}
            stroke="currentColor"
            className="theme-text-dim"
            strokeWidth="1"
            strokeDasharray="2 4"
            opacity="0.5"
          />

          <path d={areaPath} fill={`url(#${uid}-fill)`} />

          {showSMA && smaPath && (
            <path d={smaPath} fill="none" stroke="#D4A017" strokeWidth="1.3" strokeDasharray="5 4" opacity="0.85" />
          )}

          <path
            d={linePath}
            fill="none"
            stroke={colour}
            strokeWidth="1.9"
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={`url(#${uid}-glow)`}
          />

          {/* Live price tag */}
          <line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={yOf(last.price)}
            y2={yOf(last.price)}
            stroke={colour}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <rect x={PAD.left + plotW + 3} y={yOf(last.price) - 8.5} width={PAD.right - 7} height="17" rx="3" fill={colour} />
          <text
            x={PAD.left + plotW + 7}
            y={yOf(last.price) + 4}
            fill="#04121F"
            fontSize="10"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            {fmt(last.price)}
          </text>
          <circle cx={xOf(last.at)} cy={yOf(last.price)} r="3.2" fill={colour} className="dc-pulse" />

          {/* Time axis, read off real timestamps */}
          {Array.from({ length: 5 }, (_, k) => {
            const at = t0 + (k / 4) * span;
            return (
              <text
                key={`t${k}`}
                x={xOf(at)}
                y={height - 9}
                textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}
                className="theme-text-dim"
                fill="currentColor"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {hhmmOf(at)}
              </text>
            );
          })}

          {/* Crosshair — the vertical guide is dotted, locked to a real print. */}
          {hover !== null && (
            <g>
              <line
                x1={xOf(active.at)}
                x2={xOf(active.at)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="currentColor"
                className="theme-text-muted"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.85"
              />
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={yOf(active.price)}
                y2={yOf(active.price)}
                stroke="currentColor"
                className="theme-text-muted"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.6"
              />
              <circle
                cx={xOf(active.at)}
                cy={yOf(active.price)}
                r="4"
                fill={colour}
                stroke="var(--bg-card)"
                strokeWidth="1.6"
              />
              <rect x={PAD.left + plotW + 3} y={yOf(active.price) - 8.5} width={PAD.right - 7} height="17" rx="3" fill="var(--accent)" />
              <text
                x={PAD.left + plotW + 7}
                y={yOf(active.price) + 4}
                fill="#FFFFFF"
                fontSize="10"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                {fmt(active.price)}
              </text>
            </g>
          )}
        </svg>

        {hover !== null && (
          <div
            className="dc-tip pointer-events-none absolute rounded-[6px] border px-3 py-2 shadow-xl"
            style={{
              left: Math.min(Math.max(xOf(active.at) - 74, 4), Math.max(4, width - 156)),
              top: 4,
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border-card)',
              minWidth: 146
            }}
          >
            <div className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">{clockOf(active.at)}</div>
            <div className="mt-0.5 font-mono text-[15px] font-bold tabular-nums theme-text-main">
              {fmt(active.price)} <span className="text-[10px] text-[#D4A017]">IC</span>
            </div>
            <div className="mt-1 flex justify-between gap-4 font-mono text-[10.5px]">
              <span className="theme-text-dim">from open</span>
              <span className={`tabular-nums font-bold ${active.price >= first.price ? 'text-[#1DB954]' : 'text-[#E8453C]'}`}>
                {active.price >= first.price ? '+' : ''}
                {fmt(((active.price - first.price) / first.price) * 100)}%
              </span>
            </div>
            {active.high !== active.low && (
              <div className="mt-0.5 flex justify-between gap-4 font-mono text-[10.5px]">
                <span className="theme-text-dim">H / L</span>
                <span className="tabular-nums theme-text-muted">
                  {fmt(active.high)} / {fmt(active.low)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DetailChart;
