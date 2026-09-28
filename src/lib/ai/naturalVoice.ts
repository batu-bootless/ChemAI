"use client";

// Chem+ app: Iris's natural voice - Azure's expressive Turkish HD voices (Aydın, Elif), with Google Gemini's
// speech models standing in, voiced by the website (/api/ai/tts, which holds the keys) and played
// on the phone.
//
// A voiced sentence takes the model two seconds or more, so an answer is sent in pieces: the first
// sentence alone, then a few sentences at a time, the next pieces asked for while the first one
// plays. Short lines that recur ("Hemen hesaplıyorum.", greetings, "Ayrıntılar ekranda…") are kept
// on the phone once voiced, so they come instantly the next time; voice mode asks for them in the
// background while it listens.
//
// When the voice cannot be had (no connection, the quota is used up, signed out) the phone's own
// voice takes over, and the natural voice is tried again later (a quarter of an hour after a used-up quota).

import type { PluginListenerHandle } from "@capacitor/core";
import { ChemPlus, isNativeApp } from "@/mobile/native";
import { azureSpeech } from "./azureVoice";
import type { Persona, SpokenSegment } from "./personality";
import { since, trace } from "./trace";

/**
 * Iris's voices: Azure speaks them (a man's, a woman's; Turkish Aydın / Elif - MAI-Voice-2, HD -
 * English Andrew / Ava); when Azure cannot, Gemini stands in with the voice named here.
 */
export const NATURAL_VOICES: { id: string; tr: string; en: string; detailTr: string; detailEn: string; gender: "male" | "female"; gemini: string }[] = [
  { id: "aydin", tr: "Aydın", en: "Andrew", detailTr: "Erkek sesi · Azure HD, en doğal", detailEn: "Male voice · Azure HD", gender: "male", gemini: "Achird" },
  { id: "elif", tr: "Elif", en: "Ava", detailTr: "Kadın sesi · Azure HD, en doğal", detailEn: "Female voice · Azure HD", gender: "female", gemini: "Sulafat" },
];
export const DEFAULT_NATURAL_VOICE = "aydin";

export function naturalVoiceOf(id: string) {
  return NATURAL_VOICES.find((voice) => voice.id === id) ?? NATURAL_VOICES[0];
}

type Language = "tr" | "en";

/** How the model is asked to say things, per character. */
export function styleFor(persona: Persona, language: Language): string {
  if (language === "en") {
    return persona === "lively"
      ? "Energetic, cheerful and lively; upbeat but easy to follow."
      : persona === "calm"
        ? "Calm, gentle and clear; unhurried, with short pauses between sentences."
        : "Warm, friendly and natural, like an experienced lab colleague chatting at the next bench.";
  }
  return persona === "lively"
    ? "Enerjik, neşeli ve canlı bir tonla; tempolu ama anlaşılır konuş."
    : persona === "calm"
      ? "Sakin, yumuşak ve net bir tonla; acele etmeden, cümleler arasında kısa duraklarla konuş."
      : "Sıcak, samimi ve doğal bir tonla; yanındaki deneyimli bir laboratuvar arkadaşı gibi, akıcı bir sohbet temposunda konuş.";
}

// --- pieces ---------------------------------------------------------------------------------------

export interface NaturalPiece {
  /** What the model is given: the sentences, with a pause tag where the personality wants one. */
  text: string;
  /** The same without tags, for mapping playback progress onto the captions. */
  plain: string;
  /** The script's sentences inside `plain`: index and character range. */
  parts: { index: number; start: number; end: number }[];
}

const FIRST_PIECE = 1; // sentences in the first piece, so the voice starts soon
const PIECE_CHARS = 420;

export function naturalPieces(script: SpokenSegment[]): NaturalPiece[] {
  const pieces: NaturalPiece[] = [];
  let current: NaturalPiece | null = null;
  for (let index = 0; index < script.length; index++) {
    const segment = script[index];
    const text = segment.text.trim();
    if (!text) continue;
    const full = current && (pieces.length === 0 ? current.parts.length >= FIRST_PIECE : current.plain.length + text.length + 1 > PIECE_CHARS);
    if (current && full) {
      pieces.push(current);
      current = null;
    }
    if (!current) current = { text: "", plain: "", parts: [] };
    const start = current.plain ? current.plain.length + 1 : 0;
    current.plain = current.plain ? `${current.plain} ${text}` : text;
    current.text = current.text ? `${current.text} ${text}` : text;
    current.parts.push({ index, start, end: current.plain.length });
    // The model knows the tag; a pause at the end of a piece is the gap between pieces anyway.
    if (segment.pauseMs >= 150) current.text += " <short pause>";
  }
  if (current) pieces.push(current);
  for (const piece of pieces) piece.text = piece.text.replace(/\s*<short pause>$/, "");
  return pieces;
}

// --- voicing --------------------------------------------------------------------------------------

export class NaturalVoiceError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "NaturalVoiceError";
  }
}

// A pause survives the app being closed, so a used-up quota is not asked again at every start.
// (v2: pauses stored by older versions, up to a quarter of an hour, are forgotten.)
const PAUSE_KEY = "chemplus:natural-voice-pause:v2";
let pausedUntil = readPause();
let pauseReason = "";

function readPause(): number {
  try {
    return Number(window.localStorage.getItem(PAUSE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** False for a while after the voice could not be had. */
export function naturalVoiceReady(): boolean {
  return Date.now() >= pausedUntil;
}

/** How long the natural voice still rests, in ms (0: ready). */
export function naturalVoicePausedFor(): number {
  return Math.max(0, pausedUntil - Date.now());
}

export function naturalVoicePauseReason(): string {
  return pauseReason;
}

export function pauseNaturalVoice(error: unknown) {
  const status = error instanceof NaturalVoiceError ? error.status : 0;
  const quota = status === 429 && /kota|quota/i.test(error instanceof Error ? error.message : "");
  // Every voice service busy or used up: two minutes. Signed out: ten. Too many requests or too
  // slow: half a minute. Anything else (no connection, a clip that would not play): one.
  const seconds = quota ? 120 : status === 401 ? 600 : status === 429 || status === 408 ? 30 : 60;
  pausedUntil = Date.now() + seconds * 1000;
  pauseReason = error instanceof Error ? error.message : "";
  trace("ses", `doğal ses ${seconds} sn beklemede: ${pauseReason || status}`);
  try {
    window.localStorage.setItem(PAUSE_KEY, String(pausedUntil));
  } catch {
    // storage unavailable: the pause lasts until the app closes
  }
}

/** The user asked for the natural voice again (settings): try it right away. */
export function clearNaturalVoicePause(): void {
  pausedUntil = 0;
  pauseReason = "";
  try {
    window.localStorage.removeItem(PAUSE_KEY);
  } catch {
    // storage unavailable
  }
}

/**
 * Which engine voiced the last piece. Azure (half a million characters a month) and Google's
 * Chirp 3 HD voices (a million) can afford recurring lines voiced ahead; Gemini's free tier (ten a day per key) cannot.
 */
let lastModel = "";

export function naturalVoiceGenerous(): boolean {
  return lastModel === "chirp3-hd" || lastModel === "azure-neural";
}

// Recurring lines stay on the phone (IndexedDB); longer pieces are kept in memory for "tekrar et".
const DB_NAME = "chemplus-voice";
const STORE = "clips";
const PHRASE_CHARS = 160;
const MAX_PHRASES = 120;
const memory = new Map<string, string>();
const MEMORY_CLIPS = 12;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    // Storage that does not answer (blocked, broken) means no cache, never a wait.
    const timer = window.setTimeout(() => resolve(null), 2500);
    const done = (db: IDBDatabase | null) => {
      window.clearTimeout(timer);
      resolve(db);
    };
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("at", "at");
      };
      request.onsuccess = () => done(request.result);
      request.onerror = () => done(null);
      request.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  return dbPromise;
}

async function storedClip(key: string): Promise<string | null> {
  const db = await database();
  if (!db) return null;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 1500);
    const done = (audio: string | null) => {
      window.clearTimeout(timer);
      resolve(audio);
    };
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => done((request.result as { audio?: string } | undefined)?.audio ?? null);
      request.onerror = () => done(null);
    } catch {
      done(null);
    }
  });
}

async function storeClip(key: string, audio: string): Promise<void> {
  const db = await database();
  if (!db) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    store.put({ key, audio, at: Date.now() });
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_PHRASES;
      if (extra <= 0) return;
      const oldest = store.index("at").openCursor();
      oldest.onsuccess = () => {
        const cursor = oldest.result;
        if (!cursor || extra <= 0) return;
        cursor.delete();
        extra -= 1;
        cursor.continue();
      };
    };
  } catch {
    // storage full or unavailable: the line is voiced again next time
  }
}

const clipKey = (text: string, voice: string, style: string) => `${voice}|${style}|${text}`;

// The recurring lines in the default voice and character ship with the app (public/voice/,
// voiced once when it was built), so they play at once and offline from the first conversation.
let bundledIndex: Promise<Record<string, string>> | null = null;

function bundled(): Promise<Record<string, string>> {
  bundledIndex ??= fetch("/voice/index.json")
    .then((response) => (response.ok ? response.json() : {}))
    .then((json: { clips?: Record<string, string> }) => json.clips ?? {})
    .catch(() => ({}));
  return bundledIndex;
}

async function bundledClip(key: string): Promise<string | null> {
  const file = (await bundled())[key];
  if (!file) return null;
  try {
    const response = await fetch(`/voice/${file}`);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  } catch {
    return null;
  }
}

export async function cachedClip(text: string, voice: string, style: string): Promise<string | null> {
  const key = clipKey(text, voice, style);
  const inMemory = memory.get(key);
  if (inMemory) return inMemory;
  const shipped = await bundledClip(key);
  if (shipped) {
    keep(key, shipped);
    return shipped;
  }
  return text.length <= PHRASE_CHARS ? storedClip(key) : null;
}

function keep(key: string, audio: string) {
  memory.delete(key);
  memory.set(key, audio);
  while (memory.size > MEMORY_CLIPS) memory.delete(memory.keys().next().value as string);
}

function remember(key: string, text: string, audio: string) {
  keep(key, audio);
  if (text.length <= PHRASE_CHARS) void storeClip(key, audio);
}

/**
 * A voiced piece (base64 WAV), from the phone if it has it, else from the website. A failure in
 * the `background` (prefetching) does not pause the voice for the answers.
 */
/** Requests for the conversation itself that are under way (background voicing waits for them). */
let foreground = 0;

/** Pieces being voiced right now: asking for one again (a piece voiced ahead) joins the request. */
const inflight = new Map<string, Promise<string>>();

export function voicePiece(text: string, voice: string, style: string, background = false, language: Language = "tr"): Promise<string> {
  const key = clipKey(text, voice, style);
  const running = inflight.get(key);
  if (running) return running;
  const job = voiceOnce(key, text, voice, style, background, language);
  inflight.set(key, job);
  const forget = () => {
    if (inflight.get(key) === job) inflight.delete(key);
  };
  job.then(forget, forget);
  return job;
}

async function voiceOnce(key: string, text: string, voice: string, style: string, background: boolean, language: Language): Promise<string> {
  const cached = await cachedClip(text, voice, style);
  if (cached) return cached;
  const started = performance.now();
  if (!background) foreground += 1;
  try {
    // Straight from Azure when the phone has a token for it; else through the website.
    const direct = await azureSpeech(text, naturalVoiceOf(voice).gender, language);
    if (direct) {
      lastModel = "azure-neural";
      remember(key, text, direct);
      return direct;
    }
    let response: Response;
    try {
      const chosen = naturalVoiceOf(voice);
      response = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: chosen.gemini, gender: chosen.gender, style, language }),
      });
    } catch (error) {
      const failure = new NaturalVoiceError(error instanceof Error ? error.message : "network", 0);
      trace("ses", `${background ? "önceden " : ""}seslendirme ✕ ${failure.message} (${since(started)})`);
      if (!background) pauseNaturalVoice(failure);
      throw failure;
    }
    const json = (await response.json().catch(() => ({}))) as { audio?: string; error?: string; model?: string };
    if (!response.ok || !json.audio) {
      const failure = new NaturalVoiceError(json.error || `HTTP ${response.status}`, response.status);
      trace("ses", `${background ? "önceden " : ""}seslendirme ${response.status}: ${failure.message} (${since(started)})`);
      // A bad piece of text is that piece's problem; everything else pauses the voice for a while.
      if (!background && response.status !== 400 && response.status !== 413) pauseNaturalVoice(failure);
      throw failure;
    }
    lastModel = json.model ?? "";
    trace("ses", `${background ? "önceden " : ""}seslendirildi: ${lastModel || "?"}, ${text.length} karakter, ${since(started)}`);
    remember(key, text, json.audio);
    return json.audio;
  } finally {
    if (!background) foreground -= 1;
  }
}

let prefetching = false;

/** Lines voiced ahead per visit: enough for the usual ones, not a drain on the service's limits. */
const PREFETCH_PER_VISIT = 8;
let prefetchedThisVisit = 0;
let speakingNow = 0;

/** The conversation is speaking or waiting for its own voice: background voicing holds off. */
export function holdBackground(on: boolean): void {
  speakingNow = Math.max(0, speakingNow + (on ? 1 : -1));
}

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Voices recurring lines in the background, one at a time, so they are on the phone when needed.
 * Never next to the conversation's own requests or speech (the voice services allow one request at
 * a time on their free tiers), a limited number per visit, and it stops at the first failure.
 */
export async function prefetchPieces(texts: string[], voice: string, style: string, language: Language = "tr"): Promise<void> {
  if (prefetching || !naturalVoiceGenerous()) return;
  prefetching = true;
  try {
    for (const text of texts) {
      if (!naturalVoiceReady() || prefetchedThisVisit >= PREFETCH_PER_VISIT) return;
      if (await cachedClip(text, voice, style)) continue;
      // Wait (up to a minute) until the conversation is quiet.
      for (let waited = 0; foreground > 0 || speakingNow > 0; waited += 500) {
        if (waited > 60000) return;
        await pause(500);
      }
      prefetchedThisVisit += 1;
      try {
        await voicePiece(text, voice, style, true, language);
      } catch {
        return;
      }
      // Gently: Azure's free tier allows about twenty requests a minute, and the answers come first.
      await pause(5000);
    }
  } finally {
    prefetching = false;
  }
}

// --- playing --------------------------------------------------------------------------------------

/**
 * The shape of a moment of the voice, which Iris's mouth follows (VoiceShape.java measures the
 * same on the phone), all scaled to a 24 kHz rate:
 *   bright - sqrt(Σ(Δx)²/Σx²): above ~0.5 for s, ş, z;
 *   f1     - the same on the voice low-passed at 3 kHz: follows the first formant (how open);
 *   f2     - sqrt(Σ(Δ²y)²/Σ(Δy)²) on that: high for e, i (lips drawn back), low for o, u (rounded).
 */
export interface VoiceShape {
  bright: number;
  f1?: number;
  f2?: number;
}

/** A shape from a native event's fields, when it has them. */
export function shapeOf(data: { bright?: number; f1?: number; f2?: number }): VoiceShape | undefined {
  return data.bright === undefined ? undefined : { bright: data.bright, f1: data.f1, f2: data.f2 };
}

/** VoiceShape of a run of samples (the browser's analyser); undefined in silence. */
export function voiceShape(samples: Float32Array, rate: number): VoiceShape | undefined {
  // Two Butterworth low-pass sections at 3 kHz, started from silence: the first samples settle it.
  const w = (2 * Math.PI * Math.min(3000, rate * 0.45)) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0;
  const b1 = (1 - cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let [x1, x2, y1, y2, u1, u2, v1, v2] = [0, 0, 0, 0, 0, 0, 0, 0];
  const settle = Math.min(48, samples.length >> 2);
  let raw0 = 0;
  let raw1 = 0;
  let low0 = 0;
  let low1 = 0;
  let low2 = 0;
  let lastRaw = 0;
  let lastLow = 0;
  let lastStep = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * (x + x2) + b1 * x1 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    const low = b0 * (y + u2) + b1 * u1 - a1 * v1 - a2 * v2;
    u2 = u1;
    u1 = y;
    v2 = v1;
    v1 = low;
    if (i < settle) continue;
    if (count > 0) {
      const step = low - lastLow;
      raw1 += (x - lastRaw) ** 2;
      low1 += step * step;
      if (count > 1) low2 += (step - lastStep) ** 2;
      lastStep = step;
    }
    raw0 += x * x;
    low0 += low * low;
    lastRaw = x;
    lastLow = low;
    count++;
  }
  if (raw0 <= 1e-9) return undefined;
  const scale = rate / 24000;
  return {
    bright: Math.min(2, Math.sqrt(raw1 / raw0) * scale),
    f1: low0 > 1e-12 ? Math.min(2, Math.sqrt(low1 / low0) * scale) : undefined,
    f2: low1 > 1e-12 ? Math.min(2, Math.sqrt(low2 / low1) * scale) : undefined,
  };
}

export interface ClipHandlers {
  onStart?: () => void;
  /** Loudness 0…1, and the shape of the voice (for Iris's mouth). */
  onLevel?: (level: number, shape?: VoiceShape) => void;
  /** How much of the clip has been heard, 0…1. */
  onProgress?: (fraction: number) => void;
  onBargeIn?: () => void;
}

let clipCounter = 0;
let webClip: { stop: () => void } | null = null;
let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    audioContext ??= new AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

/** Call from a tap: a browser only lets audio start after the user has touched the page. */
export function unlockAudio(): void {
  if (isNativeApp()) return;
  const ctx = context();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => undefined);
}

export function stopClip(): void {
  webClip?.stop();
  webClip = null;
}

/** How long a WAV clip (base64) plays, from its header; 30 s when it cannot be read. */
export function clipSeconds(audio: string): number {
  try {
    const head = atob(audio.slice(0, 64));
    if (head.slice(0, 4) !== "RIFF") return 30;
    const byteRate = head.charCodeAt(28) | (head.charCodeAt(29) << 8) | (head.charCodeAt(30) << 16) | (head.charCodeAt(31) << 24);
    const bytes = Math.floor((audio.length * 3) / 4) - 44;
    return byteRate > 0 ? Math.max(0.2, bytes / byteRate) : 30;
  } catch {
    return 30;
  }
}

/** A clip must start this soon after it is handed over (decoding included), or it counts as failed. */
const CLIP_START_MS = 6000;

export async function playClip(
  audio: string,
  handlers: ClipHandlers,
  options: { bargeIn?: boolean; speed?: number } = {}
): Promise<{ interrupted: boolean }> {
  if (isNativeApp()) {
    const token = `c${Date.now().toString(36)}${(clipCounter++).toString(36)}`;
    const mine = (data: { token?: string }) => data.token === token;
    let started = false;
    const subscriptions: PluginListenerHandle[] = await Promise.all([
      ChemPlus.addListener("ttsStart", (data) => {
        if (!mine(data)) return;
        started = true;
        handlers.onStart?.();
      }),
      ChemPlus.addListener("ttsLevel", (data) => {
        if (mine(data)) handlers.onLevel?.(data.level ?? 0, shapeOf(data));
      }),
      ChemPlus.addListener("ttsProgress", (data) => {
        if (mine(data)) handlers.onProgress?.(data.fraction ?? 0);
      }),
      ChemPlus.addListener("bargeIn", (data) => {
        if (mine(data)) handlers.onBargeIn?.();
      }),
    ]);
    const seconds = clipSeconds(audio) / Math.max(0.5, options.speed ?? 1);
    let startTimer = 0;
    let endTimer = 0;
    // The player never started (the clip would not decode) or never said it finished: stop it
    // and go on, rather than keep the conversation waiting.
    const watchdog = new Promise<{ interrupted: boolean }>((resolve, reject) => {
      startTimer = window.setTimeout(() => {
        if (started) return;
        trace("ses", `klip ${CLIP_START_MS} ms'de başlamadı`);
        void ChemPlus.stopSpeaking();
        reject(new NaturalVoiceError("clip did not start", 0));
      }, CLIP_START_MS);
      endTimer = window.setTimeout(() => {
        trace("ses", `klip ${Math.round(seconds)} sn sürmesi gerekirken bitmedi; durduruldu`);
        void ChemPlus.stopSpeaking();
        resolve({ interrupted: false });
      }, seconds * 1000 + CLIP_START_MS + 4000);
    });
    try {
      const result = await Promise.race([ChemPlus.playAudio({ audio, token, bargeIn: options.bargeIn ?? false, speed: options.speed ?? 1 }), watchdog]);
      return { interrupted: Boolean(result?.interrupted) };
    } finally {
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      for (const subscription of subscriptions) void subscription.remove();
    }
  }
  return playWeb(audio, handlers);
}

async function playWeb(audio: string, handlers: ClipHandlers): Promise<{ interrupted: boolean }> {
  const ctx = context();
  if (!ctx) return { interrupted: false };
  stopClip();
  // Without a tap first, a browser keeps the audio clock stopped (and resume() may never settle):
  // then the clip cannot play, and the phone's voice says it instead.
  if (ctx.state === "suspended") await Promise.race([ctx.resume().catch(() => undefined), pause(1500)]);
  if (ctx.state !== "running") throw new NaturalVoiceError("audio is locked", 0);
  let buffer: AudioBuffer;
  try {
    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    buffer = await ctx.decodeAudioData(bytes.buffer);
  } catch {
    throw new NaturalVoiceError("clip did not decode", 0);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const analyser = ctx.createAnalyser();
  // About 20 ms of the voice at a time: long enough to tell its shape.
  analyser.fftSize = ctx.sampleRate > 30000 ? 1024 : 512;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  return new Promise((resolve) => {
    const samples = new Float32Array(analyser.fftSize);
    let done = false;
    let timer = 0;
    const started = ctx.currentTime;
    // "ended" that never comes (a suspended context) must not hold the conversation.
    const guard = window.setTimeout(() => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      finish(false);
    }, buffer.duration * 1000 + 4000);
    const finish = (interrupted: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      window.clearTimeout(guard);
      webClip = null;
      resolve({ interrupted });
    };
    webClip = {
      stop: () => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        finish(true);
      },
    };
    source.onended = () => finish(false);
    source.start();
    handlers.onStart?.();
    timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      handlers.onLevel?.(Math.min(1, Math.sqrt(sum / samples.length) * 5), voiceShape(samples, ctx.sampleRate));
      handlers.onProgress?.(Math.min(1, (ctx.currentTime - started) / buffer.duration));
    }, 50);
  });
}
