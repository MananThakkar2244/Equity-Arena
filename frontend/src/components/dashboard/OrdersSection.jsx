import React, { useMemo } from 'react';
import { Clock3, Receipt, X } from 'lucide-react';

/**
 * Open limit orders (with cancel) and the fill history.
 * Both come from data already on /portfolio — no new endpoints.
 */
export function OrdersSection({ portfolio, onCancelOrder, cancellingId, locked }) {
  const pending = portfolio.pendingOrders || [];
  const transactions = portfolio.transactions || [];

  const lockedFunds = portfolio.lockedFunds || 0;

  const stats = useMemo(() => {
    const buys = transactions.filter((t) => t.type === 'BUY').length;
    const sells = transactions.filter((t) => t.type === 'SELL').length;
    return { buys, sells };
  }, [transactions]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="arena-card arena-rise p-4">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider theme-text-dim">Open orders</div>
          <div className="mt-1.5 font-heading text-[24px] font-bold tabular-nums theme-text-main">{pending.length}</div>
        </div>
        <div className="arena-card arena-rise p-4" style={{ animationDelay: '60ms' }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider theme-text-dim">Funds locked</div>
          <div className="mt-1.5 font-heading text-[24px] font-bold tabular-nums text-[var(--accent)]">
            {lockedFunds.toFixed(2)} <span className="text-[13px] opacity-70">IC</span>
          </div>
        </div>
        <div className="arena-card arena-rise p-4" style={{ animationDelay: '120ms' }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider theme-text-dim">Fills</div>
          <div className="mt-1.5 font-heading text-[24px] font-bold tabular-nums theme-text-main">
            {transactions.length}
            <span className="ml-2 font-mono text-[12px] font-normal theme-text-dim">
              {stats.buys} buy · {stats.sells} sell
            </span>
          </div>
        </div>
      </div>

      {/* Open orders */}
      <div className="arena-card arena-rise p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="font-heading text-[16px] font-bold theme-text-main">Waiting to fill</h2>
        </div>

        {pending.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13.5px] theme-text-muted">No limit orders working.</p>
            <p className="mt-1 text-[12px] theme-text-dim">
              Set a target price from any trade ticket and it will fill itself when the market gets there.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((o) => {
              const isBuy = o.type === 'BUY';
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border theme-border p-3"
                  style={{ backgroundColor: 'var(--bg-input)' }}
                >
                  <span
                    className="rounded-md px-2 py-1 font-mono text-[10px] font-bold"
                    style={{
                      backgroundColor: isBuy ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                      color: isBuy ? 'var(--gain-green)' : 'var(--loss-red)'
                    }}
                  >
                    {o.type}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold theme-text-main">{o.symbol || o.stock?.symbol}</div>
                    <div className="text-[11px] theme-text-dim">
                      {o.quantity} @ limit {(o.limitPrice ?? o.targetPrice ?? 0).toFixed(2)} IC
                    </div>
                  </div>

                  <span className="rounded-full border border-[var(--accent-ring)] bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    {o.status || 'PENDING'}
                  </span>

                  <button
                    type="button"
                    onClick={() => onCancelOrder(o.id)}
                    disabled={locked || cancellingId === o.id}
                    className="flex items-center gap-1 rounded-lg border theme-border px-2.5 py-1.5 text-[12px] font-semibold theme-text-muted transition hover:border-[var(--loss-red)]/50 hover:text-[var(--loss-red)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                    {cancellingId === o.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div className="arena-card arena-rise p-5">
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 theme-text-dim" />
          <h2 className="font-heading text-[16px] font-bold theme-text-main">Fill history</h2>
        </div>

        {transactions.length === 0 ? (
          <p className="py-6 text-center text-[13px] theme-text-dim">Nothing filled yet.</p>
        ) : (
          <div className="space-y-1.5">
            {transactions.map((t) => {
              const isBuy = t.type === 'BUY';
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-[12.5px] hover:bg-[var(--bg-card-hover)]">
                  <span
                    className="w-11 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] font-bold"
                    style={{
                      backgroundColor: isBuy ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                      color: isBuy ? 'var(--gain-green)' : 'var(--loss-red)'
                    }}
                  >
                    {t.type}
                  </span>
                  <span className="font-semibold theme-text-main">{t.symbol || t.stock?.symbol}</span>
                  <span className="theme-text-dim">
                    {t.quantity} @ {(t.price || 0).toFixed(2)}
                  </span>
                  <span className="ml-auto font-mono tabular-nums theme-text-main">
                    {((t.price || 0) * (t.quantity || 0)).toFixed(2)} IC
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default OrdersSection;
