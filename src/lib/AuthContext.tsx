"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as auth from "@/lib/auth";
import type { SessionUser, UserProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

interface AuthContextValue {
  user: SessionUser | null;
  profile: UserProfile | null;
  loading: boolean;
  login: typeof auth.login;
  register: typeof auth.register;
  logout: () => void;
  refreshProfile: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSessionUser(supabaseUser: { id: string; email?: string | null; created_at: string; user_metadata?: { username?: string } | null }): SessionUser {
  return {
    id: supabaseUser.id,
    username: supabaseUser.user_metadata?.username || supabaseUser.email?.split("@")[0] || "kullanici",
    email: supabaseUser.email ?? "",
    createdAt: supabaseUser.created_at,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  const refreshProfile = useCallback(async () => {
    const {
      data: { user: supabaseUser },
    } = await supabaseRef.current.auth.getUser();
    if (!supabaseUser) {
      setUser(null);
      setProfile(null);
      return;
    }
    const sessionUser = toSessionUser(supabaseUser);
    setUser(sessionUser);
    setProfile(await auth.getProfile(sessionUser.id));
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;

    supabase.auth.getUser().then(async ({ data: { user: supabaseUser } }) => {
      if (supabaseUser) {
        const sessionUser = toSessionUser(supabaseUser);
        setUser(sessionUser);
        setProfile(await auth.getProfile(sessionUser.id));
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      const sessionUser = toSessionUser(session.user);
      setUser(sessionUser);
      setProfile(await auth.getProfile(sessionUser.id));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    login: auth.login,
    register: auth.register,
    logout: () => {
      auth.logout();
    },
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
