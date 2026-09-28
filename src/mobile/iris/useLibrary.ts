"use client";

// ChemAI: what the Library shows, read fresh whenever something is added or removed.

import { useCallback, useEffect, useState } from "react";
import { loadLibrary } from "@/lib/graph-studio/store";
import type { GraphSpec } from "@/lib/graph-studio/types";
import { listDocuments, type LibraryDocument } from "@/lib/library/documents";
import { listMedia, onMediaChange, type MediaItem } from "@/lib/library/media";
import { useStickyStore } from "@/store/stickyStore";
import { useLocale } from "@/mobile/i18n";

export type LibraryMedia =
  | { kind: "photo" | "molecule"; key: string; date: number; item: MediaItem }
  | { kind: "graph"; key: string; date: number; graph: GraphSpec };

export function useLibrary() {
  const language = useLocale().startsWith("en") ? "en" : "tr";
  const notes = useStickyStore((state) => state.notes);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [media, setMedia] = useState<LibraryMedia[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setDocuments(listDocuments(language));
    const pictures = await listMedia();
    const graphs: LibraryMedia[] = loadLibrary().map((graph) => ({
      kind: "graph",
      key: `graph:${graph.id}`,
      date: Date.parse(graph.updatedAt || graph.createdAt) || 0,
      graph,
    }));
    const items: LibraryMedia[] = pictures.map((item) => ({ kind: item.kind, key: item.id, date: item.createdAt, item }));
    setMedia([...items, ...graphs].sort((a, b) => b.date - a.date));
    setReady(true);
  }, [language]);

  useEffect(() => {
    void load();
    const reload = () => void load();
    const off = onMediaChange(reload);
    window.addEventListener("chemai:library", reload);
    window.addEventListener("focus", reload);
    return () => {
      off();
      window.removeEventListener("chemai:library", reload);
      window.removeEventListener("focus", reload);
    };
  }, [load, notes]);

  return { documents, media, ready, reload: load };
}
