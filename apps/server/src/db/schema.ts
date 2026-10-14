import type { RichNode } from "@app/shared";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { Mark, ReviewState } from "../domain/review.ts";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  // Stored lower-case so the unique constraint is case-insensitive.
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  isAdmin: boolean().notNull().default(false),
  createdAt: createdAt(),
  // Set when an administrator deactivates the account: it cannot sign in, but its history stays.
  deactivatedAt: timestamp({ withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  // SHA-256 of the cookie token, so a database leak does not leak usable sessions.
  tokenHash: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

/** A personal access token, for scripts and CI. It acts as its user. Revoked, never removed, so the audit log keeps its meaning. */
export const apiTokens = pgTable("api_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  name: text().notNull(),
  // SHA-256 of the token. The token itself is shown once, when it is made.
  tokenHash: text().notNull().unique(),
  createdAt: createdAt(),
  revokedAt: timestamp({ withTimezone: true }),
});

export const projects = pgTable("projects", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: createdAt(),
  archivedAt: timestamp({ withTimezone: true }),
});

/** A kind of item with its own fields. Created from the project template; stored per project so it can become editable later. */
export const itemTypes = pgTable("item_types", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  name: text().notNull(),
  // "test" marks the type whose items are test cases: they take results, steps and runs. Null for every other type.
  role: text().$type<"test">(),
});

export const attributeDefinitions = pgTable("attribute_definitions", {
  id: uuid().primaryKey().defaultRandom(),
  itemTypeId: uuid()
    .notNull()
    .references(() => itemTypes.id),
  name: text().notNull(),
  // One of FieldType in domain/templates.ts.
  type: text().notNull(),
  // Allowed values, for enum and multi_enum only.
  options: jsonb().$type<string[]>(),
  position: integer().notNull(),
});

/** A container holding items of exactly one item type. */
export const sets = pgTable(
  "sets",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id),
    itemTypeId: uuid()
      .notNull()
      .references(() => itemTypes.id),
    name: text().notNull(),
    uidPrefix: text().notNull(),
    // Last UID number handed out. Only ever increases, so UIDs are never reused.
    uidCounter: integer().notNull().default(0),
    position: integer().notNull(),
  },
  (t) => [unique().on(t.projectId, t.uidPrefix)],
);

/** The tree inside a set: folders and items. Soft delete only: rows are never removed. */
export const nodes = pgTable(
  "nodes",
  {
    id: uuid().primaryKey().defaultRandom(),
    setId: uuid()
      .notNull()
      .references(() => sets.id),
    // Null means directly under the set. Otherwise a folder in the same set.
    parentId: uuid().references((): AnyPgColumn => nodes.id),
    kind: text().$type<"folder" | "item">().notNull(),
    // Folders only. An item's name lives in its revisions.
    name: text(),
    // Items only, e.g. SYS-042. Never reused.
    uid: text(),
    // Order among siblings.
    position: integer().notNull(),
    // Items only: UID, current name, description text and field values, for search. Derived from the latest revision.
    searchText: text().notNull().default(""),
    createdAt: createdAt(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique().on(t.setId, t.uid)],
);

/** Append-only. The current state of an item is its highest-numbered revision. */
export const itemRevisions = pgTable(
  "item_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    itemId: uuid()
      .notNull()
      .references(() => nodes.id),
    number: integer().notNull(),
    name: text().notNull(),
    // Rich text as editor JSON (ADR 0005).
    description: jsonb().$type<RichNode>().notNull(),
    attributes: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    changeReason: text(),
    // True when this version says the same as the one before it apart from the Status field. Set once, when it is saved.
    // Such a version does not make relationships suspect or test results out of date (ADR 0010).
    statusOnly: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.itemId, t.number)],
);

/** One user's auto-saved, uncommitted edits to an item. Private to its author; "Save version" turns it into a revision. */
export const itemDrafts = pgTable(
  "item_drafts",
  {
    itemId: uuid()
      .notNull()
      .references(() => nodes.id),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    // The revision the edits started from.
    baseRevision: integer().notNull(),
    name: text().notNull(),
    description: jsonb().$type<RichNode>().notNull(),
    attributes: jsonb().$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.authorId] })],
);

export const linkTypes = pgTable("link_types", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  name: text().notNull(),
  position: integer().notNull(),
});

/** A directional relationship between two items of one project. Rows are never changed, only soft-deleted. */
export const links = pgTable("links", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  linkTypeId: uuid()
    .notNull()
    .references(() => linkTypes.id),
  upstreamId: uuid()
    .notNull()
    .references(() => nodes.id),
  downstreamId: uuid()
    .notNull()
    .references(() => nodes.id),
  // The revisions of both ends when the link was made. The link is suspect once either end has a newer one.
  upstreamRevision: integer().notNull(),
  downstreamRevision: integer().notNull(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  deletedAt: timestamp({ withTimezone: true }),
});

/** Append-only. One row each time someone confirms a suspect link: the revisions of both ends they confirmed it against. */
export const linkRevisions = pgTable(
  "link_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    linkId: uuid()
      .notNull()
      .references(() => links.id),
    number: integer().notNull(),
    upstreamRevision: integer().notNull(),
    downstreamRevision: integer().notNull(),
    confirmedBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.linkId, t.number)],
);

/** An uploaded image. The bytes are a file named by this id in the attachments directory. */
export const attachments = pgTable("attachments", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  contentType: text().notNull(),
  size: integer().notNull(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

/** Append-only. The outcome of running one test case once. A mistake is corrected by recording another result. */
export const verificationResults = pgTable(
  "verification_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    // The test case.
    itemId: uuid()
      .notNull()
      .references(() => nodes.id),
    // The revision number of the test case that was run.
    revision: integer().notNull(),
    // One of Outcome in domain/verification.ts.
    outcome: text().$type<"pass" | "fail" | "blocked">().notNull(),
    // When the test was run, as stated by whoever recorded it. `createdAt` is when it was recorded, and decides what is out of date.
    runAt: timestamp({ withTimezone: true }).notNull(),
    note: text().notNull().default(""),
    // Evidence: an uploaded image of the same project.
    attachmentId: uuid().references(() => attachments.id),
    source: text().$type<"manual" | "junit" | "run">().notNull(),
    recordedBy: uuid()
      .notNull()
      .references(() => users.id),
    // Set when the result came from a test run: a run is finished once, by writing this row.
    runId: uuid().references((): AnyPgColumn => testRuns.id),
    // Where the defect of a failed run is tracked, in an external tool.
    defectUrl: text(),
    createdAt: createdAt(),
  },
  // The latest result of an item is looked up on every status request.
  (t) => [index().on(t.itemId, t.createdAt), unique().on(t.runId)],
);

/** A named selection of test cases for a goal, e.g. "Release 1.2 verification". Soft-deleted. */
export const testPlans = pgTable("test_plans", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  name: text().notNull(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  deletedAt: timestamp({ withTimezone: true }),
});

/** A test case in a plan. Taken out by setting `removedAt`; a test case is live in a plan at most once. */
export const testPlanCases = pgTable(
  "test_plan_cases",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => testPlans.id),
    itemId: uuid()
      .notNull()
      .references(() => nodes.id),
    // Cases with the same group name are shown and run together. Empty means no group.
    groupName: text().notNull().default(""),
    position: integer().notNull(),
    removedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.planId)],
);

/** One pass through a plan. Only `closedBy` and `closedAt` ever change, once: closing is permanent. */
export const testCycles = pgTable(
  "test_cycles",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => testPlans.id),
    name: text().notNull(),
    // Free text, e.g. "Bench 2, firmware 1.4.0".
    environment: text().notNull().default(""),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    closedBy: uuid().references(() => users.id),
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.planId)],
);

/** One execution of one test case in a cycle. Only `assigneeId` ever changes. Its state is worked out from its step results. */
export const testRuns = pgTable(
  "test_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    cycleId: uuid()
      .notNull()
      .references(() => testCycles.id),
    itemId: uuid()
      .notNull()
      .references(() => nodes.id),
    // The version of the test case that was current when the cycle started. The run shows and records against this one.
    revisionId: uuid()
      .notNull()
      .references(() => itemRevisions.id),
    // Copied from the plan when the cycle started, so the cycle keeps its grouping when the plan changes.
    groupName: text().notNull().default(""),
    position: integer().notNull(),
    assigneeId: uuid().references(() => users.id),
  },
  (t) => [index().on(t.cycleId), index().on(t.assigneeId)],
);

/** Append-only. What a tester recorded on one step of a run; the latest row per step is the one that counts. */
export const stepResults = pgTable(
  "step_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id),
    // Counted from 1, in the frozen version of the test case.
    step: integer().notNull(),
    outcome: text().$type<"pass" | "fail" | "blocked">().notNull(),
    // What actually happened, as plain text.
    actual: text().notNull().default(""),
    recordedBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.runId)],
);

/** Who may open a project, and with which role. Instance administrators have access to every project without a row here. */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    // One of Role in domain/roles.ts.
    role: text().$type<"viewer" | "reviewer" | "editor" | "admin">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

/** An invitation to create an account. The link carries a token; only its hash is stored. */
export const invitations = pgTable("invitations", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull(),
  tokenHash: text().notNull().unique(),
  invitedBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  acceptedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
});

export const comments = pgTable("comments", {
  id: uuid().primaryKey().defaultRandom(),
  itemId: uuid()
    .notNull()
    .references(() => nodes.id),
  authorId: uuid()
    .notNull()
    .references(() => users.id),
  body: text().notNull(),
  // Ids of the users mentioned with @Name, resolved when the comment was posted.
  mentions: jsonb().$type<string[]>().notNull().default([]),
  // Set when the comment was made in a review, on the item as the review's baseline froze it.
  reviewId: uuid().references((): AnyPgColumn => reviews.id),
  createdAt: createdAt(),
  deletedAt: timestamp({ withTimezone: true }),
});

/** A named, frozen snapshot of a set or a whole project. Rows here and in the two tables below are never changed. */
export const baselines = pgTable("baselines", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  // Null means the whole project.
  setId: uuid().references(() => sets.id),
  name: text().notNull(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

/** One folder or item as it was when the baseline was made: where it sat, and for an item, which revision was current. */
export const baselineEntries = pgTable(
  "baseline_entries",
  {
    baselineId: uuid()
      .notNull()
      .references(() => baselines.id),
    nodeId: uuid()
      .notNull()
      .references(() => nodes.id),
    // Items only.
    revisionId: uuid().references(() => itemRevisions.id),
    parentId: uuid(),
    position: integer().notNull(),
    // Folders only: folder names are not versioned, so the name is copied.
    name: text(),
  },
  (t) => [primaryKey({ columns: [t.baselineId, t.nodeId] })],
);

/** The relationships that were live when the baseline was made. Links never change, so the id is enough. */
export const baselineLinks = pgTable(
  "baseline_links",
  {
    baselineId: uuid()
      .notNull()
      .references(() => baselines.id),
    linkId: uuid()
      .notNull()
      .references(() => links.id),
    // Whether the link was suspect at that moment. Null for baselines made before suspect links existed.
    suspect: boolean(),
  },
  (t) => [primaryKey({ columns: [t.baselineId, t.linkId] })],
);

/** A review of a baseline's items. Only `state`, `closedBy`, `closedAt` and `statusSet` ever change, once, when it is closed. */
export const reviews = pgTable("reviews", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  baselineId: uuid()
    .notNull()
    .references(() => baselines.id),
  name: text().notNull(),
  // One of ReviewState in domain/review.ts.
  state: text().$type<ReviewState>().notNull().default("open"),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  closedBy: uuid().references(() => users.id),
  closedAt: timestamp({ withTimezone: true }),
  // Whether closing wrote Status = Approved to the items.
  statusSet: boolean().notNull().default(false),
});

/** Who takes part in a review. An approver can do everything a reviewer can. Fixed when the review is created. */
export const reviewParticipants = pgTable(
  "review_participants",
  {
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    role: text().$type<"reviewer" | "approver">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId] })],
);

/** Append-only. What a participant recorded on an item of a review; their latest row per item is the one that counts. */
export const reviewMarks = pgTable(
  "review_marks",
  {
    id: uuid().primaryKey().defaultRandom(),
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id),
    itemId: uuid()
      .notNull()
      .references(() => nodes.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    mark: text().$type<Mark>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.reviewId)],
);

/**
 * An approver's electronic signature on their decisions in a review. Append-only, one per approver and review.
 * The name and email are copied, so the signature reads the same if the account is renamed later.
 */
export const signatures = pgTable(
  "signatures",
  {
    id: uuid().primaryKey().defaultRandom(),
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    meaning: text().$type<"approval" | "rejection">().notNull(),
    signerName: text().notNull(),
    signerEmail: text().notNull(),
    // signatureDigest in domain/review.ts: ties the signature to exactly what was signed.
    digest: text().notNull(),
    signedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [unique().on(t.reviewId, t.userId)],
);

/** Append-only log of every write. Never update or delete rows. */
export const auditEvents = pgTable("audit_events", {
  id: uuid().primaryKey().defaultRandom(),
  at: createdAt(),
  actorUserId: uuid().references(() => users.id),
  // Set when the event belongs to a project, so the project's activity stream can find it.
  projectId: uuid().references(() => projects.id),
  action: text().notNull(),
  entityType: text().notNull(),
  entityId: text().notNull(),
  // { label }: what the entity was called at the time, e.g. "SYS-001 Supply voltage". { mentions }: user ids, on comments.
  data: jsonb().$type<{ label?: string; mentions?: string[] }>(),
});
