"use client";

import React, { useState } from "react";
import { Client } from "@/types";
import { createClient, deleteClient, updateClient } from "@/lib/supabase-data";
import { Plus, Trash2, LayoutDashboard, Pencil } from "lucide-react";

interface Props {
  agencyId: string;
  clients: Client[];
  onClientsChanged: () => void;
  onSelectClient: (client: Client) => void;
  onCreateDashboard: (client: Client, title: string) => Promise<void>;
}

export function ClientManager({ agencyId, clients, onClientsChanged, onSelectClient, onCreateDashboard }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newObjective, setNewObjective] = useState<Client["objectiveType"]>("brand_awareness");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editName, setEditName] = useState("");
  const [editObjective, setEditObjective] = useState<Client["objectiveType"]>("brand_awareness");

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const client = await createClient({
        agencyId,
        name: newClientName.trim(),
        objectiveType: newObjective,
        logoUrl: newLogoUrl.trim() || undefined,
      });
      setNewClientName("");
      setNewLogoUrl("");
      setShowAddModal(false);
      onClientsChanged();
      onSelectClient(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setEditName(client.name);
    setEditObjective(client.objectiveType);
    setEditLogoUrl(client.logoUrl || "");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setBusy(true);
    try {
      await updateClient(editingClient.id, {
        name: editName.trim(),
        objectiveType: editObjective,
        logoUrl: editLogoUrl.trim(),
      });
      setEditingClient(null);
      onClientsChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update client");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (!confirm(`Delete ${client.name}? This permanently removes their dashboards, connections, and stored data.`)) {
      return;
    }
    try {
      await deleteClient(client.id);
      onClientsChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete client");
    }
  };

  const handleNewDashboard = async (client: Client) => {
    const title = prompt(`New dashboard name for ${client.name}?`, "New Dashboard");
    if (!title) return;
    try {
      await onCreateDashboard(client, title);
      onSelectClient(client);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create dashboard");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto bg-milk-bg min-h-screen">
      {/* Admin Header */}
      <div className="flex items-center justify-between border-b border-black pb-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black text-black">Agency Client & Dashboard Management</h1>
          <p className="text-xs font-mono text-neutral-600 mt-1">
            Manage agency clients, client objective profiles, platform credentials, and dashboards.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-milk-yellow text-black border border-black font-mono text-xs font-bold hover:bg-milk-yellowHover flex items-center space-x-1 shadow-crisp-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Client</span>
        </button>
      </div>

      {/* Client Roster Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {clients.length === 0 && (
          <p className="font-mono text-sm text-neutral-500 col-span-2">
            No clients yet. Click &quot;Add New Client&quot; to create your first one.
          </p>
        )}
        {clients.map((c) => (
          <div
            key={c.id}
            className="bg-white border border-black p-6 flex flex-col justify-between shadow-crisp-sm hover:border-neutral-700 transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-milk-yellow text-black border border-black">
                  {c.objectiveType.replace("_", " ")}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-neutral-500">{c.connectedPlatforms.length} Connected Accounts</span>
                  <button
                    onClick={() => openEditModal(c)}
                    title="Edit client (name, objective, logo)"
                    className="text-neutral-400 hover:text-black"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteClient(c)}
                    title="Delete client"
                    className="text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-1">
                {c.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logoUrl} alt="" className="h-6 w-6 object-contain border border-neutral-200" />
                )}
                <h3 className="text-xl font-display font-bold text-black">{c.name}</h3>
              </div>
              <p className="text-xs font-mono text-neutral-500 mb-4">Slug: /{c.slug}</p>

              <div className="space-y-1.5 border-t border-neutral-100 pt-3 text-xs font-mono">
                <div className="text-neutral-500 font-bold uppercase text-[10px] mb-1">Active Connectors:</div>
                {c.connectedPlatforms.length === 0 && (
                  <p className="text-neutral-400">None yet - add one from Data Connections.</p>
                )}
                {c.connectedPlatforms.map((p) => (
                  <div key={p.externalId} className="flex items-center justify-between bg-neutral-50 p-1.5 border border-neutral-200">
                    <span className="font-semibold text-neutral-800 uppercase">{p.platform}</span>
                    <span className="text-neutral-500 text-[10px]">{p.accountName}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200 mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => onSelectClient(c)}
                className="px-3 py-1.5 bg-black text-white font-mono text-xs font-bold hover:bg-neutral-800"
              >
                Open Dashboard Builder →
              </button>
              <button
                onClick={() => handleNewDashboard(c)}
                title="Create a new dashboard for this client"
                className="px-3 py-1.5 border border-black font-mono text-xs font-bold hover:bg-neutral-100 flex items-center gap-1"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                New Dashboard
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <form onSubmit={handleAddClient} className="bg-white border-2 border-black max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-display font-extrabold uppercase text-black mb-1">Add New Client</h3>
            <p className="text-xs font-mono text-neutral-500 mb-4">Create client tenant & assign objective profile</p>

            <div className="space-y-4 text-xs font-mono mb-6">
              <div>
                <label className="block font-bold text-black uppercase mb-1">Client Business Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zenith Apparel"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg font-sans font-semibold text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-black uppercase mb-1">Primary Objective Profile</label>
                <select
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value as Client["objectiveType"])}
                  className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg"
                >
                  <option value="brand_awareness">Brand Awareness (Reach, CPM, Video Views)</option>
                  <option value="lead_gen">Lead Generation (Leads, CPA, Landing Page Views)</option>
                  <option value="ecommerce">E-Commerce / Sales (Spend, Revenue, ROAS)</option>
                  <option value="social_content">Organic Social (Followers, Reels, Story Retention)</option>
                  <option value="mixed">Mixed Objectives</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-black uppercase mb-1">Client Logo URL (optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newLogoUrl}
                  onChange={(e) => setNewLogoUrl(e.target.value)}
                  className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg font-mono text-xs"
                />
                <p className="text-neutral-500 text-[11px] mt-1">Shown on the client's own login and dashboard header.</p>
              </div>
              {error && <p className="text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-black font-mono text-xs font-bold hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-milk-yellow text-black border border-black font-mono text-xs font-bold hover:bg-milk-yellowHover shadow-crisp-sm disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create Client Tenant"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <form onSubmit={handleSaveEdit} className="bg-white border-2 border-black max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-display font-extrabold uppercase text-black mb-1">Edit Client</h3>
            <p className="text-xs font-mono text-neutral-500 mb-4">{editingClient.name}</p>

            <div className="space-y-4 text-xs font-mono mb-6">
              <div>
                <label className="block font-bold text-black uppercase mb-1">Client Business Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg font-sans font-semibold text-sm"
                />
              </div>
              <div>
                <label className="block font-bold text-black uppercase mb-1">Primary Objective Profile</label>
                <select
                  value={editObjective}
                  onChange={(e) => setEditObjective(e.target.value as Client["objectiveType"])}
                  className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg"
                >
                  <option value="brand_awareness">Brand Awareness</option>
                  <option value="lead_gen">Lead Generation</option>
                  <option value="ecommerce">E-Commerce / Sales</option>
                  <option value="social_content">Organic Social</option>
                  <option value="mixed">Mixed Objectives</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-black uppercase mb-1">Client Logo URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={editLogoUrl}
                  onChange={(e) => setEditLogoUrl(e.target.value)}
                  className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="px-4 py-2 border border-black font-mono text-xs font-bold hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-milk-yellow text-black border border-black font-mono text-xs font-bold hover:bg-milk-yellowHover shadow-crisp-sm disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
