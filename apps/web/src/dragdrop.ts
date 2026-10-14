import { type DropZone, dropPlacement } from "@app/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type DragEvent, useState } from "react";
import { api, type TreeNode } from "./api.ts";

export type Placement = { parentId: string | null; beforeId: string | null };

const MIME = "application/x-node-id";

/**
 * Drag and drop of folders and items, for the explorer and List view. The drop rules are `dropPlacement`; the move is
 * the ordinary move route, which checks permission and the tree rules again. The Actions menu stays the keyboard way.
 * `perform` replaces the single move, for a view that moves a whole selection.
 */
export function useNodeDrag(
  projectId: string,
  nodes: TreeNode[],
  perform?: (draggedId: string, placement: Placement) => Promise<unknown> | undefined,
) {
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [hint, setHint] = useState<{ id: string; zone: DropZone } | null>(null);

  const move = useMutation({
    mutationFn: ({ id, parentId, beforeId }: { id: string; parentId: string | null; beforeId: string | null }) =>
      api(`nodes/${id}/move`, { parentId, beforeId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });

  const plan = (target: TreeNode | "set", setId: string, zoneHint: DropZone | null) => {
    const dragged = nodes.find((n) => n.id === dragId);
    if (!dragged || dragged.setId !== setId) return null;
    const inSet = nodes.filter((n) => n.setId === setId);
    if (target === "set") {
      // Dropped on the set: last at its top level.
      const top = inSet.filter((n) => n.parentId === null);
      const last = top[top.length - 1];
      if (dragged.parentId === null && last?.id === dragged.id) return null;
      return { zone: "inside" as const, placement: { parentId: null, beforeId: null } };
    }
    if (target.setId !== setId) return null;
    const wanted: DropZone[] = zoneHint === "inside" ? ["inside", "before", "after"] : [zoneHint ?? "before"];
    for (const zone of wanted) {
      const placement = dropPlacement(inSet, dragged.id, target.id, zone);
      if (placement) return { zone, placement };
    }
    return null;
  };

  const zoneOf = (event: DragEvent<HTMLElement>): DropZone => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = (event.clientY - box.top) / Math.max(box.height, 1);
    return at < 0.3 ? "before" : at > 0.7 ? "after" : "inside";
  };

  /** Props for a row. `target` is a node, or "set" for a set's own row. */
  const dropProps = (target: TreeNode | "set", setId: string) => {
    const id = target === "set" ? setId : target.id;
    const outline = "2px solid var(--mantine-primary-color-filled)";
    const hinted = hint?.id === id ? hint.zone : null;
    const style: CSSProperties = {
      boxShadow: hinted === "before" ? `inset 0 2px 0 0 var(--mantine-primary-color-filled)` : undefined,
      ...(hinted === "after" ? { boxShadow: `inset 0 -2px 0 0 var(--mantine-primary-color-filled)` } : {}),
      ...(hinted === "inside" ? { outline, outlineOffset: -2 } : {}),
      opacity: dragId === id ? 0.5 : undefined,
    };
    return {
      style,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!dragId) return;
        const found = plan(target, setId, target === "set" ? "inside" : zoneOf(event));
        if (!found) {
          if (hint) setHint(null);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (hint?.id !== id || hint.zone !== found.zone) setHint({ id, zone: found.zone });
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHint(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        const found = dragId ? plan(target, setId, target === "set" ? "inside" : zoneOf(event)) : null;
        const dragged = dragId;
        setHint(null);
        setDragId(null);
        if (!found || !dragged) return;
        setFailure(null);
        if (perform) {
          void Promise.resolve(perform(dragged, found.placement))
            .catch((error: Error) => setFailure(error))
            .finally(() => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }));
        } else move.mutate({ id: dragged, ...found.placement });
      },
    };
  };

  /** Props for the element that starts a drag. `image` is the row shown while dragging. */
  const dragProps = (node: TreeNode, image?: (element: HTMLElement) => Element | null) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.stopPropagation();
      event.dataTransfer.setData(MIME, node.id);
      event.dataTransfer.effectAllowed = "move";
      const row = image?.(event.currentTarget);
      if (row) event.dataTransfer.setDragImage(row, 0, 0);
      setDragId(node.id);
    },
    onDragEnd: () => {
      setDragId(null);
      setHint(null);
    },
  });

  const reset = () => {
    setFailure(null);
    move.reset();
  };
  return { dropProps, dragProps, error: failure ?? move.error, reset };
}
