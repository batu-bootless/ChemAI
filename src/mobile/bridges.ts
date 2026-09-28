// ChemAI Android app: adapts the browser features the app relies on.
//  - fetch("/api/...")       → the live website's API, through the native API bridge
//  - <a download>, a.click() → saved to Downloads/ChemAI (WebView ignores download links)
//  - window.print()          → Android's print dialog (printer or "Save as PDF")
//  - window.open()           → blank popups (reports, print previews) open as an in-app sheet,
//                              other websites open in the browser
// Workspace panes are same-origin iframes; they hand their work to the top window's bridges.
import { trace } from "@/lib/ai/trace";
import { createClient } from "@/lib/supabase/client";
import { textFor } from "./i18n";
import { ChemPlus, isNativeApp, openExternal } from "./native";

const API_TIMEOUT_MS = 120_000;
// Refreshing the session first must never hold a call up: after this long the call goes with the
// cookies the app has (the website refreshes an expired token itself).
const SESSION_CHECK_MS = 3000;
// The API routes read the Supabase session from cookies, which the native side copies from the
// app before every call. A session that expires mid-request would be refreshed by the server,
// which rotates the refresh token and later signs the app out, so it is renewed here first.
const SESSION_MIN_VALIDITY_MS = 5 * 60_000;

interface ApiCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal | null;
}

interface Bridges {
  apiFetch(call: ApiCall): Promise<Response>;
  saveDownload(href: string, suggestedName: string): Promise<void>;
  printHtml(html: string, title: string): void;
  openPopupSheet(): Window | null;
}

declare global {
  interface Window {
    __chemplusBridges?: Bridges;
  }
}

const sheetClosers: (() => void)[] = [];

export function installNativeBridges(): void {
  if (typeof window === "undefined" || window.__chemplusBridges || !isNativeApp()) return;
  const host = topWindowBridges();
  const bridges: Bridges = host ?? { apiFetch, saveDownload, printHtml, openPopupSheet };
  window.__chemplusBridges = bridges;

  patchFetch(bridges);
  patchDownloads(bridges);
  patchPrint(bridges, !host);
  patchWindowOpen(bridges);
  // What the native API bridge does (the website's check, retries, timeouts) goes into Iris's log.
  if (!host) void ChemPlus.addListener("apiTrace", (data) => trace("köprü", data.text ?? "")).catch(() => undefined);
}

/** Closes the newest in-app sheet; false when none is open. */
export function closeTopSheet(): boolean {
  const close = sheetClosers.pop();
  close?.();
  return Boolean(close);
}

function topWindowBridges(): Bridges | null {
  if (window.top === window) return null;
  try {
    return window.top?.__chemplusBridges ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// API

function patchFetch(bridges: Bridges) {
  const browserFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (!url || url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return browserFetch(input, init);
    }
    const request = new Request(url.href, {
      method: init?.method ?? (isRequest(input) ? input.method : "GET"),
      headers: init?.headers ?? (isRequest(input) ? input.headers : undefined),
      body: init?.body ?? (isRequest(input) ? input.body : undefined),
      // A stream body needs half-duplex; plain strings ignore it.
      ...({ duplex: "half" } as object),
    });
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    return bridges.apiFetch({
      url: url.href,
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      signal: init?.signal ?? (isRequest(input) ? input.signal : null),
    });
  };
}

function isRequest(input: unknown): input is Request {
  // Duck-typed: requests from a workspace pane come from another realm.
  return typeof input === "object" && input !== null && "url" in input && "method" in input;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === "string" ? input : "href" in input ? input.href : input.url;
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

async function apiFetch(call: ApiCall): Promise<Response> {
  const { signal } = call;
  if (signal?.aborted) throw abortReason(signal);
  const started = performance.now();
  const url = new URL(call.url);
  const checked = await Promise.race([
    ensureFreshSession().then(
      () => true,
      () => true
    ),
    new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), SESSION_CHECK_MS)),
  ]);
  if (!checked) trace("api", `${url.pathname}: oturum kontrolü ${SESSION_CHECK_MS} ms'de bitmedi, istek yine de gidiyor`);

  if (call.headers[STREAM_HEADER]) {
    const { [STREAM_HEADER]: _stream, ...headers } = call.headers;
    void _stream;
    return streamedFetch({ ...call, headers }, url, started);
  }

  let result;
  try {
    result = await raceAbort(
      ChemPlus.apiRequest({
        path: url.pathname + url.search,
        method: call.method,
        headers: call.headers,
        body: call.body,
        timeoutMs: API_TIMEOUT_MS,
      }),
      signal,
    );
  } catch (error) {
    trace("api", `${call.method} ${url.pathname} ✕ ${signal?.aborted ? "iptal/zaman aşımı" : error instanceof Error ? error.message : String(error)} (${Math.round(performance.now() - started)} ms)`);
    if (signal?.aborted) throw error;
    throw new TypeError(error instanceof Error && error.message ? error.message : textFor("Sunucuya ulaşılamadı.", "Couldn't reach the server."));
  }

  trace("api", `${call.method} ${url.pathname} → ${result.status} (${Math.round(performance.now() - started)} ms, ${Math.round((result.body?.length ?? 0) / 1024)} KB)`);
  const nullBody = [101, 204, 205, 304].includes(result.status);
  return new Response(nullBody ? null : result.body, {
    status: result.status,
    headers: safeHeaders(result.headers),
  });
}

/** A request with this header gets its answer as a stream (the header itself is not sent). */
export const STREAM_HEADER = "x-chem-stream";
let streamCounter = 0;

/**
 * A call whose answer is handed over as it arrives (ApiBridge.java's "apiStream" events): the
 * Response comes as soon as the status is in and its body grows chunk by chunk, so the caller reads
 * it like any streamed fetch. An answer that is not a stream (an error) comes back whole.
 */
function streamedFetch(call: ApiCall, url: URL, started: number): Promise<Response> {
  const { signal } = call;
  const streamId = `s${Date.now().toString(36)}${(streamCounter++).toString(36)}`;
  const encoder = new TextEncoder();
  let body: ReadableStreamDefaultController<Uint8Array> | null = null;
  let headed = false;
  let firstChunk = 0;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      body = controller;
    },
  });
  const close = (error?: unknown) => {
    if (closed) return;
    closed = true;
    try {
      if (error === undefined) body?.close();
      else body?.error(error);
    } catch {
      // already closed by the reader
    }
  };

  return new Promise<Response>((resolve, reject) => {
    let listener: { remove: () => Promise<void> } | null = null;
    const done = () => {
      void listener?.remove();
      listener = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      done();
      if (headed) close(abortReason(signal!));
      else reject(abortReason(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    void ChemPlus.addListener("apiStream", (data) => {
      if (data.stream !== streamId) return;
      if (data.kind === "head") {
        headed = true;
        resolve(new Response(stream, { status: data.status ?? 200, headers: safeHeaders(data.headers ?? {}) }));
      } else if (data.kind === "chunk" && data.text) {
        if (!firstChunk) {
          firstChunk = performance.now();
          trace("api", `${url.pathname} ilk parça ${Math.round(firstChunk - started)} ms`);
        }
        try {
          body?.enqueue(encoder.encode(data.text));
        } catch {
          // the reader went away
        }
      } else if (data.kind === "end") {
        trace("api", `${call.method} ${url.pathname} → akış bitti (${Math.round(performance.now() - started)} ms)`);
        done();
        close();
      } else if (data.kind === "error") {
        done();
        close(new TypeError(data.message || textFor("Sunucuyla bağlantı koptu.", "The connection to the server broke.")));
      }
    }).then((handle) => {
      listener = handle;
      if (signal?.aborted) {
        onAbort();
        return;
      }
      ChemPlus.apiRequest({
        path: url.pathname + url.search,
        method: call.method,
        headers: call.headers,
        body: call.body,
        timeoutMs: API_TIMEOUT_MS,
        stream: true,
        streamId,
      }).then(
        (result) => {
          if (result.streamed) return; // the "end" event closes the body
          done();
          trace("api", `${call.method} ${url.pathname} → ${result.status} (${Math.round(performance.now() - started)} ms)`);
          const nullBody = [101, 204, 205, 304].includes(result.status);
          resolve(new Response(nullBody ? null : result.body, { status: result.status, headers: safeHeaders(result.headers) }));
        },
        (error: unknown) => {
          done();
          trace("api", `${call.method} ${url.pathname} ✕ ${error instanceof Error ? error.message : String(error)} (${Math.round(performance.now() - started)} ms)`);
          const failure = new TypeError(error instanceof Error && error.message ? error.message : textFor("Sunucuya ulaşılamadı.", "Couldn't reach the server."));
          if (headed) close(failure);
          else reject(failure);
        }
      );
    }, reject);
  });
}

/** Opens the way to the website before the first question (the AI screen, voice mode). */
export function warmApi(): void {
  if (!isNativeApp()) return;
  void ChemPlus.warmApi().catch(() => undefined);
}

async function ensureFreshSession() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const expiresAt = data.session?.expires_at;
  if (expiresAt && expiresAt * 1000 - Date.now() < SESSION_MIN_VALIDITY_MS) {
    await supabase.auth.refreshSession();
  }
}

function safeHeaders(raw: Record<string, string>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw ?? {})) {
    try {
      headers.set(key, value);
    } catch {
      // Skip values the Fetch API rejects.
    }
  }
  return headers;
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

// ---------------------------------------------------------------------------------------------
// Downloads

function patchDownloads(bridges: Bridges) {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (!anchor || event.defaultPrevented || !anchor.href) return;
      event.preventDefault();
      // Started synchronously: callers may revoke a blob: URL right after click().
      void bridges.saveDownload(anchor.href, anchor.getAttribute("download") ?? "");
    },
    true,
  );

  // Anchors that are never attached to the page dispatch no event the listener above can see.
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!this.isConnected && this.hasAttribute("download") && this.href) {
      void bridges.saveDownload(this.href, this.getAttribute("download") ?? "");
      return;
    }
    anchorClick.call(this);
  };
}

async function saveDownload(href: string, suggestedName: string): Promise<void> {
  const pending = fetch(href);
  try {
    const response = await pending;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const mimeType = blob.type || mimeFromName(suggestedName) || "application/octet-stream";
    const fileName = cleanFileName(suggestedName || nameFromUrl(href), mimeType);
    const saved = await ChemPlus.saveFile({ fileName, mimeType, base64: await blobToBase64(blob) });
    showToast(`${textFor("Kaydedildi", "Saved")}: ${saved.location}`, [
      { label: textFor("Aç", "Open"), run: () => ChemPlus.openFile({ uri: saved.uri, mimeType }) },
      { label: textFor("Paylaş", "Share"), run: () => ChemPlus.shareFile({ uri: saved.uri, mimeType, title: fileName }) },
    ]);
  } catch {
    showToast(textFor("Dosya kaydedilemedi. Lütfen tekrar deneyin.", "Couldn't save the file. Please try again."));
  }
}

function nameFromUrl(href: string): string {
  try {
    const url = new URL(href);
    if (url.protocol === "blob:" || url.protocol === "data:") return "chemai-dosya";
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "") || "chemai-dosya";
  } catch {
    return "chemai-dosya";
  }
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/json": "json",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/html": "html",
  "chemical/x-mdl-molfile": "mol",
};

function mimeFromName(name: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  return Object.entries(EXTENSIONS).find(([, value]) => value === ext)?.[0];
}

function cleanFileName(name: string, mimeType: string): string {
  let clean = name.replace(/[\\/:*?"<>| -]+/g, "_").trim() || "chemai-dosya";
  const ext = EXTENSIONS[mimeType.split(";")[0]];
  if (ext && !/\.[a-z0-9]{1,5}$/i.test(clean)) clean += `.${ext}`;
  return clean.slice(0, 120);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------------------------
// Printing and popups

function patchPrint(bridges: Bridges, isTop: boolean) {
  window.print = () => {
    if (isTop) {
      ChemPlus.printPage({ title: document.title }).catch(() => showToast(textFor("Yazdırma başlatılamadı.", "Couldn't start printing.")));
    } else {
      // Android prints whole pages only, so a workspace pane prints a copy of its document.
      bridges.printHtml(serializeDocument(document), document.title);
    }
  };
}

function printHtml(html: string, title: string) {
  ChemPlus.printHtml({ html, title }).catch(() => showToast(textFor("Yazdırma başlatılamadı.", "Couldn't start printing.")));
}

function serializeDocument(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script").forEach((script) => script.remove());
  // Keep relative asset URLs working in the print view.
  const head = clone.querySelector("head");
  if (head && !head.querySelector("base")) {
    const base = doc.createElement("base");
    base.href = `${window.location.origin}/`;
    head.prepend(base);
  }
  return `<!DOCTYPE html>${clone.outerHTML}`;
}

function patchWindowOpen(bridges: Bridges) {
  window.open = (url?: string | URL, _target?: string, _features?: string): Window | null => {
    const href = url ? String(url) : "";
    if (!href || href === "about:blank") return bridges.openPopupSheet();

    let parsed: URL;
    try {
      parsed = new URL(href, window.location.href);
    } catch {
      return null;
    }
    if (parsed.protocol === "blob:" || parsed.protocol === "data:") {
      void bridges.saveDownload(parsed.href, "");
      return null;
    }
    if (parsed.origin === window.location.origin) {
      (window.top ?? window).location.assign(parsed.href);
      return null;
    }
    void openExternal(parsed.href);
    return null;
  };
}

function openPopupSheet(): Window | null {
  const sheet = document.createElement("div");
  sheet.setAttribute("data-chemplus-sheet", "");
  sheet.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;background:#fff;";

  const bar = document.createElement("div");
  bar.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;" +
    "border-bottom:1px solid #e5e7eb;background:#fff;";
  const frame = document.createElement("iframe");
  frame.style.cssText = "flex:1;width:100%;border:0;background:#fff;";

  const close = () => {
    sheet.remove();
    const index = sheetClosers.indexOf(close);
    if (index >= 0) sheetClosers.splice(index, 1);
  };
  const print = () => {
    const doc = frame.contentDocument;
    if (doc) printHtml(serializeDocument(doc), doc.title || document.title);
  };

  bar.append(sheetButton(textFor("Kapat", "Close"), close, false), sheetButton(textFor("Yazdır / PDF", "Print / PDF"), print, true));
  sheet.append(bar, frame);
  document.body.append(sheet);
  sheetClosers.push(close);

  const popup = frame.contentWindow;
  if (!popup) {
    close();
    return null;
  }
  // document.open()/write() keep this window object, so these survive the caller's writes.
  popup.print = print;
  popup.close = close;
  return popup;
}

function sheetButton(label: string, onClick: () => void, primary: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText =
    "border-radius:12px;padding:8px 14px;font:600 14px/1.2 var(--font-inter),system-ui,sans-serif;" +
    (primary ? "background:#5b0f12;color:#fff;border:0;" : "background:#f3f4f6;color:#111827;border:0;");
  button.addEventListener("click", onClick);
  return button;
}

// ---------------------------------------------------------------------------------------------
// Toast

function showToast(message: string, actions: { label: string; run: () => unknown }[] = []) {
  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.style.cssText =
    "position:fixed;left:16px;right:16px;bottom:calc(16px + var(--safe-area-inset-bottom, 0px));" +
    "z-index:2147483647;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;" +
    "background:#111827;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);" +
    "font:500 14px/1.4 var(--font-inter),system-ui,sans-serif;";
  const text = document.createElement("span");
  text.style.cssText = "flex:1;min-width:0;overflow-wrap:anywhere;";
  text.textContent = message;
  toast.append(text);

  const remove = () => toast.remove();
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.style.cssText =
      "flex:none;border:0;border-radius:10px;padding:6px 10px;background:rgba(255,255,255,.14);" +
      "color:#fff;font:600 13px/1.2 var(--font-inter),system-ui,sans-serif;";
    button.addEventListener("click", () => {
      remove();
      Promise.resolve()
        .then(action.run)
        .catch(() => showToast(textFor("Bu dosyayı açabilecek bir uygulama bulunamadı.", "No app found that can open this file.")));
    });
    toast.append(button);
  }

  document.body.append(toast);
  window.setTimeout(remove, actions.length ? 8000 : 4000);
}
