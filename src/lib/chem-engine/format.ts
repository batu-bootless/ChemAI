// Chem+ app: how the engine writes numbers and formulas - once, so every card and every line the
// AI is handed reads the same (Turkish decimal comma, ×10⁻⁵ rather than e-5, H₂O rather than H2O).

export type Language = "tr" | "en";

const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻",
};

export function subscript(text: string): string {
  return text.replace(/[0-9]/g, (d) => SUB[d]);
}

export function superscript(text: string): string {
  return text.replace(/[0-9+-]/g, (d) => SUP[d]);
}

/** "2+" / "-" / "3-" for a charge; empty for a neutral species. */
export function chargeLabel(charge: number): string {
  if (charge === 0) return "";
  const sign = charge > 0 ? "+" : "-";
  const size = Math.abs(charge);
  return `${size === 1 ? "" : size}${sign}`;
}

/**
 * A number the way a chemist writes it: `sig` significant figures, decimal comma in Turkish, and
 * ×10ⁿ outside 10⁻³…10⁶ so a Ka never turns into a row of zeros.
 */
export function fmt(value: number, language: Language = "tr", sig = 4): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "−∞" : "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  let text: string;
  if (abs < 1e-3 || abs >= 1e6) {
    const exponent = Math.floor(Math.log10(abs));
    let mantissa = value / 10 ** exponent;
    let exp = exponent;
    // 9.9996 rounded to four figures is 10.00, which belongs to the next power.
    if (Math.abs(Number(mantissa.toPrecision(sig))) >= 10) {
      mantissa /= 10;
      exp += 1;
    }
    const m = trimZeros(mantissa.toPrecision(sig));
    text = `${m}×10${superscript(String(exp))}`;
  } else {
    text = trimZeros(Number(value.toPrecision(sig)).toFixed(Math.max(0, sig - 1 - Math.floor(Math.log10(abs)))));
  }
  text = text.replace(/^-/, "−");
  return language === "tr" ? text.replace(/\./g, ",") : text;
}

/** A fixed number of decimals - pH to two places, percentages to two - with the decimal comma. */
export function fixed(value: number, decimals: number, language: Language = "tr"): string {
  if (!Number.isFinite(value)) return "—";
  const text = value.toFixed(decimals).replace(/^-/, "−");
  return language === "tr" ? text.replace(".", ",") : text;
}

function trimZeros(text: string): string {
  if (!text.includes(".") || text.includes("e")) return text;
  return text.replace(/\.?0+$/, "");
}

/** Plain digits for the AI's copy of a result: no locale, enough precision to quote. */
export function plain(value: number, sig = 6): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 1e-3 || abs >= 1e6) return value.toExponential(sig - 1).replace(/\.?0+e/, "e");
  return String(Number(value.toPrecision(sig)));
}
