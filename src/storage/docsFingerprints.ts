/**
 * Docs Fingerprints Manager Module
 *
 * Provides documentation file fingerprint tracking for delta detection during incremental indexing:
 * - Maps relative file paths to SHA256 content hashes
 * - Detects which doc files have changed since last index
 * - Supports atomic saves to prevent corruption
 * - Optimized batch operations for large projects
 *
 * This is separate from the code fingerprints to enable independent doc updates.
 */

import * as fs from 'node:fs';
import { getDocsFingerprintsPath, toAbsolutePath } from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';
import { ErrorCode, MCPError, isMCPError } from '../errors/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Fingerprints map type
 *
 * Maps relative file paths (forward-slash separated) to SHA256 content hashes.
 * - Key: relative path (e.g., "docs/README.md")
 * - Value: SHA256 hash of file content (64 hex characters)
 */
export type DocsFingerprints = Map<string, string>;

/**
 * Result of delta calculation between stored and current fingerprints
 */
export interface DocsDeltaResult {
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
 * JSON structure for docs fingerprints file
 */
interface DocsFingerprintsJSON {
  /** Version for future migrations */
  version: string;
  /** Map of relative path to hash */
  fingerprints: Record<string, string>;
}

// ============================================================================
// Constants
// ============================================================================

/** Current docs fingerprints file version */
export const DOCS_FINGERPRINTS_VERSION = '1.0.0';

/** Batch size for parallel hash calculations */
const HASH_BATCH_SIZE = 50;

// ============================================================================
// Docs Fingerprints I/O Functions
// ============================================================================

/**
 * Load docs fingerprints from an index path
 *
 * Loads docs-fingerprints.json from the index directory.
 * Returns an empty Map if file doesn't exist.
 *
 * @param indexPath - Absolute path to the index directory
 * @returns DocsFingerprints map (empty if file doesn't exist)
 * @throws MCPError if fingerprints file is corrupt
 *
 * @example
 * ```typescript
 * const fingerprints = await loadDocsFingerprints('/home/user/.mcp/search/indexes/abc123');
 * console.log(fingerprints.size); // Number of tracked doc files
 * ```
 */
export async function loadDocsFingerprints(indexPath: string): Promise<DocsFingerprints> {
  const logger = getLogger();
  const fingerprintsPath = getDocsFingerprintsPath(indexPath);

  try {
    // Check if fingerprints file exists
    if (!fs.existsSync(fingerprintsPath)) {
      logger.debug('DocsFingerprintsManager', 'No docs fingerprints file found, returning empty map', {
        fingerprintsPath,
      });
      return new Map();
    }

    // Read and parse the fingerprints file
    const content = await fs.promises.readFile(fingerprintsPath, 'utf-8');
    const rawData = JSON.parse(content) as DocsFingerprintsJSON;

    // Validate structure
    if (!rawData.fingerprints || typeof rawData.fingerprints !== 'object') {
      throw new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage:
          'The docs fingerprints file is corrupted. Please rebuild the docs index using the reindex_project tool.',
        developerMessage: `Invalid docs fingerprints structure in ${fingerprintsPath}`,
      });
    }

    // Convert object to Map
    const fingerprints = new Map<string, string>(
      Object.entries(rawData.fingerprints)
    );

    logger.debug('DocsFingerprintsManager', 'Docs fingerprints loaded successfully', {
      fingerprintsPath,
      count: fingerprints.size,
    });

    return fingerprints;
  } catch (error) {
    // Re-throw MCPErrors
    if (isMCPError(error)) {
      throw error;
    }

    // Handle JSON parse errors as corruption
    const message = error instanceof Error ? error.message : String(error);
    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage:
        'The docs fingerprints file is corrupted. Please rebuild the docs index using the reindex_project tool.',
      developerMessage: `Failed to load docs fingerprints from ${fingerprintsPath}: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Save docs fingerprints to an index path
 *
 * Saves the fingerprints to docs-fingerprints.json with atomic write (temp + rename).
 * This prevents partial writes on crash.
 *
 * @param indexPath - Absolute path to the index directory
 * @param fingerprints - DocsFingerprints map to save
 *
 * @example
 * ```typescript
 * const fingerprints = new Map([['docs/README.md', 'abc123...']]);
 * await saveDocsFingerprints('/path/to/index', fingerprints);
 * ```
 */
export async function saveDocsFingerprints(
  indexPath: string,
  fingerprints: DocsFingerprints
): Promise<void> {
  const logger = getLogger();
  const fingerprintsPath = getDocsFingerprintsPath(indexPath);

  try {
    // Convert Map to JSON structure
    const data: DocsFingerprintsJSON = {
      version: DOCS_FINGERPRINTS_VERSION,
      fingerprints: Object.fromEntries(fingerprints),
    };

    // Use atomic write (handles directory creation and temp file cleanup)
    await atomicWriteJson(fingerprintsPath, data);

    logger.debug('DocsFingerprintsManager', 'Docs fingerprints saved successfully', {
      fingerprintsPath,
      count: fingerprints.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('DocsFingerprintsManager', 'Failed to save docs fingerprints', {
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
 * Calculate delta between stored fingerprints and current doc files
 *
 * Hashes current files and compares with stored fingerprints to detect:
 * - Added files (in current but not in stored)
 * - Modified files (different hash)
 * - Removed files (in stored but not in current)
 * - Unchanged files (same hash)
 *
 * @param stored - Previously stored fingerprints
 * @param currentFiles - List of relative paths for current doc files
 * @param projectPath - Absolute path to project root (for file access)
 * @returns Delta result with categorized files
 *
 * @example
 * ```typescript
 * const stored = await loadDocsFingerprints(indexPath);
 * const currentFiles = ['docs/README.md', 'docs/API.md'];
 * const delta = await calculateDocsDelta(stored, currentFiles, projectPath);
 * console.log(`Added: ${delta.added.length}, Modified: ${delta.modified.length}`);
 * ```
 */
export async function calculateDocsDelta(
  stored: DocsFingerprints,
  currentFiles: string[],
  projectPath: string
): Promise<DocsDeltaResult> {
  const logger = getLogger();
  const result: DocsDeltaResult = {
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

      // If file is not in stored, it's added
      if (storedHash === undefined) {
        return { path: relativePath, status: 'added' as const };
      }

      // Get current file hash
      try {
        const absolutePath = toAbsolutePath(relativePath, projectPath);
        const currentHash = await hashFile(absolutePath);

        if (currentHash === storedHash) {
          return { path: relativePath, status: 'unchanged' as const };
        } else {
          return { path: relativePath, status: 'modified' as const };
        }
      } catch (error) {
        // If file can't be read, treat as added (will be hashed during indexing)
        // This handles race conditions where file was deleted between listing and hashing
        logger.debug('DocsFingerprintsManager', 'File read error during delta, treating as added', {
          path: relativePath,
          error: error instanceof Error ? error.message : String(error),
        });
        return { path: relativePath, status: 'added' as const };
      }
    });

    // Wait for batch to complete
    const batchResults = await Promise.all(hashPromises);

    // Categorize results
    for (const item of batchResults) {
      result[item.status].push(item.path);
    }
  }

  // Find removed files (in stored but not seen)
  for (const storedPath of stored.keys()) {
    if (!seenStored.has(storedPath)) {
      result.removed.push(storedPath);
    }
  }

  logger.debug('DocsFingerprintsManager', 'Docs delta calculation complete', {
    added: result.added.length,
    modified: result.modified.length,
    removed: result.removed.length,
    unchanged: result.unchanged.length,
  });

  return result;
}

// ============================================================================
// DocsFingerprintsManager Class
// ============================================================================

/**
 * Docs Fingerprints Manager class for managing documentation file fingerprints
 *
 * Provides:
 * - Loading and caching fingerprints
 * - Saving fingerprints with atomic writes
 * - Single file operations (get, set, delete)
 * - Batch delta calculation and updates
 *
 * @example
 * ```typescript
 * const manager = new DocsFingerprintsManager('/path/to/index', '/path/to/project');
 * await manager.load();
 *
 * // Check for changes
 * const delta = await manager.calculateDelta(['docs/README.md', 'docs/API.md']);
 * console.log(`Files to reindex: ${delta.added.length + delta.modified.length}`);
 *
 * // Update fingerprints after indexing
 * const newHashes = new Map([['docs/README.md', 'abc123...']]);
 * manager.updateFromDelta(delta, newHashes);
 * await manager.save();
 * ```
 */
export class DocsFingerprintsManager {
  private readonly indexPath: string;
  private readonly projectPath: string;
  private cachedFingerprints: DocsFingerprints | null = null;
  private lastLoadedAt: number = 0;
  private isDirty: boolean = false;

  /**
   * Create a new DocsFingerprintsManager instance
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
   * Load docs fingerprints from disk
   *
   * Always reads from disk, updating the cache.
   */
  async load(): Promise<void> {
    this.cachedFingerprints = await loadDocsFingerprints(this.indexPath);
    this.lastLoadedAt = Date.now();
    this.isDirty = false;
  }

  /**
   * Save docs fingerprints to disk
   *
   * Uses atomic write to prevent corruption.
   * Only saves if there are cached fingerprints.
   */
  async save(): Promise<void> {
    if (this.cachedFingerprints === null) {
      throw new Error(
        'No docs fingerprints to save. Call load() first.'
      );
    }
    await saveDocsFingerprints(this.indexPath, this.cachedFingerprints);
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
   * Calculate delta between stored and current doc files
   *
   * Compares stored fingerprints with current file list to detect changes.
   *
   * @param currentFiles - List of relative paths for current doc files
   * @returns Delta result with categorized files
   */
  async calculateDelta(currentFiles: string[]): Promise<DocsDeltaResult> {
    this.ensureLoaded();
    return calculateDocsDelta(this.cachedFingerprints!, currentFiles, this.projectPath);
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
  updateFromDelta(delta: DocsDeltaResult, newHashes: Map<string, string>): void {
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
  setAll(fingerprints: DocsFingerprints): void {
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
  getAll(): DocsFingerprints {
    this.ensureLoaded();
    return new Map(this.cachedFingerprints!);
  }

  /**
   * Get the number of tracked doc files
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
   * Get the path to the docs fingerprints file
   */
  getDocsFingerprintsPath(): string {
    return getDocsFingerprintsPath(this.indexPath);
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
        'Docs fingerprints not loaded. Call load() first.'
      );
    }
  }
}
