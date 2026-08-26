"use client";

import React, { useEffect, useState } from "react";
import { Client, Platform } from "@/types";
import { supabase } from "@/lib/supabase-client";
import {
  ConnectionRow,
  ScopeFilters,
  fetchConnections,
  createConnection,
  updateConnectionScope,
  deleteConnection,
} from "@/lib/supabase-data";
import { Plus, Trash2, Filter, RefreshCw, Loader2 } from "lucide-react";

const REAL_INGESTION_PLATFORMS: Platform[] = ["meta", "facebook_page", "instagram"];

async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(input, {
    ...init,
    headers: { ...init.headers, "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

interface Props {
  client: Client;
  onChanged: () => void;
}

const PLATFORM_OPTIONS: { value: Platform; label: string; connectionType: "paid_ads" | "organic_social" }[] = [
  { value: "meta", label: "Meta Ads", connectionType: "paid_ads" },
  { value: "google_ads", label: "Google Ads", connectionType: "paid_ads" },
  { value: "tiktok_ads", label: "TikTok Ads", connectionType: "paid_ads" },
  { value: "facebook_page", label: "Facebook Page (Organic)", connectionType: "organic_social" },
  { value: "instagram", label: "Instagram (Organic)", connectionType: "organic_social" },
];

// Dimensional scope fields per the ask: page / ad account / campaign / ad
// set / ad / profile / post - the same granularity Sprout/Hootsuite/
// AgencyAnalytics-style tools let you scope a connection down to. Free-text
// ID entry rather than a live browser, since there's no real platform API
// connection yet to list actual campaigns/ad sets from.
const SCOPE_FIELDS: { key: keyof ScopeFilters; label: string; placeholder: string }[] = [
  { key: "pageIds", label: "Page IDs", placeholder: "1234567890" },
  { key: "adAccountIds", label: "Ad Account IDs", placeholder: "act_1234567" },
  { key: "campaignIds", label: "Campaign IDs", placeholder: "cmp_123, cmp_456" },
  { key: "adSetIds", label: "Ad Set IDs", placeholder: "as_123, as_456" },
  { key: "adIds", label: "Ad IDs", placeholder: "ad_123, ad_456" },
  { key: "profileIds", label: "Profile IDs (Instagram/TikTok)", placeholder: "ig_123" },
  { key: "postIds", label: "Post/Reel/Story IDs", placeholder: "post_123, reel_456" },
];

function scopeToText(values?: string[]): string {
  return (values || []).join(", ");
}
function textToScope(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function DataConnectionsPanel({ client, onChanged }: Props) {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>("meta");
  const [newAccountName, setNewAccountName] = useState("");
  const [newExternalId, setNewExternalId] = useState("");
  const [scopeDraft, setScopeDraft] = useState<Record<keyof ScopeFilters, string>>({} as any);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessages, setSyncMessages] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      setConnections(await fetchConnections(client.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim() || !newExternalId.trim()) return;
    const platformDef = PLATFORM_OPTIONS.find((p) => p.value === newPlatform)!;
    await createConnection({
      clientId: client.id,
      platform: newPlatform,
      connectionType: platformDef.connectionType,
      accountName: newAccountName.trim(),
      externalAccountId: newExternalId.trim(),
    });
    setNewAccountName("");
    setNewExternalId("");
    setShowAddForm(false);
    await load();
    onChanged();
  };

  const handleDelete = async (connectionId: string) => {
    if (!confirm("Remove this data source? Its scope filters will be lost.")) return;
    await deleteConnection(connectionId);
    await load();
    onChanged();
  };

  const handleSyncNow = async (connectionId: string) => {
    setSyncingId(connectionId);
    setSyncMessages((prev) => ({ ...prev, [connectionId]: "" }));
    try {
      const res = await authedFetch("/api/ingest", { method: "POST", body: JSON.stringify({ connectionId }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const detail = json.details?.[0];
      if (detail?.status === "error") {
        setSyncMessages((prev) => ({ ...prev, [connectionId]: detail.error }));
      } else if (detail) {
        const postsNote = detail.contentItemsSynced !== undefined ? ` • ${detail.contentItemsSynced} posts` : "";
        setSyncMessages((prev) => ({
          ...prev,
          [connectionId]: `Synced ${detail.recordsSynced} day${detail.recordsSynced === 1 ? "" : "s"}${postsNote} (${detail.range.since} to ${detail.range.until})`,
        }));
      } else {
        setSyncMessages((prev) => ({ ...prev, [connectionId]: "No matching connection found." }));
      }
    } catch (err) {
      setSyncMessages((prev) => ({ ...prev, [connectionId]: err instanceof Error ? err.message : "Sync failed" }));
    } finally {
      setSyncingId(null);
      await load();
    }
  };

  const openScopeEditor = (conn: ConnectionRow) => {
    setExpandedId(conn.id);
    const draft: Record<string, string> = {};
    for (const f of SCOPE_FIELDS) draft[f.key] = scopeToText(conn.scopeFilters[f.key]);
    setScopeDraft(draft as any);
  };

  const handleSaveScope = async (connectionId: string) => {
    const filters: ScopeFilters = {};
    for (const f of SCOPE_FIELDS) {
      const values = textToScope(scopeDraft[f.key] || "");
      if (values.length > 0) filters[f.key] = values;
    }
    await updateConnectionScope(connectionId, filters);
    setExpandedId(null);
    await load();
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-display font-black text-black">
          Data Connections — {client.name}
        </h2>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="px-3 py-1.5 bg-milk-yellow text-black border border-black font-mono text-xs font-bold shadow-crisp-sm flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Source
        </button>
      </div>
      <p className="text-xs font-mono text-neutral-600 mb-6">
        Select each metric source for this client, and optionally scope it down to specific pages, ad
        accounts, campaigns, ad sets, ads, profiles, or posts/reels/stories.
      </p>

      {showAddForm && (
        <form onSubmit={handleAddConnection} className="bg-white border border-black p-4 mb-6 shadow-crisp-sm text-xs font-mono space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Platform</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as Platform)}
                className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg"
              >
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">External Account ID</label>
              <input
                type="text"
                required
                value={newExternalId}
                onChange={(e) => setNewExternalId(e.target.value)}
                placeholder="act_1234567"
                className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block font-bold uppercase text-neutral-800 mb-1">Account Name</label>
            <input
              type="text"
              required
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder={`${client.name} - Meta Ads`}
              className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg font-sans text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 border border-black font-bold hover:bg-neutral-100">
              Cancel
            </button>
            <button type="submit" className="px-3 py-1.5 bg-black text-milk-yellow border border-black font-bold hover:bg-neutral-900">
              Add Connection
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="font-mono text-xs text-neutral-500">Loading...</p>
      ) : connections.length === 0 ? (
        <p className="font-mono text-xs text-neutral-500">No data sources connected for this client yet.</p>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => {
            const activeScopeCount = Object.values(conn.scopeFilters).filter((v) => v && v.length > 0).length;
            return (
              <div key={conn.id} className="bg-white border border-black shadow-crisp-sm">
                <div className="p-4 flex items-center justify-between text-xs font-mono">
                  <div>
                    <div className="font-bold text-sm text-black">{conn.accountName}</div>
                    <div className="text-neutral-500">
                      Platform: <span className="uppercase">{conn.platform}</span> • Account ID:{" "}
                      {conn.externalAccountId}
                      {activeScopeCount > 0 && (
                        <span className="ml-2 text-black font-bold">
                          • {activeScopeCount} scope filter{activeScopeCount > 1 ? "s" : ""} active
                        </span>
                      )}
                    </div>
                    <div className="text-neutral-500 mt-0.5">
                      {conn.lastSyncedAt ? `Last synced ${new Date(conn.lastSyncedAt).toLocaleString()}` : "Never synced"}
                    </div>
                    {syncMessages[conn.id] && (
                      <div className={conn.syncStatus === "error" ? "text-red-600 mt-0.5" : "text-neutral-700 mt-0.5"}>
                        {syncMessages[conn.id]}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block px-2 py-0.5 border font-bold uppercase ${
                        conn.syncStatus === "error"
                          ? "bg-red-100 text-red-800 border-red-300"
                          : conn.syncStatus === "paused"
                          ? "bg-neutral-100 text-neutral-600 border-neutral-300"
                          : "bg-green-100 text-green-800 border-green-300"
                      }`}
                    >
                      {conn.syncStatus}
                    </span>
                    {REAL_INGESTION_PLATFORMS.includes(conn.platform) && (
                      <button
                        onClick={() => handleSyncNow(conn.id)}
                        disabled={syncingId === conn.id}
                        title="Pull the latest data for this connection now"
                        className="text-neutral-600 hover:text-black flex items-center gap-1 disabled:opacity-50"
                      >
                        {syncingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Sync Now
                      </button>
                    )}
                    <button
                      onClick={() => (expandedId === conn.id ? setExpandedId(null) : openScopeEditor(conn))}
                      title="Edit scope filters"
                      className="text-neutral-600 hover:text-black flex items-center gap-1"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Filters
                    </button>
                    <button onClick={() => handleDelete(conn.id)} title="Remove connection" className="text-neutral-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {expandedId === conn.id && (
                  <div className="border-t border-neutral-200 p-4 bg-neutral-50 text-xs font-mono space-y-3">
                    {SCOPE_FIELDS.map((f) => (
                      <div key={f.key}>
                        <label className="block font-bold uppercase text-neutral-700 mb-1">{f.label}</label>
                        <input
                          type="text"
                          value={scopeDraft[f.key] || ""}
                          onChange={(e) => setScopeDraft({ ...scopeDraft, [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          className="w-full p-2 border border-neutral-300 focus:border-black bg-white font-mono text-xs"
                        />
                      </div>
                    ))}
                    <p className="text-neutral-500 text-[11px]">
                      Comma-separated IDs. Leave a field blank to include everything for that dimension.
                      Reporting only includes data matching every non-empty filter.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(null)}
                        className="px-3 py-1.5 border border-black font-bold hover:bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveScope(conn.id)}
                        className="px-3 py-1.5 bg-black text-milk-yellow border border-black font-bold hover:bg-neutral-900"
                      >
                        Save Filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 text-[11px] font-mono text-neutral-500 border-t border-neutral-200 pt-4">
        <RefreshCw className="w-3.5 h-3.5" />
        Meta (Meta Ads, Facebook Page, Instagram) syncs for real via &quot;Sync Now&quot; above, and
        automatically every day. Google Ads and TikTok Ads connections can be added for scope-filter
        planning now, but their data pulls aren&apos;t wired up yet.
      </div>
    </div>
  );
}
