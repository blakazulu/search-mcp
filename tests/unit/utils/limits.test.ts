/**
 * Input Validation Limits Unit Tests
 *
 * Tests cover:
 * - Query length limits
 * - Glob pattern length limits
 * - Wildcard count limits
 * - ReDoS pattern detection
 * - Brace expansion limits
 * - isPatternSafe validation function
 * - Resource exhaustion limits (DoS protection)
 * - Safe JSON loading
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  MAX_QUERY_LENGTH,
  MAX_GLOB_PATTERN_LENGTH,
  MAX_GLOB_PATTERN_WILDCARDS,
  MAX_GLOB_BRACE_GROUPS,
  MAX_GLOB_BRACE_ITEMS,
  REDOS_PATTERNS,
  isPatternSafe,
  // Resource exhaustion limits
  MAX_CHUNKS_PER_FILE,
  CHUNKS_WARNING_THRESHOLD,
  MAX_PENDING_FILE_EVENTS,
  PENDING_EVENTS_WARNING_THRESHOLD,
  MAX_DIRECTORY_DEPTH,
  MAX_GLOB_RESULTS,
  GLOB_TIMEOUT_MS,
  MAX_JSON_FILE_SIZE,
  // Safe JSON loading
  ResourceLimitError,
  safeLoadJSON,
  safeLoadJSONSync,
} from '../../../src/utils/limits.js';

// ============================================================================
// Constants Tests
// ============================================================================

describe('Input Validation Limits', () => {
  describe('Constants', () => {
    it('should have reasonable MAX_QUERY_LENGTH', () => {
      expect(MAX_QUERY_LENGTH).toBe(1000);
      expect(MAX_QUERY_LENGTH).toBeGreaterThan(0);
    });

    it('should have reasonable MAX_GLOB_PATTERN_LENGTH', () => {
      expect(MAX_GLOB_PATTERN_LENGTH).toBe(200);
      expect(MAX_GLOB_PATTERN_LENGTH).toBeGreaterThan(0);
    });

    it('should have reasonable MAX_GLOB_PATTERN_WILDCARDS', () => {
      expect(MAX_GLOB_PATTERN_WILDCARDS).toBe(10);
      expect(MAX_GLOB_PATTERN_WILDCARDS).toBeGreaterThan(0);
    });

    it('should have reasonable MAX_GLOB_BRACE_GROUPS', () => {
      expect(MAX_GLOB_BRACE_GROUPS).toBe(5);
      expect(MAX_GLOB_BRACE_GROUPS).toBeGreaterThan(0);
    });

    it('should have reasonable MAX_GLOB_BRACE_ITEMS', () => {
      expect(MAX_GLOB_BRACE_ITEMS).toBe(20);
      expect(MAX_GLOB_BRACE_ITEMS).toBeGreaterThan(0);
    });

    it('should have ReDoS patterns defined', () => {
      expect(REDOS_PATTERNS).toBeInstanceOf(Array);
      expect(REDOS_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // isPatternSafe Tests
  // ============================================================================

  describe('isPatternSafe', () => {
    describe('valid patterns', () => {
      it('should accept simple glob patterns', () => {
        const result = isPatternSafe('*.ts');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept recursive glob patterns', () => {
        const result = isPatternSafe('**/*.ts');
        expect(result.valid).toBe(true);
      });

      it('should accept patterns with limited wildcards', () => {
        const result = isPatternSafe('src/**/*.{ts,js}');
        expect(result.valid).toBe(true);
      });

      it('should accept patterns with question marks', () => {
        const result = isPatternSafe('file?.ts');
        expect(result.valid).toBe(true);
      });

      it('should accept patterns with brace expansion', () => {
        const result = isPatternSafe('*.{ts,js,tsx,jsx}');
        expect(result.valid).toBe(true);
      });

      it('should accept empty-ish but valid patterns', () => {
        const result = isPatternSafe('a');
        expect(result.valid).toBe(true);
      });
    });

    describe('pattern length validation', () => {
      it('should reject patterns exceeding max length', () => {
        const longPattern = 'a'.repeat(MAX_GLOB_PATTERN_LENGTH + 1);
        const result = isPatternSafe(longPattern);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('too long');
        expect(result.error).toContain(String(MAX_GLOB_PATTERN_LENGTH));
      });

      it('should accept patterns at max length', () => {
        const exactPattern = 'a'.repeat(MAX_GLOB_PATTERN_LENGTH);
        const result = isPatternSafe(exactPattern);

        expect(result.valid).toBe(true);
      });
    });

    describe('wildcard count validation', () => {
      it('should reject patterns with too many wildcards', () => {
        // Create pattern with more than MAX_GLOB_PATTERN_WILDCARDS wildcards
        const wildcardPattern = '*'.repeat(MAX_GLOB_PATTERN_WILDCARDS + 1);
        const result = isPatternSafe(wildcardPattern);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Too many wildcards');
      });

      it('should accept patterns at max wildcard count (non-consecutive)', () => {
        // Create pattern with exactly MAX_GLOB_PATTERN_WILDCARDS wildcards
        // but spread out to avoid ReDoS pattern detection (triple consecutive stars)
        const wildcardPattern = Array(MAX_GLOB_PATTERN_WILDCARDS).fill('a*').join('');
        const result = isPatternSafe(wildcardPattern);

        expect(result.valid).toBe(true);
      });

      it('should count both * and ? as wildcards', () => {
        const mixedPattern = '*'.repeat(5) + '?'.repeat(MAX_GLOB_PATTERN_WILDCARDS - 4);
        const result = isPatternSafe(mixedPattern);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Too many wildcards');
      });
    });

    describe('ReDoS pattern detection', () => {
      it('should reject triple consecutive stars', () => {
        const result = isPatternSafe('a***b');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous wildcard');
      });

      it('should reject four or more consecutive question marks', () => {
        const result = isPatternSafe('a????b');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous wildcard');
      });

      it('should accept double stars (common recursive pattern)', () => {
        const result = isPatternSafe('**/*.ts');
        expect(result.valid).toBe(true);
      });

      it('should reject alternating *? patterns repeated 3+ times', () => {
        const result = isPatternSafe('a*?*?*?b');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous wildcard');
      });
    });

    describe('brace expansion validation', () => {
      it('should reject too many brace groups', () => {
        const manyBraces = '{a,b}'.repeat(MAX_GLOB_BRACE_GROUPS + 1);
        const result = isPatternSafe(manyBraces);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('brace expansion groups');
      });

      it('should accept max brace groups', () => {
        const maxBraces = '{a,b}'.repeat(MAX_GLOB_BRACE_GROUPS);
        const result = isPatternSafe(maxBraces);

        expect(result.valid).toBe(true);
      });

      it('should reject too many items in brace expansion', () => {
        // Create a single brace group with too many items
        const manyItems = '{' + Array(MAX_GLOB_BRACE_ITEMS + 1).fill('a').join(',') + '}';
        const result = isPatternSafe(manyItems);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('items in brace expansion');
      });

      it('should count total items across all brace groups', () => {
        // Create multiple brace groups that together exceed the limit
        const items = Math.ceil(MAX_GLOB_BRACE_ITEMS / 2) + 1;
        const braceGroup = '{' + Array(items).fill('a').join(',') + '}';
        const result = isPatternSafe(braceGroup + braceGroup);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('items in brace expansion');
      });
    });

    describe('edge cases', () => {
      it('should handle empty pattern', () => {
        const result = isPatternSafe('');
        // Empty pattern is length 0, which passes length check
        // No wildcards, no ReDoS patterns, no braces
        expect(result.valid).toBe(true);
      });

      it('should handle pattern with only numbers and letters', () => {
        const result = isPatternSafe('src/utils/hash.ts');
        expect(result.valid).toBe(true);
      });

      it('should handle pattern with escaped characters', () => {
        const result = isPatternSafe('file\\*.ts');
        expect(result.valid).toBe(true);
      });

      it('should handle nested braces', () => {
        // Nested braces - just counts top-level groups
        const result = isPatternSafe('*.{ts,{js,jsx}}');
        expect(result.valid).toBe(true);
      });
    });
  });
});

// ============================================================================
// Resource Exhaustion Limits Tests (DoS Protection)
// ============================================================================

describe('Resource Exhaustion Limits (DoS Protection)', () => {
  describe('Constants', () => {
    it('should have reasonable MAX_CHUNKS_PER_FILE', () => {
      expect(MAX_CHUNKS_PER_FILE).toBe(1000);
      expect(MAX_CHUNKS_PER_FILE).toBeGreaterThan(0);
    });

    it('should have CHUNKS_WARNING_THRESHOLD at 80% of max', () => {
      expect(CHUNKS_WARNING_THRESHOLD).toBe(Math.floor(MAX_CHUNKS_PER_FILE * 0.8));
    });

    it('should have reasonable MAX_PENDING_FILE_EVENTS', () => {
      expect(MAX_PENDING_FILE_EVENTS).toBe(1000);
      expect(MAX_PENDING_FILE_EVENTS).toBeGreaterThan(0);
    });

    it('should have PENDING_EVENTS_WARNING_THRESHOLD at 80% of max', () => {
      expect(PENDING_EVENTS_WARNING_THRESHOLD).toBe(Math.floor(MAX_PENDING_FILE_EVENTS * 0.8));
    });

    it('should have reasonable MAX_DIRECTORY_DEPTH', () => {
      expect(MAX_DIRECTORY_DEPTH).toBe(20);
      expect(MAX_DIRECTORY_DEPTH).toBeGreaterThan(0);
    });

    it('should have reasonable MAX_GLOB_RESULTS', () => {
      expect(MAX_GLOB_RESULTS).toBe(100000);
      expect(MAX_GLOB_RESULTS).toBeGreaterThan(0);
    });

    it('should have reasonable GLOB_TIMEOUT_MS', () => {
      expect(GLOB_TIMEOUT_MS).toBe(30000);
      expect(GLOB_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('should have reasonable MAX_JSON_FILE_SIZE (10MB)', () => {
      expect(MAX_JSON_FILE_SIZE).toBe(10 * 1024 * 1024);
      expect(MAX_JSON_FILE_SIZE).toBeGreaterThan(0);
    });
  });

  describe('ResourceLimitError', () => {
    it('should create error with limit details', () => {
      const error = new ResourceLimitError('TEST_LIMIT', 100, 50);
      expect(error.name).toBe('ResourceLimitError');
      expect(error.limitName).toBe('TEST_LIMIT');
      expect(error.actualValue).toBe(100);
      expect(error.maxValue).toBe(50);
      expect(error.message).toContain('TEST_LIMIT');
      expect(error.message).toContain('100');
      expect(error.message).toContain('50');
    });

    it('should use custom message when provided', () => {
      const error = new ResourceLimitError('TEST', 10, 5, 'Custom error message');
      expect(error.message).toBe('Custom error message');
    });
  });
});

// ============================================================================
// Safe JSON Loading Tests
// ============================================================================

describe('Safe JSON Loading', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'limits-test-'));
    testFile = path.join(tempDir, 'test.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('safeLoadJSON', () => {
    it('should load valid JSON file', async () => {
      const data = { name: 'test', value: 42 };
      fs.writeFileSync(testFile, JSON.stringify(data));

      const result = await safeLoadJSON<typeof data>(testFile);
      expect(result).toEqual(data);
    });

    it('should throw ResourceLimitError for oversized file', async () => {
      // Create a file larger than the custom limit
      const smallLimit = 100;
      const largeData = 'x'.repeat(smallLimit + 1);
      fs.writeFileSync(testFile, largeData);

      await expect(safeLoadJSON(testFile, smallLimit))
        .rejects
        .toThrow(ResourceLimitError);
    });

    it('should throw ResourceLimitError with correct details', async () => {
      const smallLimit = 50;
      const data = { key: 'a'.repeat(100) };
      fs.writeFileSync(testFile, JSON.stringify(data));

      try {
        await safeLoadJSON(testFile, smallLimit);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ResourceLimitError);
        const rle = error as ResourceLimitError;
        expect(rle.limitName).toBe('JSON_FILE_SIZE');
        expect(rle.maxValue).toBe(smallLimit);
        expect(rle.actualValue).toBeGreaterThan(smallLimit);
      }
    });

    it('should throw for non-existent file', async () => {
      await expect(safeLoadJSON('/nonexistent/file.json'))
        .rejects
        .toThrow();
    });

    it('should throw for invalid JSON', async () => {
      fs.writeFileSync(testFile, 'not valid json {');

      await expect(safeLoadJSON(testFile))
        .rejects
        .toThrow(SyntaxError);
    });

    it('should accept file at exactly max size', async () => {
      const limit = 100;
      // Create JSON that is exactly the limit size
      const exactData = JSON.stringify({ a: 'x'.repeat(limit - 10) });
      // Adjust to exactly match the limit
      const padding = limit - exactData.length;
      if (padding > 0) {
        fs.writeFileSync(testFile, exactData.slice(0, -1) + ' '.repeat(padding) + '}');
      } else {
        fs.writeFileSync(testFile, exactData.slice(0, limit));
      }

      // This should not throw since it's at or under the limit
      const stats = fs.statSync(testFile);
      if (stats.size <= limit) {
        await expect(safeLoadJSON(testFile, limit)).resolves.toBeDefined();
      }
    });
  });

  describe('safeLoadJSONSync', () => {
    it('should load valid JSON file synchronously', () => {
      const data = { name: 'test', value: 42 };
      fs.writeFileSync(testFile, JSON.stringify(data));

      const result = safeLoadJSONSync<typeof data>(testFile);
      expect(result).toEqual(data);
    });

    it('should throw ResourceLimitError for oversized file', () => {
      const smallLimit = 100;
      const largeData = 'x'.repeat(smallLimit + 1);
      fs.writeFileSync(testFile, largeData);

      expect(() => safeLoadJSONSync(testFile, smallLimit))
        .toThrow(ResourceLimitError);
    });

    it('should throw for non-existent file', () => {
      expect(() => safeLoadJSONSync('/nonexistent/file.json'))
        .toThrow();
    });

    it('should throw for invalid JSON', () => {
      fs.writeFileSync(testFile, 'not valid json {');

      expect(() => safeLoadJSONSync(testFile))
        .toThrow(SyntaxError);
    });
  });
});
