/**
 * get_config Tool
 *
 * MCP tool to retrieve the configuration for the current project's index.
 * Returns the config file path and its contents, allowing users to view
 * and locate their project's configuration.
 *
 * Features:
 * - Returns the full path to the config file
 * - Returns the current configuration contents
 * - Works even if index doesn't exist (returns path where config would be)
 */

import { z } from 'zod';
import { loadConfig, type Config } from '../storage/config.js';
import { getIndexPath, getConfigPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import type { ToolContext } from './searchCode.js';
import * as fs from 'node:fs';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for get_config tool (no required inputs)
 */
export const GetConfigInputSchema = z.object({});

/**
 * Inferred input type from schema
 */
export type GetConfigInput = z.infer<typeof GetConfigInputSchema>;

/**
 * Output structure for get_config tool
 */
export interface GetConfigOutput {
  /** Whether the config file exists */
  exists: boolean;
  /** Absolute path to the config file */
  configPath: string;
  /** Absolute path to the index directory */
  indexPath: string;
  /** Current configuration (if exists) */
  config?: Config;
  /** Message for the user */
  message: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Get configuration for the current project
 *
 * Returns the config file path and contents for the current project's index.
 * If no config exists, returns the path where it would be created.
 *
 * @param input - The input (empty object, uses project context)
 * @param context - Tool context containing the project path
 * @returns Config file information
 *
 * @example
 * ```typescript
 * const result = await getConfig(
 *   {},
 *   { projectPath: '/path/to/project' }
 * );
 *
 * console.log(result.configPath);  // '/Users/you/.mcp/search/indexes/abc123/config.json'
 * console.log(result.config);      // { include: ["**\/*"], exclude: [], ... }
 * ```
 */
export async function getConfig(
  input: GetConfigInput,
  context: ToolContext
): Promise<GetConfigOutput> {
  const logger = getLogger();

  logger.info('getConfig', 'Getting config', {
    projectPath: context.projectPath,
  });

  // Get the index and config paths for this project
  const indexPath = getIndexPath(context.projectPath);
  const configPath = getConfigPath(indexPath);

  // Check if config file exists
  let exists = false;
  try {
    await fs.promises.access(configPath);
    exists = true;
  } catch {
    exists = false;
  }

  // If config doesn't exist, return path info only
  if (!exists) {
    logger.debug('getConfig', 'Config file not found', { configPath });
    return {
      exists: false,
      configPath,
      indexPath,
      message: `No config file exists yet. Run 'create_index' first to generate a config file at: ${configPath}`,
    };
  }

  // Load the config
  const config = await loadConfig(indexPath);

  logger.debug('getConfig', 'Config loaded', {
    configPath,
    indexingStrategy: config.indexingStrategy,
  });

  return {
    exists: true,
    configPath,
    indexPath,
    config,
    message: `Config file location: ${configPath}\n\nYou can edit this file to customize indexing behavior. Changes take effect on next reindex.`,
  };
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for get_config
 *
 * This tool retrieves configuration information.
 * It does NOT require confirmation as it's a read-only operation.
 */
export const getConfigTool = {
  name: 'get_config',
  description:
    'Get the configuration file path and contents for the current project. Use this to find and view your project config.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  requiresConfirmation: false,
};
