/**
 * Tool Descriptions Module
 *
 * Provides standard and enhanced descriptions for MCP tools.
 * Enhanced descriptions include AI guidance hints to help AI assistants
 * make smarter decisions about when to use search vs. reading from context.
 *
 * @module toolDescriptions
 */

// ============================================================================
// Standard Tool Descriptions
// ============================================================================

/**
 * Standard descriptions for MCP tools
 *
 * These are the baseline descriptions shown when enhancedToolDescriptions
 * is disabled (the default).
 */
export const STANDARD_DESCRIPTIONS: Record<string, string> = {
  search_code: 'Search your codebase for relevant code using natural language',
  search_docs:
    'Search project documentation files (.md, .txt) using natural language. Optimized for prose content like README, guides, and technical docs.',
  search_by_path: 'Find files by name or glob pattern',
  create_index: 'Create a search index for the current project',
  get_index_status: 'Get the status and statistics of the search index',
  reindex_project: 'Rebuild the entire search index from scratch',
  reindex_file: 'Re-index a single file that has changed',
  delete_index: 'Delete the search index for the current project',
};

// ============================================================================
// Enhanced Tool Hints
// ============================================================================

/**
 * Enhanced hints for MCP tools
 *
 * These hints are appended to tool descriptions when enhancedToolDescriptions
 * is enabled. Only search tools get hints initially - others remain unchanged.
 *
 * Hints should be concise but actionable, guiding the AI to make better
 * decisions about tool usage.
 */
export const ENHANCED_HINTS: Record<string, string> = {
  search_code:
    ' TIP: Prefer this over reading full files when looking for specific functions, patterns, or implementations.',
  search_docs:
    ' TIP: For follow-up questions about a doc already in context, use this tool instead of re-reading the entire file - more precise results, less context usage.',
};

// ============================================================================
// Description Generation
// ============================================================================

/**
 * Get the description for a tool, optionally with enhanced hints
 *
 * Returns the standard description for the tool, with an optional
 * AI guidance hint appended when enhanced descriptions are enabled.
 *
 * @param toolName - Name of the tool (e.g., 'search_code', 'search_docs')
 * @param enhanced - Whether to include enhanced hints (default: false)
 * @returns The tool description, optionally with hints appended
 *
 * @example
 * ```typescript
 * // Standard description
 * getToolDescription('search_code', false);
 * // => 'Search your codebase for relevant code using natural language'
 *
 * // Enhanced description with hint
 * getToolDescription('search_code', true);
 * // => 'Search your codebase for relevant code using natural language TIP: Prefer this over reading full files when looking for specific functions, patterns, or implementations.'
 *
 * // Tool without hints returns standard description even when enhanced
 * getToolDescription('delete_index', true);
 * // => 'Delete the search index for the current project'
 * ```
 */
export function getToolDescription(
  toolName: string,
  enhanced: boolean = false
): string {
  const base = STANDARD_DESCRIPTIONS[toolName];

  // If tool name is unknown, return empty string
  if (!base) {
    return '';
  }

  // If not enhanced or no hint available, return base description
  if (!enhanced || !ENHANCED_HINTS[toolName]) {
    return base;
  }

  // Return enhanced description with hint appended
  return base + ENHANCED_HINTS[toolName];
}

/**
 * Check if a tool has an enhanced hint available
 *
 * @param toolName - Name of the tool to check
 * @returns true if the tool has an enhanced hint
 */
export function hasEnhancedHint(toolName: string): boolean {
  return toolName in ENHANCED_HINTS;
}

/**
 * Get all tool names that have standard descriptions
 *
 * @returns Array of tool names
 */
export function getToolNames(): string[] {
  return Object.keys(STANDARD_DESCRIPTIONS);
}

/**
 * Get all tool names that have enhanced hints
 *
 * @returns Array of tool names with enhanced hints
 */
export function getEnhancedToolNames(): string[] {
  return Object.keys(ENHANCED_HINTS);
}
