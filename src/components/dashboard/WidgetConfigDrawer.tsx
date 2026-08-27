"use client";

import React, { useState } from "react";
import {
  WidgetConfig,
  WidgetType,
  Platform,
  DateRangePreset,
  CustomDateRange,
  ComparisonPreset,
  BreakdownDimension,
} from "@/types";
import { getAllMetrics } from "@/lib/metric-catalog";
import { getDateBounds, toDateStr } from "@/lib/query-engine";
import { DATE_PRESET_OPTIONS, COMPARISON_OPTIONS, BREAKDOWN_OPTIONS } from "@/lib/date-presets";
import { X, Check } from "lucide-react";

interface Props {
  widget: WidgetConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedWidget: WidgetConfig) => void;
}

const WIDGET_TYPES: { type: WidgetType; label: string }[] = [
  { type: "kpi_card", label: "KPI Card" },
  { type: "number", label: "Number Readout" },
  { type: "percentage", label: "Percentage Readout" },
  { type: "comparison", label: "Comparison Card" },
  { type: "line_chart", label: "Line Chart" },
  { type: "area_chart", label: "Area Chart" },
  { type: "bar_chart", label: "Bar Chart" },
  { type: "stacked_bar", label: "Stacked Bar" },
  { type: "metric_comparison", label: "Multi-Metric Trend" },
  { type: "donut_chart", label: "Donut Share Chart" },
  { type: "campaign_table", label: "Campaign Table" },
  { type: "ranking", label: "Ranked List" },
  { type: "heatmap", label: "Heatmap Grid" },
  { type: "table", label: "Metric Table" },
  { type: "content_table", label: "Content Post Grid" },
  { type: "timeline", label: "Annotation Timeline" },
  { type: "text", label: "Text / Client Notes" },
  { type: "image_logo", label: "Image / Logo" },
  { type: "ai_insight", label: "AI Diagnostic Insight" },
];

/** Widget types whose body is grouped by a dimension rather than aggregated. */
const BREAKDOWN_TYPES = new Set<WidgetType>(["campaign_table", "ranking", "heatmap", "stacked_bar"]);
/** Widget types that plot a series and therefore support a comparison period. */
const COMPARISON_TYPES = new Set<WidgetType>([
  "kpi_card",
  "number",
  "percentage",
  "comparison",
  "table",
  "line_chart",
  "area_chart",
  "bar_chart",
  "metric_comparison",
]);

export function WidgetConfigDrawer({ widget, isOpen, onClose, onSave }: Props) {
  // Lazy init is safe here: this drawer only ever mounts after a user
  // interaction (never during SSR), so it picks up any custom metric
  // created since the app loaded each time it's opened.
  const [availableMetrics] = useState(() => getAllMetrics());
  const [title, setTitle] = useState(widget.title);
  const [widgetType, setWidgetType] = useState<WidgetType>(widget.widgetType);
  const [platform, setPlatform] = useState<Platform | "all">(widget.dataConfig.platform);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(widget.dataConfig.metricIds);
  const [dateRangeMode, setDateRangeMode] = useState<"inherit_dashboard" | "override">(
    widget.dataConfig.dateRangeMode || "inherit_dashboard"
  );
  const [customDateRange, setCustomDateRange] = useState<DateRangePreset>(
    widget.dataConfig.customDateRange || "last_30_days"
  );
  const [customBounds, setCustomBounds] = useState<CustomDateRange>(
    widget.dataConfig.customDateBounds || {
      start: toDateStr(getDateBounds("last_30_days").startDate),
      end: toDateStr(getDateBounds("last_30_days").endDate),
    }
  );
  const [comparisonMode, setComparisonMode] = useState<ComparisonPreset>(
    widget.dataConfig.comparisonMode || "previous_period"
  );
  const [breakdown, setBreakdown] = useState<BreakdownDimension>(
    widget.dataConfig.breakdown || "campaign"
  );
  const [limit, setLimit] = useState<string>(
    widget.dataConfig.limit != null ? String(widget.dataConfig.limit) : ""
  );
  const [noteText, setNoteText] = useState(widget.displayConfig?.noteText || "");
  const [imageUrl, setImageUrl] = useState(widget.displayConfig?.imageUrl || "");

  if (!isOpen) return null;

  const showsBreakdown = BREAKDOWN_TYPES.has(widgetType);
  const showsComparison = COMPARISON_TYPES.has(widgetType);
  const showsMetrics = widgetType !== "text" && widgetType !== "image_logo" && widgetType !== "timeline";

  const toggleMetric = (id: string) => {
    if (selectedMetrics.includes(id)) {
      if (selectedMetrics.length > 1) {
        setSelectedMetrics(selectedMetrics.filter((m) => m !== id));
      }
    } else {
      setSelectedMetrics([...selectedMetrics, id]);
    }
  };

  const handleSave = () => {
    const parsedLimit = parseInt(limit, 10);
    onSave({
      ...widget,
      title,
      widgetType,
      dataConfig: {
        ...widget.dataConfig,
        platform,
        metricIds: selectedMetrics,
        dateRangeMode,
        customDateRange,
        customDateBounds: customDateRange === "custom" ? customBounds : undefined,
        comparisonMode,
        breakdown,
        limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      },
      displayConfig: {
        ...widget.displayConfig,
        noteText: noteText || undefined,
        imageUrl: imageUrl || undefined,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between border-l border-black p-6 overflow-y-auto">
        <div>
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-black pb-4 mb-6">
            <div>
              <h3 className="text-lg font-display font-bold uppercase tracking-tight text-black">Configure Widget</h3>
              <p className="text-xs font-mono text-neutral-500">Customize metrics, visuals & parameters</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 border border-transparent hover:border-black">
              <X className="w-5 h-5 text-black" />
            </button>
          </div>

          <div className="space-y-6 text-xs font-mono">
            {/* Widget Title */}
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Widget Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm font-semibold"
              />
            </div>

            {/* Widget Visualization Type */}
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Display Type</label>
              <select
                value={widgetType}
                onChange={(e) => setWidgetType(e.target.value as WidgetType)}
                className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
              >
                {WIDGET_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Platform Selection */}
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Data Source Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | "all")}
                className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
              >
                <option value="all">All Connected Platforms</option>
                <option value="meta">Meta Ads</option>
                <option value="google_ads">Google Ads</option>
                <option value="tiktok_ads">TikTok Ads</option>
                <option value="facebook_page">Facebook Organic Page</option>
                <option value="instagram">Instagram Business Organic</option>
              </select>
            </div>

            {/* Breakdown dimension - only for widgets that group by entity */}
            {showsBreakdown && (
              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Break Down By</label>
                <select
                  value={breakdown}
                  onChange={(e) => setBreakdown(e.target.value as BreakdownDimension)}
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
                >
                  {BREAKDOWN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-neutral-500 mt-1 font-sans">
                  One row per {BREAKDOWN_OPTIONS.find((o) => o.value === breakdown)?.label.toLowerCase()}. Organic
                  rows have no campaign, so they group under &quot;(not set)&quot;.
                </p>
              </div>
            )}

            {/* Row cap for breakdown widgets */}
            {showsBreakdown && (
              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Row Limit (optional)</label>
                <input
                  type="number"
                  min={1}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="All rows"
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
                />
              </div>
            )}

            {/* Image URL - image_logo widgets only */}
            {widgetType === "image_logo" && (
              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Image URL</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
                />
              </div>
            )}

            {/* Note text - text widgets, and as a caption on anything else */}
            {widgetType === "text" ? (
              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Note Text</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={6}
                  placeholder="Commentary for the client..."
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm resize-y"
                />
              </div>
            ) : (
              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Footnote (optional)</label>
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Caption shown under this widget"
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
                />
              </div>
            )}

            {/* Metric Selection Picker */}
            {showsMetrics && (
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Select Metric(s) from Catalog</label>
              <div className="max-h-48 overflow-y-auto border border-neutral-200 p-2 space-y-1 bg-neutral-50">
                {availableMetrics.map((m) => {
                  const isSelected = selectedMetrics.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => toggleMetric(m.id)}
                      className={`flex items-center justify-between p-1.5 cursor-pointer border ${
                        isSelected
                          ? "bg-milk-yellow border-black font-bold text-black"
                          : "bg-white border-neutral-200 hover:border-neutral-400 text-neutral-700"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[11px] font-sans">{m.displayName}</span>
                        <span className="text-[9px] text-neutral-500 font-mono">{m.category} • {m.dataType}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-black" />}
                    </div>
                  );
                })}
              </div>
              {showsBreakdown && selectedMetrics.length > 0 && (
                <p className="text-[10px] text-neutral-500 mt-1 font-sans">
                  Rows are sorted by the first selected metric.
                </p>
              )}
            </div>
            )}

            {/* Comparison period */}
            {showsComparison && (
              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Compare Against</label>
                <select
                  value={comparisonMode}
                  onChange={(e) => setComparisonMode(e.target.value as ComparisonPreset)}
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
                >
                  {COMPARISON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Range Mode */}
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Date Range Behavior</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDateRangeMode("inherit_dashboard")}
                  className={`flex-1 py-1.5 border text-center font-bold ${
                    dateRangeMode === "inherit_dashboard"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-neutral-300"
                  }`}
                >
                  Inherit Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setDateRangeMode("override")}
                  className={`flex-1 py-1.5 border text-center font-bold ${
                    dateRangeMode === "override"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-neutral-300"
                  }`}
                >
                  Override Range
                </button>
              </div>
            </div>

            {dateRangeMode === "override" && (
              <div className="space-y-2">
                <div>
                  <label className="block font-bold uppercase text-neutral-800 mb-1">Widget Date Range</label>
                  <select
                    value={customDateRange}
                    onChange={(e) => setCustomDateRange(e.target.value as DateRangePreset)}
                    className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
                  >
                    {DATE_PRESET_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {customDateRange === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold uppercase text-neutral-800 mb-1">From</label>
                      <input
                        type="date"
                        value={customBounds.start}
                        max={customBounds.end}
                        onChange={(e) => setCustomBounds({ ...customBounds, start: e.target.value })}
                        className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
                      />
                    </div>
                    <div>
                      <label className="block font-bold uppercase text-neutral-800 mb-1">To</label>
                      <input
                        type="date"
                        value={customBounds.end}
                        min={customBounds.start}
                        onChange={(e) => setCustomBounds({ ...customBounds, end: e.target.value })}
                        className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="pt-4 border-t border-black flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 font-mono text-xs font-bold border border-neutral-300 hover:border-black bg-neutral-100 text-black"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 font-mono text-xs font-bold bg-milk-yellow border border-black hover:bg-milk-yellowHover text-black shadow-crisp-sm"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
