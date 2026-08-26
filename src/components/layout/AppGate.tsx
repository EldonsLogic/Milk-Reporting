"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AgencyShell } from "./AgencyShell";
import { ClientPortalShell } from "@/components/client-portal/ClientPortalShell";

// Routes the authenticated user to the right side of the app based on
// their profile - never both, and a client_viewer never sees AgencyShell
// even by URL guessing, since this is the only place either shell mounts.
export function AppGate() {
  const { session, profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.push("/login");
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-milk-bg flex items-center justify-center">
        <p className="font-mono text-xs text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null; // redirecting to /login
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-milk-bg flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <p className="font-display font-bold text-black mb-2">Account not set up</p>
          <p className="font-mono text-xs text-neutral-500 mb-4">
            This login isn&apos;t linked to an agency or client yet. Ask your agency admin to finish setting
            up your account.
          </p>
          <button
            onClick={signOut}
            className="px-4 py-2 border border-black font-mono text-xs font-bold hover:bg-neutral-100"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (profile.kind === "agency_admin") {
    return <AgencyShell agencyId={profile.agencyId} />;
  }

  return <ClientPortalShell clientId={profile.clientId} />;
}
