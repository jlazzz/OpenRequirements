import { expect, test } from "@playwright/test";
import { ADMIN } from "./api.ts";

// The database is empty at the start of a run, so the first visitor creates the administrator.
test("the first visit creates the admin account, then sign out and sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create the admin account" })).toBeVisible();
  await page.getByRole("textbox", { name: "Name" }).fill(ADMIN.name);
  await page.getByRole("textbox", { name: "Email" }).fill(ADMIN.email);
  await page.getByRole("textbox", { name: "Password" }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByRole("textbox", { name: "Email" }).fill(ADMIN.email);
  await page.getByRole("textbox", { name: "Password" }).fill("not the password at all");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByRole("textbox", { name: "Password" }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: ADMIN.name })).toBeVisible();
});
