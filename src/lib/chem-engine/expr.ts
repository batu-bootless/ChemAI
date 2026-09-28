// Chem+ app: a small, safe calculator language for the formulas the AI writes out.
//
// It is the engine's answer to "let the model run Python": the model writes the expression
// (Ea = R*ln(k2/k1)/(1/T1-1/T2)), the app evaluates it exactly. Nothing is ever passed to eval -
// the text is parsed into a tree of numbers, names, operators and a fixed list of functions, so
// the worst an expression can do is fail to parse.

export class ExprError extends Error {}

/** Physical constants (CODATA 2018 exact / recommended values) available by name. */
export const CONSTANTS: Record<string, { value: number; label: string }> = {
  pi: { value: Math.PI, label: "π" },
  e: { value: Math.E, label: "e" },
  R: { value: 8.314462618, label: "R = 8,314 J/(mol·K)" },
  R_atm: { value: 0.082057366, label: "R = 0,08206 L·atm/(mol·K)" },
  F: { value: 96485.33212, label: "F = 96485 C/mol" },
  NA: { value: 6.02214076e23, label: "Nₐ = 6,022×10²³ mol⁻¹" },
  kB: { value: 1.380649e-23, label: "k_B = 1,381×10⁻²³ J/K" },
  h: { value: 6.62607015e-34, label: "h = 6,626×10⁻³⁴ J·s" },
  c: { value: 299792458, label: "c = 2,998×10⁸ m/s" },
  Kw: { value: 1e-14, label: "K_w = 1,0×10⁻¹⁴ (25 °C)" },
  g0: { value: 9.80665, label: "g = 9,807 m/s²" },
  qe: { value: 1.602176634e-19, label: "e = 1,602×10⁻¹⁹ C" },
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

type Node =
  | { type: "num"; value: number }
  | { type: "name"; name: string }
  | { type: "neg"; arg: Node }
  | { type: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
  | { type: "call"; name: string; args: Node[] };

type Token = { kind: "num"; value: number } | { kind: "name"; value: string } | { kind: "op"; value: string };

function tokenize(input: string): Token[] {
  const text = input
    .replace(/[×·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\*\*/g, "^")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    const number = text.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ kind: "num", value: Number(number[0]) });
      i += number[0].length;
      continue;
    }
    const name = text.slice(i).match(/^[A-Za-zΑ-Ωα-ωΔ_][A-Za-z0-9Α-Ωα-ω_]*/);
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      i += name[0].length;
      continue;
    }
    if ("+-*/^(),".includes(char)) {
      tokens.push({ kind: "op", value: char });
      i += 1;
      continue;
    }
    throw new ExprError(`İfadede okunamayan karakter: "${char}".`);
  }
  return tokens;
}

function parse(input: string): Node {
  const tokens = tokenize(input);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (value: string) => {
    const token = take();
    if (!token || token.kind !== "op" || token.value !== value) throw new ExprError(`"${value}" bekleniyordu.`);
  };

  // Precedence climbing: + - < * / < unary - < ^ (right-associative) < call / atom.
  const expression = (): Node => {
    let node = term();
    while (peek()?.kind === "op" && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = take().value as "+" | "-";
      node = { type: "bin", op, left: node, right: term() };
    }
    return node;
  };
  const term = (): Node => {
    let node = unary();
    for (;;) {
      const token = peek();
      if (token?.kind === "op" && (token.value === "*" || token.value === "/")) {
        take();
        node = { type: "bin", op: token.value as "*" | "/", left: node, right: unary() };
      } else if (token && (token.kind === "num" || token.kind === "name" || (token.kind === "op" && token.value === "("))) {
        // Implicit multiplication: 2R, 2(x+1), (a)(b).
        node = { type: "bin", op: "*", left: node, right: unary() };
      } else {
        return node;
      }
    }
  };
  const unary = (): Node => {
    const token = peek();
    if (token?.kind === "op" && token.value === "-") {
      take();
      return { type: "neg", arg: unary() };
    }
    if (token?.kind === "op" && token.value === "+") {
      take();
      return unary();
    }
    return power();
  };
  const power = (): Node => {
    const base = atom();
    if (peek()?.kind === "op" && peek()!.value === "^") {
      take();
      return { type: "bin", op: "^", left: base, right: unary() };
    }
    return base;
  };
  const atom = (): Node => {
    const token = take();
    if (!token) throw new ExprError("İfade eksik bitiyor.");
    if (token.kind === "num") return { type: "num", value: token.value };
    if (token.kind === "name") {
      if (peek()?.kind === "op" && peek()!.value === "(") {
        take();
        const args: Node[] = [];
        if (!(peek()?.kind === "op" && peek()!.value === ")")) {
          args.push(expression());
          while (peek()?.kind === "op" && peek()!.value === ",") {
            take();
            args.push(expression());
          }
        }
        expect(")");
        return { type: "call", name: token.value, args };
      }
      return { type: "name", name: token.value };
    }
    if (token.value === "(") {
      const node = expression();
      expect(")");
      return node;
    }
    throw new ExprError(`Beklenmeyen "${token.value}".`);
  };

  const tree = expression();
  if (position < tokens.length) throw new ExprError(`Fazladan "${(tokens[position] as Token).value}".`);
  return tree;
}

function evaluateNode(node: Node, scope: Record<string, number>): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "name": {
      if (node.name in scope) return scope[node.name];
      if (node.name in CONSTANTS) return CONSTANTS[node.name].value;
      throw new ExprError(`"${node.name}" için değer verilmedi.`);
    }
    case "neg":
      return -evaluateNode(node.arg, scope);
    case "bin": {
      const a = evaluateNode(node.left, scope);
      const b = evaluateNode(node.right, scope);
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      if (node.op === "/") return a / b;
      return a ** b;
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new ExprError(`Bilinmeyen fonksiyon: ${node.name}().`);
      return fn(...node.args.map((arg) => evaluateNode(arg, scope)));
    }
  }
}

/** Names an expression uses that are neither given nor constants - what a solve can solve for. */
export function freeNames(input: string, scope: Record<string, number>): string[] {
  const names = new Set<string>();
  const walk = (node: Node) => {
    if (node.type === "name" && !(node.name in scope) && !(node.name in CONSTANTS)) names.add(node.name);
    if (node.type === "neg") walk(node.arg);
    if (node.type === "bin") {
      walk(node.left);
      walk(node.right);
    }
    if (node.type === "call") node.args.forEach(walk);
  };
  walk(parse(input));
  return [...names];
}

/** Compiles once, evaluates many times (the root finder calls it hundreds of times). */
export function compile(input: string): (scope: Record<string, number>) => number {
  const tree = parse(input);
  return (scope) => evaluateNode(tree, scope);
}

export function evaluate(input: string, scope: Record<string, number> = {}): number {
  const value = compile(input)(scope);
  if (Number.isNaN(value)) throw new ExprError("Sonuç tanımsız (ör. negatif sayının logaritması).");
  return value;
}

/** Which constants an expression leans on, so the card can list them. */
export function usedConstants(input: string, scope: Record<string, number>): string[] {
  const used = new Set<string>();
  const walk = (node: Node) => {
    if (node.type === "name" && !(node.name in scope) && node.name in CONSTANTS) used.add(CONSTANTS[node.name].label);
    if (node.type === "neg") walk(node.arg);
    if (node.type === "bin") {
      walk(node.left);
      walk(node.right);
    }
    if (node.type === "call") node.args.forEach(walk);
  };
  walk(parse(input));
  return [...used];
}
