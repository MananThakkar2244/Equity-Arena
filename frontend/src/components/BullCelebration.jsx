import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Bull360 } from './dashboard/Bull360';

const HOLD_MS = { success: 4200, error: 2600 };

// The stage/receipt always render on a hardcoded dark panel regardless of the
// site's light/dark setting, so their text must stay fixed-light too — using
// the theme's `--text-main` here would go near-black-on-near-black whenever
// the site itself is in light mode.
const PANEL_TEXT = '#E9EFFA';
const PANEL_TEXT_MUTED = '#94A3B8';
const PANEL_TEXT_DIM = '#64748B';

/**
 * A candlestick as a real box in 3D — four glass faces plus wicks — turning on
 * its own axis beside the bull.
 */
function CrystalCandle({ positive = true }) {
  const face = positive
    ? ['rgba(34,197,94,0.92)', 'rgba(21,128,61,0.92)', 'rgba(12,74,38,0.95)']
    : ['rgba(239,68,68,0.92)', 'rgba(185,28,28,0.92)', 'rgba(94,18,18,0.95)'];
  const wick = positive ? 'rgba(134,239,172,0.9)' : 'rgba(252,165,165,0.9)';

  const HALF = 11;
  const H = 92;

  const faces = [
    { transform: `translateZ(${HALF}px)`, background: face[0] },
    { transform: `rotateY(180deg) translateZ(${HALF}px)`, background: face[1] },
    { transform: `rotateY(90deg) translateZ(${HALF}px)`, background: face[2] },
    { transform: `rotateY(-90deg) translateZ(${HALF}px)`, background: face[2] }
  ];

  return (
    <div className="arena-3d animate-stick-rise relative" style={{ width: HALF * 2, height: H }}>
      <div className="arena-3d animate-stick-spin relative h-full w-full">
        <div
          className="absolute left-1/2 rounded-full"
          style={{ top: -34, width: 4, height: 34, marginLeft: -2, background: wick, boxShadow: `0 0 8px ${wick}` }}
        />
        <div
          className="absolute left-1/2 rounded-full"
          style={{ bottom: -28, width: 4, height: 28, marginLeft: -2, background: wick, boxShadow: `0 0 8px ${wick}` }}
        />
        {faces.map((f, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-[3px]"
            style={{
              ...f,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 0 16px rgba(0,0,0,0.34)'
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Sparks thrown outward on execution. Deterministic angles — no randomness. */
function Sparks({ colour }) {
  return (
    <>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
        <span
          key={deg}
          className="animate-spark pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 rounded-full"
          style={{ backgroundColor: colour, transform: `rotate(${deg}deg)`, animationDelay: `${0.5 + i * 0.02}s` }}
        />
      ))}
    </>
  );
}

/** Counts a number up once, so the total lands rather than just appearing. */
function useCountUp(target, ms = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Row({ label, value, delay, mono = true, strong = false, colour }) {
  return (
    <div
      className="animate-row-in flex items-baseline justify-between gap-4 py-[7px]"
      style={{ animationDelay: `${delay}s` }}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: PANEL_TEXT_DIM }}>
        {label}
      </span>
      <span
        className={`${mono ? 'font-mono tabular-nums' : ''} ${
          strong ? 'text-[15px] font-bold' : 'text-[13px] font-semibold'
        }`}
        style={{ color: colour || PANEL_TEXT }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Trade result: the bull turns on its podium over a receding grid floor while
 * the fill prints out underneath. Auto-dismisses on a visible meter; also
 * closes on click, Escape or the button.
 */
export function BullCelebration({ result, onClose }) {
  const [leaving, setLeaving] = useState(false);

  const isSuccess = result?.status === 'success';
  const isSell = result?.side === 'SELL';

  const qty = Number(result?.quantity) || 0;
  const price = Number(result?.price) || 0;
  const notional = qty * price;
  const counted = useCountUp(isSuccess ? notional : 0);

  // Ref'd so a dashboard re-render (prices tick constantly) cannot restart the
  // dismiss timer below.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const holdMs = result?.status === 'success' ? HOLD_MS.success : HOLD_MS.error;

  useEffect(() => {
    if (!result) return undefined;
    setLeaving(false);
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => closeRef.current && closeRef.current(), 260);
    }, holdMs);
    return () => clearTimeout(timer);
  }, [result, holdMs]);

  useEffect(() => {
    if (!result) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeRef.current && closeRef.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [result]);

  const headline = useMemo(() => {
    if (!isSuccess) return 'Order rejected';
    return isSell ? 'Position closed' : 'You are in';
  }, [isSuccess, isSell]);

  if (!result) return null;

  const accent = !isSuccess ? '#EF4444' : isSell ? '#60A5FA' : '#22C55E';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="alertdialog"
      aria-live="assertive"
      aria-label={headline}
      onClick={() => onClose && onClose()}
    >
      {/* Scrim */}
      <div
        className={`absolute inset-0 backdrop-blur-xl transition-opacity duration-300 ${
          leaving ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ background: 'radial-gradient(circle at 50% 42%, rgba(9,17,38,0.82), rgba(3,6,14,0.97))' }}
      />

      <div
        className={`arena-stage relative w-full max-w-[420px] transition-all duration-300 ${
          leaving ? 'translate-y-2 scale-[0.97] opacity-0' : 'translate-y-0 scale-100 opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="animate-fill-panel relative overflow-hidden rounded-[26px] border"
          style={{
            background: 'linear-gradient(180deg, rgba(17,26,48,0.96) 0%, rgba(8,13,26,0.98) 100%)',
            borderColor: 'rgba(148,180,255,0.18)',
            boxShadow: `0 40px 110px -40px rgba(0,0,0,0.95), 0 0 0 1px ${accent}1F, inset 0 1px 0 rgba(255,255,255,0.06)`
          }}
        >
          {isSuccess ? (
            <>
              {/* ---- Stage ---- */}
              <div className="relative h-[236px] overflow-hidden">
                <div className="fill-floor pointer-events-none absolute inset-x-0 bottom-0 h-[60%]" />
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-[70%]"
                  style={{ background: `radial-gradient(ellipse at 50% 70%, ${accent}22, transparent 68%)` }}
                />
                <span
                  className="animate-horizon pointer-events-none absolute left-1/2 top-[62%] h-px w-[78%] -translate-x-1/2"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
                />
                <span
                  className="animate-ring-burst pointer-events-none absolute left-1/2 top-[52%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                  style={{ borderColor: accent }}
                />
                <div className="pointer-events-none absolute left-1/2 top-[56%] h-0 w-0">
                  <Sparks colour={accent} />
                </div>

                <div className="relative flex h-full items-end justify-center gap-6 pb-4">
                  <div className="animate-bull-charge">
                    <Bull360 width={244} height={196} autoSpin showDegrees={false} showHint={false} />
                  </div>
                  <div className="mb-12 shrink-0">
                    <CrystalCandle positive={!isSell} />
                  </div>
                </div>
              </div>

              {/* ---- Receipt ---- */}
              <div className="relative px-6 pb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div
                      className="animate-row-in inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[9.5px] font-bold uppercase tracking-[0.16em]"
                      style={{ borderColor: `${accent}59`, backgroundColor: `${accent}1A`, color: accent }}
                    >
                      {isSell ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {isSell ? 'Sell filled' : 'Buy filled'}
                    </div>
                    <h3
                      className="animate-row-in font-heading mt-2 text-[26px] font-bold leading-none tracking-tight"
                      style={{ animationDelay: '0.05s', color: PANEL_TEXT }}
                    >
                      {headline}
                    </h3>
                  </div>

                  <div className="animate-row-in text-right" style={{ animationDelay: '0.1s' }}>
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: PANEL_TEXT_DIM }}>
                      Notional
                    </div>
                    <div className="font-mono text-[22px] font-bold leading-tight tabular-nums" style={{ color: accent }}>
                      {counted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="font-mono text-[9.5px]" style={{ color: PANEL_TEXT_DIM }}>
                      IC
                    </div>
                  </div>
                </div>

                <div
                  className="mt-4 divide-y rounded-2xl border px-4 py-1"
                  style={{ borderColor: 'var(--border-card)', backgroundColor: 'rgba(6,11,24,0.6)' }}
                >
                  <Row label="Stock Name" value={result.symbol || '—'} delay={0.14} strong />
                  <Row label="Quantity" value={qty || '—'} delay={0.2} />
                  <Row
                    label="Fill price"
                    value={price ? `${price.toFixed(2)} IC` : '—'}
                    delay={0.26}
                    colour={accent}
                  />
                </div>

                {result.message && (
                  <p
                    className="animate-row-in mt-3 text-center text-[12px] leading-relaxed"
                    style={{ animationDelay: '0.32s', color: PANEL_TEXT_MUTED }}
                  >
                    {result.message}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => onClose && onClose()}
                  className="animate-row-in mt-4 w-full rounded-xl border py-2.5 text-[13px] font-semibold theme-text-main transition hover:border-[var(--accent-ring)] hover:bg-[var(--bg-card-hover)]"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-card)',
                    animationDelay: '0.38s'
                  }}
                >
                  Back to the floor
                </button>
              </div>
            </>
          ) : (
            <div className="relative px-6 pb-6 pt-9 text-center">
              <div
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border"
                style={{ borderColor: `${accent}59`, backgroundColor: `${accent}1A` }}
              >
                <AlertTriangle className="h-9 w-9" style={{ color: accent }} />
              </div>
              <div
                className="mt-5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ borderColor: `${accent}59`, backgroundColor: `${accent}1A`, color: accent }}
              >
                <AlertTriangle className="h-3 w-3" />
                Rejected
              </div>
              <h3 className="font-heading mt-3 text-[24px] font-bold tracking-tight" style={{ color: PANEL_TEXT }}>
                {headline}
              </h3>
              {result.message && (
                <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed" style={{ color: PANEL_TEXT_MUTED }}>
                  {result.message}
                </p>
              )}
              <button
                type="button"
                onClick={() => onClose && onClose()}
                className="mt-5 w-full rounded-xl border py-2.5 text-[13px] font-semibold theme-text-main transition hover:border-[var(--accent-ring)]"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
              >
                Close
              </button>
            </div>
          )}

          {/* Auto-dismiss meter */}
          <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <div
              className="animate-fill-timer h-full"
              style={{ backgroundColor: accent, animationDuration: `${holdMs}ms` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default BullCelebration;
