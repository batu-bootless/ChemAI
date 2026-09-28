// Chem+ app: the shelf inventory, kept on the device.
//
// An item may be linked to a safety card by id. That link is what lets the module do the one
// thing a spreadsheet cannot: look at what shares a cupboard and say which pairs must not. The
// check only uses the incompatibilities already written on the safety cards, so the inventory
// never invents a rule of its own.

import { CHEMICALS, chemicalById, type SafetyCategory } from "@/lib/safety/chemicals";
import type { Incompatibility } from "@/lib/safety/chemicals";

const KEY = "chemplus:inventory:v1";

export interface InventoryItem {
  id: string;
  name: string;
  /** Safety card this bottle is, when it matched one. */
  chemicalId?: string;
  amount: string;
  unit: string;
  location: string;
  lot?: string;
  /** ISO date, or empty when the bottle carries none. */
  expiry?: string;
  notes?: string;
  updatedAt: number;
}

export const UNITS = ["g", "kg", "mg", "mL", "L", "adet"];

function read(): InventoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as InventoryItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: InventoryItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage unavailable: the change is simply not kept
  }
}

export function readItems(): InventoryItem[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveItem(item: InventoryItem): InventoryItem[] {
  const rest = read().filter((entry) => entry.id !== item.id);
  const next = [{ ...item, updatedAt: Date.now() }, ...rest];
  write(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeItem(id: string): InventoryItem[] {
  const next = read().filter((entry) => entry.id !== id);
  write(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function newItem(): InventoryItem {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    amount: "",
    unit: "g",
    location: "",
    updatedAt: Date.now(),
  };
}

/** Name suggestions from the safety card set, so a linked bottle is the easy path. */
export function suggestChemicals(query: string, language: "tr" | "en"): { id: string; label: string }[] {
  const q = query.trim().toLocaleLowerCase("tr");
  if (q.length < 2) return [];
  return CHEMICALS.filter((chemical) =>
    [chemical.name, chemical.nameTr, chemical.formula, ...chemical.synonyms]
      .join(" ")
      .toLocaleLowerCase("tr")
      .includes(q)
  )
    .slice(0, 6)
    .map((chemical) => ({ id: chemical.id, label: language === "en" ? chemical.name : chemical.nameTr }));
}

/** The incompatibility tags that name a whole shelf category the inventory can recognise. */
const TAG_TO_CATEGORY: Partial<Record<Incompatibility, SafetyCategory>> = {
  strongAcids: "acid",
  strongBases: "base",
  oxidisers: "oxidiser",
  organics: "solvent",
};

export interface Conflict {
  a: InventoryItem;
  b: InventoryItem;
  /**
   * Every reason the pair clashes. Two bottles usually name each other - the base says "keep away
   * from strong acids" and the acid says "keep away from strong bases" - and that is one fact
   * about one shelf, so it is reported once with both reasons rather than twice.
   */
  tags: Incompatibility[];
  location: string;
}

/**
 * Pairs sharing a location where one card says to keep away from what the other one is. Only
 * linked items take part - an unlinked bottle is a name, and guessing from a name would produce
 * warnings nobody can check.
 */
export function findConflicts(items: InventoryItem[]): Conflict[] {
  const byLocation = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = item.location.trim().toLocaleLowerCase("tr");
    if (!key || !item.chemicalId) continue;
    const list = byLocation.get(key) ?? [];
    list.push(item);
    byLocation.set(key, list);
  }

  const conflicts: Conflict[] = [];
  for (const [, list] of byLocation) {
    // i < j, so each pair is considered once and both directions are folded into one entry.
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = chemicalById(list[i].chemicalId as string);
        const b = chemicalById(list[j].chemicalId as string);
        if (!a || !b) continue;
        const tags = new Set<Incompatibility>();
        for (const tag of a.incompatible) if (TAG_TO_CATEGORY[tag] === b.category) tags.add(tag);
        for (const tag of b.incompatible) if (TAG_TO_CATEGORY[tag] === a.category) tags.add(tag);
        if (tags.size > 0) {
          conflicts.push({ a: list[i], b: list[j], tags: [...tags], location: list[i].location });
        }
      }
    }
  }
  return conflicts;
}

export type ExpiryState = "expired" | "soon" | "ok" | "none";

/** "soon" is within sixty days, which is long enough to order a replacement. */
export function expiryState(item: InventoryItem, now = Date.now()): ExpiryState {
  if (!item.expiry) return "none";
  const time = Date.parse(item.expiry);
  if (!Number.isFinite(time)) return "none";
  const days = (time - now) / (24 * 60 * 60 * 1000);
  if (days < 0) return "expired";
  if (days <= 60) return "soon";
  return "ok";
}
