import React from 'react';
import { BarChart3, Newspaper, Receipt, Rocket, TrendingUp, Wallet } from 'lucide-react';

export const SECTIONS = [
  { id: 'MARKET', label: 'Market', icon: BarChart3 },
  { id: 'PORTFOLIO', label: 'Portfolio', icon: Wallet },
  { id: 'ORDERS', label: 'Orders', icon: Receipt },
  { id: 'NEWS', label: 'News', icon: Newspaper }
];

/**
 * Fixed rail on desktop, bottom tab bar on mobile.
 * Badges surface counts that need attention (open orders, unread news).
 */
export function Sidebar({ active, onChange, badges = {}, isConnected }) {

  return (
    <>
      {/* ---------------- Desktop rail ---------------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r theme-border lg:flex"
        style={{ backgroundColor: 'var(--bg-panel)' }}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--accent)]/25 text-[var(--accent)]"
            style={{ backgroundColor: 'var(--accent-soft)' }}
          >
            <TrendingUp className="h-5 w-5" strokeWidth={2.6} />
          </div>
          <div className="leading-tight">
            <div className="font-heading text-[15px] font-bold tracking-tight theme-text-main">EQUITY ARENA</div>
            <div className="text-[10px] theme-text-dim">Trade. Climb. Win.</div>
          </div>
        </div>

        <nav className="mt-3 flex-1 px-3" aria-label="Primary navigation">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            const badge = badges[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`arena-sidebar-item group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[14px] font-medium transition ${
                  isActive ? 'arena-sidebar-item-active' : 'theme-text-muted'
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{s.label}</span>
                {badge ? (
                  <span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--accent-ink)]">
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Connection + account */}
        <div className="border-t theme-border px-3 py-3">
          <div className="mb-2 flex items-center gap-2 px-2 text-[11px] theme-text-dim">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'arena-pulse bg-[var(--gain-green)]' : 'bg-[var(--loss-red)]'}`}
            />
            {isConnected ? 'Live feed connected' : 'Reconnecting…'}
          </div>

          <div className="rounded-xl border theme-border p-3" style={{ backgroundColor: 'var(--bg-card)' }}>
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold theme-text-main">
              <Rocket className="h-3.5 w-3.5 text-[var(--accent)]" />
              Trade. Climb. Win.
            </div>
            <p className="mt-1 text-[11px] leading-relaxed theme-text-dim">
              Every tick is a chance. Read the wire, move before the floor does.
            </p>
          </div>
        </div>
      </aside>

      {/* ---------------- Mobile tab bar ---------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t theme-border lg:hidden"
        style={{ backgroundColor: 'var(--bg-panel)' }}
      >
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          const badge = badges[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-2 text-[10px] font-semibold transition ${
                isActive
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-transparent theme-text-dim hover:bg-[var(--bg-card-hover)] hover:theme-text-main'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {s.label}
              {badge ? (
                <span className="absolute right-[22%] top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              ) : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}

export default Sidebar;
