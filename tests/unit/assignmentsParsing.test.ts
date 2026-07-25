import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { parseAssignmentDate, unitRange } from "../../server/routes/assignments";

function fmt(d: Date) {
  return format(d, "yyyy-MM-dd");
}

describe("assignments CSV parseAssignmentDate", () => {
  it("accepts ISO dates and converts dd/mm/yyyy", () => {
    expect(parseAssignmentDate("2026-01-01")).toBe("2026-01-01");
    expect(parseAssignmentDate("25/12/2026")).toBe("2026-12-25");
  });

  it("returns null for empty or unparseable values", () => {
    expect(parseAssignmentDate("")).toBeNull();
    expect(parseAssignmentDate("nope")).toBeNull();
  });
});

describe("unitRange", () => {
  it("returns the same day for both bounds on 'day'", () => {
    const { start, end } = unitRange("2026-07-22", "day");
    expect(fmt(start)).toBe(fmt(end));
  });

  it("returns the Mon-Sun week bounds for 'week' (week starts on Monday)", () => {
    // 2026-07-22 is a Wednesday
    const { start, end } = unitRange("2026-07-22", "week");
    expect(fmt(start)).toBe("2026-07-20"); // Monday
    expect(fmt(end)).toBe("2026-07-26"); // Sunday
  });

  it("returns the calendar month bounds for 'month'", () => {
    const { start, end } = unitRange("2026-07-22", "month");
    expect(fmt(start)).toBe("2026-07-01");
    expect(fmt(end)).toBe("2026-07-31");
  });

  it("returns the calendar year bounds for 'year'", () => {
    const { start, end } = unitRange("2026-07-22", "year");
    expect(fmt(start)).toBe("2026-01-01");
    expect(fmt(end)).toBe("2026-12-31");
  });
});
