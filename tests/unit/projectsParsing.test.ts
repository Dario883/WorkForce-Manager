import { describe, expect, it } from "vitest";
import { parseStatus, parseDeliveryType, parseDate } from "../../server/routes/projects";

describe("projects CSV parseStatus", () => {
  it("passes through valid statuses, normalizing case/spaces/dashes to underscores", () => {
    expect(parseStatus("active")).toBe("active");
    expect(parseStatus("On Hold")).toBe("on_hold");
    expect(parseStatus("on-hold")).toBe("on_hold");
  });

  it("defaults to planned for missing or invalid values", () => {
    expect(parseStatus(undefined)).toBe("planned");
    expect(parseStatus("archiviato")).toBe("planned");
  });
});

describe("projects CSV parseDeliveryType", () => {
  it("matches case-insensitively against the valid delivery types", () => {
    expect(parseDeliveryType("t&m")).toBe("T&M");
    expect(parseDeliveryType("TAAS")).toBe("TaaS");
    expect(parseDeliveryType("tk")).toBe("TK");
  });

  it("defaults to T&M for missing or invalid values", () => {
    expect(parseDeliveryType(undefined)).toBe("T&M");
    expect(parseDeliveryType("bogus")).toBe("T&M");
  });
});

describe("projects CSV parseDate", () => {
  it("accepts ISO dates and converts dd/mm/yyyy", () => {
    expect(parseDate("2026-01-01")).toBe("2026-01-01");
    expect(parseDate("1/2/2026")).toBe("2026-02-01");
  });

  it("returns null for empty or unparseable values", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("garbage")).toBeNull();
  });
});
