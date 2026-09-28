// Reshapes a DataTable + GraphMapping into the row/point structures each chart
// family needs. Kept separate from the React renderer so it can be unit-tested
// and reused by the (later) AI "analyze graph" endpoint.

import { cellToNumber } from "./parse";
import type { DataTable, GraphMapping } from "./types";
import type { XY } from "./stats";

/** Category/series rows for line, area, column and bar charts. */
export interface CategoryData {
  rows: Array<Record<string, number | string>>;
  seriesKeys: string[];
  xIsNumeric: boolean;
}

export function categoryData(table: DataTable, mapping: GraphMapping): CategoryData {
  const seriesKeys = mapping.yColumns.map((c) => table.columns[c] ?? `Y${c}`);
  const xCol = mapping.xColumn;
  let xIsNumeric = true;
  const rows = table.rows.map((r) => {
    const xRaw = r[xCol] ?? "";
    const xNum = cellToNumber(xRaw);
    if (Number.isNaN(xNum)) xIsNumeric = false;
    const row: Record<string, number | string> = { x: xRaw };
    mapping.yColumns.forEach((c, i) => {
      const v = cellToNumber(r[c]);
      row[seriesKeys[i]] = Number.isNaN(v) ? 0 : v;
    });
    return row;
  });
  // Once we know all x are numeric, coerce the axis key so recharts scales it.
  if (xIsNumeric) rows.forEach((row) => (row.x = cellToNumber(row.x as string)));
  return { rows, seriesKeys, xIsNumeric };
}

/** Per-series {x,y} points for scatter charts. */
export function scatterSeries(table: DataTable, mapping: GraphMapping): { label: string; points: XY[] }[] {
  return mapping.yColumns.map((c) => ({
    label: table.columns[c] ?? `Y${c}`,
    points: table.rows
      .map((r) => ({ x: cellToNumber(r[mapping.xColumn]), y: cellToNumber(r[c]) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  }));
}

/** {name,value} slices for pie charts. */
export function pieData(table: DataTable, mapping: GraphMapping): { name: string; value: number }[] {
  return table.rows
    .map((r) => ({ name: r[mapping.labelColumn] ?? "—", value: Math.abs(cellToNumber(r[mapping.valueColumn])) }))
    .filter((d) => Number.isFinite(d.value) && d.value > 0);
}

/** Raw numeric values of the histogram's value column. */
export function histogramValues(table: DataTable, mapping: GraphMapping): number[] {
  const col = mapping.valueColumn >= 0 ? mapping.valueColumn : 0;
  return table.rows.map((r) => cellToNumber(r[col])).filter((n) => Number.isFinite(n));
}

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export function candlestickData(table: DataTable, mapping: GraphMapping): Candle[] {
  const { time, open, high, low, close } = mapping.ohlc;
  return table.rows
    .map((r) => ({
      t: r[time] ?? "",
      o: cellToNumber(r[open]),
      h: cellToNumber(r[high]),
      l: cellToNumber(r[low]),
      c: cellToNumber(r[close]),
    }))
    .filter((d) => [d.o, d.h, d.l, d.c].every(Number.isFinite));
}

/** X-column numeric values (used to draw a regression curve across the domain). */
export function xValues(table: DataTable, mapping: GraphMapping): number[] {
  return table.rows.map((r) => cellToNumber(r[mapping.xColumn])).filter((n) => Number.isFinite(n));
}
