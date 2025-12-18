/**
 * Markdown Header Chunking Engine Tests (SMCP-099)
 *
 * Tests cover:
 * - ATX header parsing (# through ######)
 * - Setext header parsing (=== and ---)
 * - Header hierarchy tracking
 * - Frontmatter detection and stripping
 * - Code block boundary detection
 * - Section-based chunking
 * - Large section sub-chunking
 * - Breadcrumb formatting
 * - Integration with chunkDocFile
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  // Types
  type MarkdownSection,
  type MarkdownChunk,
  type MarkdownChunkOptions,
  // Constants
  DEFAULT_MARKDOWN_CHUNK_OPTIONS,
  // Parsing functions
  stripFrontmatter,
  findCodeBlockRanges,
  isInsideCodeBlock,
  parseATXHeader,
  parseSetextUnderline,
  parseMarkdownSections,
  // Formatting functions
  formatSection,
  subChunkSection,
  // Main chunking functions
  chunkMarkdownContent,
  shouldUseMarkdownChunking,
  chunkMarkdownFile,
} from '../../../src/engines/markdownChunking.js';
import { chunkDocFile } from '../../../src/engines/docsChunking.js';
import { hashString } from '../../../src/utils/hash.js';

// ============================================================================
// Test Utilities
// ============================================================================

async function createTempDir(prefix: string): Promise<string> {
  const tempBase = os.tmpdir();
  return await fs.promises.mkdtemp(path.join(tempBase, prefix));
}

async function removeTempDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

async function createFile(
  dirPath: string,
  fileName: string,
  content: string
): Promise<string> {
  const filePath = path.join(dirPath, fileName);
  await fs.promises.writeFile(filePath, content, 'utf8');
  return filePath;
}

function generateProseText(charCount: number): string {
  const sentences = [
    'The quick brown fox jumps over the lazy dog.',
    'A journey of a thousand miles begins with a single step.',
    'To be or not to be, that is the question.',
    'All that glitters is not gold.',
    'Actions speak louder than words.',
  ];

  let text = '';
  let sentenceIndex = 0;

  while (text.length < charCount) {
    text += sentences[sentenceIndex % sentences.length] + ' ';
    sentenceIndex++;
  }

  return text.trim();
}

// ============================================================================
// Tests: ATX Header Parsing
// ============================================================================

describe('parseATXHeader', () => {
  it('should parse h1 header', () => {
    const result = parseATXHeader('# Hello World');
    expect(result).toEqual({ level: 1, title: 'Hello World' });
  });

  it('should parse h2 header', () => {
    const result = parseATXHeader('## Introduction');
    expect(result).toEqual({ level: 2, title: 'Introduction' });
  });

  it('should parse h3 header', () => {
    const result = parseATXHeader('### Subsection');
    expect(result).toEqual({ level: 3, title: 'Subsection' });
  });

  it('should parse h4 header', () => {
    const result = parseATXHeader('#### Details');
    expect(result).toEqual({ level: 4, title: 'Details' });
  });

  it('should parse h5 header', () => {
    const result = parseATXHeader('##### Note');
    expect(result).toEqual({ level: 5, title: 'Note' });
  });

  it('should parse h6 header', () => {
    const result = parseATXHeader('###### Footnote');
    expect(result).toEqual({ level: 6, title: 'Footnote' });
  });

  it('should remove trailing # markers', () => {
    const result = parseATXHeader('# Title ###');
    expect(result).toEqual({ level: 1, title: 'Title' });
  });

  it('should return null for non-header lines', () => {
    expect(parseATXHeader('Hello World')).toBeNull();
    expect(parseATXHeader('##NoSpace')).toBeNull();
    expect(parseATXHeader('')).toBeNull();
    expect(parseATXHeader('#')).toBeNull();
  });

  it('should handle headers with special characters', () => {
    const result = parseATXHeader('## `code` and **bold**');
    expect(result).toEqual({ level: 2, title: '`code` and **bold**' });
  });
});

// ============================================================================
// Tests: Setext Header Parsing
// ============================================================================

describe('parseSetextUnderline', () => {
  it('should return 1 for === underline', () => {
    expect(parseSetextUnderline('===')).toBe(1);
    expect(parseSetextUnderline('========')).toBe(1);
  });

  it('should return 2 for --- underline', () => {
    expect(parseSetextUnderline('---')).toBe(2);
    expect(parseSetextUnderline('--------')).toBe(2);
  });

  it('should return null for short underlines', () => {
    expect(parseSetextUnderline('==')).toBeNull();
    expect(parseSetextUnderline('--')).toBeNull();
  });

  it('should return null for mixed characters', () => {
    expect(parseSetextUnderline('=-=')).toBeNull();
    expect(parseSetextUnderline('---===')).toBeNull();
  });

  it('should handle leading/trailing whitespace', () => {
    expect(parseSetextUnderline('  ===  ')).toBe(1);
    expect(parseSetextUnderline('  ---  ')).toBe(2);
  });
});

// ============================================================================
// Tests: Frontmatter Handling
// ============================================================================

describe('stripFrontmatter', () => {
  it('should strip YAML frontmatter', () => {
    const content = `---
title: Test
author: Developer
---

# Hello World`;

    const result = stripFrontmatter(content);
    expect(result.content.trim()).toBe('# Hello World');
    // Frontmatter is 4 lines (---, title, author, ---), so offset is 4
    expect(result.lineOffset).toBe(4);
  });

  it('should return unchanged content without frontmatter', () => {
    const content = '# Hello World\n\nSome content.';
    const result = stripFrontmatter(content);
    expect(result.content).toBe(content);
    expect(result.lineOffset).toBe(0);
  });

  it('should handle unclosed frontmatter', () => {
    const content = '---\ntitle: Test\nno closing';
    const result = stripFrontmatter(content);
    expect(result.content).toBe(content);
    expect(result.lineOffset).toBe(0);
  });

  it('should handle empty frontmatter', () => {
    const content = '---\n---\n\n# Content';
    const result = stripFrontmatter(content);
    expect(result.content.trim()).toBe('# Content');
    expect(result.lineOffset).toBe(2);
  });
});

// ============================================================================
// Tests: Code Block Detection
// ============================================================================

describe('findCodeBlockRanges', () => {
  it('should find single code block', () => {
    const lines = ['# Title', '```js', 'const x = 1;', '```', 'More text'];
    const ranges = findCodeBlockRanges(lines);
    expect(ranges).toEqual([[1, 3]]);
  });

  it('should find multiple code blocks', () => {
    const lines = [
      '# Title',
      '```js',
      'code1',
      '```',
      'Text',
      '```py',
      'code2',
      '```',
    ];
    const ranges = findCodeBlockRanges(lines);
    expect(ranges).toEqual([
      [1, 3],
      [5, 7],
    ]);
  });

  it('should handle tilde fences', () => {
    const lines = ['# Title', '~~~', 'code', '~~~'];
    const ranges = findCodeBlockRanges(lines);
    expect(ranges).toEqual([[1, 3]]);
  });

  it('should handle unclosed code blocks', () => {
    const lines = ['# Title', '```', 'code', 'more code'];
    const ranges = findCodeBlockRanges(lines);
    expect(ranges).toEqual([[1, 3]]);
  });

  it('should return empty array for no code blocks', () => {
    const lines = ['# Title', 'Just text', 'More text'];
    const ranges = findCodeBlockRanges(lines);
    expect(ranges).toEqual([]);
  });
});

describe('isInsideCodeBlock', () => {
  it('should return true for lines inside code block', () => {
    const ranges: Array<[number, number]> = [[2, 5]];
    expect(isInsideCodeBlock(2, ranges)).toBe(true);
    expect(isInsideCodeBlock(3, ranges)).toBe(true);
    expect(isInsideCodeBlock(5, ranges)).toBe(true);
  });

  it('should return false for lines outside code block', () => {
    const ranges: Array<[number, number]> = [[2, 5]];
    expect(isInsideCodeBlock(0, ranges)).toBe(false);
    expect(isInsideCodeBlock(1, ranges)).toBe(false);
    expect(isInsideCodeBlock(6, ranges)).toBe(false);
  });
});

// ============================================================================
// Tests: Section Parsing
// ============================================================================

describe('parseMarkdownSections', () => {
  it('should parse ATX headers into sections', () => {
    const content = `# Title

Intro paragraph.

## Section 1

Content 1.

## Section 2

Content 2.`;

    const sections = parseMarkdownSections(content);
    expect(sections).toHaveLength(3);

    expect(sections[0].level).toBe(1);
    expect(sections[0].title).toBe('Title');
    expect(sections[0].path).toEqual(['Title']);

    expect(sections[1].level).toBe(2);
    expect(sections[1].title).toBe('Section 1');
    expect(sections[1].path).toEqual(['Title', 'Section 1']);

    expect(sections[2].level).toBe(2);
    expect(sections[2].title).toBe('Section 2');
    expect(sections[2].path).toEqual(['Title', 'Section 2']);
  });

  it('should parse setext headers', () => {
    const content = `Title
=====

Intro.

Section
-------

Content.`;

    const sections = parseMarkdownSections(content);
    expect(sections).toHaveLength(2);

    expect(sections[0].level).toBe(1);
    expect(sections[0].title).toBe('Title');

    expect(sections[1].level).toBe(2);
    expect(sections[1].title).toBe('Section');
  });

  it('should handle nested headers', () => {
    const content = `# Chapter

## Part 1

### Detail A

Content A.

### Detail B

Content B.

## Part 2

Content 2.`;

    const sections = parseMarkdownSections(content);
    expect(sections).toHaveLength(5);

    expect(sections[2].path).toEqual(['Chapter', 'Part 1', 'Detail A']);
    expect(sections[3].path).toEqual(['Chapter', 'Part 1', 'Detail B']);
    expect(sections[4].path).toEqual(['Chapter', 'Part 2']);
  });

  it('should not parse headers inside code blocks', () => {
    const content = `# Real Header

\`\`\`markdown
# This is not a header
\`\`\`

Regular text.`;

    const sections = parseMarkdownSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Real Header');
    expect(sections[0].content).toContain('# This is not a header');
  });

  it('should handle content before any headers', () => {
    const content = `Some intro text before headers.

More intro.

# First Header

Content.`;

    const sections = parseMarkdownSections(content);
    expect(sections).toHaveLength(2);

    expect(sections[0].level).toBe(0);
    expect(sections[0].title).toBe('');
    expect(sections[0].content).toContain('Some intro text');

    expect(sections[1].level).toBe(1);
    expect(sections[1].title).toBe('First Header');
  });

  it('should track line numbers correctly', () => {
    const content = `# Title

Content line 1.
Content line 2.

## Section

More content.`;

    const sections = parseMarkdownSections(content);

    expect(sections[0].startLine).toBe(1);
    expect(sections[1].startLine).toBe(6);
  });

  it('should handle empty content', () => {
    const sections = parseMarkdownSections('');
    expect(sections).toEqual([]);
  });
});

// ============================================================================
// Tests: Section Formatting
// ============================================================================

describe('formatSection', () => {
  const defaultOptions = DEFAULT_MARKDOWN_CHUNK_OPTIONS;

  it('should format section with header', () => {
    const section: MarkdownSection = {
      level: 2,
      title: 'Installation',
      content: 'Run npm install.',
      path: ['Guide', 'Installation'],
      startLine: 1,
      endLine: 3,
    };

    const result = formatSection(section, defaultOptions);
    expect(result).toContain('[Guide]');
    expect(result).toContain('## Installation');
    expect(result).toContain('Run npm install.');
  });

  it('should not include breadcrumb for top-level sections', () => {
    const section: MarkdownSection = {
      level: 1,
      title: 'Guide',
      content: 'Welcome.',
      path: ['Guide'],
      startLine: 1,
      endLine: 2,
    };

    const result = formatSection(section, defaultOptions);
    expect(result).not.toContain('[');
    expect(result).toContain('# Guide');
    expect(result).toContain('Welcome.');
  });

  it('should skip breadcrumb when disabled', () => {
    const section: MarkdownSection = {
      level: 2,
      title: 'Details',
      content: 'Some details.',
      path: ['Main', 'Details'],
      startLine: 1,
      endLine: 2,
    };

    const options: MarkdownChunkOptions = {
      ...defaultOptions,
      includeHeaderPath: false,
    };

    const result = formatSection(section, options);
    expect(result).not.toContain('[Main]');
    expect(result).toContain('## Details');
  });
});

// ============================================================================
// Tests: Large Section Sub-Chunking
// ============================================================================

describe('subChunkSection', () => {
  /**
   * Generate prose text with paragraph breaks for testing sub-chunking
   */
  function generateParagraphContent(charCount: number, paragraphSize: number = 500): string {
    const paragraphs: string[] = [];
    let total = 0;
    while (total < charCount) {
      const para = generateProseText(paragraphSize);
      paragraphs.push(para);
      total += para.length + 2; // +2 for \n\n
    }
    return paragraphs.join('\n\n');
  }

  it('should sub-chunk large sections', () => {
    // Generate content with multiple paragraphs that exceeds maxChunkSize
    const largeContent = generateParagraphContent(15000, 800);
    const section: MarkdownSection = {
      level: 2,
      title: 'Large Section',
      content: largeContent,
      path: ['Doc', 'Large Section'],
      startLine: 1,
      endLine: 100,
    };

    const options: MarkdownChunkOptions = {
      maxChunkSize: 3000,
      minChunkSize: 500,
      includeHeaderPath: true,
      chunkOverlap: 500,
    };

    const chunks = subChunkSection(section, options);
    expect(chunks.length).toBeGreaterThan(1);

    // Check that all chunks have part numbers
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].metadata.part).toBe(i + 1);
      expect(chunks[i].metadata.totalParts).toBe(chunks.length);
    }
  });

  it('should include continued marker in subsequent chunks', () => {
    const largeContent = generateParagraphContent(15000, 800);
    const section: MarkdownSection = {
      level: 2,
      title: 'Large Section',
      content: largeContent,
      path: ['Large Section'],
      startLine: 1,
      endLine: 100,
    };

    const options: MarkdownChunkOptions = {
      maxChunkSize: 3000,
      minChunkSize: 500,
      includeHeaderPath: true,
      chunkOverlap: 500,
    };

    const chunks = subChunkSection(section, options);
    expect(chunks.length).toBeGreaterThan(1);

    // First chunk should have header without "(continued)"
    expect(chunks[0].text).toContain('## Large Section');
    expect(chunks[0].text).not.toContain('(continued)');

    // Subsequent chunks should have "(continued)"
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].text).toContain('(continued)');
    }
  });
});

// ============================================================================
// Tests: Main Chunking Function
// ============================================================================

describe('chunkMarkdownContent', () => {
  it('should chunk markdown into sections', () => {
    const content = `# Getting Started

Welcome to our guide.

## Installation

Run \`npm install\` to install.

## Configuration

Create a config file.`;

    const chunks = chunkMarkdownContent(content);
    expect(chunks).toHaveLength(3);

    expect(chunks[0].metadata.sectionTitle).toBe('Getting Started');
    expect(chunks[1].metadata.sectionTitle).toBe('Installation');
    expect(chunks[2].metadata.sectionTitle).toBe('Configuration');
  });

  it('should handle frontmatter', () => {
    const content = `---
title: Guide
---

# Getting Started

Welcome.`;

    const chunks = chunkMarkdownContent(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.sectionTitle).toBe('Getting Started');
  });

  it('should return empty array for empty content', () => {
    const chunks = chunkMarkdownContent('');
    expect(chunks).toEqual([]);
  });

  it('should return empty array for whitespace-only content', () => {
    const chunks = chunkMarkdownContent('   \n\n   ');
    expect(chunks).toEqual([]);
  });

  it('should handle content without headers', () => {
    const content = 'Just some plain text without any headers.';
    const chunks = chunkMarkdownContent(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.headerLevel).toBe(0);
  });

  it('should preserve code blocks within sections', () => {
    const content = `# Code Example

Here is some code:

\`\`\`javascript
function hello() {
  console.log('Hello!');
}
\`\`\`

And that's it.`;

    const chunks = chunkMarkdownContent(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('```javascript');
    expect(chunks[0].text).toContain('function hello()');
  });
});

// ============================================================================
// Tests: File Detection
// ============================================================================

describe('shouldUseMarkdownChunking', () => {
  it('should return true for .md files', () => {
    expect(shouldUseMarkdownChunking('README.md')).toBe(true);
    expect(shouldUseMarkdownChunking('docs/guide.md')).toBe(true);
    expect(shouldUseMarkdownChunking('CHANGELOG.MD')).toBe(true);
  });

  it('should return false for .txt files', () => {
    expect(shouldUseMarkdownChunking('notes.txt')).toBe(false);
    expect(shouldUseMarkdownChunking('README.txt')).toBe(false);
  });

  it('should return false for non-doc files', () => {
    expect(shouldUseMarkdownChunking('index.ts')).toBe(false);
    expect(shouldUseMarkdownChunking('app.js')).toBe(false);
  });
});

// ============================================================================
// Tests: File Chunking Integration
// ============================================================================

describe('chunkMarkdownFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('md-chunk-test-');
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('should chunk markdown file with proper structure', () => {
    const content = `# Test Document

Introduction.

## First Section

Content of first section.

## Second Section

Content of second section.`;

    const contentHash = hashString(content);
    const chunks = chunkMarkdownFile(
      '/fake/path.md',
      'docs/test.md',
      content,
      contentHash
    );

    expect(chunks).toHaveLength(3);

    // Check that each chunk has proper structure
    for (const chunk of chunks) {
      expect(chunk.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(chunk.path).toBe('docs/test.md');
      expect(chunk.contentHash).toBe(contentHash);
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });

  it('should include header context in chunk text via breadcrumbs', () => {
    const content = `# Guide

## Installation

### Prerequisites

You need Node.js.`;

    const contentHash = hashString(content);
    const chunks = chunkMarkdownFile(
      '/fake/path.md',
      'docs/test.md',
      content,
      contentHash
    );

    // Find the Prerequisites chunk by checking its text content
    const prereqChunk = chunks.find((c) => c.text.includes('### Prerequisites'));
    expect(prereqChunk).toBeDefined();
    // Should include breadcrumb context
    expect(prereqChunk?.text).toContain('[Guide > Installation]');
    expect(prereqChunk?.text).toContain('You need Node.js');
  });
});

// ============================================================================
// Tests: Integration with chunkDocFile
// ============================================================================

describe('chunkDocFile integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('doc-chunk-integration-');
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it('should use markdown chunking for .md files', async () => {
    const content = `# Title

Content.

## Section

More content.`;

    const filePath = await createFile(tempDir, 'test.md', content);
    const chunks = await chunkDocFile(filePath, 'test.md');

    // Should have 2 chunks (one per section)
    expect(chunks).toHaveLength(2);

    // Check that chunks have section-aligned content
    expect(chunks[0].text).toContain('# Title');
    expect(chunks[0].text).toContain('Content.');
    expect(chunks[1].text).toContain('## Section');
    expect(chunks[1].text).toContain('More content.');
  });

  it('should use character-based chunking for .txt files', async () => {
    const content = `# Title

This looks like markdown but it's a txt file.

## Section

More content.`;

    const filePath = await createFile(tempDir, 'test.txt', content);
    const chunks = await chunkDocFile(filePath, 'test.txt');

    // Should be character-based (single chunk for small content)
    expect(chunks).toHaveLength(1);
    // Character-based chunks don't have markdown-specific metadata
    expect(chunks[0].metadata).toBeUndefined();
  });

  it('should allow disabling markdown chunking', async () => {
    const content = `# Title

Content.

## Section

More content.`;

    const filePath = await createFile(tempDir, 'test.md', content);
    const chunks = await chunkDocFile(filePath, 'test.md', {
      useMarkdownChunking: false,
    });

    // Should use character-based chunking
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata).toBeUndefined();
  });

  it('should handle large markdown files', async () => {
    // Create a markdown file with many sections
    let content = '# Large Document\n\n';
    for (let i = 1; i <= 20; i++) {
      content += `## Section ${i}\n\n`;
      content += generateProseText(500) + '\n\n';
    }

    const filePath = await createFile(tempDir, 'large.md', content);
    const chunks = await chunkDocFile(filePath, 'large.md');

    // Should have multiple chunks (one per section)
    expect(chunks.length).toBeGreaterThan(5);

    // Each chunk should be section-aligned
    for (const chunk of chunks) {
      // Each chunk should contain a header (either h1 or h2)
      expect(chunk.text.includes('# Large Document') || chunk.text.includes('## Section')).toBe(true);
    }
  });

  it('should handle empty markdown file', async () => {
    const filePath = await createFile(tempDir, 'empty.md', '');
    const chunks = await chunkDocFile(filePath, 'empty.md');
    expect(chunks).toEqual([]);
  });
});

// ============================================================================
// Tests: Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('should handle markdown with only frontmatter', () => {
    const content = `---
title: Empty
---`;

    const chunks = chunkMarkdownContent(content);
    expect(chunks).toEqual([]);
  });

  it('should handle deeply nested headers', () => {
    const content = `# Level 1

## Level 2

### Level 3

#### Level 4

##### Level 5

###### Level 6

Content at deepest level.`;

    const chunks = chunkMarkdownContent(content);
    expect(chunks).toHaveLength(6);

    const deepestChunk = chunks[5];
    expect(deepestChunk.metadata.headerLevel).toBe(6);
    expect(deepestChunk.metadata.headerPath).toHaveLength(6);
  });

  it('should handle mixed ATX and setext headers', () => {
    const content = `Title
=====

Content 1.

## ATX Header

Content 2.

Setext H2
---------

Content 3.`;

    const chunks = chunkMarkdownContent(content);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].metadata.headerLevel).toBe(1);
    expect(chunks[1].metadata.headerLevel).toBe(2);
    expect(chunks[2].metadata.headerLevel).toBe(2);
  });

  it('should handle consecutive headers without content', () => {
    const content = `# Title

## Section 1

## Section 2

## Section 3

Finally some content.`;

    const sections = parseMarkdownSections(content);
    // Empty sections should be filtered out
    const nonEmptySections = sections.filter(
      (s) => s.content.trim().length > 0 || s.title.length > 0
    );
    expect(nonEmptySections.length).toBeGreaterThan(0);
  });

  it('should handle special characters in headers', () => {
    const content = `# Hello & World

## C++ Programming

### func() Returns

Content.`;

    const chunks = chunkMarkdownContent(content);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].metadata.sectionTitle).toBe('Hello & World');
    expect(chunks[1].metadata.sectionTitle).toBe('C++ Programming');
    expect(chunks[2].metadata.sectionTitle).toBe('func() Returns');
  });
});

// ============================================================================
// Tests: DEFAULT_MARKDOWN_CHUNK_OPTIONS
// ============================================================================

describe('DEFAULT_MARKDOWN_CHUNK_OPTIONS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_MARKDOWN_CHUNK_OPTIONS.maxChunkSize).toBe(8000);
    expect(DEFAULT_MARKDOWN_CHUNK_OPTIONS.minChunkSize).toBe(500);
    expect(DEFAULT_MARKDOWN_CHUNK_OPTIONS.includeHeaderPath).toBe(true);
    expect(DEFAULT_MARKDOWN_CHUNK_OPTIONS.chunkOverlap).toBe(500);
  });
});
