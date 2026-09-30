// ChemAI: reads a photo for Iris with Gemini's vision (a Supabase Edge Function, Deno).
//
// The website's AI takes text only, and a phone's text recognition cannot read a skeletal
// formula or a reaction arrow. This function shows the photo to a vision model and asks it to
// READ, not solve: every question with its options, each drawn structure as SMILES, each reaction
// as an equation, each formula, and all the text. The app then solves the question the usual way
// - its engine checks the structures (RDKit) and equations (the balancer) - and draws the answer
// as cards.
//
// Deploy (README): GEMINI_API_KEY as a function secret or in the Vault (../_shared/keys.ts), then
// supabase functions deploy iris-vision --no-verify-jwt (the function checks the caller's session
// itself, so it works with any JWT signing setup).

import { aiKeys } from "../_shared/keys.ts";

// Tried in turn: each Gemini model has its own limits (on the free tier a few requests a minute
// each), so when one is busy (429), overloaded (503) or not offered (404), the next reads the photo.
// GEMINI_MODELS (comma separated, e.g. from AI Studio's rate-limit page) replaces the list.
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest,gemini-flash-lite-latest")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
/** All the models together; the app gives up on the reading at 40 s. */
const BUDGET_MS = 38_000;
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
  const GEMINI_KEY = (await aiKeys()).GEMINI_API_KEY;
  if (!GEMINI_KEY) return json({ error: "Görsel okuma kurulmamış (GEMINI_API_KEY yok)." }, 503);
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
  let res: Response | null = null;
  let model = "";
  let busy = false;
  for (const candidate of MODELS) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    model = candidate;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt(language) }, { inline_data: { mime_type: "image/jpeg", data: image } }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(left),
      });
    } catch (error) {
      console.error("gemini fetch", candidate, error);
      return json({ error: "Görsel model zamanında yanıt vermedi." }, 504);
    }
    if (res.ok) break;
    console.error("gemini", candidate, res.status, (await res.text()).slice(0, 500));
    if (res.status !== 429 && res.status !== 503 && res.status !== 404) break;
    busy ||= res.status !== 404;
    res = null;
  }
  if (!res || !res.ok) {
    return busy
      ? json({ error: "Görsel okuma şu an çok yoğun; biraz sonra tekrar dene." }, 429)
      : json({ error: "Görsel okunamadı." }, 502);
  }
  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("");
  try {
    return json({ reading: JSON.parse(text), model });
  } catch {
    console.error("unreadable reading", text.slice(0, 500));
    return json({ error: "Görsel modelin yanıtı okunamadı." }, 502);
  }
});
