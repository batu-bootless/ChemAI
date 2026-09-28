"use client";

import { Suspense } from "react";
import AppAuthScreen from "@/mobile/AppAuthScreen";

// Chem+ app: the sign-up form on its own screen (see AppAuthScreen).
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AppAuthScreen tab="register" />
    </Suspense>
  );
}
