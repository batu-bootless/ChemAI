"use client";

// ChemAI: hands-free lab mode ("Eller serbest") - a protocol run by voice, for gloved hands at the
// bench, like the voice lab assistants of electronic lab notebooks (LabVoice, ELN voice capture),
// and something general AI chats do not do. Iris reads each step out as it comes and listens for:
//
//   "tamam / bitti / sonraki"      the step is done (the next one is read)
//   "geri / önceki"                back one step
//   "tekrar oku"                   the step again
//   "zamanlayıcıyı başlat"         the step's timer starts (it rings and notifies like any timer)
//   "ne kadar kaldı"               what is left on the running timers
//   "not al: …"                    a voice note, kept in the step with the time
//   "malzemeler"                   the materials, read out
//   "duraklat" / "devam"           the run's clock
//   "sustur"                       a ringing timer
//   "çık"                          hands-free mode ends
//
// Anything else is a question: Iris answers it about this step (the device's engine computes what it
// can first), spoken as it is written. Commands never wait for the network.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { askAi } from "@/lib/ai/client";
import { cleanReply, composeWire, fallbackPlan, runCalls, streamingReply } from "@/lib/ai/assistant";
import { voiceScript, voiceScriptSoFar } from "@/lib/ai/personality";
import { trace } from "@/lib/ai/trace";
import { keepAwake, listen, prepareSpeech, readVoicePrefs, speakScript, stopSpeaking, type Listening } from "@/lib/ai/voice";
import { warmAi } from "@/lib/ai/warm";
import { onTimers, silenceTimers, timerLeft, timerRinging } from "@/lib/agent/timers";
import type { Protocol, Step } from "@/lib/protocols/model";
import { useL } from "@/mobile/i18n";
import { CloseIcon, VoiceIcon } from "../icons";
import { IRIS } from "../theme";
import { blockTimer, startBlockTimer } from "./StepBlocks";

type Status = "speaking" | "listening" | "thinking" | "idle";
type Language = "tr" | "en";

type Command = "done" | "back" | "repeat" | "timer" | "left" | "note" | "materials" | "pause" | "resume" | "silence" | "exit";

const ACTION_TOOLS = new Set(["timer", "note", "protocol", "inventory_add", "lab_report", "graph"]);

/** What a short utterance asks for; null when it is a question for Iris. */
export function handsFreeCommand(raw: string, paused: boolean): Command | null {
  const t = raw.toLocaleLowerCase("tr").replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^(not al|not et|kaydet|take a note|note)\b/.test(t)) return "note";
  // Commands are short; a longer sentence with one of these words in it is a question.
  if (t.split(" ").length > 5) return null;
  if (/(^| )(çık|kapat|modu kapat|sesli modu kapat|eller serbesti kapat|exit|stop hands free)( |$)/.test(t)) return "exit";
  if (/(sustur|sus|alarmı kapat|silence|stop the alarm)/.test(t)) return "silence";
  if (/(ne kadar kaldı|kaç dakika kaldı|kaç saniye kaldı|kalan süre|süre ne kadar|how long|time left)/.test(t)) return "left";
  if (/(zamanlayıcı|sayaç|süreyi|timer)/.test(t) && /(başlat|kur|çalıştır|start|set)/.test(t)) return "timer";
  if (/^(başlat|start)$/.test(t)) return paused ? "resume" : "timer";
  if (/(duraklat|mola|bekle|pause)/.test(t)) return "pause";
  if (/(malzeme|neler lazım|ne lazım|materials)/.test(t)) return "materials";
  if (/(tekrar oku|tekrar et|yeniden oku|bir daha oku|tekrar|anlamadım|repeat|read again|say again)/.test(t)) return "repeat";
  if (/(geri|önceki|bir önceki|geri al|back|previous|undo)/.test(t)) return "back";
  if (/^devam( et)?$|^continue$|^resume$/.test(t)) return paused ? "resume" : "done";
  if (/(tamam|bitti|tamamlandı|sonraki|ileri|geç|oldu|hallettim|yaptım|next|done|finished|okay|ok)/.test(t)) return "done";
  return null;
}

function stepText(step: Step, position: number, total: number, language: Language, withHint: boolean): string {
  const tr = language === "tr";
  const plain = (text: string) => text.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // A title that is only the start of its description is not said twice.
  const repeats = Boolean(step.description) && plain(step.description).startsWith(plain(step.title));
  const title = repeats ? "" : ` ${step.title.trim().replace(/([^.!?])$/, "$1.")}`;
  const head = tr ? `Adım ${position}, ${total} adımdan.${title}` : `Step ${position} of ${total}.${title}`;
  const body = step.description ? ` ${step.description.trim().replace(/([^.!?])$/, "$1.")}` : "";
  const timers = step.blocks.filter((block) => block.kind === "timer" && block.seconds);
  const timer = timers.length
    ? tr
      ? ` Bu adımda ${Math.round((timers[0].seconds ?? 0) / 60) || 1} dakikalık bir süre var; hazır olunca "zamanlayıcıyı başlat" de.`
      : ` This step has a ${Math.round((timers[0].seconds ?? 0) / 60) || 1} minute timer; say "start the timer" when ready.`
    : "";
  const hint = withHint ? (tr ? ' Bitince "tamam" de.' : ' Say "done" when finished.') : "";
  return `${head}${body}${timer}${hint}`;
}

function minutesText(seconds: number, language: Language): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (language === "en") return m ? `${m} minute${m === 1 ? "" : "s"}${s ? ` ${s} seconds` : ""}` : `${s} seconds`;
  return m ? `${m} dakika${s ? ` ${s} saniye` : ""}` : `${s} saniye`;
}

export default function HandsFree({
  protocol,
  current,
  position,
  total,
  paused,
  finished,
  onDone,
  onBack,
  onResume,
  onPause,
  onNote,
  onClose,
}: {
  protocol: Protocol;
  current: Step | null;
  position: number;
  total: number;
  paused: boolean;
  finished: boolean;
  onDone: () => void;
  onBack: () => void;
  onResume: () => void;
  onPause: () => void;
  onNote: (text: string) => void;
  onClose: () => void;
}) {
  const l = useL();
  const reduce = useReducedMotion();
  const language: Language = l("tr", "en") === "en" ? "en" : "tr";
  const [status, setStatus] = useState<Status>("idle");
  const [heard, setHeard] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // The latest screen state for the loop below, which outlives renders.
  const now = useRef({ protocol, current, position, total, paused, finished, onDone, onBack, onResume, onPause, onNote, onClose });
  now.current = { protocol, current, position, total, paused, finished, onDone, onBack, onResume, onPause, onNote, onClose };

  const alive = useRef(true);
  const round = useRef(0);
  const session = useRef<Listening | null>(null);
  const silence = useRef(0);
  const announced = useRef<string | null>(null);

  const stopListening = () => {
    window.clearTimeout(silence.current);
    session.current?.cancel();
    session.current = null;
  };

  const script = (text: string) => {
    const prefs = readVoicePrefs();
    return voiceScript(text, language, { persona: prefs.persona, rate: prefs.rate, maxWords: 90 });
  };

  /** Says something, then listens again (unless something newer took over). */
  const say = async (text: string) => {
    const mine = ++round.current;
    stopListening();
    stopSpeaking();
    setStatus("speaking");
    try {
      await speakScript(script(text), language);
    } catch {
      // no voice: the words are on screen as the step
    }
    if (alive.current && mine === round.current) void listenNow();
  };

  const listenNow = async () => {
    if (!alive.current) return;
    const mine = round.current;
    stopListening();
    setStatus("listening");
    const started = await listen(
      language,
      {
        onPartial: (text) => {
          if (!alive.current || mine !== round.current) return;
          setHeard(text);
          // The browser's recognizer listens on; a short quiet after the words ends the command.
          window.clearTimeout(silence.current);
          silence.current = window.setTimeout(() => session.current?.finish(), 1100);
        },
        onFinal: (text) => {
          if (!alive.current || mine !== round.current) return;
          session.current = null;
          window.clearTimeout(silence.current);
          if (text.trim()) void handle(text.trim());
          else window.setTimeout(() => mine === round.current && void listenNow(), 250);
        },
        onError: (code) => {
          if (!alive.current || mine !== round.current) return;
          session.current = null;
          if (code === "PERMISSION" || code === "PERMISSION_DENIED" || code === "UNAVAILABLE") {
            setStatus("idle");
            setMessage(l("Mikrofon kullanılamıyor; komutlar için izin ver.", "The microphone can't be used; allow it for voice commands."));
            return;
          }
          // Quiet at the bench is normal: listen on.
          window.setTimeout(() => mine === round.current && void listenNow(), code === "NO_MATCH" || code === "SPEECH_TIMEOUT" ? 200 : 900);
        },
      },
      1200
    );
    if (!alive.current || mine !== round.current) started.cancel();
    else session.current = started;
  };

  const announce = (withHint: boolean) => {
    const state = now.current;
    if (!state.current) return;
    announced.current = state.current.id;
    void say(stepText(state.current, state.position, state.total, language, withHint));
  };

  const timerOfStep = () => {
    const step = now.current.current;
    return step?.blocks.find((block) => block.kind === "timer" && block.seconds) ?? null;
  };

  const handle = async (text: string) => {
    const state = now.current;
    setHeard(text);
    setMessage(null);
    const command = handsFreeCommand(text, state.paused);
    trace("eller serbest", `${command ?? "soru"}: ${text.slice(0, 60)}`);
    switch (command) {
      case "done":
        if (!state.current) return say(l("Bütün adımlar tamam.", "Every step is done."));
        state.onDone();
        return; // the next step is read when it comes up
      case "back":
        if (state.position <= 1) return say(l("Bu ilk adım.", "This is the first step."));
        state.onBack();
        return;
      case "repeat":
        return announce(false);
      case "resume":
        state.onResume();
        return announce(false);
      case "pause":
        state.onPause();
        return say(l('Duraklattım. Devam etmek için "devam" de.', 'Paused. Say "continue" to go on.'));
      case "timer": {
        const block = timerOfStep();
        if (!block) return say(l("Bu adımda zamanlayıcı yok.", "This step has no timer."));
        const running = blockTimer(state.protocol.id, block.id);
        if (running) return say(l(`Zamanlayıcı zaten çalışıyor; ${minutesText(timerLeft(running), language)} kaldı.`, `The timer is already running; ${minutesText(timerLeft(running), language)} left.`));
        startBlockTimer(state.protocol.id, block, l("Süre", "Timer"));
        return say(l(`${minutesText(block.seconds ?? 0, language)} başladı. Bitince haber vereceğim.`, `${minutesText(block.seconds ?? 0, language)} started. I'll tell you when it's up.`));
      }
      case "left": {
        const lines = state.protocol.steps
          .flatMap((step) => step.blocks.filter((block) => block.kind === "timer").map((block) => ({ block, timer: blockTimer(state.protocol.id, block.id) })))
          .filter((entry) => entry.timer);
        if (lines.length === 0) return say(l("Çalışan bir zamanlayıcı yok.", "No timer is running."));
        return say(lines.map((entry) => `${entry.block.label || l("Süre", "Timer")}: ${minutesText(timerLeft(entry.timer!), language)}${l(" kaldı", " left")}.`).join(" "));
      }
      case "note": {
        const body = text.replace(/^\s*(not al|not et|kaydet|take a note|note)\s*[:,-]?\s*/i, "").trim();
        if (!body) return say(l('Notu "not al" dedikten sonra söyle.', 'Say the note right after "take a note".'));
        state.onNote(body);
        return say(l("Not bu adıma eklendi.", "Note added to this step."));
      }
      case "materials":
        return say(
          state.protocol.materials.length
            ? `${l("Malzemeler", "Materials")}: ${state.protocol.materials.join(", ")}.`
            : l("Bu protokolde malzeme listesi yok.", "This protocol has no materials list.")
        );
      case "silence":
        silenceTimers();
        return listenNow();
      case "exit":
        await say(l("Eller serbest mod kapandı.", "Hands-free mode is off."));
        state.onClose();
        return;
      default:
        return askIris(text);
    }
  };

  /** A question about the step in hand: the engine's instant results, then Iris, spoken as written. */
  const askIris = async (question: string) => {
    const mine = ++round.current;
    stopListening();
    setStatus("thinking");
    const state = now.current;
    const step = state.current;
    const next = step ? state.protocol.steps[state.protocol.steps.indexOf(step) + 1] : undefined;
    const context = [
      l(
        "Sen ChemAI'ın asistanı İris'sin. Kullanıcı şu an laboratuvarda, elleri eldivenli ve meşgul; seninle sesle konuşarak bir protokolü adım adım yürütüyor.",
        "You are Iris, ChemAI's assistant. The user is at the lab bench with gloved, busy hands, running a protocol step by step and talking to you by voice."
      ),
      `${l("Protokol", "Protocol")}: ${state.protocol.title}${state.protocol.description ? ` — ${state.protocol.description}` : ""}`,
      step ? `${l("Şu anki adım", "Current step")} (${state.position}/${state.total}): ${step.title}${step.description ? ` — ${step.description}` : ""}` : "",
      next ? `${l("Sonraki adım", "Next step")}: ${next.title}` : "",
      state.protocol.materials.length ? `${l("Malzemeler", "Materials")}: ${state.protocol.materials.join(", ")}` : "",
      l(
        "Soruyu bu adımın bağlamında, kısa ve konuşur gibi yanıtla. Güvenlik önemliyse tek net cümleyle söyle. Emin olmadığın bir değeri uydurma.",
        "Answer in the context of this step, briefly and conversationally. If safety matters, say it in one clear sentence. Never invent a value you are unsure of."
      ),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const quick = fallbackPlan(question).filter((call) => !ACTION_TOOLS.has(call.tool));
      const outcomes = quick.length ? await runCalls(quick, language) : [];
      const wire = composeWire({ question, outcomes, voice: true });
      const prefs = readVoicePrefs();
      const delivery = { persona: prefs.persona, rate: prefs.rate, maxWords: 80 };
      let handed = 0;
      let chain: Promise<unknown> = Promise.resolve();
      const hand = (segments: ReturnType<typeof voiceScript>) => {
        if (!segments.length || mine !== round.current) return;
        handed += segments.length;
        prepareSpeech(segments, language);
        setStatus("speaking");
        chain = chain.then(() => (mine === round.current ? speakScript(segments, language) : undefined));
      };
      const reply = await askAi([{ role: "user", content: wire }], {
        context,
        temperature: 0.5,
        timeoutMs: 45_000,
        onText: (raw) => {
          if (handed === 0) hand(voiceScriptSoFar(streamingReply(raw), language, delivery).slice(0, 1));
        },
      });
      if (mine !== round.current) return;
      hand(voiceScript(cleanReply(reply, outcomes), language, delivery).slice(handed));
      await chain;
    } catch (error) {
      if (mine !== round.current) return;
      trace("eller serbest", `soru yanıtlanamadı: ${error instanceof Error ? error.message : String(error)}`);
      await speakScript(script(l("Şu an yanıt alamadım; komutlar çalışmaya devam ediyor.", "I couldn't get an answer right now; the commands still work.")), language).catch(() => undefined);
    }
    if (alive.current && mine === round.current) void listenNow();
  };

  // Starts: the run's clock, the screen kept on, the way to Iris opened, and the step read out.
  useEffect(() => {
    alive.current = true;
    void keepAwake(true);
    warmAi({ voice: true });
    if (now.current.paused) now.current.onResume();
    const intro = l(
      'Eller serbest mod açık. Adımları okuyacağım; bitince "tamam", geri dönmek için "geri", soru sormak için doğrudan sor.',
      'Hands-free mode is on. I\'ll read each step; say "done" when finished, "back" to go back, or just ask a question.'
    );
    const first = now.current.current;
    announced.current = first?.id ?? null;
    void say(first ? `${intro} ${stepText(first, now.current.position, now.current.total, language, false)}` : intro);
    return () => {
      alive.current = false;
      round.current += 1;
      window.clearTimeout(silence.current);
      session.current?.cancel();
      session.current = null;
      stopSpeaking();
      void keepAwake(false);
    };
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The next step is read out as soon as it is the step in hand (by voice or by tap).
  useEffect(() => {
    if (!alive.current) return;
    if (finished) {
      void (async () => {
        await say(l("Protokol tamamlandı. Eline sağlık!", "Protocol complete. Well done!"));
        now.current.onClose();
      })();
      return;
    }
    if (current && current.id !== announced.current) announce(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, finished]);

  // A timer of this protocol that runs out is said out loud (it rings and notifies as well).
  useEffect(() => {
    const ringing = new Set<string>();
    return onTimers(() => {
      for (const step of now.current.protocol.steps) {
        for (const block of step.blocks) {
          if (block.kind !== "timer") continue;
          const timer = blockTimer(now.current.protocol.id, block.id);
          if (!timer || !timerRinging(timer.id) || ringing.has(timer.id)) continue;
          ringing.add(timer.id);
          void say(l(`Süre doldu: ${block.label || step.title}. Susturmak için "sustur" de.`, `Time's up: ${block.label || step.title}. Say "silence" to stop the alarm.`));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText =
    status === "speaking"
      ? l("İris konuşuyor · dokun ve konuş", "Iris is speaking · tap to talk")
      : status === "thinking"
        ? l("Düşünüyor…", "Thinking…")
        : status === "listening"
          ? l("Dinliyorum", "Listening")
          : l("Dinlemek için dokun", "Tap to listen");

  const chips: [string, string, () => void][] = [
    [l("Tamam", "Done"), "done", () => void handle(l("tamam", "done"))],
    [l("Geri", "Back"), "back", () => void handle(l("geri", "back"))],
    [l("Tekrar oku", "Repeat"), "repeat", () => void handle(l("tekrar oku", "repeat"))],
    ...(timerOfStep() ? ([[l("Zamanlayıcı", "Timer"), "timer", () => void handle(l("zamanlayıcıyı başlat", "start the timer"))]] as [string, string, () => void][]) : []),
  ];

  return (
    <motion.div
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(var(--app-safe-bottom)+12px)]"
      initial={reduce ? false : { y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
    >
      <div className="rounded-[28px] bg-white px-4 pb-3 pt-3 shadow-[0_8px_32px_rgb(0_0_0/0.14),0_0_0_1px_rgb(0_0_0/0.05)]" role="region" aria-label={l("Eller serbest mod", "Hands-free mode")}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              round.current += 1;
              stopSpeaking();
              void listenNow();
            }}
            aria-label={l("Konuş", "Talk")}
            className="relative grid size-12 shrink-0 place-items-center rounded-full text-white"
            style={{ background: status === "listening" ? IRIS.blue : status === "thinking" ? "#8E8E98" : "#1F1F1F" }}
          >
            {status === "listening" && !reduce && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{ background: IRIS.blue }}
                animate={{ scale: [1, 1.35], opacity: [0.35, 0] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <VoiceIcon size={24} className="relative" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-[#0B0B0C]" role="status" aria-live="polite">
              {l("Eller serbest", "Hands-free")} · <span style={{ color: IRIS.sub }}>{statusText}</span>
            </p>
            <p className="truncate text-[13.5px]" style={{ color: IRIS.sub }}>
              {message ?? (heard ? `“${heard}”` : l('"tamam", "geri", "tekrar oku", "zamanlayıcıyı başlat", "not al: …" ya da bir soru', '"done", "back", "repeat", "start the timer", "take a note: …" or a question'))}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={l("Eller serbest modu kapat", "Turn off hands-free mode")} className="grid size-10 shrink-0 place-items-center rounded-full text-[#0B0B0C]" style={{ background: IRIS.row }}>
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="mt-2.5 flex gap-2 overflow-x-auto">
          {chips.map(([label, id, run]) => (
            <button key={id} type="button" onClick={run} className="shrink-0 rounded-full px-3.5 py-1.5 text-[14px] text-[#0B0B0C]" style={{ background: IRIS.row }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
