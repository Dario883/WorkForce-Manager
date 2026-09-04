import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/absences", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  async function adminAgent() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    return loginAgent("admin@test.local");
  }

  it("creates an absence defaulting to ferie/in_attesa", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const res = await agent
      .post("/api/absences")
      .send({ personId: person.body.id, startDate: "2026-08-01", endDate: "2026-08-05" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "ferie", status: "in_attesa" });
  });

  it("rejects an end date before the start date", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const res = await agent
      .post("/api/absences")
      .send({ personId: person.body.id, startDate: "2026-08-05", endDate: "2026-08-01" });
    expect(res.status).toBe(400);
  });

  it("supports an hourly absence on a single day", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const res = await agent.post("/api/absences").send({
      personId: person.body.id,
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      hours: 4,
    });
    expect(res.status).toBe(201);
    expect(res.body.hours).toBe(4);
  });

  it("transitions status via PUT /:id/status and records an activity log entry", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const absence = await agent
      .post("/api/absences")
      .send({ personId: person.body.id, startDate: "2026-08-01", endDate: "2026-08-05" });

    const res = await agent.put(`/api/absences/${absence.body.id}/status`).send({ status: "approvata" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approvata");

    const activity = await agent.get("/api/activity");
    expect(activity.body.some((e: { entityType: string; action: string }) => e.entityType === "assenza" && e.action === "updated")).toBe(true);
  });

  it("rejects an invalid status transition value", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const absence = await agent
      .post("/api/absences")
      .send({ personId: person.body.id, startDate: "2026-08-01", endDate: "2026-08-05" });
    const res = await agent.put(`/api/absences/${absence.body.id}/status`).send({ status: "bogus" });
    expect(res.status).toBe(400);
  });

  it("imports absences from CSV, matching people by name and skipping unknown ones", async () => {
    const agent = await adminAgent();
    await agent.post("/api/people").send({ name: "Mario Rossi" });
    const csv =
      "personName,type,startDate,endDate,notes\n" +
      "Mario Rossi,ferie,10/08/2026,14/08/2026,\n" +
      "Sconosciuto,ferie,10/08/2026,14/08/2026,\n";
    const res = await agent.post("/api/absences/import").send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(1);
  });

  it("deletes an absence", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const absence = await agent
      .post("/api/absences")
      .send({ personId: person.body.id, startDate: "2026-08-01", endDate: "2026-08-05" });
    const del = await agent.delete(`/api/absences/${absence.body.id}`);
    expect(del.status).toBe(204);
    const list = await agent.get("/api/absences");
    expect(list.body).toHaveLength(0);
  });
});
