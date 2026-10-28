import { expect, test } from "@playwright/test";

test("opening a party room needs sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Party room/ }).click();
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)party/);
});

test("an unknown room code says so and offers to open one", async ({ page }) => {
  await page.goto("/party/zzzzzz");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No room with code ZZZZZZ");
  await expect(page.getByRole("link", { name: "Open your own room" })).toBeVisible();
});
