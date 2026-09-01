/**
 * Rebuilds the Milk client dashboard across every connected network.
 *
 * Run with:  npx tsx --env-file=.env.local scripts/build-milk-dashboard.ts
 *
 * Only metrics confirmed to carry real values are used. Notably absent, on
 * purpose: conversions, ROAS and CPA (these campaigns run awareness /
 * engagement / link-click objectives with no pixel conversions, so those
 * columns are genuinely zero), and Facebook Page reach / impressions
 * (retired from Meta's API entirely). A wall of zeros reads as broken data
 * rather than as "not measured".
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = (globalThis as any).WebSocket || WebSocket;
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CLIENT = "client-1787777023585";
const DASH = "dash-1787778341258";
const S = Date.now();

type W = {
  id: string;
  sectionId?: string;
  widgetType: string;
  title: string;
  grid: { x: number; y: number; w: number; h: number };
  dataConfig: Record<string, any>;
  displayConfig?: Record<string, any>;
};

const inherit = { dateRangeMode: "inherit_dashboard" as const };
let n = 0;
const id = () => `w-${S}-${++n}`;

/** Headline number. `content` sums real posts; `daily` reads account tables. */
const kpi = (
  title: string,
  metric: string,
  x: number,
  section: string,
  opts: { platform?: string; source?: "daily" | "content"; w?: number } = {}
): W => ({
  id: id(),
  sectionId: section,
  widgetType: "kpi_card",
  title,
  grid: { x, y: 0, w: opts.w ?? 2, h: 3 },
  dataConfig: {
    platform: opts.platform ?? "all",
    metricIds: [metric],
    dataSource: opts.source ?? "daily",
    comparisonMode: "previous_period",
    ...inherit,
  },
});

// ---------------------------------------------------------------------------
// PAGE 1 - Overview: every network side by side
// ---------------------------------------------------------------------------
const secTotals = `sec-${S}-totals`;
const secMix = `sec-${S}-mix`;

const overview: W[] = [
  // Organic headline, summed from the posts themselves.
  kpi("Total Reach", "reach", 0, secTotals, { source: "content" }),
  kpi("Total Impressions", "impressions", 2, secTotals, { source: "content" }),
  kpi("Total Engagements", "post_engagements", 4, secTotals, { source: "content" }),
  kpi("Engagement Rate", "engagement_rate", 6, secTotals, { source: "content" }),
  kpi("Posts Published", "posts_published", 8, secTotals, { source: "content" }),
  kpi("Ad Spend", "spend", 10, secTotals),

  {
    id: id(),
    sectionId: secMix,
    widgetType: "area_chart",
    title: "Organic Reach & Impressions by Day",
    grid: { x: 0, y: 0, w: 8, h: 6 },
    dataConfig: {
      platform: "all",
      metricIds: ["reach", "impressions"],
      dataSource: "content",
      comparisonMode: "previous_period",
      ...inherit,
    },
  },
  {
    id: id(),
    sectionId: secMix,
    widgetType: "donut_chart",
    title: "Reach Split by Network",
    grid: { x: 8, y: 0, w: 4, h: 6 },
    dataConfig: { platform: "all", metricIds: ["reach"], dataSource: "content", ...inherit },
  },
  {
    id: id(),
    sectionId: secMix,
    widgetType: "campaign_table",
    title: "Network Comparison",
    grid: { x: 0, y: 6, w: 12, h: 5 },
    dataConfig: {
      platform: "all",
      metricIds: ["reach", "impressions", "post_engagements", "likes", "shares", "saves"],
      dataSource: "content",
      ...inherit,
    },
  },
];

// ---------------------------------------------------------------------------
// PAGE 2 - Instagram
// ---------------------------------------------------------------------------
const secIgTop = `sec-${S}-igtop`;
const secIgPosts = `sec-${S}-igposts`;

const instagram: W[] = [
  kpi("Followers", "total_followers", 0, secIgTop, { platform: "instagram" }),
  kpi("Reach", "reach", 2, secIgTop, { platform: "instagram", source: "content" }),
  kpi("Impressions", "impressions", 4, secIgTop, { platform: "instagram", source: "content" }),
  kpi("Engagements", "post_engagements", 6, secIgTop, { platform: "instagram", source: "content" }),
  kpi("Eng. Rate", "engagement_rate", 8, secIgTop, { platform: "instagram", source: "content" }),
  kpi("Posts", "posts_published", 10, secIgTop, { platform: "instagram", source: "content" }),

  {
    id: id(),
    sectionId: secIgPosts,
    widgetType: "bar_chart",
    title: "Reach & Impressions per Post",
    grid: { x: 0, y: 0, w: 7, h: 6 },
    dataConfig: {
      platform: "instagram",
      metricIds: ["reach", "impressions"],
      dataSource: "content",
      ...inherit,
    },
  },
  {
    id: id(),
    sectionId: secIgPosts,
    widgetType: "table",
    title: "Engagement Breakdown",
    grid: { x: 7, y: 0, w: 5, h: 6 },
    dataConfig: {
      platform: "instagram",
      metricIds: ["likes", "comments", "shares", "saves", "video_views"],
      dataSource: "content",
      comparisonMode: "previous_period",
      ...inherit,
    },
  },
  {
    id: id(),
    sectionId: secIgPosts,
    widgetType: "content_table",
    title: "Instagram Posts",
    grid: { x: 0, y: 6, w: 12, h: 10 },
    dataConfig: {
      platform: "instagram",
      metricIds: ["reach"],
      sortBy: "reach",
      sortOrder: "desc",
      ...inherit,
    },
  },
];

// ---------------------------------------------------------------------------
// PAGE 3 - Facebook
// ---------------------------------------------------------------------------
const secFbTop = `sec-${S}-fbtop`;
const secFbPosts = `sec-${S}-fbposts`;

const facebook: W[] = [
  kpi("Page Followers", "total_followers", 0, secFbTop, { platform: "facebook_page", w: 3 }),
  kpi("Page Visits", "profile_visits", 3, secFbTop, { platform: "facebook_page", w: 3 }),
  kpi("New Followers", "followers_gained", 6, secFbTop, { platform: "facebook_page", w: 3 }),
  kpi("Posts Published", "posts_published", 9, secFbTop, { platform: "facebook_page", source: "content", w: 3 }),

  {
    id: id(),
    sectionId: secFbPosts,
    widgetType: "line_chart",
    title: "Page Visits Over Time",
    grid: { x: 0, y: 0, w: 7, h: 6 },
    dataConfig: {
      platform: "facebook_page",
      metricIds: ["profile_visits", "followers_gained"],
      comparisonMode: "previous_period",
      ...inherit,
    },
  },
  {
    id: id(),
    sectionId: secFbPosts,
    widgetType: "text",
    title: "About Facebook Metrics",
    grid: { x: 7, y: 0, w: 5, h: 6 },
    dataConfig: { platform: "facebook_page", metricIds: ["reach"], ...inherit },
    displayConfig: {
      noteText:
        "Meta retired Facebook Page reach and impressions from its API, so those figures are no longer available for any reporting tool.\n\n" +
        "Page visits, follower growth and post content below are pulled live and refresh daily.",
    },
  },
  {
    id: id(),
    sectionId: secFbPosts,
    widgetType: "content_table",
    title: "Facebook Posts",
    grid: { x: 0, y: 6, w: 12, h: 10 },
    dataConfig: {
      platform: "facebook_page",
      metricIds: ["reach"],
      sortBy: "reach",
      sortOrder: "desc",
      ...inherit,
    },
  },
];

// ---------------------------------------------------------------------------
// PAGE 4 - Paid (Meta Ads)
// ---------------------------------------------------------------------------
const secPaidTop = `sec-${S}-paidtop`;
const secPaidBreak = `sec-${S}-paidbreak`;
const secPaidVideo = `sec-${S}-paidvideo`;

const paid: W[] = [
  kpi("Spend", "spend", 0, secPaidTop, { platform: "meta" }),
  kpi("Impressions", "impressions", 2, secPaidTop, { platform: "meta" }),
  kpi("Reach", "reach", 4, secPaidTop, { platform: "meta" }),
  kpi("Clicks", "clicks", 6, secPaidTop, { platform: "meta" }),
  kpi("CTR", "ctr", 8, secPaidTop, { platform: "meta" }),
  kpi("CPM", "cpm", 10, secPaidTop, { platform: "meta" }),

  {
    id: id(),
    sectionId: secPaidBreak,
    widgetType: "area_chart",
    title: "Delivery Over Time",
    grid: { x: 0, y: 0, w: 8, h: 6 },
    dataConfig: {
      platform: "meta",
      metricIds: ["impressions", "reach"],
      comparisonMode: "previous_period",
      ...inherit,
    },
  },
  {
    id: id(),
    sectionId: secPaidBreak,
    widgetType: "table",
    title: "Efficiency",
    grid: { x: 8, y: 0, w: 4, h: 6 },
    dataConfig: {
      platform: "meta",
      metricIds: ["cpm", "cpc", "frequency", "unique_ctr", "link_clicks", "unique_clicks"],
      comparisonMode: "previous_period",
      ...inherit,
    },
  },
  {
    id: id(),
    sectionId: secPaidBreak,
    widgetType: "stacked_bar",
    title: "Daily Spend by Campaign",
    grid: { x: 0, y: 6, w: 12, h: 6 },
    dataConfig: { platform: "meta", metricIds: ["spend"], breakdown: "campaign", ...inherit },
  },
  {
    id: id(),
    sectionId: secPaidBreak,
    widgetType: "campaign_table",
    title: "Campaign Performance",
    grid: { x: 0, y: 12, w: 8, h: 7 },
    dataConfig: {
      platform: "meta",
      metricIds: ["spend", "impressions", "reach", "clicks", "ctr", "cpm"],
      breakdown: "campaign",
      sortBy: "spend",
      sortOrder: "desc",
      ...inherit,
    },
  },
  {
    id: id(),
    sectionId: secPaidBreak,
    widgetType: "donut_chart",
    title: "Spend by Objective",
    grid: { x: 8, y: 12, w: 4, h: 7 },
    dataConfig: { platform: "meta", metricIds: ["spend"], breakdown: "objective", ...inherit },
  },

  kpi("Video Views", "video_views", 0, secPaidVideo, { platform: "meta" }),
  kpi("ThruPlays", "thruplays", 2, secPaidVideo, { platform: "meta" }),
  kpi("Completions", "video_completions", 4, secPaidVideo, { platform: "meta" }),
  kpi("Completion Rate", "video_completion_rate", 6, secPaidVideo, { platform: "meta" }),
  {
    id: id(),
    sectionId: secPaidVideo,
    widgetType: "line_chart",
    title: "Video Views Over Time",
    grid: { x: 8, y: 0, w: 4, h: 3 },
    dataConfig: { platform: "meta", metricIds: ["video_views"], comparisonMode: "none", ...inherit },
  },
  {
    id: id(),
    sectionId: secPaidVideo,
    widgetType: "campaign_table",
    title: "Video Performance by Ad",
    grid: { x: 0, y: 3, w: 12, h: 5 },
    dataConfig: {
      platform: "meta",
      metricIds: ["video_views", "thruplays", "video_completions", "cost_per_thruplay"],
      breakdown: "ad",
      sortBy: "video_views",
      sortOrder: "desc",
      ...inherit,
    },
  },
];

(async () => {
  const pages = [
    {
      id: `p-${S}-1`,
      title: "Overview",
      sortOrder: 0,
      sections: [
        { id: secTotals, title: "Totals This Period", sortOrder: 0 },
        { id: secMix, title: "Channel Mix", sortOrder: 1 },
      ],
      widgets: overview,
    },
    {
      id: `p-${S}-2`,
      title: "Instagram",
      sortOrder: 1,
      sections: [
        { id: secIgTop, title: "Instagram Summary", sortOrder: 0 },
        { id: secIgPosts, title: "Content Performance", sortOrder: 1 },
      ],
      widgets: instagram,
    },
    {
      id: `p-${S}-3`,
      title: "Facebook",
      sortOrder: 2,
      sections: [
        { id: secFbTop, title: "Facebook Summary", sortOrder: 0 },
        { id: secFbPosts, title: "Content Performance", sortOrder: 1 },
      ],
      widgets: facebook,
    },
    {
      id: `p-${S}-4`,
      title: "Paid Media",
      sortOrder: 3,
      sections: [
        { id: secPaidTop, title: "Paid Summary", sortOrder: 0 },
        { id: secPaidBreak, title: "Delivery & Campaigns", sortOrder: 1 },
        { id: secPaidVideo, title: "Video", sortOrder: 2 },
      ],
      widgets: paid,
    },
  ];

  const { error } = await supabase.rpc("save_dashboard_atomic", {
    p_dashboard_id: DASH,
    p_title: "Milk Network — Performance Report",
    p_description: "Organic and paid performance across Instagram, Facebook and Meta Ads.",
    p_global_date_range: "year_to_date",
    p_global_filters: {},
    p_markup_percentage: 0,
    p_custom_date_start: null,
    p_custom_date_end: null,
    p_pages: pages,
  });

  if (error) {
    console.log("FAILED:", error.message);
    return;
  }
  console.log(
    `saved: ${pages.length} pages, ${pages.reduce((a, p) => a + p.widgets.length, 0)} widgets`
  );
})();
