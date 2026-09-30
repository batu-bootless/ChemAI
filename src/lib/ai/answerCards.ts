// ChemAI: Iris's answers as cards. In text chats the app asks the AI to put its answer in one
// fenced ```iris block of JSON - a result, one card per question read from a photo, the organic
// structures as SMILES, the reactions as equations, formulas, steps and notes - and draws each as
// a card. Structures and equations are then checked on the device (RDKit, the balancer), so a card
// shows what the engine confirmed, not only what the AI wrote.
//
// Everything here is plain data: parsing a reply into cards, the rules sent with a question, and
// the same answer as readable text (to speak, copy, and send back as history).

export type NoteLevel = "bilgi" | "uyari" | "guvenlik";

export interface FormulaVariable {
  sembol: string;
  anlam: string;
  birim?: string;
}

export type AnswerCard =
  | { tur: "sonuc"; baslik?: string; deger: string; aciklama?: string }
  | { tur: "soru"; no?: string; soru: string; cevap: string; secenek?: string; adimlar?: string[] }
  | { tur: "molekul"; ad?: string; smiles?: string; rol?: string; aciklama?: string }
  | {
      tur: "tepkime";
      denklem?: string;
      tip?: string;
      kosullar?: string;
      gozlem?: string;
      aciklama?: string;
      /** Organic reactions: the structures on each side, as SMILES. */
      reaktanlar?: string[];
      urunler?: string[];
    }
  | { tur: "formul"; ad?: string; ifade: string; degiskenler?: FormulaVariable[]; aciklama?: string }
  | { tur: "adimlar"; baslik?: string; adimlar: string[] }
  | { tur: "not"; baslik?: string; seviye?: NoteLevel; maddeler: string[] };

export type CardType = AnswerCard["tur"];

export interface ParsedAnswer {
  /** The reply without its card block: an optional short lead-in. */
  text: string;
  cards: AnswerCard[];
  /** A card block has begun but not closed yet (an answer still being written). */
  incomplete: boolean;
}

const OPEN = /```(?:iris|json)?[ \t]*\n?/g;
const MAX_CARDS = 24;
const MAX_TEXT = 1200;

function text(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function texts(value: unknown, maxItems = 12, max = 600): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => text(item, max)).filter((item): item is string => Boolean(item));
  return items.length ? items.slice(0, maxItems) : undefined;
}

function level(value: unknown): NoteLevel | undefined {
  const raw = text(value)?.toLocaleLowerCase("tr");
  if (!raw) return undefined;
  if (raw.startsWith("güv") || raw.startsWith("guv") || raw.startsWith("saf")) return "guvenlik";
  if (raw.startsWith("uyar") || raw.startsWith("warn")) return "uyari";
  return "bilgi";
}

const ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

/** "Molekül", "SONUÇ", "adımlar" → "molekul", "sonuc", "adimlar". */
function cardType(value: unknown): string | undefined {
  return text(value, 20)
    ?.toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (letter) => ASCII[letter]);
}

/** One card from the AI's JSON, or null when it has nothing to show. Unknown fields are dropped. */
export function sanitizeCard(raw: unknown): AnswerCard | null {
  if (!raw || typeof raw !== "object") return null;
  const card = raw as Record<string, unknown>;
  const type = cardType(card.tur ?? card.type);
  switch (type) {
    case "sonuc": {
      const deger = text(card.deger ?? card.cevap);
      return deger ? { tur: "sonuc", baslik: text(card.baslik, 120), deger, aciklama: text(card.aciklama) } : null;
    }
    case "soru": {
      const soru = text(card.soru);
      const cevap = text(card.cevap);
      if (!soru && !cevap) return null;
      return { tur: "soru", no: text(card.no, 12), soru: soru ?? "", cevap: cevap ?? "", secenek: text(card.secenek, 12), adimlar: texts(card.adimlar) };
    }
    case "molekul": {
      const ad = text(card.ad, 200);
      const smiles = text(card.smiles, 500)?.replace(/\s+/g, "");
      return ad || smiles ? { tur: "molekul", ad, smiles, rol: text(card.rol, 60), aciklama: text(card.aciklama) } : null;
    }
    case "tepkime": {
      const denklem = text(card.denklem, 400);
      const reaktanlar = texts(card.reaktanlar, 6, 500)?.map((s) => s.replace(/\s+/g, ""));
      const urunler = texts(card.urunler, 6, 500)?.map((s) => s.replace(/\s+/g, ""));
      if (!denklem && !reaktanlar && !urunler) return null;
      return {
        tur: "tepkime",
        denklem,
        tip: text(card.tip, 80),
        kosullar: text(card.kosullar, 200),
        gozlem: text(card.gozlem, 300),
        aciklama: text(card.aciklama),
        reaktanlar,
        urunler,
      };
    }
    case "formul": {
      const ifade = text(card.ifade, 300);
      if (!ifade) return null;
      const degiskenler = Array.isArray(card.degiskenler)
        ? card.degiskenler
            .map((entry): FormulaVariable | null => {
              const row = entry as Record<string, unknown>;
              const sembol = text(row?.sembol, 20);
              const anlam = text(row?.anlam, 120);
              return sembol && anlam ? { sembol, anlam, birim: text(row?.birim, 30) } : null;
            })
            .filter((row): row is FormulaVariable => Boolean(row))
            .slice(0, 12)
        : undefined;
      return { tur: "formul", ad: text(card.ad, 120), ifade, degiskenler: degiskenler?.length ? degiskenler : undefined, aciklama: text(card.aciklama) };
    }
    case "adimlar": {
      const adimlar = texts(card.adimlar, 16);
      return adimlar ? { tur: "adimlar", baslik: text(card.baslik, 120), adimlar } : null;
    }
    case "not": {
      const maddeler = texts(card.maddeler, 10) ?? texts([card.metin]);
      return maddeler ? { tur: "not", baslik: text(card.baslik, 120), seviye: level(card.seviye), maddeler } : null;
    }
    default:
      return null;
  }
}

function cardsFrom(json: string): AnswerCard[] | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    // A trailing comma is the usual slip; one more try without them.
    try {
      value = JSON.parse(json.replace(/,\s*([\]}])/g, "$1"));
    } catch {
      return null;
    }
  }
  const list = Array.isArray(value) ? value : Array.isArray((value as { kartlar?: unknown })?.kartlar) ? (value as { kartlar: unknown[] }).kartlar : null;
  if (!list) return null;
  return list.map(sanitizeCard).filter((card): card is AnswerCard => Boolean(card)).slice(0, MAX_CARDS);
}

/**
 * Splits a reply into its lead-in text and its cards. A reply without a card block is all text; a
 * block that does not parse is kept as text, so the answer is never lost.
 */
export function parseAnswer(reply: string): ParsedAnswer {
  const source = reply ?? "";
  OPEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPEN.exec(source))) {
    const start = match.index;
    const bodyStart = start + match[0].length;
    const close = source.indexOf("```", bodyStart);
    const body = close < 0 ? source.slice(bodyStart) : source.slice(bodyStart, close);
    // Only a block that is (or is becoming) the card JSON counts; other code blocks stay text.
    const looksLikeCards =
      close < 0 ? /^\s*$/.test(body) || /^\s*[[{]/.test(body) : /^\s*[[{]/.test(body) && /"kartlar"|"tur"\s*:/.test(body);
    if (!looksLikeCards) {
      // Another code block: skip it whole, so its closing fence is not taken for an opening one.
      if (close < 0) break;
      OPEN.lastIndex = close + 3;
      continue;
    }
    const before = source.slice(0, start);
    const after = close < 0 ? "" : source.slice(close + 3);
    const lead = `${before}${after}`.replace(/\n{3,}/g, "\n\n").trim();
    if (close < 0) return { text: before.trim(), cards: [], incomplete: true };
    const cards = cardsFrom(body.trim());
    // JSON that does not parse is shown as it came (without the fences) rather than lost.
    if (!cards) return { text: `${before}${body}${after}`.replace(/\n{3,}/g, "\n\n").trim(), cards: [], incomplete: false };
    return { text: lead, cards, incomplete: false };
  }
  return { text: source.trim(), cards: [], incomplete: false };
}

/** The answer as plain sentences: what is read aloud, copied, and sent back as the chat's history. */
export function answerText(reply: string): string {
  const { text: lead, cards } = parseAnswer(reply);
  if (!cards.length) return lead;
  const lines: string[] = lead ? [lead] : [];
  for (const card of cards) {
    switch (card.tur) {
      case "sonuc":
        lines.push(`${card.baslik ? `${card.baslik}: ` : ""}${card.deger}${card.aciklama ? `. ${card.aciklama}` : ""}`);
        break;
      case "soru":
        lines.push(
          `${card.no ? `Soru ${card.no}` : "Soru"}: ${card.soru}\nCevap: ${card.secenek ? `${card.secenek}) ` : ""}${card.cevap}` +
            (card.adimlar?.length ? `\n${card.adimlar.map((step, i) => `${i + 1}. ${step}`).join("\n")}` : "")
        );
        break;
      case "molekul":
        lines.push(`${card.ad ?? "Molekül"}${card.rol ? ` (${card.rol})` : ""}${card.smiles ? ` - SMILES: ${card.smiles}` : ""}${card.aciklama ? `. ${card.aciklama}` : ""}`);
        break;
      case "tepkime":
        lines.push(
          [card.denklem ?? [card.reaktanlar?.join(" + "), card.urunler?.join(" + ")].filter(Boolean).join(" -> "), card.tip, card.kosullar, card.gozlem, card.aciklama]
            .filter(Boolean)
            .join(". ")
        );
        break;
      case "formul":
        lines.push(
          `${card.ad ? `${card.ad}: ` : ""}${card.ifade}` +
            (card.degiskenler?.length ? ` (${card.degiskenler.map((v) => `${v.sembol}: ${v.anlam}${v.birim ? `, ${v.birim}` : ""}`).join("; ")})` : "") +
            (card.aciklama ? `. ${card.aciklama}` : "")
        );
        break;
      case "adimlar":
        lines.push(`${card.baslik ? `${card.baslik}:\n` : ""}${card.adimlar.map((step, i) => `${i + 1}. ${step}`).join("\n")}`);
        break;
      case "not":
        lines.push(`${card.baslik ? `${card.baslik}: ` : ""}${card.maddeler.join(" ")}`);
        break;
    }
  }
  return lines.join("\n\n");
}

/** The card-format block earlier versions sent with a question: left out when a stored message is read back. */
export const CARD_OPEN = "⟦CHEMPLUS-KART⟧";
