import { downloadBlob as hostDownloadBlob, downloadHref as hostDownloadHref, openBlankWindow } from "@/lib/workspace/frameBridge";
import { getLanguage } from "@/mobile/preferences";
import { nb } from "@/mobile/translations/labNotebook";

export type ExperimentStatus = "Planned" | "In Progress" | "Completed" | "Failed" | "Needs Review" | "Reported";
export type UserRole = "Admin" | "Researcher" | "Student" | "Lab Manager" | "Viewer";
export type Severity = "Low" | "Medium" | "High" | "Critical";
export type ViewMode = "cards" | "table" | "timeline" | "calendar";

export interface ChemicalUsed {
  id: string;
  name: string;
  formula: string;
  casNumber: string;
  quantity: string;
  unit: string;
  concentration: string;
  purity: string;
  hazardClass: string;
  storageCondition: string;
  sdsLink: string;
  ppeRequirement: string;
  wasteDisposalNote: string;
  notes: string;
}

export interface EquipmentUsed {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  calibrationDate: string;
  purpose: string;
  condition: string;
  responsiblePerson: string;
  notes: string;
}

export interface ProcedureStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  duration: string;
  temperature: string;
  pressure: string;
  pH: string;
  safetyNote: string;
  observationNote: string;
  isCompleted: boolean;
  attachment: string;
}

export interface Observation {
  id: string;
  title: string;
  type: string;
  time: string;
  relatedStepId: string;
  description: string;
  attachment: string;
  importanceLevel: string;
  notes: string;
}

export interface ExperimentResult {
  finalResult: string;
  productObtained: string;
  yield: string;
  purity: string;
  finalPH: string;
  concentration: string;
  absorbance: string;
  mass: string;
  volume: string;
  errorMargin: string;
  researcherComment: string;
  conclusion: string;
  dataTable: Array<Record<string, string>>;
  graphData: Array<Record<string, string | number>>;
}

export interface ExperimentAttachment {
  id: string;
  fileName: string;
  fileType: string;
  uploadDate: string;
  description: string;
  relatedSection: string;
  size: string;
  uploadedBy: string;
  url: string;
}

export interface AISummary {
  experimentSummary: string;
  methodSummary: string;
  keyObservations: string;
  resultInterpretation: string;
  possibleErrorSources: string;
  safetyNotes: string;
  improvementSuggestions: string;
  academicConclusion: string;
  reportQualityFeedback: string;
  generatedAt: string;
}

export interface AIWarning {
  id: string;
  type: string;
  message: string;
  severity: Severity;
  relatedSection: string;
  suggestedAction: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  description: string;
  user: string;
  timestamp: string;
}

export interface Experiment {
  id: string;
  title: string;
  code: string;
  researcher: string;
  laboratory: string;
  department: string;
  supervisor: string;
  projectName: string;
  date: string;
  category: string;
  // Cover-page fields for the academic report template.
  university: string;
  courseName: string;
  studentNumber: string;
  groupSection: string;
  submissionDate: string;
  objective: string;
  hypothesis: string;
  theory: string;
  setup: string;
  calculations: string;
  rawData: string;
  graphsTablesNote: string;
  safetyAndWaste: string;
  discussion: string;
  errorAnalysis: string;
  conclusionAndRecommendations: string;
  references: string;
  appendicesNote: string;
  status: ExperimentStatus;
  keywords: string[];
  progress: number;
  safetyScore: number;
  reportReadinessScore: number;
  chemicals: ChemicalUsed[];
  equipment: EquipmentUsed[];
  procedure: ProcedureStep[];
  observations: Observation[];
  results: ExperimentResult;
  attachments: ExperimentAttachment[];
  aiSummary?: AISummary;
  aiWarnings: AIWarning[];
  activityLogs: ActivityLog[];
  createdAt: string;
  updatedAt: string;
  role: UserRole;
  /** Local-browser "shared with team" flag for the enterprise demo — see src/lib/team.ts for scope notes. */
  sharedWithTeam?: boolean;
}

export const statuses: ExperimentStatus[] = ["Planned", "In Progress", "Completed", "Failed", "Needs Review", "Reported"];
export const categories = ["Analytical Chemistry", "Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Biochemistry", "Material Science", "General Chemistry"];
export const units = ["g", "mg", "kg", "mL", "L", "mol", "mmol"];
export const hazardClasses = ["Corrosive", "Flammable", "Toxic", "Oxidizer", "Irritant", "Environmental Hazard", "Low Risk"];
export const observationTypes = ["Color Change", "Precipitate Formation", "Gas Evolution", "Temperature Change", "pH Change", "Odor", "Crystal Formation", "Solubility Change", "Phase Change", "Other"];
export const roles: UserRole[] = ["Admin", "Researcher", "Student", "Lab Manager", "Viewer"];
export const templates = ["Solution Preparation", "Acid-Base Titration", "Organic Synthesis", "Spectroscopy Analysis", "Buffer Preparation", "Recrystallization", "Unknown Sample Analysis", "General Chemistry Experiment"];
export const STORAGE_KEY = "chemplus-lab-notebook-v2";

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");
export const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
export const today = () => new Date().toISOString().slice(0, 10);
export const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
export const sentence = (value: string) => `${(value || "Not specified").trim().replace(/[.]+$/, "")}.`;
export const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
export const numeric = (value: string) => Number(String(value || "").replace(/[^\d.-]/g, ""));

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
}

export function slug(value: string) {
  return (value || "notebook-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "notebook-report";
}

export function downloadTextFile(fileName: string, content: string, type = "text/plain") {
  hostDownloadBlob(fileName, new Blob([content], { type }));
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Canonical academic lab-report structure - shared by the on-screen A4 report
// view (ExperimentReport.tsx) and the PDF/Word export below, so both always
// stay in sync.
export function reportSections(experiment: Experiment): Array<[string, string]> {
  const join = (parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" · ");

  const chemicals = experiment.chemicals
    .map((c) =>
      join([
        c.name || "Kimyasal",
        c.formula && `(${c.formula})`,
        c.concentration && `Konsantrasyon: ${c.concentration}`,
        c.purity && `Saflık: ${c.purity}`,
        (c.quantity || c.unit) && `Miktar: ${`${c.quantity} ${c.unit}`.trim()}`,
        c.hazardClass && `Tehlike: ${c.hazardClass}`,
      ])
    )
    .join("\n");

  const equipment = experiment.equipment
    .map((e) => join([e.name || "Araç-gereç", e.model && `(${e.model})`, e.purpose && `Amaç: ${e.purpose}`]))
    .join("\n");

  const procedure = experiment.procedure
    .map((s) => {
      const conditions = join([
        s.duration && `Süre: ${s.duration}`,
        s.temperature && `Sıcaklık: ${s.temperature}`,
        s.pressure && `Basınç: ${s.pressure}`,
        s.pH && `pH: ${s.pH}`,
      ]);
      return `${s.stepNumber}. ${s.title || "Adım"}: ${s.description}`.trim() + (conditions ? ` — ${conditions}` : "");
    })
    .join("\n");

  const observations = experiment.observations.map((o) => `${o.type}: ${o.description}`).join("\n");

  const rawData = [
    experiment.rawData,
    ...experiment.results.dataTable.filter((r) => r.parameter || r.value).map((r) => `${r.parameter}: ${r.value} ${r.unit || ""}`.trim()),
  ]
    .filter(Boolean)
    .join("\n");

  const results = [
    experiment.results.finalResult,
    experiment.results.productObtained && `Elde edilen ürün: ${experiment.results.productObtained}`,
    experiment.results.yield && `Yüzde verim: ${experiment.results.yield}`,
    experiment.results.concentration && `Konsantrasyon: ${experiment.results.concentration}`,
    experiment.results.purity && `Saflık: ${experiment.results.purity}`,
    experiment.results.finalPH && `pH: ${experiment.results.finalPH}`,
    experiment.results.absorbance && `Absorbans: ${experiment.results.absorbance}`,
    experiment.results.errorMargin && `Hata payı: ${experiment.results.errorMargin}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Image attachments render as actual images (see sectionImages); only
  // non-image graph/table files (e.g. a CSV data table) are listed by name.
  const graphs = [
    experiment.graphsTablesNote,
    ...experiment.attachments
      .filter((a) => a.fileType !== "Photo")
      .filter((a) => /graph|grafik|chart|spectr|spektr|chromat|kromat|table|tablo|kalibr/i.test(`${a.relatedSection} ${a.fileType} ${a.fileName}`))
      .map((a) => `${a.fileName} (${a.fileType})`),
  ]
    .filter(Boolean)
    .join("\n");

  const safety = [
    experiment.safetyAndWaste,
    ...experiment.chemicals
      .filter((c) => c.ppeRequirement || c.wasteDisposalNote || c.hazardClass)
      .map((c) => join([c.name, c.hazardClass && `Tehlike: ${c.hazardClass}`, c.ppeRequirement && `KKD: ${c.ppeRequirement}`, c.wasteDisposalNote && `Atık: ${c.wasteDisposalNote}`])),
  ]
    .filter(Boolean)
    .join("\n");

  // Image attachments are rendered as actual images (see sectionImages), so the
  // appendix text lists only the non-image files.
  const appendix = [
    experiment.appendicesNote,
    ...experiment.attachments.filter((f) => f.fileType !== "Photo").map((file) => `${file.fileName} (${file.fileType}, ${file.size})`),
  ]
    .filter(Boolean)
    .join("\n");

  return [
    ["Deneyin Amacı", [experiment.objective, experiment.hypothesis && `Hipotez: ${experiment.hypothesis}`].filter(Boolean).join("\n")],
    ["Teorik Bilgi", experiment.theory],
    ["Kullanılan Kimyasallar", chemicals],
    ["Kullanılan Araç-Gereçler", equipment],
    ["Deneyin Yapılışı / Metot", procedure],
    ["Deney Düzeneği", experiment.setup],
    ["Gözlemler", observations],
    ["Ham Veriler", rawData],
    ["Hesaplamalar", experiment.calculations],
    ["Sonuçlar", results],
    ["Grafikler / Tablolar", graphs],
    ["Hata Analizi", experiment.errorAnalysis],
    ["Tartışma", experiment.discussion],
    ["Güvenlik ve Atık Yönetimi", safety],
    ["Sonuç ve Değerlendirme", experiment.conclusionAndRecommendations],
    ["Kaynakça", experiment.references],
    ["Ekler", appendix],
  ];
}

// Image attachments (data URIs) tied to a report section by relatedSection, so
// the report renders them inline as real images instead of listing file names.
// General uploads (relatedSection "Attachments") surface under "Ekler".
export function sectionImages(experiment: Experiment, heading: string): string[] {
  const keys = heading === "Ekler" ? ["Ekler", "Attachments"] : [heading];
  return experiment.attachments
    .filter((a) => a.fileType === "Photo" && a.url && keys.includes(a.relatedSection))
    .map((a) => a.url);
}

export function buildReportHtml(experiment: Experiment) {
  // Absolute URL so the logo resolves inside the about:blank print window and
  // the exported .doc (both open outside the app's routing).
  const logoUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/images/logo.png`;
  const dash = (v: string) => (v && v.trim() ? v : "—");
  const metadata: Array<[string, string]> = [
    ["Üniversite / Bölüm", dash([experiment.university, experiment.department].filter((x) => x && x.trim()).join(" / "))],
    ["Ders", dash(experiment.courseName)],
    ["Deney Kodu", dash(experiment.code)],
    ["Öğrenci", dash(experiment.researcher)],
    ["Öğrenci No", dash(experiment.studentNumber)],
    ["Grup / Şube", dash(experiment.groupSection)],
    ["Deney Tarihi", dash(experiment.date)],
    ["Teslim Tarihi", dash(experiment.submissionDate)],
    ["Öğretim Elemanı", dash(experiment.supervisor)],
    ["Durum", dash(nb(experiment.status))],
  ];
  return `<!doctype html>
  <html lang="${getLanguage()}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(experiment.title)} - ChemAI Lab Report</title>
    <style>
      body { margin: 0; background: #F5F5F7; color: #1D1D1F; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .page { max-width: 820px; margin: 28px auto; background: white; padding: 52px; box-shadow: 0 22px 70px rgba(29,29,31,.14); }
      .brand-logo { height: 34px; width: auto; display: block; }
      h1 { font-size: 30px; line-height: 1.15; margin: 14px 0 8px; }
      .sub { color: #6E6E73; font-size: 14px; }
      .meta { display: grid; grid-template-columns: repeat(2, 1fr); border: 1px solid #D2D2D7; margin-top: 28px; }
      .cell { padding: 14px; border-right: 1px solid #D2D2D7; border-bottom: 1px solid #D2D2D7; }
      .label { color: #6E6E73; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      .value { margin-top: 5px; font-size: 14px; font-weight: 600; }
      section { margin-top: 28px; break-inside: avoid; }
      h2 { color: #6E6E73; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 8px; }
      p { white-space: pre-line; font-size: 14px; line-height: 1.75; margin: 0; }
      .imgs { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; }
      .imgs img { max-width: 100%; max-height: 340px; border: 1px solid #E5E5EA; border-radius: 8px; }
      .signature { display: grid; grid-template-columns: repeat(2, 1fr); gap: 36px; margin-top: 56px; padding-top: 30px; border-top: 1px solid #D2D2D7; }
      .line { border-top: 1px solid #A1A1AA; padding-top: 10px; color: #6E6E73; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
      @media print { body { background: white; } .page { margin: 0; max-width: none; box-shadow: none; } }
    </style>
  </head>
  <body>
    <main class="page">
      <img class="brand-logo" src="${logoUrl}" alt="ChemAI" />
      <h1>${escapeHtml(experiment.title)}</h1>
      <div class="sub">${escapeHtml(nb("Dijital Laboratuvar Defteri — Deney Raporu"))}</div>
      <div class="meta">${metadata.map(([label, value]) => `<div class="cell"><div class="label">${escapeHtml(nb(label))}</div><div class="value">${escapeHtml(value)}</div></div>`).join("")}</div>
      ${reportSections(experiment)
        .map(([title, value]) => {
          const imgs = sectionImages(experiment, title);
          const hasText = Boolean(value && value.trim());
          const textHtml = hasText ? `<p>${escapeHtml(value)}</p>` : imgs.length ? "" : `<p>${escapeHtml(nb("Belirtilmedi."))}</p>`;
          const imgHtml = imgs.length ? `<div class="imgs">${imgs.map((u) => `<img src="${u}" alt="" />`).join("")}</div>` : "";
          return `<section><h2>${escapeHtml(nb(title))}</h2>${textHtml}${imgHtml}</section>`;
        })
        .join("")}
      <div class="signature"><div class="line">${escapeHtml(nb("Öğrenci imzası"))}</div><div class="line">${escapeHtml(nb("Öğretim elemanı onayı"))}</div></div>
    </main>
  </body>
  </html>`;
}

export function openReportWindow(experiment: Experiment, print = false) {
  const popup = openBlankWindow("_blank");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(buildReportHtml(experiment));
  popup.document.close();
  if (print) {
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }
  return true;
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  return ok;
}

export function downloadAttachment(file: ExperimentAttachment) {
  if (file.url && file.url !== "#") {
    hostDownloadHref(file.fileName, file.url);
    return;
  }
  downloadTextFile(file.fileName || "attachment.txt", `${file.fileName}\n${file.fileType}\n${file.description || ""}`, "text/plain;charset=utf-8");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export function recomputeExperiment(experiment: Experiment): Experiment {
  const aiWarnings = detectWarnings(experiment);
  return {
    ...experiment,
    aiWarnings,
    progress: calculateProgress(experiment),
    safetyScore: calculateSafetyScore(experiment),
    reportReadinessScore: calculateReportReadiness({ ...experiment, aiWarnings }),
    updatedAt: nowStamp(),
  };
}

export const notebookAIService = {
  async generateSummary(experiment: Experiment): Promise<AISummary> {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(createMockSummary(experiment)), 850);
    });
  },
};

export function calculateProgress(experiment: Partial<Experiment>): number {
  const checks = [
    Boolean(experiment.title),
    Boolean(experiment.objective),
    Boolean(experiment.researcher),
    Boolean(experiment.chemicals?.length),
    Boolean(experiment.equipment?.length),
    Boolean(experiment.procedure?.length),
    Boolean(experiment.observations?.length),
    Boolean(experiment.results?.finalResult),
    Boolean(experiment.results?.conclusion || experiment.results?.researcherComment),
    Boolean(experiment.attachments?.length),
  ];
  return clampScore((checks.filter(Boolean).length / checks.length) * 100);
}

export function calculateSafetyScore(experiment: Partial<Experiment>): number {
  const risky = (experiment.chemicals || []).filter((chemical) => ["Corrosive", "Toxic", "Flammable", "Oxidizer"].includes(chemical.hazardClass));
  const missingPpe = risky.filter((chemical) => !chemical.ppeRequirement).length;
  const missingSafety = (experiment.procedure || []).filter((item) => !item.safetyNote).length;
  return clampScore(100 - risky.length * 6 - missingPpe * 16 - missingSafety * 12);
}

export function calculateReportReadiness(experiment: Partial<Experiment>): number {
  const warningPenalty = (experiment.aiWarnings || []).reduce((sum, warning) => sum + (warning.severity === "Critical" ? 18 : warning.severity === "High" ? 12 : warning.severity === "Medium" ? 7 : 3), 0);
  const base = calculateProgress(experiment) * 0.7 + calculateSafetyScore(experiment) * 0.3;
  return clampScore(base - warningPenalty);
}

export function warningAction(message: string) {
  if (/quantity/i.test(message)) return "Enter an exact amount and unit before reporting.";
  if (/PPE|safety/i.test(message)) return "Add PPE, handling and disposal notes for the risky reagent.";
  if (/calibration/i.test(message)) return "Verify equipment calibration or assign a calibrated instrument.";
  if (/yield/i.test(message)) return "Recheck calculation inputs and theoretical yield.";
  if (/conclusion/i.test(message)) return "Add a scientific conclusion before generating the final report.";
  return "Review this section and complete the missing information.";
}

export function createMockSummary(experiment: Experiment): AISummary {
  const firstChemical = experiment.chemicals[0]?.name || "the selected reagent";
  const keyObservation = experiment.observations[0]?.description || "No precipitation was observed and the main system remained visually stable.";
  const isNaoh = /naoh|sodium hydroxide/i.test(experiment.title + experiment.chemicals.map((c) => c.name).join(" "));
  return {
    experimentSummary: isNaoh
      ? "This experiment focused on preparing a standard sodium hydroxide solution with a defined molarity."
      : `This experiment focused on the following objective: ${sentence(experiment.objective || experiment.title)}`,
    methodSummary: isNaoh
      ? "The required amount of NaOH was weighed, dissolved in distilled water and diluted to the final volume in a volumetric flask."
      : `The procedure used ${firstChemical}, documented equipment checks, controlled timing and recorded analytical observations.`,
    keyObservations: isNaoh ? "The solution became clear after complete dissolution. No precipitation was observed." : keyObservation,
    resultInterpretation: isNaoh
      ? "The solution preparation was successful. However, because NaOH is hygroscopic, the actual concentration should be verified by standardization."
      : experiment.results.finalResult || "The result section needs final interpretation before this record is report-ready.",
    possibleErrorSources: isNaoh
      ? "- Moisture absorption by NaOH\n- Inaccurate weighing\n- Incomplete dissolution\n- Meniscus reading error"
      : "- Balance tolerance\n- Meniscus reading error\n- Incomplete mixing\n- Instrument calibration drift",
    safetyNotes: isNaoh
      ? "NaOH is corrosive. Gloves, lab coat and safety goggles must be used."
      : `${firstChemical} should be handled according to SDS guidance with appropriate PPE and labeled containers.`,
    improvementSuggestions: isNaoh
      ? "Use a primary standard such as potassium hydrogen phthalate for standardization."
      : "Add replicate measurements, attach raw instrument output and define acceptance criteria before final approval.",
    academicConclusion: isNaoh
      ? "The prepared sodium hydroxide solution is suitable for preliminary analytical applications, but standardization is recommended before quantitative titration studies."
      : "The record is suitable for academic review after missing values, safety notes and raw data attachments are completed.",
    reportQualityFeedback: `Current report readiness is ${experiment.reportReadinessScore || calculateReportReadiness(experiment)}%. Complete high severity warnings and attach raw data before final approval.`,
    generatedAt: today(),
  };
}

export function detectWarnings(experiment: Experiment): AIWarning[] {
  const warnings: AIWarning[] = [];
  const pushWarning = (type: string, message: string, severity: Severity, relatedSection: string) => {
    warnings.push({ id: uid("warn"), type, message, severity, relatedSection, suggestedAction: warningAction(message) });
  };
  experiment.chemicals.forEach((chemical) => {
    if (!chemical.quantity) {
      pushWarning("Missing Field", "Chemical quantity is missing.", "High", "Chemicals");
    }
    if (["Corrosive", "Toxic", "Flammable", "Oxidizer"].includes(chemical.hazardClass) && !chemical.ppeRequirement) {
      pushWarning("Safety", "Dangerous chemical without PPE information.", chemical.hazardClass === "Toxic" ? "Critical" : "High", "Chemicals");
    }
    if (chemical.hazardClass === "Corrosive" && !experiment.procedure.some((step) => /glove|goggle|ppe|coat/i.test(step.safetyNote))) {
      pushWarning("Safety", "Safety note is missing for corrosive chemical.", "High", "Procedure");
    }
  });
  experiment.equipment.forEach((item) => {
    const calibrationTime = Date.parse(item.calibrationDate);
    const expired = calibrationTime && calibrationTime < Date.now() - 180 * 24 * 60 * 60 * 1000;
    if (expired) pushWarning("Calibration", "Equipment calibration date is expired.", "Medium", "Equipment");
  });
  if (!experiment.results.finalResult || !experiment.results.researcherComment) {
    pushWarning("Result", "Result section is incomplete.", "Medium", "Results");
  }
  if (numeric(experiment.results.yield) > 100) {
    pushWarning("Calculation", "Yield value is above 100%.", "Critical", "Results");
  }
  if (!experiment.results.conclusion && !experiment.aiSummary?.academicConclusion) {
    pushWarning("Conclusion", "No conclusion provided.", "Medium", "Report");
  }
  experiment.observations.forEach((observation) => {
    if (!observation.relatedStepId) {
      pushWarning("Observation Link", "Observation is not linked to a procedure step.", "Medium", "Observations");
    }
  });
  experiment.attachments.forEach((attachment) => {
    if (!attachment.description) {
      pushWarning("Attachment", "Attachment description is missing.", "Low", "Attachments");
    }
  });
  const pH = Number(experiment.results.finalPH || experiment.procedure.find((step) => step.pH)?.pH || "");
  if (!Number.isNaN(pH) && (pH < 0 || pH > 14)) {
    pushWarning("pH Range", "pH value seems unusual.", "High", "Results");
  }
  if (calculateReportReadiness({ ...experiment, aiWarnings: warnings }) < 75) {
    pushWarning("Report Readiness", "Report is not ready.", "Medium", "Report");
  }
  return warnings;
}

export function activity(action: string, description: string, user: string): ActivityLog {
  return { id: uid("act"), action, description, user, timestamp: nowStamp() };
}

export function baseResult(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    finalResult: "Experiment completed and recorded for review.",
    productObtained: "Recorded sample",
    yield: "96.2%",
    purity: "98.4%",
    finalPH: "7.00",
    concentration: "0.100 M",
    absorbance: "0.142",
    mass: "0.500 g",
    volume: "100.0 mL",
    errorMargin: "1.5%",
    researcherComment: "Raw data should be reviewed before final reporting.",
    conclusion: "The experiment is suitable for academic review after verification of raw data and safety documentation.",
    dataTable: [
      { parameter: "Trial 1", value: "0.101", unit: "M" },
      { parameter: "Trial 2", value: "0.099", unit: "M" },
    ],
    graphData: [
      { label: "Trial 1", value: 0.101 },
      { label: "Trial 2", value: 0.099 },
      { label: "Average", value: 0.1 },
    ],
    ...overrides,
  };
}

export function chemical(id: string, name: string, formula: string, quantity: string, unit: string, hazardClass: string, notes = ""): ChemicalUsed {
  const casNumbers: Record<string, string> = {
    "Sodium Hydroxide": "1310-73-2",
    "Hydrochloric Acid": "7647-01-0",
    "Salicylic Acid": "69-72-7",
    "Acetic Anhydride": "108-24-7",
    "Iron Standard Solution": "7439-89-6",
    "Sodium Acetate": "127-09-3",
    "Acetic Acid": "64-19-7",
    "Calcium Chloride": "10043-52-4",
    "Benzoic Acid": "65-85-0",
    "Distilled Water": "7732-18-5",
  };
  return {
    id,
    name,
    formula,
    casNumber: casNumbers[name] || "Not assigned",
    quantity,
    unit,
    concentration: unit === "mL" || unit === "L" ? "0.100 M" : "",
    purity: "99%",
    hazardClass,
    storageCondition: "Room temperature, labeled container",
    sdsLink: "https://example.com/sds",
    ppeRequirement: ["Corrosive", "Toxic", "Flammable", "Oxidizer"].includes(hazardClass) ? "Lab coat, nitrile gloves and splash goggles required." : "Standard lab coat and goggles.",
    wasteDisposalNote: hazardClass === "Low Risk" ? "Dispose according to local aqueous waste guidance." : "Collect in labeled hazardous waste container.",
    notes,
  };
}

export function equipment(id: string, name: string, purpose: string): EquipmentUsed {
  const models: Record<string, string> = {
    "Analytical Balance": "Mettler Toledo ME204",
    "pH Meter": "Hanna HI5221",
    "Magnetic Stirrer": "IKA C-MAG HS 7",
    "UV-Vis Spectrophotometer": "Shimadzu UV-1900i",
    Burette: "Class A 50 mL",
    Pipette: "Eppendorf Research Plus",
    "Volumetric Flask": "Class A 100 mL",
    Beaker: "Borosilicate 250 mL",
    "Erlenmeyer Flask": "Borosilicate 250 mL",
    "Hot Plate": "IKA C-MAG HP 7",
    "Melting Point Apparatus": "Stuart SMP30",
    "Test Tubes": "Borosilicate 16 x 150 mm",
  };
  return {
    id,
    name,
    model: models[name] || "Lab Standard",
    serialNumber: `NBL-${id.toUpperCase().slice(-5)}`,
    calibrationDate: "2026-04-20",
    purpose,
    condition: "Good",
    responsiblePerson: "Lab Manager",
    notes: "Calibration certificate reviewed.",
  };
}

export function step(id: string, stepNumber: number, title: string, description: string, safetyNote = "Use PPE and keep the bench clean."): ProcedureStep {
  return {
    id,
    stepNumber,
    title,
    description,
    duration: "10 min",
    temperature: "25 C",
    pressure: "1 atm",
    pH: "",
    safetyNote,
    observationNote: "Record visible change after this step.",
    isCompleted: stepNumber < 3,
    attachment: "",
  };
}

export function observation(id: string, title: string, type: string, relatedStepId: string, description: string): Observation {
  return {
    id,
    title,
    type,
    time: "10:30",
    relatedStepId,
    description,
    attachment: "",
    importanceLevel: "Medium",
    notes: "Observation verified by researcher.",
  };
}

export function attachment(id: string, fileName: string, fileType: string, relatedSection = "Results"): ExperimentAttachment {
  return {
    id,
    fileName,
    fileType,
    uploadDate: "2026-05-18",
    description: `${fileType} evidence for ${relatedSection.toLowerCase()}.`,
    relatedSection,
    size: fileType === "Video" ? "18.6 MB" : fileType === "CSV" ? "42 KB" : "1.2 MB",
    uploadedBy: "ChemAI",
    url: "#",
  };
}

export function blankExperiment(): Experiment {
  return {
    id: uid("exp"),
    title: "",
    code: "",
    researcher: "",
    laboratory: "ChemAI",
    department: "Chemistry Department",
    supervisor: "",
    projectName: "",
    date: today(),
    category: "Analytical Chemistry",
    university: "",
    courseName: "",
    studentNumber: "",
    groupSection: "",
    submissionDate: "",
    objective: "",
    hypothesis: "",
    theory: "",
    setup: "",
    calculations: "",
    rawData: "",
    graphsTablesNote: "",
    safetyAndWaste: "",
    discussion: "",
    errorAnalysis: "",
    conclusionAndRecommendations: "",
    references: "",
    appendicesNote: "",
    status: "Planned",
    keywords: [],
    progress: 0,
    safetyScore: 100,
    reportReadinessScore: 0,
    chemicals: [],
    equipment: [],
    procedure: [],
    observations: [],
    results: baseResult({ finalResult: "", productObtained: "", yield: "", purity: "", finalPH: "", concentration: "", absorbance: "", mass: "", volume: "", errorMargin: "", researcherComment: "", conclusion: "", dataTable: [], graphData: [] }),
    attachments: [],
    aiSummary: undefined,
    aiWarnings: [],
    activityLogs: [],
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
    role: "Researcher",
  };
}

export function normalizeExperiment(input: Partial<Experiment> & Record<string, unknown>): Experiment {
  const base = blankExperiment();
  const inputAny = input as any;
  const next: Experiment = {
    ...base,
    ...input,
    id: inputAny?.id || uid("exp"),
    title: inputAny?.title || "Imported Experiment",
    code: inputAny?.code || `NBL-${Date.now().toString().slice(-5)}`,
    researcher: inputAny?.researcher || "Imported Researcher",
    laboratory: inputAny?.laboratory || base.laboratory,
    department: inputAny?.department || base.department,
    supervisor: inputAny?.supervisor || "",
    projectName: inputAny?.projectName || "",
    date: inputAny?.date || today(),
    theory: inputAny?.theory || "",
    calculations: inputAny?.calculations || "",
    discussion: inputAny?.discussion || "",
    errorAnalysis: inputAny?.errorAnalysis || "",
    conclusionAndRecommendations: inputAny?.conclusionAndRecommendations || "",
    references: inputAny?.references || "",
    appendicesNote: inputAny?.appendicesNote || "",
    category: categories.includes(inputAny?.category) ? inputAny.category : base.category,
    status: statuses.includes(inputAny?.status) ? inputAny.status : "Planned",
    keywords: Array.isArray(inputAny?.keywords) ? inputAny.keywords : [],
    chemicals: Array.isArray(inputAny?.chemicals) ? inputAny.chemicals.map((item: any, index: number) => ({ ...chemical(uid("chem"), "", "", "", "g", "Low Risk"), ...item, id: item?.id || uid(`chem-${index}`) })) : [],
    equipment: Array.isArray(inputAny?.equipment) ? inputAny.equipment.map((item: any, index: number) => ({ ...equipment(uid("eq"), "", ""), ...item, id: item?.id || uid(`eq-${index}`) })) : [],
    procedure: Array.isArray(inputAny?.procedure) ? inputAny.procedure.map((item: any, index: number) => ({ ...step(uid("step"), index + 1, "", ""), ...item, id: item?.id || uid(`step-${index}`), stepNumber: Number(item?.stepNumber || index + 1), isCompleted: Boolean(item?.isCompleted) })) : [],
    observations: Array.isArray(inputAny?.observations) ? inputAny.observations.map((item: any, index: number) => ({ ...observation(uid("obs"), "", "Other", "", ""), ...item, id: item?.id || uid(`obs-${index}`) })) : [],
    results: { ...baseResult({ finalResult: "", productObtained: "", yield: "", purity: "", finalPH: "", concentration: "", absorbance: "", mass: "", volume: "", errorMargin: "", researcherComment: "", conclusion: "", dataTable: [], graphData: [] }), ...(inputAny?.results || {}) },
    attachments: Array.isArray(inputAny?.attachments) ? inputAny.attachments.map((item: any, index: number) => ({ ...attachment(uid("att"), item?.fileName || `imported-file-${index + 1}.txt`, item?.fileType || "File"), ...item, id: item?.id || uid(`att-${index}`) })) : [],
    aiWarnings: [],
    activityLogs: Array.isArray(inputAny?.activityLogs) ? inputAny.activityLogs : [activity("Experiment imported", "Experiment was imported into the browser notebook.", inputAny?.researcher || "Researcher")],
    createdAt: inputAny?.createdAt || nowStamp(),
    updatedAt: inputAny?.updatedAt || nowStamp(),
    role: roles.includes(inputAny?.role) ? inputAny.role : "Researcher",
  };
  return recomputeExperiment(next);
}

export function applyTemplateToDraft(draft: Experiment, templateName: string): Experiment {
  const templatePatch: Record<string, Partial<Experiment>> = {
    "Solution Preparation": {
      title: draft.title || "New Solution Preparation",
      category: "Analytical Chemistry",
      objective: "Prepare a solution with a defined concentration for analytical laboratory use.",
      chemicals: [chemical(uid("chem"), "Distilled Water", "H2O", "100", "mL", "Low Risk")],
      equipment: [equipment(uid("eq"), "Volumetric Flask", "Prepare final volume"), equipment(uid("eq"), "Analytical Balance", "Weigh solute accurately")],
      procedure: [step(uid("step"), 1, "Calculate and weigh solute", "Calculate required mass and weigh it using an analytical balance."), step(uid("step"), 2, "Dissolve and dilute", "Dissolve solute, transfer to volumetric flask and dilute to mark.")],
    },
    "Acid-Base Titration": {
      title: draft.title || "New Acid-Base Titration",
      category: "Analytical Chemistry",
      objective: "Determine an unknown acid or base concentration by titration.",
      chemicals: [chemical(uid("chem"), "Sodium Hydroxide", "NaOH", "25", "mL", "Corrosive"), chemical(uid("chem"), "Hydrochloric Acid", "HCl", "25", "mL", "Corrosive")],
      equipment: [equipment(uid("eq"), "Burette", "Deliver titrant"), equipment(uid("eq"), "Pipette", "Transfer sample aliquot")],
      procedure: [step(uid("step"), 1, "Prepare aliquot", "Transfer sample and add indicator."), step(uid("step"), 2, "Titrate to endpoint", "Deliver titrant until persistent endpoint color appears.")],
    },
    "Organic Synthesis": {
      title: draft.title || "New Organic Synthesis",
      category: "Organic Chemistry",
      objective: "Synthesize, isolate and characterize an organic compound.",
      chemicals: [chemical(uid("chem"), "Salicylic Acid", "C7H6O3", "2.00", "g", "Irritant"), chemical(uid("chem"), "Acetic Anhydride", "C4H6O3", "5.0", "mL", "Corrosive")],
      equipment: [equipment(uid("eq"), "Hot Plate", "Heat reaction"), equipment(uid("eq"), "Erlenmeyer Flask", "Reaction vessel")],
      procedure: [step(uid("step"), 1, "Combine reagents", "Combine reagents under appropriate safety conditions."), step(uid("step"), 2, "Isolate product", "Cool, crystallize and collect product.")],
    },
    "Spectroscopy Analysis": {
      title: draft.title || "New Spectroscopy Analysis",
      category: "Analytical Chemistry",
      objective: "Measure analyte concentration using instrument response and calibration data.",
      equipment: [equipment(uid("eq"), "UV-Vis Spectrophotometer", "Measure absorbance")],
      procedure: [step(uid("step"), 1, "Prepare calibration set", "Prepare blank, standards and unknown."), step(uid("step"), 2, "Measure signal", "Record absorbance at the selected wavelength.")],
    },
    "Buffer Preparation": {
      title: draft.title || "New Buffer Preparation",
      category: "Physical Chemistry",
      objective: "Prepare and verify a buffer solution at a target pH.",
      chemicals: [chemical(uid("chem"), "Sodium Acetate", "CH3COONa", "0.820", "g", "Low Risk"), chemical(uid("chem"), "Acetic Acid", "CH3COOH", "2.8", "mL", "Corrosive")],
      equipment: [equipment(uid("eq"), "pH Meter", "Verify final pH"), equipment(uid("eq"), "Magnetic Stirrer", "Mix solution")],
      procedure: [step(uid("step"), 1, "Prepare buffer components", "Dissolve salt and acid in water."), step(uid("step"), 2, "Adjust pH", "Measure and adjust to target pH.")],
    },
  };
  return { ...draft, ...(templatePatch[templateName] || {}), keywords: Array.from(new Set([...draft.keywords, templateName.toLowerCase()])), updatedAt: nowStamp() };
}
