import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleCache } from './RuleCache.js';
import { SonarRuleDetails } from '../types.js';

describe('RuleCache', () => {
  let cache: RuleCache;

  const mockRule: SonarRuleDetails = {
    key: 'java:S1234',
    name: 'Test Rule',
    severity: 'MAJOR',
    type: 'CODE_SMELL',
    htmlDesc: '<p>Test description</p>',
    tags: ['test'],
    sysTags: ['brain-overload'],
    lang: 'java',
    langName: 'Java',
  };

  beforeEach(() => {
    cache = new RuleCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set', () => {
    it('should store and retrieve a rule', () => {
      cache.set('java:S1234', mockRule);
      const result = cache.get('java:S1234');

      expect(result).toEqual(mockRule);
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('unknown:rule');
      expect(result).toBeNull();
    });

    it('should return null for expired entry', () => {
      cache.set('java:S1234', mockRule);

      // Advance time past TTL (default 5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      const result = cache.get('java:S1234');
      expect(result).toBeNull();
    });

    it('should return cached value before TTL expires', () => {
      cache.set('java:S1234', mockRule);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(4 * 60 * 1000);

      const result = cache.get('java:S1234');
      expect(result).toEqual(mockRule);
    });
  });

  describe('has', () => {
    it('should return true for existing valid entry', () => {
      cache.set('java:S1234', mockRule);
      expect(cache.has('java:S1234')).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      expect(cache.has('unknown:rule')).toBe(false);
    });

    it('should return false for expired entry', () => {
      cache.set('java:S1234', mockRule);
      vi.advanceTimersByTime(6 * 60 * 1000);

      expect(cache.has('java:S1234')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove an entry', () => {
      cache.set('java:S1234', mockRule);
      expect(cache.delete('java:S1234')).toBe(true);
      expect(cache.get('java:S1234')).toBeNull();
    });

    it('should return false for non-existent entry', () => {
      expect(cache.delete('unknown:rule')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('java:S1234', mockRule);
      cache.set('java:S5678', { ...mockRule, key: 'java:S5678' });

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('java:S1234')).toBeNull();
      expect(cache.get('java:S5678')).toBeNull();
    });

    it('should reset statistics', () => {
      cache.set('java:S1234', mockRule);
      cache.get('java:S1234'); // hit
      cache.get('unknown'); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track hits', () => {
      cache.set('java:S1234', mockRule);
      cache.get('java:S1234');
      cache.get('java:S1234');
      cache.get('java:S1234');

      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
    });

    it('should track misses', () => {
      cache.get('unknown1');
      cache.get('unknown2');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('java:S1234', mockRule);
      cache.get('java:S1234'); // hit
      cache.get('java:S1234'); // hit
      cache.get('unknown'); // miss
      cache.get('unknown2'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.5); // 2 hits / 4 total
    });

    it('should return 0 hit rate when empty', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('TTL configuration', () => {
    it('should respect custom TTL', () => {
      const shortTtlCache = new RuleCache({ ttlMs: 1000 }); // 1 second

      shortTtlCache.set('java:S1234', mockRule);

      // Still valid at 500ms
      vi.advanceTimersByTime(500);
      expect(shortTtlCache.get('java:S1234')).toEqual(mockRule);

      // Expired at 1500ms
      vi.advanceTimersByTime(1000);
      expect(shortTtlCache.get('java:S1234')).toBeNull();
    });
  });

  describe('max size', () => {
    it('should evict oldest entry when max size reached', () => {
      const smallCache = new RuleCache({ maxSize: 3 });

      smallCache.set('rule1', { ...mockRule, key: 'rule1' });
      smallCache.set('rule2', { ...mockRule, key: 'rule2' });
      smallCache.set('rule3', { ...mockRule, key: 'rule3' });

      // Cache is full, adding new entry should evict oldest
      smallCache.set('rule4', { ...mockRule, key: 'rule4' });

      expect(smallCache.size).toBe(3);
      expect(smallCache.get('rule1')).toBeNull(); // Evicted
      expect(smallCache.get('rule2')).not.toBeNull();
      expect(smallCache.get('rule3')).not.toBeNull();
      expect(smallCache.get('rule4')).not.toBeNull();
    });

    it('should not evict when updating existing entry', () => {
      const smallCache = new RuleCache({ maxSize: 2 });

      smallCache.set('rule1', { ...mockRule, key: 'rule1' });
      smallCache.set('rule2', { ...mockRule, key: 'rule2' });

      // Update existing entry - should not evict
      smallCache.set('rule1', { ...mockRule, key: 'rule1', name: 'Updated' });

      expect(smallCache.size).toBe(2);
      expect(smallCache.get('rule1')?.name).toBe('Updated');
      expect(smallCache.get('rule2')).not.toBeNull();
    });
  });

  describe('pruneExpired', () => {
    it('should remove all expired entries', () => {
      cache.set('rule1', { ...mockRule, key: 'rule1' });
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      cache.set('rule2', { ...mockRule, key: 'rule2' });
      vi.advanceTimersByTime(4 * 60 * 1000); // 4 more minutes (6 total for rule1, 4 for rule2)

      // rule1 should be expired (6 min > 5 min TTL), rule2 should be valid
      const pruned = cache.pruneExpired();

      expect(pruned).toBe(1);
      expect(cache.size).toBe(1);
      expect(cache.get('rule1')).toBeNull();
      expect(cache.get('rule2')).not.toBeNull();
    });

    it('should return 0 when no entries are expired', () => {
      cache.set('rule1', { ...mockRule, key: 'rule1' });
      cache.set('rule2', { ...mockRule, key: 'rule2' });

      const pruned = cache.pruneExpired();

      expect(pruned).toBe(0);
      expect(cache.size).toBe(2);
    });
  });
});
