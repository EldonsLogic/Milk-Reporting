import { createClient } from "@supabase/supabase-js";

// Server-only client using the service-role key - bypasses RLS entirely and
// can manage auth.users directly. NEVER import this from a "use client"
// component or anything that ships to the browser; it must only be used
// inside Route Handlers (src/app/api/**) that run server-side on Vercel.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
