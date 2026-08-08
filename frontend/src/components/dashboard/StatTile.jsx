import React from 'react';
import { AnimatedNumber } from '../AnimatedNumber';

/**
 * A single headline number. The sparkline is decoration for trend only —
 * it carries no axis, so it never pretends to be a chart.
 */
export function StatTile({
  label,
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  delta,
  deltaLabel,
  icon: Icon,
  series = [],
  tone = 'neutral',
  hint,
  style
}) {
  const positive = (delta ?? 0) >= 0;
  const accent =
    tone === 'gain' ? 'var(--gain-green)' : tone === 'loss' ? 'var(--loss-red)' : tone === 'gold' ? 'var(--accent)' : '#7A8195';

  // Normalise the sparkline into the 0..1 band
  const points = (() => {
    if (!series || series.length < 2) return '';
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    return series
      .map((p, i) => `${(i / (series.length - 1)) * 100},${28 - ((p - min) / range) * 26}`)
      .join(' ');
  })();

  return (
    <div className="arena-card arena-card-interactive arena-rise relative overflow-hidden p-4" style={style}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider theme-text-dim">{label}</span>
        {Icon && (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}1F`, color: accent }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="mt-2 font-heading text-[26px] font-bold leading-none tracking-tight tabular-nums theme-text-main">
        <AnimatedNumber value={value || 0} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
        {delta !== undefined && delta !== null ? (
          <span className="font-mono font-semibold" style={{ color: positive ? 'var(--gain-green)' : 'var(--loss-red)' }}>
            {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}%
          </span>
        ) : null}
        <span className="theme-text-dim">{deltaLabel || hint}</span>
      </div>

      {points && (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden="true">
          <polyline points={points} fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

export default StatTile;
