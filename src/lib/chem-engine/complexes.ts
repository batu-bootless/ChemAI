// Chem+ app: coordination compounds, built rather than looked up.
//
// Iris names the metal and its ligands ("V, one oxo, two acac"); everything else is worked out
// here, on the device: the coordination number and geometry (2 to 9, metallocenes, half-sandwich,
// bent metallocenes, uranyl-type bipyramids, crown-ether complexes), every way the ligands can sit
// round the metal (stereoisomers found by symmetry, chirality included), the idealised point
// group, the d- or f-electron count, the ligand-field configuration with its spin state, unpaired
// electrons and magnetic moment, the stabilisation energy, the valence-bond hybridisation, the
// 18-electron count, the IUPAC name in Turkish and English, the formula with its molar mass - and a
// 3D ball-and-stick model with every atom, drawn by src/components/ai/Molecule3D.tsx.
//
// The ligands and how they are built are in ligands.ts, the metals in metals.ts, multinuclear
// compounds (Mn₂(CO)₁₀, [Re₂Cl₈]²⁻, paddlewheels…) in clusters.ts. The model is idealised (textbook
// angles, covalent-radius bond lengths), which is what a structure drawing is for.

import { ATOMIC_WEIGHTS, atomicNumber, hillOrder } from "./elements";
import { composition, molarMass, monoisotopicMass, parseFormula, type CompositionRow } from "./formula";
import { chargeLabel, subscript, superscript, type Language } from "./format";
import { angleBetween, covalentRadius, cross, distance, dot, length, rotate, scale, sub, unit, type Model3D, type ModelAtom, type ModelBond, type Vec } from "./model3d";
import { findLigand, LIGAND_IDS, normalName, type LigandDef } from "./ligands";
import { METALS, dGroup, fElectrons, isFBlock, isHeavy, lanthanideMoment } from "./metals";
import { Fragment, relaxModel, type Frame } from "./structureKit";

export class ComplexError extends Error {}
export { findLigand, LIGAND_IDS } from "./ligands";

// --- geometry --------------------------------------------------------------------------------------

export type Geometry =
  | "linear"
  | "trigonal_planar"
  | "tetrahedral"
  | "square_planar"
  | "trigonal_bipyramidal"
  | "square_pyramidal"
  | "octahedral"
  | "trigonal_prismatic"
  | "pentagonal_bipyramidal"
  | "square_antiprismatic"
  | "hexagonal_bipyramidal"
  | "hexagonal_pyramidal"
  | "hexagonal_planar"
  | "tricapped_trigonal_prismatic"
  | "bicapped_square_antiprismatic"
  | "icosahedral"
  | "sandwich"
  | "bent_metallocene"
  | "piano_stool";

type Words = { tr: string; en: string };

export const GEOMETRY_NAMES: Record<Geometry, Words & { angles: Words }> = {
  linear: { tr: "doğrusal", en: "linear", angles: { tr: "180°", en: "180°" } },
  trigonal_planar: { tr: "üçgen düzlem", en: "trigonal planar", angles: { tr: "120°", en: "120°" } },
  tetrahedral: { tr: "düzgün dörtyüzlü (tetrahedral)", en: "tetrahedral", angles: { tr: "109,5°", en: "109.5°" } },
  square_planar: { tr: "kare düzlem", en: "square planar", angles: { tr: "90° ve 180°", en: "90° and 180°" } },
  trigonal_bipyramidal: { tr: "üçgen çift piramit", en: "trigonal bipyramidal", angles: { tr: "90° (eksen–düzlem), 120° (düzlem), 180° (eksen)", en: "90° (axial–equatorial), 120° (equatorial), 180° (axial)" } },
  square_pyramidal: { tr: "kare piramit", en: "square pyramidal", angles: { tr: "≈100° (apikal–bazal), ≈88° ve ≈160° (bazal)", en: "≈100° (apical–basal), ≈88° and ≈160° (basal)" } },
  octahedral: { tr: "oktahedral (düzgün sekizyüzlü)", en: "octahedral", angles: { tr: "90° ve 180°", en: "90° and 180°" } },
  trigonal_prismatic: { tr: "üçgen prizma", en: "trigonal prismatic", angles: { tr: "≈82° (yüz içi), ≈136°", en: "≈82° (within a face), ≈136°" } },
  pentagonal_bipyramidal: { tr: "beşgen çift piramit", en: "pentagonal bipyramidal", angles: { tr: "72° (düzlem), 90° (eksen–düzlem), 180° (eksen)", en: "72° (equatorial), 90° (axial–equatorial), 180° (axial)" } },
  square_antiprismatic: { tr: "kare antiprizma", en: "square antiprismatic", angles: { tr: "≈70–78° (komşular)", en: "≈70–78° (neighbours)" } },
  hexagonal_bipyramidal: { tr: "altıgen çift piramit", en: "hexagonal bipyramidal", angles: { tr: "60° (düzlem), 90° (eksen–düzlem), 180° (eksen)", en: "60° (equatorial), 90° (axial–equatorial), 180° (axial)" } },
  hexagonal_pyramidal: { tr: "altıgen piramit", en: "hexagonal pyramidal", angles: { tr: "60° (düzlem), 90° (apikal)", en: "60° (equatorial), 90° (apical)" } },
  hexagonal_planar: { tr: "altıgen düzlem", en: "hexagonal planar", angles: { tr: "60°", en: "60°" } },
  tricapped_trigonal_prismatic: { tr: "üç şapkalı üçgen prizma", en: "tricapped trigonal prismatic", angles: { tr: "≈70–80° (komşular)", en: "≈70–80° (neighbours)" } },
  bicapped_square_antiprismatic: { tr: "iki şapkalı kare antiprizma", en: "bicapped square antiprismatic", angles: { tr: "≈65–75° (komşular)", en: "≈65–75° (neighbours)" } },
  icosahedral: { tr: "ikozahedral (düzgün yirmiyüzlü)", en: "icosahedral", angles: { tr: "≈63,4° (komşular)", en: "≈63.4° (neighbours)" } },
  sandwich: { tr: "sandviç (metalosen)", en: "sandwich (metallocene)", angles: { tr: "halka–metal–halka 180°", en: "ring–metal–ring 180°" } },
  bent_metallocene: { tr: "bükük metalosen (sözde dörtyüzlü)", en: "bent metallocene (pseudo-tetrahedral)", angles: { tr: "halka–metal–halka ≈130°, X–M–X ≈94°", en: "ring–metal–ring ≈130°, X–M–X ≈94°" } },
  piano_stool: { tr: "piyano taburesi (yarım sandviç)", en: "piano stool (half-sandwich)", angles: { tr: "≈125° (halka–metal–ligand)", en: "≈125° (ring–metal–ligand)" } },
};

const deg = Math.PI / 180;

function polar(theta: number, phi: number): Vec {
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}

const ring = (n: number, theta = 90, from = 0): Vec[] => Array.from({ length: n }, (_, i) => polar(theta * deg, (from + (i * 360) / n) * deg));

/** The directions from the metal to each coordination site (bipyramids: the axial ones first). */
function geometrySites(geometry: Geometry, legs = 3): Vec[] {
  switch (geometry) {
    case "linear":
    case "sandwich":
      return [[0, 0, 1], [0, 0, -1]];
    case "trigonal_planar":
      return ring(3);
    case "tetrahedral":
      return ([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as Vec[]).map(unit);
    case "square_planar":
      return [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]];
    case "trigonal_bipyramidal":
      return [[0, 0, 1], [0, 0, -1], ...ring(3)];
    case "square_pyramidal":
      // The metal sits a little above the basal plane.
      return [[0, 0, 1], ...ring(4, 100)];
    case "octahedral":
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case "trigonal_prismatic":
      return [...ring(3, 49.1), ...ring(3, 130.9)];
    case "pentagonal_bipyramidal":
      return [[0, 0, 1], [0, 0, -1], ...ring(5)];
    case "square_antiprismatic":
      return [...ring(4, 59.3), ...ring(4, 120.7, 45)];
    case "hexagonal_bipyramidal":
      return [[0, 0, 1], [0, 0, -1], ...ring(6)];
    case "hexagonal_pyramidal":
      return [[0, 0, 1], ...ring(6)];
    case "hexagonal_planar":
      return ring(6);
    case "tricapped_trigonal_prismatic":
      return [...ring(3, 45), ...ring(3, 135), ...ring(3, 90, 60)];
    case "bicapped_square_antiprismatic":
      return [[0, 0, 1], [0, 0, -1], ...ring(4, 65), ...ring(4, 115, 45)];
    case "icosahedral": {
      const g = (1 + Math.sqrt(5)) / 2;
      const v: Vec[] = [];
      for (const a of [1, -1]) for (const b of [g, -g]) v.push([0, a, b], [a, b, 0], [b, 0, a]);
      return v.map(unit);
    }
    case "bent_metallocene": {
      const sigma: Vec[] = legs === 1 ? [[0, 0, -1]] : legs === 2 ? [[0, Math.sin(47 * deg), -Math.cos(47 * deg)], [0, -Math.sin(47 * deg), -Math.cos(47 * deg)]] : [[0, Math.sin(60 * deg), -Math.cos(60 * deg)], [0, 0, -1], [0, -Math.sin(60 * deg), -Math.cos(60 * deg)]];
      return [polar(65 * deg, 0), polar(65 * deg, Math.PI), ...sigma];
    }
    case "piano_stool":
      return [[0, 0, 1], ...Array.from({ length: legs }, (_, i) => polar(125 * deg, (i * 2 * Math.PI) / legs))];
  }
}

/** Site indices on the main axis (apex of a pyramid, the two ends of a bipyramid). */
function axialSites(geometry: Geometry): number[] {
  if (geometry === "square_pyramidal" || geometry === "hexagonal_pyramidal") return [0];
  if (geometry === "trigonal_bipyramidal" || geometry === "pentagonal_bipyramidal" || geometry === "hexagonal_bipyramidal") return [0, 1];
  return [];
}

// --- counter-ions ----------------------------------------------------------------------------------

export interface CounterIon {
  id: string;
  aliases: string[];
  formula: string;
  atoms: Record<string, number>;
  charge: number;
  en: string;
  tr: string;
}

const COUNTER_IONS: CounterIon[] = [
  { id: "H+", aliases: ["h+", "hydrogen", "hidrojen"], formula: "H", atoms: { H: 1 }, charge: 1, en: "hydrogen", tr: "hidrojen" },
  { id: "Li+", aliases: ["li", "li+", "lithium", "lityum"], formula: "Li", atoms: { Li: 1 }, charge: 1, en: "lithium", tr: "lityum" },
  { id: "Na+", aliases: ["na", "na+", "sodium", "sodyum"], formula: "Na", atoms: { Na: 1 }, charge: 1, en: "sodium", tr: "sodyum" },
  { id: "K+", aliases: ["k", "k+", "potassium", "potasyum"], formula: "K", atoms: { K: 1 }, charge: 1, en: "potassium", tr: "potasyum" },
  { id: "Rb+", aliases: ["rb", "rb+", "rubidium", "rubidyum"], formula: "Rb", atoms: { Rb: 1 }, charge: 1, en: "rubidium", tr: "rubidyum" },
  { id: "Cs+", aliases: ["cs", "cs+", "caesium", "cesium", "sezyum"], formula: "Cs", atoms: { Cs: 1 }, charge: 1, en: "caesium", tr: "sezyum" },
  { id: "NH4+", aliases: ["nh4", "nh4+", "ammonium", "amonyum"], formula: "NH4", atoms: { N: 1, H: 4 }, charge: 1, en: "ammonium", tr: "amonyum" },
  { id: "NBu4+", aliases: ["nbu4", "nbu4+", "tetrabutylammonium", "tetrabütilamonyum", "tba"], formula: "NBu4", atoms: { N: 1, C: 16, H: 36 }, charge: 1, en: "tetrabutylammonium", tr: "tetrabütilamonyum" },
  { id: "PPh4+", aliases: ["pph4", "pph4+", "tetraphenylphosphonium", "tetrafenilfosfonyum"], formula: "PPh4", atoms: { P: 1, C: 24, H: 20 }, charge: 1, en: "tetraphenylphosphonium", tr: "tetrafenilfosfonyum" },
  { id: "Mg2+", aliases: ["mg", "mg2+", "magnesium", "magnezyum"], formula: "Mg", atoms: { Mg: 1 }, charge: 2, en: "magnesium", tr: "magnezyum" },
  { id: "Ca2+", aliases: ["ca", "ca2+", "calcium", "kalsiyum"], formula: "Ca", atoms: { Ca: 1 }, charge: 2, en: "calcium", tr: "kalsiyum" },
  { id: "Sr2+", aliases: ["sr", "sr2+", "strontium", "stronsiyum"], formula: "Sr", atoms: { Sr: 1 }, charge: 2, en: "strontium", tr: "stronsiyum" },
  { id: "Ba2+", aliases: ["ba", "ba2+", "barium", "baryum"], formula: "Ba", atoms: { Ba: 1 }, charge: 2, en: "barium", tr: "baryum" },
  { id: "F-", aliases: ["f", "f-", "fluoride", "florür"], formula: "F", atoms: { F: 1 }, charge: -1, en: "fluoride", tr: "florür" },
  { id: "Cl-", aliases: ["cl", "cl-", "chloride", "klorür"], formula: "Cl", atoms: { Cl: 1 }, charge: -1, en: "chloride", tr: "klorür" },
  { id: "Br-", aliases: ["br", "br-", "bromide", "bromür"], formula: "Br", atoms: { Br: 1 }, charge: -1, en: "bromide", tr: "bromür" },
  { id: "I-", aliases: ["i", "i-", "iodide", "iyodür"], formula: "I", atoms: { I: 1 }, charge: -1, en: "iodide", tr: "iyodür" },
  { id: "OH-", aliases: ["oh", "oh-", "hydroxide", "hidroksit"], formula: "OH", atoms: { O: 1, H: 1 }, charge: -1, en: "hydroxide", tr: "hidroksit" },
  { id: "CN-", aliases: ["cn-", "cyanide", "siyanür"], formula: "CN", atoms: { C: 1, N: 1 }, charge: -1, en: "cyanide", tr: "siyanür" },
  { id: "NO3-", aliases: ["no3", "no3-", "nitrate", "nitrat"], formula: "NO3", atoms: { N: 1, O: 3 }, charge: -1, en: "nitrate", tr: "nitrat" },
  { id: "NO2-", aliases: ["no2-", "nitrite", "nitrit"], formula: "NO2", atoms: { N: 1, O: 2 }, charge: -1, en: "nitrite", tr: "nitrit" },
  { id: "ClO4-", aliases: ["clo4", "clo4-", "perchlorate", "perklorat"], formula: "ClO4", atoms: { Cl: 1, O: 4 }, charge: -1, en: "perchlorate", tr: "perklorat" },
  { id: "BF4-", aliases: ["bf4", "bf4-", "tetrafluoroborate", "tetrafluoridoborate", "tetrafloroborat"], formula: "BF4", atoms: { B: 1, F: 4 }, charge: -1, en: "tetrafluoridoborate", tr: "tetrafloridoborat" },
  { id: "PF6-", aliases: ["pf6", "pf6-", "hexafluorophosphate", "hexafluoridophosphate", "hekzaflorofosfat"], formula: "PF6", atoms: { P: 1, F: 6 }, charge: -1, en: "hexafluoridophosphate", tr: "hekzafloridofosfat" },
  { id: "BPh4-", aliases: ["bph4", "bph4-", "tetraphenylborate", "tetrafenilborat"], formula: "BPh4", atoms: { B: 1, C: 24, H: 20 }, charge: -1, en: "tetraphenylborate", tr: "tetrafenilborat" },
  { id: "OTf-", aliases: ["otf", "otf-", "triflate", "trifluoromethanesulfonate", "triflat"], formula: "OTf", atoms: { C: 1, F: 3, O: 3, S: 1 }, charge: -1, en: "trifluoromethanesulfonate", tr: "triflorometansülfonat" },
  { id: "SCN-", aliases: ["scn-", "thiocyanate", "tiyosiyanat"], formula: "SCN", atoms: { S: 1, C: 1, N: 1 }, charge: -1, en: "thiocyanate", tr: "tiyosiyanat" },
  { id: "SO4 2-", aliases: ["so4", "so42-", "so4 2-", "so4^2-", "sulfate", "sülfat"], formula: "SO4", atoms: { S: 1, O: 4 }, charge: -2, en: "sulfate", tr: "sülfat" },
  { id: "CO3 2-", aliases: ["co3", "co32-", "co3 2-", "carbonate", "karbonat"], formula: "CO3", atoms: { C: 1, O: 3 }, charge: -2, en: "carbonate", tr: "karbonat" },
  { id: "C2O4 2-", aliases: ["c2o4", "oxalate ion", "oksalat iyonu"], formula: "C2O4", atoms: { C: 2, O: 4 }, charge: -2, en: "oxalate", tr: "oksalat" },
  { id: "PO4 3-", aliases: ["po4", "po43-", "phosphate", "fosfat"], formula: "PO4", atoms: { P: 1, O: 4 }, charge: -3, en: "phosphate", tr: "fosfat" },
];

export function findCounterIon(name: string): CounterIon | null {
  const wanted = normalName(name);
  return COUNTER_IONS.find((ion) => normalName(ion.id) === wanted || ion.aliases.some((alias) => normalName(alias) === wanted)) ?? null;
}

// --- reading a formula -----------------------------------------------------------------------------

const SUB_TO_DIGIT: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
const SUP_TO_TEXT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-" };

export function plainFormula(input: string): string {
  return input
    .replace(/[₀-₉]/g, (d) => SUB_TO_DIGIT[d] ?? d)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (d) => SUP_TO_TEXT[d] ?? d)
    .replace(/\s+/g, "")
    .replace(/−/g, "-");
}

/** Splits "O(acac)2", "(NH3)5Cl" or "Cl2(en)2" into [text, count] groups. */
function groups(text: string): [string, number][] {
  const out: [string, number][] = [];
  let i = 0;
  while (i < text.length) {
    let part: string;
    if (text[i] === "(") {
      let depth = 0;
      let close = i;
      for (; close < text.length; close++) {
        if (text[close] === "(") depth++;
        if (text[close] === ")" && --depth === 0) break;
      }
      if (close >= text.length) throw new ComplexError(`"${text}" içinde kapanmayan parantez var.`);
      part = text.slice(i + 1, close);
      i = close + 1;
    } else {
      const match = text.slice(i).match(/^[A-Z][a-z]?\*?/);
      if (!match) throw new ComplexError(`"${text}" okunamadı.`);
      part = match[0];
      i += part.length;
    }
    const count = text.slice(i).match(/^\d+/);
    if (count) i += count[0].length;
    out.push([part, count ? Number(count[0]) : 1]);
  }
  return out;
}

/** Counter-ions outside the bracket: "K3", "Cl3", "(NO3)2", "SO4", "(NH4)2". */
function ionGroups(text: string): [CounterIon, number][] {
  const formulas = [...COUNTER_IONS].sort((a, b) => b.formula.length - a.formula.length);
  const out: [CounterIon, number][] = [];
  let i = 0;
  while (i < text.length) {
    let ion: CounterIon | undefined;
    if (text[i] === "(") {
      const close = text.indexOf(")", i);
      if (close < 0) throw new ComplexError(`"${text}" içinde kapanmayan parantez var.`);
      ion = findCounterIon(text.slice(i + 1, close)) ?? undefined;
      if (!ion) throw new ComplexError(`"${text.slice(i + 1, close)}" karşı iyonu tanınmadı.`);
      i = close + 1;
    } else {
      ion = formulas.find((candidate) => text.startsWith(candidate.formula, i));
      if (!ion) throw new ComplexError(`"${text.slice(i)}" karşı iyonu tanınmadı.`);
      i += ion.formula.length;
    }
    const count = text.slice(i).match(/^\d+/);
    if (count) i += count[0].length;
    out.push([ion, count ? Number(count[0]) : 1]);
  }
  return out;
}

/**
 * A bracket formula as chemists write it - "[VO(acac)2]", "[Co(NH3)6]Cl3", "K3[Fe(CN)6]",
 * "[Cu(H2O)6]2+", "[Fe(C5H5)2]" - into the complex's metal, ligands, charge and counter-ions.
 * A formula without brackets ("Fe(CO)5", "Cr(C6H6)2") is read as a neutral complex.
 */
export function parseComplexFormula(input: string): Omit<ComplexInput, "oxidationState" | "isomer" | "geometry"> | null {
  let text = plainFormula(input);
  if (/\]\d+[A-Z(]/.test(text)) {
    throw new ComplexError("Birden çok kompleks birimi içeren formüller ([Cr(H2O)6]2(SO4)3 gibi) henüz çizilemiyor; kompleks iyonu tek başına yazın.");
  }
  if (!text.includes("[")) {
    // "Fe(CO)5", "Ni(CO)4": a metal symbol first, then ligand groups.
    const bare = text.match(/^([A-Z][a-z]?)(\(.+|[A-Z].*)$/);
    if (!bare || !METALS[bare[1]]) return null;
    text = `[${text}]`;
  }
  const match = text.match(/^([A-Za-z0-9()]*)\[([^\]]+)\]\^?(\d*[+-])?([A-Za-z0-9()]*)$/);
  if (!match) return null;
  const [, before, inside, chargeText, after] = match;
  const metalMatch = inside.match(/^([A-Z][a-z]?)/);
  if (!metalMatch) return null;
  let metal = metalMatch[1];
  // "Co" is cobalt, but "CO…" is a C followed by an O; a metal symbol must be a metal the app knows.
  if (!METALS[metal] && METALS[metal[0]]) metal = metal[0];
  if (!METALS[metal]) return null;
  const ligands: ComplexInput["ligands"] = [];
  for (const [part, count] of groups(inside.slice(metal.length))) {
    const ligand = findLigand(part === "O" ? "oxo" : part === "N" ? "nitrido" : part === "S" ? "sulfido" : part);
    if (!ligand) throw new ComplexError(`"${part}" ligandı tanınmadı; desteklenenler: ${LIGAND_IDS.join(", ")}.`);
    const known = ligands.find((entry) => entry.ligand.id === ligand.id);
    if (known) known.count += count;
    else ligands.push({ ligand, count });
  }
  const counterIons: ComplexInput["counterIons"] = [];
  for (const [ion, count] of [...(before ? ionGroups(before) : []), ...(after ? ionGroups(after) : [])]) counterIons.push({ ion, count });
  // No charge and no counter-ions: a bracket written bare is a neutral complex.
  let charge: number | undefined = counterIons.length ? undefined : 0;
  if (chargeText) {
    const magnitude = chargeText.slice(0, -1) ? Number(chargeText.slice(0, -1)) : 1;
    charge = chargeText.endsWith("-") ? -magnitude : magnitude;
  }
  return { metal, ligands, counterIons, charge };
}

// --- symmetry --------------------------------------------------------------------------------------

type Matrix = [Vec, Vec, Vec];

interface SiteOp {
  matrix: Matrix;
  perm: number[];
  proper: boolean;
}

const apply = (m: Matrix, v: Vec): Vec => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

/** Rows of F2·F1ᵀ: the rotation taking frame 1 to frame 2 (columns are the frames' axes). */
function frameMap(f1: Vec[], f2: Vec[]): Matrix {
  const row = (r: number): Vec => [0, 1, 2].map((c) => f2.reduce((sum, axis, k) => sum + axis[r] * f1[k][c], 0)) as Vec;
  return [row(0), row(1), row(2)];
}

/** Every rotation and reflection that takes the set of sites onto itself. */
function siteOperations(sites: Vec[]): SiteOp[] {
  const i0 = 0;
  const j0 = sites.findIndex((s, j) => j !== i0 && Math.abs(dot(s, sites[i0])) < 0.99);
  if (j0 < 0) return [];
  const angle = dot(sites[i0], sites[j0]);
  const frame = (a: Vec, b: Vec, flip: boolean): Vec[] => {
    const b2 = unit(sub(b, scale(a, dot(a, b))));
    const c = cross(a, b2);
    return [a, b2, flip ? scale(c, -1) : c];
  };
  const source = frame(sites[i0], sites[j0], false);
  const ops: SiteOp[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < sites.length; i++) {
    for (let j = 0; j < sites.length; j++) {
      if (i === j || Math.abs(dot(sites[i], sites[j]) - angle) > 1e-3) continue;
      for (const flip of [false, true]) {
        const m = frameMap(source, frame(sites[i], sites[j], flip));
        const perm = sites.map((s) => sites.findIndex((t) => distance(apply(m, s), t) < 1e-3));
        if (perm.some((p) => p < 0) || new Set(perm).size !== perm.length) continue;
        const key = `${perm.join(",")}|${flip}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ops.push({ matrix: m, perm, proper: !flip });
      }
    }
  }
  return ops;
}

interface Placed {
  ligand: LigandDef;
  /** Sites in the ligand's donor order. */
  sites: number[];
}

function instanceText(placed: Placed, perm?: number[]): string {
  return `${placed.ligand.id}[${placed.ligand.donors.map((kind, i) => `${kind}@${perm ? perm[placed.sites[i]] : placed.sites[i]}`).sort().join(",")}]`;
}

function describe(arrangement: Placed[], perm?: number[]): string {
  return arrangement.map((placed) => instanceText(placed, perm)).sort().join("|");
}

function canonical(arrangement: Placed[], ops: SiteOp[]): string {
  let best = describe(arrangement);
  for (const op of ops) {
    if (!op.proper) continue;
    const text = describe(arrangement, op.perm);
    if (text < best) best = text;
  }
  return best;
}

function mirrorCanonical(arrangement: Placed[], ops: SiteOp[]): string {
  const mirror = ops.find((op) => !op.proper);
  if (!mirror) return canonical(arrangement, ops);
  return canonical(arrangement.map((placed) => ({ ...placed, sites: placed.sites.map((s) => mirror.perm[s]) })), ops);
}

/** Symmetry operations of the site set that leave this arrangement as it is. */
function stabiliser(arrangement: Placed[], ops: SiteOp[]): SiteOp[] {
  const here = describe(arrangement);
  return ops.filter((op) => describe(arrangement, op.perm) === here);
}

/** The site tuples (in donor order) a ligand could take among the free sites. */
function candidates(ligand: LigandDef, sites: Vec[], free: boolean[], geometry: Geometry): number[][] {
  const n = sites.length;
  const idx = [...Array(n).keys()].filter((i) => free[i]);
  const angle = (i: number, j: number) => angleBetween(sites[i], sites[j]);
  const cis = (i: number, j: number) => angle(i, j) < 112;
  const trans = (i: number, j: number) => angle(i, j) > 150;
  const out: number[][] = [];
  const symmetricEnds = ligand.donors[0] === ligand.donors[ligand.donors.length - 1];
  switch (ligand.pattern) {
    case "mono":
      for (const i of idx) out.push([i]);
      break;
    case "chelate":
      for (const i of idx) for (const j of idx) if (i !== j && cis(i, j) && (!symmetricEnds || i < j)) out.push([i, j]);
      break;
    case "chain3":
      for (const b of idx)
        for (const a of idx)
          for (const c of idx) {
            if (a === b || b === c || a === c || !cis(a, b) || !cis(b, c)) continue;
            if (symmetricEnds && a > c) continue;
            if (ligand.span === "mer" && !trans(a, c)) continue;
            if (ligand.span === "fac" && !cis(a, c)) continue;
            out.push([a, b, c]);
          }
      break;
    case "ring3":
      for (const a of idx) for (const b of idx) for (const c of idx) if (a < b && b < c && cis(a, b) && cis(b, c) && cis(a, c)) out.push([a, b, c]);
      break;
    case "ring4":
      for (const a of idx)
        for (const b of idx)
          for (const c of idx)
            for (const d of idx) {
              if (new Set([a, b, c, d]).size < 4) continue;
              if (cis(a, b) && cis(b, c) && cis(c, d) && cis(d, a) && trans(a, c) && trans(b, d)) out.push([a, b, c, d]);
            }
      break;
    case "tripod4":
      for (const a of idx)
        for (const x of idx)
          for (const y of idx)
            for (const z of idx) {
              if (!(x < y && y < z) || [x, y, z].includes(a)) continue;
              if (cis(a, x) && cis(a, y) && cis(a, z)) out.push([a, x, y, z]);
            }
      break;
    case "ring6": {
      const flat = idx.filter((i) => Math.abs(sites[i][2]) < 0.1).sort((i, j) => Math.atan2(sites[i][1], sites[i][0]) - Math.atan2(sites[j][1], sites[j][0]));
      if (flat.length === 6) out.push(flat);
      break;
    }
    case "edta":
      if (geometry === "octahedral" && idx.length === 6) out.push([0, 1, 2, 3, 4, 5]);
      break;
  }
  return out;
}

/** Every way to put the ligands on the sites. */
function arrangements(sites: Vec[], ligands: LigandDef[], geometry: Geometry): Placed[][] {
  const order = [...ligands].sort((a, b) => b.donors.length - a.donors.length || a.id.localeCompare(b.id));
  const results: Placed[][] = [];
  const free = new Array(sites.length).fill(true);
  const current: Placed[] = [];
  const walk = (k: number) => {
    if (results.length > 4000) return;
    if (k === order.length) {
      results.push(current.map((placed) => ({ ...placed, sites: [...placed.sites] })));
      return;
    }
    const ligand = order[k];
    // Identical ligands one after another take their sites in increasing order (no duplicates).
    const previous = k > 0 && order[k - 1].id === ligand.id ? Math.min(...current[k - 1].sites) : -1;
    for (const tuple of candidates(ligand, sites, free, geometry)) {
      if (Math.min(...tuple) <= previous) continue;
      tuple.forEach((s) => (free[s] = false));
      current.push({ ligand, sites: tuple });
      walk(k + 1);
      current.pop();
      tuple.forEach((s) => (free[s] = true));
    }
  };
  walk(0);
  return results;
}

/** The idealised point group of things placed on sites (ligands, or VSEPR's atoms and lone pairs). */
export function arrangementPointGroup(sites: Vec[], placed: { ligand: string; sites: number[] }[]): PointGroup | null {
  const ops = siteOperations(sites);
  if (ops.length === 0) return null;
  const text = (perm?: number[]) =>
    placed
      .map((p) => `${p.ligand}:${p.sites.map((s) => (perm ? perm[s] : s)).sort((a, b) => a - b).join(".")}`)
      .sort()
      .join("|");
  const here = text();
  const kept = ops.filter((op) => text(op.perm) === here);
  return kept.length ? pointGroup(kept.map((op) => op.matrix)) : null;
}

export interface PointGroup {
  letter: string;
  order: string;
  suffix: string;
}

export function pointGroupText(group: PointGroup): string {
  return `${group.letter}${group.order}${group.suffix}`;
}

/** Schoenflies symbol of a finite group of orthogonal matrices. */
function pointGroup(ops: Matrix[]): PointGroup {
  const det = (m: Matrix) => dot(m[0], cross(m[1], m[2]));
  const trace = (m: Matrix) => m[0][0] + m[1][1] + m[2][2];
  const axisOf = (m: Matrix): Vec => {
    const v: Vec = [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]];
    if (length(v) > 1e-6) return unit(v);
    const cols: Vec[] = [0, 1, 2].map((c) => [m[0][c] + (c === 0 ? 1 : 0), m[1][c] + (c === 1 ? 1 : 0), m[2][c] + (c === 2 ? 1 : 0)] as Vec);
    return unit(cols.reduce((best, col) => (length(col) > length(best) ? col : best)));
  };
  const negate = (m: Matrix): Matrix => m.map((row) => scale(row, -1)) as Matrix;
  const rotations: { axis: Vec; angle: number }[] = [];
  const reflections: Vec[] = [];
  let inversion = false;
  let rotoreflections = 0;
  for (const m of ops) {
    if (det(m) > 0) {
      const angle = Math.acos(Math.max(-1, Math.min(1, (trace(m) - 1) / 2)));
      if (angle > 1e-3) rotations.push({ axis: axisOf(m), angle });
    } else {
      const proper = negate(m);
      const angle = Math.acos(Math.max(-1, Math.min(1, (trace(proper) - 1) / 2)));
      if (angle < 1e-3) inversion = true;
      else if (Math.abs(angle - Math.PI) < 1e-3) reflections.push(axisOf(proper));
      else rotoreflections++;
    }
  }
  const axes: { axis: Vec; n: number }[] = [];
  for (const r of rotations) {
    const n = Math.round((2 * Math.PI) / r.angle);
    const known = axes.find((a) => Math.abs(dot(a.axis, r.axis)) > 0.999);
    if (known) known.n = Math.max(known.n, n);
    else axes.push({ axis: r.axis, n });
  }
  const high = axes.filter((a) => a.n >= 3);
  if (high.length >= 2) {
    const properCount = rotations.length + 1;
    if (properCount >= 24) return { letter: "O", order: "", suffix: inversion ? "h" : "" };
    return { letter: "T", order: "", suffix: inversion ? "h" : reflections.length ? "d" : "" };
  }
  if (axes.length === 0) {
    if (reflections.length) return { letter: "C", order: "", suffix: "s" };
    if (inversion) return { letter: "C", order: "", suffix: "i" };
    return { letter: "C", order: "1", suffix: "" };
  }
  const n = Math.max(...axes.map((a) => a.n));
  const principal = axes.find((a) => a.n === n)!.axis;
  const perpendicularC2 = axes.filter((a) => a.n % 2 === 0 && Math.abs(dot(a.axis, principal)) < 1e-3).length;
  const horizontal = reflections.some((normal) => Math.abs(dot(normal, principal)) > 0.999);
  const vertical = reflections.filter((normal) => Math.abs(dot(normal, principal)) < 1e-3).length;
  if (perpendicularC2 >= n) return { letter: "D", order: String(n), suffix: horizontal ? "h" : vertical >= n ? "d" : "" };
  if (horizontal) return { letter: "C", order: String(n), suffix: "h" };
  if (vertical >= n) return { letter: "C", order: String(n), suffix: "v" };
  if (rotoreflections > 0) return { letter: "S", order: String(2 * n), suffix: "" };
  return { letter: "C", order: String(n), suffix: "" };
}

// --- d electrons -----------------------------------------------------------------------------------

interface Level {
  label: string;
  orbitals: number;
}

const lv = (label: string, orbitals: number): Level => ({ label, orbitals });

const LEVELS: Record<Geometry, Level[]> = {
  octahedral: [lv("t₂g", 3), lv("eg", 2)],
  tetrahedral: [lv("e", 2), lv("t₂", 3)],
  square_planar: [lv("eg (dxz, dyz)", 2), lv("a₁g (dz²)", 1), lv("b₂g (dxy)", 1), lv("b₁g (dx²−y²)", 1)],
  square_pyramidal: [lv("e (dxz, dyz)", 2), lv("b₂ (dxy)", 1), lv("a₁ (dz²)", 1), lv("b₁ (dx²−y²)", 1)],
  trigonal_bipyramidal: [lv("e″ (dxz, dyz)", 2), lv("e′ (dxy, dx²−y²)", 2), lv("a₁′ (dz²)", 1)],
  linear: [lv("δ (dxy, dx²−y²)", 2), lv("π (dxz, dyz)", 2), lv("σ (dz²)", 1)],
  trigonal_planar: [lv("e″ (dxz, dyz)", 2), lv("a₁′ (dz²)", 1), lv("e′ (dxy, dx²−y²)", 2)],
  trigonal_prismatic: [lv("a₁′ (dz²)", 1), lv("e′ (dxy, dx²−y²)", 2), lv("e″ (dxz, dyz)", 2)],
  pentagonal_bipyramidal: [lv("e₁″ (dxz, dyz)", 2), lv("e₂′ (dxy, dx²−y²)", 2), lv("a₁′ (dz²)", 1)],
  square_antiprismatic: [lv("a₁ (dz²)", 1), lv("e₂ (dxy, dx²−y²)", 2), lv("e₃ (dxz, dyz)", 2)],
  hexagonal_bipyramidal: [lv("e₂g (dxy, dx²−y²)", 2), lv("e₁g (dxz, dyz)", 2), lv("a₁g (dz²)", 1)],
  hexagonal_pyramidal: [lv("e₂ (dxy, dx²−y²)", 2), lv("e₁ (dxz, dyz)", 2), lv("a₁ (dz²)", 1)],
  hexagonal_planar: [lv("a₁g (dz²)", 1), lv("e₁g (dxz, dyz)", 2), lv("e₂g (dxy, dx²−y²)", 2)],
  tricapped_trigonal_prismatic: [lv("e″ (dxz, dyz)", 2), lv("e′ (dxy, dx²−y²)", 2), lv("a₁′ (dz²)", 1)],
  bicapped_square_antiprismatic: [lv("e₂ (dxy, dx²−y²)", 2), lv("e₃ (dxz, dyz)", 2), lv("a₁ (dz²)", 1)],
  icosahedral: [lv("h (5 d)", 5)],
  sandwich: [lv("e₂g (dxy, dx²−y²)", 2), lv("a₁g (dz²)", 1), lv("e₁g* (dxz, dyz)", 2)],
  bent_metallocene: [lv("1a₁", 1), lv("b₂", 1), lv("2a₁", 1), lv("b₁", 1), lv("a₂", 1)],
  piano_stool: [lv("t₂g", 3), lv("eg", 2)],
};

/** A metal–oxo bond (vanadyl, VO²⁺) pushes dxz and dyz up: dxy is the lowest orbital. */
const OXO_SQUARE_PYRAMID: Level[] = [lv("b₂ (dxy)", 1), lv("e (dxz, dyz)", 2), lv("b₁ (dx²−y²)", 1), lv("a₁ (dz²)", 1)];

/** Electrons per orbital, level by level, filled low spin (pair within a level first) or high spin. */
function fill(levels: Level[], electrons: number, lowSpin: boolean): number[][] {
  const occupancy = levels.map((level) => new Array(level.orbitals).fill(0) as number[]);
  let left = electrons;
  if (lowSpin) {
    for (const level of occupancy) {
      for (let pass = 0; pass < 2 && left > 0; pass++) {
        for (let i = 0; i < level.length && left > 0; i++) {
          level[i]++;
          left--;
        }
      }
    }
  } else {
    for (let pass = 0; pass < 2; pass++) {
      for (const level of occupancy) {
        for (let i = 0; i < level.length && left > 0; i++) {
          level[i]++;
          left--;
        }
      }
    }
  }
  return occupancy;
}

// --- the analysis ----------------------------------------------------------------------------------

export interface ComplexInput {
  metal: string;
  oxidationState?: number;
  /** Charge of the complex ion (when the oxidation state is not given). */
  charge?: number;
  ligands: { ligand: LigandDef; count: number }[];
  counterIons: { ion: CounterIon; count: number }[];
  isomer?: string;
  geometry?: Geometry;
}

export interface ComplexIsomer {
  label: string;
  chiral: boolean;
  chosen: boolean;
}

export interface ComplexResult {
  metal: string;
  metalName: string;
  /** Metal atoms in the compound (2 for Mn₂(CO)₁₀). */
  centres: number;
  oxidationState: number;
  charge: number;
  /** [VO(acac)₂], [Co(NH₃)₆]³⁺ */
  ion: string;
  /** The whole compound with its counter-ions: K₃[Fe(CN)₆] */
  compound: string;
  hill: string;
  molarMass: number;
  exactMass: number | null;
  composition: CompositionRow[];
  coordinationNumber: number;
  /** How the coordination reads: "6", or "2 halka (η⁵ + η⁵)" for a sandwich. */
  coordinationText: string;
  geometry: Geometry | "cluster";
  geometryName: string;
  angles: string;
  hybridisation: string;
  dElectrons: number | null;
  /** f electrons for lanthanides and actinides. */
  fElectrons: number | null;
  configuration: string;
  spin: "high" | "low" | null;
  unpaired: number;
  magneticMoment: number;
  /** "spin-only", or the term symbol for a lanthanide (J-based moment). */
  momentBasis: string;
  cfse: string | null;
  valenceElectrons: number;
  /** Metal–metal bonding in a cluster ("Mn–Mn tekli bağ"). */
  metalMetal?: string;
  isomers: ComplexIsomer[];
  pointGroup: PointGroup | null;
  nameEn: string;
  nameTr: string;
  ligands: { id: string; count: number; name: string; charge: number; denticity: number; donor: string }[];
  notes: string[];
  model: Model3D;
}

const PREFIX = {
  simple: { en: ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona"], tr: ["", "", "di", "tri", "tetra", "penta", "hekza", "hepta", "okta", "nona"] },
  complex: { en: ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis", "heptakis", "octakis", "nonakis"], tr: ["", "", "bis", "tris", "tetrakis", "pentakis", "hekzakis", "heptakis", "oktakis", "nonakis"] },
};
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

export function roman(n: number): string {
  if (n < 0) return `−${ROMAN[-n] ?? -n}`;
  return ROMAN[n] ?? String(n);
}

/** "[VO(acac)₂]" with the charge as a superscript. */
function ionFormula(metal: string, ligands: { ligand: LigandDef; count: number }[], charge: number): string {
  const parts = ligands.map(({ ligand, count }) => {
    const chemical = /^[A-Z]/.test(ligand.formula) && !ligand.formula.includes("-");
    const text = chemical ? ligand.formula.replace(/(\d+)/g, (d) => subscript(d)) : ligand.formula;
    const single = /^[A-Z][a-z]?$/.test(ligand.formula);
    const body = single ? text : `(${text})`;
    return count > 1 ? `${body}${subscript(String(count))}` : body;
  });
  return `[${metal}${parts.join("")}]${superscript(chargeLabel(charge))}`;
}

/** Alphabetical order ignores η/κ prefixes and locants ("1,10-phenanthroline" sorts under p). */
function sortKey(name: string, language: Language): string {
  return name
    .replace(/^\(/, "")
    .replace(/^η[⁰-⁹]+-/, "")
    .replace(/^[0-9A-Z,′'″:]+-(?=[a-zçğıöşü(])/, "")
    .toLocaleLowerCase(language === "en" ? "en" : "tr");
}

export function ligandNames(ligands: { ligand: LigandDef; count: number }[], language: Language): string {
  const name = (l: LigandDef) => (language === "en" ? l.en : l.tr);
  return [...ligands]
    .sort((a, b) => sortKey(name(a.ligand), language).localeCompare(sortKey(name(b.ligand), language), language === "en" ? "en" : "tr"))
    .map(({ ligand, count }) => {
      const text = name(ligand);
      const plain = /^[a-zçğıöşü]+$/i.test(text);
      if (count === 1) return ligand.complexName && !plain ? `(${text})` : text;
      if (ligand.complexName) return `${PREFIX.complex[language][count] ?? `${count}×`}(${text})`;
      return `${PREFIX.simple[language][count] ?? `${count}×`}${text}`;
    })
    .join("");
}

function complexName(input: ComplexInput, oxidation: number, charge: number, isomer: string, language: Language): string {
  const metal = METALS[input.metal];
  const metalWord = metal ? (charge < 0 ? (language === "en" ? metal.ateEn : metal.ateTr) : language === "en" ? metal.en : metal.tr) : input.metal;
  const core = `${ligandNames(input.ligands, language)}${metalWord}(${roman(oxidation)})`;
  const stereo = isomer && /^(cis|trans|fac|mer|s-fac|u-fac)$/.test(isomer) ? `${isomer}-` : "";
  const cations = input.counterIons.filter(({ ion }) => ion.charge > 0).map(({ ion }) => (language === "en" ? ion.en : ion.tr));
  const anions = input.counterIons.filter(({ ion }) => ion.charge < 0).map(({ ion }) => (language === "en" ? ion.en : ion.tr));
  return [...cations, `${stereo}${core}`, ...anions].join(" ");
}

export function hillText(counts: Map<string, number>): string {
  return hillOrder([...counts.keys()])
    .map((symbol) => `${symbol}${counts.get(symbol)! > 1 ? counts.get(symbol) : ""}`)
    .join("");
}

/** Labels for an arrangement: cis/trans, fac/mer, and which ligand is on the axis. */
function labelFor(arrangement: Placed[], sites: Vec[], geometry: Geometry, language: Language): string {
  const byType = new Map<string, Placed[]>();
  for (const placed of arrangement) byType.set(placed.ligand.id, [...(byType.get(placed.ligand.id) ?? []), placed]);
  const words: string[] = [];
  const angle = (i: number, j: number) => angleBetween(sites[i], sites[j]);
  // Tridentate chains: fac or mer (and for two of them, which way their middles face).
  const chains = arrangement.filter((placed) => placed.ligand.pattern === "chain3" && !placed.ligand.span);
  if (chains.length && geometry === "octahedral") {
    const kinds = chains.map((placed) => (angle(placed.sites[0], placed.sites[2]) > 150 ? "mer" : "fac"));
    if (chains.length === 2 && kinds.every((k) => k === "fac")) words.push(angle(chains[0].sites[1], chains[1].sites[1]) > 150 ? "s-fac" : "u-fac");
    else words.push([...new Set(kinds)].join("/"));
  }
  if (geometry === "octahedral") {
    for (const list of byType.values()) {
      const ligand = list[0].ligand;
      if (list.length === 3 && ligand.pattern === "chelate" && ligand.donors[0] !== ligand.donors[1]) {
        const s = list.map((p) => p.sites[0]);
        words.push(s.every((a, i) => s.every((b, j) => i === j || angle(a, b) < 120)) ? "fac" : "mer");
      }
    }
  }
  if (geometry !== "tetrahedral" && geometry !== "sandwich" && geometry !== "linear") {
    const mono = [...byType.values()].filter((list) => list.every((p) => p.ligand.pattern === "mono"));
    const triples = mono.filter((list) => list.length === 3);
    const pairs = mono.filter((list) => list.length === 2);
    if (triples.length && geometry === "octahedral") {
      const s = triples[0].map((p) => p.sites[0]);
      words.push(s.every((a, i) => s.every((b, j) => i === j || angle(a, b) < 120)) ? "fac" : "mer");
    } else if (pairs.length) {
      words.push(angle(pairs[0][0].sites[0], pairs[0][1].sites[0]) > 150 ? "trans" : "cis");
    }
  }
  const axial = axialSites(geometry);
  if (axial.length && byType.size > 1) {
    const onAxis = arrangement.filter((placed) => placed.sites.some((s) => axial.includes(s))).map((placed) => placed.ligand);
    const names = [...new Set(onAxis.map((l) => (language === "en" ? l.en : l.tr)))];
    if (names.length) words.push(language === "en" ? `${names.join(", ")} axial` : `${names.join(", ")} ${geometry.endsWith("pyramidal") && axial.length === 1 ? "apikal" : "eksenel"}`);
  }
  return words.join(", ");
}

function chooseGeometry(input: ComplexInput, instances: LigandDef[], cn: number, d: number | null, field: number): Geometry {
  const rings = instances.filter((ligand) => ligand.pi && ligand.pattern === "mono" && (ligand.hapto ?? 0) >= 4).length;
  const sigmaSites = instances.filter((ligand) => !(ligand.pi && ligand.pattern === "mono" && (ligand.hapto ?? 0) >= 4)).reduce((n, ligand) => n + ligand.donors.length, 0);
  if (rings === 2 && sigmaSites === 0) return "sandwich";
  if (rings === 2 && sigmaSites <= 3) return "bent_metallocene";
  if (rings === 1 && sigmaSites <= 4) return "piano_stool";
  if (rings > 2) throw new ComplexError("İkiden fazla halkalı π ligandı olan yapılar henüz çizilemiyor.");
  if (instances.some((ligand) => ligand.pattern === "edta")) return "octahedral";
  if (instances.some((ligand) => ligand.pattern === "ring6")) {
    if (cn === 6) return "hexagonal_planar";
    if (cn === 7) return "hexagonal_pyramidal";
    return "hexagonal_bipyramidal";
  }
  const oxo = instances.filter((ligand) => ligand.id === "oxo" || ligand.id === "nitrido").length;
  switch (cn) {
    case 1:
      return "linear";
    case 2:
      return "linear";
    case 3:
      return "trigonal_planar";
    case 4: {
      const heavyD8 = d === 8 && ["Pd", "Pt", "Au", "Rh", "Ir"].includes(input.metal);
      const macro = instances.some((ligand) => ligand.pattern === "ring4");
      const chelated = instances.some((ligand) => ligand.pattern === "chelate" && !ligand.pi);
      if (macro || heavyD8 || ((d === 8 || d === 9) && chelated) || (d === 8 && field >= 2.5) || (d === 9 && field >= 2)) return "square_planar";
      return "tetrahedral";
    }
    case 5:
      return oxo ? "square_pyramidal" : instances.some((ligand) => ligand.pattern === "ring4") ? "square_pyramidal" : "trigonal_bipyramidal";
    case 6:
      return "octahedral";
    case 7:
      return "pentagonal_bipyramidal";
    case 8:
      return oxo >= 2 ? "hexagonal_bipyramidal" : "square_antiprismatic";
    case 9:
      return "tricapped_trigonal_prismatic";
    case 10:
      return "bicapped_square_antiprismatic";
    case 12:
      return "icosahedral";
    default:
      throw new ComplexError(`Koordinasyon sayısı ${cn}: 1–10 ve 12 çizilebiliyor.`);
  }
}

export function analyseComplex(input: ComplexInput, language: Language): ComplexResult {
  const t = (tr: string, en: string) => (language === "en" ? en : tr);
  const notes: string[] = [];
  if (!atomicNumber(input.metal)) throw new ComplexError(`"${input.metal}" bir element sembolü değil.`);
  if (input.ligands.length === 0) throw new ComplexError("Ligand listesi boş.");

  const ligandCharge = input.ligands.reduce((sum, { ligand, count }) => sum + ligand.charge * count, 0);
  const counterCharge = input.counterIons.reduce((sum, { ion, count }) => sum + ion.charge * count, 0);
  let oxidation = input.oxidationState;
  let charge: number;
  if (oxidation !== undefined) {
    charge = oxidation + ligandCharge;
    if (input.charge !== undefined && input.charge !== charge) {
      notes.push(t(`Verilen yük (${input.charge}) yükseltgenme basamağıyla uyuşmuyor; ${charge} alındı.`, `The given charge (${input.charge}) does not match the oxidation state; ${charge} was used.`));
    }
  } else if (input.charge !== undefined) {
    charge = input.charge;
    oxidation = charge - ligandCharge;
  } else if (input.counterIons.length) {
    charge = -counterCharge;
    oxidation = charge - ligandCharge;
  } else {
    charge = 0;
    oxidation = -ligandCharge;
    notes.push(t("Yük verilmediği için kompleks nötr kabul edildi.", "No charge given: the complex was taken as neutral."));
  }
  if (input.counterIons.length && charge + counterCharge !== 0) {
    notes.push(t(`Karşı iyonlar kompleksin yükünü (${charge}) dengelemiyor.`, `The counter-ions do not balance the complex's charge (${charge}).`));
  }

  const instances = input.ligands.flatMap(({ ligand, count }) => Array.from({ length: count }, () => ligand));
  const cn = instances.reduce((sum, ligand) => sum + ligand.donors.length, 0);
  const group = dGroup(input.metal);
  const d = group !== null ? group - oxidation : null;
  const f = fElectrons(input.metal, oxidation);
  if (d !== null && (d < 0 || d > 10)) throw new ComplexError(`${input.metal}(${roman(oxidation)}) için d-elektron sayısı ${d} çıkıyor; yükseltgenme basamağını kontrol edin.`);
  const field = cn ? instances.reduce((sum, ligand) => sum + ligand.field * ligand.donors.length, 0) / cn : 0;
  const ringSites = (ligand: LigandDef) => ligand.pi && ligand.pattern === "mono" && (ligand.hapto ?? 0) >= 4;
  const sigmaSites = instances.filter((ligand) => !ringSites(ligand)).reduce((n, ligand) => n + ligand.donors.length, 0);
  let geometry = chooseGeometry(input, instances, cn, d, field);
  if (input.geometry && input.geometry !== geometry && geometrySites(input.geometry, sigmaSites).length === cn) geometry = input.geometry;
  const legs = geometry === "piano_stool" || geometry === "bent_metallocene" ? sigmaSites : 3;
  const sites = geometrySites(geometry, legs);
  if (sites.length !== cn) throw new ComplexError(`${GEOMETRY_NAMES[geometry].tr} geometride ${sites.length} konum var, ligandlar ${cn} konum istiyor.`);

  // Where each ligand goes: every arrangement, grouped into stereoisomers by symmetry.
  let placement: Placed[];
  let isomers: ComplexIsomer[] = [];
  let group3d: PointGroup | null = null;
  const ops = geometry === "sandwich" || geometry === "linear" ? [] : siteOperations(sites);
  if (geometry === "sandwich") {
    placement = instances.map((ligand, i) => ({ ligand, sites: [i] }));
    const ids = instances.map((ligand) => ligand.id);
    group3d = ids.every((id) => id === ids[0]) ? { Cp: { letter: "D", order: "5", suffix: "h" }, "Cp*": { letter: "D", order: "5", suffix: "d" }, C6H6: { letter: "D", order: "6", suffix: "h" }, C8H8: { letter: "D", order: "8", suffix: "h" }, C7H7: { letter: "D", order: "7", suffix: "h" }, C4H4: { letter: "D", order: "4", suffix: "h" } }[ids[0]] ?? null : null;
  } else if (geometry === "piano_stool" || geometry === "bent_metallocene") {
    const ringLigands = instances.filter(ringSites);
    const rest = instances.filter((ligand) => !ringSites(ligand));
    if (rest.some((ligand) => ligand.donors.length !== 1)) throw new ComplexError("Yarım sandviç ve bükük metalosen yapılarda yalnızca tek dişli ligandlar çizilebiliyor.");
    placement = [...ringLigands.map((ligand, i) => ({ ligand, sites: [i] })), ...rest.map((ligand, i) => ({ ligand, sites: [i + ringLigands.length] }))];
    if (geometry === "bent_metallocene" && rest.length === 2 && rest[0].id === rest[1].id && ringLigands[0].id === ringLigands[1].id) group3d = { letter: "C", order: "2", suffix: "v" };
    if (geometry === "piano_stool" && rest.length === 3 && rest.every((ligand) => ligand.id === rest[0].id)) group3d = { letter: "C", order: "3", suffix: "v" };
  } else {
    const axialOnly = axialSites(geometry);
    const oxoCount = instances.filter((ligand) => ligand.id === "oxo").length;
    const all = arrangements(sites, instances, geometry).filter(
      (arrangement) =>
        !(oxoCount === 2 && axialOnly.length === 2 && (geometry === "hexagonal_bipyramidal" || geometry === "pentagonal_bipyramidal")) ||
        arrangement.filter((placed) => placed.ligand.id === "oxo").every((placed) => axialOnly.includes(placed.sites[0]))
    );
    if (all.length === 0) throw new ComplexError("Ligandlar bu geometriye yerleştirilemiyor (çok dişli ligandlar komşu konumlara sığmıyor).");
    const byStereo = new Map<string, Placed[]>();
    for (const arrangement of all) {
      const key = canonical(arrangement, ops);
      if (!byStereo.has(key)) byStereo.set(key, arrangement);
    }
    const geometric = new Map<string, { arrangement: Placed[]; chiral: boolean }>();
    for (const [key, arrangement] of byStereo) {
      const mirror = mirrorCanonical(arrangement, ops);
      const id = key < mirror ? key : mirror;
      if (!geometric.has(id)) geometric.set(id, { arrangement, chiral: mirror !== key });
    }
    const axial = axialSites(geometry);
    const found = [...geometric.values()].map((entry) => ({
      ...entry,
      label: labelFor(entry.arrangement, sites, geometry, language),
      symmetry: stabiliser(entry.arrangement, ops).length,
      oxoOnAxis: entry.arrangement.filter((placed) => (placed.ligand.id === "oxo" || placed.ligand.id === "nitrido") && placed.sites.some((s) => axial.includes(s))).length,
      tbpPreference:
        geometry === "trigonal_bipyramidal"
          ? entry.arrangement.filter((placed) => placed.ligand.pi && !placed.sites.some((s) => axial.includes(s))).length * 10 +
            entry.arrangement.filter((placed) => placed.ligand.donors[0] === "P" && placed.sites.some((s) => axial.includes(s))).length * 5
          : 0,
    }));
    const wanted = input.isomer?.toLowerCase();
    const matching = wanted ? found.filter((c) => c.label.split(/[,/] ?/).includes(wanted)) : [];
    if (wanted && matching.length === 0 && found.length > 1) {
      notes.push(t(`"${input.isomer}" izomeri bu bileşimde yok; en yaygın düzen çizildi.`, `No "${input.isomer}" isomer exists for this composition; the usual arrangement was drawn.`));
    }
    const pool = matching.length ? matching : found;
    const chosen = pool.reduce((best, c) => {
      const score = (x: typeof c) => x.oxoOnAxis * 100 + x.tbpPreference + x.symmetry;
      return score(c) > score(best) ? c : best;
    });
    placement = chosen.arrangement;
    const counts = new Map<string, number>();
    isomers = found.map((c, i) => {
      let label =
        c.label ||
        (found.length === 1
          ? c.chiral
            ? t("Δ ve Λ (optik izomer çifti)", "Δ and Λ (a pair of enantiomers)")
            : t("tek düzen (stereoizomeri yok)", "one arrangement (no stereoisomers)")
          : t(`düzen ${i + 1}`, `arrangement ${i + 1}`));
      const seen = (counts.get(label) ?? 0) + 1;
      counts.set(label, seen);
      if (seen > 1) label = `${label} (${seen})`;
      return { label, chiral: c.chiral, chosen: c === chosen };
    });
    const kept = stabiliser(placement, ops);
    if (kept.length) group3d = pointGroup(kept.map((op) => op.matrix));
    // EDTA's arms are linked in a way the site labels cannot show: its complex is always C2 and chiral.
    if (instances.some((ligand) => ligand.pattern === "edta")) {
      group3d = { letter: "C", order: "2", suffix: "" };
      isomers = [{ label: t("Δ ve Λ (optik izomer çifti)", "Δ and Λ (a pair of enantiomers)"), chiral: true, chosen: true }];
    }
  }

  // The electrons in the ligand field.
  const oxoApex = geometry === "square_pyramidal" && placement.some((placed) => (placed.ligand.id === "oxo" || placed.ligand.id === "nitrido") && placed.sites.includes(0));
  // A half-sandwich with an η⁴ diene is five-coordinate at heart; with η⁵/η⁶ it is pseudo-octahedral.
  const dieneStool = geometry === "piano_stool" && instances.some((ligand) => ligand.pi && ligand.hapto === 4);
  const levels = oxoApex ? OXO_SQUARE_PYRAMID : dieneStool ? LEVELS.square_pyramidal : LEVELS[geometry];
  let spin: "high" | "low" | null = null;
  let occupancy: number[][] = [];
  if (d !== null) {
    const strong = field >= 2.5;
    let lowSpin: boolean;
    if (geometry === "tetrahedral") lowSpin = false;
    else if (["square_planar", "sandwich", "piano_stool", "bent_metallocene"].includes(geometry)) lowSpin = true;
    else if (geometry === "octahedral") {
      const hasFluoride = instances.some((ligand) => ligand.id === "F");
      // Six-coordinate porphyrins with N, C or O₂ on both axial sites are low spin (oxy-, carbonmonoxy-haem).
      const haem = instances.some((ligand) => ligand.pattern === "ring4" && ligand.id !== "cyclam" && ligand.id !== "salen") && !instances.some((ligand) => ["H2O", "F", "Cl", "Br", "I", "OH"].includes(ligand.id));
      lowSpin = isHeavy(input.metal) || strong || haem || (input.metal === "Co" && oxidation === 3 && !hasFluoride);
    } else lowSpin = strong || isHeavy(input.metal);
    occupancy = fill(levels, d, lowSpin);
    const other = fill(levels, d, !lowSpin);
    const count = (o: number[][]) => o.flat().filter((e) => e === 1).length;
    if (count(other) !== count(occupancy)) spin = lowSpin ? "low" : "high";
  }
  let unpaired = occupancy.flat().filter((e) => e === 1).length;
  let magneticMoment = Math.sqrt(unpaired * (unpaired + 2));
  let momentBasis = "spin-only";
  let configuration: string;
  if (d !== null) {
    configuration = levels.map((level, i) => `${level.label.split(" ")[0]}${superscript(String(occupancy[i].reduce((a, b) => a + b, 0)))}`).join(" ");
  } else if (f !== null) {
    unpaired = f <= 7 ? f : 14 - f;
    configuration = `${atomicNumber(input.metal) >= 90 ? "5f" : "4f"}${superscript(String(f))}`;
    if (atomicNumber(input.metal) <= 71) {
      const moment = lanthanideMoment(f);
      magneticMoment = moment.mu;
      momentBasis = moment.term;
      if (f === 6 || f === 5) notes.push(t("Sm³⁺ ve Eu³⁺ için uyarılmış J düzeyleri yakın olduğundan ölçülen moment hesaplanandan farklıdır.", "For Sm³⁺ and Eu³⁺ low-lying J levels make the measured moment differ."));
    } else {
      magneticMoment = Math.sqrt(unpaired * (unpaired + 2));
    }
  } else {
    configuration = t("d/f elektronu yok (ana grup metali)", "no d or f electrons (main-group metal)");
  }
  let cfse: string | null = null;
  if (d !== null && (geometry === "octahedral" || geometry === "tetrahedral")) {
    const lower = occupancy[0].reduce((a, b) => a + b, 0);
    const upper = occupancy[1].reduce((a, b) => a + b, 0);
    const value = geometry === "octahedral" ? -0.4 * lower + 0.6 * upper : -0.6 * lower + 0.4 * upper;
    const pairs = occupancy.flat().filter((e) => e === 2).length;
    const extra = pairs - Math.max(0, d - 5);
    const delta = geometry === "octahedral" ? "Δo" : "Δt";
    const number = Math.abs(value) < 1e-9 ? "0" : `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(1).replace(".", language === "en" ? "." : ",")}`;
    cfse = `${number} ${delta}${extra > 0 ? ` + ${extra}P` : ""}`;
  }

  // Valence-bond hybridisation.
  const hybridisation = (() => {
    if (f !== null && cn >= 7) return t("f/d orbitalleri katılır (VB tanımı yetersiz)", "f/d orbitals take part (VB is a poor fit)");
    switch (geometry) {
      case "linear":
        return "sp";
      case "trigonal_planar":
        return "sp²";
      case "tetrahedral":
        return "sp³";
      case "square_planar":
        return "dsp²";
      case "trigonal_bipyramidal":
        return "dsp³ (sp³d)";
      case "square_pyramidal":
        return "sp³d";
      case "octahedral": {
        if (d === null) return "sp³d²";
        const emptyInner = occupancy[1]?.every((e) => e === 0) && d <= 6;
        return emptyInner ? t("d²sp³ (iç orbital)", "d²sp³ (inner orbital)") : t("sp³d² (dış orbital)", "sp³d² (outer orbital)");
      }
      case "trigonal_prismatic":
        return "d⁴sp";
      case "pentagonal_bipyramidal":
        return "sp³d³";
      case "square_antiprismatic":
        return "d⁴sp³";
      case "tricapped_trigonal_prismatic":
        return "d⁵sp³";
      default:
        return "—";
    }
  })();

  const valenceElectrons = (d ?? 0) + instances.reduce((sum, ligand) => sum + ligand.electrons, 0);
  if (geometry === "octahedral" && d !== null && ((spin === "high" && d === 4) || (spin === "low" && d === 7) || d === 9)) {
    notes.push(t("eg düzeyinde tek sayıda elektron var: Jahn–Teller bozulması (eksen boyunca uzama) beklenir; çizim ideal oktahedrondur.", "An odd number of e_g electrons: expect a Jahn–Teller distortion; the drawing is the ideal octahedron."));
  }

  // The formula, the mass and the names.
  const counts = new Map<string, number>([[input.metal, 1]]);
  const addAtoms = (atoms: Record<string, number>, times: number) => {
    for (const [symbol, n] of Object.entries(atoms)) counts.set(symbol, (counts.get(symbol) ?? 0) + n * times);
  };
  input.ligands.forEach(({ ligand, count }) => addAtoms(ligand.atoms, count));
  input.counterIons.forEach(({ ion, count }) => addAtoms(ion.atoms, count));
  const saltCharge = input.counterIons.length ? charge + counterCharge : charge;
  const parsed = parseFormula(`${hillText(counts)}${saltCharge ? `^${Math.abs(saltCharge)}${saltCharge > 0 ? "+" : "-"}` : ""}`);
  const ion = ionFormula(input.metal, input.ligands, charge);
  const plainIon = ion.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+$/, "");
  const ionText = (c: CounterIon, count: number) => {
    const text = c.formula.replace(/(\d+)/g, (x) => subscript(x));
    return count > 1 ? (c.formula.length > 2 ? `(${text})${subscript(String(count))}` : `${text}${subscript(String(count))}`) : text;
  };
  const cations = input.counterIons.filter(({ ion: c }) => c.charge > 0).map(({ ion: c, count }) => ionText(c, count));
  const anions = input.counterIons.filter(({ ion: c }) => c.charge < 0).map(({ ion: c, count }) => ionText(c, count));
  const compound = input.counterIons.length ? `${cations.join("")}${plainIon}${anions.join("")}` : ion;
  // A cis-/trans-/fac-/mer- prefix only where there is a choice to name.
  const chosenIsomer = isomers.length > 1 ? (isomers.find((i) => i.chosen)?.label.split(/[,(] ?/)[0].trim() ?? "") : "";

  // The 3D model: the metal at the origin, each ligand built on its sites.
  const frame: Frame = {
    metal: input.metal,
    reach: (el, adjust = -0.08) => covalentRadius(input.metal) + covalentRadius(el) + adjust,
  };
  const atoms: ModelAtom[] = [{ el: input.metal, p: [0, 0, 0] }];
  const bonds: ModelBond[] = [];
  const order = [...placement].sort((a, b) => b.ligand.donors.length - a.ligand.donors.length);
  for (const placed of order) {
    const fragment = new Fragment();
    placed.ligand.build(fragment, placed.sites.map((s) => sites[s]), frame);
    if (placed.ligand.donors.length === 1 && fragment.atoms.length > 1 && atoms.length > 1) {
      const axis = sites[placed.sites[0]];
      const clash = (points: Vec[]) => {
        let penalty = 0;
        points.forEach((p, i) => {
          const hydrogen = fragment.atoms[i].el === "H";
          for (let j = 1; j < atoms.length; j++) {
            const both = hydrogen && atoms[j].el === "H";
            const limit = both ? 2.1 : hydrogen || atoms[j].el === "H" ? 2.5 : 3.0;
            const dist = distance(p, atoms[j].p);
            if (dist < limit) penalty += (limit - dist) ** 2;
          }
        });
        return penalty;
      };
      let best = { angle: 0, penalty: clash(fragment.atoms.map((a) => a.p)) };
      for (let k = 1; k < 24 && best.penalty > 0; k++) {
        const angle = (k * 15 * Math.PI) / 180;
        const penalty = clash(fragment.atoms.map((a) => rotate(a.p, axis, angle)));
        if (penalty < best.penalty) best = { angle, penalty };
      }
      if (best.angle) fragment.atoms = fragment.atoms.map((a) => ({ ...a, p: rotate(a.p, axis, best.angle) }));
    }
    const offset = atoms.length;
    atoms.push(...fragment.atoms);
    bonds.push(...fragment.bonds.map((bond) => ({ ...bond, a: bond.a + offset, b: bond.b + offset })));
    for (const link of fragment.links) bonds.push({ a: 0, b: link.atom + offset, order: link.order, kind: link.kind });
  }

  const ringLigands = instances.filter(ringSites);
  const coordinationText =
    ringLigands.length === 0
      ? String(cn)
      : geometry === "sandwich"
        ? t(`${ringLigands.length} halka (${ringLigands.map((l) => `η${superscript(String(l.hapto))}`).join(" + ")})`, `${ringLigands.length} rings (${ringLigands.map((l) => `η${superscript(String(l.hapto))}`).join(" + ")})`)
        : t(`${ringLigands.map((l) => `η${superscript(String(l.hapto))}`).join(" + ")} halka + ${sigmaSites} ligand`, `${ringLigands.map((l) => `η${superscript(String(l.hapto))}`).join(" + ")} ring + ${sigmaSites} ligands`);

  return {
    metal: input.metal,
    metalName: METALS[input.metal]?.[language] ?? input.metal,
    centres: 1,
    oxidationState: oxidation,
    charge,
    ion,
    compound,
    hill: hillText(counts),
    molarMass: molarMass(parsed),
    exactMass: monoisotopicMass(parsed),
    composition: composition(parsed, language),
    coordinationNumber: cn,
    coordinationText,
    geometry,
    geometryName: GEOMETRY_NAMES[geometry][language],
    angles: GEOMETRY_NAMES[geometry].angles[language],
    hybridisation,
    dElectrons: d,
    fElectrons: f,
    configuration,
    spin,
    unpaired,
    magneticMoment,
    momentBasis,
    cfse,
    valenceElectrons,
    isomers,
    pointGroup: group3d,
    nameEn: complexName(input, oxidation, charge, chosenIsomer, "en"),
    nameTr: complexName(input, oxidation, charge, chosenIsomer, "tr"),
    ligands: input.ligands.map(({ ligand, count }) => ({
      id: ligand.id,
      count,
      name: language === "en" ? ligand.en : ligand.tr,
      charge: ligand.charge,
      denticity: ligand.pi ? (ligand.hapto ?? 1) : ligand.donors.length,
      donor: [...new Set(ligand.donors.map((kind) => (kind === "π" ? "π" : kind.replace(/[a-z]+$/, ""))))].join(","),
    })),
    notes: isFBlock(input.metal) ? [...notes, t("f-blok iyonlarında bağ çoğunlukla iyoniktir; geometri ligandların sterik düzeninden gelir.", "f-block bonding is mostly ionic; the geometry follows the ligands' packing.")] : notes,
    model: { atoms: relaxModel(atoms, bonds), bonds },
  };
}

/** Atomic weight lookup for callers that only have a symbol. */
export function atomicWeight(symbol: string): number {
  return ATOMIC_WEIGHTS[symbol] ?? 0;
}
