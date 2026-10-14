import { expect, test } from "vitest";
import { type Frozen, traceabilityCsv, verificationCsv } from "./validation-pack.ts";

const frozen: Frozen = {
  baseline: { id: "b", name: "v1.0.0", createdAt: "2026-01-01" },
  entries: [
    { id: "r", kind: "item", uid: "SYS-1", name: "Requirement", revision: 1 },
    { id: "t", kind: "item", uid: "VER-1", name: "Test", revision: 1 },
  ],
  links: [{ typeId: "lt", upstreamId: "r", downstreamId: "t", suspect: true }],
  verification: { r: { status: "passing", outOfDate: false } },
};

test("the matrix names both ends and the relationship type", () => {
  expect(traceabilityCsv(frozen, { lt: "Verified by" })).toContain("SYS-1,Requirement,Verified by,VER-1,Test,Yes");
});

test("a requirement row carries its test's result and the CI run it came from", () => {
  const report = {
    requirements: { r: { tests: [{ itemId: "t" }] } },
    tests: { t: { id: "res", outcome: "pass", runAt: "2026-01-02", recordedBy: "CI" } },
  };
  const ci = new Map([["res", { id: "c", pipeline: "CI", branch: "main", commit: "abc", buildUrl: "https://x/1" }]]);
  expect(verificationCsv(frozen, report, ci)).toContain(
    "SYS-1,Requirement,Passing,,VER-1,pass,2026-01-02,CI,CI,abc,https://x/1",
  );
});
