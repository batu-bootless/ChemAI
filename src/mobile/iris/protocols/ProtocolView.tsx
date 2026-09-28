"use client";

// ChemAI: one protocol, open - read it, edit it, run it. Ported from the ChemPlus Protocols module
// into Iris's (Gemini) style.
//
// A run walks the steps in screen order: the step in hand opens with a "Şimdi" label and a
// "Adımı tamamla" button, finished steps fold away with a tick, the ones still to come fade back,
// and the screen follows the run down the page. The run bar starts, pauses and resumes it and
// keeps the clock; everything is saved as it goes, so leaving the screen never loses the place.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { htmlToPdf } from "@/lib/pdf/htmlToPdf";
import { buildProtocolHtml, protocolAsText } from "@/lib/protocols/exportHtml";
import {
  EMPTY_RUN,
  PROTOCOL_EMOJIS,
  clock,
  makeBlock,
  makeStep,
  readRunState,
  runElapsed,
  runOrder,
  stepsOf,
  uid,
  wallClock,
  writeRunState,
  type Block,
  type BlockKind,
  type Protocol,
  type RunState,
  type Step,
} from "@/lib/protocols/model";
import { useL, useLocale, type Translate } from "@/mobile/i18n";
import CircleButton from "../CircleButton";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FlagIcon,
  FlaskIcon,
  MoreIcon,
  NewChatIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ResetIcon,
  ShareIcon,
  TrashIcon,
  UndoIcon,
  VoiceIcon,
} from "../icons";
import { ConfirmDialog, PromptDialog } from "../NotebookDialogs";
import { GlassMenu } from "../OverlayPage";
import { useOverlay } from "../useOverlay";
import { IRIS } from "../theme";
import HandsFree from "./HandsFree";
import { ADDABLE, StepBlock } from "./StepBlocks";

export type RunPhase = "empty" | "idle" | "running" | "paused" | "finished";
type StepFocus = "current" | "done" | "upcoming" | null;

const EASE = [0.22, 1, 0.36, 1] as const;

function subscribeToSeconds(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}
const subscribeToNothing = () => () => {};
const currentSecond = () => Math.floor(Date.now() / 1000);

/** Wall-clock seconds, ticking while `live`. */
function useSeconds(live: boolean): number {
  return useSyncExternalStore(live ? subscribeToSeconds : subscribeToNothing, currentSecond, () => 0);
}

function runDuration(ms: number, l: Translate): string {
  const seconds = Math.max(Math.floor(ms / 1000), 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return l(`${h} sa ${m} dk`, `${h} h ${m} min`);
  if (m > 0) return l(`${m} dk ${s} sn`, `${m} min ${s} s`);
  return l(`${s} sn`, `${s} s`);
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
}

function PulseDot() {
  const reduce = useReducedMotion();
  return (
    <span className="relative grid size-2.5 shrink-0 place-items-center" aria-hidden="true">
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: IRIS.blue }}
          animate={{ scale: [1, 2.6], opacity: [0.5, 0] }}
          transition={{ duration: 1.25, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="size-2.5 rounded-full" style={{ background: IRIS.blue }} />
    </span>
  );
}

// --- the run bar -------------------------------------------------------------------------------------

const STRIPES = "repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.55) 0 6px, transparent 6px 12px)";

function RunBar({
  phase,
  total,
  doneCount,
  position,
  elapsed,
  onPress,
  onPause,
}: {
  phase: RunPhase;
  total: number;
  doneCount: number;
  position: number;
  elapsed: number;
  onPress: () => void;
  onPause: () => void;
}) {
  const l = useL();
  const reduce = useReducedMotion();
  const running = phase === "running";
  const donePercent = phase === "finished" ? 100 : total ? (doneCount / total) * 100 : 0;
  const label =
    phase === "empty"
      ? l("Henüz adım yok", "No steps yet")
      : phase === "idle"
        ? l(`Başlat · ${total} adım`, `Start · ${total} steps`)
        : phase === "paused"
          ? l(`Devam et · Adım ${position} / ${total}`, `Resume · Step ${position} of ${total}`)
          : phase === "finished"
            ? l("Tamamlandı", "Complete")
            : l(`Adım ${position} / ${total}`, `Step ${position} of ${total}`);
  const showClock = phase !== "idle" && phase !== "empty" && elapsed >= 1000;

  return (
    <div className={`-mx-4 flex gap-2.5 px-4 pb-3 pt-2 ${running ? "sticky z-30" : ""}`} style={running ? { background: IRIS.bg, top: "var(--app-safe-top)" } : undefined}>
      <button
        type="button"
        onClick={onPress}
        disabled={phase === "empty"}
        aria-label={running ? l("Şu anki adıma git", "Go to the current step") : label}
        className="relative h-[56px] min-w-0 flex-1 overflow-hidden rounded-full bg-white text-[#0B0B0C] shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_6px_18px_-10px_rgb(0_0_0/0.3)] transition active:scale-[0.99] disabled:opacity-60"
      >
        <motion.span
          aria-hidden="true"
          className="absolute inset-y-0 left-0"
          style={{ background: "#D3E3FD" }}
          initial={false}
          animate={{ width: `${donePercent}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 170, damping: 26 }}
        />
        <AnimatePresence>
          {running && total > 0 && (
            <motion.span
              key="current"
              aria-hidden="true"
              className="absolute inset-y-0"
              style={{ backgroundColor: "#D3E3FD", backgroundImage: STRIPES }}
              initial={reduce ? false : { left: `${donePercent}%`, width: "0%" }}
              animate={{ left: `${donePercent}%`, width: `${100 / total}%`, backgroundPositionX: reduce ? "0px" : ["0px", "16.97px"] }}
              exit={{ opacity: 0 }}
              transition={{ left: { type: "spring", stiffness: 170, damping: 26 }, width: { type: "spring", stiffness: 170, damping: 26 }, backgroundPositionX: { duration: 0.7, repeat: Infinity, ease: "linear" } }}
            />
          )}
        </AnimatePresence>
        <span className="relative flex items-center justify-center gap-2 px-16 text-[16px] font-medium">
          {running ? <PulseDot /> : phase === "finished" ? <CheckIcon size={18} strokeWidth={2.2} /> : <PlayIcon size={18} />}
          <span className="truncate">{label}</span>
        </span>
        {showClock && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium tabular-nums" style={{ color: IRIS.sub }}>
            {clock(Math.floor(elapsed / 1000))}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {running && (
          <motion.button
            key="pause"
            type="button"
            onClick={onPause}
            aria-label={l("Duraklat", "Pause")}
            initial={reduce ? false : { width: 0, opacity: 0 }}
            animate={{ width: 56, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="grid h-[56px] shrink-0 place-items-center overflow-hidden rounded-full bg-white text-[#0B0B0C] shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_6px_18px_-10px_rgb(0_0_0/0.3)]"
          >
            <PauseIcon size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- a step ---------------------------------------------------------------------------------------------

function StepCard({
  protocolId,
  step,
  number,
  done,
  focus,
  open,
  editing,
  isLast,
  canGoBack,
  onToggleOpen,
  onToggleDone,
  onPrevious,
  onPatch,
  onRemove,
  onMove,
  anchorRef,
}: {
  protocolId: string;
  step: Step;
  number: number;
  done: boolean;
  focus: StepFocus;
  open: boolean;
  editing: boolean;
  isLast: boolean;
  canGoBack: boolean;
  onToggleOpen: () => void;
  onToggleDone: () => void;
  onPrevious: () => void;
  onPatch: (patch: Partial<Step>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  anchorRef: (node: HTMLDivElement | null) => void;
}) {
  const l = useL();
  const reduce = useReducedMotion();
  const current = focus === "current";
  const [adding, setAdding] = useState(false);

  const setBlock = (id: string, block: Block) => onPatch({ blocks: step.blocks.map((entry) => (entry.id === id ? block : entry)) });
  const addBlock = (kind: BlockKind, label: string) => {
    onPatch({ blocks: [...step.blocks, makeBlock(kind, label)] });
    setAdding(false);
  };

  return (
    <motion.div
      ref={anchorRef}
      className="relative scroll-mt-[84px]"
      initial={false}
      animate={{ marginTop: current ? 24 : 0, opacity: focus === "upcoming" ? 0.55 : 1 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
    >
      <AnimatePresence initial={false}>
        {current && (
          <motion.span
            key="now"
            className="absolute bottom-[calc(100%+5px)] left-2 flex items-center gap-2 text-[12.5px] font-medium uppercase tracking-[0.12em]"
            style={{ color: IRIS.blue }}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <PulseDot />
            {l("Şimdi", "Now")}
          </motion.span>
        )}
      </AnimatePresence>

      <div
        className="rounded-[22px] bg-white p-3.5 transition-shadow duration-300"
        style={{ boxShadow: current ? `0 0 0 2px ${IRIS.blue}, 0 10px 28px -14px rgb(11 87 208 / 0.45)` : "0 0 0 1px rgb(0 0 0 / 0.06)" }}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggleDone}
            aria-pressed={done}
            aria-label={done ? l("Tamamlanmadı yap", "Mark not done") : l("Tamamlandı işaretle", "Mark done")}
            className="relative mt-[1px] grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] text-[14px] font-medium transition-colors duration-200"
            style={{ background: done ? IRIS.blue : "#fff", borderColor: done ? IRIS.blue : "#C9C7CB", color: done ? "#fff" : IRIS.sub }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={done ? "done" : "todo"}
                className="grid place-items-center"
                initial={reduce ? false : { scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
              >
                {done ? <CheckIcon size={17} strokeWidth={2.4} /> : number}
              </motion.span>
            </AnimatePresence>
          </button>
          <div className="min-w-0 flex-1 pt-[5px]">
            {editing ? (
              <input
                value={step.title}
                onChange={(event) => onPatch({ title: event.target.value })}
                aria-label={l("Adım başlığı", "Step title")}
                className="iris-input-17 w-full bg-transparent text-[17px] font-medium leading-[22px] text-[#0B0B0C] outline-none"
              />
            ) : (
              <button type="button" onClick={onToggleOpen} className={`block w-full text-left text-[17px] font-medium leading-[22px] ${done ? "text-[#8E8C8E] line-through" : "text-[#0B0B0C]"}`}>
                {step.title}
              </button>
            )}
          </div>
          <button type="button" onClick={onToggleOpen} aria-label={open ? l("Kapat", "Collapse") : l("Aç", "Expand")} aria-expanded={open} className="grid size-8 shrink-0 place-items-center rounded-full" style={{ color: IRIS.sub }}>
            <motion.span animate={reduce ? undefined : { rotate: open ? 90 : 0 }} transition={{ duration: 0.18 }} className="grid place-items-center">
              <ChevronRightIcon size={18} strokeWidth={2.2} />
            </motion.span>
          </button>
        </div>

        {editing && (
          <div className="mt-2 flex gap-1.5 pl-11">
            <button type="button" onClick={() => onMove(-1)} aria-label={l("Yukarı", "Up")} className="grid size-9 place-items-center rounded-full" style={{ background: IRIS.row }}>
              <ArrowUpIcon size={17} />
            </button>
            <button type="button" onClick={() => onMove(1)} aria-label={l("Aşağı", "Down")} className="grid size-9 place-items-center rounded-full" style={{ background: IRIS.row }}>
              <ArrowDownIcon size={17} />
            </button>
            <button type="button" onClick={onRemove} aria-label={l("Adımı sil", "Delete step")} className="grid size-9 place-items-center rounded-full text-[#D7263D]" style={{ background: "#FDECEC" }}>
              <TrashIcon size={17} />
            </button>
          </div>
        )}

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="space-y-2.5 pl-11 pt-2.5">
                {editing ? (
                  <textarea
                    value={step.description}
                    onChange={(event) => onPatch({ description: event.target.value })}
                    rows={2}
                    placeholder={l("Bu adımı anlat.", "Describe this step.")}
                    className="w-full resize-none rounded-[14px] px-3 py-2 text-[15px] leading-[21px] text-[#0B0B0C] outline-none placeholder:text-[#A8A6A9]"
                    style={{ background: IRIS.row }}
                  />
                ) : (
                  step.description &&
                  step.description !== step.title && (
                    <p className="whitespace-pre-line text-[15px] leading-[22px]" style={{ color: "#3A393C" }}>
                      {step.description}
                    </p>
                  )
                )}
                {step.blocks.map((block) => (
                  <StepBlock
                    key={block.id}
                    protocolId={protocolId}
                    block={block}
                    editing={editing}
                    onChange={(next) => setBlock(block.id, next)}
                    onRemove={() => onPatch({ blocks: step.blocks.filter((entry) => entry.id !== block.id) })}
                  />
                ))}
                {editing && (
                  <div>
                    <button type="button" onClick={() => setAdding((value) => !value)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium" style={{ background: IRIS.row }}>
                      <PlusIcon size={16} /> {l("Ekle", "Add")}
                    </button>
                    {adding && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ADDABLE.map((item) => (
                          <button
                            key={item.kind}
                            type="button"
                            onClick={() => addBlock(item.kind, l(item.tr, item.en))}
                            className="rounded-full bg-white px-3 py-1.5 text-[14px] shadow-[0_0_0_1px_rgb(0_0_0/0.1)]"
                          >
                            {l(item.tr, item.en)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {current && (
            <motion.div
              key="complete"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.26, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="flex gap-2.5 pt-3.5">
                {canGoBack && (
                  <button
                    type="button"
                    onClick={onPrevious}
                    aria-label={l("Önceki adıma dön", "Back to the previous step")}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[#0B0B0C]"
                    style={{ background: IRIS.row }}
                  >
                    <UndoIcon size={20} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onToggleDone}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#1F1F1F] text-[16px] font-medium text-white active:scale-[0.99]"
                >
                  {isLast ? <FlagIcon size={19} /> : <CheckIcon size={19} strokeWidth={2.2} />}
                  {isLast ? l("Protokolü bitir", "Finish protocol") : l("Adımı tamamla", "Complete step")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- sheets --------------------------------------------------------------------------------------------

function MaterialsSheet({ materials, onChange, onClose }: { materials: string[]; onChange: (materials: string[]) => void; onClose: () => void }) {
  const l = useL();
  const [draft, setDraft] = useState("");
  useOverlay(true, onClose);
  const add = () => {
    if (!draft.trim()) return;
    onChange([...materials, draft.trim()]);
    setDraft("");
  };
  return (
    <>
      <motion.div className="fixed inset-0 z-[90] bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={l("Malzemeler", "Materials")}
        className="iris-ui fixed inset-x-0 bottom-0 z-[91] flex max-h-[80vh] flex-col rounded-t-[30px] pt-2"
        style={{ background: IRIS.sheet, paddingBottom: "calc(var(--app-safe-bottom) + 18px)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
      >
        <div className="mx-auto h-[5px] w-9 rounded-full bg-[#C7C7CC]" aria-hidden="true" />
        <h2 className="px-5 pb-3 pt-4 text-[22px] text-[#0B0B0C]">{l("Malzemeler", "Materials")}</h2>
        <div className="mx-4 min-h-0 overflow-y-auto rounded-[22px] bg-white">
          {materials.length === 0 && (
            <p className="px-5 py-4 text-[15px]" style={{ color: IRIS.sectionInk }}>
              {l("Henüz malzeme yok.", "No materials yet.")}
            </p>
          )}
          {materials.map((entry, index) => (
            <div key={index} className={`flex items-center gap-2 pl-5 pr-2 ${index ? "border-t" : ""}`} style={{ borderColor: IRIS.separator }}>
              <input
                value={entry}
                onChange={(event) => onChange(materials.map((item, i) => (i === index ? event.target.value : item)))}
                className="iris-input-17 h-[50px] min-w-0 flex-1 bg-transparent text-[17px] text-[#0B0B0C] outline-none"
              />
              <button type="button" onClick={() => onChange(materials.filter((_, i) => i !== index))} aria-label={l("Sil", "Delete")} className="grid size-10 place-items-center rounded-full text-[#D7263D]">
                <TrashIcon size={19} />
              </button>
            </div>
          ))}
        </div>
        <div className="mx-4 mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
            placeholder={l("ör. 250 mL balon joje", "e.g. 250 mL volumetric flask")}
            className="iris-input-17 h-12 min-w-0 flex-1 rounded-full bg-white px-4 text-[17px] text-[#0B0B0C] outline-none placeholder:text-[#A8A6A9]"
          />
          <button type="button" onClick={add} aria-label={l("Ekle", "Add")} className="grid size-12 shrink-0 place-items-center rounded-full bg-[#1F1F1F] text-white">
            <PlusIcon size={22} />
          </button>
        </div>
      </motion.div>
    </>
  );
}

function CompleteDialog({ protocol, steps, elapsed, onClose, onRestart }: { protocol: Protocol; steps: number; elapsed: number; onClose: () => void; onRestart: () => void }) {
  const l = useL();
  const reduce = useReducedMotion();
  useOverlay(true, onClose);
  return (
    <motion.div className="iris-ui fixed inset-0 z-[100] grid place-items-center bg-black/30 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="presentation">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={l("Protokol tamamlandı", "Protocol complete")}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[360px] rounded-[30px] bg-white px-6 pb-5 pt-7 text-center shadow-[0_24px_70px_-20px_rgb(0_0_0/0.45)]"
        initial={reduce ? false : { scale: 0.85, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
      >
        <motion.div
          className="mx-auto grid size-[72px] place-items-center rounded-full text-[34px]"
          style={{ background: "#D3E3FD" }}
          initial={reduce ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 12, delay: 0.12 }}
        >
          🏁
        </motion.div>
        <h2 className="mt-4 text-[24px] leading-tight text-[#0B0B0C]">{l("Protokol tamamlandı!", "Protocol complete!")}</h2>
        <p className="mt-1 line-clamp-2 text-[15px]" style={{ color: IRIS.sub }}>
          {protocol.emoji} {protocol.title}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5 text-left">
          <div className="rounded-[18px] px-4 py-3" style={{ background: IRIS.row }}>
            <p className="text-[13px]" style={{ color: IRIS.sub }}>
              {l("Adım", "Steps")}
            </p>
            <p className="mt-0.5 text-[20px] font-medium text-[#0B0B0C]">
              {steps}/{steps}
            </p>
          </div>
          <div className="rounded-[18px] px-4 py-3" style={{ background: IRIS.row }}>
            <p className="text-[13px]" style={{ color: IRIS.sub }}>
              {l("Süre", "Time")}
            </p>
            <p className="mt-0.5 text-[20px] font-medium text-[#0B0B0C]">{elapsed >= 1000 ? runDuration(elapsed, l) : "—"}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="mt-5 h-12 w-full rounded-full bg-[#1F1F1F] text-[16px] font-medium text-white">
          {l("Harika", "Great")}
        </button>
        <button type="button" onClick={onRestart} className="mx-auto mt-2 flex items-center gap-1.5 px-3 py-2 text-[15px] font-medium" style={{ color: IRIS.sub }}>
          <ResetIcon size={17} />
          {l("Baştan çalıştır", "Run it again")}
        </button>
      </motion.div>
    </motion.div>
  );
}

// --- the screen -----------------------------------------------------------------------------------------

export default function ProtocolView({
  protocol,
  autoRun,
  onChange,
  onBack,
  onDelete,
}: {
  protocol: Protocol;
  /** Opened from a chat's "Protokolü çalıştır": start (or resume) the run straight away. */
  autoRun?: boolean;
  onChange: (protocol: Protocol) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const l = useL();
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const router = useRouter();
  const reduce = useReducedMotion();
  const [run, setRun] = useState<RunState>(() => readRunState(protocol.id));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState<{ groupId: string | null } | "group" | null>(null);
  const [busy, setBusy] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const autoStarted = useRef(false);

  const order = runOrder(protocol);
  const doneSet = new Set(run.done);
  const doneCount = order.filter((step) => doneSet.has(step.id)).length;
  const total = order.length;
  const allDone = total > 0 && doneCount === total;
  const current = order.find((step) => !doneSet.has(step.id)) ?? null;
  const currentId = current?.id ?? null;
  const position = current ? order.indexOf(current) + 1 : total;
  const phase: RunPhase =
    total === 0 ? "empty" : allDone ? "finished" : run.activeSince !== null ? "running" : doneCount > 0 || run.startedAt !== null ? "paused" : "idle";
  const running = phase === "running";
  const elapsed = runElapsed(run, useSeconds(running) * 1000);
  const numbers = new Map(order.map((step, index) => [step.id, index + 1]));

  useEffect(() => {
    writeRunState(protocol.id, run);
  }, [protocol.id, run]);

  // The screen follows the run to the step in hand, once the finished one has folded away.
  useEffect(() => {
    if (!running || !currentId) return;
    const id = window.setTimeout(() => {
      cards.current.get(currentId)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 280);
    return () => window.clearTimeout(id);
  }, [running, currentId, reduce]);

  function start() {
    if (total === 0) return;
    const now = wallClock();
    setRun((prev) => ({ ...prev, startedAt: prev.startedAt ?? now, activeSince: now, finishedAt: null }));
    setExpanded({});
    setEditing(false);
    vibrate(20);
  }

  function pause() {
    const now = wallClock();
    setRun((prev) => (prev.activeSince === null ? prev : { ...prev, elapsed: prev.elapsed + Math.max(now - prev.activeSince, 0), activeSince: null }));
  }

  function restart() {
    const now = wallClock();
    setRun({ ...EMPTY_RUN, startedAt: now, activeSince: now });
    setExpanded({});
    setSummaryOpen(false);
  }

  // From a chat card: run it now (or show how it went, when it is already finished).
  useEffect(() => {
    if (!autoRun || autoStarted.current) return;
    autoStarted.current = true;
    if (phase === "idle" || phase === "paused") start();
    else if (phase === "finished") setSummaryOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  /** Ticks or unticks a step; ticking the last open one finishes the run. */
  function setStepDone(stepId: string, value: boolean) {
    const now = wallClock();
    const finishes = value && order.every((step) => step.id === stepId || doneSet.has(step.id));
    setRun((prev) => {
      const done = value ? (prev.done.includes(stepId) ? prev.done : [...prev.done, stepId]) : prev.done.filter((id) => id !== stepId);
      // Ticking by hand while nothing runs starts the clock, so the steps move on as expected.
      const started = prev.startedAt ?? now;
      const activeSince = value && prev.activeSince === null && !finishes ? now : prev.activeSince;
      if (!finishes) return { ...prev, done, startedAt: started, activeSince, finishedAt: null };
      const ran = prev.activeSince === null ? prev.elapsed : prev.elapsed + Math.max(now - prev.activeSince, 0);
      return { ...prev, done, startedAt: started, elapsed: ran, activeSince: null, finishedAt: now };
    });
    setExpanded({});
    if (finishes) {
      setSummaryOpen(true);
      vibrate([40, 60, 140]);
    } else if (value) vibrate(25);
  }

  function previous() {
    const before = order[position - 2];
    if (before) setStepDone(before.id, false);
  }

  function pressBar() {
    if (phase === "idle" || phase === "paused") start();
    else if (phase === "running" && currentId) cards.current.get(currentId)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    else if (phase === "finished") setSummaryOpen(true);
  }

  function focusOf(step: Step): StepFocus {
    if (phase === "finished") return "done";
    if (phase !== "running") return null;
    if (step.id === currentId) return "current";
    return doneSet.has(step.id) ? "done" : "upcoming";
  }

  const patchStep = (id: string, patch: Partial<Step>) => onChange({ ...protocol, steps: protocol.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)) });

  function removeStep(id: string) {
    onChange({ ...protocol, steps: protocol.steps.filter((step) => step.id !== id) });
    setRun((prev) => ({ ...prev, done: prev.done.filter((entry) => entry !== id) }));
  }

  function moveStep(id: string, direction: -1 | 1) {
    const step = protocol.steps.find((entry) => entry.id === id);
    if (!step) return;
    const siblings = stepsOf(protocol, step.groupId);
    const swapWith = siblings[siblings.findIndex((entry) => entry.id === id) + direction];
    if (!swapWith) return;
    const a = protocol.steps.findIndex((entry) => entry.id === id);
    const b = protocol.steps.findIndex((entry) => entry.id === swapWith.id);
    const next = [...protocol.steps];
    [next[a], next[b]] = [next[b], next[a]];
    onChange({ ...protocol, steps: next });
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const name = protocol.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "protokol";
      await htmlToPdf(buildProtocolHtml(protocol, language), `${name}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = protocolAsText(protocol, language);
    try {
      if (navigator.share) await navigator.share({ title: protocol.title, text });
      else await navigator.clipboard.writeText(text);
    } catch {
      // the share sheet was dismissed
    }
  }

  function openHandsFree() {
    setEditing(false);
    setHandsFree(true);
  }

  /** A voice note from hands-free mode, kept in the step it was said at, with the time. */
  function addVoiceNote(text: string) {
    if (!current) return;
    const time = new Date().toLocaleTimeString(language === "en" ? "en-GB" : "tr-TR", { hour: "2-digit", minute: "2-digit" });
    patchStep(current.id, { blocks: [...current.blocks, { ...makeBlock("note", l(`Sesli not · ${time}`, `Voice note · ${time}`)), body: text }] });
  }

  const askIris = () => {
    const text = protocolAsText(protocol, language).slice(0, 1600);
    router.push(`/dashboard/?q=${encodeURIComponent(l(`Bu protokolü birlikte gözden geçirelim; hesapları ve güvenliği kontrol et:\n${text}`, `Let's review this protocol; check the calculations and safety:\n${text}`))}`);
  };

  function renderStep(step: Step) {
    const focus = focusOf(step);
    const fallback = focus === null || focus === "current";
    return (
      <StepCard
        key={step.id}
        protocolId={protocol.id}
        step={step}
        number={numbers.get(step.id) ?? 0}
        done={doneSet.has(step.id)}
        focus={focus}
        open={editing || (expanded[step.id] ?? fallback)}
        editing={editing}
        isLast={doneCount === total - 1}
        canGoBack={position > 1}
        onToggleOpen={() => setExpanded((prev) => ({ ...prev, [step.id]: !(prev[step.id] ?? fallback) }))}
        onToggleDone={() => setStepDone(step.id, !doneSet.has(step.id))}
        onPrevious={previous}
        onPatch={(patch) => patchStep(step.id, patch)}
        onRemove={() => removeStep(step.id)}
        onMove={(direction) => moveStep(step.id, direction)}
        anchorRef={(node) => {
          if (node) cards.current.set(step.id, node);
          else cards.current.delete(step.id);
        }}
      />
    );
  }

  const menu = [
    { label: editing ? l("Düzenlemeyi bitir", "Done editing") : l("Düzenle", "Edit"), icon: <PencilIcon size={20} />, onSelect: () => setEditing((value) => !value) },
    { label: l("Malzemeler", "Materials"), icon: <FlaskIcon size={20} />, onSelect: () => setMaterialsOpen(true) },
    ...(total > 0 && phase !== "finished"
      ? [{ label: l("Eller serbest (sesle yürüt)", "Hands-free (run by voice)"), icon: <VoiceIcon size={20} />, onSelect: () => openHandsFree() }]
      : []),
    { label: l("İris'e sor", "Ask Iris"), icon: <NewChatIcon size={20} />, onSelect: askIris },
    { label: l("Paylaş", "Share"), icon: <ShareIcon size={20} />, onSelect: () => void share() },
    { label: busy ? l("Hazırlanıyor…", "Preparing…") : l("PDF olarak indir", "Save as PDF"), icon: <DownloadIcon size={20} />, onSelect: () => void exportPdf() },
    ...(doneCount > 0 || run.startedAt !== null
      ? [
          {
            label: l("İlerlemeyi sıfırla", "Reset progress"),
            icon: <ResetIcon size={20} />,
            onSelect: () => {
              setRun(EMPTY_RUN);
              setExpanded({});
            },
          },
        ]
      : []),
    { label: l("Protokolü sil", "Delete protocol"), icon: <TrashIcon size={20} />, danger: true, onSelect: () => setConfirmDelete(true) },
  ];

  return (
    <main
      className={`iris-ui min-h-[var(--app-content-h)] ${handsFree ? "pb-[calc(var(--app-safe-bottom)+170px)]" : "pb-[calc(var(--app-safe-bottom)+40px)]"}`}
      style={{ background: IRIS.bg }}
    >
      <header className="flex h-[60px] items-center justify-between px-[15px] pt-[8px]">
        <CircleButton label={l("Protokoller", "Protocols")} onClick={onBack}>
          <ChevronLeftIcon size={24} strokeWidth={1.9} />
        </CircleButton>
        <div className="relative">
          <CircleButton label={l("Diğer", "More")} onClick={() => setMenuOpen((value) => !value)} active={menuOpen}>
            <MoreIcon size={24} />
          </CircleButton>
          <AnimatePresence>{menuOpen && <GlassMenu items={menu} onClose={() => setMenuOpen(false)} />}</AnimatePresence>
        </div>
      </header>

      <div className="px-4">
        <div className="mt-3 flex items-start gap-3">
          {editing ? (
            <div className="grid w-full gap-2">
              <div className="flex flex-wrap gap-1.5">
                {PROTOCOL_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onChange({ ...protocol, emoji })}
                    className="grid size-10 place-items-center rounded-[12px] text-[20px]"
                    style={{ background: protocol.emoji === emoji ? "#D3E3FD" : IRIS.row }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <input
                value={protocol.title}
                onChange={(event) => onChange({ ...protocol, title: event.target.value })}
                placeholder={l("Protokol adı", "Protocol name")}
                className="iris-input-17 h-12 w-full rounded-[16px] bg-white px-4 text-[17px] font-medium text-[#0B0B0C] outline-none shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
              />
              <textarea
                value={protocol.description}
                onChange={(event) => onChange({ ...protocol, description: event.target.value })}
                rows={2}
                placeholder={l("Bu protokol ne yapar?", "What does this protocol do?")}
                className="w-full resize-none rounded-[16px] bg-white px-4 py-3 text-[15px] leading-[21px] text-[#0B0B0C] outline-none shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
              />
            </div>
          ) : (
            <>
              <span className="grid size-[52px] shrink-0 place-items-center rounded-[16px] text-[28px]" style={{ background: IRIS.row }}>
                {protocol.emoji}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h1 className="text-[26px] leading-[31px] tracking-[-0.01em] text-[#0B0B0C]">{protocol.title}</h1>
                {protocol.description && (
                  <p className="mt-1 text-[15px] leading-[21px]" style={{ color: IRIS.sub }}>
                    {protocol.description}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMaterialsOpen(true)} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] text-[#0B0B0C]" style={{ background: IRIS.row }}>
            <FlaskIcon size={17} />
            {l("Malzemeler", "Materials")}
            {protocol.materials.length > 0 && <span style={{ color: IRIS.sub }}>· {protocol.materials.length}</span>}
          </button>
          <span className="flex items-center rounded-full px-3.5 py-2 text-[14px]" style={{ background: IRIS.row, color: IRIS.sub }}>
            {l(`${total} adım`, `${total} steps`)}
          </span>
          {total > 0 && phase !== "finished" && !editing && (
            <button
              type="button"
              onClick={() => (handsFree ? setHandsFree(false) : openHandsFree())}
              aria-pressed={handsFree}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px]"
              style={handsFree ? { background: IRIS.selected, color: IRIS.blue } : { background: IRIS.row, color: "#0B0B0C" }}
            >
              <VoiceIcon size={17} />
              {l("Eller serbest", "Hands-free")}
            </button>
          )}
          {editing && (
            <button type="button" onClick={() => setEditing(false)} className="rounded-full bg-[#1F1F1F] px-4 py-2 text-[14px] font-medium text-white">
              {l("Bitti", "Done")}
            </button>
          )}
        </div>

        <div className="mt-3">
          <RunBar phase={phase} total={total} doneCount={doneCount} position={position} elapsed={elapsed} onPress={pressBar} onPause={pause} />
        </div>

        <div className="mt-1 space-y-3">
          {stepsOf(protocol, null).map(renderStep)}
          {protocol.groups.map((group) => (
            <section key={group.id} className="pt-2">
              <div className="flex items-center gap-2 px-1 pb-2">
                <h2 className="min-w-0 flex-1 truncate text-[18px] font-medium text-[#0B0B0C]">{group.name}</h2>
                {editing && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...protocol,
                        groups: protocol.groups.filter((entry) => entry.id !== group.id),
                        steps: protocol.steps.map((step) => (step.groupId === group.id ? { ...step, groupId: null } : step)),
                      })
                    }
                    aria-label={l("Grubu sil", "Delete group")}
                    className="grid size-9 place-items-center rounded-full text-[#D7263D]"
                    style={{ background: "#FDECEC" }}
                  >
                    <TrashIcon size={17} />
                  </button>
                )}
              </div>
              {group.description && (
                <p className="-mt-1 px-1 pb-2 text-[14px]" style={{ color: IRIS.sub }}>
                  {group.description}
                </p>
              )}
              <div className="space-y-3">
                {stepsOf(protocol, group.id).map(renderStep)}
                {editing && (
                  <button type="button" onClick={() => setAdding({ groupId: group.id })} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full border-[1.5px] border-dashed text-[15px]" style={{ borderColor: "#C9C7CB", color: IRIS.sub }}>
                    <PlusIcon size={18} /> {l("Adım ekle", "Add step")}
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>

        {(editing || total === 0) && (
          <div className="mt-4 flex gap-2.5">
            <button type="button" onClick={() => setAdding({ groupId: null })} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-dashed text-[15px]" style={{ borderColor: "#C9C7CB", color: IRIS.sub }}>
              <PlusIcon size={18} /> {l("Adım ekle", "Add step")}
            </button>
            <button type="button" onClick={() => setAdding("group")} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-dashed text-[15px]" style={{ borderColor: "#C9C7CB", color: IRIS.sub }}>
              <PlusIcon size={18} /> {l("Grup ekle", "Add group")}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {handsFree && (
          <HandsFree
            key="hands-free"
            protocol={protocol}
            current={current}
            position={position}
            total={total}
            paused={phase !== "running"}
            finished={phase === "finished"}
            onDone={() => current && setStepDone(current.id, true)}
            onBack={previous}
            onResume={start}
            onPause={pause}
            onNote={addVoiceNote}
            onClose={() => setHandsFree(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {materialsOpen && <MaterialsSheet key="materials" materials={protocol.materials} onChange={(materials) => onChange({ ...protocol, materials })} onClose={() => setMaterialsOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {summaryOpen && <CompleteDialog key="done" protocol={protocol} steps={total} elapsed={elapsed} onClose={() => setSummaryOpen(false)} onRestart={restart} />}
      </AnimatePresence>
      {adding && (
        <PromptDialog
          title={adding === "group" ? l("Yeni grup", "New group") : l("Yeni adım", "New step")}
          initial=""
          placeholder={adding === "group" ? l("Grup adı", "Group name") : l("Adım adı", "Step name")}
          max={80}
          confirmLabel={l("Ekle", "Add")}
          onSave={(name) => {
            const title = name.trim();
            if (!title) return;
            if (adding === "group") onChange({ ...protocol, groups: [...protocol.groups, { id: uid(), name: title, description: "" }] });
            else onChange({ ...protocol, steps: [...protocol.steps, { ...makeStep(protocol.steps.length, title), groupId: adding.groupId }] });
          }}
          onClose={() => setAdding(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={l("Protokol silinsin mi?", "Delete protocol?")}
          text={l("Protokol ve ilerlemesi bu cihazdan silinir.", "The protocol and its progress are removed from this device.")}
          confirmLabel={l("Sil", "Delete")}
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}
