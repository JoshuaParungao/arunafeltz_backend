const AppError = require("../utils/appError");

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 20;
const MAX_TRACKED_CLIENTS = 10000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const failedAttempts = new Map();
let lastCleanupAt = 0;

const pruneExpiredEntries = (now) => {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;

  lastCleanupAt = now;
  for (const [key, record] of failedAttempts) {
    if (record.expiresAt <= now) failedAttempts.delete(key);
  }
};

const getClientKey = (req) =>
  req.ip || req.socket?.remoteAddress || "unknown-client";

const loginRateLimit = (req, res, next) => {
  const now = Date.now();
  pruneExpiredEntries(now);

  const key = getClientKey(req);
  const existing = failedAttempts.get(key);

  if (existing && existing.expiresAt > now && existing.count >= MAX_FAILED_ATTEMPTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.expiresAt - now) / 1000)
    );

    res.set("Retry-After", String(retryAfterSeconds));
    return next(
      new AppError(
        "Too many failed login attempts. Please try again later.",
        429,
        "LOGIN_RATE_LIMITED"
      )
    );
  }

  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      failedAttempts.delete(key);
      return;
    }

    if (res.statusCode !== 401) return;

    const completedAt = Date.now();
    const current = failedAttempts.get(key);
    const count = current && current.expiresAt > completedAt
      ? current.count + 1
      : 1;

    if (!failedAttempts.has(key) && failedAttempts.size >= MAX_TRACKED_CLIENTS) {
      const oldestKey = failedAttempts.keys().next().value;
      if (oldestKey !== undefined) failedAttempts.delete(oldestKey);
    }

    failedAttempts.set(key, {
      count,
      expiresAt: current && current.expiresAt > completedAt
        ? current.expiresAt
        : completedAt + WINDOW_MS,
    });
  });

  return next();
};

module.exports = {
  loginRateLimit,
};
