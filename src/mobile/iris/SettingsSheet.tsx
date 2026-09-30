"use client";

// ChemAI: "ChemAI Ayarları", the settings sheet of the menu's gear - laid out as the Gemini app's
// settings sheet (the user's reference screenshot): a grab handle, a round blue ✓, a large title
// and white grouped cards on the iOS grey. The rows are Iris's own; each opens a page inside the
// sheet.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";
import { readTimerPrefs, writeTimerPrefs, type TimerPrefs } from "@/components/timer/timerPrefs";
import { LEVELS, STYLES, saveIrisPrefs, savePersonal, useIrisPrefs, usePersonal } from "@/lib/ai/irisPrefs";
import { refreshHistory, useHistory } from "@/lib/ai/historyStore";
import { NATURAL_VOICES, clearNaturalVoicePause } from "@/lib/ai/naturalVoice";
import { PERSONAS, voiceScript, type Persona } from "@/lib/ai/personality";
import { clearTrace, onTrace, readTrace, traceLine, traceText } from "@/lib/ai/trace";
import { usageSummary } from "@/lib/ai/usage";
import { DEFAULT_PREFS as DEFAULT_VOICE, listVoices, readVoicePrefs, saveVoicePrefs, speakScript, stopSpeaking, type VoiceOption, type VoicePrefs } from "@/lib/ai/voice";
import { listDocuments } from "@/lib/library/documents";
import { clearMedia, listMedia } from "@/lib/library/media";
import { listNotebooks } from "@/lib/notebooks/store";
import { notificationAccess, requestNotificationAccess, type NotificationAccess } from "@/mobile/deviceNotifications";
import Wordmark from "@/mobile/brand/Wordmark";
import { useL, useLocale } from "@/mobile/i18n";
import { setLanguagePreference, usePreferences } from "@/mobile/preferences";
import {
  BellIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FeedbackIcon,
  GlobeIcon,
  HelpIcon,
  HistoryIcon,
  InfoIcon,
  PersonSparkIcon,
  PulseIcon,
  RocketIcon,
  ShieldLockIcon,
  StorageIcon,
  StyleIcon,
  UsageIcon,
  VoiceIcon,
} from "./icons";
import { useOverlay } from "./useOverlay";
import { IRIS } from "./theme";

export type SettingsPage =
  | "usage"
  | "notifications"
  | "personal"
  | "style"
  | "voice"
  | "actions"
  | "activity"
  | "data"
  | "help"
  | "trace"
  | "about";

const CONTACT = "info@chemplus.com.tr";

// --- building blocks ---------------------------------------------------------------------------------

function Card({ children }: { children: ReactNode }) {
  return <div className="mx-4 overflow-hidden rounded-[24px] bg-white">{children}</div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-[9px] mt-[24px] pl-[34px] text-[15px] leading-5" style={{ color: IRIS.sectionInk }}>
      {children}
    </p>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mx-[34px] mt-2 text-[13px] leading-[18px]" style={{ color: IRIS.sectionInk }}>
      {children}
    </p>
  );
}

function Row({
  icon,
  label,
  detail,
  onClick,
  right,
  last,
  chevron = true,
}: {
  icon?: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  onClick?: () => void;
  right?: ReactNode;
  last?: boolean;
  chevron?: boolean;
}) {
  const body = (
    <>
      {icon && <span className="mr-[11px] grid size-6 shrink-0 place-items-center text-[#0B0B0C]">{icon}</span>}
      <span className={`flex min-h-[53.5px] min-w-0 flex-1 items-center gap-2 py-2 pr-5 ${last ? "" : "border-b"}`} style={{ borderColor: IRIS.separator }}>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-[22px] text-[#0B0B0C]">{label}</span>
          {detail && (
            <span className="mt-0.5 block text-[13.5px] leading-[18px]" style={{ color: IRIS.sectionInk }}>
              {detail}
            </span>
          )}
        </span>
        {right}
        {onClick && chevron && !right && <ChevronRightIcon size={18} strokeWidth={2.2} style={{ color: IRIS.chevron }} />}
      </span>
    </>
  );
  const className = `flex w-full items-center text-left ${icon ? "pl-[17px]" : "pl-5"}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} active:bg-[#F4F4F6]`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!on);
      }}
      className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200"
      style={{ background: on ? IRIS.done : "#E3E3E8" }}
    >
      <span
        className="absolute top-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)] transition-all duration-200"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  );
}

function ToggleRow({ label, detail, on, onChange, icon, last }: { label: string; detail?: ReactNode; on: boolean; onChange: (value: boolean) => void; icon?: ReactNode; last?: boolean }) {
  return <Row icon={icon} label={label} detail={detail} last={last} right={<Toggle on={on} onChange={onChange} label={label} />} />;
}

function Radio({ selected }: { selected: boolean }) {
  return selected ? <CheckIcon size={20} strokeWidth={2.2} style={{ color: IRIS.done }} /> : <span className="size-5" />;
}

function ChoiceRow({ label, detail, selected, onClick, last, extra }: { label: string; detail?: ReactNode; selected: boolean; onClick: () => void; last?: boolean; extra?: ReactNode }) {
  return <Row label={label} detail={detail} last={last} onClick={onClick} chevron={false} right={<span className="flex items-center gap-2">{extra}<Radio selected={selected} /></span>} />;
}

function Field({ label, value, onChange, placeholder, multiline, max }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean; max: number }) {
  return (
    <label className="block px-5 py-3">
      <span className="mb-1 block text-[13px] font-medium" style={{ color: IRIS.sectionInk }}>
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          maxLength={max}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="block w-full resize-none bg-transparent text-[16px] leading-[22px] text-[#0B0B0C] outline-none placeholder:text-[#B5B3B6]"
        />
      ) : (
        <input
          value={value}
          maxLength={max}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="block w-full bg-transparent text-[16px] leading-[22px] text-[#0B0B0C] outline-none placeholder:text-[#B5B3B6]"
        />
      )}
    </label>
  );
}

// --- the sheet ------------------------------------------------------------------------------------------

export default function SettingsSheet({ initialPage, onClose }: { initialPage?: SettingsPage; onClose: () => void }) {
  const l = useL();
  const reduce = useReducedMotion();
  const [stack, setStack] = useState<SettingsPage[]>(initialPage ? [initialPage] : []);
  const page = stack[stack.length - 1];
  const push = (next: SettingsPage) => setStack((current) => [...current, next]);
  const back = () => setStack((current) => current.slice(0, -1));
  useOverlay(true, () => (stack.length ? back() : onClose()));

  const titles: Record<SettingsPage, string> = {
    usage: l("Kullanım", "Usage"),
    notifications: l("Bildirimler", "Notifications"),
    personal: l("Kişisel bağlam", "Personal context"),
    style: l("Yanıt tarzı ve dil", "Answer style and language"),
    voice: l("Ses", "Voice"),
    actions: l("Eylemler ve otomasyon", "Actions and automation"),
    activity: l("İris etkinliği", "Iris activity"),
    data: l("Cihaz verileri", "Data on this device"),
    help: l("Yardım", "Help"),
    trace: l("Tanılama kaydı", "Diagnostic log"),
    about: l("Hakkında", "About"),
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[80] bg-black/25"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={l("ChemAI Ayarları", "ChemAI settings")}
        className="iris-ui fixed inset-x-0 bottom-0 z-[81] flex flex-col overflow-hidden rounded-t-[34px] shadow-[0_-10px_40px_-12px_rgb(0_0_0/0.25)]"
        style={{ top: "calc(var(--app-safe-top) + 6px)", background: IRIS.sheet }}
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 40 }}
      >
        <div className="mx-auto mt-[6px] h-[5px] w-9 shrink-0 rounded-full bg-[#C7C7CC]" aria-hidden="true" />
        <div className="relative flex h-[58px] shrink-0 items-center px-4">
          {page ? (
            <>
              <button
                type="button"
                onClick={back}
                aria-label={l("Geri", "Back")}
                className="grid size-11 place-items-center rounded-full bg-white/80 text-[#0B0B0C] shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_2px_8px_-3px_rgb(0_0_0/0.18)] active:scale-95"
              >
                <ChevronLeftIcon size={22} strokeWidth={2} />
              </button>
              <p className="pointer-events-none absolute inset-x-16 truncate text-center text-[17px] font-medium text-[#0B0B0C]">{titles[page]}</p>
            </>
          ) : (
            <span className="flex-1" />
          )}
          {!page && (
            <button
              type="button"
              onClick={onClose}
              aria-label={l("Bitti", "Done")}
              className="ml-auto grid size-11 place-items-center rounded-full text-white shadow-[inset_0_1px_1px_rgb(255_255_255/0.45),0_4px_12px_-4px_rgb(60_131_237/0.7)] active:scale-95"
              style={{ background: `radial-gradient(120% 90% at 50% 0%, #6BA2F5, ${IRIS.done} 60%)` }}
            >
              <CheckIcon size={24} strokeWidth={2.4} />
            </button>
          )}
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(var(--app-safe-bottom)+32px)]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={page ?? "root"}
              initial={reduce ? { opacity: 0 } : { x: stack.length ? 40 : -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {!page && <RootPage push={push} onClose={onClose} />}
              {page === "usage" && <UsagePage />}
              {page === "notifications" && <NotificationsPage />}
              {page === "personal" && <PersonalPage />}
              {page === "style" && <StylePage />}
              {page === "voice" && <VoicePage />}
              {page === "actions" && <ActionsPage />}
              {page === "activity" && <ActivityPage onClose={onClose} />}
              {page === "data" && <DataPage />}
              {page === "help" && <HelpPage onClose={onClose} />}
              {page === "trace" && <TracePage />}
              {page === "about" && <AboutPage onClose={onClose} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

function RootPage({ push, onClose }: { push: (page: SettingsPage) => void; onClose: () => void }) {
  const l = useL();
  const router = useRouter();
  return (
    <div>
      <h2 className="mb-[10px] pl-[18px] text-[28px] leading-[34px] text-[#0B0B0C]">
        <Wordmark height={27} className="mr-2 -translate-y-[3px]" />
        {l("Ayarları", "settings")}
      </h2>
      <Card>
        <Row icon={<UsageIcon />} label={l("Kullanım", "Usage")} onClick={() => push("usage")} last />
      </Card>

      <SectionTitle>{l("Tercihler", "Preferences")}</SectionTitle>
      <Card>
        <Row icon={<BellIcon />} label={l("Bildirimler", "Notifications")} onClick={() => push("notifications")} />
        <Row icon={<PersonSparkIcon />} label={l("Kişisel bağlam", "Personal context")} onClick={() => push("personal")} />
        <Row icon={<StyleIcon />} label={l("Yanıt tarzı ve dil", "Answer style and language")} onClick={() => push("style")} />
        <Row icon={<VoiceIcon />} label={l("Ses", "Voice")} onClick={() => push("voice")} />
        <Row icon={<RocketIcon />} label={l("Eylemler ve otomasyon", "Actions and automation")} onClick={() => push("actions")} last />
      </Card>

      <SectionTitle>{l("Veri ve gizlilik", "Data & privacy")}</SectionTitle>
      <Card>
        <Row icon={<HistoryIcon />} label={l("İris etkinliği", "Iris activity")} onClick={() => push("activity")} />
        <Row icon={<StorageIcon />} label={l("Cihaz verileri", "Data on this device")} onClick={() => push("data")} />
        <Row
          icon={<ShieldLockIcon />}
          label={l("Gizlilik", "Privacy")}
          onClick={() => {
            onClose();
            router.push("/gizlilik/");
          }}
          last
        />
      </Card>

      <SectionTitle>{l("Destek", "Get support")}</SectionTitle>
      <Card>
        <Row icon={<HelpIcon />} label={l("Yardım", "Help")} onClick={() => push("help")} />
        <Row
          icon={<FeedbackIcon />}
          label={l("Geri bildirim gönder", "Send feedback")}
          onClick={() => {
            window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent("ChemAI geri bildirim")}`;
          }}
        />
        <Row icon={<PulseIcon />} label={l("Tanılama kaydı", "Diagnostic log")} onClick={() => push("trace")} />
        <Row icon={<InfoIcon />} label={l("Hakkında", "About")} onClick={() => push("about")} last />
      </Card>
    </div>
  );
}

// --- pages ------------------------------------------------------------------------------------------------

function UsagePage() {
  const l = useL();
  const summary = useMemo(() => usageSummary(), []);
  const max = Math.max(1, ...summary.days.map((day) => day.questions));
  const stat = (value: number, label: string) => (
    <div className="flex-1 px-4 py-3">
      <p className="text-[26px] font-medium leading-8 text-[#0B0B0C]">{value}</p>
      <p className="text-[13px]" style={{ color: IRIS.sectionInk }}>
        {label}
      </p>
    </div>
  );
  return (
    <div className="pt-2">
      <Card>
        <div className="flex divide-x" style={{ borderColor: IRIS.separator }}>
          {stat(summary.today.questions, l("Bugün", "Today"))}
          {stat(summary.week.questions, l("Son 7 gün", "Last 7 days"))}
          {stat(summary.total.questions, l("Toplam", "Total"))}
        </div>
        <div className="flex h-[92px] items-end gap-[5px] border-t px-4 pb-3 pt-4" style={{ borderColor: IRIS.separator }} aria-label={l("Son 14 gün", "Last 14 days")}>
          {summary.days.map((day) => (
            <span key={day.key} className="flex-1 rounded-t-[4px]" style={{ height: `${Math.max(4, (day.questions / max) * 64)}px`, background: day.questions ? IRIS.done : "#E6E6EB" }} />
          ))}
        </div>
      </Card>
      <Note>{l("Günlük soru sayısı, son 14 gün.", "Questions per day, last 14 days.")}</Note>

      <SectionTitle>{l("İris'in yaptıkları", "What Iris did")}</SectionTitle>
      <Card>
        <Row label={l("Hesap motoru sonuçları", "Engine results")} right={<Count value={summary.total.tools} />} />
        <Row label={l("Hesapla doğrulanan değerler", "Values checked against the engine")} right={<Count value={summary.total.verified} />} />
        <Row label={l("Yapılan işler", "Actions done")} detail={l("Zamanlayıcı, not, protokol, rapor, grafik…", "Timers, notes, protocols, reports, graphs…")} right={<Count value={summary.total.actions} />} />
        <Row label={l("Fotoğraflı sorular", "Photo questions")} right={<Count value={summary.total.photos} />} />
        <Row label={l("Sesli sorular", "Spoken questions")} right={<Count value={summary.total.voice} />} last />
      </Card>
      <Note>
        {l(
          "Bu bilgiler yalnızca bu cihazda tutulur. İris'in yanıtları chemplus.com.tr sunucularında üretilir; yoğun kullanımda kısa süreli sınırlar uygulanabilir.",
          "These figures stay on this device. Iris's answers are made on chemplus.com.tr's servers; short limits may apply under heavy use."
        )}
      </Note>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <span className="text-[17px] tabular-nums" style={{ color: IRIS.sectionInk }}>{value}</span>;
}

function NotificationsPage() {
  const l = useL();
  const [access, setAccess] = useState<NotificationAccess | null>(null);
  const [prefs, setPrefs] = useState<TimerPrefs>(() => readTimerPrefs());
  useEffect(() => {
    void notificationAccess().then(setAccess);
  }, []);
  const update = (patch: Partial<TimerPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeTimerPrefs(next);
  };
  const status =
    access === "granted"
      ? l("Açık", "On")
      : access === "denied"
        ? l("Kapalı — telefonun ayarlarından açılır", "Off — turn on in the phone's settings")
        : access === "unsupported"
          ? l("Bu cihazda desteklenmiyor", "Not supported here")
          : access === "prompt"
            ? l("İzin verilmedi", "Not allowed yet")
            : "…";
  return (
    <div className="pt-2">
      <Card>
        <Row
          label={l("Cihaz bildirimleri", "Phone notifications")}
          detail={status}
          last
          right={
            access === "prompt" ? (
              <button
                type="button"
                onClick={async () => setAccess(await requestNotificationAccess())}
                className="rounded-full px-4 py-1.5 text-[15px] font-medium text-white"
                style={{ background: IRIS.done }}
              >
                {l("İzin ver", "Allow")}
              </button>
            ) : undefined
          }
        />
      </Card>
      <Note>
        {l(
          "İris'in kurduğu zamanlayıcılar bu izinle, uygulama kapalıyken bile haber verir.",
          "Timers Iris sets use this permission to alert you even when the app is closed."
        )}
      </Note>
      <SectionTitle>{l("Zamanlayıcı alarmı", "Timer alarm")}</SectionTitle>
      <Card>
        <ToggleRow label={l("Bildirim gönder", "Send a notification")} on={prefs.notify} onChange={(notify) => update({ notify })} />
        <ToggleRow label={l("Alarm sesi", "Alarm sound")} on={prefs.sound} onChange={(sound) => update({ sound })} />
        <ToggleRow label={l("Titreşim", "Vibrate")} on={prefs.vibrate} onChange={(vibrate) => update({ vibrate })} last />
      </Card>
    </div>
  );
}

function PersonalPage() {
  const l = useL();
  const personal = usePersonal();
  return (
    <div className="pt-2">
      <Card>
        <ToggleRow
          label={l("Kişisel bağlamı kullan", "Use personal context")}
          detail={l("İris anlatımını sana göre ayarlar", "Iris tailors its answers to you")}
          on={personal.enabled}
          onChange={(enabled) => savePersonal({ enabled })}
          last
        />
      </Card>
      <SectionTitle>{l("Düzeyin", "Your level")}</SectionTitle>
      <Card>
        {LEVELS.map((level, index) => (
          <ChoiceRow
            key={level.value}
            label={l(level.tr, level.en)}
            selected={personal.level === level.value}
            onClick={() => savePersonal({ level: personal.level === level.value ? "" : level.value })}
            last={index === LEVELS.length - 1}
          />
        ))}
      </Card>
      <SectionTitle>{l("Seni tanıması için", "So Iris knows you")}</SectionTitle>
      <Card>
        <Field
          label={l("Alanın", "Your field")}
          value={personal.field}
          max={80}
          placeholder={l("ör. analitik kimya, eczacılık", "e.g. analytical chemistry, pharmacy")}
          onChange={(field) => savePersonal({ field })}
        />
        <div className="mx-5 border-t" style={{ borderColor: IRIS.separator }} />
        <Field
          label={l("Laboratuvarın", "Your lab")}
          value={personal.lab}
          max={220}
          multiline
          placeholder={l("ör. UV-Vis ve pH metre var, çeker ocak yok", "e.g. UV-Vis and a pH meter, no fume hood")}
          onChange={(lab) => savePersonal({ lab })}
        />
        <div className="mx-5 border-t" style={{ borderColor: IRIS.separator }} />
        <Field
          label={l("Başka bilmesi gereken", "Anything else")}
          value={personal.about}
          max={220}
          multiline
          placeholder={l("ör. YKS'ye hazırlanıyorum; birimleri SI ile yaz", "e.g. preparing for exams; use SI units")}
          onChange={(about) => savePersonal({ about })}
        />
      </Card>
      <Note>
        {l(
          "Bu bilgiler yalnızca bu cihazda saklanır ve sorularına eklenerek İris'e gönderilir.",
          "Kept only on this device and sent to Iris with your questions."
        )}
      </Note>
    </div>
  );
}

function StylePage() {
  const l = useL();
  const personal = usePersonal();
  const preferences = usePreferences();
  return (
    <div className="pt-2">
      <SectionTitle>{l("Anlatım", "Explanations")}</SectionTitle>
      <Card>
        <ChoiceRow
          label={l("Dengeli", "Balanced")}
          detail={l("İris soruya göre karar verir", "Iris decides by the question")}
          selected={!personal.style}
          onClick={() => savePersonal({ style: "" })}
        />
        {STYLES.map((style, index) => (
          <ChoiceRow
            key={style.value}
            label={l(style.tr, style.en)}
            detail={l(style.hintTr, style.hintEn)}
            selected={personal.style === style.value}
            onClick={() => savePersonal({ style: style.value })}
            last={index === STYLES.length - 1}
          />
        ))}
      </Card>
      <SectionTitle>{l("Dil", "Language")}</SectionTitle>
      <Card>
        <ChoiceRow label="Türkçe" selected={preferences.language === "tr"} onClick={() => setLanguagePreference("tr")} extra={<GlobeIcon size={18} style={{ color: IRIS.faint }} />} />
        <ChoiceRow label="English" selected={preferences.language === "en"} onClick={() => setLanguagePreference("en")} last extra={<GlobeIcon size={18} style={{ color: IRIS.faint }} />} />
      </Card>
      <Note>{l("İris yanıtlarını ve uygulamanın yazılarını bu dilde yazar.", "Iris answers, and the app is shown, in this language.")}</Note>
    </div>
  );
}

const RATES = [
  { value: 0.9, tr: "Yavaş", en: "Slow" },
  { value: 1, tr: "Normal", en: "Normal" },
  { value: 1.12, tr: "Hızlı", en: "Quick" },
];
const PATIENCE = [
  { value: 1300, tr: "Kısa", en: "Short" },
  { value: 2200, tr: "Normal", en: "Normal" },
  { value: 3600, tr: "Uzun", en: "Long" },
];
const PERSONA_ORDER: Persona[] = ["warm", "lively", "calm"];

function VoicePage() {
  const l = useL();
  const locale = useLocale();
  const language = locale.startsWith("en") ? "en" : "tr";
  const iris = useIrisPrefs();
  const [prefs, setPrefs] = useState<VoicePrefs>(() => (typeof window === "undefined" ? DEFAULT_VOICE : readVoicePrefs()));
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listVoices(language).then(
      (list) => alive && setVoices(list),
      () => alive && setVoices([])
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
  };

  const preview = async (key: string, override: Partial<VoicePrefs>) => {
    stopSpeaking();
    const next = { ...prefs, ...override };
    if (next.engine === "natural") clearNaturalVoicePause();
    setPreviewing(key);
    try {
      await speakScript(
        voiceScript(
          l(
            "Merhaba, ben İris. Asetik asit çözeltisinin pH'ı yaklaşık 2,88 çıkıyor. İstersen nasıl hesapladığımı anlatayım?",
            "Hi, I'm Iris. The acetic acid solution comes out at a pH of about 2.88. Shall I walk you through it?"
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

  const play = (key: string, override: Partial<VoicePrefs>) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void preview(key, override);
      }}
      className="rounded-full px-3 py-1 text-[14px] font-medium"
      style={{ background: "#EEF3FE", color: IRIS.blue }}
    >
      {previewing === key ? <Loader2 className="size-4 animate-spin" /> : l("Dinle", "Play")}
    </button>
  );

  return (
    <div className="pt-2">
      <Card>
        <ToggleRow label={l("Yanıtları sesli oku", "Read answers aloud")} on={iris.autoSpeak} onChange={(autoSpeak) => saveIrisPrefs({ autoSpeak })} last />
      </Card>

      <SectionTitle>{l("Ses motoru", "Voice engine")}</SectionTitle>
      <Card>
        <ChoiceRow
          label={l("Doğal ses", "Natural voice")}
          detail={l("En insan gibi; internet gerekir", "Most human; needs internet")}
          selected={prefs.engine === "natural"}
          onClick={() => update({ engine: "natural" })}
          extra={play("engine:natural", { engine: "natural" })}
        />
        <ChoiceRow
          label={l("Telefonun sesi", "The phone's voice")}
          detail={l("Çevrimdışı da çalışır", "Works offline too")}
          selected={prefs.engine === "device"}
          onClick={() => update({ engine: "device" })}
          extra={play("engine:device", { engine: "device" })}
          last
        />
      </Card>

      {prefs.engine === "natural" ? (
        <>
          <SectionTitle>{l("İris'in sesi", "Iris's voice")}</SectionTitle>
          <Card>
            {NATURAL_VOICES.map((voice, index) => (
              <ChoiceRow
                key={voice.id}
                label={l(voice.tr, voice.en)}
                detail={l(voice.detailTr, voice.detailEn)}
                selected={prefs.naturalVoice === voice.id}
                onClick={() => update({ naturalVoice: voice.id })}
                extra={play(`natural:${voice.id}`, { engine: "natural", naturalVoice: voice.id })}
                last={index === NATURAL_VOICES.length - 1}
              />
            ))}
          </Card>
        </>
      ) : (
        <>
          <SectionTitle>{l("Telefon sesi", "Phone voice")}</SectionTitle>
          <Card>
            {!voices && <Row label={l("Sesler yükleniyor…", "Loading voices…")} last />}
            {voices && (
              <ChoiceRow
                label={l("Otomatik", "Automatic")}
                detail={l("En doğal yüklü ses", "The most natural installed voice")}
                selected={!prefs.voice}
                onClick={() => update({ voice: "" })}
                last={voices.length === 0}
              />
            )}
            {voices?.map((voice, index) => (
              <ChoiceRow
                key={voice.id}
                label={voice.label}
                detail={voice.detail}
                selected={prefs.voice === voice.id}
                onClick={() => update({ voice: voice.id })}
                extra={play(`voice:${voice.id}`, { engine: "device", voice: voice.id })}
                last={index === voices.length - 1}
              />
            ))}
          </Card>
        </>
      )}

      <SectionTitle>{l("Karakter", "Character")}</SectionTitle>
      <Card>
        {PERSONA_ORDER.map((persona, index) => (
          <ChoiceRow
            key={persona}
            label={l(PERSONAS[persona].tr, PERSONAS[persona].en)}
            detail={l(PERSONAS[persona].hintTr, PERSONAS[persona].hintEn)}
            selected={prefs.persona === persona}
            onClick={() => update({ persona })}
            last={index === PERSONA_ORDER.length - 1}
          />
        ))}
      </Card>

      <SectionTitle>{l("Konuşma hızı", "Speaking pace")}</SectionTitle>
      <Card>
        {RATES.map((rate, index) => (
          <ChoiceRow key={rate.value} label={l(rate.tr, rate.en)} selected={Math.abs(prefs.rate - rate.value) < 0.06} onClick={() => update({ rate: rate.value })} last={index === RATES.length - 1} />
        ))}
      </Card>

      <SectionTitle>{l("Sorunun bittiğini anlama", "When a question is finished")}</SectionTitle>
      <Card>
        {PATIENCE.map((option, index) => (
          <ChoiceRow key={option.value} label={l(option.tr, option.en)} selected={prefs.patienceMs === option.value} onClick={() => update({ patienceMs: option.value })} last={index === PATIENCE.length - 1} />
        ))}
      </Card>
      <Note>{l("Sesli sohbette ne kadar uzun bir sessizliğin sorunun sonu sayılacağı.", "How long a pause ends your question in voice mode.")}</Note>

      <SectionTitle>{l("Sesli sohbet", "Voice chat")}</SectionTitle>
      <Card>
        <ToggleRow
          label={l("Kulaklıkla araya gir", "Interrupt with headphones")}
          detail={l("Konuşmaya başlayınca İris susar ve dinler", "Start talking and Iris stops to listen")}
          on={prefs.bargeIn}
          onChange={(bargeIn) => update({ bargeIn })}
        />
        <ToggleRow label={l("Canlı altyazı", "Live captions")} on={prefs.captions} onChange={(captions) => update({ captions })} last />
      </Card>
    </div>
  );
}

function ActionsPage() {
  const l = useL();
  const prefs = useIrisPrefs();
  return (
    <div className="pt-2">
      <Card>
        <ToggleRow
          label={l("Eylemler", "Actions")}
          detail={l("Zamanlayıcı kurma; not, protokol, envanter, rapor ve grafik oluşturma", "Setting timers; making notes, protocols, inventory entries, reports and graphs")}
          on={prefs.actions}
          onChange={(actions) => saveIrisPrefs({ actions })}
          last
        />
      </Card>
      <Note>{l("Kapalıyken İris yalnızca hesaplar ve anlatır; hiçbir şey oluşturmaz.", "When off, Iris only computes and explains; it makes nothing.")}</Note>

      <SectionTitle>{l("Fotoğraflar", "Photos")}</SectionTitle>
      <Card>
        <ToggleRow
          label={l("Görsel yapay zekâ ile oku", "Read with the vision AI")}
          detail={l("Yapı çizimlerini, tepkime şemalarını ve soruları okur", "Reads drawn structures, reaction schemes and questions")}
          on={prefs.visionModel}
          onChange={(visionModel) => saveIrisPrefs({ visionModel })}
          last
        />
      </Card>
      <Note>
        {l(
          "Açıkken fotoğraf okunmak için bir görsel yapay zekâya (Groq) gönderilir; kapalıyken yalnızca telefonda okunur ve yapı çizimleri okunamaz.",
          "When on, the photo is sent to a vision AI (Groq) to be read; when off, it is read on the phone only and drawn structures can't be read."
        )}
      </Note>

      <SectionTitle>{l("Güven", "Trust")}</SectionTitle>
      <Card>
        <ToggleRow
          label={l("Kanıt denetimi", "Proof check")}
          detail={l("Yanıttaki sayıları hesap motoruyla karşılaştırır", "Checks the answer's numbers against the engine")}
          on={prefs.verify}
          onChange={(verify) => saveIrisPrefs({ verify })}
        />
        <ToggleRow
          label={l("Güvenlik taraması", "Safety scan")}
          detail={l("Tehlikeleri ve uyumsuz kimyasalları gösterir", "Shows hazards and incompatible chemicals")}
          on={prefs.safety}
          onChange={(safety) => saveIrisPrefs({ safety })}
          last
        />
      </Card>
      <Note>
        {l(
          "Genel yapay zekâlar kimyada sayıları sık sık yanlış hesaplar ve güvenlik risklerini gözden kaçırır. İris her yanıtı cihazdaki hesap motoru ve güvenlik kartlarıyla denetler.",
          "General chatbots often get chemistry numbers wrong and miss safety risks. Iris checks every answer against the engine and the safety cards on the device."
        )}
      </Note>
    </div>
  );
}

function ActivityPage({ onClose }: { onClose: () => void }) {
  const l = useL();
  const router = useRouter();
  const prefs = useIrisPrefs();
  const history = useHistory();
  useEffect(() => {
    void refreshHistory();
  }, []);
  return (
    <div className="pt-2">
      <Card>
        <ToggleRow
          label={l("Sohbetleri kaydet", "Save chats")}
          detail={prefs.saveHistory ? l("Sohbetler hesabında saklanır", "Chats are kept in your account") : l("Yeni sohbetler geçicidir, hiçbir yerde saklanmaz", "New chats are temporary and kept nowhere")}
          on={prefs.saveHistory}
          onChange={(saveHistory) => saveIrisPrefs({ saveHistory })}
          last
        />
      </Card>
      <Note>
        {l(
          "Kapalıyken açtığın sohbetler geçici sohbettir: yanıt verildikten sonra sunucuda tutulmaz ve geçmişte görünmez.",
          "With this off, new chats are temporary: nothing is kept on the server and they do not appear in your history."
        )}
      </Note>
      <SectionTitle>{l("Sohbet geçmişi", "Chat history")}</SectionTitle>
      <Card>
        <Row
          label={l("Kayıtlı sohbetler", "Saved chats")}
          right={history.status === "ready" ? <Count value={history.conversations.length} /> : <Loader2 className="size-4 animate-spin" style={{ color: IRIS.faint }} />}
        />
        <Row
          label={l("Sohbetlerde arama yapın", "Search chats")}
          onClick={() => {
            onClose();
            router.push("/dashboard/search/");
          }}
          last
        />
      </Card>
      <Note>
        {l(
          "Sohbetlerin ChemPlus hesabında saklanır; chemplus.com.tr'de de görebilirsin. Hesabını silmek tüm sohbetleri de siler.",
          "Your chats are kept in your ChemPlus account and also appear on chemplus.com.tr. Deleting your account deletes them too."
        )}
      </Note>
    </div>
  );
}

function DataPage() {
  const l = useL();
  const locale = useLocale();
  const [counts, setCounts] = useState<{ notebooks: number; documents: number; media: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const load = async () => {
    const language = locale.startsWith("en") ? "en" : "tr";
    setCounts({ notebooks: listNotebooks().length, documents: listDocuments(language).length, media: (await listMedia()).length });
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="pt-2">
      <Card>
        <Row label={l("Not defterleri", "Notebooks")} right={<Count value={counts?.notebooks ?? 0} />} />
        <Row label={l("Belgeler", "Documents")} detail={l("Raporlar, notlar, protokoller, envanter", "Reports, notes, protocols, inventory")} right={<Count value={counts?.documents ?? 0} />} />
        <Row label={l("Medya içerikleri", "Media")} detail={l("Fotoğraflar ve yapı çizimleri", "Photos and structure drawings")} right={<Count value={counts?.media ?? 0} />} last />
      </Card>
      <Note>
        {l(
          "Bunlar yalnızca bu telefonda durur; uygulamayı kaldırınca silinir. Sohbetlerin ise hesabında kalır.",
          "These stay on this phone and go when the app is removed. Your chats stay in your account."
        )}
      </Note>
      <SectionTitle>{l("Temizle", "Clear")}</SectionTitle>
      <Card>
        {confirm ? (
          <Row
            label={<span className="text-[#D7263D]">{l("Medya içerikleri silinsin mi?", "Delete all media?")}</span>}
            last
            right={
              <span className="flex gap-2">
                <button type="button" onClick={() => setConfirm(false)} className="rounded-full bg-[#F0F0F3] px-3 py-1.5 text-[14px] font-medium text-[#0B0B0C]">
                  {l("Vazgeç", "Cancel")}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await clearMedia();
                    setConfirm(false);
                    void load();
                  }}
                  className="rounded-full bg-[#D7263D] px-3 py-1.5 text-[14px] font-medium text-white"
                >
                  {l("Sil", "Delete")}
                </button>
              </span>
            }
          />
        ) : (
          <Row label={<span className="text-[#D7263D]">{l("Medya içeriklerini temizle", "Clear media")}</span>} onClick={() => setConfirm(true)} chevron={false} last />
        )}
      </Card>
    </div>
  );
}

const HELP: { tr: string; en: string; items: { tr: string; en: string; askTr: string; askEn: string }[] }[] = [
  {
    tr: "Kesin hesap",
    en: "Exact maths",
    items: [
      { tr: "pH, tampon ve titrasyon", en: "pH, buffers and titrations", askTr: "0,1 M CH₃COOH ve 0,1 M CH₃COONa tamponunun pH'ı nedir? (pKa 4,76)", askEn: "What is the pH of a 0.1 M acetic acid / 0.1 M acetate buffer? (pKa 4.76)" },
      { tr: "Çözelti hazırlama ve seyreltme", en: "Making and diluting solutions", askTr: "250 mL 0,5 M NaOH hazırlamak için kaç gram NaOH tartmalıyım?", askEn: "How many grams of NaOH for 250 mL of 0.5 M?" },
      { tr: "Stokiyometri ve verim", en: "Stoichiometry and yield", askTr: "10 g propan yanınca kaç gram CO₂ oluşur?", askEn: "How many grams of CO₂ from burning 10 g of propane?" },
    ],
  },
  {
    tr: "Yapılar",
    en: "Structures",
    items: [
      { tr: "Molekül çizimi ve özellikleri", en: "Molecules and their properties", askTr: "Kafeinin yapısını çiz ve özelliklerini hesapla", askEn: "Draw caffeine and compute its properties" },
      { tr: "Kompleksler, izomerler, KAKE", en: "Complexes, isomers, CFSE", askTr: "[Co(NH₃)₄Cl₂]⁺ kompleksinin izomerlerini göster", askEn: "Show the isomers of [Co(NH₃)₄Cl₂]⁺" },
      { tr: "VSEPR ve 3B şekil", en: "VSEPR and 3D shape", askTr: "XeF₄'ün VSEPR şeklini göster", askEn: "Show the VSEPR shape of XeF₄" },
    ],
  },
  {
    tr: "İş yaptır",
    en: "Get things done",
    items: [
      { tr: "Zamanlayıcı", en: "Timers", askTr: "Isıtma için 15 dakikalık zamanlayıcı kur", askEn: "Set a 15-minute heating timer" },
      { tr: "Protokol", en: "Protocols", askTr: "0,1 M HCl hazırlama protokolü oluştur", askEn: "Make a protocol for preparing 0.1 M HCl" },
      { tr: "Rapor ve grafik", en: "Reports and graphs", askTr: "Absorbans 0,12 0,25 0,37 0,50 ve derişim 1 2 3 4 mg/L için kalibrasyon grafiği çiz", askEn: "Plot a calibration: absorbance 0.12 0.25 0.37 0.50 at 1 2 3 4 mg/L" },
    ],
  },
];

function HelpPage({ onClose }: { onClose: () => void }) {
  const l = useL();
  const router = useRouter();
  const ask = (question: string) => {
    onClose();
    router.push(`/dashboard/?q=${encodeURIComponent(question)}`);
  };
  return (
    <div className="pt-2">
      <Note>
        {l(
          "İris, genel yapay zekâlardan farklı olarak hesapları cihazdaki hesap motoruyla yapar, yanıttaki sayıları bu sonuçlarla denetler, güvenlik kartlarıyla tehlikeleri gösterir ve senin için laboratuvar işlerini yapar. Bir örneğe dokun, İris hemen denesin.",
          "Unlike general chatbots, Iris computes with the engine on the device, checks the answer's numbers against it, shows hazards from safety cards and does lab tasks for you. Tap an example to try it."
        )}
      </Note>
      {HELP.map((group) => (
        <div key={group.tr}>
          <SectionTitle>{l(group.tr, group.en)}</SectionTitle>
          <Card>
            {group.items.map((item, index) => (
              <Row key={item.tr} label={l(item.tr, item.en)} detail={l(item.askTr, item.askEn)} onClick={() => ask(l(item.askTr, item.askEn))} last={index === group.items.length - 1} />
            ))}
          </Card>
        </div>
      ))}
      <SectionTitle>{l("Not defterleri", "Notebooks")}</SectionTitle>
      <Card>
        <Row
          label={l("Kaynaklarınla çalış", "Work with your sources")}
          detail={l("Bir not defteri aç, deney föyünü ya da verini ekle; İris yanıtlarını onlara dayandırır.", "Open a notebook, add your procedure or data; Iris grounds its answers in them.")}
          last
        />
      </Card>
    </div>
  );
}

function TracePage() {
  const l = useL();
  const [lines, setLines] = useState<string[]>(() => readTrace().slice(-150).map(traceLine));
  const [copied, setCopied] = useState(false);
  useEffect(() => onTrace(() => setLines(readTrace().slice(-150).map(traceLine))), []);
  const bottom = useRef<HTMLPreElement>(null);
  return (
    <div className="pt-2">
      <Card>
        <Row
          label={copied ? l("Kopyalandı", "Copied") : l("Kaydı kopyala", "Copy the log")}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(traceText());
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              // clipboard refused: the lines stay selectable below
            }
          }}
          chevron={false}
        />
        <Row label={<span className="text-[#D7263D]">{l("Temizle", "Clear")}</span>} onClick={clearTrace} chevron={false} last />
      </Card>
      <Note>{l("İris'in son adımları ve süreleri. Bir sorun olursa kopyalayıp bize gönderebilirsin; telefondan başka yere gitmez.", "Iris's last steps and timings. Copy and send it to us if something goes wrong; it stays on the phone otherwise.")}</Note>
      <div className="mx-4 mt-3 rounded-[20px] bg-white p-3">
        <pre ref={bottom} className="max-h-[50vh] select-text overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-[#3A3A40]">
          {lines.length ? lines.join("\n") : l("Henüz kayıt yok.", "Nothing logged yet.")}
        </pre>
      </div>
    </div>
  );
}

function AboutPage({ onClose }: { onClose: () => void }) {
  const l = useL();
  const router = useRouter();
  return (
    <div className="pt-2">
      <Card>
        <Row label={<Wordmark height={20} />} detail={l("Sürüm 1.0.0", "Version 1.0.0")} />
        <Row label={l("Yapay zekâ", "AI")} detail={l("İris · Google Gemini ile, chemplus.com.tr üzerinden; yoğunlukta Groq ve NVIDIA'daki modeller", "Iris · Google Gemini, through chemplus.com.tr; Groq's and NVIDIA's models when it is busy")} />
        <Row label={l("Hesap motoru", "Calculation engine")} detail={l("Cihazda: RDKit, ChemAI çözücüleri ve güvenlik kartları", "On the device: RDKit, ChemAI solvers and safety cards")} />
        <Row label={l("Ses", "Voice")} detail="Microsoft Azure · Google" last />
      </Card>
      <SectionTitle>{l("Yasal", "Legal")}</SectionTitle>
      <Card>
        <Row
          label={l("Gizlilik Politikası", "Privacy Policy")}
          onClick={() => {
            onClose();
            router.push("/gizlilik/");
          }}
          last
        />
      </Card>
      <Note>{l("ChemAI, ChemPlus hesabınla çalışır. İletişim: ", "ChemAI works with your ChemPlus account. Contact: ")}{CONTACT}</Note>
    </div>
  );
}
