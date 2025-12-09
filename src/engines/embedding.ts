/**
 * Embedding Engine
 *
 * Implements local vector generation using Xenova/transformers.
 * Converts text chunks into 384-dimensional vectors for semantic search.
 * Handles model download on first use and batch processing for efficiency.
 */

import { pipeline, type Pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { getLogger } from '../utils/logger.js';
import { modelDownloadFailed } from '../errors/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Model name for the embedding model
 * Using MiniLM for good balance of quality and speed
 */
export const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * Dimension of the embedding vectors
 * MiniLM produces 384-dimensional vectors
 */
export const EMBEDDING_DIMENSION = 384;

/**
 * Batch size for processing multiple texts
 * 32 is a good balance between speed and memory usage
 */
export const BATCH_SIZE = 32;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of embedding a single text
 */
export interface EmbeddingResult {
  /** The original text that was embedded */
  text: string;
  /** The 384-dimensional embedding vector */
  vector: number[];
}

/**
 * Progress callback for batch embedding operations
 */
export type EmbeddingProgressCallback = (completed: number, total: number) => void;

/**
 * Progress callback for model download
 */
export type DownloadProgressCallback = (progress: {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}) => void;

// ============================================================================
// Embedding Engine Class
// ============================================================================

/**
 * Embedding Engine for generating vector embeddings from text.
 *
 * Uses the Xenova/all-MiniLM-L6-v2 model to create 384-dimensional
 * embedding vectors. The model is downloaded on first use (~90MB)
 * and cached for future use.
 *
 * @example
 * ```typescript
 * const engine = getEmbeddingEngine();
 * await engine.initialize();
 *
 * // Single text embedding
 * const vector = await engine.embed('Hello, world!');
 *
 * // Batch embedding with progress
 * const vectors = await engine.embedBatch(
 *   ['text1', 'text2', 'text3'],
 *   (completed, total) => console.log(`${completed}/${total}`)
 * );
 * ```
 */
export class EmbeddingEngine {
  private pipeline: FeatureExtractionPipeline | null = null;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the embedding model.
   *
   * Downloads the model on first use (~90MB to ~/.cache/huggingface/).
   * This operation is idempotent - calling it multiple times is safe.
   *
   * @param onProgress - Optional callback for download progress
   * @throws MCPError with MODEL_DOWNLOAD_FAILED if download fails
   */
  async initialize(onProgress?: DownloadProgressCallback): Promise<void> {
    // If already initialized, return immediately
    if (this.pipeline) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = this.loadModel(onProgress);

    try {
      await this.initializationPromise;
    } catch (error) {
      // Reset so we can try again
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Load the embedding model
   */
  private async loadModel(onProgress?: DownloadProgressCallback): Promise<void> {
    const logger = getLogger();
    logger.info('EmbeddingEngine', 'Initializing embedding model...', { model: MODEL_NAME });

    try {
      // Check if model needs to be downloaded
      logger.info(
        'EmbeddingEngine',
        'Loading model (may download on first use, ~90MB)...'
      );

      // Create the feature extraction pipeline
      this.pipeline = await pipeline('feature-extraction', MODEL_NAME, {
        progress_callback: (progress: {
          status: string;
          name?: string;
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        }) => {
          // Log download progress
          if (progress.status === 'download' && progress.progress !== undefined) {
            logger.debug('EmbeddingEngine', `Downloading: ${progress.file} - ${Math.round(progress.progress)}%`);
          } else if (progress.status === 'done') {
            logger.debug('EmbeddingEngine', `Downloaded: ${progress.file}`);
          }

          // Call user callback if provided
          if (onProgress) {
            onProgress(progress);
          }
        },
      }) as FeatureExtractionPipeline;

      logger.info('EmbeddingEngine', 'Embedding model initialized successfully', {
        model: MODEL_NAME,
        dimension: EMBEDDING_DIMENSION,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('EmbeddingEngine', 'Failed to initialize embedding model', {
        error: err.message,
        model: MODEL_NAME,
      });
      throw modelDownloadFailed(err);
    }
  }

  /**
   * Check if the model is initialized and ready to use
   */
  isInitialized(): boolean {
    return this.pipeline !== null;
  }

  /**
   * Get the dimension of embedding vectors
   * @returns 384 for MiniLM model
   */
  getDimension(): number {
    return EMBEDDING_DIMENSION;
  }

  /**
   * Embed a single text string into a vector.
   *
   * @param text - The text to embed
   * @returns A 384-dimensional vector
   * @throws MCPError with MODEL_DOWNLOAD_FAILED if model not initialized
   */
  async embed(text: string): Promise<number[]> {
    // Ensure model is initialized
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    const logger = getLogger();
    logger.debug('EmbeddingEngine', 'Embedding single text', {
      textLength: text.length,
    });

    try {
      // Run the embedding
      const output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the vector from the output tensor
      const vector = Array.from(output.data as Float32Array);

      // Validate dimension
      if (vector.length !== EMBEDDING_DIMENSION) {
        logger.warn('EmbeddingEngine', 'Unexpected embedding dimension', {
          expected: EMBEDDING_DIMENSION,
          actual: vector.length,
        });
      }

      return vector;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('EmbeddingEngine', 'Failed to embed text', {
        error: err.message,
        textLength: text.length,
      });
      throw err;
    }
  }

  /**
   * Embed multiple texts in batches for efficiency.
   *
   * Processes texts in batches of BATCH_SIZE (32) to balance
   * speed and memory usage. Reports progress via optional callback.
   *
   * @param texts - Array of texts to embed
   * @param onProgress - Optional callback for progress updates
   * @returns Array of 384-dimensional vectors (same order as input)
   */
  async embedBatch(
    texts: string[],
    onProgress?: EmbeddingProgressCallback
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Ensure model is initialized
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    const logger = getLogger();
    logger.info('EmbeddingEngine', 'Starting batch embedding', {
      totalTexts: texts.length,
      batchSize: BATCH_SIZE,
    });

    const vectors: number[][] = [];
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

      logger.debug('EmbeddingEngine', `Processing batch ${batchIndex}/${totalBatches}`, {
        batchSize: batch.length,
      });

      // Process each text in the batch
      for (const text of batch) {
        try {
          const output = await this.pipeline(text, {
            pooling: 'mean',
            normalize: true,
          });
          const vector = Array.from(output.data as Float32Array);
          vectors.push(vector);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('EmbeddingEngine', 'Failed to embed text in batch', {
            error: err.message,
            textLength: text.length,
          });
          // Push zero vector for failed embeddings to maintain order
          vectors.push(new Array(EMBEDDING_DIMENSION).fill(0));
        }

        // Report progress
        if (onProgress) {
          onProgress(vectors.length, texts.length);
        }
      }
    }

    logger.info('EmbeddingEngine', 'Batch embedding complete', {
      totalVectors: vectors.length,
    });

    return vectors;
  }

  /**
   * Embed texts and return full results with original text.
   *
   * @param texts - Array of texts to embed
   * @param onProgress - Optional callback for progress updates
   * @returns Array of EmbeddingResult objects
   */
  async embedWithResults(
    texts: string[],
    onProgress?: EmbeddingProgressCallback
  ): Promise<EmbeddingResult[]> {
    const vectors = await this.embedBatch(texts, onProgress);
    return texts.map((text, index) => ({
      text,
      vector: vectors[index],
    }));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton instance of the embedding engine
 */
let engineInstance: EmbeddingEngine | null = null;

/**
 * Get the singleton embedding engine instance.
 *
 * Creates a new instance if one doesn't exist.
 * The instance must be initialized before use via initialize().
 *
 * @returns The singleton EmbeddingEngine instance
 */
export function getEmbeddingEngine(): EmbeddingEngine {
  if (!engineInstance) {
    engineInstance = new EmbeddingEngine();
  }
  return engineInstance;
}

/**
 * Reset the singleton instance.
 * Mainly used for testing purposes.
 */
export function resetEmbeddingEngine(): void {
  engineInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Embed a single text string using the singleton engine.
 *
 * @param text - The text to embed
 * @returns A 384-dimensional vector
 */
export async function embedText(text: string): Promise<number[]> {
  const engine = getEmbeddingEngine();
  return engine.embed(text);
}

/**
 * Embed multiple texts using the singleton engine.
 *
 * @param texts - Array of texts to embed
 * @param onProgress - Optional callback for progress updates
 * @returns Array of 384-dimensional vectors
 */
export async function embedBatch(
  texts: string[],
  onProgress?: EmbeddingProgressCallback
): Promise<number[][]> {
  const engine = getEmbeddingEngine();
  return engine.embedBatch(texts, onProgress);
}
