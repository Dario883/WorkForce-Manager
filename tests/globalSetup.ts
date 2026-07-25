import "dotenv/config";
import { execSync } from "child_process";

/** Runs once before the whole test run (unit + integration). Applies pending
 * migrations to the dedicated test database so integration tests start from
 * an up-to-date, known schema. No-ops (with a warning) when no test database
 * is configured — integration tests self-skip in that case. */
export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    console.warn(
      "\n[tests] TEST_DATABASE_URL is not set — integration tests will be skipped. " +
        "See README for how to set up a disposable test database.\n"
    );
    return;
  }
  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
