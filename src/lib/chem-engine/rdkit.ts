// Chem+ app: RDKit, running on the phone.
//
// RDKit's MinimalLib is RDKit compiled to WebAssembly - the same C++ toolkit the Python package
// wraps - so SMILES validation, formulas, masses, InChI/InChIKey, descriptors and the 2D drawing
// are RDKit's own answers, computed offline inside the app. The files ship in public/rdkit/ (copied
// from node_modules/@rdkit/rdkit by scripts/copy-rdkit.mjs) and load on first use: 7 MB of
// WebAssembly nobody should pay for until a structure is actually asked about.

import { ATOMIC_WEIGHTS, hillOrder, symbolForZ } from "./elements";
import { chargeLabel, subscript, superscript } from "./format";
import { embed3d, isMetalAtom, readMolblock } from "./embed3d";
import type { Model3D } from "./model3d";

interface RDKitMol {
  get_smiles(): string;
  get_inchi(): string;
  get_json(): string;
  get_descriptors(): string;
  get_svg_with_highlights(details: string): string;
  get_molblock(): string;
  get_v3Kmolblock(): string;
  add_hs_in_place(): boolean;
  set_new_coords(useCoordGen?: boolean): boolean;
  delete(): void;
}

interface RDKitModule {
  version(): string;
  get_mol(input: string, details?: string): RDKitMol | null;
  get_inchikey_for_inchi(inchi: string): string;
}

declare global {
  interface Window {
    initRDKitModule?: (options: { locateFile: (file: string) => string }) => Promise<RDKitModule>;
  }
}

let loading: Promise<RDKitModule> | null = null;

export function loadRDKit(): Promise<RDKitModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("RDKit yalnızca tarayıcıda çalışır."));
  if (loading) return loading;
  loading = new Promise<RDKitModule>((resolve, reject) => {
    const start = () => {
      if (!window.initRDKitModule) {
        reject(new Error("RDKit yüklenemedi."));
        return;
      }
      window.initRDKitModule({ locateFile: () => "/rdkit/RDKit_minimal.wasm" }).then(resolve, reject);
    };
    if (window.initRDKitModule) {
      start();
      return;
    }
    const script = document.createElement("script");
    script.src = "/rdkit/RDKit_minimal.js";
    script.async = true;
    script.onload = start;
    script.onerror = () => reject(new Error("RDKit dosyası yüklenemedi."));
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export interface MoleculeInfo {
  input: string;
  canonicalSmiles: string;
  formula: string;
  /** Hill formula in plain ASCII, for the AI's copy. */
  formulaPlain: string;
  averageMass: number;
  exactMass: number;
  charge: number;
  inchi: string;
  inchiKey: string;
  heavyAtoms: number;
  hbd: number;
  hba: number;
  rotatableBonds: number;
  rings: number;
  aromaticRings: number;
  stereocenters: number;
  tpsa: number;
  logP: number;
  /** Lipinski's rule of five, violations counted. */
  lipinskiViolations: number;
  svg: string;
  rdkitVersion: string;
  composition: { symbol: string; count: number; percent: number }[];
  /** The app's own 3D model (embed3d.ts), hydrogens included; none for very large molecules. */
  model?: Model3D;
  /** Heavy atoms by hybridisation, from the bond orders: "C sp³" ×4. */
  hybridisation: { label: string; count: number }[];
}

export class MoleculeError extends Error {}

/** RDKit's flat drawing of one SMILES, without the full analysis: for the species of a reaction scheme. */
export async function depictSmiles(smiles: string, width = 150, height = 110): Promise<string> {
  const text = smiles.trim();
  const RDKit = await loadRDKit();
  const mol = text ? RDKit.get_mol(text) : null;
  if (!mol) throw new MoleculeError(`RDKit bu SMILES'ı geçerli bir yapı olarak kabul etmedi: ${text}`);
  try {
    return mol
      .get_svg_with_highlights(JSON.stringify({ width, height, bondLineWidth: 1.6, clearBackground: false, padding: 0.08 }))
      .replace(/<\?xml[^>]*>\s*/, "")
      .replace(/<rect[^>]*style='opacity:1\.0;fill:#FFFFFF[^>]*\/>/, "");
  } finally {
    mol.delete();
  }
}

/** RDKit's own analysis of one SMILES. Throws MoleculeError when RDKit rejects the structure. */
export async function analyseSmiles(smiles: string): Promise<MoleculeInfo> {
  const text = smiles.trim();
  if (!text) throw new MoleculeError("SMILES boş.");
  const RDKit = await loadRDKit();
  const mol = RDKit.get_mol(text);
  if (!mol) throw new MoleculeError(`RDKit bu SMILES'ı geçerli bir yapı olarak kabul etmedi: ${text}`);
  try {
    const descriptors = JSON.parse(mol.get_descriptors()) as Record<string, number>;
    const json = JSON.parse(mol.get_json()) as {
      defaults?: { atom?: { z?: number; impHs?: number; chg?: number } };
      molecules: { atoms: { z?: number; impHs?: number; chg?: number }[] }[];
    };
    const defaults = json.defaults?.atom ?? {};
    const counts = new Map<string, number>();
    let charge = 0;
    for (const atom of json.molecules.flatMap((molecule) => molecule.atoms)) {
      const symbol = symbolForZ(atom.z ?? defaults.z ?? 6);
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      const hydrogens = atom.impHs ?? defaults.impHs ?? 0;
      if (hydrogens) counts.set("H", (counts.get("H") ?? 0) + hydrogens);
      charge += atom.chg ?? defaults.chg ?? 0;
    }
    const order = hillOrder([...counts.keys()]);
    const formulaPlain = order.map((s) => `${s}${counts.get(s)! > 1 ? counts.get(s) : ""}`).join("") + chargeLabel(charge);
    const formula = order.map((s) => `${s}${counts.get(s)! > 1 ? subscript(String(counts.get(s))) : ""}`).join("") + superscript(chargeLabel(charge));
    const average = descriptors.amw;
    const composition = order.map((symbol) => ({
      symbol,
      count: counts.get(symbol)!,
      percent: ((ATOMIC_WEIGHTS[symbol] ?? 0) * counts.get(symbol)! * 100) / average,
    }));

    let inchi = "";
    let inchiKey = "";
    try {
      inchi = mol.get_inchi();
      inchiKey = inchi ? RDKit.get_inchikey_for_inchi(inchi) : "";
    } catch {
      // Some structures (radicals, odd valences) have no standard InChI; the rest still stands.
    }

    const svg = mol
      .get_svg_with_highlights(
        JSON.stringify({ width: 340, height: 230, bondLineWidth: 2, clearBackground: false, padding: 0.1, addStereoAnnotation: true })
      )
      .replace(/<\?xml[^>]*>\s*/, "")
      .replace(/<rect[^>]*style='opacity:1\.0;fill:#FFFFFF[^>]*\/>/, "");

    // The 3D model: RDKit's 2D drawing with its hydrogens, lifted into 3D by the app.
    let model: Model3D | undefined;
    let hybridisation: { label: string; count: number }[] = [];
    if ((descriptors.NumHeavyAtoms ?? 0) <= 150) {
      const withHydrogens = RDKit.get_mol(text);
      if (withHydrogens) {
        try {
          withHydrogens.add_hs_in_place();
          withHydrogens.set_new_coords(true);
          // V3000 keeps dative (metal–ligand) bonds that V2000 cannot write.
          const flat = readMolblock(withHydrogens.get_v3Kmolblock());
          if (flat) {
            const embedded = embed3d(flat.atoms, flat.bonds);
            model = embedded.model;
            const tally = new Map<string, number>();
            const sup = { sp: "sp", sp2: "sp²", sp3: "sp³" } as const;
            flat.atoms.forEach((atom, i) => {
              if (atom.el === "H" || isMetalAtom(atom.el)) return;
              const label = `${atom.el} ${sup[embedded.hybridisation[i]]}`;
              tally.set(label, (tally.get(label) ?? 0) + 1);
            });
            hybridisation = [...tally.entries()].map(([label, count]) => ({ label, count }));
          }
        } catch {
          model = undefined;
        } finally {
          withHydrogens.delete();
        }
      }
    }

    const mw = average;
    const violations =
      Number(mw > 500) + Number(descriptors.lipinskiHBD > 5) + Number(descriptors.lipinskiHBA > 10) + Number(descriptors.CrippenClogP > 5);

    return {
      input: text,
      canonicalSmiles: mol.get_smiles(),
      formula,
      formulaPlain,
      averageMass: average,
      exactMass: descriptors.exactmw,
      charge,
      inchi,
      inchiKey,
      heavyAtoms: descriptors.NumHeavyAtoms,
      hbd: descriptors.NumHBD,
      hba: descriptors.NumHBA,
      rotatableBonds: descriptors.NumRotatableBonds,
      rings: descriptors.NumRings,
      aromaticRings: descriptors.NumAromaticRings,
      stereocenters: descriptors.NumAtomStereoCenters,
      tpsa: descriptors.tpsa,
      logP: descriptors.CrippenClogP,
      lipinskiViolations: violations,
      svg,
      rdkitVersion: RDKit.version(),
      composition,
      model,
      hybridisation,
    };
  } finally {
    mol.delete();
  }
}
