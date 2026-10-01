import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseUrl } from "@/lib/env";

/** Supabase client for Server Components, Server Actions and Route Handlers. Acts as the signed-in person. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
