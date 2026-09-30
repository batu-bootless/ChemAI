// ChemAI: Iris's model router - the chain of free models behind the iris-chat function.
//
// The website answers with Gemini; when it is busy or its day's quota is gone, the app asks the
// iris-chat function, which walks this chain: the first model that is free answers. A model that
// says "too many requests" (429), is overloaded (503) or times out rests for a while, one that is
// not offered on the account (404) rests for hours, and a model that already has its share of
// requests under way is passed over - so many users at once spread over the models instead of
// queueing on one. Nothing here is Deno-specific (fetch is passed in), so the unit tests run it.
//
// Measured on NVIDIA's free API (30 Sep 2026) with Iris's real prompt: nemotron-3-super without
// its thinking answered in 2-15 s, gpt-oss-20b (low reasoning) in 3-16 s, both correct and in the
// card format. Most of the 81 listed models are not served to a free account (404) or are not
// chat models; "nvidia:auto" still adds every listed chat model at the end of the chain, so a
// model NVIDIA turns on later is used without a new release.

export type Provider = "nvidia" | "gemini";

export interface ModelEntry {
  provider: Provider;
  id: string;
  /** Extra request fields (thinking off, low reasoning). */
  extra?: Record<string, unknown>;
  /** One attempt may take this long before the next model is tried. */
  timeoutMs: number;
  /** Requests under way on this model (per function instance) before it is passed over. */
  maxConcurrent: number;
  /** Measured slow under load (or never measured): tried only when the quick models are resting, or
   * after a question has waited a while for a quick one to free up. */
  slow: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Iris's guide (the system prompt). */
  context?: string;
  temperature?: number;
  /** All the models together may take this long (the app's own wait for the answer). */
  budgetMs: number;
}

export type RouteResult =
  | { ok: true; reply: string; model: string; tried: string[] }
  | { ok: false; status: number; error: string; tried: string[]; notes: string[] };

const THINKING_OFF = { chat_template_kwargs: { enable_thinking: false } };

/**
 * Settings for the models measured to work (timeouts from a burst of 20 questions at once: a model
 * that has not answered by then is usually stuck in a queue, and the next one is quicker).
 */
const KNOWN: Record<string, Partial<ModelEntry>> = {
  // Quick: 1-16 s each with 6-8 questions at once.
  "nvidia/nemotron-3-super-120b-a12b": { extra: THINKING_OFF, timeoutMs: 20_000, maxConcurrent: 6, slow: false },
  "openai/gpt-oss-20b": { extra: { reasoning_effort: "low" }, timeoutMs: 20_000, maxConcurrent: 8, slow: false },
  "gemma-4-31b-it": { timeoutMs: 25_000, slow: false },
  "google/diffusiongemma-26b-a4b-it": { timeoutMs: 12_000, maxConcurrent: 8, slow: false },
  // Slow under load (their queue fills): the last resort.
  "google/gemma-4-31b-it": { timeoutMs: 35_000 },
  "nvidia/nemotron-3-ultra-550b-a55b": { extra: THINKING_OFF, timeoutMs: 20_000 },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": { timeoutMs: 15_000 },
  "meta/llama-3.2-11b-vision-instruct": { timeoutMs: 15_000 },
  "z-ai/glm-5.3": { timeoutMs: 40_000, maxConcurrent: 2 },
  "moonshotai/kimi-k3": { timeoutMs: 50_000, maxConcurrent: 2 },
};

/**
 * Best answers first, then the quick ones, the slow ones last; `auto` adds the rest of NVIDIA's
 * chat models. IRIS_CHAT_MODELS replaces it.
 */
export const DEFAULT_CHAIN = [
  "nvidia:nvidia/nemotron-3-super-120b-a12b",
  "nvidia:openai/gpt-oss-20b",
  "gemini:gemma-4-31b-it",
  "nvidia:google/diffusiongemma-26b-a4b-it",
  "nvidia:google/gemma-4-31b-it",
  "nvidia:nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "nvidia:meta/llama-3.2-11b-vision-instruct",
  "nvidia:z-ai/glm-5.3",
  "nvidia:moonshotai/kimi-k3",
  "nvidia:auto",
].join(",");

/** A model nobody has measured gets a short try: an unknown one must not eat the question's time. */
function entry(provider: Provider, id: string): ModelEntry {
  return { provider, id, timeoutMs: 15_000, maxConcurrent: 4, slow: true, ...KNOWN[id] };
}

/** "nvidia:model,gemini:model,nvidia:auto" → entries (auto stays a marker, filled by `expand`). */
export function parseChain(spec: string): ModelEntry[] {
  const out: ModelEntry[] = [];
  for (const raw of spec.split(",")) {
    const item = raw.trim();
    const colon = item.indexOf(":");
    if (colon < 1) continue;
    const provider = item.slice(0, colon) as Provider;
    const id = item.slice(colon + 1).trim();
    if ((provider !== "nvidia" && provider !== "gemini") || !id) continue;
    if (!out.some((e) => e.provider === provider && e.id === id)) out.push(entry(provider, id));
  }
  return out;
}

/** Listed models that are not for chat: embeddings, retrievers, safety guards, reward, OCR, images, code-only… */
const NOT_CHAT =
  /embed|retriever|rerank|guard|safety|reward|parse|clip|deplot|kosmos|fuyu|neva|vila|detector|calibration|translate|cosmos|starcoder|codegemma|codellama|codestral|coder|laguna|recurrentgemma|gemma-2b|muse-glimmer|lightning|chatqa|mixtral-8x22b-v0\.1|llama2-70b/i;

export function isChatModel(id: string): boolean {
  return !NOT_CHAT.test(id);
}

/** The chain with "nvidia:auto" replaced by NVIDIA's listed chat models not already in it. */
export function expand(chain: ModelEntry[], listed: string[]): ModelEntry[] {
  const out: ModelEntry[] = [];
  for (const item of chain) {
    if (item.provider === "nvidia" && item.id === "auto") {
      for (const id of listed) {
        if (isChatModel(id) && !chain.some((e) => e.provider === "nvidia" && e.id === id) && !out.some((e) => e.id === id)) out.push(entry("nvidia", id));
      }
    } else out.push(item);
  }
  return out;
}

// --- health: which models rest, and how busy each is -----------------------------------------------

export class Health {
  private restUntil = new Map<string, number>();
  private inflight = new Map<string, number>();

  private key(e: ModelEntry) {
    return `${e.provider}:${e.id}`;
  }

  resting(e: ModelEntry, now: number): boolean {
    return (this.restUntil.get(this.key(e)) ?? 0) > now;
  }

  /** As many requests under way as it takes: it frees up in seconds. */
  full(e: ModelEntry): boolean {
    return (this.inflight.get(this.key(e)) ?? 0) >= e.maxConcurrent;
  }

  available(e: ModelEntry, now: number): boolean {
    return !this.resting(e, now) && !this.full(e);
  }

  begin(e: ModelEntry) {
    this.inflight.set(this.key(e), (this.inflight.get(this.key(e)) ?? 0) + 1);
  }

  end(e: ModelEntry) {
    this.inflight.set(this.key(e), Math.max(0, (this.inflight.get(this.key(e)) ?? 1) - 1));
  }

  rest(e: ModelEntry, ms: number, now: number) {
    this.restUntil.set(this.key(e), Math.max(this.restUntil.get(this.key(e)) ?? 0, now + ms));
  }

  /** How long a model rests after a failed answer (status 0: no answer in time, or no connection). */
  static restFor(status: number, retryAfterMs: number | null): number {
    if (status === 429) return Math.min(Math.max(retryAfterMs ?? 60_000, 10_000), 10 * 60_000);
    if (status === 404 || status === 410) return 12 * 60 * 60_000;
    if (status === 401 || status === 403) return 10 * 60_000;
    if (status === 400 || status === 422) return 10 * 60_000;
    // No answer in time (0), overloaded (5xx): its queue is long, give it two minutes.
    return status === 0 ? 2 * 60_000 : 30_000;
  }
}

// --- the reply -------------------------------------------------------------------------------------

/**
 * The answer as the app reads it: no thinking, none of the app's own block markers (some models
 * copy the ⟦CHEMPLUS-…⟧ tags of the guide into their answer), and card JSON in the ```iris block.
 */
export function normalizeReply(text: string): string {
  let out = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .replace(/⟦\/?CHEMPLUS-[^⟧]{1,20}⟧/g, "")
    .trim();
  if (/^\{[\s\S]*"kartlar"[\s\S]*\}$/.test(out)) out = "```iris\n" + out + "\n```";
  return out;
}

// --- one model --------------------------------------------------------------------------------------

export interface Keys {
  nvidia?: string;
  gemini?: string;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

function retryAfter(res: Response, body: string): number | null {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const said = /retry(?:\s*in|Delay"?\s*:\s*"?)\s*([\d.]+)\s*s/i.exec(body);
  return said ? Number(said[1]) * 1000 : null;
}

async function ask(e: ModelEntry, req: ChatRequest, keys: Keys, fetcher: Fetch, timeoutMs: number): Promise<{ status: number; text: string; wait: number | null }> {
  const signal = AbortSignal.timeout(timeoutMs);
  const temperature = typeof req.temperature === "number" ? Math.min(1, Math.max(0, req.temperature)) : 0.35;
  let res: Response;
  if (e.provider === "nvidia") {
    const messages = [...(req.context ? [{ role: "system", content: req.context }] : []), ...req.messages];
    res = await fetcher("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${keys.nvidia}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model: e.id, messages, temperature, max_tokens: 4096, stream: false, ...e.extra }),
      signal,
    });
  } else {
    // Gemma on the Gemini API takes no system instruction: the guide opens the first message.
    const contents = req.messages.map((m, i) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: i === 0 && req.context ? `${req.context}\n\n${m.content}` : m.content }],
    }));
    res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${e.id}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": keys.gemini ?? "" },
      body: JSON.stringify({ contents, generationConfig: { temperature, maxOutputTokens: 4096 } }),
      signal,
    });
  }
  const body = await res.text();
  if (!res.ok) return { status: res.status, text: body, wait: retryAfter(res, body) };
  let text = "";
  try {
    const json = JSON.parse(body);
    text =
      e.provider === "nvidia"
        ? String(json?.choices?.[0]?.message?.content ?? "")
        : (json?.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("");
  } catch {
    return { status: 502, text: body.slice(0, 200), wait: null };
  }
  return { status: 200, text, wait: null };
}

// --- the chain ---------------------------------------------------------------------------------------

/** A question waits this long for a quick model to free up before a slow one is tried. */
const PATIENCE_MS = 20_000;
/** Between two walks of the chain while every quick model is busy. */
const STEP_MS = 600;

/**
 * The first model in the chain that answers. Models resting or already busy are skipped; one that
 * fails is rested and the next is asked. While the quick models are only busy (not resting), the
 * chain is walked again every moment - a quick model frees up in seconds - and the slow ones are
 * held back for the first 20 s. It all ends with the question's time: when every model is resting
 * or busy the caller hears "busy" (429) and asks again a little later.
 */
export async function route(
  req: ChatRequest,
  chain: ModelEntry[],
  deps: { keys: Keys; fetch: Fetch; health: Health; now?: () => number; sleep?: (ms: number) => Promise<void> }
): Promise<RouteResult> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = now();
  const deadline = started + req.budgetMs;
  const usable = chain.filter((e) => (e.provider === "nvidia" ? deps.keys.nvidia : deps.keys.gemini));
  const tried: string[] = [];
  /** What each failed model said, for the function's log. */
  const notes: string[] = [];
  let busy = false;
  while (deadline - now() >= 2500) {
    // A quick model that is only busy will be free in a moment: worth waiting for, for a while.
    const quickSoon = () => usable.some((e) => !e.slow && !deps.health.resting(e, now()) && deps.health.full(e));
    let asked = false;
    for (const e of usable) {
      if (!deps.health.available(e, now())) {
        busy = true;
        continue;
      }
      if (e.slow && now() - started < PATIENCE_MS && quickSoon()) continue;
      const left = deadline - now();
      if (left < 2500) break;
      asked = true;
      tried.push(e.id);
      deps.health.begin(e);
      try {
        const answer = await ask(e, req, deps.keys, deps.fetch, Math.min(e.timeoutMs, left - 500));
        if (answer.status === 200) {
          const reply = normalizeReply(answer.text);
          if (reply) return { ok: true, reply, model: e.id, tried };
          notes.push(`${e.id}: boş yanıt`);
          deps.health.rest(e, 5 * 60_000, now());
          continue;
        }
        notes.push(`${e.id}: ${answer.status}`);
        if (answer.status === 429 || answer.status >= 500) busy = true;
        deps.health.rest(e, Health.restFor(answer.status, answer.wait), now());
      } catch {
        // No answer in time, or no connection: the next model.
        notes.push(`${e.id}: süre doldu`);
        busy = true;
        deps.health.rest(e, Health.restFor(0, null), now());
      } finally {
        deps.health.end(e);
      }
    }
    // Every model tried failed or rests: nothing will free up in this question's time.
    if (!quickSoon() && !asked) break;
    if (!quickSoon() && asked && !usable.some((e) => deps.health.available(e, now()))) break;
    await sleep(STEP_MS);
  }
  return busy || tried.length
    ? { ok: false, status: 429, error: "Bütün yapay zekâ modelleri şu an meşgul.", tried, notes }
    : { ok: false, status: 503, error: "Yedek yapay zekâ kurulmamış.", tried, notes };
}
