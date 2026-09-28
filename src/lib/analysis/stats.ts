// Chem+ app: the statistics behind the Data Analysis module.
//
// Everything here is the maths a lab report needs and a calculator app usually leaves out: the
// spread of a replicate set, whether an odd-looking replicate may be dropped, and what a
// calibration line actually says about an unknown. The critical values are tabulated rather than
// computed from a distribution because the tables are what a student is checked against.

export interface Description {
  n: number;
  mean: number;
  /** Sample standard deviation (n-1). */
  sd: number;
  /** Relative standard deviation, in percent. */
  rsd: number;
  /** Standard error of the mean. */
  sem: number;
  min: number;
  max: number;
  median: number;
  range: number;
}

/** Reads a free-typed series: newlines, commas, semicolons or spaces, decimal point or comma. */
export function parseSeries(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((part) => part.trim().replace(",", "."))
    .filter((part) => part !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

export function describe(values: number[]): Description | null {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return {
    n,
    mean,
    sd,
    rsd: mean === 0 ? 0 : (sd / Math.abs(mean)) * 100,
    sem: n > 0 ? sd / Math.sqrt(n) : 0,
    min: sorted[0],
    max: sorted[n - 1],
    median,
    range: sorted[n - 1] - sorted[0],
  };
}

/** Two-tailed Student t at 95% confidence, by degrees of freedom. */
const T_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
  10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12, 17: 2.11, 18: 2.101,
  19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052,
  28: 2.048, 29: 2.045, 30: 2.042,
};

export function tValue95(df: number): number {
  if (df <= 0) return NaN;
  if (df <= 30) return T_95[df];
  if (df <= 40) return 2.021;
  if (df <= 60) return 2.0;
  if (df <= 120) return 1.98;
  return 1.96;
}

/** Half-width of the 95% confidence interval on the mean. */
export function confidenceHalfWidth(sd: number, n: number): number {
  if (n < 2) return NaN;
  return (tValue95(n - 1) * sd) / Math.sqrt(n);
}

/** Grubbs critical values, two-sided, 95%. */
const GRUBBS_95: Record<number, number> = {
  3: 1.153, 4: 1.463, 5: 1.672, 6: 1.822, 7: 1.938, 8: 2.032, 9: 2.11, 10: 2.176, 11: 2.234,
  12: 2.285, 13: 2.331, 14: 2.371, 15: 2.409, 16: 2.443, 17: 2.475, 18: 2.504, 19: 2.532,
  20: 2.557, 21: 2.58, 22: 2.603, 23: 2.624, 24: 2.644, 25: 2.663, 26: 2.681, 27: 2.698,
  28: 2.714, 29: 2.73, 30: 2.745,
};

/** Dixon's Q critical values, 95%, for the Q10 form used at n = 3..10. */
const Q_95: Record<number, number> = {
  3: 0.97, 4: 0.829, 5: 0.71, 6: 0.625, 7: 0.568, 8: 0.526, 9: 0.493, 10: 0.466,
};

export interface OutlierTest {
  /** The value the test is about - the one furthest from the rest. */
  suspect: number;
  statistic: number;
  critical: number;
  rejected: boolean;
  /** Set when the sample size is outside the table. */
  unavailable?: string;
}

/** Grubbs: is the most extreme value further out than a sample this size should reach? */
export function grubbsTest(values: number[]): OutlierTest | null {
  const stats = describe(values);
  if (!stats || stats.n < 3) return null;
  if (stats.sd === 0) return null;
  const suspect = values.reduce((worst, value) =>
    Math.abs(value - stats.mean) > Math.abs(worst - stats.mean) ? value : worst
  );
  const statistic = Math.abs(suspect - stats.mean) / stats.sd;
  const critical = GRUBBS_95[stats.n];
  if (critical === undefined) {
    return { suspect, statistic, critical: NaN, rejected: false, unavailable: "n > 30" };
  }
  return { suspect, statistic, critical, rejected: statistic > critical };
}

/** Dixon's Q, the quick test taught for three to ten replicates. */
export function qTest(values: number[]): OutlierTest | null {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 3) return null;
  const range = sorted[n - 1] - sorted[0];
  if (range === 0) return null;
  const gapLow = sorted[1] - sorted[0];
  const gapHigh = sorted[n - 1] - sorted[n - 2];
  const low = gapLow >= gapHigh;
  const suspect = low ? sorted[0] : sorted[n - 1];
  const statistic = (low ? gapLow : gapHigh) / range;
  const critical = Q_95[n];
  if (critical === undefined) {
    return { suspect, statistic, critical: NaN, rejected: false, unavailable: "n > 10" };
  }
  return { suspect, statistic, critical, rejected: statistic > critical };
}

export interface Point {
  x: number;
  y: number;
}

export interface Fit {
  slope: number;
  intercept: number;
  /** Coefficient of determination. */
  r2: number;
  /** Standard error of the regression (the scatter about the line). */
  sy: number;
  seSlope: number;
  seIntercept: number;
  n: number;
  /** 3 sy / slope - the smallest amount the method can tell from noise. */
  lod: number;
  /** 10 sy / slope - the smallest amount it can quantify. */
  loq: number;
}

/** Ordinary least squares through the standards. */
export function fitLine(points: Point[]): Fit | null {
  const n = points.length;
  if (n < 3) return null;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  const sxx = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
  const syy = points.reduce((sum, p) => sum + (p.y - meanY) ** 2, 0);
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const ssResidual = points.reduce((sum, p) => sum + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = syy === 0 ? 1 : 1 - ssResidual / syy;
  const sy = n > 2 ? Math.sqrt(ssResidual / (n - 2)) : 0;
  const seSlope = sxx === 0 ? NaN : sy / Math.sqrt(sxx);
  const seIntercept = sy * Math.sqrt(1 / n + meanX ** 2 / sxx);
  return {
    slope,
    intercept,
    r2,
    sy,
    seSlope,
    seIntercept,
    n,
    lod: slope === 0 ? NaN : (3 * sy) / Math.abs(slope),
    loq: slope === 0 ? NaN : (10 * sy) / Math.abs(slope),
  };
}

/** Reads a signal back off the line. */
export function inverse(fit: Fit, signal: number): number {
  if (fit.slope === 0) return NaN;
  return (signal - fit.intercept) / fit.slope;
}

/**
 * Error propagation for the four operations, from the relative errors of the inputs. Addition and
 * subtraction combine absolute errors; multiplication and division combine relative ones - the
 * rule students most often apply to the wrong one of the two.
 */
export function propagate(
  op: "add" | "sub" | "mul" | "div",
  a: number,
  ea: number,
  b: number,
  eb: number
): { value: number; error: number } | null {
  if (op === "add" || op === "sub") {
    const value = op === "add" ? a + b : a - b;
    return { value, error: Math.sqrt(ea ** 2 + eb ** 2) };
  }
  if (op === "div" && b === 0) return null;
  const value = op === "mul" ? a * b : a / b;
  if (a === 0 || b === 0) return { value, error: NaN };
  const relative = Math.sqrt((ea / a) ** 2 + (eb / b) ** 2);
  return { value, error: Math.abs(value) * relative };
}

/** Significant-figure aware formatting: a result is not more precise than its inputs. */
export function fmt(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-4) return value.toExponential(Math.max(digits - 1, 1));
  return Number(value.toPrecision(digits)).toString();
}
