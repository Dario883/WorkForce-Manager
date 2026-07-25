import "dotenv/config";
import { execSync } from "child_process";

const E2E_ADMIN_EMAIL = "e2e-admin@test.local";
const E2E_ADMIN_PASSWORD = "Test1234!";

/** Migrates and seeds the dedicated test database once before the whole e2e
 * run: a clean schema plus a single admin account the specs log in with. */
export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set — e2e tests need a disposable test database. See README."
    );
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });

  const { resetTestDb } = await import("../tests/integration/helpers");
  const { db, pool } = await import("../server/db");
  const { users } = await import("../server/schema");
  const { hashPassword } = await import("../server/auth");

  await resetTestDb();
  await db.insert(users).values({
    email: E2E_ADMIN_EMAIL,
    name: "E2E Admin",
    passwordHash: await hashPassword(E2E_ADMIN_PASSWORD),
    active: true,
    permissions: null,
  });
  await pool.end();
}

export { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD };
