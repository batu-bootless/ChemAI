// ChemAI: Iris's backup AI (a Supabase Edge Function, Deno). The app asks the website first
// (Gemini); when the website is busy, its day's quota is gone or it is down, the app asks here, and
// this function walks a chain of free models (Groq, NVIDIA, and Gemma on the Gemini key) until one
// answers - see ../_shared/router.ts. A conversation turn is saved to the chat history with the
// user's own session, as the website would, when the tables allow it.
//
// Deploy (README): the keys as function secrets or in the Vault (../_shared/keys.ts), then
// supabase functions deploy iris-chat --no-verify-jwt (the function checks the caller's session
// itself). IRIS_CHAT_MODELS replaces the model chain.

import { aiKeys } from "../_shared/keys.ts";
import { DEFAULT_CHAIN, Health, expand, parseChain, route, type ChatMessage, type Keys, type ModelEntry, type Provider } from "../_shared/router.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const CHAIN = parseChain(Deno.env.get("IRIS_CHAT_MODELS") ?? DEFAULT_CHAIN);
/** Requests a user may make a minute (per function instance): one user cannot use up everyone's share. */
const PER_USER_PER_MINUTE = 30;
const MAX_MESSAGES = 16;
const MAX_CHARS = 12_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const health = new Health();

// The providers' model lists, for "<provider>:auto": read once an hour.
const LISTS: Partial<Record<Provider, string>> = {
  nvidia: "https://integrate.api.nvidia.com/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
};
const listed: Partial<Record<Provider, { at: number; ids: string[] }>> = {};

async function list(provider: Provider, key: string): Promise<string[]> {
  const known = listed[provider];
  if (known && Date.now() - known.at < 60 * 60_000) return known.ids;
  try {
    const res = await fetch(LISTS[provider]!, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    // A model with a small context cannot take Iris's guide (about 3000 tokens) and a question.
    const ids = (data?.data ?? [])
      .filter((m: { context_window?: number }) => !m.context_window || m.context_window >= 16_000)
      .map((m: { id?: string }) => String(m.id ?? ""))
      .filter(Boolean);
    listed[provider] = { at: Date.now(), ids };
  } catch {
    // Asked again in five minutes.
    listed[provider] = { at: Date.now() - 55 * 60_000, ids: known?.ids ?? [] };
  }
  return listed[provider]!.ids;
}

async function chain(keys: Keys): Promise<ModelEntry[]> {
  const lists: Partial<Record<Provider, string[]>> = {};
  for (const provider of ["nvidia", "groq"] as const) {
    const key = keys[provider];
    if (key && CHAIN.some((e) => e.provider === provider && e.id === "auto")) lists[provider] = await list(provider, key);
  }
  return expand(CHAIN, lists);
}

const recent = new Map<string, number[]>();

function allowed(userId: string): boolean {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= PER_USER_PER_MINUTE) return false;
  times.push(now);
  recent.set(userId, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

/** The signed-in caller (the token checked with Supabase Auth), or null. */
async function caller(req: Request): Promise<{ id: string; token: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === "string" ? { id: user.id, token } : null;
}

// --- the chat history (with the user's own session, so its row rules apply) ------------------------

interface Summary {
  id: string;
  title: string;
  surface: string;
  updatedAt: number;
}

function rest(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY ?? "",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
  });
}

const summary = (row: { id: string; title?: string; surface?: string; updated_at?: string }): Summary => ({
  id: row.id,
  title: row.title ?? "",
  surface: row.surface ?? "",
  updatedAt: Date.parse(row.updated_at ?? "") || Date.now(),
});

/** The turn saved as the website saves it; null when the history tables do not take it. */
async function save(user: { id: string; token: string }, conversation: { id?: unknown; surface?: unknown }, question: string, reply: string): Promise<Summary | null> {
  try {
    let row: { id: string; title?: string; surface?: string; updated_at?: string } | null = null;
    let created = false;
    if (typeof conversation.id === "string" && conversation.id) {
      const res = await rest(user.token, `ai_conversations?id=eq.${encodeURIComponent(conversation.id)}&select=id,title,surface,updated_at`, { method: "GET" });
      row = res.ok ? ((await res.json())[0] ?? null) : null;
      if (!row) return null;
    } else {
      const title = question.split("⟦")[0].replace(/\s+/g, " ").trim().slice(0, 80) || "Sohbet";
      const surface = typeof conversation.surface === "string" ? conversation.surface.slice(0, 120) : "";
      const res = await rest(user.token, "ai_conversations", { method: "POST", body: JSON.stringify({ user_id: user.id, title, surface }) });
      row = res.ok ? ((await res.json())[0] ?? null) : null;
      if (!row) {
        console.error("history: conversation not created", res.status, (await res.text().catch(() => "")).slice(0, 300));
        return null;
      }
      created = true;
    }
    const messages = [
      { conversation_id: row.id, role: "user", content: question },
      { conversation_id: row.id, role: "assistant", content: reply },
    ];
    const res = await rest(user.token, "ai_messages", { method: "POST", body: JSON.stringify(messages), headers: { Prefer: "return=minimal" } });
    if (!res.ok) {
      console.error("history: messages not saved", res.status, (await res.text().catch(() => "")).slice(0, 300));
      if (created) await rest(user.token, `ai_conversations?id=eq.${row.id}`, { method: "DELETE" });
      return null;
    }
    const touched = await rest(user.token, `ai_conversations?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ updated_at: new Date().toISOString() }) });
    const fresh = touched.ok ? ((await touched.json())[0] ?? row) : row;
    return summary(fresh);
  } catch (error) {
    console.error("history", error);
    return null;
  }
}

// --- the request -------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Yalnızca POST." }, 405);
  const stored = await aiKeys();
  const keys: Keys = { groq: stored.GROQ_API_KEY, nvidia: stored.NVIDIA_API_KEY, gemini: stored.GEMINI_API_KEY };
  if (!keys.groq && !keys.nvidia && !keys.gemini) return json({ error: "Yedek yapay zekâ kurulmamış." }, 503);
  const user = await caller(req);
  if (!user) return json({ error: "Giriş gerekli." }, 401);
  if (!allowed(user.id)) return json({ error: "Çok hızlı soruyorsun; birkaç saniye sonra tekrar dene." }, 429);

  let body: { messages?: unknown; context?: unknown; temperature?: unknown; budgetMs?: unknown; conversation?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }
  const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is ChatMessage => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim() !== "")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "Geçersiz istek." }, 400);
  const context = typeof body.context === "string" ? body.context.slice(0, MAX_CHARS) : undefined;
  const temperature = typeof body.temperature === "number" ? body.temperature : undefined;
  const budgetMs = Math.min(60_000, Math.max(5_000, typeof body.budgetMs === "number" ? body.budgetMs : 45_000));

  const result = await route({ messages, context, temperature, budgetMs }, await chain(keys), {
    keys,
    fetch,
    health,
  });
  if (!result.ok) {
    console.error("iris-chat: no model answered", result.status, result.notes.join(" | "));
    return json({ error: result.error }, result.status);
  }
  const conversation =
    body.conversation && typeof body.conversation === "object"
      ? await save(user, body.conversation as { id?: unknown; surface?: unknown }, messages[messages.length - 1].content, result.reply)
      : undefined;
  return json({ reply: result.reply, model: result.model, ...(conversation !== undefined ? { conversation } : {}) });
});
