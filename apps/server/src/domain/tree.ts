type Node = { id: string; parentId: string | null };

/** Ids of everything below a node, at any depth. */
export function descendantIds(nodes: Node[], id: string): Set<string> {
  const found = new Set<string>();
  const walk = (parentId: string) => {
    for (const node of nodes) {
      if (node.parentId === parentId && !found.has(node.id)) {
        found.add(node.id);
        walk(node.id);
      }
    }
  };
  walk(id);
  return found;
}

/**
 * The new sibling order after placing `id` just before `beforeId`, or last when `beforeId` is null.
 * `siblings` may or may not already contain `id`. Returns null when `beforeId` is not one of the other siblings.
 */
export function placeBefore(siblings: string[], id: string, beforeId: string | null): string[] | null {
  const others = siblings.filter((s) => s !== id);
  if (beforeId === null) return [...others, id];
  const index = others.indexOf(beforeId);
  return index < 0 ? null : [...others.slice(0, index), id, ...others.slice(index)];
}

/**
 * Why a node of `kind` cannot go under `parentId`, or null when it can. `nodes` are the live nodes of the set it goes into,
 * so a parent outside them is in another set. `id` is the node being moved, or null for a new one.
 * The rules: a child stays in its parent's set, a folder cannot sit under an item, and nothing goes under itself.
 */
export function placementError(
  nodes: (Node & { kind: "folder" | "item" })[],
  id: string | null,
  kind: "folder" | "item",
  parentId: string | null,
): string | null {
  if (parentId === null) return null;
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return "The parent must be a folder or item in the same set";
  if (kind === "folder" && parent.kind === "item") return "A folder cannot be placed under an item";
  if (id && (parentId === id || descendantIds(nodes, id).has(parentId))) return "Nothing can be placed under itself";
  return null;
}
