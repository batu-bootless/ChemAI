import { describe, expect, it } from "vitest";
import { readingText, sanitizeReading } from "./visionAi";

describe("sanitizeReading", () => {
  it("keeps what was read and drops empty or malformed entries", () => {
    const reading = sanitizeReading({
      ozet: "Bir esterleşme sorusu",
      sorular: [{ no: "1", metin: "Ürünü bulunuz.", secenekler: ["A) etil asetat", "B) etanol"] }, { no: "2" }],
      molekuller: [{ etiket: "I", smiles: "CC(=O) O" }, {}, "x"],
      tepkimeler: [{ reaktanlar: ["CC(=O)O", "CCO"], urunler: [], kosullar: "H2SO4, ısı" }],
      formuller: [{ ifade: "" }],
      metin: "1) Ürünü bulunuz.",
      guven: "cok",
    });
    expect(reading).not.toBeNull();
    expect(reading!.sorular).toHaveLength(1);
    expect(reading!.molekuller).toEqual([{ etiket: "I", ad: undefined, smiles: "CC(=O)O" }]);
    expect(reading!.tepkimeler[0].urunler).toBeUndefined();
    expect(reading!.formuller).toEqual([]);
    expect(reading!.guven).toBeUndefined();
  });

  it("is null when nothing useful was read", () => {
    expect(sanitizeReading({ metin: "", sorular: [] })).toBeNull();
    expect(sanitizeReading("nope")).toBeNull();
  });
});

describe("readingText", () => {
  it("puts the structures and reactions where the planner and Iris can use them", () => {
    const text = readingText(
      sanitizeReading({
        sorular: [{ no: "1", metin: "Ürünü bulunuz." }],
        molekuller: [{ etiket: "I", ad: "asetik asit", smiles: "CC(=O)O" }],
        tepkimeler: [{ reaktanlar: ["CC(=O)O", "CCO"], kosullar: "H2SO4" }],
        metin: "1) Ürünü bulunuz.",
      })!
    );
    expect(text).toContain("1) Ürünü bulunuz.");
    expect(text).toContain("- I · asetik asit: CC(=O)O");
    expect(text).toContain("SMILES: CC(=O)O + CCO >> ?");
    expect(text).toContain("koşullar: H2SO4");
  });
});
