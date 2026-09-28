"use client";

// ChemAI: the files given to Iris in the chat, kept on this phone (IndexedDB, "chemai-files") with
// their text, so the same chat can go on asking about them - also after the app was closed - and a
// summary made once is not made again. Which files belong to which saved chat is kept beside them
// (localStorage). Nothing here leaves the phone.

import type { FileDoc } from "./read";

const DB_NAME = "chemai-files";
const STORE = "docs";
const LINKS_KEY = "chemai:chat-files:v1";
/** The oldest files go past this many, with their links. */
const MAX_DOCS = 60;

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, FileDoc>();

function database(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 3000);
    const done = (db: IDBDatabase | null) => {
      window.clearTimeout(timer);
      resolve(db);
    };
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("addedAt", "addedAt");
      };
      request.onsuccess = () => done(request.result);
      request.onerror = () => done(null);
      request.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return database().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const request = work(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

/** Keeps a file (and its summary, when it has one). In memory at least, if storage is unavailable. */
export async function saveDoc(doc: FileDoc): Promise<void> {
  memory.set(doc.id, doc);
  await run("readwrite", (store) => store.put(doc));
  const all = (await run("readonly", (store) => store.getAllKeys())) ?? [];
  if (all.length > MAX_DOCS) {
    const docs = ((await run("readonly", (store) => store.getAll())) ?? []) as FileDoc[];
    const old = docs.sort((a, b) => a.addedAt - b.addedAt).slice(0, docs.length - MAX_DOCS);
    for (const entry of old) await deleteDoc(entry.id);
  }
}

export async function getDoc(id: string): Promise<FileDoc | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  const doc = (await run("readonly", (store) => store.get(id))) as FileDoc | undefined | null;
  if (doc) memory.set(id, doc);
  return doc ?? null;
}

export async function deleteDoc(id: string): Promise<void> {
  memory.delete(id);
  await run("readwrite", (store) => store.delete(id));
  const links = readLinks();
  let changed = false;
  for (const key of Object.keys(links)) {
    const kept = links[key].filter((entry) => entry !== id);
    if (kept.length !== links[key].length) {
      changed = true;
      if (kept.length) links[key] = kept;
      else delete links[key];
    }
  }
  if (changed) writeLinks(links);
}

function readLinks(): Record<string, string[]> {
  try {
    return JSON.parse(window.localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

function writeLinks(links: Record<string, string[]>) {
  try {
    window.localStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    // the files stay; this chat only forgets them after the app closes
  }
}

/** The files of a saved chat. */
export function linkedDocIds(conversationId: string): string[] {
  return readLinks()[conversationId] ?? [];
}

export function linkDocs(conversationId: string, ids: string[]): void {
  const links = readLinks();
  if (ids.length) links[conversationId] = [...new Set(ids)];
  else delete links[conversationId];
  writeLinks(links);
}
