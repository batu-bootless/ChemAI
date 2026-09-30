// ChemAI: reads a photo for Iris with a vision model (a Supabase Edge Function, Deno).
//
// The website's AI takes text only, and a phone's text recognition cannot read a skeletal
// formula or a reaction arrow. This function shows the photo to a vision model and asks it to
// READ, not solve: every question with its options, each drawn structure as SMILES, each reaction
// as an equation, each formula, and all the text. The app then solves the question the usual way
// - its engine checks the structures (RDKit) and equations (the balancer) - and draws the answer
// as cards.
//
// The models are tried in turn (../_shared/vision.ts: qwen3.8-27b on Groq, then Gemini when a
// Gemini key is set): one that is busy (429), overloaded (5xx) or not offered (404) passes the photo
// to the next.
//
// Deploy (README): the keys (GROQ_API_KEY, GEMINI_API_KEY) as function secrets or in the Vault
// (../_shared/keys.ts), then supabase functions deploy iris-vision --no-verify-jwt (the function
// checks the caller's session itself, so it works with any JWT signing setup).

import { aiKeys } from "../_shared/keys.ts";
import { DEFAULT_VISION_MODELS, parseVisionModels, readingFrom, visionRequest } from "../_shared/vision.ts";

const MODELS = parseVisionModels(Deno.env.get("VISION_MODELS") ?? DEFAULT_VISION_MODELS);
/** All the models together; the app gives up on the reading at 30 s. */
const BUDGET_MS = 26_000;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
/** About 6 MB of JPEG as base64; the app sends at most 1600 px (a few hundred KB). */
const MAX_IMAGE = 8_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function prompt(language: "tr" | "en"): string {
  return `Sen bir kimya görseli OKUYUCUSUSUN. Görevin görüntüdekini eksiksiz ve doğru OKUMAK; soruları ÇÖZME, cevap verme.
Yalnızca şu JSON'u döndür (boş kalanları boş dizi bırak):
{"ozet":"görüntüde ne var, 1 cümle","sorular":[{"no":"1","metin":"soru metni","secenekler":["A) …","B) …"]}],"molekuller":[{"etiket":"görüntüdeki adı/numarası (I, 2a…)","ad":"biliniyorsa IUPAC/yaygın ad","smiles":"SMILES"}],"tepkimeler":[{"denklem":"ASCII denklem","reaktanlar":["SMILES"],"urunler":["SMILES"],"kosullar":"ok üstü/altı: reaktif, katalizör, sıcaklık, çözücü"}],"formuller":[{"ifade":"PV = nRT","ad":"…"}],"metin":"görüntüdeki tüm yazı, satır satır","guven":"yuksek|orta|dusuk","notlar":["okunamayan/belirsiz kısımlar"]}
Kurallar:
- Çizilmiş her organik yapı (iskelet formül, halka, kama/kesik bağ) için SMILES yaz; stereokimya çizilmişse SMILES'a koy. Yapı belirsizse SMILES'ı boş bırak ve notlara yaz; UYDURMA.
- Anorganik tepkimeleri formüllerle ASCII yaz: "Fe2O3 + CO -> Fe + CO2"; yükler "Fe^3+", "SO4^2-"; hal simgeleri (aq), (s), (g) varsa koru. Görüntüde katsayı varsa aynen yaz, yoksa ekleme.
- Organik tepkimede reaktan ve ürünleri SMILES olarak ver; bilinmeyen ürün soruluyorsa (?) urunler'i boş bırak.
- Soru numaralarını ve şıkları görüntüdeki gibi koru; sayıları, birimleri ve üst/alt simgeleri dikkatle oku (10⁻⁵, cm³, °C).
- El yazısı ya da bulanık kısımları tahmin etme; notlara yaz ve guven'i düşür.
- Metin alanlarını görüntünün dilinde yaz (${language === "en" ? "genellikle İngilizce" : "genellikle Türkçe"}).`;
}

/** Signed-in ChemAI users only: the caller's token is checked with Supabase Auth. */
async function signedIn(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Yalnızca POST." }, 405);
  const stored = await aiKeys();
  const keys = { groq: stored.GROQ_API_KEY, gemini: stored.GEMINI_API_KEY };
  const models = MODELS.filter((model) => keys[model.provider]);
  if (!models.length) return json({ error: "Görsel okuma kurulmamış (Groq ya da Gemini anahtarı yok)." }, 503);
  if (!(await signedIn(req))) return json({ error: "Giriş gerekli." }, 401);

  let body: { image?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }
  const image = typeof body.image === "string" ? body.image.trim() : "";
  if (!image || image.length > MAX_IMAGE || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return json({ error: "Geçersiz görüntü." }, 400);
  const language = body.language === "en" ? "en" : "tr";

  const deadline = Date.now() + BUDGET_MS;
  let busy = false;
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    const name = `${model.provider}:${model.id}`;
    const { url, init } = visionRequest(model, prompt(language), image, keys[model.provider]!);
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(left) });
    } catch (error) {
      // No answer in time: the next model, if there is time for it.
      console.error("vision fetch", name, error);
      busy = true;
      continue;
    }
    if (!res.ok) {
      console.error("vision", name, res.status, (await res.text()).slice(0, 300));
      if (res.status === 429 || res.status >= 500) busy = true;
      if (res.status === 429 || res.status >= 500 || res.status === 404) continue;
      break;
    }
    const reading = readingFrom(model.provider, await res.json().catch(() => null));
    if (reading) return json({ reading, model: name });
    console.error("vision: unreadable reading", name);
  }
  return busy
    ? json({ error: "Görsel okuma şu an çok yoğun; biraz sonra tekrar dene." }, 429)
    : json({ error: "Görsel okunamadı." }, 502);
});
