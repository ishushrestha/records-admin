import type { Row } from "@libsql/client";
import { artistSchema, formatArtistId, type Artist } from "@records/contracts";
import { Context, Effect, Layer } from "effect";
import { Database } from "./db.js";
import { StorageError } from "./errors.js";

export class Artists extends Context.Service<
  Artists,
  {
    readonly list: () => Effect.Effect<readonly Artist[], StorageError>;
    readonly get: (id: string) => Effect.Effect<Artist | undefined, StorageError>;
    readonly create: (name: string) => Effect.Effect<Artist, StorageError>;
  }
>()("records/Artists") {}

class SequenceConflict extends Error {
  constructor() {
    super("Artist sequence changed while assigning an id.");
  }
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new StorageError({ cause: `Expected text in ${key}` });
  }
  return value;
}

function sequenceNumber(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new StorageError({ cause: "Artist sequence is missing." });
}

function toArtist(row: Row): Artist {
  const parsed = artistSchema.safeParse({
    id: text(row, "id"),
    name: text(row, "name"),
    createdAt: text(row, "created_at"),
  });
  if (!parsed.success) {
    throw new StorageError({ cause: parsed.error });
  }
  return parsed.data;
}

function storageError(cause: unknown): StorageError {
  return cause instanceof StorageError ? cause : new StorageError({ cause });
}

function isRetryable(cause: unknown): boolean {
  if (cause instanceof SequenceConflict) {
    return true;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.includes("UNIQUE constraint failed") || message.includes("Artist sequence changed");
}

const SELECT_ARTIST = "SELECT id, name, created_at FROM artists";

export const ArtistsLive = Layer.effect(
  Artists,
  Effect.gen(function* () {
    const database = yield* Database;

    return {
      list: () =>
        Effect.gen(function* () {
          const rows = yield* database.execute(`${SELECT_ARTIST} ORDER BY created_at ASC, id ASC`);
          try {
            return rows.map((row) => toArtist(row));
          } catch (cause) {
            return yield* Effect.fail(storageError(cause));
          }
        }),
      get: (id) =>
        Effect.gen(function* () {
          const rows = yield* database.execute(`${SELECT_ARTIST} WHERE id = ?`, [id]);
          const row = rows[0];
          if (row === undefined) {
            return undefined;
          }
          try {
            return toArtist(row);
          } catch (cause) {
            return yield* Effect.fail(storageError(cause));
          }
        }),
      create: (name) =>
        Effect.gen(function* () {
          let lastError: StorageError | undefined;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const result = yield* database
              .withTransaction(async (execute) => {
                const selected = await execute("SELECT next_number FROM artist_sequence WHERE id = 1");
                const current = sequenceNumber(selected.rows[0]?.next_number);
                const id = formatArtistId(current);
                const createdAt = new Date().toISOString();
                const updated = await execute(
                  "UPDATE artist_sequence SET next_number = ? WHERE id = 1 AND next_number = ?",
                  [current + 1, current],
                );
                if (updated.rowsAffected !== 1) {
                  throw new SequenceConflict();
                }
                await execute("INSERT INTO artists (id, name, created_at) VALUES (?, ?, ?)", [id, name, createdAt]);
                return artistSchema.parse({ id, name, createdAt });
              })
              .pipe(
                Effect.map((artist) => ({ ok: true as const, artist })),
                Effect.catch((cause) => {
                  const nested = cause instanceof StorageError ? cause.details.cause : cause;
                  if (isRetryable(nested) || isRetryable(cause)) {
                    return Effect.succeed({ ok: false as const, error: storageError(cause) });
                  }
                  return Effect.fail(storageError(cause));
                }),
              );
            if (result.ok) {
              return result.artist;
            }
            lastError = result.error;
          }
          return yield* Effect.fail(lastError ?? new StorageError({ cause: "Could not assign an artist id." }));
        }),
    };
  }),
);
