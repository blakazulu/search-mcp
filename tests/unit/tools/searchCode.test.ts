/**
 * search_code Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - Query embedding generation
 * - Result formatting and scoring
 * - top_k limiting
 * - INDEX_NOT_FOUND error handling
 * - Search timing measurement
 * - MCP tool definition
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Create a mock tensor output that mimics @huggingface/transformers output
 */
function createMockTensorOutput(dimension: number = 384): { data: Float32Array } {
  const data = new Float32Array(dimension);
  for (let i = 0; i < dimension; i++) {
    data[i] = Math.random() * 0.1 - 0.05;
  }
  // Normalize the vector
  const magnitude = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0));
  for (let i = 0; i < dimension; i++) {
    data[i] = data[i] / magnitude;
  }
  return { data };
}

/**
 * Mock pipeline function
 */
const mockPipelineInstance = vi.fn();
const mockPipeline = vi.fn();

// Mock the @huggingface/transformers module
vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args),
}));

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a temporary directory for test databases
 */
function createTempDir(): string {
  const tempBase = path.join(os.tmpdir(), 'search-mcp-test');
  if (!fs.existsSync(tempBase)) {
    fs.mkdirSync(tempBase, { recursive: true });
  }
  const tempDir = path.join(tempBase, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temporary directory
 */
function cleanupTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Generate a random 384-dimensional vector
 */
function randomVector(): number[] {
  return Array.from({ length: 384 }, () => Math.random() * 2 - 1);
}

/**
 * Create test chunk record
 */
function createTestChunk(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: uuidv4(),
    path: 'src/test/file.ts',
    text: 'function testFunction() { return 42; }',
    vector: randomVector(),
    start_line: 1,
    end_line: 3,
    content_hash: 'abc123def456',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('search_code Tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup default mock behavior
    mockPipelineInstance.mockResolvedValue(createMockTensorOutput());
    mockPipeline.mockResolvedValue(mockPipelineInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Input Schema Tests
  // --------------------------------------------------------------------------

  describe('SearchCodeInputSchema', () => {
    it('should validate valid input with query only', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const result = SearchCodeInputSchema.safeParse({
        query: 'find function that calculates hash',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('find function that calculates hash');
        expect(result.data.top_k).toBe(10); // default value
      }
    });

    it('should validate valid input with query and top_k', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const result = SearchCodeInputSchema.safeParse({
        query: 'error handling',
        top_k: 25,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('error handling');
        expect(result.data.top_k).toBe(25);
      }
    });

    it('should reject empty query', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const result = SearchCodeInputSchema.safeParse({
        query: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing query', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const result = SearchCodeInputSchema.safeParse({
        top_k: 10,
      });

      expect(result.success).toBe(false);
    });

    it('should reject top_k less than 1', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const result = SearchCodeInputSchema.safeParse({
        query: 'test',
        top_k: 0,
      });

      expect(result.success).toBe(false);
    });

    it('should reject top_k greater than 50', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const result = SearchCodeInputSchema.safeParse({
        query: 'test',
        top_k: 51,
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-integer top_k', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const result = SearchCodeInputSchema.safeParse({
        query: 'test',
        top_k: 10.5,
      });

      expect(result.success).toBe(false);
    });

    it('should accept boundary values for top_k (1 and 50)', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/searchCode.js');

      const resultMin = SearchCodeInputSchema.safeParse({
        query: 'test',
        top_k: 1,
      });
      const resultMax = SearchCodeInputSchema.safeParse({
        query: 'test',
        top_k: 50,
      });

      expect(resultMin.success).toBe(true);
      expect(resultMax.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // INDEX_NOT_FOUND Error Tests
  // --------------------------------------------------------------------------

  describe('INDEX_NOT_FOUND error', () => {
    it('should throw INDEX_NOT_FOUND when no index exists', async () => {
      const { searchCode } = await import('../../../src/tools/searchCode.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'nonexistent-project');
      fs.mkdirSync(projectPath, { recursive: true });

      try {
        await expect(
          searchCode(
            { query: 'test query', top_k: 10 },
            { projectPath }
          )
        ).rejects.toMatchObject({
          code: 'INDEX_NOT_FOUND',
        });
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should include user-friendly message in INDEX_NOT_FOUND error', async () => {
      const { searchCode } = await import('../../../src/tools/searchCode.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'nonexistent-project');
      fs.mkdirSync(projectPath, { recursive: true });

      try {
        await expect(
          searchCode(
            { query: 'test query', top_k: 10 },
            { projectPath }
          )
        ).rejects.toMatchObject({
          userMessage: expect.stringContaining('create_index'),
        });
      } finally {
        cleanupTempDir(tempDir);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Search with Data Tests
  // --------------------------------------------------------------------------

  describe('searchCode with indexed data', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      // Get the index path using the utility
      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      // Clean up - be thorough
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return results sorted by similarity score', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 2;
      metadata.stats.totalChunks = 2;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      // Create a query vector and chunks at varying distances
      const queryVector = randomVector();
      const closeVector = queryVector.map((v) => v * 0.99 + 0.01);
      const farVector = queryVector.map((v) => -v); // Opposite direction

      const chunks: ChunkRecord[] = [
        {
          id: uuidv4(),
          path: 'close.ts',
          text: 'close match',
          vector: closeVector,
          start_line: 1,
          end_line: 2,
          content_hash: 'hash1',
        },
        {
          id: uuidv4(),
          path: 'far.ts',
          text: 'far match',
          vector: farVector,
          start_line: 1,
          end_line: 2,
          content_hash: 'hash2',
        },
      ];
      await store.insertChunks(chunks);
      await store.close();

      // Mock embedding to return our query vector
      mockPipelineInstance.mockResolvedValue({ data: new Float32Array(queryVector) });

      const { searchCode } = await import('../../../src/tools/searchCode.js');
      const result = await searchCode(
        { query: 'test query', top_k: 10 },
        { projectPath }
      );

      expect(result.results.length).toBe(2);
      expect(result.results[0].path).toBe('close.ts');
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
    });

    it('should respect top_k limit', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 5;
      metadata.stats.totalChunks = 5;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunks: ChunkRecord[] = Array.from({ length: 5 }, (_, i) => ({
        id: uuidv4(),
        path: `file${i}.ts`,
        text: `content ${i}`,
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: `hash${i}`,
      }));
      await store.insertChunks(chunks);
      await store.close();

      const { searchCode } = await import('../../../src/tools/searchCode.js');
      const result = await searchCode(
        { query: 'test query', top_k: 3 },
        { projectPath }
      );

      expect(result.results.length).toBe(3);
      expect(result.totalResults).toBe(3);
    });

    it('should return scores between 0 and 1', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 3;
      metadata.stats.totalChunks = 3;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunks: ChunkRecord[] = Array.from({ length: 3 }, (_, i) => ({
        id: uuidv4(),
        path: `file${i}.ts`,
        text: `content ${i}`,
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: `hash${i}`,
      }));
      await store.insertChunks(chunks);
      await store.close();

      const { searchCode } = await import('../../../src/tools/searchCode.js');
      const result = await searchCode(
        { query: 'test query', top_k: 10 },
        { projectPath }
      );

      for (const searchResult of result.results) {
        expect(searchResult.score).toBeGreaterThan(0);
        expect(searchResult.score).toBeLessThanOrEqual(1);
      }
    });

    it('should include correct result structure', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 1;
      metadata.stats.totalChunks = 1;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunk: ChunkRecord = {
        id: uuidv4(),
        path: 'src/utils/hash.ts',
        text: 'function calculateHash() { return sha256(data); }',
        vector: randomVector(),
        start_line: 10,
        end_line: 15,
        content_hash: 'testhash',
      };
      await store.insertChunks([chunk]);
      await store.close();

      const { searchCode } = await import('../../../src/tools/searchCode.js');
      const result = await searchCode(
        { query: 'calculate hash', top_k: 10 },
        { projectPath }
      );

      expect(result.results.length).toBe(1);
      expect(result.results[0]).toHaveProperty('path', 'src/utils/hash.ts');
      expect(result.results[0]).toHaveProperty('text', 'function calculateHash() { return sha256(data); }');
      expect(result.results[0]).toHaveProperty('score');
      expect(result.results[0]).toHaveProperty('startLine', 10);
      expect(result.results[0]).toHaveProperty('endLine', 15);
    });

    it('should include searchTimeMs in output', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 1;
      metadata.stats.totalChunks = 1;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunk: ChunkRecord = {
        id: uuidv4(),
        path: 'test.ts',
        text: 'test content',
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: 'testhash',
      };
      await store.insertChunks([chunk]);
      await store.close();

      const { searchCode } = await import('../../../src/tools/searchCode.js');
      const result = await searchCode(
        { query: 'test', top_k: 10 },
        { projectPath }
      );

      expect(result).toHaveProperty('searchTimeMs');
      expect(typeof result.searchTimeMs).toBe('number');
      expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate query embedding using EmbeddingEngine', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 1;
      metadata.stats.totalChunks = 1;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunk: ChunkRecord = {
        id: uuidv4(),
        path: 'test.ts',
        text: 'test content',
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: 'testhash',
      };
      await store.insertChunks([chunk]);
      await store.close();

      const { searchCode } = await import('../../../src/tools/searchCode.js');
      await searchCode(
        { query: 'find authentication code', top_k: 10 },
        { projectPath }
      );

      // Verify embedding pipeline was called with the query
      expect(mockPipelineInstance).toHaveBeenCalledWith('find authentication code', {
        pooling: 'mean',
        normalize: true,
      });
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('searchCodeTool definition', () => {
    it('should have correct tool name', async () => {
      const { searchCodeTool } = await import('../../../src/tools/searchCode.js');
      expect(searchCodeTool.name).toBe('search_code');
    });

    it('should have description', async () => {
      const { searchCodeTool } = await import('../../../src/tools/searchCode.js');
      expect(searchCodeTool.description).toBe(
        'Search your codebase for relevant code using natural language'
      );
    });

    it('should not require confirmation (read-only)', async () => {
      const { searchCodeTool } = await import('../../../src/tools/searchCode.js');
      expect(searchCodeTool.requiresConfirmation).toBe(false);
    });

    it('should have correct input schema structure', async () => {
      const { searchCodeTool } = await import('../../../src/tools/searchCode.js');

      expect(searchCodeTool.inputSchema.type).toBe('object');
      expect(searchCodeTool.inputSchema.required).toContain('query');
      expect(searchCodeTool.inputSchema.properties.query).toMatchObject({
        type: 'string',
        description: expect.any(String),
      });
      expect(searchCodeTool.inputSchema.properties.top_k).toMatchObject({
        type: 'number',
        default: 10,
        minimum: 1,
        maximum: 50,
      });
    });
  });

  // --------------------------------------------------------------------------
  // createSearchCodeTool Tests
  // --------------------------------------------------------------------------

  describe('createSearchCodeTool', () => {
    it('should create tool with standard description when enhanced=false', async () => {
      const { createSearchCodeTool } = await import('../../../src/tools/searchCode.js');
      const tool = createSearchCodeTool(false);

      expect(tool.name).toBe('search_code');
      expect(tool.description).toBe(
        'Search your codebase for relevant code using natural language'
      );
      expect(tool.description).not.toContain('TIP:');
    });

    it('should create tool with enhanced description when enhanced=true', async () => {
      const { createSearchCodeTool } = await import('../../../src/tools/searchCode.js');
      const tool = createSearchCodeTool(true);

      expect(tool.name).toBe('search_code');
      expect(tool.description).toContain(
        'Search your codebase for relevant code using natural language'
      );
      expect(tool.description).toContain('TIP:');
      expect(tool.description).toContain('Prefer this over reading full files');
    });

    it('should default to standard description when no argument provided', async () => {
      const { createSearchCodeTool } = await import('../../../src/tools/searchCode.js');
      const tool = createSearchCodeTool();

      expect(tool.description).toBe(
        'Search your codebase for relevant code using natural language'
      );
      expect(tool.description).not.toContain('TIP:');
    });

    it('should have same schema structure regardless of enhanced setting', async () => {
      const { createSearchCodeTool } = await import('../../../src/tools/searchCode.js');
      const standardTool = createSearchCodeTool(false);
      const enhancedTool = createSearchCodeTool(true);

      expect(standardTool.inputSchema).toEqual(enhancedTool.inputSchema);
      expect(standardTool.requiresConfirmation).toBe(enhancedTool.requiresConfirmation);
    });
  });

  // --------------------------------------------------------------------------
  // Export Alias Tests
  // --------------------------------------------------------------------------

  describe('exports', () => {
    it('should export searchNow as alias for searchCode', async () => {
      const { searchCode, searchNow } = await import('../../../src/tools/searchCode.js');
      expect(searchNow).toBe(searchCode);
    });

    it('should export searchNowTool as alias for searchCodeTool', async () => {
      const { searchCodeTool, searchNowTool } = await import('../../../src/tools/searchCode.js');
      expect(searchNowTool).toBe(searchCodeTool);
    });

    it('should export SearchNowInputSchema as alias for SearchCodeInputSchema', async () => {
      const { SearchCodeInputSchema, SearchNowInputSchema } = await import(
        '../../../src/tools/searchCode.js'
      );
      expect(SearchNowInputSchema).toBe(SearchCodeInputSchema);
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export searchCode from tools index', async () => {
      const { searchCode } = await import('../../../src/tools/index.js');
      expect(searchCode).toBeDefined();
      expect(typeof searchCode).toBe('function');
    });

    it('should export searchCodeTool from tools index', async () => {
      const { searchCodeTool } = await import('../../../src/tools/index.js');
      expect(searchCodeTool).toBeDefined();
      expect(searchCodeTool.name).toBe('search_code');
    });

    it('should export SearchCodeInputSchema from tools index', async () => {
      const { SearchCodeInputSchema } = await import('../../../src/tools/index.js');
      expect(SearchCodeInputSchema).toBeDefined();
    });

    it('should export createSearchCodeTool from tools index', async () => {
      const { createSearchCodeTool } = await import('../../../src/tools/index.js');
      expect(createSearchCodeTool).toBeDefined();
      expect(typeof createSearchCodeTool).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Empty Index Tests
  // --------------------------------------------------------------------------

  describe('empty index handling', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should throw INDEX_NOT_FOUND when index has no data', async () => {
      // Create metadata but no data in LanceDB
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { searchCode } = await import('../../../src/tools/searchCode.js');

      await expect(
        searchCode(
          { query: 'test query', top_k: 10 },
          { projectPath }
        )
      ).rejects.toMatchObject({
        code: 'INDEX_NOT_FOUND',
        userMessage: expect.stringContaining('empty'),
      });
    });
  });
});
