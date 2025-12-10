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
import { getEmbeddingEngine } from '../engines/embedding.js';
import { LanceDBStore, SearchResult } from '../storage/lancedb.js';
import { loadMetadata } from '../storage/metadata.js';
import { getIndexPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { indexNotFound, MCPError, ErrorCode } from '../errors/index.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for search_code tool
 *
 * Validates the query string and optional top_k parameter.
 */
export const SearchCodeInputSchema = z.object({
  /** The question or code concept to search for */
  query: z.string().min(1).describe('The question or code concept to search for'),
  /** Number of results to return (1-50, default 10) */
  top_k: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Number of results to return (1-50)'),
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
}

/**
 * Tool context containing the project path
 */
export interface ToolContext {
  /** Absolute path to the project root */
  projectPath: string;
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
): Promise<SearchCodeOutput> {
  const logger = getLogger();
  const startTime = performance.now();

  logger.info('searchCode', 'Starting search', {
    query: input.query.substring(0, 100),
    topK: input.top_k,
    projectPath: context.projectPath,
  });

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

  // Check indexing state for stale results warning (MCP-15)
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
        developerMessage: `Index at ${indexPath} exists but contains no data`,
      });
    }

    // Generate query embedding
    const embeddingEngine = getEmbeddingEngine();
    const queryVector = await embeddingEngine.embed(input.query);

    logger.debug('searchCode', 'Query embedding generated', {
      dimension: queryVector.length,
    });

    // Execute vector search
    const searchResults = await store.search(queryVector, input.top_k);

    // Calculate search time
    const endTime = performance.now();
    const searchTimeMs = Math.round(endTime - startTime);

    // Format results
    const results: SearchCodeResult[] = searchResults.map((result: SearchResult) => ({
      path: result.path,
      text: result.text,
      score: result.score,
      startLine: result.startLine,
      endLine: result.endLine,
    }));

    logger.info('searchCode', 'Search completed', {
      totalResults: results.length,
      searchTimeMs,
      topScore: results[0]?.score,
      hasWarning: !!warning,
    });

    return {
      results,
      totalResults: results.length,
      searchTimeMs,
      warning,
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
