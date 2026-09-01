import {
  RawDailyRecord,
  DateRangePreset,
  ComparisonPreset,
  CustomDateRange,
  BreakdownDimension,
  WidgetDataConfig,
  WidgetDataFilter,
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
  /** e.g. "vs prev period" / "vs same period last year"; absent when comparison is off */
  comparisonLabel?: string;
  trendData?: { date: string; value: number; secondaryValue?: number }[];
  breakdownData?: { label: string; value: number }[];
}

/**
 * Local-calendar yyyy-mm-dd. Deliberately NOT toISOString().split("T")[0],
 * which converts to UTC first and so reports "yesterday" for anyone west of
 * Greenwich during their evening - an off-by-one day on every date bound.
 */
export function toDateStr(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

export function getDateBounds(
  preset: DateRangePreset,
  custom?: CustomDateRange
): { startDate: Date; endDate: Date } {
  const today = new Date();
  let startDate = new Date(today);
  let endDate = new Date(today);

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      // Both bounds move back a day. Previously only the start moved, so
      // "Yesterday" silently reported yesterday *and* today.
      startDate.setDate(today.getDate() - 1);
      endDate.setDate(today.getDate() - 1);
      break;
    case "last_7_days":
      startDate.setDate(today.getDate() - 6);
      break;
    case "last_14_days":
      startDate.setDate(today.getDate() - 13);
      break;
    case "last_30_days":
      startDate.setDate(today.getDate() - 29);
      break;
    case "last_90_days":
      startDate.setDate(today.getDate() - 89);
      break;
    case "this_month":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "previous_month":
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case "this_quarter":
      startDate = startOfQuarter(today);
      break;
    case "previous_quarter": {
      const thisQuarterStart = startOfQuarter(today);
      startDate = new Date(thisQuarterStart.getFullYear(), thisQuarterStart.getMonth() - 3, 1);
      endDate = new Date(thisQuarterStart.getFullYear(), thisQuarterStart.getMonth(), 0);
      break;
    }
    case "year_to_date":
      startDate = new Date(today.getFullYear(), 0, 1);
      break;
    case "previous_year":
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate = new Date(today.getFullYear() - 1, 11, 31);
      break;
    case "custom":
      // Falls back to last 30 days when a dashboard is set to "custom" but
      // has no bounds saved yet (e.g. mid-edit), rather than returning an
      // empty range that would render every widget as zero.
      if (custom?.start && custom?.end) {
        startDate = new Date(`${custom.start}T00:00:00`);
        endDate = new Date(`${custom.end}T00:00:00`);
      } else {
        startDate.setDate(today.getDate() - 29);
      }
      break;
    default:
      startDate.setDate(today.getDate() - 29);
  }

  return { startDate, endDate };
}

export function getPreviousPeriodBounds(startDate: Date, endDate: Date): { prevStart: Date; prevEnd: Date } {
  const durationMs = endDate.getTime() - startDate.getTime();
  const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { prevStart, prevEnd };
}

/**
 * The widest date window any widget on a dashboard could ask for.
 *
 * Records are fetched date-bounded, and the bound used to come from the
 * dashboard's own range alone. But a widget can override that range - a
 * content grid showing the full post library, a "previous year" comparison
 * card - and those widgets then queried data the shell had never fetched,
 * rendering empty while the rows sat in the database. This unions the
 * dashboard range with every widget override so the fetch covers all of them.
 */
export function widestWindowForDashboard(
  dashboard: { globalDateRange: DateRangePreset; customDateBounds?: CustomDateRange; pages: { widgets: { dataConfig: WidgetDataConfig }[] }[] }
): { start: string; end: string } {
  const windows: { start: string; end: string }[] = [];

  const push = (preset: DateRangePreset, bounds?: CustomDateRange) => {
    const { startDate, endDate } = getDateBounds(preset, bounds);
    windows.push({ start: toDateStr(startDate), end: toDateStr(endDate) });
  };

  push(dashboard.globalDateRange || "last_30_days", dashboard.customDateBounds);

  for (const page of dashboard.pages || []) {
    for (const widget of page.widgets || []) {
      const cfg = widget.dataConfig;
      if (cfg?.dateRangeMode === "override" && cfg.customDateRange) {
        push(cfg.customDateRange, cfg.customDateBounds);
      }
    }
  }

  return {
    start: windows.reduce((min, w) => (w.start < min ? w.start : min), windows[0].start),
    end: windows.reduce((max, w) => (w.end > max ? w.end : max), windows[0].end),
  };
}

/** Same calendar window, shifted back one year - for year-over-year. */
export function getPreviousYearBounds(startDate: Date, endDate: Date): { prevStart: Date; prevEnd: Date } {
  const prevStart = new Date(startDate);
  prevStart.setFullYear(startDate.getFullYear() - 1);
  const prevEnd = new Date(endDate);
  prevEnd.setFullYear(endDate.getFullYear() - 1);
  return { prevStart, prevEnd };
}

function getComparisonBounds(
  mode: ComparisonPreset,
  startDate: Date,
  endDate: Date
): { prevStart: Date; prevEnd: Date } | null {
  if (mode === "none") return null;
  if (mode === "previous_year") return getPreviousYearBounds(startDate, endDate);
  return getPreviousPeriodBounds(startDate, endDate);
}

// ---------------------------------------------------------------------------
// Dimension filtering
// ---------------------------------------------------------------------------

/** Which RawDailyRecord field each breakdown dimension reads. */
const DIMENSION_FIELD: Record<BreakdownDimension, keyof RawDailyRecord> = {
  date: "date",
  platform: "platform",
  campaign: "campaignName",
  adset: "adsetName",
  ad: "adName",
  objective: "campaignObjective",
  account: "accountName",
};

function recordDimensionValue(r: RawDailyRecord, dimension: BreakdownDimension): string {
  const raw = r[DIMENSION_FIELD[dimension]];
  return typeof raw === "string" ? raw : "";
}

/**
 * Dashboard-level filters: {campaign: "summer", platform: "meta"}. Matched
 * case-insensitively as a substring, so an agency can scope a whole dashboard
 * to one campaign family without typing an exact name. An empty value is
 * treated as "no filter" rather than "match empty".
 */
function applyGlobalFilters(
  records: RawDailyRecord[],
  filters?: Record<string, string>
): RawDailyRecord[] {
  if (!filters) return records;
  const active = Object.entries(filters).filter(
    ([dim, value]) => value?.trim() && dim in DIMENSION_FIELD
  );
  if (active.length === 0) return records;

  return records.filter((r) =>
    active.every(([dim, value]) =>
      recordDimensionValue(r, dim as BreakdownDimension)
        .toLowerCase()
        .includes(value.trim().toLowerCase())
    )
  );
}

/** Widget-level filters, which support explicit operators unlike the global ones. */
function applyWidgetFilters(records: RawDailyRecord[], filters?: WidgetDataFilter[]): RawDailyRecord[] {
  if (!filters?.length) return records;

  return records.filter((r) =>
    filters.every((f) => {
      if (!f.value?.trim()) return true;
      const raw = r[f.field as keyof RawDailyRecord];
      const needle = f.value.trim().toLowerCase();

      if (f.operator === "greater_than") {
        return typeof raw === "number" && raw > parseFloat(f.value);
      }
      const hay = typeof raw === "string" ? raw.toLowerCase() : String(raw ?? "").toLowerCase();
      if (f.operator === "equals") return hay === needle;
      if (f.operator === "in") return needle.split(",").map((s) => s.trim()).includes(hay);
      return hay.includes(needle);
    })
  );
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

/** Options threaded down from the dashboard rather than the widget itself. */
export interface QueryContext {
  globalDateRange?: DateRangePreset;
  /** bounds for a dashboard set to the "custom" preset */
  globalCustomBounds?: CustomDateRange;
  /** agency markup %, only ever passed for the client-facing perspective */
  markupPercentage?: number;
  /** dashboard-wide dimension filters */
  globalFilters?: Record<string, string>;
}

/**
 * Resolves the effective window for a widget: its own override if it has one,
 * otherwise the dashboard's, along with whichever comparison window its
 * comparisonMode asks for.
 */
function resolveWindows(config: WidgetDataConfig, ctx: QueryContext) {
  const isOverride = config.dateRangeMode === "override" && !!config.customDateRange;
  const preset = isOverride ? config.customDateRange! : ctx.globalDateRange || "last_30_days";
  const bounds = isOverride ? config.customDateBounds : ctx.globalCustomBounds;

  const { startDate, endDate } = getDateBounds(preset, bounds);
  const comparison = getComparisonBounds(config.comparisonMode || "previous_period", startDate, endDate);

  return {
    startStr: toDateStr(startDate),
    endStr: toDateStr(endDate),
    prevStartStr: comparison ? toDateStr(comparison.prevStart) : null,
    prevEndStr: comparison ? toDateStr(comparison.prevEnd) : null,
    startDate,
    endDate,
  };
}

/** Platform + global + widget filters, applied in that order, then markup. */
function scopeRecords(
  records: RawDailyRecord[],
  config: WidgetDataConfig,
  ctx: QueryContext,
  fromStr: string,
  toStr: string
): RawDailyRecord[] {
  const dateScoped = records.filter((r) => {
    if (config.platform !== "all" && r.platform !== config.platform) return false;
    return r.date >= fromStr && r.date <= toStr;
  });
  const globallyFiltered = applyGlobalFilters(dateScoped, ctx.globalFilters);
  const widgetFiltered = applyWidgetFilters(globallyFiltered, config.filters);
  return applyMarkup(widgetFiltered, ctx.markupPercentage);
}

export function queryWidgetData(
  records: RawDailyRecord[],
  config: WidgetDataConfig,
  ctx: QueryContext = {}
): AggregatedQueryResult[] {
  const win = resolveWindows(config, ctx);

  const currentRecords = scopeRecords(records, config, ctx, win.startStr, win.endStr);
  const previousRecords =
    win.prevStartStr && win.prevEndStr
      ? scopeRecords(records, config, ctx, win.prevStartStr, win.prevEndStr)
      : [];

  const comparisonMode = config.comparisonMode || "previous_period";

  return config.metricIds.map((metricId) => {
    const metricDef = getMetricById(metricId);
    const displayName = metricDef ? metricDef.displayName : metricId;

    const currVal = calculateMetricValue(currentRecords, metricId);
    // A comparison needs a period that actually holds data. When the previous
    // window has no records at all - a new account, or a range that predates
    // the first sync - there is nothing to compare against, and reporting
    // "+100%" would state a growth figure that was never measured. Left
    // undefined so the widget shows no delta rather than a fabricated one.
    const hasComparison = comparisonMode !== "none" && previousRecords.length > 0;
    const prevVal = hasComparison ? calculateMetricValue(previousRecords, metricId) : 0;

    let changePercentage: number | undefined = undefined;
    if (hasComparison) {
      if (prevVal > 0) {
        changePercentage = ((currVal - prevVal) / prevVal) * 100;
      } else if (currVal > 0) {
        // Previous period was measured and was genuinely zero - a real
        // increase from nothing, unlike the no-data case handled above.
        changePercentage = 100;
      }
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
      previousValue: hasComparison ? prevVal : undefined,
      changePercentage,
      formattedValue: formatMetricValue(currVal, metricDef?.dataType || "integer"),
      formattedChange:
        changePercentage !== undefined
          ? `${changePercentage >= 0 ? "+" : ""}${changePercentage.toFixed(1)}%`
          : undefined,
      comparisonLabel:
        comparisonMode === "none"
          ? undefined
          : comparisonMode === "previous_year"
          ? "vs same period last year"
          : "vs prev period",
      trendData,
    };
  });
}

// ---------------------------------------------------------------------------
// Dimensional breakdown - one row per entity rather than one number per metric
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  key: string;
  label: string;
  /** metricId -> raw numeric value */
  values: Record<string, number>;
  /** metricId -> display string */
  formatted: Record<string, string>;
  /** share of the total for the first configured metric, 0-100 */
  sharePercentage: number;
}

/**
 * Groups records by a dimension and computes every configured metric within
 * each group. This is what the aggregate engine above deliberately cannot do -
 * it always collapses to a single number - and it's what campaign tables,
 * rankings, stacked bars and heatmaps are actually made of.
 *
 * Ratio metrics stay correct here because each group is aggregated through
 * the same calculateMetricValue as a whole dashboard would be: a group's CTR
 * is its own clicks/impressions, never an average of daily CTRs.
 */
export function queryBreakdown(
  records: RawDailyRecord[],
  config: WidgetDataConfig,
  ctx: QueryContext = {},
  dimension: BreakdownDimension = "campaign"
): BreakdownRow[] {
  const win = resolveWindows(config, ctx);
  const scoped = scopeRecords(records, config, ctx, win.startStr, win.endStr);

  const groups = new Map<string, RawDailyRecord[]>();
  for (const r of scoped) {
    const value = recordDimensionValue(r, dimension);
    // Records with no value for this dimension (organic rows have no campaign)
    // are grouped under an explicit label rather than an empty string, so the
    // table never renders a blank row the reader can't interpret.
    const key = value || "(not set)";
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const metricIds = config.metricIds.length > 0 ? config.metricIds : ["spend"];
  const primaryMetric = metricIds[0];

  const rows: BreakdownRow[] = Array.from(groups.entries()).map(([key, groupRecords]) => {
    const values: Record<string, number> = {};
    const formatted: Record<string, string> = {};
    for (const metricId of metricIds) {
      const metricDef = getMetricById(metricId);
      const val = calculateMetricValue(groupRecords, metricId);
      values[metricId] = val;
      formatted[metricId] = formatMetricValue(val, metricDef?.dataType || "integer");
    }
    return { key, label: key, values, formatted, sharePercentage: 0 };
  });

  // Share is only meaningful for additive metrics; for a ratio like CTR the
  // "total" is not a sum, so shares are left at 0 rather than invented.
  const primaryDef = getMetricById(primaryMetric);
  const isAdditive = !primaryDef?.isDerived;
  if (isAdditive) {
    const total = rows.reduce((acc, row) => acc + (row.values[primaryMetric] || 0), 0);
    if (total > 0) {
      for (const row of rows) {
        row.sharePercentage = ((row.values[primaryMetric] || 0) / total) * 100;
      }
    }
  }

  const sortMetric = config.sortBy && metricIds.includes(config.sortBy) ? config.sortBy : primaryMetric;
  rows.sort((a, b) =>
    config.sortOrder === "asc"
      ? (a.values[sortMetric] || 0) - (b.values[sortMetric] || 0)
      : (b.values[sortMetric] || 0) - (a.values[sortMetric] || 0)
  );

  return config.limit ? rows.slice(0, config.limit) : rows;
}

/**
 * Breakdown over time: one row per date, one series per dimension value.
 * Backs the stacked bar and heatmap widgets, which need both axes at once.
 */
export function queryBreakdownOverTime(
  records: RawDailyRecord[],
  config: WidgetDataConfig,
  ctx: QueryContext = {},
  dimension: BreakdownDimension = "platform",
  maxSeries = 6
): { data: Record<string, string | number>[]; series: string[] } {
  const win = resolveWindows(config, ctx);
  const scoped = scopeRecords(records, config, ctx, win.startStr, win.endStr);
  const metricId = config.metricIds[0] || "spend";

  // Only the top N dimension values get their own series - beyond that a
  // stacked chart becomes unreadable, so the tail is folded into "Other"
  // rather than silently dropped (which would make the totals wrong).
  const topRows = queryBreakdown(records, config, ctx, dimension);
  const topKeys = topRows.slice(0, maxSeries).map((r) => r.key);
  const hasOther = topRows.length > maxSeries;

  const byDate = new Map<string, Record<string, string | number>>();
  for (const r of scoped) {
    const row = byDate.get(r.date) || { date: r.date.slice(5) };
    const rawKey = recordDimensionValue(r, dimension) || "(not set)";
    const key = topKeys.includes(rawKey) ? rawKey : "Other";
    row[key] = ((row[key] as number) || 0) + getRawFieldValue(r, metricId);
    byDate.set(r.date, row);
  }

  const data = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, row]) => row);

  return { data, series: hasOther ? [...topKeys, "Other"] : topKeys };
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
    case "total_followers": {
      // A follower count is a snapshot, not something to sum, so the right
      // answer is the most recent one in range. Meta reports it only as a
      // live figure, so ingestion stamps it on a single row per sync -
      // reading records[length-1] therefore returned 0 whenever array order
      // put a different row last, which is why Instagram showed no followers
      // while Facebook happened to work.
      let latestDate = "";
      let latest = 0;
      for (const r of records) {
        if ((r.totalFollowers || 0) > 0 && r.date > latestDate) {
          latestDate = r.date;
          latest = r.totalFollowers || 0;
        }
      }
      return latest;
    }
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
      const metricDef = getMetricById(metricId);

      // A non-derived catalog metric names the RawDailyRecord field it reads
      // in sourceField, so it can be summed directly rather than needing a
      // hand-written case above. Six catalog metrics (link_clicks,
      // landing_page_views, video_3s_views, video_avg_watch_time,
      // followers_gained, profile_visits) had no case and so silently
      // returned 0 while their data was sitting in the records - selectable
      // in the picker, permanently and invisibly wrong.
      if (metricDef && !metricDef.isDerived && metricDef.sourceField) {
        const field = metricDef.sourceField as keyof RawDailyRecord;
        // Averaged, not summed, for rate-style fields - the same distinction
        // averageField() exists for above.
        if (field === "videoAvgWatchTime" || field === "avgResponseTimeMinutes") {
          return averageField(records, field);
        }
        return records.reduce((acc, r) => {
          const value = r[field];
          return acc + (typeof value === "number" ? value : 0);
        }, 0);
      }

      // Otherwise: an agency-defined custom metric, evaluated against every
      // summed numeric field (not just the handful named explicitly above),
      // so a custom formula can reference any field.
      if (metricDef?.isDerived && metricDef.formula) {
        try {
          const result = evaluateFormula(metricDef.formula, sumAllNumericFields(records));
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
/** Which ContentPost.metrics field each catalog metric reads. */
const CONTENT_METRIC_FIELD: Record<string, keyof ContentPost["metrics"]> = {
  reach: "reach",
  impressions: "impressions",
  post_impressions: "impressions",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  video_views: "videoViews",
  reel_views: "videoViews",
};

/** Metrics computed across a post's fields rather than read from one. */
function contentDerived(metricId: string, m: ContentPost["metrics"]): number | null {
  const likes = m.likes || 0;
  const comments = m.comments || 0;
  const shares = m.shares || 0;
  const saves = m.saves || 0;
  const reach = m.reach || 0;

  switch (metricId) {
    case "post_engagements":
      return likes + comments + shares + saves;
    case "engagement_rate":
      // Returned as a share of reach, resolved to a percentage by the caller
      // once both sides have been summed across the period.
      return reach > 0 ? likes + comments + shares + saves : 0;
    default:
      return null;
  }
}

export function contentMetricValue(posts: ContentPost[], metricId: string): number {
  if (posts.length === 0) return 0;

  if (metricId === "engagement_rate") {
    // Aggregated as total engagements over total reach, never as a mean of
    // per-post rates - averaging rates would weight a post that reached 40
    // people the same as one that reached 40,000.
    const engagements = posts.reduce((acc, p) => acc + (contentDerived("post_engagements", p.metrics) || 0), 0);
    const reach = posts.reduce((acc, p) => acc + (p.metrics.reach || 0), 0);
    return reach > 0 ? (engagements / reach) * 100 : 0;
  }
  if (metricId === "posts_published") return posts.length;

  const derivedTotal = posts.reduce((acc, p) => {
    const derived = contentDerived(metricId, p.metrics);
    return derived === null ? acc : acc + derived;
  }, 0);
  if (contentDerived(metricId, posts[0].metrics) !== null) return derivedTotal;

  const field = CONTENT_METRIC_FIELD[metricId];
  if (!field) return 0;
  return posts.reduce((acc, p) => acc + (p.metrics[field] || 0), 0);
}

/**
 * Aggregates individual posts into the same result shape queryWidgetData
 * returns, so a KPI card, table or chart can be backed by content instead of
 * account-level dailies. This is what "total impressions this month" should
 * mean for organic social: the sum of what the posts actually did, rather
 * than a platform aggregate that arrives without a daily breakdown.
 */
export function queryContentAggregate(
  posts: ContentPost[],
  config: WidgetDataConfig,
  ctx: QueryContext = {}
): AggregatedQueryResult[] {
  const current = queryContentPosts(posts, config, ctx);

  const isOverride = config.dateRangeMode === "override" && !!config.customDateRange;
  const preset = isOverride ? config.customDateRange! : ctx.globalDateRange || "last_30_days";
  const bounds = isOverride ? config.customDateBounds : ctx.globalCustomBounds;
  const { startDate, endDate } = getDateBounds(preset, bounds);
  const comparisonMode = config.comparisonMode || "previous_period";
  const comparison = getComparisonBounds(comparisonMode, startDate, endDate);

  let previous: ContentPost[] = [];
  if (comparison) {
    const prevStart = toDateStr(comparison.prevStart);
    const prevEnd = toDateStr(comparison.prevEnd);
    previous = posts.filter((p) => {
      if (config.platform !== "all" && p.platform !== config.platform) return false;
      const day = p.postedAt.slice(0, 10);
      return day >= prevStart && day <= prevEnd;
    });
  }
  const hasComparison = comparison !== null && previous.length > 0;

  return config.metricIds.map((metricId) => {
    const metricDef = getMetricById(metricId);
    const value = contentMetricValue(current, metricId);
    const prevVal = hasComparison ? contentMetricValue(previous, metricId) : 0;

    let changePercentage: number | undefined;
    if (hasComparison) {
      if (prevVal > 0) changePercentage = ((value - prevVal) / prevVal) * 100;
      else if (value > 0) changePercentage = 100;
    }

    // Posts are discrete events, so the daily series is the sum of whatever
    // published that day - genuinely daily, unlike the account-level totals.
    const byDate = new Map<string, number>();
    for (const post of current) {
      const day = post.postedAt.slice(0, 10);
      byDate.set(day, (byDate.get(day) || 0) + contentMetricValue([post], metricId));
    }
    const trendData = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, val]) => ({ date: date.slice(5), value: val }));

    return {
      metricId,
      displayName: metricDef?.displayName || metricId,
      value,
      previousValue: hasComparison ? prevVal : undefined,
      changePercentage,
      formattedValue: formatMetricValue(value, metricDef?.dataType || "integer"),
      formattedChange:
        changePercentage !== undefined
          ? `${changePercentage >= 0 ? "+" : ""}${changePercentage.toFixed(1)}%`
          : undefined,
      comparisonLabel:
        comparisonMode === "none"
          ? undefined
          : comparisonMode === "previous_year"
          ? "vs same period last year"
          : "vs prev period",
      trendData,
    };
  });
}

/** Per-platform content totals, for breaking organic performance down by network. */
export function queryContentByPlatform(
  posts: ContentPost[],
  config: WidgetDataConfig,
  ctx: QueryContext = {}
): BreakdownRow[] {
  const scoped = queryContentPosts(posts, { ...config, limit: undefined }, ctx);
  const metricIds = config.metricIds.length ? config.metricIds : ["reach"];
  const primary = metricIds[0];

  const groups = new Map<string, ContentPost[]>();
  for (const post of scoped) {
    const bucket = groups.get(post.platform);
    if (bucket) bucket.push(post);
    else groups.set(post.platform, [post]);
  }

  const rows: BreakdownRow[] = Array.from(groups.entries()).map(([key, group]) => {
    const values: Record<string, number> = {};
    const formatted: Record<string, string> = {};
    for (const metricId of metricIds) {
      const val = contentMetricValue(group, metricId);
      values[metricId] = val;
      formatted[metricId] = formatMetricValue(val, getMetricById(metricId)?.dataType || "integer");
    }
    return { key, label: PLATFORM_LABELS[key] || key, values, formatted, sharePercentage: 0 };
  });

  const total = rows.reduce((acc, r) => acc + (r.values[primary] || 0), 0);
  if (total > 0) {
    for (const row of rows) row.sharePercentage = ((row.values[primary] || 0) / total) * 100;
  }
  rows.sort((a, b) => (b.values[primary] || 0) - (a.values[primary] || 0));
  return rows;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook_page: "Facebook",
  instagram: "Instagram",
  meta: "Meta Ads",
  google_ads: "Google Ads",
  tiktok_ads: "TikTok Ads",
};

export function queryContentPosts(
  posts: ContentPost[],
  config: WidgetDataConfig,
  ctx: QueryContext = {}
): ContentPost[] {
  const isOverride = config.dateRangeMode === "override" && !!config.customDateRange;
  const preset = isOverride ? config.customDateRange! : ctx.globalDateRange || "last_30_days";
  const bounds = isOverride ? config.customDateBounds : ctx.globalCustomBounds;
  const { startDate, endDate } = getDateBounds(preset, bounds);

  // Compare on the calendar day, not the instant - a post published at 9pm on
  // the range's last day is inside the range, but its timestamp is after that
  // day's midnight-anchored Date object.
  const startStr = toDateStr(startDate);
  const endStr = toDateStr(endDate);

  const filtered = posts.filter((p) => {
    if (config.platform !== "all" && p.platform !== config.platform) return false;
    const postedDay = p.postedAt.slice(0, 10);
    return postedDay >= startStr && postedDay <= endStr;
  });

  const sortKey = (config.sortBy as keyof ContentPost["metrics"]) || "reach";
  const sorted = [...filtered].sort((a, b) => {
    const av = a.metrics[sortKey] ?? 0;
    const bv = b.metrics[sortKey] ?? 0;
    return config.sortOrder === "asc" ? av - bv : bv - av;
  });

  return config.limit ? sorted.slice(0, config.limit) : sorted;
}

/**
 * Currency the app formats spend in when a client's connections don't
 * report one. Deliberately a module-level setting rather than a hardcoded
 * "USD" inside the formatter: the first real account connected reports in
 * SAR, and rendering riyals behind a dollar sign misstates every cost
 * metric on a client-facing report.
 */
let displayCurrency = "USD";

export function setDisplayCurrency(code?: string | null) {
  displayCurrency = code && /^[A-Z]{3}$/.test(code) ? code : "USD";
}

export function getDisplayCurrency(): string {
  return displayCurrency;
}

export function formatMetricValue(val: number, dataType: string, currency?: string): string {
  if (val === undefined || val === null || isNaN(val)) return "0";

  switch (dataType) {
    case "currency": {
      const code = currency || displayCurrency;
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: code,
          maximumFractionDigits: val >= 100 ? 0 : 2,
        }).format(val);
      } catch {
        // Intl throws on an unrecognised code rather than degrading, and a
        // bad currency should never blank out the number itself.
        return `${code} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: val >= 100 ? 0 : 2 }).format(val)}`;
      }
    }
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
