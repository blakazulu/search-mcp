/**
 * Hybrid Search Module (SMCP-061)
 *
 * Combines vector search (semantic) with FTS (keyword) search using Reciprocal Rank Fusion (RRF).
 * This provides better search results by leveraging both semantic understanding and exact keyword matches.
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
