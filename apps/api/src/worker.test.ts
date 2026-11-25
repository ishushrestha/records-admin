import { rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { afterAll, describe, expect, it } from "vitest";
import { PNG, authedCookie, createApp, tempRecordsDir, testConfig } from "./testSupport.js";

const TOKEN = "test-worker-token";
const directory = tempRecordsDir("records-worker-");
const config = testConfig(directory);
const app = createApp(directory);

afterAll(async () => {
  await app.dispose();
  rmSync(directory, { recursive: true, force: true });
});

function workerHeaders(token = TOKEN): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function createArtist(name: string): Promise<string> {
  const cookie = await authedCookie(app.handler);
  const response = await app.handler(
    new Request("http://localhost/api/artists", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { id: string };
  return body.id;
}

function requestForm(artistId: string, sourceSubmissionId: string, image: File = new File([PNG], "portrait.png", { type: "image/png" })): FormData {
  const body = new FormData();
  body.set("artistId", artistId);
  body.set("firstName", " Ada ");
  body.set("lastName", "Lovelace");
  body.set("address", "12 Analytical Engine\r\nLondon");
  body.set("sourceSubmissionId", sourceSubmissionId);
  body.set("llmNotes", "Matched the record id.");
  body.set("image", image);
  return body;
}

async function postRequest(artistId: string, sourceSubmissionId: string, token = TOKEN): Promise<Response> {
  return app.handler(
    new Request("http://localhost/api/worker/entry-requests", {
      method: "POST",
      headers: workerHeaders(token),
      body: requestForm(artistId, sourceSubmissionId),
    }),
  );
}

describe("worker token", () => {
  it("rejects a missing or wrong token and ignores the admin cookie", async () => {
    const missing = await app.handler(new Request("http://localhost/api/worker/artists/A0001"));
    expect(missing.status).toBe(401);

    const wrong = await app.handler(
      new Request("http://localhost/api/worker/artists/A0001", { headers: workerHeaders("nope") }),
    );
    expect(wrong.status).toBe(401);

    const cookie = await authedCookie(app.handler);
    const cookieOnly = await app.handler(new Request("http://localhost/api/worker/artists/A0001", { headers: { cookie } }));
    expect(cookieOnly.status).toBe(401);

    const adminWithToken = await app.handler(
      new Request("http://localhost/api/artists", { headers: workerHeaders() }),
    );
    expect(adminWithToken.status).toBe(401);
  });

  it("stays closed when WORKER_TOKEN is unset", async () => {
    const closedDirectory = tempRecordsDir("records-worker-closed-");
    const closed = createApp(closedDirectory, { workerToken: undefined });
    try {
      const response = await closed.handler(
        new Request("http://localhost/api/worker/artists/A0001", { headers: workerHeaders(TOKEN) }),
      );
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("unavailable");
    } finally {
      await closed.dispose();
      rmSync(closedDirectory, { recursive: true, force: true });
    }
  });
});

describe("worker artist lookup", () => {
  it("returns the artist for the right token and 404 when the id is unknown", async () => {
    const artistId = await createArtist("Ada Lovelace");
    const found = await app.handler(
      new Request(`http://localhost/api/worker/artists/${artistId}`, { headers: workerHeaders() }),
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ id: artistId, name: "Ada Lovelace" });

    const missing = await app.handler(
      new Request("http://localhost/api/worker/artists/A9999", { headers: workerHeaders() }),
    );
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { message: string };
    expect(body.message).toMatch(/No artist/);
  });
});

describe("worker entry requests", () => {
  it("creates a pending request and returns the same request on a repeat submission id", async () => {
    const artistId = await createArtist("Grace Hopper");
    const created = await postRequest(artistId, "submission-1");
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string; status: string };
    expect(createdBody).toEqual({ id: expect.any(String), status: "pending" });

    const again = await postRequest(artistId, "submission-1");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(createdBody);

    const client = createClient({ url: config.databaseUrl });
    const count = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM entry_requests WHERE source_submission_id = ?",
      args: ["submission-1"],
    });
    client.close();
    expect(Number(count.rows[0]?.count)).toBe(1);
  });

  it("returns 404 when the artist does not exist", async () => {
    const response = await postRequest("A9999", "submission-missing");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/No artist/);
  });
});

describe("admin review", () => {
  it("verify creates exactly one entry and a second verify does not create another", async () => {
    const artistId = await createArtist("Katherine Johnson");
    const created = await postRequest(artistId, "submission-verify");
    expect(created.status).toBe(201);
    const request = (await created.json()) as { id: string };
    const cookie = await authedCookie(app.handler);

    const verified = await app.handler(
      new Request(`http://localhost/api/entry-requests/${request.id}/verify`, { method: "POST", headers: { cookie } }),
    );
    expect(verified.status).toBe(200);
    const verifiedBody = (await verified.json()) as { status: string; createdEntryId: string | null };
    expect(verifiedBody.status).toBe("approved");
    expect(verifiedBody.createdEntryId).toEqual(expect.any(String));

    const again = await app.handler(
      new Request(`http://localhost/api/entry-requests/${request.id}/verify`, { method: "POST", headers: { cookie } }),
    );
    expect(again.status).toBe(409);

    const client = createClient({ url: config.databaseUrl });
    const count = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM entries WHERE artist_id = ?",
      args: [artistId],
    });
    client.close();
    expect(Number(count.rows[0]?.count)).toBe(1);
  });

  it("reject creates no entry", async () => {
    const artistId = await createArtist("Mary Jackson");
    const created = await postRequest(artistId, "submission-reject");
    expect(created.status).toBe(201);
    const request = (await created.json()) as { id: string };
    const cookie = await authedCookie(app.handler);

    const rejected = await app.handler(
      new Request(`http://localhost/api/entry-requests/${request.id}/reject`, { method: "POST", headers: { cookie } }),
    );
    expect(rejected.status).toBe(200);
    const rejectedBody = (await rejected.json()) as { status: string; createdEntryId: string | null };
    expect(rejectedBody.status).toBe("rejected");
    expect(rejectedBody.createdEntryId).toBeNull();

    const verified = await app.handler(
      new Request(`http://localhost/api/entry-requests/${request.id}/verify`, { method: "POST", headers: { cookie } }),
    );
    expect(verified.status).toBe(409);

    const client = createClient({ url: config.databaseUrl });
    const count = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM entries WHERE artist_id = ?",
      args: [artistId],
    });
    client.close();
    expect(Number(count.rows[0]?.count)).toBe(0);
  });
});
