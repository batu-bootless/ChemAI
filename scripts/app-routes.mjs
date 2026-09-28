// Post-processes the static export (out/) for the app. Run after `next build` (npm run build:app does).
//
// 1. Segment prefetch files: the Next.js 16 client asks for flat names such as
//    /dashboard/calculators/__next.dashboard.calculators.__PAGE__.txt
//    (convertSegmentPathToStaticExportFilename), but the export writes them nested
//    (__next.dashboard/calculators/__PAGE__.txt), so every prefetch would miss. They are moved to
//    the flat names.
// 2. Writes out/_app/routes.json for the app's route resolver (android/.../AppRoutes.java):
//    - pages:   every exported page directory ("/dashboard/calculators/")
//    - dynamic: for each route exported once under the "_" placeholder (a canvas, a conversation,
//               a class), a pattern that maps any id in that position onto the placeholder.
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const APP = path.join(ROOT, "src", "app");
const PLACEHOLDER = "_";

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

const toUrlPath = (segments) => (segments.length ? `/${segments.join("/")}/` : "/");

const segmentMoves = [];
for await (const file of files(OUT)) {
  const parts = path.relative(OUT, file).split(path.sep);
  // <route dir>/__next.<segment>/<segment>/.../<name>.txt -> <route dir>/__next.<segment>.<segment>....<name>.txt
  const start = parts.findIndex((part, i) => i < parts.length - 1 && part.startsWith("__next."));
  if (start < 0) continue;
  const routeDir = path.join(OUT, ...parts.slice(0, start));
  segmentMoves.push({
    from: file,
    to: path.join(routeDir, parts.slice(start).join(".")),
    nestedRoot: path.join(routeDir, parts[start]),
  });
}
for (const move of segmentMoves) await rename(move.from, move.to);
for (const dir of new Set(segmentMoves.map((move) => move.nestedRoot))) {
  await rm(dir, { recursive: true, force: true });
}
console.log(`segment prefetch files: ${segmentMoves.length} moved to flat names`);

const pages = [];
for await (const file of files(OUT)) {
  if (path.basename(file) !== "index.html") continue;
  pages.push(toUrlPath(path.relative(OUT, path.dirname(file)).split(path.sep).filter(Boolean)));
}
pages.sort();

const dynamic = new Map();
for await (const file of files(APP)) {
  if (path.basename(file) !== "page.tsx") continue;
  // Route groups such as (protected) are not part of the URL.
  const segments = path
    .relative(APP, path.dirname(file))
    .split(path.sep)
    .filter((segment) => segment && !/^\(.+\)$/.test(segment));
  const index = segments.findIndex((segment) => /^\[[^.\]]+\]$/.test(segment));
  if (index < 0) continue;
  const prefix = toUrlPath(segments.slice(0, index));
  if (!pages.includes(`${prefix}${PLACEHOLDER}/`) || dynamic.has(prefix)) continue;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  dynamic.set(prefix, { pattern: `^${escaped}[^/]+/`, replacement: `${prefix}${PLACEHOLDER}/` });
}

// Longest prefix first, so nested routes win over their parents.
const routes = {
  pages,
  dynamic: [...dynamic.entries()].sort(([a], [b]) => b.length - a.length).map(([, route]) => route),
};

await mkdir(path.join(OUT, "_app"), { recursive: true });
await writeFile(path.join(OUT, "_app", "routes.json"), `${JSON.stringify(routes, null, 2)}\n`);
console.log(`routes.json: ${pages.length} pages, ${routes.dynamic.length} dynamic routes`);
for (const route of routes.dynamic) console.log(`  ${route.pattern} -> ${route.replacement}`);
