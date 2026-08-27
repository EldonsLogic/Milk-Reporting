import { Dashboard, RawDailyRecord } from "@/types";
import { queryWidgetData, queryBreakdown, QueryContext } from "./query-engine";
import { getMetricById } from "./metric-catalog";

/**
 * Escapes a CSV field. Values are always quoted rather than conditionally -
 * simpler to reason about, and it removes any chance of a campaign name
 * containing a comma silently shifting every column after it.
 *
 * A leading =, +, - or @ is prefixed with a single quote: spreadsheet apps
 * interpret those as formulas, so an imported campaign name like
 * "=cmd|..." would execute rather than display. This is CSV injection and
 * the data here comes from external ad platforms, not from us.
 */
function csvField(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function csvRows(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

/** Triggers a browser download of a generated CSV. */
function downloadCsv(filename: string, content: string) {
  // Prefixed with a UTF-8 BOM so Excel opens accented campaign names
  // correctly instead of mojibake.
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dashboard";
}

/**
 * Exports every widget on the dashboard's active page as CSV: one summary
 * block per widget with its metrics, plus a per-entity breakdown for widgets
 * that have one. Markup is applied exactly as the on-screen view applies it,
 * so an export taken from the client perspective matches what the client saw.
 */
export function exportDashboardCsv(
  dashboard: Dashboard,
  records: RawDailyRecord[],
  ctx: QueryContext,
  pageIndex = 0
) {
  const page = dashboard.pages[pageIndex];
  if (!page) return;

  const rows: (string | number | null | undefined)[][] = [];
  rows.push([dashboard.title, page.title]);
  rows.push(["Exported", new Date().toISOString()]);
  rows.push(["Date range", ctx.globalDateRange || "last_30_days"]);
  if (ctx.globalCustomBounds) {
    rows.push(["Custom range", `${ctx.globalCustomBounds.start} to ${ctx.globalCustomBounds.end}`]);
  }
  if (ctx.markupPercentage) {
    rows.push(["Markup applied", `${ctx.markupPercentage}%`]);
  }
  rows.push([]);

  for (const widget of page.widgets) {
    if (widget.widgetType === "text" || widget.widgetType === "image_logo") continue;

    rows.push([widget.title]);

    const isBreakdown = ["campaign_table", "ranking", "heatmap"].includes(widget.widgetType);
    if (isBreakdown) {
      const dimension = widget.dataConfig.breakdown || "campaign";
      const breakdownRows = queryBreakdown(records, widget.dataConfig, ctx, dimension);
      const metricIds = widget.dataConfig.metricIds.length ? widget.dataConfig.metricIds : ["spend"];

      rows.push([
        dimension,
        ...metricIds.map((id) => getMetricById(id)?.displayName || id),
        "Share %",
      ]);
      for (const row of breakdownRows) {
        rows.push([
          row.label,
          // Raw numbers, not the display-formatted "1.2k" - a spreadsheet
          // needs values it can sum, which formatted strings aren't.
          ...metricIds.map((id) => row.values[id] ?? 0),
          row.sharePercentage > 0 ? Number(row.sharePercentage.toFixed(2)) : "",
        ]);
      }
    } else {
      const results = queryWidgetData(records, widget.dataConfig, ctx);
      rows.push(["Metric", "Value", "Previous", "Change %"]);
      for (const res of results) {
        rows.push([
          res.displayName,
          res.value,
          res.previousValue ?? "",
          res.changePercentage != null ? Number(res.changePercentage.toFixed(2)) : "",
        ]);
      }
    }
    rows.push([]);
  }

  downloadCsv(`${slugify(dashboard.title)}-${slugify(page.title)}.csv`, csvRows(rows));
}

/** Exports the underlying daily records themselves, unaggregated. */
export function exportRawRecordsCsv(clientName: string, records: RawDailyRecord[]) {
  if (records.length === 0) return;

  // Union of keys across all records - paid and organic rows carry different
  // fields, so keying off the first record alone would drop columns.
  const columns = Array.from(
    records.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const rows: (string | number | null | undefined)[][] = [columns];
  for (const record of records) {
    const bag = record as unknown as Record<string, unknown>;
    rows.push(
      columns.map((col) => {
        const value = bag[col];
        return typeof value === "string" || typeof value === "number" ? value : "";
      })
    );
  }

  downloadCsv(`${slugify(clientName)}-raw-records.csv`, csvRows(rows));
}
