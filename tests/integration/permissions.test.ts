import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser, resetTestDb, closeTestDb, loginAgent } from "./helpers";

/**
 * Exercises the actual tab-permission gating wired in server/app.ts end to
 * end (not just the requireTab/requireTabWrite unit logic in isolation):
 * shared reads stay open across tabs, writes are blocked without the tab
 * grant, and the Impostazioni sub-sections (Soglie/Festività/Utenti/Registro)
 * are each independently gated.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("tab permission gating", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  it("a fully-restricted user (dashboard only) can read shared data but not write it", async () => {
    await createTestUser({ email: "restricted@test.local", name: "Restricted", permissions: ["dashboard"] });
    const agent = await loginAgent("restricted@test.local");

    const getPeople = await agent.get("/api/people");
    expect(getPeople.status).toBe(200);

    const postPeople = await agent.post("/api/people").send({ name: "Should Not Be Created" });
    expect(postPeople.status).toBe(403);

    const getProjects = await agent.get("/api/projects");
    expect(getProjects.status).toBe(200);

    const postProjects = await agent.post("/api/projects").send({ name: "Should Not Be Created" });
    expect(postProjects.status).toBe(403);
  });

  it("grants write access once the matching tab is present", async () => {
    await createTestUser({ email: "peopleeditor@test.local", name: "Editor", permissions: ["dashboard", "people"] });
    const agent = await loginAgent("peopleeditor@test.local");

    const res = await agent.post("/api/people").send({ name: "Real Person" });
    expect(res.status).toBe(201);
  });

  it("gates settings sub-sections independently of each other", async () => {
    await createTestUser({
      email: "thresholds-only@test.local",
      name: "ThresholdsOnly",
      permissions: ["settings", "settings:thresholds"],
    });
    const agent = await loginAgent("thresholds-only@test.local");

    const putSettings = await agent
      .put("/api/settings")
      .send({ underutilization_threshold: "60", overutilization_threshold: "110" });
    expect(putSettings.status).toBe(200);

    // Holidays GET stays open (shared with Calendario), but writing requires
    // its own settings:holidays grant, which this user doesn't have.
    const getHolidays = await agent.get("/api/holidays");
    expect(getHolidays.status).toBe(200);
    const postHolidays = await agent.post("/api/holidays").send({ date: "2026-12-31", name: "Nope" });
    expect(postHolidays.status).toBe(403);

    // /api/users and /api/activity are fully gated by their own sub-key.
    const getUsers = await agent.get("/api/users");
    expect(getUsers.status).toBe(403);
    const getActivity = await agent.get("/api/activity");
    expect(getActivity.status).toBe(403);
  });

  it("settings:users grants full access to /api/users", async () => {
    await createTestUser({
      email: "usersmgr@test.local",
      name: "UsersManager",
      permissions: ["settings", "settings:users"],
    });
    const agent = await loginAgent("usersmgr@test.local");
    const res = await agent.get("/api/users");
    expect(res.status).toBe(200);
  });

  it("an unrestricted user (permissions: null) can do everything", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    const agent = await loginAgent("admin@test.local");

    for (const res of [
      await agent.get("/api/people"),
      await agent.get("/api/users"),
      await agent.get("/api/activity"),
      await agent.get("/api/holidays"),
    ]) {
      expect(res.status).toBe(200);
    }
  });

  it("unauthenticated requests are rejected before any permission check", async () => {
    const res = await request(app).get("/api/people");
    expect(res.status).toBe(401);
  });
});
