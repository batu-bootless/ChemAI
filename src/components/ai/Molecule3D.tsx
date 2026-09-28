"use client";

// Chem+ app: a 3D ball-and-stick model to turn with a finger - the structures the app builds itself
// (complexes, VSEPR shapes, molecules lifted from RDKit's drawing: src/lib/chem-engine/model3d.ts).
//
// Drawn in SVG: shaded balls in the usual element colours, bonds as two half-sticks in the colours
// of their atoms (doubled and tripled for multiple bonds), η-bonds as fine dashes, lone pairs as
// pale lobes; everything sorted back to front each frame. It turns slowly by itself until touched.

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { ballRadius, centred, elementColor, isLightColor, type Model3D, type Vec } from "@/lib/chem-engine/model3d";
import { useL } from "@/mobile/i18n";

type Matrix = [number, number, number, number, number, number, number, number, number];

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const aboutY = (t: number): Matrix => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
const aboutX = (t: number): Matrix => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const turn = (m: Matrix, v: Vec): Vec => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** A molecule laid flat by its principal axes: turned a little and looked at slightly from above. */
const FACE_ON: Matrix = multiply(aboutX(-0.35), aboutY(0.55));
/** A complex or VSEPR shape the textbook way: its main axis (z) upright, seen a little from above. */
const UPRIGHT: Matrix = multiply(aboutX(0.55), multiply(aboutY(0.6), aboutX(-Math.PI / 2)));

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

const W = 340;

export default function Molecule3D({
  model: raw,
  height = 260,
  showLabels = true,
  upright = false,
}: {
  model: Model3D;
  height?: number;
  showLabels?: boolean;
  /** Stand the model's z axis up (complexes and VSEPR shapes are built round it). */
  upright?: boolean;
}) {
  const l = useL();
  const reduce = useReducedMotion() ?? false;
  const START = upright ? UPRIGHT : FACE_ON;
  // Turned about its own middle, so it fills the frame.
  const model = useMemo(() => centred(raw), [raw]);
  const [rotation, setRotation] = useState<Matrix>(START);
  const [spinning, setSpinning] = useState(!reduce);
  const [hideHydrogens, setHideHydrogens] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const id = `m3d-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hasHydrogens = model.atoms.some((atom) => atom.el === "H");

  const extent = useMemo(() => Math.max(1.5, ...model.atoms.map((atom) => Math.hypot(...atom.p) + ballRadius(atom.el))), [model]);
  const s = (Math.min(W, height) / 2 - 8) / extent;
  const elements = useMemo(() => [...new Set(model.atoms.map((atom) => atom.el))], [model]);

  // A slow turn about the vertical axis, until the model is touched.
  useEffect(() => {
    if (!spinning) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setRotation((r) => multiply(aboutY(dt * 0.45), r));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning]);

  const onDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    setSpinning(false);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic event has no pointer to capture.
    }
  };
  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setRotation((r) => multiply(aboutX(dy * 0.012), multiply(aboutY(dx * 0.012), r)));
  };
  const onUp = () => {
    drag.current = null;
  };

  // Everything to draw, back to front.
  const shown = model.atoms.map((atom) => !(hideHydrogens && atom.el === "H"));
  const placed = model.atoms.map((atom) => {
    const q = turn(rotation, atom.p);
    return { x: W / 2 + q[0] * s, y: height / 2 - q[1] * s, z: q[2], r: ballRadius(atom.el) * s, el: atom.el };
  });
  type Shape = { z: number; key: string; node: ReactNode };
  const shapes: Shape[] = [];
  model.bonds.forEach((bond, index) => {
    if (!shown[bond.a] || !shown[bond.b]) return;
    const a = placed[bond.a];
    const b = placed[bond.b];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (bond.kind === "eta") {
      shapes.push({
        z: (a.z + b.z) / 2 - 0.05,
        key: `b${index}`,
        node: <line key={`b${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8E8E98" strokeWidth={Math.max(0.8, 0.04 * s)} strokeDasharray={`${0.12 * s} ${0.1 * s}`} strokeLinecap="round" />,
      });
      return;
    }
    const lengthXY = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / lengthXY;
    const ny = (b.x - a.x) / lengthXY;
    const lines = bond.order === 4 ? [-1.5, -0.5, 0.5, 1.5] : bond.order === 3 ? [-1, 0, 1] : bond.order === 2 ? [-0.5, 0.5] : [0];
    const gap = bond.order >= 3 ? 0.13 * s : 0.16 * s;
    const width = (bond.order >= 2 ? 0.075 : bond.kind === "coord" ? 0.11 : 0.14) * s;
    for (const [half, from, el, z] of [
      ["a", a, a.el, (a.z * 3 + b.z) / 4],
      ["b", b, b.el, (b.z * 3 + a.z) / 4],
    ] as const) {
      const to = { x: mx, y: my };
      shapes.push({
        z: z - 0.05,
        key: `b${index}${half}`,
        node: (
          <g key={`b${index}${half}`}>
            {lines.map((offset) => (
              <line
                key={offset}
                x1={from.x + nx * offset * gap}
                y1={from.y + ny * offset * gap}
                x2={to.x + nx * offset * gap}
                y2={to.y + ny * offset * gap}
                stroke={shade(elementColor(el), el === "H" ? 0.82 : 0.9)}
                strokeWidth={Math.max(1.2, width)}
                strokeLinecap="round"
              />
            ))}
          </g>
        ),
      });
    }
  });
  (model.lonePairs ?? []).forEach((pair, index) => {
    const centre = model.atoms[pair.atom].p;
    const tip: Vec = [centre[0] + pair.dir[0] * 0.8, centre[1] + pair.dir[1] * 0.8, centre[2] + pair.dir[2] * 0.8];
    const q = turn(rotation, tip);
    const d = turn(rotation, pair.dir);
    const flat = Math.hypot(d[0], d[1]);
    const angle = (Math.atan2(-d[1], d[0]) * 180) / Math.PI;
    shapes.push({
      z: q[2],
      key: `lp${index}`,
      node: (
        <ellipse
          key={`lp${index}`}
          cx={W / 2 + q[0] * s}
          cy={height / 2 - q[1] * s}
          rx={Math.max(0.2, 0.55 * flat) * s}
          ry={0.3 * s}
          transform={`rotate(${angle} ${W / 2 + q[0] * s} ${height / 2 - q[1] * s})`}
          fill="rgba(95, 125, 245, 0.25)"
          stroke="rgba(95, 125, 245, 0.6)"
          strokeWidth={1}
        />
      ),
    });
  });
  placed.forEach((atom, index) => {
    if (!shown[index]) return;
    const color = elementColor(atom.el);
    const label = showLabels && atom.el !== "C" && atom.el !== "H" && atom.r > 7;
    shapes.push({
      z: atom.z,
      key: `a${index}`,
      node: (
        <g key={`a${index}`}>
          <circle cx={atom.x} cy={atom.y} r={atom.r} fill={`url(#${id}-${atom.el})`} stroke={shade(color, 0.55)} strokeWidth={0.6} />
          {label && (
            <text
              x={atom.x}
              y={atom.y}
              dy="0.35em"
              textAnchor="middle"
              fontSize={Math.min(13, atom.r * 0.95)}
              fontWeight={700}
              fill={isLightColor(color) ? "#1C1C22" : "#FFFFFF"}
              style={{ pointerEvents: "none" }}
            >
              {atom.el}
            </text>
          )}
        </g>
      ),
    });
  });
  shapes.sort((p, q) => p.z - q.z);

  return (
    <div>
      <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full cursor-grab touch-none select-none rounded-xl bg-[radial-gradient(ellipse_at_center,#FFFFFF_0%,#F1F3F8_100%)] active:cursor-grabbing"
        style={{ aspectRatio: `${W} / ${height}` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={l("Döndürülebilir 3B molekül modeli", "Rotatable 3D molecular model")}
      >
        <defs>
          {elements.map((el) => (
            <radialGradient key={el} id={`${id}-${el}`} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
              <stop offset="28%" stopColor={elementColor(el)} />
              <stop offset="100%" stopColor={shade(elementColor(el), 0.5)} />
            </radialGradient>
          ))}
        </defs>
        {shapes.map((shape) => shape.node)}
      </svg>
      <div className="absolute right-1.5 top-1.5 flex gap-1">
        {hasHydrogens && (
          <button
            type="button"
            onClick={() => setHideHydrogens((value) => !value)}
            aria-pressed={!hideHydrogens}
            aria-label={hideHydrogens ? l("Hidrojenleri göster", "Show hydrogens") : l("Hidrojenleri gizle", "Hide hydrogens")}
            className={`grid size-8 place-items-center rounded-lg border-2 border-[#111] text-[12px] font-extrabold ${hideHydrogens ? "bg-white text-[#111]/40 line-through" : "bg-white text-[#111]"}`}
          >
            H
          </button>
        )}
        <button
          type="button"
          onClick={() => setSpinning((value) => !value)}
          aria-label={spinning ? l("Dönmeyi durdur", "Stop turning") : l("Döndür", "Turn")}
          className="grid size-8 place-items-center rounded-lg border-2 border-[#111] bg-white text-[#111]"
        >
          {spinning ? <Pause className="size-3.5" strokeWidth={2.6} /> : <Play className="size-3.5" strokeWidth={2.6} />}
        </button>
        <button
          type="button"
          onClick={() => {
            setRotation(START);
            setSpinning(false);
          }}
          aria-label={l("Görünümü sıfırla", "Reset view")}
          className="grid size-8 place-items-center rounded-lg border-2 border-[#111] bg-white text-[#111]"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.6} />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10.5px] font-bold text-[#111]/40">{l("Parmağınla döndür", "Drag to turn")}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {elements.map((el) => (
          <span key={el} className="flex items-center gap-1 rounded-full border border-[#111]/15 bg-white px-2 py-0.5 text-[11px] font-bold text-[#111]/75">
            <span className="size-2.5 rounded-full border border-black/20" style={{ background: elementColor(el) }} />
            {el}
          </span>
        ))}
      </div>
    </div>
  );
}
