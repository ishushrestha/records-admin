import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_TRUST_PROXY,
  DOCUMENTED_ADMIN_PASSWORD,
  DOCUMENTED_ADMIN_USERNAME,
  MIN_PRODUCTION_PASSWORD_LENGTH,
  parseOrigins,
  parseTrustProxy,
  productionStartupError,
  readHost,
} from "./config.js";
import { createApp, tempRecordsDir } from "./testSupport.js";

describe("production admin credentials", () => {
  const strongPassword = "twelve-chars";
  const productionUser = "records-owner";

  it("does not change development", () => {
    expect(
      productionStartupError({
        nodeEnv: undefined,
        adminUsername: DOCUMENTED_ADMIN_USERNAME,
        adminPassword: DOCUMENTED_ADMIN_PASSWORD,
      }),
    ).toBeUndefined();
    expect(
      productionStartupError({
        nodeEnv: "development",
        adminUsername: undefined,
        adminPassword: undefined,
      }),
    ).toBeUndefined();
  });

  it("refuses the documented defaults, empty values, and short passwords", () => {
    expect(
      productionStartupError({
        nodeEnv: "production",
        adminUsername: DOCUMENTED_ADMIN_USERNAME,
        adminPassword: strongPassword,
      }),
    ).toMatch(/ADMIN_USERNAME is the documented default/u);
    expect(
      productionStartupError({
        nodeEnv: "production",
        adminUsername: productionUser,
        adminPassword: DOCUMENTED_ADMIN_PASSWORD,
      }),
    ).toMatch(/ADMIN_PASSWORD is the documented default/u);
    expect(
      productionStartupError({
        nodeEnv: "production",
        adminUsername: undefined,
        adminPassword: strongPassword,
      }),
    ).toMatch(/ADMIN_USERNAME is empty/u);
    expect(
      productionStartupError({
        nodeEnv: "production",
        adminUsername: productionUser,
        adminPassword: undefined,
      }),
    ).toMatch(/ADMIN_PASSWORD is empty/u);
    expect(
      productionStartupError({
        nodeEnv: "production",
        adminUsername: productionUser,
        adminPassword: "short-pass",
      }),
    ).toMatch(new RegExp(`at least ${MIN_PRODUCTION_PASSWORD_LENGTH}`));
  });

  it("allows a non-default username and a password of at least 12 characters", () => {
    expect(strongPassword.length).toBe(MIN_PRODUCTION_PASSWORD_LENGTH);
    expect(
      productionStartupError({
        nodeEnv: "production",
        adminUsername: productionUser,
        adminPassword: strongPassword,
      }),
    ).toBeUndefined();
  });
});

describe("listen host and CORS origins", () => {
  it("defaults HOST to loopback and splits ALLOWED_ORIGINS on commas", () => {
    expect(readHost(undefined)).toBe("127.0.0.1");
    expect(readHost("")).toBe("127.0.0.1");
    expect(readHost("0.0.0.0")).toBe("0.0.0.0");
    expect(parseOrigins(undefined, "http://localhost:5174")).toEqual(["http://localhost:5174"]);
    expect(parseOrigins("https://records.example.duckdns.org, https://admin.example.com", "http://localhost:5174")).toEqual([
      "https://records.example.duckdns.org",
      "https://admin.example.com",
    ]);
    expect(parseOrigins("https://records.example.duckdns.org:8443", "http://localhost:5174")).toEqual([
      "https://records.example.duckdns.org:8443",
    ]);
  });

  it("defaults TRUST_PROXY to loopback and accepts Docker private ranges", () => {
    expect(parseTrustProxy(undefined)).toEqual(DEFAULT_TRUST_PROXY.split(","));
    expect(parseTrustProxy("")).toEqual(DEFAULT_TRUST_PROXY.split(","));
    expect(parseTrustProxy("10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8,::1/128")).toEqual([
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "127.0.0.0/8",
      "::1/128",
    ]);
    expect(() => parseTrustProxy("not-a-cidr")).toThrow(/Invalid TRUST_PROXY CIDR/u);
  });
});

describe("production web files", () => {
  const directory = tempRecordsDir("records-web-");
  const webRoot = join(directory, "web");
  mkdirSync(webRoot);
  writeFileSync(join(webRoot, "index.html"), "<!doctype html><title>Records admin</title>");
  writeFileSync(join(webRoot, "app.js"), "console.log(1)");
  const app = createApp(directory, { webRoot });

  afterAll(async () => {
    await app.dispose();
    rmSync(directory, { recursive: true, force: true });
  });

  it("serves the SPA and static files from webRoot without leaving that directory", async () => {
    const page = await app.handler(new Request("http://localhost/login"));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/u);
    expect(await page.text()).toContain("Records admin");

    const asset = await app.handler(new Request("http://localhost/app.js"));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toMatch(/javascript/u);
    expect(await asset.text()).toBe("console.log(1)");

    const health = await app.handler(new Request("http://localhost/api/health"));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
  });
});
