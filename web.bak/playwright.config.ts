import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "KYBER_CONSOLE_PORT=8790 bun run src/console-server/server.ts",
      cwd: "..",
      url: "http://127.0.0.1:8790/api/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "VITE_API_PROXY_TARGET=http://127.0.0.1:8790 bun run dev --host 127.0.0.1 --port 4173",
      cwd: ".",
      url: "http://127.0.0.1:4173/c",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
