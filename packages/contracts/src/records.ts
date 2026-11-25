import { z } from "zod";

export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const imageMimeTypeSchema = z.enum(imageMimeTypes);

export type ImageMimeType = z.infer<typeof imageMimeTypeSchema>;

/** 5 MB. Enforced in the browser and again on the server. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Artist ids are assigned by this service: A0001, A0002, and so on.
 * A0000 is not a valid id. Longer ids stay valid after 9999.
 */
export const ARTIST_ID_PATTERN = /^A(?!0+$)\d{4,}$/;

export function formatArtistId(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Artist sequence must be a positive integer.");
  }
  return `A${String(sequence).padStart(4, "0")}`;
}

function hasDisallowedControl(value: string, allowWhitespace: boolean): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined) {
      continue;
    }
    const isControl = code <= 31 || code === 127;
    const isAllowedWhitespace = allowWhitespace && (code === 9 || code === 10 || code === 13);
    if (isControl && !isAllowedWhitespace) {
      return true;
    }
  }
  return false;
}

export const artistNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(120, "Name must be 120 characters or fewer.")
  .refine((value) => !hasDisallowedControl(value, false), "Remove control characters.");

export const firstNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a first name.")
  .max(80, "First name must be 80 characters or fewer.")
  .refine((value) => !hasDisallowedControl(value, false), "Remove control characters.");

export const lastNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a last name.")
  .max(80, "Last name must be 80 characters or fewer.")
  .refine((value) => !hasDisallowedControl(value, false), "Remove control characters.");

export const addressSchema = z
  .string()
  .trim()
  .transform((value) => value.replaceAll("\r\n", "\n").replaceAll("\r", "\n"))
  .pipe(
    z
      .string()
      .min(1, "Enter an address.")
      .max(500, "Address must be 500 characters or fewer.")
      .refine((value) => !hasDisallowedControl(value, true), "Remove control characters."),
  );

export const artistIdSchema = z.string().regex(ARTIST_ID_PATTERN, "Artist ID must look like A0001.");

export const createArtistSchema = z.object({
  name: artistNameSchema,
});

export type CreateArtist = z.infer<typeof createArtistSchema>;

export const createEntryFieldsSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  address: addressSchema,
});

export type CreateEntryFields = z.infer<typeof createEntryFieldsSchema>;

const timestampSchema = z.iso.datetime();

export const artistSchema = z.object({
  id: artistIdSchema,
  name: z.string(),
  createdAt: timestampSchema,
});

export type Artist = z.infer<typeof artistSchema>;

export const artistListSchema = z.object({
  artists: z.array(artistSchema),
});

export type ArtistList = z.infer<typeof artistListSchema>;

export const entryImageSchema = z.object({
  filename: z.string().min(1),
  mimeType: imageMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(IMAGE_MAX_BYTES),
});

export type EntryImage = z.infer<typeof entryImageSchema>;

export const entrySchema = z.object({
  id: z.uuid(),
  artistId: artistIdSchema,
  firstName: z.string(),
  lastName: z.string(),
  address: z.string(),
  image: entryImageSchema,
  createdAt: timestampSchema,
});

export type Entry = z.infer<typeof entrySchema>;

export const artistDetailSchema = z.object({
  artist: artistSchema,
  entries: z.array(entrySchema),
});

export type ArtistDetail = z.infer<typeof artistDetailSchema>;

export const entryRequestStatuses = ["pending", "approved", "rejected"] as const;

export const entryRequestStatusSchema = z.enum(entryRequestStatuses);

export type EntryRequestStatus = z.infer<typeof entryRequestStatusSchema>;

export const sourceSubmissionIdSchema = z
  .string()
  .trim()
  .min(1, "Enter a source submission ID.")
  .max(80, "Source submission ID must be 80 characters or fewer.")
  .refine((value) => !hasDisallowedControl(value, false), "Remove control characters.");

export const llmNotesSchema = z
  .string()
  .trim()
  .max(2000, "Notes must be 2000 characters or fewer.")
  .refine((value) => !hasDisallowedControl(value, true), "Remove control characters.");

export const workerArtistSchema = z.object({
  id: artistIdSchema,
  name: z.string(),
});

export type WorkerArtist = z.infer<typeof workerArtistSchema>;

export const workerEntryRequestResultSchema = z.object({
  id: z.uuid(),
  status: entryRequestStatusSchema,
});

export type WorkerEntryRequestResult = z.infer<typeof workerEntryRequestResultSchema>;

const nullableTimestampSchema = z.iso.datetime().nullable();

export const entryRequestSchema = z.object({
  id: z.uuid(),
  artistId: artistIdSchema,
  artistName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  address: z.string(),
  image: entryImageSchema,
  sourceSubmissionId: z.string(),
  llmNotes: z.string().nullable(),
  status: entryRequestStatusSchema,
  createdAt: timestampSchema,
  decidedAt: nullableTimestampSchema,
  createdEntryId: z.uuid().nullable(),
});

export type EntryRequest = z.infer<typeof entryRequestSchema>;

export const entryRequestListItemSchema = entryRequestSchema.pick({
  id: true,
  artistId: true,
  artistName: true,
  firstName: true,
  lastName: true,
  status: true,
  createdAt: true,
});

export type EntryRequestListItem = z.infer<typeof entryRequestListItemSchema>;

export const entryRequestListSchema = z.object({
  requests: z.array(entryRequestListItemSchema),
});

export type EntryRequestList = z.infer<typeof entryRequestListSchema>;

export const apiErrorCodes = [
  "validation_error",
  "not_found",
  "internal_error",
  "unauthorized",
  "conflict",
  "rate_limited",
  "unavailable",
] as const;

export const apiErrorSchema = z.object({
  error: z.enum(apiErrorCodes),
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || fields[key] !== undefined) {
      continue;
    }
    fields[key] = issue.message;
  }
  return fields;
}
