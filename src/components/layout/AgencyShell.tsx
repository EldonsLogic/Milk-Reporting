"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Client, Dashboard } from "@/types";
import { DashboardBuilder } from "@/components/dashboard/DashboardBuilder";
import { MetricCatalogBrowser } from "@/components/data-catalog/MetricCatalogBrowser";
import { ClientManager } from "@/components/clients/ClientManager";
import { DataConnectionsPanel } from "@/components/clients/DataConnectionsPanel";
import { fetchClients, fetchDashboardsForClient, fetchRecords, fetchContentPosts, fetchCustomMetrics, saveDashboard, createDashboard, setDefaultDashboard } from "@/lib/supabase-data";
import { setCustomMetricsCache } from "@/lib/metric-catalog";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/lib/auth-context";
import { RawDailyRecord, ContentPost } from "@/types";
import {
  LayoutDashboard,
  Database,
  RefreshCw,
  Users,
  Eye,
  Shield,
  LogOut,
} from "lucide-react";

export function AgencyShell({ agencyId }: { agencyId: string }) {
  const { signOut } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboards" | "catalog" | "sync" | "clients">("dashboards");
  const [userRole, setUserRole] = useState<"agency_admin" | "client_viewer">("agency_admin");

  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [dashboardsLoading, setDashboardsLoading] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null);
  const [records, setRecords] = useState<RawDailyRecord[]>([]);
  const [contentPosts, setContentPosts] = useState<ContentPost[]>([]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  const refreshClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const list = await fetchClients(agencyId);
      setClients(list);
      setSelectedClientId((prev) => prev || list[0]?.id || null);
    } finally {
      setClientsLoading(false);
    }
  }, [agencyId]);

  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

  const refreshCustomMetrics = useCallback(async () => {
    setCustomMetricsCache(await fetchCustomMetrics(agencyId));
  }, [agencyId]);

  useEffect(() => {
    refreshCustomMetrics();
  }, [refreshCustomMetrics]);

  const loadClientWorkspace = useCallback(async (clientId: string) => {
    setDashboardsLoading(true);
    try {
      const [dashList, recordList, contentList] = await Promise.all([
        fetchDashboardsForClient(clientId),
        fetchRecords(clientId),
        fetchContentPosts(clientId),
      ]);
      setDashboards(dashList);
      setSelectedDashboardId(dashList[0]?.id || null);
      setRecords(recordList);
      setContentPosts(contentList);
    } finally {
      setDashboardsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClientId) loadClientWorkspace(selectedClientId);
  }, [selectedClientId, loadClientWorkspace]);

  const activeDashboard = dashboards.find((d) => d.id === selectedDashboardId) || dashboards[0] || null;

  const handleSaveDashboard = async (updated: Dashboard) => {
    // The Save button fires this without awaiting or catching, so an
    // unhandled rejection here previously meant "click Save, nothing
    // visibly happens" on any failure - surfacing it explicitly instead.
    try {
      await saveDashboard(updated);
      setDashboards((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      alert(`Failed to save dashboard: ${getErrorMessage(err, "Unknown error")}`);
    }
  };

  const handleDuplicateDashboard = async (dashboardToDup: Dashboard) => {
    if (!selectedClientId) return;
    try {
      await duplicateDashboardImpl(dashboardToDup);
    } catch (err) {
      alert(`Failed to duplicate dashboard: ${getErrorMessage(err, "Unknown error")}`);
    }
  };

  const duplicateDashboardImpl = async (dashboardToDup: Dashboard) => {
    if (!selectedClientId) return;
    const created = await createDashboard(selectedClientId, `${dashboardToDup.title} (Copy)`);
    // Copy over pages/widgets/markup from the source dashboard onto the freshly created one.
    const copy: Dashboard = {
      ...created,
      markupPercentage: dashboardToDup.markupPercentage,
      pages: dashboardToDup.pages.map((p, i) => ({
        ...p,
        id: `p-${Date.now()}-${i}`,
        dashboardId: created.id,
        widgets: p.widgets.map((w) => ({ ...w, id: `w-${Date.now()}-${Math.round(Math.random() * 1e6)}`, pageId: `p-${Date.now()}-${i}` })),
      })),
    };
    await saveDashboard(copy);
    setDashboards((prev) => [...prev, copy]);
  };

  if (clientsLoading) {
    return (
      <div className="min-h-screen bg-milk-bg flex items-center justify-center">
        <p className="font-mono text-xs text-neutral-500">Loading clients...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-milk-bg flex flex-col overflow-x-hidden">
      {/* Editorial Header */}
      <header className="print:hidden bg-black text-white border-b border-neutral-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Client Selector */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <div className="flex items-center space-x-3">
            <img
              src="/milk-logo.png"
              alt="milk logo"
              className="h-8 w-auto border border-neutral-800"
            />
            <span className="hidden sm:inline font-mono text-xs uppercase tracking-widest text-neutral-300 font-semibold border-l border-neutral-800 pl-3">
              Reporting Platform
            </span>
          </div>

          {/* Client Selector Dropdown */}
          <div className="relative max-w-[220px] sm:max-w-xs">
            <select
              value={selectedClientId || ""}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full max-w-full truncate bg-neutral-900 text-white font-mono text-xs font-bold border border-neutral-700 px-3 py-1.5 focus:outline-none focus:border-milk-yellow cursor-pointer"
            >
              {clients.length === 0 && <option value="">No clients yet</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  Client: {c.name} ({c.objectiveType.replace("_", " ")})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Navigation Tabs (Filtered by userRole) */}
        <nav className="flex items-center space-x-1 font-mono text-xs">
          <button
            onClick={() => setActiveTab("dashboards")}
            className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === "dashboards"
                ? "bg-milk-yellow text-black"
                : "text-neutral-300 hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboards</span>
          </button>

          {userRole === "agency_admin" && (
            <>
              <button
                onClick={() => setActiveTab("catalog")}
                className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 transition-all ${
                  activeTab === "catalog"
                    ? "bg-milk-yellow text-black"
                    : "text-neutral-300 hover:text-white"
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Metric Catalog</span>
              </button>
              <button
                onClick={() => setActiveTab("clients")}
                className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 transition-all ${
                  activeTab === "clients"
                    ? "bg-milk-yellow text-black"
                    : "text-neutral-300 hover:text-white"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Clients & Templates</span>
              </button>
              <button
                onClick={() => setActiveTab("sync")}
                className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 transition-all ${
                  activeTab === "sync"
                    ? "bg-milk-yellow text-black"
                    : "text-neutral-300 hover:text-white"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Data Connections</span>
              </button>
            </>
          )}
        </nav>

        {/* User Role Switcher + Sign Out */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <button
            onClick={() =>
              setUserRole(userRole === "agency_admin" ? "client_viewer" : "agency_admin")
            }
            className={`px-2.5 py-1 border flex items-center space-x-1 font-bold ${
              userRole === "agency_admin"
                ? "bg-neutral-800 text-neutral-200 border-neutral-700"
                : "bg-milk-yellow text-black border-milk-yellow"
            }`}
          >
            {userRole === "agency_admin" ? (
              <>
                <Shield className="w-3.5 h-3.5" />
                <span>Agency Admin View</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Client Portal View</span>
              </>
            )}
          </button>
          <button
            onClick={signOut}
            title="Sign out"
            className="px-2.5 py-1 border border-neutral-700 text-neutral-300 hover:text-white hover:border-white flex items-center gap-1 font-bold"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === "dashboards" && (
          <>
            {!selectedClient ? (
              <div className="p-12 text-center font-mono text-sm text-neutral-500">
                No clients yet. Go to <strong>Clients &amp; Templates</strong> to create one.
              </div>
            ) : dashboardsLoading ? (
              <div className="p-12 text-center font-mono text-xs text-neutral-500">Loading dashboard...</div>
            ) : !activeDashboard ? (
              <div className="p-12 text-center font-mono text-sm text-neutral-500">
                {selectedClient.name} has no dashboards yet. Go to <strong>Clients &amp; Templates</strong> to
                create one.
              </div>
            ) : (
              <>
                {dashboards.length > 1 && userRole === "agency_admin" && (
                  <div className="bg-white border-b border-neutral-200 px-6 py-2 flex items-center gap-3 text-xs font-mono">
                    <span className="text-neutral-500 font-bold uppercase">Dashboard:</span>
                    <select
                      value={activeDashboard.id}
                      onChange={(e) => setSelectedDashboardId(e.target.value)}
                      className="p-1.5 border border-neutral-300 focus:border-black bg-milk-bg"
                    >
                      {dashboards.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                          {d.isDefault ? " (client sees this)" : ""}
                        </option>
                      ))}
                    </select>
                    {!activeDashboard.isDefault && (
                      <button
                        onClick={async () => {
                          if (!selectedClientId) return;
                          await setDefaultDashboard(selectedClientId, activeDashboard.id);
                          await loadClientWorkspace(selectedClientId);
                        }}
                        className="px-2 py-1 border border-neutral-300 hover:border-black font-bold"
                        title="Make this the dashboard the client sees when they log in"
                      >
                        Set as Client&apos;s Default
                      </button>
                    )}
                  </div>
                )}
                <DashboardBuilder
                  // DashboardBuilder copies this prop into local state once on
                  // mount and never re-syncs it - force a remount whenever the
                  // active dashboard's identity or content actually changes.
                  key={`${activeDashboard.id}-${activeDashboard.updatedAt}`}
                  dashboard={activeDashboard}
                  records={records}
                  contentPosts={contentPosts}
                  onSaveDashboard={handleSaveDashboard}
                  onDuplicateDashboard={handleDuplicateDashboard}
                  userRole={userRole}
                />
              </>
            )}
          </>
        )}

        {activeTab === "catalog" && <MetricCatalogBrowser agencyId={agencyId} onCustomMetricsChanged={refreshCustomMetrics} />}

        {activeTab === "clients" && (
          <ClientManager
            agencyId={agencyId}
            clients={clients}
            onClientsChanged={refreshClients}
            onSelectClient={(client) => {
              setSelectedClientId(client.id);
              setActiveTab("dashboards");
            }}
            onCreateDashboard={async (client, title) => {
              const created = await createDashboard(client.id, title);
              if (client.id === selectedClientId) {
                await loadClientWorkspace(client.id);
                setSelectedDashboardId(created.id);
              }
            }}
          />
        )}

        {activeTab === "sync" && selectedClient && (
          <DataConnectionsPanel client={selectedClient} onChanged={() => refreshClients()} />
        )}
        {activeTab === "sync" && !selectedClient && (
          <div className="p-12 text-center font-mono text-sm text-neutral-500">Select a client first.</div>
        )}
      </main>
    </div>
  );
}
