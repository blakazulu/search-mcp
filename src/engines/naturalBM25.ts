/**
 * NaturalBM25Engine - Pure JavaScript FTS Engine
 *
 * Implements the FTSEngine interface using the 'natural' npm package
 * for TF-IDF based text search with BM25-like scoring.
 *
 * Key features:
 * - No native dependencies (works on all platforms)
 * - In-memory index with persistence support
 * - Automatic tokenization and stemming
 * - Score normalization for hybrid search
 *
 * Limitations:
 * - Memory usage grows with index size
 * - No true document removal (requires rebuild for removal)
 * - Slower than native SQLite FTS5 for large datasets
 */

import natural from 'natural';
import { getLogger } from '../utils/logger.js';
import {
  FTSEngine,
  FTSEngineType,
  FTSChunk,
  FTSSearchResult,
  FTSStats,
  FTSNotInitializedError,
  FTSSerializationError,
} from './ftsEngine.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Internal document metadata stored alongside TF-IDF index
 */
interface DocumentMetadata {
  id: string;
  path: string;
  text: string;
  startLine: number;
  endLine: number;
}

/**
 * Serialized index format for persistence
 */
interface SerializedIndex {
  version: number;
  documents: Array<{
    id: string;
    path: string;
    text: string;
    startLine: number;
    endLine: number;
  }>;
  // Note: TF-IDF state is rebuilt from documents on load
}

// ============================================================================
// Constants
// ============================================================================

/** Current serialization format version */
const SERIALIZATION_VERSION = 1;

// ============================================================================
// NaturalBM25Engine Class
// ============================================================================

/**
 * JavaScript-based FTS engine using the 'natural' package
 *
 * Uses TF-IDF for scoring, which provides BM25-like behavior.
 * The natural package's TfIdf class doesn't support true document
 * removal, so we track deletions separately and rebuild when needed.
 */
export class NaturalBM25Engine implements FTSEngine {
  readonly engineType: FTSEngineType = 'js';

  /** TF-IDF instance from natural */
  private tfidf: natural.TfIdf;

  /** Tokenizer for processing queries */
  private tokenizer: natural.WordTokenizer;

  /** Document metadata indexed by document ID */
  private documents: Map<string, DocumentMetadata>;

  /** Set of deleted document IDs (for lazy removal) */
  private deletedIds: Set<string>;

  /** Mapping from TF-IDF document index to document ID */
  private indexToId: string[];

  /** Flag indicating if rebuild is needed due to deletions */
  private needsRebuild: boolean;

  constructor() {
    this.tfidf = new natural.TfIdf();
    this.tokenizer = new natural.WordTokenizer();
    this.documents = new Map();
    this.deletedIds = new Set();
    this.indexToId = [];
    this.needsRebuild = false;
  }

  // --------------------------------------------------------------------------
  // Index Management
  // --------------------------------------------------------------------------

  /**
   * Add multiple chunks to the index
   */
  async addChunks(chunks: FTSChunk[]): Promise<void> {
    const logger = getLogger();
    logger.debug('naturalBM25', `Adding ${chunks.length} chunks to FTS index`);

    for (const chunk of chunks) {
      await this.addChunk(chunk);
    }

    logger.debug('naturalBM25', `Added ${chunks.length} chunks, total: ${this.documents.size}`);
  }

  /**
   * Add a single chunk to the index
   */
  async addChunk(chunk: FTSChunk): Promise<void> {
    // Skip if already exists (update case - remove first)
    if (this.documents.has(chunk.id)) {
      // Mark old version as deleted
      this.deletedIds.add(chunk.id);
      this.needsRebuild = true;
    }

    // Store metadata
    const metadata: DocumentMetadata = {
      id: chunk.id,
      path: chunk.path,
      text: chunk.text,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
    };
    this.documents.set(chunk.id, metadata);

    // Add to TF-IDF index
    // Using the chunk ID as the document key for later retrieval
    this.tfidf.addDocument(chunk.text, chunk.id);
    this.indexToId.push(chunk.id);

    // Remove from deleted set if it was marked for deletion
    this.deletedIds.delete(chunk.id);
  }

  /**
   * Remove all chunks for a file path
   *
   * Note: natural's TfIdf doesn't support true removal.
   * We mark documents as deleted and filter them from search results.
   * Call rebuildIfNeeded() to clean up deleted documents.
   */
  removeByPath(filePath: string): void {
    const logger = getLogger();
    let removedCount = 0;

    for (const [id, metadata] of this.documents) {
      if (metadata.path === filePath) {
        this.deletedIds.add(id);
        this.documents.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.needsRebuild = true;
      logger.debug('naturalBM25', `Marked ${removedCount} chunks for deletion from path: ${filePath}`);
    }
  }

  /**
   * Rebuild the TF-IDF index to clean up deleted documents
   *
   * This is an expensive operation but necessary to free memory
   * from deleted documents. Called automatically when deletion
   * ratio exceeds a threshold during search.
   */
  private rebuildIndex(): void {
    const logger = getLogger();
    logger.debug('naturalBM25', 'Rebuilding FTS index to clean up deleted documents');

    // Create new TF-IDF instance
    const newTfidf = new natural.TfIdf();
    const newIndexToId: string[] = [];

    // Re-add all non-deleted documents
    for (const [id, metadata] of this.documents) {
      if (!this.deletedIds.has(id)) {
        newTfidf.addDocument(metadata.text, id);
        newIndexToId.push(id);
      }
    }

    // Replace old index
    this.tfidf = newTfidf;
    this.indexToId = newIndexToId;
    this.deletedIds.clear();
    this.needsRebuild = false;

    logger.debug('naturalBM25', `Rebuild complete. Active documents: ${this.documents.size}`);
  }

  /**
   * Rebuild index if deletion ratio is too high
   * Threshold: rebuild if more than 20% of documents are deleted
   */
  private rebuildIfNeeded(): void {
    if (!this.needsRebuild) return;

    const totalDocs = this.indexToId.length;
    const deletedDocs = this.deletedIds.size;

    if (totalDocs === 0) return;

    const deletionRatio = deletedDocs / totalDocs;
    if (deletionRatio > 0.2) {
      this.rebuildIndex();
    }
  }

  // --------------------------------------------------------------------------
  // Search Operations
  // --------------------------------------------------------------------------

  /**
   * Search the index with a query string
   */
  search(query: string, topK: number): FTSSearchResult[] {
    const logger = getLogger();

    if (this.documents.size === 0) {
      return [];
    }

    // Rebuild if too many deletions
    this.rebuildIfNeeded();

    // Collect TF-IDF scores for all documents
    const results: Array<{ id: string; score: number }> = [];

    this.tfidf.tfidfs(query, (docIndex: number, score: number) => {
      // Get document ID from index mapping
      const docId = this.indexToId[docIndex];

      // Skip deleted documents
      if (this.deletedIds.has(docId)) {
        return;
      }

      // Only include documents with positive scores
      if (score > 0) {
        results.push({ id: docId, score });
      }
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Take top K and build full results
    const topResults = results.slice(0, topK);

    const searchResults: FTSSearchResult[] = topResults.map(({ id, score }) => {
      const metadata = this.documents.get(id);
      if (!metadata) {
        // This shouldn't happen, but handle gracefully
        logger.warn('naturalBM25', `Document metadata not found for ID: ${id}`);
        return {
          id,
          path: '',
          text: '',
          startLine: 0,
          endLine: 0,
          score,
        };
      }

      return {
        id: metadata.id,
        path: metadata.path,
        text: metadata.text,
        startLine: metadata.startLine,
        endLine: metadata.endLine,
        score,
      };
    });

    logger.debug('naturalBM25', `Search for "${query}" returned ${searchResults.length} results`);
    return searchResults;
  }

  /**
   * Normalize search scores to 0-1 range
   *
   * Uses min-max normalization. If all scores are equal or there's
   * only one result, returns score of 1.0 for all.
   */
  normalizeScores(results: FTSSearchResult[]): FTSSearchResult[] {
    if (results.length === 0) {
      return results;
    }

    // Find min and max scores
    const scores = results.map((r) => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore;

    // If all scores are the same or max is 0, return 1.0 for all
    if (range === 0 || maxScore === 0) {
      return results.map((r) => ({
        ...r,
        score: results.length === 1 ? 1.0 : r.score > 0 ? 1.0 : 0,
      }));
    }

    // Normalize to 0-1 range
    return results.map((r) => ({
      ...r,
      score: (r.score - minScore) / range,
    }));
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get index statistics
   */
  getStats(): FTSStats {
    return {
      totalChunks: this.documents.size,
      engine: 'js',
      // TF-IDF doesn't expose total terms easily
      totalTerms: undefined,
    };
  }

  /**
   * Check if the index has any data
   */
  hasData(): boolean {
    return this.documents.size > 0;
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  /**
   * Serialize the index to a JSON string
   *
   * Note: We serialize document metadata only and rebuild TF-IDF on load.
   * This is because natural's TfIdf doesn't have built-in serialization.
   */
  serialize(): string {
    const logger = getLogger();

    // Rebuild first to clean up deleted documents
    if (this.needsRebuild) {
      this.rebuildIndex();
    }

    const data: SerializedIndex = {
      version: SERIALIZATION_VERSION,
      documents: Array.from(this.documents.values()).map((doc) => ({
        id: doc.id,
        path: doc.path,
        text: doc.text,
        startLine: doc.startLine,
        endLine: doc.endLine,
      })),
    };

    logger.debug('naturalBM25', `Serializing ${data.documents.length} documents`);
    return JSON.stringify(data);
  }

  /**
   * Load index from serialized data
   *
   * Rebuilds the TF-IDF index from the serialized documents.
   *
   * @returns true if successful, false otherwise
   */
  deserialize(data: string): boolean {
    const logger = getLogger();

    try {
      const parsed = JSON.parse(data) as SerializedIndex;

      // Version check
      if (parsed.version !== SERIALIZATION_VERSION) {
        logger.warn(
          'naturalBM25',
          `Index version mismatch. Expected ${SERIALIZATION_VERSION}, got ${parsed.version}`
        );
        // For now, try to load anyway - future versions may need migration
      }

      // Clear existing data
      this.clear();

      // Rebuild index from documents
      for (const doc of parsed.documents) {
        const metadata: DocumentMetadata = {
          id: doc.id,
          path: doc.path,
          text: doc.text,
          startLine: doc.startLine,
          endLine: doc.endLine,
        };

        this.documents.set(doc.id, metadata);
        this.tfidf.addDocument(doc.text, doc.id);
        this.indexToId.push(doc.id);
      }

      logger.debug('naturalBM25', `Deserialized ${parsed.documents.length} documents`);
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('naturalBM25', `Failed to deserialize FTS index: ${err.message}`);
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
    this.tfidf = new natural.TfIdf();
    this.documents.clear();
    this.deletedIds.clear();
    this.indexToId = [];
    this.needsRebuild = false;

    getLogger().debug('naturalBM25', 'Cleared FTS index');
  }

  /**
   * Close and cleanup resources
   *
   * For the JS engine, this is equivalent to clear().
   */
  close(): void {
    this.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new NaturalBM25Engine instance
 */
export function createNaturalBM25Engine(): NaturalBM25Engine {
  return new NaturalBM25Engine();
}
