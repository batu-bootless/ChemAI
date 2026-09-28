"use client";

// Chem+ app: the voice conversation with Iris, the app's AI - the realtime loop behind the voice
// screen.
//
//   🎙 listen ─▶ understand the turn ─▶ think (engine + AI) ─▶ speak ─▶ listen …
//
// Listening. The turn ends when the user stops talking, judged here rather than left to the
// recognizer (which on some phones never ends in a noisy room, or ends with an empty result after
// showing the words): every new word starts a short countdown, and when it runs out in quiet the
// question goes. The words so far set its length (turns.ts): "…asetik asidin pH'ı nedir?" is done
// and goes quickly, "…0,1 molar ve" is not and gets a longer pause. Talking again inside it - new
// words, or sound that is about to become words - holds it and the question grows; a tap (or
// "Gönder") ends it at once. What the recognizer showed always counts, even when it ends with
// nothing. A few words that are about the conversation itself - "tekrar et", "daha yavaş", "dur",
// "görüşürüz" - are acted on here, without the AI.
//
// Thinking. A calculation is acknowledged at once ("Hemen hesaplıyorum."), a question that takes a
// while gets a "Bir saniye."; the engine's result is said the moment it exists, while its cards
// appear, and the AI's explanation follows - spoken as it is written: its first sentence as soon as
// it is finished, the sentences after it voiced while that one plays.
//
// Speaking. Every answer goes through the voice personality (personality.ts): the chosen pace, the
// same from the first word to the last, and pauses where a person would take them. A tap cuts it
// short and hands the turn back; with headphones on, so does talking over it.

import { isActionRequest, mightCompute } from "@/lib/ai/assistant";
import { readIrisPrefs } from "@/lib/ai/irisPrefs";
import { scanSafety } from "@/lib/ai/safetyScan";
import { recurringResultLines, spokenResults } from "@/lib/ai/spoken";
import {
  acknowledgementLines,
  commandReply,
  cue,
  cueLines,
  failureLine,
  farewell,
  farewellLines,
  greeting,
  greetingLines,
  voiceScript,
  voiceScriptSoFar,
  type Mood,
  type SpokenSegment,
} from "@/lib/ai/personality";
import type { VoiceShape } from "@/lib/ai/naturalVoice";
import { trace } from "@/lib/ai/trace";
import { endOfTurn, isRequest, tidyTranscript, voiceCommand, type VoiceCommand } from "@/lib/ai/turns";
import {
  haptic,
  isVoiced,
  listen,
  prefetchLines,
  prepareSpeech,
  readVoicePrefs,
  saveVoicePrefs,
  speakScript,
  stopSpeaking,
  type Listening,
  type VoiceLanguage,
  type VoicePrefs,
} from "@/lib/ai/voice";
import type { SendOptions } from "@/components/ai/useAiConversation";

export type Ask = (text: string, options: SendOptions) => boolean;

export type EngineState = "starting" | "listening" | "hearing" | "waiting" | "thinking" | "speaking" | "paused" | "idle" | "error";

export interface Caption {
  who: "user" | "ai";
  text: string;
  /** How much of an AI sentence has been said, 0…1. */
  progress: number;
  /** The mood of the AI sentence (for Iris's face). */
  mood?: Mood;
}

/** What the screen shows; the engine calls these as the conversation moves. */
export interface EngineView {
  state: (state: EngineState) => void;
  caption: (caption: Caption | null) => void;
  /** Loudness 0…1: the user's voice while listening, Iris's while speaking (with its shape). */
  level: (level: number, shape?: VoiceShape) => void;
  /** The answer (chat turn) the screen should show. */
  turn: (turnId: string) => void;
  /** The answer being read out, for the chat's "reading aloud" mark. */
  speaking: (turnId: string | null) => void;
  message: (message: string | null) => void;
  /** The pause that will end the question, in ms (null: none running). */
  patience: (ms: number | null) => void;
  prefs: (prefs: VoicePrefs) => void;
  close: () => void;
}

export interface VoiceEngine {
  /** The goggles were tapped: interrupt, send, or start listening again. */
  tap: () => void;
  /** "Gönder": the question is finished. */
  send: () => void;
  setMuted: (muted: boolean) => void;
  /** The app went to the background: stop talking and listening (the microphone stays private). */
  suspend: () => void;
  /** Back in front: listen again, unless the user muted the microphone. */
  resume: () => void;
  stop: () => void;
}

/** How long listening goes on in silence before voice mode rests (a tap wakes it). */
const SILENCE_LIMIT_MS = 60000;
/** Microphone level that counts as the user making sound (the next word on its way). */
const LOUD = 0.6;
/** How long such sound, without new words, can hold the countdown past its end. */
const HOLD_MAX_MS = 1500;
/** How long to wait for the recognizer's final words once the turn is over (else its last guess goes). */
const FINAL_WAIT_MS = 600;
/**
 * The longest a question may stay unanswered (the pipeline's own limits add up to less): then the
 * conversation says so and goes on, rather than "thinking" for ever.
 */
const THINK_LIMIT_MS = 190_000;

const DETAIL = /(ayrıntı|detay|adım adım|nasıl hesapla|açıkla|anlat|neden|niçin|explain|detail|step by step|why|how did you)/i;

export function startVoiceEngine({
  language,
  ask,
  prepare,
  view,
  greet,
}: {
  language: VoiceLanguage;
  ask: () => Ask | null;
  /** Starts planning the question being said (the pause that will send it has begun). */
  prepare?: () => ((text: string) => void) | null;
  view: EngineView;
  /** Say hello first (a new conversation, the first time in this session). */
  greet: boolean;
}): VoiceEngine {
  const tr = language === "tr";
  let alive = true;
  let state: EngineState = "starting";
  let muted = false;
  let suspended = false;
  let session: Listening | null = null;
  // The finished phrases of this turn, and the one the recognizer is still hearing (its latest guess).
  let buffer = "";
  let heard = "";
  // Listening to silence goes on quietly for a while; quick recognizer failures are retried.
  let silentSince = 0;
  let failures = 0;
  // The countdown to the answer after the last words, the moment it shows as a pause, and the wait
  // for the recognizer's final words.
  let turnTimer: number | null = null;
  let pauseTimer: number | null = null;
  let finishTimer: number | null = null;
  let turnEndsAt = 0;
  let holdUntil = 0;
  let lastLoudAt = 0;
  let ackTimer: number | null = null;
  // Bumped whenever listening is ended on purpose, so a recognizer that was still starting up, or
  // a result that arrives late, cannot reopen a question that is already answered.
  let listenRound = 0;
  // Bumped when speech is cut short, so what was queued for it is dropped.
  let speechRound = 0;
  // The turn is over (a tap, "Gönder", the countdown): answer as soon as the recognizer's words come.
  let finishRequested = false;
  let chain: Promise<unknown> = Promise.resolve();
  // A question is out and its answer is not yet being spoken.
  let answering = false;
  let lastSpoken: { script: SpokenSegment[]; turnId: string | null } | null = null;
  let lastAck = "";

  const go = (next: EngineState) => {
    if (next !== state) trace("durum", next);
    state = next;
    view.state(next);
  };
  const prefs = () => readVoicePrefs();
  const script = (text: string, maxWords = Infinity) => voiceScript(text, language, { persona: prefs().persona, rate: prefs().rate, maxWords });

  const clearTimers = () => {
    for (const timer of [turnTimer, pauseTimer, finishTimer]) if (timer !== null) window.clearTimeout(timer);
    turnTimer = null;
    pauseTimer = null;
    finishTimer = null;
  };
  const clearTurn = () => {
    clearTimers();
    view.patience(null);
  };
  /** Everything said in this turn: the finished phrases and the one still coming in. */
  const spoken = () => (heard ? (buffer ? `${buffer} ${heard}` : heard) : buffer).trim();
  const planAhead = () => {
    const text = spoken();
    if (!text || voiceCommand(text, language)) return;
    try {
      prepare?.()?.(text);
    } catch (error) {
      trace("dinleme", `önceden planlanamadı: ${String(error)}`);
    }
  };
  const clearAck = () => {
    if (ackTimer !== null) window.clearTimeout(ackTimer);
    ackTimer = null;
  };

  const errorText = (code: string) =>
    code === "PERMISSION" || code === "PERMISSION_DENIED"
      ? tr
        ? "Mikrofon izni gerekli. Ayarlar'dan ChemAI için mikrofona izin ver."
        : "Microphone permission is needed. Allow it for ChemAI in Settings."
      : code === "NETWORK"
        ? tr
          ? "Konuşma tanıma için internet bağlantısı gerekiyor."
          : "Speech recognition needs an internet connection."
        : code === "UNAVAILABLE"
          ? tr
            ? "Bu cihazda konuşma tanıma yok (Google konuşma hizmetleri gerekir)."
            : "No speech recognition here (it needs Google's speech services)."
          : tr
            ? "Ses tanınamadı. Tekrar denemek için İris'e dokun."
            : "Speech wasn't recognised. Tap Iris to try again.";

  /** Queues speech; resolves true when it was said to the end (not cut short, not superseded). */
  const say = (
    segments: SpokenSegment[],
    turnId: string | null,
    options: { firstPieceTimeoutMs?: number; onStart?: () => void } = {}
  ): Promise<boolean> => {
    const round = speechRound;
    const run = async (): Promise<boolean> => {
      if (!alive || round !== speechRound) return false;
      // Nothing to say (an empty reply) counts as said, so the conversation moves on.
      if (segments.length === 0) return true;
      view.speaking(turnId);
      let completed = false;
      const chars = segments.reduce((sum, segment) => sum + segment.text.length, 0);
      // Generous for any voice (a slow network voice, a slow speaker): past this, it is stuck.
      const limitMs = 25000 + chars * 180;
      let limitTimer = 0;
      try {
        const limit = new Promise<{ interrupted: boolean }>((resolve) => {
          limitTimer = window.setTimeout(() => {
            trace("konuşma", `${Math.round(limitMs / 1000)} sn'de bitmedi, durduruldu: ${segments[0]?.text.slice(0, 40) ?? ""}`);
            stopSpeaking();
            resolve({ interrupted: false });
          }, limitMs);
        });
        trace("konuşma", `başlıyor (${chars} karakter): ${segments[0]?.text.slice(0, 50) ?? ""}`);
        const spoken = speakScript(
          segments,
          language,
          {
            // "Speaking" begins with the sound: the natural voice takes a moment to arrive, and
            // until then the goggles keep thinking.
            onStart: () => {
              if (!alive || round !== speechRound) return;
              go("speaking");
              options.onStart?.();
            },
            onSegment: (index) => view.caption({ who: "ai", text: segments[index]?.display ?? "", progress: 0, mood: segments[index]?.mood }),
            onProgress: (index, fraction) =>
              view.caption({ who: "ai", text: segments[index]?.display ?? "", progress: fraction, mood: segments[index]?.mood }),
            onLevel: (value, shape) => view.level(value, shape),
            onBargeIn: () => interrupt(true),
          },
          { bargeIn: prefs().bargeIn, firstPieceTimeoutMs: options.firstPieceTimeoutMs }
        );
        const result = await Promise.race([spoken, limit]);
        completed = !result.interrupted;
        trace("konuşma", completed ? "bitti" : "kesildi");
      } catch (error) {
        // no voice for this language: the words are on screen
        trace("konuşma", `ses yok: ${error instanceof Error ? error.message : String(error)}`);
        completed = true;
      } finally {
        window.clearTimeout(limitTimer);
        view.speaking(null);
        view.level(0);
      }
      const current = alive && round === speechRound;
      if (current && answering) go("thinking");
      return completed && current;
    };
    const next = chain.then(run, run);
    chain = next.catch(() => undefined);
    return next;
  };

  /** Cuts the answer short (or the wait for it) and hands the turn back. */
  const interrupt = (byVoice: boolean) => {
    if (!alive || (state !== "speaking" && state !== "thinking")) return;
    trace("konuşma", byVoice ? "kullanıcı araya girdi" : "dokunarak kesildi");
    speechRound += 1;
    answering = false;
    clearAck();
    clearThinkLimit();
    stopSpeaking();
    void haptic("tick");
    if (!byVoice) view.message(null);
    void listenNow(false);
  };

  const stopListening = () => {
    listenRound += 1;
    clearTurn();
    session?.cancel();
    session = null;
  };

  /**
   * The recognizer gave up on silence (it stops after a few seconds without speech) or heard no
   * words. Listening carries on without a visible break, for up to a minute of silence.
   */
  const miss = () => {
    const now = performance.now();
    if (!silentSince) silentSince = now;
    if (now - silentSince < SILENCE_LIMIT_MS) {
      restart(250);
      return;
    }
    silentSince = 0;
    go("idle");
    view.message(tr ? "Buradayım. Konuşmak için İris'e dokun." : "I'm here. Tap Iris to talk.");
  };

  /** Starts the recognizer again after a moment, unless something else happened meanwhile. */
  const restart = (delay: number) => {
    const round = listenRound;
    window.setTimeout(() => {
      if (alive && round === listenRound && !muted && !suspended) void listenNow(false, true);
    }, delay);
  };

  /** How long a quiet spell after the last words ends the turn, from the words said so far. */
  const patienceFor = (text: string, base: number) => {
    const verdict = endOfTurn(text, language);
    const factor = verdict === "complete" ? 0.35 : verdict === "incomplete" ? 1.1 : 0.55;
    return Math.round(Math.min(4000, Math.max(550, base * factor)));
  };

  /**
   * (Re)starts the countdown to the answer: `wait` ms of quiet after the last words. Sound that is
   * not words yet holds it a little past its end - never for long, so a noisy room cannot keep
   * Iris listening for ever.
   */
  const armTurn = (wait: number) => {
    clearTimers();
    turnEndsAt = performance.now() + wait;
    holdUntil = turnEndsAt + HOLD_MAX_MS;
    // A moment without new words is a pause, not the gap between two words: show the countdown,
    // and start planning the question as it stands (it is likely to be sent as it is).
    pauseTimer = window.setTimeout(() => {
      pauseTimer = null;
      if (state !== "hearing" && state !== "waiting") return;
      go("waiting");
      view.patience(Math.max(0, turnEndsAt - performance.now()));
      planAhead();
    }, Math.min(400, wait / 2));
    const fire = () => {
      turnTimer = null;
      const now = performance.now();
      if (now - lastLoudAt < 300 && now < holdUntil) {
        turnTimer = window.setTimeout(fire, 250);
        return;
      }
      endTurn();
    };
    turnTimer = window.setTimeout(fire, wait);
  };

  /**
   * The user has finished: answer. When the recognizer may still hold words (it is showing some, or
   * `waitForWords`: a tap came before any), its final text is awaited briefly; then its last guess
   * goes.
   */
  const endTurn = (waitForWords = false) => {
    if (!alive) return;
    if (!session || !(heard || waitForWords)) {
      commit();
      return;
    }
    clearTurn();
    finishRequested = true;
    session.finish();
    finishTimer = window.setTimeout(() => {
      finishTimer = null;
      if (alive && finishRequested) commit();
    }, FINAL_WAIT_MS);
  };

  const commit = () => {
    const text = spoken();
    stopListening();
    buffer = "";
    heard = "";
    finishRequested = false;
    if (!text) {
      miss();
      return;
    }
    trace("dinleme", `soru bitti: ${text.slice(0, 80)}`);
    silentSince = 0;
    failures = 0;
    const command = voiceCommand(text, language);
    if (command) void obey(command);
    else think(text);
  };

  /**
   * `continuation`: the recognizer stopped at a pause with words in hand and the user may still be
   * mid-thought, so this round only adds to them while the countdown runs on.
   * `quietRestart`: the recognizer is only being restarted; the conversation's state is unchanged.
   */
  const listenNow = async (continuation: boolean, quietRestart = false): Promise<void> => {
    if (!alive) return;
    if (muted || suspended) {
      stopListening();
      go("paused");
      return;
    }
    const round = ++listenRound;
    const live = () => alive && round === listenRound;
    const current = prefs();
    if (continuation) {
      // The countdown started by the last words keeps running; start one if there was none.
      if (turnTimer === null) armTurn(patienceFor(buffer, current.patienceMs));
      go("waiting");
      view.patience(Math.max(0, turnEndsAt - performance.now()));
    } else {
      clearTurn();
      buffer = "";
      heard = "";
      finishRequested = false;
      if (!quietRestart) {
        silentSince = 0;
        failures = 0;
        view.caption(null);
      }
      go("listening");
    }
    view.level(0);
    const started = await listen(
      language,
      {
        onReady: () => {
          if (live()) failures = 0;
        },
        onBegin: () => {
          if (!live()) return;
          silentSince = 0;
          lastLoudAt = performance.now();
        },
        onPartial: (text) => {
          if (!live()) return;
          const said = tidyTranscript(text);
          if (!said) return;
          silentSince = 0;
          view.message(null);
          if (said !== heard) {
            heard = said;
            // New words: "hearing", and the countdown starts again from here.
            if (state !== "hearing") {
              go("hearing");
              view.patience(null);
            }
            if (!finishRequested) armTurn(patienceFor(spoken(), current.patienceMs));
          }
          view.caption({ who: "user", text: spoken(), progress: 1 });
        },
        onLevel: (value) => {
          if (!live()) return;
          view.level(value);
          if (value > LOUD) lastLoudAt = performance.now();
        },
        onFinal: (text) => {
          if (!live()) return;
          session = null;
          // Some recognizers end with an empty result after showing the words: those count.
          const said = tidyTranscript(text) || heard;
          heard = "";
          if (said) buffer = buffer ? `${buffer} ${said}` : said;
          if (!buffer) {
            miss();
            return;
          }
          view.caption({ who: "user", text: buffer, progress: 1 });
          if (finishRequested || voiceCommand(buffer, language)) {
            commit();
            return;
          }
          // It stopped at a pause; the user may go on. Listen on until the countdown runs out.
          void listenNow(true);
        },
        onError: (code) => {
          if (!live()) return;
          session = null;
          if (code !== "NO_MATCH" && code !== "SPEECH_TIMEOUT") trace("dinleme", `tanıyıcı hatası: ${code}`);
          // An error at the end (common after the words were shown) does not lose them.
          if (heard) {
            buffer = buffer ? `${buffer} ${heard}` : heard;
            heard = "";
          }
          if (buffer) {
            const fatal = code === "PERMISSION" || code === "PERMISSION_DENIED" || code === "UNAVAILABLE";
            if (finishRequested || fatal || voiceCommand(buffer, language)) commit();
            else void listenNow(true);
            return;
          }
          if (code === "NO_MATCH" || code === "SPEECH_TIMEOUT") {
            miss();
            return;
          }
          // A busy or briefly failing recognizer (or a network blip) is tried again quietly.
          if (code !== "PERMISSION" && code !== "PERMISSION_DENIED" && code !== "UNAVAILABLE" && failures < 4) {
            failures += 1;
            restart(400 * failures);
            return;
          }
          go("error");
          view.message(errorText(code));
          void haptic("reject");
        },
      },
      current.patienceMs
    );
    // Listening was ended while the recognizer was still starting: stop it straight away.
    if (!live()) started.cancel();
    else session = started;
  };

  /** Something went wrong around an answer: say so briefly and let the user go on. */
  const recover = async (round: number, why: string) => {
    trace("düşünme", `kurtarma: ${why}`);
    if (!alive || round !== speechRound) return;
    answering = false;
    clearAck();
    clearThinkLimit();
    view.message(tr ? "Yanıt alınamadı. Tekrar sorabilirsin." : "No answer came. You can ask again.");
    const finished = await say(script(failureLine(language, false)), null);
    if (alive && round === speechRound && finished) void listenNow(false);
    else if (alive && round === speechRound) go("idle");
  };

  let thinkTimer: number | null = null;
  const clearThinkLimit = () => {
    if (thinkTimer !== null) window.clearTimeout(thinkTimer);
    thinkTimer = null;
  };

  const think = (text: string) => {
    const round = ++speechRound;
    answering = true;
    go("thinking");
    view.message(null);
    view.caption({ who: "user", text, progress: 1 });
    void haptic("confirm");
    clearThinkLimit();
    thinkTimer = window.setTimeout(() => {
      thinkTimer = null;
      if (alive && round === speechRound && answering) void recover(round, `${THINK_LIMIT_MS / 1000} sn içinde yanıt gelmedi`);
    }, THINK_LIMIT_MS);
    const computing = mightCompute(text);
    const acting = isActionRequest(text);
    let acknowledged = false;
    let resultSaid = false;
    let quickLine = "";
    // A calculation is acknowledged at once; a question only if its answer is slow to come (the
    // streamed answer usually starts sooner).
    const delay = computing ? 300 : isRequest(text, language) ? 2400 : -1;
    clearAck();
    if (delay >= 0) {
      ackTimer = window.setTimeout(() => {
        ackTimer = null;
        const kind = acting ? "action" : computing ? "compute" : "think";
        const wanted = () => alive && round === speechRound && answering && !resultSaid;
        void (async () => {
          // Only a line that can be said at once: in the natural voice, one already on the phone.
          const lines = acknowledgementLines(kind, language)
            .filter((line) => line !== lastAck)
            .sort(() => Math.random() - 0.5);
          for (const line of lines) {
            if (!wanted()) return;
            // The phone's storage answering slowly is a reason to skip the line, not to wait.
            const ready = await Promise.race([isVoiced(line, language), new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 800))]);
            if (!ready) continue;
            if (!wanted()) return;
            acknowledged = true;
            lastAck = line;
            void say(script(line), null);
            return;
          }
          prefetchLines(acknowledgementLines(kind, language), language);
        })();
      }, delay);
    }
    // Güvenlik önce: two chemicals in the question that must not meet are warned about at once,
    // before any calculation or answer (the safety cards on the device know the pairs).
    const conflict = readIrisPrefs().safety ? scanSafety([text], [], [])?.conflicts[0] : undefined;
    if (conflict) {
      const name = (chemical: typeof conflict.a) => (tr ? chemical.nameTr : chemical.name);
      clearAck();
      acknowledged = true;
      trace("düşünme", `güvenlik uyarısı: ${conflict.a.id} + ${conflict.b.id}`);
      void say(
        script(
          tr
            ? `Önce bir uyarı: ${name(conflict.a)} ile ${name(conflict.b)} birbiriyle uyumsuz; bunları karıştırma, yan yana da saklama.`
            : `A warning first: ${name(conflict.a)} and ${name(conflict.b)} are incompatible; don't mix them or store them together.`
        ),
        null
      );
    }
    let headline: Promise<unknown> = Promise.resolve();
    // The answer as it streams in: how many of its script's lines are with the voice already, the
    // latest text, and whether the batch before has started playing (the next one is voiced then).
    const maxWords = DETAIL.test(text) ? 170 : 80;
    const delivery = () => ({ persona: prefs().persona, rate: prefs().rate, maxWords });
    let handed = 0;
    let handedScript: SpokenSegment[] = [];
    let latest = "";
    let batchStarted = true;
    let lastBatch: Promise<boolean> | null = null;
    const hand = (segments: SpokenSegment[], turnId: string) => {
      if (segments.length === 0) return;
      handed += segments.length;
      handedScript = [...handedScript, ...segments];
      resultSaid = true;
      clearAck();
      batchStarted = false;
      prepareSpeech(segments, language);
      lastBatch = say(segments, turnId, {
        onStart: () => {
          batchStarted = true;
          handOn(turnId);
        },
      });
    };
    // The finished lines not yet handed over: the first one alone (so the voice starts soonest),
    // the rest together once the batch before is playing.
    const handOn = (turnId: string) => {
      if (!alive || round !== speechRound || !latest) return;
      const ready = voiceScriptSoFar(latest, language, delivery()).slice(handed);
      if (ready.length === 0) return;
      if (handed === 0) hand(ready.slice(0, 1), turnId);
      else if (batchStarted) hand(ready, turnId);
    };
    const options: SendOptions = {
      voice: true,
      onTools: (outcomes, turnId, quick) => {
        if (!alive || round !== speechRound) return;
        view.turn(turnId);
        try {
          const line = spokenResults(outcomes, language, { acknowledged });
          if (!line) return;
          // The device's instant result was said already; the planned one only if it says more.
          if (quick) quickLine = line;
          else if (line === quickLine) return;
          resultSaid = true;
          clearAck();
          headline = say(script(line), turnId);
        } catch (error) {
          trace("düşünme", `sonuç cümlesi kurulamadı: ${String(error)}`);
        }
      },
      onDelta: (answer, turnId) => {
        if (!alive || round !== speechRound) return;
        if (!latest) {
          trace("düşünme", "yanıt akmaya başladı");
          view.turn(turnId);
        }
        latest = answer;
        try {
          handOn(turnId);
        } catch (error) {
          trace("düşünme", `akış seslendirilemedi: ${String(error)}`);
        }
      },
      onReply: async (answer, turnId) => {
        clearAck();
        if (!alive || round !== speechRound) return;
        trace("düşünme", `yanıt geldi (${answer.length} karakter${handed ? `, ${handed} satırı söyleniyor` : ""})`);
        view.turn(turnId);
        try {
          await headline;
          if (!alive || round !== speechRound) return;
          // What the streamed lines have not covered yet, with the answer's closing lines.
          const rest = script(answer, maxWords).slice(handed);
          answering = false;
          clearThinkLimit();
          if (rest.length) hand(rest, turnId);
          lastSpoken = { script: handedScript, turnId };
          if (!lastBatch) {
            void listenNow(false);
            return;
          }
          if (await lastBatch) void listenNow(false);
        } catch (error) {
          void recover(round, `yanıt okunamadı: ${String(error)}`);
        }
      },
      onFail: async (failure) => {
        clearAck();
        if (!alive || round !== speechRound) return;
        trace("düşünme", `yanıt hatası: ${failure}`);
        answering = false;
        clearThinkLimit();
        try {
          await headline;
          if (!alive || round !== speechRound) return;
          view.message(failure);
          void haptic("reject");
          const finished = await say(script(failureLine(language, resultSaid)), null);
          if (!alive || round !== speechRound) return;
          // The conversation goes on: the user can ask again right away.
          if (finished) void listenNow(false);
          else go("idle");
        } catch (error) {
          trace("düşünme", `hata bildirilemedi: ${String(error)}`);
          if (alive && round === speechRound) go("idle");
        }
      },
      onCancel: () => {
        if (!alive || round !== speechRound) return;
        answering = false;
        clearAck();
        clearThinkLimit();
        void listenNow(false);
      },
    };
    // An answer the user talked over may still be on its way; the chat takes one question at a
    // time, so this one goes as soon as that one lands (the "Bir saniye." covers the wait).
    const attempt = (tries: number) => {
      if (!alive || round !== speechRound) return;
      if (ask()?.(text, options)) {
        trace("düşünme", `soru gönderildi${tries < 48 ? ` (${48 - tries}. denemede)` : ""}`);
        return;
      }
      if (tries > 0) {
        window.setTimeout(() => attempt(tries - 1), 250);
        return;
      }
      trace("düşünme", "sohbet meşgul, soru gönderilemedi");
      answering = false;
      clearAck();
      clearThinkLimit();
      go("idle");
      view.message(tr ? "Önceki yanıt hâlâ bekleniyor; birazdan tekrar dokun." : "Still waiting for the last answer; tap again in a moment.");
    };
    attempt(48);
  };

  const obey = async (command: VoiceCommand) => {
    const round = ++speechRound;
    const thenListen = (completed: boolean) => {
      if (completed && alive && round === speechRound) void listenNow(false);
    };
    switch (command) {
      case "repeat":
        if (lastSpoken) thenListen(await say([...script(commandReply("repeat", language)), ...lastSpoken.script], lastSpoken.turnId));
        else thenListen(await say(script(commandReply("nothing", language)), null));
        return;
      case "slower":
      case "faster": {
        const current = prefs();
        const step = command === "slower" ? -0.1 : 0.1;
        const rate = Math.round(Math.min(1.25, Math.max(0.8, current.rate + step)) * 100) / 100;
        const atLimit = rate === current.rate;
        if (!atLimit) {
          const next = { ...current, rate };
          saveVoicePrefs(next);
          view.prefs(next);
        }
        const reply = atLimit ? (command === "slower" ? "slowest" : "fastest") : command;
        thenListen(await say(script(commandReply(reply, language)), null));
        return;
      }
      case "stop":
        void listenNow(false);
        return;
      case "bye":
        await say(script(farewell(language)), null);
        if (alive) view.close();
        return;
    }
  };

  const begin = async () => {
    const hour = new Date().getHours();
    // Iris always speaks first, so the user hears it is there: a greeting the first time, a
    // short "Dinliyorum." after that. Said at once when it is on the phone; otherwise the natural
    // voice gets a few seconds, then the phone's voice says it.
    const opening = greet ? greeting(language, hour) : cue(language);
    const completed = await say(script(opening), null, { firstPieceTimeoutMs: 7000 });
    // Cut short by a tap: the tap already started listening.
    if (!alive || !completed) return;
    void listenNow(false);
    // The lines said around answers, made ready in the natural voice while the user talks.
    prefetchLines(
      [
        ...acknowledgementLines("action", language),
        ...acknowledgementLines("compute", language),
        ...acknowledgementLines("think", language),
        ...recurringResultLines(language),
        ...cueLines(language),
        ...greetingLines(language, hour),
        ...farewellLines(language),
      ],
      language
    );
  };
  // Deferred a tick so the first state change happens outside the screen's effect.
  const first = window.setTimeout(() => void begin(), 0);

  return {
    tap: () => {
      if (state === "speaking" || state === "thinking") interrupt(false);
      else if (state === "hearing" || state === "waiting") endTurn(!spoken());
      else if (state === "listening") {
        view.message(tr ? "Seni dinliyorum; konuşmaya başlayabilirsin." : "I'm listening; go ahead.");
      } else if (state === "paused" || state === "idle" || state === "error") {
        // A muted microphone is the microphone button's to turn back on.
        if (muted) return;
        view.message(null);
        void listenNow(false);
      }
    },
    send: () => {
      if (state !== "hearing" && state !== "waiting" && state !== "listening") return;
      endTurn(!spoken());
    },
    setMuted: (on) => {
      muted = on;
      if (on) {
        if (state === "listening" || state === "hearing" || state === "waiting") {
          stopListening();
          buffer = "";
          heard = "";
          view.caption(null);
          go("paused");
        } else if (state === "idle" || state === "error") go("paused");
      } else if (state === "paused" || state === "idle" || state === "error") {
        view.message(null);
        void listenNow(false);
      }
    },
    suspend: () => {
      if (!alive || suspended) return;
      suspended = true;
      speechRound += 1;
      answering = false;
      clearAck();
      clearThinkLimit();
      stopListening();
      buffer = "";
      heard = "";
      stopSpeaking();
      go("paused");
    },
    resume: () => {
      if (!alive || !suspended) return;
      suspended = false;
      if (muted) return;
      view.message(null);
      void listenNow(false);
    },
    stop: () => {
      alive = false;
      window.clearTimeout(first);
      clearAck();
      clearThinkLimit();
      clearTimers();
      listenRound += 1;
      session?.cancel();
      session = null;
      speechRound += 1;
      stopSpeaking();
    },
  };
}
