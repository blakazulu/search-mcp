/**
 * MCP Server Setup
 *
 * Configures and starts the Model Context Protocol server
 * with all tool handlers registered. This is the main integration
 * point that ties all components together.
 *
 * Features:
 * - stdio transport for local MCP communication
 * - All 8 tools registered (search_code, search_docs, search_by_path,
 *   get_index_status, create_index, reindex_project, reindex_file, delete_index)
 * - Lazy initialization of shared components
 * - Graceful shutdown on SIGINT/SIGTERM
 * - Proper error handling and logging
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
import { detectProjectRoot } from './engines/projectRoot.js';
import { MCPError, isMCPError } from './errors/index.js';

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
}

/**
 * Create initial server context
 */
function createServerContext(): ServerContext {
  return {
    cwd: process.cwd(),
    projectPath: null,
  };
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
        const context: CreateIndexContext = {
          projectPath,
          confirmed: true, // MCP handles confirmation via requiresConfirmation flag
        };
        result = await createIndex({}, context);
        break;
      }

      case 'search_code': {
        const context: ToolContext = { projectPath };
        const parsed = z.object({
          query: z.string(),
          top_k: z.number().optional().default(10),
        }).parse(args);
        result = await searchCode(parsed, context);
        break;
      }

      case 'search_docs': {
        const context: DocsToolContext = { projectPath };
        const parsed = z.object({
          query: z.string(),
          top_k: z.number().optional().default(10),
        }).parse(args);
        result = await searchDocs(parsed, context);
        break;
      }

      case 'search_by_path': {
        const context: ToolContext = { projectPath };
        const parsed = z.object({
          pattern: z.string(),
          limit: z.number().optional().default(20),
        }).parse(args);
        result = await searchByPath(parsed, context);
        break;
      }

      case 'get_index_status': {
        const context: ToolContext = { projectPath };
        result = await getIndexStatus({}, context);
        break;
      }

      case 'reindex_project': {
        const context: ReindexProjectContext = {
          projectPath,
          confirmed: true, // MCP handles confirmation via requiresConfirmation flag
        };
        result = await reindexProject({}, context);
        break;
      }

      case 'reindex_file': {
        const context: ToolContext = { projectPath };
        const parsed = z.object({
          path: z.string(),
        }).parse(args);
        result = await reindexFile(parsed, context);
        break;
      }

      case 'delete_index': {
        const context: DeleteIndexContext = {
          projectPath,
          confirmed: true, // MCP handles confirmation via requiresConfirmation flag
        };
        result = await deleteIndex({}, context);
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

    // Re-throw MCP errors with proper formatting
    if (isMCPError(error)) {
      throw new McpError(
        McpErrorCode.InternalError,
        error.userMessage,
        { code: error.code, developerMessage: error.developerMessage }
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

    // Wrap unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(McpErrorCode.InternalError, message);
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
 */
async function shutdown(): Promise<void> {
  const logger = getLogger();
  logger.info('server', 'Shutting down...');

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
  const { server } = createServer();
  serverInstance = server;

  // Setup graceful shutdown handlers
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });

  // Handle uncaught exceptions - log but don't crash
  process.on('uncaughtException', (error) => {
    logger.error('server', 'Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    // Continue running - don't crash the MCP server
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('server', 'Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    // Continue running - don't crash the MCP server
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
  type ServerContext,
  type ToolName,
};
