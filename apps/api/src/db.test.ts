import { rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { authedCookie, createApp, tempRecordsDir, testConfig } from "./testSupport.js";

describe("legacy databases", () => {
  it("drops a leftover entry_requests table and still serves artists", async () => {
    const directory = tempRecordsDir("records-legacy-");
    const config = testConfig(directory);
    const setup = createClient({ url: config.databaseUrl });
    await setup.execute("CREATE TABLE entry_requests (id TEXT PRIMARY KEY)");
    const before = await setup.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entry_requests'",
    );
    setup.close();
    expect(before.rows).toHaveLength(1);

    const app = createApp(directory);
    try {
      const cookie = await authedCookie(app.handler);
      const response = await app.handler(new Request("http://localhost/api/artists", { headers: { cookie } }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ artists: [] });

      const leftover = createClient({ url: config.databaseUrl });
      const after = await leftover.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entry_requests'",
      );
      leftover.close();
      expect(after.rows).toHaveLength(0);
    } finally {
      await app.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
