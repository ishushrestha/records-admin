import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import { AppConfigService } from "./services.js";

export const ADMIN_COOKIE = "records_admin";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_CREDENTIAL_LENGTH = 200;

export type LoginResult =
  | { readonly ok: true; readonly setCookie: string }
  | { readonly ok: false; readonly reason: "invalid" | "rate_limited" | "unconfigured" };

export class AdminAuth extends Context.Service<
  AdminAuth,
  {
    readonly login: (username: string, password: string) => Effect.Effect<LoginResult>;
    readonly logoutCookie: () => string;
    readonly isAuthenticated: (token: string | undefined) => boolean;
  }
>()("records/AdminAuth") {}

function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, 32, (error, key) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

function sign(sessionSecret: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt }), "utf8").toString("base64url");
  const mac = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function readExpiry(sessionSecret: string, token: string): number | undefined {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return undefined;
  }
  const payload = token.slice(0, separator);
  const mac = token.slice(separator + 1);
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(mac);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof parsed.exp === "number" ? parsed.exp : undefined;
  } catch {
    return undefined;
  }
}

function cookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [`${ADMIN_COOKIE}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function credentialLengthOk(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CREDENTIAL_LENGTH;
}

export const AdminAuthLive = Layer.effect(
  AdminAuth,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const salt = randomBytes(16);
    const configured = config.adminUsername !== undefined && config.adminPassword !== undefined;
    const usernameKey = configured ? yield* Effect.promise(() => deriveKey(config.adminUsername ?? "", salt)) : undefined;
    const passwordKey = configured ? yield* Effect.promise(() => deriveKey(config.adminPassword ?? "", salt)) : undefined;
    let failures = 0;
    let windowStartedAt = Date.now();

    return {
      login: (username, password) =>
        Effect.gen(function* () {
          const now = Date.now();
          if (now - windowStartedAt > LOGIN_WINDOW_MS) {
            failures = 0;
            windowStartedAt = now;
          }
          if (usernameKey === undefined || passwordKey === undefined) {
            const unconfigured: LoginResult = { ok: false, reason: "unconfigured" };
            return unconfigured;
          }
          if (failures >= MAX_LOGIN_ATTEMPTS) {
            const limited: LoginResult = { ok: false, reason: "rate_limited" };
            return limited;
          }
          const lengthsOk = credentialLengthOk(username) && credentialLengthOk(password);
          const usernameMatch = lengthsOk && timingSafeEqual(yield* Effect.promise(() => deriveKey(username, salt)), usernameKey);
          const passwordMatch = lengthsOk && timingSafeEqual(yield* Effect.promise(() => deriveKey(password, salt)), passwordKey);
          if (!usernameMatch || !passwordMatch) {
            failures += 1;
            const invalid: LoginResult = { ok: false, reason: "invalid" };
            return invalid;
          }
          failures = 0;
          const token = sign(config.sessionSecret, now + SESSION_MAX_AGE_SECONDS * 1000);
          const success: LoginResult = { ok: true, setCookie: cookie(token, SESSION_MAX_AGE_SECONDS, config.secureCookies) };
          return success;
        }),
      logoutCookie: () => cookie("", 0, config.secureCookies),
      isAuthenticated: (token) => {
        if (token === undefined || token.length === 0) {
          return false;
        }
        const expiry = readExpiry(config.sessionSecret, token);
        return expiry !== undefined && expiry > Date.now();
      },
    };
  }),
);
