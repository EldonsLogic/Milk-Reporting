"use client";

import React, { useEffect, useState } from "react";
import { METRIC_CATALOG } from "@/lib/metric-catalog";
import { loadCustomMetrics, saveCustomMetric, deleteCustomMetric, slugifyMetricId } from "@/lib/custom-metrics";
import { validateFormula } from "@/lib/formula-evaluator";
import { MetricCategory, MetricDefinition, Platform, DataType } from "@/types";
import { Search, Filter, Database, Code, Info, Plus, Trash2, X } from "lucide-react";

const CATEGORIES: MetricCategory[] = [
  "Media Delivery",
  "Traffic",
  "Video",
  "Engagement",
  "Social Audience",
  "Content",
  "Conversion",
  "Value",
];
const DATA_TYPES: DataType[] = ["integer", "currency", "percentage", "duration_seconds", "ratio", "text"];

interface DraftMetric {
  displayName: string;
  category: MetricCategory;
  dataType: DataType;
  formula: string;
  description: string;
}

const EMPTY_DRAFT: DraftMetric = {
  displayName: "",
  category: "Value",
  dataType: "currency",
  formula: "",
  description: "",
};

export function MetricCatalogBrowser() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | "All">("All");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "All">("All");
  const [customMetrics, setCustomMetrics] = useState<MetricDefinition[]>([]);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [draft, setDraft] = useState<DraftMetric>(EMPTY_DRAFT);
  const [formulaError, setFormulaError] = useState<string | null>(null);

  useEffect(() => {
    setCustomMetrics(loadCustomMetrics());
  }, []);

  const categories: (MetricCategory | "All")[] = ["All", ...CATEGORIES];

  const allMetrics = [...METRIC_CATALOG, ...customMetrics];

  const filteredMetrics = allMetrics.filter((m) => {
    const matchesSearch =
      m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === "All" || m.category === selectedCategory;
    const matchesPlatform =
      selectedPlatform === "All" || m.platform === "cross_platform" || m.platform === selectedPlatform;

    return matchesSearch && matchesCategory && matchesPlatform;
  });

  const handleSaveCustomMetric = () => {
    if (!draft.displayName.trim() || !draft.formula.trim()) return;
    const check = validateFormula(draft.formula);
    if (!check.valid) {
      setFormulaError(check.error || "Invalid formula");
      return;
    }

    const metric: MetricDefinition = {
      id: slugifyMetricId(draft.displayName),
      displayName: draft.displayName.trim(),
      platform: "cross_platform",
      category: draft.category,
      dataType: draft.dataType,
      isDerived: true,
      formula: draft.formula.trim(),
      description: draft.description.trim() || "Agency-defined custom metric.",
      supportedDimensions: ["date", "platform", "campaign"],
    };

    const updated = saveCustomMetric(metric);
    setCustomMetrics(updated);
    setIsBuilderOpen(false);
    setDraft(EMPTY_DRAFT);
    setFormulaError(null);
  };

  const handleDeleteCustomMetric = (id: string) => {
    if (!confirm("Delete this custom metric? Any widgets using it will show no data.")) return;
    setCustomMetrics(deleteCustomMetric(id));
  };

  return (
    <div className="p-6 bg-milk-bg min-h-screen">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <Database className="w-8 h-8 text-black" />
            <h1 className="text-3xl font-display font-black tracking-tight text-black">
              Normalized Metric Catalog
            </h1>
          </div>
          <p className="text-sm font-mono text-neutral-600 max-w-3xl">
            The agency metric universe. All raw and derived metrics exposed by connected platform APIs
            (Meta Ads, Google Ads, TikTok Ads, Facebook Pages &amp; Instagram), plus any custom metrics you
            define. The dashboard builder decides which of these metrics matter for each client.
          </p>
        </div>
        <button
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setFormulaError(null);
            setIsBuilderOpen(true);
          }}
          className="px-4 py-2 bg-milk-yellow text-black border border-black font-mono text-xs font-bold shadow-crisp-sm flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Custom Metric
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="max-w-6xl mx-auto bg-white border border-black p-4 mb-6 shadow-crisp-sm flex flex-col md:flex-row gap-4 justify-between items-center text-xs font-mono">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search metric name, ID, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center space-x-1">
            <Filter className="w-3.5 h-3.5 text-neutral-500" />
            <span className="font-bold text-neutral-700">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as MetricCategory | "All")}
              className="p-1.5 border border-neutral-300 focus:border-black bg-milk-bg"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Platform Filter */}
          <div className="flex items-center space-x-1">
            <span className="font-bold text-neutral-700">Platform:</span>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value as Platform | "All")}
              className="p-1.5 border border-neutral-300 focus:border-black bg-milk-bg"
            >
              <option value="All">All Platforms</option>
              <option value="meta">Meta Ads</option>
              <option value="google_ads">Google Ads</option>
              <option value="tiktok_ads">TikTok Ads</option>
              <option value="instagram">Instagram</option>
              <option value="cross_platform">Cross Platform</option>
            </select>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMetrics.map((metric) => {
          const isCustom = metric.id.startsWith("custom_");
          return (
            <div
              key={metric.id}
              className="bg-white border border-neutral-300 p-4 hover:border-black transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 border border-black ${
                      isCustom ? "bg-black text-milk-yellow" : "bg-milk-yellow text-black"
                    }`}
                  >
                    {isCustom ? "Custom" : metric.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-500 uppercase">{metric.platform}</span>
                    {isCustom && (
                      <button
                        onClick={() => handleDeleteCustomMetric(metric.id)}
                        title="Delete custom metric"
                        className="text-neutral-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {isCustom && (
                  <span className="text-[10px] font-mono text-neutral-500 uppercase block mb-1">
                    {metric.category}
                  </span>
                )}
                <h3 className="text-base font-display font-bold text-black mb-1">{metric.displayName}</h3>
                <p className="text-xs font-sans text-neutral-600 mb-3">{metric.description}</p>
              </div>

              <div className="border-t border-neutral-100 pt-3 text-[11px] font-mono space-y-1">
                <div className="flex justify-between text-neutral-500">
                  <span>Metric ID:</span>
                  <span className="font-bold text-black">{metric.id}</span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Data Type:</span>
                  <span className="text-neutral-800 uppercase">{metric.dataType}</span>
                </div>
                {metric.isDerived && (
                  <div className="bg-neutral-50 p-2 border border-neutral-200 mt-2">
                    <div className="flex items-center space-x-1 text-black font-bold mb-0.5">
                      <Code className="w-3 h-3 text-neutral-700" />
                      <span>Safe Formula:</span>
                    </div>
                    <code className="text-[10px] text-neutral-800 block break-all">{metric.formula}</code>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Metric Builder Modal */}
      {isBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border-2 border-black max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-display font-extrabold uppercase text-black">Create Custom Metric</h3>
              <button onClick={() => setIsBuilderOpen(false)} className="text-neutral-400 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-mono text-neutral-500 mb-4">
              Combine fields from any connected data source into one metric.
            </p>

            <div className="space-y-4 text-xs font-mono">
              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Display Name</label>
                <input
                  type="text"
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  placeholder="Blended CPA (Meta + Google)"
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold uppercase text-neutral-800 mb-1">Category</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value as MetricCategory })}
                    className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold uppercase text-neutral-800 mb-1">Data Type</label>
                  <select
                    value={draft.dataType}
                    onChange={(e) => setDraft({ ...draft, dataType: e.target.value as DataType })}
                    className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg"
                  >
                    {DATA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Formula</label>
                <input
                  type="text"
                  value={draft.formula}
                  onChange={(e) => {
                    setDraft({ ...draft, formula: e.target.value });
                    setFormulaError(null);
                  }}
                  placeholder="spend / NULLIF(conversions, 0)"
                  className={`w-full p-2 border focus:outline-none bg-milk-bg font-mono text-xs ${
                    formulaError ? "border-red-500" : "border-neutral-300 focus:border-black"
                  }`}
                />
                {formulaError ? (
                  <p className="text-[11px] text-red-600 mt-1">{formulaError}</p>
                ) : (
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Use field names like spend, impressions, clicks, conversions, followersGained, etc. -
                    the same ones shown in other metrics&apos; Safe Formula. +, -, *, / and NULLIF(a, 0) for
                    safe division are supported.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold uppercase text-neutral-800 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
                />
              </div>

              <div className="flex items-start gap-2 bg-neutral-50 border border-neutral-200 p-2 text-neutral-600">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  This metric becomes selectable in every widget&apos;s metric picker immediately, across all
                  clients. Deleting it later will make any widget using it show no data.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsBuilderOpen(false)}
                className="px-4 py-1.5 border border-black font-mono text-xs font-bold hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomMetric}
                disabled={!draft.displayName.trim() || !draft.formula.trim()}
                className="px-4 py-1.5 border border-black bg-black text-milk-yellow font-mono text-xs font-bold hover:bg-neutral-900 disabled:opacity-40"
              >
                Save Metric
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
