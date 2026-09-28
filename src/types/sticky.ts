export type StickyColor =
  | "yellow"
  | "blue"
  | "green"
  | "pink"
  | "purple"
  | "orange"
  | "cream"
  | "white"
  | "gray";

export interface StickyNote {
  id: string;
  title: string;
  /** Tiptap document, serialized as JSON string. */
  content: string;
  color: StickyColor;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Minimized: only the header bar is shown. */
  collapsed: boolean;
  /** Always-on-top of other (non-pinned) notes. */
  pinned: boolean;
  /** Hidden via the close (x) button — data is kept, note is just not rendered. */
  closed: boolean;
  /** Moved to the archive via the menu or Delete key — kept, hidden from the main layer. */
  archived: boolean;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
}

export const STICKY_COLOR_HEX: Record<StickyColor, string> = {
  yellow: "#f4ce4f",
  blue: "#6fa8dc",
  green: "#6fbf8b",
  pink: "#e78bb0",
  purple: "#9b8ad1",
  orange: "#e8934a",
  cream: "#e0c9a6",
  white: "#e5e7eb",
  gray: "#9ca3af",
};

export const STICKY_COLOR_LABELS: Record<StickyColor, string> = {
  yellow: "Sarı",
  blue: "Mavi",
  green: "Yeşil",
  pink: "Pembe",
  purple: "Mor",
  orange: "Turuncu",
  cream: "Krem",
  white: "Beyaz",
  gray: "Gri",
};

// Chem+ app: shown when the app is in English.
export const STICKY_COLOR_LABELS_EN: Record<StickyColor, string> = {
  yellow: "Yellow",
  blue: "Blue",
  green: "Green",
  pink: "Pink",
  purple: "Purple",
  orange: "Orange",
  cream: "Cream",
  white: "White",
  gray: "Gray",
};

export const STICKY_MIN_WIDTH = 300;
export const STICKY_MIN_HEIGHT = 250;
export const STICKY_MAX_WIDTH = 1000;
export const STICKY_MAX_HEIGHT = 900;
export const STICKY_DEFAULT_WIDTH = 420;
export const STICKY_DEFAULT_HEIGHT = 420;
