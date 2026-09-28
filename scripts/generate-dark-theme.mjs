// Writes src/app/app-dark.css and src/app/app-paper.css: the app's dark theme and its cream
// paper theme, for the website's light-only dashboard code.
// Run by `npm run build:app` (and by hand after changing colors in src/).
//
// The dashboard was written for a light page (bg-white, text-gray-900, border-gray-200, ...).
// Instead of adding dark: variants to thousands of class lists, this script scans src/ for the
// color utilities in use and gives each one a dark counterpart (Apple's dark palette) under
// html.dark. Elements that already carry their own dark: variant for that property are left
// alone, and so is anything inside an .app-light island (e.g. a drawing canvas that must stay white).
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(SRC, "app", "app-dark.css");
const OUT_PAPER = path.join(SRC, "app", "app-paper.css");

// --- Palette -------------------------------------------------------------------------------------
const PAGE = "#000000";
const SURFACE = [28, 28, 30]; // #1C1C1E  cards (bg-white)
const INSET = [36, 36, 38]; // #242426  soft fills (bg-gray-50)
const FILL = [44, 44, 46]; // #2C2C2E  bg-gray-100
const FILL_2 = [58, 58, 60]; // #3A3A3C  bg-gray-200, dark buttons
const FILL_3 = [72, 72, 74]; // #48484A
const BRAND = [216, 170, 203]; // brand purple, lightened for dark backgrounds
const BRAND_SOLID = "#8A5D79";
const BRAND_SOLID_HOVER = "#9B6C8A";

const TEXT = { 950: "#F5F5F7", 900: "#F5F5F7", 800: "#E5E5EA", 700: "#D1D1D6", 600: "#AEAEB2", 500: "#98989D", 400: "#7C7C82", 300: "#5A5A5F" };
const NEUTRAL_BG = { 50: INSET, 100: FILL, 200: FILL_2, 300: FILL_3, 400: [99, 99, 102], 700: FILL_2, 800: FILL_2, 900: FILL_2, 950: FILL_2 };
const BORDER_ALPHA = { 50: 0.06, 100: 0.07, 200: 0.11, 300: 0.17, 400: 0.24 };

// Tailwind's 500 shades (tints) and the lighter shades used for text on dark backgrounds.
const TINTS = {
  red: [[239, 68, 68], "#f87171", "#fca5a5"],
  orange: [[249, 115, 22], "#fb923c", "#fdba74"],
  amber: [[245, 158, 11], "#fbbf24", "#fcd34d"],
  yellow: [[234, 179, 8], "#facc15", "#fde047"],
  lime: [[132, 204, 22], "#a3e635", "#bef264"],
  green: [[34, 197, 94], "#4ade80", "#86efac"],
  emerald: [[16, 185, 129], "#34d399", "#6ee7b7"],
  teal: [[20, 184, 166], "#2dd4bf", "#5eead4"],
  cyan: [[6, 182, 212], "#22d3ee", "#67e8f9"],
  sky: [[14, 165, 233], "#38bdf8", "#7dd3fc"],
  blue: [[59, 130, 246], "#60a5fa", "#93c5fd"],
  indigo: [[99, 102, 241], "#818cf8", "#a5b4fc"],
  violet: [[139, 92, 246], "#a78bfa", "#c4b5fd"],
  purple: [[168, 85, 247], "#c084fc", "#d8b4fe"],
  fuchsia: [[217, 70, 239], "#e879f9", "#f0abfc"],
  pink: [[236, 72, 153], "#f472b6", "#f9a8d4"],
  rose: [[244, 63, 94], "#fb7185", "#fda4af"],
};

// Apple-style hex colors used by some modules (Lab Notebook, Messages, ...).
const HEX = {
  text: {
    "1d1d1f": TEXT[900], "86868b": TEXT[500], "6e6e73": TEXT[600], "737373": "#A8A8A8", b0b0b5: TEXT[400],
    "6d445e": rgb(BRAND), "007aff": "#0A84FF", "0066d6": "#409CFF", af52de: "#BF5AF2", "9540c1": "#DA8FFF",
    ff3b30: "#FF453A", "7a5400": "#FFD60A",
  },
  bg: {
    fafafa: INSET, f5f7fb: INSET, f6f8fb: INSET, f5f5f7: INSET, f2f2f2: INSET, efefef: FILL, e9e9eb: [38, 38, 38],
    d2d2d7: FILL_3, dedee2: FILL_2, "1d1d1f": FILL_2, eaf4ff: [10, 132, 255, 0.16], fff1bf: [255, 214, 10, 0.18],
    "6d445e": BRAND_SOLID, "5a3850": BRAND_SOLID_HOVER,
  },
  border: { e5e5ea: 0.12, d2d2d7: 0.14, eee: 0.1, f2f2f2: 0.08 },
};
const HEX_BRAND = "6d445e";

// --- Paper (light theme) -------------------------------------------------------------------------
// The paper theme is a third theme next to light and dark: cream instead of white, easier on the
// eyes. The page is the colour the user asked for; cards sit a shade lighter and fills a shade
// deeper. It is chosen in Account settings and applies under html.paper.
const PAPER_PAGE = "#FFFCEC";
const PAPER_CARD = [255, 254, 248];
const PAPER_FILL = [252, 250, 240];
const PAPER_FILL_2 = [246, 243, 231];

// The light utilities that carry a surface; everything else keeps the website's colour.
const PAPER_SOFT = new Set([
  "gray-50", "slate-50", "zinc-50", "neutral-50", "stone-50",
  "[#fafafa]", "[#f5f5f7]", "[#f6f8fb]", "[#f5f7fb]", "[#f2f2f2]", "[#f9fafb]", "[#f7f6f4]",
]);
const PAPER_SOFT_2 = new Set(["gray-100", "slate-100", "zinc-100", "neutral-100", "[#efefef]", "[#eeeeee]"]);

/** Cream value for one light utility, or null to leave it as it is. */
function paperValue(property, color, alpha) {
  const a = alpha === undefined ? undefined : alpha / 100;
  if (property === "bg" || property === "from" || property === "via" || property === "to") {
    if (color === "white") return a === undefined || a >= 0.4 ? rgb(PAPER_CARD, a) : null;
    if (PAPER_SOFT.has(color)) return rgb(PAPER_FILL, a);
    if (PAPER_SOFT_2.has(color)) return rgb(PAPER_FILL_2, a);
  }
  return null;
}

// Page-level backgrounds turn black; the same colors inside cards become a soft fill.
const PAGE_BG = new Set(["gray-50", "slate-50", "[#f6f8fb]", "[#f5f7fb]", "[#f5f5f7]", "[#fafafa]"]);

// --- Helpers -------------------------------------------------------------------------------------
function rgb([r, g, b, a], alpha) {
  const opacity = alpha ?? a;
  return opacity === undefined || opacity === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${round(opacity)})`;
}
const round = (n) => Math.round(n * 1000) / 1000;
const escape = (cls) => cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

const VARIANTS = {
  "": { state: "" },
  "hover:": { state: ":hover", media: "(hover: hover)" },
  "group-hover:": { state: "", group: ".group:hover " , media: "(hover: hover)" },
  "focus:": { state: ":focus" },
  "focus-visible:": { state: ":focus-visible" },
  "focus-within:": { state: ":focus-within" },
  "active:": { state: ":active" },
  "disabled:": { state: ":disabled" },
  "odd:": { state: ":nth-child(odd)" },
  "data-active:": { state: "[data-active]" },
  "lg:": { state: "", media: "(width >= 64rem)" },
};

const PROPERTIES = {
  bg: { css: "background-color", own: "bg-" },
  text: { css: "color", own: "text-" },
  border: { css: "border-color", own: "border-" },
  divide: { css: "border-color", own: "divide-", children: " > :not(:last-child)" },
  ring: { css: "--tw-ring-color", own: "ring-" },
  from: { css: "--tw-gradient-from", own: "from-" },
  via: { css: "--tw-gradient-via", own: "via-" },
  to: { css: "--tw-gradient-to", own: "to-" },
  placeholder: { css: "color", own: "placeholder", pseudo: "::placeholder" },
};

/** Dark value for one light utility, or null to leave it as it is. */
function darkValue(property, color, alpha) {
  const hex = color.match(/^\[#([0-9a-fA-F]{3,8})\]$/)?.[1]?.toLowerCase();
  const [, family, shadeText] = color.match(/^([a-z]+(?:-[a-z]+)?)-(\d{2,3})$/) ?? [];
  const shade = Number(shadeText);
  const a = alpha === undefined ? undefined : alpha / 100;

  if (property === "placeholder") return family === "gray" || family === "slate" || hex ? "#6E6E73" : null;

  if (hex) {
    if (hex === HEX_BRAND) {
      if (property === "text") return rgb(BRAND);
      if (property === "bg") return a === undefined ? BRAND_SOLID : rgb(BRAND, Math.min(0.3, a * 1.2));
      if (property === "ring") return rgb(BRAND, 0.3);
      if (property === "border" || property === "divide") return rgb(BRAND, 0.45);
      return null;
    }
    if (property === "border" || property === "divide") {
      if (hex === "1d1d1f") return TEXT[900];
      const opacity = HEX.border[hex];
      return opacity === undefined ? null : rgb([255, 255, 255], opacity);
    }
    if (property === "ring") return hex === "eaf4ff" ? rgb([10, 132, 255], 0.25) : null;
    const value = HEX[property]?.[hex];
    if (value === undefined) return null;
    return typeof value === "string" ? value : rgb(value, a);
  }

  if (color === "white") {
    if (property === "bg") return a === undefined || a >= 0.5 ? rgb(SURFACE, a) : null;
    if (property === "border") return a === undefined ? rgb(SURFACE) : null;
    if (property === "from" || property === "via" || property === "to") return PAGE;
    return null;
  }
  if (color === "black") {
    if (property === "text") return a === undefined ? TEXT[900] : rgb([245, 245, 247], a);
    if (property === "bg") return a !== undefined && a <= 0.1 ? rgb([255, 255, 255], a + 0.02) : null;
    if (property === "border" || property === "ring") return a !== undefined && a <= 0.1 ? rgb([255, 255, 255], 0.1) : null;
    return null;
  }

  if (color === "brand-purple") {
    if (property === "text") return rgb(BRAND);
    if (property === "bg") return a === undefined ? BRAND_SOLID : a >= 0.8 ? rgb([138, 93, 121], a) : rgb(BRAND, Math.min(0.3, a * 1.2));
    if (property === "border") return rgb(BRAND, a === undefined ? 0.5 : Math.min(0.6, a + 0.2));
    if (property === "ring") return rgb(BRAND, 0.35);
    return null;
  }
  if (color === "brand-teal") return property === "text" ? "#7FC3CF" : null;

  if (["gray", "slate", "zinc", "neutral", "stone"].includes(family)) {
    switch (property) {
      case "text":
        return TEXT[shade] ? (a === undefined ? TEXT[shade] : `color-mix(in srgb, ${TEXT[shade]} ${Math.round(a * 100)}%, transparent)`) : null;
      case "bg":
        return NEUTRAL_BG[shade] ? rgb(NEUTRAL_BG[shade], a) : null;
      case "border":
      case "divide":
        if (shade >= 700) return property === "border" ? (shade >= 900 ? TEXT[900] : TEXT[600]) : null;
        return BORDER_ALPHA[shade] !== undefined ? rgb([255, 255, 255], BORDER_ALPHA[shade] + 0.02) : null;
      case "ring":
        if (shade >= 900) return TEXT[900];
        return shade <= 400 ? rgb([255, 255, 255], shade === 400 ? 0.25 : 0.1) : null;
      case "from":
      case "via":
      case "to":
        return shade <= 200 ? rgb(shade === 50 ? [17, 17, 19] : SURFACE) : null;
    }
    return null;
  }

  const tint = TINTS[family];
  if (!tint) return null;
  const [base, light, lighter] = tint;
  switch (property) {
    case "text":
      if (shade <= 400) return null;
      return shade <= 600 ? light : lighter;
    case "bg":
      if (shade === 50) return rgb(base, a === undefined ? 0.14 : Math.max(0.08, a * 0.2));
      if (shade === 100) return rgb(base, 0.22);
      if (shade === 200) return rgb(base, 0.3);
      return null;
    case "border":
    case "divide":
      return shade <= 300 ? rgb(base, { 50: 0.15, 100: 0.22, 200: 0.32, 300: 0.42 }[shade]) : null;
    case "ring":
      return shade <= 200 ? rgb(base, 0.3) : null;
    case "from":
    case "via":
    case "to":
      return shade <= 100 ? rgb(base, 0.12) : null;
  }
  return null;
}

// --- Scan ----------------------------------------------------------------------------------------
async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) yield full;
  }
}

const CLASS = /(?<![\w:[\/-])((?:[a-z-]+:)*)(bg|text|border|divide|ring|from|via|to|placeholder)-((?:white|black|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|brand-(?:purple|teal))|\[#[0-9a-fA-F]{3,8}\])(?:\/(\d{1,3}))?(?![\w\]-])/g;

const used = new Map();
for await (const file of sourceFiles(SRC)) {
  if (file.includes(`${path.sep}components${path.sep}ui${path.sep}`)) continue;
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(CLASS)) {
    const [whole, variants, property, color, alpha] = match;
    if (variants.includes("dark:")) continue;
    used.set(whole, { variants, property, color, alpha: alpha === undefined ? undefined : Number(alpha) });
  }
}

// --- Emit ----------------------------------------------------------------------------------------
const rules = new Map(); // media -> lines
function addRule(media, selector, declaration) {
  const key = media ?? "";
  if (!rules.has(key)) rules.set(key, []);
  rules.get(key).push(`${selector} { ${declaration} }`);
}

const ISLAND = ".app-light, .app-light *";
let skipped = 0;
for (const [cls, { variants, property, color, alpha }] of [...used].sort(([a], [b]) => a.localeCompare(b))) {
  const variant = VARIANTS[variants];
  const spec = PROPERTIES[property];
  if (!variant || !spec) {
    skipped++;
    continue;
  }
  const value = darkValue(property, color.toLowerCase(), alpha);
  if (!value) continue;

  // An element that sets its own dark color for this property (dark:bg-…, dark:hover:bg-…) keeps it.
  const own = [...new Set([`dark:${variants}${spec.own}`, `${variants}dark:${spec.own}`])];
  const exclude = `:not(${own.map((prefix) => `[class*="${prefix}"]`).join(", ")}, ${ISLAND})`;
  const target = `.${escape(cls)}${variant.state}${exclude}`;
  const scope = `html.dark ${variant.group ?? ""}`;
  const selector = `${scope}${target}${spec.children ?? ""}${spec.pseudo ?? ""}`;
  addRule(variant.media, selector, `${spec.css}: ${value};`);

  if (property === "bg" && !variants && PAGE_BG.has(color.toLowerCase())) {
    addRule(undefined, `html.dark :is(main, .min-h-screen, .h-screen)${target}`, `background-color: ${PAGE};`);
  }
}

// --- Paper rules ---------------------------------------------------------------------------------
const paperRules = new Map();
function addPaperRule(media, selector, declaration) {
  const key = media ?? "";
  if (!paperRules.has(key)) paperRules.set(key, []);
  paperRules.get(key).push(`${selector} { ${declaration} }`);
}

for (const [cls, { variants, property, color, alpha }] of [...used].sort(([a], [b]) => a.localeCompare(b))) {
  const variant = VARIANTS[variants];
  const spec = PROPERTIES[property];
  if (!variant || !spec) continue;
  const value = paperValue(property, color.toLowerCase(), alpha);
  if (!value) continue;

  const target = `.${escape(cls)}${variant.state}:not(${ISLAND})`;
  const scope = `html.paper ${variant.group ?? ""}`;
  addPaperRule(variant.media, `${scope}${target}${spec.children ?? ""}`, `${spec.css}: ${value};`);

  if (property === "bg" && !variants && PAGE_BG.has(color.toLowerCase())) {
    addPaperRule(
      undefined,
      `html.paper :is(main, .min-h-screen, .h-screen)${target}`,
      `background-color: ${PAPER_PAGE};`
    );
  }
}

const paperHeader = `/* Chem AI: the cream paper theme. GENERATED by
   scripts/generate-dark-theme.mjs from the classes used in src/ - do not edit by hand. */`;

const paperBase = `
html.paper {
  --app-page-bg: ${PAPER_PAGE};
  /* The middle of the soft wash behind the home greeting and the account header. */
  --app-wash-mid: ${PAPER_PAGE};
  --background: ${PAPER_PAGE};
  --card: ${rgb(PAPER_CARD)};
  --popover: ${rgb(PAPER_CARD)};
  --secondary: ${rgb(PAPER_FILL)};
  --muted: ${rgb(PAPER_FILL)};
  --accent: ${rgb(PAPER_FILL)};
}

html.paper body {
  background-color: ${PAPER_PAGE};
}

/* Inputs keep a lighter sheet than the card they sit on. */
html.paper :is(input, textarea, select).bg-white:not(${ISLAND}) {
  background-color: ${rgb(PAPER_CARD)};
}
`;

let paperCss = `${paperHeader}\n${paperBase}\n`;
for (const [media, lines] of paperRules) {
  if (!media) paperCss += `${lines.join("\n")}\n`;
  else paperCss += `\n@media ${media} {\n${lines.map((line) => `  ${line}`).join("\n")}\n}\n`;
}
await writeFile(OUT_PAPER, paperCss);
const paperCount = [...paperRules.values()].reduce((sum, lines) => sum + lines.length, 0);
console.log(`paper theme: ${paperCount} rules -> ${path.relative(ROOT, OUT_PAPER)}`);

const header = `/* Chem AI: dark theme for the app's light utilities. GENERATED by
   scripts/generate-dark-theme.mjs from the classes used in src/ - do not edit by hand. */`;

const base = `
html.dark {
  --background: #000000;
  --foreground: #f5f5f7;
  --card: #1c1c1e;
  --card-foreground: #f5f5f7;
  --popover: #1c1c1e;
  --popover-foreground: #f5f5f7;
  --secondary: #2c2c2e;
  --secondary-foreground: #f5f5f7;
  --muted: #2c2c2e;
  --muted-foreground: #98989d;
  --accent: #2c2c2e;
  --accent-foreground: #f5f5f7;
  --border: rgb(255 255 255 / 0.12);
  --input: rgb(255 255 255 / 0.16);
  color: #f5f5f7;
}

html.dark input.bg-white:not([class*="dark:bg-"], ${ISLAND}),
html.dark textarea.bg-white:not([class*="dark:bg-"], ${ISLAND}),
html.dark select.bg-white:not([class*="dark:bg-"], ${ISLAND}) {
  background-color: ${rgb(FILL)};
}

/* Brand artwork drawn for light backgrounds (the Chem+ wordmark). */
html.dark img[data-site-image="logo"]:not(${ISLAND}) {
  filter: invert(1) hue-rotate(180deg) saturate(1.15);
}

/* Parts that must stay light (drawing canvases, previews of printed pages). */
html.dark .app-light {
  color-scheme: light;
  color: #0a0a0a;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
}
`;

let css = `${header}\n${base}\n`;
for (const [media, lines] of rules) {
  if (!media) css += `${lines.join("\n")}\n`;
  else css += `\n@media ${media} {\n${lines.map((line) => `  ${line}`).join("\n")}\n}\n`;
}
await writeFile(OUT, css);
const count = [...rules.values()].reduce((sum, lines) => sum + lines.length, 0);
console.log(`dark theme: ${count} rules for ${used.size} color utilities (${skipped} with unsupported variants) -> ${path.relative(ROOT, OUT)}`);
