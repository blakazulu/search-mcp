/**
 * Dirty Files Manager Module
 *
 * Tracks files pending indexing for lazy/deferred indexing strategies.
 * Persists to disk to survive server restarts.
 *
 * Key features:
 * - Tracks files that need to be indexed (adds/changes)
 * - Tracks file deletions separately using `__deleted__:` prefix
 * - Atomic saves to prevent corruption
 * - Only saves to disk when modified (optimization)
 */

import * as fs from 'node:fs';
import { getDirtyFilesPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';

// ============================================================================
// Types
// ============================================================================

/**
 * JSON structure for dirty files file
 */
interface DirtyFilesJSON {
  /** Version for future migrations */
  version: string;
  /** Array of relative paths (includes __deleted__: prefixed entries) */
  dirtyFiles: string[];
  /** ISO timestamp of last modification */
  lastModified: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Current dirty files file version */
export const DIRTY_FILES_VERSION = '1.0.0';

/** Prefix used to mark deleted files */
export const DELETED_PREFIX = '__deleted__:';

// ============================================================================
// DirtyFilesManager Class
// ============================================================================

/**
 * Dirty Files Manager class for tracking files pending indexing
 *
 * Provides:
 * - Loading and caching dirty files
 * - Saving dirty files with atomic writes
 * - Tracking file additions/modifications
 * - Tracking file deletions (with prefix)
 *
 * @example
 * ```typescript
 * const manager = new DirtyFilesManager('/path/to/index');
 * await manager.load();
 *
 * // Track file changes
 * manager.add('src/modified.ts');
 * manager.markDeleted('src/removed.ts');
 *
 * // Get files to process
 * const dirty = manager.getAll();     // ['src/modified.ts']
 * const deleted = manager.getDeleted(); // ['src/removed.ts']
 *
 * // After processing, clear and save
 * manager.clear();
 * await manager.save();
 * ```
 */
export class DirtyFilesManager {
  private readonly indexPath: string;
  private dirtyFiles: Set<string> = new Set();
  private loaded: boolean = false;
  private modified: boolean = false;

  /**
   * Create a new DirtyFilesManager instance
   *
   * @param indexPath - Absolute path to the index directory
   */
  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  // ==========================================================================
  // I/O Methods
  // ==========================================================================

  /**
   * Load dirty files from disk
   *
   * Always reads from disk, updating the cache.
   * Returns empty set if file doesn't exist.
   */
  async load(): Promise<void> {
    const logger = getLogger();
    const filePath = getDirtyFilesPath(this.indexPath);

    try {
      // Check if dirty files file exists
      if (!fs.existsSync(filePath)) {
        logger.debug('DirtyFilesManager', 'No dirty files found, starting fresh', {
          filePath,
        });
        this.dirtyFiles = new Set();
        this.loaded = true;
        this.modified = false;
        return;
      }

      // Read and parse the dirty files
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as DirtyFilesJSON;

      // Version check for future migrations
      if (data.version !== DIRTY_FILES_VERSION) {
        logger.warn('DirtyFilesManager', 'Version mismatch, starting fresh', {
          expected: DIRTY_FILES_VERSION,
          found: data.version,
        });
        this.dirtyFiles = new Set();
      } else {
        this.dirtyFiles = new Set(data.dirtyFiles);
      }

      this.loaded = true;
      this.modified = false;

      logger.debug('DirtyFilesManager', 'Loaded dirty files', {
        count: this.dirtyFiles.size,
      });
    } catch (error) {
      // Handle JSON parse errors or other issues gracefully
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('DirtyFilesManager', 'Failed to load dirty files, starting fresh', {
        error: message,
      });
      this.dirtyFiles = new Set();
      this.loaded = true;
      this.modified = false;
    }
  }

  /**
   * Save dirty files to disk (only if modified)
   *
   * Uses atomic write to prevent corruption.
   */
  async save(): Promise<void> {
    // Skip save if no changes
    if (!this.modified) {
      return;
    }

    const logger = getLogger();
    const filePath = getDirtyFilesPath(this.indexPath);

    try {
      const data: DirtyFilesJSON = {
        version: DIRTY_FILES_VERSION,
        dirtyFiles: Array.from(this.dirtyFiles),
        lastModified: new Date().toISOString(),
      };

      // Use atomic write (handles directory creation and temp file cleanup)
      await atomicWriteJson(filePath, data);
      this.modified = false;

      logger.debug('DirtyFilesManager', 'Saved dirty files', {
        count: this.dirtyFiles.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('DirtyFilesManager', 'Failed to save dirty files', {
        filePath,
        error: message,
      });
      throw error;
    }
  }

  // ==========================================================================
  // File Tracking Methods
  // ==========================================================================

  /**
   * Add a file to the dirty set
   *
   * Marks a file as needing indexing (for adds and modifications).
   * If the file was previously marked as deleted, removes the deletion marker.
   *
   * @param relativePath - Forward-slash separated relative path
   */
  add(relativePath: string): void {
    // If file was marked as deleted, remove that marker first
    const deletedPath = DELETED_PREFIX + relativePath;
    if (this.dirtyFiles.has(deletedPath)) {
      this.dirtyFiles.delete(deletedPath);
      this.modified = true;
    }

    // Add to dirty set if not already there
    if (!this.dirtyFiles.has(relativePath)) {
      this.dirtyFiles.add(relativePath);
      this.modified = true;
    }
  }

  /**
   * Remove a file from the dirty set
   *
   * Removes a file from tracking (after it has been processed).
   *
   * @param relativePath - Forward-slash separated relative path
   */
  remove(relativePath: string): void {
    if (this.dirtyFiles.has(relativePath)) {
      this.dirtyFiles.delete(relativePath);
      this.modified = true;
    }

    // Also remove any deletion marker if present
    const deletedPath = DELETED_PREFIX + relativePath;
    if (this.dirtyFiles.has(deletedPath)) {
      this.dirtyFiles.delete(deletedPath);
      this.modified = true;
    }
  }

  /**
   * Mark a file as deleted
   *
   * Tracks file deletions using a special prefix.
   * If the file was pending indexing, removes it from the regular dirty set.
   *
   * @param relativePath - Forward-slash separated relative path
   */
  markDeleted(relativePath: string): void {
    // If file was pending indexing, remove it
    if (this.dirtyFiles.has(relativePath)) {
      this.dirtyFiles.delete(relativePath);
      this.modified = true;
    }

    // Add deletion marker
    const deletedPath = DELETED_PREFIX + relativePath;
    if (!this.dirtyFiles.has(deletedPath)) {
      this.dirtyFiles.add(deletedPath);
      this.modified = true;
    }
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get all dirty files (excluding deletion markers)
   *
   * Returns files that need to be indexed (adds/modifications).
   *
   * @returns Array of relative paths
   */
  getAll(): string[] {
    return Array.from(this.dirtyFiles).filter(p => !p.startsWith(DELETED_PREFIX));
  }

  /**
   * Get all deleted files
   *
   * Returns files that need to be removed from the index.
   *
   * @returns Array of relative paths (without the __deleted__: prefix)
   */
  getDeleted(): string[] {
    return Array.from(this.dirtyFiles)
      .filter(p => p.startsWith(DELETED_PREFIX))
      .map(p => p.slice(DELETED_PREFIX.length));
  }

  /**
   * Check if a file is dirty (pending indexing)
   *
   * @param relativePath - Forward-slash separated relative path
   * @returns true if the file is marked as dirty
   */
  has(relativePath: string): boolean {
    return this.dirtyFiles.has(relativePath);
  }

  /**
   * Check if a file is marked as deleted
   *
   * @param relativePath - Forward-slash separated relative path
   * @returns true if the file is marked for deletion
   */
  isDeleted(relativePath: string): boolean {
    return this.dirtyFiles.has(DELETED_PREFIX + relativePath);
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Clear all dirty files
   *
   * Removes all entries (both dirty files and deletion markers).
   */
  clear(): void {
    if (this.dirtyFiles.size > 0) {
      this.dirtyFiles.clear();
      this.modified = true;
    }
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get the total count of tracked items
   *
   * Includes both dirty files and deletion markers.
   *
   * @returns Total number of tracked items
   */
  count(): number {
    return this.dirtyFiles.size;
  }

  /**
   * Get the count of dirty files (excluding deletions)
   *
   * @returns Number of files pending indexing
   */
  dirtyCount(): number {
    return this.getAll().length;
  }

  /**
   * Get the count of deleted files
   *
   * @returns Number of files pending removal
   */
  deletedCount(): number {
    return this.getDeleted().length;
  }

  /**
   * Check if there are any dirty files or deletions
   *
   * @returns true if there are no tracked items
   */
  isEmpty(): boolean {
    return this.dirtyFiles.size === 0;
  }

  /**
   * Check if dirty files have been loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.modified;
  }

  /**
   * Get the path to the dirty files file
   */
  getDirtyFilesPath(): string {
    return getDirtyFilesPath(this.indexPath);
  }

  /**
   * Get the index path this manager is associated with
   */
  getIndexPath(): string {
    return this.indexPath;
  }

  // ==========================================================================
  // Cleanup Methods
  // ==========================================================================

  /**
   * Delete the dirty files file from disk
   *
   * Used when deleting an index or during cleanup.
   */
  async delete(): Promise<void> {
    const filePath = getDirtyFilesPath(this.indexPath);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore if doesn't exist
    }
    this.dirtyFiles.clear();
    this.loaded = false;
    this.modified = false;
  }
}
