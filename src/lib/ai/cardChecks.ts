"use client";

// ChemAI: what the device confirms about Iris's answer cards (answerCards.ts). A structure card
// goes through the engine's molecule tool - RDKit reads the SMILES, or the name is looked up in
// PubChem - so the drawing, formula and mass on screen are the engine's. A reaction is balanced
// by the engine, and an organic scheme's structures are drawn by RDKit. What cannot be confirmed
// is shown as the AI's, marked so.

import type { Language } from "@/lib/chem-engine/format";
import { runTool, type ToolOutcome } from "@/lib/chem-engine/tools";
import { depictSmiles } from "@/lib/chem-engine/rdkit";
import { splitEquation } from "@/lib/chem-engine/balance";
import type { AnswerCard } from "./answerCards";

export interface Depiction {
  smiles: string;
  svg?: string;
  error?: string;
}

export type CardCheck =
  | { kind: "molecule"; outcome: ToolOutcome }
  | {
      kind: "reaction";
      /** The engine's balancing of the written equation, when it could read it. */
      balance?: ToolOutcome;
      /** The AI wrote coefficients and they were not the engine's. */
      corrected: boolean;
      reactants: Depiction[];
      products: Depiction[];
    };

/** The coefficients written in front of each species ("2H2 + O2 -> 2H2O" → [2, 1, 2]). */
export function writtenCoefficients(equation: string): number[] | null {
  try {
    const { left, right } = splitEquation(equation);
    return [...left, ...right].map((species) => {
      const lead = species.trim().match(/^(\d+)(?=\s*[A-Z([{])/);
      return lead ? Number(lead[1]) : 1;
    });
  } catch {
    return null;
  }
}

async function depictAll(list: string[] | undefined): Promise<Depiction[]> {
  return Promise.all(
    (list ?? []).map(async (smiles) => {
      try {
        return { smiles, svg: await depictSmiles(smiles) };
      } catch (error) {
        return { smiles, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );
}

async function check(card: AnswerCard, language: Language): Promise<CardCheck | null> {
  if (card.tur === "molekul") {
    const outcome = await runTool({ tool: "molecule", args: { smiles: card.smiles ?? "", name: card.ad ?? "" } }, language);
    return { kind: "molecule", outcome };
  }
  if (card.tur === "tepkime") {
    const [balance, reactants, products] = await Promise.all([
      card.denklem ? runTool({ tool: "balance", args: { equation: card.denklem } }, language) : Promise.resolve(undefined),
      depictAll(card.reaktanlar),
      depictAll(card.urunler),
    ]);
    let corrected = false;
    if (balance?.ok && balance.tool === "balance" && card.denklem) {
      const written = writtenCoefficients(card.denklem);
      // Coefficients the AI left out are not an error; ones it wrote and got wrong are.
      if (written && written.some((c) => c !== 1)) corrected = written.join(",") !== balance.data.coefficients.join(",");
    }
    return { kind: "reaction", balance: balance?.ok ? balance : undefined, corrected, reactants, products };
  }
  return null;
}

const cache = new Map<string, Promise<CardCheck | null>>();

/** The device's check of one card; the same card is checked once per session. */
export function checkCard(card: AnswerCard, language: Language): Promise<CardCheck | null> {
  if (card.tur !== "molekul" && card.tur !== "tepkime") return Promise.resolve(null);
  const key = `${language}|${JSON.stringify(card)}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = check(card, language).catch(() => null);
    cache.set(key, pending);
  }
  return pending;
}
