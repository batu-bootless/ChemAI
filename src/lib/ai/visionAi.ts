"use client";

// ChemAI: a photo read by a vision model (the iris-vision Supabase function, supabase/functions/).
// The phone's own text recognition (vision.ts) reads printed text but not a skeletal formula or
// a reaction scheme; the vision model returns the questions, the drawn structures as SMILES, the
// reactions as equations and the formulas it sees. Iris then answers from that reading, and the
// engine checks the structures and equations it names.
//
// The function is optional: until it is deployed (README) the app reads photos as before, and a
// missing function is not asked again for a while.

import { createClient } from "@/lib/supabase/client";
import { since, trace } from "./trace";

export interface VisionReading {
  ozet?: string;
  sorular: { no?: string; metin: string; secenekler?: string[] }[];
  molekuller: { etiket?: string; ad?: string; smiles?: string }[];
  tepkimeler: { denklem?: string; reaktanlar?: string[]; urunler?: string[]; kosullar?: string }[];
  formuller: { ifade: string; ad?: string }[];
  metin: string;
  guven?: "yuksek" | "orta" | "dusuk";
  notlar?: string[];
}

const FUNCTION = "iris-vision";
const MISSING_KEY = "chemai:vision-missing-until";
/** Not deployed: asked again after six hours. Unreachable: after ten minutes. */
const MISSING_PAUSE_MS = 6 * 60 * 60 * 1000;
const OFFLINE_PAUSE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 40_000;

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function list<T>(value: unknown, max: number, map: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? map(item as Record<string, unknown>) : null))
    .filter((item): item is T => item !== null)
    .slice(0, max);
}

function strings(value: unknown, maxItems: number, max: number): string[] | undefined {
  const items = Array.isArray(value) ? value.map((item) => str(item, max)).filter((item): item is string => Boolean(item)).slice(0, maxItems) : [];
  return items.length ? items : undefined;
}

const smiles = (value: unknown) => str(value, 400)?.replace(/\s+/g, "");

/** The model's reading, bounded and typed; null when it read nothing useful. */
export function sanitizeReading(raw: unknown): VisionReading | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const reading: VisionReading = {
    ozet: str(r.ozet, 300),
    sorular: list(r.sorular, 20, (q) => {
      const metin = str(q.metin, 1200);
      return metin ? { no: str(q.no, 10), metin, secenekler: strings(q.secenekler, 8, 300) } : null;
    }),
    molekuller: list(r.molekuller, 20, (m) => {
      const entry = { etiket: str(m.etiket, 40), ad: str(m.ad, 200), smiles: smiles(m.smiles) };
      return entry.ad || entry.smiles ? entry : null;
    }),
    tepkimeler: list(r.tepkimeler, 12, (t) => {
      const entry = {
        denklem: str(t.denklem, 300),
        reaktanlar: strings(t.reaktanlar, 6, 400)?.map((s) => s.replace(/\s+/g, "")),
        urunler: strings(t.urunler, 6, 400)?.map((s) => s.replace(/\s+/g, "")),
        kosullar: str(t.kosullar, 200),
      };
      return entry.denklem || entry.reaktanlar || entry.urunler ? entry : null;
    }),
    formuller: list(r.formuller, 12, (f) => {
      const ifade = str(f.ifade, 200);
      return ifade ? { ifade, ad: str(f.ad, 120) } : null;
    }),
    metin: str(r.metin, 3000) ?? "",
    guven: r.guven === "yuksek" || r.guven === "orta" || r.guven === "dusuk" ? r.guven : undefined,
    notlar: strings(r.notlar, 6, 200),
  };
  const empty = !reading.metin && !reading.sorular.length && !reading.molekuller.length && !reading.tepkimeler.length && !reading.formuller.length;
  return empty ? null : reading;
}

/** The reading as the text Iris and its planner get (the photo block's "read text"). */
export function readingText(reading: VisionReading): string {
  const parts: string[] = [];
  if (reading.ozet) parts.push(`Görüntü: ${reading.ozet}`);
  if (reading.sorular.length) {
    parts.push(
      "Sorular:\n" +
        reading.sorular.map((q) => `${q.no ? `${q.no}) ` : ""}${q.metin}${q.secenekler?.length ? `\n  ${q.secenekler.join("  ")}` : ""}`).join("\n")
    );
  }
  if (reading.molekuller.length) {
    parts.push(
      "Yapılar (SMILES):\n" +
        reading.molekuller.map((m) => `- ${[m.etiket, m.ad].filter(Boolean).join(" · ") || "yapı"}: ${m.smiles ?? "(SMILES okunamadı)"}`).join("\n")
    );
  }
  if (reading.tepkimeler.length) {
    parts.push(
      "Tepkimeler:\n" +
        reading.tepkimeler
          .map((t) => {
            const scheme = t.reaktanlar || t.urunler ? `${(t.reaktanlar ?? []).join(" + ") || "?"} >> ${(t.urunler ?? []).join(" + ") || "?"}` : "";
            return `- ${[t.denklem, scheme && `SMILES: ${scheme}`, t.kosullar && `koşullar: ${t.kosullar}`].filter(Boolean).join(" | ")}`;
          })
          .join("\n")
    );
  }
  if (reading.formuller.length) parts.push(`Formüller: ${reading.formuller.map((f) => (f.ad ? `${f.ad}: ${f.ifade}` : f.ifade)).join("; ")}`);
  if (reading.notlar?.length) parts.push(`Okunamayan/belirsiz: ${reading.notlar.join("; ")}`);
  if (reading.guven) parts.push(`Okuma güveni: ${reading.guven}`);
  if (reading.metin) parts.push(`Yazı:\n${reading.metin}`);
  return parts.join("\n");
}

function pausedUntil(): number {
  try {
    return Number(window.localStorage.getItem(MISSING_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function pause(ms: number): void {
  try {
    window.localStorage.setItem(MISSING_KEY, String(Date.now() + ms));
  } catch {
    // storage unavailable: the next photo simply asks again
  }
}

/**
 * The photo read by the vision model, or null when that is not possible now (not deployed,
 * offline, signed out, quota): the caller keeps the phone's own reading then.
 */
export async function readImageWithAi(base64: string, language: "tr" | "en"): Promise<VisionReading | null> {
  if (typeof window === "undefined" || Date.now() < pausedUntil()) return null;
  const started = performance.now();
  const call = createClient().functions.invoke(FUNCTION, { body: { image: base64, language } });
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), TIMEOUT_MS));
  const result = await Promise.race([call.catch(() => null), timeout]);
  if (!result) {
    trace("görsel", `görsel model ${since(started)} içinde yanıt vermedi`);
    return null;
  }
  if (result.error) {
    const status = (result.error as { context?: { status?: number } }).context?.status;
    if (status === 404) pause(MISSING_PAUSE_MS);
    else if (status === undefined) pause(OFFLINE_PAUSE_MS);
    trace("görsel", `görsel model kullanılamadı (${status ?? "bağlantı"}), cihazdaki okuma kullanılıyor`);
    return null;
  }
  const reading = sanitizeReading((result.data as { reading?: unknown } | null)?.reading);
  trace(
    "görsel",
    reading
      ? `görsel model ${since(started)}: ${reading.sorular.length} soru, ${reading.molekuller.length} yapı, ${reading.tepkimeler.length} tepkime`
      : `görsel model ${since(started)}: okunacak bir şey bulamadı`
  );
  return reading;
}
