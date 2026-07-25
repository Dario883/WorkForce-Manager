import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("GET /api/staffing/snapshot", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  async function adminAgent() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    return loginAgent("admin@test.local");
  }

  it("rejects a request missing from/to", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/staffing/snapshot");
    expect(res.status).toBe(400);
  });

  it("sums overlapping assignment percentages per day and reports base capacity", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi", capacityHoursPerWeek: 40 });
    const project = await agent.post("/api/projects").send({ name: "Progetto A", color: "#3987e5" });

    await agent.post("/api/assignments").send({
      personId: person.body.id,
      projectId: project.body.id,
      percentage: 60,
      startDate: "2026-07-20",
      endDate: "2026-07-26",
    });

    const snapshot = await agent.get("/api/staffing/snapshot").query({ from: "2026-07-20", to: "2026-07-26" });
    expect(snapshot.status).toBe(200);
    const personSnapshot = snapshot.body.people.find((p: { personId: number }) => p.personId === person.body.id);
    expect(personSnapshot.days["2026-07-22"].total).toBe(60);
    expect(personSnapshot.days["2026-07-22"].capacityHoursPerWeek).toBe(40);
    expect(personSnapshot.days["2026-07-22"].items[0]).toMatchObject({ projectName: "Progetto A", percentage: 60 });
  });

  it("returns 0 outside the assignment's date range", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const project = await agent.post("/api/projects").send({ name: "Progetto A" });
    await agent.post("/api/assignments").send({
      personId: person.body.id,
      projectId: project.body.id,
      percentage: 60,
      startDate: "2026-07-20",
      endDate: "2026-07-22",
    });

    const snapshot = await agent.get("/api/staffing/snapshot").query({ from: "2026-07-20", to: "2026-07-26" });
    const personSnapshot = snapshot.body.people.find((p: { personId: number }) => p.personId === person.body.id);
    expect(personSnapshot.days["2026-07-23"].total).toBe(0);
  });

  it("applies a capacity override period instead of the base capacity", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Part Time", capacityHoursPerWeek: 40 });
    await agent
      .post(`/api/people/${person.body.id}/capacity`)
      .send({ startDate: "2026-07-01", endDate: "2026-07-31", hoursPerWeek: 24 });

    const snapshot = await agent.get("/api/staffing/snapshot").query({ from: "2026-07-20", to: "2026-08-05" });
    const personSnapshot = snapshot.body.people.find((p: { personId: number }) => p.personId === person.body.id);
    expect(personSnapshot.days["2026-07-25"].capacityHoursPerWeek).toBe(24);
    expect(personSnapshot.days["2026-08-05"].capacityHoursPerWeek).toBe(40);
  });

  it("sums multiple overlapping assignments on the same day", async () => {
    const agent = await adminAgent();
    const person = await agent.post("/api/people").send({ name: "Busy Person" });
    const p1 = await agent.post("/api/projects").send({ name: "Progetto A" });
    const p2 = await agent.post("/api/projects").send({ name: "Progetto B" });
    await agent.post("/api/assignments").send({
      personId: person.body.id,
      projectId: p1.body.id,
      percentage: 60,
      startDate: "2026-07-20",
      endDate: "2026-07-26",
    });
    await agent.post("/api/assignments").send({
      personId: person.body.id,
      projectId: p2.body.id,
      percentage: 50,
      startDate: "2026-07-20",
      endDate: "2026-07-26",
    });

    const snapshot = await agent.get("/api/staffing/snapshot").query({ from: "2026-07-20", to: "2026-07-26" });
    const personSnapshot = snapshot.body.people.find((p: { personId: number }) => p.personId === person.body.id);
    expect(personSnapshot.days["2026-07-22"].total).toBe(110);
    expect(personSnapshot.days["2026-07-22"].items).toHaveLength(2);
  });
});
