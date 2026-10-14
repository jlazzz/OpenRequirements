export type FieldType = "text" | "number" | "enum" | "multi_enum" | "date" | "boolean" | "steps";

export type Template = {
  id: string;
  name: string;
  description: string;
  /** `role: "test"` marks the type whose items are test cases: they take results, steps and runs. */
  itemTypes: { name: string; role?: "test"; fields: { name: string; type: FieldType; options?: string[] }[] }[];
  sets: { name: string; uidPrefix: string; itemType: string }[];
  /** Relationship types offered when linking two items. The first is the default. `role: "verifies"` marks the one whose links count for verification. */
  linkTypes: { name: string; role?: "verifies" }[];
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
    linkTypes: [{ name: "Related to" }, { name: "Derived from" }, { name: "Verified by", role: "verifies" }],
  },
  {
    id: "spacecraft",
    name: "Spacecraft",
    description:
      "Mission needs, mission, system and subsystem requirements, interfaces, hazards, and tests at each level.",
    itemTypes: [
      {
        name: "Stakeholder Need",
        fields: [
          status,
          priority,
          { name: "Stakeholder", type: "text" },
          {
            name: "Mission phase",
            type: "multi_enum",
            options: ["Launch", "Commissioning", "Operations", "Safe mode", "Disposal"],
          },
        ],
      },
      {
        name: "Requirement",
        fields: [
          status,
          priority,
          method,
          {
            name: "Subsystem",
            type: "enum",
            options: ["System", "ADCS", "EPS", "COMMS", "C&DH", "FSW", "PROP", "THERM", "STR", "PAYLOAD", "GROUND"],
          },
          { name: "Criticality", type: "enum", options: ["Mission critical", "Safety critical", "Standard"] },
          { name: "Rationale", type: "text" },
          { name: "Margin (%)", type: "number" },
          { name: "Need date", type: "date" },
        ],
      },
      {
        name: "Interface",
        fields: [
          status,
          { name: "Interface type", type: "enum", options: ["Electrical", "Data", "Mechanical", "Thermal", "RF"] },
          { name: "Side A", type: "text" },
          { name: "Side B", type: "text" },
          { name: "Controlled", type: "boolean" },
        ],
      },
      {
        name: "Hazard",
        fields: [
          status,
          { name: "Severity", type: "enum", options: ["Catastrophic", "Critical", "Marginal", "Negligible"] },
          {
            name: "Likelihood",
            type: "enum",
            options: ["Frequent", "Probable", "Occasional", "Remote", "Improbable"],
          },
          { name: "Cause", type: "text" },
          { name: "Mitigation", type: "text" },
        ],
      },
      {
        name: "Test Case",
        role: "test",
        fields: [
          status,
          method,
          {
            name: "Test level",
            type: "enum",
            options: ["Unit", "Component", "Subsystem", "Integrated system", "Environmental", "Mission validation"],
          },
          { name: "Facility", type: "text" },
          { name: "Expected result", type: "text" },
          { name: "Steps", type: "steps" },
        ],
      },
    ],
    sets: [
      { name: "Mission Needs", uidPrefix: "MN", itemType: "Stakeholder Need" },
      { name: "Mission Requirements", uidPrefix: "MR", itemType: "Requirement" },
      { name: "System Requirements", uidPrefix: "SYS", itemType: "Requirement" },
      { name: "Subsystem Requirements", uidPrefix: "SUB", itemType: "Requirement" },
      { name: "Interfaces", uidPrefix: "ICD", itemType: "Interface" },
      { name: "Hazards", uidPrefix: "HAZ", itemType: "Hazard" },
      { name: "Component Tests", uidPrefix: "CT", itemType: "Test Case" },
      { name: "Subsystem Tests", uidPrefix: "ST", itemType: "Test Case" },
      { name: "System Tests", uidPrefix: "SVT", itemType: "Test Case" },
      { name: "Mission Validation", uidPrefix: "VAL", itemType: "Test Case" },
    ],
    linkTypes: [
      { name: "Derived from" },
      { name: "Verified by", role: "verifies" },
      { name: "Mitigated by" },
      { name: "Interfaces with" },
      { name: "Related to" },
    ],
  },
];
