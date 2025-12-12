import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  CURRENT_VERSION,
  MetadataSchema,
  StatsSchema,
  DocsStatsSchema,
  EmbeddingModelInfoSchema,
  loadMetadata,
  saveMetadata,
  createMetadata,
  MetadataManager,
  type Metadata,
  type Stats,
  type DocsStats,
  type EmbeddingModelInfo,
} from '../../../src/storage/metadata.js';
import { ErrorCode } from '../../../src/errors/index.js';

// Mock the logger to avoid file system side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Metadata Manager', () => {
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

  describe('CURRENT_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(CURRENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be 1.0.0 initially', () => {
      expect(CURRENT_VERSION).toBe('1.0.0');
    });
  });

  // ==========================================================================
  // Stats Schema Tests
  // ==========================================================================

  describe('StatsSchema', () => {
    it('should accept valid stats', () => {
      const stats: Stats = {
        totalFiles: 100,
        totalChunks: 500,
        storageSizeBytes: 1024000,
      };

      const result = StatsSchema.safeParse(stats);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(stats);
      }
    });

    it('should accept zero values', () => {
      const stats: Stats = {
        totalFiles: 0,
        totalChunks: 0,
        storageSizeBytes: 0,
      };

      const result = StatsSchema.safeParse(stats);
      expect(result.success).toBe(true);
    });

    it('should reject negative values', () => {
      const stats = {
        totalFiles: -1,
        totalChunks: 500,
        storageSizeBytes: 1024000,
      };

      const result = StatsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer values', () => {
      const stats = {
        totalFiles: 100.5,
        totalChunks: 500,
        storageSizeBytes: 1024000,
      };

      const result = StatsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const stats = {
        totalFiles: 100,
        // Missing totalChunks and storageSizeBytes
      };

      const result = StatsSchema.safeParse(stats);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // DocsStats Schema Tests
  // ==========================================================================

  describe('DocsStatsSchema', () => {
    it('should accept valid docs stats', () => {
      const docsStats: DocsStats = {
        totalDocs: 50,
        totalDocChunks: 200,
        docsStorageSizeBytes: 512000,
      };

      const result = DocsStatsSchema.safeParse(docsStats);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(docsStats);
      }
    });

    it('should accept zero values', () => {
      const docsStats: DocsStats = {
        totalDocs: 0,
        totalDocChunks: 0,
        docsStorageSizeBytes: 0,
      };

      const result = DocsStatsSchema.safeParse(docsStats);
      expect(result.success).toBe(true);
    });

    it('should reject negative values', () => {
      const docsStats = {
        totalDocs: -1,
        totalDocChunks: 200,
        docsStorageSizeBytes: 512000,
      };

      const result = DocsStatsSchema.safeParse(docsStats);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer values', () => {
      const docsStats = {
        totalDocs: 50.5,
        totalDocChunks: 200,
        docsStorageSizeBytes: 512000,
      };

      const result = DocsStatsSchema.safeParse(docsStats);
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const docsStats = {
        totalDocs: 50,
        // Missing totalDocChunks and docsStorageSizeBytes
      };

      const result = DocsStatsSchema.safeParse(docsStats);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // EmbeddingModelInfo Schema Tests
  // ==========================================================================

  describe('EmbeddingModelInfoSchema', () => {
    it('should accept valid embedding model info', () => {
      const modelInfo: EmbeddingModelInfo = {
        codeModelName: 'Xenova/bge-small-en-v1.5',
        codeModelDimension: 384,
        docsModelName: 'Xenova/bge-base-en-v1.5',
        docsModelDimension: 768,
      };

      const result = EmbeddingModelInfoSchema.safeParse(modelInfo);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(modelInfo);
      }
    });

    it('should accept partial model info (code only)', () => {
      const modelInfo = {
        codeModelName: 'Xenova/bge-small-en-v1.5',
        codeModelDimension: 384,
      };

      const result = EmbeddingModelInfoSchema.safeParse(modelInfo);
      expect(result.success).toBe(true);
    });

    it('should accept partial model info (docs only)', () => {
      const modelInfo = {
        docsModelName: 'Xenova/bge-base-en-v1.5',
        docsModelDimension: 768,
      };

      const result = EmbeddingModelInfoSchema.safeParse(modelInfo);
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const modelInfo = {};
      const result = EmbeddingModelInfoSchema.safeParse(modelInfo);
      expect(result.success).toBe(true);
    });

    it('should reject non-positive dimension values', () => {
      const modelInfo = {
        codeModelName: 'Xenova/bge-small-en-v1.5',
        codeModelDimension: 0, // Invalid - must be positive
      };

      const result = EmbeddingModelInfoSchema.safeParse(modelInfo);
      expect(result.success).toBe(false);
    });

    it('should reject negative dimension values', () => {
      const modelInfo = {
        docsModelDimension: -1,
      };

      const result = EmbeddingModelInfoSchema.safeParse(modelInfo);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer dimension values', () => {
      const modelInfo = {
        codeModelDimension: 384.5,
      };

      const result = EmbeddingModelInfoSchema.safeParse(modelInfo);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Metadata Schema Tests
  // ==========================================================================

  describe('MetadataSchema', () => {
    const validMetadata: Metadata = {
      version: '1.0.0',
      projectPath: '/Users/dev/my-project',
      createdAt: '2025-01-15T10:30:00.000Z',
      lastFullIndex: '2025-01-15T10:30:00.000Z',
      stats: {
        totalFiles: 100,
        totalChunks: 500,
        storageSizeBytes: 1024000,
      },
    };

    it('should accept valid metadata', () => {
      const result = MetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validMetadata);
      }
    });

    it('should accept metadata with lastIncrementalUpdate', () => {
      const metadata = {
        ...validMetadata,
        lastIncrementalUpdate: '2025-01-16T12:00:00.000Z',
      };

      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lastIncrementalUpdate).toBe(
          '2025-01-16T12:00:00.000Z'
        );
      }
    });

    it('should allow lastIncrementalUpdate to be undefined', () => {
      const result = MetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lastIncrementalUpdate).toBeUndefined();
      }
    });

    it('should reject invalid datetime strings', () => {
      const metadata = {
        ...validMetadata,
        createdAt: 'not-a-date',
      };

      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should reject missing version', () => {
      const { version, ...metadataWithoutVersion } = validMetadata;
      const result = MetadataSchema.safeParse(metadataWithoutVersion);
      expect(result.success).toBe(false);
    });

    it('should reject missing projectPath', () => {
      const { projectPath, ...metadataWithoutPath } = validMetadata;
      const result = MetadataSchema.safeParse(metadataWithoutPath);
      expect(result.success).toBe(false);
    });

    it('should reject invalid stats', () => {
      const metadata = {
        ...validMetadata,
        stats: {
          totalFiles: -1, // Invalid
          totalChunks: 500,
          storageSizeBytes: 1024000,
        },
      };

      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should accept metadata with docsStats', () => {
      const metadata = {
        ...validMetadata,
        docsStats: {
          totalDocs: 25,
          totalDocChunks: 100,
          docsStorageSizeBytes: 256000,
        },
      };

      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.docsStats).toEqual({
          totalDocs: 25,
          totalDocChunks: 100,
          docsStorageSizeBytes: 256000,
        });
      }
    });

    it('should accept metadata with lastDocsIndex', () => {
      const metadata = {
        ...validMetadata,
        lastDocsIndex: '2025-01-16T14:00:00.000Z',
      };

      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lastDocsIndex).toBe('2025-01-16T14:00:00.000Z');
      }
    });

    it('should allow docsStats to be undefined', () => {
      const result = MetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.docsStats).toBeUndefined();
      }
    });

    it('should allow lastDocsIndex to be undefined', () => {
      const result = MetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lastDocsIndex).toBeUndefined();
      }
    });

    it('should reject invalid docsStats', () => {
      const metadata = {
        ...validMetadata,
        docsStats: {
          totalDocs: -1, // Invalid
          totalDocChunks: 100,
          docsStorageSizeBytes: 256000,
        },
      };

      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should reject invalid lastDocsIndex datetime', () => {
      const metadata = {
        ...validMetadata,
        lastDocsIndex: 'not-a-date',
      };

      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // createMetadata Tests
  // ==========================================================================

  describe('createMetadata', () => {
    it('should create metadata with current version', () => {
      const metadata = createMetadata('/test/project');
      expect(metadata.version).toBe(CURRENT_VERSION);
    });

    it('should set projectPath correctly', () => {
      const projectPath = '/Users/dev/my-project';
      const metadata = createMetadata(projectPath);
      expect(metadata.projectPath).toBe(projectPath);
    });

    it('should set createdAt to current time', () => {
      const before = new Date().toISOString();
      const metadata = createMetadata('/test/project');
      const after = new Date().toISOString();

      expect(metadata.createdAt >= before).toBe(true);
      expect(metadata.createdAt <= after).toBe(true);
    });

    it('should set lastFullIndex to same as createdAt', () => {
      const metadata = createMetadata('/test/project');
      expect(metadata.lastFullIndex).toBe(metadata.createdAt);
    });

    it('should leave lastIncrementalUpdate undefined', () => {
      const metadata = createMetadata('/test/project');
      expect(metadata.lastIncrementalUpdate).toBeUndefined();
    });

    it('should initialize stats to zero', () => {
      const metadata = createMetadata('/test/project');
      expect(metadata.stats).toEqual({
        totalFiles: 0,
        totalChunks: 0,
        storageSizeBytes: 0,
      });
    });

    it('should create valid metadata according to schema', () => {
      const metadata = createMetadata('/test/project');
      const result = MetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // loadMetadata Tests
  // ==========================================================================

  describe('loadMetadata', () => {
    it('should return null when no metadata file exists', async () => {
      const metadata = await loadMetadata(indexPath);
      expect(metadata).toBeNull();
    });

    it('should load valid metadata from file', async () => {
      const testMetadata: Metadata = {
        version: '1.0.0',
        projectPath: '/test/project',
        createdAt: '2025-01-15T10:30:00.000Z',
        lastFullIndex: '2025-01-15T10:30:00.000Z',
        stats: {
          totalFiles: 50,
          totalChunks: 200,
          storageSizeBytes: 512000,
        },
      };

      const metadataPath = path.join(indexPath, 'metadata.json');
      await fs.promises.writeFile(metadataPath, JSON.stringify(testMetadata));

      const loaded = await loadMetadata(indexPath);
      expect(loaded).toEqual(testMetadata);
    });

    it('should load metadata with lastIncrementalUpdate', async () => {
      const testMetadata: Metadata = {
        version: '1.0.0',
        projectPath: '/test/project',
        createdAt: '2025-01-15T10:30:00.000Z',
        lastFullIndex: '2025-01-15T10:30:00.000Z',
        lastIncrementalUpdate: '2025-01-16T12:00:00.000Z',
        stats: {
          totalFiles: 50,
          totalChunks: 200,
          storageSizeBytes: 512000,
        },
      };

      const metadataPath = path.join(indexPath, 'metadata.json');
      await fs.promises.writeFile(metadataPath, JSON.stringify(testMetadata));

      const loaded = await loadMetadata(indexPath);
      expect(loaded?.lastIncrementalUpdate).toBe('2025-01-16T12:00:00.000Z');
    });

    it('should throw MCPError for invalid JSON', async () => {
      const metadataPath = path.join(indexPath, 'metadata.json');
      await fs.promises.writeFile(metadataPath, 'not valid json {{{');

      await expect(loadMetadata(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should throw MCPError for invalid metadata structure', async () => {
      const invalidMetadata = {
        version: '1.0.0',
        projectPath: '/test/project',
        // Missing required fields
      };

      const metadataPath = path.join(indexPath, 'metadata.json');
      await fs.promises.writeFile(metadataPath, JSON.stringify(invalidMetadata));

      await expect(loadMetadata(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });

    it('should throw MCPError for invalid stats', async () => {
      const invalidMetadata = {
        version: '1.0.0',
        projectPath: '/test/project',
        createdAt: '2025-01-15T10:30:00.000Z',
        lastFullIndex: '2025-01-15T10:30:00.000Z',
        stats: {
          totalFiles: -1, // Invalid
          totalChunks: 200,
          storageSizeBytes: 512000,
        },
      };

      const metadataPath = path.join(indexPath, 'metadata.json');
      await fs.promises.writeFile(metadataPath, JSON.stringify(invalidMetadata));

      await expect(loadMetadata(indexPath)).rejects.toMatchObject({
        code: ErrorCode.INDEX_CORRUPT,
      });
    });
  });

  // ==========================================================================
  // saveMetadata Tests
  // ==========================================================================

  describe('saveMetadata', () => {
    it('should save metadata to file', async () => {
      const testMetadata = createMetadata('/test/project');
      testMetadata.stats = {
        totalFiles: 100,
        totalChunks: 500,
        storageSizeBytes: 1024000,
      };

      await saveMetadata(indexPath, testMetadata);

      const metadataPath = path.join(indexPath, 'metadata.json');
      const content = await fs.promises.readFile(metadataPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.version).toBe(testMetadata.version);
      expect(saved.projectPath).toBe(testMetadata.projectPath);
      expect(saved.stats).toEqual(testMetadata.stats);
    });

    it('should pretty-print the JSON', async () => {
      const testMetadata = createMetadata('/test/project');
      await saveMetadata(indexPath, testMetadata);

      const metadataPath = path.join(indexPath, 'metadata.json');
      const content = await fs.promises.readFile(metadataPath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  '); // Indentation
    });

    it('should use atomic write (no temp files left behind)', async () => {
      const testMetadata = createMetadata('/test/project');
      await saveMetadata(indexPath, testMetadata);

      const files = await fs.promises.readdir(indexPath);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should overwrite existing metadata', async () => {
      const initialMetadata = createMetadata('/test/project');
      initialMetadata.stats.totalFiles = 50;
      await saveMetadata(indexPath, initialMetadata);

      const updatedMetadata = createMetadata('/test/project');
      updatedMetadata.stats.totalFiles = 100;
      await saveMetadata(indexPath, updatedMetadata);

      const loaded = await loadMetadata(indexPath);
      expect(loaded?.stats.totalFiles).toBe(100);
    });

    it('should throw on invalid metadata', async () => {
      const invalidMetadata = {
        version: '1.0.0',
        projectPath: '/test/project',
        // Missing required fields
      } as unknown as Metadata;

      await expect(saveMetadata(indexPath, invalidMetadata)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // MetadataManager Class Tests
  // ==========================================================================

  describe('MetadataManager', () => {
    describe('constructor', () => {
      it('should create instance with index path', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getIndexPath()).toBe(indexPath);
      });

      it('should not be loaded initially', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.isLoaded()).toBe(false);
      });

      it('should have null metadata initially', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getMetadata()).toBeNull();
      });
    });

    describe('load', () => {
      it('should return null when no metadata exists', async () => {
        const manager = new MetadataManager(indexPath);
        const metadata = await manager.load();
        expect(metadata).toBeNull();
        expect(manager.isLoaded()).toBe(false);
      });

      it('should load metadata from disk', async () => {
        const testMetadata = createMetadata('/test/project');
        testMetadata.stats.totalFiles = 75;
        await saveMetadata(indexPath, testMetadata);

        const manager = new MetadataManager(indexPath);
        const loaded = await manager.load();

        expect(loaded?.stats.totalFiles).toBe(75);
        expect(manager.isLoaded()).toBe(true);
      });

      it('should update lastLoadedAt', async () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getLastLoadedAt()).toBe(0);

        const before = Date.now();
        await manager.load();
        const after = Date.now();

        expect(manager.getLastLoadedAt()).toBeGreaterThanOrEqual(before);
        expect(manager.getLastLoadedAt()).toBeLessThanOrEqual(after);
      });
    });

    describe('save', () => {
      it('should throw if no metadata loaded', async () => {
        const manager = new MetadataManager(indexPath);
        await expect(manager.save()).rejects.toThrow('No metadata to save');
      });

      it('should save initialized metadata to disk', async () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        await manager.save();

        const metadataPath = path.join(indexPath, 'metadata.json');
        expect(fs.existsSync(metadataPath)).toBe(true);

        const content = await fs.promises.readFile(metadataPath, 'utf-8');
        const saved = JSON.parse(content);
        expect(saved.projectPath).toBe('/test/project');
      });

      it('should save updated metadata', async () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        manager.updateStats(100, 500, 1024000);
        await manager.save();

        const loaded = await loadMetadata(indexPath);
        expect(loaded?.stats.totalFiles).toBe(100);
        expect(loaded?.stats.totalChunks).toBe(500);
        expect(loaded?.stats.storageSizeBytes).toBe(1024000);
      });
    });

    describe('exists', () => {
      it('should return false when no metadata file', async () => {
        const manager = new MetadataManager(indexPath);
        expect(await manager.exists()).toBe(false);
      });

      it('should return true when metadata file exists', async () => {
        const testMetadata = createMetadata('/test/project');
        await saveMetadata(indexPath, testMetadata);

        const manager = new MetadataManager(indexPath);
        expect(await manager.exists()).toBe(true);
      });
    });

    describe('initialize', () => {
      it('should create initial metadata in cache', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        expect(manager.isLoaded()).toBe(true);
        expect(manager.getMetadata()?.projectPath).toBe('/test/project');
        expect(manager.getMetadata()?.version).toBe(CURRENT_VERSION);
      });

      it('should initialize stats to zero', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        const stats = manager.getStats();
        expect(stats?.totalFiles).toBe(0);
        expect(stats?.totalChunks).toBe(0);
        expect(stats?.storageSizeBytes).toBe(0);
      });

      it('should not save to disk automatically', async () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        expect(await manager.exists()).toBe(false);
      });
    });

    describe('updateStats', () => {
      it('should update stats in cached metadata', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        manager.updateStats(100, 500, 1024000);

        const stats = manager.getStats();
        expect(stats?.totalFiles).toBe(100);
        expect(stats?.totalChunks).toBe(500);
        expect(stats?.storageSizeBytes).toBe(1024000);
      });

      it('should throw if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(() => manager.updateStats(100, 500, 1024000)).toThrow(
          'Metadata not loaded'
        );
      });

      it('should allow updating stats multiple times', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        manager.updateStats(50, 200, 512000);
        expect(manager.getStats()?.totalFiles).toBe(50);

        manager.updateStats(100, 500, 1024000);
        expect(manager.getStats()?.totalFiles).toBe(100);
      });
    });

    describe('markFullIndex', () => {
      it('should update lastFullIndex timestamp', async () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        const originalTime = manager.getMetadata()?.lastFullIndex;

        // Wait a tiny bit to ensure timestamp changes
        await new Promise((resolve) => setTimeout(resolve, 10));

        manager.markFullIndex();
        const newTime = manager.getMetadata()?.lastFullIndex;

        expect(newTime).not.toBe(originalTime);
        expect(new Date(newTime!).getTime()).toBeGreaterThan(
          new Date(originalTime!).getTime()
        );
      });

      it('should throw if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(() => manager.markFullIndex()).toThrow('Metadata not loaded');
      });
    });

    describe('markIncrementalUpdate', () => {
      it('should set lastIncrementalUpdate timestamp', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        expect(manager.getMetadata()?.lastIncrementalUpdate).toBeUndefined();

        manager.markIncrementalUpdate();

        expect(manager.getMetadata()?.lastIncrementalUpdate).toBeDefined();
      });

      it('should update lastIncrementalUpdate on subsequent calls', async () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        manager.markIncrementalUpdate();
        const firstTime = manager.getMetadata()?.lastIncrementalUpdate;

        // Wait a tiny bit to ensure timestamp changes
        await new Promise((resolve) => setTimeout(resolve, 10));

        manager.markIncrementalUpdate();
        const secondTime = manager.getMetadata()?.lastIncrementalUpdate;

        expect(new Date(secondTime!).getTime()).toBeGreaterThan(
          new Date(firstTime!).getTime()
        );
      });

      it('should throw if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(() => manager.markIncrementalUpdate()).toThrow(
          'Metadata not loaded'
        );
      });
    });

    describe('updateDocsStats', () => {
      it('should update docs stats in cached metadata', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        manager.updateDocsStats(50, 200, 512000);

        const docsStats = manager.getDocsStats();
        expect(docsStats?.totalDocs).toBe(50);
        expect(docsStats?.totalDocChunks).toBe(200);
        expect(docsStats?.docsStorageSizeBytes).toBe(512000);
      });

      it('should throw if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(() => manager.updateDocsStats(50, 200, 512000)).toThrow(
          'Metadata not loaded'
        );
      });

      it('should allow updating docs stats multiple times', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        manager.updateDocsStats(25, 100, 256000);
        expect(manager.getDocsStats()?.totalDocs).toBe(25);

        manager.updateDocsStats(50, 200, 512000);
        expect(manager.getDocsStats()?.totalDocs).toBe(50);
      });
    });

    describe('markDocsIndex', () => {
      it('should set lastDocsIndex timestamp', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        expect(manager.getMetadata()?.lastDocsIndex).toBeUndefined();

        manager.markDocsIndex();

        expect(manager.getMetadata()?.lastDocsIndex).toBeDefined();
      });

      it('should update lastDocsIndex on subsequent calls', async () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        manager.markDocsIndex();
        const firstTime = manager.getMetadata()?.lastDocsIndex;

        // Wait a tiny bit to ensure timestamp changes
        await new Promise((resolve) => setTimeout(resolve, 10));

        manager.markDocsIndex();
        const secondTime = manager.getMetadata()?.lastDocsIndex;

        expect(new Date(secondTime!).getTime()).toBeGreaterThan(
          new Date(firstTime!).getTime()
        );
      });

      it('should throw if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(() => manager.markDocsIndex()).toThrow('Metadata not loaded');
      });
    });

    describe('getDocsStats', () => {
      it('should return null if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getDocsStats()).toBeNull();
      });

      it('should return null if docs stats not set', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        expect(manager.getDocsStats()).toBeNull();
      });

      it('should return docs stats from metadata', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        manager.updateDocsStats(50, 200, 512000);

        const docsStats = manager.getDocsStats();
        expect(docsStats?.totalDocs).toBe(50);
        expect(docsStats?.totalDocChunks).toBe(200);
        expect(docsStats?.docsStorageSizeBytes).toBe(512000);
      });
    });

    describe('getMetadata', () => {
      it('should return null if not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getMetadata()).toBeNull();
      });

      it('should return cached metadata after initialize', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        const metadata = manager.getMetadata();
        expect(metadata).not.toBeNull();
        expect(metadata?.projectPath).toBe('/test/project');
      });

      it('should return cached metadata after load', async () => {
        const testMetadata = createMetadata('/test/project');
        await saveMetadata(indexPath, testMetadata);

        const manager = new MetadataManager(indexPath);
        await manager.load();

        const metadata = manager.getMetadata();
        expect(metadata).not.toBeNull();
        expect(metadata?.projectPath).toBe('/test/project');
      });
    });

    describe('getMetadataPath', () => {
      it('should return correct metadata path', () => {
        const manager = new MetadataManager(indexPath);
        const expectedPath = path.join(indexPath, 'metadata.json');
        expect(manager.getMetadataPath()).toBe(expectedPath);
      });
    });

    describe('getProjectPath', () => {
      it('should return null if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getProjectPath()).toBeNull();
      });

      it('should return project path from metadata', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/Users/dev/my-project');
        expect(manager.getProjectPath()).toBe('/Users/dev/my-project');
      });
    });

    describe('getStats', () => {
      it('should return null if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getStats()).toBeNull();
      });

      it('should return stats from metadata', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        manager.updateStats(100, 500, 1024000);

        const stats = manager.getStats();
        expect(stats?.totalFiles).toBe(100);
        expect(stats?.totalChunks).toBe(500);
        expect(stats?.storageSizeBytes).toBe(1024000);
      });
    });

    describe('getVersion', () => {
      it('should return null if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getVersion()).toBeNull();
      });

      it('should return version from metadata', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        expect(manager.getVersion()).toBe(CURRENT_VERSION);
      });
    });

    describe('embedding model info methods', () => {
      it('updateCodeModelInfo should update code model info', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        manager.updateCodeModelInfo('Xenova/bge-small-en-v1.5', 384);

        const modelInfo = manager.getEmbeddingModelInfo();
        expect(modelInfo?.codeModelName).toBe('Xenova/bge-small-en-v1.5');
        expect(modelInfo?.codeModelDimension).toBe(384);
      });

      it('updateDocsModelInfo should update docs model info', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        manager.updateDocsModelInfo('Xenova/bge-base-en-v1.5', 768);

        const modelInfo = manager.getEmbeddingModelInfo();
        expect(modelInfo?.docsModelName).toBe('Xenova/bge-base-en-v1.5');
        expect(modelInfo?.docsModelDimension).toBe(768);
      });

      it('updateEmbeddingModelInfo should update all fields', () => {
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');

        manager.updateEmbeddingModelInfo({
          codeModelName: 'Xenova/bge-small-en-v1.5',
          codeModelDimension: 384,
          docsModelName: 'Xenova/bge-base-en-v1.5',
          docsModelDimension: 768,
        });

        expect(manager.getCodeModelName()).toBe('Xenova/bge-small-en-v1.5');
        expect(manager.getCodeModelDimension()).toBe(384);
        expect(manager.getDocsModelName()).toBe('Xenova/bge-base-en-v1.5');
        expect(manager.getDocsModelDimension()).toBe(768);
      });

      it('should throw if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);

        expect(() =>
          manager.updateCodeModelInfo('Xenova/bge-small-en-v1.5', 384)
        ).toThrow('Metadata not loaded');

        expect(() =>
          manager.updateDocsModelInfo('Xenova/bge-base-en-v1.5', 768)
        ).toThrow('Metadata not loaded');

        expect(() =>
          manager.updateEmbeddingModelInfo({
            codeModelName: 'test',
            codeModelDimension: 384,
          })
        ).toThrow('Metadata not loaded');
      });

      it('getEmbeddingModelInfo should return null if metadata not loaded', () => {
        const manager = new MetadataManager(indexPath);
        expect(manager.getEmbeddingModelInfo()).toBeNull();
        expect(manager.getCodeModelName()).toBeNull();
        expect(manager.getCodeModelDimension()).toBeNull();
        expect(manager.getDocsModelName()).toBeNull();
        expect(manager.getDocsModelDimension()).toBeNull();
      });

      it('should persist and load embedding model info', async () => {
        const manager1 = new MetadataManager(indexPath);
        manager1.initialize('/test/project');
        manager1.updateCodeModelInfo('Xenova/bge-small-en-v1.5', 384);
        manager1.updateDocsModelInfo('Xenova/bge-base-en-v1.5', 768);
        await manager1.save();

        const manager2 = new MetadataManager(indexPath);
        await manager2.load();

        expect(manager2.getCodeModelName()).toBe('Xenova/bge-small-en-v1.5');
        expect(manager2.getCodeModelDimension()).toBe(384);
        expect(manager2.getDocsModelName()).toBe('Xenova/bge-base-en-v1.5');
        expect(manager2.getDocsModelDimension()).toBe(768);
      });

      it('should be backward compatible with metadata without embedding model info', async () => {
        // Create metadata without embeddingModels field (simulating old metadata)
        const oldMetadata = {
          version: '1.0.0',
          projectPath: '/test/project',
          createdAt: '2025-01-15T10:30:00.000Z',
          lastFullIndex: '2025-01-15T10:30:00.000Z',
          stats: {
            totalFiles: 100,
            totalChunks: 500,
            storageSizeBytes: 1024000,
          },
        };

        const metadataPath = path.join(indexPath, 'metadata.json');
        await fs.promises.writeFile(metadataPath, JSON.stringify(oldMetadata));

        const manager = new MetadataManager(indexPath);
        const loaded = await manager.load();

        expect(loaded).not.toBeNull();
        expect(manager.getEmbeddingModelInfo()).toBeNull();
        expect(manager.getCodeModelName()).toBeNull();
        expect(manager.getDocsModelName()).toBeNull();
      });
    });

    describe('integration', () => {
      it('should support full workflow: initialize, update, save, load', async () => {
        // Initialize and set up
        const manager1 = new MetadataManager(indexPath);
        manager1.initialize('/test/project');
        manager1.updateStats(100, 500, 1024000);
        manager1.markFullIndex();
        await manager1.save();

        // Load in new manager
        const manager2 = new MetadataManager(indexPath);
        await manager2.load();

        expect(manager2.getProjectPath()).toBe('/test/project');
        expect(manager2.getStats()?.totalFiles).toBe(100);
        expect(manager2.getStats()?.totalChunks).toBe(500);
        expect(manager2.getStats()?.storageSizeBytes).toBe(1024000);
        expect(manager2.getVersion()).toBe(CURRENT_VERSION);
      });

      it('should support incremental update workflow', async () => {
        // Initial indexing
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        manager.updateStats(100, 500, 1024000);
        manager.markFullIndex();
        await manager.save();

        // Reload and do incremental update
        await manager.load();
        manager.updateStats(105, 525, 1050000);
        manager.markIncrementalUpdate();
        await manager.save();

        // Verify
        const loaded = await loadMetadata(indexPath);
        expect(loaded?.stats.totalFiles).toBe(105);
        expect(loaded?.lastIncrementalUpdate).toBeDefined();
      });

      it('should support documentation index workflow', async () => {
        // Initialize and set up code index
        const manager = new MetadataManager(indexPath);
        manager.initialize('/test/project');
        manager.updateStats(100, 500, 1024000);
        manager.markFullIndex();

        // Add documentation index
        manager.updateDocsStats(25, 100, 256000);
        manager.markDocsIndex();
        await manager.save();

        // Load in new manager and verify
        const manager2 = new MetadataManager(indexPath);
        await manager2.load();

        // Verify code stats
        expect(manager2.getStats()?.totalFiles).toBe(100);
        expect(manager2.getStats()?.totalChunks).toBe(500);

        // Verify docs stats
        expect(manager2.getDocsStats()?.totalDocs).toBe(25);
        expect(manager2.getDocsStats()?.totalDocChunks).toBe(100);
        expect(manager2.getDocsStats()?.docsStorageSizeBytes).toBe(256000);
        expect(manager2.getMetadata()?.lastDocsIndex).toBeDefined();
      });

      it('should be backward compatible with existing metadata without docs fields', async () => {
        // Create metadata without docs fields (simulating old metadata)
        const oldMetadata = {
          version: '1.0.0',
          projectPath: '/test/project',
          createdAt: '2025-01-15T10:30:00.000Z',
          lastFullIndex: '2025-01-15T10:30:00.000Z',
          stats: {
            totalFiles: 100,
            totalChunks: 500,
            storageSizeBytes: 1024000,
          },
        };

        const metadataPath = path.join(indexPath, 'metadata.json');
        await fs.promises.writeFile(metadataPath, JSON.stringify(oldMetadata));

        // Load in manager - should succeed without docs fields
        const manager = new MetadataManager(indexPath);
        const loaded = await manager.load();

        expect(loaded).not.toBeNull();
        expect(manager.getStats()?.totalFiles).toBe(100);
        expect(manager.getDocsStats()).toBeNull();
        expect(manager.getMetadata()?.lastDocsIndex).toBeUndefined();
      });
    });
  });
});
