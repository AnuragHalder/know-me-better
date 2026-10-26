import { expect, test } from "@playwright/test";

test("signed-out visitors who tap Make my quiz are asked to sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Make my quiz/ }).click();
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)create/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to make your quiz");
});

test("login page offers Google and email sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

test("login ignores redirects to other websites", async ({ page }) => {
  const res = await page.request.get("/auth/callback?next=https://evil.example", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(307);
  const location = res.headers()["location"] ?? "";
  expect(location).not.toContain("evil.example");
  expect(location).toContain("/login");
});
