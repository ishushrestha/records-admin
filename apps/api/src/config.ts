import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const DOCUMENTED_ADMIN_USERNAME = "admin";
export const DOCUMENTED_ADMIN_PASSWORD = "change-me";
export const MIN_PRODUCTION_PASSWORD_LENGTH = 12;
export const DEFAULT_WEB_ORIGIN = "http://localhost:5174";
export const DEFAULT_HOST = "127.0.0.1";

export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly uploadDir: string;
  /** Browser origins allowed to call the API (CORS). */
  readonly allowedOrigins: readonly string[];
  /** Admin username. Undefined when login is not configured. */
  readonly adminUsername: string | undefined;
  /** Admin password. Undefined when login is not configured. */
  readonly adminPassword: string | undefined;
  /** HMAC key for the admin session cookie. */
  readonly sessionSecret: string;
  /** Set the session cookie Secure flag (production / HTTPS). */
  readonly secureCookies: boolean;
  /** Apply X-Forwarded-* headers from loopback proxies such as Caddy. */
  readonly trustProxy: boolean;
  /** Directory of the Vite web build. Undefined when the API does not serve the UI. */
  readonly webRoot: string | undefined;
}

function loadEnvFile(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (key.length > 0 && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return;
  }
}

function readPort(raw: string | undefined): number {
  const value = raw ?? "3002";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

export function readHost(raw: string | undefined): string {
  const value = raw?.trim();
  return value === undefined || value.length === 0 ? DEFAULT_HOST : value;
}

function resolveDatabaseUrl(raw: string, baseDir: string): string {
  if (!raw.startsWith("file:")) {
    return raw;
  }
  const pathPart = raw.slice("file:".length);
  if (pathPart.startsWith("/") || pathPart.startsWith("//")) {
    return raw;
  }
  return `file:${resolve(baseDir, pathPart)}`;
}

function resolveUploadDir(raw: string, baseDir: string): string {
  return isAbsolute(raw) ? raw : resolve(baseDir, raw);
}

function optionalSecret(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export function parseOrigins(raw: string | undefined, fallback: string): readonly string[] {
  const source = raw?.trim() ? raw : fallback;
  const origins = source.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return origins.length > 0 ? origins : [fallback];
}

export function productionStartupError(input: {
  readonly nodeEnv: string | undefined;
  readonly adminUsername: string | undefined;
  readonly adminPassword: string | undefined;
}): string | undefined {
  if (input.nodeEnv !== "production") {
    return undefined;
  }
  const username = input.adminUsername ?? "";
  const password = input.adminPassword ?? "";
  if (username.length === 0) {
    return "Refusing to start in production: ADMIN_USERNAME is empty. Set a username that is not the documented default.";
  }
  if (username === DOCUMENTED_ADMIN_USERNAME) {
    return `Refusing to start in production: ADMIN_USERNAME is the documented default (${DOCUMENTED_ADMIN_USERNAME}). Set a different username in .env.`;
  }
  if (password.length === 0) {
    return `Refusing to start in production: ADMIN_PASSWORD is empty. Set a password of at least ${MIN_PRODUCTION_PASSWORD_LENGTH} characters.`;
  }
  if (password === DOCUMENTED_ADMIN_PASSWORD) {
    return "Refusing to start in production: ADMIN_PASSWORD is the documented default. Set a fresh password of at least 12 characters in .env.";
  }
  if (password.length < MIN_PRODUCTION_PASSWORD_LENGTH) {
    return `Refusing to start in production: ADMIN_PASSWORD must be at least ${MIN_PRODUCTION_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

function resolveWebRoot(raw: string | undefined, baseDir: string, production: boolean): string | undefined {
  const dir = raw === undefined || raw.trim().length === 0 ? resolve(baseDir, "../web/dist") : isAbsolute(raw) ? raw : resolve(baseDir, raw);
  if (existsSync(join(dir, "index.html"))) {
    return dir;
  }
  if (production) {
    throw new Error(`Refusing to start in production: the web build is missing at ${dir}. Run pnpm build first.`);
  }
  return undefined;
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  const baseDir = process.cwd();
  const production = process.env.NODE_ENV === "production";
  const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL ?? "file:./data/records.db", baseDir);
  const uploadDir = resolveUploadDir(process.env.UPLOAD_DIR ?? "./data/uploads", baseDir);
  const databasePath = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : null;
  if (databasePath !== null && !databasePath.startsWith("//")) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  mkdirSync(uploadDir, { recursive: true });

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const adminUsername = optionalSecret(process.env.ADMIN_USERNAME);
  const adminPassword = optionalSecret(process.env.ADMIN_PASSWORD);
  const credentialError = productionStartupError({
    nodeEnv: process.env.NODE_ENV,
    adminUsername,
    adminPassword,
  });
  if (credentialError !== undefined) {
    throw new Error(credentialError);
  }

  return {
    host: readHost(process.env.HOST),
    port: readPort(process.env.PORT),
    databaseUrl,
    uploadDir,
    allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS, process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN),
    adminUsername,
    adminPassword,
    sessionSecret: sessionSecret === undefined || sessionSecret.length === 0 ? randomBytes(32).toString("base64url") : sessionSecret,
    secureCookies: production,
    trustProxy: production,
    webRoot: resolveWebRoot(process.env.WEB_ROOT, baseDir, production),
  };
}
