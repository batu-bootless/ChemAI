"use client";

// Chem+ app: the voice settings of Iris, the app's AI - which engine and voice, what character, how fast, how long a
// pause ends a question, and whether talking over an answer interrupts it. Saved on the device;
// the voice engine reads them on every turn, so a change applies to the next sentence.

import { useEffect, useState } from "react";
import { Check, Headphones, Loader2, Play, Settings2 } from "lucide-react";
import { PERSONAS, voiceScript, type Persona } from "@/lib/ai/personality";
import { NATURAL_VOICES, clearNaturalVoicePause, naturalVoicePauseReason, naturalVoicePausedFor } from "@/lib/ai/naturalVoice";
import { DEFAULT_PREFS, listVoices, readVoicePrefs, saveVoicePrefs, speakScript, stopSpeaking, type VoiceLanguage, type VoiceOption, type VoicePrefs } from "@/lib/ai/voice";
import { INK_COLORS, InkChip, InkSheet } from "@/mobile/ui/brutal";
import { useL } from "@/mobile/i18n";
import TraceLog from "./TraceLog";

const RATES: { value: number; tr: string; en: string }[] = [
  { value: 0.9, tr: "Yavaş", en: "Slow" },
  { value: 1, tr: "Normal", en: "Normal" },
  { value: 1.12, tr: "Hızlı", en: "Quick" },
];

const PATIENCE: { value: number; tr: string; en: string }[] = [
  { value: 1300, tr: "Kısa", en: "Short" },
  { value: 2200, tr: "Normal", en: "Normal" },
  { value: 3600, tr: "Uzun", en: "Long" },
];

const PERSONA_ORDER: Persona[] = ["warm", "lively", "calm"];

export default function VoiceSettings({
  open,
  onClose,
  language,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  language: VoiceLanguage;
  onChange?: (prefs: VoicePrefs) => void;
}) {
  const l = useL();
  return (
    <InkSheet open={open} onClose={onClose} title={l("Ses ayarları", "Voice settings")} icon={<Settings2 className="size-[18px]" strokeWidth={2.6} />}>
      {/* Mounted only while open, so every opening reads the current list and choices. */}
      <SettingsBody language={language} onChange={onChange} />
    </InkSheet>
  );
}

/** Whether the natural voice is resting after a failure, why, and a way to try it again now. */
function NaturalVoiceStatus() {
  const l = useL();
  const [left, setLeft] = useState(() => naturalVoicePausedFor());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(naturalVoicePausedFor()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (left <= 0) return null;
  const reason = naturalVoicePauseReason();
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border-2 border-[#111]/15 bg-[#FFF4D6] px-3 py-2">
      <p className="min-w-0 flex-1 text-[11.5px] font-bold leading-snug text-[#111]/70">
        {l(
          `Doğal ses ${Math.ceil(left / 1000)} sn dinleniyor, bu arada telefonun sesi konuşuyor${reason ? ` (${reason})` : ""}.`,
          `The natural voice rests for ${Math.ceil(left / 1000)} s; the phone's voice speaks meanwhile${reason ? ` (${reason})` : ""}.`
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          clearNaturalVoicePause();
          setLeft(0);
        }}
        className="shrink-0 rounded-lg border-2 border-[#111] bg-white px-2 py-1 text-[11.5px] font-extrabold text-[#111]"
      >
        {l("Şimdi dene", "Try now")}
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-4 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#111]/55 first:mt-0">{children}</p>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[12px] font-semibold leading-snug text-[#111]/60">{children}</p>;
}

function SettingsBody({ language, onChange }: { language: VoiceLanguage; onChange?: (prefs: VoicePrefs) => void }) {
  const l = useL();
  const [prefs, setPrefs] = useState<VoicePrefs>(() => (typeof window === "undefined" ? DEFAULT_PREFS : readVoicePrefs()));
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listVoices(language).then(
      (list) => alive && setVoices(list),
      () => alive && setFailed(true)
    );
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, [language]);

  const update = (patch: Partial<VoicePrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveVoicePrefs(next);
    onChange?.(next);
  };

  const preview = async (key: string, override: Partial<VoicePrefs>) => {
    stopSpeaking();
    if ({ ...prefs, ...override }.engine === "natural") clearNaturalVoicePause();
    setPreviewing(key);
    const next = { ...prefs, ...override };
    try {
      await speakScript(
        voiceScript(
          l(
            "Merhaba, ben İris. Asetik asit çözeltisinin pH'ı yaklaşık 2,88 çıkıyor. Yani zayıf bir asit; moleküllerin çok azı iyonlaşıyor. İstersen nasıl hesapladığımı anlatayım?",
            "Hi, I'm Iris. The acetic acid solution comes out at a pH of about 2.88. So it's a weak acid; only a few molecules ionise. Shall I walk you through how I got it?"
          ),
          language,
          { persona: next.persona, rate: next.rate }
        ),
        language,
        {},
        { prefs: next }
      );
    } finally {
      setPreviewing((current) => (current === key ? null : current));
    }
  };

  return (
    <div className="max-h-[64vh] overflow-y-auto pb-1">
      <SectionLabel>{l("Ses motoru", "Voice engine")}</SectionLabel>
      <div className="space-y-1.5">
        <VoiceRow
          selected={prefs.engine === "natural"}
          title={l("Doğal ses — önerilen", "Natural voice — recommended")}
          detail={l("Azure'un doğal sesi, en insan gibi · internet gerekir", "Azure's natural voice, the most human · needs internet")}
          natural
          previewing={previewing === "engine:natural"}
          onSelect={() => {
            clearNaturalVoicePause();
            update({ engine: "natural" });
          }}
          onPreview={() => void preview("engine:natural", { engine: "natural" })}
        />
        <VoiceRow
          selected={prefs.engine === "device"}
          title={l("Telefonun sesi", "The phone's voice")}
          detail={l("Çevrimdışı da çalışır · daha mekanik", "Works offline · more mechanical")}
          previewing={previewing === "engine:device"}
          onSelect={() => update({ engine: "device" })}
          onPreview={() => void preview("engine:device", { engine: "device" })}
        />
      </div>

      {prefs.engine === "natural" ? (
        <>
          <SectionLabel>{l("İris'in sesi", "Iris's voice")}</SectionLabel>
          <Hint>
            {l(
              "İris Azure'un doğal sesiyle konuşur (aşağıdan seçilir). Azure yanıt veremezse Google Gemini'nin sesine, o da olmazsa telefonun sesine kendiliğinden geçer.",
              "Iris speaks with Azure's natural voice (chosen below). If Azure cannot answer it moves to Google Gemini's voice, then to the phone's voice, by itself."
            )}
          </Hint>
          <NaturalVoiceStatus />
          <div className="space-y-1.5">
            {NATURAL_VOICES.map((voice) => (
              <VoiceRow
                key={voice.id}
                selected={prefs.naturalVoice === voice.id}
                title={l(voice.tr, voice.en)}
                detail={l(voice.detailTr, voice.detailEn)}
                previewing={previewing === `natural:${voice.id}`}
                onSelect={() => update({ naturalVoice: voice.id })}
                onPreview={() => void preview(`natural:${voice.id}`, { engine: "natural", naturalVoice: voice.id })}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <SectionLabel>{l("Telefon sesi", "Phone voice")}</SectionLabel>
          <Hint>
            {l(
              "Doğal (sinirsel) sesler Google'ın internetli sesleridir. Liste telefonundaki sesleri gösterir.",
              "Natural (neural) voices are Google's online voices. The list shows your phone's voices."
            )}
          </Hint>
          <div className="space-y-1.5">
            {!voices && !failed && (
              <p className="flex items-center gap-2 py-3 text-[13px] font-bold text-[#111]/55">
                <Loader2 className="size-4 animate-spin" /> {l("Sesler yükleniyor…", "Loading voices…")}
              </p>
            )}
            {failed && <p className="py-2 text-[13px] font-bold text-[#111]/55">{l("Ses listesi alınamadı.", "The voice list couldn't be read.")}</p>}
            {voices && (
              <VoiceRow
                selected={!prefs.voice}
                title={l("Otomatik — en doğal ses", "Automatic — most natural voice")}
                detail={l("İnternet varken doğal ses, yokken en iyi yüklü ses", "Natural voice when online, best installed voice offline")}
                previewing={previewing === "voice:"}
                onSelect={() => update({ voice: "" })}
                onPreview={() => void preview("voice:", { engine: "device", voice: "" })}
              />
            )}
            {voices?.map((voice) => (
              <VoiceRow
                key={voice.id}
                selected={prefs.voice === voice.id}
                title={voice.label}
                detail={voice.detail}
                natural={voice.natural}
                previewing={previewing === `voice:${voice.id}`}
                onSelect={() => update({ voice: voice.id })}
                onPreview={() => void preview(`voice:${voice.id}`, { engine: "device", voice: voice.id })}
              />
            ))}
            {voices && voices.length === 0 && (
              <Hint>
                {l(
                  "Bu dil için yüklü ses yok. Ayarlar → Erişilebilirlik → Metin okuma çıkışı'ndan Google ses verisini indirebilirsin.",
                  "No voice is installed for this language. Download Google's voice data under Settings → Accessibility → Text-to-speech output."
                )}
              </Hint>
            )}
          </div>
        </>
      )}

      <SectionLabel>{l("Ses karakteri", "Character")}</SectionLabel>
      <Hint>{l("Tonlama, tempo ve duraklamalar. Dinlemek için bir karaktere dokun.", "Intonation, tempo and pauses. Tap one to hear it.")}</Hint>
      <div className="grid grid-cols-3 gap-2">
        {PERSONA_ORDER.map((persona) => {
          const info = PERSONAS[persona];
          const active = prefs.persona === persona;
          return (
            <button
              key={persona}
              type="button"
              onClick={() => {
                update({ persona });
                void preview(`persona:${persona}`, { persona });
              }}
              aria-pressed={active}
              className={`rounded-xl border-2 px-2 py-2 text-left transition active:scale-[0.98] ${active ? "border-[#111] shadow-[2px_2px_0_#111]" : "border-[#111]/15"}`}
              style={{ background: active ? INK_COLORS.purple.soft : "#fff" }}
            >
              <span className="flex items-center gap-1 text-[13.5px] font-extrabold text-[#111]">
                {l(info.tr, info.en)}
                {previewing === `persona:${persona}` && <Loader2 className="size-3 animate-spin" />}
              </span>
              <span className="mt-0.5 block text-[10.5px] font-bold leading-tight text-[#111]/55">{l(info.hintTr, info.hintEn)}</span>
            </button>
          );
        })}
      </div>

      <SectionLabel>{l("Konuşma hızı", "Speaking pace")}</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {RATES.map((rate) => (
          <InkChip key={rate.value} active={Math.abs(prefs.rate - rate.value) < 0.06} onClick={() => update({ rate: rate.value })} color="purple">
            {l(rate.tr, rate.en)}
          </InkChip>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] font-semibold text-[#111]/50">
        {l("Konuşurken “daha yavaş” ya da “daha hızlı” da diyebilirsin.", "You can also just say “slower” or “faster”.")}
      </p>

      <SectionLabel>{l("Sözümü kesmeden önce bekle", "Wait before answering")}</SectionLabel>
      <Hint>
        {l(
          "Konuşmanda ne kadar uzun bir sessizlik, sorunun bittiği anlamına gelsin? Cümlen yarım kaldıysa (“ve…”, “ile…”) İris ayrıca daha uzun bekler.",
          "How long a pause means your question is finished? When a sentence is left hanging (“and…”), Iris waits longer anyway."
        )}
      </Hint>
      <div className="flex flex-wrap gap-2">
        {PATIENCE.map((option) => (
          <InkChip key={option.value} active={prefs.patienceMs === option.value} onClick={() => update({ patienceMs: option.value })} color="green">
            {l(option.tr, option.en)}
          </InkChip>
        ))}
      </div>

      <SectionLabel>{l("Sesle araya girme", "Interrupt by voice")}</SectionLabel>
      <button
        type="button"
        role="switch"
        aria-checked={prefs.bargeIn}
        onClick={() => update({ bargeIn: !prefs.bargeIn })}
        className="flex w-full items-center gap-3 rounded-xl border-2 border-[#111]/15 bg-white px-3 py-2.5 text-left"
      >
        <Headphones className="size-5 shrink-0 text-[#111]" strokeWidth={2.4} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-extrabold text-[#111]">{l("Kulaklıkla konuşarak kes", "Talk over it with headphones")}</span>
          <span className="block text-[11.5px] font-bold leading-snug text-[#111]/55">
            {l(
              "Kulaklık takılıyken İris konuşurken sen konuşmaya başlarsan susar ve seni dinler. Hoparlörde İris'e dokunarak kesebilirsin.",
              "With headphones on, start talking and Iris stops to listen. On the speaker, tap Iris instead."
            )}
          </span>
        </span>
        <span
          className={`relative h-6 w-11 shrink-0 rounded-full border-2 border-[#111] transition-colors ${prefs.bargeIn ? "" : "bg-white"}`}
          style={prefs.bargeIn ? { background: INK_COLORS.green.fill } : undefined}
        >
          <span className={`absolute top-0.5 size-4 rounded-full border-2 border-[#111] bg-white transition-all ${prefs.bargeIn ? "left-[22px]" : "left-0.5"}`} />
        </span>
      </button>

      <SectionLabel>{l("Tanılama kaydı", "Diagnostic log")}</SectionLabel>
      <Hint>
        {l(
          "İris'in son adımları: sunucuya ne sorduğu, her adımın ne kadar sürdüğü, sesin ne yaptığı. Bir sorun olursa kopyalayıp gönderebilirsin; telefondan başka yere gitmez.",
          "Iris's last steps: what it asked the server, how long each step took, what the voice did. If something goes wrong, copy and send it; it stays on the phone otherwise."
        )}
      </Hint>
      <TraceLog />
    </div>
  );
}

function VoiceRow({
  selected,
  title,
  detail,
  natural,
  previewing,
  onSelect,
  onPreview,
}: {
  selected: boolean;
  title: string;
  detail: string;
  natural?: boolean;
  previewing: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const l = useL();
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 ${selected ? "border-[#111]" : "border-[#111]/15"}`}
      style={{ background: selected ? INK_COLORS.purple.soft : "#fff" }}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 border-[#111] ${selected ? "bg-[#111]" : "bg-white"}`}>
          {selected && <Check className="size-3 text-white" strokeWidth={3.5} />}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-[#111]">
            <span className="truncate">{title}</span>
            {natural && (
              <span className="shrink-0 rounded-md border-2 border-[#111] px-1 text-[9.5px] font-extrabold uppercase" style={{ background: INK_COLORS.green.fill }}>
                {l("doğal", "natural")}
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] font-bold text-[#111]/50">{detail}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onPreview}
        aria-label={l("Dinle", "Preview")}
        className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-[#111] bg-white text-[#111]"
      >
        {previewing ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" strokeWidth={2.6} fill="currentColor" />}
      </button>
    </div>
  );
}
