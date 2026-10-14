export const OUTCOMES = ["pass", "fail", "blocked"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type VerificationStatus = "not_covered" | "not_run" | "passing" | "failing";

/** A verification result: what came out, which version of the test case was run, and when it was recorded. */
export type Result = { outcome: Outcome; revision: number; recordedAt: Date };

/** A test case linked to a requirement by "Verified by": its current version and its latest result, if it has one. */
export type VerifyingTest = { revision: number; result?: Result };

/**
 * A result is out of date when the test case has a newer version than the one that was run,
 * or when the requirement got a new version after the result was recorded. Leave the requirement out to judge the test alone.
 */
export function isOutOfDate(result: Result, testRevision: number, requirementRevisedAt?: Date): boolean {
  return (
    result.revision < testRevision || (requirementRevisedAt !== undefined && result.recordedAt < requirementRevisedAt)
  );
}

/**
 * The verification status of a requirement, from the latest result of each test that verifies it.
 * Out-of-date results are ignored, and `outOfDate` says that at least one was. First match wins:
 * no tests is "not covered"; any failed test is "failing"; every test passed is "passing"; anything else is "not run".
 * A blocked test has not verified anything, so it counts as not run.
 */
export function verificationStatus(
  requirementRevisedAt: Date,
  tests: VerifyingTest[],
): { status: VerificationStatus; outOfDate: boolean } {
  if (tests.length === 0) return { status: "not_covered", outOfDate: false };
  const stale = (t: VerifyingTest) => t.result !== undefined && isOutOfDate(t.result, t.revision, requirementRevisedAt);
  const outcomes = tests.map((t) => (stale(t) ? undefined : t.result?.outcome));
  const status = outcomes.includes("fail")
    ? "failing"
    : outcomes.every((outcome) => outcome === "pass")
      ? "passing"
      : "not_run";
  return { status, outOfDate: tests.some(stale) };
}
