import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect } from "@/lib/canonical";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * 1. Sends production visitors on a secondary address to the main domain.
 * 2. Keeps the Supabase session fresh on every page request by refreshing its cookies.
 */
export async function middleware(request: NextRequest) {
  const to = canonicalRedirect(
    request.headers.get("host"),
    request.nextUrl.pathname + request.nextUrl.search,
    { canonicalHost: process.env.CANONICAL_HOST, vercelEnv: process.env.VERCEL_ENV },
  );
  if (to) return NextResponse.redirect(to, 308);

  const env = supabaseEnv();
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Validates the token and refreshes it if needed. Do not add code between
  // creating the client and this call.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except static files and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
