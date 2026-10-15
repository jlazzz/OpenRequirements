import { expect, newItem, newProject, rich, test } from "./api.ts";

test("a run passed in a cycle turns the requirement Passing", async ({ signedIn: page, api }) => {
  const project = await newProject(api, "Verification");
  const req = await newItem(api, project.sets["System Requirements"] as string, "Stop on occlusion");
  const setId = project.sets["Verification Tests"] as string;
  const tc = await newItem(api, setId, "Occlusion alarm test");
  const { fields } = await api.call<{ fields: { id: string; name: string }[] }>("GET", `sets/${setId}/items`);
  const steps = fields.find((f) => f.name === "Steps")?.id as string;
  await api.call("POST", `items/${tc.id}/revisions`, {
    baseRevision: 1,
    name: "Occlusion alarm test",
    description: rich("Block the line."),
    attributes: { [steps]: [{ action: "Block the line", expected: "Alarm within 2 s" }] },
  });
  const { linkTypes } = await api.call<{ linkTypes: { id: string; role: string | null }[] }>(
    "GET",
    `projects/${project.id}/links`,
  );
  await api.call("POST", "links", {
    upstreamId: req.id,
    downstreamId: tc.id,
    typeId: linkTypes.find((t) => t.role === "verifies")?.id,
  });
  const plan = await api.call<{ id: string }>("POST", `projects/${project.id}/test-plans`, { name: "Release 1" });
  await api.call("POST", `test-plans/${plan.id}/cases`, { itemIds: [tc.id] });

  await page.goto(`/projects/${project.id}/test-plans/${plan.id}`);
  await page.getByLabel("New cycle").fill("Round 1");
  await page.getByRole("button", { name: "Start cycle" }).click();
  await expect(page.getByRole("heading", { name: "Round 1", level: 1 })).toBeVisible();
  await page
    .getByRole("table", { name: "Test runs" })
    .getByRole("link", { name: new RegExp(tc.uid) })
    .click();

  await page.getByRole("button", { name: "Pass step 1" }).click();
  await page.getByRole("button", { name: /^Finish run as passed/ }).click();
  await expect(page.getByText("Finished: Pass")).toBeVisible();

  await page.goto(`/projects/${project.id}/items/${req.id}`);
  await expect(page.getByRole("complementary", { name: "Verification" }).getByText("Passing")).toBeVisible();
});
