/** One action of a test case with what should happen. Both are plain text. */
export type Step = { action: string; expected: string };

export const MAX_STEPS = 200;
const MAX_STEP_TEXT = 2000;

/** Why a value is not a list of test steps, or null when it is one. Worded to follow the field's name. */
export function stepsError(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > MAX_STEPS) return `must be a list of at most ${MAX_STEPS} steps`;
  for (const [index, step] of value.entries()) {
    const { action, expected } = (step ?? {}) as Partial<Step>;
    const wellFormed =
      typeof step === "object" &&
      step !== null &&
      Object.keys(step).length === 2 &&
      typeof action === "string" &&
      typeof expected === "string" &&
      action.length <= MAX_STEP_TEXT &&
      expected.length <= MAX_STEP_TEXT;
    if (!wellFormed) {
      return `has a step ${index + 1} that is not an action and an expected result of at most ${MAX_STEP_TEXT} characters`;
    }
    if (!action?.trim()) return `has no action in step ${index + 1}`;
  }
  return null;
}

/** Steps as numbered lines, for tables, search and the version compare. */
export function stepsToText(steps: Step[]): string {
  return steps
    .map((step, index) => `${index + 1}. ${step.action}${step.expected ? `\n   Expected: ${step.expected}` : ""}`)
    .join("\n");
}
