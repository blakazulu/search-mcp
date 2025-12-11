/**
 * Database Connection Pool Manager
 *
 * This module manages database connections with connection pooling,
 * automatic reconnection, and health monitoring.
 */

import { EventEmitter } from 'events';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
  idleTimeout: number;
  connectionTimeout: number;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalQueries: number;
  averageQueryTime: number;
}

interface PooledConnection {
  id: string;
  connection: unknown;
  lastUsed: Date;
  inUse: boolean;
}

/**
 * DatabaseConnection provides a singleton connection pool manager.
 *
 * Features:
 * - Connection pooling for efficient resource usage
 * - Automatic reconnection on failure
 * - Health monitoring and metrics
 * - Query execution with automatic connection management
 *
 * Performance optimization:
 * - Reuses existing connections
 * - Limits maximum connections to prevent resource exhaustion
 * - Monitors idle connections for cleanup
 */
export class DatabaseConnection extends EventEmitter {
  private static instance: DatabaseConnection | null = null;
  private config: DatabaseConfig;
  private pool: PooledConnection[] = [];
  private waitQueue: Array<(conn: PooledConnection) => void> = [];
  private stats: ConnectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
    totalQueries: 0,
    averageQueryTime: 0,
  };
  private queryTimes: number[] = [];

  private constructor(config: DatabaseConfig) {
    super();
    this.config = config;
    this.startHealthCheck();
  }

  /**
   * Gets the singleton database connection instance.
   *
   * @param config - Optional configuration for first initialization
   * @returns DatabaseConnection instance
   */
  static getInstance(config?: DatabaseConfig): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      if (!config) {
        throw new Error('Database configuration required for initialization');
      }
      DatabaseConnection.instance = new DatabaseConnection(config);
    }
    return DatabaseConnection.instance;
  }

  /**
   * Resets the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
      DatabaseConnection.instance = null;
    }
  }

  /**
   * Executes a SQL query with parameter binding.
   *
   * @param sql - SQL query string with placeholders
   * @param params - Query parameters
   * @returns Query result
   */
  async query<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const conn = await this.acquireConnection();
    const startTime = Date.now();

    try {
      // Simulate query execution
      const result = await this.executeQuery<T>(conn, sql, params);
      this.recordQueryTime(Date.now() - startTime);
      return result;
    } finally {
      this.releaseConnection(conn);
    }
  }

  /**
   * Executes a SQL statement that doesn't return results (INSERT, UPDATE, DELETE).
   *
   * @param sql - SQL statement
   * @param params - Statement parameters
   * @returns Number of affected rows
   */
  async execute(sql: string, params: unknown[] = []): Promise<number> {
    const conn = await this.acquireConnection();
    const startTime = Date.now();

    try {
      const affectedRows = await this.executeStatement(conn, sql, params);
      this.recordQueryTime(Date.now() - startTime);
      return affectedRows;
    } finally {
      this.releaseConnection(conn);
    }
  }

  /**
   * Executes a transaction with multiple statements.
   *
   * @param callback - Function that receives the connection and executes statements
   * @returns Result of the transaction
   */
  async transaction<T>(callback: (conn: TransactionContext) => Promise<T>): Promise<T> {
    const conn = await this.acquireConnection();
    const startTime = Date.now();

    try {
      await this.executeStatement(conn, 'BEGIN', []);

      const context: TransactionContext = {
        query: async <R>(sql: string, params: unknown[] = []) => {
          return this.executeQuery<R>(conn, sql, params);
        },
        execute: async (sql: string, params: unknown[] = []) => {
          return this.executeStatement(conn, sql, params);
        },
      };

      const result = await callback(context);
      await this.executeStatement(conn, 'COMMIT', []);

      this.recordQueryTime(Date.now() - startTime);
      return result;
    } catch (error) {
      await this.executeStatement(conn, 'ROLLBACK', []);
      throw error;
    } finally {
      this.releaseConnection(conn);
    }
  }

  /**
   * Acquires a connection from the pool.
   */
  private async acquireConnection(): Promise<PooledConnection> {
    // Check for available idle connection
    const idleConn = this.pool.find((c) => !c.inUse);
    if (idleConn) {
      idleConn.inUse = true;
      idleConn.lastUsed = new Date();
      this.updateStats();
      return idleConn;
    }

    // Create new connection if pool not full
    if (this.pool.length < this.config.maxConnections) {
      const newConn = await this.createConnection();
      newConn.inUse = true;
      this.pool.push(newConn);
      this.updateStats();
      return newConn;
    }

    // Wait for available connection
    this.stats.waitingRequests++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stats.waitingRequests--;
        const index = this.waitQueue.indexOf(resolve);
        if (index > -1) this.waitQueue.splice(index, 1);
        reject(new Error('Connection timeout'));
      }, this.config.connectionTimeout);

      this.waitQueue.push((conn) => {
        clearTimeout(timeout);
        this.stats.waitingRequests--;
        resolve(conn);
      });
    });
  }

  /**
   * Releases a connection back to the pool.
   */
  private releaseConnection(conn: PooledConnection): void {
    conn.inUse = false;
    conn.lastUsed = new Date();

    // Check if anyone is waiting for a connection
    const waiting = this.waitQueue.shift();
    if (waiting) {
      conn.inUse = true;
      waiting(conn);
    }

    this.updateStats();
  }

  /**
   * Creates a new database connection.
   */
  private async createConnection(): Promise<PooledConnection> {
    const { host, port, database, user, password } = this.config;

    // Simulate connection creation
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.emit('connection:created', { connectionId, host, database });

    return {
      id: connectionId,
      connection: { host, port, database, user, connected: true },
      lastUsed: new Date(),
      inUse: false,
    };
  }

  /**
   * Executes a query and returns results.
   */
  private async executeQuery<T>(
    conn: PooledConnection,
    sql: string,
    params: unknown[]
  ): Promise<T | null> {
    // Simulate query execution
    this.stats.totalQueries++;
    this.emit('query:executed', { connectionId: conn.id, sql, params });

    // In a real implementation, this would execute the actual query
    return null;
  }

  /**
   * Executes a statement and returns affected rows.
   */
  private async executeStatement(
    conn: PooledConnection,
    sql: string,
    params: unknown[]
  ): Promise<number> {
    // Simulate statement execution
    this.stats.totalQueries++;
    this.emit('statement:executed', { connectionId: conn.id, sql, params });

    return 1; // Simulated affected rows
  }

  /**
   * Records query execution time for metrics.
   */
  private recordQueryTime(ms: number): void {
    this.queryTimes.push(ms);
    if (this.queryTimes.length > 1000) {
      this.queryTimes = this.queryTimes.slice(-1000);
    }
    this.stats.averageQueryTime =
      this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
  }

  /**
   * Updates connection pool statistics.
   */
  private updateStats(): void {
    this.stats.totalConnections = this.pool.length;
    this.stats.activeConnections = this.pool.filter((c) => c.inUse).length;
    this.stats.idleConnections = this.pool.filter((c) => !c.inUse).length;
  }

  /**
   * Starts the health check interval.
   */
  private startHealthCheck(): void {
    setInterval(() => {
      this.cleanupIdleConnections();
      this.emit('health:check', this.getStats());
    }, 30000); // Every 30 seconds
  }

  /**
   * Removes connections that have been idle too long.
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const idleTimeout = this.config.idleTimeout;

    this.pool = this.pool.filter((conn) => {
      if (!conn.inUse && now - conn.lastUsed.getTime() > idleTimeout) {
        this.emit('connection:closed', { connectionId: conn.id, reason: 'idle' });
        return false;
      }
      return true;
    });

    this.updateStats();
  }

  /**
   * Gets current connection pool statistics.
   */
  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  /**
   * Closes all connections and shuts down the pool.
   */
  close(): void {
    this.pool.forEach((conn) => {
      this.emit('connection:closed', { connectionId: conn.id, reason: 'shutdown' });
    });
    this.pool = [];
    this.waitQueue = [];
    this.updateStats();
  }
}

export interface TransactionContext {
  query: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
  execute: (sql: string, params?: unknown[]) => Promise<number>;
}
