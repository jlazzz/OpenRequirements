import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { TEST_DATABASE_URL } from "../test/global-setup.ts";
import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";

const helpRoot = mkdtempSync(join(tmpdir(), "help-"));
writeFileSync(join(helpRoot, "index.html"), "<h1>User guide</h1>");
const app = await buildApp(createDb(TEST_DATABASE_URL), { helpRoot, attachmentsDir: helpRoot });
afterAll(() => app.close());

test("/help serves the guide without signing in", async () => {
  const page = await app.inject({ method: "GET", url: "/help/" });
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain("User guide");
  const bare = await app.inject({ method: "GET", url: "/help" });
  expect(bare.statusCode).toBe(302);
  expect(bare.headers.location).toBe("/help/");
});
