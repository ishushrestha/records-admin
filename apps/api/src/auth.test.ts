import { rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { PASSWORD, USERNAME, cookieOf, createApp, login, tempRecordsDir } from "./testSupport.js";

const directory = tempRecordsDir("records-auth-");
const app = createApp(directory);

afterAll(async () => {
  await app.dispose();
  rmSync(directory, { recursive: true, force: true });
});

describe("admin login", () => {
  it("rejects a wrong username or password without setting a cookie", async () => {
    const wrongUser = await login(app.handler, "someone-else", PASSWORD);
    const wrongPassword = await login(app.handler, USERNAME, "nope");
    for (const response of [wrongUser, wrongPassword]) {
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("unauthorized");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("accepts the configured account and sets an httpOnly session cookie", async () => {
    const response = await login(app.handler);
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toContain(PASSWORD);
    const session = await app.handler(
      new Request("http://localhost/api/admin/session", { headers: { cookie: cookieOf(response) } }),
    );
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ authenticated: true });
  });

  it("clears the session cookie on logout", async () => {
    const response = await app.handler(new Request("http://localhost/api/admin/logout", { method: "POST" }));
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Max-Age=0/i);
    const session = await app.handler(new Request("http://localhost/api/admin/session"));
    expect(session.status).toBe(401);
  });

  it("rejects artist and entry routes without a session", async () => {
    const list = await app.handler(new Request("http://localhost/api/artists"));
    const created = await app.handler(
      new Request("http://localhost/api/artists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada Lovelace" }),
      }),
    );
    const detail = await app.handler(new Request("http://localhost/api/artists/A0001"));
    expect(list.status).toBe(401);
    expect(created.status).toBe(401);
    expect(detail.status).toBe(401);
  });
});

describe("login lockout", () => {
  const limitedDirectory = tempRecordsDir("records-auth-limit-");
  const limited = createApp(limitedDirectory);

  afterAll(async () => {
    await limited.dispose();
    rmSync(limitedDirectory, { recursive: true, force: true });
  });

  it("blocks further attempts after repeated failures", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login(limited.handler, USERNAME, "wrong");
      expect(response.status).toBe(401);
    }
    const blocked = await login(limited.handler, USERNAME, PASSWORD);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
    expect(blocked.headers.get("set-cookie")).toBeNull();
  });
});

describe("unconfigured login", () => {
  const closedDirectory = tempRecordsDir("records-auth-closed-");
  const closed = createApp(closedDirectory, { adminUsername: undefined, adminPassword: undefined });

  afterAll(async () => {
    await closed.dispose();
    rmSync(closedDirectory, { recursive: true, force: true });
  });

  it("stays closed when the username or password is unset", async () => {
    const response = await login(closed.handler, USERNAME, PASSWORD);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("unavailable");
  });
});
