/**
 * Docs Chunking Engine
 *
 * Provides prose-optimized chunking configuration for documentation files.
 * Uses larger chunks and more overlap than code to preserve context in prose content.
 *
 * Based on RFC Section 3.2.1: Chunking differences
 */

import * as path from 'node:path';
import { type Chunk, type SplitOptions, chunkFile } from './chunking.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * File extensions recognized as documentation files
 */
export const DOC_FILE_EXTENSIONS = ['.md', '.txt'];

/**
 * Glob patterns for finding documentation files
 */
export const DOC_FILE_PATTERNS = ['**/*.md', '**/*.txt'];

/**
 * Prose-optimized chunking parameters
 *
 * - chunkSize: ~2000 tokens = ~8000 characters (larger for prose)
 * - chunkOverlap: ~500 tokens = ~2000 characters (more overlap for context)
 * - separators: includes '. ' for sentence boundaries in prose
 */
export const DOC_SPLIT_OPTIONS: SplitOptions = {
  chunkSize: 8000,
  chunkOverlap: 2000,
  separators: ['\n\n', '\n', '. ', ' ', ''],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file is a documentation file based on its extension
 *
 * @param relativePath - Relative path to the file (or just filename)
 * @returns True if the file is a documentation file (.md or .txt)
 *
 * @example
 * ```typescript
 * isDocFile('README.md');           // true
 * isDocFile('docs/guide.txt');      // true
 * isDocFile('src/index.ts');        // false
 * isDocFile('NOTES.MD');            // true (case-insensitive)
 * ```
 */
export function isDocFile(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return DOC_FILE_EXTENSIONS.includes(ext);
}

// ============================================================================
// File Chunking
// ============================================================================

/**
 * Chunk a documentation file with prose-optimized parameters
 *
 * Convenience function that wraps chunkFile with DOC_SPLIT_OPTIONS.
 * Creates larger chunks with more overlap suitable for prose content.
 *
 * @param absolutePath - Absolute path to the file on disk
 * @param relativePath - Relative path from project root (stored in chunk)
 * @returns Promise resolving to array of chunks with IDs and metadata
 * @throws MCPError with FILE_NOT_FOUND if file doesn't exist
 * @throws MCPError with PERMISSION_DENIED if file can't be read
 *
 * @example
 * ```typescript
 * const chunks = await chunkDocFile(
 *   '/Users/dev/project/docs/README.md',
 *   'docs/README.md'
 * );
 * console.log(chunks[0].id);        // 'a1b2c3d4-...'
 * console.log(chunks[0].path);      // 'docs/README.md'
 * console.log(chunks[0].startLine); // 1
 * ```
 */
export async function chunkDocFile(
  absolutePath: string,
  relativePath: string
): Promise<Chunk[]> {
  return chunkFile(absolutePath, relativePath, DOC_SPLIT_OPTIONS);
}
