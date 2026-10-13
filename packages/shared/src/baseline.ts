type Versioned = { id: string; revision: number };
export type BaselineChange = "added" | "removed" | "changed";

/**
 * What differs between a baseline and now, by item id. Items that are the same in both are left out.
 * "added" is live now but not in the baseline; "removed" was in the baseline and is no longer live.
 */
export function compareBaseline(frozen: Versioned[], current: Versioned[]): Map<string, BaselineChange> {
  const changes = new Map<string, BaselineChange>();
  const now = new Map(current.map((item) => [item.id, item.revision]));
  const then = new Set(frozen.map((item) => item.id));
  for (const item of frozen) {
    const revision = now.get(item.id);
    if (revision === undefined) changes.set(item.id, "removed");
    else if (revision !== item.revision) changes.set(item.id, "changed");
  }
  for (const item of current) if (!then.has(item.id)) changes.set(item.id, "added");
  return changes;
}
