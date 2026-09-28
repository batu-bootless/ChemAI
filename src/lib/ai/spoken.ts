// Chem+ app: the first thing voice mode says after a calculation - the result itself, in one
// sentence, straight from the engine.
//
// The engine is done in a moment; the AI's explanation takes a few seconds more. Saying the result
// as soon as it exists keeps the conversation going the way a person would ("pH comes out at about
// 2.88 - let me explain"), while the cards appear on screen and the explanation is written.

import type { ToolOutcome } from "@/lib/chem-engine/tools";
import { fixed, fmt, type Language } from "@/lib/chem-engine/format";

/** "5 dakikalık", "1 saat 30 dakikalık", "45 saniyelik" - or "5-minute" in English. */
function timerLength(seconds: number, language: Language): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (language === "en") {
    const parts = [h && `${h}-hour`, m && `${m}-minute`, s && `${s}-second`].filter(Boolean);
    return parts.join(" ");
  }
  const parts: [number, string, string][] = [
    [h, "saat", "saatlik"],
    [m, "dakika", "dakikalık"],
    [s, "saniye", "saniyelik"],
  ];
  const used = parts.filter(([value]) => value > 0);
  return used.map(([value, word, adjective], index) => `${value} ${index === used.length - 1 ? adjective : word}`).join(" ");
}

export function spokenHeadline(outcome: ToolOutcome, language: Language): string | null {
  if (!outcome.ok) return null;
  const tr = language === "tr";
  const n = (value: number, sig = 3) => fmt(value, language, sig);
  switch (outcome.tool) {
    case "molar_mass":
      return tr
        ? `${outcome.data.pretty} için mol kütlesi ${n(outcome.data.molarMass, 5)} g/mol.`
        : `The molar mass of ${outcome.data.pretty} is ${n(outcome.data.molarMass, 5)} g/mol.`;
    case "molecule":
      return tr
        ? `${outcome.data.name ?? "Molekül"}: formülü ${outcome.data.formula}, mol kütlesi ${n(outcome.data.averageMass, 5)} g/mol.`
        : `${outcome.data.name ?? "The molecule"}: formula ${outcome.data.formula}, molar mass ${n(outcome.data.averageMass, 5)} g/mol.`;
    case "complex":
      return tr
        ? `${outcome.data.compound}: ${outcome.data.geometryName} geometri, mol kütlesi ${n(outcome.data.molarMass, 5)} gram bölü mol.`
        : `${outcome.data.compound}: ${outcome.data.geometryName} geometry, molar mass ${n(outcome.data.molarMass, 5)} grams per mole.`;
    case "vsepr":
      return tr
        ? `${outcome.data.formula}: ${outcome.data.shape}, hibritleşme ${outcome.data.hybridisation}.`
        : `${outcome.data.formula}: ${outcome.data.shape}, ${outcome.data.hybridisation} hybridised.`;
    case "pubchem":
      return tr
        ? `${outcome.data.title}: formülü ${outcome.data.formula}, mol kütlesi ${n(outcome.data.molecularWeight, 5)} g/mol.`
        : `${outcome.data.title}: formula ${outcome.data.formula}, molar mass ${n(outcome.data.molecularWeight, 5)} g/mol.`;
    case "balance":
      return tr ? `Denkleşmiş hali şöyle: ${outcome.data.text}.` : `Balanced, it reads: ${outcome.data.text}.`;
    case "stoichiometry": {
      const limiting = outcome.data.reactants.filter((r) => r.limiting).map((r) => r.pretty).join(tr ? " ve " : " and ");
      const product = outcome.data.products[0];
      return tr
        ? `Sınırlayıcı bileşen ${limiting}; ${product.pretty} için teorik verim ${n(product.mass)} gram.`
        : `The limiting reagent is ${limiting}; the theoretical yield of ${product.pretty} is ${n(product.mass)} grams.`;
    }
    case "ph":
      return tr ? `pH yaklaşık ${fixed(outcome.data.pH, 2, language)} çıkıyor.` : `The pH comes out at about ${fixed(outcome.data.pH, 2, language)}.`;
    case "titration": {
      const eq = outcome.data.equivalence[outcome.data.equivalence.length - 1];
      return tr
        ? `Eşdeğerlik noktası ${n(eq.v)} mililitrede, pH ${fixed(eq.pH, 2, language)}.`
        : `The equivalence point is at ${n(eq.v)} millilitres, pH ${fixed(eq.pH, 2, language)}.`;
    }
    case "solution_prep":
      return outcome.data.weighMass !== undefined
        ? tr
          ? `${n(outcome.data.weighMass, 4)} gram ${outcome.data.pretty} tartman gerekiyor.`
          : `You need to weigh ${n(outcome.data.weighMass, 4)} grams of ${outcome.data.pretty}.`
        : tr
          ? `${n(outcome.data.stockVolume_mL ?? 0)} mililitre stok alman gerekiyor.`
          : `You need ${n(outcome.data.stockVolume_mL ?? 0)} millilitres of stock.`;
    case "dilution":
      return tr
        ? `${outcome.data.solvedFor} değeri ${n(outcome.data.value)} ${outcome.data.solvedFor.startsWith("V") ? outcome.data.volumeUnit : outcome.data.concentrationUnit}.`
        : `${outcome.data.solvedFor} is ${n(outcome.data.value)} ${outcome.data.solvedFor.startsWith("V") ? outcome.data.volumeUnit : outcome.data.concentrationUnit}.`;
    case "gas":
      return tr
        ? `${outcome.data.solvedFor} yaklaşık ${n(outcome.data.value)} ${outcome.data.unit}.`
        : `${outcome.data.solvedFor} is about ${n(outcome.data.value)} ${outcome.data.unit}.`;
    case "evaluate":
      return tr
        ? `${outcome.data.label} yaklaşık ${n(outcome.data.value)}${outcome.data.unit ? ` ${outcome.data.unit}` : ""}.`
        : `${outcome.data.label} is about ${n(outcome.data.value)}${outcome.data.unit ? ` ${outcome.data.unit}` : ""}.`;
    case "solve": {
      const root = outcome.data.roots.find((r) => r > 0) ?? outcome.data.roots[0];
      return tr
        ? `${outcome.data.variable} yaklaşık ${n(root)}${outcome.data.unit ? ` ${outcome.data.unit}` : ""}.`
        : `${outcome.data.variable} is about ${n(root)}${outcome.data.unit ? ` ${outcome.data.unit}` : ""}.`;
    }
    case "convert":
      return tr
        ? `${n(outcome.data.value)} ${outcome.data.from}, ${n(outcome.data.result, 4)} ${outcome.data.to} ediyor.`
        : `${n(outcome.data.value)} ${outcome.data.from} is ${n(outcome.data.result, 4)} ${outcome.data.to}.`;
    case "regression":
      return tr
        ? `Kalibrasyon doğrusunun R karesi ${fmt(outcome.data.fit.r2, language, 4)}${outcome.data.unknown ? `; bilinmeyen için ${n(outcome.data.unknown.value)} çıkıyor` : ""}.`
        : `The calibration line has R squared ${fmt(outcome.data.fit.r2, language, 4)}${outcome.data.unknown ? `; the unknown comes out at ${n(outcome.data.unknown.value)}` : ""}.`;
    case "stats":
      return tr
        ? `Ortalama ${n(outcome.data.description.mean, 4)}, standart sapma ${n(outcome.data.description.sd)}.`
        : `The mean is ${n(outcome.data.description.mean, 4)}, standard deviation ${n(outcome.data.description.sd)}.`;
    case "spectra": {
      const first = outcome.data.matches.find((m) => m.bands.length);
      return first ? (tr ? `${first.value} için en olası atama ${first.bands[0].assignment}.` : `At ${first.value} the likeliest assignment is ${first.bands[0].assignment}.`) : null;
    }
    case "timer":
      return tr ? `${timerLength(outcome.data.seconds, language)} zamanlayıcıyı başlattım.` : `I've started a ${timerLength(outcome.data.seconds, language)} timer.`;
    case "note":
      return tr ? `Notu kaydettim: ${outcome.data.title}.` : `I've saved the note: ${outcome.data.title}.`;
    case "protocol":
      return tr ? `${outcome.data.title} protokolünü oluşturdum, ${outcome.data.steps.length} adım.` : `I've set up the ${outcome.data.title} protocol, ${outcome.data.steps.length} steps.`;
    case "inventory_add":
      return tr
        ? `${outcome.data.name} envantere eklendi${outcome.notes.length ? "; ama aynı yerde uyumsuz bir kimyasal var, karta bak" : ""}.`
        : `${outcome.data.name} is on the inventory${outcome.notes.length ? "; careful, something incompatible shares its shelf" : ""}.`;
    case "lab_report":
      return tr
        ? `Deney raporunu yazdım${outcome.data.pdf === "saved" ? ", PDF'ini de indirdim" : ""}.`
        : `I've written the lab report${outcome.data.pdf === "saved" ? " and saved its PDF" : ""}.`;
    case "graph":
      return tr ? `Grafiği çizdim: ${outcome.data.spec.title}.` : `I've drawn the graph: ${outcome.data.spec.title}.`;
    case "safety":
      return outcome.data.chemical
        ? tr
          ? `${outcome.data.chemical.nameTr} için uyarı: ${outcome.data.chemical.signal === "danger" ? "tehlike" : "dikkat"}.`
          : `${outcome.data.chemical.name} carries a ${outcome.data.chemical.signal === "danger" ? "danger" : "warning"} label.`
        : null;
  }
}

const INTROS: Record<Language, string[]> = {
  tr: ["Hesapladım.", "Sonuç hazır.", "Hesap tamam."],
  en: ["Done.", "Got it.", "Worked it out."],
};
const BRIDGES: Record<Language, string[]> = {
  tr: ["Ayrıntılar ekranda; kısaca açıklayayım.", "Kartları ekrana koydum, şöyle özetleyeyim.", "Detaylar ekranda, bir de yorumlayayım."],
  en: ["The details are on screen; let me explain briefly.", "The cards are on screen; here's the gist.", "Details are on screen; let me put it in context."],
};

/** After something done in the app (a timer, a note…): its card is on screen. */
const ACTION_BRIDGES: Record<Language, string[]> = {
  tr: ["Kartını ekrana koydum.", "Ekranda görebilirsin."],
  en: ["It's on screen.", "The card is on screen."],
};

const pick = (options: string[]) => options[Math.floor(Math.random() * options.length)] ?? options[0];

/** The fixed lines around a result, which the natural voice keeps ready on the phone. */
export function recurringResultLines(language: Language): string[] {
  return [...INTROS[language], ...BRIDGES[language], ...ACTION_BRIDGES[language]];
}

/**
 * One or two headlines and a bridge to the explanation, for voice mode to say right away.
 * `acknowledged`: "Hemen hesaplıyorum." was already said, so the result comes without an intro.
 */
export function spokenResults(outcomes: ToolOutcome[], language: Language, { acknowledged = false }: { acknowledged?: boolean } = {}): string | null {
  const lines = outcomes.map((outcome) => spokenHeadline(outcome, language)).filter((line): line is string => Boolean(line)).slice(0, 2);
  if (lines.length === 0) return null;
  // Something was done rather than computed: no "Hesapladım.", and its card is what is on screen.
  const acted = outcomes.some((outcome) => outcome.ok && outcome.source === "app");
  return [acknowledged || acted ? "" : pick(INTROS[language]), ...lines, pick(acted ? ACTION_BRIDGES[language] : BRIDGES[language])].filter(Boolean).join(" ");
}
