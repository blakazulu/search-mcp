/**
 * Search Result Processing Utilities
 *
 * Utilities for post-processing search results to reduce token count:
 * - Whitespace trimming: Remove leading/trailing blank lines from chunks
 * - Same-file deduplication: Merge adjacent/overlapping chunks from the same file
 * - Compact formatting: Shorter field names and combined location info
 *
 * These optimizations can reduce token usage by 25-35%.
 */

/**
 * Generic search result interface for processing
 */
export interface SearchResultItem {
  path: string;
  text: string;
  score: number;
  startLine: number;
  endLine: number;
}

/**
 * Trim leading and trailing blank lines from chunk text.
 *
 * Removes:
 * - Leading blank lines (lines containing only whitespace)
 * - Trailing blank lines (lines containing only whitespace)
 *
 * Preserves:
 * - Internal blank lines
 * - Indentation within the content
 *
 * @param text - The chunk text to trim
 * @returns The trimmed text
 *
 * @example
 * ```typescript
 * const input = "\n\n  function foo() {\n    return 42;\n  }\n\n";
 * const output = trimChunkWhitespace(input);
 * // output: "  function foo() {\n    return 42;\n  }"
 * ```
 */
export function trimChunkWhitespace(text: string): string {
  if (!text) return text;

  // Split into lines, preserving line content
  const lines = text.split('\n');

  // Find first non-blank line
  let startIndex = 0;
  while (startIndex < lines.length && lines[startIndex].trim() === '') {
    startIndex++;
  }

  // Find last non-blank line
  let endIndex = lines.length - 1;
  while (endIndex >= startIndex && lines[endIndex].trim() === '') {
    endIndex--;
  }

  // If all lines are blank, return empty string
  if (startIndex > endIndex) {
    return '';
  }

  // Join the trimmed lines
  return lines.slice(startIndex, endIndex + 1).join('\n');
}

/**
 * Check if two line ranges overlap or are adjacent.
 *
 * Ranges are considered mergeable if:
 * - They overlap (any shared lines)
 * - They are adjacent (end of one is immediately before start of another)
 *
 * @param range1Start - Start line of first range
 * @param range1End - End line of first range
 * @param range2Start - Start line of second range
 * @param range2End - End line of second range
 * @returns True if ranges can be merged
 */
export function areRangesMergeable(
  range1Start: number,
  range1End: number,
  range2Start: number,
  range2End: number
): boolean {
  // Adjacent: one ends right where the other begins (within 1 line)
  // Overlapping: ranges share at least one line
  const adjacencyThreshold = 1;

  // Range 1 is before range 2
  if (range1End < range2Start) {
    return range2Start - range1End <= adjacencyThreshold;
  }

  // Range 2 is before range 1
  if (range2End < range1Start) {
    return range1Start - range2End <= adjacencyThreshold;
  }

  // Ranges overlap
  return true;
}

/**
 * Merged chunk from the same file
 */
interface MergedChunk {
  text: string;
  startLine: number;
  endLine: number;
  score: number;
}

/**
 * Deduplicate search results by merging adjacent/overlapping chunks from the same file.
 *
 * Algorithm:
 * 1. Group results by file path
 * 2. For each file, sort chunks by start line
 * 3. Merge adjacent or overlapping chunks
 * 4. Use the highest score among merged chunks
 * 5. Flatten back to a single list, sorted by score
 *
 * This reduces token usage by:
 * - Eliminating redundant file path repetition
 * - Removing overlapping content
 * - Combining related code context
 *
 * @param results - Search results to deduplicate
 * @returns Deduplicated results
 */
export function deduplicateSameFileResults<T extends SearchResultItem>(
  results: T[]
): T[] {
  if (results.length === 0) return results;

  // Group by file path
  const byPath = new Map<string, T[]>();
  for (const result of results) {
    const existing = byPath.get(result.path);
    if (existing) {
      existing.push(result);
    } else {
      byPath.set(result.path, [result]);
    }
  }

  // Process each file group
  const deduplicated: T[] = [];

  for (const [filePath, fileResults] of byPath) {
    if (fileResults.length === 1) {
      // Single result for this file, no merging needed
      deduplicated.push(fileResults[0]);
      continue;
    }

    // Sort by start line for merging
    const sorted = [...fileResults].sort((a, b) => a.startLine - b.startLine);

    // Merge adjacent/overlapping chunks
    const merged: MergedChunk[] = [];
    let current: MergedChunk | null = null;

    for (const result of sorted) {
      if (current === null) {
        current = {
          text: result.text,
          startLine: result.startLine,
          endLine: result.endLine,
          score: result.score,
        };
        continue;
      }

      // Check if this result can be merged with current
      if (areRangesMergeable(current.startLine, current.endLine, result.startLine, result.endLine)) {
        // Merge: extend range, combine text if needed, keep best score
        const newStartLine = Math.min(current.startLine, result.startLine);
        const newEndLine = Math.max(current.endLine, result.endLine);

        // Smart text merging: avoid duplicating overlapping content
        const mergedText = mergeChunkText(
          current.text,
          result.text,
          current.startLine,
          current.endLine,
          result.startLine,
          result.endLine
        );

        current = {
          text: mergedText,
          startLine: newStartLine,
          endLine: newEndLine,
          score: Math.max(current.score, result.score),
        };
      } else {
        // Not mergeable, push current and start new
        merged.push(current);
        current = {
          text: result.text,
          startLine: result.startLine,
          endLine: result.endLine,
          score: result.score,
        };
      }
    }

    // Don't forget the last chunk
    if (current !== null) {
      merged.push(current);
    }

    // Convert merged chunks back to result format
    for (const chunk of merged) {
      // Create a new result object with merged data
      // Use the first result as a template to preserve any extra properties
      const template = sorted[0];
      deduplicated.push({
        ...template,
        path: filePath,
        text: chunk.text,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        score: chunk.score,
      } as T);
    }
  }

  // Sort final results by score (descending)
  deduplicated.sort((a, b) => b.score - a.score);

  return deduplicated;
}

/**
 * Merge two chunk texts intelligently, avoiding duplicating overlapping content.
 *
 * When chunks overlap:
 * - If chunk2 starts after chunk1 starts, append only the non-overlapping part
 * - If chunks are adjacent, concatenate with a newline
 *
 * @param text1 - First chunk text
 * @param text2 - Second chunk text
 * @param start1 - Start line of first chunk
 * @param end1 - End line of first chunk
 * @param start2 - Start line of second chunk
 * @param end2 - End line of second chunk
 * @returns Merged text
 */
function mergeChunkText(
  text1: string,
  text2: string,
  start1: number,
  end1: number,
  start2: number,
  end2: number
): string {
  // If chunk2 starts after chunk1 ends (adjacent), just concatenate
  if (start2 > end1) {
    return text1 + '\n' + text2;
  }

  // If chunk2 is completely within chunk1, just use chunk1
  if (start2 >= start1 && end2 <= end1) {
    return text1;
  }

  // If chunk1 is completely within chunk2, just use chunk2
  if (start1 >= start2 && end1 <= end2) {
    return text2;
  }

  // Overlapping: chunk2 extends beyond chunk1
  // Calculate how many lines of text2 are already in text1
  const overlapLines = end1 - start2 + 1;

  if (overlapLines > 0) {
    const lines2 = text2.split('\n');
    // Skip the overlapping lines from text2
    const newPart = lines2.slice(overlapLines).join('\n');
    if (newPart) {
      return text1 + '\n' + newPart;
    }
    return text1;
  }

  // Fallback: just concatenate
  return text1 + '\n' + text2;
}

/**
 * Process search results with both trimming and deduplication.
 *
 * This is the main entry point for optimizing search results.
 * Applies both optimizations in order:
 * 1. Trim whitespace from each chunk
 * 2. Deduplicate same-file results
 *
 * @param results - Raw search results
 * @returns Optimized results with reduced token count
 */
export function processSearchResults<T extends SearchResultItem>(
  results: T[]
): T[] {
  if (results.length === 0) return results;

  // Step 1: Trim whitespace from all chunks
  const trimmed = results.map((result) => ({
    ...result,
    text: trimChunkWhitespace(result.text),
  }));

  // Step 2: Deduplicate same-file results
  const deduplicated = deduplicateSameFileResults(trimmed);

  return deduplicated;
}

// ============================================================================
// Compact Output Format
// ============================================================================

/**
 * Compact search result with shortened field names.
 *
 * Field name mappings:
 * - l (loc): Combined path + line range (e.g., "src/errors/index.ts:317-355")
 * - t (text): Chunk content text
 * - s (score): Similarity score rounded to 2 decimal places
 */
export interface CompactSearchResult {
  /** Location: path:startLine-endLine */
  l: string;
  /** Text content */
  t: string;
  /** Score (rounded to 2 decimal places) */
  s: number;
}

/**
 * Compact search output with shortened field names.
 *
 * Field name mappings:
 * - r (results): Array of compact results
 * - n (count): Total number of results
 * - ms (searchTimeMs): Search time in milliseconds
 * - w (warning): Optional warning message
 */
export interface CompactSearchOutput {
  /** Results array */
  r: CompactSearchResult[];
  /** Count of results */
  n: number;
  /** Search time in milliseconds */
  ms: number;
  /** Optional warning */
  w?: string;
}

/**
 * Format a single search result in compact format.
 *
 * Combines path and line numbers into a single `loc` field,
 * rounds score to 2 decimal places, and uses short field names.
 *
 * @param result - The search result to format
 * @returns Compact formatted result
 *
 * @example
 * ```typescript
 * const compact = formatCompactResult({
 *   path: 'src/utils/hash.ts',
 *   text: 'function hash() { ... }',
 *   score: 0.87654321,
 *   startLine: 10,
 *   endLine: 25,
 * });
 * // Result: { l: 'src/utils/hash.ts:10-25', t: 'function hash() { ... }', s: 0.88 }
 * ```
 */
export function formatCompactResult(result: SearchResultItem): CompactSearchResult {
  // Combine path and line range into location string
  const loc = `${result.path}:${result.startLine}-${result.endLine}`;

  return {
    l: loc,
    t: result.text,
    s: Math.round(result.score * 100) / 100, // Round to 2 decimal places
  };
}

/**
 * Format search results array in compact format.
 *
 * @param results - Array of search results
 * @returns Array of compact formatted results
 */
export function formatCompactResults(results: SearchResultItem[]): CompactSearchResult[] {
  return results.map(formatCompactResult);
}

/**
 * Format the full search output in compact format.
 *
 * @param results - Processed search results
 * @param searchTimeMs - Search time in milliseconds
 * @param warning - Optional warning message
 * @returns Compact formatted output
 *
 * @example
 * ```typescript
 * const output = formatCompactOutput(results, 45);
 * // Result: { r: [...], n: 10, ms: 45 }
 * ```
 */
export function formatCompactOutput(
  results: SearchResultItem[],
  searchTimeMs: number,
  warning?: string
): CompactSearchOutput {
  const output: CompactSearchOutput = {
    r: formatCompactResults(results),
    n: results.length,
    ms: searchTimeMs,
  };

  if (warning) {
    output.w = warning;
  }

  return output;
}
