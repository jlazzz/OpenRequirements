import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { audit, createAccess, whereFromParams } from "./access.ts";
import { attachmentRoutes } from "./attachments.ts";
import { type AnchorOptions, auditLogRoutes } from "./auditlog.ts";
import { backupRoutes } from "./backup.ts";
import { baselineRoutes } from "./baselines.ts";
import { commentRoutes } from "./comments.ts";
import type { Db } from "./db/client.ts";
import { apiTokens, sessions, users } from "./db/schema.ts";
import {
  isLocked,
  lockAfterFailure,
  NO_LIMITS,
  passwordExpired,
  type SecurityConfig,
  sessionIdle,
} from "./domain/accountsecurity.ts";
import type { ApiRoute } from "./domain/openapi.ts";
import { openApiDocument } from "./domain/openapi.ts";
import { hashPassword, NO_PASSWORD, verifyPassword } from "./domain/password.ts";
import { exportRoutes } from "./export.ts";
import { importRoutes } from "./import.ts";
import { linkRoutes } from "./links.ts";
import type { MailConfig } from "./mail.ts";
import { memberRoutes } from "./members.ts";
import { nodeRoutes } from "./nodes.ts";
import { notificationRoutes } from "./notifications.ts";
import { type OidcConfig, oidcRoutes } from "./oidc.ts";
import { projectRoutes } from "./projects.ts";
import { recoveryRoutes } from "./recovery.ts";
import { type OutboundConfig, referenceRoutes } from "./references.ts";
import { reviewRoutes } from "./reviews.ts";
import { arr, bool, components, date, id, nul, obj, ok, ref, res, str } from "./schemas.ts";
import { testPlanRoutes } from "./testplans.ts";
import { testRunRoutes } from "./testruns.ts";
import { traceRoutes } from "./trace.ts";
import { typeRoutes } from "./types.ts";
import { verificationRoutes } from "./verification.ts";
import { webhookRoutes } from "./webhooks.ts";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

type SessionUser = { id: string; email: string; name: string; isAdmin: boolean };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** What feature route files receive from buildApp. */
export type AppContext = {
  app: FastifyInstance;
  db: Db;
  /** Rejects requests that are not signed in. Every non-public route needs it in `onRequest`. */
  requireUser: Guard;
  /** Use after requireUser: rejects requests signed in with an access token, for actions that need the person themself. */
  requireSession: Guard;
  /** Use after requireUser: rejects users who are not administrators. */
  requireAdmin: Guard;
  /** Records an audit event. Call it in the same transaction as the write. */
  audit: typeof audit;
  /** Project permission check: see createAccess in access.ts. Every route about project data starts with it. */
  access: ReturnType<typeof createAccess>;
  /** Signs a user in on this reply. */
  startSession: (tx: Db | Tx, reply: FastifyReply, userId: string) => Promise<void>;
  /** Limits repeated attempts on routes that take a password or token. */
  loginLimit: { rateLimit: { max: number; timeWindow: string } };
  /** Whether email is set up, and the address links in emails start with. */
  mail: MailConfig;
  /** Served over HTTPS: cookies are `Secure`. */
  https: boolean;
  /** What webhooks and connections may call, and the key for connection tokens. */
  outbound: OutboundConfig;
  /** True once, within five minutes of this session confirming its person at the identity provider (oidc.ts). */
  takeReauth: (req: FastifyRequest) => Promise<boolean>;
};

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyInstance {
    apiRoutes: ApiRoute[];
  }
  interface FastifyContextConfig {
    /** Marks a route as reachable without signing in. Everything else must use `requireUser`. */
    public?: boolean;
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const credentials = {
  email: { type: "string", format: "email", maxLength: 254 },
  password: { type: "string", minLength: 1, maxLength: 200 },
} as const;

export async function buildApp(
  db: Db,
  opts: {
    webRoot?: string;
    /** The built user guide, served without sign-in at /help. */
    helpRoot?: string;
    logger?: boolean;
    loginAttemptsPerMinute?: number;
    attachmentsDir?: string;
    /** The largest file that can be uploaded, in megabytes. */
    maxAttachmentMb?: number;
    /** Served over HTTPS by a reverse proxy: cookies are `Secure`, HSTS is sent, and the client address comes from the proxy. */
    https?: boolean;
    /** Email is queued only when this says it is enabled; the mail loop started in main.ts sends it. */
    mail?: MailConfig;
    /** Sign-in through an identity provider. */
    oidc?: OidcConfig;
    outbound?: OutboundConfig;
    /** Account lockout, password expiry and inactivity timeout (ADR 0020). Left out: all off. */
    security?: Partial<SecurityConfig>;
    /** Signing key and file for audit chain anchors (ADR 0024). */
    anchor?: AnchorOptions;
  } = {},
) {
  const security: SecurityConfig = { ...NO_LIMITS, ...opts.security };
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.https ?? false });
  // Response schemas only describe the API (schemas.ts); they must never drop a field a route sends.
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));
  await app.register(cookie);
  // Security headers on every response. A route that sets its own, like the attachment download, keeps its own.
  const headers: Record<string, string> = {
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "cross-origin-opener-policy": "same-origin",
    ...(opts.https ? { "strict-transport-security": "max-age=31536000" } : {}),
  };
  // The guide's pages carry a few inline scripts (site data, dark mode). Only those exact scripts are allowed, by hash.
  let helpCsp = headers["content-security-policy"] ?? "";
  if (opts.helpRoot && existsSync(opts.helpRoot)) {
    const hashes = new Set<string>();
    for (const file of readdirSync(opts.helpRoot, { recursive: true, encoding: "utf8" })) {
      if (!file.endsWith(".html")) continue;
      const html = readFileSync(join(opts.helpRoot, file), "utf8");
      for (const [, body] of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
        hashes.add(
          `'sha256-${createHash("sha256")
            .update(body ?? "")
            .digest("base64")}'`,
        );
      }
    }
    helpCsp = helpCsp.replace("script-src 'self'", `script-src 'self' ${[...hashes].join(" ")}`);
  }
  app.addHook("onSend", async (req, reply) => {
    for (const [name, value] of Object.entries(headers)) if (!reply.hasHeader(name)) reply.header(name, value);
    if (req.url === "/help" || req.url.startsWith("/help/")) reply.header("content-security-policy", helpCsp);
  });
  await app.register(rateLimit, { global: false });
  app.decorateRequest("user", null);

  // Hard rule: every endpoint checks permissions. A route that is neither public nor behind requireUser fails at startup.
  const apiRoutes: ApiRoute[] = [];
  app.decorate("apiRoutes", apiRoutes);
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/")) return;
    const isPublic = route.config?.public === true;
    if (!isPublic && ![route.onRequest].flat().includes(requireUser)) {
      throw new Error(`${route.method} ${route.url} must use requireUser or be marked public`);
    }
    for (const method of [route.method].flat()) {
      apiRoutes.push({ method, url: route.url, public: isPublic, schema: route.schema as ApiRoute["schema"] });
    }
  });

  const who = { id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin };
  /** The access token a script or CI job sent, if any. A request that sends one is never read as a browser session. */
  const bearer = (req: FastifyRequest) =>
    req.headers.authorization === undefined ? null : (/^Bearer (\S+)$/.exec(req.headers.authorization)?.[1] ?? "");

  async function findUser(req: FastifyRequest): Promise<SessionUser | null> {
    const apiToken = bearer(req);
    if (apiToken !== null) {
      const now = new Date();
      const [found] = await db
        .select({ ...who, tokenId: apiTokens.id })
        .from(apiTokens)
        .innerJoin(users, eq(users.id, apiTokens.userId))
        .where(
          and(
            eq(apiTokens.tokenHash, hashToken(apiToken)),
            isNull(apiTokens.revokedAt),
            or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
            isNull(users.deactivatedAt),
          ),
        );
      if (!found) return null;
      // At most one write a minute per token, however busy the CI job.
      await db
        .update(apiTokens)
        .set({ lastUsedAt: now })
        .where(
          and(
            eq(apiTokens.id, found.tokenId),
            or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, new Date(now.getTime() - 60_000))),
          ),
        );
      const { tokenId: _, ...user } = found;
      return user;
    }
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const now = new Date();
    const [found] = await db
      .select({ ...who, lastSeenAt: sessions.lastSeenAt, changedAt: users.passwordChangedAt, hash: users.passwordHash })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now), isNull(users.deactivatedAt)));
    if (!found) return null;
    const { lastSeenAt, changedAt, hash, ...user } = found;
    if (sessionIdle(lastSeenAt, now, security)) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      return null;
    }
    // Accounts that sign in elsewhere have no password to expire.
    if (hash !== NO_PASSWORD && passwordExpired(changedAt, now, security)) return null;
    // At most one write a minute per session, however busy the screen.
    if (security.idleMinutes > 0 && now.getTime() - lastSeenAt.getTime() > 60_000) {
      await db
        .update(sessions)
        .set({ lastSeenAt: now })
        .where(eq(sessions.tokenHash, hashToken(token)));
    }
    return user;
  }

  async function requireUser(req: FastifyRequest, reply: FastifyReply) {
    req.user = await findUser(req);
    if (!req.user) return reply.code(401).send({ error: "Not signed in" });
  }

  // A leaked token must not be able to change the password or make itself a replacement.
  async function requireSession(req: FastifyRequest, reply: FastifyReply) {
    if (bearer(req) !== null) return reply.code(403).send({ error: "Sign in with your password to do this" });
  }

  async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
    if (!req.user?.isAdmin) return reply.code(403).send({ error: "Administrators only" });
  }

  async function startSession(tx: Db | Tx, reply: FastifyReply, userId: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await tx.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
    await audit(tx, userId, "session.create", "user", userId);
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      expires: expiresAt,
      // Plain HTTP stays possible for local use; behind HTTPS the cookie is never sent unencrypted.
      secure: opts.https ?? false,
    });
  }

  const loginLimit = { rateLimit: { max: opts.loginAttemptsPerMinute ?? 10, timeWindow: "1 minute" } };

  const mail = opts.mail ?? { enabled: false, publicUrl: "http://localhost:3000" };

  // The release this server runs, read from the root package.json: the one source of the version (ADR 0020).
  const version: string = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;
  app.get("/api/version", { config: { public: true }, schema: { response: res(obj({ version: str })) } }, async () => ({
    version,
  }));

  app.get(
    "/api/session",
    {
      config: { public: true },
      schema: {
        response: res(
          obj({ user: nul(ref("User")), needsSetup: bool, mail: bool, sso: nul(str), password: bool }, [
            "user",
            "needsSetup",
            "mail",
            "sso",
          ]),
        ),
      },
    },
    async (req) => {
      const user = await findUser(req);
      const needsSetup = !user && (await db.$count(users)) === 0;
      const [own] = user ? await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)) : [];
      // `mail` tells the sign-in page whether "Forgot password" can work; `sso` names the identity provider, if there is one.
      // `password` is false for someone who signs in only through the identity provider.
      return {
        user,
        needsSetup,
        mail: mail.enabled,
        sso: opts.oidc?.name ?? null,
        ...(own ? { password: own.hash !== NO_PASSWORD } : {}),
      };
    },
  );

  // First run only: whoever reaches the server first creates the admin account.
  app.post(
    "/api/setup",
    {
      config: { public: true, ...loginLimit },
      schema: {
        response: res(obj({ user: ref("User") })),
        body: {
          type: "object",
          required: ["email", "name", "password"],
          additionalProperties: false,
          properties: {
            ...credentials,
            name: { type: "string", minLength: 1, maxLength: 100 },
            password: { ...credentials.password, minLength: 12 },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { email: string; name: string; password: string };
      const passwordHash = await hashPassword(body.password);
      const user = await db.transaction(async (tx) => {
        // Serialises concurrent setup requests so only one admin can ever be created this way.
        await tx.execute(sql`select pg_advisory_xact_lock(1)`);
        if ((await tx.$count(users)) > 0) return null;
        const [created] = await tx
          .insert(users)
          .values({ email: body.email.toLowerCase(), name: body.name, passwordHash, isAdmin: true })
          .returning({ id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin });
        if (!created) throw new Error("user insert returned no row");
        await audit(tx, created.id, "user.create", "user", created.id);
        await startSession(tx, reply, created.id);
        return created;
      });
      if (!user) return reply.code(409).send({ error: "Setup is already complete" });
      return { user };
    },
  );

  app.post(
    "/api/login",
    {
      config: { public: true, ...loginLimit },
      schema: {
        response: res(obj({ user: ref("User") })),
        body: { type: "object", required: ["email", "password"], additionalProperties: false, properties: credentials },
      },
    },
    async (req, reply) => {
      const body = req.body as { email: string; password: string };
      const [row] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
      // Hash even when the user is unknown, so response time does not reveal which emails exist.
      const ok = await verifyPassword(body.password, row?.passwordHash ?? (await dummyHash));
      // A deactivated account gets the same answer as a wrong password.
      const now = new Date();
      const wrong = () => reply.code(401).send({ error: "Wrong email or password" });
      // A locked account answers like a wrong password, even for the right one, so the lock reveals nothing.
      if (!row || row.deactivatedAt || isLocked(row.lockedUntil, now)) return wrong();
      if (!ok) {
        if (security.lockoutAttempts > 0) {
          await db.transaction(async (tx) => {
            const [after] = await tx
              .update(users)
              .set({ failedLogins: sql`${users.failedLogins} + 1` })
              .where(eq(users.id, row.id))
              .returning({ failed: users.failedLogins });
            const until = lockAfterFailure(after?.failed ?? 0, now, security);
            if (until) await tx.update(users).set({ failedLogins: 0, lockedUntil: until }).where(eq(users.id, row.id));
            await audit(tx, row.id, until ? "user.locked" : "user.login_failed", "user", row.id, { label: row.email });
          });
        }
        return wrong();
      }
      if (row.passwordHash !== NO_PASSWORD && passwordExpired(row.passwordChangedAt, now, security)) {
        return reply.code(403).send({
          error: "Your password has expired. Use “Forgot password” to set a new one.",
          code: "password_expired",
        });
      }
      if (row.failedLogins > 0 || row.lockedUntil) {
        await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, row.id));
      }
      await startSession(db, reply, row.id);
      return { user: { id: row.id, email: row.email, name: row.name, isAdmin: row.isAdmin } };
    },
  );

  app.post("/api/logout", { onRequest: requireUser, schema: { response: res(ok) } }, async (req, reply) => {
    const user = req.user as SessionUser;
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(req.cookies[SESSION_COOKIE] ?? "")));
    await audit(db, user.id, "session.delete", "user", user.id);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  // Changing a password signs the user out everywhere else, so a stolen session does not survive it.
  app.post(
    "/api/account/password",
    {
      onRequest: [requireUser, requireSession],
      config: loginLimit,
      schema: {
        response: res(ok),
        body: {
          type: "object",
          required: ["current", "password"],
          additionalProperties: false,
          properties: { current: credentials.password, password: { ...credentials.password, minLength: 12 } },
        },
      },
    },
    async (req, reply) => {
      const user = req.user as SessionUser;
      const body = req.body as { current: string; password: string };
      const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
      if (!row || !(await verifyPassword(body.current, row.hash))) {
        return reply.code(400).send({ error: "The current password is wrong" });
      }
      const passwordHash = await hashPassword(body.password);
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash, passwordChangedAt: new Date() }).where(eq(users.id, user.id));
        await tx
          .delete(sessions)
          .where(
            and(eq(sessions.userId, user.id), ne(sessions.tokenHash, hashToken(req.cookies[SESSION_COOKIE] ?? ""))),
          );
        await audit(tx, user.id, "user.password", "user", user.id);
      });
      return { ok: true };
    },
  );

  // Personal access tokens, for CI and scripts. A token acts as the user who made it, with that user's roles.
  app.get(
    "/api/tokens",
    {
      onRequest: requireUser,
      schema: {
        response: res(
          obj({
            tokens: arr(obj({ id, name: str, createdAt: date, expiresAt: nul(date), lastUsedAt: nul(date) })),
          }),
        ),
      },
    },
    async (req) => ({
      tokens: await db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          createdAt: apiTokens.createdAt,
          expiresAt: apiTokens.expiresAt,
          lastUsedAt: apiTokens.lastUsedAt,
        })
        .from(apiTokens)
        .where(and(eq(apiTokens.userId, req.user?.id as string), isNull(apiTokens.revokedAt)))
        .orderBy(apiTokens.createdAt),
    }),
  );

  app.post(
    "/api/tokens",
    {
      onRequest: [requireUser, requireSession],
      schema: {
        response: res(obj({ id, name: str, token: str, expiresAt: nul(date) }), 201),
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" },
            // Left out: the token never expires.
            expiresInDays: { type: "integer", minimum: 1, maximum: 3650 },
          },
        },
      },
    },
    async (req, reply) => {
      const user = req.user as SessionUser;
      const body = req.body as { name: string; expiresInDays?: number };
      const name = body.name.trim();
      const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000) : null;
      // The prefix lets secret scanners and people recognise a leaked token.
      const token = `orq_${randomBytes(32).toString("base64url")}`;
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(apiTokens)
          .values({ userId: user.id, name, tokenHash: hashToken(token), expiresAt })
          .returning({ id: apiTokens.id });
        if (!row) throw new Error("token insert returned no row");
        await audit(tx, user.id, "token.create", "token", row.id, { label: name });
        return row.id;
      });
      // The only time the token is ever sent: only its hash is stored.
      return reply.code(201).send({ id, name, token, expiresAt });
    },
  );

  app.delete(
    "/api/tokens/:tokenId",
    {
      onRequest: requireUser,
      schema: {
        response: res(ok),
        params: { type: "object", required: ["tokenId"], properties: { tokenId: { type: "string", format: "uuid" } } },
      },
    },
    async (req, reply) => {
      const user = req.user as SessionUser;
      const { tokenId } = req.params as { tokenId: string };
      const revoked = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(apiTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt)))
          .returning({ name: apiTokens.name });
        if (row) await audit(tx, user.id, "token.revoke", "token", tokenId, { label: row.name });
        return row;
      });
      if (!revoked) return reply.code(404).send({ error: "Not found" });
      return { ok: true };
    },
  );

  // The API described as OpenAPI 3.1, from the routes' own schemas. The web app shows it at /api-docs.
  let openApi: object | null = null;
  app.get(
    "/api/openapi.json",
    { config: { public: true }, schema: { response: res(obj({ openapi: str }, ["openapi"])) } },
    async () => {
      openApi ??= openApiDocument(app.apiRoutes, "1", components);
      return openApi;
    },
  );

  async function takeReauth(req: FastifyRequest) {
    const [row] = await db
      .update(sessions)
      .set({ reauthAt: null })
      .where(
        and(
          eq(sessions.tokenHash, hashToken(req.cookies[SESSION_COOKIE] ?? "")),
          eq(sessions.userId, req.user?.id as string),
          gt(sessions.reauthAt, new Date(Date.now() - 5 * 60_000)),
        ),
      )
      .returning({ userId: sessions.userId });
    return Boolean(row);
  }

  const access = createAccess(db);
  // Safety net under the per-route checks: any route whose path names something in a project answers 404 to people outside
  // that project, before the request body is even looked at. Routes still state the role they need.
  app.addHook("preValidation", async (req, reply) => {
    const where = req.user ? whereFromParams(req.params as Record<string, string | undefined>) : null;
    if (where && !(await access(req, reply, where, "viewer"))) return reply;
  });
  const context: AppContext = {
    app,
    db,
    requireUser,
    requireSession,
    requireAdmin,
    audit,
    access,
    startSession,
    loginLimit,
    mail,
    https: opts.https ?? false,
    outbound: opts.outbound ?? { allowPrivate: false },
    takeReauth,
  };
  projectRoutes(context);
  typeRoutes(context);
  nodeRoutes(context);
  linkRoutes(context);
  traceRoutes(context);
  verificationRoutes(context);
  memberRoutes(context);
  commentRoutes(context);
  baselineRoutes(context);
  reviewRoutes(context);
  testPlanRoutes(context);
  testRunRoutes(context);
  notificationRoutes(context);
  auditLogRoutes(context, opts.anchor);
  recoveryRoutes(context);
  webhookRoutes(context);
  referenceRoutes(context);
  if (opts.oidc) oidcRoutes(context, opts.oidc);
  const attachmentsDir = opts.attachmentsDir ?? "data/attachments";
  const maxAttachmentBytes = (opts.maxAttachmentMb || 25) * 1024 * 1024;
  attachmentRoutes(context, attachmentsDir, maxAttachmentBytes);
  backupRoutes(context, attachmentsDir, maxAttachmentBytes);
  importRoutes(context);
  exportRoutes(context, attachmentsDir);

  if (opts.webRoot && existsSync(opts.webRoot)) {
    await app.register(fastifyStatic, { root: opts.webRoot });
  }
  if (opts.helpRoot && existsSync(opts.helpRoot)) {
    // The guide is public, static and outside /api/. `decorateReply: false` because the app shell registered `sendFile`.
    await app.register(fastifyStatic, {
      root: opts.helpRoot,
      prefix: "/help/",
      extensions: ["html"],
      decorateReply: false,
    });
    app.get("/help", { config: { public: true } }, async (_req, reply) => reply.redirect("/help/"));
  }
  app.setNotFoundHandler((req, reply) => {
    // The web app does its own routing, so unknown non-API paths get the app shell.
    if (opts.webRoot && req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
    return reply.code(404).send({ error: "Not found" });
  });

  return app;
}

const dummyHash = hashPassword(randomBytes(16).toString("hex"));
