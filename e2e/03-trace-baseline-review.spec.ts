import { expect, newItem, newProject, test } from "./api.ts";

test("a relationship shows in the matrix, a baseline is made, a review is signed", async ({ signedIn: page, api }) => {
  const project = await newProject(api, "Trace and review");
  const need = await newItem(api, project.sets["User Needs"] as string, "Infusion must be safe");
  const req = await newItem(api, project.sets["System Requirements"] as string, "Stop on occlusion");

  // Relationship, from the need's page.
  await page.goto(`/projects/${project.id}/items/${need.id}`);
  await page.getByRole("button", { name: "Add downstream relationship" }).click();
  const add = page.getByRole("dialog", { name: "Add downstream relationship" });
  await add.getByRole("button", { name: new RegExp(req.uid) }).click();
  await expect(page.getByRole("button", { name: `Remove relationship with ${req.uid}` })).toBeVisible();

  // The matrix.
  await page.goto(`/projects/${project.id}/matrix`);
  await expect(page.getByLabel(`${need.uid} is linked to ${req.uid}`)).toBeVisible();

  // Baseline.
  await page.goto(`/projects/${project.id}/baselines`);
  await page.getByLabel("New baseline").fill("Design review 1.0");
  await page.getByRole("button", { name: "Create baseline" }).click();
  await expect(page.getByRole("link", { name: "Design review 1.0" })).toBeVisible();

  // Review on the baseline, approved and signed by the one approver.
  await page.goto(`/projects/${project.id}/reviews`);
  await page.getByRole("textbox", { name: "Name" }).fill("Design review");
  await page.getByRole("combobox", { name: "Approvers" }).click();
  await page.getByRole("option", { name: /Ada Admin/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start review" }).click();

  await page.getByRole("link", { name: "Design review" }).first().click();
  await page.getByRole("button", { name: /^Approve all remaining/ }).click();
  await page.getByRole("button", { name: "Sign and submit" }).click();
  const sign = page.getByRole("dialog", { name: "Sign and submit" });
  await sign.getByLabel("Your password").fill("correct horse battery");
  await sign.getByRole("button", { name: "Sign", exact: true }).click();
  await page.getByRole("button", { name: "Close review" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible();
});
