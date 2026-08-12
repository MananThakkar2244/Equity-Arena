import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Activity,
} from 'lucide-react';

import { readMarket, nextMarketState } from './marketState';
import { AnimatedNumber } from '../AnimatedNumber';

export function MarketStateHero({
  stocks = [],
  index = null,
  className = '',
}) {
  const read = useMemo(
    () => readMarket(stocks, index),
    [stocks, index]
  );

  // Feed the machine its own previous state. Passing a literal 'NEUTRAL' threw
  // the hysteresis away, so a score sitting on a threshold re-decided from
  // scratch every tick instead of holding.
  const [state, setState] = useState('NEUTRAL');
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

  const total =
    (read.advancing || 0) +
    (read.flat || 0) +
    (read.declining || 0);

  const hasMarketData = total > 0;

  // read.score is -1..+1. Rounding it directly collapsed every market in the
  // game to -1, 0 or +1, which is what put a bare "-1" on the dial. The meter
  // below already declares a -100..100 range, so scale to that.
  const score = Number.isFinite(read.score)
    ? Math.round(read.score * 100)
    : 0;

  // FIXED: Proper template literals
  const scoreLabel =
    score > 0
      ? `+${score}`
      : score < 0
        ? `${score}`
        : '0';

  return (
    <section
      className={`
        group relative overflow-hidden
        rounded-[var(--arena-radius,16px)]
        border theme-border
        bg-[var(--bg-card,#090e1a)]
        shadow-xl
        transition-shadow duration-300
        hover:shadow-2xl
        ${className}
      `}
      aria-label="Market state overview"
    >
      {/* =========================================================
          AMBIENT MARKET GLOW
      ========================================================== */}

      {/* A gradient is a string, not a number, so Framer cannot tween it — it
          snapped on every state read. CSS transitions the colour smoothly for
          free instead. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[background] duration-700 ease-out"
        style={{
          background: `radial-gradient(circle at 50% 45%, rgba(${tone.rgb}, 0.13), transparent 68%)`,
        }}
      />

      {/* Top edge highlight */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(
            90deg,
            transparent,
            rgba(${tone.rgb}, 0.45),
            transparent
          )`,
        }}
      />

      <div className="relative z-10 p-5 sm:p-6">

        {/* =======================================================
            HEADER
        ======================================================== */}

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
              <div className="font-heading text-sm font-bold theme-text-main">
                Market State
              </div>

              <div className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">
                Live market balance
              </div>
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

        {/* =======================================================
            MAIN GRID
        ======================================================== */}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">

          {/* =====================================================
              BULLISH SIDE
          ====================================================== */}

          <MarketForceCard
            side="bull"
            percentage={read.advPct}
            count={read.advancing}
            label="Advancing Listings"
          />

          {/* =====================================================
              CENTER STATUS
          ====================================================== */}

          <div className="flex flex-col items-center justify-center px-2 py-3 text-center lg:col-span-4">

            {/* State badge */}

            <motion.div
              layout
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
              animate={{
                boxShadow: `0 0 24px rgba(${tone.rgb}, 0.08)`,
              }}
              style={{
                color: tone.color,
                borderColor: `rgba(${tone.rgb}, 0.28)`,
                backgroundColor: `rgba(${tone.rgb}, 0.08)`,
              }}
            >
              <Zap className="h-3 w-3" />

              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
                {state} Market
              </span>
            </motion.div>

            {/* Main title */}

            <h2 className="font-heading text-[25px] font-bold tracking-tight theme-text-main sm:text-[27px]">
              Equity Arena
            </h2>

            <p className="mt-1 max-w-[260px] text-[11px] leading-relaxed theme-text-muted">
              Real-time balance between buying and selling pressure
            </p>

            {/* Score */}

            <div className="mt-3 flex items-baseline gap-1.5">

              {/* Counts to the new value. A `key` here remounted the element on
                  every price tick, replaying the enter animation — which read
                  as the number flashing rather than moving. */}
              <span
                className="font-mono text-xl font-bold"
                style={{ color: tone.color }}
              >
                {score > 0 ? '+' : ''}
                <AnimatedNumber value={score} decimals={0} duration={450} />
              </span>

              <span className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">
                Market Score
              </span>

            </div>

            {/* =================================================
                MARKET BALANCE BAR
            ================================================== */}

            <div className="mt-4 w-full">

              <div className="mb-1.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider theme-text-dim">
                <span>Bullish</span>
                <span>Neutral</span>
                <span>Bearish</span>
              </div>

              <div
                className="
                  relative flex h-3 w-full
                  overflow-hidden rounded-full
                  border theme-border
                  bg-[var(--bg-panel,#121929)]
                "
                role="meter"
                aria-label="Market balance"
                aria-valuemin={-100}
                aria-valuemax={100}
                aria-valuenow={score}
              >

                <motion.div
                  className="h-full rounded-l-full bg-[var(--gain-green,#22c55e)]"
                  animate={{
                    width: hasMarketData
                      ? `${read.advPct}%`
                      : '0%',
                  }}
                  transition={{
                    duration: 0.7,
                    ease: 'easeOut',
                  }}
                />

                <motion.div
                  className="h-full bg-[var(--text-dim,#64748b)]"
                  animate={{
                    width: hasMarketData
                      ? `${read.flatPct}%`
                      : '0%',
                  }}
                  transition={{
                    duration: 0.7,
                    ease: 'easeOut',
                  }}
                />

                <motion.div
                  className="h-full rounded-r-full bg-[var(--loss-red,#ef4444)]"
                  animate={{
                    width: hasMarketData
                      ? `${read.decPct}%`
                      : '0%',
                  }}
                  transition={{
                    duration: 0.7,
                    ease: 'easeOut',
                  }}
                />

              </div>

              {/* Percentage labels */}

              <div className="mt-2 grid grid-cols-3 font-mono text-[9px]">

                <span className="text-left text-[var(--gain-green,#22c55e)]">
                  {read.advPct}%
                </span>

                <span className="text-center theme-text-dim">
                  {read.flatPct}%
                </span>

                <span className="text-right text-[var(--loss-red,#ef4444)]">
                  {read.decPct}%
                </span>

              </div>

            </div>

          </div>

          {/* =====================================================
              BEARISH SIDE
          ====================================================== */}

          <MarketForceCard
            side="bear"
            percentage={read.decPct}
            count={read.declining}
            label="Declining Listings"
          />

        </div>

        {/* =======================================================
            FOOTER
        ======================================================== */}

        <div className="mt-5 flex items-center justify-center gap-2 border-t theme-border pt-4">

          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: tone.color,
              boxShadow: `0 0 8px rgba(${tone.rgb}, 0.7)`,
            }}
          />

          <span className="font-mono text-[9px] uppercase tracking-wider theme-text-dim">
            {hasMarketData
              ? `${total.toLocaleString()} listings analyzed`
              : 'Awaiting market data'}
          </span>

        </div>

      </div>
    </section>
  );
}


/* ===============================================================
   MARKET FORCE CARD
================================================================ */

function MarketForceCard({
  side,
  percentage = 0,
  count = 0,
  label,
}) {
  const isBull = side === 'bull';

  const color = isBull
    ? 'var(--gain-green,#22c55e)'
    : 'var(--loss-red,#ef4444)';

  const rgb = isBull
    ? '34,197,94'
    : '239,68,68';

  const title = isBull
    ? 'Bullish Force'
    : 'Bearish Pressure';

  return (
    <motion.div
      initial={false}
      whileHover={{
        y: -2,
      }}
      transition={{
        duration: 0.2,
      }}
      className={`
        relative isolate flex h-full flex-col justify-between overflow-hidden
        rounded-xl border
        p-4
        ${
          isBull
            ? 'lg:col-span-4 border-[rgba(34,197,94,0.18)]'
            : 'lg:col-span-4 border-[rgba(239,68,68,0.18)]'
        }
      `}
      style={{
        background: `linear-gradient(
          135deg,
          rgba(${rgb}, 0.045),
          rgba(${rgb}, 0.012)
        )`,
      }}
    >

      {/* Ambient glow */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: isBull
            ? 'radial-gradient(circle at 15% 50%, rgba(34,197,94,0.16), transparent 65%)'
            : 'radial-gradient(circle at 85% 50%, rgba(239,68,68,0.16), transparent 65%)',
        }}
      />

      {/* Header */}

      <div className="relative z-10 flex items-center justify-between gap-3">

        <span
          className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider"
          style={{
            color,
          }}
        >

          {isBull ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}

          {title}

        </span>

        <span className="font-mono text-lg font-bold" style={{ color }}>
          <AnimatedNumber value={percentage} decimals={0} suffix="%" duration={450} />
        </span>

      </div>

      {/* Bottom content */}

      <div className="relative z-10 mt-6 flex items-end justify-between gap-4">

        <div>

          <div className="font-heading text-[23px] font-bold theme-text-main">
            <AnimatedNumber value={Number(count || 0)} decimals={0} duration={450} />
          </div>

          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider theme-text-dim">
            {label}
          </div>

        </div>

        {/* Mini trend graphic */}

        <div
          className="h-9 w-24 shrink-0 opacity-80"
          aria-hidden="true"
        >

          <svg
            viewBox="0 0 100 30"
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
          >                               

            <defs>

              <linearGradient
                id={`${side}-line-gradient`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >

                <stop
                  offset="0%"
                  stopColor={color}
                  stopOpacity="0.15"
                />

                <stop
                  offset="100%"
                  stopColor={color}
                  stopOpacity="0.9"
                />

              </linearGradient>

            </defs>

            <path
              d={
                isBull
                  ? 'M 0 25 Q 25 22, 45 16 T 72 8 T 100 3'
                  : 'M 0 5 Q 25 8, 45 14 T 72 22 T 100 27'
              }
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

export default MarketStateHero;