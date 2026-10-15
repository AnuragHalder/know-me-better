import { expect, test } from "@playwright/test";

test("making a quiz needs sign-in", async ({ page }) => {
  await page.goto("/create");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)create/);
});

test("a creator's quiz pages need sign-in", async ({ page }) => {
  await page.goto("/me/quiz/00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/login/);
});

test("an unknown play code says so and offers to make a quiz", async ({ page }) => {
  await page.goto("/play/zzzzzz");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No quiz with code ZZZZZZ");
  await expect(page.getByRole("link", { name: "Make your own quiz" })).toBeVisible();
});
