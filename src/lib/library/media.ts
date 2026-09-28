"use client";

// ChemAI: the pictures of the Library ("Medya içerikleri") - photos asked about and structures
// Iris drew - kept on the device in IndexedDB (a photo preview is too big for localStorage). The
// graphs Iris drew come from the graph store (lib/graph-studio/store.ts) and join them on screen.

export interface MediaItem {
  id: string;
  kind: "photo" | "molecule";
  createdAt: number;
  /** A short caption: the question, or the molecule's name. */
  title: string;
  /** Photo: the preview (data URL). */
  thumb?: string;
  /** Photo: text read off it on the device. */
  text?: string;
  /** Molecule: RDKit's drawing and the structure it was drawn from. */
  svg?: string;
  smiles?: string;
  formula?: string;
  conversationId?: string | null;
  notebookId?: string | null;
}

const DB = "chemai-library";
const STORE = "media";
const listeners = new Set<() => void>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB yok"));
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request ? request.result : undefined);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function changed() {
  for (const listener of listeners) listener();
}

export function onMediaChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function listMedia(): Promise<MediaItem[]> {
  try {
    const items = ((await run<MediaItem[]>("readonly", (store) => store.getAll() as IDBRequest<MediaItem[]>)) ?? []) as MediaItem[];
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function addMedia(item: Omit<MediaItem, "id" | "createdAt"> & { id?: string }): Promise<string | null> {
  const entry: MediaItem = { ...item, id: item.id ?? `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
  try {
    // The same structure drawn again replaces the older picture instead of piling up copies.
    if (entry.kind === "molecule" && entry.smiles) {
      const existing = (await listMedia()).find((media) => media.kind === "molecule" && media.smiles === entry.smiles);
      if (existing) entry.id = existing.id;
    }
    await run("readwrite", (store) => store.put(entry));
    changed();
    return entry.id;
  } catch {
    return null;
  }
}

/** Ties pictures to the conversation they came from, once the conversation has been saved. */
export async function attachMedia(ids: string[], conversationId: string): Promise<void> {
  if (!ids.length) return;
  try {
    const items = await listMedia();
    await run("readwrite", (store) => {
      for (const item of items) if (ids.includes(item.id)) store.put({ ...item, conversationId });
    });
    changed();
  } catch {
    // the pictures stay without a link to their chat
  }
}

export async function deleteMedia(id: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(id));
    changed();
  } catch {
    // nothing to delete
  }
}

export async function clearMedia(): Promise<void> {
  try {
    await run("readwrite", (store) => store.clear());
    changed();
  } catch {
    // nothing to clear
  }
}
