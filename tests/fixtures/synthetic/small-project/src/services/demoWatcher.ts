/**
 * File Watcher Service
 *
 * Monitors file system changes and triggers appropriate handlers.
 * Supports watching directories for file additions, modifications, and deletions.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const logger = new Logger('fileWatcher');

export type WatchEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface WatchEvent {
  type: WatchEventType;
  path: string;
  stats?: fs.Stats;
  timestamp: Date;
}

export interface WatcherOptions {
  ignored?: RegExp | string[];
  persistent?: boolean;
  ignoreInitial?: boolean;
  depth?: number;
  awaitWriteFinish?: boolean | { stabilityThreshold: number; pollInterval: number };
}

/**
 * FileWatcher monitors filesystem changes with debouncing and filtering.
 *
 * Features:
 * - Directory watching with recursive support
 * - Pattern-based file filtering
 * - Event debouncing to prevent duplicate notifications
 * - Support for multiple watch targets
 * - Graceful cleanup on shutdown
 *
 * Performance optimization:
 * - Efficient polling intervals
 * - Memory-efficient event queuing
 * - Automatic cleanup of stale watchers
 */
export class FileWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private options: WatcherOptions;
  private pendingEvents: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number = 100;

  constructor(options: WatcherOptions = {}) {
    super();
    this.options = {
      persistent: true,
      ignoreInitial: true,
      depth: Infinity,
      ...options,
    };
  }

  /**
   * Starts watching a path for changes.
   *
   * @param targetPath - Path to watch (file or directory)
   */
  watch(targetPath: string): void {
    const absolutePath = path.resolve(targetPath);

    if (this.watchers.has(absolutePath)) {
      logger.warn('Already watching path', { path: absolutePath });
      return;
    }

    try {
      const stats = fs.statSync(absolutePath);

      if (stats.isDirectory()) {
        this.watchDirectory(absolutePath);
      } else {
        this.watchFile(absolutePath);
      }

      logger.info('Started watching', { path: absolutePath });
    } catch (error) {
      logger.error('Failed to watch path', { path: absolutePath, error });
      throw error;
    }
  }

  /**
   * Watches a directory recursively.
   */
  private watchDirectory(dirPath: string): void {
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const fullPath = path.join(dirPath, filename);

      if (this.shouldIgnore(fullPath)) {
        return;
      }

      this.handleChange(fullPath, eventType as 'rename' | 'change');
    });

    watcher.on('error', (error) => {
      logger.error('Watcher error', { path: dirPath, error });
      this.emit('error', error);
    });

    this.watchers.set(dirPath, watcher);

    // Emit initial events if not ignoring
    if (!this.options.ignoreInitial) {
      this.scanDirectory(dirPath);
    }
  }

  /**
   * Watches a single file.
   */
  private watchFile(filePath: string): void {
    const watcher = fs.watch(filePath, (eventType) => {
      if (!this.shouldIgnore(filePath)) {
        this.handleChange(filePath, eventType as 'rename' | 'change');
      }
    });

    watcher.on('error', (error) => {
      logger.error('Watcher error', { path: filePath, error });
      this.emit('error', error);
    });

    this.watchers.set(filePath, watcher);
  }

  /**
   * Handles file system change events with debouncing.
   */
  private handleChange(filePath: string, eventType: 'rename' | 'change'): void {
    // Debounce rapid events for the same file
    const existingTimeout = this.pendingEvents.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.pendingEvents.delete(filePath);
      this.processChange(filePath, eventType);
    }, this.debounceMs);

    this.pendingEvents.set(filePath, timeout);
  }

  /**
   * Processes a debounced change event.
   */
  private processChange(filePath: string, eventType: 'rename' | 'change'): void {
    try {
      const exists = fs.existsSync(filePath);

      if (!exists) {
        // File was deleted
        const event: WatchEvent = {
          type: 'unlink',
          path: filePath,
          timestamp: new Date(),
        };
        logger.debug('File deleted', { path: filePath });
        this.emit('unlink', event);
        this.emit('all', event);
        return;
      }

      const stats = fs.statSync(filePath);

      if (eventType === 'rename') {
        // New file or directory
        const type: WatchEventType = stats.isDirectory() ? 'addDir' : 'add';
        const event: WatchEvent = {
          type,
          path: filePath,
          stats,
          timestamp: new Date(),
        };
        logger.debug('File added', { path: filePath, isDirectory: stats.isDirectory() });
        this.emit(type, event);
        this.emit('all', event);
      } else {
        // File changed
        const event: WatchEvent = {
          type: 'change',
          path: filePath,
          stats,
          timestamp: new Date(),
        };
        logger.debug('File changed', { path: filePath });
        this.emit('change', event);
        this.emit('all', event);
      }
    } catch (error) {
      logger.error('Error processing change', { path: filePath, error });
    }
  }

  /**
   * Scans a directory and emits events for existing files.
   */
  private scanDirectory(dirPath: string, depth: number = 0): void {
    if (this.options.depth !== undefined && depth > this.options.depth) {
      return;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (this.shouldIgnore(fullPath)) {
          continue;
        }

        const stats = fs.statSync(fullPath);

        if (entry.isDirectory()) {
          const event: WatchEvent = {
            type: 'addDir',
            path: fullPath,
            stats,
            timestamp: new Date(),
          };
          this.emit('addDir', event);
          this.emit('all', event);

          this.scanDirectory(fullPath, depth + 1);
        } else {
          const event: WatchEvent = {
            type: 'add',
            path: fullPath,
            stats,
            timestamp: new Date(),
          };
          this.emit('add', event);
          this.emit('all', event);
        }
      }
    } catch (error) {
      logger.error('Error scanning directory', { path: dirPath, error });
    }
  }

  /**
   * Checks if a path should be ignored.
   */
  private shouldIgnore(filePath: string): boolean {
    const { ignored } = this.options;

    if (!ignored) return false;

    if (ignored instanceof RegExp) {
      return ignored.test(filePath);
    }

    if (Array.isArray(ignored)) {
      return ignored.some((pattern) => {
        if (pattern.startsWith('*')) {
          return filePath.endsWith(pattern.slice(1));
        }
        return filePath.includes(pattern);
      });
    }

    return false;
  }

  /**
   * Stops watching a specific path.
   */
  unwatch(targetPath: string): void {
    const absolutePath = path.resolve(targetPath);
    const watcher = this.watchers.get(absolutePath);

    if (watcher) {
      watcher.close();
      this.watchers.delete(absolutePath);
      logger.info('Stopped watching', { path: absolutePath });
    }
  }

  /**
   * Stops all watchers and cleans up resources.
   */
  close(): void {
    // Clear pending debounce timeouts
    for (const timeout of this.pendingEvents.values()) {
      clearTimeout(timeout);
    }
    this.pendingEvents.clear();

    // Close all watchers
    for (const [watchPath, watcher] of this.watchers) {
      watcher.close();
      logger.debug('Closed watcher', { path: watchPath });
    }
    this.watchers.clear();

    this.removeAllListeners();
    logger.info('File watcher closed');
  }

  /**
   * Gets the list of currently watched paths.
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Checks if a path is being watched.
   */
  isWatching(targetPath: string): boolean {
    return this.watchers.has(path.resolve(targetPath));
  }
}

/**
 * Creates a file watcher with common default options.
 */
export function createFileWatcher(options?: WatcherOptions): FileWatcher {
  return new FileWatcher({
    ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/*.log'],
    ...options,
  });
}
