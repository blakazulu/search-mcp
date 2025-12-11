/**
 * Code-Aware Chunking Engine
 *
 * Implements heuristic-based code-aware chunking that splits code at semantic
 * boundaries (functions, classes, methods) rather than fixed character counts.
 *
 * Benefits:
 * - Chunks align with code structure (no mid-function splits)
 * - Search results are more coherent and complete
 * - Reduced overlap requirement (from 20% to ~5%)
 *
 * Supported languages:
 * - TypeScript/JavaScript: function declarations, class declarations, exports
 * - Python: def statements, class statements, decorators
 *
 * Falls back to character-based chunking for unsupported languages or on errors.
 *
 * @module codeAwareChunking
 */

import { getLogger } from '../utils/logger.js';
import { ChunkWithLines } from './chunking.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Supported programming languages for code-aware chunking
 */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'unknown';

/**
 * Configuration for code-aware chunking
 */
export interface CodeAwareChunkOptions {
  /** Target chunk size in characters (~4000 for ~1000 tokens) */
  chunkSize: number;
  /** Minimum overlap size in characters (~200 for ~50 tokens - reduced from 800) */
  chunkOverlap: number;
  /** Maximum chunk size before forcing a split */
  maxChunkSize: number;
}

/**
 * A semantic boundary in the code
 */
interface SemanticBoundary {
  /** Line number (1-based) where the boundary occurs */
  line: number;
  /** Character position in the text */
  position: number;
  /** Type of boundary (function, class, export, etc.) */
  type: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default options for code-aware chunking
 *
 * Reduced overlap compared to character-based chunking since we're
 * splitting at semantic boundaries.
 */
export const DEFAULT_CODE_AWARE_OPTIONS: CodeAwareChunkOptions = {
  chunkSize: 4000,
  chunkOverlap: 200, // Reduced from 800 since we split at semantic boundaries
  maxChunkSize: 8000, // Force split if a single function exceeds this
};

// ============================================================================
// Language Detection
// ============================================================================

/**
 * File extension to language mapping
 */
const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
};

/**
 * Detect the programming language from a file path
 *
 * @param filePath - Path to the file (can be relative or absolute)
 * @returns The detected language or 'unknown'
 */
export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || 'unknown';
}

// ============================================================================
// Boundary Detection Patterns
// ============================================================================

/**
 * Regex patterns for detecting semantic boundaries in TypeScript/JavaScript
 *
 * These patterns detect the START of semantic units (functions, classes, etc.)
 * at the beginning of lines (allowing for whitespace).
 */
const TS_JS_BOUNDARY_PATTERNS = [
  // Export declarations (must come before function/class to catch exported items)
  { pattern: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+\w+/m, type: 'function' },
  { pattern: /^(?:export\s+(?:default\s+)?)?class\s+\w+/m, type: 'class' },
  { pattern: /^(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+\w+\s*=/m, type: 'variable' },
  { pattern: /^(?:export\s+(?:default\s+)?)?interface\s+\w+/m, type: 'interface' },
  { pattern: /^(?:export\s+(?:default\s+)?)?type\s+\w+\s*=/m, type: 'type' },
  { pattern: /^(?:export\s+(?:default\s+)?)?enum\s+\w+/m, type: 'enum' },
  // Arrow functions assigned to variables (at module level)
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/m, type: 'arrow-function' },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\w+\s*=>/m, type: 'arrow-function' },
];

/**
 * Regex patterns for detecting semantic boundaries in Python
 */
const PYTHON_BOUNDARY_PATTERNS = [
  // Function definitions (including async)
  { pattern: /^(?:async\s+)?def\s+\w+\s*\(/m, type: 'function' },
  // Class definitions
  { pattern: /^class\s+\w+/m, type: 'class' },
  // Decorated functions/classes (decorator is part of the boundary)
  { pattern: /^@\w+/m, type: 'decorator' },
];

// ============================================================================
// Boundary Detection Functions
// ============================================================================

/**
 * Find all semantic boundaries in TypeScript/JavaScript code
 *
 * @param text - Source code text
 * @returns Array of semantic boundaries sorted by position
 */
function findTsJsBoundaries(text: string): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];
  const lines = text.split('\n');
  let position = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    // Check each pattern against the trimmed line
    for (const { pattern, type } of TS_JS_BOUNDARY_PATTERNS) {
      if (pattern.test(trimmedLine)) {
        boundaries.push({
          line: i + 1, // 1-based line number
          position,
          type,
        });
        break; // Only one boundary per line
      }
    }

    position += line.length + 1; // +1 for newline
  }

  return boundaries;
}

/**
 * Find all semantic boundaries in Python code
 *
 * @param text - Source code text
 * @returns Array of semantic boundaries sorted by position
 */
function findPythonBoundaries(text: string): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];
  const lines = text.split('\n');
  let position = 0;
  let prevWasDecorator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();
    const indentLevel = line.length - trimmedLine.length;

    // Only consider top-level definitions (no indentation) or class methods (4 spaces)
    // This avoids splitting on nested functions
    if (indentLevel > 4) {
      position += line.length + 1;
      continue;
    }

    // Check for decorator - it's the start of a function/class boundary
    if (/^@\w+/.test(trimmedLine)) {
      if (!prevWasDecorator) {
        boundaries.push({
          line: i + 1,
          position,
          type: 'decorator',
        });
      }
      prevWasDecorator = true;
    } else if (/^(?:async\s+)?def\s+\w+\s*\(/.test(trimmedLine) || /^class\s+\w+/.test(trimmedLine)) {
      // If not preceded by decorator, this is a boundary
      if (!prevWasDecorator) {
        boundaries.push({
          line: i + 1,
          position,
          type: /^class/.test(trimmedLine) ? 'class' : 'function',
        });
      }
      prevWasDecorator = false;
    } else {
      prevWasDecorator = false;
    }

    position += line.length + 1;
  }

  return boundaries;
}

/**
 * Find semantic boundaries based on the detected language
 *
 * @param text - Source code text
 * @param language - Programming language
 * @returns Array of semantic boundaries
 */
function findBoundaries(text: string, language: SupportedLanguage): SemanticBoundary[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return findTsJsBoundaries(text);
    case 'python':
      return findPythonBoundaries(text);
    default:
      return [];
  }
}

// ============================================================================
// Code-Aware Chunking Implementation
// ============================================================================

/**
 * Split code at semantic boundaries with line number tracking
 *
 * Algorithm:
 * 1. Detect language from file path
 * 2. Find all semantic boundaries (functions, classes, etc.)
 * 3. Group boundaries into chunks that fit within the size limit
 * 4. If a single semantic unit exceeds maxChunkSize, split it at line boundaries
 * 5. Add minimal overlap at chunk boundaries
 *
 * @param text - Source code text
 * @param filePath - Path to the file (for language detection)
 * @param options - Chunking options
 * @returns Array of chunks with line number information
 */
export function splitCodeWithLineNumbers(
  text: string,
  filePath: string,
  options?: Partial<CodeAwareChunkOptions>
): ChunkWithLines[] {
  const logger = getLogger();
  const opts = { ...DEFAULT_CODE_AWARE_OPTIONS, ...options };

  // Handle edge cases
  if (!text || text.length === 0) {
    return [];
  }

  // If text is small enough, return as single chunk
  if (text.length <= opts.chunkSize) {
    const lineCount = text.split('\n').length;
    return [
      {
        text,
        startLine: 1,
        endLine: lineCount,
      },
    ];
  }

  // Detect language
  const language = detectLanguage(filePath);

  if (language === 'unknown') {
    logger.debug('codeAwareChunking', 'Unknown language, falling back to character-based chunking', {
      filePath,
    });
    return null as unknown as ChunkWithLines[]; // Signal to use fallback
  }

  // Find semantic boundaries
  const boundaries = findBoundaries(text, language);

  if (boundaries.length === 0) {
    logger.debug('codeAwareChunking', 'No semantic boundaries found, falling back to character-based chunking', {
      filePath,
      language,
    });
    return null as unknown as ChunkWithLines[]; // Signal to use fallback
  }

  logger.debug('codeAwareChunking', 'Found semantic boundaries', {
    filePath,
    language,
    boundaryCount: boundaries.length,
  });

  // Split text into lines for easier manipulation
  const lines = text.split('\n');
  const chunks: ChunkWithLines[] = [];

  // Add an implicit boundary at the start if first boundary isn't at line 1
  if (boundaries[0].line > 1) {
    boundaries.unshift({ line: 1, position: 0, type: 'start' });
  }

  // Add an implicit boundary at the end
  boundaries.push({ line: lines.length + 1, position: text.length, type: 'end' });

  // Group boundaries into chunks
  let currentChunkStart = 0;
  let currentChunkStartLine = 1;

  for (let i = 1; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const chunkText = text.substring(currentChunkStart, boundary.position);

    // If this chunk would exceed chunkSize, we need to finalize the current chunk
    if (chunkText.length > opts.chunkSize && i > 1) {
      // Use the previous boundary as the end of this chunk
      const prevBoundary = boundaries[i - 1];
      const finalChunkText = text.substring(currentChunkStart, prevBoundary.position).trimEnd();

      if (finalChunkText.length > 0) {
        // Check if single semantic unit is too large
        if (finalChunkText.length > opts.maxChunkSize) {
          // Split large semantic unit at line boundaries
          const subChunks = splitLargeUnit(finalChunkText, currentChunkStartLine, opts);
          chunks.push(...subChunks);
        } else {
          const chunkLineCount = finalChunkText.split('\n').length;
          chunks.push({
            text: finalChunkText,
            startLine: currentChunkStartLine,
            endLine: currentChunkStartLine + chunkLineCount - 1,
          });
        }
      }

      // Start new chunk from previous boundary with overlap
      const overlapStart = calculateOverlapPosition(text, prevBoundary.position, opts.chunkOverlap);
      currentChunkStart = overlapStart;
      currentChunkStartLine = countLinesUntilPosition(text, overlapStart) + 1;
    }

    // If this is the last boundary, finalize the remaining text
    if (i === boundaries.length - 1) {
      const finalChunkText = text.substring(currentChunkStart).trimEnd();
      if (finalChunkText.length > 0) {
        if (finalChunkText.length > opts.maxChunkSize) {
          const subChunks = splitLargeUnit(finalChunkText, currentChunkStartLine, opts);
          chunks.push(...subChunks);
        } else {
          const chunkLineCount = finalChunkText.split('\n').length;
          chunks.push({
            text: finalChunkText,
            startLine: currentChunkStartLine,
            endLine: currentChunkStartLine + chunkLineCount - 1,
          });
        }
      }
    }
  }

  // If we ended up with no chunks or something went wrong, signal fallback
  if (chunks.length === 0) {
    logger.warn('codeAwareChunking', 'Code-aware chunking produced no chunks, falling back', {
      filePath,
    });
    return null as unknown as ChunkWithLines[];
  }

  logger.debug('codeAwareChunking', 'Code-aware chunking complete', {
    filePath,
    chunkCount: chunks.length,
    avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length),
  });

  return chunks;
}

/**
 * Split a large semantic unit that exceeds maxChunkSize
 *
 * @param text - The large text to split
 * @param startLine - Starting line number
 * @param opts - Chunking options
 * @returns Array of smaller chunks
 */
function splitLargeUnit(
  text: string,
  startLine: number,
  opts: CodeAwareChunkOptions
): ChunkWithLines[] {
  const chunks: ChunkWithLines[] = [];
  const lines = text.split('\n');
  let currentChunkLines: string[] = [];
  let currentChunkStart = startLine;
  let currentLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1; // +1 for newline

    if (currentLength + lineLength > opts.chunkSize && currentChunkLines.length > 0) {
      // Finalize current chunk
      chunks.push({
        text: currentChunkLines.join('\n'),
        startLine: currentChunkStart,
        endLine: currentChunkStart + currentChunkLines.length - 1,
      });

      // Calculate overlap (include last few lines from previous chunk)
      const overlapLines = Math.min(
        Math.ceil(opts.chunkOverlap / 80), // Assume ~80 chars per line
        currentChunkLines.length,
        5 // Max 5 lines of overlap
      );

      const newStartIndex = currentChunkLines.length - overlapLines;
      currentChunkStart = currentChunkStart + newStartIndex;
      currentChunkLines = currentChunkLines.slice(newStartIndex);
      currentLength = currentChunkLines.reduce((sum, l) => sum + l.length + 1, 0);
    }

    currentChunkLines.push(line);
    currentLength += lineLength;
  }

  // Don't forget the last chunk
  if (currentChunkLines.length > 0) {
    chunks.push({
      text: currentChunkLines.join('\n'),
      startLine: currentChunkStart,
      endLine: currentChunkStart + currentChunkLines.length - 1,
    });
  }

  return chunks;
}

/**
 * Calculate overlap start position by going back from a boundary
 *
 * @param text - Full text
 * @param boundaryPosition - Position of the boundary
 * @param overlapSize - Desired overlap size
 * @returns Position to start the overlap from
 */
function calculateOverlapPosition(
  text: string,
  boundaryPosition: number,
  overlapSize: number
): number {
  // Go back overlapSize characters, but snap to a line boundary
  let pos = Math.max(0, boundaryPosition - overlapSize);

  // Find the start of the line
  while (pos > 0 && text[pos - 1] !== '\n') {
    pos--;
  }

  return pos;
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
// Public API
// ============================================================================

/**
 * Check if a file can be processed with code-aware chunking
 *
 * @param filePath - Path to the file
 * @returns true if the file's language is supported
 */
export function supportsCodeAwareChunking(filePath: string): boolean {
  return detectLanguage(filePath) !== 'unknown';
}

/**
 * Get the language name for a file path
 *
 * @param filePath - Path to the file
 * @returns Human-readable language name
 */
export function getLanguageName(filePath: string): string {
  const language = detectLanguage(filePath);
  switch (language) {
    case 'typescript':
      return 'TypeScript';
    case 'javascript':
      return 'JavaScript';
    case 'python':
      return 'Python';
    default:
      return 'Unknown';
  }
}
