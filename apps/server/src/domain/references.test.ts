import { expect, test } from "vitest";
import { readStatus, referenceKind, statusRequest } from "./references.ts";

test("the kind of a reference is judged from its URL", () => {
  expect(referenceKind("https://acme.atlassian.net/browse/PUMP-12")).toBe("jira");
  expect(referenceKind("https://jira.acme.com/browse/PUMP-12")).toBe("jira");
  expect(referenceKind("https://github.com/acme/pump/issues/4")).toBe("github");
  expect(referenceKind("https://github.com/acme/pump/blob/main/src/a.c")).toBe("github");
  expect(referenceKind("https://git.acme.com/fw/pump/-/merge_requests/9")).toBe("gitlab");
  expect(referenceKind("https://gitlab.com/acme/pump")).toBe("gitlab");
  expect(referenceKind("https://example.com/spec.pdf")).toBe("other");
});

test("a reference is read through a connection to its own server only", () => {
  const github = { kind: "github" as const, baseUrl: "https://github.com/", token: "t" };
  expect(statusRequest(github, "https://github.com/acme/pump/pull/7")).toEqual({
    url: "https://api.github.com/repos/acme/pump/issues/7",
    headers: { accept: "application/json", authorization: "Bearer t" },
  });
  expect(statusRequest(github, "https://github.com.evil.com/acme/pump/pull/7")).toBeNull();
  expect(statusRequest(github, "https://github.com/acme/pump/blob/main/a.c")).toBeNull();
  const enterprise = { kind: "github" as const, baseUrl: "https://ghe.acme.com", token: null };
  expect(statusRequest(enterprise, "https://ghe.acme.com/a/b/issues/1")?.url).toBe(
    "https://ghe.acme.com/api/v3/repos/a/b/issues/1",
  );

  const jira = { kind: "jira" as const, baseUrl: "https://acme.com/jira", token: "me@acme.com:abc" };
  expect(statusRequest(jira, "https://acme.com/jira/browse/PUMP-12")).toEqual({
    url: "https://acme.com/jira/rest/api/2/issue/PUMP-12?fields=summary,status",
    headers: { accept: "application/json", authorization: `Basic ${btoa("me@acme.com:abc")}` },
  });
  const gitlab = { kind: "gitlab" as const, baseUrl: "https://git.acme.com", token: "glpat" };
  expect(statusRequest(gitlab, "https://git.acme.com/fw/pump/-/issues/3")).toEqual({
    url: "https://git.acme.com/api/v4/projects/fw%2Fpump/issues/3",
    headers: { accept: "application/json", "private-token": "glpat" },
  });
});

test("title and state are read from each tool's answer", () => {
  expect(readStatus("github", { title: "Crash", state: "closed" })).toEqual({ title: "Crash", state: "closed" });
  expect(readStatus("gitlab", { title: "Fix", state: "opened" })).toEqual({ title: "Fix", state: "open" });
  expect(readStatus("gitlab", { title: "Fix", state: "merged" })).toEqual({ title: "Fix", state: "closed" });
  const jira = (key: string) => ({ fields: { summary: "Alarm", status: { statusCategory: { key } } } });
  expect(readStatus("jira", jira("done"))).toEqual({ title: "Alarm", state: "closed" });
  expect(readStatus("jira", jira("indeterminate"))).toEqual({ title: "Alarm", state: "open" });
  expect(readStatus("jira", { message: "nope" })).toBeNull();
  expect(readStatus("github", null)).toBeNull();
});
