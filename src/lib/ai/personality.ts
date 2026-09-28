// Chem+ app: the voice personality of Iris, the app's AI - how an answer is *said*, not only
// which words.
//
//   written answer ─▶ shapeForSpeech: a script a person would say (lists become "önce… sonra…",
//                     tables and code are pointed at on screen, the length fits the ear)
//                  ─▶ prosody: the character's pace, and the pauses a person would take
//                  ─▶ SpokenSegment[] for speakScript() (voice.ts)
//
// Pace and pitch stay the same through an answer: changing them sentence by sentence made the
// voice sound as if it slipped. Delivery lives in the words (the AI is asked to talk, not write)
// and in the silences: a result is left a moment to land, a warning is set apart, paragraphs get
// a breath, a long answer breathes every forty-odd words - a little unevenly, as people do.
//
// The small things a person says around an answer live here too: "Hemen hesaplıyorum." while the
// engine works, a greeting, a goodbye, the replies to "tekrar et" and "daha yavaş".

import { speakable, type SpeechLanguage } from "./speech-text";

export type Persona = "warm" | "lively" | "calm";
export type Mood = "calm" | "warm" | "bright" | "serious" | "curious" | "focus";

export interface SpokenSegment {
  /** What the engine says (formulas and units in words). */
  text: string;
  /** What the captions show: the sentence as written. */
  display: string;
  rate: number;
  pitch: number;
  /** Silence after this sentence, in ms. */
  pauseMs: number;
  mood: Mood;
}

export const PERSONAS: Record<Persona, { rate: number; pause: number; tr: string; en: string; hintTr: string; hintEn: string }> = {
  warm: { rate: 1, pause: 1, tr: "Sıcak", en: "Warm", hintTr: "Samimi, dengeli anlatım", hintEn: "Friendly and even" },
  lively: { rate: 1.07, pause: 0.8, tr: "Enerjik", en: "Lively", hintTr: "Canlı ve tempolu", hintEn: "Upbeat and quick" },
  calm: { rate: 0.93, pause: 1.3, tr: "Sakin", en: "Calm", hintTr: "Yavaş, net, bol duraklamalı", hintEn: "Slow and clear, more pauses" },
};

// --- a script for the ear ---------------------------------------------------------------------------

export interface ScriptLine {
  text: string;
  /** Starts a new paragraph: a longer breath before it. */
  paragraph: boolean;
  /** Said after the answer ("Gerisini ekrana yazdım."), not a part of it. */
  after?: boolean;
}

export interface Shaped {
  lines: ScriptLine[];
  /** Something was left for the screen (the rest of a long answer, a table, code). */
  truncated: boolean;
}

// Words ending in a full stop that do not end a sentence.
const ABBREVIATION = /(?:^|\s)(?:vb|vs|örn|yak|bkz|dr|prof|doç|no|sn|dk|sa|ca|approx|fig|eq|e\.g|i\.e|etc|mr|mrs|ms)\.$/i;

const ORDERED: Record<SpeechLanguage, string[]> = {
  tr: ["Önce", "Sonra", "Ardından", "Sonra", "Ardından", "Sonra"],
  en: ["First", "Then", "Next", "After that", "Then", "Next"],
};
const UNORDERED: Record<SpeechLanguage, string[]> = {
  tr: ["Birincisi", "İkincisi", "Üçüncüsü", "Dördüncüsü", "Beşincisi"],
  en: ["First", "Second", "Third", "Fourth", "Fifth"],
};

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function lowerFirst(text: string, language: SpeechLanguage): string {
  // Only an ordinary capitalised word ("Beher", "Çözeltiyi"), never a formula, a symbol like Ka,
  // or an acronym.
  if (!/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}(?=[\s,.;:!?]|$)/.test(text)) return text;
  return text.charAt(0).toLocaleLowerCase(language === "tr" ? "tr" : "en") + text.slice(1);
}

function cleanInline(text: string, language: SpeechLanguage): string {
  return text
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)[*_](\S(?:[^*_]*\S)?)[*_](?=\s|[.,;:!?]|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, language === "tr" ? "bağlantı ekranda" : "the link on screen")
    .replace(/\\[()[\]]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sentences of a paragraph: ends at . ! ? … followed by a space, not at "vb." or "2.5". */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const pattern = /[.!?…]+["'”’)]*(?=\s|$)/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const end = match.index + match[0].length;
    const candidate = text.slice(start, end).trim();
    if (!candidate || ABBREVIATION.test(candidate)) continue;
    out.push(candidate);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  // A very long sentence breathes at its semicolons.
  return out.flatMap((sentence) => (wordCount(sentence) > 28 ? sentence.split(/;\s+/).map((part, i, all) => (i < all.length - 1 ? `${part},` : part)) : [sentence]));
}

/** A list read the way a person would: short items in one breath, longer ones one by one. */
function listLines(items: string[], ordered: boolean, language: SpeechLanguage): string[] {
  const tr = language === "tr";
  const clean = items.map((item) => cleanInline(item, language).replace(/[.;:]+$/, "")).filter(Boolean);
  if (clean.length === 0) return [];
  if (clean.length === 1) return [`${clean[0]}.`];
  const short = !ordered && clean.every((item) => wordCount(item) <= 4 && !/[.!?]/.test(item));
  const shown = clean.slice(0, 5);
  const more = clean.length > shown.length;
  if (short) {
    const parts = shown.map((item, index) => (index === 0 ? item : lowerFirst(item, language)));
    if (more) return [`${parts.join(", ")}${tr ? " ve diğerleri." : " and more."}`];
    const last = parts.pop();
    return [`${parts.join(", ")} ${tr ? "ve" : "and"} ${last}.`];
  }
  const words = ordered ? ORDERED[language] : UNORDERED[language];
  const lines = shown.map((item, index) => {
    const last = index === shown.length - 1 && !more && shown.length > 2;
    const lead = last ? (tr ? "Son olarak" : "Finally") : words[index];
    const sentence = `${lead}, ${lowerFirst(item, language)}`;
    return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  });
  if (more) lines.push(tr ? "Diğer maddeler ekranda." : "The other points are on screen.");
  return lines;
}

/**
 * The spoken script of a written answer. `maxWords` keeps a voice reply to what the ear can take;
 * whatever is left is said to be on screen.
 */
export function shapeForSpeech(markdown: string, language: SpeechLanguage, maxWords = Infinity): Shaped {
  const tr = language === "tr";
  const notes = new Set<string>();
  const blocks: ScriptLine[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph = false;

  const flushList = () => {
    if (!list) return;
    listLines(list.items, list.ordered, language).forEach((text, index) => blocks.push({ text, paragraph: index === 0 && paragraph }));
    paragraph = false;
    list = null;
  };

  const source = markdown.replace(/\r/g, "").replace(/```[\s\S]*?```/g, () => {
    notes.add(tr ? "Kodu ekrana yazdım." : "The code is on screen.");
    return "\n\n";
  });
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushList();
      paragraph = blocks.length > 0;
      continue;
    }
    if ((line.match(/\|/g) ?? []).length >= 2 || /^\|?\s*:?-{2,}/.test(line)) {
      flushList();
      notes.add(tr ? "Tabloyu ekrana koydum." : "The table is on screen.");
      continue;
    }
    // Headings and label-only lines ("**Sonuç**", "Hesaplama:") are for the eye.
    if (/^#{1,6}\s/.test(line) || /^(\*\*|__)[^*_]{1,48}(\*\*|__):?$/.test(line) || /^[\p{L} ]{1,32}:$/u.test(line)) {
      flushList();
      paragraph = blocks.length > 0;
      continue;
    }
    const bullet = line.match(/^(?:[-*•]\s+|(\d+)[.)]\s+)(.+)$/);
    if (bullet) {
      const ordered = bullet[1] !== undefined;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(bullet[2]);
      continue;
    }
    flushList();
    const text = cleanInline(line.replace(/^(\*\*|__)([^*_]{1,40})(\*\*|__):\s*/, "$2: "), language);
    if (text) {
      splitSentences(text).forEach((sentence, index) => blocks.push({ text: sentence, paragraph: index === 0 && paragraph }));
      paragraph = false;
    }
  }
  flushList();

  const lines: ScriptLine[] = [];
  let words = 0;
  let truncated = false;
  for (const block of blocks) {
    const count = wordCount(block.text);
    if (lines.length > 0 && words + count > maxWords) {
      truncated = true;
      break;
    }
    lines.push(block);
    words += count;
  }
  if (truncated) lines.push({ text: tr ? "Gerisini ekrana yazdım." : "The rest is on screen.", paragraph: false, after: true });
  for (const note of notes) lines.push({ text: note, paragraph: false, after: true });
  return { lines, truncated: truncated || notes.size > 0 };
}

// --- delivery ---------------------------------------------------------------------------------------

const SERIOUS =
  /(dikkat|tehlik|zehir|toksik|yanıcı|aşındırıcı|korozif|patla|uyarı|asla |sakın|eldiven|koruyucu gözlük|çeker ocak|havalandır|ilk yardım|yanık|\bSDS\b|warning|danger|hazard|toxic|flammable|corrosive|never |careful|caution|fume hood|goggles|gloves)/i;
const BRIGHT = /(harika|tebrik|mükemmel|süper|çok iyi|başardın|tam olarak|aynen öyle|great|perfect|nice|well done|exactly|awesome)/i;
const WARM =
  /^(merhaba|selam|günaydın|iyi akşamlar|iyi günler|iyi geceler|hoş geldin|rica ederim|ne demek|teşekkür|görüşürüz|görüşmek üzere|kolay gelsin|hi\b|hello|hey\b|good (morning|evening|afternoon)|welcome|you're welcome|thanks|bye|talk soon)/i;

/**
 * The silence a sentence's mood asks for after it, beyond the voice's own sentence break: a result
 * is left a moment to land, a warning is set apart. Everything else flows on in the voice's own
 * rhythm (speakScript says such sentences in one breath).
 */
const PAUSE_AFTER: Record<Mood, number> = { calm: 0, warm: 0, bright: 0, curious: 0, focus: 220, serious: 260 };

function moodOf(sentence: string): Mood {
  if (SERIOUS.test(sentence)) return "serious";
  if (/\?\s*["'”’)]*$/.test(sentence)) return "curious";
  if (WARM.test(sentence)) return "warm";
  if (BRIGHT.test(sentence)) return "bright";
  if (/\d/.test(sentence)) return "focus";
  return "calm";
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface DeliveryOptions {
  persona: Persona;
  /** The user's pace (voice settings). */
  rate: number;
  /** Test hook: a fixed source of variation. */
  random?: () => number;
}

/**
 * Delivery for each line of a script: one pace and one pitch for the whole answer - a voice that
 * changes speed or pitch from sentence to sentence sounds like it is slipping - and pauses where a
 * person would take them: after a result, around a warning, between paragraphs, a breath in a long
 * answer. The pauses are a little uneven, as people's are.
 */
export function prosody(lines: ScriptLine[], language: SpeechLanguage, options: DeliveryOptions): SpokenSegment[] {
  const persona = PERSONAS[options.persona] ?? PERSONAS.warm;
  const random = options.random ?? Math.random;
  const rate = Math.round(clamp(options.rate * persona.rate, 0.6, 1.6) * 100) / 100;
  const out: SpokenSegment[] = [];
  let sinceBreath = 0;
  for (const line of lines) {
    const text = speakable(line.text, language);
    if (!text || !/[\p{L}\d]/u.test(text)) continue;
    const mood = moodOf(line.text);
    const previous = out[out.length - 1];
    if (previous) {
      if (line.paragraph) previous.pauseMs += 300;
      if (mood === "serious") previous.pauseMs += 150;
    }
    sinceBreath += wordCount(text);
    let pause = PAUSE_AFTER[mood];
    if (sinceBreath > 38) {
      pause += 160;
      sinceBreath = 0;
    }
    out.push({ text, display: line.text, rate, pitch: 1, pauseMs: pause, mood });
  }
  for (const segment of out) {
    if (segment.pauseMs > 0) segment.pauseMs = Math.round(segment.pauseMs * persona.pause * (0.9 + random() * 0.2));
  }
  if (out.length) out[out.length - 1].pauseMs = 0;
  return out;
}

/** A written answer, ready to be spoken: shaped for the ear, then given its delivery. */
export function voiceScript(text: string, language: SpeechLanguage, options: DeliveryOptions & { maxWords?: number }): SpokenSegment[] {
  return prosody(shapeForSpeech(text, language, options.maxWords ?? Infinity).lines, language, options);
}

/**
 * The part of an answer still being written that can already be said: every line but the last
 * (which may still be growing - a sentence, a list), without the closing lines only the whole
 * answer gets. More text never changes these lines, so an answer can be spoken as it streams in
 * and its script picked up where speech has got to.
 */
export function voiceScriptSoFar(text: string, language: SpeechLanguage, options: DeliveryOptions & { maxWords?: number }): SpokenSegment[] {
  // A list at the end may still grow, and its items are read together: it waits until it closes.
  const rows = text.split("\n");
  let end = rows.length;
  if (end > 0 && !rows[end - 1].trim()) end -= 1;
  let start = end;
  while (start > 0 && /^\s*(?:[-*•]\s+|\d+[.)]\s+)/.test(rows[start - 1])) start -= 1;
  const listOpen = start < end;
  const source = listOpen ? rows.slice(0, start).join("\n") : text;
  const lines = shapeForSpeech(source, language, options.maxWords ?? Infinity).lines.filter((line) => !line.after);
  return prosody(listOpen ? lines : lines.slice(0, -1), language, options);
}

// --- the small talk around an answer ------------------------------------------------------------

function pick(options: string[], avoid?: string): string {
  const pool = options.length > 1 ? options.filter((option) => option !== avoid) : options;
  return pool[Math.floor(Math.random() * pool.length)] ?? options[0];
}

export type AckKind = "compute" | "think" | "action";

const ACKS: Record<AckKind, Record<SpeechLanguage, string[]>> = {
  compute: {
    tr: ["Hemen hesaplıyorum.", "Tamam, hesaplayayım.", "Bir saniye, hesaplıyorum.", "Peki, hemen bakıyorum.", "Anladım, hesaplıyorum."],
    en: ["Let me work that out.", "One moment, calculating.", "Sure, calculating now.", "On it, one second."],
  },
  think: {
    tr: ["Bir saniye.", "Şöyle bir bakayım.", "Bir düşüneyim.", "Anladım, bakıyorum."],
    en: ["One moment.", "Let me think.", "Let me see.", "Okay, let me look."],
  },
  // Something to do in the app (a timer, a note, a report…).
  action: {
    tr: ["Hemen hallediyorum.", "Tamam, hemen yapıyorum.", "Peki, ayarlıyorum.", "Hemen hazırlıyorum."],
    en: ["On it.", "Sure, doing it now.", "Okay, setting that up.", "Right away."],
  },
};

/** Everything a person might say while they work something out. */
export function acknowledgementLines(kind: AckKind, language: SpeechLanguage): string[] {
  return ACKS[kind][language];
}

/** What a person says while they work something out; never the same twice in a row. */
export function acknowledgement(kind: AckKind, language: SpeechLanguage, avoid?: string): string {
  return pick(ACKS[kind][language], avoid);
}

/** The ways a voice conversation can open at this time of day. */
export function greetingLines(language: SpeechLanguage, hour: number): string[] {
  if (language === "en") {
    if (hour >= 5 && hour < 12) return ["Good morning! I'm Iris. What are we working on today?", "Morning! What shall we work out today?"];
    if (hour >= 18 || hour < 5) return ["Good evening! I'm Iris. How can I help?", "Hi there! What are we working on tonight?"];
    return ["Hi! I'm Iris. What shall we calculate?", "Hello! What are we working on?"];
  }
  if (hour >= 5 && hour < 12) return ["Günaydın! Ben İris. Bugün ne üzerinde çalışıyoruz?", "Günaydın! Ne hesaplayalım?"];
  if (hour >= 18 && hour < 24) return ["İyi akşamlar! Ben İris. Nasıl yardımcı olabilirim?", "İyi akşamlar! Bugün ne üzerinde çalışıyoruz?"];
  if (hour < 5) return ["Geç saate kadar çalışıyoruz! Ne üzerinde uğraşıyorsun?"];
  return ["Merhaba! Ben İris. Ne hesaplayalım?", "Merhaba! Seni dinliyorum, ne üzerinde çalışıyoruz?"];
}

/** The first words of a voice conversation, by the time of day. */
export function greeting(language: SpeechLanguage, hour: number): string {
  return pick(greetingLines(language, hour));
}

/** What Iris says when voice mode opens again: short, so the user hears it is listening. */
export function cueLines(language: SpeechLanguage): string[] {
  return language === "tr" ? ["Dinliyorum.", "Buradayım, seni dinliyorum.", "Evet, dinliyorum."] : ["I'm listening.", "I'm here, go ahead.", "Yes, I'm listening."];
}

export function cue(language: SpeechLanguage): string {
  return pick(cueLines(language));
}

export function farewellLines(language: SpeechLanguage): string[] {
  return language === "tr"
    ? ["Görüşürüz! Deneylerinde başarılar.", "Tamamdır, görüşmek üzere!", "Kolay gelsin, görüşürüz!"]
    : ["Talk soon! Good luck in the lab.", "Bye for now!", "See you, and good luck with the experiment!"];
}

export function farewell(language: SpeechLanguage): string {
  return pick(farewellLines(language));
}

export type CommandReply = "repeat" | "nothing" | "slower" | "faster" | "slowest" | "fastest";

export function commandReply(kind: CommandReply, language: SpeechLanguage): string {
  const tr = language === "tr";
  switch (kind) {
    case "repeat":
      return tr ? pick(["Tabii.", "Tabii, tekrar ediyorum.", "Elbette."]) : pick(["Sure.", "Of course.", "Sure, once more."]);
    case "nothing":
      return tr ? "Henüz bir şey söylemedim. Seni dinliyorum." : "I haven't said anything yet. I'm listening.";
    case "slower":
      return tr ? "Tamam, daha yavaş konuşuyorum." : "Okay, I'll slow down.";
    case "faster":
      return tr ? "Tamam, biraz hızlanıyorum." : "Okay, I'll speed up a little.";
    case "slowest":
      return tr ? "Bu benim en yavaş hızım." : "That's as slow as I go.";
    case "fastest":
      return tr ? "Bu benim en hızlı hızım." : "That's as fast as I go.";
  }
}

/** Said when the AI cannot be reached; the engine's results, if any, are already on screen. */
export function failureLine(language: SpeechLanguage, hadResults: boolean): string {
  if (language === "tr") {
    return hadResults
      ? "Açıklamaya şu an ulaşamadım ama sonuçlar ekranda. İstersen başka bir şey sor."
      : "Şu an yanıt veremiyorum; bağlantıda bir sorun var gibi. Birazdan tekrar deneyelim.";
  }
  return hadResults
    ? "I couldn't get the explanation just now, but the results are on screen. Ask me something else if you like."
    : "I can't answer right now; the connection seems to be down. Let's try again in a moment.";
}
