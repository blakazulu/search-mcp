/**
 * NaturalBM25Engine Tests
 *
 * Tests cover:
 * - Chunk indexing (add single, add batch)
 * - Search functionality with various queries
 * - Score normalization
 * - Document removal by path
 * - Serialization/deserialization
 * - Edge cases: empty index, no matches, special characters
 * - Statistics and hasData checks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  NaturalBM25Engine,
  createNaturalBM25Engine,
} from '../../../src/engines/naturalBM25.js';
import {
  FTSChunk,
  FTSSearchResult,
  FTSNotInitializedError,
} from '../../../src/engines/ftsEngine.js';

// ============================================================================
// Test Data
// ============================================================================

const createTestChunk = (
  id: string,
  text: string,
  path: string,
  startLine: number = 1,
  endLine: number = 10
): FTSChunk => ({
  id,
  text,
  path,
  startLine,
  endLine,
});

const sampleChunks: FTSChunk[] = [
  createTestChunk(
    'chunk-1',
    'function handleWebSocket(socket) { console.log("Connected"); }',
    'src/websocket.ts',
    1,
    5
  ),
  createTestChunk(
    'chunk-2',
    'class UserService { async findUserById(id) { return db.users.find(id); } }',
    'src/services/user.ts',
    10,
    20
  ),
  createTestChunk(
    'chunk-3',
    'export function validateInput(data) { if (!data) throw new Error("Invalid input"); }',
    'src/utils/validation.ts',
    1,
    8
  ),
  createTestChunk(
    'chunk-4',
    '// TODO: Implement error handling for edge cases',
    'src/utils/validation.ts',
    9,
    9
  ),
  createTestChunk(
    'chunk-5',
    'const parseJSON = (str) => { try { return JSON.parse(str); } catch (e) { return null; } }',
    'src/utils/json.ts',
    1,
    5
  ),
  createTestChunk(
    'chunk-6',
    'Authentication middleware checks JWT tokens and validates user sessions',
    'docs/auth.md',
    1,
    10
  ),
];

// ============================================================================
// Tests
// ============================================================================

describe('NaturalBM25Engine', () => {
  let engine: NaturalBM25Engine;

  beforeEach(() => {
    engine = new NaturalBM25Engine();
  });

  afterEach(() => {
    engine.close();
  });

  // --------------------------------------------------------------------------
  // Factory Function
  // --------------------------------------------------------------------------

  describe('createNaturalBM25Engine', () => {
    it('should create a new engine instance', () => {
      const newEngine = createNaturalBM25Engine();
      expect(newEngine).toBeInstanceOf(NaturalBM25Engine);
      expect(newEngine.engineType).toBe('js');
      newEngine.close();
    });
  });

  // --------------------------------------------------------------------------
  // Engine Type
  // --------------------------------------------------------------------------

  describe('engineType', () => {
    it('should return "js" for the JavaScript engine', () => {
      expect(engine.engineType).toBe('js');
    });
  });

  // --------------------------------------------------------------------------
  // Add Chunks
  // --------------------------------------------------------------------------

  describe('addChunk', () => {
    it('should add a single chunk to the index', async () => {
      await engine.addChunk(sampleChunks[0]);
      expect(engine.hasData()).toBe(true);
      expect(engine.getStats().totalChunks).toBe(1);
    });

    it('should add multiple chunks individually', async () => {
      for (const chunk of sampleChunks) {
        await engine.addChunk(chunk);
      }
      expect(engine.getStats().totalChunks).toBe(sampleChunks.length);
    });

    it('should update existing chunk with same ID', async () => {
      await engine.addChunk(sampleChunks[0]);

      // Add chunk with same ID but different text
      const updatedChunk = {
        ...sampleChunks[0],
        text: 'Updated content for the chunk',
      };
      await engine.addChunk(updatedChunk);

      // Should still have only 1 chunk
      expect(engine.getStats().totalChunks).toBe(1);

      // Search should find the updated content
      const results = engine.search('Updated content', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toBe('Updated content for the chunk');
    });
  });

  describe('addChunks', () => {
    it('should add multiple chunks in batch', async () => {
      await engine.addChunks(sampleChunks);
      expect(engine.getStats().totalChunks).toBe(sampleChunks.length);
    });

    it('should handle empty array', async () => {
      await engine.addChunks([]);
      expect(engine.hasData()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  describe('search', () => {
    beforeEach(async () => {
      await engine.addChunks(sampleChunks);
    });

    it('should find exact function name matches', () => {
      const results = engine.search('handleWebSocket', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('src/websocket.ts');
    });

    it('should find class name matches', () => {
      const results = engine.search('UserService', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('src/services/user.ts');
    });

    it('should find TODO comments', () => {
      const results = engine.search('TODO', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.text.includes('TODO'))).toBe(true);
    });

    it('should find words contained in function names', () => {
      // TF-IDF tokenizes on word boundaries, so full words must match
      // 'Input' appears in 'validateInput' chunk
      const results = engine.search('Input', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results sorted by relevance', () => {
      // Use a query term that actually appears in the test data
      const results = engine.search('function', 10);
      expect(results.length).toBeGreaterThan(0);

      // Scores should be in descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });

    it('should respect topK limit', () => {
      const results = engine.search('function', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array for no matches', () => {
      const results = engine.search('xyznonexistent', 10);
      expect(results).toEqual([]);
    });

    it('should return empty array when index is empty', () => {
      const emptyEngine = new NaturalBM25Engine();
      const results = emptyEngine.search('test', 10);
      expect(results).toEqual([]);
      emptyEngine.close();
    });

    it('should handle multi-word queries', () => {
      const results = engine.search('error handling', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should include correct metadata in results', () => {
      const results = engine.search('parseJSON', 10);
      expect(results.length).toBeGreaterThan(0);

      const result = results[0];
      expect(result.id).toBe('chunk-5');
      expect(result.path).toBe('src/utils/json.ts');
      expect(result.startLine).toBe(1);
      expect(result.endLine).toBe(5);
      expect(result.text).toContain('parseJSON');
      expect(typeof result.score).toBe('number');
    });

    it('should handle special characters in query', () => {
      // Should not throw
      const results = engine.search('function()', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle empty query string', () => {
      const results = engine.search('', 10);
      // Empty query may return all or no results depending on implementation
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Score Normalization
  // --------------------------------------------------------------------------

  describe('normalizeScores', () => {
    it('should normalize scores to 0-1 range', async () => {
      await engine.addChunks(sampleChunks);
      const results = engine.search('function validation', 10);

      const normalized = engine.normalizeScores(results);

      for (const result of normalized) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should return max score as 1.0 for best match', async () => {
      await engine.addChunks(sampleChunks);
      const results = engine.search('handleWebSocket', 10);

      if (results.length > 0) {
        const normalized = engine.normalizeScores(results);
        expect(normalized[0].score).toBe(1);
      }
    });

    it('should handle single result', async () => {
      await engine.addChunk(sampleChunks[0]);
      const results = engine.search('handleWebSocket', 10);

      const normalized = engine.normalizeScores(results);
      expect(normalized.length).toBe(1);
      expect(normalized[0].score).toBe(1);
    });

    it('should handle empty results array', () => {
      const normalized = engine.normalizeScores([]);
      expect(normalized).toEqual([]);
    });

    it('should preserve other result properties', async () => {
      await engine.addChunks(sampleChunks);
      const results = engine.search('UserService', 10);
      const normalized = engine.normalizeScores(results);

      if (normalized.length > 0) {
        expect(normalized[0].id).toBe(results[0].id);
        expect(normalized[0].path).toBe(results[0].path);
        expect(normalized[0].text).toBe(results[0].text);
        expect(normalized[0].startLine).toBe(results[0].startLine);
        expect(normalized[0].endLine).toBe(results[0].endLine);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Remove By Path
  // --------------------------------------------------------------------------

  describe('removeByPath', () => {
    beforeEach(async () => {
      await engine.addChunks(sampleChunks);
    });

    it('should remove chunks for a given path', () => {
      // validation.ts has 2 chunks
      engine.removeByPath('src/utils/validation.ts');

      // Should no longer find validation.ts content
      const results = engine.search('validateInput', 10);
      const validationResults = results.filter((r) => r.path === 'src/utils/validation.ts');
      expect(validationResults).toHaveLength(0);
    });

    it('should only remove chunks for the specified path', () => {
      engine.removeByPath('src/utils/validation.ts');

      // Should still find other chunks
      const results = engine.search('handleWebSocket', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle non-existent path gracefully', () => {
      // Should not throw
      engine.removeByPath('nonexistent/path.ts');
      expect(engine.getStats().totalChunks).toBe(sampleChunks.length);
    });

    it('should update chunk count after removal', () => {
      const initialCount = engine.getStats().totalChunks;
      engine.removeByPath('src/utils/validation.ts');

      // Count should decrease by 2 (validation.ts has 2 chunks)
      expect(engine.getStats().totalChunks).toBe(initialCount - 2);
    });
  });

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('should return correct stats for empty index', () => {
      const stats = engine.getStats();
      expect(stats.totalChunks).toBe(0);
      expect(stats.engine).toBe('js');
    });

    it('should return correct stats after adding chunks', async () => {
      await engine.addChunks(sampleChunks);
      const stats = engine.getStats();
      expect(stats.totalChunks).toBe(sampleChunks.length);
      expect(stats.engine).toBe('js');
    });
  });

  describe('hasData', () => {
    it('should return false for empty index', () => {
      expect(engine.hasData()).toBe(false);
    });

    it('should return true after adding chunks', async () => {
      await engine.addChunk(sampleChunks[0]);
      expect(engine.hasData()).toBe(true);
    });

    it('should return false after clearing', async () => {
      await engine.addChunks(sampleChunks);
      engine.clear();
      expect(engine.hasData()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Serialization
  // --------------------------------------------------------------------------

  describe('serialize', () => {
    it('should serialize empty index', () => {
      const serialized = engine.serialize();
      expect(serialized).toBeTruthy();

      const parsed = JSON.parse(serialized);
      expect(parsed.version).toBe(1);
      expect(parsed.documents).toEqual([]);
    });

    it('should serialize index with chunks', async () => {
      await engine.addChunks(sampleChunks);
      const serialized = engine.serialize();

      const parsed = JSON.parse(serialized);
      expect(parsed.version).toBe(1);
      expect(parsed.documents.length).toBe(sampleChunks.length);
    });

    it('should include all chunk metadata', async () => {
      await engine.addChunk(sampleChunks[0]);
      const serialized = engine.serialize();

      const parsed = JSON.parse(serialized);
      const doc = parsed.documents[0];
      expect(doc.id).toBe(sampleChunks[0].id);
      expect(doc.path).toBe(sampleChunks[0].path);
      expect(doc.text).toBe(sampleChunks[0].text);
      expect(doc.startLine).toBe(sampleChunks[0].startLine);
      expect(doc.endLine).toBe(sampleChunks[0].endLine);
    });
  });

  describe('deserialize', () => {
    it('should deserialize and rebuild index', async () => {
      await engine.addChunks(sampleChunks);
      const serialized = engine.serialize();

      // Create new engine and deserialize
      const newEngine = new NaturalBM25Engine();
      const success = newEngine.deserialize(serialized);

      expect(success).toBe(true);
      expect(newEngine.getStats().totalChunks).toBe(sampleChunks.length);

      // Search should work on deserialized engine
      const results = newEngine.search('handleWebSocket', 10);
      expect(results.length).toBeGreaterThan(0);

      newEngine.close();
    });

    it('should handle invalid JSON', () => {
      const success = engine.deserialize('not valid json');
      expect(success).toBe(false);
    });

    it('should handle corrupted data', () => {
      const success = engine.deserialize('{"version": 1}');
      // Should handle missing documents gracefully
      expect(typeof success).toBe('boolean');
    });

    it('should clear existing data before deserializing', async () => {
      await engine.addChunks(sampleChunks);

      // Deserialize different data
      const newData = {
        version: 1,
        documents: [
          {
            id: 'new-chunk',
            path: 'new/path.ts',
            text: 'New content',
            startLine: 1,
            endLine: 1,
          },
        ],
      };
      engine.deserialize(JSON.stringify(newData));

      expect(engine.getStats().totalChunks).toBe(1);
      const results = engine.search('handleWebSocket', 10);
      expect(results).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Clear and Close
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('should remove all data from index', async () => {
      await engine.addChunks(sampleChunks);
      engine.clear();

      expect(engine.hasData()).toBe(false);
      expect(engine.getStats().totalChunks).toBe(0);
    });

    it('should allow adding new data after clear', async () => {
      await engine.addChunks(sampleChunks);
      engine.clear();
      await engine.addChunk(sampleChunks[0]);

      expect(engine.getStats().totalChunks).toBe(1);
    });
  });

  describe('close', () => {
    it('should clear all data', async () => {
      await engine.addChunks(sampleChunks);
      engine.close();

      expect(engine.hasData()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle chunks with empty text', async () => {
      const emptyChunk = createTestChunk('empty', '', 'empty.ts');
      await engine.addChunk(emptyChunk);

      expect(engine.getStats().totalChunks).toBe(1);
    });

    it('should handle chunks with very long text', async () => {
      const longText = 'word '.repeat(10000);
      const longChunk = createTestChunk('long', longText, 'long.ts');
      await engine.addChunk(longChunk);

      expect(engine.getStats().totalChunks).toBe(1);
      const results = engine.search('word', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle Unicode text', async () => {
      const unicodeChunk = createTestChunk(
        'unicode',
        'function test() { return "Hello World"; }',
        'unicode.ts'
      );
      await engine.addChunk(unicodeChunk);

      // Search for the Unicode text
      const results = engine.search('World', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle chunks with special characters', async () => {
      const specialChunk = createTestChunk(
        'special',
        'const regex = /^[a-z]+$/g; // Match lowercase letters',
        'regex.ts'
      );
      await engine.addChunk(specialChunk);

      const results = engine.search('regex', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle large number of chunks', async () => {
      const manyChunks: FTSChunk[] = [];
      for (let i = 0; i < 1000; i++) {
        manyChunks.push(
          createTestChunk(
            `chunk-${i}`,
            `This is chunk number ${i} with some content`,
            `file-${i % 100}.ts`,
            i * 10,
            i * 10 + 9
          )
        );
      }

      await engine.addChunks(manyChunks);
      expect(engine.getStats().totalChunks).toBe(1000);

      // Search should still work
      const results = engine.search('chunk number 500', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle concurrent add operations', async () => {
      const promises = sampleChunks.map((chunk) => engine.addChunk(chunk));
      await Promise.all(promises);

      expect(engine.getStats().totalChunks).toBe(sampleChunks.length);
    });
  });

  // --------------------------------------------------------------------------
  // Performance (Basic Smoke Tests)
  // --------------------------------------------------------------------------

  describe('performance', () => {
    it('should index 100 chunks in under 1 second', async () => {
      const chunks: FTSChunk[] = [];
      for (let i = 0; i < 100; i++) {
        chunks.push(
          createTestChunk(
            `perf-chunk-${i}`,
            `This is a performance test chunk with various keywords like function, class, export, import, const, let, var, async, await, return, if, else, for, while ${i}`,
            `perf/file-${i}.ts`,
            i * 10,
            i * 10 + 9
          )
        );
      }

      const start = Date.now();
      await engine.addChunks(chunks);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });

    it('should search 1000 chunks in under 100ms', async () => {
      const chunks: FTSChunk[] = [];
      for (let i = 0; i < 1000; i++) {
        chunks.push(
          createTestChunk(
            `search-perf-${i}`,
            `Performance test chunk ${i} with searchable content including function definitions and variable declarations`,
            `perf/search-${i}.ts`,
            i * 10,
            i * 10 + 9
          )
        );
      }
      await engine.addChunks(chunks);

      const start = Date.now();
      const results = engine.search('function definitions', 10);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
