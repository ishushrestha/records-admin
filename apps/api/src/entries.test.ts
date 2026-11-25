import { existsSync, readFileSync, rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { afterAll, describe, expect, it } from "vitest";
import { PNG, authedCookie, createApp, tempRecordsDir, testConfig } from "./testSupport.js";

const directory = tempRecordsDir("records-entries-");
const config = testConfig(directory);
const app = createApp(directory);

afterAll(async () => {
  await app.dispose();
  rmSync(directory, { recursive: true, force: true });
});

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

function entryForm(image: File, fields?: Partial<Record<"firstName" | "lastName" | "address", string>>): FormData {
  const body = new FormData();
  body.set("firstName", fields?.firstName ?? " Ada ");
  body.set("lastName", fields?.lastName ?? "Lovelace");
  body.set("address", fields?.address ?? "12 Analytical Engine\nLondon");
  body.set("image", image);
  return body;
}

describe("entry creation", () => {
  it("stores the intake fields and the image for an artist", async () => {
    const artistId = await createArtist("Ada Lovelace");
    const cookie = await authedCookie(app.handler);
    const response = await app.handler(
      new Request(`http://localhost/api/artists/${artistId}/entries`, {
        method: "POST",
        headers: { cookie },
        body: entryForm(new File([PNG], "portrait.png", { type: "image/png" })),
      }),
    );
    expect(response.status).toBe(201);
    const entry = (await response.json()) as {
      id: string;
      artistId: string;
      firstName: string;
      lastName: string;
      address: string;
      image: { filename: string; mimeType: string; sizeBytes: number };
    };
    expect(entry.artistId).toBe(artistId);
    expect(entry.firstName).toBe("Ada");
    expect(entry.lastName).toBe("Lovelace");
    expect(entry.address).toBe("12 Analytical Engine\nLondon");
    expect(entry.image).toMatchObject({
      filename: "portrait.png",
      mimeType: "image/png",
      sizeBytes: PNG.byteLength,
    });

    const client = createClient({ url: config.databaseUrl });
    const rows = await client.execute({
      sql: "SELECT image_storage_path FROM entries WHERE id = ?",
      args: [entry.id],
    });
    client.close();
    const storedPath = rows.rows[0]?.image_storage_path;
    expect(typeof storedPath).toBe("string");
    if (typeof storedPath !== "string") {
      return;
    }
    expect(existsSync(storedPath)).toBe(true);
    expect(readFileSync(storedPath).equals(PNG)).toBe(true);

    const detail = await app.handler(new Request(`http://localhost/api/artists/${artistId}`, { headers: { cookie } }));
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as { entries: Array<{ id: string }> };
    expect(detailBody.entries.some((item) => item.id === entry.id)).toBe(true);

    const image = await app.handler(new Request(`http://localhost/api/entries/${entry.id}/image`, { headers: { cookie } }));
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.has("content-length")).toBe(false);
    expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);

    const fetched = await app.handler(new Request(`http://localhost/api/entries/${entry.id}`, { headers: { cookie } }));
    expect(fetched.status).toBe(200);
  });

  it("rejects a non-image upload and does not add a row", async () => {
    const artistId = await createArtist("Grace Hopper");
    const cookie = await authedCookie(app.handler);
    const response = await app.handler(
      new Request(`http://localhost/api/artists/${artistId}/entries`, {
        method: "POST",
        headers: { cookie },
        body: entryForm(new File(["hello"], "notes.png", { type: "image/png" })),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { fields?: Record<string, string> };
    expect(body.fields?.image).toMatch(/JPEG, PNG, or WebP/);

    const client = createClient({ url: config.databaseUrl });
    const count = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM entries WHERE artist_id = ?",
      args: [artistId],
    });
    client.close();
    expect(Number(count.rows[0]?.count)).toBe(0);
  });

  it("requires a session to create or read an entry", async () => {
    const artistId = await createArtist("Katherine Johnson");
    const created = await app.handler(
      new Request(`http://localhost/api/artists/${artistId}/entries`, {
        method: "POST",
        body: entryForm(new File([PNG], "portrait.png", { type: "image/png" })),
      }),
    );
    expect(created.status).toBe(401);
  });
});
