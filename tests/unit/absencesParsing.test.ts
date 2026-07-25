import { describe, expect, it } from "vitest";
import { parseDate, parseType } from "../../server/routes/absences";

describe("absences CSV parseDate", () => {
  it("accepts ISO yyyy-MM-dd unchanged", () => {
    expect(parseDate("2026-07-25")).toBe("2026-07-25");
  });

  it("converts dd/mm/yyyy to yyyy-MM-dd, zero-padding single digits", () => {
    expect(parseDate("5/1/2026")).toBe("2026-01-05");
    expect(parseDate("25/12/2026")).toBe("2026-12-25");
  });

  it("returns null for empty, missing, or unparseable values", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("absences CSV parseType", () => {
  it("passes through a valid, lowercased type", () => {
    expect(parseType("ferie")).toBe("ferie");
    expect(parseType("MALATTIA")).toBe("malattia");
  });

  it("defaults to ferie for missing or invalid values", () => {
    expect(parseType(undefined)).toBe("ferie");
    expect(parseType("vacanza-inventata")).toBe("ferie");
  });
});
