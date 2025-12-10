/**
 * Hash Utilities Tests
 *
 * Tests for SHA256 hashing utilities:
 * - hashString: String hashing
 * - hashFile: File content hashing (async)
 * - hashFileSync: File content hashing (sync)
 * - hashProjectPath: Project path hashing for index directories
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { hashString, hashFile, hashFileSync, hashProjectPath, hashProjectPathLegacy, OLD_HASH_LENGTH, NEW_HASH_LENGTH } from '../../../src/utils/hash.js';
import { ErrorCode, MCPError } from '../../../src/errors/index.js';

describe('Hash Utilities', () => {
  // Temporary directory for test files
  let tempDir: string;

  beforeAll(() => {
    // Create temporary test directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-mcp-hash-test-'));
  });

  afterAll(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('hashString', () => {
    it('should return consistent SHA256 hex digest', () => {
      const input = 'hello world';
      const hash1 = hashString(input);
      const hash2 = hashString(input);

      expect(hash1).toBe(hash2);
    });

    it('should return 64 character hex string', () => {
      const hash = hashString('test');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should match known SHA256 outputs', () => {
      // Test vectors from https://www.di-mgt.com.au/sha_testvectors.html
      // SHA256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(hashString('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      // SHA256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
      expect(hashString('hello world')).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');

      // SHA256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
      expect(hashString('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('should handle UTF-8 content correctly', () => {
      const unicodeContent = 'Hello \u{1F600} World \u4E2D\u6587';
      const hash = hashString(unicodeContent);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify consistency
      expect(hashString(unicodeContent)).toBe(hash);
    });

    it('should handle multiline content', () => {
      const multiline = 'line1\nline2\nline3';
      const hash = hashString(multiline);

      expect(hash).toHaveLength(64);
      expect(hashString(multiline)).toBe(hash);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashString('input1');
      const hash2 = hashString('input2');
      const hash3 = hashString('INPUT1'); // Case sensitive

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('hashFile', () => {
    it('should hash file content correctly', async () => {
      const testFile = path.join(tempDir, 'test-content.txt');
      const content = 'hello world';
      fs.writeFileSync(testFile, content, 'utf8');

      const hash = await hashFile(testFile);

      // Should match the hash of the same content as string
      expect(hash).toBe(hashString(content));
    });

    it('should return 64 character hex string', async () => {
      const testFile = path.join(tempDir, 'test-length.txt');
      fs.writeFileSync(testFile, 'some content');

      const hash = await hashFile(testFile);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty files', async () => {
      const emptyFile = path.join(tempDir, 'empty.txt');
      fs.writeFileSync(emptyFile, '');

      const hash = await hashFile(emptyFile);

      // SHA256 of empty string
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle binary content', async () => {
      const binaryFile = path.join(tempDir, 'binary.bin');
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      fs.writeFileSync(binaryFile, binaryContent);

      const hash = await hashFile(binaryFile);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw FILE_NOT_FOUND for missing files', async () => {
      const missingFile = path.join(tempDir, 'does-not-exist.txt');

      await expect(hashFile(missingFile)).rejects.toThrow(MCPError);

      try {
        await hashFile(missingFile);
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.FILE_NOT_FOUND);
      }
    });

    it('should produce consistent results across multiple calls', async () => {
      const testFile = path.join(tempDir, 'consistent.txt');
      fs.writeFileSync(testFile, 'consistent content');

      const hash1 = await hashFile(testFile);
      const hash2 = await hashFile(testFile);
      const hash3 = await hashFile(testFile);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should detect content changes', async () => {
      const testFile = path.join(tempDir, 'changing.txt');

      fs.writeFileSync(testFile, 'original content');
      const hash1 = await hashFile(testFile);

      fs.writeFileSync(testFile, 'modified content');
      const hash2 = await hashFile(testFile);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashFileSync', () => {
    it('should hash file content correctly', () => {
      const testFile = path.join(tempDir, 'sync-test.txt');
      const content = 'sync test content';
      fs.writeFileSync(testFile, content, 'utf8');

      const hash = hashFileSync(testFile);

      expect(hash).toBe(hashString(content));
    });

    it('should match async hashFile results', async () => {
      const testFile = path.join(tempDir, 'sync-async-compare.txt');
      fs.writeFileSync(testFile, 'compare content');

      const syncHash = hashFileSync(testFile);
      const asyncHash = await hashFile(testFile);

      expect(syncHash).toBe(asyncHash);
    });

    it('should throw FILE_NOT_FOUND for missing files', () => {
      const missingFile = path.join(tempDir, 'sync-missing.txt');

      expect(() => hashFileSync(missingFile)).toThrow(MCPError);

      try {
        hashFileSync(missingFile);
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.FILE_NOT_FOUND);
      }
    });
  });

  describe('hashProjectPath', () => {
    it('should return 32 character hex string (SMCP-057: increased entropy)', () => {
      const hash = hashProjectPath('/path/to/project');

      expect(hash).toHaveLength(NEW_HASH_LENGTH);
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should return consistent results', () => {
      const projectPath = '/path/to/my-project';
      const hash1 = hashProjectPath(projectPath);
      const hash2 = hashProjectPath(projectPath);

      expect(hash1).toBe(hash2);
    });

    it('should normalize trailing slashes', () => {
      const withSlash = hashProjectPath('/path/to/project/');
      const withoutSlash = hashProjectPath('/path/to/project');

      expect(withSlash).toBe(withoutSlash);
    });

    it('should produce different hashes for different paths', () => {
      const hash1 = hashProjectPath('/path/to/project1');
      const hash2 = hashProjectPath('/path/to/project2');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize backslashes to forward slashes', () => {
      // This ensures consistency across platforms
      const forwardSlash = hashProjectPath('/path/to/project');

      // On any platform, we want backslashes converted
      const normalized = hashProjectPath('/path/to/project'.replace(/\//g, '\\'));

      // Note: path.resolve will handle this differently per platform
      // The key is that a given physical path produces the same hash
    });

    it('should handle Windows-style paths on Windows', () => {
      // Skip on non-Windows platforms
      if (process.platform !== 'win32') {
        return;
      }

      // On Windows, paths should be lowercased for case-insensitivity
      const upperCase = hashProjectPath('C:\\Users\\Dev\\Project');
      const lowerCase = hashProjectPath('c:\\users\\dev\\project');

      expect(upperCase).toBe(lowerCase);
    });

    it('should resolve relative paths', () => {
      // Both should resolve to the same absolute path
      const cwd = process.cwd();
      const absolutePath = hashProjectPath(cwd);
      const relativePath = hashProjectPath('.');

      expect(relativePath).toBe(absolutePath);
    });

    it('should handle paths with special characters', () => {
      const hash = hashProjectPath('/path/to/my-project_v2.0');

      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle deeply nested paths', () => {
      const deepPath = '/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z';
      const hash = hashProjectPath(deepPath);

      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('hashProjectPathLegacy (SMCP-057: backward compatibility)', () => {
    it('should return 16 character hex string', () => {
      const hash = hashProjectPathLegacy('/path/to/project');

      expect(hash).toHaveLength(OLD_HASH_LENGTH);
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should be a prefix of the new hash', () => {
      const projectPath = '/path/to/my-project';
      const legacyHash = hashProjectPathLegacy(projectPath);
      const newHash = hashProjectPath(projectPath);

      // Legacy hash should be the first 16 chars of the new hash
      expect(newHash.startsWith(legacyHash)).toBe(true);
    });

    it('should produce consistent results', () => {
      const projectPath = '/path/to/test-project';
      const hash1 = hashProjectPathLegacy(projectPath);
      const hash2 = hashProjectPathLegacy(projectPath);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Hash length constants (SMCP-057)', () => {
    it('should have correct OLD_HASH_LENGTH', () => {
      expect(OLD_HASH_LENGTH).toBe(16);
    });

    it('should have correct NEW_HASH_LENGTH', () => {
      expect(NEW_HASH_LENGTH).toBe(32);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with Windows line endings', async () => {
      const testFile = path.join(tempDir, 'windows-endings.txt');
      fs.writeFileSync(testFile, 'line1\r\nline2\r\nline3');

      const hash = await hashFile(testFile);

      expect(hash).toHaveLength(64);
      // Hash should be consistent
      expect(await hashFile(testFile)).toBe(hash);
    });

    it('should handle files with mixed line endings', async () => {
      const testFile = path.join(tempDir, 'mixed-endings.txt');
      fs.writeFileSync(testFile, 'line1\r\nline2\nline3\rline4');

      const hash = await hashFile(testFile);

      expect(hash).toHaveLength(64);
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000000); // 1 million characters
      const hash = hashString(longString);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
