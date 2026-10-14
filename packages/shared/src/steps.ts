import { docError, docToText, type RichNode, textToDoc } from "./richtext.ts";

/**
 * The action or expected result of a step: a rich-text document. Steps saved before rich text are plain strings;
 * they stay stored as they were and read as one paragraph per line.
 */
export type StepText = string | RichNode;

/** One action of a test case with what should happen. */
export type Step = { action: StepText; expected: StepText };

export const MAX_STEPS = 200;
const MAX_STEP_TEXT = 10_000;

/** A step's action or expected result as a document, whether stored as one or as plain text. */
export const stepDoc = (value: StepText): RichNode => (typeof value === "string" ? textToDoc(value) : value);

/** A step's action or expected result as plain text. */
export const stepText = (value: StepText): string => (typeof value === "string" ? value : docToText(value));

/** Why a value is not a list of test steps, or null when it is one. Worded to follow the field's name. */
export function stepsError(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > MAX_STEPS) return `must be a list of at most ${MAX_STEPS} steps`;
  for (const [index, step] of value.entries()) {
    const { action, expected } = (step ?? {}) as Partial<Step>;
    const isText = (text: unknown) =>
      (typeof text === "string" || docError(text) === null) && stepText(text as StepText).length <= MAX_STEP_TEXT;
    const wellFormed =
      typeof step === "object" && step !== null && Object.keys(step).length === 2 && isText(action) && isText(expected);
    if (!wellFormed) {
      return `has a step ${index + 1} that is not an action and an expected result of at most ${MAX_STEP_TEXT} characters`;
    }
    if (!stepText(action as StepText).trim()) return `has no action in step ${index + 1}`;
  }
  return null;
}

/** Steps as numbered lines, for tables, search and the version compare. */
export function stepsToText(steps: Step[]): string {
  const indent = (text: string) => text.replaceAll("\n", "\n   ");
  return steps
    .map((step, index) => {
      const expected = stepText(step.expected);
      return `${index + 1}. ${indent(stepText(step.action))}${expected ? `\n   Expected: ${indent(expected)}` : ""}`;
    })
    .join("\n");
}
