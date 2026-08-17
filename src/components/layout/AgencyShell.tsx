"use client";

import React, { useState } from "react";
import { MOCK_CLIENTS, generateMockRecords, MOCK_TEMPLATES } from "@/lib/mock-data";
import { Client, Dashboard } from "@/types";
import { DashboardBuilder } from "@/components/dashboard/DashboardBuilder";
import { MetricCatalogBrowser } from "@/components/data-catalog/MetricCatalogBrowser";
import { ClientManager } from "@/components/clients/ClientManager";
import {
  LayoutDashboard,
  Database,
  RefreshCw,
  Users,
  Eye,
  Shield,
} from "lucide-react";

export function AgencyShell() {
  const [selectedClient, setSelectedClient] = useState<Client>(MOCK_CLIENTS[0]);
  const [activeTab, setActiveTab] = useState<"dashboards" | "catalog" | "sync" | "clients">("dashboards");
  const [userRole, setUserRole] = useState<"agency_admin" | "client_viewer">("agency_admin");

  // Client-specific dashboard state
  const [dashboards, setDashboards] = useState<Record<string, Dashboard>>({
    "client-aura-cosmetics": {
      id: "dash-aura-1",
      clientId: "client-aura-cosmetics",
      title: "Aura Brand Awareness & Reach Overview",
      description: "Reach, CPM, Frequency, and Video completion performance.",
      globalDateRange: "last_30_days",
      pages: MOCK_TEMPLATES[0].pages.map((p, i) => ({
        ...p,
        id: `p-aura-${i}`,
        dashboardId: "dash-aura-1",
      })),
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-17T00:00:00Z",
    },
    "client-lumina-studio": {
      id: "dash-lumina-1",
      clientId: "client-lumina-studio",
      title: "Lumina Instagram & Organic Social Growth",
      description: "Follower growth, Reel plays, Story retention & engagement.",
      globalDateRange: "last_30_days",
      pages: MOCK_TEMPLATES[1].pages.map((p, i) => ({
        ...p,
        id: `p-lumina-${i}`,
        dashboardId: "dash-lumina-1",
      })),
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-17T00:00:00Z",
    },
  });

  const activeDashboard = dashboards[selectedClient.id] || {
    id: `dash-${selectedClient.id}`,
    clientId: selectedClient.id,
    title: `${selectedClient.name} Default Dashboard`,
    globalDateRange: "last_30_days",
    pages: MOCK_TEMPLATES[0].pages.map((p, i) => ({
      ...p,
      id: `p-def-${i}`,
      dashboardId: `dash-${selectedClient.id}`,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const currentRecords = generateMockRecords(selectedClient.id);

  const handleSaveDashboard = (updatedDashboard: Dashboard) => {
    setDashboards({
      ...dashboards,
      [selectedClient.id]: updatedDashboard,
    });
    alert("Dashboard layout saved successfully!");
  };

  const handleDuplicateDashboard = (dashboardToDup: Dashboard) => {
    const duplicated: Dashboard = {
      ...dashboardToDup,
      id: `dash-${Date.now()}`,
      title: `${dashboardToDup.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDashboards({
      ...dashboards,
      [selectedClient.id]: duplicated,
    });
    alert("Dashboard duplicated successfully!");
  };

  return (
    <div className="min-h-screen bg-milk-bg flex flex-col">
      {/* Editorial Header */}
      <header className="bg-black text-white border-b border-neutral-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Client Selector */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <img
              src="/milk-logo.png"
              alt="milk logo"
              className="h-8 w-auto border border-neutral-800"
            />
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-300 font-semibold border-l border-neutral-800 pl-3">
              Reporting Platform
            </span>
          </div>

          {/* Client Selector Dropdown */}
          <div className="relative">
            <select
              value={selectedClient.id}
              onChange={(e) => {
                const found = MOCK_CLIENTS.find((c) => c.id === e.target.value);
                if (found) setSelectedClient(found);
              }}
              className="bg-neutral-900 text-white font-mono text-xs font-bold border border-neutral-700 px-3 py-1.5 focus:outline-none focus:border-milk-yellow cursor-pointer"
            >
              {MOCK_CLIENTS.map((c) => (
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

        {/* User Role Switcher */}
        <div className="flex items-center space-x-2 text-xs font-mono">
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
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === "dashboards" && (
          <DashboardBuilder
            dashboard={activeDashboard}
            records={currentRecords}
            onSaveDashboard={handleSaveDashboard}
            onDuplicateDashboard={handleDuplicateDashboard}
            userRole={userRole}
          />
        )}

        {activeTab === "catalog" && <MetricCatalogBrowser />}

        {activeTab === "clients" && (
          <ClientManager
            onSelectClient={(client) => {
              setSelectedClient(client);
              setActiveTab("dashboards");
            }}
          />
        )}

        {activeTab === "sync" && (
          <div className="p-8 max-w-4xl mx-auto">
            <h2 className="text-2xl font-display font-black text-black mb-2">
              Connected Platform Connections
            </h2>
            <p className="text-xs font-mono text-neutral-600 mb-6">
              Data Ingestion Layer (Airbyte + Native Meta Graph API Connector). Scheduled daily sync.
            </p>
            <div className="space-y-4">
              {selectedClient.connectedPlatforms.map((p) => (
                <div
                  key={p.externalId}
                  className="bg-white border border-black p-4 flex items-center justify-between text-xs font-mono shadow-crisp-sm"
                >
                  <div>
                    <div className="font-bold text-sm text-black">{p.accountName}</div>
                    <div className="text-neutral-500">
                      Platform: <span className="uppercase">{p.platform}</span> • Account ID: {p.externalId}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 border border-green-300 font-bold uppercase mb-1">
                      {p.status}
                    </span>
                    <div className="text-[10px] text-neutral-400">
                      Last Synced: {new Date(p.lastSyncedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
