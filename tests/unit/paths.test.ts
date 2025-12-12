import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import {
  normalizePath,
  normalizeUnicode,
  toRelativePath,
  toAbsolutePath,
  isPathTraversal,
  safeJoin,
  isWithinDirectory,
  validatePathLength,
  checkPathLength,
  MAX_PATH_LENGTH_WINDOWS,
  MAX_PATH_LENGTH_UNIX,
  getStorageRoot,
  getIndexPath,
  getIndexesDir,
  getLogsPath,
  getConfigPath,
  getMetadataPath,
  getFingerprintsPath,
  getLanceDbPath,
  getDocsFingerprintsPath,
  getDocsLanceDbPath,
  expandTilde,
  getExtension,
  getBaseName,
  clearStorageRootCache,
} from '../../src/utils/paths.js';

// Mock fs and os modules for testing storage paths
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return {
    ...actual,
    homedir: vi.fn().mockReturnValue(
      process.platform === 'win32' ? 'C:\\Users\\testuser' : '/home/testuser'
    ),
  };
});

describe('Path Utilities', () => {
  describe('normalizePath', () => {
    it('should resolve relative paths to absolute', () => {
      const cwd = process.cwd();
      const result = normalizePath('.');
      expect(result).toBe(cwd);
    });

    it('should normalize parent directory references', () => {
      const cwd = process.cwd();
      const parent = path.dirname(cwd);
      const result = normalizePath('..');
      expect(result).toBe(parent);
    });

    it('should remove trailing separators', () => {
      const testPath =
        process.platform === 'win32' ? 'C:\\Users\\test\\' : '/home/test/';
      const expected =
        process.platform === 'win32' ? 'C:\\Users\\test' : '/home/test';
      const result = normalizePath(testPath);
      expect(result).toBe(expected);
    });

    it('should preserve root path', () => {
      if (process.platform === 'win32') {
        const result = normalizePath('C:\\');
        expect(result).toBe('C:\\');
      } else {
        const result = normalizePath('/');
        expect(result).toBe('/');
      }
    });

    it('should handle paths with redundant separators', () => {
      if (process.platform !== 'win32') {
        const result = normalizePath('/home//test///project');
        expect(result).toBe('/home/test/project');
      }
    });
  });

  describe('toRelativePath', () => {
    it('should convert absolute path to relative with forward slashes', () => {
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';
      const absolutePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project\\src\\utils\\hash.ts'
          : '/Users/dev/project/src/utils/hash.ts';

      const result = toRelativePath(absolutePath, basePath);
      expect(result).toBe('src/utils/hash.ts');
    });

    it('should return empty string for same path', () => {
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';

      const result = toRelativePath(basePath, basePath);
      expect(result).toBe('');
    });

    it('should handle nested paths correctly', () => {
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';
      const absolutePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project\\deeply\\nested\\path\\file.ts'
          : '/Users/dev/project/deeply/nested/path/file.ts';

      const result = toRelativePath(absolutePath, basePath);
      expect(result).toBe('deeply/nested/path/file.ts');
    });

    it('should always use forward slashes regardless of platform', () => {
      // This test verifies the cross-platform consistency requirement
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';
      const absolutePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project\\src\\file.ts'
          : '/Users/dev/project/src/file.ts';

      const result = toRelativePath(absolutePath, basePath);
      expect(result).not.toContain('\\');
      expect(result).toBe('src/file.ts');
    });
  });

  describe('toAbsolutePath', () => {
    it('should convert relative path to absolute', () => {
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';
      const relativePath = 'src/utils/hash.ts';

      const result = toAbsolutePath(relativePath, basePath);
      const expected =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project\\src\\utils\\hash.ts'
          : '/Users/dev/project/src/utils/hash.ts';

      expect(result).toBe(expected);
    });

    it('should handle forward slashes on Windows', () => {
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';

      const result = toAbsolutePath('src/utils/hash.ts', basePath);
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('isPathTraversal', () => {
    it('should detect parent directory traversal', () => {
      expect(isPathTraversal('../../../etc/passwd')).toBe(true);
      expect(isPathTraversal('../file.txt')).toBe(true);
      expect(isPathTraversal('foo/../../../bar')).toBe(true);
    });

    it('should detect absolute paths', () => {
      expect(isPathTraversal('/etc/passwd')).toBe(true);
      expect(isPathTraversal('/home/user/file.txt')).toBe(true);
    });

    it('should detect Windows absolute paths', () => {
      expect(isPathTraversal('C:\\Windows\\System32')).toBe(true);
      expect(isPathTraversal('D:/data/file.txt')).toBe(true);
    });

    it('should detect null byte injection', () => {
      expect(isPathTraversal('file.txt\0.jpg')).toBe(true);
    });

    it('should allow safe relative paths', () => {
      expect(isPathTraversal('src/utils/hash.ts')).toBe(false);
      expect(isPathTraversal('file.txt')).toBe(false);
      expect(isPathTraversal('deeply/nested/path/file.ts')).toBe(false);
    });

    it('should handle mixed separators', () => {
      expect(isPathTraversal('..\\..\\etc\\passwd')).toBe(true);
      expect(isPathTraversal('foo\\..\\..\\bar')).toBe(true);
    });
  });

  describe('safeJoin', () => {
    const basePath =
      process.platform === 'win32'
        ? 'C:\\Users\\dev\\project'
        : '/Users/dev/project';

    it('should join safe relative paths', () => {
      const result = safeJoin(basePath, 'src/utils/hash.ts');
      expect(result).not.toBeNull();
      expect(result).toContain('src');
      expect(result).toContain('utils');
      expect(result).toContain('hash.ts');
    });

    it('should return null for obvious traversal attacks', () => {
      const result = safeJoin(basePath, '../../../../etc/passwd');
      expect(result).toBeNull();
    });

    // SECURITY: Now rejects ALL paths with .. components
    it('should reject all paths containing .. for security', () => {
      // Even paths that would resolve within base are now rejected
      expect(safeJoin(basePath, 'src/../config.ts')).toBeNull();
      expect(safeJoin(basePath, 'foo/../bar/file.ts')).toBeNull();
      expect(safeJoin(basePath, './src/../test')).toBeNull();
    });

    it('should return null for paths escaping base via ..', () => {
      const result = safeJoin(basePath, 'src/../../other-project/file.ts');
      expect(result).toBeNull();
    });

    it('should handle simple file names', () => {
      const result = safeJoin(basePath, 'README.md');
      expect(result).not.toBeNull();
      if (result) {
        expect(result.endsWith('README.md')).toBe(true);
      }
    });

    // Additional security tests for path traversal
    describe('Path Traversal Security', () => {
      it('should reject Unix-style traversal attacks', () => {
        expect(safeJoin(basePath, '../../../etc/passwd')).toBeNull();
        expect(safeJoin(basePath, '..\\..\\..\\etc\\passwd')).toBeNull();
      });

      it('should reject Windows-style traversal attacks', () => {
        expect(safeJoin(basePath, '..\\..\\windows\\system32')).toBeNull();
        expect(safeJoin(basePath, '..\\..\\..\\..\\windows\\system32')).toBeNull();
      });

      it('should reject mixed traversal patterns', () => {
        expect(safeJoin(basePath, 'foo/../../../bar')).toBeNull();
        expect(safeJoin(basePath, 'foo/..\\..\\bar')).toBeNull();
      });

      it('should reject null byte injection', () => {
        expect(safeJoin(basePath, 'file.txt\0.jpg')).toBeNull();
        expect(safeJoin(basePath, 'src/file\0test.ts')).toBeNull();
      });

      it('should reject absolute paths', () => {
        expect(safeJoin(basePath, '/etc/passwd')).toBeNull();
        expect(safeJoin(basePath, 'C:\\Windows\\System32')).toBeNull();
      });

      it('should reject Windows drive letters in relative paths', () => {
        expect(safeJoin(basePath, 'D:/data/file.txt')).toBeNull();
        expect(safeJoin(basePath, 'C:file.txt')).toBeNull();
      });

      it('should handle encoded traversal attempts', () => {
        // These should be caught by the .. check after normalization
        expect(safeJoin(basePath, '..%2F..%2Fetc%2Fpasswd')).toBeNull();
      });
    });
  });

  describe('isWithinDirectory', () => {
    const baseDir =
      process.platform === 'win32'
        ? 'C:\\Users\\dev\\project'
        : '/Users/dev/project';

    it('should return true for paths within directory', () => {
      const targetPath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project\\src\\file.ts'
          : '/Users/dev/project/src/file.ts';

      expect(isWithinDirectory(targetPath, baseDir)).toBe(true);
    });

    it('should return true for the directory itself', () => {
      expect(isWithinDirectory(baseDir, baseDir)).toBe(true);
    });

    it('should return false for paths outside directory', () => {
      const outsidePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\other-project\\file.ts'
          : '/Users/dev/other-project/file.ts';

      expect(isWithinDirectory(outsidePath, baseDir)).toBe(false);
    });

    it('should return false for sibling paths', () => {
      const siblingPath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project-backup\\file.ts'
          : '/Users/dev/project-backup/file.ts';

      expect(isWithinDirectory(siblingPath, baseDir)).toBe(false);
    });
  });

  describe('Storage Path Helpers', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockClear();
      // BUG #10 FIX: Clear cache to ensure fresh behavior for each test
      clearStorageRootCache();
    });

    describe('getStorageRoot', () => {
      it('should return path under home directory', () => {
        const result = getStorageRoot();
        const expectedBase =
          process.platform === 'win32'
            ? 'C:\\Users\\testuser\\.mcp\\search'
            : '/home/testuser/.mcp/search';

        expect(result).toBe(expectedBase);
      });

      it('should create directory if not exists', () => {
        getStorageRoot();
        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), {
          recursive: true,
        });
      });

      it('should not create directory if exists', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        getStorageRoot();
        expect(fs.mkdirSync).not.toHaveBeenCalled();
      });

      it('should cache the result and not call mkdirSync on subsequent calls (BUG #10 FIX)', () => {
        // First call creates directory
        const result1 = getStorageRoot();
        const mkdirCallsAfterFirst = vi.mocked(fs.mkdirSync).mock.calls.length;
        expect(mkdirCallsAfterFirst).toBeGreaterThan(0);

        // Reset mocks
        vi.mocked(fs.mkdirSync).mockClear();

        // Second call should use cached value and not call mkdirSync
        const result2 = getStorageRoot();
        expect(result2).toBe(result1);
        expect(fs.mkdirSync).not.toHaveBeenCalled();
      });
    });

    describe('getIndexPath', () => {
      it('should return path under indexes directory with hash', () => {
        const projectPath =
          process.platform === 'win32'
            ? 'C:\\Users\\dev\\my-project'
            : '/Users/dev/my-project';

        const result = getIndexPath(projectPath);

        expect(result).toContain('.mcp');
        expect(result).toContain('search');
        expect(result).toContain('indexes');
        // SMCP-057: Should contain a hash (32 hex characters for new indexes, 16 for legacy)
        const parts = result.split(path.sep);
        const hash = parts[parts.length - 1];
        expect(hash).toMatch(/^[a-f0-9]{16,32}$/);
      });

      it('should create directory if not exists', () => {
        const projectPath =
          process.platform === 'win32'
            ? 'C:\\Users\\dev\\my-project'
            : '/Users/dev/my-project';

        getIndexPath(projectPath);
        expect(fs.mkdirSync).toHaveBeenCalled();
      });
    });

    describe('getIndexesDir', () => {
      it('should return indexes directory path', () => {
        const result = getIndexesDir();
        const expectedBase =
          process.platform === 'win32'
            ? 'C:\\Users\\testuser\\.mcp\\search\\indexes'
            : '/home/testuser/.mcp/search/indexes';

        expect(result).toBe(expectedBase);
      });
    });
  });

  describe('Index Subdirectory Helpers', () => {
    const indexPath =
      process.platform === 'win32'
        ? 'C:\\Users\\testuser\\.mcp\\search\\indexes\\abc123'
        : '/home/testuser/.mcp/search/indexes/abc123';

    it('getLogsPath should return logs subdirectory', () => {
      const result = getLogsPath(indexPath);
      expect(result).toBe(path.join(indexPath, 'logs'));
    });

    it('getConfigPath should return config.json path', () => {
      const result = getConfigPath(indexPath);
      expect(result).toBe(path.join(indexPath, 'config.json'));
    });

    it('getMetadataPath should return metadata.json path', () => {
      const result = getMetadataPath(indexPath);
      expect(result).toBe(path.join(indexPath, 'metadata.json'));
    });

    it('getFingerprintsPath should return fingerprints.json path', () => {
      const result = getFingerprintsPath(indexPath);
      expect(result).toBe(path.join(indexPath, 'fingerprints.json'));
    });

    it('getLanceDbPath should return index.lancedb path', () => {
      const result = getLanceDbPath(indexPath);
      expect(result).toBe(path.join(indexPath, 'index.lancedb'));
    });
  });

  describe('Utility Functions', () => {
    describe('expandTilde', () => {
      it('should expand ~ to home directory', () => {
        const result = expandTilde('~/documents/file.txt');
        const homeDir =
          process.platform === 'win32'
            ? 'C:\\Users\\testuser'
            : '/home/testuser';

        expect(result.startsWith(homeDir)).toBe(true);
        expect(result).toContain('documents');
        expect(result).toContain('file.txt');
      });

      it('should not modify paths without tilde', () => {
        const inputPath =
          process.platform === 'win32'
            ? 'C:\\Users\\dev\\file.txt'
            : '/Users/dev/file.txt';

        const result = expandTilde(inputPath);
        expect(result).toBe(inputPath);
      });

      it('should handle just tilde', () => {
        const result = expandTilde('~');
        const homeDir =
          process.platform === 'win32'
            ? 'C:\\Users\\testuser'
            : '/home/testuser';

        expect(result).toBe(homeDir);
      });
    });

    describe('getExtension', () => {
      it('should return file extension without dot', () => {
        expect(getExtension('/path/to/file.ts')).toBe('ts');
        expect(getExtension('/path/to/file.test.js')).toBe('js');
        expect(getExtension('file.json')).toBe('json');
      });

      it('should return empty string for no extension', () => {
        expect(getExtension('/path/to/Makefile')).toBe('');
        expect(getExtension('/path/to/file')).toBe('');
      });

      it('should handle dotfiles', () => {
        // Node.js path.extname treats dotfiles as having no extension
        // e.g., .gitignore has basename ".gitignore" with no extension
        expect(getExtension('/path/to/.gitignore')).toBe('');
        expect(getExtension('.env')).toBe('');
        // But files like .eslintrc.json do have an extension
        expect(getExtension('/path/to/.eslintrc.json')).toBe('json');
      });
    });

    describe('getBaseName', () => {
      it('should return file name without extension', () => {
        expect(getBaseName('/path/to/file.ts')).toBe('file');
        expect(getBaseName('/path/to/component.test.js')).toBe('component.test');
        expect(getBaseName('config.json')).toBe('config');
      });

      it('should return full name for files without extension', () => {
        expect(getBaseName('/path/to/Makefile')).toBe('Makefile');
        expect(getBaseName('/path/to/Dockerfile')).toBe('Dockerfile');
      });

      it('should handle dotfiles', () => {
        // Node.js path.basename without extension returns full name for dotfiles
        expect(getBaseName('/path/to/.gitignore')).toBe('.gitignore');
        expect(getBaseName('.env')).toBe('.env');
        // Dotfiles with extensions return name without extension
        expect(getBaseName('/path/to/.eslintrc.json')).toBe('.eslintrc');
      });
    });
  });

  describe('Unicode Normalization', () => {
    describe('normalizeUnicode', () => {
      it('should normalize NFD to NFC', () => {
        // 'e' (U+0065) + combining acute accent (U+0301) -> e (U+00E9)
        const nfd = 'cafe\u0301'; // 'cafe' with decomposed accent
        const nfc = 'caf\u00e9'; // 'cafe' with composed accent
        expect(normalizeUnicode(nfd)).toBe(nfc);
      });

      it('should not change already normalized strings', () => {
        const path = '/home/user/project/src/file.ts';
        expect(normalizeUnicode(path)).toBe(path);
      });

      it('should handle paths with unicode characters', () => {
        const path = '/home/user/projet/fichier.ts';
        expect(normalizeUnicode(path)).toBe('/home/user/projet/fichier.ts');
      });

      it('should handle empty strings', () => {
        expect(normalizeUnicode('')).toBe('');
      });
    });
  });

  describe('Path Length Validation', () => {
    describe('Constants', () => {
      it('should have correct MAX_PATH values', () => {
        expect(MAX_PATH_LENGTH_WINDOWS).toBe(260);
        expect(MAX_PATH_LENGTH_UNIX).toBe(4096);
      });
    });

    describe('validatePathLength', () => {
      it('should return true for normal paths', () => {
        expect(validatePathLength('/home/user/project/file.ts')).toBe(true);
        expect(validatePathLength('C:\\Users\\dev\\project\\file.ts')).toBe(true);
      });

      it('should return true for paths at the limit', () => {
        const maxLength = process.platform === 'win32'
          ? MAX_PATH_LENGTH_WINDOWS
          : MAX_PATH_LENGTH_UNIX;
        const pathAtLimit = 'x'.repeat(maxLength);
        expect(validatePathLength(pathAtLimit)).toBe(true);
      });

      it('should return false for paths exceeding the limit', () => {
        const maxLength = process.platform === 'win32'
          ? MAX_PATH_LENGTH_WINDOWS
          : MAX_PATH_LENGTH_UNIX;
        const pathOverLimit = 'x'.repeat(maxLength + 1);
        expect(validatePathLength(pathOverLimit)).toBe(false);
      });
    });

    describe('checkPathLength', () => {
      it('should return valid for normal paths', () => {
        const testPath = '/home/user/project/file.ts';
        const result = checkPathLength(testPath);
        expect(result.valid).toBe(true);
        expect(result.exceededBy).toBe(0);
        expect(result.length).toBe(testPath.length);
      });

      it('should return invalid for long paths with details', () => {
        const maxLength = process.platform === 'win32'
          ? MAX_PATH_LENGTH_WINDOWS
          : MAX_PATH_LENGTH_UNIX;
        const excessLength = 50;
        const longPath = 'x'.repeat(maxLength + excessLength);

        const result = checkPathLength(longPath);
        expect(result.valid).toBe(false);
        expect(result.length).toBe(maxLength + excessLength);
        expect(result.maxLength).toBe(maxLength);
        expect(result.exceededBy).toBe(excessLength);
      });
    });
  });

  describe('Docs Path Helpers', () => {
    const indexPath =
      process.platform === 'win32'
        ? 'C:\\Users\\testuser\\.mcp\\search\\indexes\\abc123'
        : '/home/testuser/.mcp/search/indexes/abc123';

    it('getDocsFingerprintsPath should return docs-fingerprints.json path', () => {
      const result = getDocsFingerprintsPath(indexPath);
      expect(result).toBe(path.join(indexPath, 'docs-fingerprints.json'));
    });

    it('getDocsLanceDbPath should return docs.lancedb path', () => {
      const result = getDocsLanceDbPath(indexPath);
      expect(result).toBe(path.join(indexPath, 'docs.lancedb'));
    });
  });

  describe('Cross-Platform Consistency', () => {
    it('relative paths should always use forward slashes', () => {
      // This is a key requirement: stored relative paths must be consistent
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';
      const absolutePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project\\deeply\\nested\\file.ts'
          : '/Users/dev/project/deeply/nested/file.ts';

      const relativePath = toRelativePath(absolutePath, basePath);

      // Should never contain backslashes
      expect(relativePath).not.toContain('\\');
      // Should use forward slashes
      expect(relativePath).toBe('deeply/nested/file.ts');
    });

    it('should handle mixed input separators', () => {
      // Someone might accidentally use wrong separators
      const basePath =
        process.platform === 'win32'
          ? 'C:\\Users\\dev\\project'
          : '/Users/dev/project';

      // Using forward slashes even on Windows in relative path
      const result = toAbsolutePath('src/utils/hash.ts', basePath);
      expect(path.isAbsolute(result)).toBe(true);
    });
  });
});
