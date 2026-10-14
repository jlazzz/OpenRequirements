import type { Step } from "@app/shared";
import type { Outcome } from "./verification.ts";

export const RUN_STATES = ["not_started", "in_progress", "passed", "failed", "blocked"] as const;
export type RunState = (typeof RUN_STATES)[number];

const DONE: Record<Outcome, RunState> = { pass: "passed", fail: "failed", blocked: "blocked" };

/**
 * The state of a test run, from the latest result of each of its steps (undefined for a step with none).
 * First match wins: any failed step is "failed"; any blocked step is "blocked"; every step passed is "passed";
 * some steps done is "in progress"; none is "not started". A finished run keeps the outcome it was finished with.
 */
export function runState(steps: (Outcome | undefined)[], finished?: Outcome): RunState {
  if (finished) return DONE[finished];
  if (steps.includes("fail")) return "failed";
  if (steps.includes("blocked")) return "blocked";
  if (steps.length > 0 && steps.every((outcome) => outcome === "pass")) return "passed";
  return steps.some((outcome) => outcome !== undefined) ? "in_progress" : "not_started";
}

/** The verification outcome a run records when it is finished, or null while it cannot be finished yet. */
export function runOutcome(state: RunState): Outcome | null {
  return state === "passed" ? "pass" : state === "failed" ? "fail" : state === "blocked" ? "blocked" : null;
}

/** What a run of a test case without steps asks the tester to do: one step for the whole test. */
export const WHOLE_TEST: Step = { action: "Run the test case as described.", expected: "" };

/** The steps a run walks through: the frozen version's steps, or one step for the whole test when it has none. */
export function runSteps(value: unknown): Step[] {
  return Array.isArray(value) && value.length > 0 ? (value as Step[]) : [WHOLE_TEST];
}
