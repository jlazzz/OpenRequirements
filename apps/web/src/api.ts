export type User = { id: string; email: string; name: string; isAdmin: boolean };
export type Session = { user: User | null; needsSetup: boolean };
export type Project = { id: string; name: string; createdAt: string };
export type ProjectSet = { id: string; name: string; uidPrefix: string; itemType: string };
export type ProjectDetail = { project: Project; sets: ProjectSet[] };
export type Template = { id: string; name: string; description: string; sets: string[] };

/** Calls the API and returns the JSON body, or throws an Error carrying the server's message. */
export async function api<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? data.error ?? `Request failed (${res.status})`);
  return data;
}
