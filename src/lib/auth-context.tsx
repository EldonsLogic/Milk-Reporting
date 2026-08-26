"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";

export interface AgencyProfile {
  kind: "agency_admin";
  agencyId: string;
  fullName: string | null;
}

export interface ClientProfile {
  kind: "client_viewer";
  clientId: string;
}

export type UserProfile = AgencyProfile | ClientProfile | null;

interface AuthState {
  session: Session | null;
  profile: UserProfile;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Looks up which side of the app this user belongs to. A user is either an
// agency_users row (sees the full admin app) or a client_users row (sees
// only their one client, read-only) - never both, never neither once
// properly provisioned.
async function loadProfile(userId: string): Promise<UserProfile> {
  const { data: agencyRow } = await supabase
    .from("agency_users")
    .select("agency_id, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (agencyRow) {
    return { kind: "agency_admin", agencyId: agencyRow.agency_id, fullName: agencyRow.full_name };
  }

  const { data: clientRow } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (clientRow) {
    return { kind: "client_viewer", clientId: clientRow.client_id };
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) {
        const p = await loadProfile(data.session.user.id);
        if (active) setProfile(p);
      }
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        const p = await loadProfile(newSession.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return <AuthContext.Provider value={{ session, profile, loading, signOut }}>{children}</AuthContext.Provider>;
}
