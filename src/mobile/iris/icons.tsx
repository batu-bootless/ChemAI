// ChemAI: the line icons of Iris's screens, drawn after the Gemini app's own set (the user's
// reference screenshots): round caps and joins, one stroke weight, a 24-unit box whose glyph is
// about 19 units wide. Each icon takes `size` (px) and inherits its colour.

import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number; strokeWidth?: number };

function Icon({ size = 24, strokeWidth = 1.6, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Eight rounded teeth around a ring: the Gemini settings gear, built once as a smooth path. */
const GEAR = (() => {
  const count = 64;
  const tip = 9.05;
  const valley = 7.3;
  const rad = Math.PI / 180;
  const tooth = (theta: number) => {
    const a = (((theta / rad - 22.5) % 45) + 45) % 45;
    const d = Math.min(a, 45 - a);
    if (d <= 9.5) return 1;
    if (d >= 19.5) return 0;
    const t = (d - 9.5) / 10;
    return 1 - t * t * (3 - 2 * t);
  };
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * 2 * Math.PI;
    const r = valley + (tip - valley) * tooth(theta);
    points.push([12 + r * Math.cos(theta), 12 - r * Math.sin(theta)]);
  }
  const f = (v: number) => Number(v.toFixed(2));
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < count; i++) {
    const p0 = points[(i - 1 + count) % count];
    const p1 = points[i];
    const p2 = points[(i + 1) % count];
    const p3 = points[(i + 2) % count];
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
})();

// --- the drawer, search, library -------------------------------------------------------------------

/** "Yeni sohbet": a pen over an open loop. */
export function NewChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.3 5.95A9.85 8.05 0 1 0 21.45 13.4" />
      <rect x="8.2" y="7.45" width="13.5" height="3.4" rx="1.7" transform="rotate(-45 14.95 9.15)" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.4" cy="10.4" r="6.9" />
      <path d="M15.45 15.45 20.6 20.6" />
    </Icon>
  );
}

/** "Kitaplık": four rounded squares. */
export function LibraryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.75" y="3.75" width="6.25" height="6.25" rx="2.3" />
      <rect x="14" y="3.75" width="6.25" height="6.25" rx="2.3" />
      <rect x="3.75" y="14" width="6.25" height="6.25" rx="2.3" />
      <rect x="14" y="14" width="6.25" height="6.25" rx="2.3" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.4v17.2M3.4 12h17.2" />
    </Icon>
  );
}

/** A notebook: the cover leaning over its back page. */
export function NotebookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.2 19.65 14.6 16.95Q15.9 16.4 15.9 15V3.55Q15.9 1.9 14.35 2.4L6.4 4.95Q5.15 5.35 5.15 6.65V20.05Q5.15 22.05 7.15 22.05H17.1Q19.1 22.05 19.1 20.05V5.35" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="4.6" cy="12" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="19.4" cy="12" r="1.05" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function MoreVerticalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="3.25" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.75 5.75 18.25 18.25M18.25 5.75 5.75 18.25" />
    </Icon>
  );
}

/** The two-line menu of the Gemini header. */
export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.15 9.45h17.7M3.15 14.55h17.7" />
    </Icon>
  );
}

/** A document card: a rounded page with three lines. */
export function DocumentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.6" />
      <path d="M7.7 8.1h8.6M7.7 12h8.6M7.7 15.9h5.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m14.5 6-6 6 6 6" />
    </Icon>
  );
}

// --- the new-notebook cards ------------------------------------------------------------------------

export function LightbulbIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.1 15.9A6.3 6.3 0 1 1 14.9 15.9Z" />
      <path d="M8.75 18.7h6.5M10.4 21.9h3.2" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5.2 12.4 4.4 4.3 9.2-9.4" />
    </Icon>
  );
}

export function SchoolIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.4 10.3 12 5.6l9.6 4.7-9.6 4.6Z" />
      <path d="M6.2 12.6v4.2L12 20.9l5.8-4.1v-4.2M21.6 10.3v5.3" />
    </Icon>
  );
}

/** A round-bottomed flask. */
export function FlaskIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.6 3.2h4.8M10.4 3.2v5.1a7 7 0 1 0 3.2 0V3.2" />
      <path d="M6.2 14.6h11.6" />
    </Icon>
  );
}

// --- settings --------------------------------------------------------------------------------------

/** "Kullanım": a clock whose ring breaks off into a dot. */
export function UsageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19.95 13.4A8.8 8.8 0 1 0 15.9 19.3" />
      <path d="M11.2 7.9v4.3l3.4 3.4" />
      <circle cx="18.1" cy="16.9" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.25 17.5V11a5.75 5.75 0 0 1 11.5 0v6.5M4 17.5h16M12 3.4v1.8" />
      <path d="M9.4 18.3a2.6 2.6 0 0 0 5.2 0" />
    </Icon>
  );
}

/** "Kişisel bağlam": a person with a spark at the shoulder. */
export function PersonSparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 19.3c0-3.1 1.8-4.8 4.7-5.5-1-1-1.1-2.5-1.1-4.1C7 5.9 8.8 3.5 11 3.5s4 2.4 4 6.2c0 1.2-.2 2.4-.8 3.2.4.4.7.7 1.1 1" />
      <path
        d="M17.3 13.6c.3 2.1 1.1 3 3.2 3.3-2.1.3-2.9 1.2-3.2 3.3-.3-2.1-1.1-3-3.2-3.3 2.1-.3 2.9-1.2 3.2-3.3Z"
        fill="currentColor"
        strokeWidth={1.1}
      />
    </Icon>
  );
}

/** "Yanıt tarzı": a smiling face, half drawn, half dotted. */
export function StyleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.5 3.55A8.55 8.55 0 0 0 11.5 20.6" />
      <path d="M8 14.5q3.15 2.2 6.25 0" />
      {[
        [8.25, 10.25],
        [14, 10.25],
        [15.3, 4.85],
        [18.5, 8],
        [19.75, 12.15],
        [18.5, 16.4],
        [15.3, 19.5],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.85" fill="currentColor" stroke="none" />
      ))}
    </Icon>
  );
}

/** "Ses": a speech box with a level meter. */
export function VoiceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.4 18.75H5.8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h11.2a3 3 0 0 1 3 3v1.4" />
      <path d="M14.25 13.3v4.2M17.15 11.5V19M20.1 14.3v2.4" />
    </Icon>
  );
}

/** "Eylemler ve otomasyon": a paper plane taking off. */
export function RocketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.3 8.75 19.4 3.6 14.8 18.9 11.2 12.3Z" />
      <path d="M1.2 16.6 4 14.5M2.1 20.7l5.3-4.8M6.3 21.6 9.2 19" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.3 6.9A7.9 7.9 0 1 1 3.5 11.4" />
      <path d="M4.3 3.9v3.6h3.7M11.1 8.8v3l2.2 2.4" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.6 16.2H7.2a4.2 4.2 0 0 1 0-8.4h2.4M14.4 7.8h2.4a4.2 4.2 0 0 1 0 8.4h-2.4M8.4 12h7.2" />
    </Icon>
  );
}

/** "Cihaz verileri": stacked discs. */
export function StorageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="5.8" rx="7.6" ry="2.8" />
      <path d="M4.4 5.8v12.4c0 1.5 3.4 2.8 7.6 2.8s7.6-1.3 7.6-2.8V5.8M4.4 12c0 1.5 3.4 2.8 7.6 2.8s7.6-1.3 7.6-2.8" />
    </Icon>
  );
}

export function ShieldLockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18.1 8.3V6.9L11 3.2 4.6 5.6 4.3 12.4c.1 2.8 1.6 5.4 4.5 7.1" />
      <rect x="12.4" y="15.2" width="7.8" height="5.9" rx="2.2" />
      <path d="M14.2 15.2v-1.4a2.1 2.1 0 0 1 4.2 0v1.4" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.9" />
      <path d="M9.5 9.4a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9" />
      <circle cx="12" cy="17.1" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function FeedbackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.4 18.6V6.6a2.8 2.8 0 0 1 2.8-2.8h9.6a2.8 2.8 0 0 1 2.8 2.8v6.8a2.8 2.8 0 0 1-2.8 2.8H8.2Z" />
      <path d="M12 7.3v3.9" />
      <circle cx="12" cy="13.6" r="0.95" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.9" />
      <path d="M12 11v5.6" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** "Tanılama kaydı": a pulse line. */
export function PulseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.8 12.4h4l2.3-5.6 4.1 11 2.4-5.4h5.6" />
    </Icon>
  );
}

// --- notebook, library and cards -------------------------------------------------------------------

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.6 19.4 5.4 15.8 15.6 5.6a1.9 1.9 0 0 1 2.8 0l0 0a1.9 1.9 0 0 1 0 2.8L8.2 18.6Z" />
      <path d="M13.9 7.3l2.8 2.8" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.2 6.6h15.6M9.4 6.6V4.9a1.3 1.3 0 0 1 1.3-1.3h2.6a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.2 6.6l.8 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l.8-12.2M10.2 10.6v6M13.8 10.6v6" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.2 3.6h5.6M10.3 3.6v5.3L7.1 12.6v1.7h9.8v-1.7l-3.2-3.7V3.6M12 14.3v6.1" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15.6V4.2M7.6 8.4 12 4.2l4.4 4.2" />
      <path d="M4.4 14.2v3.2a2.6 2.6 0 0 0 2.6 2.6h10a2.6 2.6 0 0 0 2.6-2.6v-3.2" />
    </Icon>
  );
}

export function PhotoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.6" y="4.4" width="16.8" height="15.2" rx="3.4" />
      <circle cx="9" cy="9.6" r="1.6" />
      <path d="m4.2 17.2 4.6-4 3.4 2.8 2.8-2.4 4.8 4" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 9.2a2.6 2.6 0 0 1 2.6-2.6h1.8l1.4-2.2h5.6l1.4 2.2H18a2.6 2.6 0 0 1 2.6 2.6v8.2A2.6 2.6 0 0 1 18 20H6a2.6 2.6 0 0 1-2.6-2.6Z" />
      <circle cx="12" cy="13" r="3.4" />
    </Icon>
  );
}

export function PasteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.6 5H7a2.6 2.6 0 0 0-2.6 2.6v10.2A2.6 2.6 0 0 0 7 20.4h10a2.6 2.6 0 0 0 2.6-2.6V7.6A2.6 2.6 0 0 0 17 5h-1.6" />
      <rect x="8.6" y="3.4" width="6.8" height="3.4" rx="1.4" />
      <path d="M8.4 11.4h7.2M8.4 15.2h4.8" />
    </Icon>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.6 3.4H7.4a2.6 2.6 0 0 0-2.6 2.6v12a2.6 2.6 0 0 0 2.6 2.6h9.2a2.6 2.6 0 0 0 2.6-2.6V9Z" />
      <path d="M13.4 3.6V7.6a1.4 1.4 0 0 0 1.4 1.4h4.2" />
    </Icon>
  );
}

export function InstructionsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6.4h11M4 11h8M4 15.6h5.4" />
      <path d="M13.2 19.6l.5-2.6 5.6-5.6a1.5 1.5 0 0 1 2.1 2.1L15.8 19.1Z" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.6 5.4v13.2a1 1 0 0 0 1.5.9l10.4-6.6a1 1 0 0 0 0-1.7L9.1 4.5a1 1 0 0 0-1.5.9Z" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 3.6v14.2a2.6 2.6 0 0 0 2.6 2.6h14.2" />
      <path d="m7.4 15 3.8-4.4 3 2.6 5.2-6" />
    </Icon>
  );
}

export function HexagonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.1 19.7 7.5v9L12 20.9 4.3 16.5v-9Z" />
      <path d="M12 7.2 16.1 9.6v4.8L12 16.8" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.2v11.4M7.6 11.4 12 15.6l4.4-4.2" />
      <path d="M4.4 15.8v1.6a2.6 2.6 0 0 0 2.6 2.6h10a2.6 2.6 0 0 0 2.6-2.6v-1.6" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8.4" y="8.4" width="11.4" height="11.4" rx="2.6" />
      <path d="M15.6 5.6A2.4 2.4 0 0 0 13.2 3.8H6.2a2.4 2.4 0 0 0-2.4 2.4v7a2.4 2.4 0 0 0 1.8 2.4" />
    </Icon>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3c.6 4.9 3.1 7.4 9 9-5.9 1.6-8.4 4.1-9 9-.6-4.9-3.1-7.4-9-9 5.9-1.6 8.4-4.1 9-9Z" />
    </Icon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.4 16.6 16.6 7.4M9 7.4h7.6V15" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.3 4.5 2.9 17.3a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.4v4.4" />
      <circle cx="12" cy="16.9" r="0.95" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function VerifiedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.9 14.3 4.6 17.1 4.4 18 7.1 20.3 8.8 19.5 11.5 20.3 14.2 18 15.9 17.1 18.6 14.3 18.4 12 20.1 9.7 18.4 6.9 18.6 6 15.9 3.7 14.2 4.5 11.5 3.7 8.8 6 7.1 6.9 4.4 9.7 4.6Z" />
      <path d="m8.6 11.6 2.3 2.2 4.6-4.6" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.9" />
      <path d="M3.1 12h17.8M12 3.1c2.4 2.4 3.6 5.4 3.6 8.9s-1.2 6.5-3.6 8.9c-2.4-2.4-3.6-5.4-3.6-8.9S9.6 5.5 12 3.1Z" />
    </Icon>
  );
}

/** "Protokoller": a clipboard with ticked rows. */
export function ProtocolIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.6" y="4.4" width="14.8" height="17" rx="3.2" />
      <rect x="8.6" y="2.8" width="6.8" height="3.4" rx="1.4" />
      <path d="M8 11.6 9.5 13.1 12.2 10.3M14.2 11.8h2.4M8 16.9 9.5 18.4 12.2 15.6M14.2 17.1h2.4" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.6" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.8" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 7.4 4.8 11.6 9 15.8" />
      <path d="M5 11.6h9.4a4.8 4.8 0 0 1 0 9.6h-2.2" />
    </Icon>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.4 21V4.2M5.4 4.6h10.8l-2.2 4 2.2 4H5.4" />
    </Icon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5.4M6.6 10.6 12 5.2l5.4 5.4" />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v13.6M6.6 13.4 12 18.8l5.4-5.4" />
    </Icon>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 14.6V3.8M8 7.6 12 3.6l4 4" />
      <path d="M8.6 10.4H7a2.6 2.6 0 0 0-2.6 2.6v5a2.6 2.6 0 0 0 2.6 2.6h10a2.6 2.6 0 0 0 2.6-2.6v-5a2.6 2.6 0 0 0-2.6-2.6h-1.6" />
    </Icon>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.3" />
      <path d="M4.4 3.6v3.8h3.8" />
    </Icon>
  );
}
