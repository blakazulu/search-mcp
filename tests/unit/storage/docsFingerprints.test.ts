import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DOCS_FINGERPRINTS_VERSION,
  loadDocsFingerprints,
  saveDocsFingerprints,
  calculateDocsDelta,
  DocsFingerprintsManager,
  type DocsFingerprints,
  type DocsDeltaResult,
} from '../../../src/storage/docsFingerprints.js';
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

describe('Docs Fingerprints Manager', () => {
  let testDir: string;
  let indexPath: string;
  let projectPath: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = path.join(
      os.tmpdir(),
      `search-mcp-docs-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  describe('DOCS_FINGERPRINTS_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(DOCS_FINGERPRINTS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be 1.0.0 initially', () => {
      expect(DOCS_FINGERPRINTS_VERSION).toBe('1.0.0');
    });
  });

  // ==========================================================================
  // loadDocsFingerprints Tests
  // ==========================================================================

  describe('loadDocsFingerprints', () => {
    it('should return empty Map when no fingerprints file exists', async () => {
      const fingerprints = await loadDocsFingerprints(indexPath);
      expect(fingerprints).toBeInstanceOf(Map);
      expect(fingerprints.size).toBe(0);
    });

    it('should load valid fingerprints from file', async () => {
      const testData = {
        version: '1.0.0',
        fingerprints: {
          'docs/README.md': 'abc123def456',
          'docs/API.md': '789xyz012',
        },
      };

      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(testData));

      const fingerprints = await loadDocsFingerprints(indexPath);
      expect(fingerprints.size).toBe(2);
      expect(fingerprints.get('docs/README.md')).toBe('abc123def456');
      expect(fingerprints.get('docs/API.md')).toBe('789xyz012');
    });

    it('should throw MCPError for invalid JSON', async () => {
      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, 'not valid json {{{');

      await expect(loadDocsFingerprints(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should throw MCPError for invalid fingerprints structure', async () => {
      const invalidData = {
        version: '1.0.0',
        // Missing fingerprints field
      };

      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(invalidData));

      await expect(loadDocsFingerprints(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should throw MCPError when fingerprints is not an object', async () => {
      const invalidData = {
        version: '1.0.0',
        fingerprints: 'not an object',
      };

      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(invalidData));

      await expect(loadDocsFingerprints(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should load fingerprints with many entries', async () => {
      const fingerprints: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        fingerprints[`docs/file${i}.md`] = `hash${i}`;
      }

      const testData = {
        version: '1.0.0',
        fingerprints,
      };

      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      await fs.promises.writeFile(fingerprintsPath, JSON.stringify(testData));

      const loaded = await loadDocsFingerprints(indexPath);
      expect(loaded.size).toBe(1000);
      expect(loaded.get('docs/file500.md')).toBe('hash500');
    });
  });

  // ==========================================================================
  // saveDocsFingerprints Tests
  // ==========================================================================

  describe('saveDocsFingerprints', () => {
    it('should save fingerprints to file', async () => {
      const fingerprints = new Map([
        ['docs/README.md', 'abc123'],
        ['docs/API.md', 'def456'],
      ]);

      await saveDocsFingerprints(indexPath, fingerprints);

      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      const content = await fs.promises.readFile(fingerprintsPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.version).toBe(DOCS_FINGERPRINTS_VERSION);
      expect(saved.fingerprints['docs/README.md']).toBe('abc123');
      expect(saved.fingerprints['docs/API.md']).toBe('def456');
    });

    it('should pretty-print the JSON', async () => {
      const fingerprints = new Map([['docs/README.md', 'abc123']]);
      await saveDocsFingerprints(indexPath, fingerprints);

      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      const content = await fs.promises.readFile(fingerprintsPath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  '); // Indentation
    });

    it('should use atomic write (no temp files left behind)', async () => {
      const fingerprints = new Map([['docs/README.md', 'abc123']]);
      await saveDocsFingerprints(indexPath, fingerprints);

      const files = await fs.promises.readdir(indexPath);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should overwrite existing fingerprints', async () => {
      const initial = new Map([['docs/old.md', 'old123']]);
      await saveDocsFingerprints(indexPath, initial);

      const updated = new Map([['docs/new.md', 'new456']]);
      await saveDocsFingerprints(indexPath, updated);

      const loaded = await loadDocsFingerprints(indexPath);
      expect(loaded.size).toBe(1);
      expect(loaded.has('docs/old.md')).toBe(false);
      expect(loaded.get('docs/new.md')).toBe('new456');
    });

    it('should handle empty fingerprints', async () => {
      const fingerprints = new Map<string, string>();
      await saveDocsFingerprints(indexPath, fingerprints);

      const loaded = await loadDocsFingerprints(indexPath);
      expect(loaded.size).toBe(0);
    });

    it('should handle fingerprints with special characters in paths', async () => {
      const fingerprints = new Map([
        ['docs/file with spaces.md', 'abc123'],
        ['docs/file-with-dashes.md', 'def456'],
        ['docs/file_with_underscores.md', 'ghi789'],
      ]);

      await saveDocsFingerprints(indexPath, fingerprints);
      const loaded = await loadDocsFingerprints(indexPath);

      expect(loaded.get('docs/file with spaces.md')).toBe('abc123');
      expect(loaded.get('docs/file-with-dashes.md')).toBe('def456');
      expect(loaded.get('docs/file_with_underscores.md')).toBe('ghi789');
    });
  });

  // ==========================================================================
  // calculateDocsDelta Tests
  // ==========================================================================

  describe('calculateDocsDelta', () => {
    beforeEach(async () => {
      // Create test files
      await fs.promises.mkdir(path.join(projectPath, 'docs'), { recursive: true });
    });

    it('should detect added files', async () => {
      const stored = new Map<string, string>();
      const currentFiles = ['docs/new-file.md'];

      // Create the file
      await fs.promises.writeFile(
        path.join(projectPath, 'docs', 'new-file.md'),
        'content'
      );

      const delta = await calculateDocsDelta(stored, currentFiles, projectPath);

      expect(delta.added).toContain('docs/new-file.md');
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should detect modified files', async () => {
      // Create file with known content
      const filePath = path.join(projectPath, 'docs', 'modified.md');
      await fs.promises.writeFile(filePath, 'old content');
      const oldHash = await hashFile(filePath);

      // Store old hash
      const stored = new Map([['docs/modified.md', oldHash]]);

      // Modify the file
      await fs.promises.writeFile(filePath, 'new content');

      const delta = await calculateDocsDelta(stored, ['docs/modified.md'], projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toContain('docs/modified.md');
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should detect removed files', async () => {
      const stored = new Map([
        ['docs/removed.md', 'oldhash123'],
      ]);
      const currentFiles: string[] = [];

      const delta = await calculateDocsDelta(stored, currentFiles, projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toContain('docs/removed.md');
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should detect unchanged files', async () => {
      // Create file
      const filePath = path.join(projectPath, 'docs', 'unchanged.md');
      await fs.promises.writeFile(filePath, 'same content');
      const hash = await hashFile(filePath);

      // Store same hash
      const stored = new Map([['docs/unchanged.md', hash]]);

      const delta = await calculateDocsDelta(stored, ['docs/unchanged.md'], projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toContain('docs/unchanged.md');
    });

    it('should handle mixed changes', async () => {
      // Create files
      const unchangedPath = path.join(projectPath, 'docs', 'unchanged.md');
      const modifiedPath = path.join(projectPath, 'docs', 'modified.md');
      const addedPath = path.join(projectPath, 'docs', 'added.md');

      await fs.promises.writeFile(unchangedPath, 'same');
      await fs.promises.writeFile(modifiedPath, 'old');
      await fs.promises.writeFile(addedPath, 'new');

      const unchangedHash = await hashFile(unchangedPath);
      const modifiedOldHash = 'old-hash-that-wont-match';

      const stored = new Map([
        ['docs/unchanged.md', unchangedHash],
        ['docs/modified.md', modifiedOldHash],
        ['docs/removed.md', 'removed-hash'],
      ]);

      const currentFiles = [
        'docs/unchanged.md',
        'docs/modified.md',
        'docs/added.md',
      ];

      const delta = await calculateDocsDelta(stored, currentFiles, projectPath);

      expect(delta.added).toContain('docs/added.md');
      expect(delta.modified).toContain('docs/modified.md');
      expect(delta.removed).toContain('docs/removed.md');
      expect(delta.unchanged).toContain('docs/unchanged.md');
    });

    it('should handle empty stored fingerprints', async () => {
      const filePath = path.join(projectPath, 'docs', 'file.md');
      await fs.promises.writeFile(filePath, 'content');

      const stored = new Map<string, string>();
      const currentFiles = ['docs/file.md'];

      const delta = await calculateDocsDelta(stored, currentFiles, projectPath);

      expect(delta.added).toContain('docs/file.md');
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should handle empty current files', async () => {
      const stored = new Map([
        ['docs/file1.md', 'hash1'],
        ['docs/file2.md', 'hash2'],
      ]);
      const currentFiles: string[] = [];

      const delta = await calculateDocsDelta(stored, currentFiles, projectPath);

      expect(delta.added).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
      expect(delta.removed).toHaveLength(2);
      expect(delta.unchanged).toHaveLength(0);
    });

    it('should treat file read errors as added', async () => {
      // Store a file that doesn't exist on disk
      const stored = new Map([['docs/missing.md', 'old-hash']]);
      const currentFiles = ['docs/missing.md'];

      // Don't create the file - it's "missing" from disk

      const delta = await calculateDocsDelta(stored, currentFiles, projectPath);

      // File should be treated as added since it can't be read
      expect(delta.added).toContain('docs/missing.md');
    });
  });

  // ==========================================================================
  // DocsFingerprintsManager Class Tests
  // ==========================================================================

  describe('DocsFingerprintsManager', () => {
    describe('constructor', () => {
      it('should create instance with index and project paths', () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        expect(manager.getIndexPath()).toBe(indexPath);
        expect(manager.getProjectPath()).toBe(projectPath);
      });

      it('should not be loaded initially', () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        expect(manager.isLoaded()).toBe(false);
      });

      it('should not have unsaved changes initially', () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        expect(manager.hasUnsavedChanges()).toBe(false);
      });
    });

    describe('load', () => {
      it('should load empty fingerprints when no file exists', async () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();
        expect(manager.isLoaded()).toBe(true);
        expect(manager.count()).toBe(0);
      });

      it('should load fingerprints from disk', async () => {
        const testData = {
          version: '1.0.0',
          fingerprints: {
            'docs/README.md': 'abc123',
          },
        };
        await fs.promises.writeFile(
          path.join(indexPath, 'docs-fingerprints.json'),
          JSON.stringify(testData)
        );

        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();

        expect(manager.isLoaded()).toBe(true);
        expect(manager.count()).toBe(1);
        expect(manager.get('docs/README.md')).toBe('abc123');
      });

      it('should update lastLoadedAt', async () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        expect(manager.getLastLoadedAt()).toBe(0);

        const before = Date.now();
        await manager.load();
        const after = Date.now();

        expect(manager.getLastLoadedAt()).toBeGreaterThanOrEqual(before);
        expect(manager.getLastLoadedAt()).toBeLessThanOrEqual(after);
      });

      it('should reset dirty flag after load', async () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();
        manager.set('docs/test.md', 'hash123');
        expect(manager.hasUnsavedChanges()).toBe(true);

        await manager.load();
        expect(manager.hasUnsavedChanges()).toBe(false);
      });
    });

    describe('save', () => {
      it('should throw if fingerprints not loaded', async () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await expect(manager.save()).rejects.toThrow('No docs fingerprints to save');
      });

      it('should save fingerprints to disk', async () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();
        manager.set('docs/README.md', 'abc123');
        await manager.save();

        const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
        expect(fs.existsSync(fingerprintsPath)).toBe(true);

        const content = await fs.promises.readFile(fingerprintsPath, 'utf-8');
        const saved = JSON.parse(content);
        expect(saved.fingerprints['docs/README.md']).toBe('abc123');
      });

      it('should reset dirty flag after save', async () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();
        manager.set('docs/test.md', 'hash123');
        expect(manager.hasUnsavedChanges()).toBe(true);

        await manager.save();
        expect(manager.hasUnsavedChanges()).toBe(false);
      });
    });

    describe('single file operations', () => {
      let manager: DocsFingerprintsManager;

      beforeEach(async () => {
        manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();
      });

      describe('get', () => {
        it('should return undefined for non-existent file', () => {
          expect(manager.get('non/existent.md')).toBeUndefined();
        });

        it('should return hash for existing file', () => {
          manager.set('docs/file.md', 'hash123');
          expect(manager.get('docs/file.md')).toBe('hash123');
        });

        it('should throw if not loaded', async () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.get('docs/file.md')).toThrow('not loaded');
        });
      });

      describe('set', () => {
        it('should add new fingerprint', () => {
          manager.set('docs/new.md', 'newhash');
          expect(manager.get('docs/new.md')).toBe('newhash');
        });

        it('should update existing fingerprint', () => {
          manager.set('docs/file.md', 'old');
          manager.set('docs/file.md', 'new');
          expect(manager.get('docs/file.md')).toBe('new');
        });

        it('should mark as dirty', () => {
          expect(manager.hasUnsavedChanges()).toBe(false);
          manager.set('docs/file.md', 'hash');
          expect(manager.hasUnsavedChanges()).toBe(true);
        });

        it('should throw if not loaded', async () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.set('docs/file.md', 'hash')).toThrow('not loaded');
        });
      });

      describe('delete', () => {
        it('should return false for non-existent file', () => {
          expect(manager.delete('non/existent.md')).toBe(false);
        });

        it('should delete existing file and return true', () => {
          manager.set('docs/file.md', 'hash');
          expect(manager.delete('docs/file.md')).toBe(true);
          expect(manager.has('docs/file.md')).toBe(false);
        });

        it('should mark as dirty only if file existed', async () => {
          manager.delete('non/existent.md');
          expect(manager.hasUnsavedChanges()).toBe(false);

          manager.set('docs/file.md', 'hash');
          manager.hasUnsavedChanges(); // Reset expectation
          await manager.save(); // Reset dirty flag

          manager.delete('docs/file.md');
          expect(manager.hasUnsavedChanges()).toBe(true);
        });

        it('should throw if not loaded', async () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.delete('docs/file.md')).toThrow('not loaded');
        });
      });

      describe('has', () => {
        it('should return false for non-existent file', () => {
          expect(manager.has('non/existent.md')).toBe(false);
        });

        it('should return true for existing file', () => {
          manager.set('docs/file.md', 'hash');
          expect(manager.has('docs/file.md')).toBe(true);
        });

        it('should throw if not loaded', async () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.has('docs/file.md')).toThrow('not loaded');
        });
      });
    });

    describe('batch operations', () => {
      let manager: DocsFingerprintsManager;

      beforeEach(async () => {
        manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();

        // Create test files
        await fs.promises.mkdir(path.join(projectPath, 'docs'), { recursive: true });
      });

      describe('calculateDelta', () => {
        it('should delegate to calculateDocsDelta function', async () => {
          const filePath = path.join(projectPath, 'docs', 'file.md');
          await fs.promises.writeFile(filePath, 'content');

          const delta = await manager.calculateDelta(['docs/file.md']);

          expect(delta.added).toContain('docs/file.md');
        });

        it('should throw if not loaded', async () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          await expect(unloaded.calculateDelta(['docs/file.md'])).rejects.toThrow('not loaded');
        });
      });

      describe('updateFromDelta', () => {
        it('should remove deleted files', async () => {
          manager.set('docs/removed.md', 'hash');

          const delta: DocsDeltaResult = {
            added: [],
            modified: [],
            removed: ['docs/removed.md'],
            unchanged: [],
          };

          manager.updateFromDelta(delta, new Map());
          expect(manager.has('docs/removed.md')).toBe(false);
        });

        it('should add new files', () => {
          const delta: DocsDeltaResult = {
            added: ['docs/new.md'],
            modified: [],
            removed: [],
            unchanged: [],
          };

          const newHashes = new Map([['docs/new.md', 'newhash']]);
          manager.updateFromDelta(delta, newHashes);

          expect(manager.get('docs/new.md')).toBe('newhash');
        });

        it('should update modified files', () => {
          manager.set('docs/modified.md', 'oldhash');

          const delta: DocsDeltaResult = {
            added: [],
            modified: ['docs/modified.md'],
            removed: [],
            unchanged: [],
          };

          const newHashes = new Map([['docs/modified.md', 'newhash']]);
          manager.updateFromDelta(delta, newHashes);

          expect(manager.get('docs/modified.md')).toBe('newhash');
        });

        it('should mark as dirty', () => {
          const delta: DocsDeltaResult = {
            added: ['docs/new.md'],
            modified: [],
            removed: [],
            unchanged: [],
          };

          const newHashes = new Map([['docs/new.md', 'hash']]);
          manager.updateFromDelta(delta, newHashes);

          expect(manager.hasUnsavedChanges()).toBe(true);
        });
      });

      describe('clear', () => {
        it('should remove all fingerprints', () => {
          manager.set('docs/file1.md', 'hash1');
          manager.set('docs/file2.md', 'hash2');
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
          manager.set('docs/old.md', 'oldhash');

          const newFingerprints = new Map([
            ['docs/new1.md', 'hash1'],
            ['docs/new2.md', 'hash2'],
          ]);

          manager.setAll(newFingerprints);

          expect(manager.count()).toBe(2);
          expect(manager.has('docs/old.md')).toBe(false);
          expect(manager.get('docs/new1.md')).toBe('hash1');
          expect(manager.get('docs/new2.md')).toBe('hash2');
        });

        it('should mark as dirty', () => {
          manager.setAll(new Map());
          expect(manager.hasUnsavedChanges()).toBe(true);
        });

        it('should work even if not loaded (initializes fingerprints)', () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          const fingerprints = new Map([['docs/file.md', 'hash']]);

          unloaded.setAll(fingerprints);
          expect(unloaded.count()).toBe(1);
        });
      });
    });

    describe('accessors', () => {
      let manager: DocsFingerprintsManager;

      beforeEach(async () => {
        manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();
      });

      describe('getAll', () => {
        it('should return copy of fingerprints', () => {
          manager.set('docs/file.md', 'hash');

          const all = manager.getAll();
          expect(all.get('docs/file.md')).toBe('hash');

          // Modifying returned map shouldn't affect manager
          all.set('docs/other.md', 'other');
          expect(manager.has('docs/other.md')).toBe(false);
        });

        it('should throw if not loaded', () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.getAll()).toThrow('not loaded');
        });
      });

      describe('count', () => {
        it('should return number of fingerprints', () => {
          expect(manager.count()).toBe(0);

          manager.set('docs/file1.md', 'hash1');
          expect(manager.count()).toBe(1);

          manager.set('docs/file2.md', 'hash2');
          expect(manager.count()).toBe(2);
        });

        it('should throw if not loaded', () => {
          const unloaded = new DocsFingerprintsManager(indexPath, projectPath);
          expect(() => unloaded.count()).toThrow('not loaded');
        });
      });

      describe('getDocsFingerprintsPath', () => {
        it('should return correct path', () => {
          const expectedPath = path.join(indexPath, 'docs-fingerprints.json');
          expect(manager.getDocsFingerprintsPath()).toBe(expectedPath);
        });
      });
    });

    describe('integration', () => {
      it('should support full workflow: load, modify, save, reload', async () => {
        // Initial state
        const manager1 = new DocsFingerprintsManager(indexPath, projectPath);
        await manager1.load();
        manager1.set('docs/file1.md', 'hash1');
        manager1.set('docs/file2.md', 'hash2');
        await manager1.save();

        // Reload in new manager
        const manager2 = new DocsFingerprintsManager(indexPath, projectPath);
        await manager2.load();

        expect(manager2.count()).toBe(2);
        expect(manager2.get('docs/file1.md')).toBe('hash1');
        expect(manager2.get('docs/file2.md')).toBe('hash2');
      });

      it('should support incremental update workflow', async () => {
        await fs.promises.mkdir(path.join(projectPath, 'docs'), { recursive: true });

        // Create initial files
        await fs.promises.writeFile(
          path.join(projectPath, 'docs', 'unchanged.md'),
          'unchanged'
        );
        await fs.promises.writeFile(
          path.join(projectPath, 'docs', 'modified.md'),
          'old content'
        );

        // Initial indexing
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();

        const unchangedHash = await hashFile(
          path.join(projectPath, 'docs', 'unchanged.md')
        );
        const modifiedOldHash = await hashFile(
          path.join(projectPath, 'docs', 'modified.md')
        );

        manager.set('docs/unchanged.md', unchangedHash);
        manager.set('docs/modified.md', modifiedOldHash);
        manager.set('docs/removed.md', 'old-removed-hash');
        await manager.save();

        // Simulate file changes
        await fs.promises.writeFile(
          path.join(projectPath, 'docs', 'modified.md'),
          'new content'
        );
        await fs.promises.writeFile(
          path.join(projectPath, 'docs', 'added.md'),
          'added'
        );
        // removed.md is "deleted" by not including it in currentFiles

        // Reload and calculate delta
        await manager.load();
        const delta = await manager.calculateDelta([
          'docs/unchanged.md',
          'docs/modified.md',
          'docs/added.md',
        ]);

        expect(delta.unchanged).toContain('docs/unchanged.md');
        expect(delta.modified).toContain('docs/modified.md');
        expect(delta.added).toContain('docs/added.md');
        expect(delta.removed).toContain('docs/removed.md');

        // Update fingerprints
        const modifiedNewHash = await hashFile(
          path.join(projectPath, 'docs', 'modified.md')
        );
        const addedHash = await hashFile(
          path.join(projectPath, 'docs', 'added.md')
        );

        const newHashes = new Map([
          ['docs/modified.md', modifiedNewHash],
          ['docs/added.md', addedHash],
        ]);

        manager.updateFromDelta(delta, newHashes);
        await manager.save();

        // Verify final state
        await manager.load();
        expect(manager.count()).toBe(3);
        expect(manager.get('docs/unchanged.md')).toBe(unchangedHash);
        expect(manager.get('docs/modified.md')).toBe(modifiedNewHash);
        expect(manager.get('docs/added.md')).toBe(addedHash);
        expect(manager.has('docs/removed.md')).toBe(false);
      });

      it('should handle large file sets efficiently', async () => {
        const manager = new DocsFingerprintsManager(indexPath, projectPath);
        await manager.load();

        // Add many fingerprints
        const count = 10000;
        for (let i = 0; i < count; i++) {
          manager.set(`docs/file${i}.md`, `hash${i}`);
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
        expect(manager.get(`docs/file${count - 1}.md`)).toBe(`hash${count - 1}`);

        // Performance should be reasonable (less than 5 seconds each)
        expect(saveTime).toBeLessThan(5000);
        expect(loadTime).toBeLessThan(5000);
      });
    });

    describe('isolation from code fingerprints', () => {
      it('should use separate file from code fingerprints', async () => {
        // Create docs fingerprints
        const docsManager = new DocsFingerprintsManager(indexPath, projectPath);
        await docsManager.load();
        docsManager.set('docs/README.md', 'docs-hash');
        await docsManager.save();

        // Create code fingerprints (different file)
        const codeData = {
          version: '1.0.0',
          fingerprints: {
            'src/index.ts': 'code-hash',
          },
        };
        await fs.promises.writeFile(
          path.join(indexPath, 'fingerprints.json'),
          JSON.stringify(codeData)
        );

        // Verify both files exist independently
        const docsContent = await fs.promises.readFile(
          path.join(indexPath, 'docs-fingerprints.json'),
          'utf-8'
        );
        const codeContent = await fs.promises.readFile(
          path.join(indexPath, 'fingerprints.json'),
          'utf-8'
        );

        const docsJson = JSON.parse(docsContent);
        const codeJson = JSON.parse(codeContent);

        expect(docsJson.fingerprints['docs/README.md']).toBe('docs-hash');
        expect(codeJson.fingerprints['src/index.ts']).toBe('code-hash');
        expect(docsJson.fingerprints['src/index.ts']).toBeUndefined();
        expect(codeJson.fingerprints['docs/README.md']).toBeUndefined();
      });

      it('should not affect code fingerprints when modifying docs fingerprints', async () => {
        // Setup code fingerprints first
        const codeData = {
          version: '1.0.0',
          fingerprints: {
            'src/index.ts': 'code-hash-original',
          },
        };
        await fs.promises.writeFile(
          path.join(indexPath, 'fingerprints.json'),
          JSON.stringify(codeData)
        );

        // Modify docs fingerprints
        const docsManager = new DocsFingerprintsManager(indexPath, projectPath);
        await docsManager.load();
        docsManager.set('docs/README.md', 'docs-hash');
        docsManager.set('docs/API.md', 'api-hash');
        await docsManager.save();

        // Verify code fingerprints unchanged
        const codeContent = await fs.promises.readFile(
          path.join(indexPath, 'fingerprints.json'),
          'utf-8'
        );
        const codeJson = JSON.parse(codeContent);

        expect(codeJson.fingerprints['src/index.ts']).toBe('code-hash-original');
        expect(Object.keys(codeJson.fingerprints)).toHaveLength(1);
      });
    });
  });
});
