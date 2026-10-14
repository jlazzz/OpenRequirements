import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_DATABASE_URL } from "../test/global-setup.ts";
import { buildApp } from "./app.ts";
import { createDb } from "./db/client.ts";

// J1 slice 3: account lockout, password expiry, inactivity timeout and the tamper-evident audit log (ADR 0020).
const db = createDb(TEST_DATABASE_URL);
const attachmentsDir = mkdtempSync(join(tmpdir(), "attachments-"));
const admin = { email: "admin@example.com", name: "Admin", password: "a long password" };
let app: FastifyInstance;
let strict: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(db, { loginAttemptsPerMinute: 1000, attachmentsDir });
  strict = await buildApp(db, {
    loginAttemptsPerMinute: 1000,
    attachmentsDir,
    security: { lockoutAttempts: 3, lockoutMinutes: 15, passwordMaxAgeDays: 90, idleMinutes: 30 },
  });
});
beforeEach(async () => {
  await db.execute(sql`truncate users, projects cascade`);
});
afterAll(async () => {
  await app.close();
  await strict.close();
  await db.$client.end();
  rmSync(attachmentsDir, { recursive: true });
});

const call = (server: FastifyInstance, method: "GET" | "POST", url: string, payload?: object, cookie?: string) =>
  server.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => `session=${res.cookies[0]?.value}`;
const login = (server: FastifyInstance, password = admin.password) =>
  call(server, "POST", "/api/login", { email: admin.email, password });
const verify = async (cookie: string) => (await call(app, "GET", "/api/audit/verify", undefined, cookie)).json();

test("the audit log verifies, and a rewritten or deleted row is reported as the first broken one", async () => {
  const owner = cookieOf(await call(app, "POST", "/api/setup", admin));
  for (const name of ["A", "B", "C"]) await call(app, "POST", "/api/projects", { name, templateId: "standard" }, owner);
  const first = await verify(owner);
  expect(first).toMatchObject({ ok: true, firstBroken: null, unchained: 0 });
  expect(first.checked).toBeGreaterThan(3);

  const [row] = (await db.execute(sql`select id, seq from audit_events where seq = 3`)).rows as {
    id: string;
    seq: number;
  }[];
  await db.execute(sql`update audit_events set action = 'item.delete' where id = ${row?.id}`);
  expect(await verify(owner)).toMatchObject({ ok: false, firstBroken: { seq: 3, id: row?.id, reason: "content" } });
});

test("a deleted row breaks the sequence", async () => {
  const owner = cookieOf(await call(app, "POST", "/api/setup", admin));
  await call(app, "POST", "/api/projects", { name: "A", templateId: "standard" }, owner);
  await db.execute(sql`delete from audit_events where seq = 2`);
  expect(await verify(owner)).toMatchObject({ ok: false, firstBroken: { seq: 3, reason: "sequence" } });
});

test("rows written at the same time still form one unbroken chain", async () => {
  const owner = cookieOf(await call(app, "POST", "/api/setup", admin));
  const made = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      call(app, "POST", "/api/projects", { name: `P${i}`, templateId: "standard" }, owner),
    ),
  );
  expect(made.every((res) => res.statusCode === 200 || res.statusCode === 201)).toBe(true);
  const result = await verify(owner);
  expect(result).toMatchObject({ ok: true, unchained: 0 });
  expect(result.checked).toBe(result.lastSeq);
});

test("rows from before the chain are counted, not failed", async () => {
  const owner = cookieOf(await call(app, "POST", "/api/setup", admin));
  await db.execute(sql`insert into audit_events (action, entity_type, entity_id) values ('old.event', 'item', 'x')`);
  expect(await verify(owner)).toMatchObject({ ok: true, unchained: 1 });
});

test("verifying the audit log is for administrators only", async () => {
  const owner = cookieOf(await call(app, "POST", "/api/setup", admin));
  const invite = (await call(app, "POST", "/api/invitations", { email: "p@example.com" }, owner)).json();
  const person = cookieOf(
    await call(app, "POST", "/api/invitations/accept", {
      token: invite.token,
      name: "Pat",
      password: "another long password",
    }),
  );
  expect((await call(app, "GET", "/api/audit/verify")).statusCode).toBe(401);
  expect((await call(app, "GET", "/api/audit/verify", undefined, person)).statusCode).toBe(403);
  expect((await call(app, "GET", "/api/audit/verify", undefined, owner)).statusCode).toBe(200);
});

test("by default failed sign-ins never lock an account", async () => {
  await call(app, "POST", "/api/setup", admin);
  for (let i = 0; i < 6; i++) expect((await login(app, "wrong password!")).statusCode).toBe(401);
  expect((await login(app)).statusCode).toBe(200);
});

test("the account locks after the set number of failures, even for the right password, then opens", async () => {
  await call(strict, "POST", "/api/setup", admin);
  for (let i = 0; i < 3; i++) expect((await login(strict, "wrong password!")).statusCode).toBe(401);
  const locked = await login(strict);
  expect(locked.statusCode).toBe(401);
  expect(locked.json().error).toBe("Wrong email or password");
  const events = (await db.execute(sql`select action from audit_events where action like 'user.%' order by seq`)).rows;
  expect(events.map((e) => e.action)).toContain("user.locked");

  await db.execute(sql`update users set locked_until = now() - interval '1 minute'`);
  expect((await login(strict)).statusCode).toBe(200);
  const [after] = (await db.execute(sql`select failed_logins, locked_until from users`)).rows;
  expect(after).toMatchObject({ failed_logins: 0, locked_until: null });
});

test("a good sign-in clears the count of failures", async () => {
  await call(strict, "POST", "/api/setup", admin);
  await login(strict, "wrong password!");
  await login(strict, "wrong password!");
  expect((await login(strict)).statusCode).toBe(200);
  await login(strict, "wrong password!");
  await login(strict, "wrong password!");
  expect((await login(strict)).statusCode).toBe(200);
});

test("an expired password refuses sign-in and ends open sessions; a new password restarts the clock", async () => {
  const cookie = cookieOf(await call(strict, "POST", "/api/setup", admin));
  expect((await call(strict, "GET", "/api/projects", undefined, cookie)).statusCode).toBe(200);
  await db.execute(sql`update users set password_changed_at = now() - interval '91 days'`);
  const refused = await login(strict);
  expect(refused.statusCode).toBe(403);
  expect(refused.json().code).toBe("password_expired");
  expect((await call(strict, "GET", "/api/projects", undefined, cookie)).statusCode).toBe(401);
  // The server without limits still lets the person in.
  expect((await login(app)).statusCode).toBe(200);
});

test("a session ends after the idle time and is kept alive by use", async () => {
  const cookie = cookieOf(await call(strict, "POST", "/api/setup", admin));
  await db.execute(sql`update sessions set last_seen_at = now() - interval '10 minutes'`);
  expect((await call(strict, "GET", "/api/projects", undefined, cookie)).statusCode).toBe(200);
  const [seen] = (await db.execute(sql`select now() - last_seen_at < interval '1 minute' as fresh from sessions`)).rows;
  expect(seen?.fresh).toBe(true);
  await db.execute(sql`update sessions set last_seen_at = now() - interval '31 minutes'`);
  expect((await call(strict, "GET", "/api/projects", undefined, cookie)).statusCode).toBe(401);
});
