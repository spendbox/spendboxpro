import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/env";

/**
 * Full-access Supabase client. Server only, and only for work the signed-in
 * person cannot do themselves (every game action, which the database checks).
 * Always check permissions before using it.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
