import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { audit, createAccess, whereFromParams } from "./access.ts";
import { attachmentRoutes } from "./attachments.ts";
import { backupRoutes } from "./backup.ts";
import { baselineRoutes } from "./baselines.ts";
import { commentRoutes } from "./comments.ts";
import type { Db } from "./db/client.ts";
import { apiTokens, sessions, users } from "./db/schema.ts";
import { hashPassword, verifyPassword } from "./domain/password.ts";
import { importRoutes } from "./import.ts";
import { linkRoutes } from "./links.ts";
import type { MailConfig } from "./mail.ts";
import { memberRoutes } from "./members.ts";
import { nodeRoutes } from "./nodes.ts";
import { notificationRoutes } from "./notifications.ts";
import { projectRoutes } from "./projects.ts";
import { recoveryRoutes } from "./recovery.ts";
import { exportRoutes } from "./export.ts";
import { reviewRoutes } from "./reviews.ts";
import { testPlanRoutes } from "./testplans.ts";
import { testRunRoutes } from "./testruns.ts";
import { traceRoutes } from "./trace.ts";
import { verificationRoutes } from "./verification.ts";

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
};

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyInstance {
    apiRoutes: { method: string; url: string; public: boolean }[];
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
    logger?: boolean;
    loginAttemptsPerMinute?: number;
    attachmentsDir?: string;
    /** The largest file that can be uploaded, in megabytes. */
    maxAttachmentMb?: number;
    /** Served over HTTPS by a reverse proxy: cookies are `Secure`, HSTS is sent, and the client address comes from the proxy. */
    https?: boolean;
    /** Email is queued only when this says it is enabled; the mail loop started in main.ts sends it. */
    mail?: MailConfig;
  } = {},
) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.https ?? false });
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
  app.addHook("onSend", async (_req, reply) => {
    for (const [name, value] of Object.entries(headers)) if (!reply.hasHeader(name)) reply.header(name, value);
  });
  await app.register(rateLimit, { global: false });
  app.decorateRequest("user", null);

  // Hard rule: every endpoint checks permissions. A route that is neither public nor behind requireUser fails at startup.
  const apiRoutes: { method: string; url: string; public: boolean }[] = [];
  app.decorate("apiRoutes", apiRoutes);
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/")) return;
    const isPublic = route.config?.public === true;
    if (!isPublic && ![route.onRequest].flat().includes(requireUser)) {
      throw new Error(`${route.method} ${route.url} must use requireUser or be marked public`);
    }
    for (const method of [route.method].flat()) apiRoutes.push({ method, url: route.url, public: isPublic });
  });

  const who = { id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin };
  /** The access token a script or CI job sent, if any. A request that sends one is never read as a browser session. */
  const bearer = (req: FastifyRequest) =>
    req.headers.authorization === undefined ? null : (/^Bearer (\S+)$/.exec(req.headers.authorization)?.[1] ?? "");

  async function findUser(req: FastifyRequest): Promise<SessionUser | null> {
    const apiToken = bearer(req);
    if (apiToken !== null) {
      const [user] = await db
        .select(who)
        .from(apiTokens)
        .innerJoin(users, eq(users.id, apiTokens.userId))
        .where(
          and(eq(apiTokens.tokenHash, hashToken(apiToken)), isNull(apiTokens.revokedAt), isNull(users.deactivatedAt)),
        );
      return user ?? null;
    }
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const [user] = await db
      .select(who)
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(users.deactivatedAt)),
      );
    return user ?? null;
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

  app.get("/api/session", { config: { public: true } }, async (req) => {
    const user = await findUser(req);
    const needsSetup = !user && (await db.$count(users)) === 0;
    // `mail` tells the sign-in page whether "Forgot password" can work.
    return { user, needsSetup, mail: mail.enabled };
  });

  // First run only: whoever reaches the server first creates the admin account.
  app.post(
    "/api/setup",
    {
      config: { public: true, ...loginLimit },
      schema: {
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
        body: { type: "object", required: ["email", "password"], additionalProperties: false, properties: credentials },
      },
    },
    async (req, reply) => {
      const body = req.body as { email: string; password: string };
      const [row] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
      // Hash even when the user is unknown, so response time does not reveal which emails exist.
      const ok = await verifyPassword(body.password, row?.passwordHash ?? (await dummyHash));
      // A deactivated account gets the same answer as a wrong password.
      if (!row || !ok || row.deactivatedAt) return reply.code(401).send({ error: "Wrong email or password" });
      await startSession(db, reply, row.id);
      return { user: { id: row.id, email: row.email, name: row.name, isAdmin: row.isAdmin } };
    },
  );

  app.post("/api/logout", { onRequest: requireUser }, async (req, reply) => {
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
        await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
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
  app.get("/api/tokens", { onRequest: requireUser }, async (req) => ({
    tokens: await db
      .select({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, req.user?.id as string), isNull(apiTokens.revokedAt)))
      .orderBy(apiTokens.createdAt),
  }));

  app.post(
    "/api/tokens",
    {
      onRequest: [requireUser, requireSession],
      schema: {
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" } },
        },
      },
    },
    async (req, reply) => {
      const user = req.user as SessionUser;
      const name = (req.body as { name: string }).name.trim();
      // The prefix lets secret scanners and people recognise a leaked token.
      const token = `orq_${randomBytes(32).toString("base64url")}`;
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(apiTokens)
          .values({ userId: user.id, name, tokenHash: hashToken(token) })
          .returning({ id: apiTokens.id });
        if (!row) throw new Error("token insert returned no row");
        await audit(tx, user.id, "token.create", "token", row.id, { label: name });
        return row.id;
      });
      // The only time the token is ever sent: only its hash is stored.
      return reply.code(201).send({ id, name, token });
    },
  );

  app.delete(
    "/api/tokens/:tokenId",
    {
      onRequest: requireUser,
      schema: {
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
  };
  projectRoutes(context);
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
  recoveryRoutes(context);
  const attachmentsDir = opts.attachmentsDir ?? "data/attachments";
  const maxAttachmentBytes = (opts.maxAttachmentMb || 25) * 1024 * 1024;
  attachmentRoutes(context, attachmentsDir, maxAttachmentBytes);
  backupRoutes(context, attachmentsDir, maxAttachmentBytes);
  importRoutes(context);
  exportRoutes(context, attachmentsDir);

  if (opts.webRoot && existsSync(opts.webRoot)) {
    await app.register(fastifyStatic, { root: opts.webRoot });
  }
  app.setNotFoundHandler((req, reply) => {
    // The web app does its own routing, so unknown non-API paths get the app shell.
    if (opts.webRoot && req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
    return reply.code(404).send({ error: "Not found" });
  });

  return app;
}

const dummyHash = hashPassword(randomBytes(16).toString("hex"));
