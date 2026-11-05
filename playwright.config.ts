import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://jastip:jastip@localhost:5432/jastip_e2e";

/**
 * Whole journeys in a real browser against the built app (`npm run build` first) in demo mode, on a
 * database of its own: the demo resets it when the server starts.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "id-ID" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /phone\.spec/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /phone\.spec/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/id`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL, DEMO_MODE: "true", NODE_ENV: "production" },
  },
});
