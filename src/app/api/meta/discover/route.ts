import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { discoverAdAccounts, discoverPages } from "@/lib/meta-api";

// Any signed-in agency admin can call this - it only reads what the
// agency's own System User token already has access to, same trust level
// as everything else behind requireAgencyAdmin elsewhere in this app.
async function requireAgencyAdmin(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) return false;
  const { data: agencyUser } = await supabaseAdmin.from("agency_users").select("agency_id").eq("user_id", userData.user.id).maybeSingle();
  return !!agencyUser;
}

// Lists everything the agency's Meta System User token can currently see -
// ad accounts, Pages, and the Instagram Business Account linked to each
// Page (Instagram accounts aren't independently discoverable; they only
// show up nested under the Page they're connected to). Powers the "Add
// Source" picker so an admin selects a real connected account instead of
// typing a Graph API ID from memory.
export async function GET(request: Request) {
  if (!(await requireAgencyAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [adAccounts, pages] = await Promise.all([discoverAdAccounts(), discoverPages()]);
    const instagramAccounts = pages
      .filter((p) => p.instagramAccount)
      .map((p) => ({ id: p.instagramAccount!.id, username: p.instagramAccount!.username, pageName: p.name }));

    return NextResponse.json({ adAccounts, pages, instagramAccounts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to reach Meta" }, { status: 502 });
  }
}
