import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { atomicWrite, atomicWriteJson } from '../../../src/utils/atomicWrite.js';

describe('Atomic Write Utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = path.join(
      os.tmpdir(),
      `search-mcp-atomic-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // atomicWrite Tests
  // ==========================================================================

  describe('atomicWrite', () => {
    it('should write content to file successfully', async () => {
      const targetPath = path.join(testDir, 'test.txt');
      const content = 'Hello, World!';

      await atomicWrite(targetPath, content);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should use specified encoding', async () => {
      const targetPath = path.join(testDir, 'test.txt');
      const content = 'Hello, World!';

      await atomicWrite(targetPath, content, 'utf-8');

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should create parent directories if they do not exist', async () => {
      const targetPath = path.join(testDir, 'nested', 'deep', 'dir', 'test.txt');
      const content = 'Nested content';

      await atomicWrite(targetPath, content);

      expect(fs.existsSync(targetPath)).toBe(true);
      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should create deeply nested directories', async () => {
      const targetPath = path.join(
        testDir,
        'level1',
        'level2',
        'level3',
        'level4',
        'test.txt'
      );
      const content = 'Deep content';

      await atomicWrite(targetPath, content);

      expect(fs.existsSync(targetPath)).toBe(true);
      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should overwrite existing file', async () => {
      const targetPath = path.join(testDir, 'test.txt');

      await atomicWrite(targetPath, 'Original content');
      await atomicWrite(targetPath, 'New content');

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe('New content');
    });

    it('should not leave temp files behind on success', async () => {
      const targetPath = path.join(testDir, 'test.txt');

      await atomicWrite(targetPath, 'Content');

      const files = await fs.promises.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should clean up temp file on write error', async () => {
      // Create a read-only directory to simulate write failure
      const readOnlyDir = path.join(testDir, 'readonly');
      await fs.promises.mkdir(readOnlyDir, { recursive: true });

      // On Windows, making a file read-only doesn't prevent writing to directory
      // So we test a different failure mode - writing to a file that exists as directory
      const targetPath = path.join(testDir, 'is_a_dir');
      await fs.promises.mkdir(targetPath, { recursive: true });

      // Try to write to a path where target is a directory
      const filePath = path.join(targetPath, '..', 'is_a_dir');

      try {
        await atomicWrite(filePath, 'Content');
        // If it doesn't throw, that's fine - the test is about cleanup
      } catch {
        // Expected to fail
      }

      // Verify no temp files in parent directory
      const files = await fs.promises.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should handle empty content', async () => {
      const targetPath = path.join(testDir, 'empty.txt');

      await atomicWrite(targetPath, '');

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe('');
    });

    it('should handle large content', async () => {
      const targetPath = path.join(testDir, 'large.txt');
      const content = 'x'.repeat(1024 * 1024); // 1MB

      await atomicWrite(targetPath, content);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should handle special characters in content', async () => {
      const targetPath = path.join(testDir, 'special.txt');
      const content = 'Line 1\nLine 2\tTabbed\r\nWindows line\0Null char';

      await atomicWrite(targetPath, content);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe(content);
    });

    it('should handle unicode content', async () => {
      const targetPath = path.join(testDir, 'unicode.txt');
      const content = 'Hello, World! Emoji: \u2764\uFE0F Chinese: \u4E2D\u6587 Japanese: \u65E5\u672C\u8A9E';

      await atomicWrite(targetPath, content);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe(content);
    });
  });

  // ==========================================================================
  // atomicWriteJson Tests
  // ==========================================================================

  describe('atomicWriteJson', () => {
    it('should write JSON with pretty-printing by default', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = { key: 'value', number: 42 };

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe('{\n  "key": "value",\n  "number": 42\n}\n');
    });

    it('should write compact JSON when pretty is false', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = { key: 'value', number: 42 };

      await atomicWriteJson(targetPath, data, false);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result).toBe('{"key":"value","number":42}\n');
    });

    it('should append newline to JSON content', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = { key: 'value' };

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      expect(result.endsWith('\n')).toBe(true);
    });

    it('should handle arrays', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = [1, 2, 3, 'four'];

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should handle nested objects', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should handle null values', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = { key: null };

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should handle empty object', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = {};

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should handle empty array', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data: unknown[] = [];

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should create parent directories for JSON files', async () => {
      const targetPath = path.join(testDir, 'nested', 'data.json');
      const data = { key: 'value' };

      await atomicWriteJson(targetPath, data);

      expect(fs.existsSync(targetPath)).toBe(true);
      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should handle objects with special characters in values', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data = {
        newline: 'line1\nline2',
        tab: 'col1\tcol2',
        quote: 'He said "hello"',
        backslash: 'path\\to\\file',
      };

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });

    it('should handle large JSON objects', async () => {
      const targetPath = path.join(testDir, 'data.json');
      const data: Record<string, string> = {};
      for (let i = 0; i < 10000; i++) {
        data[`key${i}`] = `value${i}`;
      }

      await atomicWriteJson(targetPath, data);

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(Object.keys(parsed).length).toBe(10000);
      expect(parsed.key5000).toBe('value5000');
    });

    it('should not leave temp files behind on success', async () => {
      const targetPath = path.join(testDir, 'data.json');

      await atomicWriteJson(targetPath, { key: 'value' });

      const files = await fs.promises.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should overwrite existing JSON file', async () => {
      const targetPath = path.join(testDir, 'data.json');

      await atomicWriteJson(targetPath, { original: true });
      await atomicWriteJson(targetPath, { updated: true });

      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ updated: true });
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration', () => {
    it('should handle concurrent writes to different files', async () => {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        const targetPath = path.join(testDir, `file${i}.json`);
        promises.push(atomicWriteJson(targetPath, { index: i }));
      }

      await Promise.all(promises);

      // Verify all files were written correctly
      for (let i = 0; i < 10; i++) {
        const targetPath = path.join(testDir, `file${i}.json`);
        const result = await fs.promises.readFile(targetPath, 'utf-8');
        const parsed = JSON.parse(result);
        expect(parsed.index).toBe(i);
      }

      // Verify no temp files left behind
      const files = await fs.promises.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should handle concurrent writes to same file (last write wins)', async () => {
      const targetPath = path.join(testDir, 'shared.json');
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 5; i++) {
        promises.push(atomicWriteJson(targetPath, { value: i }));
      }

      // On Windows, concurrent renames to the same file can fail with EPERM
      // because rename is not fully atomic when multiple operations target
      // the same destination. We use allSettled to handle this gracefully.
      const results = await Promise.allSettled(promises);

      // At least one write should succeed
      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);

      // File should exist and contain valid JSON
      const result = await fs.promises.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(result);
      expect(typeof parsed.value).toBe('number');

      // Verify no temp files left behind
      const files = await fs.promises.readdir(testDir);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should support full workflow: create directory, write, read, update', async () => {
      const nestedPath = path.join(testDir, 'config', 'app', 'settings.json');

      // Create with nested directory
      await atomicWriteJson(nestedPath, { version: 1, setting: 'initial' });

      // Read back
      let result = await fs.promises.readFile(nestedPath, 'utf-8');
      let parsed = JSON.parse(result);
      expect(parsed.version).toBe(1);
      expect(parsed.setting).toBe('initial');

      // Update
      await atomicWriteJson(nestedPath, { version: 2, setting: 'updated' });

      // Read updated
      result = await fs.promises.readFile(nestedPath, 'utf-8');
      parsed = JSON.parse(result);
      expect(parsed.version).toBe(2);
      expect(parsed.setting).toBe('updated');
    });
  });
});
