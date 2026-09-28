// Chem+ app: VSEPR for one-centre molecules and ions (AXₙEₘ) - SF₄, XeF₄, ClF₃, PCl₅, SO₄²⁻, NH₄⁺,
// H₂O, CO₂… The lone pairs on the central atom come from counting electrons, not from memory:
//
//   E = (valence electrons of the centre − electrons its bonds take − charge) / 2
//
// (a hydrogen or halogen takes 1, an O or S 2, an N 3). Steric number, electron-pair and molecular
// geometry, ideal angles, hybridisation, polarity, the idealised point group and a 3D model with
// the lone pairs drawn follow from it.

import { atomicNumber } from "./elements";
import { composition, molarMass, monoisotopicMass, parseFormula, type CompositionRow } from "./formula";
import { chargeLabel, subscript, superscript, type Language } from "./format";
import { arrangementPointGroup, type PointGroup } from "./complexes";
import { covalentRadius, scale, unit, type Model3D, type ModelBond, type Vec } from "./model3d";

export class VseprError extends Error {}

const VALENCE: Record<string, number> = {
  H: 1, He: 2, Li: 1, Be: 2, B: 3, C: 4, N: 5, O: 6, F: 7, Ne: 8, Na: 1, Mg: 2, Al: 3, Si: 4, P: 5, S: 6,
  Cl: 7, Ar: 8, K: 1, Ca: 2, Ga: 3, Ge: 4, As: 5, Se: 6, Br: 7, Kr: 8, Rb: 1, Sr: 2, In: 3, Sn: 4, Sb: 5,
  Te: 6, I: 7, Xe: 8, Tl: 3, Pb: 4, Bi: 5, Po: 6, At: 7, Rn: 8,
};

/** Electrons of the central atom a terminal atom takes into its bond. */
const TAKES: Record<string, number> = { H: 1, F: 1, Cl: 1, Br: 1, I: 1, O: 2, S: 2, Se: 2, N: 3, C: 4 };

const deg = Math.PI / 180;
const ring = (n: number, from = 0): Vec[] => Array.from({ length: n }, (_, i) => [Math.cos(from + (i * 2 * Math.PI) / n), Math.sin(from + (i * 2 * Math.PI) / n), 0]);

/** Electron-pair sites; for 5 and 7 the axial ones come first. */
function domains(n: number): Vec[] {
  switch (n) {
    case 1:
      return [[0, 0, 1]];
    case 2:
      return [[0, 0, 1], [0, 0, -1]];
    case 3:
      return ring(3, 90 * deg);
    case 4:
      return ([[1, 1, 1], [-1, -1, 1], [1, -1, -1], [-1, 1, -1]] as Vec[]).map(unit);
    case 5:
      return [[0, 0, 1], [0, 0, -1], ...ring(3)];
    case 6:
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 7:
      return [[0, 0, 1], [0, 0, -1], ...ring(5)];
    default:
      throw new VseprError(`Sterik sayı ${n}: yalnızca 1–7 arası destekleniyor.`);
  }
}

/** Which sites the lone pairs take: equatorial in a trigonal bipyramid, opposite each other in an octahedron. */
function lonePairSites(n: number, pairs: number): number[] {
  if (pairs === 0) return [];
  if (n === 5) return [2, 3, 4, 0, 1].slice(0, pairs);
  if (n === 6) return [4, 5, 0, 1, 2, 3].slice(0, pairs);
  if (n === 7) return [0, 1, 2, 3, 4, 5, 6].slice(0, pairs);
  return Array.from({ length: pairs }, (_, i) => n - 1 - i);
}

const SHAPES: Record<string, { tr: string; en: string; angles: string }> = {
  "1,0": { tr: "doğrusal (iki atomlu)", en: "linear (diatomic)", angles: "—" },
  "2,0": { tr: "doğrusal", en: "linear", angles: "180°" },
  "3,0": { tr: "üçgen düzlem", en: "trigonal planar", angles: "120°" },
  "3,1": { tr: "açısal (kırık doğru)", en: "bent", angles: "< 120°" },
  "4,0": { tr: "düzgün dörtyüzlü (tetrahedral)", en: "tetrahedral", angles: "109,5°" },
  "4,1": { tr: "üçgen piramit", en: "trigonal pyramidal", angles: "< 109,5° (≈107°)" },
  "4,2": { tr: "açısal (kırık doğru)", en: "bent", angles: "< 109,5° (≈104,5°)" },
  "4,3": { tr: "doğrusal", en: "linear", angles: "—" },
  "5,0": { tr: "üçgen çift piramit", en: "trigonal bipyramidal", angles: "90°, 120°, 180°" },
  "5,1": { tr: "tahterevalli", en: "seesaw", angles: "< 90°, < 120°" },
  "5,2": { tr: "T şekli", en: "T-shaped", angles: "< 90° (≈87,5°)" },
  "5,3": { tr: "doğrusal", en: "linear", angles: "180°" },
  "6,0": { tr: "oktahedral (düzgün sekizyüzlü)", en: "octahedral", angles: "90°, 180°" },
  "6,1": { tr: "kare piramit", en: "square pyramidal", angles: "< 90°" },
  "6,2": { tr: "kare düzlem", en: "square planar", angles: "90°, 180°" },
  "6,3": { tr: "T şekli", en: "T-shaped", angles: "90°" },
  "6,4": { tr: "doğrusal", en: "linear", angles: "180°" },
  "7,0": { tr: "beşgen çift piramit", en: "pentagonal bipyramidal", angles: "72°, 90°, 180°" },
  "7,1": { tr: "bozulmuş oktahedral (beşgen piramit)", en: "distorted octahedral (pentagonal pyramidal)", angles: "≈72°, ≈90°" },
  "7,2": { tr: "beşgen düzlem", en: "pentagonal planar", angles: "72°" },
};

const PAIR_GEOMETRY: Record<number, { tr: string; en: string }> = {
  1: { tr: "—", en: "—" },
  2: { tr: "doğrusal", en: "linear" },
  3: { tr: "üçgen düzlem", en: "trigonal planar" },
  4: { tr: "düzgün dörtyüzlü", en: "tetrahedral" },
  5: { tr: "üçgen çift piramit", en: "trigonal bipyramidal" },
  6: { tr: "oktahedral", en: "octahedral" },
  7: { tr: "beşgen çift piramit", en: "pentagonal bipyramidal" },
};

const HYBRID: Record<number, string> = { 1: "—", 2: "sp", 3: "sp²", 4: "sp³", 5: "sp³d", 6: "sp³d²", 7: "sp³d³" };

export interface VseprInput {
  central: string;
  terminal: { atom: string; count: number }[];
  charge: number;
}

export interface VseprResult {
  formula: string;
  hill: string;
  molarMass: number;
  exactMass: number | null;
  composition: CompositionRow[];
  axe: string;
  stericNumber: number;
  bonded: number;
  lonePairs: number;
  radical: boolean;
  pairGeometry: string;
  shape: string;
  angles: string;
  hybridisation: string;
  polar: boolean;
  pointGroup: PointGroup | null;
  bonds: string;
  model: Model3D;
  notes: string[];
}

/** "SF4" → centre S, four F; "H2O" → centre O. The centre is the one atom that is not H or a halogen. */
export function splitFormula(text: string): VseprInput {
  const parsed = parseFormula(text);
  const counts = [...parsed.counts.entries()];
  // One element only (O₃, I₃⁻): one of them is the centre.
  if (counts.length === 1) {
    const [symbol, n] = counts[0];
    return { central: symbol, terminal: n > 1 ? [{ atom: symbol, count: n - 1 }] : [], charge: parsed.charge };
  }
  const outer = new Set(["H", "F", "Cl", "Br", "I"]);
  const singles = counts.filter(([, n]) => n === 1);
  const candidates = singles.filter(([symbol]) => !outer.has(symbol));
  const central =
    candidates.sort((a, b) => (VALENCE[a[0]] ?? 0) - (VALENCE[b[0]] ?? 0) || atomicNumber(b[0]) - atomicNumber(a[0]))[0]?.[0] ??
    // All halogens (ClF3, IF7, I3⁻): the heavier one is in the middle.
    singles.sort((a, b) => atomicNumber(b[0]) - atomicNumber(a[0]))[0]?.[0] ??
    counts[0][0];
  const terminal = counts
    .map(([atom, n]) => ({ atom, count: atom === central ? n - 1 : n }))
    .filter((entry) => entry.count > 0);
  return { central, terminal, charge: parsed.charge };
}

export function analyseVsepr(input: VseprInput, language: Language): VseprResult {
  const t = (tr: string, en: string) => (language === "en" ? en : tr);
  const notes: string[] = [];
  const valence = VALENCE[input.central];
  if (valence === undefined) throw new VseprError(`${input.central}: VSEPR ana grup merkez atomları içindir (geçiş metali kompleksleri için "complex").`);
  const terminals = input.terminal.flatMap(({ atom, count }) => Array.from({ length: count }, () => atom));
  if (terminals.length === 0) throw new VseprError("Uç atom yok.");
  for (const atom of terminals) if (TAKES[atom] === undefined) throw new VseprError(`${atom} uç atom olarak desteklenmiyor.`);
  const left = valence - terminals.reduce((sum, atom) => sum + TAKES[atom], 0) - input.charge;
  if (left < 0) throw new VseprError(`${input.central} bu kadar bağ yapamaz: elektron sayısı eksiye düşüyor (${left}).`);
  const radical = left % 2 === 1;
  const pairs = Math.ceil(left / 2);
  const steric = terminals.length + pairs;
  if (radical) notes.push(t("Merkez atomda tek elektron var (radikal); tek elektron yarım bir çift gibi yer tutar.", "The centre has an unpaired electron (a radical); it takes room like half a pair."));
  if (steric > 7) throw new VseprError(`Sterik sayı ${steric}: 7'den büyükler desteklenmiyor.`);

  const sites = domains(steric);
  const lone = lonePairSites(steric, pairs);
  const free = sites.map((_, i) => i).filter((i) => !lone.includes(i));
  // Heavier terminal atoms first on the free sites, so mixed molecules look tidy.
  const order = [...terminals].sort((a, b) => atomicNumber(b) - atomicNumber(a));

  // Bond orders: a terminal takes what it needs (O double, N triple), within the octet for period 2.
  const orders = order.map((atom) => TAKES[atom]);
  const period2 = atomicNumber(input.central) <= 10;
  let total = orders.reduce((a, b) => a + b, 0);
  if (period2) {
    const cap = 4 - pairs;
    for (let i = orders.length - 1; i >= 0 && total > cap; i--) {
      while (orders[i] > 1 && total > cap) {
        orders[i]--;
        total--;
      }
    }
  } else if (input.charge < 0) {
    let reduce = -input.charge;
    for (let i = orders.length - 1; i >= 0 && reduce > 0; i--) {
      if (orders[i] === 2) {
        orders[i] = 1;
        reduce--;
      }
    }
  }

  const atoms = [{ el: input.central, p: [0, 0, 0] as Vec }];
  const bonds: ModelBond[] = [];
  order.forEach((atom, i) => {
    const bondOrder = Math.min(3, orders[i]) as 1 | 2 | 3;
    const reach = covalentRadius(input.central) + covalentRadius(atom) - (bondOrder === 3 ? 0.2 : bondOrder === 2 ? 0.12 : 0);
    atoms.push({ el: atom, p: scale(sites[free[i]], reach) });
    bonds.push({ a: 0, b: atoms.length - 1, order: bondOrder });
  });

  const shapeKey = `${steric},${pairs}`;
  const shape = SHAPES[shapeKey] ?? { tr: "—", en: "—", angles: "—" };
  const identical = new Set(terminals).size === 1;
  const symmetricShape = pairs === 0 || shapeKey === "5,3" || shapeKey === "6,2" || shapeKey === "6,4" || shapeKey === "7,2";
  const polar = !(identical && symmetricShape) && !(terminals.length === 1 && terminals[0] === input.central);

  const placed = [
    ...order.map((atom, i) => ({ ligand: atom, sites: [free[i]] })),
    ...lone.map((site) => ({ ligand: "LP", sites: [site] })),
  ];
  let group: PointGroup | null = null;
  if (shape.en === "linear") group = identical && (steric === 2 || shapeKey === "5,3" || shapeKey === "6,4") ? { letter: "D", order: "∞", suffix: "h" } : { letter: "C", order: "∞", suffix: "v" };
  else if (steric >= 3) group = arrangementPointGroup(sites, placed);

  // Formula as chemists write it: H first for hydrides of groups 16–17 (H₂O, H₂S), else the centre first.
  const group16or17 = [8, 16, 34, 52, 9, 17, 35, 53].includes(atomicNumber(input.central));
  const parts = input.terminal.map(({ atom, count }) => `${atom}${count > 1 ? count : ""}`);
  const hydrogenFirst = group16or17 && input.terminal.length === 1 && input.terminal[0].atom === "H";
  const hydrogen = input.terminal.find(({ atom }) => atom === "H");
  const others = input.terminal.filter(({ atom }) => atom !== "H").map(({ atom, count }) => `${atom}${count > 1 ? count : ""}`);
  const homonuclear = input.terminal.length === 1 && input.terminal[0].atom === input.central;
  const plainFormula = homonuclear
    ? `${input.central}${input.terminal[0].count + 1}`
    : hydrogenFirst
      ? `${parts.join("")}${input.central}`
      : hydrogen && others.length
        ? // HCN, H₂CO: the hydrogens first, then the centre and the rest.
          `H${hydrogen.count > 1 ? hydrogen.count : ""}${input.central}${others.join("")}`
        : `${input.central}${parts.join("")}`;
  const parsed = parseFormula(`${plainFormula}${input.charge ? `^${Math.abs(input.charge)}${input.charge > 0 ? "+" : "-"}` : ""}`);
  const formula = plainFormula.replace(/(\d+)/g, (d) => subscript(d)) + superscript(chargeLabel(input.charge));

  const doubles = orders.filter((o) => o === 2).length;
  const triples = orders.filter((o) => o === 3).length;
  const singles = orders.length - doubles - triples;
  const bondsText = [
    ...(singles ? [`${singles} ${t("tekli", "single")}`] : []),
    ...(doubles ? [`${doubles} ${t("ikili", "double")}`] : []),
    ...(triples ? [`${triples} ${t("üçlü", "triple")}`] : []),
  ].join(", ");
  if (doubles && orders.some((o) => o === 1) && order.every((atom) => atom === order[0])) {
    notes.push(t("Aynı atomlara giden tekli ve ikili bağlar rezonansla eşdeğerdir; gerçekte bütün bağlar aynı uzunluktadır.", "The single and double bonds to identical atoms are equivalent by resonance; in reality all have the same length."));
  }

  const axe = `AX${terminals.length > 1 ? subscript(String(terminals.length)) : ""}${pairs ? `E${pairs > 1 ? subscript(String(pairs)) : ""}` : ""}`;
  return {
    formula,
    hill: plainFormula,
    molarMass: molarMass(parsed),
    exactMass: monoisotopicMass(parsed),
    composition: composition(parsed, language),
    axe,
    stericNumber: steric,
    bonded: terminals.length,
    lonePairs: left / 2,
    radical,
    pairGeometry: PAIR_GEOMETRY[steric]?.[language] ?? "—",
    shape: shape[language],
    angles: language === "en" ? shape.angles.replace(/(\d),(\d)/g, "$1.$2") : shape.angles,
    hybridisation: HYBRID[steric] ?? "—",
    polar,
    pointGroup: group,
    bonds: bondsText,
    model: { atoms, bonds, lonePairs: lone.map((site) => ({ atom: 0, dir: sites[site] })) },
    notes,
  };
}
