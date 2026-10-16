import { readFileSync } from "node:fs";
import { deriveReqifStructure, mapReqif, reqifMappingFor, summarizeReqif } from "@app/importers";
import { parseReqif } from "@app/reqif";
import { textToDoc } from "@app/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_DATABASE_URL } from "../test/global-setup.ts";
import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { auditEvents } from "./db/schema.ts";

// J5 slice 1: item types, fields, sets and relationship types edited by a project admin.
const db = createDb(TEST_DATABASE_URL);
let app: FastifyInstance;
const admin = { email: "admin@example.com", name: "Admin", password: "a long password" };

beforeAll(async () => {
  app = await buildApp(db, { loginAttemptsPerMinute: 1000 });
});
beforeEach(async () => {
  await db.execute(sql`truncate users, projects cascade`);
});
afterAll(async () => {
  await app.close();
  await db.$client.end();
});

const call = (method: "POST" | "PATCH" | "DELETE", url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { cookie } });
const get = (url: string, cookie: string) => app.inject({ method: "GET", url, headers: { cookie } });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => `session=${res.cookies[0]?.value}`;

async function setup() {
  const owner = cookieOf(await app.inject({ method: "POST", url: "/api/setup", payload: admin }));
  const { project } = (await call("POST", "/api/projects", owner, { name: "P", templateId: "standard" })).json();
  const types = async () => (await get(`/api/projects/${project.id}/types`, owner)).json();
  return { owner, projectId: project.id as string, types };
}

test("an admin adds an item type, a field, a set and a relationship type, and items use them", async () => {
  const { owner, projectId, types } = await setup();
  const type = await call("POST", `/api/projects/${projectId}/item-types`, owner, { name: "Hazard" });
  expect(type.statusCode).toBe(201);
  const itemTypeId = type.json().id;
  expect((await call("POST", `/api/projects/${projectId}/item-types`, owner, { name: " hazard " })).statusCode).toBe(
    409,
  );

  const severity = await call("POST", `/api/item-types/${itemTypeId}/fields`, owner, {
    name: "Severity",
    type: "enum",
    options: ["Low", "High"],
  });
  expect(severity.statusCode).toBe(201);
  const fieldId = severity.json().id;
  expect(
    (await call("POST", `/api/item-types/${itemTypeId}/fields`, owner, { name: "Notes", type: "text", options: ["x"] }))
      .statusCode,
  ).toBe(400);

  const set = await call("POST", `/api/projects/${projectId}/sets`, owner, {
    name: "Hazards",
    uidPrefix: "HAZ",
    itemTypeId,
  });
  expect(set.statusCode).toBe(201);
  const setId = set.json().id;
  expect(
    (await call("POST", `/api/projects/${projectId}/sets`, owner, { name: "Other", uidPrefix: "HAZ", itemTypeId }))
      .statusCode,
  ).toBe(409);
  const linkType = await call("POST", `/api/projects/${projectId}/link-types`, owner, { name: "Caused by" });
  expect(linkType.statusCode).toBe(201);

  const listed = await types();
  expect(listed.itemTypes.find((t: { id: string }) => t.id === itemTypeId)).toEqual({
    id: itemTypeId,
    name: "Hazard",
    role: null,
    fields: [{ id: fieldId, name: "Severity", type: "enum", options: ["Low", "High"] }],
  });
  expect(listed.sets.at(-1)).toEqual({ id: setId, name: "Hazards", uidPrefix: "HAZ", itemTypeId });
  expect(listed.linkTypes.at(-1)).toEqual({ id: linkType.json().id, name: "Caused by", role: null });

  const item = (await call("POST", `/api/sets/${setId}/nodes`, owner, { kind: "item", name: "Burn" })).json().node;
  expect(item.uid).toBe("HAZ-001");
  const save = (baseRevision: number, attributes: object) =>
    call("POST", `/api/items/${item.id}/revisions`, owner, {
      baseRevision,
      name: "Burn",
      description: textToDoc(""),
      attributes,
    });
  expect((await save(1, { [fieldId]: "High" })).statusCode).toBe(201);

  // Renamed and with "High" taken out: the item keeps "High" until someone changes it, and no one can pick it anew.
  expect(
    (await call("PATCH", `/api/fields/${fieldId}`, owner, { name: "Severity level", options: ["Low", "Severe"] }))
      .statusCode,
  ).toBe(200);
  expect((await save(2, { [fieldId]: "High" })).statusCode).toBe(201);
  expect((await save(3, { [fieldId]: "Severe" })).statusCode).toBe(201);
  expect((await save(4, { [fieldId]: "High" })).statusCode).toBe(400);

  // A removed field drops out of the item page; old versions keep its value.
  expect((await call("DELETE", `/api/fields/${fieldId}`, owner)).statusCode).toBe(200);
  const page = (await get(`/api/items/${item.id}`, owner)).json();
  expect(page.fields).toEqual([]);
  const history = (await get(`/api/items/${item.id}/revisions`, owner)).json().revisions as {
    number: number;
    attributes: Record<string, unknown>;
  }[];
  expect(history.find((r) => r.number === 2)?.attributes).toEqual({ [fieldId]: "High" });

  const actions = (await db.select().from(auditEvents)).map((e) => e.action);
  expect(actions).toEqual(
    expect.arrayContaining([
      "item_type.create",
      "field.create",
      "field.update",
      "field.remove",
      "set.create",
      "link_type.create",
    ]),
  );
});

test("only empty sets and unused item types are removed; a removed set's prefix stays taken", async () => {
  const { owner, projectId, types } = await setup();
  const { sets, itemTypes } = await types();
  const sys = sets[1];
  const item = (await call("POST", `/api/sets/${sys.id}/nodes`, owner, { kind: "item", name: "A" })).json().node;
  expect((await call("DELETE", `/api/sets/${sys.id}`, owner)).statusCode).toBe(409);
  expect((await call("DELETE", `/api/item-types/${sys.itemTypeId}`, owner)).statusCode).toBe(409);

  expect((await call("PATCH", `/api/sets/${sys.id}`, owner, { name: "System" })).statusCode).toBe(200);
  expect((await call("DELETE", `/api/nodes/${item.id}`, owner)).statusCode).toBe(200);
  expect((await call("DELETE", `/api/sets/${sys.id}`, owner)).statusCode).toBe(200);
  // Gone from the project, its deleted item can no longer come back, and its prefix is not handed out again.
  expect((await get(`/api/projects/${projectId}`, owner)).json().sets).toHaveLength(2);
  expect((await call("POST", `/api/sets/${sys.id}/nodes`, owner, { kind: "item", name: "B" })).statusCode).toBe(404);
  expect((await call("POST", `/api/nodes/${item.id}/restore`, owner)).statusCode).toBe(404);
  const again = { name: "Again", uidPrefix: "SYS", itemTypeId: sys.itemTypeId };
  expect((await call("POST", `/api/projects/${projectId}/sets`, owner, again)).statusCode).toBe(409);

  expect((await call("DELETE", `/api/item-types/${sys.itemTypeId}`, owner)).statusCode).toBe(200);
  expect((await types()).itemTypes).toHaveLength(itemTypes.length - 1);
  expect(
    (await call("POST", `/api/projects/${projectId}/sets`, owner, { ...again, uidPrefix: "NEW" })).statusCode,
  ).toBe(409);
});

test("verification follows the relationship type's role, not its name; removed types still name old links", async () => {
  const { owner, projectId, types } = await setup();
  const { sets, linkTypes } = await types();
  const verifies = linkTypes.find((t: { role: string | null }) => t.role === "verifies");
  expect(verifies.name).toBe("Verified by");
  const add = async (setId: string, name: string) =>
    (await call("POST", `/api/sets/${setId}/nodes`, owner, { kind: "item", name })).json().node.id as string;
  const requirement = await add(sets[1].id, "Req");
  const testCase = await add(sets[2].id, "Test");
  const status = async () =>
    (await get(`/api/projects/${projectId}/verification`, owner)).json().requirements[requirement].status;

  const decoy = (await call("POST", `/api/projects/${projectId}/link-types`, owner, { name: "Checks" })).json().id;
  await call("POST", "/api/links", owner, { upstreamId: requirement, downstreamId: testCase, typeId: decoy });
  await call("POST", `/api/items/${testCase}/results`, owner, { outcome: "pass" });
  expect(await status()).toBe("not_covered");

  // Renamed, the type still counts; given the role, another type counts too.
  expect((await call("PATCH", `/api/link-types/${verifies.id}`, owner, { name: "Tested by" })).statusCode).toBe(200);
  expect((await call("PATCH", `/api/link-types/${decoy}`, owner, { role: "verifies" })).statusCode).toBe(200);
  expect(await status()).toBe("passing");

  // Removed: no new link may use it, but the existing one keeps it and still counts.
  expect((await call("DELETE", `/api/link-types/${decoy}`, owner)).statusCode).toBe(200);
  const listed = (await get(`/api/projects/${projectId}/links`, owner)).json().linkTypes;
  expect(listed.find((t: { id: string }) => t.id === decoy).archivedAt).toBeTruthy();
  const other = await add(sets[2].id, "Test 2");
  expect(
    (await call("POST", "/api/links", owner, { upstreamId: requirement, downstreamId: other, typeId: decoy }))
      .statusCode,
  ).toBe(400);
  expect(await status()).toBe("passing");
});

test("only a project admin edits types; a viewer reads them", async () => {
  const { owner, projectId, types } = await setup();
  await db.execute(
    sql`insert into users (email, name, password_hash) select 'ed@example.com', 'Ed', password_hash from users where is_admin`,
  );
  await db.execute(
    sql`insert into project_members (project_id, user_id, role) select ${projectId}, id, 'editor' from users where email = 'ed@example.com'`,
  );
  const editor = cookieOf(
    await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "ed@example.com", password: admin.password },
    }),
  );
  expect((await get(`/api/projects/${projectId}/types`, editor)).statusCode).toBe(200);
  const { itemTypes, linkTypes } = await types();
  expect((await call("POST", `/api/projects/${projectId}/item-types`, editor, { name: "X" })).statusCode).toBe(403);
  expect((await call("PATCH", `/api/item-types/${itemTypes[0].id}`, editor, { name: "X" })).statusCode).toBe(403);
  expect((await call("DELETE", `/api/fields/${itemTypes[0].fields[0].id}`, editor)).statusCode).toBe(403);
  expect((await call("PATCH", `/api/link-types/${linkTypes[0].id}`, editor, { name: "X" })).statusCode).toBe(403);
  expect((await call("PATCH", `/api/item-types/${itemTypes[0].id}`, owner, {})).statusCode).toBe(400);
});

test("a backup keeps removed values and roles; an older file gets the verifying type from its name", async () => {
  const { owner, projectId, types } = await setup();
  const { sets, itemTypes } = await types();
  const priority = itemTypes
    .find((t: { id: string }) => t.id === sets[1].itemTypeId)
    .fields.find((f: { name: string }) => f.name === "Priority");
  const item = (await call("POST", `/api/sets/${sets[1].id}/nodes`, owner, { kind: "item", name: "A" })).json().node;
  await call("POST", `/api/items/${item.id}/revisions`, owner, {
    baseRevision: 1,
    name: "A",
    description: textToDoc(""),
    attributes: { [priority.id]: "Low" },
  });
  await call("PATCH", `/api/fields/${priority.id}`, owner, { options: ["High", "Medium"] });
  const backup = (await get(`/api/projects/${projectId}/backup`, owner)).json();
  expect(backup.version).toBe(11);

  const restored = await call("POST", "/api/projects/restore", owner, backup);
  expect(restored.statusCode).toBe(201);

  const old = {
    ...backup,
    version: 7,
    linkTypes: backup.linkTypes.map(({ role: _, archivedAt: __, ...t }: Record<string, unknown>) => t),
  };
  const fromOld = await call("POST", "/api/projects/restore", owner, old);
  expect(fromOld.statusCode).toBe(201);
  const links = (await get(`/api/projects/${fromOld.json().project.id}/links`, owner)).json().linkTypes;
  expect(links.filter((t: { role: string | null }) => t.role).map((t: { name: string }) => t.name)).toEqual([
    "Verified by",
  ]);
});

test("structure from a file: a dry run says what is added, apply adds it once, and a second run adds nothing", async () => {
  const { owner, projectId, types } = await setup();
  const before = await types();
  const body = {
    sets: [
      {
        name: "Launcher ICD",
        uidPrefix: "LI",
        fields: [
          { name: "Priority", type: "enum", options: ["High", "Low"] },
          { name: "Owner", type: "text" },
        ],
      },
    ],
    linkTypes: ["Satisfies"],
  };
  const dry = await call("POST", `/api/projects/${projectId}/structure`, owner, { ...body, dryRun: true });
  expect(dry.statusCode).toBe(200);
  expect(dry.json().added).toHaveLength(5);
  expect(await types()).toEqual(before);

  const applied = await call("POST", `/api/projects/${projectId}/structure`, owner, body);
  expect(applied.statusCode).toBe(201);
  const [set] = applied.json().sets;
  expect(set.id).toBeTruthy();
  expect(set.fields.map((f: { id: string | null }) => f.id).every(Boolean)).toBe(true);
  const after = await types();
  expect(after.sets.map((s: { name: string }) => s.name)).toContain("Launcher ICD");
  expect(after.linkTypes.map((t: { name: string }) => t.name)).toContain("Satisfies");

  // The same file again, with one more value: only the value is added; a taken prefix is numbered for a new set.
  const again = await call("POST", `/api/projects/${projectId}/structure`, owner, {
    sets: [
      {
        name: "launcher icd",
        uidPrefix: "LI",
        fields: [{ name: "priority", type: "enum", options: ["High", "Low", "Mid"] }],
      },
      { name: "Second", uidPrefix: "LI", fields: [] },
    ],
    linkTypes: ["satisfies"],
  });
  expect(again.statusCode).toBe(201);
  expect(again.json().added).toEqual([
    'Values "Mid" on "Priority" of Launcher ICD',
    'Item type "Second"',
    'Set "Second" (LI2)',
  ]);
  const final = await types();
  expect(final.sets.filter((s: { name: string }) => s.name === "Launcher ICD")).toHaveLength(1);
  const type = final.itemTypes.find((t: { name: string }) => t.name === "Launcher ICD");
  expect(type.fields.find((f: { name: string }) => f.name === "Priority").options).toEqual(["High", "Low", "Mid"]);

  const events = await db.select({ action: auditEvents.action }).from(auditEvents);
  const actions = events.map((e) => e.action);
  expect(actions).toEqual(
    expect.arrayContaining(["item_type.create", "field.create", "set.create", "link_type.create", "field.update"]),
  );
});

test("structure from a file needs the admin role, and a non-member sees nothing", async () => {
  const { owner, projectId } = await setup();
  const person = async (email: string, role?: string) => {
    await db.execute(
      sql`insert into users (email, name, password_hash) select ${email}, ${email}, password_hash from users where is_admin limit 1`,
    );
    if (role) {
      await db.execute(
        sql`insert into project_members (project_id, user_id, role) select ${projectId}, u.id, ${role} from users u where u.email = ${email}`,
      );
    }
    return cookieOf(
      await app.inject({ method: "POST", url: "/api/login", payload: { email, password: admin.password } }),
    );
  };
  const body = { sets: [{ name: "X", uidPrefix: "XX", fields: [] }] };
  const url = `/api/projects/${projectId}/structure`;
  expect((await app.inject({ method: "POST", url, payload: body })).statusCode).toBe(401);
  expect((await call("POST", url, await person("ed@example.com", "editor"), body)).statusCode).toBe(403);
  expect((await call("POST", url, await person("out@example.com"), body)).statusCode).toBe(404);
  // A field with values but not an enum is refused before anything is written.
  expect(
    (
      await call("POST", url, owner, {
        sets: [{ name: "Y", uidPrefix: "YY", fields: [{ name: "F", type: "text", options: ["a"] }] }],
      })
    ).statusCode,
  ).toBe(400);
});

test("a DOORS file imports into an empty structure: derive, apply, map, import", async () => {
  const { owner, projectId } = await setup();
  const file = readFileSync(
    new URL("../../../samples/import/doors-classic-launcher-icd.reqif", import.meta.url),
    "utf8",
  );
  const reqif = parseReqif(file);
  const summary = summarizeReqif(reqif);
  const { proposal, fieldOf } = deriveReqifStructure(summary);
  const applied = (await call("POST", `/api/projects/${projectId}/structure`, owner, proposal)).json();
  const { mapping, targets } = reqifMappingFor(summary, fieldOf, applied);
  const mapped = mapReqif(reqif, mapping, targets, () => null);
  expect(mapped.warnings).toEqual([]);
  const imported = await call("POST", `/api/projects/${projectId}/import`, owner, mapped.body);
  expect(imported.statusCode).toBe(201);
  expect(imported.json().created.items).toBe(mapped.items);
  // Importing again is a no-op: structure and items are found again.
  const again = await call("POST", `/api/projects/${projectId}/structure`, owner, proposal);
  expect(again.json().added).toEqual([]);
  const second = await call("POST", `/api/projects/${projectId}/import`, owner, mapped.body);
  expect(second.json().created).toEqual({ items: 0, folders: 0, links: 0 });
});
