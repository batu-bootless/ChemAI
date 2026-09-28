// Chem+ app: the metals a complex can be built round - their names in Turkish and English, the
// "-ate" form an anionic complex takes (ferrate, cuprate…), and how their electrons are counted
// (d electrons for the d block, f electrons for the lanthanides and actinides).

import { atomicNumber } from "./elements";

export interface MetalInfo {
  en: string;
  tr: string;
  /** In an anionic complex: ferrate, cuprate… */
  ateEn: string;
  ateTr: string;
}

const M = (en: string, tr: string, ateEn: string, ateTr: string): MetalInfo => ({ en, tr, ateEn, ateTr });

export const METALS: Record<string, MetalInfo> = {
  // d block.
  Sc: M("scandium", "skandiyum", "scandate", "skandat"),
  Ti: M("titanium", "titanyum", "titanate", "titanat"),
  V: M("vanadium", "vanadyum", "vanadate", "vanadat"),
  Cr: M("chromium", "krom", "chromate", "kromat"),
  Mn: M("manganese", "mangan", "manganate", "manganat"),
  Fe: M("iron", "demir", "ferrate", "ferrat"),
  Co: M("cobalt", "kobalt", "cobaltate", "kobaltat"),
  Ni: M("nickel", "nikel", "nickelate", "nikelat"),
  Cu: M("copper", "bakır", "cuprate", "kuprat"),
  Zn: M("zinc", "çinko", "zincate", "zinkat"),
  Y: M("yttrium", "itriyum", "yttrate", "itrat"),
  Zr: M("zirconium", "zirkonyum", "zirconate", "zirkonat"),
  Nb: M("niobium", "niyobyum", "niobate", "niyobat"),
  Mo: M("molybdenum", "molibden", "molybdate", "molibdat"),
  Tc: M("technetium", "teknesyum", "technetate", "teknetat"),
  Ru: M("ruthenium", "rutenyum", "ruthenate", "rutenat"),
  Rh: M("rhodium", "rodyum", "rhodate", "rodat"),
  Pd: M("palladium", "paladyum", "palladate", "paladat"),
  Ag: M("silver", "gümüş", "argentate", "arjantat"),
  Cd: M("cadmium", "kadmiyum", "cadmate", "kadmat"),
  Hf: M("hafnium", "hafniyum", "hafnate", "hafnat"),
  Ta: M("tantalum", "tantal", "tantalate", "tantalat"),
  W: M("tungsten", "tungsten", "tungstate", "tungstat"),
  Re: M("rhenium", "renyum", "rhenate", "renat"),
  Os: M("osmium", "osmiyum", "osmate", "osmat"),
  Ir: M("iridium", "iridyum", "iridate", "iridat"),
  Pt: M("platinum", "platin", "platinate", "platinat"),
  Au: M("gold", "altın", "aurate", "aurat"),
  Hg: M("mercury", "cıva", "mercurate", "merkürat"),
  // Main group.
  Li: M("lithium", "lityum", "lithate", "lityat"),
  Na: M("sodium", "sodyum", "sodate", "sodat"),
  K: M("potassium", "potasyum", "potassate", "potasat"),
  Rb: M("rubidium", "rubidyum", "rubidate", "rubidat"),
  Cs: M("caesium", "sezyum", "caesate", "sezat"),
  Be: M("beryllium", "berilyum", "beryllate", "berilat"),
  Mg: M("magnesium", "magnezyum", "magnesate", "magnezat"),
  Ca: M("calcium", "kalsiyum", "calcate", "kalsat"),
  Sr: M("strontium", "stronsiyum", "strontate", "stronsat"),
  Ba: M("barium", "baryum", "barate", "barat"),
  B: M("boron", "bor", "borate", "borat"),
  Al: M("aluminium", "alüminyum", "aluminate", "alüminat"),
  Ga: M("gallium", "galyum", "gallate", "galat"),
  In: M("indium", "indiyum", "indate", "indat"),
  Tl: M("thallium", "talyum", "thallate", "talat"),
  Si: M("silicon", "silisyum", "silicate", "silikat"),
  Ge: M("germanium", "germanyum", "germanate", "germanat"),
  Sn: M("tin", "kalay", "stannate", "stannat"),
  Pb: M("lead", "kurşun", "plumbate", "plumbat"),
  As: M("arsenic", "arsenik", "arsenate", "arsenat"),
  Sb: M("antimony", "antimon", "stibate", "stibat"),
  Bi: M("bismuth", "bizmut", "bismuthate", "bizmutat"),
  // Lanthanides.
  La: M("lanthanum", "lantan", "lanthanate", "lantanat"),
  Ce: M("cerium", "seryum", "cerate", "serat"),
  Pr: M("praseodymium", "praseodim", "praseodymate", "praseodimat"),
  Nd: M("neodymium", "neodim", "neodymate", "neodimat"),
  Pm: M("promethium", "prometyum", "promethate", "prometat"),
  Sm: M("samarium", "samaryum", "samarate", "samarat"),
  Eu: M("europium", "evropiyum", "europate", "evropat"),
  Gd: M("gadolinium", "gadolinyum", "gadolinate", "gadolinat"),
  Tb: M("terbium", "terbiyum", "terbate", "terbat"),
  Dy: M("dysprosium", "disprosyum", "dysprosate", "disprosat"),
  Ho: M("holmium", "holmiyum", "holmate", "holmat"),
  Er: M("erbium", "erbiyum", "erbate", "erbat"),
  Tm: M("thulium", "tulyum", "thulate", "tulat"),
  Yb: M("ytterbium", "iterbiyum", "ytterbate", "iterbat"),
  Lu: M("lutetium", "lutesyum", "lutetate", "lutesat"),
  // Actinides.
  Th: M("thorium", "toryum", "thorate", "torat"),
  Pa: M("protactinium", "protaktinyum", "protactinate", "protaktinat"),
  U: M("uranium", "uranyum", "uranate", "uranat"),
  Np: M("neptunium", "neptünyum", "neptunate", "neptünat"),
  Pu: M("plutonium", "plütonyum", "plutonate", "plütonat"),
  Am: M("americium", "amerikyum", "americate", "amerikat"),
};

export function isMetal(symbol: string): boolean {
  return symbol in METALS;
}

/** The metal's group (3–12) when it is a d-block metal, else null. */
export function dGroup(metal: string): number | null {
  const z = atomicNumber(metal);
  if (z >= 21 && z <= 30) return z - 18;
  if (z >= 39 && z <= 48) return z - 36;
  if (z >= 72 && z <= 80) return z - 68;
  return null;
}

/** f electrons of a lanthanide or actinide in an oxidation state; null outside the f block. */
export function fElectrons(metal: string, oxidation: number): number | null {
  const z = atomicNumber(metal);
  if (z >= 57 && z <= 71) return Math.max(0, Math.min(14, z - 54 - oxidation));
  if (z >= 90 && z <= 95) return Math.max(0, Math.min(14, z - 86 - oxidation));
  return null;
}

/** 4d and 5d metals split the d orbitals so widely that they are nearly always low spin. */
export function isHeavy(metal: string): boolean {
  const z = atomicNumber(metal);
  return z > 36 && z < 90;
}

export function isFBlock(metal: string): boolean {
  const z = atomicNumber(metal);
  return (z >= 57 && z <= 71) || (z >= 90 && z <= 103);
}

/** A lanthanide ion's magnetic moment with its orbital part (Hund's rules: L, S, J and Landé g). */
export function lanthanideMoment(f: number): { mu: number; term: string } {
  const ml = [3, 2, 1, 0, -1, -2, -3];
  const up = Math.min(7, f);
  const down = Math.max(0, f - 7);
  const S = (up - down) / 2;
  const L = Math.abs(ml.slice(0, up).reduce((a, b) => a + b, 0) + ml.slice(0, down).reduce((a, b) => a + b, 0));
  const J = f < 7 ? Math.abs(L - S) : L + S;
  const letters = "SPDFGHIKLMNOQ";
  const term = `${2 * S + 1}${letters[L] ?? "?"}${Number.isInteger(J) ? J : `${J * 2}/2`}`;
  if (J === 0) return { mu: 0, term };
  const g = 1 + (J * (J + 1) + S * (S + 1) - L * (L + 1)) / (2 * J * (J + 1));
  return { mu: g * Math.sqrt(J * (J + 1)), term };
}
