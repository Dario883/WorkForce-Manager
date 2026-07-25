import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/projects", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  async function adminAgent() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    return loginAgent("admin@test.local");
  }

  it("creates a project with a generated, unique commessaId", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/projects").send({ name: "Migrazione Cloud" });
    expect(res.status).toBe(201);
    expect(res.body.commessaId).toMatch(/^migrazione-cloud-\d{4}-\d{2}-\d{2}$/);
    expect(res.body.status).toBe("planned");
    expect(res.body.deliveryType).toBe("T&M");
  });

  it("rejects a duplicate project name on create", async () => {
    const agent = await adminAgent();
    await agent.post("/api/projects").send({ name: "Dup" });
    const res = await agent.post("/api/projects").send({ name: "Dup" });
    expect(res.status).toBe(409);
  });

  it("rejects renaming a project to an existing name, but allows keeping its own", async () => {
    const agent = await adminAgent();
    await agent.post("/api/projects").send({ name: "Alpha" });
    const beta = await agent.post("/api/projects").send({ name: "Beta" });

    const conflict = await agent.put(`/api/projects/${beta.body.id}`).send({ name: "Alpha" });
    expect(conflict.status).toBe(409);

    const noop = await agent.put(`/api/projects/${beta.body.id}`).send({ name: "Beta", client: "Acme" });
    expect(noop.status).toBe(200);
    expect(noop.body.client).toBe("Acme");
  });

  it("resolves pmName via the people alias join on read", async () => {
    const agent = await adminAgent();
    const pm = await agent.post("/api/people").send({ name: "Elena Ricci" });
    const created = await agent.post("/api/projects").send({ name: "Con PM", pmId: pm.body.id });
    // POST returns the raw inserted row (no join); the pmName projection only
    // exists on the read queries, which is what this test actually verifies.
    const project = await agent.get(`/api/projects/${created.body.id}`);
    expect(project.body.pmName).toBe("Elena Ricci");
  });

  it("deletes a project", async () => {
    const agent = await adminAgent();
    const project = await agent.post("/api/projects").send({ name: "Da Cancellare" });
    const del = await agent.delete(`/api/projects/${project.body.id}`);
    expect(del.status).toBe(204);
    const get = await agent.get(`/api/projects/${project.body.id}`);
    expect(get.status).toBe(404);
  });

  it("imports projects from CSV, normalizing status/delivery/date columns", async () => {
    const agent = await adminAgent();
    const csv =
      "name,client,status,deliveryType,startDate,endDate,color\n" +
      "Import Test,Acme,On Hold,taas,01/06/2026,30/06/2026,#123456\n";
    const res = await agent.post("/api/projects/import").send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);

    const list = await agent.get("/api/projects");
    const created = list.body.find((p: { name: string }) => p.name === "Import Test");
    expect(created).toMatchObject({ status: "on_hold", deliveryType: "TaaS", startDate: "2026-06-01", endDate: "2026-06-30" });
  });
});
