import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { textToDoc } from "@app/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_DATABASE_URL } from "../test/global-setup.ts";
import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { externalReferences, integrations, webhookDeliveries } from "./db/schema.ts";
import { refreshReferences } from "./references.ts";
import { deliverDue, signBody } from "./webhooks.ts";

// Bundle H: OpenAPI, tokens, webhooks, external references, connections, code references and OpenID Connect.
const db = createDb(TEST_DATABASE_URL);
let app: FastifyInstance;
const admin = { email: "admin@example.com", name: "Admin", password: "a long password" };
const outbound = { allowPrivate: true, integrationKey: "test key" };

/** A local HTTP server that records what it is sent and answers with `answer`. Stands in for webhook receivers, GitHub and the identity provider. */
type Seen = { method: string; url: string; headers: IncomingMessage["headers"]; body: string };
let seen: Seen[] = [];
let answer: (req: Seen) => { status?: number; json?: unknown } = () => ({});
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const entry = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body };
      seen.push(entry);
      const { status = 200, json = {} } = answer(entry);
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  app = await buildApp(db, {
    loginAttemptsPerMinute: 1000,
    outbound,
    mail: { enabled: false, publicUrl: "http://req.local" },
    oidc: { issuer: base, clientId: "req-app", clientSecret: "s3cret", name: "Acme ID" },
  });
});
beforeEach(async () => {
  await db.execute(sql`truncate users, projects, webhooks, webhook_deliveries, integrations cascade`);
  seen = [];
  answer = () => ({});
});
afterAll(async () => {
  await app.close();
  await db.$client.end();
  server.close();
});

const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {} });
const get = (url: string, cookie?: string) => app.inject({ method: "GET", url, headers: cookie ? { cookie } : {} });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
  `session=${res.cookies.find((c) => c.name === "session")?.value}`;

async function setup() {
  const owner = cookieOf(await post("/api/setup", admin));
  const { project } = (await post("/api/projects", { name: "P", templateId: "standard" }, owner)).json();
  const detail = (await get(`/api/projects/${project.id}`, owner)).json();
  const person = async (name: string, role: "viewer" | "editor") => {
    const email = `${name.toLowerCase()}@example.com`;
    await db.execute(
      sql`insert into users (email, name, password_hash) select ${email}, ${name}, password_hash from users where is_admin`,
    );
    await db.execute(
      sql`insert into project_members (project_id, user_id, role) select ${project.id}, id, ${role} from users where email = ${email}`,
    );
    return cookieOf(await post("/api/login", { email, password: admin.password }));
  };
  const item = async (name: string) =>
    (await post(`/api/sets/${detail.sets[1].id}/nodes`, { kind: "item", name }, owner)).json().node as {
      id: string;
      uid: string;
    };
  return { owner, projectId: project.id as string, person, item };
}

// @req VER-039
test("the API is described as OpenAPI, and docs/openapi.json is up to date", async () => {
  const res = await get("/api/openapi.json");
  expect(res.statusCode).toBe(200);
  const doc = res.json();
  expect(doc.paths["/api/items/{itemId}/references"].post.requestBody).toBeDefined();
  expect(doc.paths["/api/session"].get.security).toEqual([]);
  // OpenID Connect is switched on in this app only; the committed file describes a server without it.
  const plain = await buildApp(db);
  const current = `${JSON.stringify((await plain.inject({ url: "/api/openapi.json" })).json(), null, 2)}\n`;
  await plain.close();
  const file = new URL("../../../docs/openapi.json", import.meta.url);
  if (process.env.UPDATE_OPENAPI) writeFileSync(file, current);
  expect(readFileSync(file, "utf8"), "docs/openapi.json is stale: run npm run openapi").toBe(current);
});

test("an access token can expire, and records when it was last used", async () => {
  const { owner } = await setup();
  const made = (await post("/api/tokens", { name: "CI", expiresInDays: 30 }, owner)).json();
  expect(new Date(made.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  const bearer = { authorization: `Bearer ${made.token}` };
  expect((await app.inject({ url: "/api/projects", headers: bearer })).statusCode).toBe(200);
  const [listed] = (await get("/api/tokens", owner)).json().tokens;
  expect(listed.lastUsedAt).not.toBeNull();

  await db.execute(sql`update api_tokens set expires_at = now() - interval '1 second'`);
  expect((await app.inject({ url: "/api/projects", headers: bearer })).statusCode).toBe(401);
  expect((await post("/api/tokens", { name: "x", expiresInDays: 0 }, owner)).statusCode).toBe(400);
});

test("a webhook fires on a save, signed with its secret, and failures are tried again later", async () => {
  const { owner, projectId, person, item } = await setup();
  const editor = await person("Eve", "editor");
  expect((await post(`/api/projects/${projectId}/webhooks`, { url: `${base}/hook` }, editor)).statusCode).toBe(403);
  const made = await post(`/api/projects/${projectId}/webhooks`, { url: `${base}/hook`, events: ["item"] }, owner);
  expect(made.statusCode).toBe(201);
  const { id: webhookId, secret } = made.json();
  expect(secret).toMatch(/^whsec_/);

  const { id } = await item("Pump");
  await post(
    `/api/items/${id}/revisions`,
    { baseRevision: 1, name: "Pump 2", description: textToDoc(""), attributes: {} },
    owner,
  );
  expect(await deliverDue(db, true)).toBe(2);
  expect(seen.map((s) => JSON.parse(s.body).event)).toEqual(["item.create", "item.revise"]);
  const [, saved] = seen;
  expect(saved?.headers["x-webhook-event"]).toBe("item.revise");
  expect(saved?.headers["x-webhook-signature-256"]).toBe(signBody(secret, saved?.body ?? ""));
  expect(JSON.parse(saved?.body ?? "")).toMatchObject({
    projectId,
    entityId: id,
    label: expect.stringContaining("Pump 2"),
  });

  // A link is not an "item" event: nothing is queued for it. A receiver that fails gets the delivery again later.
  answer = () => ({ status: 500 });
  expect((await post(`/api/webhooks/${webhookId}/ping`, {}, owner)).statusCode).toBe(201);
  expect(await deliverDue(db, true)).toBe(0);
  const deliveries = (await get(`/api/webhooks/${webhookId}/deliveries`, owner)).json().deliveries;
  expect(deliveries[0]).toMatchObject({ event: "ping", attempts: 1, statusCode: 500, deliveredAt: null });
  answer = () => ({});
  expect(await deliverDue(db, true)).toBe(0);
  expect(await deliverDue(db, true, new Date(Date.now() + 61_000))).toBe(1);

  // Deleted: nothing more is queued.
  expect(
    (await app.inject({ method: "DELETE", url: `/api/webhooks/${webhookId}`, headers: { cookie: owner } })).statusCode,
  ).toBe(200);
  await item("Another");
  expect(await db.$count(webhookDeliveries)).toBe(3);
  expect((await get(`/api/projects/${projectId}/webhooks`, owner)).json().webhooks).toEqual([]);
});

test("webhooks and connections refuse addresses on private networks unless allowed", async () => {
  const strict = await buildApp(db, { loginAttemptsPerMinute: 1000 });
  const owner = cookieOf(await strict.inject({ method: "POST", url: "/api/setup", payload: admin }));
  const { project } = (
    await strict.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "P", templateId: "standard" },
      headers: { cookie: owner },
    })
  ).json();
  for (const url of [`${base}/hook`, "http://169.254.169.254/latest", "http://[::1]/x", "ftp://example.com/x"]) {
    const res = await strict.inject({
      method: "POST",
      url: `/api/projects/${project.id}/webhooks`,
      payload: { url },
      headers: { cookie: owner },
    });
    expect(res.statusCode, url).toBe(400);
  }
  const connection = await strict.inject({
    method: "POST",
    url: `/api/projects/${project.id}/integrations`,
    payload: { kind: "jira", baseUrl: "http://10.0.0.5/jira" },
    headers: { cookie: owner },
  });
  expect(connection.json().error).toMatch(/private network/);
  // A webhook made while private addresses were allowed is still not delivered there once they are not.
  const hook = (await post(`/api/projects/${project.id}/webhooks`, { url: `${base}/hook` }, owner)).json();
  expect(hook.id).toBeDefined();
  expect(await deliverDue(db, false)).toBe(0);
  expect(seen).toEqual([]);
  await strict.close();
});

test("an item has references to other tools, and editors add and remove them", async () => {
  const { owner, person, item } = await setup();
  const viewer = await person("Vic", "viewer");
  const { id } = await item("Pump");
  const url = "https://acme.atlassian.net/browse/PUMP-12";
  expect((await post(`/api/items/${id}/references`, { url }, viewer)).statusCode).toBe(403);
  expect((await post(`/api/items/${id}/references`, { url: "javascript:alert(1)" }, owner)).statusCode).toBe(400);
  const made = await post(`/api/items/${id}/references`, { url, title: "Alarm too quiet" }, owner);
  expect(made.statusCode).toBe(201);
  await post(`/api/items/${id}/references`, { url: "https://github.com/acme/pump/pull/4" }, owner);
  const list = (await get(`/api/items/${id}/references`, viewer)).json().references;
  expect(list.map((r: { kind: string }) => r.kind)).toEqual(["jira", "github"]);
  expect(list[0]).toMatchObject({ title: "Alarm too quiet", state: null });

  const remove = (cookie: string) =>
    app.inject({ method: "DELETE", url: `/api/references/${made.json().id}`, headers: { cookie } });
  expect((await remove(viewer)).statusCode).toBe(403);
  expect((await remove(owner)).statusCode).toBe(200);
  expect((await remove(owner)).statusCode).toBe(404);
  expect((await get(`/api/items/${id}/references`, owner)).json().references).toHaveLength(1);
  const activity = (await db.execute(sql`select action from audit_events order by at`)).rows.map((r) => r.action);
  expect(activity).toEqual(expect.arrayContaining(["reference.create", "reference.delete"]));
});

test("a connection reads the title and state of references, with its token stored encrypted", async () => {
  const { owner, projectId, item } = await setup();
  const { id } = await item("Pump");
  // The test server plays a GitHub Enterprise at `base`.
  await post(`/api/items/${id}/references`, { url: `${base}/acme/pump/issues/7` }, owner);
  await post(`/api/items/${id}/references`, { url: "https://example.com/elsewhere" }, owner);
  const made = await post(
    `/api/projects/${projectId}/integrations`,
    { kind: "github", baseUrl: `${base}/`, token: "ghp_secret" },
    owner,
  );
  expect(made.statusCode).toBe(201);
  const [stored] = await db.select().from(integrations);
  expect(stored?.token).not.toContain("ghp_secret");
  expect(stored?.baseUrl).toBe(base);
  expect((await get(`/api/projects/${projectId}/integrations`, owner)).json()).toMatchObject({
    tokens: true,
    integrations: [{ kind: "github", baseUrl: base, hasToken: true }],
  });

  answer = () => ({ json: { title: "Pump stalls", state: "closed" } });
  expect((await post(`/api/items/${id}/references/refresh`, {}, owner)).json()).toEqual({ read: 1 });
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ url: "/api/v3/repos/acme/pump/issues/7" });
  expect(seen[0]?.headers.authorization).toBe("Bearer ghp_secret");
  const refs = (await get(`/api/items/${id}/references`, owner)).json().references;
  expect(refs[0]).toMatchObject({ title: "Pump stalls", state: "closed", kind: "github" });
  expect(refs[1]).toMatchObject({ state: null });
  expect(refs[1].checkedAt).not.toBeNull();

  // The worker reads only what was not read in the last 15 minutes.
  expect(await refreshReferences(db, outbound)).toBe(0);
  expect(await refreshReferences(db, outbound, { now: new Date(Date.now() + 16 * 60_000) })).toBe(1);

  const keyless = await buildApp(db, { outbound: { allowPrivate: true } });
  const res = await keyless.inject({
    method: "POST",
    url: `/api/projects/${projectId}/integrations`,
    payload: { kind: "jira", baseUrl: base, token: "x" },
    headers: { cookie: owner },
  });
  expect(res.json().error).toMatch(/INTEGRATION_KEY/);
  await keyless.close();
});

test("code references from the tag scanner are kept in step with the repository", async () => {
  const { owner, projectId, person, item } = await setup();
  const viewer = await person("Vic", "viewer");
  const a = await item("A");
  const b = await item("B");
  const source = "https://github.com/acme/pump";
  const sync = (references: { uid: string; url: string; title?: string }[], cookie = owner) =>
    app.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/code-references`,
      payload: { source, references },
      headers: { cookie },
    });
  const ref = (uid: string, file: string, title = `${file}:1`) => ({ uid, url: `${source}/blob/main/${file}`, title });

  expect((await sync([ref(a.uid, "a.c")], viewer)).statusCode).toBe(403);
  const first = await sync([ref(a.uid, "a.c"), ref(b.uid, "b.c"), ref("SYS-999", "x.c")]);
  expect(first.json()).toEqual({ added: 2, updated: 0, removed: 0, unknown: ["SYS-999"] });
  const again = await sync([ref(a.uid, "a.c", "a.c:9"), ref(b.uid, "b.c")]);
  expect(again.json()).toEqual({ added: 0, updated: 1, removed: 0, unknown: [] });
  expect((await sync([ref(a.uid, "a.c", "a.c:9")])).json()).toEqual({ added: 0, updated: 0, removed: 1, unknown: [] });

  // A reference added by hand is never touched by the scanner.
  await post(`/api/items/${b.id}/references`, { url: `${source}/issues/1` }, owner);
  await sync([]);
  expect((await get(`/api/items/${b.id}/references`, owner)).json().references).toEqual([
    expect.objectContaining({ kind: "github", source: null }),
  ]);
  const live = await db.select().from(externalReferences);
  expect(live.filter((r) => r.kind === "code" && !r.deletedAt)).toEqual([]);
  const events = (await db.execute(sql`select action from audit_events where action = 'reference.sync'`)).rows;
  expect(events).toHaveLength(4);
});

/** Plays a browser through the identity provider: starts at `start`, answers the provider's redirect, follows the callback. */
async function signInThroughProvider(claims: object, start = "/api/oidc/login?returnTo=/projects", cookie?: string) {
  const began = await app.inject({ url: start, headers: cookie ? { cookie } : {} });
  expect(began.statusCode).toBe(302);
  const to = new URL(began.headers.location as string);
  const params = Object.fromEntries(to.searchParams);
  const pending = began.cookies.find((c) => c.name === "oidc");
  answer = (req) => {
    if (req.url === "/.well-known/openid-configuration") return { json: discovery() };
    const form = new URLSearchParams(req.body);
    const verifier = form.get("code_verifier") ?? "";
    // The provider checks PKCE, as a real one does.
    if (createHash("sha256").update(verifier).digest("base64url") !== params.code_challenge) return { status: 400 };
    const token = { iss: base, aud: "req-app", exp: Date.now() / 1000 + 300, nonce: params.nonce, ...claims };
    return {
      json: { id_token: `x.${Buffer.from(JSON.stringify(token)).toString("base64url")}.y`, access_token: "at" },
    };
  };
  const callback = await app.inject({
    url: `/api/oidc/callback?code=c1&state=${params.state}`,
    headers: { cookie: [cookie, pending && `oidc=${pending.value}`].filter(Boolean).join("; ") },
  });
  return { began, params, callback };
}
const discovery = () => ({
  issuer: base,
  authorization_endpoint: `${base}/authorize`,
  token_endpoint: `${base}/token`,
});

test("signing in through the identity provider makes the account the first time, then reuses it", async () => {
  answer = () => ({ json: discovery() });
  const owner = cookieOf(await post("/api/setup", admin));
  expect((await get("/api/session")).json()).toMatchObject({ sso: "Acme ID" });

  const { params, callback } = await signInThroughProvider({
    email: "Sam@Example.com",
    email_verified: true,
    name: "Sam",
  });
  expect(params).toMatchObject({
    client_id: "req-app",
    redirect_uri: "http://req.local/api/oidc/callback",
    code_challenge_method: "S256",
  });
  expect(params.prompt).toBeUndefined();
  expect(callback.statusCode).toBe(302);
  expect(callback.headers.location).toBe("/projects");
  const sam = cookieOf(callback);
  expect((await get("/api/session", sam)).json()).toMatchObject({
    user: { email: "sam@example.com", name: "Sam" },
    password: false,
  });
  // Without a password, the account cannot sign in with one.
  expect((await post("/api/login", { email: "sam@example.com", password: "none" })).statusCode).toBe(401);

  // The second time, and for an account that has a password, the same account is used.
  expect(cookieOf((await signInThroughProvider({ email: "sam@example.com", email_verified: true })).callback)).not.toBe(
    sam,
  );
  const again = await signInThroughProvider({ email: admin.email, email_verified: "true" });
  expect((await get("/api/session", cookieOf(again.callback))).json().user.isAdmin).toBe(true);
  const people = (await get("/api/users", owner)).json().users;
  expect(people).toHaveLength(2);
});

test("a sign-in through the identity provider is refused when anything does not match", async () => {
  answer = () => ({ json: discovery() });
  await post("/api/setup", admin);
  const refused = async (claims: object) => (await signInThroughProvider(claims)).callback;
  expect((await refused({ email: "a@example.com" })).body).toMatch(/verified email/);
  expect((await refused({ email: "a@example.com", email_verified: true, aud: "other" })).body).toMatch(
    /another client/,
  );
  expect((await refused({ email: "a@example.com", email_verified: true, nonce: "x" })).body).toMatch(/this sign-in/);
  expect((await refused({ email: "a@example.com", email_verified: true, iss: "https://evil" })).body).toMatch(/issuer/);
  await db.execute(sql`update users set deactivated_at = now()`);
  expect((await refused({ email: admin.email, email_verified: true })).body).toMatch(/deactivated/);

  // A callback without the cookie of its own start, or with another state, is refused.
  const { params } = await signInThroughProvider({ email: "a@example.com", email_verified: true });
  expect((await get(`/api/oidc/callback?code=c&state=${params.state}`)).statusCode).toBe(400);
  // returnTo can only be a path on this site.
  const away = await app.inject({ url: "/api/oidc/login?returnTo=//evil.example" });
  expect(away.statusCode).toBe(302);
  const ok = await signInThroughProvider(
    { email: "b@example.com", email_verified: true },
    "/api/oidc/login?returnTo=//evil.example",
  );
  expect(ok.callback.headers.location).toBe("/");
});

test("an approver without a password signs a review by signing in again at the provider", async () => {
  answer = () => ({ json: discovery() });
  const owner = cookieOf(await post("/api/setup", admin));
  const sam = cookieOf((await signInThroughProvider({ email: "sam@example.com", email_verified: true })).callback);
  const samId = (await get("/api/session", sam)).json().user.id;
  const { project } = (await post("/api/projects", { name: "P", templateId: "standard" }, owner)).json();
  await app.inject({
    method: "PUT",
    url: `/api/projects/${project.id}/members/${samId}`,
    payload: { role: "reviewer" },
    headers: { cookie: owner },
  });
  const detail = (await get(`/api/projects/${project.id}`, owner)).json();
  const itemId = (await post(`/api/sets/${detail.sets[1].id}/nodes`, { kind: "item", name: "A" }, owner)).json().node
    .id;
  const baselineId = (await post(`/api/projects/${project.id}/baselines`, { name: "B" }, owner)).json().id;
  const reviewId = (
    await post(`/api/projects/${project.id}/reviews`, { name: "R", baselineId, approvers: [samId] }, owner)
  ).json().id;
  await post(`/api/reviews/${reviewId}/marks`, { itemIds: [itemId], mark: "approved" }, sam);

  // Without confirming first, signing is refused, and the attempt recorded.
  expect((await post(`/api/reviews/${reviewId}/sign`, {}, sam)).json().error).toMatch(/identity provider/);

  // Confirmed as someone else: refused.
  const wrong = await signInThroughProvider(
    { email: admin.email, email_verified: true, auth_time: Math.floor(Date.now() / 1000) },
    `/api/oidc/reauth?returnTo=/projects/${project.id}/reviews/${reviewId}`,
    sam,
  );
  expect(wrong.callback.body).toMatch(/not the person/);
  // The provider did not ask for the password again: refused.
  const stale = await signInThroughProvider(
    { email: "sam@example.com", email_verified: true, auth_time: Math.floor(Date.now() / 1000) - 3600 },
    "/api/oidc/reauth",
    sam,
  );
  expect(stale.callback.body).toMatch(/password again/);

  const fresh = await signInThroughProvider(
    { email: "sam@example.com", email_verified: true, auth_time: Math.floor(Date.now() / 1000) },
    `/api/oidc/reauth?returnTo=/projects/${project.id}/reviews/${reviewId}`,
    sam,
  );
  expect(fresh.params).toMatchObject({ prompt: "login", max_age: "0" });
  expect(fresh.callback.headers.location).toBe(`/projects/${project.id}/reviews/${reviewId}`);
  const signed = await post(`/api/reviews/${reviewId}/sign`, {}, sam);
  expect(signed.statusCode).toBe(201);
  expect(signed.json()).toMatchObject({ meaning: "approval" });
  const actions = (await db.execute(sql`select action from audit_events order by at`)).rows.map((r) => r.action);
  expect(actions).toEqual(expect.arrayContaining(["review.sign.failed", "session.reauth", "review.sign.approval"]));
});
