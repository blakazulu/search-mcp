/**
 * Merkle Tree Integration Tests
 *
 * Tests the integration of Merkle DAG change detection with
 * the indexing pipeline (SMCP-089).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  MerkleTreeManager,
  buildMerkleTree,
  computeChunkContentHash,
  type MerkleDiff,
} from '../../src/engines/merkleTree.js';
import { chunkFile } from '../../src/engines/chunking.js';
import { hashFile } from '../../src/utils/hash.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface TestProject {
  rootDir: string;
  indexDir: string;
  files: Map<string, string>; // path -> content
}

async function createTestProject(): Promise<TestProject> {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'merkle-integ-project-'));
  const indexDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'merkle-integ-index-'));

  const files = new Map<string, string>();

  return { rootDir, indexDir, files };
}

async function writeTestFile(project: TestProject, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(project.rootDir, relativePath);
  const dir = path.dirname(absolutePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(absolutePath, content, 'utf-8');
  project.files.set(relativePath.replace(/\\/g, '/'), content);
}

async function cleanupProject(project: TestProject): Promise<void> {
  try {
    await fs.promises.rm(project.rootDir, { recursive: true, force: true });
    await fs.promises.rm(project.indexDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function buildMerkleTreeFromProject(project: TestProject): Promise<MerkleTreeManager> {
  const fileDataArray: Array<{
    path: string;
    contentHash: string;
    size: number;
    mtime: number;
    chunks: Array<{
      id: string;
      text: string;
      startLine: number;
      endLine: number;
    }>;
  }> = [];

  for (const [relativePath] of project.files) {
    const absolutePath = path.join(project.rootDir, relativePath);
    const stats = await fs.promises.stat(absolutePath);
    const contentHash = await hashFile(absolutePath);
    const chunks = await chunkFile(absolutePath, relativePath);

    fileDataArray.push({
      path: relativePath,
      contentHash,
      size: stats.size,
      mtime: stats.mtimeMs,
      chunks: chunks.map((c) => ({
        id: c.id,
        text: c.text,
        startLine: c.startLine,
        endLine: c.endLine,
      })),
    });
  }

  return buildMerkleTree(project.indexDir, fileDataArray);
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Merkle Tree Integration', () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject();
  });

  afterEach(async () => {
    await cleanupProject(project);
  });

  describe('Project Indexing', () => {
    it('should build Merkle tree from real files', async () => {
      await writeTestFile(project, 'src/index.ts', `
        export function main() {
          console.log('Hello World');
        }
      `);

      await writeTestFile(project, 'src/utils/helpers.ts', `
        export function add(a: number, b: number): number {
          return a + b;
        }

        export function subtract(a: number, b: number): number {
          return a - b;
        }
      `);

      const manager = await buildMerkleTreeFromProject(project);

      expect(manager.getFileCount()).toBe(2);
      expect(manager.getChunkCount()).toBeGreaterThan(0);
      expect(manager.getRootHash()).toHaveLength(64);
    });

    it('should persist and reload tree state', async () => {
      await writeTestFile(project, 'src/file.ts', 'const x = 1;');

      const manager1 = await buildMerkleTreeFromProject(project);
      const rootHash1 = manager1.getRootHash();
      await manager1.save();

      // Load in a new manager
      const manager2 = new MerkleTreeManager(project.indexDir);
      await manager2.load();

      expect(manager2.getFileCount()).toBe(1);
      expect(manager2.getRootHash()).toBe(rootHash1);
    });
  });

  describe('Change Detection', () => {
    it('should detect added file', async () => {
      // Initial state: one file
      await writeTestFile(project, 'src/a.ts', 'const a = 1;');
      const manager1 = await buildMerkleTreeFromProject(project);
      manager1.computeRootHash();

      // Add a new file
      await writeTestFile(project, 'src/b.ts', 'const b = 2;');
      const manager2 = await buildMerkleTreeFromProject(project);
      manager2.computeRootHash();

      const diff = manager2.computeDiff(manager1);

      expect(diff.addedFiles).toContain('src/b.ts');
      expect(diff.modifiedFiles).toHaveLength(0);
      expect(diff.removedFiles).toHaveLength(0);
      expect(diff.totalChanges).toBe(1);
    });

    it('should detect removed file', async () => {
      // Initial state: two files
      await writeTestFile(project, 'src/a.ts', 'const a = 1;');
      await writeTestFile(project, 'src/b.ts', 'const b = 2;');
      const manager1 = await buildMerkleTreeFromProject(project);
      manager1.computeRootHash();

      // Remove one file
      await fs.promises.unlink(path.join(project.rootDir, 'src/b.ts'));
      project.files.delete('src/b.ts');
      const manager2 = await buildMerkleTreeFromProject(project);
      manager2.computeRootHash();

      const diff = manager2.computeDiff(manager1);

      expect(diff.removedFiles).toContain('src/b.ts');
      expect(diff.addedFiles).toHaveLength(0);
      expect(diff.totalChanges).toBe(1);
    });

    it('should detect modified file', async () => {
      // Initial state
      await writeTestFile(project, 'src/file.ts', 'const x = 1;');
      const manager1 = await buildMerkleTreeFromProject(project);
      manager1.computeRootHash();

      // Modify the file
      await writeTestFile(project, 'src/file.ts', 'const x = 2; // changed');
      const manager2 = await buildMerkleTreeFromProject(project);
      manager2.computeRootHash();

      const diff = manager2.computeDiff(manager1);

      expect(diff.modifiedFiles).toContain('src/file.ts');
      expect(diff.totalChanges).toBe(1);
    });

    it('should report no changes for identical files', async () => {
      await writeTestFile(project, 'src/file.ts', 'const x = 1;');

      const manager1 = await buildMerkleTreeFromProject(project);
      manager1.computeRootHash();

      // Rebuild tree (simulates restart)
      const manager2 = await buildMerkleTreeFromProject(project);
      manager2.computeRootHash();

      expect(manager2.hasChanged(manager1)).toBe(false);

      const diff = manager2.computeDiff(manager1);
      expect(diff.totalChanges).toBe(0);
    });

    it('should detect multiple simultaneous changes', async () => {
      // Initial state
      await writeTestFile(project, 'src/unchanged.ts', 'const u = 0;');
      await writeTestFile(project, 'src/modified.ts', 'const m = 1;');
      await writeTestFile(project, 'src/removed.ts', 'const r = 2;');

      const manager1 = await buildMerkleTreeFromProject(project);
      manager1.computeRootHash();

      // Apply multiple changes
      await writeTestFile(project, 'src/added.ts', 'const a = 3;');
      await writeTestFile(project, 'src/modified.ts', 'const m = 100; // modified');
      await fs.promises.unlink(path.join(project.rootDir, 'src/removed.ts'));
      project.files.delete('src/removed.ts');

      const manager2 = await buildMerkleTreeFromProject(project);
      manager2.computeRootHash();

      const diff = manager2.computeDiff(manager1);

      expect(diff.addedFiles).toContain('src/added.ts');
      expect(diff.modifiedFiles).toContain('src/modified.ts');
      expect(diff.removedFiles).toContain('src/removed.ts');
      expect(diff.addedFiles).not.toContain('src/unchanged.ts');
      expect(diff.totalChanges).toBe(3);
    });
  });

  describe('Chunk-Level Detection', () => {
    it('should track chunks within files', async () => {
      const content = `
        // Function 1
        export function foo() {
          return 'foo';
        }

        // Function 2
        export function bar() {
          return 'bar';
        }

        // Function 3
        export function baz() {
          return 'baz';
        }
      `;

      await writeTestFile(project, 'src/functions.ts', content);

      const manager = await buildMerkleTreeFromProject(project);

      const file = manager.getFile('src/functions.ts');
      expect(file).toBeDefined();
      expect(file!.chunkOrder.length).toBeGreaterThan(0);

      const chunks = manager.getFileChunks('src/functions.ts');
      expect(chunks.length).toBeGreaterThan(0);

      // Each chunk should have position info
      for (const chunk of chunks) {
        expect(chunk.startLine).toBeGreaterThan(0);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
        expect(chunk.contentHash).toHaveLength(64);
      }
    });

    it('should find duplicate chunks by content hash', async () => {
      const duplicateContent = `
        export function helper() {
          return 42;
        }
      `;

      // Write the same function to two different files
      await writeTestFile(project, 'src/a.ts', duplicateContent);
      await writeTestFile(project, 'src/b.ts', duplicateContent);

      const manager = await buildMerkleTreeFromProject(project);

      // Get content hash from first file's chunk
      const chunksA = manager.getFileChunks('src/a.ts');
      expect(chunksA.length).toBeGreaterThan(0);

      const contentHash = chunksA[0].contentHash;

      // Should find matching chunks in both files
      const matches = manager.findChunksByContentHash(contentHash);
      expect(matches.length).toBe(2);
    });
  });

  describe('Performance Characteristics', () => {
    it('should use O(1) root hash comparison for change detection', async () => {
      // Create a project with many files
      for (let i = 0; i < 50; i++) {
        await writeTestFile(project, `src/file${i}.ts`, `export const x${i} = ${i};`);
      }

      const manager1 = await buildMerkleTreeFromProject(project);
      manager1.computeRootHash();

      // Rebuild the tree
      const manager2 = await buildMerkleTreeFromProject(project);
      manager2.computeRootHash();

      // hasChanged should be O(1) - just comparing root hashes
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        manager2.hasChanged(manager1);
      }
      const elapsed = performance.now() - start;

      // 1000 comparisons should be very fast (< 10ms)
      expect(elapsed).toBeLessThan(10);
    });

    it('should identify changed files without full diff', async () => {
      // Initial state
      for (let i = 0; i < 20; i++) {
        await writeTestFile(project, `src/file${i}.ts`, `export const x${i} = ${i};`);
      }

      const manager1 = await buildMerkleTreeFromProject(project);
      manager1.computeRootHash();

      // Modify just one file
      await writeTestFile(project, 'src/file5.ts', 'export const x5 = 500; // modified');
      const manager2 = await buildMerkleTreeFromProject(project);
      manager2.computeRootHash();

      // getChangedFiles should quickly identify only the changed file
      const changed = manager2.getChangedFiles(manager1);

      expect(changed).toContain('src/file5.ts');
      expect(changed).toHaveLength(1);
    });
  });

  describe('Snapshot and Recovery', () => {
    it('should create snapshot for safe rollback', async () => {
      await writeTestFile(project, 'src/file.ts', 'const x = 1;');

      const manager = await buildMerkleTreeFromProject(project);
      manager.computeRootHash();

      // Create snapshot
      const snapshot = manager.createSnapshot();
      const originalHash = snapshot.getRootHash();

      // Modify the manager (simulates failed operation)
      manager.addFile('src/new.ts', [], 'hash', { size: 0, mtime: Date.now() });
      manager.computeRootHash();

      // Snapshot should be unchanged
      expect(snapshot.getRootHash()).toBe(originalHash);
      expect(snapshot.getFileCount()).toBe(1);

      // Manager has been modified
      expect(manager.getFileCount()).toBe(2);
    });
  });
});

describe('Merkle vs Fingerprints Efficiency Comparison', () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject();
  });

  afterEach(async () => {
    await cleanupProject(project);
  });

  it('should demonstrate chunk-level change detection benefit', async () => {
    // Create a large file with multiple functions
    const functions = Array.from({ length: 10 }, (_, i) => `
      export function function${i}() {
        // Implementation for function ${i}
        return ${i};
      }
    `).join('\n');

    await writeTestFile(project, 'src/large-file.ts', functions);

    const manager1 = await buildMerkleTreeFromProject(project);
    manager1.computeRootHash();

    // With traditional fingerprints: entire file hash changes
    // With Merkle: we can see which chunks changed

    // Modify just one function
    const modifiedFunctions = functions.replace('return 5;', 'return 5000; // modified');
    await writeTestFile(project, 'src/large-file.ts', modifiedFunctions);

    const manager2 = await buildMerkleTreeFromProject(project);
    manager2.computeRootHash();

    // The file is detected as changed
    const diff = manager2.computeDiff(manager1);
    expect(diff.modifiedFiles.length + diff.chunkChanges.length).toBeGreaterThan(0);

    // With Merkle tree, we know the file changed
    // In a full implementation with stable chunk IDs, we could identify
    // exactly which chunks need re-embedding
    const file1 = manager1.getFile('src/large-file.ts');
    const file2 = manager2.getFile('src/large-file.ts');

    // Both should have chunks
    expect(file1?.chunkOrder.length).toBeGreaterThan(0);
    expect(file2?.chunkOrder.length).toBeGreaterThan(0);

    // File hash should be different (content changed)
    expect(file1?.hash).not.toBe(file2?.hash);
  });
});
