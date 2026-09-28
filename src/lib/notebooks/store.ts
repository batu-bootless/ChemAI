"use client";

// ChemAI: notebooks - Iris's project spaces, after the Gemini app's notebooks. A notebook has a
// title, a way of working (organise / study / plan an experiment), the user's own instructions and
// sources (text, files, photos read on the device), and its chats.
//
// The notebook itself lives on the device (the website's database must not change). Its chats are
// ordinary saved conversations whose `surface` names the notebook ("📓 Titration #k3j2m9x1"), so a
// notebook's chats are found in the history, and a notebook that is missing on this device (a new
// phone) is rebuilt from them - title and chats; sources and instructions stay where they were made.

import { useSyncExternalStore } from "react";
import type { AiConversationSummary } from "@/lib/ai/history";

export type NotebookMode = "organize" | "study" | "lab";

export interface NotebookSource {
  id: string;
  kind: "text" | "file" | "photo";
  name: string;
  /** The text Iris reads: pasted, from a file, or read off a photo on the device. */
  text: string;
  addedAt: number;
  /** Photos only: a small preview. */
  thumb?: string;
}

export interface Notebook {
  id: string;
  title: string;
  mode: NotebookMode;
  instructions: string;
  sources: NotebookSource[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const KEY = "chemai:notebooks:v1";
export const MAX_SOURCES = 20;
export const MAX_SOURCE_CHARS = 40_000;
export const MAX_INSTRUCTIONS = 1_200;

const listeners = new Set<() => void>();
let cache: Notebook[] | null = null;
const EMPTY: Notebook[] = [];

function load(): Notebook[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as Notebook[];
    cache = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(list: Notebook[]): void {
  cache = [...list].sort(order);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage full or blocked: the change lasts until the app closes
  }
  for (const listener of listeners) listener();
}

function order(a: Notebook, b: Notebook): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function newId(length = 8): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let id = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}

export function listNotebooks(): Notebook[] {
  return load();
}

export function getNotebook(id: string | null | undefined): Notebook | null {
  if (!id) return null;
  return load().find((notebook) => notebook.id === id) ?? null;
}

export function useNotebooks(): Notebook[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

export function useNotebook(id: string | null | undefined): Notebook | null {
  const list = useNotebooks();
  return id ? list.find((notebook) => notebook.id === id) ?? null : null;
}

export function createNotebook(title: string, mode: NotebookMode): Notebook {
  const now = Date.now();
  const notebook: Notebook = {
    id: newId(),
    title: title.trim().slice(0, 90) || "Adsız not defteri",
    mode,
    instructions: "",
    sources: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  save([notebook, ...load()]);
  return notebook;
}

export function updateNotebook(id: string, patch: Partial<Omit<Notebook, "id" | "createdAt">>, touch = true): void {
  save(load().map((notebook) => (notebook.id === id ? { ...notebook, ...patch, updatedAt: touch ? Date.now() : notebook.updatedAt } : notebook)));
}

export function touchNotebook(id: string): void {
  if (getNotebook(id)) updateNotebook(id, {});
}

const DELETED_KEY = "chemai:notebooks:deleted";

function deletedIds(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(DELETED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function deleteNotebook(id: string): void {
  // Remembered, so the notebook is not rebuilt from its chats in the history.
  try {
    window.localStorage.setItem(DELETED_KEY, JSON.stringify([...deletedIds(), id].slice(-200)));
  } catch {
    // storage unavailable
  }
  save(load().filter((notebook) => notebook.id !== id));
}

export function addSource(id: string, source: Omit<NotebookSource, "id" | "addedAt">): NotebookSource | null {
  const notebook = getNotebook(id);
  if (!notebook || notebook.sources.length >= MAX_SOURCES) return null;
  const entry: NotebookSource = {
    ...source,
    name: source.name.trim().slice(0, 120) || "Kaynak",
    text: source.text.slice(0, MAX_SOURCE_CHARS),
    id: newId(6),
    addedAt: Date.now(),
  };
  updateNotebook(id, { sources: [...notebook.sources, entry] });
  return entry;
}

export function removeSource(id: string, sourceId: string): void {
  const notebook = getNotebook(id);
  if (notebook) updateNotebook(id, { sources: notebook.sources.filter((source) => source.id !== sourceId) });
}

// --- chats of a notebook -------------------------------------------------------------------------

const SURFACE = /#([a-z0-9]{8})$/;

/** The conversation `surface` of a notebook's chats (the website shows it next to the chat). */
export function notebookSurface(notebook: Pick<Notebook, "id" | "title">): string {
  return `📓 ${notebook.title.slice(0, 96)} #${notebook.id}`;
}

export function notebookIdOf(surface: string | null | undefined): string | null {
  return surface?.startsWith("📓") ? surface.match(SURFACE)?.[1] ?? null : null;
}

function titleOf(surface: string): string {
  return surface.replace(/^📓\s*/, "").replace(SURFACE, "").trim() || "Not defteri";
}

/** Notebooks whose chats are in the history but which this device does not have yet. */
export function adoptFromHistory(conversations: AiConversationSummary[]): void {
  const known = new Set([...load().map((notebook) => notebook.id), ...deletedIds()]);
  const found = new Map<string, Notebook>();
  for (const conversation of conversations) {
    const id = notebookIdOf(conversation.surface);
    if (!id || known.has(id)) continue;
    const existing = found.get(id);
    const at = conversation.updatedAt || Date.now();
    if (existing) {
      existing.updatedAt = Math.max(existing.updatedAt, at);
      existing.createdAt = Math.min(existing.createdAt, at);
      continue;
    }
    found.set(id, {
      id,
      title: titleOf(conversation.surface),
      mode: "organize",
      instructions: "",
      sources: [],
      pinned: false,
      createdAt: at,
      updatedAt: at,
    });
  }
  if (found.size) save([...load(), ...found.values()]);
}

// --- what Iris is told ---------------------------------------------------------------------------

export const MODE_INFO: Record<NotebookMode, { tr: string; en: string; rules: string }> = {
  organize: {
    tr: "Fikirleri organize et",
    en: "Organise ideas",
    rules:
      "Yanıtı düzenli ve başlıklı ver. Kaynak verildiyse ona dayan, kullandığın kaynağı [K1] gibi belirt; kaynakta olmayanı kaynaktaymış gibi sunma, kendi bilgin olduğunu söyle.",
  },
  study: {
    tr: "Çalış ve öğren",
    en: "Study and learn",
    rules:
      "ÖĞRENME MODU: Hazır cevabı hemen verme. Konuyu küçük adımlara böl, her adımda tek bir kısa soru sor ve kullanıcının cevabını bekle; doğruysa pekiştir, yanlışsa ipucu ver ve tekrar dene. \"Beni test et\" denirse soruları tek tek sor, sonunda puan ve eksik konuları ver. Sayısal sonuçları hesap bloğundan al.",
  },
  lab: {
    tr: "Deney planla",
    en: "Plan an experiment",
    rules:
      "DENEY MODU: Kullanıcıyla deneyi birlikte kur: amaç, malzeme ve ekipman, hesaplanmış miktarlar (hesap bloğundan), adımlar, güvenlik (KKD, uyumsuzluk, atık) ve kontrol noktaları. Uygun yerde protokol, zamanlayıcı ya da rapor oluşturmayı öner.",
  },
};

const STOP = new Set(
  "ve veya ile bir bu şu o da de mi mı mu mü için gibi kadar daha çok en ne nasıl neden hangi kaç ya ama ki ise olan olarak her tüm bana beni benim sen sana the and for with from that this what how which into are was were have has not can".split(
    " "
  )
);

function terms(text: string): string[] {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word))
    // A rough Turkish stem: the first six letters carry the word ("titrasyonda" → "titras").
    .map((word) => word.slice(0, 6));
}

interface Chunk {
  label: string;
  source: number;
  index: number;
  text: string;
  terms: string[];
}

function chunks(sources: NotebookSource[]): Chunk[] {
  const out: Chunk[] = [];
  sources.forEach((source, sourceIndex) => {
    const text = source.text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    let index = 0;
    for (let start = 0; start < text.length && index < 80; index++) {
      let end = Math.min(text.length, start + 650);
      if (end < text.length) {
        const cut = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end));
        if (cut > start + 250) end = cut + 1;
      }
      const piece = text.slice(start, end).trim();
      if (piece) out.push({ label: `K${sourceIndex + 1}`, source: sourceIndex, index, text: piece, terms: terms(piece) });
      start = end;
    }
  });
  return out;
}

/** The parts of the sources that best answer the question, within `budget` characters. */
export function relevantSources(notebook: Notebook, question: string, budget: number): string {
  if (!notebook.sources.length || budget < 200) return "";
  const all = chunks(notebook.sources);
  const wanted = new Set(terms(question));
  const df = new Map<string, number>();
  for (const chunk of all) for (const term of new Set(chunk.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  const scored = all.map((chunk) => {
    let score = chunk.index === 0 ? 0.35 : 0;
    const counts = new Map<string, number>();
    for (const term of chunk.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    for (const term of wanted) {
      const tf = counts.get(term);
      if (tf) score += (1 + Math.log(tf)) * Math.log(1 + all.length / (df.get(term) ?? 1));
    }
    return { chunk, score };
  });
  // "Summarise my sources": the beginning of every source before anything else.
  const general = /özet|özetle|genel|tümü|hepsi|kaynak|summar|overview|all sources/i.test(question);
  scored.sort((a, b) => (general ? a.chunk.index - b.chunk.index || a.chunk.source - b.chunk.source : b.score - a.score));
  const picked: Chunk[] = [];
  let used = 0;
  for (const { chunk } of scored) {
    const line = chunk.text.length + 24 + notebook.sources[chunk.source].name.length;
    if (used + line > budget) continue;
    picked.push(chunk);
    used += line;
    if (used > budget - 200) break;
  }
  picked.sort((a, b) => a.source - b.source || a.index - b.index);
  return picked.map((chunk) => `[${chunk.label}] ${notebook.sources[chunk.source].name}: ${chunk.text}`).join("\n");
}

export const NOTEBOOK_OPEN = "⟦CHEMPLUS-DEFTER⟧";
export const NOTEBOOK_CLOSE = "⟦/CHEMPLUS-DEFTER⟧";

/** What a notebook chat tells Iris on every turn: the notebook, its way of working, the sources. */
export function notebookBlock(notebook: Notebook, question: string, budget = 2600): string {
  const header =
    `Bu sohbet kullanıcının "${notebook.title}" not defterinde (${MODE_INFO[notebook.mode].tr}).\n${MODE_INFO[notebook.mode].rules}` +
    (notebook.instructions.trim() ? `\nKullanıcının bu not defteri için talimatları: ${notebook.instructions.trim().slice(0, 600)}` : "");
  const room = budget - header.length - 80;
  const sources = relevantSources(notebook, question, room);
  const list = notebook.sources.length
    ? `\nKAYNAKLAR (kullanıcının eklediği; ${notebook.sources.map((source, index) => `K${index + 1}=${source.name}`).join(", ").slice(0, 300)}):\n${sources || "(bu soruyla ilgili bölüm bulunamadı)"}`
    : "";
  return `${NOTEBOOK_OPEN}\n${header}${list}\n${NOTEBOOK_CLOSE}`;
}

/** A short excerpt for the calculation planner (numbers in the sources can be computed with). */
export function sourcesForPlanner(notebook: Notebook | null | undefined, question: string): string {
  if (!notebook?.sources.length) return "";
  return relevantSources(notebook, question, 1400);
}
