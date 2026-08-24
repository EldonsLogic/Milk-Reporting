import {
  RawDailyRecord,
  DateRangePreset,
  ComparisonPreset,
  WidgetDataConfig,
} from "@/types";
import { getMetricById } from "./metric-catalog";

export interface AggregatedQueryResult {
  metricId: string;
  displayName: string;
  value: number;
  previousValue?: number;
  changePercentage?: number;
  formattedValue: string;
  formattedChange?: string;
  trendData?: { date: string; value: number; secondaryValue?: number }[];
  breakdownData?: { label: string; value: number }[];
}

export function getDateBounds(preset: DateRangePreset): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date(endDate);

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      startDate.setDate(endDate.getDate() - 1);
      break;
    case "last_7_days":
      startDate.setDate(endDate.getDate() - 6);
      break;
    case "last_14_days":
      startDate.setDate(endDate.getDate() - 13);
      break;
    case "last_30_days":
      startDate.setDate(endDate.getDate() - 29);
      break;
    case "last_90_days":
      startDate.setDate(endDate.getDate() - 89);
      break;
    case "this_month":
      startDate.setDate(1);
      break;
    case "previous_month":
      startDate.setMonth(endDate.getMonth() - 1);
      startDate.setDate(1);
      endDate.setDate(0);
      break;
    default:
      startDate.setDate(endDate.getDate() - 29);
  }

  return { startDate, endDate };
}

export function getPreviousPeriodBounds(startDate: Date, endDate: Date): { prevStart: Date; prevEnd: Date } {
  const durationMs = endDate.getTime() - startDate.getTime();
  const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { prevStart, prevEnd };
}

export function queryWidgetData(
  records: RawDailyRecord[],
  config: WidgetDataConfig,
  globalDateRange: DateRangePreset = "last_30_days"
): AggregatedQueryResult[] {
  const selectedRange =
    config.dateRangeMode === "override" && config.customDateRange
      ? config.customDateRange
      : globalDateRange;

  const { startDate, endDate } = getDateBounds(selectedRange);
  const { prevStart, prevEnd } = getPreviousPeriodBounds(startDate, endDate);

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  const prevStartStr = prevStart.toISOString().split("T")[0];
  const prevEndStr = prevEnd.toISOString().split("T")[0];

  // Filter current period records
  const currentRecords = records.filter((r) => {
    if (config.platform !== "all" && r.platform !== config.platform) return false;
    return r.date >= startStr && r.date <= endStr;
  });

  // Filter previous period records
  const previousRecords = records.filter((r) => {
    if (config.platform !== "all" && r.platform !== config.platform) return false;
    return r.date >= prevStartStr && r.date <= prevEndStr;
  });

  return config.metricIds.map((metricId) => {
    const metricDef = getMetricById(metricId);
    const displayName = metricDef ? metricDef.displayName : metricId;

    const currVal = calculateMetricValue(currentRecords, metricId);
    const prevVal = calculateMetricValue(previousRecords, metricId);

    let changePercentage: number | undefined = undefined;
    if (prevVal > 0) {
      changePercentage = ((currVal - prevVal) / prevVal) * 100;
    } else if (currVal > 0) {
      changePercentage = 100;
    }

    // Build daily trend line
    const trendMap = new Map<string, number>();
    currentRecords.forEach((r) => {
      const existing = trendMap.get(r.date) || 0;
      trendMap.set(r.date, existing + getRawFieldValue(r, metricId));
    });

    const trendData = Array.from(trendMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, val]) => ({ date: date.slice(5), value: val }));

    return {
      metricId,
      displayName,
      value: currVal,
      previousValue: prevVal,
      changePercentage,
      formattedValue: formatMetricValue(currVal, metricDef?.dataType || "integer"),
      formattedChange:
        changePercentage !== undefined
          ? `${changePercentage >= 0 ? "+" : ""}${changePercentage.toFixed(1)}%`
          : undefined,
      trendData,
    };
  });
}

function calculateMetricValue(records: RawDailyRecord[], metricId: string): number {
  if (records.length === 0) return 0;

  const sumSpend = records.reduce((acc, r) => acc + r.spend, 0);
  const sumImpressions = records.reduce((acc, r) => acc + r.impressions, 0);
  const sumReach = records.reduce((acc, r) => acc + r.reach, 0);
  const sumClicks = records.reduce((acc, r) => acc + r.clicks, 0);
  const sumEngagements = records.reduce((acc, r) => acc + r.postEngagements, 0);
  const sumVideoViews = records.reduce((acc, r) => acc + r.videoViews, 0);
  const sumVideoCompletions = records.reduce((acc, r) => acc + r.videoCompletions, 0);
  const sumConversions = records.reduce((acc, r) => acc + r.conversions, 0);
  const sumValue = records.reduce((acc, r) => acc + r.conversionValue, 0);
  const sumFollowersGained = records.reduce((acc, r) => acc + (r.followersGained || 0), 0);
  const sumFollowersLost = records.reduce((acc, r) => acc + (r.followersLost || 0), 0);

  switch (metricId) {
    case "spend":
      return sumSpend;
    case "impressions":
      return sumImpressions;
    case "reach":
      return sumReach;
    case "frequency":
      return sumReach > 0 ? sumImpressions / sumReach : 0;
    case "cpm":
      return sumImpressions > 0 ? (sumSpend / sumImpressions) * 1000 : 0;
    case "clicks":
      return sumClicks;
    case "ctr":
      return sumImpressions > 0 ? (sumClicks / sumImpressions) * 100 : 0;
    case "cpc":
      return sumClicks > 0 ? sumSpend / sumClicks : 0;
    case "video_views":
      return sumVideoViews;
    case "thruplays":
      return records.reduce((acc, r) => acc + r.thruplays, 0);
    case "video_completions":
      return sumVideoCompletions;
    case "video_completion_rate":
      return sumVideoViews > 0 ? (sumVideoCompletions / sumVideoViews) * 100 : 0;
    case "post_engagements":
      return sumEngagements;
    case "likes":
      return records.reduce((acc, r) => acc + r.likes, 0);
    case "comments":
      return records.reduce((acc, r) => acc + r.comments, 0);
    case "shares":
      return records.reduce((acc, r) => acc + r.shares, 0);
    case "saves":
      return records.reduce((acc, r) => acc + r.saves, 0);
    case "engagement_rate":
      return sumReach > 0 ? (sumEngagements / sumReach) * 100 : 0;
    case "total_followers":
      return records[records.length - 1]?.totalFollowers || 0;
    case "net_follower_growth":
      return sumFollowersGained - sumFollowersLost;
    case "reel_views":
      return records.reduce((acc, r) => acc + (r.reelViews || 0), 0);
    case "story_views":
      return records.reduce((acc, r) => acc + (r.storyViews || 0), 0);
    case "conversions":
      return sumConversions;
    case "leads":
      return records.reduce((acc, r) => acc + r.leads, 0);
    case "purchases":
      return records.reduce((acc, r) => acc + r.purchases, 0);
    case "cpa":
      return sumConversions > 0 ? sumSpend / sumConversions : 0;
    case "conversion_value":
      return sumValue;
    case "roas":
      return sumSpend > 0 ? sumValue / sumSpend : 0;
    default:
      return 0;
  }
}

function getRawFieldValue(r: RawDailyRecord, metricId: string): number {
  switch (metricId) {
    case "spend":
      return r.spend;
    case "impressions":
      return r.impressions;
    case "reach":
      return r.reach;
    case "clicks":
      return r.clicks;
    case "video_views":
      return r.videoViews;
    case "post_engagements":
      return r.postEngagements;
    case "conversions":
      return r.conversions;
    case "conversion_value":
      return r.conversionValue;
    default:
      return 0;
  }
}

export function formatMetricValue(val: number, dataType: string): string {
  if (val === undefined || val === null || isNaN(val)) return "0";

  switch (dataType) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: val >= 100 ? 0 : 2,
      }).format(val);
    case "percentage":
      return `${val.toFixed(2)}%`;
    case "ratio":
      return `${val.toFixed(2)}x`;
    case "duration_seconds":
      return `${val.toFixed(1)}s`;
    case "integer":
    default:
      if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
      if (val >= 10_000) return `${(val / 1_000).toFixed(1)}k`;
      return new Intl.NumberFormat("en-US").format(Math.round(val));
  }
}
