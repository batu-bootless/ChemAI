// Chem+ app: the ink outline and offset shadow the app's flat cards are drawn with.
//
// Black ink on the light page, white on the app's black page. Every surface built from these
// tokens is an `.app-light` island, so the generated dark theme never repaints it and the card
// says what to do in dark mode itself.
//
// This started in the folders module and now belongs to every module, which is why it lives here;
// `mobile/folders/ink.ts` re-exports it so the folder code keeps its short import.
export const INK_BORDER = "border-[#111] dark:border-white/80";
export const INK_SHADOW = "shadow-[3px_3px_0_#111] dark:shadow-[3px_3px_0_rgb(255_255_255/0.8)]";
/** For the small pieces - chips, tags - where a 3px shadow would be heavier than the piece. */
export const INK_SHADOW_SM = "shadow-[2px_2px_0_#111] dark:shadow-[2px_2px_0_rgb(255_255_255/0.8)]";

export interface InkPalette {
  /** The card's face. */
  fill: string;
  /** The darker shade, used for a folder tab or a header strip. */
  tab: string;
  /** Title text on `fill`. */
  ink: string;
  /** Secondary text on `fill`. */
  sub: string;
  /** A far lighter tint of the same hue, for a panel that must not shout. */
  soft: string;
}

/**
 * The flat pastel set. The first six are the folder colours, unchanged, so a folder and a module
 * card sitting next to each other on the home screen belong to the same drawing.
 */
export const INK_COLORS = {
  orange: { fill: "#F0A960", tab: "#DC9448", soft: "#FBEBD9", ink: "#22150A", sub: "#4F3620" },
  purple: { fill: "#C3A5FB", tab: "#AE8CF5", soft: "#EDE6FD", ink: "#190E2E", sub: "#3D2A63" },
  teal: { fill: "#8FD8D4", tab: "#6FC3BE", soft: "#E2F5F4", ink: "#07211F", sub: "#204744" },
  pink: { fill: "#F5A8C7", tab: "#E58EB4", soft: "#FCE9F1", ink: "#27101B", sub: "#57263C" },
  green: { fill: "#AEDF97", tab: "#92CB79", soft: "#EEF7E7", ink: "#111F09", sub: "#2F4823" },
  yellow: { fill: "#F6D573", tab: "#E3BE54", soft: "#FCF3DA", ink: "#241C05", sub: "#4E3F14" },
  blue: { fill: "#9EC4F8", tab: "#7FACEF", soft: "#E6F0FD", ink: "#0A1628", sub: "#23405F" },
  red: { fill: "#F79B8E", tab: "#E8806F", soft: "#FDEAE7", ink: "#2A0E09", sub: "#5C2A20" },
  lime: { fill: "#D3E86A", tab: "#BCD24F", soft: "#F3F8DE", ink: "#1C2405", sub: "#414D16" },
  brown: { fill: "#D9B18C", tab: "#C49A72", soft: "#F5EBE1", ink: "#26180C", sub: "#523823" },
  cyan: { fill: "#93DCF0", tab: "#72C8E0", soft: "#E4F6FC", ink: "#06202A", sub: "#1C4351" },
  indigo: { fill: "#ADAEF7", tab: "#9192EE", soft: "#EBEBFD", ink: "#101034", sub: "#2E2F66" },
} as const satisfies Record<string, InkPalette>;

export type InkColor = keyof typeof INK_COLORS;
export const INK_COLOR_KEYS = Object.keys(INK_COLORS) as InkColor[];

/**
 * The calculators carry an `accentColor` from the iOS-style symbol palette. This maps that name
 * onto the flat set, so 107 calculators keep the colours they were given rather than being
 * repainted by hand - and two calculators that were the same colour before still are.
 */
export const CALCULATOR_INK: Record<string, InkColor> = {
  blue: "blue",
  sky: "cyan",
  cyan: "cyan",
  teal: "teal",
  emerald: "green",
  amber: "yellow",
  orange: "orange",
  red: "red",
  rose: "pink",
  fuchsia: "pink",
  purple: "purple",
  violet: "purple",
  indigo: "indigo",
  slate: "brown",
};

/**
 * The colour each module is drawn in - its own screens, and its cards in the home screen's
 * activity history. The older modules take the flat colour nearest the hue they always had.
 */
export const MODULE_INK: Record<string, InkColor> = {
  calculators: "orange",
  chemdraw: "pink",
  "virtual-lab": "green",
  "lab-notebook": "blue",
  "graph-studio": "teal",
  miew: "purple",
  "pdf-search": "brown",
  notes: "yellow",
  "periodic-table": "cyan",
  "medium-buffer": "lime",
  timer: "red",
  workspace: "indigo",
  canvas: "purple",
  messages: "blue",
  safety: "red",
  spectra: "lime",
  flashcards: "pink",
  reactions: "brown",
  analysis: "teal",
  inventory: "orange",
  protocols: "green",
  nomenclature: "indigo",
  trends: "cyan",
};
