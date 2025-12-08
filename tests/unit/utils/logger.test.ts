import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  LogLevel,
  Logger,
  createLogger,
  getLogger,
  resetLogger,
  getDefaultLogDir,
  parseLogLevel,
} from '../../../src/utils/logger.js';

describe('Logger Module', () => {
  const testDir = path.join(os.tmpdir(), 'search-mcp-logger-test-' + Date.now());
  const testLogDir = path.join(testDir, 'logs');

  beforeEach(() => {
    // Reset the singleton before each test
    resetLogger();
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    resetLogger();
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('LogLevel enum', () => {
    it('should have correct numeric values', () => {
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
    });

    it('should have ERROR as most severe (lowest value)', () => {
      expect(LogLevel.ERROR).toBeLessThan(LogLevel.WARN);
      expect(LogLevel.WARN).toBeLessThan(LogLevel.INFO);
      expect(LogLevel.INFO).toBeLessThan(LogLevel.DEBUG);
    });
  });

  describe('createLogger', () => {
    it('should create a logger with the specified index path', () => {
      const logger = createLogger(testDir);
      expect(logger).toBeDefined();
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should create log directory under the index path', () => {
      createLogger(testDir);
      expect(fs.existsSync(testLogDir)).toBe(true);
    });

    it('should set the specified log level', () => {
      const logger = createLogger(testDir, { level: LogLevel.DEBUG });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should default to INFO log level', () => {
      const logger = createLogger(testDir);
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('getLogger', () => {
    it('should return the same instance after createLogger', () => {
      const logger1 = createLogger(testDir);
      const logger2 = getLogger();
      expect(logger2).toBe(logger1);
    });

    it('should create a console-only logger if none exists', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('Log level filtering', () => {
    it('should write ERROR logs when level is ERROR', () => {
      const logger = createLogger(testDir, { level: LogLevel.ERROR });

      logger.error('test', 'error message');
      logger.warn('test', 'warn message');
      logger.info('test', 'info message');
      logger.debug('test', 'debug message');

      // Give time for async writes
      const logFile = path.join(testLogDir, 'search-mcp.log');

      // Wait a tick for the write queue to process
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('error message');
          expect(content).not.toContain('warn message');
          expect(content).not.toContain('info message');
          expect(content).not.toContain('debug message');
          resolve();
        }, 100);
      });
    });

    it('should write ERROR and WARN logs when level is WARN', () => {
      const logger = createLogger(testDir, { level: LogLevel.WARN });

      logger.error('test', 'error message');
      logger.warn('test', 'warn message');
      logger.info('test', 'info message');
      logger.debug('test', 'debug message');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('error message');
          expect(content).toContain('warn message');
          expect(content).not.toContain('info message');
          expect(content).not.toContain('debug message');
          resolve();
        }, 100);
      });
    });

    it('should write ERROR, WARN, and INFO logs when level is INFO', () => {
      const logger = createLogger(testDir, { level: LogLevel.INFO });

      logger.error('test', 'error message');
      logger.warn('test', 'warn message');
      logger.info('test', 'info message');
      logger.debug('test', 'debug message');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('error message');
          expect(content).toContain('warn message');
          expect(content).toContain('info message');
          expect(content).not.toContain('debug message');
          resolve();
        }, 100);
      });
    });

    it('should write all logs when level is DEBUG', () => {
      const logger = createLogger(testDir, { level: LogLevel.DEBUG });

      logger.error('test', 'error message');
      logger.warn('test', 'warn message');
      logger.info('test', 'info message');
      logger.debug('test', 'debug message');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('error message');
          expect(content).toContain('warn message');
          expect(content).toContain('info message');
          expect(content).toContain('debug message');
          resolve();
        }, 100);
      });
    });

    it('should respect setLevel() changes', () => {
      const logger = createLogger(testDir, { level: LogLevel.ERROR });

      logger.info('test', 'should not appear');
      logger.setLevel(LogLevel.INFO);
      logger.info('test', 'should appear');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).not.toContain('should not appear');
          expect(content).toContain('should appear');
          resolve();
        }, 100);
      });
    });
  });

  describe('Log format', () => {
    it('should format logs with ISO timestamp', () => {
      const logger = createLogger(testDir, { level: LogLevel.INFO });
      logger.info('indexing', 'test message');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          // Match ISO 8601 timestamp pattern
          expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]/);
          resolve();
        }, 100);
      });
    });

    it('should include log level in format', () => {
      const logger = createLogger(testDir, { level: LogLevel.DEBUG });

      logger.error('test', 'error msg');
      logger.warn('test', 'warn msg');
      logger.info('test', 'info msg');
      logger.debug('test', 'debug msg');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('[ERROR]');
          expect(content).toContain('[WARN]');
          expect(content).toContain('[INFO]');
          expect(content).toContain('[DEBUG]');
          resolve();
        }, 100);
      });
    });

    it('should include component name in format', () => {
      const logger = createLogger(testDir, { level: LogLevel.INFO });
      logger.info('indexing', 'processing file');
      logger.info('embedding', 'generating vectors');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('[indexing]');
          expect(content).toContain('[embedding]');
          resolve();
        }, 100);
      });
    });

    it('should include metadata as JSON when provided', () => {
      const logger = createLogger(testDir, { level: LogLevel.INFO });
      logger.info('indexing', 'indexed file', { file: 'test.ts', chunks: 3 });

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('"file":"test.ts"');
          expect(content).toContain('"chunks":3');
          resolve();
        }, 100);
      });
    });

    it('should match expected format pattern', () => {
      const logger = createLogger(testDir, { level: LogLevel.INFO });
      logger.info('indexing', 'Indexed file: src/auth/login.ts', { chunks: 3 });

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const content = fs.readFileSync(logFile, 'utf-8');
          // Should match: [ISO_TIMESTAMP] [LEVEL] [COMPONENT] Message
          expect(content).toMatch(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] \[INFO\] \[indexing\] Indexed file: src\/auth\/login\.ts/
          );
          resolve();
        }, 100);
      });
    });
  });

  describe('Log file creation', () => {
    it('should create log file in the specified directory', () => {
      const logger = createLogger(testDir);
      logger.info('test', 'test message');

      const logFile = path.join(testLogDir, 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(fs.existsSync(logFile)).toBe(true);
          resolve();
        }, 100);
      });
    });

    it('should use custom file name when specified', () => {
      const logger = createLogger(testDir, { fileName: 'custom.log' });
      logger.info('test', 'test message');

      const logFile = path.join(testLogDir, 'custom.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(fs.existsSync(logFile)).toBe(true);
          resolve();
        }, 100);
      });
    });

    it('should handle missing directory gracefully by creating it', () => {
      const nestedDir = path.join(testDir, 'nested', 'path', 'to', 'index');
      const logger = createLogger(nestedDir);
      logger.info('test', 'test message');

      const logFile = path.join(nestedDir, 'logs', 'search-mcp.log');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(fs.existsSync(logFile)).toBe(true);
          resolve();
        }, 100);
      });
    });
  });

  describe('Log file rotation', () => {
    it('should rotate log file when it exceeds max size', () => {
      // Create logger with small max file size for testing
      const logger = createLogger(testDir, {
        level: LogLevel.DEBUG,
        maxFileSize: 500, // 500 bytes
        maxFiles: 3
      });

      const logFile = path.join(testLogDir, 'search-mcp.log');
      const rotatedFile1 = path.join(testLogDir, 'search-mcp.1.log');

      // Write enough data to trigger rotation
      for (let i = 0; i < 20; i++) {
        logger.info('test', `Message number ${i} with some extra content to make it longer`);
      }

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Current log should exist
          expect(fs.existsSync(logFile)).toBe(true);
          // Rotated file should exist after overflow
          expect(fs.existsSync(rotatedFile1)).toBe(true);
          resolve();
        }, 200);
      });
    });

    it('should keep only max number of rotated files', () => {
      const logger = createLogger(testDir, {
        level: LogLevel.DEBUG,
        maxFileSize: 200, // Small size to trigger rotation quickly
        maxFiles: 2
      });

      const rotatedFile1 = path.join(testLogDir, 'search-mcp.1.log');
      const rotatedFile2 = path.join(testLogDir, 'search-mcp.2.log');

      // Write many messages to trigger multiple rotations
      for (let i = 0; i < 50; i++) {
        logger.info('test', `Message ${i} - extra padding content for size`);
      }

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // With maxFiles=2, we should have at most 2 rotated files (plus current)
          // search-mcp.1.log should exist, search-mcp.2.log might not exist if we didn't rotate enough
          // but we definitely shouldn't have more than maxFiles rotated files
          const logDir = testLogDir;
          const files = fs.readdirSync(logDir);
          const rotatedFiles = files.filter(f => /search-mcp\.\d+\.log/.test(f));
          expect(rotatedFiles.length).toBeLessThanOrEqual(2);
          resolve();
        }, 300);
      });
    });
  });

  describe('Console fallback', () => {
    it('should fallback to console when no log directory is set', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const logger = getLogger(); // Gets console-only logger
      logger.error('test', 'console error message');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(consoleSpy).toHaveBeenCalled();
          const callArg = consoleSpy.mock.calls[0][0];
          expect(callArg).toContain('console error message');
          consoleSpy.mockRestore();
          resolve();
        }, 100);
      });
    });
  });

  describe('getDefaultLogDir', () => {
    it('should return correct path structure', () => {
      const hash = 'abc123';
      const logDir = getDefaultLogDir(hash);

      expect(logDir).toContain('.mcp');
      expect(logDir).toContain('search');
      expect(logDir).toContain('indexes');
      expect(logDir).toContain(hash);
      expect(logDir).toContain('logs');
    });

    it('should be under home directory', () => {
      const hash = 'abc123';
      const logDir = getDefaultLogDir(hash);

      expect(logDir.startsWith(os.homedir())).toBe(true);
    });
  });

  describe('parseLogLevel', () => {
    it('should parse ERROR level', () => {
      expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('error')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('Error')).toBe(LogLevel.ERROR);
    });

    it('should parse WARN level', () => {
      expect(parseLogLevel('WARN')).toBe(LogLevel.WARN);
      expect(parseLogLevel('warn')).toBe(LogLevel.WARN);
      expect(parseLogLevel('WARNING')).toBe(LogLevel.WARN);
      expect(parseLogLevel('warning')).toBe(LogLevel.WARN);
    });

    it('should parse INFO level', () => {
      expect(parseLogLevel('INFO')).toBe(LogLevel.INFO);
      expect(parseLogLevel('info')).toBe(LogLevel.INFO);
    });

    it('should parse DEBUG level', () => {
      expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
      expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
    });

    it('should default to INFO for unknown values', () => {
      expect(parseLogLevel('unknown')).toBe(LogLevel.INFO);
      expect(parseLogLevel('')).toBe(LogLevel.INFO);
      expect(parseLogLevel('TRACE')).toBe(LogLevel.INFO);
    });
  });

  describe('resetLogger', () => {
    it('should reset the singleton instance', () => {
      const logger1 = createLogger(testDir);
      logger1.info('test', 'message');

      resetLogger();

      const logger2 = getLogger();
      expect(logger2).not.toBe(logger1);
    });
  });
});
