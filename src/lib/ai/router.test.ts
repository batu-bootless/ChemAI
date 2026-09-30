import { describe, expect, it } from "vitest";
import { DEFAULT_CHAIN, Health, expand, isChatModel, normalizeReply, parseChain, route, type ModelEntry } from "../../../supabase/functions/_shared/router";

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const status = (code: number, headers: Record<string, string> = {}) => new Response(JSON.stringify({ error: "x" }), { status: code, headers });
const model = (id: string, extra: Partial<ModelEntry> = {}): ModelEntry => ({ provider: "nvidia", id, timeoutMs: 5000, maxConcurrent: 4, slow: false, ...extra });
const req = { messages: [{ role: "user" as const, content: "NaCl nedir?" }], context: "Kılavuz", budgetMs: 20_000 };
const keys = { nvidia: "k", gemini: "g" };

/** A fake API: each model answers as `answers` says, and every request is noted. */
function fakeFetch(answers: Record<string, () => Response | Promise<Response>>) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    const id = String(body.model ?? /models\/([^:]+):/.exec(url)?.[1]);
    const answer = answers[id];
    if (!answer) return status(404);
    return answer();
  };
  return { fetcher, calls };
}

describe("parseChain", () => {
  it("reads the chain, keeps the known settings and drops what it cannot read", () => {
    const chain = parseChain("nvidia:nvidia/nemotron-3-super-120b-a12b, gemini:gemma-4-31b-it,foo:bar,nvidia:,nvidia:nvidia/nemotron-3-super-120b-a12b,nvidia:auto");
    expect(chain.map((e) => `${e.provider}:${e.id}`)).toEqual(["nvidia:nvidia/nemotron-3-super-120b-a12b", "gemini:gemma-4-31b-it", "nvidia:auto"]);
    expect(chain[0].extra).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(parseChain(DEFAULT_CHAIN)[0].id).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("adds NVIDIA's other chat models for auto, leaving out embeddings, guards and code models", () => {
    const chain = expand(parseChain("nvidia:a/one,nvidia:auto"), ["a/one", "b/two-70b-instruct", "nvidia/nv-embedqa-mistral-7b-v2", "meta/llama-guard-4-12b", "bigcode/starcoder2-15b"]);
    expect(chain.map((e) => e.id)).toEqual(["a/one", "b/two-70b-instruct"]);
    expect(isChatModel("nvidia/nemotron-parse")).toBe(false);
  });
});

describe("normalizeReply", () => {
  it("drops the thinking and puts bare card JSON in the iris block", () => {
    expect(normalizeReply("<think>hmm</think>\nYanıt")).toBe("Yanıt");
    expect(normalizeReply('{"kartlar":[{"tur":"sonuc"}]}')).toBe('```iris\n{"kartlar":[{"tur":"sonuc"}]}\n```');
    expect(normalizeReply("```iris\n{}\n```")).toBe("```iris\n{}\n```");
    expect(normalizeReply("⟦CHEMPLUS-HESAP⟧ n = PV/RT ⟦/CHEMPLUS-HESAP⟧")).toBe("n = PV/RT");
  });
});

describe("route", () => {
  it("moves on from a busy model and lets it rest", async () => {
    let now = 1_000_000;
    const health = new Health();
    const { fetcher, calls } = fakeFetch({ first: () => status(429, { "retry-after": "20" }), second: () => ok("İkinci yanıtladı") });
    const chain = [model("first"), model("second")];
    const result = await route(req, chain, { keys, fetch: fetcher, health, now: () => now });
    expect(result).toMatchObject({ ok: true, reply: "İkinci yanıtladı", model: "second", tried: ["first", "second"] });
    expect(calls[1].body.messages).toEqual([{ role: "system", content: "Kılavuz" }, { role: "user", content: "NaCl nedir?" }]);
    // Resting: the next question goes straight to the second model…
    now += 10_000;
    const again = await route(req, chain, { keys, fetch: fetcher, health, now: () => now });
    expect(again.tried).toEqual(["second"]);
    // …until the first one's 20 s are over.
    now += 15_000;
    expect((await route(req, chain, { keys, fetch: fetcher, health, now: () => now })).tried).toEqual(["first", "second"]);
  });

  it("passes over a model that already has its share of requests", async () => {
    const health = new Health();
    const full = model("full", { maxConcurrent: 1 });
    health.begin(full);
    const { fetcher } = fakeFetch({ full: () => ok("dolu"), free: () => ok("boş") });
    const result = await route(req, [full, model("free")], { keys, fetch: fetcher, health });
    expect(result).toMatchObject({ ok: true, model: "free" });
  });

  it("waits for a quick model to free up rather than take a slow one", async () => {
    const health = new Health();
    const quick = model("quick", { maxConcurrent: 1 });
    health.begin(quick);
    const { fetcher } = fakeFetch({ quick: () => ok("hızlı"), lazy: () => ok("yavaş") });
    // The other question on the quick model finishes while this one waits.
    const sleep = async () => health.end(quick);
    const result = await route(req, [quick, model("lazy", { slow: true })], { keys, fetch: fetcher, health, sleep });
    expect(result).toMatchObject({ ok: true, model: "quick", tried: ["quick"] });
  });

  it("takes a slow model once the question has waited long enough", async () => {
    let now = 0;
    const health = new Health();
    const quick = model("quick", { maxConcurrent: 1 });
    health.begin(quick);
    const { fetcher } = fakeFetch({ lazy: () => ok("yavaş") });
    const result = await route({ ...req, budgetMs: 60_000 }, [quick, model("lazy", { slow: true })], {
      keys,
      fetch: fetcher,
      health,
      now: () => now,
      sleep: async () => {
        now += 7_000;
      },
    });
    expect(result).toMatchObject({ ok: true, model: "lazy" });
    expect(now).toBeGreaterThanOrEqual(20_000);
  });

  it("rests a model that is not offered for hours, and one that does not answer in time", async () => {
    let now = 0;
    const health = new Health();
    const slow = model("slow", { timeoutMs: 30 });
    const { fetcher } = fakeFetch({
      slow: () => new Promise<Response>(() => undefined),
      good: () => ok("tamam"),
    });
    const hanging = async (url: string, init: RequestInit) =>
      Promise.race([fetcher(url, init), new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("timeout"))))]);
    const result = await route(req, [model("gone"), slow, model("good")], { keys, fetch: hanging, health, now: () => now });
    expect(result).toMatchObject({ ok: true, model: "good", tried: ["gone", "slow", "good"] });
    now = 60_000;
    expect(health.available(slow, now)).toBe(false);
    now = 3 * 60_000;
    expect(health.available(slow, now)).toBe(true);
    expect(health.available(model("gone"), now)).toBe(false);
    expect(health.available(model("gone"), 13 * 60 * 60_000)).toBe(true);
  });

  it("says busy when every model is resting, and not set up without keys", async () => {
    const health = new Health();
    const { fetcher } = fakeFetch({ a: () => status(503), b: () => status(429) });
    expect(await route(req, [model("a"), model("b")], { keys, fetch: fetcher, health })).toMatchObject({ ok: false, status: 429, notes: ["a: 503", "b: 429"] });
    expect(await route(req, [model("a")], { keys: {}, fetch: fetcher, health: new Health() })).toMatchObject({ ok: false, status: 503 });
  });

  it("asks Gemma on the Gemini key with the guide in the first message", async () => {
    const { fetcher, calls } = fakeFetch({
      "gemma-4-31b-it": () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Gemma yanıtladı" }] } }] }), { status: 200 }),
    });
    const result = await route(req, [{ ...model("gemma-4-31b-it"), provider: "gemini" }], { keys, fetch: fetcher, health: new Health() });
    expect(result).toMatchObject({ ok: true, reply: "Gemma yanıtladı" });
    expect(calls[0].url).toContain("models/gemma-4-31b-it:generateContent");
    expect(calls[0].body.contents).toEqual([{ role: "user", parts: [{ text: "Kılavuz\n\nNaCl nedir?" }] }]);
  });
});
