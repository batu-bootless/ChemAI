// Chem+ app: the nine GHS pictograms, drawn inline.
//
// They are drawn rather than shipped as images so they stay sharp at any size, keep working
// offline and can be tinted by the theme. The frame (the red diamond) is shared; only the symbol
// inside changes. The red is the GHS red and does not follow the theme - a hazard diamond that
// changes colour is not a hazard diamond any more.
//
// Every symbol is drawn to fit inside |x-50| + |y-50| <= 38, which is the diamond's white area
// less the stroke. That bound is what keeps the crossbones and the corrosive scene from running
// under the red border; it is easy to lose when a shape is nudged, so check it after any edit.
import type { ReactNode } from "react";

export type PictogramId =
  | "explosive"
  | "flammable"
  | "oxidising"
  | "gas"
  | "corrosive"
  | "toxic"
  | "harmful"
  | "health"
  | "environment";

export const PICTOGRAM_LABELS: Record<PictogramId, { tr: string; en: string; code: string }> = {
  explosive: { tr: "Patlayıcı", en: "Explosive", code: "GHS01" },
  flammable: { tr: "Alevlenir", en: "Flammable", code: "GHS02" },
  oxidising: { tr: "Oksitleyici", en: "Oxidising", code: "GHS03" },
  gas: { tr: "Basınçlı gaz", en: "Gas under pressure", code: "GHS04" },
  corrosive: { tr: "Aşındırıcı", en: "Corrosive", code: "GHS05" },
  toxic: { tr: "Akut toksik", en: "Acute toxicity", code: "GHS06" },
  harmful: { tr: "Zararlı / tahriş edici", en: "Harmful / irritant", code: "GHS07" },
  health: { tr: "Sağlık tehlikesi", en: "Health hazard", code: "GHS08" },
  environment: { tr: "Çevre tehlikesi", en: "Environmental hazard", code: "GHS09" },
};

const GHS_RED = "#E2001A";

/**
 * The flame, drawn once at full size (tip at 51,8 - foot at 50,71) and scaled into place by the
 * two pictograms that use it. Sharing it keeps GHS02 and GHS03 the same flame, which is what the
 * standard shows; the only difference between those two is the circle underneath.
 */
const FLAME =
  "M51 8C54 22 66 32 66 48C66 62 58 71 50 71C41 71 33 62 33 49C33 40 39 35 43 28C44 37 48 41 51 37C53 33 52 18 51 8Z";

/** A test tube tilted by `rot`, with the lip that makes it read as a tube and not a pill. */
function Tube({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rot})`}>
      <rect x="-4" y="-11" width="8" height="22" rx="4" />
      <rect x="-5.5" y="7" width="11" height="3.5" rx="1.75" />
    </g>
  );
}

/** The symbols, in a 100x100 box, already inside the diamond's safe area. */
const SYMBOLS: Record<PictogramId, ReactNode> = {
  flammable: (
    <>
      <g transform="translate(50,14) scale(0.825) translate(-51,-8)">
        <path d={FLAME} />
      </g>
      <rect x="36" y="68" width="28" height="5.5" rx="2.75" />
    </>
  ),
  oxidising: (
    <>
      {/* the same flame, smaller, sitting on the circle that marks an oxidiser */}
      <g transform="translate(50,13) scale(0.68) translate(-51,-8)">
        <path d={FLAME} />
      </g>
      <circle cx="50" cy="62" r="7.5" />
      <rect x="39" y="74" width="22" height="4.5" rx="2.25" />
    </>
  ),
  explosive: (
    <>
      <circle cx="43" cy="59" r="15" />
      <path d="M68.2 31.3L67.2 42.1L77.9 44.0L68.0 48.5L71.6 58.8L62.8 52.5L55.8 60.7L56.8 49.9L46.1 48.0L56.0 43.5L52.4 33.2L61.2 39.5Z" />
      <circle cx="67" cy="29" r="3" />
      <circle cx="32" cy="32" r="2.6" />
      <circle cx="74" cy="40" r="2.2" />
    </>
  ),
  gas: (
    <>
      <path d="M39 36a11 11 0 0 1 22 0v36a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7z" />
      <rect x="45" y="21" width="10" height="11" rx="2.5" />
      <rect x="41" y="17" width="18" height="4.5" rx="2.25" />
    </>
  ),
  corrosive: (
    <>
      {/* two tubes pouring: left onto a slab, right onto the back of a hand, both eaten into */}
      <Tube x={39} y={29} rot={38} />
      <Tube x={62} y={29} rot={-30} />
      <path d="M33 40l3 1.4-3 8.6-2.8-1.3z" />
      <circle cx="30.5" cy="53" r="1.6" />
      <path d="M66 40l3 1.4-2 8.6-2.8-1.3z" />
      <circle cx="64" cy="53" r="1.6" />
      <path d="M27 57h19l-3 7H24z" />
      <path d="M34 54l-4 11h-5l4-11z" fill="#fff" />
      <path d="M52 57h12v11H52a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z" />
      <rect x="63" y="57.4" width="8.5" height="2.5" rx="1.25" />
      <rect x="63" y="61" width="9.5" height="2.5" rx="1.25" />
      <rect x="63" y="64.6" width="7.5" height="2.5" rx="1.25" />
      <path d="M52 67h6l-1.8 4.6a2.4 2.4 0 0 1-4.5-.9z" />
      <path d="M67 53l-3 11h-4l3-11z" fill="#fff" />
    </>
  ),
  toxic: (
    <>
      {/* the bones cross at the diamond's widest point - any lower and they run under the border */}
      <g transform="translate(50,61) rotate(14)">
        <rect x="-18" y="-3.25" width="36" height="6.5" rx="3.25" />
      </g>
      <g transform="translate(50,61) rotate(-14)">
        <rect x="-18" y="-3.25" width="36" height="6.5" rx="3.25" />
      </g>
      <path d="M50 18c-10 0-17.5 7-17.5 16.5 0 6 3.2 10.3 6.3 12.6V51a3 3 0 0 0 3 3h16.4a3 3 0 0 0 3-3v-3.9c3.1-2.3 6.3-6.6 6.3-12.6C67.5 25 60 18 50 18z" />
      <circle cx="42.7" cy="34" r="4.6" fill="#fff" />
      <circle cx="57.3" cy="34" r="4.6" fill="#fff" />
      <path d="M50 38.5l3 5.5h-6z" fill="#fff" />
      <rect x="44.6" y="46.5" width="2.2" height="6.5" fill="#fff" />
      <rect x="48.9" y="46.5" width="2.2" height="6.5" fill="#fff" />
      <rect x="53.2" y="46.5" width="2.2" height="6.5" fill="#fff" />
    </>
  ),
  harmful: (
    <>
      <path d="M44 25h12l-2.5 33h-7z" />
      <circle cx="50" cy="68" r="6.2" />
    </>
  ),
  health: (
    <>
      <circle cx="50" cy="24" r="8" />
      <path d="M35 44c0-6 7-10 15-10s15 4 15 10v25c0 2-1 3-3 3H38c-2 0-3-1-3-3z" />
      <path
        d="M46.0 41.0L47.7 47.8L53.8 44.2L50.2 50.3L57.0 52.0L50.2 53.7L53.8 59.8L47.7 56.2L46.0 63.0L44.3 56.2L38.2 59.8L41.8 53.7L35.0 52.0L41.8 50.3L38.2 44.2L44.3 47.8Z"
        fill="#fff"
      />
    </>
  ),
  environment: (
    <>
      <rect x="18" y="44" width="64" height="4" rx="2" />
      {/* the tree is bare and the fish has an X for an eye: both are dead, which is the point */}
      <g stroke="#1a1a1a" strokeWidth="3.2" fill="none" strokeLinecap="round">
        <path d="M38 44V24" />
        <path d="M38 33l-6-6" />
        <path d="M38 29l6-5" />
        <path d="M38 39l-5-5" />
      </g>
      <path d="M70 62c-5-6-14-7-21-4l-9-5v18l9-5c7 3 16 2 21-4z" />
      <g stroke="#fff" strokeWidth="2.1" strokeLinecap="round">
        <path d="M61 59l3.5 3.5" />
        <path d="M64.5 59l-3.5 3.5" />
      </g>
    </>
  ),
};

/**
 * One pictogram. `size` is the rendered square in pixels; the diamond fills it.
 */
export function Pictogram({
  id,
  size = 48,
  className,
}: {
  id: PictogramId;
  size?: number;
  className?: string;
}) {
  const label = PICTOGRAM_LABELS[id];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label.code}
    >
      <path d="M50 3 97 50 50 97 3 50Z" fill="#fff" stroke={GHS_RED} strokeWidth="9" strokeLinejoin="round" />
      <g fill="#1a1a1a">{SYMBOLS[id]}</g>
    </svg>
  );
}
