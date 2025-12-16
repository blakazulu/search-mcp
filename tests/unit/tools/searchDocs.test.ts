/**
 * search_docs Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - Query embedding generation
 * - Result formatting and scoring
 * - top_k limiting
 * - DOCS_INDEX_NOT_FOUND error handling
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
 * Dimension for code embeddings (BGE-small model uses 384)
 */
const CODE_DIMENSION = 384;

/**
 * Dimension for docs embeddings (BGE-base model uses 768)
 * SMCP-074: Docs now uses a separate embedding model with 768 dimensions
 */
const DOCS_DIMENSION = 768;

/**
 * Create a mock tensor output that mimics @huggingface/transformers output
 */
function createMockTensorOutput(dimension: number = CODE_DIMENSION): { data: Float32Array } {
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
  const tempDir = path.join(
    tempBase,
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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
 * Generate a random 768-dimensional vector for docs
 * SMCP-074: Docs uses BGE-base model with 768 dimensions
 */
function randomVector(): number[] {
  return Array.from({ length: DOCS_DIMENSION }, () => Math.random() * 2 - 1);
}

/**
 * Create test chunk record for docs
 */
function createTestDocChunk(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: uuidv4(),
    path: 'docs/README.md',
    text: '# Getting Started\n\nThis guide explains how to configure the application.',
    vector: randomVector(),
    start_line: 1,
    end_line: 5,
    content_hash: 'abc123def456',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('search_docs Tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup default mock behavior
    // SMCP-074: Use DOCS_DIMENSION (768) for docs embedding tests
    mockPipelineInstance.mockResolvedValue(createMockTensorOutput(DOCS_DIMENSION));
    mockPipeline.mockResolvedValue(mockPipelineInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Input Schema Tests
  // --------------------------------------------------------------------------

  describe('SearchDocsInputSchema', () => {
    it('should validate valid input with query only', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const result = SearchDocsInputSchema.safeParse({
        query: 'how to configure the server',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('how to configure the server');
        expect(result.data.top_k).toBe(10); // default value
      }
    });

    it('should validate valid input with query and top_k', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const result = SearchDocsInputSchema.safeParse({
        query: 'installation guide',
        top_k: 25,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe('installation guide');
        expect(result.data.top_k).toBe(25);
      }
    });

    it('should reject empty query', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const result = SearchDocsInputSchema.safeParse({
        query: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing query', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const result = SearchDocsInputSchema.safeParse({
        top_k: 10,
      });

      expect(result.success).toBe(false);
    });

    it('should reject top_k less than 1', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const result = SearchDocsInputSchema.safeParse({
        query: 'test',
        top_k: 0,
      });

      expect(result.success).toBe(false);
    });

    it('should reject top_k greater than 50', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const result = SearchDocsInputSchema.safeParse({
        query: 'test',
        top_k: 51,
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-integer top_k', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const result = SearchDocsInputSchema.safeParse({
        query: 'test',
        top_k: 10.5,
      });

      expect(result.success).toBe(false);
    });

    it('should accept boundary values for top_k (1 and 50)', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const resultMin = SearchDocsInputSchema.safeParse({
        query: 'test',
        top_k: 1,
      });
      const resultMax = SearchDocsInputSchema.safeParse({
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

  describe('DOCS_INDEX_NOT_FOUND error', () => {
    it('should throw INDEX_NOT_FOUND when no index exists', async () => {
      const { searchDocs } = await import('../../../src/tools/searchDocs.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'nonexistent-project');
      fs.mkdirSync(projectPath, { recursive: true });

      try {
        await expect(
          searchDocs({ query: 'test query', top_k: 10 }, { projectPath })
        ).rejects.toMatchObject({
          code: 'INDEX_NOT_FOUND',
        });
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should include user-friendly message in INDEX_NOT_FOUND error', async () => {
      const { searchDocs } = await import('../../../src/tools/searchDocs.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'nonexistent-project');
      fs.mkdirSync(projectPath, { recursive: true });

      try {
        await expect(
          searchDocs({ query: 'test query', top_k: 10 }, { projectPath })
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

  describe('searchDocs with indexed data', () => {
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
      const { saveMetadata, createMetadata } = await import(
        '../../../src/storage/metadata.js'
      );
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 2;
      metadata.stats.totalChunks = 2;
      await saveMetadata(indexPath, metadata);

      // Create DocsLanceDB store with test data (using CODE_DIMENSION for backward compatibility)
      const { DocsLanceDBStore } = await import(
        '../../../src/storage/docsLancedb.js'
      );
      const { ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new DocsLanceDBStore(indexPath, DOCS_DIMENSION);
      await store.open();

      // Create a query vector and chunks at varying distances
      const queryVector = randomVector();
      const closeVector = queryVector.map((v) => v * 0.99 + 0.01);
      const farVector = queryVector.map((v) => -v); // Opposite direction

      const chunks = [
        {
          id: uuidv4(),
          path: 'docs/close.md',
          text: '# Close match',
          vector: closeVector,
          start_line: 1,
          end_line: 2,
          content_hash: 'hash1',
        },
        {
          id: uuidv4(),
          path: 'docs/far.md',
          text: '# Far match',
          vector: farVector,
          start_line: 1,
          end_line: 2,
          content_hash: 'hash2',
        },
      ];
      await store.insertChunks(chunks);
      await store.close();

      // Mock embedding to return our query vector
      mockPipelineInstance.mockResolvedValue({
        data: new Float32Array(queryVector),
      });

      const { searchDocs } = await import('../../../src/tools/searchDocs.js');
      const result = await searchDocs(
        { query: 'test query', top_k: 10 },
        { projectPath }
      );

      expect(result.results.length).toBe(2);
      expect(result.results[0].path).toBe('docs/close.md');
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
    });

    it('should respect top_k limit', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import(
        '../../../src/storage/metadata.js'
      );
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 5;
      metadata.stats.totalChunks = 5;
      await saveMetadata(indexPath, metadata);

      // Create DocsLanceDB store with test data (using CODE_DIMENSION for backward compatibility)
      const { DocsLanceDBStore } = await import(
        '../../../src/storage/docsLancedb.js'
      );
      const store = new DocsLanceDBStore(indexPath, DOCS_DIMENSION);
      await store.open();

      const chunks = Array.from({ length: 5 }, (_, i) => ({
        id: uuidv4(),
        path: `docs/file${i}.md`,
        text: `# Content ${i}`,
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: `hash${i}`,
      }));
      await store.insertChunks(chunks);
      await store.close();

      const { searchDocs } = await import('../../../src/tools/searchDocs.js');
      const result = await searchDocs(
        { query: 'test query', top_k: 3 },
        { projectPath }
      );

      expect(result.results.length).toBe(3);
      expect(result.totalResults).toBe(3);
    });

    it('should return scores between 0 and 1', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import(
        '../../../src/storage/metadata.js'
      );
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 3;
      metadata.stats.totalChunks = 3;
      await saveMetadata(indexPath, metadata);

      // Create DocsLanceDB store with test data
      const { DocsLanceDBStore } = await import(
        '../../../src/storage/docsLancedb.js'
      );
      const store = new DocsLanceDBStore(indexPath, DOCS_DIMENSION);
      await store.open();

      const chunks = Array.from({ length: 3 }, (_, i) => ({
        id: uuidv4(),
        path: `docs/file${i}.md`,
        text: `# Content ${i}`,
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: `hash${i}`,
      }));
      await store.insertChunks(chunks);
      await store.close();

      const { searchDocs } = await import('../../../src/tools/searchDocs.js');
      const result = await searchDocs(
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
      const { saveMetadata, createMetadata } = await import(
        '../../../src/storage/metadata.js'
      );
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 1;
      metadata.stats.totalChunks = 1;
      await saveMetadata(indexPath, metadata);

      // Create DocsLanceDB store with test data
      const { DocsLanceDBStore } = await import(
        '../../../src/storage/docsLancedb.js'
      );
      const store = new DocsLanceDBStore(indexPath, DOCS_DIMENSION);
      await store.open();

      const chunk = {
        id: uuidv4(),
        path: 'docs/getting-started.md',
        text: '# Getting Started\n\nFollow these steps to configure your environment.',
        vector: randomVector(),
        start_line: 10,
        end_line: 15,
        content_hash: 'testhash',
      };
      await store.insertChunks([chunk]);
      await store.close();

      const { searchDocs } = await import('../../../src/tools/searchDocs.js');
      const result = await searchDocs(
        { query: 'configure environment', top_k: 10 },
        { projectPath }
      );

      expect(result.results.length).toBe(1);
      expect(result.results[0]).toHaveProperty(
        'path',
        'docs/getting-started.md'
      );
      expect(result.results[0]).toHaveProperty(
        'text',
        '# Getting Started\n\nFollow these steps to configure your environment.'
      );
      expect(result.results[0]).toHaveProperty('score');
      expect(result.results[0]).toHaveProperty('startLine', 10);
      expect(result.results[0]).toHaveProperty('endLine', 15);
    });

    it('should include searchTimeMs in output', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import(
        '../../../src/storage/metadata.js'
      );
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 1;
      metadata.stats.totalChunks = 1;
      await saveMetadata(indexPath, metadata);

      // Create DocsLanceDB store with test data
      const { DocsLanceDBStore } = await import(
        '../../../src/storage/docsLancedb.js'
      );
      const store = new DocsLanceDBStore(indexPath, DOCS_DIMENSION);
      await store.open();

      const chunk = {
        id: uuidv4(),
        path: 'README.md',
        text: '# Test documentation',
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: 'testhash',
      };
      await store.insertChunks([chunk]);
      await store.close();

      const { searchDocs } = await import('../../../src/tools/searchDocs.js');
      const result = await searchDocs(
        { query: 'test', top_k: 10 },
        { projectPath }
      );

      expect(result).toHaveProperty('searchTimeMs');
      expect(typeof result.searchTimeMs).toBe('number');
      expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate query embedding using EmbeddingEngine', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import(
        '../../../src/storage/metadata.js'
      );
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 1;
      metadata.stats.totalChunks = 1;
      await saveMetadata(indexPath, metadata);

      // Create DocsLanceDB store with test data
      const { DocsLanceDBStore } = await import(
        '../../../src/storage/docsLancedb.js'
      );
      const store = new DocsLanceDBStore(indexPath, DOCS_DIMENSION);
      await store.open();

      const chunk = {
        id: uuidv4(),
        path: 'README.md',
        text: '# Documentation content',
        vector: randomVector(),
        start_line: 1,
        end_line: 2,
        content_hash: 'testhash',
      };
      await store.insertChunks([chunk]);
      await store.close();

      const { searchDocs } = await import('../../../src/tools/searchDocs.js');
      await searchDocs(
        { query: 'how to configure the application', top_k: 10 },
        { projectPath }
      );

      // Verify embedding pipeline was called with the query
      expect(mockPipelineInstance).toHaveBeenCalledWith(
        'how to configure the application',
        {
          pooling: 'mean',
          normalize: true,
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('searchDocsTool definition', () => {
    it('should have correct tool name', async () => {
      const { searchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );
      expect(searchDocsTool.name).toBe('search_docs');
    });

    it('should have description mentioning documentation files', async () => {
      const { searchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );
      expect(searchDocsTool.description).toContain('.md');
      expect(searchDocsTool.description).toContain('.txt');
      expect(searchDocsTool.description).toContain('documentation');
    });

    it('should not require confirmation (read-only)', async () => {
      const { searchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );
      expect(searchDocsTool.requiresConfirmation).toBe(false);
    });

    it('should have correct input schema structure', async () => {
      const { searchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );

      expect(searchDocsTool.inputSchema.type).toBe('object');
      expect(searchDocsTool.inputSchema.required).toContain('query');
      expect(searchDocsTool.inputSchema.properties.query).toMatchObject({
        type: 'string',
        description: expect.any(String),
      });
      expect(searchDocsTool.inputSchema.properties.top_k).toMatchObject({
        type: 'number',
        default: 10,
        minimum: 1,
        maximum: 50,
      });
    });
  });

  // --------------------------------------------------------------------------
  // createSearchDocsTool Tests
  // --------------------------------------------------------------------------

  describe('createSearchDocsTool', () => {
    it('should create tool with standard description when enhanced=false', async () => {
      const { createSearchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );
      const tool = createSearchDocsTool(false);

      expect(tool.name).toBe('search_docs');
      expect(tool.description).toContain('.md');
      expect(tool.description).toContain('.txt');
      expect(tool.description).not.toContain('TIP:');
    });

    it('should create tool with enhanced description when enhanced=true', async () => {
      const { createSearchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );
      const tool = createSearchDocsTool(true);

      expect(tool.name).toBe('search_docs');
      expect(tool.description).toContain('.md');
      expect(tool.description).toContain('.txt');
      expect(tool.description).toContain('TIP:');
      expect(tool.description).toContain('follow-up questions');
    });

    it('should default to standard description when no argument provided', async () => {
      const { createSearchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );
      const tool = createSearchDocsTool();

      expect(tool.description).not.toContain('TIP:');
    });

    it('should have same schema structure regardless of enhanced setting', async () => {
      const { createSearchDocsTool } = await import(
        '../../../src/tools/searchDocs.js'
      );
      const standardTool = createSearchDocsTool(false);
      const enhancedTool = createSearchDocsTool(true);

      expect(standardTool.inputSchema).toEqual(enhancedTool.inputSchema);
      expect(standardTool.requiresConfirmation).toBe(
        enhancedTool.requiresConfirmation
      );
    });
  });

  // --------------------------------------------------------------------------
  // docsIndexNotFound Error Factory Tests
  // --------------------------------------------------------------------------

  describe('docsIndexNotFound error factory', () => {
    it('should create an MCPError with correct code', async () => {
      const { docsIndexNotFound } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const error = docsIndexNotFound('/some/path');

      expect(error.code).toBe('INDEX_NOT_FOUND');
    });

    it('should include user-friendly message with create_index suggestion', async () => {
      const { docsIndexNotFound } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const error = docsIndexNotFound('/some/path');

      expect(error.userMessage).toContain('documentation');
      expect(error.userMessage).toContain('create_index');
    });

    it('should include developer message with path', async () => {
      const { docsIndexNotFound } = await import(
        '../../../src/tools/searchDocs.js'
      );

      const error = docsIndexNotFound('/some/test/path');

      expect(error.developerMessage).toContain('/some/test/path');
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export searchDocs from tools index', async () => {
      const { searchDocs } = await import('../../../src/tools/index.js');
      expect(searchDocs).toBeDefined();
      expect(typeof searchDocs).toBe('function');
    });

    it('should export searchDocsTool from tools index', async () => {
      const { searchDocsTool } = await import('../../../src/tools/index.js');
      expect(searchDocsTool).toBeDefined();
      expect(searchDocsTool.name).toBe('search_docs');
    });

    it('should export SearchDocsInputSchema from tools index', async () => {
      const { SearchDocsInputSchema } = await import(
        '../../../src/tools/index.js'
      );
      expect(SearchDocsInputSchema).toBeDefined();
    });

    it('should export docsIndexNotFound from tools index', async () => {
      const { docsIndexNotFound } = await import('../../../src/tools/index.js');
      expect(docsIndexNotFound).toBeDefined();
      expect(typeof docsIndexNotFound).toBe('function');
    });

    it('should export createSearchDocsTool from tools index', async () => {
      const { createSearchDocsTool } = await import(
        '../../../src/tools/index.js'
      );
      expect(createSearchDocsTool).toBeDefined();
      expect(typeof createSearchDocsTool).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Empty Index Tests
  // --------------------------------------------------------------------------

  describe('empty docs index handling', () => {
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

    it('should throw INDEX_NOT_FOUND when docs index has no data', async () => {
      // Create metadata but no data in DocsLanceDB
      const { saveMetadata, createMetadata } = await import(
        '../../../src/storage/metadata.js'
      );
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { searchDocs } = await import('../../../src/tools/searchDocs.js');

      await expect(
        searchDocs({ query: 'test query', top_k: 10 }, { projectPath })
      ).rejects.toMatchObject({
        code: 'INDEX_NOT_FOUND',
        userMessage: expect.stringContaining('empty'),
      });
    });
  });
});
