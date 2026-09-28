"use client";

// Chem+ app: a measurement table handed to ChemPlus AI as a file.
//
// CSV, TSV or a plain text export (Excel's "Save as CSV" included - with the semicolons and decimal
// commas a Turkish Excel writes). The table is normalised to comma-separated values with decimal
// points, so the planner can pass the columns straight to the regression and statistics tools,
// and trimmed to what a message can carry.

import type { DataFile } from "@/lib/ai/assistant";

const MAX_BYTES = 400_000;
const MAX_ROWS = 80;

export interface ReadDataFile extends DataFile {
  rows: number;
  columns: string[];
}

export async function readDataFile(file: File): Promise<ReadDataFile> {
  if (file.size > MAX_BYTES) throw new Error("Dosya çok büyük (en fazla 400 KB).");
  const text = (await file.text()).replace(/^﻿/, "").replace(/\r/g, "");
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Dosyada en az bir başlık ve bir veri satırı olmalı.");
  const sample = lines.slice(0, 12).join("\n");
  const count = (char: string) => sample.split(char).length - 1;
  const delimiter = (["\t", ";", ","] as const).map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows = lines.map((line) =>
    line.split(delimiter).map((cell) => {
      const clean = cell.trim().replace(/^"(.*)"$/, "$1");
      // With ; or tab separators a comma is a decimal comma (1,23 → 1.23).
      return delimiter === "," ? clean : clean.replace(/^(-?\d+),(\d+)$/, "$1.$2");
    })
  );
  const csv = rows
    .slice(0, MAX_ROWS + 1)
    .map((row) => row.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(","))
    .join("\n");
  return { name: file.name, csv, rows: rows.length - 1, columns: rows[0] };
}
