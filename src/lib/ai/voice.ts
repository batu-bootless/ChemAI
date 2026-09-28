"use client";

// Chem+ app: speech in and out for Iris, the app's AI.
//
// Listening is Android's own speech recognizer (Voice.java; the Web Speech API in a browser).
// Speaking has two voices:
//   · the natural voice (default): Google's Gemini speech model, voiced by the website and played
//     on the phone (naturalVoice.ts) - the most human voice available;
//   · the phone's voice: Android's text-to-speech in its most natural voice (Google's neural
//     network voices when online), which also stands in whenever the natural voice cannot be had.
// Either way the rest of the app sees one small interface: listen() with partial/final text and a
// loudness level, and speakScript() that says a script (personality.ts), reports which sentence is
// being said and how loud the voice is (for the goggles in voice mode), and resolves when done.

import type { PluginListenerHandle } from "@capacitor/core";
import { ChemPlus, isNativeApp } from "@/mobile/native";
import { voiceScript, type Persona, type SpokenSegment } from "./personality";
import { trace } from "./trace";
import {
  DEFAULT_NATURAL_VOICE,
  NATURAL_VOICES,
  NaturalVoiceError,
  cachedClip,
  holdBackground,
  naturalPieces,
  naturalVoicePauseReason,
  naturalVoiceReady,
  pauseNaturalVoice,
  playClip,
  prefetchPieces,
  shapeOf,
  stopClip,
  styleFor,
  voicePiece,
  type VoiceShape,
} from "./naturalVoice";

export { speakable } from "./speech-text";

export type VoiceLanguage = "tr" | "en";

// --- preferences ----------------------------------------------------------------------------------

export type VoiceEngine = "natural" | "device";

export interface VoicePrefs {
  /** "natural": Gemini's voice through the website; "device": the phone's own text-to-speech. */
  engine: VoiceEngine;
  /** The natural voice's name (naturalVoice.ts). */
  naturalVoice: string;
  /** The phone voice's name from listVoices(); empty means "the most natural one". */
  voice: string;
  /** 0.8 (slow) … 1.25 (quick). */
  rate: number;
  /** How long a pause means the question is finished, in ms. */
  patienceMs: number;
  /** The voice's character: tone, pace and pauses (personality.ts). */
  persona: Persona;
  /** With headphones on, talking over an answer interrupts it. */
  bargeIn: boolean;
  /** Live captions on the voice screen. */
  captions: boolean;
}

const PREFS_KEY = "chemplus:ai-voice";
export const DEFAULT_PREFS: VoicePrefs = {
  engine: "natural",
  naturalVoice: DEFAULT_NATURAL_VOICE,
  voice: "",
  rate: 1,
  patienceMs: 2200,
  persona: "warm",
  bargeIn: true,
  captions: true,
};

export function readVoicePrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      engine: parsed.engine === "device" ? "device" : "natural",
      // Voices of older versions: the woman's voice stays a woman's, anything else becomes the default.
      naturalVoice: NATURAL_VOICES.some((voice) => voice.id === parsed.naturalVoice)
        ? (parsed.naturalVoice as string)
        : parsed.naturalVoice === "emel"
          ? "elif"
          : DEFAULT_NATURAL_VOICE,
      voice: typeof parsed.voice === "string" ? parsed.voice : "",
      rate: typeof parsed.rate === "number" ? Math.min(1.3, Math.max(0.75, parsed.rate)) : 1,
      patienceMs: typeof parsed.patienceMs === "number" ? Math.min(5000, Math.max(1000, parsed.patienceMs)) : DEFAULT_PREFS.patienceMs,
      persona: parsed.persona === "lively" || parsed.persona === "calm" ? parsed.persona : "warm",
      bargeIn: parsed.bargeIn !== false,
      captions: parsed.captions !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable: the choice lasts until the app closes
  }
}

// --- voices ---------------------------------------------------------------------------------------

export interface VoiceOption {
  id: string;
  label: string;
  detail: string;
  natural: boolean;
}

const LOCALES: Record<VoiceLanguage, string> = { tr: "tr-TR", en: "en-US" };

function webVoices(language: VoiceLanguage): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const score = (voice: SpeechSynthesisVoice) =>
    (/natural|neural|online|google|wavenet/i.test(voice.name) ? 100 : 0) + (voice.lang.toLowerCase() === LOCALES[language].toLowerCase() ? 10 : 0);
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(language))
    .sort((a, b) => score(b) - score(a));
}

/** The voices a user can pick from, most natural first. */
export async function listVoices(language: VoiceLanguage): Promise<VoiceOption[]> {
  const tr = language === "tr";
  if (isNativeApp()) {
    const result = await ChemPlus.listVoices({ language: LOCALES[language] });
    return result.voices.map((voice, index) => {
      const natural = voice.network || voice.quality >= 400;
      return {
        id: voice.name,
        label: `${tr ? "Ses" : "Voice"} ${index + 1}${index === 0 ? (tr ? " · önerilen" : " · recommended") : ""}`,
        detail: [
          natural ? (tr ? "doğal (sinirsel)" : "natural (neural)") : tr ? "standart" : "standard",
          voice.network ? (tr ? "internetle" : "online") : tr ? "çevrimdışı" : "offline",
          voice.locale,
        ].join(" · "),
        natural,
      };
    });
  }
  return webVoices(language).map((voice, index) => ({
    id: voice.name,
    label: voice.name,
    detail: `${voice.lang}${index === 0 ? (tr ? " · önerilen" : " · recommended") : ""}`,
    natural: /natural|neural|online|google|wavenet/i.test(voice.name),
  }));
}

// --- listening ------------------------------------------------------------------------------------

export interface ListenHandlers {
  onReady?: () => void;
  /** The recognizer heard the start of speech. */
  onBegin?: () => void;
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  /** 0…1 loudness, for the animation and for noticing that the user is still talking. */
  onLevel?: (level: number) => void;
  onError?: (code: string) => void;
}

export interface Listening {
  /** Stop and deliver what was heard. */
  finish: () => void;
  /** Stop and throw it away. */
  cancel: () => void;
}

interface WebRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function webRecognition(): (new () => WebRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => WebRecognition; webkitSpeechRecognition?: new () => WebRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export async function canListen(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      return (await ChemPlus.speechAvailable()).recognition;
    } catch {
      return false;
    }
  }
  return webRecognition() !== null;
}

export async function listen(language: VoiceLanguage, handlers: ListenHandlers, silenceMs = readVoicePrefs().patienceMs): Promise<Listening> {
  if (isNativeApp()) {
    const subscriptions: PluginListenerHandle[] = [];
    let done = false;
    const cleanup = () => {
      done = true;
      for (const subscription of subscriptions) void subscription.remove();
    };
    subscriptions.push(
      await ChemPlus.addListener("speechReady", () => handlers.onReady?.()),
      await ChemPlus.addListener("speechBegin", () => handlers.onBegin?.()),
      await ChemPlus.addListener("speechPartial", (data) => handlers.onPartial?.(data.text ?? "")),
      await ChemPlus.addListener("speechLevel", (data) => handlers.onLevel?.(data.level ?? 0)),
      await ChemPlus.addListener("speechFinal", (data) => {
        if (done) return;
        cleanup();
        handlers.onFinal(data.text ?? "");
      }),
      await ChemPlus.addListener("speechError", (data) => {
        if (done) return;
        cleanup();
        handlers.onError?.(data.code ?? "ERROR");
      })
    );
    try {
      await ChemPlus.startListening({ language: LOCALES[language], silenceMs });
    } catch (error) {
      cleanup();
      handlers.onError?.((error as { code?: string }).code ?? "ERROR");
    }
    return {
      finish: () => void ChemPlus.stopListening({ cancel: false }),
      cancel: () => {
        cleanup();
        void ChemPlus.stopListening({ cancel: true });
      },
    };
  }

  const Recognition = webRecognition();
  if (!Recognition) {
    handlers.onError?.("UNAVAILABLE");
    return { finish: () => {}, cancel: () => {} };
  }
  const recognition = new Recognition();
  recognition.lang = LOCALES[language];
  recognition.interimResults = true;
  // Continuous in the browser: the voice mode decides when the question is over.
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  let finalText = "";
  let delivered = false;
  let cancelled = false;
  recognition.onstart = () => handlers.onReady?.();
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    handlers.onPartial?.((finalText + interim).trim());
    handlers.onLevel?.(0.6);
  };
  recognition.onerror = (event) => {
    if (delivered || cancelled) return;
    delivered = true;
    handlers.onError?.(event.error === "no-speech" ? "NO_MATCH" : event.error === "not-allowed" ? "PERMISSION" : event.error.toUpperCase());
  };
  recognition.onend = () => {
    if (delivered || cancelled) return;
    delivered = true;
    if (finalText.trim()) handlers.onFinal(finalText.trim());
    else handlers.onError?.("NO_MATCH");
  };
  try {
    recognition.start();
  } catch {
    handlers.onError?.("BUSY");
  }
  return {
    finish: () => recognition.stop(),
    cancel: () => {
      cancelled = true;
      recognition.abort();
    },
  };
}

// --- speaking -------------------------------------------------------------------------------------

export interface SpeakHandlers {
  onStart?: () => void;
  /** A sentence starts (its index in the script). */
  onSegment?: (index: number) => void;
  /** How far into sentence `index` the voice is, 0…1 (the engine's word positions, or an estimate). */
  onProgress?: (index: number, fraction: number) => void;
  /** Loudness of the voice, 0…1, a few dozen times a second, and its shape (for Iris's mouth). */
  onLevel?: (level: number, shape?: VoiceShape) => void;
  /** With headphones on, the user started talking over the answer. */
  onBargeIn?: () => void;
  /** The natural voice could not be had; the phone's voice is speaking instead (why). */
  onFallback?: (reason: string) => void;
}

export interface SpeakOptions {
  /** Preferences to speak with (settings previews); the saved ones otherwise. */
  prefs?: VoicePrefs;
  bargeIn?: boolean;
  /** Natural voice: say it only if it is already on the phone, else fetch it for next time. */
  cachedOnly?: boolean;
  /**
   * Natural voice: how long the first piece may take before the phone's voice says it instead
   * (the conversation must not go quiet). Later pieces get longer; they are asked for early.
   */
  firstPieceTimeoutMs?: number;
}

/**
 * Sentences said in one breath. Each block is one utterance for the engine, so a paragraph flows
 * in the voice's own sentence rhythm and a network voice is asked for it once rather than per
 * sentence (a per-sentence request is where a voice can slip to its offline twin mid-answer).
 * Only a deliberate pause - after a result, around a warning, between paragraphs - starts a block.
 */
export interface SpeechBlock {
  text: string;
  rate: number;
  pitch: number;
  pauseMs: number;
  /** The script's sentences inside `text`: index and character range. */
  parts: { index: number; start: number; end: number }[];
}

const BLOCK_GAP_MS = 150;
const BLOCK_MAX_CHARS = 1400;

export function speechBlocks(script: SpokenSegment[]): SpeechBlock[] {
  const blocks: SpeechBlock[] = [];
  let current: SpeechBlock | null = null;
  for (let index = 0; index < script.length; index++) {
    const segment = script[index];
    const text = segment.text.trim();
    if (!text) continue;
    if (current && (current.text.length + text.length + 1 > BLOCK_MAX_CHARS || current.rate !== segment.rate || current.pitch !== segment.pitch)) {
      blocks.push(current);
      current = null;
    }
    if (!current) current = { text: "", rate: segment.rate, pitch: segment.pitch, pauseMs: 0, parts: [] };
    const start = current.text ? current.text.length + 1 : 0;
    current.text = current.text ? `${current.text} ${text}` : text;
    current.parts.push({ index, start, end: current.text.length });
    current.pauseMs = segment.pauseMs;
    if (segment.pauseMs >= BLOCK_GAP_MS) {
      blocks.push(current);
      current = null;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/** The voice's speed in characters a second at pace 1, learned while it speaks. */
let charsPerSecond = 14;

/**
 * Keeps captions with the voice. The engine's word positions are used when it reports them;
 * otherwise the position is estimated from the voice's speed, which every finished block measures,
 * so the estimate settles on the real speed after the first sentence or two.
 */
function captionTrack(blocks: SpeechBlock[], handlers: SpeakHandlers, learnSpeed = true) {
  let timer: number | null = null;
  let block = -1;
  let began = 0;
  let reported = false;
  let sentence = -1;
  const stopTimer = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const show = (b: number, offset: number) => {
    const parts = blocks[b]?.parts;
    if (!parts?.length) return;
    const part = parts.find((candidate) => offset < candidate.end) ?? parts[parts.length - 1];
    if (part.index !== sentence) {
      sentence = part.index;
      handlers.onSegment?.(part.index);
    }
    handlers.onProgress?.(part.index, Math.min(1, Math.max(0, (offset - part.start) / Math.max(1, part.end - part.start))));
  };
  const learn = (b: number, spokenMs: number) => {
    const current = blocks[b];
    if (!learnSpeed || !current || spokenMs < 800) return;
    const measured = current.text.length / (spokenMs / 1000) / current.rate;
    if (measured > 6 && measured < 32) charsPerSecond = charsPerSecond * 0.5 + measured * 0.5;
  };
  return {
    start(b: number) {
      const now = performance.now();
      // The block before ended one pause ago: how long it took is the voice's real speed.
      if (block >= 0 && block !== b) learn(block, now - began - (blocks[block]?.pauseMs ?? 0));
      stopTimer();
      block = b;
      began = now;
      reported = false;
      show(b, 0);
      timer = window.setInterval(() => {
        if (reported) return;
        const current = blocks[b];
        if (!current) return;
        show(b, Math.min(current.text.length - 1, ((performance.now() - began) / 1000) * charsPerSecond * current.rate));
      }, 100);
    },
    word(b: number, end: number) {
      if (b !== block) return;
      reported = true;
      show(b, end);
    },
    /** The block's sound ended (web): exact timing to learn from. */
    end(b: number) {
      if (b !== block) return;
      learn(b, performance.now() - began);
      stopTimer();
      show(b, blocks[b].text.length);
      block = -1;
    },
    finish(completed: boolean) {
      if (completed && block >= 0) learn(block, performance.now() - began);
      stopTimer();
    },
  };
}

let webSpeaking: { resolve: () => void } | null = null;
let speakCounter = 0;

let naturalRound = 0;

/**
 * Speaks a script (personality.ts) in the chosen voice; resolves when it has been said, or was cut
 * short. The natural voice falls back to the phone's when it cannot be had, mid-answer included.
 */
export async function speakScript(
  segments: SpokenSegment[],
  language: VoiceLanguage,
  handlers: SpeakHandlers = {},
  options: SpeakOptions = {}
): Promise<{ interrupted: boolean }> {
  const prefs = options.prefs ?? readVoicePrefs();
  // Background voicing keeps out of the way while the conversation speaks.
  holdBackground(true);
  try {
    if (prefs.engine === "natural" && naturalVoiceReady()) {
      const result = await speakNatural(segments, language, handlers, options, prefs);
      if (result) return result;
      trace("ses", `telefonun sesine geçildi: ${naturalVoicePauseReason() || "doğal ses gelmedi"}`);
      handlers.onFallback?.(naturalVoicePauseReason());
    }
    return await speakDevice(segments, language, handlers, { ...options, prefs });
  } finally {
    holdBackground(false);
  }
}

/** The natural voice; null when not a word of it could be had (the phone's voice takes over). */
async function speakNatural(
  segments: SpokenSegment[],
  language: VoiceLanguage,
  handlers: SpeakHandlers,
  options: SpeakOptions,
  prefs: VoicePrefs
): Promise<{ interrupted: boolean } | null> {
  const pieces = naturalPieces(segments);
  if (pieces.length === 0) return { interrupted: false };
  const voice = prefs.naturalVoice || DEFAULT_NATURAL_VOICE;
  const style = styleFor(prefs.persona, language);
  if (options.cachedOnly) {
    const clips = await Promise.all(pieces.map((piece) => cachedClip(piece.text, voice, style)));
    if (clips.some((clip) => !clip)) {
      // Not on the phone yet: stay quiet rather than answer late, and have it ready next time.
      void prefetchPieces(pieces.map((piece) => piece.text), voice, style, language);
      return { interrupted: false };
    }
  }
  const round = ++naturalRound;
  const jobs: Promise<string>[] = [];
  const voiced = (index: number) => {
    if (!jobs[index]) {
      jobs[index] = voicePiece(pieces[index].text, voice, style, false, language);
      // Awaited in order below; a piece never reached must not report an unhandled failure.
      jobs[index].catch(() => undefined);
    }
    return jobs[index];
  };
  // One request at a time (the voice services' free tiers refuse a second one alongside): the next
  // piece is asked for as soon as the one before it is here, while it plays.
  voiced(0);
  const track = captionTrack(
    pieces.map((piece) => ({ text: piece.plain, rate: 1, pitch: 1, pauseMs: 0, parts: piece.parts })),
    handlers,
    false
  );
  // The rest of the script, from piece `index` on, in the phone's voice.
  const restOnDevice = (index: number) => {
    handlers.onFallback?.(naturalVoicePauseReason());
    const rest = new Set(pieces.slice(index).flatMap((piece) => piece.parts.map((part) => part.index)));
    return speakDevice(
      segments.map((segment, at) => (rest.has(at) ? segment : { ...segment, text: "" })),
      language,
      handlers,
      { ...options, prefs }
    );
  };
  for (let index = 0; index < pieces.length; index++) {
    let audio: string;
    try {
      audio = await withDeadline(voiced(index), index === 0 ? (options.firstPieceTimeoutMs ?? 10000) : 20000);
    } catch (error) {
      track.finish(false);
      trace("ses", `parça ${index + 1}/${pieces.length} gelmedi: ${error instanceof Error ? error.message : String(error)}`);
      // Too slow to wait for: the phone's voice for a minute, rather than a silence on every line.
      if (error instanceof NaturalVoiceError && error.status === 408) pauseNaturalVoice(error);
      if (round !== naturalRound) return { interrupted: true };
      if (index === 0) return null;
      return restOnDevice(index);
    }
    if (round !== naturalRound) {
      track.finish(false);
      return { interrupted: true };
    }
    if (index + 1 < pieces.length) voiced(index + 1);
    track.start(index);
    const piece = pieces[index];
    let result: { interrupted: boolean };
    try {
      result = await playClip(
        audio,
        {
          onStart: index === 0 ? handlers.onStart : undefined,
          onLevel: handlers.onLevel,
          onProgress: (fraction) => track.word(index, fraction * piece.plain.length),
          onBargeIn: handlers.onBargeIn,
        },
        { bargeIn: options.bargeIn, speed: prefs.rate }
      );
    } catch (error) {
      // The clip would not play on this phone: never go quiet, say it with the phone's voice.
      trace("ses", `klip çalmadı: ${error instanceof Error ? error.message : String(error)}`);
      track.finish(false);
      pauseNaturalVoice(error);
      if (round !== naturalRound) return { interrupted: true };
      return index === 0 ? null : restOnDevice(index);
    }
    if (result.interrupted || round !== naturalRound) {
      track.finish(false);
      return { interrupted: true };
    }
  }
  track.finish(true);
  return { interrupted: false };
}

/**
 * A voiced piece that is too slow in coming is said in the phone's voice this time; the request
 * goes on, so the piece is ready if it comes again.
 */
function withDeadline<T>(job: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new NaturalVoiceError("timeout", 408)), ms);
    job.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Whether a line can be said at once: always with the phone's voice, only if already voiced with the natural one. */
export async function isVoiced(text: string, language: VoiceLanguage): Promise<boolean> {
  const prefs = readVoicePrefs();
  if (prefs.engine !== "natural" || !naturalVoiceReady()) return true;
  const pieces = naturalPieces(voiceScript(text, language, { persona: prefs.persona, rate: prefs.rate }));
  const style = styleFor(prefs.persona, language);
  const clips = await Promise.all(pieces.map((piece) => cachedClip(piece.text, prefs.naturalVoice, style)));
  return clips.every(Boolean);
}

/**
 * Starts voicing what is about to be said (the next sentences of an answer still being written)
 * while something else plays, so it is ready when its turn comes: speakScript picks the piece up.
 */
export function prepareSpeech(segments: SpokenSegment[], language: VoiceLanguage): void {
  const prefs = readVoicePrefs();
  if (prefs.engine !== "natural" || !naturalVoiceReady()) return;
  const first = naturalPieces(segments)[0];
  if (!first) return;
  voicePiece(first.text, prefs.naturalVoice || DEFAULT_NATURAL_VOICE, styleFor(prefs.persona, language), false, language).catch(() => undefined);
}

/** Voices recurring lines in the background (natural voice only), so they come at once later. */
export function prefetchLines(lines: string[], language: VoiceLanguage): void {
  const prefs = readVoicePrefs();
  if (prefs.engine !== "natural" || !naturalVoiceReady()) return;
  const texts = lines.flatMap((line) => naturalPieces(voiceScript(line, language, { persona: prefs.persona, rate: prefs.rate })).map((piece) => piece.text));
  void prefetchPieces([...new Set(texts)], prefs.naturalVoice, styleFor(prefs.persona, language), language);
}

/** The phone's own text-to-speech (Voice.java), or the browser's. */
async function speakDevice(
  segments: SpokenSegment[],
  language: VoiceLanguage,
  handlers: SpeakHandlers = {},
  options: SpeakOptions = {}
): Promise<{ interrupted: boolean }> {
  const blocks = speechBlocks(segments);
  if (blocks.length === 0) return { interrupted: false };
  const voice = (options.prefs ?? readVoicePrefs()).voice;
  const track = captionTrack(blocks, handlers);
  // A speech engine that never says it is done must not freeze the conversation: past two and a
  // half times the expected length (plus a margin for a slow network voice), it counts as done.
  const expected = blocks.reduce((sum, block) => sum + (block.text.length / (12 * block.rate)) * 1000 + block.pauseMs, 0);
  const watchdogMs = expected * 2.5 + 10000;

  if (isNativeApp()) {
    const token = `s${Date.now().toString(36)}${(speakCounter++).toString(36)}`;
    const mine = (data: { token?: string }) => data.token === token;
    const subscriptions: PluginListenerHandle[] = await Promise.all([
      ChemPlus.addListener("ttsStart", (data) => {
        if (mine(data)) handlers.onStart?.();
      }),
      ChemPlus.addListener("ttsSegment", (data) => {
        if (mine(data)) track.start(data.index ?? 0);
      }),
      ChemPlus.addListener("ttsRange", (data) => {
        if (mine(data)) track.word(data.index ?? 0, data.end ?? 0);
      }),
      ChemPlus.addListener("ttsLevel", (data) => {
        if (mine(data)) handlers.onLevel?.(data.level ?? 0, shapeOf(data));
      }),
      ChemPlus.addListener("bargeIn", (data) => {
        if (mine(data)) handlers.onBargeIn?.();
      }),
    ]);
    let watchdog = 0;
    let completed = false;
    try {
      const spoken = ChemPlus.speak({
        segments: blocks.map(({ text, rate, pitch, pauseMs }) => ({ text, rate, pitch, pauseMs })),
        language: LOCALES[language],
        voice: voice || undefined,
        bargeIn: options.bargeIn ?? false,
        token,
      });
      const stalled = new Promise<{ interrupted: boolean }>((resolve) => {
        watchdog = window.setTimeout(() => {
          trace("ses", `telefonun sesi ${Math.round(watchdogMs / 1000)} sn'de bitmedi; durduruldu`);
          void ChemPlus.stopSpeaking();
          resolve({ interrupted: false });
        }, watchdogMs);
      });
      const result = await Promise.race([spoken, stalled]);
      completed = !result?.interrupted;
      return { interrupted: Boolean(result?.interrupted) };
    } finally {
      window.clearTimeout(watchdog);
      track.finish(completed);
      for (const subscription of subscriptions) void subscription.remove();
    }
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return { interrupted: false };
  stopSpeaking();
  const synth = window.speechSynthesis;
  const voices = webVoices(language);
  const chosen = voices.find((v) => v.name === voice) ?? voices[0] ?? null;
  return new Promise((resolve) => {
    let index = 0;
    let finished = false;
    let pauseTimer: number | null = null;
    let watchdog = 0;
    const finish = (interrupted: boolean) => {
      if (finished) return;
      finished = true;
      if (pauseTimer !== null) window.clearTimeout(pauseTimer);
      window.clearTimeout(watchdog);
      track.finish(!interrupted);
      webSpeaking = null;
      resolve({ interrupted });
    };
    // Chrome sometimes never fires the last "end": give up on it rather than wait forever.
    watchdog = window.setTimeout(() => {
      synth.cancel();
      finish(false);
    }, watchdogMs);
    webSpeaking = { resolve: () => finish(true) };
    const next = () => {
      if (finished) return;
      if (index >= blocks.length) {
        finish(false);
        return;
      }
      const current = index++;
      const block = blocks[current];
      const utterance = new SpeechSynthesisUtterance(block.text);
      utterance.lang = LOCALES[language];
      if (chosen) utterance.voice = chosen;
      utterance.rate = block.rate;
      utterance.pitch = block.pitch;
      utterance.onstart = () => {
        if (current === 0) handlers.onStart?.();
        track.start(current);
        handlers.onLevel?.(0.7);
      };
      utterance.onboundary = (event) => {
        track.word(current, event.charIndex + (event.charLength || 0));
        // Browsers report no loudness; a pulse per word keeps the goggles talking.
        handlers.onLevel?.(0.55 + Math.random() * 0.45);
      };
      const after = () => {
        track.end(current);
        pauseTimer = window.setTimeout(next, block.pauseMs);
      };
      utterance.onend = after;
      utterance.onerror = after;
      synth.speak(utterance);
    };
    next();
  });
}

/**
 * Reads a written answer aloud (the chat's "Listen" and "read answers aloud"): shaped for the ear
 * and given the chosen character's delivery, in full.
 */
export async function speak(text: string, language: VoiceLanguage, onStart?: () => void, override?: Partial<VoicePrefs>): Promise<void> {
  const prefs = { ...readVoicePrefs(), ...override };
  const script = voiceScript(text, language, { persona: prefs.persona, rate: prefs.rate });
  await speakScript(script, language, { onStart }, { prefs });
}

export function stopSpeaking(): void {
  naturalRound += 1;
  if (isNativeApp()) {
    void ChemPlus.stopSpeaking();
    return;
  }
  stopClip();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  webSpeaking?.resolve();
  webSpeaking = null;
}

// --- the phone around the conversation ------------------------------------------------------------

/** A light tap of the phone's haptics (Android's own feedback, as system settings allow). */
export async function haptic(kind: "tick" | "confirm" | "reject" = "tick"): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await ChemPlus.haptic({ kind });
  } catch {
    // no haptics on this phone
  }
}

/** Keeps the screen on while a voice conversation is open. */
export async function keepAwake(on: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await ChemPlus.keepAwake({ on });
  } catch {
    // the screen follows its usual timeout
  }
}

/** Headphones (wired, USB or Bluetooth) are connected: talking over an answer can interrupt it. */
export async function headphonesConnected(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    return (await ChemPlus.audioRoute()).headphones;
  } catch {
    return false;
  }
}
