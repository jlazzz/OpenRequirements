import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AppContext, Tx } from "./app.ts";
import { passwordResets, sessions, users } from "./db/schema.ts";
import { hashPassword } from "./domain/password.ts";
import { queueMail } from "./mail.ts";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const HOUR_MS = 3_600_000;
// A link someone asked for is used at once. One an administrator makes may wait in a chat for a while.
const SELF_HOURS = 1;
const ADMIN_HOURS = 72;

/** "Forgot password" by emailed one-time link, and reset links made by an administrator. */
export function recoveryRoutes({
  app,
  db,
  requireUser,
  requireAdmin,
  requireSession,
  audit,
  startSession,
  loginLimit,
  mail,
}: AppContext) {
  const valid = (token: string) =>
    and(
      eq(passwordResets.tokenHash, hashToken(token)),
      isNull(passwordResets.usedAt),
      gt(passwordResets.expiresAt, new Date()),
    );

  /** Makes a reset link for a person and returns its token, which is never stored. */
  async function makeLink(tx: Tx, userId: string, createdBy: string | null, hours: number) {
    const token = randomBytes(32).toString("base64url");
    await tx
      .insert(passwordResets)
      .values({ userId, tokenHash: hashToken(token), createdBy, expiresAt: new Date(Date.now() + hours * HOUR_MS) });
    return token;
  }
  const linkOf = (token: string) => `${mail.publicUrl}/reset-password/${token}`;

  // Answers the same whether or not the address has an account, so it cannot be used to find out who has one.
  app.post(
    "/api/password/forgot",
    {
      config: { public: true, ...loginLimit },
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
      if (!mail.enabled) {
        return reply.code(404).send({ error: "This server cannot send email. Ask an administrator for a reset link." });
      }
      const email = (req.body as { email: string }).email.toLowerCase();
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deactivatedAt)));
      if (user) {
        await db.transaction(async (tx) => {
          const token = await makeLink(tx, user.id, null, SELF_HOURS);
          await queueMail(tx, mail, {
            to: email,
            subject: "Reset your password",
            text: `Someone asked to reset the password of this account. To choose a new password, open this link within ${SELF_HOURS} hour:\n\n${linkOf(token)}\n\nIf it was not you, ignore this email: your password stays as it is.`,
          });
          await audit(tx, null, "password_reset.create", "user", user.id);
        });
      }
      return { ok: true };
    },
  );

  // Lets the reset page show whose password is being set, before the person types one.
  app.get(
    "/api/password/reset/:token",
    {
      config: { public: true, ...loginLimit },
      schema: {
        params: { type: "object", required: ["token"], properties: { token: { type: "string", maxLength: 100 } } },
      },
    },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const [row] = await db
        .select({ email: users.email })
        .from(passwordResets)
        .innerJoin(users, eq(users.id, passwordResets.userId))
        .where(and(valid(token), isNull(users.deactivatedAt)));
      if (!row) return reply.code(404).send({ error: "This link is not valid any more. Ask for a new one." });
      return { email: row.email };
    },
  );

  // Uses the link once, sets the password, signs the person out everywhere else and in here.
  app.post(
    "/api/password/reset",
    {
      config: { public: true, ...loginLimit },
      schema: {
        body: {
          type: "object",
          required: ["token", "password"],
          additionalProperties: false,
          properties: {
            token: { type: "string", maxLength: 100 },
            password: { type: "string", minLength: 12, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { token: string; password: string };
      const passwordHash = await hashPassword(body.password);
      const user = await db.transaction(async (tx) => {
        const [used] = await tx
          .update(passwordResets)
          .set({ usedAt: new Date() })
          .where(valid(body.token))
          .returning({ userId: passwordResets.userId });
        if (!used) return null;
        const [row] = await tx
          .update(users)
          .set({ passwordHash })
          .where(and(eq(users.id, used.userId), isNull(users.deactivatedAt)))
          .returning({ id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin });
        if (!row) return null;
        await tx.delete(sessions).where(eq(sessions.userId, row.id));
        await audit(tx, row.id, "user.password_reset", "user", row.id);
        await startSession(tx, reply, row.id);
        return row;
      });
      if (!user) return reply.code(404).send({ error: "This link is not valid any more. Ask for a new one." });
      return { user };
    },
  );

  // An administrator makes a reset link for someone. It is emailed when email is set up, and returned to copy either way.
  app.post(
    "/api/users/:userId/password-reset",
    {
      onRequest: [requireUser, requireAdmin, requireSession],
      schema: {
        params: { type: "object", required: ["userId"], properties: { userId: { type: "string", format: "uuid" } } },
      },
    },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const [person] = await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deactivatedAt)));
      if (!person) return reply.code(404).send({ error: "No active account with this id" });
      const token = await db.transaction(async (tx) => {
        const made = await makeLink(tx, userId, req.user?.id as string, ADMIN_HOURS);
        await queueMail(tx, mail, {
          to: person.email,
          subject: "Set a new password",
          text: `${req.user?.name} made a link for you to set a new password. Open it within ${ADMIN_HOURS / 24} days:\n\n${linkOf(made)}`,
        });
        await audit(tx, req.user?.id ?? null, "password_reset.create", "user", userId, { label: person.email });
        return made;
      });
      return reply.code(201).send({ token, emailed: mail.enabled });
    },
  );
}
