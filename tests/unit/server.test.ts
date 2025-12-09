/**
 * MCP Server Unit Tests
 *
 * Tests cover:
 * - Server creation and initialization
 * - Tool registration (all 8 tools)
 * - list_tools handler
 * - call_tool handler routing
 * - Error handling
 * - Server context management
 * - Shutdown handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Create a mock tensor output that mimics @xenova/transformers output
 */
function createMockTensorOutput(dimension: number = 384): { data: Float32Array } {
  const data = new Float32Array(dimension);
  for (let i = 0; i < dimension; i++) {
    data[i] = Math.random() * 0.1 - 0.05;
  }
  // Normalize the vector
  const magnitude = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0));
  for (let i = 0; i < dimension; i++) {
    data[i] = data[i] / magnitude;
  }
  return { data };
}

/**
 * Mock pipeline function
 */
const mockPipelineInstance = vi.fn();
const mockPipeline = vi.fn();

// Mock the @xenova/transformers module
vi.mock('@xenova/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args),
}));

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a temporary directory for test databases
 */
function createTempDir(): string {
  const tempBase = path.join(os.tmpdir(), 'search-mcp-test');
  if (!fs.existsSync(tempBase)) {
    fs.mkdirSync(tempBase, { recursive: true });
  }
  const tempDir = path.join(tempBase, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temporary directory
 */
function cleanupTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('MCP Server', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup default mock behavior
    mockPipelineInstance.mockResolvedValue(createMockTensorOutput());
    mockPipeline.mockResolvedValue(mockPipelineInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Server Creation Tests
  // --------------------------------------------------------------------------

  describe('createServer', () => {
    it('should create a server instance', async () => {
      const { createServer } = await import('../../src/server.js');

      const { server, context } = createServer();

      expect(server).toBeDefined();
      expect(context).toBeDefined();
    });

    it('should initialize server context with cwd', async () => {
      const { createServer } = await import('../../src/server.js');

      const { context } = createServer();

      expect(context.cwd).toBe(process.cwd());
      expect(context.projectPath).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Tool Registry Tests
  // --------------------------------------------------------------------------

  describe('tools registry', () => {
    it('should export all 8 tools', async () => {
      const { tools } = await import('../../src/server.js');

      expect(tools).toHaveLength(8);
    });

    it('should include create_index tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'create_index');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
    });

    it('should include search_code tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'search_code');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
    });

    it('should include search_docs tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'search_docs');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
    });

    it('should include search_by_path tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'search_by_path');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
    });

    it('should include get_index_status tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'get_index_status');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
    });

    it('should include reindex_project tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'reindex_project');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
    });

    it('should include reindex_file tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'reindex_file');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
    });

    it('should include delete_index tool', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'delete_index');
      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
    });

    it('should have correct tool names', async () => {
      const { tools } = await import('../../src/server.js');

      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('create_index');
      expect(toolNames).toContain('search_code');
      expect(toolNames).toContain('search_docs');
      expect(toolNames).toContain('search_by_path');
      expect(toolNames).toContain('get_index_status');
      expect(toolNames).toContain('reindex_project');
      expect(toolNames).toContain('reindex_file');
      expect(toolNames).toContain('delete_index');
    });
  });

  // --------------------------------------------------------------------------
  // Server Context Tests
  // --------------------------------------------------------------------------

  describe('createServerContext', () => {
    it('should create context with current working directory', async () => {
      const { createServerContext } = await import('../../src/server.js');

      const context = createServerContext();

      expect(context.cwd).toBe(process.cwd());
      expect(context.projectPath).toBeNull();
    });
  });

  describe('getProjectPath', () => {
    it('should detect project path from cwd', async () => {
      const { getProjectPath, createServerContext } = await import('../../src/server.js');

      const context = createServerContext();
      const projectPath = await getProjectPath(context);

      // Should return a valid path
      expect(projectPath).toBeDefined();
      expect(typeof projectPath).toBe('string');
      expect(projectPath.length).toBeGreaterThan(0);

      // Should cache the result
      expect(context.projectPath).toBe(projectPath);
    });

    it('should return cached project path on subsequent calls', async () => {
      const { getProjectPath, createServerContext } = await import('../../src/server.js');

      const context = createServerContext();
      const firstResult = await getProjectPath(context);
      const secondResult = await getProjectPath(context);

      expect(secondResult).toBe(firstResult);
    });

    it('should detect or fallback when no explicit project set', async () => {
      const { getProjectPath } = await import('../../src/server.js');

      // Create a temp dir with no project markers
      const tempDir = createTempDir();

      try {
        const context = {
          cwd: tempDir,
          projectPath: null,
        };

        const projectPath = await getProjectPath(context);

        // Should return some valid path and cache it
        // It may find a project root higher up in the hierarchy, or fallback to cwd
        expect(projectPath).toBeDefined();
        expect(typeof projectPath).toBe('string');
        expect(projectPath.length).toBeGreaterThan(0);
        expect(context.projectPath).toBe(projectPath);
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should use pre-set project path from context', async () => {
      const { getProjectPath } = await import('../../src/server.js');

      const tempDir = createTempDir();

      try {
        // Pre-set the project path in context
        const context = {
          cwd: tempDir,
          projectPath: tempDir, // Already set
        };

        const projectPath = await getProjectPath(context);

        // Should return the pre-set path without detection
        expect(projectPath).toBe(tempDir);
      } finally {
        cleanupTempDir(tempDir);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Tool Execution Tests
  // --------------------------------------------------------------------------

  describe('executeTool', () => {
    it('should throw McpError for unknown tool', async () => {
      const { executeTool, createServerContext } = await import('../../src/server.js');

      const context = createServerContext();

      await expect(
        executeTool('unknown_tool', {}, context)
      ).rejects.toMatchObject({
        code: -32601, // MethodNotFound
      });
    });

    it('should throw error for invalid parameters', async () => {
      const { executeTool, createServerContext } = await import('../../src/server.js');

      const context = createServerContext();

      // search_code requires 'query' parameter
      await expect(
        executeTool('search_code', {}, context)
      ).rejects.toMatchObject({
        code: -32602, // InvalidParams
      });
    });

    it('should execute get_index_status for project without index', async () => {
      const { executeTool } = await import('../../src/server.js');

      const tempDir = createTempDir();

      try {
        const context = {
          cwd: tempDir,
          projectPath: tempDir,
        };

        const result = await executeTool('get_index_status', {}, context);

        // Should return result with 'not_found' status
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe('not_found');
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should return formatted JSON response', async () => {
      const { executeTool } = await import('../../src/server.js');

      const tempDir = createTempDir();

      try {
        const context = {
          cwd: tempDir,
          projectPath: tempDir,
        };

        const result = await executeTool('get_index_status', {}, context);

        expect(result.content).toBeInstanceOf(Array);
        expect(result.content.length).toBe(1);
        expect(result.content[0].type).toBe('text');
        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      } finally {
        cleanupTempDir(tempDir);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Tool Input Schema Tests
  // --------------------------------------------------------------------------

  describe('tool input schemas', () => {
    it('should have valid JSON Schema for search_code', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'search_code');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();
      expect(tool?.inputSchema.properties.query).toBeDefined();
      expect(tool?.inputSchema.required).toContain('query');
    });

    it('should have valid JSON Schema for search_docs', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'search_docs');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();
      expect(tool?.inputSchema.properties.query).toBeDefined();
      expect(tool?.inputSchema.required).toContain('query');
    });

    it('should have valid JSON Schema for search_by_path', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'search_by_path');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();
      expect(tool?.inputSchema.properties.pattern).toBeDefined();
      expect(tool?.inputSchema.required).toContain('pattern');
    });

    it('should have valid JSON Schema for reindex_file', async () => {
      const { tools } = await import('../../src/server.js');

      const tool = tools.find(t => t.name === 'reindex_file');
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.properties).toBeDefined();
      expect(tool?.inputSchema.properties.path).toBeDefined();
      expect(tool?.inputSchema.required).toContain('path');
    });

    it('should have empty required array for tools without required params', async () => {
      const { tools } = await import('../../src/server.js');

      const createIndexTool = tools.find(t => t.name === 'create_index');
      const getIndexStatusTool = tools.find(t => t.name === 'get_index_status');
      const reindexProjectTool = tools.find(t => t.name === 'reindex_project');
      const deleteIndexTool = tools.find(t => t.name === 'delete_index');

      expect(createIndexTool?.inputSchema.required).toEqual([]);
      expect(getIndexStatusTool?.inputSchema.required).toEqual([]);
      expect(reindexProjectTool?.inputSchema.required).toEqual([]);
      expect(deleteIndexTool?.inputSchema.required).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Shutdown Tests
  // --------------------------------------------------------------------------

  describe('shutdown', () => {
    it('should be a function', async () => {
      const { shutdown } = await import('../../src/server.js');

      expect(typeof shutdown).toBe('function');
    });

    it('should complete without error when no server is running', async () => {
      const { shutdown } = await import('../../src/server.js');

      await expect(shutdown()).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Export Tests
  // --------------------------------------------------------------------------

  describe('exports', () => {
    it('should export tools array', async () => {
      const { tools } = await import('../../src/server.js');
      expect(Array.isArray(tools)).toBe(true);
    });

    it('should export executeTool function', async () => {
      const { executeTool } = await import('../../src/server.js');
      expect(typeof executeTool).toBe('function');
    });

    it('should export shutdown function', async () => {
      const { shutdown } = await import('../../src/server.js');
      expect(typeof shutdown).toBe('function');
    });

    it('should export createServerContext function', async () => {
      const { createServerContext } = await import('../../src/server.js');
      expect(typeof createServerContext).toBe('function');
    });

    it('should export getProjectPath function', async () => {
      const { getProjectPath } = await import('../../src/server.js');
      expect(typeof getProjectPath).toBe('function');
    });

    it('should export createServer function', async () => {
      const { createServer } = await import('../../src/server.js');
      expect(typeof createServer).toBe('function');
    });

    it('should export startServer function', async () => {
      const { startServer } = await import('../../src/server.js');
      expect(typeof startServer).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling Tests
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should convert MCPError to McpError', async () => {
      const { executeTool } = await import('../../src/server.js');

      const tempDir = createTempDir();

      try {
        const context = {
          cwd: tempDir,
          projectPath: tempDir,
        };

        // search_code will throw INDEX_NOT_FOUND for project without index
        await expect(
          executeTool('search_code', { query: 'test' }, context)
        ).rejects.toMatchObject({
          code: -32603, // InternalError
        });
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should handle Zod validation errors', async () => {
      const { executeTool, createServerContext } = await import('../../src/server.js');

      const context = createServerContext();

      // search_code with invalid type for query
      await expect(
        executeTool('search_code', { query: 123 }, context)
      ).rejects.toMatchObject({
        code: -32602, // InvalidParams
      });
    });
  });

  // --------------------------------------------------------------------------
  // Tool Response Format Tests
  // --------------------------------------------------------------------------

  describe('tool response format', () => {
    it('should return content array with text type', async () => {
      const { executeTool } = await import('../../src/server.js');

      const tempDir = createTempDir();

      try {
        const context = {
          cwd: tempDir,
          projectPath: tempDir,
        };

        const result = await executeTool('get_index_status', {}, context);

        expect(result.content).toBeInstanceOf(Array);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].type).toBe('text');
        expect(typeof result.content[0].text).toBe('string');
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should return valid JSON in text content', async () => {
      const { executeTool } = await import('../../src/server.js');

      const tempDir = createTempDir();

      try {
        const context = {
          cwd: tempDir,
          projectPath: tempDir,
        };

        const result = await executeTool('get_index_status', {}, context);
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
      } finally {
        cleanupTempDir(tempDir);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Confirmation Requirement Tests
  // --------------------------------------------------------------------------

  describe('confirmation requirements', () => {
    it('should mark destructive tools as requiring confirmation', async () => {
      const { tools } = await import('../../src/server.js');

      const destructiveTools = ['create_index', 'reindex_project', 'delete_index'];

      for (const toolName of destructiveTools) {
        const tool = tools.find(t => t.name === toolName);
        expect(tool?.requiresConfirmation).toBe(true);
      }
    });

    it('should mark read-only tools as not requiring confirmation', async () => {
      const { tools } = await import('../../src/server.js');

      const readOnlyTools = ['search_code', 'search_docs', 'search_by_path', 'get_index_status', 'reindex_file'];

      for (const toolName of readOnlyTools) {
        const tool = tools.find(t => t.name === toolName);
        expect(tool?.requiresConfirmation).toBe(false);
      }
    });
  });
});
