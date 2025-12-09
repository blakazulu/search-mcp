/**
 * Async Mutex Utility
 *
 * Provides a simple async mutex implementation for protecting critical sections
 * from concurrent access. Useful for serializing access to shared resources
 * like database operations.
 *
 * Features:
 * - FIFO queue ordering for fairness
 * - withLock() for safe lock/unlock with try/finally
 * - isLocked getter for status checks
 * - Optional timeout support to prevent deadlocks
 */

import { getLogger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Function queued for lock acquisition
 */
type QueuedResolver = () => void;

// ============================================================================
// AsyncMutex Class
// ============================================================================

/**
 * Async Mutex for serializing access to critical sections
 *
 * Ensures only one async operation can hold the lock at a time.
 * Uses a FIFO queue for fair ordering of waiting operations.
 *
 * @example
 * ```typescript
 * const mutex = new AsyncMutex();
 *
 * // Using withLock (recommended)
 * await mutex.withLock(async () => {
 *   await criticalOperation();
 * });
 *
 * // Manual acquire/release
 * await mutex.acquire();
 * try {
 *   await criticalOperation();
 * } finally {
 *   mutex.release();
 * }
 * ```
 */
export class AsyncMutex {
  /** Whether the mutex is currently held */
  private locked = false;

  /** Queue of functions waiting for the lock */
  private queue: QueuedResolver[] = [];

  /** Optional name for logging purposes */
  private readonly name: string;

  /**
   * Create a new AsyncMutex
   *
   * @param name - Optional name for logging purposes
   */
  constructor(name?: string) {
    this.name = name ?? 'AsyncMutex';
  }

  /**
   * Check if the mutex is currently locked
   */
  get isLocked(): boolean {
    return this.locked;
  }

  /**
   * Get the number of waiters in the queue
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Acquire the mutex lock
   *
   * If the mutex is already locked, this will wait until it becomes available.
   * Waiters are processed in FIFO order.
   *
   * @param timeout - Optional timeout in milliseconds. If provided and exceeded,
   *                  the promise will reject with an error.
   * @throws Error if timeout is exceeded
   */
  async acquire(timeout?: number): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Create a promise that resolves when we get the lock
    return new Promise<void>((resolve, reject) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const resolveWrapper = () => {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
        resolve();
      };

      this.queue.push(resolveWrapper);

      // Set up timeout if provided
      if (timeout !== undefined && timeout > 0) {
        timeoutHandle = setTimeout(() => {
          // Remove from queue
          const index = this.queue.indexOf(resolveWrapper);
          if (index !== -1) {
            this.queue.splice(index, 1);
            const logger = getLogger();
            logger.warn(this.name, 'Lock acquisition timed out', {
              timeout,
              queueLength: this.queue.length,
            });
            reject(new Error(`Lock acquisition timed out after ${timeout}ms`));
          }
        }, timeout);
      }
    });
  }

  /**
   * Release the mutex lock
   *
   * If there are waiters in the queue, the next one will be given the lock.
   * Otherwise, the mutex becomes unlocked.
   *
   * @throws Error if release is called when the mutex is not locked
   */
  release(): void {
    if (!this.locked) {
      const logger = getLogger();
      logger.warn(this.name, 'release() called when mutex is not locked');
      return;
    }

    const next = this.queue.shift();
    if (next) {
      // Pass the lock to the next waiter
      // Keep locked = true since we're transferring ownership
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute a function while holding the lock
   *
   * This is the recommended way to use the mutex as it ensures
   * the lock is always released, even if the function throws.
   *
   * @param fn - Async function to execute while holding the lock
   * @param timeout - Optional timeout for lock acquisition
   * @returns The result of the function
   *
   * @example
   * ```typescript
   * const result = await mutex.withLock(async () => {
   *   return await db.query('SELECT * FROM users');
   * });
   * ```
   */
  async withLock<T>(fn: () => Promise<T>, timeout?: number): Promise<T> {
    await this.acquire(timeout);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Try to acquire the lock without waiting
   *
   * @returns true if lock was acquired, false if already locked
   */
  tryAcquire(): boolean {
    if (!this.locked) {
      this.locked = true;
      return true;
    }
    return false;
  }
}

// ============================================================================
// Read-Write Lock (optional future enhancement)
// ============================================================================

/**
 * Read-Write Lock for concurrent reads, exclusive writes
 *
 * Allows multiple readers to hold the lock simultaneously,
 * but writers require exclusive access.
 *
 * @example
 * ```typescript
 * const rwlock = new ReadWriteLock();
 *
 * // Multiple reads can happen concurrently
 * await rwlock.withReadLock(async () => {
 *   return await db.query('SELECT * FROM users');
 * });
 *
 * // Writes are exclusive
 * await rwlock.withWriteLock(async () => {
 *   await db.query('INSERT INTO users VALUES (...)');
 * });
 * ```
 */
export class ReadWriteLock {
  /** Number of active readers */
  private readers = 0;

  /** Whether a writer is active or waiting */
  private writerActive = false;

  /** Whether there are writers waiting (for write preference) */
  private writerWaiting = false;

  /** Queue of waiting readers */
  private readerQueue: QueuedResolver[] = [];

  /** Queue of waiting writers */
  private writerQueue: QueuedResolver[] = [];

  /** Optional name for logging purposes */
  private readonly name: string;

  /**
   * Create a new ReadWriteLock
   *
   * @param name - Optional name for logging purposes
   */
  constructor(name?: string) {
    this.name = name ?? 'ReadWriteLock';
  }

  /**
   * Get the number of active readers
   */
  get activeReaders(): number {
    return this.readers;
  }

  /**
   * Check if a writer is active
   */
  get isWriterActive(): boolean {
    return this.writerActive;
  }

  /**
   * Acquire a read lock
   *
   * Multiple readers can hold the lock simultaneously.
   * Readers will wait if a writer is active or waiting.
   */
  async acquireRead(): Promise<void> {
    if (!this.writerActive && !this.writerWaiting) {
      this.readers++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.readerQueue.push(() => {
        this.readers++;
        resolve();
      });
    });
  }

  /**
   * Release a read lock
   */
  releaseRead(): void {
    if (this.readers <= 0) {
      const logger = getLogger();
      logger.warn(this.name, 'releaseRead() called with no active readers');
      return;
    }

    this.readers--;

    // If no more readers and writers are waiting, let a writer in
    if (this.readers === 0 && this.writerQueue.length > 0) {
      this.writerActive = true;
      this.writerWaiting = this.writerQueue.length > 1;
      const next = this.writerQueue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Acquire a write lock
   *
   * Writers require exclusive access - no readers or other writers.
   */
  async acquireWrite(): Promise<void> {
    if (!this.writerActive && this.readers === 0) {
      this.writerActive = true;
      return;
    }

    this.writerWaiting = true;
    return new Promise<void>((resolve) => {
      this.writerQueue.push(resolve);
    });
  }

  /**
   * Release a write lock
   */
  releaseWrite(): void {
    if (!this.writerActive) {
      const logger = getLogger();
      logger.warn(this.name, 'releaseWrite() called with no active writer');
      return;
    }

    this.writerActive = false;
    this.writerWaiting = this.writerQueue.length > 0;

    // If there are waiting readers, let them all in
    if (this.readerQueue.length > 0 && !this.writerWaiting) {
      const readers = this.readerQueue.splice(0);
      for (const reader of readers) {
        reader();
      }
    } else if (this.writerQueue.length > 0) {
      // Otherwise let the next writer in
      this.writerActive = true;
      this.writerWaiting = this.writerQueue.length > 1;
      const next = this.writerQueue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Execute a function while holding a read lock
   *
   * @param fn - Async function to execute while holding the read lock
   * @returns The result of the function
   */
  async withReadLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireRead();
    try {
      return await fn();
    } finally {
      this.releaseRead();
    }
  }

  /**
   * Execute a function while holding a write lock
   *
   * @param fn - Async function to execute while holding the write lock
   * @returns The result of the function
   */
  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireWrite();
    try {
      return await fn();
    } finally {
      this.releaseWrite();
    }
  }
}

// ============================================================================
// Global Indexing Lock
// ============================================================================

/**
 * Global lock for preventing concurrent indexing operations
 *
 * This is a singleton lock used to prevent concurrent create_index
 * or reindex_project operations across the entire application.
 */
export class IndexingLock {
  private static instance: IndexingLock | null = null;

  private readonly mutex = new AsyncMutex('IndexingLock');
  private currentProject: string | null = null;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): IndexingLock {
    if (!IndexingLock.instance) {
      IndexingLock.instance = new IndexingLock();
    }
    return IndexingLock.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    IndexingLock.instance = null;
  }

  /**
   * Check if indexing is currently in progress
   */
  get isIndexing(): boolean {
    return this.mutex.isLocked;
  }

  /**
   * Get the project currently being indexed (if any)
   */
  get indexingProject(): string | null {
    return this.currentProject;
  }

  /**
   * Acquire the indexing lock for a project
   *
   * @param projectPath - Path of the project being indexed
   * @param timeout - Optional timeout in milliseconds
   * @throws Error if another indexing operation is in progress
   */
  async acquire(projectPath: string, timeout?: number): Promise<void> {
    const logger = getLogger();

    if (this.mutex.isLocked) {
      logger.warn('IndexingLock', 'Indexing already in progress', {
        currentProject: this.currentProject,
        requestedProject: projectPath,
      });
      throw new Error(
        `Indexing already in progress for project: ${this.currentProject}. ` +
        'Please wait for the current operation to complete.'
      );
    }

    await this.mutex.acquire(timeout);
    this.currentProject = projectPath;
    logger.debug('IndexingLock', 'Acquired indexing lock', { projectPath });
  }

  /**
   * Release the indexing lock
   */
  release(): void {
    const logger = getLogger();
    const projectPath = this.currentProject;
    this.currentProject = null;
    this.mutex.release();
    logger.debug('IndexingLock', 'Released indexing lock', { projectPath });
  }

  /**
   * Execute a function while holding the indexing lock
   *
   * @param projectPath - Path of the project being indexed
   * @param fn - Async function to execute while holding the lock
   * @param timeout - Optional timeout in milliseconds
   * @returns The result of the function
   */
  async withLock<T>(
    projectPath: string,
    fn: () => Promise<T>,
    timeout?: number
  ): Promise<T> {
    await this.acquire(projectPath, timeout);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
