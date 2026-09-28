// ChemAI's logo, wherever the app shows its name or its mark. Both are vectors traced from the
// artwork (scripts/trace_logo.py), so they stay sharp at every size and on every screen.

/** The logo's width for its height ("ChemAI." is 840 × 198 in the vector). */
const RATIO = 840 / 198;

/** The logo: "ChemAI." with the "AI." on yellow sun rays (public/brand/chemai-logo.svg). */
export default function Wordmark({ height = 24, className = "" }: { height?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static vector of the exported app
    <img
      src="/brand/chemai-logo.svg"
      alt="ChemAI"
      width={Math.round(height * RATIO)}
      height={height}
      draggable={false}
      className={`inline-block max-w-none select-none align-middle ${className}`}
      style={{ height, width: Math.round(height * RATIO) }}
    />
  );
}

/** The logo's "AI." on its rays alone (public/brand/chemai-mark.svg), for small round places such as Iris's avatar. */
export function LogoMark({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a static vector of the exported app
  return <img src="/brand/chemai-mark.svg" alt="" draggable={false} className={`select-none object-contain ${className}`} />;
}
