"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatRupees, PRODUCTS, type Product } from "@/lib/pricing";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/** Whether checkout is switched on for this deployment (set by the root layout). */
const PaymentsContext = createContext(false);

export function PaymentsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <PaymentsContext.Provider value={enabled}>{children}</PaymentsContext.Provider>;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";
const WAIT_MS = 60_000;
const POLL_MS = 2_000;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_JS}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("checkout_unavailable")));
    if (!existing) {
      script.src = CHECKOUT_JS;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

type Stage = "idle" | "opening" | "paying" | "confirming" | "slow";

interface BuyButtonProps {
  product: Product["id"];
  quizId: string;
  /** Button text; defaults to "<name> · ₹price". */
  label?: string;
  /** Called once the purchase is confirmed paid (by Razorpay's webhook). Default: reload the page's data. */
  onPaid?: () => void;
  className?: string;
  noteClassName?: string;
}

/**
 * Pay for one unlock with Razorpay. The price comes from the server; the unlock is
 * granted only when Razorpay's webhook confirms payment, so after checkout this
 * waits (up to a minute) for the purchase to show as paid.
 */
export function BuyButton({
  product,
  quizId,
  label,
  onPaid,
  className,
  noteClassName,
}: BuyButtonProps) {
  const enabled = useContext(PaymentsContext);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const stopped = useRef(false);
  const item = PRODUCTS.find((p) => p.id === product);
  const text = label ?? `${item?.name ?? "Unlock"} · ${item ? formatRupees(item.amountPaise) : ""}`;

  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );

  async function waitForPaid(orderId: string) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setStage("confirming");
    const until = Date.now() + WAIT_MS;
    while (!stopped.current && Date.now() < until) {
      const { data } = await supabase
        .from("purchases")
        .select("status")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();
      const status = (data as { status?: string } | null)?.status;
      if (status === "paid") {
        if (onPaid) onPaid();
        else router.refresh();
        setStage("idle");
        return;
      }
      if (status === "failed") break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (!stopped.current) setStage("slow");
  }

  async function buy() {
    setError("");
    setStage("opening");
    try {
      const res = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, quizId }),
      });
      const order = (await res.json()) as {
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        name?: string;
        description?: string;
        error?: string;
      };
      if (!res.ok || !order.orderId) throw new Error(order.error ?? "payment_unavailable");
      await loadCheckout();
      if (!window.Razorpay) throw new Error("checkout_unavailable");
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--pink").trim();
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        theme: accent ? { color: accent } : undefined,
        handler: () => waitForPaid(order.orderId!),
        modal: { ondismiss: () => setStage((s) => (s === "paying" ? "idle" : s)) },
      });
      checkout.on("payment.failed", (resp) => {
        setError(resp.error?.description || "The payment didn't go through. Nothing was charged.");
      });
      setStage("paying");
      checkout.open();
    } catch (e) {
      setStage("idle");
      setError(quizErrorMessage(e instanceof Error ? e.message : ""));
    }
  }

  if (!enabled) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" disabled className={className}>
          {text}
        </button>
        <span className={cn("text-xs font-semibold", noteClassName ?? "text-ink-soft")}>
          Payments open soon
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <button type="button" onClick={buy} disabled={stage !== "idle"} className={className}>
        {stage === "opening"
          ? "Opening checkout…"
          : stage === "paying"
            ? "Finish paying in the window…"
            : stage === "confirming"
              ? "Payment received, unlocking…"
              : text}
      </button>
      <span
        aria-live="polite"
        className={cn("text-sm font-semibold empty:hidden", noteClassName ?? "text-ink-soft")}
      >
        {stage === "slow"
          ? "We've got your payment; it's taking a moment to confirm. Refresh in a minute."
          : error}
      </span>
    </span>
  );
}
