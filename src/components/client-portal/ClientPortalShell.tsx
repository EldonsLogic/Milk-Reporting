"use client";

import React, { useEffect, useState } from "react";
import { Client, Dashboard, RawDailyRecord, ContentPost } from "@/types";
import { supabase } from "@/lib/supabase-client";
import { fetchDashboardsForClient, fetchRecords, fetchContentPosts, fetchVisibleCustomMetrics, saveDashboard } from "@/lib/supabase-data";
import { setCustomMetricsCache } from "@/lib/metric-catalog";
import { DashboardBuilder } from "@/components/dashboard/DashboardBuilder";
import { useAuth } from "@/lib/auth-context";
import { LogOut } from "lucide-react";

interface AgencyBranding {
  name: string;
  logoUrl: string | null;
}

// The client's own login lands here, never on AgencyShell - there is no
// admin bar, no "Edit Dashboard"/"Add Widget"/customization toolbar, and
// no way to navigate to other clients. userRole is hardcoded to
// "client_viewer" (not a toggle), which DashboardBuilder already uses to
// hide every admin-only control and to apply the dashboard's hidden
// markup - the same mechanism the agency's own "Client Portal View"
// preview uses, just without the ability to switch back.
export function ClientPortalShell({ clientId }: { clientId: string }) {
  const { signOut } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [agency, setAgency] = useState<AgencyBranding | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [records, setRecords] = useState<RawDailyRecord[]>([]);
  const [contentPosts, setContentPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: clientRow, error: clientError } = await supabase
          .from("clients")
          .select("*, agencies(name, logo_url)")
          .eq("id", clientId)
          .single();
        if (clientError) throw clientError;
        if (!active) return;

        setClient({
          id: clientRow.id,
          agencyId: clientRow.agency_id,
          name: clientRow.name,
          slug: clientRow.slug,
          objectiveType: clientRow.objective_type,
          logoUrl: clientRow.logo_url || undefined,
          connectedPlatforms: [],
        });
        setAgency({
          name: clientRow.agencies?.name || "Agency",
          logoUrl: clientRow.agencies?.logo_url || null,
        });

        const [dashboards, recordList, contentList, customMetrics] = await Promise.all([
          fetchDashboardsForClient(clientId),
          fetchRecords(clientId),
          fetchContentPosts(clientId),
          fetchVisibleCustomMetrics(),
        ]);
        if (!active) return;
        setCustomMetricsCache(customMetrics);
        setDashboard(dashboards.find((d) => d.isDefault) || dashboards[0] || null);
        setRecords(recordList);
        setContentPosts(contentList);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load your dashboard");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-milk-bg flex items-center justify-center">
        <p className="font-mono text-xs text-neutral-500">Loading your dashboard...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-milk-bg flex items-center justify-center p-4">
        <p className="font-mono text-xs text-red-600 max-w-md text-center">{error || "Client not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-milk-bg flex flex-col">
      <header className="bg-black text-white border-b border-neutral-800 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {agency?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agency.logoUrl} alt={agency.name} className="h-8 w-auto border border-neutral-800" />
          ) : (
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-300 font-semibold">
              {agency?.name}
            </span>
          )}
          {client.logoUrl && (
            <>
              <span className="text-neutral-700">×</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={client.logoUrl} alt={client.name} className="h-8 w-auto border border-neutral-800" />
            </>
          )}
          <span className="font-mono text-xs text-neutral-400">{client.name}</span>
        </div>
        <button
          onClick={signOut}
          title="Sign out"
          className="px-2.5 py-1 border border-neutral-700 text-neutral-300 hover:text-white hover:border-white flex items-center gap-1 font-mono text-xs font-bold"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </header>

      {!dashboard ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-sm text-neutral-500">Your agency hasn&apos;t published a dashboard yet.</p>
        </div>
      ) : (
        <DashboardBuilder
          key={dashboard.id}
          dashboard={dashboard}
          records={records}
          contentPosts={contentPosts}
          onSaveDashboard={saveDashboard}
          onDuplicateDashboard={async () => {}}
          userRole="client_viewer"
        />
      )}
    </div>
  );
}
