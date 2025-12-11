/**
 * search_docs Tool
 *
 * Documentation-specific semantic search MCP tool. Takes a natural language query,
 * converts it to an embedding vector, and searches the docs LanceDB table for
 * similar documentation chunks. Optimized for prose content like README files,
 * guides, and technical documentation.
 *
 * Features:
 * - Natural language documentation search
 * - Configurable result count (top_k)
 * - Normalized similarity scores (0.0 - 1.0)
 * - Search timing information
 * - Only returns doc files (.md, .txt)
 */

import { z } from 'zod';
import { getEmbeddingEngine } from '../engines/embedding.js';
import { DocsLanceDBStore } from '../storage/docsLancedb.js';
import { SearchResult } from '../storage/lancedb.js';
import { loadMetadata } from '../storage/metadata.js';
import { getIndexPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { indexNotFound, MCPError, ErrorCode } from '../errors/index.js';
import { MAX_QUERY_LENGTH } from '../utils/limits.js';
import { sanitizeIndexPath } from '../utils/paths.js';
import {
  processSearchResults,
  formatCompactOutput,
  type CompactSearchOutput,
} from '../utils/searchResultProcessing.js';
import type { StrategyOrchestrator } from '../engines/strategyOrchestrator.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for search_docs tool
 *
 * Validates the query string and optional top_k parameter.
 */
export const SearchDocsInputSchema = z.object({
  /** The question or topic to search for in documentation */
  query: z
    .string()
    .min(1)
    .max(MAX_QUERY_LENGTH, {
      message: `Query too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`,
    })
    .describe('The question or topic to search for in documentation'),
  /** Number of results to return (1-50, default 10) */
  top_k: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Number of results to return (1-50)'),
  /** Return results in compact format with shorter field names (default false) */
  compact: z
    .boolean()
    .default(false)
    .describe('Return results in compact format with shorter field names'),
});

/**
 * Inferred input type from schema
 */
export type SearchDocsInput = z.infer<typeof SearchDocsInputSchema>;

/**
 * Single search result in the output
 */
export interface SearchDocsResult {
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
 * Output structure for search_docs tool
 */
export interface SearchDocsOutput {
  /** Array of search results sorted by relevance */
  results: SearchDocsResult[];
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
export interface DocsToolContext {
  /** Absolute path to the project root */
  projectPath: string;
  /** Optional strategy orchestrator for flushing pending changes before search */
  orchestrator?: StrategyOrchestrator;
}

// ============================================================================
// Search Implementation
// ============================================================================

/**
 * Execute semantic search on the documentation index
 *
 * Searches the DocsLanceDB index for documentation chunks that are semantically
 * similar to the provided query. The query is converted to an embedding vector
 * using the same model used for indexing.
 *
 * @param input - The search input containing query and optional top_k
 * @param context - Tool context containing the project path
 * @returns Search results with timing information
 * @throws MCPError with INDEX_NOT_FOUND if no docs index exists for the project
 *
 * @example
 * ```typescript
 * const results = await searchDocs(
 *   { query: 'how to configure the server', top_k: 10 },
 *   { projectPath: '/path/to/project' }
 * );
 *
 * console.log(results.results[0].path); // 'docs/configuration.md'
 * console.log(results.searchTimeMs);     // 45
 * ```
 */
export async function searchDocs(
  input: SearchDocsInput,
  context: DocsToolContext
): Promise<SearchDocsOutput | CompactSearchOutput> {
  const logger = getLogger();
  const startTime = performance.now();

  logger.info('searchDocs', 'Starting documentation search', {
    query: input.query.substring(0, 100),
    topK: input.top_k,
    compact: input.compact,
    projectPath: context.projectPath,
  });

  // Flush pending changes if using lazy strategy (ensures fresh results)
  if (context.orchestrator) {
    const strategy = context.orchestrator.getCurrentStrategy();
    if (strategy?.name === 'lazy') {
      logger.debug('searchDocs', 'Flushing lazy strategy before search');
      await context.orchestrator.flush();
    }
  }

  // Get the index path for this project
  const indexPath = getIndexPath(context.projectPath);

  // Check if index exists by looking for metadata
  const metadata = await loadMetadata(indexPath);
  if (!metadata) {
    logger.warn('searchDocs', 'Index not found', { indexPath });
    throw docsIndexNotFound(indexPath);
  }

  // Verify project path matches
  if (metadata.projectPath !== context.projectPath) {
    logger.warn('searchDocs', 'Project path mismatch', {
      expected: context.projectPath,
      found: metadata.projectPath,
    });
    throw docsIndexNotFound(indexPath);
  }

  // Check indexing state for stale results warning (MCP-15)
  let warning: string | undefined;
  if (metadata.indexingState) {
    switch (metadata.indexingState.state) {
      case 'in_progress':
        warning = 'Warning: Indexing is currently in progress. Search results may be incomplete or stale.';
        logger.warn('searchDocs', warning);
        break;
      case 'failed':
        warning = 'Warning: Previous indexing operation failed. Search results may be incomplete. Consider running reindex_project.';
        logger.warn('searchDocs', warning);
        break;
    }
  }

  // Open the DocsLanceDB store
  const store = new DocsLanceDBStore(indexPath);
  try {
    await store.open();

    // Check if store has data
    if (!(await store.hasData())) {
      logger.warn('searchDocs', 'Docs index is empty', { indexPath });
      throw new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage:
          'The documentation search index is empty. Please index some documentation files first using create_index.',
        developerMessage: `Docs index at ${sanitizeIndexPath(indexPath)} exists but contains no data`,
      });
    }

    // Generate query embedding
    const embeddingEngine = getEmbeddingEngine();
    const queryVector = await embeddingEngine.embed(input.query);

    logger.debug('searchDocs', 'Query embedding generated', {
      dimension: queryVector.length,
    });

    // Execute vector search
    const searchResults = await store.search(queryVector, input.top_k);

    // Calculate search time
    const endTime = performance.now();
    const searchTimeMs = Math.round(endTime - startTime);

    // Format results
    const rawResults: SearchDocsResult[] = searchResults.map((result: SearchResult) => ({
      path: result.path,
      text: result.text,
      score: result.score,
      startLine: result.startLine,
      endLine: result.endLine,
    }));

    // Post-process results: trim whitespace and deduplicate same-file results
    const results = processSearchResults(rawResults);

    logger.info('searchDocs', 'Search completed', {
      totalResults: results.length,
      rawResults: rawResults.length,
      searchTimeMs,
      topScore: results[0]?.score,
      hasWarning: !!warning,
      compact: input.compact,
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
    };
  } finally {
    // Always close the store
    await store.close();
  }
}

// ============================================================================
// Error Factory
// ============================================================================

/**
 * Create a DOCS_INDEX_NOT_FOUND error
 *
 * Used when no documentation index exists for a project path.
 *
 * @param indexPath - The path where the index was expected
 */
export function docsIndexNotFound(indexPath: string): MCPError {
  return new MCPError({
    code: ErrorCode.INDEX_NOT_FOUND,
    userMessage:
      'No documentation search index exists for this project. Please create one first using the create_index tool.',
    developerMessage: `Docs index not found at path: ${sanitizeIndexPath(indexPath)}`,
  });
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

import { getToolDescription } from './toolDescriptions.js';

/**
 * MCP tool definition for search_docs
 *
 * This tool provides semantic search over the documentation index.
 * It does NOT require confirmation as it's a read-only operation.
 *
 * @param enhanced - Whether to include enhanced AI guidance hints in the description
 */
export function createSearchDocsTool(enhanced: boolean = false) {
  return {
    name: 'search_docs',
    description: getToolDescription('search_docs', enhanced),
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The question or topic to search for in documentation',
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
      },
      required: ['query'],
    },
    requiresConfirmation: false,
  };
}

/**
 * Default search_docs tool definition (without enhanced hints)
 *
 * For backward compatibility. Use createSearchDocsTool(enhanced) for
 * dynamic description generation.
 */
export const searchDocsTool = createSearchDocsTool(false);
