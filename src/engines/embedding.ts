/**
 * Embedding Engine
 *
 * Implements local vector generation using @huggingface/transformers v3.
 * Supports dual models: BGE-small for code (384 dims) and BGE-base for docs (768 dims).
 * Handles model download on first use and batch processing for efficiency.
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { getLogger } from '../utils/logger.js';
import { modelDownloadFailed } from '../errors/index.js';
import {
  type ComputeDevice,
  type DeviceInfo,
  detectBestDevice,
  formatDeviceInfo,
} from './deviceDetection.js';

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
 * Batch size for processing multiple texts on CPU
 * 32 is a good balance between speed and memory usage
 */
export const BATCH_SIZE = 32;

/**
 * Batch size for processing multiple texts on GPU
 * GPU can handle larger batches efficiently due to parallelism
 */
export const GPU_BATCH_SIZE = 64;

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
  /**
   * Compute device to use for embedding generation.
   * - 'webgpu': Use GPU acceleration (browser only, requires WebGPU support)
   * - 'dml': Use DirectML GPU acceleration (Windows Node.js only)
   * - 'cpu': Use CPU with WASM backend
   * - undefined: Auto-detect best available device
   */
  device?: ComputeDevice;
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
  /** The compute device being used (set after initialization) */
  private deviceInfo: DeviceInfo | null = null;
  /** Whether a fallback from GPU to CPU occurred */
  private didFallback = false;
  /** Reason for fallback if one occurred */
  private fallbackReason: string | null = null;

  /**
   * Create a new EmbeddingEngine with the specified configuration.
   * @param config - The configuration for this engine (defaults to code engine config)
   */
  constructor(config: EmbeddingEngineConfig = CODE_ENGINE_CONFIG) {
    this.config = config;
  }

  /**
   * Get the compute device being used by this engine.
   * Returns null if the engine has not been initialized yet.
   * @returns Device info or null if not initialized
   */
  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  /**
   * Get the compute device type being used.
   * @returns 'webgpu', 'cpu', or undefined if not initialized
   */
  getDevice(): ComputeDevice | undefined {
    return this.deviceInfo?.device;
  }

  /**
   * Check if a fallback from GPU to CPU occurred during initialization.
   * @returns True if fallback occurred
   */
  didFallbackToCPU(): boolean {
    return this.didFallback;
  }

  /**
   * Get the reason for fallback if one occurred.
   * @returns Fallback reason string or null
   */
  getFallbackReason(): string | null {
    return this.fallbackReason;
  }

  /**
   * Get the effective batch size based on the compute device.
   * GPU (WebGPU or DirectML) can handle larger batches efficiently.
   * @returns Batch size to use
   */
  getEffectiveBatchSize(): number {
    const device = this.deviceInfo?.device;
    return device === 'webgpu' || device === 'dml' ? GPU_BATCH_SIZE : BATCH_SIZE;
  }

  /**
   * Check if GPU acceleration is being used.
   * @returns True if using WebGPU or DirectML
   */
  isUsingGPU(): boolean {
    const device = this.deviceInfo?.device;
    return device === 'webgpu' || device === 'dml';
  }

  /**
   * Initialize the embedding model.
   *
   * Downloads the model on first use (~90MB to ~/.cache/huggingface/).
   * This operation is idempotent - calling it multiple times is safe.
   *
   * BUG #9 FIX: Uses atomic state transitions to ensure consistent state
   * after failures. The initializationPromise is only cleared if the
   * pipeline was not successfully set, allowing proper retry behavior.
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

    // BUG #9 FIX: Wrap initialization in a promise that handles state atomically
    this.initializationPromise = (async () => {
      try {
        await this.loadModel(onProgress);
      } catch (error) {
        // Atomic reset on any failure - ensure pipeline is null
        this.pipeline = null;
        throw error;
      }
    })();

    try {
      await this.initializationPromise;
    } finally {
      // BUG #9 FIX: Clear the promise after completion (success or failure)
      // so retries can happen, but only if pipeline was not successfully set
      if (!this.pipeline) {
        this.initializationPromise = null;
      }
    }
  }

  /**
   * Load the embedding model with GPU support and automatic fallback to CPU.
   *
   * Device selection priority:
   * 1. If config.device is specified, use that device
   * 2. Otherwise, auto-detect the best available device:
   *    - Browser: WebGPU > CPU
   *    - Windows Node.js: DirectML > CPU
   *    - macOS/Linux Node.js: CPU only
   *
   * If GPU initialization fails, automatically falls back to CPU.
   */
  private async loadModel(onProgress?: DownloadProgressCallback): Promise<void> {
    const logger = getLogger();
    logger.info('EmbeddingEngine', `Initializing ${this.config.displayName} embedding model...`, {
      model: this.config.modelName,
    });

    // Step 1: Determine which device to use
    let targetDevice: ComputeDevice;
    if (this.config.device) {
      // User explicitly specified a device
      targetDevice = this.config.device;
      this.deviceInfo = {
        device: targetDevice,
        gpuName:
          targetDevice === 'webgpu'
            ? 'User-specified GPU'
            : targetDevice === 'dml'
              ? 'DirectML GPU'
              : undefined,
      };
      logger.info('EmbeddingEngine', `Using user-specified device: ${targetDevice}`);
    } else {
      // Auto-detect the best available device
      logger.info('EmbeddingEngine', 'Auto-detecting compute device...');
      this.deviceInfo = await detectBestDevice();
      targetDevice = this.deviceInfo.device;
      logger.info('EmbeddingEngine', `Detected device: ${formatDeviceInfo(this.deviceInfo)}`);
    }

    // Step 2: Try to initialize with the target device
    try {
      await this.initializePipelineWithDevice(targetDevice, onProgress);

      logger.info('EmbeddingEngine', `${this.config.displayName} embedding model initialized successfully`, {
        model: this.config.modelName,
        dimension: this.config.dimension,
        device: targetDevice,
        gpuName: this.deviceInfo?.gpuName,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // If we tried a GPU device and failed, fall back to CPU
      const isGPUDevice = targetDevice === 'webgpu' || targetDevice === 'dml';
      if (isGPUDevice) {
        const gpuType = targetDevice === 'webgpu' ? 'WebGPU' : 'DirectML';
        logger.warn('EmbeddingEngine', `${gpuType} initialization failed, falling back to CPU`, {
          error: err.message,
        });

        this.didFallback = true;
        this.fallbackReason = err.message;

        try {
          await this.initializePipelineWithDevice('cpu', onProgress);
          this.deviceInfo = {
            device: 'cpu',
            fallbackReason: `${gpuType} failed: ${err.message}`,
          };

          logger.info('EmbeddingEngine', `${this.config.displayName} model initialized on CPU (fallback)`, {
            model: this.config.modelName,
            dimension: this.config.dimension,
            fallbackReason: err.message,
          });
          return;
        } catch (cpuError) {
          const cpuErr = cpuError instanceof Error ? cpuError : new Error(String(cpuError));
          logger.error('EmbeddingEngine', `CPU fallback also failed`, {
            error: cpuErr.message,
          });
          throw modelDownloadFailed(cpuErr);
        }
      }

      // CPU initialization failed (no fallback available)
      logger.error('EmbeddingEngine', `Failed to initialize ${this.config.displayName} embedding model`, {
        error: err.message,
        model: this.config.modelName,
      });
      throw modelDownloadFailed(err);
    }
  }

  /**
   * Initialize the pipeline with a specific device.
   * Handles shader compilation detection for WebGPU and DirectML initialization.
   */
  private async initializePipelineWithDevice(
    device: ComputeDevice,
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    const logger = getLogger();
    const startTime = Date.now();
    let shaderCompilationLogged = false;

    // Format device name for logging
    const deviceDisplayName =
      device === 'webgpu' ? 'WebGPU' : device === 'dml' ? 'DirectML' : 'CPU';

    logger.info(
      'EmbeddingEngine',
      `Loading ${this.config.displayName} model on ${deviceDisplayName} (may download on first use)...`
    );

    // Create the feature extraction pipeline
    // Note: Using @ts-expect-error due to complex union types in @huggingface/transformers v3
    // The pipeline function has 60+ overloads which exceed TypeScript's union type complexity limit
    // @ts-expect-error - TypeScript cannot handle the complex union type of pipeline()
    this.pipeline = await pipeline('feature-extraction', this.config.modelName, {
      device: device,
      dtype: 'fp32', // Use fp32 for consistent embeddings across devices
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

        // Detect shader compilation for GPU devices (first run only)
        // Shader compilation typically happens after model download and takes 10-30 seconds
        const isGPU = device === 'webgpu' || device === 'dml';
        if (isGPU && progress.status === 'ready' && !shaderCompilationLogged) {
          const elapsed = Date.now() - startTime;
          // If initialization took longer than 5 seconds, shaders were likely being compiled
          if (elapsed > 5000) {
            logger.info('EmbeddingEngine', `${deviceDisplayName} shaders compiled (first run only)`, {
              compilationTimeMs: elapsed,
            });
            shaderCompilationLogged = true;
          }
        }

        // Call user callback if provided
        if (onProgress) {
          onProgress(progress);
        }
      },
    });

    // Log a hint about shader compilation on first GPU run
    const isGPU = device === 'webgpu' || device === 'dml';
    if (isGPU) {
      const elapsed = Date.now() - startTime;
      if (elapsed > 5000 && !shaderCompilationLogged) {
        logger.info('EmbeddingEngine', `${deviceDisplayName} initialized (subsequent runs will be faster)`, {
          initTimeMs: elapsed,
        });
      }
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
   * Batch size is optimized based on compute device:
   * - GPU: 64 texts per batch (higher parallelism)
   * - CPU: 32 texts per batch (balance speed and memory)
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
   * Performance logging includes:
   * - Compute device being used (WebGPU/CPU)
   * - Chunks per second throughput
   * - Total processing time
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
    const effectiveBatchSize = this.getEffectiveBatchSize();
    const deviceType = this.deviceInfo?.device || 'cpu';
    const startTime = Date.now();

    logger.info('EmbeddingEngine', 'Starting batch embedding', {
      totalTexts: texts.length,
      batchSize: effectiveBatchSize,
      device: deviceType,
      gpuName: this.deviceInfo?.gpuName,
    });

    const vectors: number[][] = [];
    const successIndices: number[] = [];
    let failedCount = 0;
    const totalBatches = Math.ceil(texts.length / effectiveBatchSize);
    let processedCount = 0;

    for (let i = 0; i < texts.length; i += effectiveBatchSize) {
      const batch = texts.slice(i, i + effectiveBatchSize);
      const batchIndex = Math.floor(i / effectiveBatchSize) + 1;
      const batchStartTime = Date.now();

      logger.debug('EmbeddingEngine', `Processing batch ${batchIndex}/${totalBatches}`, {
        batchSize: batch.length,
        device: deviceType,
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
            device: deviceType,
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

      // Log batch performance
      const batchElapsed = Date.now() - batchStartTime;
      const batchChunksPerSec = batch.length / (batchElapsed / 1000);
      logger.debug('EmbeddingEngine', `Batch ${batchIndex} complete`, {
        batchElapsedMs: batchElapsed,
        chunksPerSec: Math.round(batchChunksPerSec),
        device: deviceType,
      });
    }

    // Calculate and log overall performance metrics
    const totalElapsed = Date.now() - startTime;
    const totalSeconds = totalElapsed / 1000;
    const overallChunksPerSec = vectors.length / totalSeconds;

    logger.info('EmbeddingEngine', 'Batch embedding complete', {
      totalVectors: vectors.length,
      failedCount,
      totalTimeMs: totalElapsed,
      chunksPerSec: Math.round(overallChunksPerSec),
      device: deviceType,
      gpuName: this.deviceInfo?.gpuName,
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
