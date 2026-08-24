export type Platform =
  | "meta"
  | "google_ads"
  | "tiktok_ads"
  | "facebook_page"
  | "instagram"
  | "cross_platform";

export type MetricCategory =
  | "Media Delivery"
  | "Traffic"
  | "Video"
  | "Engagement"
  | "Social Audience"
  | "Content"
  | "Conversion"
  | "Value";

export type DataType =
  | "integer"
  | "currency"
  | "percentage"
  | "duration_seconds"
  | "ratio"
  | "text";

export interface MetricDefinition {
  id: string;
  displayName: string;
  platform: Platform;
  category: MetricCategory;
  dataType: DataType;
  isDerived: boolean;
  sourceField?: string;
  formula?: string; // e.g. "clicks / NULLIF(impressions, 0) * 100"
  description: string;
  supportedDimensions: string[];
  caveats?: string;
}

export type WidgetType =
  | "kpi_card"
  | "number"
  | "percentage"
  | "comparison"
  | "line_chart"
  | "area_chart"
  | "bar_chart"
  | "stacked_bar"
  | "donut_chart"
  | "table"
  | "ranking"
  | "heatmap"
  | "timeline"
  | "text"
  | "image_logo"
  | "campaign_table"
  | "content_table"
  | "metric_comparison"
  | "ai_insight";

export interface GridPos {
  x: number; // 0 to 11
  y: number;
  w: number; // 1 to 12
  h: number; // 1 to 12
}

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_14_days"
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "previous_month"
  | "this_quarter"
  | "previous_quarter"
  | "year_to_date"
  | "previous_year"
  | "custom";

export type ComparisonPreset = "previous_period" | "previous_year" | "none";

export interface WidgetDataFilter {
  field: string;
  operator: "equals" | "contains" | "in" | "greater_than";
  value: string;
}

export interface WidgetDataConfig {
  platform: Platform | "all";
  metricIds: string[];
  breakdown?: "date" | "platform" | "campaign" | "adset" | "ad" | "content_type" | "device" | "country";
  dateRangeMode?: "inherit_dashboard" | "override";
  customDateRange?: DateRangePreset;
  comparisonMode?: ComparisonPreset;
  filters?: WidgetDataFilter[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}

export interface WidgetDisplayConfig {
  showTitle?: boolean;
  showLegend?: boolean;
  colorPalette?: string[];
  numberFormat?: "compact" | "standard" | "currency" | "percent";
  noteText?: string;
}

export interface WidgetConfig {
  id: string;
  pageId: string;
  /** groups this widget under a titled section within the page; undefined = ungrouped */
  sectionId?: string;
  widgetType: WidgetType;
  title: string;
  grid: GridPos;
  dataConfig: WidgetDataConfig;
  displayConfig?: WidgetDisplayConfig;
}

export interface DashboardSection {
  id: string;
  title: string;
  sortOrder: number;
}

export interface DashboardPage {
  id: string;
  dashboardId: string;
  title: string;
  sortOrder: number;
  /** optional named groupings of widgets within the page, agency-defined */
  sections?: DashboardSection[];
  widgets: WidgetConfig[];
}

export interface Dashboard {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  isDefault?: boolean;
  globalDateRange: DateRangePreset;
  globalFilters?: Record<string, string>;
  pages: DashboardPage[];
  createdAt: string;
  updatedAt: string;
  /**
   * Hidden agency markup applied to spend/cost metrics for the client-facing
   * view only. Agency admins always see true platform spend; markup is
   * applied on top only when viewing/exporting as the client would see it.
   */
  markupPercentage?: number;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  category: "Executive" | "Brand Awareness" | "Lead Gen" | "Social Media" | "Paid Media" | "Full Overview";
  description: string;
  pages: Omit<DashboardPage, "id" | "dashboardId">[];
}

export interface Client {
  id: string;
  agencyId: string;
  name: string;
  slug: string;
  objectiveType: "brand_awareness" | "lead_gen" | "ecommerce" | "social_content" | "mixed";
  logoUrl?: string;
  connectedPlatforms: {
    platform: Platform;
    accountName: string;
    externalId: string;
    lastSyncedAt: string;
    status: "active" | "error" | "paused";
  }[];
}

export interface ClientUser {
  id: string;
  userId: string;
  clientId: string;
  email: string;
  role: "agency_admin" | "client_viewer";
}

// One row per individual post/creative, not a daily aggregate - backs the
// content_table widget (post-level reporting with a thumbnail). thumbnailUrl
// is undefined until a real platform connection is live (Meta Graph API
// returns this as `full_picture` on a Page post, or a creative's
// `thumbnail_url` on an ad) - the widget renders a placeholder until then,
// so nothing about the widget changes when real ingestion lands.
export interface ContentPost {
  id: string;
  clientId: string;
  platform: Platform;
  accountName: string;
  postedAt: string; // ISO datetime
  contentType: "image" | "video" | "reel" | "story" | "carousel";
  caption: string;
  permalinkUrl?: string;
  thumbnailUrl?: string;
  metrics: {
    reach?: number;
    impressions?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    videoViews?: number;
  };
}

export interface RawDailyRecord {
  id: string;
  clientId: string;
  platform: Platform;
  date: string;
  accountName: string;
  campaignId?: string;
  campaignName?: string;
  campaignObjective?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;

  // Media Delivery
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;

  // Traffic
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  outboundClicks?: number;
  uniqueClicks?: number;

  // Video
  videoViews: number;
  video3sViews: number;
  thruplays: number;
  videoCompletions: number;
  videoAvgWatchTime: number;
  videoViews2s?: number; // TikTok
  videoViews6s?: number; // TikTok

  // Engagement
  postEngagements: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  negativeFeedback?: number; // Meta: hides/reports/unlikes

  // Social Audience (Organic)
  totalFollowers?: number;
  followersGained?: number;
  followersLost?: number;
  profileVisits?: number;
  accountsReached?: number;
  accountsEngaged?: number;

  // Community management (organic)
  commentsResponded?: number;
  avgResponseTimeMinutes?: number; // averaged, not summed, when aggregating
  postsPublished?: number;

  // Content (Organic)
  reelViews?: number;
  storyViews?: number;
  storyExits?: number;

  // Google Ads diagnostics (averaged, not summed, when aggregating)
  searchImpressionShare?: number; // percentage 0-100
  qualityScore?: number; // 1-10

  // Conversion & Value
  conversions: number;
  leads: number;
  purchases: number;
  conversionValue: number;
  viewThroughConversions?: number;
}
