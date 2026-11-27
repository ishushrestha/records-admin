import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "./config.js";
import { makeHandler } from "./server.js";

export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const USERNAME = "admin";
export const PASSWORD = "correct-horse";

export function testConfig(directory: string): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    databaseUrl: `file:${join(directory, "records.db")}`,
    uploadDir: join(directory, "uploads"),
    allowedOrigins: ["http://localhost:5174"],
    adminUsername: USERNAME,
    adminPassword: PASSWORD,
    sessionSecret: "test-session-secret",
    secureCookies: false,
    trustedProxyCidrs: [],
    webRoot: undefined,
  };
}

export function tempRecordsDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function createApp(directory: string, overrides: Partial<AppConfig> = {}) {
  return makeHandler({ ...testConfig(directory), ...overrides });
}

export async function login(
  handler: (request: Request) => Promise<Response>,
  username = USERNAME,
  password = PASSWORD,
): Promise<Response> {
  return handler(
    new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
}

export function cookieOf(response: Response): string {
  const pair = response.headers.get("set-cookie")?.split(";")[0];
  if (pair === undefined || pair.length === 0) {
    throw new Error("missing set-cookie");
  }
  return pair;
}

export async function authedCookie(handler: (request: Request) => Promise<Response>): Promise<string> {
  const response = await login(handler);
  if (response.status !== 200) {
    throw new Error(`Login failed with ${response.status}`);
  }
  return cookieOf(response);
}
