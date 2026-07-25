import "dotenv/config";

// Every test process must talk to a disposable database, never the app's
// real DATABASE_URL — integration tests TRUNCATE tables between runs, and
// this project's normal DATABASE_URL has historically pointed at a live,
// actively-used instance. If TEST_DATABASE_URL isn't configured, point
// DATABASE_URL at an unreachable host so any code path that still tries to
// hit a database fails loudly instead of silently touching real data.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL = "postgres://no-test-database-configured@localhost:1/invalid";
}
