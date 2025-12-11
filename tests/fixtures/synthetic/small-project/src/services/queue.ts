/**
 * Job Queue Service
 *
 * Provides a simple in-memory job queue with retry support,
 * concurrency control, and job lifecycle management.
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/demoLogger';

const logger = new Logger('queue');

export type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'retrying';

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: unknown;
  priority: number;
}

export interface QueueOptions {
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export type JobHandler<T> = (job: Job<T>) => Promise<unknown>;

/**
 * JobQueue manages asynchronous job processing with reliability features.
 *
 * Features:
 * - Configurable concurrency
 * - Automatic retry with exponential backoff
 * - Job prioritization
 * - Job lifecycle events
 * - Timeout handling
 *
 * Performance optimization:
 * - Efficient job scheduling
 * - Memory-conscious job storage
 * - Concurrent execution
 */
export class JobQueue<T = unknown> extends EventEmitter {
  private jobs: Map<string, Job<T>> = new Map();
  private pending: string[] = [];
  private activeCount = 0;
  private options: Required<QueueOptions>;
  private handlers: Map<string, JobHandler<T>> = new Map();
  private processing = false;
  private paused = false;

  constructor(options: QueueOptions = {}) {
    super();
    this.options = {
      concurrency: options.concurrency ?? 5,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      timeout: options.timeout ?? 30000,
    };
  }

  /**
   * Registers a handler for a job type.
   *
   * @param name - Job type name
   * @param handler - Function to process the job
   */
  process(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler);
    logger.info('Registered job handler', { name });
  }

  /**
   * Adds a job to the queue.
   *
   * @param name - Job type name
   * @param data - Job data
   * @param options - Job options
   * @returns The created job
   */
  add(name: string, data: T, options?: { priority?: number; maxAttempts?: number }): Job<T> {
    const job: Job<T> = {
      id: this.generateJobId(),
      name,
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? this.options.maxRetries,
      createdAt: new Date(),
      priority: options?.priority ?? 0,
    };

    this.jobs.set(job.id, job);
    this.pending.push(job.id);

    // Sort pending by priority (higher priority first)
    this.pending.sort((a, b) => {
      const jobA = this.jobs.get(a)!;
      const jobB = this.jobs.get(b)!;
      return jobB.priority - jobA.priority;
    });

    logger.debug('Job added', { id: job.id, name, priority: job.priority });
    this.emit('added', job);

    // Start processing if not already
    this.processNext();

    return job;
  }

  /**
   * Adds multiple jobs at once.
   *
   * @param jobs - Array of job definitions
   * @returns Array of created jobs
   */
  addBulk(jobs: Array<{ name: string; data: T; priority?: number }>): Job<T>[] {
    return jobs.map((j) => this.add(j.name, j.data, { priority: j.priority }));
  }

  /**
   * Gets a job by ID.
   *
   * @param id - Job ID
   * @returns Job or undefined
   */
  getJob(id: string): Job<T> | undefined {
    return this.jobs.get(id);
  }

  /**
   * Gets all jobs with a specific status.
   *
   * @param status - Job status to filter
   * @returns Array of jobs
   */
  getJobsByStatus(status: JobStatus): Job<T>[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === status);
  }

  /**
   * Removes a completed or failed job.
   *
   * @param id - Job ID
   * @returns True if job was removed
   */
  remove(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'active') {
      logger.warn('Cannot remove active job', { id });
      return false;
    }

    this.jobs.delete(id);
    const pendingIndex = this.pending.indexOf(id);
    if (pendingIndex > -1) {
      this.pending.splice(pendingIndex, 1);
    }

    logger.debug('Job removed', { id });
    return true;
  }

  /**
   * Pauses job processing.
   */
  pause(): void {
    this.paused = true;
    logger.info('Queue paused');
    this.emit('paused');
  }

  /**
   * Resumes job processing.
   */
  resume(): void {
    this.paused = false;
    logger.info('Queue resumed');
    this.emit('resumed');
    this.processNext();
  }

  /**
   * Processes the next pending job.
   */
  private async processNext(): Promise<void> {
    if (this.paused || this.processing) return;
    if (this.activeCount >= this.options.concurrency) return;
    if (this.pending.length === 0) return;

    this.processing = true;

    while (
      !this.paused &&
      this.activeCount < this.options.concurrency &&
      this.pending.length > 0
    ) {
      const jobId = this.pending.shift()!;
      const job = this.jobs.get(jobId);

      if (!job) continue;

      // Check if handler exists
      const handler = this.handlers.get(job.name);
      if (!handler) {
        logger.error('No handler for job', { name: job.name });
        job.status = 'failed';
        job.error = `No handler registered for job type: ${job.name}`;
        this.emit('failed', job);
        continue;
      }

      this.activeCount++;
      this.processJob(job, handler).catch((error) => {
        logger.error('Unexpected error processing job', { id: job.id, error });
      });
    }

    this.processing = false;
  }

  /**
   * Processes a single job.
   */
  private async processJob(job: Job<T>, handler: JobHandler<T>): Promise<void> {
    job.status = 'active';
    job.startedAt = new Date();
    job.attempts++;

    logger.debug('Processing job', { id: job.id, attempt: job.attempts });
    this.emit('active', job);

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(
        () => handler(job),
        this.options.timeout
      );

      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;

      logger.info('Job completed', { id: job.id });
      this.emit('completed', job);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (job.attempts < job.maxAttempts) {
        // Schedule retry
        job.status = 'retrying';
        job.error = errorMessage;

        const delay = this.calculateRetryDelay(job.attempts);
        logger.warn('Job failed, scheduling retry', {
          id: job.id,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          retryIn: delay,
        });

        this.emit('retrying', job);

        setTimeout(() => {
          job.status = 'pending';
          this.pending.push(job.id);
          this.processNext();
        }, delay);
      } else {
        // Max retries reached
        job.status = 'failed';
        job.failedAt = new Date();
        job.error = errorMessage;

        logger.error('Job failed permanently', { id: job.id, error: errorMessage });
        this.emit('failed', job);
      }
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  /**
   * Executes a function with timeout.
   */
  private executeWithTimeout<R>(fn: () => Promise<R>, timeout: number): Promise<R> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Calculates retry delay with exponential backoff.
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: base * 2^attempt with jitter
    const base = this.options.retryDelay;
    const exponential = base * Math.pow(2, attempt - 1);
    const jitter = Math.random() * base;
    return Math.min(exponential + jitter, 60000); // Cap at 1 minute
  }

  /**
   * Generates a unique job ID.
   */
  private generateJobId(): string {
    return `job_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets queue statistics.
   */
  getStats(): {
    pending: number;
    active: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const jobs = Array.from(this.jobs.values());
    return {
      pending: jobs.filter((j) => j.status === 'pending' || j.status === 'retrying').length,
      active: this.activeCount,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      total: this.jobs.size,
    };
  }

  /**
   * Clears completed and failed jobs.
   */
  clean(): number {
    let cleaned = 0;

    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        this.jobs.delete(id);
        cleaned++;
      }
    }

    logger.info('Cleaned jobs', { count: cleaned });
    return cleaned;
  }

  /**
   * Waits for all jobs to complete.
   */
  async drain(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.pending.length === 0 && this.activeCount === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Closes the queue and rejects pending jobs.
   */
  close(): void {
    this.pause();

    for (const job of this.jobs.values()) {
      if (job.status === 'pending' || job.status === 'retrying') {
        job.status = 'failed';
        job.error = 'Queue closed';
        this.emit('failed', job);
      }
    }

    this.removeAllListeners();
    logger.info('Queue closed');
  }
}
