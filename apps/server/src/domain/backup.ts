import { docError, type RichNode } from "@app/shared";
import { checkAttributes } from "./attributes.ts";
import type { Mark, ReviewState } from "./review.ts";

export const BACKUP_FORMAT = "open-requirements-backup";
// Version 2 added linkRevisions and baselineLinks.suspect. Version 3 added verificationResults. Version 4 added reviews,
// their participants, marks and signatures, itemRevisions.statusOnly and comments.reviewId. Older files are still restored.
export const BACKUP_VERSION = 4;

/** A whole project as one JSON document. Timestamps are ISO strings. Ids are only meaningful inside the file. */
export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: 1 | 2 | 3 | typeof BACKUP_VERSION;
  exportedAt: string;
  project: { id: string; name: string; createdAt: string };
  /** Everyone the project's history mentions. Matched to accounts by email when restoring. */
  users: { id: string; email: string; name: string }[];
  members: { userId: string; role: "viewer" | "reviewer" | "editor" | "admin" }[];
  itemTypes: { id: string; name: string }[];
  attributeDefinitions: {
    id: string;
    itemTypeId: string;
    name: string;
    type: string;
    options: string[] | null;
    position: number;
  }[];
  sets: { id: string; itemTypeId: string; name: string; uidPrefix: string; uidCounter: number; position: number }[];
  nodes: {
    id: string;
    setId: string;
    parentId: string | null;
    kind: "folder" | "item";
    name: string | null;
    uid: string | null;
    position: number;
    createdAt: string;
    deletedAt: string | null;
  }[];
  itemRevisions: {
    id: string;
    itemId: string;
    number: number;
    name: string;
    description: RichNode;
    attributes: Record<string, unknown>;
    authorId: string;
    changeReason: string | null;
    statusOnly: boolean;
    createdAt: string;
  }[];
  linkTypes: { id: string; name: string; position: number }[];
  links: {
    id: string;
    linkTypeId: string;
    upstreamId: string;
    downstreamId: string;
    upstreamRevision: number;
    downstreamRevision: number;
    createdBy: string;
    createdAt: string;
    deletedAt: string | null;
  }[];
  /** Confirmations of suspect links. */
  linkRevisions: {
    id: string;
    linkId: string;
    number: number;
    upstreamRevision: number;
    downstreamRevision: number;
    confirmedBy: string;
    createdAt: string;
  }[];
  /** Results of running test cases. `attachmentId` is the evidence, one of `attachments`. */
  verificationResults: {
    id: string;
    itemId: string;
    revision: number;
    outcome: "pass" | "fail" | "blocked";
    runAt: string;
    note: string;
    attachmentId: string | null;
    source: "manual" | "junit";
    recordedBy: string;
    createdAt: string;
  }[];
  comments: {
    id: string;
    itemId: string;
    authorId: string;
    body: string;
    mentions: string[];
    reviewId: string | null;
    createdAt: string;
    deletedAt: string | null;
  }[];
  baselines: { id: string; setId: string | null; name: string; createdBy: string; createdAt: string }[];
  baselineEntries: {
    baselineId: string;
    nodeId: string;
    revisionId: string | null;
    parentId: string | null;
    position: number;
    name: string | null;
  }[];
  baselineLinks: { baselineId: string; linkId: string; suspect: boolean | null }[];
  reviews: {
    id: string;
    baselineId: string;
    name: string;
    state: ReviewState;
    createdBy: string;
    createdAt: string;
    closedBy: string | null;
    closedAt: string | null;
    statusSet: boolean;
  }[];
  reviewParticipants: { reviewId: string; userId: string; role: "reviewer" | "approver" }[];
  reviewMarks: { id: string; reviewId: string; itemId: string; userId: string; mark: Mark; createdAt: string }[];
  /** Electronic signatures. The digest covers names and UIDs, not ids, so it still checks out after a restore. */
  signatures: {
    id: string;
    reviewId: string;
    userId: string;
    meaning: "approval" | "rejection";
    signerName: string;
    signerEmail: string;
    digest: string;
    signedAt: string;
  }[];
  /** `data` is the file's bytes in base64. */
  attachments: { id: string; createdBy: string; createdAt: string; data: string }[];
  auditEvents: {
    id: string;
    at: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    data: { label?: string; mentions?: string[] } | null;
  }[];
};

type Collection = Exclude<keyof Backup, "format" | "version" | "exportedAt" | "project">;

// Every field that points at another row, and the collection that row must be in.
const REFERENCES: [Collection, string, Collection][] = [
  ["members", "userId", "users"],
  ["attributeDefinitions", "itemTypeId", "itemTypes"],
  ["sets", "itemTypeId", "itemTypes"],
  ["nodes", "setId", "sets"],
  ["nodes", "parentId", "nodes"],
  ["itemRevisions", "itemId", "nodes"],
  ["itemRevisions", "authorId", "users"],
  ["links", "linkTypeId", "linkTypes"],
  ["links", "upstreamId", "nodes"],
  ["links", "downstreamId", "nodes"],
  ["links", "createdBy", "users"],
  ["linkRevisions", "linkId", "links"],
  ["linkRevisions", "confirmedBy", "users"],
  ["verificationResults", "itemId", "nodes"],
  ["verificationResults", "attachmentId", "attachments"],
  ["verificationResults", "recordedBy", "users"],
  ["comments", "itemId", "nodes"],
  ["comments", "authorId", "users"],
  ["comments", "mentions", "users"],
  ["comments", "reviewId", "reviews"],
  ["reviews", "baselineId", "baselines"],
  ["reviews", "createdBy", "users"],
  ["reviews", "closedBy", "users"],
  ["reviewParticipants", "reviewId", "reviews"],
  ["reviewParticipants", "userId", "users"],
  ["reviewMarks", "reviewId", "reviews"],
  ["reviewMarks", "itemId", "nodes"],
  ["reviewMarks", "userId", "users"],
  ["signatures", "reviewId", "reviews"],
  ["signatures", "userId", "users"],
  ["baselines", "setId", "sets"],
  ["baselines", "createdBy", "users"],
  ["baselineEntries", "baselineId", "baselines"],
  ["baselineEntries", "nodeId", "nodes"],
  ["baselineEntries", "revisionId", "itemRevisions"],
  ["baselineEntries", "parentId", "nodes"],
  ["baselineLinks", "baselineId", "baselines"],
  ["baselineLinks", "linkId", "links"],
  ["attachments", "createdBy", "users"],
  ["auditEvents", "actorUserId", "users"],
];

/** The nodes with every folder before what it contains, or null when the tree has a loop. */
export function parentsFirst<T extends { id: string; parentId: string | null }>(nodes: T[]): T[] | null {
  const children = new Map<string | null, T[]>();
  for (const node of nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  const ordered = [...(children.get(null) ?? [])];
  for (const node of ordered) ordered.push(...(children.get(node.id) ?? []));
  return ordered.length === nodes.length ? ordered : null;
}

/**
 * Why a backup cannot be restored, or null when it can. Trust boundary: a backup is a file someone uploads.
 * Its shape is checked by the route's schema first; this checks that it is consistent and refers to nothing outside itself,
 * so a restore can never attach rows to another project.
 */
export function backupError(backup: Backup): string | null {
  const ids = {} as Record<Collection, Set<string>>;
  const all = new Set<string>([backup.project.id]);
  for (const [name, rows] of Object.entries(backup)) {
    if (!Array.isArray(rows)) continue;
    ids[name as Collection] = new Set();
    for (const row of rows as { id?: string }[]) {
      if (row.id === undefined) continue;
      if (all.has(row.id)) return `The backup uses the id ${row.id} twice`;
      all.add(row.id);
      ids[name as Collection].add(row.id);
    }
  }
  for (const [collection, field, target] of REFERENCES) {
    for (const row of backup[collection] as Record<string, unknown>[]) {
      for (const id of [row[field]].flat()) {
        if (id !== null && !ids[target].has(id as string)) {
          return `The backup is not complete: ${collection}.${field} refers to ${String(id)}, which is not in ${target}`;
        }
      }
    }
  }

  const nodes = new Map(backup.nodes.map((node) => [node.id, node]));
  for (const node of backup.nodes) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && (parent.kind !== "folder" || parent.setId !== node.setId)) {
      return "The backup has a node whose parent is not a folder in the same set";
    }
    if ((node.kind === "item") !== (node.uid !== null))
      return "The backup has an item without an id, or a folder with one";
  }
  if (!parentsFirst(backup.nodes)) return "The backup has folders that contain each other";
  const isItem = (id: string) => nodes.get(id)?.kind === "item";
  if (!backup.links.every((link) => isItem(link.upstreamId) && isItem(link.downstreamId))) {
    return "The backup has a relationship that does not join two items";
  }

  if (!backup.verificationResults.every((result) => isItem(result.itemId))) {
    return "The backup has a verification result on something that is not an item";
  }

  const typeOfSet = new Map(backup.sets.map((set) => [set.id, set.itemTypeId]));
  for (const revision of backup.itemRevisions) {
    const item = nodes.get(revision.itemId);
    if (item?.kind !== "item") return "The backup has a version of something that is not an item";
    const where = `${item.uid} version ${revision.number}`;
    const badText = docError(revision.description);
    if (badText) return `${where}: ${badText}`;
    const itemTypeId = typeOfSet.get(item.setId);
    const fields = backup.attributeDefinitions.filter((field) => field.itemTypeId === itemTypeId);
    const checked = checkAttributes(fields, revision.attributes);
    if ("error" in checked) return `${where}: ${checked.error}`;
  }
  return null;
}

const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A copy of `value` with every id found in `ids` replaced, wherever it appears: id fields, references,
 * the field ids that key an item's attributes, mentions, and attachment addresses inside rich text.
 */
export function remapIds<T>(value: T, ids: Map<string, string>): T {
  return JSON.parse(JSON.stringify(value).replace(UUIDS, (id) => ids.get(id.toLowerCase()) ?? id));
}
