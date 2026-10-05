import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_HEADER, signSession } from "@/lib/session-header";

const PROTECTED = ["/me", "/dashboard"];

// Runs before every page: keeps the login session fresh and sends signed-out
// visitors of private pages to the login screen.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  // Do not put code between createServerClient and getClaims: it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const signedIn = Boolean(claims?.sub);

  const { pathname, search } = request.nextUrl;
  if (!signedIn && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(login);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  // Hand the checked identity to the page in a signed header (never trust one sent by the visitor).
  const headers = new Headers(request.headers);
  headers.delete(SESSION_HEADER);
  if (claims?.sub) {
    const email = (claims.email as string | undefined) || null;
    const signed = await signSession({
      id: claims.sub,
      phone: (claims.phone as string | undefined) || null,
      email: email && !email.endsWith("@phone.spendbox.app") ? email : null,
    });
    if (signed) headers.set(SESSION_HEADER, signed);
  }
  const forwarded = NextResponse.next({ request: { headers } });
  for (const cookie of response.cookies.getAll()) forwarded.cookies.set(cookie);
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie" && !name.startsWith("x-middleware-")) forwarded.headers.set(name, value);
  });
  return forwarded;
}

export const config = {
  matcher: [
    // Everything except files, the daily job and pages that are the same for everyone.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/cron|(?:plug|terms|privacy|auth/forgot)?$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|mp4|webm)$).*)",
  ],
};
