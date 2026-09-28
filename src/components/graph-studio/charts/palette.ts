import type { PaletteName } from "@/lib/graph-studio/types";

export const PALETTES: Record<PaletteName, string[]> = {
  default: ["#6D445E", "#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#6366F1"],
  warm: ["#EF4444", "#F97316", "#F59E0B", "#FBBF24", "#DC2626", "#EA580C", "#D97706", "#B91C1C"],
  cool: ["#0EA5E9", "#06B6D4", "#3B82F6", "#6366F1", "#0284C7", "#0891B2", "#2563EB", "#4F46E5"],
  mono: ["#111827", "#374151", "#6B7280", "#9CA3AF", "#1F2937", "#4B5563", "#D1D5DB", "#E5E7EB"],
  viridis: ["#440154", "#414487", "#2A788E", "#22A884", "#7AD151", "#FDE725", "#35B779", "#31688E"],
};

export const PALETTE_LABELS: Record<PaletteName, string> = {
  default: "Varsayılan",
  warm: "Sıcak",
  cool: "Soğuk",
  mono: "Tek renk",
  viridis: "Viridis",
};

export function paletteColor(palette: PaletteName, index: number): string {
  const colors = PALETTES[palette] ?? PALETTES.default;
  return colors[index % colors.length];
}
