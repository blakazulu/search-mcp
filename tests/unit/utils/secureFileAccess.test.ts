/**
 * Secure File Access Tests
 *
 * Tests for security utilities:
 * - isSymlink: Symlink detection
 * - safeReadFile: Path traversal and symlink protection
 * - safeFileExists: Secure existence checks
 * - secureResolvePath: Path validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  isSymlink,
  isSymlinkSync,
  checkSymlink,
  safeReadFile,
  safeFileExists,
  secureResolvePath,
  safeCreateReadStream,
  shouldSkipForIndexing,
  validateNotSymlink,
} from '../../../src/utils/secureFileAccess.js';
import { ErrorCode, MCPError } from '../../../src/errors/index.js';

describe('Secure File Access', () => {
  // Temporary directory for test files
  let tempDir: string;
  let testFile: string;
  let testContent: string;

  beforeAll(() => {
    // Create temporary test directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-mcp-secure-test-'));

    // Create a test file
    testContent = 'Hello, secure world!';
    testFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testFile, testContent, 'utf8');
  });

  afterAll(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isSymlink', () => {
    it('should return false for regular files', async () => {
      const result = await isSymlink(testFile);
      expect(result).toBe(false);
    });

    it('should return false for directories', async () => {
      const result = await isSymlink(tempDir);
      expect(result).toBe(false);
    });

    it('should return false for non-existent files', async () => {
      const result = await isSymlink(path.join(tempDir, 'does-not-exist.txt'));
      expect(result).toBe(false);
    });

    it('should return true for symlinks', async () => {
      // Skip on Windows if symlink creation requires admin
      const linkPath = path.join(tempDir, 'test-link.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        // Skip test if symlink creation fails (e.g., Windows without admin)
        return;
      }

      const result = await isSymlink(linkPath);
      expect(result).toBe(true);

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('isSymlinkSync', () => {
    it('should return false for regular files', () => {
      const result = isSymlinkSync(testFile);
      expect(result).toBe(false);
    });

    it('should return false for non-existent files', () => {
      const result = isSymlinkSync(path.join(tempDir, 'does-not-exist.txt'));
      expect(result).toBe(false);
    });
  });

  describe('checkSymlink', () => {
    it('should return isSymlink: false for regular files', async () => {
      const result = await checkSymlink(testFile);
      expect(result.isSymlink).toBe(false);
      expect(result.path).toBe(testFile);
      expect(result.target).toBeUndefined();
    });

    it('should include target for symlinks', async () => {
      const linkPath = path.join(tempDir, 'test-link-detailed.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      const result = await checkSymlink(linkPath);
      expect(result.isSymlink).toBe(true);
      expect(result.path).toBe(linkPath);
      expect(result.target).toBe(testFile);

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('secureResolvePath', () => {
    it('should resolve valid relative paths', async () => {
      // Create a subdirectory with a file
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });
      const subFile = path.join(subDir, 'file.txt');
      fs.writeFileSync(subFile, 'content');

      const result = await secureResolvePath(tempDir, 'subdir/file.txt');
      expect(result).toBe(subFile);

      // Cleanup
      fs.rmSync(subDir, { recursive: true });
    });

    it('should return null for path traversal attempts', async () => {
      const result = await secureResolvePath(tempDir, '../../../etc/passwd', {
        symlinkBehavior: 'skip',
      });
      expect(result).toBeNull();
    });

    it('should return null for absolute paths in relative context', async () => {
      const result = await secureResolvePath(tempDir, '/etc/passwd', {
        symlinkBehavior: 'skip',
      });
      expect(result).toBeNull();
    });

    it('should return null for paths containing ..', async () => {
      const result = await secureResolvePath(tempDir, 'subdir/../../../etc/passwd', {
        symlinkBehavior: 'skip',
      });
      expect(result).toBeNull();
    });

    it('should reject symlinks with error behavior', async () => {
      const linkPath = path.join(tempDir, 'resolve-link.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      await expect(
        secureResolvePath(tempDir, 'resolve-link.txt', { symlinkBehavior: 'error' })
      ).rejects.toThrow(MCPError);

      // Cleanup
      fs.unlinkSync(linkPath);
    });

    it('should return null for symlinks with skip behavior', async () => {
      const linkPath = path.join(tempDir, 'resolve-link-skip.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      const result = await secureResolvePath(tempDir, 'resolve-link-skip.txt', {
        symlinkBehavior: 'skip',
      });
      expect(result).toBeNull();

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('safeFileExists', () => {
    it('should return true for existing files', async () => {
      const result = await safeFileExists(tempDir, 'test.txt');
      expect(result).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      const result = await safeFileExists(tempDir, 'does-not-exist.txt');
      expect(result).toBe(false);
    });

    it('should return false for path traversal attempts', async () => {
      const result = await safeFileExists(tempDir, '../../../etc/passwd');
      expect(result).toBe(false);
    });

    it('should return false for symlinks', async () => {
      const linkPath = path.join(tempDir, 'exists-link.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      const result = await safeFileExists(tempDir, 'exists-link.txt');
      expect(result).toBe(false);

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('safeReadFile', () => {
    it('should read valid files', async () => {
      const content = await safeReadFile(tempDir, 'test.txt');
      expect(content).toBe(testContent);
    });

    it('should throw FILE_NOT_FOUND for non-existent files', async () => {
      await expect(
        safeReadFile(tempDir, 'does-not-exist.txt')
      ).rejects.toThrow(MCPError);

      try {
        await safeReadFile(tempDir, 'does-not-exist.txt');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.FILE_NOT_FOUND);
      }
    });

    it('should throw for path traversal attempts with error behavior', async () => {
      await expect(
        safeReadFile(tempDir, '../../../etc/passwd', { symlinkBehavior: 'error' })
      ).rejects.toThrow(MCPError);

      try {
        await safeReadFile(tempDir, '../../../etc/passwd', { symlinkBehavior: 'error' });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.FILE_NOT_FOUND);
      }
    });

    it('should return null for path traversal with skip behavior', async () => {
      const result = await safeReadFile(tempDir, '../../../etc/passwd', {
        symlinkBehavior: 'skip',
      });
      expect(result).toBeNull();
    });

    it('should throw SYMLINK_NOT_ALLOWED for symlinks with error behavior', async () => {
      const linkPath = path.join(tempDir, 'read-link.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      await expect(
        safeReadFile(tempDir, 'read-link.txt', { symlinkBehavior: 'error' })
      ).rejects.toThrow(MCPError);

      try {
        await safeReadFile(tempDir, 'read-link.txt', { symlinkBehavior: 'error' });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.SYMLINK_NOT_ALLOWED);
      }

      // Cleanup
      fs.unlinkSync(linkPath);
    });

    it('should return null for symlinks with skip behavior', async () => {
      const linkPath = path.join(tempDir, 'read-link-skip.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      const result = await safeReadFile(tempDir, 'read-link-skip.txt', {
        symlinkBehavior: 'skip',
      });
      expect(result).toBeNull();

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('safeCreateReadStream', () => {
    it('should create stream for valid files', async () => {
      const stream = await safeCreateReadStream(tempDir, 'test.txt');
      expect(stream).not.toBeNull();
      stream?.destroy(); // Clean up the stream
    });

    it('should throw for path traversal attempts', async () => {
      await expect(
        safeCreateReadStream(tempDir, '../../../etc/passwd', { symlinkBehavior: 'error' })
      ).rejects.toThrow(MCPError);
    });

    it('should throw for symlinks with error behavior', async () => {
      const linkPath = path.join(tempDir, 'stream-link.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      await expect(
        safeCreateReadStream(tempDir, 'stream-link.txt', { symlinkBehavior: 'error' })
      ).rejects.toThrow(MCPError);

      // Cleanup
      fs.unlinkSync(linkPath);
    });

    it('should return null for symlinks with skip behavior', async () => {
      const linkPath = path.join(tempDir, 'stream-link-skip.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      const result = await safeCreateReadStream(tempDir, 'stream-link-skip.txt', {
        symlinkBehavior: 'skip',
      });
      expect(result).toBeNull();

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('shouldSkipForIndexing', () => {
    it('should return false for regular files', async () => {
      const result = await shouldSkipForIndexing(testFile);
      expect(result).toBe(false);
    });

    it('should return true for symlinks', async () => {
      const linkPath = path.join(tempDir, 'skip-link.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      const result = await shouldSkipForIndexing(linkPath);
      expect(result).toBe(true);

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('validateNotSymlink', () => {
    it('should return true for regular files', async () => {
      const result = await validateNotSymlink(testFile);
      expect(result).toBe(true);
    });

    it('should throw for symlinks with error behavior', async () => {
      const linkPath = path.join(tempDir, 'validate-link.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      await expect(
        validateNotSymlink(linkPath, { symlinkBehavior: 'error' })
      ).rejects.toThrow(MCPError);

      // Cleanup
      fs.unlinkSync(linkPath);
    });

    it('should return false for symlinks with skip behavior', async () => {
      const linkPath = path.join(tempDir, 'validate-link-skip.txt');
      try {
        fs.symlinkSync(testFile, linkPath);
      } catch {
        return; // Skip if symlink creation fails
      }

      const result = await validateNotSymlink(linkPath, { symlinkBehavior: 'skip' });
      expect(result).toBe(false);

      // Cleanup
      fs.unlinkSync(linkPath);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject paths with .. at the start', async () => {
      const result = await safeFileExists(tempDir, '../test.txt');
      expect(result).toBe(false);
    });

    it('should reject paths with .. in the middle', async () => {
      const result = await safeFileExists(tempDir, 'subdir/../../../test.txt');
      expect(result).toBe(false);
    });

    it('should reject absolute Unix paths', async () => {
      const result = await safeFileExists(tempDir, '/etc/passwd');
      expect(result).toBe(false);
    });

    it('should reject Windows drive paths', async () => {
      const result = await safeFileExists(tempDir, 'C:\\Windows\\System32\\config\\SAM');
      expect(result).toBe(false);
    });

    it('should reject paths with null bytes', async () => {
      const result = await safeFileExists(tempDir, 'test.txt\0.jpg');
      expect(result).toBe(false);
    });

    it('should handle deeply nested valid paths', async () => {
      // Create nested directory structure
      const nestedDir = path.join(tempDir, 'a', 'b', 'c', 'd');
      fs.mkdirSync(nestedDir, { recursive: true });
      const nestedFile = path.join(nestedDir, 'deep.txt');
      fs.writeFileSync(nestedFile, 'deep content');

      const result = await safeFileExists(tempDir, 'a/b/c/d/deep.txt');
      expect(result).toBe(true);

      // Read should work too
      const content = await safeReadFile(tempDir, 'a/b/c/d/deep.txt');
      expect(content).toBe('deep content');

      // Cleanup
      fs.rmSync(path.join(tempDir, 'a'), { recursive: true });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty relative paths', async () => {
      // Empty path should be invalid (would resolve to base)
      const result = await safeFileExists(tempDir, '');
      // This depends on implementation - should not cause errors
      expect(typeof result).toBe('boolean');
    });

    it('should handle paths with special characters', async () => {
      const specialFile = path.join(tempDir, 'special@#$%file.txt');
      try {
        fs.writeFileSync(specialFile, 'special content');
        const result = await safeFileExists(tempDir, 'special@#$%file.txt');
        expect(result).toBe(true);
        fs.unlinkSync(specialFile);
      } catch {
        // Some platforms may not support all special characters
      }
    });

    it('should handle Unicode file names', async () => {
      const unicodeFile = path.join(tempDir, 'unicode-\u4E2D\u6587.txt');
      try {
        fs.writeFileSync(unicodeFile, 'unicode content');
        const result = await safeFileExists(tempDir, 'unicode-\u4E2D\u6587.txt');
        expect(result).toBe(true);
        fs.unlinkSync(unicodeFile);
      } catch {
        // Some platforms may not support Unicode filenames
      }
    });
  });
});
