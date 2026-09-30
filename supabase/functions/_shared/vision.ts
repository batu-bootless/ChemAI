// ChemAI: the vision models that read a photo for Iris (the iris-vision function). Nothing here is
// Deno-specific, so the unit tests run it.
//
// Measured (30 Sep 2026) on a test page - a drawn Friedel-Crafts scheme with its options, aspirin's
// skeletal formula and an iron-oxide equation: qwen3.8-27b on Groq read every question, option,
// structure (SMILES), condition and equation correctly in 2-4 s, for about 2700 tokens a photo
// (Groq's free tier allows 8000 tokens a minute and 1000 requests a day per model). NVIDIA's
// vision models did not answer in 90 s or did not see the image, so they are left out. Gemini
// models follow when a Gemini key is set.

export type VisionProvider = "groq" | "gemini";

export interface VisionModel {
  provider: VisionProvider;
  id: string;
  /** Extra request fields (the reasoning kept out of the answer). */
  extra?: Record<string, unknown>;
}

/** Tried in turn; VISION_MODELS (the same "provider:model" list) replaces it. */
export const DEFAULT_VISION_MODELS = "groq:qwen/qwen3.8-27b,gemini:gemini-flash-latest,gemini:gemini-flash-lite-latest";

const KNOWN: Record<string, Record<string, unknown>> = {
  "groq:qwen/qwen3.8-27b": { reasoning_format: "hidden" },
};

export function parseVisionModels(spec: string): VisionModel[] {
  const out: VisionModel[] = [];
  for (const raw of spec.split(",")) {
    const item = raw.trim();
    const colon = item.indexOf(":");
    const provider = item.slice(0, colon) as VisionProvider;
    const id = item.slice(colon + 1).trim();
    if (colon < 1 || (provider !== "groq" && provider !== "gemini") || !id) continue;
    if (!out.some((model) => model.provider === provider && model.id === id)) out.push({ provider, id, extra: KNOWN[`${provider}:${id}`] });
  }
  return out;
}

/** The request that shows `image` (base64 JPEG) to `model` with the reading instructions. */
export function visionRequest(model: VisionModel, prompt: string, image: string, key: string): { url: string; init: RequestInit } {
  if (model.provider === "groq") {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id,
          temperature: 0.1,
          max_tokens: 3000,
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }] }],
          ...model.extra,
        }),
      },
    };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: image } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    },
  };
}

/** The reading (the JSON object the model was asked for) from a model's answer, or null. */
export function readingFrom(provider: VisionProvider, data: unknown): unknown | null {
  const answer = data as { choices?: { message?: { content?: unknown } }[]; candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text =
    provider === "groq"
      ? String(answer?.choices?.[0]?.message?.content ?? "")
      : (answer?.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  // Some models wrap the JSON in a ```json block or say a word before it.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const reading = JSON.parse(text.slice(start, end + 1));
    return reading && typeof reading === "object" ? reading : null;
  } catch {
    return null;
  }
}
