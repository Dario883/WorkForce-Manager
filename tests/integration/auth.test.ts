import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser, resetTestDb, closeTestDb, DEFAULT_TEST_PASSWORD } from "./helpers";
import { db } from "../../server/db";
import { authAudit } from "../../server/schema";
import { generate } from "otplib";

describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /api/auth/login, GET /me, POST /logout", () => {
  beforeEach(resetTestDb);
  afterAll(closeTestDb);

  it("logs in with correct credentials and returns the user incl. permissions", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin", permissions: null });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.local", password: DEFAULT_TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "admin@test.local", name: "Admin", permissions: null });
    expect(res.headers["set-cookie"]).toBeDefined();
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

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "mfa@test.local", password: DEFAULT_TEST_PASSWORD });
    const setup = await agent.post("/api/auth/mfa/setup");
    expect(setup.status).toBe(200);
    const code = await generate({ secret: setup.body.secret });
    expect((await agent.post("/api/auth/mfa/confirm").send({ code })).status).toBe(200);

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

  it("rejects login for a deactivated user's session on subsequent requests", async () => {
    await createTestUser({ email: "inactive@test.local", name: "Inactive", active: false });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "inactive@test.local", password: DEFAULT_TEST_PASSWORD });
    // Login itself only checks the password; attachUser re-checks `active`
    // on every subsequent request, so /me must reject even with a valid cookie.
    const cookie = res.headers["set-cookie"];
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
  });

  it("GET /me returns 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /me returns the current user with a valid session", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin" });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "admin@test.local", password: DEFAULT_TEST_PASSWORD });
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("admin@test.local");
  });

  it("logout clears the session so subsequent requests are unauthenticated", async () => {
    await createTestUser({ email: "admin@test.local", name: "Admin" });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "admin@test.local", password: DEFAULT_TEST_PASSWORD });
    await agent.post("/api/auth/logout");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });
});
