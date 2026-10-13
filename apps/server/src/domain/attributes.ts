export type FieldDef = { id: string; name: string; type: string; options: string[] | null };

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

function valueError({ type, options }: FieldDef, value: unknown): string | null {
  switch (type) {
    case "text":
      return typeof value === "string" && value.length <= 10_000 ? null : "must be text of at most 10,000 characters";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "must be a number";
    case "boolean":
      return typeof value === "boolean" ? null : "must be yes or no";
    case "date":
      return typeof value === "string" && isDate(value) ? null : "must be a date (YYYY-MM-DD)";
    case "enum":
      return typeof value === "string" && options?.includes(value) ? null : "must be one of the allowed values";
    case "multi_enum":
      return Array.isArray(value) && new Set(value).size === value.length && value.every((v) => options?.includes(v))
        ? null
        : "must be a list of distinct allowed values";
    default:
      return "has an unknown field type";
  }
}

/**
 * Checks field values (keyed by field id) against an item type's field definitions.
 * Returns the values with empty ones removed, or the first problem found.
 */
export function checkAttributes(
  fields: FieldDef[],
  values: Record<string, unknown>,
): { attributes: Record<string, unknown> } | { error: string } {
  const attributes: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(values)) {
    const field = fields.find((f) => f.id === id);
    if (!field) return { error: `Unknown field: ${id}` };
    if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    const problem = valueError(field, value);
    if (problem) return { error: `${field.name} ${problem}` };
    attributes[id] = value;
  }
  return { attributes };
}
