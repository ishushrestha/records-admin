import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { entrySchema, imageMimeTypeSchema, type Entry, type ImageMimeType } from "@records/contracts";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { Database } from "./db.js";
import { StorageError } from "./errors.js";
import { AppConfigService } from "./services.js";

export interface NewEntry {
  readonly firstName: string;
  readonly lastName: string;
  readonly address: string;
  readonly image: {
    readonly originalFilename: string;
    readonly mimeType: ImageMimeType;
    readonly sizeBytes: number;
    readonly tempPath: string;
  };
}

export interface StoredImage {
  readonly bytes: Uint8Array;
  readonly mimeType: ImageMimeType;
  readonly filename: string;
}

export class Entries extends Context.Service<
  Entries,
  {
    readonly listForArtist: (artistId: string) => Effect.Effect<readonly Entry[], StorageError>;
    readonly get: (id: string) => Effect.Effect<Entry | undefined, StorageError>;
    readonly create: (artistId: string, input: NewEntry) => Effect.Effect<Entry | undefined, StorageError>;
    readonly readImage: (id: string) => Effect.Effect<StoredImage | undefined, StorageError>;
  }
>()("records/Entries") {}

function text(row: Row, key: string): string {
  const value = row[key];
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

function toEntry(row: Row): Entry {
  const parsed = entrySchema.safeParse({
    id: text(row, "id"),
    artistId: text(row, "artist_id"),
    firstName: text(row, "first_name"),
    lastName: text(row, "last_name"),
    address: text(row, "address"),
    image: {
      filename: text(row, "image_filename"),
      mimeType: text(row, "image_mime_type"),
      sizeBytes: sizeBytes(row),
    },
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

const SELECT_ENTRY = `
  SELECT
    id, artist_id, first_name, last_name, address,
    image_filename, image_mime_type, image_size_bytes, image_storage_path,
    created_at
  FROM entries
`;

export const EntriesLive = Layer.effect(
  Entries,
  Effect.gen(function* () {
    const database = yield* Database;
    const config = yield* AppConfigService;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return {
      listForArtist: (artistId) =>
        Effect.gen(function* () {
          const rows = yield* database.execute(`${SELECT_ENTRY} WHERE artist_id = ? ORDER BY created_at DESC`, [artistId]);
          try {
            return rows.map((row) => toEntry(row));
          } catch (cause) {
            return yield* Effect.fail(storageError(cause));
          }
        }),
      get: (id) =>
        Effect.gen(function* () {
          const rows = yield* database.execute(`${SELECT_ENTRY} WHERE id = ?`, [id]);
          const row = rows[0];
          if (row === undefined) {
            return undefined;
          }
          try {
            return toEntry(row);
          } catch (cause) {
            return yield* Effect.fail(storageError(cause));
          }
        }),
      create: (artistId, input) =>
        Effect.gen(function* () {
          const artist = yield* database.execute("SELECT id FROM artists WHERE id = ?", [artistId]);
          if (artist.length === 0) {
            return undefined;
          }
          const id = randomUUID();
          const createdAt = new Date().toISOString();
          const storageName = `${id}.${extensionFor(input.image.mimeType)}`;
          const storagePath = path.join(config.uploadDir, storageName);
          yield* fs.makeDirectory(config.uploadDir, { recursive: true }).pipe(Effect.mapError(storageError));
          yield* fs.copyFile(input.image.tempPath, storagePath).pipe(Effect.mapError(storageError));
          yield* database
            .execute(
              `
              INSERT INTO entries (
                id, artist_id, first_name, last_name, address,
                image_filename, image_mime_type, image_size_bytes, image_storage_path,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                id,
                artistId,
                input.firstName,
                input.lastName,
                input.address,
                input.image.originalFilename,
                input.image.mimeType,
                input.image.sizeBytes,
                storagePath,
                createdAt,
              ],
            )
            .pipe(
              Effect.tapError(() => fs.remove(storagePath).pipe(Effect.catch(() => Effect.succeed(undefined)))),
            );
          const parsed = entrySchema.safeParse({
            id,
            artistId,
            firstName: input.firstName,
            lastName: input.lastName,
            address: input.address,
            image: {
              filename: input.image.originalFilename,
              mimeType: input.image.mimeType,
              sizeBytes: input.image.sizeBytes,
            },
            createdAt,
          });
          if (!parsed.success) {
            return yield* Effect.fail(new StorageError({ cause: parsed.error }));
          }
          return parsed.data;
        }),
      readImage: (id) =>
        Effect.gen(function* () {
          const rows = yield* database.execute(
            "SELECT image_filename, image_mime_type, image_storage_path FROM entries WHERE id = ?",
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
          const parsedMime = imageMimeTypeSchema.safeParse(mimeType);
          if (!parsedMime.success) {
            return yield* Effect.fail(new StorageError({ cause: parsedMime.error }));
          }
          const bytes = yield* fs.readFile(storagePath).pipe(Effect.mapError(storageError));
          return { bytes, mimeType: parsedMime.data, filename };
        }),
    };
  }),
);
