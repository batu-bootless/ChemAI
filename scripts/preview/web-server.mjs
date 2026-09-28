// Serves the exported Chem AI app (out/) the way the Android app does, to check it in a browser
// before building an APK. Run `npm run build:web` first.
//
//   node scripts/preview/web-server.mjs    -> http://localhost:5182/dashboard/
//
// Differences from the app: there is no native bridge in a browser, so Iris's AI answers and
// account deletion (the website's API) and Google sign-in only work in the app. Email sign-in,
// the account settings and Iris's offline planner with the on-device engine work here too.

import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const PORT = Number(process.env.PORT) || 5182;
const OUT = path.resolve(import.meta.dirname, "../../out");

// The live site's /api is behind Vercel's bot check (429 for anything that isn't a real browser),
// so a browser preview cannot use it - on the phone these calls go through a hidden WebView
// (ApiBridge.java). To try Iris's AI answers here, run the website locally
// (`npm run dev` in the web project) and start this server with its address:
//
//   $env:CHEMPLUS_API_ORIGIN = "http://localhost:3000"; node scripts/preview/web-server.mjs
//
// Supabase's session cookies ignore the port, so the local site sees the same signed-in user.
const API_ORIGIN = (process.env.CHEMPLUS_API_ORIGIN || "").replace(/\/$/, "");
const API_UNAVAILABLE =
  "İris'in yapay zekâ yanıtları tarayıcı önizlemesinde çalışmaz (site API'si bot korumasının arkasında; " +
  "telefonda yerel köprüyle çağrılır). Denemek için siteyi yerelde çalıştırıp bu sunucuyu " +
  "CHEMPLUS_API_ORIGIN=http://localhost:3000 ile başlatın.";

// The page list is written by scripts/app-routes.mjs after every build. If it is missing (a build
// that stopped halfway), the pages are scanned out of out/ instead so the preview still starts;
// dynamic routes (canvas, messages, classes) need the real list, so it says what to run.
async function scanPages(directory, prefix = "/") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") && prefix === "/") continue;
    const child = path.join(directory, entry.name);
    if (await isFile(path.join(child, "index.html"))) found.push(`${prefix}${entry.name}/`);
    found.push(...(await scanPages(child, `${prefix}${entry.name}/`)));
  }
  return found;
}

async function loadRoutes() {
  try {
    return JSON.parse(await readFile(path.join(OUT, "_app", "routes.json"), "utf8"));
  } catch {
    const scanned = await scanPages(OUT);
    if (await isFile(path.join(OUT, "index.html"))) scanned.push("/");
    console.warn(
      `out/_app/routes.json yok: ${scanned.length} sayfa out/ taranarak bulundu. ` +
        "Kimlikli sayfalar (kanvas, mesaj, sınıf) için: node scripts/app-routes.mjs",
    );
    return { pages: scanned, dynamic: [] };
  }
}

const routes = await loadRoutes();
const pages = new Set(routes.pages);
const dynamic = routes.dynamic.map(({ pattern, replacement }) => ({ pattern: new RegExp(pattern), replacement }));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function mapDynamic(urlPath) {
  for (const { pattern, replacement } of dynamic) {
    if (pattern.test(urlPath)) return urlPath.replace(pattern, replacement);
  }
  return null;
}

// Same rules as android/app/src/main/java/tr/com/chemplus/app/AppRoutes.java.
async function resolve(urlPath) {
  const last = urlPath.slice(urlPath.lastIndexOf("/") + 1);
  if (last.includes(".")) {
    if (await isFile(path.join(OUT, urlPath))) return urlPath;
    const mapped = mapDynamic(urlPath);
    return mapped && (await isFile(path.join(OUT, mapped))) ? mapped : null;
  }
  const directory = urlPath.endsWith("/") ? urlPath : `${urlPath}/`;
  if (pages.has(directory)) return `${directory}index.html`;
  const mapped = mapDynamic(directory);
  return mapped && pages.has(mapped) ? `${mapped}index.html` : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Forwards /api/... to a locally running website, with the browser's session cookies. */
async function proxyApi(req, res) {
  const json = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(payload));
  };
  if (!API_ORIGIN) {
    json(503, { error: API_UNAVAILABLE });
    return;
  }
  const headers = { accept: req.headers.accept ?? "*/*" };
  for (const name of ["content-type", "cookie", "authorization"]) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  let upstream;
  try {
    upstream = await fetch(`${API_ORIGIN}${req.url}`, { method: req.method, headers, body, redirect: "manual" });
  } catch (error) {
    json(502, { error: `${API_ORIGIN} adresine ulaşılamadı: ${error?.message ?? error}` });
    return;
  }
  const out = { "Cache-Control": "no-store" };
  const type = upstream.headers.get("content-type");
  if (type) out["Content-Type"] = type;
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) out["Set-Cookie"] = cookies;
  res.writeHead(upstream.status, out);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

async function handle(req, res) {
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (urlPath.startsWith("/api/")) {
    await proxyApi(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  const target = await resolve(urlPath);
  const file = path.join(OUT, target ?? "/404.html");
  if (!file.startsWith(OUT + path.sep)) {
    res.writeHead(400).end();
    return;
  }

  const body = await readFile(file);
  res.writeHead(target ? 200 : 404, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

const onRequest = (req, res) => {
  handle(req, res).catch((error) => {
    if (!res.headersSent) res.writeHead(500);
    res.end(String(error?.message ?? error));
  });
};

// Browsers may resolve localhost to either loopback address, so listen on both.
createServer(onRequest).listen(PORT, "127.0.0.1", () => {
  console.log(`Chem AI app preview: http://localhost:${PORT}/dashboard/`);
});
createServer(onRequest)
  .on("error", () => {}) // no IPv6 loopback on this machine
  .listen(PORT, "::1");
