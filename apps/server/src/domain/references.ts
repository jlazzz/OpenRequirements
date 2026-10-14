/** What a reference points at, judged from its URL. "code" is a tag found in source code by the scanner in packages/cli. */
export type ReferenceKind = "jira" | "github" | "gitlab" | "code" | "other";
/** A project's connection to another tool, as far as reading a reference needs. */
export type Connection = { kind: "jira" | "github" | "gitlab"; baseUrl: string; token: string | null };

const JIRA_KEY = /\/browse\/([A-Z][A-Z0-9_]*-\d+)(?:[/?#]|$)/;
const GITHUB_PATH = /^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)(?:[/?#]|$)/;
const GITLAB_PATH = /^\/(.+?)\/-\/(issues|merge_requests)\/(\d+)(?:[/?#]|$)/;

export function referenceKind(url: string): ReferenceKind {
  const { hostname, pathname } = new URL(url);
  if (GITLAB_PATH.test(pathname) || hostname.includes("gitlab")) return "gitlab";
  if (hostname === "github.com" || (hostname.includes("github") && GITHUB_PATH.test(pathname))) return "github";
  if (JIRA_KEY.test(pathname) || hostname.endsWith(".atlassian.net")) return "jira";
  return "other";
}

/** A base URL as it is stored: no trailing slash. */
export const normalBase = (url: string) => url.replace(/\/+$/, "");

/**
 * The API request that reads a reference's title and state through a connection, or null when the reference is not
 * an issue or pull request of that connection's tool. The token is only ever sent to the connection's own server.
 */
export function statusRequest(
  connection: Connection,
  url: string,
): { url: string; headers: Record<string, string> } | null {
  const base = normalBase(connection.baseUrl);
  if (!url.startsWith(`${base}/`)) return null;
  const path = new URL(url).pathname.slice(new URL(base).pathname.replace(/\/$/, "").length);
  const token = connection.token;
  const headers: Record<string, string> = { accept: "application/json" };
  if (connection.kind === "jira") {
    const key = JIRA_KEY.exec(path)?.[1];
    if (!key) return null;
    // Jira Cloud takes "email:api-token" as basic auth; Jira Data Center takes a personal access token.
    if (token) headers.authorization = token.includes(":") ? `Basic ${btoa(token)}` : `Bearer ${token}`;
    return { url: `${base}/rest/api/2/issue/${key}?fields=summary,status`, headers };
  }
  if (connection.kind === "github") {
    const match = GITHUB_PATH.exec(path);
    if (!match) return null;
    const api = base === "https://github.com" ? "https://api.github.com" : `${base}/api/v3`;
    if (token) headers.authorization = `Bearer ${token}`;
    // The issues endpoint answers for pull requests too.
    return { url: `${api}/repos/${match[1]}/${match[2]}/issues/${match[3]}`, headers };
  }
  const match = GITLAB_PATH.exec(path);
  if (!match?.[1]) return null;
  if (token) headers["private-token"] = token;
  return { url: `${base}/api/v4/projects/${encodeURIComponent(match[1])}/${match[2]}/${match[3]}`, headers };
}

/** The title and open or closed state in an API answer from statusRequest, or null when it does not look like one. */
export function readStatus(
  kind: Connection["kind"],
  body: unknown,
): { title: string; state: "open" | "closed" } | null {
  const data = body as Record<string, unknown> | null;
  if (kind === "jira") {
    const fields = data?.fields as { summary?: unknown; status?: { statusCategory?: { key?: unknown } } } | undefined;
    if (typeof fields?.summary !== "string") return null;
    return { title: fields.summary, state: fields.status?.statusCategory?.key === "done" ? "closed" : "open" };
  }
  if (typeof data?.title !== "string") return null;
  // GitLab says "opened"; "closed", "merged" and "locked" are all finished.
  return { title: data.title, state: data.state === "open" || data.state === "opened" ? "open" : "closed" };
}
