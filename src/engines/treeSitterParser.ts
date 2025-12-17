/**
 * Tree-sitter Parser Module
 *
 * Provides AST parsing capabilities using web-tree-sitter (WASM-based)
 * for cross-platform compatibility. Supports multiple programming languages
 * with lazy loading of language grammars.
 *
 * @module treeSitterParser
 */

import * as TreeSitter from 'web-tree-sitter';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../utils/logger.js';

// Re-export types for convenience
export type { Tree, Node, Language, TreeCursor, Query, QueryMatch, QueryCapture } from 'web-tree-sitter';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Supported programming languages for AST-based chunking
 */
export type ASTLanguage =
  | 'javascript'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'go'
  | 'java'
  | 'rust'
  | 'c'
  | 'cpp'
  | 'csharp';

/**
 * Language configuration for file extension mapping
 */
interface LanguageConfig {
  /** Language name for loading grammar */
  language: ASTLanguage;
  /** WASM file name */
  wasmFile: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * File extension to language mapping
 */
const EXTENSION_TO_LANGUAGE: Record<string, LanguageConfig> = {
  // JavaScript
  '.js': { language: 'javascript', wasmFile: 'tree-sitter-javascript.wasm' },
  '.mjs': { language: 'javascript', wasmFile: 'tree-sitter-javascript.wasm' },
  '.cjs': { language: 'javascript', wasmFile: 'tree-sitter-javascript.wasm' },
  '.jsx': { language: 'javascript', wasmFile: 'tree-sitter-javascript.wasm' },

  // TypeScript
  '.ts': { language: 'typescript', wasmFile: 'tree-sitter-typescript.wasm' },
  '.mts': { language: 'typescript', wasmFile: 'tree-sitter-typescript.wasm' },
  '.cts': { language: 'typescript', wasmFile: 'tree-sitter-typescript.wasm' },
  '.tsx': { language: 'tsx', wasmFile: 'tree-sitter-tsx.wasm' },

  // Python
  '.py': { language: 'python', wasmFile: 'tree-sitter-python.wasm' },
  '.pyw': { language: 'python', wasmFile: 'tree-sitter-python.wasm' },
  '.pyi': { language: 'python', wasmFile: 'tree-sitter-python.wasm' },

  // Go
  '.go': { language: 'go', wasmFile: 'tree-sitter-go.wasm' },

  // Java
  '.java': { language: 'java', wasmFile: 'tree-sitter-java.wasm' },

  // Rust
  '.rs': { language: 'rust', wasmFile: 'tree-sitter-rust.wasm' },

  // C
  '.c': { language: 'c', wasmFile: 'tree-sitter-c.wasm' },
  '.h': { language: 'c', wasmFile: 'tree-sitter-c.wasm' },

  // C++
  '.cpp': { language: 'cpp', wasmFile: 'tree-sitter-cpp.wasm' },
  '.cc': { language: 'cpp', wasmFile: 'tree-sitter-cpp.wasm' },
  '.cxx': { language: 'cpp', wasmFile: 'tree-sitter-cpp.wasm' },
  '.hpp': { language: 'cpp', wasmFile: 'tree-sitter-cpp.wasm' },
  '.hxx': { language: 'cpp', wasmFile: 'tree-sitter-cpp.wasm' },

  // C#
  '.cs': { language: 'csharp', wasmFile: 'tree-sitter-c_sharp.wasm' },
};

// ============================================================================
// TreeSitterParser Class
// ============================================================================

/**
 * Tree-sitter parser wrapper with lazy loading and caching
 *
 * Features:
 * - WASM-based parsing (cross-platform)
 * - Lazy loading of language grammars
 * - Language caching for performance
 * - Graceful error handling
 *
 * @example
 * ```typescript
 * const parser = TreeSitterParserWrapper.getInstance();
 * await parser.initialize();
 * const tree = await parser.parse(sourceCode, 'file.ts');
 * ```
 */
export class TreeSitterParser {
  private static instance: TreeSitterParser | null = null;
  private parser: TreeSitter.Parser | null = null;
  private languageCache: Map<ASTLanguage, TreeSitter.Language> = new Map();
  private initialized: boolean = false;
  private initializing: Promise<void> | null = null;
  private wasmBasePath: string | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of TreeSitterParser
   */
  static getInstance(): TreeSitterParser {
    if (!TreeSitterParser.instance) {
      TreeSitterParser.instance = new TreeSitterParser();
    }
    return TreeSitterParser.instance;
  }

  /**
   * Initialize the parser (must be called before parsing)
   *
   * This method is idempotent - calling it multiple times is safe.
   */
  async initialize(): Promise<void> {
    // Already initialized
    if (this.initialized) {
      return;
    }

    // Already initializing (concurrent call)
    if (this.initializing) {
      return this.initializing;
    }

    const logger = getLogger();

    this.initializing = (async () => {
      try {
        // Find the web-tree-sitter WASM file
        const wasmPath = await this.findWasmPath();
        if (!wasmPath) {
          throw new Error('Could not find web-tree-sitter WASM file');
        }

        logger.debug('treeSitterParser', 'Initializing web-tree-sitter', { wasmPath });

        // Initialize Parser with WASM location
        await TreeSitter.Parser.init({
          locateFile: (file: string) => {
            if (file === 'tree-sitter.wasm') {
              return wasmPath;
            }
            return file;
          },
        });

        this.parser = new TreeSitter.Parser();
        this.initialized = true;

        logger.info('treeSitterParser', 'Tree-sitter parser initialized successfully');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('treeSitterParser', 'Failed to initialize Tree-sitter', { error: message });
        throw error;
      }
    })();

    return this.initializing;
  }

  /**
   * Find the web-tree-sitter WASM file path
   */
  private async findWasmPath(): Promise<string | null> {
    const logger = getLogger();

    // Try to find the WASM file in node_modules
    const possiblePaths = [
      // Relative to current file (ES module)
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/web-tree-sitter/web-tree-sitter.wasm'),
      // From project root
      path.join(process.cwd(), 'node_modules/web-tree-sitter/web-tree-sitter.wasm'),
      // Global node_modules (npm link scenario)
      path.join(process.execPath, '../lib/node_modules/@liraz-sbz/search-mcp/node_modules/web-tree-sitter/web-tree-sitter.wasm'),
    ];

    for (const wasmPath of possiblePaths) {
      try {
        await fs.promises.access(wasmPath);
        logger.debug('treeSitterParser', 'Found WASM file', { path: wasmPath });
        return wasmPath;
      } catch {
        // File doesn't exist, try next path
      }
    }

    logger.warn('treeSitterParser', 'Could not find web-tree-sitter WASM file', { searchPaths: possiblePaths });
    return null;
  }

  /**
   * Find the tree-sitter-wasms base path
   */
  private async findWasmBasePath(): Promise<string | null> {
    if (this.wasmBasePath) {
      return this.wasmBasePath;
    }

    const logger = getLogger();

    const possiblePaths = [
      // Relative to current file (ES module)
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/tree-sitter-wasms/out'),
      // From project root
      path.join(process.cwd(), 'node_modules/tree-sitter-wasms/out'),
      // Global node_modules (npm link scenario)
      path.join(process.execPath, '../lib/node_modules/@liraz-sbz/search-mcp/node_modules/tree-sitter-wasms/out'),
    ];

    for (const basePath of possiblePaths) {
      try {
        await fs.promises.access(basePath);
        logger.debug('treeSitterParser', 'Found WASM base path', { path: basePath });
        this.wasmBasePath = basePath;
        return basePath;
      } catch {
        // Directory doesn't exist, try next path
      }
    }

    logger.warn('treeSitterParser', 'Could not find tree-sitter-wasms directory', { searchPaths: possiblePaths });
    return null;
  }

  /**
   * Load a language grammar
   *
   * @param language - Language to load
   * @returns Language grammar or null if not available
   */
  private async loadLanguage(language: ASTLanguage): Promise<TreeSitter.Language | null> {
    const logger = getLogger();

    // Check cache first
    const cached = this.languageCache.get(language);
    if (cached) {
      return cached;
    }

    // Find language config
    const config = Object.values(EXTENSION_TO_LANGUAGE).find((c) => c.language === language);
    if (!config) {
      logger.debug('treeSitterParser', 'No config for language', { language });
      return null;
    }

    // Find WASM base path
    const basePath = await this.findWasmBasePath();
    if (!basePath) {
      logger.warn('treeSitterParser', 'Cannot load language - no WASM base path');
      return null;
    }

    const wasmPath = path.join(basePath, config.wasmFile);

    try {
      // Check if WASM file exists
      await fs.promises.access(wasmPath);

      // Load the language
      const lang = await TreeSitter.Language.load(wasmPath);
      this.languageCache.set(language, lang);

      logger.debug('treeSitterParser', 'Loaded language grammar', { language, wasmPath });
      return lang;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('treeSitterParser', 'Failed to load language grammar', { language, wasmPath, error: message });
      return null;
    }
  }

  /**
   * Parse source code and return the AST
   *
   * @param sourceCode - Source code to parse
   * @param filePath - File path (used for language detection)
   * @returns Parsed tree or null if parsing failed
   */
  async parse(sourceCode: string, filePath: string): Promise<TreeSitter.Tree | null> {
    const logger = getLogger();

    if (!this.initialized || !this.parser) {
      logger.warn('treeSitterParser', 'Parser not initialized');
      return null;
    }

    // Detect language from file extension
    const ext = path.extname(filePath).toLowerCase();
    const config = EXTENSION_TO_LANGUAGE[ext];

    if (!config) {
      logger.debug('treeSitterParser', 'No language config for extension', { ext, filePath });
      return null;
    }

    // Load language grammar
    const language = await this.loadLanguage(config.language);
    if (!language) {
      return null;
    }

    try {
      // Set language and parse
      this.parser.setLanguage(language);
      const tree = this.parser.parse(sourceCode);

      if (!tree) {
        logger.warn('treeSitterParser', 'Parsing returned null', { filePath });
        return null;
      }

      return tree;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('treeSitterParser', 'Parsing failed', { filePath, error: message });
      return null;
    }
  }

  /**
   * Check if a file type is supported for AST parsing
   *
   * @param filePath - File path to check
   * @returns true if the file type is supported
   */
  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext in EXTENSION_TO_LANGUAGE;
  }

  /**
   * Get the language for a file path
   *
   * @param filePath - File path to check
   * @returns Language name or null if not supported
   */
  getLanguage(filePath: string): ASTLanguage | null {
    const ext = path.extname(filePath).toLowerCase();
    const config = EXTENSION_TO_LANGUAGE[ext];
    return config?.language ?? null;
  }

  /**
   * Get all supported file extensions
   *
   * @returns Array of supported file extensions
   */
  getSupportedExtensions(): string[] {
    return Object.keys(EXTENSION_TO_LANGUAGE);
  }

  /**
   * Get all supported languages
   *
   * @returns Array of supported language names
   */
  getSupportedLanguages(): ASTLanguage[] {
    const languages = new Set<ASTLanguage>();
    for (const config of Object.values(EXTENSION_TO_LANGUAGE)) {
      languages.add(config.language);
    }
    return Array.from(languages);
  }

  /**
   * Check if the parser is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.parser) {
      this.parser.delete();
      this.parser = null;
    }
    this.languageCache.clear();
    this.initialized = false;
    this.initializing = null;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the Tree-sitter parser instance
 *
 * @returns TreeSitterParser singleton instance
 */
export function getTreeSitterParser(): TreeSitterParser {
  return TreeSitterParser.getInstance();
}

/**
 * Check if AST-based chunking is supported for a file
 *
 * @param filePath - File path to check
 * @returns true if AST chunking is supported
 */
export function supportsASTChunking(filePath: string): boolean {
  return TreeSitterParser.getInstance().isSupported(filePath);
}

/**
 * Get the AST language for a file path
 *
 * @param filePath - File path to check
 * @returns Language name or null if not supported
 */
export function getASTLanguage(filePath: string): ASTLanguage | null {
  return TreeSitterParser.getInstance().getLanguage(filePath);
}
