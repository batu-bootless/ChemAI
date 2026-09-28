// ChemAI: Kanıt denetimi - every number in Iris's answer is checked against the calculation
// engine's results for that question.
//
// Why: general chatbots write fluent chemistry but slip on the arithmetic - they give a correct
// method and a wrong final number, and most students do not notice (J. Chem. Educ. studies of
// ChatGPT; ChemBench, Nature Chemistry 2025: strong on average, overconfident, weak on basic
// calculation). Iris answers from the engine's results; this makes that visible and catches the
// rare case where the prose drifts from them. Conservative by design: a number is flagged only when
// it is a near miss of an engine result with the same unit - never for numbers it cannot place.

import type { ToolOutcome } from "@/lib/chem-engine/tools";

export interface FoundNumber {
  raw: string;
  /** Possible values ("1.234" is 1234 in Turkish and 1.234 in English). */
  values: number[];
  sig: number;
  unit: string | null;
  /** pH, pKa, Ka… written just before the number. */
  key: string | null;
  resultLike: boolean;
}

export interface VerifiedValue {
  text: string;
  source: string;
}

export interface Mismatch {
  text: string;
  expected: string;
  source: string;
}

export interface Verification {
  verified: VerifiedValue[];
  mismatches: Mismatch[];
  /** Result-like numbers that are neither the engine's nor the question's (the model's own). */
  unchecked: number;
}

const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };

const UNITS = [
  "g/mol", "kg/mol", "mg/mL", "g/mL", "g/L", "mg/L", "µg/mL", "mol/L", "mmol/L", "kJ/mol", "J/mol", "J/(mol·K)", "L·atm",
  "kcal", "cal", "kJ", "J", "mmol", "µmol", "mol", "mg", "µg", "kg", "g", "mL", "µL", "L", "mM", "µM", "nM", "M", "N",
  "%", "‰", "°C", "°F", "K", "atm", "kPa", "Pa", "bar", "mmHg", "torr", "nm", "cm⁻¹", "cm-1", "ppm", "ppb", "sn", "s",
  "dk", "min", "saat", "h", "mV", "V", "mA", "A", "u", "Da", "kDa", "Å", "pm",
].sort((a, b) => b.length - a.length);

const UNIT_ALIASES: Record<string, string> = { "mol/L": "M", "sn": "s", "dk": "min", "saat": "h", "cm-1": "cm⁻¹", "Da": "u" };

const KEYS = ["pH", "pOH", "pKa", "pKb", "Ka", "Kb", "Ksp", "Kw", "R²", "R2", "E°", "E0", "ΔG", "ΔH", "ΔS"];

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const NUMBER = new RegExp(
  String.raw`(?<![\p{L}\p{N}_.,/])([-−–]?)(\d{1,3}(?:[.,]\d{3})+(?!\d)(?:[.,]\d+)?|\d+(?:[.,]\d+)?)` +
    String.raw`(?:\s*[×x·*]\s*10\s*(?:\^\s*)?([-−+]?\d+|[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)|[eE]([-+]?\d+))?` +
    String.raw`(?:\s?(${UNITS.map(escape).join("|")})(?![\p{L}\p{N}]))?`,
  "gu"
);

function exponentOf(text: string | undefined): number {
  if (!text) return 0;
  const plain = [...text].map((char) => SUPERSCRIPT[char] ?? char).join("").replace("−", "-");
  const value = Number(plain);
  return Number.isFinite(value) ? value : 0;
}

/** Every reading of a written number ("1,5" → 1.5; "1.234" → 1234 or 1.234). */
function readings(body: string, language: "tr" | "en"): number[] {
  const hasComma = body.includes(",");
  const hasDot = body.includes(".");
  if (hasComma && hasDot) {
    const decimalComma = body.lastIndexOf(",") > body.lastIndexOf(".");
    return [Number(decimalComma ? body.replace(/\./g, "").replace(",", ".") : body.replace(/,/g, ""))];
  }
  const sep = hasComma ? "," : hasDot ? "." : "";
  if (!sep) return [Number(body)];
  const grouped = new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(body);
  const decimal = body.split(sep).length === 2 ? Number(body.replace(sep, ".")) : NaN;
  if (!grouped) return [Number(body.replace(sep, "."))];
  const thousands = Number(body.split(sep).join(""));
  // Turkish writes 1.234 for a thousand and more; English writes 1,234.
  const first = (sep === "." && language === "tr") || (sep === "," && language === "en") ? thousands : decimal;
  return [first, first === thousands ? decimal : thousands].filter((value) => Number.isFinite(value));
}

function significant(body: string): number {
  const digits = body.replace(/[.,]/g, "").replace(/^0+/, "");
  return Math.max(1, digits.length);
}

export function findNumbers(text: string, language: "tr" | "en"): FoundNumber[] {
  const found: FoundNumber[] = [];
  const clean = text.replace(/\[K\d+\]/g, " ");
  for (const match of clean.matchAll(NUMBER)) {
    const [raw, sign, body, expA, expB, unitRaw] = match;
    const index = match.index ?? 0;
    // A list marker ("1." or "2)" at the start of a line) is not a value.
    const lineStart = clean.lastIndexOf("\n", index) + 1;
    if (!unitRaw && /^\s*$/.test(clean.slice(lineStart, index)) && /^[.)]/.test(clean.slice(index + raw.length))) continue;
    const exponent = exponentOf(expA ?? expB);
    const factor = 10 ** exponent * (sign ? -1 : 1);
    const values = readings(body, language).map((value) => value * factor);
    if (!values.length) continue;
    const before = clean.slice(Math.max(0, index - 8), index);
    const key = KEYS.find((candidate) => new RegExp(`${escape(candidate)}\\s*[=≈:]?\\s*$`).test(before)) ?? null;
    const unit = unitRaw ? UNIT_ALIASES[unitRaw] ?? unitRaw : null;
    const decimalOrExp = /[.,]\d/.test(body) || Boolean(expA ?? expB);
    const integer = Number.isInteger(values[0]);
    // Years, counts and step numbers are not results; values with a unit, a decimal part, an
    // exponent or a key (pH = 7) are.
    const resultLike = Boolean(unit || key || (decimalOrExp && !(integer && Math.abs(values[0]) >= 1900 && Math.abs(values[0]) <= 2100)) || /[=≈]\s*$/.test(before));
    found.push({ raw: raw.trim(), values, sig: significant(body), unit, key, resultLike });
  }
  return found;
}

/** Numbers inside the engine's own data (limited: a titration curve holds hundreds). */
function walk(value: unknown, out: number[], depth = 0): void {
  if (out.length > 600 || depth > 6) return;
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (Array.isArray(value)) for (const item of value.slice(0, 200)) walk(item, out, depth + 1);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) if (key !== "svg" && key !== "model") walk(item, out, depth + 1);
  }
}

function halfStep(value: number, sig: number): number {
  if (value === 0) return 0.5 * 10 ** (1 - sig);
  return 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(value))) - sig + 1);
}

/** The written number is the engine's value, rounded (or within half a percent of it). */
function agrees(written: number, sig: number, engine: number): boolean {
  if (!Number.isFinite(engine)) return false;
  if (written === engine) return true;
  if (Math.sign(written) !== Math.sign(engine) && engine !== 0) return false;
  const tolerance = Math.max(halfStep(written, sig) * 1.02, Math.abs(engine) * 0.005);
  return Math.abs(written - engine) <= tolerance;
}

const SCALES = [1, 1e3, 1e-3, 1e6, 1e-6, 100, 0.01];

interface EngineNumber {
  value: number;
  unit: string | null;
  key: string | null;
  text: string;
  source: string;
}

export function verifyAnswer(answer: string, outcomes: ToolOutcome[] | undefined, question: string, language: "tr" | "en"): Verification | null {
  const results = (outcomes ?? []).filter((outcome) => outcome.ok && outcome.source !== "app");
  if (!answer.trim() || results.length === 0) return null;

  const engine: EngineNumber[] = [];
  const loose: { value: number; source: string }[] = [];
  for (const outcome of results) {
    if (!outcome.ok) continue;
    const source = outcome.title;
    for (const number of findNumbers(`${outcome.llm} ${outcome.checks.join(" ")}`, "tr")) {
      for (const value of number.values.slice(0, 1)) engine.push({ value, unit: number.unit, key: number.key, text: number.raw, source });
    }
    const data: number[] = [];
    walk(outcome.data, data);
    for (const value of data) loose.push({ value, source });
  }
  const given = findNumbers(question, language).flatMap((number) => number.values);

  const verified: VerifiedValue[] = [];
  const mismatches: Mismatch[] = [];
  let unchecked = 0;
  const seen = new Set<string>();

  for (const number of findNumbers(answer, language)) {
    if (!number.resultLike || seen.has(number.raw)) continue;
    seen.add(number.raw);
    // A value restated from the question is the user's own, not something to check.
    if (given.some((value) => number.values.some((written) => agrees(written, number.sig, value)))) continue;
    const hit =
      engine.find((entry) => number.values.some((value) => SCALES.some((scale) => agrees(value, number.sig, entry.value * scale)))) ??
      loose.find((entry) => number.values.some((value) => SCALES.some((scale) => agrees(value, number.sig, entry.value * scale))));
    if (hit) {
      verified.push({ text: number.raw, source: hit.source });
      continue;
    }
    // A near miss of an engine result of the same kind: the answer and the card disagree.
    const written = number.values[0];
    const rival = engine
      .filter((entry) => entry.value !== 0 && Math.sign(entry.value) === Math.sign(written))
      .filter((entry) => (number.unit ? entry.unit === number.unit : number.key !== null && entry.key === number.key))
      .map((entry) => ({ entry, diff: Math.abs(written - entry.value) / Math.abs(entry.value) }))
      .filter(({ diff }) => diff > 0.01 && diff <= 0.33)
      .sort((a, b) => a.diff - b.diff)[0];
    if (rival && number.sig >= 2) {
      mismatches.push({ text: number.raw, expected: rival.entry.text, source: rival.entry.source });
      continue;
    }
    unchecked += 1;
  }
  if (!verified.length && !mismatches.length) return null;
  return { verified, mismatches, unchecked };
}
