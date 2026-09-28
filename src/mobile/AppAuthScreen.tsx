"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import AuthScreen from "./auth/AuthScreen";
import { dashboardDestination } from "./dashboardDestination";

/**
 * Chem+ app sign-in screen. The dashboard can be browsed without an account; this screen opens
 * when the user starts something that needs one (or taps "sign in").
 */
export default function AppAuthScreen({ tab }: { tab: "login" | "register" }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace(dashboardDestination(next));
  }, [loading, user, next, router]);

  return <AuthScreen tab={tab} next={next} />;
}
