// Chem+ app: written chemistry turned into words a person would say.
//
// How an answer sounds depends as much on the text as on the voice: a speech engine reads "H₂SO₄"
// letter by letter and "10⁻⁵" as noise. speakable() says "sülfürik asit" and "on üzeri eksi beş",
// "pH" as "pe ha", units in full, and drops markdown. It works on one sentence or a whole answer;
// the voice personality (personality.ts) calls it per sentence.

export type SpeechLanguage = "tr" | "en";

const SUP_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

/** Formulas a chemist would say by name. */
const NAMES: Record<string, [string, string]> = {
  H2O: ["su", "water"],
  H2O2: ["hidrojen peroksit", "hydrogen peroxide"],
  CO2: ["karbondioksit", "carbon dioxide"],
  CO: ["karbonmonoksit", "carbon monoxide"],
  O2: ["oksijen", "oxygen"],
  O3: ["ozon", "ozone"],
  H2: ["hidrojen", "hydrogen"],
  N2: ["azot", "nitrogen"],
  Cl2: ["klor", "chlorine"],
  NO2: ["azot dioksit", "nitrogen dioxide"],
  SO2: ["kükürt dioksit", "sulfur dioxide"],
  SO3: ["kükürt trioksit", "sulfur trioxide"],
  H2S: ["hidrojen sülfür", "hydrogen sulfide"],
  NaCl: ["sodyum klorür", "sodium chloride"],
  KCl: ["potasyum klorür", "potassium chloride"],
  KI: ["potasyum iyodür", "potassium iodide"],
  KBr: ["potasyum bromür", "potassium bromide"],
  AgCl: ["gümüş klorür", "silver chloride"],
  HCl: ["hidroklorik asit", "hydrochloric acid"],
  HF: ["hidroflorik asit", "hydrofluoric acid"],
  HBr: ["hidrobromik asit", "hydrobromic acid"],
  HNO3: ["nitrik asit", "nitric acid"],
  H2SO4: ["sülfürik asit", "sulfuric acid"],
  H3PO4: ["fosforik asit", "phosphoric acid"],
  H2CO3: ["karbonik asit", "carbonic acid"],
  HClO4: ["perklorik asit", "perchloric acid"],
  HCOOH: ["formik asit", "formic acid"],
  NaOH: ["sodyum hidroksit", "sodium hydroxide"],
  KOH: ["potasyum hidroksit", "potassium hydroxide"],
  "Ca(OH)2": ["kalsiyum hidroksit", "calcium hydroxide"],
  "Ba(OH)2": ["baryum hidroksit", "barium hydroxide"],
  "Mg(OH)2": ["magnezyum hidroksit", "magnesium hydroxide"],
  NH3: ["amonyak", "ammonia"],
  NH4Cl: ["amonyum klorür", "ammonium chloride"],
  NH4NO3: ["amonyum nitrat", "ammonium nitrate"],
  KNO3: ["potasyum nitrat", "potassium nitrate"],
  NaNO3: ["sodyum nitrat", "sodium nitrate"],
  CH3COOH: ["asetik asit", "acetic acid"],
  CH3COONa: ["sodyum asetat", "sodium acetate"],
  CaCO3: ["kalsiyum karbonat", "calcium carbonate"],
  CaO: ["kalsiyum oksit", "calcium oxide"],
  MgO: ["magnezyum oksit", "magnesium oxide"],
  NaHCO3: ["sodyum bikarbonat", "sodium bicarbonate"],
  Na2CO3: ["sodyum karbonat", "sodium carbonate"],
  Na2SO4: ["sodyum sülfat", "sodium sulfate"],
  BaSO4: ["baryum sülfat", "barium sulfate"],
  CuSO4: ["bakır sülfat", "copper sulfate"],
  AgNO3: ["gümüş nitrat", "silver nitrate"],
  KMnO4: ["potasyum permanganat", "potassium permanganate"],
  FeCl3: ["demir üç klorür", "iron three chloride"],
  Fe2O3: ["demir üç oksit", "iron three oxide"],
  Al2O3: ["alüminyum oksit", "aluminium oxide"],
  SiO2: ["silisyum dioksit", "silicon dioxide"],
  C6H12O6: ["glukoz", "glucose"],
  C2H5OH: ["etanol", "ethanol"],
  CH3OH: ["metanol", "methanol"],
  CH3COCH3: ["aseton", "acetone"],
  CH4: ["metan", "methane"],
  C2H6: ["etan", "ethane"],
  C2H4: ["eten", "ethene"],
  C2H2: ["asetilen", "acetylene"],
  C3H8: ["propan", "propane"],
  C4H10: ["bütan", "butane"],
  C6H6: ["benzen", "benzene"],
  C8H18: ["oktan", "octane"],
};

/** Ions a chemist would say by name (in an equation "8 H artı artı…" would be a riddle). */
const ION_NAMES: Record<string, [string, string]> = {
  "H+": ["hidrojen iyonu", "hydrogen ion"],
  "OH-": ["hidroksit iyonu", "hydroxide ion"],
  "Mn2+": ["mangan iki iyonu", "manganese two ion"],
  "SO42-": ["sülfat iyonu", "sulfate ion"],
  "HSO4-": ["bisülfat iyonu", "bisulfate ion"],
  "NO3-": ["nitrat iyonu", "nitrate ion"],
  "NO2-": ["nitrit iyonu", "nitrite ion"],
  "CO32-": ["karbonat iyonu", "carbonate ion"],
  "HCO3-": ["bikarbonat iyonu", "bicarbonate ion"],
  "PO43-": ["fosfat iyonu", "phosphate ion"],
  "NH4+": ["amonyum iyonu", "ammonium ion"],
  "H3O+": ["hidronyum iyonu", "hydronium ion"],
  "MnO4-": ["permanganat iyonu", "permanganate ion"],
  "Cr2O72-": ["dikromat iyonu", "dichromate ion"],
  "CrO42-": ["kromat iyonu", "chromate ion"],
  "CH3COO-": ["asetat iyonu", "acetate ion"],
  "CN-": ["siyanür iyonu", "cyanide ion"],
  "ClO-": ["hipoklorit iyonu", "hypochlorite ion"],
  "Cl-": ["klorür iyonu", "chloride ion"],
  "Br-": ["bromür iyonu", "bromide ion"],
  "I-": ["iyodür iyonu", "iodide ion"],
  "F-": ["florür iyonu", "fluoride ion"],
  "Na+": ["sodyum iyonu", "sodium ion"],
  "K+": ["potasyum iyonu", "potassium ion"],
  "Ag+": ["gümüş iyonu", "silver ion"],
  "Ca2+": ["kalsiyum iyonu", "calcium ion"],
  "Mg2+": ["magnezyum iyonu", "magnesium ion"],
  "Ba2+": ["baryum iyonu", "barium ion"],
  "Zn2+": ["çinko iyonu", "zinc ion"],
  "Cu2+": ["bakır iki iyonu", "copper two ion"],
  "Fe2+": ["demir iki iyonu", "iron two ion"],
  "Fe3+": ["demir üç iyonu", "iron three ion"],
  "Al3+": ["alüminyum iyonu", "aluminium ion"],
};

/** Units that appear as "per" something: s⁻¹, M⁻¹, mol⁻¹. */
const PER_UNITS: Record<string, [string, string]> = {
  s: ["saniye", "second"],
  min: ["dakika", "minute"],
  M: ["molar", "molar"],
  mol: ["mol", "mole"],
  L: ["litre", "litre"],
  K: ["kelvin", "kelvin"],
  g: ["gram", "gram"],
  cm: ["santimetre", "centimetre"],
};

const digitsOf = (text: string) => [...text].map((d) => SUP_DIGITS.indexOf(d)).join("");

/**
 * An answer (or one sentence of it) as it should be heard: no markdown or tables, formulas said by
 * name (or letter by letter), powers of ten and charges in words, units spelled out.
 */
export function speakable(markdown: string, language: SpeechLanguage): string {
  const tr = language === "tr";
  let text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .filter((line) => !/^\s*\|?\s*:?-{2,}/.test(line))
    .map((line) => (line.includes("|") ? line.split("|").map((c) => c.trim()).filter(Boolean).join(", ") : line))
    .map((line) => line.replace(/^\s*#{1,6}\s*/, "").replace(/^\s*[-*•]\s+/, "").replace(/^\s*\d+[.)]\s+/, ""))
    .filter((line) => line.trim())
    .map((line) => (/[.!?:…]$/.test(line.trim()) ? line : `${line}.`))
    .join(" ")
    .replace(/\*\*|__|`|\*/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\\[()[\]]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");

  // Electrons in a half-reaction: 5e⁻ → "5 elektron".
  text = text.replace(/(\d*)\s?e⁻/g, (_, n: string) => ` ${n}${n ? " " : ""}${tr ? "elektron" : n && n !== "1" ? "electrons" : "electron"} `);
  // [H⁺], [OH⁻]: the concentration of the species.
  text = text.replace(/\[([A-Z][A-Za-z0-9₀-₉⁰-⁹¹²³⁺⁻]*)\]/g, (_, species: string) => (tr ? ` ${species} derişimi ` : ` the concentration of ${species} `));
  text = text.replace(/√\s*/g, tr ? " karekök " : " the square root of ");

  // ×10⁻⁵ → "çarpı on üzeri eksi beş"; 1,8e-5 and 10^-5 the same way.
  text = text.replace(/\s*×\s*10([⁻⁺]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, sign: string, digits: string) =>
    tr ? ` çarpı on üzeri ${sign === "⁻" ? "eksi " : ""}${digitsOf(digits)}` : ` times ten to the ${sign === "⁻" ? "minus " : ""}${digitsOf(digits)}`
  );
  text = text.replace(/(\d)[eE]([-+−]?)(\d+)\b/g, (_, before: string, sign: string, power: string) =>
    tr ? `${before} çarpı on üzeri ${sign && sign !== "+" ? "eksi " : ""}${power}` : `${before} times ten to the ${sign && sign !== "+" ? "minus " : ""}${power}`
  );
  text = text.replace(/\b10\^\(?([-−]?)(\d+)\)?/g, (_, sign: string, power: string) =>
    tr ? `on üzeri ${sign ? "eksi " : ""}${power}` : `ten to the ${sign ? "minus " : ""}${power}`
  );
  text = text.replace(/cm⁻¹/g, tr ? " bölü santimetre" : " per centimetre");
  text = text.replace(/\b(s|min|M|mol|L|K|g|cm)⁻¹/g, (_, unit: string) => {
    const name = PER_UNITS[unit];
    return tr ? ` bölü ${name[0]}` : ` per ${name[1]}`;
  });
  text = text.replace(/R²/g, tr ? "R kare" : "R squared");
  // Subscripts to digits first, so formulas can be recognised by name.
  text = text.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => String(SUB_DIGITS.indexOf(d)));
  // Named ions: SO4²⁻ → "sülfat iyonu", Fe³⁺ → "demir üç iyonu".
  text = text.replace(/(?<![A-Za-z])((?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])/g, (whole, formula: string, digits: string, sign: string) => {
    const named = ION_NAMES[`${formula}${digitsOf(digits)}${sign === "⁺" ? "+" : "-"}`];
    return named ? ` ${tr ? named[0] : named[1]} ` : whole;
  });
  // "…iyonu iyonları" → "…iyonları"
  text = text.replace(/iyonu\s+(iyon\p{L}*)/gu, "$1").replace(/\bion\s+(ions?)\b/g, "$1");
  // Other charges: Fe³⁺ → "Fe 3 artı", SO4²⁻ → "SO4 2 eksi"
  text = text.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])/g, (_, digits: string, sign: string) => {
    const n = digitsOf(digits);
    return ` ${n}${n ? " " : ""}${sign === "⁺" ? (tr ? "artı" : "plus") : tr ? "eksi" : "minus"} `;
  });
  text = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => (tr ? ` üzeri ${digitsOf(digits)}` : ` to the ${digitsOf(digits)}`));

  // pH'ı, pH'ın… read as "pe ha değeri/değerinin" rather than letters with a stray suffix.
  text = text
    .replace(/\bpH'(?:ın|nın|sının|nin)(?!\p{L})/gu, tr ? "pe ha değerinin" : "pH")
    .replace(/\bpH'(?:a|ya|ye)(?!\p{L})/gu, tr ? "pe ha değerine" : "pH")
    .replace(/\bpH'\p{L}+/gu, tr ? "pe ha değeri" : "pH");
  // Bonds: C=O is a carbonyl; other double/triple bonds by their atoms.
  text = text
    .replace(/\bC=O\b/g, tr ? "karbonil" : "carbonyl")
    .replace(/\b([A-Z][a-z]?)=([A-Z][a-z]?)\b/g, tr ? "$1 $2 çift bağ" : "$1 $2 double bond")
    .replace(/\b([A-Z][a-z]?)≡([A-Z][a-z]?)\b/g, tr ? "$1 $2 üçlü bağ" : "$1 $2 triple bond")
    .replace(/\b([A-Z][a-z]?)[–—]([A-Z][a-z]?)\b/g, "$1 $2");
  // A coefficient stuck to a formula (5O2, 3CO2) is said as a number, then the formula.
  text = text.replace(/\b(\d+)(?=[A-Z(])/g, "$1 ");
  // Formulas by name, then any other formula letter by letter: C3H8O → "C 3 H 8 O".
  text = text.replace(/\b(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+\b/g, (formula) => {
    const named = NAMES[formula];
    if (named) return tr ? named[0] : named[1];
    if (!/\d/.test(formula) && !/[A-Z].*[A-Z]/.test(formula)) return formula;
    return formula.replace(/[()]/g, " ").replace(/(\d+)/g, " $1 ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])(?=[A-Z])/g, "$1 ");
  });

  const words: [RegExp, string, string][] = [
    [/→|->|⟶/g, " verir ", " gives "],
    [/\s\+\s/g, " artı ", " plus "],
    [/\s=\s/g, " eşittir ", " equals "],
    [/⇌/g, " ile dengede ", " in equilibrium with "],
    [/·/g, " ", " "],
    [/\bpOH\b/g, " pe o ha ", " p O H "],
    [/\bpKa\b/g, " pe ka a ", " p K a "],
    [/\bpKb\b/g, " pe ka be ", " p K b "],
    [/\bpH\b/g, " pe ha ", " p H "],
    [/\bKa\b/g, " ka a ", " K a "],
    [/\bKb\b/g, " ka be ", " K b "],
    [/\bKsp\b/g, " ka es pe ", " K s p "],
    [/g\/mol/g, " gram bölü mol", " grams per mole"],
    [/g\/mL/g, " gram bölü mililitre", " grams per millilitre"],
    [/g\/L/g, " gram bölü litre", " grams per litre"],
    [/mg\/L/g, " miligram bölü litre", " milligrams per litre"],
    [/mol\/L/g, " mol bölü litre", " moles per litre"],
    [/mol\/kg/g, " mol bölü kilogram", " moles per kilogram"],
    [/kJ\/mol/g, " kilojul bölü mol", " kilojoules per mole"],
    [/J\/mol/g, " jul bölü mol", " joules per mole"],
    [/°C/g, " santigrat derece", " degrees Celsius"],
    [/(\d)\s*°(?![CF])/g, "$1 derece", "$1 degrees"],
    [/(\d)\s*K\b/g, "$1 kelvin", "$1 kelvin"],
    [/(\d)\s*mM\b/g, "$1 milimolar", "$1 millimolar"],
    [/(\d)\s*µM\b/g, "$1 mikromolar", "$1 micromolar"],
    [/(\d)\s*M\b/g, "$1 molar", "$1 molar"],
    [/(\d)\s*mL\b/g, "$1 mililitre", "$1 millilitres"],
    [/(\d)\s*µL\b/g, "$1 mikrolitre", "$1 microlitres"],
    [/(\d)\s*L\b/g, "$1 litre", "$1 litres"],
    [/(\d)\s*mg\b/g, "$1 miligram", "$1 milligrams"],
    [/(\d)\s*kg\b/g, "$1 kilogram", "$1 kilograms"],
    [/(\d)\s*g\b/g, "$1 gram", "$1 grams"],
    [/(\d)\s*mmol\b/g, "$1 milimol", "$1 millimoles"],
    [/(\d)\s*mol\b/g, "$1 mol", "$1 moles"],
    [/(\d)\s*kPa\b/g, "$1 kilopaskal", "$1 kilopascals"],
    [/(\d)\s*atm\b/g, "$1 atmosfer", "$1 atmospheres"],
    [/(\d)\s*mmHg\b/g, "$1 milimetre cıva", "$1 millimetres of mercury"],
    [/(\d)\s*kJ\b/g, "$1 kilojul", "$1 kilojoules"],
    [/(\d)\s*nm\b/g, "$1 nanometre", "$1 nanometres"],
    [/(\d)\s*ppm\b/g, "$1 pe pe em", "$1 p p m"],
    [/(\d)\s*u\b/g, "$1 atomik kütle birimi", "$1 atomic mass units"],
    [/%\s*(\d+(?:[.,]\d+)?)/g, "yüzde $1", "$1 percent"],
    [/(\d+(?:[.,]\d+)?)\s*%/g, "yüzde $1", "$1 percent"],
    [/≈|~/g, " yaklaşık ", " about "],
    [/±/g, " artı eksi ", " plus or minus "],
    [/×/g, " çarpı ", " times "],
    [/Δ/g, " delta ", " delta "],
    [/−/g, " eksi ", " minus "],
    [/α/g, " alfa ", " alpha "],
    [/β/g, " beta ", " beta "],
    [/γ/g, " gama ", " gamma "],
    [/ε/g, " epsilon ", " epsilon "],
    [/λ/g, " lambda ", " lambda "],
    [/σ/g, " sigma ", " sigma "],
    [/ν/g, " nü ", " nu "],
    [/θ/g, " teta ", " theta "],
    [/π/g, " pi ", " pi "],
    [/Å/g, " angström", " angstrom"],
    [/[()[\]{}]/g, ", ", ", "],
  ];
  for (const [pattern, trWord, enWord] of words) text = text.replace(pattern, tr ? trWord : enWord);
  return text
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])(?=[^\s\d])/g, "$1 ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/^[,\s]+/, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 2400);
}
