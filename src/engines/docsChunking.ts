/**
 * Docs Chunking Engine
 *
 * Provides prose-optimized chunking configuration for documentation files.
 * Uses larger chunks and more overlap than code to preserve context in prose content.
 *
 * Features:
 * - Prose-optimized chunk sizes (8000 chars with 2000 overlap)
 * - Markdown header-aware chunking for .md files (SMCP-099)
 * - Character-based fallback for .txt files
 *
 * Based on RFC Section 3.2.1: Chunking differences
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Chunk, type SplitOptions, chunkFile } from './chunking.js';
import {
  shouldUseMarkdownChunking,
  chunkMarkdownFile,
  type MarkdownChunkOptions,
  DEFAULT_MARKDOWN_CHUNK_OPTIONS,
} from './markdownChunking.js';
import { hashString } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { fileNotFound, MCPError, ErrorCode } from '../errors/index.js';

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
 * Options for doc file chunking
 */
export interface DocChunkOptions {
  /** Use markdown header chunking for .md files (default: true) */
  useMarkdownChunking?: boolean;
  /** Markdown chunk options (if using markdown chunking) */
  markdownOptions?: Partial<MarkdownChunkOptions>;
}

/**
 * Chunk a documentation file with prose-optimized parameters
 *
 * For .md files (SMCP-099):
 * - Uses markdown header-aware chunking
 * - Chunks align with section boundaries (h1-h6)
 * - Preserves header hierarchy in chunk metadata
 * - Sub-chunks large sections while maintaining context
 *
 * For .txt files:
 * - Uses character-based chunking with DOC_SPLIT_OPTIONS
 * - Larger chunks (8000 chars) with more overlap (2000 chars)
 *
 * @param absolutePath - Absolute path to the file on disk
 * @param relativePath - Relative path from project root (stored in chunk)
 * @param options - Optional chunking configuration
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
 * // For markdown files, chunks align with sections
 * console.log(chunks[0].metadata?.tags); // ['installation', 'section:installation']
 * ```
 */
export async function chunkDocFile(
  absolutePath: string,
  relativePath: string,
  options?: DocChunkOptions
): Promise<Chunk[]> {
  const logger = getLogger();
  const useMarkdown = options?.useMarkdownChunking !== false;

  // Check if we should use markdown-aware chunking
  if (useMarkdown && shouldUseMarkdownChunking(relativePath)) {
    logger.debug('DocsChunking', 'Using markdown header chunking', {
      path: relativePath,
    });

    try {
      // Read file content
      let content: string;
      try {
        content = await fs.promises.readFile(absolutePath, 'utf8');
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          throw fileNotFound(absolutePath);
        }
        if (nodeError.code === 'EACCES') {
          throw new MCPError({
            code: ErrorCode.PERMISSION_DENIED,
            userMessage: 'Access denied. Please check that you have permission to access this file.',
            developerMessage: `Permission denied reading file: ${absolutePath}`,
            cause: nodeError,
          });
        }
        throw new MCPError({
          code: ErrorCode.FILE_NOT_FOUND,
          userMessage: 'Failed to read the file.',
          developerMessage: `Failed to read file ${absolutePath}: ${nodeError.message}`,
          cause: nodeError,
        });
      }

      // Handle empty files
      if (!content || content.length === 0) {
        return [];
      }

      // Compute content hash
      const contentHash = hashString(content);

      // Use markdown header-aware chunking
      const chunks = chunkMarkdownFile(
        absolutePath,
        relativePath,
        content,
        contentHash,
        options?.markdownOptions
      );

      // If markdown chunking produced chunks, return them
      if (chunks.length > 0) {
        logger.debug('DocsChunking', 'Markdown chunking successful', {
          path: relativePath,
          chunkCount: chunks.length,
        });
        return chunks;
      }

      // Fall through to character-based chunking if no chunks produced
      // (e.g., file has no headers and minimal content)
      logger.debug('DocsChunking', 'Markdown chunking produced no chunks, falling back', {
        path: relativePath,
      });
    } catch (error) {
      // Re-throw MCPErrors
      if (error instanceof MCPError) {
        throw error;
      }

      // Log and fall back to character-based for other errors
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('DocsChunking', 'Markdown chunking failed, falling back to character-based', {
        path: relativePath,
        error: message,
      });
    }
  }

  // Fall back to character-based chunking
  return chunkFile(absolutePath, relativePath, DOC_SPLIT_OPTIONS);
}
