import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { apiFetch } from '../services/api';
import { isSoundMuted, toggleSoundMute } from '../services/soundService';

import { StockDetailModal } from '../components/StockDetailModal';
import { NewsToast } from '../components/NewsToast';
import { OrderSuccessLayer } from '../components/OrderSuccessAnimation';
import { TradeFeedbackOverlay } from '../components/TradeFeedbackOverlay';

import { Sidebar, SECTIONS } from '../components/dashboard/Sidebar';
import { TopBar } from '../components/dashboard/TopBar';
import { MarketStrip } from '../components/dashboard/MarketStrip';
import { TickerTape } from '../components/dashboard/TickerTape';
import { MarketSection } from '../components/dashboard/MarketSection';
import { PortfolioSection } from '../components/dashboard/PortfolioSection';
import { OrdersSection } from '../components/dashboard/OrdersSection';
import { NewsSection } from '../components/dashboard/NewsSection';

const EMPTY_PORTFOLIO = {
  walletBalance: 0,
  availableWalletBalance: 0,
  lockedFunds: 0,
  totalHoldingsValue: 0,
  totalUnrealizedPL: 0,
  totalPortfolioValue: 0,
  holdings: [],
  transactions: [],
  pendingOrders: []
};

export function TraderDashboard() {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();

  const [section, setSection] = useState('MARKET');
  const [query, setQuery] = useState('');
  const [muted, setMuted] = useState(isSoundMuted());

  const [stocks, setStocks] = useState([]);
  const [stockFlashes, setStockFlashes] = useState({});
  const [portfolio, setPortfolio] = useState({
    ...EMPTY_PORTFOLIO,
    walletBalance: user?.walletBalance || 0,
    availableWalletBalance: user?.walletBalance || 0,
    totalPortfolioValue: user?.walletBalance || 0
  });

  const [newsFeed, setNewsFeed] = useState([]);
  const [readNewsCount, setReadNewsCount] = useState(0);
  const [activeNewsToast, setActiveNewsToast] = useState(null);

  const [selectedStock, setSelectedStock] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // Which side the trader asked for on the card, so the ticket opens on it.
  const [tradeSide, setTradeSide] = useState('BUY');
  // An executed fill and a plain notice are different things. Only a real fill
  // ever reaches the confirmation animation; booked limit orders, cancellations
  // and failures take the quiet path.
  const [orderFill, setOrderFill] = useState(null);
  const [notice, setNotice] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);

  const [session, setSession] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const flashTimers = useRef({});
  // Read inside callbacks that must not re-create themselves on every tick.
  const portfolioRef = useRef(portfolio);

  /* ---------------------------------------------------------------- *
   * Data
   * ---------------------------------------------------------------- */
  const fetchStocks = useCallback(async () => {
    try {
      const data = await apiFetch('/stocks');
      setStocks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch stocks error:', err);
    }
  }, []);

  const fetchPortfolio = useCallback(async () => {
    try {
      const data = await apiFetch('/portfolio');
      setPortfolio((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error('Fetch portfolio error:', err);
    }
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const data = await apiFetch('/news');
      setNewsFeed(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch news error:', err);
      setNewsFeed([]);
    }
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const data = await apiFetch('/session');
      setSession(data);
      // Prefer the server's countdown, but derive it from endTime when the
      // field is missing so the clock never renders NaN.
      const fromServer = Number(data?.remainingSeconds);
      if (Number.isFinite(fromServer)) {
        setRemainingSeconds(Math.max(0, fromServer));
      } else if (data?.endTime) {
        const diff = Math.floor((new Date(data.endTime).getTime() - Date.now()) / 1000);
        setRemainingSeconds(Number.isFinite(diff) ? Math.max(0, diff) : 0);
      } else {
        setRemainingSeconds(0);
      }
    } catch (err) {
      console.error('Fetch session error:', err);
      setRemainingSeconds(0);
    }
  }, []);

  useEffect(() => {
    fetchStocks();
    fetchPortfolio();
    fetchNews();
    fetchSession();
  }, [fetchStocks, fetchPortfolio, fetchNews, fetchSession]);

  // Local 1s tick, re-synced with the server every 20s
  useEffect(() => {
    const tick = setInterval(() => {
      setRemainingSeconds((prev) => (Number.isFinite(prev) && prev > 0 ? prev - 1 : 0));
    }, 1000);
    const sync = setInterval(fetchSession, 20000);
    return () => {
      clearInterval(tick);
      clearInterval(sync);
    };
  }, [fetchSession]);

  /* ---------------------------------------------------------------- *
   * Live socket feed
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (!socket) return undefined;

    const handleConnect = () => {
      fetchStocks();
      fetchPortfolio();
      fetchNews();
      fetchSession();
    };

    const handleStockUpdate = (diff) => {
      setStocks((prev) =>
        prev.map((s) => {
          if (s.id !== diff.stockId) return s;

          const direction =
            diff.newPrice > s.currentPrice ? 'up' : diff.newPrice < s.currentPrice ? 'down' : null;

          if (direction) {
            setStockFlashes((f) => ({ ...f, [diff.stockId]: direction }));
            clearTimeout(flashTimers.current[diff.stockId]);
            flashTimers.current[diff.stockId] = setTimeout(() => {
              setStockFlashes((f) => ({ ...f, [diff.stockId]: null }));
            }, 620);
          }

          return {
            ...s,
            currentPrice: diff.newPrice,
            percentChange: diff.percentChange,
            priceHistories: [
              ...(s.priceHistories || []),
              { price: diff.newPrice, volume: diff.volume, timestamp: diff.timestamp }
            ].slice(-240)
          };
        })
      );
    };

    const handleNews = (news) => {
      setActiveNewsToast(news);
      setNewsFeed((prev) => (Array.isArray(prev) ? [news, ...prev] : [news]));
    };

    const handlePortfolioUpdate = (updated) => setPortfolio((prev) => ({ ...prev, ...updated }));
    const handleOrderExecuted = () => fetchPortfolio();
    const handleSessionEvent = () => {
      fetchSession();
      fetchPortfolio();
    };

    socket.on('connect', handleConnect);
    socket.on('stock:update', handleStockUpdate);
    socket.on('news:broadcast', handleNews);
    socket.on('portfolio:update', handlePortfolioUpdate);
    socket.on('order:executed', handleOrderExecuted);
    socket.on('session:started', handleSessionEvent);
    socket.on('session:ended', handleSessionEvent);
    socket.on('session:liquidated', handleSessionEvent);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('stock:update', handleStockUpdate);
      socket.off('news:broadcast', handleNews);
      socket.off('portfolio:update', handlePortfolioUpdate);
      socket.off('order:executed', handleOrderExecuted);
      socket.off('session:started', handleSessionEvent);
      socket.off('session:ended', handleSessionEvent);
      socket.off('session:liquidated', handleSessionEvent);
    };
  }, [socket, fetchStocks, fetchPortfolio, fetchNews, fetchSession]);

  useEffect(() => {
    portfolioRef.current = portfolio;
  }, [portfolio]);

  // Drop pending flash timers on unmount
  useEffect(() => {
    const timers = flashTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  /* ---------------------------------------------------------------- *
   * Derived values
   * ---------------------------------------------------------------- */

  // The board summed against its session-open base. No longer charted or
  // labelled as an index — it only feeds the market-state read now.
  const index = useMemo(() => {
    const total = stocks.reduce((sum, s) => sum + (s.currentPrice || 0), 0);
    const base = stocks.reduce((sum, s) => sum + (s.basePrice || s.currentPrice || 0), 0);
    return {
      value: total,
      change: base > 0 ? ((total - base) / base) * 100 : 0,
      absolute: total - base
    };
  }, [stocks]);

  /**
   * Holdings re-priced from the live board.
   *
   * /portfolio returns a snapshot whose currentPrice freezes between refetches,
   * so spot price and P/L are recomputed here against the socket feed.
   */
  const livePortfolio = useMemo(() => {
    const bySymbol = {};
    stocks.forEach((s) => {
      bySymbol[s.symbol] = s;
    });

    const holdings = (portfolio.holdings || []).map((h) => {
      const live = bySymbol[h.symbol];
      const spot = live ? live.currentPrice : h.currentPrice || 0;
      const cost = (h.avgBuyPrice || 0) * (h.quantity || 0);
      const value = spot * (h.quantity || 0);
      return {
        ...h,
        sector: live?.sector || h.sector,
        currentPrice: spot,
        totalValue: value,
        unrealizedPL: value - cost,
        unrealizedPLPercent: cost > 0 ? ((value - cost) / cost) * 100 : 0
      };
    });

    const holdingsValue = holdings.reduce((sum, h) => sum + h.totalValue, 0);
    const unrealised = holdings.reduce((sum, h) => sum + h.unrealizedPL, 0);
    const wallet = portfolio.walletBalance || 0;

    return {
      ...portfolio,
      holdings,
      totalHoldingsValue: holdingsValue,
      totalUnrealizedPL: unrealised,
      totalPortfolioValue: wallet + holdingsValue
    };
  }, [portfolio, stocks]);

  const holdingsBySymbol = useMemo(() => {
    const map = {};
    (livePortfolio.holdings || []).forEach((h) => {
      map[h.symbol] = h;
    });
    return map;
  }, [livePortfolio.holdings]);

  // Trading is open only while a session is actively running — NOT_STARTED and
  // LIQUIDATING have to lock the desk too, not just ENDED.
  const locked = !session || session.status !== 'ACTIVE' || session.isTradingLocked === true;

  const badges = useMemo(
    () => ({
      ORDERS: (portfolio.pendingOrders || []).length,
      NEWS: Math.max(0, newsFeed.length - readNewsCount)
    }),
    [portfolio.pendingOrders, newsFeed.length, readNewsCount]
  );

  /* ---------------------------------------------------------------- *
   * Handlers
   * ---------------------------------------------------------------- */
  const handleTrade = useCallback((stock, side = 'BUY') => {
    setSelectedStock(stock);
    setTradeSide(side === 'SELL' ? 'SELL' : 'BUY');
    setIsDetailOpen(true);
  }, []);

  const handleTradeSuccess = useCallback(
    (message, updatedPortfolio, fill) => {
      const qtyOf = (book, symbol) =>
        (book?.holdings || []).find((h) => h.symbol === symbol)?.quantity ?? 0;

      // A fill carries a symbol, a quantity and a price. Anything without all
      // three — a booked limit order, a cancellation — is a notice, not a fill.
      const isFill = Boolean(fill?.symbol) && Number(fill?.quantity) > 0 && Number.isFinite(Number(fill?.price));

      if (isFill) {
        const before = portfolioRef.current || {};
        const after = updatedPortfolio ? { ...before, ...updatedPortfolio } : before;
        const price = Number(fill.price);
        const quantity = Number(fill.quantity);

        setOrderFill({
          // Unique per fill, so a second trade replaces the card rather than
          // stacking a duplicate on top of it.
          id: `${fill.symbol}-${Date.now()}`,
          type: fill.side === 'SELL' ? 'sell' : 'buy',
          symbol: fill.symbol,
          quantity,
          executionPrice: price,
          total: Math.round(quantity * price * 100) / 100,
          cashBefore: Number(before.walletBalance),
          cashAfter: Number(after.walletBalance),
          sharesBefore: qtyOf(before, fill.symbol),
          sharesAfter: qtyOf(after, fill.symbol)
        });
      } else if (message) {
        setNotice({ status: 'success', message });
      }

      if (updatedPortfolio) {
        setPortfolio((prev) => ({ ...prev, ...updatedPortfolio }));
      }
      // Always re-sync: the instant response omits transactions/pendingOrders
      fetchPortfolio();
    },
    [fetchPortfolio]
  );

  const handleCancelOrder = useCallback(
    async (orderId) => {
      setCancellingOrderId(orderId);
      try {
        const data = await apiFetch(`/orders/${orderId}`, { method: 'DELETE' });
        setNotice({ status: 'success', message: data.message || 'Order cancelled' });
        fetchPortfolio();
      } catch (err) {
        setNotice({ status: 'error', message: err.message || 'Could not cancel that order' });
      } finally {
        setCancellingOrderId(null);
      }
    },
    [fetchPortfolio]
  );

  const handleSectionChange = useCallback(
    (next) => {
      setSection(next);
      if (next === 'NEWS') setReadNewsCount(newsFeed.length);
    },
    [newsFeed.length]
  );

  const handleToggleSound = useCallback(() => setMuted(toggleSoundMute()), []);

  const liveSelectedStock = selectedStock
    ? stocks.find((s) => s.id === selectedStock.id) || selectedStock
    : null;

  const currentSection = SECTIONS.find((s) => s.id === section);

  return (
    <div className="min-h-screen theme-bg-main theme-text-main">
      <Sidebar active={section} onChange={handleSectionChange} badges={badges} isConnected={isConnected} />

      <div className="lg:pl-[232px]">
        <TopBar
          remainingSeconds={remainingSeconds}
          sessionStatus={session?.status}
          walletBalance={portfolio.availableWalletBalance ?? portfolio.walletBalance}
          query={query}
          onQueryChange={setQuery}
          muted={muted}
          onToggleSound={handleToggleSound}
          newsCount={badges.NEWS}
        />

        <MarketStrip stocks={stocks} />

        <TickerTape stocks={stocks} onSelect={handleTrade} />

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          {/* Portfolio renders its own header + range control, so the generic
              section heading would just repeat the word "Portfolio". */}
          {section !== 'PORTFOLIO' && (
          <div className="mb-4">
            <h1 className="font-heading text-[22px] font-bold tracking-tight theme-text-main">
              {section === 'MARKET' ? `Welcome back, ${(user?.name || 'trader').split(' ')[0]}` : currentSection?.label}
            </h1>
            <p className="mt-0.5 text-[13px] theme-text-muted">
              {section === 'MARKET' && 'Fifteen listings, one session, one shot at the top.'}
              {section === 'PORTFOLIO' && 'Everything you hold, priced off the live board.'}
              {section === 'ORDERS' && 'Working orders and every fill from this session.'}
              {section === 'NEWS' && 'The desk moves prices. Read it first.'}
            </p>
          </div>
          )}

          {locked && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 shrink-0 text-[#F59E0B]" />
                <span className="text-[12.5px] font-semibold text-[#F59E0B]">
                  {!session || session.status === 'NOT_STARTED'
                    ? 'Trading is locked — waiting for the admin to start the session.'
                    : session.status === 'LIQUIDATING'
                    ? 'Auto-liquidation sweep active — positions are converting to cash.'
                    : 'Trading session ended — final results are locked.'}
                </span>
              </div>
              <span className="shrink-0 rounded-lg bg-[#F59E0B]/20 px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#F59E0B]">
                {session?.status || 'Locked'}
              </span>
            </div>
          )}

          <div key={section} className="arena-fade">
            {section === 'MARKET' && (
              <MarketSection
                stocks={stocks}
                stockFlashes={stockFlashes}
                portfolio={livePortfolio}
                holdingsBySymbol={holdingsBySymbol}
                index={index}
                query={query}
                newsFeed={newsFeed}
                onTrade={handleTrade}
                onOpenNews={() => handleSectionChange('NEWS')}
                locked={locked}
                sessionStart={session?.startTime}
              />
            )}

            {section === 'PORTFOLIO' && (
              <PortfolioSection
                portfolio={livePortfolio}
                stocks={stocks}
                onTrade={handleTrade}
                locked={locked}
              />
            )}

            {section === 'ORDERS' && (
              <OrdersSection
                portfolio={livePortfolio}
                onCancelOrder={handleCancelOrder}
                cancellingId={cancellingOrderId}
                locked={locked}
              />
            )}

            {section === 'NEWS' && <NewsSection newsFeed={newsFeed} />}
          </div>
        </main>
      </div>

      {/* Overlays */}
      <StockDetailModal
        stock={liveSelectedStock}
        userWallet={portfolio.walletBalance}
        userHolding={liveSelectedStock ? holdingsBySymbol[liveSelectedStock.symbol] : null}
        isOpen={isDetailOpen}
        initialSide={tradeSide}
        sessionStart={session?.startTime}
        onClose={() => setIsDetailOpen(false)}
        onSuccess={handleTradeSuccess}
        isTradingLocked={locked}
      />

      <OrderSuccessLayer fill={orderFill} onComplete={() => setOrderFill(null)} />

      <TradeFeedbackOverlay
        status={notice?.status}
        message={notice?.message}
        onClose={() => setNotice(null)}
      />

      <NewsToast news={activeNewsToast} onClose={() => setActiveNewsToast(null)} />
    </div>
  );
}

export default TraderDashboard;
