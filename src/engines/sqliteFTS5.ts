/**
 * SQLiteFTS5Engine - Native SQLite FTS5 Engine
 *
 * Implements the FTSEngine interface using SQLite FTS5 via better-sqlite3.
 * This engine provides high-performance keyword search for large codebases.
 *
 * Key features:
 * - Native SQLite performance (C-based)
 * - Disk-backed persistence (survives restarts)
 * - Full FTS5 features (phrase search, prefix, boolean operators)
 * - Efficient incremental updates (add/remove)
 * - BM25 scoring for relevance ranking
 * - Porter stemming for better matching
 *
 * Limitations:
 * - Requires native module (better-sqlite3)
 * - May fail to install on some platforms without build tools
 * - Larger package size than pure JS solution
 */

import path from 'path';
import { getLogger } from '../utils/logger.js';
import {
  FTSEngine,
  FTSEngineType,
  FTSChunk,
  FTSSearchResult,
  FTSStats,
  FTSSerializationError,
} from './ftsEngine.js';

// ============================================================================
// Types
// ============================================================================

/** better-sqlite3 Database type (imported dynamically) */
type Database = import('better-sqlite3').Database;

/**
 * Options for creating the SQLiteFTS5Engine
 */
export interface SQLiteFTS5Options {
  /** Path to the SQLite database file (will be created if doesn't exist) */
  dbPath: string;
}

/**
 * Serialized state for persistence (metadata only - DB persists itself)
 */
interface SerializedState {
  version: number;
  dbPath: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Current serialization format version */
const SERIALIZATION_VERSION = 1;

/** FTS5 table name */
const FTS_TABLE = 'chunks_fts';

// ============================================================================
// Native Module Availability Check
// ============================================================================

/** Cached result of native module availability check */
let nativeAvailable: boolean | null = null;

/**
 * Check if the better-sqlite3 native module is available.
 *
 * This function uses dynamic import to avoid crashes when the module
 * is not installed. The result is cached for subsequent calls.
 *
 * @returns Promise resolving to true if native module is available
 */
export async function isNativeAvailable(): Promise<boolean> {
  if (nativeAvailable !== null) {
    return nativeAvailable;
  }

  try {
    // Dynamic import to avoid crash if not installed
    await import('better-sqlite3');
    nativeAvailable = true;
    getLogger().debug('sqliteFTS5', 'Native better-sqlite3 module is available');
    return true;
  } catch (error) {
    nativeAvailable = false;
    getLogger().debug(
      'sqliteFTS5',
      'Native better-sqlite3 module not available. This is normal if not installed.'
    );
    return false;
  }
}

/**
 * Reset the native availability cache (mainly for testing)
 */
export function resetNativeAvailableCache(): void {
  nativeAvailable = null;
}

// ============================================================================
// SQLiteFTS5Engine Class
// ============================================================================

/**
 * SQLite FTS5 based FTS engine for high-performance keyword search.
 *
 * Uses SQLite's Full-Text Search 5 extension with BM25 scoring.
 * Provides disk-backed persistence and efficient incremental updates.
 */
export class SQLiteFTS5Engine implements FTSEngine {
  readonly engineType: FTSEngineType = 'native';

  /** SQLite database instance */
  private db: Database | null = null;

  /** Path to the database file */
  private dbPath: string;

  /** Prepared statements cache */
  private statements: {
    insert?: import('better-sqlite3').Statement;
    deleteByPath?: import('better-sqlite3').Statement;
    search?: import('better-sqlite3').Statement;
    count?: import('better-sqlite3').Statement;
    clear?: import('better-sqlite3').Statement;
  } = {};

  constructor(options: SQLiteFTS5Options) {
    this.dbPath = options.dbPath;
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize the database connection and create FTS5 table.
   * Must be called before using the engine.
   */
  async initialize(): Promise<void> {
    const logger = getLogger();

    if (this.db) {
      logger.debug('sqliteFTS5', 'Database already initialized');
      return;
    }

    try {
      // Dynamic import of better-sqlite3
      const BetterSqlite3 = (await import('better-sqlite3')).default;

      // Ensure the directory exists
      const fs = await import('fs');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create or open database
      this.db = new BetterSqlite3(this.dbPath);

      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');

      // Create FTS5 virtual table if not exists
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
          id UNINDEXED,
          path UNINDEXED,
          text,
          start_line UNINDEXED,
          end_line UNINDEXED,
          tokenize='porter unicode61'
        );
      `);

      // Prepare commonly used statements
      this.prepareStatements();

      logger.debug('sqliteFTS5', `Database initialized at ${this.dbPath}`);
    } catch (error) {
      const err = error as Error;
      logger.error('sqliteFTS5', `Failed to initialize database: ${err.message}`);
      throw error;
    }
  }

  /**
   * Prepare commonly used SQL statements for better performance
   */
  private prepareStatements(): void {
    if (!this.db) return;

    this.statements.insert = this.db.prepare(`
      INSERT INTO ${FTS_TABLE} (id, path, text, start_line, end_line)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.statements.deleteByPath = this.db.prepare(`
      DELETE FROM ${FTS_TABLE} WHERE path = ?
    `);

    this.statements.count = this.db.prepare(`
      SELECT COUNT(*) as count FROM ${FTS_TABLE}
    `);

    this.statements.clear = this.db.prepare(`DELETE FROM ${FTS_TABLE}`);
  }

  /**
   * Ensure the database is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.db) {
      throw new Error(
        'SQLiteFTS5Engine not initialized. Call initialize() first or use createSQLiteFTS5Engine().'
      );
    }
  }

  // --------------------------------------------------------------------------
  // Index Management
  // --------------------------------------------------------------------------

  /**
   * Add multiple chunks to the index using a transaction for efficiency
   */
  async addChunks(chunks: FTSChunk[]): Promise<void> {
    this.ensureInitialized();

    const logger = getLogger();
    logger.debug('sqliteFTS5', `Adding ${chunks.length} chunks to FTS5 index`);

    if (chunks.length === 0) return;

    // Use transaction for batch insert
    const insertMany = this.db!.transaction((chunksToInsert: FTSChunk[]) => {
      for (const chunk of chunksToInsert) {
        // Delete any existing chunk with the same ID first
        this.db!.prepare(`DELETE FROM ${FTS_TABLE} WHERE id = ?`).run(chunk.id);

        // Insert the new chunk
        this.statements.insert!.run(
          chunk.id,
          chunk.path,
          chunk.text,
          chunk.startLine,
          chunk.endLine
        );
      }
    });

    insertMany(chunks);
    logger.debug('sqliteFTS5', `Added ${chunks.length} chunks to FTS5 index`);
  }

  /**
   * Add a single chunk to the index
   */
  async addChunk(chunk: FTSChunk): Promise<void> {
    this.ensureInitialized();

    // Delete any existing chunk with the same ID first
    this.db!.prepare(`DELETE FROM ${FTS_TABLE} WHERE id = ?`).run(chunk.id);

    // Insert the chunk
    this.statements.insert!.run(
      chunk.id,
      chunk.path,
      chunk.text,
      chunk.startLine,
      chunk.endLine
    );
  }

  /**
   * Remove all chunks for a file path
   */
  removeByPath(filePath: string): void {
    this.ensureInitialized();

    const logger = getLogger();
    const result = this.statements.deleteByPath!.run(filePath);
    logger.debug('sqliteFTS5', `Removed ${result.changes} chunks for path: ${filePath}`);
  }

  // --------------------------------------------------------------------------
  // Search Operations
  // --------------------------------------------------------------------------

  /**
   * Search the index with a query string using FTS5 MATCH
   */
  search(query: string, topK: number): FTSSearchResult[] {
    this.ensureInitialized();

    const logger = getLogger();

    if (!query || query.trim() === '') {
      return [];
    }

    try {
      // Escape and format query for FTS5
      const ftsQuery = this.escapeQuery(query);

      // Search with BM25 scoring
      // Note: FTS5 bm25() returns negative scores where more negative = better match
      const stmt = this.db!.prepare(`
        SELECT
          id,
          path,
          text,
          start_line as startLine,
          end_line as endLine,
          bm25(${FTS_TABLE}) as score
        FROM ${FTS_TABLE}
        WHERE ${FTS_TABLE} MATCH ?
        ORDER BY bm25(${FTS_TABLE})
        LIMIT ?
      `);

      const results = stmt.all(ftsQuery, topK) as Array<{
        id: string;
        path: string;
        text: string;
        startLine: number;
        endLine: number;
        score: number;
      }>;

      logger.debug('sqliteFTS5', `Search for "${query}" returned ${results.length} results`);
      return results;
    } catch (error) {
      const err = error as Error;

      // If FTS5 query syntax is invalid, fall back to LIKE search
      if (err.message.includes('fts5') || err.message.includes('syntax')) {
        logger.debug('sqliteFTS5', `FTS5 query failed, falling back to LIKE: ${err.message}`);
        return this.fallbackSearch(query, topK);
      }

      logger.error('sqliteFTS5', `Search error: ${err.message}`);
      return [];
    }
  }

  /**
   * Fallback search using LIKE for invalid FTS queries
   */
  private fallbackSearch(query: string, topK: number): FTSSearchResult[] {
    const logger = getLogger();

    try {
      // Escape % and _ for LIKE pattern
      const escapedQuery = query.replace(/%/g, '\\%').replace(/_/g, '\\_');

      const stmt = this.db!.prepare(`
        SELECT
          id,
          path,
          text,
          start_line as startLine,
          end_line as endLine,
          1.0 as score
        FROM ${FTS_TABLE}
        WHERE text LIKE ? ESCAPE '\\'
        LIMIT ?
      `);

      const results = stmt.all(`%${escapedQuery}%`, topK) as FTSSearchResult[];
      logger.debug('sqliteFTS5', `Fallback LIKE search returned ${results.length} results`);
      return results;
    } catch (error) {
      const err = error as Error;
      logger.error('sqliteFTS5', `Fallback search error: ${err.message}`);
      return [];
    }
  }

  /**
   * Escape and format query for FTS5 MATCH syntax.
   *
   * FTS5 special characters: " * ^ - + ( ) : OR AND NOT NEAR
   *
   * Strategy:
   * - If query looks like it uses FTS5 syntax (contains operators), pass through
   * - Otherwise, wrap each word in quotes to match literally
   */
  private escapeQuery(query: string): string {
    // Check if query appears to use FTS5 syntax
    const ftsOperators = /\b(OR|AND|NOT|NEAR)\b|["*^]/;
    if (ftsOperators.test(query)) {
      // User is using FTS5 syntax, pass through as-is
      // FTS5 will handle the parsing
      return query;
    }

    // For plain queries, wrap each word in quotes for literal matching
    // This ensures exact word matches and handles special characters
    return query
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => {
        // Escape double quotes within the word
        const escaped = word.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(' ');
  }

  /**
   * Normalize search scores to 0-1 range.
   *
   * FTS5 bm25() returns negative scores where more negative = better match.
   * This method converts them to positive 0-1 range for hybrid search.
   */
  normalizeScores(results: FTSSearchResult[]): FTSSearchResult[] {
    if (results.length === 0) {
      return results;
    }

    // Convert negative BM25 scores to positive (negate them)
    // After negation: higher = better match
    const scores = results.map((r) => -r.score);

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore;

    // If all scores are the same or we only have one result
    if (range === 0) {
      return results.map((r) => ({
        ...r,
        score: 1.0,
      }));
    }

    // Normalize to 0-1 range (min-max normalization)
    return results.map((r, i) => ({
      ...r,
      score: (scores[i] - minScore) / range,
    }));
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get index statistics
   */
  getStats(): FTSStats {
    if (!this.db) {
      return {
        totalChunks: 0,
        engine: 'native',
      };
    }

    const result = this.statements.count!.get() as { count: number };
    return {
      totalChunks: result.count,
      engine: 'native',
    };
  }

  /**
   * Check if the index has any data
   */
  hasData(): boolean {
    if (!this.db) return false;
    const stats = this.getStats();
    return stats.totalChunks > 0;
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  /**
   * Serialize the engine state.
   *
   * For SQLiteFTS5Engine, the actual data is persisted in the SQLite database.
   * This method returns metadata about the database location.
   */
  serialize(): string {
    const data: SerializedState = {
      version: SERIALIZATION_VERSION,
      dbPath: this.dbPath,
    };
    return JSON.stringify(data);
  }

  /**
   * Load engine state from serialized data.
   *
   * For SQLiteFTS5Engine, this verifies the database path matches
   * and ensures the database is initialized.
   *
   * @returns true if successful, false otherwise
   */
  deserialize(data: string): boolean {
    const logger = getLogger();

    try {
      const parsed = JSON.parse(data) as SerializedState;

      // Version check
      if (parsed.version !== SERIALIZATION_VERSION) {
        logger.warn(
          'sqliteFTS5',
          `State version mismatch. Expected ${SERIALIZATION_VERSION}, got ${parsed.version}`
        );
      }

      // Verify the database path matches
      if (parsed.dbPath !== this.dbPath) {
        logger.warn(
          'sqliteFTS5',
          `Database path mismatch. Expected ${this.dbPath}, got ${parsed.dbPath}`
        );
      }

      // For SQLite, the data is already in the database file
      // Just verify we can access it
      if (this.db) {
        const stats = this.getStats();
        logger.debug('sqliteFTS5', `Deserialized state: ${stats.totalChunks} chunks in database`);
      }

      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('sqliteFTS5', `Failed to deserialize state: ${err.message}`);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Clear all data from the index
   */
  clear(): void {
    if (!this.db) return;

    this.statements.clear!.run();
    getLogger().debug('sqliteFTS5', 'Cleared FTS5 index');
  }

  /**
   * Close the database connection and cleanup resources
   */
  close(): void {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        this.statements = {};
        getLogger().debug('sqliteFTS5', 'Database connection closed');
      } catch (error) {
        const err = error as Error;
        getLogger().error('sqliteFTS5', `Error closing database: ${err.message}`);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a new SQLiteFTS5Engine instance.
 *
 * This is the recommended way to create the engine as it handles
 * initialization automatically.
 *
 * @param dbPath - Path to the SQLite database file
 * @returns Initialized SQLiteFTS5Engine instance
 * @throws If native module is not available or initialization fails
 */
export async function createSQLiteFTS5Engine(dbPath: string): Promise<SQLiteFTS5Engine> {
  // Check if native module is available
  if (!(await isNativeAvailable())) {
    throw new Error(
      'Native better-sqlite3 module is not available. ' +
        'Install it with: npm install better-sqlite3'
    );
  }

  const engine = new SQLiteFTS5Engine({ dbPath });
  await engine.initialize();
  return engine;
}
