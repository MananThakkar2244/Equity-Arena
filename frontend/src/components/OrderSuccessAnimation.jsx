import React, { useEffect, useMemo, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion
} from 'framer-motion';

/**
 * Order fill confirmation.
 *
 * Beat order: energy ring expands → checkmark draws itself → card springs in →
 * the portfolio figures count to their new values → everything scales away.
 *
 * The overlay is `pointer-events-none` end to end. It is deliberately incapable
 * of swallowing a click, so a trader can keep working straight through it.
 *
 * Every figure shown is passed in from the executed order. Nothing here invents
 * a price, and nothing here decides whether an order succeeded — it is only
 * mounted once the API has already confirmed the fill.
 */

const HOLD_MS = 2500;
const EXIT_MS = 420;

const TONE = {
  buy: {
    key: 'buy',
    ink: '#1DB954',
    soft: 'rgba(29, 185, 84, 0.16)',
    edge: 'rgba(29, 185, 84, 0.55)',
    glow: 'rgba(29, 185, 84, 0.28)',
    label: 'BUY ORDER',
    sign: '+',
    totalLabel: 'TOTAL COST'
  },
  sell: {
    key: 'sell',
    ink: '#E8453C',
    soft: 'rgba(232, 69, 60, 0.16)',
    edge: 'rgba(232, 69, 60, 0.55)',
    glow: 'rgba(232, 69, 60, 0.28)',
    label: 'SELL ORDER',
    sign: '−',
    totalLabel: 'TOTAL PROCEEDS'
  }
};

/** Fixed geometry — computed once so no particle position is ever re-rolled. */
const SHARDS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.22 : 0);
  const reach = i % 3 === 0 ? 172 : i % 3 === 1 ? 138 : 108;
  return {
    id: i,
    x: Math.cos(angle) * reach,
    y: Math.sin(angle) * reach * 0.72,
    size: i % 4 === 0 ? 6 : i % 4 === 1 ? 4 : 3,
    delay: 0.02 + (i % 5) * 0.035,
    long: i % 3 === 0
  };
});

const fmt = (v, decimals) =>
  Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * Counts to a value by driving a MotionValue, which writes straight to the DOM.
 * No React state per frame, so a running count never re-renders the tree.
 */
function Counter({ from, to, decimals = 2, duration = 1.05, className = '', still = false }) {
  const mv = useMotionValue(still ? to : from);
  const text = useTransform(mv, (v) => fmt(v, decimals));

  useEffect(() => {
    if (still) {
      mv.set(to);
      return undefined;
    }
    const controls = animate(mv, to, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [to, duration, mv, still]);

  return <motion.span className={className}>{text}</motion.span>;
}

function DrawnCheck({ tone, still }) {
  return (
    <motion.div
      className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full"
      style={{ backgroundColor: tone.soft, boxShadow: `0 0 0 1px ${tone.edge}, 0 0 30px ${tone.glow}` }}
      initial={still ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.05 }}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <motion.circle
          cx="17"
          cy="17"
          r="15"
          stroke={tone.ink}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.4"
          initial={still ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.06 }}
        />
        <motion.path
          d="M10 17.6 L15.1 22.6 L24.4 11.9"
          stroke={tone.ink}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={still ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1], delay: 0.22 }}
        />
      </svg>
    </motion.div>
  );
}

export function OrderSuccessAnimation({
  type = 'buy',
  symbol = '',
  quantity = 0,
  executionPrice = 0,
  total = 0,
  cashBefore = null,
  cashAfter = null,
  sharesBefore = null,
  sharesAfter = null,
  onComplete
}) {
  const reduce = useReducedMotion();
  const tone = TONE[String(type).toLowerCase() === 'sell' ? 'sell' : 'buy'];

  // The callback is held in a ref so a re-rendering parent can never restart
  // the dismissal timer and leave the card on screen indefinitely.
  const doneRef = useRef(onComplete);
  useEffect(() => {
    doneRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const timer = setTimeout(() => doneRef.current && doneRef.current(), HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  const showCash = Number.isFinite(cashAfter);
  const showShares = Number.isFinite(sharesAfter);

  const shards = useMemo(() => (reduce ? [] : SHARDS), [reduce]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        className="relative flex flex-col items-center"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.82, filter: 'blur(10px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
        transition={
          reduce
            ? { duration: 0.18 }
            : { type: 'spring', stiffness: 340, damping: 26, mass: 0.8, filter: { duration: 0.28 } }
        }
      >
        {/* Energy rings — pure transform + opacity, nothing repaints. */}
        {!reduce &&
          [0, 1].map((i) => (
            <motion.span
              key={`ring-${i}`}
              className="absolute rounded-full"
              style={{
                width: 190,
                height: 190,
                border: `1.5px solid ${tone.edge}`,
                top: '50%',
                left: '50%',
                marginTop: -95,
                marginLeft: -95
              }}
              initial={{ scale: 0.25, opacity: 0.75 }}
              animate={{ scale: [0.25, 1.85], opacity: [0.75, 0] }}
              transition={{ duration: 1.15, ease: 'easeOut', delay: i * 0.22 }}
            />
          ))}

        {/* Shards: a burst outward, not fireworks — they travel once and fade. */}
        {shards.map((s) => (
          <motion.span
            key={s.id}
            className="absolute rounded-full"
            style={{
              top: '50%',
              left: '50%',
              width: s.long ? s.size * 3 : s.size,
              height: s.size,
              backgroundColor: tone.ink,
              boxShadow: `0 0 8px ${tone.glow}`
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.5] }}
            transition={{ duration: 0.95, ease: 'easeOut', delay: s.delay }}
          />
        ))}

        {/* Card */}
        <div
          className="relative flex w-[min(92vw,330px)] flex-col items-center rounded-[16px] border px-6 py-6 text-center"
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderColor: tone.edge,
            boxShadow: `0 0 0 1px ${tone.soft}, 0 22px 60px rgba(2, 8, 20, 0.62), 0 0 46px ${tone.glow}`
          }}
        >
          <DrawnCheck tone={tone} still={reduce} />

          <motion.div
            className="mt-4"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.3 }}
          >
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] theme-text-dim">
              {tone.label}
            </div>
            <div className="font-heading text-[26px] font-extrabold leading-tight" style={{ color: tone.ink }}>
              EXECUTED!
            </div>
          </motion.div>

          <motion.div
            className="mt-3 font-mono text-[15px] font-bold tabular-nums"
            style={{ color: tone.ink }}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.28 }}
          >
            {tone.sign}
            {quantity} {symbol} {quantity === 1 ? 'SHARE' : 'SHARES'}
          </motion.div>

          <motion.div
            className="mt-1 font-mono text-[11.5px] theme-text-muted tabular-nums"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.38, duration: 0.28 }}
          >
            Filled @ {fmt(executionPrice, 2)} IC
          </motion.div>

          <motion.div
            className="mt-4 w-full rounded-[10px] border px-4 py-3"
            style={{ borderColor: 'var(--border-card)', backgroundColor: 'var(--bg-card)' }}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42, duration: 0.3 }}
          >
            <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] theme-text-dim">
              {tone.totalLabel}
            </div>
            <div className="mt-1 font-mono text-[20px] font-extrabold tabular-nums theme-text-main">
              <Counter from={0} to={total} decimals={2} duration={0.85} still={reduce} />
              <span className="ml-1 text-[12px] text-[#D4A017]">IC</span>
            </div>
          </motion.div>

          {(showCash || showShares) && (
            <motion.div
              className="mt-3 w-full space-y-1.5"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.3 }}
            >
              {showCash && (
                <div className="flex items-baseline justify-between font-mono text-[11px]">
                  <span className="theme-text-dim">Wallet</span>
                  <span className="font-bold tabular-nums theme-text-main">
                    <Counter
                      from={Number.isFinite(cashBefore) ? cashBefore : cashAfter}
                      to={cashAfter}
                      decimals={2}
                      duration={1}
                      still={reduce}
                    />
                    <span className="ml-1 theme-text-dim">IC</span>
                  </span>
                </div>
              )}
              {showShares && (
                <div className="flex items-baseline justify-between font-mono text-[11px]">
                  <span className="theme-text-dim">{symbol} holding</span>
                  <span className="font-bold tabular-nums" style={{ color: tone.ink }}>
                    <Counter
                      from={Number.isFinite(sharesBefore) ? sharesBefore : sharesAfter}
                      to={sharesAfter}
                      decimals={0}
                      duration={1}
                      still={reduce}
                    />
                    <span className="ml-1 theme-text-dim">shrs</span>
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Mount wrapper.
 *
 * `fill` is the executed order and nothing else — the parent passes null for a
 * rejection, a limit order that is merely booked, or any other outcome that is
 * not a fill, and this renders nothing at all.
 */
export function OrderSuccessLayer({ fill, onComplete }) {
  return (
    <AnimatePresence mode="wait">
      {fill ? (
        <motion.div key={fill.id} exit={{ opacity: 0 }} transition={{ duration: EXIT_MS / 1000 }}>
          <OrderSuccessAnimation
            type={fill.type}
            symbol={fill.symbol}
            quantity={fill.quantity}
            executionPrice={fill.executionPrice}
            total={fill.total}
            cashBefore={fill.cashBefore}
            cashAfter={fill.cashAfter}
            sharesBefore={fill.sharesBefore}
            sharesAfter={fill.sharesAfter}
            onComplete={onComplete}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default OrderSuccessAnimation;
