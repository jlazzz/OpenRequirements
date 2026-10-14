import { and, asc, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { Tx } from "./app.ts";
import type { Db } from "./db/client.ts";
import { notifications, outbox, users } from "./db/schema.ts";

/** Sends one email. The SMTP one comes from smtpMailer; tests pass their own. */
export type Mailer = { send: (message: { to: string; subject: string; text: string }) => Promise<void> };

/** What route files need to know about email: whether it is set up, and the address links in emails start with. */
export type MailConfig = { enabled: boolean; publicUrl: string };

/** A failed email is tried again after 1, 2, 4… minutes, at most this many times. */
const MAX_ATTEMPTS = 8;
const BATCH = 20;
const DAY_MS = 86_400_000;

/** `url` is like smtps://user:password@smtp.example.com:465. */
export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    send: async (message) => {
      await transport.sendMail({ from, ...message });
    },
  };
}

/** Queues an email in the caller's transaction, so it is sent only if the change it reports is committed. */
export async function queueMail(tx: Db | Tx, mail: MailConfig, message: { to: string; subject: string; text: string }) {
  if (!mail.enabled) return;
  await tx.insert(outbox).values({ to: message.to, subject: message.subject, body: message.text });
}

/** Sends the queued emails that are due. A failure is kept on the row and tried again later. Returns how many were sent. */
export async function sendDue(db: Db, mailer: Mailer, now = new Date()): Promise<number> {
  let sent = 0;
  await db.transaction(async (tx) => {
    // skip locked: a second server process sending at the same time takes other rows instead of the same ones.
    const due = await tx
      .select()
      .from(outbox)
      .where(and(isNull(outbox.sentAt), lte(outbox.dueAt, now), lt(outbox.attempts, MAX_ATTEMPTS)))
      .orderBy(asc(outbox.dueAt))
      .limit(BATCH)
      .for("update", { skipLocked: true });
    for (const row of due) {
      try {
        await mailer.send({ to: row.to, subject: row.subject, text: row.body });
        await tx
          .update(outbox)
          .set({ sentAt: new Date(), attempts: row.attempts + 1 })
          .where(eq(outbox.id, row.id));
        sent++;
      } catch (error) {
        await tx
          .update(outbox)
          .set({
            attempts: row.attempts + 1,
            // A refused connection is an AggregateError whose own message is empty: keep the reasons inside it.
            lastError: (error instanceof AggregateError ? error.errors.map(String).join("; ") : String(error)).slice(
              0,
              1000,
            ),
            dueAt: new Date(now.getTime() + 60_000 * 2 ** row.attempts),
          })
          .where(eq(outbox.id, row.id));
      }
    }
  });
  return sent;
}

/** Queues one email for each person on the daily digest who has unread notifications newer than their last digest. */
export async function queueDigests(db: Db, mail: MailConfig, now = new Date()): Promise<number> {
  const people = await db
    .select({ id: users.id, email: users.email, since: users.digestSentAt })
    .from(users)
    .where(
      and(
        eq(users.emailNotifications, "digest"),
        isNull(users.deactivatedAt),
        or(isNull(users.digestSentAt), lte(users.digestSentAt, new Date(now.getTime() - DAY_MS))),
      ),
    );
  let queued = 0;
  for (const person of people) {
    const unread = await db
      .select({ text: notifications.text, path: notifications.path })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, person.id),
          isNull(notifications.readAt),
          person.since ? gt(notifications.createdAt, person.since) : undefined,
        ),
      )
      .orderBy(asc(notifications.createdAt));
    if (unread.length === 0) continue;
    await db.transaction(async (tx) => {
      await queueMail(tx, mail, {
        to: person.email,
        subject: `${unread.length} new ${unread.length === 1 ? "notification" : "notifications"}`,
        text: `${unread.map((n) => `- ${n.text}\n  ${mail.publicUrl}${n.path}`).join("\n\n")}${FOOTER}`,
      });
      await tx.update(users).set({ digestSentAt: now }).where(eq(users.id, person.id));
    });
    queued++;
  }
  return queued;
}

/** Ends every notification email. */
export const FOOTER =
  "\n\n--\nTo get these emails once a day or not at all, choose your name at the top right of the app.";

/** The project's first background worker: queues digests and sends what is due, every `everyMs`. Returns a stop function. */
export function startMailLoop(
  db: Db,
  mailer: Mailer,
  mail: MailConfig,
  log: (error: unknown) => void,
  everyMs = 30_000,
) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await queueDigests(db, mail);
      await sendDue(db, mailer);
    } catch (error) {
      log(error);
    } finally {
      running = false;
    }
  }, everyMs);
  return () => clearInterval(timer);
}

export type Notice = {
  userId: string;
  projectId: string;
  kind: "mention" | "review" | "suspect" | "run";
  text: string;
  path: string;
  actorId: string | null;
};

/**
 * Notifies people, in the caller's transaction, and queues an email for each of them who wants one per notification.
 * Nobody is notified of their own action, nor twice of the same thing in one call.
 */
export async function notify(tx: Db | Tx, mail: MailConfig, notices: Notice[]) {
  const seen = new Set<string>();
  const list = notices.filter((n) => {
    const key = `${n.userId} ${n.kind} ${n.path}`;
    if (n.userId === n.actorId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (list.length === 0) return;
  await tx.insert(notifications).values(list);
  if (!mail.enabled) return;
  const people = await tx
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        inArray(
          users.id,
          list.map((n) => n.userId),
        ),
        eq(users.emailNotifications, "each"),
        isNull(users.deactivatedAt),
      ),
    );
  const emailOf = new Map(people.map((p) => [p.id, p.email]));
  for (const n of list) {
    const to = emailOf.get(n.userId);
    // A subject is one short line, whatever a comment excerpt in the text holds.
    const subject = n.text.replace(/\s+/g, " ").slice(0, 150);
    if (to) await queueMail(tx, mail, { to, subject, text: `${n.text}\n\n${mail.publicUrl}${n.path}${FOOTER}` });
  }
}
