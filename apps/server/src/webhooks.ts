import { createHmac, randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, lt, lte } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import type { Db } from "./db/client.ts";
import { webhookDeliveries, webhooks } from "./db/schema.ts";
import { outboundFetch, urlRefusal } from "./worker.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
/** A failed delivery is tried again after 1, 2, 4… minutes, at most this many times. */
const MAX_ATTEMPTS = 8;
const BATCH = 20;

/** The signature header value: HMAC-SHA256 of the exact body with the webhook's secret, as GitHub writes it. */
export const signBody = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Posts the deliveries that are due. A failure is kept on the row and tried again later. Returns how many were delivered. */
export async function deliverDue(db: Db, allowPrivate: boolean, now = new Date()): Promise<number> {
  let delivered = 0;
  await db.transaction(async (tx) => {
    // skip locked: a second server process takes other rows instead of the same ones.
    const due = await tx
      .select({ delivery: webhookDeliveries, url: webhooks.url, secret: webhooks.secret })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(
        and(
          isNull(webhookDeliveries.deliveredAt),
          isNull(webhooks.deletedAt),
          lte(webhookDeliveries.dueAt, now),
          lt(webhookDeliveries.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(asc(webhookDeliveries.dueAt))
      .limit(BATCH)
      .for("update", { of: webhookDeliveries, skipLocked: true });
    for (const { delivery, url, secret } of due) {
      const body = JSON.stringify(delivery.payload);
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const res = await outboundFetch(
          url,
          {
            method: "POST",
            body,
            headers: {
              "content-type": "application/json",
              "user-agent": "open-requirements-webhook",
              "x-webhook-event": delivery.event,
              "x-webhook-delivery": delivery.id,
              "x-webhook-signature-256": signBody(secret, body),
            },
          },
          allowPrivate,
        );
        statusCode = res.status;
        await res.body?.cancel();
        if (!res.ok) error = `answered ${res.status}`;
      } catch (e) {
        error = String(e instanceof Error && e.cause ? `${e.message}: ${e.cause}` : e).slice(0, 1000);
      }
      await tx
        .update(webhookDeliveries)
        .set({
          attempts: delivery.attempts + 1,
          statusCode,
          lastError: error,
          ...(error
            ? { dueAt: new Date(now.getTime() + 60_000 * 2 ** delivery.attempts) }
            : { deliveredAt: new Date() }),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      if (!error) delivered++;
    }
  });
  return delivered;
}

/** Webhooks: a project admin names a URL, and every audited change in the project is posted to it as signed JSON. */
export function webhookRoutes({ app, db, requireUser, audit, access, outbound }: AppContext) {
  const listed = { id: webhooks.id, url: webhooks.url, events: webhooks.events, createdAt: webhooks.createdAt };

  app.get(
    "/api/projects/:projectId/webhooks",
    { onRequest: requireUser, schema: { params: idParam("projectId") } },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      return {
        webhooks: await db
          .select(listed)
          .from(webhooks)
          .where(and(eq(webhooks.projectId, projectId), isNull(webhooks.deletedAt)))
          .orderBy(webhooks.createdAt),
      };
    },
  );

  app.post(
    "/api/projects/:projectId/webhooks",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["url"],
          additionalProperties: false,
          properties: {
            url: { type: "string", maxLength: 2000 },
            // The first word of the actions to send, e.g. "item"; none means all.
            events: {
              type: "array",
              maxItems: 50,
              uniqueItems: true,
              items: { type: "string", pattern: "^[a-z_]{1,40}$" },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      const body = req.body as { url: string; events?: string[] };
      const url = body.url.trim();
      const refusal = await urlRefusal(url, outbound.allowPrivate);
      if (refusal) return reply.code(400).send({ error: `This address cannot be used: ${refusal}` });
      const secret = `whsec_${randomBytes(24).toString("base64url")}`;
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(webhooks)
          .values({ projectId, url, secret, events: body.events ?? [], createdBy: req.user?.id as string })
          .returning({ id: webhooks.id });
        if (!row) throw new Error("webhook insert returned no row");
        await audit(tx, req.user?.id as string, "webhook.create", "webhook", row.id, { projectId, label: url });
        return row.id;
      });
      // The only time the secret is sent: the receiver needs it to check signatures.
      return reply.code(201).send({ id, secret });
    },
  );

  app.delete(
    "/api/webhooks/:webhookId",
    { onRequest: requireUser, schema: { params: idParam("webhookId") } },
    async (req, reply) => {
      const { webhookId } = req.params as { webhookId: string };
      const projectId = await access(req, reply, { webhookId }, "admin");
      if (!projectId) return reply;
      const removed = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(webhooks)
          .set({ deletedAt: new Date() })
          .where(and(eq(webhooks.id, webhookId), isNull(webhooks.deletedAt)))
          .returning({ url: webhooks.url });
        if (row)
          await audit(tx, req.user?.id as string, "webhook.delete", "webhook", webhookId, {
            projectId,
            label: row.url,
          });
        return row;
      });
      if (!removed) return reply.code(404).send({ error: "Not found" });
      return { ok: true };
    },
  );

  // Sends a "ping" to this webhook only, to try the receiver. Not shown in the activity stream.
  app.post(
    "/api/webhooks/:webhookId/ping",
    { onRequest: requireUser, schema: { params: idParam("webhookId") } },
    async (req, reply) => {
      const { webhookId } = req.params as { webhookId: string };
      if (!(await access(req, reply, { webhookId }, "admin"))) return reply;
      await db.transaction(async (tx) => {
        const payload = { event: "ping", webhookId, at: new Date() };
        await tx.insert(webhookDeliveries).values({ webhookId, event: "ping", payload });
        await audit(tx, req.user?.id as string, "webhook.ping", "webhook", webhookId);
      });
      return reply.code(201).send({ ok: true });
    },
  );

  app.get(
    "/api/webhooks/:webhookId/deliveries",
    { onRequest: requireUser, schema: { params: idParam("webhookId") } },
    async (req, reply) => {
      const { webhookId } = req.params as { webhookId: string };
      if (!(await access(req, reply, { webhookId }, "admin"))) return reply;
      return {
        deliveries: await db
          .select({
            id: webhookDeliveries.id,
            event: webhookDeliveries.event,
            createdAt: webhookDeliveries.createdAt,
            attempts: webhookDeliveries.attempts,
            statusCode: webhookDeliveries.statusCode,
            lastError: webhookDeliveries.lastError,
            deliveredAt: webhookDeliveries.deliveredAt,
            dueAt: webhookDeliveries.dueAt,
          })
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.webhookId, webhookId))
          .orderBy(desc(webhookDeliveries.createdAt))
          .limit(50),
      };
    },
  );
}
