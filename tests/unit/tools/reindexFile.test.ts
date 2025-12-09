/**
 * reindex_file Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - File validation (exists, in deny list, passes policy)
 * - Index not found error handling
 * - Successful file reindex
 * - File not found error
 * - File in deny list error
 * - Chunk deletion and recreation
 * - Fingerprint update
 * - MCP tool definition
 * - Tools index exports
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('reindex_file Tool', () => {
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

  describe('ReindexFileInputSchema', () => {
    it('should validate valid path input', async () => {
      const { ReindexFileInputSchema } = await import('../../../src/tools/reindexFile.js');

      const result = ReindexFileInputSchema.safeParse({ path: 'src/auth/login.ts' });

      expect(result.success).toBe(true);
    });

    it('should reject empty path', async () => {
      const { ReindexFileInputSchema } = await import('../../../src/tools/reindexFile.js');

      const result = ReindexFileInputSchema.safeParse({ path: '' });

      expect(result.success).toBe(false);
    });

    it('should reject missing path', async () => {
      const { ReindexFileInputSchema } = await import('../../../src/tools/reindexFile.js');

      const result = ReindexFileInputSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('should accept paths with forward slashes', async () => {
      const { ReindexFileInputSchema } = await import('../../../src/tools/reindexFile.js');

      const result = ReindexFileInputSchema.safeParse({ path: 'src/components/Button.tsx' });

      expect(result.success).toBe(true);
    });

    it('should accept paths with backslashes', async () => {
      const { ReindexFileInputSchema } = await import('../../../src/tools/reindexFile.js');

      const result = ReindexFileInputSchema.safeParse({ path: 'src\\components\\Button.tsx' });

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // File Validation Tests
  // --------------------------------------------------------------------------

  describe('validateFilePath', () => {
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

    it('should validate existing file', async () => {
      const { validateFilePath } = await import('../../../src/tools/reindexFile.js');
      const { IndexingPolicy } = await import('../../../src/engines/indexPolicy.js');
      const { ConfigManager } = await import('../../../src/storage/config.js');

      const configManager = new ConfigManager(indexPath);
      await configManager.ensureExists();
      const config = await configManager.load();

      const policy = new IndexingPolicy(projectDir, config);
      await policy.initialize();

      const result = await validateFilePath('src/file0.ts', projectDir, policy);

      expect(result.valid).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it('should reject non-existent file', async () => {
      const { validateFilePath } = await import('../../../src/tools/reindexFile.js');
      const { IndexingPolicy } = await import('../../../src/engines/indexPolicy.js');
      const { ConfigManager } = await import('../../../src/storage/config.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      const configManager = new ConfigManager(indexPath);
      await configManager.ensureExists();
      const config = await configManager.load();

      const policy = new IndexingPolicy(projectDir, config);
      await policy.initialize();

      const result = await validateFilePath('src/nonexistent.ts', projectDir, policy);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.FILE_NOT_FOUND);
    });

    it('should reject file in hardcoded deny list (node_modules)', async () => {
      const { validateFilePath } = await import('../../../src/tools/reindexFile.js');
      const { IndexingPolicy } = await import('../../../src/engines/indexPolicy.js');
      const { ConfigManager } = await import('../../../src/storage/config.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      // Create a node_modules file
      const nodeModulesDir = path.join(projectDir, 'node_modules', 'some-package');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), '// package');

      const configManager = new ConfigManager(indexPath);
      await configManager.ensureExists();
      const config = await configManager.load();

      const policy = new IndexingPolicy(projectDir, config);
      await policy.initialize();

      const result = await validateFilePath('node_modules/some-package/index.js', projectDir, policy);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.PERMISSION_DENIED);
      expect(result.userMessage).toContain('deny list');
    });

    it('should reject .env files', async () => {
      const { validateFilePath } = await import('../../../src/tools/reindexFile.js');
      const { IndexingPolicy } = await import('../../../src/engines/indexPolicy.js');
      const { ConfigManager } = await import('../../../src/storage/config.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      // Create a .env file
      fs.writeFileSync(path.join(projectDir, '.env'), 'SECRET=value');

      const configManager = new ConfigManager(indexPath);
      await configManager.ensureExists();
      const config = await configManager.load();

      const policy = new IndexingPolicy(projectDir, config);
      await policy.initialize();

      const result = await validateFilePath('.env', projectDir, policy);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.PERMISSION_DENIED);
    });

    it('should reject path traversal attempts', async () => {
      const { validateFilePath } = await import('../../../src/tools/reindexFile.js');
      const { IndexingPolicy } = await import('../../../src/engines/indexPolicy.js');
      const { ConfigManager } = await import('../../../src/storage/config.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      const configManager = new ConfigManager(indexPath);
      await configManager.ensureExists();
      const config = await configManager.load();

      const policy = new IndexingPolicy(projectDir, config);
      await policy.initialize();

      const result = await validateFilePath('../../../etc/passwd', projectDir, policy);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.FILE_NOT_FOUND);
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
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      try {
        await reindexFile({ path: 'src/file0.ts' }, { projectPath: projectDir });
        // Should not reach here
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.INDEX_NOT_FOUND);
        expect(error.userMessage).toContain('create_index');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Successful Reindex Tests
  // --------------------------------------------------------------------------

  describe('successful file reindex', () => {
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

    it('should successfully reindex a file', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Now reindex a single file
      const result = await reindexFile({ path: 'src/file0.ts' }, { projectPath: projectDir });

      expect(result.status).toBe('success');
      expect(result.path).toBe('src/file0.ts');
      expect(result.chunksCreated).toBeGreaterThanOrEqual(0);
    });

    it('should handle file modification and reindex', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Modify the file
      fs.writeFileSync(
        path.join(projectDir, 'src', 'file0.ts'),
        `// Modified file\nexport function modifiedFunc() {\n  return "modified";\n}\n// More content to ensure chunks\n`.repeat(10)
      );

      // Reindex the modified file
      const result = await reindexFile({ path: 'src/file0.ts' }, { projectPath: projectDir });

      expect(result.status).toBe('success');
      expect(result.path).toBe('src/file0.ts');
    });

    it('should update fingerprint after reindex', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { FingerprintsManager } = await import('../../../src/storage/fingerprints.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Get the original fingerprint
      const fingerprintsManager = new FingerprintsManager(indexPath, projectDir);
      await fingerprintsManager.load();
      const originalFingerprint = fingerprintsManager.get('src/file0.ts');

      // Modify the file
      fs.writeFileSync(
        path.join(projectDir, 'src', 'file0.ts'),
        `// Modified file\nexport const x = ${Date.now()};\n`
      );

      // Reindex the modified file
      await reindexFile({ path: 'src/file0.ts' }, { projectPath: projectDir });

      // Reload fingerprints and check
      await fingerprintsManager.load();
      const newFingerprint = fingerprintsManager.get('src/file0.ts');

      expect(newFingerprint).toBeDefined();
      expect(newFingerprint).not.toBe(originalFingerprint);
    });
  });

  // --------------------------------------------------------------------------
  // File Not Found Error Tests
  // --------------------------------------------------------------------------

  describe('file not found error', () => {
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

    it('should throw FILE_NOT_FOUND for non-existent file', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      try {
        await reindexFile({ path: 'src/nonexistent.ts' }, { projectPath: projectDir });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
        expect(error.userMessage).toContain('nonexistent.ts');
      }
    });
  });

  // --------------------------------------------------------------------------
  // File in Deny List Error Tests
  // --------------------------------------------------------------------------

  describe('file in deny list error', () => {
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

    it('should throw PERMISSION_DENIED for file in node_modules', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      // Create a node_modules file
      const nodeModulesDir = path.join(projectDir, 'node_modules', 'some-package');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), '// package');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      try {
        await reindexFile({ path: 'node_modules/some-package/index.js' }, { projectPath: projectDir });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
        expect(error.userMessage).toContain('deny list');
      }
    });

    it('should throw PERMISSION_DENIED for .git files', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      // Create a .git directory with a file
      const gitDir = path.join(projectDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'config'), '# git config');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      try {
        await reindexFile({ path: '.git/config' }, { projectPath: projectDir });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
      }
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

    it('should return correct structure for success', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const result = await reindexFile({ path: 'src/file0.ts' }, { projectPath: projectDir });

      expect(result.status).toBe('success');
      expect(result.path).toBe('src/file0.ts');
      expect(typeof result.chunksCreated).toBe('number');
      expect(result.message).toBeUndefined();
    });

    it('should normalize path separators in result', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Use backslashes in input
      const result = await reindexFile({ path: 'src\\file0.ts' }, { projectPath: projectDir });

      expect(result.status).toBe('success');
      expect(result.path).toBe('src/file0.ts'); // Should be normalized to forward slashes
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('reindexFileTool definition', () => {
    it('should have correct tool name', async () => {
      const { reindexFileTool } = await import('../../../src/tools/reindexFile.js');
      expect(reindexFileTool.name).toBe('reindex_file');
    });

    it('should have description', async () => {
      const { reindexFileTool } = await import('../../../src/tools/reindexFile.js');
      expect(reindexFileTool.description).toContain('Re-index');
    });

    it('should NOT require confirmation', async () => {
      const { reindexFileTool } = await import('../../../src/tools/reindexFile.js');
      expect(reindexFileTool.requiresConfirmation).toBe(false);
    });

    it('should have correct input schema structure', async () => {
      const { reindexFileTool } = await import('../../../src/tools/reindexFile.js');

      expect(reindexFileTool.inputSchema.type).toBe('object');
      expect(reindexFileTool.inputSchema.properties).toHaveProperty('path');
      expect(reindexFileTool.inputSchema.required).toContain('path');
    });

    it('should have path property with correct description', async () => {
      const { reindexFileTool } = await import('../../../src/tools/reindexFile.js');

      const pathProp = reindexFileTool.inputSchema.properties.path;
      expect(pathProp.type).toBe('string');
      expect(pathProp.description).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export reindexFile from tools index', async () => {
      const { reindexFile } = await import('../../../src/tools/index.js');
      expect(reindexFile).toBeDefined();
      expect(typeof reindexFile).toBe('function');
    });

    it('should export reindexFileTool from tools index', async () => {
      const { reindexFileTool } = await import('../../../src/tools/index.js');
      expect(reindexFileTool).toBeDefined();
      expect(reindexFileTool.name).toBe('reindex_file');
    });

    it('should export ReindexFileInputSchema from tools index', async () => {
      const { ReindexFileInputSchema } = await import('../../../src/tools/index.js');
      expect(ReindexFileInputSchema).toBeDefined();
    });

    it('should export validateFilePath from tools index', async () => {
      const { validateFilePath } = await import('../../../src/tools/index.js');
      expect(validateFilePath).toBeDefined();
      expect(typeof validateFilePath).toBe('function');
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
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { isMCPError, ErrorCode } = await import('../../../src/errors/index.js');

      try {
        await reindexFile({ path: 'src/file0.ts' }, { projectPath: projectDir });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(isMCPError(error)).toBe(true);
        expect(error.code).toBe(ErrorCode.INDEX_NOT_FOUND);
      }
    });

    it('should throw MCPError with FILE_NOT_FOUND code when file does not exist', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { isMCPError, ErrorCode } = await import('../../../src/errors/index.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      try {
        await reindexFile({ path: 'src/missing.ts' }, { projectPath: projectDir });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(isMCPError(error)).toBe(true);
        expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      }
    });

    it('should throw MCPError with PERMISSION_DENIED code for denied files', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');
      const { isMCPError, ErrorCode } = await import('../../../src/errors/index.js');

      // Create a .env file
      fs.writeFileSync(path.join(projectDir, '.env'), 'SECRET=value');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      try {
        await reindexFile({ path: '.env' }, { projectPath: projectDir });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(isMCPError(error)).toBe(true);
        expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
      }
    });
  });

  // --------------------------------------------------------------------------
  // File Not Previously in Index Tests
  // --------------------------------------------------------------------------

  describe('file not previously in index', () => {
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

    it('should successfully index a new file that was not in the original index', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { reindexFile } = await import('../../../src/tools/reindexFile.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Add a new file after indexing
      fs.writeFileSync(
        path.join(projectDir, 'src', 'newfile.ts'),
        '// New file\nexport const x = 1;\n'
      );

      // Reindex the new file
      const result = await reindexFile({ path: 'src/newfile.ts' }, { projectPath: projectDir });

      expect(result.status).toBe('success');
      expect(result.path).toBe('src/newfile.ts');
      expect(result.chunksCreated).toBeGreaterThanOrEqual(0);
    });
  });
});
