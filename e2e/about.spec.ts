import { expect, test } from "@playwright/test";

test("the About page lists every way to play", async ({ page }) => {
  await page.goto("/about");
  for (const name of [
    "The friendship quiz",
    "Story mode: walk your road",
    "Party rooms: play live together",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await expect(page.getByText(/Killer: secret roles/)).toBeVisible();
  await page.getByRole("link", { name: "Party rooms: play live together" }).click();
  await expect(page).toHaveURL(/\/(party|login)/);
});
