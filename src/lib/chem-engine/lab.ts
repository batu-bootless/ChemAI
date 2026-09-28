// Chem+ app: the bench calculations - how much to weigh or pipette for a solution, dilution by
// C₁V₁ = C₂V₂, and the ideal gas law with whatever unit each quantity came in.

import { fmt, type Language } from "./format";
import { molarMass, parseFormula, prettyFormula } from "./formula";
import { convert, fromBase, fromKelvin, toBase, toKelvin, unitLabel } from "./units";

export class LabError extends Error {}

export interface PrepInput {
  formula?: string;
  /** g/mol, when there is no formula (or to override it). */
  molar_mass?: number;
  concentration_M: number;
  volume_mL: number;
  /** Solid purity in % (default 100). */
  purity_percent?: number;
  /** Liquid stock: % w/w and density, e.g. 37 % HCl at 1.19 g/mL. */
  stock_percent?: number;
  density_g_mL?: number;
  /** Liquid stock given as a molarity instead. */
  stock_M?: number;
}

export interface PrepResult {
  pretty: string;
  molarMass: number;
  moles: number;
  /** g of pure substance needed. */
  pureMass: number;
  /** g to weigh (purity included), for a solid. */
  weighMass?: number;
  /** mL of stock to measure, for a liquid stock. */
  stockVolume_mL?: number;
  stockMolarity?: number;
  steps: string[];
}

export function prepareSolution(input: PrepInput, language: Language = "tr"): PrepResult {
  const t = (tr: string, en: string) => (language === "en" ? en : tr);
  const n = (value: number, sig = 4) => fmt(value, language, sig);
  if (!(input.concentration_M > 0) || !(input.volume_mL > 0)) throw new LabError(t("Derişim ve hacim pozitif olmalı.", "Concentration and volume must be positive."));
  let pretty = input.formula ?? "";
  let molar = input.molar_mass;
  if (input.formula) {
    const parsed = parseFormula(input.formula);
    pretty = prettyFormula(parsed);
    molar = molar ?? molarMass(parsed);
  }
  const moles = input.concentration_M * (input.volume_mL / 1000);
  const flask = `${n(input.volume_mL)} mL`;

  if (input.stock_M) {
    const stockVolume = (moles / input.stock_M) * 1000;
    return {
      pretty,
      molarMass: molar ?? 0,
      moles,
      pureMass: molar ? moles * molar : 0,
      stockVolume_mL: stockVolume,
      stockMolarity: input.stock_M,
      steps: [
        t(`${n(stockVolume)} mL ${n(input.stock_M)} M stok çözeltiyi pipetle ölç.`, `Pipette ${n(stockVolume)} mL of the ${n(input.stock_M)} M stock.`),
        t(`${flask} balon jojeye, içinde biraz saf su varken aktar.`, `Transfer it into a ${flask} volumetric flask holding some distilled water.`),
        t("Saf suyla çizgiye tamamla, kapağını kapatıp ters çevirerek karıştır.", "Make up to the mark with distilled water, stopper and invert to mix."),
      ],
    };
  }

  if (!molar) throw new LabError(t("Mol kütlesi için formül ya da molar_mass gerekli.", "A formula or molar_mass is needed."));
  const pureMass = moles * molar;

  if (input.stock_percent && input.density_g_mL) {
    const stockMolarity = (input.density_g_mL * 1000 * (input.stock_percent / 100)) / molar;
    const stockVolume = (moles / stockMolarity) * 1000;
    return {
      pretty,
      molarMass: molar,
      moles,
      pureMass,
      stockVolume_mL: stockVolume,
      stockMolarity,
      steps: [
        t(
          `Stok %${n(input.stock_percent)} (d = ${n(input.density_g_mL)} g/mL) çözeltinin derişimi ≈ ${n(stockMolarity)} M.`,
          `The ${n(input.stock_percent)} % stock (d = ${n(input.density_g_mL)} g/mL) is ≈ ${n(stockMolarity)} M.`
        ),
        t(`${n(stockVolume)} mL stoğu dereceli pipetle ya da mezürle ölç (çeker ocakta).`, `Measure ${n(stockVolume)} mL of stock with a graduated pipette (in the fume hood).`),
        t(
          `${flask} balon jojeye önce yaklaşık yarısı kadar saf su koy; stoğu suya yavaşça ekle (asla tersi değil).`,
          `Half-fill a ${flask} volumetric flask with distilled water and add the stock slowly to the water (never the reverse).`
        ),
        t("Soğumaya bırak, sonra saf suyla çizgiye tamamla ve ters çevirerek karıştır.", "Let it cool, make up to the mark with distilled water and invert to mix."),
      ],
    };
  }

  const purity = input.purity_percent && input.purity_percent > 0 ? input.purity_percent : 100;
  const weighMass = pureMass / (purity / 100);
  const name = pretty || t("madde", "substance");
  return {
    pretty,
    molarMass: molar,
    moles,
    pureMass,
    weighMass,
    steps: [
      t(
        `Analitik terazide ${n(weighMass)} g ${name} tart${purity < 100 ? ` (saflık %${n(purity)} hesaba katıldı)` : ""}.`,
        `Weigh ${n(weighMass)} g of ${name} on an analytical balance${purity < 100 ? ` (${n(purity)} % purity included)` : ""}.`
      ),
      t("Küçük bir beherde, son hacmin yarısından az saf suda tamamen çöz.", "Dissolve it completely in a small beaker in less than half the final volume of distilled water."),
      t(
        `Çözeltiyi ${flask} balon jojeye aktar; beheri birkaç kez saf suyla çalkalayıp jojeye ekle.`,
        `Transfer to a ${flask} volumetric flask; rinse the beaker a few times into the flask.`
      ),
      t(
        "Saf suyla çizgiye (menisküs altı) tamamla, kapağını kapatıp ters çevirerek karıştır ve etiketle.",
        "Make up to the mark (bottom of the meniscus), stopper, invert to mix and label."
      ),
    ],
  };
}

export interface DilutionInput {
  C1?: number | null;
  V1?: number | null;
  C2?: number | null;
  V2?: number | null;
  /** Units shared by both sides: volume (default mL) and concentration (default M). */
  volume_unit?: string;
  concentration_unit?: string;
}

export interface DilutionResult {
  solvedFor: "C1" | "V1" | "C2" | "V2";
  value: number;
  C1: number;
  V1: number;
  C2: number;
  V2: number;
  volumeUnit: string;
  concentrationUnit: string;
  steps: string[];
}

export function dilution(input: DilutionInput, language: Language = "tr"): DilutionResult {
  const t = (tr: string, en: string) => (language === "en" ? en : tr);
  const n = (value: number) => fmt(value, language, 4);
  const keys = ["C1", "V1", "C2", "V2"] as const;
  const missing = keys.filter((k) => typeof input[k] !== "number" || Number.isNaN(input[k] as number));
  if (missing.length !== 1) throw new LabError(t("C₁V₁ = C₂V₂ için tam olarak bir bilinmeyen bırakın.", "Leave exactly one unknown in C₁V₁ = C₂V₂."));
  const get = (k: (typeof keys)[number]) => (input[k] as number) ?? 0;
  const solvedFor = missing[0];
  const value =
    solvedFor === "C1"
      ? (get("C2") * get("V2")) / get("V1")
      : solvedFor === "V1"
        ? (get("C2") * get("V2")) / get("C1")
        : solvedFor === "C2"
          ? (get("C1") * get("V1")) / get("V2")
          : (get("C1") * get("V1")) / get("C2");
  if (!Number.isFinite(value) || value <= 0) throw new LabError(t("Değerler pozitif olmalı.", "Values must be positive."));
  const all = { C1: get("C1"), V1: get("V1"), C2: get("C2"), V2: get("V2"), [solvedFor]: value } as Record<(typeof keys)[number], number>;
  if (all.C2 > all.C1 * (1 + 1e-9)) {
    throw new LabError(t("Seyreltmede son derişim (C₂) ilk derişimden (C₁) büyük olamaz.", "A dilution cannot end more concentrated (C₂ > C₁)."));
  }
  const volumeUnit = unitLabel(input.volume_unit ?? "mL");
  const concentrationUnit = unitLabel(input.concentration_unit ?? "M");
  return {
    solvedFor,
    value,
    ...all,
    volumeUnit,
    concentrationUnit,
    steps: [
      t(`${n(all.V1)} ${volumeUnit} stok (${n(all.C1)} ${concentrationUnit}) çözeltiyi pipetle al.`, `Pipette ${n(all.V1)} ${volumeUnit} of the ${n(all.C1)} ${concentrationUnit} stock.`),
      t(`${n(all.V2)} ${volumeUnit} balon jojeye aktar.`, `Transfer it into a ${n(all.V2)} ${volumeUnit} volumetric flask.`),
      t(
        `Saf suyla çizgiye tamamla (eklenen su ≈ ${n(all.V2 - all.V1)} ${volumeUnit}) ve karıştır.`,
        `Make up to the mark with distilled water (≈ ${n(all.V2 - all.V1)} ${volumeUnit} added) and mix.`
      ),
    ],
  };
}

export interface GasInput {
  P?: number | null;
  V?: number | null;
  n?: number | null;
  T?: number | null;
  P_unit?: string;
  V_unit?: string;
  T_unit?: string;
  n_unit?: string;
}

export interface GasResult {
  solvedFor: "P" | "V" | "n" | "T";
  value: number;
  unit: string;
  /** Every quantity in the unit it was given in (the solved one in its requested unit). */
  values: { P: number; V: number; n: number; T: number };
  units: { P: string; V: string; n: string; T: string };
}

const R_LATM = 0.082057366;

export function idealGas(input: GasInput, language: Language = "tr"): GasResult {
  const t = (tr: string, en: string) => (language === "en" ? en : tr);
  const units = { P: input.P_unit ?? "atm", V: input.V_unit ?? "L", n: input.n_unit ?? "mol", T: input.T_unit ?? "K" };
  const missing = (["P", "V", "n", "T"] as const).filter((k) => typeof input[k] !== "number");
  if (missing.length !== 1) throw new LabError(t("PV = nRT için tam olarak bir bilinmeyen (null) bırakın.", "Leave exactly one unknown (null) in PV = nRT."));
  const solvedFor = missing[0];
  const P = typeof input.P === "number" ? convert(input.P, units.P, "atm") : 0;
  const V = typeof input.V === "number" ? convert(input.V, units.V, "L") : 0;
  const n = typeof input.n === "number" ? fromBase(toBase(input.n, units.n), "mol") : 0;
  const T = typeof input.T === "number" ? toKelvin(input.T, units.T) : 0;
  const given = { P, V, n, T };
  for (const key of ["P", "V", "n", "T"] as const) {
    if (key !== solvedFor && !(given[key] > 0)) {
      throw new LabError(t("Basınç, hacim, mol ve mutlak sıcaklık pozitif olmalı.", "Pressure, volume, amount and absolute temperature must be positive."));
    }
  }
  let value: number;
  if (solvedFor === "P") value = convert((n * R_LATM * T) / V, "atm", units.P);
  else if (solvedFor === "V") value = convert((n * R_LATM * T) / P, "L", units.V);
  else if (solvedFor === "n") value = fromBase((P * V) / (R_LATM * T), units.n);
  else value = fromKelvin((P * V) / (n * R_LATM), units.T);
  const values = {
    P: solvedFor === "P" ? value : (input.P as number),
    V: solvedFor === "V" ? value : (input.V as number),
    n: solvedFor === "n" ? value : (input.n as number),
    T: solvedFor === "T" ? value : (input.T as number),
  };
  return {
    solvedFor,
    value,
    unit: unitLabel(units[solvedFor]),
    values,
    units: { P: unitLabel(units.P), V: unitLabel(units.V), n: unitLabel(units.n), T: unitLabel(units.T) },
  };
}
