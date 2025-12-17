/**
 * get_file_summary Tool (SMCP-090)
 *
 * MCP tool to extract symbols and complexity metrics from a file.
 * Returns functions, classes, imports, exports, and complexity scores.
 * Useful for AI assistants to understand code structure without reading entire files.
 *
 * Features:
 * - Extracts functions, classes, methods, interfaces
 * - Extracts imports and exports
 * - Calculates cyclomatic complexity
 * - Calculates nesting depth
 * - Calculates overall complexity score
 * - Fast extraction (< 100ms per typical file)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { getLogger } from '../utils/logger.js';
import { MCPError, ErrorCode, isMCPError } from '../errors/index.js';
import {
  extractFileSummary,
  supportsSymbolExtraction,
  type FileSummary,
  type SymbolExtractionOptions,
} from '../engines/symbolExtractor.js';
import type { ToolContext } from './searchCode.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for get_file_summary tool
 */
export const GetFileSummaryInputSchema = z.object({
  /** Path to the file (relative or absolute) */
  path: z.string().min(1, 'Path is required'),
  /** Include complexity metrics (default: true) */
  includeComplexity: z.boolean().optional().default(true),
  /** Include docstrings (default: true) */
  includeDocstrings: z.boolean().optional().default(true),
});

/**
 * Inferred input type from schema
 */
export type GetFileSummaryInput = z.infer<typeof GetFileSummaryInputSchema>;

/**
 * Symbol info for output (simplified from internal SymbolInfo)
 */
export interface OutputSymbolInfo {
  /** Symbol name */
  name: string;
  /** Symbol type */
  type: string;
  /** Start line (1-based) */
  line: number;
  /** End line (1-based) */
  endLine: number;
  /** Function/method signature */
  signature?: string;
  /** Docstring or comment */
  docstring?: string;
  /** Whether the symbol is exported */
  exported?: boolean;
  /** Whether the symbol is async */
  async?: boolean;
  /** Whether the symbol is static */
  static?: boolean;
  /** Visibility modifier */
  visibility?: string;
  /** Parameter count */
  params?: number;
  /** Return type */
  returnType?: string;
  /** Parent symbol name */
  parent?: string;
  /** Decorators/annotations */
  decorators?: string[];
  /** Cyclomatic complexity */
  complexity?: number;
  /** Maximum nesting depth */
  nesting?: number;
}

/**
 * Import info for output
 */
export interface OutputImportInfo {
  /** Module/package being imported */
  module: string;
  /** Named imports */
  names?: string[];
  /** Default import name */
  default?: string;
  /** Whether it's a namespace import */
  namespace?: boolean;
  /** Line number */
  line: number;
}

/**
 * Export info for output
 */
export interface OutputExportInfo {
  /** Exported name */
  name: string;
  /** Export type */
  type: string;
  /** Original name if renamed */
  originalName?: string;
  /** Source module for re-exports */
  sourceModule?: string;
  /** Line number */
  line: number;
}

/**
 * Complexity metrics for output
 */
export interface OutputComplexityMetrics {
  /** Total cyclomatic complexity */
  cyclomatic: number;
  /** Maximum nesting depth */
  maxNesting: number;
  /** Average function complexity */
  avgFunctionComplexity: number;
  /** Number of decision points */
  decisionPoints: number;
  /** Overall complexity score (0-100, higher is better/less complex) */
  score: number;
}

/**
 * Output structure for get_file_summary tool
 */
export interface GetFileSummaryOutput {
  /** File path (relative to project) */
  path: string;
  /** Detected programming language */
  language: string;
  /** Line statistics */
  lines: {
    total: number;
    code: number;
    blank: number;
    comments: number;
  };
  /** Functions and methods */
  functions: OutputSymbolInfo[];
  /** Classes, interfaces, structs, etc. */
  classes: OutputSymbolInfo[];
  /** Import statements */
  imports: OutputImportInfo[];
  /** Export statements */
  exports: OutputExportInfo[];
  /** Complexity metrics */
  complexity: OutputComplexityMetrics;
  /** File size in bytes */
  size: number;
  /** Extraction duration in milliseconds */
  extractionTimeMs: number;
  /** Whether the language supports full AST extraction */
  fullSupport: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert internal FileSummary to output format
 */
function convertToOutput(summary: FileSummary, relativePath: string): GetFileSummaryOutput {
  return {
    path: relativePath,
    language: summary.language,
    lines: {
      total: summary.lines,
      code: summary.codeLines,
      blank: summary.blankLines,
      comments: summary.commentLines,
    },
    functions: summary.functions.map(f => ({
      name: f.name,
      type: f.type,
      line: f.startLine,
      endLine: f.endLine,
      signature: f.signature,
      docstring: f.docstring,
      exported: f.isExported,
      async: f.isAsync,
      static: f.isStatic,
      visibility: f.visibility,
      params: f.paramCount,
      returnType: f.returnType,
      parent: f.parentName,
      decorators: f.decorators,
      complexity: f.complexity,
      nesting: f.nestingDepth,
    })),
    classes: summary.classes.map(c => ({
      name: c.name,
      type: c.type,
      line: c.startLine,
      endLine: c.endLine,
      docstring: c.docstring,
      exported: c.isExported,
      visibility: c.visibility,
      decorators: c.decorators,
    })),
    imports: summary.imports.map(i => ({
      module: i.module,
      names: i.names,
      default: i.defaultImport,
      namespace: i.isNamespace,
      line: i.line,
    })),
    exports: summary.exports.map(e => ({
      name: e.name,
      type: e.type,
      originalName: e.originalName,
      sourceModule: e.sourceModule,
      line: e.line,
    })),
    complexity: {
      cyclomatic: summary.complexity.cyclomaticComplexity,
      maxNesting: summary.complexity.maxNestingDepth,
      avgFunctionComplexity: summary.complexity.avgFunctionComplexity,
      decisionPoints: summary.complexity.decisionPoints,
      score: summary.complexity.overallScore,
    },
    size: summary.size,
    extractionTimeMs: Math.round(summary.extractionTimeMs),
    fullSupport: supportsSymbolExtraction(summary.path),
  };
}

/**
 * Resolve file path to absolute path within project
 */
function resolveFilePath(inputPath: string, projectPath: string): { absolute: string; relative: string } {
  let absolutePath: string;
  let relativePath: string;

  if (path.isAbsolute(inputPath)) {
    absolutePath = inputPath;
    // Calculate relative path from project root
    relativePath = path.relative(projectPath, absolutePath);
  } else {
    // Treat as relative to project root
    relativePath = inputPath;
    absolutePath = path.join(projectPath, inputPath);
  }

  // Normalize paths
  absolutePath = path.normalize(absolutePath);
  relativePath = relativePath.replace(/\\/g, '/'); // Use forward slashes for consistency

  return { absolute: absolutePath, relative: relativePath };
}

/**
 * Validate that the file path is safe (within project, not traversing up)
 */
function validatePath(absolutePath: string, projectPath: string): void {
  const normalizedAbsolute = path.normalize(absolutePath);
  const normalizedProject = path.normalize(projectPath);

  // Check path traversal
  if (!normalizedAbsolute.startsWith(normalizedProject)) {
    throw new MCPError({
      code: ErrorCode.INVALID_PATH,
      userMessage: 'Path must be within the project directory',
      developerMessage: `Path traversal detected: ${absolutePath} is not within ${projectPath}`,
    });
  }

  // Check for symlink (security)
  try {
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new MCPError({
        code: ErrorCode.INVALID_PATH,
        userMessage: 'Symbolic links are not supported for security reasons',
        developerMessage: `Symlink detected: ${absolutePath}`,
      });
    }
  } catch (error) {
    if (isMCPError(error)) throw error;
    // File might not exist yet, that's OK - we'll check later
  }
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Get file summary with symbols and complexity metrics
 *
 * @param input - The input containing the file path
 * @param context - Tool context containing the project path
 * @returns File summary with symbols and complexity metrics
 */
export async function getFileSummary(
  input: GetFileSummaryInput,
  context: ToolContext
): Promise<GetFileSummaryOutput> {
  const logger = getLogger();

  logger.info('getFileSummary', 'Getting file summary', {
    path: input.path,
    projectPath: context.projectPath,
  });

  // Resolve and validate path
  const { absolute: absolutePath, relative: relativePath } = resolveFilePath(
    input.path,
    context.projectPath
  );

  validatePath(absolutePath, context.projectPath);

  // Check if file exists
  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: `File not found: ${input.path}`,
      developerMessage: `File not accessible: ${absolutePath}`,
    });
  }

  // Check if it's a file (not directory)
  const stats = await fs.promises.stat(absolutePath);
  if (!stats.isFile()) {
    throw new MCPError({
      code: ErrorCode.INVALID_PATH,
      userMessage: `Path is not a file: ${input.path}`,
      developerMessage: `Path is a directory or other non-file: ${absolutePath}`,
    });
  }

  // Read file content
  let content: string;
  try {
    content = await fs.promises.readFile(absolutePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: `Failed to read file: ${input.path}`,
      developerMessage: `Error reading file ${absolutePath}: ${message}`,
    });
  }

  // Extract file summary
  const options: SymbolExtractionOptions = {
    includeComplexity: input.includeComplexity,
    includeDocstrings: input.includeDocstrings,
  };

  const summary = await extractFileSummary(content, absolutePath, relativePath, options);

  if (!summary) {
    throw new MCPError({
      code: ErrorCode.EXTRACTION_FAILED,
      userMessage: `Failed to extract symbols from file: ${input.path}`,
      developerMessage: `Symbol extraction returned null for ${absolutePath}`,
    });
  }

  // Convert to output format
  const output = convertToOutput(summary, relativePath);

  logger.info('getFileSummary', 'File summary extracted', {
    path: relativePath,
    language: output.language,
    functions: output.functions.length,
    classes: output.classes.length,
    imports: output.imports.length,
    exports: output.exports.length,
    complexity: output.complexity.score,
    timeMs: output.extractionTimeMs,
  });

  return output;
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for get_file_summary
 *
 * This tool extracts symbols and complexity metrics from a file.
 * It does NOT require confirmation as it's a read-only operation.
 */
export const getFileSummaryTool = {
  name: 'get_file_summary',
  description: 'Get file summary with functions, classes, imports, exports, and complexity metrics',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file (relative to project root or absolute)',
      },
      includeComplexity: {
        type: 'boolean',
        description: 'Include complexity metrics (default: true)',
        default: true,
      },
      includeDocstrings: {
        type: 'boolean',
        description: 'Include docstrings/comments (default: true)',
        default: true,
      },
    },
    required: ['path'] as string[],
  },
  requiresConfirmation: false,
};
