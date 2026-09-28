// Chem+ app: balancing a chemical equation exactly.
//
// Each species is a column of atom counts (and its charge, for ionic and redox equations);
// reactants count positive, products negative. The coefficients are the null space of that
// matrix, found with exact fractions (BigInt) rather than floats, so 2, 13, 8, 10 come out as
// 2, 13, 8, 10 and not 1.9999998. One free direction is the usual case; more than one means the
// equation hides two independent reactions, and the smallest all-positive combination is given.

import { hillOrder } from "./elements";
import { FormulaError, parseFormula, prettyFormula, type ParsedFormula } from "./formula";

export interface Species {
  /** As written in the equation, state symbol included: "Fe^3+(aq)". */
  raw: string;
  formula: ParsedFormula;
  /** "(aq)", "(s)"... kept for display. */
  state: string;
  pretty: string;
}

export interface BalancedEquation {
  reactants: Species[];
  products: Species[];
  /** Smallest whole-number coefficients, reactants then products. */
  coefficients: number[];
  /** "2C₈H₁₈ + 25O₂ → 16CO₂ + 18H₂O" */
  text: string;
  /** Atom (and charge) totals on both sides, for the check table. */
  check: { symbol: string; left: number; right: number }[];
  /** More than one independent way to balance it. */
  ambiguous: boolean;
}

export class BalanceError extends Error {}

const ARROW = /\s*(?:<=>|<->|⇌|⇄|⟷|⟶|→|->|=>|⟹|=)\s*/;

export function splitEquation(equation: string): { left: string[]; right: string[] } {
  const text = equation.replace(/−/g, "-").trim();
  const parts = text.split(ARROW);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    throw new BalanceError("Denklemde tek bir ok (→ ya da =) olmalı: girenler → ürünler.");
  }
  return { left: splitSide(parts[0]), right: splitSide(parts[1]) };
}

function splitSide(side: string): string[] {
  const spaced = side.split(/\s+\+\s+/);
  const pieces = spaced.length > 1 ? spaced : side.split(/\+(?=\s*[A-Z([{0-9]|\s*e\b|\s*e[-⁻])/);
  return pieces.map((piece) => piece.trim()).filter(Boolean);
}

function parseSpecies(raw: string): Species {
  let text = raw.trim();
  const stateMatch = text.match(/\((aq|s|l|g)\)$/i);
  const state = stateMatch ? stateMatch[0].toLowerCase() : "";
  if (stateMatch) text = text.slice(0, stateMatch.index).trim();
  // A coefficient already written in front is dropped: the balance is worked out from scratch.
  text = text.replace(/^\d+(?:[.,]\d+)?\s*(?=[A-Z([{]|e[-⁻^])/, "").replace(/^\d+\/\d+\s*/, "");
  try {
    const formula = parseFormula(text);
    return { raw, formula, state, pretty: prettyFormula(formula) + (state ? state : "") };
  } catch (error) {
    throw new BalanceError(error instanceof FormulaError ? error.message : `"${raw}" okunamadı.`);
  }
}

// --- exact fractions ---------------------------------------------------------------------------

// BigInt() calls rather than 0n literals: the project compiles to a target below ES2020.
const B0 = BigInt(0);
const B1 = BigInt(1);
const B1000 = BigInt(1000);

type Q = [bigint, bigint];

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < B0 ? -a : a;
  b = b < B0 ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

function q(n: bigint, d: bigint = B1): Q {
  if (d === B0) throw new BalanceError("Sıfıra bölme.");
  if (d < B0) [n, d] = [-n, -d];
  const g = gcd(n, d) || B1;
  return [n / g, d / g];
}

const sub = (a: Q, b: Q): Q => q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Q, b: Q): Q => q(a[0] * b[0], a[1] * b[1]);
const div = (a: Q, b: Q): Q => q(a[0] * b[1], a[1] * b[0]);
const isZero = (a: Q) => a[0] === B0;

/** Counts can be decimals in a non-stoichiometric formula; scale them to whole numbers first. */
function toQ(value: number): Q {
  if (Number.isInteger(value)) return q(BigInt(value));
  const scale = B1000;
  return q(BigInt(Math.round(value * 1000)), scale);
}

/** Basis of the null space of `rows` (exact). */
function nullSpace(matrix: Q[][], columns: number): Q[][] {
  const rows = matrix.map((row) => [...row]);
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < columns && r < rows.length; c++) {
    let pivot = -1;
    for (let i = r; i < rows.length; i++) {
      if (!isZero(rows[i][c])) {
        pivot = i;
        break;
      }
    }
    if (pivot < 0) continue;
    [rows[r], rows[pivot]] = [rows[pivot], rows[r]];
    const lead = rows[r][c];
    rows[r] = rows[r].map((value) => div(value, lead));
    for (let i = 0; i < rows.length; i++) {
      if (i === r || isZero(rows[i][c])) continue;
      const factor = rows[i][c];
      rows[i] = rows[i].map((value, j) => sub(value, mul(factor, rows[r][j])));
    }
    pivots.push(c);
    r += 1;
  }
  const free = [...Array(columns).keys()].filter((c) => !pivots.includes(c));
  return free.map((f) => {
    const vector: Q[] = Array.from({ length: columns }, () => q(B0));
    vector[f] = q(B1);
    pivots.forEach((pc, i) => {
      vector[pc] = q(-rows[i][f][0], rows[i][f][1]);
    });
    return vector;
  });
}

/** Scales a fraction vector to the smallest whole numbers. */
function toIntegers(vector: Q[]): bigint[] {
  const lcm = vector.reduce((acc, [, d]) => (acc * d) / gcd(acc, d), B1);
  const ints = vector.map(([n, d]) => (n * lcm) / d);
  const g = ints.reduce((acc, value) => gcd(acc, value), B0) || B1;
  return ints.map((value) => value / g);
}

export function balanceEquation(equation: string): BalancedEquation {
  const { left, right } = splitEquation(equation);
  const reactants = left.map(parseSpecies);
  const products = right.map(parseSpecies);
  const all = [...reactants, ...products];
  if (all.length < 2) throw new BalanceError("En az bir giren ve bir ürün gerekli.");

  const symbols = hillOrder([...new Set(all.flatMap((species) => [...species.formula.counts.keys()]))]);
  const charged = all.some((species) => species.formula.charge !== 0);
  const rowsOf = (species: Species, sign: number) => [
    ...symbols.map((symbol) => toQ((species.formula.counts.get(symbol) ?? 0) * sign)),
    ...(charged ? [toQ(species.formula.charge * sign)] : []),
  ];
  const columns = all.map((species, j) => rowsOf(species, j < reactants.length ? 1 : -1));
  const matrix = columns[0].map((_, i) => columns.map((column) => column[i]));

  const basis = nullSpace(matrix, all.length);
  if (basis.length === 0) {
    throw new BalanceError("Bu denklem denkleştirilemiyor: iki taraftaki atomlar ya da yükler hiçbir katsayıyla eşitlenemiyor. Formülleri kontrol edin.");
  }

  let coefficients: bigint[] | null = null;
  const ambiguous = basis.length > 1;
  if (!ambiguous) {
    const ints = toIntegers(basis[0]);
    const signs = new Set(ints.map((value) => (value > B0 ? 1 : value < B0 ? -1 : 0)));
    if (signs.has(0) || signs.size > 1) {
      throw new BalanceError("Denklem yalnızca bir türün katsayısı sıfır ya da negatif olacak şekilde sağlanıyor: bir tür yanlış tarafta ya da gereksiz olabilir.");
    }
    coefficients = ints.map((value) => (value < B0 ? -value : value));
  } else {
    // Two independent reactions: look for the smallest all-positive combination.
    let best: bigint[] | null = null;
    let bestSum = B0;
    const range = [1, 2, 3, 4, 5];
    const combos = (depth: number): number[][] =>
      depth === 0 ? [[]] : combos(depth - 1).flatMap((head) => [-1, ...range].map((w) => [...head, w]));
    for (const weights of combos(Math.min(basis.length, 3))) {
      const vector = basis[0].map((_, j) =>
        weights.reduce<Q>((acc, w, k) => q(acc[0] * basis[k][j][1] + BigInt(w) * basis[k][j][0] * acc[1], acc[1] * basis[k][j][1]), q(B0))
      );
      const ints = toIntegers(vector);
      if (ints.some((value) => value <= B0)) continue;
      const sum = ints.reduce((acc, value) => acc + value, B0);
      if (!best || sum < bestSum) {
        best = ints;
        bestSum = sum;
      }
    }
    if (!best) throw new BalanceError("Bu denklemin birden fazla bağımsız çözümü var ve hiçbiri tüm katsayıları pozitif yapmıyor.");
    coefficients = best;
  }

  const numbers = coefficients.map((value) => Number(value));
  const side = (list: Species[], offset: number) =>
    list.map((species, i) => `${numbers[offset + i] === 1 ? "" : numbers[offset + i]}${species.pretty}`).join(" + ");
  const text = `${side(reactants, 0)} → ${side(products, reactants.length)}`;

  const total = (list: Species[], offset: number, symbol: string | null) =>
    list.reduce(
      (acc, species, i) => acc + numbers[offset + i] * (symbol ? (species.formula.counts.get(symbol) ?? 0) : species.formula.charge),
      0
    );
  const check = [
    ...symbols.map((symbol) => ({ symbol, left: total(reactants, 0, symbol), right: total(products, reactants.length, symbol) })),
    ...(charged ? [{ symbol: "yük", left: total(reactants, 0, null), right: total(products, reactants.length, null) }] : []),
  ];

  return { reactants, products, coefficients: numbers, text, check, ambiguous };
}
