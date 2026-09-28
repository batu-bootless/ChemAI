import { htmlToPdf } from "@/lib/pdf/htmlToPdf";
import { buildReportHtml, type Experiment } from "./notebook-core";

// Generates a real, downloadable PDF of the experiment report (instead of the
// old "open a print window and let the user Save as PDF", which does nothing on
// mobile / inside the workspace iframe).
//
// The report HTML (buildReportHtml) is fully self-contained and uses only hex
// colours, which is what the shared renderer needs; everything else - the hidden
// iframe, html2canvas, the A4 slicing and the download - lives in
// `lib/pdf/htmlToPdf.ts`, because the experiment-report module needs the same.
export async function exportReportPdf(experiment: Experiment, fileName: string): Promise<void> {
  await htmlToPdf(buildReportHtml(experiment), fileName);
}
