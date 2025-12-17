/**
 * Advanced Multi-Factor Search Ranking Module (SMCP-087)
 *
 * Implements a sophisticated multi-factor ranking algorithm inspired by claude-context-local.
 * Combines 7+ ranking signals for significantly better search result quality:
 *
 * 1. Base similarity score (from vector/hybrid search)
 * 2. Query intent detection (via SMCP-085)
 * 3. Chunk type boosting (dynamic based on intent)
 * 4. Name matching with CamelCase/snake_case awareness
 * 5. Path/filename relevance
 * 6. Docstring/comment presence bonus
 * 7. Complexity penalty for oversized chunks
 *
 * @module advancedRanking
 */

import { getLogger } from '../utils/logger.js';
import {
  detectQueryIntent,
  getChunkTypeBoosts,
  getIntentTagBoost,
  normalizeToTokens,
  isEntityLikeQuery,
  type QueryIntent,
  type IntentDetectionConfig,
  type ChunkTypeBoosts,
} from './queryIntent.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result metadata required for advanced ranking.
 * Extends basic search result with optional semantic metadata.
 */
export interface RankableResult {
  /** Unique identifier for the result */
  id: string;
  /** Base similarity/relevance score from search (0-1) */
  score: number;
  /** Text content of the chunk */
  text: string;
  /** File path (relative or absolute) */
  path: string;
  /** Chunk type: function, class, method, module, etc. */
  chunkType?: string;
  /** Name of the code element (function/class/method name) */
  chunkName?: string;
  /** Parent name (e.g., class name for a method) */
  chunkParent?: string;
  /** Semantic tags associated with the chunk */
  chunkTags?: string[];
  /** Docstring or documentation for the chunk */
  chunkDocstring?: string;
  /** Start line number in the file */
  startLine?: number;
  /** End line number in the file */
  endLine?: number;
  /** Programming language */
  chunkLanguage?: string;
}

/**
 * Result of advanced ranking with detailed scoring breakdown.
 */
export interface RankedResult {
  /** The original result */
  result: RankableResult;
  /** Original score before ranking adjustments */
  originalScore: number;
  /** Final score after all ranking factors applied */
  finalScore: number;
  /** Breakdown of individual ranking factors */
  factors: RankingFactors;
  /** Detected query intent (if applicable) */
  intent?: QueryIntent;
}

/**
 * Individual ranking factor values.
 * Each factor is a multiplier (1.0 = no effect).
 */
export interface RankingFactors {
  /** Base similarity score (not a multiplier, absolute value 0-1) */
  baseScore: number;
  /** Chunk type boost based on query intent */
  chunkTypeBoost: number;
  /** Name matching boost */
  nameBoost: number;
  /** Path/filename relevance boost */
  pathBoost: number;
  /** Tag overlap boost */
  tagBoost: number;
  /** Docstring presence bonus */
  docstringBonus: number;
  /** Complexity penalty for oversized chunks */
  complexityPenalty: number;
}

/**
 * Configuration for advanced ranking behavior.
 */
export interface AdvancedRankingConfig {
  /** Enable/disable advanced ranking (default: true) */
  enabled: boolean;

  /** Intent detection configuration */
  intentConfig?: Partial<IntentDetectionConfig>;

  /** Weight adjustments for ranking factors (multipliers on the boost values) */
  weights?: Partial<RankingWeights>;

  /** Chunk size thresholds for complexity penalty */
  complexityThresholds?: {
    /** Chunk size (chars) above which mild penalty applies (default: 2000) */
    mild: number;
    /** Chunk size (chars) above which strong penalty applies (default: 4000) */
    strong: number;
  };

  /** Docstring bonus value (default: 1.05) */
  docstringBonusValue?: number;
}

/**
 * Resolved configuration with all defaults applied.
 * Used internally after merging with defaults.
 */
interface ResolvedRankingConfig {
  enabled: boolean;
  intentConfig?: Partial<IntentDetectionConfig>;
  weights: RankingWeights;
  complexityThresholds: { mild: number; strong: number };
  docstringBonusValue: number;
}

/**
 * Weight multipliers for each ranking factor.
 * Higher weight = more influence on final ranking.
 */
export interface RankingWeights {
  /** Weight for chunk type boost (default: 1.0) */
  chunkType: number;
  /** Weight for name matching (default: 1.0) */
  name: number;
  /** Weight for path relevance (default: 1.0) */
  path: number;
  /** Weight for tag overlap (default: 1.0) */
  tag: number;
  /** Weight for docstring bonus (default: 1.0) */
  docstring: number;
  /** Weight for complexity penalty (default: 1.0) */
  complexity: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for advanced ranking.
 */
export const DEFAULT_RANKING_CONFIG: AdvancedRankingConfig = {
  enabled: true,
  complexityThresholds: {
    mild: 2000,
    strong: 4000,
  },
  docstringBonusValue: 1.05,
  weights: {
    chunkType: 1.0,
    name: 1.0,
    path: 1.0,
    tag: 1.0,
    docstring: 1.0,
    complexity: 1.0,
  },
};

/**
 * Name matching boost tiers based on token overlap ratio.
 */
const NAME_BOOST_TIERS = {
  exact: 1.4, // Exact match (case insensitive)
  strong: 1.3, // 80%+ token overlap
  good: 1.2, // 50%+ token overlap
  partial: 1.1, // 30%+ token overlap
  weak: 1.05, // Any overlap
  none: 1.0, // No overlap
};

/**
 * Path matching boost per overlapping token.
 */
const PATH_BOOST_PER_TOKEN = 0.05;

/**
 * Maximum path boost (caps the benefit of many matching tokens).
 */
const MAX_PATH_BOOST = 1.2;

/**
 * Complexity penalty values.
 */
const COMPLEXITY_PENALTIES = {
  none: 1.0,
  mild: 0.98,
  strong: 0.95,
};

// ============================================================================
// Core Ranking Functions
// ============================================================================

/**
 * Apply advanced multi-factor ranking to search results.
 *
 * This is the main entry point for advanced ranking. It:
 * 1. Detects query intent
 * 2. Calculates all ranking factors for each result
 * 3. Computes final scores
 * 4. Returns results sorted by final score
 *
 * @param query - The search query string
 * @param results - Search results to rank
 * @param config - Optional ranking configuration
 * @returns Ranked results with scoring breakdown
 *
 * @example
 * ```typescript
 * const results = await searchCode(query);
 * const ranked = applyAdvancedRanking(query, results);
 * // ranked[0] is now the most relevant result
 * ```
 */
export function applyAdvancedRanking(
  query: string,
  results: RankableResult[],
  config: Partial<AdvancedRankingConfig> = {}
): RankedResult[] {
  const logger = getLogger();
  const fullConfig = mergeConfig(config);

  // Early return if disabled or no results
  if (!fullConfig.enabled || results.length === 0) {
    return results.map((result) => ({
      result,
      originalScore: result.score,
      finalScore: result.score,
      factors: createDefaultFactors(result.score),
    }));
  }

  const startTime = performance.now();

  // Detect query intent
  const intent = detectQueryIntent(query, fullConfig.intentConfig);

  // Get query tokens for name/path matching
  const queryTokens = normalizeToTokens(query);
  const isEntityQuery = isEntityLikeQuery(query, queryTokens);
  const hasClassKeyword = queryTokens.includes('class');

  // Get chunk type boosts based on intent
  const chunkTypeBoosts = getChunkTypeBoosts(intent);

  // Rank each result
  const rankedResults = results.map((result) => {
    const factors = calculateRankingFactors(
      result,
      intent,
      queryTokens,
      isEntityQuery,
      hasClassKeyword,
      chunkTypeBoosts,
      fullConfig
    );

    const finalScore = calculateFinalScore(factors, fullConfig.weights!);

    return {
      result,
      originalScore: result.score,
      finalScore,
      factors,
      intent,
    };
  });

  // Sort by final score (descending)
  rankedResults.sort((a, b) => b.finalScore - a.finalScore);

  const endTime = performance.now();
  const rankingTimeMs = Math.round((endTime - startTime) * 100) / 100;

  logger.debug('advancedRanking', 'Ranking complete', {
    resultCount: results.length,
    intentCount: intent.intents.length,
    primaryIntent: intent.primaryIntent,
    rankingTimeMs,
    topOriginalScore: results[0]?.score,
    topFinalScore: rankedResults[0]?.finalScore,
  });

  return rankedResults;
}

/**
 * Calculate all ranking factors for a single result.
 */
function calculateRankingFactors(
  result: RankableResult,
  intent: QueryIntent,
  queryTokens: string[],
  isEntityQuery: boolean,
  hasClassKeyword: boolean,
  chunkTypeBoosts: ChunkTypeBoosts,
  config: ResolvedRankingConfig
): RankingFactors {
  // 1. Base score
  const baseScore = result.score;

  // 2. Chunk type boost
  const chunkTypeBoost = calculateChunkTypeBoost(
    result.chunkType,
    chunkTypeBoosts
  );

  // 3. Name matching boost
  const nameBoost = calculateNameBoost(
    result.chunkName,
    intent.query,
    queryTokens
  );

  // 4. Path/filename relevance boost
  const pathBoost = calculatePathBoost(
    result.path,
    queryTokens
  );

  // 5. Tag overlap boost
  const tagBoost = getIntentTagBoost(intent, result.chunkTags || []);

  // 6. Docstring presence bonus
  const docstringBonus = calculateDocstringBonus(
    result.chunkDocstring,
    result.chunkType,
    isEntityQuery,
    config.docstringBonusValue
  );

  // 7. Complexity penalty
  const complexityPenalty = calculateComplexityPenalty(
    result.text,
    config.complexityThresholds
  );

  return {
    baseScore,
    chunkTypeBoost,
    nameBoost,
    pathBoost,
    tagBoost,
    docstringBonus,
    complexityPenalty,
  };
}

/**
 * Calculate final score from ranking factors and weights.
 */
function calculateFinalScore(
  factors: RankingFactors,
  weights: RankingWeights
): number {
  let score = factors.baseScore;

  // Apply weighted factor multipliers
  score *= applyWeight(factors.chunkTypeBoost, weights.chunkType);
  score *= applyWeight(factors.nameBoost, weights.name);
  score *= applyWeight(factors.pathBoost, weights.path);
  score *= applyWeight(factors.tagBoost, weights.tag);
  score *= applyWeight(factors.docstringBonus, weights.docstring);
  score *= applyWeight(factors.complexityPenalty, weights.complexity);

  return score;
}

/**
 * Apply a weight to a factor.
 * A weight of 1.0 uses the factor as-is.
 * A weight of 0.0 neutralizes the factor (returns 1.0).
 * A weight > 1.0 amplifies the factor's effect.
 */
function applyWeight(factor: number, weight: number): number {
  if (weight === 1.0) {
    return factor;
  }
  if (weight === 0.0) {
    return 1.0;
  }
  // Interpolate factor effect: factor^weight
  // This preserves 1.0 as neutral and scales the effect
  return Math.pow(factor, weight);
}

// ============================================================================
// Individual Ranking Factor Calculations
// ============================================================================

/**
 * Calculate chunk type boost based on detected query intent.
 *
 * @param chunkType - The type of chunk (function, class, method, etc.)
 * @param boosts - Boost factors from intent detection
 * @returns Boost multiplier (1.0 = no boost)
 */
export function calculateChunkTypeBoost(
  chunkType: string | undefined,
  boosts: ChunkTypeBoosts
): number {
  if (!chunkType) {
    return boosts.other;
  }

  const type = chunkType.toLowerCase();

  // Direct lookup
  if (type in boosts) {
    return (boosts as unknown as Record<string, number>)[type];
  }

  // Alias mappings
  const aliases: Record<string, keyof ChunkTypeBoosts> = {
    func: 'function',
    fn: 'function',
    def: 'function',
    meth: 'method',
    cls: 'class',
    struct: 'class',
    interface: 'class',
    trait: 'class',
    type: 'class',
    mod: 'module',
    pkg: 'module',
    package: 'module',
  };

  if (type in aliases) {
    return boosts[aliases[type]];
  }

  return boosts.other;
}

/**
 * Calculate name matching boost based on query-name token overlap.
 *
 * Supports CamelCase and snake_case tokenization for robust matching.
 *
 * @param name - Name of the code element
 * @param originalQuery - Original query string
 * @param queryTokens - Normalized query tokens
 * @returns Boost multiplier (1.0 = no match, up to 1.4 for exact match)
 */
export function calculateNameBoost(
  name: string | undefined,
  originalQuery: string,
  queryTokens: string[]
): number {
  if (!name || queryTokens.length === 0) {
    return NAME_BOOST_TIERS.none;
  }

  // Check for exact match (case insensitive)
  if (originalQuery.toLowerCase() === name.toLowerCase()) {
    return NAME_BOOST_TIERS.exact;
  }

  // Tokenize the name
  const nameTokens = normalizeToTokens(name);
  if (nameTokens.length === 0) {
    return NAME_BOOST_TIERS.none;
  }

  // Calculate token overlap
  const querySet = new Set(queryTokens);
  const nameSet = new Set(nameTokens);

  let overlap = 0;
  for (const token of querySet) {
    if (nameSet.has(token)) {
      overlap++;
    }
  }

  if (overlap === 0) {
    return NAME_BOOST_TIERS.none;
  }

  // Calculate overlap ratio relative to query size
  const overlapRatio = overlap / querySet.size;

  // Determine boost tier based on overlap ratio
  if (overlapRatio >= 0.8) {
    return NAME_BOOST_TIERS.strong;
  } else if (overlapRatio >= 0.5) {
    return NAME_BOOST_TIERS.good;
  } else if (overlapRatio >= 0.3) {
    return NAME_BOOST_TIERS.partial;
  } else {
    return NAME_BOOST_TIERS.weak;
  }
}

/**
 * Calculate path/filename relevance boost.
 *
 * Checks for token overlap between query and file path components.
 *
 * @param filePath - File path (relative or absolute)
 * @param queryTokens - Normalized query tokens
 * @returns Boost multiplier (1.0 = no match, up to MAX_PATH_BOOST)
 */
export function calculatePathBoost(
  filePath: string | undefined,
  queryTokens: string[]
): number {
  if (!filePath || queryTokens.length === 0) {
    return 1.0;
  }

  // Normalize path to tokens (handle both / and \ separators)
  const normalizedPath = filePath
    .replace(/\\/g, '/')
    .replace(/\//g, ' ')
    .replace(/\./g, ' ');
  const pathTokens = normalizeToTokens(normalizedPath);

  if (pathTokens.length === 0) {
    return 1.0;
  }

  // Calculate token overlap
  const querySet = new Set(queryTokens);
  const pathSet = new Set(pathTokens);

  let overlap = 0;
  for (const token of querySet) {
    if (pathSet.has(token)) {
      overlap++;
    }
  }

  if (overlap === 0) {
    return 1.0;
  }

  // Calculate boost (capped at MAX_PATH_BOOST)
  const boost = 1.0 + overlap * PATH_BOOST_PER_TOKEN;
  return Math.min(boost, MAX_PATH_BOOST);
}

/**
 * Calculate docstring presence bonus.
 *
 * @param docstring - Documentation string (if present)
 * @param chunkType - Type of chunk
 * @param isEntityQuery - Whether query looks like an entity/class name
 * @param bonusValue - Bonus multiplier for documented chunks
 * @returns Bonus multiplier (1.0 = no bonus)
 */
export function calculateDocstringBonus(
  docstring: string | undefined,
  chunkType: string | undefined,
  isEntityQuery: boolean,
  bonusValue: number = 1.05
): number {
  if (!docstring || docstring.trim().length === 0) {
    return 1.0;
  }

  // Reduced bonus for module docstrings on entity queries
  // (entity queries typically want specific classes/functions, not module docs)
  if (isEntityQuery && chunkType?.toLowerCase() === 'module') {
    return 1.0 + (bonusValue - 1.0) * 0.4; // 40% of normal bonus
  }

  return bonusValue;
}

/**
 * Calculate complexity penalty for oversized chunks.
 *
 * Large chunks may be too specific or contain too much context,
 * making them less useful as search results.
 *
 * @param text - Chunk text content
 * @param thresholds - Size thresholds for penalty levels
 * @returns Penalty multiplier (1.0 = no penalty, <1.0 = penalized)
 */
export function calculateComplexityPenalty(
  text: string | undefined,
  thresholds: { mild: number; strong: number }
): number {
  if (!text) {
    return COMPLEXITY_PENALTIES.none;
  }

  const length = text.length;

  if (length > thresholds.strong) {
    return COMPLEXITY_PENALTIES.strong;
  } else if (length > thresholds.mild) {
    return COMPLEXITY_PENALTIES.mild;
  }

  return COMPLEXITY_PENALTIES.none;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Merge user config with defaults.
 */
function mergeConfig(
  config: Partial<AdvancedRankingConfig>
): ResolvedRankingConfig {
  // Default weights with explicit values
  const defaultWeights: RankingWeights = {
    chunkType: 1.0,
    name: 1.0,
    path: 1.0,
    tag: 1.0,
    docstring: 1.0,
    complexity: 1.0,
  };

  // Default thresholds with explicit values
  const defaultThresholds = { mild: 2000, strong: 4000 };

  return {
    enabled: config.enabled ?? true,
    intentConfig: config.intentConfig,
    complexityThresholds: {
      mild: config.complexityThresholds?.mild ?? defaultThresholds.mild,
      strong: config.complexityThresholds?.strong ?? defaultThresholds.strong,
    },
    docstringBonusValue: config.docstringBonusValue ?? 1.05,
    weights: {
      chunkType: config.weights?.chunkType ?? defaultWeights.chunkType,
      name: config.weights?.name ?? defaultWeights.name,
      path: config.weights?.path ?? defaultWeights.path,
      tag: config.weights?.tag ?? defaultWeights.tag,
      docstring: config.weights?.docstring ?? defaultWeights.docstring,
      complexity: config.weights?.complexity ?? defaultWeights.complexity,
    },
  };
}

/**
 * Create default factors (all neutral) for disabled ranking.
 */
function createDefaultFactors(baseScore: number): RankingFactors {
  return {
    baseScore,
    chunkTypeBoost: 1.0,
    nameBoost: 1.0,
    pathBoost: 1.0,
    tagBoost: 1.0,
    docstringBonus: 1.0,
    complexityPenalty: 1.0,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a ranking function with pre-configured settings.
 *
 * @param config - Ranking configuration
 * @returns Configured ranking function
 *
 * @example
 * ```typescript
 * const rank = createRanker({ weights: { name: 1.5 } });
 * const ranked = rank('auth handler', results);
 * ```
 */
export function createRanker(
  config: Partial<AdvancedRankingConfig> = {}
): (query: string, results: RankableResult[]) => RankedResult[] {
  return (query: string, results: RankableResult[]) =>
    applyAdvancedRanking(query, results, config);
}

/**
 * Extract just the final scores from ranked results.
 *
 * @param rankedResults - Results from applyAdvancedRanking
 * @returns Array of {id, score} pairs
 */
export function extractScores(
  rankedResults: RankedResult[]
): Array<{ id: string; score: number }> {
  return rankedResults.map((r) => ({
    id: r.result.id,
    score: r.finalScore,
  }));
}

/**
 * Get the top N results from ranking.
 *
 * @param rankedResults - Results from applyAdvancedRanking
 * @param n - Number of top results to return
 * @returns Top N ranked results
 */
export function getTopResults(
  rankedResults: RankedResult[],
  n: number
): RankedResult[] {
  return rankedResults.slice(0, n);
}

/**
 * Calculate ranking factor summary statistics.
 *
 * Useful for debugging and understanding ranking behavior.
 *
 * @param rankedResults - Results from applyAdvancedRanking
 * @returns Summary statistics for each factor
 */
export function getRankingStats(rankedResults: RankedResult[]): {
  factorAverages: Record<keyof RankingFactors, number>;
  factorRanges: Record<keyof RankingFactors, { min: number; max: number }>;
  scoreImprovement: {
    average: number;
    max: number;
    rankChanges: number;
  };
} {
  if (rankedResults.length === 0) {
    return {
      factorAverages: createDefaultFactors(0),
      factorRanges: {
        baseScore: { min: 0, max: 0 },
        chunkTypeBoost: { min: 1, max: 1 },
        nameBoost: { min: 1, max: 1 },
        pathBoost: { min: 1, max: 1 },
        tagBoost: { min: 1, max: 1 },
        docstringBonus: { min: 1, max: 1 },
        complexityPenalty: { min: 1, max: 1 },
      },
      scoreImprovement: { average: 0, max: 0, rankChanges: 0 },
    };
  }

  const factors = rankedResults.map((r) => r.factors);

  const factorKeys: (keyof RankingFactors)[] = [
    'baseScore',
    'chunkTypeBoost',
    'nameBoost',
    'pathBoost',
    'tagBoost',
    'docstringBonus',
    'complexityPenalty',
  ];

  const factorAverages: Record<string, number> = {};
  const factorRanges: Record<string, { min: number; max: number }> = {};

  for (const key of factorKeys) {
    const values = factors.map((f) => f[key]);
    factorAverages[key] = values.reduce((a, b) => a + b, 0) / values.length;
    factorRanges[key] = {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  // Calculate score improvement statistics
  const improvements = rankedResults.map(
    (r) => r.finalScore / r.originalScore - 1
  );
  const avgImprovement =
    improvements.reduce((a, b) => a + b, 0) / improvements.length;
  const maxImprovement = Math.max(...improvements.map(Math.abs));

  // Count rank changes (how many results moved position)
  let rankChanges = 0;
  const originalOrder = [...rankedResults].sort(
    (a, b) => b.originalScore - a.originalScore
  );
  for (let i = 0; i < rankedResults.length; i++) {
    if (rankedResults[i].result.id !== originalOrder[i].result.id) {
      rankChanges++;
    }
  }

  return {
    factorAverages: factorAverages as Record<keyof RankingFactors, number>,
    factorRanges: factorRanges as Record<
      keyof RankingFactors,
      { min: number; max: number }
    >,
    scoreImprovement: {
      average: avgImprovement,
      max: maxImprovement,
      rankChanges,
    },
  };
}
