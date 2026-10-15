import { defineConfig } from "@playwright/test";

const api = process.env.E2E_API_PORT ?? "3100";
const web = process.env.E2E_WEB_PORT ?? "5273";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  // One database, and the tests build on one project each: run them in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${web}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "node e2e/server.ts",
      url: `http://127.0.0.1:${api}/api/session`,
      env: { E2E_API_PORT: api },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -w @app/web -- --port ${web} --strictPort`,
      url: `http://localhost:${web}`,
      env: { API_PORT: api },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
