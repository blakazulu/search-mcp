/**
 * Index Manager Service
 *
 * Manages search indexes for efficient data retrieval.
 * Supports creating, updating, and deleting indexes.
 */

import { Logger } from '../utils/demoLogger';
import { EmbeddingEngine } from './demoEmbedding';
import { LRUCache } from './cache';

const logger = new Logger('indexManager');

export interface IndexEntry {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface IndexConfig {
  name: string;
  dimensions: number;
  metric: 'cosine' | 'euclidean' | 'dot';
}

/**
 * IndexManager provides search index creation and management.
 *
 * Features:
 * - Vector index creation for semantic search
 * - Index updates and deletions
 * - Batch indexing for efficiency
 * - Search with configurable parameters
 *
 * Performance optimization:
 * - Efficient vector storage
 * - Cached search results
 * - Batch processing
 */
export class IndexManager {
  private config: IndexConfig;
  private entries: Map<string, IndexEntry> = new Map();
  private embeddingEngine: EmbeddingEngine;
  private searchCache: LRUCache<SearchResult[]>;

  constructor(config: IndexConfig) {
    this.config = config;
    this.embeddingEngine = new EmbeddingEngine({ dimensions: config.dimensions });
    this.searchCache = new LRUCache({ maxSize: 1000, defaultTTL: 60000 });
    logger.info('Index created', { name: config.name });
  }

  /**
   * Creates an index for the given content.
   *
   * @param id - Unique identifier
   * @param content - Text content to index
   * @param metadata - Additional metadata
   */
  async createIndex(id: string, content: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const embedding = await this.embeddingEngine.embed(content);

    const entry: IndexEntry = {
      id,
      content,
      vector: embedding.vector,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.entries.set(id, entry);
    this.invalidateSearchCache();

    logger.debug('Index entry created', { id });
  }

  /**
   * Creates indexes for multiple items.
   *
   * @param items - Array of items to index
   */
  async createBatchIndex(items: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>): Promise<void> {
    const contents = items.map((i) => i.content);
    const embeddings = await this.embeddingEngine.embedBatch(contents);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const embedding = embeddings[i];

      const entry: IndexEntry = {
        id: item.id,
        content: item.content,
        vector: embedding.vector,
        metadata: item.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.entries.set(item.id, entry);
    }

    this.invalidateSearchCache();
    logger.info('Batch index created', { count: items.length });
  }

  /**
   * Updates an existing index entry.
   *
   * @param id - Entry identifier
   * @param content - New content
   * @param metadata - Updated metadata
   */
  async updateIndex(id: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Index entry not found: ${id}`);
    }

    const embedding = await this.embeddingEngine.embed(content);

    existing.content = content;
    existing.vector = embedding.vector;
    existing.updatedAt = new Date();
    if (metadata) {
      existing.metadata = { ...existing.metadata, ...metadata };
    }

    this.invalidateSearchCache();
    logger.debug('Index entry updated', { id });
  }

  /**
   * Deletes an index entry.
   *
   * @param id - Entry identifier
   */
  deleteIndex(id: string): boolean {
    const deleted = this.entries.delete(id);
    if (deleted) {
      this.invalidateSearchCache();
      logger.debug('Index entry deleted', { id });
    }
    return deleted;
  }

  /**
   * Searches the index for similar content.
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Array of search results
   */
  async search(query: string, options: { topK?: number; minScore?: number } = {}): Promise<SearchResult[]> {
    const { topK = 10, minScore = 0 } = options;

    // Check cache
    const cacheKey = `${query}:${topK}:${minScore}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const queryEmbedding = await this.embeddingEngine.embed(query);
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      const score = this.calculateScore(queryEmbedding.vector, entry.vector);

      if (score >= minScore) {
        results.push({
          id: entry.id,
          score,
          content: entry.content,
          metadata: entry.metadata,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Return top K
    const topResults = results.slice(0, topK);

    // Cache results
    this.searchCache.set(cacheKey, topResults);

    return topResults;
  }

  /**
   * Calculates similarity score between vectors.
   */
  private calculateScore(a: number[], b: number[]): number {
    switch (this.config.metric) {
      case 'cosine':
        return this.embeddingEngine.cosineSimilarity(a, b);
      case 'euclidean':
        // Convert distance to similarity
        const distance = this.embeddingEngine.euclideanDistance(a, b);
        return 1 / (1 + distance);
      case 'dot':
        return a.reduce((sum, val, i) => sum + val * b[i], 0);
      default:
        return this.embeddingEngine.cosineSimilarity(a, b);
    }
  }

  /**
   * Invalidates the search cache.
   */
  private invalidateSearchCache(): void {
    this.searchCache.clear();
  }

  /**
   * Gets index statistics.
   */
  getStats(): { entries: number; config: IndexConfig; cacheStats: unknown } {
    return {
      entries: this.entries.size,
      config: this.config,
      cacheStats: this.searchCache.getStats(),
    };
  }

  /**
   * Closes the index and releases resources.
   */
  close(): void {
    this.entries.clear();
    this.searchCache.close();
    this.embeddingEngine.close();
    logger.info('Index closed', { name: this.config.name });
  }
}

/**
 * Creates a new index with the specified configuration.
 *
 * @param config - Index configuration
 * @returns IndexManager instance
 */
export function createIndex(config: IndexConfig): IndexManager {
  return new IndexManager(config);
}
