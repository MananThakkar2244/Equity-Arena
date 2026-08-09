import React from 'react';

const COPY = {
  BULLISH: 'The market sentiment is positive.',
  BEARISH: 'The market sentiment is negative.',
  NEUTRAL: 'The market sentiment is mixed.'
};

const TONE = {
  BULLISH: 'var(--gain-green)',
  BEARISH: 'var(--loss-red)',
  NEUTRAL: 'var(--accent)'
};

function Segment({ pct, color }) {
  if (pct <= 0) return null;
  return <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />;
}

/**
 * Sidebar card next to the hero: overall sentiment label + a three-way
 * Advancing / Neutral / Declining breakdown bar, driven by the same
 * marketStrength figures as the hero's bull/bear scene so the two always agree.
 */
export function MarketStateCard({ advPct = 0, decPct = 0, neutralPct = 0, label = 'NEUTRAL', onViewDetails }) {
  const tone = TONE[label] || TONE.NEUTRAL;

  return (
    <div
      className="arena-rise flex flex-col rounded-[var(--arena-radius)] border theme-border px-5 py-5"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider theme-text-dim">Market state</span>

      <span className="font-heading mt-1.5 text-[26px] font-bold leading-none" style={{ color: tone }}>
        {label}
      </span>

      <p className="mt-2 text-[12.5px] theme-text-muted">{COPY[label] || COPY.NEUTRAL}</p>

      <div className="mt-auto pt-5">
        <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-panel)' }}>
          <Segment pct={advPct} color="var(--gain-green)" />
          <Segment pct={neutralPct} color="var(--text-dim)" />
          <Segment pct={decPct} color="var(--loss-red)" />
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--gain-green)' }}>
              {advPct.toFixed(0)}%
            </div>
            <div className="font-mono text-[9.5px] uppercase tracking-wider theme-text-dim">Advancing</div>
          </div>
          <div>
            <div className="font-mono text-[13px] font-bold tabular-nums theme-text-main">{neutralPct.toFixed(0)}%</div>
            <div className="font-mono text-[9.5px] uppercase tracking-wider theme-text-dim">Neutral</div>
          </div>
          <div>
            <div className="font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--loss-red)' }}>
              {decPct.toFixed(0)}%
            </div>
            <div className="font-mono text-[9.5px] uppercase tracking-wider theme-text-dim">Declining</div>
          </div>
        </div>

        {onViewDetails && (
          <button
            type="button"
            onClick={onViewDetails}
            className="mt-4 text-[12px] font-semibold text-[var(--accent)] hover:underline"
          >
            View market details →
          </button>
        )}
      </div>
    </div>
  );
}

export default MarketStateCard;
