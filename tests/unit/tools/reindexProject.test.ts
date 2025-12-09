/**
 * reindex_project Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - Confirmation flow (cancelled vs confirmed)
 * - Config preservation during reindex
 * - No-index error handling (INDEX_NOT_FOUND)
 * - Progress reporting
 * - Index data deletion
 * - Full reindex flow
 * - MCP tool definition
 * - Tools index exports
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

describe('reindex_project Tool', () => {
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

  describe('ReindexProjectInputSchema', () => {
    it('should validate empty object input', async () => {
      const { ReindexProjectInputSchema } = await import('../../../src/tools/reindexProject.js');

      const result = ReindexProjectInputSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should accept additional properties (ignored)', async () => {
      const { ReindexProjectInputSchema } = await import('../../../src/tools/reindexProject.js');

      // Zod strips unknown properties by default
      const result = ReindexProjectInputSchema.safeParse({
        unknownProp: 'value',
        anotherProp: 123,
      });

      expect(result.success).toBe(true);
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

    it('should return cancelled status when confirmed is false', async () => {
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      const result = await reindexProject({}, { projectPath: projectDir, confirmed: false });

      expect(result.status).toBe('cancelled');
      expect(result.filesIndexed).toBeUndefined();
      expect(result.chunksCreated).toBeUndefined();
      expect(result.duration).toBeUndefined();
    });

    it('should proceed with reindexing when confirmed is true and index exists', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Now reindex
      const result = await reindexProject({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
      expect(result.filesIndexed).toBeGreaterThanOrEqual(0);
      expect(result.chunksCreated).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeDefined();
    });

    it('should proceed when confirmed is undefined and index exists (default behavior)', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Now reindex without explicit confirmation
      const result = await reindexProject({}, { projectPath: projectDir });

      expect(result.status).toBe('success');
    });
  });

  // --------------------------------------------------------------------------
  // No-Index Error Handling Tests
  // --------------------------------------------------------------------------

  describe('no-index error handling', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 1);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should throw INDEX_NOT_FOUND when no index exists', async () => {
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      try {
        await reindexProject({}, { projectPath: projectDir, confirmed: true });
        // Should not reach here
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.INDEX_NOT_FOUND);
        expect(error.userMessage).toContain('create_index');
      }
    });

    it('should suggest create_index in error message', async () => {
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      try {
        await reindexProject({}, { projectPath: projectDir, confirmed: true });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.userMessage.toLowerCase()).toContain('create_index');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Config Preservation Tests
  // --------------------------------------------------------------------------

  describe('config preservation', () => {
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

    it('should preserve config.json after reindex', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Verify config exists
      const configPath = path.join(indexPath, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      // Read original config
      const originalConfig = fs.readFileSync(configPath, 'utf-8');

      // Reindex
      await reindexProject({}, { projectPath: projectDir, confirmed: true });

      // Config should still exist
      expect(fs.existsSync(configPath)).toBe(true);

      // Config content should be preserved (or recreated with same defaults)
      const newConfig = fs.readFileSync(configPath, 'utf-8');
      expect(JSON.parse(newConfig)).toMatchObject({
        include: expect.any(Array),
        exclude: expect.any(Array),
        respectGitignore: expect.any(Boolean),
        maxFileSize: expect.any(String),
        maxFiles: expect.any(Number),
      });
    });

    it('should successfully load existing config', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { loadExistingConfig } = await import('../../../src/tools/reindexProject.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Load the config
      const config = await loadExistingConfig(indexPath);

      // Config should have the expected fields (not null, has include/exclude arrays)
      expect(config).not.toBeNull();
      expect(config?.include).toBeDefined();
      expect(config?.maxFileSize).toBeDefined();
    });

    it('should return default config for non-existent config file', async () => {
      const { loadExistingConfig } = await import('../../../src/tools/reindexProject.js');

      // Try to load config from non-existent path
      // The loadConfig function returns default config when file doesn't exist
      const nonExistentPath = path.join(tempDir, 'nonexistent');
      const config = await loadExistingConfig(nonExistentPath);

      // Should return default config (not null) because loadConfig returns defaults
      // The loadExistingConfig catches errors and returns null, but loadConfig
      // returns defaults for missing files
      expect(config).not.toBeNull();
      expect(config?.include).toEqual(['**/*']); // Default value
    });
  });

  // --------------------------------------------------------------------------
  // Index Data Deletion Tests
  // --------------------------------------------------------------------------

  describe('deleteIndexData', () => {
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

    it('should delete fingerprints.json', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndexData } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      expect(fs.existsSync(fingerprintsPath)).toBe(true);

      // Delete index data
      await deleteIndexData(indexPath);

      // Fingerprints should be deleted
      expect(fs.existsSync(fingerprintsPath)).toBe(false);
    });

    it('should delete metadata.json', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndexData } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const metadataPath = path.join(indexPath, 'metadata.json');
      expect(fs.existsSync(metadataPath)).toBe(true);

      // Delete index data
      await deleteIndexData(indexPath);

      // Metadata should be deleted
      expect(fs.existsSync(metadataPath)).toBe(false);
    });

    it('should preserve config.json', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndexData } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const configPath = path.join(indexPath, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      // Delete index data
      await deleteIndexData(indexPath);

      // Config should be preserved
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should handle non-existent files gracefully', async () => {
      const { deleteIndexData } = await import('../../../src/tools/reindexProject.js');

      // Create empty index directory
      fs.mkdirSync(indexPath, { recursive: true });

      // Should not throw when files don't exist
      await expect(deleteIndexData(indexPath)).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // checkIndexExists Tests
  // --------------------------------------------------------------------------

  describe('checkIndexExists', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 1);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return true when index exists', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { checkIndexExists } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const exists = await checkIndexExists(projectDir);
      expect(exists).toBe(true);
    });

    it('should return false when index does not exist', async () => {
      const { checkIndexExists } = await import('../../../src/tools/reindexProject.js');

      const exists = await checkIndexExists(projectDir);
      expect(exists).toBe(false);
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

    it('should call progress callback during reindexing', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const progressUpdates: any[] = [];
      const onProgress = vi.fn((progress) => {
        progressUpdates.push(progress);
      });

      await reindexProject({}, { projectPath: projectDir, confirmed: true, onProgress });

      // Should have received progress updates
      expect(onProgress).toHaveBeenCalled();
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should report scanning phase during reindex', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const progressUpdates: any[] = [];
      const onProgress = vi.fn((progress) => {
        progressUpdates.push({ ...progress });
      });

      await reindexProject({}, { projectPath: projectDir, confirmed: true, onProgress });

      const scanningUpdates = progressUpdates.filter((p) => p.phase === 'scanning');
      expect(scanningUpdates.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Full Reindex Flow Tests
  // --------------------------------------------------------------------------

  describe('full reindex flow', () => {
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

    it('should successfully reindex a project', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // Create initial index
      const initialResult = await createIndex({}, { projectPath: projectDir, confirmed: true });
      expect(initialResult.status).toBe('success');

      // Reindex
      const reindexResult = await reindexProject({}, { projectPath: projectDir, confirmed: true });

      expect(reindexResult.status).toBe('success');
      expect(reindexResult.filesIndexed).toBeGreaterThanOrEqual(0);
      expect(reindexResult.chunksCreated).toBeGreaterThanOrEqual(0);
      expect(reindexResult.duration).toBeDefined();
    });

    it('should recreate all index files after reindex', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // Create initial index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Reindex
      await reindexProject({}, { projectPath: projectDir, confirmed: true });

      // All index files should exist
      expect(fs.existsSync(path.join(indexPath, 'metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexPath, 'fingerprints.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexPath, 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexPath, 'index.lancedb'))).toBe(true);
    });

    it('should handle reindex with modified files', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // Create initial index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Add a new file
      fs.writeFileSync(
        path.join(projectDir, 'src', 'newfile.ts'),
        '// New file\nexport const x = 1;\n'
      );

      // Modify an existing file
      fs.writeFileSync(
        path.join(projectDir, 'src', 'file0.ts'),
        '// Modified file\nexport function modifiedFunc() {\n  return "modified";\n}\n'
      );

      // Reindex
      const reindexResult = await reindexProject({}, { projectPath: projectDir, confirmed: true });

      expect(reindexResult.status).toBe('success');
      // Should include the new/modified files
      expect(reindexResult.filesIndexed).toBeGreaterThan(0);
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
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      const result = await reindexProject({}, { projectPath: projectDir, confirmed: false });

      expect(Object.keys(result)).toEqual(['status']);
      expect(result.status).toBe('cancelled');
    });

    it('should return full structure for success', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const result = await reindexProject({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
      expect(typeof result.filesIndexed).toBe('number');
      expect(typeof result.chunksCreated).toBe('number');
      expect(typeof result.duration).toBe('string');
    });

    it('should include duration in human-readable format', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const result = await reindexProject({}, { projectPath: projectDir, confirmed: true });

      expect(result.duration).toMatch(/^\d+[smh]/);
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('reindexProjectTool definition', () => {
    it('should have correct tool name', async () => {
      const { reindexProjectTool } = await import('../../../src/tools/reindexProject.js');
      expect(reindexProjectTool.name).toBe('reindex_project');
    });

    it('should have description', async () => {
      const { reindexProjectTool } = await import('../../../src/tools/reindexProject.js');
      expect(reindexProjectTool.description).toContain('Rebuild');
    });

    it('should require confirmation', async () => {
      const { reindexProjectTool } = await import('../../../src/tools/reindexProject.js');
      expect(reindexProjectTool.requiresConfirmation).toBe(true);
    });

    it('should have correct input schema structure', async () => {
      const { reindexProjectTool } = await import('../../../src/tools/reindexProject.js');

      expect(reindexProjectTool.inputSchema.type).toBe('object');
      expect(reindexProjectTool.inputSchema.properties).toEqual({});
      expect(reindexProjectTool.inputSchema.required).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getReindexConfirmationMessage Tests
  // --------------------------------------------------------------------------

  describe('getReindexConfirmationMessage', () => {
    it('should return a confirmation message', async () => {
      const { getReindexConfirmationMessage } = await import('../../../src/tools/reindexProject.js');

      const message = getReindexConfirmationMessage();

      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should mention rebuild or continue', async () => {
      const { getReindexConfirmationMessage } = await import('../../../src/tools/reindexProject.js');

      const message = getReindexConfirmationMessage();

      expect(message.toLowerCase()).toMatch(/rebuild|continue/i);
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export reindexProject from tools index', async () => {
      const { reindexProject } = await import('../../../src/tools/index.js');
      expect(reindexProject).toBeDefined();
      expect(typeof reindexProject).toBe('function');
    });

    it('should export reindexProjectTool from tools index', async () => {
      const { reindexProjectTool } = await import('../../../src/tools/index.js');
      expect(reindexProjectTool).toBeDefined();
      expect(reindexProjectTool.name).toBe('reindex_project');
    });

    it('should export ReindexProjectInputSchema from tools index', async () => {
      const { ReindexProjectInputSchema } = await import('../../../src/tools/index.js');
      expect(ReindexProjectInputSchema).toBeDefined();
    });

    it('should export checkIndexExists from tools index', async () => {
      const { checkIndexExists } = await import('../../../src/tools/index.js');
      expect(checkIndexExists).toBeDefined();
      expect(typeof checkIndexExists).toBe('function');
    });

    it('should export loadExistingConfig from tools index', async () => {
      const { loadExistingConfig } = await import('../../../src/tools/index.js');
      expect(loadExistingConfig).toBeDefined();
      expect(typeof loadExistingConfig).toBe('function');
    });

    it('should export deleteIndexData from tools index', async () => {
      const { deleteIndexData } = await import('../../../src/tools/index.js');
      expect(deleteIndexData).toBeDefined();
      expect(typeof deleteIndexData).toBe('function');
    });

    it('should export getReindexConfirmationMessage from tools index', async () => {
      const { getReindexConfirmationMessage } = await import('../../../src/tools/index.js');
      expect(getReindexConfirmationMessage).toBeDefined();
      expect(typeof getReindexConfirmationMessage).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling Tests
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 1);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should throw MCPError with INDEX_NOT_FOUND code when no index exists', async () => {
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');
      const { isMCPError, ErrorCode } = await import('../../../src/errors/index.js');

      try {
        await reindexProject({}, { projectPath: projectDir, confirmed: true });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(isMCPError(error)).toBe(true);
        expect(error.code).toBe(ErrorCode.INDEX_NOT_FOUND);
      }
    });

    it('should return cancelled status without errors when confirmed is false', async () => {
      const { reindexProject } = await import('../../../src/tools/reindexProject.js');

      // This should return immediately without doing any work
      const result = await reindexProject({}, { projectPath: '/any/path', confirmed: false });

      expect(result.status).toBe('cancelled');
    });
  });
});
