/**
 * Caching Service
 *
 * Provides in-memory caching with TTL support, LRU eviction,
 * and cache statistics for performance optimization.
 */

import { Logger } from '../utils/logger';

const logger = new Logger('cache');

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  memoryUsage: number;
}

export interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number;
  checkPeriod?: number;
  onEviction?: (key: string, value: unknown) => void;
}

/**
 * LRUCache implements a Least Recently Used cache with TTL support.
 *
 * Features:
 * - Time-to-live (TTL) per entry
 * - LRU eviction when capacity is reached
 * - Automatic expiration checking
 * - Cache statistics tracking
 *
 * Performance optimization:
 * - O(1) get and set operations
 * - Memory-efficient storage
 * - Configurable cleanup intervals
 */
export class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private options: Required<CacheOptions>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: CacheOptions = {}) {
    this.options = {
      maxSize: options.maxSize ?? 1000,
      defaultTTL: options.defaultTTL ?? 300000, // 5 minutes
      checkPeriod: options.checkPeriod ?? 60000, // 1 minute
      onEviction: options.onEviction ?? (() => {}),
    };

    this.startCleanup();
  }

  /**
   * Gets a value from the cache.
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access tracking for LRU
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();

    // Move to end of Map to mark as recently used
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    logger.debug('Cache hit', { key });

    return entry.value;
  }

  /**
   * Sets a value in the cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds (optional)
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + (ttl ?? this.options.defaultTTL),
      accessCount: 0,
      lastAccessedAt: now,
    };

    // Delete first to ensure it's at the end (most recent)
    this.cache.delete(key);
    this.cache.set(key, entry);

    logger.debug('Cache set', { key, ttl: ttl ?? this.options.defaultTTL });
  }

  /**
   * Checks if a key exists and is not expired.
   *
   * @param key - Cache key
   * @returns True if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Deletes a key from the cache.
   *
   * @param key - Cache key
   * @returns True if key existed
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.options.onEviction(key, entry.value);
    }
    return this.cache.delete(key);
  }

  /**
   * Gets or sets a value using a factory function.
   *
   * @param key - Cache key
   * @param factory - Function to generate value if not cached
   * @param ttl - Time-to-live
   * @returns Cached or generated value
   */
  async getOrSet(key: string, factory: () => T | Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Gets multiple values at once.
   *
   * @param keys - Array of cache keys
   * @returns Map of key to value (only includes found keys)
   */
  getMany(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();

    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }

    return result;
  }

  /**
   * Sets multiple values at once.
   *
   * @param entries - Entries to set
   * @param ttl - TTL for all entries
   */
  setMany(entries: Array<[string, T]>, ttl?: number): void {
    for (const [key, value] of entries) {
      this.set(key, value, ttl);
    }
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    for (const [key, entry] of this.cache) {
      this.options.onEviction(key, entry.value);
    }
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Gets cache statistics.
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      evictions: this.stats.evictions,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Resets cache statistics.
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Gets all keys in the cache.
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Gets all values in the cache.
   */
  values(): T[] {
    const result: T[] = [];
    for (const [key, entry] of this.cache) {
      if (!this.isExpired(entry)) {
        result.push(entry.value);
      }
    }
    return result;
  }

  /**
   * Evicts the least recently used entry.
   */
  private evictLRU(): void {
    // Map maintains insertion order, first entry is oldest
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      const entry = this.cache.get(firstKey);
      if (entry) {
        this.options.onEviction(firstKey, entry.value);
      }
      this.cache.delete(firstKey);
      this.stats.evictions++;
      logger.debug('Evicted LRU entry', { key: firstKey });
    }
  }

  /**
   * Checks if an entry is expired.
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Starts the periodic cleanup of expired entries.
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.options.checkPeriod);
  }

  /**
   * Removes all expired entries.
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.options.onEviction(key, entry.value);
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up expired entries', { removed });
    }

    return removed;
  }

  /**
   * Estimates memory usage of the cache.
   */
  private estimateMemoryUsage(): number {
    let bytes = 0;

    for (const [key, entry] of this.cache) {
      bytes += key.length * 2; // String is 2 bytes per char
      bytes += JSON.stringify(entry.value).length * 2;
      bytes += 48; // Entry metadata overhead
    }

    return bytes;
  }

  /**
   * Stops the cleanup interval.
   */
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Global cache instance for common use.
 */
export const globalCache = new LRUCache();

/**
 * Creates a namespaced cache that prefixes all keys.
 */
export function createNamespacedCache<T>(namespace: string, options?: CacheOptions): {
  get: (key: string) => T | undefined;
  set: (key: string, value: T, ttl?: number) => void;
  delete: (key: string) => boolean;
  clear: () => void;
} {
  const cache = new LRUCache<T>(options);

  return {
    get: (key: string) => cache.get(`${namespace}:${key}`),
    set: (key: string, value: T, ttl?: number) => cache.set(`${namespace}:${key}`, value, ttl),
    delete: (key: string) => cache.delete(`${namespace}:${key}`),
    clear: () => cache.clear(),
  };
}
