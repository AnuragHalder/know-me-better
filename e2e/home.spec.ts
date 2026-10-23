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

test("the site is clean by default and the header switch remembers Slambook", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-look", "clean");
  await page.getByRole("button", { name: "Slambook look" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-look", "notebook");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-look", "notebook");
  await expect(page.getByRole("button", { name: "Slambook look" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Clean look" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-look", "clean");
});
