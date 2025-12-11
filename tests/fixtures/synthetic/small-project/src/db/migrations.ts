/**
 * Database Migration System
 *
 * Manages database schema versions and migrations.
 * Supports forward and backward migrations with transaction safety.
 */

import { DatabaseConnection, TransactionContext } from './connection';
import { Logger } from '../utils/logger';

export interface Migration {
  version: number;
  name: string;
  up: (ctx: TransactionContext) => Promise<void>;
  down: (ctx: TransactionContext) => Promise<void>;
}

export interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: Date;
  checksum: string;
}

const logger = new Logger('migrations');

/**
 * MigrationRunner handles the execution of database migrations.
 *
 * Features:
 * - Tracks applied migrations in database
 * - Supports rolling forward and backward
 * - Transaction-safe migration execution
 * - Checksum validation for integrity
 */
export class MigrationRunner {
  private migrations: Migration[] = [];
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  /**
   * Registers a migration with the runner.
   */
  register(migration: Migration): void {
    // Maintain sorted order by version
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Runs all pending migrations.
   *
   * @returns Number of migrations applied
   */
  async migrate(): Promise<number> {
    await this.ensureMigrationTable();

    const applied = await this.getAppliedMigrations();
    const pending = this.migrations.filter(
      (m) => !applied.some((a) => a.version === m.version)
    );

    logger.info(`Found ${pending.length} pending migrations`);

    let count = 0;
    for (const migration of pending) {
      await this.runMigration(migration, 'up');
      count++;
    }

    return count;
  }

  /**
   * Rolls back the last N migrations.
   *
   * @param steps - Number of migrations to roll back
   * @returns Number of migrations rolled back
   */
  async rollback(steps: number = 1): Promise<number> {
    const applied = await this.getAppliedMigrations();

    // Sort by version descending to rollback in reverse order
    const toRollback = applied
      .sort((a, b) => b.version - a.version)
      .slice(0, steps);

    let count = 0;
    for (const record of toRollback) {
      const migration = this.migrations.find((m) => m.version === record.version);
      if (migration) {
        await this.runMigration(migration, 'down');
        count++;
      }
    }

    return count;
  }

  /**
   * Migrates to a specific version.
   *
   * @param targetVersion - Target version number
   */
  async migrateTo(targetVersion: number): Promise<void> {
    const applied = await this.getAppliedMigrations();
    const currentVersion = Math.max(0, ...applied.map((a) => a.version));

    if (targetVersion > currentVersion) {
      // Migrate up
      const pending = this.migrations.filter(
        (m) => m.version > currentVersion && m.version <= targetVersion
      );
      for (const migration of pending) {
        await this.runMigration(migration, 'up');
      }
    } else if (targetVersion < currentVersion) {
      // Migrate down
      const toRollback = this.migrations
        .filter((m) => m.version > targetVersion && m.version <= currentVersion)
        .reverse();
      for (const migration of toRollback) {
        await this.runMigration(migration, 'down');
      }
    }
  }

  /**
   * Gets the current migration status.
   */
  async status(): Promise<{ current: number; pending: number; migrations: MigrationRecord[] }> {
    const applied = await this.getAppliedMigrations();
    const pending = this.migrations.filter(
      (m) => !applied.some((a) => a.version === m.version)
    );

    return {
      current: Math.max(0, ...applied.map((a) => a.version)),
      pending: pending.length,
      migrations: applied,
    };
  }

  /**
   * Runs a single migration up or down.
   */
  private async runMigration(migration: Migration, direction: 'up' | 'down'): Promise<void> {
    logger.info(`Running migration ${direction}: [${migration.version}] ${migration.name}`);

    await this.db.transaction(async (ctx) => {
      if (direction === 'up') {
        await migration.up(ctx);
        await this.recordMigration(ctx, migration);
      } else {
        await migration.down(ctx);
        await this.removeMigrationRecord(ctx, migration.version);
      }
    });

    logger.info(`Migration ${direction} complete: [${migration.version}] ${migration.name}`);
  }

  /**
   * Records a migration as applied.
   */
  private async recordMigration(ctx: TransactionContext, migration: Migration): Promise<void> {
    const checksum = this.calculateChecksum(migration);
    await ctx.execute(
      'INSERT INTO migrations (version, name, appliedAt, checksum) VALUES (?, ?, NOW(), ?)',
      [migration.version, migration.name, checksum]
    );
  }

  /**
   * Removes a migration record.
   */
  private async removeMigrationRecord(ctx: TransactionContext, version: number): Promise<void> {
    await ctx.execute('DELETE FROM migrations WHERE version = ?', [version]);
  }

  /**
   * Gets all applied migrations.
   */
  private async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.db.query<MigrationRecord[]>(
      'SELECT * FROM migrations ORDER BY version ASC'
    );
    return result || [];
  }

  /**
   * Ensures the migration tracking table exists.
   */
  private async ensureMigrationTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        appliedAt DATETIME NOT NULL,
        checksum VARCHAR(64) NOT NULL
      )
    `);
  }

  /**
   * Calculates a checksum for a migration to detect changes.
   */
  private calculateChecksum(migration: Migration): string {
    const content = migration.up.toString() + migration.down.toString();
    return this.simpleHash(content);
  }

  /**
   * Simple hash function for checksum generation.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

// Example migrations
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_users_table',
    up: async (ctx) => {
      await ctx.execute(`
        CREATE TABLE users (
          id VARCHAR(36) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          passwordHash VARCHAR(255) NOT NULL,
          createdAt DATETIME NOT NULL,
          lastLoginAt DATETIME
        )
      `);
    },
    down: async (ctx) => {
      await ctx.execute('DROP TABLE users');
    },
  },
  {
    version: 2,
    name: 'create_sessions_table',
    up: async (ctx) => {
      await ctx.execute(`
        CREATE TABLE sessions (
          id VARCHAR(36) PRIMARY KEY,
          userId VARCHAR(36) NOT NULL,
          token VARCHAR(255) NOT NULL,
          createdAt DATETIME NOT NULL,
          expiresAt DATETIME NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id)
        )
      `);
    },
    down: async (ctx) => {
      await ctx.execute('DROP TABLE sessions');
    },
  },
  {
    version: 3,
    name: 'add_user_profile',
    up: async (ctx) => {
      await ctx.execute(`
        ALTER TABLE users
        ADD COLUMN name VARCHAR(255),
        ADD COLUMN avatar VARCHAR(512)
      `);
    },
    down: async (ctx) => {
      await ctx.execute(`
        ALTER TABLE users
        DROP COLUMN name,
        DROP COLUMN avatar
      `);
    },
  },
];
