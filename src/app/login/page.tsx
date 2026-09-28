"use client";

import { Suspense } from "react";
import AppAuthScreen from "@/mobile/AppAuthScreen";

// Chem+ app: the sign-in form on its own screen (see AppAuthScreen). RequireAuth sends signed-out
// users here with ?next=<dashboard page>.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AppAuthScreen tab="login" />
    </Suspense>
  );
}
