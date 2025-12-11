/**
 * FTS Engine Factory Tests
 *
 * Tests cover:
 * - Auto-detection with small file count (uses JS engine)
 * - Auto-detection with large file count (uses native if available)
 * - User preference override (js)
 * - User preference override (native)
 * - Fallback when native unavailable
 * - Utility functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createFTSEngine,
  FILE_COUNT_THRESHOLD,
  checkNativeAvailable,
  formatEngineSelectionReason,
  wouldSelectNative,
} from '../../../src/engines/ftsEngineFactory.js';
import { NaturalBM25Engine } from '../../../src/engines/naturalBM25.js';

// Check native availability synchronously at module load time
let nativeIsAvailable = false;
try {
  require('better-sqlite3');
  nativeIsAvailable = true;
} catch {
  nativeIsAvailable = false;
}

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;

beforeEach(async () => {
  // Create a unique temp directory for each test
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fts-factory-test-'));
});

afterEach(async () => {
  // Clean up temp directory
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('FTS Engine Factory', () => {
  describe('FILE_COUNT_THRESHOLD', () => {
    it('should be defined and be 5000', () => {
      expect(FILE_COUNT_THRESHOLD).toBe(5000);
    });
  });

  describe('checkNativeAvailable', () => {
    it('should return a boolean', async () => {
      const result = await checkNativeAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should return consistent results', async () => {
      const result1 = await checkNativeAvailable();
      const result2 = await checkNativeAvailable();
      expect(result1).toBe(result2);
    });
  });

  describe('wouldSelectNative', () => {
    it('should return false for file count <= threshold', () => {
      expect(wouldSelectNative(0)).toBe(false);
      expect(wouldSelectNative(1000)).toBe(false);
      expect(wouldSelectNative(FILE_COUNT_THRESHOLD)).toBe(false);
    });

    it('should return true for file count > threshold', () => {
      expect(wouldSelectNative(FILE_COUNT_THRESHOLD + 1)).toBe(true);
      expect(wouldSelectNative(10000)).toBe(true);
      expect(wouldSelectNative(100000)).toBe(true);
    });
  });

  describe('formatEngineSelectionReason', () => {
    it('should format JS engine reason correctly', () => {
      const result = formatEngineSelectionReason('js', 'User preference: js');
      expect(result).toContain('JavaScript');
      expect(result).toContain('natural');
      expect(result).toContain('User preference: js');
    });

    it('should format native engine reason correctly', () => {
      const result = formatEngineSelectionReason('native', 'Auto-selected');
      expect(result).toContain('SQLite FTS5');
      expect(result).toContain('native');
      expect(result).toContain('Auto-selected');
    });
  });

  describe('createFTSEngine', () => {
    describe('with preference: js', () => {
      it('should always return JS engine regardless of file count', async () => {
        const result = await createFTSEngine(testDir, 'js', 100);

        expect(result.type).toBe('js');
        expect(result.engine).toBeInstanceOf(NaturalBM25Engine);
        expect(result.reason).toBe('User preference: js');

        result.engine.close();
      });

      it('should return JS engine even for large file counts', async () => {
        const result = await createFTSEngine(testDir, 'js', 50000);

        expect(result.type).toBe('js');
        expect(result.engine).toBeInstanceOf(NaturalBM25Engine);
        expect(result.reason).toBe('User preference: js');

        result.engine.close();
      });
    });

    describe('with preference: native', () => {
      if (nativeIsAvailable) {
        it('should return native engine when available', async () => {
          const result = await createFTSEngine(testDir, 'native', 100);

          expect(result.type).toBe('native');
          expect(result.engine.engineType).toBe('native');
          expect(result.reason).toBe('User preference: native');

          result.engine.close();
        });
      } else {
        it('should fallback to JS engine when native unavailable', async () => {
          const result = await createFTSEngine(testDir, 'native', 100);

          expect(result.type).toBe('js');
          expect(result.engine).toBeInstanceOf(NaturalBM25Engine);
          expect(result.reason).toBe('User preference: native (unavailable, fell back to js)');

          result.engine.close();
        });
      }
    });

    describe('with preference: auto', () => {
      describe('small codebase (<= threshold)', () => {
        it('should select JS engine for 0 files', async () => {
          const result = await createFTSEngine(testDir, 'auto', 0);

          expect(result.type).toBe('js');
          expect(result.engine).toBeInstanceOf(NaturalBM25Engine);
          expect(result.reason).toContain('Auto:');
          expect(result.reason).toContain('<= 5000 threshold');

          result.engine.close();
        });

        it('should select JS engine for 1000 files', async () => {
          const result = await createFTSEngine(testDir, 'auto', 1000);

          expect(result.type).toBe('js');
          expect(result.engine).toBeInstanceOf(NaturalBM25Engine);
          expect(result.reason).toContain('Auto:');
          expect(result.reason).toContain('1000 files');

          result.engine.close();
        });

        it('should select JS engine for exactly threshold files', async () => {
          const result = await createFTSEngine(testDir, 'auto', FILE_COUNT_THRESHOLD);

          expect(result.type).toBe('js');
          expect(result.engine).toBeInstanceOf(NaturalBM25Engine);
          expect(result.reason).toContain('Auto:');
          expect(result.reason).toContain(`${FILE_COUNT_THRESHOLD} files`);

          result.engine.close();
        });
      });

      describe('large codebase (> threshold)', () => {
        if (nativeIsAvailable) {
          it('should select native engine for large file count when native available', async () => {
            const result = await createFTSEngine(testDir, 'auto', FILE_COUNT_THRESHOLD + 1);

            expect(result.type).toBe('native');
            expect(result.engine.engineType).toBe('native');
            expect(result.reason).toContain('Auto:');
            expect(result.reason).toContain(`${FILE_COUNT_THRESHOLD + 1} files`);
            expect(result.reason).toContain('> 5000 threshold');
            expect(result.reason).toContain('native available');

            result.engine.close();
          });

          it('should select native engine for 10000 files', async () => {
            const result = await createFTSEngine(testDir, 'auto', 10000);

            expect(result.type).toBe('native');
            expect(result.engine.engineType).toBe('native');
            expect(result.reason).toContain('10000 files');

            result.engine.close();
          });
        } else {
          it('should fallback to JS engine for large file count when native unavailable', async () => {
            const result = await createFTSEngine(testDir, 'auto', FILE_COUNT_THRESHOLD + 1);

            expect(result.type).toBe('js');
            expect(result.engine).toBeInstanceOf(NaturalBM25Engine);
            expect(result.reason).toContain('Auto:');
            expect(result.reason).toContain('> 5000 threshold');
            expect(result.reason).toContain('native unavailable');

            result.engine.close();
          });
        }
      });
    });

    describe('engine functionality after creation', () => {
      it('should create a functional JS engine', async () => {
        const result = await createFTSEngine(testDir, 'js', 100);

        // Test that the engine works
        await result.engine.addChunk({
          id: 'test-1',
          text: 'function handleWebSocket() { }',
          path: 'test.ts',
          startLine: 1,
          endLine: 5,
        });

        expect(result.engine.hasData()).toBe(true);
        const searchResults = result.engine.search('handleWebSocket', 10);
        expect(searchResults.length).toBeGreaterThan(0);

        result.engine.close();
      });

      if (nativeIsAvailable) {
        it('should create a functional native engine', async () => {
          const result = await createFTSEngine(testDir, 'native', 100);

          // Test that the engine works
          await result.engine.addChunk({
            id: 'test-1',
            text: 'function handleWebSocket() { }',
            path: 'test.ts',
            startLine: 1,
            endLine: 5,
          });

          expect(result.engine.hasData()).toBe(true);
          const searchResults = result.engine.search('handleWebSocket', 10);
          expect(searchResults.length).toBeGreaterThan(0);

          result.engine.close();
        });
      }
    });

    describe('database path handling', () => {
      if (nativeIsAvailable) {
        it('should create fts.sqlite file for native engine', async () => {
          const result = await createFTSEngine(testDir, 'native', 100);
          result.engine.close();

          // Check that the database file was created
          const dbPath = path.join(testDir, 'fts.sqlite');
          expect(fs.existsSync(dbPath)).toBe(true);
        });
      }
    });
  });

  describe('selection reason messages', () => {
    it('should include file count in auto selection reasons', async () => {
      const result = await createFTSEngine(testDir, 'auto', 2500);
      expect(result.reason).toContain('2500 files');
      result.engine.close();
    });

    it('should include threshold in auto selection reasons', async () => {
      const result = await createFTSEngine(testDir, 'auto', 2500);
      expect(result.reason).toContain(String(FILE_COUNT_THRESHOLD));
      result.engine.close();
    });

    it('should clearly indicate user preference for js', async () => {
      const result = await createFTSEngine(testDir, 'js', 10000);
      expect(result.reason).toBe('User preference: js');
      result.engine.close();
    });

    if (nativeIsAvailable) {
      it('should clearly indicate user preference for native', async () => {
        const result = await createFTSEngine(testDir, 'native', 100);
        expect(result.reason).toBe('User preference: native');
        result.engine.close();
      });
    }
  });
});

describe('Config Schema Integration', () => {
  it('should work with FTSEnginePreference type', async () => {
    // Test that all preference values work
    const preferences: ('auto' | 'js' | 'native')[] = ['auto', 'js', 'native'];

    for (const preference of preferences) {
      const result = await createFTSEngine(testDir, preference, 100);
      expect(['js', 'native']).toContain(result.type);
      result.engine.close();
    }
  });
});
