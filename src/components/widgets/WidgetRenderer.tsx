"use client";

import React from "react";
import { WidgetConfig, RawDailyRecord, ContentPost, DateRangePreset } from "@/types";
import { queryWidgetData, queryContentPosts, formatMetricValue } from "@/lib/query-engine";
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
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Sparkles, AlertCircle, ImageOff, ExternalLink, Heart, MessageCircle, Share2 } from "lucide-react";

interface Props {
  widget: WidgetConfig;
  records: RawDailyRecord[];
  contentPosts?: ContentPost[];
  globalDateRange: DateRangePreset;
  onEdit?: (widget: WidgetConfig) => void;
  onDelete?: (widgetId: string) => void;
  isEditMode?: boolean;
  /** agency markup %, only ever passed for the client-facing perspective */
  markupPercentage?: number;
}

const MILK_PALETTE = ["#FFE600", "#111111", "#666666", "#999999", "#CCCCCC"];

export function WidgetRenderer({
  widget,
  records,
  contentPosts = [],
  globalDateRange,
  onEdit,
  onDelete,
  isEditMode,
  markupPercentage,
}: Props) {
  const dataResults = queryWidgetData(records, widget.dataConfig, globalDateRange, markupPercentage);
  const contentResults =
    widget.widgetType === "content_table"
      ? queryContentPosts(contentPosts, widget.dataConfig, globalDateRange)
      : [];

  return (
    <div className="h-full w-full bg-white border border-neutral-200 flex flex-col justify-between p-4 transition-all hover:border-neutral-400 group relative">
      {/* Edit Mode Header Overlay Actions */}
      {isEditMode && (
        <div
          className="no-drag absolute top-2 right-2 z-20 flex items-center space-x-1 bg-milk-bg border border-neutral-300 p-1 opacity-90 group-hover:opacity-100"
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
      {widget.displayConfig?.showTitle !== false && (
        <div className="mb-2 flex items-center justify-between border-b border-neutral-100 pb-2">
          <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-neutral-800 flex items-center gap-1.5">
            {widget.widgetType === "ai_insight" && <Sparkles className="w-3.5 h-3.5 text-black fill-milk-yellow" />}
            {widget.title}
          </h4>
          <span className="text-[10px] font-mono text-neutral-500 uppercase px-1.5 py-0.5 bg-neutral-100 border border-neutral-200">
            {widget.dataConfig.platform}
          </span>
        </div>
      )}

      {/* Widget Content Body */}
      <div className="flex-1 w-full overflow-hidden flex flex-col justify-center">
        {renderWidgetBody(widget, dataResults, contentResults)}
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

function renderWidgetBody(
  widget: WidgetConfig,
  results: ReturnType<typeof queryWidgetData>,
  contentResults: ContentPost[]
) {
  const primaryResult = results[0];

  if (
    !primaryResult &&
    widget.widgetType !== "text" &&
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
              <span className="text-[10px] text-neutral-400 font-normal ml-2 uppercase">vs prev period</span>
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
      const chartData = primaryResult.trendData || [];
      return (
        <div className="h-full w-full min-h-[140px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
              <Line
                type="monotone"
                dataKey="value"
                name={primaryResult.displayName}
                stroke="#111111"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#FFE600", stroke: "#111111" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case "area_chart": {
      const chartData = primaryResult.trendData || [];
      return (
        <div className="h-full w-full min-h-[140px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="milkYellowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFE600" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#FFE600" stopOpacity={0.0} />
                </linearGradient>
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
              <Area
                type="monotone"
                dataKey="value"
                name={primaryResult.displayName}
                stroke="#111111"
                fillOpacity={1}
                fill="url(#milkYellowGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case "bar_chart": {
      const chartData = (primaryResult.trendData || []).slice(-10);
      return (
        <div className="h-full w-full min-h-[140px] pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
              <Bar dataKey="value" name={primaryResult.displayName} fill="#111111" />
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

    case "ranking": {
      return (
        <div className="overflow-y-auto h-full text-xs font-mono">
          <div className="border-b border-black bg-neutral-100 font-bold p-1.5 flex justify-between">
            <span>Rank / Entity</span>
            <span>{primaryResult.displayName}</span>
          </div>
          <div className="divide-y divide-neutral-100">
            {[
              { rank: 1, name: "Summer Glow Video Ad", val: primaryResult.formattedValue },
              { rank: 2, name: "Advantage+ Shopping Campaign", val: "78.4%" },
              { rank: 3, name: "Reels Viral Engagement #4", val: "62.1%" },
              { rank: 4, name: "Brand Reach Retargeting", val: "45.0%" },
              { rank: 5, name: "Organic Community Reel", val: "31.2%" },
            ].map((item) => (
              <div key={item.rank} className="p-1.5 flex justify-between items-center hover:bg-milk-subtle">
                <div className="flex items-center space-x-2">
                  <span className="w-4 h-4 bg-black text-milk-yellow font-bold text-[10px] flex items-center justify-center">
                    {item.rank}
                  </span>
                  <span className="font-sans font-semibold text-neutral-800 truncate max-w-[140px]">{item.name}</span>
                </div>
                <span className="font-bold text-black">{item.val}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "table":
    case "campaign_table": {
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
                  <td className="py-1.5 px-2 text-right font-bold text-black">{res.formattedValue}</td>
                  <td className="py-1.5 px-2 text-right">
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
      return (
        <div className="h-full overflow-y-auto space-y-2 text-xs font-sans text-neutral-800 p-1">
          <div className="bg-milk-yellow/20 border-l-2 border-black p-2">
            <span className="font-mono text-[10px] font-bold uppercase block text-neutral-700">Fact</span>
            <p className="font-semibold text-black">
              {primaryResult.displayName} shifted by {primaryResult.formattedChange || "0%"} in the current period.
            </p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 p-2">
            <span className="font-mono text-[10px] font-bold uppercase block text-neutral-500">Interpretation</span>
            <p className="text-neutral-700">
              Delivery trends indicate optimal audience engagement with creative assets.
            </p>
          </div>
          <div className="bg-neutral-100 p-2 border border-neutral-200">
            <span className="font-mono text-[10px] font-bold uppercase block text-neutral-500">Recommendation</span>
            <p className="text-neutral-900 font-semibold">
              Maintain current allocation and evaluate secondary messaging angles.
            </p>
          </div>
        </div>
      );
    }

    case "text": {
      return (
        <div className="h-full p-2 text-xs font-sans text-neutral-700 leading-relaxed overflow-y-auto">
          {widget.displayConfig?.noteText || "Double-click edit to add custom client text notes."}
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
