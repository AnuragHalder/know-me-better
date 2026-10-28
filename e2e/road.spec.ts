import { expect, test } from "@playwright/test";

test("the home page offers quiz, story and party room at the top", async ({ page }) => {
  await page.goto("/");
  const modes = page.getByRole("list", { name: "Ways to play" });
  await expect(modes.getByRole("link")).toHaveCount(3);
  await expect(modes.getByRole("link", { name: /Walk a story/ })).toBeInViewport();
  await page.getByRole("link", { name: /Walk a story/ }).click();
  await expect(page).toHaveURL(/\/road$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Walk your road");
  await expect(page.getByText("Every story is free for now.")).toBeVisible();
});

test("walking a story needs sign-in", async ({ page }) => {
  await page.goto("/road/goa_trip");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)road(%2F|\/)goa_trip/);
});

test("story mode fits a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/road");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
