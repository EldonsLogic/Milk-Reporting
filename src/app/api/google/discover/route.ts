import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { discoverGa4Properties } from "@/lib/google-analytics-api";

// Same trust level as /api/meta/discover: any signed-in agency admin, since
// this only lists what the agency's own service account already has access to.
async function requireAgencyAdmin(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) return false;
  const { data: agencyUser } = await supabaseAdmin
    .from("agency_users")
    .select("agency_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return !!agencyUser;
}

/**
 * Lists every GA4 property the agency's service account can read, so an
 * admin picks a real property from a list instead of pasting a numeric
 * property id. An empty list means the service account hasn't been granted
 * access to anything yet - which is a setup step, not a failure, so it
 * returns 200 with a hint rather than an error.
 */
export async function GET(request: Request) {
  if (!(await requireAgencyAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const properties = await discoverGa4Properties();
    return NextResponse.json({
      properties,
      serviceAccountEmail: process.env.GA_SERVICE_ACCOUNT_EMAIL || null,
      ...(properties.length === 0
        ? {
            hint: `No GA4 properties are shared with this service account yet. In each property: Admin > Property access management > add ${process.env.GA_SERVICE_ACCOUNT_EMAIL} as a Viewer.`,
          }
        : {}),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to reach Google Analytics" }, { status: 502 });
  }
}
