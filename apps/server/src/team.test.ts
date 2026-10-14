import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { textToDoc } from "@app/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_DATABASE_URL } from "../test/global-setup.ts";
import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { outbox } from "./db/schema.ts";
import { type Mailer, queueDigests, sendDue } from "./mail.ts";

// Bundle F: HTTPS headers, edit conflicts, notifications, email and account recovery.
const db = createDb(TEST_DATABASE_URL);
let app: FastifyInstance;
const attachmentsDir = mkdtempSync(join(tmpdir(), "attachments-"));
const mail = { enabled: true, publicUrl: "https://req.example.com" };
const admin = { email: "admin@example.com", name: "Admin", password: "a long password" };

beforeAll(async () => {
  app = await buildApp(db, { loginAttemptsPerMinute: 1000, attachmentsDir, https: true, mail });
});
beforeEach(async () => {
  await db.execute(sql`truncate users, projects, outbox cascade`);
});
afterAll(async () => {
  await app.close();
  await db.$client.end();
  rmSync(attachmentsDir, { recursive: true });
});

const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {} });
const get = (url: string, cookie?: string) => app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => `session=${res.cookies[0]?.value}`;
const sentMail = () => db.select().from(outbox).orderBy(outbox.createdAt);

/** A project with an admin, and people added with a role in it. */
async function setup() {
  const owner = cookieOf(await post("/api/setup", admin));
  const { project } = (await post("/api/projects", { name: "P", templateId: "standard" }, owner)).json();
  const detail = (await get(`/api/projects/${project.id}`, owner)).json();
  const person = async (name: string, role: "reviewer" | "editor") => {
    const email = `${name.toLowerCase()}@example.com`;
    await db.execute(
      sql`insert into users (email, name, password_hash) select ${email}, ${name}, password_hash from users where is_admin`,
    );
    await db.execute(
      sql`insert into project_members (project_id, user_id, role) select ${project.id}, id, ${role} from users where email = ${email}`,
    );
    const res = await post("/api/login", { email, password: admin.password });
    return { cookie: cookieOf(res), id: res.json().user.id as string, email };
  };
  const item = async (name: string, cookie = owner) =>
    (await post(`/api/sets/${detail.sets[1].id}/nodes`, { kind: "item", name }, cookie)).json().node.id as string;
  const save = (id: string, baseRevision: number, name: string, cookie = owner, attributes = {}) =>
    post(`/api/items/${id}/revisions`, { baseRevision, name, description: textToDoc(""), attributes }, cookie);
  const notes = async (cookie: string) => (await get("/api/notifications", cookie)).json();
  return { owner, projectId: project.id as string, sets: detail.sets, person, item, save, notes };
}

test("every response carries security headers; behind HTTPS cookies are Secure and HSTS is sent", async () => {
  const res = await post("/api/setup", admin);
  expect(res.cookies[0]).toMatchObject({ name: "session", secure: true, httpOnly: true });
  expect(res.headers).toMatchObject({
    "strict-transport-security": expect.stringContaining("max-age="),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "content-security-policy": expect.stringContaining("script-src 'self'"),
  });

  const plain = await buildApp(db);
  const local = await plain.inject({ method: "GET", url: "/api/session" });
  expect(local.headers["strict-transport-security"]).toBeUndefined();
  expect(local.headers["x-frame-options"]).toBe("DENY");
  expect(local.json().mail).toBe(false);
  await plain.close();
});

test("an open item shows who else has a draft and the latest version, never the draft itself", async () => {
  const { owner, person, item, save } = await setup();
  const anna = await person("Anna", "editor");
  const id = await item("Supply voltage");
  await app.inject({
    method: "PUT",
    url: `/api/items/${id}/draft`,
    payload: { baseRevision: 1, name: "Secret wording", description: textToDoc(""), attributes: {} },
    headers: { cookie: anna.cookie },
  });
  const seen = (await get(`/api/items/${id}/editing`, owner)).json();
  expect(seen).toMatchObject({ revision: 1, author: "Admin", editors: [{ name: "Anna" }] });
  expect(JSON.stringify(seen)).not.toContain("Secret");
  expect((await get(`/api/items/${id}/editing`, anna.cookie)).json().editors).toEqual([]);

  expect((await save(id, 1, "Newer")).statusCode).toBe(201);
  expect((await get(`/api/items/${id}/editing`, anna.cookie)).json()).toMatchObject({ revision: 2, author: "Admin" });
  // Anna's save from version 1 is refused, and her draft is kept for the merge screen.
  expect((await save(id, 1, "Secret wording", anna.cookie)).statusCode).toBe(409);
  expect((await get(`/api/items/${id}`, anna.cookie)).json().draft).toMatchObject({ baseRevision: 1 });
});

test("a mention notifies the person, emails them, and can be marked read", async () => {
  const { owner, projectId, person, item, notes } = await setup();
  const rob = await person("Rob", "reviewer");
  const id = await item("Supply voltage");
  await post(`/api/items/${id}/comments`, { body: "@Rob please check, and @Admin too" }, owner);

  const mine = await notes(rob.cookie);
  expect(mine).toMatchObject({ unread: 1, emailNotifications: "each", mail: true });
  expect(mine.notifications[0]).toMatchObject({
    kind: "mention",
    text: expect.stringContaining("Admin mentioned you on SYS-001 Supply voltage"),
    path: `/projects/${projectId}/items/${id}`,
    readAt: null,
  });
  // Nobody is notified of their own comment.
  expect((await notes(owner)).unread).toBe(0);

  const queued = await sentMail();
  expect(queued).toEqual([
    expect.objectContaining({
      to: "rob@example.com",
      body: expect.stringContaining(`https://req.example.com/projects/${projectId}/items/${id}`),
    }),
  ]);
  const sent: string[] = [];
  const mailer: Mailer = { send: async (m) => void sent.push(m.to) };
  expect(await sendDue(db, mailer)).toBe(1);
  expect(await sendDue(db, mailer)).toBe(0);
  expect(sent).toEqual(["rob@example.com"]);

  expect((await post("/api/notifications/read", {}, rob.cookie)).json()).toEqual({ marked: 1 });
  expect((await notes(rob.cookie)).unread).toBe(0);
});

test("a failed email is kept and tried again later", async () => {
  const { owner, person, item } = await setup();
  await person("Rob", "reviewer");
  await post(`/api/items/${await item("A")}/comments`, { body: "@Rob" }, owner);
  const broken: Mailer = { send: async () => Promise.reject(new Error("connection refused")) };
  expect(await sendDue(db, broken)).toBe(0);
  const [row] = await sentMail();
  expect(row).toMatchObject({ attempts: 1, sentAt: null, lastError: expect.stringContaining("connection refused") });
  // Not due again straight away; due after the backoff.
  const ok: Mailer = { send: async () => {} };
  expect(await sendDue(db, ok)).toBe(0);
  expect(await sendDue(db, ok, new Date(Date.now() + 2 * 60_000))).toBe(1);
});

test("people on the daily digest get one email for what is unread, and nothing per event", async () => {
  const { owner, person, item } = await setup();
  const rob = await person("Rob", "reviewer");
  await app.inject({
    method: "PATCH",
    url: "/api/account",
    payload: { emailNotifications: "digest" },
    headers: { cookie: rob.cookie },
  });
  const id = await item("A");
  await post(`/api/items/${id}/comments`, { body: "@Rob one" }, owner);
  await post(`/api/items/${id}/comments`, { body: "@Rob two" }, owner);
  expect(await sentMail()).toEqual([]);
  // The digest covers a day: none is due until a day after the setting was chosen.
  expect(await queueDigests(db, mail)).toBe(0);
  const tomorrow = new Date(Date.now() + 86_400_000 + 1000);
  expect(await queueDigests(db, mail, tomorrow)).toBe(1);
  const [digest] = await sentMail();
  expect(digest).toMatchObject({ to: "rob@example.com", subject: "2 new notifications" });
  expect(await queueDigests(db, mail, tomorrow)).toBe(0);
});

test("a review invitation and a run assignment notify the people concerned", async () => {
  const { owner, projectId, sets, person, item, notes } = await setup();
  const rob = await person("Rob", "reviewer");
  await item("A");
  const baselineId = (await post(`/api/projects/${projectId}/baselines`, { name: "B" }, owner)).json().id;
  const reviewId = (
    await post(`/api/projects/${projectId}/reviews`, { name: "R1", baselineId, approvers: [rob.id] }, owner)
  ).json().id;
  expect((await notes(rob.cookie)).notifications[0]).toMatchObject({
    kind: "review",
    text: "Admin asked you to approve “R1”",
    path: `/projects/${projectId}/reviews/${reviewId}`,
  });

  const test1 = (await post(`/api/sets/${sets[2].id}/nodes`, { kind: "item", name: "T" }, owner)).json().node.id;
  const plan = (await post(`/api/projects/${projectId}/test-plans`, { name: "Plan" }, owner)).json().id;
  await post(`/api/test-plans/${plan}/cases`, { itemIds: [test1] }, owner);
  const cycle = (await post(`/api/test-plans/${plan}/cycles`, { name: "C1" }, owner)).json().id;
  const runId = (await get(`/api/test-cycles/${cycle}`, owner)).json().runs[0].id;
  const assign = () => post(`/api/test-cycles/${cycle}/assign`, { runIds: [runId], assigneeId: rob.id }, owner);
  expect((await assign()).statusCode).toBe(200);
  await assign();
  const runs = (await notes(rob.cookie)).notifications.filter((n: { kind: string }) => n.kind === "run");
  expect(runs).toEqual([
    expect.objectContaining({
      text: "Admin assigned you a test run in C1",
      path: `/projects/${projectId}/runs/${runId}`,
    }),
  ]);
});

test("whoever saved the far end of a relationship hears when it becomes suspect, once", async () => {
  const { owner, projectId, person, item, save, notes } = await setup();
  const anna = await person("Anna", "editor");
  const need = await item("Need");
  const req = await item("Req", anna.cookie);
  const typeId = (await get(`/api/projects/${projectId}/links`, owner)).json().linkTypes[0].id;
  await post("/api/links", { upstreamId: need, downstreamId: req, typeId }, owner);

  await save(need, 1, "Need v2");
  const suspect = (await notes(anna.cookie)).notifications;
  expect(suspect).toEqual([
    expect.objectContaining({
      kind: "suspect",
      text: "Admin changed SYS-001 Need v2. Its relationship with SYS-002 Req, which you saved last, is now suspect.",
      path: `/projects/${projectId}/items/${req}`,
    }),
  ]);
  // Already suspect: a further change says nothing new.
  await save(need, 2, "Need v3");
  expect((await notes(anna.cookie)).notifications).toHaveLength(1);
  // Still suspect, so Anna changing her own end tells the admin nothing new either.
  await save(req, 1, "Req v2", anna.cookie);
  expect((await notes(owner)).notifications).toEqual([]);
});

test("forgot password emails a one-time link that sets a new password and ends other sessions", async () => {
  const { owner } = await setup();
  expect((await post("/api/password/forgot", { email: "nobody@example.com" })).json()).toEqual({ ok: true });
  expect(await sentMail()).toEqual([]);

  expect((await post("/api/password/forgot", { email: "ADMIN@example.com" })).json()).toEqual({ ok: true });
  const [email] = await sentMail();
  const token = /reset-password\/(\S+)/.exec(email?.body ?? "")?.[1] as string;
  expect(email?.to).toBe("admin@example.com");
  expect((await get(`/api/password/reset/${token}`)).json()).toEqual({ email: "admin@example.com" });

  expect((await post("/api/password/reset", { token, password: "short" })).statusCode).toBe(400);
  const reset = await post("/api/password/reset", { token, password: "a brand new password" });
  expect(reset.statusCode).toBe(200);
  expect((await get("/api/session", cookieOf(reset))).json().user.email).toBe("admin@example.com");
  expect((await get("/api/projects", owner)).statusCode).toBe(401);
  expect((await post("/api/password/reset", { token, password: "another new password" })).statusCode).toBe(404);
  expect((await post("/api/login", { email: admin.email, password: "a brand new password" })).statusCode).toBe(200);
  expect((await post("/api/login", { email: admin.email, password: admin.password })).statusCode).toBe(401);
});

test("an expired reset link does not work, and without email forgot password says so", async () => {
  await setup();
  await post("/api/password/forgot", { email: admin.email });
  const token = /reset-password\/(\S+)/.exec((await sentMail())[0]?.body ?? "")?.[1] as string;
  await db.execute(sql`update password_resets set expires_at = now() - interval '1 second'`);
  expect((await get(`/api/password/reset/${token}`)).statusCode).toBe(404);
  expect((await post("/api/password/reset", { token, password: "a brand new password" })).statusCode).toBe(404);

  const noMail = await buildApp(db);
  const res = await noMail.inject({ method: "POST", url: "/api/password/forgot", payload: { email: admin.email } });
  expect(res.statusCode).toBe(404);
  await noMail.close();
});

test("an administrator makes a reset link for someone; nobody else can", async () => {
  const { owner, person } = await setup();
  const rob = await person("Rob", "reviewer");
  const made = await post(`/api/users/${rob.id}/password-reset`, {}, owner);
  expect(made.statusCode).toBe(201);
  expect(made.json()).toMatchObject({ emailed: true, token: expect.any(String) });
  expect((await sentMail())[0]).toMatchObject({ to: "rob@example.com", subject: "Set a new password" });
  expect((await post(`/api/users/${rob.id}/password-reset`, {}, rob.cookie)).statusCode).toBe(403);
  const used = await post("/api/password/reset", { token: made.json().token, password: "rob's new password" });
  expect(used.json().user.email).toBe("rob@example.com");
});

test("invitations are emailed when email is set up", async () => {
  const { owner } = await setup();
  const invited = (await post("/api/invitations", { email: "new@example.com" }, owner)).json();
  expect(invited.emailed).toBe(true);
  expect((await sentMail())[0]).toMatchObject({
    to: "new@example.com",
    body: expect.stringContaining(`https://req.example.com/invite/${invited.token}`),
  });
});
