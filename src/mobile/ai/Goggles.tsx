"use client";

// Chem+ app: the face of Iris, the app's AI, in voice mode - a pair of lab safety goggles, where ChatGPT's
// voice screen has its orb.
//
// The lenses hold a liquid that answers to sound. While the user talks it ripples and rises with
// their voice (cyan) and rings spread around the goggles; while the answer is worked out it bubbles
// like a reaction (amber) and the goggles tilt, thinking; while Iris speaks it swells and
// sloshes with the voice itself (lilac) and the pair bobs to its loudness. The strap flutters, a
// glint sweeps the glass now and then, and a failure shakes it once (red).
//
// Loudness comes from a ref the voice engine writes (the microphone's level, or the measured level
// of the speech being played); when the voice gives no level, a speech-like rhythm stands in.
// Everything moves from one animation-frame loop that sets SVG attributes directly, so nothing
// re-renders sixty times a second.

import { useEffect, useId, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { VoiceShape } from "@/lib/ai/naturalVoice";

export type GogglesMode = "listen" | "hear" | "think" | "speak" | "rest" | "error";

/** Loudness written by the voice engine: 0…1, and when it was measured (performance.now()). */
export interface Loudness {
  value: number;
  at: number;
  /** The voice's shape, when known (VoiceShape in naturalVoice.ts): Iris's mouth follows it. */
  shape?: VoiceShape;
}

const CENTER = { x: 180, y: 103 };
const LENSES = [
  { cx: 120, cy: 103 },
  { cx: 240, cy: 103 },
];
const RX = 46;
const RY = 37;

const FRAME =
  "M96 44H264C290 44 307 62 307 86V122C307 146 290 162 266 162H218C208 162 202 155 198 145" +
  "C192 131 168 131 162 145C158 155 152 162 142 162H94C70 162 53 146 53 122V86C53 62 70 44 96 44Z";

/** Liquid colours: surface and depth. */
const LIQUID: Record<GogglesMode, [string, string]> = {
  listen: ["#BDEBF6", "#74C9E1"],
  hear: ["#9BE3F4", "#3DA8CB"],
  think: ["#FBE39D", "#E2A93A"],
  speak: ["#DCCBFF", "#9C74F0"],
  rest: ["#E9E4DC", "#C8C0B4"],
  error: ["#FCC4BB", "#E57A68"],
};

const BUBBLES = [
  { dx: -22, r: 3.2, speed: 24, phase: 0.1 },
  { dx: 7, r: 2.2, speed: 33, phase: 0.55 },
  { dx: 25, r: 3.8, speed: 20, phase: 0.8 },
  { dx: -6, r: 2.6, speed: 29, phase: 0.33 },
  { dx: 15, r: 1.8, speed: 37, phase: 0.95 },
];

const SAMPLES = 22;

function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** A talking rhythm: syllables about four times a second inside slower phrases. */
function speechEnvelope(t: number): number {
  const syllable = Math.max(0, Math.sin(t * Math.PI * 2 * 3.7 + Math.sin(t * 1.9) * 1.4));
  const phrase = 0.55 + 0.45 * Math.sin(t * 0.9 + 1.1);
  return 0.22 + 0.62 * syllable * phrase;
}

function strapPath(t: number, amplitude: number, offset: number): string {
  const points: [number, number][] = [];
  for (let x = 6; x <= 354; x += 12) {
    const distance = Math.abs(x - CENTER.x);
    const outer = Math.max(0, Math.min(1, (distance - 118) / 58));
    const y = 89 + outer * outer * 7 + Math.sin(t * 5.2 + distance * 0.09) * amplitude * outer + offset;
    points.push([x, y]);
  }
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y.toFixed(1)}`).join("");
}

function strapShape(t: number, amplitude: number): string {
  const top = strapPath(t, amplitude, 0);
  const bottom = strapPath(t, amplitude, 22)
    .split(/(?=[ML])/)
    .reverse()
    .map((command) => `L${command.slice(1)}`)
    .join("");
  return `${top}${bottom}Z`;
}

export default function Goggles({
  mode,
  level,
  label,
  onTap,
}: {
  mode: GogglesMode;
  level: React.RefObject<Loudness>;
  label: string;
  onTap: () => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reduce = useReducedMotion() ?? false;
  const svgRef = useRef<SVGSVGElement>(null);
  const modeRef = useRef(mode);
  const reduceRef = useRef(reduce);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    reduceRef.current = reduce;
  }, [reduce]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const body = svg.querySelector<SVGGElement>("[data-body]");
    const strap = svg.querySelector<SVGPathElement>("[data-strap]");
    const stitch = svg.querySelector<SVGPathElement>("[data-stitch]");
    const glint = svg.querySelector<SVGGElement>("[data-glint]");
    const stops = [...svg.querySelectorAll<SVGStopElement>("[data-stop]")];
    const liquids = [...svg.querySelectorAll<SVGPathElement>("[data-liquid]")];
    const crests = [...svg.querySelectorAll<SVGPathElement>("[data-crest]")];
    const rings = [...svg.querySelectorAll<SVGEllipseElement>("[data-ring]")];
    const bubbles = LENSES.map((_, lens) => [...svg.querySelectorAll<SVGCircleElement>(`[data-bubble="${lens}"]`)]);
    if (!body || !strap || !stitch || !glint) return;

    let frame = 0;
    let last = performance.now();
    let smooth = 0;
    let wave = 0;
    let fill = 0.45;
    let fizz = 0;
    let ringPhase = 0;
    let ringStrength = 0;
    let shake = 0;
    let glintAt = -1;
    let nextGlint = last + 2200;
    let seenMode = modeRef.current;
    const top = rgb(LIQUID[seenMode][0]);
    const deep = rgb(LIQUID[seenMode][1]);

    const tick = (time: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (time - last) / 1000));
      last = time;
      const t = time / 1000;
      const current = modeRef.current;
      const reduced = reduceRef.current;
      if (current !== seenMode) {
        if (current === "error") shake = 1;
        seenMode = current;
      }

      // Loudness: the measured level while it is fresh; a speaking rhythm when the voice gives none.
      const source = level.current;
      const fresh = source !== null && time - source.at < 280;
      let target = 0;
      if (current === "listen" || current === "hear") target = fresh ? source.value : 0;
      else if (current === "speak") target = fresh ? source.value : speechEnvelope(t);
      else if (current === "think") target = 0.2 + 0.08 * Math.sin(t * 2.4);
      smooth += (target - smooth) * Math.min(1, dt * (target > smooth ? 14 : 5));
      const loud = Math.max(0, Math.min(1, smooth));

      // Colour drifts to the mode's liquid.
      const [wantTop, wantDeep] = LIQUID[current].map(rgb);
      const blend = Math.min(1, dt * 4);
      for (let i = 0; i < 3; i++) {
        top[i] += (wantTop[i] - top[i]) * blend;
        deep[i] += (wantDeep[i] - deep[i]) * blend;
      }
      stops[0]?.setAttribute("stop-color", `rgb(${top.map(Math.round).join(",")})`);
      stops[1]?.setAttribute("stop-color", `rgb(${deep.map(Math.round).join(",")})`);

      // The liquid: its level, its waves, its bubbles.
      const base = current === "rest" ? 0.36 : current === "think" ? 0.54 : 0.46;
      fill += (base + loud * (current === "speak" ? 0.22 : 0.16) - fill) * Math.min(1, dt * 6);
      const amplitude = reduced ? 1.4 : (current === "rest" ? 1.2 : 2.2) + loud * 11;
      wave += dt * (reduced ? 0.5 : 1.4 + loud * 5 + (current === "think" ? 1 : 0));
      const fizzTarget = current === "think" ? 1 : current === "speak" ? 0.2 + loud * 0.5 : current === "hear" ? loud * 0.5 : 0;
      fizz += (fizzTarget - fizz) * Math.min(1, dt * 3);
      LENSES.forEach((lens, index) => {
        const phase = wave + index * 0.9;
        const surface = lens.cy + RY - fill * RY * 2;
        let crest = "";
        for (let s = 0; s <= SAMPLES; s++) {
          const x = lens.cx - RX - 4 + (s / SAMPLES) * (RX * 2 + 8);
          const y = surface + amplitude * Math.sin(x * 0.085 + phase * 2.2) + amplitude * 0.45 * Math.sin(x * 0.19 - phase * 3.1);
          crest += `${s ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        crests[index]?.setAttribute("d", crest);
        liquids[index]?.setAttribute("d", `${crest}L${lens.cx + RX + 4} ${lens.cy + RY + 4}L${lens.cx - RX - 4} ${lens.cy + RY + 4}Z`);
        bubbles[index].forEach((node, b) => {
          const spec = BUBBLES[b];
          const travel = (t * spec.speed + spec.phase * RY * 2) % (RY * 2);
          const y = lens.cy + RY - travel;
          const x = lens.cx + spec.dx + Math.sin(t * 2 + b + index) * 2;
          const depth = y - (surface + amplitude);
          node.setAttribute("cx", x.toFixed(1));
          node.setAttribute("cy", y.toFixed(1));
          node.setAttribute("opacity", depth > 0 && !reduced ? (fizz * Math.min(1, depth / 10)).toFixed(2) : "0");
        });
      });

      // The pair itself: sways at rest, tilts while thinking, bobs with the voice.
      let rotate = 0;
      let lift = 0;
      let scale = 1 + loud * 0.02;
      if (!reduced) {
        rotate = Math.sin(t * 0.8) * 1.2 + (current === "think" ? Math.sin(t * 1.6) * 2.4 : 0) + (current === "speak" ? Math.sin(t * 7.5) * loud * 1.4 : 0);
        lift = -loud * 8 + Math.sin(t * 1.3) * 1.5 + (current === "rest" ? 3 : 0);
        scale = 1 + loud * 0.045;
        if (shake > 0) {
          rotate += Math.sin(t * 42) * 4 * shake;
          shake = Math.max(0, shake - dt * 1.8);
        }
      }
      body.setAttribute(
        "transform",
        `translate(${CENTER.x} ${(CENTER.y + lift).toFixed(2)}) rotate(${rotate.toFixed(2)}) scale(${scale.toFixed(3)}) translate(${-CENTER.x} ${-CENTER.y})`
      );
      const flutter = reduced ? 0 : 1.5 + loud * 6;
      strap.setAttribute("d", strapShape(t, flutter));
      stitch.setAttribute("d", strapPath(t, flutter, 11));

      // Rings spread while the user talks, the way sound does.
      const ringTarget = current === "hear" ? 0.25 + loud * 0.75 : current === "listen" ? 0.18 : 0;
      ringStrength += (ringTarget - ringStrength) * Math.min(1, dt * 4);
      ringPhase = (ringPhase + dt * (0.55 + loud * 0.9)) % 1;
      rings.forEach((node, r) => {
        const p = (ringPhase + r * 0.5) % 1;
        node.setAttribute("rx", (150 + p * 36).toFixed(1));
        node.setAttribute("ry", (80 + p * 26).toFixed(1));
        node.setAttribute("opacity", reduced ? "0" : ((1 - p) * ringStrength * 0.5).toFixed(3));
      });

      // Now and then a glint crosses the glass.
      if (!reduced && glintAt < 0 && time > nextGlint) glintAt = 0;
      if (glintAt >= 0) {
        glintAt += dt / 0.9;
        if (glintAt > 1) {
          glintAt = -1;
          nextGlint = time + 3800 + Math.random() * 4200;
        }
      }
      glint.setAttribute("transform", `translate(${glintAt < 0 ? -140 : -60 + glintAt * 480} 0)`);

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [level]);

  const lensClip = `${uid}-lens`;
  const bothClip = `${uid}-both`;
  const liquidFill = `${uid}-liquid`;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      title={label}
      className="relative block w-full touch-manipulation select-none rounded-[48px] outline-none transition-transform duration-150 focus-visible:ring-4 focus-visible:ring-[#111]/25 active:scale-[0.97]"
    >
      <svg ref={svgRef} viewBox="0 0 360 210" className="block h-auto w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={liquidFill} x1="0" y1="0" x2="0" y2="1">
            <stop data-stop offset="0" stopColor={LIQUID[mode][0]} />
            <stop data-stop offset="1" stopColor={LIQUID[mode][1]} />
          </linearGradient>
          {LENSES.map((lens, index) => (
            <clipPath key={index} id={`${lensClip}-${index}`}>
              <ellipse cx={lens.cx} cy={lens.cy} rx={RX - 1.5} ry={RY - 1.5} />
            </clipPath>
          ))}
          <clipPath id={bothClip}>
            {LENSES.map((lens, index) => (
              <ellipse key={index} cx={lens.cx} cy={lens.cy} rx={RX - 1.5} ry={RY - 1.5} />
            ))}
          </clipPath>
        </defs>

        {[0, 1].map((ring) => (
          <ellipse key={ring} data-ring cx={CENTER.x} cy={CENTER.y} rx={150} ry={80} fill="none" stroke="#111" strokeWidth={2.5} opacity={0} />
        ))}

        <g data-body>
          {/* Strap, its stitching and the clips that hold it */}
          <path data-strap d={strapShape(0, 0)} fill="#2B2233" stroke="#111" strokeWidth={3} strokeLinejoin="round" />
          <path data-stitch d={strapPath(0, 0, 11)} fill="none" stroke="#C3A5FB" strokeWidth={2} strokeDasharray="6 7" strokeLinecap="round" opacity={0.85} />
          <rect x={42} y={84} width={20} height={32} rx={5} fill="#111" />
          <rect x={298} y={84} width={20} height={32} rx={5} fill="#111" />

          {/* Frame, with its hard ink shadow */}
          <path d={FRAME} transform="translate(7 7)" fill="#111" />
          <path d={FRAME} fill="#C3A5FB" stroke="#111" strokeWidth={3.5} strokeLinejoin="round" />
          <path d="M68 78C69 62 80 52 96 51" fill="none" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" opacity={0.75} />
          {[86, 101, 116, 235, 250, 265].map((x) => (
            <rect key={x} x={x} y={51} width={9} height={6} rx={3} fill="#111" />
          ))}

          {/* Lenses: glass, liquid, bubbles, glare */}
          {LENSES.map((lens, index) => (
            <g key={index}>
              <ellipse cx={lens.cx} cy={lens.cy} rx={RX} ry={RY} fill="#F6FAFF" />
              <g clipPath={`url(#${lensClip}-${index})`}>
                <path data-liquid fill={`url(#${liquidFill})`} d="" />
                <path data-crest fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} d="" />
                {BUBBLES.map((bubble, b) => (
                  <circle key={b} data-bubble={index} cx={lens.cx + bubble.dx} cy={lens.cy} r={bubble.r} fill="#FFFFFF" fillOpacity={0.9} stroke="#111" strokeWidth={1.2} opacity={0} />
                ))}
              </g>
              <path
                d={`M${lens.cx - 30} ${lens.cy - 4}Q${lens.cx - 27} ${lens.cy - 24} ${lens.cx - 9} ${lens.cy - 29}`}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={5}
                strokeLinecap="round"
                opacity={0.95}
              />
              <circle cx={lens.cx - 31} cy={lens.cy + 7} r={2.6} fill="#FFFFFF" opacity={0.95} />
            </g>
          ))}
          <g clipPath={`url(#${bothClip})`}>
            <g data-glint transform="translate(-140 0)">
              <polygon points="40,40 64,40 34,170 10,170" fill="#FFFFFF" opacity={0.5} />
              <polygon points="72,40 80,40 50,170 42,170" fill="#FFFFFF" opacity={0.35} />
            </g>
          </g>
          {LENSES.map((lens, index) => (
            <ellipse key={index} cx={lens.cx} cy={lens.cy} rx={RX} ry={RY} fill="none" stroke="#111" strokeWidth={3.5} />
          ))}
        </g>
      </svg>
    </button>
  );
}
