"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppLoader from "@/mobile/AppLoader";

// Chem+ app: there is no marketing home page in the app; "/" always opens the dashboard.
export default function AppHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/");
  }, [router]);
  return <AppLoader />;
}
