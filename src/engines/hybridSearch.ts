/**
 * Hybrid Search Module (SMCP-061, SMCP-085)
 *
 * Combines vector search (semantic) with FTS (keyword) search using Reciprocal Rank Fusion (RRF).
 * This provides better search results by leveraging both semantic understanding and exact keyword matches.
 *
 * SMCP-085: Added query intent detection for dynamic result boosting.
 *
 * Supports three search modes:
 * - 'vector': Vector-only semantic search (traditional)
 * - 'fts': FTS-only keyword search
 * - 'hybrid': Combined search with configurable alpha weight
 *
 * @module hybridSearch
 */

import { getLogger } from '../utils/logger.js';
import type { SearchResult } from '../storage/lancedb.js';
import type { FTSEngine, FTSSearchResult } from './ftsEngine.js';
import {
  detectQueryIntent,
  getChunkTypeBoosts,
  getIntentTagBoost,
  type QueryIntent,
  type IntentDetectionConfig,
} from './queryIntent.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Search mode for hybrid search
 */
export type SearchMode = 'vector' | 'fts' | 'hybrid';

/**
 * Configuration for hybrid search
 */
export interface HybridSearchConfig {
  /** Search mode */
  mode: SearchMode;
  /** Alpha weight for hybrid search (0-1, higher = more vector weight) */
  alpha: number;
  /** Number of results to return */
  topK: number;
  /** SMCP-085: Intent detection configuration */
  intentConfig?: Partial<IntentDetectionConfig>;
}

/**
 * Scored result for internal fusion
 */
interface ScoredResult {
  id: string;
  vectorScore: number; // 0 if not in vector results
  ftsScore: number; // 0 if not in FTS results
  vectorRank: number; // Rank in vector results (1-indexed, 0 if not present)
  ftsRank: number; // Rank in FTS results (1-indexed, 0 if not present)
  combinedScore: number; // Final combined score
}

// ============================================================================
// Constants
// ============================================================================

/**
 * RRF constant (k) - Standard value used in most implementations
 * Higher k = less aggressive rank smoothing
 */
const RRF_K = 60;

// ============================================================================
// Score Fusion Functions
// ============================================================================

/**
 * Calculate Reciprocal Rank Fusion (RRF) score
 *
 * RRF(d) = sum(1 / (k + r(d))) for each ranking that contains document d
 *
 * @param vectorRank - Rank in vector results (1-indexed, 0 if not present)
 * @param ftsRank - Rank in FTS results (1-indexed, 0 if not present)
 * @param alpha - Weight for vector results (0-1)
 * @param k - RRF constant (default: 60)
 * @returns Combined RRF score
 */
export function calculateRRFScore(
  vectorRank: number,
  ftsRank: number,
  alpha: number,
  k: number = RRF_K
): number {
  let score = 0;

  // Add vector contribution (if present in vector results)
  if (vectorRank > 0) {
    score += alpha * (1 / (k + vectorRank));
  }

  // Add FTS contribution (if present in FTS results)
  if (ftsRank > 0) {
    score += (1 - alpha) * (1 / (k + ftsRank));
  }

  return score;
}

/**
 * Normalize a score to 0-1 range
 */
function normalizeScore(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.min(1, score / maxScore);
}

// ============================================================================
// Result Fusion
// ============================================================================

/**
 * Merge vector search results with FTS results using RRF
 *
 * @param vectorResults - Results from vector search
 * @param ftsResults - Results from FTS search
 * @param alpha - Weight for vector results (0-1, higher = more vector weight)
 * @param topK - Maximum number of results to return
 * @returns Merged and re-ranked search results
 */
export function fuseResults(
  vectorResults: Array<{ id: string; result: SearchResult }>,
  ftsResults: FTSSearchResult[],
  alpha: number,
  topK: number
): Array<{ id: string; score: number }> {
  const logger = getLogger();

  // Build scoring map
  const scoreMap = new Map<string, ScoredResult>();

  // Add vector results with their ranks
  vectorResults.forEach((item, index) => {
    const existing = scoreMap.get(item.id);
    if (existing) {
      existing.vectorScore = item.result.score;
      existing.vectorRank = index + 1;
    } else {
      scoreMap.set(item.id, {
        id: item.id,
        vectorScore: item.result.score,
        ftsScore: 0,
        vectorRank: index + 1,
        ftsRank: 0,
        combinedScore: 0,
      });
    }
  });

  // Add FTS results with their ranks
  ftsResults.forEach((item, index) => {
    const existing = scoreMap.get(item.id);
    if (existing) {
      existing.ftsScore = item.score;
      existing.ftsRank = index + 1;
    } else {
      scoreMap.set(item.id, {
        id: item.id,
        vectorScore: 0,
        ftsScore: item.score,
        vectorRank: 0,
        ftsRank: index + 1,
        combinedScore: 0,
      });
    }
  });

  // Calculate combined RRF scores
  for (const item of scoreMap.values()) {
    item.combinedScore = calculateRRFScore(item.vectorRank, item.ftsRank, alpha);
  }

  // Sort by combined score descending
  const sortedResults = Array.from(scoreMap.values())
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK);

  // Normalize scores to 0-1 range
  const maxScore = sortedResults[0]?.combinedScore ?? 0;

  logger.debug('hybridSearch', 'Fused results', {
    vectorCount: vectorResults.length,
    ftsCount: ftsResults.length,
    uniqueCount: scoreMap.size,
    returnedCount: sortedResults.length,
    alpha,
    maxScore,
  });

  return sortedResults.map((item) => ({
    id: item.id,
    score: normalizeScore(item.combinedScore, maxScore),
  }));
}

// ============================================================================
// Hybrid Search Interface
// ============================================================================

/**
 * Hybrid search result with chunk data
 */
export interface HybridSearchResult extends SearchResult {
  /** Chunk ID */
  id: string;
  /** Search mode that produced this result */
  searchMode: SearchMode;
}

/**
 * Hybrid search context
 */
export interface HybridSearchContext {
  /** FTS engine (may be null if not available) */
  ftsEngine: FTSEngine | null;
  /** Whether FTS is available */
  ftsAvailable: boolean;
  /** Default alpha from config */
  defaultAlpha: number;
  /** SMCP-085: Enable intent-based result boosting */
  enableIntentBoosting?: boolean;
}

/**
 * Perform hybrid search
 *
 * Combines vector search with FTS based on the specified mode:
 * - 'vector': Uses only vector search
 * - 'fts': Uses only FTS search
 * - 'hybrid': Combines both using RRF
 *
 * @param query - Search query string
 * @param queryVector - Embedded query vector
 * @param config - Hybrid search configuration
 * @param vectorSearch - Function to perform vector search
 * @param ctx - Hybrid search context with FTS engine
 * @returns Search results with scores
 */
export async function performHybridSearch(
  query: string,
  queryVector: number[],
  config: HybridSearchConfig,
  vectorSearch: (vector: number[], topK: number) => Promise<SearchResult[]>,
  getChunksById: (ids: string[]) => Promise<Map<string, SearchResult>>,
  ctx: HybridSearchContext
): Promise<HybridSearchResult[]> {
  const logger = getLogger();

  logger.info('hybridSearch', 'Performing search', {
    mode: config.mode,
    alpha: config.alpha,
    topK: config.topK,
    ftsAvailable: ctx.ftsAvailable,
    queryLength: query.length,
  });

  // Handle search modes
  if (config.mode === 'vector' || !ctx.ftsAvailable) {
    // Vector-only search (or FTS not available)
    if (config.mode !== 'vector' && !ctx.ftsAvailable) {
      logger.debug('hybridSearch', 'Falling back to vector-only (FTS not available)');
    }

    const results = await vectorSearch(queryVector, config.topK);
    return results.map((r, idx) => ({
      ...r,
      id: `vector-${idx}`, // Placeholder ID for vector-only
      searchMode: 'vector' as SearchMode,
    }));
  }

  if (config.mode === 'fts') {
    // FTS-only search
    if (!ctx.ftsEngine) {
      logger.warn('hybridSearch', 'FTS requested but engine not available');
      return [];
    }

    const ftsResults = await ctx.ftsEngine.search(query, config.topK);
    const ids = ftsResults.map((r) => r.id);
    const chunkData = await getChunksById(ids);

    return ftsResults
      .filter((r) => chunkData.has(r.id))
      .map((r) => {
        const chunk = chunkData.get(r.id)!;
        return {
          ...chunk,
          id: r.id,
          score: r.score,
          searchMode: 'fts' as SearchMode,
        };
      });
  }

  // Hybrid search - combine vector and FTS
  if (!ctx.ftsEngine) {
    logger.warn('hybridSearch', 'Hybrid requested but FTS not available, using vector-only');
    const results = await vectorSearch(queryVector, config.topK);
    return results.map((r, idx) => ({
      ...r,
      id: `vector-${idx}`,
      searchMode: 'vector' as SearchMode,
    }));
  }

  // Fetch more results from each source for better fusion
  const expandedTopK = Math.min(config.topK * 2, 100);

  // Run both searches in parallel
  const [vectorResults, ftsResults] = await Promise.all([
    vectorSearch(queryVector, expandedTopK),
    ctx.ftsEngine.search(query, expandedTopK),
  ]);

  // Get chunk data for all unique IDs
  const allIds = new Set<string>();
  ftsResults.forEach((r) => allIds.add(r.id));
  // Vector results don't have IDs by default, we need to get them from the store
  // For now, we'll use the FTS IDs for fusion

  // Create vector results with placeholder IDs (we'll match by content later)
  // Note: This is a limitation - ideally we'd have IDs from both sources
  // For proper fusion, the vector search should return chunk IDs too

  // Get all FTS result IDs for chunk lookup
  const ftsIds = ftsResults.map((r) => r.id);
  const chunkData = await getChunksById(ftsIds);

  // Build vector results with synthetic IDs based on position
  const vectorResultsWithId = vectorResults.map((r, idx) => ({
    id: `vector-${idx}`,
    result: r,
  }));

  // Perform RRF fusion
  const fusedResults = fuseResults(vectorResultsWithId, ftsResults, config.alpha, config.topK);

  // Build final results
  const finalResults: HybridSearchResult[] = [];

  for (const fused of fusedResults) {
    // Check if it's a vector result
    if (fused.id.startsWith('vector-')) {
      const idx = parseInt(fused.id.split('-')[1], 10);
      if (idx < vectorResults.length) {
        finalResults.push({
          ...vectorResults[idx],
          id: fused.id,
          score: fused.score,
          searchMode: 'hybrid',
        });
      }
    } else {
      // It's an FTS result - get chunk data
      const chunk = chunkData.get(fused.id);
      if (chunk) {
        finalResults.push({
          ...chunk,
          id: fused.id,
          score: fused.score,
          searchMode: 'hybrid',
        });
      }
    }
  }

  logger.info('hybridSearch', 'Hybrid search complete', {
    vectorResultCount: vectorResults.length,
    ftsResultCount: ftsResults.length,
    fusedResultCount: finalResults.length,
  });

  return finalResults;
}

/**
 * Validate search mode parameter
 *
 * @param mode - Mode string to validate
 * @returns Valid SearchMode or 'hybrid' as default
 */
export function validateSearchMode(mode: string | undefined): SearchMode {
  if (mode === 'vector' || mode === 'fts' || mode === 'hybrid') {
    return mode;
  }
  return 'hybrid'; // Default to hybrid
}

/**
 * Validate alpha parameter
 *
 * @param alpha - Alpha value to validate
 * @param defaultAlpha - Default alpha value
 * @returns Valid alpha between 0 and 1
 */
export function validateAlpha(alpha: number | undefined, defaultAlpha: number): number {
  if (alpha === undefined) {
    return defaultAlpha;
  }
  return Math.max(0, Math.min(1, alpha));
}

// ============================================================================
// SMCP-085: Intent-Based Result Boosting
// ============================================================================

/**
 * Search result with optional metadata for intent boosting
 */
export interface SearchResultWithMeta extends SearchResult {
  /** Chunk type (function, class, method, module, etc.) */
  chunkType?: string;
  /** Tags associated with the chunk */
  tags?: string[];
  /** Name of the code element (function/class name) */
  name?: string;
}

/**
 * Result of applying intent-based boosts
 */
export interface IntentBoostedResult {
  /** The original search result */
  result: SearchResultWithMeta;
  /** Original score before boosting */
  originalScore: number;
  /** Final score after intent boosting */
  boostedScore: number;
  /** Detected query intent */
  intent?: QueryIntent;
}

/**
 * Apply intent-based boosts to search results (SMCP-085)
 *
 * This function analyzes the query, detects intent, and applies
 * appropriate boost factors to results based on chunk type and tags.
 *
 * @param query - The search query
 * @param results - Search results to boost
 * @param config - Optional intent detection configuration
 * @returns Results sorted by boosted score
 */
export function applyIntentBoosts(
  query: string,
  results: SearchResultWithMeta[],
  config?: Partial<IntentDetectionConfig>
): IntentBoostedResult[] {
  const logger = getLogger();

  // Detect query intent
  const intent = detectQueryIntent(query, config);

  logger.debug('hybridSearch', 'Applying intent boosts', {
    query: query.substring(0, 50),
    intentCount: intent.intents.length,
    primaryIntent: intent.primaryIntent,
    detectionTimeMs: intent.detectionTimeMs,
  });

  // If no intents detected, return results unchanged
  if (intent.intents.length === 0) {
    return results.map((result) => ({
      result,
      originalScore: result.score,
      boostedScore: result.score,
    }));
  }

  // Get chunk type boosts based on intent
  const chunkBoosts = getChunkTypeBoosts(intent);

  // Apply boosts to each result
  const boostedResults = results.map((result) => {
    let boostedScore = result.score;
    const originalScore = result.score;

    // Apply chunk type boost
    const chunkType = result.chunkType?.toLowerCase() || 'other';
    const typeBoost = (chunkBoosts as unknown as Record<string, number>)[chunkType] ?? chunkBoosts.other;
    boostedScore *= typeBoost;

    // Apply tag-based intent boost
    if (result.tags && result.tags.length > 0) {
      const tagBoost = getIntentTagBoost(intent, result.tags);
      boostedScore *= tagBoost;
    }

    // Apply name matching boost (if the query contains the name)
    if (result.name) {
      const nameBoost = calculateNameBoost(intent.queryTokens, result.name);
      boostedScore *= nameBoost;
    }

    return {
      result,
      originalScore,
      boostedScore,
      intent,
    };
  });

  // Sort by boosted score (highest first)
  boostedResults.sort((a, b) => b.boostedScore - a.boostedScore);

  logger.debug('hybridSearch', 'Intent boosts applied', {
    resultCount: boostedResults.length,
    topOriginalScore: results[0]?.score,
    topBoostedScore: boostedResults[0]?.boostedScore,
  });

  return boostedResults;
}

/**
 * Calculate name matching boost based on token overlap.
 *
 * @param queryTokens - Normalized tokens from the query
 * @param name - Name of the code element
 * @returns Boost multiplier (1.0 = no boost, up to 1.4 for exact match)
 */
function calculateNameBoost(queryTokens: string[], name: string): number {
  if (!name || queryTokens.length === 0) {
    return 1.0;
  }

  // Import normalizeToTokens here to avoid circular dependency issues
  // Note: The function is already imported at the top
  const nameTokens = normalizeNameToTokens(name);

  if (nameTokens.length === 0) {
    return 1.0;
  }

  const querySet = new Set(queryTokens);
  const nameSet = new Set(nameTokens);

  // Calculate overlap
  let overlap = 0;
  for (const token of querySet) {
    if (nameSet.has(token)) {
      overlap++;
    }
  }

  if (overlap === 0) {
    return 1.0;
  }

  // Calculate overlap ratio
  const overlapRatio = overlap / querySet.size;

  if (overlapRatio >= 0.8) {
    return 1.4; // Strong match
  } else if (overlapRatio >= 0.5) {
    return 1.2; // Good match
  } else if (overlapRatio >= 0.3) {
    return 1.1; // Partial match
  } else {
    return 1.05; // Weak match
  }
}

/**
 * Normalize a name to tokens for matching.
 * Handles CamelCase and snake_case.
 */
function normalizeNameToTokens(name: string): string[] {
  // Split CamelCase
  let normalized = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Split snake_case and kebab-case
  normalized = normalized.replace(/_/g, ' ').replace(/-/g, ' ');
  // Extract tokens
  return normalized.toLowerCase().match(/[a-z0-9]+/g) || [];
}

/**
 * Get query intent for a search query.
 *
 * Convenience function for use in search tools.
 *
 * @param query - The search query
 * @param config - Optional intent detection configuration
 * @returns Detected query intent
 */
export function getQueryIntent(
  query: string,
  config?: Partial<IntentDetectionConfig>
): QueryIntent {
  return detectQueryIntent(query, config);
}

// Re-export QueryIntent type for convenience
export type { QueryIntent, IntentDetectionConfig };

// ============================================================================
// SMCP-087: Advanced Multi-Factor Ranking Integration
// ============================================================================

import {
  applyAdvancedRanking,
  type RankableResult,
  type RankedResult,
  type AdvancedRankingConfig,
} from './advancedRanking.js';

/**
 * Apply advanced multi-factor ranking to search results (SMCP-087).
 *
 * This function applies sophisticated ranking using 7+ signals:
 * 1. Base similarity score
 * 2. Query intent detection
 * 3. Chunk type boosting (dynamic based on intent)
 * 4. Name matching with CamelCase/snake_case awareness
 * 5. Path/filename relevance
 * 6. Docstring presence bonus
 * 7. Complexity penalty for oversized chunks
 *
 * @param query - The search query
 * @param results - Search results to rank (HybridSearchResult with AST metadata)
 * @param config - Optional ranking configuration
 * @returns Results sorted by advanced ranking score
 *
 * @example
 * ```typescript
 * const hybridResults = await performHybridSearch(query, ...);
 * const rankedResults = applyAdvancedSearchRanking(query, hybridResults);
 * // rankedResults[0] is now the most relevant result
 * ```
 */
export function applyAdvancedSearchRanking(
  query: string,
  results: HybridSearchResult[],
  config?: Partial<AdvancedRankingConfig>
): RankedResult[] {
  const logger = getLogger();

  // Convert HybridSearchResult to RankableResult
  // HybridSearchResult extends SearchResult which has 'path' field
  const rankableResults: RankableResult[] = results.map((r) => ({
    id: r.id,
    score: r.score,
    text: r.text,
    path: r.path,
    // AST metadata fields from SearchResult (SMCP-086)
    chunkType: r.chunkType,
    chunkName: r.chunkName,
    chunkParent: r.chunkParent,
    chunkTags: r.chunkTags,
    chunkDocstring: r.chunkDocstring,
    startLine: r.startLine,
    endLine: r.endLine,
    chunkLanguage: r.chunkLanguage,
  }));

  logger.debug('hybridSearch', 'Applying advanced ranking', {
    resultCount: results.length,
    queryLength: query.length,
  });

  // Apply advanced ranking
  const rankedResults = applyAdvancedRanking(query, rankableResults, config);

  logger.debug('hybridSearch', 'Advanced ranking complete', {
    resultCount: rankedResults.length,
    topOriginalScore: rankedResults[0]?.originalScore,
    topFinalScore: rankedResults[0]?.finalScore,
  });

  return rankedResults;
}

/**
 * Convert RankedResult back to HybridSearchResult with updated scores.
 *
 * @param rankedResults - Results from applyAdvancedSearchRanking
 * @param originalResults - Original hybrid search results (for preserving extra fields)
 * @returns Hybrid search results with updated scores
 */
export function convertRankedToHybridResults(
  rankedResults: RankedResult[],
  originalResults: HybridSearchResult[]
): HybridSearchResult[] {
  // Create a map for quick lookup of original results by ID
  const originalMap = new Map<string, HybridSearchResult>();
  for (const r of originalResults) {
    originalMap.set(r.id, r);
  }

  // Convert back, preserving original data but updating score
  return rankedResults.map((ranked) => {
    const original = originalMap.get(ranked.result.id);
    if (original) {
      return {
        ...original,
        score: ranked.finalScore,
      };
    }
    // Fallback if original not found (shouldn't happen)
    return {
      id: ranked.result.id,
      text: ranked.result.text,
      path: ranked.result.path,
      score: ranked.finalScore,
      startLine: ranked.result.startLine ?? 0,
      endLine: ranked.result.endLine ?? 0,
      searchMode: 'hybrid' as SearchMode,
      chunkType: ranked.result.chunkType,
      chunkName: ranked.result.chunkName,
      chunkParent: ranked.result.chunkParent,
      chunkTags: ranked.result.chunkTags,
      chunkDocstring: ranked.result.chunkDocstring,
      chunkLanguage: ranked.result.chunkLanguage,
    };
  });
}

// Re-export advanced ranking types for convenience
export type { RankableResult, RankedResult, AdvancedRankingConfig };
