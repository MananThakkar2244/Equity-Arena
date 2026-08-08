import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, ChevronDown, Coins, LayoutGrid, List, Newspaper, Trophy, Wallet } from 'lucide-react';
import { StatTile } from './StatTile';
import { TradingChart } from './TradingChart';
import { SECTOR_TINT } from './sectorTheme';
import { Bull360 } from './Bull360';
import { apiFetch } from '../../services/api';

// Windows are time-based; /stocks/:id/history carries the full session depth.
const TIMEFRAMES = [
  { id: 'M5', label: '5M', minutes: 5 },
  { id: 'M15', label: '15M', minutes: 15 },
  { id: 'H1', label: '1H', minutes: 60 },
  { id: 'ALL', label: 'All', minutes: Infinity }
];

// The board's own period selector. Separate from the chart's: this one drives
// every card's sparkline, move and volume together.
const CARD_WINDOWS = [
  { id: 'M5', label: '5M', minutes: 5 },
  { id: 'M15', label: '15M', minutes: 15 },
  { id: 'H1', label: '1H', minutes: 60 },
  { id: 'DAY', label: '1D', minutes: Infinity }
];

const TABS = [
  { id: 'ALL', label: 'All Stocks' },
  { id: 'GAINERS', label: 'Top Gainers' },
  { id: 'LOSERS', label: 'Top Losers' }
];

const MAX_POINTS = 2400;

/**
 * How often the stored sessions are re-pulled.
 *
 * /stocks only embeds the last 30 ticks and the market ticks every 6s, so the
 * live tail covers ~180s. Refreshing well inside that keeps the stored history
 * and the live tail overlapping — leave it longer and a hole opens between
 * them, which the sparkline would happily draw a straight line across.
 */
const DEEP_REFRESH_MS = 90_000;
const HERO_COUNT = 4; // large cards per mover row
const COMPACT_CAP = 7; // before the overflow tile appears

function SectorBadge({ sector, symbol, size = 40 }) {
  const tint = SECTOR_TINT[sector] || SECTOR_TINT.default;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-heading font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        backgroundColor: `${tint}22`,
        color: tint,
        boxShadow: `inset 0 0 0 1px ${tint}33`
      }}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Derived card figures — every number below comes from stored ticks.
 * ------------------------------------------------------------------ */

const compactNumber = (v) => {
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
};

/**
 * Collapse a stock's ticks down to the selected window.
 *
 * `1D` reports the backend's own session move rather than recomputing it, so a
 * card can never disagree with the price strip above it over the same period.
 */
function windowStats(rows, minutes, stock) {
  const clean = (rows || []).filter((r) => Number.isFinite(r?.price));
  const cutoff = minutes === Infinity ? 0 : Date.now() - minutes * 60000;
  const inWindow = minutes === Infinity ? clean : clean.filter((r) => new Date(r.timestamp).getTime() >= cutoff);

  // A quiet window can hold one tick or none; fall back to the recent tail so
  // the card still draws something truthful rather than collapsing to a dash.
  const use = inWindow.length >= 2 ? inWindow : clean.slice(-30);
  const prices = use.map((r) => r.price);

  const first = prices[0];
  const last = prices[prices.length - 1];
  const sessionChange = Number(stock?.percentChange) || 0;
  const change =
    minutes === Infinity || !Number.isFinite(first) || first === 0 || prices.length < 2
      ? sessionChange
      : ((last - first) / first) * 100;

  return {
    prices,
    change,
    volume: use.reduce((sum, r) => sum + (r.volume || 0), 0),
    low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null
  };
}

/* ------------------------------------------------------------------ *
 * Sparkline
 * ------------------------------------------------------------------ */

const SPARK_W = 100;

/**
 * Gradient area under a glowing line, the window's opening price as a dashed
 * baseline, and a live head marker at the latest tick. The head is HTML rather
 * than SVG so the non-uniform viewBox scale can't squash it into an ellipse.
 */
function Sparkline({ prices, positive, height = 38, bare = false }) {
  const geom = useMemo(() => {
    if (!prices || prices.length < 2) return null;
    const recent = prices.slice(-60);
    const min = Math.min(...recent);
    const max = Math.max(...recent);
    const range = max - min || Math.abs(min) * 0.001 || 1;
    const pad = bare ? 2 : 3;
    const y = (p) => height - pad - ((p - min) / range) * (height - pad * 2 - 1);
    const x = (i) => (i / (recent.length - 1)) * SPARK_W;

    const pts = recent.map((p, i) => `${x(i).toFixed(2)},${y(p).toFixed(2)}`);
    return {
      line: `M${pts.join(' L')}`,
      area: `M0,${height} L${pts.join(' L')} L${SPARK_W},${height} Z`,
      baseY: y(recent[0]),
      headTop: `${(y(recent[recent.length - 1]) / height) * 100}%`
    };
  }, [prices, height, bare]);

  if (!geom) return <div style={{ height }} className="flex-1" />;

  const colour = positive ? 'var(--gain-green)' : 'var(--loss-red)';
  const gid = positive ? 'spark-fill-up' : 'spark-fill-down';

  return (
    <div className="relative flex-1" style={{ height, color: colour }}>
      <svg
        viewBox={`0 0 ${SPARK_W} ${height}`}
        preserveAspectRatio="none"
        className="spark-svg h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.42" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>

        {!bare && (
          <line
            x1="0"
            y1={geom.baseY}
            x2={SPARK_W}
            y2={geom.baseY}
            stroke={colour}
            strokeOpacity="0.38"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <path className="spark-area" d={geom.area} fill={`url(#${gid})`} />
        <path
          className="spark-line"
          d={geom.line}
          fill="none"
          stroke="currentColor"
          strokeWidth={bare ? 1.5 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <span className="spark-head pointer-events-none" style={{ top: geom.headTop, left: '100%' }} />
    </div>
  );
}

/** Ambient motes drifting across a card, tinted by its direction. */
function CardMotes() {
  return (
    <span className="mkt-motes" aria-hidden="true">
      {[12, 28, 46, 63, 78, 91].map((left, i) => (
        <span key={left} className="mkt-mote" style={{ left: `${left}%`, animationDelay: `${i * 1.3}s` }} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

function ChangePill({ change, size = 'md' }) {
  const up = change >= 0;
  return (
    <span
      className={`mkt-pill ${up ? 'is-up' : 'is-down'} ${size === 'sm' ? 'mkt-pill-sm' : ''}`}
    >
      <span className="mkt-caret">{up ? '▲' : '▼'}</span>
      {Math.abs(change).toFixed(2)}%
    </span>
  );
}

function TradeButton({ onClick, locked, block = false }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={locked}
      className={`mkt-trade ${block ? 'mkt-trade-block' : ''}`}
    >
      {locked ? 'Locked' : 'Trade'}
    </button>
  );
}

/** The large hero tile used for the day's strongest movers. */
function StockCardLarge({ stock, stats, flash, onTrade, onFocus, holding, locked, isFocused }) {
  const up = stats.change >= 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onFocus(stock)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocus(stock))}
      title="Show on chart"
      className={`mkt-card ${up ? 'is-up' : 'is-down'} ${
        flash === 'up' ? 'mkt-flash-up' : flash === 'down' ? 'mkt-flash-down' : ''
      } ${isFocused ? 'is-focused' : ''}`}
    >
      <CardMotes />

      <div className="mkt-body">
        <div className="flex items-start gap-2.5">
          <SectorBadge sector={stock.sector} symbol={stock.symbol} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-heading text-[15px] font-bold tracking-tight theme-text-main">{stock.symbol}</span>
              {holding ? <span className="mkt-held">{holding.quantity}</span> : null}
            </div>
            <div className="truncate text-[11px] theme-text-dim">{stock.name}</div>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="font-heading text-[26px] font-bold leading-none tabular-nums theme-text-main">
            {(stock.currentPrice || 0).toFixed(2)}
          </span>
          <ChangePill change={stats.change} />
        </div>

        <div className="mt-2.5">
          <Sparkline prices={stats.prices} positive={up} height={40} />
        </div>

        <div className="mkt-foot">
          <span>
            Vol <b className="tabular-nums theme-text-muted">{compactNumber(stats.volume)}</b>
          </span>
          <span>
            Range{' '}
            <b className="tabular-nums theme-text-muted">
              {stats.low != null ? `${stats.low.toFixed(2)}–${stats.high.toFixed(2)}` : '—'}
            </b>
          </span>
        </div>

        <div className="mkt-action">
          <TradeButton onClick={() => onTrade(stock)} locked={locked} block />
        </div>
      </div>
    </div>
  );
}

/** The dense tile for everything outside the top movers. */
function StockCardCompact({ stock, stats, flash, onTrade, onFocus, holding, locked, isFocused }) {
  const up = stats.change >= 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onFocus(stock)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocus(stock))}
      title={`${stock.name} — show on chart`}
      className={`mkt-card mkt-card-sm ${up ? 'is-up' : 'is-down'} ${
        flash === 'up' ? 'mkt-flash-up' : flash === 'down' ? 'mkt-flash-down' : ''
      } ${isFocused ? 'is-focused' : ''}`}
    >
      <div className="mkt-body">
        <div className="flex items-center justify-between gap-1.5">
          <span className="font-heading text-[13px] font-bold tracking-tight theme-text-main">{stock.symbol}</span>
          {holding ? <span className="mkt-held">{holding.quantity}</span> : null}
        </div>

        <div className="mt-1 font-heading text-[18px] font-bold leading-none tabular-nums theme-text-main">
          {(stock.currentPrice || 0).toFixed(2)}
        </div>

        <div className="mt-1.5">
          <ChangePill change={stats.change} size="sm" />
        </div>

        <div className="mt-2">
          <Sparkline prices={stats.prices} positive={up} height={30} bare />
        </div>

        <div className="mkt-action">
          <TradeButton onClick={() => onTrade(stock)} locked={locked} block />
        </div>
      </div>
    </div>
  );
}

/** Dense table-style row for the list view. */
function StockRow({ stock, stats, flash, onTrade, onFocus, holding, locked, isFocused }) {
  const up = stats.change >= 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onFocus(stock)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocus(stock))}
      className={`mkt-row ${up ? 'is-up' : 'is-down'} ${
        flash === 'up' ? 'mkt-flash-up' : flash === 'down' ? 'mkt-flash-down' : ''
      } ${isFocused ? 'is-focused' : ''}`}
    >
      <SectorBadge sector={stock.sector} symbol={stock.symbol} size={32} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-heading text-[13.5px] font-bold theme-text-main">{stock.symbol}</span>
          {holding ? <span className="mkt-held">{holding.quantity}</span> : null}
        </div>
        <div className="truncate text-[11px] theme-text-dim">{stock.name}</div>
      </div>

      <div className="hidden w-[120px] shrink-0 md:block">
        <Sparkline prices={stats.prices} positive={up} height={28} bare />
      </div>

      <div className="hidden w-[92px] shrink-0 text-right font-mono text-[11px] theme-text-dim lg:block">
        Vol <b className="theme-text-muted">{compactNumber(stats.volume)}</b>
      </div>

      <div className="w-[86px] shrink-0 text-right font-heading text-[15px] font-bold tabular-nums theme-text-main">
        {(stock.currentPrice || 0).toFixed(2)}
      </div>

      <div className="w-[84px] shrink-0 text-right">
        <ChangePill change={stats.change} size="sm" />
      </div>

      <TradeButton onClick={() => onTrade(stock)} locked={locked} />
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/* ------------------------------------------------------------------ *
 * Section
 * ------------------------------------------------------------------ */

export function MarketSection({
  stocks,
  stockFlashes,
  portfolio,
  holdingsBySymbol,
  index,
  query,
  newsFeed = [],
  onTrade,
  onOpenNews,
  locked
}) {
  const [focus, setFocus] = useState('ARENA');
  const [timeframe, setTimeframe] = useState('M15');
  const [sessionBySymbol, setSessionBySymbol] = useState({});
  const [focusHistory, setFocusHistory] = useState([]);

  const [tab, setTab] = useState('ALL');
  const [cardWindow, setCardWindow] = useState('DAY');
  const [view, setView] = useState('grid');
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stocks;
    return stocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.sector || '').toLowerCase().includes(q)
    );
  }, [stocks, query]);

  const focused = focus === 'ARENA' ? null : stocks.find((s) => s.symbol === focus);
  const frame = TIMEFRAMES.find((t) => t.id === timeframe) || TIMEFRAMES[0];

  /**
   * Every listing's stored session, fetched once for the whole board. /stocks
   * only embeds the last 30 ticks per stock, which is too shallow to draw a
   * card's 1H window or to sum the composite index.
   */
  useEffect(() => {
    if (!stocks.length) return undefined;
    let cancelled = false;

    const pull = () =>
      Promise.all(
        stocks.map((s) =>
          apiFetch(`/stocks/${s.id}/history?range=ALL`)
            .then((rows) => [s.symbol, Array.isArray(rows) ? rows : rows?.history || []])
            .catch(() => [s.symbol, []])
        )
      )
        .then((pairs) => !cancelled && setSessionBySymbol(Object.fromEntries(pairs)))
        .catch(() => {});

    pull();
    const id = setInterval(pull, DEEP_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // Keyed on the listing set, not on focus: re-pulling fifteen sessions every
    // time somebody picks a different instrument is pure waste. Stock ids are
    // fixed for a session, so the captured list stays valid between refreshes.
  }, [stocks.length]);

  /** The focused instrument gets its own pull so the big chart stays deep. */
  useEffect(() => {
    if (!focused?.id) {
      setFocusHistory([]);
      return undefined;
    }
    let cancelled = false;
    apiFetch(`/stocks/${focused.id}/history?range=ALL`)
      .then((rows) => !cancelled && setFocusHistory(Array.isArray(rows) ? rows : rows?.history || []))
      .catch(() => !cancelled && setFocusHistory([]));
    return () => {
      cancelled = true;
    };
  }, [focused?.id]);

  /** Stored session with any fresher live ticks appended. */
  const seriesFor = useCallback(
    (stock) => {
      const stored = sessionBySymbol[stock.symbol] || [];
      const live = stock.priceHistories || [];
      if (!stored.length) return live;
      const lastTs = new Date(stored[stored.length - 1].timestamp).getTime();
      return [...stored, ...live.filter((h) => new Date(h.timestamp).getTime() > lastTs)];
    },
    [sessionBySymbol]
  );

  /** The composite index, summed tick-for-tick across every listing. */
  const indexSeries = useMemo(() => {
    const usable = stocks.map((s) => sessionBySymbol[s.symbol]).filter((rows) => rows?.length);
    if (!usable.length) return [];
    // Align from the newest tick backwards so every stock contributes the same
    // number of samples to each index point.
    const depth = Math.min(...usable.map((rows) => rows.length), 1400);
    return Array.from({ length: depth }, (_, i) => {
      let price = 0;
      let volume = 0;
      let timestamp = null;
      for (const rows of usable) {
        const row = rows[rows.length - depth + i];
        price += row?.price || 0;
        volume += row?.volume || 0;
        if (!timestamp) timestamp = row?.timestamp;
      }
      return { price, volume, timestamp };
    });
  }, [stocks, sessionBySymbol]);

  /** Ticks feeding the big chart, cut to the selected window. */
  const chartTicks = useMemo(() => {
    let base;

    if (focused) {
      const stored = focusHistory.length ? focusHistory : focused.priceHistories || [];
      const lastTs = stored.length ? new Date(stored[stored.length - 1].timestamp).getTime() : 0;
      const live = (focused.priceHistories || []).filter((h) => new Date(h.timestamp).getTime() > lastTs);
      base = [...stored, ...live];
    } else if (indexSeries.length) {
      base = indexSeries;
    } else {
      const withHistory = stocks.filter((s) => (s.priceHistories || []).length);
      if (!withHistory.length) return [];
      const depth = Math.min(...withHistory.map((s) => s.priceHistories.length));
      base = Array.from({ length: depth }, (_, i) => {
        const slice = withHistory.map((s) => s.priceHistories[s.priceHistories.length - depth + i]);
        return {
          price: slice.reduce((sum, h) => sum + (h?.price || 0), 0),
          volume: slice.reduce((sum, h) => sum + (h?.volume || 0), 0),
          timestamp: slice[0]?.timestamp
        };
      });
    }

    const windowed =
      frame.minutes === Infinity
        ? base
        : base.filter((t) => Date.now() - new Date(t.timestamp).getTime() <= frame.minutes * 60000);

    const chosen = windowed.length >= 8 ? windowed : base.slice(-120);
    return chosen.length > MAX_POINTS ? chosen.slice(-MAX_POINTS) : chosen;
  }, [focused, focusHistory, indexSeries, stocks, frame.minutes]);

  /* ---- Board figures ---- */
  const windowMinutes = (CARD_WINDOWS.find((w) => w.id === cardWindow) || CARD_WINDOWS[3]).minutes;

  const statsBySymbol = useMemo(() => {
    const map = {};
    stocks.forEach((s) => {
      map[s.symbol] = windowStats(seriesFor(s), windowMinutes, s);
    });
    return map;
  }, [stocks, seriesFor, windowMinutes]);

  const statOf = useCallback(
    (s) => statsBySymbol[s.symbol] || { prices: [], change: 0, volume: 0, low: null, high: null },
    [statsBySymbol]
  );

  const { gainers, losers } = useMemo(() => {
    const up = [];
    const down = [];
    filtered.forEach((s) => (statOf(s).change >= 0 ? up : down).push(s));
    up.sort((a, b) => statOf(b).change - statOf(a).change);
    down.sort((a, b) => statOf(a).change - statOf(b).change);
    return { gainers: up, losers: down };
  }, [filtered, statOf]);

  /**
   * The board reads as a heat map: the day's strongest movers get hero tiles,
   * everything else is dense. Below nine listings that tiering has nothing to
   * say, so every card stays large.
   */
  const groups = useMemo(() => {
    if (tab === 'GAINERS') return { hero: [gainers].filter((g) => g.length), compact: [] };
    if (tab === 'LOSERS') return { hero: [losers].filter((g) => g.length), compact: [] };
    if (filtered.length <= HERO_COUNT * 2) return { hero: [filtered], compact: [] };

    const topUp = gainers.slice(0, HERO_COUNT);
    const topDown = losers.slice(0, HERO_COUNT);
    const shown = new Set([...topUp, ...topDown].map((s) => s.symbol));
    const rest = filtered
      .filter((s) => !shown.has(s.symbol))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    return { hero: [topUp, topDown].filter((g) => g.length), compact: rest };
  }, [tab, filtered, gainers, losers]);

  const compactShown = expanded ? groups.compact : groups.compact.slice(0, COMPACT_CAP);
  const overflow = groups.compact.length - compactShown.length;

  // No `key` in here — React 18.3 warns when a key is delivered via spread.
  const cardProps = (s) => ({
    stock: s,
    stats: statOf(s),
    flash: stockFlashes[s.id],
    onTrade,
    onFocus: (stock) => setFocus(stock.symbol),
    holding: holdingsBySymbol[s.symbol],
    locked,
    isFocused: focus === s.symbol
  });

  const chartPositive = focused ? (focused.percentChange || 0) >= 0 : (index.change || 0) >= 0;
  const headlinePrice = focused ? focused.currentPrice || 0 : index.value || 0;
  const headlineChange = focused ? focused.percentChange || 0 : index.change || 0;

  const netWorth = portfolio.totalPortfolioValue || 0;
  const holdingsValue = portfolio.totalHoldingsValue || 0;
  const unrealised = portfolio.totalUnrealizedPL || 0;
  const cost = holdingsValue - unrealised;
  const unrealisedPct = cost > 0 ? (unrealised / cost) * 100 : 0;
  const sectorCount = new Set((portfolio.holdings || []).map((h) => h.sector)).size;

  const wire = (Array.isArray(newsFeed) ? newsFeed : []).slice(0, 5);

  return (
    <div className="space-y-5">
      {/* ---- Hero ---- */}
      <div
        className="arena-rise relative overflow-hidden rounded-[var(--arena-radius)] border theme-border"
        style={{
          background:
            'linear-gradient(105deg, var(--bg-card) 0%, var(--bg-card) 46%, color-mix(in srgb, var(--accent) 16%, var(--bg-card)) 100%)'
        }}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-ring)] bg-[var(--accent-soft)] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
              <span className="arena-pulse h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Live exchange
            </div>
            <h2 className="font-heading mt-2.5 text-[24px] font-bold leading-tight tracking-tight theme-text-main">
              The floor is open. Take your shot.
            </h2>
            <p className="mt-1 max-w-[46ch] text-[13px] theme-text-muted">
              Fifteen listings across fifteen sectors, priced tick by tick. News breaks, prices move — read it
              first and the board is yours.
            </p>
          </div>

          <Bull360 className="hidden shrink-0 md:block" width={280} height={200} />
        </div>
      </div>

      {/* ---- KPI row ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Net worth"
          value={netWorth}
          suffix=" IC"
          icon={Coins}
          tone="gold"
          hint="Wallet + holdings"
          series={chartTicks.slice(-20).map((t) => t.price)}
        />
        <StatTile
          label="Unrealised P/L"
          value={unrealised}
          suffix=" IC"
          icon={Activity}
          tone={unrealised >= 0 ? 'gain' : 'loss'}
          delta={unrealisedPct}
          deltaLabel="on open positions"
          style={{ animationDelay: '60ms' }}
        />
        <StatTile
          label="Holdings"
          value={portfolio.holdings?.length || 0}
          decimals={0}
          icon={Wallet}
          tone="neutral"
          hint={sectorCount === 1 ? '1 sector' : `${sectorCount} sectors`}
          style={{ animationDelay: '120ms' }}
        />
        <StatTile
          label="Buying power"
          value={portfolio.availableWalletBalance ?? portfolio.walletBalance ?? 0}
          suffix=" IC"
          icon={Trophy}
          tone="gold"
          hint={portfolio.lockedFunds ? `${portfolio.lockedFunds.toFixed(2)} IC locked` : 'Ready to invest'}
          style={{ animationDelay: '180ms' }}
        />
      </div>

      {/* ---- Chart + wire ---- */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <div className="arena-card arena-rise min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {focused && <SectorBadge sector={focused.sector} symbol={focused.symbol} size={32} />}
                <select
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  aria-label="Choose instrument"
                  className="max-w-[280px] rounded-lg border theme-border bg-[var(--bg-input)] px-2 py-1 text-[13px] font-semibold theme-text-main outline-none focus:border-[var(--accent-ring)]"
                >
                  <option value="ARENA">ARENA 15 — Composite index</option>
                  {stocks.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.symbol} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="font-heading text-[32px] font-bold leading-none tabular-nums theme-text-main">
                  {headlinePrice.toFixed(2)}
                </span>
                <span className="text-[13px] font-medium theme-text-dim">IC</span>
                <span
                  className={`font-mono text-[13px] font-semibold ${
                    chartPositive ? 'text-[var(--gain-green)]' : 'text-[var(--loss-red)]'
                  }`}
                >
                  {chartPositive ? '+' : ''}{headlineChange.toFixed(2)}%
                </span>
              </div>
              <div className="mt-0.5 text-[11.5px] theme-text-dim">since session open</div>
            </div>

            <div className="flex gap-1 rounded-xl border theme-border p-1" style={{ backgroundColor: 'var(--bg-input)' }}>
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeframe(t.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition ${
                    timeframe === t.id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'theme-text-muted hover:theme-text-main'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <TradingChart ticks={chartTicks} symbol={focused ? focused.symbol : 'ARENA 15'} height={420} />
        </div>

        {/* Market wire */}
        <div className="arena-card arena-rise p-5" style={{ animationDelay: '80ms' }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="font-heading text-[14px] font-bold theme-text-main">Market news</h3>
            </div>
            <button
              type="button"
              onClick={onOpenNews}
              className="flex items-center gap-1 text-[11.5px] font-semibold text-[var(--accent)] transition hover:brightness-110"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {wire.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] theme-text-dim">
              Nothing on the wire yet. When the desk breaks a story, prices move within seconds.
            </p>
          ) : (
            <div className="space-y-3">
              {wire.map((n, i) => (
                <div key={n.id || i} className={i === 0 ? '' : 'border-t theme-border pt-3'}>
                  {i === 0 && (
                    <span className="mb-1.5 inline-block rounded-full bg-[var(--loss-red)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white">
                      Breaking
                    </span>
                  )}
                  <p className="text-[13px] font-semibold leading-snug theme-text-main">
                    {n.message || n.headline || n.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] theme-text-dim">
                    <span>{timeAgo(n.timestamp || n.createdAt)}</span>
                    {n.stockSymbol && <span>· {n.stockSymbol}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- The board ---- */}
      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-[17px] font-bold theme-text-main">
              The floor
              <span className="ml-2 font-mono text-[12px] font-normal theme-text-dim">
                {filtered.length} of {stocks.length}
              </span>
            </h2>
            <p className="mt-0.5 text-[12px] theme-text-dim">Live overview of all listed stocks</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {locked && (
              <span className="rounded-lg bg-[var(--loss-red)]/10 px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[var(--loss-red)]">
                Trading locked
              </span>
            )}

            <div className="mkt-seg">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  className={tab === t.id ? 'is-on' : ''}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mkt-select">
              <select
                value={cardWindow}
                onChange={(e) => setCardWindow(e.target.value)}
                aria-label="Card period"
              >
                {CARD_WINDOWS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="mkt-select-caret h-3.5 w-3.5" aria-hidden="true" />
            </div>

            <div className="mkt-seg mkt-seg-icon">
              <button
                type="button"
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
                aria-label="List view"
                className={view === 'list' ? 'is-on' : ''}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
                aria-label="Grid view"
                className={view === 'grid' ? 'is-on' : ''}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="arena-card flex flex-col items-center justify-center p-10 text-center">
            <p className="font-heading text-[15px] font-bold theme-text-main">Nothing matches that</p>
            <p className="mt-1 text-[13px] theme-text-dim">Try a symbol like NITI, or a sector like Telecom.</p>
          </div>
        ) : view === 'list' ? (
          <div className="space-y-2">
            {[...groups.hero.flat(), ...groups.compact].map((s) => (
              <StockRow key={s.id || s.symbol} {...cardProps(s)} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {groups.hero.map((row, i) => (
              <div key={i} className="mkt-grid">
                {row.map((s) => (
                  <StockCardLarge key={s.id || s.symbol} {...cardProps(s)} />
                ))}
              </div>
            ))}

            {compactShown.length > 0 && (
              <div className="mkt-grid mkt-grid-sm">
                {compactShown.map((s) => (
                  <StockCardCompact key={s.id || s.symbol} {...cardProps(s)} />
                ))}

                {overflow > 0 && (
                  <button type="button" onClick={() => setExpanded(true)} className="mkt-more">
                    <span className="font-heading text-[14px] font-bold theme-text-main">+{overflow} More</span>
                    <span className="text-[11px] theme-text-dim">View all</span>
                    <span className="mkt-more-bars" aria-hidden="true">
                      {[40, 66, 48, 82, 58, 92].map((h, i) => (
                        <span key={i} style={{ height: `${h}%` }} />
                      ))}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MarketSection;
