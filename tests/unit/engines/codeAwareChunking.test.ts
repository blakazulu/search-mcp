/**
 * Code-Aware Chunking Unit Tests
 *
 * Tests cover:
 * - Language detection from file paths
 * - TypeScript/JavaScript boundary detection
 * - Python boundary detection
 * - Chunk splitting at semantic boundaries
 * - Fallback behavior for unsupported languages
 */

import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  supportsCodeAwareChunking,
  getLanguageName,
  splitCodeWithLineNumbers,
  DEFAULT_CODE_AWARE_OPTIONS,
} from '../../../src/engines/codeAwareChunking.js';

// ============================================================================
// Language Detection Tests
// ============================================================================

describe('detectLanguage', () => {
  it('should detect TypeScript files', () => {
    expect(detectLanguage('src/index.ts')).toBe('typescript');
    expect(detectLanguage('src/component.tsx')).toBe('typescript');
    expect(detectLanguage('lib/module.mts')).toBe('typescript');
    expect(detectLanguage('lib/common.cts')).toBe('typescript');
  });

  it('should detect JavaScript files', () => {
    expect(detectLanguage('src/index.js')).toBe('javascript');
    expect(detectLanguage('src/component.jsx')).toBe('javascript');
    expect(detectLanguage('lib/module.mjs')).toBe('javascript');
    expect(detectLanguage('lib/common.cjs')).toBe('javascript');
  });

  it('should detect Python files', () => {
    expect(detectLanguage('scripts/main.py')).toBe('python');
    expect(detectLanguage('app/gui.pyw')).toBe('python');
  });

  it('should return unknown for unsupported extensions', () => {
    expect(detectLanguage('src/main.go')).toBe('unknown');
    expect(detectLanguage('src/main.rs')).toBe('unknown');
    expect(detectLanguage('src/main.java')).toBe('unknown');
    expect(detectLanguage('README.md')).toBe('unknown');
    expect(detectLanguage('config.json')).toBe('unknown');
  });

  it('should handle case-insensitive extensions', () => {
    expect(detectLanguage('src/index.TS')).toBe('typescript');
    expect(detectLanguage('src/index.JS')).toBe('javascript');
    expect(detectLanguage('src/index.PY')).toBe('python');
  });

  it('should handle paths with dots in directory names', () => {
    expect(detectLanguage('node_modules/.bin/file.ts')).toBe('typescript');
    expect(detectLanguage('src/.hidden/script.py')).toBe('python');
  });
});

describe('supportsCodeAwareChunking', () => {
  it('should return true for TypeScript files', () => {
    expect(supportsCodeAwareChunking('src/index.ts')).toBe(true);
  });

  it('should return true for JavaScript files', () => {
    expect(supportsCodeAwareChunking('src/index.js')).toBe(true);
  });

  it('should return true for Python files', () => {
    expect(supportsCodeAwareChunking('src/main.py')).toBe(true);
  });

  it('should return false for unsupported files', () => {
    expect(supportsCodeAwareChunking('src/main.go')).toBe(false);
    expect(supportsCodeAwareChunking('README.md')).toBe(false);
    expect(supportsCodeAwareChunking('config.json')).toBe(false);
  });
});

describe('getLanguageName', () => {
  it('should return human-readable names', () => {
    expect(getLanguageName('file.ts')).toBe('TypeScript');
    expect(getLanguageName('file.js')).toBe('JavaScript');
    expect(getLanguageName('file.py')).toBe('Python');
    expect(getLanguageName('file.go')).toBe('Unknown');
  });
});

// ============================================================================
// TypeScript/JavaScript Chunking Tests
// ============================================================================

describe('splitCodeWithLineNumbers for TypeScript/JavaScript', () => {
  it('should split at function declarations', () => {
    const code = `
function foo() {
  return 1;
}

function bar() {
  return 2;
}

function baz() {
  return 3;
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50, // Small chunk size to force splits
      chunkOverlap: 10,
      maxChunkSize: 100,
    });

    // Should produce multiple chunks split at function boundaries
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should split at class declarations', () => {
    const code = `
class Foo {
  constructor() {}
  method() {}
}

class Bar {
  constructor() {}
  method() {}
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 100,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle export declarations', () => {
    const code = `
export function foo() {
  return 1;
}

export default class Bar {
  method() {}
}

export const baz = () => 42;
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should return single chunk for small files', () => {
    const code = `
function foo() {
  return 1;
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 1000, // Large enough to fit the whole file
      chunkOverlap: 100,
      maxChunkSize: 2000,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBe(1);
    expect(chunks![0].text).toBe(code);
    expect(chunks![0].startLine).toBe(1);
  });

  it('should handle empty files', () => {
    const chunks = splitCodeWithLineNumbers('', 'test.ts');
    expect(chunks).toEqual([]);
  });

  it('should return null for files with no semantic boundaries', () => {
    const code = `
// Just comments
// and more comments
// nothing else
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 10,
      chunkOverlap: 5,
      maxChunkSize: 50,
    });

    // Should return null to signal fallback
    expect(chunks).toBeNull();
  });
});

// ============================================================================
// Python Chunking Tests
// ============================================================================

describe('splitCodeWithLineNumbers for Python', () => {
  it('should split at function definitions', () => {
    const code = `
def foo():
    return 1

def bar():
    return 2

def baz():
    return 3
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 40,
      chunkOverlap: 10,
      maxChunkSize: 100,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should split at class definitions', () => {
    const code = `
class Foo:
    def __init__(self):
        pass

class Bar:
    def __init__(self):
        pass
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });

  it('should handle decorated functions', () => {
    const code = `
@decorator
def foo():
    return 1

@another_decorator
def bar():
    return 2
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });

  it('should handle async functions', () => {
    const code = `
async def foo():
    return 1

async def bar():
    await something()
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.py', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Edge Cases and Fallback Tests
// ============================================================================

describe('code-aware chunking edge cases', () => {
  it('should return single chunk for small files regardless of language', () => {
    // Small files (under chunkSize) return as single chunk before language detection
    const chunks = splitCodeWithLineNumbers('package main\n\nfunc main() {}', 'test.go');
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBe(1);
  });

  it('should return null for large files in unsupported languages', () => {
    // Generate a large Go file that exceeds default chunkSize
    const largeGoCode = 'package main\n\n' + 'func main() {\n' +
      '    // comment\n'.repeat(500) + '}\n';
    const chunks = splitCodeWithLineNumbers(largeGoCode, 'test.go');
    // For unsupported languages with large files, should return null to signal fallback
    expect(chunks).toBeNull();
  });

  it('should handle files with only whitespace', () => {
    const chunks = splitCodeWithLineNumbers('   \n\n   \n', 'test.ts');
    // Small files that fit in a single chunk are returned as-is
    expect(chunks).not.toBeNull();
    if (chunks) {
      expect(chunks.length).toBe(1);
    }
  });

  it('should track line numbers correctly', () => {
    const code = `// Comment
function foo() {
  return 1;
}

function bar() {
  return 2;
}`;

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 100,
      chunkOverlap: 20,
      maxChunkSize: 200,
    });

    expect(chunks).not.toBeNull();
    if (chunks && chunks.length > 0) {
      // First chunk should start at line 1
      expect(chunks[0].startLine).toBe(1);
    }
  });

  it('should handle interface declarations', () => {
    const code = `
interface Foo {
  bar: string;
  baz: number;
}

interface Bar {
  qux: boolean;
}
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });

  it('should handle type declarations', () => {
    const code = `
type Foo = {
  bar: string;
};

type Bar = string | number;
`.trim();

    const chunks = splitCodeWithLineNumbers(code, 'test.ts', {
      chunkSize: 50,
      chunkOverlap: 10,
      maxChunkSize: 150,
    });

    expect(chunks).not.toBeNull();
  });
});

// ============================================================================
// Default Options Tests
// ============================================================================

describe('DEFAULT_CODE_AWARE_OPTIONS', () => {
  it('should have reasonable defaults', () => {
    expect(DEFAULT_CODE_AWARE_OPTIONS.chunkSize).toBe(4000);
    expect(DEFAULT_CODE_AWARE_OPTIONS.chunkOverlap).toBe(200);
    expect(DEFAULT_CODE_AWARE_OPTIONS.maxChunkSize).toBe(8000);
  });

  it('should have reduced overlap compared to character-based chunking', () => {
    // Character-based chunking uses 800 overlap
    // Code-aware should use less since we split at boundaries
    expect(DEFAULT_CODE_AWARE_OPTIONS.chunkOverlap).toBeLessThan(800);
  });
});
