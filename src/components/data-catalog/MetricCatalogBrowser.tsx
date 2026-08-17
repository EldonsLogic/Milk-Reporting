"use client";

import React, { useState } from "react";
import { METRIC_CATALOG } from "@/lib/metric-catalog";
import { MetricCategory, Platform } from "@/types";
import { Search, Filter, Database, Code, Info } from "lucide-react";

export function MetricCatalogBrowser() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | "All">("All");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "All">("All");

  const categories: (MetricCategory | "All")[] = [
    "All",
    "Media Delivery",
    "Traffic",
    "Video",
    "Engagement",
    "Social Audience",
    "Content",
    "Conversion",
    "Value",
  ];

  const filteredMetrics = METRIC_CATALOG.filter((m) => {
    const matchesSearch =
      m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === "All" || m.category === selectedCategory;
    const matchesPlatform =
      selectedPlatform === "All" || m.platform === "cross_platform" || m.platform === selectedPlatform;

    return matchesSearch && matchesCategory && matchesPlatform;
  });

  return (
    <div className="p-6 bg-milk-bg min-h-screen">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Database className="w-8 h-8 text-black" />
          <h1 className="text-3xl font-display font-black tracking-tight text-black">
            Normalized Metric Catalog
          </h1>
        </div>
        <p className="text-sm font-mono text-neutral-600 max-w-3xl">
          The agency metric universe. All raw and derived metrics exposed by connected platform APIs
          (Meta Ads, Google Ads, TikTok Ads, Facebook Pages & Instagram). The dashboard builder decides
          which of these metrics matter for each client.
        </p>
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
        {filteredMetrics.map((metric) => (
          <div
            key={metric.id}
            className="bg-white border border-neutral-300 p-4 hover:border-black transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-milk-yellow text-black border border-black">
                  {metric.category}
                </span>
                <span className="text-[10px] font-mono text-neutral-500 uppercase">
                  {metric.platform}
                </span>
              </div>
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
        ))}
      </div>
    </div>
  );
}
