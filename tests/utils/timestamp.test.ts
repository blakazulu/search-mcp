/**
 * Tests for timestamp utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateTimestamp,
  couldBeNfsAliased,
  getSafeTimestamp,
  createPerfTimer,
  measureDuration,
  MAX_REASONABLE_AGE_MS,
  MAX_FUTURE_TOLERANCE_MS,
  NFS_TIMESTAMP_RESOLUTION_MS,
} from '../../src/utils/timestamp.js';

describe('timestamp utilities', () => {
  describe('validateTimestamp', () => {
    const NOW = 1702000000000; // Fixed reference time for tests

    it('should accept valid recent timestamps', () => {
      const result = validateTimestamp(NOW - 1000, NOW);
      expect(result.isValid).toBe(true);
      expect(result.isSuspicious).toBe(false);
    });

    it('should reject negative timestamps', () => {
      const result = validateTimestamp(-1, NOW);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Negative timestamp');
      expect(result.isSuspicious).toBe(true);
    });

    it('should reject zero timestamps', () => {
      const result = validateTimestamp(0, NOW);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Zero timestamp (uninitialized)');
      expect(result.isSuspicious).toBe(true);
    });

    it('should reject timestamps too far in the future', () => {
      const farFuture = NOW + MAX_FUTURE_TOLERANCE_MS + 1000;
      const result = validateTimestamp(farFuture, NOW);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('future');
      expect(result.isSuspicious).toBe(true);
    });

    it('should accept timestamps within future tolerance', () => {
      const nearFuture = NOW + MAX_FUTURE_TOLERANCE_MS - 1000;
      const result = validateTimestamp(nearFuture, NOW);
      expect(result.isValid).toBe(true);
      expect(result.isSuspicious).toBe(false);
    });

    it('should mark very old timestamps as suspicious but valid', () => {
      const veryOld = NOW - MAX_REASONABLE_AGE_MS - 1000;
      const result = validateTimestamp(veryOld, NOW);
      expect(result.isValid).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.reason).toContain('old');
    });

    it('should use Date.now() as default reference time', () => {
      const result = validateTimestamp(Date.now() - 1000);
      expect(result.isValid).toBe(true);
      expect(result.isSuspicious).toBe(false);
    });
  });

  describe('couldBeNfsAliased', () => {
    it('should detect timestamps within NFS resolution', () => {
      const ts1 = 1702000000000;
      const ts2 = ts1 + 500; // 500ms apart
      expect(couldBeNfsAliased(ts1, ts2)).toBe(true);
    });

    it('should not flag timestamps outside NFS resolution', () => {
      const ts1 = 1702000000000;
      const ts2 = ts1 + 2000; // 2 seconds apart
      expect(couldBeNfsAliased(ts1, ts2)).toBe(false);
    });

    it('should handle exact matches', () => {
      const ts = 1702000000000;
      expect(couldBeNfsAliased(ts, ts)).toBe(true);
    });

    it('should be symmetric', () => {
      const ts1 = 1702000000000;
      const ts2 = ts1 + 500;
      expect(couldBeNfsAliased(ts1, ts2)).toBe(couldBeNfsAliased(ts2, ts1));
    });

    it('should respect boundary conditions', () => {
      const ts1 = 1702000000000;
      const ts2 = ts1 + NFS_TIMESTAMP_RESOLUTION_MS; // Exactly at boundary
      expect(couldBeNfsAliased(ts1, ts2)).toBe(false);

      const ts3 = ts1 + NFS_TIMESTAMP_RESOLUTION_MS - 1; // Just inside
      expect(couldBeNfsAliased(ts1, ts3)).toBe(true);
    });
  });

  describe('getSafeTimestamp', () => {
    const NOW = 1702000000000;

    it('should return valid timestamp unchanged', () => {
      const validTs = NOW - 1000;
      expect(getSafeTimestamp(validTs, NOW)).toBe(validTs);
    });

    it('should return fallback for invalid timestamp', () => {
      const fallback = NOW;
      expect(getSafeTimestamp(-1, fallback)).toBe(fallback);
      expect(getSafeTimestamp(0, fallback)).toBe(fallback);
    });

    it('should use Date.now() as default fallback', () => {
      const before = Date.now();
      const result = getSafeTimestamp(-1);
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });

  describe('createPerfTimer', () => {
    it('should measure elapsed time', async () => {
      const timer = createPerfTimer();
      await sleep(50);
      const elapsed = timer.elapsed();
      // Allow some tolerance for timer precision
      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(200);
    });

    it('should reset correctly', async () => {
      const timer = createPerfTimer();
      await sleep(50);
      timer.reset();
      const elapsed = timer.elapsed();
      expect(elapsed).toBeLessThan(20);
    });

    it('should measure multiple intervals', async () => {
      const timer = createPerfTimer();
      await sleep(30);
      const first = timer.elapsed();
      await sleep(30);
      const second = timer.elapsed();
      expect(second).toBeGreaterThan(first);
    });
  });

  describe('measureDuration', () => {
    it('should return result and duration', async () => {
      const { result, durationMs } = await measureDuration(async () => {
        await sleep(30);
        return 'test';
      });
      expect(result).toBe('test');
      expect(durationMs).toBeGreaterThanOrEqual(25);
    });

    it('should work with async operations', async () => {
      const { result, durationMs } = await measureDuration(async () => {
        return Promise.resolve(42);
      });
      expect(result).toBe(42);
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should propagate errors', async () => {
      await expect(
        measureDuration(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });
  });
});

// Helper function for tests
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
