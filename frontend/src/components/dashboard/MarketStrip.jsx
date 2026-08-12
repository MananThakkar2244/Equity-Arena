import React, { useMemo } from 'react';

/**
 * The stats ribbon under the header — breadth, session volume and the day's
 * strongest listing. It used to lead with a composite 'Arena 15' index, which
 * was a number no player could ever trade; the board itself is the story here.
 */
export function MarketStrip({ stocks }) {
  const stats = useMemo(() => {
    const advancers = stocks.filter((s) => (s.percentChange || 0) > 0).length;
    const decliners = stocks.filter((s) => (s.percentChange || 0) < 0).length;
    const volume = stocks.reduce((sum, s) => {
      const last = (s.priceHistories || [])[s.priceHistories?.length - 1];
      return sum + (last?.volume || 0);
    }, 0);
    const strongest = [...stocks].sort((a, b) => (b.percentChange || 0) - (a.percentChange || 0))[0];

    return { advancers, decliners, volume, strongest };
  }, [stocks]);

  const Item = ({ label, value, tone, sub }) => (
    <div className="flex shrink-0 items-baseline gap-2">
      <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider theme-text-dim">{label}</span>
      <span className="font-mono text-[13px] font-bold tabular-nums theme-text-main">{value}</span>
      {sub ? (
        <span className="font-mono text-[11.5px] font-semibold" style={{ color: tone }}>
          {sub}
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b theme-border px-4 py-2.5 sm:px-6"
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <Item label="Advancing" value={stats.advancers} tone="var(--gain-green)" sub="▲" />
      <Item label="Declining" value={stats.decliners} tone="var(--loss-red)" sub="▼" />
      <Item label="Tick volume" value={stats.volume.toLocaleString('en-IN')} />
      {stats.strongest && (
        <Item
          label="Most bullish"
          value={stats.strongest.symbol}
          tone={(stats.strongest.percentChange || 0) >= 0 ? 'var(--gain-green)' : 'var(--loss-red)'}
          sub={`${(stats.strongest.percentChange || 0) >= 0 ? '+' : ''}${(stats.strongest.percentChange || 0).toFixed(2)}%`}
        />
      )}
    </div>
  );
}

export default MarketStrip;
