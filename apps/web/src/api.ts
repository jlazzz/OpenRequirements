import type { RichNode } from "@app/shared";

export type User = { id: string; email: string; name: string; isAdmin: boolean };
export type Session = { user: User | null; needsSetup: boolean };
export type Project = { id: string; name: string; createdAt: string };
export type ProjectSet = { id: string; name: string; uidPrefix: string; itemType: string };
export type TreeNode = {
  id: string;
  setId: string;
  /** Null when the node sits directly under its set. */
  parentId: string | null;
  kind: "folder" | "item";
  name: string;
  /** Items only. */
  uid: string | null;
  /** Items only: the value of the item's Status field, if it has one. */
  status?: string | null;
};
export type Role = "viewer" | "reviewer" | "editor" | "admin";
/** `role` is the signed-in user's role in the project. It only decides what the screens offer; the server checks every action. */
export type ProjectDetail = { project: Project; role: Role; sets: ProjectSet[]; nodes: TreeNode[] };
export const canEdit = (role: Role | undefined) => role === "editor" || role === "admin";
export const canComment = (role: Role | undefined) => role !== undefined && role !== "viewer";
export type Item = {
  id: string;
  setId: string;
  uid: string;
  name: string;
  description: RichNode;
  attributes: Attributes;
  revision: number;
  revisedAt: string;
};
/** The signed-in user's own uncommitted edits to an item. */
export type Draft = {
  baseRevision: number;
  name: string;
  description: RichNode;
  attributes: Attributes;
  updatedAt: string;
};
export type Template = { id: string; name: string; description: string; sets: string[] };

/** Calls the API and returns the JSON body, or throws an Error carrying the server's message. A body makes it a POST unless `method` says otherwise. */
export async function api<T>(path: string, body?: object, method?: "PATCH" | "DELETE" | "PUT"): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? data.error ?? `Request failed (${res.status})`);
  return data;
}
export type Field = {
  id: string;
  name: string;
  type: "text" | "number" | "enum" | "multi_enum" | "date" | "boolean";
  options: string[] | null;
};
/** Field values of an item, keyed by field id. */
export type Attributes = Record<string, unknown>;
export type SetItems = {
  fields: Field[];
  items: { id: string; uid: string; name: string; description: RichNode; attributes: Attributes; revision: number }[];
  /** The signed-in user's own drafts for items of this set. */
  drafts: { itemId: string; baseRevision: number; name: string; description: RichNode; attributes: Attributes }[];
};

/** How a field value reads in a table cell or on an item page. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export type LinkType = { id: string; name: string };
/** A relationship: the upstream item is the source, the downstream item derives from, verifies or otherwise depends on it. */
export type Link = { id: string; typeId: string; upstreamId: string; downstreamId: string };
type Ends<T> = { upstream: T; downstream: T };
/** A live relationship with the versions it was last confirmed against, the current ones, and which end changed since. */
export type LiveLink = Link & { confirmed: Ends<number>; current: Ends<number>; changed: Ends<boolean> };
/** A relationship is suspect when either end has a newer version than the one it was made or last confirmed against. */
export const isSuspect = (link: LiveLink) => link.changed.upstream || link.changed.downstream;
export type ProjectLinks = { linkTypes: LinkType[]; links: LiveLink[] };

/** An item related to another, reached over `linkId`. `stop` says why its own relations are not listed: a loop, or already shown. */
export type TraceNode = { itemId: string; linkId: string; children: TraceNode[]; stop?: "loop" | "repeat" };
export type SetTrace = {
  /** The set whose items count as tests for coverage, if the project has one. */
  targetSetId: string | null;
  rows: {
    itemId: string;
    upstream: TraceNode[];
    downstream: TraceNode[];
    hasDownstream: boolean;
    reachesTarget: boolean;
  }[];
};
export type Impact = { upstream: TraceNode[]; downstream: TraceNode[] };

/** Uploads an image to a project and returns the address to embed in rich text. */
export async function uploadImage(projectId: string, file: File): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/attachments`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 413) throw new Error("Image is larger than 5 MB");
  if (!res.ok) throw new Error(data.error ?? data.message ?? `Upload failed (${res.status})`);
  return data.src;
}

export type Member = { userId: string; name: string; email: string; role: Role };
export type Comment = {
  id: string;
  body: string;
  mentions: string[];
  createdAt: string;
  authorId: string;
  author: string;
  /** Set on a comment made in a review, with that review's name. */
  reviewId?: string | null;
  review?: string | null;
};
export type ActivityEvent = {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data: { label?: string; mentions?: string[] } | null;
};

/** Hands the browser a file to save. */
export function download(filename: string, content: Blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(content);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export type Outcome = "pass" | "fail" | "blocked";
export type VerificationStatus = "not_covered" | "not_run" | "passing" | "failing";
/** A requirement's status, worked out by the server from the latest result of each test linked to it by "Verified by". */
export type RequirementVerification = {
  status: VerificationStatus;
  /** At least one result was ignored because the test case or the requirement changed after it. */
  outOfDate: boolean;
  tests: { itemId: string; outcome: Outcome | null; outOfDate: boolean }[];
};
/** The latest result of a test case. Out of date when the test case has a newer version than the one that was run. */
export type LastResult = { outcome: Outcome; revision: number; recordedAt: string; outOfDate: boolean };
export type Verification = {
  /** Keyed by item id: every item that is not a test case. */
  requirements: Record<string, RequirementVerification>;
  /** Keyed by item id: every test case that has a result. */
  tests: Record<string, LastResult>;
};
export type Result = {
  id: string;
  outcome: Outcome;
  /** The version of the test case that was run. */
  revision: number;
  runAt: string;
  note: string;
  attachmentId: string | null;
  source: "manual" | "junit";
  recordedBy: string;
  recordedAt: string;
  outOfDate: boolean;
};
/** As on the server: item types have no "is a test" flag, so a type whose name contains "test" holds test cases. */
export const isTestSet = (set: ProjectSet | undefined) => set !== undefined && /test/i.test(set.itemType);
