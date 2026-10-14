import { expect, test } from "vitest";
import { matchJunit, parseJunit } from "../../packages/importers/src/index.ts";
import { tagJunit } from "./upload-results.ts";

test("a `@req` tag above a test puts its UID in that test's name in the JUnit report", () => {
  const source = '// @req VER-001, VER-002\ntest("deleting a folder hides it", () => {});\ntest("plain", () => {});\n';
  const xml =
    '<testsuite><testcase classname="a.test.ts" name="deleting a folder hides it"></testcase>' +
    '<testcase classname="a.test.ts" name="plain"></testcase></testsuite>';
  const out = tagJunit(xml, () => source);
  expect(out).toContain('name="VER-001 VER-002 deleting');
  expect(out).toContain('name="plain"');
  const tests = parseJunit(out) ?? [];
  expect(matchJunit(tests, ["VER-001", "VER-002"]).results.map((r) => r.uid)).toEqual(["VER-001", "VER-002"]);
});
