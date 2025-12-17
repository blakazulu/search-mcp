/**
 * Symbol Extraction & Complexity Metrics Engine (SMCP-090)
 *
 * Extracts symbols (functions, classes, imports, exports) from code files
 * and calculates complexity metrics. Uses Tree-sitter for AST parsing.
 *
 * Features:
 * - Extract functions, classes, methods, interfaces
 * - Extract imports and exports
 * - Calculate cyclomatic complexity
 * - Calculate nesting depth
 * - Calculate overall complexity score
 * - Fast extraction (< 100ms per typical file)
 *
 * Inspired by code-index-mcp's get_file_summary capability.
 *
 * @module symbolExtractor
 */

import type { Node } from 'web-tree-sitter';
import { getTreeSitterParser, type ASTLanguage } from './treeSitterParser.js';
import { getLogger } from '../utils/logger.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Information about a symbol (function, class, method, etc.)
 */
export interface SymbolInfo {
  /** Symbol name */
  name: string;
  /** Symbol type */
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'enum' | 'struct' | 'trait' | 'variable' | 'constant';
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Function/method signature (for functions/methods) */
  signature?: string;
  /** Docstring or comment */
  docstring?: string;
  /** Whether the symbol is exported */
  isExported?: boolean;
  /** Whether the symbol is async (for functions/methods) */
  isAsync?: boolean;
  /** Whether the symbol is static (for methods) */
  isStatic?: boolean;
  /** Visibility modifier */
  visibility?: 'public' | 'private' | 'protected';
  /** Parameter count (for functions/methods) */
  paramCount?: number;
  /** Return type (if available) */
  returnType?: string;
  /** Parent symbol name (for methods in classes) */
  parentName?: string;
  /** Decorators/annotations */
  decorators?: string[];
  /** Cyclomatic complexity (for functions/methods) */
  complexity?: number;
  /** Maximum nesting depth */
  nestingDepth?: number;
}

/**
 * Import information
 */
export interface ImportInfo {
  /** The module/package being imported */
  module: string;
  /** Named imports (e.g., { foo, bar } from 'module') */
  names?: string[];
  /** Default import name */
  defaultImport?: string;
  /** Whether it's a namespace import (import * as X) */
  isNamespace?: boolean;
  /** Line number */
  line: number;
}

/**
 * Export information
 */
export interface ExportInfo {
  /** Exported name */
  name: string;
  /** Export type */
  type: 'named' | 'default' | 'reexport' | 'namespace';
  /** Original name if renamed (export { foo as bar }) */
  originalName?: string;
  /** Source module for re-exports */
  sourceModule?: string;
  /** Line number */
  line: number;
}

/**
 * Complexity metrics for a file
 */
export interface ComplexityMetrics {
  /** Total cyclomatic complexity (sum of all functions) */
  cyclomaticComplexity: number;
  /** Maximum nesting depth in the file */
  maxNestingDepth: number;
  /** Average function complexity */
  avgFunctionComplexity: number;
  /** Number of decision points (if, while, for, &&, ||, etc.) */
  decisionPoints: number;
  /** Overall complexity score (0-100) */
  overallScore: number;
}

/**
 * File summary with symbols and complexity metrics
 */
export interface FileSummary {
  /** Absolute file path */
  path: string;
  /** Relative file path (from project root) */
  relativePath: string;
  /** Detected programming language */
  language: ASTLanguage | string;
  /** Total lines of code */
  lines: number;
  /** Lines of actual code (excluding blank lines and comments) */
  codeLines: number;
  /** Number of blank lines */
  blankLines: number;
  /** Number of comment lines */
  commentLines: number;
  /** Functions and methods */
  functions: SymbolInfo[];
  /** Classes, interfaces, structs, etc. */
  classes: SymbolInfo[];
  /** Import statements */
  imports: ImportInfo[];
  /** Export statements */
  exports: ExportInfo[];
  /** Complexity metrics */
  complexity: ComplexityMetrics;
  /** File size in bytes */
  size: number;
  /** Extraction duration in milliseconds */
  extractionTimeMs: number;
}

/**
 * Options for symbol extraction
 */
export interface SymbolExtractionOptions {
  /** Include complexity metrics (default: true) */
  includeComplexity?: boolean;
  /** Include docstrings (default: true) */
  includeDocstrings?: boolean;
  /** Maximum file size to process in bytes (default: 1MB) */
  maxFileSize?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default extraction options
 */
export const DEFAULT_EXTRACTION_OPTIONS: Required<SymbolExtractionOptions> = {
  includeComplexity: true,
  includeDocstrings: true,
  maxFileSize: 1024 * 1024, // 1MB
};

/**
 * Decision point node types for cyclomatic complexity calculation
 */
const DECISION_POINT_TYPES: Record<ASTLanguage, string[]> = {
  javascript: [
    'if_statement', 'else_clause', 'for_statement', 'for_in_statement',
    'while_statement', 'do_statement', 'switch_case', 'catch_clause',
    'ternary_expression', 'binary_expression', // && and ||
  ],
  typescript: [
    'if_statement', 'else_clause', 'for_statement', 'for_in_statement',
    'while_statement', 'do_statement', 'switch_case', 'catch_clause',
    'ternary_expression', 'binary_expression',
  ],
  tsx: [
    'if_statement', 'else_clause', 'for_statement', 'for_in_statement',
    'while_statement', 'do_statement', 'switch_case', 'catch_clause',
    'ternary_expression', 'binary_expression',
  ],
  python: [
    'if_statement', 'elif_clause', 'else_clause', 'for_statement',
    'while_statement', 'except_clause', 'with_statement',
    'conditional_expression', 'boolean_operator',
  ],
  go: [
    'if_statement', 'for_statement', 'type_switch_statement',
    'expression_switch_statement', 'select_statement',
    'binary_expression', // && and ||
  ],
  java: [
    'if_statement', 'else', 'for_statement', 'enhanced_for_statement',
    'while_statement', 'do_statement', 'switch_expression',
    'catch_clause', 'ternary_expression', 'binary_expression',
  ],
  rust: [
    'if_expression', 'else_clause', 'for_expression', 'while_expression',
    'loop_expression', 'match_expression', 'match_arm',
    'binary_expression', // && and ||
  ],
  c: [
    'if_statement', 'else_clause', 'for_statement', 'while_statement',
    'do_statement', 'switch_statement', 'case_statement',
    'conditional_expression', 'binary_expression',
  ],
  cpp: [
    'if_statement', 'else_clause', 'for_statement', 'for_range_loop',
    'while_statement', 'do_statement', 'switch_statement', 'case_statement',
    'conditional_expression', 'binary_expression', 'catch_clause',
  ],
  csharp: [
    'if_statement', 'else_clause', 'for_statement', 'foreach_statement',
    'while_statement', 'do_statement', 'switch_statement', 'switch_section',
    'conditional_expression', 'binary_expression', 'catch_clause',
  ],
};

/**
 * Logical operator types that count as decision points
 */
const LOGICAL_OPERATORS = ['&&', '||', 'and', 'or'];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a child node by type(s)
 */
function findChildByType(node: Node, types: string[]): Node | null {
  for (const child of node.children) {
    if (types.includes(child.type)) {
      return child;
    }
  }
  return null;
}

/**
 * Find all children of a specific type
 */
function findAllChildrenByType(node: Node, types: string[]): Node[] {
  const results: Node[] = [];
  for (const child of node.children) {
    if (types.includes(child.type)) {
      results.push(child);
    }
  }
  return results;
}

/**
 * Get the text of a child field
 */
function getChildFieldText(node: Node, fieldName: string): string | undefined {
  const child = node.childForFieldName(fieldName);
  return child?.text;
}

/**
 * Extract docstring/comment from preceding sibling
 */
function extractDocstring(node: Node, language: ASTLanguage): string | undefined {
  const prevSibling = node.previousNamedSibling;
  if (!prevSibling) return undefined;

  const commentTypes = ['comment', 'block_comment', 'line_comment'];
  if (!commentTypes.includes(prevSibling.type)) return undefined;

  const text = prevSibling.text;

  // Clean up different comment styles
  if (text.startsWith('/**')) {
    // JSDoc/Javadoc style
    return text
      .replace(/^\/\*\*\s*/, '')
      .replace(/\s*\*\/$/, '')
      .replace(/^\s*\*\s?/gm, '')
      .trim();
  } else if (text.startsWith('///') || text.startsWith('//!')) {
    // Rust doc comments - collect consecutive
    const docComments = [text];
    let prev = prevSibling.previousNamedSibling;
    while (prev?.type === 'line_comment' && (prev.text.startsWith('///') || prev.text.startsWith('//!'))) {
      docComments.unshift(prev.text);
      prev = prev.previousNamedSibling;
    }
    return docComments
      .map(line => line.replace(/^\/\/[\/!]\s?/, ''))
      .join('\n')
      .trim();
  } else if (text.startsWith('//') || text.startsWith('#')) {
    // Single line comment
    return text.replace(/^[/#]+\s*/, '').trim();
  } else if (text.startsWith('/*')) {
    // Block comment
    return text
      .replace(/^\/\*\s*/, '')
      .replace(/\s*\*\/$/, '')
      .replace(/^\s*\*\s?/gm, '')
      .trim();
  }

  return undefined;
}

/**
 * Build a function signature from a node
 */
function buildSignature(node: Node, source: string): string {
  const startLine = node.startPosition.row;
  const lines = source.split('\n');

  // Get the first few lines until body starts
  let signatureLines: string[] = [];
  for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
    const line = lines[i];
    signatureLines.push(line);
    if (line.includes('{') || line.includes(':') || line.trimEnd().endsWith(':')) {
      break;
    }
  }

  let signature = signatureLines.join('\n').trim();

  // Remove body
  const bodyStart = signature.search(/\{|:\s*$/);
  if (bodyStart > 0) {
    signature = signature.substring(0, bodyStart).trim();
  }

  // Limit length
  if (signature.length > 200) {
    signature = signature.substring(0, 200) + '...';
  }

  return signature;
}

/**
 * Count decision points in a node tree
 */
function countDecisionPoints(node: Node, language: ASTLanguage): number {
  const decisionTypes = DECISION_POINT_TYPES[language] || [];
  let count = 0;

  function traverse(n: Node) {
    if (decisionTypes.includes(n.type)) {
      // Check if binary_expression is a logical operator
      if (n.type === 'binary_expression' || n.type === 'boolean_operator') {
        const operator = n.childForFieldName('operator')?.text || n.children[1]?.text;
        if (operator && LOGICAL_OPERATORS.includes(operator)) {
          count++;
        }
      } else {
        count++;
      }
    }

    for (const child of n.namedChildren) {
      traverse(child);
    }
  }

  traverse(node);
  return count;
}

/**
 * Calculate maximum nesting depth in a node
 */
function calculateNestingDepth(node: Node, language: ASTLanguage): number {
  const nestingTypes = [
    'if_statement', 'if_expression',
    'for_statement', 'for_expression', 'for_in_statement',
    'while_statement', 'while_expression',
    'do_statement',
    'switch_statement', 'switch_expression', 'match_expression',
    'try_statement', 'with_statement',
    'function_declaration', 'function_definition', 'function_item',
    'arrow_function', 'lambda_expression',
  ];

  let maxDepth = 0;

  function traverse(n: Node, depth: number) {
    const currentDepth = nestingTypes.includes(n.type) ? depth + 1 : depth;
    maxDepth = Math.max(maxDepth, currentDepth);

    for (const child of n.namedChildren) {
      traverse(child, currentDepth);
    }
  }

  traverse(node, 0);
  return maxDepth;
}

/**
 * Count lines of code, blank lines, and comment lines
 */
function countLines(source: string, tree: any): { total: number; code: number; blank: number; comment: number } {
  const lines = source.split('\n');
  const total = lines.length;

  let blank = 0;
  let commentLines = new Set<number>();

  // Count blank lines
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      blank++;
    }
  });

  // Find comment lines from AST
  function findComments(node: Node) {
    if (node.type === 'comment' || node.type === 'block_comment' || node.type === 'line_comment') {
      const startLine = node.startPosition.row;
      const endLine = node.endPosition.row;
      for (let i = startLine; i <= endLine; i++) {
        commentLines.add(i);
      }
    }
    for (const child of node.children) {
      findComments(child);
    }
  }

  if (tree?.rootNode) {
    findComments(tree.rootNode);
  }

  const comment = commentLines.size;
  const code = total - blank - comment;

  return { total, code: Math.max(0, code), blank, comment };
}

// ============================================================================
// Language-Specific Extractors
// ============================================================================

/**
 * Extract symbols from JavaScript/TypeScript
 */
function extractJsTsSymbols(
  node: Node,
  source: string,
  language: ASTLanguage,
  options: Required<SymbolExtractionOptions>
): { functions: SymbolInfo[]; classes: SymbolInfo[]; imports: ImportInfo[]; exports: ExportInfo[] } {
  const functions: SymbolInfo[] = [];
  const classes: SymbolInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  function traverse(n: Node, parentClass?: string) {
    const nodeType = n.type;

    // Functions
    if (nodeType === 'function_declaration' || nodeType === 'function_expression' ||
        nodeType === 'arrow_function' || nodeType === 'generator_function_declaration') {
      const nameNode = n.childForFieldName('name') || findChildByType(n, ['identifier', 'property_identifier']);
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'function',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(n, source),
          isAsync: n.firstChild?.text === 'async',
          paramCount: n.childForFieldName('parameters')?.namedChildCount,
          returnType: getChildFieldText(n, 'return_type')?.replace(/^:\s*/, ''),
        };

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(n, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(n, language);
        }

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        // Check if exported
        if (n.parent?.type === 'export_statement') {
          symbol.isExported = true;
        }

        functions.push(symbol);
      }
    }

    // Methods
    if (nodeType === 'method_definition') {
      const nameNode = n.childForFieldName('name') || findChildByType(n, ['property_identifier']);
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'method',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(n, source),
          isAsync: n.children.some(c => c.text === 'async'),
          isStatic: n.children.some(c => c.text === 'static'),
          paramCount: n.childForFieldName('parameters')?.namedChildCount,
          parentName: parentClass,
        };

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(n, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(n, language);
        }

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        functions.push(symbol);
      }
    }

    // Classes
    if (nodeType === 'class_declaration' || nodeType === 'class') {
      const nameNode = n.childForFieldName('name') || findChildByType(n, ['identifier', 'type_identifier']);
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'class',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          isExported: n.parent?.type === 'export_statement',
        };

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        classes.push(symbol);

        // Traverse class body for methods
        const body = n.childForFieldName('body');
        if (body) {
          for (const child of body.namedChildren) {
            traverse(child, name);
          }
        }
        return; // Don't traverse children again
      }
    }

    // Interfaces (TypeScript)
    if (nodeType === 'interface_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        classes.push({
          name,
          type: 'interface',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          isExported: n.parent?.type === 'export_statement',
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });
      }
    }

    // Type aliases (TypeScript)
    if (nodeType === 'type_alias_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        classes.push({
          name,
          type: 'type',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          isExported: n.parent?.type === 'export_statement',
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });
      }
    }

    // Enums (TypeScript)
    if (nodeType === 'enum_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        classes.push({
          name,
          type: 'enum',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          isExported: n.parent?.type === 'export_statement',
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });
      }
    }

    // Imports
    if (nodeType === 'import_statement' || nodeType === 'import_declaration') {
      const sourceNode = n.childForFieldName('source') || findChildByType(n, ['string']);
      const moduleName = sourceNode?.text?.replace(/['"]/g, '');

      if (moduleName) {
        const importInfo: ImportInfo = {
          module: moduleName,
          line: n.startPosition.row + 1,
        };

        // Check for default import
        const defaultImport = findChildByType(n, ['identifier']);
        if (defaultImport && defaultImport.type === 'identifier') {
          importInfo.defaultImport = defaultImport.text;
        }

        // Check for named imports
        const namedImports = findChildByType(n, ['named_imports', 'import_clause']);
        if (namedImports) {
          const names = findAllChildrenByType(namedImports, ['import_specifier', 'identifier'])
            .map(spec => {
              const name = spec.childForFieldName('name') || spec;
              return name.text;
            })
            .filter(Boolean);
          if (names.length > 0) {
            importInfo.names = names;
          }
        }

        // Check for namespace import
        const namespaceImport = findChildByType(n, ['namespace_import']);
        if (namespaceImport) {
          importInfo.isNamespace = true;
          const alias = findChildByType(namespaceImport, ['identifier']);
          if (alias) {
            importInfo.defaultImport = alias.text;
          }
        }

        imports.push(importInfo);
      }
    }

    // Exports
    if (nodeType === 'export_statement') {
      // Check for re-export
      const sourceNode = n.childForFieldName('source') || findChildByType(n, ['string']);
      if (sourceNode) {
        const sourceModule = sourceNode.text?.replace(/['"]/g, '');

        // Named re-exports
        const exportClause = findChildByType(n, ['export_clause']);
        if (exportClause) {
          for (const spec of exportClause.namedChildren) {
            const name = spec.childForFieldName('name')?.text || spec.text;
            const alias = spec.childForFieldName('alias')?.text;
            exports.push({
              name: alias || name,
              type: 'reexport',
              originalName: alias ? name : undefined,
              sourceModule,
              line: n.startPosition.row + 1,
            });
          }
        } else {
          // Namespace re-export (export * from 'module')
          exports.push({
            name: '*',
            type: 'namespace',
            sourceModule,
            line: n.startPosition.row + 1,
          });
        }
      } else {
        // Regular exports
        const declaration = n.namedChildren.find(c =>
          ['function_declaration', 'class_declaration', 'lexical_declaration', 'variable_declaration'].includes(c.type)
        );

        if (declaration) {
          const nameNode = declaration.childForFieldName('name') ||
                          findChildByType(declaration, ['identifier', 'type_identifier']);
          if (nameNode) {
            exports.push({
              name: nameNode.text,
              type: 'named',
              line: n.startPosition.row + 1,
            });
          }
        }

        // Default export
        if (n.children.some(c => c.text === 'default')) {
          const defaultValue = n.namedChildren.find(c =>
            ['identifier', 'class_declaration', 'function_declaration', 'arrow_function'].includes(c.type)
          );
          exports.push({
            name: defaultValue?.childForFieldName('name')?.text || 'default',
            type: 'default',
            line: n.startPosition.row + 1,
          });
        }

        // Named export clause (export { foo, bar })
        const exportClause = findChildByType(n, ['export_clause']);
        if (exportClause && !sourceNode) {
          for (const spec of exportClause.namedChildren) {
            const name = spec.childForFieldName('name')?.text || spec.text;
            const alias = spec.childForFieldName('alias')?.text;
            exports.push({
              name: alias || name,
              type: 'named',
              originalName: alias ? name : undefined,
              line: n.startPosition.row + 1,
            });
          }
        }
      }
    }

    // Continue traversal
    for (const child of n.namedChildren) {
      traverse(child, parentClass);
    }
  }

  traverse(node);
  return { functions, classes, imports, exports };
}

/**
 * Extract symbols from Python
 */
function extractPythonSymbols(
  node: Node,
  source: string,
  language: ASTLanguage,
  options: Required<SymbolExtractionOptions>
): { functions: SymbolInfo[]; classes: SymbolInfo[]; imports: ImportInfo[]; exports: ExportInfo[] } {
  const functions: SymbolInfo[] = [];
  const classes: SymbolInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = []; // Python doesn't have explicit exports like JS

  function traverse(n: Node, parentClass?: string) {
    const nodeType = n.type;

    // Handle decorated definitions
    let actualNode = n;
    let decorators: string[] = [];
    if (nodeType === 'decorated_definition') {
      for (const child of n.namedChildren) {
        if (child.type === 'decorator') {
          decorators.push(child.text);
        } else if (child.type === 'function_definition' || child.type === 'class_definition') {
          actualNode = child;
          break;
        }
      }
    }

    // Functions
    if (actualNode.type === 'function_definition') {
      const nameNode = actualNode.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: parentClass ? 'method' : 'function',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(actualNode, source),
          isAsync: actualNode.firstChild?.text === 'async',
          paramCount: actualNode.childForFieldName('parameters')?.namedChildren
            .filter(c => c.type !== 'comment' && c.text !== 'self' && c.text !== 'cls').length,
          returnType: getChildFieldText(actualNode, 'return_type')?.replace(/^->\s*/, ''),
          parentName: parentClass,
          decorators: decorators.length > 0 ? decorators : undefined,
          isStatic: decorators.some(d => d.includes('@staticmethod')),
        };

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(actualNode, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(actualNode, language);
        }

        if (options.includeDocstrings) {
          // Python docstrings are inside the function body
          const body = actualNode.childForFieldName('body');
          if (body) {
            const firstStatement = body.firstNamedChild;
            if (firstStatement?.type === 'expression_statement') {
              const string = firstStatement.firstNamedChild;
              if (string?.type === 'string') {
                let docstring = string.text;
                if (docstring.startsWith('"""') || docstring.startsWith("'''")) {
                  docstring = docstring.slice(3, -3);
                } else if (docstring.startsWith('"') || docstring.startsWith("'")) {
                  docstring = docstring.slice(1, -1);
                }
                symbol.docstring = docstring.trim();
              }
            }
          }
        }

        functions.push(symbol);
      }
    }

    // Classes
    if (actualNode.type === 'class_definition') {
      const nameNode = actualNode.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'class',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          decorators: decorators.length > 0 ? decorators : undefined,
        };

        if (options.includeDocstrings) {
          // Python class docstrings
          const body = actualNode.childForFieldName('body');
          if (body) {
            const firstStatement = body.firstNamedChild;
            if (firstStatement?.type === 'expression_statement') {
              const string = firstStatement.firstNamedChild;
              if (string?.type === 'string') {
                let docstring = string.text;
                if (docstring.startsWith('"""') || docstring.startsWith("'''")) {
                  docstring = docstring.slice(3, -3);
                }
                symbol.docstring = docstring.trim();
              }
            }
          }
        }

        classes.push(symbol);

        // Traverse class body for methods
        const body = actualNode.childForFieldName('body');
        if (body) {
          for (const child of body.namedChildren) {
            traverse(child, name);
          }
        }
        return;
      }
    }

    // Imports
    if (nodeType === 'import_statement') {
      const names = findAllChildrenByType(n, ['dotted_name', 'aliased_import'])
        .map(item => {
          if (item.type === 'aliased_import') {
            return item.childForFieldName('name')?.text || item.text;
          }
          return item.text;
        });

      for (const name of names) {
        if (name) {
          imports.push({
            module: name,
            line: n.startPosition.row + 1,
          });
        }
      }
    }

    if (nodeType === 'import_from_statement') {
      const moduleNode = n.childForFieldName('module_name') || findChildByType(n, ['dotted_name', 'relative_import']);
      const moduleName = moduleNode?.text;

      if (moduleName) {
        const importInfo: ImportInfo = {
          module: moduleName,
          line: n.startPosition.row + 1,
          names: [],
        };

        // Named imports
        const importedNames = findAllChildrenByType(n, ['dotted_name', 'aliased_import']);
        for (const item of importedNames) {
          if (item !== moduleNode) {
            const name = item.type === 'aliased_import'
              ? item.childForFieldName('name')?.text
              : item.text;
            if (name) {
              importInfo.names!.push(name);
            }
          }
        }

        // Check for wildcard import
        if (n.text.includes('*')) {
          importInfo.isNamespace = true;
        }

        imports.push(importInfo);
      }
    }

    // Continue traversal (skip class bodies we already handled)
    if (actualNode.type !== 'class_definition') {
      for (const child of n.namedChildren) {
        traverse(child, parentClass);
      }
    }
  }

  traverse(node);
  return { functions, classes, imports, exports };
}

/**
 * Extract symbols from Go
 */
function extractGoSymbols(
  node: Node,
  source: string,
  language: ASTLanguage,
  options: Required<SymbolExtractionOptions>
): { functions: SymbolInfo[]; classes: SymbolInfo[]; imports: ImportInfo[]; exports: ExportInfo[] } {
  const functions: SymbolInfo[] = [];
  const classes: SymbolInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  function isExported(name: string): boolean {
    return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
  }

  function traverse(n: Node) {
    const nodeType = n.type;

    // Functions
    if (nodeType === 'function_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'function',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(n, source),
          isExported: isExported(name),
          paramCount: n.childForFieldName('parameters')?.namedChildCount,
        };

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(n, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(n, language);
        }

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        functions.push(symbol);

        if (symbol.isExported) {
          exports.push({
            name,
            type: 'named',
            line: n.startPosition.row + 1,
          });
        }
      }
    }

    // Methods
    if (nodeType === 'method_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;
      const receiver = n.childForFieldName('receiver');
      const receiverType = receiver ? findChildByType(receiver, ['type_identifier', 'pointer_type'])?.text?.replace(/^\*/, '') : undefined;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'method',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(n, source),
          isExported: isExported(name),
          paramCount: n.childForFieldName('parameters')?.namedChildCount,
          parentName: receiverType,
        };

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(n, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(n, language);
        }

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        functions.push(symbol);
      }
    }

    // Type declarations (structs, interfaces)
    if (nodeType === 'type_declaration') {
      const typeSpec = findChildByType(n, ['type_spec']);
      if (typeSpec) {
        const nameNode = typeSpec.childForFieldName('name');
        const name = nameNode?.text;
        const typeBody = typeSpec.childForFieldName('type');

        if (name) {
          let symbolType: SymbolInfo['type'] = 'type';
          if (typeBody?.type === 'struct_type') {
            symbolType = 'struct';
          } else if (typeBody?.type === 'interface_type') {
            symbolType = 'interface';
          }

          const symbol: SymbolInfo = {
            name,
            type: symbolType,
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            isExported: isExported(name),
          };

          if (options.includeDocstrings) {
            symbol.docstring = extractDocstring(n, language);
          }

          classes.push(symbol);

          if (symbol.isExported) {
            exports.push({
              name,
              type: 'named',
              line: n.startPosition.row + 1,
            });
          }
        }
      }
    }

    // Imports
    if (nodeType === 'import_declaration') {
      const importSpec = findChildByType(n, ['import_spec']);
      const importSpecList = findChildByType(n, ['import_spec_list']);

      if (importSpec) {
        const pathNode = importSpec.childForFieldName('path') || findChildByType(importSpec, ['interpreted_string_literal']);
        const path = pathNode?.text?.replace(/"/g, '');
        if (path) {
          imports.push({
            module: path,
            line: n.startPosition.row + 1,
          });
        }
      } else if (importSpecList) {
        for (const spec of importSpecList.namedChildren) {
          if (spec.type === 'import_spec') {
            const pathNode = spec.childForFieldName('path') || findChildByType(spec, ['interpreted_string_literal']);
            const path = pathNode?.text?.replace(/"/g, '');
            const alias = spec.childForFieldName('name')?.text;
            if (path) {
              imports.push({
                module: path,
                defaultImport: alias,
                line: spec.startPosition.row + 1,
              });
            }
          }
        }
      }
    }

    // Continue traversal
    for (const child of n.namedChildren) {
      traverse(child);
    }
  }

  traverse(node);
  return { functions, classes, imports, exports };
}

/**
 * Extract symbols from Java
 */
function extractJavaSymbols(
  node: Node,
  source: string,
  language: ASTLanguage,
  options: Required<SymbolExtractionOptions>
): { functions: SymbolInfo[]; classes: SymbolInfo[]; imports: ImportInfo[]; exports: ExportInfo[] } {
  const functions: SymbolInfo[] = [];
  const classes: SymbolInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = []; // Java uses public modifier instead of exports

  function getVisibility(modifiers: Node | null): 'public' | 'private' | 'protected' | undefined {
    if (!modifiers) return undefined;
    for (const mod of modifiers.children) {
      if (mod.text === 'public') return 'public';
      if (mod.text === 'private') return 'private';
      if (mod.text === 'protected') return 'protected';
    }
    return undefined;
  }

  function isStatic(modifiers: Node | null): boolean {
    if (!modifiers) return false;
    return modifiers.children.some(m => m.text === 'static');
  }

  function traverse(n: Node, parentClass?: string) {
    const nodeType = n.type;

    // Methods
    if (nodeType === 'method_declaration' || nodeType === 'constructor_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;
      const modifiers = findChildByType(n, ['modifiers']);

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'method',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(n, source),
          visibility: getVisibility(modifiers),
          isStatic: isStatic(modifiers),
          paramCount: n.childForFieldName('parameters')?.namedChildCount,
          parentName: parentClass,
        };

        if (nodeType === 'constructor_declaration') {
          symbol.name = parentClass || name;
        }

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(n, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(n, language);
        }

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        functions.push(symbol);
      }
    }

    // Classes
    if (nodeType === 'class_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;
      const modifiers = findChildByType(n, ['modifiers']);

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'class',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          visibility: getVisibility(modifiers),
          isExported: getVisibility(modifiers) === 'public',
        };

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        classes.push(symbol);

        // Traverse class body for methods
        const body = n.childForFieldName('body');
        if (body) {
          for (const child of body.namedChildren) {
            traverse(child, name);
          }
        }
        return;
      }
    }

    // Interfaces
    if (nodeType === 'interface_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;
      const modifiers = findChildByType(n, ['modifiers']);

      if (name) {
        classes.push({
          name,
          type: 'interface',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          visibility: getVisibility(modifiers),
          isExported: getVisibility(modifiers) === 'public',
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });
      }
    }

    // Enums
    if (nodeType === 'enum_declaration') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;
      const modifiers = findChildByType(n, ['modifiers']);

      if (name) {
        classes.push({
          name,
          type: 'enum',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          visibility: getVisibility(modifiers),
          isExported: getVisibility(modifiers) === 'public',
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });
      }
    }

    // Imports
    if (nodeType === 'import_declaration') {
      const scopedId = findChildByType(n, ['scoped_identifier', 'identifier']);
      const moduleName = scopedId?.text;
      const isWildcard = n.text.includes('*');

      if (moduleName) {
        imports.push({
          module: moduleName,
          isNamespace: isWildcard,
          line: n.startPosition.row + 1,
        });
      }
    }

    // Continue traversal (skip class bodies we already handled)
    if (nodeType !== 'class_declaration') {
      for (const child of n.namedChildren) {
        traverse(child, parentClass);
      }
    }
  }

  traverse(node);
  return { functions, classes, imports, exports };
}

/**
 * Extract symbols from Rust
 */
function extractRustSymbols(
  node: Node,
  source: string,
  language: ASTLanguage,
  options: Required<SymbolExtractionOptions>
): { functions: SymbolInfo[]; classes: SymbolInfo[]; imports: ImportInfo[]; exports: ExportInfo[] } {
  const functions: SymbolInfo[] = [];
  const classes: SymbolInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  function isPublic(n: Node): boolean {
    return n.children.some(c => c.text === 'pub');
  }

  function isAsync(n: Node): boolean {
    return n.children.some(c => c.text === 'async');
  }

  function traverse(n: Node) {
    const nodeType = n.type;

    // Functions
    if (nodeType === 'function_item') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'function',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(n, source),
          isExported: isPublic(n),
          isAsync: isAsync(n),
          visibility: isPublic(n) ? 'public' : 'private',
          paramCount: n.childForFieldName('parameters')?.namedChildCount,
        };

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(n, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(n, language);
        }

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        functions.push(symbol);

        if (symbol.isExported) {
          exports.push({
            name,
            type: 'named',
            line: n.startPosition.row + 1,
          });
        }
      }
    }

    // Structs
    if (nodeType === 'struct_item') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: 'struct',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          isExported: isPublic(n),
          visibility: isPublic(n) ? 'public' : 'private',
        };

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        classes.push(symbol);

        if (symbol.isExported) {
          exports.push({
            name,
            type: 'named',
            line: n.startPosition.row + 1,
          });
        }
      }
    }

    // Enums
    if (nodeType === 'enum_item') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        classes.push({
          name,
          type: 'enum',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          isExported: isPublic(n),
          visibility: isPublic(n) ? 'public' : 'private',
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });

        if (isPublic(n)) {
          exports.push({
            name,
            type: 'named',
            line: n.startPosition.row + 1,
          });
        }
      }
    }

    // Traits
    if (nodeType === 'trait_item') {
      const nameNode = n.childForFieldName('name');
      const name = nameNode?.text;

      if (name) {
        classes.push({
          name,
          type: 'trait',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          isExported: isPublic(n),
          visibility: isPublic(n) ? 'public' : 'private',
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });

        if (isPublic(n)) {
          exports.push({
            name,
            type: 'named',
            line: n.startPosition.row + 1,
          });
        }
      }
    }

    // Impl blocks
    if (nodeType === 'impl_item') {
      const typeNode = findChildByType(n, ['type_identifier', 'generic_type']);
      const typeName = typeNode?.text;

      // Extract methods from impl block
      const body = n.childForFieldName('body');
      if (body) {
        for (const child of body.namedChildren) {
          if (child.type === 'function_item') {
            const nameNode = child.childForFieldName('name');
            const name = nameNode?.text;

            if (name) {
              const symbol: SymbolInfo = {
                name,
                type: 'method',
                startLine: child.startPosition.row + 1,
                endLine: child.endPosition.row + 1,
                signature: buildSignature(child, source),
                isExported: isPublic(child),
                isAsync: isAsync(child),
                visibility: isPublic(child) ? 'public' : 'private',
                paramCount: child.childForFieldName('parameters')?.namedChildCount,
                parentName: typeName,
              };

              if (options.includeComplexity) {
                symbol.complexity = countDecisionPoints(child, language) + 1;
                symbol.nestingDepth = calculateNestingDepth(child, language);
              }

              if (options.includeDocstrings) {
                symbol.docstring = extractDocstring(child, language);
              }

              functions.push(symbol);
            }
          }
        }
      }
    }

    // Use declarations (imports)
    if (nodeType === 'use_declaration') {
      const useTree = n.childForFieldName('argument') || findChildByType(n, ['use_wildcard', 'scoped_identifier', 'identifier', 'use_list']);
      const modulePath = useTree?.text;

      if (modulePath) {
        imports.push({
          module: modulePath,
          isNamespace: modulePath.includes('*'),
          line: n.startPosition.row + 1,
        });
      }
    }

    // Continue traversal (skip impl blocks we already handled)
    if (nodeType !== 'impl_item') {
      for (const child of n.namedChildren) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return { functions, classes, imports, exports };
}

/**
 * Generic extractor for C/C++/C#
 */
function extractCStyleSymbols(
  node: Node,
  source: string,
  language: ASTLanguage,
  options: Required<SymbolExtractionOptions>
): { functions: SymbolInfo[]; classes: SymbolInfo[]; imports: ImportInfo[]; exports: ExportInfo[] } {
  const functions: SymbolInfo[] = [];
  const classes: SymbolInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  function traverse(n: Node, parentClass?: string) {
    const nodeType = n.type;

    // Functions
    if (nodeType === 'function_definition' || nodeType === 'method_declaration' ||
        nodeType === 'constructor_declaration') {
      const nameNode = n.childForFieldName('name') || n.childForFieldName('declarator') ||
                       findChildByType(n, ['identifier', 'function_declarator']);
      let name = nameNode?.text;

      // Handle function declarator
      if (nameNode?.type === 'function_declarator') {
        const innerName = nameNode.childForFieldName('declarator') || findChildByType(nameNode, ['identifier']);
        name = innerName?.text?.replace(/^\*+/, '');
      } else {
        name = name?.replace(/^\*+/, '');
      }

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: parentClass ? 'method' : 'function',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          signature: buildSignature(n, source),
          parentName: parentClass,
        };

        if (options.includeComplexity) {
          symbol.complexity = countDecisionPoints(n, language) + 1;
          symbol.nestingDepth = calculateNestingDepth(n, language);
        }

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        functions.push(symbol);
      }
    }

    // Classes/Structs
    if (nodeType === 'class_specifier' || nodeType === 'struct_specifier' ||
        nodeType === 'class_declaration' || nodeType === 'struct_declaration') {
      const nameNode = n.childForFieldName('name') || findChildByType(n, ['type_identifier', 'identifier']);
      const name = nameNode?.text;

      if (name) {
        const symbol: SymbolInfo = {
          name,
          type: nodeType.includes('struct') ? 'struct' : 'class',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
        };

        if (options.includeDocstrings) {
          symbol.docstring = extractDocstring(n, language);
        }

        classes.push(symbol);

        // Traverse body for methods
        const body = n.childForFieldName('body') || findChildByType(n, ['field_declaration_list', 'declaration_list']);
        if (body) {
          for (const child of body.namedChildren) {
            traverse(child, name);
          }
        }
        return;
      }
    }

    // Enums
    if (nodeType === 'enum_specifier' || nodeType === 'enum_declaration') {
      const nameNode = n.childForFieldName('name') || findChildByType(n, ['type_identifier', 'identifier']);
      const name = nameNode?.text;

      if (name) {
        classes.push({
          name,
          type: 'enum',
          startLine: n.startPosition.row + 1,
          endLine: n.endPosition.row + 1,
          docstring: options.includeDocstrings ? extractDocstring(n, language) : undefined,
        });
      }
    }

    // Includes (C/C++)
    if (nodeType === 'preproc_include') {
      const pathNode = n.childForFieldName('path') || findChildByType(n, ['string_literal', 'system_lib_string']);
      const path = pathNode?.text?.replace(/[<>"]/g, '');

      if (path) {
        imports.push({
          module: path,
          line: n.startPosition.row + 1,
        });
      }
    }

    // Using directives (C#)
    if (nodeType === 'using_directive') {
      const nameNode = findChildByType(n, ['identifier', 'qualified_name']);
      const name = nameNode?.text;

      if (name) {
        imports.push({
          module: name,
          line: n.startPosition.row + 1,
        });
      }
    }

    // Continue traversal
    if (!nodeType.includes('class') && !nodeType.includes('struct')) {
      for (const child of n.namedChildren) {
        traverse(child, parentClass);
      }
    }
  }

  traverse(node);
  return { functions, classes, imports, exports };
}

// ============================================================================
// Main Extraction Functions
// ============================================================================

/**
 * Get the appropriate symbol extractor for a language
 */
function getSymbolExtractor(language: ASTLanguage): (
  node: Node,
  source: string,
  lang: ASTLanguage,
  options: Required<SymbolExtractionOptions>
) => { functions: SymbolInfo[]; classes: SymbolInfo[]; imports: ImportInfo[]; exports: ExportInfo[] } {
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return extractJsTsSymbols;
    case 'python':
      return extractPythonSymbols;
    case 'go':
      return extractGoSymbols;
    case 'java':
      return extractJavaSymbols;
    case 'rust':
      return extractRustSymbols;
    case 'c':
    case 'cpp':
    case 'csharp':
      return extractCStyleSymbols;
    default:
      return extractCStyleSymbols;
  }
}

/**
 * Calculate complexity metrics from extracted symbols
 */
function calculateComplexityMetrics(
  functions: SymbolInfo[],
  rootNode: Node,
  language: ASTLanguage
): ComplexityMetrics {
  // Sum cyclomatic complexity from all functions
  const functionsWithComplexity = functions.filter(f => f.complexity !== undefined);
  const cyclomaticComplexity = functionsWithComplexity.reduce((sum, f) => sum + (f.complexity || 0), 0);

  // Get max nesting depth
  const maxNestingDepth = Math.max(
    0,
    ...functions.map(f => f.nestingDepth || 0)
  );

  // Average function complexity
  const avgFunctionComplexity = functionsWithComplexity.length > 0
    ? cyclomaticComplexity / functionsWithComplexity.length
    : 0;

  // Count decision points in entire file
  const decisionPoints = countDecisionPoints(rootNode, language);

  // Calculate overall score (0-100)
  // Formula: Start at 100, subtract points for complexity
  let overallScore = 100;

  // Penalize high cyclomatic complexity
  if (cyclomaticComplexity > 50) overallScore -= 20;
  else if (cyclomaticComplexity > 30) overallScore -= 15;
  else if (cyclomaticComplexity > 20) overallScore -= 10;
  else if (cyclomaticComplexity > 10) overallScore -= 5;

  // Penalize high average function complexity
  if (avgFunctionComplexity > 15) overallScore -= 15;
  else if (avgFunctionComplexity > 10) overallScore -= 10;
  else if (avgFunctionComplexity > 5) overallScore -= 5;

  // Penalize deep nesting
  if (maxNestingDepth > 6) overallScore -= 15;
  else if (maxNestingDepth > 4) overallScore -= 10;
  else if (maxNestingDepth > 3) overallScore -= 5;

  // Penalize too many functions (might indicate god file)
  if (functions.length > 50) overallScore -= 10;
  else if (functions.length > 30) overallScore -= 5;

  // Ensure score is in valid range
  overallScore = Math.max(0, Math.min(100, overallScore));

  return {
    cyclomaticComplexity,
    maxNestingDepth,
    avgFunctionComplexity: Math.round(avgFunctionComplexity * 100) / 100,
    decisionPoints,
    overallScore,
  };
}

/**
 * Extract file summary with symbols and complexity metrics
 *
 * @param sourceCode - Source code content
 * @param absolutePath - Absolute file path
 * @param relativePath - Relative file path from project root
 * @param options - Extraction options
 * @returns FileSummary or null if extraction fails
 */
export async function extractFileSummary(
  sourceCode: string,
  absolutePath: string,
  relativePath: string,
  options?: SymbolExtractionOptions
): Promise<FileSummary | null> {
  const logger = getLogger();
  const startTime = performance.now();
  const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };

  // Check file size limit
  const size = Buffer.byteLength(sourceCode, 'utf-8');
  if (size > opts.maxFileSize) {
    logger.warn('symbolExtractor', 'File too large for extraction', {
      path: relativePath,
      size,
      maxSize: opts.maxFileSize,
    });
    return null;
  }

  // Get parser instance
  const parser = getTreeSitterParser();

  // Check if language is supported
  if (!parser.isSupported(absolutePath)) {
    // Return a basic summary for unsupported languages
    const lines = sourceCode.split('\n');
    const blankLines = lines.filter(l => l.trim() === '').length;

    return {
      path: absolutePath,
      relativePath,
      language: absolutePath.split('.').pop() || 'unknown',
      lines: lines.length,
      codeLines: lines.length - blankLines,
      blankLines,
      commentLines: 0,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      complexity: {
        cyclomaticComplexity: 0,
        maxNestingDepth: 0,
        avgFunctionComplexity: 0,
        decisionPoints: 0,
        overallScore: 100,
      },
      size,
      extractionTimeMs: performance.now() - startTime,
    };
  }

  // Initialize parser if needed
  if (!parser.isInitialized) {
    try {
      await parser.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('symbolExtractor', 'Failed to initialize Tree-sitter parser', { error: message });
      return null;
    }
  }

  // Parse the source code
  const tree = await parser.parse(sourceCode, absolutePath);
  if (!tree) {
    logger.debug('symbolExtractor', 'Failed to parse source code', { path: relativePath });
    return null;
  }

  const language = parser.getLanguage(absolutePath)!;
  const extractor = getSymbolExtractor(language);

  // Extract symbols
  const { functions, classes, imports, exports } = extractor(tree.rootNode, sourceCode, language, opts);

  // Calculate line counts
  const lineCounts = countLines(sourceCode, tree);

  // Calculate complexity metrics
  const complexity = opts.includeComplexity
    ? calculateComplexityMetrics(functions, tree.rootNode, language)
    : {
        cyclomaticComplexity: 0,
        maxNestingDepth: 0,
        avgFunctionComplexity: 0,
        decisionPoints: 0,
        overallScore: 100,
      };

  // Clean up
  tree.delete();

  const extractionTimeMs = performance.now() - startTime;

  logger.debug('symbolExtractor', 'Extraction complete', {
    path: relativePath,
    language,
    functions: functions.length,
    classes: classes.length,
    imports: imports.length,
    exports: exports.length,
    complexity: complexity.overallScore,
    timeMs: Math.round(extractionTimeMs),
  });

  return {
    path: absolutePath,
    relativePath,
    language,
    lines: lineCounts.total,
    codeLines: lineCounts.code,
    blankLines: lineCounts.blank,
    commentLines: lineCounts.comment,
    functions,
    classes,
    imports,
    exports,
    complexity,
    size,
    extractionTimeMs,
  };
}

/**
 * Quick check if a file type supports symbol extraction
 *
 * @param filePath - File path to check
 * @returns true if symbol extraction is supported
 */
export function supportsSymbolExtraction(filePath: string): boolean {
  return getTreeSitterParser().isSupported(filePath);
}

/**
 * Get the list of supported languages for symbol extraction
 *
 * @returns Array of supported language names
 */
export function getSupportedLanguages(): ASTLanguage[] {
  return getTreeSitterParser().getSupportedLanguages();
}
