// Copies Mozilla's pdf.js into public/pdfjs/, where the app loads it from when a PDF is opened in
// the chat (src/lib/files/pdf.ts): the library, its worker, the character maps (for PDFs whose fonts
// use predefined encodings), the standard fonts, and the image decoders (JBIG2, JPEG 2000 and
// colour profiles, which scanned PDFs use - their pages are drawn to be read). Runs before every web
// build so the shipped files always match the installed pdfjs-dist version.
import { cp, mkdir, copyFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const from = path.join(root, "node_modules", "pdfjs-dist");
const to = path.join(root, "public", "pdfjs");

await mkdir(to, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  await copyFile(path.join(from, "build", file), path.join(to, file));
}
await cp(path.join(from, "cmaps"), path.join(to, "cmaps"), { recursive: true });
await cp(path.join(from, "standard_fonts"), path.join(to, "standard_fonts"), { recursive: true });
await cp(path.join(from, "iccs"), path.join(to, "iccs"), { recursive: true });
// The decoders only; quickjs is the scripting sandbox of PDF forms, which is never used here.
await mkdir(path.join(to, "wasm"), { recursive: true });
for (const file of await readdir(path.join(from, "wasm"))) {
  if (!file.startsWith("quickjs")) await copyFile(path.join(from, "wasm", file), path.join(to, "wasm", file));
}
console.log("pdfjs: public/pdfjs/ güncellendi");
