/**
 * Merkle Tree Unit Tests
 *
 * Tests for the Merkle DAG change detection engine (SMCP-089).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  computeHash,
  computeChunkHash,
  computeChunkContentHash,
  computeFileHash,
  computeDirectoryHash,
  computeProjectHash,
  diffFileMaps,
  MerkleTreeManager,
  createMerkleTreeManager,
  buildMerkleTree,
  type FileNode,
  type ChunkNode,
  MERKLE_TREE_VERSION,
  MERKLE_TREE_FILE,
} from '../../../src/engines/merkleTree.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestChunk(overrides: Partial<{
  id: string;
  text: string;
  startLine: number;
  endLine: number;
  chunkType?: string;
  chunkName?: string;
}> = {}) {
  return {
    id: overrides.id ?? 'chunk-1',
    text: overrides.text ?? 'function test() { return 42; }',
    startLine: overrides.startLine ?? 1,
    endLine: overrides.endLine ?? 3,
    chunkType: overrides.chunkType,
    chunkName: overrides.chunkName,
  };
}

function createTestFileNode(
  filePath: string,
  chunks: Array<{ id: string; hash: string }>,
  contentHash: string = 'abc123'
): FileNode {
  const chunkMap = new Map<string, string>();
  const chunkOrder: string[] = [];
  const chunkHashes: string[] = [];

  for (const chunk of chunks) {
    chunkMap.set(chunk.id, chunk.hash);
    chunkOrder.push(chunk.id);
    chunkHashes.push(chunk.hash);
  }

  return {
    type: 'file',
    path: filePath,
    hash: computeFileHash(chunkHashes),
    contentHash,
    size: 100,
    mtime: Date.now(),
    chunks: chunkMap,
    chunkOrder,
  };
}

// ============================================================================
// Hash Computation Tests
// ============================================================================

describe('Hash Computation Functions', () => {
  describe('computeHash', () => {
    it('should compute consistent SHA256 hashes', () => {
      const hash1 = computeHash('hello world');
      const hash2 = computeHash('hello world');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex string
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = computeHash('hello');
      const hash2 = computeHash('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = computeHash('');
      expect(hash).toHaveLength(64);
    });

    it('should handle unicode content', () => {
      const hash = computeHash('Hello! Unicode test');
      expect(hash).toHaveLength(64);
    });
  });

  describe('computeChunkHash', () => {
    it('should include position in hash', () => {
      const text = 'function test() {}';
      const hash1 = computeChunkHash(text, 1, 5);
      const hash2 = computeChunkHash(text, 10, 15);
      expect(hash1).not.toBe(hash2);
    });

    it('should be deterministic', () => {
      const hash1 = computeChunkHash('code', 1, 3);
      const hash2 = computeChunkHash('code', 1, 3);
      expect(hash1).toBe(hash2);
    });
  });

  describe('computeChunkContentHash', () => {
    it('should hash content only (position-independent)', () => {
      const text = 'function test() {}';
      const hash1 = computeChunkContentHash(text);
      const hash2 = computeChunkContentHash(text);
      expect(hash1).toBe(hash2);
    });

    it('should differ for different content', () => {
      const hash1 = computeChunkContentHash('function a() {}');
      const hash2 = computeChunkContentHash('function b() {}');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeFileHash', () => {
    it('should combine chunk hashes in order', () => {
      const hashes1 = ['hash1', 'hash2', 'hash3'];
      const hashes2 = ['hash1', 'hash2', 'hash3'];
      expect(computeFileHash(hashes1)).toBe(computeFileHash(hashes2));
    });

    it('should be sensitive to chunk order', () => {
      const hashes1 = ['hash1', 'hash2', 'hash3'];
      const hashes2 = ['hash3', 'hash2', 'hash1'];
      expect(computeFileHash(hashes1)).not.toBe(computeFileHash(hashes2));
    });

    it('should handle empty chunk list', () => {
      const hash = computeFileHash([]);
      expect(hash).toHaveLength(64);
    });
  });

  describe('computeDirectoryHash', () => {
    it('should sort children by name', () => {
      const children1 = new Map([['b', 'hash2'], ['a', 'hash1']]);
      const children2 = new Map([['a', 'hash1'], ['b', 'hash2']]);
      expect(computeDirectoryHash(children1)).toBe(computeDirectoryHash(children2));
    });

    it('should differ with different children', () => {
      const children1 = new Map([['a', 'hash1']]);
      const children2 = new Map([['a', 'hash2']]);
      expect(computeDirectoryHash(children1)).not.toBe(computeDirectoryHash(children2));
    });
  });

  describe('computeProjectHash', () => {
    it('should sort files by path', () => {
      const files1 = new Map([['src/b.ts', 'hash2'], ['src/a.ts', 'hash1']]);
      const files2 = new Map([['src/a.ts', 'hash1'], ['src/b.ts', 'hash2']]);
      expect(computeProjectHash(files1)).toBe(computeProjectHash(files2));
    });

    it('should detect any file change', () => {
      const files1 = new Map([['src/a.ts', 'hash1']]);
      const files2 = new Map([['src/a.ts', 'hash2']]);
      expect(computeProjectHash(files1)).not.toBe(computeProjectHash(files2));
    });
  });
});

// ============================================================================
// Diff Algorithm Tests
// ============================================================================

describe('Diff Algorithm', () => {
  describe('diffFileMaps', () => {
    it('should detect added files', () => {
      const oldFiles = new Map<string, FileNode>();
      const newFiles = new Map<string, FileNode>();
      newFiles.set('src/new.ts', createTestFileNode('src/new.ts', [
        { id: 'c1', hash: 'h1' },
      ]));

      const diff = diffFileMaps(oldFiles, newFiles);

      expect(diff.addedFiles).toContain('src/new.ts');
      expect(diff.modifiedFiles).toHaveLength(0);
      expect(diff.removedFiles).toHaveLength(0);
      expect(diff.totalChanges).toBe(1);
    });

    it('should detect removed files', () => {
      const oldFiles = new Map<string, FileNode>();
      oldFiles.set('src/old.ts', createTestFileNode('src/old.ts', [
        { id: 'c1', hash: 'h1' },
      ]));
      const newFiles = new Map<string, FileNode>();

      const diff = diffFileMaps(oldFiles, newFiles);

      expect(diff.removedFiles).toContain('src/old.ts');
      expect(diff.addedFiles).toHaveLength(0);
      expect(diff.modifiedFiles).toHaveLength(0);
      expect(diff.totalChanges).toBe(1);
    });

    it('should detect modified files (different content hash)', () => {
      const oldFiles = new Map<string, FileNode>();
      oldFiles.set('src/file.ts', createTestFileNode('src/file.ts', [
        { id: 'c1', hash: 'h1' },
      ], 'content-v1'));

      const newFiles = new Map<string, FileNode>();
      newFiles.set('src/file.ts', createTestFileNode('src/file.ts', [
        { id: 'c1', hash: 'h2' },
      ], 'content-v2'));

      const diff = diffFileMaps(oldFiles, newFiles);

      expect(diff.modifiedFiles).toContain('src/file.ts');
      expect(diff.totalChanges).toBe(1);
    });

    it('should detect unchanged files', () => {
      const fileNode = createTestFileNode('src/file.ts', [
        { id: 'c1', hash: 'h1' },
      ]);

      const oldFiles = new Map<string, FileNode>([['src/file.ts', fileNode]]);
      const newFiles = new Map<string, FileNode>([['src/file.ts', fileNode]]);

      const diff = diffFileMaps(oldFiles, newFiles);

      expect(diff.addedFiles).toHaveLength(0);
      expect(diff.modifiedFiles).toHaveLength(0);
      expect(diff.removedFiles).toHaveLength(0);
      expect(diff.totalChanges).toBe(0);
    });

    it('should detect multiple changes at once', () => {
      const oldFiles = new Map<string, FileNode>();
      oldFiles.set('src/removed.ts', createTestFileNode('src/removed.ts', [{ id: 'c1', hash: 'h1' }]));
      oldFiles.set('src/modified.ts', createTestFileNode('src/modified.ts', [{ id: 'c2', hash: 'h2' }], 'v1'));
      oldFiles.set('src/unchanged.ts', createTestFileNode('src/unchanged.ts', [{ id: 'c3', hash: 'h3' }]));

      const newFiles = new Map<string, FileNode>();
      newFiles.set('src/added.ts', createTestFileNode('src/added.ts', [{ id: 'c4', hash: 'h4' }]));
      newFiles.set('src/modified.ts', createTestFileNode('src/modified.ts', [{ id: 'c2', hash: 'h5' }], 'v2'));
      newFiles.set('src/unchanged.ts', createTestFileNode('src/unchanged.ts', [{ id: 'c3', hash: 'h3' }]));

      const diff = diffFileMaps(oldFiles, newFiles);

      expect(diff.addedFiles).toContain('src/added.ts');
      expect(diff.removedFiles).toContain('src/removed.ts');
      expect(diff.modifiedFiles).toContain('src/modified.ts');
      expect(diff.totalChanges).toBe(3);
    });

    it('should detect chunk-level changes when content hash is same', () => {
      // Same content hash but different chunk hashes (different chunking)
      const oldFile = createTestFileNode('src/file.ts', [
        { id: 'c1', hash: 'h1' },
        { id: 'c2', hash: 'h2' },
      ], 'same-content');

      const newFile = createTestFileNode('src/file.ts', [
        { id: 'c1', hash: 'h1' },
        { id: 'c3', hash: 'h3' }, // New chunk
      ], 'same-content');

      const oldFiles = new Map<string, FileNode>([['src/file.ts', oldFile]]);
      const newFiles = new Map<string, FileNode>([['src/file.ts', newFile]]);

      const diff = diffFileMaps(oldFiles, newFiles);

      // Should be detected as chunk-level change, not full modification
      expect(diff.chunkChanges).toHaveLength(1);
      expect(diff.chunkChanges[0].filePath).toBe('src/file.ts');
      expect(diff.chunkChanges[0].addedChunks).toContain('c3');
      expect(diff.chunkChanges[0].removedChunks).toContain('c2');
    });
  });
});

// ============================================================================
// MerkleTreeManager Tests
// ============================================================================

describe('MerkleTreeManager', () => {
  let tempDir: string;
  let manager: MerkleTreeManager;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'merkle-test-'));
    manager = new MerkleTreeManager(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('File Operations', () => {
    it('should add a file with chunks', () => {
      const chunks = [
        createTestChunk({ id: 'c1', text: 'chunk 1', startLine: 1, endLine: 5 }),
        createTestChunk({ id: 'c2', text: 'chunk 2', startLine: 6, endLine: 10 }),
      ];

      manager.addFile('src/file.ts', chunks, 'content-hash', { size: 200, mtime: Date.now() });

      expect(manager.hasFile('src/file.ts')).toBe(true);
      expect(manager.getFileCount()).toBe(1);
      expect(manager.getChunkCount()).toBe(2);
    });

    it('should remove a file and its chunks', () => {
      const chunks = [
        createTestChunk({ id: 'c1' }),
        createTestChunk({ id: 'c2' }),
      ];

      manager.addFile('src/file.ts', chunks, 'hash', { size: 100, mtime: Date.now() });
      expect(manager.getChunkCount()).toBe(2);

      manager.removeFile('src/file.ts');

      expect(manager.hasFile('src/file.ts')).toBe(false);
      expect(manager.getFileCount()).toBe(0);
      expect(manager.getChunkCount()).toBe(0);
    });

    it('should get file chunks in order', () => {
      const chunks = [
        createTestChunk({ id: 'c1', startLine: 1, endLine: 5 }),
        createTestChunk({ id: 'c2', startLine: 6, endLine: 10 }),
        createTestChunk({ id: 'c3', startLine: 11, endLine: 15 }),
      ];

      manager.addFile('src/file.ts', chunks, 'hash', { size: 100, mtime: Date.now() });

      const fileChunks = manager.getFileChunks('src/file.ts');
      expect(fileChunks).toHaveLength(3);
      expect(fileChunks[0].startLine).toBe(1);
      expect(fileChunks[1].startLine).toBe(6);
      expect(fileChunks[2].startLine).toBe(11);
    });

    it('should update file when added again', () => {
      const chunks1 = [createTestChunk({ id: 'c1', text: 'old content' })];
      manager.addFile('src/file.ts', chunks1, 'hash1', { size: 100, mtime: Date.now() });

      const chunks2 = [createTestChunk({ id: 'c2', text: 'new content' })];
      manager.addFile('src/file.ts', chunks2, 'hash2', { size: 150, mtime: Date.now() });

      expect(manager.getFileCount()).toBe(1);
      const file = manager.getFile('src/file.ts');
      expect(file?.contentHash).toBe('hash2');
    });
  });

  describe('Root Hash Computation', () => {
    it('should compute deterministic root hash', () => {
      const chunks = [createTestChunk({ id: 'c1' })];
      manager.addFile('src/file.ts', chunks, 'hash', { size: 100, mtime: 12345 });

      const hash1 = manager.computeRootHash();
      const hash2 = manager.computeRootHash();

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should change root hash when file is added', () => {
      const chunks = [createTestChunk({ id: 'c1' })];
      manager.addFile('src/file1.ts', chunks, 'hash1', { size: 100, mtime: 12345 });
      const hash1 = manager.computeRootHash();

      manager.addFile('src/file2.ts', chunks, 'hash2', { size: 100, mtime: 12345 });
      const hash2 = manager.computeRootHash();

      expect(hash1).not.toBe(hash2);
    });

    it('should change root hash when file is removed', () => {
      const chunks = [createTestChunk({ id: 'c1' }), createTestChunk({ id: 'c2' })];
      manager.addFile('src/file1.ts', [chunks[0]], 'hash1', { size: 100, mtime: 12345 });
      manager.addFile('src/file2.ts', [chunks[1]], 'hash2', { size: 100, mtime: 12345 });
      const hash1 = manager.computeRootHash();

      manager.removeFile('src/file2.ts');
      const hash2 = manager.computeRootHash();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Diff Computation', () => {
    it('should detect changes between managers', () => {
      const oldManager = new MerkleTreeManager(tempDir);
      oldManager.addFile('src/file.ts', [createTestChunk({ id: 'c1', text: 'old' })], 'old-hash', { size: 100, mtime: 12345 });
      oldManager.computeRootHash();

      manager.addFile('src/file.ts', [createTestChunk({ id: 'c1', text: 'new' })], 'new-hash', { size: 100, mtime: 12346 });
      manager.computeRootHash();

      const diff = manager.computeDiff(oldManager);

      expect(diff.modifiedFiles).toContain('src/file.ts');
      expect(diff.totalChanges).toBe(1);
    });

    it('should report no changes for identical trees', () => {
      const chunks = [createTestChunk({ id: 'c1' })];
      const oldManager = new MerkleTreeManager(tempDir);
      oldManager.addFile('src/file.ts', chunks, 'hash', { size: 100, mtime: 12345 });
      oldManager.computeRootHash();

      manager.addFile('src/file.ts', chunks, 'hash', { size: 100, mtime: 12345 });
      manager.computeRootHash();

      expect(manager.hasChanged(oldManager)).toBe(false);

      const diff = manager.computeDiff(oldManager);
      expect(diff.totalChanges).toBe(0);
    });

    it('should get changed files quickly', () => {
      const oldManager = new MerkleTreeManager(tempDir);
      oldManager.addFile('src/unchanged.ts', [createTestChunk({ id: 'c1' })], 'h1', { size: 100, mtime: 1 });
      oldManager.addFile('src/changed.ts', [createTestChunk({ id: 'c2', text: 'old' })], 'h2', { size: 100, mtime: 1 });
      oldManager.computeRootHash();

      manager.addFile('src/unchanged.ts', [createTestChunk({ id: 'c1' })], 'h1', { size: 100, mtime: 1 });
      manager.addFile('src/changed.ts', [createTestChunk({ id: 'c2', text: 'new' })], 'h3', { size: 100, mtime: 2 });
      manager.computeRootHash();

      const changed = manager.getChangedFiles(oldManager);
      expect(changed).toContain('src/changed.ts');
      expect(changed).not.toContain('src/unchanged.ts');
    });
  });

  describe('Persistence', () => {
    it('should save and load tree state', async () => {
      manager.addFile('src/file.ts', [
        createTestChunk({ id: 'c1', chunkType: 'function', chunkName: 'test' }),
      ], 'content-hash', { size: 100, mtime: 12345 });
      manager.computeRootHash();

      await manager.save();

      const loaded = new MerkleTreeManager(tempDir);
      await loaded.load();

      expect(loaded.getFileCount()).toBe(1);
      expect(loaded.getChunkCount()).toBe(1);
      expect(loaded.getRootHash()).toBe(manager.getRootHash());

      const chunk = loaded.getChunk('c1');
      expect(chunk?.chunkType).toBe('function');
      expect(chunk?.chunkName).toBe('test');
    });

    it('should handle missing file gracefully', async () => {
      await manager.load();
      expect(manager.loaded).toBe(true);
      expect(manager.getFileCount()).toBe(0);
    });

    it('should clear state', () => {
      manager.addFile('src/file.ts', [createTestChunk({ id: 'c1' })], 'hash', { size: 100, mtime: 1 });
      manager.computeRootHash();

      expect(manager.getFileCount()).toBe(1);

      manager.clear();

      expect(manager.getFileCount()).toBe(0);
      expect(manager.getChunkCount()).toBe(0);
      expect(manager.getRootHash()).toBe('');
    });

    it('should track dirty state', async () => {
      expect(manager.dirty).toBe(false);

      manager.addFile('src/file.ts', [createTestChunk({ id: 'c1' })], 'hash', { size: 100, mtime: 1 });
      expect(manager.dirty).toBe(true);

      await manager.save();
      expect(manager.dirty).toBe(false);
    });
  });

  describe('Content Hash Detection', () => {
    it('should find chunks by content hash', () => {
      const text = 'same content';
      manager.addFile('src/file1.ts', [
        createTestChunk({ id: 'c1', text, startLine: 1, endLine: 5 }),
      ], 'h1', { size: 100, mtime: 1 });
      manager.addFile('src/file2.ts', [
        createTestChunk({ id: 'c2', text, startLine: 10, endLine: 15 }),
      ], 'h2', { size: 100, mtime: 1 });

      const contentHash = computeChunkContentHash(text);
      const matches = manager.findChunksByContentHash(contentHash);

      expect(matches).toContain('c1');
      expect(matches).toContain('c2');
      expect(matches).toHaveLength(2);
    });
  });

  describe('Snapshot', () => {
    it('should create snapshot for rollback', () => {
      manager.addFile('src/file.ts', [createTestChunk({ id: 'c1' })], 'hash', { size: 100, mtime: 1 });
      manager.computeRootHash();

      const snapshot = manager.createSnapshot();

      // Modify original
      manager.addFile('src/file2.ts', [createTestChunk({ id: 'c2' })], 'hash2', { size: 100, mtime: 1 });
      manager.computeRootHash();

      // Snapshot should be unchanged
      expect(snapshot.getFileCount()).toBe(1);
      expect(manager.getFileCount()).toBe(2);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('Factory Functions', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'merkle-factory-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createMerkleTreeManager', () => {
    it('should create and load manager', async () => {
      const manager = await createMerkleTreeManager(tempDir);
      expect(manager.loaded).toBe(true);
    });
  });

  describe('buildMerkleTree', () => {
    it('should build tree from file data', async () => {
      const files = [
        {
          path: 'src/file1.ts',
          contentHash: 'ch1',
          size: 100,
          mtime: Date.now(),
          chunks: [
            { id: 'c1', text: 'function a() {}', startLine: 1, endLine: 3 },
            { id: 'c2', text: 'function b() {}', startLine: 4, endLine: 6 },
          ],
        },
        {
          path: 'src/file2.ts',
          contentHash: 'ch2',
          size: 200,
          mtime: Date.now(),
          chunks: [
            { id: 'c3', text: 'class C {}', startLine: 1, endLine: 5, chunkType: 'class', chunkName: 'C' },
          ],
        },
      ];

      const manager = await buildMerkleTree(tempDir, files);

      expect(manager.getFileCount()).toBe(2);
      expect(manager.getChunkCount()).toBe(3);
      expect(manager.getRootHash()).toHaveLength(64);

      const chunk = manager.getChunk('c3');
      expect(chunk?.chunkType).toBe('class');
      expect(chunk?.chunkName).toBe('C');
    });
  });
});
