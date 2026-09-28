// Chem+ app: the reference tables behind the Spectra module.
//
// The tables are the ones a student actually reaches for while staring at a printout: which bond
// absorbs where in the IR, which proton or carbon sits at a given shift, and what a mass
// difference between two peaks means. Ranges overlap on purpose - that is how the real tables
// read, and a finder that hides the overlap would teach the wrong lesson.

export type Technique = "ir" | "h-nmr" | "c-nmr" | "ms";

export const TECHNIQUE_LABELS: Record<Technique, { tr: string; en: string; unit: string }> = {
  ir: { tr: "IR", en: "IR", unit: "cm⁻¹" },
  "h-nmr": { tr: "¹H NMR", en: "¹H NMR", unit: "ppm" },
  "c-nmr": { tr: "¹³C NMR", en: "¹³C NMR", unit: "ppm" },
  ms: { tr: "Kütle (KS)", en: "Mass (MS)", unit: "m/z" },
};

export interface Band {
  id: string;
  /** Inclusive range in the technique's unit. */
  min: number;
  max: number;
  /** The bond or the proton/carbon environment. */
  assignment: { tr: string; en: string };
  /** The functional group it points at. */
  group: { tr: string; en: string };
  /** Intensity, shape, or the trick that tells it apart from its neighbours. */
  detail?: { tr: string; en: string };
}

/** Infrared absorption bands, high wavenumber first (the way a spectrum is read). */
export const IR_BANDS: Band[] = [
  {
    id: "oh-acid",
    min: 2500,
    max: 3300,
    assignment: { tr: "O–H gerilme", en: "O–H stretch" },
    group: { tr: "Karboksilik asit", en: "Carboxylic acid" },
    detail: {
      tr: "Çok geniş ve güçlü; C–H bandının üstüne biner. 1710 civarındaki C=O ile birlikte görülürse asit kesinleşir.",
      en: "Very broad and strong; it rides over the C–H band. Together with a C=O near 1710 it confirms an acid.",
    },
  },
  {
    id: "oh-alcohol",
    min: 3200,
    max: 3600,
    assignment: { tr: "O–H gerilme", en: "O–H stretch" },
    group: { tr: "Alkol / fenol", en: "Alcohol / phenol" },
    detail: {
      tr: "Hidrojen bağı yüzünden geniş ve yuvarlak. Seyreltik çözeltide 3600'e kayar ve incelir.",
      en: "Broad and rounded because of hydrogen bonding. In dilute solution it shifts to 3600 and sharpens.",
    },
  },
  {
    id: "nh-amine",
    min: 3300,
    max: 3500,
    assignment: { tr: "N–H gerilme", en: "N–H stretch" },
    group: { tr: "Amin", en: "Amine" },
    detail: {
      tr: "Orta şiddette, O–H'den daha ince. Birincil aminde iki çentik, ikincilde tek çentik verir.",
      en: "Medium, sharper than O–H. A primary amine gives two notches, a secondary amine one.",
    },
  },
  {
    id: "nh-amide",
    min: 3150,
    max: 3350,
    assignment: { tr: "N–H gerilme", en: "N–H stretch" },
    group: { tr: "Amit", en: "Amide" },
    detail: { tr: "1650 civarındaki amit C=O ile birlikte okunur.", en: "Read together with the amide C=O near 1650." },
  },
  {
    id: "ch-alkyne",
    min: 3290,
    max: 3320,
    assignment: { tr: "≡C–H gerilme", en: "≡C–H stretch" },
    group: { tr: "Uç alkin", en: "Terminal alkyne" },
    detail: { tr: "Çok ince ve güçlü; geniş O–H bandından bu keskinlikle ayrılır.", en: "Very sharp and strong; that sharpness separates it from a broad O–H." },
  },
  {
    id: "ch-sp2",
    min: 3000,
    max: 3100,
    assignment: { tr: "=C–H gerilme", en: "=C–H stretch" },
    group: { tr: "Alken / aromatik", en: "Alkene / aromatic" },
    detail: { tr: "3000'in hemen solunda kalır; alkan C–H'si hemen sağındadır.", en: "Sits just left of 3000; the alkane C–H sits just right of it." },
  },
  {
    id: "ch-sp3",
    min: 2850,
    max: 3000,
    assignment: { tr: "C–H gerilme", en: "C–H stretch" },
    group: { tr: "Alkan", en: "Alkane" },
    detail: { tr: "Neredeyse her organik bileşikte var; tek başına bilgi vermez.", en: "Present in almost every organic compound; on its own it says little." },
  },
  {
    id: "ch-aldehyde",
    min: 2700,
    max: 2850,
    assignment: { tr: "C–H gerilme (CHO)", en: "C–H stretch (CHO)" },
    group: { tr: "Aldehit", en: "Aldehyde" },
    detail: {
      tr: "2830 ve 2730'da iki küçük çentik (Fermi çifti). Aldehiti ketondan ayıran işarettir.",
      en: "Two small notches at 2830 and 2730 (a Fermi doublet). This is what tells an aldehyde from a ketone.",
    },
  },
  {
    id: "cn-nitrile",
    min: 2220,
    max: 2260,
    assignment: { tr: "C≡N gerilme", en: "C≡N stretch" },
    group: { tr: "Nitril", en: "Nitrile" },
    detail: { tr: "İnce ve orta şiddette; bu bölgede başka pik nadirdir.", en: "Sharp and medium; few other peaks appear in this region." },
  },
  {
    id: "cc-alkyne",
    min: 2100,
    max: 2260,
    assignment: { tr: "C≡C gerilme", en: "C≡C stretch" },
    group: { tr: "Alkin", en: "Alkyne" },
    detail: {
      tr: "Zayıf; simetrik iç alkinlerde hiç görünmez.",
      en: "Weak, and invisible altogether in a symmetrical internal alkyne.",
    },
  },
  {
    id: "co-anhydride",
    min: 1740,
    max: 1830,
    assignment: { tr: "C=O gerilme", en: "C=O stretch" },
    group: { tr: "Anhidrit", en: "Anhydride" },
    detail: { tr: "İki band (≈1820 ve ≈1760); bu çift anhidriti ele verir.", en: "Two bands (≈1820 and ≈1760); the pair gives an anhydride away." },
  },
  {
    id: "co-acid-chloride",
    min: 1770,
    max: 1815,
    assignment: { tr: "C=O gerilme", en: "C=O stretch" },
    group: { tr: "Asit klorür", en: "Acyl chloride" },
    detail: { tr: "Karbonillerin en yükseği.", en: "The highest of the carbonyls." },
  },
  {
    id: "co-ester",
    min: 1735,
    max: 1750,
    assignment: { tr: "C=O gerilme", en: "C=O stretch" },
    group: { tr: "Ester", en: "Ester" },
    detail: {
      tr: "1300-1000 arasındaki güçlü C–O bandıyla birlikte okunur; ikisi olmadan ester denmez.",
      en: "Read with the strong C–O band at 1300-1000; without both, do not call it an ester.",
    },
  },
  {
    id: "co-aldehyde",
    min: 1720,
    max: 1740,
    assignment: { tr: "C=O gerilme", en: "C=O stretch" },
    group: { tr: "Aldehit", en: "Aldehyde" },
    detail: { tr: "2830/2730 çiftiyle doğrulanır.", en: "Confirmed by the 2830/2730 pair." },
  },
  {
    id: "co-ketone",
    min: 1705,
    max: 1725,
    assignment: { tr: "C=O gerilme", en: "C=O stretch" },
    group: { tr: "Keton", en: "Ketone" },
    detail: {
      tr: "Konjugasyon (aril, alken) bandı ≈20 cm⁻¹ aşağı çeker; halka gerginliği yukarı iter.",
      en: "Conjugation (aryl, alkene) pulls it down ≈20 cm⁻¹; ring strain pushes it up.",
    },
  },
  {
    id: "co-acid",
    min: 1680,
    max: 1710,
    assignment: { tr: "C=O gerilme", en: "C=O stretch" },
    group: { tr: "Karboksilik asit", en: "Carboxylic acid" },
    detail: { tr: "2500-3300 arasındaki çok geniş O–H ile birlikte olmalı.", en: "Must come with the very broad O–H at 2500-3300." },
  },
  {
    id: "co-amide",
    min: 1630,
    max: 1690,
    assignment: { tr: "C=O gerilme (Amit I)", en: "C=O stretch (Amide I)" },
    group: { tr: "Amit", en: "Amide" },
    detail: { tr: "Karbonillerin en düşüğü; 1550 civarındaki N–H bükülmesi (Amit II) eşlik eder.", en: "The lowest carbonyl; the N–H bend (Amide II) near 1550 accompanies it." },
  },
  {
    id: "cc-alkene",
    min: 1620,
    max: 1680,
    assignment: { tr: "C=C gerilme", en: "C=C stretch" },
    group: { tr: "Alken", en: "Alkene" },
    detail: { tr: "Orta-zayıf; simetrik alkende kaybolur.", en: "Medium to weak; it disappears in a symmetrical alkene." },
  },
  {
    id: "cc-aromatic",
    min: 1450,
    max: 1620,
    assignment: { tr: "C=C halka gerilmesi", en: "C=C ring stretch" },
    group: { tr: "Aromatik", en: "Aromatic" },
    detail: { tr: "Genelde ≈1600 ve ≈1475'te iki-dört band.", en: "Usually two to four bands, typically near 1600 and 1475." },
  },
  {
    id: "no2",
    min: 1340,
    max: 1560,
    assignment: { tr: "N–O gerilme", en: "N–O stretch" },
    group: { tr: "Nitro", en: "Nitro" },
    detail: { tr: "≈1550 (asimetrik) ve ≈1350 (simetrik) iki güçlü band.", en: "Two strong bands: ≈1550 (asymmetric) and ≈1350 (symmetric)." },
  },
  {
    id: "ch-bend",
    min: 1370,
    max: 1470,
    assignment: { tr: "C–H bükülme", en: "C–H bend" },
    group: { tr: "Alkan", en: "Alkane" },
    detail: { tr: "≈1465 CH₂ makaslama, ≈1375 CH₃; gem-dimetilde 1375 ikiye yarılır.", en: "≈1465 CH₂ scissor, ≈1375 CH₃; in a gem-dimethyl the 1375 splits in two." },
  },
  {
    id: "co-single",
    min: 1000,
    max: 1300,
    assignment: { tr: "C–O gerilme", en: "C–O stretch" },
    group: { tr: "Alkol / eter / ester", en: "Alcohol / ether / ester" },
    detail: { tr: "Güçlü ama hangi sınıf olduğunu tek başına söylemez; C=O ve O–H ile birlikte okunur.", en: "Strong, but on its own it does not say which class; read it with the C=O and O–H." },
  },
  {
    id: "cn-single",
    min: 1020,
    max: 1250,
    assignment: { tr: "C–N gerilme", en: "C–N stretch" },
    group: { tr: "Amin", en: "Amine" },
  },
  {
    id: "ch-oop-aromatic",
    min: 690,
    max: 900,
    assignment: { tr: "Aromatik C–H düzlem dışı bükülme", en: "Aromatic C–H out-of-plane bend" },
    group: { tr: "Aromatik sübstitüsyon", en: "Aromatic substitution" },
    detail: {
      tr: "Halkadaki sübstitüsyon desenini verir: mono ≈750+690, orto ≈750, meta ≈780+690, para ≈820.",
      en: "Gives the substitution pattern: mono ≈750+690, ortho ≈750, meta ≈780+690, para ≈820.",
    },
  },
  {
    id: "ch-oop-alkene",
    min: 650,
    max: 1000,
    assignment: { tr: "=C–H düzlem dışı bükülme", en: "=C–H out-of-plane bend" },
    group: { tr: "Alken sübstitüsyonu", en: "Alkene substitution" },
    detail: { tr: "trans ≈965, cis ≈700, uç =CH₂ ≈890.", en: "trans ≈965, cis ≈700, terminal =CH₂ ≈890." },
  },
  {
    id: "c-cl",
    min: 600,
    max: 800,
    assignment: { tr: "C–Cl gerilme", en: "C–Cl stretch" },
    group: { tr: "Alkil klorür", en: "Alkyl chloride" },
  },
  {
    id: "c-br",
    min: 500,
    max: 600,
    assignment: { tr: "C–Br gerilme", en: "C–Br stretch" },
    group: { tr: "Alkil bromür", en: "Alkyl bromide" },
  },
];

/** Proton chemical shifts, low field last. */
export const H_NMR_SHIFTS: Band[] = [
  {
    id: "tms",
    min: 0,
    max: 0,
    assignment: { tr: "TMS referansı", en: "TMS reference" },
    group: { tr: "Referans", en: "Reference" },
    detail: { tr: "Tanım gereği 0 ppm.", en: "Zero by definition." },
  },
  {
    id: "ch3",
    min: 0.7,
    max: 1.3,
    assignment: { tr: "R–CH₃", en: "R–CH₃" },
    group: { tr: "Alkan", en: "Alkane" },
    detail: { tr: "En sağdaki kalabalık; integral genelde 3'ün katları.", en: "The crowd furthest right; the integral is usually a multiple of three." },
  },
  {
    id: "ch2",
    min: 1.2,
    max: 1.5,
    assignment: { tr: "R–CH₂–R", en: "R–CH₂–R" },
    group: { tr: "Alkan", en: "Alkane" },
  },
  {
    id: "ch",
    min: 1.4,
    max: 1.8,
    assignment: { tr: "R₃C–H", en: "R₃C–H" },
    group: { tr: "Alkan", en: "Alkane" },
  },
  {
    id: "allylic",
    min: 1.6,
    max: 2.6,
    assignment: { tr: "Allilik C–H", en: "Allylic C–H" },
    group: { tr: "Alkene komşu", en: "Next to an alkene" },
  },
  {
    id: "alpha-carbonyl",
    min: 2.0,
    max: 2.6,
    assignment: { tr: "C=O'ya komşu C–H", en: "C–H next to C=O" },
    group: { tr: "Keton / aldehit / ester", en: "Ketone / aldehyde / ester" },
    detail: { tr: "Metil keton (CH₃CO–) ≈2.1'de keskin bir tekli verir.", en: "A methyl ketone (CH₃CO–) gives a sharp singlet near 2.1." },
  },
  {
    id: "benzylic",
    min: 2.2,
    max: 2.9,
    assignment: { tr: "Benzilik C–H", en: "Benzylic C–H" },
    group: { tr: "Aromatik halkaya komşu", en: "Next to an aromatic ring" },
  },
  {
    id: "c-n",
    min: 2.4,
    max: 3.1,
    assignment: { tr: "C–H (N'ye bağlı karbonda)", en: "C–H on carbon bearing N" },
    group: { tr: "Amin", en: "Amine" },
  },
  {
    id: "c-o",
    min: 3.3,
    max: 4.0,
    assignment: { tr: "C–H (O'ya bağlı karbonda)", en: "C–H on carbon bearing O" },
    group: { tr: "Alkol / eter", en: "Alcohol / ether" },
    detail: { tr: "Metoksi (–OCH₃) ≈3.4-3.8'de tekli.", en: "A methoxy (–OCH₃) is a singlet near 3.4-3.8." },
  },
  {
    id: "ester-o-ch",
    min: 3.9,
    max: 4.5,
    assignment: { tr: "–O–CH (ester alkol tarafı)", en: "–O–CH (ester alcohol side)" },
    group: { tr: "Ester", en: "Ester" },
  },
  {
    id: "vinyl",
    min: 4.5,
    max: 6.5,
    assignment: { tr: "Vinilik =C–H", en: "Vinylic =C–H" },
    group: { tr: "Alken", en: "Alkene" },
    detail: { tr: "Eşleşme sabiti cis/trans'ı söyler: trans ≈15 Hz, cis ≈10 Hz.", en: "The coupling constant tells cis from trans: trans ≈15 Hz, cis ≈10 Hz." },
  },
  {
    id: "aromatic",
    min: 6.5,
    max: 8.2,
    assignment: { tr: "Aromatik C–H", en: "Aromatic C–H" },
    group: { tr: "Aromatik", en: "Aromatic" },
    detail: {
      tr: "Elektron çeken grup aşağı (sola), veren grup yukarı (sağa) kaydırır.",
      en: "An electron-withdrawing group shifts it downfield, a donating group upfield.",
    },
  },
  {
    id: "aldehyde-h",
    min: 9.4,
    max: 10.5,
    assignment: { tr: "–CHO", en: "–CHO" },
    group: { tr: "Aldehit", en: "Aldehyde" },
    detail: { tr: "Spektrumun en solunda yalnız duran tek proton; aldehiti hemen ele verir.", en: "A lone proton at the far left of the spectrum; it gives an aldehyde away at once." },
  },
  {
    id: "acid-h",
    min: 10,
    max: 13,
    assignment: { tr: "–COOH", en: "–COOH" },
    group: { tr: "Karboksilik asit", en: "Carboxylic acid" },
    detail: { tr: "Çok geniş; D₂O ile çalkalanınca kaybolur.", en: "Very broad; it disappears on shaking with D₂O." },
  },
  {
    id: "oh-h",
    min: 1,
    max: 5,
    assignment: { tr: "O–H (alkol)", en: "O–H (alcohol)" },
    group: { tr: "Alkol", en: "Alcohol" },
    detail: {
      tr: "Yeri derişime ve çözücüye göre gezer; D₂O çalkalamasıyla kaybolması kimliğini doğrular.",
      en: "Its position wanders with concentration and solvent; disappearing on a D₂O shake confirms it.",
    },
  },
  {
    id: "nh-h",
    min: 0.5,
    max: 5,
    assignment: { tr: "N–H (amin)", en: "N–H (amine)" },
    group: { tr: "Amin", en: "Amine" },
    detail: { tr: "Geniş, değişken, D₂O ile kaybolur.", en: "Broad, variable, and lost on a D₂O shake." },
  },
  {
    id: "amide-nh",
    min: 5,
    max: 9,
    assignment: { tr: "N–H (amit)", en: "N–H (amide)" },
    group: { tr: "Amit", en: "Amide" },
  },
];

/** Carbon chemical shifts. */
export const C_NMR_SHIFTS: Band[] = [
  { id: "c-ch3", min: 5, max: 30, assignment: { tr: "CH₃", en: "CH₃" }, group: { tr: "Alkan", en: "Alkane" } },
  { id: "c-ch2", min: 20, max: 45, assignment: { tr: "CH₂", en: "CH₂" }, group: { tr: "Alkan", en: "Alkane" } },
  { id: "c-ch", min: 30, max: 50, assignment: { tr: "CH", en: "CH" }, group: { tr: "Alkan", en: "Alkane" } },
  {
    id: "c-halide",
    min: 10,
    max: 65,
    assignment: { tr: "C–X (Cl, Br, I)", en: "C–X (Cl, Br, I)" },
    group: { tr: "Alkil halojenür", en: "Alkyl halide" },
    detail: { tr: "İyottan flora doğru şiddetle aşağı kayar; C–I çok yukarıdadır.", en: "It moves sharply downfield from iodine to fluorine; C–I is far upfield." },
  },
  { id: "c-n", min: 20, max: 60, assignment: { tr: "C–N", en: "C–N" }, group: { tr: "Amin", en: "Amine" } },
  {
    id: "c-o",
    min: 50,
    max: 90,
    assignment: { tr: "C–O", en: "C–O" },
    group: { tr: "Alkol / eter", en: "Alcohol / ether" },
  },
  { id: "c-alkyne", min: 65, max: 90, assignment: { tr: "C≡C", en: "C≡C" }, group: { tr: "Alkin", en: "Alkyne" } },
  {
    id: "c-alkene",
    min: 100,
    max: 150,
    assignment: { tr: "C=C", en: "C=C" },
    group: { tr: "Alken", en: "Alkene" },
  },
  {
    id: "c-aromatic",
    min: 110,
    max: 160,
    assignment: { tr: "Aromatik C", en: "Aromatic C" },
    group: { tr: "Aromatik", en: "Aromatic" },
    detail: { tr: "Alken bölgesiyle çakışır; DEPT ile ayırmak gerekir.", en: "It overlaps the alkene region; DEPT is needed to separate them." },
  },
  { id: "c-nitrile", min: 115, max: 125, assignment: { tr: "C≡N", en: "C≡N" }, group: { tr: "Nitril", en: "Nitrile" } },
  {
    id: "c-acid-ester",
    min: 155,
    max: 185,
    assignment: { tr: "C=O", en: "C=O" },
    group: { tr: "Asit / ester / amit", en: "Acid / ester / amide" },
  },
  {
    id: "c-ketone",
    min: 185,
    max: 220,
    assignment: { tr: "C=O", en: "C=O" },
    group: { tr: "Aldehit / keton", en: "Aldehyde / ketone" },
    detail: { tr: "Spektrumun en solu; ketonlar ≈205, aldehitler ≈200.", en: "The far left of the spectrum; ketones ≈205, aldehydes ≈200." },
  },
];

export interface FragmentLoss {
  mass: number;
  fragment: string;
  meaning: { tr: string; en: string };
}

/** Differences between the molecular ion and a fragment peak. */
export const MS_LOSSES: FragmentLoss[] = [
  { mass: 1, fragment: "H", meaning: { tr: "Hidrojen; aldehitlerde sık", en: "Hydrogen; common in aldehydes" } },
  { mass: 15, fragment: "CH₃", meaning: { tr: "Metil grubu", en: "Methyl group" } },
  { mass: 17, fragment: "OH", meaning: { tr: "Hidroksil; alkol veya asit", en: "Hydroxyl; alcohol or acid" } },
  { mass: 18, fragment: "H₂O", meaning: { tr: "Su kaybı; alkollerin imzası", en: "Loss of water; the signature of alcohols" } },
  { mass: 28, fragment: "CO / C₂H₄ / N₂", meaning: { tr: "Karbonil veya eten kaybı", en: "Loss of carbonyl or ethene" } },
  { mass: 29, fragment: "CHO / C₂H₅", meaning: { tr: "Formil veya etil", en: "Formyl or ethyl" } },
  { mass: 31, fragment: "OCH₃", meaning: { tr: "Metoksi; metil ester", en: "Methoxy; methyl ester" } },
  { mass: 35, fragment: "Cl", meaning: { tr: "Klor (³⁵Cl)", en: "Chlorine (³⁵Cl)" } },
  { mass: 43, fragment: "C₃H₇ / CH₃CO", meaning: { tr: "Propil veya asetil", en: "Propyl or acetyl" } },
  { mass: 45, fragment: "COOH / OC₂H₅", meaning: { tr: "Karboksil veya etoksi", en: "Carboxyl or ethoxy" } },
  { mass: 60, fragment: "CH₃COOH", meaning: { tr: "Asetik asit; McLafferty ürünü", en: "Acetic acid; a McLafferty product" } },
  { mass: 77, fragment: "C₆H₅", meaning: { tr: "Fenil halkası", en: "Phenyl ring" } },
  { mass: 91, fragment: "C₇H₇", meaning: { tr: "Tropilyum; benzilik bileşiklerin taban piki", en: "Tropylium; the base peak of benzylic compounds" } },
  { mass: 105, fragment: "C₆H₅CO", meaning: { tr: "Benzoil", en: "Benzoyl" } },
];

export interface IsotopeClue {
  element: string;
  pattern: string;
  note: { tr: string; en: string };
}

export const MS_ISOTOPES: IsotopeClue[] = [
  {
    element: "Cl",
    pattern: "M : M+2 ≈ 3 : 1",
    note: { tr: "Bir klor atomu. İki klorda 9:6:1 olur.", en: "One chlorine. Two chlorines give 9:6:1." },
  },
  {
    element: "Br",
    pattern: "M : M+2 ≈ 1 : 1",
    note: { tr: "Bir brom atomu; eşit yükseklikte iki pik.", en: "One bromine; two peaks of equal height." },
  },
  {
    element: "S",
    pattern: "M+2 ≈ %4.4",
    note: { tr: "Kükürt; küçük ama ölçülebilir bir M+2.", en: "Sulfur; a small but measurable M+2." },
  },
  {
    element: "C",
    pattern: "M+1 ≈ karbon sayısı × %1.1",
    note: {
      tr: "M+1 yüksekliğini 1.1'e bölmek karbon sayısını verir.",
      en: "Dividing the M+1 height by 1.1 gives the number of carbons.",
    },
  },
  {
    element: "N",
    pattern: "Azot kuralı",
    note: {
      tr: "Tek sayılı moleküler iyon kütlesi, tek sayıda azot demektir.",
      en: "An odd molecular ion mass means an odd number of nitrogens.",
    },
  },
];

export function bandsFor(technique: Technique): Band[] {
  if (technique === "ir") return IR_BANDS;
  if (technique === "h-nmr") return H_NMR_SHIFTS;
  return C_NMR_SHIFTS;
}

/** Every band whose range contains the value; IR ranges are wide, so several can match at once. */
export function matchBands(technique: Technique, value: number): Band[] {
  return bandsFor(technique).filter((band) => value >= band.min && value <= band.max);
}

/** Losses within a tolerance of the given mass difference. */
export function matchLosses(difference: number, tolerance = 0.5): FragmentLoss[] {
  return MS_LOSSES.filter((loss) => Math.abs(loss.mass - difference) <= tolerance);
}
