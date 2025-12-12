/**
 * LanceDB Store Module
 *
 * Vector database wrapper using LanceDB for storing and searching code chunk embeddings.
 * This is the core storage component that enables semantic search capabilities.
 *
 * Features:
 * - Vector similarity search with configurable top-k results
 * - Batch insert for efficient indexing
 * - Delete by file path for incremental updates
 * - Path pattern matching for file-based queries
 * - Stale lockfile detection and cleanup
 */

import * as lancedb from '@lancedb/lancedb';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { getLogger } from '../utils/logger.js';
import { registerCleanup, unregisterCleanup, CleanupHandler } from '../utils/cleanup.js';
import { MCPError, ErrorCode, indexNotFound, indexCorrupt } from '../errors/index.js';
import { getLanceDbPath } from '../utils/paths.js';
import { escapeSqlString, globToSafeLikePattern } from '../utils/sql.js';
import { AsyncMutex } from '../utils/asyncMutex.js';
import {
  CODE_EMBEDDING_DIMENSION,
  DOCS_EMBEDDING_DIMENSION,
} from '../engines/embedding.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Record structure for chunks stored in LanceDB
 *
 * This matches the RFC specification for the database schema.
 * The index signature is required for LanceDB compatibility.
 */
export interface ChunkRecord {
  /** UUIDv4 unique identifier for the chunk */
  id: string;
  /** Relative file path (forward-slash separated) */
  path: string;
  /** Chunk content text */
  text: string;
  /** Float32[384] embedding vector */
  vector: number[];
  /** Start line in source file (1-indexed) */
  start_line: number;
  /** End line in source file (1-indexed) */
  end_line: number;
  /** SHA256 hash of the source file content */
  content_hash: string;
  /** Index signature for LanceDB compatibility */
  [key: string]: string | number | number[];
}

/**
 * Search result structure returned from vector search
 */
export interface SearchResult {
  /** Relative file path */
  path: string;
  /** Chunk content text */
  text: string;
  /** Similarity score (0.0 - 1.0, higher is more similar) */
  score: number;
  /** Start line in source file */
  startLine: number;
  /** End line in source file */
  endLine: number;
}

/**
 * Internal structure for raw search results from LanceDB
 */
interface RawSearchResult {
  id: string;
  path: string;
  text: string;
  vector: number[];
  start_line: number;
  end_line: number;
  content_hash: string;
  _distance: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Name of the table storing project chunks */
const TABLE_NAME = 'project_docs';

/**
 * @deprecated Use CODE_VECTOR_DIMENSION or DOCS_VECTOR_DIMENSION instead.
 * Default embedding vector dimension (kept for backward compatibility)
 */
const VECTOR_DIMENSION = CODE_EMBEDDING_DIMENSION;

/** Vector dimension for code embeddings (384 dims from BGE-small model) */
const CODE_VECTOR_DIMENSION = CODE_EMBEDDING_DIMENSION;

/** Vector dimension for docs embeddings (768 dims from BGE-base model) */
const DOCS_VECTOR_DIMENSION = DOCS_EMBEDDING_DIMENSION;

/** Batch size for insert operations */
const INSERT_BATCH_SIZE = 500;

/** Lock file pattern for detection */
const LOCK_FILE_PATTERN = '*.lock';

// ============================================================================
// Helper Functions
// ============================================================================

/** Stale lockfile threshold in milliseconds (5 minutes) */
const STALE_LOCKFILE_AGE_MS = 5 * 60 * 1000;

/**
 * Detect and remove stale lockfiles in the database directory
 *
 * Uses async file operations with proper TOCTOU mitigation:
 * 1. First checks if directory exists using async access
 * 2. Opens lockfile with 'r+' mode to verify no one else is using it
 * 3. Only deletes after successfully acquiring the file handle
 *
 * @param dbPath - Path to the LanceDB directory
 */
async function cleanupStaleLockfiles(dbPath: string): Promise<void> {
  const logger = getLogger();

  // Check if directory exists using async operation
  try {
    await fs.promises.access(dbPath);
  } catch {
    // Directory doesn't exist - nothing to clean up
    return;
  }

  try {
    const lockFiles = await glob('**/*.lock', {
      cwd: dbPath,
      absolute: true,
      nodir: true,
    });

    for (const lockFile of lockFiles) {
      try {
        // Use async stat to check if lockfile is stale
        const stats = await fs.promises.stat(lockFile);
        const ageMs = Date.now() - stats.mtimeMs;

        if (ageMs > STALE_LOCKFILE_AGE_MS) {
          // TOCTOU mitigation: Try to open the file with read/write access
          // to verify no one else has it open before deleting.
          // This reduces the race window but doesn't eliminate it entirely.
          // However, it's much safer than the previous approach.
          let fd: fs.promises.FileHandle | null = null;
          try {
            fd = await fs.promises.open(lockFile, 'r+');
            // Successfully opened - safe to close and delete
            await fd.close();
            fd = null;
            await fs.promises.unlink(lockFile);
            logger.warn('lancedb', `Removed stale lockfile: ${lockFile}`, {
              ageMinutes: Math.round(ageMs / 60000),
            });
          } catch (openError) {
            // Could not open file - someone else might be using it
            // or it was already deleted. Either way, skip it.
            if (fd) {
              await fd.close().catch(() => {});
            }
            const code = (openError as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
              logger.debug('lancedb', `Could not acquire lockfile for cleanup: ${lockFile}`);
            }
          }
        }
      } catch (error) {
        // ENOENT is fine - file was already deleted
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          logger.debug('lancedb', `Could not process lockfile: ${lockFile}`);
        }
      }
    }
  } catch (error) {
    // Ignore glob errors
    logger.debug('lancedb', 'Error scanning for lockfiles', { error });
  }
}

/**
 * Normalize distance to similarity score (0.0 - 1.0)
 *
 * LanceDB returns L2 distance where smaller is better.
 * We convert to similarity score where larger is better.
 *
 * @param distance - L2 distance from LanceDB
 * @returns Similarity score (0.0 - 1.0)
 */
function distanceToScore(distance: number): number {
  // For L2 distance, use formula: score = 1 / (1 + distance)
  // This maps distance 0 -> score 1, distance infinity -> score 0
  return 1 / (1 + distance);
}

/**
 * Convert a glob pattern to SQL LIKE pattern
 *
 * @deprecated Use globToSafeLikePattern from utils/sql.ts for better SQL injection protection.
 * This function is kept for backward compatibility but does not properly escape
 * LIKE wildcards (%, _, [) in literal parts of the pattern.
 *
 * @param globPattern - Glob pattern (e.g., "*.ts", "src/*.ts")
 * @returns SQL LIKE pattern
 */
function globToLikePattern(globPattern: string): string {
  // Use the new safe implementation
  return globToSafeLikePattern(globPattern);
}

// ============================================================================
// LanceDBStore Class
// ============================================================================

/**
 * LanceDB Store wrapper for vector search operations
 *
 * Provides a high-level interface for storing and searching code chunk embeddings.
 * Handles database lifecycle, CRUD operations, and vector similarity search.
 *
 * @example
 * ```typescript
 * // Use default dimension (384 for code)
 * const store = new LanceDBStore('/path/to/index');
 * await store.open();
 *
 * // Or specify a custom dimension
 * const docsStore = new LanceDBStore('/path/to/index', DOCS_VECTOR_DIMENSION);
 * await docsStore.open();
 *
 * // Insert chunks
 * await store.insertChunks(chunks);
 *
 * // Search
 * const results = await store.search(queryVector, 10);
 *
 * await store.close();
 * ```
 */
export class LanceDBStore {
  private indexPath: string;
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private isOpen: boolean = false;

  /** The vector dimension for this store */
  private readonly vectorDimension: number;

  /** Mutex for protecting concurrent database operations */
  private readonly mutex = new AsyncMutex('LanceDBStore');

  /** Reference to cleanup handler for unregistration */
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Create a new LanceDBStore instance
   *
   * @param indexPath - Path to the index directory (e.g., ~/.mcp/search/indexes/<hash>)
   * @param vectorDimension - Dimension of embedding vectors (defaults to CODE_VECTOR_DIMENSION = 384)
   */
  constructor(indexPath: string, vectorDimension: number = CODE_VECTOR_DIMENSION) {
    this.indexPath = indexPath;
    this.dbPath = getLanceDbPath(indexPath);
    this.vectorDimension = vectorDimension;
  }

  /**
   * Get the vector dimension for this store
   * @returns The dimension of embedding vectors used by this store
   */
  getVectorDimension(): number {
    return this.vectorDimension;
  }

  // --------------------------------------------------------------------------
  // Lifecycle Methods
  // --------------------------------------------------------------------------

  /**
   * Open the database connection
   *
   * Creates the database directory if it doesn't exist.
   * Cleans up any stale lockfiles before connecting.
   * Creates the table with correct schema if it doesn't exist.
   */
  async open(): Promise<void> {
    const logger = getLogger();

    if (this.isOpen) {
      logger.debug('lancedb', 'Database already open');
      return;
    }

    try {
      // Ensure database directory exists (using async operations)
      try {
        await fs.promises.access(this.dbPath);
      } catch {
        await fs.promises.mkdir(this.dbPath, { recursive: true });
        logger.info('lancedb', `Created database directory: ${this.dbPath}`);
      }

      // Clean up stale lockfiles
      await cleanupStaleLockfiles(this.dbPath);

      // Connect to database
      this.db = await lancedb.connect(this.dbPath);
      logger.debug('lancedb', `Connected to database: ${this.dbPath}`);

      // Check if table exists and open/create it
      const tableNames = await this.db.tableNames();

      if (tableNames.includes(TABLE_NAME)) {
        this.table = await this.db.openTable(TABLE_NAME);
        logger.debug('lancedb', `Opened existing table: ${TABLE_NAME}`);
      } else {
        // Create table with empty initial data and schema
        // LanceDB requires at least one record or schema to create a table
        // We'll create it lazily on first insert
        this.table = null;
        logger.debug('lancedb', 'Table will be created on first insert');
      }

      this.isOpen = true;

      // Register cleanup handler for graceful shutdown
      this.cleanupHandler = async () => {
        await this.close();
      };
      registerCleanup(this.cleanupHandler, 'LanceDBStore');

      logger.info('lancedb', 'Database opened successfully');
    } catch (error) {
      const err = error as Error;
      logger.error('lancedb', `Failed to open database: ${err.message}`);
      throw new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage:
          'Failed to open the search index. It may be corrupted. Try rebuilding it with reindex_project.',
        developerMessage: `Failed to open LanceDB at ${this.dbPath}: ${err.message}`,
        cause: err,
      });
    }
  }

  /**
   * Close the database connection
   *
   * Safe to call multiple times - will be a no-op if already closed.
   */
  async close(): Promise<void> {
    const logger = getLogger();

    if (!this.isOpen) {
      return;
    }

    // Unregister cleanup handler (avoid double cleanup)
    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    // LanceDB doesn't have an explicit close method for local connections
    // We just clear our references
    this.db = null;
    this.table = null;
    this.isOpen = false;

    logger.debug('lancedb', 'Database connection closed');
  }

  /**
   * Delete the entire database
   *
   * Removes all data and the database directory.
   * The store will be closed after this operation.
   */
  async delete(): Promise<void> {
    const logger = getLogger();

    await this.close();

    try {
      await fs.promises.rm(this.dbPath, { recursive: true, force: true });
      logger.info('lancedb', `Deleted database: ${this.dbPath}`);
    } catch (error) {
      // ENOENT is fine - directory was already deleted
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Ensure the database is open
   */
  private ensureOpen(): void {
    if (!this.isOpen || !this.db) {
      throw indexNotFound(this.indexPath);
    }
  }

  /**
   * Ensure the table exists, creating it if necessary with initial data
   */
  private async ensureTable(initialData?: ChunkRecord[]): Promise<lancedb.Table> {
    this.ensureOpen();

    if (this.table) {
      return this.table;
    }

    if (!this.db) {
      throw indexNotFound(this.indexPath);
    }

    const logger = getLogger();

    if (!initialData || initialData.length === 0) {
      throw new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage: 'No data to initialize the search index.',
        developerMessage: 'Cannot create table without initial data',
      });
    }

    // Create table with initial data
    this.table = await this.db.createTable(TABLE_NAME, initialData);
    logger.info('lancedb', `Created table: ${TABLE_NAME}`);

    return this.table;
  }

  /**
   * Get the table, throwing if it doesn't exist
   */
  private async getTable(): Promise<lancedb.Table> {
    this.ensureOpen();

    if (!this.table) {
      throw indexNotFound(this.indexPath);
    }

    return this.table;
  }

  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  /**
   * Insert chunks into the database
   *
   * Handles large batches efficiently by splitting into smaller batches.
   * Creates the table on first insert if it doesn't exist.
   * Protected by mutex to prevent concurrent write operations.
   *
   * @param chunks - Array of chunk records to insert
   */
  async insertChunks(chunks: ChunkRecord[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    return this.mutex.withLock(async () => {
      const logger = getLogger();
      logger.info('lancedb', `Inserting ${chunks.length} chunks`);

      // If table doesn't exist, create it with first batch
      if (!this.table) {
        const firstBatch = chunks.slice(0, INSERT_BATCH_SIZE);
        await this.ensureTable(firstBatch);

        // If there's more data, add the rest
        if (chunks.length > INSERT_BATCH_SIZE) {
          const remaining = chunks.slice(INSERT_BATCH_SIZE);
          await this.insertChunksInternal(remaining);
        }
      } else {
        await this.insertChunksInternal(chunks);
      }

      logger.debug('lancedb', `Inserted ${chunks.length} chunks successfully`);
    });
  }

  /**
   * Internal method to insert chunks in batches
   */
  private async insertChunksInternal(chunks: ChunkRecord[]): Promise<void> {
    const table = await this.getTable();
    const logger = getLogger();

    // Insert in batches
    for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
      await table.add(batch);

      if (i + INSERT_BATCH_SIZE < chunks.length) {
        logger.debug('lancedb', `Inserted batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1}`);
      }
    }
  }

  /**
   * Delete all chunks for a given file path
   * Protected by mutex to prevent concurrent write operations.
   *
   * @param relativePath - Relative path of the file (forward-slash separated)
   * @returns Number of chunks deleted
   */
  async deleteByPath(relativePath: string): Promise<number> {
    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      // Escape the path to prevent SQL injection
      const escapedPath = escapeSqlString(relativePath);
      const whereClause = `path = '${escapedPath}'`;

      // Get count before delete
      const beforeCount = await table.countRows(whereClause);

      if (beforeCount === 0) {
        return 0;
      }

      // Delete chunks
      await table.delete(whereClause);

      logger.debug('lancedb', `Deleted ${beforeCount} chunks for path: ${relativePath}`);
      return beforeCount;
    });
  }

  /**
   * Get list of all indexed file paths
   * Protected by mutex to ensure consistent reads during concurrent operations.
   * Uses limit to avoid unbounded memory usage (Bug #11).
   *
   * @param limit - Maximum number of unique paths to return (default: 10000)
   * @returns Array of unique file paths
   */
  async getIndexedFiles(limit: number = 10000): Promise<string[]> {
    // Check if table exists (no need for lock for this quick check)
    if (!this.table) {
      return [];
    }

    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      // Query records with limit to avoid unbounded memory usage (Bug #11)
      // Note: LanceDB Query API doesn't support offset, so we use limit
      // and process results incrementally
      const uniquePaths = new Set<string>();

      try {
        // Get results with a reasonable limit to avoid loading everything at once
        // We request more than the limit to account for duplicates
        const maxResults = Math.min(limit * 10, 100000);
        const results = (await table
          .query()
          .select(['path'])
          .limit(maxResults)
          .toArray()) as unknown as { path: string }[];

        for (const result of results) {
          uniquePaths.add(result.path);
          if (uniquePaths.size >= limit) {
            break;
          }
        }
      } catch (error) {
        // Fallback to unbounded query if limited query fails
        logger.debug('lancedb', 'Limited query failed, falling back', { error });
        const allResults = (await table
          .query()
          .select(['path'])
          .toArray()) as unknown as { path: string }[];
        for (const result of allResults) {
          uniquePaths.add(result.path);
          if (uniquePaths.size >= limit) {
            break;
          }
        }
      }

      return Array.from(uniquePaths).sort();
    });
  }

  /**
   * Count total number of chunks in the database
   *
   * @returns Total chunk count
   */
  async countChunks(): Promise<number> {
    if (!this.table) {
      return 0;
    }

    const table = await this.getTable();
    return table.countRows();
  }

  /**
   * Count number of unique indexed files
   *
   * @returns Number of unique files
   */
  async countFiles(): Promise<number> {
    const files = await this.getIndexedFiles();
    return files.length;
  }

  // --------------------------------------------------------------------------
  // Search Operations
  // --------------------------------------------------------------------------

  /**
   * Perform vector similarity search
   * Protected by mutex to prevent reads during concurrent write operations.
   *
   * @param queryVector - Query embedding vector (dimension must match store's vectorDimension)
   * @param topK - Maximum number of results to return (default: 10)
   * @returns Search results sorted by similarity score (descending)
   */
  async search(queryVector: number[], topK: number = 10): Promise<SearchResult[]> {
    if (!this.table) {
      return [];
    }

    // Validate vector dimension against this store's configured dimension
    if (queryVector.length !== this.vectorDimension) {
      throw new MCPError({
        code: ErrorCode.INVALID_PATTERN,
        userMessage: 'Invalid search query.',
        developerMessage: `Query vector dimension mismatch. Expected ${this.vectorDimension}, got ${queryVector.length}`,
      });
    }

    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      logger.debug('lancedb', `Searching with topK=${topK}`);

      // Perform vector search
      const rawResults = (await table
        .vectorSearch(queryVector)
        .limit(topK)
        .toArray()) as unknown as RawSearchResult[];

      // Convert to SearchResult format
      const results: SearchResult[] = rawResults.map((row) => ({
        path: row.path,
        text: row.text,
        score: distanceToScore(row._distance),
        startLine: row.start_line,
        endLine: row.end_line,
      }));

      logger.debug('lancedb', `Search returned ${results.length} results`);
      return results;
    });
  }

  /**
   * Search for files matching a glob pattern
   * Protected by mutex to ensure consistent reads during concurrent operations.
   *
   * @param pattern - Glob pattern (e.g., "*.ts", "src/*.ts")
   * @param limit - Maximum number of results (default: 20)
   * @returns Array of matching file paths
   */
  async searchByPath(pattern: string, limit: number = 20): Promise<string[]> {
    if (!this.table) {
      return [];
    }

    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      // Convert glob pattern to SQL LIKE pattern with proper escaping
      const likePattern = globToSafeLikePattern(pattern);
      logger.debug('lancedb', `Searching paths with pattern: ${pattern} -> ${likePattern}`);

      try {
        // Query with path filter
        const results = (await table
          .query()
          .where(`path LIKE '${likePattern}'`)
          .select(['path'])
          .toArray()) as unknown as { path: string }[];

        // Get unique paths
        const uniquePaths = new Set<string>();
        for (const result of results) {
          uniquePaths.add(result.path);
          if (uniquePaths.size >= limit) {
            break;
          }
        }

        const paths = Array.from(uniquePaths).sort().slice(0, limit);
        logger.debug('lancedb', `Path search returned ${paths.length} files`);
        return paths;
      } catch (error) {
        const err = error as Error;
        logger.error('lancedb', `Path search failed: ${err.message}`);
        throw new MCPError({
          code: ErrorCode.INVALID_PATTERN,
          userMessage: 'Invalid path pattern.',
          developerMessage: `Path search failed for pattern "${pattern}": ${err.message}`,
          cause: err,
        });
      }
    });
  }

  // --------------------------------------------------------------------------
  // Hybrid Search Support (SMCP-061)
  // --------------------------------------------------------------------------

  /**
   * Retrieve chunks by their IDs
   * Used for hybrid search result fusion.
   *
   * @param ids - Array of chunk IDs to retrieve
   * @returns Map of ID to SearchResult (for found chunks)
   */
  async getChunksById(ids: string[]): Promise<Map<string, SearchResult>> {
    const result = new Map<string, SearchResult>();

    if (!this.table || ids.length === 0) {
      return result;
    }

    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      logger.debug('lancedb', `Retrieving ${ids.length} chunks by ID`);

      // Build SQL IN clause with escaped IDs
      const escapedIds = ids.map((id) => `'${escapeSqlString(id)}'`).join(', ');
      const whereClause = `id IN (${escapedIds})`;

      try {
        const rows = (await table
          .query()
          .where(whereClause)
          .select(['id', 'path', 'text', 'start_line', 'end_line'])
          .toArray()) as unknown as Array<{
          id: string;
          path: string;
          text: string;
          start_line: number;
          end_line: number;
        }>;

        for (const row of rows) {
          result.set(row.id, {
            path: row.path,
            text: row.text,
            score: 0, // Score will be set by hybrid search
            startLine: row.start_line,
            endLine: row.end_line,
          });
        }

        logger.debug('lancedb', `Retrieved ${result.size} chunks by ID`);
      } catch (error) {
        const err = error as Error;
        logger.error('lancedb', `getChunksById failed: ${err.message}`);
        // Return empty map on error - non-critical for hybrid search
      }

      return result;
    });
  }

  /**
   * Get all chunk IDs from the store
   * Used for FTS index rebuilding.
   *
   * @returns Array of all chunk IDs
   */
  async getAllChunkIds(): Promise<string[]> {
    if (!this.table) {
      return [];
    }

    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      logger.debug('lancedb', 'Retrieving all chunk IDs');

      try {
        const rows = (await table
          .query()
          .select(['id'])
          .toArray()) as unknown as Array<{ id: string }>;

        return rows.map((r) => r.id);
      } catch (error) {
        const err = error as Error;
        logger.error('lancedb', `getAllChunkIds failed: ${err.message}`);
        return [];
      }
    });
  }

  /**
   * Get all chunks with their text content
   * Used for FTS index rebuilding.
   *
   * @returns Array of {id, path, text} objects
   */
  async getAllChunksForFTS(): Promise<Array<{ id: string; path: string; text: string }>> {
    if (!this.table) {
      return [];
    }

    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      logger.debug('lancedb', 'Retrieving all chunks for FTS');

      try {
        const rows = (await table
          .query()
          .select(['id', 'path', 'text'])
          .toArray()) as unknown as Array<{ id: string; path: string; text: string }>;

        logger.debug('lancedb', `Retrieved ${rows.length} chunks for FTS`);
        return rows;
      } catch (error) {
        const err = error as Error;
        logger.error('lancedb', `getAllChunksForFTS failed: ${err.message}`);
        return [];
      }
    });
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get the storage size of the database in bytes
   *
   * Uses async file operations to avoid blocking the event loop.
   *
   * @returns Size in bytes
   */
  async getStorageSize(): Promise<number> {
    try {
      await fs.promises.access(this.dbPath);
    } catch {
      return 0;
    }

    let totalSize = 0;

    const calculateSize = async (dirPath: string): Promise<void> => {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await calculateSize(fullPath);
        } else {
          const stats = await fs.promises.stat(fullPath);
          totalSize += stats.size;
        }
      }
    };

    await calculateSize(this.dbPath);
    return totalSize;
  }

  /**
   * Check if the store has been opened
   */
  get opened(): boolean {
    return this.isOpen;
  }

  /**
   * Check if the table exists and has data
   */
  async hasData(): Promise<boolean> {
    if (!this.table) {
      return false;
    }

    try {
      const count = await this.countChunks();
      return count > 0;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Module Exports
// ============================================================================

export {
  TABLE_NAME,
  VECTOR_DIMENSION,
  CODE_VECTOR_DIMENSION,
  DOCS_VECTOR_DIMENSION,
  STALE_LOCKFILE_AGE_MS,
  distanceToScore,
  globToLikePattern,
  cleanupStaleLockfiles,
};
