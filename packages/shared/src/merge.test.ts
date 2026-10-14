import { expect, test } from "vitest";
import { changedParts, mergeItem } from "./merge.ts";
import { textToDoc } from "./richtext.ts";

const base = { name: "Supply voltage", description: textToDoc("12 V"), attributes: { status: "Draft", prio: "High" } };

test("changes on different parts combine without conflict", () => {
  const mine = { ...base, name: "Supply voltage range" };
  const theirs = { ...base, attributes: { status: "Approved", prio: "High" } };
  expect(mergeItem(base, mine, theirs)).toEqual({
    merged: { ...base, name: "Supply voltage range", attributes: { status: "Approved", prio: "High" } },
    conflicts: [],
  });
});

test("the same change on both sides is not a conflict", () => {
  const edit = { ...base, description: textToDoc("24 V") };
  expect(mergeItem(base, edit, edit)).toEqual({ merged: edit, conflicts: [] });
});

test("different changes to one part conflict, keep mine by default, and take theirs when asked", () => {
  const mine = { ...base, name: "Mine", attributes: { status: "Draft", prio: "Low" } };
  const theirs = { ...base, name: "Theirs", attributes: { status: "Draft", prio: "Medium" } };
  const result = mergeItem(base, mine, theirs);
  expect(result.conflicts.sort()).toEqual(["name", "prio"]);
  expect(result.merged).toMatchObject({ name: "Mine", attributes: { prio: "Low" } });
  expect(mergeItem(base, mine, theirs, ["prio"]).merged).toMatchObject({
    name: "Mine",
    attributes: { prio: "Medium" },
  });
});

test("a cleared or added field counts as a change, and key order or null versus missing does not", () => {
  const mine = { ...base, attributes: { prio: "High", status: null, extra: 3 } };
  const theirs = { ...base, description: JSON.parse(JSON.stringify(base.description)) };
  expect(mergeItem(base, mine, theirs)).toEqual({
    merged: { ...base, attributes: { prio: "High", extra: 3 } },
    conflicts: [],
  });
  const reordered = { ...base, attributes: { prio: "High", status: "Draft" } };
  expect(mergeItem(base, reordered, base).conflicts).toEqual([]);
});

test("changedParts lists what differs between two versions", () => {
  const after = { ...base, name: "New", attributes: { prio: "High" } };
  expect(changedParts(base, after)).toEqual(["name", "status"]);
  expect(changedParts(base, base)).toEqual([]);
});
