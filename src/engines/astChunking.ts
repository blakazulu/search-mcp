/**
 * AST-Based Chunking Engine
 *
 * Implements semantic code chunking using Tree-sitter AST parsing.
 * Extracts functions, classes, methods, and other semantic units with
 * rich metadata including signatures, docstrings, and decorators.
 *
 * Inspired by claude-context-local's AST-based chunking approach.
 *
 * Features:
 * - Language-specific node type detection
 * - Rich metadata extraction (name, signature, docstring, decorators)
 * - Parent-child relationship tracking
 * - Semantic tag generation
 * - Fallback to character-based chunking for unsupported languages
 *
 * @module astChunking
 */

import type { Tree, Node } from 'web-tree-sitter';
import { getTreeSitterParser, type ASTLanguage } from './treeSitterParser.js';
import { getLogger } from '../utils/logger.js';
import type { ChunkWithLines } from './chunking.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Chunk type classification
 */
export type ChunkType =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'struct'
  | 'trait'
  | 'impl'
  | 'module'
  | 'variable'
  | 'import'
  | 'other';

/**
 * Rich metadata extracted from AST nodes
 */
export interface ChunkMetadata {
  /** Chunk type classification */
  type: ChunkType;
  /** Name of the function/class/method */
  name?: string;
  /** Full function/method signature */
  signature?: string;
  /** Docstring or comment content */
  docstring?: string;
  /** List of decorators/annotations */
  decorators?: string[];
  /** Parent name (e.g., class name for methods) */
  parentName?: string;
  /** Parent type (e.g., 'class' for methods) */
  parentType?: ChunkType;
  /** Semantic tags for search boosting */
  tags?: string[];
  /** Programming language */
  language: ASTLanguage;
  /** Whether the function/method is async */
  isAsync?: boolean;
  /** Whether the item is exported */
  isExport?: boolean;
  /** Whether the item is static */
  isStatic?: boolean;
  /** Access modifier (public/private/protected) */
  visibility?: 'public' | 'private' | 'protected';
  /** Number of parameters (for functions/methods) */
  paramCount?: number;
  /** Return type (if available) */
  returnType?: string;
  /** Generic type parameters */
  genericParams?: string[];
}

/**
 * A chunk of code with metadata
 */
export interface ASTChunk extends ChunkWithLines {
  /** Rich metadata extracted from AST */
  metadata: ChunkMetadata;
}

/**
 * Configuration for AST-based chunking
 */
export interface ASTChunkOptions {
  /** Target chunk size in characters (default: 4000) */
  chunkSize: number;
  /** Overlap size for very large chunks (default: 200) */
  chunkOverlap: number;
  /** Maximum chunk size before forcing a split (default: 8000) */
  maxChunkSize: number;
  /** Include imports as separate chunks (default: false) */
  includeImports: boolean;
}

/**
 * Node types that should be extracted as chunks per language
 */
interface LanguageNodeTypes {
  /** Function/method node types */
  functions: string[];
  /** Class/struct/interface node types */
  classes: string[];
  /** Import statement node types */
  imports: string[];
  /** Variable declaration node types (top-level) */
  variables: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default AST chunking options
 */
export const DEFAULT_AST_OPTIONS: ASTChunkOptions = {
  chunkSize: 4000,
  chunkOverlap: 200,
  maxChunkSize: 8000,
  includeImports: false,
};

/**
 * Language-specific node types for chunking
 */
const LANGUAGE_NODE_TYPES: Record<ASTLanguage, LanguageNodeTypes> = {
  javascript: {
    functions: ['function_declaration', 'function_expression', 'arrow_function', 'method_definition', 'generator_function', 'generator_function_declaration'],
    classes: ['class_declaration', 'class'],
    imports: ['import_statement', 'import_declaration'],
    variables: ['variable_declaration', 'lexical_declaration'],
  },
  typescript: {
    functions: ['function_declaration', 'function_expression', 'arrow_function', 'method_definition', 'generator_function', 'generator_function_declaration'],
    classes: ['class_declaration', 'class', 'interface_declaration', 'type_alias_declaration', 'enum_declaration'],
    imports: ['import_statement', 'import_declaration'],
    variables: ['variable_declaration', 'lexical_declaration'],
  },
  tsx: {
    functions: ['function_declaration', 'function_expression', 'arrow_function', 'method_definition', 'generator_function', 'generator_function_declaration'],
    classes: ['class_declaration', 'class', 'interface_declaration', 'type_alias_declaration', 'enum_declaration'],
    imports: ['import_statement', 'import_declaration'],
    variables: ['variable_declaration', 'lexical_declaration'],
  },
  python: {
    functions: ['function_definition', 'decorated_definition'],
    classes: ['class_definition'],
    imports: ['import_statement', 'import_from_statement'],
    variables: ['assignment'],
  },
  go: {
    functions: ['function_declaration', 'method_declaration'],
    classes: ['type_declaration', 'type_spec'],
    imports: ['import_declaration', 'import_spec'],
    variables: ['var_declaration', 'const_declaration', 'short_var_declaration'],
  },
  java: {
    functions: ['method_declaration', 'constructor_declaration'],
    classes: ['class_declaration', 'interface_declaration', 'enum_declaration', 'annotation_type_declaration'],
    imports: ['import_declaration'],
    variables: ['field_declaration'],
  },
  rust: {
    functions: ['function_item'],
    classes: ['struct_item', 'enum_item', 'trait_item', 'impl_item', 'mod_item'],
    imports: ['use_declaration'],
    variables: ['const_item', 'static_item', 'let_declaration'],
  },
  c: {
    functions: ['function_definition'],
    classes: ['struct_specifier', 'enum_specifier', 'union_specifier', 'type_definition'],
    imports: ['preproc_include'],
    variables: ['declaration'],
  },
  cpp: {
    functions: ['function_definition', 'template_declaration'],
    classes: ['class_specifier', 'struct_specifier', 'enum_specifier', 'namespace_definition'],
    imports: ['preproc_include', 'using_declaration'],
    variables: ['declaration'],
  },
  csharp: {
    functions: ['method_declaration', 'constructor_declaration'],
    classes: ['class_declaration', 'interface_declaration', 'struct_declaration', 'enum_declaration'],
    imports: ['using_directive'],
    variables: ['field_declaration', 'property_declaration'],
  },
};

// ============================================================================
// Metadata Extractors
// ============================================================================

/**
 * Extract metadata from a JavaScript/TypeScript node
 */
function extractJsTsMetadata(
  node: Node,
  source: string,
  language: ASTLanguage
): Partial<ChunkMetadata> {
  const metadata: Partial<ChunkMetadata> = { language };
  const nodeType = node.type;

  // Determine chunk type
  if (nodeType.includes('function') || nodeType === 'method_definition' || nodeType === 'arrow_function') {
    metadata.type = nodeType === 'method_definition' ? 'method' : 'function';
  } else if (nodeType.includes('class')) {
    metadata.type = 'class';
  } else if (nodeType === 'interface_declaration') {
    metadata.type = 'interface';
  } else if (nodeType === 'type_alias_declaration') {
    metadata.type = 'type';
  } else if (nodeType === 'enum_declaration') {
    metadata.type = 'enum';
  } else if (nodeType.includes('variable') || nodeType === 'lexical_declaration') {
    metadata.type = 'variable';
  } else if (nodeType.includes('import')) {
    metadata.type = 'import';
  } else {
    metadata.type = 'other';
  }

  // Extract name
  const nameNode = node.childForFieldName('name') ?? findChildByType(node, ['identifier', 'type_identifier', 'property_identifier']);
  if (nameNode) {
    metadata.name = nameNode.text;
  }

  // Check for async
  const firstChild = node.firstChild;
  if (firstChild && firstChild.text === 'async') {
    metadata.isAsync = true;
    metadata.tags = [...(metadata.tags ?? []), 'async'];
  }

  // Check for export
  const parent = node.parent;
  if (parent?.type === 'export_statement') {
    metadata.isExport = true;
    metadata.tags = [...(metadata.tags ?? []), 'export'];
  }

  // Extract parameters count for functions
  const params = node.childForFieldName('parameters');
  if (params) {
    metadata.paramCount = params.namedChildCount;
  }

  // Extract return type for TypeScript
  const returnType = node.childForFieldName('return_type');
  if (returnType) {
    metadata.returnType = returnType.text.replace(/^:\s*/, '');
  }

  // Extract generic type parameters
  const typeParams = findChildByType(node, ['type_parameters']);
  if (typeParams) {
    metadata.genericParams = typeParams.namedChildren
      .filter((c) => c.type === 'type_parameter')
      .map((c) => c.text);
  }

  // Build signature for functions
  if (metadata.type === 'function' || metadata.type === 'method') {
    metadata.signature = buildSignature(node, source, metadata);
  }

  // Extract JSDoc comment
  const prevSibling = node.previousNamedSibling;
  if (prevSibling?.type === 'comment') {
    const commentText = prevSibling.text;
    if (commentText.startsWith('/**')) {
      metadata.docstring = cleanDocstring(commentText);
    }
  }

  return metadata;
}

/**
 * Extract metadata from a Python node
 */
function extractPythonMetadata(
  node: Node,
  source: string,
  language: ASTLanguage
): Partial<ChunkMetadata> {
  const metadata: Partial<ChunkMetadata> = { language };
  const nodeType = node.type;

  // Handle decorated definitions
  let actualNode = node;
  if (nodeType === 'decorated_definition') {
    const decorators: string[] = [];
    for (const child of node.namedChildren) {
      if (child.type === 'decorator') {
        decorators.push(child.text);
      } else if (child.type === 'function_definition' || child.type === 'class_definition') {
        actualNode = child;
        break;
      }
    }
    if (decorators.length > 0) {
      metadata.decorators = decorators;
      // Add semantic tags based on decorators
      if (decorators.some((d) => d.includes('@staticmethod'))) {
        metadata.isStatic = true;
        metadata.tags = [...(metadata.tags ?? []), 'static'];
      }
      if (decorators.some((d) => d.includes('@classmethod'))) {
        metadata.tags = [...(metadata.tags ?? []), 'classmethod'];
      }
      if (decorators.some((d) => d.includes('@property'))) {
        metadata.tags = [...(metadata.tags ?? []), 'property'];
      }
    }
  }

  // Determine chunk type
  if (actualNode.type === 'function_definition') {
    metadata.type = 'function';
  } else if (actualNode.type === 'class_definition') {
    metadata.type = 'class';
  } else if (nodeType.includes('import')) {
    metadata.type = 'import';
  } else {
    metadata.type = 'other';
  }

  // Extract name
  const nameNode = actualNode.childForFieldName('name');
  if (nameNode) {
    metadata.name = nameNode.text;
  }

  // Check for async
  const firstChild = actualNode.firstChild;
  if (firstChild && firstChild.text === 'async') {
    metadata.isAsync = true;
    metadata.tags = [...(metadata.tags ?? []), 'async'];
  }

  // Extract parameters
  const params = actualNode.childForFieldName('parameters');
  if (params) {
    metadata.paramCount = params.namedChildren.filter(
      (c) => c.type !== 'comment' && c.text !== 'self' && c.text !== 'cls'
    ).length;
  }

  // Extract return type
  const returnType = actualNode.childForFieldName('return_type');
  if (returnType) {
    metadata.returnType = returnType.text.replace(/^->\s*/, '');
  }

  // Build signature
  if (metadata.type === 'function' || metadata.type === 'class') {
    metadata.signature = buildSignature(actualNode, source, metadata);
  }

  // Extract docstring
  const body = actualNode.childForFieldName('body');
  if (body) {
    const firstStatement = body.firstNamedChild;
    if (firstStatement?.type === 'expression_statement') {
      const string = firstStatement.firstNamedChild;
      if (string?.type === 'string') {
        metadata.docstring = cleanPythonDocstring(string.text);
      }
    }
  }

  return metadata;
}

/**
 * Extract metadata from a Go node
 */
function extractGoMetadata(
  node: Node,
  source: string,
  language: ASTLanguage
): Partial<ChunkMetadata> {
  const metadata: Partial<ChunkMetadata> = { language };
  const nodeType = node.type;

  // Determine chunk type
  if (nodeType === 'function_declaration') {
    metadata.type = 'function';
  } else if (nodeType === 'method_declaration') {
    metadata.type = 'method';
  } else if (nodeType === 'type_declaration' || nodeType === 'type_spec') {
    // Check if it's a struct or interface
    const typeSpec = nodeType === 'type_declaration' ? findChildByType(node, ['type_spec']) : node;
    if (typeSpec) {
      const typeBody = typeSpec.childForFieldName('type');
      if (typeBody?.type === 'struct_type') {
        metadata.type = 'struct';
      } else if (typeBody?.type === 'interface_type') {
        metadata.type = 'interface';
      } else {
        metadata.type = 'type';
      }
    }
  } else if (nodeType.includes('import')) {
    metadata.type = 'import';
  } else {
    metadata.type = 'other';
  }

  // Extract name
  const nameNode = node.childForFieldName('name') ?? findChildByType(node, ['identifier', 'type_identifier']);
  if (nameNode) {
    metadata.name = nameNode.text;
  }

  // Extract receiver for methods
  if (nodeType === 'method_declaration') {
    const receiver = node.childForFieldName('receiver');
    if (receiver) {
      const receiverType = findChildByType(receiver, ['type_identifier', 'pointer_type']);
      if (receiverType) {
        metadata.parentName = receiverType.text.replace(/^\*/, '');
        metadata.parentType = 'struct';
      }
    }
  }

  // Extract parameters
  const params = node.childForFieldName('parameters');
  if (params) {
    metadata.paramCount = params.namedChildCount;
  }

  // Build signature
  if (metadata.type === 'function' || metadata.type === 'method') {
    metadata.signature = buildSignature(node, source, metadata);
  }

  // Extract comment
  const prevSibling = node.previousNamedSibling;
  if (prevSibling?.type === 'comment') {
    metadata.docstring = cleanDocstring(prevSibling.text);
  }

  return metadata;
}

/**
 * Extract metadata from a Java node
 */
function extractJavaMetadata(
  node: Node,
  source: string,
  language: ASTLanguage
): Partial<ChunkMetadata> {
  const metadata: Partial<ChunkMetadata> = { language };
  const nodeType = node.type;

  // Determine chunk type
  if (nodeType === 'method_declaration') {
    metadata.type = 'method';
  } else if (nodeType === 'constructor_declaration') {
    metadata.type = 'method';
    metadata.tags = [...(metadata.tags ?? []), 'constructor'];
  } else if (nodeType === 'class_declaration') {
    metadata.type = 'class';
  } else if (nodeType === 'interface_declaration') {
    metadata.type = 'interface';
  } else if (nodeType === 'enum_declaration') {
    metadata.type = 'enum';
  } else if (nodeType.includes('import')) {
    metadata.type = 'import';
  } else {
    metadata.type = 'other';
  }

  // Extract name
  const nameNode = node.childForFieldName('name') ?? findChildByType(node, ['identifier']);
  if (nameNode) {
    metadata.name = nameNode.text;
  }

  // Extract modifiers
  const modifiers = findChildByType(node, ['modifiers']);
  if (modifiers) {
    for (const mod of modifiers.children) {
      const text = mod.text;
      if (text === 'public') {
        metadata.visibility = 'public';
      } else if (text === 'private') {
        metadata.visibility = 'private';
      } else if (text === 'protected') {
        metadata.visibility = 'protected';
      } else if (text === 'static') {
        metadata.isStatic = true;
        metadata.tags = [...(metadata.tags ?? []), 'static'];
      }
    }
  }

  // Extract parameters
  const params = node.childForFieldName('parameters');
  if (params) {
    metadata.paramCount = params.namedChildCount;
  }

  // Extract type parameters
  const typeParams = findChildByType(node, ['type_parameters']);
  if (typeParams) {
    metadata.genericParams = typeParams.namedChildren.map((c) => c.text);
  }

  // Build signature
  if (metadata.type === 'method' || metadata.type === 'class' || metadata.type === 'interface') {
    metadata.signature = buildSignature(node, source, metadata);
  }

  // Extract Javadoc
  const prevSibling = node.previousNamedSibling;
  if (prevSibling?.type === 'block_comment' || prevSibling?.type === 'comment') {
    const commentText = prevSibling.text;
    if (commentText.startsWith('/**')) {
      metadata.docstring = cleanDocstring(commentText);
    }
  }

  return metadata;
}

/**
 * Extract metadata from a Rust node
 */
function extractRustMetadata(
  node: Node,
  source: string,
  language: ASTLanguage
): Partial<ChunkMetadata> {
  const metadata: Partial<ChunkMetadata> = { language };
  const nodeType = node.type;

  // Determine chunk type
  if (nodeType === 'function_item') {
    metadata.type = 'function';
  } else if (nodeType === 'struct_item') {
    metadata.type = 'struct';
  } else if (nodeType === 'enum_item') {
    metadata.type = 'enum';
  } else if (nodeType === 'trait_item') {
    metadata.type = 'trait';
  } else if (nodeType === 'impl_item') {
    metadata.type = 'impl';
  } else if (nodeType === 'mod_item') {
    metadata.type = 'module';
  } else if (nodeType.includes('use')) {
    metadata.type = 'import';
  } else {
    metadata.type = 'other';
  }

  // Extract name
  const nameNode = node.childForFieldName('name') ?? findChildByType(node, ['identifier', 'type_identifier']);
  if (nameNode) {
    metadata.name = nameNode.text;
  }

  // Extract impl type
  if (nodeType === 'impl_item') {
    const typeNode = findChildByType(node, ['type_identifier', 'generic_type']);
    if (typeNode) {
      metadata.parentName = typeNode.text;
    }
  }

  // Check for async
  for (const child of node.children) {
    if (child.text === 'async') {
      metadata.isAsync = true;
      metadata.tags = [...(metadata.tags ?? []), 'async'];
      break;
    }
  }

  // Check for pub
  for (const child of node.children) {
    if (child.text === 'pub') {
      metadata.visibility = 'public';
      metadata.isExport = true;
      break;
    }
  }

  // Extract parameters
  const params = node.childForFieldName('parameters');
  if (params) {
    metadata.paramCount = params.namedChildCount;
  }

  // Build signature
  if (metadata.type === 'function' || metadata.type === 'struct' || metadata.type === 'trait') {
    metadata.signature = buildSignature(node, source, metadata);
  }

  // Extract doc comment
  const prevSibling = node.previousNamedSibling;
  if (prevSibling?.type === 'line_comment') {
    const commentText = prevSibling.text;
    if (commentText.startsWith('///') || commentText.startsWith('//!')) {
      // Collect consecutive doc comments
      let docComments = [commentText];
      let prev = prevSibling.previousNamedSibling;
      while (prev?.type === 'line_comment' && (prev.text.startsWith('///') || prev.text.startsWith('//!'))) {
        docComments.unshift(prev.text);
        prev = prev.previousNamedSibling;
      }
      metadata.docstring = cleanRustDocstring(docComments.join('\n'));
    }
  }

  return metadata;
}

/**
 * Generic metadata extractor for C/C++/C#
 */
function extractCStyleMetadata(
  node: Node,
  source: string,
  language: ASTLanguage
): Partial<ChunkMetadata> {
  const metadata: Partial<ChunkMetadata> = { language };
  const nodeType = node.type;

  // Determine chunk type
  if (nodeType.includes('function')) {
    metadata.type = 'function';
  } else if (nodeType.includes('class')) {
    metadata.type = 'class';
  } else if (nodeType.includes('struct')) {
    metadata.type = 'struct';
  } else if (nodeType.includes('enum')) {
    metadata.type = 'enum';
  } else if (nodeType.includes('interface')) {
    metadata.type = 'interface';
  } else if (nodeType.includes('method')) {
    metadata.type = 'method';
  } else if (nodeType.includes('namespace')) {
    metadata.type = 'module';
  } else if (nodeType.includes('include') || nodeType.includes('using')) {
    metadata.type = 'import';
  } else {
    metadata.type = 'other';
  }

  // Extract name
  const nameNode = node.childForFieldName('name') ?? node.childForFieldName('declarator') ?? findChildByType(node, ['identifier', 'type_identifier']);
  if (nameNode) {
    metadata.name = nameNode.text.replace(/^\*+/, ''); // Remove pointer stars
  }

  // Build basic signature
  if (metadata.type === 'function' || metadata.type === 'method') {
    metadata.signature = buildSignature(node, source, metadata);
  }

  // Extract preceding comment
  const prevSibling = node.previousNamedSibling;
  if (prevSibling?.type === 'comment') {
    metadata.docstring = cleanDocstring(prevSibling.text);
  }

  return metadata;
}

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
 * Build a function/method signature from a node
 */
function buildSignature(
  node: Node,
  source: string,
  metadata: Partial<ChunkMetadata>
): string {
  // Get the first line(s) of the node until the body starts
  const startLine = node.startPosition.row;
  const lines = source.split('\n');

  // Find where the body starts (look for { or :)
  let signatureLines: string[] = [];
  for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
    const line = lines[i];
    signatureLines.push(line);
    if (line.includes('{') || line.includes(':') || (metadata.language === 'python' && line.trimEnd().endsWith(':'))) {
      break;
    }
  }

  // Clean up the signature
  let signature = signatureLines.join('\n').trim();

  // Remove the body (everything after { or :)
  const bodyStart = signature.search(/\{|:\s*$/);
  if (bodyStart > 0) {
    signature = signature.substring(0, bodyStart).trim();
  }

  // Limit signature length
  if (signature.length > 200) {
    signature = signature.substring(0, 200) + '...';
  }

  return signature;
}

/**
 * Clean a JSDoc/Javadoc-style docstring
 */
function cleanDocstring(text: string): string {
  return text
    .replace(/^\/\*\*\s*/, '')
    .replace(/\s*\*\/$/, '')
    .replace(/^\s*\*\s?/gm, '')
    .trim();
}

/**
 * Clean a Python docstring
 */
function cleanPythonDocstring(text: string): string {
  // Remove triple quotes
  if (text.startsWith('"""') || text.startsWith("'''")) {
    text = text.slice(3, -3);
  } else if (text.startsWith('"') || text.startsWith("'")) {
    text = text.slice(1, -1);
  }
  return text.trim();
}

/**
 * Clean Rust doc comments
 */
function cleanRustDocstring(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\/\/[\/!]\s?/, ''))
    .join('\n')
    .trim();
}

/**
 * Get the metadata extractor for a language
 */
function getMetadataExtractor(
  language: ASTLanguage
): (node: Node, source: string, lang: ASTLanguage) => Partial<ChunkMetadata> {
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return extractJsTsMetadata;
    case 'python':
      return extractPythonMetadata;
    case 'go':
      return extractGoMetadata;
    case 'java':
      return extractJavaMetadata;
    case 'rust':
      return extractRustMetadata;
    case 'c':
    case 'cpp':
    case 'csharp':
      return extractCStyleMetadata;
    default:
      return extractCStyleMetadata;
  }
}

/**
 * Check if a node type should be chunked
 */
function shouldChunkNode(nodeType: string, nodeTypes: LanguageNodeTypes, includeImports: boolean): boolean {
  if (nodeTypes.functions.includes(nodeType)) return true;
  if (nodeTypes.classes.includes(nodeType)) return true;
  if (includeImports && nodeTypes.imports.includes(nodeType)) return true;
  return false;
}

/**
 * Split a large chunk into smaller pieces
 */
function splitLargeChunk(
  chunk: ASTChunk,
  options: ASTChunkOptions
): ASTChunk[] {
  if (chunk.text.length <= options.maxChunkSize) {
    return [chunk];
  }

  const chunks: ASTChunk[] = [];
  const lines = chunk.text.split('\n');
  let currentChunkLines: string[] = [];
  let currentChunkStartLine = chunk.startLine;
  let currentLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1;

    if (currentLength + lineLength > options.chunkSize && currentChunkLines.length > 0) {
      // Create chunk
      chunks.push({
        text: currentChunkLines.join('\n'),
        startLine: currentChunkStartLine,
        endLine: currentChunkStartLine + currentChunkLines.length - 1,
        metadata: {
          ...chunk.metadata,
          tags: [...(chunk.metadata.tags ?? []), 'partial'],
        },
      });

      // Calculate overlap
      const overlapLines = Math.min(
        Math.ceil(options.chunkOverlap / 80),
        currentChunkLines.length,
        5
      );
      const newStartIndex = currentChunkLines.length - overlapLines;
      currentChunkStartLine = currentChunkStartLine + newStartIndex;
      currentChunkLines = currentChunkLines.slice(newStartIndex);
      currentLength = currentChunkLines.reduce((sum, l) => sum + l.length + 1, 0);
    }

    currentChunkLines.push(line);
    currentLength += lineLength;
  }

  // Don't forget the last chunk
  if (currentChunkLines.length > 0) {
    chunks.push({
      text: currentChunkLines.join('\n'),
      startLine: currentChunkStartLine,
      endLine: currentChunkStartLine + currentChunkLines.length - 1,
      metadata: {
        ...chunk.metadata,
        tags: chunks.length > 0 ? [...(chunk.metadata.tags ?? []), 'partial'] : chunk.metadata.tags,
      },
    });
  }

  return chunks;
}

// ============================================================================
// Main AST Chunking Function
// ============================================================================

/**
 * Extract AST-based chunks from source code
 *
 * @param sourceCode - Source code to chunk
 * @param filePath - File path for language detection
 * @param options - Chunking options
 * @returns Array of AST chunks with metadata, or null if AST parsing fails
 */
export async function extractASTChunks(
  sourceCode: string,
  filePath: string,
  options?: Partial<ASTChunkOptions>
): Promise<ASTChunk[] | null> {
  const logger = getLogger();
  const opts = { ...DEFAULT_AST_OPTIONS, ...options };

  // Get parser instance
  const parser = getTreeSitterParser();

  // Check if language is supported
  if (!parser.isSupported(filePath)) {
    logger.debug('astChunking', 'File type not supported for AST chunking', { filePath });
    return null;
  }

  // Initialize parser if needed
  if (!parser.isInitialized) {
    try {
      await parser.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('astChunking', 'Failed to initialize Tree-sitter parser', { error: message });
      return null;
    }
  }

  // Parse the source code
  const tree = await parser.parse(sourceCode, filePath);
  if (!tree) {
    logger.debug('astChunking', 'Failed to parse source code', { filePath });
    return null;
  }

  const language = parser.getLanguage(filePath)!;
  const nodeTypes = LANGUAGE_NODE_TYPES[language];
  const extractMetadata = getMetadataExtractor(language);

  const chunks: ASTChunk[] = [];
  const lines = sourceCode.split('\n');

  // Traverse the AST and extract chunks
  function traverse(node: Node, parentInfo?: { name: string; type: ChunkType }) {
    const nodeType = node.type;

    // Check if this node should be a chunk
    if (shouldChunkNode(nodeType, nodeTypes, opts.includeImports)) {
      const startLine = node.startPosition.row + 1; // 1-based
      const endLine = node.endPosition.row + 1;
      const text = node.text;

      // Extract metadata
      const metadata = extractMetadata(node, sourceCode, language);

      // Add parent info if available
      if (parentInfo) {
        metadata.parentName = parentInfo.name;
        metadata.parentType = parentInfo.type;
      }

      const chunk: ASTChunk = {
        text,
        startLine,
        endLine,
        metadata: metadata as ChunkMetadata,
      };

      // Handle large chunks
      if (text.length > opts.maxChunkSize) {
        chunks.push(...splitLargeChunk(chunk, opts));
      } else {
        chunks.push(chunk);
      }

      // For classes, continue traversing to find methods
      if (metadata.type === 'class' || metadata.type === 'interface' || metadata.type === 'struct' || metadata.type === 'impl' || metadata.type === 'trait') {
        const classInfo = { name: metadata.name ?? '', type: metadata.type };
        for (const child of node.namedChildren) {
          traverse(child, classInfo);
        }
      }

      return; // Don't traverse further into this node (we've extracted it)
    }

    // Continue traversing children
    for (const child of node.namedChildren) {
      traverse(child, parentInfo);
    }
  }

  // Start traversal from root
  traverse(tree.rootNode);

  // If no chunks found, create a single module-level chunk
  if (chunks.length === 0 && sourceCode.trim()) {
    const moduleChunk: ASTChunk = {
      text: sourceCode,
      startLine: 1,
      endLine: lines.length,
      metadata: {
        type: 'module',
        language,
        name: filePath.split('/').pop()?.replace(/\.[^.]+$/, ''),
      },
    };

    // Handle large module chunks
    if (sourceCode.length > opts.maxChunkSize) {
      chunks.push(...splitLargeChunk(moduleChunk, opts));
    } else {
      chunks.push(moduleChunk);
    }
  }

  // Clean up
  tree.delete();

  logger.debug('astChunking', 'AST chunking complete', {
    filePath,
    language,
    chunkCount: chunks.length,
    avgChunkSize: chunks.length > 0 ? Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length) : 0,
  });

  return chunks;
}

/**
 * Convert AST chunks to ChunkWithLines format (for compatibility with existing code)
 *
 * @param astChunks - AST chunks with metadata
 * @returns Array of ChunkWithLines without metadata
 */
export function astChunksToChunksWithLines(astChunks: ASTChunk[]): ChunkWithLines[] {
  return astChunks.map((chunk) => ({
    text: chunk.text,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
  }));
}

/**
 * Get supported languages for AST chunking
 *
 * @returns Array of supported language names
 */
export function getSupportedASTLanguages(): ASTLanguage[] {
  return Object.keys(LANGUAGE_NODE_TYPES) as ASTLanguage[];
}
