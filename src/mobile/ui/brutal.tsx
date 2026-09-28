"use client";

// Chem+ app: the flat, outlined building blocks the modules are drawn with.
//
// One look, defined once: a thick ink outline, a hard offset shadow, a flat pastel face and heavy
// type. Nothing here is decorative for its own sake - the outline is what separates two cards
// without a gradient, and the shadow is what makes a button look pressable before it is pressed.
//
// The press is the shadow: a pressed control slides into its own shadow (translate by the offset,
// drop the shadow) instead of dimming. That is the whole interaction language, so it lives in one
// constant rather than being retyped per button.
//
// Everything respects `useReducedMotion`: the entrances become instant, the press stays, because
// a control that does not answer a touch reads as broken rather than as calm.
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { INK_BORDER, INK_COLORS, INK_SHADOW, INK_SHADOW_SM, type InkColor } from "./ink";

export { INK_BORDER, INK_SHADOW, INK_SHADOW_SM, INK_COLORS };
export type { InkColor };

/** Slide into the shadow on press. */
export const INK_PRESS =
  "transition-[transform,box-shadow] duration-75 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none";
export const INK_PRESS_SM =
  "transition-[transform,box-shadow] duration-75 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#111]";

/**
 * A module screen. The whole surface is an `.app-light` island on its own paper background, the
 * way the folder cards are, so the generated dark theme never repaints the pastels into mud.
 */
export function InkPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={`app-light min-h-screen bg-[#FBF7F1] px-4 pb-[calc(var(--app-tabbar-space,96px))] pt-4 ${className}`}
    >
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </main>
  );
}

/**
 * A card drawn as a paper folder: a tab sitting on the card's top border, which hides it so the
 * two read as one shape. The same drawing as the folders on the home screen, so a protocol and a
 * folder belong to the same set.
 */
export function InkFolder({
  color,
  className = "",
  children,
}: {
  color: InkColor;
  className?: string;
  children: ReactNode;
}) {
  const palette = INK_COLORS[color];
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden="true"
        className={`relative z-10 h-6 w-[46%] translate-y-[3px] rounded-t-[14px] rounded-tr-[26px] border-[2.5px] border-b-0 ${INK_BORDER}`}
        style={{ background: palette.tab }}
      />
      <div
        className={`relative rounded-[22px] rounded-tl-none border-[2.5px] px-5 pb-5 pt-4 ${INK_BORDER} ${INK_SHADOW}`}
        style={{ background: palette.fill }}
      >
        {children}
      </div>
    </div>
  );
}

/** The base card: outline, shadow, flat face. `color` omitted means white. */
export function Slab({
  color,
  className = "",
  children,
  style,
}: {
  color?: InkColor;
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  const palette = color ? INK_COLORS[color] : undefined;
  return (
    <div
      className={`rounded-[18px] border-[2.5px] ${INK_BORDER} ${INK_SHADOW} ${className}`}
      style={{ background: palette?.fill ?? "#fff", ...style }}
    >
      {children}
    </div>
  );
}

/** A card that is also a control: same surface, but it answers a touch. */
export function SlabButton({
  color,
  className = "",
  onClick,
  children,
  ariaLabel,
}: {
  color?: InkColor;
  className?: string;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const palette = color ? INK_COLORS[color] : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`block w-full rounded-[18px] border-[2.5px] text-left ${INK_BORDER} ${INK_SHADOW} ${INK_PRESS} ${FOCUS} [-webkit-tap-highlight-color:transparent] ${className}`}
      style={{ background: palette?.fill ?? "#fff" }}
    >
      {children}
    </button>
  );
}

/** The filled action button, the one the folders strip introduced. */
export function InkButton({
  color = "purple",
  onClick,
  children,
  icon,
  className = "",
  type = "button",
  disabled,
}: {
  color?: InkColor;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const palette = INK_COLORS[color];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-2xl border-[2.5px] px-4 py-3.5 text-[15px] font-extrabold ${INK_BORDER} ${INK_SHADOW} ${INK_PRESS} ${FOCUS} disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0 [-webkit-tap-highlight-color:transparent] ${className}`}
      style={{ background: palette.fill, color: palette.ink }}
    >
      {icon}
      {children}
    </button>
  );
}

/** The square white button that sits next to a filled one. */
export function InkIconButton({
  onClick,
  children,
  ariaLabel,
  className = "",
}: {
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`grid w-[58px] shrink-0 place-items-center rounded-2xl border-[2.5px] bg-white text-[#111] ${INK_BORDER} ${INK_SHADOW} ${INK_PRESS} ${FOCUS} [-webkit-tap-highlight-color:transparent] ${className}`}
    >
      {children}
    </button>
  );
}

/** A filter or segment chip. Selected chips take the colour; the rest stay white. */
export function InkChip({
  active,
  onClick,
  children,
  color = "purple",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: InkColor;
}) {
  const palette = INK_COLORS[color];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border-[2.5px] px-3.5 py-1.5 text-[13px] font-extrabold ${INK_BORDER} ${INK_SHADOW_SM} ${INK_PRESS_SM} ${FOCUS} [-webkit-tap-highlight-color:transparent]`}
      style={{ background: active ? palette.fill : "#fff", color: active ? palette.ink : "#111" }}
    >
      {children}
    </button>
  );
}

/** A non-interactive label: an H-code, a keyword, a unit. */
export function InkTag({
  color,
  children,
  className = "",
}: {
  color?: InkColor;
  children: ReactNode;
  className?: string;
}) {
  const palette = color ? INK_COLORS[color] : undefined;
  return (
    <span
      className={`inline-block shrink-0 rounded-lg border-2 px-2 py-0.5 text-[11.5px] font-extrabold ${INK_BORDER} ${className}`}
      style={{ background: palette?.fill ?? "#fff", color: palette?.ink ?? "#111" }}
    >
      {children}
    </span>
  );
}

/** A text or number input drawn in the same hand. */
export function InkField({
  value,
  onChange,
  placeholder,
  icon,
  suffix,
  inputMode,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  inputMode?: "text" | "decimal" | "numeric" | "search";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[#111]">{icon}</span>
      )}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-label={ariaLabel ?? placeholder}
        className={`w-full rounded-2xl border-[2.5px] bg-white py-3 text-[16px] font-bold text-[#111] placeholder:font-semibold placeholder:text-[#111]/40 ${INK_BORDER} ${INK_SHADOW} outline-none focus:translate-x-[1px] focus:translate-y-[1px] ${
          icon ? "pl-11" : "pl-4"
        } ${suffix ? "pr-16" : "pr-4"}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 text-[13px] font-extrabold text-[#111]/50">
          {suffix}
        </span>
      )}
    </label>
  );
}

/** The heavy little heading that opens a section. */
export function SectionHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`mb-2 px-1 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#111]/60 ${className}`}>
      {children}
    </h2>
  );
}

/**
 * Staggered entrance for a list. The delay is capped so a long list does not turn the last cards
 * into a wait; past the tenth item everything arrives together.
 */
export function Rise({
  index = 0,
  children,
  className = "",
}: {
  index?: number;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, delay: Math.min(index, 10) * 0.035, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** A value that should be noticed when it changes - a score, a result, a count. */
export function Pop({ children, trigger, className = "" }: { children: ReactNode; trigger: unknown; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={String(trigger)}
      className={className}
      initial={reduce ? false : { scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The heading a module screen opens with. Plain type on the paper rather than a card: the title
 * is not a thing you act on, and boxing it would put a frame around the room instead of a picture.
 */
export function InkTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mb-4 px-1"
    >
      <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-[#111]">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-[14px] font-semibold leading-snug text-[#111]/55">{subtitle}</p>
      )}
    </motion.header>
  );
}

/**
 * A segmented control: one outlined track, the chosen segment filled. The selection is a colour
 * swap rather than a sliding pill, because a pill that slides between segments of different
 * widths has to measure them, and that measurement is what breaks on a font change.
 */
export function InkTabs<T extends string>({
  tabs,
  value,
  onChange,
  color = "purple",
}: {
  tabs: { id: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  color?: InkColor;
}) {
  const palette = INK_COLORS[color];
  return (
    <div
      className={`mb-4 flex gap-1 overflow-x-auto rounded-2xl border-[2.5px] bg-white p-1.5 ${INK_BORDER} ${INK_SHADOW} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-extrabold transition-colors"
            style={active ? { background: palette.fill, color: palette.ink } : { color: "rgb(17 17 17 / 0.5)" }}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** The "there is nothing here yet" panel - dashed, because it is a space waiting to be filled. */
export function InkEmpty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[18px] border-[2px] border-dashed border-[#111]/30 bg-white/50 px-5 py-8 text-center">
      {icon && <div className="mb-2 flex justify-center text-[#111]/35">{icon}</div>}
      <p className="text-[13.5px] font-bold leading-relaxed text-[#111]/55">{children}</p>
    </div>
  );
}

/** A dashed "add something here" button - an empty slot rather than a filled control. */
export function DashedButton({
  onClick,
  children,
  className = "",
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-1.5 rounded-xl border-[2px] border-dashed border-[#111]/35 px-3 py-2.5 text-[13.5px] font-extrabold text-[#111]/55 transition active:scale-[0.98] [-webkit-tap-highlight-color:transparent] ${className}`}
    >
      {children}
    </button>
  );
}

/** A sheet that slides up from the bottom edge, for the short "name this thing" forms. */
/**
 * Closes an overlay on Escape. On the phone this is also the Android back button: the app shell
 * turns a back press into Escape while a dialog or menu is open (src/mobile/AppShell.tsx), so a
 * sheet closes instead of the whole screen going back underneath it.
 */
export function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export function InkSheet({
  open,
  onClose,
  title,
  icon,
  right,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="app-light w-full max-w-lg rounded-t-[26px] border-t-[2.5px] border-[#111] bg-white px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-5"
            initial={reduce ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-[#111]">
                {icon}
                {title}
              </h2>
              {right}
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The panel a "..." button drops; closes on any tap outside it. */
export function InkMenu({
  open,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="menu"
            initial={reduce ? false : { opacity: 0, scale: 0.94, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className={`absolute z-50 overflow-hidden rounded-2xl border-[2.5px] bg-white p-1.5 ${INK_BORDER} ${INK_SHADOW} ${className}`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** One row inside an `InkMenu`. */
export function InkMenuItem({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[14px] font-bold text-[#111] transition active:bg-[#111]/10"
    >
      {icon}
      {children}
    </button>
  );
}

/** The header strip a module screen opens with: title on the module's own colour. */
export function InkHeader({
  color,
  title,
  subtitle,
  right,
}: {
  color: InkColor;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const palette = INK_COLORS[color];
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`mb-3 rounded-[18px] border-[2.5px] px-4 py-3 ${INK_BORDER} ${INK_SHADOW}`}
      style={{ background: palette.fill }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-extrabold tracking-tight" style={{ color: palette.ink }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-[12.5px] font-semibold" style={{ color: palette.sub }}>
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </div>
    </motion.div>
  );
}
