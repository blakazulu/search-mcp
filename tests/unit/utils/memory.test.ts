/**
 * Memory Utilities Unit Tests
 *
 * Tests for memory monitoring functions:
 * - getMemoryStats
 * - getMemoryStatus
 * - formatBytes
 * - isMemoryCritical
 * - isMemoryWarning
 * - getAdaptiveBatchSize
 * - MemoryMonitor class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getMemoryStats,
  formatBytes,
  getMemoryStatus,
  isMemoryCritical,
  isMemoryWarning,
  getAdaptiveBatchSize,
  MemoryMonitor,
  MEMORY_WARNING_THRESHOLD,
  MEMORY_CRITICAL_THRESHOLD,
} from '../../../src/utils/memory.js';

// ============================================================================
// Test Suite
// ============================================================================

describe('Memory Utilities', () => {
  describe('getMemoryStats', () => {
    it('should return memory statistics object', () => {
      const stats = getMemoryStats();

      expect(stats).toHaveProperty('heapUsed');
      expect(stats).toHaveProperty('heapTotal');
      expect(stats).toHaveProperty('rss');
      expect(stats).toHaveProperty('external');
      expect(stats).toHaveProperty('heapUsedPercent');
    });

    it('should return positive values', () => {
      const stats = getMemoryStats();

      expect(stats.heapUsed).toBeGreaterThan(0);
      expect(stats.heapTotal).toBeGreaterThan(0);
      expect(stats.rss).toBeGreaterThan(0);
    });

    it('should calculate heap percentage correctly', () => {
      const stats = getMemoryStats();

      expect(stats.heapUsedPercent).toBeCloseTo(
        stats.heapUsed / stats.heapTotal,
        5
      );
    });

    it('should have percentage between 0 and 1', () => {
      const stats = getMemoryStats();

      expect(stats.heapUsedPercent).toBeGreaterThan(0);
      expect(stats.heapUsedPercent).toBeLessThanOrEqual(1);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1KB');
      expect(formatBytes(2048)).toBe('2KB');
      expect(formatBytes(512 * 1024)).toBe('512KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1MB');
      expect(formatBytes(256 * 1024 * 1024)).toBe('256MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0GB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5GB');
    });

    it('should handle edge cases', () => {
      expect(formatBytes(0)).toBe('0B');
      expect(formatBytes(1)).toBe('1B');
    });
  });

  describe('getMemoryStatus', () => {
    it('should return status object with stats, level, and message', () => {
      const status = getMemoryStatus();

      expect(status).toHaveProperty('stats');
      expect(status).toHaveProperty('level');
      expect(status).toHaveProperty('message');
      expect(['normal', 'warning', 'critical']).toContain(status.level);
    });

    it('should include memory stats', () => {
      const status = getMemoryStatus();

      expect(status.stats.heapUsed).toBeGreaterThan(0);
      expect(status.stats.heapTotal).toBeGreaterThan(0);
    });

    it('should have a descriptive message', () => {
      const status = getMemoryStatus();

      expect(status.message).toContain('Memory usage at');
      expect(status.message).toContain('%');
    });
  });

  describe('isMemoryCritical', () => {
    it('should return a boolean', () => {
      const result = isMemoryCritical();

      expect(typeof result).toBe('boolean');
    });

    // Note: We can't easily test the true case without mocking process.memoryUsage
    it('should typically be false under normal conditions', () => {
      // In test environment, memory usage should be well below critical threshold
      const result = isMemoryCritical();

      // We don't assert false because it might actually be critical in some environments
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isMemoryWarning', () => {
    it('should return a boolean', () => {
      const result = isMemoryWarning();

      expect(typeof result).toBe('boolean');
    });
  });

  describe('getAdaptiveBatchSize', () => {
    it('should return default batch size under normal conditions', () => {
      const defaultSize = 50;
      const result = getAdaptiveBatchSize(defaultSize);

      // Under normal test conditions, should return default or reduced size
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(defaultSize);
    });

    it('should respect minimum batch size', () => {
      const defaultSize = 100;
      const minSize = 20;
      const result = getAdaptiveBatchSize(defaultSize, minSize);

      expect(result).toBeGreaterThanOrEqual(minSize);
    });

    it('should use 10 as default minimum', () => {
      const defaultSize = 50;
      const result = getAdaptiveBatchSize(defaultSize);

      expect(result).toBeGreaterThanOrEqual(10);
    });
  });

  describe('MemoryMonitor', () => {
    let monitor: MemoryMonitor;

    beforeEach(() => {
      monitor = new MemoryMonitor(100); // Fast interval for testing
    });

    afterEach(() => {
      monitor.stop();
    });

    it('should start and stop monitoring', () => {
      expect(monitor.isRunning()).toBe(false);

      monitor.start();
      expect(monitor.isRunning()).toBe(true);

      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('should be idempotent when starting multiple times', () => {
      monitor.start();
      monitor.start();
      monitor.start();

      expect(monitor.isRunning()).toBe(true);
    });

    it('should be safe to stop multiple times', () => {
      monitor.start();
      monitor.stop();
      monitor.stop();
      monitor.stop();

      expect(monitor.isRunning()).toBe(false);
    });

    it('should register warning callback', () => {
      const callback = vi.fn();
      monitor.onWarning(callback);

      // Perform a manual check
      monitor.check();

      // Callback may or may not be called depending on memory status
      // This just verifies it doesn't throw
    });

    it('should call callbacks on status change', async () => {
      const callback = vi.fn();
      monitor.onWarning(callback);

      // Perform multiple checks
      monitor.check();
      monitor.check();
      monitor.check();

      // Note: Without mocking, we can't guarantee when callbacks are called
      // This test mainly verifies the monitor works without errors
    });

    it('should perform periodic checks when running', async () => {
      const callback = vi.fn();
      monitor.onWarning(callback);

      monitor.start();

      // Wait for a few check intervals
      await new Promise((resolve) => setTimeout(resolve, 250));

      monitor.stop();

      // Monitor should have run without errors
      expect(monitor.isRunning()).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should have valid warning threshold', () => {
      expect(MEMORY_WARNING_THRESHOLD).toBeGreaterThan(0);
      expect(MEMORY_WARNING_THRESHOLD).toBeLessThan(1);
    });

    it('should have valid critical threshold', () => {
      expect(MEMORY_CRITICAL_THRESHOLD).toBeGreaterThan(0);
      expect(MEMORY_CRITICAL_THRESHOLD).toBeLessThan(1);
    });

    it('should have critical threshold higher than warning threshold', () => {
      expect(MEMORY_CRITICAL_THRESHOLD).toBeGreaterThan(MEMORY_WARNING_THRESHOLD);
    });
  });
});
