import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Manages agency admin seats (auth.users + agency_users). Mirrors the
 * client-logins route: this runs with RLS bypassed via the service-role key,
 * so it has to enforce the agency boundary itself rather than relying on the
 * database to do it.
 */
async function requireAgencyAdmin(request: Request): Promise<{ agencyId: string; userId: string } | null> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: agencyUser } = await supabaseAdmin
    .from("agency_users")
    .select("agency_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!agencyUser) return null;

  return { agencyId: agencyUser.agency_id, userId: userData.user.id };
}

export async function GET(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: rows, error } = await supabaseAdmin
    .from("agency_users")
    .select("id, user_id, full_name, created_at")
    .eq("agency_id", admin.agencyId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seats = await Promise.all(
    (rows || []).map(async (row) => {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        email: userData?.user?.email || "(unknown)",
        createdAt: row.created_at,
        isSelf: row.user_id === admin.userId,
      };
    })
  );

  return NextResponse.json({ seats });
}

export async function POST(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { email, password, fullName } = body as { email?: string; password?: string; fullName?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });

  const { error: linkError } = await supabaseAdmin
    .from("agency_users")
    .insert({ user_id: created.user.id, agency_id: admin.agencyId, full_name: fullName || null });
  if (linkError) {
    // Roll back rather than leave an auth user with no agency, which would
    // land on the "account not set up" screen with no way to fix it.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ userId: created.user.id, email });
}

export async function DELETE(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Removing your own seat would lock you out of the app you're using, and
  // if you're the last admin it would orphan the agency entirely.
  if (userId === admin.userId) {
    return NextResponse.json({ error: "You can't remove your own access." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { count } = await supabaseAdmin
    .from("agency_users")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", admin.agencyId);
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "An agency must keep at least one admin." }, { status: 400 });
  }

  // Confirm the seat belongs to this agency before touching auth.users -
  // otherwise an admin could delete a user from another agency by id.
  const { data: seat } = await supabaseAdmin
    .from("agency_users")
    .select("id")
    .eq("user_id", userId)
    .eq("agency_id", admin.agencyId)
    .maybeSingle();
  if (!seat) return NextResponse.json({ error: "Seat not found" }, { status: 404 });

  // agency_users.user_id references auth.users only in a comment, not a real
  // FK, so deleting the auth user would not cascade. Remove the link first.
  const { error: linkError } = await supabaseAdmin.from("agency_users").delete().eq("id", seat.id);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
