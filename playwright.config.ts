import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const testPort = process.env.E2E_PORT ?? "3001";
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    ...(existsSync(systemChrome) ? { launchOptions: { executablePath: systemChrome } } : {}),
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      TEST_STORAGE_DRIVER: "memory",
      E2E_PORT: testPort,
      CRON_SECRET: "",
      NEXT_TELEMETRY_DISABLED: "1",
      APP_ORIGIN: baseURL,
    },
  },
});
