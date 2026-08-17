"use client";

import React, { useState } from "react";
import { Client, DashboardTemplate } from "@/types";
import { MOCK_CLIENTS, MOCK_TEMPLATES } from "@/lib/mock-data";
import { Users, Plus, Layers, ShieldCheck, Check, Globe } from "lucide-react";

interface Props {
  onSelectClient: (client: Client) => void;
}

export function ClientManager({ onSelectClient }: Props) {
  const [clients, setClients] = useState<Client[]>(MOCK_CLIENTS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newObjective, setNewObjective] = useState<Client["objectiveType"]>("brand_awareness");

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;

    const newClient: Client = {
      id: `client-${Date.now()}`,
      agencyId: "agency-milk",
      name: newClientName,
      slug: newClientName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      objectiveType: newObjective,
      connectedPlatforms: [
        {
          platform: "meta",
          accountName: `${newClientName} Meta Ads`,
          externalId: `act_${Math.floor(Math.random() * 8999999) + 1000000}`,
          lastSyncedAt: new Date().toISOString(),
          status: "active",
        },
      ],
    };

    setClients([...clients, newClient]);
    setNewClientName("");
    setShowAddModal(false);
    onSelectClient(newClient);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto bg-milk-bg min-h-screen">
      {/* Admin Header */}
      <div className="flex items-center justify-between border-b border-black pb-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-black text-black">Agency Client & Dashboard Management</h1>
          <p className="text-xs font-mono text-neutral-600 mt-1">
            Manage agency clients, client objective profiles, platform credentials, and global templates.
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
                <span className="text-xs font-mono text-neutral-500">{c.connectedPlatforms.length} Connected Accounts</span>
              </div>
              <h3 className="text-xl font-display font-bold text-black mb-1">{c.name}</h3>
              <p className="text-xs font-mono text-neutral-500 mb-4">Slug: /{c.slug}</p>

              <div className="space-y-1.5 border-t border-neutral-100 pt-3 text-xs font-mono">
                <div className="text-neutral-500 font-bold uppercase text-[10px] mb-1">Active Connectors:</div>
                {c.connectedPlatforms.map((p) => (
                  <div key={p.externalId} className="flex items-center justify-between bg-neutral-50 p-1.5 border border-neutral-200">
                    <span className="font-semibold text-neutral-800 uppercase">{p.platform}</span>
                    <span className="text-neutral-500 text-[10px]">{p.accountName}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200 mt-4 flex items-center justify-between">
              <button
                onClick={() => onSelectClient(c)}
                className="px-3 py-1.5 bg-black text-white font-mono text-xs font-bold hover:bg-neutral-800"
              >
                Open Dashboard Builder →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Global Dashboard Templates Catalog */}
      <div className="border-t-2 border-black pt-8">
        <h2 className="text-2xl font-display font-black text-black mb-2">Global Dashboard Templates</h2>
        <p className="text-xs font-mono text-neutral-600 mb-6">
          Standardized agency templates. Assign templates to new clients without exposing raw operational data.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MOCK_TEMPLATES.map((tmpl) => (
            <div key={tmpl.id} className="bg-white border border-neutral-300 p-4 font-mono text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-black text-sm">{tmpl.name}</span>
                <span className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 border border-neutral-200">
                  {tmpl.category}
                </span>
              </div>
              <p className="text-neutral-600 text-xs font-sans mb-3">{tmpl.description}</p>
              <div className="text-[11px] text-neutral-500">
                Structure: {tmpl.pages.length} Pages • {tmpl.pages[0]?.widgets.length || 0} Widgets
              </div>
            </div>
          ))}
        </div>
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
                className="px-4 py-2 bg-milk-yellow text-black border border-black font-mono text-xs font-bold hover:bg-milk-yellowHover shadow-crisp-sm"
              >
                Create Client Tenant
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
