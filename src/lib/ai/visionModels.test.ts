import { describe, expect, it } from "vitest";
import { DEFAULT_VISION_MODELS, parseVisionModels, readingFrom, visionRequest } from "../../../supabase/functions/_shared/vision";
import { wantsCards } from "./answerCards";

describe("wantsCards", () => {
  it("asks for cards with a photo, a structure, a reaction or a formula", () => {
    expect(wantsCards("Bunu çöz", true)).toBe(true);
    expect(wantsCards("Etil asetatın yapısı nedir?", false)).toBe(true);
    expect(wantsCards("Fe2O3 + CO -> Fe + CO2 denkleştir", false)).toBe(true);
    expect(wantsCards("NaCl suda nasıl çözünür?", false)).toBe(true);
  });

  it("leaves small talk and plain questions without cards", () => {
    expect(wantsCards("Merhaba, nasılsın?", false)).toBe(false);
    expect(wantsCards("5 dakikalık zamanlayıcı kur", false)).toBe(false);
    expect(wantsCards("Laboratuvarda önlük neden giyilir?", false)).toBe(false);
  });
});

describe("vision models", () => {
  it("reads Groq's qwen first, then Gemini", () => {
    const models = parseVisionModels(DEFAULT_VISION_MODELS);
    expect(models.map((m) => `${m.provider}:${m.id}`)).toEqual(["groq:qwen/qwen3.8-27b", "gemini:gemini-flash-latest", "gemini:gemini-flash-lite-latest"]);
    expect(models[0].extra).toEqual({ reasoning_format: "hidden" });
    expect(parseVisionModels("foo:bar,groq:,gemini:x")).toEqual([{ provider: "gemini", id: "x", extra: undefined }]);
  });

  it("shows the photo to Groq as an image in the message", () => {
    const { url, init } = visionRequest(parseVisionModels(DEFAULT_VISION_MODELS)[0], "OKU", "QUJD", "k");
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].content).toEqual([{ type: "text", text: "OKU" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } }]);
    expect(body.reasoning_format).toBe("hidden");
  });

  it("takes the reading out of a ```json block or a word before it", () => {
    const groq = { choices: [{ message: { content: 'İşte:\n```json\n{"sorular":[{"no":"1","metin":"X nedir?"}]}\n```' } }] };
    expect(readingFrom("groq", groq)).toEqual({ sorular: [{ no: "1", metin: "X nedir?" }] });
    const gemini = { candidates: [{ content: { parts: [{ text: '{"metin":"a"}' }] } }] };
    expect(readingFrom("gemini", gemini)).toEqual({ metin: "a" });
    expect(readingFrom("groq", { choices: [{ message: { content: "okuyamadım" } }] })).toBeNull();
  });
});
