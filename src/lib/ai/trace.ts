"use client";

// Chem+ app: a short diagnostic log of Iris's pipeline - what was asked of the website and how
// long each step took (planner, tools, answer, voice), and what the voice conversation did - kept on
// the phone so a problem can be seen afterwards (voice settings → "Tanılama kaydı", or a long press
// on Iris's name). Nothing leaves the phone unless the user copies it.

const KEY = "chemplus:ai-trace";
const MAX_ENTRIES = 400;

export interface TraceEntry {
  at: number;
  tag: string;
  text: string;
}

let entries: TraceEntry[] | null = null;
let saveTimer: number | null = null;
const listeners = new Set<() => void>();

function load(): TraceEntry[] {
  if (entries) return entries;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    entries = Array.isArray(parsed) ? (parsed as TraceEntry[]) : [];
  } catch {
    entries = [];
  }
  return entries;
}

/** Notes one step (`tag`: api, plan, tool, answer, voice, listen, speak …). */
export function trace(tag: string, text = ""): void {
  if (typeof window === "undefined") return;
  const list = load();
  list.push({ at: Date.now(), tag, text: text.replace(/\s+/g, " ").slice(0, 300) });
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  if (saveTimer === null) {
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(entries));
      } catch {
        // storage full: the log lives until the app closes
      }
    }, 500);
  }
  for (const listener of listeners) listener();
}

export function readTrace(): TraceEntry[] {
  if (typeof window === "undefined") return [];
  return [...load()];
}

export function clearTrace(): void {
  entries = [];
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
  for (const listener of listeners) listener();
}

/** Re-renders a log view as entries come in. */
export function onTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const two = (n: number) => String(n).padStart(2, "0");

export function traceLine(entry: TraceEntry): string {
  const d = new Date(entry.at);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")} ${entry.tag} ${entry.text}`;
}

/** The whole log as text (to copy). */
export function traceText(): string {
  return readTrace().map(traceLine).join("\n");
}

/** Milliseconds since `start`, for the log. */
export const since = (start: number) => `${Math.round(performance.now() - start)} ms`;
