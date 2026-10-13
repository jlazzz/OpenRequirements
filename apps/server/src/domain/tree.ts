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
