/**
 * Git Strategy Tests
 *
 * Unit tests covering:
 * - Strategy interface compliance
 * - Lifecycle management (initialize, start, stop)
 * - Git repository verification
 * - Commit detection via .git/logs/HEAD
 * - Debounce behavior
 * - Flush/reconciliation behavior
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  GitStrategy,
  createGitStrategy,
  GitStrategyOptions,
  DEFAULT_GIT_DEBOUNCE_DELAY,
} from '../../../../src/engines/strategies/gitStrategy.js';
import {
  IndexingStrategy,
  StrategyFileEvent,
  StrategyStats,
} from '../../../../src/engines/indexingStrategy.js';
import { IntegrityEngine, DriftReport, ReconcileResult } from '../../../../src/engines/integrity.js';

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
 * Create a mock git repository structure
 */
async function createGitRepo(projectPath: string): Promise<void> {
  // Create .git directory
  const gitDir = path.join(projectPath, '.git');
  await fs.promises.mkdir(gitDir, { recursive: true });

  // Create .git/logs directory
  const logsDir = path.join(gitDir, 'logs');
  await fs.promises.mkdir(logsDir, { recursive: true });

  // Create .git/logs/HEAD file
  const headFile = path.join(logsDir, 'HEAD');
  await fs.promises.writeFile(headFile, '# Git reflog HEAD\n', 'utf-8');

  // Create a basic file in the project
  await fs.promises.writeFile(
    path.join(projectPath, 'index.ts'),
    'export function main() {}\n',
    'utf-8'
  );
}

/**
 * Create a mock IntegrityEngine
 */
function createMockIntegrityEngine(overrides?: Partial<IntegrityEngine>): IntegrityEngine {
  const mockDriftReport: DriftReport = {
    added: [],
    modified: [],
    removed: [],
    inSync: 10,
    lastChecked: new Date(),
  };

  const mockReconcileResult: ReconcileResult = {
    success: true,
    filesAdded: 0,
    filesModified: 0,
    filesRemoved: 0,
    durationMs: 100,
  };

  return {
    checkDrift: vi.fn().mockResolvedValue(mockDriftReport),
    reconcile: vi.fn().mockResolvedValue(mockReconcileResult),
    getProjectPath: vi.fn().mockReturnValue('/mock/path'),
    getIndexPath: vi.fn().mockReturnValue('/mock/index'),
    isIndexingActive: vi.fn().mockReturnValue(false),
    setIndexingActive: vi.fn(),
    startPeriodicCheck: vi.fn(),
    stopPeriodicCheck: vi.fn(),
    isPeriodicCheckRunning: vi.fn().mockReturnValue(false),
    getScheduler: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as IntegrityEngine;
}

/**
 * Wait for a specific time
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Tests
// ============================================================================

describe('GitStrategy', () => {
  describe('Interface Compliance', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;
    let strategy: GitStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('git-iface-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
    });

    it('should have name "git"', () => {
      strategy = new GitStrategy(projectPath, integrityEngine);

      expect(strategy.name).toBe('git');
    });

    it('should implement IndexingStrategy interface', () => {
      strategy = new GitStrategy(projectPath, integrityEngine);

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
      strategy = new GitStrategy(projectPath, integrityEngine);

      const stats = strategy.getStats();

      expect(stats.name).toBe('git');
      expect(typeof stats.isActive).toBe('boolean');
      expect(typeof stats.pendingFiles).toBe('number');
      expect(typeof stats.processedFiles).toBe('number');
      expect(stats.lastActivity === null || stats.lastActivity instanceof Date).toBe(true);
    });

    it('should always return 0 for pendingFiles (git strategy has no queue)', () => {
      strategy = new GitStrategy(projectPath, integrityEngine);

      expect(strategy.getStats().pendingFiles).toBe(0);
    });
  });

  describe('Constructor', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;

    beforeEach(async () => {
      projectPath = await createTempDir('git-ctor-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine();
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
    });

    it('should create instance with required dependencies', () => {
      const strategy = new GitStrategy(projectPath, integrityEngine);

      expect(strategy).toBeInstanceOf(GitStrategy);
      expect(strategy.getProjectPath()).toBe(projectPath);
    });

    it('should use default debounce delay of 2000ms', () => {
      const strategy = new GitStrategy(projectPath, integrityEngine);

      expect(strategy.getDebounceDelay()).toBe(DEFAULT_GIT_DEBOUNCE_DELAY);
      expect(strategy.getDebounceDelay()).toBe(2000);
    });

    it('should accept custom debounce delay', () => {
      const strategy = new GitStrategy(projectPath, integrityEngine, {
        debounceDelayMs: 5000,
      });

      expect(strategy.getDebounceDelay()).toBe(5000);
    });
  });

  describe('Lifecycle Management', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;
    let strategy: GitStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('git-lifecycle-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine();
      strategy = new GitStrategy(projectPath, integrityEngine);
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
    });

    describe('initialize()', () => {
      it('should initialize without error for valid git repo', async () => {
        await expect(strategy.initialize()).resolves.not.toThrow();
      });

      it('should throw error for non-git directory', async () => {
        const nonGitPath = await createTempDir('git-non-repo-');
        const nonGitStrategy = new GitStrategy(nonGitPath, integrityEngine);

        await expect(nonGitStrategy.initialize()).rejects.toThrow(
          'Not a git repository: .git directory not found'
        );

        await removeTempDir(nonGitPath);
      });

      it('should throw error if .git is a file not a directory', async () => {
        const fakePath = await createTempDir('git-fake-repo-');
        // Create .git as a file instead of directory
        await fs.promises.writeFile(path.join(fakePath, '.git'), 'fake');

        const fakeStrategy = new GitStrategy(fakePath, integrityEngine);

        await expect(fakeStrategy.initialize()).rejects.toThrow(
          'Not a git repository: .git is not a directory'
        );

        await removeTempDir(fakePath);
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

      it('should create logs directory if missing', async () => {
        // Remove the logs directory
        const logsDir = path.join(projectPath, '.git', 'logs');
        await fs.promises.rm(logsDir, { recursive: true, force: true });

        await strategy.start();

        // Should have been recreated
        const stat = await fs.promises.stat(logsDir);
        expect(stat.isDirectory()).toBe(true);
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

  describe('onFileEvent()', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;
    let strategy: GitStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('git-event-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine();
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
    });

    it('should be a no-op (git strategy ignores file events)', async () => {
      const event: StrategyFileEvent = {
        type: 'add',
        relativePath: 'test.ts',
        absolutePath: path.join(projectPath, 'test.ts'),
      };

      // Should not throw and should not affect stats
      await expect(strategy.onFileEvent(event)).resolves.not.toThrow();

      // Stats should be unchanged
      expect(strategy.getStats().pendingFiles).toBe(0);
      expect(strategy.getStats().processedFiles).toBe(0);
    });

    it('should not trigger reconciliation for file events', async () => {
      await strategy.start();

      const event: StrategyFileEvent = {
        type: 'change',
        relativePath: 'test.ts',
        absolutePath: path.join(projectPath, 'test.ts'),
      };

      await strategy.onFileEvent(event);

      // IntegrityEngine should not have been called
      expect(integrityEngine.checkDrift).not.toHaveBeenCalled();
      expect(integrityEngine.reconcile).not.toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;
    let strategy: GitStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('git-flush-test-project-');
      await createGitRepo(projectPath);
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
    });

    it('should call IntegrityEngine.checkDrift()', async () => {
      integrityEngine = createMockIntegrityEngine();
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();

      await strategy.flush();

      expect(integrityEngine.checkDrift).toHaveBeenCalled();
    });

    it('should not call reconcile if no drift detected', async () => {
      integrityEngine = createMockIntegrityEngine({
        checkDrift: vi.fn().mockResolvedValue({
          added: [],
          modified: [],
          removed: [],
          inSync: 10,
          lastChecked: new Date(),
        }),
      });
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();

      await strategy.flush();

      expect(integrityEngine.checkDrift).toHaveBeenCalled();
      expect(integrityEngine.reconcile).not.toHaveBeenCalled();
    });

    it('should call reconcile if drift detected', async () => {
      integrityEngine = createMockIntegrityEngine({
        checkDrift: vi.fn().mockResolvedValue({
          added: ['new-file.ts'],
          modified: [],
          removed: [],
          inSync: 10,
          lastChecked: new Date(),
        }),
      });
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();

      await strategy.flush();

      expect(integrityEngine.checkDrift).toHaveBeenCalled();
      expect(integrityEngine.reconcile).toHaveBeenCalled();
    });

    it('should update processedCount after reconcile', async () => {
      integrityEngine = createMockIntegrityEngine({
        checkDrift: vi.fn().mockResolvedValue({
          added: ['new-file.ts'],
          modified: ['changed-file.ts'],
          removed: ['deleted-file.ts'],
          inSync: 10,
          lastChecked: new Date(),
        }),
        reconcile: vi.fn().mockResolvedValue({
          success: true,
          filesAdded: 1,
          filesModified: 1,
          filesRemoved: 1,
          durationMs: 100,
        }),
      });
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();

      expect(strategy.getStats().processedFiles).toBe(0);

      await strategy.flush();

      expect(strategy.getStats().processedFiles).toBe(3);
    });

    it('should update lastActivity after reconcile', async () => {
      integrityEngine = createMockIntegrityEngine({
        checkDrift: vi.fn().mockResolvedValue({
          added: ['new-file.ts'],
          modified: [],
          removed: [],
          inSync: 10,
          lastChecked: new Date(),
        }),
        reconcile: vi.fn().mockResolvedValue({
          success: true,
          filesAdded: 1,
          filesModified: 0,
          filesRemoved: 0,
          durationMs: 100,
        }),
      });
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();

      expect(strategy.getStats().lastActivity).toBe(null);

      await strategy.flush();

      expect(strategy.getStats().lastActivity).toBeInstanceOf(Date);
    });

    it('should prevent concurrent flushes', async () => {
      let resolveFlush: () => void;
      const flushPromise = new Promise<void>((resolve) => {
        resolveFlush = resolve;
      });

      integrityEngine = createMockIntegrityEngine({
        checkDrift: vi.fn().mockImplementation(async () => {
          await flushPromise;
          return {
            added: ['new-file.ts'],
            modified: [],
            removed: [],
            inSync: 10,
            lastChecked: new Date(),
          };
        }),
      });
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();

      // Start first flush
      const flush1 = strategy.flush();

      // Immediate second flush should be skipped
      expect(strategy.isFlushing()).toBe(true);
      const flush2 = strategy.flush();

      // Resolve the blocking promise
      resolveFlush!();

      await Promise.all([flush1, flush2]);

      // checkDrift should only be called once
      expect(integrityEngine.checkDrift).toHaveBeenCalledTimes(1);
    });
  });

  describe('Git Commit Detection', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;
    let strategy: GitStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('git-commit-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine({
        checkDrift: vi.fn().mockResolvedValue({
          added: ['new-file.ts'],
          modified: [],
          removed: [],
          inSync: 10,
          lastChecked: new Date(),
        }),
      });
      // Use short debounce for faster tests
      strategy = new GitStrategy(projectPath, integrityEngine, {
        debounceDelayMs: 100,
      });
      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
    });

    it('should trigger reconciliation when .git/logs/HEAD changes', async () => {
      await strategy.start();

      // Give chokidar time to fully initialize the watcher
      await delay(200);

      // Simulate a git commit by appending to .git/logs/HEAD
      const headFile = path.join(projectPath, '.git', 'logs', 'HEAD');
      const commitEntry = `abc123 def456 Author <email> 1234567890 +0000\tcommit: Test commit\n`;
      await fs.promises.appendFile(headFile, commitEntry);

      // Wait for:
      // - Chokidar's awaitWriteFinish stabilityThreshold (500ms)
      // - Debounce delay (100ms)
      // - Some processing buffer
      await delay(800);

      // Should have triggered reconciliation
      expect(integrityEngine.checkDrift).toHaveBeenCalled();
    });

    it('should debounce rapid git operations', async () => {
      await strategy.start();

      // Give chokidar time to fully initialize the watcher
      await delay(200);

      const headFile = path.join(projectPath, '.git', 'logs', 'HEAD');

      // Simulate rapid git operations (like interactive rebase)
      for (let i = 0; i < 5; i++) {
        const entry = `abc${i} def${i} Author <email> 1234567890 +0000\tcommit: Commit ${i}\n`;
        await fs.promises.appendFile(headFile, entry);
        await delay(20); // Very short delay between operations
      }

      // Wait for:
      // - Chokidar's awaitWriteFinish stabilityThreshold (500ms)
      // - Debounce delay (100ms)
      // - Some processing buffer
      await delay(800);

      // Should have only triggered once due to debounce
      expect(integrityEngine.checkDrift).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats()', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;
    let strategy: GitStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('git-stats-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine();
      strategy = new GitStrategy(projectPath, integrityEngine);
      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
    });

    it('should return correct name', () => {
      expect(strategy.getStats().name).toBe('git');
    });

    it('should return correct isActive before and after start', async () => {
      expect(strategy.getStats().isActive).toBe(false);

      await strategy.start();
      expect(strategy.getStats().isActive).toBe(true);

      await strategy.stop();
      expect(strategy.getStats().isActive).toBe(false);
    });

    it('should always return 0 for pendingFiles', async () => {
      expect(strategy.getStats().pendingFiles).toBe(0);

      await strategy.start();
      expect(strategy.getStats().pendingFiles).toBe(0);

      await strategy.stop();
      expect(strategy.getStats().pendingFiles).toBe(0);
    });

    it('should track processedFiles after flush', async () => {
      const newIntegrityEngine = createMockIntegrityEngine({
        checkDrift: vi.fn().mockResolvedValue({
          added: ['a.ts', 'b.ts'],
          modified: [],
          removed: [],
          inSync: 10,
          lastChecked: new Date(),
        }),
        reconcile: vi.fn().mockResolvedValue({
          success: true,
          filesAdded: 2,
          filesModified: 0,
          filesRemoved: 0,
          durationMs: 100,
        }),
      });

      strategy = new GitStrategy(projectPath, newIntegrityEngine);
      await strategy.initialize();

      expect(strategy.getStats().processedFiles).toBe(0);

      await strategy.flush();
      expect(strategy.getStats().processedFiles).toBe(2);

      await strategy.flush();
      expect(strategy.getStats().processedFiles).toBe(4);
    });
  });

  describe('Factory Function', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;

    beforeEach(async () => {
      projectPath = await createTempDir('git-factory-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine();
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
    });

    it('should create GitStrategy with default options', () => {
      const strategy = createGitStrategy(projectPath, integrityEngine);

      expect(strategy).toBeInstanceOf(GitStrategy);
      expect(strategy.getDebounceDelay()).toBe(DEFAULT_GIT_DEBOUNCE_DELAY);
    });

    it('should create GitStrategy with custom options', () => {
      const strategy = createGitStrategy(projectPath, integrityEngine, {
        debounceDelayMs: 3000,
      });

      expect(strategy).toBeInstanceOf(GitStrategy);
      expect(strategy.getDebounceDelay()).toBe(3000);
    });
  });

  describe('Public Accessors', () => {
    let projectPath: string;
    let integrityEngine: IntegrityEngine;
    let strategy: GitStrategy;

    beforeEach(async () => {
      projectPath = await createTempDir('git-accessors-test-project-');
      await createGitRepo(projectPath);
      integrityEngine = createMockIntegrityEngine();
      strategy = new GitStrategy(projectPath, integrityEngine, {
        debounceDelayMs: 3000,
      });
      await strategy.initialize();
    });

    afterEach(async () => {
      if (strategy?.isActive()) {
        await strategy.stop();
      }
      await removeTempDir(projectPath);
    });

    it('should return project path', () => {
      expect(strategy.getProjectPath()).toBe(projectPath);
    });

    it('should return debounce delay', () => {
      expect(strategy.getDebounceDelay()).toBe(3000);
    });

    it('should return flushing state', () => {
      expect(strategy.isFlushing()).toBe(false);
    });
  });

  describe('Constants Export', () => {
    it('should export DEFAULT_GIT_DEBOUNCE_DELAY', () => {
      expect(DEFAULT_GIT_DEBOUNCE_DELAY).toBe(2000);
    });
  });
});
