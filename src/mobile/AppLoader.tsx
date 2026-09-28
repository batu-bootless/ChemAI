"use client";

// ChemAI app: the loading screen - the logo (public/brand/chemai-logo.svg) breathing in and out
// on a soft glow. The animation is plain CSS (.cp-* in globals.css), so it already runs in the
// static page, before React has started.
import Wordmark from "./brand/Wordmark";
import { useL } from "./i18n";

/** Full page by default; `inline` fills the space of a page section instead. */
export default function AppLoader({ inline = false }: { inline?: boolean }) {
  const l = useL();
  return (
    <div
      role="status"
      aria-label={l("Yükleniyor", "Loading")}
      className={`flex items-center justify-center ${inline ? "min-h-[60vh]" : "min-h-screen bg-gray-50"}`}
    >
      <span className="relative grid h-28 w-60 place-items-center">
        <span aria-hidden="true" className="cp-glow absolute inset-0 rounded-full" />
        <Wordmark height={44} className="cp-breathe relative" />
      </span>
    </div>
  );
}
