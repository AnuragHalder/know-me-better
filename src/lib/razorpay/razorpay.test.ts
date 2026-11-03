// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymentSignatureValid, webhookSignatureValid } from "./signature";
import { webhookAction } from "./webhook";

const sign = (secret: string, msg: string) =>
  createHmac("sha256", secret).update(msg).digest("hex");

describe("Razorpay signatures", () => {
  it("accepts a webhook body signed with our secret, and nothing else", () => {
    const body = JSON.stringify({ event: "order.paid" });
    expect(webhookSignatureValid(body, sign("whsec", body), "whsec")).toBe(true);
    expect(webhookSignatureValid(body, sign("other", body), "whsec")).toBe(false);
    expect(webhookSignatureValid(`${body} `, sign("whsec", body), "whsec")).toBe(false);
    expect(webhookSignatureValid(body, null, "whsec")).toBe(false);
    expect(webhookSignatureValid(body, "short", "whsec")).toBe(false);
  });

  it("checks checkout's order|payment signature", () => {
    const sig = sign("keysecret", "order_ABC|pay_XYZ");
    expect(paymentSignatureValid("order_ABC", "pay_XYZ", sig, "keysecret")).toBe(true);
    expect(paymentSignatureValid("order_ABC", "pay_OTHER", sig, "keysecret")).toBe(false);
  });
});

describe("webhookAction", () => {
  it("reads order.paid and payment.captured as paid", () => {
    expect(
      webhookAction({
        event: "order.paid",
        payload: {
          order: { entity: { id: "order_1", amount_paid: 900 } },
          payment: { entity: { id: "pay_1", order_id: "order_1", amount: 900 } },
        },
      }),
    ).toEqual({ type: "paid", orderId: "order_1", paymentId: "pay_1", amount: 900 });
    expect(
      webhookAction({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_2", order_id: "order_2", amount: 4900 } } },
      }),
    ).toEqual({ type: "paid", orderId: "order_2", paymentId: "pay_2", amount: 4900 });
  });

  it("reads failures and refunds", () => {
    expect(
      webhookAction({
        event: "payment.failed",
        payload: { payment: { entity: { id: "pay_3", order_id: "order_3" } } },
      }),
    ).toEqual({ type: "failed", orderId: "order_3" });
    expect(
      webhookAction({
        event: "refund.processed",
        payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_4" } } },
      }),
    ).toEqual({ type: "refunded", paymentId: "pay_4" });
  });

  it("ignores events we don't use and incomplete bodies", () => {
    expect(webhookAction({ event: "subscription.charged", payload: {} })).toBeNull();
    expect(
      webhookAction({ event: "payment.captured", payload: { payment: { entity: {} } } }),
    ).toBeNull();
    expect(webhookAction("nope")).toBeNull();
  });
});
