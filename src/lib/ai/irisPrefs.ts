"use client";

// ChemAI: what the user has told Iris about themselves (Settings → Kişisel bağlam) and how Iris
// should work (Settings → Eylemler ve otomasyon, İris etkinliği). Kept on the device.

import { useSyncExternalStore } from "react";

export type Level = "" | "lise" | "lisans" | "lisansustu" | "ogretmen" | "arastirmaci" | "sanayi";
export type AnswerStyle = "" | "kisa" | "adim" | "ayrintili";

export interface PersonalContext {
  enabled: boolean;
  level: Level;
  field: string;
  style: AnswerStyle;
  /** Instruments, conditions, what the lab has or lacks. */
  lab: string;
  /** Anything else Iris should keep in mind. */
  about: string;
}

export interface IrisPrefs {
  /** Check the numbers in every answer against the engine (Kanıt denetimi). */
  verify: boolean;
  /** Point out hazards and incompatible pairs in lab answers (Güvenlik taraması). */
  safety: boolean;
  /** Let Iris set timers, write notes, protocols, reports, graphs… */
  actions: boolean;
  /** Save chats to the account history; off = temporary chats, nothing is kept. */
  saveHistory: boolean;
  /** Read every answer aloud. */
  autoSpeak: boolean;
  /** Send photos to the vision model (visionAi.ts, qwen on Groq) so drawn structures and schemes can be read. */
  visionModel: boolean;
}

export const LEVELS: { value: Exclude<Level, "">; tr: string; en: string }[] = [
  { value: "lise", tr: "Lise öğrencisi", en: "High school student" },
  { value: "lisans", tr: "Üniversite öğrencisi", en: "University student" },
  { value: "lisansustu", tr: "Lisansüstü", en: "Graduate student" },
  { value: "ogretmen", tr: "Öğretmen / akademisyen", en: "Teacher / academic" },
  { value: "arastirmaci", tr: "Araştırmacı", en: "Researcher" },
  { value: "sanayi", tr: "Sanayi / laboratuvar", en: "Industry / lab" },
];

export const STYLES: { value: Exclude<AnswerStyle, "">; tr: string; en: string; hintTr: string; hintEn: string }[] = [
  { value: "kisa", tr: "Kısa ve net", en: "Short and direct", hintTr: "Sonuç önce, gereken kadar açıklama", hintEn: "Result first, only what is needed" },
  { value: "adim", tr: "Adım adım", en: "Step by step", hintTr: "Her hesabı ve nedenini göstererek", hintEn: "Every step and why" },
  { value: "ayrintili", tr: "Ayrıntılı", en: "Detailed", hintTr: "Kuram, varsayımlar ve alternatiflerle", hintEn: "Theory, assumptions and alternatives" },
];

const PERSONAL_KEY = "chemai:personal:v1";
const PREFS_KEY = "chemai:iris-prefs:v1";
const AUTO_SPEAK_KEY = "chemplus:ai-read-aloud";

export const DEFAULT_PERSONAL: PersonalContext = { enabled: true, level: "", field: "", style: "", lab: "", about: "" };
export const DEFAULT_PREFS: IrisPrefs = { verify: true, safety: true, actions: true, saveHistory: true, autoSpeak: false, visionModel: true };

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the choice lasts for this visit
  }
}

const listeners = new Set<() => void>();
let personalCache: PersonalContext | null = null;
let prefsCache: IrisPrefs | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readPersonal(): PersonalContext {
  personalCache ??= readJson(PERSONAL_KEY, DEFAULT_PERSONAL);
  return personalCache;
}

export function savePersonal(patch: Partial<PersonalContext>): void {
  personalCache = { ...readPersonal(), ...patch };
  writeJson(PERSONAL_KEY, personalCache);
  notify();
}

export function readIrisPrefs(): IrisPrefs {
  if (!prefsCache) {
    const stored = readJson(PREFS_KEY, DEFAULT_PREFS);
    let autoSpeak = stored.autoSpeak;
    try {
      autoSpeak = window.localStorage.getItem(AUTO_SPEAK_KEY) === "1";
    } catch {
      // keep the stored value
    }
    prefsCache = { ...stored, autoSpeak };
  }
  return prefsCache;
}

export function saveIrisPrefs(patch: Partial<IrisPrefs>): void {
  prefsCache = { ...readIrisPrefs(), ...patch };
  writeJson(PREFS_KEY, prefsCache);
  if (patch.autoSpeak !== undefined) {
    try {
      window.localStorage.setItem(AUTO_SPEAK_KEY, patch.autoSpeak ? "1" : "0");
    } catch {
      // storage unavailable
    }
  }
  notify();
}

export function usePersonal(): PersonalContext {
  return useSyncExternalStore(subscribe, readPersonal, () => DEFAULT_PERSONAL);
}

export function useIrisPrefs(): IrisPrefs {
  return useSyncExternalStore(subscribe, readIrisPrefs, () => DEFAULT_PREFS);
}

export const PERSONAL_OPEN = "⟦CHEMPLUS-KİŞİ⟧";
export const PERSONAL_CLOSE = "⟦/CHEMPLUS-KİŞİ⟧";

/** The personal context as Iris reads it, or "" when there is nothing to say. */
export function personalBlock(context: PersonalContext = readPersonal()): string {
  if (!context.enabled) return "";
  const level = LEVELS.find((entry) => entry.value === context.level)?.tr;
  const style = STYLES.find((entry) => entry.value === context.style);
  const parts = [
    level && `düzey: ${level}`,
    context.field.trim() && `alan: ${context.field.trim().slice(0, 80)}`,
    style && `istediği anlatım: ${style.tr} (${style.hintTr})`,
    context.lab.trim() && `laboratuvarı: ${context.lab.trim().slice(0, 220)}`,
    context.about.trim() && `not: ${context.about.trim().slice(0, 220)}`,
  ].filter(Boolean);
  if (!parts.length) return "";
  return `${PERSONAL_OPEN}\nKullanıcı hakkında (anlatımı buna göre ayarla; gerekmedikçe bunları yanıtta anma): ${parts.join("; ")}.\n${PERSONAL_CLOSE}`;
}
