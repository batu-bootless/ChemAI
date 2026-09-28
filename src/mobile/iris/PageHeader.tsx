"use client";

// ChemAI: the header of Iris's pages, as in the Gemini app: the round ☰ button on the left, the
// page's name in the middle, an optional round button on the right.

import type { ReactNode } from "react";
import { useL } from "@/mobile/i18n";
import CircleButton from "./CircleButton";
import { useIrisShell, useMenuSwipe } from "./IrisShell";
import { MenuIcon } from "./icons";

export default function PageHeader({ title, right }: { title?: ReactNode; right?: ReactNode }) {
  const l = useL();
  const shell = useIrisShell();
  // A page with the menu button: sliding it to the right opens the menu too.
  useMenuSwipe();
  return (
    <header className="relative flex h-[60px] shrink-0 items-center gap-2 px-[15px] pt-[8px]">
      <CircleButton label={l("Menü", "Menu")} onClick={shell.openDrawer}>
        <MenuIcon size={24} />
      </CircleButton>
      {title && <h1 className="pointer-events-none absolute inset-x-[68px] bottom-[8px] top-[8px] flex items-center justify-center truncate text-center text-[17px] font-medium text-[#0B0B0C]">{title}</h1>}
      <span className="ml-auto flex items-center gap-2">{right}</span>
    </header>
  );
}

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Bugün", "Dün", "16 Eyl" (with the year when it is not this year), as the Gemini lists show dates. */
export function shortDate(at: number, language: "tr" | "en"): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  const date = new Date(at);
  const now = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return language === "tr" ? "Bugün" : "Today";
  if (days === 1) return language === "tr" ? "Dün" : "Yesterday";
  const month = (language === "tr" ? MONTHS_TR : MONTHS_EN)[date.getMonth()];
  const base = language === "tr" ? `${date.getDate()} ${month}` : `${month} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}
