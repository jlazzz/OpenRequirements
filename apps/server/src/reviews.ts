import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AppContext, Tx } from "./app.ts";
import type { Db } from "./db/client.ts";
import {
  attributeDefinitions,
  baselineEntries,
  baselines,
  comments,
  itemRevisions,
  nodes,
  projectMembers,
  projects,
  reviewMarks,
  reviewParticipants,
  reviews,
  sets,
  signatures,
  testCycles,
  users,
} from "./db/schema.ts";
import { verifyPassword } from "./domain/password.ts";
import {
  addParticipantError,
  closedState,
  itemOutcome,
  MARKS,
  type Mark,
  opensAsInReview,
  removeParticipantError,
  signatureDigest,
  stillReviewed,
} from "./domain/review.ts";
import { roleAllows } from "./domain/roles.ts";
import { notify } from "./mail.ts";
import { searchTextOf } from "./nodes.ts";
import { loadRuns } from "./testruns.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
const people = { type: "array", maxItems: 100, items: uuid } as const;
const APPROVED = "Approved";
const IN_REVIEW = "In review";

/** Everything the rules need about one review: its frozen items, who takes part, each person's latest marks, and the signatures. */
async function loadReview(db: Db | Tx, reviewId: string) {
  const [review] = await db
    .select({
      id: reviews.id,
      projectId: reviews.projectId,
      name: reviews.name,
      state: reviews.state,
      baselineId: reviews.baselineId,
      baseline: baselines.name,
    })
    .from(reviews)
    .innerJoin(baselines, eq(baselines.id, reviews.baselineId))
    .where(eq(reviews.id, reviewId));
  if (!review) return null;
  const items = await db
    .select({
      id: nodes.id,
      uid: nodes.uid,
      revisionId: itemRevisions.id,
      revision: itemRevisions.number,
      deleted: sql<boolean>`${nodes.deletedAt} is not null`,
    })
    .from(baselineEntries)
    .innerJoin(nodes, eq(nodes.id, baselineEntries.nodeId))
    .innerJoin(itemRevisions, eq(itemRevisions.id, baselineEntries.revisionId))
    .where(eq(baselineEntries.baselineId, review.baselineId));
  const participants = await db
    .select({ userId: reviewParticipants.userId, name: users.name, role: reviewParticipants.role })
    .from(reviewParticipants)
    .innerJoin(users, eq(users.id, reviewParticipants.userId))
    .where(and(eq(reviewParticipants.reviewId, reviewId), isNull(reviewParticipants.removedAt)))
    .orderBy(users.name);
  const everyMark = await db
    .selectDistinctOn([reviewMarks.itemId, reviewMarks.userId], {
      itemId: reviewMarks.itemId,
      userId: reviewMarks.userId,
      mark: reviewMarks.mark,
      at: reviewMarks.createdAt,
    })
    .from(reviewMarks)
    .where(eq(reviewMarks.reviewId, reviewId))
    .orderBy(reviewMarks.itemId, reviewMarks.userId, desc(reviewMarks.createdAt));
  // Someone taken out of the review no longer counts: their marks stay in the table but are not read.
  const active = new Set(participants.map((p) => p.userId));
  const marks = everyMark.filter((m) => active.has(m.userId));
  const signed = await db.select().from(signatures).where(eq(signatures.reviewId, reviewId));
  const latest = new Map(marks.map((m) => [`${m.itemId}:${m.userId}`, m.mark]));
  const markOf = (itemId: string, userId: string) => latest.get(`${itemId}:${userId}`);
  const approvers = participants
    .filter((p) => p.role === "approver")
    .map((p) => ({ userId: p.userId, signed: signed.some((s) => s.userId === p.userId) }));
  /** What a signature by this person covers: every item with their decision on it. */
  const decisionsOf = (userId: string) =>
    items.map((item) => ({ uid: item.uid ?? "", revision: item.revision, mark: markOf(item.id, userId) ?? "cleared" }));
  return { review, items, participants, marks, signed, markOf, approvers, decisionsOf };
}

/** Reviews: people look at a baseline's frozen items, comment, mark them reviewed, and approvers sign a decision on each. */
export function reviewRoutes({
  app,
  db,
  requireUser,
  requireSession,
  audit,
  access,
  loginLimit,
  mail,
  takeReauth,
}: AppContext) {
  /** Locks an open review for a write, so marks, signatures and closing cannot interleave. */
  async function lockOpen(tx: Tx, reviewId: string) {
    const [row] = await tx.select({ state: reviews.state }).from(reviews).where(eq(reviews.id, reviewId)).for("update");
    return row?.state === "open";
  }
  const closed = { error: [409, "This review is closed"] } as const;

  app.get(
    "/api/projects/:projectId/reviews",
    { onRequest: requireUser, schema: { params: idParam("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const rows = await db
        .select({
          id: reviews.id,
          name: reviews.name,
          state: reviews.state,
          baselineId: reviews.baselineId,
          baseline: baselines.name,
          createdAt: reviews.createdAt,
          closedAt: reviews.closedAt,
          author: users.name,
          // The signed-in user's part in the review, if they have one.
          myRole: reviewParticipants.role,
        })
        .from(reviews)
        .innerJoin(baselines, eq(baselines.id, reviews.baselineId))
        .innerJoin(users, eq(users.id, reviews.createdBy))
        .leftJoin(
          reviewParticipants,
          and(
            eq(reviewParticipants.reviewId, reviews.id),
            eq(reviewParticipants.userId, req.user?.id as string),
            isNull(reviewParticipants.removedAt),
          ),
        )
        .where(eq(reviews.projectId, projectId))
        .orderBy(desc(reviews.createdAt));
      // Progress per review: items marked by anyone, items every approver approved, and whether it waits for this person.
      // shortcut: loads each review whole, count in SQL when a project has hundreds of reviews
      const userId = req.user?.id as string;
      const withProgress = await Promise.all(
        rows.map(async (row) => {
          const loaded = await loadReview(db, row.id);
          if (!loaded) return { ...row, total: 0, reviewed: 0, approved: 0, waiting: false };
          const { items, marks, markOf, approvers, signed } = loaded;
          const marked = new Set(marks.filter((m) => m.mark !== "cleared").map((m) => m.itemId));
          const approved = items.filter(
            (item) => itemOutcome(approvers.map((a) => markOf(item.id, a.userId))) === "approved",
          ).length;
          const mineDone = items.filter((item) => markOf(item.id, userId) && markOf(item.id, userId) !== "cleared");
          const waiting =
            row.state === "open" &&
            (row.myRole === "approver"
              ? !signed.some((s) => s.userId === userId)
              : row.myRole === "reviewer" && mineDone.length < items.length);
          return { ...row, total: items.length, reviewed: marked.size, approved, waiting };
        }),
      );
      return { reviews: withProgress };
    },
  );

  // A review is made from a baseline, so what is reviewed cannot change underneath the reviewers.
  app.post(
    "/api/projects/:projectId/reviews",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["name", "baselineId"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
            baselineId: uuid,
            reviewers: people,
            approvers: people,
          },
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const body = req.body as { name: string; baselineId: string; reviewers?: string[]; approvers?: string[] };
      const name = body.name.trim();
      // Someone named in both lists is an approver: an approver can do everything a reviewer can.
      const roles = new Map<string, "reviewer" | "approver">([
        ...(body.reviewers ?? []).map((id) => [id, "reviewer"] as const),
        ...(body.approvers ?? []).map((id) => [id, "approver"] as const),
      ]);
      if (roles.size === 0) return reply.code(400).send({ error: "Choose at least one reviewer or approver" });

      const [item] = await db
        .select({ id: baselineEntries.nodeId })
        .from(baselineEntries)
        .innerJoin(baselines, eq(baselines.id, baselineEntries.baselineId))
        .where(
          and(
            eq(baselines.id, body.baselineId),
            eq(baselines.projectId, projectId),
            isNotNull(baselineEntries.revisionId),
          ),
        )
        .limit(1);
      if (!item)
        return reply.code(400).send({ error: "Choose a baseline of this project that holds at least one item" });

      // Taking part needs the Reviewer role or higher. Instance administrators are admins of every project.
      const able = await db
        .select({ id: users.id, isAdmin: users.isAdmin, role: projectMembers.role })
        .from(users)
        .leftJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, projectId)))
        .where(and(inArray(users.id, [...roles.keys()]), isNull(users.deactivatedAt)));
      const ok = able.filter((u) => u.isAdmin || (u.role && roleAllows(u.role, "reviewer")));
      if (ok.length !== roles.size) {
        return reply.code(400).send({
          error: "Reviewers and approvers must be active members of this project with the Reviewer role or higher",
        });
      }

      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(reviews)
          .values({ projectId, baselineId: body.baselineId, name, createdBy: req.user?.id as string })
          .returning({ id: reviews.id });
        if (!row) throw new Error("review insert returned no row");
        await tx
          .insert(reviewParticipants)
          .values([...roles].map(([userId, role]) => ({ reviewId: row.id, userId, role, addedBy: req.user?.id })));
        await audit(tx, req.user?.id ?? null, "review.create", "review", row.id, { projectId, label: name });
        // Opening the review shows on each item that it is being reviewed.
        const opened = await loadReview(tx, row.id);
        if (opened) await writeStatus(tx, opened.items, req.user?.id as string, projectId, name, IN_REVIEW);
        await notify(
          tx,
          mail,
          [...roles].map(([userId, role]) => ({
            userId,
            projectId,
            kind: "review" as const,
            text: `${req.user?.name} asked you to ${role === "approver" ? "approve" : "review"} “${name}”`,
            path: `/projects/${projectId}/reviews/${row.id}`,
            actorId: req.user?.id ?? null,
          })),
        );
        return row.id;
      });
      return reply.code(201).send({ id });
    },
  );

  // Every open review the signed-in person takes part in, across projects.
  app.get("/api/reviews/mine", { onRequest: requireUser }, async (req) => {
    const rows = await db
      .select({
        id: reviews.id,
        name: reviews.name,
        projectId: reviews.projectId,
        project: projects.name,
        baseline: baselines.name,
        createdAt: reviews.createdAt,
        role: reviewParticipants.role,
      })
      .from(reviewParticipants)
      .innerJoin(reviews, eq(reviews.id, reviewParticipants.reviewId))
      .innerJoin(projects, eq(projects.id, reviews.projectId))
      .innerJoin(baselines, eq(baselines.id, reviews.baselineId))
      .where(
        and(
          eq(reviewParticipants.userId, req.user?.id as string),
          isNull(reviewParticipants.removedAt),
          eq(reviews.state, "open"),
          isNull(projects.archivedAt),
        ),
      )
      .orderBy(desc(reviews.createdAt));
    return { reviews: rows };
  });

  // Adds a person to an open review. They get an invitation like everyone named when it was made.
  app.post(
    "/api/reviews/:reviewId/participants",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("reviewId"),
        body: {
          type: "object",
          required: ["userId", "role"],
          additionalProperties: false,
          properties: { userId: uuid, role: { enum: ["reviewer", "approver"] } },
        },
      },
    },
    async (req, reply) => {
      const { reviewId } = req.params as { reviewId: string };
      const projectId = await access(req, reply, { reviewId }, "editor");
      if (!projectId) return reply;
      const { userId, role } = req.body as { userId: string; role: "reviewer" | "approver" };
      const [able] = await db
        .select({ isAdmin: users.isAdmin, role: projectMembers.role })
        .from(users)
        .leftJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, projectId)))
        .where(and(eq(users.id, userId), isNull(users.deactivatedAt)));
      if (!able || !(able.isAdmin || (able.role && roleAllows(able.role, "reviewer")))) {
        return reply.code(400).send({
          error: "Reviewers and approvers must be active members of this project with the Reviewer role or higher",
        });
      }
      const result = await db.transaction(async (tx) => {
        if (!(await lockOpen(tx, reviewId))) return closed;
        const loaded = await loadReview(tx, reviewId);
        if (!loaded) return closed;
        const refusal = addParticipantError(
          loaded.participants.map((p) => ({ ...p, signed: false })),
          userId,
        );
        if (refusal) return { error: [409, refusal] } as const;
        await tx.insert(reviewParticipants).values({ reviewId, userId, role, addedBy: req.user?.id });
        await audit(tx, req.user?.id ?? null, `review.participant.add.${role}`, "review", reviewId, {
          projectId,
          label: loaded.review.name,
        });
        return { ok: true as const };
      });
      if (!("ok" in result)) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Takes a person out of an open review. Their row stays, with `removedAt`; their marks stay but no longer count.
  app.delete(
    "/api/reviews/:reviewId/participants/:userId",
    {
      onRequest: requireUser,
      schema: {
        params: { type: "object", required: ["reviewId", "userId"], properties: { reviewId: uuid, userId: uuid } },
      },
    },
    async (req, reply) => {
      const { reviewId, userId } = req.params as { reviewId: string; userId: string };
      const projectId = await access(req, reply, { reviewId }, "editor");
      if (!projectId) return reply;
      const result = await db.transaction(async (tx) => {
        if (!(await lockOpen(tx, reviewId))) return closed;
        const loaded = await loadReview(tx, reviewId);
        if (!loaded) return closed;
        const refusal = removeParticipantError(
          loaded.participants.map((p) => ({ ...p, signed: loaded.signed.some((s) => s.userId === p.userId) })),
          userId,
        );
        if (refusal) return { error: [409, refusal] } as const;
        await tx
          .update(reviewParticipants)
          .set({ removedAt: new Date(), removedBy: req.user?.id })
          .where(
            and(
              eq(reviewParticipants.reviewId, reviewId),
              eq(reviewParticipants.userId, userId),
              isNull(reviewParticipants.removedAt),
            ),
          );
        await audit(tx, req.user?.id ?? null, "review.participant.remove", "review", reviewId, {
          projectId,
          label: loaded.review.name,
        });
        return { ok: true as const };
      });
      if (!("ok" in result)) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // One review: its people, marks, comments and signatures. The frozen items themselves are read from its baseline.
  app.get(
    "/api/reviews/:reviewId",
    { onRequest: requireUser, schema: { params: idParam("reviewId") } },
    async (req, reply) => {
      const { reviewId } = req.params as { reviewId: string };
      if (!(await access(req, reply, { reviewId }, "viewer"))) return reply;
      const loaded = await loadReview(db, reviewId);
      if (!loaded) return reply.code(404).send({ error: "Review not found" });
      const closer = alias(users, "closer");
      const [detail] = await db
        .select({
          createdAt: reviews.createdAt,
          author: users.name,
          closedAt: reviews.closedAt,
          closedBy: closer.name,
          statusSet: reviews.statusSet,
        })
        .from(reviews)
        .innerJoin(users, eq(users.id, reviews.createdBy))
        .leftJoin(closer, eq(closer.id, reviews.closedBy))
        .where(eq(reviews.id, reviewId));
      const { review, items, participants, marks, signed, markOf, approvers, decisionsOf } = loaded;
      const posted = await db
        .select({
          id: comments.id,
          itemId: comments.itemId,
          body: comments.body,
          mentions: comments.mentions,
          createdAt: comments.createdAt,
          authorId: comments.authorId,
          author: users.name,
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(and(eq(comments.reviewId, reviewId), isNull(comments.deletedAt)))
        .orderBy(comments.createdAt);
      return {
        review: { ...review, ...detail },
        participants: participants.map((person) => {
          const signature = signed.find((s) => s.userId === person.userId);
          return {
            ...person,
            signature: signature && {
              meaning: signature.meaning,
              signerName: signature.signerName,
              signedAt: signature.signedAt,
              // False when what was signed no longer matches the signature: the record was altered afterwards.
              valid:
                signature.digest ===
                signatureDigest({
                  review: review.name,
                  baseline: review.baseline,
                  signerEmail: signature.signerEmail,
                  signerName: signature.signerName,
                  meaning: signature.meaning,
                  signedAt: signature.signedAt,
                  decisions: decisionsOf(person.userId),
                }),
            },
          };
        }),
        marks: marks.filter((m) => m.mark !== "cleared"),
        // Per item: approved when every approver approved it, rejected if any rejected it.
        outcomes: Object.fromEntries(
          items.map((item) => [item.id, itemOutcome(approvers.map(({ userId }) => markOf(item.id, userId)))]),
        ),
        comments: posted,
        // The test cycles that were run to verify this review's baseline: the evidence its approvers sign for.
        cycles: await Promise.all(
          (
            await db
              .select({ id: testCycles.id, name: testCycles.name, closedAt: testCycles.closedAt })
              .from(testCycles)
              .where(eq(testCycles.baselineId, review.baselineId))
              .orderBy(testCycles.createdAt)
          ).map(async (cycle) => {
            const runs: Record<string, number> = {};
            for (const run of await loadRuns(db, eq(testCycles.id, cycle.id))) {
              runs[run.state] = (runs[run.state] ?? 0) + 1;
            }
            return { ...cycle, runs };
          }),
        ),
      };
    },
  );

  // Marks items: a reviewer says "reviewed", an approver decides "approved" or "rejected". "cleared" takes a mark back.
  // One request covers one item or many ("Approve all remaining"). Marks are appended, never changed.
  app.post(
    "/api/reviews/:reviewId/marks",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("reviewId"),
        body: {
          type: "object",
          required: ["itemIds", "mark"],
          additionalProperties: false,
          properties: {
            itemIds: { type: "array", minItems: 1, maxItems: 5000, items: uuid },
            mark: { enum: [...MARKS] },
          },
        },
      },
    },
    async (req, reply) => {
      const { reviewId } = req.params as { reviewId: string };
      const projectId = await access(req, reply, { reviewId }, "reviewer");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const body = req.body as { itemIds: string[]; mark: Mark };
      const itemIds = [...new Set(body.itemIds)];

      const result = await db.transaction(async (tx) => {
        if (!(await lockOpen(tx, reviewId))) return closed;
        const loaded = await loadReview(tx, reviewId);
        const me = loaded?.participants.find((p) => p.userId === userId);
        if (!loaded || !me) return { error: [403, "You are not a reviewer or approver of this review"] } as const;
        if (me.role !== "approver" && (body.mark === "approved" || body.mark === "rejected")) {
          return { error: [403, "Only an approver of this review can approve or reject"] } as const;
        }
        if (loaded.signed.some((s) => s.userId === userId)) {
          return { error: [409, "You have signed this review. Your decisions are final."] } as const;
        }
        const known = new Set(loaded.items.map((item) => item.id));
        if (!itemIds.every((id) => known.has(id)))
          return { error: [400, "An item is not part of this review"] } as const;
        for (let i = 0; i < itemIds.length; i += 1000) {
          await tx
            .insert(reviewMarks)
            .values(itemIds.slice(i, i + 1000).map((itemId) => ({ reviewId, itemId, userId, mark: body.mark })));
        }
        await audit(tx, userId, `review.mark.${body.mark}`, "review", reviewId, {
          projectId,
          label: `${loaded.review.name}: ${itemIds.length} ${itemIds.length === 1 ? "item" : "items"}`,
        });
        return { marked: itemIds.length };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // Electronic signature: the approver enters their password again, and their decisions become final.
  // The meaning is worked out from what they decided: "approval" when they approved every item, "rejection" otherwise.
  app.post(
    "/api/reviews/:reviewId/sign",
    {
      // An access token is not the person: a signature needs a browser session and the password.
      onRequest: [requireUser, requireSession],
      config: loginLimit,
      schema: {
        params: idParam("reviewId"),
        body: {
          type: "object",
          additionalProperties: false,
          // Left out by someone who just confirmed themself at the identity provider instead (oidc.ts).
          properties: { password: { type: "string", minLength: 1, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const { reviewId } = req.params as { reviewId: string };
      const projectId = await access(req, reply, { reviewId }, "reviewer");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const [signer] = await db
        .select({ name: users.name, email: users.email, hash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId));
      const before = await loadReview(db, reviewId);
      if (!signer || !before) return reply.code(404).send({ error: "Review not found" });
      if (!before.approvers.some((a) => a.userId === userId)) {
        return reply.code(403).send({ error: "Only an approver of this review can sign it" });
      }
      const { password } = (req.body ?? {}) as { password?: string };
      if (password === undefined ? !(await takeReauth(req)) : !(await verifyPassword(password, signer.hash))) {
        // Failed signing attempts are part of the record.
        await audit(db, userId, "review.sign.failed", "review", reviewId, { projectId, label: before.review.name });
        return reply.code(400).send({
          error:
            password === undefined ? "Confirm who you are at the identity provider first" : "The password is wrong",
        });
      }

      const result = await db.transaction(async (tx) => {
        if (!(await lockOpen(tx, reviewId))) return closed;
        const loaded = await loadReview(tx, reviewId);
        if (!loaded) return closed;
        if (loaded.signed.some((s) => s.userId === userId)) {
          return { error: [409, "You have already signed this review"] } as const;
        }
        const decisions = loaded.decisionsOf(userId);
        const open = decisions.filter((d) => d.mark !== "approved" && d.mark !== "rejected").length;
        if (open > 0) {
          return { error: [400, `Decide every item first: ${open} of ${decisions.length} have no decision`] } as const;
        }
        const meaning = decisions.every((d) => d.mark === "approved") ? ("approval" as const) : ("rejection" as const);
        const signed = { signerName: signer.name, signerEmail: signer.email, meaning, signedAt: new Date() };
        const digest = signatureDigest({
          ...signed,
          review: loaded.review.name,
          baseline: loaded.review.baseline,
          decisions,
        });
        await tx.insert(signatures).values({ reviewId, userId, ...signed, digest });
        await audit(tx, userId, `review.sign.${meaning}`, "review", reviewId, { projectId, label: loaded.review.name });
        return { meaning, signedAt: signed.signedAt };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Closes a review for good. Its state is worked out here, once: see closedState in domain/review.ts.
  // An approved review can write Status = Approved to its items, as a new version of each.
  app.post(
    "/api/reviews/:reviewId/close",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("reviewId"),
        body: { type: "object", additionalProperties: false, properties: { setStatus: { type: "boolean" } } },
      },
    },
    async (req, reply) => {
      const { reviewId } = req.params as { reviewId: string };
      const projectId = await access(req, reply, { reviewId }, "editor");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const { setStatus } = (req.body ?? {}) as { setStatus?: boolean };

      const result = await db.transaction(async (tx) => {
        if (!(await lockOpen(tx, reviewId))) return closed;
        const loaded = await loadReview(tx, reviewId);
        if (!loaded) return closed;
        const state = closedState(
          loaded.items.map((item) => item.id),
          loaded.approvers,
          loaded.markOf,
        );
        const statusSet = state === "approved" && setStatus === true;
        const applied = statusSet
          ? await writeStatus(tx, loaded.items, userId, projectId, loaded.review.name, APPROVED)
          : { updated: 0, skipped: [] };
        await tx
          .update(reviews)
          .set({ state, closedBy: userId, closedAt: new Date(), statusSet })
          .where(eq(reviews.id, reviewId));
        await audit(tx, userId, `review.close.${state}`, "review", reviewId, { projectId, label: loaded.review.name });
        return { state, ...applied };
      });
      if ("error" in result) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  /**
   * Writes Status = `target` ("In review" when a review opens, "Approved" when it closes approved) to every reviewed
   * item that is still what was reviewed, as a new version marked `statusOnly`. An item that was edited or deleted
   * since the baseline is skipped: nobody reviewed its current text. Versions that only changed Status do not count
   * as edits, so the "In review" version written at opening does not stop the "Approved" one.
   */
  async function writeStatus(
    tx: Tx,
    items: { id: string; uid: string | null; revisionId: string; revision: number; deleted: boolean }[],
    userId: string,
    projectId: string,
    reviewName: string,
    target: typeof APPROVED | typeof IN_REVIEW,
  ) {
    const ids = items.map((item) => item.id);
    if (ids.length === 0) return { updated: 0, skipped: [] };
    // Locks the items, so a version saved at the same moment cannot slip between the check and the write.
    await tx.select({ id: nodes.id }).from(nodes).where(inArray(nodes.id, ids)).orderBy(nodes.id).for("update");
    const current = await tx
      .selectDistinctOn([itemRevisions.itemId], {
        itemId: itemRevisions.itemId,
        number: itemRevisions.number,
        name: itemRevisions.name,
        description: itemRevisions.description,
        attributes: itemRevisions.attributes,
        // The item type's Status field, when it has one that can say `target`.
        statusField: attributeDefinitions.id,
        options: attributeDefinitions.options,
      })
      .from(itemRevisions)
      .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
      .innerJoin(sets, eq(sets.id, nodes.setId))
      .leftJoin(
        attributeDefinitions,
        and(
          eq(attributeDefinitions.itemTypeId, sets.itemTypeId),
          eq(attributeDefinitions.name, "Status"),
          eq(attributeDefinitions.type, "enum"),
          isNull(attributeDefinitions.archivedAt),
        ),
      )
      .where(inArray(itemRevisions.itemId, ids))
      .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
    const latest = new Map(current.map((row) => [row.itemId, row]));
    const history = await tx
      .select({ itemId: itemRevisions.itemId, number: itemRevisions.number, statusOnly: itemRevisions.statusOnly })
      .from(itemRevisions)
      .where(inArray(itemRevisions.itemId, ids));

    const skipped: string[] = [];
    let updated = 0;
    for (const item of items) {
      const now = latest.get(item.id);
      const later = history.filter((h) => h.itemId === item.id && h.number > item.revision);
      if (!now || item.deleted || !stillReviewed(later)) {
        skipped.push(item.uid ?? "");
        continue;
      }
      if (!now.statusField || !now.options?.includes(target)) continue;
      const status = now.attributes[now.statusField];
      if (target === IN_REVIEW ? !opensAsInReview(status, now.options) : status === APPROVED) continue;
      const attributes = { ...now.attributes, [now.statusField]: target };
      await tx.insert(itemRevisions).values({
        itemId: item.id,
        number: now.number + 1,
        name: now.name,
        description: now.description,
        attributes,
        statusOnly: true,
        authorId: userId,
        changeReason: `${target === APPROVED ? "Approved in" : "Opened in"} review "${reviewName}"`.slice(0, 500),
      });
      const searchText = searchTextOf(item.uid ?? "", now.name, now.description, attributes);
      await tx.update(nodes).set({ searchText }).where(eq(nodes.id, item.id));
      // One event per item for the audit log. The activity stream shows the review's single event instead.
      await audit(tx, userId, target === APPROVED ? "review.item.approve" : "review.item.open", "approval", item.id, {
        projectId,
        label: `${item.uid} ${now.name}`,
      });
      updated += 1;
    }
    return { updated, skipped: skipped.sort() };
  }
}
