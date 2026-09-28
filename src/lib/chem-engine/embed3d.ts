// Chem+ app: a molecule's 3D shape from RDKit's 2D drawing - RDKit's WebAssembly build draws in 2D
// only, so the app lifts the drawing into 3D itself.
//
// Every atom starts where the 2D depiction put it (hydrogens included), wedged bonds lifted up and
// hashed ones pushed down, and a light relaxation then pulls the model into shape by distances
// alone: bond lengths from covalent radii, 1-3 distances from each atom's hybridisation (sp 180°,
// sp² 120°, sp³ 109.5°), the 1-4 distances across double bonds taken from the flat drawing (which
// keeps them planar and cis stays cis), atoms that are not neighbours kept apart, and the
// handedness of each wedged centre held. It is a model for looking at, not an optimised conformer.

import { add, covalentRadius, cross, dot, length, scale, sub, type Model3D, type ModelBond, type Vec } from "./model3d";
import { dGroup, isFBlock } from "./metals";

export interface FlatAtom {
  el: string;
  x: number;
  y: number;
}

export interface FlatBond {
  a: number;
  b: number;
  order: 1 | 2 | 3;
  /** Molfile bond stereo: 1 wedge (up from a), 6 hash (down from a). */
  stereo: number;
}

export type Hybridisation = "sp" | "sp2" | "sp3";

export interface Embedded {
  model: Model3D;
  hybridisation: Hybridisation[];
}

/** V3000 molfile → atoms and bonds (dative bonds, type 9, count as single bonds). */
function readV3000(lines: string[]): { atoms: FlatAtom[]; bonds: FlatBond[] } | null {
  // Long V3000 lines continue on the next one after a trailing "-".
  const joined: string[] = [];
  for (const line of lines) {
    const body = line.startsWith("M  V30 ") ? line.slice(7) : null;
    if (body === null) continue;
    if (joined.length && joined[joined.length - 1].endsWith("-")) joined[joined.length - 1] = joined[joined.length - 1].slice(0, -1) + body;
    else joined.push(body);
  }
  const atoms: FlatAtom[] = [];
  const bonds: FlatBond[] = [];
  let section = "";
  for (const line of joined) {
    if (line.startsWith("BEGIN ")) section = line.slice(6).trim();
    else if (line.startsWith("END ")) section = "";
    else if (section === "ATOM") {
      const [, el, x, y] = line.trim().split(/\s+/);
      atoms.push({ el, x: Number(x), y: Number(y) });
    } else if (section === "BOND") {
      const parts = line.trim().split(/\s+/);
      const type = Number(parts[1]);
      const cfg = line.match(/CFG=(\d)/);
      bonds.push({
        a: Number(parts[2]) - 1,
        b: Number(parts[3]) - 1,
        order: (type >= 1 && type <= 3 ? type : 1) as 1 | 2 | 3,
        stereo: cfg ? (cfg[1] === "1" ? 1 : cfg[1] === "3" ? 6 : 0) : 0,
      });
    }
  }
  return atoms.length ? { atoms, bonds } : null;
}

/** Molfile (V2000 or V3000) → atoms and bonds, the formats RDKit's MinimalLib hands back with coordinates. */
export function readMolblock(molblock: string): { atoms: FlatAtom[]; bonds: FlatBond[] } | null {
  const lines = molblock.split(/\r?\n/);
  const counts = lines[3];
  if (counts && /V3000/.test(counts)) return readV3000(lines);
  if (!counts || !/V2000/.test(counts)) return null;
  const nAtoms = Number(counts.slice(0, 3));
  const nBonds = Number(counts.slice(3, 6));
  const atoms: FlatAtom[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i];
    atoms.push({ x: Number(line.slice(0, 10)), y: Number(line.slice(10, 20)), el: line.slice(31, 34).trim() });
  }
  const bonds: FlatBond[] = [];
  for (let i = 0; i < nBonds; i++) {
    const line = lines[4 + nAtoms + i];
    const type = Number(line.slice(6, 9));
    bonds.push({ a: Number(line.slice(0, 3)) - 1, b: Number(line.slice(3, 6)) - 1, order: (type >= 1 && type <= 3 ? type : 1) as 1 | 2 | 3, stereo: Number(line.slice(9, 12)) || 0 });
  }
  return { atoms, bonds };
}

const VDW: Record<string, number> = { H: 1.1, C: 1.7, N: 1.55, O: 1.52, F: 1.47, S: 1.8, P: 1.8, Cl: 1.75, Br: 1.85, I: 1.98 };

const MAIN_GROUP_METALS = new Set(["Li", "Na", "K", "Rb", "Cs", "Be", "Mg", "Ca", "Sr", "Ba", "Al", "Ga", "In", "Tl"]);

/** Metals take the geometry of their coordination, not an sp/sp²/sp³ angle. */
export function isMetalAtom(el: string): boolean {
  return dGroup(el) !== null || isFBlock(el) || MAIN_GROUP_METALS.has(el);
}

/** d⁸ metals drawn with four neighbours are square planar (Pt(II), Pd(II), Au(III)). */
const SQUARE_PLANAR = new Set(["Pt", "Pd", "Au"]);

/** The smallest angle between neighbours on the ideal polyhedron of n (spread evenly round a metal). */
const SPREAD: Record<number, number> = { 3: 120, 4: 109.47, 5: 90, 6: 90, 7: 72, 8: 70, 9: 66, 10: 60, 11: 58, 12: 55 };

interface Constraint {
  i: number;
  j: number;
  target: number;
  weight: number;
  /** Only pushes apart, never pulls together. */
  repel?: boolean;
}

export function embed3d(atoms: FlatAtom[], bonds: FlatBond[]): Embedded {
  const n = atoms.length;
  const neighbours: number[][] = atoms.map(() => []);
  const orderOf = new Map<string, number>();
  for (const bond of bonds) {
    neighbours[bond.a].push(bond.b);
    neighbours[bond.b].push(bond.a);
    orderOf.set(`${Math.min(bond.a, bond.b)}-${Math.max(bond.a, bond.b)}`, bond.order);
  }
  const order = (a: number, b: number) => orderOf.get(`${Math.min(a, b)}-${Math.max(a, b)}`) ?? 1;

  const hybridisation: Hybridisation[] = atoms.map((_, i) => {
    const orders = neighbours[i].map((j) => order(i, j));
    if (orders.includes(3) || orders.filter((o) => o === 2).length >= 2) return "sp";
    if (orders.includes(2)) return "sp2";
    return "sp3";
  });
  const angleOf = (i: number) => (hybridisation[i] === "sp" ? 180 : hybridisation[i] === "sp2" ? 120 : 109.47) * (Math.PI / 180);
  const bondLength = (a: number, b: number) => {
    const o = order(a, b);
    const metal = isMetalAtom(atoms[a].el) || isMetalAtom(atoms[b].el);
    return covalentRadius(atoms[a].el) + covalentRadius(atoms[b].el) - (metal ? 0.08 : o === 3 ? 0.32 : o === 2 ? 0.19 : 0);
  };

  // The flat drawing in ångström (its bonds scaled to their real average length).
  const heavy = bonds.filter((bond) => atoms[bond.a].el !== "H" && atoms[bond.b].el !== "H");
  const sample = heavy.length ? heavy : bonds;
  const drawn = sample.reduce((sum, bond) => sum + Math.hypot(atoms[bond.a].x - atoms[bond.b].x, atoms[bond.a].y - atoms[bond.b].y), 0) / Math.max(1, sample.length);
  const real = sample.reduce((sum, bond) => sum + bondLength(bond.a, bond.b), 0) / Math.max(1, sample.length);
  const k = drawn > 0 ? real / drawn : 1;
  const flat: Vec[] = atoms.map((atom) => [atom.x * k, atom.y * k, 0]);

  // Start: the drawing, a little ruffled (so nothing is stuck flat), wedges up and hashes down.
  const p: Vec[] = flat.map((v, i) => [v[0], v[1], Math.sin(i * 12.9898 + 1.3) * (atoms[i].el === "H" ? 0.35 : 0.12)]);
  for (const bond of bonds) {
    if (bond.stereo === 1) p[bond.b][2] += 0.9;
    if (bond.stereo === 6) p[bond.b][2] -= 0.9;
  }

  // Topological distances up to 3, for what must be held and what must be kept apart.
  const hops = atoms.map((_, s) => {
    const seen = new Map<number, number>([[s, 0]]);
    let frontier = [s];
    for (let d = 1; d <= 3; d++) {
      const next: number[] = [];
      for (const v of frontier) for (const w of neighbours[v]) if (!seen.has(w)) {
        seen.set(w, d);
        next.push(w);
      }
      frontier = next;
    }
    return seen;
  });

  const constraints: Constraint[] = [];
  for (const bond of bonds) constraints.push({ i: bond.a, j: bond.b, target: bondLength(bond.a, bond.b), weight: 1 });
  const held = new Set<string>();
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  for (let j = 0; j < n; j++) {
    const around = neighbours[j];
    if (isMetalAtom(atoms[j].el) && around.length >= 2) {
      // Round a metal: linear for two, square planar for d8 with four (neighbours kept in the order
      // they were drawn round it), otherwise the neighbours spread over the ideal polyhedron.
      const lengthTo = (i: number) => bondLength(j, i);
      const pair = (x: number, y: number, target: number, repel = false) => {
        constraints.push({ i: x, j: y, target, weight: 0.8, repel });
        held.add(key(x, y));
      };
      if (around.length === 2) {
        pair(around[0], around[1], lengthTo(around[0]) + lengthTo(around[1]));
      } else if (around.length === 4 && SQUARE_PLANAR.has(atoms[j].el)) {
        const angle2d = (i: number) => Math.atan2(atoms[i].y - atoms[j].y, atoms[i].x - atoms[j].x);
        const round = [...around].sort((x, y) => angle2d(x) - angle2d(y));
        for (let k = 0; k < 4; k++) {
          const a = round[k];
          const b = round[(k + 1) % 4];
          const c = round[(k + 2) % 4];
          pair(a, b, Math.hypot(lengthTo(a), lengthTo(b)));
          if (k < 2) pair(a, c, lengthTo(a) + lengthTo(c));
        }
      } else {
        const angle = ((SPREAD[around.length] ?? 55) * Math.PI) / 180;
        for (let x = 0; x < around.length; x++) {
          for (let y = x + 1; y < around.length; y++) {
            const a = lengthTo(around[x]);
            const b = lengthTo(around[y]);
            pair(around[x], around[y], Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(angle)), true);
          }
        }
      }
      continue;
    }
    if (around.length > 4) continue;
    for (let x = 0; x < around.length; x++) {
      for (let y = x + 1; y < around.length; y++) {
        const a = bondLength(j, around[x]);
        const b = bondLength(j, around[y]);
        constraints.push({ i: around[x], j: around[y], target: Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(angleOf(j))), weight: 0.8 });
        held.add(key(around[x], around[y]));
      }
    }
  }
  // Across a double bond everything stays in one plane, cis or trans as drawn.
  for (const bond of bonds) {
    // (A metal's double bond - a carbene, an oxo - does not make its other ligands coplanar.)
    if (bond.order !== 2 || isMetalAtom(atoms[bond.a].el) || isMetalAtom(atoms[bond.b].el)) continue;
    for (const i of neighbours[bond.a]) {
      if (i === bond.b) continue;
      for (const l of neighbours[bond.b]) {
        if (l === bond.a || l === i) continue;
        const target = length(sub(flat[i], flat[l]));
        constraints.push({ i, j: l, target, weight: 0.5 });
        held.add(key(i, l));
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = hops[i].get(j);
      if (d !== undefined && d < 3) continue;
      if (held.has(key(i, j))) continue;
      const hydrogen = atoms[i].el === "H" || atoms[j].el === "H";
      const target = d === 3 ? (hydrogen ? 2.2 : 2.5) : ((VDW[atoms[i].el] ?? 1.8) + (VDW[atoms[j].el] ?? 1.8)) * 0.72;
      constraints.push({ i, j, target, weight: 0.4, repel: true });
    }
  }

  // Wedged centres keep the hand they were drawn with: the volume spanned by the four neighbours
  // (the wedged one last) has a sign, and a flipped centre has its wedged neighbour mirrored back.
  const volume = (a: number, b: number, c: number, d: number) => dot(sub(p[b], p[a]), cross(sub(p[c], p[a]), sub(p[d], p[a])));
  const hands = bonds
    .filter((bond) => (bond.stereo === 1 || bond.stereo === 6) && neighbours[bond.a].length === 4)
    .map((bond) => {
      const [a, b, c] = neighbours[bond.a].filter((i) => i !== bond.b);
      return { a, b, c, d: bond.b, sign: Math.sign(volume(a, b, c, bond.b)) || 1 };
    });

  // Big molecules (a peptide, a porphyrin) get fewer rounds: they settle anyway, and the phone stays quick.
  const rounds = n > 160 ? 220 : n > 90 ? 320 : 450;
  for (let round = 0; round < rounds; round++) {
    for (const { i, j, target, weight, repel } of constraints) {
      const d = sub(p[j], p[i]);
      const distance = length(d) || 1e-6;
      if (repel && distance >= target) continue;
      const shift = scale(d, ((distance - target) / distance) * 0.5 * weight);
      p[i] = add(p[i], shift);
      p[j] = sub(p[j], shift);
    }
    for (const { a, b, c, d, sign } of hands) {
      if (Math.sign(volume(a, b, c, d)) === sign) continue;
      const normal = cross(sub(p[b], p[a]), sub(p[c], p[a]));
      const l = length(normal) || 1;
      const unitNormal = scale(normal, 1 / l);
      p[d] = sub(p[d], scale(unitNormal, 2 * dot(sub(p[d], p[a]), unitNormal)));
    }
  }

  // Centred, turned so the molecule's longest extent lies across the screen.
  const centre = scale(p.reduce<Vec>((sum, v) => add(sum, v), [0, 0, 0]), 1 / Math.max(1, n));
  const q = p.map((v) => sub(v, centre));
  const axes = principalAxes(q);
  const turned = q.map((v): Vec => [dot(v, axes[0]), dot(v, axes[1]), dot(v, axes[2])]);

  const modelBonds: ModelBond[] = bonds.map((bond) => ({ a: bond.a, b: bond.b, order: bond.order }));
  return { model: { atoms: atoms.map((atom, i) => ({ el: atom.el, p: turned[i] })), bonds: modelBonds }, hybridisation };
}

/** The directions of largest, middle and smallest spread (power iteration on the covariance). */
function principalAxes(points: Vec[]): [Vec, Vec, Vec] {
  const c = [0, 1, 2].map((r) => [0, 1, 2].map((s) => points.reduce((sum, v) => sum + v[r] * v[s], 0)));
  const mul = (v: Vec): Vec => [c[0][0] * v[0] + c[0][1] * v[1] + c[0][2] * v[2], c[1][0] * v[0] + c[1][1] * v[1] + c[1][2] * v[2], c[2][0] * v[0] + c[2][1] * v[1] + c[2][2] * v[2]];
  const norm = (v: Vec): Vec => {
    const l = length(v) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  let a: Vec = [1, 0.3, 0.1];
  for (let i = 0; i < 60; i++) a = norm(mul(a));
  let b: Vec = [0.2, 1, 0.3];
  for (let i = 0; i < 60; i++) {
    b = mul(b);
    b = norm(sub(b, scale(a, dot(a, b))));
  }
  const z = cross(a, b);
  return [a, b, length(z) > 1e-6 ? norm(z) : [0, 0, 1]];
}
