"use client";

import React, { useEffect, useState } from "react";
import { Client } from "@/types";
import { supabase } from "@/lib/supabase-client";
import { X, Trash2, Copy, Check, KeyRound } from "lucide-react";

interface Login {
  id: string;
  userId: string;
  email: string;
  role: string;
  createdAt: string;
}

interface Props {
  client: Client;
  onClose: () => void;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

export function ClientLoginManager({ client, onClose }: Props) {
  const [logins, setLogins] = useState<Login[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setError(null);
    const res = await authedFetch(`/api/admin/client-logins?clientId=${client.id}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Failed to load logins");
      return;
    }
    setLogins(body.logins);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/client-logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, email: newEmail.trim(), password: newPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to create login");
        return;
      }
      setJustCreated({ email: newEmail.trim(), password: newPassword });
      setNewEmail("");
      setNewPassword(generatePassword());
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!confirm("Revoke this login? The client will no longer be able to sign in.")) return;
    setBusy(true);
    try {
      const res = await authedFetch(`/api/admin/client-logins?clientId=${client.id}&userId=${userId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to revoke login");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copyCredentials = () => {
    if (!justCreated) return;
    navigator.clipboard
      .writeText(`Email: ${justCreated.email}\nPassword: ${justCreated.password}\nLogin at: ${window.location.origin}/login`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white border-2 border-black max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-display font-extrabold uppercase text-black flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Client Login — {client.name}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-black">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs font-mono text-neutral-500 mb-4">
          Create credentials for {client.name} to sign in and see only their own dashboard.
        </p>

        {error && <p className="text-xs font-mono text-red-600 mb-4">{error}</p>}

        {justCreated && (
          <div className="bg-milk-yellow/20 border border-black p-3 mb-4 text-xs font-mono">
            <div className="font-bold uppercase text-black mb-2">Login created — send these to your client:</div>
            <div className="bg-white border border-neutral-300 p-2 space-y-1">
              <div>
                <span className="text-neutral-500">Email:</span> <span className="font-bold">{justCreated.email}</span>
              </div>
              <div>
                <span className="text-neutral-500">Password:</span> <span className="font-bold">{justCreated.password}</span>
              </div>
              <div>
                <span className="text-neutral-500">Login at:</span>{" "}
                <span className="font-bold">{typeof window !== "undefined" ? window.location.origin : ""}/login</span>
              </div>
            </div>
            <button
              onClick={copyCredentials}
              className="mt-2 px-2.5 py-1 border border-black bg-white hover:bg-neutral-100 font-bold flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy Credentials"}
            </button>
            <p className="text-[11px] text-neutral-600 mt-2">
              This password is shown once and can&apos;t be retrieved again - if lost, revoke and create a new login.
            </p>
          </div>
        )}

        <div className="mb-4">
          <div className="text-xs font-mono font-bold uppercase text-neutral-700 mb-2">Existing Logins</div>
          {logins === null ? (
            <p className="text-xs font-mono text-neutral-400">Loading...</p>
          ) : logins.length === 0 ? (
            <p className="text-xs font-mono text-neutral-400">No client logins yet.</p>
          ) : (
            <div className="space-y-1.5">
              {logins.map((login) => (
                <div key={login.id} className="flex items-center justify-between bg-neutral-50 border border-neutral-200 p-2 text-xs font-mono">
                  <span className="font-semibold text-neutral-800">{login.email}</span>
                  <button onClick={() => handleRevoke(login.userId)} disabled={busy} title="Revoke login" className="text-neutral-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleCreate} className="border-t border-neutral-200 pt-4 space-y-3 text-xs font-mono">
          <div className="font-bold uppercase text-neutral-700">Create New Login</div>
          <div>
            <label className="block font-bold text-black uppercase mb-1">Client Email</label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="client@theirdomain.com"
              className="w-full p-2 border border-neutral-300 focus:border-black bg-milk-bg font-sans text-sm"
            />
          </div>
          <div>
            <label className="block font-bold text-black uppercase mb-1">Password</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 p-2 border border-neutral-300 focus:border-black bg-milk-bg font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setNewPassword(generatePassword())}
                className="px-3 border border-neutral-300 hover:border-black font-bold"
              >
                Generate
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2 bg-black text-milk-yellow border border-black font-bold hover:bg-neutral-900 disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
