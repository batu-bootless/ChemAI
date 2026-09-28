// Chem+ app: the calculation engine's tools - what ChemPlus AI can ask the app to compute.
//
// The AI never does arithmetic here. It picks a tool and writes its arguments; the tool runs in
// the app, deterministically, and hands back three things: data for the card the user sees, a
// compact text for the AI to phrase its answer around, and the checks it ran on its own result
// (atoms conserved, pH in range, root really a root). A tool that cannot run says so - it never
// guesses - and the AI is told it failed.

import { solvePh, titrate, type AcidBaseComponent, type PhResult, type TitrationResult } from "./acidbase";
import { balanceEquation, type BalancedEquation } from "./balance";
import { CONSTANTS, compile, evaluate, freeNames, usedConstants } from "./expr";
import { fixed, fmt, plain, type Language } from "./format";
import { composition, hillFormula, molarMass, monoisotopicMass, parseFormula, prettyFormula, type CompositionRow } from "./formula";
import { dilution, idealGas, prepareSolution, type DilutionResult, type GasResult, type PrepResult } from "./lab";
import { findRoots } from "./numeric";
import { analyseSmiles, type MoleculeInfo } from "./rdkit";
import { lookupPubChem, smilesForName, type PubChemInfo } from "./pubchem";
import { analyseComplex, findCounterIon, findLigand, LIGAND_IDS, parseComplexFormula, pointGroupText, type ComplexInput, type ComplexResult, type Geometry } from "./complexes";
import { analyseCluster, CLUSTER_NAMES, findCluster } from "./clusters";
import { analyseVsepr, splitFormula, type VseprInput, type VseprResult } from "./vsepr";
import { stoichiometry, type Amount, type StoichResult } from "./stoich";
import { convert as convertUnit, unitLabel } from "./units";
import { describe, fitLine, inverse, grubbsTest, qTest, confidenceHalfWidth, type Description, type Fit } from "@/lib/analysis/stats";
import { matchBands, matchLosses, type Technique } from "@/lib/spectra/data";
import { searchChemicals, INCOMPATIBILITY_LABELS, FIRST_AID, STORAGE, type SafetyChemical } from "@/lib/safety/chemicals";
import { hazardText, precautionText } from "@/lib/safety/statements";
import { runGraph, runInventoryAdd, runLabReport, runNote, runProtocol, runTimer } from "@/lib/agent/actions";
import type { GraphCardData, InventoryCardData, NoteCardData, ProtocolCardData, ReportCardData, TimerCardData } from "@/lib/agent/types";

export const TOOL_NAMES = [
  "molar_mass",
  "molecule",
  "complex",
  "vsepr",
  "balance",
  "stoichiometry",
  "ph",
  "titration",
  "solution_prep",
  "dilution",
  "gas",
  "evaluate",
  "solve",
  "convert",
  "regression",
  "stats",
  "spectra",
  "safety",
  "pubchem",
  // Actions in the app's modules (src/lib/agent/actions.ts): they do something, then show it.
  "timer",
  "note",
  "protocol",
  "inventory_add",
  "lab_report",
  "graph",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
}

/**
 * rdkit: RDKit on the device · engine: the app's solvers · reference: the app's tables · database:
 * PubChem · app: an action done in one of the app's modules.
 */
export type ToolSource = "rdkit" | "engine" | "reference" | "database" | "app";

interface Base<T extends ToolName, D> {
  tool: T;
  args: Record<string, unknown>;
  ok: true;
  source: ToolSource;
  /** One line naming what was computed, for the card header. */
  title: string;
  /** Compact result for the AI to answer from. */
  llm: string;
  /** Checks the tool ran on its own result, shown on the card. */
  checks: string[];
  /** Cautions (approximation limits, balance precision), shown on the card and given to the AI. */
  notes: string[];
  data: D;
}

export type ToolResult =
  | Base<"molar_mass", { pretty: string; hill: string; molarMass: number; exactMass: number | null; charge: number; rows: CompositionRow[] }>
  | Base<"molecule", MoleculeInfo & { name?: string }>
  | Base<"complex", ComplexResult & { name?: string }>
  | Base<"vsepr", VseprResult & { name?: string }>
  | Base<"balance", BalancedEquation>
  | Base<"stoichiometry", StoichResult>
  | Base<"ph", PhResult & { components: AcidBaseComponent[] }>
  | Base<"titration", TitrationResult & { analyte: string; titrant: string }>
  | Base<"solution_prep", PrepResult & { concentration: number; volume: number }>
  | Base<"dilution", DilutionResult>
  | Base<"gas", GasResult>
  | Base<"evaluate", { expression: string; variables: Record<string, number>; value: number; unit: string; label: string; constants: string[] }>
  | Base<"solve", { equation: string; variable: string; roots: number[]; unit: string; variables: Record<string, number> }>
  | Base<"convert", { value: number; from: string; to: string; result: number }>
  | Base<"regression", { fit: Fit; points: { x: number; y: number }[]; xLabel: string; yLabel: string; unknown?: { signal: number; value: number } }>
  | Base<"stats", { description: Description; ci95: number; grubbs: ReturnType<typeof grubbsTest>; q: ReturnType<typeof qTest> }>
  | Base<"spectra", { technique: Technique; matches: { value: number; bands: { assignment: string; group: string; range: string; detail?: string }[] }[]; losses?: { difference: number; matches: string[] } }>
  | Base<"safety", { query: string; chemical: SafetyChemical | null; alternatives: string[] }>
  | Base<"pubchem", PubChemInfo & { svg?: string }>
  | Base<"timer", TimerCardData>
  | Base<"note", NoteCardData>
  | Base<"protocol", ProtocolCardData>
  | Base<"inventory_add", InventoryCardData>
  | Base<"lab_report", ReportCardData>
  | Base<"graph", GraphCardData>;

export interface ToolFailure {
  tool: string;
  args: Record<string, unknown>;
  ok: false;
  error: string;
}

export type ToolOutcome = ToolResult | ToolFailure;

// --- argument helpers ------------------------------------------------------------------------------

class ArgError extends Error {}

/** Numbers from the AI can arrive as "0,1", "1.8e-5", "1,8×10^-5" or plain numbers. */
function num(value: unknown, label: string, optional = false): number | undefined {
  if (value === null || value === undefined || value === "") {
    if (optional) return undefined;
    throw new ArgError(`${label} değeri eksik.`);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const text = value.trim().replace(/\s/g, "").replace(/,(?=\d)/g, ".").replace(/[×x]10\^?/i, "e").replace(/−/g, "-");
    const parsed = Number(text);
    if (Number.isFinite(parsed)) return parsed;
    try {
      return evaluate(value);
    } catch {
      // fall through
    }
  }
  if (optional) return undefined;
  throw new ArgError(`${label} bir sayı olmalı.`);
}

function str(value: unknown, label: string, optional = false): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (optional) return "";
  throw new ArgError(`${label} eksik.`);
}

function list(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((v, i) => num(v, `değer ${i + 1}`) as number);
  if (value === undefined || value === null || value === "") return [];
  return [num(value, "değer") as number];
}

function pKaFrom(input: Record<string, unknown>, which: "a" | "b"): number[] {
  const p = list(input[`pK${which}`]);
  if (p.length) return p;
  const k = list(input[`K${which}`] ?? input[`k${which}`]);
  return k.map((value) => -Math.log10(value));
}

const TYPE_ALIASES: Record<string, AcidBaseComponent["type"]> = {
  strong_acid: "strong_acid",
  strongacid: "strong_acid",
  strong_base: "strong_base",
  strongbase: "strong_base",
  weak_acid: "weak_acid",
  weakacid: "weak_acid",
  weak_base: "weak_base",
  weakbase: "weak_base",
  salt_of_weak_acid: "salt_of_weak_acid",
  conjugate_base: "salt_of_weak_acid",
  salt_of_weak_base: "salt_of_weak_base",
  conjugate_acid: "salt_of_weak_base",
};

function acidBaseComponent(raw: unknown): AcidBaseComponent {
  if (!raw || typeof raw !== "object") throw new ArgError("Bileşen tanımı eksik.");
  const input = raw as Record<string, unknown>;
  const type = TYPE_ALIASES[String(input.type ?? "").toLowerCase().replace(/[\s-]+/g, "_")];
  if (!type) throw new ArgError(`Bilinmeyen bileşen türü: ${String(input.type)}.`);
  const c = num(input.c ?? input.concentration ?? input.C, "Derişim (c)") as number;
  const name = typeof input.name === "string" ? input.name : undefined;
  switch (type) {
    case "strong_acid":
    case "strong_base":
      return { type, c, n: (num(input.n, "n", true) ?? 1) as number, name };
    case "weak_acid":
      return { type, c, pKa: pKaFrom(input, "a"), name };
    case "salt_of_weak_acid":
      return { type, c, pKa: pKaFrom(input, "a"), protonsRemoved: num(input.protonsRemoved ?? input.protons_removed, "", true), name };
    case "weak_base":
    case "salt_of_weak_base":
      return { type, c, pKb: pKaFrom(input, "b"), name };
  }
}

function amount(raw: unknown): Amount {
  const input = (raw ?? {}) as Record<string, unknown>;
  return { species: str(input.species, "Madde"), amount: num(input.amount, "Miktar") as number, unit: str(input.unit, "Birim", true) || "g" };
}

// --- structure arguments ----------------------------------------------------------------------------

/** "fe" → "Fe", "CL" → "Cl". */
function symbol(text: string): string {
  const clean = text.trim().replace(/[^A-Za-z]/g, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/** A name with a count, in any of the ways a planner writes it. */
function namedCounts(value: unknown, label: string): [string, number][] {
  const out: [string, number][] = [];
  const push = (name: string, count: unknown) => {
    const n = count === undefined || count === null || count === "" ? 1 : num(count, `${label} sayısı`)!;
    if (name.trim()) out.push([name.trim(), n]);
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        const match = item.trim().match(/^(\d+)\s*[x×]?\s*(.+)$/);
        if (match) push(match[2], match[1]);
        else push(item, 1);
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(String(o.ligand ?? o.name ?? o.id ?? o.atom ?? o.ion ?? o.type ?? o.symbol ?? ""), o.count ?? o.n ?? o.number ?? o.amount);
      }
    }
  } else if (value && typeof value === "object") {
    for (const [name, count] of Object.entries(value)) push(name, count);
  } else if (typeof value === "string") {
    for (const part of value.split(/[,;+]/)) {
      const match = part.trim().match(/^(\d+)\s*[x×]?\s*(.+)$/);
      if (match) push(match[2], match[1]);
      else push(part, 1);
    }
  }
  return out;
}

const ROMAN_VALUES: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, "0": 0 };

/** "+4", "4", "IV", "(IV)" → 4. */
function oxidationState(value: unknown): number | undefined {
  if (typeof value === "string") {
    const text = value.replace(/[()\s]/g, "").toUpperCase();
    const negative = text.startsWith("-") || text.startsWith("−");
    const roman = ROMAN_VALUES[text.replace(/^[+\-−]/, "")];
    if (roman !== undefined) return negative ? -roman : roman;
  }
  return num(value, "Yükseltgenme basamağı", true);
}

const GEOMETRY_WORDS: [RegExp, Geometry][] = [
  [/okta|octa/i, "octahedral"],
  [/kare\s*d[üu]zlem|square[\s_-]*planar/i, "square_planar"],
  [/kare\s*piramit|square[\s_-]*pyramid/i, "square_pyramidal"],
  [/[çc]ift\s*piramit|bipyramid/i, "trigonal_bipyramidal"],
  [/tetra|d[öo]rty[üu]zl[üu]/i, "tetrahedral"],
  [/[üu][çc]gen\s*d[üu]zlem|trigonal[\s_-]*planar/i, "trigonal_planar"],
  [/do[ğg]rusal|linear/i, "linear"],
];

function geometryArg(value: unknown): Geometry | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return GEOMETRY_WORDS.find(([pattern]) => pattern.test(value))?.[1];
}

// --- the tools ------------------------------------------------------------------------------------

type Runner = (args: Record<string, unknown>, language: Language, earlier: ToolOutcome[]) => Promise<ToolResult> | ToolResult;

/** An action's failure is the tool's failure (runTool reports it); a success is its result. */
async function acted(outcome: Promise<ToolOutcome>): Promise<ToolResult> {
  const result = await outcome;
  if (!result.ok) throw new Error(result.error);
  return result;
}

const RUNNERS: Record<ToolName, Runner> = {
  timer: (args, language) => acted(runTimer(args, language)),
  note: (args, language) => acted(runNote(args, language)),
  protocol: (args, language, earlier) => acted(runProtocol(args, language, earlier)),
  inventory_add: (args, language) => acted(runInventoryAdd(args, language)),
  lab_report: (args, language) => acted(runLabReport(args, language)),
  graph: (args, language) => acted(runGraph(args, language)),
  molar_mass(args, language) {
    const formula = str(args.formula, "Formül");
    const parsed = parseFormula(formula);
    const mass = molarMass(parsed);
    const exact = monoisotopicMass(parsed);
    const rows = composition(parsed, language);
    const pretty = prettyFormula(parsed);
    const total = rows.reduce((sum, row) => sum + row.percent, 0);
    return {
      tool: "molar_mass",
      args,
      ok: true,
      source: "engine",
      title: `${pretty} · ${language === "en" ? "molar mass" : "mol kütlesi"}`,
      llm:
        `${pretty} (Hill: ${hillFormula(parsed)}): M = ${plain(mass, 7)} g/mol` +
        (exact !== null ? `; monoizotopik kütle = ${plain(exact, 9)} u` : "") +
        `; kütlece bileşim: ${rows.map((row) => `${row.symbol} ${row.count}× → %${plain(row.percent, 5)}`).join(", ")}` +
        ". Kaynak: IUPAC standart atom kütleleri (C 12,011, H 1,008, O 15,999).",
      checks: [
        language === "en" ? `Mass percentages add up to ${fixed(total, 2, language)} %` : `Kütle yüzdeleri toplamı %${fixed(total, 2, language)}`,
      ],
      notes: parsed.charge !== 0 ? [language === "en" ? "Ion: electron mass included in the exact mass." : "İyon: tam kütlede elektron kütlesi hesaba katıldı."] : [],
      data: { pretty, hill: hillFormula(parsed), molarMass: mass, exactMass: exact, charge: parsed.charge, rows },
    };
  },

  async molecule(args, language) {
    const name = str(args.name, "Ad", true) || undefined;
    const written = str(args.smiles, "SMILES", true);
    if (!written && !name) throw new ArgError("SMILES ya da molekül adı eksik.");
    // No SMILES, or one RDKit rejects: a named compound's structure is taken from its record.
    let fromRecord: Awaited<ReturnType<typeof smilesForName>>["provider"] | null = null;
    let info: MoleculeInfo;
    if (written) {
      try {
        info = await analyseSmiles(written);
      } catch (error) {
        if (!name) throw error;
        const record = await smilesForName(name).catch(() => {
          throw error;
        });
        info = await analyseSmiles(record.smiles);
        fromRecord = record.provider;
      }
    } else {
      const record = await smilesForName(name!);
      info = await analyseSmiles(record.smiles);
      fromRecord = record.provider;
    }
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    const recordName = fromRecord === "cactus" ? "NCI CACTUS" : "PubChem";
    return {
      tool: "molecule",
      args,
      ok: true,
      source: "rdkit",
      title: name ? `${name} · RDKit` : `${info.formula} · RDKit`,
      llm:
        `${name ? `${name}: ` : ""}SMILES (kanonik) ${info.canonicalSmiles}; formül ${info.formulaPlain}; ` +
        `ortalama mol kütlesi ${plain(info.averageMass, 7)} g/mol; monoizotopik kütle ${plain(info.exactMass, 9)} u; ` +
        `InChI ${info.inchi || "-"}; InChIKey ${info.inchiKey || "-"}; ağır atom ${info.heavyAtoms}; HBD ${info.hbd}; HBA ${info.hba}; ` +
        `dönebilir bağ ${info.rotatableBonds}; halka ${info.rings} (aromatik ${info.aromaticRings}); stereomerkez ${info.stereocenters}; ` +
        `TPSA ${plain(info.tpsa, 4)} Å²; cLogP ${plain(info.logP, 3)}; Lipinski ihlali ${info.lipinskiViolations}. ` +
        (info.hybridisation.length ? `hibritleşme (bağ düzenine göre): ${info.hybridisation.map((h) => `${h.label} ×${h.count}`).join(", ")}; ` : "") +
        (info.model ? "3B top-çubuk modeli de çizildi. " : "") +
        `Kaynak: RDKit ${info.rdkitVersion} (cihazda çalıştı)` +
        (fromRecord ? `; yapı (SMILES) ${recordName} kaydından alındı` : "") +
        ". 2B yapı çizimi kullanıcıya gösterildi.",
      checks: [
        t("RDKit yapıyı geçerli buldu (SMILES ayrıştırıldı, değerlikler tutarlı)", "RDKit accepted the structure (SMILES parsed, valences consistent)"),
        ...(info.inchiKey ? [t("InChIKey üretildi", "InChIKey generated")] : []),
      ],
      notes: fromRecord
        ? [t(`Yapı "${name}" adıyla ${recordName} kaydından alındı.`, `The structure was taken from the ${recordName} record for "${name}".`)]
        : name
          ? [t(`Yapı "${name}" adına göre yazıldı; kimliği InChIKey ile doğrulayın.`, `The structure was written from the name "${name}"; confirm its identity by InChIKey.`)]
          : [],
      data: { ...info, name },
    };
  },

  complex(args, language) {
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    const name = str(args.name, "Ad", true) || undefined;
    const formula = str(args.formula ?? args.compound, "Formül", true);
    const nuclearity = num(args.nuclearity ?? args.metal_count ?? args.metals_count, "Metal sayısı", true) ?? 1;
    const ligandPairs = namedCounts(args.ligands ?? args.ligand, "Ligand");

    // A multinuclear compound (Mn2(CO)10, [Re2Cl8]2-, a paddlewheel…) from the app's library.
    const metalText = str(args.metal ?? args.center ?? args.centre ?? args.central, "Metal", true);
    const composed = nuclearity > 1 && metalText ? `${symbol(metalText)}${nuclearity}${ligandPairs.map(([l, n]) => `(${l})${n > 1 ? n : ""}`).join("")}` : "";
    const cluster = [formula, name ?? "", composed].map((text) => (text ? findCluster(text) : null)).find(Boolean) ?? null;
    if (cluster || nuclearity > 1) {
      if (!cluster) {
        throw new ArgError(
          `Bu çok çekirdekli yapı kütüphanede yok (kütüphane: ${CLUSTER_NAMES.join(", ")}). Başka çok çekirdekli yapılar için molecule aracına metal içeren bir SMILES verin.`
        );
      }
      const r = analyseCluster(cluster, language);
      return {
        tool: "complex",
        args,
        ok: true,
        source: "engine",
        title: `${name ?? r.compound} · ${t("yapı", "structure")}`,
        llm:
          `Çok çekirdekli bileşik (uygulamanın yapı kütüphanesi, cihazda 3B kuruldu): ${r.compound}; IUPAC adı: ${r.nameTr} / ${r.nameEn}; ` +
          `formül ${r.hill}; mol kütlesi ${plain(r.molarMass, 6)} g/mol; ${r.centres} ${r.metal} merkezi, her biri ${r.oxidationState >= 0 ? "+" : ""}${r.oxidationState}` +
          (r.dElectrons !== null ? `, d${r.dElectrons}` : "") +
          `; ${r.coordinationText}; yapı: ${r.geometryName}; metal–metal: ${r.metalMetal}; ligandlar: ${r.ligands.map((l) => `${l.count}× ${l.name}`).join(", ")}; ` +
          `metal başına valens elektronu ${r.valenceElectrons}; eşleşmemiş elektron ${r.unpaired} (${r.unpaired ? "paramanyetik" : "diyamanyetik"})` +
          (r.pointGroup ? `; nokta grubu ${pointGroupText(r.pointGroup)}` : "") +
          `.${r.notes.length ? ` Not: ${r.notes.join(" ")}` : ""}`,
        checks: [t("Uygulamanın çok çekirdekli yapı kütüphanesinden kuruldu", "Built from the app's library of multinuclear compounds"), t("Mol kütlesi modeldeki atomlardan", "Molar mass from the model's atoms")],
        notes: [...r.notes, t("Çizim idealize edilmiş bir modeldir; bağ uzunlukları yaklaşıktır.", "The drawing is an idealised model; bond lengths are approximate.")],
        data: { ...r, name },
      };
    }

    const ligands = ligandPairs.map(([ligandName, count]) => {
      const ligand = findLigand(ligandName);
      if (!ligand) throw new ArgError(`"${ligandName}" ligandı tanınmadı; desteklenenler: ${LIGAND_IDS.join(", ")}. Başka ligandlar için molecule aracına metal içeren bir SMILES verin.`);
      return { ligand, count };
    });
    // The same ligand named twice counts once, with the counts added.
    const merged: ComplexInput["ligands"] = [];
    for (const entry of ligands) {
      const known = merged.find((m) => m.ligand.id === entry.ligand.id);
      if (known) known.count += entry.count;
      else merged.push({ ...entry });
    }
    const counterIons = namedCounts(args.counter_ions ?? args.counterions ?? args.counter_ion ?? args.counter, "Karşı iyon").map(([ionName, count]) => {
      const ion = findCounterIon(ionName);
      if (!ion) throw new ArgError(`"${ionName}" karşı iyonu tanınmadı.`);
      return { ion, count };
    });
    // A bracket formula ("[Co(NH3)6]Cl3") stands in for the metal and its ligands.
    const parsed = merged.length === 0 && formula ? parseComplexFormula(formula) : null;
    if (merged.length === 0 && !parsed) throw new ArgError(formula ? `"${formula}" bir kompleks formülü olarak okunamadı.` : "Ligand listesi eksik.");
    const input: ComplexInput = parsed
      ? {
          ...parsed,
          oxidationState: oxidationState(args.oxidation_state ?? args.oxidationState ?? args.oxidation ?? args.ox),
          charge: num(args.charge, "Yük", true) ?? parsed.charge,
          isomer: str(args.isomer, "İzomer", true) || undefined,
          geometry: geometryArg(args.geometry),
        }
      : {
          metal: symbol(str(args.metal ?? args.center ?? args.centre ?? args.central, "Metal")),
          oxidationState: oxidationState(args.oxidation_state ?? args.oxidationState ?? args.oxidation ?? args.ox),
          charge: num(args.charge, "Yük", true),
          ligands: merged,
          counterIons,
          isomer: str(args.isomer, "İzomer", true) || undefined,
          geometry: geometryArg(args.geometry),
        };
    const r = analyseComplex(input, language);
    const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
    const ligandCharge = r.ligands.reduce((sum, l) => sum + l.charge * l.count, 0);
    const stereo = r.isomers.length > 1 ? `${r.isomers.length} geometrik izomer: ${r.isomers.map((i) => `${i.label}${i.chiral ? " (kiral, Δ/Λ)" : ""}${i.chosen ? " [çizilen]" : ""}`).join("; ")}` : r.isomers[0]?.label ?? "-";
    const electrons = r.dElectrons !== null ? `d${r.dElectrons}` : r.fElectrons !== null ? `f${r.fElectrons}` : "";
    return {
      tool: "complex",
      args,
      ok: true,
      source: "engine",
      title: `${name ?? r.compound} · ${t("yapı", "structure")}`,
      llm:
        `Koordinasyon bileşiği (uygulamanın yapı motoru, cihazda kuruldu ve 3B çizildi): ${r.compound}${name ? ` (${name})` : ""}; ` +
        `IUPAC adı: ${r.nameTr} / ${r.nameEn}; formül (Hill) ${r.hill}; mol kütlesi ${plain(r.molarMass, 6)} g/mol` +
        (r.exactMass !== null ? `; monoizotopik kütle ${plain(r.exactMass, 9)} u` : "") +
        `; merkez atom ${r.metal}, yükseltgenme basamağı ${sign(r.oxidationState)}, kompleksin yükü ${sign(r.charge)}` +
        (electrons ? `, ${electrons}` : "") +
        `; ligandlar: ${r.ligands.map((l) => `${l.count}× ${l.name} (${l.donor} verici, ${l.denticity > 1 ? `${l.denticity} dişli/hapto` : "tek dişli"}, yük ${sign(l.charge)})`).join(", ")}` +
        `; koordinasyon ${r.coordinationText}; geometri ${r.geometryName} (ideal açılar ${r.angles}); hibritleşme (VB) ${r.hybridisation}` +
        `; elektron dizilimi ${r.configuration}${r.spin ? ` (${r.spin === "low" ? "düşük spin" : "yüksek spin"})` : ""}` +
        `; eşleşmemiş elektron ${r.unpaired}; manyetik moment ${plain(r.magneticMoment, 3)} BM (${r.momentBasis === "spin-only" ? "spin-only" : `J temelli, terim ${r.momentBasis}`}; ${r.unpaired ? "paramanyetik" : "diyamanyetik"})` +
        (r.cfse ? `; KAKE ${r.cfse}` : "") +
        `; toplam valens elektronu (iyonik model) ${r.valenceElectrons}` +
        (r.pointGroup ? `; nokta grubu (ideal) ${pointGroupText(r.pointGroup)}` : "") +
        `; stereokimya: ${stereo}. Model ideal geometridir (kristal yapısı değil).`,
      checks: [
        t(
          `Yük dengesi: metal ${sign(r.oxidationState)}, ligandlar ${sign(ligandCharge)} → kompleks ${sign(r.charge)}`,
          `Charge balance: metal ${sign(r.oxidationState)}, ligands ${sign(ligandCharge)} → complex ${sign(r.charge)}`
        ),
        t("Stereoizomerler konumların simetrisiyle sayıldı", "Stereoisomers counted from the symmetry of the sites"),
        t("Mol kütlesi IUPAC standart atom kütleleriyle", "Molar mass from IUPAC standard atomic weights"),
      ],
      notes: [...r.notes, t("Çizim ideal geometridir; bağ uzunlukları kovalent yarıçaplardan, açılar ders kitabı değerleridir.", "The drawing is idealised: bond lengths from covalent radii, textbook angles.")],
      data: { ...r, name },
    };
  },

  vsepr(args, language) {
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    const centralText = str(args.central ?? args.center ?? args.centre ?? args.central_atom, "Merkez atom", true);
    const formula = str(args.formula ?? args.molecule, "Formül", true);
    let input: VseprInput;
    if (centralText) {
      const terminal = namedCounts(args.terminal ?? args.terminals ?? args.ligands ?? args.outer ?? args.atoms, "Uç atom").map(([atom, count]) => ({ atom: symbol(atom), count }));
      input = { central: symbol(centralText), terminal, charge: num(args.charge, "Yük", true) ?? 0 };
    } else if (formula) {
      input = splitFormula(formula);
      const charge = num(args.charge, "Yük", true);
      if (charge !== undefined) input = { ...input, charge };
    } else {
      throw new ArgError("Merkez atom ya da formül eksik.");
    }
    const r = analyseVsepr(input, language);
    const name = str(args.name, "Ad", true) || undefined;
    return {
      tool: "vsepr",
      args,
      ok: true,
      source: "engine",
      title: `${name ?? r.formula} · VSEPR`,
      llm:
        `VSEPR (uygulamanın yapı motoru, cihazda; 3B çizildi): ${r.formula}${name ? ` (${name})` : ""}; ${r.axe.replace(/[₀-₉]/g, (d) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(d)))} ; ` +
        `sterik sayı ${r.stericNumber} (${r.bonded} bağlı atom, ${r.lonePairs} ortaklanmamış elektron çifti${r.radical ? ", tek elektron var" : ""}); ` +
        `elektron çifti geometrisi ${r.pairGeometry}; molekül geometrisi ${r.shape}; ideal bağ açıları ${r.angles}; hibritleşme ${r.hybridisation}; ` +
        `bağlar: ${r.bonds}; ${r.polar ? "polar" : "apolar"}` +
        (r.pointGroup ? `; nokta grubu ${pointGroupText(r.pointGroup)}` : "") +
        `; mol kütlesi ${plain(r.molarMass, 6)} g/mol.`,
      checks: [t("Ortaklanmamış çiftler elektron sayımından bulundu", "Lone pairs found by counting electrons")],
      notes: r.notes,
      data: { ...r, name },
    };
  },

  balance(args, language) {
    const equation = balanceEquation(str(args.equation, "Denklem"));
    const conserved = equation.check.every((row) => Math.abs(row.left - row.right) < 1e-9);
    return {
      tool: "balance",
      args,
      ok: true,
      source: "engine",
      title: language === "en" ? "Balanced equation" : "Denkleştirilmiş denklem",
      llm:
        `Denkleşmiş denklem: ${equation.text}. Katsayılar (en küçük tam sayılar): ${equation.coefficients.join(", ")}. ` +
        `Atom/yük sayımı: ${equation.check.map((row) => `${row.symbol} ${row.left} = ${row.right}`).join("; ")}.` +
        (equation.ambiguous ? " Not: denklemin birden fazla bağımsız çözümü var; en küçük pozitif kombinasyon verildi." : ""),
      checks: [
        conserved
          ? language === "en"
            ? "Every atom (and the charge) is conserved"
            : "Her atom (ve yük) iki tarafta eşit"
          : language === "en"
            ? "Conservation check FAILED"
            : "Korunum kontrolü BAŞARISIZ",
      ],
      notes: equation.ambiguous
        ? [language === "en" ? "More than one independent balance exists; the smallest positive one is shown." : "Birden fazla bağımsız denkleşme var; en küçük pozitif olan gösterildi."]
        : [],
      data: equation,
    };
  },

  stoichiometry(args, language) {
    const given = Array.isArray(args.given) ? args.given.map(amount) : [amount(args.given)];
    const actual = args.actual ? amount(args.actual) : undefined;
    const result = stoichiometry(str(args.equation, "Denklem"), given, actual);
    const limiting = result.reactants.filter((r) => r.limiting).map((r) => r.pretty);
    const massIn = result.reactants.reduce((sum, r) => sum + (r.used ?? 0) * r.molarMass, 0);
    const massOut = result.products.reduce((sum, p) => sum + p.mass, 0);
    return {
      tool: "stoichiometry",
      args,
      ok: true,
      source: "engine",
      title: language === "en" ? "Stoichiometry" : "Stokiyometri",
      llm:
        `Denkleşmiş: ${result.equation.text}. ` +
        result.reactants
          .map((r) =>
            r.given
              ? `${r.pretty}: ${plain(r.given.amount)} ${r.given.unit} = ${plain(r.given.moles)} mol (M ${plain(r.molarMass, 6)} g/mol), n/ν = ${plain(r.ratio!)}; kalan ${plain(r.leftMoles ?? 0)} mol (${plain(r.leftMass ?? 0)} g)`
              : `${r.pretty}: miktar verilmedi, gereken ${plain(r.used ?? 0)} mol (${plain((r.used ?? 0) * r.molarMass)} g)`
          )
          .join("; ") +
        `. Sınırlayıcı: ${limiting.join(", ")}. Teorik verim: ${result.products.map((p) => `${p.pretty} ${plain(p.moles)} mol = ${plain(p.mass)} g`).join("; ")}.` +
        (result.percentYield
          ? ` Yüzde verim (${result.percentYield.species}): ${plain(result.percentYield.actualMass)} g / ${plain(result.percentYield.theoreticalMass)} g = %${plain(result.percentYield.percent, 4)}.`
          : ""),
      checks: [
        language === "en"
          ? `Mass balance: reacted ${fmt(massIn, language)} g = formed ${fmt(massOut, language)} g`
          : `Kütle korunumu: tepkimeye giren ${fmt(massIn, language)} g = oluşan ${fmt(massOut, language)} g`,
      ],
      notes:
        result.percentYield && result.percentYield.percent > 100
          ? [language === "en" ? "Yield above 100 %: the product is probably wet or impure." : "Verim %100'ün üstünde: ürün muhtemelen nemli ya da safsızlık içeriyor."]
          : [],
      data: result,
    };
  },

  ph(args, language) {
    const raw = Array.isArray(args.components) ? args.components : [args];
    const components = raw.map(acidBaseComponent);
    const pKw = num(args.pKw, "pKw", true) ?? 14;
    const result = solvePh(components, pKw);
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    const notes: string[] = [];
    if (result.pH < 0 || result.pH > 14) notes.push(t("pH 0–14 dışında: bu derişimde ideal çözelti varsayımı (aktivite = derişim) geçerliliğini yitirir.", "pH outside 0–14: at this concentration the ideal-solution assumption breaks down."));
    if (components.some((c) => c.c > 1)) notes.push(t("1 M üstü derişimde aktivite katsayıları sonucu değiştirebilir.", "Above 1 M, activity coefficients can shift the result."));
    return {
      tool: "ph",
      args,
      ok: true,
      source: "engine",
      title: `pH = ${fixed(result.pH, 2, language)}`,
      llm:
        `pH = ${plain(result.pH, 5)} (tam çözüm: yük denkliği, yaklaşım yok, 25 °C, pKw ${pKw}); pOH = ${plain(result.pOH, 5)}; ` +
        `[H⁺] = ${plain(result.h)} M; [OH⁻] = ${plain(result.oh)} M.` +
        (result.approximation ? ` Ders kitabı yaklaşımı (${result.approximation.method}) ile pH ≈ ${plain(result.approximation.pH, 4)}.` : "") +
        result.species
          .map((s) => ` ${s.system} türleri: ${s.labels.map((label, i) => `${label} %${plain(s.fractions[i] * 100, 4)} (${plain(s.concentrations[i])} M)`).join(", ")}.`)
          .join(""),
      checks: [
        t("Yük denkliği sağlandı (sayısal kök doğrulandı)", "Charge balance satisfied (root verified)"),
        ...(result.approximation
          ? [t(`Yaklaşım farkı: ${fixed(Math.abs(result.pH - result.approximation.pH), 3, language)} pH birimi`, `Approximation differs by ${fixed(Math.abs(result.pH - result.approximation.pH), 3, language)} pH units`)]
          : []),
      ],
      notes,
      data: { ...result, components },
    };
  },

  titration(args, language) {
    const a = (args.analyte ?? {}) as Record<string, unknown>;
    const tt = (args.titrant ?? {}) as Record<string, unknown>;
    const analyteType = TYPE_ALIASES[String(a.type ?? "").toLowerCase().replace(/[\s-]+/g, "_")];
    const titrantType = TYPE_ALIASES[String(tt.type ?? "").toLowerCase().replace(/[\s-]+/g, "_")];
    if (!analyteType || !["strong_acid", "weak_acid", "strong_base", "weak_base"].includes(analyteType)) throw new ArgError("Titre edilen madde türü geçersiz.");
    if (titrantType !== "strong_base" && titrantType !== "strong_acid") throw new ArgError("Titrant güçlü asit ya da güçlü baz olmalı.");
    const result = titrate({
      analyte: {
        type: analyteType as "strong_acid" | "weak_acid" | "strong_base" | "weak_base",
        c: num(a.c ?? a.concentration, "Titre edilen derişimi") as number,
        volume_mL: num(a.volume_mL ?? a.volume, "Titre edilen hacmi") as number,
        pKa: analyteType === "weak_acid" ? pKaFrom(a, "a") : undefined,
        pKb: analyteType === "weak_base" ? pKaFrom(a, "b") : undefined,
        n: num(a.n, "n", true),
      },
      titrant: { type: titrantType, c: num(tt.c ?? tt.concentration, "Titrant derişimi") as number, n: num(tt.n, "n", true) },
    });
    const analyte = str(a.name, "", true) || (language === "en" ? analyteType.replace(/_/g, " ") : TYPE_TR[analyteType]);
    const titrant = str(tt.name, "", true) || (language === "en" ? titrantType.replace(/_/g, " ") : TYPE_TR[titrantType]);
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    return {
      tool: "titration",
      args,
      ok: true,
      source: "engine",
      title: t("Titrasyon eğrisi", "Titration curve"),
      llm:
        `Başlangıç pH ${plain(result.initialPH, 4)}. ` +
        result.equivalence.map((e, i) => `${i + 1}. eşdeğerlik: V = ${plain(e.v, 5)} mL, pH ${plain(e.pH, 4)}`).join("; ") +
        (result.halfEquivalence.length ? `; yarı eşdeğerlik: ${result.halfEquivalence.map((e) => `V = ${plain(e.v, 5)} mL, pH ${plain(e.pH, 4)}`).join("; ")}` : "") +
        `. Uygun indikatör(ler): ${result.indicators.map((i) => `${i.name} (${i.range[0]}–${i.range[1]})`).join(", ") || "yok"}. Eğri (${result.points.length} nokta) kullanıcıya grafik olarak gösterildi.`,
      checks: [t("Her nokta yük denkliğiyle tam çözüldü", "Every point solved exactly from the charge balance")],
      notes: [t("Eşdeğerlik noktası hesaplanır; son nokta indikatörün renk değiştirdiği yerdir ve biraz farklı olabilir.", "The equivalence point is computed; the end point is where the indicator changes and can differ slightly.")],
      data: { ...result, analyte, titrant },
    };
  },

  solution_prep(args, language) {
    const concentration = num(args.concentration_M ?? args.concentration, "Derişim") as number;
    const volume = num(args.volume_mL ?? args.volume, "Hacim") as number;
    const result = prepareSolution(
      {
        formula: str(args.formula, "", true) || undefined,
        molar_mass: num(args.molar_mass, "", true),
        concentration_M: concentration,
        volume_mL: volume,
        purity_percent: num(args.purity_percent, "", true),
        stock_percent: num(args.stock_percent, "", true),
        density_g_mL: num(args.density_g_mL, "", true),
        stock_M: num(args.stock_M, "", true),
      },
      language
    );
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    const notes: string[] = [];
    if (result.weighMass !== undefined && result.weighMass < 0.01) {
      notes.push(t("Tartılacak miktar 10 mg'ın altında: daha derişik bir stok hazırlayıp seyreltmek daha doğru olur.", "Under 10 mg to weigh: make a more concentrated stock and dilute instead."));
    }
    return {
      tool: "solution_prep",
      args,
      ok: true,
      source: "engine",
      title: t("Çözelti hazırlama", "Solution preparation"),
      llm:
        `${result.pretty || "Madde"} için ${plain(concentration)} M, ${plain(volume)} mL: n = ${plain(result.moles)} mol, M = ${plain(result.molarMass, 6)} g/mol, saf madde ${plain(result.pureMass)} g` +
        (result.weighMass !== undefined ? `, tartılacak ${plain(result.weighMass)} g` : "") +
        (result.stockVolume_mL !== undefined ? `, alınacak stok ${plain(result.stockVolume_mL)} mL (stok ≈ ${plain(result.stockMolarity ?? 0, 4)} M)` : "") +
        `. Adımlar: ${result.steps.join(" ")}`,
      checks: [t(`n = C × V = ${fmt(concentration, language)} M × ${fmt(volume / 1000, language)} L`, `n = C × V = ${fmt(concentration, language)} M × ${fmt(volume / 1000, language)} L`)],
      notes,
      data: { ...result, concentration, volume },
    };
  },

  dilution(args, language) {
    const read = (key: string) => (args[key] === null ? undefined : num(args[key], key, true));
    const result = dilution(
      { C1: read("C1"), V1: read("V1"), C2: read("C2"), V2: read("V2"), volume_unit: str(args.volume_unit, "", true) || undefined, concentration_unit: str(args.concentration_unit, "", true) || undefined },
      language
    );
    return {
      tool: "dilution",
      args,
      ok: true,
      source: "engine",
      title: language === "en" ? "Dilution (C₁V₁ = C₂V₂)" : "Seyreltme (C₁V₁ = C₂V₂)",
      llm: `C₁V₁ = C₂V₂: C₁ = ${plain(result.C1)} ${result.concentrationUnit}, V₁ = ${plain(result.V1)} ${result.volumeUnit}, C₂ = ${plain(result.C2)} ${result.concentrationUnit}, V₂ = ${plain(result.V2)} ${result.volumeUnit} (${result.solvedFor} hesaplandı). Adımlar: ${result.steps.join(" ")}`,
      checks: [language === "en" ? "C₁V₁ equals C₂V₂" : "C₁V₁ = C₂V₂ sağlandı"],
      notes: [],
      data: result,
    };
  },

  gas(args, language) {
    const read = (key: string) => (args[key] === null || args[key] === undefined ? null : (num(args[key], key) as number));
    const result = idealGas(
      {
        P: read("P"),
        V: read("V"),
        n: read("n"),
        T: read("T"),
        P_unit: str(args.P_unit, "", true) || undefined,
        V_unit: str(args.V_unit, "", true) || undefined,
        T_unit: str(args.T_unit, "", true) || undefined,
        n_unit: str(args.n_unit, "", true) || undefined,
      },
      language
    );
    const pressureAtm = convertUnit(result.values.P, result.units.P, "atm");
    return {
      tool: "gas",
      args,
      ok: true,
      source: "engine",
      title: language === "en" ? "Ideal gas (PV = nRT)" : "İdeal gaz (PV = nRT)",
      llm: `PV = nRT (R = 0,082057 L·atm/(mol·K)): ${result.solvedFor} = ${plain(result.value)} ${result.unit}; P = ${plain(result.values.P)} ${result.units.P}, V = ${plain(result.values.V)} ${result.units.V}, n = ${plain(result.values.n)} ${result.units.n}, T = ${plain(result.values.T)} ${result.units.T}.`,
      checks: [language === "en" ? "Temperature converted to kelvin before solving" : "Sıcaklık çözümden önce kelvine çevrildi"],
      notes: pressureAtm > 10 ? [language === "en" ? "Above ~10 atm real gases deviate from ideal behaviour." : "~10 atm üstünde gerçek gazlar ideal davranıştan sapar."] : [],
      data: result,
    };
  },

  evaluate(args, language) {
    const expression = str(args.expression, "İfade");
    const variables = numericRecord(args.variables);
    const value = evaluate(expression, variables);
    const unit = str(args.unit, "", true);
    const label = str(args.label, "", true) || (language === "en" ? "Result" : "Sonuç");
    if (!Number.isFinite(value)) throw new ArgError("Sonuç sonlu bir sayı değil (sıfıra bölme?).");
    return {
      tool: "evaluate",
      args,
      ok: true,
      source: "engine",
      title: label,
      llm: `${label} = ${expression}${Object.keys(variables).length ? ` (${Object.entries(variables).map(([k, v]) => `${k} = ${plain(v)}`).join(", ")})` : ""} = ${plain(value, 7)}${unit ? ` ${unit}` : ""}.`,
      checks: [language === "en" ? "Evaluated exactly by the engine's parser" : "İfade motorun ayrıştırıcısıyla tam hesaplandı"],
      notes: [],
      data: { expression, variables, value, unit, label, constants: usedConstants(expression, variables) },
    };
  },

  solve(args, language) {
    const equation = str(args.equation, "Denklem");
    const variables = numericRecord(args.variables);
    const sides = equation.split("=");
    if (sides.length > 2) throw new ArgError("Denklemde tek bir = olmalı.");
    const lhs = compile(sides[0]);
    const rhs = sides.length === 2 ? compile(sides[1]) : () => 0;
    const free = freeNames(sides.join("-(") + (sides.length === 2 ? ")" : ""), variables);
    const variable = str(args.variable, "", true) || free[0];
    if (!variable) throw new ArgError("Çözülecek değişken bulunamadı.");
    const f = (x: number) => lhs({ ...variables, [variable]: x }) - rhs({ ...variables, [variable]: x });
    const min = num(args.min, "", true);
    const max = num(args.max, "", true);
    const roots = findRoots(f, min, max);
    if (roots.length === 0) throw new ArgError("Verilen aralıkta çözüm bulunamadı.");
    const unit = str(args.unit, "", true);
    const residual = Math.max(...roots.map((root) => Math.abs(f(root))));
    return {
      tool: "solve",
      args,
      ok: true,
      source: "engine",
      title: language === "en" ? `Solve for ${variable}` : `${variable} için çözüm`,
      llm: `${equation} → ${roots.map((root) => `${variable} = ${plain(root, 7)}${unit ? ` ${unit}` : ""}`).join(" veya ")}${roots.length > 1 ? " (birden fazla kök; fiziksel anlamlı olanı seç)" : ""}.`,
      checks: [language === "en" ? `Root checked: |f(x)| ≤ ${fmt(residual, language, 2)}` : `Kök doğrulandı: |f(x)| ≤ ${fmt(residual, language, 2)}`],
      notes: roots.length > 1 ? [language === "en" ? "More than one root: only the physically meaningful one is the answer." : "Birden fazla kök var: yalnızca fiziksel anlamı olan cevaptır."] : [],
      data: { equation, variable, roots, unit, variables },
    };
  },

  convert(args, language) {
    const value = num(args.value, "Değer") as number;
    const from = str(args.from, "Kaynak birim");
    const to = str(args.to, "Hedef birim");
    const result = convertUnit(value, from, to);
    return {
      tool: "convert",
      args,
      ok: true,
      source: "engine",
      title: language === "en" ? "Unit conversion" : "Birim dönüşümü",
      llm: `${plain(value)} ${unitLabel(from)} = ${plain(result, 7)} ${unitLabel(to)}.`,
      checks: [language === "en" ? "Same dimension on both sides" : "İki birim aynı büyüklüğü ölçüyor"],
      notes: [],
      data: { value, from: unitLabel(from), to: unitLabel(to), result },
    };
  },

  regression(args, language) {
    const x = list(args.x);
    const y = list(args.y);
    if (x.length !== y.length) throw new ArgError("x ve y aynı sayıda değer içermeli.");
    const points = x.map((xv, i) => ({ x: xv, y: y[i] }));
    const fit = fitLine(points);
    if (!fit) throw new ArgError("Doğru uydurmak için en az 3 farklı x noktası gerekli.");
    const signal = num(args.unknown_signal ?? args.signal, "", true);
    const unknown = signal !== undefined ? { signal, value: inverse(fit, signal) } : undefined;
    const xLabel = str(args.x_label, "", true) || "x";
    const yLabel = str(args.y_label, "", true) || "y";
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    return {
      tool: "regression",
      args,
      ok: true,
      source: "engine",
      title: t("Doğrusal regresyon", "Linear regression"),
      llm:
        `En küçük kareler: y = ${plain(fit.slope)}·x + ${plain(fit.intercept)}; R² = ${plain(fit.r2, 6)}; sy = ${plain(fit.sy)}; ` +
        `eğim SE ${plain(fit.seSlope)}; kesişim SE ${plain(fit.seIntercept)}; n = ${fit.n}; LOD (3sy/m) = ${plain(fit.lod)}; LOQ (10sy/m) = ${plain(fit.loq)}.` +
        (unknown ? ` Bilinmeyen sinyal ${plain(unknown.signal)} → x = ${plain(unknown.value)}.` : "") +
        " Kalibrasyon grafiği kullanıcıya gösterildi.",
      checks: [t(`${fit.n} nokta ile uyduruldu`, `Fitted with ${fit.n} points`)],
      notes: fit.r2 < 0.99 ? [t("R² 0,99'un altında: doğrusallık zayıf, aykırı noktaları kontrol edin.", "R² below 0.99: linearity is weak, check for outliers.")] : [],
      data: { fit, points, xLabel, yLabel, unknown },
    };
  },

  stats(args, language) {
    const values = list(args.values);
    const description = describe(values);
    if (!description) throw new ArgError("İstatistik için en az 2 değer gerekli.");
    const ci95 = confidenceHalfWidth(description.sd, description.n);
    const grubbs = grubbsTest(values);
    const q = qTest(values);
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    return {
      tool: "stats",
      args,
      ok: true,
      source: "engine",
      title: t("Tanımlayıcı istatistik", "Descriptive statistics"),
      llm:
        `n = ${description.n}; ortalama ${plain(description.mean)}; s = ${plain(description.sd)}; RSD %${plain(description.rsd, 4)}; ` +
        `%95 GA: ${plain(description.mean)} ± ${plain(ci95)}` +
        (grubbs ? `; Grubbs: ${plain(grubbs.suspect)} için G = ${plain(grubbs.statistic, 4)} (kritik ${plain(grubbs.critical, 4)}) → ${grubbs.rejected ? "aykırı" : "aykırı değil"}` : "") +
        (q ? `; Dixon Q: ${plain(q.suspect)} için Q = ${plain(q.statistic, 4)} (kritik ${plain(q.critical, 4)}) → ${q.rejected ? "aykırı" : "aykırı değil"}` : "") +
        ".",
      checks: [t("Student t ile %95 güven aralığı", "95 % confidence interval with Student's t")],
      notes: [],
      data: { description, ci95, grubbs, q },
    };
  },

  spectra(args, language) {
    const raw = String(args.technique ?? "ir").toLowerCase();
    const technique: Technique = raw.includes("13") || raw.includes("c-nmr") || raw === "c" ? "c-nmr" : raw.includes("nmr") || raw.includes("1h") || raw === "h" ? "h-nmr" : raw === "ms" ? "ms" : "ir";
    const values = list(args.values ?? args.value);
    const pick = (pair: { tr: string; en: string } | undefined) => (pair ? (language === "en" ? pair.en : pair.tr) : undefined);
    const matches = technique === "ms" ? [] : values.map((value) => ({
      value,
      bands: matchBands(technique, value).map((band) => ({
        assignment: pick(band.assignment)!,
        group: pick(band.group)!,
        range: `${band.min}–${band.max}`,
        detail: pick(band.detail),
      })),
    }));
    const difference = num(args.difference, "", true);
    const losses = technique === "ms" && difference !== undefined
      ? { difference, matches: matchLosses(difference).map((loss) => `${loss.fragment} (−${loss.mass}): ${language === "en" ? loss.meaning.en : loss.meaning.tr}`) }
      : undefined;
    const unit = technique === "ir" ? "cm⁻¹" : technique === "ms" ? "m/z" : "ppm";
    return {
      tool: "spectra",
      args,
      ok: true,
      source: "reference",
      title: language === "en" ? "Spectral assignment (reference tables)" : "Spektral atama (referans tabloları)",
      llm:
        matches.map((m) => `${m.value} ${unit}: ${m.bands.length ? m.bands.map((b) => `${b.assignment} – ${b.group} (${b.range})`).join(" | ") : "tabloda eşleşme yok"}`).join("; ") +
        (losses ? `; kütle farkı ${losses.difference}: ${losses.matches.join(", ") || "eşleşme yok"}` : "") +
        ". Kaynak: ChemAI spektroskopi referans tabloları; atamalar 'olası'dır, kesin değildir.",
      checks: [language === "en" ? "Matched against the app's reference ranges" : "Uygulamanın referans aralıklarıyla eşleştirildi"],
      notes: [language === "en" ? "Assignments are possibilities, not proof: confirm with the whole spectrum." : "Atamalar olasılıktır, kanıt değildir: tüm spektrumla doğrulayın."],
      data: { technique, matches, losses },
    };
  },

  safety(args, language) {
    const query = str(args.query ?? args.name ?? args.chemical, "Kimyasal adı");
    const found = searchChemicals(query);
    const chemical = found[0] ?? null;
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    const pick = (pair: { tr: string; en: string }) => (language === "en" ? pair.en : pair.tr);
    return {
      tool: "safety",
      args,
      ok: true,
      source: "reference",
      title: chemical ? `${language === "en" ? chemical.name : chemical.nameTr} · GHS` : t("Güvenlik kartı bulunamadı", "No safety card found"),
      llm: chemical
        ? `${chemical.nameTr} (${chemical.formula}, CAS ${chemical.cas}): uyarı kelimesi ${chemical.signal === "danger" ? "TEHLİKE" : chemical.signal === "warning" ? "DİKKAT" : "yok"}; ` +
          `piktogramlar ${chemical.pictograms.join(", ") || "yok"}; H: ${chemical.hazards.map((code) => `${code} ${pick(hazardText(code) ?? { tr: "", en: "" })}`).join("; ")}; ` +
          `P: ${chemical.precautions.map((code) => `${code} ${pick(precautionText(code) ?? { tr: "", en: "" })}`).join("; ")}; ` +
          `uyumsuz: ${chemical.incompatible.map((i) => pick(INCOMPATIBILITY_LABELS[i])).join(", ") || "-"}; ` +
          `depolama: ${pick(STORAGE[chemical.storage])}; ilk yardım (göz): ${pick(FIRST_AID[chemical.firstAid].eyes)}` +
          (chemical.note ? `; not: ${pick(chemical.note)}` : "") +
          ". Kaynak: ChemAI güvenlik kartları (özet); tam bilgi için üreticinin SDS'i."
        : `"${query}" uygulamanın güvenlik kartlarında yok (49 yaygın laboratuvar kimyasalı). Üreticinin SDS'ine başvurulmalı.`,
      checks: chemical ? [t("Uygulamanın GHS kartından okundu", "Read from the app's GHS card")] : [],
      notes: [t("Bu kart SDS'in yerini tutmaz; kullanmadan önce üreticinin güncel SDS'ini okuyun.", "This card does not replace the SDS; read the manufacturer's current SDS before use.")],
      data: { query, chemical, alternatives: found.slice(1, 4).map((c) => (language === "en" ? c.name : c.nameTr)) },
    };
  },

  async pubchem(args, language) {
    const name = str(args.name ?? args.query ?? args.compound, "Bileşik adı");
    const withGhs = args.ghs === true || args.ghs === "true" || args.safety === true;
    const record = await lookupPubChem(name, withGhs);
    const t = (tr: string, en: string) => (language === "en" ? en : tr);
    const cactus = record.provider === "cactus";
    const sourceName = cactus ? "NCI CACTUS" : "PubChem";
    // Record → RDKit: the record's SMILES is drawn and re-checked on the device (and fills in the
    // masses a CACTUS record may lack).
    let info = record;
    let svg: string | undefined;
    let agrees: boolean | null = null;
    if (record.smiles) {
      try {
        const molecule = await analyseSmiles(record.smiles);
        svg = molecule.svg;
        agrees = record.formula ? molecule.formulaPlain.replace(/[+-]\d*$|\d*[+-]$/, "") === record.formula.replace(/[+-]\d*$|\d*[+-]$/, "") : null;
        info = {
          ...record,
          formula: record.formula || molecule.formulaPlain,
          molecularWeight: Number.isFinite(record.molecularWeight) ? record.molecularWeight : molecule.averageMass,
          exactMass: Number.isFinite(record.exactMass) ? record.exactMass : molecule.exactMass,
          inchiKey: record.inchiKey || molecule.inchiKey,
        };
      } catch {
        agrees = null;
      }
    }
    const ghs = info.ghs;
    return {
      tool: "pubchem",
      args,
      ok: true,
      source: "database",
      title: `${info.title} · ${sourceName}`,
      llm:
        (cactus ? `NCI CACTUS (NIH; PubChem şu an yanıt vermiyor)` : `PubChem CID ${info.cid} (${info.url})`) +
        `: ad ${info.title}; IUPAC ${info.iupacName || "-"}; formül ${info.formula}; ` +
        `mol kütlesi ${plain(info.molecularWeight, 6)} g/mol; monoizotopik kütle ${plain(info.exactMass, 9)} u; SMILES ${info.smiles}; ` +
        `InChIKey ${info.inchiKey}; CAS ${info.cas ?? "-"}; XLogP ${info.xlogp ?? "-"}.` +
        (ghs
          ? ` GHS (PubChem, ECHA C&L bildirimleri özeti): uyarı ${ghs.signal || "-"}; piktogramlar ${ghs.pictograms.join(", ") || "-"}; ${ghs.hazards.join("; ")}; P kodları ${ghs.precautions}.`
          : withGhs
            ? cactus
              ? " GHS sınıflandırması alınamadı: PubChem şu an yanıt vermiyor; uygulamanın güvenlik kartlarına ya da üreticinin SDS'ine bakılmalı."
              : " GHS sınıflandırması PubChem'de bulunamadı."
            : "") +
        ` Kaynak: ${cactus ? "NCI/CADD Chemical Identifier Resolver (CACTUS, NIH)" : "PubChem (NIH)"}, çevrim içi sorgu.`,
      checks: [
        cactus
          ? t("NCI CACTUS kaydı bulundu", "NCI CACTUS record found")
          : t(`PubChem kaydı bulundu (CID ${info.cid})`, `PubChem record found (CID ${info.cid})`),
        ...(agrees === true ? [t(`RDKit formülü ${sourceName} kaydıyla aynı`, `RDKit's formula matches the ${sourceName} record`)] : []),
      ],
      notes: [
        ...(cactus
          ? [t("PubChem şu an yanıt vermiyor (sunucu yoğun); kimlik bilgileri NIH'nin NCI CACTUS servisinden alındı.", "PubChem is not answering right now (server busy); the identity comes from NIH's NCI CACTUS service.")]
          : []),
        ...(agrees === false ? [t(`RDKit formülü ${sourceName} kaydından farklı: yapıyı kontrol edin.`, `RDKit's formula differs from the ${sourceName} record: check the structure.`)] : []),
        ...(ghs ? [t("GHS bilgisi PubChem'in ECHA bildirim özetidir; kullanmadan önce üreticinin güncel SDS'ini okuyun.", "GHS data is PubChem's summary of ECHA notifications; read the manufacturer's current SDS before use.")] : []),
      ],
      data: { ...info, svg },
    };
  },
};

const TYPE_TR: Record<string, string> = {
  strong_acid: "güçlü asit",
  weak_acid: "zayıf asit",
  strong_base: "güçlü baz",
  weak_base: "zayıf baz",
};

function numericRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsed = num(raw, key, true);
    if (parsed !== undefined) out[key] = parsed;
  }
  return out;
}

export function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && (TOOL_NAMES as readonly string[]).includes(value);
}

/**
 * Runs one call; `earlier` are the question's results so far (a protocol takes its amounts from
 * them). Never throws: a failure comes back as { ok: false, error }.
 */
export async function runTool(call: ToolCall, language: Language, earlier: ToolOutcome[] = []): Promise<ToolOutcome> {
  if (!isToolName(call.tool)) return { tool: String(call.tool), args: call.args ?? {}, ok: false, error: `Bilinmeyen araç: ${String(call.tool)}` };
  try {
    return await RUNNERS[call.tool](call.args ?? {}, language, earlier);
  } catch (error) {
    return { tool: call.tool, args: call.args ?? {}, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The constants the evaluator knows, for the planner's instructions. */
export const CONSTANT_NAMES = Object.keys(CONSTANTS);
