import { DateRangePreset } from "@/types";

/**
 * Single source of truth for the date presets offered in the UI. Previously
 * the dashboard toolbar and the widget config drawer each hardcoded their own
 * shorter list, so seven of the presets the type declares - including "custom"
 * - were unreachable from anywhere in the app.
 */
export const DATE_PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_14_days", label: "Last 14 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "previous_month", label: "Previous Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "previous_quarter", label: "Previous Quarter" },
  { value: "year_to_date", label: "Year to Date" },
  { value: "previous_year", label: "Previous Year" },
  { value: "custom", label: "Custom Range…" },
];

export const COMPARISON_OPTIONS: { value: "previous_period" | "previous_year" | "none"; label: string }[] = [
  { value: "previous_period", label: "vs Previous Period" },
  { value: "previous_year", label: "vs Same Period Last Year" },
  { value: "none", label: "No Comparison" },
];

export const BREAKDOWN_OPTIONS: { value: string; label: string }[] = [
  { value: "campaign", label: "Campaign" },
  { value: "adset", label: "Ad Set" },
  { value: "ad", label: "Ad" },
  { value: "platform", label: "Platform" },
  { value: "objective", label: "Objective" },
  { value: "account", label: "Account" },
  // Google Analytics dimensions - inert on paid/organic widgets, which have
  // no channel or device value and simply group as one empty bucket.
  { value: "channel", label: "Channel (GA4)" },
  { value: "device", label: "Device (GA4)" },
];
