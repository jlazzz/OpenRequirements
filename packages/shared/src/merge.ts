import type { RichNode } from "./richtext.ts";

/** What a person edits on an item: its name, its description, and its field values keyed by field id. */
export type ItemContent = { name: string; description: RichNode; attributes: Record<string, unknown> };

/**
 * Three-way merge of two edits of one item that both started from `base`. A part changed on one side only takes that
 * side's value. A part changed differently on both sides is a conflict: its key ("name", "description" or a field id)
 * is listed, and it takes `mine` unless the key is in `takeTheirs`.
 */
export function mergeItem(
  base: ItemContent,
  mine: ItemContent,
  theirs: ItemContent,
  takeTheirs: string[] = [],
): { merged: ItemContent; conflicts: string[] } {
  const conflicts: string[] = [];
  const pick = <T>(key: string, b: T, m: T, t: T): T => {
    if (same(m, b) || same(m, t)) return t;
    if (same(t, b)) return m;
    conflicts.push(key);
    return takeTheirs.includes(key) ? t : m;
  };
  const attributes: Record<string, unknown> = {};
  const ids = new Set([
    ...Object.keys(base.attributes),
    ...Object.keys(mine.attributes),
    ...Object.keys(theirs.attributes),
  ]);
  for (const id of ids) {
    const value = pick(id, base.attributes[id], mine.attributes[id], theirs.attributes[id]);
    if (value !== undefined && value !== null) attributes[id] = value;
  }
  const name = pick("name", base.name, mine.name, theirs.name);
  const description = pick("description", base.description, mine.description, theirs.description);
  return { merged: { name, description, attributes }, conflicts };
}

/** Equal as data. Key order is ignored, because the database does not keep it, and a missing value equals null. */
function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Which parts differ between two versions of an item, as merge keys: "name", "description" or a field id. */
export function changedParts(before: ItemContent, after: ItemContent): string[] {
  const ids = new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)]);
  return [
    ...(same(before.name, after.name) ? [] : ["name"]),
    ...(same(before.description, after.description) ? [] : ["description"]),
    ...[...ids].filter((id) => !same(before.attributes[id], after.attributes[id])),
  ];
}
