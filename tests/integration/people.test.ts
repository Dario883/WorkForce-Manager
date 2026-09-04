import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/people", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  async function adminAgent() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    return loginAgent("admin@test.local");
  }

  it("creates a person with defaults applied", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/people").send({ name: "Mario Rossi" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Mario Rossi", capacityHoursPerWeek: 40, isApprover: false });
  });

  it("rejects an invalid email", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/people").send({ name: "X", email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("lists people with their resolved manager name via the self-join", async () => {
    const agent = await adminAgent();
    const manager = await agent.post("/api/people").send({ name: "Manager" });
    await agent.post("/api/people").send({ name: "Report", managerId: manager.body.id });

    const list = await agent.get("/api/people");
    const report = list.body.find((p: { name: string }) => p.name === "Report");
    expect(report.managerName).toBe("Manager");
  });

  it("prevents a person from being their own manager", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Solo" });
    const res = await agent.put(`/api/people/${person.body.id}`).send({ managerId: person.body.id });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent person", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/people/999999");
    expect(res.status).toBe(404);
  });

  it("adds and lists capacity override periods, rejecting an inverted range", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Part Time" });

    const bad = await agent
      .post(`/api/people/${person.body.id}/capacity`)
      .send({ startDate: "2026-08-01", endDate: "2026-07-01", hoursPerWeek: 20 });
    expect(bad.status).toBe(400);

    const good = await agent
      .post(`/api/people/${person.body.id}/capacity`)
      .send({ startDate: "2026-07-01", endDate: "2026-08-01", hoursPerWeek: 20 });
    expect(good.status).toBe(201);

    const list = await agent.get(`/api/people/${person.body.id}/capacity`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].hoursPerWeek).toBe(20);
  });

  it("deletes a person", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Temp" });
    const del = await agent.delete(`/api/people/${person.body.id}`);
    expect(del.status).toBe(204);
    const get = await agent.get(`/api/people/${person.body.id}`);
    expect(get.status).toBe(404);
  });

  it("deletes multiple people and cascades related data", async () => {
    const agent = await adminAgent();
    const first = await agent.post("/api/people").send({ name: "Bulk One" });
    const second = await agent.post("/api/people").send({ name: "Bulk Two" });
    const project = await agent.post("/api/projects").send({ name: "Bulk Project" });
    await agent.post("/api/assignments").send({
      personId: first.body.id,
      projectId: project.body.id,
      percentage: 50,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const response = await agent.post("/api/people/bulk-delete").send({ ids: [first.body.id, second.body.id] });
    expect(response.status).toBe(200);
    expect(response.body.deleted).toBe(2);
    expect((await agent.get("/api/people")).body).toHaveLength(0);
    expect((await agent.get("/api/assignments")).body).toHaveLength(0);
  });

  it("imports people from CSV, skipping rows without a name", async () => {
    const agent = await adminAgent();
    const csv = "name,email,role,capacityHoursPerWeek,avatarColor\nAda Lovelace,ada@test.local,Dev,40,#3457d5\n,skip@test.local,Dev,40,#3457d5\n";
    const res = await agent.post("/api/people/import").send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    const list = await agent.get("/api/people");
    expect(list.body.map((p: { name: string }) => p.name)).toContain("Ada Lovelace");
  });
});
