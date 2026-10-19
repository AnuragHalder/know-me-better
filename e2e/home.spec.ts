import { expect, test } from "@playwright/test";

test("home page shows the pitch and the example leaderboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Who Knows Me Better");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("knows you");
  await expect(page.getByText("Example", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Meera" })).toContainText("9/10");
});

test("page never scrolls sideways", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
