import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  FINGERPRINTS_VERSION,
  loadFingerprints,
  saveFingerprints,
  calculateDelta,
  FingerprintsManager,
  type Fingerprints,
  type DeltaResult,
} from '../../../src/storage/fingerprints.js';
import { ErrorCode } from '../../../src/errors/index.js';
import { hashFile } from '../../../src/utils/hash.js';

// Mock the logger to avoid file system side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Fingerprints Manager', () => {
  let testDir: string;
  let indexPath: string;
  let projectPath: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = path.join(
      os.tmpdir(),
      `search-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    indexPath = path.join(testDir, 'test-index');
    projectPath = path.join(testDir, 'test-project');
    await fs.promises.mkdir(indexPath, { recursive: true });
    await fs.promises.mkdir(projectPath, { recursive: true });
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

  describe('FINGERPRINTS_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(FINGERPRINTS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be 1.0.0 initially', () => {
      expect(FINGERPRINTS_VERSION).toBe('1.0.0');
    });
  });

  // ==========================================================================
  // loadFingerprints Tests
  // ==========================================================================

  describe('loadFingerprints', () => {
    it('should return empty Map when no fingerprints file exists', async () => {
      const fingerprints = await loadFingerprints(indexPath);
      expect(fingerprints).toBeInstanceOf(Map);
      expect(fingerprints.size).toBe(0);
    });

    it('should load valid fingerprints from file', async () => {
      const testData = {
        version: '1.0.0',
        fingerprints: {
          'src/index.ts': 'abc123def456',
          'src/utils/hash.ts': '789xyz012',
        },
      };

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(testData));

      const fingerprints = await loadFingerprints(indexPath);
      expect(fingerprints.size).toBe(2);
      expect(fingerprints.get('src/index.ts')).toBe('abc123def456');
      expect(fingerprints.get('src/utils/hash.ts')).toBe('789xyz012');
    });

    it('should throw MCPError for invalid JSON', async () => {
      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, 'not valid json {{{');

      await expect(loadFingerprints(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should throw MCPError for invalid fingerprints structure', async () => {
      const invalidData = {
        version: '1.0.0',
        // Missing fingerprints field
      };

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(invalidData));

      await expect(loadFingerprints(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should throw MCPError when fingerprints is not an object', async () => {
      const invalidData = {
        version: '1.0.0',
        fingerprints: 'not an object',
      };

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(invalidData));

      await expect(loadFingerprints(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should load fingerprints with many entries', async () => {
      const fingerprints: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        fingerprints[`src/file${i}.ts`] = `hash${i}`;
      }

      const testData = {
        version: '1.0.0',
        fingerprints,
      };

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(testData));

      const loaded = await loadFingerprints(indexPath);
      expect(loaded.size).toBe(1000);
      expect(loaded.get('src/file500.ts')).toBe('hash500');
    });
  });

  // ==========================================================================
  // saveFingerprints Tests
  // ==========================================================================

  describe('saveFingerprints', () => {
    it('should save fingerprints to file', async () => {
      const fingerprints = new Map([
        ['src/index.ts', 'abc123'],
        ['src/utils.ts', 'def456'],
      ]);

      await saveFingerprints(indexPath, fingerprints);

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      const content = await fs.promises.readFile(fingerprintsPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.version).toBe(FINGERPRINTS_VERSION);
      expect(saved.fingerprints['src/index.ts']).toBe('abc123');
      expect(saved.fingerprints['src/utils.ts']).toBe('def456');
    });

    it('should pretty-print the JSON', async () => {
      const fingerprints = new Map([['src/index.ts', 'abc123']]);
      await saveFingerprints(indexPath, fingerprints);

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      const content = await fs.promises.readFile(fingerprintsPath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  '); // Indentation
    });

    it('should use atomic write (no temp files left behind)', async () => {
      const fingerprints = new Map([['src/index.ts', 'abc123']]);
      await saveFingerprints(indexPath, fingerprints);

      const files = await fs.promises.readdir(indexPath);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should overwrite existing fingerprints', async () => {
      const initial = new Map([['src/old.ts', 'old123']]);
      await saveFingerprints(indexPath, initial);

      const updated = new Map([['src/new.ts', 'new456']]);
      await saveFingerprints(indexPath, updated);

      const loaded = await loadFingerprints(indexPath);
      expect(loaded.size).toBe(1);
      expect(loaded.has('src/old.ts')).toBe(false);
      expect(loaded.get('src/new.ts')).toBe('new456');
    });

    it('should handle empty fingerprints', async () => {
      const fingerprints = new Map<string, string>();
      await saveFingerprints(indexPath, fingerprints);

      const loaded = await loadFingerprints(indexPath);
      expect(loaded.size).toBe(0);
    });

    it('should handle fingerprints with special characters in paths', async () => {
      const fingerprints = new Map([
        ['src/file with spaces.ts', 'abc123'],
        ['src/file-with-dashes.ts', 'def456'],
        ['src/file_with_underscores.ts', 'ghi789'],
      ]);

      await saveFingerprints(indexPath, fingerprints);
      const loaded = await loadFingerprints(indexPath);

      expect(loaded.get('src/file with spaces.ts')).toBe('abc123');
      expect(loaded.get('src/file-with-dashes.ts')).toBe('def456');
      expect(loaded.get('src/file_with_underscores.ts')).toBe('ghi789');
    });
  });

  // ==========================================================================
  // calculateDelta Tests
  // ==========================================================================

  describe('calculateDelta', () => {
    beforeEach(async () => {
      // Create test files
      await fs.promises.mkdir(path.join(projectPath, 'src'), { recursive: true });
    });

    it('should detect added files', async () => {
      const stored = new Map<string, string>();
      const currentFiles = ['src/new-file.ts'];

      // Create the file
      await fs.promises.writeFile(
        path.join(projectPath, 'src', 'new-file.ts'),
        'content'
      );

      const delta = await calculateDelta(stored, currentFiles, projectPath);

      expect(delta.added).toContain('src/new-file.ts');
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should detect modified files', async () => {
      // Create file with known content
      const filePath = path.join(projectPath, 'src', 'modified.ts');
      await fs.promises.writeFile(filePath, 'old content');
      const oldHash = await hashFile(filePath);

      // Store old hash
      const stored = new Map([['src/modified.ts', oldHash]]);

      // Modify the file
      await fs.promises.writeFile(filePath, 'new content');

      const delta = await calculateDelta(stored, ['src/modified.ts'], projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toContain('src/modified.ts');
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should detect removed files', async () => {
      const stored = new Map([
        ['src/removed.ts', 'oldhash123'],
      ]);
      const currentFiles: string[] = [];

      const delta = await calculateDelta(stored, currentFiles, projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toContain('src/removed.ts');
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should detect unchanged files', async () => {
      // Create file
      const filePath = path.join(projectPath, 'src', 'unchanged.ts');
      await fs.promises.writeFile(filePath, 'same content');
      const hash = await hashFile(filePath);

      // Store same hash
      const stored = new Map([['src/unchanged.ts', hash]]);

      const delta = await calculateDelta(stored, ['src/unchanged.ts'], projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toContain('src/unchanged.ts');
    });

    it('should handle mixed changes', async () => {
      // Create files
      const unchangedPath = path.join(projectPath, 'src', 'unchanged.ts');
      const modifiedPath = path.join(projectPath, 'src', 'modified.ts');
      const addedPath = path.join(projectPath, 'src', 'added.ts');

      await fs.promises.writeFile(unchangedPath, 'same');
      await fs.promises.writeFile(modifiedPath, 'old');
      await fs.promises.writeFile(addedPath, 'new');

      const unchangedHash = await hashFile(unchangedPath);
      const modifiedOldHash = 'old-hash-that-wont-match';

      const stored = new Map([
        ['src/unchanged.ts', unchangedHash],
        ['src/modified.ts', modifiedOldHash],
        ['src/removed.ts', 'removed-hash'],
      ]);

      const currentFiles = [
        'src/unchanged.ts',
        'src/modified.ts',
        'src/added.ts',
      ];

      const delta = await calculateDelta(stored, currentFiles, projectPath);

      expect(delta.added).toContain('src/added.ts');
      expect(delta.modified).toContain('src/modified.ts');
      expect(delta.removed).toContain('src/removed.ts');
      expect(delta.unchanged).toContain('src/unchanged.ts');
    });

    it('should handle empty stored fingerprints', async () => {
      const filePath = path.join(projectPath, 'src', 'file.ts');
      await fs.promises.writeFile(filePath, 'content');

      const stored = new Map<string, string>();
      const currentFiles = ['src/file.ts'];

      const delta = await calculateDelta(stored, currentFiles, projectPath);

      expect(delta.added).toContain('src/file.ts');
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should handle empty current files', async () => {
      const stored = new Map([
        ['src/file1.ts', 'hash1'],
        ['src/file2.ts', 'hash2'],
      ]);
      const currentFiles: string[] = [];

      const delta = await calculateDelta(stored, currentFiles, projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(2);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should treat file read errors as added', async () => {
      // Store a file that doesn't exist on disk
      const stored = new Map([['src/missing.ts', 'old-hash']]);
      const currentFiles = ['src/missing.ts'];

      // Don't create the file - it's "missing" from disk

      const delta = await calculateDelta(stored, currentFiles, projectPath);

      // File should be treated as added since it can't be read
      expect(delta.added).toContain('src/missing.ts');
    });
  });

  // ==========================================================================
  // FingerprintsManager Class Tests
  // ==========================================================================

  describe('FingerprintsManager', () => {
    describe('constructor', () => {
      it('should create instance with index and project paths', () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        expect(manager.getIndexPath()).toBe(indexPath);
        expect(manager.getProjectPath()).toBe(projectPath);
      });

      it('should not be loaded initially', () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        expect(manager.isLoaded()).toBe(false);
      });

      it('should not have unsaved changes initially', () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        expect(manager.hasUnsavedChanges()).toBe(false);
      });
    });

    describe('load', () => {
      it('should load empty fingerprints when no file exists', async () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();
        expect(manager.isLoaded()).toBe(true);
        expect(manager.count()).toBe(0);
      });

      it('should load fingerprints from disk', async () => {
        const testData = {
          version: '1.0.0',
          fingerprints: {
            'src/index.ts': 'abc123',
          },
        };
        await fs.promises.writeFile(
          path.join(indexPath, 'fingerprints.json'),
          JSON.stringify(testData)
        );

        const manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();

        expect(manager.isLoaded()).toBe(true);
        expect(manager.count()).toBe(1);
        expect(manager.get('src/index.ts')).toBe('abc123');
      });

      it('should update lastLoadedAt', async () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        expect(manager.getLastLoadedAt()).toBe(0);

        const before = Date.now();
        await manager.load();
        const after = Date.now();

        expect(manager.getLastLoadedAt()).toBeGreaterThanOrEqual(before);
        expect(manager.getLastLoadedAt()).toBeLessThanOrEqual(after);
      });

      it('should reset dirty flag after load', async () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();
        manager.set('src/test.ts', 'hash123');
        expect(manager.hasUnsavedChanges()).toBe(true);

        await manager.load();
        expect(manager.hasUnsavedChanges()).toBe(false);
      });
    });

    describe('save', () => {
      it('should throw if fingerprints not loaded', async () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        await expect(manager.save()).rejects.toThrow('No fingerprints to save');
      });

      it('should save fingerprints to disk', async () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();
        manager.set('src/index.ts', 'abc123');
        await manager.save();

        const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
        expect(fs.existsSync(fingerprintsPath)).toBe(true);

        const content = await fs.promises.readFile(fingerprintsPath, 'utf-8');
        const saved = JSON.parse(content);
        expect(saved.fingerprints['src/index.ts']).toBe('abc123');
      });

      it('should reset dirty flag after save', async () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();
        manager.set('src/test.ts', 'hash123');
        expect(manager.hasUnsavedChanges()).toBe(true);

        await manager.save();
        expect(manager.hasUnsavedChanges()).toBe(false);
      });
    });

    describe('single file operations', () => {
      let manager: FingerprintsManager;

      beforeEach(async () => {
        manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();
      });

      describe('get', () => {
        it('should return undefined for non-existent file', () => {
          expect(manager.get('non/existent.ts')).toBeUndefined();
        });

        it('should return hash for existing file', () => {
          manager.set('src/file.ts', 'hash123');
          expect(manager.get('src/file.ts')).toBe('hash123');
        });

        it('should throw if not loaded', async () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.get('src/file.ts')).toThrow('not loaded');
        });
      });

      describe('set', () => {
        it('should add new fingerprint', () => {
          manager.set('src/new.ts', 'newhash');
          expect(manager.get('src/new.ts')).toBe('newhash');
        });

        it('should update existing fingerprint', () => {
          manager.set('src/file.ts', 'old');
          manager.set('src/file.ts', 'new');
          expect(manager.get('src/file.ts')).toBe('new');
        });

        it('should mark as dirty', () => {
          expect(manager.hasUnsavedChanges()).toBe(false);
          manager.set('src/file.ts', 'hash');
          expect(manager.hasUnsavedChanges()).toBe(true);
        });

        it('should throw if not loaded', async () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.set('src/file.ts', 'hash')).toThrow('not loaded');
        });
      });

      describe('delete', () => {
        it('should return false for non-existent file', () => {
          expect(manager.delete('non/existent.ts')).toBe(false);
        });

        it('should delete existing file and return true', () => {
          manager.set('src/file.ts', 'hash');
          expect(manager.delete('src/file.ts')).toBe(true);
          expect(manager.has('src/file.ts')).toBe(false);
        });

        it('should mark as dirty only if file existed', async () => {
          manager.delete('non/existent.ts');
          expect(manager.hasUnsavedChanges()).toBe(false);

          manager.set('src/file.ts', 'hash');
          manager.hasUnsavedChanges(); // Reset expectation
          await manager.save(); // Reset dirty flag

          manager.delete('src/file.ts');
          expect(manager.hasUnsavedChanges()).toBe(true);
        });

        it('should throw if not loaded', async () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.delete('src/file.ts')).toThrow('not loaded');
        });
      });

      describe('has', () => {
        it('should return false for non-existent file', () => {
          expect(manager.has('non/existent.ts')).toBe(false);
        });

        it('should return true for existing file', () => {
          manager.set('src/file.ts', 'hash');
          expect(manager.has('src/file.ts')).toBe(true);
        });

        it('should throw if not loaded', async () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.has('src/file.ts')).toThrow('not loaded');
        });
      });
    });

    describe('batch operations', () => {
      let manager: FingerprintsManager;

      beforeEach(async () => {
        manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();

        // Create test files
        await fs.promises.mkdir(path.join(projectPath, 'src'), { recursive: true });
      });

      describe('calculateDelta', () => {
        it('should delegate to calculateDelta function', async () => {
          const filePath = path.join(projectPath, 'src', 'file.ts');
          await fs.promises.writeFile(filePath, 'content');

          const delta = await manager.calculateDelta(['src/file.ts']);

          expect(delta.added).toContain('src/file.ts');
        });

        it('should throw if not loaded', async () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          await expect(unloaded.calculateDelta(['src/file.ts'])).rejects.toThrow('not loaded');
        });
      });

      describe('updateFromDelta', () => {
        it('should remove deleted files', async () => {
          manager.set('src/removed.ts', 'hash');

          const delta: DeltaResult = {
            added: [],
            modified: [],
            removed: ['src/removed.ts'],
            unchanged: [],
          };

          manager.updateFromDelta(delta, new Map());
          expect(manager.has('src/removed.ts')).toBe(false);
        });

        it('should add new files', () => {
          const delta: DeltaResult = {
            added: ['src/new.ts'],
            modified: [],
            removed: [],
            unchanged: [],
          };

          const newHashes = new Map([['src/new.ts', 'newhash']]);
          manager.updateFromDelta(delta, newHashes);

          expect(manager.get('src/new.ts')).toBe('newhash');
        });

        it('should update modified files', () => {
          manager.set('src/modified.ts', 'oldhash');

          const delta: DeltaResult = {
            added: [],
            modified: ['src/modified.ts'],
            removed: [],
            unchanged: [],
          };

          const newHashes = new Map([['src/modified.ts', 'newhash']]);
          manager.updateFromDelta(delta, newHashes);

          expect(manager.get('src/modified.ts')).toBe('newhash');
        });

        it('should mark as dirty', () => {
          const delta: DeltaResult = {
            added: ['src/new.ts'],
            modified: [],
            removed: [],
            unchanged: [],
          };

          const newHashes = new Map([['src/new.ts', 'hash']]);
          manager.updateFromDelta(delta, newHashes);

          expect(manager.hasUnsavedChanges()).toBe(true);
        });
      });

      describe('clear', () => {
        it('should remove all fingerprints', () => {
          manager.set('src/file1.ts', 'hash1');
          manager.set('src/file2.ts', 'hash2');
          expect(manager.count()).toBe(2);

          manager.clear();
          expect(manager.count()).toBe(0);
        });

        it('should mark as dirty', async () => {
          await manager.save(); // Reset dirty flag
          manager.clear();
          expect(manager.hasUnsavedChanges()).toBe(true);
        });
      });

      describe('setAll', () => {
        it('should replace all fingerprints', () => {
          manager.set('src/old.ts', 'oldhash');

          const newFingerprints = new Map([
            ['src/new1.ts', 'hash1'],
            ['src/new2.ts', 'hash2'],
          ]);

          manager.setAll(newFingerprints);

          expect(manager.count()).toBe(2);
          expect(manager.has('src/old.ts')).toBe(false);
          expect(manager.get('src/new1.ts')).toBe('hash1');
          expect(manager.get('src/new2.ts')).toBe('hash2');
        });

        it('should mark as dirty', () => {
          manager.setAll(new Map());
          expect(manager.hasUnsavedChanges()).toBe(true);
        });

        it('should work even if not loaded (initializes fingerprints)', () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          const fingerprints = new Map([['src/file.ts', 'hash']]);

          unloaded.setAll(fingerprints);
          expect(unloaded.count()).toBe(1);
        });
      });
    });

    describe('accessors', () => {
      let manager: FingerprintsManager;

      beforeEach(async () => {
        manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();
      });

      describe('getAll', () => {
        it('should return copy of fingerprints', () => {
          manager.set('src/file.ts', 'hash');

          const all = manager.getAll();
          expect(all.get('src/file.ts')).toBe('hash');

          // Modifying returned map shouldn't affect manager
          all.set('src/other.ts', 'other');
          expect(manager.has('src/other.ts')).toBe(false);
        });

        it('should throw if not loaded', () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.getAll()).toThrow('not loaded');
        });
      });

      describe('count', () => {
        it('should return number of fingerprints', () => {
          expect(manager.count()).toBe(0);

          manager.set('src/file1.ts', 'hash1');
          expect(manager.count()).toBe(1);

          manager.set('src/file2.ts', 'hash2');
          expect(manager.count()).toBe(2);
        });

        it('should throw if not loaded', () => {
          const unloaded = new FingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.count()).toThrow('not loaded');
        });
      });

      describe('getFingerprintsPath', () => {
        it('should return correct path', () => {
          const expectedPath = path.join(indexPath, 'fingerprints.json');
          expect(manager.getFingerprintsPath()).toBe(expectedPath);
        });
      });
    });

    describe('integration', () => {
      it('should support full workflow: load, modify, save, reload', async () => {
        // Initial state
        const manager1 = new FingerprintsManager(indexPath, projectPath);
        await manager1.load();
        manager1.set('src/file1.ts', 'hash1');
        manager1.set('src/file2.ts', 'hash2');
        await manager1.save();

        // Reload in new manager
        const manager2 = new FingerprintsManager(indexPath, projectPath);
        await manager2.load();

        expect(manager2.count()).toBe(2);
        expect(manager2.get('src/file1.ts')).toBe('hash1');
        expect(manager2.get('src/file2.ts')).toBe('hash2');
      });

      it('should support incremental update workflow', async () => {
        await fs.promises.mkdir(path.join(projectPath, 'src'), { recursive: true });

        // Create initial files
        await fs.promises.writeFile(
          path.join(projectPath, 'src', 'unchanged.ts'),
          'unchanged'
        );
        await fs.promises.writeFile(
          path.join(projectPath, 'src', 'modified.ts'),
          'old content'
        );

        // Initial indexing
        const manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();

        const unchangedHash = await hashFile(
          path.join(projectPath, 'src', 'unchanged.ts')
        );
        const modifiedOldHash = await hashFile(
          path.join(projectPath, 'src', 'modified.ts')
        );

        manager.set('src/unchanged.ts', unchangedHash);
        manager.set('src/modified.ts', modifiedOldHash);
        manager.set('src/removed.ts', 'old-removed-hash');
        await manager.save();

        // Simulate file changes
        await fs.promises.writeFile(
          path.join(projectPath, 'src', 'modified.ts'),
          'new content'
        );
        await fs.promises.writeFile(
          path.join(projectPath, 'src', 'added.ts'),
          'added'
        );
        // removed.ts is "deleted" by not including it in currentFiles

        // Reload and calculate delta
        await manager.load();
        const delta = await manager.calculateDelta([
          'src/unchanged.ts',
          'src/modified.ts',
          'src/added.ts',
        ]);

        expect(delta.unchanged).toContain('src/unchanged.ts');
        expect(delta.modified).toContain('src/modified.ts');
        expect(delta.added).toContain('src/added.ts');
        expect(delta.removed).toContain('src/removed.ts');

        // Update fingerprints
        const modifiedNewHash = await hashFile(
          path.join(projectPath, 'src', 'modified.ts')
        );
        const addedHash = await hashFile(
          path.join(projectPath, 'src', 'added.ts')
        );

        const newHashes = new Map([
          ['src/modified.ts', modifiedNewHash],
          ['src/added.ts', addedHash],
        ]);

        manager.updateFromDelta(delta, newHashes);
        await manager.save();

        // Verify final state
        await manager.load();
        expect(manager.count()).toBe(3);
        expect(manager.get('src/unchanged.ts')).toBe(unchangedHash);
        expect(manager.get('src/modified.ts')).toBe(modifiedNewHash);
        expect(manager.get('src/added.ts')).toBe(addedHash);
        expect(manager.has('src/removed.ts')).toBe(false);
      });

      it('should handle large file sets efficiently', async () => {
        const manager = new FingerprintsManager(indexPath, projectPath);
        await manager.load();

        // Add many fingerprints
        const count = 10000;
        for (let i = 0; i < count; i++) {
          manager.set(`src/file${i}.ts`, `hash${i}`);
        }

        // Save and verify performance is acceptable
        const startSave = Date.now();
        await manager.save();
        const saveTime = Date.now() - startSave;

        // Load and verify
        const startLoad = Date.now();
        await manager.load();
        const loadTime = Date.now() - startLoad;

        expect(manager.count()).toBe(count);
        expect(manager.get(`src/file${count - 1}.ts`)).toBe(`hash${count - 1}`);

        // Performance should be reasonable (less than 5 seconds each)
        expect(saveTime).toBeLessThan(5000);
        expect(loadTime).toBeLessThan(5000);
      });
    });
  });
});
