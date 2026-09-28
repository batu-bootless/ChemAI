// Chem+ app: reading a chemical formula - nested groups, hydrates and ionic charges.
//
//   Ca(OH)2 · CuSO4·5H2O · CuSO4.5H2O · K4[Fe(CN)6] · SO4^2- · Fe3+ · NH4+ · C₆H₁₂O₆ · e-
//
// Charges: "^" (SO4^2-) or superscripts (SO₄²⁻) are unambiguous. Without them a trailing sign is
// read the way chemists write it: a lone element keeps its digits as the charge (Fe3+ is Fe³⁺),
// a group keeps them as a count (NH4+ is NH₄⁺), and two trailing digits split into count and
// charge (SO42- is SO₄²⁻).

import { ATOMIC_WEIGHTS, MONOISOTOPIC, elementName, hillOrder, isElement } from "./elements";
import { chargeLabel, fmt, subscript, superscript, type Language } from "./format";

export interface ParsedFormula {
  /** Atoms per formula unit, hydrate water included. */
  counts: Map<string, number>;
  charge: number;
  /** The formula as written, without its charge, digits in ASCII: "CuSO4·5H2O". */
  text: string;
  /** True for the electron in a half-reaction. */
  electron: boolean;
}

export class FormulaError extends Error {}

const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUP_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Subscripts to digits, superscript charges to "^n±", the many hydrate dots to one. */
export function normaliseFormula(input: string): string {
  let text = input.trim();
  text = text.replace(/[₀-₉]/g, (d) => String(SUB_DIGITS.indexOf(d)));
  text = text.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])/g, (_, digits: string, sign: string) => {
    const n = [...digits].map((d) => SUP_DIGITS.indexOf(d)).join("");
    return `^${n}${sign === "⁺" ? "+" : "-"}`;
  });
  text = text.replace(/[·•∙⋅*]/g, "·").replace(/\s+/g, "").replace(/−/g, "-");
  // "CuSO4.5H2O": a dot in front of a coefficient and a formula is a hydrate dot, not a decimal.
  text = text.replace(/\.(\d*)(?=[A-Z([])/g, "·$1");
  return text;
}

export function parseFormula(input: string): ParsedFormula {
  const source = normaliseFormula(input);
  if (!source) throw new FormulaError("Boş formül.");
  if (/^e(\^1?-|\^-1|-|⁻)$/.test(source)) {
    return { counts: new Map(), charge: -1, text: "e", electron: true };
  }

  let body = source;
  let charge = 0;
  const caretA = body.match(/\^(\d*)([+-])$/);
  const caretB = body.match(/\^([+-])(\d+)$/);
  if (caretA) {
    charge = (caretA[1] ? Number(caretA[1]) : 1) * (caretA[2] === "+" ? 1 : -1);
    body = body.slice(0, caretA.index);
  } else if (caretB) {
    charge = Number(caretB[2]) * (caretB[1] === "+" ? 1 : -1);
    body = body.slice(0, caretB.index);
  } else {
    const trailing = body.match(/(\d*)([+-]+)$/);
    if (trailing) {
      const signs = trailing[2];
      const sign = signs[0] === "+" ? 1 : -1;
      const digits = trailing[1];
      const head = body.slice(0, trailing.index);
      if (signs.length > 1) {
        // "Fe+++" style.
        charge = sign * signs.length;
        body = head + digits;
      } else if (digits && /^[A-Z][a-z]?$/.test(head)) {
        charge = sign * Number(digits);
        body = head;
      } else if (digits.length >= 2) {
        charge = sign * Number(digits.slice(-1));
        body = head + digits.slice(0, -1);
      } else {
        charge = sign;
        body = head + digits;
      }
    }
  }

  const counts = new Map<string, number>();
  for (const part of body.split("·")) {
    if (!part) throw new FormulaError(`"${input}" okunamadı.`);
    const lead = part.match(/^(\d+(?:\.\d+)?)(?=[A-Z([{])/);
    const multiplier = lead ? Number(lead[1]) : 1;
    const rest = lead ? part.slice(lead[1].length) : part;
    for (const [symbol, n] of parseGroup(rest, input)) counts.set(symbol, (counts.get(symbol) ?? 0) + n * multiplier);
  }
  if (counts.size === 0) throw new FormulaError(`"${input}" içinde element bulunamadı.`);
  return { counts, charge, text: body, electron: false };
}

function parseGroup(text: string, original: string): Map<string, number> {
  let position = 0;

  const readCount = (): number => {
    const match = text.slice(position).match(/^\d+(?:\.\d+)?/);
    if (!match) return 1;
    position += match[0].length;
    return Number(match[0]);
  };

  const readSequence = (closing: string | null): Map<string, number> => {
    const counts = new Map<string, number>();
    const add = (symbol: string, n: number) => counts.set(symbol, (counts.get(symbol) ?? 0) + n);
    while (position < text.length) {
      const char = text[position];
      if (char === ")" || char === "]" || char === "}") {
        if (char !== closing) throw new FormulaError(`"${original}" içinde parantezler eşleşmiyor.`);
        position += 1;
        return counts;
      }
      if (char === "(" || char === "[" || char === "{") {
        position += 1;
        const inner = readSequence(char === "(" ? ")" : char === "[" ? "]" : "}");
        const n = readCount();
        for (const [symbol, count] of inner) add(symbol, count * n);
        continue;
      }
      const element = text.slice(position).match(/^[A-Z][a-z]?/);
      if (!element) throw new FormulaError(`"${original}" içinde okunamayan karakter: "${char}".`);
      let symbol = element[0];
      // "Co" is cobalt but "CO" is carbon + oxygen; an unknown two-letter symbol falls back to one.
      if (symbol.length === 2 && !isElement(symbol) && isElement(symbol[0])) symbol = symbol[0];
      if (!isElement(symbol)) throw new FormulaError(`"${symbol}" bir element sembolü değil.`);
      position += symbol.length;
      add(symbol, readCount());
    }
    if (closing) throw new FormulaError(`"${original}" içinde kapanmayan parantez var.`);
    return counts;
  };

  return readSequence(null);
}

/** Molar mass in g/mol (standard atomic weights). */
export function molarMass(parsed: ParsedFormula): number {
  let mass = 0;
  for (const [symbol, n] of parsed.counts) mass += ATOMIC_WEIGHTS[symbol] * n;
  return mass;
}

/** Monoisotopic mass, or null when an element has no entry (or the formula has fractions). */
export function monoisotopicMass(parsed: ParsedFormula): number | null {
  let mass = 0;
  for (const [symbol, n] of parsed.counts) {
    const isotope = MONOISOTOPIC[symbol];
    if (isotope === undefined || !Number.isInteger(n)) return null;
    mass += isotope * n;
  }
  // An ion has lost or gained electrons (0.000548579909 u each).
  return mass - parsed.charge * 0.000548579909;
}

export interface CompositionRow {
  symbol: string;
  name: string;
  count: number;
  /** g/mol this element contributes. */
  mass: number;
  percent: number;
}

export function composition(parsed: ParsedFormula, language: Language): CompositionRow[] {
  const total = molarMass(parsed);
  return hillOrder([...parsed.counts.keys()]).map((symbol) => {
    const count = parsed.counts.get(symbol)!;
    const mass = ATOMIC_WEIGHTS[symbol] * count;
    return { symbol, name: elementName(symbol, language), count, mass, percent: (mass / total) * 100 };
  });
}

function countText(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** The formula in Hill order with subscripts and the charge as superscript: C₆H₁₂O₆, SO₄²⁻. */
export function hillFormula(parsed: ParsedFormula): string {
  if (parsed.electron) return "e⁻";
  const body = hillOrder([...parsed.counts.keys()])
    .map((symbol) => {
      const n = parsed.counts.get(symbol)!;
      return n === 1 ? symbol : `${symbol}${subscript(countText(n))}`;
    })
    .join("");
  return body + superscript(chargeLabel(parsed.charge));
}

/** The formula as written, with subscripts: Ca(OH)₂, CuSO₄·5H₂O, Fe³⁺, SO₄²⁻. */
export function prettyFormula(parsed: ParsedFormula): string {
  if (parsed.electron) return "e⁻";
  const body = parsed.text.replace(/([A-Za-z)\]}])(\d+(?:\.\d+)?)/g, (_, head: string, digits: string) => head + subscript(digits));
  return body + superscript(chargeLabel(parsed.charge));
}

/** "C 40,00 %, H 6,714 %, O 53,29 %" - the composition in one line. */
export function describeComposition(parsed: ParsedFormula, language: Language): string {
  return composition(parsed, language)
    .map((row) => `${row.symbol} ${fmt(row.percent, language, 4)} %`)
    .join(", ");
}
