import { expect, test } from "@playwright/test";

const PAGES = [
  ["/about", "What is Who Knows Me Better?"],
  ["/contact", "Get in touch"],
  ["/pricing", "Free to play. Extras if you want them."],
  ["/terms", "Terms of use"],
  ["/privacy", "Your data, plainly explained"],
  ["/refunds", "Cancellations and refunds"],
  ["/delivery", "How purchases are delivered"],
] as const;

for (const [path, heading] of PAGES) {
  test(`${path} opens without signing in`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

test("every page links to all the policies in the footer", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Site information" });
  for (const label of ["About", "Pricing", "Contact", "Terms", "Privacy", "Refunds", "Delivery"]) {
    await expect(footer.getByRole("link", { name: label })).toBeVisible();
  }
});

test("common policy addresses redirect to our pages", async ({ page }) => {
  await page.goto("/privacy-policy");
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goto("/shipping");
  await expect(page).toHaveURL(/\/delivery$/);
});

test("pricing shows rupee prices", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("₹29", { exact: true })).toBeVisible();
  await expect(page.getByText("₹99/month", { exact: true })).toBeVisible();
});

test("sitemap and robots are served", async ({ request }) => {
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /me");
});
