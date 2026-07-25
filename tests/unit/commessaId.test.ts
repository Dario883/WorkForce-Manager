import { describe, expect, it } from "vitest";
import { buildCommessaId } from "../../server/commessaId";

describe("buildCommessaId", () => {
  it("slugifies the name and appends the creation date", () => {
    expect(buildCommessaId("Migrazione Cloud", new Date("2026-07-25T10:00:00Z"))).toBe(
      "migrazione-cloud-2026-07-25"
    );
  });

  it("strips accents/punctuation and collapses repeated separators", () => {
    expect(buildCommessaId("Progetto: Fase 1 -- Analisi!!", new Date("2026-01-01T00:00:00Z"))).toBe(
      "progetto-fase-1-analisi-2026-01-01"
    );
  });

  it("falls back to a generic slug when the name has no alphanumeric characters", () => {
    expect(buildCommessaId("###", new Date("2026-01-01T00:00:00Z"))).toBe("progetto-2026-01-01");
  });
});
