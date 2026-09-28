// Chem+ app: the building kit the structure engine puts ligands and clusters together with - a
// fragment of atoms and bonds, and the little geometric moves chemists make on paper: a cone of
// hydrogens, a methyl, a chelate ring bulging away from the metal, a benzene ring fused on an edge,
// a flat π ring above a metal.

import { add, cross, distance, dot, length, perpendicular, rotate, scale, sub, unit, type ModelAtom, type ModelBond, type Vec } from "./model3d";

export const DEG = Math.PI / 180;

/** Atoms and bonds of one ligand (or cluster piece), placed about a metal at the origin. */
export class Fragment {
  atoms: ModelAtom[] = [];
  bonds: ModelBond[] = [];
  /** Atoms bonded to the metal, and how. */
  links: { atom: number; order: 1 | 2 | 3; kind: "coord" | "eta" }[] = [];

  atom(el: string, p: Vec): number {
    this.atoms.push({ el, p });
    return this.atoms.length - 1;
  }

  bond(a: number, b: number, order: ModelBond["order"] = 1) {
    if (a === b || this.bonds.some((bond) => (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a))) return;
    this.bonds.push({ a, b, order });
  }

  p(i: number): Vec {
    return this.atoms[i].p;
  }

  /** Atoms of one element closer than `within` Å are one atom (rings fused on each other's edges). */
  merge(within = 0.55) {
    const keep: number[] = [];
    const map = this.atoms.map((atom, index) => {
      const same = keep.find((k) => this.atoms[k].el === atom.el && distance(this.atoms[k].p, atom.p) < within);
      if (same === undefined) {
        keep.push(index);
        return index;
      }
      this.atoms[same] = { ...this.atoms[same], p: scale(add(this.atoms[same].p, atom.p), 0.5) };
      return same;
    });
    const renumber = new Map(keep.map((old, i) => [old, i]));
    const at = (i: number) => renumber.get(map[i])!;
    this.atoms = keep.map((i) => this.atoms[i]);
    const bonds = this.bonds;
    this.bonds = [];
    for (const bond of bonds) this.bond(at(bond.a), at(bond.b), bond.order);
    const links = this.links;
    this.links = [];
    for (const link of links) if (!this.links.some((l) => l.atom === at(link.atom))) this.links.push({ ...link, atom: at(link.atom) });
  }

  neighbours(i: number): number[] {
    return this.bonds.flatMap((bond) => (bond.a === i ? [bond.b] : bond.b === i ? [bond.a] : []));
  }

  /** One H on every ring carbon that has only two neighbours (aromatic C–H, in the ring's plane). */
  aromaticHydrogens(carbons?: number[]) {
    const list = carbons ?? this.atoms.map((atom, i) => (atom.el === "C" ? i : -1)).filter((i) => i >= 0);
    for (const c of list) {
      const around = this.neighbours(c);
      if (this.atoms[c].el !== "C" || around.length !== 2) continue;
      const p = this.p(c);
      const out = unit(add(unit(sub(p, this.p(around[0]))), unit(sub(p, this.p(around[1])))));
      this.bond(c, this.atom("H", add(p, scale(out, 1.08))));
    }
  }

  /** The fragment's atoms and bonds, shifted by `offset` for putting several fragments together. */
  add(other: Fragment): number {
    const offset = this.atoms.length;
    this.atoms.push(...other.atoms);
    this.bonds.push(...other.bonds.map((bond) => ({ ...bond, a: bond.a + offset, b: bond.b + offset })));
    this.links.push(...other.links.map((link) => ({ ...link, atom: link.atom + offset })));
    return offset;
  }
}

/** Where the metal is and how far a donor sits from it. */
export interface Frame {
  metal: string;
  /** Metal–donor distance for a donor element, with an adjustment for multiple bonds. */
  reach: (donor: string, adjust?: number) => number;
  /** The metal's own position (clusters have more than one); the origin for a mononuclear complex. */
  at?: Vec;
}

export const origin = (frame: Frame): Vec => frame.at ?? [0, 0, 0];

/** One donor atom on the site, bonded to the metal. */
export function donor(f: Fragment, frame: Frame, dir: Vec, el: string, adjust?: number, order: 1 | 2 | 3 = 1): number {
  const i = f.atom(el, add(origin(frame), scale(dir, frame.reach(el, adjust))));
  f.links.push({ atom: i, order, kind: "coord" });
  return i;
}

/** n points on a cone about `axis` at `angle` from it (hydrogens of NH3, CH3). */
export function cone(centre: Vec, axis: Vec, n: number, angle: number, bond: number, phase = 0, reference?: Vec): Vec[] {
  const u = reference ? unit(sub(reference, scale(axis, dot(reference, axis)))) : perpendicular(axis);
  const w = cross(axis, u);
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i * 2 * Math.PI) / n;
    return add(centre, scale(add(scale(axis, Math.cos(angle)), add(scale(u, Math.sin(angle) * Math.cos(a)), scale(w, Math.sin(angle) * Math.sin(a)))), bond));
  });
}

/** The two remaining tetrahedral directions on an atom with two neighbours (for CH2, NH2, PPh2). */
export function twoDirections(p: Vec, n1: Vec, n2: Vec): [Vec, Vec] {
  const a = unit(sub(p, n1));
  const b = unit(sub(p, n2));
  const bisector = unit(add(a, b));
  const normal = unit(cross(a, b));
  const tilt = 54.75 * DEG;
  return [unit(add(scale(bisector, Math.cos(tilt)), scale(normal, Math.sin(tilt)))), unit(add(scale(bisector, Math.cos(tilt)), scale(normal, -Math.sin(tilt))))];
}

/** Two hydrogens on an sp3 atom with two heavy neighbours (CH2, NH2). */
export function twoHydrogens(f: Fragment, centre: number, n1: Vec, n2: Vec, bond = 1.09) {
  for (const dir of twoDirections(f.p(centre), n1, n2)) f.bond(centre, f.atom("H", add(f.p(centre), scale(dir, bond))));
}

/** One hydrogen on an sp3 atom with three heavy neighbours (NH in a ring, CH). */
export function oneHydrogen(f: Fragment, centre: number, neighbours: Vec[], bond = 1.01) {
  const p = f.p(centre);
  const out = unit(neighbours.reduce<Vec>((sum, n) => add(sum, unit(sub(p, n))), [0, 0, 0]));
  f.bond(centre, f.atom("H", add(p, scale(out, bond))));
}

/** A methyl (or CF3) along `axis` from an atom. */
export function methyl(f: Fragment, carbon: number, axis: Vec, substituent = "H", bond = 1.5) {
  const c = f.atom("C", add(f.p(carbon), scale(axis, bond)));
  f.bond(carbon, c);
  for (const h of cone(f.p(c), axis, 3, 70.5 * DEG, substituent === "F" ? 1.33 : 1.09)) f.bond(c, f.atom(substituent, h));
  return c;
}

/** A group bent off an atom: the new direction makes `angle` with the way back, in the plane of `normal`. */
export function bent(back: Vec, normal: Vec, angle: number, away?: Vec): Vec {
  const a = rotate(unit(back), unit(normal), angle * DEG);
  const b = rotate(unit(back), unit(normal), -angle * DEG);
  if (!away) return a;
  return dot(a, away) >= dot(b, away) ? a : b;
}

/**
 * The backbone of a chelate ring between two donors, as a planar ring bulging away from `centre`
 * (the metal): the k backbone atoms and the two donors lie on one circle, spaced by the bond length.
 */
export function arc(d1: Vec, d2: Vec, k: number, bond: number, centre: Vec = [0, 0, 0]): { points: Vec[]; centre: Vec; normal: Vec } {
  const x = unit(sub(d2, d1));
  const mid = scale(add(d1, d2), 0.5);
  const out = sub(mid, centre);
  let y = unit(sub(out, scale(x, dot(out, x))));
  if (length(sub(out, scale(x, dot(out, x)))) < 1e-6) y = perpendicular(x);
  const normal = unit(cross(x, y));
  const span = distance(d1, d2);
  const ratio = span / bond;
  let theta = 1e-3;
  if (ratio < k + 1) {
    const g = (t: number) => Math.sin(((k + 1) * t) / 2) / Math.sin(t / 2);
    let lo = 1e-4;
    let hi = (2 * Math.PI) / (k + 1) - 1e-4;
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2;
      if (g(m) > ratio) lo = m;
      else hi = m;
    }
    theta = (lo + hi) / 2;
  }
  const radius = bond / (2 * Math.sin(theta / 2));
  const sweep = (k + 1) * theta;
  const h = Math.sqrt(Math.max(0, radius * radius - (span * span) / 4));
  const cy = sweep > Math.PI ? h : -h;
  const ringCentre = add(mid, scale(y, cy));
  const start = Math.atan2(-cy, -span / 2);
  const points = Array.from({ length: k }, (_, i) => {
    const a = start - (i + 1) * theta;
    return add(ringCentre, add(scale(x, radius * Math.cos(a)), scale(y, radius * Math.sin(a))));
  });
  return { points, centre: ringCentre, normal };
}

/** A regular hexagon on the edge a–b, on the side away from `away`, in the plane with `normal`. */
export function hexagonOn(a: Vec, b: Vec, away: Vec, normal: Vec): Vec[] {
  const edge = sub(b, a);
  const side = length(edge);
  const mid = scale(add(a, b), 0.5);
  let out = unit(cross(normal, edge));
  if (dot(out, sub(mid, away)) < 0) out = scale(out, -1);
  const centre = add(mid, scale(out, (side * Math.sqrt(3)) / 2));
  const axis = unit(normal);
  let step = 60 * DEG;
  if (distance(add(centre, rotate(sub(a, centre), axis, step)), b) < 0.1) step = -step;
  return [1, 2, 3, 4].map((i) => add(centre, rotate(sub(a, centre), axis, i * step)));
}

export type Hang = "H2" | "H" | "O" | "Me" | "CF3" | "Ph2" | "Me2" | "none";

/**
 * A chelate ring from donor i1 to donor i2 through backbone atoms (element, what hangs off it),
 * bonded with `orders` (one more than the backbone). Returns the backbone atoms.
 */
export function bridge(f: Fragment, i1: number, i2: number, backbone: { el: string; hang?: Hang }[], orders: ModelBond["order"][], bond: number, centre: Vec = [0, 0, 0]): { ids: number[]; ringCentre: Vec; normal: Vec } {
  const { points, centre: ringCentre, normal } = arc(f.p(i1), f.p(i2), backbone.length, bond, centre);
  const ids = backbone.map((atom, i) => f.atom(atom.el, points[i]));
  const chain = [i1, ...ids, i2];
  for (let i = 0; i < chain.length - 1; i++) f.bond(chain[i], chain[i + 1], orders[i] ?? 1);
  backbone.forEach((atom, i) => {
    const id = ids[i];
    const p = f.p(id);
    const out = unit(sub(p, ringCentre));
    if (atom.hang === "H") f.bond(id, f.atom("H", add(p, scale(out, 1.08))));
    if (atom.hang === "O") f.bond(id, f.atom("O", add(p, scale(out, 1.23))), 2);
    if (atom.hang === "Me") methyl(f, id, out);
    if (atom.hang === "CF3") methyl(f, id, out, "F", 1.52);
    if (atom.hang === "H2") twoHydrogens(f, id, f.p(chain[i]), f.p(chain[i + 2]));
  });
  return { ids, ringCentre, normal };
}

/** A six-membered aromatic ring starting at `start`, pointing along `dir`, in the plane of `side`. */
export function ring6(f: Fragment, start: number, dir: Vec, side: Vec, elements: string[] = []): number[] {
  const p = f.p(start);
  const centre = add(p, scale(dir, 1.39));
  const ids = [start];
  for (let k = 1; k < 6; k++) {
    const a = Math.PI + (k * Math.PI) / 3;
    ids.push(f.atom(elements[k - 1] ?? "C", add(centre, scale(add(scale(dir, Math.cos(a)), scale(side, Math.sin(a))), 1.39))));
  }
  for (let k = 0; k < 6; k++) f.bond(ids[k], ids[(k + 1) % 6], 1.5);
  return ids;
}

/** A five-membered ring starting at `start` (for imidazole, THF, pyrazole), pointing along `dir`. */
export function ring5(f: Fragment, start: number, dir: Vec, side: Vec, elements: string[], side2 = 1.4, order: ModelBond["order"] = 1.5): number[] {
  const radius = side2 / (2 * Math.sin(36 * DEG));
  const centre = add(f.p(start), scale(dir, radius));
  const ids = [start];
  for (let k = 1; k < 5; k++) {
    const a = Math.PI + (k * 2 * Math.PI) / 5;
    ids.push(f.atom(elements[k - 1] ?? "C", add(centre, scale(add(scale(dir, Math.cos(a)), scale(side, Math.sin(a))), radius))));
  }
  for (let k = 0; k < 5; k++) f.bond(ids[k], ids[(k + 1) % 5], order);
  return ids;
}

/** A flat ring bonded side-on (η): its centroid on the site, its atoms bonded to the metal as η-bonds. */
export function piRing(f: Fragment, frame: Frame, a: Vec, n: number, radius: number, extra: number, substituent: "H" | "Me" = "H", phase = 0): number[] {
  const centroid = add(origin(frame), scale(a, frame.reach("C", 0) - 0.76 + extra));
  const u = perpendicular(a);
  const w = cross(a, u);
  const ids = Array.from({ length: n }, (_, i) => {
    const t = phase + (i * 2 * Math.PI) / n;
    return f.atom("C", add(centroid, add(scale(u, radius * Math.cos(t)), scale(w, radius * Math.sin(t)))));
  });
  ids.forEach((id, i) => {
    f.bond(id, ids[(i + 1) % n], 1.5);
    f.links.push({ atom: id, order: 1, kind: "eta" });
    const out = unit(sub(f.p(id), centroid));
    if (substituent === "Me") methyl(f, id, out);
    else f.bond(id, f.atom("H", add(f.p(id), scale(out, 1.08))));
  });
  return ids;
}

/**
 * The finished model eased where atoms of different ligands (or a crowded ring) press into each
 * other: every bond length and every angle (1-3 distance) is held as built, only atoms three or
 * more bonds apart are pushed out of each other's way. Nothing moves when nothing overlaps.
 */
export function relaxModel(atoms: ModelAtom[], bonds: ModelBond[], rounds = 150): ModelAtom[] {
  const n = atoms.length;
  if (n < 3) return atoms;
  const p = atoms.map((atom) => [...atom.p] as Vec);
  const neighbours: number[][] = atoms.map(() => []);
  for (const bond of bonds) {
    neighbours[bond.a].push(bond.b);
    neighbours[bond.b].push(bond.a);
  }
  const near = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const held: { i: number; j: number; d: number; w: number }[] = [];
  for (const bond of bonds) {
    near.add(key(bond.a, bond.b));
    held.push({ i: bond.a, j: bond.b, d: distance(p[bond.a], p[bond.b]), w: 1 });
  }
  for (let c = 0; c < n; c++) {
    const around = neighbours[c];
    for (let x = 0; x < around.length; x++)
      for (let y = x + 1; y < around.length; y++) {
        const k = key(around[x], around[y]);
        if (near.has(k)) continue;
        near.add(k);
        held.push({ i: around[x], j: around[y], d: distance(p[around[x]], p[around[y]]), w: 0.8 });
      }
  }
  const limit = (i: number, j: number) => {
    const hi = atoms[i].el === "H";
    const hj = atoms[j].el === "H";
    return hi && hj ? 2.0 : hi || hj ? 2.4 : 2.9;
  };
  const apart: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!near.has(key(i, j))) apart.push([i, j]);
  const overlapping = () => apart.some(([i, j]) => distance(p[i], p[j]) < limit(i, j) - 0.25);
  if (!overlapping()) return atoms;
  for (let round = 0; round < rounds; round++) {
    for (const [i, j] of apart) {
      const d = sub(p[j], p[i]);
      const dist = length(d) || 1e-6;
      const target = limit(i, j);
      if (dist >= target) continue;
      const shift = scale(d, ((dist - target) / dist) * 0.25);
      p[i] = add(p[i], shift);
      p[j] = sub(p[j], shift);
    }
    for (const { i, j, d: target, w } of held) {
      const d = sub(p[j], p[i]);
      const dist = length(d) || 1e-6;
      const shift = scale(d, ((dist - target) / dist) * 0.5 * w);
      p[i] = add(p[i], shift);
      p[j] = sub(p[j], shift);
    }
  }
  return atoms.map((atom, i) => ({ ...atom, p: p[i] }));
}

/** Two atoms bonded side-on (η²): an alkene, alkyne, H₂ or peroxide across the site. */
export function sideOn(f: Fragment, frame: Frame, a: Vec, el: string, bondLength: number, order: ModelBond["order"], extra: number, across?: Vec): [number, number] {
  const centre = add(origin(frame), scale(a, frame.reach(el, 0) - 0.66 + extra));
  const t = across ? unit(sub(across, scale(a, dot(across, a)))) : perpendicular(a);
  const i = f.atom(el, add(centre, scale(t, bondLength / 2)));
  const j = f.atom(el, add(centre, scale(t, -bondLength / 2)));
  f.bond(i, j, order);
  f.links.push({ atom: i, order: 1, kind: "eta" }, { atom: j, order: 1, kind: "eta" });
  return [i, j];
}
