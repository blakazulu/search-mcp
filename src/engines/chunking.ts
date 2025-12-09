/**
 * Chunking Engine
 *
 * Implements text chunking for splitting source files into indexable segments.
 * Uses recursive character text splitting with configurable chunk size and overlap.
 * Tracks line numbers for each chunk to enable navigation.
 *
 * Based on RFC Section 5.3: Chunking Engine
 */

import * as fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { hashString } from '../utils/hash.js';
import { fileNotFound, MCPError, ErrorCode } from '../errors/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * A chunk of text from a source file
 */
export interface Chunk {
  /** UUIDv4 unique identifier for the chunk */
  id: string;
  /** Chunk text content */
  text: string;
  /** Source file path (relative to project root) */
  path: string;
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
  /** SHA256 hash of the source file content */
  contentHash: string;
}

/**
 * Configuration options for text splitting
 */
export interface SplitOptions {
  /** Target chunk size in characters (~4000 for ~1000 tokens) */
  chunkSize: number;
  /** Overlap size in characters (~800 for ~200 tokens) */
  chunkOverlap: number;
  /** Separators to use for splitting in priority order */
  separators: string[];
}

/**
 * Internal chunk structure with line number tracking
 */
export interface ChunkWithLines {
  /** Chunk text content */
  text: string;
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default split options as specified in the RFC
 *
 * - chunkSize: ~1000 tokens = ~4000 characters (1 token ~ 4 chars)
 * - chunkOverlap: ~200 tokens = ~800 characters
 * - separators: paragraph breaks, line breaks, spaces, then character-level
 */
export const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  chunkSize: 4000,
  chunkOverlap: 800,
  separators: ['\n\n', '\n', ' ', ''],
};

// ============================================================================
// Text Splitting Functions
// ============================================================================

/**
 * Split text recursively using separators in priority order
 *
 * Tries each separator in order until chunks are small enough.
 * Falls back to character-level splitting if no separator works.
 *
 * @param text - The text to split
 * @param options - Split configuration options
 * @returns Array of text chunks
 *
 * @example
 * ```typescript
 * const chunks = splitText(fileContent);
 * // Each chunk is ~4000 characters with ~800 character overlap
 * ```
 */
export function splitText(
  text: string,
  options?: Partial<SplitOptions>
): string[] {
  const opts = { ...DEFAULT_SPLIT_OPTIONS, ...options };

  // Handle edge cases
  if (!text || text.length === 0) {
    return [];
  }

  // If text is already small enough, return as single chunk
  if (text.length <= opts.chunkSize) {
    return [text];
  }

  // Recursively split the text
  return recursiveSplit(text, opts.separators, opts.chunkSize, opts.chunkOverlap);
}

/**
 * Internal recursive split implementation
 *
 * @param text - Text to split
 * @param separators - Remaining separators to try
 * @param chunkSize - Target chunk size
 * @param chunkOverlap - Overlap between chunks
 * @returns Array of text chunks
 */
function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  // If no separators left, split at character boundary
  if (separators.length === 0) {
    return splitAtCharacterBoundary(text, chunkSize, chunkOverlap);
  }

  const separator = separators[0];
  const remainingSeparators = separators.slice(1);

  // Empty separator means character-level split
  if (separator === '') {
    return splitAtCharacterBoundary(text, chunkSize, chunkOverlap);
  }

  // Split by current separator
  const parts = text.split(separator);

  // If only one part (separator not found), try next separator
  if (parts.length === 1) {
    return recursiveSplit(text, remainingSeparators, chunkSize, chunkOverlap);
  }

  // Merge parts back into chunks of appropriate size
  return mergeSplitsIntoChunks(parts, separator, chunkSize, chunkOverlap, remainingSeparators);
}

/**
 * Merge split parts into chunks with overlap
 *
 * @param parts - Split text parts
 * @param separator - Separator used for splitting
 * @param chunkSize - Target chunk size
 * @param chunkOverlap - Overlap between chunks
 * @param remainingSeparators - Remaining separators for recursive splitting
 * @returns Array of merged chunks
 */
function mergeSplitsIntoChunks(
  parts: string[],
  separator: string,
  chunkSize: number,
  chunkOverlap: number,
  remainingSeparators: string[]
): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let overlapBuffer: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partWithSeparator = i < parts.length - 1 ? part + separator : part;

    // Check if adding this part would exceed chunk size
    const potentialChunk = currentChunk + partWithSeparator;

    if (potentialChunk.length <= chunkSize) {
      // Part fits, add it to current chunk
      currentChunk = potentialChunk;
      overlapBuffer.push(partWithSeparator);
    } else {
      // Part doesn't fit, finalize current chunk and start new one
      if (currentChunk.length > 0) {
        // If current chunk is still too large, split it recursively
        if (currentChunk.length > chunkSize) {
          const subChunks = recursiveSplit(currentChunk, remainingSeparators, chunkSize, chunkOverlap);
          chunks.push(...subChunks);
        } else {
          chunks.push(currentChunk);
        }

        // Calculate overlap for next chunk
        currentChunk = calculateOverlapStart(overlapBuffer, chunkOverlap, separator);
        overlapBuffer = [];
      }

      // Add current part to new chunk
      const newChunk = currentChunk + partWithSeparator;
      if (newChunk.length <= chunkSize) {
        currentChunk = newChunk;
        overlapBuffer.push(partWithSeparator);
      } else {
        // Single part is larger than chunk size, need to split it further
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }
        // Recursively split the large part
        const subChunks = recursiveSplit(partWithSeparator, remainingSeparators, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
        currentChunk = '';
        overlapBuffer = [];
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    if (currentChunk.length > chunkSize) {
      const subChunks = recursiveSplit(currentChunk, remainingSeparators, chunkSize, chunkOverlap);
      chunks.push(...subChunks);
    } else {
      chunks.push(currentChunk);
    }
  }

  return chunks;
}

/**
 * Calculate the overlap start for the next chunk
 *
 * @param overlapBuffer - Recent parts added to the chunk
 * @param chunkOverlap - Target overlap size
 * @param separator - Separator to use when joining
 * @returns Text to start the next chunk with
 */
function calculateOverlapStart(
  overlapBuffer: string[],
  chunkOverlap: number,
  separator: string
): string {
  if (overlapBuffer.length === 0 || chunkOverlap === 0) {
    return '';
  }

  // Build overlap from the end of the buffer
  let overlap = '';
  for (let i = overlapBuffer.length - 1; i >= 0; i--) {
    const part = overlapBuffer[i];
    const newOverlap = part + overlap;
    if (newOverlap.length > chunkOverlap) {
      break;
    }
    overlap = newOverlap;
  }

  return overlap;
}

/**
 * Split text at character boundaries when no separator works
 *
 * @param text - Text to split
 * @param chunkSize - Target chunk size
 * @param chunkOverlap - Overlap between chunks
 * @returns Array of character-level chunks
 */
function splitAtCharacterBoundary(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));

    // Move start forward by (chunkSize - overlap)
    start = end - chunkOverlap;

    // Avoid infinite loop if overlap >= chunkSize
    if (start >= end) {
      start = end;
    }
  }

  return chunks;
}

// ============================================================================
// Line Number Tracking
// ============================================================================

/**
 * Split text with line number tracking for each chunk
 *
 * Each chunk includes start and end line numbers (1-based) to enable
 * navigation back to the source file.
 *
 * @param text - The text to split
 * @param options - Split configuration options
 * @returns Array of chunks with line number information
 *
 * @example
 * ```typescript
 * const chunks = splitWithLineNumbers(fileContent);
 * console.log(chunks[0].startLine); // 1
 * console.log(chunks[0].endLine);   // 42
 * ```
 */
export function splitWithLineNumbers(
  text: string,
  options?: Partial<SplitOptions>
): ChunkWithLines[] {
  // Handle edge cases
  if (!text || text.length === 0) {
    return [];
  }

  // Get text chunks
  const textChunks = splitText(text, options);

  if (textChunks.length === 0) {
    return [];
  }

  // Calculate line numbers for each chunk
  const chunksWithLines: ChunkWithLines[] = [];
  let searchStartIndex = 0;

  for (const chunkText of textChunks) {
    // Find where this chunk starts in the original text
    // Due to overlap, chunks can start before the previous chunk ended
    const chunkStart = findChunkPosition(text, chunkText, searchStartIndex);

    if (chunkStart === -1) {
      // Fallback: if we can't find exact position, estimate based on previous chunk
      const prevChunk = chunksWithLines[chunksWithLines.length - 1];
      const prevEndLine = prevChunk ? prevChunk.endLine : 0;
      const lineCount = countLines(chunkText);

      chunksWithLines.push({
        text: chunkText,
        startLine: prevEndLine + 1,
        endLine: prevEndLine + lineCount,
      });
    } else {
      // Calculate line numbers
      const startLine = countLinesUntilPosition(text, chunkStart) + 1;
      const endLine = startLine + countLines(chunkText) - 1;

      chunksWithLines.push({
        text: chunkText,
        startLine,
        endLine,
      });

      // Update search start to allow for overlap
      // We search from a position that allows overlap
      const opts = { ...DEFAULT_SPLIT_OPTIONS, ...options };
      searchStartIndex = Math.max(0, chunkStart + chunkText.length - opts.chunkOverlap);
    }
  }

  return chunksWithLines;
}

/**
 * Find the position of a chunk in the original text
 *
 * @param text - Original text
 * @param chunk - Chunk to find
 * @param startIndex - Index to start searching from
 * @returns Position of chunk or -1 if not found
 */
function findChunkPosition(text: string, chunk: string, startIndex: number): number {
  // For overlapping chunks, we need to search from before the expected position
  const searchStart = Math.max(0, startIndex - chunk.length);
  return text.indexOf(chunk, searchStart);
}

/**
 * Count lines in text (handles different line endings)
 *
 * @param text - Text to count lines in
 * @returns Number of lines (minimum 1)
 */
function countLines(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // Count newlines and add 1 (for the last line without newline)
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      count++;
    }
  }

  // If text ends with newline, don't count extra line
  if (text.endsWith('\n')) {
    count--;
  }

  return Math.max(1, count);
}

/**
 * Count lines from start of text until a given position
 *
 * @param text - Text to search
 * @param position - Position to count until
 * @returns Number of lines (0-based count)
 */
function countLinesUntilPosition(text: string, position: number): number {
  let count = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === '\n') {
      count++;
    }
  }
  return count;
}

// ============================================================================
// File Chunking
// ============================================================================

/**
 * Chunk a file into indexable segments
 *
 * Reads the file, splits it into chunks, and assigns UUIDs and metadata
 * to each chunk. The content hash is computed for the entire file content.
 *
 * @param absolutePath - Absolute path to the file on disk
 * @param relativePath - Relative path from project root (stored in chunk)
 * @param options - Optional split configuration
 * @returns Promise resolving to array of chunks with IDs and metadata
 * @throws MCPError with FILE_NOT_FOUND if file doesn't exist
 * @throws MCPError with PERMISSION_DENIED if file can't be read
 *
 * @example
 * ```typescript
 * const chunks = await chunkFile(
 *   '/Users/dev/project/src/index.ts',
 *   'src/index.ts'
 * );
 * console.log(chunks[0].id);        // 'a1b2c3d4-...'
 * console.log(chunks[0].path);      // 'src/index.ts'
 * console.log(chunks[0].startLine); // 1
 * ```
 */
export async function chunkFile(
  absolutePath: string,
  relativePath: string,
  options?: Partial<SplitOptions>
): Promise<Chunk[]> {
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

  // Compute content hash for the entire file
  const contentHash = hashString(content);

  // Split with line numbers
  const chunksWithLines = splitWithLineNumbers(content, options);

  // Create full chunk objects with UUIDs
  const chunks: Chunk[] = chunksWithLines.map((chunk) => ({
    id: uuidv4(),
    text: chunk.text,
    path: relativePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    contentHash,
  }));

  return chunks;
}

/**
 * Chunk a file synchronously
 *
 * Use this only when async is not possible.
 * Prefer chunkFile for normal operations.
 *
 * @param absolutePath - Absolute path to the file on disk
 * @param relativePath - Relative path from project root (stored in chunk)
 * @param options - Optional split configuration
 * @returns Array of chunks with IDs and metadata
 * @throws MCPError with FILE_NOT_FOUND if file doesn't exist
 */
export function chunkFileSync(
  absolutePath: string,
  relativePath: string,
  options?: Partial<SplitOptions>
): Chunk[] {
  // Read file content
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
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

  // Compute content hash for the entire file
  const contentHash = hashString(content);

  // Split with line numbers
  const chunksWithLines = splitWithLineNumbers(content, options);

  // Create full chunk objects with UUIDs
  const chunks: Chunk[] = chunksWithLines.map((chunk) => ({
    id: uuidv4(),
    text: chunk.text,
    path: relativePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    contentHash,
  }));

  return chunks;
}
