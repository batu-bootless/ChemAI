"use client";

// ChemAI: the pieces inside a protocol step - a timer that rings and notifies like any timer Iris
// sets, a stopwatch, a checklist item, a note, a table, the name of a file to bring - in Iris's
// (Gemini) style. In edit mode they can be changed and removed; in a run they are used.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { cancelTimer, createTimer, getTimer, onTimers, pauseTimer, resumeTimer, silenceTimers, timerLeft, timerRinging } from "@/lib/agent/timers";
import { clock, type Block, type BlockKind } from "@/lib/protocols/model";
import { useL } from "@/mobile/i18n";
import { CheckIcon, CloseIcon, DocumentIcon, NewChatIcon, PauseIcon, PhotoIcon, PlayIcon, ResetIcon, TrashIcon, UsageIcon } from "../icons";
import { IRIS } from "../theme";

const TIMERS_KEY = "chemai:protocol-block-timers";

function readTimerLinks(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(TIMERS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function linkTimer(key: string, timerId: string | null) {
  const links = readTimerLinks();
  if (timerId) links[key] = timerId;
  else delete links[key];
  try {
    window.localStorage.setItem(TIMERS_KEY, JSON.stringify(links));
  } catch {
    // the timer still runs; this block only forgets it
  }
}

/** The timer a protocol's timer block started, while it is still running, paused or ringing. */
export function blockTimer(protocolId: string, blockId: string) {
  const id = readTimerLinks()[`${protocolId}:${blockId}`];
  const timer = id ? getTimer(id) : null;
  return timer && (timer.state === "running" || timer.state === "paused" || timerRinging(timer.id)) ? timer : null;
}

/** Starts a timer block's countdown (the step's own button, or hands-free mode's "başlat"). */
export function startBlockTimer(protocolId: string, block: Block, fallbackLabel: string) {
  if (!block.seconds) return null;
  const made = createTimer(block.seconds, block.label || fallbackLabel);
  linkTimer(`${protocolId}:${block.id}`, made.id);
  timersVersion++;
  return made;
}

let timersVersion = 0;
function subscribeTimers(listener: () => void) {
  const off = onTimers(() => {
    timersVersion++;
    listener();
  });
  const id = window.setInterval(() => {
    timersVersion++;
    listener();
  }, 1000);
  return () => {
    off();
    window.clearInterval(id);
  };
}

/** Re-renders every second and whenever a timer changes. */
function useTimerTick(): number {
  return useSyncExternalStore(subscribeTimers, () => timersVersion, () => 0);
}

const CELL = "w-full bg-transparent text-[15px] text-[#0B0B0C] outline-none placeholder:text-[#A8A6A9]";

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[16px] px-3.5 py-2.5 ${className}`} style={{ background: IRIS.row }}>
      {children}
    </div>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  const l = useL();
  return (
    <button type="button" onClick={onClick} aria-label={l("Sil", "Delete")} className="grid size-9 shrink-0 place-items-center rounded-full text-[#D7263D] active:bg-[#FDECEC]">
      <TrashIcon size={19} />
    </button>
  );
}

function TimerBlock({ protocolId, block, editing, onChange, onRemove }: { protocolId: string; block: Block; editing: boolean; onChange: (block: Block) => void; onRemove: () => void }) {
  const l = useL();
  useTimerTick();
  const key = `${protocolId}:${block.id}`;
  // Read on every tick: hands-free mode may start or stop this block's timer too.
  const [, setVersion] = useState(0);
  const timerId = readTimerLinks()[key] ?? null;
  const timer = timerId ? getTimer(timerId) : null;
  const live = timer && (timer.state === "running" || timer.state === "paused") ? timer : null;
  const ringing = timer ? timerRinging(timer.id) : false;
  const seconds = block.seconds ?? 0;

  const start = () => {
    if (startBlockTimer(protocolId, block, l("Süre", "Timer"))) setVersion((value) => value + 1);
  };
  const stop = () => {
    if (timerId) cancelTimer(timerId);
    linkTimer(key, null);
    setVersion((value) => value + 1);
  };

  return (
    <div className="flex items-center gap-2">
      <Panel className="flex min-w-0 flex-1 items-center gap-2.5">
        <UsageIcon size={20} className="shrink-0 text-[#0B0B0C]" />
        {editing ? (
          <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} placeholder={l("Süre", "Timer")} className={`${CELL} min-w-0 flex-1`} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] text-[#0B0B0C]">{block.label || l("Süre", "Timer")}</span>
        )}
        {editing && !live ? (
          <input
            value={clock(seconds)}
            onChange={(event) => {
              const [m, s] = event.target.value.split(":");
              onChange({ ...block, seconds: (Number(m) || 0) * 60 + (Number(s) || 0) });
            }}
            inputMode="numeric"
            aria-label={l("Süre (dk:sn)", "Duration (min:s)")}
            className="w-[64px] shrink-0 bg-transparent text-right text-[17px] font-medium tabular-nums text-[#0B0B0C] outline-none"
          />
        ) : (
          <span className={`shrink-0 text-[17px] font-medium tabular-nums ${ringing ? "text-[#D7263D]" : "text-[#0B0B0C]"}`}>
            {clock(live ? timerLeft(live) : ringing ? 0 : seconds)}
          </span>
        )}
        {ringing ? (
          <button type="button" onClick={silenceTimers} className="shrink-0 rounded-full bg-[#D7263D] px-3 py-1.5 text-[14px] font-medium text-white">
            {l("Sustur", "Silence")}
          </button>
        ) : live ? (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => (live.state === "running" ? pauseTimer(live.id) : resumeTimer(live.id))}
              aria-label={live.state === "running" ? l("Duraklat", "Pause") : l("Devam", "Resume")}
              className="grid size-9 place-items-center rounded-full bg-white text-[#0B0B0C]"
            >
              {live.state === "running" ? <PauseIcon size={16} /> : <PlayIcon size={17} />}
            </button>
            <button type="button" onClick={stop} aria-label={l("İptal", "Cancel")} className="grid size-9 place-items-center rounded-full bg-white text-[#0B0B0C]">
              <CloseIcon size={17} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={!seconds}
            aria-label={l("Başlat", "Start")}
            className="grid size-9 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
            style={{ background: IRIS.blue }}
          >
            <PlayIcon size={17} />
          </button>
        )}
      </Panel>
      {editing && <Remove onClick={onRemove} />}
    </div>
  );
}

function StopwatchBlock({ block, editing, onChange, onRemove }: { block: Block; editing: boolean; onChange: (block: Block) => void; onRemove: () => void }) {
  const l = useL();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [kept, setKept] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);
  const elapsed = kept + (startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000));
  return (
    <div className="flex items-center gap-2">
      <Panel className="flex min-w-0 flex-1 items-center gap-2.5">
        <UsageIcon size={20} className="shrink-0 text-[#0B0B0C]" />
        {editing ? (
          <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} placeholder={l("Kronometre", "Stopwatch")} className={`${CELL} min-w-0 flex-1`} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] text-[#0B0B0C]">{block.label || l("Kronometre", "Stopwatch")}</span>
        )}
        <span className="shrink-0 text-[17px] font-medium tabular-nums text-[#0B0B0C]">{clock(elapsed)}</span>
        <button
          type="button"
          onClick={() => {
            if (startedAt === null) setStartedAt(Date.now());
            else {
              setKept(elapsed);
              setStartedAt(null);
            }
          }}
          aria-label={startedAt === null ? l("Başlat", "Start") : l("Durdur", "Stop")}
          className="grid size-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: startedAt === null ? IRIS.blue : "#1F1F1F" }}
        >
          {startedAt === null ? <PlayIcon size={17} /> : <PauseIcon size={16} />}
        </button>
        {startedAt === null && elapsed > 0 && (
          <button type="button" onClick={() => setKept(0)} aria-label={l("Sıfırla", "Reset")} className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#0B0B0C]">
            <ResetIcon size={17} />
          </button>
        )}
      </Panel>
      {editing && <Remove onClick={onRemove} />}
    </div>
  );
}

function TableBlock({ block, editing, onChange, onRemove }: { block: Block; editing: boolean; onChange: (block: Block) => void; onRemove: () => void }) {
  const l = useL();
  const rows = block.rows ?? [];
  const columns = rows[0]?.length ?? 3;
  const setCell = (r: number, c: number, value: string) => onChange({ ...block, rows: rows.map((row, ri) => row.map((cell, ci) => (ri === r && ci === c ? value : cell))) });
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 overflow-hidden rounded-[16px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">
        {rows.map((row, r) => (
          <div key={r} className={`grid ${r ? "border-t" : ""}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, borderColor: IRIS.line }}>
            {row.map((cell, c) => (
              <input
                key={c}
                value={cell}
                onChange={(event) => setCell(r, c, event.target.value)}
                aria-label={`${r + 1}-${c + 1}`}
                className={`min-w-0 px-2.5 py-2 text-[14px] text-[#0B0B0C] outline-none focus:bg-[#EEF3FE] ${c ? "border-l" : ""} ${r === 0 ? "font-medium" : ""}`}
                style={{ borderColor: IRIS.line }}
              />
            ))}
          </div>
        ))}
        <div className="flex border-t text-[13px]" style={{ borderColor: IRIS.line, color: IRIS.sub }}>
          <button type="button" onClick={() => onChange({ ...block, rows: [...rows, Array<string>(columns).fill("")] })} className="flex-1 py-1.5 active:bg-[#F2F0F1]">
            + {l("Satır", "Row")}
          </button>
          <button type="button" onClick={() => onChange({ ...block, rows: rows.map((row) => [...row, ""]) })} className="flex-1 border-l py-1.5 active:bg-[#F2F0F1]" style={{ borderColor: IRIS.line }}>
            + {l("Sütun", "Column")}
          </button>
        </div>
      </div>
      {editing && <Remove onClick={onRemove} />}
    </div>
  );
}

export function StepBlock({
  protocolId,
  block,
  editing,
  onChange,
  onRemove,
}: {
  protocolId: string;
  block: Block;
  editing: boolean;
  onChange: (block: Block) => void;
  onRemove: () => void;
}) {
  const l = useL();
  const router = useRouter();
  if (block.kind === "timer") return <TimerBlock protocolId={protocolId} block={block} editing={editing} onChange={onChange} onRemove={onRemove} />;
  if (block.kind === "stopwatch") return <StopwatchBlock block={block} editing={editing} onChange={onChange} onRemove={onRemove} />;
  if (block.kind === "table") return <TableBlock block={block} editing={editing} onChange={onChange} onRemove={onRemove} />;
  if (block.kind === "todo") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...block, done: !block.done })}
          aria-pressed={block.done}
          aria-label={block.label}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] border-[1.5px] transition-colors"
          style={{ background: block.done ? IRIS.blue : "#fff", borderColor: block.done ? IRIS.blue : "#BDBBBE", color: "#fff" }}
        >
          {block.done && <CheckIcon size={16} strokeWidth={2.4} />}
        </button>
        {editing ? (
          <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} placeholder={l("Yapılacak", "To-do")} className={`${CELL} min-w-0 flex-1`} />
        ) : (
          <span className={`min-w-0 flex-1 text-[15px] ${block.done ? "text-[#8E8C8E] line-through" : "text-[#0B0B0C]"}`}>{block.label}</span>
        )}
        {editing && <Remove onClick={onRemove} />}
      </div>
    );
  }
  if (block.kind === "note") {
    return (
      <div className="flex items-start gap-2">
        <Panel className="min-w-0 flex-1 bg-[#FFF7E0]">
          {editing ? (
            <>
              <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} placeholder={l("Başlık", "Title")} className={`${CELL} text-[13px] font-medium uppercase tracking-wide`} />
              <textarea value={block.body ?? ""} onChange={(event) => onChange({ ...block, body: event.target.value })} rows={2} placeholder={l("Not", "Note")} className={`${CELL} mt-1 resize-none leading-[21px]`} />
            </>
          ) : (
            <>
              {block.label && <p className="text-[12.5px] font-medium uppercase tracking-wide text-[#7A5A00]">{block.label}</p>}
              <p className="whitespace-pre-line text-[15px] leading-[21px] text-[#3A2F10]">{block.body}</p>
            </>
          )}
        </Panel>
        {editing && <Remove onClick={onRemove} />}
      </div>
    );
  }
  if (block.kind === "module") {
    // The modules and calculators a ChemPlus step could link to are not in ChemAI: Iris does the
    // calculation instead, without losing the place in the run.
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/?q=${encodeURIComponent(l(`${block.label} hesabını yap`, `Do the ${block.label} calculation`))}`)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] px-3.5 py-2.5 text-left"
          style={{ background: "#EEF3FE" }}
        >
          <NewChatIcon size={20} className="shrink-0" style={{ color: IRIS.blue }} />
          <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: IRIS.blue }}>
            {l(`${block.label} · İris'e hesaplat`, `${block.label} · ask Iris`)}
          </span>
        </button>
        {editing && <Remove onClick={onRemove} />}
      </div>
    );
  }
  const Icon = block.kind === "pdf" ? DocumentIcon : PhotoIcon;
  return (
    <div className="flex items-center gap-2">
      <Panel className="flex min-w-0 flex-1 items-center gap-2.5">
        <Icon size={20} className="shrink-0 text-[#0B0B0C]" />
        {editing ? (
          <input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} placeholder={block.kind === "pdf" ? l("PDF adı", "PDF name") : l("Görsel adı", "Image name")} className={`${CELL} min-w-0 flex-1`} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] text-[#0B0B0C]">{block.label}</span>
        )}
      </Panel>
      {editing && <Remove onClick={onRemove} />}
    </div>
  );
}

export const ADDABLE: { kind: BlockKind; tr: string; en: string }[] = [
  { kind: "timer", tr: "Süre", en: "Timer" },
  { kind: "stopwatch", tr: "Kronometre", en: "Stopwatch" },
  { kind: "todo", tr: "Yapılacak", en: "To-do" },
  { kind: "note", tr: "Not", en: "Note" },
  { kind: "table", tr: "Tablo", en: "Table" },
];
