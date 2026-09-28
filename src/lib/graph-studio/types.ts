// Core data model for ChemPlus Graph Studio.
//
// Data is held Excel-style as a table of string cells (columns + rows). Each
// graph type maps table columns to visual roles (x, series y's, OHLC, ...) via
// `GraphMapping`, so one dataset can be re-visualised as any chart type without
// reshaping. Cells stay strings until render/parse time so the table editor and
// CSV import can round-trip raw user input losslessly.

import { gs } from "@/mobile/translations/graphStudio";

export type GraphType =
  | "column"
  | "bar"
  | "line"
  | "area"
  | "scatter"
  | "pie"
  | "histogram"
  | "candlestick";

export type RegressionType = "none" | "linear" | "polynomial" | "exponential" | "logarithmic";

export type CurveType = "linear" | "monotone" | "step";

export type PaletteName = "default" | "warm" | "cool" | "mono" | "viridis";

export type GraphSource = "manual" | "calculator" | "report" | "import" | "template";

export interface DataTable {
  columns: string[];
  rows: string[][];
}

/** Column indices mapping table data to each chart type's visual roles. */
export interface GraphMapping {
  xColumn: number;
  yColumns: number[];
  labelColumn: number; // pie slice labels
  valueColumn: number; // pie / histogram values
  ohlc: { time: number; open: number; high: number; low: number; close: number };
}

export interface AxisConfig {
  label: string;
  unit: string;
  min: number | null; // null = auto
  max: number | null;
  logScale: boolean;
}

export interface GraphSettings {
  palette: PaletteName;
  showLegend: boolean;
  legendPosition: "top" | "bottom" | "right";
  showGrid: boolean;
  showDataLabels: boolean;
  scientificNotation: boolean;
  decimals: number | null; // null = auto
  // line / scatter / area
  curve: CurveType;
  lineWidth: number;
  pointSize: number;
  showPoints: boolean;
  fillOpacity: number; // area
  stacked: boolean; // column / bar / area
  horizontal: boolean; // bar vs column handled by type, kept for grouped/stacked toggles
  // scatter / line regression
  regression: RegressionType;
  polyDegree: number;
  showEquation: boolean;
  errorBars: boolean;
  errorColumn: number; // -1 = none
  // pie
  donut: boolean;
  innerRadius: number; // percent 0..90
  // histogram
  bins: number; // 0 = auto (Sturges)
  // export
  bgTransparent: boolean;
}

export interface GraphSpec {
  id: string;
  title: string;
  description: string;
  type: GraphType;
  data: DataTable;
  mapping: GraphMapping;
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  settings: GraphSettings;
  source: GraphSource;
  calculatorSource?: string;
  figureNumber: string;
  caption: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export function uid(prefix = "g"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyAxis(label = "", unit = ""): AxisConfig {
  return { label, unit, min: null, max: null, logScale: false };
}

export function defaultSettings(): GraphSettings {
  return {
    palette: "default",
    showLegend: true,
    legendPosition: "bottom",
    showGrid: true,
    showDataLabels: false,
    scientificNotation: false,
    decimals: null,
    curve: "linear",
    lineWidth: 2,
    pointSize: 4,
    showPoints: true,
    fillOpacity: 0.35,
    stacked: false,
    horizontal: false,
    regression: "none",
    polyDegree: 2,
    showEquation: true,
    errorBars: false,
    errorColumn: -1,
    donut: false,
    innerRadius: 55,
    bins: 0,
    bgTransparent: false,
  };
}

export function defaultMapping(): GraphMapping {
  return {
    xColumn: 0,
    yColumns: [1],
    labelColumn: 0,
    valueColumn: 1,
    ohlc: { time: 0, open: 1, high: 2, low: 3, close: 4 },
  };
}

export function emptyTable(): DataTable {
  return {
    columns: ["X", "Y"],
    rows: [
      ["1", "2.4"],
      ["2", "3.1"],
      ["3", "4.8"],
      ["4", "5.2"],
      ["5", "6.9"],
    ],
  };
}

export function blankGraph(partial: Partial<GraphSpec> = {}): GraphSpec {
  const created = nowIso();
  return {
    id: uid(),
    title: gs("Adsız Grafik"),
    description: "",
    type: "line",
    data: emptyTable(),
    mapping: defaultMapping(),
    xAxis: emptyAxis("X"),
    yAxis: emptyAxis("Y"),
    settings: defaultSettings(),
    source: "manual",
    figureNumber: "",
    caption: "",
    favorite: false,
    createdAt: created,
    updatedAt: created,
    ...partial,
  };
}

/** Chart types that consume a single numeric column (value/label) rather than paired X/Y series. */
export const SINGLE_SERIES_TYPES: GraphType[] = ["pie", "histogram"];

export const GRAPH_TYPE_LABELS: Record<GraphType, string> = {
  column: "Sütun",
  bar: "Çubuk",
  line: "Çizgi",
  area: "Alan",
  scatter: "Dağılım",
  pie: "Pasta",
  histogram: "Histogram",
  candlestick: "Mum",
};
