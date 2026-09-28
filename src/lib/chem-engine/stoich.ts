// Chem+ app: stoichiometry on a balanced equation - moles from what was weighed, the limiting
// reagent, the theoretical yield of every product, what is left of the excess, and % yield.

import { balanceEquation, type BalancedEquation, type Species } from "./balance";
import { molarMass, parseFormula } from "./formula";
import { toBase } from "./units";

export class StoichError extends Error {}

export interface Amount {
  species: string;
  amount: number;
  /** g, mg, kg, mol, mmol */
  unit: string;
}

export interface StoichResult {
  equation: BalancedEquation;
  reactants: {
    pretty: string;
    coefficient: number;
    molarMass: number;
    given?: { amount: number; unit: string; moles: number };
    /** moles ÷ coefficient: the smallest is the limiting one. */
    ratio?: number;
    limiting: boolean;
    used?: number;
    leftMoles?: number;
    leftMass?: number;
  }[];
  products: { pretty: string; coefficient: number; molarMass: number; moles: number; mass: number }[];
  extent: number;
  percentYield?: { species: string; actualMass: number; theoreticalMass: number; percent: number };
}

function same(a: string, species: Species): boolean {
  const normal = (text: string) => text.replace(/\s+/g, "").replace(/\((aq|s|l|g)\)$/i, "").replace(/[₀-₉]/g, (d) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(d)));
  if (normal(a) === normal(species.raw).replace(/^\d+/, "")) return true;
  try {
    const parsed = parseFormula(a);
    const counts = species.formula.counts;
    if (parsed.charge !== species.formula.charge || parsed.counts.size !== counts.size) return false;
    for (const [symbol, n] of parsed.counts) if (counts.get(symbol) !== n) return false;
    return true;
  } catch {
    return false;
  }
}

function toMoles(amount: Amount, molar: number): number {
  const unit = amount.unit.trim().toLowerCase();
  if (["mol", "mmol", "umol", "µmol", "kmol"].includes(unit)) return toBase(amount.amount, unit);
  if (["g", "mg", "kg", "ug", "µg"].includes(unit)) return toBase(amount.amount, unit) / molar;
  throw new StoichError(`"${amount.unit}" birimi için mol hesaplanamıyor (g, mg, kg, mol ya da mmol kullanın).`);
}

export function stoichiometry(equationText: string, given: Amount[], actual?: Amount): StoichResult {
  const equation = balanceEquation(equationText);
  if (given.length === 0) throw new StoichError("En az bir girenin miktarı gerekli.");
  const reactants = equation.reactants.map((species, i) => {
    const coefficient = equation.coefficients[i];
    const molar = molarMass(species.formula);
    const entry = given.find((amount) => same(amount.species, species));
    const moles = entry ? toMoles(entry, molar) : undefined;
    return {
      pretty: species.pretty,
      coefficient,
      molarMass: molar,
      given: entry && moles !== undefined ? { amount: entry.amount, unit: entry.unit, moles } : undefined,
      ratio: moles !== undefined ? moles / coefficient : undefined,
      limiting: false,
    };
  });
  const known = reactants.filter((reactant) => reactant.ratio !== undefined);
  if (known.length === 0) {
    const names = given.map((amount) => amount.species).join(", ");
    throw new StoichError(`Verilen maddeler (${names}) denklemin girenleri arasında bulunamadı.`);
  }
  const extent = Math.min(...known.map((reactant) => reactant.ratio!));
  const out: StoichResult["reactants"] = reactants.map((reactant) => {
    const limiting = reactant.ratio !== undefined && Math.abs(reactant.ratio - extent) <= 1e-12 * Math.max(1, extent);
    const used = extent * reactant.coefficient;
    const leftMoles = reactant.given ? reactant.given.moles - used : undefined;
    return {
      ...reactant,
      limiting,
      used,
      leftMoles,
      leftMass: leftMoles !== undefined ? leftMoles * reactant.molarMass : undefined,
    };
  });
  const products = equation.products.map((species, i) => {
    const coefficient = equation.coefficients[equation.reactants.length + i];
    const molar = molarMass(species.formula);
    const moles = extent * coefficient;
    return { pretty: species.pretty, coefficient, molarMass: molar, moles, mass: moles * molar };
  });

  let percentYield: StoichResult["percentYield"];
  if (actual) {
    const index = equation.products.findIndex((species) => same(actual.species, species));
    if (index < 0) throw new StoichError(`"${actual.species}" ürünler arasında bulunamadı.`);
    const product = products[index];
    const actualMass = toMoles(actual, product.molarMass) * product.molarMass;
    percentYield = { species: product.pretty, actualMass, theoreticalMass: product.mass, percent: (actualMass / product.mass) * 100 };
  }
  return { equation, reactants: out, products, extent, percentYield };
}
