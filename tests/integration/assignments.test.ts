import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/assignments", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  async function setup() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    const agent = await loginAgent("admin@test.local");
    const person = await agent.post("/api/people").send({ name: "Mario Rossi" });
    const project = await agent.post("/api/projects").send({ name: "Progetto A" });
    return { agent, personId: person.body.id, projectId: project.body.id };
  }

  it("creates a plain assignment", async () => {
    const { agent, personId, projectId } = await setup();
    const res = await agent
      .post("/api/assignments")
      .send({ personId, projectId, percentage: 50, startDate: "2026-01-01", endDate: "2026-06-30" });
    expect(res.status).toBe(201);
  });

  it("rejects assignments overlapping a holiday", async () => {
    const { agent, personId, projectId } = await setup();
    await agent.post("/api/holidays").send({ date: "2026-05-01", name: "Festa del lavoro" });
    const res = await agent.post("/api/assignments").send({
      personId,
      projectId,
      percentage: 50,
      startDate: "2026-05-01",
      endDate: "2026-05-01",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("festiva");
  });

  it("rejects assignments overlapping an approved absence", async () => {
    const { agent, personId, projectId } = await setup();
    await agent.post("/api/absences").send({
      personId,
      type: "ferie",
      startDate: "2026-06-15",
      endDate: "2026-06-15",
    });
    const absences = await agent.get("/api/absences");
    await agent.put(`/api/absences/${absences.body[0].id}/status`).send({ status: "approvata" });
    const res = await agent.post("/api/assignments").send({
      personId,
      projectId,
      percentage: 50,
      startDate: "2026-06-15",
      endDate: "2026-06-15",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("assenza approvata");
  });

  describe("POST /overwrite", () => {
    it("drops an existing assignment fully covered by the new range", async () => {
      const { agent, personId, projectId } = await setup();
      await agent
        .post("/api/assignments")
        .send({ personId, projectId, percentage: 30, startDate: "2026-02-01", endDate: "2026-02-28" });

      await agent
        .post("/api/assignments/overwrite")
        .send({ personId, projectId, percentage: 80, startDate: "2026-01-01", endDate: "2026-03-31" });

      const list = await agent.get("/api/assignments").query({ personId, projectId });
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ percentage: 80, startDate: "2026-01-01", endDate: "2026-03-31" });
    });

    it("splits an existing assignment in two when the new range falls entirely inside it", async () => {
      const { agent, personId, projectId } = await setup();
      await agent
        .post("/api/assignments")
        .send({ personId, projectId, percentage: 30, startDate: "2026-01-01", endDate: "2026-03-31" });

      await agent
        .post("/api/assignments/overwrite")
        .send({ personId, projectId, percentage: 90, startDate: "2026-02-01", endDate: "2026-02-15" });

      const list = await agent.get("/api/assignments").query({ personId, projectId });
      expect(list.body).toHaveLength(3);
      const sorted = [...list.body].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
      expect(sorted[0]).toMatchObject({ percentage: 30, startDate: "2026-01-01", endDate: "2026-01-31" });
      expect(sorted[1]).toMatchObject({ percentage: 90, startDate: "2026-02-01", endDate: "2026-02-15" });
      expect(sorted[2]).toMatchObject({ percentage: 30, startDate: "2026-02-16", endDate: "2026-03-31" });
    });

    it("truncates the tail of an existing assignment overlapping the new range's start", async () => {
      const { agent, personId, projectId } = await setup();
      await agent
        .post("/api/assignments")
        .send({ personId, projectId, percentage: 30, startDate: "2026-01-01", endDate: "2026-02-15" });

      await agent
        .post("/api/assignments/overwrite")
        .send({ personId, projectId, percentage: 90, startDate: "2026-02-01", endDate: "2026-02-28" });

      const list = await agent.get("/api/assignments").query({ personId, projectId });
      const sorted = [...list.body].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
      expect(sorted[0]).toMatchObject({ percentage: 30, startDate: "2026-01-01", endDate: "2026-01-31" });
      expect(sorted[1]).toMatchObject({ percentage: 90, startDate: "2026-02-01", endDate: "2026-02-28" });
    });

    it("truncates the head of an existing assignment overlapping the new range's end", async () => {
      const { agent, personId, projectId } = await setup();
      await agent
        .post("/api/assignments")
        .send({ personId, projectId, percentage: 30, startDate: "2026-02-01", endDate: "2026-03-31" });

      await agent
        .post("/api/assignments/overwrite")
        .send({ personId, projectId, percentage: 90, startDate: "2026-01-01", endDate: "2026-02-15" });

      const list = await agent.get("/api/assignments").query({ personId, projectId });
      const sorted = [...list.body].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
      expect(sorted[0]).toMatchObject({ percentage: 90, startDate: "2026-01-01", endDate: "2026-02-15" });
      expect(sorted[1]).toMatchObject({ percentage: 30, startDate: "2026-02-16", endDate: "2026-03-31" });
    });

    it("leaves a non-overlapping assignment untouched", async () => {
      const { agent, personId, projectId } = await setup();
      await agent
        .post("/api/assignments")
        .send({ personId, projectId, percentage: 30, startDate: "2026-01-01", endDate: "2026-01-31" });

      await agent
        .post("/api/assignments/overwrite")
        .send({ personId, projectId, percentage: 90, startDate: "2026-03-01", endDate: "2026-03-31" });

      const list = await agent.get("/api/assignments").query({ personId, projectId });
      expect(list.body).toHaveLength(2);
    });
  });

  describe("POST /:id/split", () => {
    it("splits an assignment into before/edited-unit/after parts", async () => {
      const { agent, personId, projectId } = await setup();
      const created = await agent
        .post("/api/assignments")
        .send({ personId, projectId, percentage: 40, startDate: "2026-07-01", endDate: "2026-07-31" });

      const res = await agent
        .post(`/api/assignments/${created.body.id}/split`)
        .send({ date: "2026-07-22", unit: "week", percentage: 100 });
      expect(res.status).toBe(200);

      const list = await agent.get("/api/assignments").query({ personId, projectId });
      const sorted = [...list.body].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
      expect(sorted).toHaveLength(3);
      expect(sorted[0]).toMatchObject({ percentage: 40, startDate: "2026-07-01", endDate: "2026-07-19" });
      expect(sorted[1]).toMatchObject({ percentage: 100, startDate: "2026-07-20", endDate: "2026-07-26" });
      expect(sorted[2]).toMatchObject({ percentage: 40, startDate: "2026-07-27", endDate: "2026-07-31" });
    });

    it("returns 404 for a non-existent assignment", async () => {
      const { agent } = await setup();
      const res = await agent.post("/api/assignments/999999/split").send({
        date: "2026-07-22",
        unit: "week",
        percentage: 100,
      });
      expect(res.status).toBe(404);
    });
  });

  it("deletes an assignment", async () => {
    const { agent, personId, projectId } = await setup();
    const created = await agent
      .post("/api/assignments")
      .send({ personId, projectId, percentage: 40, startDate: "2026-07-01", endDate: "2026-07-31" });
    const del = await agent.delete(`/api/assignments/${created.body.id}`);
    expect(del.status).toBe(204);
    const list = await agent.get("/api/assignments").query({ personId, projectId });
    expect(list.body).toHaveLength(0);
  });
});
