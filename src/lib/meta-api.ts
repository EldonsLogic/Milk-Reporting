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

async function graphGet(path: string, params: Record<string, string>, token?: string): Promise<any> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token || getSystemUserToken());
  return graphFetch(url.toString());
}

async function graphGetAllPages(
  path: string,
  params: Record<string, string>,
  maxPages = 50,
  token?: string
): Promise<any[]> {
  let json = await graphGet(path, params, token);
  let all: any[] = json.data || [];
  let pageCount = 1;
  while (json.paging?.next && pageCount < maxPages) {
    json = await graphFetch(json.paging.next);
    all = all.concat(json.data || []);
    pageCount++;
  }
  return all;
}

/**
 * Page Insights and the Page's own post/media edges reject a System User
 * token outright - Meta answers "(#190) This method must be called with a
 * Page Access Token". The System User token can mint one per Page it has
 * been granted, which is what this does.
 *
 * Cached per Page for the lifetime of the process: a sync touches the same
 * Page for its daily insights, its posts, and every per-post insight call,
 * and re-minting the token each time is a wasted round trip against the same
 * rate limit the real data needs.
 */
const pageTokenCache = new Map<string, string>();

async function getPageAccessToken(pageId: string): Promise<string> {
  const cached = pageTokenCache.get(pageId);
  if (cached) return cached;

  const json = await graphGet(`/${pageId}`, { fields: "access_token" });
  const token = json?.access_token;
  if (!token) {
    throw new Error(
      `Meta API: no Page access token available for Page ${pageId}. The System User needs the Page assigned as an asset with pages_read_engagement.`
    );
  }
  pageTokenCache.set(pageId, token);
  return token;
}

/**
 * Meta rejects Page Insights queries spanning more than ~90 days with a bare
 * "Invalid parameter", so a long backfill has to be issued as several
 * requests. Splits [since, until] into consecutive chunks no longer than
 * `maxDays`.
 */
function splitDateRange(since: string, until: string, maxDays = 80): { since: string; until: string }[] {
  // Facebook Page Insights tolerates ~90 days per query; Instagram rejects
  // anything over 30 outright ("There cannot be more than 30 days between
  // since and until"), so callers pass their own ceiling.
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (!(start <= end)) return [];

  const chunks: { since: string; until: string }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    const cappedEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ since: cursor.toISOString().slice(0, 10), until: cappedEnd.toISOString().slice(0, 10) });
    cursor = new Date(cappedEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
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
  /** ISO 4217 the account reports spend in - never assume USD */
  currency: string | null;
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
    fields: "id,name,account_id,account_status,currency",
    limit: "200",
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name || r.account_id,
    accountStatus: r.account_status,
    currency: r.currency || null,
  }));
}

/** Currency for one ad account, used to stamp a connection at sync time. */
export async function fetchAdAccountCurrency(adAccountId: string): Promise<string | null> {
  const json = await graphGet(`/${adAccountId}`, { fields: "currency" });
  return json?.currency || null;
}

/**
 * An Instagram Business Account is reached through the Page it's connected
 * to, and every IG call needs that Page's access token. Connections store
 * only the IG account id, so the parent Page is resolved here by scanning
 * the Pages this System User can see. Cached per IG account for the process
 * lifetime - it's a stable relationship and the scan is a paged call.
 */
const igParentPageCache = new Map<string, string | null>();

export async function findPageForInstagramAccount(igUserId: string): Promise<string | null> {
  const cached = igParentPageCache.get(igUserId);
  if (cached !== undefined) return cached;

  const pages = await discoverPages();
  const parent = pages.find((p) => p.instagramAccount?.id === igUserId)?.id || null;
  igParentPageCache.set(igUserId, parent);
  return parent;
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

/**
 * Facebook Page daily metrics, verified against a live Page on v21.0.
 *
 * Meta retired most of the Page insights catalogue: page_impressions,
 * page_impressions_unique, page_posts_impressions, page_engaged_users,
 * page_fans, page_fan_adds and page_fan_removes all now return
 * "(#100) The value must be a valid insights metric". Because Meta rejects
 * the ENTIRE request when any single metric in it is invalid, keeping a
 * retired name here doesn't degrade one field - it fails the whole Page
 * sync. Only add a metric to this map after confirming it against a real
 * Page.
 *
 * Consequence worth stating plainly: Facebook Page reach and impressions no
 * longer exist in the API at all, so accountsReached / postImpressions /
 * postReach stay zero for facebook_page. That is a platform limitation, not
 * a gap in ingestion.
 */
const FB_METRIC_MAP: Record<string, keyof OrganicDailyRow> = {
  page_daily_follows_unique: "followersGained",
  page_daily_unfollows_unique: "followersLost",
  page_views_total: "profileVisits",
  page_post_engagements: "postEngagements",
};

/**
 * Instagram splits its account metrics across two incompatible call shapes,
 * verified against a live account on v21:
 *
 *   metric_type=time_series  - only `reach` returns a per-day series.
 *   metric_type=total_value  - profile_views, accounts_engaged, likes,
 *                              shares, saves, views and friends. These reject
 *                              time_series outright ("metric is incompatible
 *                              with metric_type=time_series"), and a
 *                              single-day window returns nothing at all, so
 *                              they genuinely have no daily breakdown - they
 *                              are period aggregates by design.
 *
 * `impressions` no longer exists for IG accounts; `views` replaced it.
 */
/** Instagram rejects any insights window longer than 30 days. */
const IG_MAX_WINDOW_DAYS = 28;

const IG_TIME_SERIES_MAP: Record<string, keyof OrganicDailyRow> = {
  reach: "accountsReached",
};

const IG_TOTAL_VALUE_MAP: Record<string, keyof OrganicDailyRow> = {
  profile_views: "profileVisits",
  accounts_engaged: "accountsEngaged",
  total_interactions: "postEngagements",
  views: "postImpressions",
};

async function fetchInsightsByDate(
  path: string,
  metrics: Record<string, keyof OrganicDailyRow>,
  since: string,
  until: string,
  extraParams: Record<string, string> = {},
  token?: string,
  maxDays = 80
): Promise<Map<string, OrganicDailyRow>> {
  const byDate = new Map<string, OrganicDailyRow>();

  // Chunked because Meta caps how long an insights window may be; a
  // 12-month backfill in one request is rejected outright.
  for (const chunk of splitDateRange(since, until, maxDays)) {
    const json = await graphGet(
      path,
      {
        metric: Object.keys(metrics).join(","),
        period: "day",
        since: chunk.since,
        until: chunk.until,
        ...extraParams,
      },
      token
    );
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
  }
  return byDate;
}

export async function fetchFacebookPageInsights(pageId: string, since: string, until: string): Promise<OrganicDailyRow[]> {
  const pageToken = await getPageAccessToken(pageId);
  const byDate = await fetchInsightsByDate(`/${pageId}/insights`, FB_METRIC_MAP, since, until, {}, pageToken);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchFacebookPageFollowerCount(pageId: string): Promise<number> {
  const json = await graphGet(`/${pageId}`, { fields: "fan_count" }, await getPageAccessToken(pageId));
  return json.fan_count || 0;
}

/**
 * Instagram account insights. Needs a Page access token (an IG account is
 * reached through its connected Page) plus instagram_basic and
 * instagram_manage_insights on the app itself.
 *
 * Issued as two calls because the two metric groups above take different
 * shapes. The total_value metrics carry no daily breakdown from Meta, so
 * they're attributed to the final day of the window rather than spread
 * evenly across it - inventing a daily split Meta didn't report would make
 * per-day charts look precise while being fabricated. Period totals (what
 * KPI cards and tables show) stay exactly right either way.
 */
export async function fetchInstagramInsights(
  igUserId: string,
  since: string,
  until: string,
  pageId?: string
): Promise<OrganicDailyRow[]> {
  const token = pageId ? await getPageAccessToken(pageId) : undefined;

  const byDate = await fetchInsightsByDate(
    `/${igUserId}/insights`,
    IG_TIME_SERIES_MAP,
    since,
    until,
    { metric_type: "time_series" },
    token,
    IG_MAX_WINDOW_DAYS
  );

  const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Each chunk's totals are attributed to that chunk's own final day, not
  // accumulated onto the end of the whole range. Accumulating made a
  // 15-month backfill stamp every view and interaction it had ever recorded
  // onto one date - which then landed inside any "last 30 days" window and
  // overstated it by more than an order of magnitude. Per-chunk keeps the
  // error bounded to a single ~28-day window, and any range longer than a
  // chunk still totals correctly.
  for (const chunk of splitDateRange(since, until, IG_MAX_WINDOW_DAYS)) {
    try {
      const json = await graphGet(
        `/${igUserId}/insights`,
        {
          metric: Object.keys(IG_TOTAL_VALUE_MAP).join(","),
          period: "day",
          metric_type: "total_value",
          since: chunk.since,
          until: chunk.until,
        },
        token
      );

      // Land on the last row that exists within this chunk; the reach series
      // may not cover every calendar day the chunk spans.
      const target = [...rows].reverse().find((r) => r.date >= chunk.since && r.date <= chunk.until);
      if (!target) continue;

      for (const entry of json.data || []) {
        const field = IG_TOTAL_VALUE_MAP[entry.name];
        const value = entry.total_value?.value;
        if (field && typeof value === "number") {
          (target[field] as number) = ((target[field] as number) || 0) + value;
        }
      }
    } catch {
      // Non-fatal: the daily reach series above is still worth storing.
    }
  }

  return rows;
}

export async function fetchInstagramFollowerCount(igUserId: string, pageId?: string): Promise<number> {
  const token = pageId ? await getPageAccessToken(pageId) : undefined;
  const json = await graphGet(`/${igUserId}`, { fields: "followers_count" }, token);
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
  const pageToken = await getPageAccessToken(pageId);
  const posts = await graphGetAllPages(
    `/${pageId}/posts`,
    {
      fields: "id,message,created_time,permalink_url,full_picture",
      since,
      until,
      limit: "50",
    },
    50,
    pageToken
  );

  const results: ContentItemRow[] = [];
  for (const post of posts) {
    // Post-level insights, verified against a live Page on v21. Meta retired
    // post_impressions, post_impressions_unique and post_engaged_users - they
    // now return "(#100) The value must be a valid insights metric", and
    // because Meta rejects the whole request when any metric is invalid, the
    // old list returned nothing for every post. These four are what survive.
    let insights: Record<string, any> = {};
    let insightsError: string | null = null;
    try {
      const insightsJson = await graphGet(
        `/${post.id}/insights`,
        { metric: "post_reactions_by_type_total,post_clicks,post_video_views,blue_reels_play_count" },
        pageToken
      );
      insights = Object.fromEntries((insightsJson.data || []).map((m: any) => [m.name, m.values?.[0]?.value ?? 0]));
    } catch (err) {
      insightsError = err instanceof Error ? err.message : String(err);
    }

    // Engagement counts need Advanced Access on pages_read_engagement, which
    // in turn needs Business Verification. Until that clears Meta answers
    // "(#10) This endpoint requires the 'pages_read_engagement' permission"
    // even though the Page token demonstrably carries that scope. The reason
    // is recorded on the row rather than swallowed, so a zero here is
    // distinguishable from a genuine zero.
    let engagement: Record<string, any> = {};
    let engagementError: string | null = null;
    try {
      engagement = await graphGet(
        `/${post.id}`,
        { fields: "likes.summary(true).limit(0),comments.summary(true).limit(0),shares" },
        pageToken
      );
    } catch (err) {
      engagementError = err instanceof Error ? err.message : String(err);
    }

    // post_reactions_by_type_total is a map ({like: 3, love: 1, ...}); the
    // total is the sum, not a single field.
    const reactions = insights.post_reactions_by_type_total;
    const likes =
      reactions && typeof reactions === "object"
        ? Object.values(reactions).reduce((sum: number, v) => sum + (typeof v === "number" ? v : 0), 0)
        : engagement.likes?.summary?.total_count || 0;

    results.push({
      externalContentId: post.id,
      contentType: "post",
      caption: post.message || null,
      mediaUrl: post.full_picture || null,
      permalink: post.permalink_url || null,
      publishedAt: post.created_time,
      // Facebook post reach/impressions were retired alongside the page-level
      // equivalents; there is no replacement metric to read them from.
      reach: 0,
      impressions: 0,
      likes,
      comments: engagement.comments?.summary?.total_count || 0,
      shares: engagement.shares?.count || 0,
      saves: 0,
      videoViews: insights.post_video_views || insights.blue_reels_play_count || 0,
      avgWatchTime: 0,
      rawInsights: {
        ...insights,
        ...engagement,
        ...(insightsError ? { _insightsError: insightsError } : {}),
        ...(engagementError ? { _engagementError: engagementError } : {}),
      },
    });
  }
  return results;
}

// IG Stories expire after 24h and aren't retrievable retroactively via
// /media, so this covers feed posts, carousels, reels, and videos only.
export async function fetchInstagramMedia(
  igUserId: string,
  since: string,
  until: string,
  pageId?: string
): Promise<ContentItemRow[]> {
  const igToken = pageId ? await getPageAccessToken(pageId) : undefined;
  const media = await graphGetAllPages(
    `/${igUserId}/media`,
    {
      fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
      limit: "50",
    },
    50,
    igToken
  );

  const sinceMs = new Date(`${since}T00:00:00Z`).getTime();
  const untilMs = new Date(`${until}T23:59:59Z`).getTime();
  const inRange = media.filter((m: any) => {
    const t = new Date(m.timestamp).getTime();
    return t >= sinceMs && t <= untilMs;
  });

  const results: ContentItemRow[] = [];
  for (const m of inRange) {
    // Verified against live media on v21. `video_views` is retired - `views`
    // replaced it and applies to every media type, not just video, so there's
    // no longer a reason to branch on the type. `shares` and
    // `total_interactions` are new here and were previously not collected at
    // all despite being available.
    let insights: Record<string, any> = {};
    let insightsError: string | null = null;
    try {
      const insightsJson = await graphGet(
        `/${m.id}/insights`,
        { metric: "reach,saved,shares,total_interactions,views" },
        igToken
      );
      insights = Object.fromEntries((insightsJson.data || []).map((x: any) => [x.name, x.values?.[0]?.value ?? 0]));
    } catch (err) {
      insightsError = err instanceof Error ? err.message : String(err);
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
      // `views` is Instagram's replacement for impressions at media level.
      impressions: insights.views || 0,
      likes: m.like_count || 0,
      comments: m.comments_count || 0,
      shares: insights.shares || 0,
      saves: insights.saved || 0,
      videoViews: insights.views || 0,
      avgWatchTime: 0,
      rawInsights: { ...insights, ...(insightsError ? { _insightsError: insightsError } : {}) },
    });
  }
  return results;
}
