/**
 * search_by_path Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - Glob pattern validation
 * - Simple patterns (*.ts)
 * - Recursive patterns (**\/*.ts)
 * - Directory patterns (src/**\/*)
 * - Invalid pattern handling
 * - Limit parameter
 * - INDEX_NOT_FOUND error handling
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
 * Create a mock tensor output that mimics @xenova/transformers output
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

// Mock the @xenova/transformers module
vi.mock('@xenova/transformers', () => ({
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
function createTestChunk(filePath: string): {
  id: string;
  path: string;
  text: string;
  vector: number[];
  start_line: number;
  end_line: number;
  content_hash: string;
} {
  return {
    id: uuidv4(),
    path: filePath,
    text: `// Content of ${filePath}`,
    vector: randomVector(),
    start_line: 1,
    end_line: 3,
    content_hash: 'hash-' + filePath.replace(/\//g, '-'),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('search_by_path Tool', () => {
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

  describe('SearchByPathInputSchema', () => {
    it('should validate valid input with pattern only', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const result = SearchByPathInputSchema.safeParse({
        pattern: '**/*.ts',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pattern).toBe('**/*.ts');
        expect(result.data.limit).toBe(20); // default value
      }
    });

    it('should validate valid input with pattern and limit', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const result = SearchByPathInputSchema.safeParse({
        pattern: 'src/**/*.md',
        limit: 50,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pattern).toBe('src/**/*.md');
        expect(result.data.limit).toBe(50);
      }
    });

    it('should reject empty pattern', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const result = SearchByPathInputSchema.safeParse({
        pattern: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing pattern', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const result = SearchByPathInputSchema.safeParse({
        limit: 20,
      });

      expect(result.success).toBe(false);
    });

    it('should reject limit less than 1', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const result = SearchByPathInputSchema.safeParse({
        pattern: '*.ts',
        limit: 0,
      });

      expect(result.success).toBe(false);
    });

    it('should reject limit greater than 100', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const result = SearchByPathInputSchema.safeParse({
        pattern: '*.ts',
        limit: 101,
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-integer limit', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const result = SearchByPathInputSchema.safeParse({
        pattern: '*.ts',
        limit: 10.5,
      });

      expect(result.success).toBe(false);
    });

    it('should accept boundary values for limit (1 and 100)', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/searchByPath.js');

      const resultMin = SearchByPathInputSchema.safeParse({
        pattern: '*.ts',
        limit: 1,
      });
      const resultMax = SearchByPathInputSchema.safeParse({
        pattern: '*.ts',
        limit: 100,
      });

      expect(resultMin.success).toBe(true);
      expect(resultMax.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Pattern Validation Tests
  // --------------------------------------------------------------------------

  describe('validateGlobPattern', () => {
    it('should accept valid simple patterns', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      expect(validateGlobPattern('*.ts').valid).toBe(true);
      expect(validateGlobPattern('file.txt').valid).toBe(true);
      expect(validateGlobPattern('src/*.js').valid).toBe(true);
    });

    it('should accept valid recursive patterns', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      expect(validateGlobPattern('**/*.ts').valid).toBe(true);
      expect(validateGlobPattern('src/**/*.md').valid).toBe(true);
      expect(validateGlobPattern('**/*').valid).toBe(true);
    });

    it('should accept valid brace expansion patterns', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      expect(validateGlobPattern('*.{ts,js}').valid).toBe(true);
      expect(validateGlobPattern('src/**/*.{md,txt}').valid).toBe(true);
    });

    it('should accept valid character class patterns', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      expect(validateGlobPattern('[abc]*.ts').valid).toBe(true);
      expect(validateGlobPattern('[a-z]*.js').valid).toBe(true);
    });

    it('should accept valid question mark patterns', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      expect(validateGlobPattern('file?.ts').valid).toBe(true);
      expect(validateGlobPattern('???.txt').valid).toBe(true);
    });

    it('should reject empty patterns', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      const result = validateGlobPattern('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Pattern cannot be empty');
    });

    it('should reject whitespace-only patterns', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      const result = validateGlobPattern('   ');
      expect(result.valid).toBe(false);
    });

    it('should reject patterns with unclosed square brackets', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      const result = validateGlobPattern('[abc*.ts');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unclosed square bracket');
    });

    it('should reject patterns with unclosed curly braces', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      const result = validateGlobPattern('*.{ts,js');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unclosed curly brace');
    });

    it('should handle patterns with stray closing brackets gracefully', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/searchByPath.js');

      // minimatch is lenient with stray closing brackets - they are treated as literals
      const result = validateGlobPattern('abc]*.ts');
      // This is actually valid in minimatch - ] is just a literal character
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Pattern Matching Tests
  // --------------------------------------------------------------------------

  describe('matchPattern', () => {
    const testFiles = [
      'src/index.ts',
      'src/utils/hash.ts',
      'src/utils/logger.ts',
      'src/tools/searchCode.ts',
      'src/tools/searchByPath.ts',
      'tests/unit/tools/searchCode.test.ts',
      'tests/unit/tools/searchByPath.test.ts',
      'README.md',
      'package.json',
      'tsconfig.json',
      'docs/api.md',
      'docs/guide.md',
    ];

    it('should match simple wildcard patterns', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, '*.json', 100);
      expect(matches).toEqual(['package.json', 'tsconfig.json']);
    });

    it('should match recursive patterns', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, '**/*.ts', 100);
      expect(matches).toContain('src/index.ts');
      expect(matches).toContain('src/utils/hash.ts');
      expect(matches).toContain('src/tools/searchCode.ts');
      // **/*.ts matches any .ts file including .test.ts
      expect(matches).toContain('tests/unit/tools/searchCode.test.ts');
    });

    it('should match test files pattern', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, '**/*.test.ts', 100);
      expect(matches).toEqual([
        'tests/unit/tools/searchByPath.test.ts',
        'tests/unit/tools/searchCode.test.ts',
      ]);
    });

    it('should match directory patterns', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, 'src/**/*', 100);
      expect(matches).toContain('src/index.ts');
      expect(matches).toContain('src/utils/hash.ts');
      expect(matches).toContain('src/tools/searchCode.ts');
      expect(matches).not.toContain('README.md');
      expect(matches).not.toContain('tests/unit/tools/searchCode.test.ts');
    });

    it('should match specific directory patterns', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, 'src/tools/*', 100);
      expect(matches).toEqual(['src/tools/searchByPath.ts', 'src/tools/searchCode.ts']);
    });

    it('should match markdown files in docs', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, 'docs/**/*.md', 100);
      expect(matches).toEqual(['docs/api.md', 'docs/guide.md']);
    });

    it('should return results sorted alphabetically', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, '**/*.md', 100);
      // localeCompare sorts uppercase after lowercase for paths starting with different chars
      // 'd' < 'R' in ASCII, so 'docs/' comes before 'README.md'
      expect(matches).toEqual(['docs/api.md', 'docs/guide.md', 'README.md']);
    });

    it('should respect limit parameter', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, '**/*', 5);
      expect(matches.length).toBe(5);
    });

    it('should return empty array when no matches', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const matches = matchPattern(testFiles, '*.xyz', 100);
      expect(matches).toEqual([]);
    });

    it('should handle question mark wildcard', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const filesWithNumbers = ['file1.ts', 'file2.ts', 'file10.ts', 'file.ts'];
      const matches = matchPattern(filesWithNumbers, 'file?.ts', 100);
      expect(matches).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should be case-sensitive', async () => {
      const { matchPattern } = await import('../../../src/tools/searchByPath.js');

      const filesWithCase = ['README.md', 'readme.md', 'Readme.md'];
      const matches = matchPattern(filesWithCase, 'README.md', 100);
      expect(matches).toEqual(['README.md']);
    });
  });

  // --------------------------------------------------------------------------
  // INDEX_NOT_FOUND Error Tests
  // --------------------------------------------------------------------------

  describe('INDEX_NOT_FOUND error', () => {
    it('should throw INDEX_NOT_FOUND when no index exists', async () => {
      const { searchByPath } = await import('../../../src/tools/searchByPath.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'nonexistent-project');
      fs.mkdirSync(projectPath, { recursive: true });

      try {
        await expect(
          searchByPath(
            { pattern: '**/*.ts', limit: 20 },
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
      const { searchByPath } = await import('../../../src/tools/searchByPath.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'nonexistent-project');
      fs.mkdirSync(projectPath, { recursive: true });

      try {
        await expect(
          searchByPath(
            { pattern: '**/*.ts', limit: 20 },
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
  // INVALID_PATTERN Error Tests
  // --------------------------------------------------------------------------

  describe('INVALID_PATTERN error', () => {
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

      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should throw INVALID_PATTERN for unclosed brackets', async () => {
      const { searchByPath } = await import('../../../src/tools/searchByPath.js');

      await expect(
        searchByPath(
          { pattern: '[abc*.ts', limit: 20 },
          { projectPath }
        )
      ).rejects.toMatchObject({
        code: 'INVALID_PATTERN',
      });
    });

    it('should include user-friendly message in INVALID_PATTERN error', async () => {
      const { searchByPath } = await import('../../../src/tools/searchByPath.js');

      await expect(
        searchByPath(
          { pattern: '*.{ts,js', limit: 20 },
          { projectPath }
        )
      ).rejects.toMatchObject({
        userMessage: expect.stringContaining('pattern'),
      });
    });
  });

  // --------------------------------------------------------------------------
  // Search with Data Tests
  // --------------------------------------------------------------------------

  describe('searchByPath with indexed data', () => {
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

    it('should return matching files sorted alphabetically', async () => {
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

      const chunks: ChunkRecord[] = [
        createTestChunk('src/index.ts'),
        createTestChunk('src/utils/hash.ts'),
        createTestChunk('src/utils/logger.ts'),
        createTestChunk('README.md'),
        createTestChunk('package.json'),
      ];
      await store.insertChunks(chunks);
      await store.close();

      const { searchByPath } = await import('../../../src/tools/searchByPath.js');
      const result = await searchByPath(
        { pattern: 'src/**/*.ts', limit: 20 },
        { projectPath }
      );

      expect(result.matches).toEqual([
        'src/index.ts',
        'src/utils/hash.ts',
        'src/utils/logger.ts',
      ]);
      expect(result.totalMatches).toBe(3);
    });

    it('should respect limit parameter', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 10;
      metadata.stats.totalChunks = 10;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunks: ChunkRecord[] = Array.from({ length: 10 }, (_, i) =>
        createTestChunk(`src/file${i}.ts`)
      );
      await store.insertChunks(chunks);
      await store.close();

      const { searchByPath } = await import('../../../src/tools/searchByPath.js');
      const result = await searchByPath(
        { pattern: '**/*.ts', limit: 5 },
        { projectPath }
      );

      expect(result.matches.length).toBe(5);
      expect(result.totalMatches).toBe(10);
    });

    it('should return empty results when no files match', async () => {
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

      const chunks: ChunkRecord[] = [
        createTestChunk('src/index.ts'),
        createTestChunk('src/utils.ts'),
        createTestChunk('package.json'),
      ];
      await store.insertChunks(chunks);
      await store.close();

      const { searchByPath } = await import('../../../src/tools/searchByPath.js');
      const result = await searchByPath(
        { pattern: '**/*.xyz', limit: 20 },
        { projectPath }
      );

      expect(result.matches).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });

    it('should handle recursive glob patterns', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 6;
      metadata.stats.totalChunks = 6;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with test data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunks: ChunkRecord[] = [
        createTestChunk('index.ts'),
        createTestChunk('src/index.ts'),
        createTestChunk('src/utils/index.ts'),
        createTestChunk('src/utils/deep/index.ts'),
        createTestChunk('tests/index.ts'),
        createTestChunk('package.json'),
      ];
      await store.insertChunks(chunks);
      await store.close();

      const { searchByPath } = await import('../../../src/tools/searchByPath.js');
      const result = await searchByPath(
        { pattern: '**/index.ts', limit: 20 },
        { projectPath }
      );

      expect(result.matches).toContain('index.ts');
      expect(result.matches).toContain('src/index.ts');
      expect(result.matches).toContain('src/utils/index.ts');
      expect(result.matches).toContain('src/utils/deep/index.ts');
      expect(result.matches).toContain('tests/index.ts');
      expect(result.totalMatches).toBe(5);
    });

    it('should return all matches if total is less than limit', async () => {
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

      const chunks: ChunkRecord[] = [
        createTestChunk('file1.ts'),
        createTestChunk('file2.ts'),
        createTestChunk('file3.ts'),
      ];
      await store.insertChunks(chunks);
      await store.close();

      const { searchByPath } = await import('../../../src/tools/searchByPath.js');
      const result = await searchByPath(
        { pattern: '*.ts', limit: 100 },
        { projectPath }
      );

      expect(result.matches.length).toBe(3);
      expect(result.totalMatches).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('searchByPathTool definition', () => {
    it('should have correct tool name', async () => {
      const { searchByPathTool } = await import('../../../src/tools/searchByPath.js');
      expect(searchByPathTool.name).toBe('search_by_path');
    });

    it('should have description', async () => {
      const { searchByPathTool } = await import('../../../src/tools/searchByPath.js');
      expect(searchByPathTool.description).toBe('Find files by name or glob pattern');
    });

    it('should not require confirmation (read-only)', async () => {
      const { searchByPathTool } = await import('../../../src/tools/searchByPath.js');
      expect(searchByPathTool.requiresConfirmation).toBe(false);
    });

    it('should have correct input schema structure', async () => {
      const { searchByPathTool } = await import('../../../src/tools/searchByPath.js');

      expect(searchByPathTool.inputSchema.type).toBe('object');
      expect(searchByPathTool.inputSchema.required).toContain('pattern');
      expect(searchByPathTool.inputSchema.properties.pattern).toMatchObject({
        type: 'string',
        description: expect.any(String),
      });
      expect(searchByPathTool.inputSchema.properties.limit).toMatchObject({
        type: 'number',
        default: 20,
        minimum: 1,
        maximum: 100,
      });
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export searchByPath from tools index', async () => {
      const { searchByPath } = await import('../../../src/tools/index.js');
      expect(searchByPath).toBeDefined();
      expect(typeof searchByPath).toBe('function');
    });

    it('should export searchByPathTool from tools index', async () => {
      const { searchByPathTool } = await import('../../../src/tools/index.js');
      expect(searchByPathTool).toBeDefined();
      expect(searchByPathTool.name).toBe('search_by_path');
    });

    it('should export SearchByPathInputSchema from tools index', async () => {
      const { SearchByPathInputSchema } = await import('../../../src/tools/index.js');
      expect(SearchByPathInputSchema).toBeDefined();
    });

    it('should export validateGlobPattern from tools index', async () => {
      const { validateGlobPattern } = await import('../../../src/tools/index.js');
      expect(validateGlobPattern).toBeDefined();
      expect(typeof validateGlobPattern).toBe('function');
    });

    it('should export matchPattern from tools index', async () => {
      const { matchPattern } = await import('../../../src/tools/index.js');
      expect(matchPattern).toBeDefined();
      expect(typeof matchPattern).toBe('function');
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

    it('should return empty results when index has no data', async () => {
      // Create metadata but no data in LanceDB
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      // Open and close store to create it without data
      const { LanceDBStore } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();
      await store.close();

      const { searchByPath } = await import('../../../src/tools/searchByPath.js');
      const result = await searchByPath(
        { pattern: '**/*.ts', limit: 20 },
        { projectPath }
      );

      expect(result.matches).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });
  });
});
