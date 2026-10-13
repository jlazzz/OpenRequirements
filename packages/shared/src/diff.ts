export type DiffPart = { text: string; change: "same" | "added" | "removed" };

// shortcut: texts whose word counts multiply past this are shown as fully replaced, switch to a linear-space diff (Myers) if long descriptions need word-level detail
const MAX_CELLS = 4_000_000;

/** Word-level difference between two texts. Joining the "same" and "added" parts gives `after`; "same" and "removed" gives `before`. */
export function diffWords(before: string, after: string): DiffPart[] {
  // Split into words and the whitespace between them, keeping both, so the parts rebuild the text exactly.
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const parts: DiffPart[] = [];
  const push = (text: string, change: DiffPart["change"]) => {
    const last = parts.at(-1);
    if (last?.change === change) last.text += text;
    else parts.push({ text, change });
  };
  if (a.length * b.length > MAX_CELLS) {
    if (before) push(before, "removed");
    if (after) push(after, "added");
    return parts;
  }

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as Uint32Array;
      const below = lcs[i + 1] as Uint32Array;
      row[j] = a[i] === b[j] ? (below[j + 1] as number) + 1 : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i] as string, "same");
      i++;
      j++;
    } else if (((lcs[i + 1] as Uint32Array)[j] as number) >= ((lcs[i] as Uint32Array)[j + 1] as number)) {
      push(a[i++] as string, "removed");
    } else {
      push(b[j++] as string, "added");
    }
  }
  while (i < a.length) push(a[i++] as string, "removed");
  while (j < b.length) push(b[j++] as string, "added");
  return parts;
}
