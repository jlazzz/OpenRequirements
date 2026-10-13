import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "apps/server/test/global-setup.ts",
    // Database tests truncate shared tables, so test files must not run at the same time.
    fileParallelism: false,
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
