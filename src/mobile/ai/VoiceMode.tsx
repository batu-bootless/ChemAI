"use client";

// Chem+ app: the voice mode of Iris, the app's AI, full screen - laid out like ChatGPT's voice screen, with a
// pair of animated lab goggles where its orb would be (Goggles.tsx).
//
// The conversation itself runs in voiceEngine.ts; this screen shows it. The goggles say whose turn
// it is and move with whoever is talking; live captions follow both sides (the AI's words light up
// as they are said); and when an answer comes with the engine's result cards or runs long, a panel
// rises with the cards and the written answer while the goggles step back to make room, so a
// result can be heard and read at once. Below: microphone, captions, type instead, end.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Captions, CaptionsOff, Check, ChevronDown, ChevronLeft, ChevronUp, Headphones, Keyboard, Mic, MicOff, Settings2, X } from "lucide-react";
import RichText from "@/components/ai/RichText";
import { answerText } from "@/lib/ai/answerCards";
import { ToolCards } from "@/components/ai/ToolCards";
import type { ChatTurn } from "@/components/ai/useAiConversation";
import { unlockAudio } from "@/lib/ai/naturalVoice";
import { warmAi } from "@/lib/ai/warm";
import { headphonesConnected, keepAwake, readVoicePrefs, saveVoicePrefs, type VoiceLanguage, type VoicePrefs } from "@/lib/ai/voice";
import { useEscape } from "@/mobile/ui/brutal";
import { useL } from "@/mobile/i18n";
import type { GogglesMode, Loudness } from "./Goggles";
import RobertAvatar from "./RobertAvatar";
import VoiceSettings from "./VoiceSettings";
import { startVoiceEngine, type Ask, type Caption, type EngineState, type EngineView, type VoiceEngine } from "./voiceEngine";

export type { Ask };

// A greeting opens the first voice conversation of an app session, not every one.
const once = { greeted: false };

const GLOW: Record<GogglesMode, string> = {
  listen: "rgba(79,125,243,0.26)",
  hear: "rgba(79,125,243,0.38)",
  think: "rgba(246,190,80,0.34)",
  speak: "rgba(143,108,246,0.40)",
  rest: "rgba(160,160,180,0.22)",
  error: "rgba(240,120,110,0.34)",
};

function visualOf(state: EngineState): GogglesMode {
  switch (state) {
    case "speaking":
      return "speak";
    case "thinking":
      return "think";
    case "hearing":
    case "waiting":
      return "hear";
    case "listening":
      return "listen";
    case "error":
      return "error";
    default:
      return "rest";
  }
}

export default function VoiceMode({
  askRef,
  prepareRef,
  messages,
  language,
  greet,
  onClose,
  onType,
  onSpeaking,
}: {
  /** The conversation's latest send; a ref so every turn uses the current conversation. */
  askRef: React.RefObject<Ask | null>;
  /** Plans a question ahead while the user is finishing it (the conversation's `prepare`). */
  prepareRef?: React.RefObject<((text: string) => void) | null>;
  /** The chat's turns, to show the answer being talked about. */
  messages: ChatTurn[];
  language: VoiceLanguage;
  /** The conversation is empty: a greeting may open it. */
  greet: boolean;
  onClose: () => void;
  /** Leave voice mode for the keyboard. */
  onType: () => void;
  /** Which answer is being read out, so the chat can mark it. */
  onSpeaking: (turnId: string | null) => void;
}) {
  const l = useL();
  const reduce = useReducedMotion();
  const [state, setState] = useState<EngineState>("starting");
  const [caption, setCaption] = useState<Caption | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [patience, setPatience] = useState<{ ms: number; key: number } | null>(null);
  const [turnId, setTurnId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [panelHidden, setPanelHidden] = useState(false);
  const [muted, setMuted] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>(() => readVoicePrefs());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headphones, setHeadphones] = useState(false);
  const level = useRef<Loudness>({ value: 0, at: 0 });
  const engine = useRef<VoiceEngine | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEscape(!settingsOpen, onClose);

  useEffect(() => {
    const shouldGreet = greet && !once.greeted;
    if (shouldGreet) once.greeted = true;
    const view: EngineView = {
      state: setState,
      caption: setCaption,
      level: (value, shape) => {
        level.current = { value, at: performance.now(), shape };
      },
      turn: (id) => {
        setTurnId(id);
        setPanelHidden(false);
      },
      speaking: (id) => {
        setSpeakingId(id);
        onSpeaking(id);
      },
      message: setMessage,
      patience: (ms) => setPatience(ms === null ? null : { ms, key: performance.now() }),
      prefs: setPrefs,
      close: onClose,
    };
    const created = startVoiceEngine({ language, ask: () => askRef.current, prepare: () => prepareRef?.current ?? null, view, greet: shouldGreet });
    engine.current = created;
    // Opened by a tap: the moment a browser allows sound to start.
    unlockAudio();
    // The way to the website, the answer's server and Azure's token, made ready before the first question.
    warmAi({ voice: true });
    dialog.current?.focus({ preventScroll: true });
    void keepAwake(true);
    return () => {
      created.stop();
      engine.current = null;
      void keepAwake(false);
      onSpeaking(null);
    };
    // The engine is built once per opening; closing and reopening starts a fresh conversation loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In the background the conversation holds still: nothing is said, the microphone is released.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) engine.current?.suspend();
      else engine.current?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Headphones decide whether talking over an answer interrupts it; checked as each answer starts.
  useEffect(() => {
    if (state !== "speaking" && state !== "starting") return;
    let alive = true;
    void headphonesConnected().then((value) => {
      if (alive) setHeadphones(value);
    });
    return () => {
      alive = false;
    };
  }, [state]);

  const visual = visualOf(state);
  const turn = turnId ? messages.find((item) => item.id === turnId) : undefined;
  const hasCards = Boolean(turn?.tools?.some((outcome) => outcome.ok));
  const panelAvailable = Boolean(turn) && (hasCards || (turn?.content.length ?? 0) > 240);
  const panelOpen = panelAvailable && !panelHidden;
  const canInterruptByVoice = headphones && prefs.bargeIn;

  const status =
    state === "starting"
      ? l("Hazırlanıyor…", "Getting ready…")
      : state === "listening"
        ? l("Dinliyorum", "Listening")
        : state === "hearing"
          ? l("Dinliyorum…", "Listening…")
          : state === "waiting"
            ? l("Devam edebilirsin", "Go on")
            : state === "thinking"
              ? l("Düşünüyor", "Thinking")
              : state === "speaking"
                ? canInterruptByVoice
                  ? l("Konuşuyor · araya girebilirsin", "Speaking · talk to interrupt")
                  : l("Konuşuyor · kesmek için dokun", "Speaking · tap to interrupt")
                : state === "paused"
                  ? l("Mikrofon kapalı", "Microphone off")
                  : state === "error"
                    ? l("Bir sorun oldu", "Something went wrong")
                    : l("Konuşmak için dokun", "Tap to talk");

  const tapLabel =
    state === "speaking"
      ? l("Sözünü kes", "Interrupt")
      : state === "thinking"
        ? l("Beklemeyi bırak, beni dinle", "Stop waiting and listen")
        : state === "hearing" || state === "waiting"
        ? l("Sorumu gönder", "Send my question")
        : state === "paused" || state === "idle" || state === "error"
          ? l("Dinlemeye başla", "Start listening")
          : l("İris sesli asistan", "Iris voice assistant");

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    engine.current?.setMuted(next);
  };

  const toggleCaptions = () => {
    const next = { ...readVoicePrefs(), captions: !prefs.captions };
    saveVoicePrefs(next);
    setPrefs(next);
  };

  const spring = { type: "spring" as const, stiffness: 260, damping: 30 };

  return (
    <motion.div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={l("Sesli sohbet", "Voice chat")}
      className="app-light fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#F6F6F9] pb-[var(--app-safe-bottom)] pt-[var(--app-safe-top)] outline-none"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* The room: the chat's soft light in Iris's colours, and a glow in the colour of the moment. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-28 size-[340px] rounded-full bg-[#8F6CF6]/[0.13] blur-3xl" />
        <div className="absolute -right-28 top-24 size-[300px] rounded-full bg-[#4F7DF3]/[0.12] blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 size-[320px] rounded-full bg-[#E0679A]/[0.1] blur-3xl" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{ background: `radial-gradient(70% 45% at 50% ${panelOpen ? "16%" : "40%"}, ${GLOW[visual]} 0%, rgba(246,246,249,0) 72%)` }}
      />

      <header className="relative z-10 flex items-center gap-2 px-4 pt-3">
        {/* Back to the chat, like the chat's own back button. */}
        <RoundButton small label={l("Sohbete dön", "Back to the chat")} onClick={onClose}>
          <ChevronLeft className="size-[21px]" strokeWidth={2.4} />
        </RoundButton>
        {canInterruptByVoice && (
          <span className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-[#5B5B69] shadow-[0_0_0_1px_rgb(20_20_40/0.06)]">
            <Headphones className="size-3.5" strokeWidth={2.2} />
            {l("Kulaklık", "Headphones")}
          </span>
        )}
        <span className="flex-1" />
        <RoundButton small label={l("Ses ayarları", "Voice settings")} onClick={() => setSettingsOpen(true)}>
          <Settings2 className="size-[18px]" strokeWidth={2.6} />
        </RoundButton>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-4">
        <div className={`flex w-full flex-col items-center ${panelOpen ? "shrink-0 pt-1" : "flex-1 justify-center pb-4"}`}>
          <motion.div
            layout={!reduce}
            transition={spring}
            className={panelOpen ? "w-[34%] max-w-[150px]" : "w-[78%] max-w-[300px]"}
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <RobertAvatar
              mode={visual}
              level={level}
              mood={caption?.who === "ai" ? caption.mood : undefined}
              label={tapLabel}
              onTap={() => (muted ? toggleMute() : engine.current?.tap())}
            />
          </motion.div>
          <p
            className={`mt-4 flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.02em] ${state === "thinking" ? "iris-shimmer" : "text-[#6B6B78]"}`}
            role="status"
            aria-live="polite"
          >
            {status}
          </p>
          {prefs.captions && <LiveCaption caption={caption} compact={panelOpen} />}
          {message && <p className="mt-2 max-w-md text-center text-[13px] font-medium leading-snug text-[#A23A2B]">{message}</p>}
        </div>

        <AnimatePresence mode="popLayout">
          {panelOpen && turn && <ResultPanel key={turn.id} turn={turn} speaking={speakingId === turn.id} onHide={() => setPanelHidden(true)} />}
        </AnimatePresence>
        {panelAvailable && panelHidden && (
          <button
            type="button"
            onClick={() => setPanelHidden(false)}
            className="app-glass-light app-glass-light-button mb-1 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-[#1C1C22]"
          >
            <ChevronUp className="relative z-[2] size-4" strokeWidth={2.6} />
            <span className="relative z-[2]">{l("Sonucu göster", "Show the result")}</span>
          </button>
        )}
      </div>

      {/* "Done, send" while the user talks; it fills as the pause that will send it runs out. */}
      <div className="relative z-10 flex h-14 shrink-0 items-end justify-center">
        <AnimatePresence>
          {(state === "hearing" || state === "waiting") && (
            <motion.button
              key="send"
              type="button"
              onClick={() => engine.current?.send()}
              className="app-glass-light app-glass-light-button relative overflow-hidden rounded-full px-5 py-2.5 text-[14px] font-semibold text-[#1C1C22]"
              initial={reduce ? false : { opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
            >
              {patience && state === "waiting" && (
                <motion.span
                  key={patience.key}
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0"
                  style={{ background: "rgb(143 108 246 / 0.22)" }}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: patience.ms / 1000, ease: "linear" }}
                />
              )}
              <span className="relative z-[2] flex items-center gap-1.5">
                <Check className="size-4" strokeWidth={2.6} />
                {state === "waiting" ? l("Gönderiyorum — devam edebilirsin", "Sending — keep talking if you like") : l("Bitti, gönder", "Done, send")}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <nav className="relative z-10 flex shrink-0 items-center justify-center gap-4 px-4 pb-5 pt-3" aria-label={l("Sesli sohbet kontrolleri", "Voice chat controls")}>
        <RoundButton label={muted ? l("Mikrofonu aç", "Unmute") : l("Mikrofonu kapat", "Mute")} onClick={toggleMute} fill={muted ? "#FDE3E1" : undefined} pressed={muted}>
          {muted ? <MicOff className="size-6" strokeWidth={2.5} /> : <Mic className="size-6" strokeWidth={2.5} />}
        </RoundButton>
        <RoundButton
          label={prefs.captions ? l("Altyazıyı gizle", "Hide captions") : l("Altyazıyı göster", "Show captions")}
          onClick={toggleCaptions}
          fill={prefs.captions ? "#EDE6FD" : undefined}
          pressed={prefs.captions}
        >
          {prefs.captions ? <Captions className="size-6" strokeWidth={2.4} /> : <CaptionsOff className="size-6" strokeWidth={2.4} />}
        </RoundButton>
        <RoundButton label={l("Yazarak sor", "Type instead")} onClick={onType}>
          <Keyboard className="size-6" strokeWidth={2.4} />
        </RoundButton>
        <RoundButton label={l("Sesli sohbeti bitir", "End voice chat")} onClick={onClose} dark>
          <X className="size-6" strokeWidth={3} />
        </RoundButton>
      </nav>

      <VoiceSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} language={language} onChange={setPrefs} />
    </motion.div>
  );
}

function RoundButton({
  label,
  onClick,
  fill,
  pressed,
  dark,
  small,
  children,
}: {
  label: string;
  onClick: () => void;
  fill?: string;
  pressed?: boolean;
  dark?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`grid shrink-0 place-items-center rounded-full ${small ? "size-10" : "size-[60px]"} ${
        dark ? "app-glass-ink text-white" : "app-glass-light app-glass-light-button text-[#2A2A33]"
      }`}
      style={fill && !dark ? { backgroundColor: fill } : undefined}
    >
      <span className="relative z-[2] grid place-items-center">{children}</span>
    </button>
  );
}

/** What is being said right now: the user's words as they are recognised, or the AI's sentence lighting up. */
function LiveCaption({ caption, compact }: { caption: Caption | null; compact: boolean }) {
  const l = useL();
  const size = compact ? "text-[15px] line-clamp-2" : "text-[19px] line-clamp-4";
  if (!caption || !caption.text) return <div aria-hidden="true" className={compact ? "min-h-[1.5em]" : "min-h-[3em]"} />;
  if (caption.who === "user") {
    return (
      <p aria-hidden="true" className={`mt-2 max-w-md text-center font-bold leading-snug text-[#111]/60 ${size}`}>
        <span className="mr-1.5 rounded-full bg-[#1C1C22]/[0.06] px-1.5 py-[1px] align-[2px] text-[10px] font-bold uppercase tracking-[0.08em] text-[#5B5B69]">
          {l("Sen", "You")}
        </span>
        {caption.text}
      </p>
    );
  }
  const parts = caption.text.split(/(\s+)/);
  // The running count of words up to each part, so the first `lit` words can be lit.
  const counts = parts.reduce<number[]>((list, part) => [...list, (list[list.length - 1] ?? 0) + (part.trim() ? 1 : 0)], []);
  const lit = Math.round(caption.progress * (counts[counts.length - 1] ?? 0));
  return (
    <p aria-hidden="true" className={`mt-2 max-w-md text-center font-extrabold leading-snug tracking-tight ${size}`}>
      {parts.map((part, index) =>
        part.trim() ? (
          <span key={index} className={`transition-colors duration-150 ${counts[index] <= lit ? "text-[#111]" : "text-[#111]/30"}`}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </p>
  );
}

/** The answer being talked about: the engine's cards and the written reply, readable while it is spoken. */
function ResultPanel({ turn, speaking, onHide }: { turn: ChatTurn; speaking: boolean; onHide: () => void }) {
  const l = useL();
  const reduce = useReducedMotion();
  return (
    <motion.section
      className="app-glass-light relative mb-1 mt-3 flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden rounded-[26px]"
      initial={reduce ? false : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
    >
      <div className="relative z-[2] flex shrink-0 items-center gap-2 border-b border-[#1C1C22]/[0.07] px-4 py-2.5">
        <span className="text-[12px] font-semibold text-[#7A7A86]">{l("Sonuç ve yanıt", "Result and answer")}</span>
        {speaking && (
          <span className="rounded-full bg-[#EDE6FD] px-2.5 py-0.5 text-[11px] font-semibold text-[#5B3FC4]">{l("Okunuyor", "Reading aloud")}</span>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onHide} aria-label={l("Sonucu gizle", "Hide the result")} className="grid size-8 place-items-center rounded-full text-[#6B6B78] active:bg-[#1C1C22]/[0.06]">
          <ChevronDown className="size-5" strokeWidth={2.4} />
        </button>
      </div>
      <div className="relative z-[2] min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-3">
        {turn.tools && turn.tools.length > 0 && <ToolCards outcomes={turn.tools} />}
        {turn.content ? (
          <div className="px-1">
            {/* A text-chat answer drawn as cards on the chat screen reads as sentences here. */}
            <RichText text={answerText(turn.content)} ink />
          </div>
        ) : turn.pending ? (
          <p className="iris-shimmer px-1 text-[14px] font-semibold">{l("Açıklama yazılıyor…", "Writing the explanation…")}</p>
        ) : null}
      </div>
    </motion.section>
  );
}
