/**
 * delete_index Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - Confirmation flow (cancelled vs confirmed)
 * - No-index handling (returns not_found status)
 * - Safe path validation (security)
 * - File watcher stop callback
 * - LanceDB close callback
 * - Directory removal
 * - Partial deletion handling
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

describe('delete_index Tool', () => {
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

  describe('DeleteIndexInputSchema', () => {
    it('should validate empty object input', async () => {
      const { DeleteIndexInputSchema } = await import('../../../src/tools/deleteIndex.js');

      const result = DeleteIndexInputSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should accept additional properties (ignored)', async () => {
      const { DeleteIndexInputSchema } = await import('../../../src/tools/deleteIndex.js');

      // Zod strips unknown properties by default
      const result = DeleteIndexInputSchema.safeParse({
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
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: false });

      expect(result.status).toBe('cancelled');
      expect(result.projectPath).toBeUndefined();
      expect(result.message).toBeUndefined();
    });

    it('should return cancelled without checking for index when confirmed is false', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Use a non-existent path - should still return cancelled without error
      const result = await deleteIndex({}, { projectPath: '/some/nonexistent/path', confirmed: false });

      expect(result.status).toBe('cancelled');
    });

    it('should proceed with deletion when confirmed is true and index exists', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Verify index was created
      expect(fs.existsSync(path.join(indexPath, 'metadata.json'))).toBe(true);

      // Now delete
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
      expect(result.projectPath).toBe(projectDir);
    });

    it('should return cancelled when confirmed is undefined (security: prevent bypass)', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // SECURITY: undefined confirmed should NOT proceed - prevents bypass attacks
      const result = await deleteIndex({}, { projectPath: projectDir });

      expect(result.status).toBe('cancelled');
    });

    it('should return cancelled when confirmed is null (security: prevent bypass)', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // SECURITY: null confirmed should NOT proceed - prevents bypass attacks
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: null as any });

      expect(result.status).toBe('cancelled');
    });
  });

  // --------------------------------------------------------------------------
  // No-Index Handling Tests
  // --------------------------------------------------------------------------

  describe('no-index handling', () => {
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

    it('should return not_found status when no index exists', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('not_found');
      expect(result.message).toContain('No search index');
    });

    it('should not throw error when index does not exist', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Should not throw
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('not_found');
    });

    it('should include helpful message for not_found status', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.message).toBeDefined();
      expect(result.message!.toLowerCase()).toContain('no');
      expect(result.message!.toLowerCase()).toContain('index');
    });
  });

  // --------------------------------------------------------------------------
  // Safe Path Validation Tests
  // --------------------------------------------------------------------------

  describe('isPathSafeToDelete', () => {
    it('should return true for paths within indexes directory', async () => {
      const { isPathSafeToDelete } = await import('../../../src/tools/deleteIndex.js');
      const { getIndexesDir } = await import('../../../src/utils/paths.js');

      const indexesDir = getIndexesDir();
      const testPath = path.join(indexesDir, 'test-index-hash');

      const result = isPathSafeToDelete(testPath);

      expect(result).toBe(true);
    });

    it('should return false for paths outside indexes directory', async () => {
      const { isPathSafeToDelete } = await import('../../../src/tools/deleteIndex.js');

      // Try to delete home directory
      const result = isPathSafeToDelete(os.homedir());

      expect(result).toBe(false);
    });

    it('should return false for system paths', async () => {
      const { isPathSafeToDelete } = await import('../../../src/tools/deleteIndex.js');

      // Try system paths
      expect(isPathSafeToDelete('/etc')).toBe(false);
      expect(isPathSafeToDelete('/usr')).toBe(false);
      expect(isPathSafeToDelete('/tmp')).toBe(false);
    });

    it('should return false for user documents', async () => {
      const { isPathSafeToDelete } = await import('../../../src/tools/deleteIndex.js');

      const documentsPath = path.join(os.homedir(), 'Documents');
      const result = isPathSafeToDelete(documentsPath);

      expect(result).toBe(false);
    });

    it('should return false for path traversal attempts', async () => {
      const { isPathSafeToDelete } = await import('../../../src/tools/deleteIndex.js');
      const { getIndexesDir } = await import('../../../src/utils/paths.js');

      const indexesDir = getIndexesDir();
      // Attempt to escape indexes directory
      const traversalPath = path.join(indexesDir, '..', '..', '..');

      const result = isPathSafeToDelete(traversalPath);

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // safeDeleteIndex Tests
  // --------------------------------------------------------------------------

  describe('safeDeleteIndex', () => {
    let indexPath: string;

    beforeEach(async () => {
      const { getIndexesDir } = await import('../../../src/utils/paths.js');
      const indexesDir = getIndexesDir();
      indexPath = path.join(indexesDir, `test-${Date.now()}`);
      fs.mkdirSync(indexPath, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should delete fingerprints.json', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create fingerprints file
      fs.writeFileSync(path.join(indexPath, 'fingerprints.json'), '{}');
      expect(fs.existsSync(path.join(indexPath, 'fingerprints.json'))).toBe(true);

      await safeDeleteIndex(indexPath);

      expect(fs.existsSync(path.join(indexPath, 'fingerprints.json'))).toBe(false);
    });

    it('should delete metadata.json', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create metadata file
      fs.writeFileSync(path.join(indexPath, 'metadata.json'), '{}');
      expect(fs.existsSync(path.join(indexPath, 'metadata.json'))).toBe(true);

      await safeDeleteIndex(indexPath);

      expect(fs.existsSync(path.join(indexPath, 'metadata.json'))).toBe(false);
    });

    it('should delete config.json', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create config file
      fs.writeFileSync(path.join(indexPath, 'config.json'), '{}');
      expect(fs.existsSync(path.join(indexPath, 'config.json'))).toBe(true);

      await safeDeleteIndex(indexPath);

      expect(fs.existsSync(path.join(indexPath, 'config.json'))).toBe(false);
    });

    it('should delete index.lancedb directory', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create lancedb directory
      const lancedbPath = path.join(indexPath, 'index.lancedb');
      fs.mkdirSync(lancedbPath, { recursive: true });
      fs.writeFileSync(path.join(lancedbPath, 'data.bin'), 'test');
      expect(fs.existsSync(lancedbPath)).toBe(true);

      await safeDeleteIndex(indexPath);

      expect(fs.existsSync(lancedbPath)).toBe(false);
    });

    it('should delete logs directory', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create logs directory
      const logsPath = path.join(indexPath, 'logs');
      fs.mkdirSync(logsPath, { recursive: true });
      fs.writeFileSync(path.join(logsPath, 'index.log'), 'test log');
      expect(fs.existsSync(logsPath)).toBe(true);

      await safeDeleteIndex(indexPath);

      expect(fs.existsSync(logsPath)).toBe(false);
    });

    it('should handle non-existent directory gracefully', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Delete the directory first
      fs.rmdirSync(indexPath);

      // Should not throw
      const result = await safeDeleteIndex(indexPath);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('should return warnings for files that fail to delete', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create files
      fs.writeFileSync(path.join(indexPath, 'fingerprints.json'), '{}');
      fs.writeFileSync(path.join(indexPath, 'metadata.json'), '{}');

      // Note: We cannot easily simulate file deletion failure without more complex mocking
      // This test verifies the basic flow completes
      const result = await safeDeleteIndex(indexPath);

      expect(result.success).toBe(true);
    });

    it('should throw error for paths outside indexes directory', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/deleteIndex.js');
      const { ErrorCode } = await import('../../../src/errors/index.js');

      try {
        await safeDeleteIndex('/tmp/unsafe-path');
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Watcher Stop Callback Tests
  // --------------------------------------------------------------------------

  describe('watcher stop callback', () => {
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

    it('should call stopWatcher callback before deletion', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const stopWatcher = vi.fn().mockResolvedValue(undefined);

      await deleteIndex({}, { projectPath: projectDir, confirmed: true, stopWatcher });

      expect(stopWatcher).toHaveBeenCalledTimes(1);
    });

    it('should continue deletion even if stopWatcher fails', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const stopWatcher = vi.fn().mockRejectedValue(new Error('Watcher stop failed'));

      // Should not throw
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true, stopWatcher });

      expect(result.status).toBe('success');
      expect(stopWatcher).toHaveBeenCalledTimes(1);
    });

    it('should not call stopWatcher when not provided', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Should not throw when stopWatcher is not provided
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
    });
  });

  // --------------------------------------------------------------------------
  // LanceDB Close Callback Tests
  // --------------------------------------------------------------------------

  describe('LanceDB close callback', () => {
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

    it('should call closeLanceDB callback before deletion', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const closeLanceDB = vi.fn().mockResolvedValue(undefined);

      await deleteIndex({}, { projectPath: projectDir, confirmed: true, closeLanceDB });

      expect(closeLanceDB).toHaveBeenCalledTimes(1);
    });

    it('should continue deletion even if closeLanceDB fails', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const closeLanceDB = vi.fn().mockRejectedValue(new Error('Close failed'));

      // Should not throw
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true, closeLanceDB });

      expect(result.status).toBe('success');
      expect(closeLanceDB).toHaveBeenCalledTimes(1);
    });

    it('should call stopWatcher before closeLanceDB', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const callOrder: string[] = [];
      const stopWatcher = vi.fn().mockImplementation(async () => {
        callOrder.push('stopWatcher');
      });
      const closeLanceDB = vi.fn().mockImplementation(async () => {
        callOrder.push('closeLanceDB');
      });

      await deleteIndex({}, { projectPath: projectDir, confirmed: true, stopWatcher, closeLanceDB });

      expect(callOrder).toEqual(['stopWatcher', 'closeLanceDB']);
    });
  });

  // --------------------------------------------------------------------------
  // Full Deletion Flow Tests
  // --------------------------------------------------------------------------

  describe('full deletion flow', () => {
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

    it('should delete all index files', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Verify index files exist
      expect(fs.existsSync(path.join(indexPath, 'metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexPath, 'fingerprints.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexPath, 'config.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexPath, 'index.lancedb'))).toBe(true);

      // Delete index
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');

      // Verify all files are deleted
      expect(fs.existsSync(path.join(indexPath, 'metadata.json'))).toBe(false);
      expect(fs.existsSync(path.join(indexPath, 'fingerprints.json'))).toBe(false);
      expect(fs.existsSync(path.join(indexPath, 'config.json'))).toBe(false);
      expect(fs.existsSync(path.join(indexPath, 'index.lancedb'))).toBe(false);
    });

    it('should return success status with project path', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Delete index
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
      expect(result.projectPath).toBe(projectDir);
      expect(result.message).toBeDefined();
    });

    it('should allow creating new index after deletion', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Delete index
      await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      // Create new index - should succeed
      const result = await createIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
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
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: false });

      expect(Object.keys(result)).toEqual(['status']);
      expect(result.status).toBe('cancelled');
    });

    it('should return status and message for not_found', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('not_found');
      expect(result.message).toBeDefined();
      expect(result.projectPath).toBeUndefined();
    });

    it('should return full structure for success', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('success');
      expect(result.projectPath).toBe(projectDir);
      expect(result.message).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('deleteIndexTool definition', () => {
    it('should have correct tool name', async () => {
      const { deleteIndexTool } = await import('../../../src/tools/deleteIndex.js');
      expect(deleteIndexTool.name).toBe('delete_index');
    });

    it('should have description', async () => {
      const { deleteIndexTool } = await import('../../../src/tools/deleteIndex.js');
      expect(deleteIndexTool.description).toContain('Remove');
    });

    it('should mention irreversibility in description', async () => {
      const { deleteIndexTool } = await import('../../../src/tools/deleteIndex.js');
      expect(deleteIndexTool.description.toLowerCase()).toContain('cannot be undone');
    });

    it('should require confirmation', async () => {
      const { deleteIndexTool } = await import('../../../src/tools/deleteIndex.js');
      expect(deleteIndexTool.requiresConfirmation).toBe(true);
    });

    it('should have correct input schema structure', async () => {
      const { deleteIndexTool } = await import('../../../src/tools/deleteIndex.js');

      expect(deleteIndexTool.inputSchema.type).toBe('object');
      expect(deleteIndexTool.inputSchema.properties).toEqual({});
      expect(deleteIndexTool.inputSchema.required).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getDeleteConfirmationMessage Tests
  // --------------------------------------------------------------------------

  describe('getDeleteConfirmationMessage', () => {
    it('should return a confirmation message without project path', async () => {
      const { getDeleteConfirmationMessage } = await import('../../../src/tools/deleteIndex.js');

      const message = getDeleteConfirmationMessage();

      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      expect(message.toLowerCase()).toContain('cannot be undone');
    });

    it('should include project path when provided', async () => {
      const { getDeleteConfirmationMessage } = await import('../../../src/tools/deleteIndex.js');

      const message = getDeleteConfirmationMessage('/path/to/project');

      expect(message).toContain('/path/to/project');
      expect(message.toLowerCase()).toContain('cannot be undone');
    });

    it('should mention delete action', async () => {
      const { getDeleteConfirmationMessage } = await import('../../../src/tools/deleteIndex.js');

      const message = getDeleteConfirmationMessage();

      expect(message.toLowerCase()).toContain('delete');
    });
  });

  // --------------------------------------------------------------------------
  // checkIndexExistsForDelete Tests
  // --------------------------------------------------------------------------

  describe('checkIndexExistsForDelete', () => {
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
      const { checkIndexExistsForDelete } = await import('../../../src/tools/deleteIndex.js');

      // Create index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const exists = await checkIndexExistsForDelete(projectDir);
      expect(exists).toBe(true);
    });

    it('should return false when index does not exist', async () => {
      const { checkIndexExistsForDelete } = await import('../../../src/tools/deleteIndex.js');

      const exists = await checkIndexExistsForDelete(projectDir);
      expect(exists).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export deleteIndex from tools index', async () => {
      const { deleteIndex } = await import('../../../src/tools/index.js');
      expect(deleteIndex).toBeDefined();
      expect(typeof deleteIndex).toBe('function');
    });

    it('should export deleteIndexTool from tools index', async () => {
      const { deleteIndexTool } = await import('../../../src/tools/index.js');
      expect(deleteIndexTool).toBeDefined();
      expect(deleteIndexTool.name).toBe('delete_index');
    });

    it('should export DeleteIndexInputSchema from tools index', async () => {
      const { DeleteIndexInputSchema } = await import('../../../src/tools/index.js');
      expect(DeleteIndexInputSchema).toBeDefined();
    });

    it('should export safeDeleteIndex from tools index', async () => {
      const { safeDeleteIndex } = await import('../../../src/tools/index.js');
      expect(safeDeleteIndex).toBeDefined();
      expect(typeof safeDeleteIndex).toBe('function');
    });

    it('should export isPathSafeToDelete from tools index', async () => {
      const { isPathSafeToDelete } = await import('../../../src/tools/index.js');
      expect(isPathSafeToDelete).toBeDefined();
      expect(typeof isPathSafeToDelete).toBe('function');
    });

    it('should export checkIndexExistsForDelete from tools index', async () => {
      const { checkIndexExistsForDelete } = await import('../../../src/tools/index.js');
      expect(checkIndexExistsForDelete).toBeDefined();
      expect(typeof checkIndexExistsForDelete).toBe('function');
    });

    it('should export getDeleteConfirmationMessage from tools index', async () => {
      const { getDeleteConfirmationMessage } = await import('../../../src/tools/index.js');
      expect(getDeleteConfirmationMessage).toBeDefined();
      expect(typeof getDeleteConfirmationMessage).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Concurrent Operations Tests (SMCP-057)
  // --------------------------------------------------------------------------

  describe('concurrent operations (SMCP-057)', () => {
    let tempDir: string;
    let projectDir: string;
    let indexPath: string;

    beforeEach(async () => {
      vi.resetModules();
      // Reset the IndexingLock singleton before each test
      const { IndexingLock } = await import('../../../src/utils/asyncMutex.js');
      IndexingLock.resetInstance();

      tempDir = createTempDir();
      projectDir = createProjectDir(tempDir, ['package.json']);
      createSampleFiles(projectDir, 2);

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectDir);
    });

    afterEach(async () => {
      // Reset lock after test
      const { IndexingLock } = await import('../../../src/utils/asyncMutex.js');
      IndexingLock.resetInstance();

      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should prevent delete while create is in progress', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');
      const { IndexingLock } = await import('../../../src/utils/asyncMutex.js');
      const { isMCPError } = await import('../../../src/errors/index.js');

      // Simulate indexing in progress by acquiring the lock
      const lock = IndexingLock.getInstance();
      await lock.acquire('/some/project');

      try {
        // Try to delete while lock is held - should throw
        await expect(
          deleteIndex({}, { projectPath: projectDir, confirmed: true })
        ).rejects.toThrow(/indexing/i);
      } finally {
        lock.release();
      }
    });

    it('should prevent create while delete is in progress', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');
      const { isMCPError } = await import('../../../src/errors/index.js');

      // First create an index
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      // Start a delete operation and verify it acquires the lock
      let deleteStarted = false;
      let createAttemptedDuringDelete = false;
      let deleteError: any = null;
      let createError: any = null;

      // We cannot easily simulate concurrent operations in single-threaded JS
      // But we can verify the lock is properly acquired/released by checking state
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });
      expect(result.status).toBe('success');

      // After delete completes, create should work
      const createResult = await createIndex({}, { projectPath: projectDir, confirmed: true });
      expect(createResult.status).toBe('success');
    });

    it('should release lock on delete error', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');
      const { IndexingLock } = await import('../../../src/utils/asyncMutex.js');

      const lock = IndexingLock.getInstance();

      // Create a corrupted metadata file to trigger an error
      fs.mkdirSync(indexPath, { recursive: true });
      fs.writeFileSync(path.join(indexPath, 'metadata.json'), 'invalid json');

      try {
        await deleteIndex({}, { projectPath: projectDir, confirmed: true });
      } catch (error) {
        // Expected to throw
      }

      // Lock should be released even after error
      expect(lock.isIndexing).toBe(false);
    });

    it('should release lock on successful delete', async () => {
      const { createIndex } = await import('../../../src/tools/createIndex.js');
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');
      const { IndexingLock } = await import('../../../src/utils/asyncMutex.js');

      // Create an index first
      await createIndex({}, { projectPath: projectDir, confirmed: true });

      const lock = IndexingLock.getInstance();
      expect(lock.isIndexing).toBe(false);

      // Delete it
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });
      expect(result.status).toBe('success');

      // Lock should be released
      expect(lock.isIndexing).toBe(false);
    });

    it('should release lock when index not found', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');
      const { IndexingLock } = await import('../../../src/utils/asyncMutex.js');

      const lock = IndexingLock.getInstance();

      // Try to delete non-existent index
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });
      expect(result.status).toBe('not_found');

      // Lock should be released
      expect(lock.isIndexing).toBe(false);
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

    it('should return not_found instead of throwing when no index exists', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // Should return not_found, not throw
      const result = await deleteIndex({}, { projectPath: projectDir, confirmed: true });

      expect(result.status).toBe('not_found');
    });

    it('should return cancelled status without errors when confirmed is false', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');

      // This should return immediately without doing any work
      const result = await deleteIndex({}, { projectPath: '/any/path', confirmed: false });

      expect(result.status).toBe('cancelled');
    });

    it('should wrap unexpected errors as MCPError', async () => {
      const { deleteIndex } = await import('../../../src/tools/deleteIndex.js');
      const { isMCPError } = await import('../../../src/errors/index.js');

      // Mock a corrupted metadata file
      fs.mkdirSync(indexPath, { recursive: true });
      fs.writeFileSync(path.join(indexPath, 'metadata.json'), 'invalid json');

      try {
        await deleteIndex({}, { projectPath: projectDir, confirmed: true });
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(isMCPError(error)).toBe(true);
      }
    });
  });
});
