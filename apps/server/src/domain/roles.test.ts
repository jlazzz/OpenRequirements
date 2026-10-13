import { expect, test } from "vitest";
import { findMentions, roleAllows } from "./roles.ts";

test("each role can do what the roles below it can, and no more", () => {
  expect(roleAllows("viewer", "viewer")).toBe(true);
  expect(roleAllows("viewer", "reviewer")).toBe(false);
  expect(roleAllows("reviewer", "reviewer")).toBe(true);
  expect(roleAllows("reviewer", "editor")).toBe(false);
  expect(roleAllows("editor", "reviewer")).toBe(true);
  expect(roleAllows("editor", "admin")).toBe(false);
  expect(roleAllows("admin", "editor")).toBe(true);
});

test("mentions are found by @Name, ignoring case", () => {
  const people = [
    { id: "ann", name: "Ann" },
    { id: "annlee", name: "Ann Lee" },
    { id: "bob", name: "Bob" },
  ];
  expect(findMentions("Please check, @bob.", people)).toEqual(["bob"]);
  expect(findMentions("@Ann Lee and @Bob", people).sort()).toEqual(["annlee", "bob"]);
  expect(findMentions("@Ann Lee and @Ann", people).sort()).toEqual(["ann", "annlee"]);
  expect(findMentions("email ann@example.com, no mention of Bob", people)).toEqual([]);
  expect(findMentions("@Nobody", people)).toEqual([]);
});
