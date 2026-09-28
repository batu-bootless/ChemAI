"use client";

import { textFor } from "@/mobile/i18n";

// Thin browser-side client for the AI endpoints. Keeps the fetch shape in one
// place so every AI surface (chat panel, graph analysis, calculator explain)
// talks to /api/ai/* the same way.

import type { AiConversationSummary } from "@/lib/ai/history";

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
    if (!res.ok) throw new Error((json as { error?: string })?.error || textFor("İris yanıt veremedi.", "Iris couldn't answer."));
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
      throw new Error((json as { error?: string })?.error || textFor("İris yanıt veremedi.", "Iris couldn't answer."));
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

/**
 * One-shot question; nothing is saved to the chat history. `temperature` (0–1) is honoured by the
 * API: the app's tool planner asks at 0 so the same question always plans the same tools.
 * `onText`: the answer so far, as it is written.
 */
export async function askAi(
  messages: AiMessage[],
  opts: { context?: string; temperature?: number; timeoutMs?: number; onText?: (text: string) => void } = {}
): Promise<string> {
  const body = { messages, context: opts.context, temperature: opts.temperature };
  if (opts.onText) return (await postChatStream(body, opts.timeoutMs ?? 90_000, opts.onText)).reply;
  return (await postChat(body, opts.timeoutMs)).reply;
}

/** Chat turn saved to the user's history; a null conversationId starts a new conversation. */
export async function askAiInConversation(
  messages: AiMessage[],
  opts: {
    context?: string;
    conversationId: string | null;
    surface: string;
    temperature?: number;
    timeoutMs?: number;
    onText?: (text: string) => void;
  }
): Promise<ChatResponse> {
  const body = {
    messages,
    context: opts.context,
    temperature: opts.temperature,
    conversation: { id: opts.conversationId, surface: opts.surface },
  };
  if (opts.onText) return postChatStream(body, opts.timeoutMs ?? 90_000, opts.onText);
  return postChat(body, opts.timeoutMs);
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
