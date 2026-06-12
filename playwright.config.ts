import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Assumes the dev server is already running (npm run dev). To auto-start,
  // uncomment the webServer block below.
  // webServer: {
  //   command: "npm run dev",
  //   url: baseURL,
  //   reuseExistingServer: true,
  //   timeout: 120_000,
  // },
});
