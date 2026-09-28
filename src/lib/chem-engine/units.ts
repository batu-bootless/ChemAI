// Chem+ app: unit conversion for the quantities a lab calculation mixes - pressure, volume,
// temperature, mass, amount, energy and concentration. Every unit maps to its SI-ish base
// (Pa, L, K, g, mol, J, mol/L); temperatures are affine, so they convert on their own path.

export type Dimension = "pressure" | "volume" | "temperature" | "mass" | "amount" | "energy" | "concentration" | "time" | "length";

interface UnitDef {
  dimension: Dimension;
  /** Multiply by this to reach the base unit. */
  factor: number;
  label: string;
}

const UNITS: Record<string, UnitDef> = {
  // pressure → Pa
  pa: { dimension: "pressure", factor: 1, label: "Pa" },
  kpa: { dimension: "pressure", factor: 1e3, label: "kPa" },
  mpa: { dimension: "pressure", factor: 1e6, label: "MPa" },
  bar: { dimension: "pressure", factor: 1e5, label: "bar" },
  mbar: { dimension: "pressure", factor: 100, label: "mbar" },
  atm: { dimension: "pressure", factor: 101325, label: "atm" },
  mmhg: { dimension: "pressure", factor: 133.322387415, label: "mmHg" },
  torr: { dimension: "pressure", factor: 101325 / 760, label: "torr" },
  psi: { dimension: "pressure", factor: 6894.757293168, label: "psi" },
  // volume → L
  l: { dimension: "volume", factor: 1, label: "L" },
  ml: { dimension: "volume", factor: 1e-3, label: "mL" },
  ul: { dimension: "volume", factor: 1e-6, label: "µL" },
  "µl": { dimension: "volume", factor: 1e-6, label: "µL" },
  dl: { dimension: "volume", factor: 0.1, label: "dL" },
  m3: { dimension: "volume", factor: 1e3, label: "m³" },
  dm3: { dimension: "volume", factor: 1, label: "dm³" },
  cm3: { dimension: "volume", factor: 1e-3, label: "cm³" },
  cc: { dimension: "volume", factor: 1e-3, label: "cm³" },
  // mass → g
  g: { dimension: "mass", factor: 1, label: "g" },
  mg: { dimension: "mass", factor: 1e-3, label: "mg" },
  ug: { dimension: "mass", factor: 1e-6, label: "µg" },
  "µg": { dimension: "mass", factor: 1e-6, label: "µg" },
  kg: { dimension: "mass", factor: 1e3, label: "kg" },
  t: { dimension: "mass", factor: 1e6, label: "t" },
  // amount → mol
  mol: { dimension: "amount", factor: 1, label: "mol" },
  mmol: { dimension: "amount", factor: 1e-3, label: "mmol" },
  umol: { dimension: "amount", factor: 1e-6, label: "µmol" },
  "µmol": { dimension: "amount", factor: 1e-6, label: "µmol" },
  kmol: { dimension: "amount", factor: 1e3, label: "kmol" },
  // energy → J
  j: { dimension: "energy", factor: 1, label: "J" },
  kj: { dimension: "energy", factor: 1e3, label: "kJ" },
  cal: { dimension: "energy", factor: 4.184, label: "cal" },
  kcal: { dimension: "energy", factor: 4184, label: "kcal" },
  ev: { dimension: "energy", factor: 1.602176634e-19, label: "eV" },
  // concentration → mol/L (M, mM, µM, nM are case-sensitive: see MOLAR below)
  "mol/l": { dimension: "concentration", factor: 1, label: "mol/L" },
  "mmol/l": { dimension: "concentration", factor: 1e-3, label: "mmol/L" },
  // time → s
  s: { dimension: "time", factor: 1, label: "s" },
  sn: { dimension: "time", factor: 1, label: "s" },
  min: { dimension: "time", factor: 60, label: "min" },
  dk: { dimension: "time", factor: 60, label: "dk" },
  h: { dimension: "time", factor: 3600, label: "h" },
  sa: { dimension: "time", factor: 3600, label: "sa" },
  // length → m
  m: { dimension: "length", factor: 1, label: "m" },
  cm: { dimension: "length", factor: 1e-2, label: "cm" },
  mm: { dimension: "length", factor: 1e-3, label: "mm" },
  um: { dimension: "length", factor: 1e-6, label: "µm" },
  "µm": { dimension: "length", factor: 1e-6, label: "µm" },
  nm: { dimension: "length", factor: 1e-9, label: "nm" },
  pm: { dimension: "length", factor: 1e-12, label: "pm" },
  "å": { dimension: "length", factor: 1e-10, label: "Å" },
  angstrom: { dimension: "length", factor: 1e-10, label: "Å" },
};

/** Molar concentrations, told apart from lengths by the capital M (mM is millimolar, mm is millimetre). */
const MOLAR: Record<string, UnitDef> = {
  M: { dimension: "concentration", factor: 1, label: "M" },
  mM: { dimension: "concentration", factor: 1e-3, label: "mM" },
  uM: { dimension: "concentration", factor: 1e-6, label: "µM" },
  "µM": { dimension: "concentration", factor: 1e-6, label: "µM" },
  nM: { dimension: "concentration", factor: 1e-9, label: "nM" },
  pM: { dimension: "concentration", factor: 1e-12, label: "pM" },
};

const TEMPERATURE: Record<string, string> = { k: "K", c: "°C", "°c": "°C", f: "°F", "°f": "°F", kelvin: "K", celsius: "°C" };

export class UnitError extends Error {}

function key(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, "").replace("μ", "µ").replace("³", "3").replace("litre", "l").replace("liter", "l");
}

function lookup(unit: string): UnitDef | undefined {
  const exact = unit.trim().replace("μ", "µ");
  return MOLAR[exact] ?? UNITS[key(unit)];
}

export function unitLabel(unit: string): string {
  const k = key(unit);
  return TEMPERATURE[k] ?? lookup(unit)?.label ?? unit;
}

export function dimensionOf(unit: string): Dimension | null {
  const k = key(unit);
  if (k in TEMPERATURE) return "temperature";
  return lookup(unit)?.dimension ?? null;
}

export function toKelvin(value: number, unit: string): number {
  const k = TEMPERATURE[key(unit)];
  if (k === "K") return value;
  if (k === "°C") return value + 273.15;
  if (k === "°F") return ((value - 32) * 5) / 9 + 273.15;
  throw new UnitError(`"${unit}" bir sıcaklık birimi değil.`);
}

export function fromKelvin(kelvin: number, unit: string): number {
  const k = TEMPERATURE[key(unit)];
  if (k === "K") return kelvin;
  if (k === "°C") return kelvin - 273.15;
  if (k === "°F") return ((kelvin - 273.15) * 9) / 5 + 32;
  throw new UnitError(`"${unit}" bir sıcaklık birimi değil.`);
}

/** Value in the base unit of its dimension (Pa, L, g, mol, J, mol/L, s, m). */
export function toBase(value: number, unit: string): number {
  const def = lookup(unit);
  if (!def) throw new UnitError(`Bilinmeyen birim: "${unit}".`);
  return value * def.factor;
}

export function fromBase(value: number, unit: string): number {
  const def = lookup(unit);
  if (!def) throw new UnitError(`Bilinmeyen birim: "${unit}".`);
  return value / def.factor;
}

export function convert(value: number, from: string, to: string): number {
  const a = dimensionOf(from);
  const b = dimensionOf(to);
  if (!a) throw new UnitError(`Bilinmeyen birim: "${from}".`);
  if (!b) throw new UnitError(`Bilinmeyen birim: "${to}".`);
  if (a !== b) throw new UnitError(`${unitLabel(from)} ile ${unitLabel(to)} aynı büyüklüğü ölçmüyor.`);
  if (a === "temperature") return fromKelvin(toKelvin(value, from), to);
  return fromBase(toBase(value, from), to);
}
