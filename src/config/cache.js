/**
 * Lightweight in-memory TTL cache.
 * Suitable for caching semi-static data (branches, settings) on a single-node VPS.
 * Each PM2 instance gets its own cache — acceptable for 2-instance cluster.
 */

class MemoryCache {
  constructor() {
    this._store = new Map();
  }

  /**
   * @param {string} key
   * @returns {*|undefined}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs — time-to-live in milliseconds
   */
  set(key, value, ttlMs) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Remove a specific cache entry.
   * @param {string} key
   */
  invalidate(key) {
    this._store.delete(key);
  }

  /**
   * Remove all cache entries whose key starts with the given prefix.
   * @param {string} prefix
   */
  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
      }
    }
  }

  /** Remove all entries. */
  clear() {
    this._store.clear();
  }
}

// Singleton instance shared across the process
const cache = new MemoryCache();

module.exports = cache;
