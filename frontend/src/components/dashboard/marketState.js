/**
 * Market state maths
 *
 * Breadth is the primary signal for the Arena state.
 *
 * The market contains a relatively small number of listings, so we use
 * a meaningful neutral zone instead of allowing one stock to flip the
 * entire market state.
 */

/**
 * Read the current market.
 */
export function readMarket(stocks, index) {
  const list = Array.isArray(stocks) ? stocks : [];

  const total = list.length;

  const advancing = list.filter(
    (s) => Number(s.percentChange || 0) > 0
  ).length;

  const declining = list.filter(
    (s) => Number(s.percentChange || 0) < 0
  ).length;

  const flat = Math.max(0, total - advancing - declining);

  // ------------------------------------------------------------------
  // Guarantee that advPct + flatPct + decPct === 100
  // ------------------------------------------------------------------
  function computePercentages(adv, dec, flt, tot) {
    if (tot === 0) return { advPct: 0, decPct: 0, flatPct: 0 };

    const advPct = Math.round((adv / tot) * 100);
    const decPct = Math.round((dec / tot) * 100);
    let flatPct = Math.round((flt / tot) * 100);

    const sum = advPct + decPct + flatPct;

    // Adjust the largest category so the three values always total 100
    if (sum !== 100) {
      const diff = 100 - sum; // +1 or -1 (rarely more)
      const values = [advPct, decPct, flatPct];
      const maxIndex = values.indexOf(Math.max(...values));
      values[maxIndex] += diff;
      return {
        advPct: values[0],
        decPct: values[1],
        flatPct: values[2],
      };
    }

    return { advPct, decPct, flatPct };
  }

  const { advPct, decPct, flatPct } = computePercentages(
    advancing,
    declining,
    flat,
    total
  );

  /**
   * Breadth ranges from:
   *
   * -1 = completely bearish
   *  0 = perfectly balanced
   * +1 = completely bullish
   */
  const breadth =
    total > 0 ? (advancing - declining) / total : 0;

  /**
   * Index movement.
   *
   * Normalize the index movement into approximately
   * -1 → +1.
   */
  const indexChange = Number(index?.change || 0);
  const drift = Math.max(-1, Math.min(1, indexChange / 3));

  /**
   * Composite market score.
   *
   * Breadth gets 70% weight.
   * Index movement gets 30% weight.
   */
  const score = breadth * 0.7 + drift * 0.3;

  /**
   * Convert the score into a 0-100 strength value.
   */
  const strength = Math.round(((score + 1) / 2) * 100);

  return {
    total,
    advancing,
    declining,
    flat,
    advPct,
    decPct,
    flatPct,
    breadth,
    drift,
    score,
    strength,
  };
}

/**
 * Determine the visible market state.
 *
 * We intentionally use a wider neutral zone.
 *
 * With 15 listings:
 *
 * 8 advancing / 7 declining
 *     ↓
 * ~53% / ~47%
 *     ↓
 * NEUTRAL
 *
 * 10 advancing / 5 declining
 *     ↓
 * ~67% / ~33%
 *     ↓
 * BULLISH
 *
 * 5 advancing / 10 declining
 *     ↓
 * ~33% / ~67%
 *     ↓
 * BEARISH
 */
export function nextMarketState(score, breadth = null) {
  const BREADTH_THRESHOLD = 0.15;

  /**
   * Breadth is the primary source of truth.
   */
  if (typeof breadth === 'number') {
    if (breadth >= BREADTH_THRESHOLD) {
      return 'BULLISH';
    }
    if (breadth <= -BREADTH_THRESHOLD) {
      return 'BEARISH';
    }
    return 'NEUTRAL';
  }

  /**
   * Fallback if another component calls this function
   * without providing breadth.
   */
  const SCORE_THRESHOLD = 0.15;
  if (score >= SCORE_THRESHOLD) {
    return 'BULLISH';
  }
  if (score <= -SCORE_THRESHOLD) {
    return 'BEARISH';
  }
  return 'NEUTRAL';
}