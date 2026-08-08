import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, PieChart, Wallet } from 'lucide-react';
import { sectorTint } from './sectorTheme';

/**
 * Holdings, allocation and the full trade ledger.
 *
 * Every holding's price is taken from the live `stocks` feed rather than the
 * snapshot returned by /portfolio, so spot price and P/L stay in step with the
 * board instead of freezing between refetches.
 */
export function PortfolioSection({ portfolio, stocks, onTrade, locked }) {
  const priceBySymbol = useMemo(() => {
    const map = {};
    stocks.forEach((s) => {
      map[s.symbol] = s;
    });
    return map;
  }, [stocks]);

  const holdings = useMemo(
    () =>
      (portfolio.holdings || []).map((h) => {
        const live = priceBySymbol[h.symbol];
        const spot = live ? live.currentPrice : h.currentPrice || 0;
        const cost = (h.avgBuyPrice || 0) * (h.quantity || 0);
        const value = spot * (h.quantity || 0);
        const pl = value - cost;
        return {
          ...h,
          sector: live?.sector || h.sector,
          spot,
          value,
          pl,
          plPercent: cost > 0 ? (pl / cost) * 100 : 0
        };
      }),
    [portfolio.holdings, priceBySymbol]
  );

  const holdingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const totalPL = holdings.reduce((sum, h) => sum + h.pl, 0);
  const wallet = portfolio.availableWalletBalance ?? portfolio.walletBalance ?? 0;

  const allocation = useMemo(() => {
    const bySector = {};
    holdings.forEach((h) => {
      const key = h.sector || 'Other';
      bySector[key] = (bySector[key] || 0) + h.value;
    });
    return Object.entries(bySector)
      .map(([sector, value]) => ({ sector, value, pct: holdingsValue > 0 ? (value / holdingsValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, holdingsValue]);

  const transactions = portfolio.transactions || [];

  if (!holdings.length) {
    return (
      <div className="arena-card arena-rise flex flex-col items-center justify-center p-14 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
          <Wallet className="h-7 w-7 text-[var(--accent)]" />
        </div>
        <h2 className="font-heading text-[20px] font-bold theme-text-main">Nothing here yet</h2>
        <p className="mt-1.5 max-w-[340px] text-[13.5px] theme-text-muted">
          You are holding {wallet.toFixed(2)} IC in cash. Pick a stock off the floor and make your first move.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="arena-card arena-rise p-4">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider theme-text-dim">Holdings value</div>
          <div className="mt-1.5 font-heading text-[24px] font-bold tabular-nums theme-text-main">
            {holdingsValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span className="text-[13px] theme-text-dim">IC</span>
          </div>
        </div>
        <div className="arena-card arena-rise p-4" style={{ animationDelay: '60ms' }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider theme-text-dim">Unrealised P/L</div>
          <div
            className="mt-1.5 font-heading text-[24px] font-bold tabular-nums"
            style={{ color: totalPL >= 0 ? 'var(--gain-green)' : 'var(--loss-red)' }}
          >
            {totalPL >= 0 ? '+' : ''}
            {totalPL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span className="text-[13px] opacity-70">IC</span>
          </div>
        </div>
        <div className="arena-card arena-rise p-4" style={{ animationDelay: '120ms' }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider theme-text-dim">Cash</div>
          <div className="mt-1.5 font-heading text-[24px] font-bold tabular-nums theme-text-main">
            {wallet.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span className="text-[13px] theme-text-dim">IC</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Positions */}
        <div className="arena-card arena-rise p-5">
          <h2 className="font-heading mb-3 text-[16px] font-bold theme-text-main">Open positions</h2>

          <div className="space-y-2">
            {holdings.map((h) => {
              const up = h.pl >= 0;
              return (
                <div
                  key={h.id || h.symbol}
                  className="flex flex-wrap items-center gap-3 rounded-xl border theme-border p-3"
                  style={{ backgroundColor: 'var(--bg-input)' }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-heading text-[11px] font-bold"
                    style={{ backgroundColor: `${sectorTint(h.sector)}22`, color: sectorTint(h.sector) }}
                  >
                    {h.symbol.slice(0, 2)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold theme-text-main">{h.symbol}</div>
                    <div className="truncate text-[11px] theme-text-dim">
                      {h.quantity} @ avg {(h.avgBuyPrice || 0).toFixed(2)}
                      {h.lockedQuantity > 0 ? ` · ${h.lockedQuantity} locked` : ''}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-[10px] uppercase tracking-wider theme-text-dim">Spot</div>
                    <div className="font-mono text-[13.5px] font-semibold tabular-nums theme-text-main">
                      {h.spot.toFixed(2)}
                    </div>
                  </div>

                  <div className="w-[104px] text-right">
                    <div
                      className="flex items-center justify-end gap-1 font-mono text-[13.5px] font-bold tabular-nums"
                      style={{ color: up ? 'var(--gain-green)' : 'var(--loss-red)' }}
                    >
                      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {up ? '+' : ''}{h.pl.toFixed(2)}
                    </div>
                    <div className="font-mono text-[11px]" style={{ color: up ? 'var(--gain-green)' : 'var(--loss-red)' }}>
                      {up ? '+' : ''}{h.plPercent.toFixed(2)}%
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onTrade(priceBySymbol[h.symbol] || h)}
                    disabled={locked}
                    className="rounded-lg border border-[var(--loss-red)]/40 bg-[var(--loss-red)]/10 px-3 py-1.5 text-[12px] font-bold text-[var(--loss-red)] transition hover:bg-[var(--loss-red)]/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Sell
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Allocation */}
        <div className="arena-card arena-rise p-5" style={{ animationDelay: '80ms' }}>
          <div className="mb-3 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="font-heading text-[16px] font-bold theme-text-main">Allocation</h2>
          </div>

          {/* Stacked bar with a 2px gap between segments */}
          <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
            {allocation.map((a) => (
              <span
                key={a.sector}
                title={`${a.sector} — ${a.pct.toFixed(1)}%`}
                style={{ width: `${a.pct}%`, backgroundColor: sectorTint(a.sector) }}
              />
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {allocation.map((a) => (
              <div key={a.sector} className="flex items-center gap-2 text-[12.5px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: sectorTint(a.sector) }} />
                <span className="min-w-0 flex-1 truncate theme-text-muted">{a.sector}</span>
                <span className="font-mono tabular-nums theme-text-main">{a.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div className="arena-card arena-rise p-5">
        <h2 className="font-heading mb-3 text-[16px] font-bold theme-text-main">
          Trade ledger
          <span className="ml-2 font-mono text-[12px] font-normal theme-text-dim">{transactions.length} fills</span>
        </h2>

        {transactions.length === 0 ? (
          <p className="py-6 text-center text-[13px] theme-text-dim">No trades yet this session.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b theme-border font-mono text-[10px] uppercase tracking-wider theme-text-dim">
                  <th className="py-2 pr-3 font-normal">Side</th>
                  <th className="py-2 pr-3 font-normal">Symbol</th>
                  <th className="py-2 pr-3 text-right font-normal">Qty</th>
                  <th className="py-2 pr-3 text-right font-normal">Price</th>
                  <th className="py-2 text-right font-normal">Value</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const isBuy = t.type === 'BUY';
                  return (
                    <tr key={t.id} className="border-b theme-border last:border-0">
                      <td className="py-2 pr-3">
                        <span
                          className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold"
                          style={{
                            backgroundColor: isBuy ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                            color: isBuy ? 'var(--gain-green)' : 'var(--loss-red)'
                          }}
                        >
                          {t.type}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-semibold theme-text-main">{t.symbol || t.stock?.symbol}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums theme-text-muted">{t.quantity}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums theme-text-muted">
                        {(t.price || 0).toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums theme-text-main">
                        {((t.price || 0) * (t.quantity || 0)).toFixed(2)}
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
  );
}

export default PortfolioSection;
