const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Reconstructs what a trader's portfolio was actually worth over time.
 *
 * There is no stored series of portfolio values — storing one would drift out
 * of sync with the trades that produced it. Instead the curve is rebuilt from
 * the two things that are recorded truthfully: every Transaction, and the
 * PriceHistory the ticker writes every 6 seconds.
 *
 * At any instant T:
 *     value(T) = cash(T) + Σ quantity_i(T) × price_i(T)
 *
 * cash and quantity are step functions that only move when a trade fills, and
 * price_i(T) is the last tick at or before T. Walking all three forward
 * together gives a curve that matches the ledger exactly rather than an
 * approximation drawn from the current value backwards.
 */

const RANGES = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000
};

// The full game is three hours. ~120 points keeps every range visually smooth
// without shipping 1,800 ticks per stock to the browser.
const POINTS = 120;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Rewinds the current book to what it was at `since`.
 *
 * Working backwards is deliberate: the live wallet and holdings rows are the
 * authoritative present, so undoing the trades that happened since then can
 * never drift, whereas replaying forward from a guessed opening balance can.
 */
function rewind(walletNow, holdingsNow, transactionsAfter) {
  let cash = walletNow;
  const quantities = new Map();

  holdingsNow.forEach((h) => quantities.set(h.stockId, h.quantity));

  for (const tx of transactionsAfter) {
    const notional = tx.quantity * tx.price;
    const held = quantities.get(tx.stockId) || 0;

    if (tx.type === 'BUY') {
      // Undo a buy: the cash comes back, the shares go away.
      cash += notional;
      quantities.set(tx.stockId, held - tx.quantity);
    } else {
      cash -= notional;
      quantities.set(tx.stockId, held + tx.quantity);
    }
  }

  return { cash, quantities };
}

async function getPortfolioHistory(userId, rangeKey = '3h') {
  const windowMs = RANGES[rangeKey] || RANGES['3h'];
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { holdings: true }
  });
  if (!user) return null;

  // Never draw before the session opened — a flat line back into yesterday is
  // noise, not history.
  const session = await prisma.session.findFirst({ orderBy: { createdAt: 'desc' } });
  const sessionStart = session ? new Date(session.startTime) : null;

  let startTime = new Date(now.getTime() - windowMs);
  if (sessionStart && sessionStart > startTime) startTime = sessionStart;

  const allTransactions = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { timestamp: 'asc' },
    select: { stockId: true, type: true, quantity: true, price: true, timestamp: true }
  });

  const after = allTransactions.filter((t) => t.timestamp > startTime);
  const { cash: openingCash, quantities: openingQty } = rewind(
    user.walletBalance,
    user.holdings,
    [...after].reverse()
  );

  // Every stock that mattered at any point in the window.
  const stockIds = new Set();
  user.holdings.forEach((h) => stockIds.add(h.stockId));
  openingQty.forEach((qty, id) => qty !== 0 && stockIds.add(id));
  after.forEach((t) => stockIds.add(t.stockId));

  const ids = [...stockIds];

  // Ticks inside the window, plus the last tick before it so a stock held from
  // the open is priced from bar one instead of starting at zero.
  const [inWindow, priors] = await Promise.all([
    ids.length
      ? prisma.priceHistory.findMany({
          where: { stockId: { in: ids }, timestamp: { gte: startTime, lte: now } },
          orderBy: { timestamp: 'asc' },
          select: { stockId: true, price: true, timestamp: true }
        })
      : [],
    Promise.all(
      ids.map((id) =>
        prisma.priceHistory.findFirst({
          where: { stockId: id, timestamp: { lt: startTime } },
          orderBy: { timestamp: 'desc' },
          select: { stockId: true, price: true, timestamp: true }
        })
      )
    )
  ]);

  const stocks = await prisma.stock.findMany({
    where: { id: { in: ids.length ? ids : ['__none__'] } },
    select: { id: true, currentPrice: true }
  });

  const priceNow = new Map(stocks.map((s) => [s.id, s.currentPrice]));

  // Seed each stock's running price with its pre-window tick, falling back to
  // the live price so a stock the ticker has not written yet still prices.
  const lastPrice = new Map();
  priors.filter(Boolean).forEach((p) => lastPrice.set(p.stockId, p.price));
  ids.forEach((id) => {
    if (!lastPrice.has(id)) lastPrice.set(id, priceNow.get(id) || 0);
  });

  const span = Math.max(now.getTime() - startTime.getTime(), 1);
  const step = span / POINTS;

  const quantities = new Map(openingQty);
  let cash = openingCash;

  let txCursor = 0;
  let priceCursor = 0;
  const points = [];

  for (let i = 0; i <= POINTS; i += 1) {
    const t = startTime.getTime() + step * i;

    // Advance both step functions to T. Single forward pass over each list —
    // no rescanning per bucket.
    while (priceCursor < inWindow.length && inWindow[priceCursor].timestamp.getTime() <= t) {
      const tick = inWindow[priceCursor];
      lastPrice.set(tick.stockId, tick.price);
      priceCursor += 1;
    }

    while (txCursor < after.length && after[txCursor].timestamp.getTime() <= t) {
      const tx = after[txCursor];
      const notional = tx.quantity * tx.price;
      const held = quantities.get(tx.stockId) || 0;
      if (tx.type === 'BUY') {
        cash -= notional;
        quantities.set(tx.stockId, held + tx.quantity);
      } else {
        cash += notional;
        quantities.set(tx.stockId, held - tx.quantity);
      }
      txCursor += 1;
    }

    let holdingsValue = 0;
    quantities.forEach((qty, id) => {
      if (qty > 0) holdingsValue += qty * (lastPrice.get(id) || 0);
    });

    points.push({
      t: Math.round(t),
      value: round2(cash + holdingsValue),
      cash: round2(cash),
      holdingsValue: round2(holdingsValue)
    });
  }

  // Pin the final point to the live book so the chart's last pixel and the
  // headline number can never disagree.
  const liveHoldingsValue = user.holdings.reduce(
    (sum, h) => sum + h.quantity * (priceNow.get(h.stockId) || 0),
    0
  );
  const liveValue = round2(user.walletBalance + liveHoldingsValue);
  if (points.length) {
    points[points.length - 1] = {
      t: now.getTime(),
      value: liveValue,
      cash: round2(user.walletBalance),
      holdingsValue: round2(liveHoldingsValue)
    };
  }

  const openValue = points.length ? points[0].value : liveValue;
  const change = round2(liveValue - openValue);

  return {
    range: rangeKey,
    startTime: startTime.toISOString(),
    endTime: now.toISOString(),
    sessionStart: sessionStart ? sessionStart.toISOString() : null,
    openValue,
    currentValue: liveValue,
    change,
    changePercent: openValue > 0 ? round2((change / openValue) * 100) : 0,
    points
  };
}

module.exports = { getPortfolioHistory, RANGES };
