import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { AnimatedNumber } from './AnimatedNumber';
import { DetailChart } from './dashboard/DetailChart';
import { motion } from 'framer-motion';
import {
  X, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown,
  ShoppingBag, AlertTriangle, BarChart2, Activity, Zap, Clock, Ban
} from 'lucide-react';

/**
 * Chart windows, sized for a three-hour session. ALL means this session and
 * nothing before it — never a previous game's ticks.
 */
const FRAMES = [
  { id: 'M5', label: '5M', minutes: 5 },
  { id: 'M15', label: '15M', minutes: 15 },
  { id: 'M30', label: '30M', minutes: 30 },
  { id: 'H1', label: '1H', minutes: 60 },
  { id: 'ALL', label: 'ALL', minutes: Infinity }
];

const HISTORY_REFRESH_MS = 90_000;

const compactVolume = (v) => {
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};

export function StockDetailModal({ stock, userWallet, userHolding, isOpen, initialSide = 'BUY', sessionStart, onClose, onSuccess, isTradingLocked }) {
  const { socket } = useSocket();
  const [tradeCategory, setTradeCategory] = useState('INSTANT'); // 'INSTANT' or 'LIMIT'
  const [mode, setMode] = useState(initialSide === 'SELL' ? 'SELL' : 'BUY'); // 'BUY' or 'SELL'
  const [quantity, setQuantity] = useState(1);
  const [targetPrice, setTargetPrice] = useState(stock ? stock.currentPrice.toFixed(2) : '10.00');
  const [timeframe, setTimeframe] = useState('M15');
  const [historyData, setHistoryData] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [balanceInfo, setBalanceInfo] = useState({ availableWalletBalance: userWallet, lockedFunds: 0 });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingTrade, setLoadingTrade] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [error, setError] = useState('');

  // Sync balanceInfo whenever userWallet prop updates
  useEffect(() => {
    if (userWallet !== undefined) {
      setBalanceInfo((prev) => ({
        ...prev,
        availableWalletBalance: userWallet
      }));
    }
  }, [userWallet]);

  // Real-time socket listener for portfolio & order updates inside modal
  useEffect(() => {
    if (!socket) return;
    const handlePortfolioUpdate = (updatedPortfolio) => {
      if (updatedPortfolio.availableWalletBalance !== undefined) {
        setBalanceInfo({
          availableWalletBalance: updatedPortfolio.availableWalletBalance,
          lockedFunds: updatedPortfolio.lockedFunds || 0
        });
      }
      if (updatedPortfolio.pendingOrders) {
        setPendingOrders(updatedPortfolio.pendingOrders);
      }
    };
    socket.on('portfolio:update', handlePortfolioUpdate);
    return () => {
      socket.off('portfolio:update', handlePortfolioUpdate);
    };
  }, [socket]);

  /**
   * The full stored series, pulled once.
   *
   * Switching window used to round-trip to the server, which made every tab a
   * loading spinner and let the chart disagree with the price above it while
   * the request was in flight. The session is small enough to hold in memory,
   * so the windows below are cut from it locally and switch instantly.
   */
  const fetchStockHistory = useCallback(async (stockId) => {
    setLoadingHistory(true);
    try {
      const history = await apiFetch(`/stocks/${stockId}/history?range=ALL`);
      setHistoryData(Array.isArray(history) ? history : history?.history || []);
    } catch (err) {
      console.error('Failed to fetch stock detail history:', err);
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await apiFetch('/orders');
      setPendingOrders(data.pendingOrders || []);
      if (data.availableBalance !== undefined) {
        setBalanceInfo({
          availableWalletBalance: data.availableBalance,
          lockedFunds: data.lockedFunds
        });
      }
    } catch (err) {
      console.error('Failed to fetch pending orders:', err);
    }
  }, []);

  // Form initialization: ONLY runs when modal opens or stock ID changes (NOT on price ticks!)
  useEffect(() => {
    if (stock && isOpen) {
      setQuantity(1);
      setTargetPrice(stock.currentPrice.toFixed(2));
      setError('');
      // Honour the side picked on the card. Re-applied on every open so the
      // ticket never reopens on whichever side was used last time.
      setMode(initialSide === 'SELL' ? 'SELL' : 'BUY');
    }
  }, [stock?.id, isOpen, initialSide]);

  // History & Orders fetch. Kept off `timeframe` — windows are cut locally.
  useEffect(() => {
    if (!stock?.id || !isOpen) return undefined;
    fetchStockHistory(stock.id);
    fetchOrders();
    // The socket tail only reaches back so far, so the stored series is topped
    // up well inside that overlap; leave it longer and a hole opens between the
    // two that the line would happily be drawn straight across.
    const id = setInterval(() => fetchStockHistory(stock.id), HISTORY_REFRESH_MS);
    return () => clearInterval(id);
  }, [stock?.id, isOpen, fetchStockHistory, fetchOrders]);

  const sessionStartMs = useMemo(() => {
    const t = sessionStart ? new Date(sessionStart).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  }, [sessionStart]);

  /**
   * Stored series plus whatever the socket has delivered since, cut to this
   * session. Merging the live tail is what keeps the last point on the chart
   * equal to the spot price in the header — they are the same number.
   */
  const sessionTicks = useMemo(() => {
    const stored = historyData || [];
    const live = stock?.priceHistories || [];
    const lastStored = stored.length ? new Date(stored[stored.length - 1].timestamp).getTime() : 0;
    const merged = [
      ...stored,
      ...live.filter((h) => new Date(h.timestamp).getTime() > lastStored)
    ].filter((h) => Number.isFinite(h?.price) && h?.timestamp);

    if (sessionStartMs === null) return merged;
    const cut = merged.filter((h) => new Date(h.timestamp).getTime() >= sessionStartMs);
    return cut.length ? cut : merged.slice(-1);
  }, [historyData, stock?.priceHistories, sessionStartMs]);

  const frame = FRAMES.find((f) => f.id === timeframe) || FRAMES[1];

  const windowTicks = useMemo(() => {
    if (frame.minutes === Infinity) return sessionTicks;
    const cutoff = Date.now() - frame.minutes * 60000;
    const inWindow = sessionTicks.filter((h) => new Date(h.timestamp).getTime() >= cutoff);
    // Early in a session a short window can be empty; showing the session so
    // far beats showing an empty box.
    return inWindow.length >= 2 ? inWindow : sessionTicks;
  }, [sessionTicks, frame.minutes]);

  /** Every figure beside the chart is measured over exactly what is drawn. */
  const windowFigures = useMemo(() => {
    const prices = windowTicks.map((t) => t.price).filter(Number.isFinite);
    if (!prices.length) return null;
    let high = -Infinity;
    let low = Infinity;
    for (const p of prices) {
      if (p > high) high = p;
      if (p < low) low = p;
    }
    const open = prices[0];
    const close = prices[prices.length - 1];
    let sma = null;
    if (prices.length >= 10) {
      let sum = 0;
      for (let i = prices.length - 10; i < prices.length; i++) sum += prices[i];
      sma = sum / 10;
    }
    return {
      high,
      low,
      open,
      close,
      sma,
      volume: windowTicks.reduce((sum, t) => sum + (t.volume || 0), 0),
      change: open ? ((close - open) / open) * 100 : 0,
      count: prices.length
    };
  }, [windowTicks]);

  if (!isOpen || !stock) return null;

  const currentPrice = stock.currentPrice;
  const isPositive = stock.percentChange >= 0;
  const parsedQty = Math.max(1, parseInt(quantity, 10) || 1);
  const parsedTargetPrice = Math.max(0.01, parseFloat(targetPrice) || currentPrice);
  
  const instantTotal = Math.round(parsedQty * currentPrice * 100) / 100;
  const limitTotal = Math.round(parsedQty * parsedTargetPrice * 100) / 100;

  // Everything quoted beside the chart comes from the window on screen. The
  // old figures were labelled '24h' on a three-hour game and fell back to a
  // hard-coded 10,000 volume whenever a tick carried none — a number no trade
  // ever produced.
  const windowHigh = windowFigures ? windowFigures.high : currentPrice;
  const windowLow = windowFigures ? windowFigures.low : currentPrice;
  const windowVolume = windowFigures ? windowFigures.volume : 0;
  const windowChange = windowFigures ? windowFigures.change : 0;
  const latestSMA = windowFigures && windowFigures.sma != null ? windowFigures.sma : null;

  const ownedQty = userHolding ? userHolding.quantity : 0;
  const availableQty = userHolding && userHolding.availableQuantity !== undefined
    ? userHolding.availableQuantity
    : ownedQty;
  const lockedQty = userHolding && userHolding.lockedQuantity !== undefined
    ? userHolding.lockedQuantity
    : 0;

  const availWallet = balanceInfo.availableWalletBalance !== undefined
    ? balanceInfo.availableWalletBalance
    : userWallet;

  const canInstantBuy = availWallet >= instantTotal;
  const canInstantSell = availableQty >= parsedQty;

  const canLimitBuy = availWallet >= limitTotal;
  const canLimitSell = availableQty >= parsedQty;

  const stockPendingOrders = pendingOrders.filter((o) => o.stockId === stock.id);

  const handleTradeSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoadingTrade(true);

    try {
      if (tradeCategory === 'INSTANT') {
        const endpoint = mode === 'BUY' ? '/trade/buy' : '/trade/sell';
        const data = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            stockId: stock.id,
            quantity: parsedQty
          })
        });

        if (onSuccess) {
          /*
           * Third arg carries the fill so the dashboard can confirm it.
           *
           * The price comes from the transaction the server wrote, not from the
           * price this component last rendered — a tick can land between the
           * two, and 'Filled @' has to be the price the trade actually got.
           */
          const filled = data.transaction || {};
          onSuccess(data.message, data.portfolio, {
            side: mode,
            stockId: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            quantity: Number(data.trade?.quantity ?? filled.quantity) || parsedQty,
            price: Number.isFinite(Number(data.trade?.price ?? filled.price))
              ? Number(data.trade?.price ?? filled.price)
              : stock.currentPrice,
            walletBalance: Number.isFinite(Number(data.trade?.walletBalance))
              ? Number(data.trade.walletBalance)
              : undefined,
            holdingId: data.trade?.holdingId || null,
            holdingQuantity: Number.isFinite(Number(data.trade?.holdingQuantity))
              ? Number(data.trade.holdingQuantity)
              : undefined,
            avgBuyPrice: Number.isFinite(Number(data.trade?.avgBuyPrice))
              ? Number(data.trade.avgBuyPrice)
              : undefined,
            transaction: data.transaction || null
          });
        }
        fetchOrders();
        onClose();
      } else {
        const data = await apiFetch('/orders', {
          method: 'POST',
          body: JSON.stringify({
            stockId: stock.id,
            type: mode,
            targetPrice: parsedTargetPrice,
            quantity: parsedQty
          })
        });

        if (onSuccess) {
          onSuccess(data.message);
        }
        fetchOrders();
      }
    } catch (err) {
      setError(err.message || 'Order placement failed');
    } finally {
      setLoadingTrade(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    setCancellingOrderId(orderId);
    try {
      const data = await apiFetch(`/orders/${orderId}`, {
        method: 'DELETE'
      });
      if (onSuccess) {
        onSuccess(data.message);
      }
      fetchOrders();
    } catch (err) {
      setError(err.message || 'Failed to cancel limit order');
    } finally {
      setCancellingOrderId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-6xl max-h-[92vh] theme-bg-card rounded-[10px] border theme-border shadow-2xl relative flex flex-col overflow-hidden transition-colors sdm-shell">

        {/* Header */}
        <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b theme-border px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 sm:block">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-bold theme-text-main font-mono">{stock.symbol}</span>
                <span className="px-2 py-0.5 rounded-[3px] text-xs font-bold theme-bg-panel theme-text-muted border theme-border font-mono">
                  {stock.sector}
                </span>
              </div>
              <h2 className="text-xs font-bold theme-text-muted mt-0.5">{stock.name}</h2>
            </div>

            <button
              onClick={onClose}
              className="sm:hidden flex-shrink-0 p-2 rounded-[4px] border theme-border theme-bg-panel theme-text-muted hover:theme-text-main transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center btn-terminal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-3">
              <div>
                <div className="text-[10px] uppercase font-mono font-bold theme-text-dim">Spot Price</div>
                <div className="text-3xl font-extrabold font-mono theme-text-main">
                  <AnimatedNumber value={currentPrice} decimals={2} suffix=" IC" className={isPositive ? 'text-[#1DB954]' : 'text-[#E8453C]'} />
                </div>
              </div>

              <div className={`px-2.5 py-1 rounded-[3px] text-xs font-bold font-mono border flex items-center gap-1 ${
                isPositive
                  ? 'bg-[#1DB954]/10 text-[#1DB954] border-[#1DB954]/30'
                  : 'bg-[#E8453C]/10 text-[#E8453C] border-[#E8453C]/30'
              }`}>
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>{isPositive ? '+' : ''}{stock.percentChange.toFixed(2)}%</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="hidden sm:inline-flex flex-shrink-0 p-2 rounded-[4px] border theme-border theme-bg-panel theme-text-muted hover:theme-text-main transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center btn-terminal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body — chart on the left, ticket on the right. */}
        <div className="overflow-y-auto px-5 py-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">

        {/* ---- Left: price action ---- */}
        <div className="space-y-4">

        <div className="theme-bg-panel rounded-[8px] border theme-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 font-mono text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: isPositive ? '#1DB954' : '#E8453C' }} />
                <span className="font-semibold theme-text-main">Spot Price</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="18" height="4" aria-hidden="true">
                  <line x1="0" y1="2" x2="18" y2="2" stroke="#D4A017" strokeWidth="1.6" strokeDasharray="5 4" />
                </svg>
                <span className="font-semibold text-[#D4A017]">SMA-10</span>
              </span>
            </div>

            <div className="flex self-start rounded-[6px] border theme-border theme-bg-card p-1 sm:self-auto">
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTimeframe(f.id)}
                  className={`min-h-[30px] rounded-[4px] px-3 py-1 font-mono text-[11px] font-bold transition-all ${
                    timeframe === f.id
                      ? 'bg-[#D4A017] text-slate-950 shadow-sm'
                      : 'theme-text-muted hover:theme-text-main'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            {loadingHistory && !windowFigures ? (
              <div className="flex h-[248px] items-center justify-center rounded-[6px] border theme-border theme-bg-card">
                <span className="font-mono text-[11px] theme-text-dim">Loading the tape…</span>
              </div>
            ) : (
              <DetailChart
                ticks={windowTicks}
                height={248}
                showSMA
                accent={isPositive ? '#1DB954' : '#E8453C'}
              />
            )}
          </div>

          <div className="mt-2 flex items-center justify-between font-mono text-[10px] theme-text-dim">
            <span>{windowFigures ? `${windowFigures.count} prints in view` : 'No prints in view'}</span>
            <span>
              Window move{' '}
              <b className={windowChange >= 0 ? 'text-[#1DB954]' : 'text-[#E8453C]'}>
                {windowChange >= 0 ? '+' : ''}{windowChange.toFixed(2)}%
              </b>
            </span>
          </div>
        </div>

        {/* Figures, all measured over exactly the window drawn above */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sdm-stat">
            <div className="sdm-stat-label">
              <TrendingUp className="h-3 w-3 text-[#1DB954]" />
              <span>{frame.label} High</span>
            </div>
            <div className="sdm-stat-value text-[#1DB954]">{windowHigh.toFixed(2)} IC</div>
          </div>
          <div className="sdm-stat">
            <div className="sdm-stat-label">
              <TrendingDown className="h-3 w-3 text-[#E8453C]" />
              <span>{frame.label} Low</span>
            </div>
            <div className="sdm-stat-value text-[#E8453C]">{windowLow.toFixed(2)} IC</div>
          </div>
          <div className="sdm-stat">
            <div className="sdm-stat-label">
              <Activity className="h-3 w-3 text-[#D4A017]" />
              <span>SMA-10</span>
            </div>
            <div className="sdm-stat-value text-[#D4A017]">
              {latestSMA != null ? `${latestSMA.toFixed(2)} IC` : '—'}
            </div>
          </div>
          <div className="sdm-stat">
            <div className="sdm-stat-label">
              <BarChart2 className="h-3 w-3 text-indigo-400" />
              <span>{frame.label} Volume</span>
            </div>
            <div className="sdm-stat-value text-indigo-300">{compactVolume(windowVolume)} shrs</div>
          </div>
        </div>

        </div>

        {/* ---- Right: the ticket ---- */}
        <div className="space-y-4">

        {/* Trade Order Panel */}
        <div className="theme-bg-panel p-5 rounded-[6px] border theme-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex theme-bg-card p-1 rounded-[4px] border theme-border">
              <button
                type="button"
                onClick={() => setTradeCategory('INSTANT')}
                className={`px-4 py-1.5 text-xs font-bold font-heading rounded-[3px] flex items-center gap-1.5 transition-all min-h-[34px] ${
                  tradeCategory === 'INSTANT'
                    ? 'bg-[#D4A017] text-slate-950 shadow-sm'
                    : 'theme-text-muted hover:theme-text-main'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Instant Trade
              </button>
              <button
                type="button"
                onClick={() => setTradeCategory('LIMIT')}
                className={`px-4 py-1.5 text-xs font-bold font-heading rounded-[3px] flex items-center gap-1.5 transition-all min-h-[34px] ${
                  tradeCategory === 'LIMIT'
                    ? 'bg-[#D4A017] text-slate-950 shadow-sm'
                    : 'theme-text-muted hover:theme-text-main'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Limit Order (Pre-Book)
              </button>
            </div>

            {userHolding && (
              <div className="text-right text-xs font-mono">
                <span className="text-[#1DB954] font-bold block">
                  Owned: {ownedQty} shares (Avg: {userHolding.avgBuyPrice.toFixed(2)} IC)
                </span>
                {lockedQty > 0 && (
                  <span className="text-[#D4A017] text-[10px] block">
                    Available: {availableQty} | Locked in orders: {lockedQty}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* BUY / SELL Toggle Buttons */}
          <div className="flex theme-bg-card p-1 rounded-[4px] border theme-border">
            <button
              type="button"
              onClick={() => setMode('BUY')}
              className={`flex-1 py-2 text-xs font-bold font-heading rounded-[3px] flex items-center justify-center gap-1.5 transition-all min-h-[40px] ${
                mode === 'BUY'
                  ? 'bg-[#1DB954] text-slate-950 shadow'
                  : 'theme-text-muted hover:theme-text-main'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              {tradeCategory === 'INSTANT' ? 'BUY SHARES' : 'LIMIT BUY'}
            </button>
            <button
              type="button"
              onClick={() => setMode('SELL')}
              className={`flex-1 py-2 text-xs font-bold font-heading rounded-[3px] flex items-center justify-center gap-1.5 transition-all min-h-[40px] ${
                mode === 'SELL'
                  ? 'bg-[#E8453C] text-white shadow'
                  : 'theme-text-muted hover:theme-text-main'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              {tradeCategory === 'INSTANT' ? 'SELL SHARES' : 'LIMIT SELL'}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-[#E8453C]/10 border border-[#E8453C]/30 rounded-[4px] text-[#E8453C] text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleTradeSubmit} className="space-y-4">
            
            {tradeCategory === 'LIMIT' && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#D4A017] flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    Target Trigger Price (IC)
                  </label>
                  <span className="text-[10px] theme-text-dim font-mono">
                    Spot: {currentPrice.toFixed(2)} IC
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full theme-bg-card border border-[#D4A017]/40 rounded-[4px] py-2 px-3 text-sm theme-text-main font-mono focus:outline-none focus:border-[#D4A017]"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold theme-text-muted font-heading">Quantity (Shares)</label>
                <div className="flex gap-1">
                  {[1, 5, 10, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuantity(num)}
                      className="px-2.5 py-1 theme-bg-card theme-bg-card-hover theme-text-main text-[10px] font-mono rounded-[3px] border theme-border min-h-[30px] btn-terminal"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full theme-bg-card border theme-border rounded-[4px] py-2 px-3 text-sm theme-text-main font-mono focus:outline-none focus:border-[#D4A017]"
              />
            </div>

            <div className="p-3 theme-bg-card rounded-[4px] border theme-border flex justify-between items-center text-xs">
              <div>
                <span className="theme-text-muted font-mono">
                  {tradeCategory === 'INSTANT' 
                    ? (mode === 'BUY' ? 'Total Cost:' : 'Total Proceeds:')
                    : (mode === 'BUY' ? 'Target Reserved Funds:' : 'Target Proceeds:')
                  }
                </span>
                <div className="text-base font-extrabold font-mono theme-text-main mt-0.5">
                  {(tradeCategory === 'INSTANT' ? instantTotal : limitTotal).toFixed(2)} <span className="text-[#D4A017]">IC</span>
                </div>
              </div>

              <div className="text-right">
                <span className="theme-text-muted font-mono">
                  {mode === 'BUY' ? 'Available Wallet Balance:' : 'Available Shares:'}
                </span>
                <div className="text-xs font-bold font-mono theme-text-main mt-0.5">
                  {mode === 'BUY' 
                    ? `${availWallet.toFixed(2)} IC ${balanceInfo.lockedFunds > 0 ? `(${balanceInfo.lockedFunds.toFixed(2)} IC locked)` : ''}` 
                    : `${availableQty} shares ${lockedQty > 0 ? `(${lockedQty} locked)` : ''}`
                  }
                </div>
              </div>
            </div>

            {isTradingLocked && (
              <p className="text-[11px] font-mono text-[#E8453C] font-bold text-center bg-[#E8453C]/10 p-2.5 rounded border border-[#E8453C]/30 flex items-center justify-center gap-1.5">
                <Ban className="w-4 h-4 text-[#E8453C]" />
                <span>Trading is currently locked — waiting for admin to start an active session.</span>
              </p>
            )}

            <motion.button
              type="submit"
              whileTap={{ scale: 0.975 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              disabled={isTradingLocked || loadingTrade || (
                tradeCategory === 'INSTANT'
                  ? (mode === 'BUY' ? !canInstantBuy : !canInstantSell)
                  : (mode === 'BUY' ? !canLimitBuy : !canLimitSell)
              )}
              className={`w-full py-3 font-bold text-xs font-mono uppercase rounded-[4px] shadow flex items-center justify-center gap-2 transition-all min-h-[44px] btn-terminal ${
                mode === 'BUY'
                  ? (tradeCategory === 'INSTANT' ? 'bg-[#1DB954] hover:bg-[#1DB954]/90 text-slate-950' : 'bg-[#D4A017] hover:bg-[#D4A017]/90 text-slate-950')
                  : 'bg-[#E8453C] hover:bg-[#E8453C]/90 text-white'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isTradingLocked ? (
                <>
                  <Ban className="w-4 h-4" />
                  <span>TRADING LOCKED — WAITING FOR SESSION TO START</span>
                </>
              ) : loadingTrade ? (
                'PROCESSING ORDER...'
              ) : (
                <>
                  {tradeCategory === 'INSTANT' ? <ShoppingBag className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  <span>
                    {tradeCategory === 'INSTANT'
                      ? `EXECUTE ${mode} ORDER (${parsedQty} SHARES @ ${instantTotal.toFixed(2)} IC)`
                      : `PLACE LIMIT ${mode} ORDER (${parsedQty} SHARES AT ${parsedTargetPrice.toFixed(2)} IC)`
                    }
                  </span>
                </>
              )}
            </motion.button>
          </form>
        </div>

        {/* Active Pending Limit Orders */}
        {stockPendingOrders.length > 0 && (
          <div className="theme-bg-panel p-4 rounded-[6px] border theme-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#D4A017] uppercase tracking-wider font-mono">
              <Clock className="w-4 h-4" />
              <span>Pending Limit Orders for {stock.symbol}</span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              {stockPendingOrders.map((order) => (
                <div key={order.id} className="p-3 theme-bg-card rounded-[4px] border theme-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.2 rounded-[2px] text-[10px] font-extrabold ${
                      order.type === 'BUY'
                        ? 'bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30'
                        : 'bg-[#E8453C]/20 text-[#E8453C] border border-[#E8453C]/30'
                    }`}>
                      LIMIT {order.type}
                    </span>
                    <div>
                      <span className="font-bold theme-text-main">{order.quantity} shares</span>
                      <span className="theme-text-muted ml-2">@ Target: <strong className="text-[#D4A017]">{order.targetPrice.toFixed(2)} IC</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCancelOrder(order.id)}
                      disabled={cancellingOrderId === order.id}
                      className="px-2.5 py-1 bg-[#E8453C]/10 hover:bg-[#E8453C]/20 text-[#E8453C] border border-[#E8453C]/30 text-[11px] font-bold rounded-[3px] flex items-center gap-1 transition-all btn-terminal"
                    >
                      <Ban className="w-3 h-3" />
                      {cancellingOrderId === order.id ? '...' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>
        </div>
        </div>

      </div>
    </div>
  );
}