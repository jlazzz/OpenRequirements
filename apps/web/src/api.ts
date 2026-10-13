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
  description: string;
  attributes: Attributes;
  revision: number;
  revisedAt: string;
};
export type Template = { id: string; name: string; description: string; sets: string[] };

/** Calls the API and returns the JSON body, or throws an Error carrying the server's message. */
export async function api<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
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
  items: { id: string; uid: string; name: string; attributes: Attributes; revision: number }[];
};

/** How a field value reads in a table cell or on an item page. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value) ? value.join(", ") : String(value);
}
