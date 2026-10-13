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
    sql`truncate users, sessions, projects, item_types, attribute_definitions, sets, nodes, item_revisions, audit_events cascade`,
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

async function projectWithSets() {
  const cookie = cookieOf(await post("/api/setup", admin));
  const { project } = (await post("/api/projects", { name: "P", templateId: "standard" }, cookie)).json();
  const detail = async () => (await get(`/api/projects/${project.id}`, cookie)).json();
  const [un, sys] = (await detail()).sets as { id: string }[];
  if (!un || !sys) throw new Error("template sets missing");
  const add = (setId: string, body: object) => post(`/api/sets/${setId}/nodes`, body, cookie);
  return { cookie, detail, un, sys, add };
}

test("items get sequential UIDs per set and a first revision; folders nest them", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const folder = (await add(sys.id, { kind: "folder", name: "Power" })).json().node;
  expect(folder).toMatchObject({ kind: "folder", name: "Power", uid: null });

  const first = (await add(sys.id, { kind: "item", name: " Supply voltage ", parentId: folder.id })).json().node;
  const second = (await add(sys.id, { kind: "item", name: "Max current" })).json().node;
  const other = (await add(un.id, { kind: "item", name: "Portable" })).json().node;
  expect([first.uid, second.uid, other.uid]).toEqual(["SYS-001", "SYS-002", "UN-001"]);
  expect(first).toMatchObject({ name: "Supply voltage", parentId: folder.id });

  const tree = (await detail()).nodes;
  expect(tree.map((n: { name: string }) => n.name).sort()).toEqual([
    "Max current",
    "Portable",
    "Power",
    "Supply voltage",
  ]);

  const item = (await get(`/api/items/${first.id}`, cookie)).json().item;
  expect(item).toMatchObject({ uid: "SYS-001", name: "Supply voltage", description: "", revision: 1 });
  expect(await auditActions()).toEqual(expect.arrayContaining(["folder.create", "item.create"]));
});

test("a set lists its fields in template order and each item's current values", async () => {
  const { cookie, sys, un, add } = await projectWithSets();
  const folder = (await add(sys.id, { kind: "folder", name: "F" })).json().node;
  await add(sys.id, { kind: "item", name: "Nested", parentId: folder.id });
  await add(un.id, { kind: "item", name: "Elsewhere" });

  const list = (await get(`/api/sets/${sys.id}/items`, cookie)).json();
  expect(list.fields.map((f: { name: string }) => f.name)).toEqual([
    "Status",
    "Priority",
    "Verification method",
    "Rationale",
  ]);
  expect(list.fields[0]).toMatchObject({ type: "enum", options: ["Draft", "In review", "Approved", "Rejected"] });
  expect(list.items).toEqual([
    expect.objectContaining({ uid: "SYS-001", name: "Nested", attributes: {}, revision: 1 }),
  ]);
  expect((await get("/api/sets/00000000-0000-4000-8000-000000000000/items", cookie)).statusCode).toBe(404);
});

test("saving an item appends a revision and keeps the old one", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "Supply voltage" })).json().node;
  const { fields } = (await get(`/api/items/${id}`, cookie)).json();
  const status = fields.find((f: { name: string }) => f.name === "Status").id;
  const rationale = fields.find((f: { name: string }) => f.name === "Rationale").id;
  const save = (body: object) =>
    post(`/api/items/${id}/revisions`, { name: "Supply voltage", description: "", attributes: {}, ...body }, cookie);

  const saved = await save({
    baseRevision: 1,
    description: "5 V DC",
    attributes: { [status]: "Approved", [rationale]: "" },
    changeReason: " USB ",
  });
  expect(saved.statusCode).toBe(201);
  expect(saved.json()).toEqual({ revision: 2 });

  const { item } = (await get(`/api/items/${id}`, cookie)).json();
  expect(item).toMatchObject({ revision: 2, description: "5 V DC", attributes: { [status]: "Approved" } });
  const list = (await get(`/api/sets/${sys.id}/items`, cookie)).json();
  expect(list.items[0]).toMatchObject({ revision: 2, attributes: { [status]: "Approved" } });

  const history = await db.execute(sql`select number, description, change_reason from item_revisions order by number`);
  expect(history.rows).toEqual([
    { number: 1, description: "", change_reason: null },
    { number: 2, description: "5 V DC", change_reason: "USB" },
  ]);
  expect(await auditActions()).toContain("item.revise");

  // A save that started from an old revision must not overwrite the newer one.
  expect((await save({ baseRevision: 1, description: "stale" })).statusCode).toBe(409);
  expect((await save({ baseRevision: 2, attributes: { [status]: "Bogus" } })).statusCode).toBe(400);
  expect((await save({ baseRevision: 2, name: " " })).statusCode).toBe(400);
  expect((await get(`/api/items/${id}`, cookie)).json().item.revision).toBe(2);
});

test("two saves from the same revision cannot both succeed", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "A" })).json().node;
  const save = (name: string) =>
    post(`/api/items/${id}/revisions`, { baseRevision: 1, name, description: "", attributes: {} }, cookie);
  const codes = (await Promise.all([save("B"), save("C")])).map((r) => r.statusCode).sort();
  expect(codes).toEqual([201, 409]);
});

test("concurrent creates in one set never share a UID", async () => {
  const { sys, add } = await projectWithSets();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => add(sys.id, { kind: "item", name: `R${i}` })));
  const uids = results.map((r) => r.json().node.uid).sort();
  expect(uids).toEqual(Array.from({ length: 8 }, (_, i) => `SYS-00${i + 1}`));
});

test("a node's parent must be a folder in the same set", async () => {
  const { un, sys, add } = await projectWithSets();
  const item = (await add(sys.id, { kind: "item", name: "A" })).json().node;
  const otherFolder = (await add(un.id, { kind: "folder", name: "F" })).json().node;
  expect((await add(sys.id, { kind: "item", name: "B", parentId: item.id })).statusCode).toBe(400);
  expect((await add(sys.id, { kind: "item", name: "B", parentId: otherFolder.id })).statusCode).toBe(400);
  // A rejected create must not use up a UID.
  expect((await add(sys.id, { kind: "item", name: "B" })).json().node.uid).toBe("SYS-002");
});

test("creating a node rejects blank names and unknown sets, and a folder is not an item", async () => {
  const { cookie, sys, add } = await projectWithSets();
  expect((await add(sys.id, { kind: "item", name: "  " })).statusCode).toBe(400);
  expect((await add("00000000-0000-4000-8000-000000000000", { kind: "item", name: "A" })).statusCode).toBe(404);
  const folder = (await add(sys.id, { kind: "folder", name: "F" })).json().node;
  expect((await get(`/api/items/${folder.id}`, cookie)).statusCode).toBe(404);
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
