/**
 * Integrity Engine Tests
 *
 * Tests covering:
 * - Drift detection (scanCurrentState, calculateDrift)
 * - Reconciliation (reconcile function)
 * - IntegrityScheduler (start, stop, runNow)
 * - IntegrityEngine class
 * - Startup check functions
 * - Factory function
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DriftReport,
  ReconcileResult,
  ReconcileProgress,
  ReconcileProgressCallback,
  DEFAULT_CHECK_INTERVAL,
  scanCurrentState,
  calculateDrift,
  reconcile,
  IntegrityScheduler,
  IntegrityEngine,
  runStartupCheck,
  runStartupCheckBackground,
  createIntegrityEngine,
} from '../../../src/engines/integrity.js';
import { IndexManager, createFullIndex } from '../../../src/engines/indexManager.js';
import { IndexingPolicy } from '../../../src/engines/indexPolicy.js';
import { FingerprintsManager } from '../../../src/storage/fingerprints.js';
import { Config, DEFAULT_CONFIG } from '../../../src/storage/config.js';

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

describe('Integrity Engine', () => {
  describe('Constants', () => {
    it('should have DEFAULT_CHECK_INTERVAL of 24 hours', () => {
      expect(DEFAULT_CHECK_INTERVAL).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('scanCurrentState', () => {
    let projectPath: string;
    let policy: IndexingPolicy;

    beforeEach(async () => {
      projectPath = await createTempDir('scan-test-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();
    }, 30000);

    afterEach(async () => {
      await removeTempDir(projectPath);
    });

    it('should return a Map of relative paths to content hashes', async () => {
      const state = await scanCurrentState(projectPath, policy);

      expect(state).toBeInstanceOf(Map);
      expect(state.size).toBeGreaterThan(0);
    });

    it('should include indexable files', async () => {
      const state = await scanCurrentState(projectPath, policy);

      // Should include src/index.ts
      expect(state.has('src/index.ts')).toBe(true);
      // Should include README.md
      expect(state.has('README.md')).toBe(true);
    });

    it('should exclude files matching hardcoded deny patterns', async () => {
      // Create a file in node_modules
      await createFile(projectPath, 'node_modules/test/index.js', 'test');

      const state = await scanCurrentState(projectPath, policy);

      expect(state.has('node_modules/test/index.js')).toBe(false);
    });

    it('should exclude files matching user exclude patterns', async () => {
      const configWithExclude: Config = {
        ...DEFAULT_CONFIG,
        exclude: ['**/*.test.ts'],
      };
      const policyWithExclude = new IndexingPolicy(projectPath, configWithExclude);
      await policyWithExclude.initialize();

      // Create a test file
      await createFile(projectPath, 'src/helper.test.ts', 'test content');

      const state = await scanCurrentState(projectPath, policyWithExclude);

      expect(state.has('src/helper.test.ts')).toBe(false);
    });

    it('should return SHA256 hashes as values', async () => {
      const state = await scanCurrentState(projectPath, policy);

      for (const [, hash] of state) {
        // SHA256 hash is 64 hex characters
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('should handle empty directories', async () => {
      const emptyDir = await createTempDir('empty-scan-');
      const emptyConfig: Config = { ...DEFAULT_CONFIG };
      const emptyPolicy = new IndexingPolicy(emptyDir, emptyConfig);

      const state = await scanCurrentState(emptyDir, emptyPolicy);

      expect(state.size).toBe(0);

      await removeTempDir(emptyDir);
    });
  });

  describe('calculateDrift', () => {
    let projectPath: string;
    let indexPath: string;
    let fingerprints: FingerprintsManager;
    let policy: IndexingPolicy;

    beforeEach(async () => {
      projectPath = await createTempDir('drift-test-project-');
      indexPath = await createTempDir('drift-test-index-');
      await createTestProject(projectPath);

      // Create index to populate fingerprints
      await createFullIndex(projectPath, indexPath);

      // Initialize components
      const config: Config = { ...DEFAULT_CONFIG };
      policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      fingerprints = new FingerprintsManager(indexPath, projectPath);
      await fingerprints.load();
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should return a DriftReport', async () => {
      const drift = await calculateDrift(projectPath, fingerprints, policy);

      expect(drift).toHaveProperty('added');
      expect(drift).toHaveProperty('modified');
      expect(drift).toHaveProperty('removed');
      expect(drift).toHaveProperty('inSync');
      expect(drift).toHaveProperty('lastChecked');
    });

    it('should detect no drift when index is in sync', async () => {
      const drift = await calculateDrift(projectPath, fingerprints, policy);

      expect(drift.added).toHaveLength(0);
      expect(drift.modified).toHaveLength(0);
      expect(drift.removed).toHaveLength(0);
      expect(drift.inSync).toBeGreaterThan(0);
    });

    it('should detect added files', async () => {
      // Add a new file
      await createFile(projectPath, 'src/newfile.ts', 'export const x = 1;');

      const drift = await calculateDrift(projectPath, fingerprints, policy);

      expect(drift.added).toContain('src/newfile.ts');
    });

    it('should detect modified files', async () => {
      // Modify an existing file
      const filePath = path.join(projectPath, 'src/index.ts');
      const content = await fs.promises.readFile(filePath, 'utf-8');
      await fs.promises.writeFile(filePath, content + '\n// Modified', 'utf-8');

      const drift = await calculateDrift(projectPath, fingerprints, policy);

      expect(drift.modified).toContain('src/index.ts');
    });

    it('should detect removed files', async () => {
      // Remove an existing file
      const filePath = path.join(projectPath, 'src/utils/helper.ts');
      await fs.promises.unlink(filePath);

      const drift = await calculateDrift(projectPath, fingerprints, policy);

      expect(drift.removed).toContain('src/utils/helper.ts');
    });

    it('should have lastChecked as a Date', async () => {
      const before = new Date();
      const drift = await calculateDrift(projectPath, fingerprints, policy);
      const after = new Date();

      expect(drift.lastChecked).toBeInstanceOf(Date);
      expect(drift.lastChecked.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(drift.lastChecked.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should correctly count in-sync files', async () => {
      const drift = await calculateDrift(projectPath, fingerprints, policy);

      // Should match the number of indexed files
      expect(drift.inSync).toBe(fingerprints.count());
    });
  });

  describe('reconcile', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let fingerprints: FingerprintsManager;
    let policy: IndexingPolicy;

    beforeEach(async () => {
      projectPath = await createTempDir('reconcile-test-project-');
      indexPath = await createTempDir('reconcile-test-index-');
      await createTestProject(projectPath);

      // Create index
      await createFullIndex(projectPath, indexPath);

      // Initialize components
      const config: Config = { ...DEFAULT_CONFIG };
      policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      indexManager = new IndexManager(projectPath, indexPath);
      fingerprints = new FingerprintsManager(indexPath, projectPath);
      await fingerprints.load();
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should return ReconcileResult', async () => {
      const result = await reconcile(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('filesAdded');
      expect(result).toHaveProperty('filesModified');
      expect(result).toHaveProperty('filesRemoved');
      expect(result).toHaveProperty('durationMs');
    });

    it('should succeed with no drift', async () => {
      const result = await reconcile(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );

      expect(result.success).toBe(true);
      expect(result.filesAdded).toBe(0);
      expect(result.filesModified).toBe(0);
      expect(result.filesRemoved).toBe(0);
    });

    it('should reconcile added files', async () => {
      // Add a new file
      await createFile(projectPath, 'src/added.ts', 'export const added = true;');

      const result = await reconcile(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );

      expect(result.success).toBe(true);
      expect(result.filesAdded).toBe(1);

      // Verify file is now in fingerprints
      await fingerprints.load();
      expect(fingerprints.has('src/added.ts')).toBe(true);
    }, 60000);

    it('should reconcile modified files', async () => {
      // Modify an existing file
      const filePath = path.join(projectPath, 'src/index.ts');
      const content = await fs.promises.readFile(filePath, 'utf-8');
      await fs.promises.writeFile(filePath, content + '\n// Reconcile test', 'utf-8');

      const result = await reconcile(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );

      expect(result.success).toBe(true);
      expect(result.filesModified).toBe(1);
    }, 60000);

    it('should reconcile removed files', async () => {
      // Remove an existing file
      const filePath = path.join(projectPath, 'README.md');
      await fs.promises.unlink(filePath);

      const result = await reconcile(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );

      expect(result.success).toBe(true);
      expect(result.filesRemoved).toBe(1);

      // Verify file is no longer in fingerprints
      await fingerprints.load();
      expect(fingerprints.has('README.md')).toBe(false);
    }, 60000);

    it('should call progress callback', async () => {
      // Add a file to trigger some work
      await createFile(projectPath, 'src/progress.ts', 'export const progress = 1;');

      const progressUpdates: ReconcileProgress[] = [];
      const onProgress: ReconcileProgressCallback = (progress) => {
        progressUpdates.push({ ...progress });
      };

      await reconcile(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy,
        onProgress
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
    }, 60000);

    it('should record duration in milliseconds', async () => {
      const result = await reconcile(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('IntegrityScheduler', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let fingerprints: FingerprintsManager;
    let policy: IndexingPolicy;
    let engine: IntegrityEngine;
    let scheduler: IntegrityScheduler;

    beforeEach(async () => {
      projectPath = await createTempDir('scheduler-test-project-');
      indexPath = await createTempDir('scheduler-test-index-');
      await createTestProject(projectPath);

      // Create index
      await createFullIndex(projectPath, indexPath);

      // Initialize components
      const config: Config = { ...DEFAULT_CONFIG };
      policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      indexManager = new IndexManager(projectPath, indexPath);
      fingerprints = new FingerprintsManager(indexPath, projectPath);
      await fingerprints.load();

      engine = new IntegrityEngine(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );
    }, 60000);

    afterEach(async () => {
      if (scheduler && scheduler.isSchedulerRunning()) {
        scheduler.stop();
      }
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should create scheduler with default interval', () => {
      scheduler = new IntegrityScheduler(engine, DEFAULT_CHECK_INTERVAL);

      expect(scheduler.getCheckInterval()).toBe(DEFAULT_CHECK_INTERVAL);
      expect(scheduler.isSchedulerRunning()).toBe(false);
    });

    it('should create scheduler with custom interval', () => {
      const customInterval = 60 * 1000; // 1 minute
      scheduler = new IntegrityScheduler(engine, customInterval);

      expect(scheduler.getCheckInterval()).toBe(customInterval);
    });

    it('should start periodic checks', () => {
      scheduler = new IntegrityScheduler(engine, 1000);

      scheduler.start();

      expect(scheduler.isSchedulerRunning()).toBe(true);
    });

    it('should stop periodic checks', () => {
      scheduler = new IntegrityScheduler(engine, 1000);

      scheduler.start();
      expect(scheduler.isSchedulerRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isSchedulerRunning()).toBe(false);
    });

    it('should handle multiple start calls gracefully', () => {
      scheduler = new IntegrityScheduler(engine, 1000);

      scheduler.start();
      scheduler.start(); // Should be ignored

      expect(scheduler.isSchedulerRunning()).toBe(true);
    });

    it('should handle stop when not started', () => {
      scheduler = new IntegrityScheduler(engine, 1000);

      // Should not throw
      scheduler.stop();

      expect(scheduler.isSchedulerRunning()).toBe(false);
    });

    it('should run check immediately with runNow', async () => {
      scheduler = new IntegrityScheduler(engine, 1000);

      const drift = await scheduler.runNow();

      expect(drift).toHaveProperty('added');
      expect(drift).toHaveProperty('modified');
      expect(drift).toHaveProperty('removed');
      expect(drift).toHaveProperty('inSync');
    });

    it('should update lastCheckTime after runNow', async () => {
      scheduler = new IntegrityScheduler(engine, 1000);

      expect(scheduler.getLastCheckTime()).toBeNull();

      await scheduler.runNow();

      expect(scheduler.getLastCheckTime()).toBeInstanceOf(Date);
    });
  });

  describe('IntegrityEngine class', () => {
    let projectPath: string;
    let indexPath: string;
    let indexManager: IndexManager;
    let fingerprints: FingerprintsManager;
    let policy: IndexingPolicy;
    let engine: IntegrityEngine;

    beforeEach(async () => {
      projectPath = await createTempDir('engine-test-project-');
      indexPath = await createTempDir('engine-test-index-');
      await createTestProject(projectPath);

      // Create index
      await createFullIndex(projectPath, indexPath);

      // Initialize components
      const config: Config = { ...DEFAULT_CONFIG };
      policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      indexManager = new IndexManager(projectPath, indexPath);
      fingerprints = new FingerprintsManager(indexPath, projectPath);
      await fingerprints.load();

      engine = new IntegrityEngine(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );
    }, 60000);

    afterEach(async () => {
      engine.stopPeriodicCheck();
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    describe('constructor', () => {
      it('should create engine with correct properties', () => {
        expect(engine.getProjectPath()).toBe(projectPath);
        expect(engine.getIndexPath()).toBe(indexPath);
      });

      it('should initially not be indexing', () => {
        expect(engine.isIndexingActive()).toBe(false);
      });

      it('should initially not have periodic check running', () => {
        expect(engine.isPeriodicCheckRunning()).toBe(false);
      });
    });

    describe('checkDrift', () => {
      it('should return DriftReport', async () => {
        const drift = await engine.checkDrift();

        expect(drift).toHaveProperty('added');
        expect(drift).toHaveProperty('modified');
        expect(drift).toHaveProperty('removed');
        expect(drift).toHaveProperty('inSync');
        expect(drift).toHaveProperty('lastChecked');
      });

      it('should detect no drift when in sync', async () => {
        const drift = await engine.checkDrift();

        expect(drift.added).toHaveLength(0);
        expect(drift.modified).toHaveLength(0);
        expect(drift.removed).toHaveLength(0);
      });

      it('should detect added files', async () => {
        await createFile(projectPath, 'src/check.ts', 'export const check = 1;');

        const drift = await engine.checkDrift();

        expect(drift.added).toContain('src/check.ts');
      });
    });

    describe('reconcile', () => {
      it('should reconcile drift', async () => {
        await createFile(projectPath, 'src/reconcile.ts', 'export const reconcile = 1;');

        const result = await engine.reconcile();

        expect(result.success).toBe(true);
        expect(result.filesAdded).toBe(1);
      }, 60000);

      it('should prevent concurrent reconciliation', async () => {
        // Set indexing active
        engine.setIndexingActive(true);

        const result = await engine.reconcile();

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Indexing is already in progress');

        // Clean up
        engine.setIndexingActive(false);
      });

      it('should accept progress callback', async () => {
        await createFile(projectPath, 'src/callback.ts', 'export const callback = 1;');

        const progressUpdates: ReconcileProgress[] = [];
        const result = await engine.reconcile((progress) => {
          progressUpdates.push({ ...progress });
        });

        expect(result.success).toBe(true);
      }, 60000);
    });

    describe('periodic checks', () => {
      it('should start periodic checks', () => {
        engine.startPeriodicCheck(1000);

        expect(engine.isPeriodicCheckRunning()).toBe(true);
      });

      it('should stop periodic checks', () => {
        engine.startPeriodicCheck(1000);
        engine.stopPeriodicCheck();

        expect(engine.isPeriodicCheckRunning()).toBe(false);
      });

      it('should handle multiple start calls gracefully', () => {
        engine.startPeriodicCheck(1000);
        engine.startPeriodicCheck(1000); // Should be ignored

        expect(engine.isPeriodicCheckRunning()).toBe(true);
      });

      it('should use default interval when not specified', () => {
        engine.startPeriodicCheck();

        expect(engine.isPeriodicCheckRunning()).toBe(true);
      });

      it('should accept custom interval', () => {
        engine.startPeriodicCheck(60000);

        expect(engine.isPeriodicCheckRunning()).toBe(true);
      });

      it('should provide scheduler access', () => {
        engine.startPeriodicCheck(1000);

        const scheduler = engine.getScheduler();
        expect(scheduler).not.toBeNull();
        expect(scheduler?.getCheckInterval()).toBe(1000);
      });
    });

    describe('isIndexingActive', () => {
      it('should return false initially', () => {
        expect(engine.isIndexingActive()).toBe(false);
      });

      it('should be settable via setIndexingActive', () => {
        engine.setIndexingActive(true);
        expect(engine.isIndexingActive()).toBe(true);

        engine.setIndexingActive(false);
        expect(engine.isIndexingActive()).toBe(false);
      });
    });
  });

  describe('runStartupCheck', () => {
    let projectPath: string;
    let indexPath: string;
    let engine: IntegrityEngine;

    beforeEach(async () => {
      projectPath = await createTempDir('startup-test-project-');
      indexPath = await createTempDir('startup-test-index-');
      await createTestProject(projectPath);

      // Create index
      await createFullIndex(projectPath, indexPath);

      // Initialize components
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const indexManager = new IndexManager(projectPath, indexPath);
      const fingerprints = new FingerprintsManager(indexPath, projectPath);
      await fingerprints.load();

      engine = new IntegrityEngine(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );
    }, 60000);

    afterEach(async () => {
      engine.stopPeriodicCheck();
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should return DriftReport', async () => {
      const drift = await runStartupCheck(engine);

      expect(drift).toHaveProperty('added');
      expect(drift).toHaveProperty('modified');
      expect(drift).toHaveProperty('removed');
      expect(drift).toHaveProperty('inSync');
      expect(drift).toHaveProperty('lastChecked');
    });

    it('should detect drift on startup', async () => {
      // Add a file to create drift
      await createFile(projectPath, 'src/startup.ts', 'export const startup = 1;');

      const drift = await runStartupCheck(engine);

      expect(drift.added).toContain('src/startup.ts');
    });

    it('should return empty report on error', async () => {
      // Create a broken engine by using invalid paths
      const brokenEngine = new IntegrityEngine(
        '/nonexistent/path',
        '/nonexistent/index',
        new IndexManager('/nonexistent/path'),
        new FingerprintsManager('/nonexistent/index', '/nonexistent/path'),
        new IndexingPolicy('/nonexistent/path', DEFAULT_CONFIG)
      );

      const drift = await runStartupCheck(brokenEngine);

      // Should return empty report rather than throwing
      expect(drift.added).toHaveLength(0);
      expect(drift.modified).toHaveLength(0);
      expect(drift.removed).toHaveLength(0);
    });
  });

  describe('runStartupCheckBackground', () => {
    let projectPath: string;
    let indexPath: string;
    let engine: IntegrityEngine;

    beforeEach(async () => {
      projectPath = await createTempDir('bg-test-project-');
      indexPath = await createTempDir('bg-test-index-');
      await createTestProject(projectPath);

      // Create index
      await createFullIndex(projectPath, indexPath);

      // Initialize components
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const indexManager = new IndexManager(projectPath, indexPath);
      const fingerprints = new FingerprintsManager(indexPath, projectPath);
      await fingerprints.load();

      engine = new IntegrityEngine(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );
    }, 60000);

    afterEach(async () => {
      engine.stopPeriodicCheck();
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should return immediately (non-blocking)', () => {
      // This should not throw and should return quickly
      const start = Date.now();
      runStartupCheckBackground(engine);
      const elapsed = Date.now() - start;

      // Should complete very quickly (under 100ms) since it's non-blocking
      expect(elapsed).toBeLessThan(100);
    });

    it('should eventually complete the check', async () => {
      runStartupCheckBackground(engine);

      // Wait for the background check to complete
      await delay(1000);

      // No direct way to verify, but should not have thrown
    });
  });

  describe('createIntegrityEngine factory', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('factory-test-project-');
      indexPath = await createTempDir('factory-test-index-');
      await createTestProject(projectPath);

      // Create index
      await createFullIndex(projectPath, indexPath);
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should create IntegrityEngine instance', async () => {
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      const indexManager = new IndexManager(projectPath, indexPath);
      const fingerprints = new FingerprintsManager(indexPath, projectPath);

      const engine = createIntegrityEngine(
        projectPath,
        indexPath,
        indexManager,
        fingerprints,
        policy
      );

      expect(engine).toBeInstanceOf(IntegrityEngine);
      expect(engine.getProjectPath()).toBe(projectPath);
      expect(engine.getIndexPath()).toBe(indexPath);
    });
  });

  describe('Type exports', () => {
    it('should export DriftReport interface', () => {
      const report: DriftReport = {
        added: ['file1.ts'],
        modified: ['file2.ts'],
        removed: ['file3.ts'],
        inSync: 10,
        lastChecked: new Date(),
      };

      expect(report.added).toHaveLength(1);
      expect(report.modified).toHaveLength(1);
      expect(report.removed).toHaveLength(1);
      expect(report.inSync).toBe(10);
      expect(report.lastChecked).toBeInstanceOf(Date);
    });

    it('should export ReconcileResult interface', () => {
      const result: ReconcileResult = {
        success: true,
        filesAdded: 1,
        filesModified: 2,
        filesRemoved: 3,
        durationMs: 1000,
      };

      expect(result.success).toBe(true);
      expect(result.filesAdded).toBe(1);
      expect(result.filesModified).toBe(2);
      expect(result.filesRemoved).toBe(3);
      expect(result.durationMs).toBe(1000);
    });

    it('should export ReconcileResult with errors', () => {
      const result: ReconcileResult = {
        success: false,
        filesAdded: 0,
        filesModified: 0,
        filesRemoved: 0,
        durationMs: 100,
        errors: ['Error 1', 'Error 2'],
      };

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should export ReconcileProgress interface', () => {
      const progress: ReconcileProgress = {
        phase: 'adding',
        current: 5,
        total: 10,
        currentFile: 'test.ts',
      };

      expect(progress.phase).toBe('adding');
      expect(progress.current).toBe(5);
      expect(progress.total).toBe(10);
      expect(progress.currentFile).toBe('test.ts');
    });

    it('should export ReconcileProgressCallback type', () => {
      const callback: ReconcileProgressCallback = (progress) => {
        expect(progress.phase).toBeDefined();
      };

      callback({ phase: 'scanning', current: 0, total: 1 });
    });
  });

  describe('scanCurrentState with AbortController (BUG #4 fix)', () => {
    let projectPath: string;
    let policy: IndexingPolicy;

    beforeEach(async () => {
      projectPath = await createTempDir('abort-test-');
      await createTestProject(projectPath);

      const config: Config = { ...DEFAULT_CONFIG };
      policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();
    }, 30000);

    afterEach(async () => {
      await removeTempDir(projectPath);
    });

    it('should complete normally and clear timeout on success', async () => {
      // This verifies that normal operation works with AbortController
      const state = await scanCurrentState(projectPath, policy);

      // Should return files without timeout issues
      expect(state).toBeInstanceOf(Map);
      expect(state.size).toBeGreaterThan(0);
    });

    it('should handle empty directories with AbortController', async () => {
      const emptyDir = await createTempDir('empty-abort-');
      const emptyConfig: Config = { ...DEFAULT_CONFIG };
      const emptyPolicy = new IndexingPolicy(emptyDir, emptyConfig);

      const state = await scanCurrentState(emptyDir, emptyPolicy);

      expect(state.size).toBe(0);

      await removeTempDir(emptyDir);
    });

    it('should return Map on success (timeout cleared properly)', async () => {
      // Run multiple scans to ensure timeouts are properly cleared
      for (let i = 0; i < 3; i++) {
        const state = await scanCurrentState(projectPath, policy);
        expect(state).toBeInstanceOf(Map);
        expect(state.size).toBeGreaterThan(0);
      }
    });
  });

  describe('runStartupCheckBackground error handling (BUG #21 fix)', () => {
    it('should handle synchronous errors gracefully', () => {
      // Create a mock engine that throws synchronously
      // This tests the Promise.resolve().then() pattern catches sync errors
      const mockEngine = {
        checkDrift: () => {
          throw new Error('Synchronous error');
        },
      } as unknown as IntegrityEngine;

      // Should not throw - errors are caught and logged
      expect(() => {
        runStartupCheckBackground(mockEngine);
      }).not.toThrow();
    });

    it('should handle engines with null properties', () => {
      // Test edge case where engine might be partially initialized
      const mockEngine = null as unknown as IntegrityEngine;

      // Should not throw due to Promise.resolve().then() pattern
      expect(() => {
        runStartupCheckBackground(mockEngine);
      }).not.toThrow();
    });
  });
});
