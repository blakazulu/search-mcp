import { describe, it, expect } from 'vitest';
import {
  getToolDescription,
  hasEnhancedHint,
  getToolNames,
  getEnhancedToolNames,
  STANDARD_DESCRIPTIONS,
  ENHANCED_HINTS,
} from '../../../src/tools/toolDescriptions.js';

describe('Tool Descriptions', () => {
  // ==========================================================================
  // STANDARD_DESCRIPTIONS Tests
  // ==========================================================================

  describe('STANDARD_DESCRIPTIONS', () => {
    it('should have descriptions for all expected tools', () => {
      expect(STANDARD_DESCRIPTIONS['search_code']).toBeDefined();
      expect(STANDARD_DESCRIPTIONS['search_docs']).toBeDefined();
      expect(STANDARD_DESCRIPTIONS['search_by_path']).toBeDefined();
      expect(STANDARD_DESCRIPTIONS['create_index']).toBeDefined();
      expect(STANDARD_DESCRIPTIONS['get_index_status']).toBeDefined();
      expect(STANDARD_DESCRIPTIONS['reindex_project']).toBeDefined();
      expect(STANDARD_DESCRIPTIONS['reindex_file']).toBeDefined();
      expect(STANDARD_DESCRIPTIONS['delete_index']).toBeDefined();
    });

    it('should have non-empty descriptions', () => {
      for (const [tool, desc] of Object.entries(STANDARD_DESCRIPTIONS)) {
        expect(desc, `${tool} should have non-empty description`).not.toBe('');
        expect(typeof desc).toBe('string');
      }
    });

    it('should have correct search_code description', () => {
      expect(STANDARD_DESCRIPTIONS['search_code']).toBe(
        'Search your codebase for relevant code using natural language'
      );
    });

    it('should have correct search_docs description', () => {
      expect(STANDARD_DESCRIPTIONS['search_docs']).toBe(
        'Search project documentation files (.md, .txt) using natural language. Optimized for prose content like README, guides, and technical docs.'
      );
    });
  });

  // ==========================================================================
  // ENHANCED_HINTS Tests
  // ==========================================================================

  describe('ENHANCED_HINTS', () => {
    it('should have hints for search_code and search_docs only', () => {
      expect(ENHANCED_HINTS['search_code']).toBeDefined();
      expect(ENHANCED_HINTS['search_docs']).toBeDefined();
      expect(Object.keys(ENHANCED_HINTS)).toHaveLength(2);
    });

    it('should have hints that start with TIP:', () => {
      for (const [tool, hint] of Object.entries(ENHANCED_HINTS)) {
        expect(hint, `${tool} hint should start with " TIP:"`).toMatch(/^\s*TIP:/);
      }
    });

    it('should have correct search_code hint', () => {
      expect(ENHANCED_HINTS['search_code']).toBe(
        ' TIP: Prefer this over reading full files when looking for specific functions, patterns, or implementations.'
      );
    });

    it('should have correct search_docs hint', () => {
      expect(ENHANCED_HINTS['search_docs']).toBe(
        ' TIP: For follow-up questions about a doc already in context, use this tool instead of re-reading the entire file - more precise results, less context usage.'
      );
    });
  });

  // ==========================================================================
  // getToolDescription Tests
  // ==========================================================================

  describe('getToolDescription', () => {
    describe('with enhanced = false (default)', () => {
      it('should return standard description for search_code', () => {
        const desc = getToolDescription('search_code', false);
        expect(desc).toBe(STANDARD_DESCRIPTIONS['search_code']);
        expect(desc).not.toContain('TIP:');
      });

      it('should return standard description for search_docs', () => {
        const desc = getToolDescription('search_docs', false);
        expect(desc).toBe(STANDARD_DESCRIPTIONS['search_docs']);
        expect(desc).not.toContain('TIP:');
      });

      it('should return standard description for other tools', () => {
        const desc = getToolDescription('delete_index', false);
        expect(desc).toBe(STANDARD_DESCRIPTIONS['delete_index']);
      });

      it('should default to enhanced = false', () => {
        const desc = getToolDescription('search_code');
        expect(desc).toBe(STANDARD_DESCRIPTIONS['search_code']);
        expect(desc).not.toContain('TIP:');
      });
    });

    describe('with enhanced = true', () => {
      it('should return enhanced description for search_code', () => {
        const desc = getToolDescription('search_code', true);
        expect(desc).toBe(
          STANDARD_DESCRIPTIONS['search_code'] + ENHANCED_HINTS['search_code']
        );
        expect(desc).toContain('TIP:');
      });

      it('should return enhanced description for search_docs', () => {
        const desc = getToolDescription('search_docs', true);
        expect(desc).toBe(
          STANDARD_DESCRIPTIONS['search_docs'] + ENHANCED_HINTS['search_docs']
        );
        expect(desc).toContain('TIP:');
      });

      it('should return standard description for tools without hints', () => {
        const desc = getToolDescription('delete_index', true);
        expect(desc).toBe(STANDARD_DESCRIPTIONS['delete_index']);
        expect(desc).not.toContain('TIP:');
      });

      it('should return standard description for create_index (no hint)', () => {
        const desc = getToolDescription('create_index', true);
        expect(desc).toBe(STANDARD_DESCRIPTIONS['create_index']);
      });
    });

    describe('with unknown tool name', () => {
      it('should return empty string for unknown tool', () => {
        const desc = getToolDescription('unknown_tool', false);
        expect(desc).toBe('');
      });

      it('should return empty string for unknown tool even when enhanced', () => {
        const desc = getToolDescription('unknown_tool', true);
        expect(desc).toBe('');
      });
    });
  });

  // ==========================================================================
  // hasEnhancedHint Tests
  // ==========================================================================

  describe('hasEnhancedHint', () => {
    it('should return true for search_code', () => {
      expect(hasEnhancedHint('search_code')).toBe(true);
    });

    it('should return true for search_docs', () => {
      expect(hasEnhancedHint('search_docs')).toBe(true);
    });

    it('should return false for tools without hints', () => {
      expect(hasEnhancedHint('delete_index')).toBe(false);
      expect(hasEnhancedHint('create_index')).toBe(false);
      expect(hasEnhancedHint('search_by_path')).toBe(false);
    });

    it('should return false for unknown tools', () => {
      expect(hasEnhancedHint('unknown_tool')).toBe(false);
    });
  });

  // ==========================================================================
  // getToolNames Tests
  // ==========================================================================

  describe('getToolNames', () => {
    it('should return all tool names', () => {
      const names = getToolNames();
      expect(names).toContain('search_code');
      expect(names).toContain('search_docs');
      expect(names).toContain('search_by_path');
      expect(names).toContain('create_index');
      expect(names).toContain('get_index_status');
      expect(names).toContain('reindex_project');
      expect(names).toContain('reindex_file');
      expect(names).toContain('delete_index');
    });

    it('should return an array', () => {
      const names = getToolNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBe(8);
    });
  });

  // ==========================================================================
  // getEnhancedToolNames Tests
  // ==========================================================================

  describe('getEnhancedToolNames', () => {
    it('should return only tools with enhanced hints', () => {
      const names = getEnhancedToolNames();
      expect(names).toContain('search_code');
      expect(names).toContain('search_docs');
      expect(names.length).toBe(2);
    });

    it('should not include tools without hints', () => {
      const names = getEnhancedToolNames();
      expect(names).not.toContain('delete_index');
      expect(names).not.toContain('create_index');
      expect(names).not.toContain('search_by_path');
    });
  });
});
