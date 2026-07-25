import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// A dedicated port, separate from the normal dev servers (5173/3000), so
// running e2e tests never collides with a developer's running dev session.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && node dist/index.js",
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      PORT: String(PORT),
      DATABASE_URL: process.env.TEST_DATABASE_URL || "",
      JWT_SECRET: process.env.JWT_SECRET || "e2e-test-secret",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
