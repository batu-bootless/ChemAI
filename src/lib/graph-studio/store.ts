// Client-side persistence for Graph Studio, mirroring the Digital Lab Notebook's
// localStorage-draft convention (LabNotebook.tsx). The graph library and the
// in-progress draft both live in localStorage; a separate sessionStorage slot
// carries a one-shot hand-off payload from the Calculators module.

import type { DataTable, GraphSpec, GraphType } from "./types";
import { blankGraph, defaultSettings, emptyAxis } from "./types";
import type { AiGraphResult } from "@/lib/ai/client";
import { gs } from "@/mobile/translations/graphStudio";

const LIBRARY_KEY = "chemplus-graph-studio-v1";
const HANDOFF_KEY = "chemplus-graph-handoff";
const SPEC_HANDOFF_KEY = "chemplus-graph-spec-handoff";

export function loadLibrary(): GraphSpec[] {
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GraphSpec[]) : [];
  } catch {
    return [];
  }
}

export function saveLibrary(graphs: GraphSpec[]): void {
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(graphs));
  } catch {
    // ignore quota / serialization failures — the working copy stays in memory
  }
}

// ---- Calculator -> Graph Studio hand-off -----------------------------------

export interface CalculatorHandoff {
  title: string;
  calculator: string;
  table: DataTable;
  suggestedType: GraphType;
}

export function writeHandoff(payload: CalculatorHandoff): void {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    // best-effort; if it fails the studio just opens blank
  }
}

/** Reads and clears the one-shot hand-off payload (consumed on Graph Studio open). */
export function consumeHandoff(): CalculatorHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(HANDOFF_KEY);
    return JSON.parse(raw) as CalculatorHandoff;
  } catch {
    return null;
  }
}

// ---- AI (structured action) -> Graph Studio -------------------------------

/** Builds a full GraphSpec from a validated AI graph result (shared by the studio and Business analysis). */
export function graphSpecFromAi(r: AiGraphResult): GraphSpec {
  const colCount = r.columns.length;
  const yColumns =
    r.type === "pie" || r.type === "histogram"
      ? [Math.min(1, colCount - 1)]
      : Array.from({ length: Math.max(1, Math.min(colCount - 1, 4)) }, (_, i) => i + 1);
  return blankGraph({
    type: r.type,
    title: r.title || "AI Grafik",
    source: "manual",
    data: { columns: r.columns, rows: r.rows },
    xAxis: emptyAxis(r.xLabel, r.xUnit),
    yAxis: emptyAxis(r.yLabel, r.yUnit),
    settings: { ...defaultSettings(), regression: r.regression },
    mapping: { xColumn: 0, yColumns, labelColumn: 0, valueColumn: Math.min(1, colCount - 1), ohlc: { time: 0, open: 1, high: 2, low: 3, close: 4 } },
  });
}

/** One-shot full-spec hand-off (e.g. Business "AI graph" → open in Graph Studio). */
export function writeSpecHandoff(spec: GraphSpec): void {
  try {
    window.sessionStorage.setItem(SPEC_HANDOFF_KEY, JSON.stringify(spec));
  } catch {
    /* best effort */
  }
}

export function consumeSpecHandoff(): GraphSpec | null {
  try {
    const raw = window.sessionStorage.getItem(SPEC_HANDOFF_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SPEC_HANDOFF_KEY);
    return JSON.parse(raw) as GraphSpec;
  } catch {
    return null;
  }
}

export function graphFromHandoff(handoff: CalculatorHandoff): GraphSpec {
  return blankGraph({
    title: handoff.title || gs("Hesaplama Grafiği"),
    type: handoff.suggestedType,
    source: "calculator",
    calculatorSource: handoff.calculator,
    data: handoff.table,
    mapping: {
      xColumn: 0,
      yColumns: [1],
      labelColumn: 0,
      valueColumn: 1,
      ohlc: { time: 0, open: 1, high: 2, low: 3, close: 4 },
    },
  });
}
