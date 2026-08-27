// Server-only Meta Graph API client. Uses a single agency-wide System User
// token (Business Settings -> Users -> System Users) rather than per-client
// OAuth - the System User must be added as a partner/admin on every ad
// account, Page, and IG Business Account this agency reports on. NEVER
// import this from a "use client" component; it belongs behind
// src/app/api/** route handlers only, same boundary as supabase-admin.ts.

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function getSystemUserToken(): string {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN is not configured");
  return token;
}

// Meta's throttling error codes. 4 and 17 are app/user rate limits, 32 is
// the page-level limit, 613 is "calls to this api have exceeded the rate
// limit", 80000-80006 are the per-product business-use-case limits. All are
// transient: the right response is to wait and retry, not to mark the
// connection failed and silently lose a day of data.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006]);
const TRANSIENT_CODES = new Set([1, 2]); // unknown/temporary Meta-side errors

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * How close to Meta's per-app quota the last response reported. Meta returns
 * this on every call as a header; reading it lets us slow down *before*
 * getting throttled rather than only reacting to a 429.
 */
function usagePercent(res: Response): number {
  const header =
    res.headers.get("x-business-use-case-usage") ||
    res.headers.get("x-app-usage") ||
    res.headers.get("x-ad-account-usage");
  if (!header) return 0;
  try {
    const parsed = JSON.parse(header);
    const entries = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();
    let peak = 0;
    for (const entry of entries as any[]) {
      if (!entry || typeof entry !== "object") continue;
      peak = Math.max(
        peak,
        Number(entry.call_count) || 0,
        Number(entry.total_cputime) || 0,
        Number(entry.total_time) || 0
      );
    }
    return peak;
  } catch {
    return 0;
  }
}

async function graphFetch(url: string, attempt = 0): Promise<any> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));

  const code = json?.error?.code;
  const isRateLimited = res.status === 429 || (code != null && RATE_LIMIT_CODES.has(code));
  const isTransient = res.status >= 500 || (code != null && TRANSIENT_CODES.has(code));

  if ((isRateLimited || isTransient) && attempt < MAX_RETRIES) {
    // Exponential backoff with jitter. Jitter matters because a cron run
    // syncs many connections against the same app quota - without it they'd
    // all back off in lockstep and collide again on every retry.
    const delay = BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
    await sleep(isRateLimited ? delay * 2 : delay);
    return graphFetch(url, attempt + 1);
  }

  if (!res.ok || json.error) {
    const detail = json.error?.message || `HTTP ${res.status}`;
    const suffix = isRateLimited ? " (rate limited - retries exhausted)" : "";
    throw new Error(`Meta API: ${detail}${suffix}`);
  }

  // Ease off voluntarily as the quota fills, so a long backfill degrades
  // into slowness rather than into a wall of 429s partway through.
  const usage = usagePercent(res);
  if (usage >= 90) await sleep(5000);
  else if (usage >= 75) await sleep(1500);

  return json;
}

async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", getSystemUserToken());
  return graphFetch(url.toString());
}

async function graphGetAllPages(path: string, params: Record<string, string>, maxPages = 50): Promise<any[]> {
  let json = await graphGet(path, params);
  let all: any[] = json.data || [];
  let pageCount = 1;
  while (json.paging?.next && pageCount < maxPages) {
    json = await graphFetch(json.paging.next);
    all = all.concat(json.data || []);
    pageCount++;
  }
  return all;
}

function sumActions(actions: { action_type: string; value: string }[] | undefined, types: string[]): number {
  if (!actions) return 0;
  return actions.filter((a) => types.includes(a.action_type)).reduce((sum, a) => sum + parseFloat(a.value || "0"), 0);
}

// ---------------------------------------------------------------------------
// Discovery - what does this System User token actually have access to?
// Backs the "Add Source" picker so an admin selects a real connected
// account/Page/IG profile instead of typing a Graph API ID from memory.
// ---------------------------------------------------------------------------

export interface DiscoveredAdAccount {
  id: string; // "act_123..." - already in the shape paid insights calls expect
  name: string;
  accountStatus: number;
}

export interface DiscoveredPage {
  id: string;
  name: string;
  instagramAccount: { id: string; username: string } | null;
}

// "me" resolves to the System User itself for a system-user access token,
// so /me/adaccounts and /me/accounts return exactly what that token was
// granted in Business Manager - no need to know the Business Manager ID.
export async function discoverAdAccounts(): Promise<DiscoveredAdAccount[]> {
  const rows = await graphGetAllPages("/me/adaccounts", {
    fields: "id,name,account_id,account_status",
    limit: "200",
  });
  return rows.map((r) => ({ id: r.id, name: r.name || r.account_id, accountStatus: r.account_status }));
}

export async function discoverPages(): Promise<DiscoveredPage[]> {
  const rows = await graphGetAllPages("/me/accounts", {
    fields: "id,name,instagram_business_account{id,username}",
    limit: "200",
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    instagramAccount: r.instagram_business_account
      ? { id: r.instagram_business_account.id, username: r.instagram_business_account.username }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Meta Ads (paid) - act_<id>/insights
// ---------------------------------------------------------------------------

export interface PaidInsightRow {
  date: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  outboundClicks: number;
  uniqueClicks: number;
  videoViews: number;
  thruplays: number;
  videoCompletions: number;
  videoAvgWatchTime: number;
  conversions: number;
  leads: number;
  purchases: number;
  conversionValue: number;
}

interface PaidScope {
  campaignIds?: string[];
  adSetIds?: string[];
  adIds?: string[];
}

function buildFiltering(scope: PaidScope): { field: string; operator: string; value: string[] }[] | null {
  const filters: { field: string; operator: string; value: string[] }[] = [];
  if (scope.campaignIds?.length) filters.push({ field: "campaign.id", operator: "IN", value: scope.campaignIds });
  if (scope.adSetIds?.length) filters.push({ field: "adset.id", operator: "IN", value: scope.adSetIds });
  if (scope.adIds?.length) filters.push({ field: "ad.id", operator: "IN", value: scope.adIds });
  return filters.length > 0 ? filters : null;
}

// level=ad gives the full campaign/adset/ad breakdown in one call, which is
// what paid_daily_metrics is shaped for. Conversion/purchase/lead figures
// come out of the `actions`/`action_values` arrays rather than dedicated
// fields - Meta's insights API reports every "action" (of which purchase,
// lead, landing_page_view are just specific action_types) in one bucket.
export async function fetchMetaAdInsights(
  adAccountId: string,
  since: string,
  until: string,
  scope: PaidScope = {}
): Promise<PaidInsightRow[]> {
  const fields = [
    "campaign_id",
    "campaign_name",
    "objective",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "inline_link_clicks",
    "outbound_clicks",
    "unique_clicks",
    "actions",
    "action_values",
    "video_play_actions",
    "video_thruplay_watched_actions",
    "video_avg_time_watched_actions",
    "video_p100_watched_actions",
  ].join(",");

  const params: Record<string, string> = {
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields,
    limit: "500",
  };
  const filtering = buildFiltering(scope);
  if (filtering) params.filtering = JSON.stringify(filtering);

  const rows = await graphGetAllPages(`/${adAccountId}/insights`, params);

  const purchaseTypes = ["offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase", "purchase"];
  const leadTypes = ["lead", "onsite_conversion.lead_grouped"];

  return rows.map((r) => ({
    date: r.date_start,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name || "",
    campaignObjective: r.objective || "",
    adsetId: r.adset_id || null,
    adsetName: r.adset_name || null,
    adId: r.ad_id || null,
    adName: r.ad_name || null,
    spend: parseFloat(r.spend || "0"),
    impressions: parseInt(r.impressions || "0", 10),
    reach: parseInt(r.reach || "0", 10),
    frequency: parseFloat(r.frequency || "0"),
    clicks: parseInt(r.clicks || "0", 10),
    linkClicks: parseInt(r.inline_link_clicks || "0", 10),
    landingPageViews: sumActions(r.actions, ["landing_page_view"]),
    outboundClicks: sumActions(r.outbound_clicks, ["outbound_click"]),
    uniqueClicks: parseInt(r.unique_clicks || "0", 10),
    videoViews: sumActions(r.video_play_actions, ["video_view"]),
    thruplays: sumActions(r.video_thruplay_watched_actions, ["video_view"]),
    videoCompletions: sumActions(r.video_p100_watched_actions, ["video_view"]),
    videoAvgWatchTime: parseFloat(r.video_avg_time_watched_actions?.[0]?.value || "0"),
    conversions: sumActions(r.actions, purchaseTypes),
    leads: sumActions(r.actions, leadTypes),
    purchases: sumActions(r.actions, purchaseTypes),
    conversionValue: sumActions(r.action_values, purchaseTypes),
  }));
}

// ---------------------------------------------------------------------------
// Facebook Page (organic) + Instagram (organic)
// ---------------------------------------------------------------------------

export interface OrganicDailyRow {
  date: string;
  totalFollowers?: number;
  followersGained: number;
  followersLost: number;
  profileVisits: number;
  accountsReached: number;
  accountsEngaged: number;
  postImpressions: number;
  postReach: number;
  postEngagements: number;
  reelViews: number;
  storyViews: number;
  storyExits: number;
}

function emptyOrganicRow(date: string): OrganicDailyRow {
  return {
    date,
    followersGained: 0,
    followersLost: 0,
    profileVisits: 0,
    accountsReached: 0,
    accountsEngaged: 0,
    postImpressions: 0,
    postReach: 0,
    postEngagements: 0,
    reelViews: 0,
    storyViews: 0,
    storyExits: 0,
  };
}

const FB_METRIC_MAP: Record<string, keyof OrganicDailyRow> = {
  page_fan_adds: "followersGained",
  page_fan_removes: "followersLost",
  page_impressions_unique: "accountsReached",
  page_engaged_users: "accountsEngaged",
  page_posts_impressions: "postImpressions",
  page_post_engagements: "postEngagements",
};

const IG_METRIC_MAP: Record<string, keyof OrganicDailyRow> = {
  reach: "accountsReached",
  profile_views: "profileVisits",
  accounts_engaged: "accountsEngaged",
};

async function fetchInsightsByDate(
  path: string,
  metrics: Record<string, keyof OrganicDailyRow>,
  since: string,
  until: string,
  extraParams: Record<string, string> = {}
): Promise<Map<string, OrganicDailyRow>> {
  const byDate = new Map<string, OrganicDailyRow>();
  const json = await graphGet(path, {
    metric: Object.keys(metrics).join(","),
    period: "day",
    since,
    until,
    ...extraParams,
  });
  for (const series of json.data || []) {
    const field = metrics[series.name];
    if (!field) continue;
    for (const point of series.values || []) {
      const date = String(point.end_time).slice(0, 10);
      const row = byDate.get(date) || emptyOrganicRow(date);
      (row[field] as number) = typeof point.value === "number" ? point.value : 0;
      byDate.set(date, row);
    }
  }
  return byDate;
}

export async function fetchFacebookPageInsights(pageId: string, since: string, until: string): Promise<OrganicDailyRow[]> {
  const byDate = await fetchInsightsByDate(`/${pageId}/insights`, FB_METRIC_MAP, since, until);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchFacebookPageFollowerCount(pageId: string): Promise<number> {
  const json = await graphGet(`/${pageId}`, { fields: "fan_count" });
  return json.fan_count || 0;
}

// Modern IG Graph API insights require metric_type=time_series for daily
// breakdowns (a plain `metric` request without it returns a single
// aggregate for the whole range instead of one point per day).
export async function fetchInstagramInsights(igUserId: string, since: string, until: string): Promise<OrganicDailyRow[]> {
  const byDate = await fetchInsightsByDate(`/${igUserId}/insights`, IG_METRIC_MAP, since, until, {
    metric_type: "time_series",
  });
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchInstagramFollowerCount(igUserId: string): Promise<number> {
  const json = await graphGet(`/${igUserId}`, { fields: "followers_count" });
  return json.followers_count || 0;
}

// ---------------------------------------------------------------------------
// Per-post content (feeds the per-post content_table widget)
// ---------------------------------------------------------------------------

export interface ContentItemRow {
  externalContentId: string;
  contentType: "post" | "reel" | "story" | "carousel" | "video";
  caption: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  publishedAt: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
  avgWatchTime: number;
  rawInsights: Record<string, any>;
}

export async function fetchFacebookPagePosts(pageId: string, since: string, until: string): Promise<ContentItemRow[]> {
  const posts = await graphGetAllPages(`/${pageId}/posts`, {
    fields: "id,message,created_time,permalink_url,full_picture",
    since,
    until,
    limit: "50",
  });

  const results: ContentItemRow[] = [];
  for (const post of posts) {
    // Insights/engagement are fetched per-post and can legitimately fail
    // for boosted-only or restricted posts - one bad post shouldn't sink
    // the whole sync, so each fetch degrades to zeros instead of throwing.
    let insights: Record<string, any> = {};
    try {
      const insightsJson = await graphGet(`/${post.id}/insights`, {
        metric: "post_impressions,post_impressions_unique,post_engaged_users",
      });
      insights = Object.fromEntries((insightsJson.data || []).map((m: any) => [m.name, m.values?.[0]?.value || 0]));
    } catch {
      // best-effort
    }
    let engagement: Record<string, any> = {};
    try {
      engagement = await graphGet(`/${post.id}`, {
        fields: "likes.summary(true).limit(0),comments.summary(true).limit(0),shares",
      });
    } catch {
      // best-effort
    }
    results.push({
      externalContentId: post.id,
      contentType: "post",
      caption: post.message || null,
      mediaUrl: post.full_picture || null,
      permalink: post.permalink_url || null,
      publishedAt: post.created_time,
      reach: insights.post_impressions_unique || 0,
      impressions: insights.post_impressions || 0,
      likes: engagement.likes?.summary?.total_count || 0,
      comments: engagement.comments?.summary?.total_count || 0,
      shares: engagement.shares?.count || 0,
      saves: 0,
      videoViews: 0,
      avgWatchTime: 0,
      rawInsights: { ...insights, ...engagement },
    });
  }
  return results;
}

// IG Stories expire after 24h and aren't retrievable retroactively via
// /media, so this covers feed posts, carousels, reels, and videos only.
export async function fetchInstagramMedia(igUserId: string, since: string, until: string): Promise<ContentItemRow[]> {
  const media = await graphGetAllPages(`/${igUserId}/media`, {
    fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
    limit: "50",
  });

  const sinceMs = new Date(`${since}T00:00:00Z`).getTime();
  const untilMs = new Date(`${until}T23:59:59Z`).getTime();
  const inRange = media.filter((m: any) => {
    const t = new Date(m.timestamp).getTime();
    return t >= sinceMs && t <= untilMs;
  });

  const results: ContentItemRow[] = [];
  for (const m of inRange) {
    let insights: Record<string, any> = {};
    try {
      const isVideo = m.media_type === "VIDEO" || m.media_type === "REELS";
      const metricList = isVideo ? "reach,saved,video_views" : "reach,saved";
      const insightsJson = await graphGet(`/${m.id}/insights`, { metric: metricList });
      insights = Object.fromEntries((insightsJson.data || []).map((x: any) => [x.name, x.values?.[0]?.value || 0]));
    } catch {
      // best-effort
    }
    results.push({
      externalContentId: m.id,
      contentType:
        m.media_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : m.media_type === "VIDEO" ? "video" : "post",
      caption: m.caption || null,
      mediaUrl: m.media_url || null,
      permalink: m.permalink || null,
      publishedAt: m.timestamp,
      reach: insights.reach || 0,
      impressions: 0,
      likes: m.like_count || 0,
      comments: m.comments_count || 0,
      shares: 0,
      saves: insights.saved || 0,
      videoViews: insights.video_views || 0,
      avgWatchTime: 0,
      rawInsights: insights,
    });
  }
  return results;
}
