import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db/client.ts";
import {
  attachments,
  auditEvents,
  baselines,
  comments,
  itemRevisions,
  links,
  nodes,
  projectMembers,
  projects,
  reviews,
  sets,
} from "./db/schema.ts";
import { type Role, roleAllows } from "./domain/roles.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Reader = Pick<Db, "select">;

/** What a request is about. Exactly one id is given; the project is worked out from it. */
export type Where = {
  projectId?: string;
  setId?: string;
  nodeId?: string;
  linkId?: string;
  attachmentId?: string;
  commentId?: string;
  baselineId?: string;
  reviewId?: string;
};

async function projectOf(db: Reader, where: Where): Promise<string | undefined> {
  if (where.setId) return (await db.select({ id: sets.projectId }).from(sets).where(eq(sets.id, where.setId)))[0]?.id;
  if (where.nodeId) {
    const rows = await db
      .select({ id: sets.projectId })
      .from(nodes)
      .innerJoin(sets, eq(sets.id, nodes.setId))
      .where(eq(nodes.id, where.nodeId));
    return rows[0]?.id;
  }
  if (where.linkId)
    return (await db.select({ id: links.projectId }).from(links).where(eq(links.id, where.linkId)))[0]?.id;
  if (where.attachmentId) {
    return (
      await db.select({ id: attachments.projectId }).from(attachments).where(eq(attachments.id, where.attachmentId))
    )[0]?.id;
  }
  if (where.commentId) {
    const rows = await db
      .select({ id: sets.projectId })
      .from(comments)
      .innerJoin(nodes, eq(nodes.id, comments.itemId))
      .innerJoin(sets, eq(sets.id, nodes.setId))
      .where(eq(comments.id, where.commentId));
    return rows[0]?.id;
  }
  if (where.baselineId) {
    return (await db.select({ id: baselines.projectId }).from(baselines).where(eq(baselines.id, where.baselineId)))[0]
      ?.id;
  }
  if (where.reviewId) {
    return (await db.select({ id: reviews.projectId }).from(reviews).where(eq(reviews.id, where.reviewId)))[0]?.id;
  }
  return where.projectId;
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Which project thing a route's path names, judged by its parameter names. Null when it names none, or the id is malformed. */
export function whereFromParams(params: Record<string, string | undefined>): Where | null {
  const where: Where | null = params.setId
    ? { setId: params.setId }
    : params.itemId
      ? { nodeId: params.itemId }
      : params.nodeId
        ? { nodeId: params.nodeId }
        : params.linkId
          ? { linkId: params.linkId }
          : params.attachmentId
            ? { attachmentId: params.attachmentId }
            : params.commentId
              ? { commentId: params.commentId }
              : params.baselineId
                ? { baselineId: params.baselineId }
                : params.reviewId
                  ? { reviewId: params.reviewId }
                  : params.projectId
                    ? { projectId: params.projectId }
                    : null;
  return where && Object.values(where).every((id) => UUID.test(id)) ? where : null;
}

/** The signed-in user's role in a project, or null when they may not see it. Instance administrators are admins everywhere. */
export async function roleIn(
  db: Reader,
  user: { id: string; isAdmin: boolean },
  projectId: string,
): Promise<Role | null> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)));
  if (!project) return null;
  if (user.isAdmin) return "admin";
  const [member] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)));
  return member?.role ?? null;
}

/**
 * The permission check every project route starts with. Returns the project id, or null after it has sent the refusal:
 * 404 when the thing does not exist or the user is not in its project (the two are indistinguishable on purpose),
 * 403 when the user is in the project but their role is too low.
 */
export function createAccess(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply, where: Where, needed: Role): Promise<string | null> => {
    const projectId = await projectOf(db, where);
    const role = projectId && req.user ? await roleIn(db, req.user, projectId) : null;
    if (!projectId || !role) {
      reply.code(404).send({ error: "Not found" });
      return null;
    }
    if (!roleAllows(role, needed)) {
      reply.code(403).send({ error: `This needs the ${needed} role in the project. Your role is ${role}.` });
      return null;
    }
    return projectId;
  };
}

/** Works out which project an audited entity belongs to and what it is called now, for the activity stream. */
async function describe(
  tx: Reader,
  entityType: string,
  entityId: string,
): Promise<{ projectId?: string; label?: string }> {
  if (entityType === "project") {
    const [row] = await tx.select({ name: projects.name }).from(projects).where(eq(projects.id, entityId));
    return row ? { projectId: entityId, label: row.name } : {};
  }
  if (entityType === "item" || entityType === "folder" || entityType === "comment") {
    const [row] = await tx
      .select({ projectId: sets.projectId, uid: nodes.uid, name: nodes.name, id: nodes.id })
      .from(nodes)
      .innerJoin(sets, eq(sets.id, nodes.setId))
      .where(eq(nodes.id, entityId));
    if (!row) return {};
    if (!row.uid) return { projectId: row.projectId, label: row.name ?? "" };
    const [latest] = await tx
      .select({ name: itemRevisions.name })
      .from(itemRevisions)
      .where(eq(itemRevisions.itemId, row.id))
      .orderBy(desc(itemRevisions.number))
      .limit(1);
    return { projectId: row.projectId, label: `${row.uid} ${latest?.name ?? ""}`.trim() };
  }
  if (entityType === "link") {
    const up = alias(nodes, "up");
    const down = alias(nodes, "down");
    const [row] = await tx
      .select({ projectId: links.projectId, up: up.uid, down: down.uid })
      .from(links)
      .innerJoin(up, eq(up.id, links.upstreamId))
      .innerJoin(down, eq(down.id, links.downstreamId))
      .where(eq(links.id, entityId));
    return row ? { projectId: row.projectId, label: `${row.up} → ${row.down}` } : {};
  }
  if (entityType === "attachment") {
    const [row] = await tx
      .select({ projectId: attachments.projectId })
      .from(attachments)
      .where(eq(attachments.id, entityId));
    return { projectId: row?.projectId };
  }
  return {};
}

/**
 * Records an audit event. Call it in the same transaction as the write.
 * For a comment, pass the commented item's id as `entityId`. `extra` overrides or adds to what is looked up.
 */
export async function audit(
  tx: Db | Tx,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  extra: { projectId?: string; label?: string; mentions?: string[] } = {},
) {
  const { projectId, label } = { ...(await describe(tx, entityType, entityId)), ...extra };
  const data = label || extra.mentions?.length ? { label, mentions: extra.mentions } : null;
  await tx
    .insert(auditEvents)
    .values({ actorUserId, projectId: projectId ?? null, action, entityType, entityId, data });
}
