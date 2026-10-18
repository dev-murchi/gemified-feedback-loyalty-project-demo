import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { reasonOf } from '../../shared-kernel/failure-reason.js';
import type { Logger } from '../../shared-kernel/logger.js';

export interface PgDatabaseConfig {
  /** postgres://user:password@host:port/database */
  readonly url: string;
  /** Pooled connections per process; pg's default is 10. */
  readonly maxConnections?: number;
}

/** Puts a failed transaction's connection back, or destroys it when even ROLLBACK failed. */
async function rolledBack(client: pg.PoolClient): Promise<boolean> {
  try {
    await client.query('ROLLBACK');
    return true;
  } catch {
    return false;
  }
}

/**
 * The PostgreSQL connection pool and the current transaction (ADR-017, G-1). `transaction` binds
 * one pooled connection to the async work it runs (AsyncLocalStorage), so every `query` made
 * inside that work, by any repository, runs in the same transaction without passing a client
 * around. Outside a transaction, `query` uses any pooled connection and sees committed data only.
 */
export class PgDatabase {
  readonly #pool: pg.Pool;
  readonly #current = new AsyncLocalStorage<pg.PoolClient>();

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  get inTransaction(): boolean {
    return this.#current.getStore() !== undefined;
  }

  query<Row extends pg.QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<pg.QueryResult<Row>> {
    const runner = this.#current.getStore() ?? this.#pool;
    return runner.query<Row>(text, [...values]);
  }

  /**
   * A write that belongs to a unit of work (the outbox insert, every versioned write). Outside a
   * transaction a plain `query` would commit by itself and break the atomicity of the unit of work
   * (ADR-005, ADR-014), so this refuses and nothing is written.
   */
  queryInUnitOfWork<Row extends pg.QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<pg.QueryResult<Row>> {
    if (!this.inTransaction)
      return Promise.reject(
        new Error(
          'A write that belongs to a unit of work was made outside one (ADR-005, ADR-014)',
        ),
      );
    return this.query<Row>(text, values);
  }

  /**
   * A statement of a process that calls an external service between its steps (the outbox relay):
   * it must not hold a transaction, or the call would run inside it (docs/07 §5). Inside one it
   * refuses and nothing runs.
   */
  queryOutsideUnitOfWork<Row extends pg.QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<pg.QueryResult<Row>> {
    if (this.inTransaction)
      return Promise.reject(
        new Error(
          'The statement must not run inside a transaction (docs/07 §5)',
        ),
      );
    return this.query<Row>(text, values);
  }

  /**
   * Runs `work` in one transaction: COMMIT when it resolves, ROLLBACK when anything throws (the
   * error is rethrown unchanged). A transaction inside a transaction is a programming error (e.g.
   * an event handler opening its own unit of work) and throws before touching the database.
   */
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.inTransaction)
      throw new Error('A transaction is already running in this context');
    const client = await this.#pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      const value = await this.#current.run(client, work);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      broken = !(await rolledBack(client));
      throw error;
    } finally {
      client.release(broken);
    }
  }

  /** Closes every pooled connection; waits for queries in progress. */
  end(): Promise<void> {
    return this.#pool.end();
  }
}

/**
 * Opens the pool lazily: no connection is made until the first query. An idle connection that
 * breaks (e.g. the database restarts) is dropped by the pool and logged here; without a listener
 * that error would crash the process.
 */
export function createPgDatabase(
  config: PgDatabaseConfig,
  logger: Logger,
): PgDatabase {
  const pool = new pg.Pool({
    connectionString: config.url,
    ...(config.maxConnections === undefined
      ? {}
      : { max: config.maxConnections }),
  });
  pool.on('error', (error) =>
    logger.warn('PostgreSQL idle connection failed', {
      reason: reasonOf(error),
    }),
  );
  return new PgDatabase(pool);
}
