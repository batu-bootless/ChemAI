// ChemAI's brand images, drawn from its vector logo (public/brand/chemai-logo.svg - "ChemAI." with
// the "AI." on yellow sun rays - and chemai-mark.svg, its "AI." alone; both traced from the
// artwork by scripts/trace_logo.py). Every image is rendered straight at its own size from the
// vectors (resvg), so none is ever an enlarged or re-compressed copy.
//
//   Android   launcher icon (adaptive: the wordmark on white; themed: its letters), legacy icons,
//             status-bar icon for timer alarms ("AI." in white), splash logo
//   web       favicon and Apple touch icon ("AI." on white)
//   store     Play Store icon
//
// Usage:  node scripts/brand-icons.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(import.meta.dirname, "..");
const res = path.join(root, "android", "app", "src", "main", "res");
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** A vector file taken apart: its viewBox, what it defines, and its two layers (rays, letters). */
async function art(file) {
  const svg = await readFile(path.join(root, "public", "brand", file), "utf8");
  const [x, y, w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? "";
  const rays = svg.match(/<path fill="url\(#rays\)"[^>]*\/>/)?.[0] ?? "";
  const letters = svg.match(/<path fill="#[0-9A-Fa-f]{6}"[^>]*\/>/)?.[0] ?? "";
  return { x, y, w, h, defs, rays, letters };
}

/**
 * An image `width` × `height` px: an optional ground (white square, rounded square or circle) and the
 * art `artWidth` px wide in its middle. `only`: "letters" draws just the letters, in `color`.
 */
function compose(logo, { width, height, artWidth, ground = null, radius = 0, only = null, color = null }) {
  const scale = artWidth / logo.w;
  const tx = (width - logo.w * scale) / 2 - logo.x * scale;
  const ty = (height - logo.h * scale) / 2 - logo.y * scale;
  const groundShape =
    ground === "circle"
      ? `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="#FFFFFF"/>`
      : ground
        ? `<rect width="${width}" height="${height}" rx="${radius}" fill="#FFFFFF"/>`
        : "";
  const letters = color ? logo.letters.replace(/fill="#[0-9A-Fa-f]{6}"/, `fill="${color}"`) : logo.letters;
  const body = only === "letters" ? letters : `${logo.rays}${letters}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${logo.defs}${groundShape}<g transform="translate(${tx} ${ty}) scale(${scale})">${body}</g></svg>`;
}

async function png(svg, file) {
  const out = new Resvg(svg, { fitTo: { mode: "original" }, shapeRendering: 2 }).render().asPng();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, out);
  console.log(`  ${path.relative(root, file)}`);
}

const logo = await art("chemai-logo.svg");
const mark = await art("chemai-mark.svg");

console.log("Launcher icons");
for (const [name, density] of Object.entries(DENSITIES)) {
  const px = (dp) => Math.round(dp * density);
  // Adaptive layer (108 dp): the wordmark 62 dp wide stays inside the 66 dp circle every launcher shows.
  const layer = px(108);
  await png(compose(logo, { width: layer, height: layer, artWidth: px(62) }), path.join(res, `mipmap-${name}`, "ic_launcher_foreground.png"));
  await png(compose(logo, { width: layer, height: layer, artWidth: px(62), only: "letters", color: "#FFFFFF" }), path.join(res, `mipmap-${name}`, "ic_launcher_monochrome.png"));
  // Before Android 8: the icon itself, a white rounded square (or circle) with the wordmark.
  const legacy = px(48);
  const inner = px(44);
  const pad = (legacy - inner) / 2;
  const square = compose(logo, { width: inner, height: inner, artWidth: inner * 0.84, ground: "square", radius: inner * 0.22 });
  const circle = compose(logo, { width: inner, height: inner, artWidth: inner * 0.78, ground: "circle" });
  const framed = (svg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${legacy}" height="${legacy}"><g transform="translate(${pad} ${pad})">${svg}</g></svg>`;
  await png(framed(square), path.join(res, `mipmap-${name}`, "ic_launcher.png"));
  await png(framed(circle), path.join(res, `mipmap-${name}`, "ic_launcher_round.png"));
}

console.log("Status bar icon and splash");
for (const [name, density] of Object.entries(DENSITIES)) {
  const px = (dp) => Math.round(dp * density);
  // Status-bar icons are one colour: the "AI." letters, white.
  await png(compose(mark, { width: px(24), height: px(24), artWidth: px(21), only: "letters", color: "#FFFFFF" }), path.join(res, `drawable-${name}`, "ic_notification.png"));
  const splashWidth = px(220);
  await png(compose(logo, { width: splashWidth, height: Math.round((splashWidth * logo.h) / logo.w), artWidth: splashWidth }), path.join(res, `drawable-${name}`, "splash_logo.png"));
}

console.log("Web and store");
await png(compose(mark, { width: 256, height: 256, artWidth: 200, ground: "square", radius: 56 }), path.join(root, "public", "seo", "favicon.png"));
await png(compose(mark, { width: 180, height: 180, artWidth: 132, ground: "square" }), path.join(root, "public", "seo", "apple-touch-icon.png"));
await png(compose(logo, { width: 512, height: 512, artWidth: 420, ground: "square" }), path.join(root, "store", "play-icon-512.png"));
