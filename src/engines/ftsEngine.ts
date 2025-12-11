/**
 * Full-Text Search (FTS) Engine Interface
 *
 * Provides a unified interface for full-text search engines.
 * This abstraction allows for multiple implementations:
 * - NaturalBM25Engine: Pure JavaScript using the 'natural' package
 * - SQLiteFTS5Engine: Native SQLite FTS5 (optional, higher performance)
 *
 * The engine selection is handled by the factory (ftsEngineFactory.ts)
 * based on project size and native module availability.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Chunk data for indexing in the FTS engine
 */
export interface FTSChunk {
  /** Unique identifier for the chunk */
  id: string;
  /** Chunk text content */
  text: string;
  /** Relative file path (forward-slash separated) */
  path: string;
  /** Start line in source file (1-indexed) */
  startLine: number;
  /** End line in source file (1-indexed) */
  endLine: number;
}

/**
 * Search result from FTS engine
 */
export interface FTSSearchResult {
  /** Unique identifier for the chunk */
  id: string;
  /** Relative file path */
  path: string;
  /** Chunk text content */
  text: string;
  /** Start line in source file */
  startLine: number;
  /** End line in source file */
  endLine: number;
  /** BM25/TF-IDF relevance score (raw, may need normalization) */
  score: number;
}

/**
 * Statistics about the FTS index
 */
export interface FTSStats {
  /** Total number of indexed chunks */
  totalChunks: number;
  /** Engine type identifier */
  engine: 'js' | 'native';
  /** Total number of unique documents/terms (optional, engine-specific) */
  totalTerms?: number;
}

/**
 * Engine type enumeration
 */
export type FTSEngineType = 'js' | 'native';

/**
 * Unified Full-Text Search Engine Interface
 *
 * Both the JavaScript (natural) and native (SQLite FTS5) engines
 * implement this interface to provide interchangeable FTS capabilities.
 */
export interface FTSEngine {
  /**
   * Get the engine type
   */
  readonly engineType: FTSEngineType;

  /**
   * Add multiple chunks to the index
   *
   * @param chunks - Array of chunks to index
   */
  addChunks(chunks: FTSChunk[]): Promise<void>;

  /**
   * Add a single chunk to the index
   *
   * @param chunk - Chunk to index
   */
  addChunk(chunk: FTSChunk): Promise<void>;

  /**
   * Remove all chunks for a file path
   *
   * @param path - Relative file path to remove
   */
  removeByPath(path: string): void;

  /**
   * Search the index with a query string
   *
   * @param query - Search query
   * @param topK - Maximum number of results to return
   * @returns Array of search results sorted by relevance
   */
  search(query: string, topK: number): FTSSearchResult[];

  /**
   * Normalize search scores to 0-1 range
   *
   * This is critical for hybrid search where BM25 scores need to be
   * comparable to vector similarity scores.
   *
   * @param results - Array of search results with raw scores
   * @returns Array with normalized scores (0-1 range)
   */
  normalizeScores(results: FTSSearchResult[]): FTSSearchResult[];

  /**
   * Get index statistics
   *
   * @returns Statistics about the FTS index
   */
  getStats(): FTSStats;

  /**
   * Serialize the index to a string for persistence
   *
   * @returns JSON string representation of the index
   */
  serialize(): string;

  /**
   * Load index from serialized data
   *
   * @param data - Serialized index data from serialize()
   * @returns true if deserialization was successful, false otherwise
   */
  deserialize(data: string): boolean;

  /**
   * Check if the index has any data
   *
   * @returns true if the index contains at least one chunk
   */
  hasData(): boolean;

  /**
   * Clear all data from the index
   */
  clear(): void;

  /**
   * Close and cleanup resources
   *
   * For JS engine: clears memory
   * For native engine: closes database connection
   */
  close(): void;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when FTS engine is not initialized
 */
export class FTSNotInitializedError extends Error {
  readonly code = 'FTS_NOT_INITIALIZED';

  constructor(operation: string) {
    super(`FTS engine not initialized. Cannot perform: ${operation}`);
    this.name = 'FTSNotInitializedError';
    Object.setPrototypeOf(this, FTSNotInitializedError.prototype);
  }
}

/**
 * Error thrown when FTS query fails
 */
export class FTSQueryError extends Error {
  readonly code = 'FTS_QUERY_ERROR';
  readonly query: string;

  constructor(query: string, reason: string) {
    super(`FTS query failed: ${reason}`);
    this.name = 'FTSQueryError';
    this.query = query;
    Object.setPrototypeOf(this, FTSQueryError.prototype);
  }
}

/**
 * Error thrown when FTS serialization/deserialization fails
 */
export class FTSSerializationError extends Error {
  readonly code = 'FTS_SERIALIZATION_ERROR';

  constructor(operation: 'serialize' | 'deserialize', reason: string) {
    super(`FTS ${operation} failed: ${reason}`);
    this.name = 'FTSSerializationError';
    Object.setPrototypeOf(this, FTSSerializationError.prototype);
  }
}
