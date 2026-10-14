import { expect, test } from "vitest";
import { runOutcome, runState, runSteps, WHOLE_TEST } from "./testrun.ts";

test("a run's state follows the latest result of each step", () => {
  expect(runState([undefined, undefined])).toBe("not_started");
  expect(runState(["pass", undefined])).toBe("in_progress");
  expect(runState(["pass", "pass"])).toBe("passed");
  // A failure wins over everything, a blocked step over what is left.
  expect(runState(["pass", "blocked", "fail"])).toBe("failed");
  expect(runState(["pass", "blocked", undefined])).toBe("blocked");
  expect(runState([])).toBe("not_started");
});

test("a finished run keeps the outcome it was finished with", () => {
  expect(runState([undefined], "pass")).toBe("passed");
  expect(runState(["pass"], "fail")).toBe("failed");
});

test("only a passed, failed or blocked run can be finished", () => {
  expect(runOutcome("passed")).toBe("pass");
  expect(runOutcome("failed")).toBe("fail");
  expect(runOutcome("blocked")).toBe("blocked");
  expect(runOutcome("in_progress")).toBeNull();
  expect(runOutcome("not_started")).toBeNull();
});

test("a test case without steps is run as one step", () => {
  const steps = [{ action: "Press start", expected: "It runs" }];
  expect(runSteps(steps)).toBe(steps);
  expect(runSteps(undefined)).toEqual([WHOLE_TEST]);
  expect(runSteps([])).toEqual([WHOLE_TEST]);
});
