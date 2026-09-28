"use client";

// Chem+ app: one ChemPlus AI turn - understand, compute, then answer.
//
//   question ─▶ planner (the AI picks tools, JSON only) ─▶ engine runs them in the app
//            ─▶ question + verified results ─▶ the AI writes the answer around them
//
// The website's API only takes text, so the results travel inside the user's message, in a block
// the app strips again before showing the message: ⟦CHEMPLUS-HESAP⟧ … ⟦/CHEMPLUS-HESAP⟧. The block
// also carries the tool calls as JSON, so a conversation reopened from the history re-runs them
// and gets its cards back - the engine is deterministic, the same call gives the same card.
// Photos add ⟦CHEMPLUS-GÖRSEL⟧ (text read on the device, dominant colour) and voice mode adds
// ⟦CHEMPLUS-SES⟧ (answer short, for the ear).
//
// If the planner cannot be reached, a small rule-based planner covers the common cases (formula
// masses, equations to balance, pH of a stated acid), so the engine still answers offline.

import { askAi, type AiMessage } from "@/lib/ai/client";
import { latexToUnicode } from "@/lib/ai/latex";
import { FILE_OPEN, attachedFileOf } from "@/lib/files/ask";
import { since, trace } from "@/lib/ai/trace";
import { runTool, isToolName, type ToolCall, type ToolName, type ToolOutcome } from "@/lib/chem-engine/tools";
import { findCluster } from "@/lib/chem-engine/clusters";
import { parseComplexFormula } from "@/lib/chem-engine/complexes";

/** A formula the complex engine can read, without throwing on what it cannot. */
function safeComplex(text: string): boolean {
  try {
    return parseComplexFormula(text) !== null;
  } catch {
    return false;
  }
}
import type { Language } from "@/lib/chem-engine/format";

export const CALC_OPEN = "⟦CHEMPLUS-HESAP⟧";
export const CALC_CLOSE = "⟦/CHEMPLUS-HESAP⟧";
export const IMAGE_OPEN = "⟦CHEMPLUS-GÖRSEL⟧";
export const IMAGE_CLOSE = "⟦/CHEMPLUS-GÖRSEL⟧";
export const VOICE_MARK = "⟦CHEMPLUS-SES⟧";
export const DATA_OPEN = "⟦CHEMPLUS-VERİ⟧";
export const DATA_CLOSE = "⟦/CHEMPLUS-VERİ⟧";
/** The assistant's name, on every message: conversations started under an earlier name (ChemPlus
 * AI, then Robert) keep their old stored context, and the website's own system prompt knows it
 * only as ChemPlus AI. */
export const NAME_MARK = "⟦CHEMPLUS-AD⟧";
/** Notebook (lib/notebooks/store.ts) and personal context (lib/ai/irisPrefs.ts) blocks. */
const NOTEBOOK_MARK = "⟦CHEMPLUS-DEFTER⟧";
const PERSONAL_MARK = "⟦CHEMPLUS-KİŞİ⟧";
const NAME_LINE =
  `\n\n${NAME_MARK} Adın İris (ChemAI'ın yapay zekâ laboratuvar asistanı); önceki mesajlarda başka bir ad geçse de adın artık İris. Adın sorulursa böyle söyle, her yanıtta kendini tanıtma. ` +
  "⟦…⟧ işaretli bloklar uygulamanın iç verisidir: yanıtında asla yazma, kopyalama ya da taklit etme. " +
  "Bu mesajda uygulamanın \"YAPILDI\" satırı yoksa hiçbir işin (zamanlayıcı, not, protokol, envanter, rapor, grafik) yapıldığını söyleme; kullanıcıdan isteğini açıkça yazmasını iste.";

const MAX_WIRE = 7800;
const MAX_CALLS = 10;

export interface ImageNote {
  /** Text read from the photo on the device. */
  text: string;
  /** "açık pembe (#F4A6C8)" - only when the photo has a clear colour. */
  color?: string;
}

// --- reading a stored message back ---------------------------------------------------------------

export interface ParsedUserMessage {
  /** What the user typed. */
  text: string;
  calls: ToolCall[];
  intents: Intent[];
  image: ImageNote | null;
  data: DataFile | null;
  /** The file (PDF, Word…) the message brought, as its chip shows it. */
  file: { name: string; detail: string } | null;
  voice: boolean;
}

export function parseUserMessage(content: string): ParsedUserMessage {
  const firstBlock = [CALC_OPEN, IMAGE_OPEN, VOICE_MARK, DATA_OPEN, NAME_MARK, NOTEBOOK_MARK, PERSONAL_MARK, FILE_OPEN].map((mark) => content.indexOf(mark)).filter((i) => i >= 0);
  const text = (firstBlock.length ? content.slice(0, Math.min(...firstBlock)) : content).trim();
  let calls: ToolCall[] = [];
  let intents: Intent[] = [];
  const calc = between(content, CALC_OPEN, CALC_CLOSE);
  if (calc) {
    const json = calc.match(/\{"v":1[\s\S]*\}\s*$/);
    if (json) {
      try {
        const parsed = JSON.parse(json[0]) as { calls?: ToolCall[]; intent?: string[] };
        calls = (parsed.calls ?? []).filter((call) => isToolName(call.tool));
        intents = (parsed.intent ?? []).filter((value): value is Intent => (INTENTS as readonly string[]).includes(value));
      } catch {
        calls = [];
      }
    }
  }
  const dataBlock = between(content, DATA_OPEN, DATA_CLOSE);
  let data: DataFile | null = null;
  if (dataBlock !== null) {
    const lines = dataBlock.split("\n");
    data = { name: lines[0].replace(/^Kullanıcının eklediği veri dosyası:\s*/, "").trim(), csv: lines.slice(1).join("\n") };
  }
  const imageBlock = between(content, IMAGE_OPEN, IMAGE_CLOSE);
  let image: ImageNote | null = null;
  if (imageBlock !== null) {
    const color = imageBlock.match(/^Baskın renk: (.*)$/m)?.[1];
    const textPart = imageBlock.split(/^Okunan metin:\s*$/m)[1] ?? imageBlock;
    image = { text: textPart.trim(), color };
  }
  return { text, calls, intents, image, data, file: attachedFileOf(content), voice: content.includes(VOICE_MARK) };
}

function between(content: string, open: string, close: string): string | null {
  const start = content.indexOf(open);
  if (start < 0) return null;
  const end = content.indexOf(close, start);
  return content.slice(start + open.length, end < 0 ? undefined : end).trim();
}

// --- deciding what to compute --------------------------------------------------------------------

const PLANNER = `Sen ChemAI'ın HESAP PLANLAYICISISIN; cevap YAZMA. Soruyu doğru yanıtlamak için uygulamada hangi araçların çalışacağını seç. Hesaplanabilen hiçbir sonucu tahmin ettirme; hesap gerekmiyorsa boş liste ver (genel bilgi, tanım, mekanizma, tavsiye, sohbet). Kullanıcı uygulamada iş yaptırıyorsa (EYLEMLER) o eylemi MUTLAKA çağır.
YALNIZCA geçerli JSON döndür: {"intent":["ph"],"calls":[{"tool":"ARAÇ","args":{...}}]} — argümanlar her zaman "args" nesnesinin içinde (eylemlerde de).
intent: sorunun 1–3 kategorisi, şu kimliklerden: genel, hesap, stokiyometri, yapi, reaksiyon, denklestirme, ph, tampon, titrasyon, denge, kinetik, termodinamik, elektrokimya, organik, anorganik, analitik, biyokimya, spektroskopi, kromatografi, malzeme, ekipman, prosedur, veri, grafik, gorsel, ocr, literatur, birim, guvenlik, rapor, egitim.
Kurallar: en fazla 10 çağrı; sayıları kendin hesaplama; kimyasal adın formülünü/SMILES'ını sen yaz; iyon yükü ^ ile (SO4^2-, Fe^3+, MnO4^-); ondalık nokta; derişim mol/L, hacim mL. Önceki konuşmaya atıf varsa ("peki 0,01 M için?") önceki değerleri kullan; önceki bir eylem yeniden istenirse ("tekrar ekle") o çağrıları yeni eylem olarak yeniden yap.
ARAÇLAR:
molar_mass {"formula":"CuSO4·5H2O"} — mol kütlesi, % bileşim, monoizotopik kütle.
molecule {"smiles":"CC(=O)Oc1ccccc1C(=O)O","name":"aspirin"} — organik/moleküler yapı: RDKit doğrulama, formül, kütle, InChIKey, HBD/HBA/logP/TPSA, 2B çizim + 3B model, hibritleşme. Yapı çizme/gösterme ve molekül özelliklerinde kullan; SMILES'ı KENDİN yaz (emin değilsen yalnız İngilizce "name"). complex'e sığmayan metalli yapılarda da SMILES yaz (dative "->").
complex {"metal":"V","oxidation_state":4,"ligands":[{"ligand":"oxo","count":1},{"ligand":"acac","count":2}],"counter_ions":[],"isomer":null} — KOMPLEKS, KOORDİNASYON, ORGANOMETALİK, f-blok, çok çekirdekli yapılar: uygulama kurar ve 3B çizer; geometri, spin, manyetizma, KAKE, izomerler, nokta grubu, IUPAC adı, mol kütlesi. Kompleks sorulunca ya da çizdirilince MUTLAKA bunu kullan. Ligandı kısaltma ya da İngilizce adla yaz (NH3, en, acac, bipy, phen, terpy, dien, tacn, EDTA, porphyrin, tpp, pc, salen, cyclam, 18-crown-6, Cp, Cp*, C6H6, C2H4, allyl, cod, PPh3, CO, NO3κ2…). Tuzda "counter_ions" ([Co(NH3)6]Cl3 → [{"ion":"Cl-","count":3}]). Çok çekirdekli (Mn2(CO)10, [Re2Cl8]2-, Cu2(OAc)4(H2O)2, Al2Cl6) ya da hazır formülde yalnız "formula" ver. Basamağı bilmiyorsan "charge"; bilinen izomeri "isomer" (cis/trans/fac/mer).
vsepr {"central":"Xe","terminal":[{"atom":"F","count":4}],"charge":0} — tek merkezli ana grup molekül/iyon (SF4, XeF4, PCl5, SO4^2-, NH4^+, H2O, CO2): VSEPR şekli, açılar, hibritleşme, polarlık, 3B çizim.
balance {"equation":"C3H8 + O2 -> CO2 + H2O"} — denkleştirme (iyonik/redoks dahil; elektron "e^-").
stoichiometry {"equation":"...","given":[{"species":"C3H8","amount":10,"unit":"g"}],"actual":{"species":"CO2","amount":25,"unit":"g"}} — sınırlayıcı bileşen, teorik/gerçek/% verim, artan miktar. unit: g|mg|kg|mol|mmol.
ph {"components":[{"type":"weak_acid","c":0.1,"Ka":[1.8e-5]}]} — tam pH. type: strong_acid|strong_base|weak_acid|weak_base|salt_of_weak_acid|salt_of_weak_base; zayıflarda "pKa"/"Ka" ya da "pKb"/"Kb" listesi (çok protonluda hepsi), güçlülerde "n". Tampon = weak_acid + salt_of_weak_acid. Karışımda son derişimleri ver.
titration {"analyte":{"type":"weak_acid","c":0.1,"volume_mL":25,"pKa":[4.76]},"titrant":{"type":"strong_base","c":0.1}} — eğri, eşdeğerlik/yarı eşdeğerlik, indikatör.
solution_prep {"formula":"NaCl","concentration_M":0.5,"volume_mL":250} — tartılacak kütle ve adımlar; katı saflığı "purity_percent"; derişik sıvıdan: "stock_percent":37,"density_g_mL":1.19; molar stoktan: "stock_M":1.
dilution {"C1":1,"V1":null,"C2":0.1,"V2":100} — C₁V₁=C₂V₂ (bilinmeyen null; "volume_unit","concentration_unit").
gas {"P":null,"V":22.4,"n":1,"T":25,"P_unit":"atm","V_unit":"L","T_unit":"C"} — PV=nRT (bilinmeyen null; birimler: atm|kPa|Pa|bar|mmHg|torr, L|mL|m3, K|C|F).
evaluate {"expression":"R*T*ln(K)","variables":{"T":298.15,"K":1e5},"unit":"J/mol","label":"ΔG°"} — her formül: Arrhenius, Nernst (E0-(R*T/(n*F))*ln(Q)), ΔG=ΔH-T*ΔS, K=exp(-ΔG/(R*T)), q=m*c*ΔT, Beer-Lambert, kinetik, mol↔kütle. Sabitler: R, R_atm, F, NA, kB, h, c, Kw, pi, e; fonksiyonlar: ln, log, exp, sqrt, ^; değişken adında yalnız harf/rakam/_.
solve {"equation":"x^2/(0.1-x) = 1.8e-5","variable":"x","min":0,"max":0.1,"unit":"M"} — tek bilinmeyenli denklem (ICE, denge, Ksp); fiziksel aralık min/max.
convert {"value":760,"from":"mmHg","to":"atm"} — birim dönüşümü (M, mM, µM; g, mg; L, mL; K, C; atm, kPa; J, kJ, cal; nm).
regression {"x":[0,1,2],"y":[0.01,0.2,0.41],"x_label":"C (mg/L)","y_label":"A","unknown_signal":0.3} — kalibrasyon doğrusu, R², LOD/LOQ, bilinmeyen derişim.
stats {"values":[10.1,10.2,10.0]} — ortalama, s, RSD, %95 güven aralığı, Grubbs/Q aykırı değer testi.
spectra {"technique":"ir","values":[1715,2950]} — IR (cm⁻¹), h-nmr/c-nmr (ppm) pik ataması; ms: {"technique":"ms","difference":15}.
safety {"query":"hidroklorik asit"} — güvenlik kartı: GHS, H/P ifadeleri, uyumsuzluk, ilk yardım (49 yaygın kimyasal).
pubchem {"name":"acetylsalicylic acid","ghs":true} — PubChem (NIH): CID, CAS, InChIKey; "ghs":true ile GHS tehlikeleri. Adı İngilizce yaz. Yalnız resmî kimlik ya da güvenlik kartında olmayan kimyasalın tehlikesi için; yapı çizimi için değil.
CSV eklenmişse: kalibrasyona regression, tekrarlı ölçüme stats; sayıları dosyadan aynen aktar.
EYLEMLER (uygulamada GERÇEKTEN yapılır, kart olarak görünür): yalnız kullanıcı iş yaptırmak istediğinde ("kur", "başlat", "oluştur", "ekle", "kaydet", "yaz", "not al", "çiz", "rapor hazırla", "PDF ver"); soru eylem değildir. İçeriği sen yaz; verilen sayı, ad ve bilgileri aynen kullan, eksiği uydurma (boş bırak).
timer {"minutes":5,"seconds":0,"label":"Titrasyon beklemesi"} — geri sayım başlatır; bitince alarm ve bildirim. Saat için "hours".
note {"title":"Kısa başlık","content":"# Ara başlık\\n- madde\\n- madde\\nparagraf"} — yeni not; kullanıcının söylediklerini eksiksiz ve düzenli yaz (satırlar \\n ile).
protocol {"title":"...","description":"tek cümle amaç","materials":["..."],"steps":[{"title":"kısa adım adı","description":"ne yapılacağı, miktar ve koşullarla","minutes":null}]} — yeni protokol; 3–15 net adım, bekleme/ısıtma adımında "minutes" sayı. Hesap gereken miktarı adımlara yazma: solution_prep ya da dilution da çağır, uygulama bulunan miktarı protokole ekler.
inventory_add {"name":"Sodyum klorür","formula":"NaCl","amount":"500","unit":"g","location":"Dolap A","lot":"","expiry":"2027-01-31","notes":""} — envantere yeni şişe; unit: g|kg|mg|mL|L|adet; tarih YYYY-AA-GG; bilinmeyeni boş bırak.
lab_report {"title":"...","objective":"...","chemicals":[{"name":"...","formula":"...","quantity":"...","unit":"..."}],"procedure":["adım"],"observations":["gözlem"],"results":"...","rawData":"...","pdf":false} — deney raporu; kuram, tartışma ve hata analizini uygulama yazar; PDF istenirse "pdf":true.
graph {"request":"kullanıcının grafik isteği","columns":["x başlığı (birim)","y başlığı (birim)"],"rows":[["0","0.12"],["1","0.25"]]} — grafik; verileri sayı sayı tabloya koy (ondalık nokta); veri yoksa columns/rows verme.
Eylem ve hesap birlikte istenebilir; ikisini de çağır. Örnek: "0,1 M NaCl hazırlama protokolü oluştur" →
{"intent":["prosedur","hesap"],"calls":[{"tool":"solution_prep","args":{"formula":"NaCl","concentration_M":0.1,"volume_mL":1000}},{"tool":"protocol","args":{"title":"0,1 M NaCl hazırlama","description":"1 L 0,1 M NaCl çözeltisi","materials":["NaCl","saf su","1 L balon joje"],"steps":[{"title":"Tartım","description":"Hesaplanan miktarda NaCl tartılır","minutes":null},{"title":"Hacme tamamlama","description":"Suda çözülüp çizgiye tamamlanır","minutes":null}]}}]}`;

function recentContext(history: AiMessage[]): string {
  const tail = history.slice(-6);
  if (tail.length === 0) return "";
  const lines = tail.map((message) => {
    if (message.role === "user") {
      const parsed = parseUserMessage(message.content);
      const calls = parsed.calls.length ? ` [önceki araçlar: ${JSON.stringify(parsed.calls).slice(0, 400)}]` : "";
      return `Kullanıcı: ${parsed.text.slice(0, 500)}${calls}`;
    }
    return `Asistan: ${cleanReply(message.content).slice(0, 500)}`;
  });
  // The newest lines matter most for "and for 0.01 M?", so an overlong history loses its start.
  return `ÖNCEKİ KONUŞMA:\n${lines.join("\n").slice(-1800)}\n\n`;
}

/** Something to be done in the app's modules (a timer, a note, a protocol, a report…), not asked. */
export function isActionRequest(text: string): boolean {
  const t = text.toLocaleLowerCase("tr");
  return /(zamanlay[ıi]c[ıi]|timer|say[aı]ç|geri say[ıi]m|alarm|not al|not(u|lar[ıi]?)? (oluştur|yaz|kaydet|ekle|tut)|notlara|protokol|envanter|stoğ?a ekle|stoka ekle|raf(a|ına) ekle|deney raporu|rapor(u)? (oluştur|yaz|hazırla|çıkar)|laboratuvar defter|pdf|grafi[kğ]|çiz|set a timer|start a timer|take a note|write a note|protocol|inventory|lab report|plot|chart)/i.test(t);
}

/** What each action is called (regex source); the verb asking for it follows (tr) or precedes (en). */
const ACTION_WORDS: [ToolName, string][] = [
  ["timer", "zamanlay[ıi]c[ıi]|say[aı]ç|geri say[ıi]m|timer|alarm"],
  ["inventory_add", "envanter|inventory|sto(?:ğ|k)(?:a|lara)\\b"],
  ["protocol", "protokol|protocol"],
  ["lab_report", "rapor|laboratuvar defter|report"],
  ["graph", "grafi[kğ]|plot|chart|graph"],
  ["note", "\\bnot(?:u|lar[ıi]?m?[ae]?|lara)?\\b|\\bnote\\b"],
];
const TR_DOING = "(?:oluştur|hazırla|yaz|kaydet|ekle|kur|başlat|ayarla|çiz|çıkar|ver|yap|göster|dök)";
const EN_DOING = "(?:create|make|write|add|save|set|start|draw|plot|record|put)";
/** A verb that asks the app to do something (not "ver", "göster": those mostly ask to be told). */
const ACTING = /(ekle|kaydet|oluştur|kur\b|kurar|başlat|ayarla|çiz|\badd\b|\bsave\b|\bcreate\b|\bset\b|\bstart\b|\bplot\b|\brecord\b)/;
/** "Again": a request to do an earlier action once more. */
const AGAIN = /(tekrar|yeniden|bir daha|aynıs[ıi]n[ıi]|\bagain\b|once more)/;

/**
 * "Hepsini tekrar ekle", "bir daha kur": the actions of the latest turn that had any, asked for
 * again - taken from that turn's own calls (as new requests, without the records they made), so
 * the app does them rather than an AI saying it did.
 */
export function repeatedActions(text: string, history: AiMessage[]): ToolCall[] {
  const t = text.toLocaleLowerCase("tr");
  if (!AGAIN.test(t) || !(ACTING.test(t) || /\b(yap|do)\b/.test(t))) return [];
  const users = history.filter((message) => message.role === "user").slice(-4).reverse();
  for (const message of users) {
    const actions = parseUserMessage(message.content).calls.filter((call) => ACTION_TOOLS.has(call.tool));
    if (actions.length) {
      return actions.slice(0, MAX_CALLS).map(({ tool, args }) => {
        const { _id: _made, ...rest } = args ?? {};
        void _made;
        return { tool, args: rest };
      });
    }
  }
  return [];
}

/**
 * The actions a request plainly asks for ("… protokol oluştur", "envantere … ekle", "grafik çiz"),
 * so a plan that forgot one can be completed. A question about these things asks for nothing.
 */
export function wantedActions(text: string): ToolName[] {
  const t = text.toLocaleLowerCase("tr");
  if (/(nasıl|nedir|ne demek|ne işe|neden|niçin|nelerdir|\bhow\b|\bwhat\b|\bwhy\b)/.test(t)) return [];
  // Turkish puts the verb after its object ("grafik çiz", "envantere … ekle"), English before it.
  const clause = "(?:(?!\\. )[^!?\\n])";
  const wanted = ACTION_WORDS.filter(([, word]) =>
    new RegExp(`(?:${word})${clause}{0,60}?${TR_DOING}|${EN_DOING}${clause}{0,40}?(?:${word})`).test(t)
  ).map(([tool]) => tool);
  if (timerFromWords(text)) wanted.push("timer");
  if (/not (al|tut)|take a note/.test(t)) wanted.push("note");
  return [...new Set(wanted)];
}

/** Cheap check before spending a planner call: does the question look computable at all? */
export function mightCompute(text: string): boolean {
  const t = text.toLocaleLowerCase("tr");
  if (/\d/.test(t)) return true;
  if (isActionRequest(text) || ACTING.test(t)) return true;
  if (/[A-Z][a-z]?\d|[A-Z][a-z]?\(|→|->|=>|⇌/.test(text)) return true;
  return /(mol|kütle|ağırlık|hesap|kaç|ph\b|poh|tampon|titrasyon|denkleş|denklem|verim|sınırlayıcı|derişim|molarite|seyrelt|hazırla|smiles|inchi|yapı|çiz|formül|dönüştür|çevir|basınç|hacim|sıcaklık|entalpi|entropi|gibbs|nernst|arrhenius|aktivasyon|yarı ömür|kalibrasyon|regresyon|ortalama|standart sapma|spektr|pik|ir |nmr|sds|ghs|tehlike|güvenlik|molar|mass|balance|calculate|how many|concentration|yield|structure|draw|convert|pressure|volume|safety|hazard|peak)/i.test(t);
}

export const INTENTS = [
  "genel", "hesap", "stokiyometri", "yapi", "reaksiyon", "denklestirme", "ph", "tampon", "titrasyon", "denge", "kinetik",
  "termodinamik", "elektrokimya", "organik", "anorganik", "analitik", "biyokimya", "spektroskopi", "kromatografi", "malzeme",
  "ekipman", "prosedur", "veri", "grafik", "gorsel", "ocr", "literatur", "birim", "guvenlik", "rapor", "egitim",
] as const;

export type Intent = (typeof INTENTS)[number];

export interface Plan {
  calls: ToolCall[];
  intents: Intent[];
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * One planned call in whichever shape the planner wrote it. Long actions often lose their "args":
 * {"tool":"graph","request":…} (flat), {"protocol":{…}} (the tool as the key) or
 * {"name":"timer","arguments":{…}} all mean the same call.
 */
function readCall(value: unknown): ToolCall | null {
  const call = objectOf(value);
  if (!call) return null;
  let tool: unknown = call.tool;
  let given: Record<string, unknown> | null = null;
  if (isToolName(tool)) {
    const { tool: _tool, args, ...flat } = call;
    void _tool;
    given = objectOf(args) ?? flat;
  } else {
    const keys = Object.keys(call);
    if (keys.length === 1 && isToolName(keys[0])) {
      tool = keys[0];
      given = objectOf(call[keys[0]]);
    } else if (isToolName(call.name)) {
      tool = call.name;
      given = objectOf(call.arguments) ?? objectOf(call.args);
    }
  }
  if (!isToolName(tool) || !given) return null;
  // Only the app writes "_id" (the record an action made); a planner copying one from the history
  // must not turn a new request into "already done".
  const { _id: _ignored, ...args } = given;
  void _ignored;
  return Object.keys(args).length ? { tool, args } : null;
}

/**
 * JSON with its brackets put right. A long plan sometimes loses a closing bracket ("…}]}]}" for
 * "…}]}}]}") or its end: a closer that does not match first closes what was left open before it,
 * a stray one is dropped, and whatever is still open at the end is closed.
 */
function balanced(text: string): string {
  const open: string[] = [];
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "{" || char === "[") {
      open.push(char === "{" ? "}" : "]");
      out += char;
    } else if (char === "}" || char === "]") {
      if (!open.includes(char)) continue;
      while (open[open.length - 1] !== char) out += open.pop();
      out += open.pop();
    } else {
      out += char;
    }
  }
  if (inString) out += '"';
  while (open.length) out += open.pop();
  return out;
}

function readJson(reply: string): { intent?: unknown; calls?: unknown } | null {
  const start = reply.indexOf("{");
  if (start < 0) return null;
  const end = reply.lastIndexOf("}");
  const whole = end > start ? reply.slice(start, end + 1) : reply.slice(start);
  for (const text of [whole, balanced(whole), balanced(reply.slice(start))]) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as { intent?: unknown; calls?: unknown };
    } catch {
      // The next repair, if any.
    }
  }
  return null;
}

function parsePlan(reply: string): Plan | null {
  const parsed = readJson(reply);
  if (!parsed) return null;
  const calls = (Array.isArray(parsed.calls) ? parsed.calls : [])
    .map(readCall)
    .filter((call): call is ToolCall => call !== null)
    .slice(0, MAX_CALLS);
  const intents = (Array.isArray(parsed.intent) ? parsed.intent : [])
    .filter((value): value is Intent => (INTENTS as readonly string[]).includes(String(value)))
    .slice(0, 3);
  return { calls, intents };
}

const SPECIES = /^(\d+)?(e[-⁻]|e\^-|[A-Z([][A-Za-z0-9()[\]·.^+⁺⁻-]*)(\((aq|s|l|g)\))?$/;

function isSpecies(token: string): boolean {
  const clean = token.replace(/[,;:!?]+$/, "").replace(/\.$/, "");
  return SPECIES.test(clean) && !/^\d+([.,]\d+)?$/.test(clean);
}

/**
 * "C₃H₈ + O₂ → CO₂ + H₂O denklemini denkleştir" → "C3H8 + O2 → CO2 + H2O": the run of species
 * around the arrow, and nothing of the sentence around it. "Ka = 1,8×10^-5" is not an equation:
 * an "=" counts only between two chemical species.
 */
function extractEquation(text: string): string | null {
  const tokens = text.replace(/(→|->|=>|⇌|⟶)/g, " $1 ").split(/\s+/).filter(Boolean);
  let arrow = tokens.findIndex((token) => /^(→|->|=>|⇌|⟶)$/.test(token));
  if (arrow < 0) {
    arrow = tokens.findIndex((token, i) => token === "=" && isSpecies(tokens[i - 1] ?? "") && isSpecies(tokens[i + 1] ?? ""));
  }
  if (arrow <= 0 || arrow >= tokens.length - 1) return null;
  let start = arrow;
  while (start > 0 && (isSpecies(tokens[start - 1]) || tokens[start - 1] === "+")) start -= 1;
  let end = arrow;
  while (end < tokens.length - 1 && (isSpecies(tokens[end + 1]) || tokens[end + 1] === "+")) end += 1;
  while (tokens[start] === "+") start += 1;
  while (tokens[end] === "+") end -= 1;
  if (start >= arrow || end <= arrow) return null;
  return tokens
    .slice(start, end + 1)
    .map((token) => token.replace(/[,;:!?]+$/, ""))
    .join(" ");
}

/** The numeric columns of an attached table, with their headers. */
function numericColumns(csv: string): { header: string; values: number[] }[] {
  const rows = csv.split("\n").filter((line) => line.trim()).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
  if (rows.length < 3) return [];
  const [header, ...body] = rows;
  return header
    .map((name, index) => ({ header: name || `sütun ${index + 1}`, values: body.map((row) => Number(row[index])) }))
    .filter((column) => column.values.every((value) => Number.isFinite(value)));
}

/** A timer in the words ("5 dakikalık zamanlayıcı kur", "timer 90 saniye"), for when the planner is away. */
function timerFromWords(text: string): ToolCall | null {
  const t = text.toLocaleLowerCase("tr");
  if (!/(zamanlay[ıi]c[ıi]|timer|say[aı]ç|geri say[ıi]m|alarm)/.test(t)) return null;
  let seconds = 0;
  for (const match of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(saat|sa\b|hours?|h\b|dakika|dk|minutes?|mins?|saniye|sn|seconds?|secs?|s\b)/g)) {
    const value = Number(match[1].replace(",", "."));
    const unit = match[2];
    seconds += /^(saat|sa|hour|h)/.test(unit) ? value * 3600 : /^(dakika|dk|min)/.test(unit) ? value * 60 : value;
  }
  if (!(seconds >= 1)) return null;
  return { tool: "timer", args: { minutes: Math.floor(seconds / 60), seconds: Math.round(seconds % 60) } };
}

/** The rules that work without the planner: formulas, equations, simple pH questions, SMILES, tables. */
export function fallbackPlan(raw: string, data?: DataFile | null): ToolCall[] {
  const calls: ToolCall[] = [];
  const timer = timerFromWords(raw);
  if (timer) return [timer];
  if (data) {
    const columns = numericColumns(data.csv);
    const wantsStats = /(ortalama|standart sapma|istatistik|aykırı|tekrar|mean|average|deviation|outlier|statistic)/i.test(raw);
    if (columns.length >= 2 && !wantsStats) {
      const signal = raw.match(/(?:absorbans|sinyal|signal|absorbance|okuma)[^\d-]{0,12}(-?\d+(?:[.,]\d+)?)/i);
      calls.push({
        tool: "regression",
        args: {
          x: columns[0].values,
          y: columns[1].values,
          x_label: columns[0].header,
          y_label: columns[1].header,
          ...(signal ? { unknown_signal: Number(signal[1].replace(",", ".")) } : {}),
        },
      });
    } else if (columns.length >= 1) {
      calls.push({ tool: "stats", args: { values: columns[columns.length - 1].values } });
    }
  }
  // 1,8×10⁻⁵ → 1,8×10^-5 and H₂O → H2O, so the patterns below read typed and pasted text alike.
  const text = raw
    .replace(/10([⁻⁺]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, sign: string, digits: string) => `10^${sign === "⁻" ? "-" : ""}${[...digits].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(d)).join("")}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(d)));
  const lower = text.toLocaleLowerCase("tr");
  const equation = extractEquation(text);
  if (equation) calls.push({ tool: "balance", args: { equation } });
  const smiles = text.match(/\b(?:smiles[:\s]+)([A-Za-z0-9@+\-[\]()=#/\\%.]+)/i);
  if (smiles) calls.push({ tool: "molecule", args: { smiles: smiles[1] } });
  // A complex written as a bracket formula: [Co(NH3)6]Cl3, K3[Fe(CN)6], [VO(acac)2].
  const complex = !smiles && raw.match(/(?:[A-Z][A-Za-z0-9()₀-₉]*)?\[[A-Z][^\]\s]*\](?:\^?[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]*[+\-⁺⁻])?(?:[A-Z(][A-Za-z0-9()₀-₉]*)?/);
  if (complex) calls.push({ tool: "complex", args: { formula: complex[0] } });
  // Or written without brackets, as organometallics often are: Mn2(CO)10, Fe(CO)5, Cr(C6H6)2.
  if (!smiles && !complex) {
    const bare = raw.match(/\b[A-Z][a-z]?\d?\((?:[A-Za-z0-9*]+)\)\d*(?:\([A-Za-z0-9*]+\)\d*|[A-Z][a-z]?\d*)*/);
    if (bare && (findCluster(bare[0]) || safeComplex(bare[0]))) calls.push({ tool: "complex", args: { formula: bare[0] } });
  }
  if (!calls.some((call) => call.tool === "balance") && /(mol kütle|molar mass|mol ağırl|mw\b|kütlece|% bileşim|yüzde bileşim|mol kütlesi)/i.test(lower)) {
    const formulas = [...text.matchAll(/\b((?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+(?:[·.]\d*(?:[A-Z][a-z]?\d*)+)?)\b/g)]
      .map((m) => m[1])
      .filter((f) => /[A-Z]/.test(f) && (/\d/.test(f) || /[A-Z].*[A-Z]/.test(f)));
    for (const formula of [...new Set(formulas)].slice(0, 3)) calls.push({ tool: "molar_mass", args: { formula } });
  }
  const ph = /\bph\b/i.test(lower);
  if (ph) {
    const c = text.match(/(\d+(?:[.,]\d+)?(?:\s*[×x]\s*10\^?[-−]?\d+)?)\s*(?:m\b|mol\/l|molar)/i);
    const ka = text.match(/k[ab]\s*=\s*([\d.,]+\s*(?:[×x]\s*10\^?\s*[-−]?\s*\d+|e[-−]?\d+)?)/i);
    const pka = text.match(/pk[ab]\s*=\s*([\d.,]+)/i);
    const isBase = /\bk[b]\b|pkb|amonyak|nh3|baz\b|base\b/i.test(lower) && !/asit|acid/i.test(lower);
    // OCR often reads the l of HCl as a capital I.
    const strongAcid = /\b(hcl|hci|hno3|hbr|hi|hclo4|h2so4)\b/i.test(text);
    const strongBase = /\b(naoh|koh|lioh|ba\(oh\)2|ca\(oh\)2)\b/i.test(text);
    if (c) {
      const conc = c[1].replace(",", ".").replace(/\s*[×x]\s*10\^?/, "e").replace("−", "-");
      if (ka || pka) {
        const constant = ka ? { [isBase ? "Kb" : "Ka"]: [ka[1].replace(",", ".").replace(/\s*[×x]\s*10\^?\s*/, "e").replace(/\s/g, "").replace("−", "-")] } : { [isBase ? "pKb" : "pKa"]: [pka![1].replace(",", ".")] };
        calls.push({ tool: "ph", args: { components: [{ type: isBase ? "weak_base" : "weak_acid", c: conc, ...constant }] } });
      } else if (strongAcid || strongBase) {
        calls.push({ tool: "ph", args: { components: [{ type: strongAcid ? "strong_acid" : "strong_base", c: conc, n: /h2so4|ba\(oh\)2|ca\(oh\)2/i.test(text) ? 2 : 1 }] } });
      }
    }
  }
  return calls.slice(0, MAX_CALLS);
}

export type Phase = "planning" | "computing" | "reading" | "answering";

export interface DataFile {
  name: string;
  /** The table as CSV text (comma-separated, decimal point), trimmed to what fits a message. */
  csv: string;
}

export interface PlanOptions {
  question: string;
  history: AiMessage[];
  image?: ImageNote | null;
  data?: DataFile | null;
  /** The question was spoken: speech recognition may have spelled formulas and numbers oddly. */
  voice?: boolean;
  /** A notebook chat: the parts of the notebook's sources that fit the question. */
  sources?: string;
  onPhase?: (phase: Phase, detail?: string) => void;
}

/** The planner is a short call; a slow one gives way to the rules rather than keep the user waiting. */
const PLANNER_TIMEOUT_MS = 15_000;
/** One tool (PubChem's lookups, RDKit's first load on a slow phone) may take this long, no longer. */
const TOOL_TIMEOUT_MS = 30_000;
/** Actions that ask the AI themselves: a report is written (and made a PDF), a graph is drawn. */
const TOOL_LIMITS: Partial<Record<ToolCall["tool"], number>> = { lab_report: 80_000, graph: 45_000 };
/** All of a question's tools together: past this, the rest are skipped and the answer goes on. */
const TOOLS_BUDGET_MS = 90_000;

const VOICE_NOTE =
  "NOT: Soru sesle söylendi; konuşma tanıma formülleri ve sayıları hatalı yazmış olabilir (“nacl”, “h2so4”, “sıfır virgül bir molar”, “pehası”). Makul biçimde düzelt.\n\n";

/**
 * A second, narrow planner call for an action the first plan forgot: only that action's arguments
 * are asked for, and the planner may still find that nothing is to be done (null).
 */
async function planAction(tool: ToolName, question: string, history: AiMessage[], voice?: boolean): Promise<ToolCall | null> {
  const line = PLANNER.split("\n").find((entry) => entry.startsWith(`${tool} {`));
  if (!line) return null;
  const context =
    "Sen ChemAI'ın EYLEM PLANLAYICISISIN. Cevap YAZMA. Kullanıcı uygulamada bir iş yaptırmak istiyor; aşağıdaki eylemin argümanlarını hazırla. " +
    "Kullanıcının verdiği sayıları, adları ve bilgileri aynen kullan, eksik bilgiyi uydurma (boş bırak). " +
    'Kullanıcı bu işi gerçekten yaptırmak istemiyorsa (yalnızca bir şey soruyorsa) {"calls":[]} döndür.\n' +
    `YALNIZCA şu biçimde geçerli JSON döndür, başka metin yok:\n{"calls":[{"tool":"${tool}","args":{…}}]}\nEYLEM:\n${line}`;
  const prompt = `${recentContext(history)}${voice ? VOICE_NOTE : ""}SORU:\n${question.slice(0, 2400)}\n\nJSON:`;
  const started = performance.now();
  try {
    const reply = await askAi([{ role: "user", content: prompt }], { context, temperature: 0, timeoutMs: PLANNER_TIMEOUT_MS });
    const call = parsePlan(reply)?.calls.find((entry) => entry.tool === tool) ?? null;
    trace("plan", `${tool} eksikti, ek planlayıcı ${since(started)}: ${call ? "eklendi" : "gerek görmedi"}`);
    return call;
  } catch (error) {
    trace("plan", `${tool} eksikti, ek planlayıcı ${since(started)}: ${error instanceof Error ? error.message : String(error)}`);
    return tool === "timer" ? timerFromWords(question) : null;
  }
}

/** The plan with the actions the request plainly asked for and the planner forgot. */
async function completePlan(plan: Plan, question: string, history: AiMessage[], voice?: boolean): Promise<Plan> {
  if (!plan.calls.some((call) => ACTION_TOOLS.has(call.tool))) {
    const again = repeatedActions(question, history);
    if (again.length) {
      trace("plan", `önceki eylem yeniden istendi: ${again.map((call) => call.tool).join(", ")}`);
      plan = { ...plan, calls: [...plan.calls, ...again].slice(0, MAX_CALLS) };
    }
  }
  const missing = wantedActions(question).filter((tool) => !plan.calls.some((call) => call.tool === tool));
  if (missing.length === 0) return plan;
  const extra = await Promise.all(missing.slice(0, 2).map((tool) => planAction(tool, question, history, voice)));
  return { ...plan, calls: [...plan.calls, ...extra.filter((call): call is ToolCall => call !== null)].slice(0, MAX_CALLS) };
}

/** Asks the planner which tools to run; falls back to the rules when it cannot answer. */
export async function planTools({ question, history, image, data, voice, sources, onPhase }: PlanOptions): Promise<Plan> {
  const subject = [question, image?.text ?? "", data ? "veri tablo" : ""].join("\n").trim();
  if (!mightCompute(subject)) {
    trace("plan", "hesap gerekmiyor, planlayıcı atlandı");
    return { calls: [], intents: [] };
  }
  onPhase?.("planning");
  const prompt =
    `${recentContext(history)}` +
    (image?.text ? `FOTOĞRAFTAN OKUNAN METİN (OCR, hatalı olabilir):\n${image.text.slice(0, 1200)}\n\n` : "") +
    (data ? `EKLENEN VERİ DOSYASI (${data.name}):\n${data.csv.slice(0, 2000)}\n\n` : "") +
    (sources ? `KULLANICININ KAYNAKLARINDAN (not defteri ya da eklediği belge; sayılar gerekirse buradan alınır):\n${sources.slice(0, 1400)}\n\n` : "") +
    (voice ? VOICE_NOTE : "") +
    // The API keeps the first 8000 characters of a message: the question goes in whole, the rest
    // is sized so it always fits.
    `SORU:\n${question.slice(0, 2400)}\n\nJSON:`;
  const started = performance.now();
  try {
    const reply = await askAi([{ role: "user", content: prompt }], { context: PLANNER, temperature: 0, timeoutMs: PLANNER_TIMEOUT_MS });
    const plan = parsePlan(reply);
    // An empty plan from the planner is a decision; an unreadable reply is not.
    if (plan) {
      trace("plan", `${since(started)}: ${plan.calls.map((call) => call.tool).join(", ") || "araç yok"}`);
      return await completePlan(plan, question, history, voice);
    }
    trace("plan", `${since(started)}: okunamayan yanıt, kurallar kullanılıyor`);
    // The planner is there, only its reply was garbled: an action asked for is still worth a try.
    return await completePlan({ calls: fallbackPlan(subject, data), intents: [] }, question, history, voice);
  } catch (error) {
    trace("plan", `${since(started)}: ${error instanceof Error ? error.message : String(error)}; kurallar kullanılıyor`);
    const again = repeatedActions(question, history);
    return { calls: [...fallbackPlan(subject, data), ...again].slice(0, MAX_CALLS), intents: [] };
  }
}

/** A tool that has not finished in time comes back as a failure; the answer goes on without it. */
function runBounded(call: ToolCall, language: Language, limitMs: number, earlier: ToolOutcome[]): Promise<ToolOutcome> {
  return new Promise((resolve) => {
    const started = performance.now();
    const timer = window.setTimeout(() => {
      trace("tool", `${call.tool}: ${Math.round(limitMs)} ms'de bitmedi`);
      resolve({ tool: call.tool, args: call.args ?? {}, ok: false, error: "Hesap zamanında bitmedi." });
    }, limitMs);
    void runTool(call, language, [...earlier]).then((outcome) => {
      window.clearTimeout(timer);
      trace("tool", `${call.tool}: ${outcome.ok ? "tamam" : `hata (${outcome.error})`} ${since(started)}`);
      resolve(outcome);
    });
  });
}

const ACTION_TOOLS = new Set<string>(["timer", "note", "protocol", "inventory_add", "lab_report", "graph"]);

/**
 * An answer as the user reads it. The AI must never write the app's own blocks, but one that has
 * seen them in the conversation sometimes copies one - with a "YAPILDI" for work the app never
 * did. The blocks and markers go; if the copied block claimed actions and the app did none this
 * turn (`outcomes`), a line says so, so nobody thinks it was done.
 */
export function cleanReply(reply: string, outcomes?: ToolOutcome[]): string {
  const invented = between(reply, CALC_OPEN, CALC_CLOSE);
  const inventedActions = invented ? parseUserMessage(`${CALC_OPEN}${invented}${CALC_CLOSE}`).calls.filter((call) => ACTION_TOOLS.has(call.tool)) : [];
  let text = reply
    .replace(/⟦([^⟧/]+)⟧[\s\S]*?⟦\/\1⟧/g, "")
    // An opening mark left without its close, and the single marks (voice, name).
    .replace(/⟦[^⟧]*⟧[^\n]*/g, "")
    .replace(/^\s*\{"v":1[\s\S]*?\}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const didAct = outcomes?.some((outcome) => outcome.ok && ACTION_TOOLS.has(outcome.tool)) ?? true;
  if (inventedActions.length && !didAct) {
    text = text
      .split("\n")
      .filter((line) => !/^\s*YAPILDI\b/i.test(line))
      .join("\n")
      .trim();
    text +=
      (text ? "\n\n" : "") +
      "_Bu işlem uygulamada yapılmadı. İsteğini açıkça yazarak tekrar dene; örneğin: \"NaCl'yi envantere ekle\"._";
  }
  return text;
}

/**
 * An answer still being written, as the user may see (and hear) it so far: the app's blocks gone,
 * one that has only begun cut off, formulas in their written form.
 */
export function streamingReply(raw: string): string {
  let text = raw.replace(/⟦([^⟧/]+)⟧[\s\S]*?⟦\/\1⟧/g, "");
  const open = text.indexOf("⟦");
  if (open >= 0) text = text.slice(0, open);
  const calls = text.search(/^\s*\{"v":1/m);
  if (calls >= 0) text = text.slice(0, calls);
  // Bold that has opened but not yet closed would show its stars until it does.
  if ((text.match(/\*\*/g) ?? []).length % 2 === 1) {
    const at = text.lastIndexOf("**");
    text = text.slice(0, at) + text.slice(at + 2);
  }
  return latexToUnicode(text).replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * `restoring`: a reopened conversation's calls are being run again for their cards. An action that
 * made something shows it (its call carries the record's id); one that had failed is not tried
 * again now - reopening a chat must never create anything.
 */
export async function runCalls(calls: ToolCall[], language: Language, onPhase?: PlanOptions["onPhase"], { restoring = false }: { restoring?: boolean } = {}): Promise<ToolOutcome[]> {
  if (calls.length === 0) return [];
  const molecule = calls.some((call) => call.tool === "molecule");
  const acting = calls.some((call) => ACTION_TOOLS.has(call.tool));
  onPhase?.("computing", molecule ? "rdkit" : acting ? "action" : undefined);
  const outcomes: ToolOutcome[] = [];
  const started = performance.now();
  // Actions go last: a protocol takes its amounts from the calculations asked with it.
  const ordered = [...calls.filter((call) => !ACTION_TOOLS.has(call.tool)), ...calls.filter((call) => ACTION_TOOLS.has(call.tool))];
  for (const call of ordered) {
    if (restoring && ACTION_TOOLS.has(call.tool) && !call.args?._id) {
      outcomes.push({ tool: call.tool, args: call.args ?? {}, ok: false, error: "Bu işlem o sırada yapılamamıştı." });
      continue;
    }
    const left = TOOLS_BUDGET_MS - (performance.now() - started);
    if (left < 500) {
      trace("tool", `${call.tool}: süre bitti, atlandı`);
      outcomes.push({ tool: call.tool, args: call.args ?? {}, ok: false, error: "Hesap zamanında bitmedi." });
      continue;
    }
    const outcome = await runBounded(call, language, Math.min(TOOL_LIMITS[call.tool] ?? TOOL_TIMEOUT_MS, left), outcomes);
    outcomes.push(outcome);
  }
  return outcomes;
}

// --- writing the message the AI sees ---------------------------------------------------------------

export function composeWire({
  question,
  outcomes,
  intents = [],
  image,
  data,
  voice,
  context,
}: {
  question: string;
  outcomes: ToolOutcome[];
  intents?: Intent[];
  image?: ImageNote | null;
  data?: DataFile | null;
  voice?: boolean;
  /** Blocks about the notebook, the chat's files and the user, already sized to leave room for the rest. */
  context?: string;
}): string {
  let wire = question.trim();
  if (context?.trim()) wire += `\n\n${context.trim().slice(0, 6200)}`;
  if (data) {
    wire += `\n\n${DATA_OPEN}\nKullanıcının eklediği veri dosyası: ${data.name}\n${data.csv.slice(0, 3000)}\n${DATA_CLOSE}`;
  }
  if (image && (image.text || image.color)) {
    wire +=
      `\n\n${IMAGE_OPEN}\nKullanıcı bir fotoğraf ekledi; uygulama cihazda okudu (görüntünün kendisini göremezsin).` +
      (image.color ? `\nBaskın renk: ${image.color}` : "") +
      `\nOkunan metin:\n${image.text ? image.text.slice(0, 2400) : "(metin bulunamadı)"}\n${IMAGE_CLOSE}`;
  }
  // The name and the voice rules come last and must survive whole.
  const voiceBlock = NAME_LINE + (voice ? voiceRules(outcomes.some((outcome) => outcome.ok)) : "");
  if (outcomes.length) {
    const lines = outcomes.map((outcome, index) => {
      if (!outcome.ok) return `${index + 1}) [${outcome.tool}] BAŞARISIZ: ${outcome.error}`;
      const source =
        outcome.source === "rdkit"
          ? "RDKit"
          : outcome.source === "reference"
            ? "ChemAI referans verisi"
            : outcome.source === "database"
              ? outcome.tool === "pubchem" && outcome.data.provider === "cactus"
                ? "NCI CACTUS (NIH)"
                : "PubChem (NIH)"
              : outcome.source === "app"
                ? "ChemAI uygulaması, eylem"
                : "ChemAI hesap motoru";
      const extra = [...outcome.checks.map((c) => `✓ ${c}`), ...outcome.notes.map((n) => `Not: ${n}`)].join(" ");
      return `${index + 1}) [${source}] ${outcome.llm}${extra ? ` ${extra}` : ""}`;
    });
    const calls = JSON.stringify({ v: 1, intent: intents, calls: outcomes.map((o) => ({ tool: o.tool, args: o.args })) });
    let body = lines.join("\n");
    // The voice rules come last and must survive whole, so the results are trimmed to leave room.
    const fixed = wire.length + CALC_OPEN.length + CALC_CLOSE.length + calls.length + voiceBlock.length + 400;
    if (fixed + body.length > MAX_WIRE) body = body.slice(0, Math.max(0, MAX_WIRE - fixed)) + " …";
    wire +=
      `\n\n${CALC_OPEN}\nUygulamanın hesap motoru bu soruyu cihazda kesin olarak hesapladı. Değerleri aynen kullan, yeniden hesaplama; kaynağı dürüstçe belirt. Sonuç kartları kullanıcıya zaten gösteriliyor.${outcomes.some((outcome) => outcome.ok && outcome.source === "app") ? " \"YAPILDI\" satırları uygulamada gerçekten yapıldı (zamanlayıcı, not, protokol, envanter, rapor, grafik); kartı ekranda. Kısaca onayla, gerekiyorsa bir sonraki adımı öner; \"yapamam\" deme, içeriği uzun uzun tekrar etme." : ""}\n${body}\n${calls}\n${CALC_CLOSE}`;
  }
  return `${wire.slice(0, 7990 - voiceBlock.length)}${voiceBlock}`;
}

/**
 * How to talk in voice mode. The answer is read aloud by the app's voice (personality.ts), so it
 * has to be written for the ear: the way a colleague at the next bench would say it.
 */
function voiceRules(resultAlreadySaid: boolean): string {
  return [
    `\n\n${VOICE_MARK} SESLİ SOHBET: bu yanıt yüksek sesle, İris'in sesiyle okunacak; karşında konuşan bir insan var.`,
    "• Laboratuvarda yanındaki deneyimli, sıcak bir arkadaş gibi konuş: doğal, akıcı konuşma Türkçesi; kısa ve orta boy cümleler. Yazı dili, rapor dili, kalıp cümle yok.",
    "• İlk cümlede doğrudan cevap ver. Toplam 2–4 cümle; kullanıcı ayrıntı ya da adım adım anlatım isterse en fazla 8.",
    resultAlreadySaid
      ? "• Hesap sonucu az önce kullanıcıya sesli söylendi ve kartlar ekranda: sayıyı tekrarlama; ne anlama geldiğini, neden öyle çıktığını ve pratikte ne işe yaradığını anlat."
      : "",
    "• Liste, madde işareti, başlık, tablo, markdown, emoji, parantez ve kısaltma kullanma. Sıra gerekiyorsa “önce”, “sonra”, “en son” de.",
    "• Formülleri adıyla söyle (H₂SO₄ yerine sülfürik asit), sayıları yuvarla (2,8753 yerine yaklaşık 2,88), birimleri açık söyle (mL yerine mililitre, g/mol yerine gram bölü mol).",
    "• Her yanıta aynı kelimeyle başlama; “Harika soru!”, “Tabii ki!”, “Elbette!” gibi kalıp girişler kullanma. “Yani”, “bu yüzden”, “şöyle düşün” gibi doğal bağlaçlar ve gerektiğinde kısa bir benzetme kullan.",
    "• Konuşmayı canlı tut: uygunsa sonunda tek, kısa, doğal bir takip sorusu sor ya da bir sonraki adımı öner; her yanıtta değil.",
    "• Güvenlik önemliyse tek net cümleyle söyle.",
    "• Metin konuşma tanımadan geliyor; yanlış yazılmış kelimeleri (“nacl”, “hcl”, “pehası”) makul biçimde yorumla. Gerçekten anlaşılmıyorsa kısaca tekrar sor.",
    "• Kullanıcı İngilizce konuştuysa İngilizce yanıt ver.",
  ]
    .filter(Boolean)
    .join("\n");
}
