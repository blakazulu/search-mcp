/**
 * Docs LanceDB Store Unit Tests
 *
 * Tests for the documentation vector database wrapper including:
 * - Database lifecycle (open, close, delete)
 * - CRUD operations (insert, delete, get)
 * - Vector similarity search
 * - Path pattern search
 * - Isolation from code store (no cross-contamination)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import {
  DocsLanceDBStore,
  DOCS_TABLE_NAME,
  getDocsLanceDbPath,
  ChunkRecord,
  VECTOR_DIMENSION,
  LanceDBStore,
} from '../../../src/storage/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a temporary directory for test databases
 */
function createTempDir(): string {
  const tempBase = path.join(os.tmpdir(), 'search-mcp-docs-test');
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
  return Array.from({ length: VECTOR_DIMENSION }, () => Math.random() * 2 - 1);
}

/**
 * Generate a test chunk record for documentation
 */
function createTestDocChunk(overrides: Partial<ChunkRecord> = {}): ChunkRecord {
  return {
    id: uuidv4(),
    path: 'docs/readme.md',
    text: '# Getting Started\n\nThis is the documentation for the project.',
    vector: randomVector(),
    start_line: 1,
    end_line: 3,
    content_hash: 'doc123def456',
    ...overrides,
  };
}

// ============================================================================
// Path Helper Tests
// ============================================================================

describe('getDocsLanceDbPath', () => {
  it('should return docs.lancedb subdirectory', () => {
    const indexPath = '/home/user/.mcp/search/indexes/abc123';
    const result = getDocsLanceDbPath(indexPath);
    expect(result).toBe(path.join(indexPath, 'docs.lancedb'));
  });

  it('should handle Windows paths', () => {
    const indexPath = 'C:\\Users\\dev\\.mcp\\search\\indexes\\abc123';
    const result = getDocsLanceDbPath(indexPath);
    expect(result).toBe(path.join(indexPath, 'docs.lancedb'));
  });
});

describe('DOCS_TABLE_NAME', () => {
  it('should be project_docs_prose', () => {
    expect(DOCS_TABLE_NAME).toBe('project_docs_prose');
  });
});

// ============================================================================
// DocsLanceDBStore Tests
// ============================================================================

describe('DocsLanceDBStore', () => {
  let tempDir: string;
  let store: DocsLanceDBStore;

  beforeEach(() => {
    tempDir = createTempDir();
    store = new DocsLanceDBStore(tempDir);
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

    it('should create docs.lancedb directory', async () => {
      await store.open();
      const dbPath = getDocsLanceDbPath(tempDir);
      expect(fs.existsSync(dbPath)).toBe(true);
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
      const chunk = createTestDocChunk();
      await store.insertChunks([chunk]);
      await store.delete();

      expect(store.opened).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'docs.lancedb'))).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Insert Tests
  // --------------------------------------------------------------------------

  describe('insertChunks', () => {
    it('should insert a single chunk', async () => {
      await store.open();
      const chunk = createTestDocChunk();

      await store.insertChunks([chunk]);

      const count = await store.countChunks();
      expect(count).toBe(1);
    });

    it('should insert multiple chunks', async () => {
      await store.open();
      const chunks = [
        createTestDocChunk({ path: 'docs/readme.md' }),
        createTestDocChunk({ path: 'docs/getting-started.md' }),
        createTestDocChunk({ path: 'docs/api.md' }),
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
        createTestDocChunk({
          path: `docs/file${i}.md`,
          text: `Documentation content ${i}`,
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
        createTestDocChunk({ path: 'docs/keep.md' }),
        createTestDocChunk({ path: 'docs/delete.md' }),
        createTestDocChunk({ path: 'docs/delete.md' }), // Multiple chunks same file
      ];

      await store.insertChunks(chunks);
      const deleted = await store.deleteByPath('docs/delete.md');

      expect(deleted).toBe(2);
      expect(await store.countChunks()).toBe(1);
    });

    it('should return 0 when path not found', async () => {
      await store.open();
      await store.insertChunks([createTestDocChunk()]);

      const deleted = await store.deleteByPath('nonexistent.md');

      expect(deleted).toBe(0);
    });

    it('should handle paths with special characters', async () => {
      await store.open();
      const specialPath = "docs/it's-a-test.md";
      await store.insertChunks([createTestDocChunk({ path: specialPath })]);

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
        createTestDocChunk({ path: 'docs/a.md' }),
        createTestDocChunk({ path: 'docs/b.md' }),
        createTestDocChunk({ path: 'docs/a.md' }), // Duplicate
        createTestDocChunk({ path: 'docs/c.md' }),
      ];

      await store.insertChunks(chunks);
      const files = await store.getIndexedFiles();

      expect(files).toHaveLength(3);
      expect(files).toContain('docs/a.md');
      expect(files).toContain('docs/b.md');
      expect(files).toContain('docs/c.md');
    });

    it('should return sorted paths', async () => {
      await store.open();
      const chunks = [
        createTestDocChunk({ path: 'docs/z.md' }),
        createTestDocChunk({ path: 'docs/a.md' }),
        createTestDocChunk({ path: 'docs/m.md' }),
      ];

      await store.insertChunks(chunks);
      const files = await store.getIndexedFiles();

      expect(files).toEqual(['docs/a.md', 'docs/m.md', 'docs/z.md']);
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
        createTestDocChunk(),
        createTestDocChunk(),
        createTestDocChunk(),
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
        createTestDocChunk({ path: 'file1.md' }),
        createTestDocChunk({ path: 'file1.md' }),
        createTestDocChunk({ path: 'file2.md' }),
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
      const chunk = createTestDocChunk();
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
        createTestDocChunk({ path: 'far.md', vector: farVector }),
        createTestDocChunk({ path: 'close.md', vector: closeVector }),
      ]);

      const results = await store.search(targetVector, 10);

      expect(results).toHaveLength(2);
      expect(results[0].path).toBe('close.md');
      expect(results[1].path).toBe('far.md');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should respect topK limit', async () => {
      await store.open();
      await store.insertChunks([
        createTestDocChunk({ path: 'file1.md' }),
        createTestDocChunk({ path: 'file2.md' }),
        createTestDocChunk({ path: 'file3.md' }),
        createTestDocChunk({ path: 'file4.md' }),
        createTestDocChunk({ path: 'file5.md' }),
      ]);

      const results = await store.search(randomVector(), 3);

      expect(results).toHaveLength(3);
    });

    it('should return scores between 0 and 1', async () => {
      await store.open();
      await store.insertChunks([
        createTestDocChunk(),
        createTestDocChunk(),
        createTestDocChunk(),
      ]);

      const results = await store.search(randomVector(), 10);

      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should throw for wrong vector dimension', async () => {
      await store.open();
      await store.insertChunks([createTestDocChunk()]);

      await expect(store.search([1, 2, 3], 10)).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Path Search Tests
  // --------------------------------------------------------------------------

  describe('searchByPath', () => {
    it('should return empty array for empty database', async () => {
      await store.open();
      const results = await store.searchByPath('*.md');
      expect(results).toEqual([]);
    });

    it('should find files matching glob pattern', async () => {
      await store.open();
      await store.insertChunks([
        createTestDocChunk({ path: 'docs/guides/setup.md' }),
        createTestDocChunk({ path: 'docs/guides/deploy.md' }),
        createTestDocChunk({ path: 'docs/index.md' }),
        createTestDocChunk({ path: 'README.md' }),
      ]);

      const results = await store.searchByPath('docs/guides/*');

      expect(results).toHaveLength(2);
      expect(results).toContain('docs/guides/setup.md');
      expect(results).toContain('docs/guides/deploy.md');
    });

    it('should handle recursive glob pattern', async () => {
      await store.open();
      await store.insertChunks([
        createTestDocChunk({ path: 'docs/a.md' }),
        createTestDocChunk({ path: 'docs/guides/b.md' }),
        createTestDocChunk({ path: 'docs/guides/deep/c.md' }),
        createTestDocChunk({ path: 'README.md' }),
      ]);

      // Note: docs/**/*.md requires at least one directory between docs/ and the file
      const results = await store.searchByPath('docs/**/*.md');

      expect(results).toHaveLength(2);
      expect(results).toContain('docs/guides/b.md');
      expect(results).toContain('docs/guides/deep/c.md');
      expect(results).not.toContain('README.md');
      expect(results).not.toContain('docs/a.md');
    });

    it('should respect limit parameter', async () => {
      await store.open();
      await store.insertChunks([
        createTestDocChunk({ path: 'file1.md' }),
        createTestDocChunk({ path: 'file2.md' }),
        createTestDocChunk({ path: 'file3.md' }),
        createTestDocChunk({ path: 'file4.md' }),
        createTestDocChunk({ path: 'file5.md' }),
      ]);

      const results = await store.searchByPath('*.md', 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return sorted results', async () => {
      await store.open();
      await store.insertChunks([
        createTestDocChunk({ path: 'z.md' }),
        createTestDocChunk({ path: 'a.md' }),
        createTestDocChunk({ path: 'm.md' }),
      ]);

      const results = await store.searchByPath('*.md');

      expect(results).toEqual(['a.md', 'm.md', 'z.md']);
    });
  });

  // --------------------------------------------------------------------------
  // Storage Size Tests
  // --------------------------------------------------------------------------

  describe('getStorageSize', () => {
    it('should return 0 for non-existent database', async () => {
      const emptyStore = new DocsLanceDBStore('/nonexistent/path');
      const size = await emptyStore.getStorageSize();
      expect(size).toBe(0);
    });

    it('should return size greater than 0 after inserting data', async () => {
      await store.open();
      await store.insertChunks([createTestDocChunk()]);

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
      await store.insertChunks([createTestDocChunk()]);
      expect(await store.hasData()).toBe(true);
    });
  });
});

// ============================================================================
// Isolation Tests - Ensure docs store is separate from code store
// ============================================================================

describe('Store Isolation', () => {
  let tempDir: string;
  let docsStore: DocsLanceDBStore;
  let codeStore: LanceDBStore;

  beforeEach(() => {
    tempDir = createTempDir();
    docsStore = new DocsLanceDBStore(tempDir);
    codeStore = new LanceDBStore(tempDir);
  });

  afterEach(async () => {
    try {
      await docsStore.close();
      await codeStore.close();
    } catch {
      // Ignore close errors in cleanup
    }
    cleanupTempDir(tempDir);
  });

  it('should use different database directories', async () => {
    await docsStore.open();
    await codeStore.open();

    const docsDbPath = getDocsLanceDbPath(tempDir);
    const codeDbPath = path.join(tempDir, 'index.lancedb');

    expect(docsDbPath).not.toBe(codeDbPath);
    expect(fs.existsSync(docsDbPath)).toBe(true);
    expect(fs.existsSync(codeDbPath)).toBe(true);
  });

  it('should store data independently (no cross-contamination)', async () => {
    await docsStore.open();
    await codeStore.open();

    // Insert documentation chunks
    await docsStore.insertChunks([
      createTestDocChunk({ path: 'docs/readme.md', text: 'Documentation content' }),
      createTestDocChunk({ path: 'docs/guide.md', text: 'Guide content' }),
    ]);

    // Insert code chunks
    const codeChunk: ChunkRecord = {
      id: uuidv4(),
      path: 'src/index.ts',
      text: 'function main() { return 42; }',
      vector: randomVector(),
      start_line: 1,
      end_line: 1,
      content_hash: 'code123',
    };
    await codeStore.insertChunks([codeChunk]);

    // Verify each store has its own data
    expect(await docsStore.countChunks()).toBe(2);
    expect(await codeStore.countChunks()).toBe(1);

    // Verify files are separate
    const docsFiles = await docsStore.getIndexedFiles();
    const codeFiles = await codeStore.getIndexedFiles();

    expect(docsFiles).toContain('docs/readme.md');
    expect(docsFiles).toContain('docs/guide.md');
    expect(docsFiles).not.toContain('src/index.ts');

    expect(codeFiles).toContain('src/index.ts');
    expect(codeFiles).not.toContain('docs/readme.md');
    expect(codeFiles).not.toContain('docs/guide.md');
  });

  it('should delete independently', async () => {
    await docsStore.open();
    await codeStore.open();

    // Insert data in both stores
    await docsStore.insertChunks([createTestDocChunk({ path: 'docs/test.md' })]);
    await codeStore.insertChunks([
      {
        id: uuidv4(),
        path: 'src/test.ts',
        text: 'test code',
        vector: randomVector(),
        start_line: 1,
        end_line: 1,
        content_hash: 'test123',
      },
    ]);

    // Delete docs store
    await docsStore.delete();

    // Verify code store still has data
    expect(await codeStore.countChunks()).toBe(1);
    expect(fs.existsSync(path.join(tempDir, 'index.lancedb'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'docs.lancedb'))).toBe(false);
  });

  it('should search independently', async () => {
    await docsStore.open();
    await codeStore.open();

    // Create a specific vector to search for
    const targetVector = randomVector();

    // Insert similar chunks in both stores
    await docsStore.insertChunks([
      createTestDocChunk({ path: 'docs/match.md', vector: targetVector.map((v) => v + 0.01) }),
    ]);

    await codeStore.insertChunks([
      {
        id: uuidv4(),
        path: 'src/match.ts',
        text: 'code match',
        vector: targetVector.map((v) => v + 0.02),
        start_line: 1,
        end_line: 1,
        content_hash: 'match123',
      },
    ]);

    // Search in docs store
    const docsResults = await docsStore.search(targetVector, 10);
    expect(docsResults).toHaveLength(1);
    expect(docsResults[0].path).toBe('docs/match.md');

    // Search in code store
    const codeResults = await codeStore.search(targetVector, 10);
    expect(codeResults).toHaveLength(1);
    expect(codeResults[0].path).toBe('src/match.ts');
  });
});
