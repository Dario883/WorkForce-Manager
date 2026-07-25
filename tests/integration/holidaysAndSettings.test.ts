import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

afterAll(closeTestDb);

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/holidays", () => {
  beforeEach(resetTestDb);

  async function adminAgent() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    return loginAgent("admin@test.local");
  }

  it("creates and lists a holiday", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/holidays").send({ date: "2026-12-25", name: "Natale" });
    expect(res.status).toBe(201);
    const list = await agent.get("/api/holidays");
    expect(list.body).toHaveLength(1);
  });

  it("rejects a duplicate date", async () => {
    const agent = await adminAgent();
    await agent.post("/api/holidays").send({ date: "2026-12-25", name: "Natale" });
    const res = await agent.post("/api/holidays").send({ date: "2026-12-25", name: "Natale bis" });
    expect(res.status).toBe(409);
  });

  it("deletes a holiday", async () => {
    const agent = await adminAgent();
    const created = await agent.post("/api/holidays").send({ date: "2026-12-25", name: "Natale" });
    const del = await agent.delete(`/api/holidays/${created.body.id}`);
    expect(del.status).toBe(204);
    const list = await agent.get("/api/holidays");
    expect(list.body).toHaveLength(0);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/settings", () => {
  beforeEach(resetTestDb);

  async function adminAgent() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    return loginAgent("admin@test.local");
  }

  it("returns default thresholds when nothing has been saved yet", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ underutilization_threshold: "70", overutilization_threshold: "100" });
  });

  it("upserts thresholds and persists them across requests", async () => {
    const agent = await adminAgent();
    const put = await agent
      .put("/api/settings")
      .send({ underutilization_threshold: "60", overutilization_threshold: "110" });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ underutilization_threshold: "60", overutilization_threshold: "110" });

    const get = await agent.get("/api/settings");
    expect(get.body).toMatchObject({ underutilization_threshold: "60", overutilization_threshold: "110" });
  });
});
