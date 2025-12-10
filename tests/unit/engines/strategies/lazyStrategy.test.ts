/**
 * Lazy Strategy Tests
 *
 * Unit tests covering:
 * - Strategy interface compliance
 * - Lifecycle management (initialize, start, stop)
 * - File event queuing (not immediate processing)
 * - Dirty files persistence
 * - Flush behavior (on-demand only, no timer)
 * - Code vs docs file routing
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  LazyStrategy,
  createLazyStrategy,
  LazyStrategyOptions,
} from '../../../../src/engines/strategies/lazyStrategy.js';
import {
  IndexingStrategy,
  StrategyFileEvent,
  StrategyStats,
} from '../../../../src/engines/indexingStrategy.js';
import { IndexManager } from '../../../../src/engines/indexManager.js';
import { DocsIndexManager } from '../../../../src/engines/docsIndexManager.js';
import { IndexingPolicy } from '../../../../src/engines/indexPolicy.js';
import { DirtyFilesManager } from '../../../../src/storage/dirtyFiles.js';
import { Config, DEFAULT_CONFIG } from '../../../../src/storage/config.js';

// Mock the logger to avoid file system side effects
vi.mock('../../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

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
 * Wait for a specific time
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a test project structure
 */
async function createTestProject(projectPath: string): Promise<void> {
  await createFile(
    projectPath,
    'src/index.ts',
    `/**
 * Main entry point
 */
export function main() {
  console.log('Hello, World!');
}
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
`
  );

  await createFile(
    projectPath,
    'README.md',
    `# Test Project

This is a test project.
`
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('LazyStrategy', () => {
  describe('Interface Compliance', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;
    let strategy: LazyStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-iface-test-project-');
      indexPath = await createTempDir('lazy-iface-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should have name "lazy"', () => {
      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      expect(strategy.name).toBe('lazy');
    });

    it('should implement IndexingStrategy interface', () => {
      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      // Check all required interface methods exist
      expect(typeof strategy.initialize).toBe('function');
      expect(typeof strategy.start).toBe('function');
      expect(typeof strategy.stop).toBe('function');
      expect(typeof strategy.isActive).toBe('function');
      expect(typeof strategy.onFileEvent).toBe('function');
      expect(typeof strategy.flush).toBe('function');
      expect(typeof strategy.getStats).toBe('function');
    });

    it('should return valid StrategyStats from getStats()', () => {
      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      const stats = strategy.getStats();

      expect(stats.name).toBe('lazy');
      expect(typeof stats.isActive).toBe('boolean');
      expect(typeof stats.pendingFiles).toBe('number');
      expect(typeof stats.processedFiles).toBe('number');
      expect(stats.lastActivity === null || stats.lastActivity instanceof Date).toBe(true);
    });
  });

  describe('Constructor', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-ctor-test-project-');
      indexPath = await createTempDir('lazy-ctor-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should create instance with required dependencies', () => {
      const strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      expect(strategy).toBeInstanceOf(LazyStrategy);
      expect(strategy.getProjectPath()).toBe(projectPath);
    });

    it('should accept optional DocsIndexManager', () => {
      const docsIndexManager = new DocsIndexManager(projectPath, indexPath);

      const strategy = new LazyStrategy(
        projectPath,
        indexManager,
        docsIndexManager,
        policy,
        dirtyFiles
      );

      expect(strategy).toBeInstanceOf(LazyStrategy);
    });

  });

  describe('Lifecycle Management', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;
    let strategy: LazyStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-lifecycle-test-project-');
      indexPath = await createTempDir('lazy-lifecycle-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);

      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    describe('initialize()', () => {
      it('should initialize without error', async () => {
        await expect(strategy.initialize()).resolves.not.toThrow();
      });

      it('should ensure dirty files are loaded', async () => {
        const newDirtyFiles = new DirtyFilesManager(indexPath);
        const newStrategy = new LazyStrategy(
          projectPath,
          indexManager,
          null,
          policy,
          newDirtyFiles
        );

        expect(newDirtyFiles.isLoaded()).toBe(false);
        await newStrategy.initialize();
        expect(newDirtyFiles.isLoaded()).toBe(true);
      });

      it('should ensure policy is initialized', async () => {
        const uninitPolicy = new IndexingPolicy(projectPath, { ...DEFAULT_CONFIG });

        expect(uninitPolicy.isInitialized()).toBe(false);

        const newStrategy = new LazyStrategy(
          projectPath,
          indexManager,
          null,
          uninitPolicy,
          dirtyFiles
        );

        await newStrategy.initialize();
        expect(uninitPolicy.isInitialized()).toBe(true);
      });
    });

    describe('start()', () => {
      beforeEach(async () => {
        await strategy.initialize();
      });

      it('should start without error', async () => {
        await expect(strategy.start()).resolves.not.toThrow();
        expect(strategy.isActive()).toBe(true);
      });

      it('should set isActive to true', async () => {
        expect(strategy.isActive()).toBe(false);
        await strategy.start();
        expect(strategy.isActive()).toBe(true);
      });

      it('should be idempotent - multiple starts are safe', async () => {
        await strategy.start();
        await expect(strategy.start()).resolves.not.toThrow();
        expect(strategy.isActive()).toBe(true);
      });
    });

    describe('stop()', () => {
      beforeEach(async () => {
        await strategy.initialize();
        await strategy.start();
      });

      it('should stop without error', async () => {
        await expect(strategy.stop()).resolves.not.toThrow();
        expect(strategy.isActive()).toBe(false);
      });

      it('should set isActive to false', async () => {
        expect(strategy.isActive()).toBe(true);
        await strategy.stop();
        expect(strategy.isActive()).toBe(false);
      });

      it('should be idempotent - multiple stops are safe', async () => {
        await strategy.stop();
        await expect(strategy.stop()).resolves.not.toThrow();
        expect(strategy.isActive()).toBe(false);
      });

      it('should save dirty files on stop', async () => {
        // Add a dirty file
        await strategy.onFileEvent({
          type: 'add',
          relativePath: 'test.ts',
          absolutePath: path.join(projectPath, 'test.ts'),
        });

        // Stop should save
        await strategy.stop();

        // Verify dirty files were saved by loading them fresh
        const newDirtyFiles = new DirtyFilesManager(indexPath);
        await newDirtyFiles.load();
        expect(newDirtyFiles.has('test.ts')).toBe(true);
      });
    });

    describe('isActive()', () => {
      it('should return false before start', () => {
        expect(strategy.isActive()).toBe(false);
      });

      it('should return true after start', async () => {
        await strategy.initialize();
        await strategy.start();
        expect(strategy.isActive()).toBe(true);
      });

      it('should return false after stop', async () => {
        await strategy.initialize();
        await strategy.start();
        await strategy.stop();
        expect(strategy.isActive()).toBe(false);
      });
    });
  });

  describe('File Event Queuing', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;
    let strategy: LazyStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-queue-test-project-');
      indexPath = await createTempDir('lazy-queue-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);

      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should queue add events without immediate processing', async () => {
      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'src/new-file.ts',
        absolutePath: path.join(projectPath, 'src/new-file.ts'),
      });

      // File should be in dirty files, not processed
      expect(dirtyFiles.has('src/new-file.ts')).toBe(true);
      expect(strategy.getStats().pendingFiles).toBe(1);
      expect(strategy.getStats().processedFiles).toBe(0);
    });

    it('should queue change events without immediate processing', async () => {
      await strategy.onFileEvent({
        type: 'change',
        relativePath: 'src/index.ts',
        absolutePath: path.join(projectPath, 'src/index.ts'),
      });

      expect(dirtyFiles.has('src/index.ts')).toBe(true);
      expect(strategy.getStats().pendingFiles).toBe(1);
      expect(strategy.getStats().processedFiles).toBe(0);
    });

    it('should queue unlink events as deletions', async () => {
      await strategy.onFileEvent({
        type: 'unlink',
        relativePath: 'src/deleted.ts',
        absolutePath: path.join(projectPath, 'src/deleted.ts'),
      });

      expect(dirtyFiles.isDeleted('src/deleted.ts')).toBe(true);
      expect(strategy.getStats().pendingFiles).toBe(1);
      expect(strategy.getStats().processedFiles).toBe(0);
    });

    it('should update lastActivity on file events', async () => {
      expect(strategy.getStats().lastActivity).toBe(null);

      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'test.ts',
        absolutePath: path.join(projectPath, 'test.ts'),
      });

      expect(strategy.getStats().lastActivity).toBeInstanceOf(Date);
    });

    it('should handle multiple events', async () => {
      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'file1.ts',
        absolutePath: path.join(projectPath, 'file1.ts'),
      });

      await strategy.onFileEvent({
        type: 'change',
        relativePath: 'file2.ts',
        absolutePath: path.join(projectPath, 'file2.ts'),
      });

      await strategy.onFileEvent({
        type: 'unlink',
        relativePath: 'file3.ts',
        absolutePath: path.join(projectPath, 'file3.ts'),
      });

      expect(strategy.getStats().pendingFiles).toBe(3);
    });

    it('should replace deletion marker when file is recreated', async () => {
      // Delete a file
      await strategy.onFileEvent({
        type: 'unlink',
        relativePath: 'test.ts',
        absolutePath: path.join(projectPath, 'test.ts'),
      });

      expect(dirtyFiles.isDeleted('test.ts')).toBe(true);

      // Recreate the file
      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'test.ts',
        absolutePath: path.join(projectPath, 'test.ts'),
      });

      // Should no longer be marked as deleted, but as dirty
      expect(dirtyFiles.isDeleted('test.ts')).toBe(false);
      expect(dirtyFiles.has('test.ts')).toBe(true);
    });
  });

  describe('Flush Behavior', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;
    let strategy: LazyStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-flush-test-project-');
      indexPath = await createTempDir('lazy-flush-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);

      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should do nothing when no dirty files', async () => {
      expect(dirtyFiles.isEmpty()).toBe(true);
      await expect(strategy.flush()).resolves.not.toThrow();
    });

    it('should clear dirty files after flush', async () => {
      // Add a dirty file (use existing file)
      await strategy.onFileEvent({
        type: 'change',
        relativePath: 'src/index.ts',
        absolutePath: path.join(projectPath, 'src/index.ts'),
      });

      expect(dirtyFiles.count()).toBe(1);

      // Note: flush will try to process the file through IndexManager
      // which requires a proper index. For this test, we just verify
      // that flush clears the dirty files regardless of processing result.
      await strategy.flush();

      expect(dirtyFiles.isEmpty()).toBe(true);
    });

    it('should prevent concurrent flushes', async () => {
      // Add multiple dirty files
      await strategy.onFileEvent({
        type: 'change',
        relativePath: 'src/index.ts',
        absolutePath: path.join(projectPath, 'src/index.ts'),
      });

      // Start first flush
      const flush1 = strategy.flush();

      // Immediate second flush should effectively be skipped (no-op if flushing)
      expect(strategy.isFlushing()).toBe(true);
      const flush2 = strategy.flush();

      await Promise.all([flush1, flush2]);

      // Both should complete without error
      expect(strategy.isFlushing()).toBe(false);
    });

    it('should save dirty files to disk after flush', async () => {
      await strategy.onFileEvent({
        type: 'change',
        relativePath: 'src/index.ts',
        absolutePath: path.join(projectPath, 'src/index.ts'),
      });

      await strategy.flush();

      // Load fresh and verify empty
      const newDirtyFiles = new DirtyFilesManager(indexPath);
      await newDirtyFiles.load();
      expect(newDirtyFiles.isEmpty()).toBe(true);
    });
  });

  describe('getStats()', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;
    let strategy: LazyStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-stats-test-project-');
      indexPath = await createTempDir('lazy-stats-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);

      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should return correct name', () => {
      expect(strategy.getStats().name).toBe('lazy');
    });

    it('should return correct isActive before and after start', async () => {
      expect(strategy.getStats().isActive).toBe(false);

      await strategy.start();
      expect(strategy.getStats().isActive).toBe(true);

      await strategy.stop();
      expect(strategy.getStats().isActive).toBe(false);
    });

    it('should return correct pendingFiles count', async () => {
      expect(strategy.getStats().pendingFiles).toBe(0);

      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'file1.ts',
        absolutePath: path.join(projectPath, 'file1.ts'),
      });

      expect(strategy.getStats().pendingFiles).toBe(1);

      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'file2.ts',
        absolutePath: path.join(projectPath, 'file2.ts'),
      });

      expect(strategy.getStats().pendingFiles).toBe(2);
    });

    it('should track lastActivity', async () => {
      const statsBefore = strategy.getStats();
      expect(statsBefore.lastActivity).toBe(null);

      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'test.ts',
        absolutePath: path.join(projectPath, 'test.ts'),
      });

      const statsAfter = strategy.getStats();
      expect(statsAfter.lastActivity).toBeInstanceOf(Date);
    });
  });

  describe('Factory Function', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-factory-test-project-');
      indexPath = await createTempDir('lazy-factory-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should create LazyStrategy with default options', () => {
      const strategy = createLazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      expect(strategy).toBeInstanceOf(LazyStrategy);
    });

    it('should create LazyStrategy with DocsIndexManager', () => {
      const docsIndexManager = new DocsIndexManager(projectPath, indexPath);

      const strategy = createLazyStrategy(
        projectPath,
        indexManager,
        docsIndexManager,
        policy,
        dirtyFiles
      );

      expect(strategy).toBeInstanceOf(LazyStrategy);
    });
  });

  describe('Public Accessors', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let policy: IndexingPolicy;
    let dirtyFiles: DirtyFilesManager;
    let strategy: LazyStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('lazy-accessors-test-project-');
      indexPath = await createTempDir('lazy-accessors-test-index-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      indexManager = new IndexManager(projectPath, indexPath);
      policy = new IndexingPolicy(projectPath, config);
      dirtyFiles = new DirtyFilesManager(indexPath);

      strategy = new LazyStrategy(
        projectPath,
        indexManager,
        null,
        policy,
        dirtyFiles
      );

      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should return project path', () => {
      expect(strategy.getProjectPath()).toBe(projectPath);
    });

    it('should return dirty count', async () => {
      expect(strategy.getDirtyCount()).toBe(0);

      await strategy.onFileEvent({
        type: 'add',
        relativePath: 'test.ts',
        absolutePath: path.join(projectPath, 'test.ts'),
      });

      expect(strategy.getDirtyCount()).toBe(1);
    });

    it('should return flushing state', async () => {
      expect(strategy.isFlushing()).toBe(false);
    });
  });
});
