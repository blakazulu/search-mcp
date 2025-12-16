/**
 * Embedding Service
 *
 * Generates vector embeddings for text using a transformer model.
 * Supports batching, caching, and efficient processing.
 */

import { Logger } from '../utils/demoLogger';
import { LRUCache } from './cache';

const logger = new Logger('embedding');

export interface EmbeddingResult {
  text: string;
  vector: number[];
  model: string;
  dimensions: number;
}

export interface EmbeddingConfig {
  modelName: string;
  dimensions: number;
  maxBatchSize: number;
  cacheEnabled: boolean;
  cacheTTL: number;
}

// Default configuration for MiniLM model
const DEFAULT_CONFIG: EmbeddingConfig = {
  modelName: 'all-MiniLM-L6-v2',
  dimensions: 384,
  maxBatchSize: 32,
  cacheEnabled: true,
  cacheTTL: 3600000, // 1 hour
};

/**
 * EmbeddingEngine generates vector embeddings for text.
 *
 * Features:
 * - Transformer model integration
 * - Batch processing for efficiency
 * - Result caching
 * - Normalization of output vectors
 *
 * Performance optimization:
 * - Batches multiple texts for GPU efficiency
 * - Caches frequently requested embeddings
 * - Lazy model initialization
 */
export class EmbeddingEngine {
  private config: EmbeddingConfig;
  private model: unknown = null;
  private tokenizer: unknown = null;
  private cache: LRUCache<number[]>;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new LRUCache<number[]>({
      maxSize: 10000,
      defaultTTL: this.config.cacheTTL,
    });
  }

  /**
   * Initializes the embedding model.
   *
   * Loads the transformer model and tokenizer.
   * This is called automatically on first use.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.loadModel();
    await this.initializing;
    this.initializing = null;
  }

  /**
   * Loads the transformer model.
   */
  private async loadModel(): Promise<void> {
    logger.info('Loading embedding model', { model: this.config.modelName });

    try {
      // Simulate model loading (in real implementation, use @huggingface/transformers)
      // const { pipeline } = await import('@huggingface/transformers');
      // this.model = await pipeline('feature-extraction', this.config.modelName);

      this.model = {
        name: this.config.modelName,
        dimensions: this.config.dimensions,
      };

      this.initialized = true;
      logger.info('Embedding model loaded successfully');
    } catch (error) {
      logger.error('Failed to load embedding model', error);
      throw error;
    }
  }

  /**
   * Generates an embedding for a single text.
   *
   * @param text - Text to embed
   * @returns Embedding result with vector
   */
  async embed(text: string): Promise<EmbeddingResult> {
    await this.initialize();

    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(text);
      if (cached) {
        logger.debug('Cache hit for embedding');
        return {
          text,
          vector: cached,
          model: this.config.modelName,
          dimensions: this.config.dimensions,
        };
      }
    }

    // Generate embedding
    const vector = await this.generateEmbedding(text);

    // Cache result
    if (this.config.cacheEnabled) {
      this.cache.set(text, vector);
    }

    return {
      text,
      vector,
      model: this.config.modelName,
      dimensions: this.config.dimensions,
    };
  }

  /**
   * Generates embeddings for multiple texts.
   *
   * @param texts - Array of texts to embed
   * @returns Array of embedding results
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    await this.initialize();

    const results: EmbeddingResult[] = [];
    const uncached: Array<{ index: number; text: string }> = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (this.config.cacheEnabled) {
        const cached = this.cache.get(text);
        if (cached) {
          results[i] = {
            text,
            vector: cached,
            model: this.config.modelName,
            dimensions: this.config.dimensions,
          };
          continue;
        }
      }
      uncached.push({ index: i, text });
    }

    // Process uncached in batches
    for (let i = 0; i < uncached.length; i += this.config.maxBatchSize) {
      const batch = uncached.slice(i, i + this.config.maxBatchSize);
      const vectors = await this.generateBatchEmbeddings(batch.map((b) => b.text));

      for (let j = 0; j < batch.length; j++) {
        const { index, text } = batch[j];
        const vector = vectors[j];

        results[index] = {
          text,
          vector,
          model: this.config.modelName,
          dimensions: this.config.dimensions,
        };

        if (this.config.cacheEnabled) {
          this.cache.set(text, vector);
        }
      }
    }

    return results;
  }

  /**
   * Generates embedding for a single text (internal).
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simulate embedding generation
    // In real implementation, use the model pipeline
    return this.mockEmbedding(text);
  }

  /**
   * Generates embeddings for a batch of texts (internal).
   */
  private async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    // Simulate batch embedding generation
    return texts.map((text) => this.mockEmbedding(text));
  }

  /**
   * Creates a mock embedding for testing.
   * In production, this would use the actual model.
   */
  private mockEmbedding(text: string): number[] {
    const vector: number[] = new Array(this.config.dimensions);
    let hash = 0;

    // Create deterministic but unique vector based on text
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }

    for (let i = 0; i < this.config.dimensions; i++) {
      const seed = hash + i * 1000;
      vector[i] = Math.sin(seed) * Math.cos(seed * 2);
    }

    // Normalize the vector
    return this.normalize(vector);
  }

  /**
   * Normalizes a vector to unit length.
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map((val) => val / magnitude);
  }

  /**
   * Computes cosine similarity between two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Similarity score between -1 and 1
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Computes euclidean distance between two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Distance (lower is more similar)
   */
  euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const stats = this.cache.getStats();
    return {
      size: stats.size,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
    };
  }

  /**
   * Clears the embedding cache.
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Embedding cache cleared');
  }

  /**
   * Gets the model configuration.
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Closes the engine and releases resources.
   */
  close(): void {
    this.cache.close();
    this.model = null;
    this.tokenizer = null;
    this.initialized = false;
    logger.info('Embedding engine closed');
  }
}

/**
 * Default embedding engine instance.
 */
export const defaultEmbeddingEngine = new EmbeddingEngine();
