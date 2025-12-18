/**
 * Code-Aware Chunking Engine
 *
 * Implements heuristic-based code-aware chunking that splits code at semantic
 * boundaries (functions, classes, methods) rather than fixed character counts.
 *
 * Benefits:
 * - Chunks align with code structure (no mid-function splits)
 * - Search results are more coherent and complete
 * - Reduced overlap requirement (from 20% to ~5%)
 *
 * Supported languages (20+):
 * - TypeScript/JavaScript: function declarations, class declarations, exports
 * - Python: def statements, class statements, decorators
 * - Java: class, interface, enum, method declarations
 * - Go: func, type struct, type interface declarations
 * - Rust: fn, struct, enum, impl, trait, macro declarations
 * - C#: class, struct, interface, enum, method declarations
 * - C/C++: function definitions, struct, class, namespace
 * - Kotlin: fun, class, interface, object declarations
 * - Swift: func, class, struct, enum, protocol, extension
 * - Ruby: def, class, module declarations
 * - PHP: function, class, interface, trait declarations
 * - Scala: def, class, trait, object declarations
 * - Shell/Bash: function declarations
 * - CSS/SCSS/LESS: rule blocks, @media, @keyframes
 * - HTML: structural elements
 * - Vue/Svelte: template, script, style blocks
 * - SQL: CREATE, ALTER, SELECT statements
 * - YAML/JSON/XML: structural markers
 * - GraphQL: type, query, mutation, subscription
 * - Terraform/HCL: resource, variable, output blocks
 * - Dockerfile: FROM, RUN, COPY instructions
 *
 * Falls back to character-based chunking for unsupported languages or on errors.
 *
 * @module codeAwareChunking
 */

import { getLogger } from '../utils/logger.js';
import { ChunkWithLines } from './chunking.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Supported programming languages for code-aware chunking (22 languages)
 *
 * Tier 1 - High Priority:
 * - typescript, javascript, python (existing)
 * - java, go, rust, csharp, c, cpp, kotlin, swift
 *
 * Tier 2 - Medium Priority:
 * - ruby, php, scala, shell
 *
 * Tier 3 - Markup/Config:
 * - css, scss, less, html, vue, svelte, sql, yaml, json, xml, graphql
 *
 * Tier 4 - Infrastructure:
 * - terraform, hcl, dockerfile
 */
export type SupportedLanguage =
  // Tier 1 - Existing
  | 'typescript'
  | 'javascript'
  | 'python'
  // Tier 1 - New
  | 'java'
  | 'go'
  | 'rust'
  | 'csharp'
  | 'c'
  | 'cpp'
  | 'kotlin'
  | 'swift'
  // Tier 2
  | 'ruby'
  | 'php'
  | 'scala'
  | 'shell'
  // Tier 3
  | 'css'
  | 'scss'
  | 'less'
  | 'html'
  | 'vue'
  | 'svelte'
  | 'sql'
  | 'yaml'
  | 'json'
  | 'xml'
  | 'graphql'
  // Tier 4
  | 'terraform'
  | 'hcl'
  | 'dockerfile'
  // Unknown
  | 'unknown';

/**
 * Configuration for code-aware chunking
 */
export interface CodeAwareChunkOptions {
  /** Target chunk size in characters (~4000 for ~1000 tokens) */
  chunkSize: number;
  /** Minimum overlap size in characters (~200 for ~50 tokens - reduced from 800) */
  chunkOverlap: number;
  /** Maximum chunk size before forcing a split */
  maxChunkSize: number;
}

/**
 * A semantic boundary in the code
 */
interface SemanticBoundary {
  /** Line number (1-based) where the boundary occurs */
  line: number;
  /** Character position in the text */
  position: number;
  /** Type of boundary (function, class, export, etc.) */
  type: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default options for code-aware chunking
 *
 * Reduced overlap compared to character-based chunking since we're
 * splitting at semantic boundaries.
 */
export const DEFAULT_CODE_AWARE_OPTIONS: CodeAwareChunkOptions = {
  chunkSize: 4000,
  chunkOverlap: 200, // Reduced from 800 since we split at semantic boundaries
  maxChunkSize: 8000, // Force split if a single function exceeds this
};

// ============================================================================
// Language Detection
// ============================================================================

/**
 * File extension to language mapping (40+ extensions for 22 languages)
 */
const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  // JavaScript family
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',

  // Java
  '.java': 'java',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // C#
  '.cs': 'csharp',

  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',

  // Kotlin
  '.kt': 'kotlin',
  '.kts': 'kotlin',

  // Swift
  '.swift': 'swift',

  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',

  // PHP
  '.php': 'php',
  '.phtml': 'php',

  // Scala
  '.scala': 'scala',
  '.sc': 'scala',

  // Shell/Bash
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',

  // CSS family
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',

  // HTML
  '.html': 'html',
  '.htm': 'html',

  // Vue and Svelte
  '.vue': 'vue',
  '.svelte': 'svelte',

  // SQL
  '.sql': 'sql',

  // Config formats
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.jsonc': 'json',
  '.xml': 'xml',
  '.xsl': 'xml',
  '.xslt': 'xml',

  // GraphQL
  '.graphql': 'graphql',
  '.gql': 'graphql',

  // Infrastructure
  '.tf': 'terraform',
  '.tfvars': 'terraform',
  '.hcl': 'hcl',
  '.dockerfile': 'dockerfile',
};

/**
 * Special filename to language mapping (for files without extensions)
 */
const FILENAME_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  dockerfile: 'dockerfile',
  makefile: 'shell',
  gemfile: 'ruby',
  rakefile: 'ruby',
  jenkinsfile: 'shell',
  vagrantfile: 'ruby',
};

/**
 * Detect the programming language from a file path
 *
 * @param filePath - Path to the file (can be relative or absolute)
 * @returns The detected language or 'unknown'
 */
export function detectLanguage(filePath: string): SupportedLanguage {
  // Extract filename from path
  const filename = filePath.split(/[/\\]/).pop()?.toLowerCase() || '';

  // Check for special filenames first (e.g., Dockerfile, Makefile)
  if (FILENAME_TO_LANGUAGE[filename]) {
    return FILENAME_TO_LANGUAGE[filename];
  }

  // Handle extension-based detection
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || 'unknown';
}

// ============================================================================
// Boundary Detection Patterns
// ============================================================================

/**
 * Regex patterns for detecting semantic boundaries in TypeScript/JavaScript
 *
 * These patterns detect the START of semantic units (functions, classes, etc.)
 * at the beginning of lines (allowing for whitespace).
 */
const TS_JS_BOUNDARY_PATTERNS = [
  // Export declarations (must come before function/class to catch exported items)
  { pattern: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+\w+/m, type: 'function' },
  { pattern: /^(?:export\s+(?:default\s+)?)?class\s+\w+/m, type: 'class' },
  { pattern: /^(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+\w+\s*=/m, type: 'variable' },
  { pattern: /^(?:export\s+(?:default\s+)?)?interface\s+\w+/m, type: 'interface' },
  { pattern: /^(?:export\s+(?:default\s+)?)?type\s+\w+\s*=/m, type: 'type' },
  { pattern: /^(?:export\s+(?:default\s+)?)?enum\s+\w+/m, type: 'enum' },
  // Arrow functions assigned to variables (at module level)
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/m, type: 'arrow-function' },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\w+\s*=>/m, type: 'arrow-function' },
];

/**
 * Regex patterns for detecting semantic boundaries in Python
 */
const PYTHON_BOUNDARY_PATTERNS = [
  // Function definitions (including async)
  { pattern: /^(?:async\s+)?def\s+\w+\s*\(/m, type: 'function' },
  // Class definitions
  { pattern: /^class\s+\w+/m, type: 'class' },
  // Decorated functions/classes (decorator is part of the boundary)
  { pattern: /^@\w+/m, type: 'decorator' },
];

// ============================================================================
// Tier 1 Languages - High Priority
// ============================================================================

/**
 * Regex patterns for detecting semantic boundaries in Java
 */
const JAVA_BOUNDARY_PATTERNS = [
  // Class declarations
  { pattern: /^(?:public|private|protected)?\s*(?:abstract|final|static)?\s*class\s+\w+/m, type: 'class' },
  // Interface declarations
  { pattern: /^(?:public)?\s*interface\s+\w+/m, type: 'interface' },
  // Enum declarations
  { pattern: /^(?:public)?\s*enum\s+\w+/m, type: 'enum' },
  // Record declarations (Java 16+)
  { pattern: /^(?:public|private|protected)?\s*record\s+\w+/m, type: 'record' },
  // Annotations
  { pattern: /^@\w+/m, type: 'annotation' },
];

/**
 * Regex patterns for detecting semantic boundaries in Go
 */
const GO_BOUNDARY_PATTERNS = [
  // Function declarations (including methods with receivers)
  { pattern: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/m, type: 'function' },
  // Type struct declarations
  { pattern: /^type\s+\w+\s+struct\s*\{/m, type: 'struct' },
  // Type interface declarations
  { pattern: /^type\s+\w+\s+interface\s*\{/m, type: 'interface' },
  // Type alias declarations
  { pattern: /^type\s+\w+\s+\w+/m, type: 'type' },
  // Const blocks
  { pattern: /^const\s+(?:\w+|\()/m, type: 'const' },
  // Var blocks
  { pattern: /^var\s+(?:\w+|\()/m, type: 'var' },
];

/**
 * Regex patterns for detecting semantic boundaries in Rust
 */
const RUST_BOUNDARY_PATTERNS = [
  // Function declarations (pub, async, unsafe)
  { pattern: /^(?:pub(?:\s*\([^)]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+\w+/m, type: 'function' },
  // Struct declarations
  { pattern: /^(?:pub(?:\s*\([^)]+\))?\s+)?struct\s+\w+/m, type: 'struct' },
  // Enum declarations
  { pattern: /^(?:pub(?:\s*\([^)]+\))?\s+)?enum\s+\w+/m, type: 'enum' },
  // Impl blocks
  { pattern: /^impl(?:\s*<[^>]+>)?\s+(?:\w+\s+for\s+)?\w+/m, type: 'impl' },
  // Trait declarations
  { pattern: /^(?:pub(?:\s*\([^)]+\))?\s+)?trait\s+\w+/m, type: 'trait' },
  // Macro definitions
  { pattern: /^macro_rules!\s+\w+/m, type: 'macro' },
  // Mod declarations
  { pattern: /^(?:pub(?:\s*\([^)]+\))?\s+)?mod\s+\w+/m, type: 'mod' },
  // Use statements (for module-level grouping)
  { pattern: /^(?:pub\s+)?use\s+/m, type: 'use' },
];

/**
 * Regex patterns for detecting semantic boundaries in C#
 */
const CSHARP_BOUNDARY_PATTERNS = [
  // Class declarations
  { pattern: /^(?:public|private|protected|internal)?\s*(?:abstract|sealed|static|partial)?\s*class\s+\w+/m, type: 'class' },
  // Struct declarations
  { pattern: /^(?:public|private|protected|internal)?\s*(?:readonly\s+)?struct\s+\w+/m, type: 'struct' },
  // Interface declarations
  { pattern: /^(?:public|private|protected|internal)?\s*interface\s+\w+/m, type: 'interface' },
  // Enum declarations
  { pattern: /^(?:public|private|protected|internal)?\s*enum\s+\w+/m, type: 'enum' },
  // Record declarations (C# 9+)
  { pattern: /^(?:public|private|protected|internal)?\s*(?:sealed\s+)?record\s+\w+/m, type: 'record' },
  // Namespace declarations
  { pattern: /^namespace\s+[\w.]+/m, type: 'namespace' },
  // Attributes
  { pattern: /^\[\w+/m, type: 'attribute' },
];

/**
 * Regex patterns for detecting semantic boundaries in C
 */
const C_BOUNDARY_PATTERNS = [
  // Function definitions (type name followed by function name)
  { pattern: /^(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:\w+\s+)+\w+\s*\([^)]*\)\s*\{/m, type: 'function' },
  // Struct definitions
  { pattern: /^(?:typedef\s+)?struct\s+\w*/m, type: 'struct' },
  // Enum definitions
  { pattern: /^(?:typedef\s+)?enum\s+\w*/m, type: 'enum' },
  // Union definitions
  { pattern: /^(?:typedef\s+)?union\s+\w*/m, type: 'union' },
  // Preprocessor directives (for grouping)
  { pattern: /^#(?:define|ifdef|ifndef|if)\s+/m, type: 'preprocessor' },
];

/**
 * Regex patterns for detecting semantic boundaries in C++
 */
const CPP_BOUNDARY_PATTERNS = [
  // Class declarations
  { pattern: /^(?:template\s*<[^>]*>\s*)?(?:class|struct)\s+\w+/m, type: 'class' },
  // Function definitions
  { pattern: /^(?:virtual\s+)?(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:\w+(?:::\w+)*\s+)+\w+\s*\([^)]*\)/m, type: 'function' },
  // Namespace declarations
  { pattern: /^namespace\s+\w+/m, type: 'namespace' },
  // Enum class declarations
  { pattern: /^enum\s+(?:class\s+)?\w+/m, type: 'enum' },
  // Template declarations
  { pattern: /^template\s*<[^>]*>/m, type: 'template' },
  // Preprocessor directives
  { pattern: /^#(?:define|ifdef|ifndef|if)\s+/m, type: 'preprocessor' },
];

/**
 * Regex patterns for detecting semantic boundaries in Kotlin
 */
const KOTLIN_BOUNDARY_PATTERNS = [
  // Function declarations
  { pattern: /^(?:private|public|protected|internal)?\s*(?:suspend\s+)?fun\s+(?:<[^>]+>\s*)?\w+/m, type: 'function' },
  // Class declarations
  { pattern: /^(?:private|public|protected|internal)?\s*(?:open|abstract|sealed|data|inner|enum)?\s*class\s+\w+/m, type: 'class' },
  // Interface declarations
  { pattern: /^(?:private|public|protected|internal)?\s*interface\s+\w+/m, type: 'interface' },
  // Object declarations
  { pattern: /^(?:private|public|protected|internal)?\s*object\s+\w+/m, type: 'object' },
  // Companion object
  { pattern: /^companion\s+object/m, type: 'companion' },
  // Annotations
  { pattern: /^@\w+/m, type: 'annotation' },
];

/**
 * Regex patterns for detecting semantic boundaries in Swift
 */
const SWIFT_BOUNDARY_PATTERNS = [
  // Function declarations
  { pattern: /^(?:private|public|internal|fileprivate|open)?\s*(?:static\s+)?func\s+\w+/m, type: 'function' },
  // Class declarations
  { pattern: /^(?:private|public|internal|fileprivate|open)?\s*(?:final\s+)?class\s+\w+/m, type: 'class' },
  // Struct declarations
  { pattern: /^(?:private|public|internal|fileprivate)?\s*struct\s+\w+/m, type: 'struct' },
  // Enum declarations
  { pattern: /^(?:private|public|internal|fileprivate)?\s*enum\s+\w+/m, type: 'enum' },
  // Protocol declarations
  { pattern: /^(?:private|public|internal|fileprivate)?\s*protocol\s+\w+/m, type: 'protocol' },
  // Extension declarations
  { pattern: /^(?:private|public|internal|fileprivate)?\s*extension\s+\w+/m, type: 'extension' },
  // Property wrappers and attributes
  { pattern: /^@\w+/m, type: 'attribute' },
];

// ============================================================================
// Tier 2 Languages - Medium Priority
// ============================================================================

/**
 * Regex patterns for detecting semantic boundaries in Ruby
 */
const RUBY_BOUNDARY_PATTERNS = [
  // Method definitions
  { pattern: /^(?:def\s+(?:self\.)?)\w+/m, type: 'method' },
  // Class definitions
  { pattern: /^class\s+\w+/m, type: 'class' },
  // Module definitions
  { pattern: /^module\s+\w+/m, type: 'module' },
  // Blocks/Procs (begin blocks)
  { pattern: /^begin$/m, type: 'block' },
];

/**
 * Regex patterns for detecting semantic boundaries in PHP
 */
const PHP_BOUNDARY_PATTERNS = [
  // Function declarations
  { pattern: /^(?:public|private|protected)?\s*(?:static\s+)?function\s+\w+/m, type: 'function' },
  // Class declarations
  { pattern: /^(?:abstract\s+|final\s+)?class\s+\w+/m, type: 'class' },
  // Interface declarations
  { pattern: /^interface\s+\w+/m, type: 'interface' },
  // Trait declarations
  { pattern: /^trait\s+\w+/m, type: 'trait' },
  // Namespace declarations
  { pattern: /^namespace\s+[\w\\]+/m, type: 'namespace' },
];

/**
 * Regex patterns for detecting semantic boundaries in Scala
 */
const SCALA_BOUNDARY_PATTERNS = [
  // Def declarations
  { pattern: /^(?:private|protected)?\s*(?:override\s+)?def\s+\w+/m, type: 'def' },
  // Class declarations
  { pattern: /^(?:private|protected)?\s*(?:abstract\s+|final\s+|sealed\s+|case\s+)?class\s+\w+/m, type: 'class' },
  // Trait declarations
  { pattern: /^(?:private|protected)?\s*(?:sealed\s+)?trait\s+\w+/m, type: 'trait' },
  // Object declarations
  { pattern: /^(?:private|protected)?\s*(?:case\s+)?object\s+\w+/m, type: 'object' },
  // Type aliases
  { pattern: /^(?:private|protected)?\s*type\s+\w+/m, type: 'type' },
];

/**
 * Regex patterns for detecting semantic boundaries in Shell/Bash
 */
const SHELL_BOUNDARY_PATTERNS = [
  // Function declarations (both styles)
  { pattern: /^(?:function\s+)?\w+\s*\(\)\s*\{/m, type: 'function' },
  { pattern: /^function\s+\w+/m, type: 'function' },
  // Case statements
  { pattern: /^case\s+.+\s+in$/m, type: 'case' },
  // If blocks (top-level)
  { pattern: /^if\s+/m, type: 'if' },
];

// ============================================================================
// Tier 3 Languages - Markup/Config
// ============================================================================

/**
 * Regex patterns for detecting semantic boundaries in CSS
 */
const CSS_BOUNDARY_PATTERNS = [
  // Rule blocks (class, id, element selectors)
  { pattern: /^[.#]?[\w-]+(?:\s*,\s*[.#]?[\w-]+)*\s*\{/m, type: 'rule' },
  // Media queries
  { pattern: /^@media\s+/m, type: 'media' },
  // Keyframes
  { pattern: /^@keyframes\s+\w+/m, type: 'keyframes' },
  // Font-face
  { pattern: /^@font-face\s*\{/m, type: 'fontface' },
  // Import statements
  { pattern: /^@import\s+/m, type: 'import' },
];

/**
 * Regex patterns for detecting semantic boundaries in SCSS
 * Extends CSS patterns with SCSS-specific features
 */
const SCSS_BOUNDARY_PATTERNS = [
  ...CSS_BOUNDARY_PATTERNS,
  // Mixins
  { pattern: /^@mixin\s+\w+/m, type: 'mixin' },
  // Functions
  { pattern: /^@function\s+\w+/m, type: 'function' },
  // Extend
  { pattern: /^%\w+\s*\{/m, type: 'placeholder' },
  // Variables block
  { pattern: /^\$[\w-]+\s*:/m, type: 'variable' },
];

/**
 * Regex patterns for detecting semantic boundaries in LESS
 * Similar to SCSS
 */
const LESS_BOUNDARY_PATTERNS = [
  ...CSS_BOUNDARY_PATTERNS,
  // Mixins (parameterized)
  { pattern: /^\.[\w-]+\s*\([^)]*\)\s*\{/m, type: 'mixin' },
  // Variables
  { pattern: /^@[\w-]+\s*:/m, type: 'variable' },
];

/**
 * Regex patterns for detecting semantic boundaries in HTML
 */
const HTML_BOUNDARY_PATTERNS = [
  // Script tags
  { pattern: /^<script[^>]*>/im, type: 'script' },
  // Style tags
  { pattern: /^<style[^>]*>/im, type: 'style' },
  // Semantic elements
  { pattern: /^<(?:header|footer|nav|main|article|section|aside)[^>]*>/im, type: 'section' },
  // Template tags
  { pattern: /^<template[^>]*>/im, type: 'template' },
  // Form elements
  { pattern: /^<form[^>]*>/im, type: 'form' },
];

/**
 * Regex patterns for detecting semantic boundaries in Vue SFCs
 */
const VUE_BOUNDARY_PATTERNS = [
  // Template block
  { pattern: /^<template[^>]*>/im, type: 'template' },
  // Script block (including setup)
  { pattern: /^<script[^>]*>/im, type: 'script' },
  // Style block (including scoped)
  { pattern: /^<style[^>]*>/im, type: 'style' },
];

/**
 * Regex patterns for detecting semantic boundaries in Svelte
 */
const SVELTE_BOUNDARY_PATTERNS = [
  // Script block
  { pattern: /^<script[^>]*>/im, type: 'script' },
  // Style block
  { pattern: /^<style[^>]*>/im, type: 'style' },
  // Svelte special blocks
  { pattern: /^\{#(?:if|each|await|key)\s+/m, type: 'block' },
];

/**
 * Regex patterns for detecting semantic boundaries in SQL
 */
const SQL_BOUNDARY_PATTERNS = [
  // CREATE statements
  { pattern: /^CREATE\s+(?:TABLE|VIEW|INDEX|FUNCTION|PROCEDURE|TRIGGER|DATABASE|SCHEMA)/im, type: 'create' },
  // ALTER statements
  { pattern: /^ALTER\s+(?:TABLE|VIEW|INDEX|FUNCTION|PROCEDURE)/im, type: 'alter' },
  // SELECT statements (complex queries)
  { pattern: /^(?:WITH\s+\w+\s+AS\s*\(|SELECT\s+)/im, type: 'select' },
  // INSERT/UPDATE/DELETE
  { pattern: /^(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)/im, type: 'dml' },
  // DROP statements
  { pattern: /^DROP\s+(?:TABLE|VIEW|INDEX|FUNCTION|PROCEDURE)/im, type: 'drop' },
];

/**
 * Regex patterns for detecting semantic boundaries in YAML
 * Uses indentation-based detection
 */
const YAML_BOUNDARY_PATTERNS = [
  // Top-level keys (no indentation)
  { pattern: /^[\w-]+\s*:/m, type: 'key' },
  // Document separator
  { pattern: /^---$/m, type: 'document' },
  // List at root level
  { pattern: /^-\s+\w+/m, type: 'list' },
];

/**
 * Regex patterns for detecting semantic boundaries in JSON
 * JSON is structured, so we split at top-level keys
 */
const JSON_BOUNDARY_PATTERNS = [
  // Top-level object key (assuming standard formatting)
  { pattern: /^\s*"\w+"\s*:/m, type: 'key' },
];

/**
 * Regex patterns for detecting semantic boundaries in XML
 */
const XML_BOUNDARY_PATTERNS = [
  // Opening tags at low nesting levels
  { pattern: /^<[\w:-]+(?:\s+[^>]*)?>$/m, type: 'element' },
  // Processing instructions
  { pattern: /^<\?[\w-]+/m, type: 'processing' },
  // Comments (block)
  { pattern: /^<!--/m, type: 'comment' },
  // CDATA sections
  { pattern: /^<!\[CDATA\[/m, type: 'cdata' },
];

/**
 * Regex patterns for detecting semantic boundaries in GraphQL
 */
const GRAPHQL_BOUNDARY_PATTERNS = [
  // Type definitions
  { pattern: /^type\s+\w+/m, type: 'type' },
  // Interface definitions
  { pattern: /^interface\s+\w+/m, type: 'interface' },
  // Input definitions
  { pattern: /^input\s+\w+/m, type: 'input' },
  // Enum definitions
  { pattern: /^enum\s+\w+/m, type: 'enum' },
  // Query/Mutation/Subscription
  { pattern: /^(?:query|mutation|subscription)\s+\w*/m, type: 'operation' },
  // Fragment definitions
  { pattern: /^fragment\s+\w+\s+on\s+\w+/m, type: 'fragment' },
  // Scalar definitions
  { pattern: /^scalar\s+\w+/m, type: 'scalar' },
  // Union definitions
  { pattern: /^union\s+\w+/m, type: 'union' },
];

// ============================================================================
// Tier 4 Languages - Infrastructure
// ============================================================================

/**
 * Regex patterns for detecting semantic boundaries in Terraform
 */
const TERRAFORM_BOUNDARY_PATTERNS = [
  // Resource blocks
  { pattern: /^resource\s+"[\w-]+"\s+"[\w-]+"/m, type: 'resource' },
  // Data blocks
  { pattern: /^data\s+"[\w-]+"\s+"[\w-]+"/m, type: 'data' },
  // Variable blocks
  { pattern: /^variable\s+"[\w-]+"/m, type: 'variable' },
  // Output blocks
  { pattern: /^output\s+"[\w-]+"/m, type: 'output' },
  // Module blocks
  { pattern: /^module\s+"[\w-]+"/m, type: 'module' },
  // Provider blocks
  { pattern: /^provider\s+"[\w-]+"/m, type: 'provider' },
  // Locals blocks
  { pattern: /^locals\s*\{/m, type: 'locals' },
  // Terraform block
  { pattern: /^terraform\s*\{/m, type: 'terraform' },
];

/**
 * Regex patterns for detecting semantic boundaries in HCL
 * Similar to Terraform but more generic
 */
const HCL_BOUNDARY_PATTERNS = [
  // Generic block definitions
  { pattern: /^\w+\s+"[\w-]+"\s*\{/m, type: 'block' },
  { pattern: /^\w+\s*\{/m, type: 'block' },
  // Variable assignments
  { pattern: /^[\w-]+\s*=/m, type: 'assignment' },
];

/**
 * Regex patterns for detecting semantic boundaries in Dockerfile
 */
const DOCKERFILE_BOUNDARY_PATTERNS = [
  // FROM instructions (new stage)
  { pattern: /^FROM\s+/im, type: 'from' },
  // RUN instructions (often multi-line)
  { pattern: /^RUN\s+/im, type: 'run' },
  // COPY/ADD instructions
  { pattern: /^(?:COPY|ADD)\s+/im, type: 'copy' },
  // ENV instructions
  { pattern: /^ENV\s+/im, type: 'env' },
  // ENTRYPOINT/CMD
  { pattern: /^(?:ENTRYPOINT|CMD)\s+/im, type: 'entrypoint' },
  // WORKDIR
  { pattern: /^WORKDIR\s+/im, type: 'workdir' },
  // EXPOSE
  { pattern: /^EXPOSE\s+/im, type: 'expose' },
  // ARG
  { pattern: /^ARG\s+/im, type: 'arg' },
  // LABEL
  { pattern: /^LABEL\s+/im, type: 'label' },
];

// ============================================================================
// Boundary Detection Functions
// ============================================================================

/**
 * Find all semantic boundaries in TypeScript/JavaScript code
 *
 * @param text - Source code text
 * @returns Array of semantic boundaries sorted by position
 */
function findTsJsBoundaries(text: string): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];
  const lines = text.split('\n');
  let position = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    // Check each pattern against the trimmed line
    for (const { pattern, type } of TS_JS_BOUNDARY_PATTERNS) {
      if (pattern.test(trimmedLine)) {
        boundaries.push({
          line: i + 1, // 1-based line number
          position,
          type,
        });
        break; // Only one boundary per line
      }
    }

    position += line.length + 1; // +1 for newline
  }

  return boundaries;
}

/**
 * Find all semantic boundaries in Python code
 *
 * @param text - Source code text
 * @returns Array of semantic boundaries sorted by position
 */
function findPythonBoundaries(text: string): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];
  const lines = text.split('\n');
  let position = 0;
  let prevWasDecorator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();
    const indentLevel = line.length - trimmedLine.length;

    // Only consider top-level definitions (no indentation) or class methods (4 spaces)
    // This avoids splitting on nested functions
    if (indentLevel > 4) {
      position += line.length + 1;
      continue;
    }

    // Check for decorator - it's the start of a function/class boundary
    if (/^@\w+/.test(trimmedLine)) {
      if (!prevWasDecorator) {
        boundaries.push({
          line: i + 1,
          position,
          type: 'decorator',
        });
      }
      prevWasDecorator = true;
    } else if (/^(?:async\s+)?def\s+\w+\s*\(/.test(trimmedLine) || /^class\s+\w+/.test(trimmedLine)) {
      // If not preceded by decorator, this is a boundary
      if (!prevWasDecorator) {
        boundaries.push({
          line: i + 1,
          position,
          type: /^class/.test(trimmedLine) ? 'class' : 'function',
        });
      }
      prevWasDecorator = false;
    } else {
      prevWasDecorator = false;
    }

    position += line.length + 1;
  }

  return boundaries;
}

/**
 * Generic boundary finder using pattern matching
 *
 * @param text - Source code text
 * @param patterns - Array of patterns to match
 * @param options - Optional configuration for boundary detection
 * @returns Array of semantic boundaries sorted by position
 */
function findGenericBoundaries(
  text: string,
  patterns: Array<{ pattern: RegExp; type: string }>,
  options?: {
    /** Maximum indentation level to consider (default: undefined = no limit) */
    maxIndent?: number;
    /** Whether to handle decorator-like patterns (e.g., @annotation) */
    handleDecorators?: boolean;
  }
): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];
  const lines = text.split('\n');
  let position = 0;
  let prevWasDecorator = false;
  const decoratorPattern = /^@\w+/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();
    const indentLevel = line.length - trimmedLine.length;

    // Skip lines with too much indentation if maxIndent is set
    if (options?.maxIndent !== undefined && indentLevel > options.maxIndent) {
      position += line.length + 1;
      continue;
    }

    // Handle decorators/annotations if enabled
    if (options?.handleDecorators && decoratorPattern.test(trimmedLine)) {
      if (!prevWasDecorator) {
        boundaries.push({
          line: i + 1,
          position,
          type: 'decorator',
        });
      }
      prevWasDecorator = true;
      position += line.length + 1;
      continue;
    }

    // Check each pattern against the trimmed line
    let matched = false;
    for (const { pattern, type } of patterns) {
      if (pattern.test(trimmedLine)) {
        // Skip if this is a definition preceded by a decorator (decorator is the boundary)
        if (!(options?.handleDecorators && prevWasDecorator)) {
          boundaries.push({
            line: i + 1,
            position,
            type,
          });
        }
        matched = true;
        break;
      }
    }

    if (options?.handleDecorators) {
      prevWasDecorator = matched ? false : prevWasDecorator && !trimmedLine;
    }

    position += line.length + 1;
  }

  return boundaries;
}

/**
 * Language configuration for generic boundary detection
 */
interface LanguageBoundaryConfig {
  patterns: Array<{ pattern: RegExp; type: string }>;
  options?: {
    maxIndent?: number;
    handleDecorators?: boolean;
  };
}

/**
 * Get boundary configuration for a language
 */
function getLanguageConfig(language: SupportedLanguage): LanguageBoundaryConfig | null {
  switch (language) {
    // Tier 1 - Existing (use specialized functions)
    case 'typescript':
    case 'javascript':
      return { patterns: TS_JS_BOUNDARY_PATTERNS };

    case 'python':
      return { patterns: PYTHON_BOUNDARY_PATTERNS, options: { maxIndent: 4, handleDecorators: true } };

    // Tier 1 - New
    case 'java':
      return { patterns: JAVA_BOUNDARY_PATTERNS, options: { handleDecorators: true } };

    case 'go':
      return { patterns: GO_BOUNDARY_PATTERNS };

    case 'rust':
      return { patterns: RUST_BOUNDARY_PATTERNS };

    case 'csharp':
      return { patterns: CSHARP_BOUNDARY_PATTERNS, options: { handleDecorators: true } };

    case 'c':
      return { patterns: C_BOUNDARY_PATTERNS };

    case 'cpp':
      return { patterns: CPP_BOUNDARY_PATTERNS };

    case 'kotlin':
      return { patterns: KOTLIN_BOUNDARY_PATTERNS, options: { handleDecorators: true } };

    case 'swift':
      return { patterns: SWIFT_BOUNDARY_PATTERNS, options: { handleDecorators: true } };

    // Tier 2
    case 'ruby':
      return { patterns: RUBY_BOUNDARY_PATTERNS };

    case 'php':
      return { patterns: PHP_BOUNDARY_PATTERNS };

    case 'scala':
      return { patterns: SCALA_BOUNDARY_PATTERNS };

    case 'shell':
      return { patterns: SHELL_BOUNDARY_PATTERNS };

    // Tier 3
    case 'css':
      return { patterns: CSS_BOUNDARY_PATTERNS };

    case 'scss':
      return { patterns: SCSS_BOUNDARY_PATTERNS };

    case 'less':
      return { patterns: LESS_BOUNDARY_PATTERNS };

    case 'html':
      return { patterns: HTML_BOUNDARY_PATTERNS };

    case 'vue':
      return { patterns: VUE_BOUNDARY_PATTERNS };

    case 'svelte':
      return { patterns: SVELTE_BOUNDARY_PATTERNS };

    case 'sql':
      return { patterns: SQL_BOUNDARY_PATTERNS };

    case 'yaml':
      return { patterns: YAML_BOUNDARY_PATTERNS };

    case 'json':
      return { patterns: JSON_BOUNDARY_PATTERNS };

    case 'xml':
      return { patterns: XML_BOUNDARY_PATTERNS };

    case 'graphql':
      return { patterns: GRAPHQL_BOUNDARY_PATTERNS };

    // Tier 4
    case 'terraform':
      return { patterns: TERRAFORM_BOUNDARY_PATTERNS };

    case 'hcl':
      return { patterns: HCL_BOUNDARY_PATTERNS };

    case 'dockerfile':
      return { patterns: DOCKERFILE_BOUNDARY_PATTERNS };

    default:
      return null;
  }
}

/**
 * Find semantic boundaries based on the detected language
 *
 * @param text - Source code text
 * @param language - Programming language
 * @returns Array of semantic boundaries
 */
function findBoundaries(text: string, language: SupportedLanguage): SemanticBoundary[] {
  // Use specialized functions for languages that need special handling
  switch (language) {
    case 'typescript':
    case 'javascript':
      return findTsJsBoundaries(text);
    case 'python':
      return findPythonBoundaries(text);
    default:
      // Use generic boundary finder for all other languages
      const config = getLanguageConfig(language);
      if (config) {
        return findGenericBoundaries(text, config.patterns, config.options);
      }
      return [];
  }
}

// ============================================================================
// Code-Aware Chunking Implementation
// ============================================================================

/**
 * Split code at semantic boundaries with line number tracking
 *
 * Algorithm:
 * 1. Detect language from file path
 * 2. Find all semantic boundaries (functions, classes, etc.)
 * 3. Group boundaries into chunks that fit within the size limit
 * 4. If a single semantic unit exceeds maxChunkSize, split it at line boundaries
 * 5. Add minimal overlap at chunk boundaries
 *
 * @param text - Source code text
 * @param filePath - Path to the file (for language detection)
 * @param options - Chunking options
 * @returns Array of chunks with line number information
 */
export function splitCodeWithLineNumbers(
  text: string,
  filePath: string,
  options?: Partial<CodeAwareChunkOptions>
): ChunkWithLines[] {
  const logger = getLogger();
  const opts = { ...DEFAULT_CODE_AWARE_OPTIONS, ...options };

  // Handle edge cases
  if (!text || text.length === 0) {
    return [];
  }

  // If text is small enough, return as single chunk
  if (text.length <= opts.chunkSize) {
    const lineCount = text.split('\n').length;
    return [
      {
        text,
        startLine: 1,
        endLine: lineCount,
      },
    ];
  }

  // Detect language
  const language = detectLanguage(filePath);

  if (language === 'unknown') {
    logger.debug('codeAwareChunking', 'Unknown language, falling back to character-based chunking', {
      filePath,
    });
    return null as unknown as ChunkWithLines[]; // Signal to use fallback
  }

  // Find semantic boundaries
  const boundaries = findBoundaries(text, language);

  if (boundaries.length === 0) {
    logger.debug('codeAwareChunking', 'No semantic boundaries found, falling back to character-based chunking', {
      filePath,
      language,
    });
    return null as unknown as ChunkWithLines[]; // Signal to use fallback
  }

  logger.debug('codeAwareChunking', 'Found semantic boundaries', {
    filePath,
    language,
    boundaryCount: boundaries.length,
  });

  // Split text into lines for easier manipulation
  const lines = text.split('\n');
  const chunks: ChunkWithLines[] = [];

  // Add an implicit boundary at the start if first boundary isn't at line 1
  if (boundaries[0].line > 1) {
    boundaries.unshift({ line: 1, position: 0, type: 'start' });
  }

  // Add an implicit boundary at the end
  boundaries.push({ line: lines.length + 1, position: text.length, type: 'end' });

  // Group boundaries into chunks
  let currentChunkStart = 0;
  let currentChunkStartLine = 1;

  for (let i = 1; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const chunkText = text.substring(currentChunkStart, boundary.position);

    // If this chunk would exceed chunkSize, we need to finalize the current chunk
    if (chunkText.length > opts.chunkSize && i > 1) {
      // Use the previous boundary as the end of this chunk
      const prevBoundary = boundaries[i - 1];
      const finalChunkText = text.substring(currentChunkStart, prevBoundary.position).trimEnd();

      if (finalChunkText.length > 0) {
        // Check if single semantic unit is too large
        if (finalChunkText.length > opts.maxChunkSize) {
          // Split large semantic unit at line boundaries
          const subChunks = splitLargeUnit(finalChunkText, currentChunkStartLine, opts);
          chunks.push(...subChunks);
        } else {
          const chunkLineCount = finalChunkText.split('\n').length;
          chunks.push({
            text: finalChunkText,
            startLine: currentChunkStartLine,
            endLine: currentChunkStartLine + chunkLineCount - 1,
          });
        }
      }

      // Start new chunk from previous boundary with overlap
      const overlapStart = calculateOverlapPosition(text, prevBoundary.position, opts.chunkOverlap);
      currentChunkStart = overlapStart;
      currentChunkStartLine = countLinesUntilPosition(text, overlapStart) + 1;
    }

    // If this is the last boundary, finalize the remaining text
    if (i === boundaries.length - 1) {
      const finalChunkText = text.substring(currentChunkStart).trimEnd();
      if (finalChunkText.length > 0) {
        if (finalChunkText.length > opts.maxChunkSize) {
          const subChunks = splitLargeUnit(finalChunkText, currentChunkStartLine, opts);
          chunks.push(...subChunks);
        } else {
          const chunkLineCount = finalChunkText.split('\n').length;
          chunks.push({
            text: finalChunkText,
            startLine: currentChunkStartLine,
            endLine: currentChunkStartLine + chunkLineCount - 1,
          });
        }
      }
    }
  }

  // If we ended up with no chunks or something went wrong, signal fallback
  if (chunks.length === 0) {
    logger.warn('codeAwareChunking', 'Code-aware chunking produced no chunks, falling back', {
      filePath,
    });
    return null as unknown as ChunkWithLines[];
  }

  logger.debug('codeAwareChunking', 'Code-aware chunking complete', {
    filePath,
    chunkCount: chunks.length,
    avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length),
  });

  return chunks;
}

/**
 * Split a large semantic unit that exceeds maxChunkSize
 *
 * @param text - The large text to split
 * @param startLine - Starting line number
 * @param opts - Chunking options
 * @returns Array of smaller chunks
 */
function splitLargeUnit(
  text: string,
  startLine: number,
  opts: CodeAwareChunkOptions
): ChunkWithLines[] {
  const chunks: ChunkWithLines[] = [];
  const lines = text.split('\n');
  let currentChunkLines: string[] = [];
  let currentChunkStart = startLine;
  let currentLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1; // +1 for newline

    if (currentLength + lineLength > opts.chunkSize && currentChunkLines.length > 0) {
      // Finalize current chunk
      chunks.push({
        text: currentChunkLines.join('\n'),
        startLine: currentChunkStart,
        endLine: currentChunkStart + currentChunkLines.length - 1,
      });

      // Calculate overlap (include last few lines from previous chunk)
      const overlapLines = Math.min(
        Math.ceil(opts.chunkOverlap / 80), // Assume ~80 chars per line
        currentChunkLines.length,
        5 // Max 5 lines of overlap
      );

      const newStartIndex = currentChunkLines.length - overlapLines;
      currentChunkStart = currentChunkStart + newStartIndex;
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
      startLine: currentChunkStart,
      endLine: currentChunkStart + currentChunkLines.length - 1,
    });
  }

  return chunks;
}

/**
 * Calculate overlap start position by going back from a boundary
 *
 * @param text - Full text
 * @param boundaryPosition - Position of the boundary
 * @param overlapSize - Desired overlap size
 * @returns Position to start the overlap from
 */
function calculateOverlapPosition(
  text: string,
  boundaryPosition: number,
  overlapSize: number
): number {
  // Go back overlapSize characters, but snap to a line boundary
  let pos = Math.max(0, boundaryPosition - overlapSize);

  // Find the start of the line
  while (pos > 0 && text[pos - 1] !== '\n') {
    pos--;
  }

  return pos;
}

/**
 * Count lines from start of text until a given position
 *
 * @param text - Text to search
 * @param position - Position to count until
 * @returns Number of lines (0-based count)
 */
function countLinesUntilPosition(text: string, position: number): number {
  let count = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === '\n') {
      count++;
    }
  }
  return count;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a file can be processed with code-aware chunking
 *
 * @param filePath - Path to the file
 * @returns true if the file's language is supported
 */
export function supportsCodeAwareChunking(filePath: string): boolean {
  return detectLanguage(filePath) !== 'unknown';
}

/**
 * Get the language name for a file path
 *
 * @param filePath - Path to the file
 * @returns Human-readable language name
 */
export function getLanguageName(filePath: string): string {
  const language = detectLanguage(filePath);
  return getLanguageDisplayName(language);
}

/**
 * Map of language identifiers to human-readable names
 */
const LANGUAGE_DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  // Tier 1
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  csharp: 'C#',
  c: 'C',
  cpp: 'C++',
  kotlin: 'Kotlin',
  swift: 'Swift',
  // Tier 2
  ruby: 'Ruby',
  php: 'PHP',
  scala: 'Scala',
  shell: 'Shell',
  // Tier 3
  css: 'CSS',
  scss: 'SCSS',
  less: 'LESS',
  html: 'HTML',
  vue: 'Vue',
  svelte: 'Svelte',
  sql: 'SQL',
  yaml: 'YAML',
  json: 'JSON',
  xml: 'XML',
  graphql: 'GraphQL',
  // Tier 4
  terraform: 'Terraform',
  hcl: 'HCL',
  dockerfile: 'Dockerfile',
  // Unknown
  unknown: 'Unknown',
};

/**
 * Get the human-readable display name for a language
 *
 * @param language - Language identifier
 * @returns Human-readable name
 */
export function getLanguageDisplayName(language: SupportedLanguage): string {
  return LANGUAGE_DISPLAY_NAMES[language] || 'Unknown';
}

/**
 * Get a list of all supported languages
 *
 * @returns Array of supported language identifiers (excluding 'unknown')
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(LANGUAGE_DISPLAY_NAMES).filter(
    (lang) => lang !== 'unknown'
  ) as SupportedLanguage[];
}
