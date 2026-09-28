"use client";

// D3-powered renderer for all 8 Graph Studio chart types. Replaces the previous
// recharts implementation: geometry comes from D3's core tools (d3-scale,
// d3-shape, d3-array — the "graph tools" from d3js.org), rendered to a single
// inline-styled <svg> so the export layer (which clones the <svg> and rasterises
// it from a data-URI, where CSS classes don't apply) keeps working unchanged.
//
// The whole chart lives in one fixed 720xH viewBox and scales responsively via
// preserveAspectRatio, matching the export contract in lib/graph-studio/export.ts
// (it reads svg.viewBox.baseVal for the pixel size).

import { useMemo } from "react";
import {
  scaleLinear,
  scaleBand,
  scalePoint,
  scaleLog,
  line as d3line,
  area as d3area,
  arc as d3arc,
  pie as d3pie,
  stack as d3stack,
  curveLinear,
  curveMonotoneX,
  curveStepAfter,
  type CurveFactory,
  type PieArcDatum,
} from "d3";
import type { AxisConfig, GraphSpec } from "@/lib/graph-studio/types";
import { categoryData, scatterSeries, pieData, histogramValues, candlestickData, xValues } from "@/lib/graph-studio/derive";
import { histogram, fitRegression } from "@/lib/graph-studio/stats";
import { paletteColor } from "./palette";

const W = 720;

const AX = "#64748b"; // tick text
const GRID = "#eef2f7"; // gridlines
const TITLE = "#475569"; // axis titles
const AXIS_LINE = "#cbd5e1"; // axis rules
const LABEL = "#334155"; // data labels

function fmtNumber(n: number, spec: GraphSpec): string {
  const { scientificNotation, decimals } = spec.settings;
  if (!Number.isFinite(n)) return "";
  if (scientificNotation && n !== 0 && (Math.abs(n) >= 1000 || Math.abs(n) < 0.01)) return n.toExponential(decimals ?? 2);
  if (decimals !== null && decimals !== undefined) return n.toFixed(decimals);
  return String(Number(n.toFixed(4)));
}

function axisTitle(label: string, unit: string): string {
  return [label, unit && `(${unit})`].filter(Boolean).join(" ");
}

function curveOf(curve: GraphSpec["settings"]["curve"]): CurveFactory {
  return curve === "monotone" ? curveMonotoneX : curve === "step" ? curveStepAfter : curveLinear;
}

interface Plot {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  w: number;
  h: number;
  legendRight: boolean;
  legendTop: boolean;
  legendBottom: boolean;
}

function plotRect(H: number, spec: GraphSpec): Plot {
  const s = spec.settings;
  const legendRight = s.showLegend && s.legendPosition === "right";
  const legendTop = s.showLegend && s.legendPosition === "top";
  const legendBottom = s.showLegend && s.legendPosition === "bottom";
  const left = 64;
  const right = 20 + (legendRight ? 132 : 0);
  const top = 20 + (legendTop ? 26 : 0);
  const bottom = 48 + (legendBottom ? 26 : 0);
  return {
    x0: left,
    x1: W - right,
    y0: top,
    y1: H - bottom,
    w: W - left - right,
    h: H - top - bottom,
    legendRight,
    legendTop,
    legendBottom,
  };
}

function Empty({ H }: { H: number }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" style={{ width: "100%", height: "auto", display: "block" }}>
      <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#94a3b8">Veri yok</text>
    </svg>
  );
}

type Tick = { pos: number; label: string };

function thin(ticks: Tick[], maxCount = 12): Tick[] {
  if (ticks.length <= maxCount) return ticks;
  const stepN = Math.ceil(ticks.length / maxCount);
  return ticks.filter((_, i) => i % stepN === 0);
}

/** Grid + axis ticks + titles for a Cartesian plot. */
function Axes({
  plot,
  xTicks,
  yTicks,
  xTitle,
  yTitle,
  showGrid,
}: {
  plot: Plot;
  xTicks: Tick[];
  yTicks: Tick[];
  xTitle: string;
  yTitle: string;
  showGrid: boolean;
}) {
  return (
    <g>
      {showGrid &&
        yTicks.map((t, i) => <line key={`gy${i}`} x1={plot.x0} y1={t.pos} x2={plot.x1} y2={t.pos} stroke={GRID} strokeDasharray="3 3" />)}
      {showGrid &&
        xTicks.map((t, i) => <line key={`gx${i}`} x1={t.pos} y1={plot.y0} x2={t.pos} y2={plot.y1} stroke={GRID} strokeDasharray="3 3" />)}

      {/* axis rules */}
      <line x1={plot.x0} y1={plot.y1} x2={plot.x1} y2={plot.y1} stroke={AXIS_LINE} />
      <line x1={plot.x0} y1={plot.y0} x2={plot.x0} y2={plot.y1} stroke={AXIS_LINE} />

      {/* y ticks */}
      {yTicks.map((t, i) => (
        <text key={`ty${i}`} x={plot.x0 - 8} y={t.pos + 3} textAnchor="end" fontSize={11} fill={AX}>
          {t.label}
        </text>
      ))}
      {/* x ticks */}
      {xTicks.map((t, i) => (
        <text key={`tx${i}`} x={t.pos} y={plot.y1 + 16} textAnchor="middle" fontSize={11} fill={AX}>
          {t.label}
        </text>
      ))}

      {/* titles */}
      {xTitle && (
        <text x={(plot.x0 + plot.x1) / 2} y={plot.y1 + 40} textAnchor="middle" fontSize={12} fill={TITLE} fontWeight={600}>
          {xTitle}
        </text>
      )}
      {yTitle && (
        <text transform={`translate(16 ${(plot.y0 + plot.y1) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill={TITLE} fontWeight={600}>
          {yTitle}
        </text>
      )}
    </g>
  );
}

/** Colour-swatch legend, placed per settings.legendPosition. */
function Legend({ plot, H, items }: { plot: Plot; H: number; items: { label: string; color: string }[] }) {
  if (items.length === 0) return null;

  if (plot.legendRight) {
    const x = plot.x1 + 20;
    let y = plot.y0 + 4;
    return (
      <g>
        {items.map((it, i) => {
          const row = (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect x={0} y={-9} width={11} height={11} rx={2} fill={it.color} />
              <text x={16} y={0} fontSize={11} fill={LABEL}>{it.label}</text>
            </g>
          );
          y += 20;
          return row;
        })}
      </g>
    );
  }

  // horizontal (top / bottom): measure roughly and centre
  const gap = 18;
  const widths = items.map((it) => 16 + it.label.length * 6.4);
  const total = widths.reduce((s, w) => s + w, 0) + gap * (items.length - 1);
  let x = Math.max(8, (W - total) / 2);
  const y = plot.legendTop ? 14 : H - 12;
  return (
    <g>
      {items.map((it, i) => {
        const el = (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x={0} y={-9} width={11} height={11} rx={2} fill={it.color} />
            <text x={16} y={0} fontSize={11} fill={LABEL}>{it.label}</text>
          </g>
        );
        x += widths[i] + gap;
        return el;
      })}
    </g>
  );
}

function svgProps(H: number) {
  return {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMidYMid meet" as const,
    role: "img" as const,
    style: { width: "100%", height: "auto", display: "block" },
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  };
}

function buildYScale(values: number[], axis: AxisConfig, plot: Plot, baselineZero: boolean) {
  const finite = values.filter((v) => Number.isFinite(v));
  let lo = axis.min ?? (finite.length ? Math.min(...finite) : 0);
  let hi = axis.max ?? (finite.length ? Math.max(...finite) : 1);
  if (baselineZero && axis.min == null) lo = Math.min(0, lo);
  if (baselineZero && axis.max == null) hi = Math.max(0, hi);
  if (lo === hi) hi = lo + 1;
  if (axis.logScale && lo > 0 && hi > 0) return scaleLog([lo, hi], [plot.y1, plot.y0]);
  return scaleLinear([lo, hi], [plot.y1, plot.y0]).nice();
}

export default function ChartRenderer({ spec, height = 380 }: { spec: GraphSpec; height?: number }) {
  const { type, settings } = spec;
  const H = height;
  const cat = useMemo(() => categoryData(spec.data, spec.mapping), [spec.data, spec.mapping]);

  // ---- Pie / Donut ---------------------------------------------------------
  if (type === "pie") {
    const data = pieData(spec.data, spec.mapping);
    if (data.length === 0) return <Empty H={H} />;
    const plot = plotRect(H, spec);
    const cx = (plot.x0 + plot.x1) / 2;
    const cy = (plot.y0 + plot.y1) / 2;
    const outer = Math.min(plot.w, plot.h) / 2 - 6;
    const inner = settings.donut ? (outer * settings.innerRadius) / 100 : 0;
    const arcs = d3pie<{ name: string; value: number }>().sort(null).value((d) => d.value)(data);
    const arcGen = d3arc<PieArcDatum<{ name: string; value: number }>>().innerRadius(inner).outerRadius(outer);
    const labelArc = d3arc<PieArcDatum<{ name: string; value: number }>>().innerRadius((outer + inner) / 2).outerRadius((outer + inner) / 2);
    const items = data.map((d, i) => ({ label: d.name, color: paletteColor(settings.palette, i) }));
    return (
      <svg {...svgProps(H)}>
        <g transform={`translate(${cx} ${cy})`}>
          {arcs.map((a, i) => (
            <path key={i} d={arcGen(a) ?? undefined} fill={paletteColor(settings.palette, i)} stroke="#fff" strokeWidth={1.5}>
              <title>{`${a.data.name}: ${fmtNumber(a.data.value, spec)}`}</title>
            </path>
          ))}
          {settings.showDataLabels &&
            arcs.map((a, i) => {
              const [lx, ly] = labelArc.centroid(a);
              return (
                <text key={`l${i}`} x={lx} y={ly} textAnchor="middle" fontSize={10} fill={inner > 0 ? LABEL : "#fff"} fontWeight={600}>
                  {fmtNumber(a.data.value, spec)}
                </text>
              );
            })}
        </g>
        {settings.showLegend && <Legend plot={plot} H={H} items={items} />}
      </svg>
    );
  }

  // ---- Histogram -----------------------------------------------------------
  if (type === "histogram") {
    const bins = histogram(histogramValues(spec.data, spec.mapping), settings.bins);
    if (bins.length === 0) return <Empty H={H} />;
    const plot = plotRect(H, spec);
    const xb = scaleBand<number>().domain(bins.map((_, i) => i)).range([plot.x0, plot.x1]).padding(0.08);
    const maxCount = Math.max(...bins.map((b) => b.count), 1);
    const y = scaleLinear([0, maxCount], [plot.y1, plot.y0]).nice();
    const yTicks: Tick[] = y.ticks(6).map((v) => ({ pos: y(v), label: String(v) }));
    const xTicks: Tick[] = thin(bins.map((b, i) => ({ pos: (xb(i) ?? 0) + xb.bandwidth() / 2, label: b.label })), 10);
    const color = paletteColor(settings.palette, 0);
    return (
      <svg {...svgProps(H)}>
        <Axes plot={plot} xTicks={xTicks} yTicks={yTicks} xTitle={axisTitle(spec.xAxis.label, spec.xAxis.unit)} yTitle={axisTitle(spec.yAxis.label || "Frekans", spec.yAxis.unit)} showGrid={settings.showGrid} />
        {bins.map((b, i) => {
          const bx = xb(i) ?? 0;
          const by = y(b.count);
          return (
            <g key={i}>
              <rect x={bx} y={by} width={xb.bandwidth()} height={plot.y1 - by} fill={color} rx={2}>
                <title>{`${b.label}: ${b.count}`}</title>
              </rect>
              {settings.showDataLabels && b.count > 0 && (
                <text x={bx + xb.bandwidth() / 2} y={by - 4} textAnchor="middle" fontSize={10} fill={LABEL}>{b.count}</text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  // ---- Scatter (+ optional regression) -------------------------------------
  if (type === "scatter") {
    const series = scatterSeries(spec.data, spec.mapping);
    const allPts = series.flatMap((s) => s.points);
    if (allPts.length === 0) return <Empty H={H} />;
    const plot = plotRect(H, spec);
    const xs = allPts.map((p) => p.x);
    const ys = allPts.map((p) => p.y);
    const xLo = spec.xAxis.min ?? Math.min(...xs);
    const xHi = spec.xAxis.max ?? Math.max(...xs);
    const x = scaleLinear([xLo === xHi ? xLo - 1 : xLo, xLo === xHi ? xHi + 1 : xHi], [plot.x0, plot.x1]).nice();
    const y = buildYScale(ys, spec.yAxis, plot, false);
    const xTicks: Tick[] = x.ticks(7).map((v) => ({ pos: x(v), label: fmtNumber(v, spec) }));
    const yTicks: Tick[] = y.ticks(6).map((v) => ({ pos: y(v), label: fmtNumber(v, spec) }));

    const fits = settings.regression !== "none"
      ? series.map((s) => fitRegression(s.points, settings.regression, settings.polyDegree))
      : [];
    const dom = xValues(spec.data, spec.mapping);
    const domLo = dom.length ? Math.min(...dom) : xLo;
    const domHi = dom.length ? Math.max(...dom) : xHi;
    const fitPath = (predict: (x: number) => number) => {
      const steps = 60;
      const pts = Array.from({ length: steps + 1 }, (_, k) => {
        const xv = domLo + ((domHi - domLo) * k) / steps;
        return [x(xv), y(predict(xv))] as [number, number];
      }).filter(([, py]) => Number.isFinite(py));
      return d3line()(pts) ?? undefined;
    };

    const items = series.map((s, i) => ({ label: s.label, color: paletteColor(settings.palette, i) }));
    const eqFit = fits.find(Boolean);
    return (
      <svg {...svgProps(H)}>
        <Axes plot={plot} xTicks={xTicks} yTicks={yTicks} xTitle={axisTitle(spec.xAxis.label, spec.xAxis.unit)} yTitle={axisTitle(spec.yAxis.label, spec.yAxis.unit)} showGrid={settings.showGrid} />
        {series.map((s, i) => {
          const color = paletteColor(settings.palette, i);
          return (
            <g key={s.label}>
              {s.points.map((p, k) => (
                <circle key={k} cx={x(p.x)} cy={y(p.y)} r={settings.pointSize} fill={color} fillOpacity={0.85}>
                  <title>{`${fmtNumber(p.x, spec)}, ${fmtNumber(p.y, spec)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {fits.map((fit, i) =>
          fit ? <path key={`fit${i}`} d={fitPath(fit.predict)} fill="none" stroke={paletteColor(settings.palette, i)} strokeWidth={2} strokeDasharray="6 4" /> : null
        )}
        {settings.showEquation && eqFit && (
          <text x={plot.x0 + 8} y={plot.y0 + 14} fontSize={11} fill={TITLE}>
            {eqFit.equation}  (R² = {eqFit.r2.toFixed(4)})
          </text>
        )}
        {settings.showLegend && series.length > 1 && <Legend plot={plot} H={H} items={items} />}
      </svg>
    );
  }

  // ---- Candlestick (OHLC) --------------------------------------------------
  if (type === "candlestick") {
    const data = candlestickData(spec.data, spec.mapping);
    if (data.length === 0) return <Empty H={H} />;
    const plot = plotRect(H, spec);
    const xb = scaleBand<number>().domain(data.map((_, i) => i)).range([plot.x0, plot.x1]).padding(0.3);
    const lo = Math.min(...data.map((d) => d.l));
    const hi = Math.max(...data.map((d) => d.h));
    const y = scaleLinear([lo, hi], [plot.y1, plot.y0]).nice();
    const yTicks: Tick[] = y.ticks(6).map((v) => ({ pos: y(v), label: fmtNumber(v, spec) }));
    const xTicks: Tick[] = thin(data.map((d, i) => ({ pos: (xb(i) ?? 0) + xb.bandwidth() / 2, label: d.t })), 12);
    const up = "#10B981";
    const down = "#EF4444";
    return (
      <svg {...svgProps(H)}>
        <Axes plot={plot} xTicks={xTicks} yTicks={yTicks} xTitle={axisTitle(spec.xAxis.label, spec.xAxis.unit)} yTitle={axisTitle(spec.yAxis.label, spec.yAxis.unit)} showGrid={settings.showGrid} />
        {data.map((d, i) => {
          const cx = (xb(i) ?? 0) + xb.bandwidth() / 2;
          const rising = d.c >= d.o;
          const color = rising ? up : down;
          const yO = y(d.o);
          const yC = y(d.c);
          const top = Math.min(yO, yC);
          const bodyH = Math.max(1, Math.abs(yC - yO));
          return (
            <g key={i}>
              <line x1={cx} y1={y(d.h)} x2={cx} y2={y(d.l)} stroke={color} strokeWidth={1.5} />
              <rect x={cx - xb.bandwidth() / 2} y={top} width={xb.bandwidth()} height={bodyH} fill={color}>
                <title>{`${d.t}  A:${d.o} Y:${d.h} D:${d.l} K:${d.c}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    );
  }

  // ---- Column / Bar / Line / Area (shared category data) -------------------
  if (cat.rows.length === 0 || cat.seriesKeys.length === 0) return <Empty H={H} />;
  const plot = plotRect(H, spec);
  const keys = cat.seriesKeys;
  const items = keys.map((k, i) => ({ label: k, color: paletteColor(settings.palette, i) }));
  const rowVals = (r: Record<string, number | string>) => keys.map((k) => Number(r[k]) || 0);

  // ----- Line & Area --------------------------------------------------------
  if (type === "line" || type === "area") {
    const numeric = cat.xIsNumeric;
    const xNums = cat.rows.map((r) => Number(r.x));
    const xLin = numeric
      ? scaleLinear([spec.xAxis.min ?? Math.min(...xNums), spec.xAxis.max ?? Math.max(...xNums)], [plot.x0, plot.x1]).nice()
      : null;
    const xPoint = numeric ? null : scalePoint<number>().domain(cat.rows.map((_, i) => i)).range([plot.x0, plot.x1]).padding(0.5);
    const px = (i: number) => (numeric ? xLin!(xNums[i]) : xPoint!(i) ?? 0);

    const stacked = type === "area" && settings.stacked;
    let y: ReturnType<typeof buildYScale>;
    let stackLayers: ReturnType<ReturnType<typeof d3stack<Record<string, number>>>> | null = null;
    if (stacked) {
      stackLayers = d3stack<Record<string, number>>().keys(keys)(cat.rows as unknown as Record<string, number>[]);
      const totals = cat.rows.map((r) => rowVals(r).reduce((s, v) => s + Math.max(0, v), 0));
      y = buildYScale([0, ...totals], spec.yAxis, plot, true);
    } else {
      const allV = cat.rows.flatMap(rowVals);
      y = buildYScale(allV, spec.yAxis, plot, type === "area");
    }
    const yTicks: Tick[] = y.ticks(6).map((v) => ({ pos: y(v), label: fmtNumber(v, spec) }));
    const xTicks: Tick[] = numeric
      ? xLin!.ticks(7).map((v) => ({ pos: xLin!(v), label: fmtNumber(v, spec) }))
      : thin(cat.rows.map((r, i) => ({ pos: px(i), label: String(r.x) })));

    const curve = curveOf(settings.curve);

    return (
      <svg {...svgProps(H)}>
        <Axes plot={plot} xTicks={xTicks} yTicks={yTicks} xTitle={axisTitle(spec.xAxis.label, spec.xAxis.unit)} yTitle={axisTitle(spec.yAxis.label, spec.yAxis.unit)} showGrid={settings.showGrid} />
        {type === "area" && stacked && stackLayers
          ? stackLayers.map((layer, si) => {
              const gen = d3area<[number, number]>()
                .x((_, i) => px(i))
                .y0((d) => y(d[0]))
                .y1((d) => y(d[1]))
                .curve(curve);
              const color = paletteColor(settings.palette, si);
              return <path key={si} d={gen(layer as unknown as [number, number][]) ?? undefined} fill={color} fillOpacity={settings.fillOpacity} stroke={color} strokeWidth={settings.lineWidth} />;
            })
          : keys.map((k, si) => {
              const color = paletteColor(settings.palette, si);
              const values = cat.rows.map((r) => Number(r[k]) || 0);
              if (type === "area") {
                const gen = d3area<number>().x((_, i) => px(i)).y0(y(Math.max(0, y.domain()[0]))).y1((d) => y(d)).curve(curve);
                return <path key={k} d={gen(values) ?? undefined} fill={color} fillOpacity={settings.fillOpacity} stroke={color} strokeWidth={settings.lineWidth} />;
              }
              const gen = d3line<number>().x((_, i) => px(i)).y((d) => y(d)).curve(curve);
              return (
                <g key={k}>
                  <path d={gen(values) ?? undefined} fill="none" stroke={color} strokeWidth={settings.lineWidth} />
                  {settings.showPoints && values.map((v, i) => <circle key={i} cx={px(i)} cy={y(v)} r={settings.pointSize / 2 + 1} fill={color} />)}
                  {settings.showDataLabels && values.map((v, i) => <text key={`d${i}`} x={px(i)} y={y(v) - 6} textAnchor="middle" fontSize={10} fill={LABEL}>{fmtNumber(v, spec)}</text>)}
                </g>
              );
            })}
        {settings.showLegend && <Legend plot={plot} H={H} items={items} />}
      </svg>
    );
  }

  // ----- Column (vertical) & Bar (horizontal) -------------------------------
  const horizontal = type === "bar";
  const stacked = settings.stacked && keys.length > 1;

  // category band along the category axis
  const band = scaleBand<number>().domain(cat.rows.map((_, i) => i)).range(horizontal ? [plot.y0, plot.y1] : [plot.x0, plot.x1]).padding(0.2);
  const inner = stacked ? null : scaleBand<string>().domain(keys).range([0, band.bandwidth()]).padding(0.08);

  // value scale
  let valueScale: ReturnType<typeof scaleLinear<number, number>>;
  let layers: ReturnType<ReturnType<typeof d3stack<Record<string, number>>>> | null = null;
  if (stacked) {
    layers = d3stack<Record<string, number>>().keys(keys)(cat.rows as unknown as Record<string, number>[]);
    const totals = cat.rows.map((r) => rowVals(r).reduce((s, v) => s + Math.max(0, v), 0));
    const hi = Math.max(spec.yAxis.max ?? 0, ...totals, 0);
    valueScale = scaleLinear([0, hi || 1], horizontal ? [plot.x0, plot.x1] : [plot.y1, plot.y0]).nice();
  } else {
    const allV = cat.rows.flatMap(rowVals);
    const lo = Math.min(0, spec.yAxis.min ?? Math.min(...allV, 0));
    const hi = Math.max(spec.yAxis.max ?? 0, ...allV, 0);
    valueScale = scaleLinear([lo, hi || 1], horizontal ? [plot.x0, plot.x1] : [plot.y1, plot.y0]).nice();
  }

  const valTicks = valueScale.ticks(6).map((v) => ({ v, label: fmtNumber(v, spec) }));
  const catTicks: Tick[] = thin(cat.rows.map((r, i) => ({ pos: (band(i) ?? 0) + band.bandwidth() / 2, label: String(r.x) })));
  const xTicks = horizontal ? valTicks.map((t) => ({ pos: valueScale(t.v), label: t.label })) : catTicks;
  const yTicks = horizontal ? catTicks : valTicks.map((t) => ({ pos: valueScale(t.v), label: t.label }));
  const base = valueScale(0);

  return (
    <svg {...svgProps(H)}>
      <Axes plot={plot} xTicks={xTicks} yTicks={yTicks} xTitle={axisTitle(spec.xAxis.label, spec.xAxis.unit)} yTitle={axisTitle(spec.yAxis.label, spec.yAxis.unit)} showGrid={settings.showGrid} />
      {stacked && layers
        ? layers.map((layer, si) => {
            const color = paletteColor(settings.palette, si);
            return (
              <g key={si}>
                {layer.map((seg, i) => {
                  const bpos = band(i) ?? 0;
                  if (horizontal) {
                    const xA = valueScale(seg[0]);
                    const xB = valueScale(seg[1]);
                    return <rect key={i} x={Math.min(xA, xB)} y={bpos} width={Math.abs(xB - xA)} height={band.bandwidth()} fill={color} />;
                  }
                  const yA = valueScale(seg[0]);
                  const yB = valueScale(seg[1]);
                  return <rect key={i} x={bpos} y={Math.min(yA, yB)} width={band.bandwidth()} height={Math.abs(yB - yA)} fill={color} />;
                })}
              </g>
            );
          })
        : keys.map((k, si) => {
            const color = paletteColor(settings.palette, si);
            const off = inner!(k) ?? 0;
            return (
              <g key={k}>
                {cat.rows.map((r, i) => {
                  const v = Number(r[k]) || 0;
                  const bpos = (band(i) ?? 0) + off;
                  if (horizontal) {
                    const xv = valueScale(v);
                    const x0 = Math.min(base, xv);
                    return (
                      <g key={i}>
                        <rect x={x0} y={bpos} width={Math.abs(xv - base)} height={inner!.bandwidth()} fill={color} rx={2}>
                          <title>{`${r.x} · ${k}: ${fmtNumber(v, spec)}`}</title>
                        </rect>
                        {settings.showDataLabels && <text x={Math.max(base, xv) + 4} y={bpos + inner!.bandwidth() / 2 + 3} fontSize={10} fill={LABEL}>{fmtNumber(v, spec)}</text>}
                      </g>
                    );
                  }
                  const yv = valueScale(v);
                  const y0 = Math.min(base, yv);
                  return (
                    <g key={i}>
                      <rect x={bpos} y={y0} width={inner!.bandwidth()} height={Math.abs(yv - base)} fill={color} rx={2}>
                        <title>{`${r.x} · ${k}: ${fmtNumber(v, spec)}`}</title>
                      </rect>
                      {settings.showDataLabels && <text x={bpos + inner!.bandwidth() / 2} y={Math.min(base, yv) - 4} textAnchor="middle" fontSize={10} fill={LABEL}>{fmtNumber(v, spec)}</text>}
                    </g>
                  );
                })}
              </g>
            );
          })}
      {settings.showLegend && keys.length > 1 && <Legend plot={plot} H={H} items={items} />}
    </svg>
  );
}
