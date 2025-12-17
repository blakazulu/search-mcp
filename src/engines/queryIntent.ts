/**
 * Query Intent Detection Module (SMCP-085)
 *
 * Implements query intent detection to classify search queries into categories
 * (function search, error handling, database, API, auth, testing, etc.).
 * Enables dynamic chunk type boosting and query optimization for better search results.
 *
 * Inspired by claude-context-local's intent detection system.
 *
 * Features:
 * - Multi-intent detection (queries can match multiple categories)
 * - Confidence scores per intent
 * - Fast keyword-based detection (< 10ms overhead)
 * - CamelCase and snake_case aware tokenization
 * - Configurable keyword patterns
 *
 * @module queryIntent
 */

import { getLogger } from '../utils/logger.js';

// ============================================================================
// Types and Enums
// ============================================================================

/**
 * Intent categories for code search queries.
 * Each category represents a common search intent pattern.
 */
export enum IntentCategory {
  /** Searching for functions, methods, or callable code */
  FUNCTION = 'function',
  /** Searching for classes, types, structs, or interfaces */
  CLASS = 'class',
  /** Searching for error handling, exceptions, or error-related code */
  ERROR = 'error',
  /** Searching for database-related code (SQL, ORM, queries) */
  DATABASE = 'database',
  /** Searching for API endpoints, routes, or HTTP-related code */
  API = 'api',
  /** Searching for authentication, authorization, or security code */
  AUTH = 'auth',
  /** Searching for tests, specs, or test utilities */
  TEST = 'test',
  /** Searching for configuration, settings, or environment code */
  CONFIG = 'config',
}

/**
 * Result of intent detection for a single category.
 */
export interface IntentMatch {
  /** The detected intent category */
  category: IntentCategory;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** Keywords that triggered this intent */
  matchedKeywords: string[];
}

/**
 * Complete query intent analysis result.
 */
export interface QueryIntent {
  /** Original query string */
  query: string;
  /** Detected intents with confidence scores, sorted by confidence (highest first) */
  intents: IntentMatch[];
  /** Primary intent (highest confidence), or null if no intents detected */
  primaryIntent: IntentCategory | null;
  /** Normalized tokens from the query */
  queryTokens: string[];
  /** Time taken for detection in milliseconds */
  detectionTimeMs: number;
}

/**
 * Pattern definition for a single intent category.
 */
export interface IntentPattern {
  /** Keywords that trigger this intent (matched as word boundaries) */
  keywords: string[];
  /** Regex patterns for more complex matching */
  patterns?: RegExp[];
  /** Base confidence when any keyword matches */
  baseConfidence?: number;
}

/**
 * Configuration for intent detection.
 */
export interface IntentDetectionConfig {
  /** Enable/disable intent detection */
  enabled: boolean;
  /** Custom keyword patterns (merged with defaults) */
  customPatterns?: Partial<Record<IntentCategory, IntentPattern>>;
  /** Minimum confidence threshold to include an intent (default: 0.3) */
  minConfidence?: number;
  /** Maximum number of intents to return (default: 3) */
  maxIntents?: number;
}

// ============================================================================
// Default Intent Patterns
// ============================================================================

/**
 * Default keyword patterns for each intent category.
 * These are based on common code search patterns and inspired by
 * claude-context-local's implementation.
 */
export const DEFAULT_INTENT_PATTERNS: Record<IntentCategory, IntentPattern> = {
  [IntentCategory.FUNCTION]: {
    keywords: [
      'function',
      'method',
      'def',
      'fn',
      'func',
      'procedure',
      'subroutine',
      'lambda',
      'arrow',
      'callback',
      'handler',
      'helper',
      'utility',
      'util',
    ],
    patterns: [
      /how.*work/i,
      /implement.*/i,
      /algorithm.*/i,
      /calculate.*/i,
      /compute.*/i,
      /process.*/i,
    ],
    baseConfidence: 0.7,
  },
  [IntentCategory.CLASS]: {
    keywords: [
      'class',
      'struct',
      'type',
      'interface',
      'trait',
      'protocol',
      'object',
      'model',
      'entity',
      'component',
      'module',
      'service',
      'factory',
      'builder',
      'singleton',
      'abstract',
      'inheritance',
      'extends',
      'implements',
    ],
    patterns: [
      /[A-Z][a-z]+[A-Z]/, // CamelCase pattern
    ],
    baseConfidence: 0.7,
  },
  [IntentCategory.ERROR]: {
    keywords: [
      'error',
      'exception',
      'catch',
      'throw',
      'try',
      'finally',
      'handle',
      'handling',
      'fail',
      'failure',
      'reject',
      'reject',
      'invalid',
      'validation',
      'validate',
    ],
    patterns: [/handle.*error/i, /exception.*handling/i, /error.*handling/i],
    baseConfidence: 0.8,
  },
  [IntentCategory.DATABASE]: {
    keywords: [
      'database',
      'db',
      'query',
      'sql',
      'mongo',
      'mongodb',
      'postgres',
      'postgresql',
      'mysql',
      'sqlite',
      'redis',
      'orm',
      'model',
      'schema',
      'table',
      'collection',
      'migration',
      'seed',
      'connection',
      'repository',
      'prisma',
      'sequelize',
      'typeorm',
      'knex',
    ],
    patterns: [/find.*by/i, /get.*from/i, /insert.*into/i, /update.*set/i, /delete.*from/i],
    baseConfidence: 0.8,
  },
  [IntentCategory.API]: {
    keywords: [
      'api',
      'endpoint',
      'route',
      'router',
      'request',
      'response',
      'http',
      'https',
      'rest',
      'restful',
      'graphql',
      'grpc',
      'websocket',
      'socket',
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'middleware',
      'controller',
      'handler',
      'fetch',
      'axios',
    ],
    patterns: [/rest.*api/i, /api.*endpoint/i, /http.*request/i],
    baseConfidence: 0.75,
  },
  [IntentCategory.AUTH]: {
    keywords: [
      'auth',
      'authentication',
      'authorization',
      'login',
      'logout',
      'signup',
      'signin',
      'password',
      'token',
      'jwt',
      'oauth',
      'oauth2',
      'session',
      'cookie',
      'permission',
      'role',
      'rbac',
      'acl',
      'credentials',
      'user',
      'principal',
      'identity',
      'sso',
    ],
    patterns: [/authenticate.*/i, /verify.*token/i, /check.*permission/i],
    baseConfidence: 0.85,
  },
  [IntentCategory.TEST]: {
    keywords: [
      'test',
      'spec',
      'mock',
      'stub',
      'spy',
      'assert',
      'expect',
      'should',
      'describe',
      'it',
      'beforeEach',
      'afterEach',
      'beforeAll',
      'afterAll',
      'jest',
      'mocha',
      'vitest',
      'chai',
      'fixture',
      'coverage',
      'unit',
      'integration',
      'e2e',
    ],
    patterns: [/unit.*test/i, /integration.*test/i, /test.*case/i],
    baseConfidence: 0.85,
  },
  [IntentCategory.CONFIG]: {
    keywords: [
      'config',
      'configuration',
      'settings',
      'options',
      'env',
      'environment',
      'dotenv',
      'variable',
      'constant',
      'constant',
      'parameter',
      'prop',
      'props',
      'properties',
      'yaml',
      'json',
      'toml',
      'ini',
    ],
    patterns: [/load.*config/i, /get.*setting/i, /read.*env/i],
    baseConfidence: 0.7,
  },
};

// ============================================================================
// Token Normalization
// ============================================================================

/**
 * Normalize a text string into tokens, handling CamelCase and snake_case.
 *
 * @param text - The text to tokenize
 * @returns Array of lowercase tokens
 *
 * @example
 * normalizeToTokens("getUserById")
 * // Returns: ["get", "user", "by", "id"]
 *
 * @example
 * normalizeToTokens("get_user_by_id")
 * // Returns: ["get", "user", "by", "id"]
 */
export function normalizeToTokens(text: string): string[] {
  // Split CamelCase: "getUserById" -> "get User By Id"
  let normalized = text.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Split snake_case and kebab-case
  normalized = normalized.replace(/_/g, ' ').replace(/-/g, ' ');

  // Extract alphanumeric tokens
  const tokens = normalized.toLowerCase().match(/[a-z0-9]+/g) || [];

  return tokens;
}

/**
 * Check if a query looks like an entity/type name (likely searching for a class).
 *
 * @param query - Original query string
 * @param queryTokens - Normalized tokens from the query
 * @returns True if the query appears to be searching for an entity
 */
export function isEntityLikeQuery(query: string, queryTokens: string[]): boolean {
  // Short queries with 1-3 tokens that don't contain action words
  if (queryTokens.length > 3) {
    return false;
  }

  const actionWords = new Set([
    'find',
    'search',
    'get',
    'show',
    'list',
    'how',
    'what',
    'where',
    'when',
    'create',
    'build',
    'make',
    'handle',
    'process',
    'manage',
    'implement',
  ]);

  // If any token is an action word, it's not an entity query
  if (queryTokens.some((token) => actionWords.has(token))) {
    return false;
  }

  // Check for CamelCase pattern in original query
  if (/[A-Z][a-z]+[A-Z]/.test(query)) {
    return true;
  }

  // Short noun phrases (1-2 tokens) are likely entity queries
  return queryTokens.length <= 2;
}

// ============================================================================
// Intent Detection Implementation
// ============================================================================

/**
 * Detect intents from a search query.
 *
 * This is the main entry point for intent detection. It analyzes the query
 * string and returns detected intents with confidence scores.
 *
 * @param query - The search query to analyze
 * @param config - Optional configuration overrides
 * @returns QueryIntent object with detected intents
 *
 * @example
 * const intent = detectQueryIntent("function that handles authentication");
 * // Returns:
 * // {
 * //   query: "function that handles authentication",
 * //   intents: [
 * //     { category: IntentCategory.FUNCTION, confidence: 0.7, matchedKeywords: ["function"] },
 * //     { category: IntentCategory.AUTH, confidence: 0.6, matchedKeywords: ["authentication"] }
 * //   ],
 * //   primaryIntent: IntentCategory.FUNCTION,
 * //   queryTokens: ["function", "that", "handles", "authentication"],
 * //   detectionTimeMs: 1
 * // }
 */
export function detectQueryIntent(
  query: string,
  config: Partial<IntentDetectionConfig> = {}
): QueryIntent {
  const startTime = performance.now();
  const logger = getLogger();

  // Early return if detection is disabled
  if (config.enabled === false) {
    return {
      query,
      intents: [],
      primaryIntent: null,
      queryTokens: normalizeToTokens(query),
      detectionTimeMs: 0,
    };
  }

  const minConfidence = config.minConfidence ?? 0.3;
  const maxIntents = config.maxIntents ?? 3;

  // Normalize query to lowercase and tokenize
  const queryLower = query.toLowerCase();
  const queryTokens = normalizeToTokens(query);

  // Merge custom patterns with defaults
  const patterns: Record<IntentCategory, IntentPattern> = {
    ...DEFAULT_INTENT_PATTERNS,
    ...config.customPatterns,
  };

  // Detect intents
  const intents: IntentMatch[] = [];

  for (const [category, pattern] of Object.entries(patterns) as [IntentCategory, IntentPattern][]) {
    const matchResult = matchIntent(queryLower, queryTokens, pattern);

    if (matchResult.matched) {
      const confidence = calculateConfidence(
        matchResult.matchedKeywords.length,
        matchResult.patternMatched,
        pattern.baseConfidence ?? 0.6
      );

      if (confidence >= minConfidence) {
        intents.push({
          category,
          confidence,
          matchedKeywords: matchResult.matchedKeywords,
        });
      }
    }
  }

  // Sort by confidence (highest first) and limit
  intents.sort((a, b) => b.confidence - a.confidence);
  const limitedIntents = intents.slice(0, maxIntents);

  const endTime = performance.now();
  const detectionTimeMs = Math.round((endTime - startTime) * 100) / 100;

  const result: QueryIntent = {
    query,
    intents: limitedIntents,
    primaryIntent: limitedIntents.length > 0 ? limitedIntents[0].category : null,
    queryTokens,
    detectionTimeMs,
  };

  logger.debug('queryIntent', 'Intent detection complete', {
    query: query.substring(0, 50),
    intentCount: limitedIntents.length,
    primaryIntent: result.primaryIntent,
    detectionTimeMs,
  });

  return result;
}

/**
 * Match a query against an intent pattern.
 */
function matchIntent(
  queryLower: string,
  queryTokens: string[],
  pattern: IntentPattern
): { matched: boolean; matchedKeywords: string[]; patternMatched: boolean } {
  const matchedKeywords: string[] = [];
  let patternMatched = false;

  // Check keywords (word boundary matching)
  for (const keyword of pattern.keywords) {
    const keywordLower = keyword.toLowerCase();

    // Check if keyword exists in tokens
    if (queryTokens.includes(keywordLower)) {
      matchedKeywords.push(keyword);
      continue;
    }

    // Also check as substring with word boundary
    const regex = new RegExp(`\\b${escapeRegExp(keywordLower)}\\b`, 'i');
    if (regex.test(queryLower)) {
      matchedKeywords.push(keyword);
    }
  }

  // Check regex patterns
  if (pattern.patterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(queryLower)) {
        patternMatched = true;
        break;
      }
    }
  }

  return {
    matched: matchedKeywords.length > 0 || patternMatched,
    matchedKeywords,
    patternMatched,
  };
}

/**
 * Calculate confidence score based on match quality.
 */
function calculateConfidence(
  keywordCount: number,
  patternMatched: boolean,
  baseConfidence: number
): number {
  let confidence = baseConfidence;

  // Boost for multiple keyword matches
  if (keywordCount > 1) {
    confidence = Math.min(1.0, confidence + 0.1 * (keywordCount - 1));
  }

  // Boost for pattern match
  if (patternMatched) {
    confidence = Math.min(1.0, confidence + 0.15);
  }

  return Math.round(confidence * 100) / 100;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Chunk Type Boosting
// ============================================================================

/**
 * Chunk type boost factors for search ranking.
 * These factors are applied based on detected query intent.
 */
export interface ChunkTypeBoosts {
  function: number;
  class: number;
  method: number;
  module: number;
  other: number;
}

/**
 * Get chunk type boost factors based on detected query intent.
 *
 * @param intent - The detected query intent
 * @returns Boost factors for different chunk types
 */
export function getChunkTypeBoosts(intent: QueryIntent): ChunkTypeBoosts {
  const primaryIntent = intent.primaryIntent;

  // Check for explicit class keyword
  const hasClassKeyword = intent.queryTokens.includes('class');

  if (hasClassKeyword || primaryIntent === IntentCategory.CLASS) {
    // Strong preference for classes
    return {
      class: 1.3,
      function: 1.05,
      method: 1.05,
      module: 0.9,
      other: 1.0,
    };
  }

  if (isEntityLikeQuery(intent.query, intent.queryTokens)) {
    // Moderate preference for classes on entity-like queries
    return {
      class: 1.15,
      function: 1.1,
      method: 1.1,
      module: 0.92,
      other: 1.0,
    };
  }

  if (primaryIntent === IntentCategory.FUNCTION) {
    // Preference for functions
    return {
      function: 1.15,
      method: 1.15,
      class: 1.05,
      module: 0.95,
      other: 1.0,
    };
  }

  if (primaryIntent === IntentCategory.TEST) {
    // Tests are usually functions/methods
    return {
      function: 1.2,
      method: 1.2,
      class: 1.1,
      module: 0.95,
      other: 1.0,
    };
  }

  // Default boosts for general queries
  return {
    function: 1.1,
    method: 1.1,
    class: 1.05,
    module: 0.95,
    other: 1.0,
  };
}

/**
 * Get intent-based tag boost factor.
 *
 * Returns a multiplier based on overlap between detected intents
 * and chunk tags.
 *
 * @param intent - Detected query intent
 * @param chunkTags - Tags associated with a chunk
 * @returns Boost multiplier (1.0 = no boost)
 */
export function getIntentTagBoost(intent: QueryIntent, chunkTags: string[]): number {
  if (intent.intents.length === 0 || chunkTags.length === 0) {
    return 1.0;
  }

  // Get intent categories as strings for comparison
  const intentStrings = new Set(intent.intents.map((i) => i.category.toLowerCase()));
  const tagSet = new Set(chunkTags.map((t) => t.toLowerCase()));

  // Count overlapping tags
  let overlap = 0;
  for (const intentStr of intentStrings) {
    if (tagSet.has(intentStr)) {
      overlap++;
    }
  }

  // 10% boost per matching tag
  return 1.0 + overlap * 0.1;
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Create an intent detector with pre-configured settings.
 *
 * @param config - Configuration options
 * @returns A configured intent detection function
 */
export function createIntentDetector(
  config: Partial<IntentDetectionConfig> = {}
): (query: string) => QueryIntent {
  return (query: string) => detectQueryIntent(query, config);
}

/**
 * Extract intent category names from a QueryIntent for logging/display.
 *
 * @param intent - The query intent
 * @returns Array of intent category names
 */
export function getIntentNames(intent: QueryIntent): string[] {
  return intent.intents.map((i) => i.category);
}

/**
 * Check if a specific intent category was detected.
 *
 * @param intent - The query intent
 * @param category - The category to check for
 * @param minConfidence - Minimum confidence threshold (default: 0)
 * @returns True if the category was detected with sufficient confidence
 */
export function hasIntent(
  intent: QueryIntent,
  category: IntentCategory,
  minConfidence: number = 0
): boolean {
  return intent.intents.some(
    (i) => i.category === category && i.confidence >= minConfidence
  );
}

