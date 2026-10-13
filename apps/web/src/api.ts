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
};
export type ProjectDetail = { project: Project; sets: ProjectSet[]; nodes: TreeNode[] };
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
export type ProjectLinks = { linkTypes: LinkType[]; links: Link[] };

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
