/** Formats a requirement UID from a document prefix and its monotonic counter, e.g. `SRS-001`. */
export function formatUid(prefix: string, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) throw new RangeError(`invalid UID counter: ${counter}`);
  return `${prefix}-${String(counter).padStart(3, "0")}`;
}
