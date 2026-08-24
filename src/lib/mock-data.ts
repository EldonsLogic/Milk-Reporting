import { Client, RawDailyRecord, Dashboard, DashboardTemplate } from "@/types";

export const MOCK_CLIENTS: Client[] = [
  {
    id: "client-aura-cosmetics",
    agencyId: "agency-milk",
    name: "Aura Cosmetics",
    slug: "aura-cosmetics",
    objectiveType: "brand_awareness",
    connectedPlatforms: [
      {
        platform: "meta",
        accountName: "Aura Cosmetics - Meta Ads",
        externalId: "act_10928374",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
      {
        platform: "tiktok_ads",
        accountName: "Aura Cosmetics - TikTok",
        externalId: "tt_8872615",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
      {
        platform: "instagram",
        accountName: "@auracosmetics",
        externalId: "ig_992100",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
    ],
  },
  {
    id: "client-apex-performance",
    agencyId: "agency-milk",
    name: "Apex Performance B2B",
    slug: "apex-performance",
    objectiveType: "lead_gen",
    connectedPlatforms: [
      {
        platform: "google_ads",
        accountName: "Apex - Google Search & Display",
        externalId: "gads_445991",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
      {
        platform: "meta",
        accountName: "Apex - Lead Gen Ads",
        externalId: "act_5541092",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
    ],
  },
  {
    id: "client-velox-athletics",
    agencyId: "agency-milk",
    name: "Velox Athletics",
    slug: "velox-athletics",
    objectiveType: "ecommerce",
    connectedPlatforms: [
      {
        platform: "meta",
        accountName: "Velox - Meta Scaling",
        externalId: "act_9918237",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
      {
        platform: "google_ads",
        accountName: "Velox - Google Shopping",
        externalId: "gads_112009",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
      {
        platform: "tiktok_ads",
        accountName: "Velox - TikTok Shop Ads",
        externalId: "tt_441092",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
    ],
  },
  {
    id: "client-lumina-studio",
    agencyId: "agency-milk",
    name: "Lumina Studio",
    slug: "lumina-studio",
    objectiveType: "social_content",
    connectedPlatforms: [
      {
        platform: "instagram",
        accountName: "@luminastudio",
        externalId: "ig_334190",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
      {
        platform: "facebook_page",
        accountName: "Lumina Studio FB Page",
        externalId: "fb_110928",
        lastSyncedAt: "2026-08-17T06:00:00Z",
        status: "active",
      },
    ],
  },
];

// Helper to generate historical daily records over 90 days
export function generateMockRecords(clientId: string): RawDailyRecord[] {
  const records: RawDailyRecord[] = [];
  const today = new Date();
  const client = MOCK_CLIENTS.find((c) => c.id === clientId) || MOCK_CLIENTS[0];

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];

    // Day of week seasonality factor
    const dayOfWeek = d.getDay();
    const weekendMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 1.25 : 0.95;
    const trendFactor = 1 + (90 - i) * 0.003; // Gradual 27% growth over 90 days

    if (client.objectiveType === "brand_awareness") {
      // Meta Paid Awareness
      records.push({
        id: `rec-aura-meta-${dateStr}`,
        clientId: client.id,
        platform: "meta",
        date: dateStr,
        accountName: "Aura Cosmetics - Meta Ads",
        campaignId: "cmp_aura_awareness",
        campaignName: "Brand Reach & Glow Campaign",
        campaignObjective: "REACH",
        spend: Math.round(350 * trendFactor * weekendMultiplier),
        impressions: Math.round(82000 * trendFactor * weekendMultiplier),
        reach: Math.round(31000 * trendFactor * weekendMultiplier),
        frequency: 2.64,
        clicks: Math.round(1640 * trendFactor),
        linkClicks: Math.round(1120 * trendFactor),
        landingPageViews: Math.round(980 * trendFactor),
        videoViews: Math.round(54000 * trendFactor),
        video3sViews: Math.round(41000 * trendFactor),
        thruplays: Math.round(28000 * trendFactor),
        videoCompletions: Math.round(19500 * trendFactor),
        videoAvgWatchTime: 8.4,
        postEngagements: Math.round(4200 * trendFactor),
        likes: Math.round(2800 * trendFactor),
        comments: Math.round(410 * trendFactor),
        shares: Math.round(620 * trendFactor),
        saves: Math.round(370 * trendFactor),
        outboundClicks: Math.round(890 * trendFactor),
        uniqueClicks: Math.round(1340 * trendFactor),
        negativeFeedback: Math.round(18 * trendFactor),
        conversions: 0,
        leads: 0,
        purchases: 0,
        conversionValue: 0,
      });

      // TikTok Paid Awareness
      records.push({
        id: `rec-aura-tt-${dateStr}`,
        clientId: client.id,
        platform: "tiktok_ads",
        date: dateStr,
        accountName: "Aura Cosmetics - TikTok",
        campaignId: "cmp_aura_tt_viral",
        campaignName: "TikTok Summer Glow Video",
        campaignObjective: "VIDEO_VIEWS",
        spend: Math.round(280 * trendFactor * weekendMultiplier),
        impressions: Math.round(95000 * trendFactor * weekendMultiplier),
        reach: Math.round(42000 * trendFactor * weekendMultiplier),
        frequency: 2.26,
        clicks: Math.round(2100 * trendFactor),
        linkClicks: Math.round(1450 * trendFactor),
        landingPageViews: Math.round(1200 * trendFactor),
        videoViews: Math.round(78000 * trendFactor),
        video3sViews: Math.round(62000 * trendFactor),
        thruplays: Math.round(39000 * trendFactor),
        videoCompletions: Math.round(24000 * trendFactor),
        videoAvgWatchTime: 9.8,
        postEngagements: Math.round(6800 * trendFactor),
        likes: Math.round(5100 * trendFactor),
        comments: Math.round(620 * trendFactor),
        shares: Math.round(910 * trendFactor),
        saves: Math.round(170 * trendFactor),
        videoViews2s: Math.round(88000 * trendFactor),
        videoViews6s: Math.round(51000 * trendFactor),
        uniqueClicks: Math.round(1780 * trendFactor),
        outboundClicks: Math.round(1450 * trendFactor),
        conversions: 0,
        leads: 0,
        purchases: 0,
        conversionValue: 0,
      });
    } else if (client.objectiveType === "lead_gen") {
      // B2B Lead Gen Google & Meta
      records.push({
        id: `rec-apex-gads-${dateStr}`,
        clientId: client.id,
        platform: "google_ads",
        date: dateStr,
        accountName: "Apex - Google Search",
        campaignId: "cmp_apex_search",
        campaignName: "High Intent B2B Search",
        spend: Math.round(420 * trendFactor),
        impressions: Math.round(14200 * trendFactor),
        reach: Math.round(9800 * trendFactor),
        frequency: 1.45,
        clicks: Math.round(680 * trendFactor),
        linkClicks: Math.round(680 * trendFactor),
        landingPageViews: Math.round(620 * trendFactor),
        videoViews: 0,
        video3sViews: 0,
        thruplays: 0,
        videoCompletions: 0,
        videoAvgWatchTime: 0,
        postEngagements: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        searchImpressionShare: Math.min(92, 58 + (90 - i) * 0.2),
        qualityScore: Math.min(9, 6 + (90 - i) * 0.02),
        viewThroughConversions: Math.round(4 * trendFactor),
        conversions: Math.round(16 * trendFactor),
        leads: Math.round(16 * trendFactor),
        purchases: 0,
        conversionValue: Math.round(16 * 450 * trendFactor),
      });
    } else if (client.objectiveType === "social_content") {
      // Pure Organic Instagram & FB
      records.push({
        id: `rec-lumina-ig-${dateStr}`,
        clientId: client.id,
        platform: "instagram",
        date: dateStr,
        accountName: "@luminastudio",
        spend: 0,
        impressions: Math.round(28400 * trendFactor * weekendMultiplier),
        reach: Math.round(18900 * trendFactor * weekendMultiplier),
        frequency: 1.5,
        clicks: Math.round(420 * trendFactor),
        linkClicks: Math.round(310 * trendFactor),
        landingPageViews: 0,
        videoViews: Math.round(14200 * trendFactor),
        video3sViews: Math.round(11000 * trendFactor),
        thruplays: 0,
        videoCompletions: Math.round(6800 * trendFactor),
        videoAvgWatchTime: 12.4,
        postEngagements: Math.round(3800 * trendFactor),
        likes: Math.round(2400 * trendFactor),
        comments: Math.round(390 * trendFactor),
        shares: Math.round(580 * trendFactor),
        saves: Math.round(430 * trendFactor),
        totalFollowers: 84200 + Math.round((90 - i) * 32),
        followersGained: Math.round(45 * trendFactor),
        followersLost: Math.round(12 * trendFactor),
        profileVisits: Math.round(680 * trendFactor),
        reelViews: Math.round(12400 * trendFactor),
        storyViews: Math.round(3200 * trendFactor),
        storyExits: Math.round(540 * trendFactor),
        commentsResponded: Math.round(340 * trendFactor),
        avgResponseTimeMinutes: Math.max(8, 42 - (90 - i) * 0.3),
        postsPublished: dayOfWeek === 0 || dayOfWeek === 3 ? 0 : 1,
        conversions: 0,
        leads: 0,
        purchases: 0,
        conversionValue: 0,
      });
    } else {
      // E-commerce Velox Athletics
      records.push({
        id: `rec-velox-meta-${dateStr}`,
        clientId: client.id,
        platform: "meta",
        date: dateStr,
        accountName: "Velox - Meta Scaling",
        campaignId: "cmp_velox_meta_sales",
        campaignName: "DABA Advantage+ Shopping",
        spend: Math.round(850 * trendFactor * weekendMultiplier),
        impressions: Math.round(68000 * trendFactor),
        reach: Math.round(28000 * trendFactor),
        frequency: 2.42,
        clicks: Math.round(2400 * trendFactor),
        linkClicks: Math.round(1850 * trendFactor),
        landingPageViews: Math.round(1620 * trendFactor),
        videoViews: Math.round(22000 * trendFactor),
        video3sViews: Math.round(16000 * trendFactor),
        thruplays: Math.round(9800 * trendFactor),
        videoCompletions: Math.round(4500 * trendFactor),
        videoAvgWatchTime: 6.2,
        postEngagements: Math.round(1950 * trendFactor),
        likes: Math.round(1200 * trendFactor),
        comments: Math.round(140 * trendFactor),
        shares: Math.round(290 * trendFactor),
        saves: Math.round(320 * trendFactor),
        outboundClicks: Math.round(2100 * trendFactor),
        uniqueClicks: Math.round(2050 * trendFactor),
        negativeFeedback: Math.round(9 * trendFactor),
        viewThroughConversions: Math.round(11 * trendFactor),
        conversions: Math.round(42 * trendFactor),
        leads: 0,
        purchases: Math.round(42 * trendFactor),
        conversionValue: Math.round(850 * 4.2 * trendFactor),
      });
    }
  }

  return records;
}

// Preset Templates
export const MOCK_TEMPLATES: DashboardTemplate[] = [
  {
    id: "tmpl-brand-awareness",
    name: "Brand Reach & Frequency",
    category: "Brand Awareness",
    description: "Designed for top-of-funnel reach, CPM, frequency, and video completion metrics.",
    pages: [
      {
        title: "Reach & Visibility",
        sortOrder: 0,
        widgets: [
          {
            id: "w-reach-kpi",
            pageId: "p1",
            widgetType: "kpi_card",
            title: "Total Reach",
            grid: { x: 0, y: 0, w: 3, h: 3 },
            dataConfig: { platform: "all", metricIds: ["reach"] },
          },
          {
            id: "w-cpm-kpi",
            pageId: "p1",
            widgetType: "kpi_card",
            title: "Average CPM",
            grid: { x: 3, y: 0, w: 3, h: 3 },
            dataConfig: { platform: "all", metricIds: ["cpm"] },
          },
          {
            id: "w-freq-kpi",
            pageId: "p1",
            widgetType: "kpi_card",
            title: "Average Frequency",
            grid: { x: 6, y: 0, w: 3, h: 3 },
            dataConfig: { platform: "meta", metricIds: ["frequency"] },
          },
          {
            id: "w-views-kpi",
            pageId: "p1",
            widgetType: "kpi_card",
            title: "Video Views",
            grid: { x: 9, y: 0, w: 3, h: 3 },
            dataConfig: { platform: "all", metricIds: ["video_views"] },
          },
          {
            id: "w-reach-chart",
            pageId: "p1",
            widgetType: "line_chart",
            title: "Reach & Impressions Trend",
            grid: { x: 0, y: 3, w: 8, h: 5 },
            dataConfig: { platform: "all", metricIds: ["reach", "impressions"], breakdown: "date" },
          },
          {
            id: "w-video-completion-donut",
            pageId: "p1",
            widgetType: "donut_chart",
            title: "Video Watch Retention",
            grid: { x: 8, y: 3, w: 4, h: 5 },
            dataConfig: { platform: "all", metricIds: ["video_3s_views", "thruplays", "video_completions"] },
          },
        ],
      },
    ],
  },
  {
    id: "tmpl-social-media",
    name: "Organic Social Media Overview",
    category: "Social Media",
    description: "Focuses on Instagram and Facebook organic follower growth, Reels, and engagement.",
    pages: [
      {
        title: "Instagram & FB Growth",
        sortOrder: 0,
        widgets: [
          {
            id: "w-followers-kpi",
            pageId: "p1",
            widgetType: "kpi_card",
            title: "Total Followers",
            grid: { x: 0, y: 0, w: 4, h: 3 },
            dataConfig: { platform: "instagram", metricIds: ["total_followers"] },
          },
          {
            id: "w-eng-rate-kpi",
            pageId: "p1",
            widgetType: "kpi_card",
            title: "Engagement Rate",
            grid: { x: 4, y: 0, w: 4, h: 3 },
            dataConfig: { platform: "instagram", metricIds: ["engagement_rate"] },
          },
          {
            id: "w-reel-views-kpi",
            pageId: "p1",
            widgetType: "kpi_card",
            title: "Reel Views",
            grid: { x: 8, y: 0, w: 4, h: 3 },
            dataConfig: { platform: "instagram", metricIds: ["reel_views"] },
          },
          {
            id: "w-followers-chart",
            pageId: "p1",
            widgetType: "area_chart",
            title: "Follower Growth Trend",
            grid: { x: 0, y: 3, w: 12, h: 5 },
            dataConfig: { platform: "instagram", metricIds: ["total_followers"], breakdown: "date" },
          },
        ],
      },
    ],
  },
];
