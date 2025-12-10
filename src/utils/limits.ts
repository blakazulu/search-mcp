/**
 * Input Validation Limits
 *
 * Defines security limits for input validation across MCP tools.
 * These limits help prevent DoS attacks via malformed or excessive inputs.
 */

// ============================================================================
// Query Length Limits
// ============================================================================

/**
 * Maximum length for search query strings (characters)
 *
 * Prevents memory exhaustion and slow embedding generation for very long queries.
 * 1000 characters is sufficient for any reasonable search query while preventing abuse.
 */
export const MAX_QUERY_LENGTH = 1000;

// ============================================================================
// Glob Pattern Limits
// ============================================================================

/**
 * Maximum length for glob patterns (characters)
 *
 * Long patterns can cause performance issues and potential ReDoS.
 * 200 characters is sufficient for any reasonable file pattern.
 */
export const MAX_GLOB_PATTERN_LENGTH = 200;

/**
 * Maximum number of wildcard characters in a glob pattern
 *
 * Excessive wildcards can cause exponential backtracking in pattern matching.
 * 10 wildcards is more than enough for any legitimate use case.
 */
export const MAX_GLOB_PATTERN_WILDCARDS = 10;

/**
 * Maximum number of brace expansion groups in a glob pattern
 *
 * Brace expansion like {a,b,c} can cause combinatorial explosion.
 * Limit to prevent patterns like {a,b}{c,d}{e,f}... from exploding.
 */
export const MAX_GLOB_BRACE_GROUPS = 5;

/**
 * Maximum total items in brace expansion
 *
 * Limits the total number of alternatives across all brace groups.
 * e.g., {a,b,c,d,e} counts as 5 items.
 */
export const MAX_GLOB_BRACE_ITEMS = 20;

// ============================================================================
// Pattern Validation
// ============================================================================

/**
 * Known ReDoS-prone pattern fragments to reject
 *
 * These patterns can cause exponential time complexity in regex engines.
 * While minimatch isn't a regex engine, similar issues can occur.
 */
export const REDOS_PATTERNS = [
  // Nested quantifiers
  /\*\*\*+/,           // Triple or more consecutive stars
  /\?\?\?\?+/,         // Four or more consecutive question marks
  // Pathological patterns
  /(\*\?){3,}/,        // Alternating * and ? repeated
  /(\?\*){3,}/,        // Alternating ? and * repeated
];

/**
 * Validate a glob pattern for safety
 *
 * Checks for:
 * - Length limits
 * - Wildcard count limits
 * - ReDoS-prone patterns
 * - Brace expansion limits
 *
 * @param pattern - The glob pattern to validate
 * @returns Object with valid boolean and optional error message
 */
export function isPatternSafe(pattern: string): { valid: boolean; error?: string } {
  // Check pattern length
  if (pattern.length > MAX_GLOB_PATTERN_LENGTH) {
    return {
      valid: false,
      error: `Pattern too long: ${pattern.length} characters (max: ${MAX_GLOB_PATTERN_LENGTH})`,
    };
  }

  // Count wildcards (* and ?)
  const wildcardCount = (pattern.match(/[*?]/g) || []).length;
  if (wildcardCount > MAX_GLOB_PATTERN_WILDCARDS) {
    return {
      valid: false,
      error: `Too many wildcards: ${wildcardCount} (max: ${MAX_GLOB_PATTERN_WILDCARDS})`,
    };
  }

  // Check for ReDoS-prone patterns
  for (const redosPattern of REDOS_PATTERNS) {
    if (redosPattern.test(pattern)) {
      return {
        valid: false,
        error: 'Pattern contains potentially dangerous wildcard combinations',
      };
    }
  }

  // Count and validate brace expansion
  const braceGroups = pattern.match(/\{[^}]+\}/g) || [];
  if (braceGroups.length > MAX_GLOB_BRACE_GROUPS) {
    return {
      valid: false,
      error: `Too many brace expansion groups: ${braceGroups.length} (max: ${MAX_GLOB_BRACE_GROUPS})`,
    };
  }

  // Count total items in brace expansions
  let totalBraceItems = 0;
  for (const group of braceGroups) {
    // Remove braces and count comma-separated items
    const content = group.slice(1, -1);
    const items = content.split(',').length;
    totalBraceItems += items;
  }

  if (totalBraceItems > MAX_GLOB_BRACE_ITEMS) {
    return {
      valid: false,
      error: `Too many items in brace expansion: ${totalBraceItems} (max: ${MAX_GLOB_BRACE_ITEMS})`,
    };
  }

  return { valid: true };
}
