/**
 * Indexing Strategies Module
 *
 * Exports all indexing strategy implementations:
 * - RealtimeStrategy: Process changes immediately (default)
 * - LazyStrategy: Queue changes and process on idle or before search (future)
 * - GitStrategy: Only reindex after git commits (future)
 */

// Realtime Strategy
export {
  RealtimeStrategy,
  createRealtimeStrategy,
  type RealtimeStrategyOptions,
} from './realtimeStrategy.js';
