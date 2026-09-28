// Chem+ app: compounds with more than one metal - the classic dimers and clusters of inorganic and
// organometallic chemistry, each built in 3D from its metals, the ligands on each metal (made by
// the same builders as mononuclear complexes, ligands.ts) and its bridges (μ-CO, μ-Cl, μ-H,
// bridging acetates), with the facts a student is asked about: oxidation state, d count,
// metal–metal bond order, 18-electron count, magnetism and point group.

import { composition, molarMass, monoisotopicMass, parseFormula } from "./formula";
import { subscript, superscript, chargeLabel, type Language } from "./format";
import { add, rotate, scale, unit, type Model3D, type ModelBond, type Vec } from "./model3d";
import { covalentRadius } from "./model3d";
import { findLigand, normalName } from "./ligands";
import { METALS } from "./metals";
import { cone, DEG, Fragment, methyl, relaxModel, type Frame } from "./structureKit";
import { hillText, plainFormula, roman, type ComplexResult, type PointGroup } from "./complexes";

type Words = { tr: string; en: string };

interface Built {
  f: Fragment;
  /** Indices of the metal atoms in the fragment. */
  metals: number[];
}

interface ClusterSpec {
  id: string;
  /** Formulas and names it answers to. */
  aliases: string[];
  display: string;
  name: Words;
  charge: number;
  metal: string;
  oxidation: number;
  d: number | null;
  perMetal: Words;
  geometry: Words;
  metalMetal: Words;
  valence: number;
  unpaired: number;
  pointGroup: PointGroup;
  ligands: { id: string; count: number; note: Words }[];
  notes?: Words[];
  build: () => Built;
}

const pg = (letter: string, order: string, suffix = ""): PointGroup => ({ letter, order, suffix });
const polar = (theta: number, phi: number): Vec => [Math.sin(theta * DEG) * Math.cos(phi * DEG), Math.sin(theta * DEG) * Math.sin(phi * DEG), Math.cos(theta * DEG)];

/** A new cluster with its metals placed. */
function start(metals: { el: string; p: Vec }[]): Built {
  const f = new Fragment();
  return { f, metals: metals.map((m) => f.atom(m.el, m.p)) };
}

function frameAt(b: Built, metal: number): Frame {
  const el = b.f.atoms[b.metals[metal]].el;
  return { metal: el, at: b.f.p(b.metals[metal]), reach: (donor, adjust = -0.08) => covalentRadius(el) + covalentRadius(donor) + adjust };
}

/** A terminal ligand on one metal, along `dir`. */
function terminal(b: Built, metal: number, ligandId: string, dirs: Vec[]) {
  const ligand = findLigand(ligandId)!;
  const piece = new Fragment();
  ligand.build(piece, dirs.map(unit), frameAt(b, metal));
  const offset = b.f.add(piece);
  b.f.links = [];
  for (const link of piece.links) b.f.bonds.push({ a: b.metals[metal], b: link.atom + offset, order: link.order, kind: link.kind });
}

function metalBond(b: Built, i: number, j: number, order: ModelBond["order"]) {
  b.f.bonds.push({ a: b.metals[i], b: b.metals[j], order });
}

/** A one-atom bridge (μ-Cl, μ-H…) at `p`, bonded to the given metals. */
function muAtom(b: Built, el: string, p: Vec, metals: number[]): number {
  const i = b.f.atom(el, p);
  for (const m of metals) b.f.bonds.push({ a: b.metals[m], b: i, order: 1, kind: "coord" });
  return i;
}

/** A bridging carbonyl: C at `p`, O pointing along `out`. */
function muCO(b: Built, p: Vec, out: Vec, metals: number[]) {
  const c = muAtom(b, "C", p, metals);
  b.f.bond(c, b.f.atom("O", add(p, scale(unit(out), 1.18))), 2);
}

/** A carboxylate spanning two metals (paddlewheel): O on each metal, C between, CH₃ outward. */
function muAcetate(b: Built, o1: Vec, o2: Vec, out: Vec, metals: [number, number]) {
  const a = muAtom(b, "O", o1, [metals[0]]);
  const c2 = muAtom(b, "O", o2, [metals[1]]);
  const mid = scale(add(o1, o2), 0.5);
  const half = Math.hypot(o1[0] - o2[0], o1[1] - o2[1], o1[2] - o2[2]) / 2;
  const carbon = b.f.atom("C", add(mid, scale(unit(out), Math.sqrt(Math.max(0, 1.26 * 1.26 - half * half)))));
  b.f.bond(a, carbon, 1.5);
  b.f.bond(c2, carbon, 1.5);
  methyl(b.f, carbon, unit(out));
}

/** M₂(CO)₁₀: two square-pyramidal M(CO)₅ joined by an M–M bond, staggered (D4d). */
function decacarbonyl(el: string, mm: number): () => Built {
  return () => {
    const b = start([{ el, p: [0, 0, mm / 2] }, { el, p: [0, 0, -mm / 2] }]);
    metalBond(b, 0, 1, 1);
    terminal(b, 0, "CO", [[0, 0, 1]]);
    terminal(b, 1, "CO", [[0, 0, -1]]);
    for (let k = 0; k < 4; k++) {
      terminal(b, 0, "CO", [polar(92, k * 90)]);
      terminal(b, 1, "CO", [polar(88, 45 + k * 90)]);
    }
    return b;
  };
}

/** [M₂X₈]ⁿ⁻: eclipsed MX₄ squares on a quadruple bond (D4h). */
function octahalide(el: string, halide: string, mm: number): () => Built {
  return () => {
    const b = start([{ el, p: [0, 0, mm / 2] }, { el, p: [0, 0, -mm / 2] }]);
    metalBond(b, 0, 1, 4);
    for (let k = 0; k < 4; k++) {
      terminal(b, 0, halide, [polar(76, k * 90)]);
      terminal(b, 1, halide, [polar(104, k * 90)]);
    }
    return b;
  };
}

/** M₂(O₂CCH₃)₄(L)₂: the paddlewheel - four acetates bridging a metal–metal axis, L on the ends. */
function paddlewheel(el: string, mm: number, order: ModelBond["order"] | null, axial: string | null): () => Built {
  return () => {
    const b = start([{ el, p: [0, 0, mm / 2] }, { el, p: [0, 0, -mm / 2] }]);
    if (order) metalBond(b, 0, 1, order);
    const zO = 1.12;
    const reach = covalentRadius(el) + 0.66 - 0.08;
    const radial = Math.sqrt(Math.max(0.5, reach * reach - (mm / 2 - zO) ** 2));
    for (let k = 0; k < 4; k++) {
      const dir = polar(90, k * 90);
      muAcetate(b, add(scale(dir, radial), [0, 0, zO]), add(scale(dir, radial), [0, 0, -zO]), dir, [0, 1]);
    }
    if (axial) {
      terminal(b, 0, axial, [[0, 0, 1]]);
      terminal(b, 1, axial, [[0, 0, -1]]);
    }
    return b;
  };
}

/** M₂X₆ (Al₂Cl₆): two tetrahedra sharing an edge of two bridging halides (D2h). */
function edgeDimer(el: string, halide: string, bridge: number, half: number): () => Built {
  return () => {
    const b = start([{ el, p: [half, 0, 0] }, { el, p: [-half, 0, 0] }]);
    const y = Math.sqrt(Math.max(0.3, bridge * bridge - half * half));
    muAtom(b, halide, [0, y, 0], [0, 1]);
    muAtom(b, halide, [0, -y, 0], [0, 1]);
    for (const [m, sign] of [[0, 1], [1, -1]] as [number, number][]) {
      for (const z of [1, -1]) terminal(b, m, halide, [[sign * 0.55, 0, z * 0.83]]);
    }
    return b;
  };
}

/** M₃(CO)₁₂: a triangle of metals, two axial and two equatorial CO on each (D3h). */
function triangle(el: string, mm: number): () => Built {
  return () => {
    const r = mm / Math.sqrt(3);
    const b = start([90, 210, 330].map((phi) => ({ el, p: scale(polar(90, phi), r) })));
    metalBond(b, 0, 1, 1);
    metalBond(b, 1, 2, 1);
    metalBond(b, 2, 0, 1);
    [90, 210, 330].forEach((phi, m) => {
      terminal(b, m, "CO", [[0, 0, 1]]);
      terminal(b, m, "CO", [[0, 0, -1]]);
      const radialDir = polar(90, phi);
      for (const turn of [52, -52]) terminal(b, m, "CO", [rotate(radialDir, [0, 0, 1], turn * DEG)]);
    });
    return b;
  };
}

/** M₄(CO)₁₂: a tetrahedron of metals, three terminal CO on each (Td). */
function tetrahedron(el: string, mm: number): () => Built {
  return () => {
    const r = mm * 0.612;
    const corners = ([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as Vec[]).map(unit);
    const b = start(corners.map((c) => ({ el, p: scale(c, r) })));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) metalBond(b, i, j, 1);
    corners.forEach((c, m) => {
      // Three CO fanned out from the corner, between the three Ir–Ir edges.
      for (const p of cone([0, 0, 0], c, 3, 60 * DEG, 1, 60 * DEG, corners[(m + 1) % 4])) terminal(b, m, "CO", [p]);
    });
    return b;
  };
}

const LIBRARY: ClusterSpec[] = [
  ...(
    [
      ["Mn", 2.9, "dimanganese", "dimangan"],
      ["Tc", 3.03, "ditechnetium", "diteknesyum"],
      ["Re", 3.04, "dirhenium", "direnyum"],
    ] as const
  ).map(([el, mm, en, tr]): ClusterSpec => ({
    id: `${el}2(CO)10`,
    aliases: [`${el}2(CO)10`, `[${el}2(CO)10]`, `${en} decacarbonyl`, `${tr} dekakarbonil`, `decacarbonyl${en}`, `dekakarbonil${tr}`],
    display: `[${el}₂(CO)₁₀]`,
    name: { en: `decacarbonyl${en}(Mn–Mn)`.replace("Mn–Mn", `${el}–${el}`), tr: `dekakarbonil${tr}(${el}–${el})` },
    charge: 0,
    metal: el,
    oxidation: 0,
    d: 7,
    perMetal: { tr: `her ${el}: 5 CO + 1 ${el}–${el} bağı (oktahedral)`, en: `each ${el}: 5 CO + one ${el}–${el} bond (octahedral)` },
    geometry: { tr: "iki M(CO)₅ birimi, çapraz dizilim (staggered)", en: "two M(CO)₅ units, staggered" },
    metalMetal: { tr: `${el}–${el} tekli bağ (${mm.toFixed(2).replace(".", ",")} Å), köprü ligand yok`, en: `${el}–${el} single bond (${mm.toFixed(2)} Å), no bridging ligands` },
    valence: 18,
    unpaired: 0,
    pointGroup: pg("D", "4", "d"),
    ligands: [{ id: "CO", count: 10, note: { tr: "10 uç CO", en: "10 terminal CO" } }],
    build: decacarbonyl(el, mm),
  })),
  {
    id: "Co2(CO)8",
    aliases: ["Co2(CO)8", "[Co2(CO)8]", "dicobalt octacarbonyl", "dikobalt oktakarbonil", "octacarbonyldicobalt", "oktakarbonildikobalt"],
    display: "[Co₂(CO)₆(μ-CO)₂]",
    name: { en: "di-μ-carbonyl-bis(tricarbonylcobalt)(Co–Co)", tr: "di-μ-karbonil-bis(trikarbonilkobalt)(Co–Co)" },
    charge: 0,
    metal: "Co",
    oxidation: 0,
    d: 9,
    perMetal: { tr: "her Co: 3 uç CO + 2 köprü CO + Co–Co bağı", en: "each Co: 3 terminal CO + 2 bridging CO + the Co–Co bond" },
    geometry: { tr: "köprülü izomer (katı hâl): kelebek biçimli Co₂(μ-CO)₂ çekirdeği", en: "bridged isomer (solid state): butterfly Co₂(μ-CO)₂ core" },
    metalMetal: { tr: "Co–Co tekli bağ (2,52 Å) ve iki μ-CO köprüsü", en: "Co–Co single bond (2.52 Å) and two μ-CO bridges" },
    valence: 18,
    unpaired: 0,
    pointGroup: pg("C", "2", "v"),
    ligands: [{ id: "CO", count: 8, note: { tr: "6 uç + 2 köprü (μ₂) CO", en: "6 terminal + 2 bridging (μ₂) CO" } }],
    notes: [{ tr: "Çözeltide köprüsüz izomerler de dengede bulunur.", en: "In solution unbridged isomers are also present." }],
    build: () => {
      const b = start([{ el: "Co", p: [1.26, 0, 0] }, { el: "Co", p: [-1.26, 0, 0] }]);
      metalBond(b, 0, 1, 1);
      for (const z of [1.17, -1.17]) muCO(b, [0, -0.85, z], [0, -0.55, z > 0 ? 0.83 : -0.83], [0, 1]);
      for (const [m, s] of [[0, 1], [1, -1]] as [number, number][]) {
        terminal(b, m, "CO", [[s * 0.9, 0.3, 0]]);
        terminal(b, m, "CO", [[s * 0.3, 0.75, 0.6]]);
        terminal(b, m, "CO", [[s * 0.3, 0.75, -0.6]]);
      }
      return b;
    },
  },
  {
    id: "Fe2(CO)9",
    aliases: ["Fe2(CO)9", "[Fe2(CO)9]", "diiron nonacarbonyl", "didemir nonakarbonil", "nonacarbonyldiiron"],
    display: "[Fe₂(CO)₆(μ-CO)₃]",
    name: { en: "tri-μ-carbonyl-bis(tricarbonyliron)(Fe–Fe)", tr: "tri-μ-karbonil-bis(trikarbonildemir)(Fe–Fe)" },
    charge: 0,
    metal: "Fe",
    oxidation: 0,
    d: 8,
    perMetal: { tr: "her Fe: 3 uç CO + 3 köprü CO + Fe–Fe", en: "each Fe: 3 terminal CO + 3 bridging CO + Fe–Fe" },
    geometry: { tr: "üç μ-CO ile köprülenmiş iki Fe(CO)₃ birimi", en: "two Fe(CO)₃ units bridged by three μ-CO" },
    metalMetal: { tr: "Fe–Fe (2,52 Å); bağın varlığı tartışmalıdır, sayımda 1 kabul edilir", en: "Fe–Fe (2.52 Å); counted as one bond, though its reality is debated" },
    valence: 18,
    unpaired: 0,
    pointGroup: pg("D", "3", "h"),
    ligands: [{ id: "CO", count: 9, note: { tr: "6 uç + 3 köprü (μ₂) CO", en: "6 terminal + 3 bridging (μ₂) CO" } }],
    build: () => {
      const b = start([{ el: "Fe", p: [0, 0, 1.26] }, { el: "Fe", p: [0, 0, -1.26] }]);
      metalBond(b, 0, 1, 1);
      for (let k = 0; k < 3; k++) {
        const dir = polar(90, k * 120);
        muCO(b, scale(dir, 1.55), dir, [0, 1]);
        terminal(b, 0, "CO", [polar(52, 60 + k * 120)]);
        terminal(b, 1, "CO", [polar(128, 60 + k * 120)]);
      }
      return b;
    },
  },
  ...(
    [
      ["Re", "Cl", 2.24, 3, -2, "[Re₂Cl₈]²⁻", "octachloridodirhenate(III)", "oktakloridodirenat(III)", ["Re2Cl8", "[Re2Cl8]2-", "re2cl8 2-"]],
      ["Mo", "Cl", 2.14, 2, -4, "[Mo₂Cl₈]⁴⁻", "octachloridodimolybdate(II)", "oktakloridodimolibdat(II)", ["Mo2Cl8", "[Mo2Cl8]4-", "mo2cl8 4-"]],
    ] as const
  ).map(([el, x, mm, ox, charge, display, en, tr, aliases]): ClusterSpec => ({
    id: `${el}2${x}8`,
    aliases: [...aliases],
    display,
    name: { en, tr },
    charge,
    metal: el,
    oxidation: ox,
    d: 4,
    perMetal: { tr: `her ${el}: 4 ${x} + ${el}–${el} dörtlü bağ (kare piramit)`, en: `each ${el}: 4 ${x} + the ${el}–${el} quadruple bond (square pyramidal)` },
    geometry: { tr: "iki MCl₄ karesi, çakışık (eclipsed) dizilim", en: "two MCl₄ squares, eclipsed" },
    metalMetal: { tr: `${el}–${el} DÖRTLÜ bağ σ²π⁴δ², bağ derecesi 4 (${mm.toFixed(2).replace(".", ",")} Å); δ bağı çakışık dizilimi zorunlu kılar`, en: `${el}–${el} QUADRUPLE bond σ²π⁴δ², bond order 4 (${mm.toFixed(2)} Å); the δ bond enforces the eclipsed conformation` },
    valence: 16,
    unpaired: 0,
    pointGroup: pg("D", "4", "h"),
    ligands: [{ id: x, count: 8, note: { tr: `8 uç ${x}`, en: `8 terminal ${x}` } }],
    build: octahalide(el, x, mm),
  })),
  ...(
    [
      ["Cu", 2.62, null, "H2O", 2, 9, 1, "[Cu₂(μ-O₂CCH₃)₄(H₂O)₂]", "tetrakis(μ-acetato)diaquadicopper(II)", "tetrakis(μ-asetato)diakuadibakır(II)", ["Cu2(OAc)4(H2O)2", "Cu2(CH3COO)4(H2O)2", "[Cu(OAc)2(H2O)]2", "copper(II) acetate", "bakır(II) asetat", "bakır asetat"], "Cu···Cu 2,62 Å: resmî bağ yok; iki d⁹ merkez antiferromanyetik eşleşir", "Cu···Cu 2.62 Å: no formal bond; the two d⁹ centres couple antiferromagnetically"],
      ["Cr", 2.36, 4, "H2O", 2, 4, 0, "[Cr₂(μ-O₂CCH₃)₄(H₂O)₂]", "tetrakis(μ-acetato)diaquadichromium(II)(Cr–Cr)", "tetrakis(μ-asetato)diakuadikrom(II)(Cr–Cr)", ["Cr2(OAc)4(H2O)2", "Cr2(CH3COO)4(H2O)2", "chromium(II) acetate", "krom(II) asetat"], "Cr–Cr DÖRTLÜ bağ σ²π⁴δ² (2,36 Å)", "Cr–Cr QUADRUPLE bond σ²π⁴δ² (2.36 Å)"],
      ["Mo", 2.09, 4, null, 2, 4, 0, "[Mo₂(μ-O₂CCH₃)₄]", "tetrakis(μ-acetato)dimolybdenum(II)(Mo–Mo)", "tetrakis(μ-asetato)dimolibden(II)(Mo–Mo)", ["Mo2(OAc)4", "Mo2(CH3COO)4", "molybdenum(II) acetate", "molibden(II) asetat"], "Mo–Mo DÖRTLÜ bağ σ²π⁴δ² (2,09 Å)", "Mo–Mo QUADRUPLE bond σ²π⁴δ² (2.09 Å)"],
      ["Rh", 2.39, 1, null, 2, 7, 0, "[Rh₂(μ-O₂CCH₃)₄]", "tetrakis(μ-acetato)dirhodium(II)(Rh–Rh)", "tetrakis(μ-asetato)dirodyum(II)(Rh–Rh)", ["Rh2(OAc)4", "Rh2(CH3COO)4", "rhodium(II) acetate", "rodyum(II) asetat"], "Rh–Rh tekli bağ (2,39 Å)", "Rh–Rh single bond (2.39 Å)"],
    ] as const
  ).map(([el, mm, order, axial, ox, d, unpaired, display, en, tr, aliases, mmTr, mmEn]): ClusterSpec => ({
    id: `${el}2(OAc)4`,
    aliases: [...aliases],
    display,
    name: { en, tr },
    charge: 0,
    metal: el,
    oxidation: ox,
    d,
    perMetal: { tr: `her ${el}: 4 asetat O${axial ? " + 1 su" : ""}${order ? ` + ${el}–${el}` : ""}`, en: `each ${el}: 4 acetate O${axial ? " + 1 water" : ""}${order ? ` + ${el}–${el}` : ""}` },
    geometry: { tr: "çark (paddlewheel) yapısı: dört köprü asetat", en: "paddlewheel: four bridging acetates" },
    metalMetal: { tr: mmTr, en: mmEn },
    valence: d + 8 + (axial ? 2 : 0) + (order ?? 0),
    unpaired,
    pointGroup: pg("D", "4", "h"),
    ligands: [
      { id: "OAc", count: 4, note: { tr: "4 köprü (μ₂-κO:κO′) asetat", en: "4 bridging (μ₂-κO:κO′) acetates" } },
      ...(axial ? [{ id: axial, count: 2, note: { tr: "2 eksenel su", en: "2 axial water" } }] : []),
    ],
    notes: unpaired ? [{ tr: "Oda sıcaklığında manyetik moment düşüktür (antiferromanyetik eşleşme).", en: "The room-temperature moment is low (antiferromagnetic coupling)." }] : [],
    build: paddlewheel(el, mm, (order ?? null) as ModelBond["order"] | null, axial),
  })),
  ...(
    [
      ["Al", "Cl", 2.25, 1.6, "aluminium chloride dimer", "alüminyum klorür dimeri", ["Al2Cl6", "(AlCl3)2", "aluminium chloride", "aluminum chloride", "alüminyum klorür"]],
      ["Al", "Br", 2.43, 1.7, "aluminium bromide dimer", "alüminyum bromür dimeri", ["Al2Br6", "(AlBr3)2", "aluminium bromide", "alüminyum bromür"]],
      ["Ga", "Cl", 2.3, 1.55, "gallium chloride dimer", "galyum klorür dimeri", ["Ga2Cl6", "(GaCl3)2", "gallium chloride", "galyum klorür"]],
    ] as const
  ).map(([el, x, bridge, half, en, tr, aliases]): ClusterSpec => ({
    id: `${el}2${x}6`,
    aliases: [...aliases],
    display: `${el}₂${x}₆`,
    name: { en: `di-μ-${x === "Cl" ? "chlorido" : "bromido"}-bis[di${x === "Cl" ? "chlorido" : "bromido"}${el === "Al" ? "aluminium" : "gallium"}] (${en})`, tr: `di-μ-${x === "Cl" ? "klorido" : "bromido"}-bis[di${x === "Cl" ? "klorido" : "bromido"}${el === "Al" ? "alüminyum" : "galyum"}] (${tr})` },
    charge: 0,
    metal: el,
    oxidation: 3,
    d: null,
    perMetal: { tr: `her ${el}: 2 uç + 2 köprü ${x} (dörtyüzlü)`, en: `each ${el}: 2 terminal + 2 bridging ${x} (tetrahedral)` },
    geometry: { tr: "kenar paylaşan iki dörtyüzlü", en: "two edge-sharing tetrahedra" },
    metalMetal: { tr: `metal–metal bağı yok; iki μ-${x} köprüsü (3 merkez–4 elektron bağları)`, en: `no metal–metal bond; two μ-${x} bridges (3-centre 4-electron bonds)` },
    valence: 8,
    unpaired: 0,
    pointGroup: pg("D", "2", "h"),
    ligands: [{ id: x, count: 6, note: { tr: `4 uç + 2 köprü ${x}`, en: `4 terminal + 2 bridging ${x}` } }],
    build: edgeDimer(el, x, bridge, half),
  })),
  {
    id: "B2H6",
    aliases: ["B2H6", "diborane", "diboran", "diborane(6)"],
    display: "B₂H₆",
    name: { en: "diborane(6)", tr: "diboran(6)" },
    charge: 0,
    metal: "B",
    oxidation: 3,
    d: null,
    perMetal: { tr: "her B: 2 uç H + 2 köprü H (dörtyüzlü)", en: "each B: 2 terminal H + 2 bridging H (tetrahedral)" },
    geometry: { tr: "iki BH₂ birimi, iki köprü H ile", en: "two BH₂ units joined by two bridging H" },
    metalMetal: { tr: "B–H–B üç merkezli iki elektronlu (3c–2e, 'muz') bağlar; B···B 1,77 Å", en: "B–H–B three-centre two-electron ('banana') bonds; B···B 1.77 Å" },
    valence: 8,
    unpaired: 0,
    pointGroup: pg("D", "2", "h"),
    ligands: [{ id: "hydrido", count: 6, note: { tr: "4 uç + 2 köprü H", en: "4 terminal + 2 bridging H" } }],
    build: () => {
      const b = start([{ el: "B", p: [0.885, 0, 0] }, { el: "B", p: [-0.885, 0, 0] }]);
      muAtom(b, "H", [0, 0.99, 0], [0, 1]);
      muAtom(b, "H", [0, -0.99, 0], [0, 1]);
      for (const [m, s] of [[0, 1], [1, -1]] as [number, number][]) for (const z of [1, -1]) b.f.bonds.push({ a: b.metals[m], b: b.f.atom("H", add(b.f.p(b.metals[m]), scale([s * 0.5, 0, z * 0.866], 1.19))), order: 1 });
      return b;
    },
  },
  ...(
    [
      ["Ru", 2.85, "triruthenium", "trirutenyum"],
      ["Os", 2.88, "triosmium", "triosmiyum"],
    ] as const
  ).map(([el, mm, en, tr]): ClusterSpec => ({
    id: `${el}3(CO)12`,
    aliases: [`${el}3(CO)12`, `[${el}3(CO)12]`, `${en} dodecacarbonyl`, `${tr} dodekakarbonil`],
    display: `[${el}₃(CO)₁₂]`,
    name: { en: `dodecacarbonyl${en}(3 ${el}–${el})`, tr: `dodekakarbonil${tr}(3 ${el}–${el})` },
    charge: 0,
    metal: el,
    oxidation: 0,
    d: 8,
    perMetal: { tr: `her ${el}: 2 eksenel + 2 düzlem CO + 2 ${el}–${el}`, en: `each ${el}: 2 axial + 2 equatorial CO + 2 ${el}–${el}` },
    geometry: { tr: `${el}₃ eşkenar üçgeni, yalnızca uç CO`, en: `an equilateral ${el}₃ triangle, terminal CO only` },
    metalMetal: { tr: `üç ${el}–${el} tekli bağı (${mm.toFixed(2).replace(".", ",")} Å)`, en: `three ${el}–${el} single bonds (${mm.toFixed(2)} Å)` },
    valence: 18,
    unpaired: 0,
    pointGroup: pg("D", "3", "h"),
    ligands: [{ id: "CO", count: 12, note: { tr: "12 uç CO", en: "12 terminal CO" } }],
    build: triangle(el, mm),
  })),
  {
    id: "Ir4(CO)12",
    aliases: ["Ir4(CO)12", "[Ir4(CO)12]", "tetrairidium dodecacarbonyl", "tetrairidyum dodekakarbonil"],
    display: "[Ir₄(CO)₁₂]",
    name: { en: "dodecacarbonyltetrairidium(6 Ir–Ir)", tr: "dodekakarboniltetrairidyum(6 Ir–Ir)" },
    charge: 0,
    metal: "Ir",
    oxidation: 0,
    d: 9,
    perMetal: { tr: "her Ir: 3 uç CO + 3 Ir–Ir", en: "each Ir: 3 terminal CO + 3 Ir–Ir" },
    geometry: { tr: "Ir₄ düzgün dörtyüzlüsü", en: "a regular Ir₄ tetrahedron" },
    metalMetal: { tr: "altı Ir–Ir tekli bağı (2,69 Å)", en: "six Ir–Ir single bonds (2.69 Å)" },
    valence: 18,
    unpaired: 0,
    pointGroup: pg("T", "", "d"),
    ligands: [{ id: "CO", count: 12, note: { tr: "12 uç CO", en: "12 terminal CO" } }],
    build: tetrahedron("Ir", 2.69),
  },
  {
    id: "Fp2",
    aliases: ["Fp2", "[CpFe(CO)2]2", "Cp2Fe2(CO)4", "[(C5H5)Fe(CO)2]2", "cyclopentadienyliron dicarbonyl dimer", "siklopentadienildemir dikarbonil dimeri", "fp dimer"],
    display: "[CpFe(CO)(μ-CO)]₂",
    name: { en: "di-μ-carbonyl-bis[carbonyl(η⁵-cyclopentadienyl)iron](Fe–Fe)", tr: "di-μ-karbonil-bis[karbonil(η⁵-siklopentadienil)demir](Fe–Fe)" },
    charge: 0,
    metal: "Fe",
    oxidation: 1,
    d: 7,
    perMetal: { tr: "her Fe: η⁵-Cp + 1 uç CO + 2 köprü CO + Fe–Fe", en: "each Fe: η⁵-Cp + 1 terminal CO + 2 bridging CO + Fe–Fe" },
    geometry: { tr: "trans izomer: düzlemsel Fe₂(μ-CO)₂ halkası, Cp'ler zıt yönlerde", en: "trans isomer: planar Fe₂(μ-CO)₂ ring, Cp rings on opposite sides" },
    metalMetal: { tr: "Fe–Fe tekli bağ (2,53 Å) ve iki μ-CO", en: "Fe–Fe single bond (2.53 Å) and two μ-CO" },
    valence: 18,
    unpaired: 0,
    pointGroup: pg("C", "2", "h"),
    ligands: [
      { id: "Cp", count: 2, note: { tr: "2 η⁵-Cp", en: "2 η⁵-Cp" } },
      { id: "CO", count: 4, note: { tr: "2 uç + 2 köprü CO", en: "2 terminal + 2 bridging CO" } },
    ],
    build: () => {
      const b = start([{ el: "Fe", p: [1.26, 0, 0] }, { el: "Fe", p: [-1.26, 0, 0] }]);
      metalBond(b, 0, 1, 1);
      for (const s of [1, -1]) muCO(b, [0, s * 1.45, 0], [0, s, 0], [0, 1]);
      terminal(b, 0, "Cp", [[0.45, 0, 0.9]]);
      terminal(b, 0, "CO", [[0.5, 0, -0.86]]);
      terminal(b, 1, "Cp", [[-0.45, 0, -0.9]]);
      terminal(b, 1, "CO", [[-0.5, 0, 0.86]]);
      return b;
    },
  },
  ...(
    [
      ["Rh", "[Rh(cod)Cl]₂", "di-μ-chlorido-bis[(η⁴-cycloocta-1,5-diene)rhodium(I)]", "di-μ-klorido-bis[(η⁴-siklookta-1,5-dien)rodyum(I)]", ["[Rh(cod)Cl]2", "[RhCl(cod)]2", "Rh2Cl2(cod)2", "chloro(cyclooctadiene)rhodium dimer", "rodyum cod klorür dimeri"]],
      ["Ir", "[Ir(cod)Cl]₂", "di-μ-chlorido-bis[(η⁴-cycloocta-1,5-diene)iridium(I)]", "di-μ-klorido-bis[(η⁴-siklookta-1,5-dien)iridyum(I)]", ["[Ir(cod)Cl]2", "[IrCl(cod)]2", "Ir2Cl2(cod)2", "iridyum cod klorür dimeri"]],
    ] as const
  ).map(([el, display, en, tr, aliases]): ClusterSpec => ({
    id: `[${el}(cod)Cl]2`,
    aliases: [...aliases],
    display,
    name: { en, tr },
    charge: 0,
    metal: el,
    oxidation: 1,
    d: 8,
    perMetal: { tr: `her ${el}: 2 köprü Cl + η⁴-cod (kare düzlem)`, en: `each ${el}: 2 bridging Cl + η⁴-cod (square planar)` },
    geometry: { tr: "iki kare düzlem birim, ortak Cl–Cl kenarı", en: "two square-planar units sharing a Cl–Cl edge" },
    metalMetal: { tr: `metal–metal bağı yok (${el}···${el} ≈ 3,5 Å); iki μ-Cl köprüsü`, en: `no metal–metal bond (${el}···${el} ≈ 3.5 Å); two μ-Cl bridges` },
    valence: 16,
    unpaired: 0,
    pointGroup: pg("D", "2", "h"),
    ligands: [
      { id: "cod", count: 2, note: { tr: "2 η⁴-cod", en: "2 η⁴-cod" } },
      { id: "Cl", count: 2, note: { tr: "2 köprü (μ₂) Cl", en: "2 bridging (μ₂) Cl" } },
    ],
    build: () => {
      const b = start([{ el, p: [1.75, 0, 0] }, { el, p: [-1.75, 0, 0] }]);
      muAtom(b, "Cl", [0, 1.6, 0], [0, 1]);
      muAtom(b, "Cl", [0, -1.6, 0], [0, 1]);
      terminal(b, 0, "cod", [[0.74, 0.675, 0], [0.74, -0.675, 0]]);
      terminal(b, 1, "cod", [[-0.74, 0.675, 0], [-0.74, -0.675, 0]]);
      return b;
    },
  })),
  {
    id: "Hg2Cl2",
    aliases: ["Hg2Cl2", "calomel", "kalomel", "mercury(I) chloride", "cıva(I) klorür"],
    display: "Hg₂Cl₂",
    name: { en: "dichloridodimercury(Hg–Hg) (calomel)", tr: "dikloridodicıva(Hg–Hg) (kalomel)" },
    charge: 0,
    metal: "Hg",
    oxidation: 1,
    d: 10,
    perMetal: { tr: "her Hg: 1 Cl + Hg–Hg (doğrusal)", en: "each Hg: 1 Cl + Hg–Hg (linear)" },
    geometry: { tr: "doğrusal Cl–Hg–Hg–Cl", en: "linear Cl–Hg–Hg–Cl" },
    metalMetal: { tr: "Hg–Hg tekli bağ (2,53 Å): Hg₂²⁺ iyonu", en: "Hg–Hg single bond (2.53 Å): the Hg₂²⁺ ion" },
    valence: 14,
    unpaired: 0,
    pointGroup: pg("D", "∞", "h"),
    ligands: [{ id: "Cl", count: 2, note: { tr: "2 uç Cl", en: "2 terminal Cl" } }],
    build: () => {
      const b = start([{ el: "Hg", p: [0, 0, 1.265] }, { el: "Hg", p: [0, 0, -1.265] }]);
      metalBond(b, 0, 1, 1);
      terminal(b, 0, "Cl", [[0, 0, 1]]);
      terminal(b, 1, "Cl", [[0, 0, -1]]);
      return b;
    },
  },
];

function key(text: string): string {
  return normalName(plainFormula(text).replace(/[[\]]/g, "")).replace(/[()]/g, "");
}

const INDEX = new Map<string, ClusterSpec>();
for (const spec of LIBRARY) for (const alias of [spec.id, ...spec.aliases]) INDEX.set(key(alias), spec);

/** A known multinuclear compound by formula or name, or null. */
export function findCluster(text: string): ClusterSpec | null {
  const k = key(text);
  return INDEX.get(k) ?? INDEX.get(k.replace(/\d*[+-]$/, "")) ?? null;
}

export const CLUSTER_NAMES = LIBRARY.map((spec) => spec.id);

export function analyseCluster(spec: ClusterSpec, language: Language): ComplexResult {
  const t = (w: Words) => w[language];
  const built = spec.build();
  const counts = new Map<string, number>();
  for (const atom of built.f.atoms) counts.set(atom.el, (counts.get(atom.el) ?? 0) + 1);
  const hill = hillText(counts);
  const parsed = parseFormula(`${hill}${spec.charge ? `^${Math.abs(spec.charge)}${spec.charge > 0 ? "+" : "-"}` : ""}`);
  const centres = built.metals.length;
  const model: Model3D = { atoms: relaxModel(built.f.atoms, built.f.bonds), bonds: built.f.bonds };
  const ion = spec.display.includes("[") || !spec.charge ? spec.display : `${spec.display}${superscript(chargeLabel(spec.charge))}`;
  const metalName = METALS[spec.metal]?.[language] ?? spec.metal;
  return {
    metal: spec.metal,
    metalName,
    centres,
    oxidationState: spec.oxidation,
    charge: spec.charge,
    ion,
    compound: ion,
    hill,
    molarMass: molarMass(parsed),
    exactMass: monoisotopicMass(parsed),
    composition: composition(parsed, language),
    coordinationNumber: 0,
    coordinationText: t(spec.perMetal),
    geometry: "cluster",
    geometryName: t(spec.geometry),
    angles: "—",
    hybridisation: "—",
    dElectrons: spec.d,
    fElectrons: null,
    configuration: spec.d === null ? (language === "en" ? "main-group centres" : "ana grup merkezleri") : `${centres}× ${spec.metal}(${roman(spec.oxidation)}) d${superscript(String(spec.d))}`,
    spin: null,
    unpaired: spec.unpaired,
    magneticMoment: Math.sqrt(spec.unpaired * (spec.unpaired + 2)),
    momentBasis: "spin-only",
    cfse: null,
    valenceElectrons: spec.valence,
    metalMetal: t(spec.metalMetal),
    isomers: [],
    pointGroup: spec.pointGroup,
    nameEn: spec.name.en,
    nameTr: spec.name.tr,
    ligands: spec.ligands.map((l) => {
      const ligand = findLigand(l.id)!;
      return { id: l.id, count: l.count, name: `${language === "en" ? ligand.en : ligand.tr} (${t(l.note)})`, charge: ligand.charge, denticity: 1, donor: ligand.donors[0] };
    }),
    notes: (spec.notes ?? []).map(t),
    model,
  };
}

/** For callers that want the display formula of a cluster with real subscripts. */
export function clusterDisplay(text: string): string {
  return text.replace(/(\d+)/g, (d) => subscript(d));
}

