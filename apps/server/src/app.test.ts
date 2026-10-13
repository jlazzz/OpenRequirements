import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_DATABASE_URL } from "../test/global-setup.ts";
import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { auditEvents } from "./db/schema.ts";

const db = createDb(TEST_DATABASE_URL);
let app: FastifyInstance;

const admin = { email: "Admin@Example.com", name: "Admin", password: "a long password" };

beforeAll(async () => {
  app = await buildApp(db, { loginAttemptsPerMinute: 1000 });
});
beforeEach(async () => {
  await db.execute(
    sql`truncate users, sessions, projects, item_types, attribute_definitions, sets, audit_events cascade`,
  );
});
afterAll(async () => {
  await app.close();
  await db.$client.end();
});

const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {} });
const get = (url: string, cookie?: string) => app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => `session=${res.cookies[0]?.value}`;
const auditActions = async () => (await db.select().from(auditEvents)).map((e) => e.action).sort();

test("a fresh install needs setup, and setup signs the admin in", async () => {
  expect((await get("/api/session")).json()).toEqual({ user: null, needsSetup: true });

  const res = await post("/api/setup", admin);
  expect(res.statusCode).toBe(200);
  expect(res.json().user).toMatchObject({ email: "admin@example.com", isAdmin: true });
  expect(res.cookies[0]).toMatchObject({ name: "session", httpOnly: true, sameSite: "Strict" });

  const session = (await get("/api/session", cookieOf(res))).json();
  expect(session).toMatchObject({ needsSetup: false, user: { email: "admin@example.com" } });
  expect(await auditActions()).toEqual(["session.create", "user.create"]);
});

test("setup works once only, even when two requests race", async () => {
  const results = await Promise.all([
    post("/api/setup", admin),
    post("/api/setup", { ...admin, email: "b@example.com" }),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect((await post("/api/setup", { ...admin, email: "c@example.com" })).statusCode).toBe(409);
});

test("setup rejects a short password", async () => {
  expect((await post("/api/setup", { ...admin, password: "short" })).statusCode).toBe(400);
});

test("login accepts the right password in any email case and rejects the rest", async () => {
  await post("/api/setup", admin);
  expect((await post("/api/login", { email: "ADMIN@example.com", password: admin.password })).statusCode).toBe(200);
  expect((await post("/api/login", { email: admin.email, password: "wrong" })).statusCode).toBe(401);
  expect((await post("/api/login", { email: "nobody@example.com", password: admin.password })).statusCode).toBe(401);
});

test("repeated login attempts are rate limited by default", async () => {
  const limited = await buildApp(db);
  const attempt = () =>
    limited.inject({ method: "POST", url: "/api/login", payload: { email: "a@example.com", password: "x" } });
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await attempt()).statusCode);
  expect(codes.slice(0, 10)).toEqual(Array(10).fill(401));
  expect(codes[10]).toBe(429);
  await limited.close();
});

test("logout ends the session and is audited", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  expect((await get("/api/projects", cookie)).json()).toEqual({ projects: [] });
  expect((await post("/api/logout", {}, cookie)).statusCode).toBe(200);
  expect((await get("/api/projects", cookie)).statusCode).toBe(401);
  expect(await auditActions()).toContain("session.delete");
});

test("an expired session is not accepted", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  await db.execute(sql`update sessions set expires_at = now() - interval '1 second'`);
  expect((await get("/api/projects", cookie)).statusCode).toBe(401);
});

test("an admin creates a project from a template and gets its sets", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  const templates = (await get("/api/templates", cookie)).json().templates;
  expect(templates[0]).toMatchObject({ id: "standard" });

  const created = await post("/api/projects", { name: "  Infusion Pump ", templateId: "standard" }, cookie);
  expect(created.statusCode).toBe(201);
  const { project } = created.json();
  expect(project.name).toBe("Infusion Pump");
  expect((await get("/api/projects", cookie)).json().projects).toHaveLength(1);

  const detail = (await get(`/api/projects/${project.id}`, cookie)).json();
  expect(detail.sets.map((s: { uidPrefix: string }) => s.uidPrefix)).toEqual(["UN", "SYS", "VER"]);
  expect(detail.sets[1]).toMatchObject({ name: "System Requirements", itemType: "Requirement" });
  expect(await auditActions()).toContain("project.create");
});

test("project creation rejects bad input, and a failed create leaves nothing behind", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  expect((await post("/api/projects", { name: "X", templateId: "nope" }, cookie)).statusCode).toBe(400);
  expect((await post("/api/projects", { name: "   ", templateId: "standard" }, cookie)).statusCode).toBe(400);
  expect((await get("/api/projects", cookie)).json().projects).toEqual([]);
});

test("only administrators create projects", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  await db.execute(sql`update users set is_admin = false`);
  expect((await post("/api/projects", { name: "X", templateId: "standard" }, cookie)).statusCode).toBe(403);
});

test("an unknown or malformed project id is a clean error", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  expect((await get("/api/projects/00000000-0000-4000-8000-000000000000", cookie)).statusCode).toBe(404);
  expect((await get("/api/projects/not-a-uuid", cookie)).statusCode).toBe(400);
});

// Hard rule: every endpoint checks permissions. This covers every registered route, including future ones.
test("every API route that is not marked public rejects anonymous requests", async () => {
  const guarded = app.apiRoutes.filter((r) => !r.public && r.method !== "HEAD");
  expect(guarded.length).toBeGreaterThan(0);
  for (const { method, url } of guarded) {
    const res = await app.inject({ method: method as "GET", url, payload: method === "GET" ? undefined : {} });
    expect(res.statusCode, `${method} ${url}`).toBe(401);
  }
});
