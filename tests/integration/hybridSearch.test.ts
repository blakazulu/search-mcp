/**
 * Hybrid Search Integration Tests (SMCP-062)
 *
 * Comprehensive integration tests for the hybrid search feature:
 * - Tests search_code with all modes (vector, fts, hybrid)
 * - Tests alpha parameter effects on ranking
 * - Tests FTS engine selection and auto-detection
 * - Tests backward compatibility with existing indexes
 * - Tests incremental updates (reindex_file)
 *
 * These tests verify the entire search pipeline works correctly
 * from user input through to final results.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateRRFScore,
  fuseResults,
  validateSearchMode,
  validateAlpha,
  performHybridSearch,
  type SearchMode,
  type HybridSearchContext,
} from '../../src/engines/hybridSearch.js';
import { NaturalBM25Engine, createNaturalBM25Engine } from '../../src/engines/naturalBM25.js';
import type { FTSSearchResult, FTSChunk } from '../../src/engines/ftsEngine.js';
import type { SearchResult } from '../../src/storage/lancedb.js';

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

const sampleCodeChunks: FTSChunk[] = [
  createTestChunk(
    'chunk-auth-1',
    'function authenticate(username, password) { return validateCredentials(username, password); }',
    'src/auth/login.ts',
    1,
    10
  ),
  createTestChunk(
    'chunk-auth-2',
    'class AuthService { constructor() { this.tokenManager = new TokenManager(); } }',
    'src/auth/service.ts',
    1,
    15
  ),
  createTestChunk(
    'chunk-db-1',
    'async function queryDatabase(sql, params) { return await db.execute(sql, params); }',
    'src/database/query.ts',
    1,
    8
  ),
  createTestChunk(
    'chunk-user-1',
    'interface User { id: string; username: string; email: string; }',
    'src/models/user.ts',
    1,
    5
  ),
  createTestChunk(
    'chunk-util-1',
    'export function hashPassword(password: string): string { return bcrypt.hash(password, 10); }',
    'src/utils/crypto.ts',
    1,
    6
  ),
];

// ============================================================================
// RRF Score Calculation Tests
// ============================================================================

describe('Hybrid Search - RRF Score Calculation', () => {
  describe('calculateRRFScore', () => {
    it('should calculate correct RRF score for vector-only result', () => {
      // Result only in vector (rank 1), not in FTS
      const score = calculateRRFScore(1, 0, 0.5, 60);
      expect(score).toBeCloseTo(0.5 * (1 / 61), 6);
    });

    it('should calculate correct RRF score for FTS-only result', () => {
      // Result only in FTS (rank 1), not in vector
      const score = calculateRRFScore(0, 1, 0.5, 60);
      expect(score).toBeCloseTo(0.5 * (1 / 61), 6);
    });

    it('should calculate correct RRF score for result in both', () => {
      // Result in vector (rank 1) and FTS (rank 2), alpha=0.5
      const score = calculateRRFScore(1, 2, 0.5, 60);
      const expected = 0.5 * (1 / 61) + 0.5 * (1 / 62);
      expect(score).toBeCloseTo(expected, 6);
    });

    it('should weight vector more when alpha > 0.5', () => {
      const vectorScore = calculateRRFScore(1, 0, 0.8, 60);
      const ftsScore = calculateRRFScore(0, 1, 0.8, 60);
      expect(vectorScore).toBeGreaterThan(ftsScore);
    });

    it('should weight FTS more when alpha < 0.5', () => {
      const vectorScore = calculateRRFScore(1, 0, 0.2, 60);
      const ftsScore = calculateRRFScore(0, 1, 0.2, 60);
      expect(ftsScore).toBeGreaterThan(vectorScore);
    });

    it('should return 0 for result not in either source', () => {
      const score = calculateRRFScore(0, 0, 0.5, 60);
      expect(score).toBe(0);
    });

    it('should handle different k values', () => {
      const scoreK60 = calculateRRFScore(1, 1, 0.5, 60);
      const scoreK10 = calculateRRFScore(1, 1, 0.5, 10);
      // Lower k means more aggressive rank smoothing, higher scores
      expect(scoreK10).toBeGreaterThan(scoreK60);
    });
  });
});

// ============================================================================
// Result Fusion Tests
// ============================================================================

describe('Hybrid Search - Result Fusion', () => {
  describe('fuseResults', () => {
    it('should merge vector and FTS results correctly', () => {
      const vectorResults = [
        { id: 'chunk-1', result: { path: 'file1.ts', text: 'text1', score: 0.9, startLine: 1, endLine: 10 } as SearchResult },
        { id: 'chunk-2', result: { path: 'file2.ts', text: 'text2', score: 0.8, startLine: 1, endLine: 10 } as SearchResult },
      ];

      const ftsResults: FTSSearchResult[] = [
        { id: 'chunk-2', path: 'file2.ts', text: 'text2', score: 10, startLine: 1, endLine: 10 },
        { id: 'chunk-3', path: 'file3.ts', text: 'text3', score: 8, startLine: 1, endLine: 10 },
      ];

      const fused = fuseResults(vectorResults, ftsResults, 0.5, 10);

      // Should include all unique chunks
      expect(fused.length).toBe(3);

      // chunk-2 should be boosted (in both sources)
      const chunk2 = fused.find((r) => r.id === 'chunk-2');
      const chunk1 = fused.find((r) => r.id === 'chunk-1');
      expect(chunk2!.score).toBeGreaterThanOrEqual(chunk1!.score);
    });

    it('should respect topK limit', () => {
      const vectorResults = [
        { id: 'v1', result: { path: 'f1.ts', text: 't1', score: 0.9, startLine: 1, endLine: 10 } as SearchResult },
        { id: 'v2', result: { path: 'f2.ts', text: 't2', score: 0.8, startLine: 1, endLine: 10 } as SearchResult },
        { id: 'v3', result: { path: 'f3.ts', text: 't3', score: 0.7, startLine: 1, endLine: 10 } as SearchResult },
      ];

      const ftsResults: FTSSearchResult[] = [
        { id: 'f1', path: 'f4.ts', text: 't4', score: 10, startLine: 1, endLine: 10 },
        { id: 'f2', path: 'f5.ts', text: 't5', score: 8, startLine: 1, endLine: 10 },
      ];

      const fused = fuseResults(vectorResults, ftsResults, 0.5, 3);
      expect(fused.length).toBeLessThanOrEqual(3);
    });

    it('should normalize scores to 0-1 range', () => {
      const vectorResults = [
        { id: 'v1', result: { path: 'f1.ts', text: 't1', score: 0.9, startLine: 1, endLine: 10 } as SearchResult },
      ];

      const ftsResults: FTSSearchResult[] = [
        { id: 'f1', path: 'f2.ts', text: 't2', score: 100, startLine: 1, endLine: 10 },
      ];

      const fused = fuseResults(vectorResults, ftsResults, 0.5, 10);

      for (const result of fused) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should handle empty vector results', () => {
      const ftsResults: FTSSearchResult[] = [
        { id: 'f1', path: 'f1.ts', text: 't1', score: 10, startLine: 1, endLine: 10 },
      ];

      const fused = fuseResults([], ftsResults, 0.5, 10);
      expect(fused.length).toBe(1);
      expect(fused[0].id).toBe('f1');
    });

    it('should handle empty FTS results', () => {
      const vectorResults = [
        { id: 'v1', result: { path: 'f1.ts', text: 't1', score: 0.9, startLine: 1, endLine: 10 } as SearchResult },
      ];

      const fused = fuseResults(vectorResults, [], 0.5, 10);
      expect(fused.length).toBe(1);
      expect(fused[0].id).toBe('v1');
    });

    it('should handle both empty', () => {
      const fused = fuseResults([], [], 0.5, 10);
      expect(fused.length).toBe(0);
    });
  });
});

// ============================================================================
// Search Mode Validation Tests
// ============================================================================

describe('Hybrid Search - Mode Validation', () => {
  describe('validateSearchMode', () => {
    it('should accept "vector" mode', () => {
      expect(validateSearchMode('vector')).toBe('vector');
    });

    it('should accept "fts" mode', () => {
      expect(validateSearchMode('fts')).toBe('fts');
    });

    it('should accept "hybrid" mode', () => {
      expect(validateSearchMode('hybrid')).toBe('hybrid');
    });

    it('should default to "hybrid" for undefined', () => {
      expect(validateSearchMode(undefined)).toBe('hybrid');
    });

    it('should default to "hybrid" for invalid value', () => {
      expect(validateSearchMode('invalid' as any)).toBe('hybrid');
    });

    it('should default to "hybrid" for empty string', () => {
      expect(validateSearchMode('')).toBe('hybrid');
    });
  });

  describe('validateAlpha', () => {
    it('should accept valid alpha values', () => {
      expect(validateAlpha(0.5, 0.7)).toBe(0.5);
      expect(validateAlpha(0, 0.7)).toBe(0);
      expect(validateAlpha(1, 0.7)).toBe(1);
    });

    it('should clamp values below 0', () => {
      expect(validateAlpha(-0.5, 0.7)).toBe(0);
    });

    it('should clamp values above 1', () => {
      expect(validateAlpha(1.5, 0.7)).toBe(1);
    });

    it('should use default when undefined', () => {
      expect(validateAlpha(undefined, 0.7)).toBe(0.7);
    });

    it('should use default when undefined with different defaults', () => {
      expect(validateAlpha(undefined, 0.3)).toBe(0.3);
      expect(validateAlpha(undefined, 0.9)).toBe(0.9);
    });
  });
});

// ============================================================================
// Perform Hybrid Search Tests
// ============================================================================

describe('Hybrid Search - performHybridSearch', () => {
  let ftsEngine: NaturalBM25Engine;

  beforeEach(async () => {
    ftsEngine = createNaturalBM25Engine();
    await ftsEngine.addChunks(sampleCodeChunks);
  });

  afterEach(() => {
    ftsEngine.close();
  });

  // Mock vector search function
  const createMockVectorSearch = (results: SearchResult[]) => {
    return async (vector: number[], topK: number): Promise<SearchResult[]> => {
      return results.slice(0, topK);
    };
  };

  // Mock getChunksById function
  const createMockGetChunksById = (chunks: FTSChunk[]) => {
    return async (ids: string[]): Promise<Map<string, SearchResult>> => {
      const map = new Map<string, SearchResult>();
      for (const chunk of chunks) {
        if (ids.includes(chunk.id)) {
          map.set(chunk.id, {
            path: chunk.path,
            text: chunk.text,
            score: 0,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
          });
        }
      }
      return map;
    };
  };

  it('should perform vector-only search when mode is "vector"', async () => {
    const mockResults: SearchResult[] = [
      { path: 'file1.ts', text: 'vector result', score: 0.9, startLine: 1, endLine: 10 },
    ];

    const ctx: HybridSearchContext = {
      ftsEngine,
      ftsAvailable: true,
      defaultAlpha: 0.5,
    };

    const results = await performHybridSearch(
      'test query',
      [0.1, 0.2, 0.3], // dummy vector
      { mode: 'vector', alpha: 0.5, topK: 10 },
      createMockVectorSearch(mockResults),
      createMockGetChunksById([]),
      ctx
    );

    expect(results.length).toBe(1);
    expect(results[0].searchMode).toBe('vector');
  });

  it('should perform FTS-only search when mode is "fts"', async () => {
    const ctx: HybridSearchContext = {
      ftsEngine,
      ftsAvailable: true,
      defaultAlpha: 0.5,
    };

    const results = await performHybridSearch(
      'authenticate',
      [0.1, 0.2, 0.3],
      { mode: 'fts', alpha: 0.5, topK: 10 },
      createMockVectorSearch([]),
      createMockGetChunksById(sampleCodeChunks),
      ctx
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].searchMode).toBe('fts');
  });

  it('should fall back to vector when FTS is not available', async () => {
    const mockResults: SearchResult[] = [
      { path: 'file1.ts', text: 'vector result', score: 0.9, startLine: 1, endLine: 10 },
    ];

    const ctx: HybridSearchContext = {
      ftsEngine: null,
      ftsAvailable: false,
      defaultAlpha: 0.5,
    };

    const results = await performHybridSearch(
      'test query',
      [0.1, 0.2, 0.3],
      { mode: 'hybrid', alpha: 0.5, topK: 10 },
      createMockVectorSearch(mockResults),
      createMockGetChunksById([]),
      ctx
    );

    expect(results.length).toBe(1);
    expect(results[0].searchMode).toBe('vector');
  });

  it('should return empty array for FTS mode when engine not available', async () => {
    const ctx: HybridSearchContext = {
      ftsEngine: null,
      ftsAvailable: false,
      defaultAlpha: 0.5,
    };

    const results = await performHybridSearch(
      'test query',
      [0.1, 0.2, 0.3],
      { mode: 'fts', alpha: 0.5, topK: 10 },
      createMockVectorSearch([]),
      createMockGetChunksById([]),
      ctx
    );

    // FTS mode with no engine returns empty array (per implementation)
    expect(results.length).toBe(0);
  });

  it('should perform hybrid search combining both sources', async () => {
    const mockVectorResults: SearchResult[] = [
      { path: 'src/auth/login.ts', text: 'vector auth result', score: 0.9, startLine: 1, endLine: 10 },
      { path: 'src/database/query.ts', text: 'vector db result', score: 0.8, startLine: 1, endLine: 10 },
    ];

    const ctx: HybridSearchContext = {
      ftsEngine,
      ftsAvailable: true,
      defaultAlpha: 0.5,
    };

    const results = await performHybridSearch(
      'authenticate password',
      [0.1, 0.2, 0.3],
      { mode: 'hybrid', alpha: 0.5, topK: 10 },
      createMockVectorSearch(mockVectorResults),
      createMockGetChunksById(sampleCodeChunks),
      ctx
    );

    // Should have results from both sources
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].searchMode).toBe('hybrid');
  });
});

// ============================================================================
// FTS Engine Integration Tests
// ============================================================================

describe('Hybrid Search - FTS Engine Integration', () => {
  describe('NaturalBM25Engine with hybrid search', () => {
    let engine: NaturalBM25Engine;

    beforeEach(async () => {
      engine = createNaturalBM25Engine();
      await engine.addChunks(sampleCodeChunks);
    });

    afterEach(() => {
      engine.close();
    });

    it('should find exact keyword matches', () => {
      const results = engine.search('authenticate', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toContain('authenticate');
    });

    it('should find partial matches in function names', () => {
      const results = engine.search('hashPassword', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('src/utils/crypto.ts');
    });

    it('should find class names', () => {
      const results = engine.search('AuthService', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('src/auth/service.ts');
    });

    it('should find interface definitions', () => {
      const results = engine.search('interface User', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('src/models/user.ts');
    });

    it('should normalize scores for hybrid search', () => {
      const results = engine.search('password', 10);
      const normalized = engine.normalizeScores(results);

      expect(normalized.length).toBeGreaterThan(0);
      expect(normalized[0].score).toBe(1); // Top score should be 1
      for (const result of normalized) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('should support serialization for persistence', () => {
      const serialized = engine.serialize();
      expect(serialized).toBeTruthy();

      const newEngine = createNaturalBM25Engine();
      const success = newEngine.deserialize(serialized);
      expect(success).toBe(true);

      const results = newEngine.search('authenticate', 10);
      expect(results.length).toBeGreaterThan(0);

      newEngine.close();
    });

    it('should support incremental updates (removeByPath + addChunk)', async () => {
      // Remove existing file
      engine.removeByPath('src/auth/login.ts');

      // Verify it's gone
      let results = engine.search('authenticate', 10);
      const authResults = results.filter((r) => r.path === 'src/auth/login.ts');
      expect(authResults.length).toBe(0);

      // Add updated version
      await engine.addChunk(
        createTestChunk(
          'chunk-auth-1-updated',
          'function authenticate(user, pass) { return verifyUser(user, pass); }',
          'src/auth/login.ts',
          1,
          10
        )
      );

      // Verify update
      results = engine.search('verifyUser', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('src/auth/login.ts');
    });
  });
});

// ============================================================================
// Alpha Parameter Effect Tests
// ============================================================================

describe('Hybrid Search - Alpha Parameter Effects', () => {
  it('should favor vector results when alpha is high (0.9)', () => {
    // Vector result at rank 1, FTS at rank 5
    const vectorOnlyScore = calculateRRFScore(1, 0, 0.9, 60);
    const ftsOnlyScore = calculateRRFScore(0, 1, 0.9, 60);

    expect(vectorOnlyScore).toBeGreaterThan(ftsOnlyScore * 3); // Vector should dominate
  });

  it('should favor FTS results when alpha is low (0.1)', () => {
    // Vector result at rank 1, FTS at rank 1
    const vectorOnlyScore = calculateRRFScore(1, 0, 0.1, 60);
    const ftsOnlyScore = calculateRRFScore(0, 1, 0.1, 60);

    expect(ftsOnlyScore).toBeGreaterThan(vectorOnlyScore * 3); // FTS should dominate
  });

  it('should balance equally when alpha is 0.5', () => {
    const vectorOnlyScore = calculateRRFScore(1, 0, 0.5, 60);
    const ftsOnlyScore = calculateRRFScore(0, 1, 0.5, 60);

    expect(vectorOnlyScore).toBeCloseTo(ftsOnlyScore, 6);
  });

  it('should boost items appearing in both sources', () => {
    const bothSources = calculateRRFScore(1, 1, 0.5, 60);
    const vectorOnly = calculateRRFScore(1, 0, 0.5, 60);
    const ftsOnly = calculateRRFScore(0, 1, 0.5, 60);

    expect(bothSources).toBeGreaterThan(vectorOnly);
    expect(bothSources).toBeGreaterThan(ftsOnly);
    expect(bothSources).toBeCloseTo(vectorOnly + ftsOnly, 6);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Hybrid Search - Edge Cases', () => {
  let ftsEngine: NaturalBM25Engine;

  beforeEach(() => {
    ftsEngine = createNaturalBM25Engine();
  });

  afterEach(() => {
    ftsEngine.close();
  });

  it('should handle empty FTS index gracefully', () => {
    const results = ftsEngine.search('test', 10);
    expect(results).toEqual([]);
  });

  it('should handle query with no matches', async () => {
    await ftsEngine.addChunks(sampleCodeChunks);
    const results = ftsEngine.search('xyznonexistent', 10);
    expect(results).toEqual([]);
  });

  it('should handle special characters in query', async () => {
    await ftsEngine.addChunks(sampleCodeChunks);
    // Should not throw
    const results = ftsEngine.search('function()', 10);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle very long queries', async () => {
    await ftsEngine.addChunks(sampleCodeChunks);
    const longQuery = 'function '.repeat(100);
    // Should not throw
    const results = ftsEngine.search(longQuery, 10);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle concurrent search operations', async () => {
    await ftsEngine.addChunks(sampleCodeChunks);

    const searches = Promise.all([
      Promise.resolve(ftsEngine.search('authenticate', 10)),
      Promise.resolve(ftsEngine.search('database', 10)),
      Promise.resolve(ftsEngine.search('user', 10)),
    ]);

    const results = await searches;
    expect(results.length).toBe(3);
    for (const result of results) {
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

describe('Hybrid Search - Backward Compatibility', () => {
  it('should fall back to vector-only when hybridSearch.enabled is false', async () => {
    // This tests that when an index doesn't have FTS, it still works
    const mockVectorResults: SearchResult[] = [
      { path: 'file1.ts', text: 'result', score: 0.9, startLine: 1, endLine: 10 },
    ];

    const ctx: HybridSearchContext = {
      ftsEngine: null,
      ftsAvailable: false,
      defaultAlpha: 0.5,
    };

    const results = await performHybridSearch(
      'test',
      [0.1, 0.2, 0.3],
      { mode: 'hybrid', alpha: 0.5, topK: 10 },
      async () => mockVectorResults,
      async () => new Map(),
      ctx
    );

    expect(results.length).toBe(1);
    expect(results[0].searchMode).toBe('vector');
  });

  it('should handle missing mode parameter (default to hybrid)', () => {
    const mode = validateSearchMode(undefined);
    expect(mode).toBe('hybrid');
  });

  it('should handle missing alpha parameter (use default)', () => {
    const alpha = validateAlpha(undefined, 0.7);
    expect(alpha).toBe(0.7);
  });
});
