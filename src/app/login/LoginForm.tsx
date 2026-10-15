"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const RESEND_SECONDS = 60;

type Step = { kind: "start" } | { kind: "code"; email: string };

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function withGoogle() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    // On success the browser leaves for Google, so only failures land here.
    if (error) {
      setError(friendlyAuthError(error.message));
      setBusy(false);
    }
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!supabase) return;
    const address = email.trim().toLowerCase();
    if (!address) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(friendlyAuthError(error.message));
      return;
    }
    setCode("");
    setStep({ kind: "code", email: address });
    setCooldown(RESEND_SECONDS);
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    if (!supabase || step.kind !== "code") return;
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.verifyOtp({ email: step.email, token, type: "email" });
    if (error) {
      setBusy(false);
      setError(friendlyAuthError(error.message));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!supabase && (
        <p role="status" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">
          Sign-in isn&apos;t set up on this copy of the app yet.
        </p>
      )}

      {step.kind === "start" ? (
        <>
          <Button variant="ink" onClick={withGoogle} disabled={!supabase || busy}>
            <GoogleMark />
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-sm text-ink-soft" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            or use your email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={sendCode} className="flex flex-col gap-2.5">
            <label
              htmlFor="email"
              className="text-xs font-bold tracking-widest text-ink-soft uppercase"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 rounded-xl border-2 border-line bg-sheet px-3.5 text-base text-ink placeholder:text-ink-soft/70"
            />
            <Button type="submit" variant="ghost" disabled={!supabase || busy || !email.trim()}>
              {busy ? "Sending…" : "Email me a code"}
            </Button>
          </form>
        </>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-2.5">
          <p className="text-ink-soft">
            We sent a 6-digit code to <b className="text-ink">{step.email}</b>. It can take a minute
            to arrive; check spam too.
          </p>
          <label
            htmlFor="code"
            className="text-xs font-bold tracking-widest text-ink-soft uppercase"
          >
            Code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={8}
            autoFocus
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-12 rounded-xl border-2 border-line bg-sheet px-3.5 font-mono text-2xl tracking-[0.3em] text-ink placeholder:text-ink-soft/50"
          />
          <Button type="submit" variant="pink" disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="min-h-11 text-ink-soft underline"
              onClick={() => {
                setStep({ kind: "start" });
                setError("");
              }}
            >
              Use a different email
            </button>
            <button
              type="button"
              className="min-h-11 text-ink-soft underline disabled:no-underline disabled:opacity-60"
              disabled={busy || cooldown > 0}
              onClick={() => sendCode()}
            >
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            </button>
          </div>
        </form>
      )}

      <p aria-live="polite" className="min-h-6 text-sm font-semibold text-bad">
        {error}
      </p>
    </div>
  );
}

/** Google's "G". Its brand colours are fixed by Google's sign-in guidelines, not our theme. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
