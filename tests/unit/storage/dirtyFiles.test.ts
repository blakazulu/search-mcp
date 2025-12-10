import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DIRTY_FILES_VERSION,
  DELETED_PREFIX,
  DirtyFilesManager,
} from '../../../src/storage/dirtyFiles.js';

// Mock the logger to avoid file system side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Dirty Files Manager', () => {
  let testDir: string;
  let indexPath: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = path.join(
      os.tmpdir(),
      `search-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    indexPath = path.join(testDir, 'test-index');
    await fs.promises.mkdir(indexPath, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // Version Constant Tests
  // ==========================================================================

  describe('DIRTY_FILES_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(DIRTY_FILES_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be 1.0.0 initially', () => {
      expect(DIRTY_FILES_VERSION).toBe('1.0.0');
    });
  });

  describe('DELETED_PREFIX', () => {
    it('should be __deleted__:', () => {
      expect(DELETED_PREFIX).toBe('__deleted__:');
    });
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('should create instance with index path', () => {
      const manager = new DirtyFilesManager(indexPath);
      expect(manager.getIndexPath()).toBe(indexPath);
    });

    it('should not be loaded initially', () => {
      const manager = new DirtyFilesManager(indexPath);
      expect(manager.isLoaded()).toBe(false);
    });

    it('should not have unsaved changes initially', () => {
      const manager = new DirtyFilesManager(indexPath);
      expect(manager.hasUnsavedChanges()).toBe(false);
    });

    it('should be empty initially', () => {
      const manager = new DirtyFilesManager(indexPath);
      // Note: count() doesn't require loading since it just checks set size
      expect(manager.count()).toBe(0);
    });
  });

  // ==========================================================================
  // Load Tests
  // ==========================================================================

  describe('load', () => {
    it('should load empty when no file exists', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      expect(manager.isLoaded()).toBe(true);
      expect(manager.count()).toBe(0);
    });

    it('should load dirty files from disk', async () => {
      const testData = {
        version: '1.0.0',
        dirtyFiles: ['src/file1.ts', 'src/file2.ts'],
        lastModified: new Date().toISOString(),
      };
      await fs.promises.writeFile(
        path.join(indexPath, 'dirty-files.json'),
        JSON.stringify(testData)
      );

      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      expect(manager.isLoaded()).toBe(true);
      expect(manager.count()).toBe(2);
      expect(manager.has('src/file1.ts')).toBe(true);
      expect(manager.has('src/file2.ts')).toBe(true);
    });

    it('should load dirty files with deletion markers', async () => {
      const testData = {
        version: '1.0.0',
        dirtyFiles: ['src/modified.ts', '__deleted__:src/removed.ts'],
        lastModified: new Date().toISOString(),
      };
      await fs.promises.writeFile(
        path.join(indexPath, 'dirty-files.json'),
        JSON.stringify(testData)
      );

      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      expect(manager.count()).toBe(2);
      expect(manager.has('src/modified.ts')).toBe(true);
      expect(manager.isDeleted('src/removed.ts')).toBe(true);
    });

    it('should start fresh on version mismatch', async () => {
      const testData = {
        version: '999.0.0',
        dirtyFiles: ['src/file.ts'],
        lastModified: new Date().toISOString(),
      };
      await fs.promises.writeFile(
        path.join(indexPath, 'dirty-files.json'),
        JSON.stringify(testData)
      );

      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      expect(manager.isLoaded()).toBe(true);
      expect(manager.count()).toBe(0);
    });

    it('should start fresh on invalid JSON', async () => {
      await fs.promises.writeFile(
        path.join(indexPath, 'dirty-files.json'),
        'not valid json {{{'
      );

      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      expect(manager.isLoaded()).toBe(true);
      expect(manager.count()).toBe(0);
    });

    it('should reset modified flag after load', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.add('src/test.ts');
      expect(manager.hasUnsavedChanges()).toBe(true);

      await manager.load();
      expect(manager.hasUnsavedChanges()).toBe(false);
    });
  });

  // ==========================================================================
  // Save Tests
  // ==========================================================================

  describe('save', () => {
    it('should skip save if not modified', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      await manager.save();

      const filePath = path.join(indexPath, 'dirty-files.json');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should save dirty files to disk', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.add('src/file1.ts');
      manager.add('src/file2.ts');
      await manager.save();

      const filePath = path.join(indexPath, 'dirty-files.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.version).toBe(DIRTY_FILES_VERSION);
      expect(saved.dirtyFiles).toContain('src/file1.ts');
      expect(saved.dirtyFiles).toContain('src/file2.ts');
      expect(saved.lastModified).toBeDefined();
    });

    it('should save deletion markers', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.markDeleted('src/removed.ts');
      await manager.save();

      const filePath = path.join(indexPath, 'dirty-files.json');
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.dirtyFiles).toContain('__deleted__:src/removed.ts');
    });

    it('should reset modified flag after save', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.add('src/test.ts');
      expect(manager.hasUnsavedChanges()).toBe(true);

      await manager.save();
      expect(manager.hasUnsavedChanges()).toBe(false);
    });

    it('should use atomic write (no temp files left behind)', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.add('src/file.ts');
      await manager.save();

      const files = await fs.promises.readdir(indexPath);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should pretty-print the JSON', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.add('src/file.ts');
      await manager.save();

      const filePath = path.join(indexPath, 'dirty-files.json');
      const content = await fs.promises.readFile(filePath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  '); // Indentation
    });
  });

  // ==========================================================================
  // Add Tests
  // ==========================================================================

  describe('add', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    it('should add a file to dirty set', () => {
      manager.add('src/new.ts');
      expect(manager.has('src/new.ts')).toBe(true);
      expect(manager.count()).toBe(1);
    });

    it('should not duplicate files', () => {
      manager.add('src/file.ts');
      manager.add('src/file.ts');
      expect(manager.count()).toBe(1);
    });

    it('should mark as modified', () => {
      expect(manager.hasUnsavedChanges()).toBe(false);
      manager.add('src/file.ts');
      expect(manager.hasUnsavedChanges()).toBe(true);
    });

    it('should not mark as modified if file already exists', async () => {
      manager.add('src/file.ts');
      await manager.save();
      expect(manager.hasUnsavedChanges()).toBe(false);

      manager.add('src/file.ts');
      expect(manager.hasUnsavedChanges()).toBe(false);
    });

    it('should remove deletion marker when adding', () => {
      manager.markDeleted('src/file.ts');
      expect(manager.isDeleted('src/file.ts')).toBe(true);

      manager.add('src/file.ts');
      expect(manager.isDeleted('src/file.ts')).toBe(false);
      expect(manager.has('src/file.ts')).toBe(true);
    });
  });

  // ==========================================================================
  // Remove Tests
  // ==========================================================================

  describe('remove', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    it('should remove a file from dirty set', () => {
      manager.add('src/file.ts');
      expect(manager.has('src/file.ts')).toBe(true);

      manager.remove('src/file.ts');
      expect(manager.has('src/file.ts')).toBe(false);
    });

    it('should also remove deletion marker', () => {
      manager.markDeleted('src/file.ts');
      expect(manager.isDeleted('src/file.ts')).toBe(true);

      manager.remove('src/file.ts');
      expect(manager.isDeleted('src/file.ts')).toBe(false);
    });

    it('should mark as modified only if file existed', async () => {
      manager.remove('non/existent.ts');
      expect(manager.hasUnsavedChanges()).toBe(false);

      manager.add('src/file.ts');
      await manager.save();

      manager.remove('src/file.ts');
      expect(manager.hasUnsavedChanges()).toBe(true);
    });

    it('should handle removing non-existent file gracefully', () => {
      expect(() => manager.remove('non/existent.ts')).not.toThrow();
    });
  });

  // ==========================================================================
  // markDeleted Tests
  // ==========================================================================

  describe('markDeleted', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    it('should mark a file as deleted', () => {
      manager.markDeleted('src/removed.ts');
      expect(manager.isDeleted('src/removed.ts')).toBe(true);
    });

    it('should remove from dirty set when marking deleted', () => {
      manager.add('src/file.ts');
      expect(manager.has('src/file.ts')).toBe(true);

      manager.markDeleted('src/file.ts');
      expect(manager.has('src/file.ts')).toBe(false);
      expect(manager.isDeleted('src/file.ts')).toBe(true);
    });

    it('should not duplicate deletion markers', () => {
      manager.markDeleted('src/file.ts');
      manager.markDeleted('src/file.ts');
      expect(manager.deletedCount()).toBe(1);
    });

    it('should mark as modified', () => {
      expect(manager.hasUnsavedChanges()).toBe(false);
      manager.markDeleted('src/file.ts');
      expect(manager.hasUnsavedChanges()).toBe(true);
    });
  });

  // ==========================================================================
  // getAll Tests
  // ==========================================================================

  describe('getAll', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    it('should return empty array when no dirty files', () => {
      expect(manager.getAll()).toEqual([]);
    });

    it('should return all dirty files', () => {
      manager.add('src/file1.ts');
      manager.add('src/file2.ts');

      const all = manager.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain('src/file1.ts');
      expect(all).toContain('src/file2.ts');
    });

    it('should exclude deletion markers', () => {
      manager.add('src/modified.ts');
      manager.markDeleted('src/removed.ts');

      const all = manager.getAll();
      expect(all).toHaveLength(1);
      expect(all).toContain('src/modified.ts');
      expect(all).not.toContain('src/removed.ts');
    });
  });

  // ==========================================================================
  // getDeleted Tests
  // ==========================================================================

  describe('getDeleted', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    it('should return empty array when no deleted files', () => {
      expect(manager.getDeleted()).toEqual([]);
    });

    it('should return all deleted files without prefix', () => {
      manager.markDeleted('src/file1.ts');
      manager.markDeleted('src/file2.ts');

      const deleted = manager.getDeleted();
      expect(deleted).toHaveLength(2);
      expect(deleted).toContain('src/file1.ts');
      expect(deleted).toContain('src/file2.ts');
    });

    it('should exclude dirty files', () => {
      manager.add('src/modified.ts');
      manager.markDeleted('src/removed.ts');

      const deleted = manager.getDeleted();
      expect(deleted).toHaveLength(1);
      expect(deleted).toContain('src/removed.ts');
      expect(deleted).not.toContain('src/modified.ts');
    });
  });

  // ==========================================================================
  // Clear Tests
  // ==========================================================================

  describe('clear', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    it('should remove all entries', () => {
      manager.add('src/file1.ts');
      manager.add('src/file2.ts');
      manager.markDeleted('src/removed.ts');
      expect(manager.count()).toBe(3);

      manager.clear();
      expect(manager.count()).toBe(0);
      expect(manager.isEmpty()).toBe(true);
    });

    it('should mark as modified if there were entries', async () => {
      manager.add('src/file.ts');
      await manager.save();
      expect(manager.hasUnsavedChanges()).toBe(false);

      manager.clear();
      expect(manager.hasUnsavedChanges()).toBe(true);
    });

    it('should not mark as modified if already empty', () => {
      expect(manager.hasUnsavedChanges()).toBe(false);
      manager.clear();
      expect(manager.hasUnsavedChanges()).toBe(false);
    });
  });

  // ==========================================================================
  // Count Methods Tests
  // ==========================================================================

  describe('count methods', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    describe('count', () => {
      it('should return total count including deletions', () => {
        manager.add('src/file1.ts');
        manager.add('src/file2.ts');
        manager.markDeleted('src/removed.ts');

        expect(manager.count()).toBe(3);
      });
    });

    describe('dirtyCount', () => {
      it('should return count of dirty files only', () => {
        manager.add('src/file1.ts');
        manager.add('src/file2.ts');
        manager.markDeleted('src/removed.ts');

        expect(manager.dirtyCount()).toBe(2);
      });
    });

    describe('deletedCount', () => {
      it('should return count of deleted files only', () => {
        manager.add('src/file1.ts');
        manager.add('src/file2.ts');
        manager.markDeleted('src/removed.ts');

        expect(manager.deletedCount()).toBe(1);
      });
    });
  });

  // ==========================================================================
  // Delete Method Tests
  // ==========================================================================

  describe('delete', () => {
    it('should delete the dirty files file from disk', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.add('src/file.ts');
      await manager.save();

      const filePath = path.join(indexPath, 'dirty-files.json');
      expect(fs.existsSync(filePath)).toBe(true);

      await manager.delete();
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should reset manager state', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();
      manager.add('src/file.ts');
      await manager.save();

      await manager.delete();
      expect(manager.isLoaded()).toBe(false);
      expect(manager.count()).toBe(0);
      expect(manager.hasUnsavedChanges()).toBe(false);
    });

    it('should not throw if file does not exist', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await expect(manager.delete()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Accessors Tests
  // ==========================================================================

  describe('accessors', () => {
    let manager: DirtyFilesManager;

    beforeEach(async () => {
      manager = new DirtyFilesManager(indexPath);
      await manager.load();
    });

    describe('getDirtyFilesPath', () => {
      it('should return correct path', () => {
        const expectedPath = path.join(indexPath, 'dirty-files.json');
        expect(manager.getDirtyFilesPath()).toBe(expectedPath);
      });
    });

    describe('getIndexPath', () => {
      it('should return index path', () => {
        expect(manager.getIndexPath()).toBe(indexPath);
      });
    });

    describe('isEmpty', () => {
      it('should return true when empty', () => {
        expect(manager.isEmpty()).toBe(true);
      });

      it('should return false when not empty', () => {
        manager.add('src/file.ts');
        expect(manager.isEmpty()).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration', () => {
    it('should support full workflow: load, modify, save, reload', async () => {
      // First session
      const manager1 = new DirtyFilesManager(indexPath);
      await manager1.load();
      manager1.add('src/file1.ts');
      manager1.add('src/file2.ts');
      manager1.markDeleted('src/removed.ts');
      await manager1.save();

      // Second session (new manager instance)
      const manager2 = new DirtyFilesManager(indexPath);
      await manager2.load();

      expect(manager2.count()).toBe(3);
      expect(manager2.has('src/file1.ts')).toBe(true);
      expect(manager2.has('src/file2.ts')).toBe(true);
      expect(manager2.isDeleted('src/removed.ts')).toBe(true);
    });

    it('should survive server restart with pending files', async () => {
      // Simulate first session - accumulate dirty files
      const session1 = new DirtyFilesManager(indexPath);
      await session1.load();
      session1.add('src/modified1.ts');
      session1.add('src/modified2.ts');
      session1.markDeleted('src/deleted1.ts');
      await session1.save();

      // Simulate server restart - new manager instance
      const session2 = new DirtyFilesManager(indexPath);
      await session2.load();

      // Verify files persist across restart
      expect(session2.dirtyCount()).toBe(2);
      expect(session2.deletedCount()).toBe(1);
      expect(session2.getAll()).toEqual(expect.arrayContaining([
        'src/modified1.ts',
        'src/modified2.ts',
      ]));
      expect(session2.getDeleted()).toEqual(['src/deleted1.ts']);
    });

    it('should handle typical lazy indexing workflow', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      // Accumulate changes
      manager.add('src/created.ts');
      manager.add('src/modified.ts');
      manager.markDeleted('src/removed.ts');

      // Check pending state
      expect(manager.isEmpty()).toBe(false);
      expect(manager.dirtyCount()).toBe(2);
      expect(manager.deletedCount()).toBe(1);

      // Save state (in case of crash)
      await manager.save();

      // Process files (simulate indexing)
      const toProcess = manager.getAll();
      const toDelete = manager.getDeleted();

      expect(toProcess).toHaveLength(2);
      expect(toDelete).toHaveLength(1);

      // Clear after processing
      manager.clear();
      await manager.save();

      // Verify clean state
      expect(manager.isEmpty()).toBe(true);
      expect(manager.dirtyCount()).toBe(0);
      expect(manager.deletedCount()).toBe(0);
    });

    it('should handle files being re-created after deletion', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      // File is deleted
      manager.markDeleted('src/file.ts');
      expect(manager.isDeleted('src/file.ts')).toBe(true);
      expect(manager.has('src/file.ts')).toBe(false);

      // File is re-created before flush
      manager.add('src/file.ts');
      expect(manager.isDeleted('src/file.ts')).toBe(false);
      expect(manager.has('src/file.ts')).toBe(true);
    });

    it('should handle file modification followed by deletion', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      // File is modified
      manager.add('src/file.ts');
      expect(manager.has('src/file.ts')).toBe(true);

      // File is deleted
      manager.markDeleted('src/file.ts');
      expect(manager.has('src/file.ts')).toBe(false);
      expect(manager.isDeleted('src/file.ts')).toBe(true);
    });

    it('should handle paths with special characters', async () => {
      const manager = new DirtyFilesManager(indexPath);
      await manager.load();

      manager.add('src/file with spaces.ts');
      manager.add('src/file-with-dashes.ts');
      manager.add('src/file_with_underscores.ts');
      manager.markDeleted('src/another file.ts');

      await manager.save();

      const manager2 = new DirtyFilesManager(indexPath);
      await manager2.load();

      expect(manager2.has('src/file with spaces.ts')).toBe(true);
      expect(manager2.has('src/file-with-dashes.ts')).toBe(true);
      expect(manager2.has('src/file_with_underscores.ts')).toBe(true);
      expect(manager2.isDeleted('src/another file.ts')).toBe(true);
    });
  });
});
