import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { and, eq, gt, sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { Db } from "./db/client.ts";
import { auditEvents, sessions, users } from "./db/schema.ts";
import { hashPassword, verifyPassword } from "./domain/password.ts";
import { linkRoutes } from "./links.ts";
import { nodeRoutes } from "./nodes.ts";
import { projectRoutes } from "./projects.ts";

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
  /** Use after requireUser: rejects users who are not administrators. */
  requireAdmin: Guard;
  /** Records an audit event. Call it in the same transaction as the write. */
  audit: (
    tx: Db | Tx,
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string,
  ) => Promise<unknown>;
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
  opts: { webRoot?: string; logger?: boolean; loginAttemptsPerMinute?: number } = {},
) {
  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cookie);
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

  const audit: AppContext["audit"] = (tx, actorUserId, action, entityType, entityId) =>
    tx.insert(auditEvents).values({ actorUserId, action, entityType, entityId });

  async function findUser(req: FastifyRequest): Promise<SessionUser | null> {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
    return user ?? null;
  }

  async function requireUser(req: FastifyRequest, reply: FastifyReply) {
    req.user = await findUser(req);
    if (!req.user) return reply.code(401).send({ error: "Not signed in" });
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
      // shortcut: no `secure` flag because Phase 1 runs on plain HTTP (docs/DESIGN.md section 7), set it when HTTPS lands
    });
  }

  const loginLimit = { rateLimit: { max: opts.loginAttemptsPerMinute ?? 10, timeWindow: "1 minute" } };

  app.get("/api/session", { config: { public: true } }, async (req) => {
    const user = await findUser(req);
    const needsSetup = !user && (await db.$count(users)) === 0;
    return { user, needsSetup };
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
      if (!row || !ok) return reply.code(401).send({ error: "Wrong email or password" });
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

  const context: AppContext = { app, db, requireUser, requireAdmin, audit };
  projectRoutes(context);
  nodeRoutes(context);
  linkRoutes(context);

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
