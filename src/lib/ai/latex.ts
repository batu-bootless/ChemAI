// The model often answers with LaTeX math ($\text{H}^+$, \frac{}{}, 10^{-5}) even
// when told not to. Nothing in the app renders LaTeX, so these markers are turned
// into readable Unicode (H⁺, a/b, 10⁻⁵). Code spans are left untouched.

const SYMBOLS: Record<string, string> = {
  rightarrow: "→", to: "→", longrightarrow: "⟶", Rightarrow: "⇒", leftarrow: "←", longleftarrow: "⟵",
  leftrightarrow: "↔", rightleftharpoons: "⇌", rightleftarrows: "⇄", uparrow: "↑", downarrow: "↓",
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", approx: "≈", sim: "∼", simeq: "≃", equiv: "≡",
  neq: "≠", ne: "≠", leq: "≤", le: "≤", geq: "≥", ge: "≥", ll: "≪", gg: "≫", propto: "∝", infty: "∞",
  partial: "∂", nabla: "∇", sum: "∑", prod: "∏", int: "∫", degree: "°", circ: "°", prime: "′",
  ldots: "…", cdots: "⋯", dots: "…", quad: " ", qquad: " ",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  " ": " ", ",": " ", ";": " ", ":": " ", "!": "", "\\": " ",
  "%": "%", $: "$", "&": "&", "#": "#", _: "_", "{": "{", "}": "}",
};

// Formatting commands whose argument is kept as plain text.
const UNWRAP = new Set([
  "text", "textrm", "textbf", "textit", "textnormal", "mathrm", "mathbf", "mathit", "mathsf", "mathcal",
  "mathbb", "boldsymbol", "operatorname", "mbox", "emph", "overline", "underline", "bar", "hat", "vec", "tilde",
]);
const FUNCTIONS = new Set(["log", "ln", "lg", "exp", "sin", "cos", "tan", "min", "max", "lim"]);
// Letter-like symbols: LaTeX drops the space after them, so "\Delta G" is ΔG (but "\alpha = 1" keeps it).
const LETTER_SYMBOLS = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "kappa", "lambda", "mu", "nu",
  "xi", "pi", "rho", "sigma", "tau", "phi", "varphi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega",
  "degree", "circ", "prime", "infty", "partial", "nabla",
]);

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", p: "ₚ", s: "ₛ", t: "ₜ",
};

function mapScript(text: string, table: Record<string, string>): string | null {
  let out = "";
  for (const ch of text) {
    const mapped = table[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

function toSuperscript(text: string): string {
  if (/^[°′″*]+$/.test(text)) return text;
  return mapScript(text, SUPERSCRIPT) ?? `^(${text})`;
}

function toSubscript(text: string): string {
  return mapScript(text, SUBSCRIPT) ?? `(${text})`;
}

function group(text: string): string {
  const trimmed = text.trim();
  return /[\s+\-=/·×]/.test(trimmed) ? `(${trimmed})` : trimmed;
}

// Reads a command/script argument: a {braced group}, a \command, or one character.
function readArg(src: string, start: number): [string, number] {
  let i = start;
  while (src[i] === " ") i++;
  if (src[i] === "{") {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === "\\") {
        j++;
      } else if (src[j] === "{") {
        depth++;
      } else if (src[j] === "}" && --depth === 0) {
        return [src.slice(i + 1, j), j + 1];
      }
    }
    return [src.slice(i + 1), src.length];
  }
  if (src[i] === "\\") {
    const command = /^\\([A-Za-z]+|[\s\S])/.exec(src.slice(i));
    if (command) return [command[0], i + command[0].length];
  }
  return [src[i] ?? "", Math.min(i + 1, src.length)];
}

// mhchem (\ce{...}): H2SO4 -> H₂SO₄, Fe^3+ -> Fe³⁺, NH4+ -> NH₄⁺, -> / <=> arrows.
function convertChem(src: string): string {
  const arrows = src.replace(/<=>/g, "⇌").replace(/<->/g, "↔").replace(/->/g, "→").replace(/<-/g, "←");
  const charges = arrows.replace(/\^\{?(\d*[+-]|\d+)\}?/g, (_, charge: string) => toSuperscript(charge));
  const counts = charges.replace(/([A-Za-z)\]])(\d+)/g, (_, atom: string, count: string) => atom + toSubscript(count));
  const ions = counts.replace(/([A-Za-z₀-₉)\]])([+-])(?=$|\s|[)\]])/g, (_, before: string, sign: string) => before + toSuperscript(sign));
  return convertMath(ions);
}

function convertMath(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      const command = /^\\([A-Za-z]+|[\s\S])/.exec(src.slice(i));
      const name = command ? command[1] : "";
      i += command ? command[0].length : 1;
      if (UNWRAP.has(name)) {
        const [arg, next] = readArg(src, i);
        out += convertMath(arg);
        i = next;
      } else if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [numerator, afterNumerator] = readArg(src, i);
        const [denominator, afterDenominator] = readArg(src, afterNumerator);
        out += `${group(convertMath(numerator))}/${group(convertMath(denominator))}`;
        i = afterDenominator;
      } else if (name === "sqrt") {
        const [arg, next] = readArg(src, i);
        out += `√${group(convertMath(arg))}`;
        i = next;
      } else if (name === "ce" || name === "pu") {
        const [arg, next] = readArg(src, i);
        out += convertChem(arg);
        i = next;
      } else if (name === "left" || name === "right") {
        if (src[i] === ".") i++;
      } else if (Object.hasOwn(SYMBOLS, name)) {
        out += SYMBOLS[name];
        if (LETTER_SYMBOLS.has(name) && /^ +[A-Za-z0-9\\]/.test(src.slice(i))) {
          while (src[i] === " ") i++;
        }
      } else if (FUNCTIONS.has(name)) {
        out += name;
      }
      // Any other command (\displaystyle, \label, ...) is dropped.
    } else if (ch === "^" || ch === "_") {
      const [arg, next] = readArg(src, i + 1);
      const value = convertMath(arg).trim();
      out += ch === "^" ? toSuperscript(value) : toSubscript(value);
      i = next;
    } else if (ch === "{" || ch === "}") {
      i++;
    } else {
      out += ch === "~" ? " " : ch;
      i++;
    }
  }
  return out;
}

const MATH_SEGMENT = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
const LATEX_HINT = /[\\^_{}]/;
const SYMBOL_NAMES = Object.keys(SYMBOLS).filter((name) => /^[A-Za-z]+$/.test(name));
// Commands written without $ delimiters, e.g. "\text{Fe}^{3+} iyonu".
const BARE_COMMAND = new RegExp(
  String.raw`\\(?:text|textbf|mathrm|mathbf|ce|frac|sqrt)\s*\{[^{}]*\}(?:\{[^{}]*\})?(?:[\^_](?:\{[^{}]*\}|[^\s{}\\]))*` +
    String.raw`|\\(?:${SYMBOL_NAMES.join("|")})(?![A-Za-z])`,
  "g"
);

function convertProse(text: string): string {
  return text
    .replace(MATH_SEGMENT, (match: string, display?: string, bracket?: string, paren?: string, inline?: string) => {
      // "$" without any LaTeX inside is ordinary text (e.g. prices), not math.
      if (inline !== undefined && !LATEX_HINT.test(inline)) return match;
      return convertMath(display ?? bracket ?? paren ?? inline ?? "").trim();
    })
    .replace(BARE_COMMAND, (match) => convertMath(match));
}

export function latexToUnicode(text: string): string {
  if (!/[\\$]/.test(text)) return text;
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : convertProse(part)))
    .join("");
}
