import {
  RawDailyRecord,
  DateRangePreset,
  ComparisonPreset,
  WidgetDataConfig,
  ContentPost,
} from "@/types";
import { getMetricById } from "./metric-catalog";
import { evaluateFormula } from "./formula-evaluator";

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

// Applies the agency's hidden markup to spend before any metric is
// calculated, so every spend-derived metric (CPM, CPC, CPA, ROAS, cost per
// ThruPlay...) correctly reflects what the client was billed rather than
// true platform spend, without special-casing each formula individually.
// Only ever applied for the client-facing perspective - agency admins see
// true spend by default.
function applyMarkup(records: RawDailyRecord[], markupPercentage?: number): RawDailyRecord[] {
  if (!markupPercentage) return records;
  const factor = 1 + markupPercentage / 100;
  return records.map((r) => ({ ...r, spend: r.spend * factor }));
}

export function queryWidgetData(
  records: RawDailyRecord[],
  config: WidgetDataConfig,
  globalDateRange: DateRangePreset = "last_30_days",
  markupPercentage?: number
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
  const currentRecords = applyMarkup(
    records.filter((r) => {
      if (config.platform !== "all" && r.platform !== config.platform) return false;
      return r.date >= startStr && r.date <= endStr;
    }),
    markupPercentage
  );

  // Filter previous period records
  const previousRecords = applyMarkup(
    records.filter((r) => {
      if (config.platform !== "all" && r.platform !== config.platform) return false;
      return r.date >= prevStartStr && r.date <= prevEndStr;
    }),
    markupPercentage
  );

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

// Fields that are rates/scores, not counts - averaging across the records
// where the field was actually reported, never summed (summing a quality
// score across 30 days would produce nonsense like "210").
function averageField(records: RawDailyRecord[], field: keyof RawDailyRecord): number {
  const present = records.filter((r) => typeof r[field] === "number") as (RawDailyRecord & Record<string, number>)[];
  if (present.length === 0) return 0;
  const sum = present.reduce((acc, r) => acc + (r[field] as number), 0);
  return sum / present.length;
}

// Sums every numeric field on the records using their exact RawDailyRecord
// property names (spend, impressions, followersGained, ...) - the same
// vocabulary the built-in derived metric formulas already use. This is
// what lets a custom metric's formula reference any field without the
// query engine needing a dedicated case for it.
function sumAllNumericFields(records: RawDailyRecord[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of records) {
    for (const [key, value] of Object.entries(r)) {
      if (typeof value === "number") {
        totals[key] = (totals[key] || 0) + value;
      }
    }
  }
  return totals;
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
  const sumOutboundClicks = records.reduce((acc, r) => acc + (r.outboundClicks || 0), 0);
  const sumUniqueClicks = records.reduce((acc, r) => acc + (r.uniqueClicks || 0), 0);
  const sumVideo3sViews = records.reduce((acc, r) => acc + r.video3sViews, 0);
  const sumThruplays = records.reduce((acc, r) => acc + r.thruplays, 0);
  const sumNegativeFeedback = records.reduce((acc, r) => acc + (r.negativeFeedback || 0), 0);
  const sumComments = records.reduce((acc, r) => acc + r.comments, 0);
  const sumCommentsResponded = records.reduce((acc, r) => acc + (r.commentsResponded || 0), 0);
  const sumStoryViews = records.reduce((acc, r) => acc + (r.storyViews || 0), 0);
  const sumStoryExits = records.reduce((acc, r) => acc + (r.storyExits || 0), 0);

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
    case "view_through_conversions":
      return records.reduce((acc, r) => acc + (r.viewThroughConversions || 0), 0);
    case "outbound_clicks":
      return sumOutboundClicks;
    case "outbound_ctr":
      return sumImpressions > 0 ? (sumOutboundClicks / sumImpressions) * 100 : 0;
    case "unique_clicks":
      return sumUniqueClicks;
    case "unique_ctr":
      return sumReach > 0 ? (sumUniqueClicks / sumReach) * 100 : 0;
    case "search_impression_share":
      return averageField(records, "searchImpressionShare");
    case "quality_score":
      return averageField(records, "qualityScore");
    case "cost_per_thruplay":
      return sumThruplays > 0 ? sumSpend / sumThruplays : 0;
    case "hook_rate":
      return sumImpressions > 0 ? (sumVideo3sViews / sumImpressions) * 100 : 0;
    case "hold_rate":
      return sumVideo3sViews > 0 ? (sumThruplays / sumVideo3sViews) * 100 : 0;
    case "video_views_2s":
      return records.reduce((acc, r) => acc + (r.videoViews2s || 0), 0);
    case "video_views_6s":
      return records.reduce((acc, r) => acc + (r.videoViews6s || 0), 0);
    case "negative_feedback":
      return sumNegativeFeedback;
    case "negative_feedback_rate":
      return sumImpressions > 0 ? (sumNegativeFeedback / sumImpressions) * 100 : 0;
    case "comments_responded":
      return sumCommentsResponded;
    case "response_rate":
      return sumComments > 0 ? (sumCommentsResponded / sumComments) * 100 : 0;
    case "avg_response_time":
      return averageField(records, "avgResponseTimeMinutes");
    case "story_exits":
      return sumStoryExits;
    case "story_exit_rate":
      return sumStoryViews > 0 ? (sumStoryExits / sumStoryViews) * 100 : 0;
    case "posts_published":
      return records.reduce((acc, r) => acc + (r.postsPublished || 0), 0);
    default: {
      // Not a built-in metric - check whether it's an agency-defined
      // custom metric and, if so, evaluate its formula against every
      // summed numeric field (not just the handful this function names
      // explicitly), so a custom formula can reference any field.
      const customMetric = getMetricById(metricId);
      if (customMetric?.isDerived && customMetric.formula) {
        try {
          const result = evaluateFormula(customMetric.formula, sumAllNumericFields(records));
          return result ?? 0;
        } catch {
          return 0;
        }
      }
      return 0;
    }
  }
}

function getRawFieldValue(r: RawDailyRecord, metricId: string): number {
  // Generalized from a hand-maintained 8-metric switch: metric-catalog.ts's
  // sourceField values are already the exact RawDailyRecord property names
  // (e.g. "total_followers" -> "totalFollowers"), so any non-derived metric
  // can look itself up directly instead of needing a dedicated case here.
  // Derived metrics (no sourceField, e.g. CTR/CPM) still can't produce a
  // sensible single-record trend value and correctly fall through to 0 -
  // that part of the behavior is unchanged.
  const metricDef = getMetricById(metricId);
  if (metricDef?.sourceField) {
    const value = r[metricDef.sourceField as keyof RawDailyRecord];
    return typeof value === "number" ? value : 0;
  }
  return 0;
}

// Post-level query - deliberately separate from queryWidgetData, which
// always collapses to one aggregate number per metric. This returns
// individual rows (one per post), which the aggregate engine has no
// concept of.
export function queryContentPosts(
  posts: ContentPost[],
  config: WidgetDataConfig,
  globalDateRange: DateRangePreset = "last_30_days"
): ContentPost[] {
  const selectedRange =
    config.dateRangeMode === "override" && config.customDateRange
      ? config.customDateRange
      : globalDateRange;
  const { startDate, endDate } = getDateBounds(selectedRange);

  const filtered = posts.filter((p) => {
    if (config.platform !== "all" && p.platform !== config.platform) return false;
    const postedAt = new Date(p.postedAt);
    return postedAt >= startDate && postedAt <= endDate;
  });

  const sortKey = (config.sortBy as keyof ContentPost["metrics"]) || "reach";
  const sorted = [...filtered].sort((a, b) => {
    const av = a.metrics[sortKey] ?? 0;
    const bv = b.metrics[sortKey] ?? 0;
    return config.sortOrder === "asc" ? av - bv : bv - av;
  });

  return config.limit ? sorted.slice(0, config.limit) : sorted;
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
