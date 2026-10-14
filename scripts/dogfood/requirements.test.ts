import { readFileSync } from "node:fs";
import { formatUid } from "@app/shared";
import { expect, test } from "vitest";
import { needs, requirements, tests } from "./requirements.ts";

const ids = [...needs, ...requirements, ...tests].map((x) => x.id);

test("external ids are unique and every reference resolves", () => {
  expect(new Set(ids).size).toBe(ids.length);
  const have = new Set(ids);
  for (const r of requirements) for (const n of r.from) expect(have.has(n), `${r.id} from ${n}`).toBe(true);
  for (const t of tests) for (const r of t.verifies) expect(have.has(r), `${t.id} verifies ${r}`).toBe(true);
});

test("every need has requirements and every tested requirement has a test", () => {
  for (const n of needs)
    expect(
      requirements.some((r) => r.from.includes(n.id)),
      n.id,
    ).toBe(true);
  for (const r of requirements)
    if (r.method === "Test")
      expect(
        tests.some((t) => t.verifies.includes(r.id)),
        r.id,
      ).toBe(true);
});

test("requirements are worded as 'shall' statements", () => {
  for (const r of requirements) expect(r.text, r.id).toMatch(/\bshall\b/);
});

test("@req tags in the repository name the test cases that claim that file", () => {
  const expected = tests.flatMap((t, i) => (t.code ? [`${t.code} ${formatUid("VER", i + 1)}`] : []));
  const found = [...new Set(expected.map((e) => e.split(" ")[0] ?? ""))].flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(/@req (VER-\d+)/g)].map((m) => `${file} ${m[1]}`);
  });
  expect(found.sort()).toEqual(expected.sort());
});
