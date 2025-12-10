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
import * as readline from 'node:readline';
import * as crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { hashString } from '../utils/hash.js';
import { fileNotFound, MCPError, ErrorCode } from '../errors/index.js';
import { getLogger } from '../utils/logger.js';
import { isSymlink } from '../utils/secureFileAccess.js';
import {
  MAX_CHUNKS_PER_FILE,
  CHUNKS_WARNING_THRESHOLD,
  ResourceLimitError,
} from '../utils/limits.js';

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

/**
 * Maximum file size to read entirely into memory (MCP-26)
 * Files larger than this will be processed with streaming
 */
export const MAX_IN_MEMORY_SIZE = 10 * 1024 * 1024; // 10MB

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
 * @param maxChunks - Maximum number of chunks allowed (default: MAX_CHUNKS_PER_FILE)
 * @returns Array of text chunks
 * @throws ResourceLimitError if chunk count exceeds maxChunks
 *
 * @example
 * ```typescript
 * const chunks = splitText(fileContent);
 * // Each chunk is ~4000 characters with ~800 character overlap
 * ```
 */
export function splitText(
  text: string,
  options?: Partial<SplitOptions>,
  maxChunks: number = MAX_CHUNKS_PER_FILE
): string[] {
  const logger = getLogger();
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
  const chunks = recursiveSplit(text, opts.separators, opts.chunkSize, opts.chunkOverlap);

  // Check chunk count limit
  if (chunks.length > maxChunks) {
    throw new ResourceLimitError(
      'CHUNKS_PER_FILE',
      chunks.length,
      maxChunks,
      `File produces too many chunks: ${chunks.length} > ${maxChunks}. This may indicate a malformed or excessively large file.`
    );
  }

  // Warn if approaching limit
  if (chunks.length > CHUNKS_WARNING_THRESHOLD) {
    logger.warn('Chunking', 'File produces many chunks, approaching limit', {
      chunkCount: chunks.length,
      maxChunks,
      warningThreshold: CHUNKS_WARNING_THRESHOLD,
    });
  }

  return chunks;
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
 * @param maxChunks - Maximum number of chunks allowed (default: MAX_CHUNKS_PER_FILE)
 * @returns Array of chunks with line number information
 * @throws ResourceLimitError if chunk count exceeds maxChunks
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
  options?: Partial<SplitOptions>,
  maxChunks: number = MAX_CHUNKS_PER_FILE
): ChunkWithLines[] {
  // Handle edge cases
  if (!text || text.length === 0) {
    return [];
  }

  // Get text chunks (limit is enforced in splitText)
  const textChunks = splitText(text, options, maxChunks);

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
 * Chunk a large file using streaming to avoid memory explosion (MCP-26)
 *
 * This function processes files line by line to avoid loading the entire
 * file into memory at once. It's used for files larger than MAX_IN_MEMORY_SIZE.
 *
 * @param absolutePath - Absolute path to the file on disk
 * @param relativePath - Relative path from project root (stored in chunk)
 * @param fileSize - Size of the file in bytes
 * @param options - Optional split configuration
 * @param maxChunks - Maximum number of chunks allowed (default: MAX_CHUNKS_PER_FILE)
 * @returns Promise resolving to array of chunks with IDs and metadata
 * @throws ResourceLimitError if chunk count exceeds maxChunks
 */
async function chunkLargeFile(
  absolutePath: string,
  relativePath: string,
  fileSize: number,
  options?: Partial<SplitOptions>,
  maxChunks: number = MAX_CHUNKS_PER_FILE
): Promise<Chunk[]> {
  const logger = getLogger();
  const opts = { ...DEFAULT_SPLIT_OPTIONS, ...options };

  logger.info('Chunking', `Streaming large file (${Math.round(fileSize / 1024 / 1024)}MB)`, {
    path: relativePath,
    size: fileSize,
  });

  // SECURITY: Check for symlinks before streaming
  if (await isSymlink(absolutePath)) {
    logger.warn('Chunking', 'Skipping symlink during chunking', { path: absolutePath });
    return []; // Skip symlinks during indexing
  }

  // Create hash for streaming computation
  const hash = crypto.createHash('sha256');

  // Read file line by line and build chunks
  const chunks: Chunk[] = [];
  let currentChunkText = '';
  let currentChunkStartLine = 1;
  let currentLine = 1;
  let overlapText = '';
  let limitExceeded = false;
  let warningLogged = false;

  return new Promise<Chunk[]>((resolve, reject) => {
    const fileStream = fs.createReadStream(absolutePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      // If limit already exceeded, just update hash (for consistency)
      if (limitExceeded) {
        hash.update(line + '\n');
        return;
      }

      // Update hash
      hash.update(line + '\n');

      const lineWithNewline = line + '\n';

      // Try to add line to current chunk
      const potentialChunk = currentChunkText + lineWithNewline;

      if (potentialChunk.length <= opts.chunkSize) {
        // Line fits, add it
        currentChunkText = potentialChunk;
      } else {
        // Chunk is full, save it and start a new one
        if (currentChunkText.length > 0) {
          // DoS Protection: Check chunk limit BEFORE adding
          if (chunks.length >= maxChunks) {
            limitExceeded = true;
            logger.error('Chunking', 'Chunk limit exceeded during streaming', {
              path: relativePath,
              chunkCount: chunks.length,
              maxChunks,
            });
            // Close the stream early
            rl.close();
            fileStream.destroy();
            reject(new ResourceLimitError(
              'CHUNKS_PER_FILE',
              chunks.length + 1,
              maxChunks,
              `File produces too many chunks during streaming: ${chunks.length + 1} > ${maxChunks}. This may indicate a malformed or excessively large file.`
            ));
            return;
          }

          chunks.push({
            id: uuidv4(),
            text: currentChunkText,
            path: relativePath,
            startLine: currentChunkStartLine,
            endLine: currentLine - 1,
            contentHash: '', // Will be updated after file is fully read
          });

          // DoS Protection: Warn when approaching limit
          if (!warningLogged && chunks.length > CHUNKS_WARNING_THRESHOLD) {
            warningLogged = true;
            logger.warn('Chunking', 'Streaming file approaching chunk limit', {
              path: relativePath,
              chunkCount: chunks.length,
              maxChunks,
              warningThreshold: CHUNKS_WARNING_THRESHOLD,
            });
          }

          // Calculate overlap for next chunk
          overlapText = calculateOverlapFromText(currentChunkText, opts.chunkOverlap);
        }

        // Start new chunk with overlap + current line
        currentChunkText = overlapText + lineWithNewline;
        currentChunkStartLine = currentLine - countLines(overlapText) + 1;
        if (currentChunkStartLine < 1) currentChunkStartLine = 1;
      }

      currentLine++;
    });

    rl.on('close', () => {
      // Skip if we already rejected due to limit exceeded
      if (limitExceeded) {
        return;
      }

      // Handle the last chunk
      if (currentChunkText.length > 0) {
        // DoS Protection: Final check for chunk limit
        if (chunks.length >= maxChunks) {
          reject(new ResourceLimitError(
            'CHUNKS_PER_FILE',
            chunks.length + 1,
            maxChunks,
            `File produces too many chunks during streaming: ${chunks.length + 1} > ${maxChunks}. This may indicate a malformed or excessively large file.`
          ));
          return;
        }

        chunks.push({
          id: uuidv4(),
          text: currentChunkText,
          path: relativePath,
          startLine: currentChunkStartLine,
          endLine: currentLine - 1,
          contentHash: '', // Will be updated below
        });
      }

      // Get final hash
      const contentHash = hash.digest('hex');

      // Update all chunks with the content hash
      for (const chunk of chunks) {
        chunk.contentHash = contentHash;
      }

      logger.debug('Chunking', `Streamed large file into ${chunks.length} chunks`, {
        path: relativePath,
      });

      resolve(chunks);
    });

    rl.on('error', (error) => {
      reject(
        new MCPError({
          code: ErrorCode.FILE_NOT_FOUND,
          userMessage: 'Failed to read the file.',
          developerMessage: `Failed to stream file ${absolutePath}: ${error.message}`,
          cause: error,
        })
      );
    });

    fileStream.on('error', (error) => {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        reject(fileNotFound(absolutePath));
      } else if (nodeError.code === 'EACCES') {
        reject(
          new MCPError({
            code: ErrorCode.PERMISSION_DENIED,
            userMessage: 'Access denied. Please check that you have permission to access this file.',
            developerMessage: `Permission denied reading file: ${absolutePath}`,
            cause: nodeError,
          })
        );
      } else {
        reject(
          new MCPError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: 'Failed to read the file.',
            developerMessage: `Failed to stream file ${absolutePath}: ${nodeError.message}`,
            cause: nodeError,
          })
        );
      }
    });
  });
}

/**
 * Calculate overlap text from the end of a chunk
 *
 * @param text - Text to extract overlap from
 * @param overlapSize - Target overlap size in characters
 * @returns Text to use as overlap
 */
function calculateOverlapFromText(text: string, overlapSize: number): string {
  if (!text || overlapSize <= 0) {
    return '';
  }

  if (text.length <= overlapSize) {
    return text;
  }

  // Start from the end and go back overlapSize characters
  return text.slice(-overlapSize);
}

/**
 * Chunk a file into indexable segments
 *
 * Reads the file, splits it into chunks, and assigns UUIDs and metadata
 * to each chunk. The content hash is computed for the entire file content.
 *
 * For large files (>10MB), uses streaming to avoid memory explosion (MCP-26).
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
  const logger = getLogger();

  // SECURITY: Check for symlinks using lstat before any file operations
  let stats: fs.Stats;
  try {
    stats = await fs.promises.lstat(absolutePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw fileNotFound(absolutePath);
    }
    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied accessing file: ${absolutePath}`,
        cause: nodeError,
      });
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to access the file.',
      developerMessage: `Failed to stat file ${absolutePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }

  // SECURITY: Skip symlinks during indexing (don't follow them)
  if (stats.isSymbolicLink()) {
    logger.warn('Chunking', 'Skipping symlink during chunking', {
      path: absolutePath,
      relativePath,
    });
    return []; // Return empty chunks for symlinks
  }

  // Use streaming for large files
  if (stats.size > MAX_IN_MEMORY_SIZE) {
    logger.warn('Chunking', 'Large file detected, using streaming', {
      path: relativePath,
      size: stats.size,
      threshold: MAX_IN_MEMORY_SIZE,
    });
    return chunkLargeFile(absolutePath, relativePath, stats.size, options);
  }

  // Read file content for smaller files
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
  const logger = getLogger();

  // SECURITY: Check for symlinks using lstat before any file operations
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(absolutePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw fileNotFound(absolutePath);
    }
    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied accessing file: ${absolutePath}`,
        cause: nodeError,
      });
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to access the file.',
      developerMessage: `Failed to stat file ${absolutePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }

  // SECURITY: Skip symlinks during indexing (don't follow them)
  if (stats.isSymbolicLink()) {
    logger.warn('Chunking', 'Skipping symlink during sync chunking', {
      path: absolutePath,
      relativePath,
    });
    return []; // Return empty chunks for symlinks
  }

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
