/**
 * SQL Escaping Utilities
 *
 * Provides safe SQL escaping functions for LanceDB query construction.
 * These functions help prevent SQL injection attacks by properly escaping
 * special characters in string values used in SQL queries.
 *
 * @module utils/sql
 */

/**
 * Escape a string value for use in SQL queries
 *
 * This function escapes:
 * - Backslashes: \ -> \\
 * - Single quotes: ' -> ''
 * - Null bytes: removed entirely
 * - Control characters (0x00-0x1f): removed entirely
 * - Semicolons: removed (BUG #15 FIX - defense in depth)
 * - SQL comment sequences: removed (BUG #15 FIX - defense in depth)
 *
 * @param value - The string value to escape
 * @returns The escaped string safe for SQL queries
 *
 * @example
 * ```typescript
 * const path = "test' OR '1'='1";
 * const escaped = escapeSqlString(path);
 * // Result: "test'' OR ''1''=''1"
 * const query = `path = '${escaped}'`;
 * ```
 */
export function escapeSqlString(value: string): string {
  return value
    // Escape backslashes first (before other escapes that might add backslashes)
    .replace(/\\/g, '\\\\')
    // Escape single quotes by doubling them (SQL standard)
    .replace(/'/g, "''")
    // Remove null bytes (could be used for injection)
    .replace(/\0/g, '')
    // Remove control characters (0x00-0x1f except for common whitespace)
    // Keep tab (0x09), newline (0x0a), carriage return (0x0d)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    // BUG #15 FIX: Additional hardening for defense in depth
    // Remove semicolons (statement terminator)
    .replace(/;/g, '')
    // Remove SQL line comments (--)
    .replace(/--/g, '')
    // Remove SQL block comment start (/*)
    .replace(/\/\*/g, '')
    // Remove SQL block comment end (*/)
    .replace(/\*\//g, '');
}

/**
 * Escape a string for use in SQL LIKE patterns
 *
 * This function:
 * 1. First applies all escapeSqlString transformations
 * 2. Then escapes SQL LIKE wildcards:
 *    - % -> \%
 *    - _ -> \_
 *    - [ -> \[ (for bracket expressions in some SQL dialects)
 *
 * @param value - The string value to escape for LIKE patterns
 * @returns The escaped string safe for SQL LIKE patterns
 *
 * @example
 * ```typescript
 * const pattern = "100%_complete.ts";
 * const escaped = escapeLikePattern(pattern);
 * // Result: "100\\%\\_complete.ts"
 * const query = `path LIKE '${escaped}'`;
 * ```
 */
export function escapeLikePattern(value: string): string {
  // First apply standard SQL escaping
  let escaped = escapeSqlString(value);

  // Then escape LIKE-specific wildcards
  // Use \\ because we already escaped backslashes, so we need to produce \\%
  escaped = escaped
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[');

  return escaped;
}

/**
 * Convert a glob pattern to a SQL LIKE pattern with proper escaping
 *
 * This function safely converts glob wildcards to SQL LIKE wildcards:
 * - ** -> % (matches any sequence including path separators)
 * - * -> % (matches any sequence)
 * - ? -> _ (matches single character)
 *
 * All other special characters are properly escaped to prevent injection.
 *
 * @param globPattern - The glob pattern to convert
 * @returns A properly escaped SQL LIKE pattern
 *
 * @example
 * ```typescript
 * const pattern = globToSafeLikePattern("src/*.ts");
 * // Result: "src/%.ts"  (* becomes %)
 *
 * const pattern2 = globToSafeLikePattern("test' OR '1'='1");
 * // Result: "test'' OR ''1''=''1" (injection attempt escaped)
 * ```
 */
export function globToSafeLikePattern(globPattern: string): string {
  // We need to:
  // 1. Identify and mark glob wildcards (**, *, ?)
  // 2. Escape all other characters for SQL LIKE
  // 3. Replace the marked wildcards with SQL LIKE wildcards
  //
  // We use a token-based approach to avoid placeholder issues with escaping.

  const tokens: Array<{ type: 'literal' | 'double_star' | 'single_star' | 'question'; value: string }> = [];

  let i = 0;
  while (i < globPattern.length) {
    if (globPattern[i] === '*') {
      if (globPattern[i + 1] === '*') {
        // Double star (**)
        tokens.push({ type: 'double_star', value: '**' });
        i += 2;
      } else {
        // Single star (*)
        tokens.push({ type: 'single_star', value: '*' });
        i += 1;
      }
    } else if (globPattern[i] === '?') {
      // Question mark
      tokens.push({ type: 'question', value: '?' });
      i += 1;
    } else {
      // Literal character - collect consecutive literals
      let literal = '';
      while (i < globPattern.length && globPattern[i] !== '*' && globPattern[i] !== '?') {
        literal += globPattern[i];
        i += 1;
      }
      if (literal) {
        tokens.push({ type: 'literal', value: literal });
      }
    }
  }

  // Now build the result, escaping literals and converting wildcards
  let result = '';
  for (const token of tokens) {
    switch (token.type) {
      case 'double_star':
      case 'single_star':
        result += '%';
        break;
      case 'question':
        result += '_';
        break;
      case 'literal':
        result += escapeLikePattern(token.value);
        break;
    }
  }

  return result;
}
