/**
 * Markdown Header Chunking Engine (SMCP-099)
 *
 * Splits markdown documents by headers for better context preservation.
 * Instead of arbitrary character-based splits, chunks at semantic boundaries
 * (h1-h6) so each chunk represents a complete section.
 *
 * Features:
 * - Parse ATX headers (# heading) and setext headers (=== and ---)
 * - Track header hierarchy for breadcrumb context
 * - Handle frontmatter (YAML between ---)
 * - Treat code blocks as atomic units (don't split inside them)
 * - Sub-chunk large sections while preserving header context
 */

import { v4 as uuidv4 } from 'uuid';
import { hashString } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import type { Chunk } from './chunking.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * A parsed markdown section
 */
export interface MarkdownSection {
  /** Header level (1-6 for h1-h6, 0 for content before any header) */
  level: number;
  /** Header text (empty for level 0) */
  title: string;
  /** Section content (excluding the header line itself) */
  content: string;
  /** Header hierarchy path: ["Installation", "Prerequisites", "Node.js"] */
  path: string[];
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
}

/**
 * Metadata for markdown chunks
 */
export interface MarkdownChunkMetadata {
  /** Header hierarchy path */
  headerPath: string[];
  /** Header level (1-6, or 0 for pre-header content) */
  headerLevel: number;
  /** Section title (last element of headerPath) */
  sectionTitle: string;
  /** Part number for sub-chunked large sections */
  part?: number;
  /** Total parts for sub-chunked large sections */
  totalParts?: number;
}

/**
 * Options for markdown chunking
 */
export interface MarkdownChunkOptions {
  /** Maximum chunk size in characters (default: 8000) */
  maxChunkSize: number;
  /** Minimum chunk size in characters (default: 500) */
  minChunkSize: number;
  /** Include header path as breadcrumb in chunk text (default: true) */
  includeHeaderPath: boolean;
  /** Chunk overlap in characters for sub-chunked sections (default: 500) */
  chunkOverlap: number;
}

/**
 * Default markdown chunk options (prose-optimized)
 */
export const DEFAULT_MARKDOWN_CHUNK_OPTIONS: MarkdownChunkOptions = {
  maxChunkSize: 8000,
  minChunkSize: 500,
  includeHeaderPath: true,
  chunkOverlap: 500,
};

/**
 * A chunk with markdown-specific metadata
 */
export interface MarkdownChunk {
  /** Chunk text content */
  text: string;
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
  /** Markdown-specific metadata */
  metadata: MarkdownChunkMetadata;
}

// ============================================================================
// Frontmatter Handling
// ============================================================================

/**
 * Detect and skip YAML frontmatter at the start of content
 *
 * Frontmatter is YAML between --- delimiters at the very start of the file.
 *
 * @param content - The markdown content
 * @returns Object with content without frontmatter and line offset
 */
export function stripFrontmatter(content: string): { content: string; lineOffset: number } {
  // Frontmatter must start at the very beginning with ---
  if (!content.startsWith('---')) {
    return { content, lineOffset: 0 };
  }

  const lines = content.split('\n');

  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing ---, treat as regular content
    return { content, lineOffset: 0 };
  }

  // Return content after frontmatter
  const contentWithoutFrontmatter = lines.slice(endIndex + 1).join('\n');
  return {
    content: contentWithoutFrontmatter,
    lineOffset: endIndex + 1,
  };
}

// ============================================================================
// Code Block Detection
// ============================================================================

/**
 * Find all code block ranges in the content
 *
 * Code blocks are fenced with ``` or ~~~ and should be treated as atomic units.
 *
 * @param lines - Array of content lines
 * @returns Array of [startLine, endLine] tuples (0-based indices)
 */
export function findCodeBlockRanges(lines: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let inCodeBlock = false;
  let codeBlockStart = -1;
  let codeBlockFence = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inCodeBlock) {
      // Check for opening fence
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inCodeBlock = true;
        codeBlockStart = i;
        codeBlockFence = trimmed.slice(0, 3);
      }
    } else {
      // Check for closing fence (must be same type)
      if (trimmed === codeBlockFence || trimmed.startsWith(codeBlockFence)) {
        // Only match if it's just the fence or fence followed by nothing important
        if (trimmed === codeBlockFence) {
          ranges.push([codeBlockStart, i]);
          inCodeBlock = false;
          codeBlockFence = '';
        }
      }
    }
  }

  // Handle unclosed code block (treat as extending to end)
  if (inCodeBlock && codeBlockStart >= 0) {
    ranges.push([codeBlockStart, lines.length - 1]);
  }

  return ranges;
}

/**
 * Check if a line index is inside a code block
 *
 * @param lineIndex - 0-based line index
 * @param codeBlockRanges - Array of code block ranges
 * @returns true if the line is inside a code block
 */
export function isInsideCodeBlock(
  lineIndex: number,
  codeBlockRanges: Array<[number, number]>
): boolean {
  for (const [start, end] of codeBlockRanges) {
    if (lineIndex >= start && lineIndex <= end) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Header Parsing
// ============================================================================

/**
 * Regex for ATX headers: # through ###### followed by space and title
 */
const ATX_HEADER_REGEX = /^(#{1,6})\s+(.+)$/;

/**
 * Parse an ATX header line
 *
 * @param line - The line to parse
 * @returns Object with level and title, or null if not a header
 */
export function parseATXHeader(line: string): { level: number; title: string } | null {
  const match = line.match(ATX_HEADER_REGEX);
  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    title: match[2].trim().replace(/\s*#+\s*$/, ''), // Remove trailing # markers
  };
}

/**
 * Check if the next line makes current line a setext header
 *
 * Setext headers:
 * - === (any number) for h1
 * - --- (any number, but 3+) for h2
 *
 * @param nextLine - The line following the potential header text
 * @returns Header level (1 or 2) or null if not a setext underline
 */
export function parseSetextUnderline(nextLine: string): number | null {
  const trimmed = nextLine.trim();

  // Must be at least 3 characters of = or -
  if (trimmed.length < 3) {
    return null;
  }

  // Check for ===+ (h1)
  if (/^=+$/.test(trimmed)) {
    return 1;
  }

  // Check for ---+ (h2)
  // Note: We need to be careful as --- can also be a horizontal rule
  // In proper markdown, --- for h2 requires text on the line above
  if (/^-+$/.test(trimmed)) {
    return 2;
  }

  return null;
}

/**
 * Parse markdown content into sections
 *
 * Handles both ATX headers (# style) and setext headers (=== and --- style).
 * Respects code blocks (doesn't parse headers inside them).
 *
 * @param content - The markdown content to parse
 * @param lineOffset - Line offset for frontmatter handling (default: 0)
 * @returns Array of parsed sections
 */
export function parseMarkdownSections(
  content: string,
  lineOffset: number = 0
): MarkdownSection[] {
  const logger = getLogger();
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];
  const headerStack: Array<{ level: number; title: string }> = [];

  // Find code block ranges to avoid parsing headers inside them
  const codeBlockRanges = findCodeBlockRanges(lines);

  let currentSection: MarkdownSection | null = null;
  let contentBuffer: string[] = [];
  let i = 0;

  // Helper to save current section
  const saveCurrentSection = (endLineIndex: number) => {
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n');
      currentSection.endLine = endLineIndex + lineOffset;
      sections.push(currentSection);
    }
  };

  // Helper to start a new section
  const startNewSection = (
    level: number,
    title: string,
    startLineIndex: number
  ) => {
    // Update header stack
    while (
      headerStack.length > 0 &&
      headerStack[headerStack.length - 1].level >= level
    ) {
      headerStack.pop();
    }
    headerStack.push({ level, title });

    // Create new section
    currentSection = {
      level,
      title,
      content: '',
      path: headerStack.map((h) => h.title),
      startLine: startLineIndex + 1 + lineOffset, // 1-based
      endLine: -1,
    };
    contentBuffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Skip if inside code block
    if (isInsideCodeBlock(i, codeBlockRanges)) {
      contentBuffer.push(line);
      i++;
      continue;
    }

    // Try to parse ATX header
    const atxHeader = parseATXHeader(line);
    if (atxHeader) {
      // Save previous section
      saveCurrentSection(i - 1);

      // Start new section
      startNewSection(atxHeader.level, atxHeader.title, i);
      i++;
      continue;
    }

    // Try to parse setext header (check next line)
    if (i + 1 < lines.length && line.trim().length > 0) {
      const nextLine = lines[i + 1];

      // Make sure next line is not inside a code block
      if (!isInsideCodeBlock(i + 1, codeBlockRanges)) {
        const setextLevel = parseSetextUnderline(nextLine);

        if (setextLevel !== null) {
          // This is a setext header
          saveCurrentSection(i - 1);
          startNewSection(setextLevel, line.trim(), i);
          i += 2; // Skip both the title line and underline
          continue;
        }
      }
    }

    // Regular content line
    if (currentSection === null) {
      // Content before any header - create a level-0 section
      currentSection = {
        level: 0,
        title: '',
        content: '',
        path: [],
        startLine: 1 + lineOffset,
        endLine: -1,
      };
    }
    contentBuffer.push(line);
    i++;
  }

  // Save last section
  saveCurrentSection(lines.length);

  // Filter out empty sections (no content and no title)
  const filteredSections = sections.filter(
    (s) => s.title.length > 0 || s.content.trim().length > 0
  );

  logger.debug('MarkdownChunking', 'Parsed markdown sections', {
    totalSections: filteredSections.length,
    maxLevel: Math.max(...filteredSections.map((s) => s.level), 0),
  });

  return filteredSections;
}

// ============================================================================
// Section Formatting
// ============================================================================

/**
 * Format a section for embedding, optionally including header path breadcrumb
 *
 * @param section - The section to format
 * @param options - Chunk options
 * @returns Formatted section text
 */
export function formatSection(
  section: MarkdownSection,
  options: MarkdownChunkOptions
): string {
  const headerLine =
    section.level > 0
      ? `${'#'.repeat(section.level)} ${section.title}`
      : '';

  // Include breadcrumb for context if enabled and there's a parent
  if (options.includeHeaderPath && section.path.length > 1) {
    const breadcrumb = section.path.slice(0, -1).join(' > ');
    const parts = [`[${breadcrumb}]`, headerLine, section.content]
      .filter((p) => p.length > 0);
    return parts.join('\n\n');
  }

  // Just header and content
  const parts = [headerLine, section.content].filter((p) => p.length > 0);
  return parts.join('\n\n');
}

// ============================================================================
// Large Section Sub-Chunking
// ============================================================================

/**
 * Sub-chunk a large section while preserving header context
 *
 * Splits by paragraphs first, then by sentences if needed.
 * Each sub-chunk includes the section header for context.
 *
 * @param section - The large section to sub-chunk
 * @param options - Chunk options
 * @returns Array of markdown chunks
 */
export function subChunkSection(
  section: MarkdownSection,
  options: MarkdownChunkOptions
): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];
  const header =
    section.level > 0
      ? `${'#'.repeat(section.level)} ${section.title}`
      : '';
  const breadcrumb =
    options.includeHeaderPath && section.path.length > 1
      ? `[${section.path.slice(0, -1).join(' > ')}]\n\n`
      : '';

  // Calculate header overhead (breadcrumb + header + "(continued)")
  const headerPrefix = `${breadcrumb}${header}`;
  const continuedPrefix = `${breadcrumb}${header}${header ? ' (continued)' : ''}`;
  const headerOverhead = Math.max(headerPrefix.length, continuedPrefix.length) + 4; // +4 for newlines

  // Split content into paragraphs (double newline separated)
  const paragraphs = section.content.split(/\n\n+/).filter((p) => p.trim().length > 0);

  let buffer = headerPrefix;
  let partNum = 1;
  let bufferStartOffset = 0;
  let currentLineOffset = 0;

  // Track approximate line positions
  const contentLines = section.content.split('\n');

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx];
    const paragraphWithSeparator = paragraph + '\n\n';

    // Find approximate line position for this paragraph
    let paragraphLineStart = 0;
    let charCount = 0;
    for (let li = 0; li < contentLines.length; li++) {
      if (charCount >= currentLineOffset) {
        paragraphLineStart = li;
        break;
      }
      charCount += contentLines[li].length + 1; // +1 for newline
    }

    const potentialSize = buffer.length + paragraphWithSeparator.length;

    if (potentialSize > options.maxChunkSize && buffer.length > headerOverhead) {
      // Save current buffer as a chunk
      const trimmedBuffer = buffer.trim();
      if (trimmedBuffer.length >= options.minChunkSize) {
        const chunkEndLine = section.startLine + Math.max(0, paragraphLineStart - 1);
        chunks.push({
          text: trimmedBuffer,
          startLine: section.startLine + bufferStartOffset,
          endLine: chunkEndLine,
          metadata: {
            headerPath: section.path,
            headerLevel: section.level,
            sectionTitle: section.title,
            part: partNum,
          },
        });
        partNum++;
      }

      // Start new buffer with continued header
      buffer = continuedPrefix + '\n\n' + paragraph + '\n\n';
      bufferStartOffset = paragraphLineStart;
    } else {
      if (buffer.length === 0 || buffer === headerPrefix) {
        buffer = headerPrefix + '\n\n' + paragraph + '\n\n';
      } else {
        buffer += paragraphWithSeparator;
      }
    }

    currentLineOffset += paragraph.length + 2; // +2 for \n\n
  }

  // Save remaining buffer
  const trimmedBuffer = buffer.trim();
  if (trimmedBuffer.length >= options.minChunkSize || partNum === 1) {
    chunks.push({
      text: trimmedBuffer,
      startLine: section.startLine + bufferStartOffset,
      endLine: section.endLine,
      metadata: {
        headerPath: section.path,
        headerLevel: section.level,
        sectionTitle: section.title,
        part: partNum,
      },
    });
  }

  // Update total parts
  for (const chunk of chunks) {
    chunk.metadata.totalParts = chunks.length;
  }

  return chunks;
}

// ============================================================================
// Main Chunking Function
// ============================================================================

/**
 * Chunk markdown content by headers
 *
 * Main entry point for markdown-aware chunking. Parses headers,
 * creates chunks at section boundaries, and sub-chunks large sections.
 *
 * @param content - The markdown content to chunk
 * @param options - Chunk options (optional, defaults to DEFAULT_MARKDOWN_CHUNK_OPTIONS)
 * @returns Array of markdown chunks with metadata
 */
export function chunkMarkdownContent(
  content: string,
  options?: Partial<MarkdownChunkOptions>
): MarkdownChunk[] {
  const logger = getLogger();
  const opts = { ...DEFAULT_MARKDOWN_CHUNK_OPTIONS, ...options };

  // Handle empty content
  if (!content || content.trim().length === 0) {
    return [];
  }

  // Strip frontmatter
  const { content: strippedContent, lineOffset } = stripFrontmatter(content);

  // Handle content that's only frontmatter
  if (strippedContent.trim().length === 0) {
    return [];
  }

  // Parse sections
  const sections = parseMarkdownSections(strippedContent, lineOffset);

  if (sections.length === 0) {
    return [];
  }

  const chunks: MarkdownChunk[] = [];

  for (const section of sections) {
    const sectionText = formatSection(section, opts);

    if (sectionText.length <= opts.maxChunkSize) {
      // Section fits in one chunk
      chunks.push({
        text: sectionText,
        startLine: section.startLine,
        endLine: section.endLine,
        metadata: {
          headerPath: section.path,
          headerLevel: section.level,
          sectionTitle: section.title,
        },
      });
    } else {
      // Large section: sub-chunk with header context
      const subChunks = subChunkSection(section, opts);
      chunks.push(...subChunks);
    }
  }

  logger.debug('MarkdownChunking', 'Chunked markdown content', {
    totalChunks: chunks.length,
    sectionsCount: sections.length,
    hasSubChunks: chunks.some((c) => c.metadata.part !== undefined),
  });

  return chunks;
}

// ============================================================================
// File Chunking Integration
// ============================================================================

/**
 * Check if markdown header chunking should be used for a file
 *
 * Currently only for .md files (not .txt as they lack structure).
 *
 * @param relativePath - The file path to check
 * @returns true if markdown header chunking should be used
 */
export function shouldUseMarkdownChunking(relativePath: string): boolean {
  const ext = relativePath.toLowerCase();
  return ext.endsWith('.md');
}

/**
 * Chunk a markdown file by headers
 *
 * Reads the file and chunks it using header-aware splitting.
 *
 * @param absolutePath - Absolute path to the file on disk
 * @param relativePath - Relative path from project root (stored in chunk)
 * @param fileContent - The file content (passed from caller to avoid re-reading)
 * @param contentHash - SHA256 hash of the content
 * @param options - Chunk options
 * @returns Array of full Chunk objects with IDs and metadata
 */
export function chunkMarkdownFile(
  absolutePath: string,
  relativePath: string,
  fileContent: string,
  contentHash: string,
  options?: Partial<MarkdownChunkOptions>
): Chunk[] {
  const logger = getLogger();

  // Use markdown-aware chunking
  const mdChunks = chunkMarkdownContent(fileContent, options);

  if (mdChunks.length === 0) {
    return [];
  }

  // Convert to full Chunk objects
  // Note: ChunkMetadata requires ASTLanguage, which doesn't include markdown.
  // For markdown, we embed the metadata into the chunk text itself via breadcrumbs.
  // The header path is already included in the text, so search will find it naturally.
  const chunks: Chunk[] = mdChunks.map((chunk) => ({
    id: uuidv4(),
    text: chunk.text,
    path: relativePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    contentHash,
    // Don't set metadata - ChunkMetadata requires ASTLanguage which doesn't include markdown
    // The header context is embedded in the chunk text via breadcrumbs
  }));

  logger.debug('MarkdownChunking', 'Created chunks from markdown file', {
    path: relativePath,
    chunkCount: chunks.length,
    hasMultiPart: mdChunks.some((c) => c.metadata.part !== undefined),
  });

  return chunks;
}

