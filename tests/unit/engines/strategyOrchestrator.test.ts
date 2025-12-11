/**
 * Strategy Orchestrator Tests
 *
 * Unit tests covering:
 * - Orchestrator creation
 * - Strategy creation via factory method
 * - Strategy lifecycle management (setStrategy, stop)
 * - Strategy switching (flush before switch, no data loss)
 * - Public interface (getCurrentStrategy, flush, getStats, isActive)
 * - Cleanup handler registration
 * - Idempotent behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  StrategyOrchestrator,
  createStrategyOrchestrator,
  StrategyOrchestratorDependencies,
} from '../../../src/engines/strategyOrchestrator.js';
import {
  IndexingStrategy,
  StrategyStats,
} from '../../../src/engines/indexingStrategy.js';
import { IndexManager } from '../../../src/engines/indexManager.js';
import { DocsIndexManager } from '../../../src/engines/docsIndexManager.js';
import { IntegrityEngine, DriftReport, ReconcileResult } from '../../../src/engines/integrity.js';
import { IndexingPolicy } from '../../../src/engines/indexPolicy.js';
import { FingerprintsManager } from '../../../src/storage/fingerprints.js';
import { DocsFingerprintsManager } from '../../../src/storage/docsFingerprints.js';
import { Config, DEFAULT_CONFIG } from '../../../src/storage/config.js';
import { resetCleanupRegistry } from '../../../src/utils/cleanup.js';

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
  const gitDir = path.join(projectPath, '.git');
  await fs.promises.mkdir(gitDir, { recursive: true });
  const logsDir = path.join(gitDir, 'logs');
  await fs.promises.mkdir(logsDir, { recursive: true });
  const headFile = path.join(logsDir, 'HEAD');
  await fs.promises.writeFile(headFile, '# Git reflog HEAD\n', 'utf-8');
}

/**
 * Create a basic project structure
 */
async function createProjectStructure(projectPath: string): Promise<void> {
  await fs.promises.writeFile(
    path.join(projectPath, 'index.ts'),
    'export function main() {}\n',
    'utf-8'
  );
}

/**
 * Create a mock IndexManager
 */
function createMockIndexManager(): IndexManager {
  return {
    updateFile: vi.fn().mockResolvedValue(undefined),
    removeFile: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ fileCount: 10, chunkCount: 100 }),
    getProjectPath: vi.fn().mockReturnValue('/mock/path'),
    getIndexPath: vi.fn().mockReturnValue('/mock/index'),
    isLoaded: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as IndexManager;
}

/**
 * Create a mock DocsIndexManager
 */
function createMockDocsIndexManager(): DocsIndexManager {
  return {
    updateDocFile: vi.fn().mockResolvedValue(undefined),
    removeDocFile: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ fileCount: 5, chunkCount: 50 }),
    getProjectPath: vi.fn().mockReturnValue('/mock/path'),
    getIndexPath: vi.fn().mockReturnValue('/mock/index'),
    isLoaded: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as DocsIndexManager;
}

/**
 * Create a mock IntegrityEngine
 */
function createMockIntegrityEngine(projectPath?: string): IntegrityEngine {
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
    getProjectPath: vi.fn().mockReturnValue(projectPath ?? '/mock/path'),
    getIndexPath: vi.fn().mockReturnValue('/mock/index'),
    isIndexingActive: vi.fn().mockReturnValue(false),
    setIndexingActive: vi.fn(),
    startPeriodicCheck: vi.fn(),
    stopPeriodicCheck: vi.fn(),
    isPeriodicCheckRunning: vi.fn().mockReturnValue(false),
    getScheduler: vi.fn().mockReturnValue(null),
  } as unknown as IntegrityEngine;
}

/**
 * Create a mock IndexingPolicy
 */
function createMockPolicy(): IndexingPolicy {
  return {
    shouldIndex: vi.fn().mockResolvedValue({ shouldIndex: true, reason: null }),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    getProjectPath: vi.fn().mockReturnValue('/mock/path'),
  } as unknown as IndexingPolicy;
}

/**
 * Create a mock FingerprintsManager
 */
function createMockFingerprints(): FingerprintsManager {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(false),
    isLoaded: vi.fn().mockReturnValue(true),
    count: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    getAll: vi.fn().mockReturnValue(new Map()),
    hasUnsavedChanges: vi.fn().mockReturnValue(false),
    getIndexPath: vi.fn().mockReturnValue('/mock/index'),
    getProjectPath: vi.fn().mockReturnValue('/mock/path'),
  } as unknown as FingerprintsManager;
}

/**
 * Create a mock DocsFingerprintsManager
 */
function createMockDocsFingerprints(): DocsFingerprintsManager {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(false),
    isLoaded: vi.fn().mockReturnValue(true),
    count: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    getAll: vi.fn().mockReturnValue(new Map()),
    hasUnsavedChanges: vi.fn().mockReturnValue(false),
    getIndexPath: vi.fn().mockReturnValue('/mock/index'),
    getProjectPath: vi.fn().mockReturnValue('/mock/path'),
  } as unknown as DocsFingerprintsManager;
}

/**
 * Create default test config
 */
function createConfig(overrides?: Partial<Config>): Config {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

/**
 * Create mock dependencies for orchestrator
 */
function createMockDependencies(
  projectPath: string,
  indexPath: string
): StrategyOrchestratorDependencies {
  return {
    projectPath,
    indexPath,
    indexManager: createMockIndexManager(),
    docsIndexManager: createMockDocsIndexManager(),
    integrityEngine: createMockIntegrityEngine(projectPath),
    policy: createMockPolicy(),
    fingerprints: createMockFingerprints(),
    docsFingerprints: createMockDocsFingerprints(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('StrategyOrchestrator', () => {
  let projectPath: string;
  let indexPath: string;
  let deps: StrategyOrchestratorDependencies;
  let orchestrator: StrategyOrchestrator;

  beforeEach(async () => {
    // Reset cleanup registry between tests
    resetCleanupRegistry();

    projectPath = await createTempDir('orchestrator-test-project-');
    indexPath = await createTempDir('orchestrator-test-index-');
    await createProjectStructure(projectPath);
    await createGitRepo(projectPath);
    deps = createMockDependencies(projectPath, indexPath);
  });

  afterEach(async () => {
    if (orchestrator?.isActive()) {
      await orchestrator.stop();
    }
    await removeTempDir(projectPath);
    await removeTempDir(indexPath);
  });

  describe('Constructor', () => {
    it('should create an instance with dependencies', () => {
      orchestrator = new StrategyOrchestrator(deps);

      expect(orchestrator).toBeInstanceOf(StrategyOrchestrator);
      expect(orchestrator.getProjectPath()).toBe(projectPath);
      expect(orchestrator.getIndexPath()).toBe(indexPath);
    });

    it('should have no strategy active initially', () => {
      orchestrator = new StrategyOrchestrator(deps);

      expect(orchestrator.getCurrentStrategy()).toBe(null);
      expect(orchestrator.isActive()).toBe(false);
    });

    it('should return null from getStats when no strategy is active', () => {
      orchestrator = new StrategyOrchestrator(deps);

      expect(orchestrator.getStats()).toBe(null);
    });
  });

  describe('setStrategy()', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    describe('Realtime Strategy', () => {
      it('should start realtime strategy', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

        expect(orchestrator.getCurrentStrategy()).not.toBe(null);
        expect(orchestrator.getCurrentStrategy()?.name).toBe('realtime');
        expect(orchestrator.isActive()).toBe(true);
      });

      it('should report realtime in stats', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

        const stats = orchestrator.getStats();
        expect(stats).not.toBe(null);
        expect(stats?.name).toBe('realtime');
        expect(stats?.isActive).toBe(true);
      });
    });

    describe('Lazy Strategy', () => {
      it('should start lazy strategy', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));

        expect(orchestrator.getCurrentStrategy()).not.toBe(null);
        expect(orchestrator.getCurrentStrategy()?.name).toBe('lazy');
        expect(orchestrator.isActive()).toBe(true);
      });

      it('should report lazy in stats', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));

        const stats = orchestrator.getStats();
        expect(stats).not.toBe(null);
        expect(stats?.name).toBe('lazy');
      });
    });

    describe('Git Strategy', () => {
      it('should start git strategy for git repository', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'git' }));

        expect(orchestrator.getCurrentStrategy()).not.toBe(null);
        expect(orchestrator.getCurrentStrategy()?.name).toBe('git');
        expect(orchestrator.isActive()).toBe(true);
      });

      it('should throw for non-git repository', async () => {
        // Create a non-git project
        const nonGitPath = await createTempDir('non-git-project-');
        await createProjectStructure(nonGitPath);

        const nonGitDeps = createMockDependencies(nonGitPath, indexPath);
        const nonGitOrchestrator = new StrategyOrchestrator(nonGitDeps);

        await expect(
          nonGitOrchestrator.setStrategy(createConfig({ indexingStrategy: 'git' }))
        ).rejects.toThrow('Not a git repository');

        await removeTempDir(nonGitPath);
      });

      it('should report git in stats', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'git' }));

        const stats = orchestrator.getStats();
        expect(stats).not.toBe(null);
        expect(stats?.name).toBe('git');
      });
    });

    describe('Unknown Strategy', () => {
      it('should throw for unknown strategy name', async () => {
        const invalidConfig = {
          ...createConfig(),
          indexingStrategy: 'unknown' as any,
        };

        await expect(orchestrator.setStrategy(invalidConfig)).rejects.toThrow(
          'Unknown indexing strategy: unknown'
        );
      });
    });

    describe('Idempotent Behavior', () => {
      it('should be idempotent - calling with same strategy is no-op', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
        const firstStrategy = orchestrator.getCurrentStrategy();

        // Call again with same config
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
        const secondStrategy = orchestrator.getCurrentStrategy();

        // Should be the same strategy instance
        expect(secondStrategy).toBe(firstStrategy);
      });

      it('should skip if same strategy name and active', async () => {
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
        const originalStrategy = orchestrator.getCurrentStrategy();

        // Try to set the same strategy again
        await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));

        // Strategy should not have changed
        expect(orchestrator.getCurrentStrategy()).toBe(originalStrategy);
      });
    });
  });

  describe('Strategy Switching', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should stop old strategy when switching', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      const firstStrategy = orchestrator.getCurrentStrategy();

      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
      const secondStrategy = orchestrator.getCurrentStrategy();

      // First strategy should have been stopped
      expect(firstStrategy?.isActive()).toBe(false);
      // Second strategy should be active
      expect(secondStrategy?.isActive()).toBe(true);
      expect(secondStrategy?.name).toBe('lazy');
    });

    it('should flush old strategy before switching', async () => {
      // Start with lazy strategy
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
      const lazyStrategy = orchestrator.getCurrentStrategy();
      const flushSpy = vi.spyOn(lazyStrategy!, 'flush');

      // Switch to realtime
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

      // Flush should have been called before switching
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should switch from realtime to lazy', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      expect(orchestrator.getCurrentStrategy()?.name).toBe('realtime');

      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
      expect(orchestrator.getCurrentStrategy()?.name).toBe('lazy');
    });

    it('should switch from lazy to git', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
      expect(orchestrator.getCurrentStrategy()?.name).toBe('lazy');

      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'git' }));
      expect(orchestrator.getCurrentStrategy()?.name).toBe('git');
    });

    it('should switch from git to realtime', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'git' }));
      expect(orchestrator.getCurrentStrategy()?.name).toBe('git');

      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      expect(orchestrator.getCurrentStrategy()?.name).toBe('realtime');
    });
  });

  describe('flush()', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should delegate to current strategy flush', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
      const strategy = orchestrator.getCurrentStrategy();
      const flushSpy = vi.spyOn(strategy!, 'flush');

      await orchestrator.flush();

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should be safe to call when no strategy is active', async () => {
      // No strategy set yet
      await expect(orchestrator.flush()).resolves.not.toThrow();
    });

    it('should be safe to call after strategy stopped', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      await orchestrator.stop();

      await expect(orchestrator.flush()).resolves.not.toThrow();
    });
  });

  describe('stop()', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should stop the current strategy', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      expect(orchestrator.isActive()).toBe(true);

      await orchestrator.stop();

      expect(orchestrator.isActive()).toBe(false);
      expect(orchestrator.getCurrentStrategy()).toBe(null);
    });

    it('should flush before stopping', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
      const strategy = orchestrator.getCurrentStrategy();
      const flushSpy = vi.spyOn(strategy!, 'flush');

      await orchestrator.stop();

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should be safe to call when no strategy is active', async () => {
      await expect(orchestrator.stop()).resolves.not.toThrow();
    });

    it('should be idempotent - multiple stops are safe', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      await orchestrator.stop();
      await expect(orchestrator.stop()).resolves.not.toThrow();
    });
  });

  describe('getCurrentStrategy()', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should return null when no strategy is active', () => {
      expect(orchestrator.getCurrentStrategy()).toBe(null);
    });

    it('should return the current strategy when active', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

      const strategy = orchestrator.getCurrentStrategy();
      expect(strategy).not.toBe(null);
      expect(strategy?.name).toBe('realtime');
    });

    it('should return null after stop', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      await orchestrator.stop();

      expect(orchestrator.getCurrentStrategy()).toBe(null);
    });
  });

  describe('getStats()', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should return null when no strategy is active', () => {
      expect(orchestrator.getStats()).toBe(null);
    });

    it('should return valid StrategyStats when strategy is active', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

      const stats = orchestrator.getStats();
      expect(stats).not.toBe(null);
      expect(stats?.name).toBe('realtime');
      expect(typeof stats?.isActive).toBe('boolean');
      expect(typeof stats?.pendingFiles).toBe('number');
      expect(typeof stats?.processedFiles).toBe('number');
    });

    it('should reflect strategy state changes', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));

      const stats1 = orchestrator.getStats();
      expect(stats1?.isActive).toBe(true);

      await orchestrator.stop();

      const stats2 = orchestrator.getStats();
      expect(stats2).toBe(null);
    });
  });

  describe('isActive()', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should return false initially', () => {
      expect(orchestrator.isActive()).toBe(false);
    });

    it('should return true after setting strategy', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

      expect(orchestrator.isActive()).toBe(true);
    });

    it('should return false after stopping', async () => {
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      await orchestrator.stop();

      expect(orchestrator.isActive()).toBe(false);
    });
  });

  describe('Accessors', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should return project path', () => {
      expect(orchestrator.getProjectPath()).toBe(projectPath);
    });

    it('should return index path', () => {
      expect(orchestrator.getIndexPath()).toBe(indexPath);
    });
  });

  describe('Factory Function', () => {
    it('should create StrategyOrchestrator with dependencies', () => {
      const result = createStrategyOrchestrator(deps);

      expect(result).toBeInstanceOf(StrategyOrchestrator);
      expect(result.getProjectPath()).toBe(projectPath);
      expect(result.getIndexPath()).toBe(indexPath);
    });

    it('should create orchestrator without active strategy', () => {
      const result = createStrategyOrchestrator(deps);

      expect(result.getCurrentStrategy()).toBe(null);
      expect(result.isActive()).toBe(false);
    });
  });

  describe('Null DocsIndexManager', () => {
    it('should work without docsIndexManager', async () => {
      const noDocs: StrategyOrchestratorDependencies = {
        ...deps,
        docsIndexManager: null,
        docsFingerprints: null,
      };

      orchestrator = new StrategyOrchestrator(noDocs);
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

      expect(orchestrator.isActive()).toBe(true);
      expect(orchestrator.getCurrentStrategy()?.name).toBe('realtime');
    });

    it('should work with lazy strategy without docsIndexManager', async () => {
      const noDocs: StrategyOrchestratorDependencies = {
        ...deps,
        docsIndexManager: null,
        docsFingerprints: null,
      };

      orchestrator = new StrategyOrchestrator(noDocs);
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));

      expect(orchestrator.isActive()).toBe(true);
      expect(orchestrator.getCurrentStrategy()?.name).toBe('lazy');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      orchestrator = new StrategyOrchestrator(deps);
    });

    it('should handle rapid strategy switching', async () => {
      // Rapidly switch strategies
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'lazy' }));
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'git' }));
      await orchestrator.setStrategy(createConfig({ indexingStrategy: 'realtime' }));

      // Should end up with realtime
      expect(orchestrator.getCurrentStrategy()?.name).toBe('realtime');
      expect(orchestrator.isActive()).toBe(true);
    });

    it('should handle stop after failed strategy start', async () => {
      // Create a non-git project
      const nonGitPath = await createTempDir('non-git-edge-');
      await createProjectStructure(nonGitPath);

      const nonGitDeps = createMockDependencies(nonGitPath, indexPath);
      const nonGitOrchestrator = new StrategyOrchestrator(nonGitDeps);

      // Try to start git strategy (will fail)
      try {
        await nonGitOrchestrator.setStrategy(createConfig({ indexingStrategy: 'git' }));
      } catch {
        // Expected to fail
      }

      // Stop should still work
      await expect(nonGitOrchestrator.stop()).resolves.not.toThrow();

      await removeTempDir(nonGitPath);
    });
  });
});
