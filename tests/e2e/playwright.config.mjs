// End-to-end tests: two real browser sessions (two players) against the local emulators.
// Run with: npm run test:e2e (from the tests folder), which starts the emulators first.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  timeout: 300_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "../test-results",
  use: {
    baseURL: "http://127.0.0.1:5600",
    // The Microsoft Edge already on Windows; set PW_CHANNEL=chromium to use Playwright's own browser instead.
    channel: process.env.PW_CHANNEL || "msedge",
    serviceWorkers: "block",
    viewport: { width: 420, height: 860 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node e2e/server.mjs",
    cwd: "..",
    url: "http://127.0.0.1:5600/",
    reuseExistingServer: false,
    timeout: 20_000
  }
});
