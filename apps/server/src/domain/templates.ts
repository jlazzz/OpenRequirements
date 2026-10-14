export type FieldType = "text" | "number" | "enum" | "multi_enum" | "date" | "boolean" | "steps";

export type Template = {
  id: string;
  name: string;
  description: string;
  /** `role: "test"` marks the type whose items are test cases: they take results, steps and runs. */
  itemTypes: { name: string; role?: "test"; fields: { name: string; type: FieldType; options?: string[] }[] }[];
  sets: { name: string; uidPrefix: string; itemType: string }[];
  /** Relationship types offered when linking two items. The first is the default. */
  linkTypes: string[];
};

type Field = Template["itemTypes"][number]["fields"][number];

const status: Field = { name: "Status", type: "enum", options: ["Draft", "In review", "Approved", "Rejected"] };
const priority: Field = { name: "Priority", type: "enum", options: ["High", "Medium", "Low"] };
const method: Field = {
  name: "Verification method",
  type: "enum",
  options: ["Test", "Analysis", "Inspection", "Demonstration"],
};

/** Fixed starter templates. Every item also has a built-in name and description, so those are not listed as fields. */
export const templates: Template[] = [
  {
    id: "standard",
    name: "Standard",
    description: "User needs, system requirements and verification tests.",
    itemTypes: [
      { name: "User Need", fields: [status, priority, { name: "Source", type: "text" }] },
      { name: "Requirement", fields: [status, priority, method, { name: "Rationale", type: "text" }] },
      {
        name: "Test Case",
        role: "test",
        fields: [status, method, { name: "Expected result", type: "text" }, { name: "Steps", type: "steps" }],
      },
    ],
    sets: [
      { name: "User Needs", uidPrefix: "UN", itemType: "User Need" },
      { name: "System Requirements", uidPrefix: "SYS", itemType: "Requirement" },
      { name: "Verification Tests", uidPrefix: "VER", itemType: "Test Case" },
    ],
    linkTypes: ["Related to", "Derived from", "Verified by"],
  },
];
