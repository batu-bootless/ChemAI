// ChemAI: a protocol as something to hand someone else - a printable page or a block of text.
//
// The HTML is self-contained and uses hex colours only, which is what the shared PDF renderer
// needs; it rasterises the page, so Turkish characters survive where jsPDF's Latin-1 fonts would
// drop them.

import { clock, stepsOf, type Protocol, type Step } from "./model";

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blocksHtml(step: Step, language: "tr" | "en"): string {
  if (step.blocks.length === 0) return "";
  const rows = step.blocks
    .map((block) => {
      if (block.kind === "timer" || block.kind === "stopwatch") {
        return `<li><b>${escape(block.label)}</b> — ${clock(block.seconds ?? 0)}</li>`;
      }
      if (block.kind === "todo") {
        return `<li>${block.done ? "☑" : "☐"} ${escape(block.label)}</li>`;
      }
      if (block.kind === "table") {
        const body = (block.rows ?? [])
          .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`)
          .join("");
        return `<li><table>${body}</table></li>`;
      }
      if (block.kind === "note") {
        return `<li><b>${escape(block.label)}:</b> ${escape(block.body ?? "")}</li>`;
      }
      if (block.kind === "module") {
        const word = language === "en" ? "module" : "modül";
        return `<li>${escape(block.label)} <span class="dim">(${word})</span></li>`;
      }
      return `<li>${escape(block.label)}</li>`;
    })
    .join("");
  return `<ul class="blocks">${rows}</ul>`;
}

function stepHtml(step: Step, number: number, language: "tr" | "en"): string {
  return `
    <div class="step">
      <h3><span class="num">${number}</span> ${escape(step.emoji)} ${escape(step.title)}</h3>
      ${step.description ? `<p>${escape(step.description)}</p>` : ""}
      ${blocksHtml(step, language)}
    </div>`;
}

export function buildProtocolHtml(protocol: Protocol, language: "tr" | "en"): string {
  const pick = (tr: string, en: string) => (language === "en" ? en : tr);
  const numberOf = (step: Step) => protocol.steps.indexOf(step) + 1;

  const loose = stepsOf(protocol, null)
    .map((step) => stepHtml(step, numberOf(step), language))
    .join("");

  const grouped = protocol.groups
    .map((group) => {
      const inner = stepsOf(protocol, group.id)
        .map((step) => stepHtml(step, numberOf(step), language))
        .join("");
      return `<section class="group"><h2>${escape(group.name)}</h2>${
        group.description ? `<p class="dim">${escape(group.description)}</p>` : ""
      }${inner}</section>`;
    })
    .join("");

  const materials =
    protocol.materials.length > 0
      ? `<section><h2>${pick("Malzemeler", "Materials")}</h2><ul>${protocol.materials
          .map((entry) => `<li>${escape(entry)}</li>`)
          .join("")}</ul></section>`
      : "";

  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 44px 50px; background: #ffffff; color: #111111;
           font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.5; }
    header { border-bottom: 2.5px solid #111111; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { margin: 0 0 4px; font-size: 20pt; line-height: 1.2; }
    h2 { margin: 18px 0 6px; font-size: 12.5pt; text-transform: uppercase; letter-spacing: 0.06em;
         border-left: 5px solid #111111; padding-left: 9px; }
    h3 { margin: 0 0 4px; font-size: 12.5pt; }
    .num { display: inline-block; min-width: 22px; height: 22px; line-height: 22px; text-align: center;
           border: 2px solid #111111; border-radius: 6px; font-size: 10pt; margin-right: 6px; }
    .step { border: 2px solid #111111; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
            page-break-inside: avoid; }
    .step p { margin: 0 0 6px; }
    .blocks { margin: 6px 0 0; padding-left: 18px; font-size: 11pt; }
    .group { border-left: 3px dashed #999999; padding-left: 12px; margin: 16px 0; }
    table { border-collapse: collapse; margin: 4px 0; }
    td { border: 1.5px solid #111111; padding: 3px 7px; font-size: 10.5pt; }
    .dim { color: #777777; }
    footer { margin-top: 26px; border-top: 1px solid #cccccc; padding-top: 8px; font-size: 9pt; color: #777777; }
  </style></head><body>
    <header>
      <h1>${escape(protocol.emoji)} ${escape(protocol.title)}</h1>
      <div class="dim">${escape(protocol.description)}</div>
    </header>
    ${materials}
    ${loose}
    ${grouped}
    <footer>${pick("ChemAI ile hazırlandı", "Prepared with ChemAI")}</footer>
  </body></html>`;
}

/** The same protocol as plain text, for the share sheet. */
export function protocolAsText(protocol: Protocol, language: "tr" | "en"): string {
  const lines: string[] = [`${protocol.emoji} ${protocol.title}`];
  if (protocol.description) lines.push(protocol.description);
  if (protocol.materials.length > 0) {
    lines.push("", language === "en" ? "Materials:" : "Malzemeler:");
    protocol.materials.forEach((entry) => lines.push(`- ${entry}`));
  }
  lines.push("");
  protocol.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.title}`);
    if (step.description) lines.push(`   ${step.description}`);
    step.blocks.forEach((block) => {
      if (block.kind === "timer" || block.kind === "stopwatch") {
        lines.push(`   ⏱ ${block.label} — ${clock(block.seconds ?? 0)}`);
      } else if (block.kind === "todo") {
        lines.push(`   ${block.done ? "☑" : "☐"} ${block.label}`);
      } else if (block.kind === "note") {
        lines.push(`   ⚠ ${block.label}: ${block.body ?? ""}`);
      } else {
        lines.push(`   • ${block.label}`);
      }
    });
  });
  return lines.join("\n");
}
