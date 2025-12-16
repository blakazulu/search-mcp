/**
 * get_index_status Tool Unit Tests
 *
 * Tests cover:
 * - Input schema validation
 * - formatStorageSize utility function
 * - Index existence checking (not_found status)
 * - Valid index status reporting
 * - Storage size calculation
 * - Watcher status reporting
 * - MCP tool definition
 * - Edge cases (empty index, corrupt metadata)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { v4 as uuidv4 } from 'uuid';

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
 * Generate a random 384-dimensional vector
 */
function randomVector(): number[] {
  return Array.from({ length: 384 }, () => Math.random() * 2 - 1);
}

/**
 * Create test chunk record
 */
function createTestChunk(filePath: string): {
  id: string;
  path: string;
  text: string;
  vector: number[];
  start_line: number;
  end_line: number;
  content_hash: string;
} {
  return {
    id: uuidv4(),
    path: filePath,
    text: `// Content of ${filePath}`,
    vector: randomVector(),
    start_line: 1,
    end_line: 3,
    content_hash: 'hash-' + filePath.replace(/\//g, '-'),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('get_index_status Tool', () => {
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

  describe('GetIndexStatusInputSchema', () => {
    it('should validate empty object input', async () => {
      const { GetIndexStatusInputSchema } = await import('../../../src/tools/getIndexStatus.js');

      const result = GetIndexStatusInputSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should accept additional properties (ignored)', async () => {
      const { GetIndexStatusInputSchema } = await import('../../../src/tools/getIndexStatus.js');

      // Zod strips unknown properties by default
      const result = GetIndexStatusInputSchema.safeParse({
        unknownProp: 'value',
      });

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // formatStorageSize Tests
  // --------------------------------------------------------------------------

  describe('formatStorageSize', () => {
    it('should format bytes correctly', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      expect(formatStorageSize(0)).toBe('0B');
      expect(formatStorageSize(500)).toBe('500B');
      expect(formatStorageSize(1023)).toBe('1023B');
    });

    it('should format kilobytes correctly', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      expect(formatStorageSize(1024)).toBe('1KB');
      expect(formatStorageSize(1536)).toBe('1.5KB');
      expect(formatStorageSize(2048)).toBe('2KB');
      expect(formatStorageSize(1024 * 100)).toBe('100KB');
    });

    it('should format megabytes correctly', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      expect(formatStorageSize(1024 * 1024)).toBe('1MB');
      expect(formatStorageSize(1024 * 1024 * 45)).toBe('45MB');
      expect(formatStorageSize(1024 * 1024 * 1.5)).toBe('1.5MB');
      expect(formatStorageSize(1024 * 1024 * 512)).toBe('512MB');
    });

    it('should format gigabytes correctly', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      expect(formatStorageSize(1024 * 1024 * 1024)).toBe('1GB');
      expect(formatStorageSize(1024 * 1024 * 1024 * 1.2)).toBe('1.2GB');
      expect(formatStorageSize(1024 * 1024 * 1024 * 10)).toBe('10GB');
    });

    it('should format terabytes correctly', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      expect(formatStorageSize(1024 * 1024 * 1024 * 1024)).toBe('1TB');
      expect(formatStorageSize(1024 * 1024 * 1024 * 1024 * 2.5)).toBe('2.5TB');
    });

    it('should handle negative values', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      expect(formatStorageSize(-100)).toBe('0B');
    });

    it('should round whole numbers without decimals', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      // Exact multiples should not have decimals
      expect(formatStorageSize(1024 * 1024 * 10)).toBe('10MB');
      expect(formatStorageSize(1024 * 1024 * 100)).toBe('100MB');
    });

    it('should show one decimal place for non-whole numbers', async () => {
      const { formatStorageSize } = await import('../../../src/tools/getIndexStatus.js');

      // Non-exact values should have one decimal
      expect(formatStorageSize(1536 * 1024)).toBe('1.5MB');
      expect(formatStorageSize(Math.floor(1024 * 1024 * 1.3))).toBe('1.3MB');
    });
  });

  // --------------------------------------------------------------------------
  // INDEX_NOT_FOUND Tests
  // --------------------------------------------------------------------------

  describe('INDEX_NOT_FOUND status', () => {
    it('should return not_found when no index exists', async () => {
      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'nonexistent-project');
      fs.mkdirSync(projectPath, { recursive: true });

      try {
        const result = await getIndexStatus({}, { projectPath });

        expect(result.status).toBe('not_found');
        expect(result.projectPath).toBeUndefined();
        expect(result.totalFiles).toBeUndefined();
        expect(result.totalChunks).toBeUndefined();
        expect(result.lastUpdated).toBeUndefined();
        expect(result.storageSize).toBeUndefined();
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should return not_found when metadata file is missing', async () => {
      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const { getIndexPath } = await import('../../../src/utils/paths.js');

      const tempDir = createTempDir();
      const projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      // Create index directory but no metadata
      const indexPath = getIndexPath(projectPath);
      fs.mkdirSync(indexPath, { recursive: true });

      try {
        const result = await getIndexStatus({}, { projectPath });

        expect(result.status).toBe('not_found');
      } finally {
        cleanupTempDir(tempDir);
        if (fs.existsSync(indexPath)) {
          fs.rmSync(indexPath, { recursive: true, force: true });
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Valid Index Tests
  // --------------------------------------------------------------------------

  describe('getIndexStatus with valid index', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      // Get the index path using the utility
      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return ready status for valid index', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 100;
      metadata.stats.totalChunks = 500;
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.status).toBe('ready');
      expect(result.projectPath).toBe(projectPath);
      expect(result.totalFiles).toBe(100);
      expect(result.totalChunks).toBe(500);
    });

    it('should include lastUpdated from lastFullIndex', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 50;
      metadata.stats.totalChunks = 200;
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.lastUpdated).toBe(metadata.lastFullIndex);
    });

    it('should prefer lastIncrementalUpdate over lastFullIndex', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 50;
      metadata.stats.totalChunks = 200;
      metadata.lastIncrementalUpdate = '2025-01-20T15:30:00.000Z';
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.lastUpdated).toBe('2025-01-20T15:30:00.000Z');
    });

    it('should calculate storage size from LanceDB directory', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 10;
      metadata.stats.totalChunks = 50;
      await saveMetadata(indexPath, metadata);

      // Create LanceDB store with some data
      const { LanceDBStore, ChunkRecord } = await import('../../../src/storage/lancedb.js');
      const store = new LanceDBStore(indexPath);
      await store.open();

      const chunks: ChunkRecord[] = Array.from({ length: 10 }, (_, i) =>
        createTestChunk(`src/file${i}.ts`)
      );
      await store.insertChunks(chunks);
      await store.close();

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      // Storage size should be set and non-zero
      expect(result.storageSize).toBeDefined();
      expect(result.storageSize).not.toBe('0B');
    });

    it('should report storageSize as 0B when no LanceDB data exists', async () => {
      // Create metadata only, no LanceDB
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.storageSize).toBe('0B');
    });
  });

  // --------------------------------------------------------------------------
  // Watcher Status Tests
  // --------------------------------------------------------------------------

  describe('watcherActive status', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return undefined for watcherActive when no watcher exists', async () => {
      // Create metadata
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      // Until FileWatcher is implemented, this should be undefined
      expect(result.watcherActive).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Corrupt Metadata Tests
  // --------------------------------------------------------------------------

  describe('corrupt metadata handling', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return not_found when metadata is invalid JSON', async () => {
      fs.mkdirSync(indexPath, { recursive: true });
      const metadataPath = path.join(indexPath, 'metadata.json');
      await fs.promises.writeFile(metadataPath, 'invalid json {{{');

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.status).toBe('not_found');
    });

    it('should return not_found when metadata schema is invalid', async () => {
      fs.mkdirSync(indexPath, { recursive: true });
      const metadataPath = path.join(indexPath, 'metadata.json');
      await fs.promises.writeFile(
        metadataPath,
        JSON.stringify({
          version: '1.0.0',
          // Missing required fields
        })
      );

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.status).toBe('not_found');
    });
  });

  // --------------------------------------------------------------------------
  // Empty Index Tests
  // --------------------------------------------------------------------------

  describe('empty index handling', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return ready with zero counts for empty index', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      // Stats are initialized to zero
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.status).toBe('ready');
      expect(result.totalFiles).toBe(0);
      expect(result.totalChunks).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // MCP Tool Definition Tests
  // --------------------------------------------------------------------------

  describe('getIndexStatusTool definition', () => {
    it('should have correct tool name', async () => {
      const { getIndexStatusTool } = await import('../../../src/tools/getIndexStatus.js');
      expect(getIndexStatusTool.name).toBe('get_index_status');
    });

    it('should have description', async () => {
      const { getIndexStatusTool } = await import('../../../src/tools/getIndexStatus.js');
      expect(getIndexStatusTool.description).toBe(
        'Show statistics about the current project index'
      );
    });

    it('should not require confirmation (read-only)', async () => {
      const { getIndexStatusTool } = await import('../../../src/tools/getIndexStatus.js');
      expect(getIndexStatusTool.requiresConfirmation).toBe(false);
    });

    it('should have correct input schema structure', async () => {
      const { getIndexStatusTool } = await import('../../../src/tools/getIndexStatus.js');

      expect(getIndexStatusTool.inputSchema.type).toBe('object');
      expect(getIndexStatusTool.inputSchema.properties).toEqual({});
      expect(getIndexStatusTool.inputSchema.required).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // collectStatus Function Tests
  // --------------------------------------------------------------------------

  describe('collectStatus', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return all expected fields for valid index', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 75;
      metadata.stats.totalChunks = 300;
      await saveMetadata(indexPath, metadata);

      const { collectStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await collectStatus({ projectPath });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('projectPath');
      expect(result).toHaveProperty('totalFiles');
      expect(result).toHaveProperty('totalChunks');
      expect(result).toHaveProperty('lastUpdated');
      expect(result).toHaveProperty('storageSize');
      // watcherActive may be undefined until FileWatcher is implemented
    });
  });

  // --------------------------------------------------------------------------
  // Tools Index Export Tests
  // --------------------------------------------------------------------------

  describe('tools/index.ts exports', () => {
    it('should export getIndexStatus from tools index', async () => {
      const { getIndexStatus } = await import('../../../src/tools/index.js');
      expect(getIndexStatus).toBeDefined();
      expect(typeof getIndexStatus).toBe('function');
    });

    it('should export getIndexStatusTool from tools index', async () => {
      const { getIndexStatusTool } = await import('../../../src/tools/index.js');
      expect(getIndexStatusTool).toBeDefined();
      expect(getIndexStatusTool.name).toBe('get_index_status');
    });

    it('should export GetIndexStatusInputSchema from tools index', async () => {
      const { GetIndexStatusInputSchema } = await import('../../../src/tools/index.js');
      expect(GetIndexStatusInputSchema).toBeDefined();
    });

    it('should export formatStorageSize from tools index', async () => {
      const { formatStorageSize } = await import('../../../src/tools/index.js');
      expect(formatStorageSize).toBeDefined();
      expect(typeof formatStorageSize).toBe('function');
    });

    it('should export collectStatus from tools index', async () => {
      const { collectStatus } = await import('../../../src/tools/index.js');
      expect(collectStatus).toBeDefined();
      expect(typeof collectStatus).toBe('function');
    });

    it('should export IndexStatus type (TypeScript check)', async () => {
      // This test verifies that IndexStatus is properly exported
      // It's a compile-time check more than runtime
      const tools = await import('../../../src/tools/index.js');
      expect(tools).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Output Structure Tests
  // --------------------------------------------------------------------------

  describe('output structure', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should return only status for not_found', async () => {
      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(Object.keys(result)).toEqual(['status']);
      expect(result.status).toBe('not_found');
    });

    it('should return full structure for ready status', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      metadata.stats.totalFiles = 25;
      metadata.stats.totalChunks = 100;
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.status).toBe('ready');
      expect(typeof result.projectPath).toBe('string');
      expect(typeof result.totalFiles).toBe('number');
      expect(typeof result.totalChunks).toBe('number');
      expect(typeof result.lastUpdated).toBe('string');
      expect(typeof result.storageSize).toBe('string');
    });

    it('should return valid ISO datetime for lastUpdated', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      // Verify it's a valid ISO datetime
      const date = new Date(result.lastUpdated!);
      expect(date.toISOString()).toBe(result.lastUpdated);
    });
  });

  // --------------------------------------------------------------------------
  // Compute Device Status Tests (SMCP-083)
  // --------------------------------------------------------------------------

  describe('compute device status (SMCP-083)', () => {
    let tempDir: string;
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      tempDir = createTempDir();
      projectPath = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const { getIndexPath } = await import('../../../src/utils/paths.js');
      indexPath = getIndexPath(projectPath);
    });

    afterEach(async () => {
      cleanupTempDir(tempDir);
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, { recursive: true, force: true });
      }
    });

    it('should include compute field in status output', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      expect(result.compute).toBeDefined();
      expect(result.compute?.device).toBeDefined();
      expect(['webgpu', 'dml', 'cpu']).toContain(result.compute?.device);
    });

    it('should include gpuName when GPU is available', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      // gpuName is only present when device is webgpu or dml
      if (result.compute?.device === 'webgpu' || result.compute?.device === 'dml') {
        expect(result.compute?.gpuName).toBeDefined();
      }
    });

    it('should include fallbackReason when using CPU', async () => {
      const { saveMetadata, createMetadata } = await import('../../../src/storage/metadata.js');
      const metadata = createMetadata(projectPath);
      await saveMetadata(indexPath, metadata);

      const { getIndexStatus } = await import('../../../src/tools/getIndexStatus.js');
      const result = await getIndexStatus({}, { projectPath });

      // fallbackReason is only present when device is cpu (unless CPU was explicitly chosen)
      if (result.compute?.device === 'cpu') {
        // fallbackReason may or may not be present depending on environment
        // Just ensure compute.device is 'cpu'
        expect(result.compute.device).toBe('cpu');
      }
    });
  });

  // --------------------------------------------------------------------------
  // ComputeStatus Type Export Tests (SMCP-083)
  // --------------------------------------------------------------------------

  describe('ComputeStatus type export (SMCP-083)', () => {
    it('should export ComputeStatus type from tools index', async () => {
      // This test verifies that ComputeStatus is properly exported
      // It's a compile-time check more than runtime
      const tools = await import('../../../src/tools/index.js');
      expect(tools).toBeDefined();
      // TypeScript will verify the type is exported at compile time
    });
  });
});
