/**
 * search_by_path Tool
 *
 * Glob pattern file search MCP tool. Finds indexed files matching a glob pattern
 * (e.g., `**\/auth*.ts`). Useful when users know what file they're looking for
 * but not the exact path.
 *
 * Features:
 * - Standard glob pattern support (**, *, ?)
 * - Configurable result limit
 * - Case-sensitive matching
 * - Alphabetically sorted results
 */

import { z } from 'zod';
import { minimatch } from 'minimatch';
import { LanceDBStore } from '../storage/lancedb.js';
import { loadMetadata } from '../storage/metadata.js';
import { getIndexPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { indexNotFound, invalidPattern, MCPError, ErrorCode } from '../errors/index.js';
import { isPatternSafe, MAX_GLOB_PATTERN_LENGTH } from '../utils/limits.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for search_by_path tool
 *
 * Validates the glob pattern and optional limit parameter.
 */
export const SearchByPathInputSchema = z.object({
  /** Glob pattern to match (e.g., '**\/auth*.ts', 'src/**\/*.md') */
  pattern: z
    .string()
    .min(1)
    .max(MAX_GLOB_PATTERN_LENGTH, {
      message: `Pattern too long. Maximum length is ${MAX_GLOB_PATTERN_LENGTH} characters.`,
    })
    .describe("Glob pattern to match (e.g., '**/auth*.ts', 'src/**/*.md')"),
  /** Maximum results to return (1-100, default 20) */
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum results to return (1-100)'),
});

/**
 * Inferred input type from schema
 */
export type SearchByPathInput = z.infer<typeof SearchByPathInputSchema>;

/**
 * Output structure for search_by_path tool
 */
export interface SearchByPathOutput {
  /** Array of matching file paths (alphabetically sorted) */
  matches: string[];
  /** Total number of matches found (may be greater than matches.length if limited) */
  totalMatches: number;
}

/**
 * Tool context containing the project path
 */
export interface ToolContext {
  /** Absolute path to the project root */
  projectPath: string;
}

// ============================================================================
// Pattern Validation
// ============================================================================

/**
 * Validate a glob pattern for correctness
 *
 * Checks for:
 * - Empty patterns
 * - Unmatched brackets
 * - Invalid escape sequences
 * - Other malformed patterns
 *
 * @param pattern - The glob pattern to validate
 * @returns Object with valid boolean and optional error message
 */
export function validateGlobPattern(pattern: string): { valid: boolean; error?: string } {
  // Empty pattern check
  if (!pattern || pattern.trim().length === 0) {
    return { valid: false, error: 'Pattern cannot be empty' };
  }

  // Check for unmatched brackets and braces
  // Note: For square brackets [], we only check for unclosed opening brackets
  // since a stray ] is treated as a literal character by minimatch
  // For curly braces {}, we check both since they must be balanced for brace expansion
  let bracketDepth = 0;
  let braceDepth = 0;
  let inCharClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const prevChar = i > 0 ? pattern[i - 1] : '';

    // Skip escaped characters
    if (prevChar === '\\') {
      continue;
    }

    // Handle square brackets (character classes)
    // Only track when we're inside a character class
    if (char === '[' && !inCharClass) {
      inCharClass = true;
      bracketDepth++;
    } else if (char === ']' && inCharClass) {
      inCharClass = false;
      bracketDepth--;
    }

    // Handle curly braces (brace expansion)
    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
    }

    // Check for negative depth for braces only (unmatched closing brace)
    // Stray ] is allowed (treated as literal) but stray } is not valid
    if (braceDepth < 0) {
      return { valid: false, error: 'Unmatched closing brace' };
    }
  }

  // Check for unclosed brackets
  if (bracketDepth !== 0) {
    return { valid: false, error: 'Unclosed square bracket' };
  }

  if (braceDepth !== 0) {
    return { valid: false, error: 'Unclosed curly brace' };
  }

  // Check for invalid patterns that might cause regex errors
  try {
    // Try to create a minimatch instance to catch any other errors
    minimatch('test', pattern);
  } catch (error) {
    const err = error as Error;
    return { valid: false, error: `Invalid pattern: ${err.message}` };
  }

  return { valid: true };
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Match files against a glob pattern
 *
 * @param files - Array of file paths to match against
 * @param pattern - Glob pattern to match
 * @param limit - Maximum number of results to return
 * @returns Array of matching file paths (sorted alphabetically)
 */
export function matchPattern(files: string[], pattern: string, limit: number): string[] {
  const logger = getLogger();

  logger.debug('searchByPath', `Matching pattern "${pattern}" against ${files.length} files`);

  // Configure minimatch options
  const matchOptions = {
    // Enable ** to match across directory separators
    matchBase: false,
    // Case-sensitive matching
    nocase: false,
    // Enable ** patterns
    dot: true,
  };

  // Filter files by pattern
  const matches: string[] = [];

  for (const file of files) {
    if (minimatch(file, pattern, matchOptions)) {
      matches.push(file);
    }
  }

  // Sort alphabetically
  matches.sort((a, b) => a.localeCompare(b));

  logger.debug('searchByPath', `Found ${matches.length} matches`);

  // Apply limit
  return matches.slice(0, limit);
}

// ============================================================================
// Search Implementation
// ============================================================================

/**
 * Execute glob pattern search on the indexed files
 *
 * Searches the LanceDB index for files matching the provided glob pattern.
 * Pattern matching is case-sensitive.
 *
 * @param input - The search input containing pattern and optional limit
 * @param context - Tool context containing the project path
 * @returns Search results with matches and total count
 * @throws MCPError with INDEX_NOT_FOUND if no index exists for the project
 * @throws MCPError with INVALID_PATTERN for malformed glob patterns
 *
 * @example
 * ```typescript
 * const results = await searchByPath(
 *   { pattern: '**\/*.ts', limit: 20 },
 *   { projectPath: '/path/to/project' }
 * );
 *
 * console.log(results.matches); // ['src/index.ts', 'src/utils/hash.ts', ...]
 * console.log(results.totalMatches); // 45
 * ```
 */
export async function searchByPath(
  input: SearchByPathInput,
  context: ToolContext
): Promise<SearchByPathOutput> {
  const logger = getLogger();

  logger.info('searchByPath', 'Starting path search', {
    pattern: input.pattern,
    limit: input.limit,
    projectPath: context.projectPath,
  });

  // SECURITY: Validate pattern complexity to prevent ReDoS attacks
  const safetyCheck = isPatternSafe(input.pattern);
  if (!safetyCheck.valid) {
    logger.warn('searchByPath', 'Pattern failed safety check', {
      pattern: input.pattern,
      error: safetyCheck.error,
    });
    throw invalidPattern(input.pattern, safetyCheck.error || 'Pattern failed safety check');
  }

  // Validate the glob pattern syntax
  const validation = validateGlobPattern(input.pattern);
  if (!validation.valid) {
    logger.warn('searchByPath', 'Invalid pattern', {
      pattern: input.pattern,
      error: validation.error,
    });
    throw invalidPattern(input.pattern, validation.error || 'Unknown pattern error');
  }

  // Get the index path for this project
  const indexPath = getIndexPath(context.projectPath);

  // Check if index exists by looking for metadata
  const metadata = await loadMetadata(indexPath);
  if (!metadata) {
    logger.warn('searchByPath', 'Index not found', { indexPath });
    throw indexNotFound(indexPath);
  }

  // Verify project path matches
  if (metadata.projectPath !== context.projectPath) {
    logger.warn('searchByPath', 'Project path mismatch', {
      expected: context.projectPath,
      found: metadata.projectPath,
    });
    throw indexNotFound(indexPath);
  }

  // Open the LanceDB store
  const store = new LanceDBStore(indexPath);
  try {
    await store.open();

    // Get all indexed file paths
    const allFiles = await store.getIndexedFiles();

    logger.debug('searchByPath', `Retrieved ${allFiles.length} indexed files`);

    // If no files, return empty result
    if (allFiles.length === 0) {
      logger.info('searchByPath', 'No files in index');
      return {
        matches: [],
        totalMatches: 0,
      };
    }

    // Match files against the pattern (get all matches first for total count)
    const matchOptions = {
      matchBase: false,
      nocase: false,
      dot: true,
    };

    const allMatches: string[] = [];
    for (const file of allFiles) {
      if (minimatch(file, input.pattern, matchOptions)) {
        allMatches.push(file);
      }
    }

    // Sort alphabetically
    allMatches.sort((a, b) => a.localeCompare(b));

    const totalMatches = allMatches.length;

    // Apply limit
    const limitedMatches = allMatches.slice(0, input.limit);

    logger.info('searchByPath', 'Search completed', {
      totalMatches,
      returnedMatches: limitedMatches.length,
      pattern: input.pattern,
    });

    return {
      matches: limitedMatches,
      totalMatches,
    };
  } finally {
    // Always close the store
    await store.close();
  }
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for search_by_path
 *
 * This tool provides glob pattern file search over the code index.
 * It does NOT require confirmation as it's a read-only operation.
 */
export const searchByPathTool = {
  name: 'search_by_path',
  description: 'Find files by name or glob pattern',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: "Glob pattern to match (e.g., '**/auth*.ts', 'src/**/*.md')",
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (1-100, default 20)',
        default: 20,
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['pattern'],
  },
  requiresConfirmation: false,
};

