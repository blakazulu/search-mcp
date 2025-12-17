/**
 * Query Intent Detection Tests (SMCP-085)
 *
 * Tests cover:
 * - Intent category detection for all 8 categories
 * - Multi-intent detection
 * - Confidence score calculation
 * - Token normalization (CamelCase, snake_case)
 * - Entity-like query detection
 * - Chunk type boosting
 * - Tag-based intent boost
 * - Edge cases: empty queries, no matches, special characters
 * - Performance (latency < 10ms)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntentCategory,
  IntentMatch,
  QueryIntent,
  IntentDetectionConfig,
  ChunkTypeBoosts,
  DEFAULT_INTENT_PATTERNS,
  detectQueryIntent,
  normalizeToTokens,
  isEntityLikeQuery,
  getChunkTypeBoosts,
  getIntentTagBoost,
  createIntentDetector,
  getIntentNames,
  hasIntent,
} from '../../../src/engines/queryIntent.js';

// ============================================================================
// Token Normalization Tests
// ============================================================================

describe('normalizeToTokens', () => {
  it('should handle CamelCase', () => {
    const tokens = normalizeToTokens('getUserById');
    expect(tokens).toEqual(['get', 'user', 'by', 'id']);
  });

  it('should handle snake_case', () => {
    const tokens = normalizeToTokens('get_user_by_id');
    expect(tokens).toEqual(['get', 'user', 'by', 'id']);
  });

  it('should handle kebab-case', () => {
    const tokens = normalizeToTokens('get-user-by-id');
    expect(tokens).toEqual(['get', 'user', 'by', 'id']);
  });

  it('should handle mixed cases', () => {
    const tokens = normalizeToTokens('getUserBy_id');
    expect(tokens).toEqual(['get', 'user', 'by', 'id']);
  });

  it('should convert to lowercase', () => {
    const tokens = normalizeToTokens('GetUserById');
    expect(tokens).toEqual(['get', 'user', 'by', 'id']);
  });

  it('should handle simple words', () => {
    const tokens = normalizeToTokens('function');
    expect(tokens).toEqual(['function']);
  });

  it('should handle spaces', () => {
    const tokens = normalizeToTokens('get user by id');
    expect(tokens).toEqual(['get', 'user', 'by', 'id']);
  });

  it('should filter out non-alphanumeric characters', () => {
    const tokens = normalizeToTokens('get.user(by, id)');
    expect(tokens).toEqual(['get', 'user', 'by', 'id']);
  });

  it('should handle empty string', () => {
    const tokens = normalizeToTokens('');
    expect(tokens).toEqual([]);
  });

  it('should handle numbers', () => {
    const tokens = normalizeToTokens('user123');
    expect(tokens).toEqual(['user123']);
  });
});

// ============================================================================
// Entity-Like Query Detection Tests
// ============================================================================

describe('isEntityLikeQuery', () => {
  it('should detect CamelCase as entity-like', () => {
    expect(isEntityLikeQuery('UserService', ['user', 'service'])).toBe(true);
  });

  it('should detect short queries as entity-like', () => {
    expect(isEntityLikeQuery('user', ['user'])).toBe(true);
    expect(isEntityLikeQuery('user service', ['user', 'service'])).toBe(true);
  });

  it('should not detect action queries as entity-like', () => {
    expect(isEntityLikeQuery('find user', ['find', 'user'])).toBe(false);
    expect(isEntityLikeQuery('get user by id', ['get', 'user', 'by', 'id'])).toBe(false);
    expect(isEntityLikeQuery('how to implement auth', ['how', 'to', 'implement', 'auth'])).toBe(false);
  });

  it('should not detect long queries as entity-like', () => {
    expect(isEntityLikeQuery('the user service implementation', ['the', 'user', 'service', 'implementation'])).toBe(false);
  });

  it('should detect single word queries as entity-like', () => {
    expect(isEntityLikeQuery('Handler', ['handler'])).toBe(true);
  });
});

// ============================================================================
// Intent Detection Tests - Basic Categories
// ============================================================================

describe('detectQueryIntent', () => {
  describe('FUNCTION intent', () => {
    it('should detect "function" keyword', () => {
      const intent = detectQueryIntent('function that handles requests');
      expect(intent.primaryIntent).toBe(IntentCategory.FUNCTION);
      expect(intent.intents[0].matchedKeywords).toContain('function');
    });

    it('should detect "method" keyword', () => {
      const intent = detectQueryIntent('method to calculate sum');
      expect(intent.primaryIntent).toBe(IntentCategory.FUNCTION);
    });

    it('should detect "def" keyword', () => {
      const intent = detectQueryIntent('def parse_json');
      expect(intent.primaryIntent).toBe(IntentCategory.FUNCTION);
    });

    it('should detect "implement" pattern', () => {
      const intent = detectQueryIntent('implement authentication');
      expect(hasIntent(intent, IntentCategory.FUNCTION)).toBe(true);
    });
  });

  describe('CLASS intent', () => {
    it('should detect "class" keyword', () => {
      const intent = detectQueryIntent('class for user management');
      // "user" also matches AUTH, so we check that CLASS is detected, not necessarily primary
      expect(hasIntent(intent, IntentCategory.CLASS)).toBe(true);
    });

    it('should detect "interface" keyword', () => {
      const intent = detectQueryIntent('interface definition');
      expect(intent.primaryIntent).toBe(IntentCategory.CLASS);
    });

    it('should detect "struct" keyword', () => {
      const intent = detectQueryIntent('struct for data');
      expect(intent.primaryIntent).toBe(IntentCategory.CLASS);
    });

    it('should detect CamelCase entity names', () => {
      const intent = detectQueryIntent('UserService');
      // CamelCase pattern match
      expect(hasIntent(intent, IntentCategory.CLASS)).toBe(true);
    });
  });

  describe('ERROR intent', () => {
    it('should detect "error" keyword', () => {
      const intent = detectQueryIntent('error handling');
      expect(intent.primaryIntent).toBe(IntentCategory.ERROR);
    });

    it('should detect "exception" keyword', () => {
      const intent = detectQueryIntent('exception handling');
      expect(intent.primaryIntent).toBe(IntentCategory.ERROR);
    });

    it('should detect "try catch" keywords', () => {
      const intent = detectQueryIntent('try catch block');
      expect(hasIntent(intent, IntentCategory.ERROR)).toBe(true);
    });

    it('should detect "handle error" pattern', () => {
      const intent = detectQueryIntent('how to handle errors');
      expect(hasIntent(intent, IntentCategory.ERROR)).toBe(true);
    });
  });

  describe('DATABASE intent', () => {
    it('should detect "database" keyword', () => {
      const intent = detectQueryIntent('database connection');
      expect(intent.primaryIntent).toBe(IntentCategory.DATABASE);
    });

    it('should detect "sql" keyword', () => {
      const intent = detectQueryIntent('sql query builder');
      expect(intent.primaryIntent).toBe(IntentCategory.DATABASE);
    });

    it('should detect "mongodb" keyword', () => {
      const intent = detectQueryIntent('mongodb schema');
      expect(intent.primaryIntent).toBe(IntentCategory.DATABASE);
    });

    it('should detect "prisma" keyword', () => {
      const intent = detectQueryIntent('prisma client');
      expect(intent.primaryIntent).toBe(IntentCategory.DATABASE);
    });
  });

  describe('API intent', () => {
    it('should detect "api" keyword', () => {
      const intent = detectQueryIntent('api endpoint');
      expect(intent.primaryIntent).toBe(IntentCategory.API);
    });

    it('should detect "endpoint" keyword', () => {
      const intent = detectQueryIntent('endpoint for users');
      expect(intent.primaryIntent).toBe(IntentCategory.API);
    });

    it('should detect "request response" keywords', () => {
      const intent = detectQueryIntent('handle http request');
      expect(hasIntent(intent, IntentCategory.API)).toBe(true);
    });

    it('should detect "rest api" pattern', () => {
      const intent = detectQueryIntent('rest api design');
      expect(hasIntent(intent, IntentCategory.API)).toBe(true);
    });
  });

  describe('AUTH intent', () => {
    it('should detect "auth" keyword', () => {
      const intent = detectQueryIntent('auth middleware');
      expect(intent.primaryIntent).toBe(IntentCategory.AUTH);
    });

    it('should detect "authentication" keyword', () => {
      const intent = detectQueryIntent('authentication flow');
      expect(intent.primaryIntent).toBe(IntentCategory.AUTH);
    });

    it('should detect "login" keyword', () => {
      const intent = detectQueryIntent('login handler');
      expect(intent.primaryIntent).toBe(IntentCategory.AUTH);
    });

    it('should detect "jwt" keyword', () => {
      const intent = detectQueryIntent('jwt token verification');
      expect(hasIntent(intent, IntentCategory.AUTH)).toBe(true);
    });

    it('should detect "password" keyword', () => {
      const intent = detectQueryIntent('password hashing');
      expect(intent.primaryIntent).toBe(IntentCategory.AUTH);
    });
  });

  describe('TEST intent', () => {
    it('should detect "test" keyword', () => {
      const intent = detectQueryIntent('test suite validation');
      expect(intent.primaryIntent).toBe(IntentCategory.TEST);
    });

    it('should detect "mock" keyword', () => {
      const intent = detectQueryIntent('mock objects');
      expect(intent.primaryIntent).toBe(IntentCategory.TEST);
    });

    it('should detect "jest" keyword', () => {
      const intent = detectQueryIntent('jest configuration');
      expect(intent.primaryIntent).toBe(IntentCategory.TEST);
    });

    it('should detect "unit test" pattern', () => {
      const intent = detectQueryIntent('unit test for auth');
      expect(hasIntent(intent, IntentCategory.TEST)).toBe(true);
    });
  });

  describe('CONFIG intent', () => {
    it('should detect "config" keyword', () => {
      const intent = detectQueryIntent('config loading');
      expect(intent.primaryIntent).toBe(IntentCategory.CONFIG);
    });

    it('should detect "environment" keyword', () => {
      const intent = detectQueryIntent('environment variables');
      expect(intent.primaryIntent).toBe(IntentCategory.CONFIG);
    });

    it('should detect "settings" keyword', () => {
      const intent = detectQueryIntent('application settings');
      expect(intent.primaryIntent).toBe(IntentCategory.CONFIG);
    });
  });
});

// ============================================================================
// Multi-Intent Detection Tests
// ============================================================================

describe('detectQueryIntent - multi-intent', () => {
  it('should detect multiple intents', () => {
    const intent = detectQueryIntent('function that handles authentication');
    expect(intent.intents.length).toBeGreaterThanOrEqual(2);
    expect(hasIntent(intent, IntentCategory.FUNCTION)).toBe(true);
    expect(hasIntent(intent, IntentCategory.AUTH)).toBe(true);
  });

  it('should detect error + function intents', () => {
    const intent = detectQueryIntent('function to handle errors');
    expect(hasIntent(intent, IntentCategory.FUNCTION)).toBe(true);
    expect(hasIntent(intent, IntentCategory.ERROR)).toBe(true);
  });

  it('should detect database + API intents', () => {
    const intent = detectQueryIntent('api endpoint for database queries');
    expect(hasIntent(intent, IntentCategory.API)).toBe(true);
    expect(hasIntent(intent, IntentCategory.DATABASE)).toBe(true);
  });

  it('should sort intents by confidence (highest first)', () => {
    const intent = detectQueryIntent('authentication function');
    expect(intent.intents.length).toBeGreaterThan(1);
    for (let i = 1; i < intent.intents.length; i++) {
      expect(intent.intents[i - 1].confidence).toBeGreaterThanOrEqual(intent.intents[i].confidence);
    }
  });

  it('should limit intents to maxIntents', () => {
    const intent = detectQueryIntent('function method class test error database api auth', {
      maxIntents: 3,
    });
    expect(intent.intents.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// Confidence Score Tests
// ============================================================================

describe('detectQueryIntent - confidence scores', () => {
  it('should have confidence between 0 and 1', () => {
    const intent = detectQueryIntent('authentication function with error handling');
    for (const match of intent.intents) {
      expect(match.confidence).toBeGreaterThanOrEqual(0);
      expect(match.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should increase confidence for multiple keyword matches', () => {
    const singleMatch = detectQueryIntent('error');
    const multiMatch = detectQueryIntent('error exception handling');

    const singleConfidence = singleMatch.intents.find(i => i.category === IntentCategory.ERROR)?.confidence ?? 0;
    const multiConfidence = multiMatch.intents.find(i => i.category === IntentCategory.ERROR)?.confidence ?? 0;

    expect(multiConfidence).toBeGreaterThan(singleConfidence);
  });

  it('should filter out low confidence intents', () => {
    const intent = detectQueryIntent('some random text', { minConfidence: 0.5 });
    // Should have no intents if nothing matches above threshold
    for (const match of intent.intents) {
      expect(match.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('detectQueryIntent - edge cases', () => {
  it('should handle empty query', () => {
    const intent = detectQueryIntent('');
    expect(intent.query).toBe('');
    expect(intent.intents).toEqual([]);
    expect(intent.primaryIntent).toBeNull();
  });

  it('should handle query with only spaces', () => {
    const intent = detectQueryIntent('   ');
    expect(intent.intents).toEqual([]);
    expect(intent.primaryIntent).toBeNull();
  });

  it('should handle special characters', () => {
    const intent = detectQueryIntent('@#$%^&*()');
    expect(intent.intents).toEqual([]);
    expect(intent.primaryIntent).toBeNull();
  });

  it('should handle numbers', () => {
    const intent = detectQueryIntent('12345');
    expect(intent.intents).toEqual([]);
    expect(intent.primaryIntent).toBeNull();
  });

  it('should handle mixed content', () => {
    const intent = detectQueryIntent('function123 test');
    expect(hasIntent(intent, IntentCategory.TEST)).toBe(true);
  });

  it('should be case insensitive', () => {
    const lower = detectQueryIntent('function');
    const upper = detectQueryIntent('FUNCTION');
    const mixed = detectQueryIntent('Function');

    expect(lower.primaryIntent).toBe(IntentCategory.FUNCTION);
    expect(upper.primaryIntent).toBe(IntentCategory.FUNCTION);
    expect(mixed.primaryIntent).toBe(IntentCategory.FUNCTION);
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('detectQueryIntent - configuration', () => {
  it('should respect enabled=false', () => {
    const intent = detectQueryIntent('function test auth', { enabled: false });
    expect(intent.intents).toEqual([]);
    expect(intent.detectionTimeMs).toBe(0);
  });

  it('should respect minConfidence', () => {
    const lowThreshold = detectQueryIntent('function', { minConfidence: 0.1 });
    const highThreshold = detectQueryIntent('function', { minConfidence: 0.99 });

    expect(lowThreshold.intents.length).toBeGreaterThanOrEqual(highThreshold.intents.length);
  });

  it('should respect maxIntents', () => {
    const intent = detectQueryIntent('function class test error database api', { maxIntents: 2 });
    expect(intent.intents.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// Chunk Type Boost Tests
// ============================================================================

describe('getChunkTypeBoosts', () => {
  it('should boost classes for class keyword', () => {
    const intent = detectQueryIntent('class UserService');
    const boosts = getChunkTypeBoosts(intent);
    expect(boosts.class).toBeGreaterThan(boosts.function);
  });

  it('should boost functions for function keyword', () => {
    const intent = detectQueryIntent('function handler');
    const boosts = getChunkTypeBoosts(intent);
    // Function boost should be at least 1.1
    expect(boosts.function).toBeGreaterThanOrEqual(1.1);
    expect(boosts.method).toBeGreaterThanOrEqual(1.1);
  });

  it('should boost functions for test intent', () => {
    const intent = detectQueryIntent('unit test');
    const boosts = getChunkTypeBoosts(intent);
    expect(boosts.function).toBeGreaterThan(1);
    expect(boosts.method).toBeGreaterThan(1);
  });

  it('should return default boosts for no intent', () => {
    const intent = detectQueryIntent('random text xyz');
    const boosts = getChunkTypeBoosts(intent);
    expect(boosts.function).toBeGreaterThanOrEqual(1);
    expect(boosts.method).toBeGreaterThanOrEqual(1);
  });

  it('should have all expected boost types', () => {
    const intent = detectQueryIntent('function');
    const boosts = getChunkTypeBoosts(intent);
    expect(boosts).toHaveProperty('function');
    expect(boosts).toHaveProperty('class');
    expect(boosts).toHaveProperty('method');
    expect(boosts).toHaveProperty('module');
    expect(boosts).toHaveProperty('other');
  });
});

// ============================================================================
// Tag Boost Tests
// ============================================================================

describe('getIntentTagBoost', () => {
  it('should return 1.0 for no intents', () => {
    const intent = detectQueryIntent('random text');
    intent.intents = []; // Force no intents
    const boost = getIntentTagBoost(intent, ['auth', 'api']);
    expect(boost).toBe(1.0);
  });

  it('should return 1.0 for no tags', () => {
    const intent = detectQueryIntent('authentication');
    const boost = getIntentTagBoost(intent, []);
    expect(boost).toBe(1.0);
  });

  it('should boost for matching tags', () => {
    const intent = detectQueryIntent('authentication');
    const boost = getIntentTagBoost(intent, ['auth', 'security']);
    expect(boost).toBeGreaterThan(1.0);
  });

  it('should increase boost for multiple matching tags', () => {
    const intent = detectQueryIntent('authentication function test');
    const singleMatch = getIntentTagBoost(intent, ['auth']);
    const multiMatch = getIntentTagBoost(intent, ['auth', 'function', 'test']);
    expect(multiMatch).toBeGreaterThanOrEqual(singleMatch);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('createIntentDetector', () => {
  it('should create a configured detector function', () => {
    const detect = createIntentDetector({ maxIntents: 2 });
    const intent = detect('function class test error');
    expect(intent.intents.length).toBeLessThanOrEqual(2);
  });

  it('should preserve configuration across calls', () => {
    const detect = createIntentDetector({ minConfidence: 0.9 });
    const intent1 = detect('function');
    const intent2 = detect('class');
    // Both should use the same config
    for (const i of intent1.intents) {
      expect(i.confidence).toBeGreaterThanOrEqual(0.9);
    }
    for (const i of intent2.intents) {
      expect(i.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe('getIntentNames', () => {
  it('should return intent category names', () => {
    const intent = detectQueryIntent('function authentication');
    const names = getIntentNames(intent);
    expect(names).toContain(IntentCategory.FUNCTION);
    expect(names).toContain(IntentCategory.AUTH);
  });

  it('should return empty array for no intents', () => {
    const intent = detectQueryIntent('xyz123');
    const names = getIntentNames(intent);
    expect(names).toEqual([]);
  });
});

describe('hasIntent', () => {
  it('should return true when intent is detected', () => {
    const intent = detectQueryIntent('function handler');
    expect(hasIntent(intent, IntentCategory.FUNCTION)).toBe(true);
  });

  it('should return false when intent is not detected', () => {
    const intent = detectQueryIntent('function handler');
    expect(hasIntent(intent, IntentCategory.DATABASE)).toBe(false);
  });

  it('should respect minConfidence parameter', () => {
    const intent = detectQueryIntent('function');
    const hasWithLow = hasIntent(intent, IntentCategory.FUNCTION, 0.1);
    const hasWithHigh = hasIntent(intent, IntentCategory.FUNCTION, 0.99);
    expect(hasWithLow).toBe(true);
    expect(hasWithHigh).toBe(false);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('detectQueryIntent - performance', () => {
  it('should detect intent in under 10ms', () => {
    const queries = [
      'function that handles authentication',
      'error handling in database queries',
      'class for user service implementation',
      'test mock assertion for api endpoint',
      'config environment settings yaml',
    ];

    for (const query of queries) {
      const intent = detectQueryIntent(query);
      expect(intent.detectionTimeMs).toBeLessThan(10);
    }
  });

  it('should handle long queries efficiently', () => {
    const longQuery = 'function method class interface struct error exception try catch database sql mongo api endpoint route request response auth login password token session test mock assert config settings environment '.repeat(5);
    const intent = detectQueryIntent(longQuery);
    expect(intent.detectionTimeMs).toBeLessThan(50); // Allow more time for very long queries
  });

  it('should batch-process queries efficiently', () => {
    const startTime = performance.now();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      detectQueryIntent('function that handles authentication and error handling');
    }

    const totalTime = performance.now() - startTime;
    const avgTime = totalTime / iterations;

    expect(avgTime).toBeLessThan(5); // Average should be well under 5ms
  });
});

// ============================================================================
// Default Patterns Tests
// ============================================================================

describe('DEFAULT_INTENT_PATTERNS', () => {
  it('should have all 8 intent categories', () => {
    const categories = Object.keys(DEFAULT_INTENT_PATTERNS);
    expect(categories).toContain(IntentCategory.FUNCTION);
    expect(categories).toContain(IntentCategory.CLASS);
    expect(categories).toContain(IntentCategory.ERROR);
    expect(categories).toContain(IntentCategory.DATABASE);
    expect(categories).toContain(IntentCategory.API);
    expect(categories).toContain(IntentCategory.AUTH);
    expect(categories).toContain(IntentCategory.TEST);
    expect(categories).toContain(IntentCategory.CONFIG);
  });

  it('should have keywords for each category', () => {
    for (const [category, pattern] of Object.entries(DEFAULT_INTENT_PATTERNS)) {
      expect(pattern.keywords.length).toBeGreaterThan(0);
    }
  });

  it('should have base confidence for each category', () => {
    for (const [category, pattern] of Object.entries(DEFAULT_INTENT_PATTERNS)) {
      expect(pattern.baseConfidence).toBeGreaterThan(0);
      expect(pattern.baseConfidence).toBeLessThanOrEqual(1);
    }
  });
});
