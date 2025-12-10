/**
 * Indexing Strategies Module
 *
 * Exports all indexing strategy implementations:
 * - RealtimeStrategy: Process changes immediately (default)
 * - LazyStrategy: Queue changes and process on idle or before search
 * - GitStrategy: Only reindex after git commits
 */

// Realtime Strategy
export {
  RealtimeStrategy,
  createRealtimeStrategy,
  type RealtimeStrategyOptions,
} from './realtimeStrategy.js';

// Lazy Strategy
export {
  LazyStrategy,
  createLazyStrategy,
  type LazyStrategyOptions,
} from './lazyStrategy.js';

// Git Strategy
export {
  GitStrategy,
  createGitStrategy,
  DEFAULT_GIT_DEBOUNCE_DELAY,
  type GitStrategyOptions,
} from './gitStrategy.js';
