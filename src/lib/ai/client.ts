"use client";

import { textFor } from "@/mobile/i18n";

// Thin browser-side client for the AI endpoints. Keeps the fetch shape in one
// place so every AI surface (chat panel, graph analysis, calculator explain)
// talks to /api/ai/* the same way.

import type { AiConversationSummary } from "@/lib/ai/history";
import { AiBusyError, busyFrom, markBusy, retryDelay } from "@/lib/ai/busy";
import { askBackup } from "@/lib/ai/backup";
import { trace } from "@/lib/ai/trace";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
  /** Present when the turn was sent with a conversation; null if saving it failed. */
  conversation?: AiConversationSummary | null;
}

/** An AI call that took longer than it may (the answer must not keep the screen waiting for ever). */
export class AiTimeoutError extends Error {}

export { AiBusyError } from "@/lib/ai/busy";

/** The website answered with an error status. */
export class AiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AiHttpError";
  }
}

/** A failed answer from the website: busy (AiBusyError) or another error. */
function failure(res: Response, message: string | undefined): Error {
  const busy = busyFrom(res.status, message ?? "", res.headers.get("retry-after"));
  if (!busy) return new AiHttpError(message || textFor("İris yanıt veremedi.", "Iris couldn't answer."), res.status);
  return new AiBusyError(
    busy.daily
      ? textFor(
          "İris'in bugünkü yapay zekâ sınırı doldu; sınır her gün yenilenir. Hesap motoru bu arada çalışmaya devam ediyor.",
          "Iris's AI limit for today is used up; it renews every day. The calculation engine keeps working meanwhile."
        )
      : textFor("İris şu an çok yoğun. Bir dakika sonra tekrar dener misin?", "Iris is very busy right now. Try again in a minute?"),
    busy.daily,
    busy.retryAfterMs
  );
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `call` again after a busy answer, a few seconds later (at most `retries` times, within the
 * question's time): the free limits are counted per minute, so a moment later there is often room.
 * `onWait(seconds)` tells the screen while it waits, and `onWait(0)` when it asks again.
 */
async function patiently<T>(call: (timeoutMs: number) => Promise<T>, timeoutMs: number, retries: number, onWait?: (seconds: number) => void): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(Math.max(1000, deadline - Date.now()));
    } catch (error) {
      if (!(error instanceof AiBusyError) || attempt >= retries) throw error;
      const wait = retryDelay(error, attempt);
      // Room is left for the answer itself to be written after the wait.
      if (wait === null || Date.now() + wait + 10_000 > deadline) throw error;
      trace("api", `yapay zekâ yoğun, ${Math.round(wait / 1000)} sn sonra yeniden soruluyor`);
      onWait?.(Math.ceil(wait / 1000));
      await pause(wait);
      onWait?.(0);
    }
  }
}

/** Busy answers are asked again twice, unless the caller says otherwise. */
const RETRIES = 2;

async function postChat(body: Record<string, unknown>, timeoutMs = 90_000): Promise<ChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw failure(res, (json as { error?: string })?.error);
    const reply = (json as { reply?: unknown }).reply;
    if (typeof reply !== "string" || !reply.trim()) throw new Error(textFor("İris boş bir yanıt verdi. Tekrar dener misin?", "Iris gave an empty answer. Try again?"));
    return json as ChatResponse;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiTimeoutError(textFor("İris zamanında yanıt veremedi. Bağlantını kontrol edip tekrar dene.", "Iris didn't answer in time. Check your connection and try again."));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// The streamed chat (/api/ai/chat/stream): the same request, the answer as server-sent events, so
// it can be shown - and spoken - as it is written. The native API bridge passes the stream on when
// the request carries this header (src/mobile/bridges.ts).
const STREAM_HEADER = "X-Chem-Stream";
/** The website has no streamed chat (not deployed): the whole-answer chat is used this session. */
let streamMissing = false;

function readEvent(event: string): Record<string, unknown> | null {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) return null;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function postChatStream(body: Record<string, unknown>, timeoutMs: number, onText: (text: string) => void): Promise<ChatResponse> {
  if (streamMissing) return postChat(body, timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", [STREAM_HEADER]: "1" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream")) {
      // Not there (the website's 404 page): the whole-answer chat, now and for the rest of the session.
      if ((res.status === 404 || res.status === 405) && !type.includes("json")) {
        streamMissing = true;
        clearTimeout(timer);
        return postChat(body, timeoutMs);
      }
      const json = await res.json().catch(() => ({}));
      throw failure(res, (json as { error?: string })?.error);
    }
    let text = "";
    let final: ChatResponse | null = null;
    const handle = (event: string) => {
      const json = readEvent(event);
      if (!json) return;
      if (typeof json.t === "string") {
        text += json.t;
        onText(text);
      } else if (json.done) {
        const reply = typeof json.reply === "string" ? json.reply : text;
        final = "conversation" in json ? { reply, conversation: json.conversation as AiConversationSummary | null } : { reply };
      } else if (typeof json.error === "string") {
        throw new Error(json.error);
      }
    };
    const reader = res.body?.getReader();
    if (!reader) (await res.text()).replace(/\r\n/g, "\n").split("\n\n").forEach(handle);
    else {
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
        let end = buffer.indexOf("\n\n");
        while (end >= 0) {
          handle(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf("\n\n");
        }
      }
      if (buffer.trim()) handle(buffer);
    }
    const answer = final as ChatResponse | null;
    if (!answer || !answer.reply.trim()) throw new Error(textFor("İris'in yanıtı yarıda kaldı. Tekrar dener misin?", "Iris's answer broke off. Try again?"));
    return answer;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiTimeoutError(textFor("İris zamanında yanıt veremedi. Bağlantını kontrol edip tekrar dene.", "Iris didn't answer in time. Check your connection and try again."));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Wakes the streamed chat's server function (a GET it answers at once), so a question does not wait for it. */
export function warmChat(): void {
  if (streamMissing) return;
  void fetch("/api/ai/chat/stream", { method: "GET", cache: "no-store" }).catch(() => undefined);
}

interface AskOptions {
  context?: string;
  /** The guide for the backup AI when `context` is left out (a saved chat's later turns: the website
   * keeps the guide with the conversation, the backup does not). */
  fallbackContext?: string;
  temperature?: number;
  timeoutMs?: number;
  onText?: (text: string) => void;
  /** Busy answers asked again (default 2); 0 for a call that has its own way out (the planner's rules). */
  retries?: number;
  /** Waiting to ask again after a busy answer: seconds, then 0 when it asks. */
  onWait?: (seconds: number) => void;
}

/** Failures the backup AI can stand in for: busy or used up, the website down, no connection to it. */
function worthBackup(error: unknown): boolean {
  if (error instanceof AiBusyError) return true;
  if (error instanceof AiHttpError) return error.status >= 500 || error.status === 402 || error.status === 404 || error.status === 408;
  return error instanceof TypeError;
}

/**
 * The website first; when it cannot answer, the backup AI (backup.ts) at once, with the time that
 * is left. Only when the backup is busy too (or not there) does the app save calls for a while and
 * wait to ask again (`patiently`).
 */
function send(body: Record<string, unknown>, opts: AskOptions): Promise<ChatResponse> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const onText = opts.onText;
  return patiently(
    async (left) => {
      const started = Date.now();
      try {
        return await (onText ? postChatStream(body, left, onText) : postChat(body, left));
      } catch (error) {
        if (!worthBackup(error)) throw error;
        const backup = await askBackup({ ...body, context: body.context ?? opts.fallbackContext }, left - (Date.now() - started));
        if (backup.kind === "answer") {
          return "conversation" in backup ? { reply: backup.reply, conversation: backup.conversation } : { reply: backup.reply };
        }
        if (backup.kind === "busy" || error instanceof AiBusyError) {
          markBusy();
          throw error instanceof AiBusyError
            ? error
            : new AiBusyError(textFor("İris şu an çok yoğun. Bir dakika sonra tekrar dener misin?", "Iris is very busy right now. Try again in a minute?"), false, null);
        }
        throw error;
      }
    },
    timeoutMs,
    opts.retries ?? RETRIES,
    opts.onWait
  );
}

/**
 * One-shot question; nothing is saved to the chat history. `temperature` (0–1) is honoured by the
 * API: the app's tool planner asks at 0 so the same question always plans the same tools.
 * `onText`: the answer so far, as it is written.
 */
export async function askAi(messages: AiMessage[], opts: AskOptions = {}): Promise<string> {
  return (await send({ messages, context: opts.context, temperature: opts.temperature }, opts)).reply;
}

/** Chat turn saved to the user's history; a null conversationId starts a new conversation. */
export async function askAiInConversation(
  messages: AiMessage[],
  opts: AskOptions & { conversationId: string | null; surface: string }
): Promise<ChatResponse> {
  const body = {
    messages,
    context: opts.context,
    temperature: opts.temperature,
    conversation: { id: opts.conversationId, surface: opts.surface },
  };
  return send(body, opts);
}

export interface AiGraphResult {
  type: "column" | "bar" | "line" | "area" | "scatter" | "pie" | "histogram" | "candlestick";
  title: string;
  xLabel: string;
  xUnit: string;
  yLabel: string;
  yUnit: string;
  columns: string[];
  rows: string[][];
  regression: "none" | "linear" | "polynomial" | "exponential" | "logarithmic";
  note: string;
}

/** Structured "create a graph" action — returns a validated graph spec from a prompt. */
export async function askAiGraph(prompt: string, data?: { columns: string[]; rows: string[][] }): Promise<AiGraphResult> {
  const res = await fetch("/api/ai/graph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, data }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error || textFor("AI grafik üretemedi.", "The AI couldn't make the graph."));
  return (json as { spec: AiGraphResult }).spec;
}

export interface AiReportDraft {
  theory: string;
  discussion: string;
  errorAnalysis: string;
  conclusionAndRecommendations: string;
  safetyAndWaste: string;
}

/** Structured "draft the report" action — returns section texts from an experiment context. */
export async function askAiReport(context: string): Promise<AiReportDraft> {
  const res = await fetch("/api/ai/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error || textFor("AI rapor üretemedi.", "The AI couldn't write the report."));
  return (json as { draft: AiReportDraft }).draft;
}
