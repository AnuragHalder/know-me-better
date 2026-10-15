import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/redirects";
import { getServerSupabase } from "@/lib/supabase/server";

/** Google sends people back here with a one-time code, which we swap for a session. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = supabase
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("Supabase is not configured") };
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const back = new URL("/login", url.origin);
  back.searchParams.set("error", "google");
  back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}
