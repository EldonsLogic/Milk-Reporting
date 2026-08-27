import { supabase } from "./supabase-client";
import {
  Client,
  Dashboard,
  DashboardPage,
  DashboardSection,
  WidgetConfig,
  RawDailyRecord,
  ContentPost,
  MetricDefinition,
  Platform,
} from "@/types";

// ---------------------------------------------------------------------------
// Mapping: DB rows (snake_case) <-> app types (camelCase). Keeping this in
// one place means query-engine.ts, WidgetRenderer, and DashboardBuilder
// never need to know whether data came from mock generators or Supabase -
// they only ever see RawDailyRecord/ContentPost/Dashboard shapes.
// ---------------------------------------------------------------------------

function mapClientRow(row: Record<string, any>): Client {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    slug: row.slug,
    objectiveType: row.objective_type,
    logoUrl: row.logo_url || undefined,
    connectedPlatforms: (row.platform_connections || []).map((c: Record<string, any>) => ({
      platform: c.platform,
      accountName: c.account_name,
      externalId: c.external_account_id,
      lastSyncedAt: c.last_synced_at,
      status: c.sync_status,
    })),
  };
}

export async function fetchClients(agencyId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*, platform_connections(*)")
    .eq("agency_id", agencyId)
    .order("created_at");
  if (error) throw error;
  return (data || []).map(mapClientRow);
}

export async function createClient(input: {
  agencyId: string;
  name: string;
  objectiveType: string;
  logoUrl?: string;
}): Promise<Client> {
  const id = `client-${Date.now()}`;
  const slug = input.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const { data, error } = await supabase
    .from("clients")
    .insert({
      id,
      agency_id: input.agencyId,
      name: input.name,
      slug,
      objective_type: input.objectiveType,
      logo_url: input.logoUrl || null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapClientRow({ ...data, platform_connections: [] });
}

export async function updateClient(
  clientId: string,
  patch: Partial<{ name: string; objectiveType: string; logoUrl: string }>
): Promise<void> {
  const update: Record<string, any> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.objectiveType !== undefined) update.objective_type = patch.objectiveType;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;
  const { error } = await supabase.from("clients").update(update).eq("id", clientId);
  if (error) throw error;
}

export async function deleteClient(clientId: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Platform connections (data sources) + their dimensional scope filters
// ---------------------------------------------------------------------------

export interface ScopeFilters {
  pageIds?: string[];
  adAccountIds?: string[];
  campaignIds?: string[];
  adSetIds?: string[];
  adIds?: string[];
  profileIds?: string[];
  postIds?: string[];
}

export interface ConnectionRow {
  id: string;
  clientId: string;
  platform: Platform;
  connectionType: "paid_ads" | "organic_social";
  accountName: string;
  externalAccountId: string;
  scopeFilters: ScopeFilters;
  syncStatus: "active" | "paused" | "error";
  lastSyncedAt: string | null;
}

function mapConnectionRow(row: Record<string, any>): ConnectionRow {
  return {
    id: row.id,
    clientId: row.client_id,
    platform: row.platform,
    connectionType: row.connection_type,
    accountName: row.account_name,
    externalAccountId: row.external_account_id,
    scopeFilters: row.scope_filters || {},
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at,
  };
}

export async function fetchConnections(clientId: string): Promise<ConnectionRow[]> {
  const { data, error } = await supabase.from("platform_connections").select("*").eq("client_id", clientId);
  if (error) throw error;
  return (data || []).map(mapConnectionRow);
}

export async function createConnection(input: {
  clientId: string;
  platform: Platform;
  connectionType: "paid_ads" | "organic_social";
  accountName: string;
  externalAccountId: string;
  scopeFilters?: ScopeFilters;
}): Promise<ConnectionRow> {
  const id = `conn-${Date.now()}`;
  const { data, error } = await supabase
    .from("platform_connections")
    .insert({
      id,
      client_id: input.clientId,
      platform: input.platform,
      connection_type: input.connectionType,
      account_name: input.accountName,
      external_account_id: input.externalAccountId,
      scope_filters: input.scopeFilters || {},
    })
    .select()
    .single();
  if (error) throw error;
  return mapConnectionRow(data);
}

export async function updateConnectionScope(connectionId: string, scopeFilters: ScopeFilters): Promise<void> {
  const { error } = await supabase
    .from("platform_connections")
    .update({ scope_filters: scopeFilters })
    .eq("id", connectionId);
  if (error) throw error;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.from("platform_connections").delete().eq("id", connectionId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Dashboards (+ pages + sections + widgets)
// ---------------------------------------------------------------------------

function mapWidgetRow(row: Record<string, any>): WidgetConfig {
  return {
    id: row.id,
    pageId: row.page_id,
    sectionId: row.section_id || undefined,
    widgetType: row.widget_type,
    title: row.title,
    grid: { x: row.grid_x, y: row.grid_y, w: row.grid_w, h: row.grid_h },
    dataConfig: row.data_config,
    displayConfig: row.display_config || {},
  };
}

function mapPageRow(row: Record<string, any>): DashboardPage {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    title: row.title,
    sortOrder: row.sort_order,
    sections: (row.sections || []) as DashboardSection[],
    widgets: (row.dashboard_widgets || []).map(mapWidgetRow),
  };
}

function mapDashboardRow(row: Record<string, any>): Dashboard {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description || undefined,
    isDefault: row.is_default,
    globalDateRange: row.global_date_range,
    globalFilters: row.global_filters || {},
    markupPercentage: row.markup_percentage != null ? Number(row.markup_percentage) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pages: (row.dashboard_pages || [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map(mapPageRow),
  };
}

export async function fetchDashboardsForClient(clientId: string): Promise<Dashboard[]> {
  const { data, error } = await supabase
    .from("dashboards")
    .select("*, dashboard_pages(*, dashboard_widgets(*))")
    .eq("client_id", clientId);
  if (error) throw error;
  return (data || []).map(mapDashboardRow);
}

export async function createDashboard(clientId: string, title: string): Promise<Dashboard> {
  const dashboardId = `dash-${Date.now()}`;
  // A client's very first dashboard becomes their default automatically -
  // otherwise a single-dashboard client would have nothing to show on
  // their own portal until an admin remembers to set one explicitly.
  const { count: existingCount } = await supabase
    .from("dashboards")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  const { error: dashError } = await supabase.from("dashboards").insert({
    id: dashboardId,
    client_id: clientId,
    title,
    global_date_range: "last_30_days",
    is_default: (existingCount || 0) === 0,
  });
  if (dashError) throw dashError;

  const pageId = `p-${Date.now()}`;
  const { error: pageError } = await supabase.from("dashboard_pages").insert({
    id: pageId,
    dashboard_id: dashboardId,
    title: "Overview",
    sort_order: 0,
    sections: [],
  });
  if (pageError) throw pageError;

  const dashboards = await fetchDashboardsForClient(clientId);
  const created = dashboards.find((d) => d.id === dashboardId);
  if (!created) throw new Error("Dashboard created but could not be re-fetched");
  return created;
}

export async function deleteDashboard(dashboardId: string): Promise<void> {
  const { error } = await supabase.from("dashboards").delete().eq("id", dashboardId);
  if (error) throw error;
}

/**
 * Marks one dashboard as the client's default (what ClientPortalShell shows
 * them) and unmarks any other default for the same client, so exactly one
 * dashboard is ever the client-visible one at a time.
 */
export async function setDefaultDashboard(clientId: string, dashboardId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from("dashboards")
    .update({ is_default: false })
    .eq("client_id", clientId);
  if (clearError) throw clearError;

  const { error: setError } = await supabase.from("dashboards").update({ is_default: true }).eq("id", dashboardId);
  if (setError) throw setError;
}

function sanitizeGridValue(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Persists a full dashboard (pages + sections + widgets) in one atomic
 * transaction via the save_dashboard_atomic Postgres function (see
 * SUPABASE_SETUP.sql) - replaces the old delete-then-insert sequence of
 * separate REST calls, which left a real window for a second in-flight
 * save (e.g. a double-clicked Save button) or a network error mid-sequence
 * to leave a dashboard with its old pages deleted and only some of the
 * new ones recreated.
 */
export async function saveDashboard(dashboard: Dashboard): Promise<void> {
  const { error } = await supabase.rpc("save_dashboard_atomic", {
    p_dashboard_id: dashboard.id,
    p_title: dashboard.title,
    p_description: dashboard.description || null,
    p_global_date_range: dashboard.globalDateRange,
    p_global_filters: dashboard.globalFilters || {},
    p_markup_percentage: dashboard.markupPercentage ?? 0,
    p_pages: dashboard.pages.map((page) => ({
      id: page.id,
      title: page.title,
      sortOrder: page.sortOrder,
      sections: page.sections || [],
      widgets: page.widgets.map((w) => ({
        id: w.id,
        sectionId: w.sectionId || null,
        widgetType: w.widgetType,
        title: w.title,
        // A freshly-added widget's grid.y is Infinity (react-grid-layout's
        // sentinel for "auto-place at the bottom") until the grid's own
        // layout computation replaces it with a real number. Saving before
        // that happens - e.g. clicking Save right after Add Widget -
        // JSON.stringifies Infinity to null, which the SQL side would
        // otherwise coerce into a NOT NULL violation. Sanitize here
        // instead of trusting the timing of that computation.
        grid: {
          x: sanitizeGridValue(w.grid.x, 0),
          y: sanitizeGridValue(w.grid.y, 0),
          w: sanitizeGridValue(w.grid.w, 4),
          h: sanitizeGridValue(w.grid.h, 3),
        },
        dataConfig: w.dataConfig,
        displayConfig: w.displayConfig || {},
      })),
    })),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Metrics + content (read-mapped into the exact shapes query-engine.ts and
// WidgetRenderer already consume - RawDailyRecord and ContentPost)
// ---------------------------------------------------------------------------

function mapPaidMetricRow(row: Record<string, any>): RawDailyRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    platform: row.platform,
    date: row.date,
    accountName: row.account_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    campaignObjective: row.campaign_objective,
    adsetId: row.adset_id,
    adsetName: row.adset_name,
    adId: row.ad_id,
    adName: row.ad_name,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    reach: Number(row.reach) || 0,
    frequency: Number(row.frequency) || 0,
    clicks: Number(row.clicks) || 0,
    linkClicks: Number(row.link_clicks) || 0,
    landingPageViews: Number(row.landing_page_views) || 0,
    outboundClicks: Number(row.outbound_clicks) || 0,
    uniqueClicks: Number(row.unique_clicks) || 0,
    videoViews: Number(row.video_views) || 0,
    video3sViews: Number(row.video_3s_views) || 0,
    thruplays: Number(row.thruplays) || 0,
    videoCompletions: Number(row.video_completions) || 0,
    videoAvgWatchTime: Number(row.video_avg_watch_time) || 0,
    videoViews2s: Number(row.video_views_2s) || 0,
    videoViews6s: Number(row.video_views_6s) || 0,
    postEngagements: Number(row.post_engagements) || 0,
    likes: Number(row.likes) || 0,
    comments: Number(row.comments) || 0,
    shares: Number(row.shares) || 0,
    saves: Number(row.saves) || 0,
    negativeFeedback: Number(row.negative_feedback) || 0,
    conversions: Number(row.conversions) || 0,
    leads: Number(row.leads) || 0,
    purchases: Number(row.purchases) || 0,
    conversionValue: Number(row.conversion_value) || 0,
    viewThroughConversions: Number(row.view_through_conversions) || 0,
    searchImpressionShare: row.search_impression_share != null ? Number(row.search_impression_share) : undefined,
    qualityScore: row.quality_score != null ? Number(row.quality_score) : undefined,
  };
}

function mapOrganicMetricRow(row: Record<string, any>): RawDailyRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    platform: row.platform,
    date: row.date,
    accountName: row.platform,
    spend: 0,
    impressions: Number(row.post_impressions) || 0,
    reach: Number(row.post_reach) || 0,
    frequency: 0,
    clicks: 0,
    linkClicks: 0,
    landingPageViews: 0,
    videoViews: 0,
    video3sViews: 0,
    thruplays: 0,
    videoCompletions: 0,
    videoAvgWatchTime: 0,
    postEngagements: Number(row.post_engagements) || 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    totalFollowers: Number(row.total_followers) || 0,
    followersGained: Number(row.followers_gained) || 0,
    followersLost: Number(row.followers_lost) || 0,
    profileVisits: Number(row.profile_visits) || 0,
    accountsReached: Number(row.accounts_reached) || 0,
    accountsEngaged: Number(row.accounts_engaged) || 0,
    reelViews: Number(row.reel_views) || 0,
    storyViews: Number(row.story_views) || 0,
    storyExits: Number(row.story_exits) || 0,
    commentsResponded: Number(row.comments_responded) || 0,
    avgResponseTimeMinutes: row.avg_response_time_minutes != null ? Number(row.avg_response_time_minutes) : undefined,
    postsPublished: Number(row.posts_published) || 0,
    conversions: 0,
    leads: 0,
    purchases: 0,
    conversionValue: 0,
  };
}

export async function fetchRecords(clientId: string): Promise<RawDailyRecord[]> {
  const [paidRes, organicRes] = await Promise.all([
    supabase.from("paid_daily_metrics").select("*").eq("client_id", clientId),
    supabase.from("organic_daily_metrics").select("*").eq("client_id", clientId),
  ]);
  if (paidRes.error) throw paidRes.error;
  if (organicRes.error) throw organicRes.error;
  return [...(paidRes.data || []).map(mapPaidMetricRow), ...(organicRes.data || []).map(mapOrganicMetricRow)];
}

function mapContentItemRow(row: Record<string, any>): ContentPost {
  return {
    id: row.id,
    clientId: row.client_id,
    platform: row.platform,
    accountName: row.platform,
    postedAt: row.published_at,
    contentType: row.content_type,
    caption: row.caption || "",
    permalinkUrl: row.permalink || undefined,
    thumbnailUrl: row.media_url || undefined,
    metrics: {
      reach: Number(row.reach) || 0,
      impressions: Number(row.impressions) || 0,
      likes: Number(row.likes) || 0,
      comments: Number(row.comments) || 0,
      shares: Number(row.shares) || 0,
      saves: Number(row.saves) || 0,
      videoViews: Number(row.video_views) || 0,
    },
  };
}

export async function fetchContentPosts(clientId: string): Promise<ContentPost[]> {
  const { data, error } = await supabase
    .from("organic_content_items")
    .select("*")
    .eq("client_id", clientId)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapContentItemRow);
}

// ---------------------------------------------------------------------------
// Custom metrics (agency-wide, mirrors src/lib/custom-metrics.ts's shape
// but backed by Supabase instead of localStorage once an agency is real)
// ---------------------------------------------------------------------------

function mapCustomMetricRow(row: Record<string, any>): MetricDefinition {
  return {
    id: row.id,
    displayName: row.display_name,
    platform: "cross_platform",
    category: row.category,
    dataType: row.data_type,
    isDerived: true,
    formula: row.formula,
    description: row.description || "Agency-defined custom metric.",
    supportedDimensions: ["date", "platform", "campaign"],
  };
}

export async function fetchCustomMetrics(agencyId: string): Promise<MetricDefinition[]> {
  const { data, error } = await supabase.from("custom_metrics").select("*").eq("agency_id", agencyId);
  if (error) throw error;
  return (data || []).map(mapCustomMetricRow);
}

/**
 * For the client portal, which doesn't know its own agencyId without an
 * extra query - custom_metrics_viewer_read RLS already scopes this to
 * whatever the signed-in client viewer is allowed to see, so no explicit
 * agency filter is needed here.
 */
export async function fetchVisibleCustomMetrics(): Promise<MetricDefinition[]> {
  const { data, error } = await supabase.from("custom_metrics").select("*");
  if (error) throw error;
  return (data || []).map(mapCustomMetricRow);
}

export async function saveCustomMetricToSupabase(agencyId: string, metric: MetricDefinition, userId?: string) {
  const { error } = await supabase.from("custom_metrics").upsert({
    id: metric.id,
    agency_id: agencyId,
    display_name: metric.displayName,
    category: metric.category,
    data_type: metric.dataType,
    formula: metric.formula,
    description: metric.description,
    created_by: userId || null,
  });
  if (error) throw error;
}

export async function deleteCustomMetricFromSupabase(metricId: string) {
  const { error } = await supabase.from("custom_metrics").delete().eq("id", metricId);
  if (error) throw error;
}
