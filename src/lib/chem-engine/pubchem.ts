// Chem+ app: PubChem, the NIH's open chemistry database, as ChemPlus AI's source of record.
//
// A name is looked up rather than remembered: PubChem gives the compound's identity (CID, IUPAC
// name, formula, SMILES, InChIKey, CAS) and, on request, the GHS classification its database
// aggregates from the ECHA C&L notifications. The app calls PubChem's public REST API directly
// (it allows cross-origin requests); only the compound name leaves the phone.
//
// PubChem turns requests away when it is busy (HTTP 503 "PUGREST.ServerBusy", sometimes for hours).
// A busy answer is retried twice; if PubChem still does not answer, the identity comes from the
// NCI/CADD Chemical Identifier Resolver (CACTUS, also NIH), which knows the same names but has no
// GHS data. Identities are kept for the session, so the pubchem and molecule tools of one question
// ask only once.

import type { PictogramId } from "@/lib/safety/pictograms";

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const PUG_VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view";
const CACTUS = "https://cactus.nci.nih.gov/chemical/structure";

/** "missing": the database does not know the name; "down": the database did not answer. */
export class PubChemError extends Error {
  constructor(
    message: string,
    readonly kind: "missing" | "down" = "down",
  ) {
    super(message);
  }
}

export interface PubChemGhs {
  signal: string;
  pictograms: PictogramId[];
  hazards: string[];
  precautions: string;
  /** "ECHA C&L Notifications Summary" etc. */
  note: string;
}

export interface PubChemInfo {
  /** Where the record came from: PubChem, or the CACTUS resolver while PubChem is unavailable. */
  provider: "pubchem" | "cactus";
  /** PubChem's compound ID; 0 for a CACTUS record. */
  cid: number;
  title: string;
  iupacName: string;
  formula: string;
  molecularWeight: number;
  exactMass: number;
  smiles: string;
  inchiKey: string;
  xlogp: number | null;
  charge: number;
  cas: string | null;
  url: string;
  ghs: PubChemGhs | null;
}

const NOT_FOUND = "PubChem'de bu adla bir bileşik bulunamadı.";
/** PubChem's answers for "too busy, try again". */
const BUSY = new Set([429, 503, 504]);
const RETRY_DELAYS_MS = [700, 1800];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    throw new PubChemError("PubChem'e ulaşılamadı (internet bağlantısı gerekli).");
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, timeoutMs = 9000): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await request(url, timeoutMs);
    if (response.status === 404) throw new PubChemError(NOT_FOUND, "missing");
    if (BUSY.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
      await wait(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!response.ok) throw new PubChemError(`PubChem yanıt vermedi (HTTP ${response.status}).`);
    try {
      return await response.json();
    } catch {
      throw new PubChemError("PubChem'in yanıtı okunamadı.");
    }
  }
}

const PICTOGRAMS: Record<string, PictogramId> = {
  explosive: "explosive",
  flammable: "flammable",
  oxidizer: "oxidising",
  "compressed gas": "gas",
  corrosive: "corrosive",
  "acute toxic": "toxic",
  irritant: "harmful",
  "health hazard": "health",
  "environmental hazard": "environment",
};

interface ViewInformation {
  Name?: string;
  ReferenceNumber?: number;
  Value?: { StringWithMarkup?: { String?: string; Markup?: { Type?: string; Extra?: string }[] }[] };
}
interface ViewSection {
  TOCHeading?: string;
  Section?: ViewSection[];
  Information?: ViewInformation[];
}

function findSection(section: ViewSection, heading: string): ViewSection | null {
  if (section.TOCHeading === heading) return section;
  for (const child of section.Section ?? []) {
    const found = findSection(child, heading);
    if (found) return found;
  }
  return null;
}

async function ghsFor(cid: number): Promise<PubChemGhs | null> {
  const json = (await getJson(`${PUG_VIEW}/data/compound/${cid}/JSON?heading=GHS%20Classification`, 12000)) as { Record?: ViewSection };
  const section = json.Record ? findSection(json.Record, "GHS Classification") : null;
  const info = section?.Information ?? [];
  if (info.length === 0) return null;
  // The first reference is PubChem's aggregate of the ECHA notifications; later ones are single sources.
  const reference = info.find((entry) => entry.Name === "GHS Hazard Statements")?.ReferenceNumber;
  const set = info.filter((entry) => entry.ReferenceNumber === reference);
  const strings = (name: string) =>
    (set.find((entry) => entry.Name === name)?.Value?.StringWithMarkup ?? []).map((item) => item.String ?? "").filter(Boolean);
  const pictograms = (set.find((entry) => entry.Name === "Pictogram(s)")?.Value?.StringWithMarkup ?? [])
    .flatMap((item) => item.Markup ?? [])
    .filter((markup) => markup.Type === "Icon" && markup.Extra)
    .map((markup) => PICTOGRAMS[markup.Extra!.toLowerCase()])
    .filter((id): id is PictogramId => Boolean(id));
  const summary = info.find((entry) => entry.Name === "ECHA C&L Notifications Summary")?.Value?.StringWithMarkup?.[0]?.String ?? "";
  return {
    signal: strings("Signal")[0] ?? "",
    pictograms: [...new Set(pictograms)],
    hazards: strings("GHS Hazard Statements").slice(0, 12),
    precautions: strings("Precautionary Statement Codes")[0] ?? "",
    note: summary,
  };
}

async function fromPubChem(query: string): Promise<PubChemInfo> {
  const properties = "Title,IUPACName,MolecularFormula,MolecularWeight,ExactMass,SMILES,ConnectivitySMILES,InChIKey,XLogP,Charge";
  const path = /^\d+$/.test(query) ? `cid/${query}` : `name/${encodeURIComponent(query)}`;
  const json = (await getJson(`${PUG}/compound/${path}/property/${properties}/JSON`)) as {
    PropertyTable?: { Properties?: Record<string, string | number>[] };
  };
  const row = json.PropertyTable?.Properties?.[0];
  if (!row) throw new PubChemError(NOT_FOUND, "missing");
  const cid = Number(row.CID);
  let cas: string | null = null;
  try {
    const synonyms = (await getJson(`${PUG}/compound/cid/${cid}/synonyms/JSON`)) as {
      InformationList?: { Information?: { Synonym?: string[] }[] };
    };
    cas = synonyms.InformationList?.Information?.[0]?.Synonym?.find((entry) => /^\d{2,7}-\d\d-\d$/.test(entry)) ?? null;
  } catch {
    cas = null;
  }
  const smiles = String(row.SMILES ?? row.IsomericSMILES ?? row.CanonicalSMILES ?? row.ConnectivitySMILES ?? "");
  return {
    provider: "pubchem",
    cid,
    title: String(row.Title ?? query),
    iupacName: String(row.IUPACName ?? ""),
    formula: String(row.MolecularFormula ?? ""),
    molecularWeight: Number(row.MolecularWeight),
    exactMass: Number(row.ExactMass),
    smiles,
    inchiKey: String(row.InChIKey ?? ""),
    xlogp: row.XLogP === undefined ? null : Number(row.XLogP),
    charge: Number(row.Charge ?? 0),
    cas,
    url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
    ghs: null,
  };
}

/** One CACTUS representation of a name; null when the resolver does not know it. */
async function cactusText(base: string, representation: string): Promise<string | null> {
  let response: Response;
  try {
    response = await request(`${base}/${representation}`, 12000);
  } catch {
    throw new PubChemError("NCI CACTUS'a ulaşılamadı.");
  }
  if (!response.ok) return null;
  // A representation with several answers comes one per line; the first is kept.
  const first = (await response.text()).split("\n")[0]?.trim() ?? "";
  return first || null;
}

async function fromCactus(query: string): Promise<PubChemInfo> {
  const base = `${CACTUS}/${encodeURIComponent(query)}`;
  // No CAS number: CACTUS lists every registry number it knows in no set order (for caffeine the
  // first is 71701-02-5, not 58-08-2), so none of them can be named the compound's.
  const representations = ["smiles", "formula", "mw", "monoisotopic_mass", "stdinchikey", "iupac_name"];
  const [smiles, formula, weight, exact, inchiKey, iupacName] = await Promise.all(
    representations.map((representation) => cactusText(base, representation).catch(() => null)),
  );
  if (!smiles) throw new PubChemError(NOT_FOUND, "missing");
  return {
    provider: "cactus",
    cid: 0,
    title: query,
    iupacName: iupacName ?? "",
    formula: formula ?? "",
    molecularWeight: Number(weight ?? NaN),
    exactMass: Number(exact ?? NaN),
    smiles,
    inchiKey: (inchiKey ?? "").replace(/^InChIKey=/, ""),
    xlogp: null,
    charge: 0,
    cas: null,
    // Once PubChem answers again, the same name finds the record there.
    url: `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(query)}`,
    ghs: null,
  };
}

const identities = new Map<string, Promise<PubChemInfo>>();

/** A compound's identity by name (or CID): PubChem, else CACTUS while PubChem is down. */
function identity(query: string): Promise<PubChemInfo> {
  const key = query.toLowerCase();
  const known = identities.get(key);
  if (known) return known;
  const lookup = fromPubChem(query).catch(async (error: unknown) => {
    // A CID means nothing to CACTUS.
    if (/^\d+$/.test(query)) throw error;
    const pubchemMissing = error instanceof PubChemError && error.kind === "missing";
    try {
      return await fromCactus(query);
    } catch (fallback) {
      if (pubchemMissing) throw new PubChemError(NOT_FOUND, "missing");
      if (fallback instanceof PubChemError && fallback.kind === "missing") {
        throw new PubChemError("PubChem şu an yanıt vermiyor (sunucu yoğun); yedek kaynak NCI CACTUS da bu adı bulamadı. Adı İngilizce yazmayı deneyin.", "missing");
      }
      throw new PubChemError("PubChem şu an yanıt vermiyor (sunucu yoğun) ve yedek kaynak NCI CACTUS'a da ulaşılamadı. Biraz sonra tekrar deneyin.");
    }
  });
  identities.set(key, lookup);
  // A failed lookup is not kept: the next question asks again.
  lookup.catch(() => identities.delete(key));
  return lookup;
}

export async function lookupPubChem(name: string, withGhs: boolean): Promise<PubChemInfo> {
  const query = name.trim();
  if (!query) throw new PubChemError("Bileşik adı boş.", "missing");
  const info = await identity(query);
  if (!withGhs || info.provider !== "pubchem") return info;
  let ghs: PubChemGhs | null = null;
  try {
    ghs = await ghsFor(info.cid);
  } catch {
    ghs = null;
  }
  return { ...info, ghs };
}

/** The SMILES of a named compound, for drawing it when only its name is known. */
export async function smilesForName(name: string): Promise<{ smiles: string; provider: PubChemInfo["provider"] }> {
  const info = await lookupPubChem(name, false);
  if (!info.smiles) throw new PubChemError(`"${name}" için kayıtta SMILES yok.`, "missing");
  return { smiles: info.smiles, provider: info.provider };
}
