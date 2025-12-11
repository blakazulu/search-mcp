/**
 * Comparison Metrics Utilities
 *
 * Provides utilities for comparing MCP search against baseline approaches:
 * - Manual Grep + Read
 * - Drag-and-Drop (file attachment)
 *
 * Used to measure efficiency ratios and validate MCP's value proposition.
 *
 * @module tests/configs/comparisonMetrics
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of simulating a grep search
 */
export interface GrepResult {
  /** Files that matched the patterns */
  files: string[];

  /** Number of files matched */
  filesMatched: number;

  /** Total number of pattern matches across all files */
  totalMatches: number;

  /** Total characters if all matched files were read */
  totalChars: number;

  /** Estimated tokens (chars / 4) */
  estimatedTokens: number;

  /** Patterns used for search */
  patterns: string[];
}

/**
 * Result of simulating drag-and-drop approach
 */
export interface DragDropResult {
  /** Files that would need to be attached */
  files: string[];

  /** Number of files needed */
  filesCount: number;

  /** Total characters in those files */
  totalChars: number;

  /** Estimated tokens */
  estimatedTokens: number;

  /** User effort rating */
  userEffort: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';

  /** File names that were searched for */
  searchedFor: string[];
}

/**
 * MCP search result summary for comparison
 */
export interface MCPResult {
  /** Number of results returned */
  resultCount: number;

  /** Raw results before deduplication */
  rawResultCount?: number;

  /** Total characters in results */
  totalChars: number;

  /** Estimated tokens */
  estimatedTokens: number;

  /** Search time in milliseconds */
  searchTimeMs: number;

  /** Relevance rating */
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Comparison between all three approaches
 */
export interface ComparisonResult {
  /** The query being compared */
  query: string;

  /** Query type */
  queryType: string;

  /** MCP results */
  mcp: MCPResult;

  /** Grep baseline */
  grep: GrepResult;

  /** Drag-and-drop baseline */
  dragDrop: DragDropResult;

  /** Efficiency ratios */
  efficiency: {
    /** MCP tokens vs Grep tokens (e.g., 20.5x means Grep uses 20.5x more) */
    mcpVsGrep: number;

    /** MCP tokens vs D&D tokens */
    mcpVsDragDrop: number;

    /** Tool calls saved (grep would need 1 + files matched) */
    toolCallsSaved: number;
  };

  /** Deduplication stats */
  deduplication?: {
    rawResults: number;
    afterDedup: number;
    reduction: string;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate token count from character count
 */
export function estimateTokens(chars: number): number {
  return Math.round(chars / 4);
}

/**
 * Get all TypeScript/JavaScript files in a directory
 */
async function getAllCodeFiles(dir: string): Promise<string[]> {
  const pattern = path.join(dir, '**/*.{ts,js,tsx,jsx}').replace(/\\/g, '/');
  return glob(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  });
}

/**
 * Calculate total file size for a list of files
 */
function calculateTotalChars(files: string[]): number {
  let total = 0;
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        total += fs.statSync(file).size;
      }
    } catch {
      // Skip files that can't be read
    }
  }
  return total;
}

/**
 * Determine user effort based on number of files and their distribution
 */
function determineUserEffort(
  filesNeeded: number,
  filesFound: number,
  searchedFor: number
): 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH' {
  // If we couldn't find many files the user wanted, effort is higher
  const findRate = filesFound / searchedFor;

  if (filesNeeded <= 2 && findRate > 0.8) return 'LOW';
  if (filesNeeded <= 4 && findRate > 0.6) return 'MEDIUM';
  if (filesNeeded <= 6 && findRate > 0.4) return 'HIGH';
  return 'VERY HIGH';
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Simulate a grep search to find files matching patterns
 *
 * @param dir - Directory to search in
 * @param patterns - Regex patterns to search for
 * @returns Grep simulation result
 *
 * @example
 * ```typescript
 * const result = await simulateGrep('/path/to/project', ['watch', 'chokidar']);
 * console.log(`Found ${result.filesMatched} files with ${result.totalMatches} matches`);
 * console.log(`Would require ${result.estimatedTokens} tokens to read all`);
 * ```
 */
export async function simulateGrep(
  dir: string,
  patterns: string[]
): Promise<GrepResult> {
  const allFiles = await getAllCodeFiles(dir);
  const matchedFiles = new Set<string>();
  let totalMatches = 0;

  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');

      for (const pattern of patterns) {
        try {
          const regex = new RegExp(pattern, 'gi');
          const matches = content.match(regex);
          if (matches && matches.length > 0) {
            matchedFiles.add(file);
            totalMatches += matches.length;
          }
        } catch {
          // Invalid regex, try as literal string
          if (content.toLowerCase().includes(pattern.toLowerCase())) {
            matchedFiles.add(file);
            totalMatches += 1;
          }
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  const files = Array.from(matchedFiles);
  const totalChars = calculateTotalChars(files);

  return {
    files,
    filesMatched: files.length,
    totalMatches,
    totalChars,
    estimatedTokens: estimateTokens(totalChars),
    patterns,
  };
}

/**
 * Calculate tokens if all matched files were read (grep baseline)
 *
 * @param files - Array of file paths
 * @returns Total estimated tokens
 */
export function calculateGrepTokens(files: string[]): number {
  const totalChars = calculateTotalChars(files);
  return estimateTokens(totalChars);
}

/**
 * Find files by name patterns (for drag-and-drop simulation)
 *
 * @param dir - Directory to search in
 * @param fileNames - File names or patterns to find
 * @returns Array of found file paths
 *
 * @example
 * ```typescript
 * const files = await findDragDropFiles('/project', ['config.ts', 'auth/']);
 * console.log(`Found ${files.length} files to attach`);
 * ```
 */
export async function findDragDropFiles(
  dir: string,
  fileNames: string[]
): Promise<string[]> {
  const allFiles = await getAllCodeFiles(dir);
  const found: string[] = [];

  for (const file of allFiles) {
    const basename = path.basename(file);
    const relativePath = file.replace(/\\/g, '/');

    for (const name of fileNames) {
      // Match against filename OR path (for directory-based patterns)
      if (
        basename.toLowerCase().includes(name.toLowerCase()) ||
        relativePath.toLowerCase().includes(name.toLowerCase())
      ) {
        if (!found.includes(file)) {
          found.push(file);
        }
        break;
      }
    }
  }

  return found;
}

/**
 * Calculate tokens for drag-and-drop approach
 *
 * @param files - Array of file paths
 * @returns Total estimated tokens
 */
export function calculateDragDropTokens(files: string[]): number {
  const totalChars = calculateTotalChars(files);
  return estimateTokens(totalChars);
}

/**
 * Simulate drag-and-drop file attachment
 *
 * @param dir - Directory to search in
 * @param relevantFiles - File names/patterns that a knowledgeable user would attach
 * @returns Drag-and-drop simulation result
 */
export async function simulateDragDrop(
  dir: string,
  relevantFiles: string[]
): Promise<DragDropResult> {
  const files = await findDragDropFiles(dir, relevantFiles);
  const totalChars = calculateTotalChars(files);

  return {
    files,
    filesCount: files.length,
    totalChars,
    estimatedTokens: estimateTokens(totalChars),
    userEffort: determineUserEffort(files.length, files.length, relevantFiles.length),
    searchedFor: relevantFiles,
  };
}

/**
 * Compare MCP search against baseline approaches
 *
 * @param mcp - MCP search results
 * @param grep - Grep simulation results
 * @param dragDrop - Drag-and-drop simulation results
 * @param query - The query string
 * @param queryType - The query type
 * @returns Full comparison result
 *
 * @example
 * ```typescript
 * const comparison = compareApproaches(
 *   { resultCount: 8, totalChars: 36000, estimatedTokens: 9000, searchTimeMs: 18, relevance: 'HIGH' },
 *   await simulateGrep(dir, ['watch', 'file']),
 *   await simulateDragDrop(dir, ['fileWatcher.ts']),
 *   'how does file watching work',
 *   'Conceptual'
 * );
 * console.log(`MCP is ${comparison.efficiency.mcpVsGrep}x more efficient than grep`);
 * ```
 */
export function compareApproaches(
  mcp: MCPResult,
  grep: GrepResult,
  dragDrop: DragDropResult,
  query: string,
  queryType: string
): ComparisonResult {
  const mcpVsGrep =
    mcp.estimatedTokens > 0
      ? Math.round((grep.estimatedTokens / mcp.estimatedTokens) * 10) / 10
      : 0;

  const mcpVsDragDrop =
    mcp.estimatedTokens > 0
      ? Math.round((dragDrop.estimatedTokens / mcp.estimatedTokens) * 10) / 10
      : 0;

  // Grep would need 1 search + reading each matched file
  const toolCallsSaved = grep.filesMatched;

  const result: ComparisonResult = {
    query,
    queryType,
    mcp,
    grep,
    dragDrop,
    efficiency: {
      mcpVsGrep,
      mcpVsDragDrop,
      toolCallsSaved,
    },
  };

  // Add deduplication stats if available
  if (mcp.rawResultCount !== undefined && mcp.rawResultCount !== mcp.resultCount) {
    const reduction = Math.round(
      ((mcp.rawResultCount - mcp.resultCount) / mcp.rawResultCount) * 100
    );
    result.deduplication = {
      rawResults: mcp.rawResultCount,
      afterDedup: mcp.resultCount,
      reduction: `-${reduction}%`,
    };
  }

  return result;
}

/**
 * Generate a summary table row for a comparison
 *
 * @param comparison - Comparison result
 * @param index - Row index (1-based)
 * @returns Markdown table row
 */
export function formatComparisonRow(
  comparison: ComparisonResult,
  index: number
): string {
  const mcpVsGrep =
    comparison.efficiency.mcpVsGrep >= 1
      ? `**${comparison.efficiency.mcpVsGrep}x**`
      : `${comparison.efficiency.mcpVsGrep}x`;

  const mcpVsDragDrop =
    comparison.efficiency.mcpVsDragDrop >= 1
      ? `**${comparison.efficiency.mcpVsDragDrop}x**`
      : `${comparison.efficiency.mcpVsDragDrop}x*`;

  return `| ${index}. ${comparison.queryType} | ${comparison.mcp.estimatedTokens.toLocaleString()} | ${comparison.grep.estimatedTokens.toLocaleString()} | ${comparison.dragDrop.estimatedTokens.toLocaleString()} | ${mcpVsGrep} | ${mcpVsDragDrop} |`;
}

/**
 * Calculate totals across multiple comparisons
 *
 * @param comparisons - Array of comparison results
 * @returns Totals object
 */
export function calculateComparisonTotals(comparisons: ComparisonResult[]): {
  mcpTokens: number;
  grepTokens: number;
  dragDropTokens: number;
  mcpVsGrep: number;
  mcpVsDragDrop: number;
  avgSearchTimeMs: number;
} {
  const mcpTokens = comparisons.reduce((sum, c) => sum + c.mcp.estimatedTokens, 0);
  const grepTokens = comparisons.reduce((sum, c) => sum + c.grep.estimatedTokens, 0);
  const dragDropTokens = comparisons.reduce(
    (sum, c) => sum + c.dragDrop.estimatedTokens,
    0
  );
  const avgSearchTimeMs =
    comparisons.reduce((sum, c) => sum + c.mcp.searchTimeMs, 0) / comparisons.length;

  return {
    mcpTokens,
    grepTokens,
    dragDropTokens,
    mcpVsGrep: Math.round((grepTokens / mcpTokens) * 10) / 10,
    mcpVsDragDrop: Math.round((dragDropTokens / mcpTokens) * 10) / 10,
    avgSearchTimeMs: Math.round(avgSearchTimeMs),
  };
}
