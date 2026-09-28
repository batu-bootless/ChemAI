"use client";

// ChemAI: the documents of the Library ("Belgeler") - everything Iris wrote for the user, read
// from the stores the actions write to (lib/agent/actions.ts): lab reports, notes, protocols and
// the chemical inventory. The modules that used to show them are gone; the Library is their home.

import { readExperiments, writeExperiments } from "@/lib/agent/actions";
import { readItems, removeItem, type InventoryItem } from "@/lib/inventory/store";
import { readProtocols, removeProtocol, type Protocol } from "@/lib/protocols/model";
import { PROTOCOLS as TEMPLATES } from "@/lib/protocols/data";
import { useStickyStore } from "@/store/stickyStore";
import type { Experiment } from "@/components/lab-notebook/notebook-core";
import type { StickyNote } from "@/types/sticky";

export type DocumentKind = "report" | "note" | "protocol" | "inventory";

export interface LibraryDocument {
  key: string;
  kind: DocumentKind;
  id: string;
  title: string;
  /** ms since epoch. */
  date: number;
  /** One line of what is inside. */
  preview: string;
}

export const KIND_LABEL: Record<DocumentKind, [tr: string, en: string]> = {
  report: ["Deney raporu", "Lab report"],
  note: ["Not", "Note"],
  protocol: ["Protokol", "Protocol"],
  inventory: ["Envanter", "Inventory"],
};

// --- notes: Tiptap JSON to plain lines ------------------------------------------------------------

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: { level?: number };
  content?: TiptapNode[];
}

function inline(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inline).join("");
}

/** A note's text, with "# " for headings and "- " for list items. */
export function noteText(note: Pick<StickyNote, "content">): string {
  try {
    const doc = JSON.parse(note.content) as TiptapNode;
    const lines: string[] = [];
    const walk = (node: TiptapNode, bullet = "") => {
      switch (node.type) {
        case "heading":
          lines.push(`${"#".repeat(Math.min(3, node.attrs?.level ?? 1))} ${inline(node)}`);
          return;
        case "paragraph":
          lines.push(`${bullet}${inline(node)}`);
          return;
        case "bulletList":
        case "orderedList":
        case "taskList":
          (node.content ?? []).forEach((item, index) =>
            (item.content ?? []).forEach((child) => walk(child, node.type === "orderedList" ? `${index + 1}. ` : "- "))
          );
          return;
        default:
          (node.content ?? []).forEach((child) => walk(child, bullet));
      }
    };
    walk(doc);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return note.content;
  }
}

// --- reading ------------------------------------------------------------------------------------------

const TEMPLATE_IDS = new Set(TEMPLATES.map((template) => template.id));

function firstLine(text: string, max = 90): string {
  return text.replace(/^[#\-\s]+/gm, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function experimentDate(experiment: Experiment): number {
  const parsed = Date.parse(experiment.date ?? "");
  const updated = Date.parse(experiment.updatedAt ?? "");
  return Number.isFinite(updated) ? updated : Number.isFinite(parsed) ? parsed : Date.now();
}

export function listDocuments(language: "tr" | "en"): LibraryDocument[] {
  if (typeof window === "undefined") return [];
  const docs: LibraryDocument[] = [];

  for (const experiment of readExperiments()) {
    docs.push({
      key: `report:${experiment.id}`,
      kind: "report",
      id: experiment.id,
      title: experiment.title || (language === "tr" ? "Deney raporu" : "Lab report"),
      date: experimentDate(experiment),
      preview: firstLine(experiment.objective || experiment.code || ""),
    });
  }

  for (const note of useStickyStore.getState().notes) {
    if (note.archived) continue;
    const text = noteText(note);
    docs.push({
      key: `note:${note.id}`,
      kind: "note",
      id: note.id,
      title: note.title || firstLine(text, 60) || (language === "tr" ? "Not" : "Note"),
      date: note.updatedAt || note.createdAt,
      preview: firstLine(text),
    });
  }

  for (const protocol of readProtocols(language)) {
    if (TEMPLATE_IDS.has(protocol.id)) continue;
    docs.push({
      key: `protocol:${protocol.id}`,
      kind: "protocol",
      id: protocol.id,
      title: protocol.title,
      date: protocol.updatedAt,
      preview: firstLine(protocol.description || protocol.steps.map((step) => step.title).join(" · ")),
    });
  }

  const inventory = readItems();
  if (inventory.length) {
    docs.push({
      key: "inventory:all",
      kind: "inventory",
      id: "all",
      title: language === "tr" ? "Kimyasal envanter" : "Chemical inventory",
      date: Math.max(...inventory.map((item) => item.updatedAt ?? 0), 0) || Date.now(),
      preview: inventory.slice(0, 4).map((item) => item.name).join(", "),
    });
  }

  return docs.sort((a, b) => b.date - a.date);
}

export function readReport(id: string): Experiment | null {
  return readExperiments().find((experiment) => experiment.id === id) ?? null;
}

export function readNote(id: string): StickyNote | null {
  return useStickyStore.getState().notes.find((note) => note.id === id) ?? null;
}

export function readProtocol(id: string, language: "tr" | "en"): Protocol | null {
  return readProtocols(language).find((protocol) => protocol.id === id) ?? null;
}

export function readInventory(): InventoryItem[] {
  return readItems();
}

export function deleteDocument(doc: Pick<LibraryDocument, "kind" | "id">, language: "tr" | "en"): void {
  switch (doc.kind) {
    case "report":
      writeExperiments(readExperiments().filter((experiment) => experiment.id !== doc.id));
      break;
    case "note":
      useStickyStore.getState().removeNote(doc.id);
      break;
    case "protocol":
      removeProtocol(doc.id, language);
      break;
    case "inventory":
      for (const item of readItems()) removeItem(item.id);
      break;
  }
  window.dispatchEvent(new Event("chemai:library"));
}
