import React from 'react';
import { Bell, Clock, Lock, LogOut, Moon, Search, Sun, Volume2, VolumeX, Wallet } from 'lucide-react';
import { AnimatedNumber } from '../AnimatedNumber';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

/** hh:mm:ss from a second count, guarding against NaN/undefined. */
export function formatClock(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Sticky header: search, session state, wallet, alerts, theme switch, account.
 * The countdown escalates under 30 minutes and again under 5 — the point at
 * which the server begins its auto-liquidation sweep.
 */
export function TopBar({
  remainingSeconds,
  sessionStatus,
  walletBalance,
  query,
  onQueryChange,
  muted,
  onToggleSound,
  newsCount = 0
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const locked = sessionStatus === 'ENDED';
  const critical = !locked && remainingSeconds <= 300;
  const warning = !locked && !critical && remainingSeconds <= 1800;

  const stateLabel = locked ? 'Market closed' : critical ? 'Liquidating' : 'Market open';
  const dotColour = locked || critical ? 'var(--loss-red)' : warning ? '#F59E0B' : 'var(--gain-green)';

  return (
    <header
      className="sticky top-0 z-30 border-b theme-border backdrop-blur-xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--bg-panel) 92%, transparent)' }}
    >
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 sm:px-6">
        {/* Search */}
        <div className="relative order-last w-full sm:order-none sm:w-auto sm:min-w-[260px] sm:flex-1 sm:max-w-[420px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 theme-text-dim" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search stocks, sectors…"
            aria-label="Search stocks"
            className="w-full rounded-xl border theme-border py-2.5 pl-10 pr-3 text-[13px] theme-text-main outline-none transition placeholder:theme-text-dim focus:border-[var(--accent-ring)]"
            style={{ backgroundColor: 'var(--bg-input)' }}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Session state */}
          <div
            className="flex items-center gap-2.5 rounded-xl border theme-border px-3 py-1.5"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <span
              className={`h-2 w-2 rounded-full ${locked ? '' : 'arena-pulse'}`}
              style={{ backgroundColor: dotColour }}
            />
            <div className="leading-tight">
              <div className="text-[11px] font-semibold theme-text-main">{stateLabel}</div>
              <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums theme-text-dim">
                {locked ? <Lock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {locked ? '00:00:00' : formatClock(remainingSeconds)}
              </div>
            </div>
          </div>

          {/* Wallet */}
          <div
            className="flex items-center gap-2.5 rounded-xl border theme-border px-3 py-1.5"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <Wallet className="h-4 w-4 text-[var(--accent)]" />
            <div className="leading-tight">
              <div className="text-[10px] theme-text-dim">Wallet balance</div>
              <div className="font-mono text-[13px] font-bold tabular-nums theme-text-main">
                <AnimatedNumber value={walletBalance || 0} decimals={2} suffix=" IC" />
              </div>
            </div>
          </div>

          {/* Alerts */}
          <button
            type="button"
            title={`${newsCount} market stories`}
            aria-label={`${newsCount} market stories`}
            className="relative rounded-xl border theme-border p-2.5 theme-text-muted transition hover:text-[var(--accent)]"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <Bell className="h-4 w-4" />
            {newsCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {newsCount > 9 ? '9+' : newsCount}
              </span>
            )}
          </button>

          {/* Sound */}
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            title={muted ? 'Unmute' : 'Mute'}
            className="rounded-xl border theme-border p-2.5 theme-text-muted transition hover:text-[var(--accent)]"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {/* Light / dark switch */}
          <div
            className="flex items-center gap-0.5 rounded-xl border theme-border p-1"
            style={{ backgroundColor: 'var(--bg-card)' }}
            role="group"
            aria-label="Colour theme"
          >
            <button
              type="button"
              onClick={() => theme !== 'light' && toggleTheme()}
              aria-pressed={theme === 'light'}
              title="Light mode"
              className={`rounded-lg p-1.5 transition ${
                theme === 'light' ? 'text-[var(--accent-ink)]' : 'theme-text-dim hover:theme-text-main'
              }`}
              style={theme === 'light' ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => theme !== 'dark' && toggleTheme()}
              aria-pressed={theme === 'dark'}
              title="Dark mode"
              className={`rounded-lg p-1.5 transition ${
                theme === 'dark' ? 'text-[var(--accent-ink)]' : 'theme-text-dim hover:theme-text-main'
              }`}
              style={theme === 'dark' ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              <Moon className="h-4 w-4" />
            </button>
          </div>

          {/* Account */}
          <div
            className="flex items-center gap-2.5 rounded-xl border theme-border py-1.5 pl-1.5 pr-3"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg font-heading text-[13px] font-bold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {(user?.name || 'T').charAt(0).toUpperCase()}
            </span>
            <div className="hidden leading-tight sm:block">
              <div className="max-w-[110px] truncate text-[12.5px] font-semibold theme-text-main">
                {user?.name || 'Trader'}
              </div>
              <div className="text-[10px] theme-text-dim">Trader</div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
              className="ml-1 theme-text-dim transition hover:text-[var(--loss-red)]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default TopBar;
