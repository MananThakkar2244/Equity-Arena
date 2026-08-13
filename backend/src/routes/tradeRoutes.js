const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/authMiddleware');
const { tradeRateLimiter } = require('../middleware/rateLimiter');
const { emitPortfolioUpdate } = require('../socket');
const { getUserAvailableBalance, getUserAvailableHolding } = require('../services/orderService');
const { getCurrentSession } = require('../services/sessionService');
const { getUserPortfolio } = require('../services/portfolioService');
const { getPortfolioHistory, RANGES } = require('../services/portfolioHistoryService');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * The balance/holding check in each handler below reads outside the
 * transaction (so the read can run in parallel with the session/stock
 * lookups). That read can go stale if two requests from the same user land
 * close together, so the actual debit/decrement inside the transaction must
 * re-verify atomically — otherwise two concurrent buys (or sells) can both
 * pass the earlier check and overdraw the wallet or oversell a holding.
 * This sentinel lets the transaction signal that race back out to the route.
 */
class InsufficientFundsError extends Error {}
class InsufficientHoldingError extends Error {}

/**
 * Rebuild the full portfolio after the trade response has already gone out.
 * Portfolio formatting includes several related queries per holding, so it
 * should never sit on the critical path of a market order.
 */
async function refreshAndEmitPortfolio(userId) {
  try {
    const portfolio = await getUserPortfolio(userId);
    if (portfolio) emitPortfolioUpdate(userId, portfolio);
  } catch (err) {
    console.error('Background portfolio refresh error:', err?.message || err);
  }
}

// GET /portfolio
router.get('/portfolio', authenticateToken, async (req, res) => {
  try {
    const portfolio = await getUserPortfolio(req.user.userId);
    if (!portfolio) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(portfolio);
  } catch (err) {
    console.error('Get portfolio error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /portfolio/history?range=15m|1h|3h
// Reconstructs the trader's portfolio value curve from the transaction ledger
// and price history. The frontend's PortfolioSection chart depends on this.
router.get('/portfolio/history', authenticateToken, async (req, res) => {
  try {
    const { range } = req.query;
    const rangeKey = Object.prototype.hasOwnProperty.call(RANGES, range) ? range : '3h';
    const history = await getPortfolioHistory(req.user.userId, rangeKey);
    if (!history) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(history);
  } catch (err) {
    console.error('Get portfolio history error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /trade/buy
router.post('/trade/buy', authenticateToken, tradeRateLimiter, async (req, res) => {
  try {
    const { stockId, quantity } = req.body;
    const userId = req.user.userId;

    const parsedQty = parseInt(quantity, 10);
    if (!stockId || isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }

    // These reads are independent, so run them together. The old flow waited
    // for each query one after another before the trade could even start.
    const [session, stock, balanceInfo] = await Promise.all([
      getCurrentSession(),
      prisma.stock.findUnique({ where: { id: stockId } }),
      getUserAvailableBalance(userId)
    ]);

    if (!session || session.status !== 'ACTIVE' || session.isTradingLocked) {
      const msg = session?.status === 'NOT_STARTED'
        ? "Trading hasn't started yet — waiting for admin to start session"
        : 'Trading is locked for this session (Session is in auto-liquidation or has ended).';
      return res.status(400).json({ error: msg });
    }

    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    const totalCost = Math.round(stock.currentPrice * parsedQty * 100) / 100;

    if (totalCost > balanceInfo.availableBalance) {
      return res.status(400).json({
        error: `Insufficient available wallet balance. Total cost is ${totalCost.toFixed(2)} IC, but your available balance is ${balanceInfo.availableBalance.toFixed(2)} IC (after pending limit orders).`
      });
    }

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Atomic, race-safe debit: only succeeds if the wallet still has
        // enough balance at the moment of the write, not just at the moment
        // of the earlier (out-of-transaction) check.
        const debit = await tx.user.updateMany({
          where: { id: userId, walletBalance: { gte: totalCost } },
          data: { walletBalance: { decrement: totalCost } }
        });
        if (debit.count === 0) {
          throw new InsufficientFundsError();
        }
        const updatedUser = await tx.user.findUnique({
          where: { id: userId },
          select: { walletBalance: true }
        });

        const existingHolding = await tx.holding.findUnique({
          where: { userId_stockId: { userId, stockId } }
        });

        let holding;
        if (existingHolding) {
          const newQty = existingHolding.quantity + parsedQty;
          const newAvgBuyPrice = Math.round(
            (((existingHolding.quantity * existingHolding.avgBuyPrice) + (parsedQty * stock.currentPrice)) / newQty) * 100
          ) / 100;

          holding = await tx.holding.update({
            where: { id: existingHolding.id },
            data: {
              quantity: newQty,
              avgBuyPrice: newAvgBuyPrice
            },
            select: { id: true, quantity: true, avgBuyPrice: true }
          });
        } else {
          holding = await tx.holding.create({
            data: {
              userId,
              stockId,
              quantity: parsedQty,
              avgBuyPrice: stock.currentPrice
            },
            select: { id: true, quantity: true, avgBuyPrice: true }
          });
        }

        const transaction = await tx.transaction.create({
          data: {
            userId,
            stockId,
            type: 'BUY',
            quantity: parsedQty,
            price: stock.currentPrice
          },
          include: { stock: { select: { symbol: true, name: true } } }
        });

        return {
          transaction,
          holding,
          walletBalance: updatedUser.walletBalance
        };
      });
    } catch (txErr) {
      if (txErr instanceof InsufficientFundsError) {
        return res.status(400).json({
          error: `Insufficient available wallet balance. Total cost is ${totalCost.toFixed(2)} IC, but your available balance changed before this trade could complete. Please try again.`
        });
      }
      throw txErr;
    }

    // IMPORTANT: do not wait for the expensive portfolio rebuild before
    // acknowledging the fill. The trade itself is already committed.
    const trade = {
      side: 'BUY',
      stockId,
      symbol: stock.symbol,
      quantity: parsedQty,
      price: stock.currentPrice,
      walletBalance: result.walletBalance,
      holdingId: result.holding.id,
      holdingQuantity: result.holding.quantity,
      avgBuyPrice: result.holding.avgBuyPrice
    };

    setImmediate(() => {
      refreshAndEmitPortfolio(userId);
    });

    return res.json({
      message: 'Buy order executed successfully',
      transaction: result.transaction,
      trade
    });
  } catch (err) {
    console.error('Trade buy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /trade/sell
router.post('/trade/sell', authenticateToken, tradeRateLimiter, async (req, res) => {
  try {
    const { stockId, quantity } = req.body;
    const userId = req.user.userId;

    const parsedQty = parseInt(quantity, 10);
    if (!stockId || isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }

    const [session, stock, holdingInfo] = await Promise.all([
      getCurrentSession(),
      prisma.stock.findUnique({ where: { id: stockId } }),
      getUserAvailableHolding(userId, stockId)
    ]);

    if (!session || session.status !== 'ACTIVE' || session.isTradingLocked) {
      const msg = session?.status === 'NOT_STARTED'
        ? "Trading hasn't started yet — waiting for admin to start session"
        : 'Trading is locked for this session (Session is in auto-liquidation or has ended).';
      return res.status(400).json({ error: msg });
    }

    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    if (parsedQty > holdingInfo.availableQuantity) {
      return res.status(400).json({
        error: `Insufficient available shares. You have ${holdingInfo.availableQuantity} shares available to sell (after pending limit orders).`
      });
    }

    const proceeds = Math.round(stock.currentPrice * parsedQty * 100) / 100;
    const existingHolding = holdingInfo.holding;

    if (!existingHolding) {
      return res.status(400).json({ error: 'No holding available for this stock' });
    }

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Atomic, race-safe deduction: only succeeds if the holding still has
        // enough shares at the moment of the write, not just at the moment of
        // the earlier (out-of-transaction) check. Prevents overselling when
        // two sell requests for the same holding land close together.
        const debit = await tx.holding.updateMany({
          where: { id: existingHolding.id, quantity: { gte: parsedQty } },
          data: { quantity: { decrement: parsedQty } }
        });
        if (debit.count === 0) {
          throw new InsufficientHoldingError();
        }

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { walletBalance: { increment: proceeds } },
          select: { walletBalance: true }
        });

        const postHolding = await tx.holding.findUnique({
          where: { id: existingHolding.id },
          select: { quantity: true }
        });

        let holdingQuantity = postHolding ? postHolding.quantity : 0;
        if (holdingQuantity === 0) {
          await tx.holding.delete({ where: { id: existingHolding.id } });
        }

        const transaction = await tx.transaction.create({
          data: {
            userId,
            stockId,
            type: 'SELL',
            quantity: parsedQty,
            price: stock.currentPrice
          },
          include: { stock: { select: { symbol: true, name: true } } }
        });

        return {
          transaction,
          walletBalance: updatedUser.walletBalance,
          holdingQuantity
        };
      });
    } catch (txErr) {
      if (txErr instanceof InsufficientHoldingError) {
        return res.status(400).json({
          error: 'Insufficient available shares. Your holding changed before this trade could complete. Please try again.'
        });
      }
      throw txErr;
    }

    const trade = {
      side: 'SELL',
      stockId,
      symbol: stock.symbol,
      quantity: parsedQty,
      price: stock.currentPrice,
      walletBalance: result.walletBalance,
      holdingId: result.holdingQuantity > 0 ? existingHolding.id : null,
      holdingQuantity: result.holdingQuantity,
      avgBuyPrice: existingHolding.avgBuyPrice
    };

    setImmediate(() => {
      refreshAndEmitPortfolio(userId);
    });

    return res.json({
      message: 'Sell order executed successfully',
      transaction: result.transaction,
      trade
    });
  } catch (err) {
    console.error('Trade sell error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = {
  router,
  getUserPortfolio
};
