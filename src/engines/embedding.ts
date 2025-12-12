/**
 * Embedding Engine
 *
 * Implements local vector generation using Xenova/transformers.
 * Supports dual models: BGE-small for code (384 dims) and BGE-base for docs (768 dims).
 * Handles model download on first use and batch processing for efficiency.
 */

import { pipeline, type Pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { getLogger } from '../utils/logger.js';
import { modelDownloadFailed } from '../errors/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Model name for code embedding
 * Using BGE-small for good balance of quality and speed
 */
export const CODE_MODEL_NAME = 'Xenova/bge-small-en-v1.5';

/**
 * Dimension of code embedding vectors
 * BGE-small produces 384-dimensional vectors
 */
export const CODE_EMBEDDING_DIMENSION = 384;

/**
 * Model name for docs embedding
 * Using BGE-base for higher quality on prose content
 */
export const DOCS_MODEL_NAME = 'Xenova/bge-base-en-v1.5';

/**
 * Dimension of docs embedding vectors
 * BGE-base produces 768-dimensional vectors
 */
export const DOCS_EMBEDDING_DIMENSION = 768;

/**
 * @deprecated Use CODE_MODEL_NAME instead. Kept for backward compatibility.
 * Model name for the embedding model
 * Using MiniLM for good balance of quality and speed
 */
export const MODEL_NAME = CODE_MODEL_NAME;

/**
 * @deprecated Use CODE_EMBEDDING_DIMENSION instead. Kept for backward compatibility.
 * Dimension of the embedding vectors
 * MiniLM produces 384-dimensional vectors
 */
export const EMBEDDING_DIMENSION = CODE_EMBEDDING_DIMENSION;

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
  /** Whether embedding succeeded */
  success: boolean;
}

/**
 * Result of batch embedding operation
 */
export interface BatchEmbeddingResult {
  /** Successfully embedded vectors in order (skips failures) */
  vectors: number[][];
  /** Indices of texts that successfully embedded */
  successIndices: number[];
  /** Number of embeddings that failed */
  failedCount: number;
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

/**
 * Configuration for the embedding engine
 */
export interface EmbeddingEngineConfig {
  /** The model name to use (e.g., 'Xenova/bge-small-en-v1.5') */
  modelName: string;
  /** The dimension of embedding vectors produced by this model */
  dimension: number;
  /** Human-readable display name for logging */
  displayName: string;
}

/**
 * Default configuration for code embedding
 */
export const CODE_ENGINE_CONFIG: EmbeddingEngineConfig = {
  modelName: CODE_MODEL_NAME,
  dimension: CODE_EMBEDDING_DIMENSION,
  displayName: 'Code (BGE-small)',
};

/**
 * Default configuration for docs embedding
 */
export const DOCS_ENGINE_CONFIG: EmbeddingEngineConfig = {
  modelName: DOCS_MODEL_NAME,
  dimension: DOCS_EMBEDDING_DIMENSION,
  displayName: 'Docs (BGE-base)',
};

// ============================================================================
// Embedding Engine Class
// ============================================================================

/**
 * Embedding Engine for generating vector embeddings from text.
 *
 * Supports configurable models for different use cases:
 * - Code search: BGE-small (384 dims) - fast and efficient
 * - Docs search: BGE-base (768 dims) - higher quality for prose
 *
 * @example
 * ```typescript
 * // Use the code embedding engine
 * const codeEngine = getCodeEmbeddingEngine();
 * await codeEngine.initialize();
 * const codeVector = await codeEngine.embed('function hello() {}');
 *
 * // Use the docs embedding engine
 * const docsEngine = getDocsEmbeddingEngine();
 * await docsEngine.initialize();
 * const docsVector = await docsEngine.embed('# README');
 * ```
 */
export class EmbeddingEngine {
  private pipeline: FeatureExtractionPipeline | null = null;
  private initializationPromise: Promise<void> | null = null;
  private config: EmbeddingEngineConfig;

  /**
   * Create a new EmbeddingEngine with the specified configuration.
   * @param config - The configuration for this engine (defaults to code engine config)
   */
  constructor(config: EmbeddingEngineConfig = CODE_ENGINE_CONFIG) {
    this.config = config;
  }

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
      // Reset completely on failure to allow retry
      // This prevents partial initialization state (Bug #14)
      this.initializationPromise = null;
      this.pipeline = null;
      throw error;
    }
  }

  /**
   * Load the embedding model
   */
  private async loadModel(onProgress?: DownloadProgressCallback): Promise<void> {
    const logger = getLogger();
    logger.info('EmbeddingEngine', `Initializing ${this.config.displayName} embedding model...`, {
      model: this.config.modelName,
    });

    try {
      // Check if model needs to be downloaded
      logger.info(
        'EmbeddingEngine',
        `Loading ${this.config.displayName} model (may download on first use)...`
      );

      // Create the feature extraction pipeline
      this.pipeline = await pipeline('feature-extraction', this.config.modelName, {
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

      logger.info('EmbeddingEngine', `${this.config.displayName} embedding model initialized successfully`, {
        model: this.config.modelName,
        dimension: this.config.dimension,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('EmbeddingEngine', `Failed to initialize ${this.config.displayName} embedding model`, {
        error: err.message,
        model: this.config.modelName,
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
   * Get the model name being used by this engine
   * @returns The model name (e.g., 'Xenova/bge-small-en-v1.5')
   */
  getModelName(): string {
    return this.config.modelName;
  }

  /**
   * Get the dimension of embedding vectors
   * @returns The embedding dimension for this engine's model
   */
  getDimension(): number {
    return this.config.dimension;
  }

  /**
   * Get the display name for this engine
   * @returns Human-readable display name (e.g., 'Code (BGE-small)')
   */
  getDisplayName(): string {
    return this.config.displayName;
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

    let output: { data: unknown; dispose?: () => void } | null = null;
    try {
      // Run the embedding
      output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the vector from the output tensor
      const vector = Array.from(output!.data as Float32Array);

      // Validate dimension - enforce strictly (SMCP-054)
      if (vector.length !== this.config.dimension) {
        throw new Error(
          `Invalid embedding dimension: expected ${this.config.dimension}, got ${vector.length}`
        );
      }

      return vector;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('EmbeddingEngine', 'Failed to embed text', {
        error: err.message,
        textLength: text.length,
      });
      throw err;
    } finally {
      // Dispose tensor to free memory (Bug #10)
      if (output && typeof output.dispose === 'function') {
        try {
          output.dispose();
        } catch {
          // Ignore disposal errors
        }
      }
    }
  }

  /**
   * Embed multiple texts in batches for efficiency.
   *
   * Processes texts in batches of BATCH_SIZE (32) to balance
   * speed and memory usage. Reports progress via optional callback.
   *
   * SECURITY (SMCP-054): This method returns ONLY successful embeddings.
   * Use embedBatchWithStats to get detailed information about which texts
   * succeeded and which failed. Never inserts zero vectors.
   *
   * @param texts - Array of texts to embed
   * @param onProgress - Optional callback for progress updates
   * @returns BatchEmbeddingResult with only successful embeddings, their indices, and failure count
   */
  async embedBatch(
    texts: string[],
    onProgress?: EmbeddingProgressCallback
  ): Promise<BatchEmbeddingResult> {
    return this.embedBatchWithStats(texts, onProgress);
  }

  /**
   * Embed multiple texts with failure tracking (MCP-13)
   *
   * Unlike embedBatch, this method returns detailed statistics about failures
   * and only includes successfully embedded vectors.
   *
   * @param texts - Array of texts to embed
   * @param onProgress - Optional callback for progress updates
   * @returns BatchEmbeddingResult with vectors, success indices, and failure count
   */
  async embedBatchWithStats(
    texts: string[],
    onProgress?: EmbeddingProgressCallback
  ): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { vectors: [], successIndices: [], failedCount: 0 };
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
    const successIndices: number[] = [];
    let failedCount = 0;
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
    let processedCount = 0;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

      logger.debug('EmbeddingEngine', `Processing batch ${batchIndex}/${totalBatches}`, {
        batchSize: batch.length,
      });

      // Process each text in the batch
      for (let j = 0; j < batch.length; j++) {
        const text = batch[j];
        const originalIndex = i + j;
        let output: { data: unknown; dispose?: () => void } | null = null;

        try {
          output = await this.pipeline(text, {
            pooling: 'mean',
            normalize: true,
          });
          const vector = Array.from(output!.data as Float32Array);
          vectors.push(vector);
          successIndices.push(originalIndex);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('EmbeddingEngine', 'Failed to embed text in batch', {
            error: err.message,
            textLength: text.length,
            textIndex: originalIndex,
          });
          // Track failure but don't add zero vector (MCP-13)
          failedCount++;
        } finally {
          // Dispose tensor to free memory (Bug #10)
          if (output && typeof output.dispose === 'function') {
            try {
              output.dispose();
            } catch {
              // Ignore disposal errors
            }
          }
        }

        processedCount++;
        // Report progress
        if (onProgress) {
          onProgress(processedCount, texts.length);
        }
      }
    }

    logger.info('EmbeddingEngine', 'Batch embedding complete', {
      totalVectors: vectors.length,
      failedCount,
    });

    return { vectors, successIndices, failedCount };
  }

  /**
   * Embed texts and return full results with original text.
   *
   * SECURITY (SMCP-054): Returns only successful embeddings.
   * Failed embeddings are excluded from results (no zero vectors).
   *
   * @param texts - Array of texts to embed
   * @param onProgress - Optional callback for progress updates
   * @returns Array of EmbeddingResult objects for successful embeddings only
   */
  async embedWithResults(
    texts: string[],
    onProgress?: EmbeddingProgressCallback
  ): Promise<EmbeddingResult[]> {
    const batchResult = await this.embedBatchWithStats(texts, onProgress);

    // Return only successful embeddings (SMCP-054: no zero vectors)
    return batchResult.successIndices.map((originalIndex, successIdx) => ({
      text: texts[originalIndex],
      vector: batchResult.vectors[successIdx],
      success: true,
    }));
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

/**
 * Singleton instance for code embedding engine
 */
let codeEngineInstance: EmbeddingEngine | null = null;

/**
 * Singleton instance for docs embedding engine
 */
let docsEngineInstance: EmbeddingEngine | null = null;

/**
 * @deprecated Legacy singleton instance. Use getCodeEmbeddingEngine() or getDocsEmbeddingEngine() instead.
 */
let engineInstance: EmbeddingEngine | null = null;

/**
 * Get the singleton code embedding engine instance.
 *
 * Uses BGE-small model (384 dimensions) optimized for code search.
 * Creates a new instance if one doesn't exist.
 * The instance must be initialized before use via initialize().
 *
 * @returns The singleton EmbeddingEngine instance for code
 */
export function getCodeEmbeddingEngine(): EmbeddingEngine {
  if (!codeEngineInstance) {
    codeEngineInstance = new EmbeddingEngine(CODE_ENGINE_CONFIG);
  }
  return codeEngineInstance;
}

/**
 * Get the singleton docs embedding engine instance.
 *
 * Uses BGE-base model (768 dimensions) optimized for prose/documentation search.
 * Creates a new instance if one doesn't exist.
 * The instance must be initialized before use via initialize().
 *
 * @returns The singleton EmbeddingEngine instance for docs
 */
export function getDocsEmbeddingEngine(): EmbeddingEngine {
  if (!docsEngineInstance) {
    docsEngineInstance = new EmbeddingEngine(DOCS_ENGINE_CONFIG);
  }
  return docsEngineInstance;
}

/**
 * @deprecated Use getCodeEmbeddingEngine() or getDocsEmbeddingEngine() instead.
 * Get the singleton embedding engine instance.
 *
 * For backward compatibility, returns the code embedding engine.
 * Creates a new instance if one doesn't exist.
 * The instance must be initialized before use via initialize().
 *
 * @returns The singleton EmbeddingEngine instance (code engine)
 */
export function getEmbeddingEngine(): EmbeddingEngine {
  // For backward compatibility, use the legacy instance if it exists
  // Otherwise, return the code engine
  if (!engineInstance) {
    engineInstance = getCodeEmbeddingEngine();
  }
  return engineInstance;
}

/**
 * Reset the code embedding engine singleton instance.
 * Mainly used for testing purposes.
 */
export function resetCodeEmbeddingEngine(): void {
  codeEngineInstance = null;
}

/**
 * Reset the docs embedding engine singleton instance.
 * Mainly used for testing purposes.
 */
export function resetDocsEmbeddingEngine(): void {
  docsEngineInstance = null;
}

/**
 * Reset all singleton instances.
 * Mainly used for testing purposes.
 */
export function resetEmbeddingEngine(): void {
  engineInstance = null;
  codeEngineInstance = null;
  docsEngineInstance = null;
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
 * SECURITY (SMCP-054): Returns BatchEmbeddingResult with only successful embeddings.
 * No zero vectors are inserted for failed embeddings.
 *
 * @param texts - Array of texts to embed
 * @param onProgress - Optional callback for progress updates
 * @returns BatchEmbeddingResult with successful embeddings, their indices, and failure count
 */
export async function embedBatch(
  texts: string[],
  onProgress?: EmbeddingProgressCallback
): Promise<BatchEmbeddingResult> {
  const engine = getEmbeddingEngine();
  return engine.embedBatch(texts, onProgress);
}
