import { createHash } from "node:crypto";
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

test("/help pages load by clean URL and their inline scripts are allowed by hash", async () => {
  const body = "window.__VP_SITE_DATA__ = 1;";
  writeFileSync(join(helpRoot, "install.html"), `<script>${body}</script><h1>Install</h1>`);
  const guide = await buildApp(createDb(TEST_DATABASE_URL), { helpRoot, attachmentsDir: helpRoot });
  const page = await guide.inject({ method: "GET", url: "/help/install" });
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain("Install");
  const hash = createHash("sha256").update(body).digest("base64");
  expect(page.headers["content-security-policy"]).toContain(`'sha256-${hash}'`);
  const api = await guide.inject({ method: "GET", url: "/api/health" });
  expect(api.headers["content-security-policy"]).not.toContain("sha256-");
  await guide.close();
});
