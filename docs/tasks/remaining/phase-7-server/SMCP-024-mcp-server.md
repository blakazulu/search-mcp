---
task_id: "SMCP-024"
title: "MCP Server Setup"
category: "Technical"
priority: "P0"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "blakazulu"
tags: ["server", "mcp", "integration"]
---

# Task: MCP Server Setup

## Overview

Implement the MCP server entry point that ties all components together. Sets up the Model Context Protocol server using the official SDK, registers all 7 tools, handles JSON-RPC routing, and manages server lifecycle. This is the final integration task.

## Goals

- [ ] Initialize MCP server with stdio transport
- [ ] Register all 7 tools with proper schemas
- [ ] Handle JSON-RPC message routing
- [ ] Manage server lifecycle (startup, shutdown)

## Success Criteria

- Server starts and accepts MCP connections
- All 7 tools are discoverable via list_tools
- Tool invocations are routed correctly
- Server handles errors gracefully
- Clean shutdown on SIGINT/SIGTERM

## Dependencies

**Blocked by:**

- SMCP-017: search_now Tool
- SMCP-018: search_by_path Tool
- SMCP-019: get_index_status Tool
- SMCP-020: create_index Tool
- SMCP-021: reindex_project Tool
- SMCP-022: reindex_file Tool
- SMCP-023: delete_index Tool

**Blocks:**

- None (final task)

**Related:**

- All tool tasks

## Subtasks

### Phase 1: Server Initialization (1 hour)

- [ ] 1.1 Create server entry point
    ```typescript
    // src/index.ts
    import { Server } from '@modelcontextprotocol/sdk/server/index.js';
    import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

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
    ```

- [ ] 1.2 Set up stdio transport
    ```typescript
    const transport = new StdioServerTransport();
    await server.connect(transport);
    ```

- [ ] 1.3 Initialize shared components
    ```typescript
    // Initialize on startup:
    // - Logger (with default console output)
    // - Embedding engine (lazy load model)
    // - Project context (detect on first tool call)
    ```

### Phase 2: Tool Registration (1.5 hours)

- [ ] 2.1 Create tool registry
    ```typescript
    // src/server.ts
    import { createIndexTool } from './tools/createIndex.js';
    import { searchNowTool } from './tools/searchNow.js';
    import { searchByPathTool } from './tools/searchByPath.js';
    import { getIndexStatusTool } from './tools/getIndexStatus.js';
    import { reindexProjectTool } from './tools/reindexProject.js';
    import { reindexFileTool } from './tools/reindexFile.js';
    import { deleteIndexTool } from './tools/deleteIndex.js';

    const tools = [
      createIndexTool,
      searchNowTool,
      searchByPathTool,
      getIndexStatusTool,
      reindexProjectTool,
      reindexFileTool,
      deleteIndexTool,
    ];
    ```

- [ ] 2.2 Register list_tools handler
    ```typescript
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    });
    ```

- [ ] 2.3 Register call_tool handler
    ```typescript
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = tools.find(t => t.name === request.params.name);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
      return await tool.handler(request.params.arguments, context);
    });
    ```

### Phase 3: Context Management (0.5 hours)

- [ ] 3.1 Create tool context
    ```typescript
    interface ToolContext {
      cwd: string;           // Current working directory
      projectPath?: string;  // Detected project root
      indexPath?: string;    // Index storage path
      store?: LanceDBStore;
      indexManager?: IndexManager;
      fileWatcher?: FileWatcher;
    }

    function createContext(): ToolContext
    ```

- [ ] 3.2 Lazy initialization
    - Components initialized on first use
    - Reduces startup time
    - Handles missing index gracefully

### Phase 4: Lifecycle Management (0.5 hours)

- [ ] 4.1 Handle graceful shutdown
    ```typescript
    process.on('SIGINT', async () => {
      await shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await shutdown();
      process.exit(0);
    });

    async function shutdown(): Promise<void> {
      // Stop file watcher
      // Close LanceDB connection
      // Flush logs
    }
    ```

- [ ] 4.2 Handle uncaught errors
    ```typescript
    process.on('uncaughtException', (error) => {
      logger.error('server', 'Uncaught exception', { error });
      // Continue running - don't crash MCP server
    });
    ```

### Phase 5: Entry Point & Export (0.5 hours)

- [ ] 5.1 Create main entry point
    ```typescript
    // src/index.ts
    #!/usr/bin/env node
    import { startServer } from './server.js';

    startServer().catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
    ```

- [ ] 5.2 Configure package.json bin
    ```json
    {
      "bin": {
        "search-mcp": "./dist/index.js"
      }
    }
    ```

- [ ] 5.3 Test npx invocation
    ```bash
    npx @blakazulu/search-mcp
    ```

### Phase 6: Integration Testing (0.5 hours)

- [ ] 6.1 Write E2E tests
    - Test server startup
    - Test list_tools response
    - Test call_tool routing
    - Test error handling
    - Test shutdown

- [ ] 6.2 Manual testing with MCP client
    - Test with Claude Desktop
    - Test with Claude Code
    - Verify all 7 tools work

## Resources

- `docs/ENGINEERING.RFC.md` Section 2: System Architecture
- [MCP SDK Documentation](https://modelcontextprotocol.io/docs/sdk)
- `docs/mcp-development-guide.md`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Server starts with stdio transport
- [ ] All 7 tools registered and callable
- [ ] Error handling works correctly
- [ ] Graceful shutdown on signals
- [ ] Works with Claude Desktop
- [ ] E2E tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- This is the final integration task
- MCP SDK handles JSON-RPC protocol details
- stdio transport is standard for local MCP servers
- Lazy initialization improves startup time
- Graceful shutdown prevents data loss

## Blockers

_None yet_

## Related Tasks

- All 7 tool tasks (SMCP-017 to SMCP-023)
- SMCP-001: Project Setup (provides base config)
