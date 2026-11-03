import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

import { BuyButton, PaymentsProvider } from "./BuyButton";

let checkoutOptions: Record<string, unknown> = {};
const open = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  maybeSingle.mockReset();
  open.mockReset();
  window.Razorpay = vi.fn().mockImplementation((options: Record<string, unknown>) => {
    checkoutOptions = options;
    return { open, on: vi.fn() };
  }) as unknown as typeof window.Razorpay;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BuyButton", () => {
  it("says payments open soon while checkout is switched off", () => {
    render(<BuyButton product="full_board" quizId="q1" />);
    expect(screen.getByRole("button", { name: "Full leaderboard · ₹49" })).toBeDisabled();
    expect(screen.getByText("Payments open soon")).toBeInTheDocument();
  });

  it("opens checkout for the server's order, then waits for the webhook before unlocking", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderId: "order_ABC123",
        amount: 4900,
        currency: "INR",
        keyId: "rzp_test_x",
        name: "Who Knows Me Better",
        description: "Full leaderboard",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    maybeSingle.mockResolvedValue({ data: { status: "paid" } });

    render(
      <PaymentsProvider enabled>
        <BuyButton product="full_board" quizId="11111111-1111-1111-1111-111111111111" />
      </PaymentsProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Full leaderboard · ₹49" }));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/razorpay/order",
      expect.objectContaining({
        body: JSON.stringify({
          product: "full_board",
          quizId: "11111111-1111-1111-1111-111111111111",
        }),
      }),
    );
    expect(open).toHaveBeenCalled();
    expect(checkoutOptions).toMatchObject({
      key: "rzp_test_x",
      order_id: "order_ABC123",
      amount: 4900,
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await (checkoutOptions.handler as () => Promise<void>)();
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("explains when the server won't sell it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "already_bought" }) }),
    );
    render(
      <PaymentsProvider enabled>
        <BuyButton product="lock_retries" quizId="q1" />
      </PaymentsProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Lock retries/ }));
    });
    expect(screen.getByText("You've already got this one.")).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});
