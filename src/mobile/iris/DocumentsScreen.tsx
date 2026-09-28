"use client";

// ChemAI: every document of the Library (the ">" of "Belgeler"), with a filter by kind.

import { useState } from "react";
import { KIND_LABEL, type DocumentKind, type LibraryDocument } from "@/lib/library/documents";
import { useL } from "@/mobile/i18n";
import DocViewer from "./DocViewer";
import { DocumentCard } from "./LibraryScreen";
import PageHeader from "./PageHeader";
import { IRIS } from "./theme";
import { useLibrary } from "./useLibrary";

const FILTERS: (DocumentKind | "all")[] = ["all", "report", "note", "protocol", "inventory"];

export default function DocumentsScreen() {
  const l = useL();
  const { documents, ready } = useLibrary();
  const [filter, setFilter] = useState<DocumentKind | "all">("all");
  const [doc, setDoc] = useState<LibraryDocument | null>(null);
  const shown = filter === "all" ? documents : documents.filter((item) => item.kind === filter);

  return (
    <main className="iris-ui flex min-h-[var(--app-content-h)] flex-col pb-[calc(var(--app-safe-bottom)+24px)]" style={{ background: IRIS.bg }}>
      <PageHeader title={l("Belgeler", "Documents")} />
      <div className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((kind) => {
          const active = filter === kind;
          const count = kind === "all" ? documents.length : documents.filter((item) => item.kind === kind).length;
          if (kind !== "all" && count === 0) return null;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setFilter(kind)}
              aria-pressed={active}
              className="shrink-0 rounded-full px-4 py-2 text-[15px] transition-colors"
              style={{ background: active ? "#1F1F1F" : IRIS.row, color: active ? "#fff" : IRIS.ink }}
            >
              {kind === "all" ? l("Tümü", "All") : l(...KIND_LABEL[kind])}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-2 px-4">
        {shown.map((item) => (
          <DocumentCard key={item.key} doc={item} onOpen={() => setDoc(item)} />
        ))}
        {ready && shown.length === 0 && (
          <p className="px-1 pt-2 text-[15px]" style={{ color: IRIS.sub }}>
            {l("Henüz belge yok.", "No documents yet.")}
          </p>
        )}
      </div>
      {doc && <DocViewer doc={doc} onClose={() => setDoc(null)} />}
    </main>
  );
}
