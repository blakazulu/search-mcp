/**
 * Unit tests for Incremental Reindexing Engine (SMCP-098)
 *
 * Tests the chunk diffing algorithm and helper functions for
 * incremental reindexing that avoids re-embedding unchanged chunks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  computeChunkHash,
  diffChunks,
  shouldUseIncremental,
  wasIncrementalWorthwhile,
  createRecordsFromMovedChunks,
  createRecordsFromUnchangedChunks,
  createPartialRecordsFromNewChunks,
  type NewChunk,
  type MovedChunk,
  type ChunkDiffResult,
} from '../../../src/engines/incrementalReindex.js';
import type { Chunk } from '../../../src/engines/chunking.js';
import type { ExistingChunk } from '../../../src/storage/lancedb.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock existing chunk for testing
 */
function createExistingChunk(
  text: string,
  startLine: number,
  endLine: number,
  id?: string
): ExistingChunk {
  return {
    id: id || uuidv4(),
    text,
    startLine,
    endLine,
    chunkHash: computeChunkHash(text),
    vector: Array(384).fill(0.1), // Mock embedding vector
  };
}

/**
 * Create a mock new chunk for testing
 */
function createNewChunk(
  text: string,
  startLine: number,
  endLine: number,
  id?: string
): Chunk {
  return {
    id: id || uuidv4(),
    text,
    path: 'test/file.ts',
    startLine,
    endLine,
    contentHash: 'abc123',
  };
}

// ============================================================================
// computeChunkHash Tests
// ============================================================================

describe('computeChunkHash', () => {
  it('should generate consistent hashes for the same text', () => {
    const text = 'function hello() { return "world"; }';
    const hash1 = computeChunkHash(text);
    const hash2 = computeChunkHash(text);
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different text', () => {
    const hash1 = computeChunkHash('function hello() {}');
    const hash2 = computeChunkHash('function goodbye() {}');
    expect(hash1).not.toBe(hash2);
  });

  it('should normalize whitespace', () => {
    const text1 = 'function  hello()  {}';
    const text2 = 'function hello() {}';
    // After normalization, extra whitespace becomes single space
    const hash1 = computeChunkHash(text1);
    const hash2 = computeChunkHash(text2);
    expect(hash1).toBe(hash2);
  });

  it('should trim leading/trailing whitespace', () => {
    const text1 = '  function hello() {}  ';
    const text2 = 'function hello() {}';
    const hash1 = computeChunkHash(text1);
    const hash2 = computeChunkHash(text2);
    expect(hash1).toBe(hash2);
  });

  it('should return a 32-character hash', () => {
    const hash = computeChunkHash('some text');
    expect(hash).toHaveLength(32);
  });

  it('should handle empty strings', () => {
    const hash = computeChunkHash('');
    expect(hash).toHaveLength(32);
  });
});

// ============================================================================
// diffChunks Tests
// ============================================================================

describe('diffChunks', () => {
  describe('unchanged chunks', () => {
    it('should detect unchanged chunks at same position', () => {
      const existingChunks = [
        createExistingChunk('function a() {}', 1, 10),
        createExistingChunk('function b() {}', 11, 20),
      ];
      const newChunks = [
        createNewChunk('function a() {}', 1, 10),
        createNewChunk('function b() {}', 11, 20),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.unchanged).toHaveLength(2);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.moved).toHaveLength(0);
      expect(result.stats.embeddingsSaved).toBe(2);
    });
  });

  describe('added chunks', () => {
    it('should detect new chunks', () => {
      const existingChunks = [
        createExistingChunk('function a() {}', 1, 10),
      ];
      const newChunks = [
        createNewChunk('function a() {}', 1, 10),
        createNewChunk('function b() {}', 11, 20),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.unchanged).toHaveLength(1);
      expect(result.added).toHaveLength(1);
      expect(result.added[0].text).toBe('function b() {}');
      expect(result.removed).toHaveLength(0);
    });

    it('should assign new UUIDs to added chunks', () => {
      const existingChunks: ExistingChunk[] = [];
      const newChunks = [
        createNewChunk('function a() {}', 1, 10),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('removed chunks', () => {
    it('should detect removed chunks', () => {
      const existingChunks = [
        createExistingChunk('function a() {}', 1, 10),
        createExistingChunk('function b() {}', 11, 20),
      ];
      const newChunks = [
        createNewChunk('function a() {}', 1, 10),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.unchanged).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].text).toBe('function b() {}');
      expect(result.added).toHaveLength(0);
    });
  });

  describe('moved chunks', () => {
    it('should detect chunks that moved position', () => {
      const existingChunks = [
        createExistingChunk('function a() {}', 1, 10),
        createExistingChunk('function b() {}', 11, 20),
      ];
      // Lines shifted down (e.g., new content added at top)
      const newChunks = [
        createNewChunk('function a() {}', 5, 14),
        createNewChunk('function b() {}', 15, 24),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.moved).toHaveLength(2);
      expect(result.unchanged).toHaveLength(0);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.stats.embeddingsSaved).toBe(2);
    });

    it('should preserve existing chunk IDs for moved chunks', () => {
      const existingId = uuidv4();
      const existingChunks = [
        createExistingChunk('function a() {}', 1, 10, existingId),
      ];
      const newChunks = [
        createNewChunk('function a() {}', 20, 29),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.moved).toHaveLength(1);
      expect(result.moved[0].existing.id).toBe(existingId);
      expect(result.moved[0].newStartLine).toBe(20);
      expect(result.moved[0].newEndLine).toBe(29);
    });
  });

  describe('mixed changes', () => {
    it('should handle a mix of unchanged, added, removed, and moved chunks', () => {
      const existingChunks = [
        createExistingChunk('function a() {}', 1, 10),   // Will be unchanged
        createExistingChunk('function b() {}', 11, 20),  // Will be moved
        createExistingChunk('function c() {}', 21, 30),  // Will be removed
      ];
      const newChunks = [
        createNewChunk('function a() {}', 1, 10),   // Unchanged
        createNewChunk('function b() {}', 21, 30),  // Moved
        createNewChunk('function d() {}', 31, 40),  // Added
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0].text).toBe('function a() {}');

      expect(result.moved).toHaveLength(1);
      expect(result.moved[0].existing.text).toBe('function b() {}');
      expect(result.moved[0].newStartLine).toBe(21);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].text).toBe('function c() {}');

      expect(result.added).toHaveLength(1);
      expect(result.added[0].text).toBe('function d() {}');

      expect(result.stats.embeddingsSaved).toBe(2); // unchanged + moved
    });
  });

  describe('duplicate content', () => {
    it('should handle multiple chunks with identical content', () => {
      const existingChunks = [
        createExistingChunk('const x = 1;', 1, 5),
        createExistingChunk('const x = 1;', 10, 14),
      ];
      const newChunks = [
        createNewChunk('const x = 1;', 1, 5),
        createNewChunk('const x = 1;', 10, 14),
      ];

      const result = diffChunks(existingChunks, newChunks);

      // Both should be matched as unchanged
      expect(result.unchanged).toHaveLength(2);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });
  });

  describe('statistics', () => {
    it('should calculate stats correctly', () => {
      const existingChunks = [
        createExistingChunk('a', 1, 5),
        createExistingChunk('b', 6, 10),
        createExistingChunk('c', 11, 15),
      ];
      const newChunks = [
        createNewChunk('a', 1, 5),
        createNewChunk('b', 16, 20),
        createNewChunk('d', 21, 25),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.stats.oldChunkCount).toBe(3);
      expect(result.stats.newChunkCount).toBe(3);
      expect(result.stats.unchangedCount).toBe(1);
      expect(result.stats.movedCount).toBe(1);
      expect(result.stats.addedCount).toBe(1);
      expect(result.stats.removedCount).toBe(1);
      expect(result.stats.embeddingsSaved).toBe(2);
    });

    it('should mark incremental as beneficial when saving > 50% embeddings', () => {
      const existingChunks = [
        createExistingChunk('a', 1, 5),
        createExistingChunk('b', 6, 10),
        createExistingChunk('c', 11, 15),
      ];
      const newChunks = [
        createNewChunk('a', 1, 5),
        createNewChunk('b', 6, 10),
        createNewChunk('d', 11, 15),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.stats.incrementalBeneficial).toBe(true);
    });

    it('should mark incremental as not beneficial when saving < 50% embeddings', () => {
      const existingChunks = [
        createExistingChunk('a', 1, 5),
      ];
      const newChunks = [
        createNewChunk('x', 1, 5),
        createNewChunk('y', 6, 10),
        createNewChunk('z', 11, 15),
      ];

      const result = diffChunks(existingChunks, newChunks);

      expect(result.stats.incrementalBeneficial).toBe(false);
    });
  });
});

// ============================================================================
// shouldUseIncremental Tests
// ============================================================================

describe('shouldUseIncremental', () => {
  it('should return false for 0 chunks', () => {
    expect(shouldUseIncremental(0)).toBe(false);
  });

  it('should return false for 1 chunk', () => {
    expect(shouldUseIncremental(1)).toBe(false);
  });

  it('should return false for 2 chunks', () => {
    expect(shouldUseIncremental(2)).toBe(false);
  });

  it('should return true for 3 chunks', () => {
    expect(shouldUseIncremental(3)).toBe(true);
  });

  it('should return true for many chunks', () => {
    expect(shouldUseIncremental(100)).toBe(true);
  });
});

// ============================================================================
// wasIncrementalWorthwhile Tests
// ============================================================================

describe('wasIncrementalWorthwhile', () => {
  it('should return true when saving >= 25% of embeddings', () => {
    const diff: ChunkDiffResult = {
      added: [],
      removed: [],
      unchanged: [createExistingChunk('a', 1, 5)],
      moved: [],
      stats: {
        oldChunkCount: 4,
        newChunkCount: 4,
        addedCount: 3,
        removedCount: 3,
        unchangedCount: 1,
        movedCount: 0,
        embeddingsSaved: 1,
        incrementalBeneficial: false,
      },
    };

    expect(wasIncrementalWorthwhile(diff)).toBe(true);
  });

  it('should return false when saving < 25% of embeddings', () => {
    const diff: ChunkDiffResult = {
      added: [],
      removed: [],
      unchanged: [],
      moved: [],
      stats: {
        oldChunkCount: 10,
        newChunkCount: 10,
        addedCount: 9,
        removedCount: 9,
        unchangedCount: 1,
        movedCount: 0,
        embeddingsSaved: 1,
        incrementalBeneficial: false,
      },
    };

    expect(wasIncrementalWorthwhile(diff)).toBe(false);
  });

  it('should return true when there are no new chunks', () => {
    const diff: ChunkDiffResult = {
      added: [],
      removed: [],
      unchanged: [],
      moved: [],
      stats: {
        oldChunkCount: 5,
        newChunkCount: 0,
        addedCount: 0,
        removedCount: 5,
        unchangedCount: 0,
        movedCount: 0,
        embeddingsSaved: 0,
        incrementalBeneficial: true,
      },
    };

    expect(wasIncrementalWorthwhile(diff)).toBe(true);
  });
});

// ============================================================================
// Record Creation Tests
// ============================================================================

describe('createRecordsFromMovedChunks', () => {
  it('should create records with updated line numbers', () => {
    const movedChunks: MovedChunk[] = [
      {
        existing: createExistingChunk('function a() {}', 1, 10),
        newStartLine: 20,
        newEndLine: 29,
      },
    ];

    const records = createRecordsFromMovedChunks(movedChunks, 'test/file.ts', 'contentHash123');

    expect(records).toHaveLength(1);
    expect(records[0].start_line).toBe(20);
    expect(records[0].end_line).toBe(29);
    expect(records[0].path).toBe('test/file.ts');
    expect(records[0].content_hash).toBe('contentHash123');
    expect(records[0].vector).toHaveLength(384); // Existing embedding preserved
  });
});

describe('createRecordsFromUnchangedChunks', () => {
  it('should preserve all existing data', () => {
    const unchangedChunks = [
      createExistingChunk('function a() {}', 1, 10),
    ];

    const records = createRecordsFromUnchangedChunks(unchangedChunks, 'test/file.ts', 'contentHash123');

    expect(records).toHaveLength(1);
    expect(records[0].text).toBe('function a() {}');
    expect(records[0].start_line).toBe(1);
    expect(records[0].end_line).toBe(10);
    expect(records[0].vector).toHaveLength(384);
  });
});

describe('createPartialRecordsFromNewChunks', () => {
  it('should create records with empty vectors', () => {
    const newChunks: NewChunk[] = [
      {
        id: uuidv4(),
        text: 'function a() {}',
        startLine: 1,
        endLine: 10,
        chunkHash: computeChunkHash('function a() {}'),
      },
    ];

    const records = createPartialRecordsFromNewChunks(newChunks, 'test/file.ts', 'contentHash123');

    expect(records).toHaveLength(1);
    expect(records[0].text).toBe('function a() {}');
    expect(records[0].vector).toHaveLength(0); // Empty - needs embedding
    expect(records[0].chunk_hash).toBe(newChunks[0].chunkHash);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('should handle empty existing chunks', () => {
    const existingChunks: ExistingChunk[] = [];
    const newChunks = [
      createNewChunk('function a() {}', 1, 10),
    ];

    const result = diffChunks(existingChunks, newChunks);

    expect(result.added).toHaveLength(1);
    expect(result.unchanged).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should handle empty new chunks', () => {
    const existingChunks = [
      createExistingChunk('function a() {}', 1, 10),
    ];
    const newChunks: Chunk[] = [];

    const result = diffChunks(existingChunks, newChunks);

    expect(result.removed).toHaveLength(1);
    expect(result.unchanged).toHaveLength(0);
    expect(result.added).toHaveLength(0);
  });

  it('should handle both empty', () => {
    const existingChunks: ExistingChunk[] = [];
    const newChunks: Chunk[] = [];

    const result = diffChunks(existingChunks, newChunks);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
    expect(result.moved).toHaveLength(0);
  });

  it('should handle chunks with missing chunk hash (legacy data)', () => {
    const existingChunks: ExistingChunk[] = [
      {
        id: uuidv4(),
        text: 'function a() {}',
        startLine: 1,
        endLine: 10,
        chunkHash: '', // Empty hash (legacy)
        vector: Array(384).fill(0.1),
      },
    ];
    const newChunks = [
      createNewChunk('function a() {}', 1, 10),
    ];

    // Should still work by computing hash on-the-fly
    const result = diffChunks(existingChunks, newChunks);

    expect(result.unchanged).toHaveLength(1);
  });
});
