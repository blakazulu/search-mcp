/**
 * Code Comment Extraction Engine (SMCP-100)
 *
 * Extracts documentation comments from code files to make them searchable
 * via the docs search index (search_docs). Supports JSDoc, Python docstrings,
 * Rust doc comments, Go doc comments, and other language-specific formats.
 *
 * Features:
 * - Extract JSDoc/TSDoc from JS/TS files
 * - Extract docstrings from Python files
 * - Extract /// and //! comments from Rust files
 * - Extract Go package and function comments
 * - Link comments back to source code location
 * - Parse @tags (param, returns, example, etc.)
 *
 * @module commentExtractor
 */

import type { Node } from 'web-tree-sitter';
import { getTreeSitterParser, type ASTLanguage } from './treeSitterParser.js';
import { getLogger } from '../utils/logger.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Type of documentation comment
 */
export type CommentType =
  | 'jsdoc'     // /** ... */ in JS/TS
  | 'tsdoc'     // /** ... */ with @tags in TS
  | 'docstring' // """...""" or '''...''' in Python
  | 'rustdoc'   // /// or //! in Rust
  | 'javadoc'   // /** ... */ in Java
  | 'xmldoc'    // /// <summary> in C#
  | 'godoc'     // // Package/Function comments in Go
  | 'block'     // /* ... */ generic
  | 'inline';   // // or # generic

/**
 * Parsed tag from a documentation comment
 */
export interface CommentTag {
  /** Tag name (e.g., 'param', 'returns', 'example') */
  name: string;
  /** Tag value/content */
  value: string;
  /** For @param: the parameter name */
  paramName?: string;
  /** For @param: the parameter type */
  paramType?: string;
}

/**
 * Extracted documentation comment
 */
export interface ExtractedComment {
  /** Type of comment */
  type: CommentType;
  /** Cleaned content (without markers) */
  content: string;
  /** Original raw content (with markers) */
  rawContent: string;
  /** Associated symbol name (function, class, etc.) */
  symbol?: string;
  /** Symbol type (function, class, method, etc.) */
  symbolType?: string;
  /** Relative file path */
  filePath: string;
  /** Start line number (1-based) */
  startLine: number;
  /** End line number (1-based) */
  endLine: number;
  /** Parsed tags (@param, @returns, etc.) */
  tags?: CommentTag[];
  /** Language of the source file */
  language: ASTLanguage | string;
}

/**
 * Comment extractor interface
 */
export interface CommentExtractor {
  /** Extract comments from source code */
  extract(content: string, filePath: string): Promise<ExtractedComment[]>;
  /** Check if this extractor supports the given file */
  supports(filePath: string): boolean;
}

/**
 * Options for comment extraction
 */
export interface CommentExtractionOptions {
  /** Minimum comment length to extract (default: 20 characters) */
  minLength?: number;
  /** Maximum comment length to extract (default: 10000 characters) */
  maxLength?: number;
  /** Include inline comments (default: false - only doc comments) */
  includeInlineComments?: boolean;
  /** Include block comments without special markers (default: false) */
  includeBlockComments?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default extraction options
 */
export const DEFAULT_COMMENT_OPTIONS: Required<CommentExtractionOptions> = {
  minLength: 20,
  maxLength: 10000,
  includeInlineComments: false,
  includeBlockComments: false,
};

/**
 * Supported file extensions for comment extraction
 */
export const SUPPORTED_EXTENSIONS: Record<string, ASTLanguage> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
  // Go
  '.go': 'go',
  // Rust
  '.rs': 'rust',
  // Java
  '.java': 'java',
  // C#
  '.cs': 'csharp',
  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
};

// ============================================================================
// Tag Parsing
// ============================================================================

/**
 * Parse JSDoc/TSDoc style tags from comment content
 */
export function parseJSDocTags(content: string): CommentTag[] {
  const tags: CommentTag[] = [];
  // Match @tagname {type} name - description or @tagname description
  const tagRegex = /@(\w+)(?:\s+\{([^}]+)\})?\s*(?:(\[?[\w.]+\]?)\s*)?(?:-\s*)?(.*)$/gm;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) {
    const [, name, type, paramName, value] = match;
    const tag: CommentTag = {
      name,
      value: (value || '').trim(),
    };

    if (paramName) {
      tag.paramName = paramName.replace(/^\[|\]$/g, ''); // Remove optional brackets
    }
    if (type) {
      tag.paramType = type;
    }

    tags.push(tag);
  }

  return tags;
}

/**
 * Parse Python-style docstring tags (Args:, Returns:, etc.)
 * Supports Google-style docstrings with sections like Args:, Returns:, Raises:
 */
export function parsePythonDocTags(content: string): CommentTag[] {
  const tags: CommentTag[] = [];

  // Match Google-style sections (Args:, Returns:, Raises:, etc.)
  // Use lookahead to find section headers without consuming them in the split
  const sectionNames = 'Args|Arguments|Returns|Return|Raises|Yields|Examples?|Attributes?|Note|Notes|Todo|Warning|See Also';
  const sectionStartRegex = new RegExp(`^\\s*(${sectionNames}):\\s*$`, 'gmi');

  // Find all section positions
  const sections: { name: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionStartRegex.exec(content)) !== null) {
    sections.push({
      name: match[1].toLowerCase(),
      start: match.index + match[0].length,
      end: content.length,
    });
  }

  // Set end positions (each section ends where the next one starts)
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].end = content.lastIndexOf('\n', sections[i + 1].start - 1);
    if (sections[i].end < sections[i].start) {
      sections[i].end = sections[i + 1].start;
    }
  }

  // Process each section
  for (const section of sections) {
    const sectionContent = content.slice(section.start, section.end);

    if (section.name === 'args' || section.name === 'arguments') {
      // Parse individual parameters - name (type): description or name: description
      const paramRegex = /^\s*(\w+)(?:\s*\(([^)]+)\))?:\s*(.+)$/gm;
      let paramMatch: RegExpExecArray | null;
      while ((paramMatch = paramRegex.exec(sectionContent)) !== null) {
        tags.push({
          name: 'param',
          paramName: paramMatch[1],
          paramType: paramMatch[2],
          value: paramMatch[3].trim(),
        });
      }
    } else if (section.name === 'returns' || section.name === 'return') {
      tags.push({
        name: 'returns',
        value: sectionContent.trim(),
      });
    } else if (section.name === 'raises') {
      // Parse individual exceptions
      const exceptionRegex = /^\s*(\w+):\s*(.+)$/gm;
      let exMatch: RegExpExecArray | null;
      while ((exMatch = exceptionRegex.exec(sectionContent)) !== null) {
        tags.push({
          name: 'throws',
          paramType: exMatch[1],
          value: exMatch[2].trim(),
        });
      }
    } else if (section.name.startsWith('example')) {
      tags.push({
        name: 'example',
        value: sectionContent.trim(),
      });
    }
  }

  return tags;
}

// ============================================================================
// Comment Cleaning Functions
// ============================================================================

/**
 * Clean JSDoc-style comment content
 */
export function cleanJSDocContent(content: string): string {
  return content
    // Remove opening and closing markers
    .replace(/^\/\*\*\s*/, '')
    .replace(/\s*\*\/$/, '')
    // Remove leading asterisks from each line
    .replace(/^\s*\*\s?/gm, '')
    // Remove @tags for the main content (tags are parsed separately)
    .replace(/@\w+[^\n]*/g, '')
    .trim();
}

/**
 * Clean Python docstring content
 */
export function cleanPythonDocstring(content: string): string {
  return content
    // Remove opening and closing quotes
    .replace(/^["']{3}/, '')
    .replace(/["']{3}$/, '')
    .trim();
}

/**
 * Clean Rust doc comment content (/// or //!)
 */
export function cleanRustDocContent(lines: string[]): string {
  return lines
    .map(line => line.replace(/^\/\/[\/!]\s?/, ''))
    .join('\n')
    .trim();
}

/**
 * Clean Go doc comment content
 */
export function cleanGoDocContent(lines: string[]): string {
  return lines
    .map(line => line.replace(/^\/\/\s?/, ''))
    .join('\n')
    .trim();
}

// ============================================================================
// AST-Based Comment Extraction
// ============================================================================

/**
 * Extract JavaScript/TypeScript JSDoc comments using AST
 */
async function extractJSDocComments(
  source: string,
  filePath: string,
  language: ASTLanguage,
  tree: { rootNode: Node },
  options: Required<CommentExtractionOptions>
): Promise<ExtractedComment[]> {
  const comments: ExtractedComment[] = [];

  function findAssociatedSymbol(node: Node): { name: string; type: string } | undefined {
    // Look for the next sibling that's a declaration
    let sibling = node.nextNamedSibling;
    while (sibling) {
      const type = sibling.type;

      // Handle export statements (export function, export class, etc.)
      if (type === 'export_statement') {
        // Look inside the export statement
        for (const child of sibling.namedChildren) {
          const result = getSymbolFromNode(child);
          if (result) return result;
        }
      }

      const result = getSymbolFromNode(sibling);
      if (result) return result;

      // Only look at the immediate next sibling
      break;
    }

    return undefined;
  }

  function getSymbolFromNode(node: Node): { name: string; type: string } | undefined {
    const type = node.type;

    if (type === 'function_declaration' || type === 'generator_function_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'function' } : undefined;
    }

    if (type === 'class_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'class' } : undefined;
    }

    if (type === 'method_definition') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'method' } : undefined;
    }

    if (type === 'interface_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'interface' } : undefined;
    }

    if (type === 'type_alias_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'type' } : undefined;
    }

    if (type === 'variable_declaration' || type === 'lexical_declaration') {
      // Look for const/let declarations
      const declarators = node.namedChildren.filter(c => c.type === 'variable_declarator');
      if (declarators.length > 0) {
        const name = declarators[0].childForFieldName('name')?.text;
        return name ? { name, type: 'variable' } : undefined;
      }
    }

    return undefined;
  }

  function traverse(node: Node): void {
    // Look for comment nodes
    if (node.type === 'comment') {
      const text = node.text;

      // Only process JSDoc-style comments (/** ... */)
      if (text.startsWith('/**') && text.endsWith('*/')) {
        const content = cleanJSDocContent(text);

        // Skip if too short
        if (content.length < options.minLength) {
          for (const child of node.children) traverse(child);
          return;
        }

        // Skip if too long
        if (content.length > options.maxLength) {
          for (const child of node.children) traverse(child);
          return;
        }

        const tags = parseJSDocTags(text);
        const symbol = findAssociatedSymbol(node);

        comments.push({
          type: 'jsdoc',
          content,
          rawContent: text,
          symbol: symbol?.name,
          symbolType: symbol?.type,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          tags: tags.length > 0 ? tags : undefined,
          language,
        });
      } else if (options.includeBlockComments && text.startsWith('/*')) {
        // Regular block comment
        const content = text
          .replace(/^\/\*\s*/, '')
          .replace(/\s*\*\/$/, '')
          .replace(/^\s*\*\s?/gm, '')
          .trim();

        if (content.length >= options.minLength && content.length <= options.maxLength) {
          comments.push({
            type: 'block',
            content,
            rawContent: text,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            language,
          });
        }
      }
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree.rootNode);
  return comments;
}

/**
 * Extract Python docstrings using AST
 */
async function extractPythonDocstrings(
  source: string,
  filePath: string,
  language: ASTLanguage,
  tree: { rootNode: Node },
  options: Required<CommentExtractionOptions>
): Promise<ExtractedComment[]> {
  const comments: ExtractedComment[] = [];

  function extractDocstringFromBody(body: Node | null, symbolName: string, symbolType: string): void {
    if (!body) return;

    const firstStatement = body.firstNamedChild;
    if (!firstStatement || firstStatement.type !== 'expression_statement') return;

    const stringNode = firstStatement.firstNamedChild;
    if (!stringNode || stringNode.type !== 'string') return;

    const rawContent = stringNode.text;
    const content = cleanPythonDocstring(rawContent);

    if (content.length < options.minLength || content.length > options.maxLength) return;

    const tags = parsePythonDocTags(content);

    comments.push({
      type: 'docstring',
      content,
      rawContent,
      symbol: symbolName,
      symbolType,
      filePath,
      startLine: stringNode.startPosition.row + 1,
      endLine: stringNode.endPosition.row + 1,
      tags: tags.length > 0 ? tags : undefined,
      language,
    });
  }

  function traverse(node: Node, parentClass?: string): void {
    const type = node.type;

    // Handle decorated definitions
    let actualNode = node;
    if (type === 'decorated_definition') {
      for (const child of node.namedChildren) {
        if (child.type === 'function_definition' || child.type === 'class_definition') {
          actualNode = child;
          break;
        }
      }
    }

    // Function definitions
    if (actualNode.type === 'function_definition') {
      const name = actualNode.childForFieldName('name')?.text;
      if (name) {
        const body = actualNode.childForFieldName('body');
        extractDocstringFromBody(body, name, parentClass ? 'method' : 'function');
      }
    }

    // Class definitions
    if (actualNode.type === 'class_definition') {
      const name = actualNode.childForFieldName('name')?.text;
      if (name) {
        const body = actualNode.childForFieldName('body');
        extractDocstringFromBody(body, name, 'class');

        // Traverse class body for methods
        if (body) {
          for (const child of body.namedChildren) {
            traverse(child, name);
          }
        }
        return; // Already handled children
      }
    }

    // Module docstring (first string in file)
    if (type === 'module') {
      const firstStatement = node.firstNamedChild;
      if (firstStatement?.type === 'expression_statement') {
        const stringNode = firstStatement.firstNamedChild;
        if (stringNode?.type === 'string') {
          const rawContent = stringNode.text;
          const content = cleanPythonDocstring(rawContent);

          if (content.length >= options.minLength && content.length <= options.maxLength) {
            comments.push({
              type: 'docstring',
              content,
              rawContent,
              symbol: 'module',
              symbolType: 'module',
              filePath,
              startLine: stringNode.startPosition.row + 1,
              endLine: stringNode.endPosition.row + 1,
              language,
            });
          }
        }
      }
    }

    // Continue traversal (skip class bodies we already handled)
    if (actualNode.type !== 'class_definition') {
      for (const child of node.namedChildren) {
        traverse(child, parentClass);
      }
    }
  }

  traverse(tree.rootNode);
  return comments;
}

/**
 * Extract Rust doc comments using AST
 */
async function extractRustDocComments(
  source: string,
  filePath: string,
  language: ASTLanguage,
  tree: { rootNode: Node },
  options: Required<CommentExtractionOptions>
): Promise<ExtractedComment[]> {
  const comments: ExtractedComment[] = [];
  const lines = source.split('\n');

  function collectDocComments(node: Node): { text: string[]; startLine: number; endLine: number } | null {
    const docLines: string[] = [];
    let prevSibling = node.previousNamedSibling;
    let startLine = node.startPosition.row;
    let endLine = startLine;

    while (prevSibling && prevSibling.type === 'line_comment') {
      const text = prevSibling.text;
      if (text.startsWith('///') || text.startsWith('//!')) {
        docLines.unshift(text);
        startLine = prevSibling.startPosition.row;
        prevSibling = prevSibling.previousNamedSibling;
      } else {
        break;
      }
    }

    if (docLines.length === 0) return null;

    return {
      text: docLines,
      startLine: startLine + 1,
      endLine: endLine + 1,
    };
  }

  function getSymbolInfo(node: Node): { name: string; type: string } | undefined {
    const type = node.type;

    if (type === 'function_item') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'function' } : undefined;
    }

    if (type === 'struct_item') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'struct' } : undefined;
    }

    if (type === 'enum_item') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'enum' } : undefined;
    }

    if (type === 'trait_item') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'trait' } : undefined;
    }

    if (type === 'impl_item') {
      const typeName = node.namedChildren.find(c => c.type === 'type_identifier' || c.type === 'generic_type')?.text;
      return typeName ? { name: typeName, type: 'impl' } : undefined;
    }

    if (type === 'mod_item') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'module' } : undefined;
    }

    return undefined;
  }

  function traverse(node: Node): void {
    const symbol = getSymbolInfo(node);

    if (symbol) {
      const docComment = collectDocComments(node);

      if (docComment) {
        const content = cleanRustDocContent(docComment.text);

        if (content.length >= options.minLength && content.length <= options.maxLength) {
          const tags = parseJSDocTags(content); // Rust uses similar @param style

          comments.push({
            type: 'rustdoc',
            content,
            rawContent: docComment.text.join('\n'),
            symbol: symbol.name,
            symbolType: symbol.type,
            filePath,
            startLine: docComment.startLine,
            endLine: docComment.endLine,
            tags: tags.length > 0 ? tags : undefined,
            language,
          });
        }
      }
    }

    // Handle inner doc comments (//!)
    if (node.type === 'source_file') {
      const innerDocs: string[] = [];
      let startLine = 1;

      for (const child of node.children) {
        if (child.type === 'line_comment' && child.text.startsWith('//!')) {
          innerDocs.push(child.text);
          if (innerDocs.length === 1) {
            startLine = child.startPosition.row + 1;
          }
        } else if (innerDocs.length > 0) {
          break; // Stop at first non-inner-doc line
        }
      }

      if (innerDocs.length > 0) {
        const content = cleanRustDocContent(innerDocs);

        if (content.length >= options.minLength && content.length <= options.maxLength) {
          comments.push({
            type: 'rustdoc',
            content,
            rawContent: innerDocs.join('\n'),
            symbol: 'crate',
            symbolType: 'module',
            filePath,
            startLine,
            endLine: startLine + innerDocs.length - 1,
            language,
          });
        }
      }
    }

    for (const child of node.namedChildren) {
      traverse(child);
    }
  }

  traverse(tree.rootNode);
  return comments;
}

/**
 * Extract Go doc comments using AST
 */
async function extractGoDocComments(
  source: string,
  filePath: string,
  language: ASTLanguage,
  tree: { rootNode: Node },
  options: Required<CommentExtractionOptions>
): Promise<ExtractedComment[]> {
  const comments: ExtractedComment[] = [];

  function collectDocComments(node: Node): { text: string[]; startLine: number; endLine: number } | null {
    const docLines: string[] = [];
    let prevSibling = node.previousNamedSibling;
    let startLine = node.startPosition.row;

    while (prevSibling && prevSibling.type === 'comment') {
      const text = prevSibling.text;
      if (text.startsWith('//')) {
        docLines.unshift(text);
        startLine = prevSibling.startPosition.row;
        prevSibling = prevSibling.previousNamedSibling;
      } else {
        break;
      }
    }

    if (docLines.length === 0) return null;

    return {
      text: docLines,
      startLine: startLine + 1,
      endLine: node.startPosition.row + 1,
    };
  }

  function getSymbolInfo(node: Node): { name: string; type: string } | undefined {
    const type = node.type;

    if (type === 'function_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'function' } : undefined;
    }

    if (type === 'method_declaration') {
      const name = node.childForFieldName('name')?.text;
      const receiver = node.childForFieldName('receiver');
      const receiverType = receiver?.namedChildren.find(c => c.type === 'type_identifier')?.text;
      return name ? { name: receiverType ? `${receiverType}.${name}` : name, type: 'method' } : undefined;
    }

    if (type === 'type_declaration') {
      const typeSpec = node.namedChildren.find(c => c.type === 'type_spec');
      const name = typeSpec?.childForFieldName('name')?.text;
      const typeNode = typeSpec?.childForFieldName('type');
      let symbolType = 'type';
      if (typeNode?.type === 'struct_type') symbolType = 'struct';
      else if (typeNode?.type === 'interface_type') symbolType = 'interface';
      return name ? { name, type: symbolType } : undefined;
    }

    return undefined;
  }

  function traverse(node: Node): void {
    const symbol = getSymbolInfo(node);

    if (symbol) {
      const docComment = collectDocComments(node);

      if (docComment) {
        const content = cleanGoDocContent(docComment.text);

        if (content.length >= options.minLength && content.length <= options.maxLength) {
          comments.push({
            type: 'godoc',
            content,
            rawContent: docComment.text.join('\n'),
            symbol: symbol.name,
            symbolType: symbol.type,
            filePath,
            startLine: docComment.startLine,
            endLine: docComment.endLine,
            language,
          });
        }
      }
    }

    // Package comment
    if (node.type === 'package_clause') {
      const docComment = collectDocComments(node);
      if (docComment) {
        const content = cleanGoDocContent(docComment.text);

        if (content.length >= options.minLength && content.length <= options.maxLength) {
          const packageName = node.childForFieldName('name')?.text;
          comments.push({
            type: 'godoc',
            content,
            rawContent: docComment.text.join('\n'),
            symbol: packageName || 'package',
            symbolType: 'package',
            filePath,
            startLine: docComment.startLine,
            endLine: docComment.endLine,
            language,
          });
        }
      }
    }

    for (const child of node.namedChildren) {
      traverse(child);
    }
  }

  traverse(tree.rootNode);
  return comments;
}

/**
 * Extract Java/Javadoc comments using AST
 */
async function extractJavadocComments(
  source: string,
  filePath: string,
  language: ASTLanguage,
  tree: { rootNode: Node },
  options: Required<CommentExtractionOptions>
): Promise<ExtractedComment[]> {
  const comments: ExtractedComment[] = [];

  function findAssociatedSymbol(node: Node): { name: string; type: string } | undefined {
    let sibling = node.nextNamedSibling;
    while (sibling) {
      const type = sibling.type;

      if (type === 'class_declaration') {
        const name = sibling.childForFieldName('name')?.text;
        return name ? { name, type: 'class' } : undefined;
      }

      if (type === 'interface_declaration') {
        const name = sibling.childForFieldName('name')?.text;
        return name ? { name, type: 'interface' } : undefined;
      }

      if (type === 'method_declaration') {
        const name = sibling.childForFieldName('name')?.text;
        return name ? { name, type: 'method' } : undefined;
      }

      if (type === 'constructor_declaration') {
        const name = sibling.childForFieldName('name')?.text;
        return name ? { name, type: 'constructor' } : undefined;
      }

      if (type === 'field_declaration') {
        const declarator = sibling.namedChildren.find(c => c.type === 'variable_declarator');
        const name = declarator?.childForFieldName('name')?.text;
        return name ? { name, type: 'field' } : undefined;
      }

      break;
    }
    return undefined;
  }

  function traverse(node: Node): void {
    if (node.type === 'block_comment') {
      const text = node.text;

      if (text.startsWith('/**')) {
        const content = cleanJSDocContent(text);

        if (content.length >= options.minLength && content.length <= options.maxLength) {
          const tags = parseJSDocTags(text);
          const symbol = findAssociatedSymbol(node);

          comments.push({
            type: 'javadoc',
            content,
            rawContent: text,
            symbol: symbol?.name,
            symbolType: symbol?.type,
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            tags: tags.length > 0 ? tags : undefined,
            language,
          });
        }
      }
    }

    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree.rootNode);
  return comments;
}

/**
 * Extract C# XML documentation comments
 */
async function extractXmlDocComments(
  source: string,
  filePath: string,
  language: ASTLanguage,
  tree: { rootNode: Node },
  options: Required<CommentExtractionOptions>
): Promise<ExtractedComment[]> {
  const comments: ExtractedComment[] = [];

  function collectXmlDocComments(node: Node): { text: string[]; startLine: number } | null {
    const docLines: string[] = [];
    let prevSibling = node.previousNamedSibling;
    let startLine = node.startPosition.row;

    while (prevSibling && prevSibling.type === 'comment') {
      const text = prevSibling.text;
      if (text.startsWith('///')) {
        docLines.unshift(text);
        startLine = prevSibling.startPosition.row;
        prevSibling = prevSibling.previousNamedSibling;
      } else {
        break;
      }
    }

    if (docLines.length === 0) return null;

    return { text: docLines, startLine: startLine + 1 };
  }

  function parseXmlDocContent(lines: string[]): { content: string; tags: CommentTag[] } {
    const tags: CommentTag[] = [];
    let content = '';

    const xmlContent = lines
      .map(l => l.replace(/^\/\/\/\s?/, ''))
      .join('\n');

    // Extract <summary> content
    const summaryMatch = xmlContent.match(/<summary>([\s\S]*?)<\/summary>/);
    if (summaryMatch) {
      content = summaryMatch[1].trim();
    }

    // Extract <param> tags
    const paramRegex = /<param\s+name="(\w+)">([\s\S]*?)<\/param>/g;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(xmlContent)) !== null) {
      tags.push({
        name: 'param',
        paramName: paramMatch[1],
        value: paramMatch[2].trim(),
      });
    }

    // Extract <returns> tag
    const returnsMatch = xmlContent.match(/<returns>([\s\S]*?)<\/returns>/);
    if (returnsMatch) {
      tags.push({
        name: 'returns',
        value: returnsMatch[1].trim(),
      });
    }

    // Extract <exception> tags
    const exceptionRegex = /<exception\s+cref="([^"]+)">([\s\S]*?)<\/exception>/g;
    let exMatch: RegExpExecArray | null;
    while ((exMatch = exceptionRegex.exec(xmlContent)) !== null) {
      tags.push({
        name: 'throws',
        paramType: exMatch[1],
        value: exMatch[2].trim(),
      });
    }

    return { content: content || xmlContent.replace(/<[^>]+>/g, '').trim(), tags };
  }

  function getSymbolInfo(node: Node): { name: string; type: string } | undefined {
    const type = node.type;

    if (type === 'method_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'method' } : undefined;
    }

    if (type === 'class_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'class' } : undefined;
    }

    if (type === 'interface_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'interface' } : undefined;
    }

    if (type === 'property_declaration') {
      const name = node.childForFieldName('name')?.text;
      return name ? { name, type: 'property' } : undefined;
    }

    return undefined;
  }

  function traverse(node: Node): void {
    const symbol = getSymbolInfo(node);

    if (symbol) {
      const xmlDoc = collectXmlDocComments(node);

      if (xmlDoc) {
        const { content, tags } = parseXmlDocContent(xmlDoc.text);

        if (content.length >= options.minLength && content.length <= options.maxLength) {
          comments.push({
            type: 'xmldoc',
            content,
            rawContent: xmlDoc.text.join('\n'),
            symbol: symbol.name,
            symbolType: symbol.type,
            filePath,
            startLine: xmlDoc.startLine,
            endLine: xmlDoc.startLine + xmlDoc.text.length - 1,
            tags: tags.length > 0 ? tags : undefined,
            language,
          });
        }
      }
    }

    for (const child of node.namedChildren) {
      traverse(child);
    }
  }

  traverse(tree.rootNode);
  return comments;
}

// ============================================================================
// Main Extraction Functions
// ============================================================================

/**
 * Get the appropriate extractor function for a language
 */
function getExtractorForLanguage(
  language: ASTLanguage
): (
  source: string,
  filePath: string,
  language: ASTLanguage,
  tree: { rootNode: Node },
  options: Required<CommentExtractionOptions>
) => Promise<ExtractedComment[]> {
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return extractJSDocComments;
    case 'python':
      return extractPythonDocstrings;
    case 'rust':
      return extractRustDocComments;
    case 'go':
      return extractGoDocComments;
    case 'java':
      return extractJavadocComments;
    case 'csharp':
      return extractXmlDocComments;
    case 'c':
    case 'cpp':
      // C/C++ use similar JSDoc-style for Doxygen
      return extractJSDocComments;
    default:
      return extractJSDocComments;
  }
}

/**
 * Extract documentation comments from a source file
 *
 * @param sourceCode - Source code content
 * @param filePath - Relative file path
 * @param options - Extraction options
 * @returns Array of extracted comments
 */
export async function extractComments(
  sourceCode: string,
  filePath: string,
  options?: CommentExtractionOptions
): Promise<ExtractedComment[]> {
  const logger = getLogger();
  const opts = { ...DEFAULT_COMMENT_OPTIONS, ...options };

  // Determine language from file extension
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  const language = SUPPORTED_EXTENSIONS[ext.toLowerCase()];

  if (!language) {
    logger.debug('commentExtractor', 'Unsupported file type', { filePath, ext });
    return [];
  }

  // Get parser instance
  const parser = getTreeSitterParser();

  // Check if language is supported
  if (!parser.isSupported(filePath)) {
    logger.debug('commentExtractor', 'Language not supported by parser', { filePath, language });
    return [];
  }

  // Initialize parser if needed
  if (!parser.isInitialized) {
    try {
      await parser.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('commentExtractor', 'Failed to initialize Tree-sitter parser', { error: message });
      return [];
    }
  }

  // Parse the source code
  const tree = await parser.parse(sourceCode, filePath);
  if (!tree) {
    logger.debug('commentExtractor', 'Failed to parse source code', { filePath });
    return [];
  }

  try {
    // Get the appropriate extractor
    const extractor = getExtractorForLanguage(language);

    // Extract comments
    const comments = await extractor(sourceCode, filePath, language, tree, opts);

    logger.debug('commentExtractor', 'Extracted comments', {
      filePath,
      language,
      count: comments.length,
    });

    return comments;
  } finally {
    // Clean up
    tree.delete();
  }
}

/**
 * Check if a file type is supported for comment extraction
 *
 * @param filePath - File path to check
 * @returns true if the file type is supported
 */
export function supportsCommentExtraction(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  return ext.toLowerCase() in SUPPORTED_EXTENSIONS;
}

/**
 * Format an extracted comment for indexing in the docs search
 *
 * @param comment - Extracted comment
 * @returns Formatted text suitable for embedding and search
 */
export function formatCommentForIndex(comment: ExtractedComment): string {
  let text = '';

  // Add symbol context
  if (comment.symbol) {
    const symbolType = comment.symbolType || 'symbol';
    text += `${symbolType}: ${comment.symbol}\n\n`;
  }

  // Add main content
  text += comment.content;

  // Add tags in a structured format
  if (comment.tags && comment.tags.length > 0) {
    text += '\n\n';
    for (const tag of comment.tags) {
      if (tag.name === 'param' && tag.paramName) {
        text += `@${tag.name} ${tag.paramName}`;
        if (tag.paramType) text += ` (${tag.paramType})`;
        text += `: ${tag.value}\n`;
      } else if (tag.name === 'throws' && tag.paramType) {
        text += `@${tag.name} ${tag.paramType}: ${tag.value}\n`;
      } else {
        text += `@${tag.name}: ${tag.value}\n`;
      }
    }
  }

  return text.trim();
}

/**
 * Get the list of supported file extensions for comment extraction
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(SUPPORTED_EXTENSIONS);
}
