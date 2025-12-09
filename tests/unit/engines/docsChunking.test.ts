/**
 * Docs Chunking Engine Tests
 *
 * Tests cover:
 * - DOC_SPLIT_OPTIONS values match RFC spec
 * - isDocFile() helper function
 * - chunkDocFile() uses correct parameters
 * - Chunk sizes are larger than code chunks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DOC_FILE_EXTENSIONS,
  DOC_FILE_PATTERNS,
  DOC_SPLIT_OPTIONS,
  isDocFile,
  chunkDocFile,
} from '../../../src/engines/docsChunking.js';
import { DEFAULT_SPLIT_OPTIONS } from '../../../src/engines/chunking.js';
import { ErrorCode } from '../../../src/errors/index.js';

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

async function createFile(dirPath: string, fileName: string, content: string): Promise<string> {
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

function generateMarkdownContent(charCount: number): string {
  const sections: string[] = [];
  let size = 0;
  let sectionNum = 1;

  while (size < charCount) {
    const section = `## Section ${sectionNum}\n\n${generateProseText(500)}\n\n`;
    sections.push(section);
    size += section.length;
    sectionNum++;
  }

  return `# Documentation\n\n${sections.join('')}`;
}

// ============================================================================
// Tests
// ============================================================================

describe('Docs Chunking Engine', () => {
  describe('DOC_FILE_EXTENSIONS', () => {
    it('should include .md extension', () => {
      expect(DOC_FILE_EXTENSIONS).toContain('.md');
    });

    it('should include .txt extension', () => {
      expect(DOC_FILE_EXTENSIONS).toContain('.txt');
    });

    it('should have exactly 2 extensions', () => {
      expect(DOC_FILE_EXTENSIONS).toHaveLength(2);
    });
  });

  describe('DOC_FILE_PATTERNS', () => {
    it('should include markdown glob pattern', () => {
      expect(DOC_FILE_PATTERNS).toContain('**/*.md');
    });

    it('should include text file glob pattern', () => {
      expect(DOC_FILE_PATTERNS).toContain('**/*.txt');
    });

    it('should have exactly 2 patterns', () => {
      expect(DOC_FILE_PATTERNS).toHaveLength(2);
    });
  });

  describe('DOC_SPLIT_OPTIONS', () => {
    it('should have chunk size of 8000 chars (~2000 tokens)', () => {
      expect(DOC_SPLIT_OPTIONS.chunkSize).toBe(8000);
    });

    it('should have chunk overlap of 2000 chars (~500 tokens)', () => {
      expect(DOC_SPLIT_OPTIONS.chunkOverlap).toBe(2000);
    });

    it('should have separators in correct order', () => {
      expect(DOC_SPLIT_OPTIONS.separators).toEqual(['\n\n', '\n', '. ', ' ', '']);
    });

    it('should include sentence separator (". ") for prose', () => {
      expect(DOC_SPLIT_OPTIONS.separators).toContain('. ');
    });

    it('should have larger chunk size than code chunks', () => {
      expect(DOC_SPLIT_OPTIONS.chunkSize).toBeGreaterThan(DEFAULT_SPLIT_OPTIONS.chunkSize);
    });

    it('should have larger overlap than code chunks', () => {
      expect(DOC_SPLIT_OPTIONS.chunkOverlap).toBeGreaterThan(DEFAULT_SPLIT_OPTIONS.chunkOverlap);
    });

    it('should be exactly 2x the code chunk size', () => {
      expect(DOC_SPLIT_OPTIONS.chunkSize).toBe(DEFAULT_SPLIT_OPTIONS.chunkSize * 2);
    });

    it('should be exactly 2.5x the code chunk overlap', () => {
      expect(DOC_SPLIT_OPTIONS.chunkOverlap).toBe(DEFAULT_SPLIT_OPTIONS.chunkOverlap * 2.5);
    });
  });

  describe('isDocFile', () => {
    it('should return true for .md files', () => {
      expect(isDocFile('README.md')).toBe(true);
    });

    it('should return true for .txt files', () => {
      expect(isDocFile('notes.txt')).toBe(true);
    });

    it('should return true for nested .md files', () => {
      expect(isDocFile('docs/guide/getting-started.md')).toBe(true);
    });

    it('should return true for nested .txt files', () => {
      expect(isDocFile('docs/notes/todo.txt')).toBe(true);
    });

    it('should be case-insensitive for .md', () => {
      expect(isDocFile('README.MD')).toBe(true);
      expect(isDocFile('README.Md')).toBe(true);
    });

    it('should be case-insensitive for .txt', () => {
      expect(isDocFile('NOTES.TXT')).toBe(true);
      expect(isDocFile('notes.TxT')).toBe(true);
    });

    it('should return false for .ts files', () => {
      expect(isDocFile('index.ts')).toBe(false);
    });

    it('should return false for .js files', () => {
      expect(isDocFile('index.js')).toBe(false);
    });

    it('should return false for .json files', () => {
      expect(isDocFile('package.json')).toBe(false);
    });

    it('should return false for .html files', () => {
      expect(isDocFile('index.html')).toBe(false);
    });

    it('should return false for files without extensions', () => {
      expect(isDocFile('Makefile')).toBe(false);
    });

    it('should return false for .mdx files', () => {
      expect(isDocFile('component.mdx')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(isDocFile('')).toBe(false);
    });

    it('should handle files with multiple dots', () => {
      expect(isDocFile('my.file.name.md')).toBe(true);
      expect(isDocFile('my.file.name.txt')).toBe(true);
      expect(isDocFile('my.file.name.ts')).toBe(false);
    });
  });

  describe('chunkDocFile', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('docs-chunking-test-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should return empty array for empty file', async () => {
      const filePath = await createFile(tempDir, 'empty.md', '');
      const result = await chunkDocFile(filePath, 'empty.md');
      expect(result).toEqual([]);
    });

    it('should chunk a small doc file into single chunk', async () => {
      const content = '# Hello World\n\nThis is a test document.';
      const filePath = await createFile(tempDir, 'small.md', content);
      const result = await chunkDocFile(filePath, 'small.md');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(content);
      expect(result[0].path).toBe('small.md');
    });

    it('should generate UUIDs for each chunk', async () => {
      const content = generateMarkdownContent(20000);
      const filePath = await createFile(tempDir, 'large.md', content);
      const result = await chunkDocFile(filePath, 'large.md');
      expect(result.length).toBeGreaterThan(1);
      const ids = new Set(result.map((c) => c.id));
      expect(ids.size).toBe(result.length);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      for (const chunk of result) {
        expect(chunk.id).toMatch(uuidRegex);
      }
    });

    it('should include content hash in all chunks', async () => {
      const content = '# Test Document\n\nSome content for hashing.';
      const filePath = await createFile(tempDir, 'hash-test.md', content);
      const result = await chunkDocFile(filePath, 'hash-test.md');
      expect(result.length).toBeGreaterThan(0);
      const firstHash = result[0].contentHash;
      expect(firstHash).toHaveLength(64);
      for (const chunk of result) {
        expect(chunk.contentHash).toBe(firstHash);
      }
    });

    it('should track line numbers correctly', async () => {
      const content = '# Title\n\nParagraph 1\n\nParagraph 2\n\nParagraph 3';
      const filePath = await createFile(tempDir, 'lines.md', content);
      const result = await chunkDocFile(filePath, 'lines.md');
      expect(result).toHaveLength(1);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(7);
    });

    it('should use relative path in chunks', async () => {
      const content = '# Guide\n\nThis is a guide.';
      const filePath = await createFile(tempDir, 'guide.md', content);
      const result = await chunkDocFile(filePath, 'docs/guide.md');
      expect(result[0].path).toBe('docs/guide.md');
    });

    it('should throw FILE_NOT_FOUND for non-existent file', async () => {
      const fakePath = path.join(tempDir, 'nonexistent.md');
      await expect(chunkDocFile(fakePath, 'nonexistent.md')).rejects.toMatchObject({
        code: ErrorCode.FILE_NOT_FOUND,
      });
    });

    it('should create larger chunks than code chunking', async () => {
      // Create content that would be multiple chunks with code settings
      // but fewer chunks with doc settings
      const content = generateProseText(10000);
      const filePath = await createFile(tempDir, 'prose.txt', content);
      const result = await chunkDocFile(filePath, 'prose.txt');

      // With 8000 char chunk size, 10000 chars should be ~2 chunks
      // With 4000 char chunk size (code), it would be ~3-4 chunks
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should handle .txt files', async () => {
      const content = 'This is a plain text file.\n\nIt has multiple paragraphs.';
      const filePath = await createFile(tempDir, 'notes.txt', content);
      const result = await chunkDocFile(filePath, 'notes.txt');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(content);
    });

    it('should produce valid Chunk interface objects', async () => {
      const content = generateMarkdownContent(5000);
      const filePath = await createFile(tempDir, 'valid.md', content);
      const result = await chunkDocFile(filePath, 'valid.md');
      for (const chunk of result) {
        expect(typeof chunk.id).toBe('string');
        expect(typeof chunk.text).toBe('string');
        expect(typeof chunk.path).toBe('string');
        expect(typeof chunk.startLine).toBe('number');
        expect(typeof chunk.endLine).toBe('number');
        expect(typeof chunk.contentHash).toBe('string');
        expect(chunk.id.length).toBe(36);
        expect(chunk.startLine).toBeGreaterThanOrEqual(1);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
        expect(chunk.contentHash.length).toBe(64);
      }
    });
  });

  describe('Chunk size comparison with code chunks', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('chunk-compare-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should create fewer chunks than code chunking for same content', async () => {
      // Generate content that would create multiple chunks
      const content = generateProseText(20000);
      const filePath = await createFile(tempDir, 'content.txt', content);

      // Chunk with doc settings
      const docChunks = await chunkDocFile(filePath, 'content.txt');

      // Import code chunking to compare
      const { chunkFile } = await import('../../../src/engines/chunking.js');
      const codeChunks = await chunkFile(filePath, 'content.txt');

      // Doc chunks should be fewer due to larger chunk size
      expect(docChunks.length).toBeLessThan(codeChunks.length);
    });
  });
});
