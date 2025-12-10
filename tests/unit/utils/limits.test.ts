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
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_QUERY_LENGTH,
  MAX_GLOB_PATTERN_LENGTH,
  MAX_GLOB_PATTERN_WILDCARDS,
  MAX_GLOB_BRACE_GROUPS,
  MAX_GLOB_BRACE_ITEMS,
  REDOS_PATTERNS,
  isPatternSafe,
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
