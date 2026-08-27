"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { getErrorMessage } from "@/lib/errors";
import { Users, Trash2, Copy, Check, Loader2, UserPlus } from "lucide-react";

interface Seat {
  id: string;
  userId: string;
  fullName: string | null;
  email: string;
  createdAt: string;
  isSelf: boolean;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  return fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token}`,
    },
  });
}

export function AgencySeatManager() {
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/admin/agency-seats");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load team");
      setSeats(json.seats);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load team"));
      setSeats([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/agency-seats", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create login");
      setCreated({ email: email.trim(), password });
      setEmail("");
      setFullName("");
      setPassword(generatePassword());
      setShowForm(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create login"));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (seat: Seat) => {
    if (!confirm(`Remove ${seat.email}? They lose access to every client immediately.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/agency-seats?userId=${encodeURIComponent(seat.userId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to remove access");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to remove access"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-black bg-white shadow-crisp-sm">
      <div className="p-3 border-b border-neutral-200 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-mono text-xs text-neutral-600">
          <Users className="w-3.5 h-3.5" />
          Agency admins — everyone here has full access to every client.
        </span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-2.5 py-1 bg-milk-yellow text-black border border-black font-mono text-xs font-bold shadow-crisp-sm flex items-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Admin
        </button>
      </div>

      {created && (
        <div className="m-3 border-2 border-black bg-milk-yellow/20 p-3 font-mono text-xs">
          <p className="font-bold uppercase mb-1.5">Login created — send these to your teammate</p>
          <div className="bg-white border border-neutral-300 p-2 space-y-0.5">
            <div>
              Email: <span className="font-bold">{created.email}</span>
            </div>
            <div>
              Password: <span className="font-bold">{created.password}</span>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 px-2 py-1 border border-black font-bold flex items-center gap-1.5 hover:bg-white"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy Credentials"}
          </button>
          <p className="mt-2 text-neutral-600">
            This password is shown once and can&apos;t be retrieved again — if it&apos;s lost, remove the seat and
            create a new one.
          </p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="p-3 border-b border-neutral-200 space-y-3 font-mono text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@youragency.com"
                className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
              />
            </div>
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Full Name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block font-bold uppercase text-neutral-800 mb-1">Password</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="px-3 border border-black font-bold hover:bg-neutral-100"
              >
                Generate
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 bg-black text-milk-yellow border border-black font-bold hover:bg-neutral-900 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create Admin Login
          </button>
        </form>
      )}

      {error && <p className="p-3 font-mono text-xs text-red-600">{error}</p>}

      {seats === null ? (
        <p className="p-4 font-mono text-xs text-neutral-500">Loading team…</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {seats.map((seat) => (
            <div key={seat.id} className="p-3 flex items-center justify-between gap-3 font-mono text-xs">
              <div className="min-w-0">
                <span className="font-sans font-semibold text-black">
                  {seat.fullName || seat.email}
                  {seat.isSelf && <span className="ml-2 text-[10px] font-mono text-neutral-500">(you)</span>}
                </span>
                <span className="block text-[10px] text-neutral-500 truncate">{seat.email}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-neutral-500">{new Date(seat.createdAt).toLocaleDateString()}</span>
                {!seat.isSelf && (
                  <button
                    onClick={() => handleRevoke(seat)}
                    disabled={busy}
                    title="Remove this admin's access"
                    className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
