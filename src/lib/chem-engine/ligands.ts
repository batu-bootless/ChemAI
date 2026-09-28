// Chem+ app: the ligands the structure engine knows - how each is written, what it gives the metal
// (charge, electrons, where it stands in the spectrochemical series), how many sites it takes and
// in what pattern, its IUPAC name in Turkish and English, and how to build it in 3D on its sites.
//
// Patterns: mono (one site), chelate (two neighbouring sites), chain3 (three in a row: dien,
// terpy), ring3 (three mutually cis: tacn), ring4 (four round a square: porphyrin, salen, cyclam),
// tripod4 (an apex and three arms: tren, nta), ring6 (a flat hexagon: 18-crown-6), edta.
// A π ligand (Cp, C₂H₄, O₂ side-on…) takes one site: its centre.

import { add, cross, dot, perpendicular, rotate, scale, sub, unit, type Vec } from "./model3d";
import {
  DEG,
  Fragment,
  bent,
  bridge,
  cone,
  donor,
  hexagonOn,
  methyl,
  oneHydrogen,
  origin,
  piRing,
  ring5,
  ring6,
  sideOn,
  twoDirections,
  twoHydrogens,
  type Frame,
} from "./structureKit";

export type Pattern = "mono" | "chelate" | "chain3" | "ring3" | "ring4" | "tripod4" | "ring6" | "edta";

export type Builder = (f: Fragment, sites: Vec[], frame: Frame) => void;

export interface LigandDef {
  id: string;
  aliases: string[];
  /** In the formula: the abbreviation or formula. */
  formula: string;
  atoms: Record<string, number>;
  charge: number;
  pattern: Pattern;
  /** Each donor's kind, in the order of its sites (en: N, N; gly: N, O; salen: O, N, N, O). */
  donors: string[];
  /** chain3 only: the two ends must be trans (terpy) or cis (a facial chain). */
  span?: "mer" | "fac";
  /** Electrons it gives the metal (ionic model). */
  electrons: number;
  /** Place in the spectrochemical series: 0 weak … 3 strong field. */
  field: 0 | 1 | 2 | 3;
  en: string;
  tr: string;
  /** Names with locants or several words take bis/tris and brackets. */
  complexName: boolean;
  /** Bonded side-on (η) through its centre. */
  pi?: boolean;
  /** Hapticity shown in the ligand list (η⁵…). */
  hapto?: number;
  build: Builder;
}

// --- builders for one-site ligands -----------------------------------------------------------------

const atomOnly =
  (el: string, adjust?: number, order: 1 | 2 | 3 = 1): Builder =>
  (f, [a], frame) => {
    donor(f, frame, a, el, adjust, order);
  };

/** Donor + substituents on a cone (NH3, PMe3, CH3…). */
function coneLigand(el: string, subs: string, count: number, bond: number, adjust?: number): Builder {
  return (f, [a], frame) => {
    const d = donor(f, frame, a, el, adjust);
    for (const h of cone(f.p(d), a, count, 70.5 * DEG, bond)) f.bond(d, f.atom(subs, h));
  };
}

/** A linear ligand: donor then atoms straight out (CO, CN, N₂, NCS, MeCN…). */
function linear(atoms: { el: string; bond: number; order: 1 | 2 | 3 }[], donorEl: string, adjust?: number, tail?: "Me"): Builder {
  return (f, [a], frame) => {
    let previous = donor(f, frame, a, donorEl, adjust);
    for (const atom of atoms) {
      const next = f.atom(atom.el, add(f.p(previous), scale(a, atom.bond)));
      f.bond(previous, next, atom.order);
      previous = next;
    }
    if (tail === "Me") methyl(f, previous, a, "H", 1.46);
  };
}

/** Phenyl-type rings on a donor (PPh3, AsPh3) or methyls (PMe3) or ethyls (PEt3). */
function phosphane(el: string, group: "Ph" | "Me" | "Et"): Builder {
  return (f, [a], frame) => {
    const p = donor(f, frame, a, el);
    const u = perpendicular(a);
    for (let i = 0; i < 3; i++) {
      const d = unit(add(scale(a, Math.cos(70.5 * DEG)), scale(rotate(u, a, i * 120 * DEG), Math.sin(70.5 * DEG))));
      if (group === "Me") {
        methyl(f, p, d, "H", 1.84);
      } else if (group === "Et") {
        const c1 = f.atom("C", add(f.p(p), scale(d, 1.84)));
        f.bond(p, c1);
        const next = bent(scale(d, -1), cross(a, d), 110, d);
        methyl(f, c1, next, "H", 1.53);
        const c2 = f.neighbours(c1).find((n) => n !== p)!;
        twoHydrogens(f, c1, f.p(p), f.p(c2));
      } else {
        const ipso = f.atom("C", add(f.p(p), scale(d, 1.83)));
        f.bond(p, ipso);
        f.aromaticHydrogens(ring6(f, ipso, d, rotate(unit(cross(a, d)), d, 40 * DEG)));
      }
    }
  };
}

/** Two phenyls on a phosphorus already bonded to the metal and one backbone carbon (dppe, dppm). */
function diphenyl(f: Fragment, p: number, metal: Vec, carbon: Vec) {
  for (const d of twoDirections(f.p(p), metal, carbon)) {
    const ipso = f.atom("C", add(f.p(p), scale(d, 1.83)));
    f.bond(p, ipso);
    f.aromaticHydrogens(ring6(f, ipso, d, perpendicular(d)));
  }
}

/** Two methyls on a nitrogen bonded to the metal and one backbone carbon (tmeda). */
function dimethylAmine(f: Fragment, n: number, metal: Vec, carbon: Vec) {
  for (const d of twoDirections(f.p(n), metal, carbon)) methyl(f, n, d, "H", 1.47);
}

// --- builders for chelates -------------------------------------------------------------------------

function chelate(
  donors: [string, string],
  backbone: { el: string; hang?: Parameters<typeof bridge>[3][number]["hang"] }[],
  orders: (1 | 1.5 | 2 | 3)[],
  bond: number,
  extra?: (f: Fragment, d1: number, d2: number, ids: number[], ring: { ringCentre: Vec; normal: Vec }, frame: Frame) => void
): Builder {
  return (f, [a1, a2], frame) => {
    const d1 = donor(f, frame, a1, donors[0]);
    const d2 = donor(f, frame, a2, donors[1]);
    const ring = bridge(f, d1, d2, backbone, orders, bond, origin(frame));
    extra?.(f, d1, d2, ring.ids, ring, frame);
  };
}

/** A benzene ring fused on the backbone edge c1–c2 (catecholate, quinolinolate, salen). */
function benzo(f: Fragment, c1: number, c2: number, away: Vec, normal: Vec) {
  const ring = hexagonOn(f.p(c1), f.p(c2), away, normal).map((p) => f.atom("C", p));
  const loop = [c1, ...ring, c2];
  for (let i = 0; i < loop.length - 1; i++) f.bond(loop[i], loop[i + 1], 1.5);
  f.bond(c2, c1, 1.5);
  return ring;
}

function bipyridine(fused: boolean): Builder {
  return (f, [a1, a2], frame) => {
    const n1 = donor(f, frame, a1, "N");
    const n2 = donor(f, frame, a2, "N");
    const { ids, ringCentre, normal } = bridge(f, n1, n2, [{ el: "C" }, { el: "C" }], [1.5, 1, 1.5], 1.4, origin(frame));
    const [c1, c2] = ids;
    for (const [n, c] of [[n1, c1], [n2, c2]]) {
      const ring = hexagonOn(f.p(n), f.p(c), ringCentre, normal).map((p) => f.atom("C", p));
      const loop = [n, ...ring, c];
      for (let i = 0; i < loop.length; i++) f.bond(loop[i], loop[(i + 1) % loop.length], 1.5);
    }
    if (fused) {
      const middle = hexagonOn(f.p(c1), f.p(c2), origin(frame), normal).map((p) => f.atom("C", p));
      const loop = [c1, ...middle, c2];
      for (let i = 0; i < loop.length; i++) f.bond(loop[i], loop[(i + 1) % loop.length], 1.5);
    }
    f.merge();
    f.aromaticHydrogens();
  };
}

/** 1,5-cyclooctadiene through both C=C (each on one site), joined by two CH₂CH₂ bridges. */
const cyclooctadiene: Builder = (f, [a1, a2], frame) => {
  const n = unit(cross(a1, a2));
  const alkene = (a: Vec) => sideOn(f, frame, a, "C", 1.38, 2, 0.35, n);
  const [p1, m1] = alkene(a1);
  const [p2, m2] = alkene(a2);
  const centre = origin(frame);
  for (const [x, y] of [[p1, p2], [m1, m2]]) bridge(f, x, y, [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.53, centre);
  for (const c of [p1, m1, p2, m2]) {
    const around = f.neighbours(c).map((i) => f.p(i));
    oneHydrogen(f, c, [...around, centre], 1.08);
  }
};

// --- builders for three to six sites ---------------------------------------------------------------

/** Rigid, flat terpyridine: built from its rings, the outer N atoms land close to their sites. */
const terpyridine: Builder = (f, [s1, s2, s3], frame) => {
  const centre = origin(frame);
  const n2 = donor(f, frame, s2, "N");
  const t = unit(sub(s1, scale(s2, dot(s1, s2))));
  const ringCentre = add(f.p(n2), scale(s2, 1.39));
  const central = [n2];
  for (let k = 1; k < 6; k++) {
    const a = Math.PI + (k * Math.PI) / 3;
    central.push(f.atom("C", add(ringCentre, scale(add(scale(s2, Math.cos(a)), scale(t, Math.sin(a))), 1.39))));
  }
  for (let k = 0; k < 6; k++) f.bond(central[k], central[(k + 1) % 6], 1.5);
  // Outer rings on C2 and C6 of the central ring, their N atoms turned towards the metal.
  for (const [c, site] of [[central[5], s1], [central[1], s3]] as [number, Vec][]) {
    const dir = unit(sub(f.p(c), ringCentre));
    const joint = f.atom("C", add(f.p(c), scale(dir, 1.48)));
    f.bond(c, joint);
    const outerCentre = add(f.p(joint), scale(dir, 1.39));
    const side = unit(sub(site, scale(dir, dot(site, dir))));
    const ids = [joint];
    for (let k = 1; k < 6; k++) {
      const a = Math.PI + (k * Math.PI) / 3;
      const p = add(outerCentre, scale(add(scale(dir, Math.cos(a)), scale(side, Math.sin(a))), 1.39));
      ids.push(f.atom(k === 1 ? "N" : "C", p));
    }
    for (let k = 0; k < 6; k++) f.bond(ids[k], ids[(k + 1) % 6], 1.5);
    // The ring point nearest the metal is the nitrogen.
    const nearest = ids.slice(1).reduce((best, id) => (dot(sub(f.p(id), centre), sub(f.p(id), centre)) < dot(sub(f.p(best), centre), sub(f.p(best), centre)) ? id : best));
    if (f.atoms[nearest].el !== "N") {
      const nIndex = ids.findIndex((id) => f.atoms[id].el === "N");
      f.atoms[ids[nIndex]].el = "C";
      f.atoms[nearest].el = "N";
    }
    f.links.push({ atom: nearest, order: 1, kind: "coord" });
  }
  f.aromaticHydrogens();
};

/** Diethylenetriamine (or iminodiacetate): a central N with two arms on neighbouring sites. */
function triamine(arm: "amine" | "acetate"): Builder {
  return (f, [s1, s2, s3], frame) => {
    const centre = origin(frame);
    const middle = donor(f, frame, s2, "N");
    const ends: number[] = [];
    for (const s of [s1, s3]) {
      if (arm === "amine") {
        const n = donor(f, frame, s, "N");
        const { ids } = bridge(f, middle, n, [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.49, centre);
        twoHydrogens(f, n, centre, f.p(ids[1]), 1.01);
        ends.push(ids[0]);
      } else {
        const o = donor(f, frame, s, "O");
        const { ids } = bridge(f, middle, o, [{ el: "C", hang: "H2" }, { el: "C", hang: "O" }], [1, 1, 1], 1.45, centre);
        ends.push(ids[0]);
      }
    }
    oneHydrogen(f, middle, [centre, f.p(ends[0]), f.p(ends[1])]);
  };
}

/** 1,4,7-Triazacyclononane: three NH on facial sites, each pair joined by CH₂CH₂. */
const triazacyclononane: Builder = (f, sites, frame) => {
  const centre = origin(frame);
  const n = sites.map((s) => donor(f, frame, s, "N"));
  const touching: number[][] = [[], [], []];
  for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
    const { ids } = bridge(f, n[i], n[j], [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.49, centre);
    touching[i].push(ids[0]);
    touching[j].push(ids[1]);
  }
  n.forEach((id, i) => oneHydrogen(f, id, [centre, ...touching[i].map((t) => f.p(t))]));
};

/** Tripodal N(CH₂CH₂NH₂)₃ (tren) or N(CH₂COO)₃ (nta): the apex N and three arms. */
function tripod(arm: "amine" | "acetate"): Builder {
  return (f, [apex, ...arms], frame) => {
    const centre = origin(frame);
    const top = donor(f, frame, apex, "N");
    for (const s of arms) {
      if (arm === "amine") {
        const n = donor(f, frame, s, "N");
        const { ids } = bridge(f, top, n, [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.49, centre);
        twoHydrogens(f, n, centre, f.p(ids[1]), 1.01);
      } else {
        const o = donor(f, frame, s, "O");
        bridge(f, top, o, [{ el: "C", hang: "H2" }, { el: "C", hang: "O" }], [1, 1, 1], 1.45, centre);
      }
    }
  };
}

/** A porphyrin (or phthalocyanine) core flat on four sites round a square. */
function porphyrin(kind: "porphine" | "tpp" | "pc"): Builder {
  return (f, sites, frame) => {
    const centre = origin(frame);
    const nitrogens = sites.map((s) => donor(f, frame, s, "N", -0.1));
    const side = 1.38;
    const radius = side / (2 * Math.sin(36 * DEG));
    const alpha: [number, number][] = [];
    const betas: [number, number][] = [];
    const ringCentres: Vec[] = [];
    sites.forEach((s, i) => {
      const t = unit(sites[(i + 1) % 4]);
      const n = nitrogens[i];
      const c = add(f.p(n), scale(s, radius));
      ringCentres.push(c);
      const at = (k: number) => add(c, scale(add(scale(s, Math.cos(Math.PI + k * 72 * DEG)), scale(t, Math.sin(Math.PI + k * 72 * DEG))), radius));
      const a1 = f.atom("C", at(1));
      const b1 = f.atom("C", at(2));
      const b2 = f.atom("C", at(3));
      const a2 = f.atom("C", at(4));
      f.bond(n, a1, 1.5);
      f.bond(a1, b1, 1.5);
      f.bond(b1, b2, 1.5);
      f.bond(b2, a2, 1.5);
      f.bond(a2, n, 1.5);
      // a1 lies towards −t (the previous site), a2 towards +t (the next site).
      alpha.push([a1, a2]);
      betas.push([b1, b2]);
    });
    const normal = unit(cross(sites[0], sites[1]));
    for (let i = 0; i < 4; i++) {
      const from = alpha[i][1];
      const to = alpha[(i + 1) % 4][0];
      const out = unit(add(sites[i], sites[(i + 1) % 4]));
      const mid = scale(add(f.p(from), f.p(to)), 0.5);
      const half = Math.hypot(...sub(f.p(from), f.p(to))) / 2;
      const meso = f.atom(kind === "pc" ? "N" : "C", add(mid, scale(out, Math.sqrt(Math.max(0, 1.39 * 1.39 - half * half)))));
      f.bond(from, meso, 1.5);
      f.bond(meso, to, 1.5);
      if (kind === "porphine") f.bond(meso, f.atom("H", add(f.p(meso), scale(out, 1.08))));
      if (kind === "tpp") {
        const ipso = f.atom("C", add(f.p(meso), scale(out, 1.49)));
        f.bond(meso, ipso);
        f.aromaticHydrogens(ring6(f, ipso, out, normal));
      }
    }
    betas.forEach(([b1, b2], i) => {
      if (kind === "pc") {
        benzo(f, b1, b2, ringCentres[i], normal);
      } else {
        for (const b of [b1, b2]) f.bond(b, f.atom("H", add(f.p(b), scale(unit(sub(f.p(b), ringCentres[i])), 1.08))));
      }
    });
    if (kind === "pc") f.aromaticHydrogens();
    void centre;
  };
}

/** Salen: O, N, N, O round a square; the imine arms carry the phenolate rings. */
const salen: Builder = (f, [so1, sn1, sn2, so2], frame) => {
  const centre = origin(frame);
  const o1 = donor(f, frame, so1, "O");
  const n1 = donor(f, frame, sn1, "N");
  const n2 = donor(f, frame, sn2, "N");
  const o2 = donor(f, frame, so2, "O");
  bridge(f, n1, n2, [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.49, centre);
  for (const [n, o] of [[n1, o1], [n2, o2]]) {
    const { ids, ringCentre, normal } = bridge(f, n, o, [{ el: "C", hang: "H" }, { el: "C" }, { el: "C" }], [2, 1, 1.5, 1], 1.4, centre);
    benzo(f, ids[1], ids[2], ringCentre, normal);
  }
  f.aromaticHydrogens();
};

/** Cyclam: four NH round a square, joined alternately by CH₂CH₂ and CH₂CH₂CH₂. */
const cyclam: Builder = (f, sites, frame) => {
  const centre = origin(frame);
  const n = sites.map((s) => donor(f, frame, s, "N"));
  const touching: number[][] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const backbone = i % 2 === 0 ? [{ el: "C", hang: "H2" as const }, { el: "C", hang: "H2" as const }] : [{ el: "C", hang: "H2" as const }, { el: "C", hang: "H2" as const }, { el: "C", hang: "H2" as const }];
    const { ids } = bridge(f, n[i], n[j], backbone, backbone.map(() => 1 as const).concat([1]), 1.52, centre);
    touching[i].push(ids[0]);
    touching[j].push(ids[ids.length - 1]);
  }
  n.forEach((id, i) => oneHydrogen(f, id, [centre, ...touching[i].map((t) => f.p(t))]));
};

/** 18-Crown-6: six O on a flat hexagon, each pair joined by CH₂CH₂. */
const crown: Builder = (f, sites, frame) => {
  const centre = origin(frame);
  const o = sites.map((s) => donor(f, frame, s, "O"));
  for (let i = 0; i < 6; i++) bridge(f, o[i], o[(i + 1) % 6], [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.47, centre);
};

/** EDTA on octahedral sites +x, −x, +y, −y, +z, −z: N at +x and +y, each with two acetate arms. */
const edta: Builder = (f, sites, frame) => {
  const centre = origin(frame);
  const [px, mx, py, my, pz, mz] = sites;
  const n1 = donor(f, frame, px, "N");
  const n2 = donor(f, frame, py, "N");
  bridge(f, n1, n2, [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.49, centre);
  for (const [n, s] of [[n1, pz], [n1, my], [n2, mz], [n2, mx]] as [number, Vec][]) {
    const oxygen = donor(f, frame, s, "O");
    bridge(f, n, oxygen, [{ el: "C", hang: "H2" }, { el: "C", hang: "O" }], [1, 1, 1], 1.45, centre);
  }
};

// --- the library -----------------------------------------------------------------------------------

type Def = Omit<LigandDef, "pattern" | "donors"> & { pattern?: Pattern; donors?: string[] };

const L = (def: Def): LigandDef => ({ pattern: "mono", donors: [def.id], ...def });

export const LIGANDS: LigandDef[] = [
  // Halides and chalcogenides.
  L({ id: "F", aliases: ["f", "f-", "fluoro", "fluorido", "floro", "florido", "fluoride", "florür"], formula: "F", atoms: { F: 1 }, charge: -1, electrons: 2, field: 1, en: "fluorido", tr: "florido", complexName: false, donors: ["F"], build: atomOnly("F") }),
  L({ id: "Cl", aliases: ["cl", "cl-", "chloro", "chlorido", "kloro", "klorido", "chloride", "klorür"], formula: "Cl", atoms: { Cl: 1 }, charge: -1, electrons: 2, field: 1, en: "chlorido", tr: "klorido", complexName: false, donors: ["Cl"], build: atomOnly("Cl") }),
  L({ id: "Br", aliases: ["br", "br-", "bromo", "bromido", "bromide", "bromür"], formula: "Br", atoms: { Br: 1 }, charge: -1, electrons: 2, field: 0, en: "bromido", tr: "bromido", complexName: false, donors: ["Br"], build: atomOnly("Br") }),
  L({ id: "I", aliases: ["i", "i-", "iodo", "iodido", "iyodo", "iyodido", "iodide", "iyodür"], formula: "I", atoms: { I: 1 }, charge: -1, electrons: 2, field: 0, en: "iodido", tr: "iyodido", complexName: false, donors: ["I"], build: atomOnly("I") }),
  L({ id: "oxo", aliases: ["oxo", "oxido", "o", "o2-", "okso", "oksido", "oxide"], formula: "O", atoms: { O: 1 }, charge: -2, electrons: 4, field: 1, en: "oxido", tr: "oksido", complexName: false, donors: ["O"], build: atomOnly("O", -0.62, 2) }),
  L({ id: "sulfido", aliases: ["s", "s2-", "sulfido", "sulfide", "sülfido", "sülfür", "thio"], formula: "S", atoms: { S: 1 }, charge: -2, electrons: 4, field: 0, en: "sulfido", tr: "sülfido", complexName: false, donors: ["S"], build: atomOnly("S", -0.35, 2) }),
  L({ id: "nitrido", aliases: ["nitrido", "n3-", "nitride", "nitrür"], formula: "N", atoms: { N: 1 }, charge: -3, electrons: 6, field: 3, en: "nitrido", tr: "nitrido", complexName: false, donors: ["N"], build: atomOnly("N", -0.72, 3) }),
  L({ id: "hydrido", aliases: ["h", "h-", "hydrido", "hydride", "hidrido", "hidrür"], formula: "H", atoms: { H: 1 }, charge: -1, electrons: 2, field: 3, en: "hydrido", tr: "hidrido", complexName: false, donors: ["H"], build: atomOnly("H", -0.05) }),
  // O donors.
  L({
    id: "OH", aliases: ["oh", "oh-", "hydroxo", "hydroxido", "hidrokso", "hidroksido", "hydroxide", "hidroksit"], formula: "OH", atoms: { O: 1, H: 1 }, charge: -1, electrons: 2, field: 1, en: "hydroxido", tr: "hidroksido", complexName: false, donors: ["O"],
    build: (f, [a], frame) => {
      const o = donor(f, frame, a, "O");
      f.bond(o, f.atom("H", add(f.p(o), scale(bent(scale(a, -1), perpendicular(a), 110), 0.96))));
    },
  }),
  L({
    id: "H2O", aliases: ["h2o", "oh2", "aqua", "akua", "aquo", "water", "su"], formula: "H2O", atoms: { H: 2, O: 1 }, charge: 0, electrons: 2, field: 1, en: "aqua", tr: "akua", complexName: false, donors: ["O"],
    build: (f, [a], frame) => {
      const o = donor(f, frame, a, "O");
      const u = perpendicular(a);
      for (const side of [1, -1]) f.bond(o, f.atom("H", add(f.p(o), scale(add(scale(a, Math.cos(52.25 * DEG)), scale(u, side * Math.sin(52.25 * DEG))), 0.96))));
    },
  }),
  L({
    id: "OAc", aliases: ["oac", "oac-", "acetate", "acetato", "asetat", "asetato", "ch3coo", "ch3coo-", "acetato-κo", "κ1-oac"], formula: "OAc", atoms: { C: 2, H: 3, O: 2 }, charge: -1, electrons: 2, field: 1, en: "acetato", tr: "asetato", complexName: false, donors: ["O"],
    build: (f, [a], frame) => {
      const o = donor(f, frame, a, "O");
      const n = perpendicular(a);
      const toC = bent(scale(a, -1), n, 125, a);
      const c = f.atom("C", add(f.p(o), scale(toC, 1.28)));
      f.bond(o, c);
      const back = scale(toC, -1);
      f.bond(c, f.atom("O", add(f.p(c), scale(rotate(back, n, 122 * DEG), 1.24))), 2);
      methyl(f, c, rotate(back, n, -118 * DEG));
    },
  }),
  L({
    id: "NO3", aliases: ["no3", "no3-", "nitrato", "nitrate", "nitrat", "nitrato-κo"], formula: "NO3", atoms: { N: 1, O: 3 }, charge: -1, electrons: 2, field: 1, en: "nitrato-κO", tr: "nitrato-κO", complexName: true, donors: ["O"],
    build: (f, [a], frame) => {
      const o = donor(f, frame, a, "O");
      const n = perpendicular(a);
      const toN = bent(scale(a, -1), n, 120, a);
      const nitrogen = f.atom("N", add(f.p(o), scale(toN, 1.3)));
      f.bond(o, nitrogen);
      const back = scale(toN, -1);
      f.bond(nitrogen, f.atom("O", add(f.p(nitrogen), scale(rotate(back, n, 120 * DEG), 1.22))), 2);
      f.bond(nitrogen, f.atom("O", add(f.p(nitrogen), scale(rotate(back, n, -120 * DEG), 1.22))));
    },
  }),
  L({
    id: "ONO", aliases: ["ono", "ono-", "nitrito-o", "nitrito-κo", "nitrito"], formula: "ONO", atoms: { N: 1, O: 2 }, charge: -1, electrons: 2, field: 1, en: "nitrito-κO", tr: "nitrito-κO", complexName: true, donors: ["O"],
    build: (f, [a], frame) => {
      const o = donor(f, frame, a, "O");
      const n = perpendicular(a);
      const toN = bent(scale(a, -1), n, 118, a);
      const nitrogen = f.atom("N", add(f.p(o), scale(toN, 1.3)));
      f.bond(o, nitrogen);
      f.bond(nitrogen, f.atom("O", add(f.p(nitrogen), scale(rotate(scale(toN, -1), n, 115 * DEG), 1.2))), 2);
    },
  }),
  L({
    id: "THF", aliases: ["thf", "tetrahydrofuran", "tetrahidrofuran", "oxolane", "oksolan"], formula: "thf", atoms: { C: 4, H: 8, O: 1 }, charge: 0, electrons: 2, field: 1, en: "oxolane", tr: "oksolan", complexName: true, donors: ["O"],
    build: (f, [a], frame) => {
      const o = donor(f, frame, a, "O");
      const ids = ring5(f, o, a, perpendicular(a), ["C", "C", "C", "C"], 1.5, 1);
      for (let k = 1; k < 5; k++) twoHydrogens(f, ids[k], f.p(ids[k - 1]), f.p(ids[(k + 1) % 5]));
    },
  }),
  L({
    id: "DMSO", aliases: ["dmso", "dimethyl sulfoxide", "dimethylsulfoxide", "dimetil sülfoksit", "dimetilsülfoksit", "me2so"], formula: "dmso", atoms: { C: 2, H: 6, O: 1, S: 1 }, charge: 0, electrons: 2, field: 1, en: "(dimethyl sulfoxide)-κS", tr: "(dimetil sülfoksit)-κS", complexName: true, donors: ["S"],
    build: (f, [a], frame) => {
      const s = donor(f, frame, a, "S");
      const [ox, m1, m2] = cone(f.p(s), a, 3, 70.5 * DEG, 1);
      f.bond(s, f.atom("O", add(f.p(s), scale(unit(sub(ox, f.p(s))), 1.49))), 2);
      for (const m of [m1, m2]) methyl(f, s, unit(sub(m, f.p(s))), "H", 1.8);
    },
  }),
  // N donors.
  L({ id: "NH3", aliases: ["nh3", "ammine", "ammin", "ammonia", "amonyak", "amin"], formula: "NH3", atoms: { N: 1, H: 3 }, charge: 0, electrons: 2, field: 2, en: "ammine", tr: "ammin", complexName: false, donors: ["N"], build: coneLigand("N", "H", 3, 1.01) }),
  L({
    id: "NH2", aliases: ["nh2", "nh2-", "amido", "azanido", "amide"], formula: "NH2", atoms: { N: 1, H: 2 }, charge: -1, electrons: 2, field: 2, en: "azanido", tr: "azanido", complexName: false, donors: ["N"],
    build: (f, [a], frame) => {
      const n = donor(f, frame, a, "N", -0.1);
      const u = perpendicular(a);
      for (const side of [1, -1]) f.bond(n, f.atom("H", add(f.p(n), scale(add(scale(a, Math.cos(60 * DEG)), scale(u, side * Math.sin(60 * DEG))), 1.01))));
    },
  }),
  L({ id: "CN", aliases: ["cn", "cn-", "cyano", "cyanido", "siyano", "siyanido", "cyanide", "siyanür"], formula: "CN", atoms: { C: 1, N: 1 }, charge: -1, electrons: 2, field: 3, en: "cyanido", tr: "siyanido", complexName: false, donors: ["C"], build: linear([{ el: "N", bond: 1.16, order: 3 }], "C", -0.18) }),
  L({ id: "NCS", aliases: ["ncs", "ncs-", "isothiocyanato", "thiocyanato-n", "thiocyanato-κn", "tiyosiyanato-n", "izotiyosiyanato"], formula: "NCS", atoms: { N: 1, C: 1, S: 1 }, charge: -1, electrons: 2, field: 2, en: "thiocyanato-κN", tr: "tiyosiyanato-κN", complexName: true, donors: ["N"], build: linear([{ el: "C", bond: 1.17, order: 2 }, { el: "S", bond: 1.62, order: 2 }], "N") }),
  L({
    id: "SCN", aliases: ["scn", "scn-", "thiocyanato", "thiocyanato-s", "thiocyanato-κs", "tiyosiyanato", "tiyosiyanato-s", "thiocyanate", "tiyosiyanat"], formula: "SCN", atoms: { S: 1, C: 1, N: 1 }, charge: -1, electrons: 2, field: 0, en: "thiocyanato-κS", tr: "tiyosiyanato-κS", complexName: true, donors: ["S"],
    build: (f, [a], frame) => {
      const s = donor(f, frame, a, "S");
      const dir = bent(scale(a, -1), perpendicular(a), 100, a);
      const c = f.atom("C", add(f.p(s), scale(dir, 1.66)));
      f.bond(s, c);
      f.bond(c, f.atom("N", add(f.p(c), scale(dir, 1.16))), 3);
    },
  }),
  L({
    id: "N3", aliases: ["n3", "n3-", "azido", "azide", "azür", "azid"], formula: "N3", atoms: { N: 3 }, charge: -1, electrons: 2, field: 1, en: "azido", tr: "azido", complexName: false, donors: ["N"],
    build: (f, [a], frame) => {
      const n1 = donor(f, frame, a, "N");
      const dir = bent(scale(a, -1), perpendicular(a), 120, a);
      const n2 = f.atom("N", add(f.p(n1), scale(dir, 1.2)));
      f.bond(n1, n2, 2);
      f.bond(n2, f.atom("N", add(f.p(n2), scale(dir, 1.15))), 2);
    },
  }),
  L({
    id: "NO2", aliases: ["no2", "no2-", "nitro", "nitrito-n", "nitrito-κn"], formula: "NO2", atoms: { N: 1, O: 2 }, charge: -1, electrons: 2, field: 3, en: "nitrito-κN", tr: "nitrito-κN", complexName: true, donors: ["N"],
    build: (f, [a], frame) => {
      const n = donor(f, frame, a, "N");
      const u = perpendicular(a);
      f.bond(n, f.atom("O", add(f.p(n), scale(add(scale(a, 0.5), scale(u, 0.866)), 1.22))), 2);
      f.bond(n, f.atom("O", add(f.p(n), scale(add(scale(a, 0.5), scale(u, -0.866)), 1.22))));
    },
  }),
  L({ id: "NO", aliases: ["no", "no+", "nitrosyl", "nitrozil"], formula: "NO", atoms: { N: 1, O: 1 }, charge: 1, electrons: 2, field: 3, en: "nitrosyl", tr: "nitrozil", complexName: false, donors: ["N"], build: linear([{ el: "O", bond: 1.15, order: 2 }], "N", -0.3) }),
  L({ id: "N2", aliases: ["n2", "dinitrogen", "diazot", "azot"], formula: "N2", atoms: { N: 2 }, charge: 0, electrons: 2, field: 2, en: "dinitrogen", tr: "diazot", complexName: false, donors: ["N"], build: linear([{ el: "N", bond: 1.12, order: 3 }], "N", -0.25) }),
  L({ id: "MeCN", aliases: ["mecn", "ncme", "ch3cn", "acetonitrile", "asetonitril"], formula: "MeCN", atoms: { C: 2, H: 3, N: 1 }, charge: 0, electrons: 2, field: 2, en: "acetonitrile", tr: "asetonitril", complexName: true, donors: ["N"], build: linear([{ el: "C", bond: 1.15, order: 3 }], "N", 0, "Me") }),
  L({
    id: "py", aliases: ["py", "pyridine", "piridin", "c5h5n"], formula: "py", atoms: { C: 5, H: 5, N: 1 }, charge: 0, electrons: 2, field: 2, en: "pyridine", tr: "piridin", complexName: true, donors: ["N"],
    build: (f, [a], frame) => {
      const n = donor(f, frame, a, "N");
      f.aromaticHydrogens(ring6(f, n, a, perpendicular(a)));
    },
  }),
  L({
    id: "imid", aliases: ["im", "imid", "imidazole", "imidazol", "him", "c3h4n2"], formula: "Him", atoms: { C: 3, H: 4, N: 2 }, charge: 0, electrons: 2, field: 2, en: "1H-imidazole", tr: "1H-imidazol", complexName: true, donors: ["N"],
    build: (f, [a], frame) => {
      const n = donor(f, frame, a, "N");
      const ids = ring5(f, n, a, perpendicular(a), ["C", "N", "C", "C"], 1.36);
      f.aromaticHydrogens(ids);
      const centre = scale(add(add(f.p(ids[0]), f.p(ids[1])), add(add(f.p(ids[2]), f.p(ids[3])), f.p(ids[4]))), 0.2);
      f.bond(ids[2], f.atom("H", add(f.p(ids[2]), scale(unit(sub(f.p(ids[2]), centre)), 1.01))));
    },
  }),
  // C donors.
  L({ id: "CO", aliases: ["co", "carbonyl", "karbonil", "carbon monoxide"], formula: "CO", atoms: { C: 1, O: 1 }, charge: 0, electrons: 2, field: 3, en: "carbonyl", tr: "karbonil", complexName: false, donors: ["C"], build: linear([{ el: "O", bond: 1.14, order: 3 }], "C", -0.25) }),
  L({ id: "CS", aliases: ["cs", "thiocarbonyl", "tiyokarbonil"], formula: "CS", atoms: { C: 1, S: 1 }, charge: 0, electrons: 2, field: 3, en: "thiocarbonyl", tr: "tiyokarbonil", complexName: false, donors: ["C"], build: linear([{ el: "S", bond: 1.54, order: 3 }], "C", -0.25) }),
  L({ id: "CNMe", aliases: ["cnme", "mecn-c", "methyl isocyanide", "metil izosiyanür", "isocyanomethane", "izosiyanometan", "ch3nc"], formula: "CNMe", atoms: { C: 2, H: 3, N: 1 }, charge: 0, electrons: 2, field: 3, en: "isocyanomethane", tr: "izosiyanometan", complexName: true, donors: ["C"], build: linear([{ el: "N", bond: 1.16, order: 3 }], "C", -0.22, "Me") }),
  L({ id: "CH3", aliases: ["ch3", "ch3-", "me", "methyl", "metil", "methanido", "metanido"], formula: "CH3", atoms: { C: 1, H: 3 }, charge: -1, electrons: 2, field: 3, en: "methyl", tr: "metil", complexName: false, donors: ["C"], build: coneLigand("C", "H", 3, 1.09) }),
  L({
    id: "Ph", aliases: ["ph", "ph-", "c6h5", "c6h5-", "phenyl", "fenil"], formula: "Ph", atoms: { C: 6, H: 5 }, charge: -1, electrons: 2, field: 3, en: "phenyl", tr: "fenil", complexName: false, donors: ["C"],
    build: (f, [a], frame) => {
      const c = donor(f, frame, a, "C");
      // The ipso carbon is bonded to the metal: no H on it.
      f.aromaticHydrogens(ring6(f, c, a, perpendicular(a)).slice(1));
    },
  }),
  // P, As donors.
  L({ id: "PPh3", aliases: ["pph3", "triphenylphosphine", "triphenylphosphane", "trifenilfosfin", "trifenilfosfan", "p(c6h5)3"], formula: "PPh3", atoms: { P: 1, C: 18, H: 15 }, charge: 0, electrons: 2, field: 3, en: "triphenylphosphane", tr: "trifenilfosfan", complexName: true, donors: ["P"], build: phosphane("P", "Ph") }),
  L({ id: "PMe3", aliases: ["pme3", "trimethylphosphine", "trimethylphosphane", "trimetilfosfin", "trimetilfosfan", "p(ch3)3"], formula: "PMe3", atoms: { P: 1, C: 3, H: 9 }, charge: 0, electrons: 2, field: 3, en: "trimethylphosphane", tr: "trimetilfosfan", complexName: true, donors: ["P"], build: phosphane("P", "Me") }),
  L({ id: "PEt3", aliases: ["pet3", "triethylphosphine", "triethylphosphane", "trietilfosfin", "trietilfosfan", "p(c2h5)3"], formula: "PEt3", atoms: { P: 1, C: 6, H: 15 }, charge: 0, electrons: 2, field: 3, en: "triethylphosphane", tr: "trietilfosfan", complexName: true, donors: ["P"], build: phosphane("P", "Et") }),
  L({ id: "AsPh3", aliases: ["asph3", "triphenylarsine", "triphenylarsane", "trifenilarsin", "trifenilarsan"], formula: "AsPh3", atoms: { As: 1, C: 18, H: 15 }, charge: 0, electrons: 2, field: 3, en: "triphenylarsane", tr: "trifenilarsan", complexName: true, donors: ["As"], build: phosphane("As", "Ph") }),
  // Oxygen as a ligand.
  L({
    id: "superoxo", aliases: ["superoxo", "superoxido", "o2-", "süperokso", "süperoksido", "dioxygen", "o2 end-on"], formula: "O2", atoms: { O: 2 }, charge: -1, electrons: 2, field: 1, en: "superoxido", tr: "süperoksido", complexName: false, donors: ["O"],
    build: (f, [a], frame) => {
      const o = donor(f, frame, a, "O");
      f.bond(o, f.atom("O", add(f.p(o), scale(bent(scale(a, -1), perpendicular(a), 120, a), 1.28))), 2);
    },
  }),
  L({ id: "peroxo", aliases: ["peroxo", "peroxido", "o2 2-", "o22-", "peroksido", "perokso", "η2-o2", "eta2-o2"], formula: "O2", atoms: { O: 2 }, charge: -2, electrons: 4, field: 1, en: "η²-peroxido", tr: "η²-peroksido", complexName: true, pi: true, hapto: 2, donors: ["π"], build: (f, [a], frame) => void sideOn(f, frame, a, "O", 1.45, 1, 0.55) }),
  L({ id: "H2", aliases: ["h2", "dihydrogen", "dihidrojen", "η2-h2"], formula: "H2", atoms: { H: 2 }, charge: 0, electrons: 2, field: 3, en: "η²-dihydrogen", tr: "η²-dihidrojen", complexName: true, pi: true, hapto: 2, donors: ["π"], build: (f, [a], frame) => void sideOn(f, frame, a, "H", 0.82, 1, 0.65) }),
  // π ligands.
  L({
    id: "C2H4", aliases: ["c2h4", "ethene", "ethylene", "eten", "etilen", "η2-c2h4", "eta2-c2h4"], formula: "C2H4", atoms: { C: 2, H: 4 }, charge: 0, electrons: 2, field: 3, en: "η²-ethene", tr: "η²-eten", complexName: true, pi: true, hapto: 2, donors: ["π"],
    build: (f, [a], frame) => {
      const [c1, c2] = sideOn(f, frame, a, "C", 1.37, 2, 0.35);
      const t = unit(sub(f.p(c1), f.p(c2)));
      const n = unit(cross(a, t));
      for (const [c, sign] of [[c1, 1], [c2, -1]] as [number, number][]) {
        for (const side of [1, -1]) f.bond(c, f.atom("H", add(f.p(c), scale(unit(add(add(scale(t, sign * 0.5), scale(n, side * 0.85)), scale(a, 0.3))), 1.08))));
      }
    },
  }),
  L({
    id: "C2H2", aliases: ["c2h2", "ethyne", "acetylene", "etin", "asetilen", "η2-c2h2"], formula: "C2H2", atoms: { C: 2, H: 2 }, charge: 0, electrons: 2, field: 3, en: "η²-ethyne", tr: "η²-etin", complexName: true, pi: true, hapto: 2, donors: ["π"],
    build: (f, [a], frame) => {
      const [c1, c2] = sideOn(f, frame, a, "C", 1.28, 3, 0.3);
      const t = unit(sub(f.p(c1), f.p(c2)));
      for (const [c, sign] of [[c1, 1], [c2, -1]] as [number, number][]) f.bond(c, f.atom("H", add(f.p(c), scale(unit(add(scale(t, sign * 0.8), scale(a, 0.6))), 1.06))));
    },
  }),
  L({
    id: "allyl", pattern: "chelate", donors: ["π", "π"], aliases: ["allyl", "allil", "c3h5", "η3-c3h5", "η3-allyl", "eta3-allyl"], formula: "C3H5", atoms: { C: 3, H: 5 }, charge: -1, electrons: 4, field: 3, en: "η³-allyl", tr: "η³-allil", complexName: true, pi: true, hapto: 3,
    build: (f, [a1, a2], frame) => {
      // The two end carbons near the two sites (bite ≈ 70°), the middle one lifted off the plane.
      const reach = frame.reach("C", 0) + 0.02;
      const toward = (x: Vec, y: Vec) => unit(add(scale(x, 0.85), scale(y, 0.15)));
      const c1 = f.atom("C", add(origin(frame), scale(toward(a1, a2), reach)));
      const c3 = f.atom("C", add(origin(frame), scale(toward(a2, a1), reach)));
      const n = unit(cross(a1, a2));
      const out = unit(add(a1, a2));
      const mid = scale(add(f.p(c1), f.p(c3)), 0.5);
      const c2 = f.atom("C", add(mid, add(scale(out, 0.15), scale(n, 0.72))));
      f.bond(c1, c2, 1.5);
      f.bond(c2, c3, 1.5);
      for (const c of [c1, c2, c3]) f.links.push({ atom: c, order: 1, kind: "eta" });
      f.bond(c2, f.atom("H", add(f.p(c2), scale(unit(add(n, scale(out, 0.6))), 1.08))));
      // Each end carbon is sp²: its two H lie in the allyl plane, 120° from the C–C bond (syn and anti).
      const plane = unit(cross(sub(f.p(c2), f.p(c1)), sub(f.p(c3), f.p(c1))));
      for (const c of [c1, c3]) {
        const back = unit(sub(f.p(c2), f.p(c)));
        for (const turn of [120, -120]) f.bond(c, f.atom("H", add(f.p(c), scale(rotate(back, plane, turn * DEG), 1.08))));
      }
    },
  }),
  L({
    id: "butadiene", aliases: ["butadiene", "bütadien", "butadien", "c4h6", "η4-c4h6", "buta-1,3-diene"], formula: "C4H6", atoms: { C: 4, H: 6 }, charge: 0, electrons: 4, field: 3, en: "η⁴-buta-1,3-diene", tr: "η⁴-buta-1,3-dien", complexName: true, pi: true, hapto: 4, donors: ["π"],
    build: (f, [a], frame) => {
      const base = add(origin(frame), scale(a, frame.reach("C", 0) - 0.76 + 0.3));
      const t = perpendicular(a);
      const n = cross(a, t);
      const pts: Vec[] = [add(base, add(scale(t, -1.42), scale(n, -0.6))), add(base, add(scale(t, -0.7), scale(n, 0.55))), add(base, add(scale(t, 0.7), scale(n, 0.55))), add(base, add(scale(t, 1.42), scale(n, -0.6)))];
      const ids = pts.map((p) => f.atom("C", p));
      f.bond(ids[0], ids[1], 1.5);
      f.bond(ids[1], ids[2], 1.5);
      f.bond(ids[2], ids[3], 1.5);
      ids.forEach((c) => f.links.push({ atom: c, order: 1, kind: "eta" }));
      const centre = scale(pts.reduce<Vec>((s, p) => add(s, p), [0, 0, 0]), 0.25);
      for (const i of [1, 2]) f.bond(ids[i], f.atom("H", add(f.p(ids[i]), scale(unit(add(sub(f.p(ids[i]), centre), scale(a, 0.3))), 1.08))));
      for (const i of [0, 3]) {
        const out = unit(sub(f.p(ids[i]), centre));
        for (const side of [1, -1]) f.bond(ids[i], f.atom("H", add(f.p(ids[i]), scale(unit(add(out, add(scale(a, 0.3), scale(cross(out, a), side * 0.8)))), 1.08))));
      }
    },
  }),
  L({ id: "C4H4", aliases: ["c4h4", "cyclobutadiene", "siklobütadien", "η4-c4h4"], formula: "C4H4", atoms: { C: 4, H: 4 }, charge: 0, electrons: 4, field: 3, en: "η⁴-cyclobutadiene", tr: "η⁴-siklobütadien", complexName: true, pi: true, hapto: 4, donors: ["π"], build: (f, [a], frame) => void piRing(f, frame, a, 4, 1.02, 0.45) }),
  L({ id: "Cp", aliases: ["cp", "cp-", "c5h5", "c5h5-", "cyclopentadienyl", "siklopentadienil", "η5-cp", "eta5-cp", "η5-c5h5"], formula: "C5H5", atoms: { C: 5, H: 5 }, charge: -1, electrons: 6, field: 3, en: "η⁵-cyclopentadienyl", tr: "η⁵-siklopentadienil", complexName: true, pi: true, hapto: 5, donors: ["π"], build: (f, [a], frame) => void piRing(f, frame, a, 5, 1.21, 0.33) }),
  L({ id: "Cp*", aliases: ["cp*", "cpstar", "c5me5", "c5(ch3)5", "pentamethylcyclopentadienyl", "pentametilsiklopentadienil", "η5-c5me5"], formula: "C5Me5", atoms: { C: 10, H: 15 }, charge: -1, electrons: 6, field: 3, en: "η⁵-pentamethylcyclopentadienyl", tr: "η⁵-pentametilsiklopentadienil", complexName: true, pi: true, hapto: 5, donors: ["π"], build: (f, [a], frame) => void piRing(f, frame, a, 5, 1.21, 0.33, "Me") }),
  L({ id: "C6H6", aliases: ["c6h6", "benzene", "benzen", "η6-c6h6", "eta6-c6h6", "η6-benzene"], formula: "C6H6", atoms: { C: 6, H: 6 }, charge: 0, electrons: 6, field: 3, en: "η⁶-benzene", tr: "η⁶-benzen", complexName: true, pi: true, hapto: 6, donors: ["π"], build: (f, [a], frame) => void piRing(f, frame, a, 6, 1.39, 0.3) }),
  L({ id: "C7H7", aliases: ["c7h7", "c7h7+", "tropylium", "tropilyum", "cycloheptatrienyl", "sikloheptatrienil", "η7-c7h7"], formula: "C7H7", atoms: { C: 7, H: 7 }, charge: 1, electrons: 6, field: 3, en: "η⁷-cycloheptatrienyl", tr: "η⁷-sikloheptatrienil", complexName: true, pi: true, hapto: 7, donors: ["π"], build: (f, [a], frame) => void piRing(f, frame, a, 7, 1.61, 0.15) }),
  L({ id: "C8H8", aliases: ["c8h8", "c8h8 2-", "c8h82-", "cot", "cyclooctatetraene", "cyclooctatetraenide", "siklooktatetraen", "η8-c8h8"], formula: "C8H8", atoms: { C: 8, H: 8 }, charge: -2, electrons: 10, field: 3, en: "η⁸-cyclooctatetraenide", tr: "η⁸-siklooktatetraenid", complexName: true, pi: true, hapto: 8, donors: ["π"], build: (f, [a], frame) => void piRing(f, frame, a, 8, 1.83, -0.05) }),
  // Bidentate.
  L({
    id: "en", pattern: "chelate", donors: ["N", "N"], aliases: ["en", "ethylenediamine", "etilendiamin", "ethane-1,2-diamine", "etan-1,2-diamin", "1,2-diaminoethane"], formula: "en", atoms: { C: 2, H: 8, N: 2 }, charge: 0, electrons: 4, field: 2, en: "ethane-1,2-diamine", tr: "etan-1,2-diamin", complexName: true,
    build: chelate(["N", "N"], [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.49, (f, d1, d2, ids, _ring, frame) => {
      twoHydrogens(f, d1, origin(frame), f.p(ids[0]), 1.01);
      twoHydrogens(f, d2, origin(frame), f.p(ids[1]), 1.01);
    }),
  }),
  L({
    id: "tmeda", pattern: "chelate", donors: ["N", "N"], aliases: ["tmeda", "tmen", "tetramethylethylenediamine", "tetrametiletilendiamin"], formula: "tmeda", atoms: { C: 6, H: 16, N: 2 }, charge: 0, electrons: 4, field: 2, en: "N,N,N′,N′-tetramethylethane-1,2-diamine", tr: "N,N,N′,N′-tetrametiletan-1,2-diamin", complexName: true,
    build: chelate(["N", "N"], [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.49, (f, d1, d2, ids, _ring, frame) => {
      dimethylAmine(f, d1, origin(frame), f.p(ids[0]));
      dimethylAmine(f, d2, origin(frame), f.p(ids[1]));
    }),
  }),
  L({ id: "acac", pattern: "chelate", donors: ["O", "O"], aliases: ["acac", "acac-", "acetylacetonate", "acetylacetonato", "asetilasetonat", "asetilasetonato", "pentane-2,4-dionato", "2,4-pentanedionato", "pentan-2,4-dionato"], formula: "acac", atoms: { C: 5, H: 7, O: 2 }, charge: -1, electrons: 4, field: 1, en: "acetylacetonato", tr: "asetilasetonato", complexName: true, build: chelate(["O", "O"], [{ el: "C", hang: "Me" }, { el: "C", hang: "H" }, { el: "C", hang: "Me" }], [2, 1, 2, 1], 1.37) }),
  L({ id: "hfac", pattern: "chelate", donors: ["O", "O"], aliases: ["hfac", "hfacac", "hexafluoroacetylacetonate", "hexafluoroacetylacetonato", "hekzafloroasetilasetonato"], formula: "hfac", atoms: { C: 5, H: 1, F: 6, O: 2 }, charge: -1, electrons: 4, field: 1, en: "hexafluoroacetylacetonato", tr: "hekzafloroasetilasetonato", complexName: true, build: chelate(["O", "O"], [{ el: "C", hang: "CF3" }, { el: "C", hang: "H" }, { el: "C", hang: "CF3" }], [2, 1, 2, 1], 1.37) }),
  L({ id: "ox", pattern: "chelate", donors: ["O", "O"], aliases: ["ox", "ox2-", "oxalate", "oxalato", "oksalat", "oksalato", "okzalat", "okzalato", "c2o4", "c2o4 2-"], formula: "ox", atoms: { C: 2, O: 4 }, charge: -2, electrons: 4, field: 1, en: "oxalato", tr: "oksalato", complexName: true, build: chelate(["O", "O"], [{ el: "C", hang: "O" }, { el: "C", hang: "O" }], [1, 1, 1], 1.4) }),
  L({ id: "mal", pattern: "chelate", donors: ["O", "O"], aliases: ["mal", "malonate", "malonato", "malonat"], formula: "mal", atoms: { C: 3, H: 2, O: 4 }, charge: -2, electrons: 4, field: 1, en: "malonato", tr: "malonato", complexName: true, build: chelate(["O", "O"], [{ el: "C", hang: "O" }, { el: "C", hang: "H2" }, { el: "C", hang: "O" }], [1, 1, 1, 1], 1.45) }),
  L({ id: "CO3", pattern: "chelate", donors: ["O", "O"], aliases: ["co3", "co3 2-", "co3^2-", "carbonate", "carbonato", "karbonat", "karbonato"], formula: "CO3", atoms: { C: 1, O: 3 }, charge: -2, electrons: 4, field: 1, en: "carbonato", tr: "karbonato", complexName: false, build: chelate(["O", "O"], [{ el: "C", hang: "O" }], [1, 1], 1.29) }),
  L({ id: "OAc2", pattern: "chelate", donors: ["O", "O"], aliases: ["oac2", "κ2-oac", "acetato-κ2o,o'", "chelating acetate", "şelat asetat", "asetato-κ2"], formula: "OAc", atoms: { C: 2, H: 3, O: 2 }, charge: -1, electrons: 4, field: 1, en: "acetato-κ²O,O′", tr: "asetato-κ²O,O′", complexName: true, build: chelate(["O", "O"], [{ el: "C", hang: "Me" }], [1.5, 1.5], 1.27) }),
  L({ id: "NO3κ2", pattern: "chelate", donors: ["O", "O"], aliases: ["no3κ2", "κ2-no3", "nitrato-κ2o,o'", "bidentate nitrate", "iki dişli nitrat", "nitrato-κ2"], formula: "NO3", atoms: { N: 1, O: 3 }, charge: -1, electrons: 4, field: 1, en: "nitrato-κ²O,O′", tr: "nitrato-κ²O,O′", complexName: true, build: chelate(["O", "O"], [{ el: "N", hang: "O" }], [1.5, 1.5], 1.27) }),
  L({
    id: "gly", pattern: "chelate", donors: ["N", "O"], aliases: ["gly", "gly-", "glycinate", "glycinato", "glisinat", "glisinato"], formula: "gly", atoms: { C: 2, H: 4, N: 1, O: 2 }, charge: -1, electrons: 4, field: 2, en: "glycinato", tr: "glisinato", complexName: true,
    build: chelate(["N", "O"], [{ el: "C", hang: "H2" }, { el: "C", hang: "O" }], [1, 1, 1], 1.45, (f, d1, _d2, ids, _ring, frame) => twoHydrogens(f, d1, origin(frame), f.p(ids[0]), 1.01)),
  }),
  L({
    id: "dmg", pattern: "chelate", donors: ["N", "N"], aliases: ["dmg", "dmgh", "dmgh-", "dimethylglyoximate", "dimethylglyoximato", "dimetilglioksimat", "dimetilglioksimato"], formula: "dmgH", atoms: { C: 4, H: 7, N: 2, O: 2 }, charge: -1, electrons: 4, field: 3, en: "dimethylglyoximato", tr: "dimetilglioksimato", complexName: true,
    build: chelate(["N", "N"], [{ el: "C", hang: "Me" }, { el: "C", hang: "Me" }], [2, 1, 2], 1.43, (f, d1, d2, ids, _ring, frame) => {
      [d1, d2].forEach((n, i) => {
        const out = unit(add(unit(sub(f.p(n), origin(frame))), unit(sub(f.p(n), f.p(ids[i])))));
        const o = f.atom("O", add(f.p(n), scale(out, 1.35)));
        f.bond(n, o);
        if (i === 0) f.bond(o, f.atom("H", add(f.p(o), scale(unit(add(out, scale(unit(sub(f.p(d2), f.p(d1))), 0.9))), 0.97))));
      });
    }),
  }),
  L({ id: "bipy", pattern: "chelate", donors: ["N", "N"], aliases: ["bipy", "bpy", "bipyridine", "2,2'-bipyridine", "2,2′-bipyridine", "bipiridin", "2,2'-bipiridin"], formula: "bipy", atoms: { C: 10, H: 8, N: 2 }, charge: 0, electrons: 4, field: 3, en: "2,2′-bipyridine", tr: "2,2′-bipiridin", complexName: true, build: bipyridine(false) }),
  L({ id: "phen", pattern: "chelate", donors: ["N", "N"], aliases: ["phen", "phenanthroline", "1,10-phenanthroline", "fenantrolin", "1,10-fenantrolin", "o-phen"], formula: "phen", atoms: { C: 12, H: 8, N: 2 }, charge: 0, electrons: 4, field: 3, en: "1,10-phenanthroline", tr: "1,10-fenantrolin", complexName: true, build: bipyridine(true) }),
  L({
    id: "q", pattern: "chelate", donors: ["N", "O"], aliases: ["q", "ox-", "oxine", "oksin", "8-hydroxyquinolinate", "quinolin-8-olato", "8-quinolinolato", "kinolin-8-olato", "8-kinolinolato"], formula: "q", atoms: { C: 9, H: 6, N: 1, O: 1 }, charge: -1, electrons: 4, field: 2, en: "quinolin-8-olato", tr: "kinolin-8-olato", complexName: true,
    build: chelate(["N", "O"], [{ el: "C" }, { el: "C" }], [1.5, 1.5, 1], 1.4, (f, n, _o, [c8a, c8], ring) => {
      const pyridine = hexagonOn(f.p(n), f.p(c8a), ring.ringCentre, ring.normal).map((p) => f.atom("C", p));
      [n, ...pyridine, c8a].forEach((id, i, all) => f.bond(id, all[(i + 1) % all.length], 1.5));
      const benzene = hexagonOn(f.p(c8a), f.p(c8), ring.ringCentre, ring.normal).map((p) => f.atom("C", p));
      [c8a, ...benzene, c8].forEach((id, i, all) => f.bond(id, all[(i + 1) % all.length], 1.5));
      f.merge();
      f.aromaticHydrogens();
    }),
  }),
  L({
    id: "pic", pattern: "chelate", donors: ["N", "O"], aliases: ["pic", "picolinate", "picolinato", "pikolinat", "pikolinato", "pyridine-2-carboxylato"], formula: "pic", atoms: { C: 6, H: 4, N: 1, O: 2 }, charge: -1, electrons: 4, field: 2, en: "pyridine-2-carboxylato", tr: "piridin-2-karboksilato", complexName: true,
    build: chelate(["N", "O"], [{ el: "C" }, { el: "C", hang: "O" }], [1.5, 1, 1], 1.42, (f, n, _o, [c2], ring) => {
      const pyridine = hexagonOn(f.p(n), f.p(c2), ring.ringCentre, ring.normal).map((p) => f.atom("C", p));
      [n, ...pyridine, c2].forEach((id, i, all) => f.bond(id, all[(i + 1) % all.length], 1.5));
      f.aromaticHydrogens();
    }),
  }),
  L({
    id: "cat", pattern: "chelate", donors: ["O", "O"], aliases: ["cat", "catecholate", "catecholato", "katekolat", "katekolato", "benzene-1,2-diolato"], formula: "cat", atoms: { C: 6, H: 4, O: 2 }, charge: -2, electrons: 4, field: 1, en: "benzene-1,2-diolato", tr: "benzen-1,2-diolato", complexName: true,
    build: chelate(["O", "O"], [{ el: "C" }, { el: "C" }], [1, 1.5, 1], 1.39, (f, _o1, _o2, [c1, c2], ring) => {
      benzo(f, c1, c2, ring.ringCentre, ring.normal);
      f.aromaticHydrogens();
    }),
  }),
  L({
    id: "dtc", pattern: "chelate", donors: ["S", "S"], aliases: ["dtc", "me2dtc", "dimethyldithiocarbamate", "dimethyldithiocarbamato", "dimetilditiyokarbamat", "dimetilditiyokarbamato", "dithiocarbamate"], formula: "Me2dtc", atoms: { C: 3, H: 6, N: 1, S: 2 }, charge: -1, electrons: 4, field: 0, en: "dimethyldithiocarbamato", tr: "dimetilditiyokarbamato", complexName: true,
    build: chelate(["S", "S"], [{ el: "C" }], [1.5, 1.5], 1.72, (f, _s1, _s2, [c], ring) => {
      const out = unit(sub(f.p(c), ring.ringCentre));
      const n = f.atom("N", add(f.p(c), scale(out, 1.33)));
      f.bond(c, n, 1.5);
      for (const angle of [120, -120]) methyl(f, n, rotate(scale(out, -1), ring.normal, angle * DEG), "H", 1.46);
    }),
  }),
  L({
    id: "dppe", pattern: "chelate", donors: ["P", "P"], aliases: ["dppe", "diphos", "1,2-bis(diphenylphosphino)ethane", "bis(diphenylphosphanyl)ethane", "bis(difenilfosfino)etan"], formula: "dppe", atoms: { C: 26, H: 24, P: 2 }, charge: 0, electrons: 4, field: 3, en: "ethane-1,2-diylbis(diphenylphosphane)", tr: "etan-1,2-diilbis(difenilfosfan)", complexName: true,
    build: chelate(["P", "P"], [{ el: "C", hang: "H2" }, { el: "C", hang: "H2" }], [1, 1, 1], 1.7, (f, p1, p2, ids, _ring, frame) => {
      diphenyl(f, p1, origin(frame), f.p(ids[0]));
      diphenyl(f, p2, origin(frame), f.p(ids[1]));
    }),
  }),
  L({
    id: "dppm", pattern: "chelate", donors: ["P", "P"], aliases: ["dppm", "bis(diphenylphosphino)methane", "bis(difenilfosfino)metan"], formula: "dppm", atoms: { C: 25, H: 22, P: 2 }, charge: 0, electrons: 4, field: 3, en: "methylenebis(diphenylphosphane)", tr: "metilenbis(difenilfosfan)", complexName: true,
    build: chelate(["P", "P"], [{ el: "C", hang: "H2" }], [1, 1], 1.84, (f, p1, p2, ids, _ring, frame) => {
      diphenyl(f, p1, origin(frame), f.p(ids[0]));
      diphenyl(f, p2, origin(frame), f.p(ids[0]));
    }),
  }),
  L({ id: "cod", pattern: "chelate", donors: ["π", "π"], aliases: ["cod", "1,5-cod", "cyclooctadiene", "cycloocta-1,5-diene", "siklooktadien", "siklookta-1,5-dien"], formula: "cod", atoms: { C: 8, H: 12 }, charge: 0, electrons: 4, field: 3, en: "η⁴-cycloocta-1,5-diene", tr: "η⁴-siklookta-1,5-dien", complexName: true, pi: true, hapto: 4, build: cyclooctadiene }),
  // Tridentate.
  L({ id: "dien", pattern: "chain3", donors: ["N", "Nc", "N"], aliases: ["dien", "diethylenetriamine", "dietilentriamin", "n-(2-aminoethyl)ethane-1,2-diamine"], formula: "dien", atoms: { C: 4, H: 13, N: 3 }, charge: 0, electrons: 6, field: 2, en: "N-(2-aminoethyl)ethane-1,2-diamine", tr: "dietilentriamin", complexName: true, build: triamine("amine") }),
  L({ id: "ida", pattern: "chain3", donors: ["O", "N", "O"], aliases: ["ida", "iminodiacetate", "iminodiacetato", "iminodiasetat", "iminodiasetato"], formula: "ida", atoms: { C: 4, H: 5, N: 1, O: 4 }, charge: -2, electrons: 6, field: 2, en: "2,2′-azanediyldiacetato", tr: "iminodiasetato", complexName: true, build: triamine("acetate") }),
  L({ id: "terpy", pattern: "chain3", span: "mer", donors: ["N", "Nc", "N"], aliases: ["terpy", "tpy", "terpyridine", "2,2':6',2''-terpyridine", "terpiridin"], formula: "terpy", atoms: { C: 15, H: 11, N: 3 }, charge: 0, electrons: 6, field: 3, en: "2,2′:6′,2″-terpyridine", tr: "2,2′:6′,2″-terpiridin", complexName: true, build: terpyridine }),
  L({ id: "tacn", pattern: "ring3", donors: ["N", "N", "N"], aliases: ["tacn", "triazacyclononane", "1,4,7-triazacyclononane", "triazasiklononan"], formula: "tacn", atoms: { C: 6, H: 15, N: 3 }, charge: 0, electrons: 6, field: 3, en: "1,4,7-triazonane", tr: "1,4,7-triazasiklononan", complexName: true, build: triazacyclononane }),
  // Tetradentate.
  L({ id: "por", pattern: "ring4", donors: ["N", "N", "N", "N"], aliases: ["por", "porphyrin", "porphine", "porphyrinato", "porfirin", "porfirinato", "porfin", "p2-"], formula: "por", atoms: { C: 20, H: 12, N: 4 }, charge: -2, electrons: 8, field: 2, en: "porphyrinato", tr: "porfirinato", complexName: true, build: porphyrin("porphine") }),
  L({ id: "tpp", pattern: "ring4", donors: ["N", "N", "N", "N"], aliases: ["tpp", "tetraphenylporphyrin", "tetraphenylporphyrinato", "tetrafenilporfirin", "tetrafenilporfirinato"], formula: "tpp", atoms: { C: 44, H: 28, N: 4 }, charge: -2, electrons: 8, field: 2, en: "5,10,15,20-tetraphenylporphyrinato", tr: "5,10,15,20-tetrafenilporfirinato", complexName: true, build: porphyrin("tpp") }),
  L({ id: "pc", pattern: "ring4", donors: ["N", "N", "N", "N"], aliases: ["pc", "phthalocyanine", "phthalocyaninato", "ftalosiyanin", "ftalosiyaninato"], formula: "pc", atoms: { C: 32, H: 16, N: 8 }, charge: -2, electrons: 8, field: 2, en: "phthalocyaninato", tr: "ftalosiyaninato", complexName: true, build: porphyrin("pc") }),
  L({ id: "salen", pattern: "ring4", donors: ["O", "N", "N", "O"], aliases: ["salen", "salen2-", "n,n'-bis(salicylidene)ethylenediamine", "salisilidenetilendiamin"], formula: "salen", atoms: { C: 16, H: 14, N: 2, O: 2 }, charge: -2, electrons: 8, field: 2, en: "N,N′-bis(salicylidene)ethane-1,2-diaminato", tr: "N,N′-bis(salisiliden)etan-1,2-diaminato", complexName: true, build: salen }),
  L({ id: "cyclam", pattern: "ring4", donors: ["N", "N", "N", "N"], aliases: ["cyclam", "siklam", "1,4,8,11-tetraazacyclotetradecane", "tetraazasiklotetradekan"], formula: "cyclam", atoms: { C: 10, H: 24, N: 4 }, charge: 0, electrons: 8, field: 2, en: "1,4,8,11-tetraazacyclotetradecane", tr: "1,4,8,11-tetraazasiklotetradekan", complexName: true, build: cyclam }),
  L({ id: "tren", pattern: "tripod4", donors: ["Na", "N", "N", "N"], aliases: ["tren", "tris(2-aminoethyl)amine", "tris(2-aminoetil)amin"], formula: "tren", atoms: { C: 6, H: 18, N: 4 }, charge: 0, electrons: 8, field: 2, en: "tris(2-aminoethyl)amine", tr: "tris(2-aminoetil)amin", complexName: true, build: tripod("amine") }),
  L({ id: "nta", pattern: "tripod4", donors: ["N", "O", "O", "O"], aliases: ["nta", "nitrilotriacetate", "nitrilotriacetato", "nitrilotriasetat", "nitrilotriasetato"], formula: "nta", atoms: { C: 6, H: 6, N: 1, O: 6 }, charge: -3, electrons: 8, field: 2, en: "2,2′,2″-nitrilotriacetato", tr: "nitrilotriasetato", complexName: true, build: tripod("acetate") }),
  // Six sites.
  L({ id: "EDTA", pattern: "edta", donors: ["N", "N", "O", "O", "O", "O"], aliases: ["edta", "edta4-", "edta 4-", "ethylenediaminetetraacetate", "ethylenediaminetetraacetato", "etilendiamintetraasetat", "etilendiamintetraasetato"], formula: "EDTA", atoms: { C: 10, H: 12, N: 2, O: 8 }, charge: -4, electrons: 12, field: 2, en: "ethylenediaminetetraacetato", tr: "etilendiamintetraasetato", complexName: true, build: edta }),
  L({ id: "18-crown-6", pattern: "ring6", donors: ["O", "O", "O", "O", "O", "O"], aliases: ["18-crown-6", "18c6", "18-taç-6", "18-tac-6", "crown", "crown ether", "taç eter"], formula: "18-crown-6", atoms: { C: 12, H: 24, O: 6 }, charge: 0, electrons: 12, field: 1, en: "1,4,7,10,13,16-hexaoxacyclooctadecane", tr: "18-taç-6", complexName: true, build: crown }),
];

/** Lower case without Turkish casing ("I" stays "i", as iodide's symbol must), no spaces or carets. */
export function normalName(text: string): string {
  return text
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[\s_]/g, "")
    .replace(/[⁻−–]/g, "-")
    .replace(/[′’]/g, "'")
    .replace(/\^/g, "")
    .replace(/[₀-₉]/g, (d) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(d)));
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** A ligand by any of its names; a slightly misspelt long name ("etilendiyamin") is forgiven. */
export function findLigand(name: string): LigandDef | null {
  const wanted = normalName(name);
  if (!wanted) return null;
  const exact = LIGANDS.find((ligand) => normalName(ligand.id) === wanted || ligand.aliases.some((alias) => normalName(alias) === wanted));
  if (exact) return exact;
  if (wanted.length < 6) return null;
  let best: { ligand: LigandDef; d: number } | null = null;
  for (const ligand of LIGANDS) {
    for (const alias of ligand.aliases) {
      const a = normalName(alias);
      if (a.length < 6) continue;
      const d = editDistance(wanted, a);
      if (d <= Math.max(1, Math.floor(a.length / 8)) && (!best || d < best.d)) best = { ligand, d };
    }
  }
  return best?.ligand ?? null;
}

export const LIGAND_IDS = LIGANDS.map((ligand) => ligand.id);
