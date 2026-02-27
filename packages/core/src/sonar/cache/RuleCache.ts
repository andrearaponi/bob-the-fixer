/**
 * Rule Cache
 *
 * Provides caching for SonarQube rule details with TTL.
 * Reduces API calls for repeated rule lookups during analysis.
 */

import { SonarRuleDetails } from '../types.js';

export interface CacheEntry<T> {
  data: T;
  expires: number;
}

export interface RuleCacheConfig {
  /** TTL in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Maximum cache size (default: 1000) */
  maxSize?: number;
}

/**
 * RuleCache - Caches SonarQube rule details with TTL
 *
 * Features:
 * - Time-based expiration (TTL)
 * - LRU-like eviction when max size reached
 * - Hit/miss statistics for monitoring
 */
export class RuleCache {
  private cache: Map<string, CacheEntry<SonarRuleDetails>> = new Map();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  // Statistics
  private hits = 0;
  private misses = 0;

  constructor(config: RuleCacheConfig = {}) {
    this.ttlMs = config.ttlMs ?? 5 * 60 * 1000; // 5 minutes default
    this.maxSize = config.maxSize ?? 1000;
  }

  /**
   * Get a rule from cache if valid
   * @returns The cached rule or null if not found/expired
   */
  get(ruleKey: string): SonarRuleDetails | null {
    const entry = this.cache.get(ruleKey);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (entry.expires <= Date.now()) {
      this.cache.delete(ruleKey);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  /**
   * Store a rule in cache with TTL
   */
  set(ruleKey: string, rule: SonarRuleDetails): void {
    // Evict oldest entries if at max size
    if (this.cache.size >= this.maxSize && !this.cache.has(ruleKey)) {
      this.evictOldest();
    }

    this.cache.set(ruleKey, {
      data: rule,
      expires: Date.now() + this.ttlMs,
    });
  }

  /**
   * Check if a valid entry exists
   */
  has(ruleKey: string): boolean {
    const entry = this.cache.get(ruleKey);
    if (!entry) return false;

    if (entry.expires <= Date.now()) {
      this.cache.delete(ruleKey);
      return false;
    }

    return true;
  }

  /**
   * Remove a rule from cache
   */
  delete(ruleKey: string): boolean {
    return this.cache.delete(ruleKey);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Remove all expired entries
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires <= now) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Evict oldest entry when cache is full
   * Uses simple FIFO (Map maintains insertion order)
   */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }
}
