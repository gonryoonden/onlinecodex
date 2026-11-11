import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    storageState: process.env.STUDIO_PREVIEW_STORAGE,
    baseURL: process.env.STUDIO_TEST_BASE_URL || "http://127.0.0.1:3000",
    actionTimeout: 15000,
    viewport: { width: 1366, height: 768 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    screenshot: "only-on-failure",
    trace: process.env.STUDIO_PREVIEW_STORAGE ? "off" : "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.STUDIO_PREVIEW_STORAGE ? undefined : {
    command: "npm run dev",
    url: process.env.STUDIO_TEST_BASE_URL || "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
