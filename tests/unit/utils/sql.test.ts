/**
 * SQL Escaping Utilities Tests
 *
 * Tests for SQL escaping functions that prevent SQL injection:
 * - escapeSqlString: Escapes strings for SQL queries
 * - escapeLikePattern: Escapes strings for SQL LIKE patterns
 * - globToSafeLikePattern: Converts glob patterns to safe SQL LIKE patterns
 */

import { describe, it, expect } from 'vitest';
import {
  escapeSqlString,
  escapeLikePattern,
  globToSafeLikePattern,
} from '../../../src/utils/sql.js';

describe('SQL Escaping Utilities', () => {
  describe('escapeSqlString', () => {
    it('should escape single quotes by doubling them', () => {
      expect(escapeSqlString("test'value")).toBe("test''value");
      expect(escapeSqlString("'single'")).toBe("''single''");
      expect(escapeSqlString("don't")).toBe("don''t");
    });

    it('should escape backslashes', () => {
      expect(escapeSqlString('path\\to\\file')).toBe('path\\\\to\\\\file');
      expect(escapeSqlString('C:\\Users\\test')).toBe('C:\\\\Users\\\\test');
    });

    it('should remove null bytes', () => {
      expect(escapeSqlString('test\x00injection')).toBe('testinjection');
      expect(escapeSqlString('\x00before')).toBe('before');
      expect(escapeSqlString('after\x00')).toBe('after');
      expect(escapeSqlString('mid\x00\x00dle')).toBe('middle');
    });

    it('should remove control characters (except common whitespace)', () => {
      // Remove characters 0x00-0x08, 0x0b, 0x0c, 0x0e-0x1f
      expect(escapeSqlString('test\x01\x02\x03value')).toBe('testvalue');
      expect(escapeSqlString('\x1fstart')).toBe('start');
      expect(escapeSqlString('end\x07')).toBe('end');
    });

    it('should preserve tabs, newlines, and carriage returns', () => {
      expect(escapeSqlString('line1\nline2')).toBe('line1\nline2');
      expect(escapeSqlString('col1\tcol2')).toBe('col1\tcol2');
      expect(escapeSqlString('line1\r\nline2')).toBe('line1\r\nline2');
    });

    it('should handle empty strings', () => {
      expect(escapeSqlString('')).toBe('');
    });

    it('should handle strings with no special characters', () => {
      expect(escapeSqlString('normal text')).toBe('normal text');
      expect(escapeSqlString('file.ts')).toBe('file.ts');
      expect(escapeSqlString('src/utils/path.ts')).toBe('src/utils/path.ts');
    });

    it('should handle SQL injection attempts', () => {
      // Classic SQL injection
      expect(escapeSqlString("test' OR '1'='1")).toBe("test'' OR ''1''=''1");

      // Comment injection - BUG #15 FIX: Semicolons and comments are now removed
      expect(escapeSqlString("test'; --")).toBe("test'' ");

      // Multiple injection attempts - BUG #15 FIX: Semicolons and comments are now removed
      expect(escapeSqlString("'; DROP TABLE users; --")).toBe("'' DROP TABLE users ");
    });

    it('should remove semicolons for defense in depth (BUG #15 FIX)', () => {
      expect(escapeSqlString('a;b;c')).toBe('abc');
      expect(escapeSqlString('test; SELECT * FROM users;')).toBe('test SELECT * FROM users');
    });

    it('should remove SQL comment sequences for defense in depth (BUG #15 FIX)', () => {
      // Single-line comments
      expect(escapeSqlString('test--comment')).toBe('testcomment');
      expect(escapeSqlString('before -- after')).toBe('before  after');

      // Block comments
      expect(escapeSqlString('test/*comment*/value')).toBe('testcommentvalue');
      expect(escapeSqlString('before /* middle */ after')).toBe('before  middle  after');
    });

    it('should handle combined special characters', () => {
      // Backslash and quote
      expect(escapeSqlString("test\\'value")).toBe("test\\\\''value");

      // Quote with null byte
      expect(escapeSqlString("test\x00' OR")).toBe("test'' OR");
    });

    it('should handle Unicode characters', () => {
      expect(escapeSqlString('file\u4E2D\u6587.ts')).toBe('file\u4E2D\u6587.ts');
      expect(escapeSqlString('\u{1F600}.md')).toBe('\u{1F600}.md');
    });
  });

  describe('escapeLikePattern', () => {
    it('should escape percent signs', () => {
      expect(escapeLikePattern('100%')).toBe('100\\%');
      expect(escapeLikePattern('50% off')).toBe('50\\% off');
    });

    it('should escape underscores', () => {
      expect(escapeLikePattern('file_name')).toBe('file\\_name');
      expect(escapeLikePattern('__init__.py')).toBe('\\_\\_init\\_\\_.py');
    });

    it('should escape square brackets', () => {
      expect(escapeLikePattern('[abc]')).toBe('\\[abc]');
      expect(escapeLikePattern('array[0]')).toBe('array\\[0]');
    });

    it('should also apply SQL string escaping', () => {
      // Single quotes
      expect(escapeLikePattern("file'name")).toBe("file''name");

      // Backslashes (gets doubled, then % escaping adds more)
      expect(escapeLikePattern('path\\file')).toBe('path\\\\file');

      // Null bytes
      expect(escapeLikePattern('test\x00file')).toBe('testfile');
    });

    it('should handle combined LIKE and SQL special characters', () => {
      // File with percent and quote
      expect(escapeLikePattern("100%'s test")).toBe("100\\%''s test");

      // File with underscore and bracket
      expect(escapeLikePattern('_test[0]')).toBe('\\_test\\[0]');
    });

    it('should handle empty strings', () => {
      expect(escapeLikePattern('')).toBe('');
    });

    it('should handle strings with no special characters', () => {
      expect(escapeLikePattern('normal text')).toBe('normal text');
      expect(escapeLikePattern('file.ts')).toBe('file.ts');
    });

    it('should handle LIKE injection attempts', () => {
      // Pattern that would match everything
      expect(escapeLikePattern('%')).toBe('\\%');

      // Pattern with wildcards
      expect(escapeLikePattern('test%_file')).toBe('test\\%\\_file');
    });
  });

  describe('globToSafeLikePattern', () => {
    it('should convert single asterisk to percent', () => {
      expect(globToSafeLikePattern('*.ts')).toBe('%.ts');
      expect(globToSafeLikePattern('src/*')).toBe('src/%');
      expect(globToSafeLikePattern('src/*.ts')).toBe('src/%.ts');
    });

    it('should convert double asterisk to percent', () => {
      expect(globToSafeLikePattern('**/*.ts')).toBe('%/%.ts');
      expect(globToSafeLikePattern('src/**')).toBe('src/%');
    });

    it('should convert question mark to underscore', () => {
      expect(globToSafeLikePattern('file?.ts')).toBe('file_.ts');
      expect(globToSafeLikePattern('???')).toBe('___');
    });

    it('should escape SQL LIKE special characters in literal parts', () => {
      // Literal percent in filename
      expect(globToSafeLikePattern('100%.txt')).toBe('100\\%.txt');

      // Literal underscore in filename
      expect(globToSafeLikePattern('file_name.ts')).toBe('file\\_name.ts');

      // Literal bracket in filename
      expect(globToSafeLikePattern('[readme].md')).toBe('\\[readme].md');
    });

    it('should escape SQL string special characters', () => {
      // Single quotes in pattern
      expect(globToSafeLikePattern("test'*.ts")).toBe("test''%.ts");

      // Backslashes in pattern
      expect(globToSafeLikePattern('path\\*.ts')).toBe('path\\\\%.ts');
    });

    it('should handle complex patterns', () => {
      // Glob with literal underscore and wildcard
      expect(globToSafeLikePattern('src/file_*.ts')).toBe('src/file\\_%.ts');

      // Multiple wildcards with special chars
      expect(globToSafeLikePattern('**/test_*.spec.ts')).toBe('%/test\\_%.spec.ts');
    });

    it('should handle SQL injection attempts in patterns', () => {
      // Injection attempt in pattern
      expect(globToSafeLikePattern("test' OR '1'='1")).toBe("test'' OR ''1''=''1");

      // Injection with wildcards
      expect(globToSafeLikePattern("*' OR '1'='1")).toBe("%'' OR ''1''=''1");
    });

    it('should handle empty patterns', () => {
      expect(globToSafeLikePattern('')).toBe('');
    });

    it('should handle patterns with no glob wildcards', () => {
      expect(globToSafeLikePattern('exact-file.ts')).toBe('exact-file.ts');
      expect(globToSafeLikePattern('src/utils/path.ts')).toBe('src/utils/path.ts');
    });

    it('should handle patterns with only glob wildcards', () => {
      expect(globToSafeLikePattern('*')).toBe('%');
      expect(globToSafeLikePattern('**')).toBe('%');
      expect(globToSafeLikePattern('?')).toBe('_');
      expect(globToSafeLikePattern('*?*')).toBe('%_%');
    });

    it('should preserve forward slashes', () => {
      expect(globToSafeLikePattern('src/components/*.tsx')).toBe('src/components/%.tsx');
      expect(globToSafeLikePattern('a/b/c/*.ts')).toBe('a/b/c/%.ts');
    });
  });

  describe('Integration: Real-world scenarios', () => {
    it('should handle real file paths with special characters', () => {
      // Windows paths
      const windowsPath = 'C:\\Users\\John\'s Documents\\file_1.ts';
      const escaped = escapeSqlString(windowsPath);
      expect(escaped).toBe('C:\\\\Users\\\\John\'\'s Documents\\\\file\\_1.ts'.replace(/\\_/g, '_'));
      // Actually the underscore is not escaped by escapeSqlString, only by escapeLikePattern
      expect(escaped).toBe("C:\\\\Users\\\\John''s Documents\\\\file_1.ts");
    });

    it('should handle paths that look like injection attempts', () => {
      // A filename that happens to contain SQL-like syntax
      const trickyPath = "query' OR path='hack";
      const escaped = escapeSqlString(trickyPath);
      expect(escaped).toBe("query'' OR path=''hack");

      // This can be safely used in a query like: path = '${escaped}'
      // Result: path = 'query'' OR path=''hack'
    });

    it('should handle glob patterns with injection attempts', () => {
      // An attacker trying to inject via pattern
      const maliciousPattern = "*.ts' OR '1'='1";
      const safePattern = globToSafeLikePattern(maliciousPattern);
      expect(safePattern).toBe("%.ts'' OR ''1''=''1");
    });

    it('should handle null byte injection attempts', () => {
      // Null byte injection (common attack vector)
      // BUG #15 FIX: Semicolons and comments are now removed
      const nullByteAttack = "valid.ts\x00'; DROP TABLE chunks; --";
      const escaped = escapeSqlString(nullByteAttack);
      expect(escaped).toBe("valid.ts'' DROP TABLE chunks ");
      expect(escaped).not.toContain('\x00');
      expect(escaped).not.toContain(';');
      expect(escaped).not.toContain('--');
    });

    it('should handle Unicode bypass attempts', () => {
      // Unicode characters that might look like quotes
      const unicodeTrick = "test\u2019value"; // Right single quotation mark
      const escaped = escapeSqlString(unicodeTrick);
      // Unicode quotes are not SQL quotes, so they pass through
      expect(escaped).toBe("test\u2019value");
    });
  });
});
