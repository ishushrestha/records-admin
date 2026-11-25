import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export interface AppConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly uploadDir: string;
  readonly webOrigin: string;
  /** Admin username. Undefined when login is not configured. */
  readonly adminUsername: string | undefined;
  /** Admin password. Undefined when login is not configured. */
  readonly adminPassword: string | undefined;
  /** HMAC key for the admin session cookie. */
  readonly sessionSecret: string;
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

export function loadConfig(): AppConfig {
  loadEnvFile();
  const baseDir = process.cwd();
  const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL ?? "file:./data/records.db", baseDir);
  const uploadDir = resolveUploadDir(process.env.UPLOAD_DIR ?? "./data/uploads", baseDir);
  const databasePath = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : null;
  if (databasePath !== null && !databasePath.startsWith("//")) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  mkdirSync(uploadDir, { recursive: true });

  const sessionSecret = process.env.SESSION_SECRET?.trim();

  return {
    port: readPort(process.env.PORT),
    databaseUrl,
    uploadDir,
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5174",
    adminUsername: optionalSecret(process.env.ADMIN_USERNAME),
    adminPassword: optionalSecret(process.env.ADMIN_PASSWORD),
    sessionSecret: sessionSecret === undefined || sessionSecret.length === 0 ? randomBytes(32).toString("base64url") : sessionSecret,
  };
}
