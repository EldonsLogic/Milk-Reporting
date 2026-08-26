// One-time seed script for a freshly-migrated Supabase project. Run with:
//   node --env-file=.env.local -e "require('tsx/cjs')" scripts/seed.ts
// or simply:
//   npx tsx --env-file=.env.local scripts/seed.ts
//
// Uses the service-role key (bypasses RLS) - never import this file from
// the Next.js app itself, it must only ever run server-side/CLI.
// @supabase/supabase-js always constructs a Realtime client, which needs a
// global WebSocket - native in Node 22+, absent in Node 20. Polyfill before
// importing supabase-js so this script runs on Node 20 too (we don't use
// realtime features here, this is purely to satisfy the constructor).
import WebSocket from "ws";
(globalThis as any).WebSocket = (globalThis as any).WebSocket || WebSocket;

import { createClient } from "@supabase/supabase-js";
import { MOCK_CLIENTS, generateMockRecords, generateMockContentPosts, MOCK_TEMPLATES } from "../src/lib/mock-data";
import type { RawDailyRecord } from "../src/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@milk-reporting.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "MilkReporting2026!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAID_PLATFORMS = new Set(["meta", "google_ads", "tiktok_ads"]);

function paidRow(clientId: string, r: RawDailyRecord) {
  return {
    client_id: clientId,
    platform: r.platform,
    date: r.date,
    account_id: `${clientId}-${r.platform}-acct`,
    account_name: r.accountName,
    campaign_id: r.campaignId || `${r.platform}-default-campaign`,
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
    outbound_clicks: r.outboundClicks || 0,
    unique_clicks: r.uniqueClicks || 0,
    video_views: r.videoViews,
    video_3s_views: r.video3sViews,
    thruplays: r.thruplays,
    video_completions: r.videoCompletions,
    video_avg_watch_time: r.videoAvgWatchTime,
    video_views_2s: r.videoViews2s || 0,
    video_views_6s: r.videoViews6s || 0,
    post_engagements: r.postEngagements,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    negative_feedback: r.negativeFeedback || 0,
    conversions: r.conversions,
    leads: r.leads,
    purchases: r.purchases,
    conversion_value: r.conversionValue,
    view_through_conversions: r.viewThroughConversions || 0,
    search_impression_share: r.searchImpressionShare ?? null,
    quality_score: r.qualityScore ?? null,
  };
}

function organicRow(clientId: string, r: RawDailyRecord) {
  return {
    client_id: clientId,
    platform: r.platform,
    date: r.date,
    total_followers: r.totalFollowers || 0,
    followers_gained: r.followersGained || 0,
    followers_lost: r.followersLost || 0,
    profile_visits: r.profileVisits || 0,
    accounts_reached: r.accountsReached || 0,
    accounts_engaged: r.accountsEngaged || 0,
    post_impressions: r.impressions || 0,
    post_reach: r.reach || 0,
    post_engagements: r.postEngagements || 0,
    reel_views: r.reelViews || 0,
    story_views: r.storyViews || 0,
    story_exits: r.storyExits || 0,
    comments_responded: r.commentsResponded || 0,
    avg_response_time_minutes: r.avgResponseTimeMinutes ?? null,
    posts_published: r.postsPublished || 0,
  };
}

async function main() {
  console.log("1/6 Creating agency admin auth user...");
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (userError && !userError.message.includes("already been registered")) {
    throw userError;
  }
  let adminUserId = userData?.user?.id;
  if (!adminUserId) {
    const { data: list } = await supabase.auth.admin.listUsers();
    adminUserId = list?.users.find((u) => u.email === ADMIN_EMAIL)?.id;
  }
  if (!adminUserId) throw new Error("Could not create or find admin user");
  console.log("   admin user id:", adminUserId);

  console.log("2/6 Creating agency + linking admin...");
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .upsert({ name: "Milk", slug: "milk" }, { onConflict: "slug" })
    .select()
    .single();
  if (agencyError) throw agencyError;

  const { error: agencyUserError } = await supabase
    .from("agency_users")
    .upsert({ user_id: adminUserId, agency_id: agency.id, full_name: "Agency Admin" }, { onConflict: "user_id" });
  if (agencyUserError) throw agencyUserError;

  console.log("3/6 Creating clients + connections...");
  for (const mockClient of MOCK_CLIENTS) {
    const { error: clientError } = await supabase.from("clients").upsert({
      id: mockClient.id,
      agency_id: agency.id,
      name: mockClient.name,
      slug: mockClient.slug,
      objective_type: mockClient.objectiveType,
    });
    if (clientError) throw clientError;

    for (const conn of mockClient.connectedPlatforms) {
      const connectionType = conn.platform === "facebook_page" || conn.platform === "instagram" ? "organic_social" : "paid_ads";
      const { error: connError } = await supabase.from("platform_connections").upsert(
        {
          id: `conn-${mockClient.id}-${conn.platform}`,
          client_id: mockClient.id,
          platform: conn.platform,
          connection_type: connectionType,
          account_name: conn.accountName,
          external_account_id: conn.externalId,
          sync_status: conn.status,
          last_synced_at: conn.lastSyncedAt,
        },
        { onConflict: "id" }
      );
      if (connError) throw connError;
    }
  }

  console.log("4/6 Seeding daily metrics...");
  for (const mockClient of MOCK_CLIENTS) {
    // Delete-then-insert rather than upsert: the unique constraint includes
    // adset_id/ad_id, which are NULL for this mock data - and NULL is never
    // considered equal to NULL for uniqueness purposes in Postgres, so
    // ON CONFLICT never matched and every re-run was silently inserting
    // duplicate rows instead of replacing them (found this by re-checking
    // seeded data directly and noticing every row appeared twice+).
    const { error: clearPaidError } = await supabase.from("paid_daily_metrics").delete().eq("client_id", mockClient.id);
    if (clearPaidError) throw clearPaidError;
    const { error: clearOrganicError } = await supabase.from("organic_daily_metrics").delete().eq("client_id", mockClient.id);
    if (clearOrganicError) throw clearOrganicError;

    const records = generateMockRecords(mockClient.id);
    const paidRows = records.filter((r) => PAID_PLATFORMS.has(r.platform)).map((r) => paidRow(mockClient.id, r));
    const organicRows = records.filter((r) => !PAID_PLATFORMS.has(r.platform)).map((r) => organicRow(mockClient.id, r));

    for (let i = 0; i < paidRows.length; i += 500) {
      const { error } = await supabase.from("paid_daily_metrics").insert(paidRows.slice(i, i + 500));
      if (error) throw error;
    }
    for (let i = 0; i < organicRows.length; i += 500) {
      const { error } = await supabase.from("organic_daily_metrics").insert(organicRows.slice(i, i + 500));
      if (error) throw error;
    }
    console.log(`   ${mockClient.name}: ${paidRows.length} paid rows, ${organicRows.length} organic rows`);
  }

  console.log("5/6 Seeding content posts...");
  for (const mockClient of MOCK_CLIENTS) {
    const posts = generateMockContentPosts(mockClient.id);
    if (posts.length === 0) continue;
    const rows = posts.map((p) => ({
      client_id: mockClient.id,
      platform: p.platform,
      external_content_id: p.id,
      content_type: p.contentType,
      caption: p.caption,
      media_url: p.thumbnailUrl || null,
      permalink: p.permalinkUrl || null,
      published_at: p.postedAt,
      reach: p.metrics.reach || 0,
      impressions: p.metrics.impressions || 0,
      likes: p.metrics.likes || 0,
      comments: p.metrics.comments || 0,
      shares: p.metrics.shares || 0,
      saves: p.metrics.saves || 0,
      video_views: p.metrics.videoViews || 0,
    }));
    const { error } = await supabase.from("organic_content_items").upsert(rows, { onConflict: "client_id,platform,external_content_id" });
    if (error) throw error;
    console.log(`   ${mockClient.name}: ${rows.length} posts`);
  }

  console.log("6/6 Seeding dashboards...");
  // MOCK_CLIENTS order: Aura (paid, brand_awareness), Apex (paid, lead_gen),
  // Velox (paid, ecommerce), Lumina (organic-only, social_content) - only
  // Lumina has no paid connections, so only she gets the organic template;
  // everyone else's widgets (platform: "all"/meta-scoped) need real paid
  // data behind them, which the other three have and Lumina doesn't.
  const templateByIndex = [MOCK_TEMPLATES[0], MOCK_TEMPLATES[0], MOCK_TEMPLATES[0], MOCK_TEMPLATES[1]];
  for (let ci = 0; ci < MOCK_CLIENTS.length; ci++) {
    const mockClient = MOCK_CLIENTS[ci];
    const template = templateByIndex[ci] || MOCK_TEMPLATES[0];
    const dashboardId = `dash-${mockClient.id}`;

    const { error: dashError } = await supabase.from("dashboards").upsert({
      id: dashboardId,
      client_id: mockClient.id,
      title: `${mockClient.name} Overview`,
      global_date_range: "last_30_days",
      markup_percentage: 0,
      is_default: true,
    });
    if (dashError) throw dashError;

    // Delete-then-recreate pages (cascades to widgets via FK) rather than
    // upsert-in-place - upsert only touches matching ids, so a re-run with
    // a different (e.g. shorter) template silently orphaned old widgets
    // instead of removing them. Same pattern as saveDashboard() in
    // src/lib/supabase-data.ts.
    const { error: clearError } = await supabase.from("dashboard_pages").delete().eq("dashboard_id", dashboardId);
    if (clearError) throw clearError;

    for (let pi = 0; pi < template.pages.length; pi++) {
      const page = template.pages[pi];
      const pageId = `p-${dashboardId}-${pi}`;
      const { error: pageError } = await supabase.from("dashboard_pages").upsert({
        id: pageId,
        dashboard_id: dashboardId,
        title: page.title,
        sort_order: page.sortOrder,
        sections: [],
      });
      if (pageError) throw pageError;

      const widgetRows = page.widgets.map((w, wi) => ({
        id: `w-${dashboardId}-${pi}-${wi}`,
        page_id: pageId,
        widget_type: w.widgetType,
        title: w.title,
        grid_x: w.grid.x,
        grid_y: w.grid.y,
        grid_w: w.grid.w,
        grid_h: w.grid.h,
        data_config: w.dataConfig,
        display_config: {},
      }));
      if (widgetRows.length > 0) {
        const { error: widgetError } = await supabase.from("dashboard_widgets").upsert(widgetRows);
        if (widgetError) throw widgetError;
      }
    }
    console.log(`   ${mockClient.name}: dashboard "${mockClient.name} Overview" (${template.name} template)`);
  }

  console.log("\nDone. Admin login:");
  console.log("  email:   ", ADMIN_EMAIL);
  console.log("  password:", ADMIN_PASSWORD);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
