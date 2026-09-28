// Chem+ app: finding where an equation holds - the numeric half of what SymPy/SciPy would do.
//
// Brent's method on a bracket (bisection's safety with the secant's speed). Without a bracket the
// solver looks for one: concentrations and constants live on a log scale, so it scans 10⁻¹⁵ … 10¹⁵
// logarithmically (and the negative side linearly), then polishes every sign change it finds.

export class SolveError extends Error {}

export function brent(f: (x: number) => number, lo: number, hi: number, tolerance = 1e-14, maxIterations = 300): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) throw new SolveError("Aralığın ucunda ifade tanımsız.");
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new SolveError("Verilen aralıkta işaret değişmiyor; kök yok ya da aralık yanlış.");
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let mflag = true;
  for (let i = 0; i < maxIterations; i++) {
    if (fb === 0 || Math.abs(b - a) <= tolerance * Math.max(1, Math.abs(b))) return b;
    let s: number;
    if (fa !== fc && fb !== fc) {
      s = (a * fb * fc) / ((fa - fb) * (fa - fc)) + (b * fa * fc) / ((fb - fa) * (fb - fc)) + (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      s = b - (fb * (b - a)) / (fb - fa);
    }
    const between = (s - (3 * a + b) / 4) * (s - b) < 0;
    if (
      !between ||
      (mflag && Math.abs(s - b) >= Math.abs(b - c) / 2) ||
      (!mflag && Math.abs(s - b) >= Math.abs(c - d) / 2) ||
      (mflag && Math.abs(b - c) < tolerance) ||
      (!mflag && Math.abs(c - d) < tolerance)
    ) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }
    const fs = f(s);
    d = c;
    c = b;
    fc = fb;
    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }
  return b;
}

/** Every root found in [min, max] (or, with no bounds, across the log-scaled positive axis). */
export function findRoots(f: (x: number) => number, min?: number, max?: number, limit = 6): number[] {
  const samples: number[] = [];
  if (min !== undefined && max !== undefined) {
    if (!(max > min)) throw new SolveError("Üst sınır alt sınırdan büyük olmalı.");
    const positive = min >= 0 && max / Math.max(min, 1e-300) > 1e3;
    const n = 4000;
    for (let i = 0; i <= n; i++) {
      samples.push(positive ? Math.max(min, 1e-300) * (max / Math.max(min, 1e-300)) ** (i / n) : min + ((max - min) * i) / n);
    }
    if (positive && min === 0) samples.unshift(0);
  } else {
    for (let e = -15; e <= 15; e += 0.01) samples.push(10 ** e);
    for (let x = -1000; x < 0; x += 0.5) samples.push(x);
    samples.sort((a, b) => a - b);
  }
  const roots: number[] = [];
  let previousX = samples[0];
  let previousY = safe(f, previousX);
  for (let i = 1; i < samples.length && roots.length < limit; i++) {
    const x = samples[i];
    const y = safe(f, x);
    if (Number.isFinite(previousY) && Number.isFinite(y)) {
      if (y === 0) roots.push(x);
      else if (previousY * y < 0) {
        const root = brent(f, previousX, x);
        // A pole (1/(x-a)) also changes sign; a real root makes f small.
        if (Math.abs(safe(f, root)) < 1e-6 * Math.max(1, Math.abs(previousY), Math.abs(y))) roots.push(root);
      }
    }
    previousX = x;
    previousY = y;
  }
  return roots.filter((root, index) => index === 0 || Math.abs(root - roots[index - 1]) > 1e-12 * Math.max(1, Math.abs(root)));
}

function safe(f: (x: number) => number, x: number): number {
  try {
    return f(x);
  } catch {
    return Number.NaN;
  }
}
