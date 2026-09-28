// Turns pasted text or an uploaded CSV/TSV/JSON/TXT file into a DataTable.
// Delimiter and header row are auto-detected; XLSX is intentionally out of scope
// for v1 (would require a binary spreadsheet parser dependency).

import { textFor } from "@/mobile/i18n";
import type { DataTable } from "./types";

function looksNumeric(s: string): boolean {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return false;
  return Number.isFinite(Number(t));
}

/** Splits a single delimited line, honouring simple double-quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const counts = ["\t", ";", ",", " "].map((d) => ({ d, n: firstLine.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 1 ? counts[0].d : ",";
}

function normalizeColumns(rows: string[][]): number {
  return rows.reduce((max, r) => Math.max(max, r.length), 0);
}

/** Parses delimited text (CSV/TSV/paste). Treats a non-numeric first row as headers. */
export function parseDelimited(text: string): DataTable {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!clean) return { columns: [], rows: [] };
  const delimiter = detectDelimiter(clean);
  const lines = clean.split("\n").filter((l) => l.trim() !== "");
  const cells = lines.map((l) => splitLine(l, delimiter));
  const width = normalizeColumns(cells);
  const padded = cells.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  });

  const firstRowNumeric = padded[0].some(looksNumeric);
  let columns: string[];
  let rows: string[][];
  if (firstRowNumeric) {
    columns = Array.from({ length: width }, (_, i) => (i === 0 ? "X" : `Y${i}`));
    rows = padded;
  } else {
    columns = padded[0].map((c, i) => c || `${textFor("Sütun", "Column")} ${i + 1}`);
    rows = padded.slice(1);
  }
  return { columns, rows };
}

/** Parses JSON: either {columns,rows}, an array of row-objects, or an array of arrays. */
export function parseJson(text: string): DataTable {
  const data = JSON.parse(text);
  if (data && Array.isArray(data.columns) && Array.isArray(data.rows)) {
    return { columns: data.columns.map(String), rows: data.rows.map((r: unknown[]) => r.map(String)) };
  }
  if (Array.isArray(data) && data.length > 0) {
    if (Array.isArray(data[0])) {
      const width = normalizeColumns(data as string[][]);
      return {
        columns: Array.from({ length: width }, (_, i) => (i === 0 ? "X" : `Y${i}`)),
        rows: (data as unknown[][]).map((r) => r.map(String)),
      };
    }
    if (typeof data[0] === "object" && data[0] !== null) {
      const keys = Array.from(new Set(data.flatMap((o: object) => Object.keys(o))));
      return {
        columns: keys,
        rows: (data as Record<string, unknown>[]).map((o) => keys.map((k) => (o[k] === undefined || o[k] === null ? "" : String(o[k])))),
      };
    }
  }
  throw new Error(textFor("Desteklenmeyen JSON yapısı.", "Unsupported JSON structure."));
}

export function parseText(text: string, filename?: string): DataTable {
  const isJson = filename?.toLowerCase().endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[");
  return isJson ? parseJson(text) : parseDelimited(text);
}

/** Column indices whose cells are (mostly) numeric — used to auto-pick X/Y roles. */
export function numericColumns(table: DataTable): number[] {
  return table.columns
    .map((_, col) => {
      const vals = table.rows.map((r) => r[col] ?? "");
      const numeric = vals.filter((v) => v.trim() !== "" && looksNumeric(v)).length;
      const nonEmpty = vals.filter((v) => v.trim() !== "").length || 1;
      return { col, ratio: numeric / nonEmpty };
    })
    .filter((c) => c.ratio >= 0.6)
    .map((c) => c.col);
}

export function cellToNumber(cell: string | undefined): number {
  if (cell === undefined) return NaN;
  const t = cell.trim().replace(/,/g, "");
  if (t === "") return NaN;
  return Number(t);
}
