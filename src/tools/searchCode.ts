/**
 * search_code Tool
 *
 * Primary semantic search MCP tool for code. Takes a natural language query,
 * converts it to an embedding vector, and searches the LanceDB index for
 * similar code chunks. Returns ranked results with file paths, content,
 * and line numbers.
 *
 * Features:
 * - Natural language code search
 * - Configurable result count (top_k)
 * - Normalized similarity scores (0.0 - 1.0)
 * - Search timing information
 */

import { z } from 'zod';
import {
  getCodeEmbeddingEngine,
  CODE_EMBEDDING_DIMENSION,
} from '../engines/embedding.js';
import { LanceDBStore, SearchResult } from '../storage/lancedb.js';
import { loadMetadata, MetadataManager } from '../storage/metadata.js';
import { loadConfig } from '../storage/config.js';
import { getIndexPath, getCodeFTSIndexPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { indexNotFound, MCPError, ErrorCode } from '../errors/index.js';
import { MAX_QUERY_LENGTH } from '../utils/limits.js';
import { sanitizeIndexPath } from '../utils/paths.js';
import { checkCodeModelCompatibility } from '../utils/modelCompatibility.js';
import {
  processSearchResults,
  formatCompactOutput,
  type CompactSearchOutput,
} from '../utils/searchResultProcessing.js';
import type { StrategyOrchestrator } from '../engines/strategyOrchestrator.js';
import {
  performHybridSearch,
  validateSearchMode,
  validateAlpha,
  type SearchMode,
  type HybridSearchContext,
} from '../engines/hybridSearch.js';
import { loadFTSEngine } from '../engines/ftsEngineFactory.js';
import type { FTSEngine } from '../engines/ftsEngine.js';
import { expandQuery } from '../engines/queryExpansion.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for search_code tool
 *
 * Validates the query string and optional top_k parameter.
 * SMCP-061: Added mode and alpha parameters for hybrid search.
 */
export const SearchCodeInputSchema = z.object({
  /** The question or code concept to search for */
  query: z
    .string()
    .min(1)
    .max(MAX_QUERY_LENGTH, {
      message: `Query too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`,
    })
    .describe('The question or code concept to search for'),
  /** Number of results to return (1-50, default 10) */
  top_k: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Number of results to return (1-50, default 10)'),
  /** Return results in compact format with shorter field names (default false) */
  compact: z
    .boolean()
    .default(false)
    .describe('Return results in compact format with shorter field names'),
  /** Search mode: 'hybrid' (default), 'vector' (semantic only), or 'fts' (keyword only) */
  mode: z
    .enum(['hybrid', 'vector', 'fts'])
    .optional()
    .describe("Search mode: 'hybrid' combines vector+keyword (default), 'vector' for semantic only, 'fts' for keyword only"),
  /** Alpha weight for hybrid search (0-1). Higher = more vector weight. Default from config or 0.5 */
  alpha: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Alpha weight for hybrid search (0-1). Higher values favor semantic search, lower favor keyword search. Default: 0.5'),
});

/**
 * Inferred input type from schema
 */
export type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>;

/**
 * Single search result in the output
 */
export interface SearchCodeResult {
  /** Relative file path (forward-slash separated) */
  path: string;
  /** Chunk content text */
  text: string;
  /** Similarity score (0.0 - 1.0, higher is more similar) */
  score: number;
  /** Start line in source file (1-indexed) */
  startLine: number;
  /** End line in source file (1-indexed) */
  endLine: number;
}

/**
 * Output structure for search_code tool
 */
export interface SearchCodeOutput {
  /** Array of search results sorted by relevance */
  results: SearchCodeResult[];
  /** Total number of results returned */
  totalResults: number;
  /** Time taken for search in milliseconds */
  searchTimeMs: number;
  /** Warning message if index is in an incomplete state (MCP-15) */
  warning?: string;
  /** Search mode used (SMCP-061) */
  searchMode?: SearchMode;
}

/**
 * Tool context containing the project path
 */
export interface ToolContext {
  /** Absolute path to the project root */
  projectPath: string;
  /** Optional strategy orchestrator for flushing pending changes before search */
  orchestrator?: StrategyOrchestrator;
}

// ============================================================================
// Search Implementation
// ============================================================================

/**
 * Execute semantic search on the code index
 *
 * Searches the LanceDB index for code chunks that are semantically similar
 * to the provided query. The query is converted to an embedding vector
 * using the same model used for indexing.
 *
 * @param input - The search input containing query and optional top_k
 * @param context - Tool context containing the project path
 * @returns Search results with timing information
 * @throws MCPError with INDEX_NOT_FOUND if no index exists for the project
 *
 * @example
 * ```typescript
 * const results = await searchCode(
 *   { query: 'function that calculates hash', top_k: 10 },
 *   { projectPath: '/path/to/project' }
 * );
 *
 * console.log(results.results[0].path); // 'src/utils/hash.ts'
 * console.log(results.searchTimeMs);     // 45
 * ```
 */
export async function searchCode(
  input: SearchCodeInput,
  context: ToolContext
): Promise<SearchCodeOutput | CompactSearchOutput> {
  const logger = getLogger();
  const startTime = performance.now();

  logger.info('searchCode', 'Starting search', {
    query: input.query.substring(0, 100),
    topK: input.top_k,
    compact: input.compact,
    mode: input.mode,
    alpha: input.alpha,
    projectPath: context.projectPath,
  });

  // Flush pending changes if using lazy strategy (ensures fresh results)
  if (context.orchestrator) {
    const strategy = context.orchestrator.getCurrentStrategy();
    if (strategy?.name === 'lazy') {
      logger.debug('searchCode', 'Flushing lazy strategy before search');
      await context.orchestrator.flush();
    }
  }

  // Get the index path for this project
  const indexPath = getIndexPath(context.projectPath);

  // Check if index exists by looking for metadata
  const metadata = await loadMetadata(indexPath);
  if (!metadata) {
    logger.warn('searchCode', 'Index not found', { indexPath });
    throw indexNotFound(indexPath);
  }

  // Verify project path matches
  if (metadata.projectPath !== context.projectPath) {
    logger.warn('searchCode', 'Project path mismatch', {
      expected: context.projectPath,
      found: metadata.projectPath,
    });
    throw indexNotFound(indexPath);
  }

  // BUG #24 FIX: Check indexing state for stale results warning (MCP-15)
  // This addresses the metadata staleness issue during concurrent operations.
  // When indexing is in progress, the metadata and search results may be incomplete
  // or stale. We inform the user rather than blocking the search.
  let warning: string | undefined;
  if (metadata.indexingState) {
    switch (metadata.indexingState.state) {
      case 'in_progress':
        warning = 'Warning: Indexing is currently in progress. Search results may be incomplete or stale.';
        logger.warn('searchCode', warning);
        break;
      case 'failed':
        warning = 'Warning: Previous indexing operation failed. Search results may be incomplete. Consider running reindex_project.';
        logger.warn('searchCode', warning);
        break;
    }
  }

  // SMCP-074: Check model compatibility - block search if models don't match
  const modelCompatibility = checkCodeModelCompatibility(metadata.embeddingModels);
  if (!modelCompatibility.compatible) {
    logger.error('searchCode', 'Model mismatch detected', {
      storedModels: metadata.embeddingModels,
    });
    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage: modelCompatibility.message || 'Index model mismatch detected. Please run reindex_project.',
      developerMessage: `Code embedding model mismatch. Stored: ${JSON.stringify(metadata.embeddingModels)}, Expected: BGE-small (${CODE_EMBEDDING_DIMENSION} dims)`,
    });
  }

  // SMCP-061: Determine search mode and alpha
  const hybridSearchInfo = metadata.hybridSearch;
  const defaultAlpha = hybridSearchInfo?.defaultAlpha ?? 0.5;
  const effectiveMode = validateSearchMode(input.mode);
  const effectiveAlpha = validateAlpha(input.alpha, defaultAlpha);

  // SMCP-061: Load FTS engine if hybrid search is available and needed
  let ftsEngine: FTSEngine | null = null;
  let ftsAvailable = false;

  if (effectiveMode !== 'vector' && hybridSearchInfo?.enabled) {
    try {
      const ftsIndexPath = getCodeFTSIndexPath(indexPath);
      ftsEngine = await loadFTSEngine(indexPath, hybridSearchInfo.ftsEngine || 'js');
      if (ftsEngine) {
        // Load FTS index from serialized data
        const fs = await import('node:fs');
        const serializedData = await fs.promises.readFile(ftsIndexPath, 'utf-8');
        const success = ftsEngine.deserialize(serializedData);
        if (success) {
          ftsAvailable = true;
          const ftsStats = ftsEngine.getStats();
          logger.debug('searchCode', 'FTS engine loaded', {
            type: hybridSearchInfo.ftsEngine,
            chunkCount: ftsStats.totalChunks,
          });
        } else {
          logger.warn('searchCode', 'FTS deserialization failed');
          ftsEngine = null;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('searchCode', 'Failed to load FTS engine, falling back to vector-only', {
        error: message,
      });
      ftsEngine = null;
      ftsAvailable = false;
    }
  }

  // Determine actual search mode based on FTS availability
  let actualMode: SearchMode = effectiveMode;
  if (effectiveMode === 'hybrid' && !ftsAvailable) {
    actualMode = 'vector';
    logger.debug('searchCode', 'Falling back to vector-only (FTS not available)');
  } else if (effectiveMode === 'fts' && !ftsAvailable) {
    logger.warn('searchCode', 'FTS mode requested but not available, using vector search');
    actualMode = 'vector';
  }

  // Open the LanceDB store
  const store = new LanceDBStore(indexPath);
  try {
    await store.open();

    // Check if store has data
    if (!(await store.hasData())) {
      logger.warn('searchCode', 'Index is empty', { indexPath });
      throw new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage:
          'The search index is empty. Please index some files first using create_index.',
        developerMessage: `Index at ${sanitizeIndexPath(indexPath)} exists but contains no data`,
      });
    }

    // SMCP-095: Apply query expansion for better recall
    // Expand abbreviations like "auth" -> "auth authentication authorize login..."
    // Use expanded query for semantic embedding (better recall)
    // Use original query for FTS (exact matching)
    const expandedQuery = expandQuery(input.query);
    const didExpand = expandedQuery !== input.query;

    if (didExpand) {
      logger.debug('searchCode', 'Query expanded for embedding', {
        originalQuery: input.query.substring(0, 50),
        expandedQuery: expandedQuery.substring(0, 100),
      });
    }

    // SMCP-074: Generate query embedding using code embedding engine
    // Use expanded query for semantic search to improve recall
    // SMCP-096: Use 'query' prompt type for better retrieval quality
    const embeddingEngine = getCodeEmbeddingEngine();
    await embeddingEngine.initialize();
    const queryVector = await embeddingEngine.embed(expandedQuery, 'query');

    logger.debug('searchCode', 'Query embedding generated', {
      dimension: queryVector.length,
      queryExpanded: didExpand,
    });

    let rawResults: SearchCodeResult[];

    // SMCP-061: Execute search based on mode
    if (actualMode === 'vector') {
      // Vector-only search (traditional)
      const searchResults = await store.search(queryVector, input.top_k);
      rawResults = searchResults.map((result: SearchResult) => ({
        path: result.path,
        text: result.text,
        score: result.score,
        startLine: result.startLine,
        endLine: result.endLine,
      }));
    } else {
      // Hybrid or FTS-only search
      const hybridContext: HybridSearchContext = {
        ftsEngine,
        ftsAvailable,
        defaultAlpha: effectiveAlpha,
      };

      const hybridResults = await performHybridSearch(
        input.query,
        queryVector,
        {
          mode: actualMode,
          alpha: effectiveAlpha,
          topK: input.top_k,
        },
        async (vector, topK) => store.search(vector, topK),
        async (ids) => store.getChunksById(ids),
        hybridContext
      );

      rawResults = hybridResults.map((result) => ({
        path: result.path,
        text: result.text,
        score: result.score,
        startLine: result.startLine,
        endLine: result.endLine,
      }));
    }

    // Calculate search time
    const endTime = performance.now();
    const searchTimeMs = Math.round(endTime - startTime);

    // Post-process results: trim whitespace and deduplicate same-file results
    const results = processSearchResults(rawResults);

    logger.info('searchCode', 'Search completed', {
      totalResults: results.length,
      rawResults: rawResults.length,
      searchTimeMs,
      topScore: results[0]?.score,
      hasWarning: !!warning,
      compact: input.compact,
      searchMode: actualMode,
    });

    // Return compact format if requested
    if (input.compact) {
      return formatCompactOutput(results, searchTimeMs, warning);
    }

    return {
      results,
      totalResults: results.length,
      searchTimeMs,
      warning,
      searchMode: actualMode,
    };
  } finally {
    // Always close the store
    await store.close();
  }
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

import { getToolDescription } from './toolDescriptions.js';

/**
 * MCP tool definition for search_code
 *
 * This tool provides semantic search over the code index.
 * It does NOT require confirmation as it's a read-only operation.
 * SMCP-061: Added mode and alpha parameters for hybrid search.
 *
 * @param enhanced - Whether to include enhanced AI guidance hints in the description
 */
export function createSearchCodeTool(enhanced: boolean = false) {
  return {
    name: 'search_code',
    description: getToolDescription('search_code', enhanced),
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The question or code concept to search for',
        },
        top_k: {
          type: 'number',
          description: 'Number of results to return (1-50, default 10)',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
        compact: {
          type: 'boolean',
          description:
            'Return results in compact format with shorter field names (l=location, t=text, s=score). Reduces token count by ~5%.',
          default: false,
        },
        mode: {
          type: 'string',
          enum: ['hybrid', 'vector', 'fts'],
          description:
            "Search mode: 'hybrid' combines vector+keyword (default), 'vector' for semantic only, 'fts' for keyword only",
        },
        alpha: {
          type: 'number',
          description:
            'Alpha weight for hybrid search (0-1). Higher values favor semantic search, lower favor keyword search.',
          minimum: 0,
          maximum: 1,
        },
      },
      required: ['query'],
    },
    requiresConfirmation: false,
  };
}

/**
 * Default search_code tool definition (without enhanced hints)
 *
 * For backward compatibility. Use createSearchCodeTool(enhanced) for
 * dynamic description generation.
 */
export const searchCodeTool = createSearchCodeTool(false);

// ============================================================================
// Exports
// ============================================================================

export {
  SearchCodeInputSchema as SearchNowInputSchema,
  searchCode as searchNow,
  searchCodeTool as searchNowTool,
};
