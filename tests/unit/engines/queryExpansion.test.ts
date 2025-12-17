/**
 * Query Expansion & Synonyms Tests (SMCP-095)
 *
 * Tests cover:
 * - Basic query expansion
 * - Multiple term expansion
 * - No-op for unknown terms
 * - Configuration: enabled/disabled
 * - Configuration: maxExpansionTerms
 * - Custom expansion mappings
 * - Edge cases: empty queries, whitespace, special characters
 * - Helper functions: hasExpansion, getExpansionTerms, etc.
 * - Performance (< 1ms per expansion)
 * - Duplicate removal
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  expandQuery,
  expandQueryWithDetails,
  hasExpansion,
  getExpansionTerms,
  getExpansionKeys,
  getExpansionCount,
  createQueryExpander,
  createDetailedQueryExpander,
  DEFAULT_QUERY_EXPANSIONS,
  DEFAULT_EXPANSION_CONFIG,
  EXPANSION_CATEGORIES,
  type QueryExpansionConfig,
  type QueryExpansionResult,
} from '../../../src/engines/queryExpansion.js';

// ============================================================================
// Basic Expansion Tests
// ============================================================================

describe('expandQuery', () => {
  describe('basic expansion', () => {
    it('should expand "auth" to include authentication terms', () => {
      const expanded = expandQuery('auth');
      expect(expanded).toContain('auth');
      expect(expanded).toContain('authentication');
      expect(expanded).toContain('login');
    });

    it('should expand "db" to include database terms', () => {
      const expanded = expandQuery('db');
      expect(expanded).toContain('db');
      expect(expanded).toContain('database');
      expect(expanded).toContain('storage');
    });

    it('should expand "api" to include endpoint terms', () => {
      const expanded = expandQuery('api');
      expect(expanded).toContain('api');
      expect(expanded).toContain('endpoint');
      expect(expanded).toContain('request');
    });

    it('should expand "err" to include error terms', () => {
      const expanded = expandQuery('err');
      expect(expanded).toContain('err');
      expect(expanded).toContain('error');
      expect(expanded).toContain('exception');
    });

    it('should expand "config" to include settings terms', () => {
      const expanded = expandQuery('config');
      expect(expanded).toContain('config');
      expect(expanded).toContain('configuration');
      expect(expanded).toContain('settings');
    });

    it('should expand "async" to include promise terms', () => {
      const expanded = expandQuery('async');
      expect(expanded).toContain('async');
      expect(expanded).toContain('asynchronous');
      expect(expanded).toContain('promise');
    });

    it('should expand "util" to include helper terms', () => {
      const expanded = expandQuery('util');
      expect(expanded).toContain('util');
      expect(expanded).toContain('utility');
      expect(expanded).toContain('helper');
    });
  });

  describe('multiple term expansion', () => {
    it('should expand multiple terms in a query', () => {
      const expanded = expandQuery('auth db');
      expect(expanded).toContain('auth');
      expect(expanded).toContain('authentication');
      expect(expanded).toContain('db');
      expect(expanded).toContain('database');
    });

    it('should expand mixed terms (some expandable, some not)', () => {
      const expanded = expandQuery('auth middleware xyz');
      expect(expanded).toContain('auth');
      expect(expanded).toContain('authentication');
      expect(expanded).toContain('middleware');
      expect(expanded).toContain('xyz');
    });

    it('should handle queries with multiple expandable terms', () => {
      const expanded = expandQuery('api config test');
      expect(expanded).toContain('api');
      expect(expanded).toContain('endpoint');
      expect(expanded).toContain('config');
      expect(expanded).toContain('configuration');
      expect(expanded).toContain('test');
      expect(expanded).toContain('testing');
    });
  });

  describe('no expansion cases', () => {
    it('should not expand unknown terms', () => {
      const expanded = expandQuery('xyz');
      expect(expanded).toBe('xyz');
    });

    it('should return query unchanged if no terms match', () => {
      const expanded = expandQuery('custom special term');
      expect(expanded).toBe('custom special term');
    });

    it('should handle query that is already expanded', () => {
      const expanded = expandQuery('authentication');
      // 'authentication' maps to 'auth authorize login session token'
      expect(expanded).toContain('authentication');
      expect(expanded).toContain('auth');
    });
  });

  describe('duplicate removal', () => {
    it('should not add duplicate terms', () => {
      const expanded = expandQuery('auth authentication');
      const words = expanded.split(' ');
      // Count 'auth' occurrences
      const authCount = words.filter((w) => w === 'auth').length;
      const authenticationCount = words.filter((w) => w === 'authentication').length;
      expect(authCount).toBe(1);
      expect(authenticationCount).toBe(1);
    });

    it('should preserve original query terms before expansions', () => {
      const expanded = expandQuery('auth');
      // The query should start with 'auth'
      expect(expanded.startsWith('auth ')).toBe(true);
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('expandQuery configuration', () => {
  describe('enabled/disabled', () => {
    it('should return original query when disabled', () => {
      const expanded = expandQuery('auth db config', { enabled: false });
      expect(expanded).toBe('auth db config');
    });

    it('should expand when enabled', () => {
      const expanded = expandQuery('auth', { enabled: true });
      expect(expanded).not.toBe('auth');
      expect(expanded).toContain('authentication');
    });
  });

  describe('maxExpansionTerms', () => {
    it('should limit expansion terms', () => {
      const expanded = expandQuery('auth', { maxExpansionTerms: 2 });
      // Original 'auth' + max 2 expansion terms
      const words = expanded.split(' ');
      expect(words.length).toBeLessThanOrEqual(3);
    });

    it('should use all terms when maxExpansionTerms is high', () => {
      const expanded = expandQuery('auth', { maxExpansionTerms: 100 });
      expect(expanded.split(' ').length).toBeGreaterThan(3);
    });

    it('should use default maxExpansionTerms if not specified', () => {
      const expanded = expandQuery('auth');
      // Default is 10, plus original term
      const words = expanded.split(' ');
      expect(words.length).toBeLessThanOrEqual(11);
    });
  });

  describe('customExpansions', () => {
    it('should use custom expansion mappings', () => {
      const expanded = expandQuery('myterm', {
        customExpansions: {
          myterm: 'custom expansion terms',
        },
      });
      expect(expanded).toContain('myterm');
      expect(expanded).toContain('custom');
      expect(expanded).toContain('expansion');
    });

    it('should merge custom expansions with defaults', () => {
      const expanded = expandQuery('auth myterm', {
        customExpansions: {
          myterm: 'custom',
        },
      });
      expect(expanded).toContain('auth');
      expect(expanded).toContain('authentication');
      expect(expanded).toContain('myterm');
      expect(expanded).toContain('custom');
    });

    it('should allow custom expansions to override defaults', () => {
      const expanded = expandQuery('auth', {
        customExpansions: {
          auth: 'override only',
        },
      });
      expect(expanded).toContain('auth');
      expect(expanded).toContain('override');
      expect(expanded).toContain('only');
      // Should NOT contain default expansion terms
      expect(expanded).not.toContain('authentication');
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('expandQuery edge cases', () => {
  it('should handle empty query', () => {
    const expanded = expandQuery('');
    expect(expanded).toBe('');
  });

  it('should handle whitespace-only query', () => {
    const expanded = expandQuery('   ');
    expect(expanded).toBe('   ');
  });

  it('should handle single space', () => {
    const expanded = expandQuery(' ');
    expect(expanded).toBe(' ');
  });

  it('should handle query with extra whitespace', () => {
    const expanded = expandQuery('  auth  ');
    expect(expanded.trim()).toContain('auth');
    expect(expanded.trim()).toContain('authentication');
  });

  it('should handle special characters', () => {
    const expanded = expandQuery('@#$%');
    expect(expanded).toBe('@#$%');
  });

  it('should handle mixed special chars and terms', () => {
    const expanded = expandQuery('auth @test');
    expect(expanded).toContain('auth');
    expect(expanded).toContain('@test');
  });

  it('should be case insensitive', () => {
    const lower = expandQuery('auth');
    const upper = expandQuery('AUTH');
    const mixed = expandQuery('Auth');
    // All should expand
    expect(lower).toContain('authentication');
    expect(upper).toContain('authentication');
    expect(mixed).toContain('authentication');
  });

  it('should handle numbers', () => {
    const expanded = expandQuery('123');
    expect(expanded).toBe('123');
  });

  it('should handle mixed alphanumeric', () => {
    const expanded = expandQuery('auth123');
    // 'auth123' is not a match, only 'auth' is
    expect(expanded).toBe('auth123');
  });
});

// ============================================================================
// Detailed Expansion Tests
// ============================================================================

describe('expandQueryWithDetails', () => {
  it('should return QueryExpansionResult', () => {
    const result = expandQueryWithDetails('auth');
    expect(result).toHaveProperty('originalQuery');
    expect(result).toHaveProperty('expandedQuery');
    expect(result).toHaveProperty('expandedTerms');
    expect(result).toHaveProperty('appliedExpansions');
    expect(result).toHaveProperty('expansionTimeMs');
  });

  it('should preserve originalQuery', () => {
    const result = expandQueryWithDetails('auth db');
    expect(result.originalQuery).toBe('auth db');
  });

  it('should track applied expansions', () => {
    const result = expandQueryWithDetails('auth db');
    expect(result.appliedExpansions).toContain('auth');
    expect(result.appliedExpansions).toContain('db');
  });

  it('should list expanded terms', () => {
    const result = expandQueryWithDetails('auth');
    expect(result.expandedTerms.length).toBeGreaterThan(0);
    expect(result.expandedTerms).toContain('authentication');
    expect(result.expandedTerms).not.toContain('auth'); // Original not in expanded
  });

  it('should measure expansion time', () => {
    const result = expandQueryWithDetails('auth db config');
    expect(typeof result.expansionTimeMs).toBe('number');
    expect(result.expansionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle no expansion case', () => {
    const result = expandQueryWithDetails('xyz');
    expect(result.appliedExpansions).toEqual([]);
    expect(result.expandedTerms).toEqual([]);
    expect(result.expandedQuery).toBe('xyz');
  });

  it('should handle disabled config', () => {
    const result = expandQueryWithDetails('auth', { enabled: false });
    expect(result.appliedExpansions).toEqual([]);
    expect(result.expandedTerms).toEqual([]);
    expect(result.expandedQuery).toBe('auth');
    expect(result.expansionTimeMs).toBe(0);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('hasExpansion', () => {
  it('should return true for known terms', () => {
    expect(hasExpansion('auth')).toBe(true);
    expect(hasExpansion('db')).toBe(true);
    expect(hasExpansion('api')).toBe(true);
  });

  it('should return false for unknown terms', () => {
    expect(hasExpansion('xyz')).toBe(false);
    expect(hasExpansion('randomterm')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(hasExpansion('AUTH')).toBe(true);
    expect(hasExpansion('Auth')).toBe(true);
  });

  it('should check custom expansions', () => {
    expect(hasExpansion('myterm', { myterm: 'expansion' })).toBe(true);
  });
});

describe('getExpansionTerms', () => {
  it('should return expansion terms for known key', () => {
    const terms = getExpansionTerms('auth');
    expect(terms).toContain('authentication');
    expect(terms).toContain('login');
  });

  it('should return empty array for unknown key', () => {
    const terms = getExpansionTerms('xyz');
    expect(terms).toEqual([]);
  });

  it('should be case insensitive', () => {
    const lower = getExpansionTerms('auth');
    const upper = getExpansionTerms('AUTH');
    expect(lower).toEqual(upper);
  });

  it('should include custom expansions', () => {
    const terms = getExpansionTerms('myterm', { myterm: 'custom expansion' });
    expect(terms).toContain('custom');
    expect(terms).toContain('expansion');
  });
});

describe('getExpansionKeys', () => {
  it('should return all expansion keys', () => {
    const keys = getExpansionKeys();
    expect(keys).toContain('auth');
    expect(keys).toContain('db');
    expect(keys).toContain('api');
    expect(keys.length).toBeGreaterThan(50);
  });

  it('should include custom expansion keys', () => {
    const keys = getExpansionKeys({ myterm: 'custom' });
    expect(keys).toContain('auth');
    expect(keys).toContain('myterm');
  });
});

describe('getExpansionCount', () => {
  it('should return number of expansions', () => {
    const count = getExpansionCount();
    expect(count).toBeGreaterThan(50);
  });

  it('should increase with custom expansions', () => {
    const baseCount = getExpansionCount();
    const withCustom = getExpansionCount({ newterm: 'expansion' });
    expect(withCustom).toBe(baseCount + 1);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createQueryExpander', () => {
  it('should create a configured expander function', () => {
    const expand = createQueryExpander({ maxExpansionTerms: 3 });
    const result = expand('auth');
    const words = result.split(' ');
    expect(words.length).toBeLessThanOrEqual(4); // original + 3 expansions
  });

  it('should preserve configuration across calls', () => {
    const expand = createQueryExpander({ enabled: false });
    expect(expand('auth')).toBe('auth');
    expect(expand('db')).toBe('db');
  });
});

describe('createDetailedQueryExpander', () => {
  it('should create a configured detailed expander', () => {
    const expand = createDetailedQueryExpander({ maxExpansionTerms: 2 });
    const result = expand('auth');
    expect(result.expandedTerms.length).toBeLessThanOrEqual(2);
  });

  it('should preserve configuration across calls', () => {
    const expand = createDetailedQueryExpander({ enabled: false });
    const result1 = expand('auth');
    const result2 = expand('db');
    expect(result1.expandedQuery).toBe('auth');
    expect(result2.expandedQuery).toBe('db');
  });
});

// ============================================================================
// Default Expansion Mapping Tests
// ============================================================================

describe('DEFAULT_QUERY_EXPANSIONS', () => {
  it('should have more than 50 expansion mappings', () => {
    const count = Object.keys(DEFAULT_QUERY_EXPANSIONS).length;
    expect(count).toBeGreaterThanOrEqual(50);
  });

  it('should have authentication-related expansions', () => {
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('auth');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('login');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('oauth');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('jwt');
  });

  it('should have database-related expansions', () => {
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('db');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('sql');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('mongo');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('prisma');
  });

  it('should have API-related expansions', () => {
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('api');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('endpoint');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('http');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('rest');
  });

  it('should have error-related expansions', () => {
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('err');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('error');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('exception');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('catch');
  });

  it('should have config-related expansions', () => {
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('config');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('env');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('settings');
  });

  it('should have common abbreviation expansions', () => {
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('util');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('fn');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('init');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('msg');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('req');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('res');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('ctx');
  });

  it('should have test-related expansions', () => {
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('test');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('mock');
    expect(DEFAULT_QUERY_EXPANSIONS).toHaveProperty('spec');
  });
});

describe('DEFAULT_EXPANSION_CONFIG', () => {
  it('should have enabled set to true by default', () => {
    expect(DEFAULT_EXPANSION_CONFIG.enabled).toBe(true);
  });

  it('should have maxExpansionTerms set', () => {
    expect(DEFAULT_EXPANSION_CONFIG.maxExpansionTerms).toBe(10);
  });
});

describe('EXPANSION_CATEGORIES', () => {
  it('should list all expansion categories', () => {
    expect(EXPANSION_CATEGORIES).toContain('Authentication & Security');
    expect(EXPANSION_CATEGORIES).toContain('Database & Storage');
    expect(EXPANSION_CATEGORIES).toContain('API & HTTP');
    expect(EXPANSION_CATEGORIES).toContain('Errors & Exceptions');
    expect(EXPANSION_CATEGORIES).toContain('Common Abbreviations');
    expect(EXPANSION_CATEGORIES).toContain('Testing');
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('expandQuery performance', () => {
  it('should expand in under 1ms', () => {
    const queries = [
      'auth',
      'db config',
      'api endpoint error',
      'async function test',
      'authentication authorization login logout session token jwt oauth',
    ];

    for (const query of queries) {
      const result = expandQueryWithDetails(query);
      expect(result.expansionTimeMs).toBeLessThan(1);
    }
  });

  it('should handle long queries efficiently', () => {
    const longQuery = 'auth db api err config util fn init msg req res ctx env test mock spec '.repeat(5);
    const result = expandQueryWithDetails(longQuery);
    expect(result.expansionTimeMs).toBeLessThan(5);
  });

  it('should batch-process queries efficiently', () => {
    const startTime = performance.now();
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      expandQuery('auth db api config test error');
    }

    const totalTime = performance.now() - startTime;
    const avgTime = totalTime / iterations;

    expect(avgTime).toBeLessThan(1); // Average should be well under 1ms
  });
});

// ============================================================================
// Integration Tests (Expanded Query Usability)
// ============================================================================

describe('expanded query usability', () => {
  it('should produce reasonable expanded queries for common searches', () => {
    // auth -> should find authentication code
    const authExpanded = expandQuery('auth');
    expect(authExpanded).toMatch(/authentication|authorize|login/);

    // db -> should find database code
    const dbExpanded = expandQuery('db');
    expect(dbExpanded).toMatch(/database|storage|query/);

    // err -> should find error handling code
    const errExpanded = expandQuery('err');
    expect(errExpanded).toMatch(/error|exception|failure/);
  });

  it('should preserve intent with partial queries', () => {
    // "auth middleware" should expand auth but keep middleware context
    const expanded = expandQuery('auth middleware');
    expect(expanded).toContain('auth');
    expect(expanded).toContain('middleware');
    expect(expanded).toContain('authentication');
  });

  it('should work well with typical user queries', () => {
    const queries = [
      'auth handler',
      'db connection',
      'api endpoint',
      'error handling',
      'config file',
      'test mock',
    ];

    for (const query of queries) {
      const expanded = expandQuery(query);
      // Should expand and add useful terms
      const expandedWords = expanded.split(' ');
      expect(expandedWords.length).toBeGreaterThan(query.split(' ').length);
    }
  });
});
