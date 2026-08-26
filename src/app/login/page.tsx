"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-milk-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border-2 border-black p-8 shadow-crisp">
        <div className="flex items-center gap-3 mb-6">
          <img src="/milk-logo.png" alt="milk logo" className="h-8 w-auto border border-black" />
          <span className="font-mono text-xs uppercase tracking-widest text-neutral-600 font-semibold border-l border-neutral-300 pl-3">
            Reporting Platform
          </span>
        </div>

        <h1 className="text-xl font-display font-black text-black mb-1">Sign In</h1>
        <p className="text-xs font-mono text-neutral-500 mb-6">Use the credentials your agency sent you.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-neutral-800 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-neutral-800 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-xs font-mono text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 bg-black text-milk-yellow border border-black font-mono text-xs font-bold shadow-crisp-sm hover:bg-neutral-900 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogIn className="w-3.5 h-3.5" />
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
