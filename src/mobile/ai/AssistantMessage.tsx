"use client";

// Chem+ app: one Iris answer on the full AI screen, laid out like ChatGPT's and Gemini's: Iris's
// mark beside the answer, no bubble around it - the engine's cards first (the proof), then the
// AI's prose, then quiet actions under it: listen, copy, report.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Copy, Loader2, Square, Volume2, Zap } from "lucide-react";
import { LogoMark } from "@/mobile/brand/Wordmark";
import RichText from "@/components/ai/RichText";
import ReportAiReplyButton from "@/components/ai/ReportAiReplyButton";
import { SafetyRow, VerificationRow } from "@/components/ai/TrustRow";
import { ToolCards } from "@/components/ai/ToolCards";
import type { ChatTurn } from "@/components/ai/useAiConversation";
import { unlockAudio } from "@/lib/ai/naturalVoice";
import { speak, stopSpeaking } from "@/lib/ai/voice";
import type { Intent } from "@/lib/ai/assistant";
import { useL, useLocale } from "@/mobile/i18n";

/** The planner's reading of a question, shown as small tags above the answer. */
const INTENT_LABELS: Record<Intent, [string, string]> = {
  genel: ["Genel kimya", "General chemistry"],
  hesap: ["Hesaplama", "Calculation"],
  stokiyometri: ["Stokiyometri", "Stoichiometry"],
  yapi: ["Molekül yapısı", "Structure"],
  reaksiyon: ["Reaksiyon", "Reaction"],
  denklestirme: ["Denkleştirme", "Balancing"],
  ph: ["pH / asit-baz", "pH / acid-base"],
  tampon: ["Tampon", "Buffer"],
  titrasyon: ["Titrasyon", "Titration"],
  denge: ["Denge", "Equilibrium"],
  kinetik: ["Kinetik", "Kinetics"],
  termodinamik: ["Termodinamik", "Thermodynamics"],
  elektrokimya: ["Elektrokimya", "Electrochemistry"],
  organik: ["Organik", "Organic"],
  anorganik: ["Anorganik", "Inorganic"],
  analitik: ["Analitik", "Analytical"],
  biyokimya: ["Biyokimya", "Biochemistry"],
  spektroskopi: ["Spektroskopi", "Spectroscopy"],
  kromatografi: ["Kromatografi", "Chromatography"],
  malzeme: ["Malzeme / polimer", "Materials"],
  ekipman: ["Ekipman", "Equipment"],
  prosedur: ["Deney prosedürü", "Procedure"],
  veri: ["Veri analizi", "Data analysis"],
  grafik: ["Grafik", "Graph"],
  gorsel: ["Görsel", "Image"],
  ocr: ["Etiket / OCR", "Label / OCR"],
  literatur: ["Literatür", "Literature"],
  birim: ["Birim dönüşümü", "Units"],
  guvenlik: ["Güvenlik", "Safety"],
  rapor: ["Rapor", "Report"],
  egitim: ["Eğitim", "Learning"],
};

/**
 * Iris's face: the ChemPlus logo (the flask mark) in a disc. While Iris works, a ring in Iris's
 * colours turns around it.
 */
export function AiAvatar({ size = 30, spinning = false }: { size?: number; spinning?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden="true" className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {spinning && !reduce && (
        <motion.span
          className="absolute -inset-[3px] rounded-full"
          style={{ background: "conic-gradient(from 0deg, #4F7DF3, #8F6CF6, #E0679A, rgb(224 103 154 / 0) 70%, #4F7DF3)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "linear" }}
        />
      )}
      <span className="relative grid size-full place-items-center rounded-full bg-white shadow-[0_3px_10px_-4px_rgb(30_20_60/0.4)] ring-1 ring-[#1C1C22]/[0.08]">
        {/* The logo's "AI." on its rays, inside the disc (public/brand/chemai-mark.svg). */}
        <LogoMark className="size-[66%]" />
      </span>
    </span>
  );
}

export default function AssistantMessage({ turn, speakingId, onSpeak }: { turn: ChatTurn; speakingId: string | null; onSpeak: (id: string | null) => void }) {
  const l = useL();
  const locale = useLocale();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const speaking = speakingId === turn.id;

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const listen = async () => {
    if (speaking) {
      stopSpeaking();
      onSpeak(null);
      return;
    }
    onSpeak(turn.id);
    unlockAudio();
    try {
      await speak(turn.content, locale.startsWith("en") ? "en" : "tr");
    } finally {
      onSpeak(null);
    }
  };

  return (
    <motion.div
      className="flex items-start gap-3"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="mt-0.5">
        <AiAvatar size={28} spinning={turn.pending && !turn.content} />
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        {turn.intents && turn.intents.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label={l("Soru türü", "Question type")}>
            {turn.intents.map((intent) => (
              <span key={intent} className="rounded-full bg-[#EEEDF5] px-2.5 py-[3px] text-[11px] font-semibold text-[#5B5B69]">
                {l(...INTENT_LABELS[intent])}
              </span>
            ))}
          </div>
        )}
        {turn.restoring && (
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#8E8E98]">
            <Loader2 className="size-3.5 animate-spin" />
            {l("Hesap kartları yeniden oluşturuluyor…", "Rebuilding the result cards…")}
          </p>
        )}
        {turn.quick && turn.pending && (
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#1E7B34]">
            <Zap className="size-3.5" strokeWidth={2.4} />
            {l("Anında sonuç · cihazda hesaplandı, İris planı tamamlıyor", "Instant result · computed on the device, Iris is finishing the plan")}
          </p>
        )}
        {turn.tools && turn.tools.length > 0 && <ToolCards outcomes={turn.tools} />}
        {turn.content ? (
          <div className="relative text-[#1C1C22]">
            {speaking && <SpeakingTag label={l("Okunuyor", "Reading aloud")} />}
            <RichText text={turn.content} ink />
          </div>
        ) : turn.pending ? (
          <p className="iris-shimmer pt-1 text-[14.5px] font-semibold">
            {speaking
              ? l("Sonucu söylüyorum; açıklama yazılıyor…", "Saying the result; the explanation is being written…")
              : l("Açıklama yazılıyor…", "Writing the explanation…")}
          </p>
        ) : turn.local ? (
          <p className="rounded-2xl bg-[#F1F0F6] px-3.5 py-2.5 text-[12.5px] font-medium leading-snug text-[#5B5B69]">
            {l(
              "Sonuçlar cihazdaki hesap motorundan. Yapay zekâ açıklaması şu an alınamadı.",
              "These results come from the engine on the device. The AI's explanation couldn't be fetched right now."
            )}
          </p>
        ) : null}
        {!turn.pending && turn.verification && <VerificationRow verification={turn.verification} />}
        {!turn.pending && turn.safety && <SafetyRow scan={turn.safety} />}
        {turn.content && !turn.pending && (
          <div className="-ml-1.5 flex items-center gap-0.5">
            <ActionButton onClick={listen} label={speaking ? l("Durdur", "Stop") : l("Dinle", "Listen")} active={speaking}>
              {speaking ? <Square className="size-3.5" strokeWidth={3} fill="currentColor" /> : <Volume2 className="size-[18px]" strokeWidth={2} />}
            </ActionButton>
            <ActionButton
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(turn.content);
                  setCopied(true);
                } catch {
                  // clipboard blocked: nothing to do
                }
              }}
              label={copied ? l("Kopyalandı", "Copied") : l("Kopyala", "Copy")}
            >
              {copied ? <Check className="size-[18px] text-[#1E7B34]" strokeWidth={2.6} /> : <Copy className="size-[17px]" strokeWidth={2} />}
            </ActionButton>
            <span className="[&_button]:size-9 [&_button]:rounded-full [&_button]:text-[#6B6B78]">
              <ReportAiReplyButton text={turn.content} />
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** A small "reading aloud" tag with moving bars, pinned to the answer being spoken. */
function SpeakingTag({ label }: { label: string }) {
  const reduce = useReducedMotion();
  return (
    <span className="app-glass-light mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#4B3A8A]">
      <span className="flex h-2.5 items-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-[#8F6CF6]"
            animate={reduce ? undefined : { height: [3, 10, 5, 9, 3] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }}
            style={{ height: 6 }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

function ActionButton({ onClick, label, active, children }: { onClick: () => void; label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-full transition active:scale-90 active:bg-[#1C1C22]/[0.06] ${
        active ? "bg-[#EDE6FD] text-[#5B3FC4]" : "text-[#6B6B78]"
      }`}
    >
      {children}
    </button>
  );
}
