// Chem+ app: pH without approximations.
//
// Every solution is solved the same way, from its charge balance: strong acids and bases leave
// spectator ions, each weak acid or base is a system of protonation states whose fractions (α)
// follow from [H⁺] and its Ka values, and [H⁺] is the one value where the charges add up to zero.
// That one routine covers a weak acid, a weak base, a buffer, a salt, a polyprotic acid, a mixture
// and every point of a titration - no "x is small" step to go wrong. Ideal solution, 25 °C
// (Kw = 1.0×10⁻¹⁴) unless another pKw is given.

export type AcidBaseComponent =
  | { type: "strong_acid"; c: number; n?: number; name?: string }
  | { type: "strong_base"; c: number; n?: number; name?: string }
  | { type: "weak_acid"; c: number; pKa: number[]; name?: string }
  | { type: "salt_of_weak_acid"; c: number; pKa: number[]; protonsRemoved?: number; name?: string }
  | { type: "weak_base"; c: number; pKb: number[]; name?: string }
  | { type: "salt_of_weak_base"; c: number; pKb: number[]; name?: string };

export class AcidBaseError extends Error {}

interface System {
  name: string;
  c: number;
  /** pKa values of the fully protonated form, first proton first. */
  pKa: number[];
  /** Charge of the fully protonated form (0 for HA, +1 for BH⁺). */
  z0: number;
  base: boolean;
}

interface Model {
  systems: System[];
  /** Spectator cation and anion charge concentrations (mol/L of charge). */
  cations: number;
  anions: number;
}

export function build(components: AcidBaseComponent[], pKw = 14): Model {
  const model: Model = { systems: [], cations: 0, anions: 0 };
  for (const component of components) {
    if (!(component.c >= 0) || !Number.isFinite(component.c)) throw new AcidBaseError("Derişim sıfır ya da pozitif bir sayı olmalı.");
    switch (component.type) {
      case "strong_acid":
        model.anions += (component.n ?? 1) * component.c;
        break;
      case "strong_base":
        model.cations += (component.n ?? 1) * component.c;
        break;
      case "weak_acid":
      case "salt_of_weak_acid": {
        const pKa = checkList(component.pKa, "pKa");
        const removed = component.type === "weak_acid" ? 0 : Math.min(component.protonsRemoved ?? 1, pKa.length);
        model.systems.push({ name: component.name ?? "HA", c: component.c, pKa, z0: 0, base: false });
        // The salt's counter-ions (Na⁺ for NaA): one per proton taken away.
        model.cations += removed * component.c;
        // The added form carries charge −removed; the counter-ions balance it, and the system's own
        // charge is accounted for through its α fractions.
        break;
      }
      case "weak_base":
      case "salt_of_weak_base": {
        const pKb = checkList(component.pKb, "pKb");
        // The conjugate acid BHₙⁿ⁺: pKa values are pKw − pKb, in reverse order.
        const pKa = [...pKb].reverse().map((value) => pKw - value);
        model.systems.push({ name: component.name ?? "B", c: component.c, pKa, z0: pKb.length, base: true });
        // Adding B itself brings no counter-ion; BH⁺Cl⁻ brings one Cl⁻ per proton it carries.
        if (component.type === "salt_of_weak_base") model.anions += component.c;
        break;
      }
    }
  }
  return model;
}

function checkList(values: number[], label: string): number[] {
  if (!Array.isArray(values) || values.length === 0 || values.some((v) => !Number.isFinite(v))) {
    throw new AcidBaseError(`${label} değeri gerekli.`);
  }
  return [...values].sort((a, b) => a - b);
}

/** Fractions of each protonation state (fully protonated first) at a given [H⁺]. */
export function fractions(pKa: number[], h: number): number[] {
  const n = pKa.length;
  const lnH = Math.log(h);
  const logs: number[] = [];
  let sumLnKa = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) sumLnKa += -pKa[k - 1] * Math.LN10;
    logs.push((n - k) * lnH + sumLnKa);
  }
  const top = Math.max(...logs);
  const terms = logs.map((value) => Math.exp(value - top));
  const total = terms.reduce((a, b) => a + b, 0);
  return terms.map((term) => term / total);
}

function chargeBalance(model: Model, h: number, pKw: number): number {
  let balance = h - 10 ** -pKw / h + model.cations - model.anions;
  for (const system of model.systems) {
    const alpha = fractions(system.pKa, h);
    for (let j = 0; j < alpha.length; j++) balance += system.c * (system.z0 - j) * alpha[j];
  }
  return balance;
}

export interface PhResult {
  pH: number;
  pOH: number;
  h: number;
  oh: number;
  pKw: number;
  species: { system: string; base: boolean; labels: string[]; fractions: number[]; concentrations: number[] }[];
  /** The textbook shortcut, where one applies, next to the exact answer. */
  approximation?: { pH: number; method: string };
}

export function solvePh(components: AcidBaseComponent[], pKw = 14): PhResult {
  const model = build(components, pKw);
  // f(h) rises with h, so bisection on pH (−2…16) always converges.
  let lo = -2;
  let hi = 16;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = chargeBalance(model, 10 ** -mid, pKw);
    if (f > 0) lo = mid;
    else hi = mid;
  }
  const pH = (lo + hi) / 2;
  const h = 10 ** -pH;
  const species = model.systems.map((system) => {
    const alpha = fractions(system.pKa, h);
    return {
      system: system.name,
      base: system.base,
      labels: speciesLabels(system),
      fractions: alpha,
      concentrations: alpha.map((a) => a * system.c),
    };
  });
  return { pH, pOH: pKw - pH, h, oh: 10 ** -(pKw - pH), pKw, species, approximation: approximate(components, pKw) };
}

function speciesLabels(system: System): string[] {
  const n = system.pKa.length;
  const sup = (charge: number) => {
    if (charge === 0) return "";
    const digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    const size = Math.abs(charge);
    return `${size === 1 ? "" : [...String(size)].map((d) => digits[Number(d)]).join("")}${charge > 0 ? "⁺" : "⁻"}`;
  };
  const subs = (count: number) => {
    const digits = "₀₁₂₃₄₅₆₇₈₉";
    return count <= 1 ? "" : [...String(count)].map((d) => digits[Number(d)]).join("");
  };
  return Array.from({ length: n + 1 }, (_, j) => {
    const protons = n - j;
    const charge = system.z0 - j;
    const core = system.base ? "B" : "A";
    const hPart = protons === 0 ? "" : `H${subs(protons)}`;
    return system.base ? `${core}${hPart}${sup(charge)}` : `${hPart}${core}${sup(charge)}`;
  });
}

/** √(Ka·C), Henderson–Hasselbalch and friends: what a textbook would write. */
function approximate(components: AcidBaseComponent[], pKw: number): PhResult["approximation"] {
  if (components.length === 1) {
    const [only] = components;
    if (only.type === "weak_acid" && only.pKa.length >= 1 && only.c > 0) {
      const pKa = Math.min(...only.pKa);
      return { pH: 0.5 * (pKa - Math.log10(only.c)), method: "√(Ka·C)" };
    }
    if (only.type === "weak_base" && only.pKb.length >= 1 && only.c > 0) {
      const pKb = Math.min(...only.pKb);
      return { pH: pKw - 0.5 * (pKb - Math.log10(only.c)), method: "√(Kb·C)" };
    }
    if (only.type === "strong_acid" && only.c > 0) return { pH: -Math.log10((only.n ?? 1) * only.c), method: "[H⁺] = C" };
    if (only.type === "strong_base" && only.c > 0) return { pH: pKw + Math.log10((only.n ?? 1) * only.c), method: "[OH⁻] = C" };
  }
  if (components.length === 2) {
    const acid = components.find((c) => c.type === "weak_acid") as Extract<AcidBaseComponent, { type: "weak_acid" }> | undefined;
    const salt = components.find((c) => c.type === "salt_of_weak_acid") as Extract<AcidBaseComponent, { type: "salt_of_weak_acid" }> | undefined;
    if (acid && salt && acid.c > 0 && salt.c > 0) {
      const pKa = Math.min(...acid.pKa);
      return { pH: pKa + Math.log10(salt.c / acid.c), method: "Henderson–Hasselbalch" };
    }
    const base = components.find((c) => c.type === "weak_base") as Extract<AcidBaseComponent, { type: "weak_base" }> | undefined;
    const bsalt = components.find((c) => c.type === "salt_of_weak_base") as Extract<AcidBaseComponent, { type: "salt_of_weak_base" }> | undefined;
    if (base && bsalt && base.c > 0 && bsalt.c > 0) {
      const pKa = pKw - Math.min(...base.pKb);
      return { pH: pKa + Math.log10(base.c / bsalt.c), method: "Henderson–Hasselbalch" };
    }
  }
  return undefined;
}

// --- titration -----------------------------------------------------------------------------------

export interface TitrationInput {
  analyte: { type: "strong_acid" | "weak_acid" | "strong_base" | "weak_base"; c: number; volume_mL: number; pKa?: number[]; pKb?: number[]; n?: number; name?: string };
  titrant: { type: "strong_base" | "strong_acid"; c: number; n?: number; name?: string };
  pKw?: number;
}

export interface TitrationResult {
  points: { v: number; pH: number }[];
  equivalence: { v: number; pH: number }[];
  halfEquivalence: { v: number; pH: number }[];
  initialPH: number;
  indicators: { name: string; range: [number, number] }[];
  maxVolume: number;
}

export const INDICATORS: { name: string; range: [number, number] }[] = [
  { name: "Metil oranj", range: [3.1, 4.4] },
  { name: "Bromkrezol yeşili", range: [3.8, 5.4] },
  { name: "Metil kırmızısı", range: [4.4, 6.2] },
  { name: "Bromtimol mavisi", range: [6.0, 7.6] },
  { name: "Fenol kırmızısı", range: [6.8, 8.4] },
  { name: "Fenolftalein", range: [8.2, 10.0] },
  { name: "Timolftalein", range: [9.3, 10.5] },
];

export function titrate(input: TitrationInput): TitrationResult {
  const { analyte, titrant } = input;
  const pKw = input.pKw ?? 14;
  const acidic = analyte.type === "strong_acid" || analyte.type === "weak_acid";
  if (acidic === (titrant.type === "strong_acid")) {
    throw new AcidBaseError("Asit bir bazla, baz bir asitle titre edilir.");
  }
  if (!(analyte.c > 0 && analyte.volume_mL > 0 && titrant.c > 0)) throw new AcidBaseError("Derişimler ve hacim pozitif olmalı.");
  const protons =
    analyte.type === "weak_acid" ? (analyte.pKa?.length ?? 1) : analyte.type === "weak_base" ? (analyte.pKb?.length ?? 1) : (analyte.n ?? 1);
  const titrantEquivalents = titrant.n ?? 1;
  const unit = (analyte.c * analyte.volume_mL) / (titrant.c * titrantEquivalents);
  const equivalenceVolumes = Array.from({ length: protons }, (_, k) => unit * (k + 1));
  const maxVolume = Math.min(equivalenceVolumes[equivalenceVolumes.length - 1] * 1.6, equivalenceVolumes[equivalenceVolumes.length - 1] + unit * 1.2);

  const phAt = (v: number): number => {
    const total = analyte.volume_mL + v;
    const ca = (analyte.c * analyte.volume_mL) / total;
    const ct = (titrant.c * v) / total;
    const components: AcidBaseComponent[] = [];
    if (analyte.type === "weak_acid") components.push({ type: "weak_acid", c: ca, pKa: analyte.pKa ?? [] });
    if (analyte.type === "weak_base") components.push({ type: "weak_base", c: ca, pKb: analyte.pKb ?? [] });
    if (analyte.type === "strong_acid") components.push({ type: "strong_acid", c: ca, n: analyte.n });
    if (analyte.type === "strong_base") components.push({ type: "strong_base", c: ca, n: analyte.n });
    if (ct > 0) components.push({ type: titrant.type, c: ct, n: titrantEquivalents });
    return solvePh(components, pKw).pH;
  };

  const volumes = new Set<number>();
  const steps = 90;
  for (let i = 0; i <= steps; i++) volumes.add((maxVolume * i) / steps);
  // Dense around each equivalence point, where the curve turns.
  for (const veq of equivalenceVolumes) {
    for (let d = -0.08; d <= 0.08; d += 0.004) volumes.add(Math.max(0, veq * (1 + d)));
  }
  const points = [...volumes]
    .filter((v) => v <= maxVolume)
    .sort((a, b) => a - b)
    .map((v) => ({ v, pH: phAt(v) }));

  const equivalence = equivalenceVolumes.map((v) => ({ v, pH: phAt(v) }));
  const halfEquivalence =
    analyte.type === "weak_acid" || analyte.type === "weak_base"
      ? equivalenceVolumes.map((v) => {
          const half = v - unit / 2;
          return { v: half, pH: phAt(half) };
        })
      : [];
  const main = equivalence[equivalence.length - 1].pH;
  const indicators = INDICATORS.filter((indicator) => main >= indicator.range[0] - 0.3 && main <= indicator.range[1] + 0.3);
  return { points, equivalence, halfEquivalence, initialPH: phAt(0), indicators, maxVolume };
}
