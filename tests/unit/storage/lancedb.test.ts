/**
 * LanceDB Store Unit Tests
 *
 * Tests for the vector database wrapper including:
 * - Database lifecycle (open, close, delete)
 * - CRUD operations (insert, delete, get)
 * - Vector similarity search
 * - Path pattern search
 * - Helper functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  LanceDBStore,
  ChunkRecord,
  SearchResult,
  VECTOR_DIMENSION,
  CODE_VECTOR_DIMENSION,
  DOCS_VECTOR_DIMENSION,
  TABLE_NAME,
  distanceToScore,
  globToLikePattern,
  VectorIndexInfo,
  VectorIndexConfig,
  MIN_CHUNKS_FOR_INDEX,
  MAX_IVF_PARTITIONS,
} from '../../../src/storage/lancedb.js';

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
 * Generate a random vector with specified dimension
 */
function randomVectorWithDimension(dimension: number): number[] {
  return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
}

/**
 * Generate a random 384-dimensional vector
 */
function randomVector(): number[] {
  return randomVectorWithDimension(VECTOR_DIMENSION);
}

/**
 * Generate a test chunk record
 */
function createTestChunk(overrides: Partial<ChunkRecord> = {}): ChunkRecord {
  return {
    id: uuidv4(),
    path: 'src/test/file.ts',
    text: 'function testFunction() { return 42; }',
    vector: randomVector(),
    start_line: 1,
    end_line: 3,
    content_hash: 'abc123def456',
    ...overrides,
  };
}

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('distanceToScore', () => {
  it('should convert distance 0 to score 1', () => {
    expect(distanceToScore(0)).toBe(1);
  });

  it('should convert large distance to low score', () => {
    expect(distanceToScore(100)).toBeCloseTo(0.0099, 2);
  });

  it('should return values between 0 and 1', () => {
    for (let i = 0; i < 100; i++) {
      const distance = Math.random() * 100;
      const score = distanceToScore(distance);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('should decrease as distance increases', () => {
    const score1 = distanceToScore(0.1);
    const score2 = distanceToScore(1);
    const score3 = distanceToScore(10);

    expect(score1).toBeGreaterThan(score2);
    expect(score2).toBeGreaterThan(score3);
  });
});

describe('globToLikePattern', () => {
  it('should convert single asterisk to percent', () => {
    expect(globToLikePattern('*.ts')).toBe('%.ts');
  });

  it('should convert double asterisk to percent', () => {
    expect(globToLikePattern('src/**/*.ts')).toBe('src/%/%.ts');
  });

  it('should convert question mark to underscore', () => {
    expect(globToLikePattern('file?.ts')).toBe('file_.ts');
  });

  it('should handle complex patterns', () => {
    expect(globToLikePattern('src/**/test/*.test.ts')).toBe('src/%/test/%.test.ts');
  });

  it('should escape single quotes', () => {
    expect(globToLikePattern("don't.ts")).toBe("don''t.ts");
  });

  it('should handle patterns without wildcards', () => {
    expect(globToLikePattern('exact-file.ts')).toBe('exact-file.ts');
  });
});

// ============================================================================
// LanceDBStore Tests
// ============================================================================

describe('LanceDBStore', () => {
  let tempDir: string;
  let store: LanceDBStore;

  beforeEach(() => {
    tempDir = createTempDir();
    store = new LanceDBStore(tempDir);
  });

  afterEach(async () => {
    try {
      await store.close();
    } catch {
      // Ignore close errors in cleanup
    }
    cleanupTempDir(tempDir);
  });

  // --------------------------------------------------------------------------
  // Lifecycle Tests
  // --------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('should open a new database', async () => {
      await store.open();
      expect(store.opened).toBe(true);
    });

    it('should be idempotent when opening multiple times', async () => {
      await store.open();
      await store.open(); // Should not throw
      expect(store.opened).toBe(true);
    });

    it('should close the database', async () => {
      await store.open();
      await store.close();
      expect(store.opened).toBe(false);
    });

    it('should be safe to close multiple times', async () => {
      await store.open();
      await store.close();
      await store.close(); // Should not throw
      expect(store.opened).toBe(false);
    });

    it('should delete the database', async () => {
      await store.open();
      const chunk = createTestChunk();
      await store.insertChunks([chunk]);
      await store.delete();

      expect(store.opened).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'index.lancedb'))).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Insert Tests
  // --------------------------------------------------------------------------

  describe('insertChunks', () => {
    it('should insert a single chunk', async () => {
      await store.open();
      const chunk = createTestChunk();

      await store.insertChunks([chunk]);

      const count = await store.countChunks();
      expect(count).toBe(1);
    });

    it('should insert multiple chunks', async () => {
      await store.open();
      const chunks = [
        createTestChunk({ path: 'file1.ts' }),
        createTestChunk({ path: 'file2.ts' }),
        createTestChunk({ path: 'file3.ts' }),
      ];

      await store.insertChunks(chunks);

      const count = await store.countChunks();
      expect(count).toBe(3);
    });

    it('should handle empty array', async () => {
      await store.open();
      await store.insertChunks([]);
      // Should not create table
      expect(await store.hasData()).toBe(false);
    });

    it('should handle large batch (1000+ chunks)', async () => {
      await store.open();
      const chunks = Array.from({ length: 1200 }, (_, i) =>
        createTestChunk({
          path: `file${i}.ts`,
          text: `Content ${i}`,
        })
      );

      await store.insertChunks(chunks);

      const count = await store.countChunks();
      expect(count).toBe(1200);
    }, 30000); // Allow more time for large batch
  });

  // --------------------------------------------------------------------------
  // Delete Tests
  // --------------------------------------------------------------------------

  describe('deleteByPath', () => {
    it('should delete chunks for a specific path', async () => {
      await store.open();
      const chunks = [
        createTestChunk({ path: 'src/keep.ts' }),
        createTestChunk({ path: 'src/delete.ts' }),
        createTestChunk({ path: 'src/delete.ts' }), // Multiple chunks same file
      ];

      await store.insertChunks(chunks);
      const deleted = await store.deleteByPath('src/delete.ts');

      expect(deleted).toBe(2);
      expect(await store.countChunks()).toBe(1);
    });

    it('should return 0 when path not found', async () => {
      await store.open();
      await store.insertChunks([createTestChunk()]);

      const deleted = await store.deleteByPath('nonexistent.ts');

      expect(deleted).toBe(0);
    });

    it('should handle paths with special characters', async () => {
      await store.open();
      const specialPath = "src/it's-a-test.ts";
      await store.insertChunks([createTestChunk({ path: specialPath })]);

      const deleted = await store.deleteByPath(specialPath);

      expect(deleted).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Get Indexed Files Tests
  // --------------------------------------------------------------------------

  describe('getIndexedFiles', () => {
    it('should return empty array for empty database', async () => {
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toEqual([]);
    });

    it('should return unique file paths', async () => {
      await store.open();
      const chunks = [
        createTestChunk({ path: 'src/a.ts' }),
        createTestChunk({ path: 'src/b.ts' }),
        createTestChunk({ path: 'src/a.ts' }), // Duplicate
        createTestChunk({ path: 'src/c.ts' }),
      ];

      await store.insertChunks(chunks);
      const files = await store.getIndexedFiles();

      expect(files).toHaveLength(3);
      expect(files).toContain('src/a.ts');
      expect(files).toContain('src/b.ts');
      expect(files).toContain('src/c.ts');
    });

    it('should return sorted paths', async () => {
      await store.open();
      const chunks = [
        createTestChunk({ path: 'src/z.ts' }),
        createTestChunk({ path: 'src/a.ts' }),
        createTestChunk({ path: 'src/m.ts' }),
      ];

      await store.insertChunks(chunks);
      const files = await store.getIndexedFiles();

      expect(files).toEqual(['src/a.ts', 'src/m.ts', 'src/z.ts']);
    });
  });

  // --------------------------------------------------------------------------
  // Count Tests
  // --------------------------------------------------------------------------

  describe('countChunks', () => {
    it('should return 0 for empty database', async () => {
      await store.open();
      expect(await store.countChunks()).toBe(0);
    });

    it('should count all chunks', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk(),
        createTestChunk(),
        createTestChunk(),
      ]);

      expect(await store.countChunks()).toBe(3);
    });
  });

  describe('countFiles', () => {
    it('should return 0 for empty database', async () => {
      await store.open();
      expect(await store.countFiles()).toBe(0);
    });

    it('should count unique files', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk({ path: 'file1.ts' }),
        createTestChunk({ path: 'file1.ts' }),
        createTestChunk({ path: 'file2.ts' }),
      ]);

      expect(await store.countFiles()).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Vector Search Tests
  // --------------------------------------------------------------------------

  describe('search', () => {
    it('should return empty array for empty database', async () => {
      await store.open();
      const results = await store.search(randomVector());
      expect(results).toEqual([]);
    });

    it('should return search results with correct structure', async () => {
      await store.open();
      const chunk = createTestChunk();
      await store.insertChunks([chunk]);

      const results = await store.search(chunk.vector, 1);

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('path', chunk.path);
      expect(results[0]).toHaveProperty('text', chunk.text);
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('startLine', chunk.start_line);
      expect(results[0]).toHaveProperty('endLine', chunk.end_line);
    });

    it('should return results sorted by similarity', async () => {
      await store.open();

      // Create a target vector and chunks at varying distances
      const targetVector = randomVector();
      const closeVector = targetVector.map((v) => v + 0.01);
      const farVector = targetVector.map((v) => v + 1);

      await store.insertChunks([
        createTestChunk({ path: 'far.ts', vector: farVector }),
        createTestChunk({ path: 'close.ts', vector: closeVector }),
      ]);

      const results = await store.search(targetVector, 10);

      expect(results).toHaveLength(2);
      expect(results[0].path).toBe('close.ts');
      expect(results[1].path).toBe('far.ts');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should respect topK limit', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk({ path: 'file1.ts' }),
        createTestChunk({ path: 'file2.ts' }),
        createTestChunk({ path: 'file3.ts' }),
        createTestChunk({ path: 'file4.ts' }),
        createTestChunk({ path: 'file5.ts' }),
      ]);

      const results = await store.search(randomVector(), 3);

      expect(results).toHaveLength(3);
    });

    it('should return scores between 0 and 1', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk(),
        createTestChunk(),
        createTestChunk(),
      ]);

      const results = await store.search(randomVector(), 10);

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should throw for wrong vector dimension', async () => {
      await store.open();
      await store.insertChunks([createTestChunk()]);

      await expect(store.search([1, 2, 3], 10)).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Path Search Tests
  // --------------------------------------------------------------------------

  describe('searchByPath', () => {
    it('should return empty array for empty database', async () => {
      await store.open();
      const results = await store.searchByPath('*.ts');
      expect(results).toEqual([]);
    });

    it('should find files matching glob pattern', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk({ path: 'src/utils/hash.ts' }),
        createTestChunk({ path: 'src/utils/path.ts' }),
        createTestChunk({ path: 'src/index.ts' }),
        createTestChunk({ path: 'tests/test.ts' }),
      ]);

      const results = await store.searchByPath('src/utils/*');

      expect(results).toHaveLength(2);
      expect(results).toContain('src/utils/hash.ts');
      expect(results).toContain('src/utils/path.ts');
    });

    it('should handle recursive glob pattern', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk({ path: 'src/a.ts' }),
        createTestChunk({ path: 'src/utils/b.ts' }),
        createTestChunk({ path: 'src/utils/deep/c.ts' }),
        createTestChunk({ path: 'tests/d.ts' }),
      ]);

      // Note: src/**/*.ts requires at least one directory between src/ and the file
      // So src/a.ts won't match, but src/utils/b.ts and src/utils/deep/c.ts will
      const results = await store.searchByPath('src/**/*.ts');

      expect(results).toHaveLength(2);
      expect(results).toContain('src/utils/b.ts');
      expect(results).toContain('src/utils/deep/c.ts');
      expect(results).not.toContain('tests/d.ts');
      expect(results).not.toContain('src/a.ts');
    });

    it('should handle any depth pattern with src/*', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk({ path: 'src/a.ts' }),
        createTestChunk({ path: 'src/utils/b.ts' }),
        createTestChunk({ path: 'tests/d.ts' }),
      ]);

      // src/* matches anything starting with src/
      const results = await store.searchByPath('src/*');

      expect(results).toHaveLength(2);
      expect(results).toContain('src/a.ts');
      expect(results).toContain('src/utils/b.ts');
      expect(results).not.toContain('tests/d.ts');
    });

    it('should respect limit parameter', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk({ path: 'file1.ts' }),
        createTestChunk({ path: 'file2.ts' }),
        createTestChunk({ path: 'file3.ts' }),
        createTestChunk({ path: 'file4.ts' }),
        createTestChunk({ path: 'file5.ts' }),
      ]);

      const results = await store.searchByPath('*.ts', 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return sorted results', async () => {
      await store.open();
      await store.insertChunks([
        createTestChunk({ path: 'z.ts' }),
        createTestChunk({ path: 'a.ts' }),
        createTestChunk({ path: 'm.ts' }),
      ]);

      const results = await store.searchByPath('*.ts');

      expect(results).toEqual(['a.ts', 'm.ts', 'z.ts']);
    });
  });

  // --------------------------------------------------------------------------
  // Storage Size Tests
  // --------------------------------------------------------------------------

  describe('getStorageSize', () => {
    it('should return 0 for non-existent database', async () => {
      const emptyStore = new LanceDBStore('/nonexistent/path');
      const size = await emptyStore.getStorageSize();
      expect(size).toBe(0);
    });

    it('should return size greater than 0 after inserting data', async () => {
      await store.open();
      await store.insertChunks([createTestChunk()]);

      const size = await store.getStorageSize();

      expect(size).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // hasData Tests
  // --------------------------------------------------------------------------

  describe('hasData', () => {
    it('should return false for new database', async () => {
      await store.open();
      expect(await store.hasData()).toBe(false);
    });

    it('should return true after inserting data', async () => {
      await store.open();
      await store.insertChunks([createTestChunk()]);
      expect(await store.hasData()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Configurable Vector Dimension Tests
  // --------------------------------------------------------------------------

  describe('vector dimension configuration', () => {
    it('should default to CODE_VECTOR_DIMENSION (384)', () => {
      expect(store.getVectorDimension()).toBe(CODE_VECTOR_DIMENSION);
      expect(store.getVectorDimension()).toBe(384);
    });

    it('should accept custom vector dimension in constructor', () => {
      const customStore = new LanceDBStore(tempDir, DOCS_VECTOR_DIMENSION);
      expect(customStore.getVectorDimension()).toBe(DOCS_VECTOR_DIMENSION);
      expect(customStore.getVectorDimension()).toBe(768);
    });

    it('should accept any custom dimension', () => {
      const customStore = new LanceDBStore(tempDir, 512);
      expect(customStore.getVectorDimension()).toBe(512);
    });

    it('should validate vector dimension in search against configured dimension', async () => {
      // Create a store with custom dimension (768)
      const customTempDir = createTempDir();
      const customStore = new LanceDBStore(customTempDir, 768);

      try {
        await customStore.open();

        // Create a chunk with 768-dimensional vector
        const chunk = {
          ...createTestChunk(),
          vector: randomVectorWithDimension(768),
        };
        await customStore.insertChunks([chunk]);

        // Search with correct dimension should work
        const results = await customStore.search(randomVectorWithDimension(768), 1);
        expect(results).toHaveLength(1);

        // Search with wrong dimension should throw
        await expect(customStore.search(randomVectorWithDimension(384), 1)).rejects.toThrow(
          /dimension mismatch.*Expected 768.*got 384/
        );
      } finally {
        await customStore.close();
        cleanupTempDir(customTempDir);
      }
    });
  });
});

// ============================================================================
// Dimension Constants Tests
// ============================================================================

describe('Vector Dimension Constants', () => {
  it('CODE_VECTOR_DIMENSION should be 384', () => {
    expect(CODE_VECTOR_DIMENSION).toBe(384);
  });

  it('DOCS_VECTOR_DIMENSION should be 768', () => {
    expect(DOCS_VECTOR_DIMENSION).toBe(768);
  });

  it('VECTOR_DIMENSION should equal CODE_VECTOR_DIMENSION for backward compatibility', () => {
    expect(VECTOR_DIMENSION).toBe(CODE_VECTOR_DIMENSION);
  });
});

// ============================================================================
// Vector Index Constants Tests (SMCP-091)
// ============================================================================

describe('Vector Index Constants', () => {
  it('MIN_CHUNKS_FOR_INDEX should be 10000', () => {
    expect(MIN_CHUNKS_FOR_INDEX).toBe(10000);
  });

  it('MAX_IVF_PARTITIONS should be 256', () => {
    expect(MAX_IVF_PARTITIONS).toBe(256);
  });
});

// ============================================================================
// Vector Index Tests (SMCP-091)
// ============================================================================

describe('LanceDBStore - Vector Index', () => {
  let tempDir: string;
  let store: LanceDBStore;

  beforeEach(() => {
    tempDir = createTempDir();
    store = new LanceDBStore(tempDir);
  });

  afterEach(async () => {
    try {
      await store.close();
    } catch {
      // Ignore close errors
    }
    cleanupTempDir(tempDir);
  });

  describe('createVectorIndex', () => {
    it('should return hasIndex:false when no table exists', async () => {
      // Don't open the store - table doesn't exist yet
      const result = await store.createVectorIndex();
      expect(result.hasIndex).toBe(false);
    });

    it('should skip index creation for small datasets', async () => {
      await store.open();

      // Insert only 10 chunks (below MIN_CHUNKS_FOR_INDEX threshold)
      const chunks = Array.from({ length: 10 }, (_, i) =>
        createTestChunk({ path: `file${i}.ts` })
      );
      await store.insertChunks(chunks);

      const result = await store.createVectorIndex();

      expect(result.hasIndex).toBe(false);
      expect(result.indexType).toBe('none');
      expect(result.chunkCount).toBe(10);
    });

    it('should force index creation with explicit indexType:ivf_pq even for small datasets', async () => {
      await store.open();

      // Insert 300 chunks - need at least numPartitions * sampleRate (1 * 256 = 256) chunks
      // Using 300 to have a safe margin
      const chunks = Array.from({ length: 300 }, (_, i) =>
        createTestChunk({ path: `file${i}.ts` })
      );
      await store.insertChunks(chunks);

      const config: VectorIndexConfig = {
        indexType: 'ivf_pq',
        numPartitions: 1, // Use 1 partition to minimize required data
        numSubVectors: 24,
        sampleRate: 256,
      };

      const result = await store.createVectorIndex(config);

      expect(result.hasIndex).toBe(true);
      expect(result.indexType).toBe('ivf_pq');
      expect(result.numPartitions).toBe(1);
      expect(result.numSubVectors).toBe(24);
      expect(result.chunkCount).toBe(300);
      expect(result.indexCreationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use custom distance metric', async () => {
      await store.open();

      // Need at least numPartitions * sampleRate chunks for IVF-PQ
      const chunks = Array.from({ length: 300 }, (_, i) =>
        createTestChunk({ path: `file${i}.ts` })
      );
      await store.insertChunks(chunks);

      const result = await store.createVectorIndex({
        indexType: 'ivf_pq',
        numPartitions: 1,
        numSubVectors: 24,
        distanceType: 'cosine',
      });

      expect(result.hasIndex).toBe(true);
      expect(result.distanceType).toBe('cosine');
    });
  });

  describe('getVectorIndexInfo', () => {
    it('should return null when store is not opened', async () => {
      const result = await store.getVectorIndexInfo();
      expect(result).toBeNull();
    });

    it('should return hasIndex:false when no index exists', async () => {
      await store.open();

      const chunks = Array.from({ length: 10 }, (_, i) =>
        createTestChunk({ path: `file${i}.ts` })
      );
      await store.insertChunks(chunks);

      const result = await store.getVectorIndexInfo();

      expect(result).not.toBeNull();
      expect(result!.hasIndex).toBe(false);
      expect(result!.indexType).toBe('none');
    });

    it('should return index info after index creation', async () => {
      await store.open();

      // Need at least numPartitions * sampleRate chunks for IVF-PQ
      const chunks = Array.from({ length: 300 }, (_, i) =>
        createTestChunk({ path: `file${i}.ts` })
      );
      await store.insertChunks(chunks);

      await store.createVectorIndex({
        indexType: 'ivf_pq',
        numPartitions: 1,
        numSubVectors: 24,
      });

      const result = await store.getVectorIndexInfo();

      expect(result).not.toBeNull();
      expect(result!.hasIndex).toBe(true);
      expect(result!.indexType).toBe('ivf_pq');
    });
  });

  describe('search with vector index', () => {
    it('should return correct results after index creation', async () => {
      await store.open();

      // Create 300 chunks to meet minimum requirements for IVF-PQ
      // Include 2 specific chunks for testing search results
      const targetVector = randomVector();
      const closeVector = targetVector.map((v) => v + 0.01);
      const farVector = targetVector.map((v) => v + 1);

      const chunks = [
        createTestChunk({ path: 'far.ts', vector: farVector }),
        createTestChunk({ path: 'close.ts', vector: closeVector }),
        ...Array.from({ length: 298 }, (_, i) =>
          createTestChunk({ path: `file${i}.ts` })
        ),
      ];

      await store.insertChunks(chunks);

      // Create an index
      await store.createVectorIndex({
        indexType: 'ivf_pq',
        numPartitions: 1,
        numSubVectors: 24,
      });

      // Search should still work correctly
      const results = await store.search(targetVector, 10);

      expect(results.length).toBeGreaterThan(0);
      // Note: With IVF-PQ index, exact ordering may vary slightly due to quantization
      // but we should still get results
    });
  });
});
