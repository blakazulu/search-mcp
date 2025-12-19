import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorCode,
  MCPError,
  MCPErrorOptions,
  indexNotFound,
  modelDownloadFailed,
  indexCorrupt,
  fileLimitWarning,
  permissionDenied,
  diskFull,
  fileNotFound,
  invalidPattern,
  projectNotDetected,
  symlinkNotAllowed,
  isMCPError,
  wrapError,
} from '../../../src/errors/index.js';
import { resetLogger } from '../../../src/utils/logger.js';

describe('Error Handling System', () => {
  beforeEach(() => {
    // Reset logger to prevent log file creation during tests
    resetLogger();
  });

  describe('ErrorCode enum', () => {
    it('should define all 10 error codes', () => {
      expect(ErrorCode.INDEX_NOT_FOUND).toBe('INDEX_NOT_FOUND');
      expect(ErrorCode.MODEL_DOWNLOAD_FAILED).toBe('MODEL_DOWNLOAD_FAILED');
      expect(ErrorCode.INDEX_CORRUPT).toBe('INDEX_CORRUPT');
      expect(ErrorCode.FILE_LIMIT_WARNING).toBe('FILE_LIMIT_WARNING');
      expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
      expect(ErrorCode.DISK_FULL).toBe('DISK_FULL');
      expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCode.INVALID_PATTERN).toBe('INVALID_PATTERN');
      expect(ErrorCode.PROJECT_NOT_DETECTED).toBe('PROJECT_NOT_DETECTED');
      expect(ErrorCode.SYMLINK_NOT_ALLOWED).toBe('SYMLINK_NOT_ALLOWED');
    });

    it('should have exactly 12 error codes', () => {
      const codes = Object.values(ErrorCode);
      expect(codes.length).toBe(12);
    });

    it('should have unique values for each code', () => {
      const codes = Object.values(ErrorCode);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('MCPError class', () => {
    it('should extend Error', () => {
      const error = new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage: 'User message',
        developerMessage: 'Developer message',
      });
      expect(error instanceof Error).toBe(true);
      expect(error instanceof MCPError).toBe(true);
    });

    it('should set all properties correctly', () => {
      const error = new MCPError({
        code: ErrorCode.FILE_NOT_FOUND,
        userMessage: 'File not found message',
        developerMessage: 'Technical details here',
      });

      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(error.userMessage).toBe('File not found message');
      expect(error.developerMessage).toBe('Technical details here');
      expect(error.message).toBe('Technical details here');
    });

    it('should set cause when provided', () => {
      const cause = new Error('Original error');
      const error = new MCPError({
        code: ErrorCode.MODEL_DOWNLOAD_FAILED,
        userMessage: 'User message',
        developerMessage: 'Developer message',
        cause,
      });

      expect(error.cause).toBe(cause);
    });

    it('should have undefined cause when not provided', () => {
      const error = new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage: 'User message',
        developerMessage: 'Developer message',
      });

      expect(error.cause).toBeUndefined();
    });

    it('should capture stack trace', () => {
      const error = new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage: 'User message',
        developerMessage: 'Developer message',
      });

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('MCPError');
    });

    it('should set name to include error code', () => {
      const error = new MCPError({
        code: ErrorCode.DISK_FULL,
        userMessage: 'User message',
        developerMessage: 'Developer message',
      });

      expect(error.name).toBe('MCPError[DISK_FULL]');
    });

    describe('toJSON()', () => {
      it('should serialize error to JSON without cause', () => {
        const error = new MCPError({
          code: ErrorCode.INDEX_NOT_FOUND,
          userMessage: 'No index found',
          developerMessage: 'Index not at /path/to/index',
        });

        const json = error.toJSON();

        expect(json).toEqual({
          code: 'INDEX_NOT_FOUND',
          userMessage: 'No index found',
          developerMessage: 'Index not at /path/to/index',
          cause: undefined,
        });
      });

      it('should serialize error to JSON with cause', () => {
        const cause = new Error('Network timeout');
        cause.name = 'NetworkError';

        const error = new MCPError({
          code: ErrorCode.MODEL_DOWNLOAD_FAILED,
          userMessage: 'Download failed',
          developerMessage: 'Failed to download model: Network timeout',
          cause,
        });

        const json = error.toJSON();

        expect(json.code).toBe('MODEL_DOWNLOAD_FAILED');
        expect(json.userMessage).toBe('Download failed');
        expect(json.developerMessage).toBe('Failed to download model: Network timeout');
        expect(json.cause).toEqual({
          name: 'NetworkError',
          message: 'Network timeout',
        });
      });

      it('should produce valid JSON string', () => {
        const error = new MCPError({
          code: ErrorCode.INVALID_PATTERN,
          userMessage: 'Invalid pattern',
          developerMessage: 'Pattern has unmatched brackets',
        });

        const jsonString = JSON.stringify(error);
        const parsed = JSON.parse(jsonString);

        expect(parsed.code).toBe('INVALID_PATTERN');
        expect(parsed.userMessage).toBe('Invalid pattern');
      });
    });

    describe('toString()', () => {
      it('should return formatted string representation', () => {
        const error = new MCPError({
          code: ErrorCode.PERMISSION_DENIED,
          userMessage: 'Access denied',
          developerMessage: 'Cannot read /root/secret',
        });

        expect(error.toString()).toBe('MCPError[PERMISSION_DENIED]: Cannot read /root/secret');
      });
    });
  });

  describe('Factory Functions', () => {
    describe('indexNotFound()', () => {
      it('should create INDEX_NOT_FOUND error with correct messages', () => {
        const error = indexNotFound('/path/to/index');

        expect(error.code).toBe(ErrorCode.INDEX_NOT_FOUND);
        expect(error.userMessage).toContain('No search index exists');
        expect(error.userMessage).toContain('create_index');
        expect(error.developerMessage).toContain('/path/to/index');
      });

      it('should not expose internal path in user message', () => {
        const error = indexNotFound('/secret/internal/path/to/index');

        expect(error.userMessage).not.toContain('/secret');
        expect(error.developerMessage).toContain('/secret/internal/path/to/index');
      });
    });

    describe('modelDownloadFailed()', () => {
      it('should create MODEL_DOWNLOAD_FAILED error with cause', () => {
        const cause = new Error('Connection refused');
        const error = modelDownloadFailed(cause);

        expect(error.code).toBe(ErrorCode.MODEL_DOWNLOAD_FAILED);
        expect(error.userMessage).toContain('Failed to download');
        expect(error.userMessage).toContain('internet connection');
        expect(error.developerMessage).toContain('Connection refused');
        expect(error.cause).toBe(cause);
      });
    });

    describe('indexCorrupt()', () => {
      it('should create INDEX_CORRUPT error with details', () => {
        const error = indexCorrupt('Missing vector table in LanceDB');

        expect(error.code).toBe(ErrorCode.INDEX_CORRUPT);
        expect(error.userMessage).toContain('corrupted');
        expect(error.userMessage).toContain('reindex_project');
        expect(error.developerMessage).toContain('Missing vector table in LanceDB');
      });
    });

    describe('fileLimitWarning()', () => {
      it('should create FILE_LIMIT_WARNING with counts', () => {
        const error = fileLimitWarning(15000, 10000);

        expect(error.code).toBe(ErrorCode.FILE_LIMIT_WARNING);
        expect(error.userMessage).toContain('15,000');
        expect(error.userMessage).toContain('10,000');
        expect(error.userMessage).toContain('slow');
        expect(error.developerMessage).toContain('15000');
        expect(error.developerMessage).toContain('10000');
      });

      it('should format large numbers with locale', () => {
        const error = fileLimitWarning(1234567, 1000000);

        // The formatted numbers depend on locale, but should contain separators
        expect(error.userMessage).toMatch(/\d.*\d/);
      });
    });

    describe('permissionDenied()', () => {
      it('should create PERMISSION_DENIED error', () => {
        const error = permissionDenied('/protected/file.txt');

        expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
        expect(error.userMessage).toContain('Access denied');
        expect(error.userMessage).not.toContain('/protected');
        expect(error.developerMessage).toContain('/protected/file.txt');
      });
    });

    describe('diskFull()', () => {
      it('should create DISK_FULL error with formatted sizes', () => {
        // 500MB needed, 100MB available
        const error = diskFull(500 * 1024 * 1024, 100 * 1024 * 1024);

        expect(error.code).toBe(ErrorCode.DISK_FULL);
        expect(error.userMessage).toContain('disk space');
        expect(error.developerMessage).toContain('500.0 MB');
        expect(error.developerMessage).toContain('100.0 MB');
      });

      it('should format bytes correctly', () => {
        // Test different size ranges
        const errorBytes = diskFull(500, 100);
        expect(errorBytes.developerMessage).toContain('500 B');

        const errorKB = diskFull(5000, 1000);
        expect(errorKB.developerMessage).toContain('KB');

        const errorGB = diskFull(5 * 1024 * 1024 * 1024, 1024 * 1024 * 1024);
        expect(errorGB.developerMessage).toContain('GB');
      });
    });

    describe('fileNotFound()', () => {
      it('should create FILE_NOT_FOUND error', () => {
        const error = fileNotFound('/path/to/missing/file.ts');

        expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
        expect(error.userMessage).toContain('could not be found');
        expect(error.userMessage).not.toContain('/path/to');
        expect(error.developerMessage).toContain('/path/to/missing/file.ts');
      });
    });

    describe('invalidPattern()', () => {
      it('should create INVALID_PATTERN error with pattern and details', () => {
        const error = invalidPattern('**[.ts', 'Unclosed bracket');

        expect(error.code).toBe(ErrorCode.INVALID_PATTERN);
        expect(error.userMessage).toContain('pattern is invalid');
        expect(error.developerMessage).toContain('**[.ts');
        expect(error.developerMessage).toContain('Unclosed bracket');
      });
    });

    describe('projectNotDetected()', () => {
      it('should create PROJECT_NOT_DETECTED error', () => {
        const error = projectNotDetected('/some/random/directory');

        expect(error.code).toBe(ErrorCode.PROJECT_NOT_DETECTED);
        expect(error.userMessage).toContain('Could not detect');
        expect(error.userMessage).toContain('package.json');
        expect(error.userMessage).toContain('.git');
        expect(error.developerMessage).toContain('/some/random/directory');
      });
    });

    describe('symlinkNotAllowed()', () => {
      it('should create SYMLINK_NOT_ALLOWED error', () => {
        const error = symlinkNotAllowed('/path/to/symlink');

        expect(error.code).toBe(ErrorCode.SYMLINK_NOT_ALLOWED);
        expect(error.userMessage).toContain('Symbolic links are not allowed');
        expect(error.userMessage).toContain('security');
        expect(error.developerMessage).toContain('/path/to/symlink');
        expect(error.developerMessage).toContain('Symbolic link detected');
      });
    });
  });

  describe('Type Guards and Utilities', () => {
    describe('isMCPError()', () => {
      it('should return true for MCPError instances', () => {
        const error = new MCPError({
          code: ErrorCode.INDEX_NOT_FOUND,
          userMessage: 'User message',
          developerMessage: 'Dev message',
        });

        expect(isMCPError(error)).toBe(true);
      });

      it('should return true for factory-created errors', () => {
        expect(isMCPError(indexNotFound('/path'))).toBe(true);
        expect(isMCPError(fileNotFound('/path'))).toBe(true);
        expect(isMCPError(invalidPattern('**', 'error'))).toBe(true);
        expect(isMCPError(symlinkNotAllowed('/path'))).toBe(true);
      });

      it('should return false for regular Error instances', () => {
        const error = new Error('Regular error');
        expect(isMCPError(error)).toBe(false);
      });

      it('should return false for non-error values', () => {
        expect(isMCPError(null)).toBe(false);
        expect(isMCPError(undefined)).toBe(false);
        expect(isMCPError('error string')).toBe(false);
        expect(isMCPError({ code: 'INDEX_NOT_FOUND' })).toBe(false);
        expect(isMCPError(42)).toBe(false);
      });
    });

    describe('wrapError()', () => {
      it('should return MCPError unchanged', () => {
        const mcpError = indexNotFound('/path');
        const wrapped = wrapError(mcpError);

        expect(wrapped).toBe(mcpError);
      });

      it('should wrap regular Error in MCPError', () => {
        const originalError = new Error('Something went wrong');
        const wrapped = wrapError(originalError, ErrorCode.INDEX_CORRUPT, 'Processing failed');

        expect(isMCPError(wrapped)).toBe(true);
        expect(wrapped.code).toBe(ErrorCode.INDEX_CORRUPT);
        expect(wrapped.developerMessage).toContain('Processing failed');
        expect(wrapped.developerMessage).toContain('Something went wrong');
        expect(wrapped.cause).toBe(originalError);
      });

      it('should wrap string error in MCPError', () => {
        const wrapped = wrapError('String error message', ErrorCode.FILE_NOT_FOUND);

        expect(isMCPError(wrapped)).toBe(true);
        expect(wrapped.developerMessage).toContain('String error message');
        expect(wrapped.cause?.message).toBe('String error message');
      });

      it('should wrap unknown values in MCPError', () => {
        const wrapped = wrapError(42);

        expect(isMCPError(wrapped)).toBe(true);
        expect(wrapped.developerMessage).toContain('42');
      });

      it('should use default code when not specified', () => {
        const wrapped = wrapError(new Error('Test'));

        expect(wrapped.code).toBe(ErrorCode.INDEX_CORRUPT);
      });

      it('should use default context when not specified', () => {
        const wrapped = wrapError(new Error('Test'));

        expect(wrapped.developerMessage).toContain('unexpected error');
      });

      it('should have generic user message for wrapped errors', () => {
        const wrapped = wrapError(new Error('Test'));

        expect(wrapped.userMessage).toContain('unexpected error');
        expect(wrapped.userMessage).toContain('try again');
      });
    });
  });

  describe('Error properties are readonly', () => {
    // Note: TypeScript's 'readonly' modifier only enforces immutability at compile time.
    // At runtime, JavaScript does not prevent property reassignment unless using Object.freeze
    // or property descriptors. These tests verify the TypeScript contract is in place.

    it('should have code property that TypeScript marks as readonly', () => {
      const error = indexNotFound('/path');

      // The property exists and has the expected value
      expect(error.code).toBe(ErrorCode.INDEX_NOT_FOUND);

      // TypeScript would prevent reassignment at compile time
      // This test documents that the readonly contract exists
      expect(Object.prototype.hasOwnProperty.call(error, 'code')).toBe(true);
    });

    it('should have userMessage property that TypeScript marks as readonly', () => {
      const error = indexNotFound('/path');

      // The property exists and has the expected value
      expect(error.userMessage).toContain('No search index exists');

      // TypeScript would prevent reassignment at compile time
      expect(Object.prototype.hasOwnProperty.call(error, 'userMessage')).toBe(true);
    });

    it('should have developerMessage property that TypeScript marks as readonly', () => {
      const error = indexNotFound('/path');

      // The property exists and has the expected value
      expect(error.developerMessage).toContain('/path');

      // TypeScript would prevent reassignment at compile time
      expect(Object.prototype.hasOwnProperty.call(error, 'developerMessage')).toBe(true);
    });
  });

  describe('User message safety', () => {
    it('should not expose file paths in user messages', () => {
      const errors = [
        indexNotFound('/users/john/projects/secret-project/.mcp/index'),
        permissionDenied('/etc/passwd'),
        fileNotFound('/var/log/sensitive.log'),
        projectNotDetected('/home/user/documents/confidential'),
      ];

      for (const error of errors) {
        expect(error.userMessage).not.toMatch(/\/users?\//i);
        expect(error.userMessage).not.toMatch(/\/etc\//);
        expect(error.userMessage).not.toMatch(/\/var\//);
        expect(error.userMessage).not.toMatch(/\/home\//);
        expect(error.userMessage).not.toMatch(/C:\\/i);
      }
    });

    it('should include paths in developer messages', () => {
      const testPath = '/users/john/secret/file.txt';
      const errors = [
        indexNotFound(testPath),
        permissionDenied(testPath),
        fileNotFound(testPath),
        projectNotDetected(testPath),
      ];

      for (const error of errors) {
        expect(error.developerMessage).toContain(testPath);
      }
    });
  });
});
