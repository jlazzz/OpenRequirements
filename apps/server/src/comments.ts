import { and, desc, eq, isNull, lt, notLike, or } from "drizzle-orm";
import { roleIn } from "./access.ts";
import type { AppContext } from "./app.ts";
import { auditEvents, comments, nodes, projectMembers, users } from "./db/schema.ts";
import { findMentions } from "./domain/roles.ts";

const uuid = { type: "string", format: "uuid" } as const;
const param = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
const PAGE = 50;

/** Comments on items, and the project activity stream. */
export function commentRoutes({ app, db, requireUser, audit, access }: AppContext) {
  app.get(
    "/api/items/:itemId/comments",
    { onRequest: requireUser, schema: { params: param("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "viewer"))) return reply;
      const rows = await db
        .select({
          id: comments.id,
          body: comments.body,
          mentions: comments.mentions,
          createdAt: comments.createdAt,
          authorId: comments.authorId,
          author: users.name,
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(and(eq(comments.itemId, itemId), isNull(comments.deletedAt)))
        .orderBy(comments.createdAt);
      return { comments: rows };
    },
  );

  app.post(
    "/api/items/:itemId/comments",
    {
      onRequest: requireUser,
      schema: {
        params: param("itemId"),
        body: {
          type: "object",
          required: ["body"],
          additionalProperties: false,
          properties: { body: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" } },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const body = (req.body as { body: string }).body.trim();
      const userId = req.user?.id as string;
      const projectId = await access(req, reply, { nodeId: itemId }, "reviewer");
      if (!projectId) return reply;
      const [item] = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)));
      if (!item) return reply.code(404).send({ error: "Item not found" });

      // Only people who can open the project can be mentioned: its members and the instance administrators.
      const people = await db
        .selectDistinct({ id: users.id, name: users.name })
        .from(users)
        .leftJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, projectId)))
        .where(or(eq(users.isAdmin, true), eq(projectMembers.projectId, projectId)));
      const mentions = findMentions(body, people);

      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(comments)
          .values({ itemId, authorId: userId, body, mentions })
          .returning({ id: comments.id });
        if (!row) throw new Error("comment insert returned no row");
        await audit(tx, userId, "comment.create", "item", itemId, { mentions });
        return row.id;
      });
      return reply.code(201).send({ id, mentions });
    },
  );

  // Soft delete, by the comment's author or a project admin.
  app.delete(
    "/api/comments/:commentId",
    { onRequest: requireUser, schema: { params: param("commentId") } },
    async (req, reply) => {
      const { commentId } = req.params as { commentId: string };
      const projectId = await access(req, reply, { commentId }, "reviewer");
      if (!projectId || !req.user) return reply;
      const [comment] = await db
        .select({ authorId: comments.authorId, itemId: comments.itemId })
        .from(comments)
        .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)));
      if (!comment) return reply.code(404).send({ error: "Not found" });
      if (comment.authorId !== req.user.id && (await roleIn(db, req.user, projectId)) !== "admin") {
        return reply.code(403).send({ error: "Only the author or a project admin can delete a comment" });
      }
      await db.transaction(async (tx) => {
        await tx.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));
        await audit(tx, req.user?.id ?? null, "comment.delete", "item", comment.itemId);
      });
      return { ok: true };
    },
  );

  // Activity stream: the project's audit events, newest first, a page at a time.
  app.get(
    "/api/projects/:projectId/activity",
    {
      onRequest: requireUser,
      schema: {
        params: param("projectId"),
        querystring: { type: "object", properties: { before: { type: "string", format: "date-time" } } },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      const { before } = req.query as { before?: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const events = await db
        .select({
          id: auditEvents.id,
          at: auditEvents.at,
          actor: users.name,
          action: auditEvents.action,
          entityType: auditEvents.entityType,
          entityId: auditEvents.entityId,
          data: auditEvents.data,
        })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .where(
          and(
            eq(auditEvents.projectId, projectId),
            // Drafts are private and uploads are noise; neither belongs in a shared feed.
            notLike(auditEvents.action, "draft.%"),
            notLike(auditEvents.action, "attachment.%"),
            before ? lt(auditEvents.at, new Date(before)) : undefined,
          ),
        )
        .orderBy(desc(auditEvents.at))
        .limit(PAGE);
      return { events, more: events.length === PAGE };
    },
  );
}
