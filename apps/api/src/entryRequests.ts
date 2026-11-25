import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import {
  entryRequestSchema,
  entryRequestListItemSchema,
  type EntryRequest,
  type EntryRequestListItem,
  type EntryRequestStatus,
  type ImageMimeType,
} from "@records/contracts";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { Database } from "./db.js";
import { StorageError } from "./errors.js";
import { AppConfigService } from "./services.js";

export interface NewEntryRequest {
  readonly artistId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly address: string;
  readonly sourceSubmissionId: string;
  readonly llmNotes: string | null;
  readonly image: {
    readonly originalFilename: string;
    readonly mimeType: ImageMimeType;
    readonly sizeBytes: number;
    readonly tempPath: string;
  };
}

export type CreateEntryRequestResult =
  | { readonly kind: "created"; readonly id: string; readonly status: EntryRequestStatus }
  | { readonly kind: "existing"; readonly id: string; readonly status: EntryRequestStatus }
  | { readonly kind: "unknown_artist" };

export type DecideEntryRequestResult =
  | { readonly kind: "missing" }
  | { readonly kind: "conflict" }
  | { readonly kind: "decided"; readonly request: EntryRequest };

export interface StoredImage {
  readonly bytes: Uint8Array;
  readonly mimeType: ImageMimeType;
  readonly filename: string;
}

export class EntryRequests extends Context.Service<
  EntryRequests,
  {
    readonly findBySource: (
      sourceSubmissionId: string,
    ) => Effect.Effect<{ readonly id: string; readonly status: EntryRequestStatus } | undefined, StorageError>;
    readonly create: (input: NewEntryRequest) => Effect.Effect<CreateEntryRequestResult, StorageError>;
    readonly listPending: () => Effect.Effect<readonly EntryRequestListItem[], StorageError>;
    readonly get: (id: string) => Effect.Effect<EntryRequest | undefined, StorageError>;
    readonly readImage: (id: string) => Effect.Effect<StoredImage | undefined, StorageError>;
    readonly verify: (id: string) => Effect.Effect<DecideEntryRequestResult, StorageError>;
    readonly reject: (id: string) => Effect.Effect<DecideEntryRequestResult, StorageError>;
  }
>()("records/EntryRequests") {}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new StorageError({ cause: `Expected text in ${key}` });
  }
  return value;
}

function optionalText(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new StorageError({ cause: `Expected text in ${key}` });
  }
  return value;
}

function sizeBytes(row: Row): number {
  const value = row.image_size_bytes;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new StorageError({ cause: "Expected a number in image_size_bytes" });
}

function storageError(cause: unknown): StorageError {
  return cause instanceof StorageError ? cause : new StorageError({ cause });
}

function isUniqueConstraint(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.includes("UNIQUE constraint failed");
}

function extensionFor(mimeType: ImageMimeType): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default: {
      const unreachable: never = mimeType;
      return unreachable;
    }
  }
}

const SELECT_REQUEST = `
  SELECT
    entry_requests.id,
    entry_requests.artist_id,
    artists.name AS artist_name,
    entry_requests.first_name,
    entry_requests.last_name,
    entry_requests.address,
    entry_requests.image_filename,
    entry_requests.image_mime_type,
    entry_requests.image_size_bytes,
    entry_requests.image_storage_path,
    entry_requests.source_submission_id,
    entry_requests.llm_notes,
    entry_requests.status,
    entry_requests.created_at,
    entry_requests.decided_at,
    entry_requests.created_entry_id
  FROM entry_requests
  JOIN artists ON artists.id = entry_requests.artist_id
`;

function toRequest(row: Row): EntryRequest {
  const parsed = entryRequestSchema.safeParse({
    id: text(row, "id"),
    artistId: text(row, "artist_id"),
    artistName: text(row, "artist_name"),
    firstName: text(row, "first_name"),
    lastName: text(row, "last_name"),
    address: text(row, "address"),
    image: {
      filename: text(row, "image_filename"),
      mimeType: text(row, "image_mime_type"),
      sizeBytes: sizeBytes(row),
    },
    sourceSubmissionId: text(row, "source_submission_id"),
    llmNotes: optionalText(row, "llm_notes"),
    status: text(row, "status"),
    createdAt: text(row, "created_at"),
    decidedAt: optionalText(row, "decided_at"),
    createdEntryId: optionalText(row, "created_entry_id"),
  });
  if (!parsed.success) {
    throw new StorageError({ cause: parsed.error });
  }
  return parsed.data;
}

function toListItem(row: Row): EntryRequestListItem {
  const parsed = entryRequestListItemSchema.safeParse({
    id: text(row, "id"),
    artistId: text(row, "artist_id"),
    artistName: text(row, "artist_name"),
    firstName: text(row, "first_name"),
    lastName: text(row, "last_name"),
    status: text(row, "status"),
    createdAt: text(row, "created_at"),
  });
  if (!parsed.success) {
    throw new StorageError({ cause: parsed.error });
  }
  return parsed.data;
}

export const EntryRequestsLive = Layer.effect(
  EntryRequests,
  Effect.gen(function* () {
    const database = yield* Database;
    const config = yield* AppConfigService;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const existingBySource = (sourceSubmissionId: string) =>
      Effect.gen(function* () {
        const rows = yield* database.execute(
          `SELECT id, status FROM entry_requests WHERE source_submission_id = ?`,
          [sourceSubmissionId],
        );
        const row = rows[0];
        if (row === undefined) {
          return undefined;
        }
        try {
          return { id: text(row, "id"), status: text(row, "status") as EntryRequestStatus };
        } catch (cause) {
          return yield* Effect.fail(storageError(cause));
        }
      });

    const load = (id: string) =>
      Effect.gen(function* () {
        const rows = yield* database.execute(`${SELECT_REQUEST} WHERE entry_requests.id = ?`, [id]);
        const row = rows[0];
        if (row === undefined) {
          return undefined;
        }
        try {
          return toRequest(row);
        } catch (cause) {
          return yield* Effect.fail(storageError(cause));
        }
      });

    return {
      findBySource: existingBySource,
      create: (input) =>
        Effect.gen(function* () {
          const existing = yield* existingBySource(input.sourceSubmissionId);
          if (existing !== undefined) {
            const found: CreateEntryRequestResult = { kind: "existing", id: existing.id, status: existing.status };
            return found;
          }
          const artist = yield* database.execute(`SELECT id FROM artists WHERE id = ?`, [input.artistId]);
          if (artist.length === 0) {
            const missing: CreateEntryRequestResult = { kind: "unknown_artist" };
            return missing;
          }
          const id = randomUUID();
          const createdAt = new Date().toISOString();
          const storageName = `request-${id}.${extensionFor(input.image.mimeType)}`;
          const storagePath = path.join(config.uploadDir, storageName);
          yield* fs.makeDirectory(config.uploadDir, { recursive: true }).pipe(Effect.mapError(storageError));
          yield* fs.copyFile(input.image.tempPath, storagePath).pipe(Effect.mapError(storageError));
          const inserted = yield* database
            .execute(
              `
              INSERT INTO entry_requests (
                id, artist_id, first_name, last_name, address,
                image_filename, image_mime_type, image_size_bytes, image_storage_path,
                source_submission_id, llm_notes, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
              `,
              [
                id,
                input.artistId,
                input.firstName,
                input.lastName,
                input.address,
                input.image.originalFilename,
                input.image.mimeType,
                input.image.sizeBytes,
                storagePath,
                input.sourceSubmissionId,
                input.llmNotes,
                createdAt,
              ],
            )
            .pipe(
              Effect.map(() => ({ raced: false as const })),
              Effect.catch((cause) => {
                const nested = cause instanceof StorageError ? cause.details.cause : cause;
                if (!isUniqueConstraint(nested) && !isUniqueConstraint(cause)) {
                  return Effect.fail(storageError(cause));
                }
                return Effect.succeed({ raced: true as const });
              }),
              Effect.tapError(() => fs.remove(storagePath).pipe(Effect.catch(() => Effect.succeed(undefined)))),
            );
          if (inserted.raced) {
            yield* fs.remove(storagePath).pipe(Effect.catch(() => Effect.succeed(undefined)));
            const winner = yield* existingBySource(input.sourceSubmissionId);
            if (winner === undefined) {
              return yield* Effect.fail(new StorageError({ cause: "Entry request disappeared after a unique conflict." }));
            }
            const raced: CreateEntryRequestResult = { kind: "existing", id: winner.id, status: winner.status };
            return raced;
          }
          const created: CreateEntryRequestResult = { kind: "created", id, status: "pending" };
          return created;
        }),
      listPending: () =>
        Effect.gen(function* () {
          const rows = yield* database.execute(
            `${SELECT_REQUEST} WHERE entry_requests.status = 'pending' ORDER BY entry_requests.created_at ASC, entry_requests.id ASC`,
          );
          try {
            return rows.map((row) => toListItem(row));
          } catch (cause) {
            return yield* Effect.fail(storageError(cause));
          }
        }),
      get: load,
      readImage: (id) =>
        Effect.gen(function* () {
          const rows = yield* database.execute(
            `SELECT image_filename, image_mime_type, image_storage_path FROM entry_requests WHERE id = ?`,
            [id],
          );
          const row = rows[0];
          if (row === undefined) {
            return undefined;
          }
          let filename: string;
          let mimeType: string;
          let storagePath: string;
          try {
            filename = text(row, "image_filename");
            mimeType = text(row, "image_mime_type");
            storagePath = text(row, "image_storage_path");
          } catch (cause) {
            return yield* Effect.fail(storageError(cause));
          }
          if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") {
            return yield* Effect.fail(new StorageError({ cause: "Stored image type is not supported." }));
          }
          const bytes = yield* fs.readFile(storagePath).pipe(Effect.mapError(storageError));
          return { bytes, mimeType, filename };
        }),
      verify: (id) =>
        Effect.gen(function* () {
          const current = yield* load(id);
          if (current === undefined) {
            const missing: DecideEntryRequestResult = { kind: "missing" };
            return missing;
          }
          if (current.status !== "pending") {
            const conflict: DecideEntryRequestResult = { kind: "conflict" };
            return conflict;
          }
          const entryId = randomUUID();
          const now = new Date().toISOString();
          const stored = yield* database.execute(`SELECT image_storage_path, image_mime_type FROM entry_requests WHERE id = ?`, [id]);
          const storedRow = stored[0];
          if (storedRow === undefined) {
            const missing: DecideEntryRequestResult = { kind: "missing" };
            return missing;
          }
          let sourcePath: string;
          let mimeType: ImageMimeType;
          try {
            sourcePath = text(storedRow, "image_storage_path");
            const rawMime = text(storedRow, "image_mime_type");
            if (rawMime !== "image/jpeg" && rawMime !== "image/png" && rawMime !== "image/webp") {
              return yield* Effect.fail(new StorageError({ cause: "Stored image type is not supported." }));
            }
            mimeType = rawMime;
          } catch (cause) {
            return yield* Effect.fail(storageError(cause));
          }
          const storagePath = path.join(config.uploadDir, `${entryId}.${extensionFor(mimeType)}`);
          yield* fs.copyFile(sourcePath, storagePath).pipe(Effect.mapError(storageError));
          const decided = yield* database
            .withTransaction(async (execute) => {
              const fresh = await execute(`SELECT status FROM entry_requests WHERE id = ?`, [id]);
              const status = fresh.rows[0]?.status;
              if (status !== "pending") {
                return false;
              }
              await execute(
                `
                INSERT INTO entries (
                  id, artist_id, first_name, last_name, address,
                  image_filename, image_mime_type, image_size_bytes, image_storage_path,
                  created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                  entryId,
                  current.artistId,
                  current.firstName,
                  current.lastName,
                  current.address,
                  current.image.filename,
                  current.image.mimeType,
                  current.image.sizeBytes,
                  storagePath,
                  now,
                ],
              );
              const updated = await execute(
                `
                UPDATE entry_requests
                SET status = 'approved', decided_at = ?, created_entry_id = ?
                WHERE id = ? AND status = 'pending'
                `,
                [now, entryId, id],
              );
              return updated.rowsAffected === 1;
            })
            .pipe(
              Effect.tapError(() => fs.remove(storagePath).pipe(Effect.catch(() => Effect.succeed(undefined)))),
            );
          if (!decided) {
            yield* fs.remove(storagePath).pipe(Effect.catch(() => Effect.succeed(undefined)));
            const conflict: DecideEntryRequestResult = { kind: "conflict" };
            return conflict;
          }
          const request = yield* load(id);
          if (request === undefined) {
            return yield* Effect.fail(new StorageError({ cause: "Approved entry request could not be reloaded." }));
          }
          const approved: DecideEntryRequestResult = { kind: "decided", request };
          return approved;
        }),
      reject: (id) =>
        Effect.gen(function* () {
          const now = new Date().toISOString();
          yield* database.execute(
            `
            UPDATE entry_requests
            SET status = 'rejected', decided_at = ?
            WHERE id = ? AND status = 'pending'
            `,
            [now, id],
          );
          const request = yield* load(id);
          if (request === undefined) {
            const missing: DecideEntryRequestResult = { kind: "missing" };
            return missing;
          }
          if (request.status === "rejected" && request.decidedAt === now) {
            const rejected: DecideEntryRequestResult = { kind: "decided", request };
            return rejected;
          }
          if (request.status === "pending") {
            return yield* Effect.fail(new StorageError({ cause: "Reject did not update the entry request." }));
          }
          const conflict: DecideEntryRequestResult = { kind: "conflict" };
          return conflict;
        }),
    };
  }),
);
