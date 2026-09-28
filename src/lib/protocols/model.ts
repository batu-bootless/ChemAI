// Chem+ app: the editable protocol - what a procedure becomes once the user can change it.
//
// A protocol is steps; a step is a description plus blocks; a block is one concrete thing -
// a timer, a to-do, a table, a link into another module. Steps may sit in a group, which is how a
// long procedure gets a shape ("Seeding", "Workup") without becoming a second protocol.
//
// The built-in procedures in `data.ts` are templates. The first time the module opens they are
// materialised into this model so they are editable like anything else; from then on the store is
// the truth. They materialise in the language that was active at the time, because once a user
// edits a step the text is theirs and re-translating it would overwrite their words.

import type { InkColor } from "@/mobile/ui/ink";
import { PROTOCOLS as TEMPLATES, type Protocol as Template } from "./data";

export type BlockKind = "timer" | "stopwatch" | "table" | "todo" | "note" | "image" | "pdf" | "module";

export interface Block {
  id: string;
  kind: BlockKind;
  label: string;
  /** timer: the countdown length. */
  seconds?: number;
  /** todo: ticked or not. */
  done?: boolean;
  /** table: rows of cells, first row included (there is no separate header). */
  rows?: string[][];
  /** module: where the block points. */
  href?: string;
  /** note: the body. image / pdf: the file name. */
  body?: string;
}

export interface Step {
  id: string;
  emoji: string;
  color: InkColor;
  title: string;
  description: string;
  blocks: Block[];
  /** null when the step sits on its own rather than in a group. */
  groupId: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string;
}

export interface Protocol {
  id: string;
  emoji: string;
  color: InkColor;
  title: string;
  description: string;
  materials: string[];
  groups: Group[];
  /** Ordered; a step's place in a group comes from `groupId`, not from a nested list. */
  steps: Step[];
  updatedAt: number;
}

const KEY = "chemplus:protocols:v2";
const RUN_KEY = "chemplus:protocol-runs:v2";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Step colours cycle so a long protocol reads as bands rather than as one wall. */
const STEP_COLORS: InkColor[] = ["purple", "green", "blue", "orange", "pink", "cyan", "yellow", "teal"];
const STEP_EMOJIS = ["🌡️", "🧫", "🧪", "⚗️", "🔬", "💧", "🧊", "🔥", "📋", "⏱️"];

export const PROTOCOL_EMOJIS = ["🧬", "🧪", "⚗️", "🔬", "🧫", "💧", "🔥", "📋", "🌡️", "🧮", "📈", "🩺"];

export function stepColorFor(index: number): InkColor {
  return STEP_COLORS[index % STEP_COLORS.length];
}

export function stepEmojiFor(index: number): string {
  return STEP_EMOJIS[index % STEP_EMOJIS.length];
}

/** What the "Add" menu offers, beyond a link into a module. */
export interface BlockChoice {
  kind: BlockKind;
  label: { tr: string; en: string };
}

export const BLOCK_CHOICES: BlockChoice[] = [
  { kind: "timer", label: { tr: "Zamanlayıcı", en: "Timer" } },
  { kind: "stopwatch", label: { tr: "Kronometre", en: "Stopwatch" } },
  { kind: "table", label: { tr: "Tablo", en: "Table" } },
  { kind: "todo", label: { tr: "Yapılacak", en: "To-do" } },
  { kind: "note", label: { tr: "Not", en: "Note" } },
  { kind: "image", label: { tr: "Görsel", en: "Image" } },
  { kind: "pdf", label: { tr: "PDF", en: "PDF" } },
];

export function makeBlock(kind: BlockKind, label: string, href?: string): Block {
  const block: Block = { id: uid(), kind, label };
  if (kind === "timer") block.seconds = 300;
  if (kind === "stopwatch") block.seconds = 0;
  if (kind === "todo") block.done = false;
  if (kind === "table") block.rows = [["", "", ""], ["", "", ""]];
  if (kind === "module") block.href = href;
  if (kind === "note") block.body = "";
  return block;
}

export function makeStep(index: number, title: string, description = ""): Step {
  return {
    id: uid(),
    emoji: stepEmojiFor(index),
    color: stepColorFor(index),
    title,
    description,
    blocks: [],
    groupId: null,
  };
}

export function newProtocol(title: string): Protocol {
  return {
    id: uid(),
    emoji: "🧬",
    color: "orange",
    title,
    description: "",
    materials: [],
    groups: [],
    steps: [],
    updatedAt: Date.now(),
  };
}

/** Turns a built-in template into an editable protocol in the given language. */
function materialise(template: Template, language: "tr" | "en"): Protocol {
  const pick = (pair: { tr: string; en: string }) => (language === "en" ? pair.en : pair.tr);
  return {
    id: template.id,
    emoji: "🧬",
    color: "orange",
    title: pick(template.name),
    description: pick(template.summary),
    materials: [],
    groups: [],
    steps: template.steps.map((step, index) => {
      const blocks: Block[] = [];
      if (step.seconds) {
        blocks.push({ ...makeBlock("timer", language === "en" ? "Timer" : "Süre"), seconds: step.seconds });
      }
      // A caution is content, not decoration, so it survives the conversion as its own block.
      if (step.caution) {
        blocks.push({ ...makeBlock("note", language === "en" ? "Caution" : "Dikkat"), body: pick(step.caution) });
      }
      return {
        id: `${template.id}-${index}`,
        emoji: stepEmojiFor(index),
        color: stepColorFor(index),
        // A template step is one sentence; its first clause makes a usable title and the whole
        // sentence stays as the description, which is how the two fields differ from each other.
        title: pick(step.text).split(/[,.;:]/)[0].slice(0, 38),
        description: pick(step.text),
        blocks,
        groupId: null,
      };
    }),
    updatedAt: Date.now(),
  };
}

function read(): Protocol[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Protocol[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(protocols: Protocol[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(protocols));
  } catch {
    // storage unavailable: the edit lives only as long as the screen is open
  }
}

/** Seeds from the templates the first time, then the store is the truth. */
export function readProtocols(language: "tr" | "en"): Protocol[] {
  const stored = read();
  if (stored) return [...stored].sort((a, b) => b.updatedAt - a.updatedAt);
  const seeded = TEMPLATES.map((template) => materialise(template, language));
  write(seeded);
  return seeded;
}

export function saveProtocol(protocol: Protocol, language: "tr" | "en"): Protocol[] {
  const rest = readProtocols(language).filter((entry) => entry.id !== protocol.id);
  const next = [{ ...protocol, updatedAt: Date.now() }, ...rest];
  write(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeProtocol(id: string, language: "tr" | "en"): Protocol[] {
  const next = readProtocols(language).filter((entry) => entry.id !== id);
  write(next);
  return next;
}

/**
 * One run of a protocol: which steps are ticked and, once the run button has been pressed, its
 * clock. Kept apart from the protocol so editing a step never clears a run, and saved on every
 * change so a run survives leaving the screen - a step that links to a calculator sends the user
 * away mid-run, and they come back to the same step.
 */
export interface RunState {
  done: string[];
  /** When the run was first started; null until the run button is pressed. */
  startedAt: number | null;
  /** When the current stretch of running began; null while paused or finished. */
  activeSince: number | null;
  /** Milliseconds run before `activeSince`, so the clock survives a pause. */
  elapsed: number;
  /** When the last step was ticked; null until then. */
  finishedAt: number | null;
}

export const EMPTY_RUN: RunState = { done: [], startedAt: null, activeSince: null, elapsed: 0, finishedAt: null };

function readRuns(): Record<string, string[] | RunState> {
  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[] | RunState>) : {};
  } catch {
    return {};
  }
}

export function readRunState(protocolId: string): RunState {
  if (typeof window === "undefined") return EMPTY_RUN;
  const entry = readRuns()[protocolId];
  if (!entry) return EMPTY_RUN;
  // Runs saved before the run clock existed are a bare list of ticked steps.
  if (Array.isArray(entry)) return { ...EMPTY_RUN, done: entry };
  return { ...EMPTY_RUN, ...entry, done: Array.isArray(entry.done) ? entry.done : [] };
}

export function writeRunState(protocolId: string, run: RunState): void {
  try {
    const runs = readRuns();
    runs[protocolId] = run;
    window.localStorage.setItem(RUN_KEY, JSON.stringify(runs));
  } catch {
    // storage unavailable: the run lasts until the screen is closed
  }
}

/** Which steps are ticked, for the list's "3/9 done". */
export function readRun(protocolId: string): string[] {
  return readRunState(protocolId).done;
}

/** The wall clock, for the run's event handlers - a run is timed by taps, never by a render. */
export function wallClock(): number {
  return Date.now();
}

/** How long a run has been running, pauses left out. */
export function runElapsed(run: RunState, now: number): number {
  return run.elapsed + (run.activeSince === null ? 0 : Math.max(now - run.activeSince, 0));
}

/** mm:ss for a timer face. */
export function clock(seconds: number): string {
  const m = Math.floor(Math.max(seconds, 0) / 60);
  const s = Math.floor(Math.max(seconds, 0) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The steps of one group, in protocol order; `null` gives the ungrouped ones. */
export function stepsOf(protocol: Protocol, groupId: string | null): Step[] {
  return protocol.steps.filter((step) => step.groupId === groupId);
}

/**
 * Every step in the order the screen shows them - the loose steps first, then each group's - which
 * is the order a run walks and the order the step numbers count in.
 */
export function runOrder(protocol: Protocol): Step[] {
  return [...stepsOf(protocol, null), ...protocol.groups.flatMap((group) => stepsOf(protocol, group.id))];
}

/** A step can link one calculator rather than the whole calculators module. */
export const CALCULATORS_HREF = "/dashboard/calculators";

export function calculatorHref(slug: string): string {
  return `${CALCULATORS_HREF}/${slug}`;
}

/** The calculator a block links to, or null for any other link (the module itself included). */
export function calculatorSlugOf(href: string | undefined): string | null {
  if (!href?.startsWith(`${CALCULATORS_HREF}/`)) return null;
  return href.slice(CALCULATORS_HREF.length + 1).replace(/\/$/, "") || null;
}
