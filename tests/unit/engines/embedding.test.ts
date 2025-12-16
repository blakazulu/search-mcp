/**
 * Embedding Engine Tests
 *
 * Tests cover:
 * - Model configuration constants
 * - EmbeddingEngine class initialization
 * - Single text embedding
 * - Batch embedding with progress callback
 * - Singleton pattern
 * - Error handling
 *
 * Note: Tests mock the @huggingface/transformers module to avoid
 * downloading the model during CI runs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EmbeddingProgressCallback } from '../../../src/engines/embedding.js';

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Create a mock tensor output that mimics @huggingface/transformers output
 */
function createMockTensorOutput(dimension: number = 384): { data: Float32Array } {
  // Create a mock 384-dimensional vector with normalized values
  const data = new Float32Array(dimension);
  for (let i = 0; i < dimension; i++) {
    data[i] = Math.random() * 0.1 - 0.05; // Small random values
  }
  // Normalize the vector
  const magnitude = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0));
  for (let i = 0; i < dimension; i++) {
    data[i] = data[i] / magnitude;
  }
  return { data };
}

/**
 * Mock pipeline function that simulates the transformers pipeline
 */
const mockPipelineInstance = vi.fn();
const mockPipeline = vi.fn();

// Mock the @huggingface/transformers module
vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args),
}));

// ============================================================================
// Tests
// ============================================================================

describe('Embedding Engine', () => {
  // Reset mocks and module state before each test
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset the singleton by re-importing the module
    vi.resetModules();

    // Setup default mock behavior
    mockPipelineInstance.mockResolvedValue(createMockTensorOutput());
    mockPipeline.mockResolvedValue(mockPipelineInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constants', () => {
    it('should export correct CODE_MODEL_NAME', async () => {
      const { CODE_MODEL_NAME } = await import('../../../src/engines/embedding.js');
      expect(CODE_MODEL_NAME).toBe('Xenova/bge-small-en-v1.5');
    });

    it('should export correct CODE_EMBEDDING_DIMENSION', async () => {
      const { CODE_EMBEDDING_DIMENSION } = await import('../../../src/engines/embedding.js');
      expect(CODE_EMBEDDING_DIMENSION).toBe(384);
    });

    it('should export correct DOCS_MODEL_NAME', async () => {
      const { DOCS_MODEL_NAME } = await import('../../../src/engines/embedding.js');
      expect(DOCS_MODEL_NAME).toBe('Xenova/bge-base-en-v1.5');
    });

    it('should export correct DOCS_EMBEDDING_DIMENSION', async () => {
      const { DOCS_EMBEDDING_DIMENSION } = await import('../../../src/engines/embedding.js');
      expect(DOCS_EMBEDDING_DIMENSION).toBe(768);
    });

    it('should export deprecated MODEL_NAME (backward compat)', async () => {
      const { MODEL_NAME, CODE_MODEL_NAME } = await import('../../../src/engines/embedding.js');
      expect(MODEL_NAME).toBe(CODE_MODEL_NAME);
    });

    it('should export deprecated EMBEDDING_DIMENSION (backward compat)', async () => {
      const { EMBEDDING_DIMENSION, CODE_EMBEDDING_DIMENSION } = await import('../../../src/engines/embedding.js');
      expect(EMBEDDING_DIMENSION).toBe(CODE_EMBEDDING_DIMENSION);
    });

    it('should export correct BATCH_SIZE', async () => {
      const { BATCH_SIZE } = await import('../../../src/engines/embedding.js');
      expect(BATCH_SIZE).toBe(32);
    });
  });

  describe('EmbeddingEngine class', () => {
    describe('initialization', () => {
      it('should start uninitialized', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();
        expect(engine.isInitialized()).toBe(false);
      });

      it('should initialize successfully', async () => {
        const { EmbeddingEngine, CODE_MODEL_NAME } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await engine.initialize();

        expect(engine.isInitialized()).toBe(true);
        expect(mockPipeline).toHaveBeenCalledWith(
          'feature-extraction',
          CODE_MODEL_NAME,
          expect.objectContaining({
            progress_callback: expect.any(Function),
          })
        );
      });

      it('should be idempotent - multiple initialize calls should only load once', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await engine.initialize();
        await engine.initialize();
        await engine.initialize();

        expect(mockPipeline).toHaveBeenCalledTimes(1);
      });

      it('should handle concurrent initialize calls', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        // Start multiple concurrent initializations
        await Promise.all([
          engine.initialize(),
          engine.initialize(),
          engine.initialize(),
        ]);

        expect(mockPipeline).toHaveBeenCalledTimes(1);
      });

      it('should call progress callback during initialization', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        // Capture the progress callback
        let capturedCallback: ((progress: unknown) => void) | null = null;
        mockPipeline.mockImplementation(
          async (_task: string, _model: string, options: { progress_callback?: (progress: unknown) => void }) => {
            capturedCallback = options.progress_callback || null;
            // Simulate progress events
            if (capturedCallback) {
              capturedCallback({ status: 'download', file: 'model.onnx', progress: 50 });
              capturedCallback({ status: 'done', file: 'model.onnx' });
            }
            return mockPipelineInstance;
          }
        );

        const progressEvents: unknown[] = [];
        await engine.initialize((progress) => {
          progressEvents.push(progress);
        });

        expect(progressEvents.length).toBeGreaterThan(0);
        expect(progressEvents[0]).toMatchObject({ status: 'download' });
      });

      it('should throw MODEL_DOWNLOAD_FAILED on initialization error', async () => {
        mockPipeline.mockRejectedValue(new Error('Network error'));

        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await expect(engine.initialize()).rejects.toMatchObject({
          code: 'MODEL_DOWNLOAD_FAILED',
        });
      });

      it('should allow retry after initialization failure', async () => {
        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        // Use explicit CPU device to avoid DirectML fallback behavior
        const engine = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'cpu' });

        // First call fails
        mockPipeline.mockRejectedValueOnce(new Error('Network error'));

        await expect(engine.initialize()).rejects.toThrow();

        // Second call succeeds
        mockPipeline.mockResolvedValue(mockPipelineInstance);

        await engine.initialize();
        expect(engine.isInitialized()).toBe(true);
      });
    });

    describe('getDimension', () => {
      it('should return 384 for default (code) engine', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();
        expect(engine.getDimension()).toBe(384);
      });

      it('should return configured dimension for docs engine', async () => {
        const { EmbeddingEngine, DOCS_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(DOCS_ENGINE_CONFIG);
        expect(engine.getDimension()).toBe(768);
      });
    });

    describe('getModelName', () => {
      it('should return code model name for default engine', async () => {
        const { EmbeddingEngine, CODE_MODEL_NAME } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();
        expect(engine.getModelName()).toBe(CODE_MODEL_NAME);
      });

      it('should return docs model name for docs engine', async () => {
        const { EmbeddingEngine, DOCS_ENGINE_CONFIG, DOCS_MODEL_NAME } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(DOCS_ENGINE_CONFIG);
        expect(engine.getModelName()).toBe(DOCS_MODEL_NAME);
      });
    });

    describe('getDisplayName', () => {
      it('should return display name for code engine', async () => {
        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(CODE_ENGINE_CONFIG);
        expect(engine.getDisplayName()).toBe('Code (BGE-small)');
      });

      it('should return display name for docs engine', async () => {
        const { EmbeddingEngine, DOCS_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(DOCS_ENGINE_CONFIG);
        expect(engine.getDisplayName()).toBe('Docs (BGE-base)');
      });
    });

    describe('docs engine embedding', () => {
      it('should embed text with 768-dimensional vector for docs engine', async () => {
        // Setup mock to return 768-dimensional vectors
        mockPipelineInstance.mockResolvedValue(createMockTensorOutput(768));

        const { EmbeddingEngine, DOCS_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(DOCS_ENGINE_CONFIG);

        const vector = await engine.embed('# README');

        expect(vector).toBeInstanceOf(Array);
        expect(vector.length).toBe(768);
      });

      it('should validate dimension for docs engine', async () => {
        // Mock returns 384-dimensional vector (wrong for docs engine)
        mockPipelineInstance.mockResolvedValue(createMockTensorOutput(384));

        const { EmbeddingEngine, DOCS_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(DOCS_ENGINE_CONFIG);

        // Should throw error because we expect 768 but got 384
        await expect(engine.embed('Test text')).rejects.toThrow(
          'Invalid embedding dimension: expected 768, got 384'
        );
      });

      it('should use docs model name when initializing', async () => {
        mockPipelineInstance.mockResolvedValue(createMockTensorOutput(768));

        const { EmbeddingEngine, DOCS_ENGINE_CONFIG, DOCS_MODEL_NAME } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(DOCS_ENGINE_CONFIG);

        await engine.initialize();

        expect(mockPipeline).toHaveBeenCalledWith(
          'feature-extraction',
          DOCS_MODEL_NAME,
          expect.objectContaining({
            progress_callback: expect.any(Function),
          })
        );
      });
    });

    describe('embed', () => {
      it('should embed single text and return 384-dimensional vector', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const vector = await engine.embed('Hello, world!');

        expect(vector).toBeInstanceOf(Array);
        expect(vector.length).toBe(384);
        expect(vector.every((v) => typeof v === 'number')).toBe(true);
      });

      it('should auto-initialize if not already initialized', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        expect(engine.isInitialized()).toBe(false);

        await engine.embed('Test text');

        expect(engine.isInitialized()).toBe(true);
      });

      it('should call pipeline with correct options', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await engine.embed('Test text');

        expect(mockPipelineInstance).toHaveBeenCalledWith('Test text', {
          pooling: 'mean',
          normalize: true,
        });
      });

      it('should handle empty string', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const vector = await engine.embed('');

        expect(vector).toBeInstanceOf(Array);
        expect(vector.length).toBe(384);
      });

      it('should handle long text', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const longText = 'word '.repeat(1000);
        const vector = await engine.embed(longText);

        expect(vector).toBeInstanceOf(Array);
        expect(vector.length).toBe(384);
      });

      it('should handle unicode text', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const unicodeText = 'Hello world!';
        const vector = await engine.embed(unicodeText);

        expect(vector).toBeInstanceOf(Array);
        expect(vector.length).toBe(384);
      });

      it('should produce normalized vectors', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const vector = await engine.embed('Test text');

        // Check that vector is normalized (magnitude close to 1)
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        expect(magnitude).toBeCloseTo(1, 2);
      });

      it('should throw error on dimension mismatch (SMCP-054)', async () => {
        // Mock pipeline to return wrong dimension
        mockPipelineInstance.mockImplementation(() => {
          // Return a 256-dimensional vector instead of 384
          return { data: new Float32Array(256).fill(0.1) };
        });

        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        // Should throw an error for dimension mismatch
        await expect(engine.embed('Test text')).rejects.toThrow(
          'Invalid embedding dimension: expected 384, got 256'
        );
      });
    });

    describe('embedBatch', () => {
      it('should return empty result for empty input', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const result = await engine.embedBatch([]);

        expect(result.vectors).toEqual([]);
        expect(result.successIndices).toEqual([]);
        expect(result.failedCount).toBe(0);
      });

      it('should embed multiple texts', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = ['Hello', 'World', 'Test'];
        const result = await engine.embedBatch(texts);

        expect(result.vectors.length).toBe(3);
        result.vectors.forEach((vector) => {
          expect(vector.length).toBe(384);
        });
      });

      it('should maintain order of embeddings', async () => {
        // Create distinct mock outputs for each text
        let callCount = 0;
        mockPipelineInstance.mockImplementation(() => {
          const output = createMockTensorOutput();
          // Mark each output with its index
          output.data[0] = callCount++;
          return output;
        });

        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = ['Text 1', 'Text 2', 'Text 3'];
        const result = await engine.embedBatch(texts);

        // Verify order is preserved
        expect(result.vectors[0][0]).toBe(0);
        expect(result.vectors[1][0]).toBe(1);
        expect(result.vectors[2][0]).toBe(2);
      });

      it('should call progress callback with correct values', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = ['Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5'];
        const progressCalls: Array<{ completed: number; total: number }> = [];

        await engine.embedBatch(texts, (completed, total) => {
          progressCalls.push({ completed, total });
        });

        expect(progressCalls.length).toBe(5);
        expect(progressCalls[0]).toEqual({ completed: 1, total: 5 });
        expect(progressCalls[4]).toEqual({ completed: 5, total: 5 });
      });

      it('should process in batches', async () => {
        const { EmbeddingEngine, BATCH_SIZE } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        // Create more texts than batch size
        const texts = Array.from({ length: BATCH_SIZE + 10 }, (_, i) => `Text ${i}`);

        await engine.embedBatch(texts);

        // Pipeline should be called once for each text
        expect(mockPipelineInstance).toHaveBeenCalledTimes(texts.length);
      });

      it('should handle errors in individual texts gracefully (SMCP-054)', async () => {
        // Make the third call fail
        let callCount = 0;
        mockPipelineInstance.mockImplementation(() => {
          callCount++;
          if (callCount === 3) {
            throw new Error('Embedding failed');
          }
          return createMockTensorOutput();
        });

        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = ['Text 1', 'Text 2', 'Text 3', 'Text 4'];
        const result = await engine.embedBatch(texts);

        // SMCP-054: Should return BatchEmbeddingResult with only successful embeddings
        // No zero vectors should be inserted
        expect(result.vectors.length).toBe(3); // 4 texts - 1 failure = 3 successful
        expect(result.successIndices).toEqual([0, 1, 3]); // Index 2 (Text 3) failed
        expect(result.failedCount).toBe(1);

        // Verify no vectors are all zeros (zero vector check)
        for (const vector of result.vectors) {
          const isZeroVector = vector.every((v) => v === 0);
          expect(isZeroVector).toBe(false);
        }
      });

      it('should handle large batches efficiently', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = Array.from({ length: 100 }, (_, i) => `Text ${i}`);
        const progressCalls: number[] = [];

        const result = await engine.embedBatch(texts, (completed) => {
          progressCalls.push(completed);
        });

        expect(result.vectors.length).toBe(100);
        expect(result.failedCount).toBe(0);
        expect(progressCalls.length).toBe(100);
        expect(progressCalls[99]).toBe(100);
      });

      it('should never insert zero vectors (SMCP-054)', async () => {
        // Make multiple calls fail
        let callCount = 0;
        mockPipelineInstance.mockImplementation(() => {
          callCount++;
          if (callCount % 3 === 0) {
            throw new Error('Embedding failed');
          }
          return createMockTensorOutput();
        });

        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = Array.from({ length: 10 }, (_, i) => `Text ${i}`);
        const result = await engine.embedBatch(texts);

        // With 10 texts and every 3rd failing: texts 0,1,3,4,6,7,9 succeed (7 total)
        // texts 2, 5, 8 fail (3 total)
        expect(result.failedCount).toBe(3);
        expect(result.vectors.length).toBe(7);

        // Verify no vectors are all zeros
        for (const vector of result.vectors) {
          const isZeroVector = vector.every((v) => v === 0);
          expect(isZeroVector).toBe(false);
        }

        // Verify success indices are correct (0, 1, 3, 4, 6, 7, 9)
        expect(result.successIndices).toEqual([0, 1, 3, 4, 6, 7, 9]);
      });
    });

    describe('embedWithResults', () => {
      it('should return results with original text and vector', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = ['Hello', 'World'];
        const results = await engine.embedWithResults(texts);

        expect(results.length).toBe(2);
        expect(results[0].text).toBe('Hello');
        expect(results[0].vector.length).toBe(384);
        expect(results[1].text).toBe('World');
        expect(results[1].vector.length).toBe(384);
      });
    });
  });

  describe('Singleton pattern', () => {
    describe('getCodeEmbeddingEngine', () => {
      it('should return same instance on repeated calls', async () => {
        const { getCodeEmbeddingEngine } = await import('../../../src/engines/embedding.js');

        const engine1 = getCodeEmbeddingEngine();
        const engine2 = getCodeEmbeddingEngine();

        expect(engine1).toBe(engine2);
      });

      it('should return engine with code model config', async () => {
        const { getCodeEmbeddingEngine, CODE_MODEL_NAME, CODE_EMBEDDING_DIMENSION } = await import('../../../src/engines/embedding.js');

        const engine = getCodeEmbeddingEngine();

        expect(engine.getModelName()).toBe(CODE_MODEL_NAME);
        expect(engine.getDimension()).toBe(CODE_EMBEDDING_DIMENSION);
      });

      it('should reset with resetCodeEmbeddingEngine', async () => {
        const { getCodeEmbeddingEngine, resetCodeEmbeddingEngine } = await import('../../../src/engines/embedding.js');

        const engine1 = getCodeEmbeddingEngine();
        resetCodeEmbeddingEngine();
        const engine2 = getCodeEmbeddingEngine();

        expect(engine1).not.toBe(engine2);
      });
    });

    describe('getDocsEmbeddingEngine', () => {
      it('should return same instance on repeated calls', async () => {
        const { getDocsEmbeddingEngine } = await import('../../../src/engines/embedding.js');

        const engine1 = getDocsEmbeddingEngine();
        const engine2 = getDocsEmbeddingEngine();

        expect(engine1).toBe(engine2);
      });

      it('should return engine with docs model config', async () => {
        const { getDocsEmbeddingEngine, DOCS_MODEL_NAME, DOCS_EMBEDDING_DIMENSION } = await import('../../../src/engines/embedding.js');

        const engine = getDocsEmbeddingEngine();

        expect(engine.getModelName()).toBe(DOCS_MODEL_NAME);
        expect(engine.getDimension()).toBe(DOCS_EMBEDDING_DIMENSION);
      });

      it('should reset with resetDocsEmbeddingEngine', async () => {
        const { getDocsEmbeddingEngine, resetDocsEmbeddingEngine } = await import('../../../src/engines/embedding.js');

        const engine1 = getDocsEmbeddingEngine();
        resetDocsEmbeddingEngine();
        const engine2 = getDocsEmbeddingEngine();

        expect(engine1).not.toBe(engine2);
      });
    });

    describe('getEmbeddingEngine (deprecated, backward compat)', () => {
      it('should return same instance on repeated calls', async () => {
        const { getEmbeddingEngine } = await import('../../../src/engines/embedding.js');

        const engine1 = getEmbeddingEngine();
        const engine2 = getEmbeddingEngine();

        expect(engine1).toBe(engine2);
      });

      it('should return code engine for backward compatibility', async () => {
        const { getEmbeddingEngine, CODE_MODEL_NAME } = await import('../../../src/engines/embedding.js');

        const engine = getEmbeddingEngine();

        expect(engine.getModelName()).toBe(CODE_MODEL_NAME);
        expect(engine.getDimension()).toBe(384);
      });
    });

    describe('resetEmbeddingEngine', () => {
      it('should reset all singleton instances', async () => {
        const { getCodeEmbeddingEngine, getDocsEmbeddingEngine, getEmbeddingEngine, resetEmbeddingEngine } = await import('../../../src/engines/embedding.js');

        const codeEngine1 = getCodeEmbeddingEngine();
        const docsEngine1 = getDocsEmbeddingEngine();
        const legacyEngine1 = getEmbeddingEngine();

        resetEmbeddingEngine();

        const codeEngine2 = getCodeEmbeddingEngine();
        const docsEngine2 = getDocsEmbeddingEngine();
        const legacyEngine2 = getEmbeddingEngine();

        expect(codeEngine1).not.toBe(codeEngine2);
        expect(docsEngine1).not.toBe(docsEngine2);
        expect(legacyEngine1).not.toBe(legacyEngine2);
      });
    });

    describe('code and docs engines are separate', () => {
      it('should return different instances for code and docs', async () => {
        const { getCodeEmbeddingEngine, getDocsEmbeddingEngine } = await import('../../../src/engines/embedding.js');

        const codeEngine = getCodeEmbeddingEngine();
        const docsEngine = getDocsEmbeddingEngine();

        expect(codeEngine).not.toBe(docsEngine);
        expect(codeEngine.getDimension()).toBe(384);
        expect(docsEngine.getDimension()).toBe(768);
      });
    });
  });

  describe('Convenience functions', () => {
    describe('embedText', () => {
      it('should embed text using singleton engine', async () => {
        const { embedText } = await import('../../../src/engines/embedding.js');

        const vector = await embedText('Hello, world!');

        expect(vector.length).toBe(384);
      });
    });

    describe('embedBatch', () => {
      it('should embed batch using singleton engine', async () => {
        const { embedBatch } = await import('../../../src/engines/embedding.js');

        const result = await embedBatch(['Hello', 'World']);

        expect(result.vectors.length).toBe(2);
        result.vectors.forEach((v) => expect(v.length).toBe(384));
      });

      it('should support progress callback', async () => {
        const { embedBatch } = await import('../../../src/engines/embedding.js');

        const progressCalls: number[] = [];
        await embedBatch(['Text 1', 'Text 2'], (completed) => {
          progressCalls.push(completed);
        });

        expect(progressCalls).toEqual([1, 2]);
      });
    });
  });

  describe('Type exports', () => {
    it('should export EmbeddingResult interface', async () => {
      const { embedText } = await import('../../../src/engines/embedding.js');

      const vector = await embedText('test');

      // Type check - if this compiles, the interface is correctly exported
      const result: { text: string; vector: number[] } = {
        text: 'test',
        vector,
      };

      expect(result).toBeDefined();
    });

    it('should export EmbeddingProgressCallback type', async () => {
      const { embedBatch } = await import('../../../src/engines/embedding.js');

      // Type check - callback matches EmbeddingProgressCallback
      const callback: EmbeddingProgressCallback = (completed, total) => {
        expect(typeof completed).toBe('number');
        expect(typeof total).toBe('number');
      };

      await embedBatch(['test'], callback);
    });
  });

  describe('WebGPU Integration (SMCP-081)', () => {
    describe('GPU_BATCH_SIZE constant', () => {
      it('should export GPU_BATCH_SIZE', async () => {
        const { GPU_BATCH_SIZE } = await import('../../../src/engines/embedding.js');
        expect(GPU_BATCH_SIZE).toBe(64);
      });

      it('GPU_BATCH_SIZE should be larger than CPU BATCH_SIZE', async () => {
        const { BATCH_SIZE, GPU_BATCH_SIZE } = await import('../../../src/engines/embedding.js');
        expect(GPU_BATCH_SIZE).toBeGreaterThan(BATCH_SIZE);
      });
    });

    describe('EmbeddingEngineConfig.device option', () => {
      it('should accept device option in config', async () => {
        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');

        // Should not throw when creating engine with device option
        const engineCPU = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'cpu' });
        expect(engineCPU).toBeDefined();

        const engineGPU = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'webgpu' });
        expect(engineGPU).toBeDefined();
      });
    });

    describe('Device info methods', () => {
      it('getDeviceInfo should return null before initialization', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        expect(engine.getDeviceInfo()).toBeNull();
      });

      it('getDevice should return undefined before initialization', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        expect(engine.getDevice()).toBeUndefined();
      });

      it('getDeviceInfo should return device info after initialization', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await engine.initialize();

        const deviceInfo = engine.getDeviceInfo();
        expect(deviceInfo).not.toBeNull();
        // Accept any valid device type - 'dml' on Windows, 'cpu' elsewhere
        expect(['cpu', 'webgpu', 'dml']).toContain(deviceInfo!.device);
      });

      it('getDevice should return device type after initialization', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await engine.initialize();

        const device = engine.getDevice();
        // Accept any valid device type - 'dml' on Windows, 'webgpu' in browser, 'cpu' as fallback
        expect(['cpu', 'webgpu', 'dml']).toContain(device);
      });

      it('didFallbackToCPU should return false initially', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        expect(engine.didFallbackToCPU()).toBe(false);
      });

      it('getFallbackReason should return null initially', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        expect(engine.getFallbackReason()).toBeNull();
      });
    });

    describe('getEffectiveBatchSize', () => {
      it('should return CPU batch size before initialization', async () => {
        const { EmbeddingEngine, BATCH_SIZE } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        // Before initialization, deviceInfo is null, so defaults to CPU batch size
        expect(engine.getEffectiveBatchSize()).toBe(BATCH_SIZE);
      });

      it('should return CPU batch size after CPU initialization', async () => {
        const { EmbeddingEngine, BATCH_SIZE } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await engine.initialize();

        // In test environment (no WebGPU), should use CPU
        if (engine.getDevice() === 'cpu') {
          expect(engine.getEffectiveBatchSize()).toBe(BATCH_SIZE);
        }
      });
    });

    describe('Device-specific initialization with explicit device', () => {
      it('should use explicit CPU device when specified', async () => {
        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'cpu' });

        await engine.initialize();

        expect(engine.getDevice()).toBe('cpu');
        expect(engine.didFallbackToCPU()).toBe(false); // No fallback, just explicit choice
      });

      it('should attempt WebGPU when specified and fallback to CPU in test env', async () => {
        // In test environment, WebGPU is not available, so it should fallback to CPU
        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'webgpu' });

        await engine.initialize();

        // Should either succeed with webgpu or fallback to cpu
        const device = engine.getDevice();
        expect(['cpu', 'webgpu']).toContain(device);

        // If it fell back to CPU, fallback flag should be set
        if (device === 'cpu') {
          expect(engine.didFallbackToCPU()).toBe(true);
          expect(engine.getFallbackReason()).not.toBeNull();
        }
      });
    });

    describe('Pipeline initialization with device parameter', () => {
      it('should pass device parameter to pipeline', async () => {
        const { EmbeddingEngine, CODE_ENGINE_CONFIG, CODE_MODEL_NAME } = await import('../../../src/engines/embedding.js');

        // Create engine with explicit CPU device
        const engine = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'cpu' });

        await engine.initialize();

        // Verify pipeline was called with device parameter
        expect(mockPipeline).toHaveBeenCalledWith(
          'feature-extraction',
          CODE_MODEL_NAME,
          expect.objectContaining({
            device: 'cpu',
            dtype: 'fp32',
            progress_callback: expect.any(Function),
          })
        );
      });
    });

    describe('Batch embedding with device info logging', () => {
      it('should embed batch and log device info', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        const texts = ['Hello', 'World', 'Test'];
        const result = await engine.embedBatch(texts);

        expect(result.vectors.length).toBe(3);
        // Device should be set after initialization triggered by embedBatch
        expect(engine.getDevice()).toBeDefined();
      });

      it('should use effective batch size during batch embedding', async () => {
        const { EmbeddingEngine, BATCH_SIZE, GPU_BATCH_SIZE } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine();

        await engine.initialize();

        const effectiveSize = engine.getEffectiveBatchSize();
        const device = engine.getDevice();

        // GPU devices (webgpu and dml) use larger batch size
        if (device === 'webgpu' || device === 'dml') {
          expect(effectiveSize).toBe(GPU_BATCH_SIZE);
        } else {
          expect(effectiveSize).toBe(BATCH_SIZE);
        }
      });
    });

    describe('Fallback behavior', () => {
      it('should fallback gracefully when WebGPU pipeline fails', async () => {
        // Make the first pipeline call (WebGPU) fail, second (CPU) succeed
        let callCount = 0;
        mockPipeline.mockImplementation(async (_task: string, _model: string, options: { device?: string }) => {
          callCount++;
          if (options.device === 'webgpu') {
            throw new Error('WebGPU not available');
          }
          return mockPipelineInstance;
        });

        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'webgpu' });

        // Should not throw - should fallback to CPU
        await engine.initialize();

        expect(engine.isInitialized()).toBe(true);
        expect(engine.getDevice()).toBe('cpu');
        expect(engine.didFallbackToCPU()).toBe(true);
        expect(engine.getFallbackReason()).toContain('WebGPU not available');
      });

      it('should throw when both WebGPU and CPU fail', async () => {
        mockPipeline.mockRejectedValue(new Error('Pipeline failed'));

        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'webgpu' });

        await expect(engine.initialize()).rejects.toMatchObject({
          code: 'MODEL_DOWNLOAD_FAILED',
        });

        expect(engine.isInitialized()).toBe(false);
      });

      it('should throw when CPU-only initialization fails', async () => {
        mockPipeline.mockRejectedValue(new Error('CPU pipeline failed'));

        const { EmbeddingEngine, CODE_ENGINE_CONFIG } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine({ ...CODE_ENGINE_CONFIG, device: 'cpu' });

        await expect(engine.initialize()).rejects.toMatchObject({
          code: 'MODEL_DOWNLOAD_FAILED',
        });

        expect(engine.isInitialized()).toBe(false);
      });
    });

    describe('Auto-detection behavior', () => {
      it('should auto-detect device when not specified', async () => {
        const { EmbeddingEngine } = await import('../../../src/engines/embedding.js');
        const engine = new EmbeddingEngine(); // No device specified

        await engine.initialize();

        // Should have detected some device
        const device = engine.getDevice();
        // Accept any valid device type - 'dml' on Windows, 'webgpu' in browser, 'cpu' as fallback
        expect(['cpu', 'webgpu', 'dml']).toContain(device);
        expect(engine.getDeviceInfo()).not.toBeNull();
      });
    });
  });
});
