import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guessReqifMapping, mapReqif, summarizeReqif } from "@app/importers";
import { parseReqif, type ReqifAttribute, type ReqifNode, type ReqifValue, unzip, writeXml } from "@app/reqif";
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
  app = await buildApp(db, { loginAttemptsPerMinute: 1000, attachmentsDir, maxAttachmentMb: 5 });
});
beforeEach(async () => {
  await db.execute(
    sql`truncate users, sessions, api_tokens, result_attachments, baseline_verification, verification_results, step_results, test_runs, test_cycles, test_plan_cases, test_plans, projects, item_types, attribute_definitions, sets, nodes, item_revisions, item_drafts, link_types, links, attachments, comments, project_members, invitations, baselines, baseline_entries, baseline_links, reviews, review_participants, review_marks, signatures, audit_events cascade`,
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
  expect((await get("/api/session")).json()).toEqual({ user: null, needsSetup: true, mail: false });

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
  // The project tree carries each item's state, for the explorer and other overviews.
  const tree = (
    await get(`/api/projects/${(await get("/api/projects", cookie)).json().projects[0].id}`, cookie)
  ).json();
  expect(tree.nodes).toEqual([expect.objectContaining({ id, status: "Approved" })]);

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
    {
      id: created.json().link.id,
      typeId,
      upstreamId: need,
      downstreamId: req1,
      confirmed: { upstream: 1, downstream: 2 },
      current: { upstream: 1, downstream: 2 },
      changed: { upstream: false, downstream: false },
    },
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

test("a new version of either end makes a relationship suspect until an editor confirms it", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const need = (await add(un.id, { kind: "item", name: "Need" })).json().node.id;
  const req1 = (await add(sys.id, { kind: "item", name: "Req 1" })).json().node.id;
  const req2 = (await add(sys.id, { kind: "item", name: "Req 2" })).json().node.id;
  const typeId = (await get(`/api/projects/${projectId}/links`, cookie)).json().linkTypes[0].id;
  const link1 = (await post("/api/links", { upstreamId: need, downstreamId: req1, typeId }, cookie)).json().link.id;
  const link2 = (await post("/api/links", { upstreamId: need, downstreamId: req2, typeId }, cookie)).json().link.id;
  const revise = (itemId: string, baseRevision: number) =>
    post(
      `/api/items/${itemId}/revisions`,
      { baseRevision, name: `v${baseRevision + 1}`, description: textToDoc(""), attributes: {} },
      cookie,
    );
  const list = async () => (await get(`/api/projects/${projectId}/links`, cookie)).json().links;
  const confirm = (links: object[], as = cookie) => post(`/api/projects/${projectId}/links/confirm`, { links }, as);
  const seen = (id: string, upstreamRevision: number, downstreamRevision: number) => ({
    id,
    upstreamRevision,
    downstreamRevision,
  });
  const rowsBefore = (await db.execute(sql`select * from links order by id`)).rows;

  // The upstream item changes: both of its relationships are suspect. One downstream item changes too.
  await revise(need, 1);
  await revise(req2, 1);
  expect((await list()).map((l: { changed: object }) => l.changed)).toEqual([
    { upstream: true, downstream: false },
    { upstream: true, downstream: true },
  ]);
  // A baseline records which relationships were suspect when it was made.
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "B" }, cookie)).json().id;

  expect((await confirm([seen(link1, 2, 1)], (await person("Vera Viewer", "viewer")).cookie)).statusCode).toBe(403);
  expect((await confirm([seen(link1, 1, 1)])).statusCode, "confirming a version that is no longer current").toBe(409);
  expect((await confirm([seen("00000000-0000-4000-8000-000000000000", 1, 1)])).statusCode).toBe(404);
  // All or nothing: one stale entry stops the whole request.
  expect((await confirm([seen(link1, 2, 1), seen(link2, 2, 1)])).statusCode).toBe(409);
  expect((await list()).every((l: { changed: { upstream: boolean } }) => l.changed.upstream)).toBe(true);

  expect((await confirm([seen(link1, 2, 1), seen(link2, 2, 2)])).json()).toEqual({ confirmed: 2 });
  expect(await list()).toEqual([
    expect.objectContaining({
      confirmed: { upstream: 2, downstream: 1 },
      changed: { upstream: false, downstream: false },
    }),
    expect.objectContaining({
      confirmed: { upstream: 2, downstream: 2 },
      changed: { upstream: false, downstream: false },
    }),
  ]);
  // Confirming what is not suspect records nothing.
  expect((await confirm([seen(link1, 2, 1)])).json()).toEqual({ confirmed: 0 });

  // The next change makes it suspect again, and a second confirmation is a second link revision.
  await revise(req1, 1);
  expect((await list())[0].changed).toEqual({ upstream: false, downstream: true });
  expect((await confirm([seen(link1, 2, 2)])).json()).toEqual({ confirmed: 1 });
  const revisions = await db.execute(
    sql`select number, upstream_revision, downstream_revision from link_revisions where link_id = ${link1} order by number`,
  );
  expect(revisions.rows).toEqual([
    { number: 1, upstream_revision: 2, downstream_revision: 1 },
    { number: 2, upstream_revision: 2, downstream_revision: 2 },
  ]);
  // Link rows are never edited, and the baseline still says what was suspect then.
  expect((await db.execute(sql`select * from links order by id`)).rows).toEqual(rowsBefore);
  const frozen = (await get(`/api/baselines/${baselineId}`, cookie)).json().links;
  expect(frozen.map((l: { suspect: boolean }) => l.suspect)).toEqual([true, true]);
  expect((await auditActions()).filter((a) => a === "link.confirm")).toHaveLength(3);
});

test("trace view, coverage and impact analysis follow relationships across sets and survive a loop", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const { project, sets } = await detail();
  const ver = sets[2];
  const make = async (setId: string, name: string) => (await add(setId, { kind: "item", name })).json().node.id;
  const [n, r1, r2, r3, t1] = [
    await make(un.id, "N"),
    await make(sys.id, "R1"),
    await make(sys.id, "R2"),
    await make(sys.id, "R3"),
    await make(ver.id, "T1"),
  ];
  const typeId = (await get(`/api/projects/${project.id}/links`, cookie)).json().linkTypes[0].id;
  const link = async (upstreamId: string, downstreamId: string) =>
    (await post("/api/links", { upstreamId, downstreamId, typeId }, cookie)).json().link.id as string;
  const nr1 = await link(n, r1);
  await link(n, r2);
  await link(r1, t1);
  type Node = { itemId: string; children: Node[]; stop?: string };
  const show = (nodes: Node[]): unknown[] =>
    nodes.map((x) => [x.itemId, ...(x.stop ? [x.stop] : []), ...(x.children.length ? [show(x.children)] : [])]);
  const viewer = (await person("Vera Viewer", "viewer")).cookie;
  const trace = async (setId: string, query = "") => (await get(`/api/sets/${setId}/trace${query}`, viewer)).json();
  const row = (rows: { itemId: string }[], id: string) => rows.find((r) => r.itemId === id);

  // Defaults: one level up, two down. The verification set is the target because its item type is a test case.
  const requirements = await trace(sys.id);
  expect(requirements.targetSetId).toBe(ver.id);
  expect(requirements.coverage).toEqual({ items: 3, noDownstream: 2, reachTarget: 1 });
  expect(row(requirements.rows, r1)).toMatchObject({
    upstream: [{ itemId: n, linkId: nr1, children: [] }],
    downstream: [{ itemId: t1 }],
    reachesTarget: true,
  });
  expect(row(requirements.rows, r3)).toMatchObject({ upstream: [], downstream: [], reachesTarget: false });

  // Coverage looks at any depth, whatever number of levels the columns show.
  const needs = await trace(un.id, "?down=1");
  expect(show(needs.rows[0].downstream)).toEqual([[r1], [r2]]);
  expect(needs.coverage).toEqual({ items: 1, noDownstream: 0, reachTarget: 1 });
  expect(show((await trace(un.id)).rows[0].downstream)).toEqual([[r1, [[t1]]], [r2]]);
  expect((await trace(un.id, `?target=${sys.id}`)).coverage.reachTarget).toBe(1);
  expect((await trace(sys.id, `?target=${sys.id}`)).coverage.reachTarget).toBe(0);

  // A loop of relationships ends the branch instead of running forever.
  await link(t1, n);
  const impact = (await get(`/api/items/${n}/impact`, viewer)).json();
  expect(show(impact.downstream)).toEqual([[r1, [[t1, [[n, "loop"]]]]], [r2]]);
  expect(show(impact.upstream)).toEqual([[t1, [[r1, [[n, "loop"]]]]]]);
  expect(show((await trace(un.id, "?down=4")).rows[0].downstream)).toEqual([[r1, [[t1, [[n, "loop"]]]]], [r2]]);

  // A deleted item drops out of the trace, the coverage and the impact tree.
  await send("DELETE", `/api/nodes/${t1}`, cookie);
  expect((await trace(sys.id)).coverage).toEqual({ items: 3, noDownstream: 3, reachTarget: 0 });
  expect(show((await get(`/api/items/${n}/impact`, viewer)).json().downstream)).toEqual([[r1], [r2]]);
  expect((await get(`/api/items/${t1}/impact`, cookie)).statusCode).toBe(404);

  expect((await get(`/api/sets/${sys.id}/trace?up=5`, cookie)).statusCode).toBe(400);
  const other = (await post("/api/projects", { name: "Other", templateId: "standard" }, cookie)).json().project;
  const foreign = (await get(`/api/projects/${other.id}`, cookie)).json().sets[0].id;
  expect((await get(`/api/sets/${sys.id}/trace?target=${foreign}`, cookie)).statusCode).toBe(400);
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
  const ownerId = (await get("/api/session", owner)).json().user.id;
  const testCase = (await add((await detail()).sets[2].id, { kind: "item", name: "T" })).json().node.id;
  const testPlanId = (await post(`/api/projects/${projectId}/test-plans`, { name: "Plan" }, owner)).json().id;
  await post(`/api/test-plans/${testPlanId}/cases`, { itemIds: [testCase] }, owner);
  const testCycleId = (await post(`/api/test-plans/${testPlanId}/cycles`, { name: "Cycle" }, owner)).json().id;
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
    reviewId: (
      await post(`/api/projects/${projectId}/reviews`, { name: "R", baselineId, approvers: [ownerId] }, owner)
    ).json().id,
    userId: outsider.id,
    tokenId: (await post("/api/tokens", { name: "CI" }, owner)).json().id,
    testPlanId,
    testCycleId,
    testRunId: (await get(`/api/test-cycles/${testCycleId}`, owner)).json().runs[0].id,
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
  expect(frozen.links).toEqual([{ id: link, typeId, upstreamId: need, downstreamId: req, suspect: false }]);

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
  const linkId = (await post("/api/links", { upstreamId: need, downstreamId: req, typeId }, cookie)).json().link.id;
  await post(`/api/items/${req}/comments`, { body: "@Rob Reviewer check" }, cookie);
  const ver = (await detail()).sets[2].id;
  const testCase = (await add(ver, { kind: "item", name: "Measure supply" })).json().node.id;
  const evidence = src.split("/").pop();
  await post(`/api/items/${testCase}/results`, { outcome: "fail", note: "4.2 V", attachmentIds: [evidence] }, cookie);
  // The relationship goes suspect, is frozen suspect in a baseline, then is confirmed.
  await post(
    `/api/items/${need}/revisions`,
    { baseRevision: 1, name: "Need 2", description: textToDoc(""), attributes: {} },
    cookie,
  );
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "v1" }, cookie)).json().id;
  // A signed and closed review of that baseline, with a comment made in it.
  const me = (await get("/api/session", cookie)).json().user.id;
  const reviewId = (
    await post(`/api/projects/${projectId}/reviews`, { name: "Design review", baselineId, approvers: [me] }, cookie)
  ).json().id;
  await post(`/api/items/${req}/comments`, { body: "Reviewed in the meeting", reviewId }, cookie);
  await post(`/api/reviews/${reviewId}/marks`, { itemIds: [req, need, testCase], mark: "approved" }, cookie);
  expect((await post(`/api/reviews/${reviewId}/sign`, { password: admin.password }, cookie)).statusCode).toBe(201);
  expect((await post(`/api/reviews/${reviewId}/close`, {}, cookie)).json()).toMatchObject({ state: "approved" });
  await post(
    `/api/projects/${projectId}/links/confirm`,
    { links: [{ id: linkId, upstreamRevision: 2, downstreamRevision: 2 }] },
    cookie,
  );

  // A test plan with one cycle: a run assigned to the reviewer, executed and finished as failed.
  const ran = (await add(ver, { kind: "item", name: "Run me" })).json().node.id;
  const planId = (await post(`/api/projects/${projectId}/test-plans`, { name: "Release 1.0" }, cookie)).json().id;
  await post(`/api/test-plans/${planId}/cases`, { itemIds: [ran], group: "Smoke" }, cookie);
  const cycleId = (await post(`/api/test-plans/${planId}/cycles`, { name: "Round 1" }, cookie)).json().id;
  const runId = (await get(`/api/test-cycles/${cycleId}`, cookie)).json().runs[0].id;
  await post(`/api/test-cycles/${cycleId}/assign`, { runIds: [runId], assigneeId: reviewer.id }, cookie);
  await post(`/api/test-runs/${runId}/steps`, { steps: [1], outcome: "fail", actual: "No light" }, reviewer.cookie);
  const defectUrl = "https://tracker.example/BUG-7";
  expect((await post(`/api/test-runs/${runId}/finish`, { defectUrl }, reviewer.cookie)).statusCode).toBe(201);

  expect((await get(`/api/projects/${projectId}/backup`, reviewer.cookie)).statusCode).toBe(403);
  const file = await get(`/api/projects/${projectId}/backup`, cookie);
  expect(file.statusCode).toBe(200);
  expect(file.headers["content-disposition"]).toContain("attachment");
  const backup = file.json();
  expect(backup).toMatchObject({ format: "open-requirements-backup", version: 6, project: { name: "P" } });
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
  expect(names).toEqual(["Measure supply", "Need 2", "Power", "Run me", "Supply voltage"]);
  expect(tree.sets.map((s: { isTest: boolean }) => s.isTest)).toEqual([false, false, true]);
  // The test plan came along with its cycle, the run's step result, and the result the run recorded.
  const [plan] = (await get(`/api/projects/${copy.id}/test-plans`, cookie)).json().plans;
  expect(plan).toMatchObject({ name: "Release 1.0", cases: 1, cycles: 1 });
  expect(plan.id).not.toBe(planId);
  const newPlan = (await get(`/api/test-plans/${plan.id}`, cookie)).json();
  const newRan = tree.nodes.find((n: { uid: string }) => n.uid === "VER-002").id;
  expect(newPlan.cases).toEqual([{ itemId: newRan, group: "Smoke" }]);
  expect(newPlan.cycles).toEqual([
    expect.objectContaining({ name: "Round 1", runs: expect.objectContaining({ failed: 1 }) }),
  ]);
  const [newRun] = (await get(`/api/test-cycles/${newPlan.cycles[0].id}`, cookie)).json().runs;
  expect(newRun).toMatchObject({ uid: "VER-002", assignee: "Rob Reviewer", state: "failed", finished: true });
  expect((await get(`/api/test-runs/${newRun.id}`, cookie)).json().run.steps).toEqual([
    expect.objectContaining({ outcome: "fail", actual: "No light", by: "Rob Reviewer" }),
  ]);
  expect((await get(`/api/items/${newRan}/results`, cookie)).json().results).toEqual([
    expect.objectContaining({ outcome: "fail", source: "run", runId: newRun.id, defectUrl }),
  ]);
  // The result comes back on the copied test case, with its evidence pointing at the copied image.
  const newTest = tree.nodes.find((n: { uid: string }) => n.uid === "VER-001").id;
  const [result] = (await get(`/api/items/${newTest}/results`, cookie)).json().results;
  expect(result).toMatchObject({ outcome: "fail", note: "4.2 V", revision: 1, recordedBy: "Admin" });
  expect(result.attachments).toHaveLength(1);
  expect(result.attachments[0].id).not.toBe(evidence);
  expect((await get(`/api/attachments/${result.attachments[0].id}`, cookie)).statusCode).toBe(200);
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
  // The confirmation came along: the relationship is not suspect in the copy, and the baseline still says it was.
  expect((await get(`/api/projects/${copy.id}/links`, cookie)).json().links).toEqual([
    expect.objectContaining({
      confirmed: { upstream: 2, downstream: 2 },
      changed: { upstream: false, downstream: false },
    }),
  ]);
  const [comment, inReview] = (await get(`/api/items/${newReq.id}/comments`, cookie)).json().comments;
  expect(comment).toMatchObject({ body: "@Rob Reviewer check", author: "Admin", reviewId: null });
  // The review came along with its decision, and its signature still matches what was signed.
  const [review] = (await get(`/api/projects/${copy.id}/reviews`, cookie)).json().reviews;
  expect(review).toMatchObject({ name: "Design review", state: "approved", baseline: "v1" });
  expect(review.id).not.toBe(reviewId);
  expect(inReview).toMatchObject({ body: "Reviewed in the meeting", reviewId: review.id, review: "Design review" });
  const copied = (await get(`/api/reviews/${review.id}`, cookie)).json();
  expect(copied.participants).toEqual([
    expect.objectContaining({
      role: "approver",
      signature: expect.objectContaining({ meaning: "approval", valid: true }),
    }),
  ]);
  expect(Object.values(copied.outcomes)).toEqual(["approved", "approved", "approved"]);
  const [baseline] = (await get(`/api/projects/${copy.id}/baselines`, cookie)).json().baselines;
  const frozen = (await get(`/api/baselines/${baseline.id}`, cookie)).json();
  expect(frozen.entries).toHaveLength(4);
  expect(frozen.links).toEqual([expect.objectContaining({ suspect: true })]);
  expect((await get(`/api/projects/${copy.id}/search?q=voltage`, cookie)).json().ids).toEqual([newReq.id]);
  const actions = (await get(`/api/projects/${copy.id}/activity`, cookie))
    .json()
    .events.map((e: { action: string }) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["project.restore", "item.revise", "baseline.create"]));

  // A version 1 file, from before suspect links, still restores: nothing confirmed, nothing recorded on its baselines.
  // Its results name their one evidence image themselves, as files did before version 6.
  const { linkRevisions: _, resultAttachments, ...old } = backup;
  const evidenceOf = new Map(
    resultAttachments.map((a: { resultId: string; attachmentId: string }) => [a.resultId, a.attachmentId]),
  );
  const v1 = {
    ...old,
    version: 1,
    verificationResults: backup.verificationResults.map((r: { id: string }) => ({
      ...r,
      attachmentId: evidenceOf.get(r.id) ?? null,
    })),
    itemTypes: backup.itemTypes.map(({ id, name }: { id: string; name: string }) => ({ id, name })),
    baselineLinks: backup.baselineLinks.map((l: { baselineId: string; linkId: string }) => ({
      baselineId: l.baselineId,
      linkId: l.linkId,
    })),
  };
  const fromV1 = (await post("/api/projects/restore", v1, cookie)).json().project;
  expect((await get(`/api/projects/${fromV1.id}/links`, cookie)).json().links[0].changed.upstream).toBe(true);
  const [oldBaseline] = (await get(`/api/projects/${fromV1.id}/baselines`, cookie)).json().baselines;
  expect((await get(`/api/baselines/${oldBaseline.id}`, cookie)).json().links[0].suspect).toBeNull();

  // UIDs of deleted items stay used in the copy, and the original project is untouched.
  const newSys = tree.sets[1].id;
  expect((await post(`/api/sets/${newSys}/nodes`, { kind: "item", name: "Next" }, cookie)).json().node.uid).toBe(
    "SYS-003",
  );
  expect((await detail()).nodes).toHaveLength(5);
  // A file from before item types had a role still knows its test cases: by the type's name, as the tool did then.
  const fromV1Sets = (await get(`/api/projects/${fromV1.id}`, cookie)).json().sets;
  expect(fromV1Sets.map((s: { isTest: boolean }) => s.isTest)).toEqual([false, false, true]);
  const v1Test = (await get(`/api/projects/${fromV1.id}`, cookie))
    .json()
    .nodes.find((n: { uid: string }) => n.uid === "VER-001").id;
  expect((await get(`/api/items/${v1Test}/results`, cookie)).json().results[0].attachments).toHaveLength(1);

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

  expect((await restore((b) => Object.assign(b, { version: 7 }))).statusCode).toBe(400);
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
          data: Buffer.from("MZ\u0090\u0000\u0003").toString("base64"),
        }),
      )
    ).statusCode,
  ).toBe(400);

  expect((await get("/api/projects", cookie)).json().projects).toHaveLength(2);
  expect((await get(`/api/items/${item}`, cookie)).statusCode).toBe(200);
  expect((await restore(() => {})).statusCode).toBe(201);
});

test("a deleted folder is restored with its contents; an item alone comes back under the set", async () => {
  const { cookie, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const folder = (await add(sys.id, { kind: "folder", name: "Power" })).json().node.id;
  const inside = (await add(sys.id, { kind: "item", name: "Inside", parentId: folder })).json().node.id;
  const early = (await add(sys.id, { kind: "item", name: "Deleted earlier", parentId: folder })).json().node.id;
  await add(sys.id, { kind: "item", name: "Stays" });
  const restore = (id: string, as = cookie) => post(`/api/nodes/${id}/restore`, {}, as);

  await send("DELETE", `/api/nodes/${early}`, cookie);
  await send("DELETE", `/api/nodes/${folder}`, cookie);
  const trash = (await get(`/api/projects/${projectId}/trash`, cookie)).json().deleted;
  expect(trash.map((n: { name: string }) => n.name).sort()).toEqual(["Deleted earlier", "Inside", "Power"]);
  expect(trash.find((n: { name: string }) => n.name === "Inside")).toMatchObject({
    uid: "SYS-001",
    set: "System Requirements",
  });

  expect((await restore(inside, (await person("Vera Viewer", "viewer")).cookie)).statusCode).toBe(403);
  // The folder is still deleted, so the item deleted before it comes back at the top of the set.
  expect((await restore(early)).json()).toEqual({ restored: 1 });
  expect((await restore(early)).statusCode).toBe(404);
  // The folder brings back what was deleted with it, and only that.
  expect((await restore(folder)).json()).toEqual({ restored: 2 });

  const nodes = (await detail()).nodes as { id: string; name: string; parentId: string | null }[];
  const parentOf = (id: string) => nodes.find((n) => n.id === id)?.parentId;
  expect(nodes).toHaveLength(4);
  expect([parentOf(inside), parentOf(early), parentOf(folder)]).toEqual([folder, null, null]);
  expect(nodes.filter((n) => n.parentId === null).map((n) => n.name)).toEqual(["Stays", "Deleted earlier", "Power"]);
  expect((await get(`/api/projects/${projectId}/trash`, cookie)).json().deleted).toEqual([]);
  expect(await auditActions()).toEqual(expect.arrayContaining(["folder.restore", "item.restore"]));
});

test("a user changes their own password, which ends their other sessions", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  const elsewhere = cookieOf(await post("/api/login", { email: admin.email, password: admin.password }));
  const change = (body: object) => post("/api/account/password", body, cookie);

  expect((await change({ current: "wrong", password: "another long password" })).statusCode).toBe(400);
  expect((await change({ current: admin.password, password: "short" })).statusCode).toBe(400);
  expect((await change({ current: admin.password, password: "another long password" })).statusCode).toBe(200);

  expect((await get("/api/projects", cookie)).statusCode).toBe(200);
  expect((await get("/api/projects", elsewhere)).statusCode).toBe(401);
  expect((await post("/api/login", { email: admin.email, password: admin.password })).statusCode).toBe(401);
  expect((await post("/api/login", { email: admin.email, password: "another long password" })).statusCode).toBe(200);
  expect(await auditActions()).toContain("user.password");
});

test("a deactivated account is signed out and cannot sign in until it is activated again", async () => {
  const { cookie, sys, add } = await projectWithSets();
  const editor = await person("Ed Editor", "editor");
  const item = (await post(`/api/sets/${sys.id}/nodes`, { kind: "item", name: "Ed's" }, editor.cookie)).json().node.id;
  await add(sys.id, { kind: "item", name: "Other" });
  const setActive = (id: string, active: boolean, as = cookie) =>
    send("PUT", `/api/users/${id}/active`, as, { active });
  const me = (await get("/api/session", cookie)).json().user.id;

  expect((await setActive(me, false)).statusCode).toBe(400);
  expect((await setActive(me, false, editor.cookie)).statusCode).toBe(403);
  expect((await setActive("00000000-0000-4000-8000-000000000000", false)).statusCode).toBe(404);
  expect((await setActive(editor.id, false)).statusCode).toBe(200);

  expect((await get("/api/projects", editor.cookie)).statusCode).toBe(401);
  expect((await post("/api/login", { email: "ed.editor@example.com", password: admin.password })).statusCode).toBe(401);
  // What they wrote stays, under their name.
  expect((await get(`/api/items/${item}/revisions`, cookie)).json().revisions[0].author).toBe("Ed Editor");
  const listed = (await get("/api/users", cookie)).json().users.find((u: { id: string }) => u.id === editor.id);
  expect(listed.deactivatedAt).not.toBeNull();

  expect((await setActive(editor.id, true)).statusCode).toBe(200);
  expect((await post("/api/login", { email: "ed.editor@example.com", password: admin.password })).statusCode).toBe(200);
  expect(await auditActions()).toEqual(expect.arrayContaining(["user.deactivate", "user.activate"]));
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

test("an access token signs a script in as its user until it is revoked, and cannot make more tokens", async () => {
  const cookie = cookieOf(await post("/api/setup", admin));
  const made = await post("/api/tokens", { name: " CI " }, cookie);
  expect(made.statusCode).toBe(201);
  const { id, token } = made.json();
  expect(token).toMatch(/^orq_/);
  // Only a hash of the token is stored.
  expect(
    (await db.execute(sql`select count(*)::int as n from api_tokens where token_hash = ${token}`)).rows[0],
  ).toEqual({ n: 0 });
  expect((await get("/api/tokens", cookie)).json().tokens).toEqual([expect.objectContaining({ id, name: "CI" })]);

  const as = (authorization: string, method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization } });
  expect((await as(`Bearer ${token}`, "GET", "/api/projects")).statusCode).toBe(200);
  expect((await as("Bearer orq_wrong", "GET", "/api/projects")).statusCode).toBe(401);
  expect((await as("Basic abc", "GET", "/api/projects")).statusCode).toBe(401);
  // A request that sends a token is never read as a browser session, even with a good cookie.
  expect(
    (await app.inject({ url: "/api/projects", headers: { authorization: "Bearer orq_wrong", cookie } })).statusCode,
  ).toBe(401);
  expect((await as(`Bearer ${token}`, "POST", "/api/tokens", { name: "More" })).statusCode).toBe(403);
  expect(
    (
      await as(`Bearer ${token}`, "POST", "/api/account/password", {
        current: admin.password,
        password: "another long password",
      })
    ).statusCode,
  ).toBe(403);

  // Someone else cannot revoke it.
  const other = await person("Ed Editor");
  expect((await send("DELETE", `/api/tokens/${id}`, other.cookie)).statusCode).toBe(404);
  expect((await send("DELETE", `/api/tokens/${id}`, cookie)).statusCode).toBe(200);
  expect((await as(`Bearer ${token}`, "GET", "/api/projects")).statusCode).toBe(401);
  expect((await get("/api/tokens", cookie)).json().tokens).toEqual([]);
  expect(await auditActions()).toEqual(expect.arrayContaining(["token.create", "token.revoke"]));
});

/** A project with two requirements, two test cases, and "Verified by" from SYS-001 to both tests. SYS-002 has no test. */
async function projectWithTests() {
  const { cookie, detail, sys, add } = await projectWithSets();
  const { project, sets } = await detail();
  const ver = sets[2].id as string;
  const item = async (setId: string, name: string) => (await add(setId, { kind: "item", name })).json().node.id;
  const req = await item(sys.id, "Stops on occlusion");
  const bare = await item(sys.id, "No test yet");
  const t1 = await item(ver, "Occlusion test");
  const t2 = await item(ver, "Alarm test");
  const types = (await get(`/api/projects/${project.id}/links`, cookie)).json().linkTypes as {
    id: string;
    name: string;
  }[];
  const typeId = types.find((t) => t.name === "Verified by")?.id;
  for (const test of [t1, t2]) await post("/api/links", { upstreamId: req, downstreamId: test, typeId }, cookie);
  const status = async (as = cookie) => (await get(`/api/projects/${project.id}/verification`, as)).json();
  const record = (itemId: string, body: object, as = cookie) => post(`/api/items/${itemId}/results`, body, as);
  const revise = (itemId: string, baseRevision: number) =>
    post(
      `/api/items/${itemId}/revisions`,
      { baseRevision, name: `Changed ${baseRevision}`, description: textToDoc(""), attributes: {} },
      cookie,
    );
  return { cookie, projectId: project.id as string, req, bare, t1, t2, status, record, revise };
}

test("a requirement's verification status follows the results of its tests, and results go out of date", async () => {
  const { cookie, req, bare, t1, t2, status, record, revise } = await projectWithTests();
  expect((await status()).requirements).toMatchObject({
    [req]: { status: "not_run", outOfDate: false },
    [bare]: { status: "not_covered", outOfDate: false, tests: [] },
  });

  expect((await record(t1, { outcome: "pass" })).statusCode).toBe(201);
  expect((await status()).requirements[req].status).toBe("not_run");
  await record(t2, { outcome: "blocked" });
  expect((await status()).requirements[req].status).toBe("not_run");
  await record(t2, { outcome: "pass", note: " unblocked ", runAt: "2026-01-05T10:00:00Z" });
  expect((await status()).requirements[req]).toMatchObject({ status: "passing", outOfDate: false });
  await record(t1, { outcome: "fail" });
  const failing = await status();
  expect(failing.requirements[req]).toEqual({
    status: "failing",
    outOfDate: false,
    tests: [
      { itemId: t1, outcome: "fail", outOfDate: false },
      { itemId: t2, outcome: "pass", outOfDate: false },
    ],
  });
  expect(failing.tests[t1]).toMatchObject({ outcome: "fail", revision: 1, outOfDate: false });
  // Test cases themselves have no status.
  expect(failing.requirements[t1]).toBeUndefined();

  // A new version of the test case puts its result out of date, so the failure no longer counts.
  await revise(t1, 1);
  const stale = await status();
  expect(stale.requirements[req]).toMatchObject({ status: "not_run", outOfDate: true });
  expect(stale.tests[t1].outOfDate).toBe(true);
  // A result may be recorded against the older version that was really run, and stays out of date.
  expect((await record(t1, { outcome: "pass", revision: 1 })).statusCode).toBe(201);
  expect((await status()).requirements[req].status).toBe("not_run");
  await record(t1, { outcome: "pass" });
  expect((await status()).requirements[req]).toMatchObject({ status: "passing", outOfDate: false });

  // A new version of the requirement puts every earlier result out of date.
  await revise(req, 1);
  expect((await status()).requirements[req]).toMatchObject({ status: "not_run", outOfDate: true });

  const list = (await get(`/api/items/${t1}/results`, cookie)).json();
  expect(list.isTest).toBe(true);
  expect(
    list.results.map((r: { outcome: string; revision: number; outOfDate: boolean }) => [
      r.outcome,
      r.revision,
      r.outOfDate,
    ]),
  ).toEqual([
    ["pass", 2, false],
    ["pass", 1, true],
    ["fail", 1, true],
    ["pass", 1, true],
  ]);
  expect(list.results[0]).toMatchObject({ recordedBy: "Admin", source: "manual", note: "" });
  expect((await get(`/api/items/${t2}/results`, cookie)).json().results[0]).toMatchObject({
    note: "unblocked",
    runAt: "2026-01-05T10:00:00.000Z",
  });
  expect(await auditActions()).toEqual(expect.arrayContaining(["result.pass", "result.fail", "result.blocked"]));
});

test("a result is refused when it is not on a test case, names a missing version or evidence, or comes from a reviewer", async () => {
  const { projectId, req, t1, status, record } = await projectWithTests();
  const viewer = await person("Vera Viewer", "viewer");
  const reviewer = await person("Rob Reviewer", "reviewer");
  const editor = await person("Ed Editor", "editor");

  expect((await record(req, { outcome: "pass" })).statusCode).toBe(400);
  expect((await record(t1, { outcome: "maybe" })).statusCode).toBe(400);
  expect((await record(t1, { outcome: "pass", revision: 2 })).statusCode).toBe(400);
  expect((await record(t1, { outcome: "pass", runAt: "2999-01-01T00:00:00Z" })).statusCode).toBe(400);
  expect(
    (await record(t1, { outcome: "pass", attachmentIds: ["00000000-0000-4000-8000-000000000000"] })).statusCode,
  ).toBe(400);
  expect((await record(t1, { outcome: "pass" }, reviewer.cookie)).statusCode).toBe(403);
  expect((await record(t1, { outcome: "pass" }, editor.cookie)).statusCode).toBe(201);
  expect((await get(`/api/items/${t1}/results`, viewer.cookie)).json().results).toHaveLength(1);
  expect((await status(viewer.cookie)).tests[t1].outcome).toBe("pass");
  // Results cannot be changed or removed: there is no route for it.
  expect(app.apiRoutes.filter((r) => r.url.includes("results") && !["GET", "HEAD", "POST"].includes(r.method))).toEqual(
    [],
  );
  expect((await get(`/api/projects/${projectId}/verification`)).statusCode).toBe(401);
});

test("a JUnit report from CI records results on the test cases it names by UID", async () => {
  const { cookie, projectId, req, t1, t2, status } = await projectWithTests();
  const viewer = await person("Vera Viewer", "viewer");
  const token = (await post("/api/tokens", { name: "CI" }, cookie)).json().token;
  const upload = (payload: string, headers: Record<string, string>, contentType = "application/xml") =>
    app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/verification-results/junit`,
      payload,
      headers: { "content-type": contentType, ...headers },
    });
  const ci = { authorization: `Bearer ${token}` };
  const report = `<testsuite>
    <testcase classname="pump" name="test_ver_001_occlusion"/>
    <testcase classname="pump" name="VER-002 alarm"><failure message="no sound"/></testcase>
    <testcase classname="pump" name="SYS-001 is not a test case"/>
    <testcase classname="pump" name="unrelated"/>
  </testsuite>`;

  expect((await upload(report, { cookie: viewer.cookie })).statusCode).toBe(403);
  expect((await upload("<html/>", ci)).statusCode).toBe(400);
  expect((await upload("{}", ci, "application/json")).statusCode).toBe(400);
  const res = await upload(report, ci, "text/xml");
  expect(res.statusCode).toBe(201);
  expect(res.json()).toEqual({
    recorded: [
      { uid: "VER-001", outcome: "pass" },
      { uid: "VER-002", outcome: "fail" },
    ],
    unmatched: ["pump SYS-001 is not a test case", "pump unrelated"],
    unmatchedCount: 2,
  });

  expect((await status()).requirements[req]).toMatchObject({ status: "failing", outOfDate: false });
  expect((await get(`/api/items/${t2}/results`, cookie)).json().results).toEqual([
    expect.objectContaining({ outcome: "fail", note: "no sound", source: "junit", revision: 1, recordedBy: "Admin" }),
  ]);
  expect((await get(`/api/items/${t1}/results`, cookie)).json().results).toHaveLength(1);

  // Every result is audited; the activity stream shows one line for the whole report.
  expect(await auditActions()).toEqual(
    expect.arrayContaining(["junit.import", "junit.result.fail", "junit.result.pass"]),
  );
  const feed = (await get(`/api/projects/${projectId}/activity`, cookie)).json().events as { action: string }[];
  expect(feed.filter((e) => e.action.startsWith("junit")).map((e) => e.action)).toEqual(["junit.import"]);
});

test("a test case holds steps, which are checked, searched and kept per version", async () => {
  const { cookie, projectId, req, t1 } = await projectWithTests();
  const fields = (await get(`/api/items/${t1}`, cookie)).json().fields as { id: string; name: string; type: string }[];
  expect(fields.at(-1)).toMatchObject({ name: "Steps", type: "steps" });
  const stepsField = fields.at(-1)?.id as string;
  // Only test cases have the field.
  expect((await get(`/api/items/${req}`, cookie)).json().fields.some((f: { type: string }) => f.type === "steps")).toBe(
    false,
  );
  const save = (steps: unknown, baseRevision: number) =>
    post(
      `/api/items/${t1}/revisions`,
      { baseRevision, name: "Occlusion test", description: textToDoc(""), attributes: { [stepsField]: steps } },
      cookie,
    );
  const noAction = await save([{ action: " ", expected: "x" }], 1);
  expect(noAction.statusCode).toBe(400);
  expect(noAction.json().error).toBe("Steps has no action in step 1");
  expect((await save("Clamp the line", 1)).statusCode).toBe(400);
  expect((await save([{ action: "Clamp", expected: "Alarm", html: "<b>" }], 1)).statusCode).toBe(400);

  const steps = [
    { action: "Clamp the line", expected: "Pressure rises" },
    { action: "Wait 10 seconds", expected: "The pump stops" },
  ];
  expect((await save(steps, 1)).statusCode).toBe(201);
  expect((await get(`/api/items/${t1}`, cookie)).json().item.attributes[stepsField]).toEqual(steps);
  expect((await get(`/api/projects/${projectId}/search?q=clamp pump stops`, cookie)).json().ids).toEqual([t1]);
  // An empty list is no value at all, like every other empty field.
  expect((await save([], 2)).statusCode).toBe(201);
  const history = (await get(`/api/items/${t1}/revisions`, cookie)).json().revisions;
  expect(history.map((r: { attributes: Record<string, unknown> }) => r.attributes[stepsField])).toEqual([
    undefined,
    steps,
    undefined,
  ]);
});

test("a test plan is run as a cycle: runs are assigned, executed step by step and record verification results", async () => {
  const { cookie: owner, projectId, req, t1, t2, status } = await projectWithTests();
  const viewer = await person("Vera Viewer", "viewer");
  const tester = await person("Tess Tester", "reviewer");
  const stepsField = (await get(`/api/items/${t1}`, owner)).json().fields.at(-1).id;
  const steps = [
    { action: "Clamp the line", expected: "Pressure rises" },
    { action: "Wait 10 seconds", expected: "The pump stops" },
  ];
  const edit = (baseRevision: number, description = "Bench") =>
    post(
      `/api/items/${t1}/revisions`,
      {
        baseRevision,
        name: "Occlusion test",
        description: textToDoc(description),
        attributes: { [stepsField]: steps },
      },
      owner,
    );
  expect((await edit(1)).statusCode).toBe(201);

  // Plans: an editor makes and fills them, everyone in the project reads them.
  const plans = `/api/projects/${projectId}/test-plans`;
  expect((await post(plans, { name: "Release 1.2" }, tester.cookie)).statusCode).toBe(403);
  expect((await post(plans, { name: "  " }, owner)).statusCode).toBe(400);
  const planId = (await post(plans, { name: " Release 1.2 " }, owner)).json().id;
  const plan = `/api/test-plans/${planId}`;
  expect((await send("PATCH", plan, owner, { name: "Release 1.2 verification" })).statusCode).toBe(200);
  expect((await post(`${plan}/cases`, { itemIds: [t1] }, tester.cookie)).statusCode).toBe(403);
  // A requirement is not a test case.
  expect((await post(`${plan}/cases`, { itemIds: [t1, req] }, owner)).statusCode).toBe(400);
  expect((await post(`${plan}/cases`, { itemIds: [t1, t2], group: "Smoke" }, owner)).json()).toEqual({
    added: 2,
    skipped: 0,
  });
  expect((await post(`${plan}/cases`, { itemIds: [t1] }, owner)).json()).toEqual({ added: 0, skipped: 1 });
  expect((await send("PATCH", `${plan}/cases`, owner, { itemIds: [t2], group: "Alarms" })).json()).toEqual({
    grouped: 1,
  });
  expect((await get(plan, viewer.cookie)).json()).toMatchObject({
    plan: { name: "Release 1.2 verification", author: "Admin" },
    cases: [
      { itemId: t1, group: "Smoke" },
      { itemId: t2, group: "Alarms" },
    ],
    cycles: [],
  });
  expect((await get(plans, viewer.cookie)).json().plans).toEqual([
    expect.objectContaining({ id: planId, cases: 2, cycles: 0, openCycles: 0 }),
  ]);

  // Cycles: starting one makes a run per test case, frozen at its current version.
  const start = (body: object, as = owner) => post(`${plan}/cycles`, body, as);
  expect((await start({ name: "Round 1" }, tester.cookie)).statusCode).toBe(403);
  expect((await start({ name: "Retest", scope: "failed" })).statusCode).toBe(400);
  expect((await start({ name: "Nothing", scope: "group", group: "No such group" })).statusCode).toBe(400);
  const first = await start({ name: "Round 1", environment: "Bench 2" });
  expect(first.statusCode).toBe(201);
  expect(first.json().runs).toBe(2);
  const cycle = `/api/test-cycles/${first.json().id}`;
  const shown = (await get(cycle, viewer.cookie)).json();
  expect(shown.cycle).toMatchObject({ name: "Round 1", environment: "Bench 2", plan: "Release 1.2 verification" });
  expect(shown.runs).toEqual([
    expect.objectContaining({ uid: "VER-001", revision: 2, group: "Smoke", state: "not_started", done: 0, total: 2 }),
    // A test case without steps is run as one step.
    expect.objectContaining({ uid: "VER-002", revision: 1, group: "Alarms", state: "not_started", done: 0, total: 1 }),
  ]);
  const [run1, run2] = shown.runs.map((r: { id: string }) => r.id) as [string, string];

  // Assigning: an editor assigns, to people who can execute.
  const assign = (body: object, as = owner) => post(`${cycle}/assign`, body, as);
  expect((await assign({ runIds: [run1], assigneeId: tester.id }, tester.cookie)).statusCode).toBe(403);
  expect((await assign({ runIds: [run1], assigneeId: viewer.id })).statusCode).toBe(400);
  expect((await assign({ runIds: [run1, planId], assigneeId: tester.id })).statusCode).toBe(400);
  expect((await assign({ runIds: [run1], assigneeId: tester.id })).json()).toEqual({ assigned: 1 });
  expect((await get("/api/test-runs/mine", tester.cookie)).json().runs).toEqual([
    expect.objectContaining({ id: run1, project: "P", cycle: "Round 1", uid: "VER-001", state: "not_started" }),
  ]);
  expect((await get("/api/test-runs/mine", owner)).json().runs).toEqual([]);

  // Executing: a reviewer executes their own runs, an editor any run, a viewer none.
  const step = (runId: string, body: object, as: string) => post(`/api/test-runs/${runId}/steps`, body, as);
  const finish = (runId: string, body: object, as: string) => post(`/api/test-runs/${runId}/finish`, body, as);
  expect((await step(run1, { steps: [1], outcome: "pass" }, viewer.cookie)).statusCode).toBe(403);
  expect((await step(run2, { steps: [1], outcome: "pass" }, tester.cookie)).statusCode).toBe(403);
  expect((await finish(run2, {}, tester.cookie)).statusCode).toBe(403);
  expect((await step(run1, { steps: [3], outcome: "pass" }, tester.cookie)).statusCode).toBe(400);
  expect((await step(run1, { steps: [1], outcome: "pass" }, tester.cookie)).json()).toEqual({ state: "in_progress" });
  const early = await finish(run1, {}, tester.cookie);
  expect(early.statusCode).toBe(400);
  expect(early.json().error).toContain("1 of 2");

  // The test case is edited while the cycle runs: the run keeps the version it froze.
  expect((await edit(2, "Bench, with the new clamp")).statusCode).toBe(201);
  // A step is corrected by recording it again: the latest result counts.
  expect((await step(run1, { steps: [2], outcome: "pass" }, tester.cookie)).json()).toEqual({ state: "passed" });
  expect((await step(run1, { steps: [2], outcome: "fail", actual: " Still running " }, tester.cookie)).json()).toEqual({
    state: "failed",
  });
  expect((await finish(run1, { defectUrl: "javascript:alert(1)" }, tester.cookie)).statusCode).toBe(400);
  const defectUrl = "https://tracker.example/BUG-1";
  expect((await finish(run1, { note: "See defect", defectUrl }, tester.cookie)).json()).toEqual({ outcome: "fail" });
  expect((await finish(run1, {}, tester.cookie)).statusCode).toBe(409);
  expect((await step(run1, { steps: [1], outcome: "pass" }, tester.cookie)).statusCode).toBe(409);

  const executed = (await get(`/api/test-runs/${run1}`, tester.cookie)).json();
  expect(executed).toMatchObject({
    run: {
      uid: "VER-001",
      name: "Occlusion test",
      revision: 2,
      state: "failed",
      finished: true,
      assignee: "Tess Tester",
      result: { outcome: "fail", note: "See defect", defectUrl, by: "Tess Tester" },
    },
    cycle: { name: "Round 1", environment: "Bench 2", closedAt: null },
    nextRunId: null,
    canExecute: false,
  });
  expect(executed.run.steps).toEqual([
    expect.objectContaining({ ...steps[0], outcome: "pass", actual: "", by: "Tess Tester" }),
    expect.objectContaining({ ...steps[1], outcome: "fail", actual: "Still running" }),
  ]);
  // The run recorded an ordinary result, at the frozen version: out of date, because the test case has moved on.
  expect((await get(`/api/items/${t1}/results`, owner)).json().results).toEqual([
    expect.objectContaining({ outcome: "fail", revision: 2, source: "run", runId: run1, defectUrl, outOfDate: true }),
  ]);
  expect((await status()).requirements[req]).toMatchObject({ status: "not_run", outOfDate: true });
  expect((await get("/api/test-runs/mine", tester.cookie)).json().runs).toEqual([]);

  // An editor executes the unassigned run. "Next run" offers the same person's other open run.
  expect((await get(`/api/test-runs/${run2}`, owner)).json()).toMatchObject({ nextRunId: null, canExecute: true });
  expect((await step(run2, { steps: [1], outcome: "pass" }, owner)).json()).toEqual({ state: "passed" });
  expect((await finish(run2, {}, owner)).json()).toEqual({ outcome: "pass" });
  expect((await get(plan, owner)).json().cycles).toEqual([
    expect.objectContaining({
      name: "Round 1",
      runs: { not_started: 0, in_progress: 0, passed: 1, failed: 1, blocked: 0 },
    }),
  ]);

  // A retest cycle takes only what failed or was blocked, at the version current now.
  const retest = await start({ name: "Retest", scope: "failed" });
  expect(retest.json().runs).toBe(1);
  const retestCycle = `/api/test-cycles/${retest.json().id}`;
  const [again] = (await get(retestCycle, owner)).json().runs;
  expect(again).toMatchObject({ uid: "VER-001", revision: 3, state: "not_started" });
  // A JUnit report from CI fills the open runs of the cycle it names.
  const junit = (cycleId: string) =>
    app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/verification-results/junit?testCycleId=${cycleId}`,
      payload: `<testsuite><testcase name="test_ver_001"/><testcase name="test_ver_002"/></testsuite>`,
      headers: { cookie: owner, "content-type": "application/xml" },
    });
  expect((await junit(planId)).statusCode).toBe(400);
  expect((await junit(retest.json().id)).json().recorded).toEqual([
    { uid: "VER-001", outcome: "pass", run: true },
    { uid: "VER-002", outcome: "pass" },
  ]);
  expect((await get(retestCycle, owner)).json().runs).toEqual([
    expect.objectContaining({ id: again.id, state: "passed", finished: true }),
  ]);
  expect((await status()).requirements[req]).toMatchObject({ status: "passing", outOfDate: false });

  // One group only. Closing is permanent and stops every write to the cycle.
  const alarms = await start({ name: "Alarms only", scope: "group", group: "Alarms" });
  expect(alarms.json().runs).toBe(1);
  const alarmsCycle = `/api/test-cycles/${alarms.json().id}`;
  const [open] = (await get(alarmsCycle, owner)).json().runs;
  expect(open).toMatchObject({ uid: "VER-002", group: "Alarms" });
  expect((await post(`${alarmsCycle}/close`, {}, tester.cookie)).statusCode).toBe(403);
  expect((await post(`${alarmsCycle}/close`, {}, owner)).statusCode).toBe(200);
  expect((await post(`${alarmsCycle}/close`, {}, owner)).statusCode).toBe(409);
  expect((await step(open.id, { steps: [1], outcome: "pass" }, owner)).statusCode).toBe(409);
  expect((await post(`${alarmsCycle}/assign`, { runIds: [open.id], assigneeId: null }, owner)).statusCode).toBe(409);
  expect((await junit(alarms.json().id)).statusCode).toBe(409);
  expect((await get(alarmsCycle, viewer.cookie)).json().cycle).toMatchObject({ closedBy: "Admin" });

  // A test case taken out of the plan is not in the next cycle; a deleted plan leaves the list but keeps its cycles.
  expect((await post(`${plan}/cases/remove`, { itemIds: [t2] }, owner)).json()).toEqual({ removed: 1 });
  expect((await start({ name: "Round 2" })).json().runs).toBe(1);
  expect((await send("DELETE", plan, tester.cookie)).statusCode).toBe(403);
  expect((await send("DELETE", plan, owner)).statusCode).toBe(200);
  expect((await get(plans, owner)).json().plans).toEqual([]);
  expect((await get(plan, owner)).statusCode).toBe(404);
  expect((await start({ name: "Round 3" })).statusCode).toBe(404);
  expect((await get(cycle, owner)).statusCode).toBe(200);

  expect(await auditActions()).toEqual(
    expect.arrayContaining([
      "plan.create",
      "plan.rename",
      "plan.cases.add",
      "plan.cases.group",
      "plan.cases.remove",
      "plan.delete",
      "cycle.create",
      "cycle.close",
      "run.assign",
      "run.step.pass",
      "run.step.fail",
      "run.finish.fail",
      "run.finish.pass",
    ]),
  );
  // Single steps stay out of the activity stream: the finished run says it in one line.
  const activity = (await get(`/api/projects/${projectId}/activity`, owner)).json().events as { action: string }[];
  expect(activity.some((e) => e.action === "run.finish.fail")).toBe(true);
  expect(activity.some((e) => e.action.startsWith("run.step."))).toBe(false);
});

test("a review of a baseline is commented, marked, signed and closed; approval sets Status with no side effects", async () => {
  const { cookie: owner, detail, un, sys, add } = await projectWithSets();
  const project = await detail();
  const projectId = project.project.id;
  const ver = project.sets[2].id;
  const need = (await add(un.id, { kind: "item", name: "Need" })).json().node.id;
  const req = (await add(sys.id, { kind: "item", name: "Supply voltage" })).json().node.id;
  const tc = (await add(ver, { kind: "item", name: "Measure supply" })).json().node.id;
  const { linkTypes } = (await get(`/api/projects/${projectId}/links`, owner)).json();
  const verifiedBy = linkTypes.find((t: { name: string }) => t.name === "Verified by").id;
  await post("/api/links", { upstreamId: need, downstreamId: req, typeId: linkTypes[0].id }, owner);
  await post("/api/links", { upstreamId: req, downstreamId: tc, typeId: verifiedBy }, owner);
  await post(`/api/items/${tc}/results`, { outcome: "pass" }, owner);
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "1.0" }, owner)).json().id;
  const empty = (await post(`/api/projects/${projectId}/baselines`, { name: "Empty" }, owner)).json().id;
  // The need changes after the baseline: what the review approves is no longer its current text.
  await post(
    `/api/items/${need}/revisions`,
    { baseRevision: 1, name: "Need, reworded", description: textToDoc(""), attributes: {} },
    owner,
  );
  await db.execute(sql`delete from baseline_entries where baseline_id = ${empty}`);

  const ownerId = (await get("/api/session", owner)).json().user.id;
  const rob = await person("Rob Reviewer", "reviewer");
  const ann = await person("Ann Approver", "reviewer");
  const vera = await person("Vera Viewer", "viewer");
  const create = (body: object, as = owner) => post(`/api/projects/${projectId}/reviews`, body, as);
  const wanted = { name: " Design review ", baselineId, reviewers: [rob.id], approvers: [ann.id, ownerId, rob.id] };

  expect((await create(wanted, rob.cookie)).statusCode, "creating needs the editor role").toBe(403);
  expect((await create({ name: "X", baselineId })).statusCode, "nobody to review").toBe(400);
  expect((await create({ name: "X", baselineId, reviewers: [vera.id] })).statusCode, "a viewer cannot review").toBe(
    400,
  );
  expect((await create({ name: "X", baselineId: empty, reviewers: [rob.id] })).statusCode, "no items").toBe(400);
  // Rob is named twice; he is an approver. This review is only here to be closed undecided.
  const undecided = (await create(wanted)).json().id;
  const created = await create({ ...wanted, approvers: [ann.id, ownerId] });
  expect(created.statusCode).toBe(201);
  const reviewId = created.json().id;
  const read = async (as = owner) => (await get(`/api/reviews/${reviewId}`, as)).json();
  const mark = (as: string, itemIds: string[], value: string) =>
    post(`/api/reviews/${reviewId}/marks`, { itemIds, mark: value }, as);
  const sign = (as: string, password = admin.password) => post(`/api/reviews/${reviewId}/sign`, { password }, as);
  const all = [need, req, tc];

  expect((await read(vera.cookie)).review).toMatchObject({ name: "Design review", state: "open", baseline: "1.0" });
  expect((await read()).participants.map((p: { name: string; role: string }) => [p.name, p.role])).toEqual([
    ["Admin", "approver"],
    ["Ann Approver", "approver"],
    ["Rob Reviewer", "reviewer"],
  ]);

  // A reviewer comments and marks items reviewed, and cannot decide. A viewer and a non-participant cannot mark.
  const comment = await post(`/api/items/${req}/comments`, { body: "Unit missing", reviewId }, rob.cookie);
  expect(comment.statusCode).toBe(201);
  expect((await post(`/api/items/${req}/comments`, { body: "x", reviewId: undecided }, vera.cookie)).statusCode).toBe(
    403,
  );
  expect((await mark(rob.cookie, [req], "reviewed")).json()).toEqual({ marked: 1 });
  expect((await mark(rob.cookie, [req], "approved")).statusCode).toBe(403);
  expect((await mark(vera.cookie, [req], "reviewed")).statusCode).toBe(403);
  expect((await mark(rob.cookie, [empty], "reviewed")).statusCode, "not an item of the review").toBe(400);
  expect((await sign(rob.cookie)).statusCode, "a reviewer cannot sign").toBe(403);
  expect((await get(`/api/items/${req}/comments`, owner)).json().comments).toEqual([
    expect.objectContaining({ body: "Unit missing", reviewId, review: "Design review" }),
  ]);

  // An approver decides every item, then signs once with their password. After that their decisions are final.
  await mark(ann.cookie, [need, req], "approved");
  expect((await sign(ann.cookie)).json().error).toContain("1 of 3 have no decision");
  await mark(ann.cookie, [tc], "rejected");
  await mark(ann.cookie, [tc], "approved");
  expect((await sign(ann.cookie, "not my password")).statusCode).toBe(400);
  const signed = await sign(ann.cookie);
  expect(signed.statusCode).toBe(201);
  expect(signed.json().meaning).toBe("approval");
  expect((await mark(ann.cookie, [tc], "rejected")).statusCode).toBe(409);
  expect((await sign(ann.cookie)).statusCode).toBe(409);
  // An access token is not the person.
  const { token } = (await post("/api/tokens", { name: "CI" }, owner)).json();
  const byToken = await app.inject({
    method: "POST",
    url: `/api/reviews/${reviewId}/sign`,
    payload: { password: admin.password },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(byToken.statusCode).toBe(403);

  // One approver has not decided yet, so nothing is approved.
  expect((await read()).outcomes).toEqual({ [need]: "undecided", [req]: "undecided", [tc]: "undecided" });
  await mark(owner, all, "approved");
  expect((await sign(owner)).statusCode).toBe(201);
  const open = await read();
  expect(open.outcomes).toEqual({ [need]: "approved", [req]: "approved", [tc]: "approved" });
  expect(open.comments).toEqual([
    expect.objectContaining({ itemId: req, body: "Unit missing", author: "Rob Reviewer" }),
  ]);
  expect(open.participants.map((p: { signature?: { valid: boolean } }) => p.signature?.valid)).toEqual([
    true,
    true,
    undefined,
  ]);

  // Closing works the state out and, when asked, sets Status on every item that is still what was reviewed.
  expect((await post(`/api/reviews/${reviewId}/close`, { setStatus: true }, rob.cookie)).statusCode).toBe(403);
  const closing = await post(`/api/reviews/${reviewId}/close`, { setStatus: true }, owner);
  expect(closing.json()).toEqual({ state: "approved", updated: 2, skipped: ["UN-001"] });
  const after = await read();
  expect(after.review).toMatchObject({ state: "approved", closedBy: "Admin", statusSet: true });
  const { item, fields } = (await get(`/api/items/${req}`, owner)).json();
  const status = fields.find((f: { name: string }) => f.name === "Status").id;
  expect(item).toMatchObject({ revision: 2, name: "Supply voltage", attributes: { [status]: "Approved" } });
  const [latest] = (await get(`/api/items/${req}/revisions`, owner)).json().revisions;
  expect(latest).toMatchObject({ number: 2, changeReason: 'Approved in review "Design review"', author: "Admin" });
  expect((await get(`/api/items/${need}`, owner)).json().item.revision, "the reworded need is left alone").toBe(2);
  expect((await get(`/api/projects/${projectId}/search?q=Approved`, owner)).json().ids.sort()).toEqual(
    [req, tc].sort(),
  );

  // The approval is a new version of the requirement and of the test, yet nothing went suspect or out of date because of it.
  const links = async () => (await get(`/api/projects/${projectId}/links`, owner)).json().links;
  expect((await links()).map((l: { changed: object }) => l.changed)).toEqual([
    { upstream: true, downstream: false },
    { upstream: false, downstream: false },
  ]);
  const verification = async () => (await get(`/api/projects/${projectId}/verification`, owner)).json();
  expect((await verification()).requirements[req]).toMatchObject({ status: "passing", outOfDate: false });
  expect((await verification()).tests[tc]).toMatchObject({ outcome: "pass", outOfDate: false });
  // The same holds for a Status change made by hand, and a result can be recorded against the newest version.
  const revise = (name: string, value: string, baseRevision: number) =>
    post(
      `/api/items/${req}/revisions`,
      { baseRevision, name, description: textToDoc(""), attributes: { [status]: value } },
      owner,
    );
  expect((await revise("Supply voltage", "In review", 2)).statusCode).toBe(201);
  expect((await links())[1].changed).toEqual({ upstream: false, downstream: false });
  expect((await verification()).requirements[req]).toMatchObject({ status: "passing", outOfDate: false });
  expect((await post(`/api/items/${tc}/results`, { outcome: "pass", revision: 2 }, owner)).statusCode).toBe(201);
  // A change of content still does both.
  await revise("Supply voltage, 5 V", "In review", 3);
  expect((await links())[1].changed).toEqual({ upstream: true, downstream: false });
  expect((await verification()).requirements[req]).toMatchObject({ status: "not_run", outOfDate: true });

  // A closed review is permanent: no marks, comments, deletions or second closing.
  expect((await mark(rob.cookie, [req], "cleared")).statusCode).toBe(409);
  expect((await post(`/api/items/${req}/comments`, { body: "Late", reviewId }, rob.cookie)).statusCode).toBe(409);
  expect((await send("DELETE", `/api/comments/${comment.json().id}`, rob.cookie)).statusCode).toBe(409);
  expect((await post(`/api/reviews/${reviewId}/close`, {}, owner)).statusCode).toBe(409);
  // Closed before every approver signed: no decision, and nothing is written to the items.
  await post(`/api/reviews/${undecided}/marks`, { itemIds: all, mark: "approved" }, ann.cookie);
  await post(`/api/reviews/${undecided}/sign`, { password: admin.password }, ann.cookie);
  expect((await post(`/api/reviews/${undecided}/close`, { setStatus: true }, owner)).json()).toEqual({
    state: "closed",
    updated: 0,
    skipped: [],
  });

  const list = (await get(`/api/projects/${projectId}/reviews`, ann.cookie)).json().reviews;
  expect(list.map((r: { state: string; myRole: string }) => [r.state, r.myRole]).sort()).toEqual([
    ["approved", "approver"],
    ["closed", "approver"],
  ]);
  expect(await auditActions()).toEqual(
    expect.arrayContaining([
      "review.create",
      "review.mark.reviewed",
      "review.sign.failed",
      "review.sign.approval",
      "review.close.approved",
      "review.close.closed",
      "review.item.approve",
    ]),
  );
  // The activity stream shows the review's own events, not every mark or every item it updated.
  const stream = (await get(`/api/projects/${projectId}/activity`, owner))
    .json()
    .events.map((e: { action: string }) => e.action);
  expect(stream).toContain("review.close.approved");
  expect(stream.filter((a: string) => a.startsWith("review.mark") || a.startsWith("review.item"))).toEqual([]);

  // A signature is tied to what was signed: altering a signed decision afterwards shows.
  await db.execute(sql`update review_marks set mark = 'rejected' where review_id = ${reviewId} and item_id = ${tc}`);
  expect((await read()).participants.map((p: { signature?: { valid: boolean } }) => p.signature?.valid)).toEqual([
    false,
    false,
    undefined,
  ]);
});

test("one rejected item rejects the review, and a rejected review writes nothing to its items", async () => {
  const { cookie: owner, detail, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const good = (await add(sys.id, { kind: "item", name: "Good" })).json().node.id;
  const bad = (await add(sys.id, { kind: "item", name: "Bad" })).json().node.id;
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "1.0", setId: sys.id }, owner)).json()
    .id;
  const ownerId = (await get("/api/session", owner)).json().user.id;
  const reviewId = (
    await post(`/api/projects/${projectId}/reviews`, { name: "R", baselineId, approvers: [ownerId] }, owner)
  ).json().id;

  await post(`/api/reviews/${reviewId}/marks`, { itemIds: [good], mark: "approved" }, owner);
  await post(`/api/reviews/${reviewId}/marks`, { itemIds: [bad], mark: "rejected" }, owner);
  const signed = await post(`/api/reviews/${reviewId}/sign`, { password: admin.password }, owner);
  expect(signed.json().meaning).toBe("rejection");
  expect((await post(`/api/reviews/${reviewId}/close`, { setStatus: true }, owner)).json()).toEqual({
    state: "rejected",
    updated: 0,
    skipped: [],
  });
  const review = (await get(`/api/reviews/${reviewId}`, owner)).json();
  expect(review.outcomes).toEqual({ [good]: "approved", [bad]: "rejected" });
  expect(review.review.statusSet).toBe(false);
  expect((await get(`/api/items/${good}`, owner)).json().item.revision).toBe(1);
});

test("a structured import creates folders, items and relationships with one audit event per set, or nothing", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  await add(sys.id, { kind: "item", name: "Existing" });
  const fields = (await get(`/api/sets/${sys.id}/items`, cookie)).json().fields as { id: string; name: string }[];
  const status = fields.find((f) => f.name === "Status")?.id as string;
  const typeId = (await get(`/api/projects/${projectId}/links`, cookie)).json().linkTypes[1].id;
  const run = (body: object, as = cookie) => post(`/api/projects/${projectId}/import`, body, as);
  const body = {
    sets: [
      {
        setId: sys.id,
        nodes: [
          {
            kind: "folder",
            name: " Power ",
            children: [
              {
                ref: "a",
                kind: "item",
                name: "Supply",
                description: textToDoc("12 V"),
                attributes: { [status]: "Draft" },
              },
              { kind: "folder", name: "Inner", children: [{ ref: "b", kind: "item", name: "Deep" }] },
            ],
          },
          { kind: "item", name: "Loose" },
        ],
      },
      { setId: un.id, nodes: [{ ref: "n", kind: "item", name: "Need" }] },
    ],
    links: [
      { typeId, upstream: "n", downstream: "a" },
      { typeId, upstream: "a", downstream: "b" },
    ],
  };

  const before = (await auditActions()).length;
  const item = { kind: "item", name: "X" };
  const bad: [object, string][] = [
    [{ sets: [{ setId: sys.id, nodes: [{ ...item, attributes: { [status]: "Nope" } }] }] }, "Status must be"],
    [{ sets: [{ setId: sys.id, nodes: [{ ...item, children: [item] }] }] }, "cannot hold other items"],
    [
      { sets: [{ setId: sys.id, nodes: [{ ...item, description: { type: "doc", content: [{ type: "script" }] } }] }] },
      "Unsupported",
    ],
    [
      {
        sets: [
          {
            setId: sys.id,
            nodes: [
              { ...item, ref: "x" },
              { ...item, ref: "x" },
            ],
          },
        ],
      },
      "used twice",
    ],
    [{ sets: [{ setId: sys.id, nodes: [{ kind: "folder", name: "F", ref: "x" }] }] }, "only a name"],
    [
      {
        sets: [
          { setId: sys.id, nodes: [item] },
          { setId: sys.id, nodes: [item] },
        ],
      },
      "listed twice",
    ],
    [{ sets: [{ setId: "00000000-0000-4000-8000-000000000000", nodes: [item] }] }, "Set not found"],
    [{ sets: [{ setId: sys.id, parentId: "00000000-0000-4000-8000-000000000000", nodes: [item] }] }, "Parent must be"],
    [{ ...body, links: [{ typeId, upstream: "n", downstream: "missing" }] }, "not in this import"],
    [{ ...body, links: [{ typeId: sys.id, upstream: "n", downstream: "a" }] }, "Unknown relationship type"],
    [{ ...body, links: [...body.links, { typeId, upstream: "a", downstream: "n" }] }, "linked once"],
    [{ sets: [{ setId: sys.id, nodes: [{ kind: "item", name: " " }] }] }, "pattern"],
  ];
  for (const [payload, message] of bad) {
    const res = await run(payload);
    expect(res.statusCode, message).toBe(400);
    expect(JSON.stringify(res.json()), message).toContain(message);
  }
  expect((await detail()).nodes).toHaveLength(1);
  expect((await auditActions()).length).toBe(before);
  expect((await run(body, (await person("Vera Viewer", "viewer")).cookie)).statusCode).toBe(403);

  const res = await run(body);
  expect(res.statusCode).toBe(201);
  expect(res.json()).toEqual({ created: { items: 4, folders: 2, links: 2 } });
  const tree = (await detail()).nodes as { id: string; parentId: string | null; name: string; uid: string | null }[];
  const named = (name: string) => tree.find((n) => n.name === name);
  // UIDs follow the order of the file and continue after what the set already held.
  expect(
    tree
      .filter((n) => n.uid)
      .map((n) => `${n.uid} ${n.name}`)
      .sort(),
  ).toEqual(["SYS-001 Existing", "SYS-002 Supply", "SYS-003 Deep", "SYS-004 Loose", "UN-001 Need"]);
  expect(named("Supply")?.parentId).toBe(named("Power")?.id);
  expect(named("Deep")?.parentId).toBe(named("Inner")?.id);
  expect(named("Inner")?.parentId).toBe(named("Power")?.id);
  expect(named("Loose")?.parentId).toBeNull();
  const supply = (await get(`/api/items/${named("Supply")?.id}`, cookie)).json().item;
  expect(supply).toMatchObject({ revision: 1, description: textToDoc("12 V"), attributes: { [status]: "Draft" } });
  const made = (await get(`/api/projects/${projectId}/links`, cookie)).json().links;
  expect(made).toHaveLength(2);
  expect(made[0]).toMatchObject({
    upstreamId: named("Need")?.id,
    downstreamId: named("Supply")?.id,
    changed: { upstream: false, downstream: false },
  });
  expect((await get(`/api/projects/${projectId}/search?q=12`, cookie)).json().ids).toEqual([named("Supply")?.id]);

  const events = (await db.select().from(auditEvents)).filter((e) => e.action.endsWith(".import"));
  expect(events.map((e) => [e.action, e.data?.label]).sort()).toEqual([
    ["item.import", "1 item into User Needs"],
    ["item.import", "3 items and 2 folders into System Requirements"],
    ["link.import", "2 relationships"],
  ]);
  expect(events.every((e) => e.projectId === projectId)).toBe(true);
});

test("a baseline exports to ReqIF and imports into another project as the same content, images included", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const projectId = (await detail()).project.id;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("picture")]);
  const upload = async (project: string, payload: Buffer | Uint8Array) =>
    (
      await app.inject({
        method: "POST",
        url: `/api/projects/${project}/attachments`,
        payload: Buffer.from(payload),
        headers: { cookie, "content-type": "image/png" },
      })
    ).json().src as string;
  const fieldsOf = async (setId: string) =>
    (await get(`/api/sets/${setId}/items`, cookie)).json().fields as {
      id: string;
      name: string;
      type: string;
      options: string[] | null;
    }[];
  const sysFields = await fieldsOf(sys.id);
  const field = (name: string) => sysFields.find((f) => f.name === name)?.id as string;
  const description = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The pump " },
          { type: "text", text: "shall", marks: [{ type: "bold" }] },
          { type: "text", text: ' run at 5 < 6 & "quietly".' },
        ],
      },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "cell" }] }] },
            ],
          },
        ],
      },
      { type: "image", attrs: { src: await upload(projectId, png), alt: "Diagram" } },
      { type: "paragraph", content: [{ type: "inlineMath", attrs: { latex: "V = I \\cdot R" } }] },
    ],
  };
  const save = (itemId: string, name: string, more: object) =>
    post(
      `/api/items/${itemId}/revisions`,
      { baseRevision: 1, name, description: textToDoc(""), attributes: {}, ...more },
      cookie,
    );

  const doomed = (await add(sys.id, { kind: "item", name: "Deleted before export" })).json().node.id;
  const folder = (await add(sys.id, { kind: "folder", name: "Power" })).json().node.id;
  const supply = (await add(sys.id, { kind: "item", name: "Supply voltage", parentId: folder })).json().node.id;
  const current = (await add(sys.id, { kind: "item", name: "Max current" })).json().node.id;
  const need = (await add(un.id, { kind: "item", name: "Portable" })).json().node.id;
  expect(
    (
      await save(supply, "Supply voltage", {
        description,
        attributes: { [field("Status")]: "Approved", [field("Rationale")]: "Because" },
      })
    ).statusCode,
  ).toBe(201);
  expect((await send("DELETE", `/api/nodes/${doomed}`, cookie)).statusCode).toBe(200);
  const linkTypes = (await get(`/api/projects/${projectId}/links`, cookie)).json().linkTypes as {
    id: string;
    name: string;
  }[];
  const derived = linkTypes.find((t) => t.name === "Derived from")?.id;
  await post("/api/links", { upstreamId: need, downstreamId: supply, typeId: derived }, cookie);
  await post("/api/links", { upstreamId: supply, downstreamId: current, typeId: linkTypes[0]?.id }, cookie);
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "Design review 1.0" }, cookie)).json()
    .id;
  // Changed after the baseline: the export must not show it.
  await save(current, "Changed later", { baseRevision: 1 });

  const exported = await get(`/api/baselines/${baselineId}/reqif?format=reqifz`, cookie);
  expect(exported.statusCode).toBe(200);
  expect(exported.headers["content-type"]).toBe("application/zip");
  expect(exported.headers["content-disposition"]).toBe('attachment; filename="Design_review_1.0.reqifz"');
  const archive = await unzip(exported.rawPayload);
  const xml = new TextDecoder().decode(archive.get("Design_review_1.0.reqif"));
  expect(xml).toContain("Max current");
  expect(xml).not.toContain("Changed later");
  expect(xml).not.toContain("Deleted before export");
  const pictures = [...archive.keys()].filter((name) => name.startsWith("files/"));
  expect(pictures).toHaveLength(1);
  expect(Buffer.from(archive.get(pictures[0] as string) as Uint8Array).equals(png)).toBe(true);

  // The plain file is the same text without the archive. A set exports its live items and the relationships inside it.
  const plain = await get(`/api/baselines/${baselineId}/reqif`, cookie);
  expect(plain.headers["content-type"]).toBe("application/xml");
  expect(parseReqif(plain.body).objects).toHaveLength(parseReqif(xml).objects.length);
  const ofSet = parseReqif((await get(`/api/sets/${sys.id}/reqif`, cookie)).body);
  expect(ofSet.specifications.map((s) => s.name)).toEqual(["System Requirements"]);
  expect(ofSet.objects.map((o) => o.name).sort()).toEqual(["Power", "SYS-002", "SYS-003"]);
  expect(ofSet.relations).toHaveLength(1);
  expect((await get(`/api/sets/${sys.id}/reqif?format=pdf`, cookie)).statusCode).toBe(400);
  expect((await get(`/api/sets/${sys.id}/reqif`, (await person("Vera Viewer", "viewer")).cookie)).statusCode).toBe(200);

  // Import into a second project, as the web app does: summarise, guess the mapping by name, upload images, post.
  const second = (await post("/api/projects", { name: "Copy", templateId: "standard" }, cookie)).json().project.id;
  const copy = async () => (await get(`/api/projects/${second}`, cookie)).json();
  const targets = await Promise.all(
    ((await copy()).sets as { id: string; name: string }[]).map(async (s) => ({ ...s, fields: await fieldsOf(s.id) })),
  );
  const file = parseReqif(xml);
  const summary = summarizeReqif(file);
  const mapping = guessReqifMapping(
    summary,
    targets,
    (await get(`/api/projects/${second}/links`, cookie)).json().linkTypes,
  );
  const uploaded = new Map<string, string>();
  for (const name of pictures) uploaded.set(name, await upload(second, archive.get(name) as Uint8Array));
  const mapped = mapReqif(file, mapping, targets, (data) => uploaded.get(data) ?? null);
  expect(mapped.warnings).toEqual([]);
  const imported = await post(`/api/projects/${second}/import`, mapped.body, cookie);
  expect(imported.json()).toEqual({ created: { items: 3, folders: 1, links: 2 } });

  const secondBaseline = (await post(`/api/projects/${second}/baselines`, { name: "Design review 1.0" }, cookie)).json()
    .id;
  const again = await unzip((await get(`/api/baselines/${secondBaseline}/reqif?format=reqifz`, cookie)).rawPayload);
  const xmlAgain = new TextDecoder().decode(again.get("Design_review_1.0.reqif"));

  /** A file's content without what differs between two projects: ids, UIDs, image file names and times. */
  const shape = (text: string) => {
    const reqif = parseReqif(text);
    const types = new Map(reqif.types.map((t) => [t.id, t]));
    const objects = new Map(reqif.objects.map((o) => [o.id, o]));
    const render = (attribute: ReqifAttribute, value: ReqifValue | undefined) =>
      Array.isArray(value)
        ? value.map((id) => attribute.values?.find((v) => v.id === id)?.name)
        : typeof value === "object"
          ? writeXml(value).replace(/files\/[0-9a-f-]+\./g, "files/IMAGE.")
          : value;
    const object = (id: string) => {
      const found = objects.get(id);
      const type = types.get(found?.typeId ?? "");
      const values = (type?.attributes ?? [])
        .filter((a) => a.name !== "ReqIF.ForeignID" && found?.values[a.id] !== undefined)
        .map((a) => [a.name, render(a, found?.values[a.id])]);
      return { type: type?.name, values: Object.fromEntries(values) };
    };
    const tree = (list: ReqifNode[]): object[] =>
      list.map((n) => ({ ...object(n.objectId), children: tree(n.children) }));
    return {
      types: reqif.types.map((t) => ({
        name: t.name,
        kind: t.kind,
        attributes: t.attributes.map((a) => ({
          name: a.name,
          kind: a.kind,
          multi: a.multi,
          values: a.values?.map((v) => v.name),
        })),
      })),
      specifications: reqif.specifications.map((s) => ({ name: s.name, children: tree(s.children) })),
      // Sorted: relationships imported together share a creation time, so their order in a file is not fixed.
      relations: reqif.relations
        .map((r) => JSON.stringify([types.get(r.typeId)?.name, object(r.sourceId), object(r.targetId)]))
        .sort(),
    };
  };
  const first = shape(xml);
  expect(JSON.stringify(first)).toContain('<b>shall</b> run at 5 &lt; 6 &amp; \\"quietly\\".');
  expect(JSON.stringify(first)).toContain('<object data=\\"files/IMAGE.png\\" type=\\"image/png\\">Diagram</object>');
  expect(first.relations).toHaveLength(2);
  expect(shape(xmlAgain)).toEqual(first);
  expect(Buffer.from([...again].find(([name]) => name.startsWith("files/"))?.[1] as Uint8Array).equals(png)).toBe(true);
});

test("evidence files of several kinds are attached to results, to runs and their steps, and to a CI report", async () => {
  const { cookie: owner, projectId, t1, t2, record } = await projectWithTests();
  const viewer = await person("Vera Viewer", "viewer");
  const tester = await person("Tess Tester", "reviewer");
  const upload = (payload: Buffer | string, name: string, as = owner, type = "application/octet-stream") =>
    app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/attachments?name=${encodeURIComponent(name)}`,
      payload,
      headers: { cookie: as, "content-type": type },
    });

  // What a file is, is decided from its bytes. A tester with the Reviewer role may upload; a viewer may not.
  const pdf = await upload("%PDF-1.7 report", "C:\\bench\\Report 1.pdf");
  expect(pdf.statusCode).toBe(201);
  expect(pdf.json()).toMatchObject({ name: "Report 1.pdf", contentType: "application/pdf" });
  const log = await upload("12:00 pump stopped\n", "bench.log", tester.cookie, "text/plain");
  expect(log.json()).toMatchObject({ name: "bench.log", contentType: "text/plain" });
  expect((await upload("a,b\n1,2\n", "data.csv")).json().contentType).toBe("text/csv");
  expect((await upload(Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), "logs.zip")).json().contentType).toBe("application/zip");
  expect((await upload(Buffer.from("MZ\u0090\u0000\u0003"), "tool.exe")).statusCode).toBe(400);
  expect((await upload("x", "note.txt", viewer.cookie)).statusCode).toBe(403);
  // Something that says it is an image must be one, because images are shown in rich text.
  expect((await upload("%PDF-1.7", "x.png", owner, "image/png")).statusCode).toBe(400);

  // Anything that is not an image is only ever a download, under its own name, and is never sniffed or run.
  const served = await get(pdf.json().src, viewer.cookie);
  expect(served.headers["content-type"]).toBe("application/pdf");
  expect(served.headers["content-disposition"]).toBe('attachment; filename="Report 1.pdf"');
  expect(served.headers["x-content-type-options"]).toBe("nosniff");
  expect(served.body).toBe("%PDF-1.7 report");
  const page = await upload("<script>alert(1)</script>", "page.html");
  expect((await get(page.json().src, owner)).headers["content-type"]).toContain("text/plain");

  // A result takes many files.
  const recorded = await record(t2, { outcome: "pass", attachmentIds: [pdf.json().id, log.json().id] });
  expect(recorded.statusCode).toBe(201);
  expect((await get(`/api/items/${t2}/results`, owner)).json().results[0].attachments).toEqual([
    { id: pdf.json().id, name: "Report 1.pdf", contentType: "application/pdf", step: null },
    { id: log.json().id, name: "bench.log", contentType: "text/plain", step: null },
  ]);

  // A run gathers evidence while it is executed, on a step or on the whole test.
  const planId = (await post(`/api/projects/${projectId}/test-plans`, { name: "Plan" }, owner)).json().id;
  await post(`/api/test-plans/${planId}/cases`, { itemIds: [t1] }, owner);
  const cycleId = (await post(`/api/test-plans/${planId}/cycles`, { name: "Round 1" }, owner)).json().id;
  const runId = (await get(`/api/test-cycles/${cycleId}`, owner)).json().runs[0].id;
  const attach = (body: object, as: string) => post(`/api/test-runs/${runId}/attachments`, body, as);
  // Not assigned to the tester yet.
  expect((await attach({ attachmentId: log.json().id }, tester.cookie)).statusCode).toBe(403);
  await post(`/api/test-cycles/${cycleId}/assign`, { runIds: [runId], assigneeId: tester.id }, owner);
  expect((await attach({ attachmentId: log.json().id, step: 1 }, tester.cookie)).statusCode).toBe(201);
  expect((await attach({ attachmentId: pdf.json().id }, tester.cookie)).statusCode).toBe(201);
  expect((await attach({ attachmentId: pdf.json().id, step: 2 }, tester.cookie)).statusCode).toBe(400);
  expect((await attach({ attachmentId: planId }, tester.cookie)).statusCode).toBe(400);
  expect((await attach({ attachmentId: pdf.json().id }, viewer.cookie)).statusCode).toBe(403);
  expect((await get(`/api/test-runs/${runId}`, viewer.cookie)).json().run.attachments).toEqual([
    expect.objectContaining({ id: log.json().id, name: "bench.log", step: 1, by: "Tess Tester" }),
    expect.objectContaining({ id: pdf.json().id, name: "Report 1.pdf", step: null }),
  ]);
  await post(`/api/test-runs/${runId}/steps`, { steps: [1], outcome: "pass" }, tester.cookie);
  await post(`/api/test-runs/${runId}/finish`, {}, tester.cookie);
  expect((await attach({ attachmentId: pdf.json().id }, tester.cookie)).statusCode).toBe(409);
  // The run's evidence is the evidence of the result it recorded.
  expect((await get(`/api/items/${t1}/results`, owner)).json().results[0].attachments).toEqual([
    expect.objectContaining({ id: log.json().id, step: 1 }),
    expect.objectContaining({ id: pdf.json().id, step: null }),
  ]);
  expect(await auditActions()).toContain("run.evidence");

  // A CI job uploads its log, then names it with the report: every result of the report carries it.
  const junit = (query: string) =>
    app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/verification-results/junit${query}`,
      payload: '<testsuite><testcase name="VER-002 alarm"/></testsuite>',
      headers: { cookie: owner, "content-type": "application/xml" },
    });
  expect((await junit(`?attachmentId=${planId}`)).statusCode).toBe(400);
  expect((await junit(`?attachmentId=${log.json().id}`)).statusCode).toBe(201);
  expect((await get(`/api/items/${t2}/results`, owner)).json().results[0]).toMatchObject({
    source: "junit",
    attachments: [{ id: log.json().id, name: "bench.log" }],
  });
});

test("a baseline freezes verification status, and a cycle that names it shows up in its review", async () => {
  const { cookie, projectId, req, bare, t1, t2, record } = await projectWithTests();
  await record(t1, { outcome: "pass" });
  await record(t2, { outcome: "pass" });
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "Release 1.0" }, cookie)).json().id;
  // The status moves on after the baseline.
  await record(t1, { outcome: "fail" });
  const frozen = (await get(`/api/baselines/${baselineId}`, cookie)).json();
  expect(frozen.verification).toEqual({
    [req]: { status: "passing", outOfDate: false },
    [bare]: { status: "not_covered", outOfDate: false },
  });
  expect((await get(`/api/projects/${projectId}/verification`, cookie)).json().requirements[req].status).toBe(
    "failing",
  );

  // A cycle may name the baseline it verifies, of its own project only.
  const planId = (await post(`/api/projects/${projectId}/test-plans`, { name: "Plan" }, cookie)).json().id;
  await post(`/api/test-plans/${planId}/cases`, { itemIds: [t1, t2] }, cookie);
  const start = (body: object) => post(`/api/test-plans/${planId}/cycles`, body, cookie);
  expect((await start({ name: "X", baselineId: planId })).statusCode).toBe(400);
  const cycleId = (await start({ name: "Release run", baselineId })).json().id;
  expect((await get(`/api/test-cycles/${cycleId}`, cookie)).json().cycle).toMatchObject({
    baselineId,
    baseline: "Release 1.0",
  });
  const [run] = (await get(`/api/test-cycles/${cycleId}`, cookie)).json().runs;
  await post(`/api/test-runs/${run.id}/steps`, { steps: [1], outcome: "pass" }, cookie);

  // A review of that baseline lists the cycle: the evidence its approvers sign for.
  const me = (await get("/api/session", cookie)).json().user.id;
  const reviewId = (
    await post(`/api/projects/${projectId}/reviews`, { name: "Release review", baselineId, approvers: [me] }, cookie)
  ).json().id;
  expect((await get(`/api/reviews/${reviewId}`, cookie)).json().cycles).toEqual([
    { id: cycleId, name: "Release run", closedAt: null, runs: { passed: 1, not_started: 1 } },
  ]);
});

test("reports: cycles of a plan side by side, the requirement verification report, and flaky tests", async () => {
  const { cookie, projectId, req, bare, t1, t2, record } = await projectWithTests();
  const viewer = await person("Vera Viewer", "viewer");
  const planId = (await post(`/api/projects/${projectId}/test-plans`, { name: "Plan" }, cookie)).json().id;
  await post(`/api/test-plans/${planId}/cases`, { itemIds: [t1, t2] }, cookie);
  const runCycle = async (name: string, outcomes: Record<string, string>) => {
    const cycleId = (await post(`/api/test-plans/${planId}/cycles`, { name }, cookie)).json().id;
    for (const run of (await get(`/api/test-cycles/${cycleId}`, cookie)).json().runs) {
      const outcome = outcomes[run.itemId];
      if (!outcome) continue;
      await post(`/api/test-runs/${run.id}/steps`, { steps: [1], outcome }, cookie);
      await post(`/api/test-runs/${run.id}/finish`, {}, cookie);
    }
    return cycleId as string;
  };
  const first = await runCycle("Round 1", { [t1]: "fail", [t2]: "pass" });
  const second = await runCycle("Round 2", { [t1]: "pass" });

  // Plan history: what each test case reached in each cycle, oldest cycle first.
  const history = (await get(`/api/test-plans/${planId}/history`, viewer.cookie)).json();
  expect(history.cycles.map((c: { id: string }) => c.id)).toEqual([first, second]);
  expect(history.tests).toEqual([
    { itemId: t1, uid: "VER-001", name: "Occlusion test", states: { [first]: "failed", [second]: "passed" } },
    { itemId: t2, uid: "VER-002", name: "Alarm test", states: { [first]: "passed", [second]: "not_started" } },
  ]);

  // The verification report adds, to each test's latest result, who recorded it, in which cycle, and its evidence.
  const report = (await get(`/api/projects/${projectId}/reports/verification`, viewer.cookie)).json();
  expect(report.requirements[req]).toMatchObject({ status: "passing" });
  expect(report.requirements[bare]).toMatchObject({ status: "not_covered", tests: [] });
  expect(report.tests[t1]).toMatchObject({
    outcome: "pass",
    recordedBy: "Admin",
    source: "run",
    cycleId: second,
    cycle: "Round 2",
    evidence: [],
  });
  expect(report.tests[t2]).toMatchObject({ outcome: "pass", cycle: "Round 1" });

  // Flaky: t1 went fail, pass and now fails again; t2 only ever passed.
  await record(t1, { outcome: "fail" });
  await record(t2, { outcome: "pass" });
  expect((await get(`/api/projects/${projectId}/reports/flaky`, viewer.cookie)).json().tests).toEqual([
    { itemId: t1, outcomes: ["fail", "pass", "fail"] },
  ]);
});

test("many items of a set are edited, moved or deleted in one request, all or none", async () => {
  const { cookie, detail, un, sys, add } = await projectWithSets();
  const reviewer = await person("Rob Reviewer", "reviewer");
  const folder = (await add(sys.id, { kind: "folder", name: "Power" })).json().node.id;
  const item = async (setId: string, name: string) => (await add(setId, { kind: "item", name })).json().node.id;
  const [a, b, c] = [await item(sys.id, "A"), await item(sys.id, "B"), await item(sys.id, "C")];
  const elsewhere = await item(un.id, "Need");
  const fields = (await get(`/api/items/${a}`, cookie)).json().fields as { id: string; name: string }[];
  const status = fields.find((f) => f.name === "Status")?.id as string;
  const bulk = (body: object, as = cookie) => post(`/api/sets/${sys.id}/bulk`, body, as);
  const current = async (id: string) => (await get(`/api/items/${id}`, cookie)).json().item;

  expect(
    (await bulk({ action: "edit", itemIds: [a], attributes: { [status]: "Approved" } }, reviewer.cookie)).statusCode,
  ).toBe(403);
  // A folder, or an item of another set, is not an item of this set: nothing is changed.
  expect((await bulk({ action: "delete", itemIds: [a, folder] })).statusCode).toBe(400);
  expect((await bulk({ action: "delete", itemIds: [a, elsewhere] })).statusCode).toBe(400);
  expect((await detail()).nodes).toHaveLength(5);

  // Edit: only the named field changes, each item gets a new version, and a bad value changes nothing at all.
  await post(
    `/api/items/${b}/revisions`,
    { baseRevision: 1, name: "B", description: textToDoc("Keep me"), attributes: { [status]: "Approved" } },
    cookie,
  );
  expect(
    (await bulk({ action: "edit", itemIds: [a, b, c], attributes: { [status]: "No such state" } })).statusCode,
  ).toBe(400);
  expect((await current(a)).revision).toBe(1);
  const edited = await bulk({
    action: "edit",
    itemIds: [a, b, c],
    attributes: { [status]: "Approved" },
    changeReason: "Review 3",
  });
  // B already had the value, so it gets no new version.
  expect(edited.json()).toEqual({ changed: 2 });
  expect(await current(a)).toMatchObject({ revision: 2, name: "A", attributes: { [status]: "Approved" } });
  expect(await current(b)).toMatchObject({ revision: 2, description: textToDoc("Keep me") });
  const [latest] = (await get(`/api/items/${c}/revisions`, cookie)).json().revisions;
  expect(latest).toMatchObject({ number: 2, changeReason: "Review 3", author: "Admin" });
  // A draft of the person's own would be left behind unsaveable, so the edit is refused until it is dealt with.
  await send("PUT", `/api/items/${a}/draft`, cookie, {
    baseRevision: 2,
    name: "A2",
    description: textToDoc(""),
    attributes: {},
  });
  const blocked = await bulk({ action: "edit", itemIds: [a, c], attributes: { [status]: null } });
  expect(blocked.statusCode).toBe(409);
  expect(blocked.json().error).toContain("SYS-001");
  await send("DELETE", `/api/items/${a}/draft`, cookie);
  expect((await bulk({ action: "edit", itemIds: [a], attributes: { [status]: null } })).json()).toEqual({ changed: 1 });
  expect((await current(a)).attributes).toEqual({});

  // Move: into a folder of the same set, after what is there, in set order.
  expect((await bulk({ action: "move", itemIds: [a] })).statusCode).toBe(400);
  expect((await bulk({ action: "move", itemIds: [a], parentId: a })).statusCode).toBe(400);
  expect((await bulk({ action: "move", itemIds: [c, a], parentId: folder })).json()).toEqual({ changed: 2 });
  const inFolder = (await detail()).nodes.filter((n: { parentId: string }) => n.parentId === folder);
  expect(inFolder.map((n: { name: string }) => n.name)).toEqual(["A", "C"]);
  expect((await bulk({ action: "move", itemIds: [a, b], parentId: null })).json()).toEqual({ changed: 1 });

  // Delete: soft, so the items are in Deleted items and their UIDs stay used.
  expect((await bulk({ action: "delete", itemIds: [a, b] })).json()).toEqual({ changed: 2 });
  expect((await detail()).nodes.map((n: { name: string }) => n.name).sort()).toEqual(["C", "Need", "Power"]);
  const trash = (await get(`/api/projects/${(await detail()).project.id}/trash`, cookie)).json().deleted;
  expect(trash.map((n: { uid: string }) => n.uid).sort()).toEqual(["SYS-001", "SYS-002"]);
  expect((await bulk({ action: "delete", itemIds: [a] })).statusCode).toBe(400);
  expect((await add(sys.id, { kind: "item", name: "Next" })).json().node.uid).toBe("SYS-004");
  expect(await auditActions()).toEqual(expect.arrayContaining(["item.delete", "item.move", "item.revise"]));
});
