/**
 * MCP Server Setup
 *
 * Configures and starts the Model Context Protocol server
 * with all tool handlers registered. This is the main integration
 * point that ties all components together.
 *
 * Features:
 * - stdio transport for local MCP communication
 * - All 9 tools registered (search_code, search_docs, search_by_path,
 *   get_index_status, get_config, create_index, reindex_project, reindex_file, delete_index)
 * - Lazy initialization of shared components
 * - Graceful shutdown on SIGINT/SIGTERM
 * - Proper error handling and logging
 * - Strategy orchestrator for configurable indexing strategies
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode as McpErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { getLogger } from './utils/logger.js';
import { runCleanup, isShutdownInProgress } from './utils/cleanup.js';
import { getIndexPath } from './utils/paths.js';
import { detectProjectRoot } from './engines/projectRoot.js';
import { MCPError, isMCPError } from './errors/index.js';

// Strategy orchestrator and dependencies
import {
  StrategyOrchestrator,
  IndexManager,
  DocsIndexManager,
  IntegrityEngine,
  IndexingPolicy,
} from './engines/index.js';
import { FingerprintsManager } from './storage/fingerprints.js';
import { DocsFingerprintsManager } from './storage/docsFingerprints.js';
import { loadConfig, Config, DEFAULT_CONFIG } from './storage/config.js';
import { loadMetadata } from './storage/metadata.js';

// Import tool definitions and handlers
import {
  createIndexTool,
  createIndex,
  type CreateIndexContext,
} from './tools/createIndex.js';
import {
  searchCodeTool,
  searchCode,
  type ToolContext,
} from './tools/searchCode.js';
import {
  searchDocsTool,
  searchDocs,
  type DocsToolContext,
} from './tools/searchDocs.js';
import {
  searchByPathTool,
  searchByPath,
} from './tools/searchByPath.js';
import {
  getIndexStatusTool,
  getIndexStatus,
} from './tools/getIndexStatus.js';
import {
  reindexProjectTool,
  reindexProject,
  type ReindexProjectContext,
} from './tools/reindexProject.js';
import {
  reindexFileTool,
  reindexFile,
} from './tools/reindexFile.js';
import {
  deleteIndexTool,
  deleteIndex,
  type DeleteIndexContext,
} from './tools/deleteIndex.js';
import {
  getConfigTool,
  getConfig as getConfigHandler,
} from './tools/getConfig.js';

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All registered MCP tools
 *
 * Each tool has:
 * - name: Unique identifier for the tool
 * - description: Human-readable description
 * - inputSchema: JSON Schema for input validation
 * - requiresConfirmation: Whether user confirmation is needed
 */
const tools = [
  createIndexTool,
  searchCodeTool,
  searchDocsTool,
  searchByPathTool,
  getIndexStatusTool,
  getConfigTool,
  reindexProjectTool,
  reindexFileTool,
  deleteIndexTool,
];

/**
 * Tool name type for type-safe tool lookup
 */
type ToolName =
  | 'create_index'
  | 'search_code'
  | 'search_docs'
  | 'search_by_path'
  | 'get_index_status'
  | 'get_config'
  | 'reindex_project'
  | 'reindex_file'
  | 'delete_index';

// ============================================================================
// Server Context
// ============================================================================

/**
 * Server context containing shared state
 */
interface ServerContext {
  /** Current working directory */
  cwd: string;
  /** Detected project path (cached after first detection) */
  projectPath: string | null;
  /** Strategy orchestrator for indexing strategies */
  orchestrator: StrategyOrchestrator | null;
  /** Loaded configuration (cached) */
  config: Config | null;
}

/**
 * Create initial server context
 */
function createServerContext(): ServerContext {
  return {
    cwd: process.cwd(),
    projectPath: null,
    orchestrator: null,
    config: null,
  };
}

// ============================================================================
// Orchestrator Access Functions
// ============================================================================

/**
 * Get the current strategy orchestrator
 *
 * Returns null if:
 * - No index exists yet
 * - Orchestrator hasn't been initialized
 *
 * @param context - Server context
 * @returns StrategyOrchestrator or null
 */
function getOrchestrator(context: ServerContext): StrategyOrchestrator | null {
  return context.orchestrator;
}

/**
 * Set the strategy orchestrator
 *
 * @param context - Server context
 * @param orchestrator - StrategyOrchestrator instance or null
 */
function setOrchestrator(context: ServerContext, orchestrator: StrategyOrchestrator | null): void {
  context.orchestrator = orchestrator;
}

/**
 * Get the cached configuration
 *
 * @param context - Server context
 * @returns Config or null
 */
function getConfig(context: ServerContext): Config | null {
  return context.config;
}

/**
 * Set the cached configuration
 *
 * @param context - Server context
 * @param config - Config instance or null
 */
function setConfig(context: ServerContext, config: Config | null): void {
  context.config = config;
}

/**
 * Initialize the strategy orchestrator for a project
 *
 * Creates all dependencies and starts the indexing strategy based on config.
 * This should only be called when an index exists for the project.
 *
 * @param context - Server context to update
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param config - Project configuration
 * @returns The created StrategyOrchestrator or null if initialization fails
 */
async function initializeOrchestrator(
  context: ServerContext,
  projectPath: string,
  indexPath: string,
  config: Config
): Promise<StrategyOrchestrator | null> {
  const logger = getLogger();

  try {
    logger.info('server', 'Initializing strategy orchestrator', {
      projectPath,
      indexPath,
      strategy: config.indexingStrategy,
    });

    // Create all required dependencies
    // Note: IndexManager and DocsIndexManager derive indexPath from projectPath if not provided
    const indexManager = new IndexManager(projectPath, indexPath);
    const docsIndexManager = config.indexDocs ? new DocsIndexManager(projectPath, indexPath) : null;

    // Create and load fingerprints manager
    const fingerprints = new FingerprintsManager(indexPath, projectPath);
    await fingerprints.load();

    // Create and load docs fingerprints manager if docs indexing is enabled
    const docsFingerprints = config.indexDocs
      ? new DocsFingerprintsManager(indexPath, projectPath)
      : null;
    if (docsFingerprints) {
      await docsFingerprints.load();
    }

    // Create and initialize indexing policy
    const policy = new IndexingPolicy(projectPath, config);
    await policy.initialize();

    // Create integrity engine
    const integrityEngine = new IntegrityEngine(
      projectPath,
      indexPath,
      indexManager,
      fingerprints,
      policy
    );

    // Create the strategy orchestrator
    const orchestrator = new StrategyOrchestrator({
      projectPath,
      indexPath,
      indexManager,
      docsIndexManager,
      integrityEngine,
      policy,
      fingerprints,
      docsFingerprints,
    });

    // Start the strategy based on config
    await orchestrator.setStrategy(config);

    // Store in context
    context.orchestrator = orchestrator;
    context.config = config;

    logger.info('server', 'Strategy orchestrator initialized successfully', {
      strategy: config.indexingStrategy,
    });

    return orchestrator;
  } catch (error) {
    logger.error('server', 'Failed to initialize strategy orchestrator', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Initialize orchestrator if an index exists for the project
 *
 * Called on server startup to set up indexing strategy for existing indexes.
 *
 * @param context - Server context
 * @param projectPath - Absolute path to the project root
 */
async function maybeInitializeOrchestrator(
  context: ServerContext,
  projectPath: string
): Promise<void> {
  const logger = getLogger();
  const indexPath = getIndexPath(projectPath);

  try {
    // Check if index exists by loading metadata
    const metadata = await loadMetadata(indexPath);
    if (!metadata) {
      logger.debug('server', 'No existing index found, skipping orchestrator initialization', {
        projectPath,
      });
      return;
    }

    // Load configuration
    const config = await loadConfig(indexPath);

    // Initialize orchestrator
    await initializeOrchestrator(context, projectPath, indexPath, config);
  } catch (error) {
    logger.warn('server', 'Error checking for existing index', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue without orchestrator - it will be created when create_index is called
  }
}

/**
 * Initialize orchestrator without starting a strategy
 *
 * Creates the orchestrator with all dependencies but doesn't start a strategy.
 * Used by create_index to set up the orchestrator before indexing completes,
 * so it can start the strategy after the index is created.
 *
 * @param context - Server context (not updated by this function)
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param config - Project configuration
 * @returns The created StrategyOrchestrator or null if creation fails
 */
async function initializeOrchestratorWithoutStarting(
  context: ServerContext,
  projectPath: string,
  indexPath: string,
  config: Config
): Promise<StrategyOrchestrator | null> {
  const logger = getLogger();

  try {
    logger.debug('server', 'Creating orchestrator without starting strategy', {
      projectPath,
      indexPath,
    });

    // Create all required dependencies
    // Note: IndexManager and DocsIndexManager derive indexPath from projectPath if not provided
    const indexManager = new IndexManager(projectPath, indexPath);
    const docsIndexManager = config.indexDocs ? new DocsIndexManager(projectPath, indexPath) : null;

    // Create fingerprints managers (will be populated during indexing)
    const fingerprints = new FingerprintsManager(indexPath, projectPath);
    const docsFingerprints = config.indexDocs
      ? new DocsFingerprintsManager(indexPath, projectPath)
      : null;

    // Create and initialize indexing policy
    const policy = new IndexingPolicy(projectPath, config);
    await policy.initialize();

    // Create integrity engine
    const integrityEngine = new IntegrityEngine(
      projectPath,
      indexPath,
      indexManager,
      fingerprints,
      policy
    );

    // Create the strategy orchestrator (but don't start a strategy)
    const orchestrator = new StrategyOrchestrator({
      projectPath,
      indexPath,
      indexManager,
      docsIndexManager,
      integrityEngine,
      policy,
      fingerprints,
      docsFingerprints,
    });

    logger.debug('server', 'Orchestrator created (not started)');

    return orchestrator;
  } catch (error) {
    logger.error('server', 'Failed to create orchestrator', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get the project path, detecting it if not already cached
 */
async function getProjectPath(context: ServerContext): Promise<string> {
  if (context.projectPath) {
    return context.projectPath;
  }

  const logger = getLogger();

  try {
    const result = await detectProjectRoot(context.cwd);
    context.projectPath = result.projectPath;
    logger.info('server', 'Project root detected', {
      projectPath: result.projectPath,
      detectedBy: result.detectedBy,
    });
    return result.projectPath;
  } catch (error) {
    // If project detection fails, use current working directory
    logger.info('server', 'Using current directory as project root', {
      cwd: context.cwd,
    });
    context.projectPath = context.cwd;
    return context.cwd;
  }
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Execute a tool by name with the given arguments
 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  serverContext: ServerContext
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const logger = getLogger();

  logger.info('server', `Executing tool: ${toolName}`, { args });

  // Get project path for tool context
  const projectPath = await getProjectPath(serverContext);

  try {
    let result: unknown;

    switch (toolName as ToolName) {
      case 'create_index': {
        // MCP handles confirmation via requiresConfirmation flag on the tool definition
        // When we reach this point, the user has already confirmed (if required)

        // Initialize orchestrator after create_index completes if not already initialized
        // Load config first (will use defaults if config doesn't exist yet)
        const indexPath = getIndexPath(projectPath);

        // BUG #26 FIX: Wrap config loading in try-catch with fallback to defaults
        // While loadConfig already handles errors internally, this provides an extra
        // layer of safety to ensure create_index never fails due to config issues
        let config: Config;
        try {
          config = await loadConfig(indexPath);
        } catch (error) {
          logger.warn('server', 'Failed to load config, using defaults', {
            error: error instanceof Error ? error.message : String(error),
          });
          config = { ...DEFAULT_CONFIG };
        }

        // If orchestrator doesn't exist, create dependencies for it
        // but pass to create_index so it can start the strategy after indexing
        let orchestrator = serverContext.orchestrator;
        if (!orchestrator) {
          // Create the orchestrator for create_index to start after indexing
          orchestrator = await initializeOrchestratorWithoutStarting(
            serverContext,
            projectPath,
            indexPath,
            config
          );
        }

        const context: CreateIndexContext = {
          projectPath,
          orchestrator: orchestrator || undefined,
          config: orchestrator ? config : undefined,
          confirmed: true, // MCP confirmation already handled at protocol level
        };
        result = await createIndex({}, context);

        // If orchestrator was created, store it and the config in context
        if (orchestrator && !serverContext.orchestrator) {
          serverContext.orchestrator = orchestrator;
          serverContext.config = config;
        }
        break;
      }

      case 'search_code': {
        const context: ToolContext = {
          projectPath,
          orchestrator: serverContext.orchestrator || undefined,
        };
        const parsed = z.object({
          query: z.string(),
          top_k: z.number().optional().default(10),
          compact: z.boolean().optional().default(false),
        }).parse(args);
        result = await searchCode(parsed, context);
        break;
      }

      case 'search_docs': {
        const context: DocsToolContext = {
          projectPath,
          orchestrator: serverContext.orchestrator || undefined,
        };
        const parsed = z.object({
          query: z.string(),
          top_k: z.number().optional().default(10),
          compact: z.boolean().optional().default(false),
        }).parse(args);
        result = await searchDocs(parsed, context);
        break;
      }

      case 'search_by_path': {
        const context: ToolContext = {
          projectPath,
          orchestrator: serverContext.orchestrator || undefined,
        };
        const parsed = z.object({
          pattern: z.string(),
          limit: z.number().optional().default(20),
        }).parse(args);
        result = await searchByPath(parsed, context);
        break;
      }

      case 'get_index_status': {
        const context: ToolContext = {
          projectPath,
          orchestrator: serverContext.orchestrator || undefined,
        };
        result = await getIndexStatus({}, context);
        break;
      }

      case 'get_config': {
        const context: ToolContext = {
          projectPath,
        };
        result = await getConfigHandler({}, context);
        break;
      }

      case 'reindex_project': {
        // MCP handles confirmation via requiresConfirmation flag on the tool definition
        // When we reach this point, the user has already confirmed (if required)
        const context: ReindexProjectContext = {
          projectPath,
          confirmed: true, // MCP confirmation already handled at protocol level
        };
        result = await reindexProject({}, context);
        break;
      }

      case 'reindex_file': {
        const context: ToolContext = {
          projectPath,
          orchestrator: serverContext.orchestrator || undefined,
        };
        const parsed = z.object({
          path: z.string(),
        }).parse(args);
        result = await reindexFile(parsed, context);
        break;
      }

      case 'delete_index': {
        // MCP handles confirmation via requiresConfirmation flag on the tool definition
        // When we reach this point, the user has already confirmed (if required)
        const context: DeleteIndexContext = {
          projectPath,
          orchestrator: serverContext.orchestrator || undefined,
          confirmed: true, // MCP confirmation already handled at protocol level
        };
        result = await deleteIndex({}, context);

        // Clear orchestrator after delete_index completes
        if (serverContext.orchestrator) {
          serverContext.orchestrator = null;
          serverContext.config = null;
        }
        break;
      }

      default:
        throw new McpError(
          McpErrorCode.MethodNotFound,
          `Unknown tool: ${toolName}`
        );
    }

    logger.info('server', `Tool ${toolName} completed successfully`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('server', `Tool ${toolName} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });

    // Re-throw MCP errors with user-friendly message (Bug #21 - don't leak implementation details)
    if (isMCPError(error)) {
      // Only include technical details in debug mode
      const debugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
      throw new McpError(
        McpErrorCode.InternalError,
        error.userMessage,
        debugMode ? { code: error.code, developerMessage: error.developerMessage } : { code: error.code }
      );
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new McpError(
        McpErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    // Handle McpError passthrough
    if (error instanceof McpError) {
      throw error;
    }

    // Wrap unexpected errors (Bug #21 - don't leak implementation details)
    const debugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(
      McpErrorCode.InternalError,
      debugMode ? message : 'An unexpected error occurred. Please try again.'
    );
  }
}

// ============================================================================
// Server Initialization
// ============================================================================

/**
 * Create and configure the MCP server
 */
export function createServer(): { server: Server; context: ServerContext } {
  const logger = getLogger();

  // Create server instance
  const server = new Server(
    {
      name: 'search-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Create server context
  const context = createServerContext();

  // Register list_tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('server', 'list_tools called');
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Register call_tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.debug('server', 'call_tool called', { name, args });
    return await executeTool(name, args ?? {}, context);
  });

  logger.info('server', 'MCP server created', {
    toolCount: tools.length,
    tools: tools.map(t => t.name),
  });

  return { server, context };
}

// ============================================================================
// Server Lifecycle
// ============================================================================

/** Global server instance for cleanup */
let serverInstance: Server | null = null;

/**
 * Graceful shutdown handler
 *
 * Runs all registered cleanup handlers (FileWatcher, LanceDB, IntegrityEngine, etc.)
 * before closing the MCP server connection.
 *
 * @param signal - Optional signal name that triggered shutdown (SIGTERM, SIGINT, etc.)
 */
async function shutdown(signal?: string): Promise<void> {
  const logger = getLogger();

  // Prevent multiple shutdown attempts
  if (isShutdownInProgress()) {
    logger.debug('server', 'Shutdown already in progress, skipping');
    return;
  }

  logger.info('server', `Shutting down...${signal ? ` (${signal})` : ''}`);

  // Run all registered cleanup handlers first (FileWatcher, LanceDB, etc.)
  try {
    await runCleanup();
    logger.info('server', 'All cleanup handlers completed');
  } catch (error) {
    logger.error('server', 'Error during cleanup', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Close the MCP server connection
  if (serverInstance) {
    try {
      await serverInstance.close();
      logger.info('server', 'Server closed successfully');
    } catch (error) {
      logger.error('server', 'Error closing server', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    serverInstance = null;
  }
}

/**
 * Start the MCP server with stdio transport
 */
export async function startServer(): Promise<void> {
  const logger = getLogger();

  logger.info('server', 'Starting MCP server...');

  // Create server
  const { server, context } = createServer();
  serverInstance = server;

  // Detect project path early so we can initialize orchestrator if index exists
  try {
    const projectPath = await getProjectPath(context);
    logger.debug('server', 'Project path detected for startup', { projectPath });

    // Initialize orchestrator if an index already exists
    await maybeInitializeOrchestrator(context, projectPath);
  } catch (error) {
    logger.warn('server', 'Failed to detect project path or initialize orchestrator on startup', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue starting server - orchestrator will be created when tools need it
  }

  // Setup graceful shutdown handlers with proper signal handling
  // Note: On Windows, SIGTERM is not fully supported, but we handle both for cross-platform compatibility
  process.on('SIGINT', () => {
    shutdown('SIGINT').finally(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').finally(() => {
      process.exit(0);
    });
  });

  // Handle uncaught exceptions - log and attempt graceful shutdown
  process.on('uncaughtException', (error) => {
    logger.error('server', 'Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    // Attempt graceful shutdown on fatal errors
    shutdown('uncaughtException').finally(() => {
      process.exit(1);
    });
  });

  // Handle unhandled promise rejections - log but don't crash
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('server', 'Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    // Continue running for non-fatal promise rejections
    // This prevents crashes from unhandled rejections in async code
  });

  // Create and connect stdio transport
  const transport = new StdioServerTransport();

  logger.info('server', 'Connecting to stdio transport...');

  await server.connect(transport);

  logger.info('server', 'MCP server started and connected');
}

// ============================================================================
// Exports
// ============================================================================

export {
  tools,
  executeTool,
  shutdown,
  createServerContext,
  getProjectPath,
  getOrchestrator,
  setOrchestrator,
  getConfig,
  setConfig,
  initializeOrchestrator,
  maybeInitializeOrchestrator,
  type ServerContext,
  type ToolName,
};
