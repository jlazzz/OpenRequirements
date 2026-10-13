/** The revision numbers of a link's two ends. */
export type Ends = { upstream: number; downstream: number };

/**
 * Which ends of a link changed since it was made or last confirmed. The link is suspect when either did.
 * `confirmed` is the latest confirmation, or the revisions stored on the link when it has never been confirmed.
 */
export function changedEnds(confirmed: Ends, current: Ends): { upstream: boolean; downstream: boolean } {
  return { upstream: current.upstream > confirmed.upstream, downstream: current.downstream > confirmed.downstream };
}

export function isSuspect(confirmed: Ends, current: Ends): boolean {
  const changed = changedEnds(confirmed, current);
  return changed.upstream || changed.downstream;
}
