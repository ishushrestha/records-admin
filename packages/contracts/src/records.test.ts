import { describe, expect, it } from "vitest";
import { ARTIST_ID_PATTERN, createEntryFieldsSchema, formatArtistId } from "./records.js";

describe("formatArtistId", () => {
  it("formats a positive sequence as A0001 and rejects anything else", () => {
    expect(formatArtistId(1)).toBe("A0001");
    expect(formatArtistId(2)).toBe("A0002");
    expect(formatArtistId(42)).toBe("A0042");
    expect(formatArtistId(9999)).toBe("A9999");
    expect(formatArtistId(10000)).toBe("A10000");
    for (const id of ["A0001", "A0002", "A9999", "A10000"]) {
      expect(ARTIST_ID_PATTERN.test(id)).toBe(true);
    }
    expect(ARTIST_ID_PATTERN.test("A0000")).toBe(false);
    expect(ARTIST_ID_PATTERN.test("a0001")).toBe(false);
    expect(ARTIST_ID_PATTERN.test("artist-1")).toBe(false);
    expect(() => formatArtistId(0)).toThrow(/positive integer/);
    expect(() => formatArtistId(-1)).toThrow(/positive integer/);
    expect(() => formatArtistId(1.5)).toThrow(/positive integer/);
  });
});

describe("createEntryFieldsSchema", () => {
  it("trims the intake fields and reports the first error for each one", () => {
    const parsed = createEntryFieldsSchema.safeParse({
      firstName: " Ada ",
      lastName: "Lovelace",
      address: "12 Analytical Engine\nLondon",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).toBe("Ada");
      expect(parsed.data.address).toBe("12 Analytical Engine\nLondon");
    }

    const windows = createEntryFieldsSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      address: "12 Analytical Engine\r\nLondon",
    });
    expect(windows.success).toBe(true);
    if (windows.success) {
      expect(windows.data.address).toBe("12 Analytical Engine\nLondon");
    }

    const invalid = createEntryFieldsSchema.safeParse({
      firstName: "",
      lastName: "",
      address: "",
    });
    expect(invalid.success).toBe(false);
  });
});
