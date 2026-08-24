import { describe, expect, it } from "vitest";
import { getAllocationStatus, getAllocationTone } from "../../client/src/pages/DashboardPage";

describe("dashboard allocation helpers", () => {
  it("marks low utilization as under allocated", () => {
    expect(getAllocationStatus(45, 70, 100)).toBe("under");
  });

  it("marks normal utilization as ok", () => {
    expect(getAllocationStatus(82, 70, 100)).toBe("ok");
  });

  it("marks high utilization as over allocated", () => {
    expect(getAllocationStatus(120, 70, 100)).toBe("over");
  });

  it("returns the expected tone for the horizontal bar", () => {
    expect(getAllocationTone(45, 70, 100)).toBe("#f59e0b");
    expect(getAllocationTone(80, 70, 100)).toBe("#10b981");
    expect(getAllocationTone(120, 70, 100)).toBe("#ef4444");
  });
});
