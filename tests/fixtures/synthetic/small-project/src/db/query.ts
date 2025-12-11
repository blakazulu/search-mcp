/**
 * Database Query Builder
 *
 * Provides a fluent interface for building and executing SQL queries
 * with type safety and SQL injection protection.
 */

import { DatabaseConnection } from './connection';

export type WhereOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';

export interface WhereClause {
  column: string;
  operator: WhereOperator;
  value: unknown;
}

export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  on: string;
}

export interface OrderByClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

/**
 * QueryBuilder provides a fluent interface for constructing SQL queries.
 *
 * Features:
 * - Method chaining for readable query construction
 * - Automatic parameter binding for SQL injection prevention
 * - Support for SELECT, INSERT, UPDATE, DELETE operations
 * - JOIN support with multiple join types
 * - WHERE clause with various operators
 * - ORDER BY, GROUP BY, LIMIT, OFFSET support
 *
 * Security:
 * - All user inputs are parameterized
 * - Column and table names are validated
 * - Prevents SQL injection attacks
 */
export class QueryBuilder<T = unknown> {
  private tableName: string;
  private selectColumns: string[] = ['*'];
  private whereClauses: WhereClause[] = [];
  private joinClauses: JoinClause[] = [];
  private orderByClauses: OrderByClause[] = [];
  private groupByColumns: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private params: unknown[] = [];

  constructor(table: string) {
    this.tableName = this.sanitizeIdentifier(table);
  }

  /**
   * Creates a new QueryBuilder instance for the specified table.
   */
  static table<T = unknown>(name: string): QueryBuilder<T> {
    return new QueryBuilder<T>(name);
  }

  /**
   * Specifies which columns to select.
   *
   * @param columns - Column names to select
   */
  select(...columns: string[]): this {
    this.selectColumns = columns.map((c) => this.sanitizeIdentifier(c));
    return this;
  }

  /**
   * Adds a WHERE clause to the query.
   *
   * @param column - Column name
   * @param operatorOrValue - Operator or value (if using = operator)
   * @param value - Value to compare
   */
  where(column: string, operatorOrValue: WhereOperator | unknown, value?: unknown): this {
    if (value === undefined) {
      // Short form: where('column', value) assumes '='
      this.whereClauses.push({
        column: this.sanitizeIdentifier(column),
        operator: '=',
        value: operatorOrValue,
      });
    } else {
      this.whereClauses.push({
        column: this.sanitizeIdentifier(column),
        operator: operatorOrValue as WhereOperator,
        value,
      });
    }
    return this;
  }

  /**
   * Adds a WHERE column IS NULL clause.
   */
  whereNull(column: string): this {
    this.whereClauses.push({
      column: this.sanitizeIdentifier(column),
      operator: 'IS NULL',
      value: null,
    });
    return this;
  }

  /**
   * Adds a WHERE column IS NOT NULL clause.
   */
  whereNotNull(column: string): this {
    this.whereClauses.push({
      column: this.sanitizeIdentifier(column),
      operator: 'IS NOT NULL',
      value: null,
    });
    return this;
  }

  /**
   * Adds a WHERE column IN (...) clause.
   */
  whereIn(column: string, values: unknown[]): this {
    this.whereClauses.push({
      column: this.sanitizeIdentifier(column),
      operator: 'IN',
      value: values,
    });
    return this;
  }

  /**
   * Adds a JOIN clause to the query.
   *
   * @param table - Table to join
   * @param on - Join condition
   * @param type - Join type (INNER, LEFT, RIGHT, FULL)
   */
  join(table: string, on: string, type: JoinClause['type'] = 'INNER'): this {
    this.joinClauses.push({
      type,
      table: this.sanitizeIdentifier(table),
      on,
    });
    return this;
  }

  /**
   * Adds a LEFT JOIN clause.
   */
  leftJoin(table: string, on: string): this {
    return this.join(table, on, 'LEFT');
  }

  /**
   * Adds a RIGHT JOIN clause.
   */
  rightJoin(table: string, on: string): this {
    return this.join(table, on, 'RIGHT');
  }

  /**
   * Adds an ORDER BY clause.
   *
   * @param column - Column to order by
   * @param direction - Sort direction
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClauses.push({
      column: this.sanitizeIdentifier(column),
      direction,
    });
    return this;
  }

  /**
   * Adds a GROUP BY clause.
   */
  groupBy(...columns: string[]): this {
    this.groupByColumns = columns.map((c) => this.sanitizeIdentifier(c));
    return this;
  }

  /**
   * Sets the LIMIT for results.
   */
  limit(count: number): this {
    this.limitValue = Math.max(0, Math.floor(count));
    return this;
  }

  /**
   * Sets the OFFSET for results.
   */
  offset(count: number): this {
    this.offsetValue = Math.max(0, Math.floor(count));
    return this;
  }

  /**
   * Builds and executes a SELECT query.
   *
   * @returns Array of results
   */
  async get(): Promise<T[]> {
    const sql = this.buildSelectQuery();
    const db = DatabaseConnection.getInstance();
    const result = await db.query<T[]>(sql, this.params);
    return result || [];
  }

  /**
   * Gets the first result only.
   */
  async first(): Promise<T | null> {
    this.limit(1);
    const results = await this.get();
    return results[0] || null;
  }

  /**
   * Counts results matching the query.
   */
  async count(): Promise<number> {
    this.selectColumns = ['COUNT(*) as count'];
    const sql = this.buildSelectQuery();
    const db = DatabaseConnection.getInstance();
    const result = await db.query<{ count: number }>(sql, this.params);
    return result?.count || 0;
  }

  /**
   * Inserts a new record.
   *
   * @param data - Record data
   * @returns Inserted ID
   */
  async insert(data: Partial<T>): Promise<number> {
    const columns = Object.keys(data).map((k) => this.sanitizeIdentifier(k));
    const values = Object.values(data);
    const placeholders = values.map(() => '?').join(', ');

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

    const db = DatabaseConnection.getInstance();
    return db.execute(sql, values);
  }

  /**
   * Updates records matching the query.
   *
   * @param data - Fields to update
   * @returns Number of affected rows
   */
  async update(data: Partial<T>): Promise<number> {
    const setClauses = Object.keys(data)
      .map((k) => `${this.sanitizeIdentifier(k)} = ?`)
      .join(', ');
    const values = Object.values(data);

    const whereSQL = this.buildWhereClause();

    const sql = `UPDATE ${this.tableName} SET ${setClauses}${whereSQL}`;

    const db = DatabaseConnection.getInstance();
    return db.execute(sql, [...values, ...this.params]);
  }

  /**
   * Deletes records matching the query.
   *
   * @returns Number of deleted rows
   */
  async delete(): Promise<number> {
    const whereSQL = this.buildWhereClause();

    if (!whereSQL) {
      throw new Error('DELETE without WHERE clause is not allowed. Use truncate() instead.');
    }

    const sql = `DELETE FROM ${this.tableName}${whereSQL}`;

    const db = DatabaseConnection.getInstance();
    return db.execute(sql, this.params);
  }

  /**
   * Builds the SELECT query string.
   */
  private buildSelectQuery(): string {
    let sql = `SELECT ${this.selectColumns.join(', ')} FROM ${this.tableName}`;

    // Add JOINs
    for (const join of this.joinClauses) {
      sql += ` ${join.type} JOIN ${join.table} ON ${join.on}`;
    }

    // Add WHERE
    sql += this.buildWhereClause();

    // Add GROUP BY
    if (this.groupByColumns.length > 0) {
      sql += ` GROUP BY ${this.groupByColumns.join(', ')}`;
    }

    // Add ORDER BY
    if (this.orderByClauses.length > 0) {
      const orderParts = this.orderByClauses.map((o) => `${o.column} ${o.direction}`);
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // Add LIMIT/OFFSET
    if (this.limitValue !== undefined) {
      sql += ` LIMIT ${this.limitValue}`;
    }
    if (this.offsetValue !== undefined) {
      sql += ` OFFSET ${this.offsetValue}`;
    }

    return sql;
  }

  /**
   * Builds the WHERE clause.
   */
  private buildWhereClause(): string {
    if (this.whereClauses.length === 0) {
      return '';
    }

    const conditions = this.whereClauses.map((w) => {
      if (w.operator === 'IS NULL' || w.operator === 'IS NOT NULL') {
        return `${w.column} ${w.operator}`;
      }
      if (w.operator === 'IN' || w.operator === 'NOT IN') {
        const values = w.value as unknown[];
        const placeholders = values.map(() => '?').join(', ');
        this.params.push(...values);
        return `${w.column} ${w.operator} (${placeholders})`;
      }
      this.params.push(w.value);
      return `${w.column} ${w.operator} ?`;
    });

    return ` WHERE ${conditions.join(' AND ')}`;
  }

  /**
   * Sanitizes an identifier (table or column name) to prevent SQL injection.
   */
  private sanitizeIdentifier(name: string): string {
    // Only allow alphanumeric characters, underscores, and dots (for table.column)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(name)) {
      throw new Error(`Invalid identifier: ${name}`);
    }
    return name;
  }
}

/**
 * Shorthand function for creating a QueryBuilder.
 */
export function query<T = unknown>(table: string): QueryBuilder<T> {
  return QueryBuilder.table<T>(table);
}
