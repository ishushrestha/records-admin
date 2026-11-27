import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Exit, Layer, Scope } from "effect";
import { HttpRouter } from "effect/http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeRoutes } from "./http.js";
import { PNG } from "./testSupport.js";

const directory = mkdtempSync(join(tmpdir(), "records-node-server-"));
const server = createServer();
const app = HttpRouter.serve(
  makeRoutes({
    host: "127.0.0.1",
    port: 0,
    databaseUrl: `file:${join(directory, "records.db")}`,
    uploadDir: join(directory, "uploads"),
    allowedOrigins: ["http://localhost:5174"],
    adminUsername: "admin",
    adminPassword: "correct-horse",
    sessionSecret: "test-session-secret",
    secureCookies: false,
    trustedProxyCidrs: [],
    webRoot: undefined,
  }),
  { disableLogger: true },
).pipe(Layer.provide(NodeHttpServer.layer(() => server, { host: "127.0.0.1", port: 0 })));

let port = 0;
let closeScope: Scope.Closeable | undefined;

beforeAll(async () => {
  const scope = await Effect.runPromise(Scope.make());
  closeScope = scope;
  await Effect.runPromise(Layer.launch(app).pipe(Effect.forkIn(scope, { startImmediately: true })));
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.once("listening", () => {
        resolve();
      });
    });
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test server did not bind a TCP port.");
  }
  expect(address.address).toBe("127.0.0.1");
  port = address.port;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (health.status === 200) {
        return;
      }
    } catch {
      // The server is still binding.
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error("The test server did not become ready.");
});

afterAll(async () => {
  if (closeScope !== undefined) {
    await Effect.runPromise(Scope.close(closeScope, Exit.void));
  }
  rmSync(directory, { recursive: true, force: true });
});

describe("real Node HTTP server", () => {
  it("returns parseable JSON and image bodies without a preset Content-Length", async () => {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("content-length")).toBeNull();
    expect(await health.json()).toEqual({ ok: true });

    const anonymous = await fetch(`http://127.0.0.1:${port}/api/admin/session`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({
      error: "unauthorized",
      message: "Sign in to continue.",
    });

    const signedIn = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "correct-horse" }),
    });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({ authenticated: true });
    const cookie = signedIn.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const artistResponse = await fetch(`http://127.0.0.1:${port}/api/artists`, {
      method: "POST",
      headers: { cookie: cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada Lovelace" }),
    });
    expect(artistResponse.status).toBe(201);
    const artist = (await artistResponse.json()) as { id: string };
    expect(artist.id).toBe("A0001");

    const body = new FormData();
    body.set("firstName", "Ada");
    body.set("lastName", "Lovelace");
    body.set("address", "London");
    body.set("image", new File([PNG], "portrait.png", { type: "image/png" }));
    const created = await fetch(`http://127.0.0.1:${port}/api/artists/${artist.id}/entries`, {
      method: "POST",
      headers: { cookie: cookie ?? "" },
      body,
    });
    expect(created.status).toBe(201);
    const entry = (await created.json()) as { id: string };

    const image = await fetch(`http://127.0.0.1:${port}/api/entries/${entry.id}/image`, {
      headers: { cookie: cookie ?? "" },
    });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("content-length")).toBeNull();
    expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);
  });
});
