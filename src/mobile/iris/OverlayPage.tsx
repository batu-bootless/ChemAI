"use client";

// ChemAI: a full-screen page over the current one (a document, a picture, a running protocol):
// a back button, a title and an optional ⋯ menu, sliding in from the right.

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useL } from "@/mobile/i18n";
import CircleButton from "./CircleButton";
import { ChevronLeftIcon, MoreIcon } from "./icons";
import { useOverlay } from "./useOverlay";
import { IRIS } from "./theme";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export function GlassMenu({ items, align = "right", onClose }: { items: MenuItem[]; align?: "left" | "right"; onClose: () => void }) {
  const reduce = useReducedMotion();
  useOverlay(true, onClose);
  return (
    <>
      <button type="button" aria-label="×" className="fixed inset-0 z-[95] cursor-default" onClick={onClose} />
      {/* Placed by this outer box: .app-glass-light sets its own position (relative), which would
          put the menu in the row instead of over it. */}
      <motion.div
        role="menu"
        className={`absolute top-full z-[96] mt-2 w-[236px] ${align === "right" ? "right-0" : "left-0"}`}
        style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
        initial={reduce ? false : { opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? undefined : { opacity: 0, y: -8, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      >
        <div className="app-glass-light rounded-[22px] p-1.5">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`relative z-[2] flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[16px] active:bg-[#1C1C22]/[0.06] ${item.danger ? "text-[#D7263D]" : "text-[#0B0B0C]"}`}
          >
            {item.icon && <span className="grid size-5 shrink-0 place-items-center">{item.icon}</span>}
            {item.label}
          </button>
        ))}
        </div>
      </motion.div>
    </>
  );
}

export default function OverlayPage({
  title,
  onClose,
  menu,
  dark = false,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  menu?: MenuItem[];
  dark?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const l = useL();
  const reduce = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  useOverlay(true, onClose);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="iris-ui fixed inset-0 z-[90] flex flex-col"
      style={{ background: dark ? "#000" : IRIS.bg, paddingTop: "var(--app-safe-top)" }}
      initial={reduce ? { opacity: 0 } : { x: "100%" }}
      animate={reduce ? { opacity: 1 } : { x: 0 }}
      exit={reduce ? { opacity: 0 } : { x: "100%" }}
      transition={{ type: "spring", stiffness: 420, damping: 42 }}
    >
      <header className="relative flex h-[60px] shrink-0 items-center gap-2 px-[15px] pt-[8px]">
        <CircleButton label={l("Geri", "Back")} onClick={onClose}>
          <ChevronLeftIcon size={24} strokeWidth={1.9} />
        </CircleButton>
        <h1 className={`pointer-events-none absolute inset-x-[68px] bottom-[8px] top-[8px] flex items-center justify-center truncate text-[17px] font-medium ${dark ? "text-white" : "text-[#0B0B0C]"}`}>
          <span className="truncate">{title}</span>
        </h1>
        {menu && menu.length > 0 && (
          <div className="relative ml-auto">
            <CircleButton label={l("Diğer", "More")} onClick={() => setMenuOpen((value) => !value)} active={menuOpen}>
              <MoreIcon size={24} />
            </CircleButton>
            <AnimatePresence>{menuOpen && <GlassMenu items={menu} onClose={() => setMenuOpen(false)} />}</AnimatePresence>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: "calc(var(--app-safe-bottom) + 14px)" }}>{footer}</div>}
    </motion.div>
  );
}
