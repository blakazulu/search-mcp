/**
 * Search Result Processing Utilities Unit Tests
 *
 * Tests cover:
 * - Whitespace trimming
 * - Same-file deduplication
 * - Range merging logic
 * - Combined processing
 */

import { describe, it, expect } from 'vitest';
import {
  trimChunkWhitespace,
  areRangesMergeable,
  deduplicateSameFileResults,
  processSearchResults,
  formatCompactResult,
  formatCompactResults,
  formatCompactOutput,
  SearchResultItem,
  CompactSearchResult,
  CompactSearchOutput,
} from '../../../src/utils/searchResultProcessing.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createResult(
  overrides: Partial<SearchResultItem> = {}
): SearchResultItem {
  return {
    path: 'test.ts',
    text: 'function test() { return 42; }',
    score: 0.8,
    startLine: 1,
    endLine: 3,
    ...overrides,
  };
}

// ============================================================================
// trimChunkWhitespace Tests
// ============================================================================

describe('trimChunkWhitespace', () => {
  it('should remove leading blank lines', () => {
    const input = '\n\n  function foo() {\n    return 42;\n  }';
    const expected = '  function foo() {\n    return 42;\n  }';
    expect(trimChunkWhitespace(input)).toBe(expected);
  });

  it('should remove trailing blank lines', () => {
    const input = '  function foo() {\n    return 42;\n  }\n\n';
    const expected = '  function foo() {\n    return 42;\n  }';
    expect(trimChunkWhitespace(input)).toBe(expected);
  });

  it('should remove both leading and trailing blank lines', () => {
    const input = '\n\n  function foo() {\n    return 42;\n  }\n\n';
    const expected = '  function foo() {\n    return 42;\n  }';
    expect(trimChunkWhitespace(input)).toBe(expected);
  });

  it('should preserve internal blank lines', () => {
    const input = '  function foo() {\n\n    return 42;\n  }';
    expect(trimChunkWhitespace(input)).toBe(input);
  });

  it('should preserve indentation', () => {
    const input = '    function foo() {\n      return 42;\n    }';
    expect(trimChunkWhitespace(input)).toBe(input);
  });

  it('should handle lines with only whitespace as blank', () => {
    const input = '   \n  \n  function foo() {\n  }';
    const expected = '  function foo() {\n  }';
    expect(trimChunkWhitespace(input)).toBe(expected);
  });

  it('should handle empty string', () => {
    expect(trimChunkWhitespace('')).toBe('');
  });

  it('should handle string with only blank lines', () => {
    expect(trimChunkWhitespace('\n\n  \n\n')).toBe('');
  });

  it('should handle single line without newlines', () => {
    const input = 'const x = 42;';
    expect(trimChunkWhitespace(input)).toBe(input);
  });

  it('should handle null/undefined gracefully', () => {
    expect(trimChunkWhitespace(null as unknown as string)).toBe(null);
    expect(trimChunkWhitespace(undefined as unknown as string)).toBe(undefined);
  });

  it('should handle markdown content', () => {
    const input = '\n\n# Getting Started\n\nThis is a guide.\n\n';
    const expected = '# Getting Started\n\nThis is a guide.';
    expect(trimChunkWhitespace(input)).toBe(expected);
  });

  it('should handle code with comments', () => {
    const input = `
// Comment at the top

function test() {
  // Inner comment
  return true;
}

`;
    const expected = `// Comment at the top

function test() {
  // Inner comment
  return true;
}`;
    expect(trimChunkWhitespace(input)).toBe(expected);
  });
});

// ============================================================================
// areRangesMergeable Tests
// ============================================================================

describe('areRangesMergeable', () => {
  it('should return true for overlapping ranges', () => {
    // Range 1: 1-10, Range 2: 5-15
    expect(areRangesMergeable(1, 10, 5, 15)).toBe(true);
  });

  it('should return true for adjacent ranges', () => {
    // Range 1: 1-10, Range 2: 11-20 (adjacent)
    expect(areRangesMergeable(1, 10, 11, 20)).toBe(true);
  });

  it('should return true for adjacent ranges (reverse order)', () => {
    // Range 1: 11-20, Range 2: 1-10
    expect(areRangesMergeable(11, 20, 1, 10)).toBe(true);
  });

  it('should return false for non-adjacent, non-overlapping ranges', () => {
    // Range 1: 1-10, Range 2: 15-25 (gap of 4 lines)
    expect(areRangesMergeable(1, 10, 15, 25)).toBe(false);
  });

  it('should return true for identical ranges', () => {
    expect(areRangesMergeable(1, 10, 1, 10)).toBe(true);
  });

  it('should return true for contained ranges', () => {
    // Range 1: 1-20, Range 2: 5-15 (2 is inside 1)
    expect(areRangesMergeable(1, 20, 5, 15)).toBe(true);
  });

  it('should return true for containing ranges', () => {
    // Range 1: 5-15, Range 2: 1-20 (1 is inside 2)
    expect(areRangesMergeable(5, 15, 1, 20)).toBe(true);
  });

  it('should return true for ranges 1 line apart', () => {
    // Range 1: 1-10, Range 2: 11-20 (immediately adjacent)
    expect(areRangesMergeable(1, 10, 11, 20)).toBe(true);
  });

  it('should return false for ranges 2 or more lines apart', () => {
    // Range 1: 1-10, Range 2: 12-20 (1 line gap = 2 line difference)
    expect(areRangesMergeable(1, 10, 12, 20)).toBe(false);
  });
});

// ============================================================================
// deduplicateSameFileResults Tests
// ============================================================================

describe('deduplicateSameFileResults', () => {
  it('should return empty array for empty input', () => {
    expect(deduplicateSameFileResults([])).toEqual([]);
  });

  it('should return single result unchanged', () => {
    const result = createResult();
    const output = deduplicateSameFileResults([result]);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({
      path: result.path,
      text: result.text,
      score: result.score,
    });
  });

  it('should not merge results from different files', () => {
    const results = [
      createResult({ path: 'file1.ts', startLine: 1, endLine: 10, score: 0.9 }),
      createResult({ path: 'file2.ts', startLine: 1, endLine: 10, score: 0.8 }),
    ];
    const output = deduplicateSameFileResults(results);
    expect(output).toHaveLength(2);
    // Should be sorted by score
    expect(output[0].path).toBe('file1.ts');
    expect(output[1].path).toBe('file2.ts');
  });

  it('should merge overlapping chunks from the same file', () => {
    const results = [
      createResult({
        path: 'test.ts',
        text: 'function foo() {\n  return 1;\n}',
        startLine: 1,
        endLine: 10,
        score: 0.8,
      }),
      createResult({
        path: 'test.ts',
        text: '  return 1;\n}\n\nfunction bar() {',
        startLine: 5,
        endLine: 15,
        score: 0.7,
      }),
    ];
    const output = deduplicateSameFileResults(results);
    expect(output).toHaveLength(1);
    expect(output[0].startLine).toBe(1);
    expect(output[0].endLine).toBe(15);
    expect(output[0].score).toBe(0.8); // Highest score
  });

  it('should merge adjacent chunks from the same file', () => {
    const results = [
      createResult({
        path: 'test.ts',
        text: 'function foo() {',
        startLine: 1,
        endLine: 10,
        score: 0.6,
      }),
      createResult({
        path: 'test.ts',
        text: 'function bar() {',
        startLine: 11,
        endLine: 20,
        score: 0.9,
      }),
    ];
    const output = deduplicateSameFileResults(results);
    expect(output).toHaveLength(1);
    expect(output[0].startLine).toBe(1);
    expect(output[0].endLine).toBe(20);
    expect(output[0].score).toBe(0.9); // Highest score
  });

  it('should not merge non-adjacent chunks from the same file', () => {
    const results = [
      createResult({
        path: 'test.ts',
        text: 'function foo() {',
        startLine: 1,
        endLine: 10,
        score: 0.9,
      }),
      createResult({
        path: 'test.ts',
        text: 'function bar() {',
        startLine: 50,
        endLine: 60,
        score: 0.8,
      }),
    ];
    const output = deduplicateSameFileResults(results);
    expect(output).toHaveLength(2);
    // Should be sorted by score
    expect(output[0].startLine).toBe(1);
    expect(output[1].startLine).toBe(50);
  });

  it('should use highest score among merged chunks', () => {
    const results = [
      createResult({
        path: 'test.ts',
        startLine: 1,
        endLine: 10,
        score: 0.5,
      }),
      createResult({
        path: 'test.ts',
        startLine: 5,
        endLine: 15,
        score: 0.9,
      }),
      createResult({
        path: 'test.ts',
        startLine: 10,
        endLine: 20,
        score: 0.7,
      }),
    ];
    const output = deduplicateSameFileResults(results);
    expect(output).toHaveLength(1);
    expect(output[0].score).toBe(0.9);
  });

  it('should sort final results by score descending', () => {
    const results = [
      createResult({ path: 'a.ts', startLine: 1, endLine: 10, score: 0.5 }),
      createResult({ path: 'b.ts', startLine: 1, endLine: 10, score: 0.9 }),
      createResult({ path: 'c.ts', startLine: 1, endLine: 10, score: 0.7 }),
    ];
    const output = deduplicateSameFileResults(results);
    expect(output[0].score).toBe(0.9);
    expect(output[1].score).toBe(0.7);
    expect(output[2].score).toBe(0.5);
  });

  it('should handle multiple merge groups in same file', () => {
    // Two separate groups of overlapping chunks
    const results = [
      createResult({
        path: 'test.ts',
        startLine: 1,
        endLine: 10,
        score: 0.9,
      }),
      createResult({
        path: 'test.ts',
        startLine: 5,
        endLine: 15,
        score: 0.8,
      }),
      // Gap here
      createResult({
        path: 'test.ts',
        startLine: 100,
        endLine: 110,
        score: 0.7,
      }),
      createResult({
        path: 'test.ts',
        startLine: 105,
        endLine: 115,
        score: 0.6,
      }),
    ];
    const output = deduplicateSameFileResults(results);
    expect(output).toHaveLength(2);
    // First group (higher score)
    expect(output[0].startLine).toBe(1);
    expect(output[0].endLine).toBe(15);
    expect(output[0].score).toBe(0.9);
    // Second group
    expect(output[1].startLine).toBe(100);
    expect(output[1].endLine).toBe(115);
    expect(output[1].score).toBe(0.7);
  });

  it('should preserve extra properties on result objects', () => {
    interface ExtendedResult extends SearchResultItem {
      extraProp: string;
    }
    const results: ExtendedResult[] = [
      {
        path: 'test.ts',
        text: 'test',
        score: 0.8,
        startLine: 1,
        endLine: 10,
        extraProp: 'value1',
      },
    ];
    const output = deduplicateSameFileResults(results);
    expect(output[0].extraProp).toBe('value1');
  });
});

// ============================================================================
// processSearchResults Tests (Combined Processing)
// ============================================================================

describe('processSearchResults', () => {
  it('should return empty array for empty input', () => {
    expect(processSearchResults([])).toEqual([]);
  });

  it('should trim whitespace and deduplicate in one pass', () => {
    const results = [
      createResult({
        path: 'test.ts',
        text: '\n\nfunction foo() {\n  return 1;\n}\n\n',
        startLine: 1,
        endLine: 10,
        score: 0.8,
      }),
      createResult({
        path: 'test.ts',
        text: '\n  return 1;\n}\n\nfunction bar() {\n\n',
        startLine: 5,
        endLine: 15,
        score: 0.7,
      }),
    ];
    const output = processSearchResults(results);

    expect(output).toHaveLength(1);
    // Text should be trimmed
    expect(output[0].text.startsWith('\n')).toBe(false);
    expect(output[0].text.endsWith('\n')).toBe(false);
    // Ranges should be merged
    expect(output[0].startLine).toBe(1);
    expect(output[0].endLine).toBe(15);
  });

  it('should handle results from multiple files', () => {
    const results = [
      createResult({
        path: 'file1.ts',
        text: '\ncode1\n',
        startLine: 1,
        endLine: 10,
        score: 0.9,
      }),
      createResult({
        path: 'file2.ts',
        text: '\ncode2\n',
        startLine: 1,
        endLine: 10,
        score: 0.8,
      }),
    ];
    const output = processSearchResults(results);

    expect(output).toHaveLength(2);
    expect(output[0].text).toBe('code1');
    expect(output[1].text).toBe('code2');
  });

  it('should apply trimming before deduplication', () => {
    // This ensures that trimming happens first so deduplication
    // works on clean text
    const results = [
      createResult({
        path: 'test.ts',
        text: '\n\nfunction foo() {\n}\n\n',
        startLine: 1,
        endLine: 10,
        score: 0.9,
      }),
    ];
    const output = processSearchResults(results);

    expect(output[0].text).toBe('function foo() {\n}');
  });

  it('should handle markdown documentation', () => {
    const results = [
      createResult({
        path: 'README.md',
        text: '\n\n# Title\n\nContent here.\n\n',
        startLine: 1,
        endLine: 5,
        score: 0.85,
      }),
    ];
    const output = processSearchResults(results);

    expect(output[0].text).toBe('# Title\n\nContent here.');
  });

  it('should reduce duplicate file path entries', () => {
    // Simulate 5 overlapping chunks from the same file
    const results = [
      createResult({ path: 'big-file.ts', startLine: 1, endLine: 50, score: 0.9 }),
      createResult({ path: 'big-file.ts', startLine: 40, endLine: 90, score: 0.85 }),
      createResult({ path: 'big-file.ts', startLine: 80, endLine: 130, score: 0.8 }),
      createResult({ path: 'big-file.ts', startLine: 120, endLine: 170, score: 0.75 }),
      createResult({ path: 'big-file.ts', startLine: 160, endLine: 210, score: 0.7 }),
    ];
    const output = processSearchResults(results);

    // All chunks should be merged into one since they're all adjacent/overlapping
    expect(output).toHaveLength(1);
    expect(output[0].startLine).toBe(1);
    expect(output[0].endLine).toBe(210);
    expect(output[0].score).toBe(0.9); // Highest score
  });
});

// ============================================================================
// Compact Format Tests
// ============================================================================

describe('formatCompactResult', () => {
  it('should combine path and line numbers into location string', () => {
    const result = createResult({
      path: 'src/utils/hash.ts',
      startLine: 10,
      endLine: 25,
    });
    const compact = formatCompactResult(result);

    expect(compact.l).toBe('src/utils/hash.ts:10-25');
  });

  it('should round score to 2 decimal places', () => {
    const result = createResult({ score: 0.87654321 });
    const compact = formatCompactResult(result);

    expect(compact.s).toBe(0.88);
  });

  it('should preserve text content', () => {
    const result = createResult({ text: 'function test() { return 42; }' });
    const compact = formatCompactResult(result);

    expect(compact.t).toBe('function test() { return 42; }');
  });

  it('should use short field names', () => {
    const result = createResult();
    const compact = formatCompactResult(result);

    expect('l' in compact).toBe(true);
    expect('t' in compact).toBe(true);
    expect('s' in compact).toBe(true);
    // Should not have long field names
    expect('path' in compact).toBe(false);
    expect('text' in compact).toBe(false);
    expect('score' in compact).toBe(false);
  });

  it('should handle score of exactly 0', () => {
    const result = createResult({ score: 0 });
    const compact = formatCompactResult(result);

    expect(compact.s).toBe(0);
  });

  it('should handle score of exactly 1', () => {
    const result = createResult({ score: 1 });
    const compact = formatCompactResult(result);

    expect(compact.s).toBe(1);
  });

  it('should handle single-line results', () => {
    const result = createResult({ startLine: 42, endLine: 42 });
    const compact = formatCompactResult(result);

    expect(compact.l).toBe('test.ts:42-42');
  });
});

describe('formatCompactResults', () => {
  it('should format multiple results', () => {
    const results = [
      createResult({ path: 'file1.ts', startLine: 1, endLine: 10, score: 0.9 }),
      createResult({ path: 'file2.ts', startLine: 20, endLine: 30, score: 0.8 }),
    ];
    const compact = formatCompactResults(results);

    expect(compact).toHaveLength(2);
    expect(compact[0].l).toBe('file1.ts:1-10');
    expect(compact[0].s).toBe(0.9);
    expect(compact[1].l).toBe('file2.ts:20-30');
    expect(compact[1].s).toBe(0.8);
  });

  it('should return empty array for empty input', () => {
    expect(formatCompactResults([])).toEqual([]);
  });
});

describe('formatCompactOutput', () => {
  it('should format complete search output', () => {
    const results = [
      createResult({ path: 'test.ts', startLine: 1, endLine: 10, score: 0.9 }),
    ];
    const output = formatCompactOutput(results, 45);

    expect(output.r).toHaveLength(1);
    expect(output.n).toBe(1);
    expect(output.ms).toBe(45);
    expect(output.w).toBeUndefined();
  });

  it('should include warning when provided', () => {
    const results = [createResult()];
    const output = formatCompactOutput(results, 45, 'Index is stale');

    expect(output.w).toBe('Index is stale');
  });

  it('should not include warning field when undefined', () => {
    const results = [createResult()];
    const output = formatCompactOutput(results, 45);

    expect('w' in output).toBe(false);
  });

  it('should use short field names', () => {
    const results = [createResult()];
    const output = formatCompactOutput(results, 45);

    expect('r' in output).toBe(true);
    expect('n' in output).toBe(true);
    expect('ms' in output).toBe(true);
    // Should not have long field names
    expect('results' in output).toBe(false);
    expect('totalResults' in output).toBe(false);
    expect('searchTimeMs' in output).toBe(false);
  });

  it('should handle empty results', () => {
    const output = formatCompactOutput([], 10);

    expect(output.r).toEqual([]);
    expect(output.n).toBe(0);
    expect(output.ms).toBe(10);
  });

  it('should calculate correct count from results array', () => {
    const results = [
      createResult({ score: 0.9 }),
      createResult({ score: 0.8 }),
      createResult({ score: 0.7 }),
    ];
    const output = formatCompactOutput(results, 100);

    expect(output.n).toBe(3);
  });
});

describe('compact format token savings', () => {
  it('should produce smaller JSON output than standard format', () => {
    // Create a typical search result set
    const results = [
      createResult({
        path: 'src/engines/embedding.ts',
        text: 'export async function embed(text: string): Promise<number[]> { ... }',
        score: 0.92345678,
        startLine: 45,
        endLine: 78,
      }),
      createResult({
        path: 'src/storage/lancedb.ts',
        text: 'export class LanceDBStore { constructor(indexPath: string) { ... } }',
        score: 0.87654321,
        startLine: 12,
        endLine: 56,
      }),
    ];

    // Standard format
    const standardOutput = {
      results: results.map((r) => ({
        path: r.path,
        text: r.text,
        score: r.score,
        startLine: r.startLine,
        endLine: r.endLine,
      })),
      totalResults: results.length,
      searchTimeMs: 45,
    };

    // Compact format
    const compactOutput = formatCompactOutput(results, 45);

    const standardJson = JSON.stringify(standardOutput);
    const compactJson = JSON.stringify(compactOutput);

    // Compact should be smaller
    expect(compactJson.length).toBeLessThan(standardJson.length);

    // Calculate savings percentage
    const savings = ((standardJson.length - compactJson.length) / standardJson.length) * 100;
    // We expect at least some savings from shorter field names
    expect(savings).toBeGreaterThan(0);
  });
});
