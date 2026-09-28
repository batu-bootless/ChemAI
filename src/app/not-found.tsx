"use client";

import Link from "next/link";
import { useL } from "@/mobile/i18n";

// Full-screen video 404 page. The clip lives in /public and is served from the
// site root; autoplay needs `muted` (browsers block sound-on autoplay), and
// `playsInline` keeps it inline on iOS instead of going fullscreen.
export default function NotFound() {
  const l = useL();
  return (
    <main className="relative flex-1 min-h-screen w-full overflow-hidden bg-black flex items-center justify-center">
      <video
        className="absolute inset-0 h-full w-full object-contain"
        src="/404-not-found.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-label={l("404 - Sayfa bulunamadı", "404 - Page not found")}
      />
      <Link
        href="/"
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/90 px-6 py-3 text-sm font-semibold text-gray-900 shadow-lg backdrop-blur transition-colors hover:bg-white"
      >
        {l("Ana sayfaya dön", "Back to home")}
      </Link>
    </main>
  );
}
