"use client";

// ChemAI: the round glass buttons of Iris's headers (☰, new chat, close, more) - 44 px of liquid
// glass that bends what scrolls under it, as in the Gemini app.

import type { ReactNode } from "react";
import { useLiquidGlass } from "@/mobile/ui/liquidGlass";

export default function CircleButton({
  label,
  onClick,
  active,
  children,
  className = "",
  size = 44,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
  size?: number;
}) {
  const { bind, style, filter } = useLiquidGlass<HTMLButtonElement>({ magnify: 1.12, blur: 5 });
  return (
    <button
      ref={bind}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{ ...style, width: size, height: size }}
      className={`app-glass-light app-glass-light-button grid shrink-0 place-items-center rounded-full ${active ? "text-[#0B57D0]" : "text-[#0B0B0C]"} ${className}`}
    >
      {filter}
      <span className="relative z-[2] grid place-items-center">{children}</span>
    </button>
  );
}
