/** A relationship, reduced to what walking needs. */
export type TraceLink = { id: string; upstreamId: string; downstreamId: string };
export type Direction = "upstream" | "downstream";

/**
 * A related item, reached over `linkId`, with the items related to it in turn.
 * `stop` says why a branch ends early: "loop" when the item is already on the path leading here,
 * "repeat" when it was expanded earlier in the same walk.
 */
export type TraceNode = { itemId: string; linkId: string; children: TraceNode[]; stop?: "loop" | "repeat" };

/** Indexes the links once, so many walks over one project stay cheap. */
export function traceGraph(links: TraceLink[]) {
  const from: Record<Direction, Map<string, { itemId: string; linkId: string }[]>> = {
    upstream: new Map(),
    downstream: new Map(),
  };
  const add = (direction: Direction, at: string, itemId: string, linkId: string) => {
    const list = from[direction].get(at);
    if (list) list.push({ itemId, linkId });
    else from[direction].set(at, [{ itemId, linkId }]);
  };
  for (const link of links) {
    add("downstream", link.upstreamId, link.downstreamId, link.id);
    add("upstream", link.downstreamId, link.upstreamId, link.id);
  }

  return {
    /**
     * The items related to `startId` in one direction, as a tree, `maxDepth` levels deep at most.
     * A path never passes through the same item twice, so a loop of links ends the branch.
     * With `once`, an item reached by several routes is expanded only the first time (depth first, in link order),
     * which keeps the tree no larger than the number of links however densely the items are linked.
     */
    walk(
      startId: string,
      direction: Direction,
      { maxDepth = Number.POSITIVE_INFINITY, once = false }: { maxDepth?: number; once?: boolean } = {},
    ): TraceNode[] {
      const path = new Set([startId]);
      const expanded = new Set<string>();
      const level = (id: string, depth: number): TraceNode[] => {
        if (depth >= maxDepth) return [];
        return (from[direction].get(id) ?? []).map(({ itemId, linkId }) => {
          if (path.has(itemId)) return { itemId, linkId, children: [], stop: "loop" };
          if (once && expanded.has(itemId)) return { itemId, linkId, children: [], stop: "repeat" };
          expanded.add(itemId);
          path.add(itemId);
          const children = level(itemId, depth + 1);
          path.delete(itemId);
          return { itemId, linkId, children };
        });
      };
      return level(startId, 0);
    },

    /** Whether any item downstream of `startId`, at any depth, is one of `targets`. The start itself does not count. */
    reaches(startId: string, targets: ReadonlySet<string>): boolean {
      const seen = new Set([startId]);
      const queue = [startId];
      for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
        for (const { itemId } of from.downstream.get(id) ?? []) {
          if (targets.has(itemId)) return true;
          if (!seen.has(itemId)) {
            seen.add(itemId);
            queue.push(itemId);
          }
        }
      }
      return false;
    },
  };
}
