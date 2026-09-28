"use client";

// Chem+ app: the diagnostic log of Iris's pipeline (src/lib/ai/trace.ts), shown in the voice
// settings: what was asked of the website, how long each step took, what the voice did - so a
// problem on a phone can be seen and copied.

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { clearTrace, onTrace, readTrace, traceLine, traceText } from "@/lib/ai/trace";
import { useL } from "@/mobile/i18n";

const SHOWN = 120;

export default function TraceLog() {
  const l = useL();
  const [lines, setLines] = useState<string[]>(() => readTrace().slice(-SHOWN).map(traceLine));
  const [copied, setCopied] = useState(false);

  useEffect(() => onTrace(() => setLines(readTrace().slice(-SHOWN).map(traceLine))), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(traceText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard refused: the lines stay selectable below
    }
  };

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-xl border-2 border-[#111] bg-white px-3 py-1.5 text-[12.5px] font-extrabold text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Copy className="size-4" strokeWidth={2.6} />
          {copied ? l("Kopyalandı", "Copied") : l("Kaydı kopyala", "Copy the log")}
        </button>
        <button
          type="button"
          onClick={clearTrace}
          className="flex items-center gap-1.5 rounded-xl border-2 border-[#111]/20 bg-white px-3 py-1.5 text-[12.5px] font-extrabold text-[#111]/70"
        >
          <Trash2 className="size-4" strokeWidth={2.6} />
          {l("Temizle", "Clear")}
        </button>
      </div>
      <pre className="max-h-56 select-text overflow-auto whitespace-pre-wrap break-words rounded-xl border-2 border-[#111]/15 bg-[#FBF7F1] p-2 font-mono text-[10.5px] leading-snug text-[#111]/80">
        {lines.length ? lines.join("\n") : l("Henüz kayıt yok.", "Nothing logged yet.")}
      </pre>
    </div>
  );
}
