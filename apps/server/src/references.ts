import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import type { Db } from "./db/client.ts";
import { externalReferences, integrations, nodes, sets } from "./db/schema.ts";
import { normalBase, readStatus, referenceKind, statusRequest } from "./domain/references.ts";
import { decrypt, encrypt } from "./domain/secret.ts";
import { any, arr, bool, date, id, obj, ok, res, rows, str } from "./schemas.ts";
import { outboundFetch, urlRefusal } from "./worker.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
const httpUrl = { type: "string", maxLength: 2000, pattern: "^https?://\\S+$" } as const;
/** A reference's title and state are read again after this long. */
const STALE_MS = 15 * 60_000;
const BATCH = 100;

export type OutboundConfig = {
  /** ALLOW_PRIVATE_URLS: webhooks and connections may call addresses on internal networks. */
  allowPrivate: boolean;
  /** INTEGRATION_KEY: encrypts connection tokens. Without it, connections work without a token only. */
  integrationKey?: string;
};

/**
 * Reads the title and open or closed state of references from the tools the project is connected to. The worker calls
 * it every minute for references not read in the last 15; the item page calls it for one item. Not audited: it only
 * copies what another tool says.
 */
export async function refreshReferences(
  db: Db,
  config: OutboundConfig,
  only: { itemId?: string; now?: Date } = {},
): Promise<number> {
  const now = only.now ?? new Date();
  const due = await db
    .select({ id: externalReferences.id, url: externalReferences.url, projectId: sets.projectId })
    .from(externalReferences)
    .innerJoin(nodes, eq(nodes.id, externalReferences.itemId))
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .where(
      and(
        isNull(externalReferences.deletedAt),
        only.itemId
          ? eq(externalReferences.itemId, only.itemId)
          : or(
              isNull(externalReferences.checkedAt),
              lt(externalReferences.checkedAt, new Date(now.getTime() - STALE_MS)),
            ),
      ),
    )
    .orderBy(asc(externalReferences.checkedAt))
    .limit(BATCH);
  if (due.length === 0) return 0;
  const connections = await db
    .select()
    .from(integrations)
    .where(
      and(isNull(integrations.deletedAt), inArray(integrations.projectId, [...new Set(due.map((r) => r.projectId))])),
    );
  let read = 0;
  for (const ref of due) {
    let found: { title: string; state: "open" | "closed"; kind: string } | null = null;
    for (const connection of connections.filter((c) => c.projectId === ref.projectId)) {
      let token: string | null = null;
      try {
        token = connection.token && config.integrationKey ? decrypt(config.integrationKey, connection.token) : null;
      } catch {
        // INTEGRATION_KEY was changed: the token can no longer be read. Try without it.
      }
      const request = statusRequest({ kind: connection.kind, baseUrl: connection.baseUrl, token }, ref.url);
      if (!request) continue;
      try {
        const res = await outboundFetch(request.url, { headers: request.headers }, config.allowPrivate);
        const status = res.ok ? readStatus(connection.kind, await res.json()) : null;
        // The connection also says which tool it is, e.g. for a GitHub Enterprise address the URL alone does not reveal.
        found = status && { ...status, kind: connection.kind };
      } catch {
        found = null;
      }
      break;
    }
    await db
      .update(externalReferences)
      .set({
        checkedAt: now,
        ...(found ? { title: found.title.slice(0, 500), state: found.state, kind: found.kind } : {}),
      })
      .where(eq(externalReferences.id, ref.id));
    if (found) read++;
  }
  return read;
}

/** References from items to issues, pull requests and code elsewhere, and the project's connections to those tools. */
export function referenceRoutes({ app, db, requireUser, audit, access, outbound }: AppContext) {
  const listed = {
    id: externalReferences.id,
    url: externalReferences.url,
    title: externalReferences.title,
    kind: externalReferences.kind,
    source: externalReferences.source,
    state: externalReferences.state,
    checkedAt: externalReferences.checkedAt,
    createdAt: externalReferences.createdAt,
  };

  app.get(
    "/api/items/:itemId/references",
    { onRequest: requireUser, schema: { response: res(obj({ references: rows })), params: idParam("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "viewer"))) return reply;
      return {
        references: await db
          .select(listed)
          .from(externalReferences)
          .where(and(eq(externalReferences.itemId, itemId), isNull(externalReferences.deletedAt)))
          .orderBy(externalReferences.createdAt),
      };
    },
  );

  app.post(
    "/api/items/:itemId/references",
    {
      onRequest: requireUser,
      schema: {
        response: res(obj({ id }), 201),
        params: idParam("itemId"),
        body: {
          type: "object",
          required: ["url"],
          additionalProperties: false,
          properties: { url: httpUrl, title: { type: "string", maxLength: 500 } },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const projectId = await access(req, reply, { nodeId: itemId }, "editor");
      if (!projectId) return reply;
      const body = req.body as { url: string; title?: string };
      const [item] = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)));
      if (!item) return reply.code(404).send({ error: "Item not found" });
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(externalReferences)
          .values({
            itemId,
            url: body.url,
            title: body.title?.trim() ?? "",
            kind: referenceKind(body.url),
            createdBy: req.user?.id as string,
          })
          .returning({ id: externalReferences.id });
        if (!row) throw new Error("reference insert returned no row");
        await audit(tx, req.user?.id as string, "reference.create", "item", itemId);
        return row.id;
      });
      return reply.code(201).send({ id });
    },
  );

  app.delete(
    "/api/references/:referenceId",
    { onRequest: requireUser, schema: { response: res(ok), params: idParam("referenceId") } },
    async (req, reply) => {
      const { referenceId } = req.params as { referenceId: string };
      if (!(await access(req, reply, { referenceId }, "editor"))) return reply;
      const removed = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(externalReferences)
          .set({ deletedAt: new Date() })
          .where(and(eq(externalReferences.id, referenceId), isNull(externalReferences.deletedAt)))
          .returning({ itemId: externalReferences.itemId });
        if (row) await audit(tx, req.user?.id as string, "reference.delete", "item", row.itemId);
        return row;
      });
      if (!removed) return reply.code(404).send({ error: "Not found" });
      return { ok: true };
    },
  );

  // Reads the title and state of one item's references now, instead of waiting for the worker.
  app.post(
    "/api/items/:itemId/references/refresh",
    { onRequest: requireUser, schema: { response: res(obj({ read: any })), params: idParam("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "viewer"))) return reply;
      return { read: await refreshReferences(db, outbound, { itemId }) };
    },
  );

  // The tag scanner in packages/cli sends every `@req UID` it found in one repository. References from that repository
  // are made to match: new ones added, changed titles updated, those no longer in the code removed. One audit event.
  app.put(
    "/api/projects/:projectId/code-references",
    {
      onRequest: requireUser,
      bodyLimit: 10 * 1024 * 1024,
      schema: {
        response: res(obj({ unknown: arr(str) }, [])),
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["source", "references"],
          additionalProperties: false,
          properties: {
            // The repository, e.g. https://github.com/acme/pump.
            source: { type: "string", minLength: 1, maxLength: 500 },
            references: {
              type: "array",
              maxItems: 20_000,
              items: {
                type: "object",
                required: ["uid", "url"],
                additionalProperties: false,
                properties: {
                  uid: { type: "string", minLength: 1, maxLength: 50 },
                  url: httpUrl,
                  title: { type: "string", maxLength: 500 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "editor");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const body = req.body as { source: string; references: { uid: string; url: string; title?: string }[] };
      const uids = [...new Set(body.references.map((r) => r.uid))];
      const result = await db.transaction(async (tx) => {
        const items = uids.length
          ? await tx
              .select({ id: nodes.id, uid: nodes.uid })
              .from(nodes)
              .innerJoin(sets, eq(sets.id, nodes.setId))
              .where(and(eq(sets.projectId, projectId), inArray(nodes.uid, uids), isNull(nodes.deletedAt)))
          : [];
        const idOf = new Map(items.map((i) => [i.uid, i.id]));
        const existing = await tx
          .select({
            id: externalReferences.id,
            itemId: externalReferences.itemId,
            url: externalReferences.url,
            title: externalReferences.title,
          })
          .from(externalReferences)
          .innerJoin(nodes, eq(nodes.id, externalReferences.itemId))
          .innerJoin(sets, eq(sets.id, nodes.setId))
          .where(
            and(
              eq(sets.projectId, projectId),
              eq(externalReferences.source, body.source),
              isNull(externalReferences.deletedAt),
            ),
          );
        const old = new Map(existing.map((r) => [`${r.itemId} ${r.url}`, r]));
        const wanted = new Map<string, { itemId: string; url: string; title: string }>();
        for (const ref of body.references) {
          const itemId = idOf.get(ref.uid);
          if (itemId) wanted.set(`${itemId} ${ref.url}`, { itemId, url: ref.url, title: ref.title ?? "" });
        }
        const added = [...wanted].filter(([key]) => !old.has(key)).map(([, ref]) => ref);
        const changed = [...wanted].filter(([key, ref]) => old.has(key) && old.get(key)?.title !== ref.title);
        const removed = existing.filter((r) => !wanted.has(`${r.itemId} ${r.url}`)).map((r) => r.id);
        if (added.length) {
          await tx
            .insert(externalReferences)
            .values(added.map((ref) => ({ ...ref, kind: "code", source: body.source, createdBy: userId })));
        }
        for (const [key, ref] of changed) {
          await tx
            .update(externalReferences)
            .set({ title: ref.title })
            .where(eq(externalReferences.id, old.get(key)?.id as string));
        }
        if (removed.length) {
          await tx
            .update(externalReferences)
            .set({ deletedAt: new Date() })
            .where(inArray(externalReferences.id, removed));
        }
        const counts = { added: added.length, updated: changed.length, removed: removed.length };
        if (counts.added + counts.updated + counts.removed > 0) {
          const label = `${body.source}: ${counts.added} added, ${counts.updated} updated, ${counts.removed} removed`;
          await audit(tx, userId, "reference.sync", "project", projectId, { label });
        }
        return { ...counts, unknown: uids.filter((uid) => !idOf.has(uid)) };
      });
      return result;
    },
  );

  app.get(
    "/api/projects/:projectId/integrations",
    {
      onRequest: requireUser,
      schema: {
        response: res(
          obj({
            tokens: bool,
            integrations: arr(obj({ id, kind: str, baseUrl: str, hasToken: bool, createdAt: date })),
          }),
        ),
        params: idParam("projectId"),
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      const rows = await db
        .select()
        .from(integrations)
        .where(and(eq(integrations.projectId, projectId), isNull(integrations.deletedAt)))
        .orderBy(integrations.createdAt);
      return {
        // Whether the server can store tokens: it needs INTEGRATION_KEY.
        tokens: Boolean(outbound.integrationKey),
        integrations: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          baseUrl: r.baseUrl,
          hasToken: r.token !== null,
          createdAt: r.createdAt,
        })),
      };
    },
  );

  app.post(
    "/api/projects/:projectId/integrations",
    {
      onRequest: requireUser,
      schema: {
        response: res(obj({ id }), 201),
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["kind", "baseUrl"],
          additionalProperties: false,
          properties: {
            kind: { enum: ["jira", "github", "gitlab"] },
            baseUrl: httpUrl,
            token: { type: "string", minLength: 1, maxLength: 1000 },
          },
        },
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      const body = req.body as { kind: "jira" | "github" | "gitlab"; baseUrl: string; token?: string };
      const baseUrl = normalBase(body.baseUrl.trim());
      // GitHub itself is read at api.github.com.
      const refusal = await urlRefusal(
        baseUrl === "https://github.com" ? "https://api.github.com" : baseUrl,
        outbound.allowPrivate,
      );
      if (refusal) return reply.code(400).send({ error: `This address cannot be used: ${refusal}` });
      if (body.token && !outbound.integrationKey) {
        return reply
          .code(400)
          .send({ error: "The server cannot store tokens until its administrator sets INTEGRATION_KEY" });
      }
      const token = body.token && outbound.integrationKey ? encrypt(outbound.integrationKey, body.token) : null;
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(integrations)
          .values({ projectId, kind: body.kind, baseUrl, token, createdBy: req.user?.id as string })
          .returning({ id: integrations.id });
        if (!row) throw new Error("integration insert returned no row");
        await audit(tx, req.user?.id as string, "integration.create", "integration", row.id, {
          projectId,
          label: `${body.kind} ${baseUrl}`,
        });
        return row.id;
      });
      return reply.code(201).send({ id });
    },
  );

  app.delete(
    "/api/integrations/:integrationId",
    { onRequest: requireUser, schema: { response: res(ok), params: idParam("integrationId") } },
    async (req, reply) => {
      const { integrationId } = req.params as { integrationId: string };
      const projectId = await access(req, reply, { integrationId }, "admin");
      if (!projectId) return reply;
      const removed = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(integrations)
          .set({ deletedAt: new Date() })
          .where(and(eq(integrations.id, integrationId), isNull(integrations.deletedAt)))
          .returning({ kind: integrations.kind, baseUrl: integrations.baseUrl });
        if (row) {
          await audit(tx, req.user?.id as string, "integration.delete", "integration", integrationId, {
            projectId,
            label: `${row.kind} ${row.baseUrl}`,
          });
        }
        return row;
      });
      if (!removed) return reply.code(404).send({ error: "Not found" });
      return { ok: true };
    },
  );
}
