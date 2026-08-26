import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Manages client-viewer logins (auth.users + client_users). Every handler
// re-verifies the caller is a real agency admin using the service-role
// client, independent of RLS - this route runs with RLS bypassed, so it
// has to enforce that boundary itself rather than relying on the database.
async function requireAgencyAdmin(request: Request): Promise<{ agencyId: string } | null> {
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

  return { agencyId: agencyUser.agency_id };
}

async function assertClientBelongsToAgency(clientId: string, agencyId: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin.from("clients").select("id").eq("id", clientId).eq("agency_id", agencyId).maybeSingle();
  return !!data;
}

export async function GET(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  if (!(await assertClientBelongsToAgency(clientId, admin.agencyId))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: links, error } = await supabaseAdmin.from("client_users").select("id, user_id, role, created_at").eq("client_id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const logins = await Promise.all(
    (links || []).map(async (link) => {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(link.user_id);
      return {
        id: link.id,
        userId: link.user_id,
        email: userData?.user?.email || "(unknown)",
        role: link.role,
        createdAt: link.created_at,
      };
    })
  );

  return NextResponse.json({ logins });
}

export async function POST(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { clientId, email, password } = body as { clientId?: string; email?: string; password?: string };
  if (!clientId || !email || !password) {
    return NextResponse.json({ error: "clientId, email, and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!(await assertClientBelongsToAgency(clientId, admin.agencyId))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });

  const { error: linkError } = await supabaseAdmin
    .from("client_users")
    .insert({ user_id: created.user.id, client_id: clientId, role: "viewer" });
  if (linkError) {
    // Roll back the orphaned auth user rather than leave a login that
    // isn't actually linked to any client.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ userId: created.user.id, email });
}

export async function DELETE(request: Request) {
  const admin = await requireAgencyAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const userId = searchParams.get("userId");
  if (!clientId || !userId) return NextResponse.json({ error: "clientId and userId are required" }, { status: 400 });
  if (!(await assertClientBelongsToAgency(clientId, admin.agencyId))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  // client_users.user_id references auth.users only in a comment, not a
  // real FK (deliberately - see schema notes), so deleting the auth user
  // would NOT cascade here. Delete the link row explicitly first.
  const { error: linkError } = await supabaseAdmin.from("client_users").delete().eq("user_id", userId).eq("client_id", clientId);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
