import { and, desc, eq, isNull, lt, notLike, or } from "drizzle-orm";
import { roleIn } from "./access.ts";
import type { AppContext } from "./app.ts";
import { auditEvents, baselineEntries, comments, nodes, projectMembers, reviews, users } from "./db/schema.ts";
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
          // Set on a comment made in a review.
          reviewId: comments.reviewId,
          review: reviews.name,
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .leftJoin(reviews, eq(reviews.id, comments.reviewId))
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
          properties: {
            body: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" },
            // Makes it a comment in a review, on the item as that review's baseline froze it.
            reviewId: uuid,
          },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const { reviewId } = req.body as { reviewId?: string };
      const body = (req.body as { body: string }).body.trim();
      const userId = req.user?.id as string;
      const projectId = await access(req, reply, { nodeId: itemId }, "reviewer");
      if (!projectId) return reply;
      const [item] = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)));
      if (!item) return reply.code(404).send({ error: "Item not found" });
      if (reviewId) {
        const [review] = await db
          .select({ state: reviews.state })
          .from(reviews)
          .innerJoin(baselineEntries, eq(baselineEntries.baselineId, reviews.baselineId))
          .where(and(eq(reviews.id, reviewId), eq(reviews.projectId, projectId), eq(baselineEntries.nodeId, itemId)));
        if (!review) return reply.code(400).send({ error: "This item is not part of that review" });
        if (review.state !== "open") return reply.code(409).send({ error: "This review is closed" });
      }

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
          .values({ itemId, authorId: userId, body, mentions, reviewId: reviewId ?? null })
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
        .select({ authorId: comments.authorId, itemId: comments.itemId, review: reviews.state })
        .from(comments)
        .leftJoin(reviews, eq(reviews.id, comments.reviewId))
        .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)));
      if (!comment) return reply.code(404).send({ error: "Not found" });
      // A closed review is a permanent record, comments included.
      if (comment.review && comment.review !== "open") {
        return reply.code(409).send({ error: "This comment belongs to a closed review and cannot be deleted" });
      }
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
            // Drafts are private; uploads and the single results of a CI import are noise. None belongs in a shared feed.
            notLike(auditEvents.action, "draft.%"),
            notLike(auditEvents.action, "junit.result.%"),
            notLike(auditEvents.action, "attachment.%"),
            // Single marks in a review, and the items an approval updated: the review's own events say it in one line.
            notLike(auditEvents.action, "review.mark%"),
            notLike(auditEvents.action, "review.item.%"),
            // Single steps of a test run: the run's "finished" event says it in one line.
            notLike(auditEvents.action, "run.step.%"),
            before ? lt(auditEvents.at, new Date(before)) : undefined,
          ),
        )
        .orderBy(desc(auditEvents.at))
        .limit(PAGE);
      return { events, more: events.length === PAGE };
    },
  );
}
