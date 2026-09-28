// Phone preview for the Chem AI test emulator.
// Serves http://localhost:5183: a live view of the emulator screen that forwards clicks, drags,
// scrolling, keys and typed text to the emulator through adb. Listens on loopback only.
//
//   node scripts/preview/server.mjs        (start the phone first: scripts\emulator.ps1)

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 5183;
const ADB = process.env.ADB || "D:\\android-sdk\\platform-tools\\adb.exe";
const SERIAL = process.env.ANDROID_SERIAL || "emulator-5554";
const APP_ACTIVITY = "com.chemai.app/tr.com.chemplus.app.MainActivity";
const KEYS = { back: 4, home: 3, recents: 187, enter: 66, backspace: 67 };
const PAGE = new URL("./index.html", import.meta.url);
// Inside the git-ignored build folder, on D: like the project (C: is full).
const SHOT_DIR = fileURLToPath(new URL("../../build/phone-preview", import.meta.url));

function adb(args, binary = false) {
  return new Promise((resolve, reject) => {
    execFile(
      ADB,
      ["-s", SERIAL, ...args],
      { encoding: binary ? "buffer" : "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 20_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || error.message).trim()));
        else resolve(stdout);
      },
    );
  });
}

// The emulator saves the screenshot on the PC straight from its display. `screencap` inside the
// phone takes seconds per frame and, run nonstop, starves the phone ("System UI isn't
// responding"), so it is only the fallback for real devices.
async function captureScreen() {
  try {
    await mkdir(SHOT_DIR, { recursive: true });
    const reply = await adb(["emu", "screenrecord", "screenshot", SHOT_DIR]);
    if (!reply.includes("OK")) throw new Error(reply);
    // Files are named Screenshot_<unix seconds>.png.
    const files = (await readdir(SHOT_DIR)).filter((name) => name.endsWith(".png")).sort();
    if (!files.length) throw new Error("The emulator wrote no screenshot");
    const png = await readFile(join(SHOT_DIR, files.at(-1)));
    await Promise.all(files.map((name) => rm(join(SHOT_DIR, name), { force: true })));
    return png;
  } catch {
    return adb(["exec-out", "screencap", "-p"], true);
  }
}

// Every viewer shares the capture in progress instead of queueing more work.
let capture = null;
function currentScreen() {
  capture ??= captureScreen().finally(() => {
    capture = null;
  });
  return capture;
}

function coordinate(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) throw new Error(`Invalid number: ${value}`);
  return String(n);
}

// `input text` runs in the device shell, so the text is single-quoted there. It types ASCII only
// and reads "%s" as a space.
function deviceText(text) {
  if (typeof text !== "string" || !/^[\x20-\x7e]{1,500}$/.test(text)) {
    throw new Error("Only plain ASCII text can be sent from here.");
  }
  return `'${text.replaceAll(" ", "%s").replaceAll("'", "'\\''")}'`;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function send(res, status, body = "", type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");

  // Only answer to localhost names (blocks DNS rebinding). Actions also need a custom header,
  // which other websites cannot send here without a CORS preflight this server never approves.
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return send(res, 403, "Forbidden");

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, await readFile(PAGE), "text/html; charset=utf-8");
  }
  if (req.method === "GET" && url.pathname === "/api/screen") {
    return send(res, 200, await currentScreen(), "image/png");
  }
  if (req.method !== "POST" || req.headers["x-phone-preview"] !== "1") return send(res, 404, "Not found");

  const q = url.searchParams;
  switch (url.pathname) {
    case "/api/tap":
      await adb(["shell", "input", "tap", coordinate(q.get("x")), coordinate(q.get("y"))]);
      break;
    case "/api/swipe":
      await adb([
        "shell", "input", "swipe",
        coordinate(q.get("x1")), coordinate(q.get("y1")),
        coordinate(q.get("x2")), coordinate(q.get("y2")),
        coordinate(q.get("ms")),
      ]);
      break;
    case "/api/key": {
      const code = KEYS[q.get("name")];
      if (!code) return send(res, 400, "Unknown key");
      await adb(["shell", "input", "keyevent", String(code)]);
      break;
    }
    case "/api/text":
      await adb(["shell", "input", "text", deviceText((await readJson(req)).value)]);
      break;
    case "/api/open-app":
      await adb(["shell", "am", "start", "-n", APP_ACTIVITY]);
      break;
    default:
      return send(res, 404, "Not found");
  }
  send(res, 204);
}

const onRequest = (req, res) => {
  handle(req, res).catch((error) => {
    if (res.headersSent) res.destroy();
    else send(res, 502, error.message);
  });
};

// Browsers may resolve localhost to either loopback address, so listen on both.
createServer(onRequest).listen(PORT, "127.0.0.1", () => {
  console.log(`Phone preview: http://localhost:${PORT} (adb device ${SERIAL})`);
});
createServer(onRequest)
  .on("error", () => {}) // no IPv6 loopback on this machine
  .listen(PORT, "::1");
