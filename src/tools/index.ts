/**
 * MCP Tool Handlers
 *
 * Exports all MCP tools:
 * - create_index: Create index for current project
 * - search_code: Semantic search (also exported as search_now)
 * - search_by_path: Find files by glob pattern
 * - get_index_status: Show index statistics
 * - reindex_project: Rebuild entire index
 * - reindex_file: Re-index single file
 * - delete_index: Remove project index
 */

// create_index tool - primary index creation
export {
  createIndex,
  createIndexTool,
  CreateIndexInputSchema,
  detectProject,
  indexExists,
  formatDuration,
  formatProgressMessage,
  getConfirmationMessage,
  type CreateIndexInput,
  type CreateIndexOutput,
  type CreateIndexStatus,
  type CreateIndexContext,
} from './createIndex.js';

// search_code tool - primary semantic search
export {
  searchCode,
  searchNow,
  searchCodeTool,
  searchNowTool,
  SearchCodeInputSchema,
  SearchNowInputSchema,
  type SearchCodeInput,
  type SearchCodeOutput,
  type SearchCodeResult,
  type ToolContext,
} from './searchCode.js';

// search_by_path tool - glob pattern file search
export {
  searchByPath,
  searchByPathTool,
  SearchByPathInputSchema,
  validateGlobPattern,
  matchPattern,
  type SearchByPathInput,
  type SearchByPathOutput,
} from './searchByPath.js';

// get_index_status tool - index statistics and diagnostics
export {
  getIndexStatus,
  getIndexStatusTool,
  GetIndexStatusInputSchema,
  formatStorageSize,
  collectStatus,
  type GetIndexStatusInput,
  type GetIndexStatusOutput,
  type IndexStatus,
} from './getIndexStatus.js';

// reindex_project tool - rebuild entire index
export {
  reindexProject,
  reindexProjectTool,
  ReindexProjectInputSchema,
  checkIndexExists,
  loadExistingConfig,
  deleteIndexData,
  getReindexConfirmationMessage,
  type ReindexProjectInput,
  type ReindexProjectOutput,
  type ReindexProjectStatus,
  type ReindexProjectContext,
} from './reindexProject.js';

// reindex_file tool - re-index single file
export {
  reindexFile,
  reindexFileTool,
  ReindexFileInputSchema,
  validateFilePath,
  type ReindexFileInput,
  type ReindexFileOutput,
  type ReindexFileStatus,
  type ValidationResult,
} from './reindexFile.js';

// delete_index tool - remove project index
export {
  deleteIndex,
  deleteIndexTool,
  DeleteIndexInputSchema,
  safeDeleteIndex,
  isPathSafeToDelete,
  checkIndexExistsForDelete,
  getDeleteConfirmationMessage,
  type DeleteIndexInput,
  type DeleteIndexOutput,
  type DeleteIndexStatus,
  type DeleteIndexContext,
} from './deleteIndex.js';

// search_docs tool - documentation semantic search
export {
  searchDocs,
  searchDocsTool,
  SearchDocsInputSchema,
  docsIndexNotFound,
  type SearchDocsInput,
  type SearchDocsOutput,
  type SearchDocsResult,
  type DocsToolContext,
} from './searchDocs.js';
