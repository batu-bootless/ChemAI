import { describe, expect, it } from "vitest";
import { answerText, parseAnswer, sanitizeCard } from "./answerCards";

const reply = `İşte çözüm.
\`\`\`iris
{"kartlar":[
  {"tur":"sonuç","deger":"pH = 2,87"},
  {"tur":"Molekül","ad":"Aspirin","smiles":"CC(=O)Oc1ccccc1C(=O)O","rol":"ürün"},
  {"tur":"tepkime","denklem":"Fe2O3 + CO -> Fe + CO2","tip":"redoks"},
  {"tur":"adımlar","adimlar":["Ka yaz","x çöz"]},
  {"tur":"bilinmeyen","x":1},
]}
\`\`\``;

describe("parseAnswer", () => {
  it("splits the lead-in from the cards and drops unknown ones", () => {
    const parsed = parseAnswer(reply);
    expect(parsed.text).toBe("İşte çözüm.");
    expect(parsed.incomplete).toBe(false);
    expect(parsed.cards.map((card) => card.tur)).toEqual(["sonuc", "molekul", "tepkime", "adimlar"]);
  });

  it("keeps a reply without cards as text", () => {
    expect(parseAnswer("Sadece metin.")).toEqual({ text: "Sadece metin.", cards: [], incomplete: false });
  });

  it("hides a card block that is still being written", () => {
    const parsed = parseAnswer('Giriş\n```iris\n{"kartlar":[{"tur":"so');
    expect(parsed).toEqual({ text: "Giriş", cards: [], incomplete: true });
  });

  it("leaves ordinary code blocks alone, even at the end of a reply", () => {
    const text = "Örnek:\n```python\nprint(1)\n```";
    expect(parseAnswer(text)).toEqual({ text, cards: [], incomplete: false });
  });

  it("keeps JSON that does not parse as text, without the fences", () => {
    const parsed = parseAnswer('Giriş\n```iris\n{"kartlar": [ {"tur": }\n```');
    expect(parsed.cards).toEqual([]);
    expect(parsed.text).toBe('Giriş\n{"kartlar": [ {"tur": }');
  });
});

describe("sanitizeCard", () => {
  it("strips spaces from SMILES and needs something to show", () => {
    expect(sanitizeCard({ tur: "molekul", smiles: "C C O" })).toMatchObject({ smiles: "CCO" });
    expect(sanitizeCard({ tur: "molekul" })).toBeNull();
    expect(sanitizeCard({ tur: "not", seviye: "Güvenlik", maddeler: ["Eldiven"] })).toMatchObject({ seviye: "guvenlik" });
  });
});

describe("answerText", () => {
  it("reads the cards as sentences", () => {
    const spoken = answerText(reply);
    expect(spoken).toContain("pH = 2,87");
    expect(spoken).toContain("Aspirin (ürün)");
    expect(spoken).toContain("Fe2O3 + CO -> Fe + CO2. redoks");
    expect(spoken).not.toContain("{");
  });
});
