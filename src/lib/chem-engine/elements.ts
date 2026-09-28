// Chem+ app: the element data the calculation engine counts with.
//
// Standard atomic weights are IUPAC's conventional values (the same ones RDKit and most tables
// use: C 12.011, H 1.008, O 15.999), so a molar mass from here agrees with RDKit to the last
// printed digit. Elements with no stable isotope carry the mass number of their longest-lived one.
// Monoisotopic masses (most abundant isotope) are given for the elements an exact mass is usually
// asked for; a formula containing anything else simply gets no exact mass.

import { PERIODIC_ELEMENTS } from "@/lib/periodic-table-data";

export const ATOMIC_WEIGHTS: Record<string, number> = {
  H: 1.008, He: 4.002602, Li: 6.94, Be: 9.0121831, B: 10.81, C: 12.011, N: 14.007, O: 15.999,
  F: 18.998403163, Ne: 20.1797, Na: 22.98976928, Mg: 24.305, Al: 26.9815384, Si: 28.085,
  P: 30.973761998, S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.0983, Ca: 40.078, Sc: 44.955908,
  Ti: 47.867, V: 50.9415, Cr: 51.9961, Mn: 54.938043, Fe: 55.845, Co: 58.933194, Ni: 58.6934,
  Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.921595, Se: 78.971, Br: 79.904,
  Kr: 83.798, Rb: 85.4678, Sr: 87.62, Y: 88.90584, Zr: 91.224, Nb: 92.90637, Mo: 95.95, Tc: 98,
  Ru: 101.07, Rh: 102.90549, Pd: 106.42, Ag: 107.8682, Cd: 112.414, In: 114.818, Sn: 118.71,
  Sb: 121.76, Te: 127.6, I: 126.90447, Xe: 131.293, Cs: 132.90545196, Ba: 137.327,
  La: 138.90547, Ce: 140.116, Pr: 140.90766, Nd: 144.242, Pm: 145, Sm: 150.36, Eu: 151.964,
  Gd: 157.25, Tb: 158.925354, Dy: 162.5, Ho: 164.930329, Er: 167.259, Tm: 168.934219,
  Yb: 173.045, Lu: 174.9668, Hf: 178.49, Ta: 180.94788, W: 183.84, Re: 186.207, Os: 190.23,
  Ir: 192.217, Pt: 195.084, Au: 196.96657, Hg: 200.592, Tl: 204.38, Pb: 207.2, Bi: 208.9804,
  Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.0377, Pa: 231.03588,
  U: 238.02891, Np: 237, Pu: 244, Am: 243, Cm: 247, Bk: 247, Cf: 251, Es: 252, Fm: 257, Md: 258,
  No: 259, Lr: 262, Rf: 267, Db: 268, Sg: 269, Bh: 270, Hs: 269, Mt: 278, Ds: 281, Rg: 282,
  Cn: 285, Nh: 286, Fl: 289, Mc: 290, Lv: 293, Ts: 294, Og: 294,
  // Isotope symbols chemists write in formulas (D₂O, T₂).
  D: 2.01410177812, T: 3.0160492779,
};

/** Mass of the most abundant isotope, for exact (monoisotopic) masses. */
export const MONOISOTOPIC: Record<string, number> = {
  H: 1.00782503207, D: 2.01410177812, T: 3.0160492779, He: 4.00260325415, Li: 7.01600455,
  B: 11.0093054, C: 12, N: 14.0030740048, O: 15.99491461956, F: 18.99840322,
  Ne: 19.9924401754, Na: 22.9897692809, Mg: 23.9850417, Al: 26.98153863, Si: 27.9769265325,
  P: 30.97376163, S: 31.972071, Cl: 34.96885268, Ar: 39.9623831225, K: 38.96370668,
  Ca: 39.96259098, Ti: 47.9479463, V: 50.9439595, Cr: 51.9405075, Mn: 54.9380451,
  Fe: 55.9349375, Co: 58.933195, Ni: 57.9353429, Cu: 62.9295975, Zn: 63.9291422,
  As: 74.9215965, Se: 79.9165213, Br: 78.9183371, Kr: 83.911507, Rb: 84.911789738,
  Sr: 87.9056121, Mo: 97.9054082, Ag: 106.905097, Sn: 119.9021947, I: 126.904473,
  Xe: 131.9041535, Cs: 132.905451933, Ba: 137.9052472, Pt: 194.9647911, Au: 196.9665687,
  Hg: 201.970643, Pb: 207.9766521,
};

/** Z for Hill order and for the element names. */
const Z_BY_SYMBOL = new Map(PERIODIC_ELEMENTS.map((element) => [element.symbol, element.number]));

export function isElement(symbol: string): boolean {
  return symbol in ATOMIC_WEIGHTS;
}

export function elementName(symbol: string, language: "tr" | "en"): string {
  if (symbol === "D") return language === "tr" ? "Döteryum" : "Deuterium";
  if (symbol === "T") return language === "tr" ? "Trityum" : "Tritium";
  const element = PERIODIC_ELEMENTS.find((entry) => entry.symbol === symbol);
  if (!element) return symbol;
  return language === "tr" ? element.nameTr : element.nameEn;
}

/** Hill order: C first, then H, then the rest alphabetically; with no C, all alphabetically. */
export function hillOrder(symbols: string[]): string[] {
  const hasCarbon = symbols.includes("C");
  return [...symbols].sort((a, b) => {
    if (hasCarbon) {
      const rank = (s: string) => (s === "C" ? 0 : s === "H" ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    return a.localeCompare(b, "en");
  });
}

export function atomicNumber(symbol: string): number {
  if (symbol === "D" || symbol === "T") return 1;
  return Z_BY_SYMBOL.get(symbol) ?? 0;
}

/** Symbol for an atomic number, for structures RDKit hands back as numbers. */
export function symbolForZ(z: number): string {
  return PERIODIC_ELEMENTS.find((element) => element.number === z)?.symbol ?? "?";
}
