import { describe, expect, it } from "vitest";
import { resolveCapacity } from "../../server/routes/staffing";

describe("resolveCapacity", () => {
  it("returns the base capacity when no period covers the day", () => {
    expect(resolveCapacity([], 40, "2026-07-25")).toBe(40);
  });

  it("returns the override when the day falls inside a closed period", () => {
    const periods = [{ startDate: "2026-07-01", endDate: "2026-07-31", hoursPerWeek: 24 }];
    expect(resolveCapacity(periods, 40, "2026-07-25")).toBe(24);
    expect(resolveCapacity(periods, 40, "2026-06-30")).toBe(40);
    expect(resolveCapacity(periods, 40, "2026-08-01")).toBe(40);
  });

  it("treats a null endDate as open-ended", () => {
    const periods = [{ startDate: "2026-07-01", endDate: null, hoursPerWeek: 24 }];
    expect(resolveCapacity(periods, 40, "2030-01-01")).toBe(24);
    expect(resolveCapacity(periods, 40, "2026-06-30")).toBe(40);
  });

  it("is inclusive of both boundary dates", () => {
    const periods = [{ startDate: "2026-07-01", endDate: "2026-07-31", hoursPerWeek: 24 }];
    expect(resolveCapacity(periods, 40, "2026-07-01")).toBe(24);
    expect(resolveCapacity(periods, 40, "2026-07-31")).toBe(24);
  });

  it("picks the first matching period when multiple overlap", () => {
    const periods = [
      { startDate: "2026-01-01", endDate: "2026-12-31", hoursPerWeek: 20 },
      { startDate: "2026-06-01", endDate: "2026-06-30", hoursPerWeek: 10 },
    ];
    expect(resolveCapacity(periods, 40, "2026-06-15")).toBe(20);
  });
});
