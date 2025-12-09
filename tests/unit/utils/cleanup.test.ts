/**
 * Cleanup Registry Tests
 *
 * Tests for the cleanup registry module:
 * - Handler registration and unregistration
 * - LIFO execution order
 * - Error isolation (one handler failure doesn't stop others)
 * - Timeout handling
 * - Shutdown state management
 * - Edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerCleanup,
  unregisterCleanup,
  runCleanup,
  isShutdownInProgress,
  isCleanupCompleted,
  getCleanupHandlerCount,
  resetCleanupRegistry,
  DEFAULT_CLEANUP_TIMEOUT,
} from '../../../src/utils/cleanup.js';

describe('Cleanup Registry', () => {
  beforeEach(() => {
    // Reset the registry before each test
    resetCleanupRegistry();
  });

  afterEach(() => {
    // Clean up after each test
    resetCleanupRegistry();
  });

  describe('registerCleanup', () => {
    it('should register a cleanup handler', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler, 'TestHandler');

      expect(getCleanupHandlerCount()).toBe(1);
    });

    it('should register multiple handlers', () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      const handler3 = vi.fn().mockResolvedValue(undefined);

      registerCleanup(handler1, 'Handler1');
      registerCleanup(handler2, 'Handler2');
      registerCleanup(handler3, 'Handler3');

      expect(getCleanupHandlerCount()).toBe(3);
    });

    it('should not register handlers during shutdown', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      registerCleanup(handler1, 'Handler1');

      // Start cleanup (which sets isShuttingDown)
      const cleanupPromise = runCleanup();

      // Try to register during shutdown
      registerCleanup(handler2, 'Handler2');

      await cleanupPromise;

      // Handler2 should not have been registered
      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should not register handlers after cleanup completed', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler1, 'Handler1');

      await runCleanup();

      const handler2 = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler2, 'Handler2');

      expect(getCleanupHandlerCount()).toBe(0);
    });
  });

  describe('unregisterCleanup', () => {
    it('should unregister a cleanup handler', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler, 'TestHandler');

      expect(getCleanupHandlerCount()).toBe(1);

      unregisterCleanup(handler);

      expect(getCleanupHandlerCount()).toBe(0);
    });

    it('should only unregister the specific handler', () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      registerCleanup(handler1, 'Handler1');
      registerCleanup(handler2, 'Handler2');

      unregisterCleanup(handler1);

      expect(getCleanupHandlerCount()).toBe(1);
    });

    it('should handle unregistering non-existent handler gracefully', () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      expect(() => unregisterCleanup(handler)).not.toThrow();
      expect(getCleanupHandlerCount()).toBe(0);
    });

    it('should not call unregistered handler during cleanup', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      registerCleanup(handler1, 'Handler1');
      registerCleanup(handler2, 'Handler2');

      unregisterCleanup(handler1);

      await runCleanup();

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('runCleanup', () => {
    it('should call all registered handlers', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      const handler3 = vi.fn().mockResolvedValue(undefined);

      registerCleanup(handler1, 'Handler1');
      registerCleanup(handler2, 'Handler2');
      registerCleanup(handler3, 'Handler3');

      await runCleanup();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should call handlers in LIFO order', async () => {
      const order: number[] = [];

      const handler1 = vi.fn().mockImplementation(async () => {
        order.push(1);
      });
      const handler2 = vi.fn().mockImplementation(async () => {
        order.push(2);
      });
      const handler3 = vi.fn().mockImplementation(async () => {
        order.push(3);
      });

      registerCleanup(handler1, 'Handler1');
      registerCleanup(handler2, 'Handler2');
      registerCleanup(handler3, 'Handler3');

      await runCleanup();

      // LIFO order: 3 was registered last, should run first
      expect(order).toEqual([3, 2, 1]);
    });

    it('should continue after handler error', async () => {
      const order: number[] = [];

      const handler1 = vi.fn().mockImplementation(async () => {
        order.push(1);
      });
      const handler2 = vi.fn().mockImplementation(async () => {
        throw new Error('Handler 2 failed');
      });
      const handler3 = vi.fn().mockImplementation(async () => {
        order.push(3);
      });

      registerCleanup(handler1, 'Handler1');
      registerCleanup(handler2, 'Handler2');
      registerCleanup(handler3, 'Handler3');

      // Should not throw
      await expect(runCleanup()).resolves.toBeUndefined();

      // All handlers should have been attempted (in LIFO order)
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();

      // Handlers 1 and 3 should have completed
      expect(order).toEqual([3, 1]);
    });

    it('should handle timeout on slow handler', async () => {
      const fastHandler = vi.fn().mockResolvedValue(undefined);
      const slowHandler = vi.fn().mockImplementation(async () => {
        // This handler takes longer than the timeout
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      registerCleanup(fastHandler, 'FastHandler');
      registerCleanup(slowHandler, 'SlowHandler');

      // Use a short timeout for testing
      await runCleanup(50);

      // Both handlers should have been called
      expect(slowHandler).toHaveBeenCalled();
      expect(fastHandler).toHaveBeenCalled();
    });

    it('should only run cleanup once', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler, 'TestHandler');

      await runCleanup();
      await runCleanup();
      await runCleanup();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle empty registry', async () => {
      await expect(runCleanup()).resolves.toBeUndefined();
    });

    it('should clear handlers after cleanup', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler, 'TestHandler');

      await runCleanup();

      expect(getCleanupHandlerCount()).toBe(0);
    });
  });

  describe('isShutdownInProgress', () => {
    it('should return false initially', () => {
      expect(isShutdownInProgress()).toBe(false);
    });

    it('should return true during cleanup', async () => {
      let wasInProgress = false;

      const handler = vi.fn().mockImplementation(async () => {
        wasInProgress = isShutdownInProgress();
      });

      registerCleanup(handler, 'TestHandler');
      await runCleanup();

      expect(wasInProgress).toBe(true);
    });

    it('should return true after cleanup starts', async () => {
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      registerCleanup(handler, 'SlowHandler');

      const cleanupPromise = runCleanup();

      // Check while cleanup is running
      expect(isShutdownInProgress()).toBe(true);

      await cleanupPromise;
    });
  });

  describe('isCleanupCompleted', () => {
    it('should return false initially', () => {
      expect(isCleanupCompleted()).toBe(false);
    });

    it('should return true after cleanup completes', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler, 'TestHandler');

      await runCleanup();

      expect(isCleanupCompleted()).toBe(true);
    });

    it('should return true even with no handlers', async () => {
      await runCleanup();
      expect(isCleanupCompleted()).toBe(true);
    });
  });

  describe('getCleanupHandlerCount', () => {
    it('should return 0 initially', () => {
      expect(getCleanupHandlerCount()).toBe(0);
    });

    it('should track handler count correctly', () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      expect(getCleanupHandlerCount()).toBe(0);

      registerCleanup(handler1, 'Handler1');
      expect(getCleanupHandlerCount()).toBe(1);

      registerCleanup(handler2, 'Handler2');
      expect(getCleanupHandlerCount()).toBe(2);

      unregisterCleanup(handler1);
      expect(getCleanupHandlerCount()).toBe(1);

      unregisterCleanup(handler2);
      expect(getCleanupHandlerCount()).toBe(0);
    });
  });

  describe('resetCleanupRegistry', () => {
    it('should reset all state', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler, 'TestHandler');

      await runCleanup();

      expect(isShutdownInProgress()).toBe(true);
      expect(isCleanupCompleted()).toBe(true);
      expect(getCleanupHandlerCount()).toBe(0);

      resetCleanupRegistry();

      expect(isShutdownInProgress()).toBe(false);
      expect(isCleanupCompleted()).toBe(false);
      expect(getCleanupHandlerCount()).toBe(0);
    });

    it('should allow new registrations after reset', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler1, 'Handler1');
      await runCleanup();

      resetCleanupRegistry();

      const handler2 = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler2, 'Handler2');

      expect(getCleanupHandlerCount()).toBe(1);

      await runCleanup();

      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle handler that returns rejected promise', async () => {
      const goodHandler = vi.fn().mockResolvedValue(undefined);
      const badHandler = vi.fn().mockRejectedValue(new Error('Rejected'));

      registerCleanup(goodHandler, 'GoodHandler');
      registerCleanup(badHandler, 'BadHandler');

      await expect(runCleanup()).resolves.toBeUndefined();

      expect(goodHandler).toHaveBeenCalled();
      expect(badHandler).toHaveBeenCalled();
    });

    it('should handle handler that throws synchronously', async () => {
      const goodHandler = vi.fn().mockResolvedValue(undefined);
      const throwingHandler = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });

      registerCleanup(goodHandler, 'GoodHandler');
      registerCleanup(throwingHandler, 'ThrowingHandler');

      await expect(runCleanup()).resolves.toBeUndefined();

      expect(goodHandler).toHaveBeenCalled();
      expect(throwingHandler).toHaveBeenCalled();
    });

    it('should use default name for anonymous handlers', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registerCleanup(handler);

      expect(getCleanupHandlerCount()).toBe(1);
    });

    it('should handle very fast cleanup', async () => {
      const handlers = Array(100)
        .fill(null)
        .map(() => vi.fn().mockResolvedValue(undefined));

      handlers.forEach((h, i) => registerCleanup(h, `Handler${i}`));

      await runCleanup();

      handlers.forEach((h) => {
        expect(h).toHaveBeenCalledTimes(1);
      });
    });
  });
});
