"use client";

// ChemAI: a file given to Iris in the chat ("+" → Dosyalar), read on the phone into text parts
// with their places (pages, slides, sheets), so Iris can search it, summarise it and answer
// questions about it. Nothing is uploaded: the website's AI gets only the parts a question needs.
//
//   PDF                 pdf.js (public/pdfjs); a page without a text layer (a scan) is drawn and
//                       read with the phone's text recognition
//   Word, PowerPoint,   the text of the document's XML (they are zip files)
//   Excel               (sheets as rows of cells)
//   text files          as they are: txt, md, csv, tsv, json, xml, html, tex, and the chemistry
//                       formats (mol, sdf, cif, xyz, pdb, jdx)
//
// Photos go the photo way (vision.ts) instead.

import { strFromU8, unzipSync } from "fflate";
import { recognizeJpeg } from "@/lib/ai/vision";
import { textFor } from "@/mobile/i18n";

export type FileKind = "pdf" | "word" | "slides" | "sheet" | "text";

export interface FilePart {
  /** Where it is: "s. 3", "Slayt 2", "Sayfa1" (a sheet), "Bölüm 4". */
  place: string;
  text: string;
}

export interface FileDoc {
  id: string;
  name: string;
  kind: FileKind;
  size: number;
  parts: FilePart[];
  /** Pages, slides or sheets. */
  count: number;
  /** Pages read from their image (scanned). */
  scanned: number;
  chars: number;
  addedAt: number;
  /** The whole document boiled down (made the first time it is summarised). */
  digest?: string;
  digestLanguage?: "tr" | "en";
}

export type ReadProgress = (done: number, total: number, what: "pages" | "scan") => void;

const MAX_BYTES = 40 * 1024 * 1024;
/** Beyond this the rest is not read (a book is not a question's document). */
const MAX_PAGES = 400;
const MAX_CHARS = 600_000;
/** Scanned pages are read with text recognition, which takes a second or two each. */
const MAX_SCANNED_PAGES = 40;

const TEXT_EXTENSIONS = ["txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "tex", "rtf", "log", "mol", "sdf", "cif", "xyz", "pdb", "jdx", "dx", "smi", "inp", "out"];

/** What the "Dosyalar" picker offers. */
export const FILE_ACCEPT = [
  ".pdf,application/pdf",
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ...TEXT_EXTENSIONS.map((extension) => `.${extension}`),
  "text/*",
  "image/*",
].join(",");

function extension(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp"].includes(extension(file.name));
}

/** A table the chat's data tools read (regression, statistics) rather than a document. */
export function isDataTable(file: File): boolean {
  return ["csv", "tsv"].includes(extension(file.name));
}

export function kindLabel(kind: FileKind, language: "tr" | "en"): string {
  const labels: Record<FileKind, [string, string]> = {
    pdf: ["PDF", "PDF"],
    word: ["Word belgesi", "Word document"],
    slides: ["Sunum", "Presentation"],
    sheet: ["Tablo", "Spreadsheet"],
    text: ["Metin", "Text"],
  };
  return labels[kind][language === "en" ? 1 : 0];
}

export function countLabel(doc: Pick<FileDoc, "kind" | "count">, language: "tr" | "en"): string {
  const en = language === "en";
  if (doc.kind === "pdf") return en ? `${doc.count} page${doc.count === 1 ? "" : "s"}` : `${doc.count} sayfa`;
  if (doc.kind === "slides") return en ? `${doc.count} slide${doc.count === 1 ? "" : "s"}` : `${doc.count} slayt`;
  if (doc.kind === "sheet") return en ? `${doc.count} sheet${doc.count === 1 ? "" : "s"}` : `${doc.count} sayfa`;
  return en ? `${doc.count} part${doc.count === 1 ? "" : "s"}` : `${doc.count} bölüm`;
}

function newId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function tidy(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readFileDoc(file: File, onProgress?: ReadProgress): Promise<FileDoc> {
  if (file.size > MAX_BYTES) throw new Error(textFor("Dosya çok büyük (en fazla 40 MB).", "The file is too large (40 MB at most)."));
  const ext = extension(file.name);
  let kind: FileKind;
  let parts: FilePart[];
  let scanned = 0;
  if (ext === "pdf" || file.type === "application/pdf") {
    kind = "pdf";
    ({ parts, scanned } = await readPdf(file, onProgress));
  } else if (ext === "docx") {
    kind = "word";
    parts = readDocx(new Uint8Array(await file.arrayBuffer()));
  } else if (ext === "pptx") {
    kind = "slides";
    parts = readPptx(new Uint8Array(await file.arrayBuffer()));
  } else if (ext === "xlsx") {
    kind = "sheet";
    parts = readXlsx(new Uint8Array(await file.arrayBuffer()));
  } else if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith("text/") || file.type === "application/json") {
    kind = "text";
    parts = readText(await file.text(), ext);
  } else {
    throw new Error(
      textFor(
        "Bu dosya türü okunamıyor. PDF, Word, PowerPoint, Excel, metin ya da fotoğraf seçebilirsin.",
        "This file type can't be read. Choose a PDF, Word, PowerPoint, Excel, text file or a photo."
      )
    );
  }
  parts = parts.map((part) => ({ ...part, text: tidy(part.text) })).filter((part) => part.text);
  let chars = 0;
  const kept: FilePart[] = [];
  for (const part of parts) {
    if (chars >= MAX_CHARS) break;
    const text = part.text.slice(0, MAX_CHARS - chars);
    kept.push({ ...part, text });
    chars += text.length;
  }
  if (!chars) {
    throw new Error(
      kind === "pdf"
        ? textFor("PDF'te okunabilir metin bulunamadı.", "No readable text was found in the PDF.")
        : textFor("Dosyada okunabilir metin bulunamadı.", "No readable text was found in the file.")
    );
  }
  const count = kind === "pdf" || kind === "slides" || kind === "sheet" ? new Set(kept.map((part) => part.place)).size : kept.length;
  return { id: newId(), name: file.name, kind, size: file.size, parts: kept, count, scanned, chars, addedAt: Date.now() };
}

// --- PDF ------------------------------------------------------------------------------------------

type PdfJs = typeof import("pdfjs-dist");

let pdfjs: Promise<PdfJs> | null = null;

/** pdf.js, loaded from the app's own files on first use (never bundled: it is large). */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= (async () => {
    // A runtime import of a URL, which the bundler must not try to resolve.
    const load = new Function("url", "return import(url)") as (url: string) => Promise<PdfJs>;
    const library = await load("/pdfjs/pdf.min.mjs");
    library.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return library;
  })().catch((error) => {
    pdfjs = null;
    throw error;
  });
  return pdfjs;
}

async function readPdf(file: File, onProgress?: ReadProgress): Promise<{ parts: FilePart[]; scanned: number }> {
  let library: PdfJs;
  try {
    library = await loadPdfJs();
  } catch {
    throw new Error(textFor("PDF okuyucu açılamadı.", "The PDF reader couldn't start."));
  }
  const task = library.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
  });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    throw new Error(
      name === "PasswordException"
        ? textFor("Bu PDF parolalı; parolasız bir kopyasını seç.", "This PDF is password protected; choose a copy without a password.")
        : textFor("PDF açılamadı; dosya bozuk olabilir.", "The PDF couldn't be opened; the file may be damaged.")
    );
  }
  const total = Math.min(pdf.numPages, MAX_PAGES);
  const parts: FilePart[] = [];
  const empty: number[] = [];
  for (let number = 1; number <= total; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str;
      text += item.hasEOL ? "\n" : item.str && !item.str.endsWith(" ") ? " " : "";
    }
    // Words broken at the line end ("titras-\nyon") are joined again.
    text = text.replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2");
    if (text.replace(/\s/g, "").length < 25) empty.push(number);
    parts.push({ place: `s. ${number}`, text });
    page.cleanup();
    onProgress?.(number, total, "pages");
  }

  // Pages with no text layer are scans: they are drawn and read like a photo.
  let scanned = 0;
  const toScan = empty.slice(0, MAX_SCANNED_PAGES);
  for (let index = 0; index < toScan.length; index++) {
    const number = toScan[index];
    onProgress?.(index, toScan.length, "scan");
    try {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      // About 1800 px on the long side: enough for the recognizer, small enough for a phone.
      const viewport = page.getViewport({ scale: Math.min(3, 1800 / Math.max(base.width, base.height)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const text = await recognizeJpeg(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      if (text.trim()) {
        parts[number - 1] = { place: `s. ${number}`, text };
        scanned += 1;
      }
    } catch {
      // this page stays unread; the others still count
    }
  }
  if (toScan.length) onProgress?.(toScan.length, toScan.length, "scan");
  await task.destroy();
  return { parts, scanned };
}

// --- Office files (zip + XML) ---------------------------------------------------------------------

function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error(textFor("Dosya açılamadı; bozuk ya da eski biçimde (.doc/.ppt/.xls) olabilir.", "The file couldn't be opened; it may be damaged or in an old format (.doc/.ppt/.xls)."));
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

/** The text of an Office XML part: runs of text, with tabs, line breaks and paragraph ends kept. */
function xmlText(xml: string, paragraph: string, run: string): string {
  const pieces = xml.matchAll(new RegExp(`<${run}(?: [^>]*)?>([^<]*)</${run}>|</${paragraph}>|<[wa]:tab/>|<[wa]:br[^>]*/>`, "g"));
  let text = "";
  for (const piece of pieces) {
    if (piece[1] !== undefined) text += piece[1];
    else if (piece[0].includes("tab")) text += "\t";
    else text += "\n";
  }
  return decodeEntities(text);
}

function readDocx(bytes: Uint8Array): FilePart[] {
  const files = unzip(bytes);
  const main = files["word/document.xml"];
  if (!main) throw new Error(textFor("Word belgesi okunamadı.", "The Word document couldn't be read."));
  const text = xmlText(strFromU8(main), "w:p", "w:t");
  // No pages in a Word file: it is cut into parts of a few paragraphs, headings starting new ones.
  const parts: FilePart[] = [];
  let current = "";
  for (const paragraph of text.split("\n")) {
    if (current.length > 2400 && paragraph.trim()) {
      parts.push({ place: `Bölüm ${parts.length + 1}`, text: current });
      current = "";
    }
    current += `${paragraph}\n`;
  }
  if (current.trim()) parts.push({ place: `Bölüm ${parts.length + 1}`, text: current });
  return parts;
}

function readPptx(bytes: Uint8Array): FilePart[] {
  const files = unzip(bytes);
  const slides = Object.keys(files)
    .map((name) => ({ name, number: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter((entry) => entry.number > 0)
    .sort((a, b) => a.number - b.number);
  return slides.map(({ name, number }) => {
    const notes = files[`ppt/notesSlides/notesSlide${number}.xml`];
    const body = xmlText(strFromU8(files[name]), "a:p", "a:t");
    const said = notes ? xmlText(strFromU8(notes), "a:p", "a:t").trim() : "";
    return { place: `Slayt ${number}`, text: said ? `${body}\n(Konuşmacı notu) ${said}` : body };
  });
}

function readXlsx(bytes: Uint8Array): FilePart[] {
  const files = unzip(bytes);
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
        decodeEntities(match[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "").replace(/<[^>]+>/g, ""))
      )
    : [];
  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const names = [...workbook.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((match) => decodeEntities(match[1]));
  const sheets = Object.keys(files)
    .map((name) => ({ name, number: Number(name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1]) }))
    .filter((entry) => entry.number > 0)
    .sort((a, b) => a.number - b.number);
  return sheets.map(({ name, number }) => {
    const rows = [...strFromU8(files[name]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 400).map((row) =>
      [...row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
        .map((cell) => {
          const attributes = cell[1];
          const inner = cell[2] ?? "";
          const value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
          return /t="s"/.test(attributes) ? shared[Number(value)] ?? "" : decodeEntities(value);
        })
        .join("\t")
    );
    return { place: names[number - 1] ?? `Sayfa${number}`, text: rows.join("\n") };
  });
}

// --- text files -----------------------------------------------------------------------------------

function readText(raw: string, ext: string): FilePart[] {
  let text = raw.replace(/^﻿/, "");
  if (ext === "html" || ext === "htm") {
    text = decodeEntities(text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, ""));
  } else if (ext === "rtf") {
    text = text.replace(/\\par[d]?/g, "\n").replace(/\{\\\*[^}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, "");
  }
  const parts: FilePart[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length > 2400) {
      parts.push({ place: `Bölüm ${parts.length + 1}`, text: current });
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim()) parts.push({ place: `Bölüm ${parts.length + 1}`, text: current });
  return parts;
}
