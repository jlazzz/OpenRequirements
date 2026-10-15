// Test setup through the public API, so a test can start from the state it is about rather than click to it.
import { test as base, type Page } from "@playwright/test";

export const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "3100"}`;
export const ADMIN = { email: "admin@example.com", password: "correct horse battery", name: "Ada Admin" };

export class Api {
  cookie = "";

  async call<T = Record<string, never>>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}/api/${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        origin: API,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0] ?? "";
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (res.status >= 300) throw new Error(`${method} ${path}: ${res.status} ${data?.error ?? ""}`);
    return data as T;
  }

  /** Signs in, creating the first administrator when the instance is empty. */
  async signIn() {
    const session = await this.call<{ needsSetup?: boolean }>("GET", "session");
    if (session.needsSetup) await this.call("POST", "setup", ADMIN);
    await this.call("POST", "login", { email: ADMIN.email, password: ADMIN.password });
    return this;
  }
}

export const rich = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** A new project from the Standard template: its id, and its sets by name. */
export async function newProject(api: Api, name: string) {
  const { project } = await api.call<{ project: { id: string } }>("POST", "projects", { name, templateId: "standard" });
  const detail = await api.call<{ sets: { id: string; name: string }[] }>("GET", `projects/${project.id}`);
  const sets = Object.fromEntries(detail.sets.map((s) => [s.name, s.id]));
  return { id: project.id, sets };
}

export async function newItem(api: Api, setId: string, name: string) {
  const { node } = await api.call<{ node: { id: string; uid: string } }>("POST", `sets/${setId}/nodes`, {
    kind: "item",
    name,
  });
  return node;
}

export const test = base.extend<{ api: Api; signedIn: Page }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern, even when empty.
  api: async ({}, use) => use(await new Api().signIn()),
  // A page that already has the administrator's session cookie.
  signedIn: async ({ page, api }, use) => {
    const value = api.cookie.split("=").slice(1).join("=");
    const name = api.cookie.split("=")[0] ?? "";
    await page.context().addCookies([{ name, value, url: `http://localhost:${process.env.E2E_WEB_PORT ?? "5273"}` }]);
    await use(page);
  },
});
export { expect } from "@playwright/test";
