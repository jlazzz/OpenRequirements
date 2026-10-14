import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, notInArray, sql } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { invitations, projectMembers, sessions, users } from "./db/schema.ts";
import { hashPassword, NO_PASSWORD } from "./domain/password.ts";
import { ROLES, type Role } from "./domain/roles.ts";
import { queueMail } from "./mail.ts";

const INVITE_DAYS = 7;
const uuid = { type: "string", format: "uuid" } as const;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Accounts, invitations and project membership. */
export function memberRoutes({
  app,
  db,
  requireUser,
  requireAdmin,
  audit,
  access,
  startSession,
  loginLimit,
  mail,
}: AppContext) {
  const pending = and(
    isNull(invitations.acceptedAt),
    isNull(invitations.revokedAt),
    gt(invitations.expiresAt, sql`now()`),
  );

  // --- Accounts and invitations: instance administrators only ---

  app.get("/api/users", { onRequest: [requireUser, requireAdmin] }, async () => ({
    users: await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        deactivatedAt: users.deactivatedAt,
      })
      .from(users)
      .orderBy(users.name),
    invitations: await db
      .select({ id: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt })
      .from(invitations)
      .where(pending)
      .orderBy(invitations.createdAt),
  }));

  // Deactivating keeps the account and everything it wrote, but ends its sessions and refuses new sign-ins.
  app.put(
    "/api/users/:userId/active",
    {
      onRequest: [requireUser, requireAdmin],
      schema: {
        params: { type: "object", required: ["userId"], properties: { userId: uuid } },
        body: {
          type: "object",
          required: ["active"],
          additionalProperties: false,
          properties: { active: { type: "boolean" } },
        },
      },
    },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const { active } = req.body as { active: boolean };
      if (userId === req.user?.id) return reply.code(400).send({ error: "You cannot deactivate your own account" });
      const found = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set({ deactivatedAt: active ? null : new Date() })
          .where(eq(users.id, userId))
          .returning({ email: users.email });
        if (!row) return false;
        if (!active) await tx.delete(sessions).where(eq(sessions.userId, userId));
        await audit(tx, req.user?.id ?? null, active ? "user.activate" : "user.deactivate", "user", userId, {
          label: row.email,
        });
        return true;
      });
      if (!found) return reply.code(404).send({ error: "User not found" });
      return { ok: true };
    },
  );

  // Emailed when email is set up. The link is also returned, so the administrator can copy it and send it themselves.
  app.post(
    "/api/invitations",
    {
      onRequest: [requireUser, requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["email"],
          additionalProperties: false,
          properties: { email: { type: "string", format: "email", maxLength: 254 } },
        },
      },
    },
    async (req, reply) => {
      const email = (req.body as { email: string }).email.toLowerCase();
      const [existing] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.email, email));
      // An account that came from a restored backup has no password yet, so it can still be invited.
      if (existing && existing.hash !== NO_PASSWORD)
        return reply.code(409).send({ error: "Someone with this email already has an account" });

      const token = randomBytes(32).toString("base64url");
      const id = await db.transaction(async (tx) => {
        // A new invitation replaces any earlier one for the same address.
        await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(and(eq(invitations.email, email), pending));
        const [row] = await tx
          .insert(invitations)
          .values({
            email,
            tokenHash: hashToken(token),
            invitedBy: req.user?.id as string,
            expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
          })
          .returning({ id: invitations.id });
        if (!row) throw new Error("invitation insert returned no row");
        await audit(tx, req.user?.id ?? null, "invitation.create", "invitation", row.id, { label: email });
        await queueMail(tx, mail, {
          to: email,
          subject: `${req.user?.name} invited you`,
          text: `${req.user?.name} invited you to the requirements tool at ${mail.publicUrl}. To create your account, open this link within ${INVITE_DAYS} days:\n\n${mail.publicUrl}/invite/${token}`,
        });
        return row.id;
      });
      // The token is returned once and never stored, like a password.
      return reply.code(201).send({ id, email, token, emailed: mail.enabled });
    },
  );

  app.delete(
    "/api/invitations/:invitationId",
    {
      onRequest: [requireUser, requireAdmin],
      schema: { params: { type: "object", required: ["invitationId"], properties: { invitationId: uuid } } },
    },
    async (req, reply) => {
      const { invitationId } = req.params as { invitationId: string };
      const revoked = await db.transaction(async (tx) => {
        const rows = await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(and(eq(invitations.id, invitationId), pending))
          .returning({ email: invitations.email });
        if (rows[0])
          await audit(tx, req.user?.id ?? null, "invitation.revoke", "invitation", invitationId, {
            label: rows[0].email,
          });
        return rows.length > 0;
      });
      if (!revoked) return reply.code(404).send({ error: "Invitation not found" });
      return { ok: true };
    },
  );

  // --- Accepting an invitation: public, because the invited person has no account yet ---

  const tokenParam = { type: "string", minLength: 20, maxLength: 100 } as const;

  app.get(
    "/api/invitations/accept/:token",
    {
      config: { public: true, ...loginLimit },
      schema: { params: { type: "object", required: ["token"], properties: { token: tokenParam } } },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const [invite] = await db
        .select({ email: invitations.email })
        .from(invitations)
        .where(and(eq(invitations.tokenHash, hashToken(token)), pending));
      if (!invite) return reply.code(404).send({ error: "This invitation is not valid any more. Ask for a new one." });
      return { email: invite.email };
    },
  );

  app.post(
    "/api/invitations/accept",
    {
      config: { public: true, ...loginLimit },
      schema: {
        body: {
          type: "object",
          required: ["token", "name", "password"],
          additionalProperties: false,
          properties: {
            token: tokenParam,
            name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" },
            password: { type: "string", minLength: 12, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { token: string; name: string; password: string };
      const passwordHash = await hashPassword(body.password);
      const user = await db.transaction(async (tx) => {
        // Marking it accepted first, with the pending check in the same statement, means a link works exactly once.
        const [invite] = await tx
          .update(invitations)
          .set({ acceptedAt: new Date() })
          .where(and(eq(invitations.tokenHash, hashToken(body.token)), pending))
          .returning({ email: invitations.email });
        if (!invite) return null;
        const [created] = await tx
          .insert(users)
          .values({ email: invite.email, name: body.name.trim(), passwordHash })
          // Takes over an account that a restored backup created; any other existing account stays untouched.
          .onConflictDoUpdate({
            target: users.email,
            set: { name: body.name.trim(), passwordHash },
            setWhere: eq(users.passwordHash, NO_PASSWORD),
          })
          .returning({ id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin });
        if (!created) return null;
        await audit(tx, created.id, "user.create", "user", created.id, { label: created.email });
        await startSession(tx, reply, created.id);
        return created;
      });
      if (!user) return reply.code(404).send({ error: "This invitation is not valid any more. Ask for a new one." });
      return { user };
    },
  );

  // --- Project membership ---

  const projectParam = { type: "object", required: ["projectId"], properties: { projectId: uuid } } as const;
  const memberParams = {
    type: "object",
    required: ["projectId", "userId"],
    properties: { projectId: uuid, userId: uuid },
  } as const;

  app.get(
    "/api/projects/:projectId/members",
    { onRequest: requireUser, schema: { params: projectParam } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const members = await db
        .select({ userId: users.id, name: users.name, email: users.email, role: projectMembers.role })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(users.name);
      // Instance administrators can do everything in every project without being listed as members.
      const admins = await db
        .select({ userId: users.id, name: users.name })
        .from(users)
        .where(eq(users.isAdmin, true))
        .orderBy(users.name);
      return { members, instanceAdmins: admins };
    },
  );

  // People who could be added: every account that is not yet a member. Project admins only, since it lists all accounts.
  app.get(
    "/api/projects/:projectId/candidates",
    { onRequest: requireUser, schema: { params: projectParam } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "admin"))) return reply;
      const current = db
        .select({ id: projectMembers.userId })
        .from(projectMembers)
        .where(eq(projectMembers.projectId, projectId));
      const candidates = await db
        .select({ userId: users.id, name: users.name, email: users.email })
        .from(users)
        .where(notInArray(users.id, current))
        .orderBy(users.name);
      return { candidates };
    },
  );

  // Adds a member or changes their role.
  app.put(
    "/api/projects/:projectId/members/:userId",
    {
      onRequest: requireUser,
      schema: {
        params: memberParams,
        body: {
          type: "object",
          required: ["role"],
          additionalProperties: false,
          properties: { role: { enum: [...ROLES] } },
        },
      },
    },
    async (req, reply) => {
      const { projectId, userId } = req.params as { projectId: string; userId: string };
      const { role } = req.body as { role: Role };
      if (!(await access(req, reply, { projectId }, "admin"))) return reply;
      const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
      if (!person) return reply.code(404).send({ error: "User not found" });
      await db.transaction(async (tx) => {
        await tx
          .insert(projectMembers)
          .values({ projectId, userId, role })
          .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } });
        await audit(tx, req.user?.id ?? null, "member.set", "user", userId, {
          projectId,
          label: `${person.name} as ${role}`,
        });
      });
      return { ok: true };
    },
  );

  app.delete(
    "/api/projects/:projectId/members/:userId",
    { onRequest: requireUser, schema: { params: memberParams } },
    async (req, reply) => {
      const { projectId, userId } = req.params as { projectId: string; userId: string };
      if (!(await access(req, reply, { projectId }, "admin"))) return reply;
      const removed = await db.transaction(async (tx) => {
        const rows = await tx
          .delete(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
          .returning({ userId: projectMembers.userId });
        if (rows.length > 0) {
          const [person] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId));
          await audit(tx, req.user?.id ?? null, "member.remove", "user", userId, { projectId, label: person?.name });
        }
        return rows.length > 0;
      });
      if (!removed) return reply.code(404).send({ error: "Member not found" });
      return { ok: true };
    },
  );
}
