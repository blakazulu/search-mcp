/**
 * Advanced Multi-Factor Search Ranking Tests (SMCP-087)
 *
 * Tests cover:
 * - Core ranking function (applyAdvancedRanking)
 * - Chunk type boosting
 * - Name matching with CamelCase/snake_case
 * - Path/filename relevance
 * - Docstring presence bonus
 * - Complexity penalty
 * - Configuration options
 * - Helper functions
 * - Edge cases
 * - Performance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyAdvancedRanking,
  calculateChunkTypeBoost,
  calculateNameBoost,
  calculatePathBoost,
  calculateDocstringBonus,
  calculateComplexityPenalty,
  createRanker,
  extractScores,
  getTopResults,
  getRankingStats,
  DEFAULT_RANKING_CONFIG,
  type RankableResult,
  type RankedResult,
  type AdvancedRankingConfig,
  type RankingFactors,
} from '../../../src/engines/advancedRanking.js';
import { getChunkTypeBoosts, detectQueryIntent } from '../../../src/engines/queryIntent.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockResult(overrides: Partial<RankableResult> = {}): RankableResult {
  return {
    id: 'test-1',
    score: 0.8,
    text: 'function testFunction() { return true; }',
    path: 'src/utils/helpers.ts',
    chunkType: 'function',
    chunkName: 'testFunction',
    chunkTags: [],
    ...overrides,
  };
}

function createMockResults(count: number): RankableResult[] {
  return Array.from({ length: count }, (_, i) => createMockResult({
    id: `test-${i + 1}`,
    score: 0.9 - i * 0.1,
    chunkName: `function${i + 1}`,
  }));
}

// ============================================================================
// Core Ranking Function Tests
// ============================================================================

describe('applyAdvancedRanking', () => {
  it('should return results in ranked order', () => {
    const results = [
      createMockResult({ id: '1', score: 0.5, name: 'lowScore' }),
      createMockResult({ id: '2', score: 0.9, name: 'highScore' }),
      createMockResult({ id: '3', score: 0.7, name: 'midScore' }),
    ];

    const ranked = applyAdvancedRanking('test query', results);

    // Results should be sorted by final score (descending)
    expect(ranked[0].result.id).toBe('2'); // highest original score
    expect(ranked[0].finalScore).toBeGreaterThan(ranked[1].finalScore);
    expect(ranked[1].finalScore).toBeGreaterThan(ranked[2].finalScore);
  });

  it('should preserve original score in result', () => {
    const results = [createMockResult({ score: 0.75 })];
    const ranked = applyAdvancedRanking('test', results);

    expect(ranked[0].originalScore).toBe(0.75);
  });

  it('should include ranking factors breakdown', () => {
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking('function test', results);

    expect(ranked[0].factors).toBeDefined();
    expect(ranked[0].factors.baseScore).toBeDefined();
    expect(ranked[0].factors.chunkTypeBoost).toBeDefined();
    expect(ranked[0].factors.nameBoost).toBeDefined();
    expect(ranked[0].factors.pathBoost).toBeDefined();
    expect(ranked[0].factors.tagBoost).toBeDefined();
    expect(ranked[0].factors.docstringBonus).toBeDefined();
    expect(ranked[0].factors.complexityPenalty).toBeDefined();
  });

  it('should include detected query intent', () => {
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking('function handler', results);

    expect(ranked[0].intent).toBeDefined();
    expect(ranked[0].intent?.primaryIntent).toBe('function');
  });

  it('should handle empty results', () => {
    const ranked = applyAdvancedRanking('test', []);
    expect(ranked).toEqual([]);
  });

  it('should handle single result', () => {
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking('test', results);

    expect(ranked.length).toBe(1);
    expect(ranked[0].result.id).toBe('test-1');
  });

  it('should boost function chunks for function queries', () => {
    const results = [
      createMockResult({ id: '1', score: 0.8, chunkType: 'module', chunkName: 'utils' }),
      createMockResult({ id: '2', score: 0.8, chunkType: 'function', chunkName: 'handler' }),
    ];

    const ranked = applyAdvancedRanking('function handler', results);

    // Function chunk should rank higher for function query
    expect(ranked[0].result.chunkType).toBe('function');
    expect(ranked[0].factors.chunkTypeBoost).toBeGreaterThan(ranked[1].factors.chunkTypeBoost);
  });

  it('should boost class chunks for class queries', () => {
    const results = [
      createMockResult({ id: '1', score: 0.8, chunkType: 'function', chunkName: 'helper' }),
      createMockResult({ id: '2', score: 0.8, chunkType: 'class', chunkName: 'Service' }),
    ];

    const ranked = applyAdvancedRanking('class UserService', results);

    // Class chunk should rank higher for class query
    expect(ranked[0].result.chunkType).toBe('class');
  });

  it('should respect enabled=false config', () => {
    const results = [createMockResult({ score: 0.5 })];
    const ranked = applyAdvancedRanking('function test', results, { enabled: false });

    // When disabled, final score should equal original score
    expect(ranked[0].finalScore).toBe(ranked[0].originalScore);
    expect(ranked[0].factors.chunkTypeBoost).toBe(1.0);
    expect(ranked[0].factors.nameBoost).toBe(1.0);
  });
});

// ============================================================================
// Chunk Type Boost Tests
// ============================================================================

describe('calculateChunkTypeBoost', () => {
  it('should return boost for function chunk type', () => {
    const intent = detectQueryIntent('function handler');
    const boosts = getChunkTypeBoosts(intent);
    const boost = calculateChunkTypeBoost('function', boosts);

    expect(boost).toBeGreaterThan(1.0);
  });

  it('should return boost for class chunk type', () => {
    const intent = detectQueryIntent('class UserService');
    const boosts = getChunkTypeBoosts(intent);
    const boost = calculateChunkTypeBoost('class', boosts);

    expect(boost).toBeGreaterThan(1.0);
  });

  it('should handle method chunk type', () => {
    const intent = detectQueryIntent('method handler');
    const boosts = getChunkTypeBoosts(intent);
    const boost = calculateChunkTypeBoost('method', boosts);

    expect(boost).toBeGreaterThan(1.0);
  });

  it('should return default boost for unknown chunk type', () => {
    const intent = detectQueryIntent('function');
    const boosts = getChunkTypeBoosts(intent);
    const boost = calculateChunkTypeBoost('unknown', boosts);

    expect(boost).toBe(boosts.other);
  });

  it('should handle undefined chunk type', () => {
    const intent = detectQueryIntent('function');
    const boosts = getChunkTypeBoosts(intent);
    const boost = calculateChunkTypeBoost(undefined, boosts);

    expect(boost).toBe(boosts.other);
  });

  it('should handle type aliases', () => {
    const intent = detectQueryIntent('function');
    const boosts = getChunkTypeBoosts(intent);

    expect(calculateChunkTypeBoost('func', boosts)).toBe(boosts.function);
    expect(calculateChunkTypeBoost('fn', boosts)).toBe(boosts.function);
    expect(calculateChunkTypeBoost('cls', boosts)).toBe(boosts.class);
    expect(calculateChunkTypeBoost('struct', boosts)).toBe(boosts.class);
    expect(calculateChunkTypeBoost('interface', boosts)).toBe(boosts.class);
  });

  it('should be case insensitive', () => {
    const intent = detectQueryIntent('function');
    const boosts = getChunkTypeBoosts(intent);

    expect(calculateChunkTypeBoost('FUNCTION', boosts)).toBe(boosts.function);
    expect(calculateChunkTypeBoost('Function', boosts)).toBe(boosts.function);
    expect(calculateChunkTypeBoost('CLASS', boosts)).toBe(boosts.class);
  });
});

// ============================================================================
// Name Matching Tests
// ============================================================================

describe('calculateNameBoost', () => {
  it('should return exact match boost for exact match', () => {
    const boost = calculateNameBoost('getUserById', 'getUserById', ['get', 'user', 'by', 'id']);
    expect(boost).toBe(1.4);
  });

  it('should return exact match boost for case-insensitive match', () => {
    const boost = calculateNameBoost('getuser', 'GetUser', ['getuser']);
    expect(boost).toBe(1.4);
  });

  it('should return weak boost for low token overlap', () => {
    // name: 'findUser' tokenizes to ['find', 'user']
    // queryTokens: ['get', 'user', 'by', 'id'] (4 tokens)
    // overlap: 'user' (1 token out of 4 = 25%, below 30%)
    const boost = calculateNameBoost('findUser', 'get user by id', ['get', 'user', 'by', 'id']);
    expect(boost).toBe(1.05);
  });

  it('should boost for CamelCase name matching', () => {
    const boost = calculateNameBoost('UserService', 'user service', ['user', 'service']);
    // Exact match in tokens
    expect(boost).toBe(1.3); // 100% overlap
  });

  it('should boost for snake_case name matching', () => {
    const boost = calculateNameBoost('get_user_by_id', 'get user', ['get', 'user']);
    // 2/2 = 100% overlap
    expect(boost).toBe(1.3);
  });

  it('should return 1.0 for no name', () => {
    const boost = calculateNameBoost(undefined, 'test', ['test']);
    expect(boost).toBe(1.0);
  });

  it('should return 1.0 for empty query tokens', () => {
    const boost = calculateNameBoost('testFunction', 'test', []);
    expect(boost).toBe(1.0);
  });

  it('should return 1.0 for no overlap', () => {
    const boost = calculateNameBoost('xyz', 'abc', ['abc']);
    expect(boost).toBe(1.0);
  });

  it('should handle partial token overlap', () => {
    // 2 of 4 tokens overlap = 50%
    const boost = calculateNameBoost('getUserData', 'get user info request', ['get', 'user', 'info', 'request']);
    expect(boost).toBe(1.2); // 50%+ overlap
  });
});

// ============================================================================
// Path Relevance Tests
// ============================================================================

describe('calculatePathBoost', () => {
  it('should boost for matching path tokens', () => {
    const boost = calculatePathBoost('src/auth/login.ts', ['auth', 'login']);
    expect(boost).toBeGreaterThan(1.0);
  });

  it('should increase boost for more matching tokens', () => {
    const boost1 = calculatePathBoost('src/utils/helpers.ts', ['utils']);
    const boost2 = calculatePathBoost('src/utils/helpers.ts', ['utils', 'helpers']);

    expect(boost2).toBeGreaterThan(boost1);
  });

  it('should handle Windows paths', () => {
    const boost = calculatePathBoost('src\\auth\\login.ts', ['auth', 'login']);
    expect(boost).toBeGreaterThan(1.0);
  });

  it('should return 1.0 for no path', () => {
    const boost = calculatePathBoost(undefined, ['test']);
    expect(boost).toBe(1.0);
  });

  it('should return 1.0 for empty query tokens', () => {
    const boost = calculatePathBoost('src/test.ts', []);
    expect(boost).toBe(1.0);
  });

  it('should return 1.0 for no overlap', () => {
    const boost = calculatePathBoost('src/foo/bar.ts', ['xyz', 'abc']);
    expect(boost).toBe(1.0);
  });

  it('should cap boost at maximum', () => {
    // Many overlapping tokens
    const boost = calculatePathBoost(
      'src/auth/login/user/session/token/jwt/validate.ts',
      ['auth', 'login', 'user', 'session', 'token', 'jwt', 'validate', 'src']
    );
    expect(boost).toBeLessThanOrEqual(1.2); // MAX_PATH_BOOST
  });
});

// ============================================================================
// Docstring Bonus Tests
// ============================================================================

describe('calculateDocstringBonus', () => {
  it('should return bonus for present docstring', () => {
    const bonus = calculateDocstringBonus('This function does something', 'function', false);
    expect(bonus).toBe(1.05);
  });

  it('should return 1.0 for no docstring', () => {
    const bonus = calculateDocstringBonus(undefined, 'function', false);
    expect(bonus).toBe(1.0);
  });

  it('should return 1.0 for empty docstring', () => {
    const bonus = calculateDocstringBonus('', 'function', false);
    expect(bonus).toBe(1.0);
  });

  it('should return 1.0 for whitespace-only docstring', () => {
    const bonus = calculateDocstringBonus('   \n\t  ', 'function', false);
    expect(bonus).toBe(1.0);
  });

  it('should reduce bonus for module docstring on entity query', () => {
    const normalBonus = calculateDocstringBonus('Module docs', 'function', true);
    const reducedBonus = calculateDocstringBonus('Module docs', 'module', true);

    expect(reducedBonus).toBeLessThan(normalBonus);
    expect(reducedBonus).toBeGreaterThan(1.0);
  });

  it('should apply custom bonus value', () => {
    const bonus = calculateDocstringBonus('Documentation', 'function', false, 1.1);
    expect(bonus).toBe(1.1);
  });
});

// ============================================================================
// Complexity Penalty Tests
// ============================================================================

describe('calculateComplexityPenalty', () => {
  const thresholds = { mild: 2000, strong: 4000 };

  it('should return no penalty for small chunks', () => {
    const text = 'a'.repeat(1000);
    const penalty = calculateComplexityPenalty(text, thresholds);
    expect(penalty).toBe(1.0);
  });

  it('should return mild penalty for medium chunks', () => {
    const text = 'a'.repeat(3000);
    const penalty = calculateComplexityPenalty(text, thresholds);
    expect(penalty).toBe(0.98);
  });

  it('should return strong penalty for large chunks', () => {
    const text = 'a'.repeat(5000);
    const penalty = calculateComplexityPenalty(text, thresholds);
    expect(penalty).toBe(0.95);
  });

  it('should return no penalty for undefined text', () => {
    const penalty = calculateComplexityPenalty(undefined, thresholds);
    expect(penalty).toBe(1.0);
  });

  it('should return no penalty for empty text', () => {
    const penalty = calculateComplexityPenalty('', thresholds);
    expect(penalty).toBe(1.0);
  });

  it('should respect custom thresholds', () => {
    const customThresholds = { mild: 100, strong: 200 };
    const text = 'a'.repeat(150);
    const penalty = calculateComplexityPenalty(text, customThresholds);
    expect(penalty).toBe(0.98); // mild penalty
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('AdvancedRankingConfig', () => {
  it('should use default config when not provided', () => {
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking('test', results);

    expect(ranked[0].factors).toBeDefined();
  });

  it('should merge partial config with defaults', () => {
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking('test', results, {
      docstringBonusValue: 1.1,
    });

    // Should use custom docstring value
    // but default values for everything else
    expect(ranked[0].factors).toBeDefined();
  });

  it('should respect weight adjustments', () => {
    const results = [
      createMockResult({ id: '1', score: 0.8, chunkName: 'handler' }),
      createMockResult({ id: '2', score: 0.8, chunkName: 'other' }),
    ];

    // With high name weight
    const ranked = applyAdvancedRanking('handler', results, {
      weights: { name: 2.0, chunkType: 1.0, path: 1.0, tag: 1.0, docstring: 1.0, complexity: 1.0 },
    });

    // The result with matching name should have higher boost
    expect(ranked[0].result.chunkName).toBe('handler');
  });

  it('should disable factor with weight 0', () => {
    const results = [createMockResult({ chunkDocstring: 'Has docstring' })];

    const ranked = applyAdvancedRanking('test', results, {
      weights: { name: 1.0, chunkType: 1.0, path: 1.0, tag: 1.0, docstring: 0.0, complexity: 1.0 },
    });

    // Docstring should not affect score when weight is 0
    // The factor is still calculated, but its effect is neutralized
    expect(ranked[0].factors.docstringBonus).toBeGreaterThan(1.0);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('createRanker', () => {
  it('should create a configured ranking function', () => {
    const rank = createRanker({ weights: { name: 1.5, chunkType: 1.0, path: 1.0, tag: 1.0, docstring: 1.0, complexity: 1.0 } });
    const results = [createMockResult()];
    const ranked = rank('test', results);

    expect(ranked.length).toBe(1);
    expect(ranked[0].result).toBeDefined();
  });

  it('should preserve configuration across calls', () => {
    const rank = createRanker({ enabled: false });

    const ranked1 = rank('test1', [createMockResult({ id: '1' })]);
    const ranked2 = rank('test2', [createMockResult({ id: '2' })]);

    // Both should have factors of 1.0 when disabled
    expect(ranked1[0].factors.chunkTypeBoost).toBe(1.0);
    expect(ranked2[0].factors.chunkTypeBoost).toBe(1.0);
  });
});

describe('extractScores', () => {
  it('should extract id and score pairs', () => {
    const results = [
      createMockResult({ id: 'a', score: 0.9 }),
      createMockResult({ id: 'b', score: 0.8 }),
    ];
    const ranked = applyAdvancedRanking('test', results);
    const scores = extractScores(ranked);

    expect(scores.length).toBe(2);
    expect(scores[0]).toHaveProperty('id');
    expect(scores[0]).toHaveProperty('score');
  });

  it('should return empty array for empty input', () => {
    const scores = extractScores([]);
    expect(scores).toEqual([]);
  });
});

describe('getTopResults', () => {
  it('should return top N results', () => {
    const results = createMockResults(10);
    const ranked = applyAdvancedRanking('test', results);
    const top = getTopResults(ranked, 3);

    expect(top.length).toBe(3);
  });

  it('should return all results if N > length', () => {
    const results = createMockResults(3);
    const ranked = applyAdvancedRanking('test', results);
    const top = getTopResults(ranked, 10);

    expect(top.length).toBe(3);
  });

  it('should return empty for N=0', () => {
    const results = createMockResults(5);
    const ranked = applyAdvancedRanking('test', results);
    const top = getTopResults(ranked, 0);

    expect(top.length).toBe(0);
  });
});

describe('getRankingStats', () => {
  it('should calculate factor averages', () => {
    const results = createMockResults(5);
    const ranked = applyAdvancedRanking('function test', results);
    const stats = getRankingStats(ranked);

    expect(stats.factorAverages).toBeDefined();
    expect(stats.factorAverages.baseScore).toBeGreaterThan(0);
  });

  it('should calculate factor ranges', () => {
    const results = createMockResults(5);
    const ranked = applyAdvancedRanking('test', results);
    const stats = getRankingStats(ranked);

    expect(stats.factorRanges).toBeDefined();
    expect(stats.factorRanges.baseScore.min).toBeLessThanOrEqual(stats.factorRanges.baseScore.max);
  });

  it('should calculate score improvement stats', () => {
    const results = createMockResults(5);
    const ranked = applyAdvancedRanking('function handler', results);
    const stats = getRankingStats(ranked);

    expect(stats.scoreImprovement).toBeDefined();
    expect(stats.scoreImprovement.average).toBeDefined();
    expect(stats.scoreImprovement.max).toBeDefined();
    expect(stats.scoreImprovement.rankChanges).toBeDefined();
  });

  it('should handle empty results', () => {
    const stats = getRankingStats([]);

    expect(stats.factorAverages.baseScore).toBe(0);
    expect(stats.scoreImprovement.average).toBe(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Ranking Integration', () => {
  it('should reorder results based on query intent', () => {
    const results = [
      createMockResult({ id: '1', score: 0.8, chunkType: 'module', chunkName: 'utils' }),
      createMockResult({ id: '2', score: 0.75, chunkType: 'function', chunkName: 'handleAuth' }),
      createMockResult({ id: '3', score: 0.7, chunkType: 'class', chunkName: 'AuthService' }),
    ];

    // For auth-related query, class/function should rank higher than module
    const ranked = applyAdvancedRanking('authentication handler', results);

    // The function or class with auth in name should rank high
    const topResult = ranked[0].result;
    expect(topResult.chunkName === 'handleAuth' || topResult.chunkName === 'AuthService').toBe(true);
  });

  it('should combine multiple boost factors', () => {
    const results = [
      createMockResult({
        id: '1',
        score: 0.7,
        chunkType: 'function',
        chunkName: 'handleUserAuth',
        path: 'src/auth/handler.ts',
        chunkDocstring: 'Handles user authentication',
        text: 'short code',
      }),
      createMockResult({
        id: '2',
        score: 0.75,
        chunkType: 'module',
        chunkName: 'utils',
        path: 'src/utils/index.ts',
        text: 'a'.repeat(5000), // Very long, gets penalty
      }),
    ];

    const ranked = applyAdvancedRanking('auth handler', results);

    // First result should win despite lower base score
    // due to: function boost + name match + path match + docstring + no complexity penalty
    expect(ranked[0].result.id).toBe('1');
  });

  it('should handle results without metadata gracefully', () => {
    const results: RankableResult[] = [
      {
        id: '1',
        score: 0.8,
        text: 'some code',
        path: 'file.ts',
        // No optional fields
      },
    ];

    const ranked = applyAdvancedRanking('test', results);

    expect(ranked.length).toBe(1);
    expect(ranked[0].factors.nameBoost).toBe(1.0);
    expect(ranked[0].factors.docstringBonus).toBe(1.0);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Ranking Performance', () => {
  it('should rank results efficiently', () => {
    const results = createMockResults(100);

    const startTime = performance.now();
    const ranked = applyAdvancedRanking('function handler auth test', results);
    const endTime = performance.now();

    const duration = endTime - startTime;

    // Should complete in under 50ms for 100 results
    expect(duration).toBeLessThan(50);
    expect(ranked.length).toBe(100);
  });

  it('should handle large result sets', () => {
    const results = createMockResults(500);

    const startTime = performance.now();
    const ranked = applyAdvancedRanking('test query', results);
    const endTime = performance.now();

    const duration = endTime - startTime;

    // Should complete in under 200ms for 500 results
    expect(duration).toBeLessThan(200);
    expect(ranked.length).toBe(500);
  });

  it('should batch-process efficiently', () => {
    const results = createMockResults(20);
    const iterations = 50;

    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      applyAdvancedRanking(`query ${i}`, results);
    }
    const endTime = performance.now();

    const avgTime = (endTime - startTime) / iterations;

    // Average should be under 10ms per ranking
    expect(avgTime).toBeLessThan(10);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty query', () => {
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking('', results);

    expect(ranked.length).toBe(1);
  });

  it('should handle query with special characters', () => {
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking('@#$%^&*()', results);

    expect(ranked.length).toBe(1);
  });

  it('should handle unicode in query and names', () => {
    const results = [
      createMockResult({ chunkName: 'handleEmoji' }),
    ];
    const ranked = applyAdvancedRanking('handle emoji test', results);

    expect(ranked.length).toBe(1);
  });

  it('should handle very long queries', () => {
    const longQuery = 'function '.repeat(100);
    const results = [createMockResult()];
    const ranked = applyAdvancedRanking(longQuery, results);

    expect(ranked.length).toBe(1);
  });

  it('should handle results with all equal scores', () => {
    const results = [
      createMockResult({ id: '1', score: 0.5 }),
      createMockResult({ id: '2', score: 0.5 }),
      createMockResult({ id: '3', score: 0.5 }),
    ];
    const ranked = applyAdvancedRanking('test', results);

    expect(ranked.length).toBe(3);
    // All should still have valid final scores
    ranked.forEach(r => {
      expect(r.finalScore).toBeGreaterThan(0);
    });
  });

  it('should handle zero scores', () => {
    const results = [createMockResult({ score: 0 })];
    const ranked = applyAdvancedRanking('test', results);

    expect(ranked[0].originalScore).toBe(0);
    expect(ranked[0].finalScore).toBe(0);
  });
});

// ============================================================================
// Default Config Tests
// ============================================================================

describe('DEFAULT_RANKING_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_RANKING_CONFIG.enabled).toBe(true);
    expect(DEFAULT_RANKING_CONFIG.docstringBonusValue).toBe(1.05);
    expect(DEFAULT_RANKING_CONFIG.complexityThresholds?.mild).toBe(2000);
    expect(DEFAULT_RANKING_CONFIG.complexityThresholds?.strong).toBe(4000);
  });

  it('should have default weights of 1.0', () => {
    expect(DEFAULT_RANKING_CONFIG.weights?.chunkType).toBe(1.0);
    expect(DEFAULT_RANKING_CONFIG.weights?.name).toBe(1.0);
    expect(DEFAULT_RANKING_CONFIG.weights?.path).toBe(1.0);
    expect(DEFAULT_RANKING_CONFIG.weights?.tag).toBe(1.0);
    expect(DEFAULT_RANKING_CONFIG.weights?.docstring).toBe(1.0);
    expect(DEFAULT_RANKING_CONFIG.weights?.complexity).toBe(1.0);
  });
});
