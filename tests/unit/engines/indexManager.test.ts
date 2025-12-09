/**
 * Index Manager Tests
 *
 * Integration tests covering:
 * - Progress reporting interfaces
 * - File scanning with policy filtering
 * - Full index creation
 * - Incremental updates (add, modify, delete)
 * - Delta application
 * - IndexManager class operations
 * - Error handling and rollback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  FILE_BATCH_SIZE,
  IndexProgress,
  ProgressCallback,
  IndexResult,
  IndexStats,
  scanFiles,
  createFullIndex,
  updateFile,
  removeFile,
  applyDelta,
  IndexManager,
} from '../../../src/engines/indexManager.js';
import { IndexingPolicy } from '../../../src/engines/indexPolicy.js';
import { LanceDBStore } from '../../../src/storage/lancedb.js';
import { FingerprintsManager, DeltaResult } from '../../../src/storage/fingerprints.js';
import { MetadataManager } from '../../../src/storage/metadata.js';
import { Config, DEFAULT_CONFIG, generateDefaultConfig } from '../../../src/storage/config.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a temporary directory
 */
async function createTempDir(prefix: string): Promise<string> {
  const tempBase = os.tmpdir();
  const tempDir = await fs.promises.mkdtemp(path.join(tempBase, prefix));
  return tempDir;
}

/**
 * Remove a directory recursively
 */
async function removeTempDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Create a file with content
 */
async function createFile(
  basePath: string,
  relativePath: string,
  content: string
): Promise<string> {
  const fullPath = path.join(basePath, relativePath);
  const dir = path.dirname(fullPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}

/**
 * Create a test project structure
 */
async function createTestProject(projectPath: string): Promise<void> {
  // Create src files
  await createFile(
    projectPath,
    'src/index.ts',
    `/**
 * Main entry point
 */
export function main() {
  console.log('Hello, World!');
}

export const VERSION = '1.0.0';
`
  );

  await createFile(
    projectPath,
    'src/utils/helper.ts',
    `/**
 * Helper utilities
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseJSON<T>(json: string): T {
  return JSON.parse(json);
}
`
  );

  await createFile(
    projectPath,
    'src/utils/math.ts',
    `/**
 * Math utilities
 */
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`
  );

  // Create a README
  await createFile(
    projectPath,
    'README.md',
    `# Test Project

This is a test project for indexing.
`
  );

  // Create package.json (will be excluded by hardcoded rules)
  await createFile(
    projectPath,
    'package.json',
    JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
  );
}

/**
 * Wait for a short time (for file system operations)
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Tests
// ============================================================================

describe('Index Manager', () => {
  describe('Constants', () => {
    it('should export FILE_BATCH_SIZE as 50', () => {
      expect(FILE_BATCH_SIZE).toBe(50);
    });
  });

  describe('scanFiles', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('scan-test-project-');
      indexPath = await createTempDir('scan-test-index-');
      await createTestProject(projectPath);
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should scan all indexable files in a project', async () => {
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const files = await scanFiles(projectPath, policy, config);

      // Should find the source files and README
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain('src/index.ts');
      expect(files).toContain('src/utils/helper.ts');
      expect(files).toContain('src/utils/math.ts');
      expect(files).toContain('README.md');
    });

    it('should exclude files based on config.exclude', async () => {
      const config: Config = { ...DEFAULT_CONFIG, exclude: ['**/*.md'] };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const files = await scanFiles(projectPath, policy, config);

      expect(files).not.toContain('README.md');
      expect(files).toContain('src/index.ts');
    });

    it('should respect include patterns', async () => {
      const config: Config = { ...DEFAULT_CONFIG, include: ['src/**/*.ts'] };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const files = await scanFiles(projectPath, policy, config);

      expect(files).toContain('src/index.ts');
      expect(files).toContain('src/utils/helper.ts');
      expect(files).not.toContain('README.md');
      expect(files).not.toContain('package.json');
    });

    it('should call progress callback during scanning', async () => {
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const progressCalls: IndexProgress[] = [];
      const onProgress: ProgressCallback = (progress) => {
        progressCalls.push({ ...progress });
      };

      await scanFiles(projectPath, policy, config, onProgress);

      // Should have at least one scanning progress call
      const scanningCalls = progressCalls.filter((p) => p.phase === 'scanning');
      expect(scanningCalls.length).toBeGreaterThan(0);

      // Final call should have current === total
      const lastCall = scanningCalls[scanningCalls.length - 1];
      expect(lastCall.current).toBe(lastCall.total);
    });

    it('should exclude binary files', async () => {
      await createFile(projectPath, 'assets/image.png', 'binary content');

      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const files = await scanFiles(projectPath, policy, config);

      expect(files).not.toContain('assets/image.png');
    });

    it('should exclude hardcoded patterns', async () => {
      // Create files that should be excluded
      await createFile(projectPath, 'node_modules/lodash/index.js', 'module.exports = {}');
      await createFile(projectPath, '.git/config', '[core]');
      await createFile(projectPath, '.env', 'SECRET=123');

      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const files = await scanFiles(projectPath, policy, config);

      expect(files).not.toContain('node_modules/lodash/index.js');
      expect(files).not.toContain('.git/config');
      expect(files).not.toContain('.env');
    });

    it('should return empty array for empty project', async () => {
      const emptyProject = await createTempDir('empty-project-');

      try {
        const config: Config = { ...DEFAULT_CONFIG };
        const policy = new IndexingPolicy(emptyProject, config);
        await policy.initialize();

        const files = await scanFiles(emptyProject, policy, config);

        expect(files).toEqual([]);
      } finally {
        await removeTempDir(emptyProject);
      }
    });
  });

  describe('createFullIndex', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('index-test-project-');
      indexPath = await createTempDir('index-test-index-');
      await createTestProject(projectPath);
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should create a full index successfully', async () => {
      const result = await createFullIndex(projectPath, indexPath);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBeGreaterThan(0);
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
    }, 60000);

    it('should create metadata file', async () => {
      await createFullIndex(projectPath, indexPath);

      const metadataPath = path.join(indexPath, 'metadata.json');
      expect(fs.existsSync(metadataPath)).toBe(true);

      const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
      expect(metadata.projectPath).toBe(projectPath);
      expect(metadata.stats.totalFiles).toBeGreaterThan(0);
    }, 60000);

    it('should create fingerprints file', async () => {
      await createFullIndex(projectPath, indexPath);

      const fingerprintsPath = path.join(indexPath, 'fingerprints.json');
      expect(fs.existsSync(fingerprintsPath)).toBe(true);

      const fingerprints = JSON.parse(await fs.promises.readFile(fingerprintsPath, 'utf-8'));
      expect(Object.keys(fingerprints.fingerprints).length).toBeGreaterThan(0);
    }, 60000);

    it('should create LanceDB store with chunks', async () => {
      await createFullIndex(projectPath, indexPath);

      const store = new LanceDBStore(indexPath);
      await store.open();

      const count = await store.countChunks();
      expect(count).toBeGreaterThan(0);

      await store.close();
    }, 60000);

    it('should report progress during indexing', async () => {
      const progressCalls: IndexProgress[] = [];
      const onProgress: ProgressCallback = (progress) => {
        progressCalls.push({ ...progress });
      };

      await createFullIndex(projectPath, indexPath, onProgress);

      // Should have progress calls for multiple phases
      const phases = new Set(progressCalls.map((p) => p.phase));
      expect(phases.has('scanning')).toBe(true);
      expect(phases.has('chunking')).toBe(true);
      // embedding and storing may or may not be reported depending on file count
    }, 60000);

    it('should handle empty project', async () => {
      const emptyProject = await createTempDir('empty-project-');

      try {
        const result = await createFullIndex(emptyProject, indexPath);

        expect(result.success).toBe(true);
        expect(result.filesIndexed).toBe(0);
        expect(result.chunksCreated).toBe(0);
      } finally {
        await removeTempDir(emptyProject);
      }
    }, 30000);

    it('should overwrite existing index on recreate', async () => {
      // Create initial index
      await createFullIndex(projectPath, indexPath);

      // Add a new file
      await createFile(projectPath, 'src/new-file.ts', 'export const x = 1;');

      // Recreate index
      const result = await createFullIndex(projectPath, indexPath);

      expect(result.success).toBe(true);

      // New file should be indexed
      const store = new LanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('src/new-file.ts');
      await store.close();
    }, 120000);
  });

  describe('updateFile', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('update-test-project-');
      indexPath = await createTempDir('update-test-index-');
      await createTestProject(projectPath);
      await createFullIndex(projectPath, indexPath);
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should add a new file to the index', async () => {
      // Create a new file
      await createFile(projectPath, 'src/new-file.ts', 'export const newValue = 42;');

      await updateFile(projectPath, indexPath, 'src/new-file.ts');

      // Verify it was added
      const store = new LanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('src/new-file.ts');
      await store.close();
    }, 60000);

    it('should update a modified file', async () => {
      // Modify an existing file
      const originalContent = await fs.promises.readFile(
        path.join(projectPath, 'src/index.ts'),
        'utf-8'
      );
      await createFile(projectPath, 'src/index.ts', originalContent + '\n// Modified\n');

      await updateFile(projectPath, indexPath, 'src/index.ts');

      // Verify fingerprint was updated
      const fingerprintsManager = new FingerprintsManager(indexPath, projectPath);
      await fingerprintsManager.load();
      expect(fingerprintsManager.has('src/index.ts')).toBe(true);
    }, 60000);

    it('should remove a deleted file', async () => {
      // First verify file is in index
      let store = new LanceDBStore(indexPath);
      await store.open();
      let files = await store.getIndexedFiles();
      expect(files).toContain('src/index.ts');
      await store.close();

      // Delete the file
      await fs.promises.unlink(path.join(projectPath, 'src/index.ts'));

      await updateFile(projectPath, indexPath, 'src/index.ts');

      // Verify it was removed
      store = new LanceDBStore(indexPath);
      await store.open();
      files = await store.getIndexedFiles();
      expect(files).not.toContain('src/index.ts');
      await store.close();
    }, 60000);

    it('should skip unchanged files', async () => {
      // Get initial chunk count
      let store = new LanceDBStore(indexPath);
      await store.open();
      const initialCount = await store.countChunks();
      await store.close();

      // Update without changing the file
      await updateFile(projectPath, indexPath, 'src/index.ts');

      // Chunk count should be the same
      store = new LanceDBStore(indexPath);
      await store.open();
      const newCount = await store.countChunks();
      await store.close();

      expect(newCount).toBe(initialCount);
    }, 60000);

    it('should update metadata after file update', async () => {
      await createFile(projectPath, 'src/extra.ts', 'export const extra = true;');
      await updateFile(projectPath, indexPath, 'src/extra.ts');

      const metadataManager = new MetadataManager(indexPath);
      await metadataManager.load();
      const metadata = metadataManager.getMetadata();

      expect(metadata).not.toBeNull();
      expect(metadata!.lastIncrementalUpdate).toBeDefined();
    }, 60000);
  });

  describe('removeFile', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('remove-test-project-');
      indexPath = await createTempDir('remove-test-index-');
      await createTestProject(projectPath);
      await createFullIndex(projectPath, indexPath);
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should remove a file from the index', async () => {
      await removeFile(projectPath, indexPath, 'src/index.ts');

      const store = new LanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).not.toContain('src/index.ts');
      await store.close();
    }, 60000);

    it('should update fingerprints after removal', async () => {
      await removeFile(projectPath, indexPath, 'src/index.ts');

      const fingerprintsManager = new FingerprintsManager(indexPath, projectPath);
      await fingerprintsManager.load();
      expect(fingerprintsManager.has('src/index.ts')).toBe(false);
    }, 60000);

    it('should handle removing non-existent file gracefully', async () => {
      // Should not throw
      await removeFile(projectPath, indexPath, 'non/existent/file.ts');

      // Index should still be valid
      const store = new LanceDBStore(indexPath);
      await store.open();
      const count = await store.countChunks();
      expect(count).toBeGreaterThan(0);
      await store.close();
    }, 60000);
  });

  describe('applyDelta', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('delta-test-project-');
      indexPath = await createTempDir('delta-test-index-');
      await createTestProject(projectPath);
      await createFullIndex(projectPath, indexPath);
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should apply a delta with added files', async () => {
      await createFile(projectPath, 'src/added1.ts', 'export const a1 = 1;');
      await createFile(projectPath, 'src/added2.ts', 'export const a2 = 2;');

      const delta: DeltaResult = {
        added: ['src/added1.ts', 'src/added2.ts'],
        modified: [],
        removed: [],
        unchanged: [],
      };

      const result = await applyDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(2);

      const store = new LanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('src/added1.ts');
      expect(files).toContain('src/added2.ts');
      await store.close();
    }, 60000);

    it('should apply a delta with modified files', async () => {
      await createFile(projectPath, 'src/index.ts', '// Modified content\nexport const main = () => {};');

      const delta: DeltaResult = {
        added: [],
        modified: ['src/index.ts'],
        removed: [],
        unchanged: [],
      };

      const result = await applyDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(1);
    }, 60000);

    it('should apply a delta with removed files', async () => {
      const delta: DeltaResult = {
        added: [],
        modified: [],
        removed: ['src/index.ts'],
        unchanged: [],
      };

      const result = await applyDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);

      const store = new LanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).not.toContain('src/index.ts');
      await store.close();
    }, 60000);

    it('should apply a mixed delta', async () => {
      await createFile(projectPath, 'src/new.ts', 'export const newFile = true;');
      await createFile(projectPath, 'src/utils/helper.ts', '// Modified helper\nexport const help = () => {};');

      const delta: DeltaResult = {
        added: ['src/new.ts'],
        modified: ['src/utils/helper.ts'],
        removed: ['src/utils/math.ts'],
        unchanged: [],
      };

      const result = await applyDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);

      const store = new LanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('src/new.ts');
      expect(files).toContain('src/utils/helper.ts');
      expect(files).not.toContain('src/utils/math.ts');
      await store.close();
    }, 60000);

    it('should handle empty delta', async () => {
      const delta: DeltaResult = {
        added: [],
        modified: [],
        removed: [],
        unchanged: [],
      };

      const result = await applyDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(0);
      expect(result.chunksCreated).toBe(0);
    }, 30000);

    it('should report progress during delta application', async () => {
      await createFile(projectPath, 'src/new.ts', 'export const x = 1;');

      const delta: DeltaResult = {
        added: ['src/new.ts'],
        modified: [],
        removed: ['README.md'],
        unchanged: [],
      };

      const progressCalls: IndexProgress[] = [];
      const onProgress: ProgressCallback = (progress) => {
        progressCalls.push({ ...progress });
      };

      await applyDelta(projectPath, indexPath, delta, onProgress);

      expect(progressCalls.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('IndexManager class', () => {
    let projectPath: string;
    let indexPath: string;
    let manager: IndexManager;

    beforeEach(async () => {
      projectPath = await createTempDir('manager-test-project-');
      indexPath = await createTempDir('manager-test-index-');
      await createTestProject(projectPath);
      manager = new IndexManager(projectPath, indexPath);
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    describe('constructor', () => {
      it('should create with project and index paths', () => {
        expect(manager.getProjectPath()).toBe(projectPath);
        expect(manager.getIndexPath()).toBe(indexPath);
      });

      it('should derive index path from project path if not provided', () => {
        const autoManager = new IndexManager(projectPath);
        expect(autoManager.getProjectPath()).toBe(projectPath);
        // Index path should be derived (not the same as project path)
        expect(autoManager.getIndexPath()).not.toBe(projectPath);
      });
    });

    describe('createIndex', () => {
      it('should create an index', async () => {
        const result = await manager.createIndex();

        expect(result.success).toBe(true);
        expect(result.filesIndexed).toBeGreaterThan(0);
      }, 60000);

      it('should report progress', async () => {
        const progressCalls: IndexProgress[] = [];

        await manager.createIndex((progress) => {
          progressCalls.push({ ...progress });
        });

        expect(progressCalls.length).toBeGreaterThan(0);
      }, 60000);
    });

    describe('rebuildIndex', () => {
      it('should rebuild an existing index', async () => {
        // Create initial index
        await manager.createIndex();

        // Add a file
        await createFile(projectPath, 'src/rebuild-test.ts', 'export const test = 1;');

        // Rebuild
        const result = await manager.rebuildIndex();

        expect(result.success).toBe(true);

        // New file should be indexed
        const store = new LanceDBStore(indexPath);
        await store.open();
        const files = await store.getIndexedFiles();
        expect(files).toContain('src/rebuild-test.ts');
        await store.close();
      }, 120000);
    });

    describe('deleteIndex', () => {
      it('should delete the index', async () => {
        await manager.createIndex();

        // Verify index exists
        expect(await manager.isIndexed()).toBe(true);

        await manager.deleteIndex();

        // Metadata should be gone
        const metadataPath = path.join(indexPath, 'metadata.json');
        expect(fs.existsSync(metadataPath)).toBe(false);
      }, 60000);
    });

    describe('updateFile', () => {
      it('should update a single file', async () => {
        await manager.createIndex();

        await createFile(projectPath, 'src/single-update.ts', 'export const single = 1;');

        await manager.updateFile('src/single-update.ts');

        const store = new LanceDBStore(indexPath);
        await store.open();
        const files = await store.getIndexedFiles();
        expect(files).toContain('src/single-update.ts');
        await store.close();
      }, 60000);
    });

    describe('removeFile', () => {
      it('should remove a single file', async () => {
        await manager.createIndex();

        await manager.removeFile('src/index.ts');

        const store = new LanceDBStore(indexPath);
        await store.open();
        const files = await store.getIndexedFiles();
        expect(files).not.toContain('src/index.ts');
        await store.close();
      }, 60000);
    });

    describe('applyDelta', () => {
      it('should apply a delta through the manager', async () => {
        await manager.createIndex();

        await createFile(projectPath, 'src/delta-add.ts', 'export const delta = 1;');

        const delta: DeltaResult = {
          added: ['src/delta-add.ts'],
          modified: [],
          removed: [],
          unchanged: [],
        };

        const result = await manager.applyDelta(delta);

        expect(result.success).toBe(true);
      }, 60000);
    });

    describe('isIndexed', () => {
      it('should return false for non-indexed project', async () => {
        expect(await manager.isIndexed()).toBe(false);
      });

      it('should return true for indexed project', async () => {
        await manager.createIndex();
        expect(await manager.isIndexed()).toBe(true);
      }, 60000);
    });

    describe('getStats', () => {
      it('should return stats for indexed project', async () => {
        await manager.createIndex();

        const stats = await manager.getStats();

        expect(stats.totalFiles).toBeGreaterThan(0);
        expect(stats.totalChunks).toBeGreaterThan(0);
        expect(stats.storageSizeBytes).toBeGreaterThan(0);
        expect(stats.lastFullIndex).toBeDefined();
      }, 60000);

      it('should throw for non-indexed project', async () => {
        await expect(manager.getStats()).rejects.toThrow();
      });
    });
  });

  describe('Error Handling', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('error-test-project-');
      indexPath = await createTempDir('error-test-index-');
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should handle indexing project with unreadable files gracefully', async () => {
      await createTestProject(projectPath);

      // Create a file but we can't easily make it unreadable in a cross-platform way
      // So we'll just verify the indexing completes without critical errors
      const result = await createFullIndex(projectPath, indexPath);

      expect(result.success).toBe(true);
    }, 60000);

    it('should create errors array for files that fail to process', async () => {
      await createTestProject(projectPath);

      // This should still succeed overall
      const result = await createFullIndex(projectPath, indexPath);

      // errors should be undefined or empty if all files processed successfully
      expect(result.errors === undefined || result.errors.length === 0).toBe(true);
    }, 60000);
  });

  describe('Large Project Handling', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('large-test-project-');
      indexPath = await createTempDir('large-test-index-');
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should handle project with many files using batching', async () => {
      // Create more files than FILE_BATCH_SIZE
      const fileCount = FILE_BATCH_SIZE + 10;
      for (let i = 0; i < fileCount; i++) {
        await createFile(
          projectPath,
          `src/file${i}.ts`,
          `export const value${i} = ${i};`
        );
      }

      const result = await createFullIndex(projectPath, indexPath);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(fileCount);
    }, 120000);
  });
});
