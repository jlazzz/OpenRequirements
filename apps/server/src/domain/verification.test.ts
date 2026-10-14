import { expect, test } from "vitest";
import { isFlaky, isOutOfDate, type Outcome, verificationStatus } from "./verification.ts";

const revised = new Date("2026-01-10");
const before = new Date("2026-01-09");
const after = new Date("2026-01-11");
const ran = (outcome: Outcome, revision = 1, recordedAt = after) => ({
  revision: 1,
  result: { outcome, revision, recordedAt },
});

// @req VER-024
test("a requirement with no verifying test is not covered", () => {
  expect(verificationStatus(revised, [])).toEqual({ status: "not_covered", outOfDate: false });
});

test("a test without a result leaves the requirement not run", () => {
  expect(verificationStatus(revised, [{ revision: 1 }])).toEqual({ status: "not_run", outOfDate: false });
  expect(verificationStatus(revised, [ran("pass"), { revision: 1 }]).status).toBe("not_run");
});

test("passing needs every test to pass; one failure makes it failing", () => {
  expect(verificationStatus(revised, [ran("pass"), ran("pass")])).toEqual({ status: "passing", outOfDate: false });
  expect(verificationStatus(revised, [ran("pass"), ran("fail")]).status).toBe("failing");
  expect(verificationStatus(revised, [{ revision: 1 }, ran("fail")]).status).toBe("failing");
});

test("a blocked test counts as not run", () => {
  expect(verificationStatus(revised, [ran("pass"), ran("blocked")]).status).toBe("not_run");
});

test("a result against an older version of the test case is out of date and ignored", () => {
  const oldPass = { revision: 2, result: { outcome: "pass" as const, revision: 1, recordedAt: after } };
  expect(verificationStatus(revised, [oldPass])).toEqual({ status: "not_run", outOfDate: true });
  const oldFail = { ...oldPass, result: { ...oldPass.result, outcome: "fail" as const } };
  expect(verificationStatus(revised, [oldFail, ran("pass")])).toEqual({ status: "not_run", outOfDate: true });
});

test("a result recorded before the requirement's current version is out of date", () => {
  expect(verificationStatus(revised, [ran("pass", 1, before)])).toEqual({ status: "not_run", outOfDate: true });
  expect(verificationStatus(revised, [ran("pass", 1, revised)])).toEqual({ status: "passing", outOfDate: false });
});

test("a test's own result is judged without a requirement", () => {
  const result = { outcome: "pass" as const, revision: 2, recordedAt: before };
  expect(isOutOfDate(result, 2)).toBe(false);
  expect(isOutOfDate(result, 3)).toBe(true);
  expect(isOutOfDate(result, 2, revised)).toBe(true);
});

test("a test is flaky when its last five results changed outcome more than once", () => {
  expect(isFlaky(["pass", "fail", "pass"])).toBe(true);
  expect(isFlaky(["fail", "fail", "pass", "pass"])).toBe(false);
  expect(isFlaky(["pass", "blocked", "fail"])).toBe(true);
  expect(isFlaky(["pass"])).toBe(false);
  expect(isFlaky([])).toBe(false);
  // Only the last five count: the early flapping has aged out.
  expect(isFlaky(["pass", "fail", "pass", "pass", "pass", "pass", "pass"])).toBe(false);
});
