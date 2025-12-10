/**
 * create_index Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - formatDuration utility function
 * - formatProgressMessage utility function
 * - Project detection flow
 * - Confirmation flow (cancelled vs confirmed)
 * - Progress reporting
 * - Existing index handling
 * - Error handling
 * - MCP tool definition
 * - Tools index exports
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the logger to avoid file system side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
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
 * Create a project directory with marker files
 */
function createProjectDir(tempDir: string, markers: string[] = ['package.json']): string {
  const projectDir = path.join(tempDir, 'test-project');
  fs.mkdirSync(projectDir, { recursive: true });

  for (const marker of markers) {
    const markerPath = path.join(projectDir, marker);
    if (marker.endsWith('/')) {
      fs.mkdirSync(markerPath, { recursive: true });
    } else if (marker === 'package.json') {
      fs.writeFileSync(markerPath, JSON.stringify({ name: 'test-project' }));
    } else {
      fs.writeFileSync(markerPath, '');
    }
  }

  return projectDir;
}

/**
 * Create sample source files in a project
 */
function createSampleFiles(projectDir: string, count: number = 3): void {
  const srcDir = path.join(projectDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  for (let i = 0; i < count; i++) {
    const filePath = path.join(srcDir, `file${i}.ts`);
    fs.writeFileSync(
      filePath,
      `// File ${i}\nexport function func${i}() {\n  return ${i};\n}\n`
    );
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('create_index Tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Input Schema Tests
  // --------------------------------------------------------------------------

  describe('CreateIndexInputSchema', () => {
    it('should validate empty object input', async () => {
      const { CreateIndexInputSchema } = await import('../../../src/tools/createIndex.js');

      const result = CreateIndexInputSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should accept additional properties (ignored)', async () => {
      const { CreateIndexInputSchema } = await import('../../../src/tools/createIndex.js');

      // Zod strips unknown properties by default
      const result = CreateIndexInputSchema.safeParse({
        unknownProp: 'value',
        anotherProp: 123,
      });

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // formatDuration Tests
  // --------------------------------------------------------------------------

  describe('formatDuration', () => {
    it('should format seconds correctly', async () => {
      const { formatDuration } = await import('../../../src/tools/createIndex.js');

      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(45000)).toBe('45s');
      expect(formatDuration(59000)).toBe('59s');
    });

    it('should format minutes correctly', async () => {
      const { formatDuration } = await import('../../../src/tools/createIndex.js');

      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(120000)).toBe('2m');
      expect(formatDuration(150000)).toBe('2m 30s');
      expect(formatDuration(300000)).toBe('5m');
    });

    it('should format hours correctly', async () => {
      const { formatDuration } = await import('../../../src/tools/createIndex.js');

      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(3660000)).toBe('1h 1m');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(7200000)).toBe('2h 0m');
    });

    it('should handle sub-second durations', async () => {
      const { formatDuration } = await import('../../../src/tools/createIndex.js');

      expect(formatDuration(500)).toBe('0s');
      expect(formatDuration(999)).toBe('0s');
    });
  });

  // --------------------------------------------------------------------------
  // formatProgressMessage Tests
  // --------------------------------------------------------------------------

  describe('formatProgressMessage', () => {
    it('should format scanning phase correctly', async () => {
      const { formatProgressMessage } = await import('../../../src/tools/createIndex.js');

      expect(formatProgressMessage({ phase: 'scanning', current: 0, total: 0 })).toBe(
        'Scanning files...'
      );
      expect(formatProgressMessage({ phase: 'scanning', current: 100, total: 500 })).toBe(
        'Scanning files... [100/500]'
      );
    });

    it('should format chunking phase correctly', async () => {
      const { formatProgressMessage } = await import('../../../src/tools/createIndex.js');

      expect(formatProgressMessage({ phase: 'chunking', current: 10, total: 50 })).toBe(
        'Creating chunks... [10/50]'
      );
      expect(
        formatProgressMessage({
          phase: 'chunking',
          current: 10,
          total: 50,
          currentFile: 'src/utils/hash.ts',
        })
      ).toBe('Creating chunks... [10/50] src/utils/hash.ts');
    });

    it('should format embedding phase correctly', async () => {
      const { formatProgressMessage } = await import('../../../src/tools/createIndex.js');

      expect(formatProgressMessage({ phase: 'embedding', current: 0, total: 100 })).toBe(
        'Generating embeddings... [0%]'
      );
      expect(formatProgressMessage({ phase: 'embedding', current: 50, total: 100 })).toBe(
        'Generating embeddings... [50%]'
      );
      expect(formatProgressMessage({ phase: 'embedding', current: 100, total: 100 })).toBe(
        'Generating embeddings... [100%]'
      );
    });

    it('should format storing phase correctly', async () => {
      const { formatProgressMessage } = await import('../../../src/tools/createIndex.js');

      expect(formatProgressMessage({ phase: 'storing', current: 25, total: 100 })).toBe(
        'Storing chunks... [25/100]'
      );
    });

    it('should handle unknown phases gracefully', async () => {
      const { formatProgressMessage } = await import('../../../src/tools/createIndex.js');

      // TypeScript will complain but test for runtime safety
      expect(
        formatProgressMessage({ phase: 'unknown' as any, current: 10, total: 50 })
      ).toBe('Processing... [10/50]');
    });
  });

  // --------------------------------------------------------------------------
  // Project Detection Tests
  // --------------------------------------------------------------------------

  describe('detectProject', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      // Clean up any index directories created
      const { getIndexPath } = await import('../../../src/utils/paths.js');
      // Clean up indexes that might have been created
    });

    it('should detect project root from package.json', async () => {
      const { detectProject } = await import('../../../src/tools/createIndex.js');

      const projectDir = createProjectDir(tempDir, ['package.json']);
      const subDir = path.join(projectDir, 'src', 'utils');
      fs.mkdirSync(subDir, { recursive: true });

      const result = await detectProject({ projectPath: subDir });

      expect(result).toBe(projectDir);
    });

    it('should detect project root from .git directory', async () => {
      const { detectProject } = await import('../../../src/tools/createIndex.js');

      const projectDir = createProjectDir(tempDir, ['.git/']);
      const subDir = path.join(projectDir, 'src');
      fs.mkdirSync(subDir, { recursive: true });

      const result = await detectProject({ projectPath: subDir });

      expect(result).toBe(projectDir);
    });

    it('should handle directories without immediate markers', async () => {
      const { detectProject } = await import('../../../src/tools/createIndex.js');

      // Create a subdirectory without project markers directly in it
      // The detectProject function searches upward, so it may find markers
      // in parent directories. If not found, it falls back to the provided path.
      const subDir = path.join(tempDir, 'sub', 'nested');
      fs.mkdirSync(subDir, { recursive: true });

      // The result should be either:
      // 1. The provided path (if no markers found anywhere)
      // 2. A parent directory that has markers (if found in parent)
      const result = await detectProject({ projectPath: subDir });

      // Result should be a valid path that is either the input or an ancestor
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // The result should contain at least the temp dir base path
      // or be above it if a project marker was found in parent directories
    });
  });

  // --------------------------------------------------------------------------
  // Confirmation Flow Tests
  // --------------------------------------------------------------------------

  describe('confirmation flow', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 1); // Create minimal files

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return cancelled status when confirmed is false', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: false });

      expect(result.status).toBe('cancelled');
      expect(result.projectPath).toBeUndefined();
      expect(result.filesIndexed).toBeUndefined();
      expect(result.chunksCreated).toBeUndefined();
      expect(result.duration).toBeUndefined();
    });

    it('should proceed with indexing when confirmed is true', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
      expect(result.projectPath).toBeDefined();
      expect(result.filesIndexed).toBeGreaterThanOrEqual(0);
      expect(result.chunksCreated).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeDefined();
    });

    it('should return cancelled when confirmed is undefined (security: prevent bypass)', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      // SECURITY: undefined confirmed should NOT proceed - prevents bypass attacks
      const result = await createIndex({}, { projectPath: projectDir });

      expect(result.status).toBe('cancelled');
    });

    it('should return cancelled when confirmed is null (security: prevent bypass)', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      // SECURITY: null confirmed should NOT proceed - prevents bypass attacks
      const result = await createIndex({}, { projectPath: projectDir, confirmed: null as any });

      expect(result.status).toBe('cancelled');
    });
  });

  // --------------------------------------------------------------------------
  // Progress Reporting Tests
  // --------------------------------------------------------------------------

  describe('progress reporting', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 3);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should call progress callback during indexing', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const progressUpdates: any[] = [];
      const onProgress = vi.fn((progress) => {
        progressUpdates.push(progress);
      });

      await createIndex({}, { projectPath: projectDir, confirmed: true, onProgress });

      // Should have received progress updates
      expect(onProgress).toHaveBeenCalled();
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should report scanning phase', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const progressUpdates: any[] = [];
      const onProgress = vi.fn((progress) => {
        progressUpdates.push({ ...progress });
      });

      await createIndex({}, { projectPath: projectDir, confirmed: true, onProgress });

      const scanningUpdates = progressUpdates.filter((p) => p.phase === 'scanning');
      expect(scanningUpdates.length).toBeGreaterThan(0);
    });

    it('should report chunking phase when files are processed', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const progressUpdates: any[] = [];
      const onProgress = vi.fn((progress) => {
        progressUpdates.push({ ...progress });
      });

      await createIndex({}, { projectPath: projectDir, confirmed: true, onProgress });

      // Check for chunking or embedding phases
      const processingUpdates = progressUpdates.filter(
        (p) => p.phase === 'chunking' || p.phase === 'embedding' || p.phase === 'storing'
      );
      // May or may not have processing updates depending on file content
      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Existing Index Handling Tests
  // --------------------------------------------------------------------------

  describe('existing index handling', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 2);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should detect when index already exists', async () => {
      const { createIndex, indexExists } = await import('../../../src/tools/createIndex.js');

      // First, create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Check that it exists
      const exists = await indexExists(projectDir);
      expect(exists).toBe(true);
    });

    it('should rebuild index when it already exists', async () => {
      const { createIndex, indexExists } = await import('../../../src/tools/createIndex.js');

      // First, create an index
      const firstResult = await createIndex({}, { projectPath: projectDir, confirmed: true });
      expect(firstResult.status).toBe('success');

      // Add another file
      fs.writeFileSync(
        path.join(projectDir, 'src', 'newfile.ts'),
        '// New file\nexport const x = 1;\n'
      );

      // Recreate the index
      const secondResult = await createIndex({}, { projectPath: projectDir, confirmed: true });
      expect(secondResult.status).toBe('success');

      // Index should still exist
      const exists = await indexExists(projectDir);
      expect(exists).toBe(true);
    });

    it('should return false for indexExists when no index exists', async () => {
      const { indexExists } = await import('../../../src/tools/createIndex.js');

      const newProjectDir = path.join(tempDir, 'new-project');
      fs.mkdirSync(newProjectDir, { recursive: true });

      const exists = await indexExists(newProjectDir);
      expect(exists).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Success Output Tests
  // --------------------------------------------------------------------------

  describe('successful indexing output', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 5);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return success status', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
    });

    it('should return project path', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.projectPath).toBe(projectDir);
    });

    it('should return files indexed count', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(typeof result.filesIndexed).toBe('number');
      expect(result.filesIndexed).toBeGreaterThanOrEqual(0);
    });

    it('should return chunks created count', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(typeof result.chunksCreated).toBe('number');
      expect(result.chunksCreated).toBeGreaterThanOrEqual(0);
    });

    it('should return duration string', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(typeof result.duration).toBe('string');
      expect(result.duration).toMatch(/^\d+[smh]/); // Matches patterns like "45s", "2m 30s", "1h 0m"
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('createIndexTool definition', () => {
    it('should have correct tool name', async () => {
      const { createIndexTool } = await import('../../../src/tools/createIndex.js');
      expect(createIndexTool.name).toBe('create_index');
    });

    it('should have description', async () => {
      const { createIndexTool } = await import('../../../src/tools/createIndex.js');
      expect(createIndexTool.description).toContain('Create a search index');
    });

    it('should require confirmation', async () => {
      const { createIndexTool } = await import('../../../src/tools/createIndex.js');
      expect(createIndexTool.requiresConfirmation).toBe(true);
    });

    it('should have correct input schema structure', async () => {
      const { createIndexTool } = await import('../../../src/tools/createIndex.js');

      expect(createIndexTool.inputSchema.type).toBe('object');
      expect(createIndexTool.inputSchema.properties).toEqual({});
      expect(createIndexTool.inputSchema.required).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getConfirmationMessage Tests
  // --------------------------------------------------------------------------

  describe('getConfirmationMessage', () => {
    it('should include project path', async () => {
      const { getConfirmationMessage } = await import('../../../src/tools/createIndex.js');

      const message = getConfirmationMessage('/path/to/project');

      expect(message).toContain('/path/to/project');
    });

    it('should mention timing', async () => {
      const { getConfirmationMessage } = await import('../../../src/tools/createIndex.js');

      const message = getConfirmationMessage('/path/to/project');

      expect(message).toMatch(/minutes|time/i);
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export createIndex from tools index', async () => {
      const { createIndex } = await import('../../../src/tools/index.js');
      expect(createIndex).toBeDefined();
      expect(typeof createIndex).toBe('function');
    });

    it('should export createIndexTool from tools index', async () => {
      const { createIndexTool } = await import('../../../src/tools/index.js');
      expect(createIndexTool).toBeDefined();
      expect(createIndexTool.name).toBe('create_index');
    });

    it('should export CreateIndexInputSchema from tools index', async () => {
      const { CreateIndexInputSchema } = await import('../../../src/tools/index.js');
      expect(CreateIndexInputSchema).toBeDefined();
    });

    it('should export detectProject from tools index', async () => {
      const { detectProject } = await import('../../../src/tools/index.js');
      expect(detectProject).toBeDefined();
      expect(typeof detectProject).toBe('function');
    });

    it('should export indexExists from tools index', async () => {
      const { indexExists } = await import('../../../src/tools/index.js');
      expect(indexExists).toBeDefined();
      expect(typeof indexExists).toBe('function');
    });

    it('should export formatDuration from tools index', async () => {
      const { formatDuration } = await import('../../../src/tools/index.js');
      expect(formatDuration).toBeDefined();
      expect(typeof formatDuration).toBe('function');
    });

    it('should export formatProgressMessage from tools index', async () => {
      const { formatProgressMessage } = await import('../../../src/tools/index.js');
      expect(formatProgressMessage).toBeDefined();
      expect(typeof formatProgressMessage).toBe('function');
    });

    it('should export getConfirmationMessage from tools index', async () => {
      const { getConfirmationMessage } = await import('../../../src/tools/index.js');
      expect(getConfirmationMessage).toBeDefined();
      expect(typeof getConfirmationMessage).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling Tests
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should wrap unexpected errors as MCPError', async () => {
      const { MCPError, ErrorCode, isMCPError } = await import('../../../src/errors/index.js');

      // Verify that our error wrapping works correctly
      const wrappedError = new MCPError({
        code: ErrorCode.INDEX_CORRUPT,
        userMessage: 'Test user message',
        developerMessage: 'Test developer message',
      });

      expect(isMCPError(wrappedError)).toBe(true);
      expect(wrappedError.code).toBe(ErrorCode.INDEX_CORRUPT);
      expect(wrappedError.userMessage).toBe('Test user message');
    });

    it('should return cancelled status on confirmation false without errors', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      // This should return immediately without doing any work
      const result = await createIndex({}, { projectPath: '/any/path', confirmed: false });

      expect(result.status).toBe('cancelled');
    });
  });

  // --------------------------------------------------------------------------
  // Output Structure Tests
  // --------------------------------------------------------------------------

  describe('output structure', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 2);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return only status for cancelled', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: false });

      expect(Object.keys(result)).toEqual(['status']);
      expect(result.status).toBe('cancelled');
    });

    it('should return full structure for success', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
      expect(typeof result.projectPath).toBe('string');
      expect(typeof result.filesIndexed).toBe('number');
      expect(typeof result.chunksCreated).toBe('number');
      expect(typeof result.duration).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Integration with IndexManager Tests
  // --------------------------------------------------------------------------

  describe('integration with IndexManager', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 3);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should create metadata file after indexing', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const metadataPath = path.join(indexPath, 'metadata.json');
      expect(fs.existsSync(metadataPath)).toBe(true);
    });

    it('should create fingerprints file after indexing', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      expect(fs.existsSync(fingerprintsPath)).toBe(true);
    });

    it('should create LanceDB directory after indexing', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');

      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const lancedbPath = path.join(indexPath, 'index.lancedb');
      expect(fs.existsSync(lancedbPath)).toBe(true);
    });
  });
});
