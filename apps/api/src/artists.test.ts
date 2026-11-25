import { rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { ARTIST_ID_PATTERN } from "@records/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { authedCookie, createApp, tempRecordsDir, testConfig } from "./testSupport.js";

const directory = tempRecordsDir("records-artists-");
const config = testConfig(directory);
let app = createApp(directory);

afterAll(async () => {
  await app.dispose();
  rmSync(directory, { recursive: true, force: true });
});

async function createArtist(name: string): Promise<{ id: string; name: string }> {
  const cookie = await authedCookie(app.handler);
  const response = await app.handler(
    new Request("http://localhost/api/artists", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

describe.sequential("artist ids", () => {
  it("assigns A0001 then A0002, keeps them unique, and continues after a restart", async () => {
    const first = await createArtist(" Ada Lovelace ");
    const second = await createArtist("Grace Hopper");
    expect(first).toMatchObject({ id: "A0001", name: "Ada Lovelace" });
    expect(second).toMatchObject({ id: "A0002", name: "Grace Hopper" });
    expect(first.id).not.toBe(second.id);
    expect(ARTIST_ID_PATTERN.test(first.id)).toBe(true);
    expect(ARTIST_ID_PATTERN.test(second.id)).toBe(true);

    await app.dispose();
    app = createApp(directory);
    const third = await createArtist("Katherine Johnson");
    expect(third.id).toBe("A0003");
  });

  it("does not reuse an id after that artist row is removed", async () => {
    const client = createClient({ url: config.databaseUrl });
    await client.execute({ sql: "DELETE FROM artists WHERE id = ?", args: ["A0001"] });
    const duplicate = client.execute({
      sql: "INSERT INTO artists (id, name, created_at) VALUES (?, ?, ?)",
      args: ["A0002", "Duplicate", new Date().toISOString()],
    });
    await expect(duplicate).rejects.toThrow(/UNIQUE/i);
    client.close();

    const next = await createArtist("Mary Jackson");
    expect(next.id).toBe("A0004");
    expect(next.id).not.toBe("A0001");
  });

  it("assigns distinct sequential ids when creates overlap", async () => {
    const cookie = await authedCookie(app.handler);
    const responses = await Promise.all(
      ["Alan", "Edsger", "Barbara"].map((name) =>
        app.handler(
          new Request("http://localhost/api/artists", {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ name }),
          }),
        ),
      ),
    );
    const ids: string[] = [];
    for (const response of responses) {
      expect(response.status).toBe(201);
      const body = (await response.json()) as { id: string };
      expect(ARTIST_ID_PATTERN.test(body.id)).toBe(true);
      ids.push(body.id);
    }
    expect(new Set(ids).size).toBe(3);
    expect(ids.slice().sort()).toEqual(["A0005", "A0006", "A0007"]);
  });

  it("rejects an empty name", async () => {
    const cookie = await authedCookie(app.handler);
    const response = await app.handler(
      new Request("http://localhost/api/artists", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; fields?: Record<string, string> };
    expect(body.error).toBe("validation_error");
    expect(body.fields?.name).toBeTruthy();
  });
});
