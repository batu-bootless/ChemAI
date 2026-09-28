// Copies RDKit's MinimalLib (WebAssembly build of RDKit) into public/rdkit/, where the app loads it
// from on first use (src/lib/chem-engine/rdkit.ts). Runs before every web build so the shipped
// files always match the installed @rdkit/rdkit version.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const from = path.join(root, "node_modules", "@rdkit", "rdkit", "dist");
const to = path.join(root, "public", "rdkit");

await mkdir(to, { recursive: true });
for (const file of ["RDKit_minimal.js", "RDKit_minimal.wasm"]) {
  await copyFile(path.join(from, file), path.join(to, file));
}
console.log("rdkit: public/rdkit/ güncellendi");
