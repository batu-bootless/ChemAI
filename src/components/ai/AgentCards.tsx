"use client";

// Chem+ app: the cards of Iris's actions in the chat (src/lib/agent/actions.ts) - the thing done,
// working, right in the conversation: a timer counting down with its controls, the note as
// written, the protocol's steps, the bottle on the shelf, the report with its PDF, the graph drawn.
// ChemAI has no module pages: the card is where the thing made lives.

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AlarmClockOff, Download, Loader2, Maximize2, Pause, Play, RotateCcw, X } from "lucide-react";
import { cancelTimer, getTimer, onTimers, pauseTimer, restartTimer, resumeTimer, silenceTimers, timerLeft, timerRinging } from "@/lib/agent/timers";
import { saveReportPdf } from "@/lib/agent/actions";
import type { GraphCardData, InventoryCardData, NoteCardData, ProtocolCardData, ReportCardData, TimerCardData } from "@/lib/agent/types";
import { INK_COLORS } from "@/mobile/ui/ink";
import { useL } from "@/mobile/i18n";
import { useRouter } from "next/navigation";

// The graph engine loads with the first graph card, not with the chat.
const ChartRenderer = dynamic(() => import("@/components/graph-studio/charts/ChartRenderer"), {
  ssr: false,
  loading: () => <div className="grid h-[230px] place-items-center"><Loader2 className="size-5 animate-spin text-[#111]/40" /></div>,
});

function clock(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function CardButton({ onClick, children, tone = "white", disabled }: { onClick: () => void; children: ReactNode; tone?: "white" | "green" | "red" | "yellow"; disabled?: boolean }) {
  const background = tone === "white" ? "#fff" : INK_COLORS[tone].fill;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-xl border-2 border-[#111] px-3 py-1.5 text-[12.5px] font-extrabold text-[#111] shadow-[2px_2px_0_#111] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
      style={{ background }}
    >
      {children}
    </button>
  );
}

function Gone({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] font-bold text-[#111]/55">{children}</p>;
}

// --- timer ------------------------------------------------------------------------------------------

export function TimerCardBody({ data }: { data: TimerCardData }) {
  const l = useL();
  const [, setNow] = useState(0);
  useEffect(() => {
    const off = onTimers(() => setNow(Date.now()));
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, []);
  const timer = getTimer(data.id);
  if (!timer) return <Gone>{l("Bu zamanlayıcı bitti.", "This timer is over.")}</Gone>;
  const left = timerLeft(timer);
  const progress = timer.seconds > 0 ? 1 - left / timer.seconds : 1;
  const ringing = timerRinging(timer.id);
  const R = 34;
  const C = 2 * Math.PI * R;
  const color = timer.state === "done" ? INK_COLORS.red.fill : timer.state === "paused" ? INK_COLORS.yellow.fill : INK_COLORS.green.fill;
  return (
    <div>
      <div className="flex items-center gap-3.5">
        <div className="relative size-[84px] shrink-0">
          <svg viewBox="0 0 80 80" className="size-full -rotate-90">
            <circle cx={40} cy={40} r={R} fill="none" stroke="#111" strokeOpacity={0.1} strokeWidth={8} />
            <circle
              cx={40}
              cy={40}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))}
              style={{ transition: "stroke-dashoffset 0.25s linear" }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-mono text-[17px] font-extrabold text-[#111]">{clock(left)}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold text-[#111]">{timer.label}</p>
          <p className="text-[12px] font-bold text-[#111]/55">
            {timer.state === "running"
              ? l(`Çalışıyor · ${clock(timer.seconds)}`, `Running · ${clock(timer.seconds)}`)
              : timer.state === "paused"
                ? l("Duraklatıldı", "Paused")
                : timer.state === "done"
                  ? l("Süre doldu", "Time's up")
                  : l("İptal edildi", "Cancelled")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ringing && (
          <CardButton tone="red" onClick={silenceTimers}>
            <AlarmClockOff className="size-4" strokeWidth={2.6} />
            {l("Alarmı sustur", "Stop the alarm")}
          </CardButton>
        )}
        {timer.state === "running" && (
          <CardButton onClick={() => pauseTimer(timer.id)}>
            <Pause className="size-4" strokeWidth={2.6} />
            {l("Duraklat", "Pause")}
          </CardButton>
        )}
        {timer.state === "paused" && (
          <CardButton tone="green" onClick={() => resumeTimer(timer.id)}>
            <Play className="size-4" strokeWidth={2.6} />
            {l("Devam et", "Resume")}
          </CardButton>
        )}
        {(timer.state === "done" || timer.state === "cancelled") && (
          <CardButton onClick={() => restartTimer(timer.id)}>
            <RotateCcw className="size-4" strokeWidth={2.6} />
            {l("Yeniden başlat", "Start again")}
          </CardButton>
        )}
        {(timer.state === "running" || timer.state === "paused") && (
          <CardButton onClick={() => cancelTimer(timer.id)}>
            <X className="size-4" strokeWidth={2.6} />
            {l("İptal", "Cancel")}
          </CardButton>
        )}
      </div>
    </div>
  );
}

// --- note -------------------------------------------------------------------------------------------

/** "# " bold, "- " an item, "1. " a numbered item, else a paragraph. */
function NoteLines({ text, limit }: { text: string; limit: number }) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return (
    <div className="space-y-1">
      {lines.slice(0, limit).map((line, index) => {
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        const bullet = line.match(/^[-•*]\s+(.*)$/);
        const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
        if (heading) return <p key={index} className="pt-1 text-[13px] font-extrabold text-[#111]">{heading[1]}</p>;
        if (bullet || numbered)
          return (
            <p key={index} className="flex gap-1.5 text-[12.5px] font-semibold leading-snug text-[#111]/85">
              <span className="shrink-0 font-extrabold">{bullet ? "•" : `${numbered![1]}.`}</span>
              <span className="min-w-0">{bullet ? bullet[1] : numbered![2]}</span>
            </p>
          );
        return <p key={index} className="text-[12.5px] font-semibold leading-snug text-[#111]/85">{line}</p>;
      })}
    </div>
  );
}

export function NoteCardBody({ data }: { data: NoteCardData }) {
  const l = useL();
  const [all, setAll] = useState(false);
  const count = data.text.split(/\r?\n/).filter((line) => line.trim()).length;
  return (
    <div>
      <p className="mb-1.5 text-[15px] font-extrabold text-[#111]">{data.title}</p>
      {!data.exists && <Gone>{l("Bu not sonradan silinmiş; ilk hali:", "This note was deleted since; as it was:")}</Gone>}
      <div className="rounded-xl border-2 border-[#111]/15 px-2.5 py-2" style={{ background: "#FFF7D1" }}>
        <NoteLines text={data.text} limit={all ? 200 : 10} />
        {count > 10 && (
          <button type="button" onClick={() => setAll((value) => !value)} className="mt-1.5 text-[11.5px] font-extrabold text-[#111]/60 underline">
            {all ? l("Daha az göster", "Show less") : l(`Tümünü göster (${count} satır)`, `Show all (${count} lines)`)}
          </button>
        )}
      </div>
    </div>
  );
}

// --- protocol ---------------------------------------------------------------------------------------

export function ProtocolCardBody({ data }: { data: ProtocolCardData }) {
  const l = useL();
  const router = useRouter();
  const [all, setAll] = useState(false);
  const steps = all ? data.steps : data.steps.slice(0, 8);
  return (
    <div>
      <p className="text-[15px] font-extrabold text-[#111]">
        <span className="mr-1.5">{data.emoji}</span>
        {data.title}
      </p>
      {data.description && <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-[#111]/70">{data.description}</p>}
      {!data.exists && <Gone>{l("Bu protokol sonradan silinmiş.", "This protocol was deleted since.")}</Gone>}
      {data.materials.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.materials.slice(0, 12).map((item) => (
            <span key={item} className="rounded-lg border-2 border-[#111]/15 bg-[#FBF7F1] px-2 py-0.5 text-[11px] font-bold text-[#111]/80">
              {item}
            </span>
          ))}
        </div>
      )}
      <ol className="mt-2.5 space-y-1.5">
        {steps.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="grid size-5 shrink-0 place-items-center rounded-md border-2 border-[#111] bg-white text-[10.5px] font-extrabold">{index + 1}</span>
            <span className="min-w-0 text-[12.5px] leading-snug">
              <span className="font-extrabold text-[#111]">{item.title}</span>
              {item.minutes ? (
                <span className="ml-1.5 rounded-md px-1.5 py-px text-[10.5px] font-extrabold" style={{ background: INK_COLORS.yellow.fill }}>
                  ⏱{" "}
                  {item.minutes < 1
                    ? `${Math.round(item.minutes * 60)} ${l("sn", "s")}`
                    : `${String(Math.round(item.minutes * 10) / 10).replace(".", l(",", "."))} ${l("dk", "min")}`}
                </span>
              ) : null}
              {item.description && <span className="block whitespace-pre-line font-semibold text-[#111]/70">{item.description}</span>}
            </span>
          </li>
        ))}
      </ol>
      {data.steps.length > 8 && (
        <button type="button" onClick={() => setAll((value) => !value)} className="mt-1.5 text-[11.5px] font-extrabold text-[#111]/60 underline">
          {all ? l("Daha az göster", "Show less") : l(`Tüm adımlar (${data.steps.length})`, `All steps (${data.steps.length})`)}
        </button>
      )}
      {data.exists && (
        <div className="mt-3">
          <CardButton tone="green" onClick={() => router.push(`/dashboard/protocols/?protocol=${encodeURIComponent(data.id)}&run=1`)}>
            <Play className="size-4" strokeWidth={2.6} />
            {l("Protokolü çalıştır", "Run the protocol")}
          </CardButton>
        </div>
      )}
    </div>
  );
}

// --- inventory --------------------------------------------------------------------------------------

export function InventoryCardBody({ data }: { data: InventoryCardData }) {
  const l = useL();
  const rows: [string, string][] = [
    [l("Miktar", "Amount"), data.amount ? `${data.amount} ${data.unit}` : "—"],
    [l("Konum", "Location"), data.location || "—"],
    ...(data.lot ? ([[l("Lot", "Lot"), data.lot]] as [string, string][]) : []),
    ...(data.expiry ? ([[l("Son kullanma", "Expiry"), data.expiry]] as [string, string][]) : []),
    ...(data.linked ? ([[l("Güvenlik kartı", "Safety card"), data.linked]] as [string, string][]) : []),
  ];
  return (
    <div>
      <p className="text-[20px] font-extrabold leading-tight tracking-tight text-[#111]">{data.name}</p>
      {data.formula && <p className="text-[12.5px] font-bold text-[#111]/55">{data.formula}</p>}
      {!data.exists && <Gone>{l("Bu kayıt sonradan envanterden silinmiş.", "This entry was removed from the inventory since.")}</Gone>}
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-bold text-[#111]/55">{label}</dt>
            <dd className="min-w-0 break-words font-extrabold text-[#111]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// --- lab report -------------------------------------------------------------------------------------

export function ReportCardBody({ data }: { data: ReportCardData }) {
  const l = useL();
  const [all, setAll] = useState(false);
  const [pdf, setPdf] = useState<"idle" | "busy" | "saved" | "failed">(data.pdf === "saved" ? "saved" : data.pdf === "failed" ? "failed" : "idle");
  const sections = all ? data.sections : data.sections.slice(0, 3);
  const download = async () => {
    setPdf("busy");
    try {
      setPdf((await saveReportPdf(data.id)) ? "saved" : "failed");
    } catch {
      setPdf("failed");
    }
  };
  return (
    <div>
      <p className="text-[15px] font-extrabold text-[#111]">{data.title}</p>
      {data.code && <p className="text-[11.5px] font-bold text-[#111]/50">{data.code}</p>}
      {!data.exists && <Gone>{l("Bu rapor sonradan silinmiş.", "This report was deleted since.")}</Gone>}
      <div className="mt-2 space-y-2">
        {sections.map(([heading, text]) => (
          <div key={heading}>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#111]/50">{heading}</p>
            <p className={`whitespace-pre-line text-[12.5px] font-semibold leading-snug text-[#111]/85 ${all ? "" : "line-clamp-3"}`}>{text}</p>
          </div>
        ))}
      </div>
      {data.sections.length > 3 && (
        <button type="button" onClick={() => setAll((value) => !value)} className="mt-1.5 text-[11.5px] font-extrabold text-[#111]/60 underline">
          {all ? l("Daha az göster", "Show less") : l(`Tüm rapor (${data.sections.length} bölüm)`, `Whole report (${data.sections.length} sections)`)}
        </button>
      )}
      {data.exists && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CardButton tone={pdf === "saved" ? "green" : "yellow"} onClick={download} disabled={pdf === "busy"}>
            {pdf === "busy" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" strokeWidth={2.6} />}
            {pdf === "saved" ? l("PDF indirildi · tekrar indir", "PDF saved · save again") : l("PDF olarak indir", "Save as PDF")}
          </CardButton>
          {pdf === "failed" && <span className="text-[11.5px] font-bold text-[#D7263D]">{l("PDF oluşturulamadı, tekrar dene.", "Couldn't make the PDF, try again.")}</span>}
        </div>
      )}
    </div>
  );
}

// --- graph ------------------------------------------------------------------------------------------

export function GraphCardBody({ data }: { data: GraphCardData }) {
  const l = useL();
  const [big, setBig] = useState(false);
  return (
    <div>
      <p className="mb-1 text-[15px] font-extrabold text-[#111]">{data.spec.title}</p>
      <button
        type="button"
        onClick={() => setBig(true)}
        aria-label={l("Grafiği büyüt", "Enlarge the graph")}
        className="relative -mx-1 block w-[calc(100%+0.5rem)] overflow-hidden rounded-xl border-2 border-[#111]/10 bg-white text-left"
      >
        <ChartRenderer spec={data.spec} height={300} />
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-lg border-2 border-[#111] bg-white px-1.5 py-0.5 text-[10.5px] font-extrabold text-[#111]">
          <Maximize2 className="size-3" strokeWidth={3} />
          {l("Büyüt", "Enlarge")}
        </span>
      </button>
      {big && (
        // The chart at its own size (720 wide): readable, panned sideways on a phone.
        <div className="fixed inset-0 z-[90] flex flex-col bg-white" role="dialog" aria-label={data.spec.title}>
          <div className="flex shrink-0 items-center gap-2 border-b-[2.5px] border-[#111] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
            <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#111]">{data.spec.title}</p>
            <button type="button" onClick={() => setBig(false)} aria-label={l("Kapat", "Close")} className="grid size-9 place-items-center rounded-xl border-2 border-[#111] bg-white">
              <X className="size-4" strokeWidth={3} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="w-[720px]">
              <ChartRenderer spec={data.spec} height={420} />
            </div>
            {data.spec.description && <p className="mt-3 max-w-[680px] text-[13px] font-semibold text-[#111]/75">{data.spec.description}</p>}
          </div>
        </div>
      )}
      {data.spec.description && <p className="mt-2 text-[12px] font-semibold leading-snug text-[#111]/70">{data.spec.description}</p>}
    </div>
  );
}
