/**
 * Model Compatibility Module (SMCP-074)
 *
 * Provides migration detection for embedding model changes.
 * When the embedding model changes between versions, existing indexes
 * need to be rebuilt to use the new model's embeddings.
 *
 * This module checks if the stored model metadata matches the current
 * model configuration and provides helpful error messages when a
 * mismatch is detected.
 */

import {
  CODE_MODEL_NAME,
  CODE_EMBEDDING_DIMENSION,
  DOCS_MODEL_NAME,
  DOCS_EMBEDDING_DIMENSION,
} from '../engines/embedding.js';
import type { EmbeddingModelInfo } from '../storage/metadata.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of model compatibility check
 */
export interface ModelCompatibilityResult {
  /** Whether the models are compatible */
  compatible: boolean;
  /** Code model compatibility */
  codeModelMatch: boolean;
  /** Docs model compatibility */
  docsModelMatch: boolean;
  /** Detailed message if incompatible */
  message?: string;
}

/**
 * Model information for display
 */
export interface ModelDisplayInfo {
  codeModelName: string | null;
  codeModelDimension: number | null;
  docsModelName: string | null;
  docsModelDimension: number | null;
}

// ============================================================================
// Compatibility Check Functions
// ============================================================================

/**
 * Get the current model configuration
 *
 * @returns Current model configuration used by the application
 */
export function getCurrentModelConfig(): ModelDisplayInfo {
  return {
    codeModelName: CODE_MODEL_NAME,
    codeModelDimension: CODE_EMBEDDING_DIMENSION,
    docsModelName: DOCS_MODEL_NAME,
    docsModelDimension: DOCS_EMBEDDING_DIMENSION,
  };
}

/**
 * Check if the stored model metadata is compatible with current models
 *
 * @param storedModels - Embedding model info from index metadata (may be null for legacy indexes)
 * @returns Compatibility result with details
 */
export function checkModelCompatibility(
  storedModels: EmbeddingModelInfo | null | undefined
): ModelCompatibilityResult {
  // Legacy indexes (no model info stored) are considered incompatible
  // They were created with the old MiniLM model
  if (!storedModels) {
    return {
      compatible: false,
      codeModelMatch: false,
      docsModelMatch: false,
      message: buildMigrationMessage(
        {
          codeModelName: 'Xenova/all-MiniLM-L6-v2',
          codeModelDimension: 384,
          docsModelName: 'Xenova/all-MiniLM-L6-v2',
          docsModelDimension: 384,
        },
        getCurrentModelConfig()
      ),
    };
  }

  // Check code model compatibility
  const codeModelMatch =
    storedModels.codeModelName === CODE_MODEL_NAME &&
    storedModels.codeModelDimension === CODE_EMBEDDING_DIMENSION;

  // Check docs model compatibility
  const docsModelMatch =
    storedModels.docsModelName === DOCS_MODEL_NAME &&
    storedModels.docsModelDimension === DOCS_EMBEDDING_DIMENSION;

  const compatible = codeModelMatch && docsModelMatch;

  if (!compatible) {
    return {
      compatible: false,
      codeModelMatch,
      docsModelMatch,
      message: buildMigrationMessage(
        {
          codeModelName: storedModels.codeModelName ?? 'unknown',
          codeModelDimension: storedModels.codeModelDimension ?? 0,
          docsModelName: storedModels.docsModelName ?? 'unknown',
          docsModelDimension: storedModels.docsModelDimension ?? 0,
        },
        getCurrentModelConfig()
      ),
    };
  }

  return {
    compatible: true,
    codeModelMatch: true,
    docsModelMatch: true,
  };
}

/**
 * Check only code model compatibility (for search_code)
 *
 * @param storedModels - Embedding model info from index metadata
 * @returns Compatibility result for code model only
 */
export function checkCodeModelCompatibility(
  storedModels: EmbeddingModelInfo | null | undefined
): ModelCompatibilityResult {
  // Legacy indexes are incompatible
  if (!storedModels || !storedModels.codeModelName) {
    return {
      compatible: false,
      codeModelMatch: false,
      docsModelMatch: true, // N/A for this check
      message: buildCodeMigrationMessage(
        'Xenova/all-MiniLM-L6-v2',
        384,
        CODE_MODEL_NAME,
        CODE_EMBEDDING_DIMENSION
      ),
    };
  }

  const codeModelMatch =
    storedModels.codeModelName === CODE_MODEL_NAME &&
    storedModels.codeModelDimension === CODE_EMBEDDING_DIMENSION;

  if (!codeModelMatch) {
    return {
      compatible: false,
      codeModelMatch: false,
      docsModelMatch: true,
      message: buildCodeMigrationMessage(
        storedModels.codeModelName,
        storedModels.codeModelDimension ?? 0,
        CODE_MODEL_NAME,
        CODE_EMBEDDING_DIMENSION
      ),
    };
  }

  return {
    compatible: true,
    codeModelMatch: true,
    docsModelMatch: true,
  };
}

/**
 * Check only docs model compatibility (for search_docs)
 *
 * @param storedModels - Embedding model info from index metadata
 * @returns Compatibility result for docs model only
 */
export function checkDocsModelCompatibility(
  storedModels: EmbeddingModelInfo | null | undefined
): ModelCompatibilityResult {
  // Legacy indexes are incompatible
  if (!storedModels || !storedModels.docsModelName) {
    return {
      compatible: false,
      codeModelMatch: true, // N/A for this check
      docsModelMatch: false,
      message: buildDocsMigrationMessage(
        'Xenova/all-MiniLM-L6-v2',
        384,
        DOCS_MODEL_NAME,
        DOCS_EMBEDDING_DIMENSION
      ),
    };
  }

  const docsModelMatch =
    storedModels.docsModelName === DOCS_MODEL_NAME &&
    storedModels.docsModelDimension === DOCS_EMBEDDING_DIMENSION;

  if (!docsModelMatch) {
    return {
      compatible: false,
      codeModelMatch: true,
      docsModelMatch: false,
      message: buildDocsMigrationMessage(
        storedModels.docsModelName,
        storedModels.docsModelDimension ?? 0,
        DOCS_MODEL_NAME,
        DOCS_EMBEDDING_DIMENSION
      ),
    };
  }

  return {
    compatible: true,
    codeModelMatch: true,
    docsModelMatch: true,
  };
}

// ============================================================================
// Message Builders
// ============================================================================

/**
 * Build full migration error message
 */
function buildMigrationMessage(
  stored: ModelDisplayInfo,
  current: ModelDisplayInfo
): string {
  return `Index model mismatch detected.

Your index was created with:
  Code: ${stored.codeModelName} (${stored.codeModelDimension} dims)
  Docs: ${stored.docsModelName} (${stored.docsModelDimension} dims)

Current version uses:
  Code: ${current.codeModelName} (${current.codeModelDimension} dims)
  Docs: ${current.docsModelName} (${current.docsModelDimension} dims)

Please run \`reindex_project\` to rebuild your index with the new models.
This will improve search quality by ~10-13%.`;
}

/**
 * Build code model migration error message
 */
function buildCodeMigrationMessage(
  storedName: string,
  storedDim: number,
  currentName: string,
  currentDim: number
): string {
  return `Code index model mismatch detected.

Your code index was created with: ${storedName} (${storedDim} dims)
Current version uses: ${currentName} (${currentDim} dims)

Please run \`reindex_project\` to rebuild your index with the new model.
This will improve code search quality by ~10-13%.`;
}

/**
 * Build docs model migration error message
 */
function buildDocsMigrationMessage(
  storedName: string,
  storedDim: number,
  currentName: string,
  currentDim: number
): string {
  return `Documentation index model mismatch detected.

Your docs index was created with: ${storedName} (${storedDim} dims)
Current version uses: ${currentName} (${currentDim} dims)

Please run \`reindex_project\` to rebuild your index with the new model.
This will improve documentation search quality by ~10-13%.`;
}

/**
 * Build warning message for get_index_status (non-blocking)
 */
export function buildStatusWarning(
  storedModels: EmbeddingModelInfo | null | undefined
): string | undefined {
  const result = checkModelCompatibility(storedModels);

  if (result.compatible) {
    return undefined;
  }

  const parts: string[] = [];

  if (!result.codeModelMatch) {
    parts.push('code');
  }
  if (!result.docsModelMatch) {
    parts.push('docs');
  }

  const modelTypes = parts.join(' and ');
  return `Warning: Index uses outdated ${modelTypes} embedding model(s). Run \`reindex_project\` to upgrade and improve search quality by ~10-13%.`;
}
