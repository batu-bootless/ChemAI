"use client";

// ChemAI: asking Iris about the files of a chat. The website's AI takes about 8000 characters a
// message, and an article is many times that, so each question gets what it needs of the file:
//
//   a short file              the whole of it
//   a question about a part   the passages that fit the question best (with their pages)
//   the whole file            ("özetle", "tara", "ana fikirleri neler"…): the file read part by part
//                             into a dense summary with page tags (map), joined into one (reduce),
//                             kept with the file so it is made once - plus the best passages
//
// The block tells Iris to answer from the file, cite the pages and never make up what is not there.

import { askAi } from "@/lib/ai/client";
import { since, trace } from "@/lib/ai/trace";
import { countLabel, kindLabel, type FileDoc } from "./read";

export const FILE_OPEN = "⟦CHEMPLUS-BELGE⟧";
export const FILE_CLOSE = "⟦/CHEMPLUS-BELGE⟧";
const ATTACHED = "Kullanıcı bu mesajla bir belge ekledi:";

/** A file as the chat shows it: its name and what it is ("PDF · 12 sayfa"). */
export interface FileRef {
  id: string;
  name: string;
  detail: string;
}

export function fileRef(doc: FileDoc, language: "tr" | "en"): FileRef {
  return { id: doc.id, name: doc.name, detail: `${kindLabel(doc.kind, language)} · ${countLabel(doc, language)}` };
}

/** The file a stored message brought (for its chip when the chat is opened again). */
export function attachedFileOf(content: string): { name: string; detail: string } | null {
  const match = content.match(/Kullanıcı bu mesajla bir belge ekledi: "([^"\n]+)" \(([^)\n]+)\)/);
  return match ? { name: match[1], detail: match[2] } : null;
}

/** The whole file is asked about, not a passage of it. */
export function wantsWholeDocument(question: string): boolean {
  return /(özet|özetle|özetini|tara\b|tarayıp|taray|incele|gözden geçir|genel bakış|ana fikir|ana hat|ana nokta|önemli nokta|neler anlatıyor|ne anlatıyor|ne hakkında|konusu ne|sonuçları neler|bulgular|değerlendir|eleştir|analiz et|kısaca anlat|baştan sona|tamamını|tümünü|hepsini|makaleyi|belgeyi|dosyayı|sunumu|summar|overview|main points|key points|key findings|what is (this|the) (paper|article|document|file) about|review|analy[sz]e|go through)/i.test(
    question
  );
}

// --- passages ------------------------------------------------------------------------------------

const STOP = new Set(
  "ve veya ile bir bu şu o da de mi mı mu mü için gibi kadar daha çok en ne nasıl neden hangi kaç ya ama ki ise olan olarak her tüm bana beni benim sen sana belge belgede belgeyi makale makalede dosya dosyada tara detaylandır anlat açıkla the and for with from that this what how which into are was were have has not can paper article document".split(" ")
);

function terms(text: string): string[] {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word))
    // A rough stem: the first six letters carry a Turkish word ("titrasyonda" → "titras").
    .map((word) => word.slice(0, 6));
}

interface Passage {
  doc: number;
  order: number;
  place: string;
  text: string;
  terms: string[];
}

const PASSAGE_CHARS = 900;

function passages(docs: FileDoc[]): Passage[] {
  const out: Passage[] = [];
  docs.forEach((doc, docIndex) => {
    let order = 0;
    for (const part of doc.parts) {
      const text = part.text;
      for (let start = 0; start < text.length; ) {
        let end = Math.min(text.length, start + PASSAGE_CHARS);
        if (end < text.length) {
          const cut = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end));
          if (cut > start + 300) end = cut + 1;
        }
        const piece = text.slice(start, end).trim();
        if (piece) out.push({ doc: docIndex, order: order++, place: part.place, text: piece, terms: terms(piece) });
        start = end;
      }
    }
  });
  return out;
}

/** The passages that best answer `question`, within `budget` characters, in the file's order. */
export function relevantPassages(docs: FileDoc[], question: string, budget: number): string {
  if (!docs.length || budget < 200) return "";
  const all = passages(docs);
  const wanted = new Set(terms(question));
  const df = new Map<string, number>();
  for (const passage of all) for (const term of new Set(passage.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  const scored = all.map((passage) => {
    const counts = new Map<string, number>();
    for (const term of passage.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of wanted) {
      const tf = counts.get(term);
      if (tf) score += (1 + Math.log(tf)) * Math.log(1 + all.length / (df.get(term) ?? 1));
    }
    // Short passages full of the words beat long ones that mention them once.
    return { passage, score: score / Math.sqrt(Math.max(1, passage.terms.length / 40)) };
  });
  const matched = scored.some((entry) => entry.score > 0);
  // Nothing matches (a vague question): the beginning, where a paper says what it is about.
  scored.sort((a, b) => (matched ? b.score - a.score : a.passage.doc - b.passage.doc || a.passage.order - b.passage.order));
  const picked: Passage[] = [];
  let used = 0;
  const many = docs.length > 1;
  for (const { passage, score } of scored) {
    if (matched && score <= 0) break;
    const line = passage.text.length + passage.place.length + (many ? docs[passage.doc].name.length + 4 : 0) + 6;
    if (used + line > budget) continue;
    picked.push(passage);
    used += line;
    if (used > budget - 250) break;
  }
  picked.sort((a, b) => a.doc - b.doc || a.order - b.order);
  return picked.map((passage) => `[${many ? `${docs[passage.doc].name} · ` : ""}${passage.place}] ${passage.text}`).join("\n");
}

function wholeText(doc: FileDoc): string {
  return doc.parts.map((part) => `[${part.place}] ${part.text}`).join("\n");
}

// --- the whole file, boiled down ----------------------------------------------------------------

/** One reading call's share of the file: what fits a message with the instructions. */
const WINDOW_CHARS = 6400;
/** Past this many windows, windows spread over the file are read (a book is not read whole). */
const MAX_WINDOWS = 12;
const DIGEST_CHARS = 3600;

function windows(doc: FileDoc): { places: string; text: string }[] {
  const out: { places: string[]; text: string }[] = [];
  let current = { places: [] as string[], text: "" };
  // Each window is filled up: a page that does not fit goes on in the next one.
  for (const part of doc.parts) {
    let start = 0;
    while (start < part.text.length) {
      const room = WINDOW_CHARS - current.text.length - part.place.length - 4;
      if (room < 400 && current.text) {
        out.push(current);
        current = { places: [], text: "" };
        continue;
      }
      let end = Math.min(part.text.length, start + room);
      if (end < part.text.length) {
        const cut = Math.max(part.text.lastIndexOf("\n", end), part.text.lastIndexOf(". ", end));
        if (cut > start + room / 2) end = cut + 1;
      }
      current.text += `[${part.place}] ${part.text.slice(start, end)}\n`;
      if (!current.places.includes(part.place)) current.places.push(part.place);
      start = end;
    }
  }
  if (current.text) out.push(current);
  let chosen = out;
  if (out.length > MAX_WINDOWS) {
    const step = (out.length - 1) / (MAX_WINDOWS - 1);
    chosen = Array.from({ length: MAX_WINDOWS }, (_, index) => out[Math.round(index * step)]);
  }
  return chosen.map((entry) => ({
    places: entry.places.length > 1 ? `${entry.places[0]} – ${entry.places[entry.places.length - 1]}` : entry.places[0] ?? "",
    text: entry.text.slice(0, WINDOW_CHARS + 200),
  }));
}

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function askWithRetry(prompt: string, context: string): Promise<string> {
  try {
    return await askAi([{ role: "user", content: prompt }], { context, temperature: 0.2, timeoutMs: 45_000 });
  } catch {
    // Too many requests at once, or a slow moment: once more, a little later.
    await pause(2500);
    return askAi([{ role: "user", content: prompt }], { context, temperature: 0.2, timeoutMs: 45_000 });
  }
}

/**
 * The whole file boiled down to about 3600 characters with page tags, read part by part (three
 * reading calls at a time). `onProgress(done, total)` follows the reading.
 */
export async function digestOf(doc: FileDoc, language: "tr" | "en", onProgress?: (done: number, total: number) => void): Promise<string> {
  const tr = language === "tr";
  const parts = windows(doc);
  const sampled = parts.length === MAX_WINDOWS && doc.chars > WINDOW_CHARS * MAX_WINDOWS;
  const started = performance.now();
  const readRules = tr
    ? "Sen bir belge okuyucususun; sana bir belgenin bir bölümü verilecek. Bu bölümü yoğun biçimde, Türkçe, madde madde çıkar: konu ve amaç, yöntemler, sayısal sonuçlar (birimleriyle, aynen), tanımlar, önemli iddialar ve sonuçlar. Her maddenin sonuna köşeli parantezle yerini yaz ([s. 4]). En fazla 9 madde ve 850 karakter. Yorum ekleme, bölümde olmayanı yazma."
    : "You are a document reader; you get one part of a document. Extract it densely as bullet points in English: topic and aim, methods, numerical results (with units, verbatim), definitions, key claims and conclusions. End each bullet with its place in square brackets ([p. 4] as given). At most 9 bullets and 850 characters. No comments, nothing that is not in the part.";
  let done = 0;
  onProgress?.(0, parts.length);
  const notes: string[] = new Array(parts.length).fill("");
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const index = next++;
      const part = parts[index];
      try {
        notes[index] = (await askWithRetry(`BELGE: "${doc.name}" — BÖLÜM ${index + 1}/${parts.length} (${part.places})\n\n${part.text}`, readRules)).trim();
      } catch {
        notes[index] = "";
      }
      done += 1;
      onProgress?.(done, parts.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const read = notes.map((note, index) => (note ? `${tr ? "Bölüm" : "Part"} ${index + 1} (${parts[index].places}):\n${note}` : "")).filter(Boolean);
  if (!read.length) throw new Error(tr ? "Belge okunamadı; bağlantını kontrol edip tekrar dene." : "The document couldn't be read; check your connection and try again.");
  let digest = read.join("\n\n");
  if (digest.length > DIGEST_CHARS) {
    const joinRules = tr
      ? `Aşağıda bir belgenin bölüm bölüm çıkarılmış notları var. Bunları tek, yoğun, düzenli bir özete dönüştür: önce belgenin konusu ve amacı, sonra yöntem, önemli bulgular ve sayılar (aynen), sonuçlar. Köşeli parantezli yer etiketlerini ([s. 4]) koru. En fazla ${DIGEST_CHARS - 200} karakter. Notlarda olmayanı ekleme.`
      : `Below are notes taken part by part from a document. Turn them into one dense, ordered summary: first the topic and aim, then methods, key findings and numbers (verbatim), conclusions. Keep the place tags in square brackets. At most ${DIGEST_CHARS - 200} characters. Add nothing that is not in the notes.`;
    try {
      digest = (await askWithRetry(digest.slice(0, 7600), joinRules)).trim();
    } catch {
      digest = digest.slice(0, DIGEST_CHARS);
    }
  }
  if (sampled) digest += tr ? "\n(Belge çok uzun olduğu için eşit aralıklı bölümleri okundu.)" : "\n(The document is very long, so evenly spaced parts of it were read.)";
  trace("belge", `"${doc.name}" özetlendi: ${parts.length} bölüm, ${digest.length} karakter, ${since(started)}`);
  return digest.slice(0, DIGEST_CHARS + 200);
}

/** A file small enough to go in whole. */
export function fitsWhole(doc: FileDoc, budget: number): boolean {
  return wholeText(doc).length <= budget;
}

// --- the block -----------------------------------------------------------------------------------

/**
 * What a turn tells Iris about the chat's files, within `budget` characters. `attachedId`: the
 * file that came with this message. `digests`: whole-file summaries, when the question is about
 * the whole of a file.
 */
export function fileBlock({
  docs,
  attachedId,
  question,
  budget,
  digests,
  language,
}: {
  docs: FileDoc[];
  attachedId: string | null;
  question: string;
  budget: number;
  digests: Map<string, string>;
  language: "tr" | "en";
}): string {
  if (!docs.length) return "";
  const describe = (doc: FileDoc) => `"${doc.name}" (${kindLabel(doc.kind, language)}, ${countLabel(doc, language)})`;
  const attached = docs.find((doc) => doc.id === attachedId);
  const others = docs.filter((doc) => doc.id !== attachedId);
  const lines: string[] = [];
  if (attached) lines.push(`${ATTACHED} ${describe(attached)}.`);
  if (others.length) lines.push(`${attached ? "Sohbette daha önce eklenen" : "Bu sohbette kullanıcının"} belge${others.length > 1 ? "leri" : "si"}: ${others.map(describe).join("; ")}.`);
  lines.push(
    "Belgeyle çalışırken: yanıtını aşağıdaki belge metnine dayandır; bilgiyi aldığın yeri köşeli parantezle göster ([s. 4] gibi); belgede olmayanı belgede varmış gibi yazma, bulamazsan bunu açıkça söyle ve istersen genel bilgini ayrıca belirt. Belge başka dilde olsa da kullanıcının dilinde yanıt ver. Özet istenirse düzenli başlıklarla ver; hesap gerekiyorsa uygulamanın hesap sonuçlarını kullan."
  );
  if (docs.some((doc) => doc.scanned > 0)) lines.push("Bazı sayfalar taranmış görüntüden okundu; küçük okuma hataları olabilir.");
  const header = lines.join("\n");
  let room = budget - header.length - FILE_OPEN.length - FILE_CLOSE.length - 80;
  const sections: string[] = [];

  // Short files go in whole.
  const small = docs.filter((doc) => fitsWhole(doc, Math.min(room, 4200) / Math.max(1, docs.length)));
  for (const doc of small) {
    const text = wholeText(doc);
    sections.push(`${docs.length > 1 ? `BELGENİN TAMAMI — ${doc.name}` : "BELGENİN TAMAMI"}:\n${text}`);
    room -= text.length + 40;
  }
  const rest = docs.filter((doc) => !small.includes(doc));
  if (rest.length && room > 300) {
    const summaries = rest.map((doc) => ({ doc, digest: digests.get(doc.id) })).filter((entry) => entry.digest);
    const digestRoom = summaries.length ? Math.floor(Math.min(room * 0.6, 3800) / summaries.length) : 0;
    for (const { doc, digest } of summaries) {
      const text = digest!.slice(0, digestRoom);
      sections.push(`${rest.length > 1 ? `BELGENİN ÖZETİ — ${doc.name}` : "BELGENİN ÖZETİ"} (belgenin tamamı bölüm bölüm okunarak çıkarıldı):\n${text}`);
      room -= text.length + 60;
    }
    const found = relevantPassages(rest, question, room - 60);
    if (found) sections.push(`BELGEDEN SORUYLA İLGİLİ BÖLÜMLER:\n${found}`);
    else if (!summaries.length) sections.push("(Belgede bu soruyla ilgili bir bölüm bulunamadı.)");
  }
  return `${FILE_OPEN}\n${header}\n${sections.join("\n\n")}\n${FILE_CLOSE}`;
}
