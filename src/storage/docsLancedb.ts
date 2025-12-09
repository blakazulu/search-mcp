/**
 * Docs LanceDB Store Module
 *
 * Vector database wrapper using LanceDB for storing and searching documentation chunk embeddings.
 * This is a separate store from the code store, using a different database path and table name.
 *
 * Features:
 * - Vector similarity search with configurable top-k results
 * - Batch insert for efficient indexing
 * - Delete by file path for incremental updates
 * - Path pattern matching for file-based queries
 * - Stale lockfile detection and cleanup
 *
 * Storage path: ~/.mcp/search/indexes/<hash>/docs.lancedb/
 * Table name: project_docs_prose
 */

import * as lancedb from 'vectordb';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { getLogger } from '../utils/logger.js';
import { registerCleanup, unregisterCleanup, CleanupHandler } from '../utils/cleanup.js';
import { MCPError, ErrorCode, indexNotFound } from '../errors/index.js';
import { ChunkRecord, SearchResult, VECTOR_DIMENSION, distanceToScore } from './lancedb.js';
import { getDocsLanceDbPath } from '../utils/paths.js';
import { escapeSqlString, globToSafeLikePattern } from '../utils/sql.js';
import { AsyncMutex } from '../utils/asyncMutex.js';

// ============================================================================
// Constants
// ============================================================================

/** Name of the table storing documentation chunks */
const DOCS_TABLE_NAME = 'project_docs_prose';

/** Batch size for insert operations */
const INSERT_BATCH_SIZE = 500;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect and remove stale lockfiles in the database directory
 *
 * @param dbPath - Path to the LanceDB directory
 */
async function cleanupStaleLockfiles(dbPath: string): Promise<void> {
  const logger = getLogger();

  if (!fs.existsSync(dbPath)) {
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
        // Check if lockfile is stale (older than 5 minutes)
        const stats = fs.statSync(lockFile);
        const ageMs = Date.now() - stats.mtimeMs;
        const fiveMinutesMs = 5 * 60 * 1000;

        if (ageMs > fiveMinutesMs) {
          fs.unlinkSync(lockFile);
          logger.warn('docsLancedb', `Removed stale lockfile: ${lockFile}`, {
            ageMinutes: Math.round(ageMs / 60000),
          });
        }
      } catch (error) {
        // Ignore individual lockfile removal errors
        logger.debug('docsLancedb', `Could not remove lockfile: ${lockFile}`);
      }
    }
  } catch (error) {
    // Ignore glob errors
    logger.debug('docsLancedb', 'Error scanning for lockfiles', { error });
  }
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
// DocsLanceDBStore Class
// ============================================================================

/**
 * LanceDB Store wrapper for documentation vector search operations
 *
 * Provides a high-level interface for storing and searching documentation chunk embeddings.
 * Uses a separate database path (docs.lancedb/) and table (project_docs_prose) from the code store.
 *
 * @example
 * ```typescript
 * const store = new DocsLanceDBStore('/path/to/index');
 * await store.open();
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
export class DocsLanceDBStore {
  private indexPath: string;
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private isOpen: boolean = false;

  /** Mutex for protecting concurrent database operations */
  private readonly mutex = new AsyncMutex('DocsLanceDBStore');

  /** Reference to cleanup handler for unregistration */
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Create a new DocsLanceDBStore instance
   *
   * @param indexPath - Path to the index directory (e.g., ~/.mcp/search/indexes/<hash>)
   */
  constructor(indexPath: string) {
    this.indexPath = indexPath;
    this.dbPath = getDocsLanceDbPath(indexPath);
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
      logger.debug('docsLancedb', 'Database already open');
      return;
    }

    try {
      // Ensure database directory exists
      if (!fs.existsSync(this.dbPath)) {
        fs.mkdirSync(this.dbPath, { recursive: true });
        logger.info('docsLancedb', `Created database directory: ${this.dbPath}`);
      }

      // Clean up stale lockfiles
      await cleanupStaleLockfiles(this.dbPath);

      // Connect to database
      this.db = await lancedb.connect(this.dbPath);
      logger.debug('docsLancedb', `Connected to database: ${this.dbPath}`);

      // Check if table exists and open/create it
      const tableNames = await this.db.tableNames();

      if (tableNames.includes(DOCS_TABLE_NAME)) {
        this.table = await this.db.openTable(DOCS_TABLE_NAME);
        logger.debug('docsLancedb', `Opened existing table: ${DOCS_TABLE_NAME}`);
      } else {
        // Create table with empty initial data and schema
        // LanceDB requires at least one record or schema to create a table
        // We'll create it lazily on first insert
        this.table = null;
        logger.debug('docsLancedb', 'Table will be created on first insert');
      }

      this.isOpen = true;

      // Register cleanup handler for graceful shutdown
      this.cleanupHandler = async () => {
        await this.close();
      };
      registerCleanup(this.cleanupHandler, 'DocsLanceDBStore');

      logger.info('docsLancedb', 'Database opened successfully');
    } catch (error) {
      const err = error as Error;
      logger.error('docsLancedb', `Failed to open database: ${err.message}`);
      throw new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage:
          'Failed to open the documentation search index. It may be corrupted. Try rebuilding it with reindex_project.',
        developerMessage: `Failed to open DocsLanceDB at ${this.dbPath}: ${err.message}`,
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

    logger.debug('docsLancedb', 'Database connection closed');
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

    if (fs.existsSync(this.dbPath)) {
      fs.rmSync(this.dbPath, { recursive: true, force: true });
      logger.info('docsLancedb', `Deleted database: ${this.dbPath}`);
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
        userMessage: 'No data to initialize the documentation search index.',
        developerMessage: 'Cannot create table without initial data',
      });
    }

    // Create table with initial data
    this.table = await this.db.createTable(DOCS_TABLE_NAME, initialData);
    logger.info('docsLancedb', `Created table: ${DOCS_TABLE_NAME}`);

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
      logger.info('docsLancedb', `Inserting ${chunks.length} chunks`);

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

      logger.debug('docsLancedb', `Inserted ${chunks.length} chunks successfully`);
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
        logger.debug('docsLancedb', `Inserted batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1}`);
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

      logger.debug('docsLancedb', `Deleted ${beforeCount} chunks for path: ${relativePath}`);
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
        const results = await table
          .filter('true')
          .select(['path'])
          .limit(maxResults)
          .execute<{ path: string }>();

        for (const result of results) {
          uniquePaths.add(result.path);
          if (uniquePaths.size >= limit) {
            break;
          }
        }
      } catch (error) {
        // Fallback to unbounded query if limited query fails
        logger.debug('docsLancedb', 'Limited query failed, falling back', { error });
        const allResults = await table.filter('true').select(['path']).execute<{ path: string }>();
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
   * @param queryVector - Query embedding vector (384 dimensions)
   * @param topK - Maximum number of results to return (default: 10)
   * @returns Search results sorted by similarity score (descending)
   */
  async search(queryVector: number[], topK: number = 10): Promise<SearchResult[]> {
    if (!this.table) {
      return [];
    }

    // Validate vector dimension before acquiring lock
    if (queryVector.length !== VECTOR_DIMENSION) {
      throw new MCPError({
        code: ErrorCode.INVALID_PATTERN,
        userMessage: 'Invalid search query.',
        developerMessage: `Query vector dimension mismatch. Expected ${VECTOR_DIMENSION}, got ${queryVector.length}`,
      });
    }

    return this.mutex.withLock(async () => {
      const table = await this.getTable();
      const logger = getLogger();

      logger.debug('docsLancedb', `Searching with topK=${topK}`);

      // Perform vector search
      const rawResults = await table.search(queryVector).limit(topK).execute<RawSearchResult>();

      // Convert to SearchResult format
      const results: SearchResult[] = rawResults.map((row) => ({
        path: row.path,
        text: row.text,
        score: distanceToScore(row._distance),
        startLine: row.start_line,
        endLine: row.end_line,
      }));

      logger.debug('docsLancedb', `Search returned ${results.length} results`);
      return results;
    });
  }

  /**
   * Search for files matching a glob pattern
   * Protected by mutex to ensure consistent reads during concurrent operations.
   *
   * @param pattern - Glob pattern (e.g., "*.md", "docs/*.md")
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
      logger.debug('docsLancedb', `Searching paths with pattern: ${pattern} -> ${likePattern}`);

      try {
        // Query with path filter
        const results = await table
          .filter(`path LIKE '${likePattern}'`)
          .select(['path'])
          .execute<{ path: string }>();

        // Get unique paths
        const uniquePaths = new Set<string>();
        for (const result of results) {
          uniquePaths.add(result.path);
          if (uniquePaths.size >= limit) {
            break;
          }
        }

        const paths = Array.from(uniquePaths).sort().slice(0, limit);
        logger.debug('docsLancedb', `Path search returned ${paths.length} files`);
        return paths;
      } catch (error) {
        const err = error as Error;
        logger.error('docsLancedb', `Path search failed: ${err.message}`);
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
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get the storage size of the database in bytes
   *
   * @returns Size in bytes
   */
  async getStorageSize(): Promise<number> {
    if (!fs.existsSync(this.dbPath)) {
      return 0;
    }

    let totalSize = 0;

    const calculateSize = (dirPath: string): void => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          calculateSize(fullPath);
        } else {
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;
        }
      }
    };

    calculateSize(this.dbPath);
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

export { DOCS_TABLE_NAME, getDocsLanceDbPath };
