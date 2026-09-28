"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import AppLoader from "@/mobile/AppLoader";

// ChemAI: Iris answers through the user's account and the account page is about the user, so
// every dashboard page asks for a sign-in first.
const ACCOUNT_ONLY = [/^\/dashboard(\/|$)/];

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsAccount = ACCOUNT_ONLY.some((pattern) => pattern.test(pathname));

  useEffect(() => {
    if (!loading && !user && needsAccount) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, needsAccount, pathname, router]);

  if (loading || (!user && needsAccount)) {
    return <AppLoader />;
  }

  return <>{children}</>;
}
