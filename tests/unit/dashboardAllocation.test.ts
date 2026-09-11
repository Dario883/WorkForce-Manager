import { describe, expect, it } from "vitest";
import {
  getAllocationStatus,
  getAllocationTone,
  filterPeopleForProductivity,
} from "../../client/src/pages/DashboardPage";
import type { StaffingPersonSnapshot } from "@shared/types";

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

  describe("filterPeopleForProductivity", () => {
    const mockPeople: StaffingPersonSnapshot[] = [
      {
        personId: 1,
        personName: "Eustachio Sardone",
        personType: "dipendente",
        capacityHoursPerWeek: 40,
        avatarColor: "#3457d5",
        days: {},
      },
      {
        personId: 2,
        personName: "Claudio Anelli",
        personType: "consulente",
        capacityHoursPerWeek: 40,
        avatarColor: "#7c3aed",
        days: {},
      },
      {
        personId: 3,
        personName: "Mario Stage",
        personType: "stage",
        capacityHoursPerWeek: 30,
        avatarColor: "#d97706",
        days: {},
      },
    ];

    it("includes all people when includeContractors is true", () => {
      const result = filterPeopleForProductivity(mockPeople, true);
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.personName)).toEqual([
        "Eustachio Sardone",
        "Claudio Anelli",
        "Mario Stage",
      ]);
    });

    it("excludes consulente when includeContractors is false", () => {
      const result = filterPeopleForProductivity(mockPeople, false);
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.personName)).toEqual([
        "Eustachio Sardone",
        "Mario Stage",
      ]);
      expect(result.some((p) => p.personType === "consulente")).toBe(false);
    });
  });
});
