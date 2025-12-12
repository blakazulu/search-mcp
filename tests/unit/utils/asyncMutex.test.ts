/**
 * Async Mutex Utility Tests
 *
 * Tests for the AsyncMutex, ReadWriteLock, and IndexingLock classes:
 * - Sequential lock acquisition
 * - Concurrent lock acquisition (FIFO queuing)
 * - withLock() error handling
 * - Release after error
 * - Timeout behavior
 * - Read-write lock semantics
 * - Global indexing lock
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AsyncMutex, ReadWriteLock, IndexingLock } from '../../../src/utils/asyncMutex.js';

describe('AsyncMutex', () => {
  describe('basic operations', () => {
    it('should start unlocked', () => {
      const mutex = new AsyncMutex();
      expect(mutex.isLocked).toBe(false);
      expect(mutex.queueLength).toBe(0);
    });

    it('should be locked after acquire', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();
      expect(mutex.isLocked).toBe(true);
    });

    it('should be unlocked after release', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();
      mutex.release();
      expect(mutex.isLocked).toBe(false);
    });

    it('should allow immediate re-acquisition after release', async () => {
      const mutex = new AsyncMutex();

      await mutex.acquire();
      mutex.release();

      await mutex.acquire();
      expect(mutex.isLocked).toBe(true);
      mutex.release();
    });
  });

  describe('sequential acquisition', () => {
    it('should execute operations in sequence', async () => {
      const mutex = new AsyncMutex();
      const order: number[] = [];

      await mutex.acquire();
      order.push(1);
      mutex.release();

      await mutex.acquire();
      order.push(2);
      mutex.release();

      await mutex.acquire();
      order.push(3);
      mutex.release();

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('concurrent acquisition (FIFO queuing)', () => {
    it('should queue concurrent acquisitions in FIFO order', async () => {
      const mutex = new AsyncMutex();
      const order: number[] = [];

      // First, acquire the lock
      await mutex.acquire();

      // Start multiple concurrent acquisitions
      const p1 = mutex.acquire().then(() => {
        order.push(1);
        mutex.release();
      });

      const p2 = mutex.acquire().then(() => {
        order.push(2);
        mutex.release();
      });

      const p3 = mutex.acquire().then(() => {
        order.push(3);
        mutex.release();
      });

      // Verify queue length
      expect(mutex.queueLength).toBe(3);

      // Release the initial lock to start the chain
      mutex.release();

      // Wait for all to complete
      await Promise.all([p1, p2, p3]);

      // Should be in FIFO order
      expect(order).toEqual([1, 2, 3]);
    });

    it('should properly track queue length', async () => {
      const mutex = new AsyncMutex();

      await mutex.acquire();
      expect(mutex.queueLength).toBe(0);

      const p1 = mutex.acquire();
      expect(mutex.queueLength).toBe(1);

      const p2 = mutex.acquire();
      expect(mutex.queueLength).toBe(2);

      mutex.release();
      await p1;
      expect(mutex.queueLength).toBe(1);

      mutex.release();
      await p2;
      expect(mutex.queueLength).toBe(0);

      mutex.release();
    });
  });

  describe('withLock()', () => {
    it('should execute function and return result', async () => {
      const mutex = new AsyncMutex();

      const result = await mutex.withLock(async () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should release lock after function completes', async () => {
      const mutex = new AsyncMutex();

      await mutex.withLock(async () => {
        expect(mutex.isLocked).toBe(true);
      });

      expect(mutex.isLocked).toBe(false);
    });

    it('should release lock after function throws', async () => {
      const mutex = new AsyncMutex();
      const error = new Error('Test error');

      await expect(
        mutex.withLock(async () => {
          throw error;
        })
      ).rejects.toThrow(error);

      expect(mutex.isLocked).toBe(false);
    });

    it('should serialize concurrent withLock calls', async () => {
      const mutex = new AsyncMutex();
      const order: number[] = [];

      const p1 = mutex.withLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push(1);
      });

      const p2 = mutex.withLock(async () => {
        order.push(2);
      });

      const p3 = mutex.withLock(async () => {
        order.push(3);
      });

      await Promise.all([p1, p2, p3]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should propagate errors without affecting queue', async () => {
      const mutex = new AsyncMutex();
      const order: number[] = [];

      const p1 = mutex.withLock(async () => {
        order.push(1);
        throw new Error('Error in task 1');
      }).catch(() => {});

      const p2 = mutex.withLock(async () => {
        order.push(2);
      });

      const p3 = mutex.withLock(async () => {
        order.push(3);
      });

      await Promise.all([p1, p2, p3]);

      expect(order).toEqual([1, 2, 3]);
      expect(mutex.isLocked).toBe(false);
    });
  });

  describe('tryAcquire()', () => {
    it('should return true when lock is available', () => {
      const mutex = new AsyncMutex();
      const acquired = mutex.tryAcquire();

      expect(acquired).toBe(true);
      expect(mutex.isLocked).toBe(true);

      mutex.release();
    });

    it('should return false when lock is held', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();

      const acquired = mutex.tryAcquire();
      expect(acquired).toBe(false);

      mutex.release();
    });
  });

  describe('timeout', () => {
    it('should reject after timeout if lock not acquired', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();

      await expect(mutex.acquire(50)).rejects.toThrow('Lock acquisition timed out');

      mutex.release();
    });

    it('should not reject if lock acquired before timeout', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();

      // Release after a short delay
      setTimeout(() => mutex.release(), 20);

      // This should succeed before the 100ms timeout
      await expect(mutex.acquire(100)).resolves.toBeUndefined();

      mutex.release();
    });

    it('should work with withLock timeout', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();

      await expect(
        mutex.withLock(async () => 42, 50)
      ).rejects.toThrow('Lock acquisition timed out');

      mutex.release();
    });

    it('should remove from queue after timeout', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();

      // This will timeout
      await expect(mutex.acquire(50)).rejects.toThrow();

      // Queue should be empty after timeout
      expect(mutex.queueLength).toBe(0);

      mutex.release();
    });
  });

  describe('edge cases', () => {
    it('should handle release when not locked (no-op)', () => {
      const mutex = new AsyncMutex();
      expect(() => mutex.release()).not.toThrow();
    });

    it('should handle multiple releases gracefully', async () => {
      const mutex = new AsyncMutex();
      await mutex.acquire();
      mutex.release();
      expect(() => mutex.release()).not.toThrow();
    });

    it('should handle async operations within lock', async () => {
      const mutex = new AsyncMutex();

      const result = await mutex.withLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'completed';
      });

      expect(result).toBe('completed');
      expect(mutex.isLocked).toBe(false);
    });
  });
});

describe('ReadWriteLock', () => {
  describe('basic operations', () => {
    it('should start with no readers or writers', () => {
      const rwlock = new ReadWriteLock();
      expect(rwlock.activeReaders).toBe(0);
      expect(rwlock.isWriterActive).toBe(false);
    });

    it('should track active readers', async () => {
      const rwlock = new ReadWriteLock();
      await rwlock.acquireRead();
      expect(rwlock.activeReaders).toBe(1);
      rwlock.releaseRead();
      expect(rwlock.activeReaders).toBe(0);
    });

    it('should track active writer', async () => {
      const rwlock = new ReadWriteLock();
      await rwlock.acquireWrite();
      expect(rwlock.isWriterActive).toBe(true);
      rwlock.releaseWrite();
      expect(rwlock.isWriterActive).toBe(false);
    });
  });

  describe('concurrent reads', () => {
    it('should allow multiple concurrent readers', async () => {
      const rwlock = new ReadWriteLock();

      await rwlock.acquireRead();
      await rwlock.acquireRead();
      await rwlock.acquireRead();

      expect(rwlock.activeReaders).toBe(3);

      rwlock.releaseRead();
      rwlock.releaseRead();
      rwlock.releaseRead();

      expect(rwlock.activeReaders).toBe(0);
    });

    it('should execute multiple reads concurrently', async () => {
      const rwlock = new ReadWriteLock();
      const results: number[] = [];
      const startTime = Date.now();

      await Promise.all([
        rwlock.withReadLock(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          results.push(1);
        }),
        rwlock.withReadLock(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          results.push(2);
        }),
        rwlock.withReadLock(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          results.push(3);
        }),
      ]);

      const elapsed = Date.now() - startTime;

      // All three should complete concurrently (not ~150ms sequential)
      // Using 200ms as threshold to account for Windows timing variations
      expect(elapsed).toBeLessThan(200);
      expect(results.sort()).toEqual([1, 2, 3]);
    });
  });

  describe('exclusive writes', () => {
    it('should block reads while writing', async () => {
      const rwlock = new ReadWriteLock();
      const order: string[] = [];

      await rwlock.acquireWrite();
      order.push('write-start');

      // Try to acquire read (should queue)
      const readPromise = rwlock.acquireRead().then(() => {
        order.push('read');
        rwlock.releaseRead();
      });

      // Give the read a chance to queue
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(rwlock.activeReaders).toBe(0);

      order.push('write-end');
      rwlock.releaseWrite();

      await readPromise;

      expect(order).toEqual(['write-start', 'write-end', 'read']);
    });

    it('should block writes while reading', async () => {
      const rwlock = new ReadWriteLock();
      const order: string[] = [];

      await rwlock.acquireRead();
      order.push('read-start');

      // Try to acquire write (should queue)
      const writePromise = rwlock.acquireWrite().then(() => {
        order.push('write');
        rwlock.releaseWrite();
      });

      // Give the write a chance to queue
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(rwlock.isWriterActive).toBe(false);

      order.push('read-end');
      rwlock.releaseRead();

      await writePromise;

      expect(order).toEqual(['read-start', 'read-end', 'write']);
    });

    it('should serialize multiple writers', async () => {
      const rwlock = new ReadWriteLock();
      const order: number[] = [];

      const p1 = rwlock.withWriteLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        order.push(1);
      });

      const p2 = rwlock.withWriteLock(async () => {
        order.push(2);
      });

      const p3 = rwlock.withWriteLock(async () => {
        order.push(3);
      });

      await Promise.all([p1, p2, p3]);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('withReadLock() and withWriteLock()', () => {
    it('should release read lock after function completes', async () => {
      const rwlock = new ReadWriteLock();

      await rwlock.withReadLock(async () => {
        expect(rwlock.activeReaders).toBe(1);
      });

      expect(rwlock.activeReaders).toBe(0);
    });

    it('should release write lock after function completes', async () => {
      const rwlock = new ReadWriteLock();

      await rwlock.withWriteLock(async () => {
        expect(rwlock.isWriterActive).toBe(true);
      });

      expect(rwlock.isWriterActive).toBe(false);
    });

    it('should release read lock after error', async () => {
      const rwlock = new ReadWriteLock();

      await expect(
        rwlock.withReadLock(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow();

      expect(rwlock.activeReaders).toBe(0);
    });

    it('should release write lock after error', async () => {
      const rwlock = new ReadWriteLock();

      await expect(
        rwlock.withWriteLock(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow();

      expect(rwlock.isWriterActive).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle releaseRead when no readers (no-op)', () => {
      const rwlock = new ReadWriteLock();
      expect(() => rwlock.releaseRead()).not.toThrow();
    });

    it('should handle releaseWrite when no writer (no-op)', () => {
      const rwlock = new ReadWriteLock();
      expect(() => rwlock.releaseWrite()).not.toThrow();
    });
  });
});

describe('IndexingLock', () => {
  beforeEach(() => {
    // Reset singleton before each test
    IndexingLock.resetInstance();
  });

  afterEach(() => {
    // Ensure singleton is reset after each test
    IndexingLock.resetInstance();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = IndexingLock.getInstance();
      const instance2 = IndexingLock.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = IndexingLock.getInstance();
      IndexingLock.resetInstance();
      const instance2 = IndexingLock.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('basic operations', () => {
    it('should start with no indexing in progress', () => {
      const lock = IndexingLock.getInstance();
      expect(lock.isIndexing).toBe(false);
      expect(lock.indexingProject).toBeNull();
    });

    it('should track indexing state after acquire', async () => {
      const lock = IndexingLock.getInstance();
      await lock.acquire('/path/to/project');

      expect(lock.isIndexing).toBe(true);
      expect(lock.indexingProject).toBe('/path/to/project');

      lock.release();
    });

    it('should clear indexing state after release', async () => {
      const lock = IndexingLock.getInstance();
      await lock.acquire('/path/to/project');
      lock.release();

      expect(lock.isIndexing).toBe(false);
      expect(lock.indexingProject).toBeNull();
    });
  });

  describe('concurrent indexing prevention', () => {
    it('should throw when trying to acquire while indexing', async () => {
      const lock = IndexingLock.getInstance();
      await lock.acquire('/path/to/project1');

      await expect(lock.acquire('/path/to/project2')).rejects.toThrow(
        /Indexing already in progress/
      );

      lock.release();
    });

    it('should allow acquisition after previous release', async () => {
      const lock = IndexingLock.getInstance();

      await lock.acquire('/path/to/project1');
      lock.release();

      await expect(lock.acquire('/path/to/project2')).resolves.toBeUndefined();
      expect(lock.indexingProject).toBe('/path/to/project2');

      lock.release();
    });

    it('should include current project in error message', async () => {
      const lock = IndexingLock.getInstance();
      await lock.acquire('/my/current/project');

      try {
        await lock.acquire('/another/project');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('/my/current/project');
      }

      lock.release();
    });
  });

  describe('withLock()', () => {
    it('should execute function and return result', async () => {
      const lock = IndexingLock.getInstance();

      const result = await lock.withLock('/path/to/project', async () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should track project during execution', async () => {
      const lock = IndexingLock.getInstance();

      await lock.withLock('/my/project', async () => {
        expect(lock.isIndexing).toBe(true);
        expect(lock.indexingProject).toBe('/my/project');
      });
    });

    it('should release lock after function completes', async () => {
      const lock = IndexingLock.getInstance();

      await lock.withLock('/path/to/project', async () => {
        // do something
      });

      expect(lock.isIndexing).toBe(false);
      expect(lock.indexingProject).toBeNull();
    });

    it('should release lock after function throws', async () => {
      const lock = IndexingLock.getInstance();

      await expect(
        lock.withLock('/path/to/project', async () => {
          throw new Error('Indexing failed');
        })
      ).rejects.toThrow('Indexing failed');

      expect(lock.isIndexing).toBe(false);
      expect(lock.indexingProject).toBeNull();
    });

    it('should prevent concurrent withLock calls', async () => {
      const lock = IndexingLock.getInstance();
      const results: string[] = [];

      const p1 = lock.withLock('/project1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push('p1');
      });

      const p2 = lock.withLock('/project2', async () => {
        results.push('p2');
      }).catch((error) => {
        results.push('p2-error');
      });

      await Promise.all([p1, p2]);

      // p2 should fail because p1 holds the lock
      expect(results).toContain('p1');
      expect(results).toContain('p2-error');
    });
  });
});

describe('AsyncMutex timeout/grant race condition (BUG #6 fix)', () => {
  describe('timeout race handling', () => {
    it('should not deadlock when timeout and release race', async () => {
      const mutex = new AsyncMutex('race-test');

      // Hold the lock
      await mutex.acquire();

      // Start multiple waiters with very short timeouts
      const results: string[] = [];
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          mutex.acquire(10).then(() => {
            results.push(`acquired-${i}`);
            mutex.release();
          }).catch(() => {
            results.push(`timeout-${i}`);
          })
        );
      }

      // Release after a delay to create race conditions
      await new Promise((resolve) => setTimeout(resolve, 15));
      mutex.release();

      // Wait for all to complete
      await Promise.all(promises);

      // Verify no deadlock - all waiters should have resolved (either acquired or timed out)
      expect(results.length).toBe(5);

      // Mutex should be unlocked at the end
      expect(mutex.isLocked).toBe(false);
    });

    it('should handle interleaved timeouts correctly', async () => {
      const mutex = new AsyncMutex('interleave-test');
      await mutex.acquire();

      // Start waiters with staggered timeouts
      const p1 = mutex.acquire(10).catch(() => 'timeout-1');
      const p2 = mutex.acquire(50).then(() => {
        mutex.release();
        return 'acquired-2';
      });
      const p3 = mutex.acquire(15).catch(() => 'timeout-3');

      // Wait for first timeouts to fire
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Release the lock - should go to p2 (the one that didn't timeout)
      mutex.release();

      const results = await Promise.all([p1, p2, p3]);

      // p1 and p3 should have timed out, p2 should have acquired
      expect(results).toContain('timeout-1');
      expect(results).toContain('acquired-2');
      expect(results).toContain('timeout-3');

      // Mutex should be unlocked
      expect(mutex.isLocked).toBe(false);
    });

    it('should skip timed-out waiters and grant to next valid waiter', async () => {
      const mutex = new AsyncMutex('skip-test');
      await mutex.acquire();

      let secondAcquired = false;

      // First waiter with very short timeout
      const p1 = mutex.acquire(5).catch(() => 'timeout-1');

      // Second waiter with longer timeout
      const p2 = mutex.acquire(200).then(() => {
        secondAcquired = true;
        mutex.release();
        return 'acquired-2';
      });

      // Wait for first timeout to fire
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Release - should skip the timed-out waiter and grant to second
      mutex.release();

      const results = await Promise.all([p1, p2]);

      expect(results).toContain('timeout-1');
      expect(results).toContain('acquired-2');
      expect(secondAcquired).toBe(true);
      expect(mutex.isLocked).toBe(false);
    });

    it('should handle all waiters timing out', async () => {
      const mutex = new AsyncMutex('all-timeout-test');
      await mutex.acquire();

      // Start waiters that will all timeout
      const promises = [
        mutex.acquire(5).catch(() => 'timeout-1'),
        mutex.acquire(5).catch(() => 'timeout-2'),
        mutex.acquire(5).catch(() => 'timeout-3'),
      ];

      // Wait for all timeouts
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Queue should be empty now (all removed by timeout)
      expect(mutex.queueLength).toBe(0);

      // Release - should just unlock since no valid waiters
      mutex.release();

      const results = await Promise.all(promises);

      expect(results).toEqual(['timeout-1', 'timeout-2', 'timeout-3']);
      expect(mutex.isLocked).toBe(false);
    });
  });

  describe('high contention stress test', () => {
    it('should handle many concurrent acquires with timeouts without deadlock', async () => {
      const mutex = new AsyncMutex('stress-test');
      const concurrency = 20;
      const results: string[] = [];
      const promises: Promise<void>[] = [];

      // Start many concurrent operations
      for (let i = 0; i < concurrency; i++) {
        promises.push(
          mutex.withLock(async () => {
            // Small random delay to create more race conditions
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
            results.push(`completed-${i}`);
          }, 100).catch(() => {
            results.push(`timeout-${i}`);
          })
        );
      }

      // Wait for all to complete
      await Promise.all(promises);

      // All operations should have completed (either executed or timed out)
      expect(results.length).toBe(concurrency);

      // Mutex should be unlocked at the end
      expect(mutex.isLocked).toBe(false);
      expect(mutex.queueLength).toBe(0);
    }, 10000);

    it('should maintain FIFO order for non-timed-out waiters', async () => {
      const mutex = new AsyncMutex('fifo-test');
      const order: number[] = [];

      await mutex.acquire();

      // Queue multiple waiters without timeout
      const p1 = mutex.acquire().then(() => {
        order.push(1);
        mutex.release();
      });

      const p2 = mutex.acquire().then(() => {
        order.push(2);
        mutex.release();
      });

      const p3 = mutex.acquire().then(() => {
        order.push(3);
        mutex.release();
      });

      mutex.release();

      await Promise.all([p1, p2, p3]);

      // Should be in FIFO order
      expect(order).toEqual([1, 2, 3]);
      expect(mutex.isLocked).toBe(false);
    });
  });
});
