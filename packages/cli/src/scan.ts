/** A requirement tag in source code: `@req SYS-042`. Several may sit on one line. */
const TAG = /@req\s+([A-Z][A-Z0-9_]*-\d+)\b/g;

export type CodeReference = { uid: string; url: string; title: string };

/** The UIDs tagged in one file, each with the lines it is tagged on. */
export function findTags(text: string): Map<string, number[]> {
  const found = new Map<string, number[]>();
  for (const [index, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(TAG)) {
      const uid = match[1] as string;
      found.set(uid, [...(found.get(uid) ?? []), index + 1]);
    }
  }
  return found;
}

/**
 * One reference per tagged UID and file, pointing at the file on the branch so the link stays the same from commit to
 * commit. The title names the lines and the commit. GitLab writes file addresses with `/-/blob/`, GitHub with `/blob/`.
 */
export function codeReferences(
  files: { path: string; text: string }[],
  repository: string,
  branch: string,
  commit: string,
): CodeReference[] {
  const repo = repository.replace(/\/+$/, "");
  const blob = repo.includes("gitlab") ? "/-/blob/" : "/blob/";
  return files.flatMap(({ path, text }) =>
    [...findTags(text)].map(([uid, lines]) => ({
      uid,
      url: `${repo}${blob}${branch}/${path.split("/").map(encodeURIComponent).join("/")}`,
      title: `${path}:${lines.join(",")} @ ${commit.slice(0, 7)}`,
    })),
  );
}
