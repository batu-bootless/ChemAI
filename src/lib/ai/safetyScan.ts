// ChemAI: Güvenlik taraması - the chemicals named in a lab question and its answer are matched
// against the app's curated safety cards (lib/safety/chemicals.ts), and incompatible pairs are
// pointed out under the answer.
//
// Why: LabSafety Bench (2024-25) found no model above 70 % on hazard identification, and ChemBench
// found models overconfident on safety questions. A general chatbot mentions a hazard when it
// happens to; here the same curated data is checked every time, without asking the model.

import { CHEMICALS, INCOMPATIBILITY_LABELS, type Incompatibility, type SafetyCategory, type SafetyChemical } from "@/lib/safety/chemicals";
import type { ToolOutcome } from "@/lib/chem-engine/tools";

export interface SafetyConflict {
  a: SafetyChemical;
  b: SafetyChemical;
  tags: Incompatibility[];
}

export interface SafetyScan {
  chemicals: SafetyChemical[];
  conflicts: SafetyConflict[];
}

/** Which kind of chemical a "keep away from" tag is about (as lib/inventory/store.ts). */
const TAG_TO_CATEGORY: Partial<Record<Incompatibility, SafetyCategory>> = {
  strongAcids: "acid",
  strongBases: "base",
  oxidisers: "oxidiser",
  organics: "solvent",
};

const SUBSCRIPTS: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

function plainFormula(text: string): string {
  return [...text].map((char) => SUBSCRIPTS[char] ?? char).join("");
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Matcher {
  chemical: SafetyChemical;
  names: RegExp | null;
  formula: RegExp | null;
}

let matchers: Matcher[] | null = null;

function build(): Matcher[] {
  matchers ??= CHEMICALS.map((chemical) => {
    // Names without the bracketed strength ("Hidroklorik asit (%37)" → "hidroklorik asit").
    const names = [chemical.name, chemical.nameTr, ...chemical.synonyms]
      .map((name) => name.replace(/\s*\(.*?\)\s*/g, " ").trim().toLocaleLowerCase("tr"))
      .filter((name) => name.length >= 4);
    const formula = plainFormula(chemical.formula).replace(/\s/g, "");
    return {
      chemical,
      names: names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...new Set(names)].sort((x, y) => y.length - x.length).map(escape).join("|")})`, "gu") : null,
      // Formulas are matched case-sensitively and only when they are at least two symbols long ("HCl", "NaOH").
      formula: formula.length >= 3 && /[A-Z].*[A-Z0-9]/.test(formula) ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(formula)}(?![\\p{Ll}\\p{N}])`, "gu") : null,
    };
  });
  return matchers;
}

/** Actions that mean something is about to be done at the bench, not just asked about. */
const HANDS_ON =
  /(hazırla|karıştır|ekle|dök|ısıt|kaynat|seyrelt|çöz|titre|nötralize|temizle|sakla|depola|imha|atık|reaksiyon|tepkime|deney|prosedür|protokol|mix|prepare|dilute|heat|pour|dissolve|store|dispose|neutrali[sz]e|clean)/i;

export function scanSafety(texts: string[], outcomes: ToolOutcome[] | undefined, intents: string[] = []): SafetyScan | null {
  const joined = texts.join("\n");
  const lower = joined.toLocaleLowerCase("tr");
  const plain = plainFormula(joined);
  // Every mention with its place, so "sodyum" inside "sodyum hipoklorit" is not read as sodium metal.
  const spans: { chemical: SafetyChemical; start: number; end: number; name: boolean }[] = [];
  for (const matcher of build()) {
    const sources: [RegExp | null, string, boolean][] = [
      [matcher.names, lower, true],
      [matcher.formula, plain, false],
    ];
    for (const [regex, text, name] of sources) {
      if (!regex) continue;
      for (const match of text.matchAll(regex)) {
        const start = match.index ?? 0;
        spans.push({ chemical: matcher.chemical, start, end: start + match[0].length, name });
      }
    }
  }
  const found = new Map<string, SafetyChemical>();
  for (const span of spans) {
    const inside = spans.some(
      (other) =>
        other.name === span.name &&
        other.chemical.id !== span.chemical.id &&
        other.start <= span.start &&
        other.end >= span.end &&
        other.end - other.start > span.end - span.start
    );
    if (!inside) found.set(span.chemical.id, span.chemical);
  }
  const chemicals = [...found.values()];
  if (!chemicals.length) return null;

  const conflicts: SafetyConflict[] = [];
  for (let i = 0; i < chemicals.length; i++) {
    for (let j = i + 1; j < chemicals.length; j++) {
      const a = chemicals[i];
      const b = chemicals[j];
      const tags = new Set<Incompatibility>();
      for (const tag of a.incompatible) if (TAG_TO_CATEGORY[tag] === b.category) tags.add(tag);
      for (const tag of b.incompatible) if (TAG_TO_CATEGORY[tag] === a.category) tags.add(tag);
      if (tags.size) conflicts.push({ a, b, tags: [...tags] });
    }
  }

  // A card the planner already showed for the chemical is not repeated.
  const carded = new Set(
    (outcomes ?? []).flatMap((outcome) => (outcome.ok && outcome.tool === "safety" && outcome.data.chemical ? [outcome.data.chemical.id] : []))
  );
  const hazardous = chemicals.filter((chemical) => chemical.signal !== "none" && !carded.has(chemical.id));
  const handsOn = HANDS_ON.test(joined) || intents.some((intent) => intent === "prosedur" || intent === "guvenlik" || intent === "ekipman");
  if (!conflicts.length && (!handsOn || !hazardous.length)) return null;
  return { chemicals: handsOn ? hazardous : [], conflicts };
}

export function conflictReason(conflict: SafetyConflict, language: "tr" | "en"): string {
  return conflict.tags.map((tag) => (language === "en" ? INCOMPATIBILITY_LABELS[tag].en : INCOMPATIBILITY_LABELS[tag].tr)).join(", ");
}
