import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Activity,
  Gauge,
  Layers3,
  Target,
} from 'lucide-react';

import { readMarket, nextMarketState } from './marketState';
import { AnimatedNumber } from '../AnimatedNumber';

export function MarketStateHero({
  stocks = [],
  index = null,
  className = '',
}) {
  const read = useMemo(() => readMarket(stocks, index), [stocks, index]);

  const [state, setState] = useState(() => nextMarketState('NEUTRAL', read.score));
  useEffect(() => {
    setState((prev) => nextMarketState(prev, read.score));
  }, [read.score]);

  const isBull = state === 'BULLISH';
  const isBear = state === 'BEARISH';

  const tone = isBull
    ? {
        color: 'var(--gain-green, #22c55e)',
        rgb: '34,197,94',
        label: 'Bullish',
      }
    : isBear
      ? {
          color: 'var(--loss-red, #ef4444)',
          rgb: '239,68,68',
          label: 'Bearish',
        }
      : {
          color: 'var(--accent, #3b82f6)',
          rgb: '59,130,246',
          label: 'Neutral',
        };

  const total = (read.advancing || 0) + (read.flat || 0) + (read.declining || 0);
  const hasMarketData = total > 0;
  const score = Number.isFinite(read.score) ? Math.round(read.score * 100) : 0;

  const sideStats = useMemo(() => {
    const clean = (Array.isArray(stocks) ? stocks : [])
      .filter((stock) => stock && Number.isFinite(Number(stock.percentChange)))
      .map((stock) => ({ ...stock, change: Number(stock.percentChange) }));

    const build = (side) => {
      const list = clean.filter((stock) => side === 'bull' ? stock.change > 0 : stock.change < 0);
      const absList = list.map((stock) => Math.abs(stock.change));
      const average = list.length
        ? list.reduce((sum, stock) => sum + stock.change, 0) / list.length
        : 0;
      const strong = list.filter((stock) => Math.abs(stock.change) >= 1).length;
      const active = list.filter((stock) => Math.abs(stock.change) >= 0.5).length;
      const quiet = Math.max(0, list.length - active);
      const averageAbs = absList.length
        ? absList.reduce((sum, value) => sum + value, 0) / absList.length
        : 0;

      return {
        average,
        averageAbs,
        strong,
        active,
        quiet,
        strongPct: list.length ? Math.round((strong / list.length) * 100) : 0,
        activePct: list.length ? Math.round((active / list.length) * 100) : 0,
        quietPct: list.length ? Math.round((quiet / list.length) * 100) : 0,
      };
    };

    return {
      bull: build('bull'),
      bear: build('bear'),
    };
  }, [stocks]);

  return (
    <section
      className={`group relative overflow-hidden rounded-[var(--arena-radius,16px)] border theme-border bg-[var(--bg-card,#090e1a)] shadow-xl transition-shadow duration-300 hover:shadow-2xl ${className}`}
      aria-label="Market state overview"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[background] duration-700 ease-out"
        style={{
          background: `radial-gradient(circle at 50% 45%, rgba(${tone.rgb}, 0.13), transparent 68%)`,
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(${tone.rgb}, 0.45), transparent)`,
        }}
      />

      <div className="relative z-10 p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg border"
              style={{
                color: tone.color,
                borderColor: `rgba(${tone.rgb}, 0.2)`,
                backgroundColor: `rgba(${tone.rgb}, 0.08)`,
              }}
            >
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="font-heading text-sm font-bold theme-text-main">Market State</div>
              <div className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">Live market balance</div>
            </div>
          </div>

          <div
            className="rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest"
            style={{
              color: tone.color,
              borderColor: `rgba(${tone.rgb}, 0.22)`,
              backgroundColor: `rgba(${tone.rgb}, 0.07)`,
            }}
          >
            Feed Active
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <MarketForceCard
            side="bull"
            percentage={read.advPct}
            count={read.advancing}
            total={total}
            stats={sideStats.bull}
            label="Advancing Listings"
          />

          <div className="flex flex-col items-center justify-center px-2 py-3 text-center lg:col-span-4">
            <motion.div
              layout
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
              animate={{ boxShadow: `0 0 24px rgba(${tone.rgb}, 0.08)` }}
              style={{
                color: tone.color,
                borderColor: `rgba(${tone.rgb}, 0.28)`,
                backgroundColor: `rgba(${tone.rgb}, 0.08)`,
              }}
            >
              <Zap className="h-3 w-3" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">{state} Market</span>
            </motion.div>

            <h2 className="font-heading text-[25px] font-bold tracking-tight theme-text-main sm:text-[27px]">Equity Arena</h2>
            <p className="mt-1 max-w-[260px] text-[11px] leading-relaxed theme-text-muted">
              Real-time balance between buying and selling pressure
            </p>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold" style={{ color: tone.color }}>
                {score > 0 ? '+' : ''}
                <AnimatedNumber value={score} decimals={0} duration={450} />
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">Market Score</span>
            </div>

            <div className="mt-4 w-full">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider theme-text-dim">
                <span>Bullish</span>
                <span>Neutral</span>
                <span>Bearish</span>
              </div>

              <div
                className="relative flex h-3 w-full overflow-hidden rounded-full border theme-border bg-[var(--bg-panel,#121929)]"
                role="meter"
                aria-label="Market balance"
                aria-valuemin={-100}
                aria-valuemax={100}
                aria-valuenow={score}
              >
                <motion.div
                  className="h-full rounded-l-full bg-[var(--gain-green,#22c55e)]"
                  animate={{ width: hasMarketData ? `${read.advPct}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
                <motion.div
                  className="h-full bg-[var(--text-dim,#64748b)]"
                  animate={{ width: hasMarketData ? `${read.flatPct}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
                <motion.div
                  className="h-full rounded-r-full bg-[var(--loss-red,#ef4444)]"
                  animate={{ width: hasMarketData ? `${read.decPct}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>

              <div className="mt-2 grid grid-cols-3 font-mono text-[9px]">
                <span className="text-left text-[var(--gain-green,#22c55e)]">{read.advPct}%</span>
                <span className="text-center theme-text-dim">{read.flatPct}%</span>
                <span className="text-right text-[var(--loss-red,#ef4444)]">{read.decPct}%</span>
              </div>
            </div>
          </div>

          <MarketForceCard
            side="bear"
            percentage={read.decPct}
            count={read.declining}
            total={total}
            stats={sideStats.bear}
            label="Declining Listings"
          />
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 border-t theme-border pt-4">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: tone.color,
              boxShadow: `0 0 8px rgba(${tone.rgb}, 0.7)`,
            }}
          />
          <span className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">
            {hasMarketData ? `${total.toLocaleString()} listings analyzed` : 'Awaiting market data'}
          </span>
        </div>
      </div>
    </section>
  );
}

function MarketForceCard({
  side,
  percentage = 0,
  count = 0,
  total = 0,
  stats = {},
  label,
}) {
  const isBull = side === 'bull';
  const color = isBull ? 'var(--gain-green,#22c55e)' : 'var(--loss-red,#ef4444)';
  const rgb = isBull ? '34,197,94' : '239,68,68';
  const title = isBull ? 'Bullish Force' : 'Bearish Pressure';
  const sideCount = Number(count) || 0;
  const totalCount = Number(total) || 0;
  const share = totalCount > 0 ? (sideCount / totalCount) * 100 : 0;
  const average = Number(stats.average) || 0;
  const strong = Number(stats.strong) || 0;
  const activePct = Number(stats.activePct) || 0;
  const strongPct = Number(stats.strongPct) || 0;
  const quietPct = Number(stats.quietPct) || 0;

  return (
    <motion.div
      initial={false}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={`relative isolate flex h-full flex-col justify-between overflow-hidden rounded-xl border p-4 sm:p-5 min-h-[315px] ${
        isBull ? 'lg:col-span-4 border-[rgba(34,197,94,0.18)]' : 'lg:col-span-4 border-[rgba(239,68,68,0.18)]'
      }`}
      style={{
        background: `linear-gradient(135deg, rgba(${rgb}, 0.055), rgba(${rgb}, 0.012))`,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: isBull
            ? 'radial-gradient(circle at 15% 50%, rgba(34,197,94,0.16), transparent 65%)'
            : 'radial-gradient(circle at 85% 50%, rgba(239,68,68,0.16), transparent 65%)',
        }}
      />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
          {isBull ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {title}
        </span>
        <span className="font-mono text-lg font-bold" style={{ color }}>
          <AnimatedNumber value={percentage} decimals={0} suffix="%" duration={450} />
        </span>
      </div>

      <div className="relative z-10 mt-4 space-y-3.5">
        <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.16em] theme-text-dim">
          <span>Board breadth</span>
          <span className="theme-text-muted">{sideCount}/{totalCount || 0} · {Math.round(share)}%</span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-panel)]">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            animate={{ width: `${Math.min(100, Math.max(0, share))}%` }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border theme-border bg-[var(--bg-panel)]/70 px-2.5 py-2.5">
            <div className="font-mono text-[8px] uppercase tracking-wider theme-text-dim">Avg move</div>
            <div className="mt-1 font-mono text-[12px] font-bold" style={{ color }}>
              {average > 0 ? '+' : ''}{average.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-lg border theme-border bg-[var(--bg-panel)]/70 px-2.5 py-2.5">
            <div className="font-mono text-[8px] uppercase tracking-wider theme-text-dim">Strong moves</div>
            <div className="mt-1 font-heading text-[12px] font-bold theme-text-main">{strong} <span className="font-mono text-[9px] theme-text-dim">({strongPct}%)</span></div>
          </div>
        </div>

        <div className="rounded-lg border theme-border bg-[var(--bg-panel)]/50 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.16em] theme-text-dim">
              <Layers3 className="h-3 w-3" /> Activity profile
            </div>
            <span className="font-mono text-[8px] theme-text-dim">live distribution</span>
          </div>

          <div className="flex h-2 overflow-hidden rounded-full bg-[var(--bg-main)]">
            <motion.div
              className="h-full"
              style={{ backgroundColor: color }}
              animate={{ width: `${strongPct}%` }}
              transition={{ duration: 0.5 }}
            />
            <motion.div
              className="h-full opacity-70"
              style={{ backgroundColor: color }}
              animate={{ width: `${Math.max(0, activePct - strongPct)}%` }}
              transition={{ duration: 0.5 }}
            />
            <motion.div
              className="h-full opacity-20"
              style={{ backgroundColor: color }}
              animate={{ width: `${quietPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[7px] uppercase tracking-wider theme-text-dim">
            <span><b className="theme-text-main">{strongPct}%</b> strong</span>
            <span className="text-center"><b className="theme-text-main">{Math.max(0, activePct - strongPct)}%</b> active</span>
            <span className="text-right"><b className="theme-text-main">{quietPct}%</b> quiet</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border theme-border bg-[var(--bg-panel)]/45 px-2.5 py-2">
            <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider theme-text-dim">
              <Gauge className="h-3 w-3" /> Participation
            </div>
            <div className="mt-1 font-mono text-[11px] font-bold theme-text-main">{Math.round(share)}%</div>
          </div>
          <div className="rounded-lg border theme-border bg-[var(--bg-panel)]/45 px-2.5 py-2">
            <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider theme-text-dim">
              <Target className="h-3 w-3" /> Intensity
            </div>
            <div className="mt-1 font-mono text-[11px] font-bold" style={{ color }}>
              {Number(stats.averageAbs || 0).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-auto pt-4 flex items-end justify-between gap-4">
        <div>
          <div className="font-heading text-[23px] font-bold theme-text-main">
            <AnimatedNumber value={sideCount} decimals={0} duration={450} />
          </div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider theme-text-dim">{label}</div>
        </div>

        <div className="h-9 w-24 shrink-0 opacity-80" aria-hidden="true">
          <svg viewBox="0 0 100 30" className="h-full w-full overflow-visible" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`${side}-line-gradient`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={color} stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <path
              d={isBull ? 'M 0 25 Q 25 22, 45 16 T 72 8 T 100 3' : 'M 0 5 Q 25 8, 45 14 T 72 22 T 100 27'}
              fill="none"
              stroke={`url(#${side}-line-gradient)`}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
