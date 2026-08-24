import { MetricDefinition } from "@/types";

const STORAGE_KEY = "milk-reporting:custom-metrics";

// Agency-defined metrics combining fields across data sources into one
// formula (e.g. blended CPA across Meta + Google). Stored client-side for
// now, same as dashboards - moves to Supabase alongside everything else in
// Phase 2, at which point this becomes a thin wrapper over a real table.
export function loadCustomMetrics(): MetricDefinition[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MetricDefinition[];
  } catch {
    return [];
  }
}

export function saveCustomMetric(metric: MetricDefinition): MetricDefinition[] {
  const existing = loadCustomMetrics().filter((m) => m.id !== metric.id);
  const updated = [...existing, metric];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function deleteCustomMetric(id: string): MetricDefinition[] {
  const updated = loadCustomMetrics().filter((m) => m.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/** Metric ids are user-typed - normalize to a safe, unique identifier. */
export function slugifyMetricId(displayName: string): string {
  return (
    "custom_" +
    displayName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
  );
}
