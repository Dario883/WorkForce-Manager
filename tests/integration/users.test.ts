import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("/api/users", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  async function adminAgent() {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    return loginAgent("admin@test.local");
  }

  it("lists users including the new permissions field", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/users");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ email: "admin@test.local", permissions: null });
  });

  it("creates a user, defaulting permissions to null (full access)", async () => {
    const agent = await adminAgent();
    const res = await agent
      .post("/api/users")
      .send({ email: "new@test.local", name: "New Person", password: "Password1!" });
    expect(res.status).toBe(201);
    expect(res.body.permissions).toBeNull();
    expect(res.body.active).toBe(true);
  });

  it("rejects creating a user with a duplicate email", async () => {
    const agent = await adminAgent();
    await agent.post("/api/users").send({ email: "dup@test.local", name: "A", password: "Password1!" });
    const res = await agent.post("/api/users").send({ email: "dup@test.local", name: "B", password: "Password1!" });
    expect(res.status).toBe(409);
  });

  it("rejects an invalid permission key", async () => {
    const agent = await adminAgent();
    const created = await agent
      .post("/api/users")
      .send({ email: "u@test.local", name: "U", password: "Password1!" });
    const res = await agent
      .put(`/api/users/${created.body.id}`)
      .send({ permissions: ["not-a-real-tab"] });
    expect(res.status).toBe(400);
  });

  it("updates a user's permissions to a restricted custom set", async () => {
    const agent = await adminAgent();
    const created = await agent
      .post("/api/users")
      .send({ email: "u@test.local", name: "U", password: "Password1!" });
    const res = await agent
      .put(`/api/users/${created.body.id}`)
      .send({ permissions: ["dashboard", "people"] });
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual(["dashboard", "people"]);
  });

  it("prevents a user from deactivating their own account", async () => {
    const agent = await adminAgent();
    const me = await agent.get("/api/auth/me");
    const res = await agent.put(`/api/users/${me.body.userId}`).send({ active: false });
    expect(res.status).toBe(400);
  });

  it("prevents a user from removing their own settings/settings:users access", async () => {
    const agent = await adminAgent();
    const me = await agent.get("/api/auth/me");
    const res = await agent.put(`/api/users/${me.body.userId}`).send({ permissions: ["dashboard"] });
    expect(res.status).toBe(400);

    const partial = await agent
      .put(`/api/users/${me.body.userId}`)
      .send({ permissions: ["dashboard", "settings"] }); // missing settings:users
    expect(partial.status).toBe(400);
  });

  it("prevents a user from deleting their own account", async () => {
    const agent = await adminAgent();
    const me = await agent.get("/api/auth/me");
    const res = await agent.delete(`/api/users/${me.body.userId}`);
    expect(res.status).toBe(400);
  });

  it("deletes another user outright", async () => {
    const agent = await adminAgent();
    const created = await agent
      .post("/api/users")
      .send({ email: "disposable@test.local", name: "Disposable", password: "Password1!" });
    const del = await agent.delete(`/api/users/${created.body.id}`);
    expect(del.status).toBe(204);
    const list = await agent.get("/api/users");
    expect(list.body.map((u: { email: string }) => u.email)).not.toContain("disposable@test.local");
  });

  it("returns 404 when deleting a non-existent user", async () => {
    const agent = await adminAgent();
    const res = await agent.delete("/api/users/999999");
    expect(res.status).toBe(404);
  });

  it("admin can clear all application data while keeping admin user accounts", async () => {
    const agent = await adminAgent();

    await agent.post("/api/people").send({ name: "Risorsa da cancellare" });
    await agent.post("/api/projects").send({
      name: "Progetto da cancellare",
      commessaId: "C-DEL-001",
      client: "Cliente",
      status: "planned",
      deliveryType: "T&M",
    });
    await agent.post("/api/absences").send({
      personId: 1,
      type: "ferie",
      status: "in_attesa",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
    });

    const reset = await agent.post("/api/admin/reset-data");
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ deleted: expect.any(Object) });

    const people = await agent.get("/api/people");
    expect(people.status).toBe(200);
    expect(people.body).toEqual([]);

    const usersList = await agent.get("/api/users");
    expect(usersList.status).toBe(200);
    expect(usersList.body.some((u: { email: string }) => u.email === "admin@test.local")).toBe(true);
  });

  it("non-admin users cannot trigger the bulk reset", async () => {
    await createTestUser({ email: "limited@test.local", name: "Limited", permissions: ["dashboard"] });
    const agent = await loginAgent("limited@test.local");
    const res = await agent.post("/api/admin/reset-data");
    expect(res.status).toBe(403);
  });
});
