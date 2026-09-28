"use client";

// Chem+ app: the engine's results as cards, above Iris's answer - and the cards of what Iris did
// in the app's modules (a timer, a note, a protocol, a bottle, a report, a graph: AgentCards.tsx).
//
// The answer is the AI's prose; the card is the proof. Every card says where its numbers came
// from (RDKit, the calculation engine, or the app's reference tables), shows the checks the tool
// ran on itself, and draws what a table would bury: the composition as a bar, the molecule as a
// structure, the pH on its scale, the titration as a curve, the calibration as a line.

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Atom,
  BadgeCheck,
  Beaker,
  Calculator,
  ChartLine,
  ChartScatter,
  Database,
  Droplets,
  ExternalLink,
  FlaskConical,
  Gauge,
  Hexagon,
  ClipboardList,
  NotebookPen,
  Orbit,
  Package,
  Shapes,
  StickyNote,
  Timer,
  Scale,
  ShieldAlert,
  Sigma,
  Thermometer,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { ToolOutcome, ToolResult, ToolName } from "@/lib/chem-engine/tools";
import { fixed, fmt, type Language } from "@/lib/chem-engine/format";
import { Pictogram, PICTOGRAM_LABELS } from "@/lib/safety/pictograms";
import { hazardText, precautionText } from "@/lib/safety/statements";
import { INCOMPATIBILITY_LABELS, FIRST_AID, STORAGE } from "@/lib/safety/chemicals";
import { INK_COLORS, type InkColor } from "@/mobile/ui/ink";
import { useL, useLocale } from "@/mobile/i18n";
import { openExternal } from "@/mobile/native";
import { GraphCardBody, InventoryCardBody, NoteCardBody, ProtocolCardBody, ReportCardBody, TimerCardBody } from "./AgentCards";
import type { PointGroup } from "@/lib/chem-engine/complexes";
import Molecule3D from "./Molecule3D";

const TOOL_STYLE: Record<ToolName, { color: InkColor; icon: LucideIcon }> = {
  molar_mass: { color: "orange", icon: Scale },
  molecule: { color: "green", icon: Hexagon },
  complex: { color: "purple", icon: Orbit },
  vsepr: { color: "teal", icon: Shapes },
  balance: { color: "blue", icon: Atom },
  stoichiometry: { color: "purple", icon: Beaker },
  ph: { color: "pink", icon: Gauge },
  titration: { color: "teal", icon: ChartLine },
  solution_prep: { color: "yellow", icon: FlaskConical },
  dilution: { color: "cyan", icon: Droplets },
  gas: { color: "indigo", icon: Thermometer },
  evaluate: { color: "lime", icon: Calculator },
  solve: { color: "lime", icon: Sigma },
  convert: { color: "brown", icon: Calculator },
  regression: { color: "teal", icon: ChartScatter },
  stats: { color: "indigo", icon: Sigma },
  spectra: { color: "lime", icon: Waves },
  safety: { color: "red", icon: ShieldAlert },
  pubchem: { color: "blue", icon: Database },
  timer: { color: "yellow", icon: Timer },
  note: { color: "yellow", icon: StickyNote },
  protocol: { color: "orange", icon: ClipboardList },
  inventory_add: { color: "teal", icon: Package },
  lab_report: { color: "purple", icon: NotebookPen },
  graph: { color: "blue", icon: ChartLine },
};

const ACTION_TOOLS = new Set<string>(["timer", "note", "protocol", "inventory_add", "lab_report", "graph"]);

/** Segment colours for composition bars and species fractions. */
const SERIES: InkColor[] = ["orange", "blue", "green", "pink", "yellow", "purple", "teal", "red", "cyan", "lime"];

function useLang(): Language {
  return useLocale().startsWith("en") ? "en" : "tr";
}

export function ToolCards({ outcomes }: { outcomes: ToolOutcome[] }) {
  if (outcomes.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {outcomes.map((outcome, index) => (
        <ToolCard key={index} outcome={outcome} index={index} />
      ))}
    </div>
  );
}

function ToolCard({ outcome, index }: { outcome: ToolOutcome; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index, 5) * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      {outcome.ok ? <ResultCard result={outcome} /> : <FailureCard tool={outcome.tool} error={outcome.error} />}
    </motion.div>
  );
}

function FailureCard({ tool, error }: { tool: string; error: string }) {
  const l = useL();
  return (
    <div className="flex items-start gap-2.5 rounded-[16px] border-[2.5px] border-[#111] bg-[#FDEAE7] px-3 py-2.5 shadow-[3px_3px_0_#111]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#D7263D]" strokeWidth={2.8} />
      <div className="min-w-0">
        <p className="text-[12.5px] font-extrabold text-[#111]">
          {ACTION_TOOLS.has(tool) ? l("Yapılamadı", "Couldn't do it") : l("Hesaplanamadı", "Couldn't compute")} · <span className="font-mono text-[11.5px]">{tool}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-[#111]/70">{error}</p>
      </div>
    </div>
  );
}

function SourceBadge({ result }: { result: ToolResult }) {
  const l = useL();
  const source = result.source;
  const label =
    source === "rdkit"
      ? "RDKit"
      : source === "database"
        ? result.tool === "pubchem" && result.data.provider === "cactus"
          ? "NCI CACTUS"
          : "PubChem"
        : source === "reference"
          ? l("Referans", "Reference")
          : source === "app"
            ? l("Yapıldı", "Done")
            : result.tool === "complex" || result.tool === "vsepr"
              ? l("Yapı motoru", "Structure engine")
              : l("Hesap motoru", "Engine");
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border-2 border-[#111] bg-white px-2 py-0.5 text-[10.5px] font-extrabold text-[#111]">
      <BadgeCheck className="size-3" strokeWidth={3} />
      {label}
    </span>
  );
}

function ResultCard({ result }: { result: ToolResult }) {
  const style = TOOL_STYLE[result.tool];
  const palette = INK_COLORS[style.color];
  const Icon = style.icon;
  return (
    <div className="overflow-hidden rounded-[16px] border-[2.5px] border-[#111] bg-white shadow-[3px_3px_0_#111]">
      <div className="flex items-center gap-2 border-b-[2.5px] border-[#111] px-2.5 py-2" style={{ background: palette.fill }}>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[#111] bg-white text-[#111]">
          <Icon className="size-4" strokeWidth={2.6} />
        </span>
        <span className="min-w-0 truncate text-[13px] font-extrabold tracking-tight" style={{ color: palette.ink }}>
          {result.title}
        </span>
        <SourceBadge result={result} />
      </div>
      <div className="px-3 py-3 text-[#111]">
        <Body result={result} />
      </div>
      {(result.checks.length > 0 || result.notes.length > 0) && (
        <div className="space-y-1 border-t-2 border-dashed border-[#111]/20 bg-[#FBF7F1] px-3 py-2">
          {result.checks.map((check) => (
            <p key={check} className="flex items-start gap-1.5 text-[11.5px] font-bold leading-snug text-[#1E7B34]">
              <BadgeCheck className="mt-px size-3.5 shrink-0" strokeWidth={2.8} />
              {check}
            </p>
          ))}
          {result.notes.map((note) => (
            <p key={note} className="flex items-start gap-1.5 text-[11.5px] font-bold leading-snug text-[#8A5A00]">
              <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={2.8} />
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Big({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-[24px] font-extrabold leading-tight tracking-tight text-[#111]">{children}</p>
      {sub && <p className="mt-0.5 text-[12.5px] font-bold text-[#111]/55">{sub}</p>}
    </div>
  );
}

function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
      {rows.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="font-bold text-[#111]/55">{label}</dt>
          <dd className="min-w-0 break-words font-extrabold text-[#111]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2 text-[12.5px] font-semibold leading-snug text-[#111]/85">
          <span className="grid size-5 shrink-0 place-items-center rounded-md border-2 border-[#111] bg-white text-[10.5px] font-extrabold">
            {i + 1}
          </span>
          <span className="min-w-0">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-[11.5px] font-bold">{children}</span>;
}

function Body({ result }: { result: ToolResult }) {
  const l = useL();
  const lang = useLang();
  const n = (value: number, sig = 4) => fmt(value, lang, sig);

  switch (result.tool) {
    case "timer":
      return <TimerCardBody data={result.data} />;
    case "note":
      return <NoteCardBody data={result.data} />;
    case "protocol":
      return <ProtocolCardBody data={result.data} />;
    case "inventory_add":
      return <InventoryCardBody data={result.data} />;
    case "lab_report":
      return <ReportCardBody data={result.data} />;
    case "graph":
      return <GraphCardBody data={result.data} />;
    case "molar_mass": {
      const d = result.data;
      return (
        <>
          <Big sub={d.pretty}>{`${n(d.molarMass, 6)} g/mol`}</Big>
          {d.exactMass !== null && (
            <p className="mt-1 text-[12px] font-bold text-[#111]/55">
              {l("Monoizotopik kütle", "Monoisotopic mass")}: {n(d.exactMass, 8)} u
            </p>
          )}
          <CompositionBar rows={d.rows.map((row) => ({ label: row.symbol, percent: row.percent }))} />
          <table className="mt-2.5 w-full text-[12px]">
            <tbody>
              {d.rows.map((row, i) => (
                <tr key={row.symbol} className="border-t border-[#111]/10">
                  <td className="py-1 pr-2">
                    <span className="inline-block size-2.5 rounded-sm border border-[#111]" style={{ background: INK_COLORS[SERIES[i % SERIES.length]].fill }} />
                  </td>
                  <td className="py-1 pr-2 font-extrabold">{row.symbol}</td>
                  <td className="py-1 pr-2 font-semibold text-[#111]/60">{row.name}</td>
                  <td className="py-1 pr-2 text-right font-bold">×{n(row.count, 4)}</td>
                  <td className="py-1 text-right font-extrabold">%{fixed(row.percent, 2, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    }
    case "molecule": {
      const d = result.data;
      return (
        <>
          <MoleculeViews svg={d.svg} model={d.model} />
          <Rows
            rows={[
              ...(d.name ? ([[l("Ad", "Name"), d.name]] as [ReactNode, ReactNode][]) : []),
              [l("Formül", "Formula"), d.formula],
              ...(d.hybridisation.length
                ? ([[l("Hibritleşme", "Hybridisation"), d.hybridisation.map((h) => `${h.label} ×${h.count}`).join(" · ")]] as [ReactNode, ReactNode][])
                : []),
              [l("Mol kütlesi", "Molar mass"), `${n(d.averageMass, 6)} g/mol`],
              [l("Tam kütle", "Exact mass"), `${n(d.exactMass, 8)} u`],
              ["SMILES", <Mono key="s">{d.canonicalSmiles}</Mono>],
              ...(d.inchiKey ? ([["InChIKey", <Mono key="k">{d.inchiKey}</Mono>]] as [ReactNode, ReactNode][]) : []),
            ]}
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {[
              [`HBD ${d.hbd}`],
              [`HBA ${d.hba}`],
              [`cLogP ${n(d.logP, 3)}`],
              [`TPSA ${n(d.tpsa, 3)} Å²`],
              [l(`Dönebilir bağ ${d.rotatableBonds}`, `Rotatable ${d.rotatableBonds}`)],
              [l(`Halka ${d.rings}`, `Rings ${d.rings}`)],
              ...(d.stereocenters ? [[l(`Stereomerkez ${d.stereocenters}`, `Stereocentres ${d.stereocenters}`)]] : []),
            ].map(([label]) => (
              <span key={label} className="rounded-full border-2 border-[#111] bg-white px-2 py-0.5 text-[11px] font-extrabold">
                {label}
              </span>
            ))}
            <span
              className="rounded-full border-2 border-[#111] px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: d.lipinskiViolations <= 1 ? INK_COLORS.green.fill : INK_COLORS.yellow.fill }}
            >
              Lipinski {d.lipinskiViolations === 0 ? "✓" : `${d.lipinskiViolations} ${l("ihlal", "violations")}`}
            </span>
          </div>
        </>
      );
    }
    case "complex":
      return <ComplexBody result={result} />;
    case "vsepr":
      return <VseprBody result={result} />;
    case "balance": {
      const d = result.data;
      const all = [...d.reactants, ...d.products];
      return (
        <>
          <p className="text-[17px] font-extrabold leading-relaxed tracking-tight">
            {all.map((species, i) => (
              <span key={i}>
                {i === d.reactants.length ? <span className="mx-1.5 text-[#111]/60">→</span> : i > 0 ? <span className="mx-1 text-[#111]/45">+</span> : null}
                {d.coefficients[i] !== 1 && (
                  <span className="mr-0.5 rounded-md border-2 border-[#111] px-1 text-[14px]" style={{ background: INK_COLORS.yellow.fill }}>
                    {d.coefficients[i]}
                  </span>
                )}
                {species.pretty}
              </span>
            ))}
          </p>
          <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
            {d.check.map((row) => (
              <span key={row.symbol} className="flex items-center justify-between rounded-lg border-2 border-[#111]/15 bg-[#FBF7F1] px-2 py-1 text-[11.5px] font-extrabold">
                <span>{row.symbol === "yük" ? l("yük", "charge") : row.symbol}</span>
                <span className={row.left === row.right ? "text-[#1E7B34]" : "text-[#D7263D]"}>
                  {row.left} = {row.right}
                </span>
              </span>
            ))}
          </div>
        </>
      );
    }
    case "stoichiometry": {
      const d = result.data;
      return (
        <>
          <p className="text-[14px] font-extrabold">{d.equation.text}</p>
          <div className="mt-2.5 space-y-1.5">
            {d.reactants.map((r) => (
              <div key={r.pretty} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border-2 border-[#111]/15 px-2.5 py-1.5 text-[12px]">
                <span className="font-extrabold">{r.pretty}</span>
                {r.given ? (
                  <span className="font-semibold text-[#111]/65">
                    {n(r.given.amount)} {r.given.unit} = {n(r.given.moles)} mol
                  </span>
                ) : (
                  <span className="font-semibold text-[#111]/55">
                    {l("gereken", "needed")} {n(r.used ?? 0)} mol
                  </span>
                )}
                {r.limiting && (
                  <span className="ml-auto rounded-full border-2 border-[#111] px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: INK_COLORS.red.fill }}>
                    {l("Sınırlayıcı", "Limiting")}
                  </span>
                )}
                {!r.limiting && r.leftMoles !== undefined && (
                  <span className="ml-auto text-[11px] font-bold text-[#111]/55">
                    {l("artan", "left")} {n(r.leftMoles)} mol ({n(r.leftMass ?? 0)} g)
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#111]/50">{l("Teorik verim", "Theoretical yield")}</p>
          <div className="mt-1 space-y-1">
            {d.products.map((p) => (
              <p key={p.pretty} className="flex justify-between text-[13px]">
                <span className="font-extrabold">{p.pretty}</span>
                <span className="font-extrabold">
                  {n(p.mass)} g <span className="font-semibold text-[#111]/55">({n(p.moles)} mol)</span>
                </span>
              </p>
            ))}
          </div>
          {d.percentYield && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-[#111] px-3 py-2" style={{ background: INK_COLORS.purple.soft }}>
              <span className="text-[22px] font-extrabold">%{fixed(d.percentYield.percent, 1, lang)}</span>
              <span className="text-[12px] font-bold text-[#111]/65">
                {l("verim", "yield")} · {n(d.percentYield.actualMass)} g / {n(d.percentYield.theoreticalMass)} g {d.percentYield.species}
              </span>
            </div>
          )}
        </>
      );
    }
    case "ph": {
      const d = result.data;
      return (
        <>
          <Big sub={`pOH ${fixed(d.pOH, 2, lang)} · [H⁺] ${n(d.h, 3)} M · [OH⁻] ${n(d.oh, 3)} M`}>pH {fixed(d.pH, 2, lang)}</Big>
          <PhScale value={d.pH} />
          {d.approximation && (
            <p className="mt-2 text-[12px] font-semibold text-[#111]/65">
              {l("Ders kitabı yaklaşımı", "Textbook shortcut")} ({d.approximation.method}): pH ≈ {fixed(d.approximation.pH, 2, lang)} ·{" "}
              {l("tam çözüm", "exact")}: {fixed(d.pH, 2, lang)}
            </p>
          )}
          {d.species.map((system) => (
            <div key={system.system} className="mt-2.5">
              <CompositionBar rows={system.labels.map((label, i) => ({ label, percent: system.fractions[i] * 100 }))} />
              <p className="mt-1 text-[11px] font-bold text-[#111]/55">
                {system.labels.map((label, i) => `${label} %${fixed(system.fractions[i] * 100, 1, lang)}`).join(" · ")}
              </p>
            </div>
          ))}
        </>
      );
    }
    case "titration":
      return <TitrationBody result={result} />;
    case "solution_prep": {
      const d = result.data;
      const headline =
        d.weighMass !== undefined
          ? l(`Tart: ${n(d.weighMass)} g ${d.pretty}`, `Weigh ${n(d.weighMass)} g ${d.pretty}`)
          : l(`Ölç: ${n(d.stockVolume_mL ?? 0)} mL stok`, `Measure ${n(d.stockVolume_mL ?? 0)} mL of stock`);
      return (
        <>
          <Big sub={`${n(d.concentration)} M · ${n(d.volume)} mL · n = ${n(d.moles)} mol${d.molarMass ? ` · M = ${n(d.molarMass, 6)} g/mol` : ""}`}>{headline}</Big>
          <Steps steps={d.steps} />
        </>
      );
    }
    case "dilution": {
      const d = result.data;
      const unit = d.solvedFor.startsWith("V") ? d.volumeUnit : d.concentrationUnit;
      return (
        <>
          <Big sub={`C₁ ${n(d.C1)} ${d.concentrationUnit} · V₁ ${n(d.V1)} ${d.volumeUnit} → C₂ ${n(d.C2)} ${d.concentrationUnit} · V₂ ${n(d.V2)} ${d.volumeUnit}`}>
            {d.solvedFor.replace("1", "₁").replace("2", "₂")} = {n(d.value)} {unit}
          </Big>
          <Steps steps={d.steps} />
        </>
      );
    }
    case "gas": {
      const d = result.data;
      return (
        <>
          <Big>
            {d.solvedFor} = {n(d.value)} {d.unit}
          </Big>
          <Rows
            rows={(["P", "V", "n", "T"] as const).map((k) => [k, `${n(d.values[k])} ${d.units[k]}${k === d.solvedFor ? " ←" : ""}`])}
          />
        </>
      );
    }
    case "evaluate": {
      const d = result.data;
      return (
        <>
          <Big>
            {d.label} = {n(d.value, 5)} {d.unit}
          </Big>
          <p className="mt-1.5 rounded-lg bg-[#FBF7F1] px-2 py-1.5">
            <Mono>{d.expression}</Mono>
          </p>
          {Object.keys(d.variables).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(d.variables).map(([k, v]) => (
                <span key={k} className="rounded-full border-2 border-[#111]/20 px-2 py-0.5 text-[11px] font-extrabold">
                  {k} = {n(v, 5)}
                </span>
              ))}
            </div>
          )}
          {d.constants.length > 0 && <p className="mt-1.5 text-[11px] font-bold text-[#111]/50">{d.constants.join(" · ")}</p>}
        </>
      );
    }
    case "solve": {
      const d = result.data;
      return (
        <>
          <Big>{d.roots.map((root) => `${d.variable} = ${n(root, 5)}${d.unit ? ` ${d.unit}` : ""}`).join("  ·  ")}</Big>
          <p className="mt-1.5 rounded-lg bg-[#FBF7F1] px-2 py-1.5">
            <Mono>{d.equation}</Mono>
          </p>
        </>
      );
    }
    case "convert": {
      const d = result.data;
      return (
        <Big>
          {n(d.value)} {d.from} = {n(d.result, 6)} {d.to}
        </Big>
      );
    }
    case "regression":
      return <RegressionBody result={result} />;
    case "stats": {
      const d = result.data;
      return (
        <>
          <Big sub={`n = ${d.description.n} · s = ${n(d.description.sd)} · RSD %${fixed(d.description.rsd, 2, lang)}`}>
            x̄ = {n(d.description.mean, 5)} ± {n(d.ci95, 3)}
          </Big>
          <p className="mt-1 text-[11.5px] font-bold text-[#111]/55">{l("%95 güven aralığı", "95 % confidence interval")}</p>
          {[d.grubbs, d.q].map((test, i) =>
            test && !test.unavailable ? (
              <p key={i} className="mt-1.5 text-[12px] font-semibold">
                <span className="font-extrabold">{i === 0 ? "Grubbs" : "Dixon Q"}</span>: {n(test.suspect)} →{" "}
                <span className={test.rejected ? "font-extrabold text-[#D7263D]" : "font-extrabold text-[#1E7B34]"}>
                  {test.rejected ? l("aykırı", "outlier") : l("aykırı değil", "keep")}
                </span>{" "}
                ({n(test.statistic, 3)} / {n(test.critical, 3)})
              </p>
            ) : null
          )}
        </>
      );
    }
    case "spectra": {
      const d = result.data;
      const unit = d.technique === "ir" ? "cm⁻¹" : d.technique === "ms" ? "m/z" : "ppm";
      return (
        <div className="space-y-2">
          {d.matches.map((m) => (
            <div key={m.value}>
              <p className="text-[13px] font-extrabold">
                {m.value} {unit}
              </p>
              {m.bands.length === 0 ? (
                <p className="text-[12px] font-semibold text-[#111]/55">{l("Tabloda eşleşme yok.", "No match in the table.")}</p>
              ) : (
                m.bands.map((b, i) => (
                  <p key={i} className="text-[12px] font-semibold leading-snug">
                    <span className="font-extrabold">{b.assignment}</span> · {b.group} <span className="text-[#111]/50">({b.range})</span>
                  </p>
                ))
              )}
            </div>
          ))}
          {d.losses && (
            <p className="text-[12px] font-semibold">
              Δm {d.losses.difference}: {d.losses.matches.join(" · ") || l("eşleşme yok", "no match")}
            </p>
          )}
        </div>
      );
    }
    case "safety":
      return <SafetyBody result={result} />;
    case "pubchem":
      return <PubChemBody result={result} />;
  }
}

function PubChemBody({ result }: { result: Extract<ToolResult, { tool: "pubchem" }> }) {
  const l = useL();
  const lang = useLang();
  const d = result.data;
  const pick = (pair: { tr: string; en: string }) => (lang === "en" ? pair.en : pair.tr);
  return (
    <>
      <p className="text-[18px] font-extrabold leading-tight tracking-tight">{d.title}</p>
      {d.iupacName && <p className="mt-0.5 text-[12px] font-bold leading-snug text-[#111]/55">{d.iupacName}</p>}
      {d.svg && (
        <div
          className="mx-auto mt-2.5 flex max-w-[340px] items-center justify-center rounded-xl border-2 border-[#111]/15 bg-white [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: d.svg }}
        />
      )}
      <Rows
        rows={[
          [l("Formül", "Formula"), d.formula],
          [l("Mol kütlesi", "Molar mass"), `${fmt(d.molecularWeight, lang, 6)} g/mol`],
          [l("Tam kütle", "Exact mass"), `${fmt(d.exactMass, lang, 8)} u`],
          ...(d.cas ? ([["CAS", d.cas]] as [ReactNode, ReactNode][]) : []),
          ["SMILES", <Mono key="s">{d.smiles}</Mono>],
          ["InChIKey", <Mono key="k">{d.inchiKey}</Mono>],
          ...(d.xlogp !== null ? ([["XLogP", fmt(d.xlogp, lang, 3)]] as [ReactNode, ReactNode][]) : []),
        ]}
      />
      {d.ghs && (
        <div className="mt-3 rounded-xl border-2 border-[#111] px-2.5 py-2" style={{ background: INK_COLORS.red.soft }}>
          <div className="flex flex-wrap items-center gap-1.5">
            {d.ghs.signal && (
              <span className="rounded-md border-2 border-[#111] bg-white px-1.5 py-0.5 text-[11px] font-extrabold uppercase">
                {d.ghs.signal === "Danger" ? l("Tehlike", "Danger") : d.ghs.signal === "Warning" ? l("Dikkat", "Warning") : d.ghs.signal}
              </span>
            )}
            {d.ghs.pictograms.map((id) => (
              <span key={id} title={pick(PICTOGRAM_LABELS[id])}>
                <Pictogram id={id} size={38} />
              </span>
            ))}
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {d.ghs.hazards.slice(0, 6).map((hazard) => (
              <li key={hazard} className="text-[11.5px] font-semibold leading-snug">
                {hazard}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => void openExternal(d.url)}
        className="mt-3 flex items-center gap-1.5 rounded-lg border-2 border-[#111] bg-white px-2.5 py-1 text-[12px] font-extrabold shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <ExternalLink className="size-3.5" strokeWidth={2.8} />
        {d.provider === "cactus" ? l("PubChem'de ara", "Search PubChem") : l(`PubChem'de aç (CID ${d.cid})`, `Open in PubChem (CID ${d.cid})`)}
      </button>
    </>
  );
}

/** "C2v" as C₂ᵥ with a real subscript. */
function PointGroupLabel({ group }: { group: PointGroup }) {
  return (
    <span>
      {group.letter}
      {(group.order || group.suffix) && <sub className="text-[0.75em]">{`${group.order}${group.suffix}`}</sub>}
    </span>
  );
}

/** RDKit's flat drawing, or the app's 3D model of the same molecule. */
function MoleculeViews({ svg, model }: { svg: string; model?: Extract<ToolResult, { tool: "molecule" }>["data"]["model"] }) {
  const l = useL();
  const [view, setView] = useState<"2d" | "3d">("2d");
  return (
    <div>
      {model && (
        <div className="mb-2 flex w-fit gap-1 rounded-lg border-2 border-[#111] bg-white p-0.5">
          {(["2d", "3d"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={`rounded-md px-2.5 py-0.5 text-[11.5px] font-extrabold ${view === option ? "bg-[#111] text-white" : "text-[#111]/60"}`}
            >
              {option === "2d" ? l("2B yapı", "2D") : l("3B model", "3D")}
            </button>
          ))}
        </div>
      )}
      {view === "3d" && model ? (
        <Molecule3D model={model} />
      ) : (
        // RDKit's own drawing, generated on the device from the SMILES.
        <div
          className="rdkit-structure mx-auto flex max-w-[340px] items-center justify-center rounded-xl border-2 border-[#111]/15 bg-white [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}

function ComplexBody({ result }: { result: Extract<ToolResult, { tool: "complex" }> }) {
  const l = useL();
  const lang = useLang();
  const d = result.data;
  const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
  const electrons = d.dElectrons !== null ? ` · d${d.dElectrons}` : d.fElectrons !== null ? ` · f${d.fElectrons}` : "";
  const row = (label: ReactNode, value: ReactNode, show = true): [ReactNode, ReactNode][] => (show ? [[label, value]] : []);
  const rows: [ReactNode, ReactNode][] = [
    [l("Formül", "Formula"), d.hill],
    [l("Mol kütlesi", "Molar mass"), `${fmt(d.molarMass, lang, 6)} g/mol`],
    [l("Merkez atom", "Centre"), `${d.centres > 1 ? `${d.centres}× ` : ""}${d.metal} (${sign(d.oxidationState)})${electrons}`],
    ...row(l("Kompleksin yükü", "Charge"), sign(d.charge)),
    [l("Koordinasyon", "Coordination"), d.coordinationText],
    [l("Geometri", "Geometry"), d.geometryName],
    ...row(l("İdeal açılar", "Ideal angles"), d.angles, d.angles !== "—"),
    ...row(l("Metal–metal", "Metal–metal"), d.metalMetal, Boolean(d.metalMetal)),
    ...row(l("Hibritleşme", "Hybridisation"), d.hybridisation, d.hybridisation !== "—"),
    ...row(
      l("Elektron dizilimi", "Configuration"),
      `${d.configuration}${d.spin ? ` · ${d.spin === "low" ? l("düşük spin", "low spin") : l("yüksek spin", "high spin")}` : ""}`,
      d.dElectrons !== null || d.fElectrons !== null
    ),
    [
      l("Manyetizma", "Magnetism"),
      `${d.unpaired} ${l("eşleşmemiş e⁻", "unpaired e⁻")} · μ ≈ ${fmt(d.magneticMoment, lang, 3)} BM${d.momentBasis !== "spin-only" ? ` (${d.momentBasis})` : ""} · ${d.unpaired ? l("paramanyetik", "paramagnetic") : l("diyamanyetik", "diamagnetic")}`,
    ],
    ...row(l("KAKE", "CFSE"), d.cfse, Boolean(d.cfse)),
    [d.centres > 1 ? l("Valens e⁻ (metal başına)", "Valence e⁻ (per metal)") : l("Valens elektronu", "Valence electrons"), `${d.valenceElectrons}${d.valenceElectrons === 18 ? " ✓ 18e" : ""}`],
    ...(d.pointGroup ? ([[l("Nokta grubu", "Point group"), <PointGroupLabel key="pg" group={d.pointGroup} />]] as [ReactNode, ReactNode][]) : []),
    [l("Ligandlar", "Ligands"), d.ligands.map((ligand) => (d.centres > 1 ? `${ligand.count}× ${ligand.name}` : `${ligand.count}× ${ligand.name} (${ligand.donor}, ${ligand.denticity > 1 ? l(`${ligand.denticity} dişli`, `κ${ligand.denticity}`) : l("tek dişli", "monodentate")})`)).join(", ")],
  ];
  return (
    <>
      <Molecule3D model={d.model} upright />
      <p className="mt-2.5 text-[20px] font-extrabold leading-tight tracking-tight">{d.compound}</p>
      <p className="mt-0.5 text-[12.5px] font-bold leading-snug text-[#111]/70">{lang === "en" ? d.nameEn : d.nameTr}</p>
      {lang !== "en" && <p className="text-[11.5px] font-semibold leading-snug text-[#111]/45">{d.nameEn}</p>}
      <Rows rows={rows} />
      {d.isomers.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[11.5px] font-bold text-[#111]/55">{d.isomers.length > 1 ? l(`${d.isomers.length} geometrik izomer`, `${d.isomers.length} geometric isomers`) : l("Stereokimya", "Stereochemistry")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {d.isomers.map((isomer) => (
              <span
                key={isomer.label}
                className="rounded-full border-2 border-[#111] px-2 py-0.5 text-[11px] font-extrabold"
                style={{ background: isomer.chosen ? INK_COLORS.purple.fill : "#fff" }}
              >
                {isomer.label}
                {isomer.chiral ? " · Δ/Λ" : ""}
                {isomer.chosen ? ` · ${l("çizilen", "drawn")}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      <CompositionBar rows={d.composition.map((row) => ({ label: row.symbol, percent: row.percent }))} />
    </>
  );
}

function VseprBody({ result }: { result: Extract<ToolResult, { tool: "vsepr" }> }) {
  const l = useL();
  const lang = useLang();
  const d = result.data;
  const pairs = Number.isInteger(d.lonePairs) ? String(d.lonePairs) : `${Math.floor(d.lonePairs)}½`;
  return (
    <>
      <Molecule3D model={d.model} height={230} upright />
      <div className="mt-2.5 flex items-baseline gap-2">
        <p className="text-[22px] font-extrabold leading-tight tracking-tight">{d.formula}</p>
        <span className="rounded-md border-2 border-[#111] px-1.5 text-[12px] font-extrabold" style={{ background: INK_COLORS.teal.fill }}>
          {d.axe}
        </span>
      </div>
      <Rows
        rows={[
          [l("Molekül geometrisi", "Molecular shape"), d.shape],
          [l("Elektron çifti geometrisi", "Electron-pair geometry"), d.pairGeometry],
          [l("Sterik sayı", "Steric number"), `${d.stericNumber} (${d.bonded} ${l("bağ", "bonded")} + ${pairs} ${l("ortaklanmamış çift", "lone pair(s)")})`],
          [l("Bağ açıları", "Bond angles"), d.angles],
          [l("Hibritleşme", "Hybridisation"), d.hybridisation],
          [l("Bağlar", "Bonds"), d.bonds],
          [l("Polarlık", "Polarity"), d.polar ? l("polar", "polar") : l("apolar", "non-polar")],
          ...(d.pointGroup ? ([[l("Nokta grubu", "Point group"), <PointGroupLabel key="pg" group={d.pointGroup} />]] as [ReactNode, ReactNode][]) : []),
          [l("Mol kütlesi", "Molar mass"), `${fmt(d.molarMass, lang, 6)} g/mol`],
        ]}
      />
    </>
  );
}

function CompositionBar({ rows }: { rows: { label: string; percent: number }[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="mt-3 flex h-6 overflow-hidden rounded-lg border-2 border-[#111]">
      {rows.map((row, i) => (
        <motion.span
          key={row.label}
          className="grid min-w-0 place-items-center overflow-hidden border-r-2 border-[#111] text-[10.5px] font-extrabold text-[#111] last:border-r-0"
          style={{ background: INK_COLORS[SERIES[i % SERIES.length]].fill }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${Math.max(row.percent, 0)}%` }}
          transition={{ duration: 0.6, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          {row.percent >= 9 ? row.label : ""}
        </motion.span>
      ))}
    </div>
  );
}

function PhScale({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const position = Math.min(Math.max(value, 0), 14) / 14;
  return (
    <div className="relative mt-3 pb-4">
      <div
        className="h-3.5 rounded-full border-2 border-[#111]"
        style={{ background: "linear-gradient(90deg,#E4312B 0%,#F28C28 18%,#F6D573 32%,#9ACD32 46%,#3BB273 54%,#3A9AD9 70%,#3B5BDB 84%,#6B3FA0 100%)" }}
      />
      <motion.span
        className="absolute top-[-5px] -ml-[9px] h-6 w-[18px] rounded-md border-2 border-[#111] bg-white shadow-[2px_2px_0_#111]"
        initial={reduce ? false : { left: "50%" }}
        animate={{ left: `${position * 100}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9.5px] font-extrabold text-[#111]/45">
        <span>0</span>
        <span>7</span>
        <span>14</span>
      </div>
    </div>
  );
}

// --- charts --------------------------------------------------------------------------------------

const W = 320;
const H = 190;
const PAD = { left: 34, right: 10, top: 10, bottom: 28 };

function Axes({ xMax, yMin, yMax, xLabel, yLabel, yTicks }: { xMax: number; yMin: number; yMax: number; xLabel: string; yLabel: string; yTicks: number[] }) {
  const lang = useLang();
  const tick = (value: number) => (lang === "tr" ? String(value).replace(".", ",") : String(value));
  const x = (v: number) => PAD.left + (v / xMax) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - ((v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const xTicks = niceTicks(0, xMax, 5);
  return (
    <g fontFamily="inherit" fontSize="9" fontWeight="800" fill="#111">
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#111" strokeOpacity="0.08" />
          <text x={PAD.left - 5} y={y(t) + 3} textAnchor="end" fillOpacity="0.55">
            {tick(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={`x${t}`} x={x(t)} y={H - PAD.bottom + 12} textAnchor="middle" fillOpacity="0.55">
          {tick(t)}
        </text>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#111" strokeWidth="2" />
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="#111" strokeWidth="2" />
      <text x={(W + PAD.left) / 2} y={H - 3} textAnchor="middle" fillOpacity="0.7">
        {xLabel}
      </text>
      <text x={10} y={(H - PAD.bottom) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(H - PAD.bottom) / 2})`} fillOpacity="0.7">
        {yLabel}
      </text>
    </g>
  );
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= count) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Number(t.toPrecision(6)));
  return ticks;
}

function TitrationBody({ result }: { result: Extract<ToolResult, { tool: "titration" }> }) {
  const l = useL();
  const lang = useLang();
  const reduce = useReducedMotion();
  const d = result.data;
  const xMax = d.maxVolume;
  const x = (v: number) => PAD.left + (v / xMax) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (Math.min(Math.max(v, 0), 14) / 14) * (H - PAD.top - PAD.bottom);
  const path = d.points.map((p, i) => `${i ? "L" : "M"}${x(p.v).toFixed(1)},${y(p.pH).toFixed(1)}`).join(" ");
  const band = d.indicators[0];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={l("Titrasyon eğrisi", "Titration curve")}>
        {band && (
          <rect x={PAD.left} width={W - PAD.left - PAD.right} y={y(band.range[1])} height={y(band.range[0]) - y(band.range[1])} fill={INK_COLORS.pink.fill} fillOpacity="0.35" />
        )}
        <Axes xMax={xMax} yMin={0} yMax={14} xLabel={l("Eklenen titrant (mL)", "Titrant added (mL)")} yLabel="pH" yTicks={[0, 2, 4, 6, 8, 10, 12, 14]} />
        <motion.path
          d={path}
          fill="none"
          stroke="#111"
          strokeWidth="2.6"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
        />
        {d.equivalence.map((e, i) => (
          <g key={`eq${i}`}>
            <line x1={x(e.v)} x2={x(e.v)} y1={PAD.top} y2={H - PAD.bottom} stroke="#111" strokeDasharray="3 3" strokeOpacity="0.5" />
            <circle cx={x(e.v)} cy={y(e.pH)} r="5" fill={INK_COLORS.teal.fill} stroke="#111" strokeWidth="2" />
          </g>
        ))}
        {d.halfEquivalence.map((e, i) => (
          <rect key={`h${i}`} x={x(e.v) - 4} y={y(e.pH) - 4} width="8" height="8" fill={INK_COLORS.yellow.fill} stroke="#111" strokeWidth="2" />
        ))}
      </svg>
      <Rows
        rows={[
          [l("Başlangıç pH", "Initial pH"), fixed(d.initialPH, 2, lang)],
          ...d.equivalence.map((e, i) => [
            l(`${d.equivalence.length > 1 ? `${i + 1}. ` : ""}Eşdeğerlik`, `${d.equivalence.length > 1 ? `${i + 1}. ` : ""}Equivalence`),
            `${fmt(e.v, lang, 4)} mL · pH ${fixed(e.pH, 2, lang)}`,
          ] as [ReactNode, ReactNode]),
          ...d.halfEquivalence.map((e) => [l("Yarı eşdeğerlik", "Half-equivalence"), `${fmt(e.v, lang, 4)} mL · pH ${fixed(e.pH, 2, lang)}`] as [ReactNode, ReactNode]),
          [l("İndikatör", "Indicator"), d.indicators.map((i) => `${i.name} (${fixed(i.range[0], 1, lang)}–${fixed(i.range[1], 1, lang)})`).join(", ") || "—"],
        ]}
      />
    </>
  );
}

function RegressionBody({ result }: { result: Extract<ToolResult, { tool: "regression" }> }) {
  const l = useL();
  const lang = useLang();
  const d = result.data;
  const xs = d.points.map((p) => p.x);
  const ys = d.points.map((p) => p.y);
  const xMax = Math.max(...xs, d.unknown?.value ?? 0) * 1.08 || 1;
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys, d.unknown?.signal ?? 0) * 1.1 || 1;
  const x = (v: number) => PAD.left + (v / xMax) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - ((v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const line = (v: number) => d.fit.slope * v + d.fit.intercept;
  return (
    <>
      <Big sub={`R² = ${fmt(d.fit.r2, lang, 5)} · n = ${d.fit.n} · LOD ${fmt(d.fit.lod, lang, 3)} · LOQ ${fmt(d.fit.loq, lang, 3)}`}>
        y = {fmt(d.fit.slope, lang, 5)}x {d.fit.intercept < 0 ? "−" : "+"} {fmt(Math.abs(d.fit.intercept), lang, 4)}
      </Big>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={l("Kalibrasyon grafiği", "Calibration plot")}>
        <Axes xMax={xMax} yMin={yMin} yMax={yMax} xLabel={d.xLabel} yLabel={d.yLabel} yTicks={niceTicks(yMin, yMax, 5)} />
        <line x1={x(0)} y1={y(line(0))} x2={x(xMax)} y2={y(line(xMax))} stroke={INK_COLORS.teal.tab} strokeWidth="2.5" />
        {d.points.map((p, i) => (
          <circle key={i} cx={x(p.x)} cy={y(p.y)} r="4.5" fill={INK_COLORS.teal.fill} stroke="#111" strokeWidth="2" />
        ))}
        {d.unknown && (
          <g>
            <line x1={PAD.left} x2={x(d.unknown.value)} y1={y(d.unknown.signal)} y2={y(d.unknown.signal)} stroke="#111" strokeDasharray="3 3" />
            <line x1={x(d.unknown.value)} x2={x(d.unknown.value)} y1={y(d.unknown.signal)} y2={H - PAD.bottom} stroke="#111" strokeDasharray="3 3" />
            <rect x={x(d.unknown.value) - 5} y={y(d.unknown.signal) - 5} width="10" height="10" fill={INK_COLORS.pink.fill} stroke="#111" strokeWidth="2" />
          </g>
        )}
      </svg>
      {d.unknown && (
        <p className="mt-1 text-[13px] font-extrabold">
          {l("Bilinmeyen", "Unknown")}: {d.yLabel} {fmt(d.unknown.signal, lang, 4)} → {d.xLabel} = {fmt(d.unknown.value, lang, 4)}
        </p>
      )}
    </>
  );
}

function SafetyBody({ result }: { result: Extract<ToolResult, { tool: "safety" }> }) {
  const l = useL();
  const lang = useLang();
  const d = result.data;
  const pick = (pair: { tr: string; en: string } | undefined) => (pair ? (lang === "en" ? pair.en : pair.tr) : "");
  if (!d.chemical) {
    return (
      <p className="text-[12.5px] font-semibold leading-snug">
        {l(
          `"${d.query}" uygulamanın güvenlik kartlarında yok. Üreticinin güncel SDS'ine başvurun.`,
          `"${d.query}" is not among the app's safety cards. Check the manufacturer's current SDS.`
        )}
      </p>
    );
  }
  const c = d.chemical;
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="rounded-md border-2 border-[#111] px-2 py-0.5 text-[12px] font-extrabold uppercase tracking-wide"
          style={{ background: c.signal === "danger" ? INK_COLORS.red.fill : c.signal === "warning" ? INK_COLORS.yellow.fill : "#fff" }}
        >
          {c.signal === "danger" ? l("Tehlike", "Danger") : c.signal === "warning" ? l("Dikkat", "Warning") : l("Uyarı yok", "No signal word")}
        </span>
        <span className="text-[12px] font-bold text-[#111]/55">
          {c.formula} · CAS {c.cas}
        </span>
      </div>
      {c.pictograms.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {c.pictograms.map((id) => (
            <span key={id} title={pick(PICTOGRAM_LABELS[id])}>
              <Pictogram id={id} size={44} />
            </span>
          ))}
        </div>
      )}
      <ul className="mt-2.5 space-y-1">
        {c.hazards.map((code) => (
          <li key={code} className="text-[12px] font-semibold leading-snug">
            <span className="font-extrabold">{code}</span> {pick(hazardText(code))}
          </li>
        ))}
      </ul>
      <ul className="mt-2 space-y-1">
        {c.precautions.slice(0, 5).map((code) => (
          <li key={code} className="text-[12px] font-semibold leading-snug text-[#111]/75">
            <span className="font-extrabold">{code}</span> {pick(precautionText(code))}
          </li>
        ))}
      </ul>
      {c.incompatible.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {c.incompatible.map((item) => (
            <span key={item} className="rounded-full border-2 border-[#111] px-2 py-0.5 text-[11px] font-extrabold" style={{ background: INK_COLORS.red.soft }}>
              ✕ {pick(INCOMPATIBILITY_LABELS[item])}
            </span>
          ))}
        </div>
      )}
      <Rows
        rows={[
          [l("Depolama", "Storage"), pick(STORAGE[c.storage])],
          [l("Göze temas", "Eyes"), pick(FIRST_AID[c.firstAid].eyes)],
        ]}
      />
    </>
  );
}
