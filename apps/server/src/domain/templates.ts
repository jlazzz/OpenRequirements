export type FieldType = "text" | "number" | "enum" | "multi_enum" | "date" | "boolean";

export type Template = {
  id: string;
  name: string;
  description: string;
  itemTypes: { name: string; fields: { name: string; type: FieldType; options?: string[] }[] }[];
  sets: { name: string; uidPrefix: string; itemType: string }[];
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
      { name: "Test Case", fields: [status, method, { name: "Expected result", type: "text" }] },
    ],
    sets: [
      { name: "User Needs", uidPrefix: "UN", itemType: "User Need" },
      { name: "System Requirements", uidPrefix: "SYS", itemType: "Requirement" },
      { name: "Verification Tests", uidPrefix: "VER", itemType: "Test Case" },
    ],
  },
];
