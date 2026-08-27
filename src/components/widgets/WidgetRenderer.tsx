"use client";

import React from "react";
import { WidgetConfig, RawDailyRecord, ContentPost, BreakdownDimension } from "@/types";
import {
  queryWidgetData,
  queryContentPosts,
  queryBreakdown,
  queryBreakdownOverTime,
  formatMetricValue,
  QueryContext,
  BreakdownRow,
} from "@/lib/query-engine";
import { Annotation } from "@/lib/supabase-data";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, ImageOff, ExternalLink, Heart, MessageCircle, Share2 } from "lucide-react";

interface Props {
  widget: WidgetConfig;
  records: RawDailyRecord[];
  contentPosts?: ContentPost[];
  ctx: QueryContext;
  annotations?: Annotation[];
  onEdit?: (widget: WidgetConfig) => void;
  onDelete?: (widgetId: string) => void;
  isEditMode?: boolean;
}

const MILK_PALETTE = ["#FFE600", "#111111", "#666666", "#999999", "#CCCCCC"];
// Distinct-enough series colors for multi-metric line/area charts - black
// first (primary), yellow second (brand accent), then grays.
const MILK_LINE_PALETTE = ["#111111", "#EAB308", "#666666", "#999999"];
// Stacked segments need more mutually distinguishable steps than the
// two-or-three-series line palette provides, while staying in the
// black/yellow/grey editorial range rather than introducing new hues.
const MILK_SERIES_PALETTE = ["#111111", "#FFE600", "#4A4640", "#B8B2A6", "#7A756C", "#E2E2DF"];

const TOOLTIP_STYLE = {
  backgroundColor: "#111111",
  color: "#FFFFFF",
  borderRadius: "0px",
  border: "none",
  fontSize: "11px",
  fontFamily: "monospace",
} as const;

const DIMENSION_LABELS: Record<string, string> = {
  date: "Date",
  platform: "Platform",
  campaign: "Campaign",
  adset: "Ad Set",
  ad: "Ad",
  objective: "Objective",
  account: "Account",
};

function EmptyBody({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-center text-xs font-mono text-neutral-400 py-4 px-3">
      {message}
    </div>
  );
}

// Recharts wants one data array with a key per series, but queryWidgetData
// returns one AggregatedQueryResult (with its own trendData) per metric -
// merge them by date so a multi-metric widget actually plots every line,
// not just the first.
function mergeTrendData(results: ReturnType<typeof queryWidgetData>) {
  const byDate = new Map<string, Record<string, string | number | null>>();
  for (const result of results) {
    for (const point of result.trendData || []) {
      const row = byDate.get(point.date) || { date: point.date };
      row[result.metricId] = point.value;
      byDate.set(point.date, row);
    }
  }
  return Array.from(byDate.values());
}

/** Widget types whose body is a per-entity breakdown rather than an aggregate. */
const BREAKDOWN_WIDGETS = new Set(["campaign_table", "ranking", "heatmap"]);

export function WidgetRenderer({
  widget,
  records,
  contentPosts = [],
  ctx,
  annotations = [],
  onEdit,
  onDelete,
  isEditMode,
}: Props) {
  const { widgetType, dataConfig } = widget;
  const dimension: BreakdownDimension = dataConfig.breakdown || "campaign";

  const dataResults = queryWidgetData(records, dataConfig, ctx);
  const contentResults =
    widgetType === "content_table" ? queryContentPosts(contentPosts, dataConfig, ctx) : [];
  const breakdownRows = BREAKDOWN_WIDGETS.has(widgetType)
    ? queryBreakdown(records, dataConfig, ctx, dimension)
    : [];
  const stacked =
    widgetType === "stacked_bar"
      ? queryBreakdownOverTime(records, dataConfig, ctx, dataConfig.breakdown || "platform")
      : null;

  return (
    <div className="h-full w-full bg-white border border-neutral-200 flex flex-col justify-between p-4 transition-all hover:border-neutral-400 group relative">
      {/* Edit Mode Header Overlay Actions */}
      {isEditMode && (
        <div
          className="no-drag print:hidden absolute top-2 right-2 z-20 flex items-center space-x-1 bg-milk-bg border border-neutral-300 p-1 opacity-90 group-hover:opacity-100"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onEdit?.(widget)}
            className="px-2 py-0.5 text-xs font-mono bg-white border border-neutral-300 hover:bg-milk-yellow hover:border-black font-semibold"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete?.(widget.id)}
            className="px-2 py-0.5 text-xs font-mono bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white font-semibold"
          >
            Delete
          </button>
        </div>
      )}

      {/* Widget Header */}
      {widget.displayConfig?.showTitle !== false && widgetType !== "image_logo" && (
        <div className="mb-2 flex items-center justify-between border-b border-neutral-100 pb-2">
          <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-neutral-800 flex items-center gap-1.5">
            {widget.title}
          </h4>
          <span className="text-[10px] font-mono text-neutral-500 uppercase px-1.5 py-0.5 bg-neutral-100 border border-neutral-200">
            {BREAKDOWN_WIDGETS.has(widgetType) ? dimension : widget.dataConfig.platform}
          </span>
        </div>
      )}

      {/* Widget Content Body */}
      <div className="flex-1 w-full overflow-hidden flex flex-col justify-center">
        {renderWidgetBody(widget, dataResults, contentResults, breakdownRows, stacked, annotations)}
      </div>

      {/* Optional Note Footer */}
      {widget.displayConfig?.noteText && (
        <div className="mt-2 pt-1 border-t border-neutral-100 text-[11px] font-sans text-neutral-500 italic">
          {widget.displayConfig.noteText}
        </div>
      )}
    </div>
  );
}

/**
 * Which annotations fall on a date the chart actually plots. Chart x-values
 * are "MM-DD" (trendData slices the year off), so dates are matched in that
 * shape. Annotations outside the plotted window are dropped rather than
 * clamped - a ReferenceLine at an x-value the axis doesn't contain renders
 * at the edge and reads as a real event on the wrong day.
 */
function visibleAnnotations(annotations: Annotation[], plottedDates: string[]) {
  if (annotations.length === 0 || plottedDates.length === 0) return [];
  const plotted = new Set(plottedDates);
  return annotations
    .map((a) => ({ annotation: a, x: a.date.slice(5) }))
    .filter(({ x }) => plotted.has(x));
}

/**
 * Top margin a chart needs to fit annotation labels. Recharts draws a
 * ReferenceLine label above the plot area, so without headroom the title is
 * clipped by the container and the marker looks unlabelled.
 */
function chartTopMargin(hasAnnotations: boolean): number {
  return hasAnnotations ? 20 : 5;
}

function annotationMarkers(visible: ReturnType<typeof visibleAnnotations>) {
  return visible.map(({ annotation, x }) => (
    <ReferenceLine
      key={annotation.id}
      x={x}
      stroke="#B3121B"
      strokeDasharray="3 3"
      strokeWidth={1.5}
      label={{
        value: annotation.title,
        position: "top",
        fontSize: 9,
        fill: "#B3121B",
        fontFamily: "monospace",
      }}
    />
  ));
}

function renderWidgetBody(
  widget: WidgetConfig,
  results: ReturnType<typeof queryWidgetData>,
  contentResults: ContentPost[],
  breakdownRows: BreakdownRow[],
  stacked: { data: Record<string, string | number>[]; series: string[] } | null,
  annotations: Annotation[]
) {
  const primaryResult = results[0];

  if (
    !primaryResult &&
    widget.widgetType !== "text" &&
    widget.widgetType !== "image_logo" &&
    widget.widgetType !== "ai_insight" &&
    widget.widgetType !== "content_table"
  ) {
    return (
      <div className="flex items-center justify-center text-xs text-neutral-400 font-mono py-4">
        No Data Configured
      </div>
    );
  }

  switch (widget.widgetType) {
    case "kpi_card":
    case "number":
    case "percentage": {
      const isPositive = (primaryResult.changePercentage || 0) >= 0;
      return (
        <div className="flex flex-col justify-between h-full py-1">
          <div className="text-3xl font-display font-extrabold tracking-tight text-neutral-900">
            {primaryResult.formattedValue}
          </div>
          {primaryResult.formattedChange && (
            <div className="flex items-center text-xs font-mono font-bold mt-2">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 border ${
                  isPositive
                    ? "bg-milk-yellow text-black border-black"
                    : "bg-neutral-100 text-neutral-700 border-neutral-300"
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="w-3 h-3 mr-0.5" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 mr-0.5" />
                )}
                {primaryResult.formattedChange}
              </span>
              <span className="text-[10px] text-neutral-400 font-normal ml-2 uppercase">
                {primaryResult.comparisonLabel}
              </span>
            </div>
          )}
        </div>
      );
    }

    case "comparison": {
      return (
        <div className="grid grid-cols-2 gap-2 h-full items-center">
          {results.slice(0, 2).map((res) => (
            <div key={res.metricId} className="bg-neutral-50 p-2 border border-neutral-200">
              <div className="text-[10px] font-mono text-neutral-500 uppercase">{res.displayName}</div>
              <div className="text-lg font-display font-bold text-black">{res.formattedValue}</div>
            </div>
          ))}
        </div>
      );
    }

    case "line_chart":
    case "metric_comparison": {
      const chartData = mergeTrendData(results);
      const marks = visibleAnnotations(annotations, chartData.map((d) => String(d.date)));
      return (
        <div className="h-full w-full min-h-[140px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: chartTopMargin(marks.length > 0), right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#E2E2DF" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111111",
                  color: "#FFFFFF",
                  borderRadius: "0px",
                  border: "none",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
              />
              {results.length > 1 && <Legend wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }} />}
              {annotationMarkers(marks)}
              {results.map((res, i) => (
                <Line
                  key={res.metricId}
                  type="monotone"
                  dataKey={res.metricId}
                  name={res.displayName}
                  stroke={MILK_LINE_PALETTE[i % MILK_LINE_PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#FFE600", stroke: "#111111" }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case "area_chart": {
      const chartData = mergeTrendData(results);
      const marks = visibleAnnotations(annotations, chartData.map((d) => String(d.date)));
      return (
        <div className="h-full w-full min-h-[140px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: chartTopMargin(marks.length > 0), right: 5, left: -20, bottom: 0 }}>
              <defs>
                {results.map((res, i) => (
                  <linearGradient key={res.metricId} id={`areaGrad-${res.metricId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={MILK_LINE_PALETTE[i % MILK_LINE_PALETTE.length]} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={MILK_LINE_PALETTE[i % MILK_LINE_PALETTE.length]} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 2" stroke="#E2E2DF" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111111",
                  color: "#FFFFFF",
                  borderRadius: "0px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
              />
              {results.length > 1 && <Legend wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }} />}
              {annotationMarkers(marks)}
              {results.map((res, i) => (
                <Area
                  key={res.metricId}
                  type="monotone"
                  dataKey={res.metricId}
                  name={res.displayName}
                  stroke={MILK_LINE_PALETTE[i % MILK_LINE_PALETTE.length]}
                  fillOpacity={1}
                  fill={`url(#areaGrad-${res.metricId})`}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case "bar_chart": {
      const chartData = mergeTrendData(results).slice(-10);
      const marks = visibleAnnotations(annotations, chartData.map((d) => String(d.date)));
      return (
        <div className="h-full w-full min-h-[140px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: chartTopMargin(marks.length > 0), right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#E2E2DF" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111111",
                  color: "#FFFFFF",
                  borderRadius: "0px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
              />
              {results.length > 1 && <Legend wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }} />}
              {annotationMarkers(marks)}
              {results.map((res, i) => (
                <Bar
                  key={res.metricId}
                  dataKey={res.metricId}
                  name={res.displayName}
                  fill={MILK_LINE_PALETTE[i % MILK_LINE_PALETTE.length]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case "donut_chart": {
      const donutData = results.map((r, i) => ({
        name: r.displayName,
        value: r.value,
        color: MILK_PALETTE[i % MILK_PALETTE.length],
      }));
      return (
        <div className="h-full w-full min-h-[140px] flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                innerRadius={35}
                outerRadius={55}
                paddingAngle={2}
                dataKey="value"
              >
                {donutData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#111111" strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111111",
                  color: "#FFFFFF",
                  borderRadius: "0px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case "stacked_bar": {
      if (!stacked || stacked.series.length === 0) {
        return <EmptyBody message="No data to break down for this dimension and date range." />;
      }
      const marks = visibleAnnotations(annotations, stacked.data.map((d) => String(d.date)));
      return (
        <div className="h-full w-full min-h-[140px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stacked.data} margin={{ top: chartTopMargin(marks.length > 0), right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#E2E2DF" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }} />
              {annotationMarkers(marks)}
              {stacked.series.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={MILK_SERIES_PALETTE[i % MILK_SERIES_PALETTE.length]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case "ranking": {
      if (breakdownRows.length === 0) {
        return <EmptyBody message="No entities to rank for this dimension and date range." />;
      }
      const metricId = widget.dataConfig.metricIds[0] || "spend";
      const topValue = breakdownRows[0]?.values[metricId] || 0;
      return (
        <div className="overflow-y-auto h-full text-xs font-mono">
          <div className="border-b border-black bg-neutral-100 font-bold p-1.5 flex justify-between sticky top-0">
            <span>Rank / Entity</span>
            <span>{primaryResult?.displayName}</span>
          </div>
          <div className="divide-y divide-neutral-100">
            {breakdownRows.slice(0, 25).map((row, i) => (
              <div key={row.key} className="p-1.5 hover:bg-milk-subtle">
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="w-4 h-4 shrink-0 bg-black text-milk-yellow font-bold text-[10px] flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-sans font-semibold text-neutral-800 truncate" title={row.label}>
                      {row.label}
                    </span>
                  </div>
                  <span className="font-bold text-black shrink-0 tabular-nums">{row.formatted[metricId]}</span>
                </div>
                {/* Bar is scaled against the leader, not the total, so the
                    shape stays readable when one entity dominates. */}
                {topValue > 0 && (
                  <div className="mt-1 h-1 bg-neutral-100">
                    <div
                      className="h-full bg-milk-yellow border-r border-black"
                      style={{ width: `${Math.max(2, ((row.values[metricId] || 0) / topValue) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "heatmap": {
      if (breakdownRows.length === 0) {
        return <EmptyBody message="No data to plot for this dimension and date range." />;
      }
      const metricId = widget.dataConfig.metricIds[0] || "spend";
      const max = Math.max(...breakdownRows.map((r) => r.values[metricId] || 0), 0);
      return (
        <div className="h-full overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1 content-start">
          {breakdownRows.slice(0, 24).map((row) => {
            const value = row.values[metricId] || 0;
            const intensity = max > 0 ? value / max : 0;
            // Yellow tile whose opacity encodes magnitude; text flips to
            // black only once the ground is solid enough to carry it.
            return (
              <div
                key={row.key}
                title={`${row.label}: ${row.formatted[metricId]}`}
                className="border border-neutral-200 p-1.5 flex flex-col justify-between min-h-[52px]"
                style={{ backgroundColor: `rgba(255, 230, 0, ${0.12 + intensity * 0.88})` }}
              >
                <span className="text-[9px] font-sans text-neutral-800 leading-tight line-clamp-2">{row.label}</span>
                <span className="text-[11px] font-mono font-bold text-black tabular-nums">
                  {row.formatted[metricId]}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    case "campaign_table": {
      if (breakdownRows.length === 0) {
        return <EmptyBody message="No campaigns with data in this date range." />;
      }
      const metricIds = widget.dataConfig.metricIds.length ? widget.dataConfig.metricIds : ["spend"];
      const dimensionLabel = DIMENSION_LABELS[widget.dataConfig.breakdown || "campaign"];
      return (
        <div className="overflow-auto h-full text-xs font-mono">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0">
              <tr className="border-b border-black bg-neutral-100 font-bold">
                <th className="py-1.5 px-2">{dimensionLabel}</th>
                {metricIds.map((id) => (
                  <th key={id} className="py-1.5 px-2 text-right whitespace-nowrap">
                    {results.find((r) => r.metricId === id)?.displayName || id}
                  </th>
                ))}
                <th className="py-1.5 px-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((row) => (
                <tr key={row.key} className="border-b border-neutral-100 hover:bg-milk-subtle">
                  <td className="py-1.5 px-2 font-sans font-semibold text-neutral-800 max-w-[200px] truncate" title={row.label}>
                    {row.label}
                  </td>
                  {metricIds.map((id) => (
                    <td key={id} className="py-1.5 px-2 text-right font-bold text-black tabular-nums">
                      {row.formatted[id]}
                    </td>
                  ))}
                  <td className="py-1.5 px-2 text-right text-neutral-500 tabular-nums">
                    {row.sharePercentage > 0 ? `${row.sharePercentage.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "table": {
      return (
        <div className="overflow-x-auto h-full text-xs font-mono">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-black bg-neutral-100 font-bold">
                <th className="py-1.5 px-2">Metric</th>
                <th className="py-1.5 px-2 text-right">Value</th>
                <th className="py-1.5 px-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {results.map((res) => (
                <tr key={res.metricId} className="border-b border-neutral-100 hover:bg-milk-subtle">
                  <td className="py-1.5 px-2 font-semibold text-neutral-800">{res.displayName}</td>
                  <td className="py-1.5 px-2 text-right font-bold text-black tabular-nums">{res.formattedValue}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {res.formattedChange ? (
                      <span className={(res.changePercentage || 0) >= 0 ? "text-green-700 font-bold" : "text-neutral-500"}>
                        {res.formattedChange}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "ai_insight": {
      // Left in place so existing widgets of this type keep rendering, but
      // reduced to the one line that was ever real. The "Interpretation" and
      // "Recommendation" blocks that used to sit here were hardcoded strings,
      // identical for every metric, client and date range - a fabricated
      // conclusion under a label implying it was measured. Deliberately not
      // rebuilt here; that's a separate piece of work.
      return (
        <div className="h-full overflow-y-auto space-y-2 text-xs font-sans text-neutral-800 p-1">
          <div className="bg-milk-yellow/20 border-l-2 border-black p-2">
            <span className="font-mono text-[10px] font-bold uppercase block text-neutral-700">Observed</span>
            <p className="font-semibold text-black">
              {primaryResult
                ? `${primaryResult.displayName} is ${primaryResult.formattedValue}${
                    primaryResult.formattedChange
                      ? `, ${primaryResult.formattedChange} ${primaryResult.comparisonLabel || ""}`.trimEnd()
                      : ""
                  }.`
                : "No metric configured."}
            </p>
          </div>
          <p className="font-mono text-[10px] text-neutral-500 px-2 leading-relaxed">
            Interpretation is not generated automatically. Use a Text / Notes widget for commentary, or an
            annotation to record what changed on a given day.
          </p>
        </div>
      );
    }

    case "timeline": {
      // The annotation log itself, rather than a chart - "what did we change
      // and when", which is the question a timeline actually answers.
      if (annotations.length === 0) {
        return <EmptyBody message="No annotations yet. Add one from the dashboard toolbar to mark what changed." />;
      }
      return (
        <div className="h-full overflow-y-auto text-xs">
          <div className="relative pl-4 border-l-2 border-neutral-200 ml-1 space-y-3 py-1">
            {[...annotations]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((a) => (
                <div key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 bg-milk-yellow border border-black" />
                  <div className="font-mono text-[10px] text-neutral-500 uppercase">{a.date}</div>
                  <div className="font-sans font-semibold text-neutral-900 leading-tight">{a.title}</div>
                  {a.note && <div className="font-sans text-neutral-600 text-[11px] leading-snug">{a.note}</div>}
                </div>
              ))}
          </div>
        </div>
      );
    }

    case "image_logo": {
      const url = widget.displayConfig?.imageUrl;
      if (!url) {
        return <EmptyBody message="Add an image URL in this widget's settings." />;
      }
      return (
        <div className="h-full w-full flex items-center justify-center p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={widget.title} className="max-h-full max-w-full object-contain" />
        </div>
      );
    }

    case "text": {
      return (
        <div className="h-full p-2 text-xs font-sans text-neutral-700 leading-relaxed overflow-y-auto whitespace-pre-wrap">
          {widget.displayConfig?.noteText || "Click Edit to add custom client text notes."}
        </div>
      );
    }

    case "content_table": {
      if (contentResults.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-center text-xs font-mono text-neutral-400 py-4 px-2">
            <ImageOff className="w-6 h-6 mb-2 text-neutral-300" />
            No organic posts connected for this platform/date range.
          </div>
        );
      }

      return (
        <div className="h-full overflow-y-auto -mx-1 px-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {contentResults.map((post) => (
              <a
                key={post.id}
                href={post.permalinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group border border-neutral-200 hover:border-black bg-white flex flex-col text-left transition-all"
              >
                {/* Thumbnail - placeholder until a real platform connection
                    supplies post.thumbnailUrl (Meta Graph API full_picture) */}
                <div className="aspect-square w-full bg-neutral-100 flex items-center justify-center relative overflow-hidden">
                  {post.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.thumbnailUrl} alt={post.caption} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff className="w-6 h-6 text-neutral-300" />
                  )}
                  <span className="absolute top-1 left-1 bg-black text-white text-[9px] font-mono uppercase px-1.5 py-0.5">
                    {post.contentType}
                  </span>
                  <ExternalLink className="absolute top-1 right-1 w-3.5 h-3.5 text-white drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <div className="p-1.5 flex-1 flex flex-col gap-1">
                  <p className="text-[10px] font-sans text-neutral-700 line-clamp-2 leading-tight">{post.caption}</p>
                  <div className="mt-auto flex items-center gap-2 text-[9px] font-mono text-neutral-500">
                    <span className="flex items-center gap-0.5">
                      <Heart className="w-2.5 h-2.5" />
                      {formatMetricValue(post.metrics.likes || 0, "integer")}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MessageCircle className="w-2.5 h-2.5" />
                      {formatMetricValue(post.metrics.comments || 0, "integer")}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Share2 className="w-2.5 h-2.5" />
                      {formatMetricValue(post.metrics.shares || 0, "integer")}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      );
    }

    default:
      return <div className="text-xs font-mono text-neutral-400">Widget Type: {widget.widgetType}</div>;
  }
}
