// Chem+ app: the 3D ball-and-stick models the app builds itself - coordination compounds
// (complexes.ts), single-centre molecules (vsepr.ts) and molecules from a SMILES (embed3d.ts) -
// and the little vector algebra they are built with. Coordinates are in ångström; the viewer
// (src/components/ai/Molecule3D.tsx) turns and draws them.

export type Vec = [number, number, number];

export interface ModelAtom {
  el: string;
  p: Vec;
}

export interface ModelBond {
  a: number;
  b: number;
  /** 1.5: aromatic (drawn as one stick); 4: a metal–metal quadruple bond. */
  order: 1 | 1.5 | 2 | 3 | 4;
  /** coord: a donor atom's bond to the metal; eta: to a carbon of a π-bonded ring. */
  kind?: "coord" | "eta";
}

export interface ModelLonePair {
  atom: number;
  /** Unit vector from the atom. */
  dir: Vec;
}

export interface Model3D {
  atoms: ModelAtom[];
  bonds: ModelBond[];
  lonePairs?: ModelLonePair[];
}

// --- vectors ---------------------------------------------------------------------------------------

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
export const distance = (a: Vec, b: Vec): number => length(sub(a, b));

export function unit(a: Vec): Vec {
  const l = length(a);
  return l < 1e-9 ? [0, 0, 1] : scale(a, 1 / l);
}

/** Some unit vector at right angles to `a`. */
export function perpendicular(a: Vec): Vec {
  const n = unit(a);
  const helper: Vec = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  return unit(cross(n, helper));
}

/** `v` turned by `angle` (radians) about the unit axis `k` (Rodrigues). */
export function rotate(v: Vec, k: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** The angle between two vectors, in degrees. */
export function angleBetween(a: Vec, b: Vec): number {
  return (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;
}

// --- elements --------------------------------------------------------------------------------------

/** Covalent radii (Å, Cordero et al. 2008; low-spin values for Mn, Fe, Co). */
export const COVALENT_RADIUS: Record<string, number> = {
  H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02,
  Se: 1.2, Br: 1.2, Te: 1.38, I: 1.39, Xe: 1.4, Kr: 1.16, Be: 0.96, Mg: 1.41, Al: 1.21, Ca: 1.76,
  Ga: 1.22, Ge: 1.2, As: 1.19, Sn: 1.39, Sb: 1.39, Pb: 1.46, Bi: 1.48, Li: 1.28, Na: 1.66, K: 2.03,
  Sc: 1.7, Ti: 1.6, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22,
  Y: 1.9, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44,
  Hf: 1.75, Ta: 1.7, W: 1.62, Re: 1.51, Os: 1.44, Ir: 1.41, Pt: 1.36, Au: 1.36, Hg: 1.32,
  Rb: 2.2, Cs: 2.44, Sr: 1.95, Ba: 2.15, In: 1.42, Tl: 1.45, La: 2.07, Ce: 2.04, Pr: 2.03, Nd: 2.01,
  Pm: 1.99, Sm: 1.98, Eu: 1.98, Gd: 1.96, Tb: 1.94, Dy: 1.92, Ho: 1.92, Er: 1.89, Tm: 1.9, Yb: 1.87,
  Lu: 1.87, Th: 2.06, Pa: 2.0, U: 1.96, Np: 1.9, Pu: 1.87, Am: 1.8,
};

export function covalentRadius(el: string): number {
  return COVALENT_RADIUS[el] ?? 1.4;
}

/** Jmol's element colours, the ones most molecular models use. */
const COLORS: Record<string, string> = {
  H: "#FFFFFF", C: "#909090", N: "#3050F8", O: "#FF0D0D", F: "#90E050", Cl: "#1FF01F", Br: "#A62929",
  I: "#940094", S: "#FFFF30", P: "#FF8000", B: "#FFB5B5", Si: "#F0C8A0", Se: "#FFA100", Xe: "#429EB0",
  Kr: "#5CB8D1", Te: "#D47A00", As: "#BD80E3", Be: "#C2FF00", Mg: "#8AFF00", Al: "#BFA6A6", Ca: "#3DFF00",
  Ga: "#C28F8F", Ge: "#668F8F", Sn: "#668080", Sb: "#9E63B5", Pb: "#575961", Bi: "#9E4FB5", Li: "#CC80FF",
  Na: "#AB5CF2", K: "#8F40D4", Sc: "#E6E6E6", Ti: "#BFC2C7", V: "#A6A6AB", Cr: "#8A99C7", Mn: "#9C7AC7",
  Fe: "#E06633", Co: "#F090A0", Ni: "#50D050", Cu: "#C88033", Zn: "#7D80B0", Y: "#94FFFF", Zr: "#94E0E0",
  Nb: "#73C2C9", Mo: "#54B5B5", Tc: "#3B9E9E", Ru: "#248F8F", Rh: "#0A7D8C", Pd: "#006985", Ag: "#C0C0C0",
  Cd: "#FFD98F", Hf: "#4DC2FF", Ta: "#4DA6FF", W: "#2194D6", Re: "#267DAB", Os: "#266696", Ir: "#175487",
  Pt: "#D0D0E0", Au: "#FFD123", Hg: "#B8B8D0", Rb: "#702EB0", Cs: "#57178F", Sr: "#00FF00", Ba: "#00C900",
  In: "#A67573", Tl: "#A6544D", La: "#70D4FF", Ce: "#FFFFC7", Pr: "#D9FFC7", Nd: "#C7FFC7", Pm: "#A3FFC7",
  Sm: "#8FFFC7", Eu: "#61FFC7", Gd: "#45FFC7", Tb: "#30FFC7", Dy: "#1FFFC7", Ho: "#00FF9C", Er: "#00E675",
  Tm: "#00D452", Yb: "#00BF38", Lu: "#00AB24", Th: "#00BAFF", Pa: "#00A1FF", U: "#008FFF", Np: "#0080FF",
  Pu: "#006BFF", Am: "#545CF2",
};

export function elementColor(el: string): string {
  return COLORS[el] ?? "#FF1493";
}

/** The ball drawn for an element (Å): a fraction of its covalent radius, never too small. */
export function ballRadius(el: string): number {
  if (el === "H") return 0.22;
  return Math.max(0.3, covalentRadius(el) * 0.42);
}

/** A light colour needs a dark label and outline, a dark one a light label. */
export function isLightColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** The model moved so its centre of mass (by position, not weight) is at the origin. */
export function centred(model: Model3D): Model3D {
  if (model.atoms.length === 0) return model;
  const c = model.atoms.reduce<Vec>((sum, atom) => add(sum, atom.p), [0, 0, 0]);
  const centre = scale(c, 1 / model.atoms.length);
  return { ...model, atoms: model.atoms.map((atom) => ({ ...atom, p: sub(atom.p, centre) })) };
}
