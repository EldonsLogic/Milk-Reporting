import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchMetaAdInsights,
  fetchFacebookPageInsights,
  fetchFacebookPageFollowerCount,
  fetchFacebookPagePosts,
  fetchInstagramInsights,
  fetchInstagramFollowerCount,
  fetchInstagramMedia,
} from "@/lib/meta-api";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

// Either a real agency admin (Bearer <Supabase JWT>, used by the "Sync Now"
// button) or Vercel Cron (Bearer <CRON_SECRET> - Vercel adds this header
// automatically to cron-triggered requests when CRON_SECRET is set as an
// env var, per Vercel's own cron-security convention). Checked in that
// order since a cron secret would otherwise fail JWT decoding as noise.
async function authenticateCaller(request: Request): Promise<{ agencyId: string } | { cron: true } | null> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return { cron: true };

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

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

interface SyncResult {
  recordsSynced: number;
  contentItemsSynced?: number;
  range: { since: string; until: string };
}

// A connection's own record of what platform it targets tells us which
// Meta surface to hit; scope_filters narrows a `meta` (paid ads) connection
// down to specific campaigns/ad sets/ads via the Graph API's own filtering
// param. Every write here deletes the affected date range before
// re-inserting (not upsert) - paid_daily_metrics' unique constraint
// includes nullable adset_id/ad_id columns, and Postgres never treats NULL
// as equal to NULL in a unique index, so upsert silently stops
// deduplicating the moment any row in the range has a null dimension.
async function syncConnection(supabaseAdmin: SupabaseAdmin, conn: any): Promise<SyncResult> {
  // Always re-pull a trailing few days even on a connection that's synced
  // before - Meta's own insights for the last 1-2 days are commonly
  // revised as attribution windows close, so a pure "since last sync"
  // pull would permanently freeze under-attributed numbers for those days.
  const since = conn.last_synced_at ? isoDate(3) : isoDate(30);
  const until = isoDate(1); // yesterday - "today" is still partial/unreliable in Meta's own insights

  if (conn.platform === "meta") {
    const scope = conn.scope_filters || {};
    const rows = await fetchMetaAdInsights(conn.external_account_id, since, until, scope);

    const { error: delError } = await supabaseAdmin
      .from("paid_daily_metrics")
      .delete()
      .eq("client_id", conn.client_id)
      .eq("platform", "meta")
      .gte("date", since)
      .lte("date", until);
    if (delError) throw delError;

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("paid_daily_metrics").insert(
        rows.map((r) => ({
          client_id: conn.client_id,
          connection_id: conn.id,
          platform: "meta",
          date: r.date,
          account_id: conn.external_account_id,
          account_name: conn.account_name,
          campaign_id: r.campaignId,
          campaign_name: r.campaignName,
          campaign_objective: r.campaignObjective,
          adset_id: r.adsetId,
          adset_name: r.adsetName,
          ad_id: r.adId,
          ad_name: r.adName,
          spend: r.spend,
          impressions: r.impressions,
          reach: r.reach,
          frequency: r.frequency,
          clicks: r.clicks,
          link_clicks: r.linkClicks,
          landing_page_views: r.landingPageViews,
          outbound_clicks: r.outboundClicks,
          unique_clicks: r.uniqueClicks,
          video_views: r.videoViews,
          thruplays: r.thruplays,
          video_completions: r.videoCompletions,
          video_avg_watch_time: r.videoAvgWatchTime,
          conversions: r.conversions,
          leads: r.leads,
          purchases: r.purchases,
          conversion_value: r.conversionValue,
        }))
      );
      if (error) throw error;
    }
    return { recordsSynced: rows.length, range: { since, until } };
  }

  if (conn.platform === "facebook_page" || conn.platform === "instagram") {
    const dailyRows =
      conn.platform === "facebook_page"
        ? await fetchFacebookPageInsights(conn.external_account_id, since, until)
        : await fetchInstagramInsights(conn.external_account_id, since, until);

    const followerCount =
      conn.platform === "facebook_page"
        ? await fetchFacebookPageFollowerCount(conn.external_account_id)
        : await fetchInstagramFollowerCount(conn.external_account_id);
    // Meta only exposes a live follower-count snapshot, not a historical
    // daily series, so it's stamped onto the most recent day in this batch
    // rather than backfilled across every day in the range.
    if (dailyRows.length > 0) dailyRows[dailyRows.length - 1].totalFollowers = followerCount;

    const { error: delError } = await supabaseAdmin
      .from("organic_daily_metrics")
      .delete()
      .eq("client_id", conn.client_id)
      .eq("platform", conn.platform)
      .gte("date", since)
      .lte("date", until);
    if (delError) throw delError;

    if (dailyRows.length > 0) {
      const { error } = await supabaseAdmin.from("organic_daily_metrics").insert(
        dailyRows.map((r) => ({
          client_id: conn.client_id,
          connection_id: conn.id,
          platform: conn.platform,
          date: r.date,
          total_followers: r.totalFollowers || 0,
          followers_gained: r.followersGained,
          followers_lost: r.followersLost,
          profile_visits: r.profileVisits,
          accounts_reached: r.accountsReached,
          accounts_engaged: r.accountsEngaged,
          post_impressions: r.postImpressions,
          post_reach: r.postReach,
          post_engagements: r.postEngagements,
          reel_views: r.reelViews,
          story_views: r.storyViews,
          story_exits: r.storyExits,
        }))
      );
      if (error) throw error;
    }

    const contentItems =
      conn.platform === "facebook_page"
        ? await fetchFacebookPagePosts(conn.external_account_id, since, until)
        : await fetchInstagramMedia(conn.external_account_id, since, until);

    for (const item of contentItems) {
      const { error } = await supabaseAdmin.from("organic_content_items").upsert(
        {
          client_id: conn.client_id,
          platform: conn.platform,
          external_content_id: item.externalContentId,
          content_type: item.contentType,
          caption: item.caption,
          media_url: item.mediaUrl,
          permalink: item.permalink,
          published_at: item.publishedAt,
          reach: item.reach,
          impressions: item.impressions,
          likes: item.likes,
          comments: item.comments,
          shares: item.shares,
          saves: item.saves,
          video_views: item.videoViews,
          avg_watch_time: item.avgWatchTime,
          raw_insights: item.rawInsights,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id,platform,external_content_id" }
      );
      if (error) throw error;
    }

    return { recordsSynced: dailyRows.length, contentItemsSynced: contentItems.length, range: { since, until } };
  }

  throw new Error(`Real ingestion isn't wired up yet for platform "${conn.platform}" (Google Ads / TikTok Ads).`);
}

async function runIngestion(request: Request, body: { clientId?: string; connectionId?: string }) {
  const caller = await authenticateCaller(request);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();

  let query = supabaseAdmin.from("platform_connections").select("*, clients!inner(id, agency_id, name)").in("platform", ["meta", "facebook_page", "instagram"]);

  if (body.connectionId) {
    // A targeted retry (the per-connection "Sync Now" button) runs
    // regardless of sync_status, since that's exactly how a connection
    // stuck in "error" gets retried.
    query = query.eq("id", body.connectionId);
  } else {
    query = query.eq("sync_status", "active");
    if (body.clientId) query = query.eq("client_id", body.clientId);
  }
  if (!("cron" in caller)) query = query.eq("clients.agency_id", caller.agencyId);

  const { data: connections, error: connError } = await query;
  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 });
  if (!connections || connections.length === 0) {
    return NextResponse.json({ success: true, syncedAt: new Date().toISOString(), details: [] });
  }

  const details = [];
  for (const conn of connections) {
    const clientName = (conn as any).clients?.name || conn.client_id;
    try {
      const result = await syncConnection(supabaseAdmin, conn);
      await supabaseAdmin
        .from("platform_connections")
        .update({ sync_status: "active", last_synced_at: new Date().toISOString() })
        .eq("id", conn.id);
      details.push({ connectionId: conn.id, clientName, platform: conn.platform, status: "success", ...result });
    } catch (err: any) {
      await supabaseAdmin.from("platform_connections").update({ sync_status: "error" }).eq("id", conn.id);
      details.push({ connectionId: conn.id, clientName, platform: conn.platform, status: "error", error: err.message || String(err) });
    }
  }

  return NextResponse.json({ success: true, syncedAt: new Date().toISOString(), details });
}

// Manual trigger - the "Sync Now" button (Bearer <Supabase JWT>), optionally
// scoped to one clientId or one connectionId.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return runIngestion(request, body);
}

// Vercel Cron always issues a GET request to the configured path.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader) {
    return runIngestion(request, {});
  }
  return NextResponse.json({
    status: "active",
    connectors: ["meta_graph_api"],
    note: "POST with a Bearer token to trigger a sync; GET with a Bearer token is used by Vercel Cron.",
  });
}
