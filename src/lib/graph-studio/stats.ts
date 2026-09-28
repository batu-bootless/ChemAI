// Pure-TypeScript scientific statistics for Graph Studio: curve fitting
// (linear / polynomial / exponential / logarithmic), goodness-of-fit, histogram
// binning and descriptive stats. No dependencies — everything is closed-form or
// solved with a small Gaussian-elimination least-squares routine.

import type { RegressionType } from "./types";

export interface XY {
  x: number;
  y: number;
}

export interface RegressionFit {
  type: RegressionType;
  coefficients: number[]; // meaning depends on type (see below)
  r2: number;
  rmse: number;
  equation: string;
  predict: (x: number) => number;
}

export interface Descriptive {
  n: number;
  mean: number;
  median: number;
  std: number; // sample standard deviation
  min: number;
  max: number;
}

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
  label: string;
}

function fmt(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "0";
  if (n !== 0 && (Math.abs(n) >= 1e5 || Math.abs(n) < 1e-4)) return n.toExponential(3);
  return Number(n.toFixed(digits)).toString();
}

function rmseOf(points: XY[], predict: (x: number) => number): number {
  if (points.length === 0) return 0;
  const sse = points.reduce((s, p) => s + (p.y - predict(p.x)) ** 2, 0);
  return Math.sqrt(sse / points.length);
}

function r2Of(points: XY[], predict: (x: number) => number): number {
  const n = points.length;
  if (n === 0) return 0;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - predict(p.x)) ** 2, 0);
  if (ssTot === 0) return ssRes === 0 ? 1 : 0;
  return 1 - ssRes / ssTot;
}

/** Solves a linear system A x = b via Gaussian elimination with partial pivoting. */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Ordinary least squares polynomial fit of the given degree. Returns coefficients [a0, a1, ...]. */
function polyFit(points: XY[], degree: number): number[] | null {
  const d = Math.max(1, Math.min(degree, points.length - 1, 6));
  const cols = d + 1;
  // Normal equations: (Vᵀ V) c = Vᵀ y, where V is the Vandermonde matrix.
  const A: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const b: number[] = new Array(cols).fill(0);
  for (const p of points) {
    const powers: number[] = [];
    for (let k = 0; k < 2 * d + 1; k++) powers.push(k === 0 ? 1 : powers[k - 1] * p.x);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < cols; j++) A[i][j] += powers[i + j];
      b[i] += powers[i] * p.y;
    }
  }
  return solveLinearSystem(A, b);
}

function polyEquation(coeffs: number[]): string {
  const terms = coeffs
    .map((c, i) => {
      if (Math.abs(c) < 1e-12) return "";
      if (i === 0) return fmt(c);
      if (i === 1) return `${fmt(c)}x`;
      return `${fmt(c)}x^${i}`;
    })
    .filter(Boolean)
    .reverse();
  return `y = ${terms.join(" + ").replace(/\+ -/g, "- ") || "0"}`;
}

export function fitRegression(points: XY[], type: RegressionType, polyDegree = 2): RegressionFit | null {
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (type === "none" || clean.length < 2) return null;

  if (type === "linear") {
    const coeffs = polyFit(clean, 1);
    if (!coeffs) return null;
    const [a, b] = coeffs;
    const predict = (x: number) => a + b * x;
    return {
      type,
      coefficients: coeffs,
      r2: r2Of(clean, predict),
      rmse: rmseOf(clean, predict),
      equation: `y = ${fmt(b)}x ${b >= 0 ? "+" : "-"} ${fmt(Math.abs(a))}`.replace("+ -", "- "),
      predict,
    };
  }

  if (type === "polynomial") {
    const coeffs = polyFit(clean, polyDegree);
    if (!coeffs) return null;
    const predict = (x: number) => coeffs.reduce((s, c, i) => s + c * x ** i, 0);
    return { type, coefficients: coeffs, r2: r2Of(clean, predict), rmse: rmseOf(clean, predict), equation: polyEquation(coeffs), predict };
  }

  if (type === "exponential") {
    // y = a e^(b x)  ->  ln y = ln a + b x   (requires y > 0)
    const pos = clean.filter((p) => p.y > 0);
    if (pos.length < 2) return null;
    const lin = polyFit(pos.map((p) => ({ x: p.x, y: Math.log(p.y) })), 1);
    if (!lin) return null;
    const a = Math.exp(lin[0]);
    const b = lin[1];
    const predict = (x: number) => a * Math.exp(b * x);
    return { type, coefficients: [a, b], r2: r2Of(pos, predict), rmse: rmseOf(pos, predict), equation: `y = ${fmt(a)}·e^(${fmt(b)}x)`, predict };
  }

  // logarithmic: y = a + b ln x   (requires x > 0)
  const pos = clean.filter((p) => p.x > 0);
  if (pos.length < 2) return null;
  const lin = polyFit(pos.map((p) => ({ x: Math.log(p.x), y: p.y })), 1);
  if (!lin) return null;
  const a = lin[0];
  const b = lin[1];
  const predict = (x: number) => a + b * Math.log(x);
  return { type, coefficients: [a, b], r2: r2Of(pos, predict), rmse: rmseOf(pos, predict), equation: `y = ${fmt(a)} ${b >= 0 ? "+" : "-"} ${fmt(Math.abs(b))}·ln(x)`, predict };
}

export function describe(values: number[]): Descriptive | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return null;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const variance = n > 1 ? v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, median, std: Math.sqrt(variance), min: v[0], max: v[n - 1] };
}

/** Sturges' rule for a default bin count when the user hasn't chosen one. */
export function sturgesBins(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(1, n)) + 1));
}

export function histogram(values: number[], binCount = 0): HistogramBin[] {
  const v = values.filter((n) => Number.isFinite(n));
  if (v.length === 0) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const bins = binCount > 0 ? binCount : sturgesBins(v.length);
  if (min === max) return [{ start: min, end: max, count: v.length, label: fmt(min) }];
  const width = (max - min) / bins;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => {
    const start = min + i * width;
    const end = start + width;
    return { start, end, count: 0, label: `${fmt(start, 2)}–${fmt(end, 2)}` };
  });
  for (const x of v) {
    let idx = Math.floor((x - min) / width);
    if (idx >= bins) idx = bins - 1; // include the max in the last bin
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out;
}
