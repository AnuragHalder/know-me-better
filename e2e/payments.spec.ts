import { expect, test } from "@playwright/test";

test("checkout stays off until Razorpay keys are set", async ({ request, page }) => {
  const order = await request.post("/api/razorpay/order", {
    data: { product: "full_board", quizId: "00000000-0000-0000-0000-000000000000" },
  });
  expect(order.status()).toBe(503);
  expect(await order.json()).toEqual({ error: "payments_off" });

  const hook = await request.post("/api/razorpay/webhook", { data: { event: "order.paid" } });
  expect(hook.status()).toBe(503);

  await page.goto("/pricing");
  await expect(page.getByText("₹49").first()).toBeVisible();
});
