"use client";

// Chem+ app: what Iris can do in the app's modules from a conversation - start a timer, write a
// note, set up a protocol, put a bottle on the inventory, write a lab-notebook report (and its
// PDF), draw a graph. Each one really happens in its module, on the device, and comes back as a
// card in the chat (src/components/ai/AgentCards.tsx) instead of sending the user to the module.
//
// They run as tools of the calculation engine (src/lib/chem-engine/tools.ts), so the planner picks
// them and the answer is told what was done. A reopened conversation must not do it all again: the
// first run writes the new record's id into the call (`_id`), and a call carrying one only shows
// the record as it is now.

import { fmt, type Language } from "@/lib/chem-engine/format";
import type { ToolOutcome } from "@/lib/chem-engine/tools";
import { askAiGraph, askAiReport } from "@/lib/ai/client";
import { upsertActivity } from "@/lib/activityLog";
import { findConflicts, newItem, readItems, saveItem, UNITS } from "@/lib/inventory/store";
import { makeBlock, makeStep, newProtocol, readProtocols, saveProtocol, type Protocol } from "@/lib/protocols/model";
import { CHEMICALS, INCOMPATIBILITY_LABELS } from "@/lib/safety/chemicals";
import { graphSpecFromAi, loadLibrary, saveLibrary } from "@/lib/graph-studio/store";
import {
  STORAGE_KEY as NOTEBOOK_KEY,
  blankExperiment,
  chemical,
  normalizeExperiment,
  observation,
  recomputeExperiment,
  reportSections,
  slug,
  step,
  today,
  uid,
  type ChemicalUsed,
  type Experiment,
  type Observation,
  type ProcedureStep,
} from "@/components/lab-notebook/notebook-core";
import { useStickyStore } from "@/store/stickyStore";
import { createTimer, getTimer } from "./timers";
import type { GraphCardData, InventoryCardData, NoteCardData, ProtocolCardData, ReportCardData, TimerCardData } from "./types";

type Args = Record<string, unknown>;

// --- helpers --------------------------------------------------------------------------------------

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "");

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : item && typeof item === "object" ? str((item as Args).name ?? (item as Args).title ?? (item as Args).text) : ""))
    .map((item) => item.trim())
    .filter(Boolean);
}

function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function withTimeout<T>(job: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${what} zamanında bitmedi.`)), ms);
    job.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function done<D>(tool: string, args: Args, title: string, llm: string, data: D, notes: string[] = [], checks: string[] = []): ToolOutcome {
  return { tool, args, ok: true, source: "app", title, llm, checks, notes, data } as unknown as ToolOutcome;
}

function failed(tool: string, args: Args, error: string): ToolOutcome {
  return { tool, args, ok: false, error };
}

/** "5 dk", "1 sa 30 dk", "45 sn". */
export function durationText(seconds: number, language: Language): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const tr = language === "tr";
  return [h && `${h} ${tr ? "sa" : "h"}`, m && `${m} ${tr ? "dk" : "min"}`, s && `${s} ${tr ? "sn" : "s"}`].filter(Boolean).join(" ") || `0 ${tr ? "sn" : "s"}`;
}

// --- timer ------------------------------------------------------------------------------------------

export async function runTimer(args: Args, language: Language): Promise<ToolOutcome> {
  const tr = language === "tr";
  const known = str(args._id);
  if (known) {
    const timer = getTimer(known);
    const data: TimerCardData = { id: known, label: timer?.label ?? str(args.label), seconds: timer?.seconds ?? Math.round((number(args.minutes) ?? 0) * 60 + (number(args.seconds) ?? 0)) };
    return done("timer", args, `${data.label || (tr ? "Zamanlayıcı" : "Timer")} · ${durationText(data.seconds, language)}`, `Zamanlayıcı (${durationText(data.seconds, language)}) daha önce başlatılmıştı.`, data);
  }
  const total = Math.round((number(args.hours) ?? 0) * 3600 + (number(args.minutes) ?? 0) * 60 + (number(args.seconds) ?? 0));
  if (!(total >= 1 && total <= 24 * 3600)) {
    return failed("timer", args, tr ? "Süre anlaşılamadı (1 saniye ile 24 saat arası olmalı)." : "The duration was unclear (1 second to 24 hours).");
  }
  const label = str(args.label) || (tr ? "Zamanlayıcı" : "Timer");
  const timer = createTimer(total, label);
  const data: TimerCardData = { id: timer.id, label, seconds: total };
  const endsAt = new Date(Date.now() + total * 1000).toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  return done(
    "timer",
    { ...args, _id: timer.id },
    `${label} · ${durationText(total, language)}`,
    `YAPILDI: ${durationText(total, language)} zamanlayıcı başlatıldı ("${label}"), ${endsAt}'de bitecek; bitince alarm çalar ve telefona bildirim gelir. Kullanıcı sohbetteki karttan duraklatıp iptal edebilir.`,
    data,
    [],
    [tr ? `Bitiş: ${endsAt}` : `Ends at ${endsAt}`]
  );
}

// --- note -------------------------------------------------------------------------------------------

interface DocNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: DocNode[];
}

const paragraph = (text: string, bold = false): DocNode => ({
  type: "paragraph",
  content: text ? [{ type: "text", text, ...(bold ? { marks: [{ type: "bold" }] } : {}) }] : [],
});

/** Plain lines ("# " a heading, "- " an item, "1. " a numbered item) as the notes editor's document. */
export function noteDocument(text: string): DocNode {
  const content: DocNode[] = [];
  let list: DocNode | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (heading) {
      list = null;
      // The notes editor has no headings: a heading is a bold line.
      content.push(paragraph(heading[1], true));
      continue;
    }
    if (bullet || numbered) {
      const type = bullet ? "bulletList" : "orderedList";
      if (!list || list.type !== type) {
        list = { type, content: [] };
        content.push(list);
      }
      list.content!.push({ type: "listItem", content: [paragraph((bullet ?? numbered)![1])] });
      continue;
    }
    list = null;
    content.push(paragraph(line));
  }
  return { type: "doc", content: content.length ? content : [paragraph("")] };
}

/** The notes editor's document back as plain lines, for the card. */
export function noteText(json: string): string {
  let doc: DocNode;
  try {
    doc = JSON.parse(json) as DocNode;
  } catch {
    return json;
  }
  const textOf = (node: DocNode): string => (node.text ?? "") + (node.content ?? []).map(textOf).join("");
  const lines: string[] = [];
  const walk = (node: DocNode) => {
    if (node.type === "paragraph") {
      const bold = node.content?.length && node.content.every((child) => child.marks?.some((mark) => mark.type === "bold"));
      lines.push(bold ? `# ${textOf(node)}` : textOf(node));
    } else if (node.type === "bulletList" || node.type === "taskList") {
      for (const item of node.content ?? []) lines.push(`- ${textOf(item)}`);
    } else if (node.type === "orderedList") {
      (node.content ?? []).forEach((item, index) => lines.push(`${index + 1}. ${textOf(item)}`));
    } else {
      for (const child of node.content ?? []) walk(child);
    }
  };
  walk(doc);
  return lines.join("\n").trim();
}

export async function runNote(args: Args, language: Language): Promise<ToolOutcome> {
  const tr = language === "tr";
  const known = str(args._id);
  if (known) {
    const note = useStickyStore.getState().notes.find((item) => item.id === known);
    const data: NoteCardData = note
      ? { id: known, title: note.title, text: noteText(note.content), exists: true }
      : { id: known, title: str(args.title), text: str(args.content), exists: false };
    return done("note", args, `${tr ? "Not" : "Note"} · ${data.title}`, `Not daha önce oluşturulmuştu: "${data.title}".`, data);
  }
  const title = (str(args.title) || (tr ? "Not" : "Note")).slice(0, 80);
  const text = str(args.content) || str(args.text);
  if (!text) return failed("note", args, tr ? "Notun içeriği yok." : "The note has no content.");
  const id = useStickyStore.getState().createNote({
    title,
    content: JSON.stringify(noteDocument(text)),
    closed: true,
  });
  const data: NoteCardData = { id, title, text, exists: true };
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  return done("note", { ...args, _id: id }, `${tr ? "Not" : "Note"} · ${title}`, `YAPILDI: "${title}" notu kaydedildi (${lines} satır).`, data);
}

// --- protocol ---------------------------------------------------------------------------------------

function protocolData(protocol: Protocol, exists: boolean): ProtocolCardData {
  return {
    id: protocol.id,
    emoji: protocol.emoji,
    title: protocol.title,
    description: protocol.description,
    materials: protocol.materials,
    steps: protocol.steps.map((item) => {
      const timer = item.blocks.find((block) => block.kind === "timer");
      return { title: item.title, description: item.description, minutes: timer?.seconds ? Math.round(timer.seconds / 6) / 10 : null };
    }),
    exists,
  };
}

const PROTOCOL_EMOJI: [RegExp, string][] = [
  [/titra/i, "🧪"],
  [/sentez|synthes/i, "⚗️"],
  [/kristal|crystal/i, "🧊"],
  [/spektr|spectr|uv|ır\b|ir\b/i, "🔬"],
  [/tampon|buffer|çözelti|solution/i, "💧"],
  [/hücre|cell|kültür|culture|pcr|dna/i, "🧫"],
];

/**
 * The amounts the calculation engine found earlier in the same question ("weigh 5.844 g NaCl"), so
 * a protocol carries checked numbers instead of the planner's own arithmetic.
 */
function engineAmounts(earlier: ToolOutcome[], language: Language): string[] {
  const tr = language === "tr";
  const n = (value: number) => fmt(value, language, 4);
  const lines: string[] = [];
  for (const outcome of earlier) {
    if (!outcome.ok) continue;
    if (outcome.tool === "solution_prep") {
      const { data } = outcome;
      const name = data.pretty || (tr ? "madde" : "substance");
      const target = `${n(data.concentration)} M, ${n(data.volume)} mL ${name}`;
      if (data.weighMass !== undefined) {
        const purity = number(outcome.args.purity_percent);
        const impure = purity !== null && purity > 0 && purity < 100;
        lines.push(
          tr
            ? `${target}: ${n(data.weighMass)} g ${name} tartılır${impure ? ` (saflık %${n(purity)} hesaba katıldı)` : ""}.`
            : `${target}: weigh ${n(data.weighMass)} g of ${name}${impure ? ` (${n(purity)} % purity included)` : ""}.`
        );
      } else if (data.stockVolume_mL !== undefined) {
        const percent = number(outcome.args.stock_percent);
        const density = number(outcome.args.density_g_mL);
        const molar = `${n(data.stockMolarity ?? 0)} M`;
        const stock = percent && density ? (tr ? `%${n(percent)} (d = ${n(density)} g/mL, ≈ ${molar})` : `${n(percent)} % (d = ${n(density)} g/mL, ≈ ${molar})`) : molar;
        lines.push(
          tr
            ? `${target}: ${n(data.stockVolume_mL)} mL ${stock} stok alınır, ${n(data.volume)} mL'ye tamamlanır.`
            : `${target}: take ${n(data.stockVolume_mL)} mL of the ${stock} stock and make up to ${n(data.volume)} mL.`
        );
      }
    } else if (outcome.tool === "dilution") {
      const d = outcome.data;
      lines.push(
        tr
          ? `${n(d.V1)} ${d.volumeUnit} stok (${n(d.C1)} ${d.concentrationUnit}) alınır, ${n(d.V2)} ${d.volumeUnit} olacak şekilde seyreltilir (${n(d.C2)} ${d.concentrationUnit}).`
          : `Take ${n(d.V1)} ${d.volumeUnit} of the ${n(d.C1)} ${d.concentrationUnit} stock and dilute to ${n(d.V2)} ${d.volumeUnit} (${n(d.C2)} ${d.concentrationUnit}).`
      );
    }
  }
  return lines;
}

export async function runProtocol(args: Args, language: Language, earlier: ToolOutcome[] = []): Promise<ToolOutcome> {
  const tr = language === "tr";
  const known = str(args._id);
  if (known) {
    const protocol = readProtocols(language).find((item) => item.id === known);
    const data: ProtocolCardData = protocol
      ? protocolData(protocol, true)
      : { id: known, emoji: "🧬", title: str(args.title), description: str(args.description), materials: strings(args.materials), steps: [], exists: false };
    return done("protocol", args, `${tr ? "Protokol" : "Protocol"} · ${data.title}`, `Protokol daha önce oluşturulmuştu: "${data.title}".`, data);
  }
  const rawSteps = Array.isArray(args.steps) ? args.steps : [];
  const steps = rawSteps
    .map((item) =>
      typeof item === "string"
        ? { title: item, description: "", minutes: null as number | null }
        : item && typeof item === "object"
          ? { title: str((item as Args).title), description: str((item as Args).description), minutes: number((item as Args).minutes) }
          : null
    )
    .filter((item): item is { title: string; description: string; minutes: number | null } => Boolean(item && (item.title || item.description)))
    .slice(0, 24);
  if (steps.length === 0) return failed("protocol", args, tr ? "Protokolün adımları yok." : "The protocol has no steps.");
  // The engine's numbers open the protocol; the planner's steps say "the calculated amount".
  const amounts = engineAmounts(earlier, language);
  if (amounts.length) steps.unshift({ title: tr ? "Hesaplanan miktarlar" : "Calculated amounts", description: amounts.join("\n"), minutes: null });
  const title = (str(args.title) || (tr ? "Yeni protokol" : "New protocol")).slice(0, 90);
  const protocol = newProtocol(title);
  protocol.emoji = PROTOCOL_EMOJI.find(([pattern]) => pattern.test(title))?.[1] ?? "🧬";
  protocol.description = str(args.description);
  protocol.materials = strings(args.materials).slice(0, 40);
  protocol.steps = steps.map((item, index) => {
    const made = makeStep(index, item.title || `${tr ? "Adım" : "Step"} ${index + 1}`, item.title ? item.description : "");
    if (item.minutes && item.minutes > 0) {
      const block = makeBlock("timer", tr ? "Bekleme" : "Wait");
      block.seconds = Math.round(Math.min(item.minutes, 24 * 60) * 60);
      made.blocks.push(block);
    }
    return made;
  });
  saveProtocol(protocol, language);
  const waits = steps.filter((item) => item.minutes && item.minutes > 0).length;
  return done(
    "protocol",
    { ...args, _id: protocol.id },
    `${tr ? "Protokol" : "Protocol"} · ${title}`,
    `YAPILDI: Protokoller'e "${title}" protokolü eklendi: ${steps.length} adım${waits ? `, ${waits} adımda zamanlayıcı` : ""}${protocol.materials.length ? `, ${protocol.materials.length} malzeme` : ""}${amounts.length ? "; ilk adımda hesap motorunun bulduğu miktarlar var" : ""}.`,
    protocolData(protocol, true)
  );
}

// --- inventory --------------------------------------------------------------------------------------

const SUBSCRIPTS: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
const plainFormula = (formula: string) => formula.replace(/[₀-₉]/g, (d) => SUBSCRIPTS[d] ?? d).replace(/\s+/g, "");
const lower = (text: string) => text.trim().toLocaleLowerCase("tr");

/** The safety card a bottle is, when its name or formula is exactly one of the cards'. */
function safetyCardFor(name: string, formula: string) {
  const n = lower(name);
  const f = plainFormula(formula);
  return (
    CHEMICALS.find((item) => [item.name, item.nameTr, ...item.synonyms].some((candidate) => lower(candidate) === n)) ??
    (f ? CHEMICALS.find((item) => plainFormula(item.formula) === f) : undefined) ??
    null
  );
}

export async function runInventoryAdd(args: Args, language: Language): Promise<ToolOutcome> {
  const tr = language === "tr";
  const known = str(args._id);
  if (known) {
    const item = readItems().find((entry) => entry.id === known);
    const card = item?.chemicalId ? CHEMICALS.find((entry) => entry.id === item.chemicalId) : null;
    const data: InventoryCardData = {
      id: known,
      name: item?.name ?? str(args.name),
      formula: str(args.formula),
      amount: item?.amount ?? str(args.amount),
      unit: item?.unit ?? str(args.unit),
      location: item?.location ?? str(args.location),
      lot: item?.lot ?? "",
      expiry: item?.expiry ?? "",
      linked: card ? (tr ? card.nameTr : card.name) : null,
      exists: Boolean(item),
    };
    return done("inventory_add", args, `${tr ? "Envanter" : "Inventory"} · ${data.name}`, `Envanter kaydı daha önce eklenmişti: ${data.name}.`, data);
  }
  const name = str(args.name);
  if (!name) return failed("inventory_add", args, tr ? "Kimyasalın adı yok." : "The chemical has no name.");
  const formula = str(args.formula);
  const unit = UNITS.includes(str(args.unit)) ? str(args.unit) : "g";
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(str(args.expiry)) ? str(args.expiry) : "";
  const card = safetyCardFor(name, formula);
  const item = newItem();
  item.name = name;
  item.amount = str(args.amount);
  item.unit = unit;
  item.location = str(args.location);
  item.lot = str(args.lot) || undefined;
  item.expiry = expiry || undefined;
  item.notes = [formula && `${tr ? "Formül" : "Formula"}: ${formula}`, str(args.cas) && `CAS: ${str(args.cas)}`, str(args.notes)].filter(Boolean).join(" · ") || undefined;
  if (card) item.chemicalId = card.id;
  const items = saveItem(item);
  const warnings = findConflicts(items)
    .filter((conflict) => conflict.a.id === item.id || conflict.b.id === item.id)
    .map((conflict) => {
      const other = conflict.a.id === item.id ? conflict.b : conflict.a;
      const why = conflict.tags.map((tag) => INCOMPATIBILITY_LABELS[tag][tr ? "tr" : "en"]).join(", ");
      return tr ? `Dikkat: "${conflict.location}" konumunda ${other.name} ile uyumsuz (${why}).` : `Careful: at "${conflict.location}" it clashes with ${other.name} (${why}).`;
    });
  const data: InventoryCardData = {
    id: item.id,
    name,
    formula,
    amount: item.amount,
    unit,
    location: item.location,
    lot: item.lot ?? "",
    expiry,
    linked: card ? (tr ? card.nameTr : card.name) : null,
    exists: true,
  };
  return done(
    "inventory_add",
    { ...args, _id: item.id },
    `${tr ? "Envanter" : "Inventory"} · ${name}`,
    `YAPILDI: Envantere eklendi: ${name}${formula ? ` (${formula})` : ""}${item.amount ? `, ${item.amount} ${unit}` : ""}${item.location ? `, konum ${item.location}` : ""}${expiry ? `, SKT ${expiry}` : ""}.${card ? ` Güvenlik kartıyla eşleşti (${card.nameTr}).` : ""}${warnings.length ? ` ${warnings.join(" ")}` : ""}`,
    data,
    warnings,
    card ? [tr ? `Güvenlik kartına bağlandı: ${card.nameTr}` : `Linked to the safety card: ${card.name}`] : []
  );
}

// --- lab notebook report ----------------------------------------------------------------------------

export function readExperiments(): Experiment[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(NOTEBOOK_KEY) || "[]");
    const list = Array.isArray(parsed) ? parsed : (parsed as { experiments?: unknown })?.experiments;
    return Array.isArray(list) ? list.map((item) => normalizeExperiment(item as Partial<Experiment> & Record<string, unknown>)) : [];
  } catch {
    return [];
  }
}

// The notebook's builders fill in demo values (99 % purity, "10 min, 25 C" on every step, an
// example SDS link); a report the user dictated carries only what the user said.
function userChemical(name: string, formula: string, quantity: string, unit: string, hazard: string): ChemicalUsed {
  return {
    ...chemical(uid("chem"), name, formula, quantity, unit, hazard),
    casNumber: "",
    concentration: "",
    purity: "",
    storageCondition: "",
    sdsLink: "",
    ppeRequirement: "",
    wasteDisposalNote: "",
    notes: "",
  };
}

function userStep(number: number, title: string, description: string): ProcedureStep {
  return { ...step(uid("step"), number, title, description, ""), duration: "", temperature: "", pressure: "", pH: "", observationNote: "", isCompleted: true };
}

function userObservation(text: string): Observation {
  return { ...observation(uid("obs"), text.slice(0, 48), "Other", "", text), time: "", notes: "" };
}

const TURKISH: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
/** A file name that keeps Turkish words readable ("çözeltisi" → "cozeltisi", not "zeltisi"). */
const fileSlug = (text: string) => slug(text.replace(/[çğıİöşüÇĞÖŞÜ]/g, (char) => TURKISH[char] ?? char));

export function writeExperiments(experiments: Experiment[]): void {
  window.localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(experiments));
}

/** What the notebook's own "write the report" asks the AI with (as LabNotebook.tsx builds it). */
function experimentContext(e: Experiment): string {
  const chem = e.chemicals.map((c) => [c.name, c.formula].filter(Boolean).join(" ")).filter(Boolean).join(", ");
  const proc = e.procedure.map((s, i) => `${i + 1}. ${s.title || s.description}`).join("\n");
  const obs = e.observations.map((o) => o.description || o.title).filter(Boolean).join("; ");
  return [
    `Deney başlığı: ${e.title || "-"}`,
    e.objective && `Amaç: ${e.objective}`,
    chem && `Kullanılan kimyasallar: ${chem}`,
    proc && `Prosedür:\n${proc}`,
    e.rawData && `Ham veriler: ${e.rawData}`,
    obs && `Gözlemler: ${obs}`,
    e.results.finalResult && `Sonuçlar: ${e.results.finalResult}`,
    e.calculations && `Hesaplamalar: ${e.calculations}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function reportData(experiment: Experiment, pdf: ReportCardData["pdf"], exists: boolean): ReportCardData {
  return {
    id: experiment.id,
    code: experiment.code,
    title: experiment.title,
    sections: reportSections(experiment).filter(([, text]) => text && text.trim()),
    pdf,
    fileName: `${fileSlug(experiment.code)}-${fileSlug(experiment.title)}.pdf`,
    exists,
  };
}

/** Makes the report's PDF and hands it to the phone's downloads (the notebook's own exporter). */
export async function saveReportPdf(experimentId: string): Promise<boolean> {
  const experiment = readExperiments().find((item) => item.id === experimentId);
  if (!experiment) return false;
  const { exportReportPdf } = await import("@/components/lab-notebook/reportPdf");
  await exportReportPdf(experiment, `${fileSlug(experiment.code)}-${fileSlug(experiment.title)}.pdf`);
  return true;
}

export async function runLabReport(args: Args, language: Language): Promise<ToolOutcome> {
  const tr = language === "tr";
  const known = str(args._id);
  if (known) {
    const experiment = readExperiments().find((item) => item.id === known);
    const data: ReportCardData = experiment
      ? reportData(experiment, "none", true)
      : { id: known, code: "", title: str(args.title), sections: [], pdf: "none", fileName: "", exists: false };
    return done("lab_report", args, `${tr ? "Deney raporu" : "Lab report"} · ${data.title}`, `Rapor daha önce oluşturulmuştu: "${data.title}".`, data);
  }
  const title = (str(args.title) || (tr ? "Deney raporu" : "Lab report")).slice(0, 120);
  let experiment: Experiment = {
    ...blankExperiment(),
    title,
    code: `NBL-${Date.now().toString().slice(-5)}`,
    date: today(),
    objective: str(args.objective),
    hypothesis: str(args.hypothesis),
    rawData: str(args.rawData),
    calculations: str(args.calculations),
    status: "Completed",
  };
  const chemicals = Array.isArray(args.chemicals) ? args.chemicals : [];
  experiment.chemicals = chemicals
    .map((item) => (typeof item === "string" ? { name: item } : (item as Args)))
    .filter((item) => item && str(item.name))
    .slice(0, 20)
    .map((item) => userChemical(str(item.name), str(item.formula), str(item.quantity), str(item.unit), str(item.hazard)));
  experiment.procedure = strings(args.procedure)
    .slice(0, 25)
    .map((text, index) => userStep(index + 1, text.length > 60 ? `${tr ? "Adım" : "Step"} ${index + 1}` : text, text));
  experiment.observations = strings(args.observations).slice(0, 20).map(userObservation);
  experiment.results = { ...experiment.results, finalResult: str(args.results) };

  // The sections a report needs and the user did not dictate are written by the notebook's AI.
  const notes: string[] = [];
  try {
    const draft = await withTimeout(askAiReport(experimentContext(experiment)), 35_000, "Rapor yazımı");
    experiment = {
      ...experiment,
      theory: str(args.theory) || draft.theory || "",
      discussion: str(args.discussion) || draft.discussion || "",
      errorAnalysis: draft.errorAnalysis || "",
      conclusionAndRecommendations: str(args.conclusion) || draft.conclusionAndRecommendations || "",
      safetyAndWaste: draft.safetyAndWaste || "",
    };
  } catch (error) {
    notes.push(tr ? `Kuram ve tartışma bölümleri yazılamadı: ${error instanceof Error ? error.message : "hata"}` : "The theory and discussion could not be written.");
  }
  experiment = recomputeExperiment(experiment);
  writeExperiments([experiment, ...readExperiments().filter((item) => item.id !== experiment.id)]);
  upsertActivity("notebook", experiment.id, experiment.title, experiment.code, `/dashboard/lab-notebook?experiment=${experiment.id}`);

  let pdf: ReportCardData["pdf"] = "none";
  if (args.pdf === true || args.pdf === "true") {
    try {
      await withTimeout(saveReportPdf(experiment.id), 35_000, "PDF");
      pdf = "saved";
    } catch (error) {
      pdf = "failed";
      notes.push(tr ? `PDF oluşturulamadı (${error instanceof Error ? error.message : "hata"}); karttaki düğmeyle tekrar dene.` : "The PDF could not be made; try the button on the card.");
    }
  }
  const data = reportData(experiment, pdf, true);
  return done(
    "lab_report",
    { ...args, _id: experiment.id },
    `${tr ? "Deney raporu" : "Lab report"} · ${title}`,
    `YAPILDI: "${title}" deney raporu oluşturuldu (${experiment.code}); dolu bölümler: ${data.sections.map(([heading]) => heading).join(", ")}.${pdf === "saved" ? ` PDF'i indirildi (${data.fileName}).` : pdf === "failed" ? " PDF oluşturulamadı." : ""}`,
    data,
    notes
  );
}

// --- graph ------------------------------------------------------------------------------------------

export async function runGraph(args: Args, language: Language): Promise<ToolOutcome> {
  const tr = language === "tr";
  const known = str(args._id);
  if (known) {
    const spec = loadLibrary().find((item) => item.id === known);
    if (!spec) return failed("graph", args, tr ? "Bu grafik artık kayıtlı değil." : "This graph is no longer saved.");
    const data: GraphCardData = { spec, exists: true };
    return done("graph", args, `${tr ? "Grafik" : "Graph"} · ${spec.title}`, `Grafik daha önce çizilmişti: "${spec.title}".`, data);
  }
  const request = str(args.request) || str(args.prompt) || str(args.title);
  const columns = strings(args.columns);
  const rows = Array.isArray(args.rows)
    ? (args.rows as unknown[]).filter(Array.isArray).map((row) => (row as unknown[]).map((cell) => str(cell)))
    : [];
  if (!request && rows.length === 0) return failed("graph", args, tr ? "Grafik için veri ya da istek yok." : "No data or request for the graph.");
  const result = await withTimeout(
    askAiGraph(request || (tr ? "Bu verinin grafiğini çiz." : "Plot this data."), columns.length && rows.length ? { columns, rows } : undefined),
    40_000,
    "Grafik"
  );
  const spec = graphSpecFromAi(result);
  spec.description = result.note || "";
  saveLibrary([spec, ...loadLibrary().filter((item) => item.id !== spec.id)]);
  const data: GraphCardData = { spec, exists: true };
  const kind: Record<string, string> = { column: "sütun", bar: "çubuk", line: "çizgi", area: "alan", scatter: "saçılım", pie: "pasta", histogram: "histogram", candlestick: "mum" };
  return done(
    "graph",
    { ...args, _id: spec.id },
    `${tr ? "Grafik" : "Graph"} · ${spec.title}`,
    `YAPILDI: "${spec.title}" ${kind[spec.type] ?? spec.type} grafiği çizildi (${spec.data.rows.length} satır veri, sütunlar: ${spec.data.columns.join(", ")}).${result.note ? ` Not: ${result.note}` : ""}`,
    data
  );
}
