// In-memory sliding window rate limiters

const tradeCooldowns = new Map();

/**
 * Per-user trade rate limiter (prevent rapid automated spam clicks)
 */
function tradeRateLimiter(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return next();

  const now = Date.now();
  const cooldownMs = 400;

  const lastTradeTime = tradeCooldowns.get(userId) || 0;
  if (now - lastTradeTime < cooldownMs) {
    return res.status(429).json({
      error: 'Trade rate limit exceeded. Please wait a moment before submitting another trade order.'
    });
  }

  tradeCooldowns.set(userId, now);
  next();
}

/**
 * Dedicated Admin Login Rate Limiter (Max 5 FAILED attempts per 15 minutes per IP)
 */
const adminLoginAttempts = new Map();

function adminLoginRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxFailedAttempts = 5;

  let record = adminLoginAttempts.get(ip);
  if (!record || now - record.startTime > windowMs) {
    // Window expired (or first request from this IP): persist the reset
    // record immediately so recordAdminFailedAttempt() below reads the new
    // startTime instead of the stale one. Without this write, the map's
    // startTime is frozen forever at the first window's start, so every
    // future request looks "expired" and the limiter never blocks again.
    record = { failedCount: 0, startTime: now };
    adminLoginAttempts.set(ip, record);
  }

  if (record.failedCount >= maxFailedAttempts) {
    return res.status(429).json({
      error: 'Too many failed admin login attempts from this IP. Please wait a few minutes or restart the server.'
    });
  }

  req.adminRateRecord = record;
  req.adminIp = ip;
  next();
}

function recordAdminFailedAttempt(ip) {
  const now = Date.now();
  let record = adminLoginAttempts.get(ip) || { failedCount: 0, startTime: now };
  record.failedCount += 1;
  adminLoginAttempts.set(ip, record);
}

function clearAdminRateLimit(ip) {
  adminLoginAttempts.delete(ip);
}

module.exports = {
  tradeRateLimiter,
  adminLoginRateLimiter,
  recordAdminFailedAttempt,
  clearAdminRateLimit
};
