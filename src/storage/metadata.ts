/**
 * Metadata Manager Module
 *
 * Provides metadata management for index statistics and state tracking:
 * - Zod schema validation for metadata
 * - Version tracking for future migrations
 * - Statistics tracking (files, chunks, storage size)
 * - Timestamp management for index operations
 */

import * as fs from 'node:fs';
import { z } from 'zod';
import { getMetadataPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';
import { ErrorCode, MCPError } from '../errors/index.js';
import { safeLoadJSON, MAX_JSON_FILE_SIZE, ResourceLimitError } from '../utils/limits.js';

// ============================================================================
// Version Constant
// ============================================================================

/**
 * Current metadata version
 *
 * Increment this when making breaking changes to the metadata schema.
 * This allows future migrations to handle older metadata formats.
 */
export const CURRENT_VERSION = '1.0.0';

// ============================================================================
// Metadata Schema
// ============================================================================

/**
 * Schema for index statistics
 */
export const StatsSchema = z.object({
  /** Total number of files indexed */
  totalFiles: z.number().int().nonnegative(),

  /** Total number of chunks created from files */
  totalChunks: z.number().int().nonnegative(),

  /** Total storage size in bytes (includes LanceDB directory) */
  storageSizeBytes: z.number().int().nonnegative(),

  /** Number of chunks that failed to generate embeddings */
  failedEmbeddings: z.number().int().nonnegative().optional(),
});

/**
 * Indexing state values
 */
export type IndexingState = 'complete' | 'in_progress' | 'failed';

/**
 * Schema for indexing state tracking
 */
export const IndexingStateSchema = z.object({
  /** Current state of the indexing operation */
  state: z.enum(['complete', 'in_progress', 'failed']),

  /** ISO 8601 timestamp when indexing started */
  startedAt: z.string().datetime().optional(),

  /** ISO 8601 timestamp of last checkpoint */
  lastCheckpoint: z.string().datetime().optional(),

  /** Total expected files to process (set at scan time) */
  expectedFiles: z.number().int().nonnegative().optional(),

  /** Number of files processed so far */
  processedFiles: z.number().int().nonnegative().optional(),

  /** Error message if indexing failed */
  errorMessage: z.string().optional(),
});

/**
 * Schema for documentation index statistics
 */
export const DocsStatsSchema = z.object({
  /** Total number of documentation files indexed */
  totalDocs: z.number().int().nonnegative(),

  /** Total number of chunks created from documentation files */
  totalDocChunks: z.number().int().nonnegative(),

  /** Total storage size in bytes for docs index */
  docsStorageSizeBytes: z.number().int().nonnegative(),
});

/**
 * Zod schema for metadata validation
 *
 * Validates metadata with required fields for version, project path, and timestamps.
 */
export const MetadataSchema = z.object({
  /** Metadata schema version for migrations */
  version: z.string(),

  /** Absolute path to the project root */
  projectPath: z.string(),

  /** ISO 8601 timestamp when index was first created */
  createdAt: z.string().datetime(),

  /** ISO 8601 timestamp of last full index operation */
  lastFullIndex: z.string().datetime(),

  /** ISO 8601 timestamp of last incremental update (optional) */
  lastIncrementalUpdate: z.string().datetime().optional(),

  /** Index statistics */
  stats: StatsSchema,

  /** Documentation index statistics (optional) */
  docsStats: DocsStatsSchema.optional(),

  /** ISO 8601 timestamp of last documentation index operation (optional) */
  lastDocsIndex: z.string().datetime().optional(),

  /** Indexing state tracking for detecting incomplete indexes */
  indexingState: IndexingStateSchema.optional(),
});

/**
 * Inferred Metadata type from the schema
 */
export type Metadata = z.infer<typeof MetadataSchema>;

/**
 * Inferred Stats type from the schema
 */
export type Stats = z.infer<typeof StatsSchema>;

/**
 * Inferred DocsStats type from the schema
 */
export type DocsStats = z.infer<typeof DocsStatsSchema>;

/**
 * Inferred IndexingStateInfo type from the schema
 */
export type IndexingStateInfo = z.infer<typeof IndexingStateSchema>;

// ============================================================================
// Metadata I/O Functions
// ============================================================================

/**
 * Load metadata from an index path
 *
 * Loads metadata.json from the index directory.
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Metadata object or null if file doesn't exist
 * @throws MCPError if metadata is corrupt or unreadable
 *
 * @example
 * ```typescript
 * const metadata = await loadMetadata('/home/user/.mcp/search/indexes/abc123');
 * if (metadata) {
 *   console.log(metadata.stats.totalFiles);
 * }
 * ```
 */
export async function loadMetadata(indexPath: string): Promise<Metadata | null> {
  const logger = getLogger();
  const metadataPath = getMetadataPath(indexPath);

  try {
    // Check if metadata file exists
    if (!fs.existsSync(metadataPath)) {
      logger.debug('MetadataManager', 'No metadata file found', {
        metadataPath,
      });
      return null;
    }

    // DoS Protection: Use safe JSON loading with size limit
    const rawMetadata = await safeLoadJSON<unknown>(metadataPath, MAX_JSON_FILE_SIZE);

    // Validate against schema
    const result = MetadataSchema.safeParse(rawMetadata);

    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage:
          'The search index metadata is corrupted. Please rebuild it using the reindex_project tool.',
        developerMessage: `Metadata validation failed: ${errors}`,
      });
    }

    logger.debug('MetadataManager', 'Metadata loaded successfully', {
      metadataPath,
      version: result.data.version,
    });
    return result.data;
  } catch (error) {
    // Re-throw MCPErrors
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle size limit exceeded as corruption
    if (error instanceof ResourceLimitError) {
      throw new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage:
          'The search index metadata file is too large. Please rebuild it using the reindex_project tool.',
        developerMessage: `Metadata file exceeds size limit: ${error.message}`,
        cause: error,
      });
    }

    // Handle JSON parse errors as corruption
    const message = error instanceof Error ? error.message : String(error);
    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage:
        'The search index metadata is corrupted. Please rebuild it using the reindex_project tool.',
      developerMessage: `Failed to load metadata from ${metadataPath}: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Save metadata to an index path
 *
 * Saves the metadata to metadata.json with atomic write (temp + rename).
 * This prevents partial writes on crash.
 *
 * @param indexPath - Absolute path to the index directory
 * @param metadata - Metadata to save
 *
 * @example
 * ```typescript
 * await saveMetadata('/path/to/index', metadata);
 * ```
 */
export async function saveMetadata(
  indexPath: string,
  metadata: Metadata
): Promise<void> {
  const logger = getLogger();
  const metadataPath = getMetadataPath(indexPath);

  try {
    // Validate metadata before saving
    const validatedMetadata = MetadataSchema.parse(metadata);

    // Use atomic write (handles directory creation and temp file cleanup)
    await atomicWriteJson(metadataPath, validatedMetadata);

    logger.debug('MetadataManager', 'Metadata saved successfully', {
      metadataPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('MetadataManager', 'Failed to save metadata', {
      metadataPath,
      error: message,
    });
    throw error;
  }
}

/**
 * Create initial metadata for a new index
 *
 * Creates metadata with:
 * - Current version
 * - Current timestamp for createdAt and lastFullIndex
 * - Zero stats
 *
 * @param projectPath - Absolute path to the project root
 * @returns Initial metadata object
 *
 * @example
 * ```typescript
 * const metadata = createMetadata('/Users/dev/my-project');
 * await saveMetadata(indexPath, metadata);
 * ```
 */
export function createMetadata(projectPath: string): Metadata {
  const now = new Date().toISOString();

  return {
    version: CURRENT_VERSION,
    projectPath,
    createdAt: now,
    lastFullIndex: now,
    lastIncrementalUpdate: undefined,
    stats: {
      totalFiles: 0,
      totalChunks: 0,
      storageSizeBytes: 0,
    },
  };
}

// ============================================================================
// MetadataManager Class
// ============================================================================

/**
 * Metadata Manager class for managing index metadata
 *
 * Provides:
 * - Loading and caching metadata
 * - Saving metadata changes with atomic writes
 * - Updating statistics
 * - Marking index operations
 *
 * @example
 * ```typescript
 * const manager = new MetadataManager('/path/to/index');
 * await manager.load();
 *
 * // Update stats after indexing
 * manager.updateStats(100, 500, 1024000);
 * manager.markFullIndex();
 * await manager.save();
 * ```
 */
export class MetadataManager {
  private readonly indexPath: string;
  private cachedMetadata: Metadata | null = null;
  private lastLoadedAt: number = 0;

  /**
   * Create a new MetadataManager instance
   *
   * @param indexPath - Absolute path to the index directory
   */
  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  /**
   * Load metadata from disk
   *
   * Always reads from disk, updating the cache.
   *
   * @returns Metadata object or null if no metadata exists
   * @throws MCPError if metadata is corrupt
   */
  async load(): Promise<Metadata | null> {
    this.cachedMetadata = await loadMetadata(this.indexPath);
    this.lastLoadedAt = Date.now();
    return this.cachedMetadata;
  }

  /**
   * Save metadata to disk
   *
   * Updates both disk and cache with atomic write.
   * Throws if no metadata is loaded.
   */
  async save(): Promise<void> {
    if (this.cachedMetadata === null) {
      throw new Error(
        'No metadata to save. Call load() or initialize() first.'
      );
    }
    await saveMetadata(this.indexPath, this.cachedMetadata);
    this.lastLoadedAt = Date.now();
  }

  /**
   * Check if metadata file exists
   *
   * @returns true if metadata.json exists in the index directory
   */
  async exists(): Promise<boolean> {
    const metadataPath = getMetadataPath(this.indexPath);
    return fs.existsSync(metadataPath);
  }

  /**
   * Initialize metadata for a new index
   *
   * Creates initial metadata and caches it, but does NOT save to disk.
   * Call save() to persist.
   *
   * @param projectPath - Absolute path to the project root
   */
  initialize(projectPath: string): void {
    this.cachedMetadata = createMetadata(projectPath);
    this.lastLoadedAt = Date.now();
  }

  /**
   * Update index statistics
   *
   * Updates the stats in the cached metadata.
   * Call save() to persist changes.
   *
   * @param files - Total number of indexed files
   * @param chunks - Total number of chunks
   * @param sizeBytes - Total storage size in bytes
   */
  updateStats(files: number, chunks: number, sizeBytes: number): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.stats = {
      totalFiles: files,
      totalChunks: chunks,
      storageSizeBytes: sizeBytes,
    };
  }

  /**
   * Mark a full index operation
   *
   * Updates the lastFullIndex timestamp to now.
   * Call save() to persist changes.
   */
  markFullIndex(): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.lastFullIndex = new Date().toISOString();
  }

  /**
   * Mark an incremental update operation
   *
   * Updates the lastIncrementalUpdate timestamp to now.
   * Call save() to persist changes.
   */
  markIncrementalUpdate(): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.lastIncrementalUpdate = new Date().toISOString();
  }

  /**
   * Get cached metadata
   *
   * Returns cached metadata if available.
   * Use this for synchronous access after initial load.
   *
   * @returns Cached metadata or null if not loaded
   */
  getMetadata(): Metadata | null {
    return this.cachedMetadata;
  }

  /**
   * Check if metadata has been loaded
   */
  isLoaded(): boolean {
    return this.cachedMetadata !== null;
  }

  /**
   * Get the timestamp of the last load operation
   */
  getLastLoadedAt(): number {
    return this.lastLoadedAt;
  }

  /**
   * Get the path to the metadata file
   */
  getMetadataPath(): string {
    return getMetadataPath(this.indexPath);
  }

  /**
   * Get the index path this manager is associated with
   */
  getIndexPath(): string {
    return this.indexPath;
  }

  /**
   * Get the project path from metadata
   *
   * Convenience method to get the project path.
   *
   * @returns Project path or null if metadata not loaded
   */
  getProjectPath(): string | null {
    return this.cachedMetadata?.projectPath ?? null;
  }

  /**
   * Get the stats from metadata
   *
   * Convenience method to get statistics.
   *
   * @returns Stats object or null if metadata not loaded
   */
  getStats(): Stats | null {
    return this.cachedMetadata?.stats ?? null;
  }

  /**
   * Get the version from metadata
   *
   * @returns Version string or null if metadata not loaded
   */
  getVersion(): string | null {
    return this.cachedMetadata?.version ?? null;
  }

  /**
   * Update documentation index statistics
   *
   * Updates the docsStats in the cached metadata.
   * Call save() to persist changes.
   *
   * @param docs - Total number of indexed documentation files
   * @param chunks - Total number of documentation chunks
   * @param sizeBytes - Total storage size in bytes for docs index
   */
  updateDocsStats(docs: number, chunks: number, sizeBytes: number): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.docsStats = {
      totalDocs: docs,
      totalDocChunks: chunks,
      docsStorageSizeBytes: sizeBytes,
    };
  }

  /**
   * Mark a documentation index operation
   *
   * Updates the lastDocsIndex timestamp to now.
   * Call save() to persist changes.
   */
  markDocsIndex(): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.lastDocsIndex = new Date().toISOString();
  }

  /**
   * Get the documentation stats from metadata
   *
   * Convenience method to get documentation statistics.
   *
   * @returns DocsStats object or null if metadata not loaded or no docs stats
   */
  getDocsStats(): DocsStats | null {
    return this.cachedMetadata?.docsStats ?? null;
  }

  // ==========================================================================
  // Indexing State Management
  // ==========================================================================

  /**
   * Set the indexing state to in_progress
   *
   * Call this at the start of indexing operations.
   * Call save() to persist changes.
   *
   * @param expectedFiles - Total number of files to be indexed (optional)
   */
  setIndexingInProgress(expectedFiles?: number): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.indexingState = {
      state: 'in_progress',
      startedAt: new Date().toISOString(),
      expectedFiles,
      processedFiles: 0,
    };
  }

  /**
   * Update indexing progress
   *
   * Call this periodically during indexing to track progress.
   * Call save() to persist changes.
   *
   * @param processedFiles - Number of files processed so far
   */
  updateIndexingProgress(processedFiles: number): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    if (!this.cachedMetadata.indexingState) {
      this.cachedMetadata.indexingState = {
        state: 'in_progress',
        startedAt: new Date().toISOString(),
      };
    }

    this.cachedMetadata.indexingState.processedFiles = processedFiles;
    this.cachedMetadata.indexingState.lastCheckpoint = new Date().toISOString();
  }

  /**
   * Set the indexing state to complete
   *
   * Call this when indexing finishes successfully.
   * Call save() to persist changes.
   */
  setIndexingComplete(): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.indexingState = {
      state: 'complete',
      lastCheckpoint: new Date().toISOString(),
    };
  }

  /**
   * Set the indexing state to failed
   *
   * Call this when indexing fails.
   * Call save() to persist changes.
   *
   * @param errorMessage - Description of the failure (optional)
   */
  setIndexingFailed(errorMessage?: string): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    const existing = this.cachedMetadata.indexingState;
    this.cachedMetadata.indexingState = {
      state: 'failed',
      startedAt: existing?.startedAt,
      lastCheckpoint: new Date().toISOString(),
      expectedFiles: existing?.expectedFiles,
      processedFiles: existing?.processedFiles,
      errorMessage,
    };
  }

  /**
   * Get the current indexing state
   *
   * @returns IndexingStateInfo object or null if metadata not loaded or no state
   */
  getIndexingState(): IndexingStateInfo | null {
    return this.cachedMetadata?.indexingState ?? null;
  }

  /**
   * Check if the index is in a complete state
   *
   * @returns true if the indexing state is 'complete' or undefined (legacy indexes)
   */
  isIndexComplete(): boolean {
    if (this.cachedMetadata === null) {
      return false;
    }

    // Legacy indexes without indexingState are considered complete
    if (!this.cachedMetadata.indexingState) {
      return true;
    }

    return this.cachedMetadata.indexingState.state === 'complete';
  }

  /**
   * Check if indexing is currently in progress
   *
   * @returns true if the indexing state is 'in_progress'
   */
  isIndexingInProgress(): boolean {
    return this.cachedMetadata?.indexingState?.state === 'in_progress';
  }

  /**
   * Update the failed embeddings count
   *
   * @param count - Number of failed embeddings
   */
  updateFailedEmbeddings(count: number): void {
    if (this.cachedMetadata === null) {
      throw new Error(
        'Metadata not loaded. Call load() or initialize() first.'
      );
    }

    this.cachedMetadata.stats.failedEmbeddings = count;
  }
}
