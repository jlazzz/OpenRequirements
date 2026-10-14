/**
 * Every route through a tree of related items, from the first level out to each leaf.
 * Routes that start the same way share the same node objects, which is how a table knows which cells to merge.
 */
export function tracePaths<T extends { children: T[] }>(nodes: T[]): T[][] {
  return nodes.flatMap((node) =>
    node.children.length === 0 ? [[node]] : tracePaths(node.children).map((path) => [node, ...path]),
  );
}
