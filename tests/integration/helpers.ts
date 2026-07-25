import request from "supertest";
import app from "../../server/app";
import { db, pool } from "../../server/db";
import { users } from "../../server/schema";
import { hashPassword } from "../../server/auth";

const TABLES = [
  "activity_log",
  "absences",
  "assignments",
  "person_capacity_periods",
  "projects",
  "people",
  "holidays",
  "settings",
  "users",
];

/** Wipes every table in the (disposable, dedicated) test database. Refuses
 * to run unless DATABASE_URL was actually overridden to TEST_DATABASE_URL by
 * tests/setupEnv.ts, so a misconfigured environment fails loudly instead of
 * truncating a real database. */
export async function resetTestDb() {
  if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error("resetTestDb() refused: DATABASE_URL is not the configured TEST_DATABASE_URL");
  }
  await pool.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function closeTestDb() {
  await pool.end();
}

export const DEFAULT_TEST_PASSWORD = "Test1234!";

/** Inserts a user directly (bypassing the API) so tests can bootstrap a
 * logged-in session without depending on another authenticated user. */
export async function createTestUser(overrides: {
  email: string;
  name: string;
  password?: string;
  active?: boolean;
  permissions?: string[] | null;
}) {
  const passwordHash = await hashPassword(overrides.password ?? DEFAULT_TEST_PASSWORD);
  const [created] = await db
    .insert(users)
    .values({
      email: overrides.email,
      name: overrides.name,
      passwordHash,
      active: overrides.active ?? true,
      permissions: overrides.permissions ?? null,
    })
    .returning();
  return created;
}

/** Logs in via the real /api/auth/login route and returns a supertest agent
 * that persists the session cookie across subsequent requests. */
export async function loginAgent(email: string, password = DEFAULT_TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

export { app };
