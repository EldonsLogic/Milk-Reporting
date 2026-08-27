"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Client, RawDailyRecord, DateRangePreset } from "@/types";
import { fetchRecords, fetchRecentSyncLogs, fetchAgencySeats, SyncLog, AgencySeat } from "@/lib/supabase-data";
import { AgencySeatManager } from "./AgencySeatManager";
import { queryWidgetData, getDateBounds, toDateStr } from "@/lib/query-engine";
import { getMetricById } from "@/lib/metric-catalog";
import { DATE_PRESET_OPTIONS } from "@/lib/date-presets";
import { getErrorMessage } from "@/lib/errors";
import { exportRawRecordsCsv } from "@/lib/csv-export";
import {
  Calendar,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Download,
  Users,
  Loader2,
  History,
} from "lucide-react";

interface Props {
  clients: Client[];
  onSelectClient: (client: Client) => void;
  agencyId: string;
}

/**
 * Metrics shown per client on the portfolio table. Deliberately a small fixed
 * set rather than configurable: this view answers "which accounts need my
 * attention this week", and a comparable table needs the same columns for
 * every client.
 */
const OVERVIEW_METRICS = ["spend", "impressions", "reach", "clicks", "conversions"];

interface ClientRollup {
  client: Client;
  values: Record<string, { formatted: string; change?: number }>;
  recordCount: number;
}

export function AgencyOverview({ clients, onSelectClient, agencyId }: Props) {
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [rollups, setRollups] = useState<ClientRollup[]>([]);
  const [allRecords, setAllRecords] = useState<Record<string, RawDailyRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [seats, setSeats] = useState<AgencySeat[]>([]);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"portfolio" | "health" | "team">("portfolio");

  const window = useMemo(() => {
    const { startDate, endDate } = getDateBounds(preset);
    return { start: toDateStr(startDate), end: toDateStr(endDate) };
  }, [preset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // One request per client rather than a single cross-client query,
      // because RLS scopes metric tables by client and the app has no
      // agency-wide read path into them.
      const perClient = await Promise.all(
        clients.map(async (client) => ({
          client,
          records: await fetchRecords(client.id, window),
        }))
      );

      const recordMap: Record<string, RawDailyRecord[]> = {};
      const computed: ClientRollup[] = perClient.map(({ client, records }) => {
        recordMap[client.id] = records;
        const results = queryWidgetData(
          records,
          { platform: "all", metricIds: OVERVIEW_METRICS },
          { globalDateRange: preset }
        );
        const values: Record<string, { formatted: string; change?: number }> = {};
        for (const res of results) {
          values[res.metricId] = { formatted: res.formattedValue, change: res.changePercentage };
        }
        return { client, values, recordCount: records.length };
      });

      setAllRecords(recordMap);
      setRollups(computed);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load agency overview"));
    } finally {
      setLoading(false);
    }
  }, [clients, window, preset]);

  useEffect(() => {
    load();
  }, [load]);

  const loadOps = useCallback(async () => {
    try {
      const [logs, seatList] = await Promise.all([fetchRecentSyncLogs(100), fetchAgencySeats(agencyId)]);
      setSyncLogs(logs);
      setSeats(seatList);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load sync history"));
    }
  }, [agencyId]);

  useEffect(() => {
    loadOps();
  }, [loadOps]);

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncMessage(null);
    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");

      const failed = (json.details || []).filter((d: any) => d.status === "error").length;
      const ok = (json.details || []).length - failed;
      setSyncMessage(
        `${ok} connection${ok === 1 ? "" : "s"} synced${failed ? `, ${failed} failed` : ""}.${
          json.note ? ` ${json.note}` : ""
        }`
      );
      await Promise.all([load(), loadOps()]);
    } catch (err) {
      setSyncMessage(getErrorMessage(err, "Sync failed"));
    } finally {
      setSyncingAll(false);
    }
  };

  const connectionsInError = syncLogs.filter((l) => l.status === "error");
  const staleClients = rollups.filter((r) => r.recordCount === 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-display font-black text-black">Agency Overview</h2>
          <p className="text-xs font-mono text-neutral-600 mt-1">
            Every client at once — performance, data health, and who has access.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1 bg-white border border-black px-2 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-neutral-700" />
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DateRangePreset)}
              className="bg-transparent focus:outline-none font-bold text-black cursor-pointer"
            >
              {DATE_PRESET_OPTIONS.filter((o) => o.value !== "custom").map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="px-3 py-1.5 bg-milk-yellow text-black border border-black font-bold shadow-crisp-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {syncingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync All
          </button>
        </div>
      </div>

      {syncMessage && (
        <p className="text-xs font-mono text-neutral-700 bg-neutral-100 border border-neutral-300 p-2 mb-3">
          {syncMessage}
        </p>
      )}
      {error && <p className="text-xs font-mono text-red-600 mb-3">{error}</p>}

      {/* Attention banner - the actual reason to open this screen */}
      {(connectionsInError.length > 0 || staleClients.length > 0) && (
        <div className="border-2 border-black bg-white shadow-crisp-sm p-3 mb-5 flex items-start gap-2 text-xs font-mono">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            {connectionsInError.length > 0 && (
              <p className="text-black font-bold">
                {connectionsInError.length} connection{connectionsInError.length === 1 ? "" : "s"} failed their last
                sync.
              </p>
            )}
            {staleClients.length > 0 && (
              <p className="text-neutral-700">
                No data in this range for: {staleClients.map((s) => s.client.name).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 mb-4 font-mono text-xs">
        {([
          ["portfolio", "Portfolio"],
          ["health", `Data Health${connectionsInError.length ? ` (${connectionsInError.length})` : ""}`],
          ["team", `Team (${seats.length})`],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-3 py-1.5 border font-bold ${
              tab === value
                ? "bg-black text-milk-yellow border-black"
                : "bg-white text-neutral-600 border-neutral-300 hover:border-black"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "portfolio" &&
        (loading ? (
          <p className="font-mono text-xs text-neutral-500">Loading client performance…</p>
        ) : rollups.length === 0 ? (
          <p className="font-mono text-xs text-neutral-500">No clients yet.</p>
        ) : (
          <div className="border border-black bg-white shadow-crisp-sm overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b-2 border-black bg-neutral-100">
                  <th className="py-2 px-3 font-bold">Client</th>
                  {OVERVIEW_METRICS.map((id) => (
                    <th key={id} className="py-2 px-3 font-bold text-right whitespace-nowrap">
                      {getMetricById(id)?.displayName || id}
                    </th>
                  ))}
                  <th className="py-2 px-3 font-bold text-right">Data</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map(({ client, values, recordCount }) => (
                  <tr
                    key={client.id}
                    onClick={() => onSelectClient(client)}
                    className="border-b border-neutral-100 hover:bg-milk-subtle cursor-pointer"
                  >
                    <td className="py-2 px-3">
                      <span className="font-sans font-semibold text-black">{client.name}</span>
                      <span className="block text-[10px] text-neutral-500 uppercase">{client.objectiveType}</span>
                    </td>
                    {OVERVIEW_METRICS.map((id) => (
                      <td key={id} className="py-2 px-3 text-right tabular-nums">
                        <span className="font-bold text-black">{values[id]?.formatted ?? "—"}</span>
                        {values[id]?.change != null && (
                          <span
                            className={`block text-[10px] ${
                              (values[id].change || 0) >= 0 ? "text-green-700" : "text-red-600"
                            }`}
                          >
                            {(values[id].change || 0) >= 0 ? "+" : ""}
                            {(values[id].change || 0).toFixed(1)}%
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right">
                      {recordCount === 0 ? (
                        <span className="text-red-600 font-bold">None</span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            exportRawRecordsCsv(client.name, allRecords[client.id] || []);
                          }}
                          title={`Export ${recordCount} raw rows as CSV`}
                          className="text-neutral-500 hover:text-black inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          {recordCount}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "health" && (
        <div className="border border-black bg-white shadow-crisp-sm">
          <div className="p-3 border-b border-neutral-200 flex items-center gap-2 font-mono text-xs text-neutral-600">
            <History className="w-3.5 h-3.5" />
            Last {syncLogs.length} sync attempts across every client.
          </div>
          {syncLogs.length === 0 ? (
            <p className="p-4 font-mono text-xs text-neutral-500">
              No syncs recorded yet. Run &quot;Sync All&quot; or sync an individual connection from Data Connections.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-black bg-neutral-100">
                    <th className="py-2 px-3 font-bold">When</th>
                    <th className="py-2 px-3 font-bold">Account</th>
                    <th className="py-2 px-3 font-bold">Platform</th>
                    <th className="py-2 px-3 font-bold">Trigger</th>
                    <th className="py-2 px-3 font-bold">Range</th>
                    <th className="py-2 px-3 font-bold text-right">Rows</th>
                    <th className="py-2 px-3 font-bold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.map((log) => (
                    <tr key={log.id} className="border-b border-neutral-100 align-top">
                      <td className="py-2 px-3 whitespace-nowrap text-neutral-600">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-sans">{log.accountName || "—"}</td>
                      <td className="py-2 px-3 uppercase">{log.platform}</td>
                      <td className="py-2 px-3 text-neutral-500">{log.triggerSource}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-neutral-500">
                        {log.rangeSince && log.rangeUntil ? `${log.rangeSince} → ${log.rangeUntil}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {log.recordsSynced}
                        {log.contentItemsSynced > 0 && (
                          <span className="text-neutral-500"> +{log.contentItemsSynced}p</span>
                        )}
                      </td>
                      <td className="py-2 px-3 max-w-xs">
                        {log.status === "success" ? (
                          <span className="inline-flex items-center gap-1 text-green-700 font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            OK
                          </span>
                        ) : (
                          <span className="text-red-600 break-words">{log.error || "Failed"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "team" && <AgencySeatManager />}
    </div>
  );
}
