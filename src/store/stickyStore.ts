"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StickyNote } from "@/types/sticky";
import { STICKY_DEFAULT_WIDTH, STICKY_DEFAULT_HEIGHT } from "@/types/sticky";
import { textFor } from "@/mobile/i18n";

const STORAGE_KEY = "chemplus-sticky-notes-v1";
const PIN_Z_BOOST = 100000;

let cascade = 0;

function makeId() {
  return `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A new note is born inside the current viewport: the desktop default of
 *  420x420 at a cascading offset lands mostly off-screen on a phone. */
function initialGeometry(offset: number) {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.min(STICKY_DEFAULT_WIDTH, vw - 16);
  const height = Math.min(STICKY_DEFAULT_HEIGHT, vh - 16);
  const roomX = Math.max(0, vw - width);
  const roomY = Math.max(0, vh - height);
  const x = roomX < 160 ? Math.round(roomX / 2) : Math.min(140 + offset, roomX);
  const y = roomY < 130 ? Math.round(roomY / 2) : Math.min(110 + offset, roomY);
  return { x, y, width, height };
}

interface StickyState {
  notes: StickyNote[];
  activeId: string | null;
  nextZIndex: number;
  hasHydrated: boolean;
  createNote: (partial?: Partial<StickyNote>) => string;
  updateNote: (id: string, patch: Partial<StickyNote>) => void;
  removeNote: (id: string) => void;
  duplicateNote: (id: string) => void;
  bringToFront: (id: string) => void;
  setActive: (id: string | null) => void;
  restoreNote: (id: string) => void;
  setHasHydrated: (v: boolean) => void;
}

export function displayZIndex(note: StickyNote) {
  return note.pinned ? note.zIndex + PIN_Z_BOOST : note.zIndex;
}

export const useStickyStore = create<StickyState>()(
  persist(
    (set, get) => ({
      notes: [],
      activeId: null,
      nextZIndex: 1,
      hasHydrated: false,

      createNote: (partial) => {
        const id = makeId();
        const now = Date.now();
        const offset = (cascade++ % 8) * 28;
        const geometry = initialGeometry(offset);
        const zIndex = get().nextZIndex;
        const note: StickyNote = {
          id,
          title: textFor("Not", "Note"),
          content: "",
          color: "yellow",
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height,
          collapsed: false,
          pinned: false,
          closed: false,
          archived: false,
          zIndex,
          createdAt: now,
          updatedAt: now,
          ...partial,
        };
        set((s) => ({
          notes: [...s.notes, note],
          nextZIndex: s.nextZIndex + 1,
          activeId: id,
        }));
        return id;
      },

      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
          ),
        })),

      removeNote: (id) =>
        set((s) => ({
          notes: s.notes.filter((n) => n.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),

      duplicateNote: (id) => {
        const src = get().notes.find((n) => n.id === id);
        if (!src) return;
        const newId = makeId();
        const now = Date.now();
        const zIndex = get().nextZIndex;
        set((s) => ({
          notes: [
            ...s.notes,
            {
              ...src,
              id: newId,
              title: `${src.title} (Kopya)`,
              x: src.x + 28,
              y: src.y + 28,
              zIndex,
              closed: false,
              archived: false,
              createdAt: now,
              updatedAt: now,
            },
          ],
          nextZIndex: s.nextZIndex + 1,
          activeId: newId,
        }));
      },

      bringToFront: (id) =>
        set((s) => {
          const current = s.notes.find((n) => n.id === id);
          if (current && current.zIndex === s.nextZIndex - 1 && s.activeId === id) {
            return {};
          }
          const z = s.nextZIndex;
          return {
            notes: s.notes.map((n) => (n.id === id ? { ...n, zIndex: z } : n)),
            nextZIndex: z + 1,
            activeId: id,
          };
        }),

      setActive: (id) => set({ activeId: id }),

      restoreNote: (id) =>
        set((s) => {
          const z = s.nextZIndex;
          return {
            notes: s.notes.map((n) =>
              n.id === id ? { ...n, closed: false, archived: false, zIndex: z } : n
            ),
            nextZIndex: z + 1,
            activeId: id,
          };
        }),

      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ notes: s.notes, nextZIndex: s.nextZIndex }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
