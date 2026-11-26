import {
  apiErrorSchema,
  artistDetailSchema,
  artistListSchema,
  artistSchema,
  entrySchema,
  type Artist,
  type ArtistDetail,
  type Entry,
} from "@records/contracts";

export class ApiError extends Error {
  readonly status: number;
  readonly fields: Readonly<Record<string, string>> | undefined;

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function readError(response: Response, fallback: string): Promise<ApiError> {
  const payload = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return new ApiError(response.status, fallback);
  }
  return new ApiError(response.status, parsed.data.message, parsed.data.fields);
}

export async function fetchSession(): Promise<boolean> {
  const response = await fetch("/api/admin/session", { credentials: "include" });
  return response.ok;
}

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw await readError(response, "Could not log in.");
  }
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
  if (!response.ok) {
    throw await readError(response, "Could not log out.");
  }
}

export async function fetchArtists(): Promise<readonly Artist[]> {
  const response = await fetch("/api/artists", { credentials: "include" });
  if (!response.ok) {
    throw await readError(response, "Could not load artists.");
  }
  const parsed = artistListSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(response.status, "Could not load artists.");
  }
  return parsed.data.artists;
}

export async function createArtist(name: string): Promise<Artist> {
  const response = await fetch("/api/artists", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw await readError(response, "Could not create the artist.");
  }
  const parsed = artistSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(response.status, "Could not create the artist.");
  }
  return parsed.data;
}

export async function fetchArtist(id: string): Promise<ArtistDetail> {
  const response = await fetch(`/api/artists/${id}`, { credentials: "include" });
  if (!response.ok) {
    throw await readError(response, "Could not load that artist.");
  }
  const parsed = artistDetailSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(response.status, "Could not load that artist.");
  }
  return parsed.data;
}

export async function createEntry(artistId: string, body: FormData): Promise<Entry> {
  const response = await fetch(`/api/artists/${artistId}/entries`, {
    method: "POST",
    credentials: "include",
    body,
  });
  if (!response.ok) {
    throw await readError(response, "Could not create the entry.");
  }
  const parsed = entrySchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(response.status, "Could not create the entry.");
  }
  return parsed.data;
}

export async function fetchEntry(id: string): Promise<Entry> {
  const response = await fetch(`/api/entries/${id}`, { credentials: "include" });
  if (!response.ok) {
    throw await readError(response, "Could not load that entry.");
  }
  const parsed = entrySchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(response.status, "Could not load that entry.");
  }
  return parsed.data;
}
