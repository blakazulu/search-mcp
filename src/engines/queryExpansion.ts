/**
 * Query Expansion & Synonyms Module (SMCP-095)
 *
 * Implements query expansion with synonym mappings to improve search recall.
 * When users search for "auth", the query is expanded to include
 * "authentication authorize login session token".
 *
 * Inspired by mcp-vector-search's query expansion system with 59+ expansion rules.
 *
 * Features:
 * - 60+ expansion mappings organized by category
 * - Preserves original query terms (expansion, not replacement)
 * - Removes duplicate terms for efficiency
 * - Configurable enable/disable
 * - Low overhead (< 1ms per expansion)
 * - Bidirectional matching (abbreviation <-> full term)
 *
 * @module queryExpansion
 */

import { getLogger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for query expansion.
 */
export interface QueryExpansionConfig {
  /** Enable/disable query expansion (default: true) */
  enabled: boolean;
  /** Maximum number of expansion terms to add (default: 10) */
  maxExpansionTerms?: number;
  /** Custom expansion mappings (merged with defaults) */
  customExpansions?: Record<string, string>;
}

/**
 * Result of query expansion.
 */
export interface QueryExpansionResult {
  /** Original query */
  originalQuery: string;
  /** Expanded query with synonym terms added */
  expandedQuery: string;
  /** Terms that were expanded */
  expandedTerms: string[];
  /** Expansion mappings that were applied */
  appliedExpansions: string[];
  /** Time taken for expansion in milliseconds */
  expansionTimeMs: number;
}

// ============================================================================
// Default Expansion Mappings (60+ rules)
// ============================================================================

/**
 * Default query expansion mappings organized by category.
 *
 * Each key maps to space-separated expansion terms. When the key is found
 * in a query, the expansion terms are added to improve recall.
 *
 * Categories:
 * - Authentication & Security
 * - Database & Storage
 * - API & HTTP
 * - Async & Concurrency
 * - Errors & Exceptions
 * - Configuration & Settings
 * - Common Abbreviations
 * - Programming Concepts
 * - Testing
 * - Logging & Debugging
 * - File & I/O
 * - Networking
 */
export const DEFAULT_QUERY_EXPANSIONS: Record<string, string> = {
  // ========================================
  // Authentication & Security
  // ========================================
  auth: 'authentication authorize authorization login logout session token',
  authentication: 'auth authorize login session token',
  login: 'authentication auth signin sign-in session',
  logout: 'signout sign-out authentication session',
  oauth: 'oauth2 authentication authorization token',
  jwt: 'jsonwebtoken token authentication bearer',
  token: 'jwt bearer authentication session',
  password: 'pwd passwd credentials secret hash',
  credential: 'credentials password secret key',
  permission: 'permissions authorization access role',
  role: 'roles permission access rbac acl',
  security: 'auth authentication secure encryption',

  // ========================================
  // Database & Storage
  // ========================================
  db: 'database data storage query',
  database: 'db data storage query sql',
  sql: 'database query select insert update delete',
  query: 'sql database search find filter',
  mongo: 'mongodb database nosql document',
  mongodb: 'mongo database nosql document collection',
  postgres: 'postgresql database sql relational',
  postgresql: 'postgres database sql relational',
  mysql: 'database sql relational',
  redis: 'cache database key-value store',
  cache: 'redis caching store memory',
  orm: 'database model entity repository',
  prisma: 'orm database model schema',
  sequelize: 'orm database model query',
  typeorm: 'orm database entity repository',
  migration: 'database schema migrate',
  schema: 'database model structure definition',

  // ========================================
  // API & HTTP
  // ========================================
  api: 'endpoint route request response rest',
  endpoint: 'api route url path handler',
  route: 'router endpoint path url handler',
  http: 'https request response get post put delete',
  https: 'http request response secure ssl tls',
  rest: 'restful api endpoint request response',
  graphql: 'api query mutation schema resolver',
  grpc: 'rpc protocol service',
  websocket: 'socket ws realtime connection',
  request: 'req http fetch call',
  response: 'res http result reply',
  middleware: 'handler interceptor filter',
  controller: 'handler route endpoint',
  fetch: 'request http api call get',
  axios: 'http request fetch client',

  // ========================================
  // Async & Concurrency
  // ========================================
  async: 'asynchronous await promise',
  await: 'async promise asynchronous',
  promise: 'async await then catch',
  sync: 'synchronous blocking',
  callback: 'function handler async',
  concurrent: 'concurrency parallel async thread',
  parallel: 'concurrent async thread worker',
  thread: 'threading concurrent parallel worker',
  worker: 'thread background job task',

  // ========================================
  // Errors & Exceptions
  // ========================================
  err: 'error exception failure',
  error: 'err exception failure bug issue',
  exception: 'error catch throw try',
  catch: 'try exception error handle',
  throw: 'exception error raise',
  fail: 'failure error exception reject',
  failure: 'fail error exception reject',
  bug: 'error issue defect problem',
  fix: 'bug repair resolve patch',
  handle: 'handler process manage catch',
  validate: 'validation check verify assert',
  validation: 'validate check verify assertion',

  // ========================================
  // Configuration & Settings
  // ========================================
  config: 'configuration settings options setup',
  configuration: 'config settings options setup',
  settings: 'config configuration options preferences',
  options: 'config settings parameters arguments',
  env: 'environment variable dotenv',
  environment: 'env variable dotenv',
  setup: 'config configuration initialize init',
  param: 'parameter argument option',
  parameter: 'param argument option input',
  arg: 'argument parameter option input',
  argument: 'arg parameter option input',

  // ========================================
  // Common Abbreviations
  // ========================================
  util: 'utility helper utils',
  utils: 'utility helper util',
  utility: 'util utils helper',
  fn: 'function method',
  func: 'function method procedure',
  var: 'variable',
  impl: 'implementation implement',
  init: 'initialize initialization setup',
  msg: 'message',
  req: 'request',
  res: 'response result',
  ctx: 'context',
  src: 'source',
  dest: 'destination target',
  dir: 'directory folder path',
  tmp: 'temporary temp',
  temp: 'temporary tmp',
  str: 'string text',
  num: 'number integer',
  int: 'integer number',
  bool: 'boolean',
  obj: 'object',
  arr: 'array list',
  len: 'length size count',
  idx: 'index',
  ptr: 'pointer reference',
  ref: 'reference pointer',
  doc: 'document documentation',
  docs: 'documentation document',

  // ========================================
  // Programming Concepts
  // ========================================
  class: 'object type struct',
  object: 'class instance struct',
  method: 'function procedure',
  function: 'method procedure func fn',
  property: 'attribute field member',
  attribute: 'property field member',
  field: 'property attribute member',
  interface: 'type contract abstract',
  type: 'interface typedef definition',
  struct: 'structure class type record',
  enum: 'enumeration constant',
  import: 'require include module',
  export: 'module public expose',
  module: 'package library',
  package: 'module library dependency',
  return: 'result output yield',
  loop: 'iterate for while foreach',
  iterate: 'loop for while foreach',
  condition: 'if else branch switch',
  array: 'list collection vector',
  list: 'array collection',
  map: 'dictionary hash object',
  set: 'collection unique',
  string: 'text char',
  number: 'integer float numeric',
  boolean: 'bool true false',
  null: 'nil undefined none',
  undefined: 'null nil none',

  // ========================================
  // Testing
  // ========================================
  test: 'testing spec unittest',
  testing: 'test spec unittest',
  spec: 'test specification',
  mock: 'mocking stub fake spy',
  stub: 'mock fake spy',
  spy: 'mock stub fake',
  assert: 'assertion expect should',
  expect: 'assert assertion should',
  fixture: 'test data setup',
  unit: 'unittest test spec',
  integration: 'test integration-test',
  e2e: 'end-to-end test',

  // ========================================
  // Logging & Debugging
  // ========================================
  log: 'logging logger debug',
  logger: 'log logging debug',
  logging: 'log logger debug trace',
  debug: 'debugging log trace',
  trace: 'log debug tracking',
  print: 'output display log',
  console: 'log debug output',

  // ========================================
  // File & I/O
  // ========================================
  file: 'path filesystem fs',
  path: 'file directory folder',
  fs: 'filesystem file path',
  read: 'load get fetch',
  write: 'save store output',
  save: 'write store persist',
  load: 'read get fetch',
  parse: 'parsing parser analyze',
  serialize: 'serialization json stringify',
  deserialize: 'parse json',

  // ========================================
  // Networking
  // ========================================
  socket: 'websocket tcp connection',
  tcp: 'socket network connection',
  udp: 'network datagram',
  ip: 'address network',
  port: 'network socket listen',
  connect: 'connection socket network',
  connection: 'connect socket network',
  client: 'consumer connection',
  server: 'service backend host',
  host: 'server address url',
  url: 'uri address endpoint',
  uri: 'url address',
};

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration for query expansion.
 */
export const DEFAULT_EXPANSION_CONFIG: QueryExpansionConfig = {
  enabled: true,
  maxExpansionTerms: 10,
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Expand a query with synonym mappings.
 *
 * Takes a search query and adds related terms based on the expansion mappings.
 * The original query terms are preserved, and expansion terms are appended.
 * Duplicate terms are removed to avoid redundancy.
 *
 * @param query - The search query to expand
 * @param config - Optional configuration overrides
 * @returns The expanded query string
 *
 * @example
 * ```typescript
 * expandQuery('auth middleware')
 * // Returns: 'auth middleware authentication authorize authorization login logout session token'
 *
 * expandQuery('db query')
 * // Returns: 'db query database data storage sql'
 *
 * expandQuery('auth', { enabled: false })
 * // Returns: 'auth' (expansion disabled)
 * ```
 */
export function expandQuery(
  query: string,
  config: Partial<QueryExpansionConfig> = {}
): string {
  const result = expandQueryWithDetails(query, config);
  return result.expandedQuery;
}

/**
 * Expand a query and return detailed information about the expansion.
 *
 * This function provides full details about which terms were expanded
 * and which mappings were applied.
 *
 * @param query - The search query to expand
 * @param config - Optional configuration overrides
 * @returns QueryExpansionResult with expansion details
 *
 * @example
 * ```typescript
 * const result = expandQueryWithDetails('auth');
 * // result.expandedTerms: ['authentication', 'authorize', ...]
 * // result.appliedExpansions: ['auth']
 * // result.expansionTimeMs: 0.5
 * ```
 */
export function expandQueryWithDetails(
  query: string,
  config: Partial<QueryExpansionConfig> = {}
): QueryExpansionResult {
  const startTime = performance.now();
  const logger = getLogger();

  const effectiveConfig: QueryExpansionConfig = {
    ...DEFAULT_EXPANSION_CONFIG,
    ...config,
  };

  // Early return if disabled
  if (!effectiveConfig.enabled) {
    return {
      originalQuery: query,
      expandedQuery: query,
      expandedTerms: [],
      appliedExpansions: [],
      expansionTimeMs: 0,
    };
  }

  // Early return for empty or whitespace-only queries
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      originalQuery: query,
      expandedQuery: query,
      expandedTerms: [],
      appliedExpansions: [],
      expansionTimeMs: 0,
    };
  }

  // Merge custom expansions with defaults
  const expansions: Record<string, string> = {
    ...DEFAULT_QUERY_EXPANSIONS,
    ...(effectiveConfig.customExpansions || {}),
  };

  // Tokenize query and track original terms
  const queryLower = trimmedQuery.toLowerCase();
  const originalWords = queryLower.split(/\s+/);
  const originalWordSet = new Set(originalWords);

  // Track expansion results
  const appliedExpansions: string[] = [];
  const expandedTermsSet = new Set<string>();

  // Check each word for expansion
  for (const word of originalWords) {
    const expansion = expansions[word];
    if (expansion) {
      appliedExpansions.push(word);
      const expansionTerms = expansion.split(/\s+/);
      for (const term of expansionTerms) {
        // Don't add if it's already in the original query
        if (!originalWordSet.has(term)) {
          expandedTermsSet.add(term);
        }
      }
    }
  }

  // Limit expansion terms if configured
  let expandedTerms = Array.from(expandedTermsSet);
  if (effectiveConfig.maxExpansionTerms && expandedTerms.length > effectiveConfig.maxExpansionTerms) {
    expandedTerms = expandedTerms.slice(0, effectiveConfig.maxExpansionTerms);
  }

  // Build expanded query: original words + expansion terms
  const expandedQuery = expandedTerms.length > 0
    ? `${trimmedQuery} ${expandedTerms.join(' ')}`
    : trimmedQuery;

  const endTime = performance.now();
  const expansionTimeMs = Math.round((endTime - startTime) * 100) / 100;

  if (appliedExpansions.length > 0) {
    logger.debug('queryExpansion', 'Query expanded', {
      originalQuery: trimmedQuery.substring(0, 50),
      appliedExpansions,
      expandedTermsCount: expandedTerms.length,
      expansionTimeMs,
    });
  }

  return {
    originalQuery: query,
    expandedQuery,
    expandedTerms,
    appliedExpansions,
    expansionTimeMs,
  };
}

/**
 * Check if a term has expansion mappings.
 *
 * @param term - The term to check
 * @param customExpansions - Optional custom expansions to include
 * @returns True if the term has expansion mappings
 */
export function hasExpansion(
  term: string,
  customExpansions?: Record<string, string>
): boolean {
  const expansions = customExpansions
    ? { ...DEFAULT_QUERY_EXPANSIONS, ...customExpansions }
    : DEFAULT_QUERY_EXPANSIONS;

  return term.toLowerCase() in expansions;
}

/**
 * Get expansion terms for a specific term.
 *
 * @param term - The term to get expansions for
 * @param customExpansions - Optional custom expansions to include
 * @returns Array of expansion terms, or empty array if none
 */
export function getExpansionTerms(
  term: string,
  customExpansions?: Record<string, string>
): string[] {
  const expansions = customExpansions
    ? { ...DEFAULT_QUERY_EXPANSIONS, ...customExpansions }
    : DEFAULT_QUERY_EXPANSIONS;

  const expansion = expansions[term.toLowerCase()];
  return expansion ? expansion.split(/\s+/) : [];
}

/**
 * Get all available expansion keys.
 *
 * @param customExpansions - Optional custom expansions to include
 * @returns Array of all expansion keys (terms that can be expanded)
 */
export function getExpansionKeys(customExpansions?: Record<string, string>): string[] {
  const expansions = customExpansions
    ? { ...DEFAULT_QUERY_EXPANSIONS, ...customExpansions }
    : DEFAULT_QUERY_EXPANSIONS;

  return Object.keys(expansions);
}

/**
 * Get the total number of expansion mappings.
 *
 * @param customExpansions - Optional custom expansions to include
 * @returns Number of expansion mappings
 */
export function getExpansionCount(customExpansions?: Record<string, string>): number {
  return getExpansionKeys(customExpansions).length;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a query expander with pre-configured settings.
 *
 * @param config - Configuration options
 * @returns A configured expand function
 *
 * @example
 * ```typescript
 * const expand = createQueryExpander({ maxExpansionTerms: 5 });
 * const expandedQuery = expand('auth login');
 * ```
 */
export function createQueryExpander(
  config: Partial<QueryExpansionConfig> = {}
): (query: string) => string {
  return (query: string) => expandQuery(query, config);
}

/**
 * Create a query expander that returns detailed results.
 *
 * @param config - Configuration options
 * @returns A configured expand function that returns QueryExpansionResult
 */
export function createDetailedQueryExpander(
  config: Partial<QueryExpansionConfig> = {}
): (query: string) => QueryExpansionResult {
  return (query: string) => expandQueryWithDetails(query, config);
}

// ============================================================================
// Expansion Categories (for documentation/reference)
// ============================================================================

/**
 * Categories of expansion mappings for documentation purposes.
 */
export const EXPANSION_CATEGORIES = [
  'Authentication & Security',
  'Database & Storage',
  'API & HTTP',
  'Async & Concurrency',
  'Errors & Exceptions',
  'Configuration & Settings',
  'Common Abbreviations',
  'Programming Concepts',
  'Testing',
  'Logging & Debugging',
  'File & I/O',
  'Networking',
] as const;

export type ExpansionCategory = (typeof EXPANSION_CATEGORIES)[number];
