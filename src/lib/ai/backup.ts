"use client";

// ChemAI: Iris's backup AI - the iris-chat Supabase function (supabase/functions/iris-chat), a chain
// of free models (Groq, NVIDIA, and Gemma on the Gemini key) that the app asks when the website is
// busy, out of its day's quota or down. Until the function is deployed (README) nothing changes:
// a missing function is not asked again for an hour.

import { createClient } from "@/lib/supabase/client";
import type { AiConversationSummary } from "@/lib/ai/history";
import { since, trace } from "./trace";

const FUNCTION = "iris-chat";
const MISSING_KEY = "chemai:backup-missing-until";
/** Not deployed or not set up: asked again after an hour. */
const MISSING_PAUSE_MS = 60 * 60 * 1000;
/** Less than this left of the question's time: not worth starting the chain. */
const MIN_TIME_MS = 5000;

export type BackupAnswer =
  | { kind: "answer"; reply: string; model: string; conversation?: AiConversationSummary | null }
  | { kind: "busy" }
  | { kind: "none" };

function missingUntil(): number {
  try {
    return Number(window.localStorage.getItem(MISSING_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function markMissing(): void {
  try {
    window.localStorage.setItem(MISSING_KEY, String(Date.now() + MISSING_PAUSE_MS));
  } catch {
    // storage unavailable: the next question simply asks again
  }
}

/**
 * The backup's answer to the same request the website got (`conversation` included: the function
 * saves the turn to the history as the website would), "busy" when every model is resting, or
 * "none" when there is no backup to ask now.
 */
export async function askBackup(body: Record<string, unknown>, timeoutMs: number): Promise<BackupAnswer> {
  if (typeof window === "undefined" || timeoutMs < MIN_TIME_MS || Date.now() < missingUntil()) return { kind: "none" };
  const started = performance.now();
  const call = createClient().functions.invoke(FUNCTION, { body: { ...body, budgetMs: timeoutMs - 1500 } });
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs));
  const result = await Promise.race([call.catch(() => null), timeout]);
  if (!result) {
    trace("api", `yedek yapay zekâ ${since(started)} içinde yanıt vermedi`);
    return { kind: "none" };
  }
  if (result.error) {
    const status = (result.error as { context?: { status?: number } }).context?.status;
    if (status === 404 || status === 503) markMissing();
    trace("api", `yedek yapay zekâ ${status ?? "bağlantı yok"} (${since(started)})`);
    return status === 429 ? { kind: "busy" } : { kind: "none" };
  }
  const data = (result.data ?? {}) as { reply?: unknown; model?: unknown; conversation?: AiConversationSummary | null };
  if (typeof data.reply !== "string" || !data.reply.trim()) return { kind: "none" };
  const model = typeof data.model === "string" ? data.model : "";
  trace("api", `yedek yapay zekâ yanıtladı: ${model || "?"} (${since(started)})`);
  return { kind: "answer", reply: data.reply, model, ...("conversation" in data ? { conversation: data.conversation ?? null } : {}) };
}
