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
  findPageForInstagramAccount,
  fetchAdAccountCurrency,
} from "@/lib/meta-api";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

// A cron invocation has a hard ceiling on Vercel. Rather than looping every
// connection in one request and getting killed partway through (leaving no
// record of what did or didn't run), each run works a time budget and stops
// cleanly. Connections are processed stalest-first, so whatever doesn't fit
// is simply first in line on the next run.
const TIME_BUDGET_MS = 45_000;
// Concurrency is capped because every connection shares one Meta app quota;
// running them all at once just converts parallelism into rate-limit errors.
const CONCURRENCY = 3;

/**
 * Either a real agency admin (Bearer <Supabase JWT>, used by the "Sync Now"
 * button) or Vercel Cron (Bearer <CRON_SECRET> - Vercel sends this header
 * automatically on cron-triggered requests when CRON_SECRET is set). Checked
 * in that order since a cron secret would otherwise fail JWT decoding as noise.
 */
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

interface SyncOutcome {
  recordsSynced: number;
  contentItemsSynced?: number;
  range: { since: string; until: string };
}

/**
 * Resolves the window to pull. An explicit backfill range wins; otherwise a
 * connection that has synced before re-pulls a trailing few days (Meta
 * revises the last 1-2 days as attribution windows close, so a pure
 * "since last sync" pull would permanently freeze under-attributed numbers),
 * and a brand new connection gets 30 days of history.
 */
function resolveRange(conn: any, backfill?: { since: string; until: string }) {
  if (backfill) return backfill;
  return {
    since: conn.last_synced_at ? isoDate(3) : isoDate(30),
    // "Today" is still partial in Meta's own insights, so it's excluded.
    until: isoDate(1),
  };
}

/**
 * Every write deletes the affected date range before re-inserting rather
 * than upserting: paid_daily_metrics' unique constraint includes nullable
 * adset_id/ad_id columns, and Postgres never treats NULL as equal to NULL in
 * a unique index, so upsert silently stops deduplicating the moment any row
 * in the range has a null dimension.
 */
async function syncConnection(
  supabaseAdmin: SupabaseAdmin,
  conn: any,
  backfill?: { since: string; until: string }
): Promise<SyncOutcome> {
  const { since, until } = resolveRange(conn, backfill);

  if (conn.platform === "meta") {
    const scope = conn.scope_filters || {};
    const rows = await fetchMetaAdInsights(conn.external_account_id, since, until, scope);

    // Stamp the account's reporting currency on the connection. Done here
    // rather than only at connection-creation so existing connections
    // (and any created before currency was captured) heal on their next
    // sync instead of silently formatting SAR spend as dollars.
    if (!conn.currency) {
      try {
        const currency = await fetchAdAccountCurrency(conn.external_account_id);
        if (currency) await supabaseAdmin.from("platform_connections").update({ currency }).eq("id", conn.id);
      } catch {
        // Non-fatal: a missing currency degrades to the default, it should
        // never fail an otherwise good sync.
      }
    }

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
    const isPage = conn.platform === "facebook_page";
    // Instagram is reached through its connected Page, whose access token
    // every IG call requires. Connections only store the IG account id, so
    // the parent Page is resolved automatically rather than being another
    // thing the agency has to configure.
    const igParentPageId = isPage ? undefined : (await findPageForInstagramAccount(conn.external_account_id)) || undefined;

    const dailyRows = isPage
      ? await fetchFacebookPageInsights(conn.external_account_id, since, until)
      : await fetchInstagramInsights(conn.external_account_id, since, until, igParentPageId);

    const followerCount = isPage
      ? await fetchFacebookPageFollowerCount(conn.external_account_id)
      : await fetchInstagramFollowerCount(conn.external_account_id, igParentPageId);
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

    const contentItems = isPage
      ? await fetchFacebookPagePosts(conn.external_account_id, since, until)
      : await fetchInstagramMedia(conn.external_account_id, since, until, igParentPageId);

    // Scope filter: when the agency has pinned this connection to specific
    // posts, everything else is dropped rather than stored and hidden later.
    const postIds: string[] = conn.scope_filters?.postIds || [];
    const scopedItems = postIds.length
      ? contentItems.filter((item) => postIds.includes(item.externalContentId))
      : contentItems;

    if (scopedItems.length > 0) {
      const { error } = await supabaseAdmin.from("organic_content_items").upsert(
        scopedItems.map((item) => ({
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
        })),
        { onConflict: "client_id,platform,external_content_id" }
      );
      if (error) throw error;
    }

    return { recordsSynced: dailyRows.length, contentItemsSynced: scopedItems.length, range: { since, until } };
  }

  throw new Error(`Real ingestion isn't wired up yet for platform "${conn.platform}" (Google Ads / TikTok Ads).`);
}

/** Runs one connection end to end and records the attempt, success or failure. */
async function runOne(
  supabaseAdmin: SupabaseAdmin,
  conn: any,
  triggerSource: "manual" | "cron" | "backfill",
  backfill?: { since: string; until: string }
) {
  const clientName = conn.clients?.name || conn.client_id;
  const startedAt = Date.now();

  try {
    const result = await syncConnection(supabaseAdmin, conn, backfill);
    await supabaseAdmin
      .from("platform_connections")
      .update({ sync_status: "active", last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);

    await supabaseAdmin.from("sync_logs").insert({
      connection_id: conn.id,
      client_id: conn.client_id,
      platform: conn.platform,
      account_name: conn.account_name,
      status: "success",
      trigger_source: triggerSource,
      range_since: result.range.since,
      range_until: result.range.until,
      records_synced: result.recordsSynced,
      content_items_synced: result.contentItemsSynced || 0,
      duration_ms: Date.now() - startedAt,
    });

    return { connectionId: conn.id, clientName, platform: conn.platform, status: "success", ...result };
  } catch (err: any) {
    const message = err?.message || String(err);
    await supabaseAdmin.from("platform_connections").update({ sync_status: "error" }).eq("id", conn.id);

    const range = resolveRange(conn, backfill);
    await supabaseAdmin.from("sync_logs").insert({
      connection_id: conn.id,
      client_id: conn.client_id,
      platform: conn.platform,
      account_name: conn.account_name,
      status: "error",
      trigger_source: triggerSource,
      range_since: range.since,
      range_until: range.until,
      error: message,
      duration_ms: Date.now() - startedAt,
    });

    return { connectionId: conn.id, clientName, platform: conn.platform, status: "error", error: message };
  }
}

interface IngestBody {
  clientId?: string;
  connectionId?: string;
  /** explicit historical window, e.g. onboarding a client with 12 months of history */
  backfill?: { since: string; until: string };
}

async function runIngestion(request: Request, body: IngestBody) {
  const caller = await authenticateCaller(request);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const isCron = "cron" in caller;

  let query = supabaseAdmin
    .from("platform_connections")
    .select("*, clients!inner(id, agency_id, name)")
    .in("platform", ["meta", "facebook_page", "instagram"]);

  if (body.connectionId) {
    // A targeted retry (the per-connection "Sync Now" button) runs regardless
    // of sync_status - that's exactly how a connection stuck in "error" gets
    // retried.
    query = query.eq("id", body.connectionId);
  } else {
    query = query.eq("sync_status", "active");
    if (body.clientId) query = query.eq("client_id", body.clientId);
  }
  if (!isCron) query = query.eq("clients.agency_id", caller.agencyId);

  // Stalest first, so a run that exhausts its budget resumes where it left
  // off rather than re-syncing the same head of the list every time.
  query = query.order("last_synced_at", { ascending: true, nullsFirst: true });

  const { data: connections, error: connError } = await query;
  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 });
  if (!connections || connections.length === 0) {
    return NextResponse.json({ success: true, syncedAt: new Date().toISOString(), details: [] });
  }

  const triggerSource: "manual" | "cron" | "backfill" = body.backfill ? "backfill" : isCron ? "cron" : "manual";
  const startedAt = Date.now();
  const details: any[] = [];
  const queue = [...connections];
  let budgetExhausted = false;

  // Bounded-concurrency workers pulling from a shared queue. Each checks the
  // clock before starting new work, so the run ends cleanly at the budget
  // instead of being killed mid-write by the platform's own timeout.
  async function worker() {
    for (;;) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        if (queue.length > 0) budgetExhausted = true;
        return;
      }
      const conn = queue.shift();
      if (!conn) return;
      details.push(await runOne(supabaseAdmin, conn, triggerSource, body.backfill));
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  return NextResponse.json({
    success: true,
    syncedAt: new Date().toISOString(),
    details,
    ...(budgetExhausted
      ? {
          note: `Stopped at the time budget with ${queue.length} connection(s) remaining. They are first in line on the next run.`,
          remaining: queue.length,
        }
      : {}),
  });
}

/** Manual trigger - "Sync Now" and backfill (Bearer <Supabase JWT>). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as IngestBody;

  if (body.backfill) {
    const { since, until } = body.backfill;
    const valid = /^\d{4}-\d{2}-\d{2}$/;
    if (!valid.test(since || "") || !valid.test(until || "")) {
      return NextResponse.json({ error: "backfill.since and backfill.until must be yyyy-mm-dd" }, { status: 400 });
    }
    if (since > until) {
      return NextResponse.json({ error: "backfill.since must be on or before backfill.until" }, { status: 400 });
    }
  }

  return runIngestion(request, body);
}

/** Vercel Cron always issues a GET request to the configured path. */
export async function GET(request: Request) {
  if (request.headers.get("authorization")) {
    return runIngestion(request, {});
  }
  return NextResponse.json({
    status: "active",
    connectors: ["meta_graph_api"],
    note: "POST with a Bearer token to trigger a sync; GET with a Bearer token is used by Vercel Cron.",
  });
}
