import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { NodeServices } from "@effect/platform-node";
import {
  ARTIST_ID_PATTERN,
  IMAGE_MAX_BYTES,
  createArtistSchema,
  createEntryFieldsSchema,
  fieldErrorsFromZod,
  imageMimeTypeSchema,
  type ApiErrorBody,
  type ImageMimeType,
} from "@records/contracts";
import { ByteSize, Effect, FileSystem, Layer, Option } from "effect";
import {
  HttpIncomingMessage,
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  Multipart,
} from "effect/http";
import { IpNetwork } from "effect/net";
import { ADMIN_COOKIE, AdminAuth, AdminAuthLive } from "./auth.js";
import { Artists, ArtistsLive } from "./artists.js";
import type { AppConfig } from "./config.js";
import { DatabaseLive } from "./db.js";
import { Entries, EntriesLive } from "./entries.js";
import { StorageError } from "./errors.js";
import { AppConfigService } from "./services.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown, headers?: Record<string, string>) {
  // Leave Content-Length unset. Effect would store it as a string, and Node's
  // strictContentLength check compares that string to the numeric byte count
  // with !==, so matching lengths still throw on some Node 22 releases.
  return HttpServerResponse.raw(JSON.stringify(body), {
    status,
    contentType: "application/json",
    headers,
  });
}

function errorBody(error: ApiErrorBody["error"], message: string, fields?: Record<string, string>): ApiErrorBody {
  return fields === undefined ? { error, message } : { error, message, fields };
}

function validation(fields: Record<string, string>, message = "Check the highlighted fields.") {
  return json(400, errorBody("validation_error", message, fields));
}

function notFound(message: string) {
  return json(404, errorBody("not_found", message));
}

function internalError() {
  return json(500, errorBody("internal_error", "Something went wrong while saving."));
}

function unauthorized() {
  return json(401, errorBody("unauthorized", "Sign in to continue."));
}

const ensureAdmin = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const auth = yield* AdminAuth;
  return auth.isAuthenticated(request.cookies[ADMIN_COOKIE]);
});

function textField(form: Multipart.Persisted, key: string): string {
  const value = form[key];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") {
      return first;
    }
  }
  return "";
}

type UploadSelection =
  | { readonly kind: "missing" }
  | { readonly kind: "multiple" }
  | { readonly kind: "file"; readonly file: Multipart.PersistedFile };

function selectUpload(form: Multipart.Persisted): UploadSelection {
  const value = form.image;
  if (value === undefined || typeof value === "string" || !Array.isArray(value) || value.length === 0) {
    return { kind: "missing" };
  }
  if (value.length !== 1) {
    return { kind: "multiple" };
  }
  const first = value[0];
  if (first === undefined || !Multipart.isPersistedFile(first)) {
    return { kind: "missing" };
  }
  return { kind: "file", file: first };
}

function sniffMime(bytes: Uint8Array): ImageMimeType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

function safeOriginalName(name: string): string {
  const base = name.split(/[/\\]/u).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ()]+/gu, "").trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : "upload";
}

function artistId(params: Readonly<Record<string, string | undefined>>): string | undefined {
  const id = params.artistId;
  if (id === undefined || !ARTIST_ID_PATTERN.test(id)) {
    return undefined;
  }
  return id;
}

function entryId(params: Readonly<Record<string, string | undefined>>): string | undefined {
  const id = params.entryId;
  if (id === undefined || !UUID_PATTERN.test(id)) {
    return undefined;
  }
  return id;
}

const readMultipart = (request: HttpServerRequest.HttpServerRequest) =>
  request.multipart.pipe(
    Effect.provideService(Multipart.MaxFileSize)(ByteSize.bytes(IMAGE_MAX_BYTES)),
    Effect.provideService(Multipart.MaxFieldSize)(ByteSize.bytes(16 * 1024)),
    Effect.provideService(HttpIncomingMessage.MaxBodySize)(ByteSize.bytes(6 * 1024 * 1024)),
  );

type InspectedImage =
  | { readonly ok: true; readonly mimeType: ImageMimeType; readonly sizeBytes: number }
  | { readonly ok: false; readonly message: string };

const rejectedImage = (message: string): InspectedImage => ({ ok: false, message });

const inspectUpload = (
  file: Multipart.PersistedFile,
): Effect.Effect<InspectedImage, StorageError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(file.path).pipe(Effect.mapError((cause) => new StorageError({ cause })));
    if (bytes.byteLength === 0) {
      return rejectedImage("Choose a JPEG, PNG, or WebP image.");
    }
    if (bytes.byteLength > IMAGE_MAX_BYTES) {
      return rejectedImage("Image must be 5 MB or smaller.");
    }
    const parsed = imageMimeTypeSchema.safeParse(sniffMime(bytes));
    if (!parsed.success) {
      return rejectedImage("Use a JPEG, PNG, or WebP image.");
    }
    const accepted: InspectedImage = { ok: true, mimeType: parsed.data, sizeBytes: bytes.byteLength };
    return accepted;
  });

const recover = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        if (Multipart.isMultipartError(error)) {
          const reason = error.reason._tag;
          if (reason === "FileTooLarge" || reason === "BodyTooLarge") {
            return validation({ image: "Image must be 5 MB or smaller." });
          }
          if (reason === "FieldTooLarge") {
            return validation({ address: "That value is too long." });
          }
          return validation({}, "Submit the form as multipart data with the required fields.");
        }
        yield* Effect.logError(error);
        return internalError();
      }),
    ),
  );

function resolvePublicFile(webRoot: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) {
    return undefined;
  }
  const relativeRequest = decoded.replace(/^\/+/, "");
  const candidate = resolve(webRoot, relativeRequest);
  const fromRoot = relative(webRoot, candidate);
  if (fromRoot.startsWith("..") || fromRoot.startsWith(sep) || isAbsolute(fromRoot)) {
    return undefined;
  }
  if (!existsSync(candidate)) {
    return undefined;
  }
  return statSync(candidate).isFile() ? candidate : undefined;
}

function contentTypeOf(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

const serveWeb = (webRoot: string) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname.startsWith("/api")) {
      return notFound("Not found.");
    }
    const filePath = resolvePublicFile(webRoot, pathname);
    if (filePath !== undefined) {
      return HttpServerResponse.raw(readFileSync(filePath), { contentType: contentTypeOf(filePath) });
    }
    const index = join(webRoot, "index.html");
    if (extname(pathname) !== "" || !existsSync(index)) {
      return notFound("Not found.");
    }
    return HttpServerResponse.raw(readFileSync(index), { contentType: "text/html; charset=utf-8" });
  });

function cookieSecure(request: HttpServerRequest.HttpServerRequest): boolean {
  return Option.exists(HttpServerRequest.toURL(request), (url) => url.protocol === "https:");
}

const healthRoute = HttpRouter.add("GET", "/api/health", json(200, { ok: true }));

const loginRoute = HttpRouter.add(
  "POST",
  "/api/admin/login",
  recover(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const raw = yield* request.text.pipe(Effect.provideService(HttpIncomingMessage.MaxBodySize)(ByteSize.bytes(4 * 1024)));
      let username = "";
      let password = "";
      try {
        const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown };
        username = typeof parsed.username === "string" ? parsed.username : "";
        password = typeof parsed.password === "string" ? parsed.password : "";
      } catch {
        return validation({ username: "Enter your username.", password: "Enter your password." });
      }
      const auth = yield* AdminAuth;
      const result = yield* auth.login(username, password, cookieSecure(request));
      if (!result.ok && result.reason === "rate_limited") {
        return json(429, errorBody("rate_limited", "Too many attempts. Wait a few minutes and try again."), {
          "retry-after": "900",
        });
      }
      if (!result.ok && result.reason === "unconfigured") {
        return json(503, errorBody("unavailable", "Admin login is not configured."));
      }
      if (!result.ok) {
        return json(401, errorBody("unauthorized", "That username or password is not correct."));
      }
      return json(200, { authenticated: true }, { "set-cookie": result.setCookie });
    }),
  ),
);

const logoutRoute = HttpRouter.add(
  "POST",
  "/api/admin/logout",
  recover(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const auth = yield* AdminAuth;
      return json(200, { authenticated: false }, { "set-cookie": auth.logoutCookie(cookieSecure(request)) });
    }),
  ),
);

const sessionRoute = HttpRouter.add(
  "GET",
  "/api/admin/session",
  recover(
    Effect.gen(function* () {
      if (!(yield* ensureAdmin)) {
        return unauthorized();
      }
      return json(200, { authenticated: true });
    }),
  ),
);

const listArtistsRoute = HttpRouter.add(
  "GET",
  "/api/artists",
  recover(
    Effect.gen(function* () {
      if (!(yield* ensureAdmin)) {
        return unauthorized();
      }
      const artists = yield* Artists;
      return json(200, { artists: yield* artists.list() });
    }),
  ),
);

const createArtistRoute = HttpRouter.add(
  "POST",
  "/api/artists",
  recover(
    Effect.gen(function* () {
      if (!(yield* ensureAdmin)) {
        return unauthorized();
      }
      const request = yield* HttpServerRequest.HttpServerRequest;
      const raw = yield* request.text.pipe(Effect.provideService(HttpIncomingMessage.MaxBodySize)(ByteSize.bytes(8 * 1024)));
      let name = "";
      try {
        const parsed = JSON.parse(raw) as { name?: unknown };
        name = typeof parsed.name === "string" ? parsed.name : "";
      } catch {
        return validation({ name: "Enter a name." });
      }
      const parsed = createArtistSchema.safeParse({ name });
      if (!parsed.success) {
        return validation(fieldErrorsFromZod(parsed.error));
      }
      const artists = yield* Artists;
      return json(201, yield* artists.create(parsed.data.name));
    }),
  ),
);

const getArtistRoute = HttpRouter.add(
  "GET",
  "/api/artists/:artistId",
  recover(
    Effect.gen(function* () {
      if (!(yield* ensureAdmin)) {
        return unauthorized();
      }
      const id = artistId(yield* HttpRouter.params);
      if (id === undefined) {
        return notFound("No artist exists with that id.");
      }
      const artists = yield* Artists;
      const entries = yield* Entries;
      const artist = yield* artists.get(id);
      if (artist === undefined) {
        return notFound("No artist exists with that id.");
      }
      return json(200, { artist, entries: yield* entries.listForArtist(id) });
    }),
  ),
);

const createEntryRoute = HttpRouter.add(
  "POST",
  "/api/artists/:artistId/entries",
  recover(
    Effect.gen(function* () {
      if (!(yield* ensureAdmin)) {
        return unauthorized();
      }
      const id = artistId(yield* HttpRouter.params);
      if (id === undefined) {
        return notFound("No artist exists with that id.");
      }
      const request = yield* HttpServerRequest.HttpServerRequest;
      const form = yield* readMultipart(request);
      const parsed = createEntryFieldsSchema.safeParse({
        firstName: textField(form, "firstName"),
        lastName: textField(form, "lastName"),
        address: textField(form, "address"),
      });
      const fieldErrors: Record<string, string> = parsed.success ? {} : fieldErrorsFromZod(parsed.error);
      const upload = selectUpload(form);
      const inspected = upload.kind === "file" ? yield* inspectUpload(upload.file) : undefined;
      if (upload.kind === "missing") {
        fieldErrors.image = "Choose a JPEG, PNG, or WebP image.";
      } else if (upload.kind === "multiple") {
        fieldErrors.image = "Choose a single image.";
      } else if (inspected !== undefined && !inspected.ok) {
        fieldErrors.image = inspected.message;
      }
      if (!parsed.success || upload.kind !== "file" || inspected === undefined || !inspected.ok) {
        return validation(fieldErrors);
      }
      const entries = yield* Entries;
      const created = yield* entries.create(id, {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        address: parsed.data.address,
        image: {
          originalFilename: safeOriginalName(upload.file.name),
          mimeType: inspected.mimeType,
          sizeBytes: inspected.sizeBytes,
          tempPath: upload.file.path,
        },
      });
      if (created === undefined) {
        return notFound("No artist exists with that id.");
      }
      return json(201, created);
    }),
  ),
);

const getEntryRoute = HttpRouter.add(
  "GET",
  "/api/entries/:entryId",
  recover(
    Effect.gen(function* () {
      if (!(yield* ensureAdmin)) {
        return unauthorized();
      }
      const id = entryId(yield* HttpRouter.params);
      if (id === undefined) {
        return notFound("No entry exists with that id.");
      }
      const entries = yield* Entries;
      const entry = yield* entries.get(id);
      if (entry === undefined) {
        return notFound("No entry exists with that id.");
      }
      return json(200, entry);
    }),
  ),
);

const imageRoute = HttpRouter.add(
  "GET",
  "/api/entries/:entryId/image",
  recover(
    Effect.gen(function* () {
      if (!(yield* ensureAdmin)) {
        return unauthorized();
      }
      const id = entryId(yield* HttpRouter.params);
      if (id === undefined) {
        return notFound("No entry exists with that id.");
      }
      const entries = yield* Entries;
      const image = yield* entries.readImage(id);
      if (image === undefined) {
        return notFound("No entry exists with that id.");
      }
      const filename = image.filename.replaceAll('"', "");
      return HttpServerResponse.raw(image.bytes, {
        contentType: image.mimeType,
        headers: {
          "x-content-type-options": "nosniff",
          "cache-control": "private, no-store",
          "content-disposition": `inline; filename="${filename}"`,
        },
      });
    }),
  ),
);

export const makeRoutes = (config: AppConfig) => {
  const configLayer = Layer.succeed(AppConfigService, config);
  const services = Layer.mergeAll(ArtistsLive, EntriesLive, AdminAuthLive).pipe(
    Layer.provide(DatabaseLive),
    Layer.provide(configLayer),
    Layer.provide(NodeServices.layer),
  );

  const routes = Layer.mergeAll(
    healthRoute,
    loginRoute,
    logoutRoute,
    sessionRoute,
    listArtistsRoute,
    createArtistRoute,
    getArtistRoute,
    createEntryRoute,
    getEntryRoute,
    imageRoute,
    HttpRouter.cors({
      allowedOrigins: [...config.allowedOrigins],
      allowedMethods: ["GET", "POST"],
      allowedHeaders: ["content-type"],
      credentials: true,
      maxAge: 600,
    }),
  );
  const withWeb =
    config.webRoot === undefined ? routes : Layer.mergeAll(routes, HttpRouter.add("GET", "*", recover(serveWeb(config.webRoot))));
  const withProxy =
    config.trustedProxyCidrs.length > 0
      ? Layer.mergeAll(
          withWeb,
          HttpRouter.middleware(
            HttpMiddleware.xForwardedHeaders({
              trustedProxies: config.trustedProxyCidrs.map((cidr) => IpNetwork.fromStringUnsafe(cidr)),
            }),
            { global: true },
          ),
        )
      : withWeb;
  return withProxy.pipe(HttpRouter.provideRequest(services), HttpRouter.provideRequest(NodeServices.layer));
};
