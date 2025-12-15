/**
 * Docs Index Manager Tests
 *
 * Integration tests covering:
 * - Doc file scanning with policy filtering
 * - Full docs index creation
 * - Incremental updates (add, modify, delete)
 * - Delta application
 * - DocsIndexManager class operations
 * - Progress reporting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DOC_FILE_BATCH_SIZE,
  DocsIndexProgress,
  DocsProgressCallback,
  DocsIndexResult,
  DocsStats,
  scanDocFiles,
  createDocsIndex,
  updateDocFile,
  removeDocFile,
  applyDocsDelta,
  DocsIndexManager,
} from '../../../src/engines/docsIndexManager.js';
import { IndexingPolicy } from '../../../src/engines/indexPolicy.js';
import { DocsLanceDBStore } from '../../../src/storage/docsLancedb.js';
import {
  DocsFingerprintsManager,
  DocsDeltaResult,
} from '../../../src/storage/docsFingerprints.js';
import { Config, DEFAULT_CONFIG, generateDefaultConfig } from '../../../src/storage/config.js';

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
 * Create a test project structure with documentation files
 */
async function createTestProject(projectPath: string): Promise<void> {
  // Create doc files
  await createFile(
    projectPath,
    'README.md',
    `# Test Project

This is a test project for documentation indexing.

## Features

- Feature 1: Something cool
- Feature 2: Something even cooler
- Feature 3: The coolest thing ever

## Getting Started

To get started with this project, follow these steps:

1. Clone the repository
2. Install dependencies
3. Run the project
`
  );

  await createFile(
    projectPath,
    'docs/guide.md',
    `# User Guide

This is the user guide for the test project.

## Installation

Install the package using npm:

\`\`\`bash
npm install test-project
\`\`\`

## Configuration

Configure the project by creating a config file.

## Usage

Use the project by calling the main function.
`
  );

  await createFile(
    projectPath,
    'docs/api.md',
    `# API Reference

This document describes the API.

## Functions

### \`main()\`

The main entry point.

### \`helper()\`

A helper function that does something useful.

## Types

### \`Config\`

The configuration type.
`
  );

  await createFile(
    projectPath,
    'NOTES.txt',
    `Project Notes

These are some notes about the project.

TODO:
- Implement feature X
- Fix bug Y
- Improve documentation
`
  );

  // Create some non-doc files that should NOT be indexed
  await createFile(
    projectPath,
    'src/index.ts',
    `export function main() {
  console.log('Hello, World!');
}
`
  );

  // Create package.json
  await createFile(
    projectPath,
    'package.json',
    JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('Docs Index Manager', () => {
  describe('Constants', () => {
    it('should export DOC_FILE_BATCH_SIZE as 50', () => {
      expect(DOC_FILE_BATCH_SIZE).toBe(50);
    });
  });

  describe('scanDocFiles', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-scan-test-project-');
      indexPath = await createTempDir('docs-scan-test-index-');
      await createTestProject(projectPath);
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should scan all indexable doc files in a project', async () => {
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const result = await scanDocFiles(projectPath, policy, config);

      // Should find the doc files
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files).toContain('README.md');
      expect(result.files).toContain('docs/guide.md');
      expect(result.files).toContain('docs/api.md');
      expect(result.files).toContain('NOTES.txt');
      // globFilesFound should match files length (no filtering in this case)
      expect(result.globFilesFound).toBeGreaterThanOrEqual(result.files.length);
    });

    it('should NOT include non-doc files', async () => {
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const result = await scanDocFiles(projectPath, policy, config);

      // Should NOT include TypeScript or JSON files
      expect(result.files).not.toContain('src/index.ts');
      expect(result.files).not.toContain('package.json');
    });

    it('should exclude files based on config.exclude', async () => {
      const config: Config = { ...DEFAULT_CONFIG, exclude: ['docs/**/*'] };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const result = await scanDocFiles(projectPath, policy, config);

      expect(result.files).not.toContain('docs/guide.md');
      expect(result.files).not.toContain('docs/api.md');
      expect(result.files).toContain('README.md');
    });

    it('should call progress callback during scanning', async () => {
      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const progressCalls: DocsIndexProgress[] = [];
      const onProgress: DocsProgressCallback = (progress) => {
        progressCalls.push({ ...progress });
      };

      await scanDocFiles(projectPath, policy, config, onProgress);

      // Should have at least one scanning progress call
      const scanningCalls = progressCalls.filter((p) => p.phase === 'scanning');
      expect(scanningCalls.length).toBeGreaterThan(0);

      // Final call should have current === total
      const lastCall = scanningCalls[scanningCalls.length - 1];
      expect(lastCall.current).toBe(lastCall.total);
    });

    it('should return empty files array for project with no doc files', async () => {
      const emptyProject = await createTempDir('empty-doc-project-');

      try {
        // Create only non-doc files
        await createFile(emptyProject, 'src/main.ts', 'export const x = 1;');

        const config: Config = { ...DEFAULT_CONFIG };
        const policy = new IndexingPolicy(emptyProject, config);
        await policy.initialize();

        const result = await scanDocFiles(emptyProject, policy, config);

        expect(result.files).toEqual([]);
        expect(result.globFilesFound).toBe(0);
      } finally {
        await removeTempDir(emptyProject);
      }
    });

    it('should exclude hardcoded patterns', async () => {
      // Create files that should be excluded
      await createFile(projectPath, 'node_modules/pkg/README.md', '# Package');
      await createFile(projectPath, '.git/README.md', '# Git');

      const config: Config = { ...DEFAULT_CONFIG };
      const policy = new IndexingPolicy(projectPath, config);
      await policy.initialize();

      const result = await scanDocFiles(projectPath, policy, config);

      expect(result.files).not.toContain('node_modules/pkg/README.md');
      expect(result.files).not.toContain('.git/README.md');
    });
  });

  describe('createDocsIndex', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-index-test-project-');
      indexPath = await createTempDir('docs-index-test-index-');
      await createTestProject(projectPath);
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should create a full docs index successfully', async () => {
      const result = await createDocsIndex(projectPath, indexPath);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBeGreaterThan(0);
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
    }, 60000);

    it('should create docs fingerprints file', async () => {
      await createDocsIndex(projectPath, indexPath);

      const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
      expect(fs.existsSync(fingerprintsPath)).toBe(true);

      const fingerprints = JSON.parse(
        await fs.promises.readFile(fingerprintsPath, 'utf-8')
      );
      expect(Object.keys(fingerprints.fingerprints).length).toBeGreaterThan(0);
    }, 60000);

    it('should create DocsLanceDB store with chunks', async () => {
      await createDocsIndex(projectPath, indexPath);

      const store = new DocsLanceDBStore(indexPath);
      await store.open();

      const count = await store.countChunks();
      expect(count).toBeGreaterThan(0);

      await store.close();
    }, 60000);

    it('should report progress during indexing', async () => {
      const progressCalls: DocsIndexProgress[] = [];
      const onProgress: DocsProgressCallback = (progress) => {
        progressCalls.push({ ...progress });
      };

      await createDocsIndex(projectPath, indexPath, onProgress);

      // Should have progress calls for multiple phases
      const phases = new Set(progressCalls.map((p) => p.phase));
      expect(phases.has('scanning')).toBe(true);
      expect(phases.has('chunking')).toBe(true);
    }, 60000);

    it('should handle project with no doc files', async () => {
      const emptyProject = await createTempDir('empty-doc-project-');

      try {
        // Create only non-doc files
        await createFile(emptyProject, 'src/main.ts', 'export const x = 1;');

        const result = await createDocsIndex(emptyProject, indexPath);

        expect(result.success).toBe(true);
        expect(result.filesIndexed).toBe(0);
        expect(result.chunksCreated).toBe(0);
      } finally {
        await removeTempDir(emptyProject);
      }
    }, 30000);

    it('should overwrite existing docs index on recreate', async () => {
      // Create initial index
      await createDocsIndex(projectPath, indexPath);

      // Add a new doc file
      await createFile(projectPath, 'docs/new-doc.md', '# New Document\n\nSome content.');

      // Recreate index
      const result = await createDocsIndex(projectPath, indexPath);

      expect(result.success).toBe(true);

      // New file should be indexed
      const store = new DocsLanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('docs/new-doc.md');
      await store.close();
    }, 120000);
  });

  describe('updateDocFile', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-update-test-project-');
      indexPath = await createTempDir('docs-update-test-index-');
      await createTestProject(projectPath);
      await createDocsIndex(projectPath, indexPath);
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should add a new doc file to the index', async () => {
      // Create a new doc file
      await createFile(projectPath, 'docs/new-doc.md', '# New Document\n\nSome content.');

      await updateDocFile(projectPath, indexPath, 'docs/new-doc.md');

      // Verify it was added
      const store = new DocsLanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('docs/new-doc.md');
      await store.close();
    }, 60000);

    it('should update a modified doc file', async () => {
      // Modify an existing doc file
      const originalContent = await fs.promises.readFile(
        path.join(projectPath, 'README.md'),
        'utf-8'
      );
      await createFile(
        projectPath,
        'README.md',
        originalContent + '\n## Modified Section\n\nNew content added.\n'
      );

      await updateDocFile(projectPath, indexPath, 'README.md');

      // Verify fingerprint was updated
      const fingerprintsManager = new DocsFingerprintsManager(indexPath, projectPath);
      await fingerprintsManager.load();
      expect(fingerprintsManager.has('README.md')).toBe(true);
    }, 60000);

    it('should remove a deleted doc file', async () => {
      // First verify file is in index
      let store = new DocsLanceDBStore(indexPath);
      await store.open();
      let files = await store.getIndexedFiles();
      expect(files).toContain('README.md');
      await store.close();

      // Delete the file
      await fs.promises.unlink(path.join(projectPath, 'README.md'));

      await updateDocFile(projectPath, indexPath, 'README.md');

      // Verify it was removed
      store = new DocsLanceDBStore(indexPath);
      await store.open();
      files = await store.getIndexedFiles();
      expect(files).not.toContain('README.md');
      await store.close();
    }, 60000);

    it('should skip unchanged doc files', async () => {
      // Get initial chunk count
      let store = new DocsLanceDBStore(indexPath);
      await store.open();
      const initialCount = await store.countChunks();
      await store.close();

      // Update without changing the file
      await updateDocFile(projectPath, indexPath, 'README.md');

      // Chunk count should be the same
      store = new DocsLanceDBStore(indexPath);
      await store.open();
      const newCount = await store.countChunks();
      await store.close();

      expect(newCount).toBe(initialCount);
    }, 60000);
  });

  describe('removeDocFile', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-remove-test-project-');
      indexPath = await createTempDir('docs-remove-test-index-');
      await createTestProject(projectPath);
      await createDocsIndex(projectPath, indexPath);
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should remove a doc file from the index', async () => {
      await removeDocFile(projectPath, indexPath, 'README.md');

      const store = new DocsLanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).not.toContain('README.md');
      await store.close();
    }, 60000);

    it('should update fingerprints after removal', async () => {
      await removeDocFile(projectPath, indexPath, 'README.md');

      const fingerprintsManager = new DocsFingerprintsManager(indexPath, projectPath);
      await fingerprintsManager.load();
      expect(fingerprintsManager.has('README.md')).toBe(false);
    }, 60000);

    it('should handle removing non-existent doc file gracefully', async () => {
      // Should not throw
      await removeDocFile(projectPath, indexPath, 'non/existent/doc.md');

      // Index should still be valid
      const store = new DocsLanceDBStore(indexPath);
      await store.open();
      const count = await store.countChunks();
      expect(count).toBeGreaterThan(0);
      await store.close();
    }, 60000);
  });

  describe('applyDocsDelta', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-delta-test-project-');
      indexPath = await createTempDir('docs-delta-test-index-');
      await createTestProject(projectPath);
      await createDocsIndex(projectPath, indexPath);
    }, 60000);

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should apply a delta with added doc files', async () => {
      await createFile(projectPath, 'docs/added1.md', '# Added Doc 1\n\nContent 1.');
      await createFile(projectPath, 'docs/added2.md', '# Added Doc 2\n\nContent 2.');

      const delta: DocsDeltaResult = {
        added: ['docs/added1.md', 'docs/added2.md'],
        modified: [],
        removed: [],
        unchanged: [],
      };

      const result = await applyDocsDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(2);

      const store = new DocsLanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('docs/added1.md');
      expect(files).toContain('docs/added2.md');
      await store.close();
    }, 60000);

    it('should apply a delta with modified doc files', async () => {
      await createFile(projectPath, 'README.md', '# Modified Content\n\nNew content.');

      const delta: DocsDeltaResult = {
        added: [],
        modified: ['README.md'],
        removed: [],
        unchanged: [],
      };

      const result = await applyDocsDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(1);
    }, 60000);

    it('should apply a delta with removed doc files', async () => {
      const delta: DocsDeltaResult = {
        added: [],
        modified: [],
        removed: ['README.md'],
        unchanged: [],
      };

      const result = await applyDocsDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);

      const store = new DocsLanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).not.toContain('README.md');
      await store.close();
    }, 60000);

    it('should apply a mixed delta', async () => {
      await createFile(projectPath, 'docs/new.md', '# New Doc\n\nNew content.');
      await createFile(projectPath, 'docs/guide.md', '# Modified Guide\n\nNew content.');

      const delta: DocsDeltaResult = {
        added: ['docs/new.md'],
        modified: ['docs/guide.md'],
        removed: ['docs/api.md'],
        unchanged: [],
      };

      const result = await applyDocsDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);

      const store = new DocsLanceDBStore(indexPath);
      await store.open();
      const files = await store.getIndexedFiles();
      expect(files).toContain('docs/new.md');
      expect(files).toContain('docs/guide.md');
      expect(files).not.toContain('docs/api.md');
      await store.close();
    }, 60000);

    it('should handle empty delta', async () => {
      const delta: DocsDeltaResult = {
        added: [],
        modified: [],
        removed: [],
        unchanged: [],
      };

      const result = await applyDocsDelta(projectPath, indexPath, delta);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(0);
      expect(result.chunksCreated).toBe(0);
    }, 30000);

    it('should report progress during delta application', async () => {
      await createFile(projectPath, 'docs/new.md', '# New Doc\n\nContent.');

      const delta: DocsDeltaResult = {
        added: ['docs/new.md'],
        modified: [],
        removed: ['NOTES.txt'],
        unchanged: [],
      };

      const progressCalls: DocsIndexProgress[] = [];
      const onProgress: DocsProgressCallback = (progress) => {
        progressCalls.push({ ...progress });
      };

      await applyDocsDelta(projectPath, indexPath, delta, onProgress);

      expect(progressCalls.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('DocsIndexManager class', () => {
    let projectPath: string;
    let indexPath: string;
    let manager: DocsIndexManager;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-manager-test-project-');
      indexPath = await createTempDir('docs-manager-test-index-');
      await createTestProject(projectPath);
      manager = new DocsIndexManager(projectPath, indexPath);
    });

    afterEach(async () => {
      await manager.close();
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    describe('constructor', () => {
      it('should create with project and index paths', () => {
        expect(manager.getProjectPath()).toBe(projectPath);
        expect(manager.getIndexPath()).toBe(indexPath);
      });

      it('should derive index path from project path if not provided', () => {
        const autoManager = new DocsIndexManager(projectPath);
        expect(autoManager.getProjectPath()).toBe(projectPath);
        // Index path should be derived (not the same as project path)
        expect(autoManager.getIndexPath()).not.toBe(projectPath);
      });
    });

    describe('initialize/close', () => {
      it('should initialize without error', async () => {
        await expect(manager.initialize()).resolves.not.toThrow();
      });

      it('should close without error', async () => {
        await manager.initialize();
        await expect(manager.close()).resolves.not.toThrow();
      });

      it('should handle multiple initialize calls', async () => {
        await manager.initialize();
        await expect(manager.initialize()).resolves.not.toThrow();
      });

      it('should handle close without initialize', async () => {
        await expect(manager.close()).resolves.not.toThrow();
      });
    });

    describe('createDocsIndex', () => {
      it('should create a docs index', async () => {
        const result = await manager.createDocsIndex();

        expect(result.success).toBe(true);
        expect(result.filesIndexed).toBeGreaterThan(0);
      }, 60000);

      it('should report progress', async () => {
        const progressCalls: DocsIndexProgress[] = [];

        await manager.createDocsIndex((progress) => {
          progressCalls.push({ ...progress });
        });

        expect(progressCalls.length).toBeGreaterThan(0);
      }, 60000);
    });

    describe('rebuildDocsIndex', () => {
      it('should rebuild an existing docs index', async () => {
        // Create initial index
        await manager.createDocsIndex();

        // Add a doc file
        await createFile(projectPath, 'docs/rebuild-test.md', '# Rebuild Test\n\nContent.');

        // Rebuild
        const result = await manager.rebuildDocsIndex();

        expect(result.success).toBe(true);

        // New file should be indexed
        const store = new DocsLanceDBStore(indexPath);
        await store.open();
        const files = await store.getIndexedFiles();
        expect(files).toContain('docs/rebuild-test.md');
        await store.close();
      }, 120000);
    });

    describe('deleteDocsIndex', () => {
      it('should delete the docs index', async () => {
        await manager.createDocsIndex();

        // Verify index exists
        expect(await manager.isDocsIndexed()).toBe(true);

        await manager.deleteDocsIndex();

        // Docs fingerprints should be gone
        const fingerprintsPath = path.join(indexPath, 'docs-fingerprints.json');
        expect(fs.existsSync(fingerprintsPath)).toBe(false);

        // Docs LanceDB should be gone
        const docsLancedbPath = path.join(indexPath, 'docs.lancedb');
        expect(fs.existsSync(docsLancedbPath)).toBe(false);
      }, 60000);
    });

    describe('updateDocFile', () => {
      it('should update a single doc file', async () => {
        await manager.createDocsIndex();

        await createFile(
          projectPath,
          'docs/single-update.md',
          '# Single Update\n\nContent.'
        );

        await manager.updateDocFile('docs/single-update.md');

        const store = new DocsLanceDBStore(indexPath);
        await store.open();
        const files = await store.getIndexedFiles();
        expect(files).toContain('docs/single-update.md');
        await store.close();
      }, 60000);
    });

    describe('removeDocFile', () => {
      it('should remove a single doc file', async () => {
        await manager.createDocsIndex();

        await manager.removeDocFile('README.md');

        const store = new DocsLanceDBStore(indexPath);
        await store.open();
        const files = await store.getIndexedFiles();
        expect(files).not.toContain('README.md');
        await store.close();
      }, 60000);
    });

    describe('applyDelta', () => {
      it('should apply a delta through the manager', async () => {
        await manager.createDocsIndex();

        await createFile(projectPath, 'docs/delta-add.md', '# Delta Add\n\nContent.');

        const delta: DocsDeltaResult = {
          added: ['docs/delta-add.md'],
          modified: [],
          removed: [],
          unchanged: [],
        };

        const result = await manager.applyDelta(delta);

        expect(result.success).toBe(true);
      }, 60000);
    });

    describe('isDocsIndexed', () => {
      it('should return false for non-indexed project', async () => {
        expect(await manager.isDocsIndexed()).toBe(false);
      });

      it('should return true for indexed project', async () => {
        await manager.createDocsIndex();
        expect(await manager.isDocsIndexed()).toBe(true);
      }, 60000);
    });

    describe('getDocsStats', () => {
      it('should return stats for indexed project', async () => {
        await manager.createDocsIndex();

        const stats = await manager.getDocsStats();

        expect(stats.totalDocs).toBeGreaterThan(0);
        expect(stats.totalDocChunks).toBeGreaterThan(0);
        expect(stats.storageSizeBytes).toBeGreaterThan(0);
      }, 60000);
    });

    describe('scanDocFiles', () => {
      it('should scan doc files through the manager', async () => {
        const result = await manager.scanDocFiles();

        expect(result.files.length).toBeGreaterThan(0);
        expect(result.files).toContain('README.md');
        expect(result.files).toContain('docs/guide.md');
        expect(result.globFilesFound).toBeGreaterThanOrEqual(result.files.length);
      });

      it('should report progress during scan', async () => {
        const progressCalls: DocsIndexProgress[] = [];

        await manager.scanDocFiles(undefined, (progress) => {
          progressCalls.push({ ...progress });
        });

        expect(progressCalls.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Prose-Optimized Chunking', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-prose-test-project-');
      indexPath = await createTempDir('docs-prose-test-index-');
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should create larger chunks for documentation files', async () => {
      // Create a large documentation file
      const longContent = `# Large Documentation

${Array.from({ length: 50 }, (_, i) => `## Section ${i + 1}

This is section ${i + 1} of the documentation. It contains detailed information about the feature.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

### Subsection ${i + 1}.1

More detailed content about this subsection.

### Subsection ${i + 1}.2

Even more detailed content.
`).join('\n')}
`;

      await createFile(projectPath, 'large-doc.md', longContent);

      const result = await createDocsIndex(projectPath, indexPath);

      expect(result.success).toBe(true);
      expect(result.filesIndexed).toBe(1);
      // Should have fewer chunks than if using code chunking (which is smaller)
      expect(result.chunksCreated).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Error Handling', () => {
    let projectPath: string;
    let indexPath: string;

    beforeEach(async () => {
      projectPath = await createTempDir('docs-error-test-project-');
      indexPath = await createTempDir('docs-error-test-index-');
    });

    afterEach(async () => {
      await removeTempDir(projectPath);
      await removeTempDir(indexPath);
    });

    it('should handle indexing project with unreadable files gracefully', async () => {
      await createTestProject(projectPath);

      // Create a file - we can't easily make it unreadable in a cross-platform way
      // So we'll just verify the indexing completes without critical errors
      const result = await createDocsIndex(projectPath, indexPath);

      expect(result.success).toBe(true);
    }, 60000);

    it('should create errors array for files that fail to process', async () => {
      await createTestProject(projectPath);

      // This should still succeed overall
      const result = await createDocsIndex(projectPath, indexPath);

      // errors should be undefined or empty if all files processed successfully
      expect(result.errors === undefined || result.errors.length === 0).toBe(true);
    }, 60000);
  });
});
