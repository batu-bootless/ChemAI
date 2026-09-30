"use client";

// Chem+ app: what ChemPlus AI can take from a photo on the device.
//
// The website's AI accepts text only, so a photo is read on the device: its text with ML Kit
// (Android's on-device text recognition; Tesseract in a desktop browser preview) and its dominant
// colour from the pixels - the colour is what an indicator, a flame test or a precipitate is
// about. The AI gets both as a note it is told not to over-trust. When the user allows it, the
// photo is also read by the vision model (visionAi.ts), which can read drawn structures; that
// reading replaces the text here.

import { ChemPlus, isNativeApp } from "@/mobile/native";
import type { ImageNote } from "@/lib/ai/assistant";
import { readingText, type VisionReading } from "@/lib/ai/visionAi";

export interface PreparedImage {
  /** Small JPEG data URL for the chat bubble. */
  thumb: string;
  /** JPEG (≤ 1600 px) as base64, without the data: prefix - what the text recognizer reads. */
  base64: string;
  color?: { name: string; hex: string; share: number };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Fotoğraf açılamadı."));
    };
    image.src = url;
  });
}

function draw(image: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function prepareImage(file: Blob, language: "tr" | "en"): Promise<PreparedImage> {
  const image = await loadImage(file);
  const full = draw(image, 1600);
  const thumb = draw(image, 360).toDataURL("image/jpeg", 0.8);
  const base64 = full.toDataURL("image/jpeg", 0.88).split(",")[1];
  return { thumb, base64, color: dominantColor(image, language) ?? undefined };
}

// --- colour -------------------------------------------------------------------------------------

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

const HUES_TR: [number, string][] = [
  [15, "kırmızı"], [40, "turuncu"], [65, "sarı"], [90, "sarımsı yeşil"], [160, "yeşil"], [195, "turkuaz"],
  [250, "mavi"], [285, "mor"], [320, "eflatun"], [345, "pembe"], [360, "kırmızı"],
];
const HUES_EN: [number, string][] = [
  [15, "red"], [40, "orange"], [65, "yellow"], [90, "yellow-green"], [160, "green"], [195, "turquoise"],
  [250, "blue"], [285, "purple"], [320, "magenta"], [345, "pink"], [360, "red"],
];

/**
 * The colour a photo is "about": the mean hue of its clearly coloured pixels in the central area,
 * named the way a lab notebook would ("açık pembe"). Null for a photo that is mostly paper, glass
 * and grey - a page of text has no colour worth reporting.
 */
function dominantColor(image: HTMLImageElement, language: "tr" | "en"): PreparedImage["color"] | null {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  // The central 70 %: the tube or the flask, not the bench around it.
  const sw = image.naturalWidth * 0.7;
  const sh = image.naturalHeight * 0.7;
  context.drawImage(image, image.naturalWidth * 0.15, image.naturalHeight * 0.15, sw, sh, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  let count = 0;
  let sin = 0;
  let cos = 0;
  let sumS = 0;
  let sumV = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s < 0.22 || v < 0.18) continue;
    count += 1;
    sin += Math.sin((h * Math.PI) / 180) * s;
    cos += Math.cos((h * Math.PI) / 180) * s;
    sumS += s;
    sumV += v;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const share = count / (size * size);
  if (share < 0.12) return null;
  let hue = (Math.atan2(sin, cos) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  const s = sumS / count;
  const v = sumV / count;
  const table = language === "en" ? HUES_EN : HUES_TR;
  let name = table.find(([limit]) => hue < limit)?.[1] ?? table[0][1];
  if (language === "tr") {
    if ((name === "kırmızı" || name === "pembe") && s < 0.45 && v > 0.75) name = "pembe";
    if (name === "turuncu" && v < 0.55) name = "kahverengi";
    if (v > 0.85 && s < 0.45) name = `açık ${name}`;
    else if (v < 0.45) name = `koyu ${name}`;
  } else {
    if ((name === "red" || name === "pink") && s < 0.45 && v > 0.75) name = "pink";
    if (name === "orange" && v < 0.55) name = "brown";
    if (v > 0.85 && s < 0.45) name = `light ${name}`;
    else if (v < 0.45) name = `dark ${name}`;
  }
  const hex = `#${[r, g, b].map((c) => Math.round(c / count).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return { name, hex, share };
}

// --- text ---------------------------------------------------------------------------------------

interface TesseractGlobal {
  recognize(image: string, languages: string): Promise<{ data: { text: string } }>;
}

let tesseract: Promise<TesseractGlobal> | null = null;

/** The browser preview has no ML Kit; Tesseract (WebAssembly, from the CDN) stands in for it. */
function loadTesseract(): Promise<TesseractGlobal> {
  if (tesseract) return tesseract;
  tesseract = new Promise<TesseractGlobal>((resolve, reject) => {
    const existing = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = () => {
      const loaded = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
      if (loaded) resolve(loaded);
      else reject(new Error("Metin tanıma yüklenemedi."));
    };
    script.onerror = () => reject(new Error("Metin tanıma yüklenemedi (internet gerekli)."));
    document.head.appendChild(script);
  }).catch((error) => {
    tesseract = null;
    throw error;
  });
  return tesseract;
}

/** Text on the photo, cleaned of the blank lines recognizers leave behind. */
export async function readImageText(image: PreparedImage): Promise<string> {
  return (await recognizeJpeg(image.base64)).slice(0, 3000);
}

/** All the text on a JPEG (base64, without the data: prefix): a photo, or a scanned PDF page. */
export async function recognizeJpeg(base64: string): Promise<string> {
  let text: string;
  if (isNativeApp()) {
    text = (await ChemPlus.recognizeText({ base64 })).text;
  } else {
    const engine = await loadTesseract();
    text = (await engine.recognize(`data:image/jpeg;base64,${base64}`, "tur+eng")).data.text;
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function imageNote(text: string, color: PreparedImage["color"], reading?: VisionReading | null): ImageNote {
  return {
    text: reading ? readingText(reading) : text,
    color: color ? `${color.name} (${color.hex}, renkli alan %${Math.round(color.share * 100)})` : undefined,
    vision: reading ? true : undefined,
  };
}
