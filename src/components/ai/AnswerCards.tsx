"use client";

// ChemAI: Iris's answer drawn as cards (src/lib/ai/answerCards.ts), in the same ink as the engine's
// cards above it. A structure card is the engine's molecule card - RDKit's drawing, formula and
// mass - once the device has confirmed it; a reaction card shows the engine's balancing and, for
// an organic reaction, RDKit's drawing of each structure. What the device could not confirm is
// shown as Iris wrote it and marked so.

import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  FlaskConical,
  Hexagon,
  Info,
  ListOrdered,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  Sigma,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import RichText from "./RichText";
import { ResultCard } from "./ToolCards";
import type { AnswerCard } from "@/lib/ai/answerCards";
import { checkCard, type CardCheck, type Depiction } from "@/lib/ai/cardChecks";
import { INK_COLORS, type InkColor } from "@/mobile/ui/ink";
import { useL, useLocale } from "@/mobile/i18n";

const NOTE_STYLE: Record<"bilgi" | "uyari" | "guvenlik", { color: InkColor; icon: LucideIcon; tr: string; en: string }> = {
  bilgi: { color: "cyan", icon: Info, tr: "Not", en: "Note" },
  uyari: { color: "orange", icon: AlertTriangle, tr: "Dikkat", en: "Caution" },
  guvenlik: { color: "red", icon: ShieldAlert, tr: "Güvenlik", en: "Safety" },
};

function Shell({ color, icon: Icon, title, badge, children }: { color: InkColor; icon: LucideIcon; title: ReactNode; badge?: ReactNode; children: ReactNode }) {
  const palette = INK_COLORS[color];
  return (
    <div className="overflow-hidden rounded-[16px] border-[2.5px] border-[#111] bg-white shadow-[3px_3px_0_#111]">
      <div className="flex items-center gap-2 border-b-[2.5px] border-[#111] px-2.5 py-2" style={{ background: palette.fill }}>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[#111] bg-white text-[#111]">
          <Icon className="size-4" strokeWidth={2.6} />
        </span>
        <span className="min-w-0 truncate text-[13px] font-extrabold tracking-tight" style={{ color: palette.ink }}>
          {title}
        </span>
        {badge}
      </div>
      <div className="px-3 py-3 text-[#111]">{children}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "plain"; children: ReactNode }) {
  const background = tone === "ok" ? INK_COLORS.green.soft : tone === "warn" ? INK_COLORS.yellow.fill : "#FFFFFF";
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border-2 border-[#111] px-2 py-0.5 text-[10.5px] font-extrabold text-[#111]" style={{ background }}>
      {tone === "ok" ? <BadgeCheck className="size-3" strokeWidth={3} /> : tone === "warn" ? <AlertTriangle className="size-3" strokeWidth={3} /> : null}
      {children}
    </span>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="text-[13.5px] font-semibold leading-relaxed text-[#111]/85 [&_p]:my-1">
      <RichText text={text} ink />
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2 text-[13px] font-semibold leading-snug text-[#111]/85">
          <span className="grid size-5 shrink-0 place-items-center rounded-md border-2 border-[#111] bg-white text-[10.5px] font-extrabold">{i + 1}</span>
          <span className="min-w-0">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** The device's check of a card: null while it runs, then its result (or null for none). */
function useCheck(card: AnswerCard): { check: CardCheck | null; checking: boolean } {
  const lang = useLocale().startsWith("en") ? "en" : "tr";
  const needs = card.tur === "molekul" || card.tur === "tepkime";
  const [state, setState] = useState<{ key: string; check: CardCheck | null } | null>(null);
  const key = `${lang}|${JSON.stringify(card)}`;
  useEffect(() => {
    if (!needs) return;
    let live = true;
    void checkCard(card, lang).then((check) => {
      if (live) setState({ key, check });
    });
    return () => {
      live = false;
    };
  }, [card, lang, key, needs]);
  if (!needs) return { check: null, checking: false };
  return state?.key === key ? { check: state.check, checking: false } : { check: null, checking: true };
}

function Checking({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#111]/55">
      <Loader2 className="size-3.5 animate-spin" strokeWidth={2.8} /> {label}
    </p>
  );
}

function MoleculeCard({ card }: { card: Extract<AnswerCard, { tur: "molekul" }> }) {
  const l = useL();
  const { check, checking } = useCheck(card);
  const extra =
    card.rol || card.aciklama ? (
      <div className="mt-2.5 border-t-2 border-dashed border-[#111]/15 pt-2">
        {card.rol && (
          <span className="mr-2 inline-block rounded-full border-2 border-[#111] px-2 py-0.5 text-[11px] font-extrabold" style={{ background: INK_COLORS.green.soft }}>
            {card.rol}
          </span>
        )}
        {card.aciklama && <Prose text={card.aciklama} />}
      </div>
    ) : null;
  if (check?.kind === "molecule" && check.outcome.ok) return <ResultCard result={check.outcome} extra={extra} />;
  return (
    <Shell
      color="green"
      icon={Hexagon}
      title={card.ad ?? l("Molekül", "Molecule")}
      badge={checking ? undefined : <Badge tone="warn">{l("Doğrulanamadı", "Not confirmed")}</Badge>}
    >
      {checking ? (
        <Checking label={l("RDKit ile çiziliyor…", "Drawing with RDKit…")} />
      ) : (
        <>
          {card.smiles && <p className="break-all font-mono text-[11.5px] font-bold">{card.smiles}</p>}
          <p className="mt-1 text-[12px] font-bold text-[#8A5A00]">
            {check?.kind === "molecule" && !check.outcome.ok
              ? check.outcome.error
              : l("Yapı cihazda doğrulanamadı; İris'in yazdığı gibi gösteriliyor.", "The structure couldn't be confirmed on the device; shown as Iris wrote it.")}
          </p>
        </>
      )}
      {extra}
    </Shell>
  );
}

function Structures({ items }: { items: Depiction[] }) {
  return (
    <>
      {items.map((item, i) => (
        <div key={`${item.smiles}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[18px] font-extrabold text-[#111]/45">+</span>}
          {item.svg ? (
            <div
              className="rdkit-structure grid h-[88px] w-[118px] shrink-0 place-items-center rounded-xl border-2 border-[#111]/15 bg-white [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: item.svg }}
            />
          ) : (
            <span className="max-w-[140px] break-all rounded-lg border-2 border-dashed border-[#D7263D]/50 px-1.5 py-1 font-mono text-[10.5px] font-bold text-[#D7263D]">{item.smiles}</span>
          )}
        </div>
      ))}
    </>
  );
}

function ReactionCard({ card }: { card: Extract<AnswerCard, { tur: "tepkime" }> }) {
  const l = useL();
  const { check, checking } = useCheck(card);
  const reaction = check?.kind === "reaction" ? check : null;
  const balanced = reaction?.balance?.ok && reaction.balance.tool === "balance" ? reaction.balance : null;
  const drawn = (reaction?.reactants.length ?? 0) + (reaction?.products.length ?? 0) > 0;
  const badge = checking ? undefined : balanced ? (
    reaction?.corrected ? <Badge tone="warn">{l("Motor düzeltti", "Engine corrected")}</Badge> : <Badge tone="ok">{l("Denkleşti", "Balanced")}</Badge>
  ) : drawn && [...reaction!.reactants, ...reaction!.products].every((d) => d.svg) ? (
    <Badge tone="ok">RDKit</Badge>
  ) : undefined;
  return (
    <Shell color="blue" icon={FlaskConical} title={card.tip ? `${l("Tepkime", "Reaction")} · ${card.tip}` : l("Tepkime", "Reaction")} badge={badge}>
      {balanced ? (
        <>
          <p className="text-[16px] font-extrabold leading-relaxed tracking-tight">{balanced.data.text}</p>
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
            {balanced.data.check.map((row) => (
              <span key={row.symbol} className="flex items-center justify-between rounded-lg border-2 border-[#111]/15 bg-[#FBF7F1] px-2 py-1 text-[11px] font-extrabold">
                <span>{row.symbol === "yük" ? l("yük", "charge") : row.symbol}</span>
                <span className={row.left === row.right ? "text-[#1E7B34]" : "text-[#D7263D]"}>
                  {row.left} = {row.right}
                </span>
              </span>
            ))}
          </div>
          {reaction?.corrected && card.denklem && (
            <p className="mt-2 text-[12px] font-bold text-[#8A5A00]">
              {l("İris'in yazdığı katsayılar denkleşmiyordu:", "Iris's coefficients didn't balance:")} <span className="font-mono">{card.denklem}</span>
            </p>
          )}
        </>
      ) : card.denklem ? (
        <p className="break-words text-[16px] font-extrabold leading-relaxed tracking-tight">{card.denklem.replace(/->/g, "→")}</p>
      ) : null}

      {checking && (card.reaktanlar?.length || card.urunler?.length || card.denklem) ? (
        <div className="mt-2">
          <Checking label={l("Yapılar ve denklem doğrulanıyor…", "Checking the structures and the equation…")} />
        </div>
      ) : drawn ? (
        <div className="-mx-1 mt-2.5 overflow-x-auto px-1 pb-1">
          <div className="flex w-max items-center gap-1.5">
            <Structures items={reaction!.reactants} />
            <div className="flex flex-col items-center px-1">
              {card.kosullar && <span className="max-w-[120px] text-center text-[10.5px] font-bold leading-tight text-[#111]/60">{card.kosullar}</span>}
              <ArrowRight className="size-7 text-[#111]" strokeWidth={2.4} />
            </div>
            <Structures items={reaction!.products} />
          </div>
        </div>
      ) : null}

      {(card.kosullar && !drawn) || card.gozlem ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
          {card.kosullar && !drawn && (
            <>
              <dt className="font-bold text-[#111]/55">{l("Koşullar", "Conditions")}</dt>
              <dd className="font-extrabold">{card.kosullar}</dd>
            </>
          )}
          {card.gozlem && (
            <>
              <dt className="font-bold text-[#111]/55">{l("Gözlem", "Observation")}</dt>
              <dd className="font-extrabold">{card.gozlem}</dd>
            </>
          )}
        </dl>
      ) : null}
      {card.aciklama && (
        <div className="mt-2">
          <Prose text={card.aciklama} />
        </div>
      )}
    </Shell>
  );
}

function CardView({ card }: { card: AnswerCard }) {
  const l = useL();
  switch (card.tur) {
    case "sonuc":
      return (
        <Shell color="yellow" icon={Sparkles} title={card.baslik ?? l("Sonuç", "Result")}>
          <p className="text-[21px] font-extrabold leading-tight tracking-tight">{card.deger}</p>
          {card.aciklama && (
            <div className="mt-1.5">
              <Prose text={card.aciklama} />
            </div>
          )}
        </Shell>
      );
    case "soru":
      return (
        <Shell color="purple" icon={CircleHelp} title={card.no ? `${l("Soru", "Question")} ${card.no}` : l("Soru", "Question")}>
          {card.soru && <p className="text-[12.5px] font-semibold leading-snug text-[#111]/65">{card.soru}</p>}
          <div className="mt-2 flex items-start gap-2 rounded-xl border-2 border-[#111] px-2.5 py-2" style={{ background: INK_COLORS.purple.soft }}>
            {card.secenek && (
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[#111] bg-white text-[14px] font-extrabold">{card.secenek}</span>
            )}
            <p className="min-w-0 text-[15px] font-extrabold leading-snug">{card.cevap}</p>
          </div>
          {card.adimlar && (
            <div className="mt-2.5">
              <StepList steps={card.adimlar} />
            </div>
          )}
        </Shell>
      );
    case "molekul":
      return <MoleculeCard card={card} />;
    case "tepkime":
      return <ReactionCard card={card} />;
    case "formul":
      return (
        <Shell color="indigo" icon={Sigma} title={card.ad ?? l("Formül", "Formula")}>
          <p className="rounded-xl border-2 border-[#111]/15 bg-[#FBF7F1] px-3 py-2.5 text-center text-[19px] font-extrabold tracking-tight">{card.ifade}</p>
          {card.degiskenler && (
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
              {card.degiskenler.map((row) => (
                <div key={row.sembol} className="contents">
                  <dt className="font-extrabold">{row.sembol}</dt>
                  <dd className="font-semibold text-[#111]/75">
                    {row.anlam}
                    {row.birim && <span className="text-[#111]/50"> · {row.birim}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {card.aciklama && (
            <div className="mt-2">
              <Prose text={card.aciklama} />
            </div>
          )}
        </Shell>
      );
    case "adimlar":
      return (
        <Shell color="teal" icon={ListOrdered} title={card.baslik ?? l("Adımlar", "Steps")}>
          <StepList steps={card.adimlar} />
        </Shell>
      );
    case "not": {
      const style = NOTE_STYLE[card.seviye ?? "bilgi"];
      return (
        <Shell color={style.color} icon={style.icon} title={card.baslik ?? l(style.tr, style.en)}>
          <ul className="space-y-1">
            {card.maddeler.map((item, i) => (
              <li key={i} className="flex gap-2 text-[13px] font-semibold leading-snug text-[#111]/85">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#111]" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </Shell>
      );
    }
  }
}

/** Iris's answer as cards; a lead-in sentence sits above them. */
export function AnswerCards({ cards }: { cards: AnswerCard[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-2.5">
      {cards.map((card, index) => (
        <motion.div
          key={index}
          initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <CardView card={card} />
        </motion.div>
      ))}
    </div>
  );
}

/** An answer that came without cards, in the same card ink, so every answer reads alike. */
export function TextCard({ text }: { text: string }) {
  const l = useL();
  return (
    <Shell color="purple" icon={MessageSquareText} title={l("İris", "Iris")}>
      <RichText text={text} ink />
    </Shell>
  );
}

/** A card block still being written (a streamed answer): a quiet placeholder instead of raw JSON. */
export function CardsPending() {
  const l = useL();
  return (
    <div className="rounded-[16px] border-[2.5px] border-dashed border-[#111]/30 px-3 py-3">
      <Checking label={l("Kartlar hazırlanıyor…", "Preparing the cards…")} />
    </div>
  );
}
