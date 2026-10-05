import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser, resetTestDb, closeTestDb, DEFAULT_TEST_PASSWORD, loginAgent } from "./helpers";
import { db } from "../../server/db";
import { authAudit } from "../../server/schema";
import { generate } from "otplib";

describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /api/auth/login, GET /me, POST /logout", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  it("requires first-time MFA enrollment before an administrator receives a session", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.local", password: DEFAULT_TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.mfaSetupRequired).toBe(true);
    expect(res.body.setupToken).toBeTruthy();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("requires MFA enrollment for restricted accounts too", async () => {
    await createTestUser({ email: "limited@test.local", name: "Limited", permissions: ["dashboard"] });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "limited@test.local", password: DEFAULT_TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.mfaSetupRequired).toBe(true);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.local", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("audits failed logins and completes the administrator MFA flow", async () => {
    await createTestUser({ email: "mfa@test.local", name: "MFA Admin", permissions: null });
    const failed = await request(app).post("/api/auth/login").send({ email: "mfa@test.local", password: "wrong-password" });
    expect(failed.status).toBe(401);
    const failedAudit = await db.select().from(authAudit);
    expect(failedAudit).toEqual(expect.arrayContaining([expect.objectContaining({ event: "login_failed", email: "mfa@test.local" })]));

    const setupRequired = await request(app).post("/api/auth/login").send({ email: "mfa@test.local", password: DEFAULT_TEST_PASSWORD });
    expect(setupRequired.body.mfaSetupRequired).toBe(true);
    const agent = request.agent(app);
    const setup = await agent.post("/api/auth/mfa/enroll/setup").send({ setupToken: setupRequired.body.setupToken });
    expect(setup.status).toBe(200);
    const code = await generate({ secret: setup.body.secret });
    expect((await agent.post("/api/auth/mfa/enroll/confirm").send({ setupToken: setupRequired.body.setupToken, code })).status).toBe(200);

    await agent.post("/api/auth/logout");
    const pending = await agent.post("/api/auth/login").send({ email: "mfa@test.local", password: DEFAULT_TEST_PASSWORD });
    expect(pending.body.mfaRequired).toBe(true);
    const verified = await agent.post("/api/auth/mfa/verify").send({ challengeToken: pending.body.challengeToken, code: await generate({ secret: setup.body.secret }) });
    expect(verified.status).toBe(200);
  });

  it("rejects an unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@test.local", password: DEFAULT_TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("rejects login for a deactivated user", async () => {
    await createTestUser({ email: "inactive@test.local", name: "Inactive", active: false });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "inactive@test.local", password: DEFAULT_TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("GET /me returns 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /me returns the current user with a valid session", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin" });
    const agent = await loginAgent("admin@test.local");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("admin@test.local");
  });

  it("logout clears the session so subsequent requests are unauthenticated", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin" });
    const agent = await loginAgent("admin@test.local");
    await agent.post("/api/auth/logout");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });
});
