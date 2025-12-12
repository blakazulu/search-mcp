/**
 * Fingerprints Manager Module
 *
 * Provides file fingerprint tracking for delta detection during incremental indexing:
 * - Maps relative file paths to SHA256 content hashes
 * - Detects which files have changed since last index
 * - Supports atomic saves to prevent corruption
 * - Optimized batch operations for large projects
 */

import * as fs from 'node:fs';
import { getFingerprintsPath, toAbsolutePath, safeJoin } from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';
import { ErrorCode, MCPError, isMCPError } from '../errors/index.js';
import { isSymlink } from '../utils/secureFileAccess.js';
import { safeLoadJSON, MAX_JSON_FILE_SIZE, ResourceLimitError } from '../utils/limits.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Fingerprints map type
 *
 * Maps relative file paths (forward-slash separated) to SHA256 content hashes.
 * - Key: relative path (e.g., "src/index.ts")
 * - Value: SHA256 hash of file content (64 hex characters)
 */
export type Fingerprints = Map<string, string>;

/**
 * Result of delta calculation between stored and current fingerprints
 */
export interface DeltaResult {
  /** Files that exist in current but not in stored fingerprints */
  added: string[];
  /** Files that exist in both but have different hashes */
  modified: string[];
  /** Files that exist in stored but not in current fingerprints */
  removed: string[];
  /** Files that exist in both with the same hash */
  unchanged: string[];
}

/**
 * JSON structure for fingerprints file
 */
interface FingerprintsJSON {
  /** Version for future migrations */
  version: string;
  /** Map of relative path to hash */
  fingerprints: Record<string, string>;
}

// ============================================================================
// Constants
// ============================================================================

/** Current fingerprints file version */
export const FINGERPRINTS_VERSION = '1.0.0';

/** Batch size for parallel hash calculations */
const HASH_BATCH_SIZE = 50;

// ============================================================================
// Fingerprints I/O Functions
// ============================================================================

/**
 * Load fingerprints from an index path
 *
 * Loads fingerprints.json from the index directory.
 * Returns an empty Map if file doesn't exist.
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Fingerprints map (empty if file doesn't exist)
 * @throws MCPError if fingerprints file is corrupt
 *
 * @example
 * ```typescript
 * const fingerprints = await loadFingerprints('/home/user/.mcp/search/indexes/abc123');
 * console.log(fingerprints.size); // Number of tracked files
 * ```
 */
export async function loadFingerprints(indexPath: string): Promise<Fingerprints> {
  const logger = getLogger();
  const fingerprintsPath = getFingerprintsPath(indexPath);

  try {
    // BUG #11 FIX: Use async fs.promises.access instead of sync fs.existsSync
    // Check if fingerprints file exists using async operation
    try {
      await fs.promises.access(fingerprintsPath);
    } catch {
      logger.debug('FingerprintsManager', 'No fingerprints file found, returning empty map', {
        fingerprintsPath,
      });
      return new Map();
    }

    // DoS Protection: Use safe JSON loading with size limit
    const rawData = await safeLoadJSON<FingerprintsJSON>(fingerprintsPath, MAX_JSON_FILE_SIZE);

    // Validate structure
    if (!rawData.fingerprints || typeof rawData.fingerprints !== 'object') {
      throw new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage:
          'The fingerprints file is corrupted. Please rebuild the index using the reindex_project tool.',
        developerMessage: `Invalid fingerprints structure in ${fingerprintsPath}`,
      });
    }

    // Convert object to Map
    const fingerprints = new Map<string, string>(
      Object.entries(rawData.fingerprints)
    );

    logger.debug('FingerprintsManager', 'Fingerprints loaded successfully', {
      fingerprintsPath,
      count: fingerprints.size,
    });

    return fingerprints;
  } catch (error) {
    // Re-throw MCPErrors
    if (isMCPError(error)) {
      throw error;
    }

    // Handle size limit exceeded as corruption
    if (error instanceof ResourceLimitError) {
      throw new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage:
          'The fingerprints file is too large. Please rebuild the index using the reindex_project tool.',
        developerMessage: `Fingerprints file exceeds size limit: ${error.message}`,
        cause: error,
      });
    }

    // Handle JSON parse errors as corruption
    const message = error instanceof Error ? error.message : String(error);
    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage:
        'The fingerprints file is corrupted. Please rebuild the index using the reindex_project tool.',
      developerMessage: `Failed to load fingerprints from ${fingerprintsPath}: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Save fingerprints to an index path
 *
 * Saves the fingerprints to fingerprints.json with atomic write (temp + rename).
 * This prevents partial writes on crash.
 *
 * @param indexPath - Absolute path to the index directory
 * @param fingerprints - Fingerprints map to save
 *
 * @example
 * ```typescript
 * const fingerprints = new Map([['src/index.ts', 'abc123...']]);
 * await saveFingerprints('/path/to/index', fingerprints);
 * ```
 */
export async function saveFingerprints(
  indexPath: string,
  fingerprints: Fingerprints
): Promise<void> {
  const logger = getLogger();
  const fingerprintsPath = getFingerprintsPath(indexPath);

  try {
    // Convert Map to JSON structure
    const data: FingerprintsJSON = {
      version: FINGERPRINTS_VERSION,
      fingerprints: Object.fromEntries(fingerprints),
    };

    // Use atomic write (handles directory creation and temp file cleanup)
    await atomicWriteJson(fingerprintsPath, data);

    logger.debug('FingerprintsManager', 'Fingerprints saved successfully', {
      fingerprintsPath,
      count: fingerprints.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('FingerprintsManager', 'Failed to save fingerprints', {
      fingerprintsPath,
      error: message,
    });
    throw error;
  }
}

// ============================================================================
// Delta Detection Functions
// ============================================================================

/**
 * Calculate delta between stored fingerprints and current files
 *
 * Hashes current files and compares with stored fingerprints to detect:
 * - Added files (in current but not in stored)
 * - Modified files (different hash)
 * - Removed files (in stored but not in current)
 * - Unchanged files (same hash)
 *
 * @param stored - Previously stored fingerprints
 * @param currentFiles - List of relative paths for current files
 * @param projectPath - Absolute path to project root (for file access)
 * @returns Delta result with categorized files
 *
 * @example
 * ```typescript
 * const stored = await loadFingerprints(indexPath);
 * const currentFiles = ['src/index.ts', 'src/utils.ts'];
 * const delta = await calculateDelta(stored, currentFiles, projectPath);
 * console.log(`Added: ${delta.added.length}, Modified: ${delta.modified.length}`);
 * ```
 */
export async function calculateDelta(
  stored: Fingerprints,
  currentFiles: string[],
  projectPath: string
): Promise<DeltaResult> {
  const logger = getLogger();
  const result: DeltaResult = {
    added: [],
    modified: [],
    removed: [],
    unchanged: [],
  };

  // Track which stored files we've seen
  const seenStored = new Set<string>();

  // Process current files in batches for better performance
  const batches: string[][] = [];
  for (let i = 0; i < currentFiles.length; i += HASH_BATCH_SIZE) {
    batches.push(currentFiles.slice(i, i + HASH_BATCH_SIZE));
  }

  for (const batch of batches) {
    // Process batch in parallel
    const hashPromises = batch.map(async (relativePath) => {
      const storedHash = stored.get(relativePath);
      seenStored.add(relativePath);

      // SECURITY: Use safeJoin to prevent path traversal attacks
      const absolutePath = safeJoin(projectPath, relativePath);
      if (absolutePath === null) {
        logger.warn('FingerprintsManager', 'Skipping file with invalid path during delta', {
          path: relativePath,
        });
        // Mark as removed if it was previously indexed (shouldn't happen normally)
        if (storedHash !== undefined) {
          return { path: relativePath, status: 'removed' as const };
        }
        // Skip if never indexed
        return null;
      }

      // SECURITY: Skip symlinks during delta calculation
      try {
        if (await isSymlink(absolutePath)) {
          logger.debug('FingerprintsManager', 'Skipping symlink during delta calculation', {
            path: relativePath,
          });
          // Mark as removed if it was previously indexed
          if (storedHash !== undefined) {
            return { path: relativePath, status: 'removed' as const };
          }
          // Skip if never indexed
          return null;
        }
      } catch {
        // If we can't check, skip it
        return null;
      }

      // If file is not in stored, it's added
      if (storedHash === undefined) {
        return { path: relativePath, status: 'added' as const };
      }

      // Get current file hash
      try {
        const currentHash = await hashFile(absolutePath);

        if (currentHash === storedHash) {
          return { path: relativePath, status: 'unchanged' as const };
        } else {
          return { path: relativePath, status: 'modified' as const };
        }
      } catch (error) {
        // Distinguish between permission errors and transient errors (Bug #25)
        const errorMessage = error instanceof Error ? error.message : String(error);
        const mcpError = error as MCPError;
        const nodeError = error as NodeJS.ErrnoException;

        // Check for symlink errors (security)
        if (mcpError?.code === ErrorCode.SYMLINK_NOT_ALLOWED) {
          logger.debug('FingerprintsManager', 'Symlink rejected during delta calculation', {
            path: relativePath,
          });
          // Mark as removed if it was previously indexed
          return { path: relativePath, status: 'removed' as const };
        }

        // Log permission errors at warn level to make them visible
        if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
          logger.warn('FingerprintsManager', 'Permission denied reading file during delta calculation', {
            path: relativePath,
            error: errorMessage,
            code: nodeError.code,
          });
        } else {
          // Other errors (e.g., ENOENT from race condition) at debug level
          logger.debug('FingerprintsManager', 'File read error during delta, treating as added', {
            path: relativePath,
            error: errorMessage,
            code: nodeError.code,
          });
        }
        // If file can't be read, treat as added (will be hashed during indexing)
        // This handles race conditions where file was deleted between listing and hashing
        return { path: relativePath, status: 'added' as const };
      }
    });

    // Wait for batch to complete
    const batchResults = await Promise.all(hashPromises);

    // Categorize results (filter out null results from skipped files)
    for (const item of batchResults) {
      if (item !== null) {
        result[item.status].push(item.path);
      }
    }
  }

  // Find removed files (in stored but not seen)
  for (const storedPath of stored.keys()) {
    if (!seenStored.has(storedPath)) {
      result.removed.push(storedPath);
    }
  }

  logger.debug('FingerprintsManager', 'Delta calculation complete', {
    added: result.added.length,
    modified: result.modified.length,
    removed: result.removed.length,
    unchanged: result.unchanged.length,
  });

  return result;
}

// ============================================================================
// FingerprintsManager Class
// ============================================================================

/**
 * Fingerprints Manager class for managing file fingerprints
 *
 * Provides:
 * - Loading and caching fingerprints
 * - Saving fingerprints with atomic writes
 * - Single file operations (get, set, delete)
 * - Batch delta calculation and updates
 *
 * @example
 * ```typescript
 * const manager = new FingerprintsManager('/path/to/index', '/path/to/project');
 * await manager.load();
 *
 * // Check for changes
 * const delta = await manager.calculateDelta(['src/index.ts', 'src/utils.ts']);
 * console.log(`Files to reindex: ${delta.added.length + delta.modified.length}`);
 *
 * // Update fingerprints after indexing
 * const newHashes = new Map([['src/index.ts', 'abc123...']]);
 * manager.updateFromDelta(delta, newHashes);
 * await manager.save();
 * ```
 */
export class FingerprintsManager {
  private readonly indexPath: string;
  private readonly projectPath: string;
  private cachedFingerprints: Fingerprints | null = null;
  private lastLoadedAt: number = 0;
  private isDirty: boolean = false;

  /**
   * Create a new FingerprintsManager instance
   *
   * @param indexPath - Absolute path to the index directory
   * @param projectPath - Absolute path to the project root
   */
  constructor(indexPath: string, projectPath: string) {
    this.indexPath = indexPath;
    this.projectPath = projectPath;
  }

  // ==========================================================================
  // I/O Methods
  // ==========================================================================

  /**
   * Load fingerprints from disk
   *
   * Always reads from disk, updating the cache.
   */
  async load(): Promise<void> {
    this.cachedFingerprints = await loadFingerprints(this.indexPath);
    this.lastLoadedAt = Date.now();
    this.isDirty = false;
  }

  /**
   * Save fingerprints to disk
   *
   * Uses atomic write to prevent corruption.
   * Only saves if there are cached fingerprints.
   */
  async save(): Promise<void> {
    if (this.cachedFingerprints === null) {
      throw new Error(
        'No fingerprints to save. Call load() first.'
      );
    }
    await saveFingerprints(this.indexPath, this.cachedFingerprints);
    this.lastLoadedAt = Date.now();
    this.isDirty = false;
  }

  // ==========================================================================
  // Single File Operations
  // ==========================================================================

  /**
   * Get the hash for a file path
   *
   * @param relativePath - Forward-slash separated relative path
   * @returns Hash string or undefined if not found
   */
  get(relativePath: string): string | undefined {
    this.ensureLoaded();
    return this.cachedFingerprints!.get(relativePath);
  }

  /**
   * Set the hash for a file path
   *
   * @param relativePath - Forward-slash separated relative path
   * @param hash - SHA256 hash of file content
   */
  set(relativePath: string, hash: string): void {
    this.ensureLoaded();
    this.cachedFingerprints!.set(relativePath, hash);
    this.isDirty = true;
  }

  /**
   * Delete a file from fingerprints
   *
   * @param relativePath - Forward-slash separated relative path
   * @returns true if the file was deleted, false if it didn't exist
   */
  delete(relativePath: string): boolean {
    this.ensureLoaded();
    const result = this.cachedFingerprints!.delete(relativePath);
    if (result) {
      this.isDirty = true;
    }
    return result;
  }

  /**
   * Check if a file exists in fingerprints
   *
   * @param relativePath - Forward-slash separated relative path
   * @returns true if the file exists in fingerprints
   */
  has(relativePath: string): boolean {
    this.ensureLoaded();
    return this.cachedFingerprints!.has(relativePath);
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Calculate delta between stored and current files
   *
   * Compares stored fingerprints with current file list to detect changes.
   *
   * @param currentFiles - List of relative paths for current files
   * @returns Delta result with categorized files
   */
  async calculateDelta(currentFiles: string[]): Promise<DeltaResult> {
    this.ensureLoaded();
    return calculateDelta(this.cachedFingerprints!, currentFiles, this.projectPath);
  }

  /**
   * Update fingerprints after indexing based on delta
   *
   * - Removes deleted files from fingerprints
   * - Updates added/modified files with new hashes
   *
   * @param delta - Delta result from calculateDelta
   * @param newHashes - Map of relative paths to new hashes for added/modified files
   */
  updateFromDelta(delta: DeltaResult, newHashes: Map<string, string>): void {
    this.ensureLoaded();

    // Remove deleted files
    for (const removedPath of delta.removed) {
      this.cachedFingerprints!.delete(removedPath);
    }

    // Update added and modified files
    for (const [path, hash] of newHashes) {
      this.cachedFingerprints!.set(path, hash);
    }

    this.isDirty = true;
  }

  /**
   * Clear all fingerprints
   *
   * Useful when doing a full reindex.
   */
  clear(): void {
    this.ensureLoaded();
    this.cachedFingerprints!.clear();
    this.isDirty = true;
  }

  /**
   * Set all fingerprints from a map
   *
   * Replaces all existing fingerprints.
   * Useful for full indexing.
   *
   * @param fingerprints - New fingerprints map
   */
  setAll(fingerprints: Fingerprints): void {
    this.cachedFingerprints = new Map(fingerprints);
    this.isDirty = true;
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get all fingerprints
   *
   * Returns a copy of the fingerprints map.
   *
   * @returns Copy of the fingerprints map
   */
  getAll(): Fingerprints {
    this.ensureLoaded();
    return new Map(this.cachedFingerprints!);
  }

  /**
   * Get the number of tracked files
   *
   * @returns Number of files in fingerprints
   */
  count(): number {
    this.ensureLoaded();
    return this.cachedFingerprints!.size;
  }

  /**
   * Check if fingerprints have been loaded
   */
  isLoaded(): boolean {
    return this.cachedFingerprints !== null;
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  /**
   * Get the timestamp of the last load operation
   */
  getLastLoadedAt(): number {
    return this.lastLoadedAt;
  }

  /**
   * Get the path to the fingerprints file
   */
  getFingerprintsPath(): string {
    return getFingerprintsPath(this.indexPath);
  }

  /**
   * Get the index path this manager is associated with
   */
  getIndexPath(): string {
    return this.indexPath;
  }

  /**
   * Get the project path this manager is associated with
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Ensure fingerprints are loaded, throw if not
   */
  private ensureLoaded(): void {
    if (this.cachedFingerprints === null) {
      throw new Error(
        'Fingerprints not loaded. Call load() first.'
      );
    }
  }
}
