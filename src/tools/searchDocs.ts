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
    .describe('The question or topic to search for in documentation'),
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
}

/**
 * Tool context containing the project path
 */
export interface DocsToolContext {
  /** Absolute path to the project root */
  projectPath: string;
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
): Promise<SearchDocsOutput> {
  const logger = getLogger();
  const startTime = performance.now();

  logger.info('searchDocs', 'Starting documentation search', {
    query: input.query.substring(0, 100),
    topK: input.top_k,
    projectPath: context.projectPath,
  });

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
        developerMessage: `Docs index at ${indexPath} exists but contains no data`,
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
    const results: SearchDocsResult[] = searchResults.map((result: SearchResult) => ({
      path: result.path,
      text: result.text,
      score: result.score,
      startLine: result.startLine,
      endLine: result.endLine,
    }));

    logger.info('searchDocs', 'Search completed', {
      totalResults: results.length,
      searchTimeMs,
      topScore: results[0]?.score,
    });

    return {
      results,
      totalResults: results.length,
      searchTimeMs,
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
    developerMessage: `Docs index not found at path: ${indexPath}`,
  });
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for search_docs
 *
 * This tool provides semantic search over the documentation index.
 * It does NOT require confirmation as it's a read-only operation.
 */
export const searchDocsTool = {
  name: 'search_docs',
  description:
    'Search project documentation files (.md, .txt) using natural language. Optimized for prose content like README, guides, and technical docs.',
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
    },
    required: ['query'],
  },
  requiresConfirmation: false,
};
