/**
 * Chunking Engine Tests
 *
 * Tests cover:
 * - Chunk structure and defaults
 * - Text splitting with various separators
 * - Line number tracking
 * - File chunking with UUIDs
 * - Edge cases: empty files, single line, very long lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  type Chunk,
  DEFAULT_SPLIT_OPTIONS,
  splitText,
  splitWithLineNumbers,
  chunkFile,
  chunkFileSync,
} from '../../../src/engines/chunking.js';
import { ErrorCode } from '../../../src/errors/index.js';
import { ResourceLimitError, MAX_CHUNKS_PER_FILE } from '../../../src/utils/limits.js';

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

function generateText(charCount: number, separator: string = '\n'): string {
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit'.split(' ');
  const lines: string[] = [];
  let size = 0;
  let lineNum = 1;

  while (size < charCount) {
    const line = `Line ${lineNum}: ${words.slice(0, 7).join(' ')}`;
    lines.push(line);
    size += line.length + separator.length;
    lineNum++;
  }

  return lines.join(separator);
}

function generateMultilineText(lineCount: number, charsPerLine: number = 50): string {
  const lines: string[] = [];
  for (let i = 1; i <= lineCount; i++) {
    const padding = 'x'.repeat(Math.max(0, charsPerLine - `Line ${i}: `.length));
    lines.push(`Line ${i}: ${padding}`);
  }
  return lines.join('\n');
}

// ============================================================================
// Tests
// ============================================================================

describe('Chunking Engine', () => {
  describe('DEFAULT_SPLIT_OPTIONS', () => {
    it('should have correct default chunk size', () => {
      expect(DEFAULT_SPLIT_OPTIONS.chunkSize).toBe(4000);
    });

    it('should have correct default overlap', () => {
      expect(DEFAULT_SPLIT_OPTIONS.chunkOverlap).toBe(800);
    });

    it('should have separators in correct order', () => {
      expect(DEFAULT_SPLIT_OPTIONS.separators).toEqual(['\n\n', '\n', ' ', '']);
    });
  });

  describe('splitText', () => {
    it('should return empty array for empty string', () => {
      expect(splitText('')).toEqual([]);
    });

    it('should return single chunk for text under chunk size', () => {
      const text = 'Hello, world!';
      const result = splitText(text);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(text);
    });

    it('should split text longer than chunk size', () => {
      const text = generateText(10000);
      const result = splitText(text);
      expect(result.length).toBeGreaterThan(1);
    });

    it('should respect custom chunk size', () => {
      const text = generateText(5000);
      const result = splitText(text, { chunkSize: 1000 });
      expect(result.length).toBeGreaterThan(4);
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(1100);
      }
    });

    it('should split on paragraph breaks first', () => {
      const text = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
      const result = splitText(text, { chunkSize: 20, chunkOverlap: 0 });
      expect(result.some((chunk) => chunk.includes('Paragraph 1'))).toBe(true);
    });

    it('should split on spaces when lines are too long', () => {
      const text = 'word '.repeat(100).trim();
      const result = splitText(text, { chunkSize: 50, chunkOverlap: 0 });
      expect(result.length).toBeGreaterThan(1);
    });

    it('should fall back to character split', () => {
      const text = 'a'.repeat(5000);
      const result = splitText(text, { chunkSize: 1000, chunkOverlap: 0 });
      expect(result.length).toBe(5);
    });

    it('should handle zero overlap', () => {
      const text = 'a'.repeat(3000);
      const result = splitText(text, { chunkSize: 1000, chunkOverlap: 0 });
      expect(result.length).toBe(3);
      const totalLength = result.reduce((sum, chunk) => sum + chunk.length, 0);
      expect(totalLength).toBe(3000);
    });

    it('should handle text exactly at chunk size', () => {
      const text = 'a'.repeat(4000);
      const result = splitText(text);
      expect(result).toHaveLength(1);
    });

    it('should handle Unicode text', () => {
      const text = 'Hello ' + ''.repeat(50) + ' World';
      const result = splitText(text, { chunkSize: 100 });
      expect(result.join('')).toContain('');
    });
  });

  describe('splitWithLineNumbers', () => {
    it('should return empty array for empty string', () => {
      expect(splitWithLineNumbers('')).toEqual([]);
    });

    it('should track line numbers correctly for single chunk', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const result = splitWithLineNumbers(text);
      expect(result).toHaveLength(1);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(3);
    });

    it('should track line numbers for multiple chunks', () => {
      const text = generateMultilineText(100, 100);
      const result = splitWithLineNumbers(text, { chunkSize: 1000, chunkOverlap: 200 });
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].startLine).toBe(1);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].startLine).toBeLessThanOrEqual(result[i - 1].endLine + 1);
      }
    });

    it('should handle single line file', () => {
      const text = 'Single line';
      const result = splitWithLineNumbers(text);
      expect(result).toHaveLength(1);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(1);
    });

    it('should handle file ending with newline', () => {
      const text = 'Line 1\nLine 2\n';
      const result = splitWithLineNumbers(text);
      expect(result).toHaveLength(1);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(2);
    });
  });

  describe('chunkFile', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('chunking-test-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should return empty array for empty file', async () => {
      const filePath = await createFile(tempDir, 'empty.txt', '');
      const result = await chunkFile(filePath, 'empty.txt');
      expect(result).toEqual([]);
    });

    it('should chunk a small file into single chunk', async () => {
      const content = 'Hello, world!\nThis is a test.';
      const filePath = await createFile(tempDir, 'small.txt', content);
      const result = await chunkFile(filePath, 'small.txt');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(content);
      expect(result[0].path).toBe('small.txt');
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(2);
    });

    it('should generate UUIDs for each chunk', async () => {
      const content = generateText(10000);
      const filePath = await createFile(tempDir, 'large.txt', content);
      const result = await chunkFile(filePath, 'large.txt');
      expect(result.length).toBeGreaterThan(1);
      const ids = new Set(result.map((c) => c.id));
      expect(ids.size).toBe(result.length);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      for (const chunk of result) {
        expect(chunk.id).toMatch(uuidRegex);
      }
    });

    it('should include content hash in all chunks', async () => {
      const content = 'Test content for hashing';
      const filePath = await createFile(tempDir, 'hash-test.txt', content);
      const result = await chunkFile(filePath, 'hash-test.txt');
      expect(result.length).toBeGreaterThan(0);
      const firstHash = result[0].contentHash;
      expect(firstHash).toHaveLength(64);
      for (const chunk of result) {
        expect(chunk.contentHash).toBe(firstHash);
      }
    });

    it('should use relative path in chunks', async () => {
      const content = 'Test content';
      const filePath = await createFile(tempDir, 'file.ts', content);
      const result = await chunkFile(filePath, 'src/file.ts');
      expect(result[0].path).toBe('src/file.ts');
    });

    it('should throw FILE_NOT_FOUND for non-existent file', async () => {
      const fakePath = path.join(tempDir, 'nonexistent.txt');
      await expect(chunkFile(fakePath, 'nonexistent.txt')).rejects.toMatchObject({
        code: ErrorCode.FILE_NOT_FOUND,
      });
    });

    it('should handle file with single line', async () => {
      const content = 'Single line without newline';
      const filePath = await createFile(tempDir, 'single-line.txt', content);
      const result = await chunkFile(filePath, 'single-line.txt');
      expect(result).toHaveLength(1);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(1);
    });

    it('should handle file with very long single line', async () => {
      const content = 'word '.repeat(2000);
      const filePath = await createFile(tempDir, 'long-line.txt', content);
      const result = await chunkFile(filePath, 'long-line.txt');
      expect(result.length).toBeGreaterThan(1);
      for (const chunk of result) {
        expect(chunk.startLine).toBe(1);
        expect(chunk.endLine).toBe(1);
      }
    });

    it('should produce valid Chunk interface objects', async () => {
      const content = 'Test content\nMultiple lines\nHere';
      const filePath = await createFile(tempDir, 'valid.txt', content);
      const result = await chunkFile(filePath, 'valid.txt');
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

  describe('chunkFileSync', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('chunking-sync-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should return empty array for empty file', async () => {
      const filePath = await createFile(tempDir, 'empty.txt', '');
      const result = chunkFileSync(filePath, 'empty.txt');
      expect(result).toEqual([]);
    });

    it('should chunk file synchronously', async () => {
      const content = generateText(8000);
      const filePath = await createFile(tempDir, 'sync.txt', content);
      const result = chunkFileSync(filePath, 'sync.txt');
      expect(result.length).toBeGreaterThan(1);
      for (const chunk of result) {
        expect(chunk.id).toBeDefined();
        expect(chunk.path).toBe('sync.txt');
      }
    });

    it('should throw for non-existent file', () => {
      expect(() => chunkFileSync('nonexistent.txt', 'nonexistent.txt')).toThrow();
    });

    it('should produce same results as async version', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const filePath = await createFile(tempDir, 'compare.txt', content);
      const asyncResult = await chunkFile(filePath, 'compare.txt');
      const syncResult = chunkFileSync(filePath, 'compare.txt');
      expect(syncResult.length).toBe(asyncResult.length);
      for (let i = 0; i < asyncResult.length; i++) {
        expect(syncResult[i].text).toBe(asyncResult[i].text);
        expect(syncResult[i].startLine).toBe(asyncResult[i].startLine);
        expect(syncResult[i].endLine).toBe(asyncResult[i].endLine);
        expect(syncResult[i].contentHash).toBe(asyncResult[i].contentHash);
      }
    });
  });

  describe('TypeScript source handling', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('ts-chunking-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should handle TypeScript files', async () => {
      const tsContent = `interface User {
  id: string;
  name: string;
}

export function getUser(id: string): User {
  return { id, name: 'Test' };
}
`;
      const filePath = await createFile(tempDir, 'service.ts', tsContent);
      const result = await chunkFile(filePath, 'src/service.ts');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].path).toBe('src/service.ts');
      expect(result[0].text).toContain('interface User');
    });
  });

  describe('Integration', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('integration-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should produce chunks suitable for vector storage', async () => {
      const content = generateText(15000);
      const filePath = await createFile(tempDir, 'vector.txt', content);
      const chunks = await chunkFile(filePath, 'vector.txt');
      for (const chunk of chunks) {
        expect(chunk.id).toBeTruthy();
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(chunk.text.length).toBeLessThanOrEqual(5000);
        expect(chunk.path).toBeTruthy();
        expect(Number.isInteger(chunk.startLine)).toBe(true);
        expect(Number.isInteger(chunk.endLine)).toBe(true);
        expect(chunk.contentHash).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });

  // ============================================================================
  // DoS Protection: Chunk Limit Enforcement Tests
  // ============================================================================

  describe('DoS Protection: Chunk Limits', () => {
    describe('splitText', () => {
      it('should throw ResourceLimitError when chunk count exceeds limit', () => {
        // Create text that would produce many chunks with very small chunk size
        const text = 'a\n'.repeat(100);

        // Use a very small chunk size and a low maxChunks limit
        expect(() => splitText(text, { chunkSize: 5, chunkOverlap: 0 }, 5))
          .toThrow(ResourceLimitError);
      });

      it('should accept text producing chunks under the limit', () => {
        const text = 'Hello world';
        const result = splitText(text, { chunkSize: 100 }, 10);
        expect(result).toHaveLength(1);
      });

      it('should use MAX_CHUNKS_PER_FILE as default limit', () => {
        // This should not throw since we're using default limit (1000)
        const text = 'a\n'.repeat(50);
        const result = splitText(text, { chunkSize: 10, chunkOverlap: 0 });
        expect(result.length).toBeLessThanOrEqual(MAX_CHUNKS_PER_FILE);
      });

      it('should include limit details in error message', () => {
        const text = 'a\n'.repeat(20);

        try {
          splitText(text, { chunkSize: 3, chunkOverlap: 0 }, 5);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ResourceLimitError);
          const rle = error as ResourceLimitError;
          expect(rle.limitName).toBe('CHUNKS_PER_FILE');
          expect(rle.maxValue).toBe(5);
          expect(rle.actualValue).toBeGreaterThan(5);
        }
      });
    });

    describe('splitWithLineNumbers', () => {
      it('should throw ResourceLimitError when chunk count exceeds limit', () => {
        const text = 'a\n'.repeat(100);

        expect(() => splitWithLineNumbers(text, { chunkSize: 5, chunkOverlap: 0 }, 5))
          .toThrow(ResourceLimitError);
      });

      it('should accept text producing chunks under the limit', () => {
        const text = 'Line 1\nLine 2\nLine 3';
        const result = splitWithLineNumbers(text, { chunkSize: 100 }, 10);
        expect(result).toHaveLength(1);
      });
    });
  });
});
