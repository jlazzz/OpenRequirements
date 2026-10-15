import { expect, test } from "./api.ts";

test("create a project from a template, then a folder and an item, edit it and save a version", async ({
  signedIn: page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Project name").fill("Pump controller");
  await dialog.getByRole("button", { name: "Create project" }).click();

  const explorer = page.getByRole("navigation", { name: "Explorer" });
  await expect(explorer.getByRole("link", { name: "System Requirements" })).toBeVisible();
  await explorer.getByRole("link", { name: "System Requirements" }).click();
  await expect(page.getByRole("heading", { name: "System Requirements", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Add folder" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Dosing");
  await page
    .getByRole("button", { name: /^(Add|Create|Save)/ })
    .last()
    .click();
  await expect(explorer.getByRole("link", { name: "Dosing" })).toBeVisible();

  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("The pump shall stop on occlusion");
  await page
    .getByRole("button", { name: /^(Add|Create|Save)/ })
    .last()
    .click();
  await expect(page.getByRole("link", { name: "SYS-001" }).first()).toBeVisible();
  await page.getByRole("link", { name: "SYS-001" }).first().click();

  await expect(page.getByText(/^Version 1 · saved/)).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("The pump shall stop within 2 s of occlusion");
  await page.getByLabel("Reason for change").fill("Added a time limit");
  await page.getByRole("button", { name: "Save version" }).click();

  await expect(page.getByText(/^Version 2 · saved/)).toBeVisible();
  const versions = page.getByRole("complementary", { name: "Versions" });
  await expect(versions.getByRole("button", { name: /^Version 2/ })).toBeVisible();
  await expect(versions.getByRole("button", { name: /^Version 1/ })).toBeVisible();
});
