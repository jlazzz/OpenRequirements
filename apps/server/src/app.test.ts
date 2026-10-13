import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { textToDoc } from "@app/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_DATABASE_URL } from "../test/global-setup.ts";
import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { auditEvents } from "./db/schema.ts";

const db = createDb(TEST_DATABASE_URL);
let app: FastifyInstance;
const attachmentsDir = mkdtempSync(join(tmpdir(), "attachments-"));

const admin = { email: "Admin@Example.com", name: "Admin", password: "a long password" };

beforeAll(async () => {
  app = await buildApp(db, { loginAttemptsPerMinute: 1000, attachmentsDir });
});
beforeEach(async () => {
  await db.execute(
    sql`truncate users, sessions, projects, item_types, attribute_definitions, sets, nodes, item_revisions, item_drafts, link_types, links, attachments, comments, project_members, invitations, baselines, baseline_entries, baseline_links, audit_events cascade`,
  );
});
afterAll(async () => {
  await app.close();
  await db.$client.end();
  rmSync(attachmentsDir, { recursive: true });
});

const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {} });
const send = (method: "PATCH" | "DELETE" | "PUT", url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { cookie } });
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
  expect(item).toMatchObject({ uid: "SYS-001", name: "Supply voltage", description: textToDoc(""), revision: 1 });
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
    post(
      `/api/items/${id}/revisions`,
      { name: "Supply voltage", description: textToDoc(""), attributes: {}, ...body },
      cookie,
    );

  const saved = await save({
    baseRevision: 1,
    description: textToDoc("5 V DC"),
    attributes: { [status]: "Approved", [rationale]: "" },
    changeReason: " USB ",
  });
  expect(saved.statusCode).toBe(201);
  expect(saved.json()).toEqual({ revision: 2 });

  const { item } = (await get(`/api/items/${id}`, cookie)).json();
  expect(item).toMatchObject({ revision: 2, description: textToDoc("5 V DC"), attributes: { [status]: "Approved" } });
  const list = (await get(`/api/sets/${sys.id}/items`, cookie)).json();
  expect(list.items[0]).toMatchObject({ revision: 2, attributes: { [status]: "Approved" } });

  const history = await db.execute(sql`select number, description, change_reason from item_revisions order by number`);
  expect(history.rows).toEqual([
    { number: 1, description: textToDoc(""), change_reason: null },
    { number: 2, description: textToDoc("5 V DC"), change_reason: "USB" },
  ]);
  expect(await auditActions()).toContain("item.revise");

  // A save that started from an old revision must not overwrite the newer one.
  expect((await save({ baseRevision: 1, description: textToDoc("stale") })).statusCode).toBe(409);
  expect((await save({ baseRevision: 2, attributes: { [status]: "Bogus" } })).statusCode).toBe(400);
  expect((await save({ baseRevision: 2, name: " " })).statusCode).toBe(400);
  expect((await get(`/api/items/${id}`, cookie)).json().item.revision).toBe(2);
});

test("an item's history lists every version, newest first, with author and reason", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "First" })).json().node;
  await post(
    `/api/items/${id}/revisions`,
    { baseRevision: 1, name: "Second", description: textToDoc("d"), attributes: {}, changeReason: "why" },
    cookie,
  );

  const { revisions } = (await get(`/api/items/${id}/revisions`, cookie)).json();
  expect(revisions).toEqual([
    expect.objectContaining({
      number: 2,
      name: "Second",
      description: textToDoc("d"),
      changeReason: "why",
      author: "Admin",
    }),
    expect.objectContaining({
      number: 1,
      name: "First",
      description: textToDoc(""),
      changeReason: null,
      author: "Admin",
    }),
  ]);
  expect((await get("/api/items/00000000-0000-4000-8000-000000000000/revisions", cookie)).statusCode).toBe(404);
});

test("a draft is auto-saved, private to its author, and consumed by Save version", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "Item" })).json().node;
  const draft = { baseRevision: 1, name: "", description: textToDoc("work in progress"), attributes: {} };

  expect((await get(`/api/items/${id}`, cookie)).json().draft).toBeNull();
  expect((await send("PUT", `/api/items/${id}/draft`, cookie, draft)).statusCode).toBe(200);
  expect((await send("PUT", `/api/items/${id}/draft`, cookie, { ...draft, name: "Renamed" })).statusCode).toBe(200);
  const mine = (await get(`/api/items/${id}`, cookie)).json();
  expect(mine.draft).toMatchObject({ baseRevision: 1, name: "Renamed", description: textToDoc("work in progress") });
  // The committed item is untouched by a draft.
  expect(mine.item).toMatchObject({ name: "Item", revision: 1 });
  expect((await auditActions()).filter((a) => a === "draft.create")).toHaveLength(1);

  // Another user does not see it.
  await db.execute(
    sql`insert into users (email, name, password_hash) select 'b@example.com', 'B', password_hash from users`,
  );
  await db.execute(
    sql`insert into project_members (project_id, user_id, role) select p.id, u.id, 'editor' from projects p, users u where u.email = 'b@example.com'`,
  );
  const other = cookieOf(await post("/api/login", { email: "b@example.com", password: admin.password }));
  expect((await get(`/api/items/${id}`, other)).json().draft).toBeNull();

  // Saving a version removes the author's draft.
  await post(
    `/api/items/${id}/revisions`,
    { baseRevision: 1, name: "Renamed", description: draft.description, attributes: {} },
    cookie,
  );
  expect((await get(`/api/items/${id}`, cookie)).json()).toMatchObject({
    draft: null,
    item: { name: "Renamed", revision: 2 },
  });
});

test("a draft can be discarded, and bad drafts are rejected", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "Item" })).json().node;
  const draft = { baseRevision: 1, name: "X", description: textToDoc("x"), attributes: {} };
  await send("PUT", `/api/items/${id}/draft`, cookie, draft);
  expect((await send("DELETE", `/api/items/${id}/draft`, cookie)).statusCode).toBe(200);
  expect((await get(`/api/items/${id}`, cookie)).json().draft).toBeNull();
  expect(await auditActions()).toContain("draft.discard");

  const script = { type: "doc", content: [{ type: "script" }] };
  expect((await send("PUT", `/api/items/${id}/draft`, cookie, { ...draft, description: script })).statusCode).toBe(400);
  expect((await send("PUT", "/api/items/00000000-0000-4000-8000-000000000000/draft", cookie, draft)).statusCode).toBe(
    404,
  );
});

test("unsafe rich text is refused when saving a version", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "Item" })).json().node;
  const link = (href: string) => ({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }] },
    ],
  });
  const save = (description: object, baseRevision: number) =>
    post(`/api/items/${id}/revisions`, { baseRevision, name: "Item", description, attributes: {} }, cookie);
  expect((await save(link("javascript:alert(1)"), 1)).statusCode).toBe(400);
  expect((await save({ type: "doc", content: [{ type: "iframe" }] }, 1)).statusCode).toBe(400);
  expect((await save("plain string" as unknown as object, 1)).statusCode).toBe(400);
  expect((await save(link("https://example.com"), 1)).statusCode).toBe(201);
});

test("search finds items by UID, name, description and field values, in one project only", async () => {
  const { cookie, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const a = (await add(sys.id, { kind: "item", name: "Supply voltage" })).json().node.id;
  const b = (await add(sys.id, { kind: "item", name: "100% duty_cycle" })).json().node.id;
  const { fields } = (await get(`/api/items/${a}`, cookie)).json();
  const status = fields.find((f: { name: string }) => f.name === "Status").id;
  await post(
    `/api/items/${a}/revisions`,
    {
      baseRevision: 1,
      name: "Supply voltage",
      description: textToDoc("Runs from a battery pack"),
      attributes: { [status]: "Approved" },
    },
    cookie,
  );
  const search = async (q: string, project = projectId) =>
    (await get(`/api/projects/${project}/search?q=${encodeURIComponent(q)}`, cookie)).json().ids;

  expect(await search("volt")).toEqual([a]);
  expect(await search("BATTERY pack")).toEqual([a]);
  expect(await search("sys-002")).toEqual([b]);
  expect(await search("approved")).toEqual([a]);
  expect(await search("supply nomatch")).toEqual([]);
  // Wildcard characters are searched literally.
  expect(await search("100%")).toEqual([b]);
  expect(await search("duty_cycle")).toEqual([b]);
  expect(await search("dutyXcycle")).toEqual([]);
  expect(await search("%")).toEqual([b]);
  expect(await search("   ")).toEqual([]);

  await send("DELETE", `/api/nodes/${a}`, cookie);
  expect(await search("volt")).toEqual([]);
  const other = (await post("/api/projects", { name: "Other", templateId: "standard" }, cookie)).json().project;
  expect(await search("duty", other.id)).toEqual([]);
});

test("the list of a set includes descriptions and only the signed-in user's drafts", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "Item" })).json().node;
  await send("PUT", `/api/items/${id}/draft`, cookie, {
    baseRevision: 1,
    name: "Draft name",
    description: textToDoc("d"),
    attributes: {},
  });
  const list = (await get(`/api/sets/${sys.id}/items`, cookie)).json();
  expect(list.items[0]).toMatchObject({ name: "Item", description: textToDoc("") });
  expect(list.drafts).toEqual([expect.objectContaining({ itemId: id, name: "Draft name", baseRevision: 1 })]);

  await db.execute(
    sql`insert into users (email, name, password_hash) select 'b@example.com', 'B', password_hash from users`,
  );
  await db.execute(
    sql`insert into project_members (project_id, user_id, role) select p.id, u.id, 'editor' from projects p, users u where u.email = 'b@example.com'`,
  );
  const other = cookieOf(await post("/api/login", { email: "b@example.com", password: admin.password }));
  expect((await get(`/api/sets/${sys.id}/items`, other)).json().drafts).toEqual([]);
});

test("two saves from the same revision cannot both succeed", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const { id } = (await add(sys.id, { kind: "item", name: "A" })).json().node;
  const save = (name: string) =>
    post(`/api/items/${id}/revisions`, { baseRevision: 1, name, description: textToDoc(""), attributes: {} }, cookie);
  const codes = (await Promise.all([save("B"), save("C")])).map((r) => r.statusCode).sort();
  expect(codes).toEqual([201, 409]);
});

/** The live tree of a set as nested names, e.g. ["A", ["F", ["B"]]] . */
async function shape(
  detail: () => Promise<{ nodes: { id: string; setId: string; parentId: string | null; name: string }[] }>,
  setId: string,
) {
  const { nodes } = await detail();
  const level = (parentId: string | null): unknown[] =>
    nodes
      .filter((n) => n.setId === setId && n.parentId === parentId)
      .map((n) => (nodes.some((c) => c.parentId === n.id) ? [n.name, level(n.id)] : n.name));
  return level(null);
}

test("nodes can be reordered and moved between folders of one set", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const make = async (kind: string, name: string, parentId?: string, setId = sys.id) =>
    (await add(setId, { kind, name, parentId })).json().node.id as string;
  const f = await make("folder", "F");
  const g = await make("folder", "G", f);
  const a = await make("item", "A");
  const b = await make("item", "B");
  const elsewhere = await make("folder", "Elsewhere", undefined, un.id);
  const move = (id: string, parentId: string | null, beforeId: string | null) =>
    post(`/api/nodes/${id}/move`, { parentId, beforeId }, cookie);

  expect(await shape(detail, sys.id)).toEqual([["F", ["G"]], "A", "B"]);
  expect((await move(b, null, f)).statusCode).toBe(200);
  expect(await shape(detail, sys.id)).toEqual(["B", ["F", ["G"]], "A"]);
  expect((await move(a, g, null)).statusCode).toBe(200);
  expect((await move(b, g, a)).statusCode).toBe(200);
  expect(await shape(detail, sys.id)).toEqual([["F", [["G", ["B", "A"]]]]]);
  expect((await move(a, null, null)).statusCode).toBe(200);
  expect(await shape(detail, sys.id)).toEqual([["F", [["G", ["B"]]]], "A"]);

  // Refused: into itself, into its own descendant, into an item, into another set, before a non-sibling.
  for (const [id, parentId, beforeId] of [
    [f, f, null],
    [f, g, null],
    [f, a, null],
    [a, elsewhere, null],
    [a, null, b],
    [a, null, a],
  ] as const) {
    expect((await move(id, parentId, beforeId)).statusCode, `${id} -> ${parentId} before ${beforeId}`).toBe(400);
  }
  expect(await shape(detail, sys.id)).toEqual([["F", [["G", ["B"]]]], "A"]);
  expect(await auditActions()).toEqual(expect.arrayContaining(["item.move"]));
});

test("deleting hides a folder and everything in it, but keeps history and never reuses a UID", async () => {
  const { cookie, detail, sys, add } = await projectWithSets();
  const folder = (await add(sys.id, { kind: "folder", name: "F" })).json().node;
  const inside = (await add(sys.id, { kind: "item", name: "Inside", parentId: folder.id })).json().node;
  await add(sys.id, { kind: "item", name: "Outside" });

  const res = await send("DELETE", `/api/nodes/${folder.id}`, cookie);
  expect(res.json()).toEqual({ deleted: 2 });
  expect(await shape(detail, sys.id)).toEqual(["Outside"]);
  expect((await get(`/api/items/${inside.id}`, cookie)).statusCode).toBe(404);
  expect((await get(`/api/sets/${sys.id}/items`, cookie)).json().items).toHaveLength(1);
  expect((await send("DELETE", `/api/nodes/${folder.id}`, cookie)).statusCode).toBe(404);
  expect((await post(`/api/nodes/${inside.id}/move`, { parentId: null, beforeId: null }, cookie)).statusCode).toBe(404);
  expect(
    (
      await post(
        `/api/items/${inside.id}/revisions`,
        { baseRevision: 1, name: "X", description: textToDoc(""), attributes: {} },
        cookie,
      )
    ).statusCode,
  ).toBe(404);

  // Nothing was removed from the database, and the next item does not take SYS-001 again.
  const kept = await db.execute(sql`select count(*)::int as n from nodes where deleted_at is not null`);
  expect(kept.rows[0]).toEqual({ n: 2 });
  expect((await db.execute(sql`select count(*)::int as n from item_revisions`)).rows[0]).toEqual({ n: 2 });
  expect((await add(sys.id, { kind: "item", name: "Next" })).json().node.uid).toBe("SYS-003");
  expect(await auditActions()).toEqual(expect.arrayContaining(["folder.delete", "item.delete"]));
});

test("folders can be renamed; items cannot be renamed this way", async () => {
  const { cookie, detail, sys, add } = await projectWithSets();
  const folder = (await add(sys.id, { kind: "folder", name: "Old" })).json().node;
  const item = (await add(sys.id, { kind: "item", name: "Item" })).json().node;
  expect((await send("PATCH", `/api/nodes/${folder.id}`, cookie, { name: " New " })).statusCode).toBe(200);
  expect((await send("PATCH", `/api/nodes/${item.id}`, cookie, { name: "Nope" })).statusCode).toBe(404);
  expect((await send("PATCH", `/api/nodes/${folder.id}`, cookie, { name: " " })).statusCode).toBe(400);
  expect(await shape(detail, sys.id)).toEqual(["New", "Item"]);
  expect(await auditActions()).toContain("folder.rename");
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

test("items can be linked upstream to downstream, once per pair, and unlinked", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const need = (await add(un.id, { kind: "item", name: "Need" })).json().node.id;
  const req1 = (await add(sys.id, { kind: "item", name: "Req 1" })).json().node.id;
  const req2 = (await add(sys.id, { kind: "item", name: "Req 2" })).json().node.id;
  await post(
    `/api/items/${req1}/revisions`,
    { baseRevision: 1, name: "Req 1b", description: textToDoc(""), attributes: {} },
    cookie,
  );
  const list = async () => (await get(`/api/projects/${projectId}/links`, cookie)).json();
  const { linkTypes } = await list();
  expect(linkTypes.map((t: { name: string }) => t.name)).toEqual(["Related to", "Derived from", "Verified by"]);
  const typeId = linkTypes[1].id;
  const link = (upstreamId: string, downstreamId: string, type = typeId) =>
    post("/api/links", { upstreamId, downstreamId, typeId: type }, cookie);

  const created = await link(need, req1);
  expect(created.statusCode).toBe(201);
  expect((await link(need, req2)).statusCode).toBe(201);
  expect((await list()).links).toEqual([
    { id: created.json().link.id, typeId, upstreamId: need, downstreamId: req1 },
    expect.objectContaining({ upstreamId: need, downstreamId: req2 }),
  ]);
  // The link remembers which revisions it joined, for suspect-link checks later.
  const stored = await db.execute(
    sql`select upstream_revision, downstream_revision from links order by created_at limit 1`,
  );
  expect(stored.rows[0]).toEqual({ upstream_revision: 1, downstream_revision: 2 });

  expect((await link(need, req1)).statusCode, "duplicate").toBe(409);
  expect((await link(req1, need, linkTypes[0].id)).statusCode, "reverse duplicate").toBe(409);
  expect((await link(need, need)).statusCode, "self").toBe(400);
  expect((await link(need, "00000000-0000-4000-8000-000000000000")).statusCode, "missing item").toBe(404);
  expect((await link(req1, req2, "00000000-0000-4000-8000-000000000000")).statusCode, "bad type").toBe(400);

  // A deleted item's links disappear from the list; an unlinked pair can be linked again.
  await send("DELETE", `/api/nodes/${req2}`, cookie);
  expect((await list()).links).toHaveLength(1);
  expect((await send("DELETE", `/api/links/${created.json().link.id}`, cookie)).statusCode).toBe(200);
  expect((await send("DELETE", `/api/links/${created.json().link.id}`, cookie)).statusCode).toBe(404);
  expect((await list()).links).toEqual([]);
  expect((await link(req1, need)).statusCode).toBe(201);
  expect((await db.execute(sql`select count(*)::int as n from links`)).rows[0]).toEqual({ n: 3 });
  expect(await auditActions()).toEqual(expect.arrayContaining(["link.create", "link.delete"]));
});

test("two requests linking the same pair cannot both succeed, and projects cannot be linked together", async () => {
  const { cookie, detail, sys, add } = await projectWithSets();
  const a = (await add(sys.id, { kind: "item", name: "A" })).json().node.id;
  const b = (await add(sys.id, { kind: "item", name: "B" })).json().node.id;
  const { linkTypes } = (await get(`/api/projects/${(await detail()).project.id}/links`, cookie)).json();
  const typeId = linkTypes[0].id;
  const both = await Promise.all([
    post("/api/links", { upstreamId: a, downstreamId: b, typeId }, cookie),
    post("/api/links", { upstreamId: b, downstreamId: a, typeId }, cookie),
  ]);
  expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);

  const other = (await post("/api/projects", { name: "Other", templateId: "standard" }, cookie)).json().project;
  const otherSet = (await get(`/api/projects/${other.id}`, cookie)).json().sets[0];
  const c = (await add(otherSet.id, { kind: "item", name: "C" })).json().node.id;
  expect((await post("/api/links", { upstreamId: a, downstreamId: c, typeId }, cookie)).statusCode).toBe(400);
});

test("an image can be uploaded, embedded in a description and read back; other files are refused", async () => {
  const { cookie, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("fake image data"),
  ]);
  const upload = (payload: Buffer, type = "image/png", project = projectId) =>
    app.inject({
      method: "POST",
      url: `/api/projects/${project}/attachments`,
      payload,
      headers: { cookie, "content-type": type },
    });

  const res = await upload(png);
  expect(res.statusCode).toBe(201);
  const { id, src } = res.json();
  expect(src).toBe(`/api/attachments/${id}`);

  const file = await get(src, cookie);
  expect(file.statusCode).toBe(200);
  expect(file.headers["content-type"]).toBe("image/png");
  expect(file.headers["x-content-type-options"]).toBe("nosniff");
  expect(file.rawPayload.equals(png)).toBe(true);
  expect((await get(src)).statusCode, "anonymous").toBe(401);

  // The stated type is ignored: a script labelled as a PNG is refused, and a PNG labelled as JPEG is stored as PNG.
  expect((await upload(Buffer.from("<script>alert(1)</script>"))).statusCode).toBe(400);
  expect((await upload(png, "image/jpeg")).statusCode).toBe(201);
  expect((await upload(Buffer.from("<svg/>"), "image/svg+xml")).statusCode).toBe(415);
  expect((await upload(Buffer.alloc(5 * 1024 * 1024 + 1, 1))).statusCode).toBe(413);
  expect((await upload(png, "image/png", "00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
  expect(readdirSync(attachmentsDir)).toHaveLength(2);

  const { id: itemId } = (await add(sys.id, { kind: "item", name: "Item" })).json().node;
  const withImage = { type: "doc", content: [{ type: "image", attrs: { src, alt: "Diagram" } }] };
  const save = (description: object, baseRevision: number) =>
    post(`/api/items/${itemId}/revisions`, { baseRevision, name: "Item", description, attributes: {} }, cookie);
  expect((await save(withImage, 1)).statusCode).toBe(201);
  const external = { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/x.png" } }] };
  expect((await save(external, 2)).statusCode).toBe(400);
});

/** Creates an account with the admin's password, optionally adds it to every project with a role, and signs it in. */
async function person(name: string, role?: "viewer" | "reviewer" | "editor" | "admin") {
  const email = `${name.toLowerCase().replaceAll(" ", ".")}@example.com`;
  await db.execute(
    sql`insert into users (email, name, password_hash) select ${email}, ${name}, password_hash from users where is_admin limit 1`,
  );
  if (role) {
    await db.execute(
      sql`insert into project_members (project_id, user_id, role) select p.id, u.id, ${role} from projects p, users u where u.email = ${email}`,
    );
  }
  const res = await post("/api/login", { email, password: admin.password });
  return { cookie: cookieOf(res), id: res.json().user.id as string };
}

test("an invitation link creates one account, once", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  const invited = await post("/api/invitations", { email: "New@Example.com" }, cookie);
  expect(invited.statusCode).toBe(201);
  const { token, id } = invited.json();
  expect((await get("/api/users", cookie)).json().invitations).toEqual([
    expect.objectContaining({ id, email: "new@example.com" }),
  ]);
  // Only a hash of the token is stored.
  expect(
    (await db.execute(sql`select count(*)::int as n from invitations where token_hash = ${token}`)).rows[0],
  ).toEqual({ n: 0 });

  expect((await get(`/api/invitations/accept/${token}`)).json()).toEqual({ email: "new@example.com" });
  expect((await get(`/api/invitations/accept/${"x".repeat(43)}`)).statusCode).toBe(404);
  expect((await post("/api/invitations/accept", { token, name: "New", password: "short" })).statusCode).toBe(400);

  const accepted = await post("/api/invitations/accept", { token, name: " New Person ", password: "a long password" });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json().user).toMatchObject({ email: "new@example.com", name: "New Person", isAdmin: false });
  const theirs = cookieOf(accepted);
  expect((await get("/api/session", theirs)).json().user.name).toBe("New Person");

  // Used links, revoked links and existing accounts are all refused.
  expect(
    (await post("/api/invitations/accept", { token, name: "Again", password: "a long password" })).statusCode,
  ).toBe(404);
  expect((await post("/api/invitations", { email: "new@example.com" }, cookie)).statusCode).toBe(409);
  const second = (await post("/api/invitations", { email: "other@example.com" }, cookie)).json();
  expect((await send("DELETE", `/api/invitations/${second.id}`, cookie)).statusCode).toBe(200);
  expect((await get(`/api/invitations/accept/${second.token}`)).statusCode).toBe(404);

  // A new account is not an administrator and sees no projects until added to one.
  expect((await post("/api/invitations", { email: "x@example.com" }, theirs)).statusCode).toBe(403);
  expect((await get("/api/users", theirs)).statusCode).toBe(403);
  expect((await get("/api/projects", theirs)).json().projects).toEqual([]);
});

test("an expired invitation is refused", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  const { token } = (await post("/api/invitations", { email: "late@example.com" }, cookie)).json();
  await db.execute(sql`update invitations set expires_at = now() - interval '1 minute'`);
  expect((await post("/api/invitations/accept", { token, name: "Late", password: "a long password" })).statusCode).toBe(
    404,
  );
});

test("each project role can do exactly what it should", async () => {
  const { cookie: owner, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const item = (await add(sys.id, { kind: "item", name: "Item" })).json().node.id;
  const viewer = await person("Vera Viewer", "viewer");
  const reviewer = await person("Rob Reviewer", "reviewer");
  const editor = await person("Ed Editor", "editor");
  const projectAdmin = await person("Pat Admin", "admin");
  const outsider = await person("Olga Outsider");

  const addItem = (cookie: string) => post(`/api/sets/${sys.id}/nodes`, { kind: "item", name: "New" }, cookie);
  const comment = (cookie: string) => post(`/api/items/${item}/comments`, { body: "A comment" }, cookie);
  const setRole = (cookie: string) =>
    send("PUT", `/api/projects/${projectId}/members/${outsider.id}`, cookie, { role: "viewer" });
  const read = (cookie: string) => get(`/api/projects/${projectId}`, cookie);
  const codes = async (cookie: string) =>
    [await read(cookie), await comment(cookie), await addItem(cookie), await setRole(cookie)].map((r) => r.statusCode);

  //                                   read  comment  edit  manage members
  expect(await codes(outsider.cookie)).toEqual([404, 404, 404, 404]);
  expect(await codes(viewer.cookie)).toEqual([200, 403, 403, 403]);
  expect(await codes(reviewer.cookie)).toEqual([200, 201, 403, 403]);
  expect(await codes(editor.cookie)).toEqual([200, 201, 201, 403]);
  expect(await codes(projectAdmin.cookie)).toEqual([200, 201, 201, 200]);
  expect((await read(viewer.cookie)).json().role).toBe("viewer");
  expect((await read(owner)).json().role).toBe("admin");

  // The outsider was just added as a viewer by the project admin, and can be removed again.
  expect((await read(outsider.cookie)).statusCode).toBe(200);
  expect((await get("/api/projects", outsider.cookie)).json().projects).toHaveLength(1);
  expect((await get(`/api/projects/${projectId}/candidates`, editor.cookie)).statusCode).toBe(403);
  expect(
    (await send("DELETE", `/api/projects/${projectId}/members/${outsider.id}`, projectAdmin.cookie)).statusCode,
  ).toBe(200);
  expect((await read(outsider.cookie)).statusCode).toBe(404);
  // A project admin is not an instance admin: no account list, no new projects.
  expect((await get("/api/users", projectAdmin.cookie)).statusCode).toBe(403);
  expect((await post("/api/projects", { name: "X", templateId: "standard" }, projectAdmin.cookie)).statusCode).toBe(
    403,
  );
  // Linking is checked too, even though its ids arrive in the body.
  const other = (await add(sys.id, { kind: "item", name: "Other" })).json().node.id;
  const typeId = (await get(`/api/projects/${projectId}/links`, owner)).json().linkTypes[0].id;
  expect((await post("/api/links", { upstreamId: item, downstreamId: other, typeId }, viewer.cookie)).statusCode).toBe(
    403,
  );
  expect(
    (await post("/api/links", { upstreamId: item, downstreamId: other, typeId }, outsider.cookie)).statusCode,
  ).toBe(404);
});

// Hard rule: every endpoint checks permissions. Covers every route with an id in its path, including future ones.
test("someone outside a project is refused on every route that names something in it", async () => {
  const { cookie: owner, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const itemId = (await add(sys.id, { kind: "item", name: "A" })).json().node.id;
  const otherId = (await add(sys.id, { kind: "item", name: "B" })).json().node.id;
  const typeId = (await get(`/api/projects/${projectId}/links`, owner)).json().linkTypes[0].id;
  const linkId = (await post("/api/links", { upstreamId: itemId, downstreamId: otherId, typeId }, owner)).json().link
    .id;
  const commentId = (await post(`/api/items/${itemId}/comments`, { body: "x" }, owner)).json().id;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
  const upload = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/attachments`,
    payload: png,
    headers: { cookie: owner, "content-type": "image/png" },
  });
  const invitationId = (await post("/api/invitations", { email: "i@example.com" }, owner)).json().id;
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "B" }, owner)).json().id;
  const outsider = await person("Olga Outsider");
  const ids: Record<string, string> = {
    projectId,
    setId: sys.id,
    itemId,
    nodeId: itemId,
    linkId,
    commentId,
    attachmentId: upload.json().id,
    invitationId,
    baselineId,
    userId: outsider.id,
  };

  const routes = app.apiRoutes.filter((r) => !r.public && r.method !== "HEAD" && r.url.includes(":"));
  expect(routes.length).toBeGreaterThan(20);
  for (const { method, url } of routes) {
    const path = url.replace(/:(\w+)/g, (_, name: string) => {
      if (!ids[name]) throw new Error(`no test id for :${name} in ${url}; add one above`);
      return ids[name];
    });
    const res = await app.inject({
      method: method as "GET",
      url: path,
      payload: method === "GET" || method === "DELETE" ? undefined : {},
      headers: { cookie: outsider.cookie },
    });
    expect([403, 404], `${method} ${url} answered ${res.statusCode}`).toContain(res.statusCode);
  }
});

test("comments record mentions and appear in the activity stream; drafts do not", async () => {
  const { cookie: owner, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const item = (await add(sys.id, { kind: "item", name: "Supply voltage" })).json().node.id;
  const reviewer = await person("Rob Reviewer", "reviewer");
  await person("Olga Outsider");
  await send("PUT", `/api/items/${item}/draft`, owner, {
    baseRevision: 1,
    name: "x",
    description: textToDoc(""),
    attributes: {},
  });

  const posted = await post(
    `/api/items/${item}/comments`,
    { body: "  @Rob Reviewer please check. cc @Olga Outsider  " },
    owner,
  );
  expect(posted.statusCode).toBe(201);
  // Olga is not in the project, so she cannot be mentioned.
  expect(posted.json().mentions).toEqual([reviewer.id]);
  const mine = (await post(`/api/items/${item}/comments`, { body: "Looks fine" }, reviewer.cookie)).json().id;

  const list = (await get(`/api/items/${item}/comments`, reviewer.cookie)).json().comments;
  expect(list.map((c: { body: string; author: string }) => [c.author, c.body])).toEqual([
    ["Admin", "@Rob Reviewer please check. cc @Olga Outsider"],
    ["Rob Reviewer", "Looks fine"],
  ]);
  expect((await post(`/api/items/${item}/comments`, { body: "   " }, owner)).statusCode).toBe(400);

  // Only the author or a project admin deletes a comment.
  expect((await send("DELETE", `/api/comments/${posted.json().id}`, reviewer.cookie)).statusCode).toBe(403);
  expect((await send("DELETE", `/api/comments/${mine}`, reviewer.cookie)).statusCode).toBe(200);
  expect((await send("DELETE", `/api/comments/${mine}`, owner)).statusCode).toBe(404);
  expect((await get(`/api/items/${item}/comments`, owner)).json().comments).toHaveLength(1);
  expect((await db.execute(sql`select count(*)::int as n from comments`)).rows[0]).toEqual({ n: 2 });

  const { events, more } = (await get(`/api/projects/${projectId}/activity`, reviewer.cookie)).json();
  expect(more).toBe(false);
  const actions = events.map((e: { action: string }) => e.action);
  expect(actions).toEqual(
    expect.arrayContaining(["project.create", "item.create", "comment.create", "comment.delete"]),
  );
  expect(actions).not.toContain("draft.create");
  const mention = events.find(
    (e: { action: string; data: { mentions?: string[] } }) => e.action === "comment.create" && e.data.mentions?.length,
  );
  expect(mention).toMatchObject({
    actor: "Admin",
    entityId: item,
    data: { label: "SYS-001 Supply voltage", mentions: [reviewer.id] },
  });
  // Newest first, and paging by time works.
  expect(events[0].action).toBe("comment.delete");
  const oldest = events.at(-1);
  expect(
    (await get(`/api/projects/${projectId}/activity?before=${encodeURIComponent(oldest.at)}`, owner)).json().events,
  ).toEqual([]);
});

test("a baseline freezes items, folders and relationships; later changes do not touch it", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const folder = (await add(sys.id, { kind: "folder", name: "Power" })).json().node.id;
  const req = (await add(sys.id, { kind: "item", name: "Supply voltage", parentId: folder })).json().node.id;
  const gone = (await add(sys.id, { kind: "item", name: "Doomed" })).json().node.id;
  const need = (await add(un.id, { kind: "item", name: "Need" })).json().node.id;
  const typeId = (await get(`/api/projects/${projectId}/links`, cookie)).json().linkTypes[0].id;
  const link = (await post("/api/links", { upstreamId: need, downstreamId: req, typeId }, cookie)).json().link.id;
  const create = (body: object, as = cookie) => post(`/api/projects/${projectId}/baselines`, body, as);

  const whole = await create({ name: " Design review 1.0 " });
  expect(whole.statusCode).toBe(201);
  const ofSet = (await create({ name: "Needs only", setId: un.id })).json().id;
  expect((await create({ name: "  " })).statusCode).toBe(400);
  expect((await create({ name: "X", setId: "00000000-0000-4000-8000-000000000000" })).statusCode).toBe(400);
  expect((await create({ name: "X" }, (await person("Vera Viewer", "viewer")).cookie)).statusCode).toBe(403);

  // Everything changes after the baseline: a new version, a rename, a deletion, a new item, a removed relationship.
  await post(
    `/api/items/${req}/revisions`,
    { baseRevision: 1, name: "Supply voltage v2", description: textToDoc("5 V"), attributes: {} },
    cookie,
  );
  await send("PATCH", `/api/nodes/${folder}`, cookie, { name: "Electrical" });
  await send("DELETE", `/api/nodes/${gone}`, cookie);
  await add(sys.id, { kind: "item", name: "Later" });
  await send("DELETE", `/api/links/${link}`, cookie);

  const frozen = (await get(`/api/baselines/${whole.json().id}`, cookie)).json();
  expect(frozen.baseline).toMatchObject({ name: "Design review 1.0", setId: null, author: "Admin" });
  const byName = Object.fromEntries(frozen.entries.map((e: { name: string }) => [e.name, e]));
  expect(Object.keys(byName).sort()).toEqual(["Doomed", "Need", "Power", "Supply voltage"]);
  expect(byName["Supply voltage"]).toMatchObject({
    id: req,
    uid: "SYS-001",
    kind: "item",
    parentId: folder,
    revision: 1,
    description: textToDoc(""),
  });
  expect(byName.Power).toMatchObject({ kind: "folder", revision: null });
  expect(frozen.links).toEqual([{ id: link, typeId, upstreamId: need, downstreamId: req }]);

  // A set baseline holds that set's nodes, and the relationships that touch it.
  const part = (await get(`/api/baselines/${ofSet}`, cookie)).json();
  expect(part.entries.map((e: { name: string }) => e.name)).toEqual(["Need"]);
  expect(part.links).toHaveLength(1);

  const list = (await get(`/api/projects/${projectId}/baselines`, cookie)).json().baselines;
  expect(list.map((b: { name: string }) => b.name).sort()).toEqual(["Design review 1.0", "Needs only"]);
  expect(await auditActions()).toContain("baseline.create");
});

test("a spreadsheet import creates all its items with UIDs, field values and one audit event, or nothing", async () => {
  const { cookie, sys, add } = await projectWithSets();
  await add(sys.id, { kind: "item", name: "Existing" });
  const folder = (await add(sys.id, { kind: "folder", name: "Imported" })).json().node.id;
  const { fields } = (await get(`/api/sets/${sys.id}/items`, cookie)).json();
  const status = fields.find((f: { name: string }) => f.name === "Status").id;
  const bring = (body: object, as = cookie) => post(`/api/sets/${sys.id}/import`, body, as);

  const bad = await bring({ items: [{ name: "Fine" }, { name: "Broken", attributes: { [status]: "Bogus" } }] });
  expect(bad.statusCode).toBe(400);
  expect(bad.json().error).toContain("Item 2 (Broken)");
  expect((await bring({ items: [] })).statusCode).toBe(400);
  expect((await bring({ items: [{ name: "A" }], parentId: sys.id })).statusCode).toBe(400);
  expect((await bring({ items: [{ name: "A" }] }, (await person("Vera Viewer", "viewer")).cookie)).statusCode).toBe(
    403,
  );

  const done = await bring({
    parentId: folder,
    items: [
      { name: " Supply voltage ", description: "5 V DC\nfrom USB", attributes: { [status]: "Approved" } },
      { name: "Max current" },
    ],
  });
  expect(done.statusCode).toBe(201);
  // The failed import used up no UIDs.
  expect(done.json()).toEqual({ created: 2, firstUid: "SYS-002", lastUid: "SYS-003" });

  const list = (await get(`/api/sets/${sys.id}/items`, cookie)).json().items;
  expect(list.find((i: { uid: string }) => i.uid === "SYS-002")).toMatchObject({
    name: "Supply voltage",
    description: textToDoc("5 V DC\nfrom USB"),
    attributes: { [status]: "Approved" },
    revision: 1,
  });
  expect((await add(sys.id, { kind: "item", name: "Next" })).json().node.uid).toBe("SYS-004");
  expect((await auditActions()).filter((a) => a === "item.import")).toHaveLength(1);
});

test("a backup restores as a new project with history, relationships, comments, baselines and images", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const reviewer = await person("Rob Reviewer", "reviewer");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("pixels")]);
  const { src } = (
    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/attachments`,
      payload: png,
      headers: { cookie, "content-type": "image/png" },
    })
  ).json();
  const folder = (await add(sys.id, { kind: "folder", name: "Power" })).json().node.id;
  const req = (await add(sys.id, { kind: "item", name: "Supply", parentId: folder })).json().node.id;
  const doomed = (await add(sys.id, { kind: "item", name: "Doomed" })).json().node.id;
  const need = (await add(un.id, { kind: "item", name: "Need" })).json().node.id;
  const status = (await get(`/api/items/${req}`, cookie)).json().fields[0].id;
  const withImage = { type: "doc", content: [{ type: "image", attrs: { src, alt: "Diagram" } }] };
  await post(
    `/api/items/${req}/revisions`,
    { baseRevision: 1, name: "Supply voltage", description: withImage, attributes: { [status]: "Approved" } },
    cookie,
  );
  await send("DELETE", `/api/nodes/${doomed}`, cookie);
  const typeId = (await get(`/api/projects/${projectId}/links`, cookie)).json().linkTypes[0].id;
  await post("/api/links", { upstreamId: need, downstreamId: req, typeId }, cookie);
  await post(`/api/items/${req}/comments`, { body: "@Rob Reviewer check" }, cookie);
  await post(`/api/projects/${projectId}/baselines`, { name: "v1" }, cookie);

  expect((await get(`/api/projects/${projectId}/backup`, reviewer.cookie)).statusCode).toBe(403);
  const file = await get(`/api/projects/${projectId}/backup`, cookie);
  expect(file.statusCode).toBe(200);
  expect(file.headers["content-disposition"]).toContain("attachment");
  const backup = file.json();
  expect(backup).toMatchObject({ format: "open-requirements-backup", version: 1, project: { name: "P" } });
  // Password hashes never leave the server.
  expect(file.body).not.toContain("scrypt");

  // The reviewer has no account where this is restored: the email differs, as it would on another server.
  backup.users.find((u: { name: string }) => u.name === "Rob Reviewer").email = "rob@elsewhere.example";
  expect((await post("/api/projects/restore", backup, reviewer.cookie)).statusCode).toBe(403);
  const restored = await post("/api/projects/restore", backup, cookie);
  expect(restored.statusCode).toBe(201);
  const copy = restored.json().project;
  expect(copy).toMatchObject({ name: "P (restored)" });
  expect(copy.id).not.toBe(projectId);

  const tree = (await get(`/api/projects/${copy.id}`, cookie)).json();
  expect(tree.sets.map((s: { uidPrefix: string }) => s.uidPrefix)).toEqual(["UN", "SYS", "VER"]);
  const names = tree.nodes.map((n: { name: string }) => n.name).sort();
  expect(names).toEqual(["Need", "Power", "Supply voltage"]);
  const newReq = tree.nodes.find((n: { uid: string }) => n.uid === "SYS-001");
  expect(newReq.id).not.toBe(req);
  expect(tree.nodes.find((n: { name: string }) => n.name === "Power").id).toBe(newReq.parentId);

  // Field values are keyed by the new project's own field ids, and the image points at the copied file.
  const item = (await get(`/api/items/${newReq.id}`, cookie)).json();
  const newStatus = item.fields[0].id;
  expect(newStatus).not.toBe(status);
  expect(item.item).toMatchObject({ revision: 2, attributes: { [newStatus]: "Approved" } });
  const newSrc = item.item.description.content[0].attrs.src;
  expect(newSrc).not.toBe(src);
  expect((await get(newSrc, cookie)).rawPayload.equals(png)).toBe(true);

  const history = (await get(`/api/items/${newReq.id}/revisions`, cookie)).json().revisions;
  expect(history.map((r: { number: number; name: string; author: string }) => [r.number, r.name, r.author])).toEqual([
    [2, "Supply voltage", "Admin"],
    [1, "Supply", "Admin"],
  ]);
  expect((await get(`/api/projects/${copy.id}/links`, cookie)).json().links).toHaveLength(1);
  const [comment] = (await get(`/api/items/${newReq.id}/comments`, cookie)).json().comments;
  expect(comment).toMatchObject({ body: "@Rob Reviewer check", author: "Admin" });
  const [baseline] = (await get(`/api/projects/${copy.id}/baselines`, cookie)).json().baselines;
  expect((await get(`/api/baselines/${baseline.id}`, cookie)).json().entries).toHaveLength(3);
  expect((await get(`/api/projects/${copy.id}/search?q=voltage`, cookie)).json().ids).toEqual([newReq.id]);
  const actions = (await get(`/api/projects/${copy.id}/activity`, cookie))
    .json()
    .events.map((e: { action: string }) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["project.restore", "item.revise", "baseline.create"]));

  // UIDs of deleted items stay used in the copy, and the original project is untouched.
  const newSys = tree.sets[1].id;
  expect((await post(`/api/sets/${newSys}/nodes`, { kind: "item", name: "Next" }, cookie)).json().node.uid).toBe(
    "SYS-003",
  );
  expect((await detail()).nodes).toHaveLength(3);

  // The unknown person got an account that cannot sign in, is mentioned in the copy, and can take it over by invitation.
  const members = (await get(`/api/projects/${copy.id}/members`, cookie)).json().members;
  const rob = members.find((m: { email: string }) => m.email === "rob@elsewhere.example");
  expect(rob).toMatchObject({ name: "Rob Reviewer", role: "reviewer" });
  expect(comment.mentions).toEqual([rob.userId]);
  expect((await post("/api/login", { email: "rob@elsewhere.example", password: "none" })).statusCode).toBe(401);
  const invited = await post("/api/invitations", { email: "rob@elsewhere.example" }, cookie);
  expect(invited.statusCode).toBe(201);
  const accepted = await post("/api/invitations/accept", {
    token: invited.json().token,
    name: "Rob",
    password: "a long password",
  });
  expect(accepted.json().user).toMatchObject({ id: rob.userId, isAdmin: false });
  // An account with a password cannot be taken over this way.
  expect((await post("/api/invitations", { email: "rob@elsewhere.example" }, cookie)).statusCode).toBe(409);
});

test("a backup that is malformed or points outside itself is refused, and leaves nothing behind", async () => {
  const { cookie, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const item = (await add(sys.id, { kind: "item", name: "A" })).json().node.id;
  const other = (await post("/api/projects", { name: "Other", templateId: "standard" }, cookie)).json().project;
  const otherSet = (await get(`/api/projects/${other.id}`, cookie)).json().sets[0].id;
  const good = (await get(`/api/projects/${projectId}/backup`, cookie)).body;
  type Rows = Record<string, unknown>[];
  const restore = (change: (backup: Record<"nodes" | "itemRevisions" | "attachments" | "users", Rows>) => void) => {
    const backup = JSON.parse(good);
    change(backup);
    return post("/api/projects/restore", backup, cookie);
  };

  expect((await restore((b) => Object.assign(b, { version: 2 }))).statusCode).toBe(400);
  expect((await restore((b) => Object.assign(b, { nodes: undefined }))).statusCode).toBe(400);
  // A node placed in another project's set.
  const foreign = await restore((b) => Object.assign(b.nodes[0] as object, { setId: otherSet }));
  expect(foreign.statusCode).toBe(400);
  expect(foreign.json().error).toContain("not in sets");
  const script = { type: "doc", content: [{ type: "script" }] };
  expect((await restore((b) => Object.assign(b.itemRevisions[0] as object, { description: script }))).statusCode).toBe(
    400,
  );
  expect(
    (await restore((b) => Object.assign(b.itemRevisions[0] as object, { attributes: { nope: 1 } }))).statusCode,
  ).toBe(400);
  // Two versions of one item with the same number: caught by the database.
  const twice = await restore((b) =>
    b.itemRevisions.push({
      ...b.itemRevisions[0],
      id: "00000000-0000-4000-8000-000000000001",
    }),
  );
  expect(twice.statusCode).toBe(400);
  expect(
    (
      await restore((b) =>
        b.attachments.push({
          id: "00000000-0000-4000-8000-000000000002",
          createdBy: b.users[0]?.id,
          createdAt: new Date().toISOString(),
          data: Buffer.from("<script>").toString("base64"),
        }),
      )
    ).statusCode,
  ).toBe(400);

  expect((await get("/api/projects", cookie)).json().projects).toHaveLength(2);
  expect((await get(`/api/items/${item}`, cookie)).statusCode).toBe(200);
  expect((await restore(() => {})).statusCode).toBe(201);
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
