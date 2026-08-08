import React, { useMemo } from 'react';
import { Radio } from 'lucide-react';

/**
 * The tape: every listing scrolling right→left, forever. Duplicated once so
 * the loop is seamless, and it never pauses — the market doesn't.
 */
export function TickerTape({ stocks = [], onSelect }) {
  const items = useMemo(() => (stocks.length ? [...stocks, ...stocks] : []), [stocks]);
  if (!items.length) return null;

  return (
    <div
      className="relative flex items-stretch overflow-hidden border-b theme-border"
      style={{ backgroundColor: 'var(--bg-panel)' }}
    >
      {/* Label */}
      <div
        className="z-20 flex shrink-0 items-center gap-1.5 border-r theme-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        <Radio className="h-3.5 w-3.5 arena-pulse" />
        Live tape
      </div>

      {/* Edge fades */}
      <div
        className="pointer-events-none absolute inset-y-0 left-[104px] z-10 w-14"
        style={{ background: 'linear-gradient(90deg, var(--bg-panel), transparent)' }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14"
        style={{ background: 'linear-gradient(270deg, var(--bg-panel), transparent)' }}
      />

      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <div className="animate-marquee flex w-max items-center gap-7 py-2 pl-5">
          {items.map((s, i) => {
            const up = (s.percentChange || 0) >= 0;
            return (
              <button
                type="button"
                key={`${s.symbol}-${i}`}
                onClick={() => onSelect && onSelect(s)}
                className="flex shrink-0 items-center gap-2 font-mono text-[12px] transition hover:opacity-70"
              >
                <span className="font-bold theme-text-main">{s.symbol}</span>
                <span className="tabular-nums theme-text-muted">{(s.currentPrice || 0).toFixed(2)}</span>
                <span
                  className="tabular-nums font-semibold"
                  style={{ color: up ? 'var(--gain-green)' : 'var(--loss-red)' }}
                >
                  {up ? '▲' : '▼'} {Math.abs(s.percentChange || 0).toFixed(2)}%
                </span>
                <span className="theme-text-dim">|</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TickerTape;
