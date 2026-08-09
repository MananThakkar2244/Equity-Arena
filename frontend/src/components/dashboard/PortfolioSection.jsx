import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  HeartPulse,
  PieChart as PieIcon,
  Shield,
  Wallet
} from 'lucide-react';
import { sectorTint } from './sectorTheme';
import { PortfolioChart } from './PortfolioChart';
import { apiFetch } from '../../services/api';

/**
 * Portfolio — holdings, allocation, health and the value curve.
 *
 * Two sources of truth, deliberately kept apart:
 *   - Live rows (holdings, P/L, allocation) are priced off the `stocks` feed,
 *     so they move with the board between refetches.
 *   - The value curve comes from /portfolio/history, which reconstructs what
 *     the book was actually worth from the ledger and PriceHistory. It is not
 *     accumulated client-side, so it survives a refresh intact.
 */

// The whole game is three hours; ranges are windows into that, not calendar days.
const RANGES = [
  { id: '15m', label: '15M' },
  { id: '1h', label: '1H' },
  { id: '3h', label: '3H' }
];

const ic = (n, dp = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp
  });

const signed = (n, dp = 2) => `${n >= 0 ? '+' : ''}${ic(n, dp)}`;

function Sparkline({ prices = [], positive }) {
  const d = useMemo(() => {
    const pts = prices.filter(Number.isFinite);
    if (pts.length < 2) return '';
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const range = hi - lo || 1;
    return pts
      .map((p, i) => {
        const x = (i / (pts.length - 1)) * 100;
        const y = 26 - ((p - lo) / range) * 22;
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [prices]);

  if (!d) return <div className="h-[28px] w-[76px]" />;
  return (
    <svg viewBox="0 0 100 28" className="h-[28px] w-[76px]" preserveAspectRatio="none">
      <path
        d={d}
        fill="none"
        stroke={positive ? 'var(--gain-green, #22c55e)' : 'var(--loss-red, #ef4444)'}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SnapshotRow({ label, value, tone = 'plain', dp = 2 }) {
  const colour =
    tone === 'gain'
      ? 'text-[var(--gain-green,#22c55e)]'
      : tone === 'loss'
      ? 'text-[var(--loss-red,#ef4444)]'
      : 'theme-text-main';
  return (
    <div className="flex items-center justify-between py-[7px]">
      <span className="text-[13px] theme-text-muted">{label}</span>
      <span className={`font-mono text-[13.5px] font-bold tabular-nums ${colour}`}>
        {tone === 'gain' || tone === 'loss' ? signed(value, dp) : ic(value, dp)}
        <span className="ml-1 text-[11px] font-normal opacity-55">IC</span>
      </span>
    </div>
  );
}

/** Donut built from arcs rather than a chart lib — 3 sectors do not justify a dependency. */
function Donut({ slices, total }) {
  const R = 54;
  const STROKE = 22;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="relative grid h-[168px] w-[168px] shrink-0 place-items-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth={STROKE} />
        {slices.map((s) => {
          const len = (s.share / 100) * C;
          const el = (
            <circle
              key={s.key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={s.colour}
              strokeWidth={STROKE}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-[15px] font-bold tabular-nums theme-text-main">{ic(total, 2)}</div>
          <div className="font-mono text-[10px] theme-text-dim">IC</div>
          <div className="mt-0.5 text-[10px] theme-text-dim">Total Value</div>
        </div>
      </div>
    </div>
  );
}

function HealthBar({ icon: Icon, label, score, colour }) {
  return (
    <div className="flex items-center gap-3 py-[7px]">
      <Icon className="h-4 w-4 shrink-0" style={{ color: colour }} />
      <span className="w-[104px] shrink-0 text-[12.5px] theme-text-muted">{label}</span>
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[currentColor]/10">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(2, score)}%`, backgroundColor: colour }}
        />
      </div>
      <span className="w-[52px] shrink-0 text-right font-mono text-[12.5px] font-bold tabular-nums theme-text-main">
        {score}
        <span className="text-[10px] font-normal opacity-50"> /100</span>
      </span>
    </div>
  );
}

export function PortfolioSection({ portfolio, stocks, onTrade, locked }) {
  const [range, setRange] = useState('3h');
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const stockBySymbol = useMemo(() => {
    const map = {};
    stocks.forEach((s) => {
      map[s.symbol] = s;
    });
    return map;
  }, [stocks]);

  /* ------------------------------------------------------------------ *
   * Value curve — server-reconstructed, never accumulated in the client
   * ------------------------------------------------------------------ */
  const fetchHistory = useCallback(async (which) => {
    try {
      const data = await apiFetch(`/portfolio/history?range=${which}`);
      // A slow response for an abandoned range must not overwrite the current one.
      if (rangeRef.current === which) setHistory(data);
    } catch (err) {
      console.error('Portfolio history error:', err);
    } finally {
      if (rangeRef.current === which) setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    setLoadingHistory(true);
    fetchHistory(range);
  }, [range, fetchHistory]);

  // Refresh on the ticker's cadence. The curve is cheap to rebuild and this
  // keeps the head of the line pinned to the live book.
  useEffect(() => {
    const id = setInterval(() => fetchHistory(rangeRef.current), 12000);
    return () => clearInterval(id);
  }, [fetchHistory]);

  // A fill changes the ledger, so the curve is stale the moment one lands.
  const txCount = (portfolio.transactions || []).length;
  useEffect(() => {
    fetchHistory(rangeRef.current);
  }, [txCount, fetchHistory]);

  /* ------------------------------------------------------------------ *
   * Live rows
   * ------------------------------------------------------------------ */
  const holdings = useMemo(
    () =>
      (portfolio.holdings || []).map((h) => {
        const live = stockBySymbol[h.symbol];
        const spot = live ? live.currentPrice : h.currentPrice || 0;
        const cost = (h.avgBuyPrice || 0) * (h.quantity || 0);
        const value = spot * (h.quantity || 0);
        const pl = value - cost;
        return {
          ...h,
          sector: live?.sector || h.sector || 'Other',
          spot,
          cost,
          value,
          pl,
          plPercent: cost > 0 ? (pl / cost) * 100 : 0,
          spark: (live?.priceHistories || []).map((p) => p.price)
        };
      }),
    [portfolio.holdings, stockBySymbol]
  );

  const totals = useMemo(() => {
    const invested = holdings.reduce((s, h) => s + h.cost, 0);
    const current = holdings.reduce((s, h) => s + h.value, 0);
    const cash = portfolio.walletBalance || 0;
    return {
      invested,
      current,
      cash,
      unrealised: current - invested,
      netWorth: cash + current
    };
  }, [holdings, portfolio.walletBalance]);

  // Session P/L comes from the reconstructed curve's open, not from cost basis:
  // cost basis cannot see cash that was never deployed.
  const sessionPL = history ? history.change : 0;
  const sessionPLPercent = history ? history.changePercent : 0;
  const totalReturnPercent = totals.invested > 0 ? (totals.unrealised / totals.invested) * 100 : 0;

  const allocation = useMemo(() => {
    const bySector = {};
    holdings.forEach((h) => {
      bySector[h.sector] = (bySector[h.sector] || 0) + h.value;
    });
    const total = Object.values(bySector).reduce((s, v) => s + v, 0);
    return {
      total,
      slices: Object.entries(bySector)
        .map(([key, value]) => ({
          key,
          value,
          share: total > 0 ? (value / total) * 100 : 0,
          colour: sectorTint(key)
        }))
        .sort((a, b) => b.value - a.value)
    };
  }, [holdings]);

  /**
   * Portfolio health.
   *
   * Every score is derived from the book the trader actually holds — nothing
   * is a random flourish, so the advice under it is honest.
   */
  const health = useMemo(() => {
    const sectors = allocation.slices.length;
    const deployed = totals.netWorth > 0 ? totals.current / totals.netWorth : 0;

    // Herfindahl index: 1.0 means everything sits in one sector.
    const hhi = allocation.slices.reduce((s, x) => s + (x.share / 100) ** 2, 0) || 1;

    const diversification = Math.round(Math.min(100, (sectors / 5) * 55 + (1 - hhi) * 45));

    const topWeight = allocation.slices[0]?.share || 0;
    const riskBalance = Math.round(Math.max(0, Math.min(100, 100 - Math.max(0, topWeight - 25) * 1.15)));

    // A sweet spot near 70% deployed: idle cash wastes the session, and being
    // fully invested leaves nothing to answer a move with.
    const cashUtilization = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(deployed - 0.7) * 165)));

    const performance = Math.round(Math.max(0, Math.min(100, 50 + sessionPLPercent * 6)));

    const score = Math.round(
      diversification * 0.28 + riskBalance * 0.24 + cashUtilization * 0.18 + performance * 0.3
    );

    const verdict =
      score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : 'Needs work';

    let tip = 'Good job! Keep diversifying and monitor market trends.';
    if (!holdings.length) tip = 'No positions yet — put some capital to work before the session runs out.';
    else if (sectors < 3) tip = `Only ${sectors} sector${sectors === 1 ? '' : 's'} in play. Spreading wider softens a single bad print.`;
    else if (topWeight > 55) tip = `${allocation.slices[0].key} is ${topWeight.toFixed(0)}% of the book — trim it or hedge it.`;
    else if (deployed < 0.3) tip = 'Most of your capital is idle. The clock is the real constraint here.';
    else if (deployed > 0.95) tip = 'Almost fully invested — keep some cash to answer a dip.';

    return { diversification, riskBalance, cashUtilization, performance, score, verdict, tip };
  }, [allocation, totals, sessionPLPercent, holdings.length]);

  const trades = (portfolio.transactions || []).slice(0, 6);
  const up = sessionPL >= 0;

  return (
    <div className="space-y-5">
      {/* ---- header + range ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[26px] font-bold leading-tight tracking-tight theme-text-main">
            Portfolio
          </h1>
          <p className="mt-0.5 text-[13px] theme-text-muted">
            Track your holdings and performance in real-time
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border theme-border p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-lg px-4 py-1.5 font-mono text-[12px] font-bold transition-colors ${
                range === r.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'theme-text-muted hover:theme-text-main'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* ================= LEFT ================= */}
        <div className="space-y-5 xl:col-span-2">
          {/* ---- value + curve ---- */}
          <div className="rounded-2xl border theme-border theme-bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[13px] theme-text-muted">Portfolio Value</div>
                <div className="mt-1 font-mono text-[34px] font-bold leading-none tabular-nums theme-text-main">
                  {ic(totals.netWorth)}
                  <span className="ml-1.5 text-[16px] font-normal opacity-55">IC</span>
                </div>
                <div
                  className={`mt-2 font-mono text-[13px] font-bold tabular-nums ${
                    up ? 'text-[var(--gain-green,#22c55e)]' : 'text-[var(--loss-red,#ef4444)]'
                  }`}
                >
                  {signed(sessionPL)} IC ({signed(sessionPLPercent)}%)
                  <span className="ml-1 font-normal theme-text-dim">this session</span>
                </div>
              </div>

              <div
                className={`rounded-xl border px-4 py-2.5 text-center ${
                  totalReturnPercent >= 0
                    ? 'border-[var(--gain-green,#22c55e)]/30 bg-[var(--gain-green,#22c55e)]/10'
                    : 'border-[var(--loss-red,#ef4444)]/30 bg-[var(--loss-red,#ef4444)]/10'
                }`}
              >
                <div
                  className={`font-mono text-[19px] font-bold tabular-nums ${
                    totalReturnPercent >= 0
                      ? 'text-[var(--gain-green,#22c55e)]'
                      : 'text-[var(--loss-red,#ef4444)]'
                  }`}
                >
                  {signed(totalReturnPercent)}%
                </div>
                <div className="mt-0.5 text-[10.5px] theme-text-muted">Total Return</div>
              </div>
            </div>

            <div className="mt-3">
              {loadingHistory && !history ? (
                <div className="grid h-[300px] place-items-center">
                  <span className="font-mono text-[11px] uppercase tracking-wider theme-text-dim">
                    Rebuilding value curve…
                  </span>
                </div>
              ) : (
                <PortfolioChart
                  points={history?.points || []}
                  openValue={history?.openValue}
                  height={300}
                />
              )}
            </div>
          </div>

          {/* ---- holdings ---- */}
          <div className="rounded-2xl border theme-border theme-bg-card">
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <h2 className="font-heading text-[17px] font-bold theme-text-main">
                Your Holdings{' '}
                <span className="font-mono text-[14px] font-normal theme-text-dim">
                  ({holdings.length})
                </span>
              </h2>
            </div>

            {holdings.length === 0 ? (
              <div className="px-5 pb-6 text-[13px] theme-text-muted">
                Nothing held yet. Buy something on the Market tab and it shows up here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-y theme-border">
                      {['Stock', 'Shares', 'Avg. Price', 'Current Price', 'P/L', 'P/L %', 'Value', '', ''].map(
                        (h, i) => (
                          <th
                            key={h + i}
                            className={`px-3 py-2 text-[11px] font-medium theme-text-dim ${
                              i === 0 ? 'text-left' : i >= 7 ? 'text-center' : 'text-right'
                            }`}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => {
                      const tint = sectorTint(h.sector);
                      const gain = h.pl >= 0;
                      return (
                        <tr key={h.id || h.symbol} className="border-b theme-border last:border-0">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold"
                                style={{ backgroundColor: `${tint}22`, color: tint }}
                              >
                                {h.symbol.slice(0, 2)}
                              </span>
                              <div className="min-w-0">
                                <div className="font-mono text-[13px] font-bold theme-text-main">{h.symbol}</div>
                                <div className="truncate text-[11px] theme-text-dim">{h.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums theme-text-main">
                            {h.quantity}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums theme-text-muted">
                            {ic(h.avgBuyPrice)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-semibold tabular-nums theme-text-main">
                            {ic(h.spot)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-mono text-[13px] font-bold tabular-nums ${
                              gain ? 'text-[var(--gain-green,#22c55e)]' : 'text-[var(--loss-red,#ef4444)]'
                            }`}
                          >
                            {signed(h.pl)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-mono text-[13px] font-bold tabular-nums ${
                              gain ? 'text-[var(--gain-green,#22c55e)]' : 'text-[var(--loss-red,#ef4444)]'
                            }`}
                          >
                            {signed(h.plPercent)}%
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[13px] font-bold tabular-nums theme-text-main">
                            {ic(h.value)}
                          </td>
                          <td className="px-3 py-3">
                            <Sparkline prices={h.spark} positive={gain} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => onTrade(stockBySymbol[h.symbol] || h)}
                              className="rounded-lg border border-[var(--loss-red,#ef4444)]/45 px-4 py-1.5 font-mono text-[11.5px] font-bold text-[var(--loss-red,#ef4444)] transition-colors hover:bg-[var(--loss-red,#ef4444)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {locked ? 'Locked' : 'Sell'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- recent trades ---- */}
          <div className="rounded-2xl border theme-border theme-bg-card">
            <div className="px-5 pb-3 pt-4">
              <h2 className="font-heading text-[17px] font-bold theme-text-main">Recent Trades</h2>
            </div>

            {trades.length === 0 ? (
              <div className="px-5 pb-6 text-[13px] theme-text-muted">No fills yet this session.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-y theme-border">
                      {['Type', 'Stock', 'Qty', 'Price', 'Value', 'Time'].map((h, i) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-[11px] font-medium theme-text-dim ${
                            i <= 1 ? 'text-left' : i === 5 ? 'text-right' : 'text-right'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => {
                      const buy = t.type === 'BUY';
                      return (
                        <tr key={t.id} className="border-b theme-border last:border-0">
                          <td className="px-3 py-2.5">
                            <span
                              className={`font-mono text-[11px] font-bold ${
                                buy
                                  ? 'text-[var(--gain-green,#22c55e)]'
                                  : 'text-[var(--loss-red,#ef4444)]'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-[12.5px] font-bold theme-text-main">
                              {t.stock?.symbol}
                            </div>
                            <div className="truncate text-[10.5px] theme-text-dim">{t.stock?.name}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums theme-text-main">
                            {t.quantity}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums theme-text-muted">
                            {ic(t.price)} <span className="text-[10px] opacity-55">IC</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[12.5px] font-semibold tabular-nums theme-text-main">
                            {ic(t.quantity * t.price)} <span className="text-[10px] opacity-55">IC</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[11.5px] tabular-nums theme-text-dim">
                            {new Date(t.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ================= RIGHT ================= */}
        <div className="space-y-5">
          {/* ---- snapshot ---- */}
          <div className="rounded-2xl border theme-border theme-bg-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <Wallet className="h-[18px] w-[18px] text-[var(--accent)]" />
              <h2 className="font-heading text-[16px] font-bold theme-text-main">Portfolio Snapshot</h2>
            </div>
            <SnapshotRow label="Invested Value" value={totals.invested} />
            <SnapshotRow label="Current Value" value={totals.current} />
            <SnapshotRow
              label="Unrealised P/L"
              value={totals.unrealised}
              tone={totals.unrealised >= 0 ? 'gain' : 'loss'}
            />
            <SnapshotRow
              label="Session P/L"
              value={sessionPL}
              tone={sessionPL >= 0 ? 'gain' : 'loss'}
            />
            <SnapshotRow label="Cash Balance" value={totals.cash} />
          </div>

          {/* ---- allocation ---- */}
          <div className="rounded-2xl border theme-border theme-bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <PieIcon className="h-[18px] w-[18px] text-[var(--accent)]" />
              <h2 className="font-heading text-[16px] font-bold theme-text-main">Allocation</h2>
            </div>

            {allocation.slices.length === 0 ? (
              <p className="text-[13px] theme-text-muted">
                Allocation appears once you hold something.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4">
                  <Donut slices={allocation.slices} total={allocation.total} />

                  <div className="min-w-[150px] flex-1 space-y-2.5">
                    {allocation.slices.map((s) => (
                      <div key={s.key} className="flex items-start gap-2">
                        <span
                          className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: s.colour }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[12.5px] theme-text-main">{s.key}</span>
                            <span className="font-mono text-[12.5px] font-bold tabular-nums theme-text-main">
                              {s.share.toFixed(1)}%
                            </span>
                          </div>
                          <div className="font-mono text-[11px] tabular-nums theme-text-dim">
                            {ic(s.value)} IC
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-3 border-t theme-border pt-3 text-[11.5px] theme-text-dim">
                  Diversification across {allocation.slices.length} sector
                  {allocation.slices.length === 1 ? '' : 's'}
                </p>
              </>
            )}
          </div>

          {/* ---- health ---- */}
          <div className="rounded-2xl border theme-border theme-bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-[18px] w-[18px] text-[var(--accent)]" />
                <h2 className="font-heading text-[16px] font-bold theme-text-main">Portfolio Health</h2>
              </div>
              <span className="text-[10.5px] theme-text-dim">Score</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <HealthBar icon={PieIcon} label="Diversification" score={health.diversification} colour="#3b82f6" />
                <HealthBar icon={Shield} label="Risk Balance" score={health.riskBalance} colour="#f59e0b" />
                <HealthBar icon={Gauge} label="Cash Utilization" score={health.cashUtilization} colour="#22d3ee" />
                <HealthBar icon={Activity} label="Performance" score={health.performance} colour="#22c55e" />
              </div>

              <div className="relative grid h-[104px] w-[104px] shrink-0 place-items-center">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.1"
                    strokeWidth="7"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${(health.score / 100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                    className="transition-[stroke-dasharray] duration-700"
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="font-mono text-[26px] font-bold leading-none tabular-nums theme-text-main">
                      {health.score}
                    </div>
                    <div className="font-mono text-[10px] theme-text-dim">/100</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 text-center font-mono text-[13px] font-bold text-[var(--gain-green,#22c55e)]">
              {health.verdict}
            </div>

            <p className="mt-3 border-t theme-border pt-3 text-center text-[11.5px] theme-text-muted">
              {health.tip}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PortfolioSection;
