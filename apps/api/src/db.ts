import { createClient, type Client, type InArgs, type Row } from "@libsql/client";
import { Context, Effect, Layer } from "effect";
import { StorageError } from "./errors.js";
import { AppConfigService } from "./services.js";

const MIGRATIONS = [
  `
CREATE TABLE IF NOT EXISTS artist_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_number INTEGER NOT NULL
)`,
  `
INSERT OR IGNORE INTO artist_sequence (id, next_number) VALUES (1, 1)`,
  `
CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,
  `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT NOT NULL,
  image_filename TEXT NOT NULL,
  image_mime_type TEXT NOT NULL,
  image_size_bytes INTEGER NOT NULL,
  image_storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (artist_id) REFERENCES artists (id)
)`,
  `
CREATE INDEX IF NOT EXISTS entries_artist_created_at
  ON entries (artist_id, created_at DESC)`,
  `DROP TABLE IF EXISTS entry_requests`,
];

export interface StatementResult {
  readonly rows: readonly Row[];
  readonly rowsAffected: number;
}

export type Statement = (sql: string, args?: InArgs) => Promise<StatementResult>;

export class Database extends Context.Service<
  Database,
  {
    readonly execute: (sql: string, args?: InArgs) => Effect.Effect<readonly Row[], StorageError>;
    readonly withTransaction: <A>(run: (execute: Statement) => Promise<A>) => Effect.Effect<A, StorageError>;
  }
>()("records/Database") {}

export const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const client: Client = createClient({ url: config.databaseUrl });
    const executeStatement = (statement: string) =>
      Effect.tryPromise({
        try: () => client.execute(statement),
        catch: (cause) => new StorageError({ cause }),
      });

    yield* executeStatement("PRAGMA foreign_keys = ON");
    yield* executeStatement("PRAGMA journal_mode = WAL");
    yield* executeStatement("PRAGMA busy_timeout = 5000");
    for (const statement of MIGRATIONS) {
      yield* executeStatement(statement);
    }
    yield* Effect.addFinalizer(() => Effect.sync(() => client.close()));

    const runStatement = async (executor: Pick<Client, "execute">, sql: string, args?: InArgs): Promise<StatementResult> => {
      const result = args === undefined ? await executor.execute(sql) : await executor.execute({ sql, args });
      return { rows: result.rows, rowsAffected: result.rowsAffected };
    };

    // One libsql connection cannot hold two write transactions. Queue them so
    // overlapping creates wait instead of failing with SQLITE_BUSY.
    let tail: Promise<void> = Promise.resolve();
    const enqueue = <A>(work: () => Promise<A>): Promise<A> => {
      const run = tail.then(work, work);
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };

    return {
      execute: (sql, args) =>
        Effect.tryPromise({
          try: () => enqueue(async () => (await runStatement(client, sql, args)).rows),
          catch: (cause) => new StorageError({ cause }),
        }),
      withTransaction: (run) =>
        Effect.tryPromise({
          try: () =>
            enqueue(async () => {
              const tx = await client.transaction("write");
              try {
                const result = await run((sql, args) => runStatement(tx, sql, args));
                await tx.commit();
                return result;
              } catch (cause) {
                await tx.rollback().catch(() => undefined);
                throw cause;
              }
            }),
          catch: (cause) => new StorageError({ cause }),
        }),
    };
  }),
);
