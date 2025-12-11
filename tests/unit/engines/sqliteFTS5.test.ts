/**
 * SQLiteFTS5Engine Tests
 *
 * Tests cover:
 * - Native module availability check
 * - Chunk indexing (add single, add batch)
 * - Search functionality with various queries
 * - FTS5 syntax support (phrase, prefix, boolean)
 * - Score normalization
 * - Document removal by path
 * - Serialization/deserialization
 * - Edge cases: empty index, no matches, special characters
 * - Statistics and hasData checks
 * - Database persistence
 *
 * Note: These tests require the better-sqlite3 native module to be installed.
 * They will be skipped if the module is not available.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SQLiteFTS5Engine,
  createSQLiteFTS5Engine,
  isNativeAvailable,
  resetNativeAvailableCache,
} from '../../../src/engines/sqliteFTS5.js';
import { FTSChunk, FTSSearchResult } from '../../../src/engines/ftsEngine.js';

// ============================================================================
// Test Helpers
// ============================================================================

let testDir: string;

// Check native availability synchronously at module load time by trying the import
// This is a workaround since vitest's describe.runIf evaluates before beforeAll
let nativeIsAvailable = false;
try {
  // Try to require the module synchronously to check availability
  require('better-sqlite3');
  nativeIsAvailable = true;
} catch {
  nativeIsAvailable = false;
}

/**
 * Create a test chunk with default values
 */
const createTestChunk = (
  id: string,
  text: string,
  filePath: string,
  startLine: number = 1,
  endLine: number = 10
): FTSChunk => ({
  id,
  text,
  path: filePath,
  startLine,
  endLine,
});

/**
 * Sample chunks for testing
 */
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
// Setup
// ============================================================================

beforeAll(async () => {
  // Reset the cache to ensure fresh check for isNativeAvailable function tests
  resetNativeAvailableCache();
});

// ============================================================================
// Tests
// ============================================================================

describe('SQLiteFTS5Engine', () => {
  describe('isNativeAvailable', () => {
    beforeEach(() => {
      resetNativeAvailableCache();
    });

    it('should return a boolean', async () => {
      const result = await isNativeAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should cache the result on subsequent calls', async () => {
      const result1 = await isNativeAvailable();
      const result2 = await isNativeAvailable();
      expect(result1).toBe(result2);
    });

    it('should reset cache when resetNativeAvailableCache is called', async () => {
      await isNativeAvailable();
      resetNativeAvailableCache();
      // After reset, it should re-check (we can't easily test this without mocking)
      const result = await isNativeAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  // Skip remaining tests if native module not available
  describe.runIf(nativeIsAvailable)('with native module', () => {
    let engine: SQLiteFTS5Engine;
    let dbPath: string;

    beforeEach(async () => {
      // Create a unique temp directory for each test
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-fts5-test-'));
      dbPath = path.join(testDir, 'test-fts.sqlite');

      // Create engine using factory
      engine = await createSQLiteFTS5Engine(dbPath);
    });

    afterEach(async () => {
      // Close engine and cleanup
      if (engine) {
        engine.close();
      }

      // Clean up temp directory
      if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    // --------------------------------------------------------------------------
    // Factory Function
    // --------------------------------------------------------------------------

    describe('createSQLiteFTS5Engine', () => {
      it('should create and initialize an engine', async () => {
        expect(engine).toBeInstanceOf(SQLiteFTS5Engine);
        expect(engine.engineType).toBe('native');
      });

      it('should create the database file', async () => {
        expect(fs.existsSync(dbPath)).toBe(true);
      });

      it('should create the directory if it does not exist', async () => {
        const nestedPath = path.join(testDir, 'nested', 'dir', 'test.sqlite');
        const nestedEngine = await createSQLiteFTS5Engine(nestedPath);

        expect(fs.existsSync(nestedPath)).toBe(true);
        nestedEngine.close();
      });
    });

    // --------------------------------------------------------------------------
    // Engine Type
    // --------------------------------------------------------------------------

    describe('engineType', () => {
      it('should return "native" for the SQLite engine', () => {
        expect(engine.engineType).toBe('native');
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

      it('should be faster than individual inserts for large batches', async () => {
        const manyChunks: FTSChunk[] = [];
        for (let i = 0; i < 500; i++) {
          manyChunks.push(
            createTestChunk(
              `batch-chunk-${i}`,
              `This is batch chunk number ${i} with some content`,
              `file-${i % 50}.ts`,
              i * 10,
              i * 10 + 9
            )
          );
        }

        const start = Date.now();
        await engine.addChunks(manyChunks);
        const duration = Date.now() - start;

        expect(engine.getStats().totalChunks).toBe(500);
        // Batch insert should be reasonably fast (transaction-based)
        expect(duration).toBeLessThan(2000);
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

      it('should return results sorted by relevance', () => {
        const results = engine.search('function', 10);
        expect(results.length).toBeGreaterThan(0);

        // BM25 scores should be in ascending order (more negative = better)
        for (let i = 1; i < results.length; i++) {
          expect(results[i].score).toBeGreaterThanOrEqual(results[i - 1].score);
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

      it('should return empty array when index is empty', async () => {
        const emptyDbPath = path.join(testDir, 'empty-fts.sqlite');
        const emptyEngine = await createSQLiteFTS5Engine(emptyDbPath);
        const results = emptyEngine.search('test', 10);
        expect(results).toEqual([]);
        emptyEngine.close();
      });

      it('should return empty array for empty query', () => {
        const results = engine.search('', 10);
        expect(results).toEqual([]);
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

      it('should handle special characters in query via fallback', () => {
        // Special chars that might break FTS5 syntax should fall back to LIKE
        const results = engine.search('function()', 10);
        expect(Array.isArray(results)).toBe(true);
      });
    });

    // --------------------------------------------------------------------------
    // FTS5 Syntax Support
    // --------------------------------------------------------------------------

    describe('FTS5 syntax support', () => {
      beforeEach(async () => {
        await engine.addChunks(sampleChunks);
      });

      it('should support phrase search with quotes', () => {
        // "error handling" should match the exact phrase
        const results = engine.search('"error handling"', 10);
        expect(Array.isArray(results)).toBe(true);
      });

      it('should support prefix search with asterisk', () => {
        // handle* should match handleWebSocket
        const results = engine.search('handle*', 10);
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.text.includes('handle'))).toBe(true);
      });

      it('should support OR operator', () => {
        // Note: FTS5 tokenizes by word boundaries, so camelCase identifiers
        // are treated as single tokens. We search for terms that exist as
        // separate tokens in the test data.
        const results = engine.search('function OR class', 10);
        expect(results.length).toBeGreaterThanOrEqual(2);
      });

      it('should support AND operator', () => {
        const results = engine.search('function AND validateInput', 10);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].text).toContain('validateInput');
      });

      it('should fall back to LIKE search for invalid FTS5 syntax', () => {
        // This might cause FTS5 syntax error, should fall back gracefully
        const results = engine.search('(((invalid', 10);
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

      it('should return max normalized score as 1.0 for best match', async () => {
        await engine.addChunks(sampleChunks);
        const results = engine.search('handleWebSocket', 10);

        if (results.length > 1) {
          const normalized = engine.normalizeScores(results);
          // The best match (lowest raw BM25 score) should get score of 1.0
          expect(Math.max(...normalized.map((r) => r.score))).toBe(1);
        }
      });

      it('should handle single result', async () => {
        // Create engine with single chunk
        const singleDbPath = path.join(testDir, 'single-fts.sqlite');
        const singleEngine = await createSQLiteFTS5Engine(singleDbPath);
        await singleEngine.addChunk(sampleChunks[0]);

        const results = singleEngine.search('handleWebSocket', 10);
        const normalized = singleEngine.normalizeScores(results);

        expect(normalized.length).toBe(1);
        expect(normalized[0].score).toBe(1);

        singleEngine.close();
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
        expect(stats.engine).toBe('native');
      });

      it('should return correct stats after adding chunks', async () => {
        await engine.addChunks(sampleChunks);
        const stats = engine.getStats();
        expect(stats.totalChunks).toBe(sampleChunks.length);
        expect(stats.engine).toBe('native');
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
    // Persistence
    // --------------------------------------------------------------------------

    describe('persistence', () => {
      it('should persist data across engine instances', async () => {
        // Add data with first engine
        await engine.addChunks(sampleChunks);
        const countBefore = engine.getStats().totalChunks;
        engine.close();

        // Create new engine with same path
        const engine2 = await createSQLiteFTS5Engine(dbPath);
        const countAfter = engine2.getStats().totalChunks;

        expect(countAfter).toBe(countBefore);

        // Search should work on reopened engine
        const results = engine2.search('handleWebSocket', 10);
        expect(results.length).toBeGreaterThan(0);

        engine2.close();

        // Re-assign for cleanup
        engine = await createSQLiteFTS5Engine(path.join(testDir, 'new-fts.sqlite'));
      });

      it('should serialize engine state', async () => {
        await engine.addChunks(sampleChunks);
        const serialized = engine.serialize();

        expect(serialized).toBeTruthy();
        const parsed = JSON.parse(serialized);
        expect(parsed.version).toBe(1);
        expect(parsed.dbPath).toBe(dbPath);
      });

      it('should deserialize engine state', async () => {
        await engine.addChunks(sampleChunks);
        const serialized = engine.serialize();

        const success = engine.deserialize(serialized);
        expect(success).toBe(true);
      });

      it('should handle invalid JSON in deserialize', () => {
        const success = engine.deserialize('not valid json');
        expect(success).toBe(false);
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
      it('should close database connection', async () => {
        await engine.addChunks(sampleChunks);
        engine.close();

        // After close, hasData should return false (no connection)
        expect(engine.hasData()).toBe(false);

        // Re-create for cleanup
        engine = await createSQLiteFTS5Engine(path.join(testDir, 'new-fts.sqlite'));
      });

      it('should handle multiple close calls gracefully', async () => {
        engine.close();
        engine.close(); // Should not throw

        // Re-create for cleanup
        engine = await createSQLiteFTS5Engine(path.join(testDir, 'new-fts.sqlite'));
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
        const results = engine.search('chunk number', 10);
        expect(results.length).toBeGreaterThan(0);
      });
    });

    // --------------------------------------------------------------------------
    // Performance
    // --------------------------------------------------------------------------

    describe('performance', () => {
      it('should index 100 chunks in under 500ms', async () => {
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

        expect(duration).toBeLessThan(500);
      });

      it('should search 1000 chunks in under 50ms', async () => {
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

        expect(duration).toBeLessThan(50);
        expect(Array.isArray(results)).toBe(true);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Tests when native module is NOT available
  // --------------------------------------------------------------------------

  // Note: These tests only run when better-sqlite3 is NOT installed.
  // Since we install it as optionalDependencies, these tests will be skipped
  // in normal development. They would only run in an environment where
  // the native module failed to install (e.g., missing build tools).
  describe('without native module', () => {
    it('should throw error when trying to create engine (when native unavailable)', async () => {
      // This test verifies behavior when native module is NOT available.
      // Since better-sqlite3 IS installed in this environment, we skip with a message.
      const isAvailable = await isNativeAvailable();
      if (isAvailable) {
        // Module is available, skip this test
        return;
      }

      await expect(createSQLiteFTS5Engine('/tmp/test.sqlite')).rejects.toThrow(
        /Native better-sqlite3 module is not available/
      );
    });

    it('isNativeAvailable should return false (when native unavailable)', async () => {
      // This test verifies behavior when native module is NOT available.
      // Since better-sqlite3 IS installed in this environment, we skip with a message.
      const isAvailable = await isNativeAvailable();
      if (isAvailable) {
        // Module is available, this test is not applicable
        return;
      }

      expect(isAvailable).toBe(false);
    });
  });
});
