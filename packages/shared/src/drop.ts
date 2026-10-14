export type DropNode = { id: string; parentId: string | null; kind: "folder" | "item" };
export type DropZone = "before" | "inside" | "after";

/**
 * Where a dragged node lands when dropped on `targetId`: just before it, just after it, or inside it (last).
 * `nodes` are the live nodes of one set in display order. Returns the arguments of the move route, or null when
 * the drop is not allowed or would change nothing. The same rules as the server's `placementError`, which still decides.
 */
export function dropPlacement(
  nodes: DropNode[],
  draggedId: string,
  targetId: string,
  zone: DropZone,
): { parentId: string | null; beforeId: string | null } | null {
  const dragged = nodes.find((n) => n.id === draggedId);
  const target = nodes.find((n) => n.id === targetId);
  if (!dragged || !target || draggedId === targetId) return null;

  const parentId = zone === "inside" ? target.id : target.parentId;
  const parent = nodes.find((n) => n.id === parentId);
  if (parent && dragged.kind === "folder" && parent.kind === "item") return null;
  // Nothing goes under itself or under something inside it.
  for (let at = parent; at; at = nodes.find((n) => n.id === at?.parentId)) if (at.id === draggedId) return null;

  const siblings = nodes.filter((n) => n.parentId === parentId && n.id !== draggedId);
  let beforeId: string | null = null;
  if (zone === "before") beforeId = target.id;
  if (zone === "after") beforeId = siblings[siblings.findIndex((n) => n.id === target.id) + 1]?.id ?? null;

  // Already there: same parent and the same neighbour after it.
  if (dragged.parentId === parentId) {
    const own = nodes.filter((n) => n.parentId === parentId);
    const next = own[own.findIndex((n) => n.id === draggedId) + 1]?.id ?? null;
    if (next === beforeId) return null;
  }
  return { parentId, beforeId };
}
