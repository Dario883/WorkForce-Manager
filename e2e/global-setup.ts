import "dotenv/config";
import { execSync } from "child_process";

const E2E_ADMIN_EMAIL = "e2e-admin@test.local";
const E2E_ADMIN_PASSWORD = "Test1234!";
const E2E_ENROLL_EMAIL = "e2e-enroll@test.local";
const E2E_ENROLL_PASSWORD = "Enroll1234!";

/** Migrates and seeds the dedicated test database once before the whole e2e
 * run: a clean schema plus a single admin account the specs log in with. */
export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set — e2e tests need a disposable test database. See README."
    );
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.MFA_ENCRYPTION_KEY ||= "e2e-mfa-encryption-key";

  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });

  const { resetTestDb } = await import("../tests/integration/helpers");
  const { db, pool } = await import("../server/db");
  const { users } = await import("../server/schema");
  const { createMfaSetup, hashPassword } = await import("../server/auth");

  await resetTestDb();
  const adminMfa = createMfaSetup(E2E_ADMIN_EMAIL);
  process.env.E2E_ADMIN_MFA_SECRET = adminMfa.secret;
  await db.insert(users).values({
    email: E2E_ADMIN_EMAIL,
    name: "E2E Admin",
    passwordHash: await hashPassword(E2E_ADMIN_PASSWORD),
    active: true,
    permissions: null,
    mfaSecretEncrypted: adminMfa.encryptedSecret,
    mfaEnabled: true,
  });
  await db.insert(users).values({
    email: E2E_ENROLL_EMAIL,
    name: "E2E Enrollment User",
    passwordHash: await hashPassword(E2E_ENROLL_PASSWORD),
    active: true,
    permissions: ["dashboard"],
  });
  await pool.end();
}

export { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_ENROLL_EMAIL, E2E_ENROLL_PASSWORD };
