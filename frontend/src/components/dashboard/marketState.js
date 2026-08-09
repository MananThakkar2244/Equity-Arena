/**
 * Market state maths.
 *
 * Kept out of the component file on purpose: React Fast Refresh only works
 * when a module exports components exclusively, and mixing these helpers in
 * broke HMR for the whole hero.
 */

/**
 * Breadth and direction, combined.
 *
 * Breadth alone calls a market bullish when fourteen listings tick up a
 * hundredth; the composite alone ignores that one heavyweight can carry it.
 * Weighting them evenly is the honest read.
 */
export function readMarket(stocks, index) {
  const list = Array.isArray(stocks) ? stocks : [];
  const total = list.length;

  const advancing = list.filter((s) => (s.percentChange || 0) > 0).length;
  const declining = list.filter((s) => (s.percentChange || 0) < 0).length;
  const flat = Math.max(0, total - advancing - declining);

  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  // Largest-remainder so the three readings always total exactly 100.
  const advPct = pct(advancing);
  const decPct = pct(declining);
  const flatPct = total > 0 ? Math.max(0, 100 - advPct - decPct) : 0;

  const breadth = total > 0 ? (advancing - declining) / total : 0;
  const drift = Math.max(-1, Math.min(1, (index?.change || 0) / 3));
  const score = breadth * 0.5 + drift * 0.5;

  // Strength is that same score on a 0-100 dial, so the needle and the label
  // can never disagree — a gauge reading 68 while the label says BEARISH would
  // be worse than no gauge at all.
  const strength = Math.round(((score + 1) / 2) * 100);

  return { total, advancing, declining, flat, advPct, decPct, flatPct, score, strength };
}

/**
 * State machine with hysteresis: leaving a state needs a weaker score than
 * entering it did, or a score resting on the boundary flips every tick.
 */
export function nextMarketState(prev, score) {
  const enter = 0.16;
  const exit = 0.07;
  if (prev === 'BULLISH') return score < exit ? (score < -enter ? 'BEARISH' : 'NEUTRAL') : 'BULLISH';
  if (prev === 'BEARISH') return score > -exit ? (score > enter ? 'BULLISH' : 'NEUTRAL') : 'BEARISH';
  if (score > enter) return 'BULLISH';
  if (score < -enter) return 'BEARISH';
  return 'NEUTRAL';
}
